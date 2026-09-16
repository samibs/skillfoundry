# plain-language-ui

Enforces that every screen, field and button explains itself to a first-day user.
Two modes: **pre-build gate** and **post-build audit**. Zero dependencies (Python 3.8+ stdlib).

## Install — Claude Code (per repo)

```bash
mkdir -p .claude/skills
cp -r plain-language-ui .claude/skills/
cat plain-language-ui/assets/CLAUDE.md.snippet >> CLAUDE.md
```
Claude Code now reads the rule on every session in that repo. Optional pre-commit gate:

```bash
# .git/hooks/pre-commit  (or lefthook / husky)
python .claude/skills/plain-language-ui/scripts/audit_labels.py . --out ui-audit --min-severity high || {
  echo "Plain-language audit failed — see ui-audit/report.md"; exit 1; }
```

## Install — Claude.ai / Cowork

Upload `plain-language-ui.skill` (or the folder) via Settings → Skills, or click **Save skill**
on the file card. It triggers automatically on any UI build/audit request.

## Run the audit by hand

```bash
python scripts/audit_labels.py path/to/repo --out ui-audit
python scripts/audit_labels.py path/to/repo --stack angular --min-severity medium
python scripts/audit_labels.py path/to/repo --glossary my-project-terms.md --allow allow.txt
```
Outputs `ui-audit/report.md` (read this) and `ui-audit/report.json` (for tooling / CI).
Exit code is 1 when any high-severity finding exists, so it can gate CI.

## Layout
```
SKILL.md                              workflow, both modes, checklist
references/screen-brief-template.md   WHO / GOAL / AFTER template + examples
references/label-rules.md             the Stranger Test, FR/EN before/after tables
references/glossary-lu-compliance.md  terms the crawler flags — extend freely
references/angular-dotnet.md          where labels live + idiomatic fixes (Material, Formly, i18n, .NET)
references/react-nextjs.md            same for React / Next.js (shadcn, RHF, zod, next-intl)
scripts/audit_labels.py               the crawler
assets/CLAUDE.md.snippet              paste into repo CLAUDE.md
```
