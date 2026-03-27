# Known LLM Deviation Patterns — Git/DevOps

> Per-category extract from _known-deviations.md. Full catalog: agents/_known-deviations.md

---

## CATEGORY 5: Git/DevOps Deviations

| ID | Pattern | Prevention | Agent |
|----|---------|------------|-------|
| GIT-001 | Committing .env files | Add `.env` to `.gitignore`. Provide `.env.example` with placeholders | devops, security |
| GIT-002 | Committing node_modules | Add `node_modules/` to `.gitignore` | devops |
| GIT-003 | Committing dist/build artifacts | Add `dist/`, `build/`, `.next/` to `.gitignore` | devops |
| GIT-004 | No .gitignore | Create `.gitignore` at project init. Include standard exclusions | devops |
| GIT-005 | Force pushing to main/master | NEVER `git push --force` to main. Use feature branches | devops |
| GIT-006 | Skipping cache cleanup during rebuild | ALWAYS `rm -rf .next node_modules/.cache` before `npm run build` | sre, devops |
| GIT-007 | Not using conventional commits | Format: `type(scope): description` — feat, fix, chore, docs, refactor, test | docs |
