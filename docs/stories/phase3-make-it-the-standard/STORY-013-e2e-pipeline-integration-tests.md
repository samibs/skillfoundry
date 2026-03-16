# STORY-013: E2E Pipeline Integration Tests with LLM Fixtures

**Phase:** 4 — Testing Rigor
**PRD:** phase3-make-it-the-standard
**Priority:** MUST
**Effort:** L
**Status:** READY
**Dependencies:** STORY-007
**Blocks:** None
**Affects:** FR-014

---

## Description

Create 10 end-to-end pipeline integration tests that execute the full pipeline (PRD validation, story generation, story execution, gates) against versioned LLM output fixtures. These fixtures are pre-recorded AI responses stored as JSON files, allowing deterministic pipeline execution with no network calls. Each E2E test covers a different pipeline scenario: happy path, gate failure, story dependency resolution, incremental run, fixer loop, etc. These tests run in CI and validate that the pipeline orchestration logic works correctly even when AI outputs are held constant.

---

## Acceptance Contract

**done_when:**
- [ ] `fixtures/llm-outputs/` directory contains 10 fixture sets, each with pre-recorded AI responses as JSON files
- [ ] Each fixture set is a directory: `fixtures/llm-outputs/e2e-{NNN}-{name}/` containing `responses.json` (array of AI response objects), `prd.md` (input PRD), and `expected-outcome.json` (expected pipeline result)
- [ ] `sf_cli/src/core/ai-runner.ts` supports a `fixtureMode` option that reads responses from a fixture file instead of calling the API
- [ ] When `fixtureMode` is active, `runAgentLoop()` returns the next response from the fixture array in order; exhausting the array produces an error (not a hang)
- [ ] 10 E2E test cases in `sf_cli/src/__tests__/e2e-pipeline.test.ts` cover:
  1. Happy path: single-story PRD, all gates pass
  2. Multi-story PRD: 3 stories with dependencies, executed in correct order
  3. Gate failure at T1: banned pattern in generated code, pipeline halts
  4. Gate failure at T3: test failure, fixer runs and succeeds
  5. Fixer loop exhaustion: fixer fails twice, pipeline reports failure (not infinite loop)
  6. Incremental run: second run with `--diff` skips unchanged stories
  7. Micro-gate MG0 rejection: story with subjective AC, blocked before coding
  8. Progressive persist: pipeline crash mid-story, state file allows resume
  9. Empty PRD: no stories generated, pipeline completes with warning
  10. Large PRD: 5 stories, verifies correct execution order and summary
- [ ] Each E2E test runs in an isolated temporary directory with its own `.skillfoundry/` state
- [ ] No test makes network calls (verified by mocking or blocking `node:https` and `node:http` modules)
- [ ] Each E2E test completes in <30 seconds
- [ ] Fixture files are versioned with a `fixtureVersion` field that must match the test expectation (prevents stale fixtures from silently passing)

**fail_when:**
- An E2E test makes a network call (even if mocked at a higher level)
- A fixture file is missing and the test hangs waiting for AI response instead of erroring
- The pipeline produces a different result for the same fixture input across runs (non-deterministic)
- A fixture set has a version mismatch with the test expectation and the test passes anyway

---

## Technical Approach

### Fixture Structure

```
fixtures/llm-outputs/
├── e2e-001-happy-path/
│   ├── prd.md                # Input PRD
│   ├── responses.json        # Array of {role: "assistant", content: "..."} objects
│   └── expected-outcome.json # { verdict: "PASS", storiesExecuted: 1, gatesRun: 6 }
├── e2e-002-multi-story/
│   ├── prd.md
│   ├── responses.json
│   └── expected-outcome.json
└── ...
```

### responses.json Format

```json
{
  "fixtureVersion": "1.0.0",
  "responses": [
    {
      "id": "resp-001",
      "phase": "story-generation",
      "content": "# STORY-001: ...",
      "tool_calls": []
    },
    {
      "id": "resp-002",
      "phase": "story-execution",
      "content": "I will implement the feature by...",
      "tool_calls": [
        { "name": "write_file", "input": { "path": "src/handler.ts", "content": "..." } }
      ]
    }
  ]
}
```

### Fixture Mode in ai-runner.ts

Add a fixture adapter to `runAgentLoop()`:

```typescript
export interface FixtureOptions {
  fixtureDir: string;
  fixtureVersion: string;
}

export async function runAgentLoop(
  messages: AnthropicMessage[],
  tools: Tool[],
  opts?: { fixture?: FixtureOptions }
): Promise<AgentResult> {
  if (opts?.fixture) {
    return runFixtureLoop(messages, tools, opts.fixture);
  }
  // ... existing API call logic
}

function runFixtureLoop(
  messages: AnthropicMessage[],
  tools: Tool[],
  fixture: FixtureOptions
): AgentResult {
  const data = JSON.parse(readFileSync(join(fixture.fixtureDir, 'responses.json'), 'utf-8'));
  if (data.fixtureVersion !== fixture.fixtureVersion) {
    throw new Error(`Fixture version mismatch: expected ${fixture.fixtureVersion}, got ${data.fixtureVersion}`);
  }
  // Return responses in order, executing tool calls against the real filesystem
  // ...
}
```

### E2E Test Pattern

```typescript
import { describe, it, expect } from 'vitest';

describe('E2E Pipeline', () => {
  it('e2e-001: happy path single-story PRD', async () => {
    const tmpDir = createTempProject('e2e-001-happy-path');
    const result = await runPipeline({
      workDir: tmpDir,
      prdFile: join(FIXTURES_DIR, 'e2e-001-happy-path/prd.md'),
      fixture: {
        fixtureDir: join(FIXTURES_DIR, 'e2e-001-happy-path'),
        fixtureVersion: '1.0.0',
      },
    });
    const expected = loadExpectedOutcome('e2e-001-happy-path');
    expect(result.verdict).toBe(expected.verdict);
    expect(result.stories.length).toBe(expected.storiesExecuted);
  });
});
```

### Network Blocking

In the test setup, mock `node:https` and `node:http` to throw if any test accidentally makes a network call:

```typescript
beforeAll(() => {
  vi.mock('node:https', () => ({ request: () => { throw new Error('Network calls forbidden in E2E tests'); } }));
  vi.mock('node:http', () => ({ request: () => { throw new Error('Network calls forbidden in E2E tests'); } }));
});
```

---

## Files Affected

| File | Action |
|------|--------|
| `fixtures/llm-outputs/` | CREATE — 10 fixture directories with prd.md, responses.json, expected-outcome.json |
| `sf_cli/src/core/ai-runner.ts` | MODIFY — Add fixtureMode support |
| `sf_cli/src/__tests__/e2e-pipeline.test.ts` | CREATE — 10 E2E integration tests |
| `sf_cli/src/__tests__/helpers/e2e-setup.ts` | CREATE — Test utilities: temp project creation, network blocking, fixture loading |
