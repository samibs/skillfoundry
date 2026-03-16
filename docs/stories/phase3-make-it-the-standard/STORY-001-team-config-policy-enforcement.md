# STORY-001: Team Config File + Org-Wide Policy Enforcement

**Phase:** 1 — Team Foundation
**PRD:** phase3-make-it-the-standard
**Priority:** MUST
**Effort:** L
**Status:** READY
**Dependencies:** None
**Blocks:** STORY-002, STORY-003, STORY-004, STORY-005, STORY-010
**Affects:** FR-001

---

## Description

Create a `skillfoundry.team.ts` configuration file format and a `team-config.ts` loader module that defines org-wide gate thresholds, banned patterns, approved AI models, and shared settings. When a team config exists at the project root, all gate executions read thresholds from it, overriding the built-in defaults. The config is validated at load time using a Zod schema; invalid configs produce a clear error and halt execution.

---

## Acceptance Contract

**done_when:**
- [ ] `sf_cli/src/core/team-config.ts` exports `loadTeamConfig()` that reads `skillfoundry.team.ts` from the project root
- [ ] Zod schema validates all fields: `version`, `org`, `gates.thresholds`, `bannedPatterns`, `approvedModels`, `memory`, `skills`
- [ ] `loadTeamConfig()` returns `null` when no team config exists (solo-developer mode, no error)
- [ ] `loadTeamConfig()` throws a structured error with field-level details when the config is invalid
- [ ] `gates.ts` reads thresholds from team config when present, falls back to built-in defaults when absent
- [ ] `bannedPatterns` from team config are merged (appended) with the framework's default banned patterns, not replacing them
- [ ] `approvedModels` restricts which AI model identifiers the pipeline accepts; unapproved models produce a gate FAIL at T0
- [ ] A TypeScript type `TeamConfig` is exported for consumer use
- [ ] Unit tests in `sf_cli/src/__tests__/team-config.test.ts` cover: valid config, missing config, invalid config (bad version, extra fields, missing required fields), banned pattern merging, model approval check
- [ ] An example `skillfoundry.team.example.ts` is provided at the repo root

**fail_when:**
- A missing team config file causes an error (should silently fall back to defaults)
- Framework default banned patterns are replaced instead of merged
- An invalid config silently loads with defaults instead of throwing
- Gate thresholds from team config are ignored during gate execution

---

## Technical Approach

### Team Config File Format

The config file at `skillfoundry.team.ts` uses TypeScript for type safety and IDE autocomplete:

```typescript
import type { TeamConfig } from './sf_cli/src/core/team-config.js';

export default {
  version: '1.0.0',
  org: 'Acme Corp',
  gates: {
    thresholds: {
      T1: { maxBannedPatterns: 0 },
      T2: { typeCheckMustPass: true },
      T3: { minTestCoverage: 80, testsMustPass: true },
      T4: { maxSecurityFindings: 0, severityThreshold: 'medium' },
      T5: { buildMustSucceed: true },
      T6: { maxScopeViolations: 0 },
    },
  },
  bannedPatterns: [
    'console.log',
    'debugger',
    'ACME_INTERNAL',
  ],
  approvedModels: [
    'claude-sonnet-4-20250514',
    'claude-opus-4-20250514',
    'gpt-4o',
  ],
  memory: {
    remote: 'git@github.com:acme/sf-memory.git',
    branch: 'main',
  },
  skills: {
    pin: '2.0.51',
  },
} satisfies TeamConfig;
```

### Loader Implementation

`sf_cli/src/core/team-config.ts`:

1. Check for `skillfoundry.team.ts` at the resolved project root (from `getFrameworkRoot()`).
2. If absent, return `null`. No error, no warning.
3. If present, dynamically import the file using `tsx` register or `tsImport()`.
4. Validate the default export against the Zod schema.
5. On validation failure, throw `TeamConfigError` with field-level Zod issues.
6. On success, return the typed `TeamConfig` object.
7. Cache the loaded config for the duration of the process (module-level singleton).

### Gate Integration

In `gates.ts`, modify each gate function to accept optional thresholds:

1. At the top of `runAllGates()`, call `loadTeamConfig()`.
2. If a team config exists, pass `config.gates.thresholds[tier]` to each gate function.
3. Each gate function merges team thresholds with defaults: `{ ...defaults, ...teamThresholds }`.
4. For `bannedPatterns`, concatenate: `[...frameworkDefaults, ...(config?.bannedPatterns ?? [])]`.

### Model Approval Check

Add a pre-flight check in `pipeline.ts`:

1. If team config has `approvedModels`, check the configured provider model against the list.
2. If the model is not in the list, produce a T0 FAIL with message: `Model "<model>" is not in the approved list: [...]`.

---

## Files Affected

| File | Action |
|------|--------|
| `sf_cli/src/core/team-config.ts` | CREATE — Zod schema, loader, TeamConfig type |
| `sf_cli/src/__tests__/team-config.test.ts` | CREATE — Unit tests for loader and validation |
| `sf_cli/src/core/gates.ts` | MODIFY — Read thresholds from team config |
| `sf_cli/src/core/pipeline.ts` | MODIFY — Add model approval pre-flight check |
| `skillfoundry.team.example.ts` | CREATE — Example team config at repo root |
