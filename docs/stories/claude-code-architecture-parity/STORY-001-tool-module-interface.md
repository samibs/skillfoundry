---
story_id: STORY-001
title: Tool Module Interface & Auto-Discovery
phase: 1
priority: MUST
complexity: medium
depends_on: []
blocks: [STORY-003]
layers: [backend]
---

# STORY-001: Tool Module Interface & Auto-Discovery

## Objective

Define a `ToolModule` interface that standardizes how tools are structured, and implement auto-discovery that scans `src/tools/` to register tools automatically at startup.

## Current State

Tools are defined in three monolithic files:
- `src/mcp/tool-registry.ts` — all tool schemas in one big object
- `src/mcp/handler.ts` — all tool logic in one switch statement
- `src/mcp/tool-dispatch.ts` — dispatch routing in one function

## Target State

Each tool lives in `src/tools/{ToolName}/` with standardized files. A registry scans this directory at startup and registers all tools.

## Technical Approach

### 1. Define ToolModule Interface

Create `src/tools/types.ts`:

```typescript
export interface ToolModule {
  name: string;                           // MCP tool name (e.g., "sf_build")
  description: string;                     // Human-readable description
  tier: 'TIER1' | 'TIER2' | 'TIER3' | 'DYNAMIC';
  category: 'builtin' | 'plugin' | 'skill' | 'dynamic';
  inputSchema: Record<string, unknown>;    // JSON Schema for tool input
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface ToolConstants {
  TOOL_NAME: string;
  TOOL_DESCRIPTION: string;
  TOOL_TIER: string;
  INPUT_SCHEMA: Record<string, unknown>;
}
```

### 2. Create Auto-Discovery Registry

Create `src/tools/registry.ts`:

```typescript
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { ToolModule } from './types';

export class ToolRegistry {
  private tools: Map<string, ToolModule> = new Map();

  async discover(toolsDir: string): Promise<void> {
    const entries = readdirSync(toolsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const modulePath = join(toolsDir, entry.name);
      const indexPath = join(modulePath, 'index.ts');  // or compiled .js
      if (!existsSync(indexPath)) continue;
      const mod = await import(indexPath);
      if (mod.default && this.isToolModule(mod.default)) {
        this.tools.set(mod.default.name, mod.default);
      }
    }
  }

  get(name: string): ToolModule | undefined {
    return this.tools.get(name);
  }

  list(): ToolModule[] {
    return Array.from(this.tools.values());
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  private isToolModule(obj: unknown): obj is ToolModule {
    return typeof obj === 'object' && obj !== null
      && 'name' in obj && 'execute' in obj && 'inputSchema' in obj;
  }
}
```

### 3. Create Example Tool Folder Structure

```
src/tools/
├── types.ts              # ToolModule, ToolResult, ToolConstants interfaces
├── registry.ts           # ToolRegistry with auto-discovery
└── BuildAgent/
    ├── index.ts          # Default export: ToolModule
    ├── BuildAgent.ts     # Execution logic (moved from agents/build-agent.ts)
    ├── constants.ts      # TOOL_NAME, DESCRIPTION, SCHEMA
    └── prompt.ts         # System prompt template for this tool
```

### 4. Wire Registry into Server

Modify `src/server.ts` to use `ToolRegistry.discover()` at startup instead of importing from tool-registry.ts.

## Acceptance Criteria

```gherkin
Given a tool folder src/tools/BuildAgent/ with index.ts exporting a ToolModule
When the server starts and ToolRegistry.discover() runs
Then the tool "sf_build" is registered and callable via MCP

Given a new folder src/tools/MyNewTool/ with a valid index.ts
When the server restarts
Then "sf_my_new_tool" is automatically discovered without code changes

Given a folder in src/tools/ without an index.ts
When discovery runs
Then it is silently skipped with no error

Given a folder with an invalid export (missing execute function)
When discovery runs
Then it is skipped and a warning is logged
```

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `src/tools/types.ts` | ToolModule interface definitions |
| CREATE | `src/tools/registry.ts` | Auto-discovery registry |
| MODIFY | `src/server.ts` | Wire registry into startup |

## Security Checklist

- [ ] Tool names validated against allowed pattern (alphanumeric + underscore)
- [ ] Dynamic imports restricted to tools/ directory only
- [ ] No arbitrary code execution from tool registration
