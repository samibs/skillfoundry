# PRD: Real Autonomous Agents

---
prd_id: real-autonomous-agents
title: Real Autonomous Agents
version: 1.0
status: DRAFT
created: 2026-03-15
author: SkillFoundry Team
last_updated: 2026-03-15

# DEPENDENCIES (for inter-PRD coordination)
dependencies:
  requires: []
  recommends: []
  blocks: []
  shared_with: [semgrep-security-integration]

tags: [core, architecture, agents]
priority: high
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

SkillFoundry claims "60 agents" but the current implementation consists of markdown instruction files that get injected as system prompts into a single shared agentic loop (`ai-runner.ts`). They are skill prompts, not autonomous entities. Each "agent" is a `{ name, displayName, toolCategory, systemPrompt }` record in `agent-registry.ts` — there is no independent decision-making, no state management, no lifecycle, and no ability for agents to coordinate or delegate to each other programmatically. This is a credibility gap identified by external framework assessment.

### 1.2 Proposed Solution

Build a real `Agent` class hierarchy in TypeScript that gives each agent its own execution context, state machine, decision loop, and tool set. Agents become first-class runtime entities that can: (1) accept a task and autonomously execute it, (2) maintain their own state across turns, (3) delegate sub-tasks to other agents, (4) report structured results. The existing `ai-runner.ts` loop becomes the engine that each agent wraps, not the agent itself.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Agent autonomy | 0 — all share one loop | Each agent has own execute() with state | Unit test: agent.execute() returns structured result |
| Agent delegation | 0 — no inter-agent calls | Agents can spawn sub-agents | Integration test: orchestrator delegates to coder+tester |
| State persistence | 0 — no agent state | Agents track progress, decisions, blockers | Unit test: agent.getState() returns structured state |
| Backward compatibility | N/A | 100% — existing CLI/forge works unchanged | Full test suite passes after migration |

---

## 2. User Stories

### Primary User: Framework Developer

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | invoke an agent that autonomously completes a task | I don't have to manually orchestrate multi-step workflows | MUST |
| US-002 | developer | have agents delegate sub-tasks to other agents | complex workflows are handled by specialist agents | MUST |
| US-003 | developer | see an agent's state (progress, decisions, blockers) | I can understand what the agent is doing and intervene if needed | MUST |
| US-004 | developer | define custom agents with specific tool sets and behaviors | I can extend the framework with domain-specific agents | SHOULD |
| US-005 | developer | have agents operate within budget constraints | runaway agents don't burn through API tokens | MUST |
| US-006 | pipeline | have the forge invoke agents as real autonomous units | the pipeline produces genuine multi-agent execution | MUST |

---

## 3. Functional Requirements

### 3.1 Core Features

| ID | Requirement | Description | Acceptance Criteria |
|----|-------------|-------------|---------------------|
| FR-001 | Agent Base Class | Abstract `Agent` class with `execute()`, `getState()`, `abort()` | Given a task, When agent.execute(task) is called, Then it runs autonomously and returns a structured AgentResult |
| FR-002 | Agent State Machine | Each agent tracks its lifecycle: IDLE → RUNNING → DELEGATING → COMPLETED/FAILED/ABORTED | Given a running agent, When getState() is called, Then it returns current phase, progress, and decisions made |
| FR-003 | Agent Delegation | Agents can spawn child agents for sub-tasks via `this.delegate(agentName, task)` | Given an orchestrator agent, When it delegates to a coder agent, Then the coder runs independently and returns results to the orchestrator |
| FR-004 | Agent Tool Binding | Each agent instance has its own tool set (from ToolCategory) bound at construction | Given a REVIEW agent, When it executes, Then it only has access to READ/GLOB/GREP tools, not WRITE/BASH |
| FR-005 | Agent Budget Guard | Each agent tracks its own token usage and respects per-agent and total budget limits | Given a budget limit of $0.50, When the agent exceeds it, Then execution stops with a budget_exceeded result |
| FR-006 | Agent Result Contract | All agents return `AgentResult { status, output, decisions, artifacts, tokenUsage, childResults }` | Given any agent execution, When it completes, Then the result contains all required fields |
| FR-007 | Agent Registry Upgrade | Existing `AGENT_REGISTRY` maps agent names to Agent class constructors instead of flat definitions | Given the registry, When getAgent('coder') is called, Then it returns an Agent class that can be instantiated and executed |
| FR-008 | Backward Compatibility | Existing CLI commands, forge pipeline, and skill invocations work unchanged | Given the existing test suite, When all tests run after migration, Then 100% pass |
| FR-009 | Agent Execution Context | Each agent receives an `AgentContext` with workDir, config, policy, parentAgent, budget allocation | Given a delegated agent, When it accesses context.parentAgent, Then it can reference its parent |
| FR-010 | Agent Event Emitter | Agents emit typed events (started, progress, delegated, tool_called, completed, failed) | Given an agent, When callbacks are registered, Then events fire at appropriate lifecycle points |

