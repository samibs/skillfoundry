---
story_id: STORY-002
title: Permission Engine (deny/prefix/simple/trust)
phase: 1
priority: MUST
complexity: medium
depends_on: []
blocks: [STORY-003]
layers: [backend]
---

# STORY-002: Permission Engine

## Objective

Implement a composable `ToolPermissionContext` that filters available tools based on deny-lists, prefix patterns, simple mode, and workspace trust level.

## Current State

All tools are always available. No permission filtering exists. The handler.ts exposes every registered tool regardless of workspace trust or configuration.

## Target State

A `ToolPermissionContext` is assembled at startup from environment variables and applied before any tool is exposed to MCP clients.

## Technical Approach

### 1. Create Permission Context

Create `src/permissions/context.ts`:

```typescript
export interface ToolPermissionContext {
  denyNames: Set<string>;       // Exact tool names to block (lowercased)
  denyPrefixes: string[];       // Prefix patterns to block (lowercased)
  simpleMode: boolean;          // Core tools only
  trusted: boolean;             // Trust gate for workspace
}

// Core tools available in simple mode
const SIMPLE_MODE_TOOLS = new Set(['sf_build', 'sf_run_tests', 'sf_git_status']);

// Tools requiring trusted workspace
const TRUST_REQUIRED_TOOLS = new Set([
  'sf_security_scan', 'sf_verify_auth', 'sf_harvest_knowledge',
  'sf_create_skill', 'sf_memory_gate'
]);

export function createPermissionContext(): ToolPermissionContext {
  const denyNamesRaw = process.env.SKILLFOUNDRY_DENY_TOOLS || '';
  const denyPrefixesRaw = process.env.SKILLFOUNDRY_DENY_PREFIXES || '';

  return {
    denyNames: new Set(
      denyNamesRaw.split(',').filter(Boolean).map(n => n.trim().toLowerCase())
    ),
    denyPrefixes: denyPrefixesRaw.split(',').filter(Boolean).map(p => p.trim().toLowerCase()),
    simpleMode: process.env.SKILLFOUNDRY_SIMPLE_MODE === 'true',
    trusted: process.env.SKILLFOUNDRY_TRUST !== 'false',  // default trusted
  };
}
```

### 2. Create Permission Filter

Create `src/permissions/filter.ts`:

```typescript
import { ToolPermissionContext, SIMPLE_MODE_TOOLS, TRUST_REQUIRED_TOOLS } from './context';
import { ToolModule } from '../tools/types';

export interface PermissionDenial {
  toolName: string;
  reason: string;
}

export function blocks(ctx: ToolPermissionContext, toolName: string): PermissionDenial | null {
  const lowered = toolName.toLowerCase();

  // Deny by exact name
  if (ctx.denyNames.has(lowered)) {
    return { toolName, reason: `Tool "${toolName}" is in the deny list` };
  }

  // Deny by prefix
  for (const prefix of ctx.denyPrefixes) {
    if (lowered.startsWith(prefix)) {
      return { toolName, reason: `Tool "${toolName}" matches denied prefix "${prefix}"` };
    }
  }

  // Simple mode: only core tools
  if (ctx.simpleMode && !SIMPLE_MODE_TOOLS.has(lowered)) {
    return { toolName, reason: `Simple mode: only core tools available` };
  }

  // Trust gate
  if (!ctx.trusted && TRUST_REQUIRED_TOOLS.has(lowered)) {
    return { toolName, reason: `Tool "${toolName}" requires trusted workspace` };
  }

  return null;  // Allowed
}

export function filterTools(
  tools: ToolModule[],
  ctx: ToolPermissionContext
): { allowed: ToolModule[]; denied: PermissionDenial[] } {
  const allowed: ToolModule[] = [];
  const denied: PermissionDenial[] = [];

  for (const tool of tools) {
    const denial = blocks(ctx, tool.name);
    if (denial) {
      denied.push(denial);
    } else {
      allowed.push(tool);
    }
  }

  return { allowed, denied };
}
```

### 3. Wire into MCP Handler

Modify `src/mcp/handler.ts`:
- Import `createPermissionContext` and `filterTools`
- Apply filter in `listTools` handler before returning tools
- Apply filter in `callTool` handler before executing (return permission denied error)

### 4. Log Permission Denials

All denials logged with: tool name, reason, timestamp, requesting context.

## Acceptance Criteria

```gherkin
Given SKILLFOUNDRY_DENY_TOOLS="sf_docker_build"
When MCP client lists tools
Then sf_docker_build is NOT in the list

Given SKILLFOUNDRY_DENY_PREFIXES="sf_docker"
When MCP client lists tools
Then sf_docker_build AND sf_docker_compose are both absent

Given SKILLFOUNDRY_SIMPLE_MODE="true"
When MCP client lists tools
Then only sf_build, sf_run_tests, sf_git_status are available

Given SKILLFOUNDRY_TRUST="false"
When sf_security_scan is called
Then it returns {isError: true, reason: "requires trusted workspace"}

Given a denied tool is called directly
When handler processes the call
Then it returns permission denial BEFORE any execution logic runs
```

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `src/permissions/context.ts` | ToolPermissionContext definition + factory |
| CREATE | `src/permissions/filter.ts` | Permission filtering + denial tracking |
| CREATE | `src/permissions/index.ts` | Public exports |
| MODIFY | `src/mcp/handler.ts` | Apply permission filter in listTools and callTool |
| MODIFY | `src/server.ts` | Create permission context at startup |

## Security Checklist

- [ ] Deny-list is case-insensitive
- [ ] Permission check runs BEFORE any tool logic
- [ ] Trust gate cannot be escalated without restart
- [ ] All denials are logged
