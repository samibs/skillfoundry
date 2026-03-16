// Contract test: Orchestrator → Coder
//
// Verifies that the task:delegate message produced by the orchestrator
// satisfies the schema the coder agent expects to parse. Also verifies
// that the coder's result:complete response satisfies the orchestrator's
// expected result schema.
//
// Test strategy:
//   1. Define both sides of the contract as schemas (producer + consumer).
//   2. Build a representative payload as the orchestrator would produce it.
//   3. Run assertContractMatch — if the schema is violated the test fails
//      with a clear message naming the field and contract.
//   4. Feed the captured message to a mock "coder consumer" and verify
//      it can process the payload without errors.

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
 * Shape of the payload the orchestrator places in a task:delegate message
 * addressed to the coder agent.
 */
const CodeGeneratePayload = z.object({
  storyId: z.string(),
  filePaths: z.array(z.string()),
  instructions: z.string(),
  context: z.optional(z.record()),
  constraints: z.object({
    maxFiles: z.number(),
    maxLinesPerFile: z.number(),
    language: z.string(),
  }),
});

/**
 * Shape the orchestrator expects back in the coder's result:complete payload.
 */
const CodeGenerateResult = z.object({
  storyId: z.string(),
  files: z.array(
    z.object({
      path: z.string(),
      content: z.string(),
      action: z.enum(['create', 'modify', 'delete'] as const),
    }),
  ),
  summary: z.string(),
});

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const STORY_ID = 'STORY-001-auth-models';

function makeOrchestratorPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    storyId: STORY_ID,
    filePaths: ['src/models/user.ts', 'src/models/session.ts'],
    instructions: 'Implement User and Session models with TypeScript interfaces.',
    context: { projectType: 'typescript', framework: 'fastapi' },
    constraints: {
      maxFiles: 5,
      maxLinesPerFile: 200,
      language: 'typescript',
    },
    ...overrides,
  };
}

function makeCoderResultPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    storyId: STORY_ID,
    files: [
      {
        path: 'src/models/user.ts',
        content: 'export interface User { id: string; email: string; }',
        action: 'create',
      },
      {
        path: 'src/models/session.ts',
        content: 'export interface Session { id: string; userId: string; expiresAt: Date; }',
        action: 'create',
      },
    ],
    summary: 'Created User and Session model interfaces.',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Contract: Orchestrator → Coder (task:delegate)', () => {
  let bus: AgentMessageBus;

  beforeEach(() => {
    bus = new AgentMessageBus();
  });

  it('orchestrator payload satisfies the Coder task:delegate schema', () => {
    const payload = makeOrchestratorPayload();

    // This is the primary contract assertion — throws with a descriptive
    // message identifying the contract name and violated field if it fails.
    const validated = assertContractMatch(
      payload,
      CodeGeneratePayload,
      'orchestrator→coder/task:delegate',
    );

    expect(validated.storyId).toBe(STORY_ID);
    expect(validated.filePaths).toHaveLength(2);
    expect(validated.constraints.language).toBe('typescript');
    expect(validated.constraints.maxFiles).toBe(5);
    expect(validated.constraints.maxLinesPerFile).toBe(200);
    expect(validated.instructions).toBeTruthy();
  });

  it('message envelope contains all required fields when orchestrator publishes', () => {
    const capturedMessages: AgentMessage[] = [];
    bus.subscribe('task:delegate', (m) => capturedMessages.push(m));

    const msg = buildTestMessage(
      'orchestrator',
      'coder-001',
      'task:delegate',
      makeOrchestratorPayload(),
    );
    bus.publish(msg);

    expect(capturedMessages).toHaveLength(1);

    const envelope = capturedMessages[0];
    // Validate the envelope itself matches the AgentMessage contract
    assertContractMatch(
      envelope,
      AgentMessageEnvelopeSchema,
      'orchestrator→coder/message-envelope',
    );

    expect(envelope.sender).toBe('orchestrator');
    expect(envelope.recipient).toBe('coder-001');
    expect(envelope.type).toBe('task:delegate');
    expect(typeof envelope.id).toBe('string');
    expect(envelope.id).toBeTruthy();
    expect(typeof envelope.correlationId).toBe('string');
    expect(envelope.correlationId).toBeTruthy();
    expect(typeof envelope.timestamp).toBe('number');
    expect(envelope.timestamp).toBeGreaterThan(0);
  });

  it('coder result:complete payload satisfies the orchestrator result schema', () => {
    const resultPayload = makeCoderResultPayload();

    const validated = assertContractMatch(
      resultPayload,
      CodeGenerateResult,
      'coder→orchestrator/result:complete',
    );

    expect(validated.storyId).toBe(STORY_ID);
    expect(validated.files).toHaveLength(2);
    expect(validated.files[0].action).toBe('create');
    expect(validated.summary).toBeTruthy();
  });

  it('coder result envelope is delivered with correct correlation ID', async () => {
    const correlationId = 'req-orch-coder-001';
    const resultMessages: AgentMessage[] = [];

    // Simulate the coder responding on the bus with the correlated result
    bus.subscribe('task:delegate', (req) => {
      const resultMsg = buildTestMessage(
        'coder-001',
        req.sender,
        'result:complete',
        makeCoderResultPayload(),
        req.correlationId,
      );
      bus.publish(resultMsg);
    });

    bus.subscribe('result:complete', (m) => resultMessages.push(m));

    const delegateMsg = buildTestMessage(
      'orchestrator',
      'coder-001',
      'task:delegate',
      makeOrchestratorPayload(),
      correlationId,
    );
    bus.publish(delegateMsg);

    expect(resultMessages).toHaveLength(1);
    const result = resultMessages[0];
    expect(result.correlationId).toBe(correlationId);
    expect(result.sender).toBe('coder-001');
    expect(result.type).toBe('result:complete');
    assertContractMatch(result.payload, CodeGenerateResult, 'coder→orchestrator/result:complete');
  });

  it('contract violation detected when storyId is missing from orchestrator payload', () => {
    const brokenPayload = makeOrchestratorPayload({ storyId: undefined });

    const result = CodeGeneratePayload.safeParse(brokenPayload);

    expect(result.success).toBe(false);
    if (!result.success) {
      const errorText = result.error.format();
      // Error message must identify the violated field by name
      expect(errorText).toContain('storyId');
    }
  });

  it('contract violation detected when constraints object is missing', () => {
    const brokenPayload = makeOrchestratorPayload({ constraints: undefined });

    const result = CodeGeneratePayload.safeParse(brokenPayload);

    expect(result.success).toBe(false);
    if (!result.success) {
      const errorText = result.error.format();
      expect(errorText).toContain('constraints');
    }
  });

  it('contract violation detected when required nested field maxFiles is wrong type', () => {
    const brokenPayload = makeOrchestratorPayload({
      constraints: {
        maxFiles: 'not-a-number', // string where number expected
        maxLinesPerFile: 200,
        language: 'typescript',
      },
    });

    const result = CodeGeneratePayload.safeParse(brokenPayload);

    expect(result.success).toBe(false);
    if (!result.success) {
      const errorText = result.error.format();
      expect(errorText).toContain('maxFiles');
    }
  });

  it('assertContractMatch error message includes both contract name and field path', () => {
    const brokenPayload = makeOrchestratorPayload({ storyId: 42 }); // number, not string

    let thrownMessage = '';
    try {
      assertContractMatch(brokenPayload, CodeGeneratePayload, 'orchestrator→coder/task:delegate');
    } catch (err) {
      thrownMessage = (err as Error).message;
    }

    expect(thrownMessage).toContain('Contract violation');
    expect(thrownMessage).toContain('orchestrator→coder/task:delegate');
    expect(thrownMessage).toContain('storyId');
  });

  it('extra fields in producer payload are tolerated (forward compatibility)', () => {
    // Consumer schema must tolerate unknown additional fields
    const payloadWithExtraFields = {
      ...makeOrchestratorPayload(),
      newOptionalField: 'some-future-value',
      anotherAddition: { nested: true },
    };

    const result = CodeGeneratePayload.safeParse(payloadWithExtraFields);

    // Extra fields must not cause validation to fail
    expect(result.success).toBe(true);
  });

  it('optional context field can be absent without violating the contract', () => {
    const payloadWithoutContext = makeOrchestratorPayload();
    delete (payloadWithoutContext as Record<string, unknown>)['context'];

    const result = CodeGeneratePayload.safeParse(payloadWithoutContext);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.context).toBeUndefined();
    }
  });

  it('coder result with additional optional field still passes orchestrator result schema', () => {
    const resultWithNewField = {
      ...makeCoderResultPayload(),
      linesWritten: 42, // new optional field not in current schema
    };

    const result = CodeGenerateResult.safeParse(resultWithNewField);
    // Additional fields must not break consumer parsing
    expect(result.success).toBe(true);
  });
});
