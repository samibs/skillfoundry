# STORY-005: Configuration Reference + Recipes

**Phase:** B — Documentation Site
**PRD:** phase1-make-it-reachable
**Priority:** MUST
**Effort:** M
**Dependencies:** STORY-003 (Docusaurus site must be set up)
**Affects:** FR-008, FR-009, US-003

---

## Description

Create a comprehensive Configuration Reference page documenting every option in `skillfoundry.config.ts` and `.skillfoundry/config.toml`, and three recipe pages for common integration scenarios: Next.js, TypeScript monorepo, and Azure DevOps pipeline.

---

## Scope

### Files to create:
- `site-docusaurus/docs/configuration.md` — Full configuration reference
- `site-docusaurus/docs/recipes/nextjs.md` — Next.js integration recipe
- `site-docusaurus/docs/recipes/typescript-monorepo.md` — TypeScript monorepo recipe
- `site-docusaurus/docs/recipes/azure-devops.md` — Azure DevOps pipeline recipe

### Files to modify:
- `site-docusaurus/sidebars.ts` — add Configuration and Recipes sections

### Files to read (source of truth for config options):
- `sf_cli/src/core/` — all config parsing logic
- `.skillfoundry/config.toml` examples in install.sh
- `CLAUDE.md` — references to config options

---

## Technical Approach

### Configuration Reference Structure

```markdown
# Configuration Reference

## Config File Locations

| File | Purpose | Format |
|------|---------|--------|
| `.skillfoundry/config.toml` | Project-level settings | TOML |
| `skillfoundry.config.ts` | Programmatic config (advanced) | TypeScript |

## All Options

### [gates]

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `gates.enabled` | boolean | `true` | Enable/disable all gate checks |
| `gates.timeout` | number | `30` | Gate execution timeout in seconds |
| `gates.lint` | boolean | `true` | Run lint gate |
| `gates.typecheck` | boolean | `true` | Run type-checking gate |
| `gates.test` | boolean | `true` | Run test gate |
| `gates.security` | boolean | `true` | Run security scan gate |
| `gates.dependencies` | boolean | `true` | Run dependency scan gate |

### [telemetry]
...

### [forge]
...

### [memory]
...
```

Each option includes:
- **Type**: The TypeScript/TOML type
- **Default**: The value if not specified
- **Description**: What it controls
- **Example**: A snippet showing usage
- **Since**: Version when the option was added

### Recipe Structure (each recipe follows the same format):

```markdown
# Recipe: [Stack Name]

## Prerequisites
- What the user already has

## Step 1: Install SkillFoundry
- Stack-specific install instructions

## Step 2: Configure for [Stack]
- Relevant config options
- Stack-specific settings

## Step 3: Integrate with [Stack's tooling]
- How it fits into the existing workflow
- CI/CD integration if applicable

## Step 4: Verify
- Run a pipeline
- Check gates pass

## Troubleshooting
- Common issues with this stack
```

### Recipe: Next.js project

Covers:
- Installing SkillFoundry in a Next.js project root
- Configuring gates for Next.js lint (`next lint`), TypeScript strict mode, and Jest/Vitest tests
- Integrating with `next build` in CI
- Example `.skillfoundry/config.toml` tuned for Next.js

### Recipe: TypeScript monorepo

Covers:
- Installing at the monorepo root (not per-package)
- Configuring gates to scan all packages
- Handling multiple `tsconfig.json` files
- Using `--path` flag for per-package baseline
- Example for Turborepo / nx workspace

### Recipe: Azure DevOps pipeline

Covers:
- Adding SkillFoundry to `azure-pipelines.yml`
- Running gates as a pipeline step
- Publishing telemetry artifacts
- Using `sf report --html` as a pipeline artifact for review
- Example YAML for a build + gate pipeline

---

## Acceptance Criteria

```gherkin
Scenario: Configuration reference covers all options
  Given a developer visits the Configuration Reference page
  When they search for any option available in config.toml or skillfoundry.config.ts
  Then the option is documented with type, default, description, and example

Scenario: Configuration reference has no placeholder values
  Given the Configuration Reference is reviewed
  When each option is checked
  Then no option has a description of "TBD", "TODO", or "coming soon"

Scenario: Next.js recipe results in working integration
  Given a developer has a Next.js project
  When they follow the Next.js recipe step by step
  Then SkillFoundry gates run against the Next.js project
  And lint, type, and test gates pass (or report real issues)

Scenario: TypeScript monorepo recipe handles multiple packages
  Given a developer has a Turborepo/nx monorepo
  When they follow the monorepo recipe
  Then SkillFoundry runs gates across all packages
  And baseline metrics capture the full monorepo

Scenario: Azure DevOps recipe provides working YAML
  Given a developer uses Azure DevOps for CI/CD
  When they copy the pipeline YAML from the recipe
  Then the pipeline runs SkillFoundry gates as a build step
  And the HTML report is published as a pipeline artifact

Scenario: Sidebar shows Configuration and Recipes sections
  Given a user navigates to the Docusaurus site
  When they open the docs sidebar
  Then "Configuration" appears under the main section
  And "Recipes" appears as a collapsible section with three sub-items
```

---

## Security Checklist

- [ ] No real Azure DevOps PATs or tokens in recipe examples
- [ ] Recipe examples use placeholder names (e.g., `my-nextjs-app`, `my-org`)
- [ ] No npm tokens or secrets in any config example

---

## Testing

- Verify every option in the configuration reference exists in the actual codebase
- Follow each recipe from scratch in a test project to confirm it works
- Run Docusaurus build to verify no broken links in new pages
