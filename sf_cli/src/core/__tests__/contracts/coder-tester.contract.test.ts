// Contract test: Coder → Tester
//
// Verifies that the task:delegate message produced by the coder
// satisfies the schema the tester agent expects to parse. Also verifies
// that the tester's result:complete response satisfies the coder's
// expected result schema.
//
// Test strategy:
//   1. Define both sides of the contract as schemas (producer + consumer).
//   2. Build a representative payload as the coder would produce it.
//   3. Run assertContractMatch — if the schema is violated the test fails
//      with a clear message naming the field and contract.
//   4. Simulate the tester consuming the message and publishing its result,
//      then validate the result against the consumer schema.

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
 * Shape of the payload the coder places in a task:delegate message
 * addressed to the tester agent.
 */
const TestGeneratePayload = z.object({
  storyId: z.string(),
  sourceFiles: z.array(
    z.object({
      path: z.string(),
      content: z.string(),
    }),
  ),
  acceptanceCriteria: z.array(z.string()),
  testFramework: z.string(),
});

/**
 * Shape the coder expects back in the tester's result:complete payload.
 */
const TestGenerateResult = z.object({
  storyId: z.string(),
  testFiles: z.array(
    z.object({
      path: z.string(),
      content: z.string(),
    }),
  ),
  coverageSummary: z.optional(
    z.object({
      statements: z.number(),
      branches: z.number(),
      functions: z.number(),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const STORY_ID = 'STORY-002-login-api';

function makeCoderPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    storyId: STORY_ID,
    sourceFiles: [
      {
        path: 'src/api/login.ts',
        content: 'export async function login(email: string, password: string): Promise<string> { return ""; }',
      },
      {
        path: 'src/api/logout.ts',
        content: 'export async function logout(token: string): Promise<void> { }',
      },
    ],
    acceptanceCriteria: [
      'Returns JWT token on valid credentials',
      'Returns 401 on invalid credentials',
      'Clears session on logout',
    ],
    testFramework: 'vitest',
    ...overrides,
  };
}

function makeTesterResultPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    storyId: STORY_ID,
    testFiles: [
      {
        path: 'src/__tests__/login.test.ts',
        content: 'import { login } from "../api/login.js"; describe("login", () => { it("returns token", async () => {}); });',
      },
      {
        path: 'src/__tests__/logout.test.ts',
        content: 'import { logout } from "../api/logout.js"; describe("logout", () => { it("clears session", async () => {}); });',
      },
    ],
    coverageSummary: {
      statements: 87,
      branches: 80,
      functions: 100,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Contract: Coder → Tester (task:delegate)', () => {
  let bus: AgentMessageBus;

  beforeEach(() => {
    bus = new AgentMessageBus();
  });

  it('coder payload satisfies the Tester task:delegate schema', () => {
    const payload = makeCoderPayload();

    const validated = assertContractMatch(
      payload,
      TestGeneratePayload,
      'coder→tester/task:delegate',
    );

    expect(validated.storyId).toBe(STORY_ID);
    expect(validated.sourceFiles).toHaveLength(2);
    expect(validated.sourceFiles[0].path).toBe('src/api/login.ts');
    expect(validated.acceptanceCriteria).toHaveLength(3);
    expect(validated.testFramework).toBe('vitest');
  });

  it('message envelope contains all required fields when coder publishes to tester', () => {
    const capturedMessages: AgentMessage[] = [];
    bus.subscribe('task:delegate', (m) => capturedMessages.push(m));

    const msg = buildTestMessage(
      'coder-001',
      'tester-001',
      'task:delegate',
      makeCoderPayload(),
    );
    bus.publish(msg);

    expect(capturedMessages).toHaveLength(1);

    const envelope = capturedMessages[0];
    assertContractMatch(
      envelope,
      AgentMessageEnvelopeSchema,
      'coder→tester/message-envelope',
    );

    expect(envelope.sender).toBe('coder-001');
    expect(envelope.recipient).toBe('tester-001');
    expect(envelope.type).toBe('task:delegate');
    expect(typeof envelope.id).toBe('string');
    expect(envelope.id).toBeTruthy();
    expect(typeof envelope.correlationId).toBe('string');
    expect(envelope.correlationId).toBeTruthy();
    expect(typeof envelope.timestamp).toBe('number');
    expect(envelope.timestamp).toBeGreaterThan(0);
  });

  it('tester result:complete payload satisfies the coder result schema', () => {
    const resultPayload = makeTesterResultPayload();

    const validated = assertContractMatch(
      resultPayload,
      TestGenerateResult,
      'tester→coder/result:complete',
    );

    expect(validated.storyId).toBe(STORY_ID);
    expect(validated.testFiles).toHaveLength(2);
    expect(validated.coverageSummary).toBeDefined();
    expect(validated.coverageSummary?.statements).toBe(87);
    expect(validated.coverageSummary?.branches).toBe(80);
    expect(validated.coverageSummary?.functions).toBe(100);
  });

  it('tester result is delivered with the correct correlation ID', () => {
    const correlationId = 'req-coder-tester-001';
    const resultMessages: AgentMessage[] = [];

    // Simulate the tester responding on the bus with the correlated result
    bus.subscribe('task:delegate', (req) => {
      const resultMsg = buildTestMessage(
        'tester-001',
        req.sender,
        'result:complete',
        makeTesterResultPayload(),
        req.correlationId,
      );
      bus.publish(resultMsg);
    });

    bus.subscribe('result:complete', (m) => resultMessages.push(m));

    const delegateMsg = buildTestMessage(
      'coder-001',
      'tester-001',
      'task:delegate',
      makeCoderPayload(),
      correlationId,
    );
    bus.publish(delegateMsg);

    expect(resultMessages).toHaveLength(1);
    const result = resultMessages[0];
    expect(result.correlationId).toBe(correlationId);
    expect(result.sender).toBe('tester-001');
    expect(result.type).toBe('result:complete');
    assertContractMatch(result.payload, TestGenerateResult, 'tester→coder/result:complete');
  });

  it('contract violation detected when storyId is missing from coder payload', () => {
    const brokenPayload = makeCoderPayload({ storyId: undefined });

    const result = TestGeneratePayload.safeParse(brokenPayload);

    expect(result.success).toBe(false);
    if (!result.success) {
      const errorText = result.error.format();
      expect(errorText).toContain('storyId');
    }
  });

  it('contract violation detected when sourceFiles is not an array', () => {
    const brokenPayload = makeCoderPayload({ sourceFiles: 'not-an-array' });

    const result = TestGeneratePayload.safeParse(brokenPayload);

    expect(result.success).toBe(false);
    if (!result.success) {
      const errorText = result.error.format();
      expect(errorText).toContain('sourceFiles');
    }
  });

  it('contract violation detected when sourceFile item is missing path', () => {
    const brokenPayload = makeCoderPayload({
      sourceFiles: [
        { content: 'export function foo() {}' }, // missing path
      ],
    });

    const result = TestGeneratePayload.safeParse(brokenPayload);

    expect(result.success).toBe(false);
    if (!result.success) {
      const errorText = result.error.format();
      expect(errorText).toContain('path');
    }
  });

  it('contract violation detected when testFramework is wrong type', () => {
    const brokenPayload = makeCoderPayload({ testFramework: 42 }); // number, not string

    const result = TestGeneratePayload.safeParse(brokenPayload);

    expect(result.success).toBe(false);
    if (!result.success) {
      const errorText = result.error.format();
      expect(errorText).toContain('testFramework');
    }
  });

  it('assertContractMatch error message includes both contract name and field path', () => {
    const brokenPayload = makeCoderPayload({ acceptanceCriteria: 'not-an-array' });

    let thrownMessage = '';
    try {
      assertContractMatch(brokenPayload, TestGeneratePayload, 'coder→tester/task:delegate');
    } catch (err) {
      thrownMessage = (err as Error).message;
    }

    expect(thrownMessage).toContain('Contract violation');
    expect(thrownMessage).toContain('coder→tester/task:delegate');
    expect(thrownMessage).toContain('acceptanceCriteria');
  });

  it('extra fields in producer payload are tolerated (forward compatibility)', () => {
    const payloadWithExtraFields = {
      ...makeCoderPayload(),
      newFeatureFlag: true,
      buildMetadata: { commitSha: 'abc123' },
    };

    const result = TestGeneratePayload.safeParse(payloadWithExtraFields);
    expect(result.success).toBe(true);
  });

  it('coverageSummary is optional in tester result — absent value passes schema', () => {
    const resultWithoutCoverage = makeTesterResultPayload();
    delete (resultWithoutCoverage as Record<string, unknown>)['coverageSummary'];

    const result = TestGenerateResult.safeParse(resultWithoutCoverage);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coverageSummary).toBeUndefined();
    }
  });

  it('tester result with additional optional field still passes coder result schema', () => {
    const resultWithNewField = {
      ...makeTesterResultPayload(),
      mutationScore: 72, // new optional field not in current schema
    };

    const result = TestGenerateResult.safeParse(resultWithNewField);
    expect(result.success).toBe(true);
  });
});
