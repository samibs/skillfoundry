# PRD: Streaming Diff Preview & Approval Flow

---
prd_id: diff-preview-approval
title: Streaming Diff Preview & Approval Flow
version: 1.0
status: DRAFT
created: 2026-02-23
author: The Forge
last_updated: 2026-02-23

dependencies:
  requires: [skillfoundry-cli-platform]
  recommends: []
  blocks: []
  shared_with: []

tags: [ux, safety, core]
priority: medium
layers: [frontend]
---

---

## 1. Overview

### 1.1 Problem Statement

When the AI agent writes a file via the `write` tool, the change is applied immediately after permission approval — but the user only sees "Write file: path" in the permission prompt. There's no preview of what will change. For existing files, the user has no way to see the diff before approving. This is dangerous for destructive modifications and violates the "measure twice, cut once" principle.

### 1.2 Proposed Solution

Before any write tool execution, compute a diff between the current file content and the proposed content. Show a colorized inline diff in the terminal using the existing `DiffPreview.tsx` component. Offer `[Y]es / [N]o / [E]dit` options. "Edit" opens the proposed content in `$EDITOR` before writing. This completes CLI Platform STORY-003.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| File writes with diff preview | 0% | 100% of existing file overwrites | Code audit |
| User approval before destructive writes | Partial (name only) | Full (content diff visible) | UX testing |

---

## 2. User Stories

| ID | As a... | I want to... | So that... | Priority |
|----|---------|--------------|------------|----------|
| US-001 | developer | see a colorized diff before file writes | I know exactly what will change | MUST |
| US-002 | developer | reject writes that look wrong | bad changes don't touch my code | MUST |
| US-003 | developer | edit proposed changes before applying | I can fix small issues inline | SHOULD |
| US-004 | developer | skip diff preview for new files | new file creation isn't slowed down | SHOULD |

---

## 3. Implementation Plan

| File | Change |
|------|--------|
| `src/core/executor.ts` | Before write: read existing file, compute diff, return diff for preview |
| `src/components/DiffPreview.tsx` | Enhance to support inline approve/reject/edit |
| `src/hooks/useStream.ts` | Intercept write tool calls, show diff before execution |
| `src/components/PermissionPrompt.tsx` | Add diff context to write tool permission prompts |

### Effort: Medium (3-4 hours)

---

## 4. Out of Scope

- Diff preview for bash commands (too complex to predict)
- Three-way merge for concurrent edits
- Undo history for applied diffs
