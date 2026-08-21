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

// §MATERIAL-CARBON-FACTS (L-3100/L-3101) — C100 §1.1, the 6D half of the record.
// Embodied-carbon factors and densities, each INSEPARABLE from its citation. The
// values live in `carbonFactorTable.ts` and are merged onto `MATERIAL_CATALOG`
// rows at module load, so a consumer reads ONE record shape.
export type {
    CarbonFactorUnit,
    CarbonScope,
    CarbonProvenance,
    CarbonVerification,
    FactProvenance,
    DensityFact,
    CarbonFactorFact,
    MaterialCarbonFacts,
    CarbonGapReason,
    CarbonPerM3,
    CarbonPerM3Ok,
    CarbonPerM3Gap,
} from './materialCarbon.js';
export { carbonPerCubicMetre, isOutOfScopeForA1A3, isCarbonGap, isCarbonMeasured } from './materialCarbon.js';
export {
    CARBON_FACTOR_TABLE,
    SHIPPED_CARBON_FACTOR_COUNT,
    findCarbonFacts,
    carbonFactorOrphans,
} from './carbonFactorTable.js';
