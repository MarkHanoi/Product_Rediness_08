/**
 * `@pryzm/marketplace-api` — entry point + bootstrap.
 *
 * S64 D1 scope per phase-doc-2 §S64 + ADR-0040: in-memory store seeded
 * from `packages/plugin-sdk/docs/internal-plugin-inventory.md`, listening
 * on `MARKETPLACE_PORT` (default 5100).  Postgres + real publisher
 * onboarding lands at D2-D5.
 */

export { createMarketplaceApp } from './app.js';
export { createInMemoryStore } from './store/in-memory.js';
export {
  seedFirstParty,
  FIRST_PARTY_PLUGINS,
  FIRST_PARTY_AGGREGATE,
  PRYZM_FIRST_PARTY_PUBLISHER_ID,
} from './seed/first-party.js';
export type {
  MarketplacePlugin,
  MarketplacePluginVersion,
  Publisher,
  RevocationListResponse,
  MarketplaceCategory,
  Surface,
} from './types.js';
export type { MarketplaceStore, PluginListQuery } from './store/in-memory.js';

// CLI bootstrap — `tsx src/index.ts` from package.json scripts.start.
import { createMarketplaceApp as _create } from './app.js';
import { seedFirstParty as _seed } from './seed/first-party.js';

const isCli =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  /marketplace-api[\\/]src[\\/]index/.test(process.argv[1]);

if (isCli) {
  const port = Number(process.env['MARKETPLACE_PORT'] ?? 5100);
  const { app, store } = _create();
  const seedResult = _seed(store);
  app.listen(port, () => {
    // Stable boot log — tests + ops watch for "marketplace-api listening on".
    console.log(`marketplace-api listening on :${port} (seeded ${seedResult.pluginsInserted} first-party plugins, ${seedResult.publishersInserted} publisher)`);
  });
}
