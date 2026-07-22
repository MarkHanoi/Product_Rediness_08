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

// ── L-583 §9 — Barcelona clau 13b (*densificació urbana semiintensiva*). ──
// The SAME Art. 242 depth construction as 13a — it is the same article, applicable via Art. 326
// (the *segons alineacions de vial* ordering type), NOT via Art. 328, which states no depth rule
// at all. Height/floors/FAR/coverage are null, each for a reason argued in the module header.
export {
    ES_BARCELONA_SEMIINTENSIVA_PACK,
    BCN_SEMIINTENSIVA_RULE,
    BCN_SEMIINTENSIVA_ZONE_CODES,
    BCN_13B_ORDINANCE_REF,
    BCN_13B_PERI_FAR_NOT_APPLICABLE,
    BCN_13B_DENSITY_CAP_HAB_PER_HA,
    BCN_ART323_DWELLING_MODULE_M2,
} from './rulepacks/esBarcelonaSemiintensiva.js';

// ── L-591 — Barcelona clau `20a/*` (*Zona d'ordenació en edificació aïllada*, PGM Arts. 337–343
// as modified for Barcelona by DOGC 4277, 10-12-2004). ──
// The FIRST Barcelona family whose ordinance states real front/lateral/fons separations, so it
// ships a plain `kind: 'setback'` rule and needs no cadastral block. Two subzones state their
// numbers as CONSTRUCTIONS rather than constants — `20a/8` on the amplada de vial (Art. 342.5) and
// `20a/9u` on the parcel area (Art. 340.2) — and those resolve through the functions below, never
// through a scalar in the pack.
export {
    ES_BARCELONA_20A_AILLADA_PACK,
    BCN_20A_AILLADA_ZONE_CODES,
    bcn20aOrdinanceRef,
    resolve20aEdificabilitat,
    resolve20aParcelOverrides,
    type Bcn20aEdificabilitatResolution,
    type Bcn20aEdificabilitatRefusal,
    type Bcn20aParcelOverrides,
} from './rulepacks/esBarcelona20aAillada.js';
export {
    BCN_20A_SUBZONES,
    BCN_20A_BY_CLAU,
    BCN_20A_ZONE_CODES,
    BCN_20A_BARE_CLAU_UNRESOLVABLE,
    BCN_20A_BARCELONA_DELTAS,
    BCN_20A_UNMODELLED_RULES,
    BCN_20A_ART342_DWELLING_MODULE_M2,
    type Bcn20aSubzone,
    type Bcn20aFamily,
    type Bcn20aSeparations,
    type Bcn20aAuxiliary,
} from './rulepacks/bcn20aSubzones.js';
export {
    resolveAlcada20aSubzonaV,
    BCN_ALCADA_20A_V_TABLE,
    BCN_ART342_5_EDGE_CONVENTION,
    BCN_20A_V_CLAU,
    type Bcn20aVBand,
    type Bcn20aVResolution,
} from './rulepacks/bcnAlcada20aAillada.js';

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
    EIXAMPLE_CORNICE_INCREMENT_MAX_M,
    BAND_EDGE_GUARD_M,
    // §L-586 — the guard is the substitution allowance OR the measurement's own error bar,
    // whichever is larger. Exported so a caller can report the guard it was actually judged by.
    effectiveBandEdgeGuard_m,
    type AlcadaBand,
    type AlcadaResolution,
} from './rulepacks/bcnAlcadaReguladora.js';

// L-583 §4 — PGM Art. 328, the clau 13b (Subzona II) *alçada reguladora* table. Same CONSTRUCTION
// as Art. 327, different numbers (four bands, PB+4 ceiling), and no Eixample cornice increment.
export {
    resolveAlcadaSemiintensiva,
    BCN_ALCADA_SEMIINTENSIVA_TABLE,
    BCN_ART328_EDGE_CONVENTION,
} from './rulepacks/bcnAlcadaSemiintensiva.js';

// L-583 — WHICH height article governs WHICH clau. The L5 dispatcher must ask this rather than
// call an article's resolver directly: calling Art. 327's table for a 13b parcel would publish a
// wrong height under a confident citation to an article that does not govern that land.
export {
    resolveBcnAlcadaForZone,
    type ZonedAlcadaResolution,
} from './rulepacks/bcnAlcadaByZone.js';

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
