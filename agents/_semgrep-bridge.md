# Semgrep Bridge Protocol

> **CORE FRAMEWORK MODULE**
> Integrates real Semgrep static analysis alongside LLM security checks.
> Semgrep findings are HARD blocks. LLM findings are advisory.
> Referenced by: `security`, `feature-lifecycle` (Stage 3), `gate-keeper`, `forge` (Phase 4)

---

## Purpose

An LLM following a markdown rule ("don't store tokens in localStorage") is not the same as a static analysis rule that actually detects it. The Semgrep Bridge runs real Semgrep rules when Semgrep is available, and promotes those findings to HARD BLOCK status. LLM security analysis remains active but as a complementary layer — catching semantic and business-logic issues that pattern matching cannot.

---

## Availability Detection

```bash
# Check if Semgrep is installed
which semgrep >/dev/null 2>&1 && echo "SEMGREP=available" || echo "SEMGREP=unavailable"

# Check version
semgrep --version 2>/dev/null | head -1

# Check if custom rules exist
ls .claude/semgrep-rules/ >/dev/null 2>&1 && echo "CUSTOM_RULES=yes" || echo "CUSTOM_RULES=no"
ls config/semgrep-rules/ >/dev/null 2>&1 && echo "FRAMEWORK_RULES=yes" || echo "FRAMEWORK_RULES=no"
```

If Semgrep is unavailable:
```
ℹ️  Semgrep not installed. Security checks running in LLM-only mode.
    For hard-block enforcement, install Semgrep: pip install semgrep
    Framework rules available at: config/semgrep-rules/
```

No blocking — security analysis continues in LLM-only mode.

---

## Rule Sources (Priority Order)

1. **Project-local rules** — `.semgrep/` or `.claude/semgrep-rules/` (project-specific overrides)
2. **SkillFoundry framework rules** — `config/semgrep-rules/` (BPSBS critical patterns)
3. **Semgrep registry** — `p/owasp-top-ten`, `p/jwt`, `p/secrets` (pulled on demand)

---

## Execution

When Semgrep is available, run against all modified files (from feature-lifecycle or gate-keeper context):

```bash
# Run framework rules (always)
semgrep --config config/semgrep-rules/ \
        --json \
        --output .claude/semgrep-results.json \
        [modified_files...]

# Run OWASP rules if connected
semgrep --config p/owasp-top-ten \
        --json \
        --output .claude/semgrep-owasp.json \
        [modified_files...] 2>/dev/null || true

# Run JWT rules if auth files modified
semgrep --config p/jwt \
        --json \
        --output .claude/semgrep-jwt.json \
        [auth_files...] 2>/dev/null || true
```

Timeout: 60 seconds per ruleset. On timeout → log warning, continue with LLM-only for that ruleset.

---

## Result Parsing

Parse `.claude/semgrep-results.json`:

```json
{
  "results": [
    {
      "check_id": "bpsbs.localstorage-token",
      "path": "src/auth/login.ts",
      "start": { "line": 42, "col": 5 },
      "extra": {
        "message": "Auth token stored in localStorage — XSS vulnerable",
        "severity": "ERROR",
        "metadata": { "category": "security", "cwe": "CWE-922" }
      }
    }
  ]
}
```

---

## Finding Classification

| Semgrep Severity | Bridge Action | Blocks Gate? |
|-----------------|---------------|-------------|
| `ERROR` | HARD BLOCK — cannot proceed | ✅ YES |
| `WARNING` | Logged + shown to evaluator | ❌ NO (advisory) |
| `INFO` | Logged only | ❌ NO |

LLM security findings remain advisory regardless of severity — they augment, not override.

---

## Report Format

```
SEMGREP SECURITY SCAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Rules run:    config/semgrep-rules/ (BPSBS critical)
Files scanned: 7
Duration:     2.3s

HARD BLOCKS (ERROR severity — gate cannot pass)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. bpsbs.localstorage-token
   File: src/auth/login.ts:42
   Rule: Auth token stored in localStorage — XSS vulnerable
   CWE:  CWE-922 (Insecure Storage of Sensitive Information)
   Fix:  Move token to HttpOnly cookie or memory-only storage

WARNINGS (advisory — gate can pass with documented tradeoff)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. bpsbs.console-log-unguarded
   File: src/auth/auth.service.ts:18
   Rule: console.log not guarded by debug flag
   Fix:  Wrap in if (process.env.DEBUG) or use logger

CLEAN: No ERROR-level findings in 5 other files

GATE DECISION: ⛔ BLOCKED (1 hard block must be resolved)
```

---

## Integration Points

### In `feature-lifecycle` Stage 3 (Challenge)

Run Semgrep before the LLM evaluator:
1. Semgrep hard blocks → generate fix brief → dispatch to coder → re-scan
2. Only after zero hard blocks → proceed to LLM evaluator

Semgrep blocks are never overridable with `--override`. The `--override` flag applies only to LLM evaluator findings.

### In `gate-keeper`

Add Semgrep as a T2 gate check (before T3 self-adversarial review). Hard blocks fail the gate unconditionally.

### In `forge` Phase 4 (Inspect)

Run Semgrep on all modified files from Phase 2. Hard blocks halt Phase 4. Advisory findings are included in the security report.

---

## Semgrep Not Installed — Fallback Behavior

When Semgrep is unavailable, LLM security review runs without change. Gate decisions are based on LLM findings only.

Add a standing notice to all security reports:
```
ℹ️  SEMGREP NOT ACTIVE — findings are LLM analysis only.
    Install Semgrep for pattern-matched hard-block enforcement.
```

---

*Semgrep Bridge Protocol v1.0.0 — SkillFoundry Framework*
*Hard blocks from real analysis. Advisory from LLM. Never conflate the two.*
