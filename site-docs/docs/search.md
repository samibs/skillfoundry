---
sidebar_position: 6
title: Search
---

# Documentation Search

SkillFoundry docs ship with **offline local search** powered by [`docusaurus-search-local`](https://github.com/easyops-cn/docusaurus-search-local). This works without any external service — the search index is built at compile time and included in the static site.

## Using Search

- Press **Ctrl+K** (or **Cmd+K** on macOS) to open the search bar
- Type your query — results appear instantly from the local index
- Click a result to navigate directly to that section

## Algolia DocSearch (Future)

Once the project qualifies for [Algolia DocSearch](https://docsearch.algolia.com/) (free for open-source), the search will be upgraded to Algolia's cloud-powered search for better ranking and typo tolerance.

### Switching to Algolia

1. Apply at [docsearch.algolia.com/apply](https://docsearch.algolia.com/apply/)
2. Once approved, update `docusaurus.config.ts`:
   - Remove the `@easyops-cn/docusaurus-search-local` entry from `themes`
   - Add the Algolia config block (see commented section in the config file)
3. Rebuild and deploy

The local search plugin remains the default until Algolia is configured.
