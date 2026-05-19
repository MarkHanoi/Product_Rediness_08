// PRYZM docs site Astro config
//
// Source: phases/PHASE-3C-Q3-M31-M33-PLUGIN-SDK-MARKETPLACE-APIS.md §3 lines 527-561
// Authority: ADR-0039 §A (S63 D1 reconciliation — docs site at apps/docs-site/)
//
// The sidebar tree below mirrors the spec literally. Stub markdown pages live at
// `src/content/docs/`; INVENTORY.md tracks scaffolded vs content-pending status.

import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'PRYZM Docs',
      social: { github: 'https://github.com/pryzm-com/pryzm' },
      sidebar: [
        {
          label: 'Plugin SDK',
          items: [
            { label: 'Getting Started', link: '/plugin-sdk/getting-started' },
            { label: 'Manifest Reference', link: '/plugin-sdk/manifest' },
            { label: 'Permissions', link: '/plugin-sdk/permissions' },
            { label: 'Sandbox Model', link: '/plugin-sdk/sandbox' },
            { label: 'Host API', link: '/plugin-sdk/host-api' },
            { label: 'Examples', link: '/plugin-sdk/examples' },
            { label: 'First-Party Plugins', link: '/plugin-sdk/first-party-plugins' },
            { label: 'Distribution', link: '/plugin-sdk/distribution' },
          ],
        },
        {
          label: 'REST API',
          items: [
            { label: 'Quickstart', link: '/api/quickstart' },
            { label: 'Authentication', link: '/api/auth' },
            { label: 'OpenAPI Reference', link: '/api/openapi' },
          ],
        },
        {
          label: 'Headless',
          items: [
            { label: 'Getting Started', link: '/headless/getting-started' },
            { label: 'API Reference', link: '/headless/api' },
            { label: 'Recipes', link: '/headless/recipes' },
          ],
        },
        {
          label: 'Self-Host',
          items: [
            { label: 'Getting Started', link: '/selfhost/getting-started' },
            { label: 'Architecture', link: '/selfhost/architecture' },
          ],
        },
      ],
    }),
  ],
});
