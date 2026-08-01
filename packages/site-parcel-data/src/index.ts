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
    dkByggefeltFromRing,
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
// metadata-unavailable) and the paranoid tier-1 adapters (an unprojected CRS always REFUSES).
// §MULTI-PART-EXPLICIT-AREA — `dkByggefeltFromFeatureEvidence` is the REAL chokepoint: it re-assembles
// all of one feature's per-part records into a multi-part footprint, so the 19.4% of binding
// byggefelter that are multi-part are now placeable. `dkByggefeltFromEvidence` sees ONE part and
// therefore still refuses a multi-part feature - that is a limit of its input, not of the pipeline.
export {
    classifyByggefeltLegalStatus,
    byggefeltFeatureToEvidence,
    byggefeltCollectionToEvidence,
    dkByggefeltFromEvidence,
    dkByggefeltFromFeatureEvidence,
    groupEvidenceByFeature,
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
    PLANDATA_BYGGEFELT_PROXY_PATH,
    type ByggefeltProducer,
    type ByggefeltProducerConfig,
    type ByggefeltQueryOptions,
    type ByggefeltFetchResult,
    type ByggefeltTierOneInput,
    type PlandataBbox,
    type PlandataRequestCrs,
    type ByggefeltRequestStyle,
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
    // §JURISDICTION-SPECIFICITY (L-652) — the ONE rule deciding which registration governs a point
    // two of them claim, and the explicit ambiguity refusal when neither is more specific.
    resolveJurisdictionClaim,
    resolveRegisteredJurisdictionAt,
    JURISDICTION_EXTENT_RESOLUTIONS,
    type JurisdictionExtentResolution,
    type JurisdictionClaim,
    type JurisdictionClaimResolution,
} from './rulepacks/registry.js';

// ── L-550 Phase 0.3 / 1b — THE REFUSAL VOCABULARY. ──
// "No private buildable envelope applies here (clau NN)" is a POSITIVE, cited answer — and until
// now it was inexpressible, so parks, motorways and Collserola were shown a fabricated setback
// triple from the generic estimated pack.
// §L-663 — `estimateSuppressedRefusal` is what the dispatcher publishes where the generic
// `estimated-default` triple used to be drawn INSIDE a registered jurisdiction. See the block
// comment above it in `zoneRefusal.ts` for the prod evidence that earned it.
export {
    buildRefusedEnvelope,
    isRefusedEnvelope,
    isTransientRefusal,
    estimateSuppressedRefusal,
} from './rulepacks/zoneRefusal.js';
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

// ── §BARE-20A-EXHAUSTED (L-673) — the same fourth refusal, with TEN branches instead of two. ──
// Bare `20a` names a *zona*; PGM Arts. 314.5/338.2 enumerate ten suffixed *qualificacions* and
// Arts. 340/342/343 key every envelope parameter to the suffix. What is missing is a SELECTOR, not
// a rule, so no further reading of the plan can close it and no pack may be built on a
// "representative" subzone. ⚠ NO figure reaches the prose — every 20a number is subzone-specific,
// so the ranges live in `BCN_20A_BARE_ORDINANCE_REF` alone (the §DEC-1 discipline, mirrored).
export { barcelona20aSubzoneUndeterminedRefusal } from './rulepacks/esBarcelonaZoneClassification.js';
export { BCN_20A_BARE_ORDINANCE_REF } from './rulepacks/bcn20aSubzones.js';

// ── §CLAU-12-PREDICATE (L-674) — the finding that there is NO geographic predicate to write. ──
// PGM Art. 315.2 states which nuclei the two nucli-antic subzones were drawn for; it delimits
// neither, and hedges the `12b` half with "preferentment". The operative predicate is the plànol
// d'ordenació, which the MUC serves and PRYZM reads — a polygon test here would be a second, weaker
// classifier that could only ever act where it DISAGREED with the authoritative one.
export {
    BCN_CLAU_12_GEOGRAPHIC_PREDICATE_EXISTS,
    BCN_CLAU_12_PREDICATE_FINDING,
} from './rulepacks/esBarcelonaZoneClassification.js';

