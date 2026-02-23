# PRD: Security Hardening Pass

---
prd_id: security-hardening
title: Security Hardening — Placeholder Keys, Bash Validation, Symlinks, Redaction
version: 1.0
status: DRAFT
created: 2026-02-23
author: The Forge
last_updated: 2026-02-23

dependencies:
  requires: []
  recommends: []
  blocks: []
  shared_with: []

tags: [security, core, critical]
priority: high
layers: [backend]
---

---

## 1. Overview

### 1.1 Problem Statement

Security audit identified 4 concrete gaps: (1) OpenAI adapter uses a placeholder API key `sk-placeholder-configure-via-env` that could leak in error messages. (2) Bash commands are validated at the permission layer but NOT at the execution layer — defense-in-depth violation. (3) Path validation uses `resolve()` which follows symlinks, allowing `/allowed/link -> /forbidden/file` bypasses. (4) Redaction patterns miss Bearer tokens, JWTs, and database connection URIs.

### 1.2 Proposed Solution

Four surgical fixes: (a) Throw on missing API key instead of using placeholder. (b) Add DANGEROUS_PATTERNS check inside `executeBash()`. (c) Use `lstatSync()` to detect and block symlinks. (d) Extend REDACT_PATTERNS with Bearer, JWT, and DB URI patterns.

### 1.3 Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Placeholder API keys in codebase | 1 | 0 | Grep for 'placeholder' |
| Bash validation layers | 1 (permissions) | 2 (permissions + executor) | Code audit |
| Symlink traversal protection | None | Block all symlinks | Test with symlink |
| Redaction pattern coverage | 7 patterns | 12+ patterns | Count in redact.ts |

---

## 2. Functional Requirements

| ID | Requirement | Acceptance Criteria |
|----|-------------|---------------------|
| FR-001 | Remove placeholder API key | Given no API key is configured, When OpenAI provider is constructed, Then throw descriptive error immediately |
| FR-002 | Executor-level bash validation | Given a dangerous bash command, When it reaches executeBash(), Then it is blocked even if permissions layer missed it |
| FR-003 | Symlink blocking | Given a file path that is a symlink, When read/write/glob is attempted, Then block with "symlinks not allowed" error |
| FR-004 | Extended redaction | Given text containing Bearer tokens, JWTs, or DB URIs, When redaction is enabled, Then they are replaced with [REDACTED] |

---

## 3. Implementation Plan

| File | Change |
|------|--------|
| `src/core/providers/openai.ts` | Throw Error on missing API key instead of using placeholder |
| `src/core/executor.ts` | Add DANGEROUS_PATTERNS check in executeBash(); add lstatSync symlink check in isPathAllowed() |
| `src/core/redact.ts` | Add Bearer, JWT, DB URI, and generic token patterns |
| `src/__tests__/executor.test.ts` | Add dangerous command and symlink tests |
| `src/__tests__/redact.test.ts` | Add Bearer/JWT/DB URI test cases |

### Effort: Small (1-2 hours)

---

## 4. Out of Scope

- Sandboxed bash execution (VM/subprocess isolation)
- Full OWASP scanning pipeline
- Network-level security controls
