# STORY-003: Docusaurus Site Setup

**Phase:** B — Documentation Site
**PRD:** phase1-make-it-reachable
**Priority:** MUST
**Effort:** M
**Dependencies:** STORY-001 (GitHub Actions needed for deploy workflow)
**Affects:** FR-005, US-003

---

## Description

Migrate the existing `site/` directory from 20 static HTML pages to a Docusaurus 3 project. Preserve all existing content, add sidebar navigation, dark/light mode, and a GitHub Pages deployment workflow.

---

## Scope

### Files to create:
- `site-docusaurus/docusaurus.config.ts` — Main configuration
- `site-docusaurus/sidebars.ts` — Sidebar navigation structure
- `site-docusaurus/package.json` — Dependencies
- `site-docusaurus/tsconfig.json` — TypeScript config
- `site-docusaurus/src/pages/index.tsx` — Landing page (migrated from site/index.html)
- `site-docusaurus/src/css/custom.css` — Custom styles (migrated from site/styles.css)
- `site-docusaurus/docs/intro.md` — Docs landing page
- `site-docusaurus/static/` — Static assets (robots.txt, sitemap, OG image)
- `.github/workflows/deploy-site.yml` — GitHub Pages deployment

### Files to archive:
- `site/` — Renamed to `site-legacy/` for reference during migration, then deleted after verification

### Files to modify:
- `package.json` (root) — Add `docs:dev` and `docs:build` scripts

---

## Technical Approach

### Docusaurus configuration: `site-docusaurus/docusaurus.config.ts`

```typescript
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'SkillFoundry',
  tagline: 'Quality gates your AI can\'t skip',
  favicon: 'img/favicon.ico',
  url: 'https://samibs.github.io',
  baseUrl: '/skillfoundry/',
  organizationName: 'samibs',
  projectName: 'skillfoundry',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/samibs/skillfoundry/tree/main/site-docusaurus/',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'SkillFoundry',
      items: [
        { type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Docs' },
        { href: 'https://github.com/samibs/skillfoundry', label: 'GitHub', position: 'right' },
        { href: 'https://www.npmjs.com/package/skillfoundry', label: 'npm', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting Started', to: '/docs/getting-started' },
            { label: 'Architecture', to: '/docs/architecture' },
            { label: 'Configuration', to: '/docs/configuration' },
          ],
        },
        {
          title: 'Community',
          items: [
            { label: 'GitHub', href: 'https://github.com/samibs/skillfoundry' },
            { label: 'Issues', href: 'https://github.com/samibs/skillfoundry/issues' },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} SBS. MIT License.`,
    },
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
```

### Key decisions:

1. **New directory `site-docusaurus/`**: Created alongside `site/` to avoid disruption. Once verified, `site/` is archived.
2. **Dark mode default**: Matches the project's dashboard-first aesthetic. Respects system preference.
3. **GitHub Pages deploy**: Separate workflow `deploy-site.yml` triggers on push to `main` when `site-docusaurus/` files change.
4. **TypeScript config**: Docusaurus 3 supports TS config natively. Consistent with the rest of the project.
5. **Edit URL**: Points to the site source in the repo so contributors can fix docs via GitHub.

### GitHub Pages deployment: `.github/workflows/deploy-site.yml`

```yaml
name: Deploy Docs

on:
  push:
    branches: [main]
    paths:
      - 'site-docusaurus/**'

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: site-docusaurus/package-lock.json
      - run: cd site-docusaurus && npm ci && npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: site-docusaurus/build

  deploy:
    needs: build
    runs-on: ubuntu-24.04
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

### Content migration plan:

| Existing page (site/) | Docusaurus location | Type |
|----------------------|---------------------|------|
| index.html | src/pages/index.tsx | React page (landing) |
| pages/*.html (20 pages) | docs/*.md | Markdown doc pages |
| styles.css | src/css/custom.css | CSS (adapted for Docusaurus theme) |
| robots.txt, sitemap.xml | static/ | Static files |
| og-image.svg | static/img/ | Static asset |

The existing HTML content is converted to Markdown. Interactive elements (if any) are preserved as MDX components.

---

## Acceptance Criteria

```gherkin
Scenario: Docusaurus dev server starts
  Given a developer is in the site-docusaurus/ directory
  When they run "npm start"
  Then the dev server starts on localhost:3000
  And the landing page renders with the SkillFoundry branding

Scenario: All existing content migrated
  Given the site/ directory had 20 HTML pages
  When the Docusaurus site is built
  Then all 20 pages of content are accessible in the new site
  And no content is lost or placeholder

Scenario: Dark mode enabled by default
  Given a user visits the Docusaurus site
  When the page loads
  Then dark mode is the default color scheme
  And a toggle exists to switch to light mode

Scenario: Sidebar navigation works
  Given a user is on any docs page
  When they look at the left sidebar
  Then they see a structured navigation with sections for Getting Started, Architecture, Configuration, and Recipes

Scenario: GitHub Pages deployment
  Given changes are pushed to main in site-docusaurus/
  When the deploy workflow triggers
  Then the site is built and deployed to GitHub Pages
  And the site is accessible at https://samibs.github.io/skillfoundry/

Scenario: Docusaurus build succeeds
  Given all docs content is in place
  When "npm run build" is executed
  Then the build completes in under 60 seconds
  And the output is in site-docusaurus/build/
  And "onBrokenLinks: throw" catches any dead links
```

---

## Security Checklist

- [ ] No secrets or tokens in Docusaurus config
- [ ] `editUrl` points to public repo (no private URLs)
- [ ] GitHub Pages deployment uses OIDC (`id-token: write`), not PAT

---

## Testing

- Run `npm start` locally and verify all pages render
- Run `npm run build` and verify zero broken links
- Verify dark/light mode toggle works
- Verify sidebar navigation matches the planned structure
- Deploy to a fork's GitHub Pages to verify the deployment workflow
