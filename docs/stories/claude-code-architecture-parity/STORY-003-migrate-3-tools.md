---
story_id: STORY-003
title: Migrate 3 Tools to Folder Structure (BuildAgent, TestRunner, GitAgent)
phase: 1
priority: MUST
complexity: medium
depends_on: [STORY-001, STORY-002]
blocks: [STORY-012]
layers: [backend]
---

# STORY-003: Migrate 3 Tools to Folder Structure

## Objective

Migrate BuildAgent, TestRunner, and GitAgent from monolithic files to self-contained `src/tools/{ToolName}/` folders as proof-of-concept for the tool module system.

## Current State

- `src/agents/build-agent.ts` — build logic
- `src/agents/test-runner-agent.ts` — test runner logic
- `src/agents/git-agent.ts` — git operations
- `src/mcp/tool-registry.ts` — their schemas defined inline
- `src/mcp/tool-dispatch.ts` — their dispatch routing

## Target State

```
src/tools/
├── BuildAgent/
│   ├── index.ts          # ToolModule export
│   ├── BuildAgent.ts     # Execution logic (from agents/build-agent.ts)
│   ├── constants.ts      # Name, description, schema
│   ├── prompt.ts         # System prompt
│   └── permissions.ts    # Permission requirements
├── TestRunner/
│   ├── index.ts
│   ├── TestRunner.ts     # From agents/test-runner-agent.ts
│   ├── constants.ts
│   ├── prompt.ts
│   └── permissions.ts
└── GitAgent/
    ├── index.ts
    ├── GitAgent.ts       # From agents/git-agent.ts (sf_git_status + sf_git_commit)
    ├── constants.ts
    ├── prompt.ts
    └── permissions.ts
```

## Technical Approach

For each of the 3 tools:

### 1. Create constants.ts

Extract the tool schema from `tool-registry.ts` into its own constants file:

```typescript
// src/tools/BuildAgent/constants.ts
export const TOOL_NAME = 'sf_build';
export const TOOL_DESCRIPTION = 'Run project build and report pass/fail with errors';
export const TOOL_TIER = 'TIER1' as const;
export const INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    projectPath: { type: 'string', description: 'Absolute path to project root' },
  },
  required: ['projectPath'],
};
```

### 2. Create prompt.ts

Define a system prompt template for this tool's context:

```typescript
// src/tools/BuildAgent/prompt.ts
export const SYSTEM_PROMPT = `You are the Build Verification Agent.
Your job is to run the project build command and report results.
Always check package.json for the correct build command.
Report errors with file paths and line numbers when available.`;
```

### 3. Create permissions.ts

Define what this tool requires:

```typescript
// src/tools/BuildAgent/permissions.ts
export const REQUIRES_TRUST = false;  // Build is safe in untrusted workspaces
export const TIER = 'TIER1';
export const CATEGORY = 'builtin';
```

### 4. Move execution logic to {ToolName}.ts

Copy the execution function from `agents/build-agent.ts` to `tools/BuildAgent/BuildAgent.ts`. Keep the original file temporarily for backward compatibility.

### 5. Create index.ts

Wire everything into a ToolModule export:

```typescript
// src/tools/BuildAgent/index.ts
import { ToolModule } from '../types';
import { TOOL_NAME, TOOL_DESCRIPTION, TOOL_TIER, INPUT_SCHEMA } from './constants';
import { runBuild } from './BuildAgent';
import { CATEGORY } from './permissions';

const buildAgent: ToolModule = {
  name: TOOL_NAME,
  description: TOOL_DESCRIPTION,
  tier: TOOL_TIER,
  category: CATEGORY,
  inputSchema: INPUT_SCHEMA,
  execute: async (args) => {
    const result = await runBuild(args.projectPath as string);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      isError: !result.passed,
    };
  },
};

export default buildAgent;
```

### 6. Update tool-dispatch.ts

For the 3 migrated tools, route through the registry instead of direct imports. Keep all other tools dispatching through the old path.

### 7. Backward Compatibility

- Old `agents/*.ts` files are NOT deleted yet (STORY-012 handles full migration)
- `tool-registry.ts` schemas for these 3 tools are marked with `// MIGRATED: see src/tools/BuildAgent/`
- `tool-dispatch.ts` checks registry first, falls back to old dispatch

## Acceptance Criteria

```gherkin
Given the server starts with src/tools/BuildAgent/index.ts present
When MCP client calls sf_build with a valid projectPath
Then the build runs exactly as before (no behavior change)

Given the server starts with src/tools/TestRunner/index.ts present
When MCP client calls sf_run_tests
Then tests run and return the same structured result as before

Given the server starts with src/tools/GitAgent/index.ts present
When MCP client calls sf_git_status or sf_git_commit
Then git operations work identically to the old dispatch

Given SKILLFOUNDRY_DENY_TOOLS="sf_build"
When MCP client calls sf_build via the new tool module
Then it is blocked by the permission engine (STORY-002 integration)

Given one of the 3 tool folders is deleted
When the server starts
Then the remaining 2 tools still register and work
And tools still in agents/ dispatch through the old path
```

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `src/tools/BuildAgent/index.ts` | ToolModule export |
| CREATE | `src/tools/BuildAgent/BuildAgent.ts` | Build execution logic |
| CREATE | `src/tools/BuildAgent/constants.ts` | Schema + name |
| CREATE | `src/tools/BuildAgent/prompt.ts` | System prompt |
| CREATE | `src/tools/BuildAgent/permissions.ts` | Permission config |
| CREATE | `src/tools/TestRunner/index.ts` | ToolModule export |
| CREATE | `src/tools/TestRunner/TestRunner.ts` | Test runner logic |
| CREATE | `src/tools/TestRunner/constants.ts` | Schema + name |
| CREATE | `src/tools/TestRunner/prompt.ts` | System prompt |
| CREATE | `src/tools/TestRunner/permissions.ts` | Permission config |
| CREATE | `src/tools/GitAgent/index.ts` | ToolModule export |
| CREATE | `src/tools/GitAgent/GitAgent.ts` | Git operations logic |
| CREATE | `src/tools/GitAgent/constants.ts` | Schema + name |
| CREATE | `src/tools/GitAgent/prompt.ts` | System prompt |
| CREATE | `src/tools/GitAgent/permissions.ts` | Permission config |
| MODIFY | `src/mcp/tool-dispatch.ts` | Check registry first, fallback to old |
| MODIFY | `src/server.ts` | Initialize ToolRegistry before MCP handler |

## Security Checklist

- [ ] Migrated tools behave identically to originals
- [ ] No new permissions granted during migration
- [ ] exec-utils.ts usage unchanged (no new shell access)
