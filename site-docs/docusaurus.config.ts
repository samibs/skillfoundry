import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'SkillFoundry',
  tagline: 'AI engineering framework — quality gates your AI can\'t skip',
  favicon: 'img/logo.svg',

  url: 'https://samibs.github.io',
  baseUrl: '/skillfoundry/',

  organizationName: 'samibs',
  projectName: 'skillfoundry',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl:
            'https://github.com/samibs/skillfoundry/tree/main/site-docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        indexBlog: false,
        docsRouteBasePath: '/',
      },
    ],
  ],

  // To enable Algolia DocSearch (after approval):
  // 1. Remove the @easyops-cn/docusaurus-search-local theme above
  // 2. Uncomment this block:
  // algolia: {
  //   appId: 'YOUR_APP_ID',
  //   apiKey: 'YOUR_SEARCH_API_KEY',
  //   indexName: 'skillfoundry',
  //   contextualSearch: true,
  //   searchPagePath: 'search',
  // },
  // Apply at: https://docsearch.algolia.com/apply/

  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'SkillFoundry',
      logo: {
        alt: 'SkillFoundry Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          to: '/getting-started',
          label: 'Getting Started',
          position: 'left',
        },
        {
          to: '/architecture',
          label: 'Architecture',
          position: 'left',
        },
        {
          to: '/configuration',
          label: 'Config',
          position: 'left',
        },
        {
          to: '/recipes/nextjs',
          label: 'Recipes',
          position: 'left',
        },
        {
          href: 'https://github.com/samibs/skillfoundry',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Getting Started',
              to: '/getting-started',
            },
            {
              label: 'Architecture',
              to: '/architecture',
            },
            {
              label: 'Configuration',
              to: '/configuration',
            },
          ],
        },
        {
          title: 'Resources',
          items: [
            {
              label: 'npm',
              href: 'https://www.npmjs.com/package/skillfoundry',
            },
            {
              label: 'VS Code Marketplace',
              href: 'https://marketplace.visualstudio.com/items?itemName=samibs.skillfoundry',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/samibs/skillfoundry',
            },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} SkillFoundry. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'typescript'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
