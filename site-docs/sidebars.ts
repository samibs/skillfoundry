import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'intro',
    'getting-started',
    'architecture',
    'configuration',
    {
      type: 'category',
      label: 'Recipes',
      items: ['recipes/nextjs', 'recipes/monorepo', 'recipes/azure-devops'],
    },
    'search',
  ],
};

export default sidebars;
