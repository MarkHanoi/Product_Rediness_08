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

// ── §L-590b / ADR-0273 — attach a CONSTRUCTED *alçada reguladora* to a solved envelope. ──
// The L5 dispatcher currently does this with an inline object spread, which is correct for a
// single prism and silently wrong for a tiered envelope (it would leave `tiers` describing the old
// heights, and it would assign a height that governs ONE tier to the whole building). Beside the
// solver rather than in the editor, for the same reason the registry and the `block-constructed`
// tier moved down: a rule about the determination must not live in one of its consumers.
export { applyConstructedHeight, type ConstructedHeightPatch } from './envelopeHeight.js';

// ── C58 §1.14 / STRUCTURAL-SEAM-1 — the render-side dual of the schema refinement: ──
// the ONE pure function that maps a WHOLE `BuildableEnvelope` to the solids the 3D massing draws, so
// no jurisdiction can overstate at the render (retires the per-city treadmill; supersedes the L-616 /
// L-608 / L-619 per-field narrowing). `renderFormaMassing` + `ParcelBoundarySceneRenderer` consume
// `MassingSolid[]` and hold no per-field knowledge. `classifyEnvelopeCompleteness` is the single
// honesty-hue authority the L5 `envelopeRenderStyle` (flat overlay + card) delegates to.
export {
    envelopeToMassing,
    massingSolidVolumeM3,
    totalMassingVolumeM3,
    classifyEnvelopeCompleteness,
    FOOTPRINT_ONLY_HEIGHT_M,
    SOLID_FILL_ALPHA,
    UPPER_BOUND_FILL_ALPHA,
    SHELL_FILL_ALPHA,
    type MassingSolid,
    type MassingSolidRole,
    type MassingSolidStyle,
    type MassingHue,
    type EnvelopeCompleteness,
    type BuildableEnvelopeMassingInput,
} from './envelopeToMassing.js';

// ── §L-616 / §L-619 — the FAR-limited massing-height helper, shared by the engine AND ──
// `applyConstructedHeight` so a FAR that caps floorspace below the height cap binds with ONE formula,
// whether the height is known at solve time (BCN 20a) or attached afterwards (BCN 12 / 13a / 13b).
export {
    computeFarLimitedHeight,
    farLimitedHeightCaveat,
    ASSUMED_FLOOR_TO_FLOOR_M,
    type FarLimitedHeightInput,
    type FarLimitedHeightResult,
} from './farLimitedHeight.js';

// ── §L-619 — the Denmark perimeter-block (karré) COURTYARD rule: a conservative STUDY default that ──
// reuses the block-derived-alignment depth-band machinery. Human-gated to the lokalplan/friareal; the
// L5 DK dispatch passes it + a resolved block ring to carve the courtyard (see the module header for
// the wiring, which is not yet done).
export {
    DK_PERIMETER_BLOCK_COURTYARD_RULE,
    DK_PERIMETER_BLOCK_STUDY_CAVEAT,
} from './rulepacks/dkPerimeterBlock.js';

// ── §L-619 / DK gap G6 — the DENMARK FOOTPRINT-PLACEMENT RESOLVER. ──
// Decides WHERE a building may stand on a Danish parcel under the G6 source hierarchy
// (binding byggefelt → byggelinjer → cited lokalplan depth → conservative block study → REFUSE),
// and stamps the resulting `placement` / `openSpace` provenance onto the solved envelope. The
// engine stays jurisdiction-agnostic (ADR-0279 §2) — this is the DK slot that keeps it that way.
export {
    resolveDkEnvelopePlacement,
    applyDkPlacement,
    DK_BYGGEFELT_RING_REF,
    type DkByggefelt,
    type DkByggefeltBinding,
    type DkLokalplanDepth,
    type DkPlacementInputs,
    type DkPlacementResolution,
    type DkPlacementDiagnostic,
    type DkPlacementTier,
    type DkPlacementRefusalReason,
    type DkTierOutcome,
} from './rulepacks/dkEnvelopePlacement.js';

// ── DK gap G3 — PLACEMENT EVIDENCE: the jurisdiction-agnostic "geometry + what makes it binding" ──
// vocabulary that feeds the G6 resolver. Separates GEOMETRY production (`geometrySource`) from
// LEGAL-STATUS production (`legalStatusSource`), so the resolver never learns WHY something binds.
// Denmark is the first jurisdiction with `legalStatusSource: 'metadata'`; Madrid is expected to be
// `'statute'` and Germany `'plan_text'`, with no resolver change (ADR-0279 §2). PURE.
export {
    rankPlacementEvidence,
    strongestBindingEvidence,
    collectEvidenceConflicts,
    EVIDENCE_CONFIDENCE,
    type PlacementEvidence,
    type EvidenceGeometry,
    type EvidencePolygon,
    type EvidenceLineString,
    type EvidenceCrs,
    type EvidenceCitation,
    type EvidenceAuthority,
    type GeometrySource,
    type LegalStatus,
    type LegalStatusSource,
    type LegalStatusUnknownCause,
} from './evidence/placementEvidence.js';