### 3.2 Agent Class Hierarchy

**Phase 1 — Core Agents (converted from existing registry):**

| Agent Class | Extends | Tool Category | Key Behavior |
|-------------|---------|---------------|--------------|
| `ImplementerAgent` | `Agent` | FULL/CODE | Writes code, runs tools, produces file artifacts |
| `ReviewerAgent` | `Agent` | REVIEW | Reads code, produces findings (never writes) |
| `OperatorAgent` | `Agent` | OPS | Runs diagnostics, produces reports |
| `AdvisorAgent` | `Agent` | NONE | Answers questions (no tool access) |

**Phase 2 — Orchestrator Agents:**

| Agent Class | Extends | Delegates To | Key Behavior |
|-------------|---------|--------------|--------------|
| `ForgeAgent` | `ImplementerAgent` | Coder, Tester, Security, GateKeeper | Full pipeline execution with phase management |
| `GoAgent` | `ImplementerAgent` | Architect, Coder, Tester | Story-level orchestration |
| `SwarmAgent` | `ImplementerAgent` | Any agents in parallel | Parallel task dispatch with conflict detection |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Requirement |
|--------|-------------|
| Agent instantiation | < 5ms per agent |
| Delegation overhead | < 50ms per delegation (excl. LLM calls) |
| Memory per agent | < 1MB including state |

### 4.2 Security

| Aspect | Requirement |
|--------|-------------|
| Tool isolation | REVIEW agents cannot access WRITE/BASH tools even if underlying loop supports them |
| Budget enforcement | Per-agent budget limits enforced in Agent base class, not just at runner level |
| State isolation | Child agents cannot modify parent agent state directly |

---

## 5. Technical Specifications

### 5.1 Architecture

```
┌──────────────────────────────────────────────┐
│              Agent Registry                   │
│  getAgent('coder') → CoderAgent class        │
│  getAgent('forge') → ForgeAgent class        │
└──────┬───────────────────────────────────────┘
       │ instantiate
       ▼
┌──────────────────────────────────────────────┐
│              Agent Instance                   │
│  ┌─────────────┐  ┌──────────────────┐       │
│  │ State Machine│  │ AgentContext      │       │
│  │ IDLE→RUNNING │  │ workDir, config   │       │
│  │ →COMPLETED   │  │ policy, budget    │       │
│  └─────────────┘  └──────────────────┘       │
│  ┌─────────────┐  ┌──────────────────┐       │
│  │ Tool Set     │  │ Event Emitter     │       │
│  │ (per category)│  │ onProgress, etc   │       │
│  └─────────────┘  └──────────────────┘       │
│           │                                   │
│           ▼                                   │
│  ┌─────────────────────┐                     │
│  │  ai-runner.ts loop   │  (execution engine) │
│  └─────────────────────┘                     │
│           │                                   │
│           ▼ delegate()                        │
│  ┌─────────────────────┐                     │
│  │  Child Agent Instance │                    │
│  └─────────────────────┘                     │
└──────────────────────────────────────────────┘
```

### 5.2 Data Model

**AgentState:**
| Field | Type | Description |
|-------|------|-------------|
| status | `'idle' \| 'running' \| 'delegating' \| 'completed' \| 'failed' \| 'aborted'` | Current lifecycle phase |
| progress | `{ current: number, total: number, label: string }` | Execution progress |
| decisions | `Array<{ timestamp: string, decision: string, reasoning: string }>` | Decisions made during execution |
| blockers | `string[]` | Issues preventing progress |
| artifacts | `string[]` | Files created or modified |
| childAgents | `Array<{ name: string, status: string, taskSummary: string }>` | Delegated sub-agents |

**AgentResult:**
| Field | Type | Description |
|-------|------|-------------|
| status | `'completed' \| 'failed' \| 'aborted' \| 'budget_exceeded'` | Outcome |
| output | `string` | Final text output |
| decisions | `Array<{ decision: string, reasoning: string }>` | Decisions made |
| artifacts | `string[]` | Files created/modified |
| tokenUsage | `{ input: number, output: number, cost: number }` | Token consumption |
| childResults | `Map<string, AgentResult>` | Results from delegated agents |
| durationMs | `number` | Wall-clock execution time |

**AgentContext:**
| Field | Type | Description |
|-------|------|-------------|
| workDir | `string` | Working directory |
| config | `SfConfig` | Framework configuration |
| policy | `SfPolicy` | Permission policy |
| parentAgent | `Agent \| null` | Parent agent (if delegated) |
| budgetUsd | `number` | Budget allocated to this agent |
| abortSignal | `AbortSignal` | Cancellation signal |

### 5.3 Dependencies

