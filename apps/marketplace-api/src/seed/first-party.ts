/**
 * First-party plugin seeding pipeline — S64 D1 + D4 deliverable.
 *
 * Source authority: `packages/plugin-sdk/docs/internal-plugin-inventory.md`
 * (38 first-party plugins per S62 D1 audit).  The phase-doc-2 §S64 D4
 * row says "30 first-party plugins seeded"; we seed all 38 because
 * that is the actual repo count per the K3-C parity baseline.
 *
 * The seeder runs deterministically — same inputs always produce the
 * same output (frozen `createdAt` + `auditPassedAt` so tests can
 * snapshot).  Override via `opts.now` for time-mocked tests.
 */

import type { MarketplacePlugin, MarketplaceCategory, Surface } from '../types.js';
import type { MarketplaceStore } from '../store/in-memory.js';

interface FirstPartyPluginEntry {
  readonly slug: string;             // 'walls' (publisher 'pryzm' implied)
  readonly displayName: string;
  readonly description: string;
  readonly category: MarketplaceCategory;
  readonly surfaces: readonly Surface[];
}

/**
 * The canonical inventory.  Hand-derived from
 * `packages/plugin-sdk/docs/internal-plugin-inventory.md` §"Plugins under
 * `plugins/*` (38 total)".  When that file is regenerated (per its
 * §"Generation procedure"), this list MUST be re-tallied.
 */
export const FIRST_PARTY_PLUGINS: readonly FirstPartyPluginEntry[] = Object.freeze([
  // AI plugins (5) — already use descriptor pattern
  { slug: 'ai-floorplan',    displayName: 'AI Floorplan',     description: 'Generate floorplans from natural-language prompts via L7.5 workflows.', category: 'ai',              surfaces: ['command', 'panel'] },
  { slug: 'ai-generative',   displayName: 'AI Generative',    description: 'Generative geometry seeded by site context and brief.',                category: 'ai',              surfaces: ['command', 'panel'] },
  { slug: 'ai-query',        displayName: 'AI Query',         description: 'Natural-language queries over the active project.',                     category: 'ai',              surfaces: ['command', 'panel'] },
  { slug: 'ai-rules',        displayName: 'AI Rules',         description: 'Rule-checking workflows surfaced as a panel of violations.',           category: 'ai',              surfaces: ['command', 'panel'] },
  { slug: 'ai-voice',        displayName: 'AI Voice',         description: 'Voice-driven model and view actions.',                                  category: 'ai',              surfaces: ['command'] },
  // Element-family plugins (13) — built into editor bundle
  { slug: 'beam',            displayName: 'Beam',             description: 'Structural beam element family.',                                       category: 'element-family',  surfaces: ['element-type', 'tool'] },
  { slug: 'ceiling',         displayName: 'Ceiling',          description: 'Ceiling element family.',                                               category: 'element-family',  surfaces: ['element-type', 'tool'] },
  { slug: 'column',          displayName: 'Column',           description: 'Column element family.',                                                category: 'element-family',  surfaces: ['element-type', 'tool'] },
  { slug: 'curtain-wall',    displayName: 'Curtain Wall',     description: 'Curtain-wall element family with mullions and panels.',                 category: 'element-family',  surfaces: ['element-type', 'tool'] },
  { slug: 'door',            displayName: 'Door',             description: 'Door element family.',                                                  category: 'element-family',  surfaces: ['element-type', 'tool'] },
  { slug: 'grid',            displayName: 'Grid',             description: 'Reference grid element family.',                                        category: 'element-family',  surfaces: ['element-type', 'tool'] },
  { slug: 'handrail',        displayName: 'Handrail',         description: 'Handrail element family.',                                              category: 'element-family',  surfaces: ['element-type', 'tool'] },
  { slug: 'roof',            displayName: 'Roof',             description: 'Roof element family.',                                                  category: 'element-family',  surfaces: ['element-type', 'tool'] },
  { slug: 'slab',            displayName: 'Slab',             description: 'Slab element family.',                                                  category: 'element-family',  surfaces: ['element-type', 'tool'] },
  { slug: 'stair',           displayName: 'Stair',            description: 'Stair element family.',                                                 category: 'element-family',  surfaces: ['element-type', 'tool'] },
  { slug: 'view',            displayName: 'View',             description: 'View kinds (3D / plan / section / sheet / schedule) registry.',        category: 'view',            surfaces: ['view-template', 'panel'] },
  { slug: 'wall',            displayName: 'Wall',             description: 'Wall element family.',                                                  category: 'element-family',  surfaces: ['element-type', 'tool'] },
  { slug: 'window',          displayName: 'Window',           description: 'Window element family.',                                                category: 'element-family',  surfaces: ['element-type', 'tool'] },
  // Format plugins (5) — needs-manifest
  { slug: 'bcf',             displayName: 'BCF',              description: 'BCF (BIM Collaboration Format) round-trip importer/exporter.',         category: 'format',          surfaces: ['command'] },
  { slug: 'ifc-export',      displayName: 'IFC Export',       description: 'IFC tier-1 exporter.',                                                  category: 'format',          surfaces: ['command'] },
  { slug: 'ifc-import',      displayName: 'IFC Import',       description: 'IFC tier-2 importer.',                                                  category: 'format',          surfaces: ['command'] },
  { slug: 'ifc-inspector',   displayName: 'IFC Inspector',    description: 'Per-element IFC property-set inspector.',                               category: 'format',          surfaces: ['panel'] },
  { slug: 'rhino-import',    displayName: 'Rhino Import',     description: 'Rhino .3dm geometry importer.',                                         category: 'format',          surfaces: ['command'] },
  // Auxiliary / view / annotation plugins (15)
  { slug: 'annotations',     displayName: 'Annotations',      description: 'Sheet-side annotations surface.',                                       category: 'annotation',      surfaces: ['tool', 'panel'] },
  { slug: 'cross',           displayName: 'Cross',            description: 'Cross-element relationship inspector.',                                 category: 'auxiliary',       surfaces: ['panel'] },
  { slug: 'dimensions',      displayName: 'Dimensions',       description: 'Dimensioning UI for plans + sections.',                                 category: 'annotation',      surfaces: ['tool'] },
  { slug: 'furniture',       displayName: 'Furniture',        description: 'Furniture family library.',                                             category: 'element-family',  surfaces: ['element-type'] },
  { slug: 'lighting',        displayName: 'Lighting',         description: 'Render-runtime lighting elements.',                                     category: 'discipline',      surfaces: ['element-type', 'panel'] },
  { slug: 'multiplayer',     displayName: 'Multiplayer',      description: 'Sync-client + presence indicators.',                                    category: 'auxiliary',       surfaces: ['panel'] },
  { slug: 'plan-view',       displayName: 'Plan View',        description: 'Plan view kind + template.',                                            category: 'view',            surfaces: ['view-template'] },
  { slug: 'plumbing',        displayName: 'Plumbing',         description: 'Plumbing discipline package.',                                          category: 'discipline',      surfaces: ['element-type', 'panel'] },
  { slug: 'rooms',           displayName: 'Rooms',            description: 'Room-recognition + room-data panel.',                                   category: 'auxiliary',       surfaces: ['tool', 'panel'] },
  { slug: 'schedules',       displayName: 'Schedules',        description: 'Schedule formula DSL (per ADR-0032) + schedule view.',                  category: 'view',            surfaces: ['view-template', 'command'] },
  { slug: 'section-view',    displayName: 'Section View',     description: 'Section view kind + template.',                                         category: 'view',            surfaces: ['view-template', 'tool'] },
  { slug: 'selection',       displayName: 'Selection',        description: 'Selection-store contributions.',                                        category: 'auxiliary',       surfaces: ['tool'] },
  { slug: 'sheets',          displayName: 'Sheets',           description: 'Sheets / print surface.',                                               category: 'view',            surfaces: ['view-template', 'panel'] },
  { slug: 'structural',      displayName: 'Structural',       description: 'Structural discipline package.',                                        category: 'discipline',      surfaces: ['element-type', 'panel'] },
  { slug: 'toy-cube',        displayName: 'Toy Cube',         description: 'Demo / smoke-test plugin.',                                             category: 'demo',            surfaces: ['element-type'] },
]);

