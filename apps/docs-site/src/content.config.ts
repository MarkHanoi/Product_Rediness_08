// Astro Starlight content collection config (Astro 5.x / Starlight 0.30+ pattern).
// Source: ADR-0039 §C — docs site is isolated under `apps/docs-site/src/content/docs/`.

import { defineCollection } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
