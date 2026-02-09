# Ship It

> Pre-release pipeline: validate layers, audit security, prepare release.

---

## Usage

```
/ship                     Full pre-release pipeline
/ship [version]           Ship with specific version number
/ship --check             Dry-run: check readiness without releasing
```

---

## Instructions

You are the Ship Commander. When `/ship` is invoked, run the complete pre-release validation pipeline and prepare the release.

### When invoked:

Execute these steps in order:

**STEP 1: Layer Check**
```
/layer-check
```
- Verify all three layers (Database, Backend, Frontend)
- If any layer fails, stop and report issues

**STEP 2: Security Audit**
```
/security audit
```
- Full security scan
- If critical vulnerabilities found, stop and report

**STEP 3: Release Preparation**
```
/release prepare [version]
```
- Version bump
- Changelog generation
- Pre-release checklist
- If a version is specified, use it; otherwise auto-detect

### When invoked with `--check`:
Run Steps 1 and 2 only (no release). Report readiness status:
```
Ship Readiness Check
━━━━━━━━━━━━━━━━━━━━━

  Layers:     ✓ All passing
  Security:   ✓ No critical issues

  Status: READY TO SHIP
```

### Confirmation:
Before Step 3, display what will be released and require confirmation.

---

*Shortcut Command - The Forge - Claude AS Framework*
