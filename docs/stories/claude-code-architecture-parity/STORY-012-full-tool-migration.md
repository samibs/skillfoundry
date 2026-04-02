---
story_id: STORY-012
title: Full Tool Migration (remaining tools)
phase: 4
priority: SHOULD
complexity: large
depends_on: [STORY-003]
blocks: []
layers: [backend]
---

# STORY-012: Full Tool Migration (remaining tools)

## Objective

Migrate all remaining tools from the monolithic structure to self-contained `src/tools/{ToolName}/` folders, completing the tool module system.

## Tools to Migrate

After STORY-003 migrates BuildAgent, TestRunner, GitAgent, the remaining tools are:

| Tool | Source | Category |
|------|--------|----------|
| sf_check_deps | agents/dependency-agent.ts | builtin |
| sf_assign_port | agents/port-agent.ts | builtin |
| sf_check_port | agents/port-agent.ts | builtin |
| sf_typecheck | agents/typecheck-agent.ts | builtin |
| sf_lint | agents/lint-agent.ts | builtin |
| sf_migrate | agents/migration-agent.ts | builtin |
| sf_check_env | agents/env-agent.ts | builtin |
| sf_lighthouse | agents/lighthouse-agent.ts | builtin |
| sf_docker_build | agents/docker-agent.ts | builtin |
| sf_docker_compose | agents/docker-agent.ts | builtin |
| sf_nginx_config | agents/nginx-agent.ts | builtin |
| sf_verify_auth | agents/playwright-agent.ts | plugin |
| sf_security_scan | agents/semgrep-agent.ts | plugin |
| sf_memory_gate | knowledge/memory-gate.ts | builtin |
| sf_harvest_knowledge | knowledge/harvester.ts | builtin |
| sf_create_skill | agents/skill-factory.ts | builtin |

## Technical Approach

For each tool, follow the same pattern as STORY-003:

1. Create `src/tools/{ToolName}/` directory
2. Move execution logic to `{ToolName}.ts`
3. Extract schema to `constants.ts`
4. Create `prompt.ts` with system prompt
5. Create `permissions.ts` with trust/tier/category
6. Create `index.ts` with ToolModule default export
7. Register via auto-discovery

### Special Cases

- **Docker tools** (sf_docker_build, sf_docker_compose): Both share docker-agent.ts logic. Create `src/tools/DockerAgent/` with both tools exported. The index.ts exports an array or the registry handles multi-tool modules.
- **Port tools** (sf_assign_port, sf_check_port): Same — both from port-agent.ts. Create `src/tools/PortAgent/` with both.
- **Knowledge tools** (sf_memory_gate, sf_harvest_knowledge): From knowledge/ directory. Create tool wrappers that import from knowledge/.

### Cleanup

After all tools are migrated and verified:
1. Remove tool schemas from `src/mcp/tool-registry.ts`
2. Remove dispatch routing from `src/mcp/tool-dispatch.ts`
3. Remove special cases from `src/mcp/handler.ts`
4. Old `src/agents/*.ts` files become internal library (not tool entry points)

## Acceptance Criteria

```gherkin
Given all tools migrated to src/tools/
When the server starts
Then all 20+ tools register via auto-discovery
And zero tools are registered via the old tool-registry.ts

Given any migrated tool is called via MCP
When executed
Then it produces identical results to the pre-migration behavior

Given tool-registry.ts is emptied
When the server starts
Then no tools are missing (all come from auto-discovery)

Given permission filtering is applied
When a denied tool is in src/tools/
Then it is still blocked (permissions work with new structure)
```

## Files to Create

16 tool folders x 5 files each = ~80 new files

## Files to Remove (after verification)

| File | Replacement |
|------|-------------|
| `src/mcp/tool-registry.ts` | `src/tools/*/constants.ts` |
| `src/mcp/tool-dispatch.ts` | `src/tools/registry.ts` auto-dispatch |
| Tool-specific cases in `src/mcp/handler.ts` | `src/tools/*/index.ts` |

## Security Checklist

- [ ] Every migrated tool produces identical output to original
- [ ] Permission checks work with all migrated tools
- [ ] No new shell access or file access introduced
- [ ] exec-utils.ts usage unchanged