// ── DK gap G3 — the BYGGEFELT LEGAL-STATUS CLASSIFIER (pure). `bygkunifelt`/`bygvejledende` → ──
// `legalStatus`, incl. the three distinct causes of `unknown` (not-declared / metadata-conflict /
// metadata-unavailable) and the paranoid tier-1 adapter (CRS, holes and multi-part all REFUSE).
export {
    classifyByggefeltLegalStatus,
    byggefeltFeatureToEvidence,
    byggefeltCollectionToEvidence,
    dkByggefeltFromEvidence,
    wfsBool,
    DK_BYGGEFELT_LAYER,
    type DkByggefeltProperties,
    type DkByggefeltFeature,
    type DkByggefeltClassification,
    type DkByggefeltAdaptRefusal,
    type DkByggefeltAdaptResult,
    type ByggefeltEvidenceOptions,
    type EvidenceProjector,
} from './evidence/byggefeltEvidence.js';

// ── DK gap G3/G6 — the PLANDATA WFS CLIENT (the one impure surface). Returns `FetchOutcome`, so a ──
// 500, a timeout and zero features stay three different answers; only durable answers are cached.
// Polite: identifying UA, min-interval queue, in-flight de-dup, bounded jittered backoff, LRU cache.
export {
    createByggefeltProducer,
    byggefeltResultToTierOne,
    PLANDATA_WFS_URL,
    PLANDATA_NATIVE_CRS,
    PLANDATA_USER_AGENT,
    type ByggefeltProducer,
    type ByggefeltProducerConfig,
    type ByggefeltQueryOptions,
    type ByggefeltFetchResult,
    type ByggefeltTierOneInput,
    type Bbox25832,
} from './providers/ByggefeltProducer.js';