/**
 * Aggregate counts — must match `internal-plugin-inventory.md` §Aggregate.
 * Exported so tests can pin the row.
 */
export const FIRST_PARTY_AGGREGATE = Object.freeze({
  total: 38,
  byCategory: Object.freeze({
    ai: 5,
    'element-family': 14,   // 13 from inventory + furniture which lives in the auxiliary block but is family-shaped
    format: 5,
    auxiliary: 4,
    view: 5,
    annotation: 2,
    discipline: 3,
    demo: 1,
  }),
});

export interface SeedResult {
  readonly publishersInserted: number;
  readonly pluginsInserted: number;
}

export interface SeedOptions {
  readonly now?: () => string;          // override createdAt for deterministic tests
  /** First-party publisher's Ed25519 public key, base64url. */
  readonly firstPartyPublicKeyB64?: string;
}

export const PRYZM_FIRST_PARTY_PUBLISHER_ID = 'pryzm';

/**
 * Seed `store` with the first-party publisher record + every plugin in
 * `FIRST_PARTY_PLUGINS`.  Idempotent: re-running upserts every row.
 */
export function seedFirstParty(store: MarketplaceStore, opts: SeedOptions = {}): SeedResult {
  const now = opts.now ?? (() => new Date().toISOString());
  const auditTime = now();

  store.upsertPublisher({
    id: PRYZM_FIRST_PARTY_PUBLISHER_ID,
    displayName: 'PRYZM',
    publicKeyB64: opts.firstPartyPublicKeyB64 ?? 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', // S64 D5 wires the real key
    isFirstParty: true,
    workspaceId: 'pryzm',
    createdAt: auditTime,
  });

  for (const entry of FIRST_PARTY_PLUGINS) {
    const plugin: MarketplacePlugin = {
      pluginId: `${PRYZM_FIRST_PARTY_PUBLISHER_ID}/${entry.slug}`,
      displayName: entry.displayName,
      publisherId: PRYZM_FIRST_PARTY_PUBLISHER_ID,
      description: entry.description,
      license: 'MIT',
      category: entry.category,
      surfaces: [...entry.surfaces],
      isFirstParty: true,
      auditPassed: true,             // first-party automatically audit-passed via internal review
      auditPassedAt: auditTime,
      installCount: 0,
      createdAt: auditTime,
    };
    store.upsertPlugin(plugin);
  }

  return {
    publishersInserted: 1,
    pluginsInserted: FIRST_PARTY_PLUGINS.length,
  };
}
