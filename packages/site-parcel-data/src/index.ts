// C58 — @pryzm/site-parcel-data public surface (L2).
//
// The pure, deterministic zoning-rules engine + buildable-envelope solver
// (C58 §3). No THREE / DOM / I-O / RNG. Consumes L0 zoning schemas
// (@pryzm/schemas) + pure geometry (@pryzm/site-validators); the impure surfaces
// (provider fetch, `site.updateZoning` dispatch, render) live in the editor.
//
// This is the C57/C58 shared home (C58 §3.3). The FIRST slice ships the engine +
// the estimated default pack; the `ZoningProvider` adapters (DK Plandata, ES MUC)
// are the L-399 parallel track.
//
// Strategic context — docs/02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md.

export {
    computeBuildableEnvelope,
    type ComputeBuildableEnvelopeInput,
} from './ZoningRulesEngine.js';

export { solveEstimatedEnvelope } from './solveEstimated.js';
// L-402 — the compliance "explain-why" report model (pure; explains an envelope, never recomputes it).
export {
    buildComplianceReport,
    formatConstraintValue,
    type ComplianceReport,
    type ComplianceReportRow,
} from './complianceReport.js';

// L-456 — proposed-vs-permitted capacity comparison (the *proyecto de ejecución* question:
// how much have I used, how much is left, am I over?).
export {
    buildCapacityComparison,
    CAPACITY_EPSILON,
    type CapacityComparison,
    type CapacityRow,
    type CapacityStatus,
    type CapacityMetric,
    type MeasuredDesign,
} from './capacityComparison.js';

export {
    ESTIMATED_DEFAULT_PACK,
    ESTIMATED_DEFAULT_ZONE_CODE,
    estimatedDefaultZoningRecord,
} from './rulepacks/estimatedDefault.js';

// ── ADR-0271 P5 — Barcelona (INE 08019) ensanche pack, clau 13a/13E. ──
// Founder-signed source (AMB consolidation to 31-12-2009, L-449 gate). Carries the Art. 242.2
// CONSTRUCTION; height/floors/FAR stay null because the signed source contains no bands and
// zone 13a has no per-parcel FAR at all (Art. 322.1 — the envelope IS the rule).
export {
    ES_BARCELONA_ENSANCHE_PACK,
    BCN_ENSANCHE_RULE,
    BCN_ENSANCHE_ZONE_CODES,
    BCN_ORDINANCE_REF,
} from './rulepacks/esBarcelonaEnsanche.js';

export {
    insetPolygonPerEdge,
    type PerEdgeSetbacks,
    type InsetResult,
} from './geometry/insetPolygon.js';

// ── ADR-0271 — block-derived *profunditat edificable* (PGM Art. 242.2). ──
// Exported so the block-ring producer (P4) can resolve a depth for display/diagnostics without
// a full envelope solve. The ENGINE reaches it internally; callers should normally go through
// `computeBuildableEnvelope`, which applies the depth to the parcel and records the derivation.
export {
    solveBlockDerivedDepth,
    BLOCK_DEPTH_BISECTION_STEPS,
    type BlockDerivedDepthInput,
    type BlockDerivedDepthResult,
    type BlockDepthBinding,
} from './geometry/blockDerivedDepth.js';

// ── L-399a — DK Plandata.dk zoning provider (C58 §3.1, the first real-data jurisdiction) ──
export type { ZoningProvider, ZoningProviderDeps } from './providers/ZoningProvider.js';
export { DkZoningProvider, PLANDATA_ZONING_PATH } from './providers/DkZoningProvider.js';
export {
    mapPlandataToZoningRecord,
    classifyDanishUse,
    type PlandataZoningResponse,
    type PlandataLayer,
    type MapPlandataOpts,
} from './providers/mapPlandataToZoningRecord.js';
export { isInDenmark, DENMARK_BBOX } from './providers/denmarkBbox.js';
// ── ADR-0271 — Barcelona metropolitan jurisdiction gate (bbox). ──
export { isInBarcelona, BARCELONA_BBOX } from './providers/barcelonaBbox.js';
// ── ADR-0271 P4 — block (manzana) ring dissolve + street-frontage classification. ──
// The pure producers the block-derived-alignment envelope needs; the L5 editor injects
// their results into `computeBuildableEnvelope` (roads/parcels are fetched at the edge).
export {
    dissolveParcelsToBlockRing,
    classifyBlockFrontages,
    VERTEX_MATCH_TOLERANCE_M,
    type RoadPolyline,
    type BlockRingResult,
    type FrontageOptions,
} from './geometry/blockRing.js';
// §L-401 slice 2 — storey height-cap against the C58 envelope (pure decision).
export {
    capStoreysToEnvelope,
    type StoreyCapInput,
    type StoreyCapResult,
    type StoreyCapBinding,
} from './storeyCap.js';
// §L-428 — post-generate envelope CONTAINMENT validator (the verification half of
// compliance-by-construction: detect any element footprint that breaches the setback line).
export {
    checkEnvelopeContainment,
    CONTAINMENT_TOLERANCE_M,
    type XZ,
    type FootprintToCheck,
    type ContainmentViolation,
    type ContainmentReport,
} from './envelopeContainment.js';
