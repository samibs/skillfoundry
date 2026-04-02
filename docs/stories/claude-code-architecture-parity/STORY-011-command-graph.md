---
story_id: STORY-011
title: Command Graph Segmentation
phase: 4
priority: SHOULD
complexity: small
depends_on: [STORY-001]
blocks: []
layers: [backend]
---

# STORY-011: Command Graph Segmentation

## Objective

Categorize all registered tools and skills into a CommandGraph with builtin/plugin/skill/dynamic segments, enabling filtered listing via the REST API.

## Technical Approach

### 1. Create CommandGraph

Create `src/registry/command-graph.ts`:

```typescript
import { ToolModule } from '../tools/types';

export type CommandCategory = 'builtin' | 'plugin' | 'skill' | 'dynamic';

export interface CommandGraph {
  builtins: ToolModule[];    // Core MCP tools (sf_build, sf_run_tests, etc.)
  plugins: ToolModule[];     // External integrations (Playwright, Semgrep)
  skills: ToolModule[];      // Agent/skill definitions from agents/ folder
  dynamic: ToolModule[];     // Skills created by iznir factory at runtime
}

export function buildCommandGraph(tools: ToolModule[]): CommandGraph {
  return {
    builtins: tools.filter(t => t.category === 'builtin'),
    plugins: tools.filter(t => t.category === 'plugin'),
    skills: tools.filter(t => t.category === 'skill'),
    dynamic: tools.filter(t => t.category === 'dynamic'),
  };
}

export function flattenGraph(graph: CommandGraph): ToolModule[] {
  return [...graph.builtins, ...graph.plugins, ...graph.skills, ...graph.dynamic];
}

export function graphSummary(graph: CommandGraph): {
  builtins: number; plugins: number; skills: number; dynamic: number; total: number;
} {
  return {
    builtins: graph.builtins.length,
    plugins: graph.plugins.length,
    skills: graph.skills.length,
    dynamic: graph.dynamic.length,
    total: graph.builtins.length + graph.plugins.length + graph.skills.length + graph.dynamic.length,
  };
}
```

### 2. Update REST API

Add to `src/api/routes.ts`:

```typescript
// GET /api/v1/agents?category=builtin
router.get('/agents', (req, res) => {
  const category = req.query.category as string | undefined;
  const graph = buildCommandGraph(allTools);
  if (category && category in graph) {
    return res.json({ data: graph[category], meta: { category } });
  }
  return res.json({ data: flattenGraph(graph), meta: graphSummary(graph) });
});
```

### 3. Category Assignment Rules

- **builtin**: Tier 1/2/3 tool agents (sf_build, sf_git_*, sf_typecheck, etc.)
- **plugin**: Tools requiring external binaries (sf_verify_auth → Playwright, sf_security_scan → Semgrep)
- **skill**: LLM skills loaded from .md files in agents/ directory
- **dynamic**: Skills certified by iznir skill factory at runtime

## Acceptance Criteria

```gherkin
Given 20 registered tools
When buildCommandGraph() is called
Then tools are segmented by their category field

Given GET /api/v1/agents?category=builtin
When called
Then only builtin tools are returned

Given GET /api/v1/agents (no filter)
When called
Then all tools are returned with a meta.summary showing counts per category
```

## Files to Create/Modify

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `src/registry/command-graph.ts` | CommandGraph builder |
| MODIFY | `src/api/routes.ts` | Category-filtered agent listing |