| Dependency | Version | Purpose | Risk if Unavailable |
|------------|---------|---------|---------------------|
| ai-runner.ts | existing | Execution engine (multi-turn loop) | Core — required |
| agent-registry.ts | existing | Agent name → class mapping | Core — migrated in-place |
| tools.ts | existing | Tool definitions per category | Core — required |
| budget.ts | existing | Token budget management | Core — required |

---

## 7. Constraints & Assumptions

### 7.1 Constraints

- **Technical:** Must reuse `ai-runner.ts` as the execution engine — not replace it
- **Backward compat:** All 60 existing agents must work with zero behavior change for existing CLI users
- **Budget:** Agent delegation creates nested budget scopes — parent allocates to children
- **No new dependencies:** Pure TypeScript, no external agent frameworks

### 7.2 Assumptions

| Assumption | Risk if Wrong | Mitigation |
|------------|---------------|------------|
| ai-runner.ts can be wrapped without modification | Need to refactor runner | Design Agent to compose, not inherit from runner |
| Tool categories are sufficient for agent isolation | Need finer-grained permissions | Add per-agent tool allowlists as override |
| LLM can follow agent-specific system prompts reliably | Agent behavior is inconsistent | Add structured output parsing for decisions/state |

### 7.3 Out of Scope

- [ ] Persistent agent memory across sessions (handled by memory_bank/)
- [ ] Agent-to-agent direct communication (agents delegate, not message)
- [ ] Visual agent graph/dashboard
- [ ] Remote/distributed agent execution
- [ ] Agent marketplace or plugin system
- [ ] Training or fine-tuning agents

---

## 8. Risks & Mitigations

| ID | Risk | Likelihood | Impact | Mitigation Strategy |
|----|------|------------|--------|---------------------|
| R-001 | Delegation loops — agent A delegates to B which delegates back to A | M | H | Max delegation depth (3 levels), parent tracking prevents circular delegation |
| R-002 | Budget explosion from deep delegation chains | M | H | Budget is partitioned: parent allocates fraction to child, child cannot exceed allocation |
| R-003 | Backward compatibility breaks | L | H | Phase 1 wraps existing behavior — no functional change. Full test suite validates. |
| R-004 | State management overhead slows execution | L | M | State tracking is lightweight in-memory objects, not persisted until completion |

---

## 9. Implementation Plan

### 9.1 Phases

| Phase | Name | Scope | Prerequisites |
|-------|------|-------|---------------|
| 1 | Agent Foundation | Agent base class, AgentContext, AgentResult, AgentState, 4 archetype classes (Implementer, Reviewer, Operator, Advisor), registry migration | None |
| 2 | Agent Delegation | delegate() method, child agent spawning, budget partitioning, depth limiting, ForgeAgent + GoAgent as orchestrators | Phase 1 |
| 3 | Agent Events & Observability | Event emitter, progress reporting, structured decision logging, agent execution timeline | Phase 2 |

### 9.2 Effort Estimate

| Phase | Effort | Complexity | Risk |
|-------|--------|------------|------|
| 1 | L | Medium | Low |
| 2 | L | High | Medium |
| 3 | M | Medium | Low |

---

## 10. Acceptance Criteria

### 10.1 Definition of Done

- [ ] Agent base class with execute(), getState(), abort(), delegate()
- [ ] 4 archetype agent classes (ImplementerAgent, ReviewerAgent, OperatorAgent, AdvisorAgent)
- [ ] All 60 existing agents mapped to one of the 4 archetypes
- [ ] Agent delegation works: ForgeAgent can delegate to CoderAgent
- [ ] Budget enforcement at agent level
- [ ] AgentResult returned from every execution with all required fields
- [ ] Existing CLI commands work unchanged (backward compatibility)
- [ ] Unit test coverage >= 80% for agent base class and archetypes
- [ ] Integration tests for delegation chain (orchestrator → specialist → result)
- [ ] Full test suite passes (all existing tests + new agent tests)

---

## 11. Appendix

### 11.1 Glossary

| Term | Definition | Code Name |
|------|------------|-----------|
| Agent | Autonomous entity that accepts a task and executes it independently | `Agent` |
| Agent Archetype | Base class for a category of agents (Implementer, Reviewer, Operator, Advisor) | `ImplementerAgent` etc. |
| Delegation | An agent spawning a child agent to handle a sub-task | `delegate()` |
| Agent Context | Runtime environment passed to an agent (workDir, config, budget) | `AgentContext` |
| Agent Result | Structured output from agent execution | `AgentResult` |
| Agent State | Current lifecycle phase and progress of an agent | `AgentState` |

### 11.2 References

- `sf_cli/src/core/ai-runner.ts` — Current agentic loop (execution engine)
- `sf_cli/src/core/agent-registry.ts` — Current agent registry (60 agents)
- `sf_cli/src/core/tools.ts` — Tool definitions and categories
- `sf_cli/src/core/budget.ts` — Budget management

### 11.3 Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-15 | SkillFoundry Team | Initial draft |
