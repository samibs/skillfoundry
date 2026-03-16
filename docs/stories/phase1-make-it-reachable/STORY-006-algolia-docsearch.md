# STORY-006: Algolia DocSearch Integration

**Phase:** B — Documentation Site
**PRD:** phase1-make-it-reachable
**Priority:** SHOULD
**Effort:** S
**Dependencies:** STORY-004, STORY-005 (all doc content must exist before indexing)
**Affects:** FR-010, US-004

---

## Description

Integrate search into the Docusaurus site. Ship with a local search plugin immediately, then swap to Algolia DocSearch once the OSS application is approved.

---

## Scope

### Files to create:
- None (plugins installed via npm)

### Files to modify:
- `site-docusaurus/package.json` — add search plugin dependency
- `site-docusaurus/docusaurus.config.ts` — add search theme/plugin config

---

## Technical Approach

### Phase 1: Local search (immediate)

Install `@easyops-cn/docusaurus-search-local` as the search provider. This works offline, requires no external service, and indexes at build time.

```bash
cd site-docusaurus && npm install @easyops-cn/docusaurus-search-local
```

Add to `docusaurus.config.ts`:

```typescript
themes: [
  [
    '@easyops-cn/docusaurus-search-local',
    {
      hashed: true,
      language: ['en'],
      indexDocs: true,
      indexPages: true,
      highlightSearchTermsOnTargetPage: true,
    },
  ],
],
```

This provides a search bar in the navbar that searches all docs and pages client-side.

### Phase 2: Algolia DocSearch (after approval)

1. Apply at https://docsearch.algolia.com/apply/ with the GitHub Pages URL
2. Once approved, Algolia provides: `appId`, `apiKey` (search-only), `indexName`
3. Replace local search config with Algolia config:

```typescript
themeConfig: {
  algolia: {
    appId: 'ALGOLIA_APP_ID',
    apiKey: 'ALGOLIA_SEARCH_ONLY_KEY',
    indexName: 'skillfoundry',
    contextualSearch: true,
  },
},
```

4. Remove `@easyops-cn/docusaurus-search-local` from dependencies

### Key decisions:

1. **Ship local search first**: Algolia approval takes 1-2 weeks. Users should not wait for search.
2. **Search-only API key**: The Algolia `apiKey` in the config is a search-only key (safe to expose in client-side code). The admin key is never in the codebase.
3. **Contextual search**: When Algolia is active, `contextualSearch: true` narrows results to the current doc version.
4. **No custom UI**: Both local search and Algolia use Docusaurus's built-in search bar component.

---

## Acceptance Criteria

```gherkin
Scenario: Local search finds content
  Given the Docusaurus site is built with local search enabled
  When a user types "getting started" in the search bar
  Then results include the Getting Started guide
  And clicking a result navigates to the correct page

Scenario: Local search indexes all pages
  Given all docs pages exist (getting-started, architecture, configuration, 3 recipes)
  When the site is built
  Then the search index includes all pages
  And a search for any page title returns results

Scenario: Search bar is visible
  Given a user visits any page on the site
  When they look at the navbar
  Then a search bar (or search icon) is visible

Scenario: Algolia swap is non-breaking
  Given local search is active
  When the config is swapped to Algolia (with valid credentials)
  Then search still works
  And the search bar appearance is consistent
```

---

## Security Checklist

- [ ] Only Algolia search-only API key is in the config (never the admin key)
- [ ] Local search plugin does not send data to external services
- [ ] No analytics or tracking added by the search plugin

---

## Testing

- Build the site and verify the search index is generated
- Search for terms that appear in multiple pages and verify relevance
- Search for terms that appear in code blocks and verify they are indexed
- Verify search works on mobile viewport
