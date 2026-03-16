# STORY-007: Incremental Pipeline (sf run --diff)

**Phase:** 2 — Performance
**PRD:** phase3-make-it-the-standard
**Priority:** SHOULD
**Effort:** M
**Status:** READY
**Dependencies:** STORY-006
**Blocks:** STORY-013
**Affects:** FR-007

---

## Description

Add an `--diff` flag to `sf run` that evaluates only stories whose associated files have changed since the last successful pipeline run. This is powered by comparing the current Git working tree against the commit SHA stored from the last successful run (recorded in `.skillfoundry/last-success.json`). Stories with no file changes are marked as "skipped (cached)" in the pipeline report. Combined with file-hash gate caching (STORY-006), this makes incremental pipeline runs extremely fast for small changes.

---

## Acceptance Contract

**done_when:**
- [ ] `sf run --diff` executes only stories with files changed since the last successful run
- [ ] The last successful run is recorded in `.skillfoundry/last-success.json` with: `{ runId, commitSha, timestamp, prdId }`
- [ ] Changed files are detected via `git diff --name-only <lastSuccessCommit>..HEAD`
- [ ] A story is considered "changed" if any file it touches (from the story's "Files Affected" section) appears in the diff
- [ ] Stories with no changed files are skipped and reported as "skipped (unchanged since <commitSha>)"
- [ ] If no `last-success.json` exists, `--diff` falls back to running all stories (first run)
- [ ] If the Git working tree has uncommitted changes, those files are also included in the change set
- [ ] `sf run --diff --base <commitSha>` allows overriding the base commit for comparison
- [ ] After a successful `--diff` run, `last-success.json` is updated with the current commit SHA
- [ ] After a failed `--diff` run, `last-success.json` is NOT updated (preserving the last known-good state)
- [ ] Pipeline report clearly distinguishes skipped-unchanged stories from skipped-failed stories
- [ ] Unit tests in `sf_cli/src/__tests__/incremental-pipeline.test.ts` cover: first run (no last-success), incremental with changes, incremental with no changes (all skipped), base override, failed run does not update last-success

**fail_when:**
- `sf run --diff` re-evaluates a story whose files are unchanged since the last successful run
- `sf run --diff` skips a story whose files have changed since the last successful run
- A failed pipeline run updates `last-success.json` (should only update on success)
- `--diff` with no last-success.json causes an error instead of falling back to full run

---

## Technical Approach

### Last Success Tracking

`sf_cli/src/core/incremental.ts`:

```typescript
interface LastSuccess {
  runId: string;
  commitSha: string;
  timestamp: string;
  prdId: string;
}

function readLastSuccess(workDir: string): LastSuccess | null {
  const path = join(workDir, '.skillfoundry', 'last-success.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function writeLastSuccess(workDir: string, success: LastSuccess): void {
  const dir = join(workDir, '.skillfoundry');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'last-success.json'), JSON.stringify(success, null, 2));
}
```

### Changed File Detection

```typescript
function getChangedFiles(workDir: string, baseSha: string): string[] {
  // Committed changes since base
  const committed = execSync(`git diff --name-only ${baseSha}..HEAD`, { cwd: workDir, encoding: 'utf-8' })
    .trim().split('\n').filter(Boolean);

  // Uncommitted changes (staged + unstaged)
  const uncommitted = execSync('git diff --name-only HEAD', { cwd: workDir, encoding: 'utf-8' })
    .trim().split('\n').filter(Boolean);

  const staged = execSync('git diff --name-only --cached', { cwd: workDir, encoding: 'utf-8' })
    .trim().split('\n').filter(Boolean);

  return [...new Set([...committed, ...uncommitted, ...staged])];
}
```

### Story-to-File Mapping

Parse each story's "Files Affected" section to extract file paths. A story is "changed" if any of its affected files appear in the change set. The story parser already exists in `pipeline.ts`; extend it to extract file paths from the markdown table.

### Pipeline Integration

In `pipeline.ts`, modify the story execution loop:

```typescript
if (options.diff) {
  const lastSuccess = readLastSuccess(workDir);
  const baseSha = options.base ?? lastSuccess?.commitSha;

  if (!baseSha) {
    logger.info('No previous successful run found. Running all stories.');
  } else {
    const changedFiles = getChangedFiles(workDir, baseSha);
    stories = stories.filter(story => {
      const affected = extractAffectedFiles(story);
      const isChanged = affected.some(f => changedFiles.includes(f));
      if (!isChanged) {
        logger.info(`Skipping ${story.file} (unchanged since ${baseSha.slice(0, 8)})`);
      }
      return isChanged;
    });
  }
}
```

After a successful run, call `writeLastSuccess()`. After a failed run, do not update.

---

## Files Affected

| File | Action |
|------|--------|
| `sf_cli/src/core/incremental.ts` | CREATE — Last success tracking, changed file detection, story filtering |
| `sf_cli/src/__tests__/incremental-pipeline.test.ts` | CREATE — Unit tests |
| `sf_cli/src/core/pipeline.ts` | MODIFY — Integrate `--diff` flag, story filtering, last-success updates |
| `.gitignore` | MODIFY — Add `.skillfoundry/last-success.json` |
