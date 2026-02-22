# PRD Templates Library

Quick-start templates for common project types. Copy one to `genesis/` and fill in the blanks.

## Available Templates

| Template | File | Best For |
|----------|------|----------|
| **Full PRD** | `../TEMPLATE.md` | Complete PRDs with all sections (recommended) |
| **API Service** | `api-service.md` | REST APIs, microservices, backend services |
| **CLI Tool** | `cli-tool.md` | Command-line tools, automation scripts |
| **Full-Stack Feature** | `fullstack-feature.md` | Features spanning DB + Backend + Frontend |
| **Dashboard** | `dashboard.md` | Data visualization, analytics dashboards |

## Usage

```bash
# Copy a template to genesis/ and start editing
cp genesis/TEMPLATES/api-service.md genesis/2026-02-09-my-api.md

# Or use the /prd command to generate one from a description
/prd "Build a REST API for user management"
```

## Template Philosophy

- **Start small**: These templates are lighter than the full TEMPLATE.md
- **Expand as needed**: Add sections from the full template when you need them
- **PRD quality gates still apply**: All templates must pass validation before `/go`

---

*The Forge — SkillFoundry Framework*
