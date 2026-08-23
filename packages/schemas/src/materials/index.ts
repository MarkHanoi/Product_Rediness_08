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

// §MATERIAL-DECLARED-SURFACES (L-9702) — C100 §10.7 S25. Which surface slots a
// finish is DECLARED suitable for. ⛔ Absent means NOT DECLARED, never
// "universal" — `isDeclaredForSurface()` returns `null` for that case on purpose.
// This is a DIFFERENT fact from the schedule's derived element axis (§10.13.d),
// which measures what a family actually references.
export type { MaterialSurface } from './materialSurfaces.js';
export {
    MATERIAL_SURFACES,
    isMaterialSurface,
    isDeclaredForSurface,
    materialSurfacesDefect,
} from './materialSurfaces.js';

// §MATERIAL-UPSTREAM-LEDGER (L-9700) — C100 §10.6 / §10.14. Where a row's data or
// bytes came from, with the SENTENCE of the licence that decided it (the RATE53
// shape). ⛔ No shipped row may name an upstream that is not CLEARED.
export type {
    MaterialLicenceStatus,
    MaterialUpstreamTake,
    MaterialUpstreamId,
    MaterialUpstream,
} from './materialProvenance.js';
export {
    MATERIAL_UPSTREAMS,
    findMaterialUpstream,
    isUpstreamClearedToShip,
    unclearedMaterialUpstreams,
    materialUpstreamsRequiringNotice,
} from './materialProvenance.js';
