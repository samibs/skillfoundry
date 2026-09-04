---
description: Always-on pointer to the SkillFoundry governed multi-agent execution protocol.
alwaysApply: true
---

# SkillFoundry Multi-Agent Protocol

When operating as a parallel write agent or as an orchestrator, always read:

`/MULTI_AGENT_PROTOCOL.md`

Operational module: `agents/_governed-mission-protocol.md`. Enforcement: the `/mission` command.

## Hard rules

- **Do not write concurrently in another agent's worktree.** One worker = one git-native worktree
  = one branch. Verify with `git worktree list --porcelain`; a copied folder is not a worktree.
- **No source writes before attestation passes** — `/mission attest <ID>` then `/mission gate <ID>`.
- Use `.ai/ledger.json` as the execution-state authority and `.ai/patches/<work-item>.md` as the
  write plan. Do not hand-edit `.ai/*.json`.
- Record the exact base SHA, never a moving branch name.
- Own and stop every process you start. Never broadly kill `all node` / `all dotnet` / `all python`.
- Classify a failure's origin before changing code. An `ENVIRONMENT_DEFECT` is never fixed by
  editing product source.
- A commit is not acceptance. An integration is not a publication. A publication without remote
  verification is not proven.
