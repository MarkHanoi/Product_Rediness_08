// C84 — the master material vocabulary (L0). See `materialRecord.ts` for why it is here.
export type { MaterialRecord, MaterialCategory } from './materialRecord.js';
export { MATERIAL_CATALOG, findMaterialRecord, materialHex } from './materialCatalog.js';

// §MATERIAL-MAPS-AND-TILING (L-1700) — C100 §10.2.c / §10.9. The record-shape
// half of texture support: LOGICAL map paths + the real-world scale that makes
// them mean something. Pure data; the THREE side lives in the adapter (C100 §3).
export type {
    MaterialMapPath,
    MaterialMaps,
    MaterialMapChannel,
    MaterialTiling,
} from './materialMaps.js';
export {
    MATERIAL_MAP_CHANNELS,
    SRGB_MAP_CHANNELS,
    isUsableTiling,
    hasAnyMap,
    materialMapsDefect,
} from './materialMaps.js';