// ── §COSSOS-SORTINTS (L-672) — tribunes are a permitted projection BEYOND the envelope. ──
// PGM Art. 223.2.g DEFINES a *cos sortint* as that which projects beyond the alignment, Art. 229.2
// classes a tribuna as one, and Art. 230 measures its *vol* FROM the façade plane. So it is not an
// envelope parameter of any KIND, and omitting it can never over-state — the direction C58 §1.4
// forbids. CLOSURE-REGISTER blocker 11 is a morphology layer OVER a resolved envelope, not a gap
// in one.
export {
    barcelonaCosSortintDisposition,
    BCN_ART229_COMPUTATION,
    BCN_ART230_I_ALINEACIONS_DE_VIAL,
    BCN_ART230_III_VOLUMETRIA_ESPECIFICA,
    BCN_COSSOS_SORTINTS_ORDINANCE_REF,
    BCN_COSSOS_SORTINTS_NEVER_OVERSTATE,
    type CosSortintRelation,
    type CosSortintOmissionDirection,
    type CosSortintDisposition,
} from './rulepacks/esBarcelonaCossosSortints.js';

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
    // The honesty gate: false until sign-off; the dispatcher reads it. And the Córdoba refusal
    // vocabulary — the verification gate, the legally-grounded "no" families, and (post
    // §CORDOBA-REFUSAL-SPLIT) the FOUR distinct "no number" values that used to be two: outside the
    // published pilot, no calificación at the point, an unbindable subzone key, and no pack.
    CORDOBA_ENVELOPE_VERIFIED,
    cordobaUnverifiedRefusal,
    cordobaNoRulePackRefusal,
    cordobaOutsidePilotRefusal,
    cordobaNoCalificacionAtPointRefusal,
    cordobaUnbindableSubzoneRefusal,
    cordobaZoneRefusalFor,
    CORDOBA_LEGALLY_REFUSED_ORDENANZAS,
    CORDOBA_PGOU_INSTRUMENT_REF,
    CORDOBA_ROADMAP_LINE,
    CORDOBA_MUNICIPAL_JURISDICTION_ID,
    CORDOBA_MUNICIPAL_ROADMAP_LINE,
} from './rulepacks/esCordobaZoneClassification.js';
export {
    isInCordoba,
    CORDOBA_BBOX,
    // §CORDOBA-MUNICIPAL-CLOSURE — the municipal box exists to make the ESTIMATE unreachable in
    // Córdoba outside the pilot, not to claim coverage of it.
    isInCordobaMunicipality,
    CORDOBA_MUNICIPAL_BBOX,
} from './providers/cordobaBbox.js';
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
    // §L-660 — the Barcelona MPGM of 02-03-2007 (DOGC 4893, 29-05-2007) restating Arts. 327.2a and
    // 328.2a. ⛔ TRANSCRIBED, CITED AND **NOT APPLIED** — `BCN_ART327_MPGM_2007.applied === false`
    // and no resolver reads these bands. Exported so the founder's L-449 decision packet is data a
    // reviewer can diff and test, not prose. Wiring them is a signed legal act; see the constant.
    BCN_ART327_MPGM_2007,
    BCN_ART328_MPGM_2007_BANDS,
    BCN_ART327_MPGM_2007_BAND_DELTA,
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

