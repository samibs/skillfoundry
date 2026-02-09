# The Anvil — Tier 2: Canary Smoke Test

**Version**: 1.0
**Status**: ACTIVE
**Applies To**: Story Execution Pipeline (after Coder, before Tester)
**Protocol**: See `agents/_anvil-protocol.md` for overview

---

## Purpose

Run ONE quick smoke test after the Coder finishes, before invoking the full Tester. This catches fundamental breakage — code that won't import, won't compile, or has fatal runtime errors — saving the cost of a full test suite on broken code.

**Principle**: Don't send broken code to the Tester. If it can't even import, there's nothing to test.

---

## When to Run

- After Coder completes implementation
- Before Tester is invoked
- After Anvil T1 (shell pre-flight) passes

If T1 already detected syntax errors, T2 is skipped (code is already blocked).

---

## Canary Tests by Layer

### Backend — Python

```bash
# Can the main module import?
python3 -c "from <module_path> import <main_class_or_function>; print('CANARY: OK')"
```

**Pass**: Prints "CANARY: OK" with exit code 0.
**Fail**: Import error, syntax error, or missing dependency.

### Backend — Node.js

```bash
# Can the main module be required?
node -e "require('./<module_path>'); console.log('CANARY: OK')"
```

### Backend — C# / .NET

```bash
# Does the project compile?
dotnet build --nologo --no-restore 2>&1 | tail -5
```

**Pass**: Build succeeded.
**Fail**: Compilation errors.

### Frontend — JavaScript/TypeScript

```bash
# Can the component file parse?
node --check <component_file>.js 2>&1
# OR for TypeScript (if tsc available):
npx tsc --noEmit <component_file>.ts 2>&1
```

### Database — Migration

```bash
# Does the migration file parse as valid SQL?
# For Python ORMs:
python3 -c "import ast; ast.parse(open('<migration_file>').read()); print('CANARY: OK')"
# For raw SQL:
# Check basic SQL structure (SELECT, CREATE, ALTER, INSERT keywords present)
```

### API Endpoint

```bash
# If a dev server is running, can we hit the new endpoint?
curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>/<endpoint>
# 2xx or 404 = server works (404 means route not registered yet)
# Connection refused = server not running (skip this check)
```

---

## Output Format

```markdown
ANVIL CHECK: T2 Canary Smoke Test — [module/endpoint]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Status: PASS / FAIL

Canary: [what was tested]
Result: [output or error message]

Action: CONTINUE / BLOCK
```

**Max output**: 50 tokens. Keep it minimal.

---

## Failure Handling

When the canary FAILS:

1. **Skip Tester entirely** — no point testing code that can't import
2. **Route to Fixer Orchestrator** with violation:
   ```json
   {
     "type": "canary_failure",
     "severity": "critical",
     "details": "[error message from canary]",
     "auto_fixable": true,
     "suggested_agent": "coder"
   }
   ```
3. Coder gets another attempt with the specific error message
4. After fix, re-run canary before proceeding to Tester

---

## What Canary Does NOT Check

- Logic correctness (that's the Tester's job)
- Edge cases (Tester)
- Performance (Performance agent)
- Security (Security agent)
- Test coverage (Gate-Keeper)

The canary answers ONE question: **"Can this code even run?"**

---

## Integration

### In go.md Pipeline

After Coder step, before Tester:
```
Coder -> ANVIL T1 -> ANVIL T2 (canary) -> Tester
                         |
                         └── FAIL? -> Skip Tester -> Fixer -> Coder (retry)
```

### In tester.md

Pre-condition: "Canary smoke test must pass before testing begins. If canary fails, reject with: **Canary smoke test failed — code cannot be tested until it compiles/imports.**"

---

*The Anvil T2 — If it can't import, it can't ship.*
