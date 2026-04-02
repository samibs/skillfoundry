---
story_id: STORY-008
title: Bootstrap Pipeline (7 stages)
phase: 3
priority: SHOULD
complexity: large
depends_on: [STORY-001]
blocks: [STORY-009]
layers: [backend]
---

# STORY-008: Bootstrap Pipeline (7 stages)

## Objective

Replace the current flat startup in server.ts with a 7-stage bootstrap pipeline that provides staged initialization, fail-fast on bad environments, and trust-gated deferred loading.

## Current State

`server.ts` does everything in sequence:
1. Init DB
2. Load skills
3. Load dynamic skills
4. Create MCP server
5. Create Express app
6. Listen

No validation, no fail-fast, no trust gates, no progress reporting.

## Target State

```
Stage 1: Prefetch (env scan, config load, DB init)
Stage 2: Guards (Node version, required binaries check)
Stage 3: Tool Registry (scan src/tools/ directory)
Stage 4: Agent/Skill Load (agents/ folder + dynamic skills from DB)
Stage 5: Deferred Init (trust-gated: Playwright, Semgrep, MCP prefetch)
Stage 6: Permission Assembly (workspace-level deny rules)
Stage 7: Transport Ready (Express + SSE accept connections)
```

## Technical Approach

### 1. Create Bootstrap Pipeline

Create `src/bootstrap/pipeline.ts`:

```typescript
export interface BootstrapStage {
  name: string;
  order: number;
  execute: () => Promise<void>;
  required: boolean;  // false = skip on failure with warning
}

export interface BootstrapState {
  currentStage: string;
  completedStages: number;
  totalStages: number;
  startTime: number;
  errors: Array<{ stage: string; error: string }>;
}

export class BootstrapPipeline {
  private stages: BootstrapStage[] = [];
  private state: BootstrapState;

  constructor() {
    this.state = {
      currentStage: 'initializing',
      completedStages: 0,
      totalStages: 0,
      startTime: Date.now(),
      errors: [],
    };
  }

  addStage(stage: BootstrapStage): void {
    this.stages.push(stage);
    this.stages.sort((a, b) => a.order - b.order);
    this.state.totalStages = this.stages.length;
  }

  async run(): Promise<BootstrapState> {
    for (const stage of this.stages) {
      this.state.currentStage = stage.name;
      try {
        await stage.execute();
        this.state.completedStages++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.state.errors.push({ stage: stage.name, error: msg });
        if (stage.required) throw err;
        // Non-required: log warning, continue
      }
    }
    this.state.currentStage = 'ready';
    return this.state;
  }

  getState(): BootstrapState { return { ...this.state }; }
}
```

### 2. Create Stage Implementations

`src/bootstrap/stages/prefetch.ts` — Config load, DB init, env scan
`src/bootstrap/stages/guards.ts` — Check Node >= 20, check git, check npm
`src/bootstrap/stages/tool-registry.ts` — ToolRegistry.discover()
`src/bootstrap/stages/skill-load.ts` — Load .md skills + dynamic skills from DB
`src/bootstrap/stages/deferred-init.ts` — Trust-gated: check Playwright binary, Semgrep binary
`src/bootstrap/stages/permissions.ts` — Assemble ToolPermissionContext
`src/bootstrap/stages/transport.ts` — Create Express app, bind SSE, listen

### 3. Refactor server.ts

Replace the flat startup with:

```typescript
const pipeline = new BootstrapPipeline();
pipeline.addStage({ name: 'prefetch', order: 1, execute: prefetchStage, required: true });
pipeline.addStage({ name: 'guards', order: 2, execute: guardsStage, required: true });
pipeline.addStage({ name: 'tool-registry', order: 3, execute: toolRegistryStage, required: true });
pipeline.addStage({ name: 'skill-load', order: 4, execute: skillLoadStage, required: true });
pipeline.addStage({ name: 'deferred-init', order: 5, execute: deferredInitStage, required: false });
pipeline.addStage({ name: 'permissions', order: 6, execute: permissionsStage, required: true });
pipeline.addStage({ name: 'transport', order: 7, execute: transportStage, required: true });

const state = await pipeline.run();
console.log(`Bootstrap complete: ${state.completedStages}/${state.totalStages} stages in ${Date.now() - state.startTime}ms`);
```

### 4. Fail-Fast Behavior

- Stage 2 (guards): Missing Node 20+ → exit with clear error
- Stage 5 (deferred-init): Missing Playwright binary → warning, sf_verify_auth disabled
- Stage 5 (deferred-init): Missing Semgrep → warning, sf_security_scan disabled

## Acceptance Criteria

```gherkin
Given a valid environment with Node 20+
When the server starts
Then all 7 bootstrap stages complete in order
And total startup time is < 3 seconds

Given Node 16 is running
When stage 2 (guards) runs
Then startup FAILS with "Node.js >= 20.0.0 required"

Given Playwright is not installed
When stage 5 (deferred-init) runs
Then a warning is logged and sf_verify_auth is disabled
But startup continues (deferred-init is not required)

Given the /health endpoint is called during bootstrap
When stage 4 is executing
Then it returns {stage: "skill-load", completed: 3, total: 7}
```

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `src/bootstrap/pipeline.ts` | Pipeline orchestrator |
| CREATE | `src/bootstrap/stages/prefetch.ts` | Stage 1 |
| CREATE | `src/bootstrap/stages/guards.ts` | Stage 2 |
| CREATE | `src/bootstrap/stages/tool-registry.ts` | Stage 3 |
| CREATE | `src/bootstrap/stages/skill-load.ts` | Stage 4 |
| CREATE | `src/bootstrap/stages/deferred-init.ts` | Stage 5 |
| CREATE | `src/bootstrap/stages/permissions.ts` | Stage 6 |
| CREATE | `src/bootstrap/stages/transport.ts` | Stage 7 |
| CREATE | `src/bootstrap/index.ts` | Public exports |
| MODIFY | `src/server.ts` | Replace flat startup with pipeline |
