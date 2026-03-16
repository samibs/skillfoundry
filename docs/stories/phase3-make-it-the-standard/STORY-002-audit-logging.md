# STORY-002: Audit Logging (Append-Only Gate Decisions)

**Phase:** 1 — Team Foundation
**PRD:** phase3-make-it-the-standard
**Priority:** MUST
**Effort:** M
**Status:** READY
**Dependencies:** STORY-001
**Blocks:** STORY-005
**Affects:** FR-002

---

## Description

Implement an append-only JSONL audit log that records every gate decision. Each entry captures the gate tier, verdict (pass/fail/warn/skip), reason, actor identity (user or CI), timestamp, duration, and optional story/file references. The log is written to `.skillfoundry/audit.jsonl` using `fs.appendFileSync` for crash safety. No update or delete operations are exposed. The audit log is designed for compliance evidence and post-incident investigation.

---

## Acceptance Contract

**done_when:**
- [ ] `sf_cli/src/core/audit-log.ts` exports `appendAuditEntry(entry: AuditEntry): void` and `readAuditLog(filter?: AuditFilter): AuditEntry[]`
- [ ] Every gate execution in `gates.ts` calls `appendAuditEntry()` after producing a verdict
- [ ] Every micro-gate execution in `micro-gates.ts` calls `appendAuditEntry()` after producing a verdict
- [ ] Each JSONL line contains: `id` (UUID v4), `timestamp` (ISO 8601), `actor`, `gate`, `verdict`, `reason`, `durationMs`, optional `storyFile`, optional `fileSha`
- [ ] `actor` is resolved from: `$SF_ACTOR` env var > `$USER` env var > `git config user.name` > "unknown"
- [ ] The audit log file is created automatically on first write if it does not exist
- [ ] `appendAuditEntry()` uses `fs.appendFileSync()` with a trailing newline for atomicity
- [ ] No function exists to delete or modify existing audit entries
- [ ] `readAuditLog()` streams the file line-by-line and filters by gate, verdict, date range, or actor
- [ ] Unit tests in `sf_cli/src/__tests__/audit-log.test.ts` cover: first write creates file, append adds line, read returns all entries, read with filter returns subset, malformed lines are skipped with warning, actor resolution order
- [ ] `.skillfoundry/audit.jsonl` is added to `.gitignore` (audit logs stay local unless explicitly shared)

**fail_when:**
- A gate executes without producing an audit entry
- An audit entry is missing any of the required fields (id, timestamp, actor, gate, verdict, reason, durationMs)
- The audit log file can be truncated or entries deleted via the module's public API
- A malformed JSONL line crashes `readAuditLog()` instead of being skipped

---

## Technical Approach

### AuditEntry Interface

```typescript
export interface AuditEntry {
  id: string;           // UUID v4
  timestamp: string;    // ISO 8601
  actor: string;        // resolved identity
  gate: string;         // "T1", "T2", "MG0", etc.
  verdict: 'pass' | 'fail' | 'warn' | 'skip';
  reason: string;       // human-readable explanation
  durationMs: number;   // gate execution time
  storyFile?: string;   // story being evaluated
  fileSha?: string;     // SHA256 of primary file
}
```

### Writer Implementation

`sf_cli/src/core/audit-log.ts`:

1. `getAuditLogPath()`: returns `join(workDir, '.skillfoundry', 'audit.jsonl')`.
2. `resolveActor()`: checks `process.env.SF_ACTOR`, then `process.env.USER`, then `git config user.name`, then `"unknown"`.
3. `appendAuditEntry(entry)`: validates required fields, serializes to JSON, appends with `\n`, uses `fs.appendFileSync`. Creates `.skillfoundry/` directory if needed.
4. No `deleteAuditEntry` or `updateAuditEntry` functions exist in the module.

### Reader Implementation

1. `readAuditLog(filter?)`: reads the JSONL file line-by-line using `readline` or split on `\n`.
2. Each line is parsed with `JSON.parse()` in a try/catch. Malformed lines log a warning and are skipped.
3. Optional `AuditFilter` supports: `gate?: string`, `verdict?: string`, `actor?: string`, `since?: string` (ISO date), `until?: string` (ISO date).

### Gate Integration

In `gates.ts`, after each gate returns its `GateResult`:

```typescript
appendAuditEntry({
  id: randomUUID(),
  timestamp: new Date().toISOString(),
  actor: resolveActor(),
  gate: result.tier,
  verdict: result.status === 'pass' ? 'pass' : result.status,
  reason: result.detail,
  durationMs: result.durationMs,
  storyFile: currentStoryFile,
});
```

Same pattern in `micro-gates.ts` for MG0, MG1.5, and post-story gates.

---

## Files Affected

| File | Action |
|------|--------|
| `sf_cli/src/core/audit-log.ts` | CREATE — AuditEntry type, append/read functions, actor resolution |
| `sf_cli/src/__tests__/audit-log.test.ts` | CREATE — Unit tests |
| `sf_cli/src/core/gates.ts` | MODIFY — Call appendAuditEntry after each gate |
| `sf_cli/src/core/micro-gates.ts` | MODIFY — Call appendAuditEntry after each micro-gate |
| `.gitignore` | MODIFY — Add `.skillfoundry/audit.jsonl` |
