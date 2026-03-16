// Contract test: Tester → Reporter
//
// Verifies that the result:complete message produced by the tester
// satisfies the schema the reporter agent expects to parse. Also verifies
// the reporter's acknowledgement payload satisfies the tester's expectations.
//
// Test strategy:
//   1. Define both sides of the contract as schemas (producer + consumer).
//   2. Build a representative payload as the tester would produce it.
//   3. Run assertContractMatch — if the schema is violated the test fails
//      with a clear message naming the field and contract.
//   4. Simulate the reporter consuming the result and verify it processes
//      the payload without errors.

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentMessageBus } from '../../agent-message-bus.js';
import type { AgentMessage } from '../../../types.js';
import {
  z,
  assertContractMatch,
  buildTestMessage,
  AgentMessageEnvelopeSchema,
} from './contract-helpers.js';

// ---------------------------------------------------------------------------
// Contract schemas
// ---------------------------------------------------------------------------

/**
 * Shape of the payload the tester places in a result:complete message
 * addressed to the reporter agent.
 */
const TestResultsPayload = z.object({
  storyId: z.string(),
  testsPassed: z.number(),
  testsFailed: z.number(),
  testsSkipped: z.number(),
  failures: z.array(
    z.object({
      testName: z.string(),
      error: z.string(),
      file: z.string(),
      line: z.optional(z.number()),
    }),
  ),
  duration: z.number(),
});

/**
 * Shape the tester expects back in the reporter's result:complete acknowledgement payload.
 */
const ReportGeneratedResult = z.object({
  storyId: z.string(),
  reportPath: z.string(),
  reportFormat: z.enum(['markdown', 'html', 'json'] as const),
  summary: z.string(),
  critical: z.optional(z.array(z.string())),
});

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const STORY_ID = 'STORY-003-session-management';

function makeTesterPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    storyId: STORY_ID,
    testsPassed: 14,
    testsFailed: 2,
    testsSkipped: 1,
    failures: [
      {
        testName: 'session expires after 15 minutes',
        error: 'AssertionError: expected 900000 to equal 900001',
        file: 'src/__tests__/session.test.ts',
        line: 42,
      },
      {
        testName: 'refresh token rotates on use',
        error: 'TypeError: Cannot read property "token" of undefined',
        file: 'src/__tests__/session.test.ts',
        line: 87,
      },
    ],
    duration: 4321,
    ...overrides,
  };
}

function makeReporterResultPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    storyId: STORY_ID,
    reportPath: 'docs/reports/STORY-003-test-results.md',
    reportFormat: 'markdown',
    summary: '14 passed, 2 failed, 1 skipped. See failures section for details.',
    critical: ['session expiry off by 1ms', 'refresh token undefined on first login'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Contract: Tester → Reporter (result:complete)', () => {
  let bus: AgentMessageBus;

  beforeEach(() => {
    bus = new AgentMessageBus();
  });

  it('tester payload satisfies the Reporter result:complete schema', () => {
    const payload = makeTesterPayload();

    const validated = assertContractMatch(
      payload,
      TestResultsPayload,
      'tester→reporter/result:complete',
    );

    expect(validated.storyId).toBe(STORY_ID);
    expect(validated.testsPassed).toBe(14);
    expect(validated.testsFailed).toBe(2);
    expect(validated.testsSkipped).toBe(1);
    expect(validated.failures).toHaveLength(2);
    expect(validated.failures[0].testName).toBeTruthy();
    expect(validated.failures[0].error).toBeTruthy();
    expect(validated.failures[0].file).toBeTruthy();
    expect(validated.failures[0].line).toBe(42);
    expect(validated.duration).toBeGreaterThan(0);
  });

  it('failure entry line is optional — absent value passes schema', () => {
    const payloadWithoutLine = makeTesterPayload({
      failures: [
        {
          testName: 'session check fails',
          error: 'Error: unexpected null',
          file: 'src/__tests__/session.test.ts',
          // line is intentionally absent
        },
      ],
    });

    const result = TestResultsPayload.safeParse(payloadWithoutLine);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.failures[0].line).toBeUndefined();
    }
  });

  it('message envelope contains all required fields when tester publishes to reporter', () => {
    const capturedMessages: AgentMessage[] = [];
    bus.subscribe('result:complete', (m) => capturedMessages.push(m));

    const msg = buildTestMessage(
      'tester-001',
      'reporter-001',
      'result:complete',
      makeTesterPayload(),
    );
    bus.publish(msg);

    expect(capturedMessages).toHaveLength(1);

    const envelope = capturedMessages[0];
    assertContractMatch(
      envelope,
      AgentMessageEnvelopeSchema,
      'tester→reporter/message-envelope',
    );

    expect(envelope.sender).toBe('tester-001');
    expect(envelope.recipient).toBe('reporter-001');
    expect(envelope.type).toBe('result:complete');
    expect(typeof envelope.id).toBe('string');
    expect(envelope.id).toBeTruthy();
    expect(typeof envelope.correlationId).toBe('string');
    expect(envelope.correlationId).toBeTruthy();
    expect(typeof envelope.timestamp).toBe('number');
    expect(envelope.timestamp).toBeGreaterThan(0);
  });

  it('reporter result:complete payload satisfies the tester expected result schema', () => {
    const resultPayload = makeReporterResultPayload();

    const validated = assertContractMatch(
      resultPayload,
      ReportGeneratedResult,
      'reporter→tester/result:complete',
    );

    expect(validated.storyId).toBe(STORY_ID);
    expect(validated.reportPath).toBeTruthy();
    expect(['markdown', 'html', 'json']).toContain(validated.reportFormat);
    expect(validated.summary).toBeTruthy();
    expect(validated.critical).toBeDefined();
    expect(validated.critical).toHaveLength(2);
  });

  it('reporter result is delivered with the correct correlation ID', () => {
    const correlationId = 'req-tester-reporter-001';
    const resultMessages: AgentMessage[] = [];

    // Simulate the reporter responding on the bus with the correlated result
    bus.subscribe('result:complete', (req) => {
      if (req.sender === 'tester-001') {
        const reportMsg = buildTestMessage(
          'reporter-001',
          req.sender,
          'result:complete',
          makeReporterResultPayload(),
          req.correlationId,
        );
        bus.publish(reportMsg);
      }
    });

    bus.subscribe('result:complete', (m) => {
      if (m.sender === 'reporter-001') resultMessages.push(m);
    });

    const testerMsg = buildTestMessage(
      'tester-001',
      'reporter-001',
      'result:complete',
      makeTesterPayload(),
      correlationId,
    );
    bus.publish(testerMsg);

    expect(resultMessages).toHaveLength(1);
    const result = resultMessages[0];
    expect(result.correlationId).toBe(correlationId);
    expect(result.sender).toBe('reporter-001');
    assertContractMatch(result.payload, ReportGeneratedResult, 'reporter→tester/result:complete');
  });

  it('contract violation detected when storyId is missing from tester payload', () => {
    const brokenPayload = makeTesterPayload({ storyId: undefined });

    const result = TestResultsPayload.safeParse(brokenPayload);

    expect(result.success).toBe(false);
    if (!result.success) {
      const errorText = result.error.format();
      expect(errorText).toContain('storyId');
    }
  });

  it('contract violation detected when testsPassed is wrong type', () => {
    const brokenPayload = makeTesterPayload({ testsPassed: '14' }); // string, not number

    const result = TestResultsPayload.safeParse(brokenPayload);

    expect(result.success).toBe(false);
    if (!result.success) {
      const errorText = result.error.format();
      expect(errorText).toContain('testsPassed');
    }
  });

  it('contract violation detected when failures array item is missing required testName', () => {
    const brokenPayload = makeTesterPayload({
      failures: [
        {
          // testName is missing
          error: 'some error',
          file: 'src/__tests__/session.test.ts',
          line: 10,
        },
      ],
    });

    const result = TestResultsPayload.safeParse(brokenPayload);

    expect(result.success).toBe(false);
    if (!result.success) {
      const errorText = result.error.format();
      expect(errorText).toContain('testName');
    }
  });

  it('contract violation detected when reportFormat is not a valid enum value', () => {
    const brokenReporterResult = makeReporterResultPayload({ reportFormat: 'pdf' }); // not in enum

    const result = ReportGeneratedResult.safeParse(brokenReporterResult);

    expect(result.success).toBe(false);
    if (!result.success) {
      const errorText = result.error.format();
      expect(errorText).toContain('reportFormat');
    }
  });

  it('assertContractMatch error message includes both contract name and field path', () => {
    const brokenPayload = makeTesterPayload({ duration: 'not-a-number' });

    let thrownMessage = '';
    try {
      assertContractMatch(brokenPayload, TestResultsPayload, 'tester→reporter/result:complete');
    } catch (err) {
      thrownMessage = (err as Error).message;
    }

    expect(thrownMessage).toContain('Contract violation');
    expect(thrownMessage).toContain('tester→reporter/result:complete');
    expect(thrownMessage).toContain('duration');
  });

  it('extra fields in producer payload are tolerated (forward compatibility)', () => {
    const payloadWithExtraFields = {
      ...makeTesterPayload(),
      slowestTest: 'session refresh takes 3s',
      coverageDelta: -2.5,
    };

    const result = TestResultsPayload.safeParse(payloadWithExtraFields);
    expect(result.success).toBe(true);
  });

  it('critical field is optional in reporter result — absent value passes schema', () => {
    const resultWithoutCritical = makeReporterResultPayload();
    delete (resultWithoutCritical as Record<string, unknown>)['critical'];

    const result = ReportGeneratedResult.safeParse(resultWithoutCritical);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.critical).toBeUndefined();
    }
  });

  it('zero failures array is valid in tester payload', () => {
    const cleanRunPayload = makeTesterPayload({
      testsPassed: 17,
      testsFailed: 0,
      testsSkipped: 0,
      failures: [],
    });

    const result = TestResultsPayload.safeParse(cleanRunPayload);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.failures).toHaveLength(0);
      expect(result.data.testsFailed).toBe(0);
    }
  });

  it('error message propagates from tester to reporter as result:error type', () => {
    const errorMessages: AgentMessage[] = [];
    bus.subscribe('result:error', (m) => errorMessages.push(m));

    // Tester encountered an unrecoverable error — sends result:error instead of result:complete
    const errorMsg = buildTestMessage(
      'tester-001',
      'reporter-001',
      'result:error',
      {
        storyId: STORY_ID,
        errorCode: 'TEST_RUNNER_CRASH',
        message: 'vitest process exited with code 1 before all tests completed',
        partial: {
          testsPassed: 5,
          testsFailed: 0,
          testsSkipped: 12,
        },
      },
    );
    bus.publish(errorMsg);

    expect(errorMessages).toHaveLength(1);
    expect(errorMessages[0].type).toBe('result:error');
    expect(errorMessages[0].sender).toBe('tester-001');
    expect(errorMessages[0].payload['errorCode']).toBe('TEST_RUNNER_CRASH');
    expect(typeof errorMessages[0].payload['message']).toBe('string');
  });
});
