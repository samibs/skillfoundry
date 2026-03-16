# STORY-004: Agent Pair Contract Tests

## Goal

Create a contract test suite validating that agent pairs communicate with compatible message schemas. Each test verifies that the producer's output matches the consumer's expected input schema for their shared message types.

## PRD Mapping

- FR-005 (Agent Pair Contract Tests)

## Epic

5 — Runtime Agent Orchestration

## Effort

M (Medium) — Test infrastructure + contract definitions for 3 agent pairs

## Dependencies

- STORY-001 (Agent Message Bus) — Tests exercise the message bus
- STORY-002 (AgentPool) — Tests verify pool-based execution paths

## Scope

### Files to Create

- `sf_cli/src/core/__tests__/contracts/orchestrator-coder.contract.test.ts`
- `sf_cli/src/core/__tests__/contracts/coder-tester.contract.test.ts`
- `sf_cli/src/core/__tests__/contracts/tester-reporter.contract.test.ts`
- `sf_cli/src/core/__tests__/contracts/contract-helpers.ts` — Shared test utilities

### Files to Modify

- `sf_cli/src/types.ts` — Add typed payload interfaces per message type (if not already defined in STORY-001)

## Technical Approach

### Contract Test Pattern

Each contract test defines:
1. **Producer schema:** The exact shape of the message payload the sending agent produces
2. **Consumer schema:** The exact shape the receiving agent expects to parse
3. **Validation:** Both schemas must be structurally compatible (consumer can parse producer output)

Use Zod schemas for runtime validation in tests:

```typescript
// contract-helpers.ts
import { z } from 'zod';

export function assertContractMatch<T>(
  producerOutput: unknown,
  consumerSchema: z.ZodType<T>,
  context: string,
): T {
  const result = consumerSchema.safeParse(producerOutput);
  if (!result.success) {
    throw new Error(
      `Contract violation (${context}): ${result.error.format()}`
    );
  }
  return result.data;
}
```

### Tested Agent Pairs

#### 1. Orchestrator -> Coder

Message type: `task:delegate` with code generation payload

```typescript
const CodeGeneratePayload = z.object({
  storyId: z.string(),
  filePaths: z.array(z.string()),
  instructions: z.string(),
  context: z.record(z.unknown()).optional(),
  constraints: z.object({
    maxFiles: z.number(),
    maxLinesPerFile: z.number(),
    language: z.string(),
  }),
});

const CodeGenerateResult = z.object({
  storyId: z.string(),
  files: z.array(z.object({
    path: z.string(),
    content: z.string(),
    action: z.enum(['create', 'modify', 'delete']),
  })),
  summary: z.string(),
});
```

#### 2. Coder -> Tester

Message type: `task:delegate` with test generation payload

```typescript
const TestGeneratePayload = z.object({
  storyId: z.string(),
  sourceFiles: z.array(z.object({
    path: z.string(),
    content: z.string(),
  })),
  acceptanceCriteria: z.array(z.string()),
  testFramework: z.string(),
});

const TestGenerateResult = z.object({
  storyId: z.string(),
  testFiles: z.array(z.object({
    path: z.string(),
    content: z.string(),
  })),
  coverageSummary: z.object({
    statements: z.number(),
    branches: z.number(),
    functions: z.number(),
  }).optional(),
});
```

#### 3. Tester -> Reporter

Message type: `result:complete` with test results payload

```typescript
const TestResultsPayload = z.object({
  storyId: z.string(),
  testsPassed: z.number(),
  testsFailed: z.number(),
  testsSkipped: z.number(),
  failures: z.array(z.object({
    testName: z.string(),
    error: z.string(),
    file: z.string(),
    line: z.number().optional(),
  })),
  duration: z.number(),
});
```

### Test Structure

Each contract test file:
1. Instantiates the producer agent with a mock AI runner
2. Captures the message published to the bus
3. Validates the message payload against the consumer's expected schema
4. Instantiates the consumer agent and feeds the captured message
5. Validates the consumer processes it without errors

### Regression Detection

Contract schemas are version-controlled. If an agent's output shape changes, the contract test fails immediately, forcing an explicit update to both producer and consumer.

## Acceptance Criteria

```gherkin
Feature: Agent Pair Contract Tests

  Scenario: Orchestrator-to-Coder contract
    Given the orchestrator agent produces a "task:delegate" message for code generation
    When the message payload is validated against the Coder's expected input schema
    Then validation passes with no errors
    And the Coder agent can parse and process the payload

  Scenario: Coder-to-Tester contract
    Given the coder agent produces a "task:delegate" message for test generation
    When the message payload is validated against the Tester's expected input schema
    Then validation passes with no errors
    And the Tester agent can parse and process the payload

  Scenario: Tester-to-Reporter contract
    Given the tester agent produces a "result:complete" message with test results
    When the message payload is validated against the Reporter's expected input schema
    Then validation passes with no errors
    And the Reporter agent can parse and process the payload

  Scenario: Contract violation detection
    Given the orchestrator agent's output is modified to remove a required field
    When the contract test runs
    Then the test fails with a clear message identifying the missing field
    And the error message includes the contract name and field path

  Scenario: Schema backward compatibility
    Given a new optional field is added to the Coder's output
    When the existing contract tests run
    Then all tests still pass (optional fields do not break consumers)
```

## Tests

- Contract: Orchestrator -> Coder payload roundtrip
- Contract: Coder -> Tester payload roundtrip
- Contract: Tester -> Reporter payload roundtrip
- Contract: Missing required field fails with clear error
- Contract: Extra fields are tolerated (forward compatibility)
- Contract: Type mismatch (string where number expected) fails
- Unit: assertContractMatch helper produces readable error messages
