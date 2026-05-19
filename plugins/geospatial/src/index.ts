// @pryzm/plugin-geospatial — empty workspace-package shell (F-prereq.0).
//
// PRYZM 2 — empty geospatial plugin shell (F-prereq.0). Geospatial primitives (CRS, tiles, terrain) land in F.x; this scaffold reserves the workspace package.
//
// This file intentionally contains no handlers, stores, or contributions.
// Real wiring lands per-family in the F.x sub-phases of
// `PRYZM2-WIREUP-PLAN-S72`; until then, importers get a stable PLUGIN_ID
// + PLUGIN_NAME pair so descriptor registration code can compile.
//
// @migration S89-WIRE (2026-05-01): CesiumThreeBridge moved here from
//   `src/geospatial/CesiumThreeBridge.ts` — re-exported for `src/ui/Layout.ts`.

export const PLUGIN_ID = 'geospatial' as const;
export const PLUGIN_NAME = '@pryzm/plugin-geospatial' as const;

export { CesiumThreeBridge } from './CesiumThreeBridge';
export { geospatialDescriptor, PLUGIN_VERSION } from './descriptor.js';
export { buildGeospatialHandlerSet } from './handlers/index.js';
export type { GeospatialHandler } from './handlers/index.js';