// ── §FACADE-RASANT-DATUM (L-584) — the HEIGHT DATUM, measured where the ordinance measures it. ──
// PGM Art. 240 measures the *alçada reguladora* from the rasant AT THE FAÇADE LINE, per façade,
// dividing into *trams* where the street falls more than 3 m. PRYZM samples ONE point at the block
// centroid, which is a compliance defect and not a rendering one. This module is the pure decision
// half of the fix: terrain readings are INJECTED, and it refuses — with the article quoted — when
// the terrain cannot resolve the façade or when Art. 240.3.b needs geometry we do not hold.
export {
    facadeSamplePoints,
    assertPostingResolves,
    resolveFacadeRasantDatum,
    resolveParcelRasantDatum,
    RASANT_CENTRE_TOLERANCE_M,
    RASANT_MAX_DROP_M,
    RASANT_NYQUIST_FACTOR,
    type RasantProvenance,
    type RasantSample,
    type FacadeFront,
    type RasantDatumOptions,
    type RasantRule,
    type RasantTram,
    type RasantRefusalCode,
    type RasantRefusal,
    type RasantDatumResult,
} from './geometry/facadeRasantDatum.js';

// ── C58 §2.2 (KG-4) / ADR-0270 / §MULTI-PART-EXPLICIT-AREA — the `explicit-area` PRIMITIVE. ──
// The shared solver for any ordinance that PUBLISHES the buildable footprint as geometry rather than
// as parameters: Madrid NZ 1 (*Fondo de la Edificación*), Córdoba *fondos*, Danish byggefelter.
// It accepts MULTI-PART footprints and interior holes; parts provably clear of the parcel (disjoint
// bounding boxes) are skipped, the rest are clipped, and it REFUSES with a typed reason when the
// answer on this parcel is disjoint or a published hole bites. Jurisdiction-agnostic, PURE.
export {
    resolveExplicitAreaRing,
    solveExplicitArea,
    type ExplicitAreaPart,
    type ExplicitAreaSource,
    type ExplicitAreaResolution,
    type ExplicitAreaRefusalReason,
    type ExplicitAreaSolveInput,
    type ExplicitAreaSolveResult,
    type ExplicitAreaSolveRefusal,
} from './geometry/explicitArea.js';

