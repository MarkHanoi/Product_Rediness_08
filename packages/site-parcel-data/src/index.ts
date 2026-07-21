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

// ── L-550 Phase 0.1 — THE RULE-PACK REGISTRY. ──
// The dispatcher no longer hard-codes which claus have a pack: it asks the registry for a
// ZONE DISPOSITION and gets `pack` / `refusal` / `unregistered`. Adding a clau (or a city) is a
// data addition here, not an edit to an L5 editor file (C58 §1.5).
export {
    resolveZoneDisposition,
    registeredPackZoneCodes,
    BCN_JURISDICTION_ID,
    type ZoneDisposition,
    type ZoneDispositionHints,
} from './rulepacks/registry.js';

// ── L-550 Phase 0.3 / 1b — THE REFUSAL VOCABULARY. ──
// "No private buildable envelope applies here (clau NN)" is a POSITIVE, cited answer — and until
// now it was inexpressible, so parks, motorways and Collserola were shown a fabricated setback
// triple from the generic estimated pack.
export { buildRefusedEnvelope, isRefusedEnvelope, isTransientRefusal } from './rulepacks/zoneRefusal.js';
export {
    barcelonaZoneRefusal,
    barcelonaZoneRefusalFor,
    BCN_ZONE_REFUSALS_BY_CLAU,
    BCN_REFUSED_CLAUS,
    BCN_PGM_INSTRUMENT_REF,
} from './rulepacks/esBarcelonaZoneClassification.js';

// ── L-574 — the THIRD refusal: an encoded clau whose construction could not complete. ──
// Distinct from the legal refusal (which would assert an ordinance fact we have not
// established) and from the coverage gap (which would claim we lack a pack we in fact have).
// The only TRANSIENT refusal, hence the only one carrying a retry affordance.
export {
    barcelonaConstructionIncompleteRefusal,
    type ConstructionFailureReason,
} from './rulepacks/esBarcelonaZoneClassification.js';

// L-525a — PGM Art. 327.2 *alçada reguladora* (the height half of the 13a construction, the
// counterpart to Art. 242's depth). Refuses rather than let a MEASURED street width choose a
// storey band near a boundary — see the module header.
export {
    resolveAlcadaReguladora,
    BCN_ALCADA_REGULADORA_TABLE,
    PB5_UNCERTIFIED_ALTERNATIVE_M,
    BAND_EDGE_GUARD_M,
    type AlcadaBand,
    type AlcadaResolution,
} from './rulepacks/bcnAlcadaReguladora.js';

// L-525a — the curated *ample oficial* allow-list Art. 327.2 keys on. Barcelona publishes no
// machine-readable official street width, and a MEASURED width cannot substitute (the bands are
// steps and the Cerdà grid sits on one). Unlisted street ⇒ null ⇒ no fabricated height.
export {
    officialStreetWidthForAddress,
    streetNameFromCatastroAddress,
    normaliseStreetName,
    BCN_OFFICIAL_STREET_WIDTHS,
    type OfficialStreetWidth,
    type StreetWidthProvenance,
} from './rulepacks/bcnOfficialStreetWidths.js';

// L-537 — the *amplada de vial* CONSTRUCTION that replaced the ~26-street allow-list as the primary
// width source. `streetWidth.ts` MEASURES (region-agnostic, zero extra network — the opposing
// frontage is already in the block bbox); `ampladaDeVial.ts` RESOLVES through the provenance tiers
// declared > snapped > measured > none. The snap set is derived from a 6,819-frontage measured
// distribution (`spain/SPAIN-STREET-WIDTH-DISTRIBUTION-PROBE.md`), never from intuition.
export {
    measureStreetWidths,
    governingStreetWidth,
    blockEdgesFacingParcel,
    type StreetWidthMeasurement,
    type StreetWidthMeasurementResult,
    type StreetWidthRejection,
    type RejectedEdge,
    type MeasureStreetWidthsOptions,
} from './geometry/streetWidth.js';
export {
    resolveAmpladaDeVial,
    snapToDeclaredQuantum,
    BCN_STREET_WIDTH_QUANTISATION,
    type StreetWidthQuantisation,
    type ResolveAmpladaInput,
    type ResolvedAmplada,
    type SnapResult,
} from './rulepacks/ampladaDeVial.js';

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
