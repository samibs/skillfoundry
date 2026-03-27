# Known LLM Deviation Patterns — Supply Chain & Dependencies

> Per-category extract from _known-deviations.md. Full catalog: agents/_known-deviations.md

---

## CATEGORY 12: Supply Chain & Dependency Deviations

> 20% of AI-generated code recommends non-existent packages. 5.2% of commercial model suggestions are hallucinated.

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| SUPPLY-001 | Hallucinated package names (slopsquatting) | VERIFY every `npm install` / `pip install` suggestion exists on the registry BEFORE installing. Check npmjs.com or pypi.org | coder, security |
| SUPPLY-002 | Outdated packages with known CVEs | Run `npm audit` / `pip audit` after installing. Check last publish date — abandoned packages are risky | dependency-auditor |
| SUPPLY-003 | Unnecessary dependencies for simple tasks | Don't add a package for something achievable in 5 lines of code. `left-pad` syndrome | coder |
| SUPPLY-004 | Missing lockfile commitment | ALWAYS commit package-lock.json / yarn.lock / pnpm-lock.yaml for reproducible builds | devops |
| SUPPLY-005 | Wildcard versions in package.json | NEVER use `"*"` or `"latest"`. Pin major version: `"^4.17.0"` | coder, dependency-auditor |
| SUPPLY-006 | Dev dependencies in production bundle | Separate devDependencies from dependencies. Don't ship test frameworks to production | coder, devops |
| SUPPLY-007 | Importing deprecated or replaced packages | Check if package has a successor (e.g., `request` → `node-fetch`, `moment` → `dayjs`) | coder |