// ── §MULTI-PART-EXPLICIT-AREA — RING VALIDATION. Names a geometry defect; NEVER repairs one. ──
// A silent repair is a wrong answer with no error raised (the L-616 shape), so these report
// `self-intersecting` / `zero-area` / `unclosed` / `non-finite-coordinate` and let the caller refuse.
export {
    validateRing,
    normaliseRing,
    describeRingDefect,
    ringBounds,
    boundsDisjoint,
    type RingDefect,
    type RingValidationOptions,
    type RingBounds,
} from './geometry/ringValidation.js';

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
// ── §AMB-PGM-SCOPE — the article-by-article map of WHICH PGM-1976 articles are metropolitan and
// WHICH municipality rewrote each one, transcribed from the base text's own numbered footnotes
// (`NN. Veure modificació per al Municipi de <X> a la pàg. <P>`).
//
// ⚠ It carries NO dimension. It answers only "does Art. N stand in its metropolitan form here?",
// and answers `'unknown'` whenever the source does not say. `'metropolitan-no-recorded-modification'`
// is NOT "verified unmodified" — the compendium is expressly non-official, expressly NOT exhaustive
// and consolidated only to 31-12-2009 (`AMB_PGM_SCOPE_CAVEATS`). It is the evidence a founder
// signature would rest on, never a substitute for one.
// Derivation + verbatim quotes: `docs/04-reference/jurisdictions/es/es-ct/AMB-PGM-SCOPE-MAP.md`.
export {
    AMB_PGM_ARTICLE_SCOPE,
    AMB_PGM_SCOPE_CAVEATS,
    AMB_PGM_METROPOLITAN_INSTRUMENT,
    ambArticleScopeFor,
    ambModifiedArticlesFor,
    type AmbPgmModification,
    type AmbPgmArticleScope,
    type AmbArticleScopeVerdict,
    type AmbArticleScopeAnswer,
} from './rulepacks/esAmbPgmScope.js';

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
    LHOSPITALET_PGM_SCOPE_FINDING,
    lhospitaletUnverifiedRefusal,
} from './rulepacks/esLHospitalet.js';
// Badalona (INE 08015) — 3rd Catalan city; ROUTED, cited refusal until BADALONA_ENVELOPE_VERIFIED.
export { isInBadalona, BADALONA_BBOX } from './providers/badalonaBbox.js';
export {
    BADALONA_JURISDICTION_ID,
    BADALONA_ENVELOPE_VERIFIED,
    BADALONA_PGM_INSTRUMENT_REF,
    BADALONA_ROADMAP_LINE,
    BADALONA_PGM_SCOPE_FINDING,
    badalonaUnverifiedRefusal,
} from './rulepacks/esBadalona.js';
// Sant Boi de Llobregat (INE 08200) — 4th Catalan city; ROUTED, cited refusal until SANT_BOI_ENVELOPE_VERIFIED.
export { isInSantBoi, SANT_BOI_BBOX } from './providers/santBoiBbox.js';
export {
    SANT_BOI_JURISDICTION_ID,
    SANT_BOI_ENVELOPE_VERIFIED,
    SANT_BOI_PGM_INSTRUMENT_REF,
    SANT_BOI_ROADMAP_LINE,
    SANT_BOI_PGM_SCOPE_FINDING,
    santBoiUnverifiedRefusal,
} from './rulepacks/esSantBoi.js';
// Cornellà de Llobregat (INE 08073) — 5th Catalan city; ROUTED, cited refusal until CORNELLA_ENVELOPE_VERIFIED.
export { isInCornella, CORNELLA_BBOX } from './providers/cornellaBbox.js';
export {
    CORNELLA_JURISDICTION_ID,
    CORNELLA_ENVELOPE_VERIFIED,
    CORNELLA_PGM_INSTRUMENT_REF,
    CORNELLA_ROADMAP_LINE,
    CORNELLA_PGM_SCOPE_FINDING,
    cornellaUnverifiedRefusal,
} from './rulepacks/esCornella.js';
// ── Murcia (INE 30030), Región de Murcia — the CITED-REFUSAL jurisdiction, wired end to end. ──
//
// ⚠ NOT a Catalan city and NOT routed through any Catalan code path: its instrument is the PGOU de
// Murcia and its zone source is the MUNICIPAL GeoServer, so it gets its own S2 predicate, its own
// S5 registration and its own L5 dispatch branch.
//
// THE THREE PIECES, in the order a click uses them:
//   1. `isInMurcia` / `composeIneCode` — the routing gate. ⚠ Route from the DATA (Catastro's own
//      `<cp>`+`<cm>` compose to 30030), never from a name: "Murcia" is also a town in the
//      Philippines, and a competitor shipped PORTUGUESE tax law onto this Spanish parcel.
//   2. `resolveMurciaZoning` — the ONE impure seam: the live calificación + ámbito at the point,
//      through the same-origin `/api/es/murcia-pgou` proxy. Never throws; failure and absence stay
//      distinct; superseded records (`f_fin` passed) are filtered out, never quoted.
//   3. `murciaEnvelopeDisposition` — PURE. Decides what PRYZM may say. For the TA/TM/UA/UH/UM
//      ámbitos that is a LEGALLY GROUNDED `derived-plan` refusal (PGOU Arts. 6.6.2 / 5.24.5.1 remit
//      the building conditions to a prior instrument, named by its expediente number); everywhere
//      else the weaker `no-rule-pack` coverage refusal. ⚠ There is deliberately NO envelope branch:
//      the layers publish no numeric buildable parameter, so any figure here would be invented.
// `detectDerivedPlanMarkers` reads the instrument named in the CADASTRAL ADDRESS (a nationally
// available signal) to sharpen the refusal — it never adds a number and never upgrades a refusal.
export { isInMurcia, MURCIA_BBOX, MURCIA_INE_CODE, composeIneCode } from './providers/murciaBbox.js';
export {
    MURCIA_JURISDICTION_ID,
    MURCIA_ENVELOPE_VERIFIED,
    MURCIA_ROADMAP_LINE,
    murciaNoRulePackRefusal,
    detectDerivedPlanMarkers,
    type DerivedPlanMarker,
} from './rulepacks/esMurciaEnvelope.js';
export {
    murciaEnvelopeDisposition,
    isInForce,
    parseSectorCode,
    isRemittedAmbito,
    REMITTED_AMBITO_PREFIXES,
    REMITTED_RESIDENTIAL_CALIFICACION,
    MURCIA_FICHA_BASE,
    type MurciaCalificacionFeature,
    type MurciaSectorFeature,
    type MurciaEnvelopeDisposition,
} from './providers/murciaZoningProvider.js';
export {
    resolveMurciaZoning,
    readMurciaCalificacion,
    readMurciaSector,
    MURCIA_PGOU_PATH,
    MURCIA_CALIFICACION_LAYER,
    MURCIA_SECTOR_LAYER,
    type MurciaLatLon,
    type MurciaZoningDeps,
    type MurciaZoningRecords,
    type MurciaZoningResolution,
    type MurciaZoningRefusalReason,
} from './providers/resolveMurciaZoning.js';
// ── The TRANSCRIBED Murcia ordinance: PGOU Normas Urbanísticas, Texto Refundido diciembre 2012. ──
// 14 zones whose every envelope-determining parameter is STATED at parcel granularity, each with
// its article and a verbatim quote. ⚠ Gated: `MURCIA_ENVELOPE_VERIFIED` is false, so the pack
// renders NO number until a human signs the transcription. Two thirds of Murcia's private
// buildable land never reaches it at all — the PGOU delegates that land (see ENVELOPE.md).
//
// ⚠ §MURCIA-PACK-REGISTERED (2026-08-01) — the pack IS now in `registry.ts`'s `packsByZone`, keyed
// by `MURCIA_PGOU2012_ZONE_CODES` (+ the two published sub-variants). That makes it REACHABLE and
// SIGNABLE; it is NOT an authorisation. The gate above is unchanged and the L5 Murcia dispatch
// refuses every parcel before the registry is consulted. See `es-mc/30030-murcia/sources/VERIFICATION.md`.
export {
    ES_MURCIA_PGOU2012_PACK,
    MURCIA_PGOU2012_ZONE_CODES,
    MURCIA_PGOU2012_VARIANT_ZONE_CODES,
    MURCIA_PGOU_SOURCE,
    MURCIA_PGOU_BORM_REFERENCE,
    MURCIA_FIELD_PROVENANCE,
    MURCIA_CALIFICACION_CLASSIFICATION,
    MURCIA_NO_LIMIT_FINDINGS,
    MURCIA_PARCEL_SIZE_CONDITIONS,
    resolveMurciaPgouZone,
    murciaCalificacionClassification,
    type MurciaParameterState,
    type MurciaGranularity,
    type MurciaCalificacionClassification,
    type MurciaPgouResolution,
} from './rulepacks/esMurciaPgou2012.js';
// ╔══════════════════════════════════════════════════════════════════════════════════════════════╗
// ║ ⚠ VALÈNCIA (INE 46250), Comunitat Valenciana — the CITED-REFUSAL jurisdiction whose gate a   ║
// ║   SIGNATURE CANNOT LIFT. Confine València edits to this block.                               ║
// ╚══════════════════════════════════════════════════════════════════════════════════════════════╝
//
// The three surfaces, in the order a parcel meets them:
//   1. `isInValencia` — the coarse routing gate. ⚠ Route from the DATA: Catastro's own `<cp>46</cp>`
//      + `<cm>250</cm>` compose to `46250` through the EXISTING `composeIneCode()` (exported above,
//      from `murciaBbox.ts` — it is NATIONAL, not Murcian; do not write a second one). "Valencia" is
//      also a city in Venezuela, a municipality in the Philippines, a PROVINCE, an AUTONOMOUS
//      COMMUNITY, and — at latitude 39,41 °N, inside València's own latitude band — Valencia de
//      Alcántara in Cáceres. A NAME IS NOT A JURISDICTION.
//   2. `ES_VALENCIA_PGOU_PACK` — the transcribed PGOU *Normas Urbanísticas* (mayo 1991). ⚠ Its
//      `zones` array is EMPTY, and that is the RESULT, not a TODO: Arts. 6.18.2 / 6.19.1 / 6.25.1 /
//      6.30.1 define the envelope as a function of a value graphed on **Plano C**, which is not
//      published as data. The classification table, the two cornice formulas and the stated bounds
//      are exported so the transcription is auditable — not so it can be shipped.
//   3. `valenciaNoRulePackRefusal` — the terminal, cited answer every València parcel receives.
//
// ⚠ `valenciaCorniceHeightFromGraphedFloors` IS A TRANSCRIPTION ARTEFACT, NOT AN ENVELOPE PATH.
// It exists so tests can pin the ordinance's own eight-row table against the formula — which is how
// the "Np = number of storeys" reading was caught (Np is the graphed count MINUS ONE). Calling it
// with a guessed storey count fabricates a determination. There is no production caller.
export {
    isInValencia,
    VALENCIA_BBOX,
    VALENCIA_INE_CODE,
} from './providers/valenciaBbox.js';
export {
    VALENCIA_JURISDICTION_ID,
    VALENCIA_ENVELOPE_VERIFIED,
    VALENCIA_ROADMAP_LINE,
    VALENCIA_ALTURA_LEAD_MEASURED_AT,
    VALENCIA_ALTURA_FIELD_MEASURE,
    valenciaNoRulePackRefusal,
} from './rulepacks/esValenciaEnvelope.js';
export {
    ES_VALENCIA_PGOU_PACK,
    VALENCIA_PGOU_ZONE_CODES,
    VALENCIA_PGOU_SOURCE,
    VALENCIA_PGOU_GVA_DEPOSIT,
    VALENCIA_PGOU_LATER_MODIFICATIONS,
    VALENCIA_FIELD_PROVENANCE,
    VALENCIA_CALIFICACION_CLASSIFICATION,
    VALENCIA_CORNICE_FORMULAS,
    VALENCIA_ENS_HEIGHT_TABLE,
    VALENCIA_STATED_BOUNDS,
    VALENCIA_DELEGATION_SHARE,
    VALENCIA_LAND_SHARE_MEASURED_2026_08_01,
    resolveValenciaPgouZone,
    valenciaCalificacionClassification,
    valenciaCorniceHeightFromGraphedFloors,
    type ValenciaParameterState,
    type ValenciaGranularity,
    type ValenciaCalificacionClassification,
    type ValenciaCorniceFormula,
    type ValenciaPgouResolution,
} from './rulepacks/esValenciaPgou.js';
// ╔══════════════════════════════════════════════════════════════════════════════════════════════╗
// ║ ⚠ END OF THE VALÈNCIA BLOCK.                                                                 ║
// ╚══════════════════════════════════════════════════════════════════════════════════════════════╝

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
    MADRID_NZ1_CODE_PREFIX,
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
// ── §MADRID-PGOUM97-WIRING — the TRANSCRIBED Madrid ordinance: PGOUM-97 Título 8, Normas Zonales ──
// 4/5/7/8/9 (23 of the 34 live `AMB_TX_ETIQ` codes), read from the Compendio 2025 by
// `tools/madrid-extract/` with article + apartado + page + verbatim quote on every value.
//
// ⚠⚠ `MADRID_ENVELOPE_VERIFIED` IS **FALSE** AND EXPORTING THE PACK DOES NOT CHANGE THAT. A machine
// read the ordinance; no human has signed the transcription, so the L5 dispatcher renders
// `madridPgoum97UnverifiedRefusal` for every one of these zones and NO number is published. The
// export exists so the dispatcher imports the gate rather than restating it — exactly as
// `CORDOBA_ENVELOPE_VERIFIED` is imported — and so `registry.ts` and the tests read one pack object.
//
// ⚠ FOUR PARAMETERS IN THIS PACK ARE CONSTRUCTIONS, NOT SCALARS (the ADR-0271 class): NZ 4's
// edificabilidad is an ALGORITHM (`plotRatioFAR: null` — there is no NZ 4 FAR); NZ 4's and NZ 9
// g1/g2's heights are STREET-WIDTH TABLES (`madridAnchoDeCalle.ts`, exported below); several
// retranqueos are height-proportional FORMULAS whose printed metre is only the floor
// (`resolveMadridSeparation_m`); and NZ 8 grado 6º's FAR is a STEP FUNCTION of parcel area
// (`madridNZ86BuildableArea_m2`). Reading a scalar off any of them is the L-526 failure.
export {
    ES_MADRID_PGOUM97_PACK,
    MADRID_PGOUM97_ZONE_CODES,
    MADRID_NZ3_ZONE_CODES,
    MADRID_ENVELOPE_VERIFIED,
    MADRID_PGOUM97_SOURCE,
    MADRID_PGOUM97_GRANULARITY,
    MADRID_PGOUM97_DEFAULT_CONFIDENCE,
    MADRID_PGOUM97_FIELD_PROVENANCE,
    MADRID_PGOUM97_RULE_KINDS,
    MADRID_FLOOR_ONLY_SEPARATIONS,
    MADRID_NZ4_RULE,
    MADRID_NZ4_TESTERO_SEPARATION,
    MADRID_NZ5_LINDERO_SEPARATION,
    MADRID_NZ8_TESTERO_SEPARATION,
    MADRID_NZ86_LATERAL_SEPARATION,
    MADRID_NZ9_TESTERO_SEPARATION,
    MADRID_NZ86_FAR_STEP_M2,
    MADRID_NZ86_FAR_FIRST,
    MADRID_NZ86_FAR_EXCESS,
    madridNZ86BuildableArea_m2,
    resolveMadridSeparation_m,
    madridNZ3Refusal,
    madridPgoum97UnverifiedRefusal,
    madridUnknownZoneRefusal,
    type MadridProportionalSeparation,
} from './rulepacks/esMadridPgoum97.js';
// The three Art. 8.4.10 / 8.9.10.1 *ancho de calle* cuadros — Madrid's height is a STREET-WIDTH
// TABLE, not a scalar. ⚠ Nothing feeds it a width yet (no Madrid street-width source exists; L-537
// measured Madrid's quantum set as {15, 30}, which must NOT be confused with Barcelona's {20, 30}),
// so NZ 4 / 9.1 / 9.2 publish no height and the table refuses at a band edge rather than guessing.
export * from './rulepacks/madridAnchoDeCalle.js';
// §MADRID-ZONE-ROUTING — the LIVE Norma-Zonal resolver: which of the 34 `AMB_TX_ETIQ` codes governs
// this parcel. The routing seam that made every Madrid pack reachable from a click. Returns IDENTITY
// only — `sources/VERIFICATION.md` V7 is a VERIFIED-NEGATIVE that no PGOUM-97 service publishes any
// altura/edificabilidad/retranqueo attribute at all.
export {
    resolveMadridNormaZonal,
    readMadridZoneFeature,
    MADRID_NORMAS_ZONALES_PATH,
    MADRID_NORMAS_ZONALES_LAYER,
    MADRID_ZONE_CODE_FIELD,
    MADRID_ZONE_LABEL_FIELD,
    type MadridZoneLatLon,
    type MadridNormaZonalDeps,
    type MadridNormaZonalResolution,
    type MadridNormaZonalRefusalReason,
} from './providers/resolveMadridNormaZonal.js';
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