// L-402 — the compliance "explain-why" report model (pure; explains an envelope, never recomputes it).
export {
    buildComplianceReport,
    formatConstraintValue,
    resolveHeadlineProvenance,
    type ComplianceReport,
    type ComplianceReportRow,
    type HeadlineProvenance,
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
    // L-593 / C60 §2 — the site-entry globe's ONLY legal coverage source.
    listJurisdictionCoverage,
    type JurisdictionCoverage,
    type JurisdictionExtent,
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

// ── §L-590c / ADR-0276 — the FOURTH refusal: the ordinance states two regimes and no public ──
// source says which one this parcel is in. Distinct from the coverage gap (the pack EXISTS), from
// the transient data-path failure (no retry can produce a legal fact nobody publishes) and from
// `derived-plan` (which would assert the very delegation we cannot establish — L-526).
// ⚠ The ONE refusal that states limits, in prose under its own citation, while keeping every
// numeric envelope field null (C58 §1.13.7).
export {
    barcelonaRegimeUndeterminedRefusal,
    BCN_22A_REGIME_ORDINANCE_REF,
} from './rulepacks/esBarcelonaZoneClassification.js';

// ── Córdoba (INE 14021) — PGOU-2001, the SUR + NOROESTE 2-district pilot pack. ──
// ⚠ MACHINE-EXTRACTED (OCR) + `pipeline-extracted-unverified`. Registered but rendering NO number:
// the dispatcher's `CORDOBA_ENVELOPE_VERIFIED` gate refuses every parcel with a cited "unverified"
// card until `sources/VERIFICATION.md` is human-signed (pack WIRING-TODO 3). The pack self-labels
// its honesty tier; the SAFETY is that gate, not the label.
export {
    ES_CORDOBA_PGOU2001_PACK,
    CORDOBA_PGOU2001_ZONE_CODES,
    CORDOBA_JURISDICTION_ID,
    CORDOBA_INTENDED_DEFAULT_CONFIDENCE,
    CORDOBA_INTENDED_FIELD_PROVENANCE,
} from './rulepacks/esCordobaPGOU2001.js';
export {
    // The honesty gate: false until sign-off; the dispatcher reads it. And the three Córdoba
    // refusals — the verification gate, the coverage gap, and the legally-grounded "no" families.
    CORDOBA_ENVELOPE_VERIFIED,
    cordobaUnverifiedRefusal,
    cordobaNoRulePackRefusal,
    cordobaZoneRefusalFor,
    CORDOBA_LEGALLY_REFUSED_ORDENANZAS,
    CORDOBA_PGOU_INSTRUMENT_REF,
    CORDOBA_ROADMAP_LINE,
} from './rulepacks/esCordobaZoneClassification.js';
export { isInCordoba, CORDOBA_BBOX } from './providers/cordobaBbox.js';
// ── Córdoba subzone resolver (WIRING-TODO 5) — the COACo WFS provider. ──
// Binds a parcel to its PGOU-2001 subzone (`coaco:ordenanzas.link` → MC-3/…) + the refcat-join
// attributes + the `actuacion` derived-planning override. WIRED but never rendered while
// `CORDOBA_ENVELOPE_VERIFIED` is false (the dispatcher shows the unverified refusal). Never throws.
export {
    resolveCordobaSubzone,
    subzoneCodeFromLink,
    CORDOBA_ORDENANZAS_PATH,
    CORDOBA_VCATASTRO_PATH,
    type CordobaLngLat,
    type CordobaSubzoneDeps,
    type CordobaSubzoneResolution,
    type CordobaSubzoneResult,
    type CordobaSubzoneRefusalReason,
} from './providers/resolveCordobaSubzone.js';

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
    // BARCELONA-GIS-AUDIT-SPIKE — floors→height (Art. 327.2 storey module), for the clau-18
    // volumetric path: an EXTERNALLY-sourced floor count (AMB Refós PLANTES) → an *alçada* estimate.
    heightFromFloorsAboveGround,
    BCN_STOREY_MODULE_M,
    BCN_GROUND_FLOOR_DATUM_M,
    type FloorsToHeight,
    type FloorsToHeightBasis,
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

// ── §L-590b / ADR-0273 — the Art. 350.2.b *franja concèntrica* (the TIER BOUNDARY). ──
// ⚠ A DIFFERENT CONSTRUCTION FROM THE ONE ABOVE, not a variant of it: Art. 350.2.b states an
// area EQUALITY on the block and NO depth bounds, where Art. 242.2 states a MINIMUM free share
// with an 11 m floor and a 30 m cap. They coincide on the unclamped interior of the depth range
// and diverge at both bounds — measured, `blockConcentricBand.test.ts`. Exported for the same
// reason as `solveBlockDerivedDepth`: diagnostics and probes; production goes through
// `computeBuildableEnvelope`, which cuts the tiers and records the derivation.
export {
    solveBlockConcentricBandDepth,
    BLOCK_BAND_BISECTION_STEPS,
    BLOCK_BAND_RATIO_TOLERANCE,
    type BlockConcentricBandInput,
    type BlockConcentricBandResult,
} from './geometry/blockConcentricBand.js';

// ── §L-619 / DK G2 — BYGGELINJER (building lines) → parcel-edge matching. ──
// A byggelinje is published as GEOMETRY in a separate Plandata dataset, with no stated binding and
// no stated distance, so the only honest way to turn it into an envelope constraint is to MEASURE
// its offset to the parcel edge it runs along. These primitives do that by direction + proximity —
// never by an assumed orientation (`front = north` is a fabrication on a Copenhagen karré, whose
// frontage may point any way). Jurisdiction-agnostic geometry; the DK-specific reading of what a
// measured offset MEANS lives in `rulepacks/dkEnvelopePlacement.ts`.
export {
    matchBuildingLineToParcelEdge,
    inwardEdgeNormal,
    signedDepthAlongNormal,
    lineParallelToEdge,
    firstFrontEdgeIndex,
    type BuildingLineConstraint,
    type BuildingLineEdgeMatch,
    type MatchBuildingLineOptions,
} from './geometry/buildingLineOffset.js';



// ── L-590 / §L-590b — Barcelona clau 22a (*zona industrial*), PGM Art. 350. ──
// ⚠ AUTHORED FROM THE PRIMARY PDF, AND STILL **NOT REGISTERED** in `registry.ts` — but for ONE
// reason now, not two. The two-tier solid IS expressible and IS solved (ADR-0273: the
// `tiered-occupation` rule kind + `BuildableEnvelope.tiers`), and this pack's `geometricRule`
// carries it, verified end to end in `esBarcelonaIndustrialPack.test.ts`.
// ⚠ WHAT REMAINS IS NOT ENGINEERING: Arts. 350.2.a–f govern only industrial land *mancada de Pla
// Parcial*, and PRYZM holds no source establishing which regime covers a parcel. That gates the
// FOOTPRINT as well as the height — only the FAR and the occupation are restated by Art. 350.1 and
// therefore regime-neutral. `BCN_22A_ENVELOPE_BLOCKER` carries the argument, and `.closed` records
// what ADR-0273 answered. Clau 22a keeps its coverage-gap refusal until the regime can be
// established or the founder rules on it.
export {
    ES_BARCELONA_INDUSTRIAL_PACK,
    BCN_INDUSTRIAL_ZONE_CODES,
    BCN_22A_ORDINANCE_REF,
    BCN_22A_ENVELOPE_BLOCKER,
    BCN_ART350_MIN_PARCEL_M2,
    BCN_ART350_MIN_FACADE_M,
    BCN_ART350_2B_INTERIOR_FREE_RATIO,
    BCN_ART350_1_AILLADA_COVERAGE,
    BCN_ART350_COSSOS_SORTINTS,
    // §L-590c — the half of Art. 350 that ships TODAY, through the `regime-undetermined` refusal.
    // ⚠ The FAR is unconditional (all three paragraphs state it); the occupation is CONDITIONAL
    // (Art. 350.1.2n caps *aïllada* sectors at 70 %) and its condition travels with the number.
    BCN_22A_REGIME_NEUTRAL_LIMITS,
} from './rulepacks/esBarcelonaIndustrial.js';


// ── L-606 — Saudi Arabia / Riyadh DEMO pack (MOMRAH national residential FOOTPRINT). ──
// The SIMPLEST pack shape we hold: a plain `setback` inset + `maxCoverage`, with the
// width-dependent setback triple resolved per-parcel by `resolveSaudiSetbacks` +
// `saRiyadhResolvedPack` from the user-supplied fronting street width + plot class (§2). Height,
// floors and FAR are cited-null findings (§NULLS). Ships `estimated-ruleset` (§4) — nothing here
// self-declares `structured` (the L-449 human VERIFICATION.md sign-off is still absent).
export {
    SA_RIYADH_DEMO_PACK,
    SA_RIYADH_ZONE_CODES,
    SA_RIYADH_JURISDICTION_ID,
    resolveSaudiSetbacks,
    saRiyadhResolvedPack,
    saRiyadhZoneCodeForClass,
    SA_GROUND_COVERAGE,
    SA_MAX_HEIGHT_M,
    SA_MAX_FLOORS_VILLA,
    SA_HEIGHT_PLAN_DEFERRED_REF,
    type SaudiPlotClass,
    type SaRiyadhZoneCode,
    type SaudiSetbackResolution,
    type SaudiSetbackRefusal,
    type SaRiyadhResolvedPack,
} from './rulepacks/saRiyadhDemo.js';
// ── L-606 — Riyadh (Saudi Arabia) city jurisdiction gate (bbox). ──
export { isInRiyadh, RIYADH_BBOX } from './providers/riyadhBbox.js';

// ── STRUCTURAL-SEAM-4 (C57 §1.5 / C58 §1.13.8) — the shared fetch-outcome union + bounded retry. ──
// `FetchOutcome` and its classifiers live in `@pryzm/schemas` (L0); re-export them here so resolver
// consumers bind to one vocabulary. `retryWhileUnreachable` is the one impure (clock) hop above the
// pure resolvers, used by the L5 dispatcher around every explicit-area resolve.
export type { FetchOutcome, TransientFetchReason } from '@pryzm/schemas';
export {
    fetchFound,
    fetchAbsent,
    fetchTransient,
    fetchAborted,
    isTransientOutcome,
    isTransientFetchReason,
    resolutionToFetchOutcome,
    TRANSIENT_FETCH_REASONS,
} from '@pryzm/schemas';
export {
    retryWhileUnreachable,
    DEFAULT_ZONING_RETRY,
    type UnreachableRetryPolicy,
} from './net/retryWhileUnreachable.js';

// ── L-399a — DK Plandata.dk zoning provider (C58 §3.1, the first real-data jurisdiction) ──
export type { ZoningProvider, ZoningProviderDeps } from './providers/ZoningProvider.js';
export {
    DkZoningProvider,
    PLANDATA_ZONING_PATH,
    type DkZoningResult,
} from './providers/DkZoningProvider.js';
export {
    mapPlandataToZoningRecord,
    extractDkPlanIdentity,
    classifyDanishUse,
    type PlandataZoningResponse,
    type PlandataLayer,
    type MapPlandataOpts,
    type DkPlanIdentity,
} from './providers/mapPlandataToZoningRecord.js';
// §DK-HONEST-REFUSAL — the DK cited-refusal builders (a plan resolved but no structured numbers,
// or no plan at all) — dispatched instead of the generic `estimated-default` on a Danish parcel.
export {
    dkPlandataNoNumbersRefusal,
    dkPlandataNoPlanRefusal,
    // STRUCTURAL-SEAM-4 — the DK transient (source did not answer) refusal, distinct from no-plan.
    dkPlandataUnreachableRefusal,
} from './rulepacks/dkPlandataRefusal.js';
// ── L-449 SIGNED — the DK Plandata → buildable-envelope rule pack (BR18 §168–186 signed mapping;
//    FAR = bebyggelsesprocent/100 with the density-scope caveat honoured). ──
export {
    DK_PLANDATA_JURISDICTION_ID,
    DK_PLANDATA_FIELD,
    DK_PLANDATA_DEFAULT_ZONE_CODE,
    DK_BR18_ENVELOPE_REF,
    parseDkDensityScope,
    resolveDkPlanEnvelope,
    dkPlandataResolvedPack,
    type DkDensityScope,
    type DkPlanFields,
    type DkPlanEnvelopeResolution,
    type DkFarWithheldReason,
} from './rulepacks/dkPlandataEnvelope.js';
export { isInDenmark, DENMARK_BBOX } from './providers/denmarkBbox.js';
// ── ADR-0271 — Barcelona metropolitan jurisdiction gate (bbox). ──
export { isInBarcelona, BARCELONA_BBOX } from './providers/barcelonaBbox.js';
// ── Envelope Phase 2 — L'Hospitalet de Llobregat (INE 08101), the SECOND Catalan municipality. ──
// The S2 router predicate + the S5 honesty gate + cited refusal. Registered as a REFUSAL
// jurisdiction: it is ROUTED (shares Barcelona's MUC + PGM-1976), but `LHOSPITALET_ENVELOPE_VERIFIED`
// is false until a human verifies its numbers equal Barcelona's, so a parcel here gets a cited
// refusal, never a borrowed Barcelona envelope. See `esLHospitalet.ts` / `lhospitaletBbox.ts`.
export { isInLHospitalet, LHOSPITALET_BBOX } from './providers/lhospitaletBbox.js';
export {
    LHOSPITALET_JURISDICTION_ID,
    LHOSPITALET_ENVELOPE_VERIFIED,
    LHOSPITALET_PGM_INSTRUMENT_REF,
    LHOSPITALET_ROADMAP_LINE,
    lhospitaletUnverifiedRefusal,
} from './rulepacks/esLHospitalet.js';
// Badalona (INE 08015) — 3rd Catalan city; ROUTED, cited refusal until BADALONA_ENVELOPE_VERIFIED.
export { isInBadalona, BADALONA_BBOX } from './providers/badalonaBbox.js';
export {
    BADALONA_JURISDICTION_ID,
    BADALONA_ENVELOPE_VERIFIED,
    BADALONA_PGM_INSTRUMENT_REF,
    BADALONA_ROADMAP_LINE,
    badalonaUnverifiedRefusal,
} from './rulepacks/esBadalona.js';
// Sant Boi de Llobregat (INE 08200) — 4th Catalan city; ROUTED, cited refusal until SANT_BOI_ENVELOPE_VERIFIED.
export { isInSantBoi, SANT_BOI_BBOX } from './providers/santBoiBbox.js';
export {
    SANT_BOI_JURISDICTION_ID,
    SANT_BOI_ENVELOPE_VERIFIED,
    SANT_BOI_PGM_INSTRUMENT_REF,
    SANT_BOI_ROADMAP_LINE,
    santBoiUnverifiedRefusal,
} from './rulepacks/esSantBoi.js';
// Cornellà de Llobregat (INE 08073) — 5th Catalan city; ROUTED, cited refusal until CORNELLA_ENVELOPE_VERIFIED.
export { isInCornella, CORNELLA_BBOX } from './providers/cornellaBbox.js';
export {
    CORNELLA_JURISDICTION_ID,
    CORNELLA_ENVELOPE_VERIFIED,
    CORNELLA_PGM_INSTRUMENT_REF,
    CORNELLA_ROADMAP_LINE,
    cornellaUnverifiedRefusal,
} from './rulepacks/esCornella.js';
// ── L-608 — Madrid (INE 28079) jurisdiction gate + the NZ 1 explicit-area pack, refusal + ──
// the `ringRef` resolver. The pack ships numeric fields null and a footprint HANDLE; the resolver
// turns that handle into a WGS84 buildable ring per manzana (or a typed refusal — it never throws).
// Until a Madrid proxy is wired AND the zone code is verified, a Madrid parcel REFUSES (never a
// fabricated number) — see `esMadridNZ1.ts` and `registry.ts`.
export { isInMadrid, MADRID_BBOX } from './providers/madridBbox.js';
export {
    ES_MADRID_NZ1_PACK,
    MADRID_NZ1_RULE,
    MADRID_NZ1_ZONE_CODES,
    MADRID_JURISDICTION_ID,
    MADRID_NZ1_ORDINANCE_REF,
    madridNZ1Refusal,
    // STRUCTURAL-SEAM-4 — the Madrid genuine-absence refusal (no-plan-at-point), distinct from the
    // transient `madridNZ1Refusal`.
    madridNZ1AbsentRefusal,
} from './rulepacks/esMadridNZ1.js';
export {
    resolveMadridNZ1Ring,
    MADRID_NZ1_RING_REF,
    MADRID_NZ1_CERTIFIED,
    MADRID_CONDICIONES_PATH,
    MADRID_CONDICIONES_LAYER,
    type MadridLngLat,
    type MadridRingDeps,
    type MadridRingResolution,
    type MadridRingRefusalReason,
} from './providers/resolveMadridNZ1Ring.js';
// ── L-609 / §NL-NATIONWIDE — Netherlands (national) bestemmingsplan explicit-area pack, refusal + ──
// the `ringRef` resolver + maatvoering reader. NATIONWIDE (was Amsterdam-only) and KEYLESS (PDOK RP
// WMS, was RP-API-v4 key-gated). The pack ships numeric fields null and a bouwvlak HANDLE;
// `resolveNlBestemmingsplan` turns that handle into a WGS84 buildable ring PLUS the live maatvoering
// (max bouwhoogte / bebouwingspercentage / bouwlagen) — or a typed refusal (it never throws). With
// `NL_BESTEMMINGSPLAN_CERTIFIED` ON, a parcel with a resolved bouwvlak+maatvoering renders a real
// `structured` envelope; residual cases refuse honestly — see `nlBestemmingsplan.ts`.
// (The coarse jurisdiction gate is `isInNetherlands`, exported from the parcelProviders block below;
//  `isInAmsterdam` is retained there for the city-level probe/coverage callers.)
export { isInAmsterdam, AMSTERDAM_BBOX } from './providers/amsterdamBbox.js';
export {
    NL_BESTEMMINGSPLAN_PACK,
    NL_RULE,
    NL_ZONE_CODE,
    NL_JURISDICTION_ID,
    NL_ORDINANCE_REF,
    bestemmingToPermittedUse,
    nlBestemmingsplanRefusal,
    // STRUCTURAL-SEAM-4 — the NL genuine-absence refusal (no-plan-at-point), distinct from the
    // transient `nlBestemmingsplanRefusal`.
    nlNoPlanRefusal,
} from './rulepacks/nlBestemmingsplan.js';
export {
    resolveNlBestemmingsplan,
    readMaatvoeringen,
    classifyMaatvoering,
    readMaatWaarde,
    ringFromGeoJson,
    NL_RING_REF,
    NL_BESTEMMINGSPLAN_CERTIFIED,
    NL_BESTEMMINGSPLAN_PATH,
    type NlLatLon,
    type NlBpDeps,
    type NlBpResolution,
    type NlBpRefusalReason,
    type NlMaatvoering,
    type MaatvoeringKind,
    type RawMaatvoering,
    type NlBpProxyResponse,
} from './providers/resolveNlBestemmingsplan.js';
// ── BARCELONA-GIS-AUDIT-SPIKE — Barcelona clau 18 (volumetria específica) explicit-area path. ──
// The AMB Refós OV_Trames resolver (footprint + PLANTES floor count, WGS84, never throws) + its
// UNREGISTERED explicit-area pack declaration. Gated on `BCN_REFOS_OV_CERTIFIED` (default OFF): while
// closed, clau 18 keeps its cited refusal and nothing here renders. See `bcnRefosOVProvider.ts`.
export {
    resolveBcnRefosOV,
    parsePlantes,
    BCN_REFOS_OV_CERTIFIED,
    BCN_REFOS_OV_RING_REF,
    BCN_REFOS_OV_PATH,
    BCN_REFOS_OV_LAYER,
    BCN_INE_CODE,
    type BcnLngLat,
    type BcnRefosOVDeps,
    type BcnRefosOVResolution,
    type BcnRefosOVRefusalReason,
    type ParsedPlantes,
} from './providers/bcnRefosOVProvider.js';
export {
    ES_BARCELONA_VOLUMETRIA_18_PACK,
    BCN_VOLUMETRIA_18_RULE,
    BCN_VOLUMETRIA_18_ZONE_CODE,
    BCN_VOLUMETRIA_18_ZONE_CODES,
    BCN_VOLUMETRIA_18_ORDINANCE_REF,
} from './rulepacks/esBarcelonaVolumetria18.js';
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

// ── SWITZERLAND (national) — Outcome-B zone-ID provider + honest envelope refusal + FAR scaffold.
// The national Nutzungsplanung WFS (geodienste.ch ms:grundnutzung) publishes the zone IDENTITY as
// structured data; density is model-slotted + PDF-bound and height unmodelled, so the zone RENDERS
// and the buildable envelope REFUSES. FAR-harvest scaffolded behind CH_FAR_CERTIFIED (default OFF).
export { isInSwitzerland, SWITZERLAND_BBOX } from './providers/switzerlandBbox.js';
export {
    resolveChZone,
    parseChGrundnutzungGml,
    CH_GRUNDNUTZUNG_PATH,
    CH_GRUNDNUTZUNG_LAYER,
    type ChZoneIdentification,
    type ChZoneResolution,
    type ChZoneRefusalReason,
    type ChZoneDeps,
    type ChGrundnutzungFeature,
} from './providers/chGrundnutzungProvider.js';
export {
    CH_JURISDICTION_ID,
    CH_ZONING_PACK,
    CH_ZONING_ORDINANCE_REF,
    CH_ZONING_FALLBACK_ZONE_CODE,
    chZoningEnvelopeRefusal,
    chZoneCodeFor,
    chZoneLabelFor,
} from './rulepacks/chZoning.js';
export {
    resolveChFarFromCantonCatalogue,
    computeZurichBzoEnvelope,
    CH_FAR_CERTIFIED,
    CH_CANTON_FAR_CATALOGUES,
    type ChFarKind,
    type ChFarCatalogueEntry,
    type ChCantonFarCatalogue,
    type ChFarResolution,
    type ZurichBzoComputedEnvelope,
    type ZurichBzoEnvelopeComputation,
    type ComputeZurichBzoEnvelopeInput,
} from './providers/resolveChFarFromCantonCatalogue.js';
// The Zürich BZO zone-parameter catalogue + per-parcel REGIME resolver (pure). The transcription of
// ch/sources/bzo_zone_data.json; `resolveZurichBzoRegime` REFUSES `regime-ambiguous` rather than guess
// (the W2bIII 8.5-vs-9.0 m discrepancy makes a guessed regime a fabricated height).
export {
    resolveZurichBzoRegime,
    resolveZurichBzoEnvelopeParams,
    classifyBzoRegimeFromDocText,
    extractOerebDocIds,
    zurichBzoZoneParams,
    zurichBzoFarFor,
    zurichBzoPendingCertFacts,
    computeZurichBzoGfa,
    // §L-616 — the ENGINE-shaped `structuredFields` a Zürich parcel drops on its C58 ZoningRecord
    // (`{ plotRatioFAR, maxHeight_m, maxFloors }`, regime-aware, null on regime-ambiguity). The L5
    // dispatcher copies it straight into the record so the shared engine's FAR-cap binds the massing.
    zurichBzoStructuredFields,
    type ZurichBzoStructuredFields,
    ZURICH_BZO_ZONE_CATALOGUE,
    ZURICH_BZO_SOURCE_DOCUMENTS,
    ZURICH_BZO_REGIME_BY_DOC,
    ZURICH_ZH_FAR_CATALOGUE,
    ZURICH_CANTON,
    type ZurichBzoRegime,
    type ZurichBzoRegimeInput,
    type ZurichBzoRegimeResolution,
    type ZurichBzoZoneParams,
    type ZurichBzoLegalSource,
    type ZurichBzoEnvelopeParamsInput,
    type ZurichBzoEnvelopeParamsResolution,
} from './providers/chZurichBzoCatalogue.js';

// The OPTIONAL runtime-classify FALLBACK for BZO regime resolution — fetches + classifies a governing
// oerebdocs document when its docid is not yet in the static crosswalk, under a strict error contract
// (`regime-fetch-failed` on transient failure after 2 retries; hard `regime-ambiguous` on a null marker).
export {
    resolveZurichBzoRegimeWithFetch,
    CH_ZURICH_GETDOC_BASE,
    type ZurichBzoRegimeAsyncResolution,
    type ZurichBzoRegimeResolverDeps,
} from './providers/zurichBzoRegimeResolver.js';

// ── PARIS (Ville de Paris, INSEE 75056) — PLU bioclimatique zone-ID + numeric hauteur provider +
// honest envelope refusal. GPU `zone_urba` gives the zone identity (structured) and opendata
// `plub_hauteur` the numeric height ceiling (18/25/31/37 m), but the emprise au sol is PDF-bound, so
// the zone + height RENDER and the buildable envelope REFUSES unless FR_PARIS_PLU_CERTIFIED is signed.
export { isInParis, PARIS_BBOX } from './providers/parisBbox.js';
export {
    resolveParisPluZone,
    resolveParisEnvelope,
    parseParisPluResponse,
    parseParisRing,
    parisFiletMetresForCode,
    parseParisSourceVersion,
    PARIS_PLU_PATH,
    PARIS_ZONE_URBA_LAYER,
    PARIS_HAUTEUR_DATASET,
    PARIS_HMC_DATASET,
    PARIS_FILET_DATASET,
    PARIS_HAUTEUR_SOURCE,
    PARIS_FILET_CODE_TO_METRES,
    type ParisZoneIdentification,
    type ParisPluResolution,
    type ParisPluRefusalReason,
    type ParisPluDeps,
    type ParisPluProxyResponse,
    type ParisPluParsed,
    type ParisHauteurSource,
    type ParisLonLat,
    type ParisEcmParsed,
    type ParisEalParsed,
    type ParisEnvelopeInputs,
    type ParisEnvelopeResolution,
} from './providers/resolveParisPluZone.js';
export {
    PARIS_JURISDICTION_ID,
    FR_PARIS_PLU_CERTIFIED,
    FR_PARIS_PLU_PACK,
    FR_PARIS_UG_ZONE_CODE,
    PARIS_PLU_ORDINANCE_REF,
    PARIS_PLU_MISSING_RULES,
    PARIS_ECM_MISSING_COURONNEMENT,
    PARIS_UG324_CROWN_REF,
    parisUgHeightMassingSupported,
    parisPluEnvelopeRefusal,
    computeParisEnvelope,
    projectParisRingToEnu,
    parisCouronnementRefusal,
    parisZoneCodeFor,
    parisZoneLabelFor,
    type ParisPluRefusalExtras,
    type ParisEnvelopeComponents,
    type ParisEnvelopeComponentStatus,
    type ParisEnvelopeResult,
    type ParisHeightBinding,
} from './rulepacks/frParisPluBioclimatique.js';

// ── SWITZERLAND / canton Zürich (BFS-Nr 261) — the REFERENCE-COMMUNE upgrade (ZURICH-BZO-PROBE). ──
// The City of Zürich BZO WFS (ogd.stadt-zuerich.ch bzo_zone_v) publishes a FINER municipal zone code
// (`typ`, e.g. `W2bIII`) + a DIRECT link to THIS parcel's BZO 700.100 ordinance — a richer zone-ID
// than the national resolver. The Ausnützungsziffer / height stay PDF-bound (Outcome B holds even
// here), so the envelope is a cited refusal that NAMES the per-parcel ordinance. `resolveZurichBzoZone`
// never throws; until the `/api/ch/zurich-bzo` proxy is wired it resolves unreachable and the CH path
// falls through to the national resolver (the Madrid-proxy staging pattern).
export { isInZurichCity, ZURICH_CITY_BBOX } from './providers/zurichBbox.js';
export {
    resolveZurichBzoZone,
    parseZurichBzoGml,
    CH_ZURICH_BZO_PATH,
    CH_ZURICH_BZO_LAYER,
    type ZurichBzoZoneIdentification,
    type ZurichBzoResolution,
    type ZurichBzoRefusalReason,
    type ZurichBzoDeps,
    type ZurichBzoFeature,
} from './providers/zurichBzoProvider.js';
export {
    CH_ZURICH_JURISDICTION_ID,
    CH_ZURICH_BZO_PACK,
    CH_ZURICH_BZO_ORDINANCE_REF,
    CH_ZURICH_BZO_FALLBACK_ZONE_CODE,
    zurichBzoEnvelopeRefusal,
    zurichBzoZoneCodeFor,
    zurichBzoZoneLabelFor,
} from './rulepacks/chZurichBzo.js';

// ── L-613 — the PARCEL-PROVIDER routing registry (country-granularity; the national analogue of the
//    zoning dispatch's city predicates). Routes a WGS84 click to the cadastre that answers there, or
//    to a documented footprint fallback. Pure; the fetch lives in the editor proxies.
//    (isInSwitzerland / SWITZERLAND_BBOX come from the CH block above — the canonical export.)
export {
    resolveParcelJurisdiction,
    resolveParcelCandidates,
    resolveParcelWithFallback,
    parcelJurisdictionSpecificity,
    listParcelJurisdictions,
    UNIVERSAL_FOOTPRINT_JURISDICTION,
    type ParcelJurisdiction,
    type ParcelProviderKind,
    type ParcelFallbackHit,
} from './parcelProviders/registry.js';
export {
    isInSpain, SPAIN_BBOX,
    isInFrance, FRANCE_BBOX,
    isInNetherlands, NETHERLANDS_BBOX,
    isInNorway, NORWAY_BBOX,
    isInGermany, GERMANY_BBOX,
    isInNRW, NRW_BBOX,
    isInSaudiArabia, SAUDI_ARABIA_BBOX,
    type CountryBbox,
} from './parcelProviders/countryBbox.js';
// ── L-449 (Denmark, deferred-data half) — the Denmark (Matriklen) parcel provider on the canonical
//    interface, a DEFERRED STUB (returns null → OSM fallback) until a Datafordeler admin bootstrap
//    exists (MitID-gated, same class as SE BankID). The live adapter is a single method-body swap. ──
export {
    dkMatrikelParcelProvider,
    fetchParcelAtPoint as dkMatrikelFetchParcelAtPoint,
    DK_MATRIKEL_PROVIDER_ID,
    DK_MATRIKEL_PROVIDER_LABEL,
    DK_MATRIKEL_PARCEL_PROXY_PATH,
    type CadastralParcel,
    type LonLat,
    type ParcelHttpFetch,
    type ParcelHttpResponse,
    type DkMatrikelProviderDeps,
} from './parcelProviders/dkMatrikelParcelProvider.js';
