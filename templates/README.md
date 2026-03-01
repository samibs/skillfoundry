# Project Templates - SkillFoundry Framework

Pre-filled PRD templates by project type. Used by `scripts/wizard.sh` and the `/prd` agent.

## Available Templates

| Template | File | Use When |
|----------|------|----------|
| **Web Application** | `prd-web-app.md` | Building a frontend + backend app with auth, DB, and UI |
| **REST API** | `prd-api.md` | Building a backend-only API service with endpoints and auth |
| **CLI Tool** | `prd-cli.md` | Building a command-line application with argument parsing |
| **Library/Package** | `prd-library.md` | Building a reusable library for distribution |

## Usage

### Via Wizard (Interactive)

```bash
scripts/wizard.sh
# Select project type → template is auto-applied
```

### Via /prd Agent

```
/prd "My Feature Name"
# Agent references templates as starting points
```

### Manual

```bash
# Copy template to genesis/
cp templates/prd-web-app.md genesis/my-project-initial.md
# Edit with your project details
```

## Template Variables

Templates use these placeholders for substitution:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{PROJECT_NAME}}` | Project name | My Dashboard |
| `{{PROJECT_DESC}}` | Brief description | A real-time monitoring dashboard |
| `{{DATE}}` | Creation date | 2026-02-06 |
| `{{TECH_STACK}}` | Selected tech stack | react\|fastapi |

## Template Structure

Each template follows the full PRD structure from `genesis/TEMPLATE.md` but with:

- Pre-filled user stories relevant to the project type
- Pre-populated security requirements appropriate per type
- Suggested architecture patterns
- Pre-filled non-functional requirements with performance budgets
- Tech stack suggestions aligned with BPSBS preferences
- Project-type-specific contract specification examples

## Extending

To add a new template:

1. Copy an existing template as a starting point
2. Modify the pre-filled sections for your project type
3. Keep the same section structure (matches `genesis/TEMPLATE.md`)
4. Add the template to this README

---

**Framework Version**: 1.7.0.1
