---
story_id: STORY-004
title: Session Config & Token Budget Tracking
phase: 2
priority: MUST
complexity: medium
depends_on: []
blocks: [STORY-005, STORY-006]
layers: [backend]
---

# STORY-004: Session Config & Token Budget Tracking

## Objective

Implement session configuration and token budget tracking so sessions can enforce limits and prevent runaway consumption.

## Technical Approach

### 1. Create SessionConfig

Create `src/session/config.ts`:

```typescript
export interface SessionConfig {
  maxTurns: number;              // Max tool invocations per session (default: 50)
  maxBudgetTokens: number;       // Cumulative token limit (default: 100000)
  compactAfterTurns: number;     // Trigger compaction threshold (default: 30)
  persistDirectory: string;      // Session storage path (default: '.sf_sessions')
}

export function createSessionConfig(): SessionConfig {
  return {
    maxTurns: parseInt(process.env.SKILLFOUNDRY_MAX_TURNS || '50', 10),
    maxBudgetTokens: parseInt(process.env.SKILLFOUNDRY_MAX_BUDGET_TOKENS || '100000', 10),
    compactAfterTurns: parseInt(process.env.SKILLFOUNDRY_COMPACT_AFTER || '30', 10),
    persistDirectory: process.env.SKILLFOUNDRY_SESSION_DIR || '.sf_sessions',
  };
}
```

### 2. Create UsageSummary

Create `src/session/usage.ts`:

```typescript
export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  turnCount: number;
}

export function createUsageSummary(): UsageSummary {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, turnCount: 0 };
}

// Functional update — returns new object, never mutates
export function addTurn(
  usage: UsageSummary,
  inputTokens: number,
  outputTokens: number
): UsageSummary {
  const newInput = usage.inputTokens + inputTokens;
  const newOutput = usage.outputTokens + outputTokens;
  return {
    inputTokens: newInput,
    outputTokens: newOutput,
    totalTokens: newInput + newOutput,
    turnCount: usage.turnCount + 1,
  };
}

// Estimate tokens from text (whitespace split heuristic)
export function estimateTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).length * 1.3);
}
```

### 3. Create SessionEngine

Create `src/session/engine.ts`:

```typescript
import { randomUUID } from 'crypto';
import { SessionConfig } from './config';
import { UsageSummary, createUsageSummary, addTurn } from './usage';

export type StopReason = 'completed' | 'max_turns_reached' | 'max_budget_reached';

export interface TurnResult {
  sessionId: string;
  toolName: string;
  output: string;
  usage: UsageSummary;
  stopReason: StopReason;
}

export class SessionEngine {
  readonly sessionId: string;
  private config: SessionConfig;
  private usage: UsageSummary;
  private turnCount: number = 0;

  constructor(config: SessionConfig, sessionId?: string) {
    this.sessionId = sessionId || randomUUID();
    this.config = config;
    this.usage = createUsageSummary();
  }

  canExecute(): { allowed: boolean; reason?: StopReason } {
    if (this.turnCount >= this.config.maxTurns) {
      return { allowed: false, reason: 'max_turns_reached' };
    }
    if (this.usage.totalTokens >= this.config.maxBudgetTokens) {
      return { allowed: false, reason: 'max_budget_reached' };
    }
    return { allowed: true };
  }

  recordTurn(inputTokens: number, outputTokens: number): void {
    this.usage = addTurn(this.usage, inputTokens, outputTokens);
    this.turnCount++;
  }

  getUsage(): UsageSummary { return { ...this.usage }; }
  getTurnCount(): number { return this.turnCount; }
  getConfig(): SessionConfig { return { ...this.config }; }
  needsCompaction(): boolean { return this.turnCount > this.config.compactAfterTurns; }
}
```

### 4. Wire into MCP Handler

Modify handler.ts to:
- Create SessionEngine on first tool call (or resume from persisted state)
- Check `canExecute()` before every tool dispatch
- Call `recordTurn()` after every tool completes
- Return budget info in tool responses

## Acceptance Criteria

```gherkin
Given SKILLFOUNDRY_MAX_TURNS=5
When 5 tools have been executed in a session
Then the 6th tool call returns {stopReason: "max_turns_reached"}

Given SKILLFOUNDRY_MAX_BUDGET_TOKENS=1000
When cumulative tokens exceed 1000
Then the next tool call returns {stopReason: "max_budget_reached"}

Given a session with 0 turns
When canExecute() is called
Then it returns {allowed: true}

Given addTurn(usage, 100, 200) is called
When the result is checked
Then inputTokens=100, outputTokens=200, totalTokens=300, turnCount=1
And the original usage object is NOT mutated
```

## Files to Create

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `src/session/config.ts` | SessionConfig + factory |
| CREATE | `src/session/usage.ts` | UsageSummary + functional updates |
| CREATE | `src/session/engine.ts` | SessionEngine orchestrator |
| CREATE | `src/session/index.ts` | Public exports |
| MODIFY | `src/mcp/handler.ts` | Budget enforcement before tool dispatch |
