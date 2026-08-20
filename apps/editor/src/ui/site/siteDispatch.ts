// A.8.a / A.8.c — shared L5 site-dispatch helpers.
//
// WHY THIS EXISTS
// ---------------
// `createSiteFromRect.ts` (A.7.c.x) is the stub-GIS console path: it inlines
// site.create + site.updateLocation + site.setParcelBoundary against
// `runtime.siteModelStore`. The REAL GIS authoring surfaces (the geocode search
// box A.8.a + the polygon-draw tool A.8.c) need the SAME pure-handler dispatch
// path but from interactive UI, and they author location + boundary
// INDEPENDENTLY (geocode sets location; draw sets boundary) rather than in one
// shot. This module factors the dispatch glue so both surfaces share it without
// duplicating the create/emit/toast boilerplate.
//
// Same contract as createSiteFromRect's header: the `site.*` handlers are pure
// `(payload, store) → result`; this is the L5 adapter that runs them against
// `runtime.siteModelStore`, emits the domain event on `runtime.events`, and
// surfaces a toast. When the full bus-registered site command surface lands,
// these switch to `runtime.bus.executeCommand`.

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    siteCreate,
    siteUpdateLocation,
    siteSetParcelBoundary,
    siteUpdateZoning,
    siteReplace,
    type SiteModelStore,
} from '@pryzm/stores';
import type {
    ParcelEdgeClassification,
    SiteModel,
    BuildableEnvelope,
    EnvelopeConfidence,
    ZoningRecord,
    ZoningRule,
    Pt,
    // §L-1580 (C57 §1.4 / §2.2) — the persisted cadastral attribution of a committed parcel.
    ParcelProvenance,
} from '@pryzm/schemas';
import { SiteModelSchema } from '@pryzm/schemas';
// ADR-0270 — "does this zone's rule need a cadastral block to solve?" asked of the RULE, not of a
// clau literal, so a parcel-only pack for any city takes the parcel-only branch automatically.
import { requiresBlockRing } from '@pryzm/schemas';
// §L-430 slice 3 — parcel→θ derivation + the true→project free-vector rotation used to square
// the committed ring into the authoring frame (ADR-0115 dual-north primitive).
import {
    deriveProjectNorthAngleFromParcel,
    trueVectorToProjectNorth,
} from './overlay/projectTrueNorth';
import {
    solveEstimatedEnvelope,
    computeBuildableEnvelope,
    DkZoningProvider,
    type DkZoningResult,
    isInDenmark,
    // ADR-0271 §BCN-REAL-ENVELOPE — Barcelona ensanche real-envelope path.
    isInBarcelona,
    // L-606 — Riyadh (Saudi Arabia) DEMO path. The MOMRAH national residential FOOTPRINT mapped
    // onto the plain `setback` kind: the class is a user dropdown and the fronting street width is
    // user-supplied (no reachable parcel feed), so the width-dependent setback triple is resolved
    // per-parcel here via `saRiyadhResolvedPack` and handed to `computeBuildableEnvelope`.
    isInRiyadh,
    saRiyadhResolvedPack,
    saRiyadhZoneCodeForClass,
    SA_RIYADH_JURISDICTION_ID,
    SA_HEIGHT_PLAN_DEFERRED_REF,
    type SaudiPlotClass,
    // L-608 — Madrid (INE 28079) NZ 1 explicit-area path. The pack ships numeric fields null and a
    // footprint HANDLE; `resolveMadridNZ1Ring` SPATIAL-intersects the parcel's WGS84 point against the
    // published PGOUM-97 plane (via the `/api/madrid/condiciones` proxy) and returns a WGS84 buildable
    // ring (or refuses — it never throws). Gated on `MADRID_NZ1_CERTIFIED` (ON since L-608, 2026-07-25):
    // a resolved footprint renders `estimated-ruleset` (real published geometry; the COEF_Z semantics
    // stay withheld), NEVER `structured`. RECONCILED 2026-07-27 — this comment previously said "default
    // OFF … while closed this path REFUSES", contradicting the flipped-ON flag. The refusal is now the
    // residual answer, split by STRUCTURAL-SEAM-4: a genuine no-footprint point → `madridNZ1AbsentRefusal`
    // (no-plan-at-point), a source that did not answer → the auto-retried transient `madridNZ1Refusal`.
    isInMadrid,
    resolveMadridNZ1Ring,
    MADRID_NZ1_RING_REF,
    MADRID_NZ1_CERTIFIED,
    ES_MADRID_NZ1_PACK,
    MADRID_NZ1_ZONE_CODES,
    MADRID_NZ1_CODE_PREFIX,
    madridNZ1Refusal,
    // §MADRID-PGOUM97 — the zone-code ROUTING seam + the human gate on the transcribed Título 8 pack.
    //
    // `resolveMadridNormaZonal` point-intersects `NORMAS_ZONALES/MapServer/0.AMB_TX_ETIQ` (via the
    // `/api/madrid/normas-zonales` proxy) and answers WHICH of the 34 live Norma-Zonal codes governs
    // the parcel. That answer is what makes NZ 1 / NZ 3 / NZ 4-5-7-8-9 three different destinations
    // instead of one blanket path — before it, every Madrid click tried the NZ 1 footprint plane and
    // an NZ-8 parcel was told "no NZ-1 footprint here", which is true and useless.
    //
    // ⚠⚠ `MADRID_ENVELOPE_VERIFIED` IS **FALSE** AND THIS PATH MUST NOT RENDER A NUMBER WHILE IT IS.
    // Every value in `ES_MADRID_PGOUM97_PACK` was MACHINE-EXTRACTED from the Compendio 2025; a wrong
    // number there would be PRYZM's own pipeline's error. Same discipline as `CORDOBA_ENVELOPE_VERIFIED`.
    resolveMadridNormaZonal,
    MADRID_ENVELOPE_VERIFIED,
    MADRID_PGOUM97_ZONE_CODES,
    MADRID_NZ3_ZONE_CODES,
    madridNZ3Refusal,
    madridPgoum97UnverifiedRefusal,
    madridUnknownZoneRefusal,
    // L-550 Phase 0.1/0.3 — the rule-pack REGISTRY replaced the hard-coded
    // `BCN_ENSANCHE_ZONE_CODES.includes(clau)` gate that used to live here, so a new clau (or a
    // new city) is a data addition in `@pryzm/site-parcel-data`, not an edit to this L5 file
    // (C58 §1.5). It answers `pack` / `refusal` / `unregistered` — three outcomes, because
    // "the ordinance grants no envelope here" and "PRYZM has not encoded this zone yet" are
    // opposite claims and the old boolean collapsed them.
    resolveZoneDisposition,
    buildRefusedEnvelope,
    // §L-663 — the two halves of "the estimated pack is unreachable inside a city we cover".
    // `resolveRegisteredJurisdictionAt` is the registry's OWN §JURISDICTION-SPECIFICITY rule
    // applied to `listJurisdictionCoverage()` — the same predicates the `if` chain in
    // `applyZoning` routes on, asked once, in one place. Importing it (rather than restating
    // "is this Barcelona?" a third time) is what keeps the guard from drifting away from the
    // dispatch it guards.
    resolveRegisteredJurisdictionAt,
    estimateSuppressedRefusal,
    // §L-591 — clau `20a/*` (*edificació aïllada*). Its rule is a plain `setback` inset from the
    // parcel's own boundary, so it must NOT be routed through the block-derived Art. 242 path.
    // Two of the ten subzones state their numbers as CONSTRUCTIONS, resolved per parcel here.
    resolve20aEdificabilitat,
    resolve20aParcelOverrides,
    // §L-574 — the third refusal: an ENCODED clau whose construction could not complete.
    barcelonaConstructionIncompleteRefusal,
    type ConstructionFailureReason,
    // §AMB-UNBIND (2026-08-02) — `BCN_JURISDICTION_ID` is deliberately NO LONGER IMPORTED here.
    // `applyBcnZoningThenFallback` reads the jurisdiction from its `AmbRegisteredMunicipality`
    // parameter instead, so there is no module-level Barcelona constant left in this file for a
    // future edit to reach for as a "sensible default" on another municipality's land.
    dissolveParcelsToBlockRing,
    classifyBlockFrontages,
    type RoadPolyline,
    // L-445 fallback 3 — re-inset from PERSISTED setbacks for projects committed before the
    // ring-persistence fix. C58 §1.7a permits this for `setback` zones only; see the guard.
    insetPolygonPerEdge,
    // L-525a — the HEIGHT half of the alignment construction, the counterpart to Art. 242's depth.
    // Both refuse rather than guess; see their module headers.
    // §L-583 — ZONE-KEYED, not article-keyed. This used to call `resolveAlcadaReguladora` (Art. 327
    // = Subzona I) directly and stamp the literal "Art. 327.2" into the derivation row. With clau
    // 13b now packed, that would hand a Subzona II parcel Art. 327's numbers under Art. 327's
    // citation — a wrong height carrying a confident citation to an article that does not govern
    // that land (the L-526 failure class). The registry answers WHICH article; see
    // `bcnAlcadaByZone.ts`.
    resolveBcnAlcadaForZone,
    officialStreetWidthForAddress,
    // L-537 — the *amplada de vial* CONSTRUCTION that replaced the ~26-street allow-list as the
    // primary width source. Measurement is region-agnostic and costs NO extra network (the
    // opposing frontage already arrived in the block bbox); the quantum set is Barcelona's own,
    // derived from a measured distribution, not from intuition.
    measureStreetWidths,
    governingStreetWidth,
    blockEdgesFacingParcel,
    resolveAmpladaDeVial,
    BCN_STREET_WIDTH_QUANTISATION,
    // §L-583 — `BCN_ORDINANCE_REF` (the 13a citation) is deliberately NO LONGER imported here.
    // The height derivation row now carries the citation `resolveBcnAlcadaForZone` returned
    // alongside the article that produced the number, so the two cannot drift apart per clau.
    // ── Córdoba (INE 14021) PGOU-2001 pilot — the jurisdiction gate + the HONESTY GATE. ──
    // The pack is machine-OCR'd + `pipeline-extracted-unverified`; `CORDOBA_ENVELOPE_VERIFIED` is
    // false until a human signs `sources/VERIFICATION.md`, so `applyCordobaZoningThenFallback`
    // dispatches `cordobaUnverifiedRefusal` (a cited "machine-extracted, unverified" card) and NO
    // number reaches the panel/massing. A number renders only AFTER sign-off.
    isInCordoba,
    CORDOBA_ENVELOPE_VERIFIED,
    cordobaUnverifiedRefusal,
    cordobaNoRulePackRefusal,
    // §COR-COMPUTE (2026-08-03, re-landed 2026-08-04 after a concurrent-edit revert — see
    // ENVELOPE-PIPELINE-FORENSIC-BLOCKER-ANALYSIS.md for the incident) — the two symbols the
    // compute branch needs once the gate is signed: the jurisdiction id for the ZoningRecord, and
    // the pack itself.
    CORDOBA_JURISDICTION_ID,
    ES_CORDOBA_PGOU2001_PACK,
    // §COR-SUBZONE (CLOSURE-REGISTER blocker 3) — authored since 068a02ce and never called. It
    // renders NO number (the gate stays shut); it makes the REFUSAL SPECIFIC — the same job
    // `server/murciaPgouProxy.js` documents for Murcia: "to make that refusal SPECIFIC …, never to
    // produce a figure". `cordobaUnverifiedRefusal` was written to take a subzone and the
    // dispatcher was passing `null` on every parcel.
    resolveCordobaSubzone,
    // §COR-MC-ANCHO (2026-08-04) — the MC per-street-width height table (Art. 13.5.3.1), resolved
    // PURELY against a MEASURED width with the ADR-0287 band-edge guard. The MEASUREMENT itself
    // (`resolveCordobaMcStreetWidth`) lives beside `CatastroBlockProvider` — see its own header
    // for why (packages may not import apps/editor's same-origin proxy client).
    CORDOBA_MC_HEIGHT_ARTICLE,
    resolveCordobaMcHeightForWidth,
    cordobaMcResolvedPack,
    // §COR-STREET-WIDTH (2026-08-04) — the PRIMARY width source for MC's Art. 13.5.3.1 table: the
    // Ayuntamiento's own PUBLISHED `idecordoba:manzana` block layer, live-verified at
    // `ide.cordoba.es` (ADR-0283/ADR-0290: published geometry outranks geometry PRYZM derives
    // itself). This one is L2-pure and lives in @pryzm/site-parcel-data, unlike the older
    // Catastro-dissolve `resolveCordobaMcStreetWidth` below, which stays as the FALLBACK wherever
    // the manzana layer does not cover a point (§COR-MC-ANCHO's own call site tries this one first).
    resolveCordobaStreetWidth,
    type CordobaMcZone,
    // §COR-TRACED-ZONE (2026-08-05) — the municipal bbox (widens the pilot's `isInCordoba` to the
    // whole of Córdoba, so the traced-zone branch can see land the pilot does not cover) + the
    // OFFLINE hand-traced-CUS-sheet resolver + its OWN independent honesty gate. See
    // `applyCordobaTracedZoneThenFallback`'s header for why this must NOT read
    // `CORDOBA_ENVELOPE_VERIFIED` — a different, unrelated sign-off.
    isInCordobaMunicipality,
    resolveCordobaTracedZone,
    CORDOBA_TRACED_ZONES_VERIFIED,
    // §COR-MANUAL-ADMIN-ZONE (2026-08-05) — the LIVE, server-backed admin-entry provider. A small
    // named `PRYZM_ADMIN` allowlist can type a zone code and see it computed immediately, in their
    // OWN session only. Never inherits `CORDOBA_ENVELOPE_VERIFIED` / `CORDOBA_TRACED_ZONES_VERIFIED`
    // — see `resolveCordobaManualAdminZone.ts`'s header. Checked FIRST in the Córdoba chain (before
    // even the pilot's `isInCordoba`), so an admin's manual entry can override any Córdoba parcel for
    // testing, while remaining a byte-for-byte no-op for every non-admin session (no auth token ⇒
    // no network call at all).
    resolveCordobaManualAdminZone,
    // §COR-RASTER-ZONE (2026-08-05) — the THIRD and weakest Córdoba zone-identity source: machine
    // classification of the CUS sheets' colour fields, snapped to Catastro parcels. Tried only after
    // the hand-traced store misses. ⚠ Resolves a FAMILY, never a subzone, so it can only make a
    // refusal more specific — it never authorises a number. Its own third gate, default OFF; see
    // `applyCordobaRasterClassifiedZoneThenFallback`'s header.
    resolveCordobaRasterClassifiedZone,
    CORDOBA_RASTER_CLASSIFIED_ZONES_VERIFIED,
    // ── Sevilla (INE 41091) — 15/15 live zona_orden codes transcribed, SIGNED 2026-08-05. ──
    // `SEVILLA_ENVELOPE_VERIFIED` is `true` (sources/VERIFICATION.md §SIG-1). `resolveSevillaZone`
    // queries the city's own ArcGIS "Calificación" layer (25, EPSG:25830); §SEV-COMPUTE below
    // computes a real envelope for the 6 non-refused zones, and the refusal still names the real
    // `zona_orden` for the 9 that structurally refuse or for any unresolved point.
    isInSevilla,
    resolveSevillaZone,
    sevillaNoRulePackRefusal,
    SEVILLA_JURISDICTION_ID,
    ES_SEVILLA_PGOU_PACK,
    SEVILLA_PGOU_ZONE_CODES,
    SEVILLA_ENVELOPE_VERIFIED,
    // §STAGING-UNCERTIFIED-PREVIEW — SB's real `fondo máximo edificable` geometry (confirmed live
    // 2026-08-04, ArcGIS layer 4 `A_INTERIOR-MAXIMA`). See `applySevillaZoningThenFallback`.
    resolveSevillaAlignments,
    clipParcelByFondoLine,
    nearestFondoLine,
    // ── Zaragoza (INE 50297), Aragón — the CITED-REFUSAL jurisdiction (§ZGZ-SUBGRADO). ──
    // Zaragoza's municipal calificación is live and parcel-precise (`resolveZaragozaZone` →
    // `urbanismo:Calificaciones_Urbanas`), but `ZARAGOZA_ENVELOPE_VERIFIED` stays false until a
    // human transcribes arts. 4.1.12/4.1.13/4.1.15/4.1.17 and signs `sources/VERIFICATION.md` — so
    // `applyZaragozaZoningThenFallback` dispatches `zaragozaNoRulePackRefusal` (naming the resolved
    // grade when one resolves) and NO number reaches the panel/massing. Same discipline as Córdoba.
    isInZaragoza,
    ZARAGOZA_ENVELOPE_VERIFIED,
    ZARAGOZA_JURISDICTION_ID,
    ZARAGOZA_ZONE_CODES,
    ES_ZARAGOZA_PGOU2024_PACK,
    zaragozaNoRulePackRefusal,
    resolveZaragozaZone,
    // §ZGZ-A13-ANCHO-DE-CALLE / §OPEN-TOP-INDICATIVE — the indicative drawing arm, built on the
    // Balears posture pattern. `ZARAGOZA_ENVELOPE_VERIFIED` is deliberately NOT branched on twice
    // here (§MURCIA-GATE-BYPASS-REGRESSION) — `envelopePublicationPosture` is the one decision
    // point, imported once above for Balears and reused verbatim for Zaragoza.
    resolveZaragozaA13Height,
    zaragozaA13ResolvedPack,
    resolveZaragozaStreetWidth,
    type ZaragozaZoneCode,
    type OpenTopIndicativeRecord,
    // ── Telde (INE 35026, Gran Canaria) — the CITED-REFUSAL jurisdiction, SIPU EDIF. ──
    // Telde's SIPU EDIF zones resolve via `resolveTeldeZone` — an OFFLINE point-in-polygon join
    // against a committed extract of the real `EDIF.shp`/`EDIF.dbf` pair (rewritten 2026-08-04; see
    // that file's header for why IDECanarias' disabled WFS was never actually load-bearing here).
    // `CANARIAS_ENVELOPE_VERIFIED` stays false until a human signs `sources/VERIFICATION.md`, so
    // `applyTeldeZoningThenFallback` dispatches `canariasNoRulePackRefusal` (packed/unresolved
    // zones) or `canariasGraphedRefusal` (GRF/graphed zones, per `TELDE_GRAPHED_ZONE_CODES`) —
    // naming the resolved zone and its `TELDE_UNPACKED_ZONES` reason when applicable — and NO
    // number reaches the panel/massing. Same discipline as Córdoba/Zaragoza.
    isInTelde,
    TELDE_JURISDICTION_ID,
    CANARIAS_ENVELOPE_VERIFIED,
    ES_TELDE_PGO2003_PACK,
    TELDE_PGO2003_ZONE_CODES,
    TELDE_UNPACKED_ZONES,
    TELDE_GRAPHED_ZONE_CODES,
    canariasNoRulePackRefusal,
    canariasGraphedRefusal,
    resolveTeldeZone,
    // ── Envelope Phase 2 — L'Hospitalet de Llobregat (INE 08101), the SECOND Catalan municipality. ──
    // The S2 router predicate + the S5 honesty gate. L'Hospitalet shares Barcelona's MUC + PGM-1976,
    // so it is ROUTED — but `LHOSPITALET_ENVELOPE_VERIFIED` is false until a human verifies its
    // numbers equal Barcelona's, so `applyLHospitaletZoningThenFallback` dispatches a cited refusal
    // (never a borrowed Barcelona envelope). Checked BEFORE `isInBarcelona` (L'Hospitalet is inside
    // the loose Barcelona metro box), so Barcelona stays byte-identical.
    isInLHospitalet,
    LHOSPITALET_ENVELOPE_VERIFIED,
    isInBadalona,
    BADALONA_ENVELOPE_VERIFIED,
    badalonaUnverifiedRefusal,
    isInSantBoi,
    SANT_BOI_ENVELOPE_VERIFIED,
    santBoiUnverifiedRefusal,
    isInCornella,
    CORNELLA_ENVELOPE_VERIFIED,
    cornellaUnverifiedRefusal,
    lhospitaletUnverifiedRefusal,
    // ── Murcia (INE 30030), Región de Murcia — the CITED-REFUSAL jurisdiction. ──
    // ⚠ NOT Catalonia. Murcia shares NO instrument, NO zone source and NO predicate with the five
    // AMB municipalities above: its instrument is the PGOU de Murcia and its zoning comes from the
    // MUNICIPAL GeoServer, so it gets its own gate (`isInMurcia`), its own live resolver
    // (`resolveMurciaZoning` → `/api/es/murcia-pgou`) and its own PURE disposition
    // (`murciaEnvelopeDisposition`). The disposition is a REFUSAL in every branch — the layers
    // publish no numeric buildable parameter at all — but for the TA/TM/UA/UH/UM ámbitos it is the
    // ORDINANCE'S OWN answer (`derived-plan`, `legallyGrounded: true`), citing PGOU Arts. 6.6.2 /
    // 5.24.5.1 and naming the expediente of the instrument the user must obtain.
    isInMurcia,
    // §MURCIA-GATE-BYPASS-REGRESSION — `MURCIA_ENVELOPE_VERIFIED` is deliberately NOT imported here
    // any more. This dispatcher used to branch on it directly, and that is precisely how flipping it
    // silently skipped the whole disposition. The gate belongs to ONE decision point —
    // `murciaEnvelopeDisposition`, which reads it as a default parameter — so there is exactly one
    // place where "may PRYZM publish?" is answered. Re-importing it to add a second test here would
    // reintroduce the defect.
    MURCIA_ROADMAP_LINE,
    MURCIA_JURISDICTION_ID,
    ES_MURCIA_PGOU2012_PACK,
    murciaEnvelopeDisposition,
    murciaNoRulePackRefusal,
    // §MURCIA-ANCHO-DE-CALLE (SIG-MU2) — the street-width height path for RC / RM / RN. The
    // MEASUREMENT is the region-agnostic `measureStreetWidths` (ADR-0275); these three are Murcia's
    // own tables, its constructed-width provider, and the per-parcel pack the engine consumes.
    resolveMurciaStreetWidth,
    resolveMurciaAnchoDeCalle,
    murciaAnchoResolvedPack,
    MURCIA_ANCHO_ZONE_CODES,
    type MurciaAnchoZone,
    detectDerivedPlanMarkers,
    resolveMurciaZoning,
    type DerivedPlanMarker,
    // ── §VALENCIA-ORIGEN-DERIVED-PLAN (2026-08-03), CLOSURE-REGISTER #3 — the València (INE 46250)
    // per-parcel LIVE `origen` upgrade. `VALENCIA_ENVELOPE_VERIFIED` is deliberately NOT imported
    // here (the §MURCIA-GATE-BYPASS-REGRESSION lesson, applied pre-emptively): this branch never
    // publishes a number, so there is no gate for it to bypass, and importing the constant would
    // invite a future edit to branch on it directly instead of through the one decision point
    // (`valenciaOrigenIsPgouOrdered`). `resolveValenciaOrigen` is the live fetch (never throws);
    // `valenciaDerivedPlanRefusal` / `valenciaNoRulePackRefusal` are the two refusal tiers.
    isInValencia,
    resolveValenciaOrigen,
    valenciaOrigenIsPgouOrdered,
    valenciaDerivedPlanRefusal,
    valenciaNoRulePackRefusal,
    VALENCIA_JURISDICTION_ID,
    // ── §BALEARS-ENVELOPE (L-680) — the Illes Balears. Same shape as Murcia, one rung better data. ──
    // ⚠ `BALEARS_ENVELOPE_VERIFIED` is deliberately NOT imported (the §MURCIA-GATE-BYPASS-REGRESSION
    // lesson, applied pre-emptively). The branch asks `envelopePublicationPosture()` — the ONE
    // decision point, which reads the gate AND the open-top registry — so there is exactly one place
    // where "may PRYZM publish?" is answered, and opening either door needs no edit here.
    isInBalears,
    resolveBalearsMuib,
    balearsResolvedPack,
    balearsRefusal,
    balearsRefusalIsTransient,
    BALEARS_JURISDICTION_ID,
    BALEARS_ROADMAP_LINE,
    BALEARS_MISSING_CONSTRAINTS,
    envelopePublicationPosture,
    // §OPEN-TOP-INDICATIVE — the MEASURED renderer capability, not a permission. The indicative
    // drawing arm below is gated on it, so if the render path ever regresses the arm self-disables
    // rather than shipping a solid that looks complete (ADR-0293).
    rendererCanExpressOpenTop,
    // BARCELONA-GIS-AUDIT-SPIKE — clau 18 (volumetria específica) explicit-area path. The AMB Refós
    // OV_Trames resolver (footprint + PLANTES floor count, WGS84, never throws) + its UNREGISTERED
    // pack. Gated on `BCN_REFOS_OV_CERTIFIED` (default OFF): while closed, clau 18 keeps its cited
    // refusal (`resolveZoneDisposition` still refuses it) and this branch is skipped entirely.
    resolveBcnRefosOV,
    BCN_REFOS_OV_RING_REF,
    BCN_REFOS_OV_CERTIFIED,
    BCN_VOLUMETRIA_18_ZONE_CODE,
    BCN_VOLUMETRIA_18_ORDINANCE_REF,
    // §AMB-REFOS-MUNICIPALITIES / §AMB-VOLUMETRIA-18 (2026-08-02) — the clau-18 path is now
    // parameterised on the AMB municipality (a branded INE code) instead of hardcoding Barcelona in
    // three places. `AMB_BARCELONA` is what this dispatcher passes; the pack is RESOLVED from the
    // municipality and returns `null` for the other 35, so the cited refusal stands rather than
    // another town's land being answered under Barcelona's Art. 306 citation.
    AMB_BARCELONA,
    ambVolumetria18PackFor,
    type AmbRegisteredMunicipality,
    heightFromFloorsAboveGround,
    // SWITZERLAND — Outcome-B zone-ID path. `resolveChZone` (never throws) identifies the zone from
    // the national Nutzungsplanung WFS; the buildable envelope REFUSES (density/height are model+PDF-
    // bound), carrying the identified zone as `knownFacts` so it renders. NO estimated fallback — an
    // estimate would be a fabricated number the recon proved we cannot cite.
    isInSwitzerland,
    resolveChZone,
    chZoningEnvelopeRefusal,
    chZoneCodeFor,
    chZoneLabelFor,
    // SWITZERLAND / canton Zürich (BFS-Nr 261, the reference commune) — the finer municipal BZO
    // zone-ID. `resolveZurichBzoZone` (never throws) returns the `typ` code + a DIRECT link to this
    // parcel's BZO 700.100 ordinance; the envelope still REFUSES (AZ/height are PDF-bound — Outcome B
    // holds even here), but the refusal NAMES the per-parcel ordinance. Until the `/api/ch/zurich-bzo`
    // proxy is wired the resolve is unreachable and this falls through to the national CH path.
    isInZurichCity,
    resolveZurichBzoZone,
    zurichBzoEnvelopeRefusal,
    zurichBzoZoneCodeFor,
    zurichBzoZoneLabelFor,
    // §L-616 — the COMPUTED Zürich BZO envelope, gated on the owner sign-off `CH_FAR_CERTIFIED`
    // (ch/sources/VERIFICATION.md 2026-07-26). `zurichBzoStructuredFields` resolves the regime-aware
    // `{ plotRatioFAR (AZ), maxHeight_m, maxFloors }` (or null when the regime is undetermined /
    // the zone is not in the regime); fed to the shared engine with `rulePack: null`, the AZ binds
    // `farLimitedHeight_m` so the massing is GFA-capped, never footprint×height (OVERSTATES-FAR).
    zurichBzoStructuredFields,
    CH_FAR_CERTIFIED,
    CH_ZURICH_JURISDICTION_ID,
    CH_ZURICH_BZO_ORDINANCE_REF,
    // §DK-HONEST-REFUSAL — Denmark is a PACKED jurisdiction, so when Plandata resolves a plan but
    // not enough structured numbers to draw a volume (or no plan), the DK path dispatches a CITED
    // refusal (names the zone + links the plan PDF), NEVER the generic `estimated-default` triple.
    dkPlandataNoNumbersRefusal,
    dkPlandataNoPlanRefusal,
    // ── §DK-BYGGEFELT-TIER-1 (DK gap G3/G6) — WHERE on the parcel the building may stand. ──
    // Plandata publishes an envelope's NUMBERS but nothing about placement, so a Copenhagen karré
    // was drawn as a solid block over its own courtyard (L-619). A BINDING byggefelt is the plan's
    // own answer, and it is machine-readable (`bygkunifelt` / `bygvejledende`). These four wire the
    // producer → classifier → G6 resolver chain into the live DK click path.
    createByggefeltProducer,
    byggefeltResultToTierOne,
    resolveDkEnvelopePlacement,
    applyDkPlacement,
    type ByggefeltProducer,
    type ByggefeltTierOneInput,
    type DkPlacementResolution,
    // STRUCTURAL-SEAM-4 (C57 §1.5 / C58 §1.13.8) — the shared fetch-outcome union + bounded retry, and
    // the genuine-absence refusal siblings. A transient fetch failure (`unreachable`) is retried and
    // shown as "temporarily unavailable"; a genuine empty (`absent`/`no-plan-at-point`) is shown as
    // "no plan here" — the two never share a card again (§CONTEXT-DATA-HONESTY, L-422/457/467/469).
    retryWhileUnreachable,
    resolutionToFetchOutcome,
    fetchFound,
    fetchTransient,
    dkPlandataUnreachableRefusal,
    madridNZ1AbsentRefusal,
    nlNoPlanRefusal,
    // L-609 / §NL-NATIONWIDE — Netherlands (national) bestemmingsplan explicit-area path. Like Madrid
    // the ordinance publishes the buildable footprint as geometry (the `bouwvlak`); UNLIKE Madrid the
    // `maatvoering` numbers ("maximum bouwhoogte (m)" etc.) carry unambiguous SVBP2012 units, so a
    // certified parcel renders `structured` (real height fed into structuredFields), not just
    // estimated-ruleset. `resolveNlBestemmingsplan` resolves the bouwvlak ring + maatvoering via the
    // KEYLESS `/api/nl/bestemmingsplan` proxy (PDOK RP WMS), or refuses (never throws). Gated on
    // `NL_BESTEMMINGSPLAN_CERTIFIED` (ON — proven live nationwide): a parcel WITH a resolved
    // bouwvlak+maatvoering renders structured; residual cases refuse (via `nlBestemmingsplanRefusal`),
    // never a fabricated bouwhoogte. The coarse gate is `isInNetherlands` (national bbox).
    isInNetherlands,
    resolveNlBestemmingsplan,
    NL_RING_REF,
    NL_BESTEMMINGSPLAN_CERTIFIED,
    NL_BESTEMMINGSPLAN_PACK,
    NL_ZONE_CODE,
    NL_JURISDICTION_ID,
    bestemmingToPermittedUse,
    nlBestemmingsplanRefusal,
    // PARIS (Ville de Paris, INSEE 75056) — PLU bioclimatique, STRUCTURED-DATA-FIRST. `resolveParisEnvelope`
    // reads the zone identity (GPU zone_urba), the numeric hauteur plafond (opendata plub_hauteur) AND the
    // published `plub_ecm` buildable-FOOTPRINT polygon; `computeParisEnvelope` extrudes that real footprint
    // to the published height (never parcel×hauteur) and refuses honestly per component (no ECM ⇒ footprint
    // refused; cour=X ⇒ a cited PARTIAL crown refusal). Gated ON (`FR_PARIS_PLU_CERTIFIED`): the flag now
    // AUTHORISES drawing the structured ECM volume — there is no fabrication left to gate. Where no ECM
    // covers the point the path ships a cited refusal (`parisPluEnvelopeRefusal` / the engine's refusal),
    // never the estimated triple.
    isInParis,
    resolveParisEnvelope,
    computeParisEnvelope,
    FR_PARIS_PLU_CERTIFIED,
    PARIS_PLU_ORDINANCE_REF,
    parisPluEnvelopeRefusal,
    parisZoneCodeFor,
    // §L-619 / ADR-0273 — the sanctioned, TIER-SAFE constructed-height attachment. Re-applies the
    // L-616 FAR cap once the per-street *alçada reguladora* is known (block-derived zones ship
    // `maxHeight_m: null`, so the engine's cap is skipped at solve time). Replaces the inline object
    // spread the §BCN-ALCADA block used, which was both FAR-blind and tier-unsafe (see envelopeHeight.ts).
    applyConstructedHeight,
    // §EL-SAUZAL-ENVELOPE — an El Sauzal (INE 38041, Tenerife) plot. ⚠ El Sauzal's SIPU package
    // carries NO `EDIF.mdb` (unlike Telde), so the zone is resolved OFFLINE from a committed ZUSO
    // shapefile extract (`resolveElSauzalZone`, sync, never throws). `EL_SAUZAL_ENVELOPE_VERIFIED`
    // is unsigned — TWO named gaps (the missing "fichero de ordenación anexo" + the RE-ViUf↔Ciudad
    // Jardín typology binding being an inference, not a confirmed cross-reference) — so this path
    // renders NO number: it dispatches a cited "no signed transcription" refusal, naming the
    // resolved ZUSO zone when one resolves, never a fabricated envelope. Same discipline as
    // Telde/Zaragoza/Córdoba.
    isInElSauzal,
    EL_SAUZAL_JURISDICTION_ID,
    EL_SAUZAL_ENVELOPE_VERIFIED,
    EL_SAUZAL_ZONE_CODES,
    ES_EL_SAUZAL_PACK,
    elSauzalNoRulePackRefusal,
    resolveElSauzalZone,
    // §RESEARCH-PENDING — Málaga (INE 29067) and Granada (INE 18087). ⚠ Neither has a rulepack or
    // a zone-identity resolver at all; this stops the §L-663 fabrication defect (no `isInX` branch
    // meant a click fell straight through to the estimated triple), never claims research that
    // hasn't happened.
    isInMalaga,
    MALAGA_JURISDICTION_ID,
    malagaResearchPendingRefusal,
    isInGranada,
    GRANADA_JURISDICTION_ID,
    granadaResearchPendingRefusal,
    // §CARTAGENA-ENVELOPE — Cartagena (INE 30016, Región de Murcia). ⚠ The ONE Murcia-region
    // municipality (of 5 researched) with a LIVE, confirmed-working zone resolver: `wms_RPG0`
    // `GetFeatureInfo` (the currently-valid R0/1987 PGMO, reinstated after the 2012 revision's
    // annulment). `CARTAGENA_ENVELOPE_VERIFIED` is unsigned — every Vc1/Vc2/Vu1 zone's mandatory
    // road setback is unquantified in the base ordinance text (Título Cuarto), so this path
    // ALWAYS renders a cited structural refusal, never a fabricated full-parcel box. Same
    // discipline as Sevilla SB / Córdoba MC's `explicit-area`/unresolved-ring pattern.
    isInCartagena,
    CARTAGENA_JURISDICTION_ID,
    CARTAGENA_ENVELOPE_VERIFIED,
    cartagenaNoRulePackRefusal,
    resolveCartagenaZone,
    // §RESEARCH-PENDING (second Murcia-region pass, 2026-08-04) — Lorca (30024), Molina de Segura
    // (30027), Alcantarilla (30005), Las Torres de Cotillas (30038). None has a rulepack. Same
    // "stop the §L-663 fabrication defect" discipline as Málaga/Granada. Alcantarilla alone owns a
    // live coarse land-use resolver (CARM regional WFS) so its refusal can name a resolved class.
    isInLorca,
    LORCA_JURISDICTION_ID,
    lorcaResearchPendingRefusal,
    isInMolinaDeSegura,
    MOLINA_DE_SEGURA_JURISDICTION_ID,
    molinaDeSeguraResearchPendingRefusal,
    isInAlcantarilla,
    ALCANTARILLA_JURISDICTION_ID,
    ALCANTARILLA_ENVELOPE_VERIFIED,
    alcantarillaNoRulePackRefusal,
    resolveAlcantarillaLanduse,
    isInLasTorresDeCotillas,
    LAS_TORRES_DE_COTILLAS_JURISDICTION_ID,
    lasTorresDeCotillasResearchPendingRefusal,
} from '@pryzm/site-parcel-data';
import { GeospatialAdapter } from '@pryzm/geospatial';
// ADR-0271 §BCN-REAL-ENVELOPE — the impure edge providers the Barcelona path injects into the
// PURE engine: clau (MUC), parcel refcat + block (Catastro), and OSM road centrelines.
import { fetchQualificationAtPoint } from './zoning/MucZoningProvider.js';
import { catastroParcelProvider } from './parcel/CatastroParcelProvider.js';
import { fetchBlockForParcel } from './parcel/CatastroBlockProvider.js';
// §STARTUP-BUDGET (founder 2026-08-07, 5–10× startup) — passive phase marks; behaviour-free.
import { markStartupPhase } from '../../engine/startupBudget';
// §COR-MC-STREET-WIDTH (2026-08-04) — Córdoba MC's own analogue of the block-dissolve width
// construction Barcelona already runs inline (§BCN-ALCADA-WIDTH); see the module header.
import { resolveCordobaMcStreetWidth } from './parcel/resolveCordobaMcStreetWidth.js';
import { fetchContextRoads } from '../geospatial/contextRoads.js';
import { fetchContextBuildingsNearAndFar } from '../geospatial/contextBuildings.js';
import { latLonToSceneXZ, sceneXZToLatLon, type LatLon } from './boundaryProjection.js';
import { trace } from '@opentelemetry/api';
import { polygonAreaXZ } from './siteInspectorData';
import {
    isUncertifiedPreviewModeActive,
    uncertifiedPreviewCaveat,
} from './testMode/uncertifiedPreviewMode.js';

const _siteRestoreTracer = trace.getTracer('pryzm.site.restore');

// ── FORMA.4 / C19 §1.3 — LTP-ENU origin rebase at the draw surface ───────────
//
// C19 §1.3 requires `site.updateLocation` to set the LTP-ENU frame origin to the
// real site lat/lon (this is what makes 3D real-world placement accurate). The
// editor runtime's `geospatial` slot is a stub (throws), and `LTPENURebase` was
// never instantiated at this surface — the documented follow-up that this wires.
//
// We keep ONE process-wide `GeospatialAdapter` (it bundles proj4 + LTPENURebase
// and exposes `setOrigin`). The UTM CRS is derived from the site longitude the
// FIRST time an origin is set; thereafter `setOrigin` just moves the origin.
//
// BOUNDARY-SHIFT HAZARD (task #3) — analysis:
//   The draw surface projects the boundary via `boundaryProjection.latLonToSceneXZ`
//   which takes the origin as an EXPLICIT ARGUMENT at commit time and bakes XZ
//   relative to it (see boundaryProjection.ts + SiteBoundaryDrawTool.commit()).
//   It does NOT read this shared adapter. So `setOrigin` here CANNOT retroactively
//   move an already-drawn boundary's XZ — the two are decoupled by construction.
//   The real (pre-existing, orthogonal) risk is SEMANTIC: if a boundary was
//   already projected about origin A and we now rebase the ENU frame to a
//   DIFFERENT origin B, the committed XZ no longer shares the frame's origin.
//   To stay safe + deterministic we therefore set the origin ONLY WHEN NO PARCEL
//   BOUNDARY EXISTS YET. Once a boundary is committed the origin is frozen to the
//   frame that boundary was projected in (the boundary-draw tool always records
//   its projection origin as the Site location first, so they already agree).
//   When a boundary already exists we skip the rebase and log the choice.
let _ltpAdapter: GeospatialAdapter | null = null;
/** §CESIUM-SITE-ORIGIN — the lat/lon of the current LTP-ENU origin, recorded
 *  whenever it is set. CesiumViewport reads this as a RELIABLE fallback when
 *  `runtime.siteModelStore.getLocation()` is null at mount: the origin is set
 *  during onboarding BEFORE Cesium mounts in the GIS handoff, so Cesium's own
 *  store-read AND its late `site.location-changed` subscription both miss it —
 *  which is why the Forma view framed the Sydney default instead of the plot. */
let _lastSiteOrigin: { lat: number; lon: number } | null = null;

/** §CESIUM-SITE-ORIGIN — the current site origin lat/lon, or null if none set. */
export function getCurrentSiteOrigin(): { lat: number; lon: number } | null {
    return _lastSiteOrigin ? { ..._lastSiteOrigin } : null;
}

// ── §L-676 (C13 §3.10 / C19 §1.11) — project ownership of the module singletons ──
//
// Every `let` in this module is an app-lifetime singleton. Before L-676 NOTHING
// reset them on a project switch: `restoreSiteState` cleared exactly one
// (`_lastSiteOrigin`) and only on the "no persisted site" branch. Project A's
// LTP-ENU frame, buildable envelope, parcel query point and preview-hue flag all
// carried into Project B, where they read as authoritative because nothing marks
// them as foreign.
//
// The fix is ownership, not more clear() calls: the module records WHICH project
// its state belongs to, the audit can therefore SEE a leak, and the C13 teardown
// has one named owner to call.
let _owningProjectId: string | null = null;

/**
 * Stamp the project every subsequent module-singleton write belongs to. Called at
 * each site-dispatch write chokepoint; safe to call repeatedly.
 */
function noteSiteDispatchOwner(): void {
    try {
        const rt = (typeof window !== 'undefined')
            ? (window.runtime as unknown as PryzmRuntime | undefined)
            : undefined;
        const pid = rt ? resolveActiveProjectId(rt) : null;
        if (typeof pid === 'string' && pid.length > 0) _owningProjectId = pid;
    } catch { /* ownership stamping must never break a dispatch */ }
}

/**
 * §L-676 — the project whose site-dispatch state is currently live, or `null` when
 * this module holds nothing. Read by the C13 isolation-audit scope probe.
 */
export function getSiteDispatchOwningProjectId(): string | null {
    const holdsSomething =
        _ltpAdapter !== null ||
        _lastSiteOrigin !== null ||
        _lastEnvelope !== null ||
        _lastParcelQueryPoint !== null ||
        _lastEnvelopeIsSuggestedPreview;
    return holdsSomething ? _owningProjectId : null;
}

/** §L-676 — what the module is holding, for the leak report. Never throws. */
export function describeSiteDispatchState(): Record<string, unknown> {
    return {
        ltpAdapter: _ltpAdapter !== null,
        lastSiteOrigin: _lastSiteOrigin ? { ..._lastSiteOrigin } : null,
        lastEnvelopeStatus: _lastEnvelope?.status ?? null,
        lastParcelQueryPoint: _lastParcelQueryPoint ? { ..._lastParcelQueryPoint } : null,
        lastEnvelopeIsSuggestedPreview: _lastEnvelopeIsSuggestedPreview,
    };
}

/**
 * §L-676 (C13 §4 teardown / C19 §1.11) — reset EVERY per-project module singleton
 * in this file to its cold-boot value. The single named owner of this file's
 * project scope; registered with `projectScopeRegistry` by `siteProjectScope.ts`
 * so `ClearProjectCommand` runs it on every load, and invoked directly by the
 * `pryzm-project-switch` teardown so it also runs BEFORE the incoming project's
 * context is set (C13 §3.7).
 *
 * Synchronous, idempotent, never throws (C13 ProjectScopedStore contract).
 */
export function resetSiteDispatchProjectState(): void {
    const span = _siteRestoreTracer.startSpan('pryzm.site.resetProjectState');
    try {
        span.setAttribute('pryzm.site.priorProjectId', _owningProjectId ?? 'none');
        span.setAttribute('pryzm.site.hadLtpAdapter', _ltpAdapter !== null);
        span.setAttribute('pryzm.site.hadEnvelope', _lastEnvelope !== null);
        // The LTP-ENU adapter carries the PRIOR site's origin. Keeping it is the
        // §L-259 defect (ii) mechanism: every scene→ENU conversion in the new
        // project resolves against a frame anchored hundreds of km away.
        _ltpAdapter = null;
        _lastSiteOrigin = null;
        _lastEnvelope = null;
        _lastParcelQueryPoint = null;
        _lastEnvelopeIsSuggestedPreview = false;
        _riyadhDemoInputs = { plotClass: 'villa', streetWidth_m: null };
        // The Danish Byggefelt producer owns a rate-limit queue + LRU keyed by
        // bbox; dropping it cancels nothing in flight but stops Project B reading
        // Project A's cached fields. Recreated lazily on first use.
        _dkByggefeltProducer = null;
        _owningProjectId = null;
    } catch (e) {
        console.warn('[gis] §L-676 resetSiteDispatchProjectState failed (non-fatal):', e);
    } finally {
        span.end();
    }
}

// ── C58 — buildable-envelope transient cache (L-398 / L-402b) ────────────────
//
// ⚠ AMENDED by ADR-0270 option A / C58 §1.7a (L-451). This block previously read "the inset
// ring is not persisted authored data" — that was true under the ORIGINAL §1.7 and is now
// WRONG: the INSET RING **is** the persisted truth (`Parcel.buildableRing`), because an
// alignment-governed zone has no front/side/rear triple that can encode it. Still transient,
// and correctly so: `confidence`, `status` and the `derivation` trace — provenance we must
// never fabricate on read-back (§1.4).
//
// We cache the last-computed envelope here — mirroring the `_lastSiteOrigin` pattern above —
// so the facts card can read the FULL object without recomputing. Renderers that need only
// GEOMETRY must use `resolveRenderableBuildableEnvelope()` instead, which falls back to the
// persisted ring; reading this global directly is what caused L-445 (it dies on reload).
let _lastEnvelope: BuildableEnvelope | null = null;

/**
 * §L-663 — THE POINT `applyZoning` ROUTED ON, kept so the estimated-fallback chokepoint asks the
 * registry about the SAME place the `if` chain asked about.
 *
 * ⚠ WHY A MODULE-LOCAL AND NOT A THREADED PARAMETER. `applyEstimatedZoning` has fifteen call
 * sites, most of them `catch` blocks and `!site` guards inside the per-city handlers. Threading
 * the point through all fifteen makes the guard bypassable by omission — a future sixteenth call
 * site that passes `null` silently re-opens the exact hole this closes, and it would fail nowhere.
 * One write, at the single point where the routing decision is made (`applyZoning`), and one read,
 * at the single point that dispatches the estimate, is the property worth having. It mirrors
 * `_lastEnvelope` / `_lastSiteOrigin` above.
 *
 * Written on EVERY `applyZoning` call, including to `null` when no point could be derived — a
 * stale point from a previous parcel would be worse than none (the §L-536 / §SEAM-2 lesson: a
 * write skipped when the value is "nothing" is what splits write from read).
 */
let _lastParcelQueryPoint: { lat: number; lon: number } | null = null;

/** C58 — the last computed buildable envelope for the current parcel, or null. */
export function getLastBuildableEnvelope(): BuildableEnvelope | null {
    return _lastEnvelope;
}

/**
 * §NEARBY-HEIGHT-SUGGESTION (2026-08-05) — TRUE iff `_lastEnvelope` was dispatched via
 * `previewSuggestedZoneEnvelope` (the admin-only, not-yet-reviewed height-based auto-preview) and
 * NOT since superseded by a normal `dispatchEnvelope` call. `dispatchEnvelope` (the ONLY other
 * writer of `_lastEnvelope`) always resets this to `false` first — so the moment an admin clicks
 * "Save + compute" (which routes through the normal Córdoba manual-admin-zone dispatch, i.e.
 * `dispatchEnvelope`), the flag drops and the render reverts to the normal confident/provisional
 * two-hue system, exactly matching "the admin has now reviewed and confirmed this."
 */
let _lastEnvelopeIsSuggestedPreview = false;

/** See `_lastEnvelopeIsSuggestedPreview`'s own doc. */
export function isLastEnvelopeSuggestedPreview(): boolean {
    return _lastEnvelopeIsSuggestedPreview;
}

/**
 * C58 §1.7a / ADR-0270 option A (L-445 fix) — the buildable ring + height for RENDERING,
 * resolved from the persisted truth when this session never solved an envelope.
 *
 * THE DEFECT THIS CLOSES (L-445): every renderer read `getLastBuildableEnvelope()`, a MODULE
 * GLOBAL written only inside `dispatchParcelBoundary`. It therefore survived view switches but
 * NOT a reload / open-from-hub — so re-entering 3D Site on an existing project logged
 * `envelope present=n, entities added=0` while the toggle still truthfully said "Envelope: ON".
 * An envelope that silently fails to arrive reads to the user as "there is no constraint here"
 * — the false negative C58 §1.4 exists to forbid. The BOUNDARY never had this bug because it
 * reads `siteModelStore` (persisted); the envelope read a RAM global. Same view, two lifetimes.
 *
 * ⚠ WHY THIS RETURNS A RING AND NOT A `BuildableEnvelope`: only the inset ring is persisted
 * (§1.7a). `confidence`, `status` and the `derivation` trace are NOT, and SYNTHESISING them to
 * satisfy the richer type would fabricate provenance for a number we did not re-derive — the
 * exact §1.4 violation this fix exists to prevent. Callers that need the derivation (the "Why
 * these numbers?" facts card) must keep using `getLastBuildableEnvelope()` and honestly show
 * nothing when this session did not solve; callers that only need GEOMETRY use this.
 *
 * `source` is diagnostic: 'solved' = this session's full envelope, 'persisted' = read back.
 */
export interface RenderableBuildableEnvelope {
    readonly ring: ReadonlyArray<{ x: number; z: number }>;
    readonly maxHeightM: number | null;
    /**
     * §L-616 — the FAR-realistic massing height (m); the renderer draws a translucent shell at
     * `maxHeightM` plus an opaque solid at this height when FAR caps floorspace below the height
     * cap. Null when FAR does not bind (then the solid == the shell) — and ALSO null on the
     * `persisted` / `re-inset` paths, which read back a ring WITHOUT its provenance and must not
     * re-synthesise a value they did not re-derive (§1.7a, same honesty rule as `confidence`).
     */
    readonly farLimitedHeightM: number | null;
    readonly source: 'solved' | 'persisted' | 're-inset';
    /**
     * §ENVELOPE-CONFIDENCE-COLOUR (L-608) — the C58 confidence, but ONLY on the `solved` path where
     * this session actually derived it (`_lastEnvelope`). `null` on `persisted`/`re-inset`: those
     * read back a ring WITHOUT its provenance (the §1.7a honesty rule — we do not re-synthesise a
     * confidence we did not re-derive), and null is honestly rendered as grey (unknown), never as a
     * confident violet. This carries no fabricated provenance — it is the real label or nothing.
     */
    readonly confidence: EnvelopeConfidence | null;
}

export function resolveRenderableBuildableEnvelope(
    runtimeArg?: PryzmRuntime | null,
): RenderableBuildableEnvelope | null {
    // 1) This session solved one — richest source, always preferred.
    const solved = _lastEnvelope;
    if (solved && solved.status === 'ok' && solved.insetPolygon.length >= 3) {
        return {
            ring: solved.insetPolygon.map((p) => ({ x: p.x, z: p.z })),
            maxHeightM: solved.maxHeight_m,
            // §L-616 — forward the FAR-realistic height so the renderer can draw the shell + solid.
            farLimitedHeightM: solved.farLimitedHeight_m ?? null,
            source: 'solved',
            confidence: solved.confidence,
        };
    }
    // 2) Fall back to the PERSISTED ring. Deliberately does NOT use `resolveSiteContext`:
    //    that toasts + warns on every miss, and this runs on a render path where "no site
    //    yet" is the normal case, not an error.
    try {
        const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
        const store = rt?.siteModelStore as SiteModelStore | undefined;
        const parcel = store?.getSite()?.parcel;
        const ring = parcel?.buildableRing;
        if (ring && ring.length >= 3) {
            return {
                ring: ring.map((p) => ({ x: p.x, z: p.z })),
                maxHeightM: parcel?.maxHeight ?? null,
                // §L-616 — null on the persisted path: FAR/inset-area were not re-derived, so a
                // FAR-realistic height cannot be honestly reconstructed (same rule as `confidence`).
                farLimitedHeightM: null,
                source: 'persisted',
                confidence: null,
            };
        }
        // 3) LAST RESORT — RE-INSET from the persisted setbacks (L-445 follow-up).
        //
        // WHY THIS EXISTS: fallback (2) only helps parcels committed AFTER the ring-persistence
        // fix shipped. Every project committed BEFORE it has `buildableRing === null` for good,
        // and nothing re-solves on load — so the founder's existing Barcelona project still
        // logged `envelope present=n` with the fix deployed. A fix that only helps new data is
        // not a fix for a user who already has data.
        //
        // ⚠ THIS IS THE ONE RE-DERIVATION C58 §1.7a PERMITS, and only under its exact condition:
        // "Reading the three numbers and re-insetting is valid only for `setback` zones and MUST
        // NOT be used as a general path." The guard below IS that condition, and it is
        // self-enforcing rather than a promise: an alignment-governed zone stores its ring (so
        // branch 2 already returned) and stores `null` setbacks (so this branch cannot fire).
        // Requiring all three to be NUMBERS is therefore equivalent to "this is a setback zone".
        //
        // It re-runs the same deterministic per-edge inset on PERSISTED inputs — it does not
        // invent a number, and it cannot upgrade provenance: the caller still gets geometry only,
        // and the facts card still shows nothing, because no derivation was re-derived.
        const sb = parcel?.setbacks;
        const boundary = parcel?.boundary;
        if (
            sb && boundary && Array.isArray(boundary.polygon) && boundary.polygon.length >= 3 &&
            typeof sb.front === 'number' && typeof sb.side === 'number' && typeof sb.rear === 'number'
        ) {
            // ⭐ §ENVELOPE-ZERO-INSET-REFUSAL (L-1171) — REFUSE THE ALL-ZERO RE-INSET.
            //
            // THE FOUNDER'S GREY BOX. His log reads `re-inset from the PERSISTED setbacks
            // 0/0/0 m (11-pt ring)` → `maxHeight=n/a` → `provisional grey` → a
            // `footprint-slab@0.5m`. Read that back as a claim and it says: "the buildable
            // envelope here is the entire parcel, to its very edge, and we cannot tell you a
            // height." That is not an estimate — it is the §L-616 OVERSTATEMENT in its purest
            // form (an UNKNOWN constraint drawn as ZERO), and C58 §1.4 forbids a picture that
            // states a constraint the system cannot actually state.
            //
            // ⚠ THE GUARD ABOVE WAS SATISFIABLE BY A DEFAULT. Its own comment argues the three
            // numbers "being NUMBERS is therefore equivalent to 'this is a setback zone'",
            // because an alignment zone stores its ring (branch 2) and NULL setbacks. `0` is a
            // number. A zero-FILLED record — a default, a never-populated field, a rule pack
            // that answered nothing — passes that test exactly as a derived `4/3/5` does. This
            // is [[context-data-honesty-family]]: FAILURE AND EMPTY ARE THE SAME VALUE, and the
            // guard could not tell them apart.
            //
            // AND THE RESULT CARRIES NO INFORMATION EITHER WAY. `insetPolygonPerEdge` with
            // 0/0/0 is the IDENTITY: the "buildable ring" it returns IS `boundary.polygon`,
            // vertex for vertex. The parcel boundary is ALREADY drawn — as the violet ring and
            // fill on both surfaces — so this branch could only ever re-draw the same polygon a
            // second time, in envelope grey, with a legal meaning attached that nothing derived.
            // Zero new pixels, one new false claim. Refusing costs the user nothing and the
            // refusal is what C58 §1.4 asks for: say you could not resolve it, do not draw a
            // constraint you cannot state.
            //
            // A genuinely zero-setback jurisdiction (Barcelona alignment, the DK/Copenhagen
            // §L-619 case) is NOT affected: those store their solved ring, so branch 2 returned
            // long before here, and §L-619's own `footprintIsUpperBound` machinery already
            // renders that case honestly.
            if (sb.front === 0 && sb.side === 0 && sb.rear === 0) {
                console.log(
                    '[gis][c58] §ENVELOPE-ZERO-INSET-REFUSAL (L-1171) — REFUSING to re-inset: the ' +
                        'persisted setbacks are 0/0/0 m, so the "buildable ring" would be the parcel ' +
                        'boundary itself, drawn as an envelope with no derived height and no ' +
                        'provenance. Zero setbacks that were DERIVED are stored as a ring (branch 2) ' +
                        'and never reach here — reaching here means the numbers were defaulted, not ' +
                        'resolved. Drawing it would state "you may build to the parcel edge" with no ' +
                        'evidence (C58 §1.4 / §L-616 overstatement). Re-commit the parcel to solve a ' +
                        'real envelope.',
                );
                return null;
            }
            const reInset = insetPolygonPerEdge(
                boundary.polygon,
                boundary.edgeClassifications as ParcelEdgeClassification[],
                { front: sb.front, side: sb.side, rear: sb.rear, unclassified: sb.side },
            );
            if (!reInset.degenerate && reInset.polygon.length >= 3) {
                console.log(
                    `[gis][c58] §ENVELOPE-REINSET (L-445) — no cached or persisted ring; re-inset ` +
                        `from the PERSISTED setbacks ${sb.front}/${sb.side}/${sb.rear} m ` +
                        `(${reInset.polygon.length}-pt ring). Valid here because this is a setback ` +
                        `zone (C58 §1.7a); an alignment zone stores its ring and null setbacks.`,
                );
                return {
                    ring: reInset.polygon.map((p) => ({ x: p.x, z: p.z })),
                    maxHeightM: parcel?.maxHeight ?? null,
                    // §L-616 — null on the re-inset path: only geometry was re-derived, not FAR.
                    farLimitedHeightM: null,
                    source: 're-inset',
                    confidence: null,
                };
            }
        }
    } catch {
        // Never let a render path throw on a missing store.
    }
    return null;
}

/**
 * L-401 (design INSIDE the envelope — COMPLIANT-BY-CONSTRUCTION) — resolve the footprint a
 * generator (apartment / house / office / residential) should build within.
 *
 * When a valid C58 buildable envelope is cached for the current parcel (`status: 'ok'`,
 * inset ≥ 3 pts), returns the envelope INSET ring — the setback-reduced polygon the user
 * may LEGALLY build within — so the generated shell sits at the setback line, not the raw
 * lot edge: the building is authored inside the compliance envelope by construction.
 * Otherwise falls back to the raw parcel boundary (identical to the pre-L-401 behaviour
 * when there is no envelope, or a degenerate/estimated-off one). Also surfaces the max
 * building height (m) the envelope permits, when known, so a generator can cap storeys
 * (height-cap is a later slice; the footprint is the visible, high-impact one). Pure read
 * of the transient `_lastEnvelope` cache — no I/O, no recompute.
 */
export function resolveBuildableFootprint(
    parcelPolygon: ReadonlyArray<{ x: number; z: number }>,
): { polygon: ReadonlyArray<{ x: number; z: number }>; source: 'envelope' | 'parcel'; maxHeightM: number | null } {
    return pickBuildableFootprint(_lastEnvelope, parcelPolygon);
}

/**
 * §STALE-ASYNC-ZONING (L-644) — pure comparison: does `expectedPolygon` (the parcel boundary
 * an in-flight async zoning fetch was launched to solve) still match `currentPolygon` (the
 * parcel boundary actually committed on the Site RIGHT NOW)? Value-based, not reference-based,
 * so it holds whether or not the store clones its records.
 *
 * WHY THIS EXISTS — a SECOND, DISTINCT member of the "purple sits on the wrong plot" family.
 * 9acd599d (2026-07-28, [[site-origin-on-parcel-regression]]) fixed the ORIGIN-ORDERING defect:
 * a single commit projected its OWN ring about a stale geocode anchor, offsetting it by
 * hundreds of metres — reproducible on every affected commit, deterministically.
 *
 * This is a RACE, not a coordinate-math bug, and it is intermittent by construction. Barcelona's
 * real-envelope resolution (`applyBcnZoningThenFallback`) is not one fetch — it is a CHAIN
 * (MUC clau lookup + Catastro parcel, then the manzana block, then a roads lookup, then the
 * alçada street-width construction), each a real network round-trip, so the WHOLE async
 * continuation can take seconds. `dispatchEnvelope` writes onto `_lastEnvelope` and the site's
 * persisted `Parcel.buildableRing`/setbacks UNCONDITIONALLY, keyed only by `siteId` — which does
 * NOT change when the user Redraws (§L-384) or re-selects a different cadastral parcel; only
 * `site.parcel.boundary` changes. So: commit parcel A (kicks off the BCN chain) → before it
 * resolves, Redraw/select a DIFFERENT parcel B and commit it (B's own — usually faster —
 * envelope is cached correctly) → A's chain FINALLY resolves and calls `dispatchEnvelope` with
 * an envelope computed from A's ring, clobbering the live B envelope with A's geometry. Because
 * `parcelFrameOrigin` anchors every ring near its OWN first vertex (by design, see
 * `boundaryProjection.ts`), A's inset ring renders at roughly A's own on-plot coordinates
 * *inside B's ENU frame* — a displacement on the order of ONE PARCEL, not hundreds of metres.
 * That reads exactly as "the purple volume sits on the neighbouring plot", and it is
 * NON-DETERMINISTIC: it depends on whether the user re-selects faster than A's chain resolves,
 * which is why it looks "parcel-specific" (only some parcels — the ones re-selected quickly
 * after a prior commit — show it) rather than universal.
 *
 * Returns true ⇒ STALE ⇒ the caller must discard the response rather than dispatch it.
 */
export function isZoningResponseStale(
    expectedPolygon: ReadonlyArray<{ x: number; z: number }>,
    currentPolygon: ReadonlyArray<{ x: number; z: number }> | null | undefined,
): boolean {
    if (!currentPolygon || currentPolygon.length !== expectedPolygon.length) return true;
    const EPS = 1e-6;
    for (let i = 0; i < expectedPolygon.length; i++) {
        const a = expectedPolygon[i];
        const b = currentPolygon[i];
        if (!a || !b) return true;
        if (Math.abs(a.x - b.x) > EPS || Math.abs(a.z - b.z) > EPS) return true;
    }
    return false;
}

/**
 * L-401 — the PURE decision behind `resolveBuildableFootprint` (envelope + parcel →
 * compliant footprint), extracted so it is unit-testable without the module cache. Uses
 * the envelope INSET ring when the envelope is valid (`status: 'ok'`, ≥ 3 pts), else the
 * raw parcel polygon. Winding/geometry are the solver's job — this only PICKS the source.
 */
export function pickBuildableFootprint(
    env: BuildableEnvelope | null,
    parcelPolygon: ReadonlyArray<{ x: number; z: number }>,
): { polygon: ReadonlyArray<{ x: number; z: number }>; source: 'envelope' | 'parcel'; maxHeightM: number | null } {
    if (
        env &&
        env.status === 'ok' &&
        Array.isArray(env.insetPolygon) &&
        env.insetPolygon.length >= 3
    ) {
        return {
            polygon: env.insetPolygon.map((p) => ({ x: p.x, z: p.z })),
            source: 'envelope',
            maxHeightM: typeof env.maxHeight_m === 'number' ? env.maxHeight_m : null,
        };
    }
    return { polygon: parcelPolygon, source: 'parcel', maxHeightM: null };
}

/** Derive a Proj4 UTM string for the given longitude (zones are 6° wide). */
function utmProj4StringForLon(lat: number, lon: number): string {
    const zone = Math.max(1, Math.min(60, Math.floor((lon + 180) / 6) + 1));
    const south = lat < 0 ? ' +south' : '';
    return `+proj=utm +zone=${zone}${south} +datum=WGS84 +units=m +no_defs`;
}

/**
 * C19 §1.3 — set the LTP-ENU frame origin to the real site lat/lon, but ONLY when
 * no parcel boundary has been committed yet (see the boundary-shift hazard note
 * above). Idempotent + fully guarded — never throws into the dispatch path.
 */
function setLtpOriginIfSafe(ctx: SiteContext, lat: number, lon: number): void {
    try {
        // A 0/0 location is the `ensureSite` placeholder — not a real origin.
        if (lat === 0 && lon === 0) return;

        const boundary = ctx.store.getParcelBoundary?.();
        if (boundary && Array.isArray(boundary.polygon) && boundary.polygon.length >= 3) {
            console.log(
                '[gis] LTPENURebase.setOrigin SKIPPED — a parcel boundary is already committed; ' +
                'keeping the origin the boundary was projected in (C19 §1.3 boundary-shift guard).',
            );
            return;
        }

        if (!_ltpAdapter) {
            _ltpAdapter = new GeospatialAdapter({
                proj4String: utmProj4StringForLon(lat, lon),
                origin: { lat, lon, elev: 0 },
            });
            console.log(`[gis] LTPENURebase origin set (first) → LAT ${lat} LON ${lon} (C19 §1.3).`);
        } else {
            _ltpAdapter.setOrigin(lat, lon, 0);
            console.log(`[gis] LTPENURebase.setOrigin → LAT ${lat} LON ${lon} (C19 §1.3).`);
        }
        _lastSiteOrigin = { lat, lon }; // §CESIUM-SITE-ORIGIN — for the Cesium fallback read.
        noteSiteDispatchOwner(); // §L-676 — record WHICH project this frame belongs to.
    } catch (e) {
        // Origin-rebase is best-effort site intelligence; never block the location
        // dispatch (the lat/lon is still recorded on the Site for IFC export).
        console.warn('[gis] LTPENURebase.setOrigin failed (non-fatal):', e);
    }
}

/**
 * §FIX-GIS-SITE-STATE-NOT-PERSISTED (L-188) — force the LTP-ENU origin to a
 * lat/lon UNCONDITIONALLY (bypasses the `setLtpOriginIfSafe` boundary guard).
 *
 * On PROJECT RESTORE the persisted origin is authoritative: the parcel boundary
 * was projected in exactly this frame at author time (they were committed
 * together), so re-seeding the origin here can never desynchronise them — it
 * merely re-establishes the same C19 §1.3 frame the geometry already lives in.
 * The guarded `setLtpOriginIfSafe` (used on interactive geocode) would SKIP once
 * a boundary exists, which is wrong for restore where the boundary always exists.
 */
function setLtpOriginForce(lat: number, lon: number): void {
    try {
        if (lat === 0 && lon === 0) return; // Null Island placeholder — not a real origin.
        if (!_ltpAdapter) {
            _ltpAdapter = new GeospatialAdapter({
                proj4String: utmProj4StringForLon(lat, lon),
                origin: { lat, lon, elev: 0 },
            });
        } else {
            _ltpAdapter.setOrigin(lat, lon, 0);
        }
        _lastSiteOrigin = { lat, lon }; // §CESIUM-SITE-ORIGIN — for the Cesium fallback read.
        noteSiteDispatchOwner(); // §L-676 — record WHICH project this frame belongs to.
        console.log(`[gis] LTPENURebase origin RESTORED → LAT ${lat} LON ${lon} (C19 §1.3, L-188).`);
    } catch (e) {
        console.warn('[gis] §FIX-GIS-SITE-STATE-NOT-PERSISTED — LTP origin restore failed (non-fatal):', e);
    }
}

/**
 * §FIX-GIS-SITE-STATE-NOT-PERSISTED (L-188) — restore a persisted C19 SiteModel
 * into the LIVE runtime on project open, re-establishing everything the GIS/site
 * substrate needs so reopening a GIS project shows its REAL location + boundary
 * (not the Madrid default):
 *
 *   1. Hydrate `runtime.siteModelStore` with the validated SiteModel (location,
 *      parcel boundary, footprint, context buildings).
 *   2. Re-seed the LTP-ENU geospatial origin (C19 §1.3) to the persisted lat/lon
 *      + record it for the §CESIUM-SITE-ORIGIN fallback read.
 *   3. Re-emit the domain events (`site.created` → `site.location-changed` →
 *      `site.parcel-boundary-set`) so the EXISTING event-driven consumers react
 *      exactly as they do during onboarding: RealEnvironmentService re-anchors
 *      the sun at the real site (not Madrid), CesiumViewport frames the plot, and
 *      the ParcelBoundarySceneRenderer re-draws the boundary.
 *
 * When `site` is null/absent (a non-GIS project) the store is RESET so a prior
 * project's site never leaks across a project switch (C13 isolation) — mirrors
 * the IfcMetaStore restore pattern in ProjectLoader.
 *
 * Idempotent + fully guarded — never throws into the load path. Returns true when
 * a real site was restored.
 */
export function restoreSiteState(
    runtimeArg: PryzmRuntime | null | undefined,
    site: SiteModel | null | undefined,
): boolean {
    const span = _siteRestoreTracer.startSpan('pryzm.site.restoreSiteState');
    try {
        const winRuntime = (typeof window !== 'undefined')
            ? (window.runtime as unknown as PryzmRuntime | undefined)
            : undefined;
        const rt = (runtimeArg ?? winRuntime) ?? undefined;
        const store = rt?.siteModelStore as SiteModelStore | undefined;
        if (!store) {
            console.warn('[gis] restoreSiteState: runtime.siteModelStore unavailable — site not restored.');
            span.setAttribute('pryzm.site.restored', false);
            return false;
        }

        // No persisted site (non-GIS project) → clear for project-switch isolation.
        if (!site) {
            store.reset();
            // §L-676 — was `_lastSiteOrigin = null` ONLY. Every other module
            // singleton (the LTP-ENU adapter, the buildable envelope, the parcel
            // query point, the preview-hue flag) survived into the incoming
            // project. Reset the whole scope through its single named owner.
            resetSiteDispatchProjectState();
            span.setAttribute('pryzm.site.restored', false);
            return false;
        }

        // Validate defensively (an old/partial snapshot re-fills defaults) before set.
        let model: SiteModel;
        try {
            model = SiteModelSchema.parse(site);
        } catch (e) {
            console.warn('[gis] restoreSiteState: persisted SiteModel failed schema validation — site not restored:', e);
            span.setAttribute('pryzm.site.restored', false);
            return false;
        }

        store.set(model);
        // §L-676 — the snapshot names its own project; stamp ownership from the
        // SNAPSHOT rather than from the ambient runtime, which may still be mid-
        // transition. A restored site is never a leak of the project it declares.
        _owningProjectId = model.projectId;

        const { latitude: lat, longitude: lon } = model.location;
        span.setAttribute('pryzm.site.lat', lat);
        span.setAttribute('pryzm.site.lon', lon);

        // Re-seed the C19 geospatial origin from the persisted location (authoritative
        // on restore — see setLtpOriginForce).
        setLtpOriginForce(lat, lon);

        // Re-emit domain events so the existing consumers re-anchor to the real site.
        rt?.events?.emit('site.created', {
            type: 'site.created',
            siteId: model.id,
            projectId: model.projectId,
        });
        rt?.events?.emit('site.location-changed', {
            type: 'site.location-changed',
            siteId: model.id,
            location: model.location,
        });
        const polygon = model.parcel?.boundary?.polygon;
        if (Array.isArray(polygon) && polygon.length >= 3) {
            rt?.events?.emit('site.parcel-boundary-set', {
                type: 'site.parcel-boundary-set',
                siteId: model.id,
                boundary: model.parcel.boundary,
                area: polygonAreaXZ(polygon),
                // §L-1580 (C57 §1.4) — replay the PERSISTED attribution, which is `null` for
                // every project saved before §L-1580 landed. Deliberately not re-derived from
                // the parcel registry: that would attribute a ring fetched months ago to
                // whichever provider covers its bbox today, and would turn "not recorded"
                // into a fabricated fact on reload.
                provenance: model.parcel.provenance ?? null,
            });
        }

        console.log(
            `[gis] §FIX-GIS-SITE-STATE-NOT-PERSISTED — site restored: siteId=${model.id} ` +
            `LAT ${lat} LON ${lon} boundaryPts=${Array.isArray(polygon) ? polygon.length : 0} (L-188).`,
        );
        span.setAttribute('pryzm.site.restored', true);
        return true;
    } catch (e) {
        console.warn('[gis] §FIX-GIS-SITE-STATE-NOT-PERSISTED — restoreSiteState failed (non-fatal):', e);
        return false;
    } finally {
        span.end();
    }
}

/** A point on the (x,z) ground plane in scene metres. */
export interface XZPoint {
    readonly x: number;
    readonly z: number;
}

export type ToastFn = (message: string, severity: 'info' | 'success' | 'error') => void;

export interface SiteContext {
    readonly rt: PryzmRuntime;
    readonly store: SiteModelStore;
    readonly projectId: string;
    readonly toast: ToastFn;
}

/**
 * Resolve the runtime + site store + active project, returning a `SiteContext`
 * or null (with a toast/log) if any precondition is unmet. Shared by every GIS
 * authoring surface so the "no runtime / no store / no project" diagnostics are
 * identical everywhere.
 */
export function resolveSiteContext(
    runtimeArg?: PryzmRuntime | null,
): SiteContext | null {
    const rt = (runtimeArg ?? (window.runtime as unknown as PryzmRuntime | undefined)) ?? undefined;
    const toast: ToastFn = (message, severity) => {
        rt?.events?.emit('pryzm:toast', { message, severity });
    };

    if (!rt) {
        console.warn('[gis] no runtime — open a project first (or pass runtime explicitly).');
        return null;
    }
    const store = rt.siteModelStore as SiteModelStore | undefined;
    if (!store) {
        console.warn('[gis] runtime.siteModelStore is undefined — restart the dev server (npm run dev).');
        toast('Site store unavailable — restart the dev server (npm run dev).', 'error');
        return null;
    }
    // §A.21.D39(#7) — resolve the active project id from MULTIPLE sources, not just
    // `runtime.audit.projectId`. The Site aggregate's deterministic id is
    // `site_<projectId>`, so an empty projectId here means the climate-keying
    // auto-create in `ensureSiteClimate` silently bails → the wind rose + 3D
    // wind/heat overlays sit on "No wind data" forever on the generate-house →
    // Forma flow (the house demo path doesn't always populate `audit.projectId`,
    // but `runtime.projectContext` / `window.projectContext` always carry it).
    const projectId = resolveActiveProjectId(rt);
    if (!projectId) {
        console.warn('[gis] no active project (no projectId on audit / projectContext) — open/create a project first.');
        toast('No active project — open or create a project first.', 'error');
        return null;
    }
    return { rt, store, projectId, toast };
}

/**
 * Resolve the active project id from the most-reliable source available.
 * Order: `runtime.audit.projectId` → `runtime.projectContext.projectId` →
 * `window.__pendingProjectId` → `window.projectContext.projectId`. The Site id is
 * deterministic (`site_<projectId>`), so this MUST be consistent everywhere a Site
 * is created or read — using a different source per call site produces two Sites
 * and the climate dataset keys to the wrong one (§A.21.D39(#7)).
 *
 * §A.21.D40(#6) — DEAD-BRANCH FIX. The D39 fallback read `window.projectContext.projectId`,
 * but on the editor `window.projectContext` is the `@pryzm/core-app-model`
 * `ProjectContext` (it only exposes `activeLevelId` + `editorMode` — there is NO
 * `projectId` field), so that branch was ALWAYS `undefined` and the generate-house →
 * Forma flow (audit + runtime.projectContext both empty for a tick) still resolved
 * null → no Site → empty wind rose. The legacy `window.__pendingProjectId` global
 * (set by ProjectHub.openProject before/around the runtime audit lands) is the one
 * that IS populated on that flow, so it is the real fallback. The field-less
 * `window.projectContext.projectId` read is kept LAST purely as a future-proof
 * no-op (harmless if a projectId field is ever added there).
 */
export function resolveActiveProjectId(rt: PryzmRuntime): string | null {
    const auditPid = rt.audit?.projectId;
    if (typeof auditPid === 'string' && auditPid.length > 0) return auditPid;
    const ctxPid = rt.projectContext?.projectId;
    if (typeof ctxPid === 'string' && ctxPid.length > 0) return ctxPid;
    try {
        const win = window as unknown as {
            __pendingProjectId?: string | null;
            projectContext?: { projectId?: string | null };
        };
        // The global ProjectHub sets when opening a project — populated on the
        // house demo flow even when the runtime audit/context race empty.
        const pendingPid = win.__pendingProjectId;
        if (typeof pendingPid === 'string' && pendingPid.length > 0) return pendingPid;
        // Future-proof no-op (core-app-model ProjectContext has no projectId today).
        const winPid = win.projectContext?.projectId;
        if (typeof winPid === 'string' && winPid.length > 0) return winPid;
    } catch { /* no window / no globals */ }
    return null;
}

/**
 * Ensure a Site exists for the active project, returning its id. Idempotent —
 * `site.create` uses a deterministic `site_<projectId>` id, so re-issuing is
 * safe. If a Site already exists, returns its id without re-creating.
 *
 * @param location  optional initial location to seed on first create.
 */
export function ensureSite(
    ctx: SiteContext,
    location?: { latitude: number; longitude: number; siteAddress?: string | null },
): string | null {
    const existing = ctx.store.getSite();
    if (existing) return existing.id;

    // `location` is a required key on SiteCreatePayloadSchema (its inner fields
    // default, but the object itself is not optional) — supply a 0/0 location
    // when the caller has none yet (e.g. boundary-draw before a geocode search).
    const seedLocation = location ?? { latitude: 0, longitude: 0, siteAddress: null };
    const createRes = siteCreate(
        {
            projectId: ctx.projectId,
            location: seedLocation,
        },
        ctx.store,
    );
    if (!createRes.ok) {
        console.error('[gis] site.create rejected:', createRes.reason, createRes.message);
        ctx.toast(`Site create failed: ${createRes.message}`, 'error');
        return null;
    }
    console.log('[gis] site.created', createRes.event);
    ctx.rt.events?.emit('site.created', createRes.event);
    return createRes.event.siteId;
}

/**
 * Set the Site location (lat/lon + optional address) via the pure
 * `site.updateLocation` handler, emitting `site.location-changed`. Creates the
 * Site first if it does not exist yet. Returns true on success.
 *
 * C19 §1.3 (FORMA.4 precondition): the LTP-ENU frame origin is now rebased to the
 * real site lat/lon SYNCHRONOUSLY before `site.location-changed` emits, via
 * `setLtpOriginIfSafe` — this is what makes the Cesium 3D placement real-world
 * accurate. The rebase is guarded to run only when no parcel boundary exists yet
 * (boundary-shift hazard — see the note on `setLtpOriginIfSafe`).
 */
export function dispatchSiteLocation(
    ctx: SiteContext,
    location: { latitude: number; longitude: number; siteAddress?: string | null },
): boolean {
    // §STARTUP-LOCATION-IDEMPOTENT (founder 2026-08-07, 5–10× startup) — A RECENTLY-DISPATCHED,
    // UNCHANGED LOCATION EMITS NOTHING. The startup pipeline legitimately calls this from
    // several places for the SAME picked point within one commit sequence (the §22 reveal's
    // anchor step, `startDrawThenGenerate`'s re-anchor, the draw/select commit's
    // ensure-location) — and every duplicate emit of `site.location-changed` used to cost a
    // full downstream pass: a redundant camera fly plus a FORCED context re-render of thousands
    // of entities in `CesiumViewport`'s subscriber (the founder's logged "site.location-changed
    // → flying camera" ×2 with identical coordinates). Events notify CHANGES; a write that
    // changes nothing is a successful no-op, not a broadcast.
    //
    // ⚠ TWO DELIBERATE LIMITS ON THE GUARD:
    //   • EXACT equality (the duplicates are the same floats passed twice); a genuinely new
    //     address label on the same coordinates still goes through.
    //   • A RECENCY WINDOW: only a duplicate arriving within 30 s of the last accepted dispatch
    //     is suppressed. A user who re-searches the same address minutes later, after panning
    //     away, is asking the camera to come back — that is a real intent, not a pipeline echo.
    const existingSite = ctx.store.getSite();
    if (existingSite && _lastLocationDispatchAtMs !== null &&
        Date.now() - _lastLocationDispatchAtMs < 30_000) {
        const cur = existingSite.location;
        const sameCoords =
            cur.latitude === location.latitude && cur.longitude === location.longitude;
        const sameAddress =
            location.siteAddress == null || location.siteAddress === cur.siteAddress;
        if (sameCoords && sameAddress) {
            console.log(
                '[gis] §STARTUP-LOCATION-IDEMPOTENT — site location unchanged ' +
                    `(${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}) within the ` +
                    '30 s window; no re-emit, no re-fly, no context re-render.',
            );
            return true;
        }
    }

    const siteId = ensureSite(ctx, location);
    if (!siteId) return false;

    const locRes = siteUpdateLocation({ siteId, location }, ctx.store);
    if (!locRes.ok) {
        console.warn('[gis] site.updateLocation soft-reject:', locRes.reason, locRes.message);
        // Non-fatal if the create already set it; surface only if it's a hard problem.
        if (locRes.reason !== 'no-site') return true;
        ctx.toast(`Set location failed: ${locRes.message}`, 'error');
        return false;
    }
    // C19 §1.3 — rebase the LTP-ENU origin BEFORE emitting the event (guarded).
    setLtpOriginIfSafe(ctx, location.latitude, location.longitude);
    _lastLocationDispatchAtMs = Date.now(); // §STARTUP-LOCATION-IDEMPOTENT — window anchor.
    console.log('[gis] site.location-changed', locRes.event);
    ctx.rt.events?.emit('site.location-changed', locRes.event);
    return true;
}

/** §STARTUP-LOCATION-IDEMPOTENT — when the last ACCEPTED location dispatch emitted, for the
 *  30 s duplicate-suppression window above. Module-local like `_lastEnvelope`; a stale value
 *  can only ever let a duplicate THROUGH (the pre-guard behaviour), never suppress a change. */
let _lastLocationDispatchAtMs: number | null = null;

/**
 * §L-384 — CLEAR the committed parcel boundary so the user can RE-DRAW (or re-select
 * a parcel). The C19 §1.4 parcel polygon is IMMUTABLE one-shot: `site.setParcelBoundary`
 * rejects a second call with `parcel-already-set` and explicitly directs callers to
 * `site.replace`. So re-draw is a clean CLEAR-then-recreate — never a mutation of the
 * immutable polygon: this replaces the Site with an identical model whose parcel
 * boundary is emptied (the same valid "no boundary yet" state a freshly-created Site
 * has), via the C19 §4.1 `site.replace` command (single-undo, keeps id/projectId).
 *
 * Does NOT emit `site.parcel-boundary-set` (the onboarding flow subscribes to it for
 * ADVANCING — re-emitting would wrongly push the wizard to the confirm step). The store
 * mutation from `site.replace` fires the SiteModelStore's own coarse `subscribe`
 * notification, which `ParcelBoundarySceneRenderer` uses to re-read the now-empty store
 * and drop the stale 3D outline. Returns true when the Site is left with no boundary
 * (either it was cleared, or there was nothing to clear).
 */
export function dispatchClearParcelBoundary(ctx: SiteContext): boolean {
    const site = ctx.store.getSite();
    if (!site) {
        console.warn('[gis] §L-384 dispatchClearParcelBoundary: no Site — nothing to clear.');
        return false;
    }
    const hadBoundary = (site.parcel?.boundary?.polygon?.length ?? 0) >= 1;
    if (!hadBoundary) return true; // already empty — a fresh draw can commit directly

    const replacement = {
        ...site,
        // §SEAM-2 INCREMENT 1 (g3) — RESET trueNorth to 0 on CLEAR. The boundary is what DERIVES θ,
        // so clearing the boundary without clearing θ leaks the previous parcel's ±45° into the next
        // Redraw: a freshly-drawn θ=0 parcel would then be read/de-rotated against a stale angle
        // (write≠read). Zero is the identity and the honest "no parcel ⇒ no project north" state; the
        // next commit republishes θ unconditionally (g1). θ-independent — correct at any site.
        location: { ...site.location, trueNorth: 0 },
        parcel: {
            ...site.parcel,
            boundary: { polygon: [], edgeClassifications: [] },
            area: 0,
        },
    };
    const res = siteReplace({ siteId: site.id, replacement }, ctx.store);
    if (!res.ok) {
        console.error('[gis] §L-384 site.replace (clear boundary) rejected:', res.reason, res.message);
        ctx.toast(`Couldn’t clear the boundary to re-draw: ${res.message}`, 'error');
        return false;
    }
    // `siteReplace` set() already fired the SiteModelStore's coarse `subscribe`
    // notification — the ParcelBoundarySceneRenderer clears its stale outline off that.
    // C58 — drop the cached buildable envelope so the Forma view stops drawing it
    // (a fresh parcel selection recomputes it on the next `site.parcel-boundary-set`).
    _lastEnvelope = null;
    console.log('[gis] §L-384 parcel boundary cleared via site.replace — ready to re-draw.');
    return true;
}

/**
 * §FEAT-PROJECT-TRUE-NORTH (ADR-0114) — set ONLY the Site's project→true-north angle θ
 * (radians), preserving every other `SiteLocation` field. This is the P6 mutation path
 * that mirrors the site-plan underlay's committed placement onto the model: the plan
 * view keeps editing in the project (orthogonal) frame, and the 3D globe reads
 * `SiteLocation.trueNorth` to sit the model on the earth at true north.
 *
 * θ is DISTINCT from the underlay's on-canvas rotation (that stays on the overlay
 * transform). Idempotent + guarded; requires a Site to already exist (returns false
 * with a toast otherwise — the geolocation step creates the Site first).
 */
export function dispatchSiteTrueNorth(ctx: SiteContext, thetaRad: number): boolean {
    if (!Number.isFinite(thetaRad)) {
        console.warn('[gis] dispatchSiteTrueNorth: non-finite θ ignored.');
        return false;
    }
    const site = ctx.store.getSite();
    if (!site) {
        console.warn('[gis] dispatchSiteTrueNorth: no Site — geolocate the site first.');
        ctx.toast('Set the site location before committing Project North.', 'error');
        return false;
    }
    // Preserve the whole SiteLocation; override only trueNorth (§FEAT-PROJECT-TRUE-NORTH).
    const nextLocation = { ...site.location, trueNorth: thetaRad };
    const res = siteUpdateLocation({ siteId: site.id, location: nextLocation }, ctx.store);
    if (!res.ok) {
        console.warn('[gis] dispatchSiteTrueNorth soft-reject:', res.reason, res.message);
        ctx.toast(`Set Project North failed: ${res.message}`, 'error');
        return false;
    }
    console.log('[gis] site Project North set → θ(rad)=', thetaRad, res.event);
    ctx.rt.events?.emit('site.location-changed', res.event);
    return true;
}

/** §FIX-BOUNDARY-COMMIT-REFUSE — the verdict `canCommitParcelBoundary` returns. */
export type ParcelCommitVerdict =
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: 'parcel-already-set'; readonly message: string };

const _siteCommitTracer = trace.getTracer('pryzm.site.commit');

/**
 * §FIX-BOUNDARY-COMMIT-REFUSE (ADR-0299 §Decision 1 + 2) — CAN a parcel boundary be
 * committed right now? Asked by an authoring surface BEFORE it mutates anything.
 *
 * WHY THIS EXISTS. The C19 §1.4 parcel polygon is a one-shot: `site.setParcelBoundary`
 * rejects a second commit with `parcel-already-set`. `SiteBoundaryMap2D.commit()` used to
 * discover that only AFTER it had already rebased the LTP-ENU origin onto the new ring
 * (`dispatchSiteLocation`) — a mutation that SUCCEEDS — and then froze its draw surface and
 * fired `onCommit()` regardless. So a boundary authored by any OTHER path while that map is
 * live (the onboarding draw watchdog's default plot, "Skip drawing", `createSiteFromRect`)
 * left the user able to draw a parcel that was silently discarded, on a frame that had
 * moved out from under the boundary still committed, with the surface frozen on the lie.
 *
 * ADR-0299's test — *"if the thing I am repairing were impossible by construction, would I
 * notice?"* — is answered YES here: committing over an existing boundary IS impossible by
 * construction, so this refuses it by name, before the first side effect, and names the ONE
 * legal route (CLEAR-then-recreate via `dispatchClearParcelBoundary` / the map's "↺ Redraw
 * boundary") rather than half-performing the commit.
 *
 * Pure read of the store — no mutation, no toast, no event. The CALLER decides how loudly to
 * surface the refusal (the map logs + toasts + reveals its Redraw affordance).
 */
export function canCommitParcelBoundary(ctx: SiteContext): ParcelCommitVerdict {
    const span = _siteCommitTracer.startSpan('pryzm.site.canCommitParcelBoundary');
    try {
        const site = ctx.store.getSite();
        // No Site yet is FINE — `dispatchParcelBoundary` creates it (`ensureSite`).
        const committedVertices = site?.parcel?.boundary?.polygon?.length ?? 0;
        span.setAttribute('pryzm.site.committed_vertices', committedVertices);
        if (committedVertices >= 1) {
            span.setAttribute('pryzm.site.commit_verdict', 'parcel-already-set');
            return {
                ok: false,
                reason: 'parcel-already-set',
                message:
                    'This site already has a committed parcel boundary (C19 §1.4 — the polygon is a ' +
                    'one-shot). Use "↺ Redraw boundary" to clear it first, then draw or select again.',
            };
        }
        span.setAttribute('pryzm.site.commit_verdict', 'ok');
        return { ok: true };
    } finally {
        span.end();
    }
}

/**
 * Author the parcel boundary via the pure `site.setParcelBoundary` handler,
 * emitting `site.parcel-boundary-set`. Creates the Site first if needed. The
 * polygon is one-shot immutable per C19 §1.4 — a second call rejects with
 * `parcel-already-set`. Returns true on success.
 */
export function dispatchParcelBoundary(
    ctx: SiteContext,
    boundary: {
        polygon: XZPoint[];
        edgeClassifications: ParcelEdgeClassification[];
    },
    /**
     * §L-1580 (C57 §1.4 / §2.2) — the cadastral attribution of THIS ring.
     *
     * WHY THIS PARAMETER EXISTS. Until §L-1580 this function's signature was exactly
     * `{ polygon, edgeClassifications }`, so the `refcat` / `address` / `source` /
     * `sourceCrs` / `confidence` that `ParcelFeature` carries and that the map's info card
     * renders were ALL discarded here — the one seam between the fetch and the persisted
     * legal datum. C57 §1.4 ("Provenance is not optional") could not be satisfied by any
     * caller, because there was no argument to satisfy it with.
     *
     * OMITTED = the caller genuinely has none (the hand-drawn path, `createSiteFromRect`,
     * the onboarding default plot). It persists as `null`, meaning NOT RECORDED. Nothing
     * is synthesised in its place: a fabricated `source` reads exactly like a real one.
     */
    provenance?: ParcelProvenance | null,
): boolean {
    const siteId = ensureSite(ctx);
    if (!siteId) return false;

    // §L-430 slice 3 — THE PRODUCER. Everything before this slice derived or consumed θ while
    // it was still 0; this is the single point that makes it non-zero, and it is deliberately
    // the LAST piece so every consumer was already in place (ADR-0115 §Remaining, sequencing).
    //
    // WHY DE-ROTATE THE RING AT COMMIT rather than apply θ⁻¹ at every consumer (the fork
    // recorded in ADR-0115 item 8): this is ADR-0070's RIGID-TRANSFORM-LAST rule. The parcel
    // arrives TRUE-north-framed from `buildBoundaryFromLatLonRing`; rotating it ONCE, here,
    // means every downstream stage — envelope inset, generators, walls, rooms, snapping,
    // the plan view — is authored in an axis-aligned frame with no further transform and no
    // per-consumer θ to forget. The alternative sprays θ⁻¹ across every reader, which is how
    // one missed site silently mixes frames.
    //
    // The rotation is about the SCENE ORIGIN, which IS the LTP-ENU origin the ring was
    // projected about, so it is exactly the free-vector form and no base term is needed.
    // θ = 0 (a parcel already square to true north) ⇒ EXACT identity ⇒ byte-identical to
    // before for every existing project (ADR-0070 byte-identity).
    const projectNorthRad = deriveProjectNorthAngleFromParcel(boundary.polygon);

    // §SEAM-2 INCREMENT 1 (g1) — PUBLISH θ UNCONDITIONALLY, including 0. Persist θ FIRST: the
    // consumers (globe, solar, north arrow, plan pane) read it from `SiteLocation.trueNorth`, and
    // `site.parcel-boundary-set` below triggers the first render — setting it after would paint one
    // frame in the wrong orientation. This write used to be guarded behind `projectNorthRad !== 0`,
    // so a parcel that folds to θ=0 NEVER published 0 and a PRIOR parcel's ±45° survived in the
    // store: the θ_read then latched a stale angle onto a square ring (the redraw→θ=0 displacement).
    // The write is the SSOT for the authoring frame; skipping it when the value is the identity is
    // exactly what split write from read. θ-independent: 0 is written honestly (Denmark), a nonzero
    // θ is written honestly (Barcelona).
    //
    // §SEAM-2 INCREMENT 1 (g2) — the write is TRANSACTIONAL. `dispatchSiteTrueNorth` can soft-reject
    // (no Site / non-finite / store reject) and previously its boolean was ignored while the ring was
    // de-rotated anyway → a ring squared to a θ the frame never recorded (a permanent write≠read
    // split). De-rotate the ring ONLY when the θ write SUCCEEDED; if it failed, leave the ring in its
    // TRUE frame — honest, since an un-published θ must never de-rotate.
    const northWritten = dispatchSiteTrueNorth(ctx, projectNorthRad);
    if (northWritten && projectNorthRad !== 0) {
        boundary = {
            // Edge ORDER is preserved by a rotation, so `edgeClassifications` (indexed by
            // edge) stays valid without recomputation.
            polygon: boundary.polygon.map((p) => {
                const e = trueVectorToProjectNorth({ east: p.x, north: -p.z }, projectNorthRad);
                return { x: e.east, z: -e.north };
            }),
            edgeClassifications: boundary.edgeClassifications,
        };
        console.log(
            `[gis] §L-430 project north — parcel squared to its dominant edge: `
            + `θ = ${(projectNorthRad * 180 / Math.PI).toFixed(2)}° (project→true). `
            + `Authoring frame is now orthogonal; 3D Site + globe re-apply θ for true north.`,
        );
    } else if (!northWritten) {
        console.warn(
            `[gis] §SEAM-2 (g2) — θ write soft-rejected (θ=${(projectNorthRad * 180 / Math.PI).toFixed(2)}°); `
            + `leaving the ring in its TRUE frame rather than de-rotating against an unrecorded θ.`,
        );
    }

    const boundaryRes = siteSetParcelBoundary(
        // §L-1580 — the provenance travels on the SAME command as the ring (P6: the UI never
        // writes `parcel.provenance` directly). One command, one write, so there is no window
        // in which the ring is committed and its attribution is not.
        { siteId, boundary, provenance: provenance ?? null },
        ctx.store,
    );
    if (!boundaryRes.ok) {
        console.error('[gis] site.setParcelBoundary rejected:', boundaryRes.reason, boundaryRes.message);
        ctx.toast(`Set parcel boundary failed: ${boundaryRes.message}`, 'error');
        return false;
    }
    console.log(
        '[gis] site.parcel-boundary-set', boundaryRes.event, 'area(m²)=', boundaryRes.event.area,
        // §L-1580 — say which of the two happened. "provenance=NOT RECORDED" is a fact worth
        // seeing in the log, because it is the state every pre-§L-1580 project is in.
        boundaryRes.event.provenance
            ? `provenance=${boundaryRes.event.provenance.kind}/${boundaryRes.event.provenance.source}`
            + ` refcat=${boundaryRes.event.provenance.refcat ?? 'none'}`
            : 'provenance=NOT RECORDED (C57 §1.4 — the caller supplied none)',
    );
    markStartupPhase('parcel:committed'); // §STARTUP-BUDGET

    // C58 (L-398 + L-402b) + §ENVELOPE-VIA-MASSING (L-402d) — ORDERING FIX. Compute +
    // cache the buildable envelope BEFORE emitting `site.parcel-boundary-set`. The Forma
    // live-update subscribes to that event and does the FIRST (framing) render of the 3D
    // Site; computing the envelope FIRST means its inset ring is already cached
    // (getLastBuildableEnvelope) when that render reads it, so the purple study volume is
    // drawn in the SAME pass as the parcel boundary — not missing on the framing pass and
    // only appearing on a later `site.zoning-updated` re-render (which a stale-input
    // terrain re-place could also clobber). Single producer (solveEstimatedEnvelope),
    // one cache, consumed by BOTH the framing render and the zoning dispatch below.
    const envelope = computeAndCacheEstimatedEnvelope(boundary);
    ctx.rt.events?.emit('site.parcel-boundary-set', boundaryRes.event);

    // C58 (L-398 / L-399a) — the payoff of committing a parcel: thread the buildable
    // envelope's numeric results onto the C19 Parcel via the EXISTING `site.updateZoning`
    // command (P6 — the UI never writes zoning fields directly). Jurisdiction-selected: a
    // plot in Denmark resolves REAL structured Plandata.dk zoning (which REPLACES the
    // estimated ring cached above once its async fetch returns); everywhere else the
    // estimated envelope (already computed + cached for the framing render) is threaded on.
    applyZoning(ctx, boundary, envelope);
    return true;
}

/**
 * §MANUAL-ADMIN-ZONE-REAPPLY-FIX (2026-08-05) — re-runs zoning resolution against the site's
 * ALREADY-COMMITTED boundary, WITHOUT touching geometry at all. Exists because
 * `ManualAdminZonePanel.ts` needs to force a fresh zoning resolve immediately after saving a
 * manual entry (so the just-saved entry is picked up), and re-calling the full
 * `dispatchParcelBoundary` for that purpose is UNSAFE to repeat: that function RE-DERIVES the
 * project-north angle from the boundary and RE-ROTATES it whenever the derivation comes out
 * non-zero. For a simple rectangle this is idempotent (a second derivation on an already-squared
 * polygon yields θ≈0); for a complex/hand-drawn boundary with many short edges (a real case, not
 * hypothetical), the "dominant edge" the derivation picks can differ run-to-run, so each
 * re-commit can apply a SMALL additional rotation — silently shifting the polygon's coordinates
 * on every save-then-recompute cycle. That would reopen the exact query-point mismatch this same
 * fix pass just closed (see `deriveParcelQueryLatLon`), just one layer deeper: the point SAVED a
 * moment earlier (from boundary version N) could already differ from the point the next resolve
 * QUERIES (boundary version N+1, freshly re-rotated) — even with save and resolve now using the
 * identical formula.
 *
 * Returns false (no-op) if there is no active site or no committed boundary yet.
 */
export function reapplyZoningForActiveSite(ctx: SiteContext): boolean {
    const site = ctx.store.getSite();
    const boundary = site?.parcel?.boundary;
    if (!site || !boundary || !Array.isArray(boundary.polygon) || boundary.polygon.length < 3) {
        return false;
    }
    // §GR-10/GR-14 — read BARE, exactly as this file's ~25 sibling reads do.
    // `Parcel['boundary'].edgeClassifications` is REQUIRED (zod `.default([])`,
    // packages/schemas/src/site/Parcel.ts), so the removed `?? []` could only
    // ever fire on type-violating data — and then it would have silently forged
    // "classified, zero fronts" out of a corrupt record while every sibling read
    // crashed loudly. Failure must not impersonate emptiness (C78 §1.4); the
    // schema guarantee is pinned by ParcelFrontageHonesty.test.ts.
    const zoningBoundary = {
        polygon: boundary.polygon,
        edgeClassifications: boundary.edgeClassifications,
    };
    const envelope = computeAndCacheEstimatedEnvelope(zoningBoundary);
    applyZoning(ctx, zoningBoundary, envelope);
    return true;
}

type ZoningBoundary = {
    polygon: XZPoint[];
    edgeClassifications: ParcelEdgeClassification[];
};

/**
 * C58 §1.5 (L-399a) — JURISDICTION SELECTION. Route the just-committed parcel to
 * the right zoning provider: a plot whose site location is in Denmark resolves
 * REAL structured Plandata.dk zoning (`confidence: 'structured'`); everywhere
 * else dispatches the curated `estimated-default` envelope (`estimated-ruleset`).
 *
 * The DK path is async (same-origin proxy fetch) and best-effort, but — §DK-HONEST-REFUSAL —
 * it does NOT fall back to the estimated envelope: Denmark is a PACKED jurisdiction, so when
 * Plandata resolves a plan without enough structured numbers to draw a volume (or no plan), it
 * dispatches an HONEST CITED REFUSAL (names the zone + links the plan PDF), never the generic
 * `estimated-default` triple — a fabricated estimate where a real pack exists is the
 * §CONTEXT-DATA-HONESTY failure. Non-DK / unpacked plots dispatch that same precomputed estimated
 * envelope synchronously — the geometry is solved once.
 *
 * §ENVELOPE-VIA-MASSING (L-402d) note: the estimated ring is already cached before
 * this runs (so the framing render has geometry); in Denmark the real structured
 * envelope REPLACES it in `_lastEnvelope` when the async fetch returns, and both
 * renderers redraw off the same single cache.
 */
/**
 * §L-521 / §MANUAL-ADMIN-ZONE-QUERY-POINT-FIX (2026-08-05) — the SINGLE source of truth for
 * "what lat/lon does PRYZM actually query zoning at for this parcel". Extracted from
 * `applyZoning` so every caller — the normal dispatch chain below AND
 * `ManualAdminZonePanel.ts`'s save handler — computes the IDENTICAL point.
 *
 * WHY THIS MATTERS: before this extraction, `ManualAdminZonePanel.ts` saved a manual entry at
 * `site.location.latitude/longitude` (the geocode/select ANCHOR), while `resolveManualAdminZone`'s
 * 60m match radius was always checked against THIS function's AREA-CENTROID point — the same
 * anchor-vs-parcel-centroid split L-521 already found and fixed for the Denmark/Barcelona real-
 * zoning fetch. On a DRAW flow (anchor = initial geocode, parcel drawn elsewhere) or any parcel
 * whose centroid sits >60m from its anchor, a manually-saved entry silently missed its own match
 * radius on read-back — the admin saw "Saved — envelope recomputed" but the card kept showing the
 * OLD refusal, because the resolver's query point never matched the entry's saved point. Founder-
 * reported and reproduced 2026-08-05.
 *
 * Uses the AREA centroid (shoelace), NOT the vertex average — see the original §L-521b note this
 * carries forward: a hand-drawn concave boundary's vertex average can drift outside the polygon.
 */
export function deriveParcelQueryLatLon(
    loc: { latitude: number; longitude: number; trueNorth?: number } | null | undefined,
    boundaryPolygon: ReadonlyArray<XZPoint>,
): { lat: number; lon: number } | null {
    if (!loc) return null;
    if (boundaryPolygon.length < 3) {
        return Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)
            ? { lat: loc.latitude, lon: loc.longitude }
            : null;
    }
    const poly = boundaryPolygon;
    let cx = 0, cz = 0;
    let a2 = 0, ax = 0, az = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
        const cross = p.x * q.z - q.x * p.z;
        a2 += cross;
        ax += (p.x + q.x) * cross;
        az += (p.z + q.z) * cross;
    }
    if (Math.abs(a2) > 1e-6) {
        cx = ax / (3 * a2);
        cz = az / (3 * a2);
    } else {
        for (const p of poly) { cx += p.x; cz += p.z; }
        cx /= poly.length; cz /= poly.length;
    }
    const theta = Number.isFinite(loc.trueNorth) ? (loc.trueNorth as number) : 0;
    const tn = theta === 0
        ? { east: cx, north: -cz }
        : trueVectorToProjectNorth({ east: cx, north: -cz }, -theta);
    const ll = sceneXZToLatLon({ x: tn.east, z: -tn.north }, loc.latitude, loc.longitude);
    return { lat: ll.lat, lon: ll.lon };
}

function applyZoning(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    estimated: BuildableEnvelope | null,
): void {
    // §L-663 — CLEAR FIRST, outside the try. Everything below can throw, and the `catch` calls
    // `applyEstimatedZoning`; a point left over from the PREVIOUS parcel would then decide this
    // one's jurisdiction. A cleared point refuses nothing and claims nothing, which is the only
    // honest value for "we have not derived it yet".
    _lastParcelQueryPoint = null;
    try {
        const loc = ctx.store.getSite()?.location;
        // §L-521 — resolve the jurisdiction + fetch the REAL zoning at the DRAWN PARCEL'S actual
        // centroid, NOT the site anchor. On a SELECT flow the anchor IS the parcel (centroid ≈
        // anchor ⇒ unchanged); on a DRAW flow the anchor is the initial geocode (e.g. the Barcelona
        // city centre / Gothic Quarter) while the boundary is drawn elsewhere (Passeig de Gràcia),
        // so querying at the anchor hit a NON-Eixample clau and fell back to estimated — the
        // founder's "the drawn envelope stays on placeholder dims". See `deriveParcelQueryLatLon`
        // above (extracted 2026-08-05 so this is the SAME point a manual admin entry is matched
        // against, not a second, silently-diverging computation).
        const derived = deriveParcelQueryLatLon(loc, boundary.polygon);
        let qLat: number | undefined = derived?.lat ?? loc?.latitude;
        let qLon: number | undefined = derived?.lon ?? loc?.longitude;
        // §L-663 — PUBLISH THE ROUTING POINT for the estimated-fallback chokepoint, and publish it
        // UNCONDITIONALLY (including `null`). This is the single write; see the declaration for why
        // it is a module-local rather than a parameter threaded through fifteen call sites.
        _lastParcelQueryPoint =
            qLat != null && qLon != null && Number.isFinite(qLat) && Number.isFinite(qLon)
                ? { lat: qLat, lon: qLon }
                : null;
        // §JURISDICTION-DIAG (L-505 + L-521) — ALWAYS logs the anchor AND the parcel-centroid query
        // point, so a silent estimated fallback is never a mystery: if the founder finds NO
        // §BCN-REAL-ENVELOPE line, this says why — loc null vs isInBarcelona=false at the PARCEL.
        console.log(
            `[gis][c58] §JURISDICTION-DIAG anchor=${loc ? `${loc.latitude.toFixed(5)},${loc.longitude.toFixed(5)}` : 'NULL'} ` +
                `parcel=${qLat != null ? `${qLat.toFixed(5)},${qLon!.toFixed(5)}` : 'n/a'} ` +
                `isInDenmark=${qLat != null ? isInDenmark(qLat, qLon!) : 'n/a'} ` +
                `isInBarcelona=${qLat != null ? isInBarcelona(qLat, qLon!) : 'n/a'} (L-521: querying the PARCEL, not the anchor).`,
        );
        // §L-524a — PREFETCH context buildings at the PARCEL centroid (not just the geocode anchor).
        // The existing §CTX-PREFETCH-ON-LOCATION (CesiumViewport L-470) warms the per-bbox cache at
        // the SITE location — which on a DRAW is the geocode (city centre), a DIFFERENT bbox than the
        // parcel the 3D-Site render centres on. So the render MISSED that cache and did a cold, slow
        // Overpass round-trip (founder: "context takes too long / didn't render yet"). Same
        // anchor-vs-parcel gap as L-521. Warm the parcel bbox HERE, the moment the parcel is committed
        // — fire-and-forget (renders nothing, never throws), so the later render at the same bbox key
        // is a cache HIT. Bounded properly once L-513a tiles land (this becomes a <50 ms tile read).
        if (qLat != null && qLon != null) {
            void fetchContextBuildingsNearAndFar(qLat, qLon).catch(() => { /* prefetch is best-effort */ });
        }
        if (qLat != null && qLon != null && isInDenmark(qLat, qLon)) {
            void applyDkZoningThenFallback(ctx, boundary, qLat, qLon, estimated);
            return;
        }
        // Envelope Phase 2 §LH-ENVELOPE — an L'Hospitalet de Llobregat plot. ⚠ CHECKED BEFORE
        // Barcelona ON PURPOSE: L'Hospitalet is physically INSIDE the loose Barcelona metropolitan
        // box, so without this guard its parcels would fall into the Barcelona branch and be stamped
        // with `es-08019-barcelona` packs/citations — a mis-citation on another municipality's land.
        // Peeling it off FIRST leaves every Barcelona parcel byte-identical (`isInLHospitalet` is
        // false for them, so they fall straight through to `isInBarcelona` below). While
        // `LHOSPITALET_ENVELOPE_VERIFIED` is false the path renders a cited refusal, never a number.
        if (qLat != null && qLon != null && isInLHospitalet(qLat, qLon)) {
            void applyLHospitaletZoningThenFallback(ctx, boundary, qLat, qLon, estimated);
            return;
        }
        // Envelope Phase 2 §BDN-ENVELOPE — a Badalona plot. Same reasoning as L'Hospitalet above:
        // Badalona is inside the loose Barcelona metro box, so it is peeled off BEFORE `isInBarcelona`
        // (its box is disjoint from L'Hospitalet's, east of the Besòs). While `BADALONA_ENVELOPE_VERIFIED`
        // is false the path renders a cited refusal, never a borrowed Barcelona number.
        if (qLat != null && qLon != null && isInBadalona(qLat, qLon)) {
            void applyBadalonaZoningThenFallback(ctx, boundary, qLat, qLon, estimated);
            return;
        }
        // Envelope Phase 2 §SBL-ENVELOPE — a Sant Boi de Llobregat plot. Same reasoning as Badalona /
        // L'Hospitalet above: Sant Boi is inside the loose Barcelona metro box, so it is peeled off
        // BEFORE `isInBarcelona` (its box is on the east bank of the Llobregat, west of L'Hospitalet and
        // disjoint from Badalona). While `SANT_BOI_ENVELOPE_VERIFIED` is false the path renders a cited
        // refusal, never a borrowed Barcelona number.
        if (qLat != null && qLon != null && isInSantBoi(qLat, qLon)) {
            void applySantBoiZoningThenFallback(ctx, boundary, qLat, qLon, estimated);
            return;
        }
        // Envelope Phase 2 §CRN-ENVELOPE — a Cornellà de Llobregat plot. Same reasoning as Sant Boi /
        // Badalona / L'Hospitalet above: Cornellà is inside the loose Barcelona metro box, so it is
        // peeled off BEFORE `isInBarcelona` (its box sits in the narrow gap on the east bank of the
        // Llobregat, east of Sant Boi and west of L'Hospitalet, disjoint from Badalona). While
        // `CORNELLA_ENVELOPE_VERIFIED` is false the path renders a cited refusal, never a borrowed
        // Barcelona number.
        if (qLat != null && qLon != null && isInCornella(qLat, qLon)) {
            void applyCornellaZoningThenFallback(ctx, boundary, qLat, qLon, estimated);
            return;
        }
        // ADR-0271 §BCN-REAL-ENVELOPE — a Barcelona-metro plot resolves the REAL, cited
        // ensanche envelope (clau 13a/13E, block-derived profunditat edificable per PGM
        // Art. 242.2). Async + best-effort: ANY problem (or a non-Eixample clau) falls back
        // to the precomputed estimated envelope, exactly like the DK path.
        // ⚠ 2026-08-02 — `AMB_BARCELONA` is passed EXPLICITLY. The four municipal branches above
        // still route to their own functions; this is the only site that reaches the AMB clau-18
        // machinery today, and naming the municipality here (rather than defaulting to it inside
        // the resolver) is what makes registering a 6th AMB city a call-site change instead of a
        // silent Barcelona query against someone else's land.
        if (qLat != null && qLon != null && isInBarcelona(qLat, qLon)) {
            void applyBcnZoningThenFallback(ctx, boundary, qLat, qLon, estimated, AMB_BARCELONA);
            return;
        }
        // L-606 §SA-RIYADH-DEMO — a Riyadh plot resolves the MOMRAH national residential FOOTPRINT
        // (setbacks + ground coverage) from the user-picked class + user-supplied fronting street
        // width. No fetch: the resolve is pure and synchronous. Missing width ⇒ a cited
        // needs-street-width refusal (never the floor triple), NOT the estimated fallback.
        if (qLat != null && qLon != null && isInRiyadh(qLat, qLon)) {
            applyRiyadhZoningThenFallback(ctx, boundary, estimated);
            return;
        }
        // L-608 — a Madrid-metro plot routes to the NZ 1 explicit-area path. Unlike DK/BCN, its
        // fallback on failure is a cited REFUSAL, never the estimated triple: NZ 1 is an
        // explicit-area zone (the ordinance publishes the buildable footprint as geometry), so a
        // front/side/rear estimate would be the wrong SHAPE, and the zone code is not yet verified.
        if (qLat != null && qLon != null && isInMadrid(qLat, qLon)) {
            void applyMadridZoningThenFallback(ctx, boundary, qLat, qLon, estimated);
            return;
        }
        // §COR-MANUAL-ADMIN-ZONE (2026-08-05) — checked FIRST, before every other Córdoba branch: an
        // allowlisted admin's manual zone entry, live only in their own session. Covers the WHOLE
        // municipality (not just the pilot), so it can override either downstream path. Falls
        // straight through to the existing chain (unmodified) for every non-admin session, and for
        // an admin session with no matching entry — see `applyCordobaManualAdminZoneThenFallback`.
        if (qLat != null && qLon != null && isInCordobaMunicipality(qLat, qLon)) {
            void applyCordobaManualAdminZoneThenFallback(ctx, boundary, qLat, qLon, estimated);
            return;
        }
        // §COR-ENVELOPE — a Córdoba (Sur + Noroeste pilot) plot. ⚠ The pack is machine-OCR'd and
        // UNVERIFIED, so this path renders NO number: until `sources/VERIFICATION.md` is signed it
        // dispatches a cited "machine-extracted, unverified" refusal, never a fabricated envelope.
        if (qLat != null && qLon != null && isInCordoba(qLat, qLon)) {
            void applyCordobaZoningThenFallback(ctx, boundary, qLat, qLon, estimated);
            return;
        }
        // §COR-TRACED-ZONE (2026-08-05) — a Córdoba point OUTSIDE the COACo pilot but still inside
        // the municipality: try PRYZM's own hand-traced CUS-sheet zone store. ⚠ Independently gated
        // (`CORDOBA_TRACED_ZONES_VERIFIED`, default OFF — see `applyCordobaTracedZoneThenFallback`'s
        // header) — while closed this branch is a documented no-op: it falls straight through to
        // `applyEstimatedZoning`, exactly what running with NO traced-zone branch at all would do,
        // so today's behaviour for this land (the §L-663 estimate-suppression refusal) is unchanged.
        if (
            qLat != null && qLon != null &&
            !isInCordoba(qLat, qLon) && isInCordobaMunicipality(qLat, qLon)
        ) {
            void applyCordobaTracedZoneThenFallback(ctx, boundary, qLat, qLon, estimated);
            return;
        }
        // §SEVILLA-ENVELOPE — a Sevilla (INE 41091) plot. ⚠ There is no transcribed ordinance at
        // all (unlike Córdoba/Madrid), so this path never renders a number: it resolves the real
        // `zona_orden` from the city's own ArcGIS service first, then dispatches a cited,
        // zone-named "PRYZM has not transcribed this ordinance" refusal.
        if (qLat != null && qLon != null && isInSevilla(qLat, qLon)) {
            void applySevillaZoningThenFallback(ctx, boundary, qLat, qLon, estimated);
            return;
        }
        // §ZGZ-ENVELOPE — a Zaragoza (INE 50297) plot. ⚠ The municipal calificación resolves LIVE
        // (`urbanismo:Calificaciones_Urbanas`), but the pack is UNSIGNED, so this path renders NO
        // number: until `sources/VERIFICATION.md` is signed it dispatches a cited "no signed rule"
        // refusal, naming the resolved grade when one resolves, never a fabricated envelope.
        if (qLat != null && qLon != null && isInZaragoza(qLat, qLon)) {
            void applyZaragozaZoningThenFallback(ctx, boundary, qLat, qLon, estimated);
            return;
        }
        // §TELDE-ENVELOPE — a Telde (INE 35026, Gran Canaria) plot. ⚠ The SIPU `EDIF` archive
        // publishes 31 of 46 zone codes as a drawable rule (named numeric columns, not an OCR or a
        // PDF transcription), but `CANARIAS_ENVELOPE_VERIFIED` is unsigned, so this path renders NO
        // number: until `sources/VERIFICATION.md` is signed it dispatches a cited "no signed
        // transcription" refusal, naming the resolved zone when one resolves, never a fabricated
        // envelope. VERIFICATION.md §6 records that a signature alone would not have rendered
        // anything here — this branch is the missing dispatch wiring that closes that gap.
        if (qLat != null && qLon != null && isInTelde(qLat, qLon)) {
            void applyTeldeZoningThenFallback(ctx, boundary, qLat, qLon, estimated);
            return;
        }
        // §EL-SAUZAL-ENVELOPE — an El Sauzal (INE 38041, Tenerife) plot. ⚠ Checked alongside Telde
        // (both Canarias, both offline-resolved) but registered as its own municipality — El
        // Sauzal's own bbox is on Tenerife, ~90 km from Telde's Gran Canaria box, so this test's
        // ORDER is legibility, not precedence. `EL_SAUZAL_ENVELOPE_VERIFIED` is unsigned, so this
        // path renders NO number: it dispatches a cited "no signed transcription" refusal, naming
        // the resolved ZUSO zone when one resolves, never a fabricated envelope.
        if (qLat != null && qLon != null && isInElSauzal(qLat, qLon)) {
            applyElSauzalZoningThenFallback(ctx, boundary, qLat, qLon, estimated);
            return;
        }
        // §RESEARCH-PENDING — Málaga (INE 29067) and Granada (INE 18087). ⚠ Neither has a
        // rulepack or a zone-identity resolver: PRYZM has not researched either ordinance yet.
        // Before this branch existed, a click here fell straight through to the estimated triple
        // (§L-663's fabrication defect) — this dispatches a cited "not yet researched" refusal
        // instead, never a fabricated number and never a claim of research that has not happened.
        if (qLat != null && qLon != null && isInMalaga(qLat, qLon)) {
            const site = ctx.store.getSite();
            if (!site) { applyEstimatedZoning(ctx, estimated); return; }
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope('malaga-research-pending', malagaResearchPendingRefusal(), 'none'),
                MALAGA_JURISDICTION_ID,
            );
            return;
        }
        if (qLat != null && qLon != null && isInGranada(qLat, qLon)) {
            const site = ctx.store.getSite();
            if (!site) { applyEstimatedZoning(ctx, estimated); return; }
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope('granada-research-pending', granadaResearchPendingRefusal(), 'none'),
                GRANADA_JURISDICTION_ID,
            );
            return;
        }
        // §CARTAGENA-ENVELOPE — a Cartagena (INE 30016) plot. ⚠ REGISTERED BEFORE the Murcia
        // (capital, INE 30030) branch below — Cartagena is its own municipality, ~50 km from
        // Murcia's box, and this ORDER is legibility not precedence. `CARTAGENA_ENVELOPE_VERIFIED`
        // is unsigned, so this ALWAYS resolves the live zone (to name it on the refusal card) then
        // dispatches a cited structural refusal — the "retranqueos a vial obligatorios" setback is
        // genuinely unquantified in the source ordinance, never fabricated as `0`.
        if (qLat != null && qLon != null && isInCartagena(qLat, qLon)) {
            void applyCartagenaZoningThenFallback(ctx, qLat, qLon, estimated);
            return;
        }
        // §RESEARCH-PENDING (second Murcia-region pass, 2026-08-04) — Lorca (30024), Molina de
        // Segura (30027), Alcantarilla (30005), Las Torres de Cotillas (30038). None has a
        // rulepack or a working parcel-level zone resolver — see each city's own module for the
        // specific confirmed blocker. Checked AFTER Cartagena (the one Murcia-region municipality
        // with a working resolver) and BEFORE the Murcia-capital branch below, for legibility only.
        if (qLat != null && qLon != null && isInLorca(qLat, qLon)) {
            const site = ctx.store.getSite();
            if (!site) { applyEstimatedZoning(ctx, estimated); return; }
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope('lorca-research-pending', lorcaResearchPendingRefusal(), 'none'),
                LORCA_JURISDICTION_ID,
            );
            return;
        }
        if (qLat != null && qLon != null && isInMolinaDeSegura(qLat, qLon)) {
            const site = ctx.store.getSite();
            if (!site) { applyEstimatedZoning(ctx, estimated); return; }
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(
                    'molina-de-segura-research-pending',
                    molinaDeSeguraResearchPendingRefusal(),
                    'none',
                ),
                MOLINA_DE_SEGURA_JURISDICTION_ID,
            );
            return;
        }
        if (qLat != null && qLon != null && isInAlcantarilla(qLat, qLon)) {
            void applyAlcantarillaZoningThenFallback(ctx, qLat, qLon, estimated);
            return;
        }
        if (qLat != null && qLon != null && isInLasTorresDeCotillas(qLat, qLon)) {
            const site = ctx.store.getSite();
            if (!site) { applyEstimatedZoning(ctx, estimated); return; }
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(
                    'las-torres-de-cotillas-research-pending',
                    lasTorresDeCotillasResearchPendingRefusal(),
                    'none',
                ),
                LAS_TORRES_DE_COTILLAS_JURISDICTION_ID,
            );
            return;
        }
        // §MURCIA-ENVELOPE — a Murcia (INE 30030) plot. ⚠ A REGIONALLY DISTINCT branch, not a
        // variation on the Catalan ones above: Región de Murcia, PGOU de Murcia, municipal
        // GeoServer. Its box is ~450 km from every other registered Spanish jurisdiction, so the
        // ORDER of this test is not load-bearing the way the AMB peel-offs are — it is placed with
        // the other Spanish branches for legibility, not for precedence. Like Madrid/Córdoba its
        // fallback is a cited REFUSAL, never the estimated triple: the municipal layers publish no
        // numeric buildable parameter, so a front/side/rear estimate would be pure invention.
        if (qLat != null && qLon != null && isInMurcia(qLat, qLon)) {
            void applyMurciaZoningThenFallback(ctx, boundary, qLat, qLon, estimated);
            return;
        }
        // §VALENCIA-ORIGEN-DERIVED-PLAN — a València (INE 46250) plot. ⚠ NEVER publishes a number:
        // `VALENCIA_ENVELOPE_VERIFIED` is `false` (Plano C / the `altura` offset convention — see
        // `esValenciaEnvelope.ts`) and this branch does not touch that gate. What it DOES do is read
        // the live `origen` field (`MapServer/231`, the same layer `resolveValenciaAlineaciones`
        // already queries for the R1 containment check) and, on the measured 36,40 % of buildable
        // land whose governing document is NOT the PGOU, dispatch the STRONGER, legally-grounded
        // `derived-plan` refusal instead of the generic `no-rule-pack` one — closing
        // CLOSURE-REGISTER #3. Any resolution failure (out-of-box, transport, no record) falls
        // through to `applyEstimatedZoning`, which the registered-jurisdiction guard then answers
        // with the same honest coverage refusal València has always had.
        if (qLat != null && qLon != null && isInValencia(qLat, qLon)) {
            void applyValenciaZoningThenFallback(ctx, qLat, qLon, estimated);
            return;
        }
        // §BALEARS-ENVELOPE (L-680) — an Illes Balears plot (Mallorca / Menorca / Eivissa /
        // Formentera). ⚠ ANOTHER REGIONALLY DISTINCT branch: the Govern de les Illes Balears, MUIB,
        // and — uniquely among the Spanish sources measured so far — a STRUCTURED normative fitxa
        // carrying the numeric parameters themselves. The islands are ~200 km offshore and overlap
        // no other registered box, so this test's ORDER is legibility, not precedence.
        //
        // ⛔ IT STILL RENDERS NO NUMBER, AND THAT IS NOT A GAP IN THIS BRANCH. `BALEARS_ENVELOPE_
        // VERIFIED` is `false` (nobody has signed the reading) and six constraint families are
        // unmodelled, so an envelope here is an OPEN TOP (ADR-0293) and the honest output is a cited
        // refusal that SHOWS what the fitxa says. Like Madrid/Córdoba/Murcia the fallback is that
        // refusal, never the estimated triple.
        if (qLat != null && qLon != null && isInBalears(qLat, qLon)) {
            void applyBalearsZoningThenFallback(ctx, boundary, qLat, qLon, estimated);
            return;
        }
        // SWITZERLAND — a Swiss plot resolves its REAL land-use zone from the national Nutzungsplanung
        // WFS and RENDERS it, while the buildable envelope refuses (density/height are model+PDF-bound,
        // Outcome B). Like Madrid/Córdoba, its fallback is a cited REFUSAL, never the estimated triple:
        // the zone is identified but no number can be cited, so a front/side/rear estimate would be a
        // fabrication the recon disproved.
        if (qLat != null && qLon != null && isInSwitzerland(qLat, qLon)) {
            void applyChZoningThenFallback(ctx, boundary, qLat, qLon);
            return;
        }
        // L-609 / §NL-NATIONWIDE — ANY Netherlands plot routes to the bestemmingsplan explicit-area
        // path (nationwide, keyless PDOK RP WMS). Like Madrid, its fallback on failure is a cited
        // REFUSAL, never the estimated triple: the ordinance publishes the buildable footprint
        // (bouwvlak) as geometry, so a front/side/rear estimate would be the wrong SHAPE. Gate ON.
        if (qLat != null && qLon != null && isInNetherlands(qLat, qLon)) {
            void applyNlZoningThenFallback(ctx, boundary, qLat, qLon);
            return;
        }
        // PARIS (Ville de Paris) — a Paris plot resolves its REAL PLU zone (GPU zone_urba), its numeric
        // hauteur plafond (opendata plub_hauteur) AND the published `plub_ecm` buildable-footprint polygon,
        // then DRAWS the real ECM footprint extruded to the published height (never parcel×hauteur). Where
        // no ECM covers the point the path refuses honestly (cited), never the estimated triple. Like
        // Madrid/Netherlands, the ordinance publishes the footprint as geometry, so a front/side/rear
        // estimate would be the wrong SHAPE. Gate ON. Same honesty discipline as Switzerland.
        if (qLat != null && qLon != null && isInParis(qLat, qLon)) {
            void applyParisZoningThenFallback(ctx, boundary, qLat, qLon);
            return;
        }
    } catch (e) {
        console.warn('[gis][c58] jurisdiction selection failed (non-fatal) — using estimated default:', e);
    }
    applyEstimatedZoning(ctx, estimated);
}

// ── L-606 §SA-RIYADH-DEMO — the demo inputs (class + fronting street width). ──────────────────
//
// The Saudi residential footprint is a function of `street width + plot class` (§2 of
// `saRiyadhDemo.ts`). Neither is fetchable here — the Balady parcel feed is geo-fenced, so per the
// pack's WIRING-TODO the CLASS is a user dropdown and the WIDTH is user-supplied. Until a UI
// control sets them, the width is null, which is the HONEST default: `saRiyadhResolvedPack` then
// refuses with `needs-street-width` rather than ship the floor triple (which would over-state the
// footprint on any street ≥ 15 m — the direction C58 §1.4 forbids). A future dropdown/field calls
// `setRiyadhDemoInputs` and re-commits the parcel to draw the real footprint.
interface RiyadhDemoInputs {
    readonly plotClass: SaudiPlotClass;
    readonly streetWidth_m: number | null;
}
let _riyadhDemoInputs: RiyadhDemoInputs = { plotClass: 'villa', streetWidth_m: null };

/** §SA-RIYADH-DEMO — set the Riyadh demo class + fronting street width (the UI dropdown/field). */
export function setRiyadhDemoInputs(inputs: {
    plotClass: SaudiPlotClass;
    streetWidth_m: number | null;
}): void {
    _riyadhDemoInputs = {
        plotClass: inputs.plotClass,
        streetWidth_m:
            typeof inputs.streetWidth_m === 'number' && Number.isFinite(inputs.streetWidth_m)
                ? inputs.streetWidth_m
                : null,
    };
}

/** §SA-RIYADH-DEMO — the current Riyadh demo inputs (read by any UI showing their state). */
export function getRiyadhDemoInputs(): RiyadhDemoInputs {
    return { ..._riyadhDemoInputs };
}

/**
 * L-606 §SA-RIYADH-DEMO — the Riyadh path. Resolves the MOMRAH national residential FOOTPRINT for
 * the drawn parcel from the user-picked class + user-supplied fronting street width:
 *
 *   1. `saRiyadhResolvedPack(width, class)` fills the chosen zone's `setbacks` with
 *      `max(w/5, floor)` (`ordinance-pdf` provenance) — or refuses `needs-street-width`.
 *   2. On refuse → a cited `source-data-unavailable` refusal (the width is a missing INPUT, not a
 *      legal fact) — never the estimated fallback, whose floor triple would over-state the
 *      footprint. `status: 'none'` so `dispatchEnvelope` clears any stale ring.
 *   3. On ok → `computeBuildableEnvelope` insets by the resolved triple + resolves `maxCoverage`;
 *      height/floors return null (the pack's cited-null findings). Confidence `estimated-ruleset`.
 *
 * PURE + synchronous (no fetch). Fully guarded — never throws into the commit path.
 */
function applyRiyadhZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    estimated: BuildableEnvelope | null,
): void {
    const TAG = '[gis][c58] §SA-RIYADH-DEMO';
    try {
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        const site = ctx.store.getSite();
        if (!site) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        const { plotClass, streetWidth_m } = _riyadhDemoInputs;
        const zoneCode = saRiyadhZoneCodeForClass(plotClass);
        const resolved = saRiyadhResolvedPack(streetWidth_m, plotClass);
        if (!resolved.ok) {
            // The zone IS buildable and the pack EXISTS — only the fronting street width is
            // missing. That is `source-data-unavailable` (L-574): an INPUT gap, not a legal
            // refusal, and the only refusal a retry (supply the width) can clear. NOT the
            // estimated fallback: the floor triple {3,2,2} would over-state the footprint.
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(
                    zoneCode,
                    {
                        code: 'source-data-unavailable',
                        headline: 'Fronting street width needed to resolve the Riyadh setback.',
                        detail: resolved.detail,
                        ordinanceRef: SA_HEIGHT_PLAN_DEFERRED_REF,
                        knownFacts: [
                            `Plot class: ${plotClass}`,
                            'Jurisdiction: Riyadh — MOMRAH national residential footprint (demo)',
                            'Supply the fronting street width (عرض الشارع) to resolve the setback.',
                        ],
                        legallyGrounded: false,
                    },
                    'none',
                ),
                'momrah-national-demo',
            );
            console.log(
                `${TAG} needs-street-width (class=${plotClass}) — cited refusal, NO estimated ` +
                    `fallback (the floor triple would over-state the footprint on any street ≥ 15 m).`,
            );
            return;
        }
        const record: ZoningRecord = {
            zoneCode,
            zoneLabel: resolved.pack.zones.find((z) => z.code === zoneCode)?.label ?? null,
            jurisdictionId: SA_RIYADH_JURISDICTION_ID,
            structuredFields: {},
            overlays: [],
            ordinanceRef: null,
            provenance: {
                source: 'momrah-national-demo',
                label: 'MOMRAH national residential footprint (user-supplied street width + class)',
                version: null,
                license: null,
                crs: 'EPSG:4326',
            },
        };
        const envelope = computeBuildableEnvelope({
            parcelRing: boundary.polygon,
            edgeClassifications: boundary.edgeClassifications,
            zoning: record,
            rulePack: resolved.pack,
        });
        if (envelope.status !== 'ok') {
            // The resolved setbacks consumed the whole parcel (a very narrow plot on a wide
            // street). A cited refusal is honest; the estimated triple is not the right answer.
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(
                    zoneCode,
                    {
                        code: 'source-data-unavailable',
                        headline: 'The MOMRAH setbacks leave no buildable footprint on this parcel.',
                        detail:
                            `Class ${plotClass}, street width ${streetWidth_m} m → ${resolved.why}. ` +
                            'The resolved setback triple consumes the whole parcel (a narrow plot on ' +
                            'a wide street). No buildable footprint remains.',
                        ordinanceRef: SA_HEIGHT_PLAN_DEFERRED_REF,
                        knownFacts: [`Plot class: ${plotClass}`, `Fronting street width: ${streetWidth_m} m`],
                        legallyGrounded: false,
                    },
                    'none',
                ),
                'momrah-national-demo',
            );
            console.log(`${TAG} envelope status=${envelope.status} — cited refusal (setbacks consumed the parcel).`);
            return;
        }
        dispatchEnvelope(ctx, site.id, envelope, 'momrah-national-demo');
        console.log(
            `${TAG} class=${plotClass} street=${streetWidth_m} m → setbacks ${resolved.why} ` +
                `· coverage=${envelope.maxCoverage ?? 'n/a'} · height=NONE (deferred to the ` +
                `municipal approved plan) · confidence=${envelope.confidence} status=${envelope.status}.`,
        );
    } catch (e) {
        console.warn('[gis][c58] §SA-RIYADH-DEMO path failed (non-fatal) — falling back to estimated default:', e);
        try { applyEstimatedZoning(ctx, estimated); } catch { /* estimated is best-effort too */ }
    }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// §DK-BYGGEFELT-TIER-1 — the live wiring for DK gap G6 tier 1 (stubs S2 / S3 / S4)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// WHAT THIS CLOSES. `ByggefeltProducer`, the classifier and the G6 resolver all shipped tested and
// wired to each other — and to NOTHING. A real user click never reached tier 1, so the strongest
// piece of evidence Denmark publishes about WHERE a building may stand was inert. This is the
// L5 seam that makes a click reach it.
//
// THREE THINGS HAD TO BE TRUE AT ONCE, which is why they land together:
//   S3  a SAME-ORIGIN PROXY. `User-Agent` is a forbidden header in browser `fetch` and is silently
//       dropped, so a browser hitting Plandata directly is an anonymous client on a public,
//       taxpayer-funded endpoint (and CORS + CSP would block it anyway). `requestStyle: 'proxy'`
//       points the producer at `/api/plandata/byggefelt`, where the real UA and one shared rate
//       limit actually apply.
//   S4  a PROJECTOR. Without one the producer emits geometry in its source CRS and the tier-1 CRS
//       interlock refuses EVERY record — loudly, which is right, but permanently. Supplying the
//       projector is what lets the interlock go quiet honestly instead of being switched off.
//   S8  PAGINATION, now followed inside the producer, so a dense urban bbox is a complete read
//       rather than one page plus an unresolved answer.
//
// ⚠ THE CRS CHOICE IS DELIBERATE AND IT REMOVES A WHOLE FAILURE CLASS. The producer is asked for
// **EPSG:4326**, not Plandata's native EPSG:25832, and the bbox filter is sent in 4326 too (axis
// order lon/lat — VERIFIED LIVE against geoserver.plandata.dk on 2026-07-31, since a swapped bbox
// lands off-map and returns zero features, which would masquerade as "no byggefelt here"). The
// alternative — 25832 metres — would need a UTM inverse in this path, and a projection bug there
// produces a plausible-looking building in the wrong place rather than an error. In 4326 the
// existing `latLonToSceneXZ` + θ transform (the exact one the parcel ring and the Madrid footprint
// already use) is the whole projector, so there is no second projection to get wrong.

/**
 * The ONE producer instance. It owns the rate-limit queue, the in-flight de-duplication map and the
 * LRU cache, and all three only work if they are SHARED — a per-click instance would silently
 * disable every one of them (and de-dup nothing, the L-585 lesson).
 *
 * Created lazily rather than at module scope: a top-level singleton is a module-load side effect,
 * and this file is imported by the editor bootstrap (§scc-no-barrel-access-at-module-load).
 */
let _dkByggefeltProducer: ByggefeltProducer | null = null;
function dkByggefeltProducer(): ByggefeltProducer {
    _dkByggefeltProducer ??= createByggefeltProducer({
        requestStyle: 'proxy',
        requestCrs: 'EPSG:4326',
        // A parcel-sized bbox holds a handful of building fields; the pages exist for dense blocks.
        pageSize: 200,
        maxPages: 5,
    });
    return _dkByggefeltProducer;
}

/** Half the padding, in metres, added around the parcel bbox when asking for byggefelter. */
const DK_BYGGEFELT_BBOX_PAD_M = 25;

interface DkByggefeltPlacement {
    readonly resolution: DkPlacementResolution;
    readonly tierOne: ByggefeltTierOneInput;
}

/**
 * Resolve DK tier-1 placement for a drawn parcel: fetch the byggefelter around it, classify them,
 * and ask the G6 resolver which (if any) may place the footprint.
 *
 * NEVER throws and never blocks the commit — returns `null` when the path cannot even be attempted,
 * which the caller treats exactly like "not consulted", never like "nothing published here".
 */
async function resolveDkByggefeltPlacement(
    boundary: ZoningBoundary,
    site: { location: { latitude: number; longitude: number; trueNorth?: number } },
): Promise<DkByggefeltPlacement | null> {
    try {
        const ring = boundary.polygon;
        if (!Array.isArray(ring) || ring.length < 3) return null;
        const originLat = site.location.latitude;
        const originLon = site.location.longitude;
        if (!Number.isFinite(originLat) || !Number.isFinite(originLon)) return null;
        const rawTheta = site.location.trueNorth;
        const theta = Number.isFinite(rawTheta) ? (rawTheta as number) : 0;

        // ── THE FRAME ROUND-TRIP. The parcel ring lives in the PROJECT-north authoring frame, so θ
        // must be undone to reach true north before the lat/lon inverse, and re-applied on the way
        // back. Skipping either direction on a rotated site yields a byggefelt that is plausibly
        // sized and rotated off the plot — the failure mode that looks like a render bug.
        const toTrueNorth = (p: Pt): Pt => {
            if (theta === 0) return p;
            const e = trueVectorToProjectNorth({ east: p.x, north: -p.z }, -theta);
            return { x: e.east, z: -e.north };
        };
        const toAuthoringFrame = (ll: LatLon): Pt => {
            const xz = latLonToSceneXZ(ll, originLat, originLon);
            if (theta === 0) return { x: xz.x, z: xz.z };
            const e = trueVectorToProjectNorth({ east: xz.x, north: -xz.z }, theta);
            return { x: e.east, z: -e.north };
        };

        // The parcel's lon/lat bbox, padded so a byggefelt that merely touches the plot is included.
        let minLat = Infinity;
        let maxLat = -Infinity;
        let minLon = Infinity;
        let maxLon = -Infinity;
        for (const p of ring) {
            const ll = sceneXZToLatLon(toTrueNorth(p), originLat, originLon);
            if (!Number.isFinite(ll.lat) || !Number.isFinite(ll.lon)) return null;
            minLat = Math.min(minLat, ll.lat);
            maxLat = Math.max(maxLat, ll.lat);
            minLon = Math.min(minLon, ll.lon);
            maxLon = Math.max(maxLon, ll.lon);
        }
        const padLat = DK_BYGGEFELT_BBOX_PAD_M / 111_320;
        const padLon = padLat / Math.max(0.2, Math.cos((originLat * Math.PI) / 180));

        // ⚠ THE PROJECTOR (S4). The producer hands GeoJSON coordinates through unchanged, so in
        // EPSG:4326 a point arrives as `{ x: LONGITUDE, z: LATITUDE }` — GeoJSON order, not lat/lon
        // order. Getting this pair the wrong way round puts a Danish parcel in the Indian Ocean; it
        // is spelled out rather than inferred for exactly that reason.
        const project = (p: Pt): Pt => toAuthoringFrame({ lat: p.z, lon: p.x });

        const fetched = await dkByggefeltProducer().fetchByBbox(
            {
                minX: minLon - padLon,
                minY: minLat - padLat,
                maxX: maxLon + padLon,
                maxY: maxLat + padLat,
            },
            { project },
        );
        const tierOne = byggefeltResultToTierOne(fetched);
        const resolution = resolveDkEnvelopePlacement({
            parcelRing: ring,
            parcelEdgeClassifications: boundary.edgeClassifications,
            byggefelt: tierOne.outcome,
            // Tiers 2–4 are NOT wired here, and `null` says exactly that: "not consulted", which the
            // resolver keeps distinct from "asked and found nothing". ⚠ Tier 2 is not merely unwired
            // — there is NO byggelinje layer in Plandata at all (198 `pdk:` layers, zero), and Danish
            // byggelinjer are road-authority vejbyggelinjer held by a different authority entirely.
            byggelinjer: null,
            lokalplanDepth: null,
        });
        return { resolution, tierOne };
    } catch (e) {
        console.warn('[gis][c58] §DK-BYGGEFELT-TIER-1 placement lookup failed (non-fatal):', e);
        return null;
    }
}

/**
 * §S10 — SURFACE THE WEAKER EVIDENCE. Advisory and unknown byggefelter were being produced, ranked
 * and returned, and then consumed by nothing.
 *
 * ⚠ SILENTLY DROPPING THEM IS NOT NEUTRAL. A parcel with three *vejledende* building fields drawn
 * across it is NOT the same as a parcel with none, and a user who can see those fields on the
 * municipality's own map deserves to be told that PRYZM saw them too and why they did not shape the
 * envelope. Showing nothing reads as "PRYZM found no data" — the §CONTEXT-DATA-HONESTY collapse, one
 * level up: a REFUSAL rendered as an ABSENCE.
 *
 * Facts only, and never a number a user could mistake for an allowance.
 */
function dkByggefeltEvidenceNotes(tierOne: ByggefeltTierOneInput): string[] {
    const notes: string[] = [];
    // Counted with an explicit loop rather than three `.filter()` passes: one traversal, and no
    // callback parameter whose type depends on this package resolving (the root `tsc` runs with
    // `noImplicitAny` and currently cannot resolve `@pryzm/site-parcel-data`).
    let advisory = 0;
    let notDeclared = 0;
    let unavailable = 0;
    for (const e of tierOne.evidence) {
        if (e.legalStatus === 'illustrative') advisory += 1;
        if (e.unknownCause === 'not-declared') notDeclared += 1;
        if (e.unknownCause === 'metadata-unavailable') unavailable += 1;
    }
    const conflicts = tierOne.conflicts.length;

    if (advisory > 0) {
        notes.push(
            `${advisory} ADVISORY byggefelt(er) („vejledende“) intersect this parcel. The ` +
                'municipality declared them indicative, so they may NOT place the buildable footprint ' +
                '— they are shown as weaker evidence, not ignored, and PRYZM does not "recover" ' +
                'them as binding by heuristic.',
        );
    }
    if (notDeclared > 0) {
        notes.push(
            `${notDeclared} byggefelt(er) here carry NO bindingness declaration either way. The ` +
                'lokalplan TEXT is the only remaining source for those — unknown, not "not binding".',
        );
    }
    if (unavailable > 0) {
        notes.push(
            `${unavailable} byggefelt(er) here have the bindingness flag UNPUBLISHED (null, which is ` +
                'not false). That may be a publication gap rather than a legal statement, so it is ' +
                'retryable in a way a settled non-declaration is not.',
        );
    }
    if (conflicts > 0) {
        notes.push(
            `${conflicts} byggefelt record(s) here CONTRADICT THEMSELVES — declared both binding ` +
                'and advisory by the publishing municipality. PRYZM refuses to pick a winner; the ' +
                'record must be corrected at source. Reported, never silently resolved.',
        );
    }
    for (const u of tierOne.unusableBinding) {
        notes.push(
            `A BINDING byggefelt here could not be used as the footprint by PRYZM: ${u.detail} ` +
                '— this is a PRYZM limitation, NOT missing published data.',
        );
    }
    return notes;
}

/**
 * L-399a + §DK-HONEST-REFUSAL — the Denmark path: fetch structured zoning from Plandata.dk (via the
 * same-origin keyless proxy) and dispatch ONE of three honest outcomes. Denmark is a PACKED,
 * real-data jurisdiction, so this path NEVER falls back to the generic `estimated-default` triple
 * (3/1.5/3, 12 m, FAR 2) — a fabricated estimate where a real pack exists is the exact
 * §CONTEXT-DATA-HONESTY failure (a REFUSAL and a FAILURE collapsing to one value; L-422/L-459/L-467):
 *
 *   1. `structured` WITH a resolvable height → the real `structured` envelope (the zone-11
 *      reference case, 24 m). Dispatch it — this RE-caches `_lastEnvelope` with the real geometry
 *      so both renderers redraw the true DK envelope over the estimated framing ring.
 *   2. a plan resolved but NO renderable height (Plandata publishes a plot ratio / storeys but not
 *      `maxbygnhjd`, e.g. lokalplan 224 Østerbrogade — FAR 1.5, 5 storeys, height in the PDF only),
 *      OR a plan with no structured numbers at all → a CITED refusal naming the zone + linking the
 *      plan document + saying why (`dkPlandataNoNumbersRefusal`), never a heightless empty and
 *      never the estimate. Same "Couldn't complete" card as Madrid NZ-1.
 *   3. no adopted plan at the point / upstream miss → `dkPlandataNoPlanRefusal` (still honest, not
 *      the estimate).
 *
 * Fully guarded — never throws into the commit path; on an unexpected error it leaves an honest
 * refusal rather than a fabricated estimate.
 */
async function applyDkZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    _estimated: BuildableEnvelope | null,
): Promise<void> {
    const TAG = '[gis][c58] §DK-HONEST-REFUSAL';
    // A no-plan refusal has no resolved zone identity to name; this pilot code is the placeholder
    // `zoneCode` (required, min length 1) — no number rides on it.
    const DK_NO_PLAN_ZONE_CODE = 'DK-NO-PLAN';
    try {
        const site = ctx.store.getSite();
        if (!site) return;
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) return;

        // Per-parcel facts so a refusal card is never blank (L-553): location + parcel area + source.
        const parcelAreaM2 = (() => {
            try {
                const ring = boundary.polygon;
                const a = Math.abs(
                    ring.reduce((acc, p, i) => {
                        const q = ring[(i + 1) % ring.length]!;
                        return acc + (p.x * q.z - q.x * p.z);
                    }, 0) / 2,
                );
                return Number.isFinite(a) && a > 0 ? a : null;
            } catch { return null; }
        })();
        const baseFacts = [
            `Location: Denmark (${lat.toFixed(5)}, ${lon.toFixed(5)})`,
            parcelAreaM2 !== null ? `Parcel area: ${Math.round(parcelAreaM2).toLocaleString()} m²` : null,
            'Planning source: Plandata.dk (Erhvervsstyrelsen) — national plan register',
        ].filter((s): s is string => typeof s === 'string');

        // STRUCTURAL-SEAM-4 — resolve WITH a bounded auto-retry on a TRANSIENT (source-did-not-answer)
        // outcome, so a Plandata blip self-heals before it can reach a card. `unreachable` is the only
        // retryable kind; `structured`/`plan-without-numbers`/`no-plan` are durable answers, returned
        // immediately. A still-unreachable source surfaces the honest transient refusal below.
        const dkOutcome = await retryWhileUnreachable<DkZoningResult>(async () => {
            const r = await DkZoningProvider.fetchZoningResultAtPoint(lat, lon);
            return r.kind === 'unreachable' ? fetchTransient('endpoint-unreachable') : fetchFound(r);
        });
        if (dkOutcome.status !== 'found') {
            // Still unreachable after retries → the TRANSIENT refusal ("temporarily unavailable,
            // retrying"), NEVER the `no-plan` absence card. This is the seam-4 un-flatten for DK.
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(DK_NO_PLAN_ZONE_CODE, dkPlandataUnreachableRefusal({ knownFacts: baseFacts }), 'none'),
                'plandata-dk',
            );
            console.log(`${TAG} Plandata unreachable after retries → transient refusal; NOT no-plan.`);
            return;
        }
        const result = dkOutcome.value;

        if (result.kind === 'structured') {
            // §L-620 — Plandata very often publishes a STOREY count (`maxetager`) but no
            // max-height-in-METRES (`maxbygnhjd`) — a large slice of Copenhagen. The storey count is
            // a REAL published constraint, so derive a height from it (floors × ~3 m) rather than
            // refuse a perfectly drawable parcel. This is a LABELLED derivation (confidence drops to
            // `estimated-ruleset`, a caveat states it) — categorically different from the fabricated
            // 9 m default this family removed (L-459): the storey count is surveyed, only the floor
            // height is assumed. Refuse ONLY when BOTH height AND storeys are absent.
            const sf = result.record.structuredFields;
            const DK_FLOOR_H_M = 3.0;
            const heightDerivedFromFloors =
                sf.maxHeight_m === null && typeof sf.maxFloors === 'number' && sf.maxFloors > 0;
            const zoningForEnvelope = heightDerivedFromFloors
                ? { ...result.record, structuredFields: { ...sf, maxHeight_m: sf.maxFloors! * DK_FLOOR_H_M } }
                : result.record;
            // ── §DK-BYGGEFELT-TIER-1 — ask WHERE before drawing WHAT (DK gap G6). ──────────
            // Best-effort and strictly additive: a null placement leaves the envelope byte-identical
            // to the pre-wiring behaviour. It is fetched BEFORE the envelope so a binding byggefelt
            // can shape the footprint in the SAME engine call rather than being patched on after.
            const placement = await resolveDkByggefeltPlacement(boundary, site);
            const placed = placement?.resolution.placed === true && placement.resolution.tier === 'byggefelt';
            const baseEnvelopeInput = {
                parcelRing: boundary.polygon,
                edgeClassifications: boundary.edgeClassifications,
                zoning: zoningForEnvelope,
                rulePack: null, // structured fields only → confidence 'structured' (C58 §1.2)
            } as const;
            let envelope = computeBuildableEnvelope(
                placed
                    ? {
                          ...baseEnvelopeInput,
                          // The DK slot of ADR-0279 §2: the resolver picks the rule, the engine stays
                          // jurisdiction-agnostic and never learns it is serving Denmark.
                          geometricRule: placement!.resolution.geometricRule,
                          explicitAreaFootprintParts:
                              placement!.resolution.explicitAreaSource?.footprintParts ?? null,
                      }
                    : baseEnvelopeInput,
            );
            // ⚠ A BYGGEFELT THAT CANNOT SHAPE THE FOOTPRINT MUST NOT DELETE THE ENVELOPE. The
            // explicit-area branch HARD-FAILS (status 'degenerate') when the clip cannot be computed
            // exactly on this plot — a genuinely disjoint result, a hole that bites, or the
            // convex-clip limitation. That is the right answer about the FOOTPRINT and the wrong
            // answer about the PARCEL: the published height/FAR are still real. So fall back to the
            // unplaced envelope and SAY WHY, rather than turn a placement limitation into "no
            // envelope here" (§NO-SILENT-FALLBACK, read in the other direction).
            let placementDroppedReason: string | null = null;
            if (placed && envelope.status !== 'ok') {
                for (const c of envelope.caveats) {
                    if (c.startsWith('Explicit-area zone:')) { placementDroppedReason = c; break; }
                }
                placementDroppedReason ??=
                    'the published byggefelt could not be clipped to this parcel exactly.';
                envelope = computeBuildableEnvelope(baseEnvelopeInput);
            }
            // A resolvable HEIGHT (published OR storey-derived) means a study volume can be drawn.
            if (envelope.status === 'ok' && envelope.maxHeight_m !== null) {
                const evidenceNotes = placement ? dkByggefeltEvidenceNotes(placement.tierOne) : [];
                let env2: typeof envelope = heightDerivedFromFloors
                    ? {
                          ...envelope,
                          confidence: 'estimated-ruleset',
                          caveats: [
                              ...envelope.caveats,
                              `Max height DERIVED from ${sf.maxFloors} storeys × ~${DK_FLOOR_H_M} m ` +
                                  `(Plandata published a storey count, not metres — a labelled ` +
                                  `derivation, not a surveyed height).`,
                          ],
                      }
                    : envelope;
                if (placementDroppedReason !== null) {
                    env2 = {
                        ...env2,
                        caveats: [
                            ...env2.caveats,
                            `A BINDING byggefelt (published building field) applies to this parcel, but ` +
                                `PRYZM could not clip it exactly here: ${placementDroppedReason} The ` +
                                `numbers below are the plan's; the FOOTPRINT is the whole parcel and is ` +
                                `therefore an UPPER BOUND, not the placed building field.`,
                        ],
                    };
                }
                if (placed) {
                    // Stamps `placement` / `openSpace` and RE-VALIDATES through the L0 refinements,
                    // so a mislabelled provenance pairing throws here instead of reaching a renderer.
                    env2 = applyDkPlacement(env2, placement!.resolution);
                }
                if (evidenceNotes.length > 0) {
                    env2 = { ...env2, caveats: [...env2.caveats, ...evidenceNotes] };
                }
                dispatchEnvelope(ctx, site.id, env2, 'plandata-dk');
                console.log(
                    `${TAG} ${heightDerivedFromFloors ? 'storey-DERIVED' : 'structured'} envelope → ` +
                        `confidence=${env2.confidence} zone=${envelope.zoneCode ?? 'n/a'} ` +
                        `height=${envelope.maxHeight_m}m` +
                        `${heightDerivedFromFloors ? ` (from ${sf.maxFloors} storeys)` : ''}` +
                        ` placement=${env2.placement?.source ?? 'none'}` +
                        `${placementDroppedReason !== null ? ' (byggefelt found but unclippable)' : ''}.`,
                );
                return;
            }
            // Plan resolved, but Plandata publishes no maximum height in its structured fields →
            // no volume to draw. Refuse honestly, STATING the numbers we DID resolve as facts
            // (never as an allowance) and linking the plan document, instead of the estimate.
            const resolvedFacts = [
                envelope.maxFAR !== null
                    ? `Plandata published: plot ratio (bebyggelsesprocent) → FAR ${envelope.maxFAR.toFixed(2)}`
                    : null,
                result.record.structuredFields.maxFloors !== null
                    ? `Plandata published: maximum ${result.record.structuredFields.maxFloors} storeys`
                    : null,
            ].filter((s): s is string => typeof s === 'string');
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(
                    result.record.zoneCode,
                    dkPlandataNoNumbersRefusal({
                        zoneLabel: result.record.zoneLabel,
                        doklink: result.record.ordinanceRef,
                        knownFacts: [...baseFacts, ...resolvedFacts],
                    }),
                    'none',
                ),
                'plandata-dk',
            );
            console.log(
                `${TAG} plan resolved but no renderable height (FAR=${envelope.maxFAR ?? 'n/a'}) → ` +
                    `cited refusal (zone=${result.record.zoneCode}); NOT the estimated default.`,
            );
            return;
        }

        if (result.kind === 'plan-without-numbers') {
            const id = result.identity;
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(
                    id.zoneCode,
                    dkPlandataNoNumbersRefusal({
                        zoneLabel: id.zoneLabel,
                        doklink: id.doklink,
                        knownFacts: baseFacts,
                    }),
                    'none',
                ),
                'plandata-dk',
            );
            console.log(
                `${TAG} plan without structured numbers → cited refusal (zone=${id.zoneCode}); ` +
                    `NOT the estimated default.`,
            );
            return;
        }

        // kind === 'no-plan' — no adopted plan at the point / upstream miss. HONEST refusal on a
        // packed jurisdiction, NEVER the fabricated estimate.
        dispatchEnvelope(
            ctx,
            site.id,
            buildRefusedEnvelope(DK_NO_PLAN_ZONE_CODE, dkPlandataNoPlanRefusal({ knownFacts: baseFacts }), 'none'),
            'plandata-dk',
        );
        console.log(`${TAG} no plan resolved → cited no-plan refusal; NOT the estimated default.`);
    } catch (e) {
        // Best-effort — never block the commit. Leave an honest refusal rather than a fabricated
        // estimate; if even that cannot dispatch, drop silently (the boundary is already set).
        console.warn(`${TAG} DK zoning path failed (non-fatal) — attempting a cited refusal:`, e);
        try {
            const site = ctx.store.getSite();
            if (site) {
                dispatchEnvelope(
                    ctx,
                    site.id,
                    buildRefusedEnvelope(DK_NO_PLAN_ZONE_CODE, dkPlandataNoPlanRefusal(), 'none'),
                    'plandata-dk',
                );
            }
        } catch { /* refusal dispatch is best-effort too */ }
    }
}

/**
 * §MADRID-PGOUM97 — the Madrid (INE 28079) ROUTER: read the parcel's Norma Zonal, then answer as
 * THAT zone's ordinance requires.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS FIXES — Madrid had one destination for four different legal situations
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * Until now every Madrid click went straight to the NZ 1 footprint plane, so a parcel in Norma
 * Zonal 8 (vivienda unifamiliar) was told *"no published buildable footprint at this point"* — true,
 * useless, and quietly implying the ordinance is silent when in fact Capítulo 8.8 states its
 * retranqueos, ocupación, edificabilidad and altura explicitly. Meanwhile 23 cited zones, a
 * legally-grounded NZ 3 refusal and a street-width height table sat in `@pryzm/site-parcel-data`
 * reachable from no click at all.
 *
 * So this function resolves the zone FIRST (`resolveMadridNormaZonal` → the master routing layer
 * `NORMAS_ZONALES/MapServer/0.AMB_TX_ETIQ`, 34 codes VERIFIED-LIVE 2026-07-24) and routes on it:
 *
 *   • `1.*`  → `applyMadridNZ1ExplicitArea` — the SETTLED explicit-area answer, unchanged. NZ 1's
 *              buildability is PUBLISHED AS GEOMETRY (Fondo de la Edificación); the ring is the
 *              whole claim and its COEF_Z semantics stay withheld. Nothing here re-derives it.
 *   • `3.*`  → `madridNZ3Refusal` — a LEGALLY GROUNDED `derived-plan` refusal. Art. 8.3.1 states the
 *              *aprovechamiento urbanístico* is already EXHAUSTED and the Plan consolidates what
 *              earlier instruments produced *"sin imponer un nuevo modelo"*. The ordinance ANSWERED;
 *              its answer is "not by a zone envelope". ⚠ This refusal survives sign-off — there is
 *              nothing a human signature could promote it to.
 *   • the 23 packed codes → ⚠⚠ **THE HONESTY GATE.** `MADRID_ENVELOPE_VERIFIED` is **false**, so
 *              they receive `madridPgoum97UnverifiedRefusal` and NO NUMBER — not even for a fully
 *              parameterised NZ 7/NZ 8 grado. Every value in that pack was MACHINE-EXTRACTED from
 *              the Compendio 2025 by `tools/madrid-extract/`; a wrong figure would be PRYZM's own
 *              pipeline's error, and transcribing an ordinance is a legal act. Identical discipline
 *              to `applyCordobaZoningThenFallback`.
 *   • any other live code → `madridUnknownZoneRefusal` (via the registry), which names the coverage
 *              gap rather than mis-citing NZ 1 at land that is not in NZ 1. Not hypothetical: Normas
 *              Zonales 2/6/10/11 are absent from `AMB_TX_ETIQ` for undetermined reasons.
 *   • the routing layer did not answer / published nothing / was ambiguous → fall through to the
 *              NZ 1 explicit-area attempt, which ends in its own STRUCTURAL-SEAM-4 split refusal
 *              (transient vs genuine absence). ⚠ This preserves today's behaviour byte-for-byte on
 *              the unresolved path — the zone resolver may ADD precision, never subtract an answer.
 *
 * ⚠ WHAT WOULD STILL BLOCK A NUMBER THE DAY THE HUMAN GATE OPENS, and is NOT fixed here:
 *   (a) ✅ **DISCHARGED — DO NOT RE-STATE THIS AS OPEN.** It read: *"`ZoningRulesEngine` hard-codes
 *       `let confidence = 'estimated-ruleset'` and never reads a pack's `defaultConfidence`, so
 *       `pipeline-extracted-unverified` would surface as the violet Estimated chip"*. **Fixed in
 *       L-665** — `§PACK-CONFIDENCE-CEILING` (`ZoningRulesEngine.ts`) clamps the solve to the pack's
 *       declared tier (weaker-of-two on `ENVELOPE_CONFIDENCE_ORDER`, demote-only, so a pack can never
 *       certify itself upward). Madrid's pack declares `MADRID_PGOUM97_DEFAULT_CONFIDENCE =
 *       'pipeline-extracted-unverified'`, and `GISAreaLayout.ts` badges that tier as the FIRST arm
 *       (weakest-wins), so the RED "⚠ Unverified · machine-extracted" chip cannot be shadowed by the
 *       violet one. Verified end-to-end on a real NZ-7 and NZ-8 solve by
 *       `madridPgoum97Wiring.test.ts` §THE-ORDERING-PIN and §RED-CHIP-NZ7-NZ8.
 *       ⚠ This note sat stale for a week and was still being quoted as a live blocker on the day
 *       SIG-M1 was under consideration — the stale-claim propagation this dossier keeps paying for.
 *   (b) No Madrid street-width source exists, so NZ 4 / 9.1 / 9.2 publish no height and carry
 *       FLOOR-ONLY testero separations (`MADRID_FLOOR_ONLY_SEPARATIONS`) — an under-inset.
 *   (c) NZ 5's front edge is `null` because Art. 8.5.6.3 measures to the STREET CENTRELINE, a rule
 *       kind `GeometricRule` cannot express; on a narrow street NZ 5 would OVER-STATE its front.
 * Those three are exactly the zones `sources/VERIFICATION.md` names as not sign-off-ready.
 *
 * §CONTEXT-DATA-HONESTY: an outage, a genuine empty, and a resolved-but-unpacked zone are THREE
 * different values here and reach three different cards. Best-effort + fully guarded — it never
 * throws into the commit path, and it never falls back to the estimated setback triple.
 */
async function applyMadridZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    _estimated: BuildableEnvelope | null,
): Promise<void> {
    const TAG = '[gis][c58] §MADRID-PGOUM97';
    const JURISDICTION_REF = 'madrid-pgoum';
    try {
        const site = ctx.store.getSite();
        if (!site) return; // No site to dispatch onto — nothing to render either way.

        // Per-parcel facts so no refusal card is ever a blank panel (L-553). Area only — no extra
        // network; the Catastro identity leg has already run and written the parcel.
        const parcelAreaM2 = (() => {
            try {
                const ring = boundary.polygon;
                if (!Array.isArray(ring) || ring.length < 3) return null;
                const a = Math.abs(
                    ring.reduce((acc, p, i) => {
                        const q = ring[(i + 1) % ring.length]!;
                        return acc + (p.x * q.z - q.x * p.z);
                    }, 0) / 2,
                );
                return Number.isFinite(a) && a > 0 ? a : null;
            } catch { return null; }
        })();
        const baseFacts = [
            `Location: Madrid (${lat.toFixed(5)}, ${lon.toFixed(5)}) — PGOUM-97`,
            parcelAreaM2 !== null ? `Parcel area: ${Math.round(parcelAreaM2).toLocaleString()} m²` : null,
        ].filter((s): s is string => typeof s === 'string');

        // ── S3 — resolve WHICH Norma Zonal governs this parcel. Never throws; wrapped in the bounded
        //    auto-retry so a blip on sigma.madrid.es self-heals before it can reach a card
        //    (STRUCTURAL-SEAM-4). A genuine `no-feature` is NOT retried: the layer answered.
        let zoneRes!: Awaited<ReturnType<typeof resolveMadridNormaZonal>>;
        await retryWhileUnreachable(async () => {
            zoneRes = await resolveMadridNormaZonal({ lat, lon });
            return resolutionToFetchOutcome(zoneRes);
        });

        if (!zoneRes.ok) {
            // ⚠ NOT a silent estimate and NOT an invented zone. The routing layer could not name the
            // Norma Zonal, so fall through to the NZ 1 explicit-area attempt — the behaviour that
            // shipped before this router existed — which ends in its own cited refusal, split
            // transient vs genuine-absence. The reason is logged so an outage and an empty stay
            // distinguishable in the field.
            console.log(
                `${TAG} zone not resolved (reason=${zoneRes.reason}) — falling through to the NZ 1 ` +
                    'explicit-area path (unchanged pre-router behaviour); it will refuse honestly if ' +
                    'no footprint is published here.',
            );
            await applyMadridNZ1ExplicitArea(ctx, boundary, lat, lon, [
                ...baseFacts,
                `Norma Zonal: not resolved (${zoneRes.reason}) — Madrid's zoning layer did not name a zone here`,
            ]);
            return;
        }

        const zoneCode = zoneRes.zoneCode;
        const zoneLabel = zoneRes.zoneLabel;
        const zoneFacts = [
            ...baseFacts,
            `Norma Zonal: ${zoneCode}${zoneLabel ? ` — ${zoneLabel}` : ''} (sigma.madrid.es NORMAS_ZONALES, live)`,
        ];

        // ── NZ 1 — the SETTLED explicit-area decision. Routed, never re-derived.
        if (zoneCode.startsWith(MADRID_NZ1_CODE_PREFIX)) {
            console.log(`${TAG} zone=${zoneCode} → NZ 1 explicit-area path (published footprint).`);
            await applyMadridNZ1ExplicitArea(ctx, boundary, lat, lon, zoneFacts, zoneCode);
            return;
        }

        // ── NZ 3 — the LEGALLY GROUNDED refusal. The ordinance answers; its answer is "not by a
        //    zone envelope" (Art. 8.3.1: the aprovechamiento is already exhausted).
        if ((MADRID_NZ3_ZONE_CODES as readonly string[]).includes(zoneCode)) {
            const refusal = madridNZ3Refusal(zoneFacts);
            dispatchEnvelope(ctx, site.id, buildRefusedEnvelope(zoneCode, refusal, 'none'), JURISDICTION_REF);
            console.log(
                `${TAG} zone=${zoneCode} → NZ 3 Volumetría Específica: legally-grounded ` +
                    `${refusal.code} refusal (legallyGrounded=${refusal.legallyGrounded}). No number exists to draw.`,
            );
            return;
        }

        // ── The 23 transcribed zones — ⚠⚠ THE HONESTY GATE. Machine-extracted, unsigned ⇒ no number.
        if ((MADRID_PGOUM97_ZONE_CODES as readonly string[]).includes(zoneCode)) {
            if (!MADRID_ENVELOPE_VERIFIED) {
                // `status: 'none'` = attempted, value WITHHELD pending human verification. NOT
                // `'not-applicable'`, which would assert the ordinance grants no envelope — it does
                // grant one; we simply have not checked our machine reading of it.
                const refusal = madridPgoum97UnverifiedRefusal(zoneCode, zoneFacts);
                dispatchEnvelope(ctx, site.id, buildRefusedEnvelope(zoneCode, refusal, 'none'), JURISDICTION_REF);
                console.log(
                    `${TAG} §HONESTY-GATE MADRID_ENVELOPE_VERIFIED=false — zone=${zoneCode} got the ` +
                        `machine-extracted-unverified refusal (${refusal.code}); NO number rendered. ` +
                        `area=${parcelAreaM2?.toFixed(0) ?? 'n/a'} m². Signs off via sources/VERIFICATION.md.`,
                );
                return;
            }

            // ── VERIFICATION SIGNED (future). The compute branch is deliberately NOT written here:
            // a second, independent defect gates it. `ZoningRulesEngine` never reads a pack's
            // `defaultConfidence`, so solving now would publish `pipeline-extracted-unverified`
            // numbers wearing the violet "Estimated" chip — an OVER-statement of certainty on a
            // machine reading, which is the precise failure the gate above exists to prevent.
            // Landing the C58 confidence fix and this compute branch together is the correct order.
            console.warn(
                `${TAG} MADRID_ENVELOPE_VERIFIED=true but the C58 confidence plumbing is not landed ` +
                    `(ZoningRulesEngine hard-codes 'estimated-ruleset' and ignores defaultConfidence) — ` +
                    `refusing rather than publishing a machine-extracted number under an over-confident badge.`,
            );
            const stillGated = madridPgoum97UnverifiedRefusal(zoneCode, zoneFacts);
            dispatchEnvelope(ctx, site.id, buildRefusedEnvelope(zoneCode, stillGated, 'none'), JURISDICTION_REF);
            return;
        }

        // ── A live zone code in none of the three families. Name the gap; never borrow a citation.
        const gap = madridUnknownZoneRefusal(zoneCode, zoneLabel, zoneFacts);
        dispatchEnvelope(ctx, site.id, buildRefusedEnvelope(zoneCode, gap, 'none'), JURISDICTION_REF);
        console.log(
            `${TAG} zone=${zoneCode} is outside NZ 1/3/4/5/7/8/9 — coverage-gap refusal (${gap.code}). ` +
                'See SOURCES.md §0.3 on the zones 2/6/10/11 question.',
        );
    } catch (e) {
        // Best-effort — never block the commit. Leave an honest refusal rather than a fabricated
        // estimate; if even that cannot dispatch, drop silently (the boundary is already set).
        console.warn(`${TAG} Madrid router failed (non-fatal) — attempting a cited refusal:`, e);
        try {
            const site = ctx.store.getSite();
            if (site) {
                dispatchEnvelope(
                    ctx,
                    site.id,
                    buildRefusedEnvelope(MADRID_NZ1_ZONE_CODES[0], madridNZ1Refusal(), 'none'),
                    JURISDICTION_REF,
                );
            }
        } catch { /* refusal dispatch is best-effort too */ }
    }
}

/**
 * L-608 §MADRID-NZ1 — the Madrid (PGOUM-97 Norma Zonal 1) explicit-area path.
 *
 * NZ 1 does NOT state setbacks: the ordinance publishes the buildable footprint (Fondo de la
 * Edificación) and the weighted edificabilidad (COEF_Z) AS GEOMETRY on the municipal ArcGIS plane.
 * So this path RESOLVES that published footprint into a ring by SPATIALLY intersecting the parcel's
 * WGS84 centroid against the plane (`resolveMadridNZ1Ring`, via the `/api/madrid/condiciones` proxy —
 * the join is spatial, NOT a CODMANZANA string; MADRID-DATA-RECON-SPIKE §3), which never throws, and:
 *   • WITH a ring → projects it into the authoring frame (same origin + θ the parcel used, exactly
 *     like the BCN block ring) and clips the parcel to it via `computeBuildableEnvelope`'s
 *     explicit-area branch (`explicitAreaFootprint`), then dispatches the solved envelope with a
 *     caveat naming the source — `estimated-ruleset`, NEVER `structured`;
 *   • WITHOUT a ring → dispatches a CITED REFUSAL, status `'none'`, split by STRUCTURAL-SEAM-4 on the
 *     fetch outcome (via the bounded auto-retry): a source that did not answer → the transient,
 *     retried `madridNZ1Refusal` ("temporarily unreachable"); a genuine no-footprint point → the
 *     durable `madridNZ1AbsentRefusal` (`no-plan-at-point`, no retry card). It NEVER falls back to
 *     the estimated triple: a front/side/rear estimate is the wrong geometric SHAPE for an
 *     explicit-area zone — the §CONTEXT-DATA-HONESTY failure this whole path exists to avoid.
 *
 * ⚠ GATED ON `MADRID_NZ1_CERTIFIED` (ON since L-608, 2026-07-25). RECONCILED 2026-07-27 — this header
 * previously said "default OFF … the path REFUSES for every Madrid parcel (the current shipping
 * state)", which contradicts the flipped-ON flag and the L-608 sign-off. While ON, a resolved ring
 * renders `estimated-ruleset` (the footprint is real published geometry; the NZ-1 COEF_Z vintage is
 * only lightly certified, so no height/FAR is asserted from it). The gate is a retained safety valve:
 * if a regression flips it false, every Madrid parcel refuses honestly. Same discipline as
 * `BCN_REFOS_OV_CERTIFIED` / `CORDOBA_ENVELOPE_VERIFIED` / `NL_BESTEMMINGSPLAN_CERTIFIED`.
 *
 * Best-effort + fully guarded — never throws into the commit path.
 */
async function applyMadridNZ1ExplicitArea(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    knownFacts: readonly string[] = [],
    resolvedZoneCode: string | null = null,
): Promise<void> {
    const TAG = '[gis][c58] §MADRID-NZ1';
    // The RESOLVED grado when the routing layer answered (`1.1`…`1.6`), else the pack's first code.
    // ⚠ Carrying the resolved code matters: `1.4` and `1.1` are different grados of the same zone,
    // and stamping the parcel with `1.1` because that is index 0 would be a quiet mis-attribution.
    const nz1Code = resolvedZoneCode ?? MADRID_NZ1_ZONE_CODES[0];
    try {
        const site = ctx.store.getSite();
        if (!site) return; // No site to dispatch onto — nothing to render either way.
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) {
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(nz1Code, madridNZ1Refusal(knownFacts), 'none'),
                'madrid-pgoum',
            );
            return;
        }

        // ⚠⚠ THE CERTIFICATION GATE (default OFF). While closed, refuse for every Madrid parcel — the
        // footprint is real but the zone-code vintage is not human-certified (a light L-449 cert). No
        // resolve, no fabricated number; the honest cited refusal is the shipping state.
        if (!MADRID_NZ1_CERTIFIED) {
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(nz1Code, madridNZ1Refusal(knownFacts), 'none'),
                'madrid-pgoum',
            );
            console.log(`${TAG} MADRID_NZ1_CERTIFIED=false — cited refusal (zone-code vintage not signed).`);
            return;
        }

        // Resolve the published footprint ring (WGS84) by SPATIAL point-intersect at the parcel
        // centroid. Never throws. `MADRID_NZ1_RING_REF` equals the pack rule's `ringRef` (asserted +
        // tested), so we pass the constant rather than reach into the `GeometricRule` union.
        //
        // STRUCTURAL-SEAM-4 — wrapped in the bounded auto-retry: sigma.madrid.es was returning HTTP
        // 500 systematically in recon, and the proxy surfaces that as 502 → the resolver's
        // `endpoint-unreachable` → a TRANSIENT outcome. `retryWhileUnreachable` re-attempts it; only a
        // still-failing transient reaches the honest "temporarily unreachable — retrying" refusal
        // below, NEVER the "not available yet" permanent card it used to wear. `madridOutcome.status`
        // then tells the final refusal apart: `transient` → `madridNZ1Refusal`; anything else (a
        // genuine `no-feature`/`degenerate-geometry` absence) → `madridNZ1AbsentRefusal`.
        let resolution!: Awaited<ReturnType<typeof resolveMadridNZ1Ring>>;
        const madridOutcome = await retryWhileUnreachable(async () => {
            resolution = await resolveMadridNZ1Ring(MADRID_NZ1_RING_REF, { lat, lon });
            return resolutionToFetchOutcome(resolution);
        });

        if (resolution.ok && resolution.ringLatLon.length >= 3) {
            // (3) Project the WGS84 ring into the SAME authoring frame the parcel lives in: the
            // equirectangular projection about the site origin, then the θ de-rotation
            // `dispatchParcelBoundary` applied to the parcel ring. θ = 0 ⇒ identity. This mirrors
            // `applyBcnZoningThenFallback`'s `toAuthoringFrame` exactly — any other frame yields a
            // garbage clip.
            const origin = { lat: site.location.latitude, lon: site.location.longitude };
            const rawTheta = site.location.trueNorth;
            const theta = Number.isFinite(rawTheta) ? rawTheta : 0;
            const toAuthoringFrame = (p: LatLon): Pt => {
                const xz = latLonToSceneXZ(p, origin.lat, origin.lon);
                if (theta === 0) return { x: xz.x, z: xz.z };
                const e = trueVectorToProjectNorth({ east: xz.x, north: -xz.z }, theta);
                return { x: e.east, z: -e.north };
            };
            const footprintRing: Pt[] = resolution.ringLatLon.map((ll) =>
                toAuthoringFrame({ lat: ll.lat, lon: ll.lon }),
            );

            const record: ZoningRecord = {
                zoneCode: nz1Code, // reads the pack zone's explicit-area rule.
                zoneLabel: 'Norma Zonal 1 — Protección del Patrimonio Histórico',
                jurisdictionId: 'es-28079-madrid',
                structuredFields: {},
                overlays: [],
                ordinanceRef: null, // the pack zone supplies the real citation.
                provenance: {
                    source: 'madrid-pgoum',
                    label: 'Madrid PGOUM-97 PG_CONDICIONES_EDIFICACION (Fondo/Condiciones)',
                    version: null,
                    license: null,
                    crs: 'EPSG:25830',
                },
            };
            const envelope = computeBuildableEnvelope({
                parcelRing: boundary.polygon,
                edgeClassifications: boundary.edgeClassifications,
                zoning: record,
                rulePack: ES_MADRID_NZ1_PACK,
                explicitAreaFootprint: footprintRing,
            });
            if (envelope.status === 'ok' && envelope.insetPolygon.length >= 3) {
                // The footprint is live published DATA, but the render is `estimated-ruleset`, NEVER
                // `structured`: the COEF_Z (edificabilidad) SEMANTICS stay withheld behind the L-449
                // cert, so no height/FAR is asserted from it — the ring is the whole claim. Ride the
                // source + the caveat with it (mirrors the BCN clau-18 enrichment).
                const enriched: BuildableEnvelope = {
                    ...envelope,
                    caveats: [
                        ...envelope.caveats,
                        `Madrid Norma Zonal 1 (PGOUM-97): the buildable footprint is READ from the ` +
                            `municipal PG_CONDICIONES_EDIFICACION plane` +
                            `${resolution.codManzana ? ` (manzana ${resolution.codManzana})` : ''} — ` +
                            `real published geometry, clipped to your parcel. It ships as ` +
                            `estimated-ruleset, not structured: the zone-code vintage is human-certified ` +
                            `only lightly and the COEF_Z${resolution.coefZ ? ` code "${resolution.coefZ}"` : ''} ` +
                            `(edificabilidad) semantics are withheld, so no ` +
                            `height or FAR is asserted from it. Verify against the Compendio before relying on it.`,
                    ],
                };
                dispatchEnvelope(ctx, site.id, enriched, 'madrid-pgoum');
                console.log(
                    `${TAG} explicit-area envelope OK → cod=${resolution.codManzana} ` +
                        `coefZ=${resolution.coefZ ?? 'n/a'} edificabilidad=${resolution.edificabilidad ?? 'n/a'} ` +
                        `inset=${enriched.insetAreaM2.toFixed(1)}m² — clipped to the published footprint ` +
                        `(estimated-ruleset, gate CERTIFIED).`,
                );
                return;
            }
            // Resolved a ring but the clip produced no usable envelope (no overlap / non-convex) —
            // REFUSE, never a whole-parcel box. The engine's caveats say which; still logged.
            console.log(`${TAG} ring resolved but envelope status=${envelope.status} — refusing. caveats: ${envelope.caveats.join(' | ')}`);
        } else if (!resolution.ok) {
            console.log(`${TAG} footprint not resolved (reason=${resolution.reason}, outcome=${madridOutcome.status}) — cited refusal.`);
        }

        // STRUCTURAL-SEAM-4 — the honest cited refusal (never the estimated triple), branched on the
        // fetch outcome: a still-failing TRANSIENT → the retry-honest `madridNZ1Refusal`; a genuine
        // ABSENCE (source answered, no NZ-1 footprint here) → `madridNZ1AbsentRefusal` (no retry card).
        const madridRefusal =
            madridOutcome.status === 'transient'
                ? madridNZ1Refusal(knownFacts)
                : madridNZ1AbsentRefusal(knownFacts);
        dispatchEnvelope(
            ctx,
            site.id,
            buildRefusedEnvelope(nz1Code, madridRefusal, 'none'),
            'madrid-pgoum',
        );
    } catch (e) {
        // Best-effort — never block the commit. Try to leave an honest refusal rather than a
        // fabricated estimate; if even that cannot dispatch, drop silently (the boundary is set).
        console.warn(`${TAG} path failed (non-fatal) — attempting a cited refusal:`, e);
        try {
            const site = ctx.store.getSite();
            if (site) {
                dispatchEnvelope(
                    ctx,
                    site.id,
                    buildRefusedEnvelope(nz1Code, madridNZ1Refusal(knownFacts), 'none'),
                    'madrid-pgoum',
                );
            }
        } catch { /* refusal dispatch is best-effort too */ }
    }
}

/**
 * L-609 §NL-BESTEMMINGSPLAN (§NL-NATIONWIDE) — the Netherlands (national) bestemmingsplan
 * explicit-area path. Fires for ANY NL plot (`isInNetherlands`), keyless.
 *
 * The Netherlands publishes the buildable envelope (`bouwvlak`) as geometry AND its dimensions
 * (`maatvoering`) machine-readable (IMRO2012 / SVBP2012), served KEYLESS nationwide by the PDOK
 * "Ruimtelijke plannen" WMS. So this path RESOLVES the published bouwvlak into a ring by
 * point-querying the parcel centroid (`resolveNlBestemmingsplan`, via the `/api/nl/bestemmingsplan`
 * proxy — never throws), and:
 *   • WITH a bouwvlak → projects it into the authoring frame (same origin + θ the parcel used, exactly
 *     like Madrid) and clips the parcel to it via `computeBuildableEnvelope`'s explicit-area branch.
 *     The maatvoering rides in `structuredFields` (max bouwhoogte → maxHeight_m, bebouwingspercentage
 *     → maxCoverage, aantal bouwlagen → maxFloors), so — UNLIKE Madrid — a clean "maximum bouwhoogte
 *     (m)" makes the engine render `structured` (a real metre height with stated units), and a
 *     bouwvlak-with-no-numbers renders `estimated-ruleset`. Never a fabricated number either way.
 *   • §NL-SPARSE-FALLBACK: NO bouwvlak BUT the zone (bestemmingsvlak) carries a footprint + a usable
 *     maatvoering → draw the ZONE EXTENT × the maatvoering height as an UPPER BOUND, FORCED to
 *     `estimated-ruleset` with a caveat that no bouwvlak was published (so the extent is not a precise
 *     buildable footprint). This mirrors the DK L-620 storey fix — use the real published zone data
 *     instead of refusing. Bouwvlak is SPARSE in NL, so this is the COMMON case (a live Amsterdam probe
 *     showed most parcels have only enkelbestemming + maatvoering, no bouwvlak).
 *   • WITHOUT a bouwvlak AND without a usable zone-extent-plus-maatvoering → a CITED REFUSAL
 *     (`nlBestemmingsplanRefusal`), status `'none'`. It does NOT fall back to the estimated triple: a
 *     front/side/rear estimate is the wrong geometric SHAPE for an explicit-area zone (the
 *     §CONTEXT-DATA-HONESTY failure this whole path exists to avoid).
 *
 * ⚠ GATED ON `NL_BESTEMMINGSPLAN_CERTIFIED` (ON — the keyless PDOK proxy is wired and real bouwhoogte
 * verified live at Rotterdam 40 m / Utrecht 26 m / Groningen 24 m). Same discipline as
 * `MADRID_NZ1_CERTIFIED`; if a regression re-closes the gate, every NL parcel refuses honestly.
 *
 * Best-effort + fully guarded — never throws into the commit path.
 */
async function applyNlZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
): Promise<void> {
    const TAG = '[gis][c58] §NL-BESTEMMINGSPLAN';
    const NL_SOURCE = 'nl-pdok-rp-wms';
    try {
        const site = ctx.store.getSite();
        if (!site) return; // No site to dispatch onto — nothing to render either way.
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) {
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(NL_ZONE_CODE, nlBestemmingsplanRefusal(), 'none'),
                NL_SOURCE,
            );
            return;
        }

        // ⚠⚠ THE CERTIFICATION GATE (ON). Kept as an explicit safety valve: if a regression flips
        // `NL_BESTEMMINGSPLAN_CERTIFIED` false, every NL parcel refuses honestly rather than render a
        // stale/uncertified number. No resolve, no fabricated number; the honest cited refusal.
        if (!NL_BESTEMMINGSPLAN_CERTIFIED) {
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(NL_ZONE_CODE, nlBestemmingsplanRefusal(), 'none'),
                NL_SOURCE,
            );
            console.log(`${TAG} NL_BESTEMMINGSPLAN_CERTIFIED=false — cited refusal (gate closed).`);
            return;
        }

        // Resolve the published bouwvlak ring (WGS84) + maatvoering by point-query at the parcel
        // centroid. Never throws. `NL_RING_REF` equals the pack rule's `ringRef` (asserted + tested).
        //
        // STRUCTURAL-SEAM-4 — wrapped in the bounded auto-retry: a PDOK WMS 502 surfaces as the
        // resolver's `endpoint-unreachable` → a TRANSIENT outcome, retried before it can reach a card.
        // `nlOutcome.status` branches the final refusal: `transient` → the retry-honest
        // `nlBestemmingsplanRefusal`; a genuine `no-plan`/`no-bouwvlak` absence → `nlNoPlanRefusal`.
        let resolution!: Awaited<ReturnType<typeof resolveNlBestemmingsplan>>;
        const nlOutcome = await retryWhileUnreachable(async () => {
            resolution = await resolveNlBestemmingsplan(NL_RING_REF, { lat, lon });
            return resolutionToFetchOutcome(resolution);
        });

        if (resolution.ok && resolution.ringLatLon.length >= 3) {
            // Project the WGS84 bouwvlak ring into the SAME authoring frame the parcel lives in —
            // identical to `applyMadridZoningThenFallback` (equirectangular about the site origin,
            // then the θ de-rotation). θ = 0 ⇒ identity. Any other frame yields a garbage clip.
            const origin = { lat: site.location.latitude, lon: site.location.longitude };
            const rawTheta = site.location.trueNorth;
            const theta = Number.isFinite(rawTheta) ? rawTheta : 0;
            const toAuthoringFrame = (p: LatLon): Pt => {
                const xz = latLonToSceneXZ(p, origin.lat, origin.lon);
                if (theta === 0) return { x: xz.x, z: xz.z };
                const e = trueVectorToProjectNorth({ east: xz.x, north: -xz.z }, theta);
                return { x: e.east, z: -e.north };
            };
            const footprintRing: Pt[] = resolution.ringLatLon.map((ll) =>
                toAuthoringFrame({ lat: ll.lat, lon: ll.lon }),
            );

            // §NL-SPARSE-FALLBACK — is this the PRECISE bouwvlak, or the ZONE (bestemmingsvlak) extent
            // used because the plan published no bouwvlak? The zone extent is an UPPER BOUND on the
            // buildable footprint, so it renders at REDUCED confidence with a caveat, never `structured`.
            const isZoneFallback = resolution.ringSource === 'bestemmingsvlak';

            // §NL-SPARSE-FALLBACK height derivation (fallback branch only — the bouwvlak branch is
            // UNCHANGED). When the zone publishes no max bouwhoogte in metres but DOES publish a storey
            // count, derive a height (floors × ~3 m) — the DK L-620 pattern (a LABELLED derivation, not
            // a fabricated default). The precise bouwvlak branch never derives; it uses the metre value.
            const NL_FLOOR_H_M = 3.0;
            const heightDerivedFromFloors =
                isZoneFallback &&
                resolution.maat.maxBouwhoogte_m === null &&
                typeof resolution.maat.maxAantalBouwlagen === 'number' &&
                resolution.maat.maxAantalBouwlagen > 0;
            const effectiveMaxHeight_m = heightDerivedFromFloors
                ? resolution.maat.maxAantalBouwlagen! * NL_FLOOR_H_M
                : resolution.maat.maxBouwhoogte_m;

            // The maatvoering is REAL published data with STATED SVBP2012 units, so it
            // rides in `structuredFields` (which the engine resolves as `published-structured` →
            // `structured` confidence when every resolved number is structured — for the PRECISE
            // bouwvlak case). Absent numbers stay null (honest withheld). `maxGoothoogte` (eave) is
            // deliberately NOT used as the height cap. The bestemming → permittedUse via the direct
            // translation the schema mandates.
            const use = bestemmingToPermittedUse(resolution.bestemming);
            const record: ZoningRecord = {
                zoneCode: NL_ZONE_CODE,
                zoneLabel: resolution.bestemming
                    ? `Bestemmingsplan — ${resolution.bestemming}`
                    : isZoneFallback
                        ? 'Bestemmingsplan bestemmingsvlak (zone extent)'
                        : 'Bestemmingsplan bouwvlak',
                jurisdictionId: NL_JURISDICTION_ID,
                structuredFields: {
                    maxHeight_m: effectiveMaxHeight_m,
                    maxFloors: resolution.maat.maxAantalBouwlagen,
                    maxCoverage: resolution.maat.maxBebouwingspercentage,
                    plotRatioFAR: resolution.maat.far,
                    permittedUse: use ? [use] : [],
                },
                overlays: [],
                ordinanceRef: null, // the pack zone supplies the real citation.
                provenance: {
                    source: NL_SOURCE,
                    label: resolution.planNaam
                        ? `DSO Ruimtelijke Plannen API v4 — ${resolution.planNaam}`
                        : 'DSO Ruimtelijke Plannen API v4 (bestemmingsplan)',
                    version: resolution.planId,
                    license: null,
                    crs: 'EPSG:4326',
                },
            };
            const envelope = computeBuildableEnvelope({
                parcelRing: boundary.polygon,
                edgeClassifications: boundary.edgeClassifications,
                zoning: record,
                rulePack: NL_BESTEMMINGSPLAN_PACK,
                explicitAreaFootprint: footprintRing,
            });
            if (envelope.status === 'ok' && envelope.insetPolygon.length >= 3) {
                const heightNote =
                    resolution.maat.maxBouwhoogte_m !== null
                        ? `maximum bouwhoogte ${resolution.maat.maxBouwhoogte_m} m`
                        : heightDerivedFromFloors
                            ? `height DERIVED from ${resolution.maat.maxAantalBouwlagen} bouwlagen × ~${NL_FLOOR_H_M} m ` +
                              `(no maximum bouwhoogte published in metres — a labelled derivation, not a surveyed height)`
                            : 'no maximum bouwhoogte published (height withheld)';
                const percClause =
                    resolution.maat.maxBebouwingspercentage !== null
                        ? `, maximum bebouwingspercentage ${(resolution.maat.maxBebouwingspercentage * 100).toFixed(0)} %`
                        : '';
                const enriched: BuildableEnvelope = isZoneFallback
                    ? {
                          // §NL-SPARSE-FALLBACK — the zone extent is an UPPER BOUND, so FORCE the
                          // confidence down to `estimated-ruleset` (the height is real, but the
                          // FOOTPRINT is the zone, not a precise buildable area) and say so plainly.
                          ...envelope,
                          confidence: 'estimated-ruleset',
                          caveats: [
                              ...envelope.caveats,
                              `No separate bouwvlak was published for this parcel, so the buildable ` +
                                  `extent shown is the ZONE (bestemmingsvlak` +
                                  `${resolution.bestemming ? ` "${resolution.bestemming}"` : ''}) footprint — ` +
                                  `an UPPER BOUND on where you may build, NOT a precise published buildable ` +
                                  `footprint. Height from the zone's maatvoering: ${heightNote}${percClause}. ` +
                                  `Confidence is reduced accordingly — verify the plan regels for the exact ` +
                                  `bouwvlak before relying on it.`,
                          ],
                      }
                    : {
                          ...envelope,
                          caveats: [
                              ...envelope.caveats,
                              `Bestemmingsplan${resolution.planNaam ? ` "${resolution.planNaam}"` : ''}: ` +
                                  `the buildable envelope is the published bouwvlak (IMRO2012 / SVBP2012), ` +
                                  `clipped to your parcel — real published geometry. Dimensions from the ` +
                                  `plan's maatvoering: ${heightNote}${percClause}` +
                                  `${resolution.maat.maxAantalBouwlagen !== null ? `, maximum ${resolution.maat.maxAantalBouwlagen} bouwlagen` : ''}. ` +
                                  `Verify against the plan regels before relying on it.`,
                          ],
                      };
                dispatchEnvelope(ctx, site.id, enriched, NL_SOURCE);
                console.log(
                    `${TAG} explicit-area envelope OK → ringSource=${resolution.ringSource} ` +
                        `plan=${resolution.planId ?? 'n/a'} bestemming=${resolution.bestemming ?? 'n/a'} ` +
                        `height=${effectiveMaxHeight_m ?? 'n/a'}m${heightDerivedFromFloors ? ' (storey-derived)' : ''} ` +
                        `conf=${enriched.confidence} inset=${enriched.insetAreaM2.toFixed(1)}m² — ` +
                        `${isZoneFallback ? 'clipped to the ZONE extent (upper bound)' : 'clipped to the bouwvlak'}.`,
                );
                return;
            }
            console.log(`${TAG} ring resolved (${resolution.ringSource}) but envelope status=${envelope.status} — refusing. caveats: ${envelope.caveats.join(' | ')}`);
        } else if (!resolution.ok) {
            console.log(`${TAG} bouwvlak not resolved (reason=${resolution.reason}, outcome=${nlOutcome.status}) — cited refusal.`);
        }

        // STRUCTURAL-SEAM-4 — the honest cited refusal (never the estimated triple), branched on the
        // fetch outcome: a still-failing TRANSIENT → the retry-honest `nlBestemmingsplanRefusal`; a
        // genuine ABSENCE (source answered, no plan/bouwvlak here) → `nlNoPlanRefusal` (no retry card).
        const planName = resolution.ok ? resolution.planNaam : null;
        const nlRefusal =
            nlOutcome.status === 'transient'
                ? nlBestemmingsplanRefusal(planName)
                : nlNoPlanRefusal(planName);
        dispatchEnvelope(
            ctx,
            site.id,
            buildRefusedEnvelope(NL_ZONE_CODE, nlRefusal, 'none'),
            NL_SOURCE,
        );
    } catch (e) {
        // Best-effort — never block the commit. Leave an honest refusal rather than a fabricated
        // estimate; if even that cannot dispatch, drop silently (the boundary is set).
        console.warn(`${TAG} path failed (non-fatal) — attempting a cited refusal:`, e);
        try {
            const site = ctx.store.getSite();
            if (site) {
                dispatchEnvelope(
                    ctx,
                    site.id,
                    buildRefusedEnvelope(NL_ZONE_CODE, nlBestemmingsplanRefusal(), 'none'),
                    NL_SOURCE,
                );
            }
        } catch { /* refusal dispatch is best-effort too */ }
    }
}

/**
 * PARIS (Ville de Paris, INSEE 75056) — the PLU bioclimatique path, STRUCTURED-DATA-FIRST.
 *
 * `resolveParisEnvelope(lat, lon)` (never throws) reads the zone identity (GPU `zone_urba`), the
 * numeric hauteur plafond (opendata `plub_hauteur`) AND the published `plub_ecm` buildable-FOOTPRINT
 * polygon + crown code. `computeParisEnvelope` then extrudes that REAL footprint to the published
 * height (never parcel×hauteur, never a fabricated emprise). So this path:
 *   • ECM footprint + a published height resolve → DRAW the real volume: the ECM ring projected into
 *     the parcel authoring frame, extruded to `min(published-height candidates)`, at `structured`
 *     (or `estimated-ruleset` when only a weaker height field resolved). status `'ok'`.
 *   • cour = X (continuous crown) → the volume STILL ships (straight prism) AND the engine's cited
 *     PARTIAL couronnement refusal (art. UG.3.2.4) rides along in the caveats — never an invented taper.
 *   • no ECM polygon at the point / no published height / a WFS miss → a CITED REFUSAL (the engine's
 *     component refusal, or `parisPluEnvelopeRefusal`) carrying the real zone + height facts. status `'none'`.
 *
 * ⚠ NO ESTIMATED-TRIPLE FALLBACK, EVER. Like Madrid/Netherlands, a Paris parcel never falls to a
 * front/side/rear estimate: the ordinance publishes the footprint as geometry, so an estimate would be
 * the wrong SHAPE (a fabricated emprise, the §CONTEXT-DATA-HONESTY failure). Gate ON — the flag now
 * AUTHORISES drawing the structured ECM volume. Best-effort + fully guarded — never throws into commit.
 */
async function applyParisZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
): Promise<void> {
    const TAG = '[gis][c58] §PARIS-PLU';
    const PARIS_SOURCE = 'gpu-paris-plu';
    try {
        const site = ctx.store.getSite();
        if (!site) return; // No site to dispatch onto — nothing to render either way.

        // Per-parcel facts for the card so it is never a blank panel (L-553). Coordinates always;
        // parcel area when a ring is available. Threaded into every engine output (ok or refusal).
        const facts: string[] = [`Location: Paris (${lat.toFixed(5)}, ${lon.toFixed(5)})`];
        const hasRing = Array.isArray(boundary.polygon) && boundary.polygon.length >= 3;
        if (hasRing) {
            const ring = boundary.polygon;
            const areaM2 = Math.abs(
                ring.reduce((acc, p, i) => {
                    const q = ring[(i + 1) % ring.length]!;
                    return acc + (p.x * q.z - q.x * p.z);
                }, 0) / 2,
            );
            if (Number.isFinite(areaM2) && areaM2 > 0) facts.push(`Parcel area: ${areaM2.toFixed(0)} m²`);
        }

        // (1) Resolve the STRUCTURED envelope inputs — zone + hauteur + ECM footprint + crown. Never throws.
        const resolution = await resolveParisEnvelope(lat, lon);
        if (!resolution.ok) {
            // Out-of-Paris / unreachable proxy / no-PLU-here → the enriched cited refusal (no facts to carry
            // beyond location/area; the emprise cannot be cited, so no footprint is drawn — never a guess).
            console.log(`${TAG} envelope inputs not resolved (reason=${resolution.reason}) — cited refusal.`);
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(parisZoneCodeFor(null), parisPluEnvelopeRefusal(null, null, facts), 'none'),
                PARIS_SOURCE,
            );
            return;
        }
        const inputs = resolution.inputs;
        const zone = inputs.zone;

        // (2) COMPUTE the envelope from the published ECM footprint + height (never parcel×hauteur).
        const result = computeParisEnvelope(inputs, facts);

        // (3) The gate AUTHORISES drawing the structured ECM volume. While OPEN, an `ok` engine result
        // renders as a real volume; a component refusal (no ECM / no height) is the engine's own cited
        // refusal. (While the gate is closed — never, now — an `ok` result would still be shown as the
        // enriched zone+height refusal, so flipping the flag can never surface a fabrication.)
        if (!result.ok) {
            console.log(
                `${TAG} zone=${zone?.zoneCode ?? 'n/a'} — component refusal (${result.refusedComponent}); ` +
                    `no ECM footprint or no published height at this point.`,
            );
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(parisZoneCodeFor(zone), result.refusal, 'none'),
                PARIS_SOURCE,
            );
            return;
        }
        if (!FR_PARIS_PLU_CERTIFIED) {
            // Defensive: gate closed but the engine computed a volume → show the enriched zone+height
            // refusal, never the structured volume (the founder switch has not authorised drawing it).
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(
                    parisZoneCodeFor(zone),
                    parisPluEnvelopeRefusal(zone, inputs.heightCeiling_m, facts, {
                        hmc_m: inputs.hmc_m,
                        hmcDatum: inputs.hmcDatum,
                        filetCode: inputs.filetCode,
                        filetFrontageHeight_m: inputs.filetHeight_m,
                        sourceVersion: inputs.sourceVersion,
                    }),
                    'none',
                ),
                PARIS_SOURCE,
            );
            console.log(`${TAG} gate CLOSED — enriched cited refusal (engine had a volume; not authorised to draw).`);
            return;
        }

        // (4) DRAW. Project the published ECM ring (WGS84) into the SAME authoring frame the parcel lives
        // in — the equirectangular projection about the site origin, then the θ de-rotation
        // `dispatchParcelBoundary` applied to the parcel ring. This mirrors the Madrid / BCN
        // `toAuthoringFrame` exactly (any other frame yields a garbage placement), and it is the
        // geo-anchored equivalent of re-anchoring the engine's centroid-relative `footprintPolygon`.
        const origin = { lat: site.location.latitude, lon: site.location.longitude };
        const rawTheta = site.location.trueNorth;
        const theta = Number.isFinite(rawTheta) ? rawTheta : 0;
        const toAuthoringFrame = (p: LatLon): Pt => {
            const xz = latLonToSceneXZ(p, origin.lat, origin.lon);
            if (theta === 0) return { x: xz.x, z: xz.z };
            const e = trueVectorToProjectNorth({ east: xz.x, north: -xz.z }, theta);
            return { x: e.east, z: -e.north };
        };
        const footprintRing: Pt[] = (inputs.ecmGeometry ?? []).map((ll) =>
            toAuthoringFrame({ lat: ll[1], lon: ll[0] }),
        );
        if (footprintRing.length < 3) {
            // The engine returned a footprint but the projection degenerated — refuse honestly rather
            // than draw garbage (never a whole-parcel box).
            console.log(`${TAG} ECM footprint projected to < 3 pts — cited refusal.`);
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(parisZoneCodeFor(zone), parisPluEnvelopeRefusal(zone, inputs.heightCeiling_m, facts), 'none'),
                PARIS_SOURCE,
            );
            return;
        }

        // Build the BuildableEnvelope from the engine result: the drawn ring is the published ECM
        // footprint (geometry, never parcel×%); the height/volume/confidence/facts/caveats are the
        // engine's. The crown PARTIAL refusal (cour=X) rides along as a caveat — the volume still ships.
        const heightSource =
            result.heightBinding === 'height-ceiling'
                ? 'Paris opendata plub_hauteur (UG.3.2.1) — published height ceiling'
                : result.heightBinding === 'ecm-graphic'
                  ? 'Paris opendata plub_ecm graphic height — published'
                  : 'Paris opendata plub_hmc (relative) — published';
        const envelope: BuildableEnvelope = {
            insetPolygon: footprintRing,
            maxHeight_m: result.height_m,
            farLimitedHeight_m: null,
            maxFloors: null,
            maxFAR: null,
            maxCoverage: null,
            maxVolumeM3: result.volumeM3,
            // The drawn ring is the published ECM footprint geometry (never parcel×%), so it is a real
            // solved footprint — not a full-parcel upper bound (L-619 flag stays false here).
            footprintIsUpperBound: false,
            // §OPEN-TOP-INDICATIVE — Paris draws from PUBLISHED ECM geometry through its own gate,
            // not through `envelopePublicationPosture()`. Null = NOT STATED, which is the honest
            // answer for a path that never asked the posture question — and it classifies exactly as
            // it always did. ⛔ NOT `'determination'`: that would put a publication claim on an
            // envelope no gate has been consulted about, which is the direction §1.4 forbids.
            publicationPosture: null,
            // §L-619 — `placement` / `openSpace` are the DK placement-resolver's vocabulary
            // (byggefelt / byggelinje / derived band). Paris ECM is a different pipeline and makes
            // no such statement, so both stay null — the honest "no placement claim" (this literal
            // never goes through `.parse()`, so the schema defaults would not apply otherwise).
            placement: null,
            openSpace: null,
            // The engine's NET buildable area (gross ECM footprint − any EAL strip) is the authoritative
            // figure; the drawn ring is the gross ECM outline (EAL is a scalar deduction, per the caveats).
            insetAreaM2: result.footprintAreaM2,
            permittedUse: [],
            confidence: result.confidence,
            granularity: 'parcel',
            status: 'ok',
            refusal: null,
            zoneCode: parisZoneCodeFor(zone),
            derivation: [
                {
                    constraint: 'maxHeight',
                    value: result.height_m,
                    zoneCode: parisZoneCodeFor(zone),
                    source: heightSource,
                    fieldProvenance:
                        result.heightBinding === 'height-ceiling' ? 'published-structured' : 'estimated',
                    ordinanceRef: PARIS_PLU_ORDINANCE_REF,
                },
            ],
            caveats: [
                ...result.caveats,
                ...(result.couronnementRefusal
                    ? [result.couronnementRefusal.headline, result.couronnementRefusal.detail]
                    : []),
                `Paris PLU bioclimatique (zone ${zone?.zoneCode ?? 'UG'}): the FOOTPRINT is the published ` +
                    `emprise constructible maximale (opendata plub_ecm) — real geometry, extruded to the ` +
                    `published ${result.height_m} m height. Verify against the UG règlement before relying on it.`,
            ],
            tiers: [],
        };
        dispatchEnvelope(ctx, site.id, envelope, PARIS_SOURCE);
        console.log(
            `${TAG} ECM envelope OK → zone=${zone?.zoneCode ?? 'n/a'} footprint=${result.footprintAreaM2.toFixed(1)}m² ` +
                `height=${result.height_m}m (${result.heightBinding}) volume=${Math.round(result.volumeM3)}m³ ` +
                `confidence=${result.confidence}${result.couronnementRefusal ? ' (crown cour=X: PARTIAL refusal)' : ''} ` +
                `— structured ECM geometry, gate CERTIFIED.`,
        );
    } catch (e) {
        // Best-effort — never block the commit. Leave an honest refusal rather than a fabricated
        // estimate; if even that cannot dispatch, drop silently (the boundary is set).
        console.warn(`${TAG} path failed (non-fatal) — attempting a cited refusal:`, e);
        try {
            const site = ctx.store.getSite();
            if (site) {
                dispatchEnvelope(
                    ctx,
                    site.id,
                    buildRefusedEnvelope(parisZoneCodeFor(null), parisPluEnvelopeRefusal(), 'none'),
                    PARIS_SOURCE,
                );
            }
        } catch { /* refusal dispatch is best-effort too */ }
    }
}

/**
 * SWITZERLAND — the national Grundnutzung (land-use zone) path (Outcome B).
 *
 * The national Nutzungsplanung WFS (geodienste.ch ms:grundnutzung) publishes the zone IDENTITY as
 * structured data but NOT its density (Nutzungsziffer) or height — those are model+PDF-bound. So this
 * path:
 *   1. `resolveChZone(lat, lon)` (never throws) — identifies the zone, or a typed refusal;
 *   2. dispatches a CITED REFUSAL carrying the identified zone as `knownFacts`, so the parcel's REAL
 *      zone renders (e.g. "Wohnzone (W2), canton AI") while no buildable number is drawn.
 *
 * ⚠ NO ESTIMATED FALLBACK, EVER. Unlike DK/BCN, a Swiss parcel never falls to the estimated triple:
 * the zone is identified but no density/height can be cited, and a fabricated front/side/rear estimate
 * is exactly the §CONTEXT-DATA-HONESTY failure the recon disproved (Outcome B). Even on a WFS miss the
 * honest output is a refusal (the zone simply is not identified), never a guess.
 *
 * `status: 'none'` keeps every numeric envelope field null and clears any stale ring (dispatchEnvelope
 * writes a ring only on 'ok'). Best-effort + fully guarded — never throws into the commit path.
 */
async function applyChZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
): Promise<void> {
    const TAG = '[gis][c58] §CH-GRUNDNUTZUNG';
    const JURISDICTION_REF = 'geodienste-ch-grundnutzung';
    try {
        const site = ctx.store.getSite();
        if (!site) return; // No site to dispatch onto — nothing to render either way.

        // Per-parcel facts for the refusal card so it is never a blank panel (L-553). Coordinates
        // always; parcel area when a ring is available. No network beyond the zone resolve.
        const facts: string[] = [`Location: Switzerland (${lat.toFixed(5)}, ${lon.toFixed(5)})`];
        if (Array.isArray(boundary.polygon) && boundary.polygon.length >= 3) {
            const ring = boundary.polygon;
            const areaM2 = Math.abs(
                ring.reduce((acc, p, i) => {
                    const q = ring[(i + 1) % ring.length]!;
                    return acc + (p.x * q.z - q.x * p.z);
                }, 0) / 2,
            );
            if (Number.isFinite(areaM2) && areaM2 > 0) facts.push(`Parcel area: ${areaM2.toFixed(0)} m²`);
        }

        // (0) REFERENCE COMMUNE — City of Zürich (BFS-Nr 261). Prefer the finer municipal BZO zone-ID
        // (its `typ` code + a DIRECT link to this parcel's BZO 700.100 ordinance) over the national
        // Grundnutzung. Still a REFUSAL — the AZ/height are PDF-bound (Outcome B holds even here) — but
        // one that NAMES the per-parcel ordinance. If the `/api/ch/zurich-bzo` proxy is not yet wired
        // (or any miss), this resolves unreachable and we fall through to the national path below.
        if (isInZurichCity(lat, lon)) {
            const zh = await resolveZurichBzoZone(lat, lon);
            if (zh.ok) {
                // §L-616 — the COMPUTED BZO envelope, gated on `CH_FAR_CERTIFIED` (owner sign-off,
                // ch/sources/VERIFICATION.md 2026-07-26). When ON, resolve the regime-aware structured
                // fields (AZ as `plotRatioFAR`, the regime-correct Gebäudehöhe as `maxHeight_m`, the
                // Vollgeschosse as `maxFloors`) and feed the SHARED engine with `rulePack: null` — the AZ
                // then binds the engine's `farLimitedHeight_m` cap, so the massing is GFA-capped, never
                // footprint×height (the OVERSTATES-FAR defect). `zurichBzoStructuredFields` is regime-aware
                // and REFUSES (returns null) when the governing regime is undetermined (W2bIII 8.5 vs 9.0 m)
                // or the zone is not carried in the resolved regime — we then keep the cited refusal, NEVER
                // a guessed height (§CONTEXT-DATA-HONESTY). The envelope ships `estimated-ruleset`: the
                // AZ/height are a HUMAN transcription of the BZO 700.100 PDF table, not a live WFS attribute.
                const hasRing = Array.isArray(boundary.polygon) && boundary.polygon.length >= 3;
                const structured = CH_FAR_CERTIFIED
                    ? zurichBzoStructuredFields({
                          typ: zh.zone.typ,
                          rechtsvorschriftUrl: zh.zone.rechtsvorschriftUrl,
                      })
                    : null;
                if (CH_FAR_CERTIFIED && hasRing && structured) {
                    const record: ZoningRecord = {
                        zoneCode: zurichBzoZoneCodeFor(zh.zone),
                        zoneLabel: zurichBzoZoneLabelFor(zh.zone),
                        jurisdictionId: CH_ZURICH_JURISDICTION_ID,
                        // AZ under the ENGINE's FAR-cap field name (`plotRatioFAR`) so `farLimitedHeight_m`
                        // binds; the regime-correct height + Vollgeschosse as caps.
                        structuredFields: {
                            plotRatioFAR: structured.plotRatioFAR,
                            maxHeight_m: structured.maxHeight_m,
                            maxFloors: structured.maxFloors,
                        },
                        overlays: [],
                        ordinanceRef: zh.zone.rechtsvorschriftUrl ?? CH_ZURICH_BZO_ORDINANCE_REF,
                        provenance: {
                            source: 'stadt-zuerich-bzo',
                            label: 'City of Zürich BZO 700.100 (zone-ID WFS + transcribed AZ/height table)',
                            version: null,
                            license: null,
                            crs: 'EPSG:2056',
                        },
                    };
                    const envelope = computeBuildableEnvelope({
                        parcelRing: boundary.polygon,
                        edgeClassifications: boundary.edgeClassifications,
                        zoning: record,
                        rulePack: null, // structured fields only → the AZ binds farLimitedHeight_m (L-616)
                    });
                    if (envelope.status === 'ok' && envelope.insetPolygon.length >= 3) {
                        // Downgrade to estimated-ruleset: the AZ/height are a HUMAN transcription of the
                        // BZO 700.100 PDF table, not a live authoritative feed (never `structured`).
                        const enriched: BuildableEnvelope = {
                            ...envelope,
                            confidence: 'estimated-ruleset',
                            caveats: [
                                ...envelope.caveats,
                                `City of Zürich BZO ${zurichBzoZoneLabelFor(zh.zone)}: AZ ` +
                                    `${structured.plotRatioFAR} × parcel area caps the GFA (max ` +
                                    `${structured.maxHeight_m} m / ${structured.maxFloors} Vollgeschosse). The ` +
                                    `AZ/height are a HUMAN transcription of the BZO 700.100 Bauordnung table ` +
                                    `(owner-signed, not a live WFS attribute) — ships estimated-ruleset. ` +
                                    `Governing ordinance: ${zh.zone.rechtsvorschriftUrl ?? 'BZO 700.100'}.`,
                            ],
                        };
                        dispatchEnvelope(ctx, site.id, enriched, 'stadt-zuerich-bzo');
                        console.log(
                            `${TAG} Zürich BZO COMPUTED envelope → zone=${zurichBzoZoneCodeFor(zh.zone)} ` +
                                `AZ=${structured.plotRatioFAR} height=${structured.maxHeight_m}m ` +
                                `floors=${structured.maxFloors} inset=${enriched.insetAreaM2.toFixed(1)}m² ` +
                                `farLimitedHeight=${enriched.farLimitedHeight_m ?? 'n/a'}m ` +
                                `(estimated-ruleset, gate ON).`,
                        );
                        return;
                    }
                    console.log(
                        `${TAG} Zürich BZO certified but envelope status=${envelope.status} — cited refusal. ` +
                            `caveats: ${envelope.caveats.join(' | ')}`,
                    );
                } else if (CH_FAR_CERTIFIED && hasRing && !structured) {
                    console.log(
                        `${TAG} Zürich BZO gate ON but structured fields unresolved (regime-ambiguous / ` +
                            `not-in-regime for typ=${zh.zone.typ ?? 'n/a'}) — cited refusal, never a guessed height.`,
                    );
                }
                // Gate OFF, no ring, helper null, or a non-ok envelope → the cited refusal that NAMES the
                // per-parcel ordinance (the zone still renders; no fabricated number is ever drawn).
                const zhRefusal = zurichBzoEnvelopeRefusal(zh.zone, facts);
                dispatchEnvelope(
                    ctx,
                    site.id,
                    buildRefusedEnvelope(zurichBzoZoneCodeFor(zh.zone), zhRefusal, 'none'),
                    'stadt-zuerich-bzo',
                );
                console.log(
                    `${TAG} Zürich BZO zone identified (${zurichBzoZoneLabelFor(zh.zone)}) — rendered; ` +
                        `buildable envelope REFUSES (gate/regime/ring), citing ` +
                        `${zh.zone.rechtsvorschriftUrl ?? 'the BZO ordinance'}.`,
                );
                return;
            }
            console.log(
                `${TAG} Zürich BZO not resolved (reason=${zh.reason}) — falling through to national CH path.`,
            );
        }

        // (1) Identify the zone from the national WFS. Never throws.
        const resolution = await resolveChZone(lat, lon);
        const zone = resolution.ok ? resolution.zone : null;

        // (2) Dispatch a cited refusal that CARRIES the identified zone (so the zone renders). The
        // envelope stays a refusal: no density/height can be cited (Outcome B), never fabricated.
        const refusal = chZoningEnvelopeRefusal(zone, facts);
        dispatchEnvelope(
            ctx,
            site.id,
            buildRefusedEnvelope(chZoneCodeFor(zone), refusal, 'none'),
            JURISDICTION_REF,
        );
        if (zone) {
            console.log(
                `${TAG} zone identified (${chZoneLabelFor(zone)}, canton ${zone.kanton ?? 'n/a'}) — ` +
                    `rendered; buildable envelope REFUSES (density/height are model+PDF-bound, Outcome B).`,
            );
        } else {
            console.log(
                `${TAG} zone not identified (reason=${resolution.ok ? 'n/a' : resolution.reason}) — cited refusal.`,
            );
        }
    } catch (e) {
        // Best-effort — never block the commit. Try to leave an honest refusal rather than an estimate.
        console.warn(`${TAG} path failed (non-fatal) — attempting a cited refusal:`, e);
        try {
            const site = ctx.store.getSite();
            if (site) {
                dispatchEnvelope(
                    ctx,
                    site.id,
                    buildRefusedEnvelope(chZoneCodeFor(null), chZoningEnvelopeRefusal(null), 'none'),
                    JURISDICTION_REF,
                );
            }
        } catch { /* refusal dispatch is best-effort too */ }
    }
}

/**
 * Reads the current session's bearer token from client-side auth storage, exactly the same
 * `'bim-platform-token'` localStorage key `AuthModal.ts` / `ProjectHub.ts` / `initUI.ts` already
 * read/write. Never throws (private-mode / SSR / test environments may not have `localStorage` at
 * all) — returns `null` in every such case, which is exactly what makes
 * `resolveCordobaManualAdminZone` skip its network call entirely (see that resolver's own header).
 */
function currentAuthTokenForManualAdminZone(): string | null {
    try {
        if (typeof localStorage === 'undefined') return null;
        return localStorage.getItem('bim-platform-token');
    } catch {
        return null;
    }
}

/**
 * §COR-MANUAL-ADMIN-ZONE (2026-08-05) — a small named `PRYZM_ADMIN` allowlist
 * (`server/adminAllowlist.js`) can type a zone + subzone code for a Córdoba parcel via the admin-only
 * panel (`apps/editor/src/ui/site/ManualAdminZonePanel.ts`) and see a REAL computed envelope
 * IMMEDIATELY — no git commit, no deploy, no founder sign-off step. Replaces the much slower full
 * agent hand-tracing pass for one-off TEST parcels (see
 * `docs/04-reference/jurisdictions/es/es-an/14021-cordoba/findings/TRACED-ZONE-SERVICE-2026-08-05.md`).
 *
 * ⚠⚠ THIS IS A COMPLETELY SEPARATE, ADDITIVE MECHANISM FROM `CORDOBA_ENVELOPE_VERIFIED` /
 * `CORDOBA_TRACED_ZONES_VERIFIED`. It never reads either flag, and dispatching a computed envelope
 * from this source must never be read as satisfying either sign-off. Visibility is enforced
 * SERVER-SIDE (`server/manualAdminZoneStore.js`'s `resolveManualAdminZone`): the server only ever
 * answers with an entry belonging to the SAME admin session that wrote it, so this branch is,
 * observably, a true no-op for every non-admin session and for every OTHER admin's session — the
 * exact same "closed until proven open" honesty shape every other gated resolver in this file
 * follows, just enforced by session identity instead of a boolean constant.
 *
 * No auth token in client storage ⇒ `resolveCordobaManualAdminZone` never calls the network (its own
 * documented short-circuit) ⇒ this function falls straight through to the UNMODIFIED existing chain
 * (`isInCordoba` ? the pilot path : the traced-zone path) — byte-for-byte the same routing that ran
 * before this function was wired in, for every session without a manual entry.
 */
async function applyCordobaManualAdminZoneThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    estimated: BuildableEnvelope | null,
    deps: { authToken?: string | null } = {},
): Promise<void> {
    const TAG = '[gis][c58] §COR-MANUAL-ADMIN-ZONE';
    const fallthroughToExistingChain = async (): Promise<void> => {
        if (isInCordoba(lat, lon)) {
            await applyCordobaZoningThenFallback(ctx, boundary, lat, lon, estimated);
        } else {
            await applyCordobaTracedZoneThenFallback(ctx, boundary, lat, lon, estimated);
        }
    };
    try {
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) {
            await fallthroughToExistingChain();
            return;
        }
        const site = ctx.store.getSite();
        if (!site) {
            await fallthroughToExistingChain();
            return;
        }

        const authToken = deps.authToken !== undefined ? deps.authToken : currentAuthTokenForManualAdminZone();

        let manual: Awaited<ReturnType<typeof resolveCordobaManualAdminZone>>;
        try {
            manual = await resolveCordobaManualAdminZone({ lat, lon }, { authToken });
        } catch (e) {
            console.warn(`${TAG} resolveCordobaManualAdminZone failed (non-fatal):`, e);
            await fallthroughToExistingChain();
            return;
        }

        if (!manual.ok) {
            // Includes 'not-authenticated' (the common case for every non-admin session), 'forbidden'
            // (a non-allowlisted caller), and 'no-match' (an admin with no saved entry for this
            // point) — all fall through identically to the pre-existing, unmodified chain.
            // §DIAG-FIX (2026-08-05) — this branch used to be SILENT, so a save that "succeeded"
            // but never actually resolved back gave zero console signal to diagnose from (founder
            // report: filtering for MANUAL-ADMIN showed nothing at all). Log the exact reason for
            // every non-admin session too — `reason` is one of a small closed set, never PII, and
            // this fires on every ordinary site view, so keep it terse.
            console.log(`${TAG} no-op — reason='${manual.reason}' at (${lat.toFixed(5)}, ${lon.toFixed(5)}); falling through to the normal chain.`);
            await fallthroughToExistingChain();
            return;
        }

        const knownFacts = [
            `Location: Córdoba (${lat.toFixed(5)}, ${lon.toFixed(5)}) — manual admin zone entry`,
            `Manual zone: ${manual.resolution.zoneCode}` +
                (manual.resolution.subzoneCode ? ` / ${manual.resolution.subzoneCode}` : ''),
            `⚠ Provenance: ${manual.resolution.provenance}`,
        ];

        const record: ZoningRecord = {
            zoneCode: manual.resolution.zoneCode,
            zoneLabel: manual.resolution.zoneCode,
            jurisdictionId: CORDOBA_JURISDICTION_ID,
            structuredFields: {},
            overlays: [],
            ordinanceRef: null,
            provenance: {
                source: 'cordoba-pgou-2001-manual-admin-entry',
                label:
                    "PGOU de Córdoba (2001) — zone CODE typed by an allowlisted PRYZM admin " +
                    '(no geometry trace, no municipal publication behind it). ' + manual.resolution.provenance,
                version: '2001',
                license: null,
                crs: 'EPSG:4326',
            },
        };

        const envelope = computeBuildableEnvelope({
            parcelRing: boundary.polygon,
            edgeClassifications: boundary.edgeClassifications,
            zoning: record,
            rulePack: ES_CORDOBA_PGOU2001_PACK,
        });

        if (envelope.status === 'ok') {
            dispatchEnvelope(ctx, site.id, envelope, 'coaco-pgou-manual-admin');
            console.log(
                `${TAG} §COR-MANUAL-ADMIN-COMPUTE zone=${manual.resolution.zoneCode} — RENDERED a ` +
                    `manual-admin-entry envelope at ${envelope.confidence ?? 'n/a'} for ${manual.resolution.enteredByEmail}.`,
            );
            return;
        }

        dispatchEnvelope(
            ctx,
            site.id,
            buildRefusedEnvelope(
                manual.resolution.zoneCode,
                {
                    code: 'source-data-unavailable',
                    headline:
                        `${manual.resolution.zoneCode}: the PGOU's own conditions leave no buildable ` +
                        'footprint on this parcel.',
                    detail:
                        envelope.refusal?.detail ??
                        'The manually-entered zone does not resolve to a buildable ring here.',
                    ordinanceRef: null,
                    legallyGrounded: false,
                    knownFacts,
                },
                'none',
            ),
            'coaco-pgou-manual-admin',
        );
        console.log(
            `${TAG} §COR-MANUAL-ADMIN-COMPUTE zone=${manual.resolution.zoneCode} — compute did not ` +
                `resolve to 'ok' (status=${envelope.status}); dispatched a cited refusal.`,
        );
    } catch (e) {
        console.warn(`${TAG} manual-admin-zone path failed (non-fatal) — falling through:`, e);
        try { await fallthroughToExistingChain(); } catch { /* fallback is best-effort too */ }
    }
}

/**
 * §NEARBY-HEIGHT-SUGGESTION (2026-08-05) — the admin-only, NOT-YET-REVIEWED live PREVIEW path.
 *
 * `ManualAdminZonePanel.ts` calls this the moment its height-based suggestion
 * (`nearbyBuildingHeightSuggestion.ts`) returns a real match, so the admin sees the suggested
 * zone's envelope rendered IMMEDIATELY on panel open — in the warning amber
 * (`envelopeRenderStyle`'s `suggestedPreview`/`SUGGESTED_AMBER_CSS`), never the confident violet.
 *
 * ⚠⚠ THIS NEVER WRITES TO `manual_admin_zones`. It computes the envelope CLIENT-SIDE, directly
 * from the rule pack, exactly the way `applyCordobaManualAdminZoneThenFallback` above does for a
 * SAVED entry — but it never calls `POST /api/manual-zone`, so nothing is persisted. It is a pure
 * "what would this zone look like" render. The admin's explicit "Save + compute" click is the ONLY
 * action that writes a row (`ManualAdminZonePanel.ts`'s existing `_onSave`, unmodified in this
 * regard) — this function exists purely to render EARLIER than that click, for the ONE zone code
 * the height suggestion named.
 *
 * Sets `_lastEnvelopeIsSuggestedPreview = true` (via the `dispatchEnvelope` call below, which
 * itself always resets it to `false` first) so the render layer knows to paint amber, not violet.
 * The very next `dispatchEnvelope` call from ANY other path (in particular the admin's own
 * `_onSave` → `reapplyZoningForActiveSite`) resets the flag, which is exactly what makes clicking
 * Save + compute flip the colour back to normal — see that flag's own doc comment.
 *
 * Returns `true` iff a real ('ok') envelope was computed and dispatched; `false` on any failure
 * (no site/boundary, unknown zone code, non-'ok' compute) — never throws, never dispatches a
 * refusal (a failed preview should leave whatever was already rendered alone, not paint a new
 * "refused" card over it).
 */
export function previewSuggestedZoneEnvelope(ctx: SiteContext, zoneCode: string): boolean {
    const TAG = '[gis][c58] §NEARBY-HEIGHT-SUGGESTION';
    try {
        const site = ctx.store.getSite();
        const boundary = site?.parcel?.boundary;
        if (!site || !Array.isArray(boundary?.polygon) || boundary.polygon.length < 3) {
            console.log(`${TAG} no site/boundary yet — preview skipped.`);
            return false;
        }

        const record: ZoningRecord = {
            zoneCode,
            zoneLabel: zoneCode,
            jurisdictionId: CORDOBA_JURISDICTION_ID,
            structuredFields: {},
            overlays: [],
            ordinanceRef: null,
            provenance: {
                source: 'cordoba-pgou-2001-manual-admin-entry',
                label:
                    'PGOU de Córdoba (2001) — a SUGGESTED zone from real nearby building heights ' +
                    '(admin-only, not yet reviewed or saved). Not a determination.',
                version: '2001',
                license: null,
                crs: 'EPSG:4326',
            },
        };

        const envelope = computeBuildableEnvelope({
            parcelRing: boundary.polygon,
            edgeClassifications: boundary.edgeClassifications,
            zoning: record,
            rulePack: ES_CORDOBA_PGOU2001_PACK,
        });

        if (envelope.status !== 'ok') {
            console.log(`${TAG} zone=${zoneCode} did not compute to 'ok' (status=${envelope.status}) — preview skipped.`);
            return false;
        }

        dispatchEnvelope(ctx, site.id, envelope, 'coaco-pgou-manual-admin-suggested-preview');
        _lastEnvelopeIsSuggestedPreview = true;
        console.log(`${TAG} zone=${zoneCode} — rendered an UNREVIEWED amber preview.`);
        return true;
    } catch (e) {
        console.warn(`${TAG} preview failed (non-fatal):`, e);
        return false;
    }
}

/**
 * §COR-ENVELOPE — the Córdoba (INE 14021) PGOU-2001 pilot path (Sur + Noroeste districts).
 *
 * ⚠⚠⚠ THE HONESTY GATE IS THE POINT OF THIS FUNCTION. Every value in the Córdoba pack was
 * MACHINE-EXTRACTED (OCR) from the scanned ordinance PDFs and is `pipeline-extracted-unverified` —
 * no human has checked it against the source. A wrong number here would be PRYZM's OWN pipeline's
 * error, so until a human signs `sources/VERIFICATION.md` (`CORDOBA_ENVELOPE_VERIFIED === false`)
 * this path renders NO number at all: it dispatches a cited "machine-extracted, unverified" REFUSAL
 * for EVERY Córdoba parcel — including one in a fully-packed subzone (PAS-1…MC-4). This is the same
 * discipline that keeps Barcelona's 22a unregistered: an absent number costs nothing, a confident
 * wrong one costs credibility (§CONTEXT-DATA-HONESTY; ORDINANCE-EXTRACTION-PIPELINE.md §3).
 *
 * Only AFTER sign-off does the compute branch turn on — and even then the envelope is re-tiered
 * `pipeline-extracted-unverified` with the louder-than-estimated affordance, never a plain estimate.
 * Fully guarded: any problem falls back to the precomputed estimated envelope; never throws into the
 * commit path. `status: 'none'` on the refusal keeps every numeric field null and clears any stale
 * `buildableRing` (dispatchEnvelope writes a ring only on `'ok'`).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * §COR-ALIGNMENT — WHY THE MANZANA CERRADA FAMILY REFUSES, AND WHY THAT IS NOT AN ENGINEERING GAP
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * MC is the single largest packed family in the pilot — MEASURED at 212 of 453 published ordenanza
 * polygons = 46.8 % of rows / 42.9 % of ordenanza land (`tools/cordoba-alignment-probe`, live
 * 2026-08-02). Its height is a per-street-width TABLE (Art. 13.5.3.1), so it needs an ALINEACIÓN
 * to measure that width from. Córdoba publishes none, and this was re-tested independently rather
 * than inherited:
 *
 *   • An exhaustive lexeme sweep (alinea/retranq/rasant/fondo/fachada/frente/edificab) over BOTH
 *     publishers' complete live inventories — ide.cordoba.es (105 layers) and the COACo GeoServer
 *     (15 layers), all EPSG:25830 — returns ZERO alignment layers. (Two `rasant` hits at COACo are
 *     `vhex25_sup_brasante/srasante_m2`, hexagonal floor-AREA statistics: a lexeme match, not an
 *     alignment.)
 *   • ⭐ The only street LINE layer, `idecordoba:ejes_red_viaria` (9 668 features), is an AXIS, not
 *     an alignment — and it was measured, not assumed. Perpendicular distance from sampled points
 *     to the nearest `idecordoba:manzana` frontage, n = 4 634 street cross-sections: only 16.7 %
 *     lie within 1 m of a frontage, median offset 3.73 m (p90 9.47 m). The paired CONTROL in the
 *     same window — `idecordoba:sup_viales`, whose boundary IS the street edge — scores 83.9 %
 *     within 1 m, median 0 m, over n = 9 811. The method can tell an edge from an axis; the eje
 *     layer is not an edge.
 *   • Deriving the alignment from the axis would need a per-street WIDTH, and no Spanish source
 *     publishes one — it must be CONSTRUCTED. `sup_viales` does coincide with the frontage, but it
 *     is the municipal callejero (the PHYSICAL street surface), a different object from a LEGAL
 *     alineación; substituting it is deriving law, which ADR-0284 forbids. Art. 13.5.3.1's own
 *     measurement basis is also unreadable from the served PDF (vector paths, no text layer), so
 *     we do not even know what the width is measured BETWEEN.
 *
 * ⇒ MC's share is NOT ours to build. It is category ④ *awaiting authoritative interpretation*
 * (owner: GMU / COACo — publish alineaciones, or state the measurement basis), and PRYZM REFUSES
 * rather than invent a width. Do not "fix" this by adopting `sup_viales` or a `w = 2A/P` proxy:
 * MC's bands are 2 m apart, so ~45 % of streets sit within ±1 m of a band edge and ADR-0287 would
 * void them anyway. See CLOSURE-REGISTER rows 8 / 25.
 */
async function applyCordobaZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    estimated: BuildableEnvelope | null,
): Promise<void> {
    const TAG = '[gis][c58] §COR-ENVELOPE';
    // The FALLBACK zone code for the refusal envelope, used only when the COACo subzone does not
    // resolve (outside the 2-district pilot, or the endpoint did not answer). ⬆ The resolver IS
    // now wired below (§COR-SUBZONE), so a parcel inside the pilot refuses under its real subzone
    // (PAS-1 / MC-3 / …). `zoneCode` is required (min length 1); this names the pilot, not a
    // subzone, and no number rides on it either way.
    const CORDOBA_PILOT_ZONE_CODE = 'cordoba-pgou-2001-pilot';
    try {
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        const site = ctx.store.getSite();
        if (!site) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        // Per-parcel facts for the refusal card so it is never a blank panel (L-553). Area only —
        // no network: the COACo subzone/address lookup is WIRING-TODO 5.
        const parcelAreaM2 = (() => {
            try {
                const ring = boundary.polygon;
                const a = Math.abs(
                    ring.reduce((acc, p, i) => {
                        const q = ring[(i + 1) % ring.length]!;
                        return acc + (p.x * q.z - q.x * p.z);
                    }, 0) / 2,
                );
                return Number.isFinite(a) && a > 0 ? a : null;
            } catch { return null; }
        })();
        // ── §COR-SUBZONE — resolve the COACo subzone BEFORE the gate (blocker 3). ────────────
        //
        // ⚠⚠ THIS RESOLVES DATA, IT DOES NOT DECIDE TO RENDER. `CORDOBA_ENVELOPE_VERIFIED` is
        // still false below, so a resolved subzone binds NO number — it only lets the refusal say
        // WHICH zone refused. That distinction is the resolver's own honesty property 2.
        //
        // Why before the gate: `cordobaUnverifiedRefusal`'s copy is CONDITIONAL on knowing the
        // subzone (§CORDOBA-UNVERIFIED-SCOPE), and the dispatcher was calling it with `null` for
        // every pilot parcel — so every user got the vaguest of the two messages even on land
        // whose ordenanza PRYZM has actually read. Resolving first is what that function was
        // written for.
        //
        // ⚠ A FAILURE AND AN EMPTY ANSWER ARE NOT THE SAME VALUE (§CONTEXT-DATA-HONESTY,
        // L-422/457/467/469). `no-subzone` means COACo answered and this point is OUTSIDE the
        // 2-district pilot; `endpoint-unreachable` means we do not know. They are reported
        // differently and neither is allowed to read as "there is no plan here".
        //
        // The resolver never throws (typed refusals only), but it is still wrapped: a network
        // stall must never take the commit path down.
        let subzone: string | null = null;
        let subzoneOrdenanza: string | null = null;
        let subzoneNote: string | null = null;
        try {
            const sz = await resolveCordobaSubzone({ lat, lon });
            if (sz.ok) {
                subzone = sz.resolution.subzone;
                subzoneOrdenanza = sz.resolution.ordenanza;
                // ⚠ The derived-planning override: a non-empty `actuacion` means a Plan Parcial /
                // PERI / ED / SG governs and the BASE ordenanza does not apply at all. Surfaced as
                // a fact so the refusal never implies the base subzone would have given a figure.
                if (sz.resolution.derivedPlanningOverride) {
                    subzoneNote =
                        `⚠ Inside a derived-planning ámbito (${sz.resolution.actuacion ?? 'actuación'}) — ` +
                        'the subordinate instrument governs, not the base ordenanza.';
                }
            } else if (sz.reason === 'no-subzone') {
                subzoneNote =
                    'Outside the published COACo calificación pilot (Sur + Noroeste) — no ordenanza ' +
                    'polygon covers this point.';
            } else {
                subzoneNote =
                    `Subzone NOT resolved (${sz.reason}) — this is an unknown, not an absence of planning.`;
            }
        } catch (e) {
            console.warn(`${TAG} §COR-SUBZONE resolve failed (non-fatal):`, e);
            subzoneNote = 'Subzone NOT resolved (resolver error) — this is an unknown, not an absence of planning.';
        }

        const knownFacts = [
            `Location: Córdoba (${lat.toFixed(5)}, ${lon.toFixed(5)}) — Sur + Noroeste PGOU-2001 pilot`,
            parcelAreaM2 !== null ? `Parcel area: ${Math.round(parcelAreaM2).toLocaleString()} m²` : null,
            subzone !== null
                ? `Calificación: ${subzoneOrdenanza ? `${subzoneOrdenanza} — ` : ''}subzona ${subzone} ` +
                  '(COACo «coaco:ordenanzas», EPSG:25830)'
                : null,
            subzoneNote,
            'Planning source: Ayuntamiento de Córdoba PGOU-2001 (COACo) — machine-extracted, unverified',
        ].filter((s): s is string => typeof s === 'string');

        if (!CORDOBA_ENVELOPE_VERIFIED) {
            // ⚠⚠⚠ THE HONESTY GATE. Unverified → refuse, never a number. `status: 'none'` = attempted,
            // value WITHHELD pending human verification (NOT `'not-applicable'`, which would assert the
            // ordinance grants no envelope — it does grant one, we simply have not checked our OCR of it).
            const refusal = cordobaUnverifiedRefusal(subzone, subzoneOrdenanza, knownFacts);
            dispatchEnvelope(
                ctx,
                site.id,
                // ⚠ The zone code is the RESOLVED subzone when we have one — so the refusal is
                // attributable to a real ordenanza rather than the pilot placeholder. It still
                // carries `status: 'none'`, so every numeric field stays null (no ring is written).
                buildRefusedEnvelope(subzone ?? CORDOBA_PILOT_ZONE_CODE, refusal, 'none'),
                'coaco-pgou',
            );
            console.log(
                `${TAG} §HONESTY-GATE CORDOBA_ENVELOPE_VERIFIED=false — dispatched the ` +
                    `machine-extracted-unverified refusal; NO number rendered (${refusal.code}). ` +
                    `subzone=${subzone ?? 'unresolved'} area=${parcelAreaM2?.toFixed(0) ?? 'n/a'} m². ` +
                    `Signs off via sources/VERIFICATION.md.`,
            );
            return;
        }

        // ── VERIFICATION SIGNED — §COR-COMPUTE (2026-08-03; re-landed 2026-08-04 after a
        // concurrent-edit revert during heavy multi-agent activity on this file — see
        // ENVELOPE-PIPELINE-FORENSIC-BLOCKER-ANALYSIS.md). The C58 confidence-cap fix
        // (`capEnvelopeConfidenceToPackDefault`, `ZoningRulesEngine.ts:264`) is confirmed landed —
        // the comment that used to block this branch on it was stale. `subzone` is already resolved
        // above (§COR-SUBZONE); no subzone means either outside the pilot or an unresolved lookup,
        // neither of which this branch can compute on, so it falls through to the coverage-gap
        // refusal exactly as before. MC is NOT special-cased here: its pack entries carry
        // `geometricRule: { kind: 'explicit-area', ringRef: CORDOBA_MC_FONDO_UNRESOLVED_RING }` with
        // no injected `explicitAreaFootprint` (no ring resolver exists for it — Córdoba publishes no
        // alineación to measure MC's per-street-width height table from), so `computeBuildableEnvelope`
        // hard-fails that rule on its own merits (ADR-0270) and MC refuses through the SAME path as
        // every other non-'ok' result below, not a bespoke branch. Proven live in
        // `apps/editor/__tests__/cordobaSiteDispatch.test.ts`'s §COR-COMPUTE suite — an OA-1 parcel
        // computes `status:'ok'`, an MC-3 parcel still structurally refuses, both against a resolved
        // subzone (not just typechecked, actually executed).
        if (subzone !== null) {
            const record: ZoningRecord = {
                zoneCode: subzone,
                zoneLabel: subzoneOrdenanza,
                jurisdictionId: CORDOBA_JURISDICTION_ID,
                // COACo's `coaco:ordenanzas` publishes no numeric buildable parameter — every number
                // comes from the transcribed pack (mirrors Murcia's identical `structuredFields: {}`).
                structuredFields: {},
                overlays: [],
                ordinanceRef: null,
                provenance: {
                    source: 'cordoba-pgou-2001',
                    label:
                        'PGOU de Córdoba (2001), Normativa de Usos, Ordenanzas y Urbanización — ' +
                        'machine-extracted, human-signed (VERIFICATION.md §SIG-1, 2026-08-03)',
                    version: '2001',
                    license: null,
                    crs: 'EPSG:4326',
                },
            };
            // ── §COR-MC-ANCHO (2026-08-04) — for MC-1..MC-4 ONLY, attempt to resolve the REAL
            // per-street-width height (Art. 13.5.3.1) BEFORE computing the envelope.
            //
            // ⚠⚠ THIS IS A HEIGHT CAPABILITY, NOT A FOOTPRINT ONE. Success swaps in a per-parcel
            // `cordobaMcResolvedPack` with `maxHeight_m`/`maxFloors` POPULATED instead of null —
            // but that pack's `geometricRule` is DELIBERATELY UNCHANGED, still `explicit-area` /
            // `CORDOBA_MC_FONDO_UNRESOLVED_RING` (see that constant's own header: Art. 13.5.2.4
            // leaves the *fondo edificable* unconstrained, but a block-fondo GEOMETRY source to
            // place the building within that constraint still does not exist — a separate,
            // out-of-scope capability). So `computeBuildableEnvelope` below still hard-refuses on
            // the footprint ground alone (ADR-0270) even when this branch succeeds — the resolved
            // height instead rides into the refusal's `knownFacts` as a cited, honest partial
            // answer (never a fabricated volume; C58 §1.4/§1.14.4). It becomes a full envelope for
            // free the day the footprint capability lands — nothing here needs to change then.
            //
            // Failure — no Catastro refcat, no dissolvable block, no opposing frontage, or an
            // ADR-0287 band-edge proximity — falls through UNCHANGED to the existing coverage-gap
            // refusal below, exactly as MC has always resolved (proven by the pre-existing
            // `cordobaSiteDispatch.test.ts` §COR-COMPUTE "MC-3 … STILL structurally refuses" case).
            let rulePackForCompute = ES_CORDOBA_PGOU2001_PACK;
            let mcHeightFact: string | null = null;
            const isMcZone: boolean =
                subzone === 'MC-1' || subzone === 'MC-2' || subzone === 'MC-3' || subzone === 'MC-4';
            if (isMcZone) {
                try {
                    const mcZone = subzone as CordobaMcZone;
                    // Independent point lookup — this branch is the ONLY Córdoba path that needs
                    // the parcel's own Catastro refcat, so it is fetched here rather than for
                    // every Córdoba parcel (keeps the base path's "no network at all" property).
                    const mcParcelFeat = await catastroParcelProvider.fetchParcelAtPoint(lon, lat);
                    const mcRing = Array.isArray(mcParcelFeat?.ring) ? mcParcelFeat.ring : null;
                    // §BLOCK-CENTROID-REUSE — hand the block fetch the centroid we already have.
                    const mcCentroid =
                        mcRing && mcRing.length >= 3
                            ? {
                                  lat: mcRing.reduce((s: number, p: LatLon) => s + p.lat, 0) / mcRing.length,
                                  lon: mcRing.reduce((s: number, p: LatLon) => s + p.lon, 0) / mcRing.length,
                              }
                            : undefined;
                    // FRAME — project + de-rotate about the SAME origin + θ the parcel boundary
                    // used, exactly as `applyBcnZoningThenFallback`'s `toAuthoringFrame` does.
                    const rawTheta = site.location.trueNorth;
                    const theta = Number.isFinite(rawTheta) ? rawTheta : 0;
                    const toAuthoringFrame = (p: LatLon): Pt => {
                        const xz = latLonToSceneXZ(p, site.location.latitude, site.location.longitude);
                        if (theta === 0) return { x: xz.x, z: xz.z };
                        const e = trueVectorToProjectNorth({ east: xz.x, north: -xz.z }, theta);
                        return { x: e.east, z: -e.north };
                    };
                    // §COR-STREET-WIDTH (2026-08-04) — try the PUBLISHED `idecordoba:manzana`
                    // block layer FIRST (ADR-0283/ADR-0290: published geometry outranks geometry
                    // PRYZM derives itself), falling back to the Catastro-dissolve resolver
                    // wherever the manzana layer does not cover this point. Both resolvers return
                    // an `{ ok, width_m, spread_m, authority, ... }` shape; normalised to ONE local
                    // interface here so the rest of this block (band lookup, pack build, refusal
                    // copy) does not need to know which resolver answered.
                    interface CordobaWidthResult {
                        readonly ok: boolean;
                        readonly width_m: number;
                        readonly spread_m: number;
                        readonly authority: string;
                        readonly manzana: string;
                        readonly reason: string;
                    }
                    const primaryWidth = await resolveCordobaStreetWidth(mcCentroid ?? null, {
                        parcelRingLonLat: mcRing?.map((p: LatLon) => [p.lon, p.lat] as const),
                    });
                    let width: CordobaWidthResult;
                    if (primaryWidth.ok) {
                        width = { ...primaryWidth, manzana: 'idecordoba:manzana', reason: '' };
                    } else {
                        console.log(
                            `${TAG} §COR-STREET-WIDTH manzana layer did not resolve ` +
                                `(${primaryWidth.reason}) — falling back to the Catastro ` +
                                'block-dissolve resolver.',
                        );
                        const fallback = await resolveCordobaMcStreetWidth(
                            mcParcelFeat?.refcat ?? null,
                            mcCentroid,
                            boundary.polygon,
                            toAuthoringFrame,
                        );
                        width = fallback.ok
                            ? { ...fallback, reason: '' }
                            : { ok: false, width_m: NaN, spread_m: NaN, authority: '', manzana: '', reason: fallback.reason };
                    }
                    if (width.ok) {
                        const height = resolveCordobaMcHeightForWidth(mcZone, width.width_m);
                        if (height.ok) {
                            rulePackForCompute = cordobaMcResolvedPack(
                                mcZone,
                                height,
                                `${width.authority} Measured ${width.width_m.toFixed(2)} m ` +
                                    `(± ${width.spread_m.toFixed(2)} m spread, manzana ` +
                                    `${width.manzana}).`,
                            );
                            const widthSourceLabel = primaryWidth.ok
                                ? 'CONSTRUCTED from the published idecordoba:manzana block layer'
                                : 'CONSTRUCTED from Catastro block-dissolve geometry (manzana fallback)';
                            mcHeightFact =
                                `Height (${CORDOBA_MC_HEIGHT_ARTICLE}): ${height.storeys} = ` +
                                `${height.maxHeight_m.toFixed(2)} m — measured street width ` +
                                `${width.width_m.toFixed(2)} m (± ${width.spread_m.toFixed(2)} m, ` +
                                `${widthSourceLabel}; ADR-0287 band-edge guard cleared). ⚠ The ` +
                                'buildable FOOTPRINT (fondo edificable) still has no resolved block ' +
                                'geometry, so this height alone cannot become a volume yet.';
                            console.log(
                                `${TAG} §COR-MC-ANCHO subzone=${mcZone} height RESOLVED ` +
                                    `${height.storeys}=${height.maxHeight_m}m ` +
                                    `(width=${width.width_m.toFixed(2)}m).`,
                            );
                        } else {
                            console.log(
                                `${TAG} §COR-MC-ANCHO subzone=${mcZone} width=` +
                                    `${width.width_m.toFixed(2)}m but height refused ` +
                                    `(${height.reason}) — falling through to the existing ` +
                                    `structural refusal.`,
                            );
                        }
                    } else {
                        console.log(
                            `${TAG} §COR-MC-ANCHO subzone=${mcZone} street width NOT measured ` +
                                `(${width.reason}) — falling through to the existing structural ` +
                                `refusal.`,
                        );
                    }
                } catch (e) {
                    // Never allowed to cost the (already-honest) refusal path.
                    console.warn(`${TAG} §COR-MC-ANCHO failed (non-fatal) — height omitted:`, e);
                }
            }

            const envelope = computeBuildableEnvelope({
                parcelRing: boundary.polygon,
                edgeClassifications: boundary.edgeClassifications,
                zoning: record,
                rulePack: rulePackForCompute,
            });
            if (envelope.status === 'ok') {
                dispatchEnvelope(ctx, site.id, envelope, 'coaco-pgou');
                console.log(
                    `${TAG} §COR-COMPUTE subzone=${subzone} — RENDERED a signed envelope at ` +
                        `${envelope.confidence ?? 'n/a'}. area=${parcelAreaM2?.toFixed(0) ?? 'n/a'} m².`,
                );
                return;
            }
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(
                    subzone,
                    {
                        code: 'source-data-unavailable',
                        headline:
                            `${subzone}: the PGOU's own conditions leave no buildable footprint on ` +
                            'this parcel.',
                        detail:
                            envelope.refusal?.detail ??
                            'The signed ordenanza does not resolve to a buildable ring here ' +
                                '(e.g. MC\'s per-street-width height table has no alignment to ' +
                                'measure from — Art. 13.5.3.1).',
                        ordinanceRef: null,
                        // FALSE: the ordenanza answers; this is a fact about THIS parcel/rule, not
                        // an unresolved-ordinance state (mirrors Murcia's identical annotation).
                        legallyGrounded: false,
                        // §COR-MC-ANCHO — when the height DID resolve, the refusal names it
                        // explicitly rather than reading as a blanket "nothing is known" card.
                        knownFacts: mcHeightFact ? [...knownFacts, mcHeightFact] : knownFacts,
                    },
                    'none',
                ),
                'coaco-pgou',
            );
            console.log(
                `${TAG} §COR-COMPUTE subzone=${subzone} — compute did not resolve to 'ok' ` +
                    `(status=${envelope.status}); dispatched a cited refusal, not a fallback estimate.`,
            );
            return;
        }
        console.warn(
            `${TAG} verification is signed but no subzone resolved (${subzoneNote ?? 'unknown reason'}) ` +
                `— dispatching the coverage-gap refusal.`,
        );
        const coverageGap = cordobaNoRulePackRefusal(subzone ?? CORDOBA_PILOT_ZONE_CODE, null, knownFacts);
        dispatchEnvelope(
            ctx,
            site.id,
            buildRefusedEnvelope(subzone ?? CORDOBA_PILOT_ZONE_CODE, coverageGap, 'none'),
            'coaco-pgou',
        );
    } catch (e) {
        console.warn(`${TAG} Córdoba path failed (non-fatal) — falling back to estimated default:`, e);
        try { applyEstimatedZoning(ctx, estimated); } catch { /* estimated is best-effort too */ }
    }
}

/**
 * §COR-TRACED-ZONE (2026-08-05) — Córdoba land OUTSIDE the COACo Sur+Noroeste pilot, resolved
 * against PRYZM's OWN hand-traced CUS-sheet geometry (`resolveCordobaTracedZone`,
 * `@pryzm/site-parcel-data`) instead of a live COACo WFS answer.
 *
 * ⚠⚠ THIS IS A SEPARATE, INDEPENDENTLY-GATED CAPABILITY FROM THE PILOT ABOVE. It reads
 * `CORDOBA_TRACED_ZONES_VERIFIED`, NOT `CORDOBA_ENVELOPE_VERIFIED` — the two flags certify two
 * different claims (see `resolveCordobaTracedZone.ts`'s header: OCR-transcription accuracy vs.
 * hand-traced-geometry accuracy) and must never be conflated. `CORDOBA_TRACED_ZONES_VERIFIED`
 * defaults `false`, unsigned, exactly like the pilot's own gate did before its 2026-08-03 sign-off —
 * so THIS branch renders no number today, and calling it costs nothing: a miss, a refusal, or the
 * closed gate all fall straight through to `applyEstimatedZoning`, which is EXACTLY what would have
 * run had this function not been wired in at all (the §L-663 registry guard there still converts a
 * Córdoba-municipality point into the existing `estimateSuppressedRefusal` — see that function's own
 * header). Wiring this branch in is therefore, by construction, a no-op on current production
 * behaviour until a human flips the gate — the property `resolveCordobaTracedZoneThenFallback`'s own
 * test suite pins directly, not just by inspection.
 *
 * `deps.verifiedOverride` exists ONLY so a test can exercise the gate-open compute path without
 * mutating the real committed `CORDOBA_TRACED_ZONES_VERIFIED` constant — mirrors the injectable-deps
 * pattern every resolver in this file already uses (`CordobaSubzoneDeps.fetchImpl` etc.), applied to
 * a boolean gate instead of a fetch. Production code NEVER passes it; the call site below omits it,
 * so production always reads the real (currently `false`) exported flag.
 */
async function applyCordobaTracedZoneThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    estimated: BuildableEnvelope | null,
    deps: { verifiedOverride?: boolean } = {},
): Promise<void> {
    const TAG = '[gis][c58] §COR-TRACED-ZONE';
    try {
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        const site = ctx.store.getSite();
        if (!site) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }

        const verified = deps.verifiedOverride ?? CORDOBA_TRACED_ZONES_VERIFIED;
        if (!verified) {
            // ⚠⚠⚠ THE HONESTY GATE (this capability's own, independent one). Unverified → fall
            // through to the NEXT-WEAKEST source (§COR-RASTER-ZONE), which is itself gated OFF and
            // therefore falls through in turn to whatever a Córdoba-outside-pilot point already
            // resolves to today (the §L-663 estimate-suppression refusal) — NEVER a number from
            // traced geometry.
            console.log(
                `${TAG} §HONESTY-GATE CORDOBA_TRACED_ZONES_VERIFIED=false — no traced-geometry ` +
                    'lookup performed; falling through to the raster-classified source. ' +
                    'Signs off via a founder-authorized VERIFICATION.md entry for THIS capability ' +
                    '(never inherits the pilot\'s CORDOBA_ENVELOPE_VERIFIED sign-off).',
            );
            await applyCordobaRasterClassifiedZoneThenFallback(ctx, boundary, lat, lon, estimated);
            return;
        }

        let traced: Awaited<ReturnType<typeof resolveCordobaTracedZone>>;
        try {
            traced = await resolveCordobaTracedZone({ lat, lon });
        } catch (e) {
            console.warn(`${TAG} resolveCordobaTracedZone failed (non-fatal):`, e);
            await applyCordobaRasterClassifiedZoneThenFallback(ctx, boundary, lat, lon, estimated);
            return;
        }
        if (!traced.ok) {
            console.log(
                `${TAG} traced-zone lookup did not resolve (${traced.reason}) — falling through to ` +
                    'the raster-classified source.',
            );
            await applyCordobaRasterClassifiedZoneThenFallback(ctx, boundary, lat, lon, estimated);
            return;
        }

        const knownFacts = [
            `Location: Córdoba (${lat.toFixed(5)}, ${lon.toFixed(5)}) — outside the COACo Sur+Noroeste pilot`,
            `Traced zone: ${traced.resolution.zoneCode} (sheet ${traced.resolution.sourceSheet}, ` +
                `traced ${traced.resolution.tracedDate})`,
            `⚠ Provenance: ${traced.resolution.provenance}`,
        ];

        const record: ZoningRecord = {
            zoneCode: traced.resolution.zoneCode,
            zoneLabel: traced.resolution.zoneCode,
            jurisdictionId: CORDOBA_JURISDICTION_ID,
            structuredFields: {},
            overlays: [],
            ordinanceRef: null,
            provenance: {
                source: 'cordoba-pgou-2001-traced',
                label:
                    "PGOU de Córdoba (2001) — zone GEOMETRY from PRYZM's own hand-traced CUS-sheet " +
                    'reading, not a COACo/GMU publication (ordinance NUMBERS still come from the ' +
                    'human-signed pack, VERIFICATION.md §SIG-1). ' + traced.resolution.provenance,
                version: '2001',
                license: null,
                crs: 'EPSG:4326',
            },
        };

        const envelope = computeBuildableEnvelope({
            parcelRing: boundary.polygon,
            edgeClassifications: boundary.edgeClassifications,
            zoning: record,
            rulePack: ES_CORDOBA_PGOU2001_PACK,
        });

        if (envelope.status === 'ok') {
            dispatchEnvelope(ctx, site.id, envelope, 'coaco-pgou-traced');
            console.log(
                `${TAG} §COR-TRACED-COMPUTE zone=${traced.resolution.zoneCode} — RENDERED a ` +
                    `traced-geometry-sourced envelope at ${envelope.confidence ?? 'n/a'}.`,
            );
            return;
        }

        dispatchEnvelope(
            ctx,
            site.id,
            buildRefusedEnvelope(
                traced.resolution.zoneCode,
                {
                    code: 'source-data-unavailable',
                    headline:
                        `${traced.resolution.zoneCode}: the PGOU's own conditions leave no buildable ` +
                        'footprint on this parcel.',
                    detail:
                        envelope.refusal?.detail ??
                        'The signed ordenanza does not resolve to a buildable ring here.',
                    ordinanceRef: null,
                    legallyGrounded: false,
                    knownFacts,
                },
                'none',
            ),
            'coaco-pgou-traced',
        );
        console.log(
            `${TAG} §COR-TRACED-COMPUTE zone=${traced.resolution.zoneCode} — compute did not ` +
                `resolve to 'ok' (status=${envelope.status}); dispatched a cited refusal.`,
        );
    } catch (e) {
        console.warn(
            `${TAG} Córdoba traced-zone path failed (non-fatal) — falling back to estimated default:`,
            e,
        );
        try { applyEstimatedZoning(ctx, estimated); } catch { /* estimated is best-effort too */ }
    }
}

/**
 * §COR-RASTER-ZONE (2026-08-05) — the THIRD and weakest Córdoba zone-identity source: zone FAMILIES
 * machine-classified from the PGOU-2001 CUS calificación sheets' colour fields and snapped to
 * Catastro parcels (`resolveCordobaRasterClassifiedZone`, `@pryzm/site-parcel-data`).
 *
 * Reached only after BOTH stronger sources decline: the COACo pilot (`isInCordoba`, live published
 * geometry) never routes here, and this runs only when the hand-traced store misses or its gate is
 * shut. Source hierarchy, weakest last:
 *     coaco:ordenanzas WFS  >  PRYZM hand-trace  >  THIS  >  refusal
 *
 * ⚠⚠ IT NEVER COMPUTES A NUMBER, AND CANNOT — this is a structural property, not a gate setting.
 * The CUS legend has one swatch per zone FAMILY, so classification is family-level; the SUBZONE
 * digit, which is what actually selects parameters, is printed as a bare rotated numeral that is not
 * machine-recoverable (measured — see the resolver's header and the findings doc). And the subzones
 * are not interchangeable in `ES_CORDOBA_PGOU2001_PACK`: OA-1 is FAR 1.4 against OA-2's 1.6; MC's
 * footprint is structurally unresolved in every subzone (`CORDOBA_MC_FONDO_UNRESOLVED_RING`). So the
 * BEST outcome available on this path is a refusal that NAMES the family instead of speaking
 * generically — "this land reads as Manzana Cerrada on sheet CUS41W, and PRYZM cannot determine
 * which MC subzone applies". Guessing a subzone to reach a number would be exactly the fabrication
 * §CONTEXT-DATA-HONESTY exists to prevent. There is deliberately NO call to
 * `computeBuildableEnvelope` anywhere in this function.
 *
 * ⚠⚠ IT IS INDEPENDENTLY GATED, AND THE GATE IS SHUT. `CORDOBA_RASTER_CLASSIFIED_ZONES_VERIFIED`
 * defaults `false` and must never read `CORDOBA_ENVELOPE_VERIFIED` (OCR of the ordinance NUMBER
 * tables — signed) or `CORDOBA_TRACED_ZONES_VERIFIED` (hand-traced GEOMETRY — unsigned). Three
 * claims, three failure modes, three gates. While shut — and the committed record set is EMPTY
 * besides — this function is a doubly-documented no-op: it falls straight through to
 * `applyEstimatedZoning`, exactly what running with no such branch at all would do. Its test suite
 * pins that property directly rather than asserting it by inspection.
 *
 * `deps.verifiedOverride` exists ONLY so a test can exercise the gate-open path without mutating the
 * real committed constant — the same injectable-deps pattern `applyCordobaTracedZoneThenFallback`
 * uses. Production never passes it.
 */
async function applyCordobaRasterClassifiedZoneThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    estimated: BuildableEnvelope | null,
    deps: { verifiedOverride?: boolean } = {},
): Promise<void> {
    const TAG = '[gis][c58] §COR-RASTER-ZONE';
    try {
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        const site = ctx.store.getSite();
        if (!site) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }

        const verified = deps.verifiedOverride ?? CORDOBA_RASTER_CLASSIFIED_ZONES_VERIFIED;
        if (!verified) {
            console.log(
                `${TAG} §HONESTY-GATE CORDOBA_RASTER_CLASSIFIED_ZONES_VERIFIED=false — no ` +
                    'machine-classified lookup performed; falling through to the existing ' +
                    'Córdoba-outside-pilot handling.',
            );
            applyEstimatedZoning(ctx, estimated);
            return;
        }

        let classified: Awaited<ReturnType<typeof resolveCordobaRasterClassifiedZone>>;
        try {
            classified = await resolveCordobaRasterClassifiedZone({ lat, lon });
        } catch (e) {
            console.warn(`${TAG} resolveCordobaRasterClassifiedZone failed (non-fatal):`, e);
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        if (!classified.ok) {
            console.log(
                `${TAG} raster-classified lookup did not resolve (${classified.reason}) — falling ` +
                    'through to the existing Córdoba-outside-pilot handling.',
            );
            applyEstimatedZoning(ctx, estimated);
            return;
        }

        const { zoneFamily, sourceSheet, refcat, evidence, provenance } = classified.resolution;
        const FAMILY_LABEL: Record<string, string> = {
            MC: 'Manzana Cerrada',
            OA: 'Ordenación Abierta',
        };
        const label = FAMILY_LABEL[zoneFamily] ?? zoneFamily;

        // Every fact below is one this pipeline actually MEASURED for this parcel or this sheet.
        // There is no aggregate confidence float: §12.3 measured errors at confidence 1.000 on every
        // validated sheet and found confidence gating non-monotonic, so such a number would look
        // like a safety mechanism without being one.
        const knownFacts = [
            `Location: Córdoba (${lat.toFixed(5)}, ${lon.toFixed(5)}) — outside the COACo ` +
                'Sur+Noroeste vectorised pilot',
            `Zone FAMILY read from PGOU-2001 sheet ${sourceSheet}: ${label} (${zoneFamily})`,
            `Catastro parcel: ${refcat}`,
            `Evidence: ${evidence.winningPixels}/${evidence.classifiedPixels} classified pixels ` +
                `voted ${zoneFamily}; nearest legend swatch at Chebyshev ` +
                `${evidence.nearestLegendChebyshev}` +
                (evidence.runnerUpFamily ? `; runner-up ${evidence.runnerUpFamily}` : '; unanimous') +
                `; sheet georeference residual ${evidence.georefResidualPx} px (${evidence.sourceCrs})`,
            'SUBZONE: NOT determined. The sheet encodes the family by colour only; the subzone digit ' +
                'is not machine-readable, and the subzones do not share parameters.',
            `⚠ Provenance: ${provenance}`,
        ];

        dispatchEnvelope(
            ctx,
            site.id,
            buildRefusedEnvelope(
                zoneFamily,
                {
                    code: 'no-rule-pack',
                    headline:
                        `${label} — PRYZM can read the zone FAMILY for this parcel, but not the ` +
                        'subzone that binds the numbers.',
                    detail:
                        `PRYZM reconstructed this parcel's ordenanza family (${label}) from the ` +
                        `Ayuntamiento's own PGOU-2001 calificación sheet ${sourceSheet} by colour ` +
                        'classification — this is PRYZM\'s machine reading of a scanned map, NOT a ' +
                        'municipal publication, and no COACo or GMU service publishes a zone polygon ' +
                        'for this land. Even taking the family as correct, the PGOU sets its buildable ' +
                        'parameters PER SUBZONE, and the subzone is not recoverable from the sheet: ' +
                        'the legend carries one colour per family, and the subzone number printed on ' +
                        'the map is not machine-readable. Choosing a subzone would change the answer ' +
                        'materially, so PRYZM names what it can read and shows no envelope rather ' +
                        'than a number the ordinance does not support for this parcel.',
                    ordinanceRef: null,
                    legallyGrounded: false,
                    knownFacts,
                },
                'none',
            ),
            'coaco-pgou-raster-classified',
        );
        console.log(
            `${TAG} §COR-RASTER-REFUSAL family=${zoneFamily} sheet=${sourceSheet} — dispatched a ` +
                'family-NAMED refusal. No number is computed on this path by construction.',
        );
    } catch (e) {
        console.warn(
            `${TAG} Córdoba raster-classified path failed (non-fatal) — falling back to estimated ` +
                'default:',
            e,
        );
        try { applyEstimatedZoning(ctx, estimated); } catch { /* estimated is best-effort too */ }
    }
}

/**
 * §SEVILLA-ENVELOPE — the Sevilla (INE 41091) path.
 *
 * ⚠ 2026-08-05 — this header used to say "Sevilla has ZERO transcribed PGOU-2006 ordinance
 * parameters (`ES_SEVILLA_PGOU_PACK.zones` is empty by construction)". That was the 2026-08-03
 * state and is no longer true: `esSevilla.ts` packs ALL FIFTEEN live `zona_orden` codes, five with
 * real footprints, and `SEVILLA_ENVELOPE_VERIFIED` is signed — see `§SEV-COMPUTE` below, the one
 * branch that actually computes.
 *
 * The ZONE IDENTITY half is live and unchanged: the city's own ArcGIS "Calificación" service
 * (layer 25, EPSG:25830 — CONFIRMED live) resolves `zona_orden` for any point
 * (`resolveSevillaZone`), and this path resolves the real zone FIRST — before `§SEV-COMPUTE` and
 * before any refusal — exactly as `applyCordobaZoningThenFallback` resolves the subzone first, so
 * whichever outcome is reached names the real zone instead of speaking generically.
 *
 * Fully guarded: any problem falls back to the precomputed estimated envelope; never throws into
 * the commit path. `status: 'none'` on the refusal keeps every numeric field null and clears any
 * stale `buildableRing` (`dispatchEnvelope` writes a ring only on `'ok'`).
 */
async function applySevillaZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    estimated: BuildableEnvelope | null,
): Promise<void> {
    const TAG = '[gis][c58] §SEVILLA-ENVELOPE';
    // The FALLBACK zone code for the refusal envelope, used only when the ArcGIS `zona_orden`
    // does not resolve. `zoneCode` is required (min length 1); this names the municipality, not a
    // real zone, and no number rides on it either way.
    const SEVILLA_UNRESOLVED_ZONE_CODE = 'sevilla-pgou-2006-unresolved';
    try {
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        const site = ctx.store.getSite();
        if (!site) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }

        // ── Resolve the real zona_orden BEFORE dispatching the refusal ─────────────────────────
        // ⚠ THIS RESOLVES DATA, IT DOES NOT DECIDE TO RENDER. `SEVILLA_ENVELOPE_VERIFIED` is
        // false below regardless of what resolves, so a resolved zone binds NO number — it only
        // lets the refusal say WHICH zone refused, rather than speak about Sevilla generically.
        let zonaOrden: string | null = null;
        let zoneNote: string | null = null;
        try {
            const z = await resolveSevillaZone({ lat, lon });
            if (z.ok) {
                zonaOrden = z.resolution.zonaOrden;
            } else if (z.reason === 'no-zone-here') {
                zoneNote =
                    'Sevilla\'s own "Calificación" service answered but assigns no zone polygon to ' +
                    'this exact point.';
            } else {
                zoneNote =
                    `Zone NOT resolved (${z.reason}) — this is an unknown, not an absence of planning.`;
            }
        } catch (e) {
            console.warn(`${TAG} resolveSevillaZone failed (non-fatal):`, e);
            zoneNote = 'Zone NOT resolved (resolver error) — this is an unknown, not an absence of planning.';
        }

        const knownFacts = [
            `Location: Sevilla (${lat.toFixed(5)}, ${lon.toFixed(5)})`,
            zonaOrden !== null
                ? `Calificación: zona_orden ${zonaOrden} (ArcGIS Info_Urban_Groups/PGOU, EPSG:25830)`
                : null,
            zoneNote,
            'Planning source: Ayuntamiento de Sevilla PGOU-2006 — no ordinance parameters transcribed',
        ].filter((s): s is string => typeof s === 'string');

        // ── §STAGING-UNCERTIFIED-PREVIEW (L-449) — SB's real fondo geometry, staging-only. ────
        //
        // Confirmed live 2026-08-04: Sevilla's `fondo máximo edificable` (Art. 12.5.6) is REAL,
        // queryable ArcGIS polyline geometry (layer 4 "Alineaciones", `A_INTERIOR-MAXIMA`, 28
        // features), not merely a cartographic legend entry — the fact
        // `SEVILLA_SB_FONDO_UNRESOLVED_RING`'s structural refusal assumed was unresolved when it
        // shipped. `resolveSevillaAlignments` + `clipParcelByFondoLine` construct the buildable
        // footprint Art. 12.5.6 itself describes ("build until this line") instead of hard-refusing
        // for want of a scalar depth. `SEVILLA_ENVELOPE_VERIFIED` is still read as `false` below and
        // nothing here writes to it — same triple-gated, non-production-only exception as Telde/El
        // Sauzal's identical blocks (`isUncertifiedPreviewModeActive`).
        const sevillaZoneCode = zonaOrden?.split(/[:\s]/)[0]?.trim().toUpperCase() ?? null;
        if (
            isUncertifiedPreviewModeActive() &&
            sevillaZoneCode !== null &&
            SEVILLA_PGOU_ZONE_CODES.includes(sevillaZoneCode)
        ) {
            try {
                const alignments = await resolveSevillaAlignments({ lat, lon });
                if (alignments.ok) {
                    const origin = { lat: site.location.latitude, lon: site.location.longitude };
                    const rawTheta = site.location.trueNorth;
                    const theta = Number.isFinite(rawTheta) ? rawTheta : 0;
                    const toAuthoringFrame = (p: LatLon): Pt => {
                        const xz = latLonToSceneXZ(p, origin.lat, origin.lon);
                        if (theta === 0) return { x: xz.x, z: xz.z };
                        const e = trueVectorToProjectNorth({ east: xz.x, north: -xz.z }, theta);
                        return { x: e.east, z: -e.north };
                    };
                    const parcelRing = boundary.polygon;
                    const cx = parcelRing.reduce((s, p) => s + p.x, 0) / parcelRing.length;
                    const cz = parcelRing.reduce((s, p) => s + p.z, 0) / parcelRing.length;
                    const frontIdx = boundary.edgeClassifications.findIndex((c) => c === 'front');
                    const keepSideRef =
                        frontIdx >= 0
                            ? {
                                  x: (parcelRing[frontIdx]!.x + parcelRing[(frontIdx + 1) % parcelRing.length]!.x) / 2,
                                  z: (parcelRing[frontIdx]!.z + parcelRing[(frontIdx + 1) % parcelRing.length]!.z) / 2,
                              }
                            : { x: cx, z: cz };
                    const nearest = nearestFondoLine(
                        alignments.fondoLines,
                        (lon2, lat2) => toAuthoringFrame({ lat: lat2, lon: lon2 }),
                        { x: cx, z: cz },
                    );
                    const clipped = nearest
                        ? clipParcelByFondoLine(parcelRing, nearest.projected, keepSideRef)
                        : null;
                    if (clipped) {
                        const zone = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === sevillaZoneCode);
                        const record: ZoningRecord = {
                            zoneCode: sevillaZoneCode,
                            zoneLabel: zone?.label ?? null,
                            jurisdictionId: SEVILLA_JURISDICTION_ID,
                            structuredFields: {},
                            overlays: [],
                            ordinanceRef: zone?.ordinanceRef ?? null,
                            provenance: {
                                source: 'sevilla-arcgis-alineaciones',
                                label:
                                    'PGOU Sevilla 2006 Art. 12.5.6 fondo máximo edificable — real ' +
                                    'ArcGIS geometry, UNSIGNED reading (§STAGING-UNCERTIFIED-PREVIEW)',
                                version: '2006',
                                license: null,
                                crs: 'EPSG:25830',
                            },
                        };
                        const previewEnvelope = computeBuildableEnvelope({
                            parcelRing: boundary.polygon,
                            edgeClassifications: boundary.edgeClassifications,
                            zoning: record,
                            rulePack: ES_SEVILLA_PGOU_PACK,
                            explicitAreaFootprint: clipped,
                        });
                        if (previewEnvelope.status === 'ok') {
                            const watermarked = {
                                ...previewEnvelope,
                                publicationPosture: 'uncertified-preview' as const,
                                caveats: [
                                    uncertifiedPreviewCaveat(`Sevilla PGOU ${sevillaZoneCode}`),
                                    ...previewEnvelope.caveats,
                                ],
                            };
                            dispatchEnvelope(ctx, site.id, watermarked, SEVILLA_JURISDICTION_ID);
                            console.log(
                                `${TAG} §STAGING-UNCERTIFIED-PREVIEW zone=${sevillaZoneCode} — rendered ` +
                                    'an UNCERTIFIED preview from real fondo geometry (SEVILLA_ENVELOPE_' +
                                    'VERIFIED remains false).',
                            );
                            return;
                        }
                    }
                }
            } catch (e) {
                console.warn(`${TAG} §STAGING-UNCERTIFIED-PREVIEW fondo resolve failed (non-fatal):`, e);
            }
        }

        // ── §SEV-COMPUTE (2026-08-05) — VERIFICATION SIGNED (sources/VERIFICATION.md §SIG-1).
        // `SEVILLA_ENVELOPE_VERIFIED` is now `true`; this branch is the ONE place that actually
        // uses it to compute rather than refuse. Mirrors Córdoba's `§COR-COMPUTE` shape exactly:
        // resolve first (already done above, unconditionally, so the refusal below can still name
        // the real zone on any path this branch does not take), gate second, compute third, and
        // fall through UNCHANGED to the existing refusal for the 9 zones that structurally refuse
        // (SB/CJ/M/IC/ST-C/ST-A/A/MP/CH — each ships an unresolvable geometry ring, per
        // esSevilla.ts) — `computeBuildableEnvelope` hard-fails those on its own merits, not a
        // bespoke branch here. No MC-style external geometry resolver is needed: every packed
        // Sevilla zone's `geometricRule` is either a plain stated setback or a deliberately
        // unresolvable ring, both of which `computeBuildableEnvelope` already handles from the
        // pack alone.
        if (SEVILLA_ENVELOPE_VERIFIED && sevillaZoneCode !== null) {
            const zone = ES_SEVILLA_PGOU_PACK.zones.find((z) => z.code === sevillaZoneCode);
            if (zone) {
                const record: ZoningRecord = {
                    zoneCode: sevillaZoneCode,
                    zoneLabel: zone.label ?? null,
                    jurisdictionId: SEVILLA_JURISDICTION_ID,
                    structuredFields: {},
                    overlays: [],
                    ordinanceRef: zone.ordinanceRef ?? null,
                    provenance: {
                        source: 'sevilla-pgou-2006',
                        label:
                            'PGOU de Sevilla (2006), Texto Refundido de la Normativa Urbanística — ' +
                            'machine-extracted, human-signed (VERIFICATION.md §SIG-1, 2026-08-05)',
                        version: '2006',
                        license: null,
                        crs: 'EPSG:4326',
                    },
                };
                const envelope = computeBuildableEnvelope({
                    parcelRing: boundary.polygon,
                    edgeClassifications: boundary.edgeClassifications,
                    zoning: record,
                    rulePack: ES_SEVILLA_PGOU_PACK,
                });
                if (envelope.status === 'ok') {
                    dispatchEnvelope(ctx, site.id, envelope, SEVILLA_JURISDICTION_ID);
                    console.log(
                        `${TAG} §SEV-COMPUTE zone=${sevillaZoneCode} — RENDERED a signed envelope ` +
                            `at ${envelope.confidence ?? 'n/a'}. insetAreaM2=${envelope.insetAreaM2 ?? 'n/a'}.`,
                    );
                    return;
                }
                dispatchEnvelope(
                    ctx,
                    site.id,
                    buildRefusedEnvelope(
                        sevillaZoneCode,
                        {
                            code: 'source-data-unavailable',
                            headline:
                                `${sevillaZoneCode}: the PGOU's own conditions leave no buildable ` +
                                'footprint on this parcel.',
                            detail:
                                envelope.refusal?.detail ??
                                'The signed ordenanza does not resolve to a buildable ring here — ' +
                                    'a conditional or per-graphic depth/occupation rule with no ' +
                                    'flat scalar this pack can honestly carry.',
                            ordinanceRef: zone.ordinanceRef ?? null,
                            legallyGrounded: true,
                            knownFacts: [
                                `Zone: ${sevillaZoneCode}${zone.label ? ` — ${zone.label}` : ''}`,
                                ...(envelope.refusal?.knownFacts ?? []),
                            ],
                        },
                        'none',
                    ),
                    SEVILLA_JURISDICTION_ID,
                );
                console.log(
                    `${TAG} §SEV-COMPUTE zone=${sevillaZoneCode} — structurally refused ` +
                        `(${envelope.status}), as designed. NO number rendered.`,
                );
                return;
            }
        }

        // ⚠⚠⚠ Fallback: SEVILLA_ENVELOPE_VERIFIED is false, or the zone did not resolve, or the
        // resolved zone is not in the pack (an unmapped zona_orden — should not happen against the
        // 15/15 live universe, but never assumed). Every such Sevilla parcel refuses, named by its
        // real zone when the ArcGIS lookup succeeded.
        const refusal = sevillaNoRulePackRefusal(zonaOrden, null, knownFacts);
        dispatchEnvelope(
            ctx,
            site.id,
            // The zone code is the RESOLVED zona_orden when we have one, so the refusal is
            // attributable to a real Calificación rather than a placeholder. `status: 'none'`
            // keeps every numeric field null (no ring is written).
            buildRefusedEnvelope(zonaOrden ?? SEVILLA_UNRESOLVED_ZONE_CODE, refusal, 'none'),
            SEVILLA_JURISDICTION_ID,
        );
        console.log(
            `${TAG} SEVILLA_ENVELOPE_VERIFIED=false — dispatched the no-rule-pack refusal; NO ` +
                `number rendered (${refusal.code}). zona_orden=${zonaOrden ?? 'unresolved'}.`,
        );
    } catch (e) {
        console.warn(`${TAG} Sevilla path failed (non-fatal) — falling back to estimated default:`, e);
        try { applyEstimatedZoning(ctx, estimated); } catch { /* estimated is best-effort too */ }
    }
}

/**
 * §ZGZ-ENVELOPE — the Zaragoza (INE 50297) path, on the Córdoba/Murcia precedent.
 *
 * Zaragoza's calificación resolves LIVE and at parcel precision (`resolveZaragozaZone` against
 * `urbanismo:Calificaciones_Urbanas` — §ZGZ-SUBGRADO, `esAragon.ts`), and `esZaragoza.ts` ships a
 * curated, page-cited pack for the 4 subgrados the transcription covers (A1/3.1, A1/3.2, A1/4.1,
 * A1/4.2). What is NOT yet true is a human sign-off: `ZARAGOZA_ENVELOPE_VERIFIED` is false until a
 * Spanish-planning-literate human signs `sources/VERIFICATION.md`, so this path renders NO number
 * today — it dispatches `zaragozaNoRulePackRefusal`, naming the resolved grade when the WFS answers
 * (never a placeholder pilot name once a real grade is known) and never a fabricated envelope.
 *
 * Fully guarded: any problem falls back to the precomputed estimated envelope; never throws into
 * the commit path. `status: 'none'` on the refusal keeps every numeric field null and clears any
 * stale `buildableRing` (`dispatchEnvelope` writes a ring only on `'ok'`).
 */
async function applyZaragozaZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    estimated: BuildableEnvelope | null,
): Promise<void> {
    const TAG = '[gis][c58] §ZGZ-ENVELOPE';
    const JURISDICTION_REF = 'idezar-calificaciones';
    /** Fallback zone code for the refusal envelope when the WFS does not resolve a grade. */
    const ZARAGOZA_FALLBACK_ZONE_CODE = 'zaragoza-pgou-2024';
    try {
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        const site = ctx.store.getSite();
        if (!site) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }

        const parcelAreaM2 = (() => {
            try {
                const ring = boundary.polygon;
                const a = Math.abs(
                    ring.reduce((acc, p, i) => {
                        const q = ring[(i + 1) % ring.length]!;
                        return acc + (p.x * q.z - q.x * p.z);
                    }, 0) / 2,
                );
                return Number.isFinite(a) && a > 0 ? a : null;
            } catch { return null; }
        })();

        // ── §ZGZ-ZONE — resolve the live calificación grade BEFORE the gate. ─────────────────
        //
        // ⚠⚠ THIS RESOLVES DATA, IT DOES NOT DECIDE TO RENDER. `ZARAGOZA_ENVELOPE_VERIFIED` is
        // still false below, so a resolved grade binds NO number — it only lets the refusal say
        // WHICH grade refused, exactly the same honesty property `resolveCordobaSubzone` documents.
        //
        // ⚠ A FAILURE AND AN EMPTY ANSWER ARE NOT THE SAME VALUE (§CONTEXT-DATA-HONESTY). `no-zone`
        // means the WFS answered and this point carries no `Calificaciones_Urbanas` polygon;
        // `endpoint-unreachable` means we do not know. Reported differently, and neither reads as
        // "there is no plan here".
        //
        // ⚠ A MATCHED-BUT-UNPACKED CODE (e.g. `A1/1`, `EQ`) IS NOT SILENTLY DROPPED. The resolver
        // returns the raw code regardless of pack membership (honesty property 3 on
        // `resolveZaragozaZone`); `packed` here is what THIS function computes from
        // `ZARAGOZA_ZONE_CODES`, purely to phrase the refusal — it is never used to discard a real
        // resolution.
        let zoneCode: string | null = null;
        let zoneDescripcion: string | null = null;
        let packed = false;
        let zoneNote: string | null = null;
        try {
            const z = await resolveZaragozaZone({ lat, lon });
            if (z.ok) {
                zoneCode = z.resolution.zoneCode;
                zoneDescripcion = z.resolution.descripcion;
                packed = (ZARAGOZA_ZONE_CODES as readonly string[]).includes(zoneCode);
                if (!packed) {
                    zoneNote =
                        `Calificación ${zoneCode} is outside the 4 subgrados PRYZM has transcribed ` +
                        '(A1/3.1, A1/3.2, A1/4.1, A1/4.2) — no rule exists for it yet, transcribed or not.';
                }
            } else if (z.reason === 'no-zone') {
                zoneNote =
                    'No `Calificaciones_Urbanas` polygon covers this point — outside Zaragoza\'s ' +
                    'published planned land (parks, infrastructure corridors and similar carry no ' +
                    'calificación code).';
            } else {
                zoneNote =
                    `Calificación NOT resolved (${z.reason}) — this is an unknown, not an absence of planning.`;
            }
        } catch (e) {
            console.warn(`${TAG} §ZGZ-ZONE resolve failed (non-fatal):`, e);
            zoneNote = 'Calificación NOT resolved (resolver error) — this is an unknown, not an absence of planning.';
        }

        const knownFacts = [
            `Location: Zaragoza (${lat.toFixed(5)}, ${lon.toFixed(5)}) — PGOU de Zaragoza 2024`,
            parcelAreaM2 !== null ? `Parcel area: ${Math.round(parcelAreaM2).toLocaleString()} m²` : null,
            zoneCode !== null
                ? `Calificación: ${zoneDescripcion ? `${zoneDescripcion} — ` : ''}${zoneCode} ` +
                  '(IDEZar «urbanismo:Calificaciones_Urbanas», EPSG:25830)'
                : null,
            zoneNote,
            'Planning source: Ayuntamiento de Zaragoza PGOU-2024 (IDEZar) — live, parcel-precise; ' +
                'transcription unsigned',
        ].filter((s): s is string => typeof s === 'string');

        if (!ZARAGOZA_ENVELOPE_VERIFIED) {
            // ── §ZGZ-OPEN-TOP-INDICATIVE — THE SECOND DRAWING ARM. Same posture pattern as Balears
            // (`applyBalearsZoningThenFallback`): `envelopePublicationPosture` is the ONE decision
            // point, consulting the L-449 gate (still shut) AND the open-top registry.
            // `ZARAGOZA_OPEN_TOP_INDICATIVE` (`openTopIndicative.ts`) is BUILT and CORRECT but
            // deliberately UNLISTED in `OPEN_TOP_INDICATIVE_JURISDICTIONS` — no founder authorisation
            // for Zaragoza has been recorded the way §BALEARS-LISTING was, so `posture.posture` is
            // `'refused'` for Zaragoza today and this whole block falls through to the honesty-gate
            // refusal below, unchanged. Listing Zaragoza later needs a ONE-LINE registry edit and NO
            // edit here (§MURCIA-GATE-BYPASS-REGRESSION).
            const posture = envelopePublicationPosture(ZARAGOZA_JURISDICTION_ID);
            const indicativeDrawable =
                posture.posture === 'open-top-indicative' && rendererCanExpressOpenTop;
            if (indicativeDrawable && zoneCode !== null && packed) {
                const indicative = tryZaragozaIndicativeEnvelope(
                    zoneCode as ZaragozaZoneCode,
                    zoneDescripcion,
                    boundary,
                    posture.openTop!,
                );
                if (indicative) {
                    dispatchEnvelope(ctx, site.id, indicative, JURISDICTION_REF);
                    console.log(
                        `${TAG} §OPEN-TOP-INDICATIVE zoneCode=${zoneCode} — RENDERED an indicative ` +
                            `envelope (posture=open-top-indicative, NO buildable right claimed). ` +
                            `area=${parcelAreaM2?.toFixed(0) ?? 'n/a'} m².`,
                    );
                    return;
                }
                console.log(
                    `${TAG} §OPEN-TOP-INDICATIVE zoneCode=${zoneCode} could not be drawn (see the ` +
                        `warning above) — falling through to the honesty-gate refusal.`,
                );
            }

            // ⚠⚠⚠ THE HONESTY GATE — ⛔ DO NOT FLIP `ZARAGOZA_ENVELOPE_VERIFIED` HERE OR ANYWHERE
            // ELSE. A signature is a founder act (L-449); a model flipping it is the L-677 defect,
            // restated in `esAragon.ts`. `status: 'none'` = attempted, value WITHHELD pending a
            // human transcription + sign-off (NOT `'not-applicable'`, which would assert the
            // ordinance grants no envelope — arts. 4.1.12/4.1.13/4.1.15/4.1.17 DO grant one).
            const refusal = zaragozaNoRulePackRefusal(zoneCode, zoneDescripcion, knownFacts);
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(zoneCode ?? ZARAGOZA_FALLBACK_ZONE_CODE, refusal, 'none'),
                JURISDICTION_REF,
            );
            console.log(
                `${TAG} §HONESTY-GATE ZARAGOZA_ENVELOPE_VERIFIED=false — dispatched the no-signed-` +
                    `rule refusal; NO number rendered (${refusal.code}). zoneCode=${zoneCode ?? 'unresolved'} ` +
                    `packed=${packed} area=${parcelAreaM2?.toFixed(0) ?? 'n/a'} m². ` +
                    `Signs off via sources/VERIFICATION.md.`,
            );
            return;
        }

        // ── VERIFICATION SIGNED (future). Only a PACKED grade (A1/3.1, A1/3.2, A1/4.1, A1/4.2) may
        // compute — an unpacked but resolved code (e.g. `A1/1`) still refuses on its own merits,
        // never borrows another subgrado's numbers.
        if (zoneCode !== null && packed) {
            const packZone = ES_ZARAGOZA_PGOU2024_PACK.zones.find((z) => z.code === zoneCode);
            const record: ZoningRecord = {
                zoneCode,
                zoneLabel: packZone?.label ?? zoneDescripcion ?? null,
                jurisdictionId: ZARAGOZA_JURISDICTION_ID,
                // Zaragoza's calificación WFS publishes NO numeric buildable parameter — every
                // number comes from the transcribed pack, so there is nothing structured to pass.
                structuredFields: {},
                overlays: [],
                ordinanceRef: packZone?.ordinanceRef ?? null,
                provenance: {
                    source: 'zaragoza-pgou-2024',
                    label:
                        'PGOU de Zaragoza 2024, Normas Urbanísticas, Título Cuarto — human/agent-' +
                        'transcribed, page-cited',
                    version: '2024-03',
                    license: null,
                    crs: 'EPSG:4326',
                },
            };
            const envelope = computeBuildableEnvelope({
                parcelRing: boundary.polygon,
                edgeClassifications: boundary.edgeClassifications,
                zoning: record,
                rulePack: ES_ZARAGOZA_PGOU2024_PACK,
            });
            if (envelope.status === 'ok') {
                dispatchEnvelope(ctx, site.id, envelope, JURISDICTION_REF);
                console.log(
                    `${TAG} zoneCode=${zoneCode} — RENDERED a signed envelope at ` +
                        `${envelope.confidence ?? 'n/a'}. area=${parcelAreaM2?.toFixed(0) ?? 'n/a'} m².`,
                );
                return;
            }
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(
                    zoneCode,
                    {
                        code: 'source-data-unavailable',
                        headline:
                            `${zoneCode}${packZone ? ` — ${packZone.label}` : ''}: the transcribed ` +
                            'ordinance leaves no buildable footprint on this parcel.',
                        detail:
                            'PRYZM applied the transcribed, signed A1 subgrado rule to your parcel ' +
                            'boundary and the resulting footprint is empty — typically a plot ' +
                            'narrower than the ordinance\'s alignment/party-wall geometry permits. ' +
                            'PRYZM will not substitute an estimated figure to avoid showing an ' +
                            'empty result.',
                        ordinanceRef: packZone?.ordinanceRef ?? null,
                        legallyGrounded: false,
                        knownFacts,
                    },
                    'none',
                ),
                JURISDICTION_REF,
            );
            console.log(
                `${TAG} zoneCode=${zoneCode} produced status=${envelope.status} — dispatched the ` +
                    `empty-footprint refusal. NO number rendered.`,
            );
            return;
        }

        // Verified but unpacked/unresolved — the coverage-gap refusal, never a guessed number.
        const coverageGap = zaragozaNoRulePackRefusal(zoneCode, zoneDescripcion, knownFacts);
        dispatchEnvelope(
            ctx,
            site.id,
            buildRefusedEnvelope(zoneCode ?? ZARAGOZA_FALLBACK_ZONE_CODE, coverageGap, 'none'),
            JURISDICTION_REF,
        );
    } catch (e) {
        console.warn(`${TAG} Zaragoza path failed (non-fatal) — falling back to estimated default:`, e);
        try { applyEstimatedZoning(ctx, estimated); } catch { /* estimated is best-effort too */ }
    }
}

/**
 * §ZGZ-OPEN-TOP-INDICATIVE — compute ONE indicative envelope for a packed Zaragoza subgrado, or
 * return `null` on ANY miss (the caller keeps the cited `zaragozaNoRulePackRefusal`; an absent
 * indicative draw costs nothing, a wrong one costs credibility — the same discipline every other
 * best-effort branch in this file follows).
 *
 * TWO SHAPES, BECAUSE THE ORDINANCE HAS TWO SHAPES (see `esZaragoza.ts`'s own header):
 *   • A1/4.1 / A1/4.2 — FIXED scalars. `ES_ZARAGOZA_PGOU2024_PACK` already carries the numbers;
 *     this just runs the engine against it, exactly like the (unreachable, gate-shut) determination
 *     branch above would once `ZARAGOZA_ENVELOPE_VERIFIED` flips.
 *   • A1/3.1 / A1/3.2 — STREET-WIDTH DEPENDENT. `resolveZaragozaStreetWidth()` is called with NO
 *     geometry deps, which is a DELIBERATE, HONEST `'not-wired'` refusal in production today (see
 *     that module's header: no live Zaragoza block/parcel neighbourhood source exists, and
 *     `esAragon.ts`'s `§ZGZ-ALIGNMENT-CANDIDATE` is exactly why one has not been adopted). So these
 *     two zones ALWAYS return `null` here until a future author wires a geometry source into the
 *     call below — this is NOT a bug, it is condition 4 of the Murcia precedent applied one level
 *     earlier: refuse rather than guess a band.
 *
 * Every success carries `publicationPosture: 'open-top-indicative'`, the open-top's
 * `missingConstraints` as caveats, and the ADR-0293 claim sentence — the exact stamp
 * `applyBalearsZoningThenFallback` applies, duplicated here rather than factored out because the
 * two callers differ in exactly the fields that matter (zoning record, rule pack, roadmap line) and
 * a shared helper would need to take all of them as parameters anyway.
 */
function tryZaragozaIndicativeEnvelope(
    zoneCode: ZaragozaZoneCode,
    zoneDescripcion: string | null,
    boundary: ZoningBoundary,
    openTop: OpenTopIndicativeRecord,
): BuildableEnvelope | null {
    const TAG = '[gis][c58] §ZGZ-OPEN-TOP-INDICATIVE';
    try {
        let rulePack = ES_ZARAGOZA_PGOU2024_PACK;
        let widthNote: string | null = null;

        if (zoneCode === 'A1/3.1' || zoneCode === 'A1/3.2') {
            // ⚠ NO block/opposing-parcel geometry is supplied — see the docstring. This resolves
            // `{ ok: false, reason: 'not-wired' }` on every production call today.
            const width = resolveZaragozaStreetWidth();
            if (!width.ok) {
                console.log(`${TAG} ${zoneCode} street width NOT resolved (${width.reason}) — no indicative draw.`);
                return null;
            }
            const band = resolveZaragozaA13Height(width.width_m, {
                measurementSpread_m: width.spread_m,
            });
            if (!band.ok) {
                console.log(`${TAG} ${zoneCode} width ${width.width_m.toFixed(2)} m REFUSED by the band resolver (${band.reason}) — no indicative draw.`);
                return null;
            }
            rulePack = zaragozaA13ResolvedPack(zoneCode, band, width.authority);
            widthNote = `${width.width_m.toFixed(2)} m (±${width.spread_m.toFixed(2)}, ${width.provenance})`;
        }

        const packZone = rulePack.zones.find((z) => z.code === zoneCode);
        if (!packZone) return null;

        const record: ZoningRecord = {
            zoneCode,
            zoneLabel: packZone.label ?? zoneDescripcion ?? null,
            jurisdictionId: ZARAGOZA_JURISDICTION_ID,
            structuredFields: {},
            overlays: [],
            ordinanceRef: packZone.ordinanceRef ?? null,
            provenance: {
                source: 'zaragoza-pgou-2024',
                label:
                    'PGOU de Zaragoza 2024, Normas Urbanísticas, Título Cuarto — human/agent-' +
                    'transcribed, page-cited',
                version: '2024-03',
                license: null,
                crs: 'EPSG:4326',
            },
        };
        const envelope = computeBuildableEnvelope({
            parcelRing: boundary.polygon,
            edgeClassifications: boundary.edgeClassifications,
            zoning: record,
            rulePack,
        });
        if (envelope.status !== 'ok') {
            console.log(`${TAG} ${zoneCode} produced status=${envelope.status} — no indicative draw.`);
            return null;
        }

        return {
            ...envelope,
            // §OPEN-TOP-INDICATIVE — the stamp IS the difference between this arm and a determination
            // (see `applyBalearsZoningThenFallback`'s identical comment). `posture.posture` verbatim,
            // never a literal.
            publicationPosture: 'open-top-indicative',
            caveats: [
                ...envelope.caveats,
                ...(widthNote ? [`Street width: ${widthNote}`] : []),
                ...openTop.missingConstraints.map(
                    (c: string) => `OPEN TOP (ADR-0293) — not accounted for: ${c}`,
                ),
                'INDICATIVE (ADR-0293) — PRYZM claims NO buildable right here. This volume is drawn ' +
                    'with an OPEN TOP: it is an upper bound that the unmodelled constraints above can ' +
                    'only REDUCE, and it is not a determination.',
            ],
        };
    } catch (e) {
        console.warn(`${TAG} ${zoneCode} indicative compute failed (non-fatal) — no indicative draw:`, e);
        return null;
    }
}

/**
 * §TELDE-ENVELOPE — the Telde (INE 35026, Gran Canaria) path, on the Zaragoza/Córdoba precedent.
 *
 * Telde's SIPU `EDIF` archive publishes 31 of its 46 zone codes as a machine-readable, drawable
 * rule (`ES_TELDE_PGO2003_PACK` / `esTeldePgo2003.ts`) — published structured data, not an OCR
 * read. `resolveTeldeZone` resolves a point to its `ETIQUETA` zone CODE by an OFFLINE point-in-
 * polygon join against a committed extract of the real `EDIF.shp`/`EDIF.dbf` pair (rewritten
 * 2026-08-04 — see that file's header for why IDECanarias' WFS was never actually load-bearing
 * here: the geometry ships in the same SIPU zip already cited for the pack's own numbers). The
 * numeric parameters this function renders (once signed) come from `ES_TELDE_PGO2003_PACK`, keyed
 * by that code — never from the resolver, which carries geometry + code only, nothing else.
 *
 * What is NOT yet true is a human sign-off: `CANARIAS_ENVELOPE_VERIFIED` is false until a
 * Spanish-planning-literate human signs `sources/VERIFICATION.md`, so this path renders NO number
 * today — it dispatches `canariasNoRulePackRefusal` (or `canariasGraphedRefusal` for the
 * `TELDE_GRAPHED_ZONE_CODES` — `DispObl = GRF` zones, a per-CODE typology property read statically
 * rather than per-point, since the offline shapefile's DBF carries no `DispObl` column), naming the
 * resolved zone when the resolver answers (never a placeholder once a real zone is known) and never
 * a fabricated envelope.
 *
 * VERIFICATION.md §6 records that Telde had NEITHER a dispatch branch NOR a compute path before
 * this function existed. Closing the dispatch gap AND the live-resolution gap (offline, not proxy)
 * makes a signature the ONLY remaining gap, exactly the property Zaragoza/Córdoba already have.
 *
 * Fully guarded: any problem falls back to the precomputed estimated envelope; never throws into
 * the commit path. `status: 'none'` on the refusal keeps every numeric field null and clears any
 * stale `buildableRing` (`dispatchEnvelope` writes a ring only on `'ok'`).
 */
async function applyTeldeZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    estimated: BuildableEnvelope | null,
): Promise<void> {
    const TAG = '[gis][c58] §TELDE-ENVELOPE';
    const JURISDICTION_REF = 'sipu-telde-edif';
    /** Fallback zone code for the refusal envelope when the resolver does not resolve a zone. */
    const TELDE_FALLBACK_ZONE_CODE = 'telde-pgo-2003';
    try {
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        const site = ctx.store.getSite();
        if (!site) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }

        const parcelAreaM2 = (() => {
            try {
                const ring = boundary.polygon;
                const a = Math.abs(
                    ring.reduce((acc, p, i) => {
                        const q = ring[(i + 1) % ring.length]!;
                        return acc + (p.x * q.z - q.x * p.z);
                    }, 0) / 2,
                );
                return Number.isFinite(a) && a > 0 ? a : null;
            } catch { return null; }
        })();

        // ── §TELDE-ZONE — resolve the EDIF zone BEFORE the gate. ─────────────────────────────
        //
        // ⚠⚠ THIS RESOLVES DATA, IT DOES NOT DECIDE TO RENDER. `CANARIAS_ENVELOPE_VERIFIED` is
        // still false below, so a resolved zone binds NO number — it only lets the refusal say
        // WHICH zone refused, exactly the same honesty property `resolveZaragozaZone` documents.
        //
        // ⚠ A FAILURE AND AN EMPTY ANSWER ARE NOT THE SAME VALUE (§CONTEXT-DATA-HONESTY). `no-zone`
        // means the resolver answered and this point carries no `EDIF` polygon; `endpoint-
        // unreachable` means we do not know (today: ALWAYS, because the proxy is unwired).
        //
        // ⚠ A MATCHED-BUT-UNPACKED CODE (e.g. `A1`, `INDEF`) IS NOT SILENTLY DROPPED. `packed` here
        // is what THIS function computes from `TELDE_PGO2003_ZONE_CODES`, purely to phrase the
        // refusal with the named `TELDE_UNPACKED_ZONES` reason — it is never used to discard a real
        // resolution.
        let zoneCode: string | null = null;
        let zoneLabel: string | null = null;
        let grammar: string | null = null;
        let packed = false;
        let zoneNote: string | null = null;
        try {
            const z = await resolveTeldeZone({ lat, lon });
            if (z.ok) {
                zoneCode = z.resolution.zoneCode;
                // ⚠ The offline `EDIF.shp`/`EDIF.dbf` join carries geometry + zone CODE only (no
                // `Nombre`/label column — that lives in `EDIF.mdb`, unparsed here). A packed zone's
                // label comes from the pack itself below; an unpacked zone simply has none to show.
                zoneLabel = null;
                if (zoneCode !== null) {
                    packed = (TELDE_PGO2003_ZONE_CODES as readonly string[]).includes(zoneCode);
                    // ⭐ `DispObl = GRF` (graphed) is a per-CODE typology property, not a per-point
                    // one — `TELDE_GRAPHED_ZONE_CODES` supplies it statically (derived from the same
                    // human-read `EDIF.mdb` citations already in `TELDE_UNPACKED_ZONES`) rather than
                    // needing a `DispObl` column the offline shapefile does not carry.
                    grammar = TELDE_GRAPHED_ZONE_CODES.has(zoneCode) ? 'graphed-refusal' : null;
                    if (!packed) {
                        const reason = TELDE_UNPACKED_ZONES[zoneCode];
                        zoneNote = reason
                            ? `Zone ${zoneCode} is deliberately not packed: ${reason}`
                            : `Zone ${zoneCode} is outside the 31 packed Telde EDIF zones — no rule ` +
                              'exists for it yet.';
                    }
                }
            } else if (z.reason === 'no-zone') {
                zoneNote =
                    'No SIPU `EDIF` zone polygon covers this point — outside Telde\'s published ' +
                    'built-form zoning.';
            } else {
                zoneNote =
                    `Telde EDIF zone NOT resolved (${z.reason}) — this is an unknown, not an ` +
                    'absence of planning. (§TELDE-ZONE-RESOLVER, offline extract.)';
            }
        } catch (e) {
            console.warn(`${TAG} §TELDE-ZONE resolve failed (non-fatal):`, e);
            zoneNote = 'Telde EDIF zone NOT resolved (resolver error) — this is an unknown, not an absence of planning.';
        }

        const knownFacts = [
            `Location: Telde (${lat.toFixed(5)}, ${lon.toFixed(5)}) — PGO de Telde 2003 (adaptación plena)`,
            parcelAreaM2 !== null ? `Parcel area: ${Math.round(parcelAreaM2).toLocaleString()} m²` : null,
            zoneCode !== null
                ? `EDIF zone: ${zoneLabel ? `${zoneLabel} — ` : ''}${zoneCode} ` +
                  '(SIPU `EDIF.mdb`, Gobierno de Canarias, opendata.sitcan.es)'
                : null,
            zoneNote,
            'Planning source: PGO de Telde 2003 (adaptación plena) — published structured data; ' +
                'transcription unsigned',
        ].filter((s): s is string => typeof s === 'string');

        if (!CANARIAS_ENVELOPE_VERIFIED) {
            // ⚠⚠⚠ THE HONESTY GATE — ⛔ DO NOT FLIP `CANARIAS_ENVELOPE_VERIFIED` HERE OR ANYWHERE
            // ELSE. A signature is a founder act (L-449); a model flipping it is the L-677 defect.
            // `status: 'none'` = attempted, value WITHHELD pending a human transcription + sign-off.
            //
            // §STAGING-UNCERTIFIED-PREVIEW (L-449) — a NARROWER, non-production-only exception to
            // the refusal below, never to the gate itself. `CANARIAS_ENVELOPE_VERIFIED` is still
            // read as `false` two lines above this comment and nothing here writes to it.
            // `isUncertifiedPreviewModeActive()` (`testMode/uncertifiedPreviewMode.ts`) is
            // triple-gated to a non-production Vite build with an exact opt-in literal, so this
            // branch is structurally absent from a real production bundle. It computes the SAME
            // `computeBuildableEnvelope` call the signed path below would make — real transcribed
            // data, no fabrication — but stamps `publicationPosture: 'uncertified-preview'`, which
            // makes the render classifier (`envelopeToMassing.ts`) refuse `complete: true` for it
            // and draw it loudly watermarked. This exists ONLY so the founder can visually verify
            // the compute path on a staging deploy before signing `sources/VERIFICATION.md`.
            if (isUncertifiedPreviewModeActive() && zoneCode !== null && packed) {
                const packZone = ES_TELDE_PGO2003_PACK.zones.find((z) => z.code === zoneCode);
                const record: ZoningRecord = {
                    zoneCode,
                    zoneLabel: packZone?.label ?? zoneLabel ?? null,
                    jurisdictionId: TELDE_JURISDICTION_ID,
                    structuredFields: {},
                    overlays: [],
                    ordinanceRef: packZone?.ordinanceRef ?? null,
                    provenance: {
                        source: 'sipu-telde-edif',
                        label:
                            'SIPU `EDIF.mdb`, Gobierno de Canarias — published structured data, ' +
                            'UNSIGNED reading (§STAGING-UNCERTIFIED-PREVIEW)',
                        version: '2003',
                        license: null,
                        crs: 'EPSG:32628',
                    },
                };
                const previewEnvelope = computeBuildableEnvelope({
                    parcelRing: boundary.polygon,
                    edgeClassifications: boundary.edgeClassifications,
                    zoning: record,
                    rulePack: ES_TELDE_PGO2003_PACK,
                });
                if (previewEnvelope.status === 'ok') {
                    const watermarked = {
                        ...previewEnvelope,
                        publicationPosture: 'uncertified-preview' as const,
                        caveats: [uncertifiedPreviewCaveat(`Telde EDIF ${zoneCode}`), ...previewEnvelope.caveats],
                    };
                    dispatchEnvelope(ctx, site.id, watermarked, JURISDICTION_REF);
                    console.log(
                        `${TAG} §STAGING-UNCERTIFIED-PREVIEW zoneCode=${zoneCode} — rendered an ` +
                            'UNCERTIFIED preview (CANARIAS_ENVELOPE_VERIFIED remains false). ' +
                            `area=${parcelAreaM2?.toFixed(0) ?? 'n/a'} m².`,
                    );
                    return;
                }
                console.log(
                    `${TAG} §STAGING-UNCERTIFIED-PREVIEW zoneCode=${zoneCode} produced status=` +
                        `${previewEnvelope.status} — falling through to the normal refusal.`,
                );
            }
            //
            // A GRAPHED zone (`DispObl = GRF`) refuses on the STRONGER, legally-grounded terms
            // `canariasGraphedRefusal` states — the building line is on a plan sheet PRYZM does not
            // hold, which will keep refusing after any signature, unlike a coverage gap.
            const refusal =
                grammar === 'graphed-refusal' && zoneCode !== null
                    ? canariasGraphedRefusal(zoneCode, zoneLabel, knownFacts)
                    : canariasNoRulePackRefusal(zoneCode, zoneLabel, knownFacts);
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(zoneCode ?? TELDE_FALLBACK_ZONE_CODE, refusal, 'none'),
                JURISDICTION_REF,
            );
            console.log(
                `${TAG} §HONESTY-GATE CANARIAS_ENVELOPE_VERIFIED=false — dispatched the no-signed-` +
                    `rule refusal; NO number rendered (${refusal.code}). zoneCode=${zoneCode ?? 'unresolved'} ` +
                    `packed=${packed} area=${parcelAreaM2?.toFixed(0) ?? 'n/a'} m². ` +
                    `Signs off via sources/VERIFICATION.md.`,
            );
            return;
        }

        // ── VERIFICATION SIGNED (future). Only a PACKED zone (one of the 31 in
        // `TELDE_PGO2003_ZONE_CODES`) may compute — an unpacked but resolved code (e.g. `A1`,
        // `INDEF`) still refuses on its own named merits, never borrows another zone's numbers.
        if (zoneCode !== null && packed) {
            const packZone = ES_TELDE_PGO2003_PACK.zones.find((z) => z.code === zoneCode);
            const record: ZoningRecord = {
                zoneCode,
                zoneLabel: packZone?.label ?? zoneLabel ?? null,
                jurisdictionId: TELDE_JURISDICTION_ID,
                // The SIPU EDIF row's numbers are already folded into the transcribed pack entry —
                // there is nothing additional structured to pass through per-parcel.
                structuredFields: {},
                overlays: [],
                ordinanceRef: packZone?.ordinanceRef ?? null,
                provenance: {
                    source: 'sipu-telde-edif',
                    label:
                        'SIPU `EDIF.mdb`, Gobierno de Canarias — published structured data, ' +
                        'human-signed reading',
                    version: '2003',
                    license: null,
                    crs: 'EPSG:32628',
                },
            };
            const envelope = computeBuildableEnvelope({
                parcelRing: boundary.polygon,
                edgeClassifications: boundary.edgeClassifications,
                zoning: record,
                rulePack: ES_TELDE_PGO2003_PACK,
            });
            if (envelope.status === 'ok') {
                dispatchEnvelope(ctx, site.id, envelope, JURISDICTION_REF);
                console.log(
                    `${TAG} zoneCode=${zoneCode} — RENDERED a signed envelope at ` +
                        `${envelope.confidence ?? 'n/a'}. area=${parcelAreaM2?.toFixed(0) ?? 'n/a'} m².`,
                );
                return;
            }
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(
                    zoneCode,
                    {
                        code: 'source-data-unavailable',
                        headline:
                            `${zoneCode}${packZone ? ` — ${packZone.label}` : ''}: the transcribed ` +
                            'ordinance leaves no buildable footprint on this parcel.',
                        detail:
                            'PRYZM applied the transcribed, signed EDIF rule to your parcel ' +
                            'boundary and the resulting footprint is empty — typically a plot ' +
                            'narrower than the ordinance\'s setback/coverage geometry permits. ' +
                            'PRYZM will not substitute an estimated figure to avoid showing an ' +
                            'empty result.',
                        ordinanceRef: packZone?.ordinanceRef ?? null,
                        legallyGrounded: false,
                        knownFacts,
                    },
                    'none',
                ),
                JURISDICTION_REF,
            );
            console.log(
                `${TAG} zoneCode=${zoneCode} produced status=${envelope.status} — dispatched the ` +
                    `empty-footprint refusal. NO number rendered.`,
            );
            return;
        }

        // Verified but unpacked/unresolved — the coverage-gap refusal, never a guessed number.
        const coverageGap =
            grammar === 'graphed-refusal' && zoneCode !== null
                ? canariasGraphedRefusal(zoneCode, zoneLabel, knownFacts)
                : canariasNoRulePackRefusal(zoneCode, zoneLabel, knownFacts);
        dispatchEnvelope(
            ctx,
            site.id,
            buildRefusedEnvelope(zoneCode ?? TELDE_FALLBACK_ZONE_CODE, coverageGap, 'none'),
            JURISDICTION_REF,
        );
    } catch (e) {
        console.warn(`${TAG} Telde path failed (non-fatal) — falling back to estimated default:`, e);
        try { applyEstimatedZoning(ctx, estimated); } catch { /* estimated is best-effort too */ }
    }
}

/**
 * §EL-SAUZAL-ENVELOPE — the El Sauzal (INE 38041, Tenerife) path, on the Telde/Zaragoza/Córdoba
 * precedent. This closes the gap `esElSauzal.ts`'s header named: the pack + offline resolver were
 * built but `siteDispatch.ts` was deliberately left unwired pending this function.
 *
 * ⚠ El Sauzal's SIPU package carries NO `EDIF.mdb` (unlike Telde), so `resolveElSauzalZone` reads a
 * committed offline `ZUSO.shp`/`.dbf` extract instead of a live WFS — SYNCHRONOUS, never throws.
 * `EL_SAUZAL_ENVELOPE_VERIFIED` stays false until a human (a) locates and reads the "fichero de
 * ordenación anexo" Título X repeatedly defers to and (b) signs `sources/VERIFICATION.md` — TWO
 * named gaps (`EL_SAUZAL_FICHERO_ANEXO_GAP`, `EL_SAUZAL_TYPOLOGY_BINDING_INFERENCE`), so this path
 * renders NO number today: it dispatches `elSauzalNoRulePackRefusal`, naming the resolved ZUSO
 * `ETIQUETA` when one resolves, never a fabricated envelope.
 *
 * Fully guarded: any problem falls back to the precomputed estimated envelope; never throws into
 * the commit path. `status: 'none'` on the refusal keeps every numeric field null and clears any
 * stale `buildableRing` (`dispatchEnvelope` writes a ring only on `'ok'`).
 */
function applyElSauzalZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    estimated: BuildableEnvelope | null,
): void {
    const TAG = '[gis][c58] §EL-SAUZAL-ENVELOPE';
    const JURISDICTION_REF = 'el-sauzal-zuso-shapefile';
    const EL_SAUZAL_FALLBACK_ZONE_CODE = 'el-sauzal-normativa';
    try {
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        const site = ctx.store.getSite();
        if (!site) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }

        const parcelAreaM2 = (() => {
            try {
                const ring = boundary.polygon;
                const a = Math.abs(
                    ring.reduce((acc, p, i) => {
                        const q = ring[(i + 1) % ring.length]!;
                        return acc + (p.x * q.z - q.x * p.z);
                    }, 0) / 2,
                );
                return Number.isFinite(a) && a > 0 ? a : null;
            } catch { return null; }
        })();

        // ── §EL-SAUZAL-ZONE — resolve the ZUSO zone BEFORE the gate. ─────────────────────────
        //
        // ⚠⚠ THIS RESOLVES DATA, IT DOES NOT DECIDE TO RENDER. `EL_SAUZAL_ENVELOPE_VERIFIED` is
        // still false below, so a resolved zone binds NO number — it only lets the refusal say
        // WHICH zone refused, exactly the same honesty property Telde/Zaragoza's resolvers document.
        let zoneCode: string | null = null;
        let packed = false;
        let zoneNote: string | null = null;
        try {
            const z = resolveElSauzalZone({ lat, lon });
            if (z.ok) {
                zoneCode = z.resolution.zoneCode;
                packed = (EL_SAUZAL_ZONE_CODES as readonly string[]).includes(zoneCode);
                if (!packed) {
                    zoneNote =
                        `Zone ${zoneCode} is outside the 17 packed Ciudad Jardín (RE-ViUf-*) zones ` +
                        '— no rule exists for it yet.';
                }
            } else if (z.reason === 'no-zone') {
                zoneNote =
                    'No SIPU `ZUSO` zone polygon covers this point — outside El Sauzal\'s ' +
                    'published zoning-use geometry.';
            } else {
                zoneNote = `El Sauzal ZUSO zone NOT resolved (${z.reason}) — this is an unknown, ` +
                    'not an absence of planning.';
            }
        } catch (e) {
            console.warn(`${TAG} §EL-SAUZAL-ZONE resolve failed (non-fatal):`, e);
            zoneNote = 'El Sauzal ZUSO zone NOT resolved (resolver error) — this is an unknown, not an absence of planning.';
        }

        const knownFacts = [
            `Location: El Sauzal (${lat.toFixed(5)}, ${lon.toFixed(5)}) — PGO de El Sauzal, ` +
                'Normativa Urbanística (Aprobación Definitiva 2010)',
            parcelAreaM2 !== null ? `Parcel area: ${Math.round(parcelAreaM2).toLocaleString()} m²` : null,
            zoneCode !== null
                ? `ZUSO zone: ${zoneCode} (SIPU \`ZUSO.dbf\`, offline extract, ETIQUETA field)`
                : null,
            zoneNote,
            'Planning source: PGO de El Sauzal, Título X Cap.3 (Ciudad Jardín) — human-transcribed ' +
                'from the Normativa PDF; transcription unsigned',
        ].filter((s): s is string => typeof s === 'string');

        if (!EL_SAUZAL_ENVELOPE_VERIFIED) {
            // ⚠⚠⚠ THE HONESTY GATE — ⛔ DO NOT FLIP `EL_SAUZAL_ENVELOPE_VERIFIED` HERE OR ANYWHERE
            // ELSE. A signature is a founder act (L-449); a model flipping it is the L-677 defect.
            // `status: 'none'` = attempted, value WITHHELD pending a human reading the fichero
            // anexo + sign-off.
            //
            // §STAGING-UNCERTIFIED-PREVIEW (L-449) — a NARROWER, non-production-only exception to
            // the refusal below, never to the gate itself. `EL_SAUZAL_ENVELOPE_VERIFIED` is still
            // read as `false` two lines above this comment and nothing here writes to it. See the
            // identical block in `applyTeldeZoningThenFallback` for the full rationale — this
            // mirrors it exactly, computing the SAME `computeBuildableEnvelope` call the signed
            // path below would make, then stamping `publicationPosture: 'uncertified-preview'`.
            if (isUncertifiedPreviewModeActive() && zoneCode !== null && packed) {
                const zone = ES_EL_SAUZAL_PACK.zones.find((z) => z.code === zoneCode);
                const record: ZoningRecord = {
                    zoneCode,
                    zoneLabel: zone?.label ?? null,
                    jurisdictionId: EL_SAUZAL_JURISDICTION_ID,
                    structuredFields: {},
                    overlays: [],
                    ordinanceRef: zone?.ordinanceRef ?? null,
                    provenance: {
                        source: 'el-sauzal-zuso-shapefile',
                        label:
                            'El Sauzal PGOU Normativa Urbanística, Título X Cap.3 — human-' +
                            'transcribed, UNSIGNED reading (§STAGING-UNCERTIFIED-PREVIEW)',
                        version: '2010',
                        license: null,
                        crs: 'EPSG:32628',
                    },
                };
                const previewEnvelope = computeBuildableEnvelope({
                    parcelRing: boundary.polygon,
                    edgeClassifications: boundary.edgeClassifications,
                    zoning: record,
                    rulePack: ES_EL_SAUZAL_PACK,
                });
                if (previewEnvelope.status === 'ok') {
                    const watermarked = {
                        ...previewEnvelope,
                        publicationPosture: 'uncertified-preview' as const,
                        caveats: [
                            uncertifiedPreviewCaveat(`El Sauzal ZUSO ${zoneCode}`),
                            ...previewEnvelope.caveats,
                        ],
                    };
                    dispatchEnvelope(ctx, site.id, watermarked, JURISDICTION_REF);
                    console.log(
                        `${TAG} §STAGING-UNCERTIFIED-PREVIEW zoneCode=${zoneCode} — rendered an ` +
                            'UNCERTIFIED preview (EL_SAUZAL_ENVELOPE_VERIFIED remains false). ' +
                            `area=${parcelAreaM2?.toFixed(0) ?? 'n/a'} m².`,
                    );
                    return;
                }
                console.log(
                    `${TAG} §STAGING-UNCERTIFIED-PREVIEW zoneCode=${zoneCode} produced status=` +
                        `${previewEnvelope.status} — falling through to the normal refusal.`,
                );
            }
            const refusal = elSauzalNoRulePackRefusal(zoneCode, knownFacts);
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(zoneCode ?? EL_SAUZAL_FALLBACK_ZONE_CODE, refusal, 'none'),
                JURISDICTION_REF,
            );
            console.log(
                `${TAG} §HONESTY-GATE EL_SAUZAL_ENVELOPE_VERIFIED=false — dispatched the no-signed-` +
                    `rule refusal; NO number rendered (${refusal.code}). zoneCode=${zoneCode ?? 'unresolved'} ` +
                    `packed=${packed} area=${parcelAreaM2?.toFixed(0) ?? 'n/a'} m². ` +
                    `Signs off via sources/VERIFICATION.md.`,
            );
            return;
        }

        // ── VERIFICATION SIGNED (future). Only a PACKED zone (one of the 17 RE-ViUf-N codes) may
        // compute — an unpacked but resolved code (e.g. RE-ViCo-*) still refuses on its own named
        // merits, never borrows another zone's numbers.
        if (zoneCode !== null && packed) {
            const packZone = ES_EL_SAUZAL_PACK.zones.find((z) => z.code === zoneCode);
            const record: ZoningRecord = {
                zoneCode,
                zoneLabel: packZone?.label ?? null,
                jurisdictionId: EL_SAUZAL_JURISDICTION_ID,
                structuredFields: {},
                overlays: [],
                ordinanceRef: packZone?.ordinanceRef ?? null,
                provenance: {
                    source: 'el-sauzal-zuso-shapefile',
                    label:
                        'El Sauzal PGOU Normativa Urbanística, Título X Cap.3 — human-transcribed, ' +
                        'human-signed reading',
                    version: '2010',
                    license: null,
                    crs: 'EPSG:32628',
                },
            };
            const envelope = computeBuildableEnvelope({
                parcelRing: boundary.polygon,
                edgeClassifications: boundary.edgeClassifications,
                zoning: record,
                rulePack: ES_EL_SAUZAL_PACK,
            });
            if (envelope.status === 'ok') {
                dispatchEnvelope(ctx, site.id, envelope, JURISDICTION_REF);
                console.log(
                    `${TAG} zoneCode=${zoneCode} — RENDERED a signed envelope at ` +
                        `${envelope.confidence ?? 'n/a'}. area=${parcelAreaM2?.toFixed(0) ?? 'n/a'} m².`,
                );
                return;
            }
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(
                    zoneCode,
                    {
                        code: 'source-data-unavailable',
                        headline:
                            `${zoneCode}${packZone ? ` — ${packZone.label}` : ''}: the transcribed ` +
                            'ordinance leaves no buildable footprint on this parcel.',
                        detail:
                            'PRYZM applied the transcribed, signed Ciudad Jardín rule to your ' +
                            'parcel boundary and the resulting footprint is empty — typically a ' +
                            'plot narrower than the ordinance\'s setback geometry permits. PRYZM ' +
                            'will not substitute an estimated figure to avoid showing an empty ' +
                            'result.',
                        ordinanceRef: packZone?.ordinanceRef ?? null,
                        legallyGrounded: false,
                        knownFacts,
                    },
                    'none',
                ),
                JURISDICTION_REF,
            );
            console.log(
                `${TAG} zoneCode=${zoneCode} produced status=${envelope.status} — dispatched the ` +
                    `empty-footprint refusal. NO number rendered.`,
            );
            return;
        }

        // Verified but unpacked/unresolved — the coverage-gap refusal, never a guessed number.
        const coverageGap = elSauzalNoRulePackRefusal(zoneCode, knownFacts);
        dispatchEnvelope(
            ctx,
            site.id,
            buildRefusedEnvelope(zoneCode ?? EL_SAUZAL_FALLBACK_ZONE_CODE, coverageGap, 'none'),
            JURISDICTION_REF,
        );
    } catch (e) {
        console.warn(`${TAG} El Sauzal path failed (non-fatal) — falling back to estimated default:`, e);
        try { applyEstimatedZoning(ctx, estimated); } catch { /* estimated is best-effort too */ }
    }
}

/**
 * §CARTAGENA-ENVELOPE — the Cartagena (INE 30016, Región de Murcia) path.
 *
 * ⚠ Cartagena's `wms_RPG0` `GetFeatureInfo` service is LIVE (confirmed 2026-08-04): it resolves a
 * parcel's block, matrícula and `Norma` composite (zone code + block-specific coefficient) in real
 * time, against the currently-valid R0/1987 PGMO (reinstated after the 2012 revision was annulled
 * by STSJ Murcia 2015 / TS 2016 — see `resolveCartagenaZone.ts` for the full instrument-precedence
 * rationale). This is the ONE Murcia-region municipality (of 5 researched) with a confirmed-working
 * per-parcel resolver.
 *
 * ⚠⚠ UNLIKE Telde/El Sauzal, THIS PATH HAS NO SIGNED-FUTURE COMPUTE BRANCH. `esCartagena.ts`'s
 * Vc1/Vc2/Vu1 zones all use the `explicit-area`/unresolved-ring structural-refusal pattern (mirrors
 * Sevilla SB / Córdoba MC) because PGMO 1987 Título Cuarto states a mandatory road setback
 * ("retranqueo a vial obligatorio") WITHOUT quantifying it — there is no honest full-parcel box to
 * compute even once a human signs off, until that quantifying source (fichas/planos) is located. So
 * this function ALWAYS resolves the live zone (to name it on the refusal card) then ALWAYS
 * dispatches a cited structural refusal — never a fabricated `0`-setback box.
 *
 * Fully guarded: any problem falls back to the precomputed estimated envelope; never throws into
 * the commit path. `status: 'none'` on the refusal keeps every numeric field null.
 */
async function applyCartagenaZoningThenFallback(
    ctx: SiteContext,
    lat: number,
    lon: number,
    estimated: BuildableEnvelope | null,
): Promise<void> {
    const TAG = '[gis][c58] §CARTAGENA-ENVELOPE';
    const JURISDICTION_REF = CARTAGENA_JURISDICTION_ID;
    const CARTAGENA_FALLBACK_ZONE_CODE = 'cartagena-pgmo1987';
    try {
        const site = ctx.store.getSite();
        if (!site) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }

        // ── §CARTAGENA-ZONE — resolve the `Manzanas` block record BEFORE dispatching. ─────────
        //
        // ⚠⚠ THIS RESOLVES DATA, IT DOES NOT DECIDE TO RENDER. `CARTAGENA_ENVELOPE_VERIFIED` is
        // `false` below regardless of what resolves — it only lets the refusal say WHICH zone
        // refused, exactly the same honesty property `resolveTeldeZone`/`resolveElSauzalZone`
        // document.
        let zoneCode: string | null = null;
        let coefficient: number | null = null;
        let zoneNote: string | null = null;
        try {
            const z = await resolveCartagenaZone({ lat, lon });
            if (z.ok) {
                zoneCode = z.resolution.norma.zoneCode;
                coefficient = z.resolution.norma.coefficient;
            } else if (z.reason === 'no-zone-here') {
                zoneNote =
                    'No `Manzanas` block record covers this point — outside Cartagena\'s ' +
                    'published R0/1987 zoning geometry.';
            } else if (z.reason === 'out-of-cartagena') {
                zoneNote = 'Point falls outside Cartagena\'s municipal bounding box.';
            } else {
                zoneNote =
                    `Cartagena zone NOT resolved (${z.reason}${z.detail ? `: ${z.detail}` : ''}) — ` +
                    'this is an unknown, not an absence of planning.';
            }
        } catch (e) {
            console.warn(`${TAG} §CARTAGENA-ZONE resolve failed (non-fatal):`, e);
            zoneNote = 'Cartagena zone NOT resolved (resolver error) — this is an unknown, not an absence of planning.';
        }

        const knownFacts = [
            `Location: Cartagena (${lat.toFixed(5)}, ${lon.toFixed(5)}) — PGMO 1987, Título Cuarto ` +
                '(vigente, reinstated 2015/2016 after the 2012 revision\'s annulment)',
            zoneCode !== null
                ? `Zone: ${zoneCode}${coefficient !== null ? ` (coeficiente ${coefficient})` : ''} ` +
                  '(`wms_RPG0` `Manzanas` layer, live GetFeatureInfo, ide.cartagena.es)'
                : null,
            zoneNote,
            'Blocking fact: the mandatory road setback ("retranqueo a vial obligatorio") is not ' +
                'quantified in the base PGMO 1987 Título Cuarto text — no honest footprint can be ' +
                'computed until that quantifying source (fichas/planos) is located.',
        ].filter((s): s is string => typeof s === 'string');

        // ⚠⚠⚠ THE HONESTY GATE — ⛔ DO NOT FLIP `CARTAGENA_ENVELOPE_VERIFIED` HERE OR ANYWHERE
        // ELSE. A signature is a founder act (L-449); a model flipping it is the L-677 defect. This
        // gate has NO compute branch (signed or preview) — see the function docstring.
        void CARTAGENA_ENVELOPE_VERIFIED;
        const refusal = cartagenaNoRulePackRefusal(zoneCode, knownFacts);
        dispatchEnvelope(
            ctx,
            site.id,
            buildRefusedEnvelope(zoneCode ?? CARTAGENA_FALLBACK_ZONE_CODE, refusal, 'none'),
            JURISDICTION_REF,
        );
        console.log(
            `${TAG} §HONESTY-GATE — dispatched the unquantified-setback structural refusal; NO ` +
                `number rendered (${refusal.code}). zoneCode=${zoneCode ?? 'unresolved'} ` +
                `coefficient=${coefficient ?? 'n/a'}.`,
        );
    } catch (e) {
        console.warn(`${TAG} Cartagena path failed (non-fatal) — falling back to estimated default:`, e);
        try { applyEstimatedZoning(ctx, estimated); } catch { /* estimated is best-effort too */ }
    }
}

/**
 * §ALCANTARILLA-ENVELOPE — the Alcantarilla (INE 30005, Región de Murcia) path.
 *
 * ⚠ Alcantarilla has NO rulepack — the two 1983 PGOU ordinance source documents are hosted
 * exclusively on SharePoint links that return HTTP 403 to automated fetch (see `esAlcantarilla.ts`).
 * What it DOES have is a live, coarse, non-binding land-use resolver against CARM's own regional
 * WFS (`resolveAlcantarillaLanduse.ts`), confirmed live 2026-08-04. So this path ALWAYS resolves
 * the live land-use feature (to name it on the refusal card, exactly the same honesty property
 * `applyCartagenaZoningThenFallback` documents for its zone resolve) then ALWAYS dispatches a
 * cited refusal — never a fabricated envelope, and never a claim that a fine zone code or a
 * numeric ordinance parameter was resolved.
 *
 * Fully guarded: any problem falls back to the precomputed estimated envelope; never throws into
 * the commit path. `status: 'none'` on the refusal keeps every numeric field null.
 */
async function applyAlcantarillaZoningThenFallback(
    ctx: SiteContext,
    lat: number,
    lon: number,
    estimated: BuildableEnvelope | null,
): Promise<void> {
    const TAG = '[gis][c58] §ALCANTARILLA-ENVELOPE';
    const JURISDICTION_REF = ALCANTARILLA_JURISDICTION_ID;
    const ALCANTARILLA_FALLBACK_ZONE_CODE = 'alcantarilla-research-pending';
    try {
        const site = ctx.store.getSite();
        if (!site) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }

        let landuseProperties: Readonly<Record<string, unknown>> | null = null;
        let landuseNote: string | null = null;
        try {
            const r = await resolveAlcantarillaLanduse({ lat, lon });
            if (r.ok) {
                landuseProperties = r.resolution.properties;
            } else if (r.reason === 'no-feature-here') {
                landuseNote =
                    "No sitmurcia_plu_ze feature covers this point in CARM's regional WFS.";
            } else if (r.reason === 'out-of-alcantarilla') {
                landuseNote = "Point falls outside Alcantarilla's municipal bounding box.";
            } else {
                landuseNote =
                    `Alcantarilla land-use NOT resolved (${r.reason}${r.detail ? `: ${r.detail}` : ''}).`;
            }
        } catch (e) {
            console.warn(`${TAG} land-use resolve failed (non-fatal):`, e);
            landuseNote = 'Alcantarilla land-use NOT resolved (resolver error).';
        }

        const knownFacts = [
            `Location: Alcantarilla (${lat.toFixed(5)}, ${lon.toFixed(5)}) — PGOU 1983 (vigente)`,
            landuseNote,
        ].filter((s): s is string => typeof s === 'string');

        // ⚠⚠⚠ THE HONESTY GATE — ⛔ DO NOT FLIP `ALCANTARILLA_ENVELOPE_VERIFIED` HERE OR
        // ANYWHERE ELSE. There is no transcription to sign at all yet (L-449).
        void ALCANTARILLA_ENVELOPE_VERIFIED;
        const refusal = alcantarillaNoRulePackRefusal(landuseProperties, knownFacts);
        dispatchEnvelope(
            ctx,
            site.id,
            buildRefusedEnvelope(ALCANTARILLA_FALLBACK_ZONE_CODE, refusal, 'none'),
            JURISDICTION_REF,
        );
        console.log(
            `${TAG} §HONESTY-GATE — dispatched the no-rulepack refusal; NO number rendered ` +
                `(${refusal.code}). landuseResolved=${landuseProperties !== null}.`,
        );
    } catch (e) {
        console.warn(`${TAG} Alcantarilla path failed (non-fatal) — falling back to estimated default:`, e);
        try { applyEstimatedZoning(ctx, estimated); } catch { /* estimated is best-effort too */ }
    }
}

/**
 * Envelope Phase 2 §LH-ENVELOPE — the L'Hospitalet de Llobregat (INE 08101) path. The SECOND Catalan
 * municipality, wired to PROVE the "add-a-city = data at five slots" claim.
 *
 * ⚠⚠⚠ THE HONESTY GATE IS THE POINT OF THIS FUNCTION. L'Hospitalet is genuinely routed: it shares
 * Barcelona's metropolitan instrument (PGM-1976) and reads its clau from the SAME Catalan MUC, and
 * the Art. 242.2 buildable-DEPTH construction is metropolitan (it derives depth from the real block,
 * not a municipal table), so the ARCHITECTURE fully transfers. What does NOT transfer without
 * verification is the NUMBERS: which claus appear here + their rule shape (each AMB municipality
 * layers its own *modificacions*), and Barcelona's *alçada reguladora* / official-street-width tables
 * (those are `es-08019-barcelona` data). Reusing `ES_BARCELONA_ENSANCHE_PACK` for an L'Hospitalet
 * parcel would stamp Barcelona's jurisdiction id + height table + citations onto another
 * municipality's land — a confident mis-citation (§CONTEXT-DATA-HONESTY). So until a human verifies
 * the equivalence per clau and signs `sources/VERIFICATION.md` (`LHOSPITALET_ENVELOPE_VERIFIED ===
 * false`), this path renders NO number: it dispatches a cited "routed, not yet verified" REFUSAL for
 * EVERY L'Hospitalet parcel. This is the same discipline that keeps Córdoba's OCR'd pack refusing.
 *
 * Fully guarded: any problem falls back to the precomputed estimated envelope; never throws into the
 * commit path. `status: 'none'` on the refusal keeps every numeric field null and clears any stale
 * `buildableRing` (dispatchEnvelope writes a ring only on `'ok'`).
 */
async function applyLHospitaletZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    estimated: BuildableEnvelope | null,
): Promise<void> {
    const TAG = '[gis][c58] §LH-ENVELOPE';
    // A placeholder zone code for the refusal envelope: while the verification gate is closed we do
    // not bind a specific clau (the MUC fetch below is skipped — its result would be discarded, the
    // same trade-off `applyCordobaZoningThenFallback` makes). `zoneCode` is required (min length 1);
    // this names the municipality, not a clau, and no number rides on it.
    const LHOSPITALET_ZONE_CODE = 'lhospitalet-pgm-unverified';
    try {
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        const site = ctx.store.getSite();
        if (!site) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        // Per-parcel facts for the refusal card so it is never a blank panel (L-553). Area only — no
        // network while the gate is closed (the MUC clau lookup is deferred to the verified branch).
        const parcelAreaM2 = (() => {
            try {
                const ring = boundary.polygon;
                const a = Math.abs(
                    ring.reduce((acc, p, i) => {
                        const q = ring[(i + 1) % ring.length]!;
                        return acc + (p.x * q.z - q.x * p.z);
                    }, 0) / 2,
                );
                return Number.isFinite(a) && a > 0 ? a : null;
            } catch { return null; }
        })();
        const knownFacts = [
            `Location: L'Hospitalet de Llobregat (${lat.toFixed(5)}, ${lon.toFixed(5)}) — AMB, PGM-1976`,
            parcelAreaM2 !== null ? `Parcel area: ${Math.round(parcelAreaM2).toLocaleString()} m²` : null,
            'Planning source: Generalitat de Catalunya MUC + PGM-1976 (metropolitan) — clau numbers not yet verified vs Barcelona',
        ].filter((s): s is string => typeof s === 'string');

        if (!LHOSPITALET_ENVELOPE_VERIFIED) {
            // ⚠⚠⚠ THE HONESTY GATE. Unverified → refuse, never a number. `status: 'none'` = attempted,
            // value WITHHELD pending human verification (NOT `'not-applicable'`, which would assert the
            // ordinance grants no envelope — the PGM DOES grant one; we simply have not verified we may
            // reuse Barcelona's transcription of it).
            const refusal = lhospitaletUnverifiedRefusal(null, null, knownFacts);
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(LHOSPITALET_ZONE_CODE, refusal, 'none'),
                'muc-catastro',
            );
            console.log(
                `${TAG} §HONESTY-GATE LHOSPITALET_ENVELOPE_VERIFIED=false — dispatched the ` +
                    `routed-not-verified refusal; NO number rendered (${refusal.code}). ` +
                    `area=${parcelAreaM2?.toFixed(0) ?? 'n/a'} m². Signs off via sources/VERIFICATION.md.`,
            );
            return;
        }

        // ── VERIFICATION SIGNED (future) — once a human has confirmed, per clau, that L'Hospitalet's
        // numbers/geometry equal Barcelona's (or authored an `es-08101-hospitalet` pack cited to
        // L'Hospitalet), this branch reuses the EXACT Barcelona machinery: fetch the clau from the MUC
        // (`fetchQualificationAtPoint`), ask the registry (`resolveZoneDisposition`), and for a covered
        // clau run `computeBuildableEnvelope` against the dissolved block — identical to
        // `applyBcnZoningThenFallback`. That resolver + pack land together WITH the sign-off, so they
        // are not present while the gate is closed; refusing is the only honest output until then.
        console.warn(
            `${TAG} verification is signed but the L'Hospitalet pack/resolver is not wired yet ` +
                `— dispatching the unverified refusal rather than a borrowed Barcelona number.`,
        );
        const refusal = lhospitaletUnverifiedRefusal(null, null, knownFacts);
        dispatchEnvelope(
            ctx,
            site.id,
            buildRefusedEnvelope(LHOSPITALET_ZONE_CODE, refusal, 'none'),
            'muc-catastro',
        );
    } catch (e) {
        console.warn(`${TAG} L'Hospitalet path failed (non-fatal) — falling back to estimated default:`, e);
        try { applyEstimatedZoning(ctx, estimated); } catch { /* estimated is best-effort too */ }
    }
}

/**
 * Envelope Phase 2 §BDN-ENVELOPE — Badalona (INE 08015), the 3rd Catalan city. Mirrors
 * `applyLHospitaletZoningThenFallback` exactly: while `BADALONA_ENVELOPE_VERIFIED === false` this
 * dispatches a cited "routed, not yet verified" REFUSAL for EVERY Badalona parcel — never a borrowed
 * Barcelona number. Fully guarded; any problem falls back to the precomputed estimated envelope.
 * `status: 'none'` keeps every numeric field null. The verified-future branch (reuse the Barcelona
 * MUC fetch + resolver + computeBuildableEnvelope) lands WITH the sign-off + an es-08015-badalona pack.
 */
async function applyBadalonaZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    estimated: BuildableEnvelope | null,
): Promise<void> {
    const TAG = '[gis][c58] §BDN-ENVELOPE';
    const BADALONA_ZONE_CODE = 'badalona-pgm-unverified';
    try {
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        const site = ctx.store.getSite();
        if (!site) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        const parcelAreaM2 = (() => {
            try {
                const ring = boundary.polygon;
                const a = Math.abs(
                    ring.reduce((acc, p, i) => {
                        const q = ring[(i + 1) % ring.length]!;
                        return acc + (p.x * q.z - q.x * p.z);
                    }, 0) / 2,
                );
                return Number.isFinite(a) && a > 0 ? a : null;
            } catch { return null; }
        })();
        const knownFacts = [
            `Location: Badalona (${lat.toFixed(5)}, ${lon.toFixed(5)}) — AMB, PGM-1976`,
            parcelAreaM2 !== null ? `Parcel area: ${Math.round(parcelAreaM2).toLocaleString()} m²` : null,
            'Planning source: Generalitat de Catalunya MUC + PGM-1976 (metropolitan) — clau numbers not yet verified vs Barcelona',
        ].filter((s): s is string => typeof s === 'string');

        if (!BADALONA_ENVELOPE_VERIFIED) {
            // ⚠⚠⚠ THE HONESTY GATE. Unverified → refuse, never a number. `status: 'none'` = attempted,
            // value WITHHELD pending human verification (NOT `'not-applicable'` — the PGM DOES grant an
            // envelope here; we simply have not verified we may reuse Barcelona's transcription of it).
            const refusal = badalonaUnverifiedRefusal(null, null, knownFacts);
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(BADALONA_ZONE_CODE, refusal, 'none'),
                'muc-catastro',
            );
            console.log(
                `${TAG} §HONESTY-GATE BADALONA_ENVELOPE_VERIFIED=false — dispatched the ` +
                    `routed-not-verified refusal; NO number rendered (${refusal.code}). ` +
                    `area=${parcelAreaM2?.toFixed(0) ?? 'n/a'} m². Signs off via sources/VERIFICATION.md.`,
            );
            return;
        }

        // ── VERIFICATION SIGNED (future) — once a human confirms, per clau, that Badalona's numbers/
        // geometry equal Barcelona's (or an es-08015-badalona pack is authored cited to Badalona), this
        // branch reuses the EXACT Barcelona machinery, identical to applyBcnZoningThenFallback. That
        // resolver + pack land WITH the sign-off, so refusing is the only honest output until then.
        console.warn(
            `${TAG} verification is signed but the Badalona pack/resolver is not wired yet ` +
                `— dispatching the unverified refusal rather than a borrowed Barcelona number.`,
        );
        const refusal = badalonaUnverifiedRefusal(null, null, knownFacts);
        dispatchEnvelope(
            ctx,
            site.id,
            buildRefusedEnvelope(BADALONA_ZONE_CODE, refusal, 'none'),
            'muc-catastro',
        );
    } catch (e) {
        console.warn(`${TAG} Badalona path failed (non-fatal) — falling back to estimated default:`, e);
        try { applyEstimatedZoning(ctx, estimated); } catch { /* estimated is best-effort too */ }
    }
}

/**
 * Envelope Phase 2 §SBL-ENVELOPE — Sant Boi de Llobregat (INE 08200), the 4th Catalan city. Mirrors
 * `applyBadalonaZoningThenFallback` exactly: while `SANT_BOI_ENVELOPE_VERIFIED === false` this
 * dispatches a cited "routed, not yet verified" REFUSAL for EVERY Sant Boi parcel — never a borrowed
 * Barcelona number. Fully guarded; any problem falls back to the precomputed estimated envelope.
 * `status: 'none'` keeps every numeric field null. The verified-future branch (reuse the Barcelona
 * MUC fetch + resolver + computeBuildableEnvelope) lands WITH the sign-off + an es-08200-sant-boi pack.
 */
async function applySantBoiZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    estimated: BuildableEnvelope | null,
): Promise<void> {
    const TAG = '[gis][c58] §SBL-ENVELOPE';
    const SANT_BOI_ZONE_CODE = 'sant-boi-pgm-unverified';
    try {
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        const site = ctx.store.getSite();
        if (!site) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        const parcelAreaM2 = (() => {
            try {
                const ring = boundary.polygon;
                const a = Math.abs(
                    ring.reduce((acc, p, i) => {
                        const q = ring[(i + 1) % ring.length]!;
                        return acc + (p.x * q.z - q.x * p.z);
                    }, 0) / 2,
                );
                return Number.isFinite(a) && a > 0 ? a : null;
            } catch { return null; }
        })();
        const knownFacts = [
            `Location: Sant Boi de Llobregat (${lat.toFixed(5)}, ${lon.toFixed(5)}) — AMB, PGM-1976`,
            parcelAreaM2 !== null ? `Parcel area: ${Math.round(parcelAreaM2).toLocaleString()} m²` : null,
            'Planning source: Generalitat de Catalunya MUC + PGM-1976 (metropolitan) — clau numbers not yet verified vs Barcelona',
        ].filter((s): s is string => typeof s === 'string');

        if (!SANT_BOI_ENVELOPE_VERIFIED) {
            // ⚠⚠⚠ THE HONESTY GATE. Unverified → refuse, never a number. `status: 'none'` = attempted,
            // value WITHHELD pending human verification (NOT `'not-applicable'` — the PGM DOES grant an
            // envelope here; we simply have not verified we may reuse Barcelona's transcription of it).
            const refusal = santBoiUnverifiedRefusal(null, null, knownFacts);
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(SANT_BOI_ZONE_CODE, refusal, 'none'),
                'muc-catastro',
            );
            console.log(
                `${TAG} §HONESTY-GATE SANT_BOI_ENVELOPE_VERIFIED=false — dispatched the ` +
                    `routed-not-verified refusal; NO number rendered (${refusal.code}). ` +
                    `area=${parcelAreaM2?.toFixed(0) ?? 'n/a'} m². Signs off via sources/VERIFICATION.md.`,
            );
            return;
        }

        // ── VERIFICATION SIGNED (future) — once a human confirms, per clau, that Sant Boi's numbers/
        // geometry equal Barcelona's (or an es-08200-sant-boi pack is authored cited to Sant Boi), this
        // branch reuses the EXACT Barcelona machinery, identical to applyBcnZoningThenFallback. That
        // resolver + pack land WITH the sign-off, so refusing is the only honest output until then.
        console.warn(
            `${TAG} verification is signed but the Sant Boi pack/resolver is not wired yet ` +
                `— dispatching the unverified refusal rather than a borrowed Barcelona number.`,
        );
        const refusal = santBoiUnverifiedRefusal(null, null, knownFacts);
        dispatchEnvelope(
            ctx,
            site.id,
            buildRefusedEnvelope(SANT_BOI_ZONE_CODE, refusal, 'none'),
            'muc-catastro',
        );
    } catch (e) {
        console.warn(`${TAG} Sant Boi path failed (non-fatal) — falling back to estimated default:`, e);
        try { applyEstimatedZoning(ctx, estimated); } catch { /* estimated is best-effort too */ }
    }
}

/**
 * Envelope Phase 2 §CRN-ENVELOPE — Cornellà de Llobregat (INE 08073), the 5th Catalan city. Mirrors
 * `applySantBoiZoningThenFallback` exactly: while `CORNELLA_ENVELOPE_VERIFIED === false` this
 * dispatches a cited "routed, not yet verified" REFUSAL for EVERY Cornellà parcel — never a borrowed
 * Barcelona number. Fully guarded; any problem falls back to the precomputed estimated envelope.
 * `status: 'none'` keeps every numeric field null. The verified-future branch (reuse the Barcelona
 * MUC fetch + resolver + computeBuildableEnvelope) lands WITH the sign-off + an es-08073-cornella-de-llobregat pack.
 */
async function applyCornellaZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    estimated: BuildableEnvelope | null,
): Promise<void> {
    const TAG = '[gis][c58] §CRN-ENVELOPE';
    const CORNELLA_ZONE_CODE = 'cornella-pgm-unverified';
    try {
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        const site = ctx.store.getSite();
        if (!site) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        const parcelAreaM2 = (() => {
            try {
                const ring = boundary.polygon;
                const a = Math.abs(
                    ring.reduce((acc, p, i) => {
                        const q = ring[(i + 1) % ring.length]!;
                        return acc + (p.x * q.z - q.x * p.z);
                    }, 0) / 2,
                );
                return Number.isFinite(a) && a > 0 ? a : null;
            } catch { return null; }
        })();
        const knownFacts = [
            `Location: Cornellà de Llobregat (${lat.toFixed(5)}, ${lon.toFixed(5)}) — AMB, PGM-1976`,
            parcelAreaM2 !== null ? `Parcel area: ${Math.round(parcelAreaM2).toLocaleString()} m²` : null,
            'Planning source: Generalitat de Catalunya MUC + PGM-1976 (metropolitan) — clau numbers not yet verified vs Barcelona',
        ].filter((s): s is string => typeof s === 'string');

        if (!CORNELLA_ENVELOPE_VERIFIED) {
            // ⚠⚠⚠ THE HONESTY GATE. Unverified → refuse, never a number. `status: 'none'` = attempted,
            // value WITHHELD pending human verification (NOT `'not-applicable'` — the PGM DOES grant an
            // envelope here; we simply have not verified we may reuse Barcelona's transcription of it).
            const refusal = cornellaUnverifiedRefusal(null, null, knownFacts);
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(CORNELLA_ZONE_CODE, refusal, 'none'),
                'muc-catastro',
            );
            console.log(
                `${TAG} §HONESTY-GATE CORNELLA_ENVELOPE_VERIFIED=false — dispatched the ` +
                    `routed-not-verified refusal; NO number rendered (${refusal.code}). ` +
                    `area=${parcelAreaM2?.toFixed(0) ?? 'n/a'} m². Signs off via sources/VERIFICATION.md.`,
            );
            return;
        }

        // ── VERIFICATION SIGNED (future) — once a human confirms, per clau, that Cornellà's numbers/
        // geometry equal Barcelona's (or an es-08073-cornella-de-llobregat pack is authored cited to
        // Cornellà), this branch reuses the EXACT Barcelona machinery, identical to applyBcnZoningThenFallback.
        // That resolver + pack land WITH the sign-off, so refusing is the only honest output until then.
        console.warn(
            `${TAG} verification is signed but the Cornellà pack/resolver is not wired yet ` +
                `— dispatching the unverified refusal rather than a borrowed Barcelona number.`,
        );
        const refusal = cornellaUnverifiedRefusal(null, null, knownFacts);
        dispatchEnvelope(
            ctx,
            site.id,
            buildRefusedEnvelope(CORNELLA_ZONE_CODE, refusal, 'none'),
            'muc-catastro',
        );
    } catch (e) {
        console.warn(`${TAG} Cornellà path failed (non-fatal) — falling back to estimated default:`, e);
        try { applyEstimatedZoning(ctx, estimated); } catch { /* estimated is best-effort too */ }
    }
}

/**
 * §MURCIA-ENVELOPE — the Murcia (INE 30030) path. Región de Murcia, PGOU de Murcia.
 *
 * ⚠⚠ READ THIS BEFORE "FINISHING" IT: THERE IS NO NUMBER TO DRAW HERE, AND THAT IS A FINDING, NOT A
 * GAP. Murcia's municipal GeoServer publishes the calificación, its official designation, the
 * ámbito, the land class and the record's validity interval — and NO altura, edificabilidad,
 * ocupación or retranqueo in any schema. For the TA/TM/UA/UH/UM ámbitos the PGOU explains why in its
 * own articles: Art. 6.6.2 says an ámbito coded `TA` carries the ordering of the previous plan
 * *convalidada plenamente*, identified by the expediente number after the code, and Art. 5.24.5.1
 * says the same of the generic residential calificación `RR`. The governing numbers are in THAT
 * instrument, which PRYZM does not hold. A figure lifted from a general-plan zone table would cite a
 * document that expressly declines the question — which is exactly what a competitor screening
 * report did on this parcel (~262 m² as a "proxy PGOU"). An uncited number from PRYZM would be
 * WORSE than their proxy, because it would claim a rigour we have not earned (L-616, L-526).
 *
 * ⇒ EVERY branch of this function dispatches a REFUSAL. What the live fetch buys is not a number but
 * SPECIFICITY: the refusal names the user's ámbito, calificación, land class, pedanía and the
 * expediente of the document they must obtain, and it is `legallyGrounded: true` when the ordinance
 * itself is the source of the "no". `status: 'none'` keeps every numeric field null and clears any
 * stale `buildableRing` (`dispatchEnvelope` writes a ring only on `'ok'`).
 *
 * THE CHAIN: `isInMurcia` (S2 gate) → `catastroParcelProvider` (refcat + address, national, already
 * live) → `detectDerivedPlanMarkers` (the instrument named in the address) → `resolveMurciaZoning`
 * (S3, live municipal records via `/api/es/murcia-pgou`) → `murciaEnvelopeDisposition` (PURE, S4) →
 * `buildRefusedEnvelope` → `dispatchEnvelope` (P6 — `site.updateZoning`, never a direct store write).
 *
 * Fully guarded: it never throws into the commit path, and it never falls back to the estimated
 * triple on a jurisdiction we DO answer — a fabricated estimate where an honest refusal exists is
 * the §CONTEXT-DATA-HONESTY failure. Only a structurally impossible dispatch (no polygon, no site)
 * leaves the path.
 */
async function applyMurciaZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    estimated: BuildableEnvelope | null,
): Promise<void> {
    const TAG = '[gis][c58] §MURCIA-ENVELOPE';
    const JURISDICTION_REF = 'murcia-pgou';
    /** Fallback zone code when the live records carry none — names the plan, asserts nothing. */
    const MURCIA_FALLBACK_ZONE_CODE = 'murcia-pgou';
    try {
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        const site = ctx.store.getSite();
        if (!site) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }

        const parcelAreaM2 = (() => {
            try {
                const ring = boundary.polygon;
                const a = Math.abs(
                    ring.reduce((acc, p, i) => {
                        const q = ring[(i + 1) % ring.length]!;
                        return acc + (p.x * q.z - q.x * p.z);
                    }, 0) / 2,
                );
                return Number.isFinite(a) && a > 0 ? a : null;
            } catch { return null; }
        })();

        // (1) The PARCEL half — already live nationally through the same Catastro proxy every
        // Spanish click uses. It supplies the referencia catastral (an identifier join, not a pin
        // guess) and the cadastral ADDRESS, which is where Murcia happens to publish its
        // derived-plan marker (`PL U.A. 5ª DEL P.P. CR-5 …`). Best-effort: a miss costs the refusal
        // some specificity and nothing else.
        let refcat: string | null = null;
        let address: string | null = null;
        try {
            const parcel = await catastroParcelProvider.fetchParcelAtPoint(lon, lat);
            refcat = parcel?.refcat ?? null;
            address = parcel?.address ?? null;
        } catch { /* the parcel leg is enrichment, never a precondition */ }
        const derivedPlans: readonly DerivedPlanMarker[] = detectDerivedPlanMarkers(address);

        // (2) The ZONING half — the live municipal records at the parcel point. Never throws; a
        // failure and an absence stay DIFFERENT answers all the way to the card.
        const asOf = new Date().toISOString().slice(0, 10);
        const resolution = await resolveMurciaZoning({ lat, lon }, { asOf });

        const knownFacts: string[] = [
            `Location: Murcia (${lat.toFixed(5)}, ${lon.toFixed(5)}) — Región de Murcia, PGOU de Murcia`,
            refcat !== null ? `Referencia catastral: ${refcat}` : null,
            parcelAreaM2 !== null ? `Parcel area: ${Math.round(parcelAreaM2).toLocaleString()} m²` : null,
        ].filter((s): s is string => typeof s === 'string');

        // ⚠⚠⚠ THE HONESTY GATE.
        //
        // §MURCIA-GATE-BYPASS-REGRESSION — this condition used to read
        // `if (!MURCIA_ENVELOPE_VERIFIED && resolution.ok)`, and that was a LIVE DEFECT the moment
        // SIG-MU1 flipped the constant to `true` (2026-08-01): the whole disposition block became
        // unreachable, so every Murcia parcel fell through to the generic `no-rule-pack` coverage
        // refusal below. The signature therefore made Murcia STRICTLY WORSE — it did not publish a
        // single envelope (the dispatcher still cannot consume one), and it DISCARDED the cited,
        // `legallyGrounded: true` `derived-plan` refusal that the 67 % delegated land had before,
        // replacing it with an untrue statement about our own coverage ("PRYZM holds no transcribed
        // rule") on a city where PRYZM holds a signed 14-zone pack.
        //
        // ⚠ The interlock that was supposed to prevent exactly this lives INSIDE the disposition
        // (the `reason` field on the `envelope` branch), so it could never fire while the guard that
        // skipped it lived out here. An interlock downstream of the branch that bypasses it is not
        // an interlock. The gate now governs what we may PUBLISH, never whether we may READ the law.
        if (resolution.ok) {
            const disposition = murciaEnvelopeDisposition(
                resolution.records.calificacion,
                resolution.records.sector,
                asOf,
                derivedPlans,
            );
            // §MURCIA-ENVELOPE-RENDER (SIG-MU1) — the pack is SIGNED and R-7's delegation parity is
            // closed, so this branch is reached ONLY on genuinely PGOU-direct, packed land: the
            // measured 23.51 % of Murcia's buildable land the signature authorises.
            //
            // ⚠ WHY IT IS SAFE TO RENDER HERE, AND ONLY HERE. Everything that must be true has
            // already been established ABOVE this line, by the disposition, in the plan's own
            // precedence: the records are in force, the ámbito is not *ordenación remitida*, the
            // soil is not urbanizable, the ámbito is not UE/UD/P*, and the calificación matched the
            // transcribed allow-list. Re-testing any of that here would create a second, driftable
            // statement of the safety property — the L-422/457/467/469 failure family. The
            // disposition is the ONE decision point; this branch only draws what it decided.
            //
            // ⚠ TIER. `ZoningRulesEngine` assigns `estimated-ruleset`, which is EXACTLY what SIG-MU1
            // authorises and no more ("`authoritative` is UNREACHABLE — a constructed determination
            // is capped at 0.70 on ENVELOPE"). Do not raise it here.
            if (disposition.kind === 'envelope') {
                const cls = disposition.classification;
                // The MATCHED pack code, never the raw live string: `RF1`→`RF`, `IXT`→`IX`. Handing
                // the raw variant to the engine would find no zone and silently answer whole-parcel.
                const zoneCode = disposition.matchedCode;
                const record: ZoningRecord = {
                    zoneCode,
                    zoneLabel: cls?.label ?? disposition.zone.label ?? null,
                    jurisdictionId: MURCIA_JURISDICTION_ID,
                    // Murcia's WFS publishes NO numeric buildable parameter (verified against the
                    // DescribeFeatureType schemas). Every number comes from the transcribed pack, so
                    // there is nothing structured to pass and inventing a field here would launder a
                    // pack value into a "published by the municipality" one.
                    structuredFields: {},
                    overlays: [],
                    ordinanceRef: disposition.zone.ordinanceRef ?? null,
                    provenance: {
                        source: 'murcia-pgou-tr-2012',
                        label:
                            'PGOU de Murcia, Normas Urbanísticas, Texto Refundido diciembre 2012 ' +
                            '(Vol. 11) — transcribed, human-signed SIG-MU1',
                        version: '2012-12',
                        license: null,
                        crs: 'EPSG:4326',
                    },
                };
                const envelope = computeBuildableEnvelope({
                    parcelRing: boundary.polygon,
                    edgeClassifications: boundary.edgeClassifications,
                    zoning: record,
                    rulePack: ES_MURCIA_PGOU2012_PACK,
                });
                if (envelope.status === 'ok') {
                    dispatchEnvelope(ctx, site.id, envelope, JURISDICTION_REF);
                    console.log(
                        `${TAG} PGOU-direct packed calificación=${resolution.records.calificacion?.calificacion ?? 'n/a'} ` +
                            `→ pack zone ${zoneCode} (${cls?.article ?? 'n/a'}) — RENDERED a signed envelope ` +
                            `at ${envelope.confidence ?? 'n/a'}. area=${parcelAreaM2?.toFixed(0) ?? 'n/a'} m².`,
                    );
                    return;
                }
                // The transcribed rule leaves no buildable footprint on THIS parcel (a plot smaller
                // than the zone's setbacks allow). A cited refusal is the honest answer; the
                // estimated triple would over-state it, and a whole-parcel fallback would ignore the
                // ordinance we just read.
                dispatchEnvelope(
                    ctx,
                    site.id,
                    buildRefusedEnvelope(
                        zoneCode,
                        {
                            code: 'source-data-unavailable',
                            headline:
                                `${zoneCode}${cls ? ` — ${cls.label}` : ''}: the PGOU's own conditions ` +
                                'leave no buildable footprint on this parcel.',
                            detail:
                                'This land is ordered directly by the general plan' +
                                (cls ? ` (${cls.article})` : '') +
                                ', and PRYZM applied that transcribed, human-signed ordinance to your ' +
                                'parcel boundary. The resulting footprint is empty — typically a plot ' +
                                'narrower than the zone\'s setbacks permit. PRYZM will not substitute an ' +
                                'estimated figure to avoid showing an empty result. ' +
                                MURCIA_ROADMAP_LINE,
                            ordinanceRef: disposition.zone.ordinanceRef ?? null,
                            // FALSE: the ordinance answers; this is a fact about THIS parcel's shape.
                            legallyGrounded: false,
                            knownFacts,
                        },
                        'none',
                    ),
                    JURISDICTION_REF,
                );
                console.log(
                    `${TAG} PGOU-direct packed zone ${zoneCode} produced status=${envelope.status} — ` +
                        `dispatched the empty-footprint refusal. NO number rendered.`,
                );
                return;
            }
            if (disposition.kind === 'refusal') {
                const zoneCode =
                    resolution.records.calificacion?.calificacion ??
                    resolution.records.sector?.sector ??
                    MURCIA_FALLBACK_ZONE_CODE;

                // ── §MURCIA-ANCHO-DE-CALLE (SIG-MU2, founder 2026-08-02) ────────────────────
                //
                // RC / RM / RN are refused by the pack because their height is keyed on the STREET
                // WIDTH, which no Murcia layer publishes. SIG-MU2 authorises constructing that
                // width from the municipality's own alineación geometry:
                //   "Computing that width from authoritative geometry is an implementation of the
                //    ordinance, not a modification of it."
                //
                // ⚠⚠ THE GATE IS `legallyGrounded === false`, AND THAT IS THE WHOLE SAFETY ARGUMENT.
                // A `derived-plan` refusal (delegated soil — Arts. 5.25.3.3 / 5.26.3.3 / 6.2.2.3)
                // carries `legallyGrounded: true`, and NO signature can lift it. Only the
                // `no-rule-pack` refusal — "the general plan DOES order this parcel, PRYZM lacks the
                // rule" — is `false`. Testing it here means this branch is structurally incapable of
                // publishing on the 67 % the PGOU delegates, without re-deriving the delegation
                // tests (which would be a second, free-to-drift copy of them).
                //
                // ⚠ MEASURED, NOT ASSUMED: only 51.3 % of RC/RM/RN land actually resolves
                // (`tools/murcia-street-width-probe/`, area-weighted, seed 20260802). The rest
                // REFUSES — 44.6 % because the measured width sits too near a band edge. That is
                // condition 4 working; do not "fix" it by relaxing the guard.
                const anchoZone = MURCIA_ANCHO_ZONE_CODES.includes(zoneCode as MurciaAnchoZone)
                    ? (zoneCode as MurciaAnchoZone)
                    : null;
                if (anchoZone !== null && disposition.refusal.legallyGrounded === false) {
                    const measured = await resolveMurciaStreetWidth({ lat, lon }, {
                        parcelRingLonLat: undefined,
                    });
                    if (measured.ok) {
                        const band = resolveMurciaAnchoDeCalle(anchoZone, measured.width_m, {
                            widthProvenance: measured.provenance,
                            measurementSpread_m: measured.spread_m,
                        });
                        if (band.ok) {
                            const pack = murciaAnchoResolvedPack(anchoZone, band, measured.authority);
                            const record: ZoningRecord = {
                                zoneCode: anchoZone,
                                zoneLabel: pack.zones[0]?.label ?? null,
                                jurisdictionId: MURCIA_JURISDICTION_ID,
                                structuredFields: {},
                                overlays: [],
                                ordinanceRef: pack.zones[0]?.ordinanceRef ?? null,
                                provenance: {
                                    source: 'murcia-pgou-tr-2012-ancho-de-calle',
                                    label:
                                        `PGOU de Murcia ${band.article} — height resolved from a ` +
                                        'CONSTRUCTED street width (SIG-MU2, human-signed 2026-08-02)',
                                    version: '2012-12',
                                    license: null,
                                    // §NATIVE-CRS-MEASUREMENT — the width was MEASURED in the
                                    // layer's native metric CRS, and the provenance says which one.
                                    // It read `EPSG:4326` while the proxy reprojected to degrees at
                                    // 4 decimals (~8,8 m of longitude at this latitude) — a claim
                                    // that was true about the wire and disastrous about the number.
                                    crs: measured.measurementCrs,
                                },
                            };
                            const env = computeBuildableEnvelope({
                                parcelRing: boundary.polygon,
                                edgeClassifications: boundary.edgeClassifications,
                                zoning: record,
                                rulePack: pack,
                            });
                            if (env.status === 'ok') {
                                dispatchEnvelope(ctx, site.id, env, JURISDICTION_REF);
                                console.log(
                                    `${TAG} §ANCHO-DE-CALLE ${anchoZone} — width ` +
                                        `${measured.width_m.toFixed(2)} m (±${measured.spread_m.toFixed(2)}, ` +
                                        `CONSTRUCTED from pgou_alineaciones) → ${band.floors} plantas / ` +
                                        `${band.height_m} m per ${band.article}. RENDERED at ` +
                                        `${env.confidence ?? 'n/a'}.`,
                                );
                                return;
                            }
                            console.log(
                                `${TAG} §ANCHO-DE-CALLE ${anchoZone} resolved ${band.floors} plantas but the ` +
                                    `envelope came back status=${env.status} — falling through to the cited refusal.`,
                            );
                        } else {
                            // Condition 4, or the Eje-Comercial classification we do not hold.
                            console.log(
                                `${TAG} §ANCHO-DE-CALLE ${anchoZone} — width ${measured.width_m.toFixed(2)} m ` +
                                    `(±${measured.spread_m.toFixed(2)}) REFUSED by ${band.article}: ` +
                                    `${band.reason}. No number rendered (SIG-MU2 condition 4).`,
                            );
                        }
                    } else {
                        console.log(
                            `${TAG} §ANCHO-DE-CALLE ${anchoZone} — no constructed width: ` +
                                `${measured.reason}. No number rendered.`,
                        );
                    }
                }
                const refusal = {
                    ...disposition.refusal,
                    // The parcel facts PRYZM established independently, ahead of the zoning facts
                    // the disposition read from the municipal records (L-553 — the card is never a
                    // blank panel, and it opens with the user's own land).
                    knownFacts: [...knownFacts, ...disposition.refusal.knownFacts],
                };
                dispatchEnvelope(
                    ctx,
                    site.id,
                    buildRefusedEnvelope(zoneCode, refusal, 'none'),
                    JURISDICTION_REF,
                );
                console.log(
                    `${TAG} live records resolved (calificación=${resolution.records.calificacion?.calificacion ?? 'n/a'} ` +
                        `ámbito=${resolution.records.sector?.sector ?? resolution.records.calificacion?.sector ?? 'n/a'}` +
                        `${resolution.records.supersededCount > 0 ? `, ${resolution.records.supersededCount} superseded record(s) dropped` : ''}) ` +
                        `— dispatched the ${refusal.code} refusal (legallyGrounded=${refusal.legallyGrounded}); ` +
                        `NO number rendered. area=${parcelAreaM2?.toFixed(0) ?? 'n/a'} m².`,
                );
                return;
            }
            // `unresolved` — the records did not identify the land. Fall through to the coverage
            // refusal below, which says so without claiming the ordinance grants nothing.
            console.log(`${TAG} disposition unresolved: ${disposition.reason}`);
        }

        // (3) No live records (or the disposition could not identify the land) → the COVERAGE
        // refusal. ⚠ `no-rule-pack` / `legallyGrounded: false` deliberately: this is a statement
        // about PRYZM, and asserting a legal "no" on urban land the ordinance probably DOES allow
        // building on is the opposite error, and the worse one.
        const why = resolution.ok
            ? 'the municipal records did not identify this land'
            : `the municipal planning service answered "${resolution.reason}"`;
        if (!resolution.ok) {
            // Failure vs absence, kept apart on the CARD as well as in the code (§CONTEXT-DATA-HONESTY).
            knownFacts.push(
                resolution.reason === 'endpoint-unreachable'
                    ? '⚠ Murcia\'s municipal planning service did not answer this request. That is a ' +
                      'temporary data-path failure, NOT a finding that the parcel carries no planning record.'
                    : resolution.reason === 'only-superseded-records'
                      ? '⚠ Every planning record covering this point is outside its validity interval ' +
                        '(superseded). PRYZM will not quote a repealed rule under a current-sounding citation.'
                      : resolution.reason === 'ambiguous-zone'
                        ? '⚠ More than one calificación covers this point (a zone boundary). PRYZM will ' +
                          'not pick one at random.'
                        : 'Murcia\'s municipal planning service published no record covering this point.',
            );
        }
        const coverage = murciaNoRulePackRefusal(null, null, knownFacts, derivedPlans);
        dispatchEnvelope(
            ctx,
            site.id,
            buildRefusedEnvelope(MURCIA_FALLBACK_ZONE_CODE, coverage, 'none'),
            JURISDICTION_REF,
        );
        console.log(
            `${TAG} ${why} — dispatched the coverage refusal (${coverage.code}); NO number rendered. ` +
                `derivedPlans=${derivedPlans.map((d) => `${d.kind}${d.ref ? ` ${d.ref}` : ''}`).join(' · ') || 'none'}.`,
        );
    } catch (e) {
        // Best-effort — never block the commit, and never leave an ESTIMATE on a jurisdiction we
        // answer. Try for the cited refusal instead (the Swiss posture, not the Córdoba one).
        console.warn(`${TAG} Murcia path failed (non-fatal) — attempting a cited refusal:`, e);
        try {
            const site = ctx.store.getSite();
            if (site) {
                dispatchEnvelope(
                    ctx,
                    site.id,
                    buildRefusedEnvelope(MURCIA_FALLBACK_ZONE_CODE, murciaNoRulePackRefusal(), 'none'),
                    JURISDICTION_REF,
                );
            }
        } catch { /* refusal dispatch is best-effort too */ }
    }
}

/**
 * §VALENCIA-ORIGEN-DERIVED-PLAN (2026-08-03) — CLOSURE-REGISTER #3.
 *
 * València (INE 46250) NEVER publishes a buildable number: `VALENCIA_ENVELOPE_VERIFIED` is `false`
 * (the ordinance's height/depth parameters are graphed on Plano C / gated on the unresolved
 * `altura` offset convention — `esValenciaEnvelope.ts`), and this function does not import that
 * constant or touch it. What it DOES do is read the LIVE `origen` field at the parcel
 * (`resolveValenciaOrigen`, `MapServer/231`) and choose between the two refusal tiers the registry
 * already ships: the STRONGER, legally-grounded `derived-plan` refusal
 * (`valenciaDerivedPlanRefusal`, `legallyGrounded: true`) when `origen` names a document other than
 * the PGOU, or the weaker, always-true coverage refusal (`valenciaNoRulePackRefusal`,
 * `legallyGrounded: false`) otherwise — INCLUDING every point this resolver could not answer, where
 * the coverage refusal remains the honest, unchanged prior behaviour.
 *
 * ⚠ On ANY resolution failure this falls through to `applyEstimatedZoning`, exactly like every
 * sibling city path (Murcia/Balears/Telde) — the registered-jurisdiction guard
 * (`refuseEstimateInsideRegisteredJurisdiction`) then dispatches its own honest refusal, so a
 * transport failure here never becomes a fabricated estimate and never becomes a blank panel.
 */
async function applyValenciaZoningThenFallback(
    ctx: SiteContext,
    lat: number,
    lon: number,
    estimated: BuildableEnvelope | null,
): Promise<void> {
    const TAG = '[gis][c58] §VALENCIA-ORIGEN-DERIVED-PLAN';
    const JURISDICTION_REF = VALENCIA_JURISDICTION_ID;
    const VALENCIA_FALLBACK_ZONE_CODE = 'valencia-pgou';
    try {
        const site = ctx.store.getSite();
        if (!site) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }

        // Best-effort enrichment — the referencia catastral, same national proxy every Spanish
        // click uses. A miss costs the card some specificity and nothing else (L-553).
        let refcat: string | null = null;
        try {
            const parcel = await catastroParcelProvider.fetchParcelAtPoint(lon, lat);
            refcat = parcel?.refcat ?? null;
        } catch { /* the parcel leg is enrichment, never a precondition */ }

        const knownFacts: string[] = [
            `Location: València (${lat.toFixed(5)}, ${lon.toFixed(5)})`,
            refcat !== null ? `Referencia catastral: ${refcat}` : null,
        ].filter((s): s is string => typeof s === 'string');

        const resolution = await resolveValenciaOrigen({ lat, lon });

        if (resolution.ok && resolution.origen && !valenciaOrigenIsPgouOrdered(resolution.origen)) {
            // ⭐ THE UPGRADE — a live, non-`PGOU*` `origen` licenses the stronger refusal.
            const refused = valenciaDerivedPlanRefusal(
                resolution.origen,
                resolution.califi,
                null,
                knownFacts,
            );
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(resolution.califi ?? VALENCIA_FALLBACK_ZONE_CODE, refused, 'none'),
                JURISDICTION_REF,
            );
            console.log(
                `${TAG} live origen="${resolution.origen}" (califi=${resolution.califi ?? 'n/a'}) is ` +
                    `NOT PGOU-ordered — dispatched the STRONGER ${refused.code} refusal ` +
                    `(legallyGrounded=${refused.legallyGrounded}); NO number rendered.`,
            );
            return;
        }

        // Either `origen` IS the PGOU, or the live read did not resolve one — both cases keep the
        // weaker, always-true coverage refusal that València has always shipped. Never a blank
        // panel: this branch runs INSTEAD of the generic estimate-suppressed card so the known
        // facts and zone identity gathered above are not thrown away.
        if (resolution.ok) {
            knownFacts.push(
                resolution.origen
                    ? `Governing instrument (live): ${resolution.origen}`
                    : 'The municipal service did not record a governing instrument at this point.',
            );
        } else if (resolution.reason === 'service-error') {
            knownFacts.push(
                "⚠ València's municipal zoning service did not answer this request. That is a " +
                    'temporary data-path failure, NOT a finding about the governing instrument.',
            );
        }
        const coverage = valenciaNoRulePackRefusal(resolution.ok ? resolution.califi : null, null, knownFacts);
        dispatchEnvelope(
            ctx,
            site.id,
            buildRefusedEnvelope(
                (resolution.ok ? resolution.califi : null) ?? VALENCIA_FALLBACK_ZONE_CODE,
                coverage,
                'none',
            ),
            JURISDICTION_REF,
        );
        console.log(
            `${TAG} ${
                resolution.ok
                    ? `live origen=${resolution.origen ?? 'n/a'} is PGOU-ordered or unrecorded`
                    : `origen resolution failed (${resolution.reason})`
            } — dispatched the coverage refusal (${coverage.code}); NO number rendered.`,
        );
    } catch (e) {
        // Best-effort — never block the commit, and never leave an ESTIMATE on a jurisdiction we
        // answer.
        console.warn(`${TAG} València path failed (non-fatal) — attempting a cited refusal:`, e);
        try {
            const site = ctx.store.getSite();
            if (site) {
                dispatchEnvelope(
                    ctx,
                    site.id,
                    buildRefusedEnvelope(VALENCIA_FALLBACK_ZONE_CODE, valenciaNoRulePackRefusal(), 'none'),
                    JURISDICTION_REF,
                );
            }
        } catch { /* refusal dispatch is best-effort too */ }
    }
}

/**
 * BARCELONA-GIS-AUDIT-SPIKE §BCN-CLAU18-OV — attempt the clau-18 (*volumetria específica*)
 * `explicit-area` envelope from the AMB Refós OV_Trames layer (a published volumetric footprint +
 * a PLANTES floor count). Returns `true` iff it dispatched a constructed envelope; `false` on ANY
 * miss, in which case the caller shows the existing cited clau-18 refusal (an absent number costs
 * nothing; a wrong one costs credibility).
 *
 * ⚠ THE CALLER GATES THIS ON `BCN_REFOS_OV_CERTIFIED` (default OFF) — this function is not even
 * reached while the L-449 certification is unsigned. When it is reached, the envelope it dispatches
 * is `estimated-ruleset`, NEVER `structured`: the footprint is live Refós DATA but its vintage is
 * uncertified, and the metre height is a floors→metres CONVENTION (Art. 327.2 storey module) applied
 * to a sourced floor count, not a sourced height. Both facts ride as caveats naming the AMB Refós.
 *
 * FRAME: identical to `applyMadridZoningThenFallback` — the OV ring returns WGS84 and is projected
 * into the SAME authoring frame (origin + θ) the parcel already lives in, then clipped to the parcel
 * by `computeBuildableEnvelope`'s explicit-area branch. Best-effort; never throws.
 */
async function tryBcnClau18Volumetria(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    clauLabel: string | null,
    municipality: AmbRegisteredMunicipality,
): Promise<boolean> {
    const TAG = '[gis][c58] §BCN-CLAU18-OV';
    try {
        const site = ctx.store.getSite();
        if (!site) return false;
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) return false;

        // (0) §AMB-VOLUMETRIA-18 — WHICH PACK CITES THIS MUNICIPALITY'S clau 18? `null` for 35 of
        // the AMB's 36: the OV footprint is metropolitan DATA, but the citation is PGM Art. 306,
        // whose metropolitan force is a per-municipality question (Cerdanyola and Sant Cugat
        // demonstrably REWROTE it; for the rest `ambArticleScopeFor` answers `'unknown'`). Refusing
        // here keeps the cited clau-18 refusal — the alternative is publishing a real footprint
        // under an article that may not govern it, which is a fabricated legal claim.
        const rulePack = ambVolumetria18PackFor(municipality.ineCode);
        if (!rulePack) {
            console.log(
                `${TAG} no authorised clau-18 volumetric pack for INE ${municipality.ineCode} ` +
                    `(${municipality.nameInSource}) — the OV footprint may be readable, but PGM Art. 306's ` +
                    `force there is not recorded. Cited refusal stands.`,
            );
            return false;
        }

        // (1) Resolve the published volumetric footprint + PLANTES at the parcel point (WGS84).
        // Never throws; a typed refusal → we return false and the caller keeps the clau-18 refusal.
        // ⚠ `municipality` is the `CODI_INE` filter — the resolver has no Barcelona default.
        const resolution = await resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, { lat, lon }, { municipality });
        if (!resolution.ok || resolution.ringLatLon.length < 3) {
            console.log(
                `${TAG} OV not resolved (${resolution.ok ? 'degenerate-ring' : resolution.reason}) — refusal stands.`,
            );
            return false;
        }

        // (2) The floor count → an *alçada* estimate, reusing the Art. 327.2 storey module. A count
        // that cannot convert (non-positive) → refuse rather than publish a footprint with no height.
        const h = heightFromFloorsAboveGround(resolution.plantes.floorsAboveGround);
        if (!h) {
            console.log(`${TAG} PLANTES "${resolution.plantes.raw}" → no height — refusal stands.`);
            return false;
        }

        // (3) Project the WGS84 OV ring into the parcel's authoring frame (origin + θ). Same
        // transform as the Madrid explicit-area path; any other frame yields a garbage clip.
        const origin = { lat: site.location.latitude, lon: site.location.longitude };
        const rawTheta = site.location.trueNorth;
        const theta = Number.isFinite(rawTheta) ? rawTheta : 0;
        const toAuthoringFrame = (p: LatLon): Pt => {
            const xz = latLonToSceneXZ(p, origin.lat, origin.lon);
            if (theta === 0) return { x: xz.x, z: xz.z };
            const e = trueVectorToProjectNorth({ east: xz.x, north: -xz.z }, theta);
            return { x: e.east, z: -e.north };
        };
        const footprintRing: Pt[] = resolution.ringLatLon.map((ll) =>
            toAuthoringFrame({ lat: ll.lat, lon: ll.lon }),
        );

        // (4) Clip parcel ∩ OV footprint via the engine's explicit-area branch (the pack states no
        // parameters; its geometricRule is `explicit-area` with the OV ringRef).
        const record: ZoningRecord = {
            zoneCode: BCN_VOLUMETRIA_18_ZONE_CODE,
            zoneLabel: clauLabel ?? 'Ordenació en volumetria específica (clau 18)',
            // ⚠ THE MUNICIPALITY'S OWN id, never a Barcelona constant — this record carries the
            // citation shown to the user, and stamping `es-08019-barcelona` on another town's
            // parcel is the §LH-ENVELOPE / L-652 mis-citation. The type guarantees it is non-null.
            jurisdictionId: municipality.jurisdictionId,
            structuredFields: {},
            overlays: [],
            ordinanceRef: null, // the pack zone supplies the citation.
            provenance: {
                source: 'catastro-muc',
                label: 'AMB Refós de Planejament — OV_Trames (ordenació volumètrica) + MUC clau',
                version: null,
                license: null,
                crs: 'EPSG:3857',
            },
        };
        const envelope = computeBuildableEnvelope({
            parcelRing: boundary.polygon,
            edgeClassifications: boundary.edgeClassifications,
            zoning: record,
            rulePack,
            explicitAreaFootprint: footprintRing,
        });
        if (envelope.status !== 'ok' || envelope.insetPolygon.length < 3) {
            console.log(`${TAG} explicit-area clip status=${envelope.status} — refusal stands. caveats: ${envelope.caveats.join(' | ')}`);
            return false;
        }

        // (5) The engine leaves height/floors null (the pack states none). Attach the OV-derived
        // floor count + the storey-module height here — the same enrichment shape as the §L-591 20a
        // FAR fill — and re-derive the study volume. Confidence STAYS `estimated-ruleset` (the engine
        // never upgrades it: the `block-constructed` upgrade keys on an `alignment.depthBinding` row
        // that an explicit-area solve does not emit). NEVER `structured`.
        const totalStoreys = resolution.plantes.totalStoreys;
        const heightBasisNote =
            h.basis === 'table-exact'
                ? 'height from the PGM Art. 327.2 storey table for that floor count'
                : 'height EXTRAPOLATED on the Art. 327.2 storey module (the floor count exceeds the ' +
                  'table’s PB+6 range) — an estimate';
        const atticNote = resolution.plantes.hasAttic
            ? ' The top floor is an àtic (recessed penthouse), counted but not set back in this massing.'
            : '';
        const enriched: BuildableEnvelope = {
            ...envelope,
            maxHeight_m: h.height_m,
            maxFloors: totalStoreys,
            maxVolumeM3: Number.isFinite(envelope.insetAreaM2) ? envelope.insetAreaM2 * h.height_m : envelope.maxVolumeM3,
            derivation: [
                ...envelope.derivation,
                {
                    constraint: 'maxHeight' as const,
                    value: h.height_m,
                    zoneCode: BCN_VOLUMETRIA_18_ZONE_CODE,
                    source:
                        `AMB Refós OV_Trames PLANTES=${resolution.plantes.raw} ` +
                        `(${resolution.plantes.floorsAboveGround} above ground) → ${heightBasisNote}`,
                    fieldProvenance: 'estimated' as const,
                    ordinanceRef: BCN_VOLUMETRIA_18_ORDINANCE_REF,
                },
            ],
            caveats: [
                ...envelope.caveats,
                `clau 18 (ordenació en volumetria específica): the buildable footprint and the ` +
                    `floor count (${resolution.plantes.raw}) come from the AMB "Refós de Planejament" ` +
                    `OV_Trames layer${resolution.clau ? ` (CLAU ${resolution.clau}` : ''}` +
                    `${resolution.expedient ? `, exp. ${resolution.expedient})` : resolution.clau ? ')' : ''}. ` +
                    `The Refós is a transcripció gràfica i alfanumèrica whose vintage is ` +
                    `UNCERTIFIED. The metre height is a floors→metres convention (${heightBasisNote}), not ` +
                    `a sourced clau-18 height.${atticNote} Verify against the fitxa urbanística before relying on it.`,
            ],
        };

        dispatchEnvelope(ctx, site.id, enriched, 'muc-catastro');
        console.log(
            `${TAG} OV envelope OK → PLANTES=${resolution.plantes.raw} floors=${totalStoreys} ` +
                `height=${h.height_m.toFixed(2)}m (${h.basis}) inset=${enriched.insetAreaM2.toFixed(1)}m² ` +
                `clau=${resolution.clau ?? 'n/a'} exp=${resolution.expedient ?? 'n/a'} — estimated-ruleset, gate CERTIFIED.`,
        );
        return true;
    } catch (e) {
        console.warn(`${TAG} clau-18 OV path failed (non-fatal) — refusal stands:`, e);
        return false;
    }
}

/**
 * §BALEARS-ENVELOPE (L-680) — the Illes Balears path. Govern de les Illes Balears, MUIB.
 *
 * ⚠⚠ READ THIS BEFORE "FINISHING" IT: THE DATA IS THE BEST IN SPAIN AND THIS PATH STILL DRAWS
 * NOTHING. That is not a missing feature; it is the two facts below, and neither is closed by code:
 *
 *   1. NOBODY HAS SIGNED THE READING. `BALEARS_ENVELOPE_VERIFIED` is `false`. MUIB is a MAPPING
 *      PRODUCT that links to a normative *fitxa*, and only 2.0 % of fitxes cite the governing
 *      article ON the parameter — so publishing a fitxa cell as a determination asserts a
 *      relationship between the cell and the ordinance that nobody has established. L-449 reserves
 *      that acceptance to a person.
 *   2. THE TOP IS OPEN. Six constraint families are unmodelled (`BALEARS_MISSING_CONSTRAINTS`:
 *      heritage, flood, airport, coastal, environmental, and the island PTIs). Each can only
 *      REDUCE the solid, so any envelope here is an UPPER BOUND with respect to all six. Drawing an
 *      upper bound as a closed box is exactly the L-616 overstatement.
 *
 * ⇒ WHAT THIS PATH BUYS IS NOT A NUMBER, IT IS SPECIFICITY — and it is a large gain over what a
 * Balears click produced before, which was the generic ESTIMATED TRIPLE (3,0/1,5/3,0 m, FAR 2,00,
 * 50 %) on land PRYZM had read no article about. The refusal now names the user's zone, its
 * municipal designation, the governing plan, the land class, the article the fitxa cites, and the
 * fitxa's own parameters — as CITED PROSE. No number reaches the massing, the generator bounds or
 * `site.updateZoning`; `status: 'none'` keeps every numeric field null and clears any stale
 * `buildableRing` (`dispatchEnvelope` writes a ring only on `'ok'`).
 *
 * THE CHAIN: `isInBalears` (S2 gate) → `catastroParcelProvider` (refcat + address + official area,
 * national, already live) → `resolveBalearsMuib` (S3, live zone + fitxa via the same-origin
 * `/api/es/balears-muib` proxy; 12 discriminated refusal reasons, never a silent null) →
 * `envelopePublicationPosture` (the ONE authorisation decision point) → `balearsResolvedPack` /
 * `balearsRefusal` (PURE) → `buildRefusedEnvelope` → `dispatchEnvelope` (P6 — `site.updateZoning`,
 * never a direct store write).
 *
 * ⚠ THE GATE IS READ THROUGH `envelopePublicationPosture`, NOT AS A CONSTANT — the
 * §MURCIA-GATE-BYPASS-REGRESSION lesson applied pre-emptively. That function consults the L-449
 * gate AND the open-top registry, so opening either door needs NO edit here.
 *
 * ⭐ §OPEN-TOP-INDICATIVE — THE SECOND DRAWING ARM NOW EXISTS AND IS STILL SHUT. The renderer input
 * has landed: the posture is a fourth signal to `classifyEnvelopeCompleteness`, `complete` is
 * UNREACHABLE for an indicative envelope, and both rasterisers draw it UNCAPPED
 * (`rendererCanExpressOpenTop === true`, measured). So an indicative Balears would now draw a
 * provisional-grey OPEN-TOP volume that cannot be confused with a determination — but it draws
 * NOTHING today, because `OPEN_TOP_INDICATIVE_JURISDICTIONS` is EMPTY and listing a jurisdiction is
 * a founder line. What changed is that the founder's decision is now a one-line registry entry
 * instead of a blocked one; the decision itself has NOT been taken here.
 *
 * Fully guarded: it never throws into the commit path, and it never falls back to the estimated
 * triple on a jurisdiction we DO answer.
 */
async function applyBalearsZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    estimated: BuildableEnvelope | null,
): Promise<void> {
    const TAG = '[gis][c58] §BALEARS-ENVELOPE';
    const JURISDICTION_REF = 'goib-muib';
    try {
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        const site = ctx.store.getSite();
        if (!site) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }

        // (1) The PARCEL half — the national Catastro path every Spanish click already uses.
        // Best-effort: a miss costs the refusal some specificity and nothing else.
        let refcat: string | null = null;
        let address: string | null = null;
        try {
            const parcel = await catastroParcelProvider.fetchParcelAtPoint(lon, lat);
            refcat = parcel?.refcat ?? null;
            address = parcel?.address ?? null;
        } catch { /* the parcel leg is enrichment, never a precondition */ }

        // (2) The ZONING half — the live MUIB zone + its fitxa at the point. Never throws; a
        // failure and an absence stay DIFFERENT answers all the way to the card.
        const asOf = new Date().toISOString().slice(0, 10);
        const resolution = await resolveBalearsMuib({ lat, lon }, { asOf });

        const baseFacts: string[] = [
            `Location: Illes Balears (${lat.toFixed(5)}, ${lon.toFixed(5)}) — ${BALEARS_JURISDICTION_ID}`,
            refcat !== null ? `Referencia catastral: ${refcat}` : null,
            address !== null ? `Address: ${address}` : null,
        ].filter((s): s is string => typeof s === 'string');

        // ── The REFUSAL branches: the provider could not reach an answer it may state. ──
        if (!resolution.ok) {
            const f = resolution.feature ?? null;
            const zoneCode = f?.CODIMUIB ?? f?.CODIAJ ?? null;
            const refusal = balearsRefusal(resolution.reason, {
                zoneCode,
                zoneLabel: f?.NOM ?? null,
                municipality: f?.MUNICIPI ?? null,
                detail: resolution.detail ?? null,
                knownFacts: [
                    ...baseFacts,
                    f?.CODIPLA ? `Governing plan: ${f.CODIPLA}` : null,
                    f?.CODICLAS ? `Land class: ${f.CODICLAS}` : null,
                ].filter((s): s is string => typeof s === 'string'),
            });
            // ⚠ `'not-applicable'` would assert the ordinance answered "no envelope here". Only the
            // three LEGALLY GROUNDED reasons earn that; everything else attempted and learned
            // nothing, which is `'none'`. Both clear a stale ring, so L-445 holds either way.
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(zoneCode, refusal, refusal.legallyGrounded ? 'not-applicable' : 'none'),
                JURISDICTION_REF,
            );
            console.log(
                `${TAG} refused reason=${resolution.reason} ` +
                    `transient=${balearsRefusalIsTransient(resolution.reason)} ` +
                    `zone=${zoneCode ?? 'n/a'} municipi=${f?.MUNICIPI ?? 'n/a'} — NO number rendered.`,
            );
            return;
        }

        // ── The parcel RESOLVED. Now, and only now, the authorisation question. ──
        const record = resolution.record;
        const pack = balearsResolvedPack(record);
        const zone = pack.zones[0]!;
        const zoneCode = zone.code;
        const posture = envelopePublicationPosture(BALEARS_JURISDICTION_ID);

        // What the publisher actually says, carried as FACTS on whatever we dispatch. ⚠ These are
        // the fitxa's own printed values; a field the fitxa did not print is ABSENT here, never 0.
        const parameterFacts: string[] = [
            `Zone: ${zone.label} (${zoneCode})`,
            record.feature.CODIPLA ? `Governing plan: ${record.feature.CODIPLA}` : null,
            record.feature.CODICLAS ? `Land class: ${record.feature.CODICLAS}` : null,
            record.feature.MUNICIPI ? `Municipality: ${record.feature.MUNICIPI}` : null,
            zone.maxFloors !== null ? `Nombre de plantes (fitxa): ${zone.maxFloors}` : null,
            zone.maxHeight_m !== null ? `Alçada (fitxa): ${zone.maxHeight_m} m` : null,
            zone.maxCoverage !== null ? `Ocupació (fitxa): ${(zone.maxCoverage * 100).toFixed(0)} %` : null,
            zone.plotRatioFAR !== null ? `Edificabilitat (fitxa): ${zone.plotRatioFAR} m²/m²` : null,
            record.articleRefs.length > 0
                ? `Article cited by the fitxa: ${record.articleRefs.join(' · ')}`
                : 'Article: the fitxa cites none on these parameters (measured: only 2.0 % do)',
            `Fitxa: ${record.fitxaUrl}`,
        ].filter((s): s is string => typeof s === 'string');

        // ── THE DRAWING ARM — TWO POSTURES, ONE COMPUTATION, TWO DIFFERENT CLAIMS. ──
        //
        // ⚠ BOTH ARE UNREACHABLE TODAY: the L-449 gate is shut AND `OPEN_TOP_INDICATIVE_JURISDICTIONS`
        // ships empty, so `posture.posture` is `'refused'` for Balears and this whole block is skipped.
        // Each arm opens by a ONE-LINE founder edit in the package (a signature, or a registry entry),
        // with no edit here — the §MURCIA-GATE-BYPASS-REGRESSION discipline.
        //
        // ⭐ WHY THEY SHARE THE COMPUTATION AND DIFFER ONLY IN THE STAMP. The GEOMETRY a fitxa's rule
        // produces on this parcel is the same question either way; what differs is what PRYZM may SAY
        // about it. Duplicating the arm would let the two computations drift until "indicative" meant
        // a different shape rather than a different claim. So the envelope is computed once and the
        // posture is stamped on it — `publicationPosture` then forces `complete: false` + `openTop`
        // through the L2 classifier onto EVERY solid, on both the globe and the plan overlay.
        //
        // ⛔ THE INDICATIVE ARM IS ADDITIONALLY GATED ON `rendererCanExpressOpenTop` (a MEASUREMENT of
        // the render path, not a permission). If that ever regresses to false, this arm self-disables
        // back to the cited refusal below rather than shipping a solid that looks complete — ADR-0293.
        const indicativeDrawable =
            posture.posture === 'open-top-indicative' && rendererCanExpressOpenTop;
        if (posture.posture === 'determination' || indicativeDrawable) {
            // ADR-0293: an envelope drawn on EITHER arm MUST carry the open-top reasons as caveats —
            // they are what make the solid an upper bound rather than a determination about the
            // whole site.
            const envelope = computeBuildableEnvelope({
                parcelRing: boundary.polygon,
                edgeClassifications: boundary.edgeClassifications,
                zoning: {
                    zoneCode,
                    zoneLabel: zone.label,
                    jurisdictionId: BALEARS_JURISDICTION_ID,
                    // The fitxa's numbers reach the engine through the PACK, not as "published by
                    // the municipality" structured fields — laundering them would overstate the tier.
                    structuredFields: {},
                    overlays: [],
                    ordinanceRef: zone.ordinanceRef ?? null,
                    provenance: {
                        source: 'goib-muib-fitxa',
                        label: `GOIB MUIB normative fitxa — ${record.fitxaUrl}`,
                        version: record.feature.DINIVIGEN ?? null,
                        license: null,
                        crs: 'EPSG:4326',
                    },
                } as ZoningRecord,
                rulePack: pack,
            });
            if (envelope.status === 'ok') {
                dispatchEnvelope(
                    ctx,
                    site.id,
                    {
                        ...envelope,
                        // §OPEN-TOP-INDICATIVE — ⭐ THE STAMP IS THE WHOLE DIFFERENCE BETWEEN THE TWO
                        // ARMS, and it is carried BY THE ENVELOPE so every downstream surface reads
                        // one decision. On the indicative arm the L2 classifier makes `complete`
                        // UNREACHABLE and sets `openTop`, so the solid renders provisional-grey and
                        // UNCAPPED — it cannot be mistaken for the determination arm's closed box on
                        // any surface, including one written later. It is `posture.posture` verbatim
                        // and never a literal: re-deriving it here would be a second authority.
                        publicationPosture: posture.posture,
                        caveats: [
                            ...envelope.caveats,
                            // ⚠ `c: string` is annotated, not inferred: in the root tsconfig this
                            // module's `@pryzm/site-parcel-data` types do not resolve until the
                            // package is built, and an un-annotated callback param becomes an
                            // implicit `any` — one more error in a hard-failing build.
                            ...BALEARS_MISSING_CONSTRAINTS.map(
                                (c: string) => `OPEN TOP (ADR-0293) — not accounted for: ${c}`,
                            ),
                            // ⛔ THE CLAIM ITSELF, IN WORDS, ON THE INDICATIVE ARM. A caveat list of
                            // unmodelled layers still reads like a determination with footnotes; this
                            // says the thing outright, so an exported or screenshotted card carries
                            // it even when the geometry does not travel with it.
                            ...(indicativeDrawable
                                ? [
                                      'INDICATIVE (ADR-0293) — PRYZM claims NO buildable right here. ' +
                                          'This volume is drawn with an OPEN TOP: it is an upper bound ' +
                                          'that the unmodelled constraints above can only REDUCE, and ' +
                                          'it is not a determination.',
                                  ]
                                : []),
                        ],
                    },
                    JURISDICTION_REF,
                );
                console.log(
                    `${TAG} zone ${zoneCode} RENDERED at ${envelope.confidence ?? 'n/a'} ` +
                        `posture=${posture.posture}` +
                        `${indicativeDrawable ? ' — OPEN TOP, no buildable right claimed' : ''}.`,
                );
                return;
            }
            // The fitxa's own rule leaves no buildable footprint on THIS parcel. A cited refusal is
            // the honest answer; the estimated triple would overstate it.
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(
                    zoneCode,
                    {
                        code: 'source-data-unavailable',
                        headline: `${zone.label} (${zoneCode}): the fitxa's own conditions leave no buildable footprint on this parcel.`,
                        detail:
                            'PRYZM applied the zone\'s published parameters to your parcel boundary and the ' +
                            'resulting footprint is empty — typically a plot narrower than the zone\'s ' +
                            'setbacks permit. PRYZM will not substitute an estimated figure. ' +
                            BALEARS_ROADMAP_LINE,
                        ordinanceRef: zone.ordinanceRef ?? null,
                        legallyGrounded: false,
                        knownFacts: [...baseFacts, ...parameterFacts],
                    },
                    'none',
                ),
                JURISDICTION_REF,
            );
            console.log(`${TAG} zone ${zoneCode} produced status=${envelope.status} — refusal dispatched.`);
            return;
        }

        // ── THE SHIPPED PATH: the zone and its parameters are KNOWN and are SHOWN, and PRYZM
        //    publishes no figure. `posture.authorisationReason` distinguishes "a human has not
        //    signed" (`gate-shut`) from "nobody has ever looked here" (`unknown-jurisdiction`) —
        //    collapsing them would lose the difference this whole subsystem exists to keep.
        // ⚠ REACHED BY AN INDICATIVE JURISDICTION ONLY IF THE RENDER PATH REGRESSED. The indicative
        // arm above draws whenever `rendererCanExpressOpenTop` holds; if that measurement ever goes
        // false the posture falls through to HERE — the cited refusal — and says so, rather than
        // shipping a solid that looks complete (ADR-0293). Silence in that case would be the
        // §CONTEXT-DATA-HONESTY defect: a render regression presenting as an ordinary refusal.
        const indicativeNote =
            posture.posture === 'open-top-indicative'
                ? ' ⚠ This jurisdiction IS listed as OPEN-TOP INDICATIVE, but the renderer cannot ' +
                  'currently express an open top, so PRYZM draws nothing rather than ship a solid ' +
                  'that looks complete. This is a PRYZM render-path regression, not a change in what ' +
                  'is known about your land.'
                : '';
        dispatchEnvelope(
            ctx,
            site.id,
            buildRefusedEnvelope(
                zoneCode,
                {
                    // A statement about PRYZM's publication state, never about the land.
                    code: 'no-rule-pack',
                    headline:
                        `${zone.label} (${zoneCode})${record.feature.MUNICIPI ? ` — ${record.feature.MUNICIPI}` : ''}: ` +
                        'PRYZM has read this zone\'s published rule but publishes no buildable figure from it yet.',
                    detail:
                        'The Govern de les Illes Balears publishes this zone\'s parameters in its normative ' +
                        'fitxa, and they are listed below exactly as printed. PRYZM does not draw them, for ' +
                        'two reasons that are both about PRYZM and neither about your land: the reading is ' +
                        'not yet human-signed, and six constraint families are unmodelled (heritage, flood, ' +
                        'airport, coastal, environmental, and the island territorial plans), each of which ' +
                        'can only reduce a buildable envelope — so any solid drawn today would be an upper ' +
                        `bound shown as a determination.${indicativeNote} ` +
                        BALEARS_ROADMAP_LINE,
                    // The fitxa, the plan and (where printed) the article — a citation the user can
                    // dereference, which is the whole difference from a generic coverage gap.
                    ordinanceRef: zone.ordinanceRef ?? null,
                    legallyGrounded: false,
                    knownFacts: [...baseFacts, ...parameterFacts],
                },
                'none',
            ),
            JURISDICTION_REF,
        );
        console.log(
            `${TAG} RESOLVED zone=${zoneCode} municipi=${record.feature.MUNICIPI ?? 'n/a'} ` +
                `pla=${record.feature.CODIPLA ?? 'n/a'} drawability=${record.drawability.tier} ` +
                `articles=[${record.articleRefs.join(', ')}] — posture=${posture.posture} ` +
                `(${posture.authorisationReason}). Parameters SHOWN as cited prose; NO number rendered.`,
        );
    } catch (e) {
        // ⛔ NEVER the estimated triple on Balears land — `applyEstimatedZoning` refuses inside a
        // registered jurisdiction (§L-663), and Balears is now registered, so this is a cited
        // refusal too. The call is kept so the chokepoint owns that decision in ONE place.
        console.warn(`${TAG} Balears path failed (non-fatal) — the §L-663 chokepoint refuses:`, e);
        try { applyEstimatedZoning(ctx, estimated); } catch { /* estimated is best-effort too */ }
    }
}

/**
 * ADR-0271 §BCN-REAL-ENVELOPE — the Barcelona (Eixample) path. Resolves a REAL, CITED
 * buildable envelope for a clau 13a/13E parcel: the *profunditat edificable* is CONSTRUCTED
 * from the block per PGM Art. 242.2 (`ES_BARCELONA_ENSANCHE_PACK` +
 * `block-derived-alignment`), never guessed.
 *
 * THE SAFETY CONTRACT (founder's rule): an ABSENT/refused envelope costs nothing, a WRONG
 * *profunditat edificable* costs credibility. So EVERY problem — no clau / non-Eixample clau /
 * no refcat / no block / a non-conforming block tiling (dissolve `degenerate`) / no street
 * frontages / any thrown error / an envelope whose `status !== 'ok'` — refuses.
 *
 * ⚠ §L-663 — "REFUSES", NOT "FALLS BACK TO THE ESTIMATE". This paragraph used to end *"routes to
 * `applyEstimatedZoning` … the worst outcome is 'same as today (estimated)'"*, and that sentence
 * was false in the only way that matters: on a *segons alineacions de vial* clau the estimated
 * triple is not a weaker version of the right answer, it is a different geometric OPERATION
 * (C58 §1.11), and it renders in the same purple volume as a real determination. The founder hit
 * exactly this on a hand-drawn Eixample boundary. The residual `applyEstimatedZoning` calls below
 * are still here, but that function now refuses inside any registered jurisdiction — so the worst
 * outcome on Barcelona land is a cited refusal, never a number. Never throws into the commit path.
 *
 * ⚠ FRAME (the correctness crux): by the time this runs, `boundary.polygon` is already in the
 * θ-DE-ROTATED authoring frame (`dispatchParcelBoundary` squared the parcel to project north
 * BEFORE `applyZoning`). So the block ring AND the roads are projected about the SAME site
 * origin and de-rotated by the SAME θ (`site.location.trueNorth`, which `dispatchParcelBoundary`
 * persisted via `dispatchSiteTrueNorth`) — see `toAuthoringFrame` below. Any other frame yields
 * a garbage envelope.
 */
/**
 * §STALE-ASYNC-ZONING (L-644) — the ctx-aware wrapper `isZoningResponseStale` needs at every
 * resume point inside an async BCN zoning continuation: is the boundary THIS call was launched
 * to solve still the one committed on the Site? Logs + returns false (STALE) so every call site
 * reads as a one-line early-return guard. See `isZoningResponseStale` for the full defect story.
 */
function bcnZoningStillCurrent(ctx: SiteContext, boundary: ZoningBoundary, tag: string): boolean {
    const current = ctx.store.getSite()?.parcel?.boundary?.polygon;
    if (!isZoningResponseStale(boundary.polygon, current)) return true;
    console.warn(
        `${tag} §STALE-ASYNC-ZONING — discarding this response: the committed parcel boundary ` +
            'changed (Redraw / a different parcel selected+committed) while this real-envelope ' +
            'fetch chain was still in flight. Writing it now would overwrite the CURRENTLY active ' +
            "parcel's envelope with a DIFFERENT parcel's geometry — the \"purple volume sits on " +
            'the neighbouring plot" symptom. Not the 9acd599d origin-ordering bug: this is a race, ' +
            'so it is intermittent and looks parcel-specific rather than universal.',
    );
    return false;
}

async function applyBcnZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    estimated: BuildableEnvelope | null,
    municipality: AmbRegisteredMunicipality,
): Promise<void> {
    const TAG = '[gis][c58] §BCN-REAL-ENVELOPE';
    // §AMB-UNBIND (2026-08-02) — the jurisdiction is the MUNICIPALITY'S, read from the parameter,
    // not the module-level `BCN_JURISDICTION_ID` constant. `AmbRegisteredMunicipality` guarantees a
    // non-null id at compile time, so there is no `?? BCN_JURISDICTION_ID` fallback that could
    // silently answer another town's land with Barcelona's packs and Barcelona's citations.
    const jurisdictionId = municipality.jurisdictionId;
    try {
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }

        // (b+c) §L-516b — the planning clau (MUC) and the Catastro parcel are INDEPENDENT point
        // lookups (both keyed on lat/lon; neither needs the other), so awaiting them sequentially
        // added a whole round-trip to the placeholder→real transition (founder: "it takes time to go
        // from placeholder to real"). Fetch them in PARALLEL. Trade-off: on a NON-Eixample plot the
        // parcel fetch is now made-then-discarded (a cheap wasted call, and such plots fall back to
        // estimated anyway); on the Eixample demo path — the one that matters — it saves a full
        // Catastro round-trip off the critical path.
        const qualP = fetchQualificationAtPoint(lat, lon);
        const parcelP = catastroParcelProvider.fetchParcelAtPoint(lon, lat);
        // §STARTUP-BLOCK-OVERLAP (founder 2026-08-07, 5–10× startup) — START THE BLOCK FETCH THE
        // MOMENT THE REFCAT EXISTS, concurrent with the MUC qualification lookup still in flight.
        // The manzana fetch was the measured worst single item on the post-commit path (founder
        // log: `§BCN-ENVELOPE-TIMING block fetch 4626 ms`), and it used to start only after BOTH
        // point lookups AND the disposition logic had finished — serial time the block does not
        // need (its only input is the parcel's refcat + centroid). Chaining it off `parcelP`
        // overlaps it with the qual round-trip, the same trade §L-516b already accepted one step
        // earlier: on a clau that turns out to need no block (refusal / §L-591 parcel-only) the
        // call is made-then-discarded — a cheap wasted proxy call on the paths that were cheap
        // anyway, in exchange for starting the expensive path's longest fetch as early as the
        // data dependency allows. `.catch(() => null)` because `fetchBlockForParcel` never
        // throws by contract, but an unhandled rejection on a discarded branch must be
        // structurally impossible.
        const tParcelStart = performance.now();
        const blockP = parcelP
            .then((pf) => {
                if (!pf?.refcat) return null;
                const ring0 = Array.isArray(pf.ring) ? pf.ring : null;
                const c =
                    ring0 && ring0.length >= 3
                        ? {
                              lat: ring0.reduce((s: number, p: LatLon) => s + p.lat, 0) / ring0.length,
                              lon: ring0.reduce((s: number, p: LatLon) => s + p.lon, 0) / ring0.length,
                          }
                        : undefined;
                return fetchBlockForParcel(pf.refcat, undefined, c);
            })
            .catch(() => null);
        const [qual, parcelFeat] = await Promise.all([qualP, parcelP]);
        // §STALE-ASYNC-ZONING — the first (and most common) resume point: bail before touching
        // the store at all if a different parcel is now committed.
        if (!bcnZoningStillCurrent(ctx, boundary, TAG)) return;
        if (!qual) {
            // §L-663 — **THIS IS THE LINE THE FOUNDER'S EIXAMPLE PARCEL ESCAPED THROUGH.**
            //
            // The MUC did not name a clau. `fetchQualificationAtPoint` returns `null` for a
            // network error, a non-200, a non-JSON body AND an explicit `{zoning:null}`, so this
            // branch cannot tell an outage from a genuine empty (the provider-level half of
            // §CONTEXT-DATA-HONESTY, still open — see the WIRING TODO in `zoneRefusal.ts`).
            //
            // The comment that stood here read: *"That is a FAILURE, not a legal answer, so it
            // must NOT become a refusal — estimated fallback."* The first half is right and the
            // conclusion inverted it: refusing to call a failure a LEGAL refusal is correct, but
            // the alternative it chose was to call it a NUMBER — 3.0 / 1.5 / 3.0 m, FAR 2.0,
            // 50 %, drawn as a purple volume over central Eixample. A failure and an estimate are
            // not two names for the same thing.
            //
            // It now falls to `applyEstimatedZoning`, which — since §L-663 — refuses inside any
            // registered jurisdiction and publishes a cited `source-data-unavailable` card. The
            // call is deliberately left as-is rather than special-cased here: the guarantee is
            // structural at the chokepoint, so this and the other fourteen guard paths are all
            // covered by the same rule.
            console.warn(
                `${TAG} §L-663 no clau resolved at ${lat.toFixed(5)},${lon.toFixed(5)} — the MUC ` +
                    `lookup returned nothing (outage / non-200 / genuine empty are not yet ` +
                    `distinguishable here). NO estimated triple is published inside Barcelona; ` +
                    `the chokepoint dispatches a cited refusal.`,
            );
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        const clau = qual.clau;
        // §L-550 PHASE-0.1 — ask the REGISTRY, do not test a literal. Three outcomes.
        // The harmonised `CODI_QUAL_MUC` is passed as a HINT, never as a pack selector (it cannot
        // distinguish 13a from 13b — both are `R2`, and `mucZoningProxy.js` says so). It answers
        // only the strictly coarser question "is this a *sistema*?", which the L-550 probe showed
        // it answers perfectly across all 1 014 measured points — and which is what catches the
        // COMPOSITE claus (`1a-5b`, `3-6b`) no enumeration can anticipate.
        //
        // §L-553 — `zoneLabel` + `knownFacts` exist for the COVERAGE-GAP card. When PRYZM has no
        // pack for a buildable clau it now draws NOTHING (founder decision), and a blank panel
        // reads as a crash. These are the facts that prove we identified the user's land
        // correctly: their zone in the ordinance's own words, their cadastral reference, their
        // address, their area. Facts only — never a constraint. All are already in hand from the
        // two fetches above, so this costs no network.
        const parcelAreaM2 = (() => {
            try {
                const ring = boundary.polygon;
                if (!Array.isArray(ring) || ring.length < 3) return null;
                const a = Math.abs(
                    ring.reduce((acc, p, i) => {
                        const q = ring[(i + 1) % ring.length]!;
                        return acc + (p.x * q.z - q.x * p.z);
                    }, 0) / 2,
                );
                return Number.isFinite(a) && a > 0 ? a : null;
            } catch { return null; }
        })();
        const knownFacts = [
            `Zone: ${qual.clauLabel ? `${qual.clauLabel} (clau ${clau})` : `clau ${clau}`}`,
            parcelFeat?.refcat ? `Cadastral reference: ${parcelFeat.refcat}` : null,
            typeof parcelFeat?.address === 'string' && parcelFeat.address.trim()
                ? `Address: ${parcelFeat.address.trim()}`
                : null,
            parcelAreaM2 !== null ? `Parcel area: ${Math.round(parcelAreaM2).toLocaleString()} m²` : null,
            'Planning source: Generalitat de Catalunya MUC + Catastro',
        ].filter((s): s is string => typeof s === 'string');
        const disposition = resolveZoneDisposition(jurisdictionId, clau, {
            harmonisedCode: qual.mucCode ?? null,
            zoneLabel: qual.clauLabel ?? null,
            knownFacts,
        });
        if (disposition.kind === 'refusal') {
            // ── BARCELONA-GIS-AUDIT-SPIKE — clau 18 (*volumetria específica*): the AMB Refós ALREADY
            //    PUBLISHES the volumetric ordering as geometry (OV_Trames: footprint + PLANTES floor
            //    count). clau 18 is a `derived-plan` refusal in the registry, and STAYS one until
            //    `BCN_REFOS_OV_CERTIFIED` (default OFF, L-449 gate) is signed. While the gate is
            //    closed this is skipped and the cited refusal below is what renders — the current,
            //    honest shipping state. When ON, we attempt the constructed `explicit-area` envelope;
            //    on any failure we fall through to the SAME refusal (an absent number costs nothing).
            //    ⚠ Guarded to clau EXACTLY '18': other `derived-plan` claus (14a/15/16/17…) have no
            //    OV footprint and must keep refusing.
            //    ⚠ 2026-08-02 — the THIRD condition is the unbinding. The branch no longer assumes
            //    Barcelona: it asks whether THIS municipality has an authorised clau-18 volumetric
            //    pack (`ambVolumetria18PackFor`, `null` for 35 of the AMB's 36). The OV DATA is
            //    metropolitan under SIG-3; the Art. 306 CITATION is not, so reachability and
            //    authorisation are tested separately and the second one fails closed.
            if (
                BCN_REFOS_OV_CERTIFIED &&
                clau === BCN_VOLUMETRIA_18_ZONE_CODE &&
                ambVolumetria18PackFor(municipality.ineCode) !== null
            ) {
                const rendered = await tryBcnClau18Volumetria(
                    ctx,
                    boundary,
                    lat,
                    lon,
                    qual.clauLabel ?? null,
                    municipality,
                );
                if (rendered) {
                    console.log(`${TAG} §BCN-CLAU18-OV constructed envelope from the AMB Refós OV — certified gate ON.`);
                    return;
                }
                console.log(`${TAG} §BCN-CLAU18-OV no usable OV footprint — falling through to the cited clau-18 refusal.`);
            }
            // §L-550 PHASE-1B — THE ORDINANCE ANSWERS, AND ITS ANSWER IS "NO ENVELOPE".
            //
            // This is the branch that makes "PRYZM refuses rather than guesses" TRUE. Before it,
            // a park, a motorway, a Collserola forest reserve and a clau-18 *volumetria
            // específica* plot ALL fell into `applyEstimatedZoning` and were shown a fabricated
            // front/side/rear triple in the same card and the same purple volume as a real
            // determination — a legal claim about land that cannot be developed at all,
            // indistinguishable on screen from the Eixample's constructed Art. 242.2 envelope.
            //
            // A refusal is a POSITIVE, CITED result, not a shortfall: it carries the clau, the
            // reason code, the reasoning and the instrument. `dispatchEnvelope` sees
            // `status !== 'ok'` and therefore CLEARS any persisted `buildableRing` rather than
            // leaving a stale one that still looks authoritative (C58 §1.7a, the L-445 lesson).
            const site = ctx.store.getSite();
            if (!site) {
                applyEstimatedZoning(ctx, estimated);
                return;
            }
            const refused = buildRefusedEnvelope(clau, disposition.refusal);
            dispatchEnvelope(ctx, site.id, refused, 'muc-catastro');
            console.log(
                `${TAG} §L-550/§L-553 REFUSAL clau=${clau} (${qual.clauLabel ?? 'n/a'}) ` +
                    `code=${disposition.refusal.code} legallyGrounded=${disposition.refusal.legallyGrounded} ` +
                    `— ${disposition.refusal.headline} NO estimated fallback ` +
                    `(${disposition.refusal.legallyGrounded
                        ? 'an estimate here would be a fabricated legal claim'
                        : 'a setback triple is the wrong geometric OPERATION for this zone — founder decision'}).`,
            );
            return;
        }
        if (disposition.kind !== 'pack') {
            // §L-553 — UNREACHABLE for Barcelona, and deliberately still here.
            //
            // Barcelona now declares a coverage-gap refusal, so `resolveZoneDisposition` never
            // returns `unregistered` for it. This branch is the guard for the day a jurisdiction
            // is registered WITHOUT one — suburban/detached fabric, where a setback triple is the
            // RIGHT shape and an estimate is genuinely just an estimate. Deleting it would bake
            // Barcelona's answer into every future city, which is exactly the standardising-over-
            // a-real-legal-difference the founder's ranking forbids.
            console.log(
                `${TAG} clau=${clau} is privately buildable, has no rule pack, and this ` +
                    `jurisdiction declares no coverage-gap refusal — estimated fallback, honestly badged.`,
            );
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        const zonePack = disposition.pack;
        console.log(`${TAG} clau resolved → ${clau} (${qual.clauLabel ?? 'n/a'}) → pack ${zonePack.jurisdictionId}.`);

        // §L-591 — A PACK WHOSE RULE NEEDS NO BLOCK MUST NOT BE ROUTED THROUGH THE BLOCK PATH.
        //
        // Everything below this branch is the Art. 242.2 construction: Catastro refcat → manzana →
        // dissolve → frontage classification → a depth measured from the street line. It is
        // correct for every clau packed until now, because every one of them is *alineació a vial*.
        //
        // `20a` is not. Art. 339 puts the whole family under *edificació aïllada*, and Arts.
        // 342.7 / 343.3 state real front–lateral–fons separations, so its rule is
        // `kind: 'setback'` — a plain inset from the parcel's OWN boundary. Sending it down the
        // block path would (a) make it depend on a cadastral block it does not need, so a failed
        // dissolve would refuse an envelope the ordinance fully determines, and (b) cost a slow
        // Catastro round-trip plus an Overpass wait for nothing.
        //
        // The test is `requiresBlockRing` on the ZONE'S OWN RULE, not a clau literal — a new
        // parcel-only pack for any city flows through here unchanged (C58 §1.5).
        const packZone: ZoningRule | null =
            zonePack.zones.find((z: ZoningRule) => z.code === clau) ?? null;
        const packRule = packZone?.geometricRule ?? null;
        if (packRule && !requiresBlockRing(packRule)) {
            const site0 = ctx.store.getSite();
            if (!site0) {
                applyEstimatedZoning(ctx, estimated);
                return;
            }
            const parcelOnlyRecord: ZoningRecord = {
                zoneCode: clau,
                zoneLabel: qual.clauLabel,
                // §AMB-UNBIND — the municipality's own id; see the note at the top of this function.
                jurisdictionId,
                structuredFields: {},
                overlays: [],
                ordinanceRef: null,
                provenance: {
                    source: 'catastro-muc',
                    label: 'Generalitat MUC (clau) + Catastro parcel',
                    version: null,
                    license: null,
                    crs: 'EPSG:4326',
                },
            };
            const parcelOnlyEnvelope = computeBuildableEnvelope({
                parcelRing: boundary.polygon,
                edgeClassifications: boundary.edgeClassifications,
                zoning: parcelOnlyRecord,
                rulePack: zonePack,
            });
            // §L-591 — the two `20a` subzones whose numbers are CONSTRUCTIONS, not constants.
            // The pack ships `null` for them (a scalar would be one street's / one parcel size's
            // answer for the whole subzone); this is where the parcel's own answer is attached,
            // with the article that produced it. Silence stays silence: when the resolver refuses,
            // NO number is published and the reason is logged, exactly as an absent height is.
            const far = resolve20aEdificabilitat(clau, { parcelArea_m2: parcelAreaM2 });
            const overrides = resolve20aParcelOverrides(clau, parcelAreaM2);
            const enriched: BuildableEnvelope =
                far.ok && parcelOnlyEnvelope.status === 'ok'
                    ? {
                          ...parcelOnlyEnvelope,
                          // Only FILL a null. The eight unconditional subzones already carry
                          // Art. 340.1's scalar from the pack, and overwriting it here would
                          // create a second authority for the same number.
                          maxFAR: parcelOnlyEnvelope.maxFAR ?? far.index,
                          derivation:
                              parcelOnlyEnvelope.maxFAR === null
                                  ? [
                                        ...parcelOnlyEnvelope.derivation,
                                        {
                                            constraint: 'maxFAR' as const,
                                            value: far.index,
                                            zoneCode: clau,
                                            source: `PGM ${far.article} — ${far.why}`,
                                            fieldProvenance: 'ordinance-pdf' as const,
                                            ordinanceRef: packZone?.ordinanceRef ?? null,
                                        },
                                    ]
                                  : parcelOnlyEnvelope.derivation,
                          // ⚠ The Art. 255 slope caveat rides on EVERY 20a answer. We hold no
                          // terrain (L-584) and much of Barcelona's 20a fabric is hillside, so
                          // the figures above are an UPPER BOUND and must say so on screen.
                          caveats: [
                              ...parcelOnlyEnvelope.caveats,
                              ...far.caveats,
                              ...(overrides.article
                                  ? [
                                        `A small-parcel regime may apply (${overrides.article}): ` +
                                            `${overrides.why} PRYZM has NOT applied it — unverified: ` +
                                            `${overrides.unverifiedConditions.join(' ')}`,
                                    ]
                                  : []),
                          ],
                      }
                    : parcelOnlyEnvelope;
            dispatchEnvelope(ctx, site0.id, enriched, 'muc-catastro');
            console.log(
                `${TAG} §L-591 PARCEL-ONLY rule (kind=${packRule.kind}) clau=${clau} — solved from ` +
                    `the parcel alone, no block needed. area=${parcelAreaM2?.toFixed(0) ?? 'n/a'} m² ` +
                    `FAR=${far.ok ? far.index : `NONE (${far.reason}: ${far.detail})`} ` +
                    `height=${enriched.maxHeight_m ?? 'NONE (see pack §NULLS)'} m` +
                    (overrides.article
                        ? ` · ⚠ SMALL-PARCEL REGIME MAY APPLY (${overrides.article}): ${overrides.why} ` +
                          `— NOT applied; unverified: ${overrides.unverifiedConditions.join(' | ')}`
                        : '') +
                    (far.ok && far.caveats.length ? ` · caveats: ${far.caveats.join(' | ')}` : ''),
            );
            return;
        }

        /**
         * §L-574 (founder-decided 2026-07-21) — WE HAVE THE PACK AND THE CONSTRUCTION STILL
         * COULD NOT COMPLETE. Refuse; do NOT fall back to the estimated triple.
         *
         * Every `return` below this point is a path where the clau is KNOWN, its rule pack is
         * REGISTERED, and an INPUT was missing (Catastro refcat, the block, the dissolve, or a
         * solution on the ring). Those all used to call `applyEstimatedZoning`, which for a
         * *segons alineacions de vial* clau like 13a draws a front/side/rear triple — **the
         * wrong SHAPE, not an imprecise number** (C58 §1.11) — spanning the full plot depth on
         * the most valuable land in Barcelona. ~8.6 % of Eixample parcels reach here (the
         * dissolve succeeds on 91.4 %, L-539), plus every transient Catastro failure.
         *
         * ⚠ Deliberately NOT the L-550 legal refusal and NOT the L-553 coverage gap: the first
         * would assert an ordinance fact we have not established (a false negative about
         * someone's land), the second would claim we lack a pack we demonstrably have. This is
         * the only TRANSIENT refusal, which is why its card is the only one offering a retry.
         *
         * Returns `true` when it handled the case, so each call site stays a two-liner.
         */
        const refuseConstructionIncomplete = (reason: ConstructionFailureReason): boolean => {
            const site = ctx.store.getSite();
            if (!site) {
                // No site to dispatch onto — nothing can be rendered either way. Fall back
                // rather than drop the answer silently.
                applyEstimatedZoning(ctx, estimated);
                return true;
            }
            // §STALE-ASYNC-ZONING — this closure is reached after 1-3 MORE awaits (block fetch,
            // roads fetch) beyond the guard above; re-check immediately before writing.
            if (!bcnZoningStillCurrent(ctx, boundary, TAG)) return true;
            const refusal = barcelonaConstructionIncompleteRefusal(
                clau,
                reason,
                qual.clauLabel ?? null,
                knownFacts,
            );
            // `status: 'none'` — ATTEMPTED, no data. NOT `'not-applicable'`, which would assert
            // that the ordinance answered "no envelope here"; a Catastro outage establishes no
            // such thing. Both clear a stale `buildableRing` (dispatchEnvelope writes only on
            // `'ok'`), so the L-445 protection is unchanged.
            dispatchEnvelope(ctx, site.id, buildRefusedEnvelope(clau, refusal, 'none'), 'muc-catastro');
            console.log(
                `${TAG} §L-574 CONSTRUCTION-INCOMPLETE clau=${clau} reason=${reason} — ` +
                    `refused, NO estimated fallback (a setback triple is the wrong SHAPE for an ` +
                    `alineacions-de-vial clau). Transient: a retry may resolve it.`,
            );
            return true;
        };

        const refcat = parcelFeat?.refcat;
        if (!refcat) {
            console.log(`${TAG} no Catastro refcat at point — §L-574 refusal.`);
            refuseConstructionIncomplete('block-unavailable');
            return;
        }

        // (d) The block (manzana) this parcel belongs to — ALREADY IN FLIGHT since the parcel
        // fetch resolved (§STARTUP-BLOCK-OVERLAP above; §BLOCK-CENTROID-REUSE centroid is passed
        // inside the chain). This await only pays whatever the overlap did not cover.
        const tBlock = performance.now();
        const block = await blockP;
        console.log(
            `${TAG} §BCN-ENVELOPE-TIMING block fetch — residual await ` +
                `${(performance.now() - tBlock).toFixed(0)} ms ` +
                `(total since parcel-fetch start ${(performance.now() - tParcelStart).toFixed(0)} ms; ` +
                `§STARTUP-BLOCK-OVERLAP: started at refcat-resolve, overlapped with the MUC lookup ` +
                `+ disposition).`,
        );
        if (!block || block.parcels.length < 3) {
            console.log(
                `${TAG} block=${block?.manzana ?? 'none'} parcels=${block?.parcels.length ?? 0} (need ≥3) ` +
                    `— §L-574 refusal.`,
            );
            refuseConstructionIncomplete('block-unavailable');
            return;
        }
        console.log(`${TAG} block ${block.manzana} — ${block.parcels.length} parcels (~${block.totalAreaM2.toFixed(0)} m²).`);

        // (e) FRAME — project + de-rotate about the SAME origin + θ the parcel used.
        const site = ctx.store.getSite();
        if (!site) {
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        const origin = { lat: site.location.latitude, lon: site.location.longitude };
        const rawTheta = site.location.trueNorth;
        const theta = Number.isFinite(rawTheta) ? rawTheta : 0;
        // Project a WGS84 point to scene-XZ (TRUE-north frame, `latLonToSceneXZ` — the exact
        // projection `buildBoundaryFromLatLonRing` uses internally), then apply the IDENTICAL
        // θ de-rotation `dispatchParcelBoundary` applied to the parcel ring. θ = 0 ⇒ identity.
        const toAuthoringFrame = (p: LatLon): Pt => {
            const xz = latLonToSceneXZ(p, origin.lat, origin.lon);
            if (theta === 0) return { x: xz.x, z: xz.z };
            const e = trueVectorToProjectNorth({ east: xz.x, north: -xz.z }, theta);
            return { x: e.east, z: -e.north };
        };

        // Dissolve the block's parcels to ONE block ring (exact edge-cancellation; refuses a
        // non-conforming tiling with `degenerate`).
        const parcelRingsXZ = block.parcels.map((bp) => bp.ring.map(toAuthoringFrame));
        const dissolved = dissolveParcelsToBlockRing(parcelRingsXZ);
        if (dissolved.degenerate || dissolved.ring.length < 3) {
            console.log(`${TAG} block ring dissolve refused (reason=${dissolved.reason}) — §L-574 refusal.`);
            refuseConstructionIncomplete('block-dissolve-refused');
            return;
        }
        const blockRing = dissolved.ring;
        // §DISSOLVE-TJUNCTION-SPLIT (L-539) — say WHICH path produced this ring. A repaired ring
        // is still built from input vertices only, but it followed a boundary that departs from
        // the straight input edge by up to `maxOffset_m` (bounded by 0.1 m, i.e. under Catastro's
        // own 0.111 m coordinate quantum). It is logged rather than inferred from silence, for
        // the L-459 reason: a derived value that renders indistinguishably from a surveyed one is
        // the defect, not the derivation.
        if (dissolved.quality.path !== 'exact') {
            console.log(
                `${TAG} §DISSOLVE-TJUNCTION-SPLIT — block ring recovered by splitting ` +
                    `${dissolved.quality.splitCount} edge(s) at an existing neighbour vertex; max ` +
                    `offset ${dissolved.quality.maxOffset_m.toFixed(3)} m (tolerance ` +
                    `${dissolved.quality.tolerance_m} m). Without it this block would have had NO ` +
                    `envelope at all.`,
            );
        }

        // (f) Roads → street-frontage classification of the block edges.
        // §L-516 — take the SLOW Overpass roads fetch OFF the real-envelope critical path (founder:
        // "it takes too long to provide the true real envelope"). Roads are ONLY a refinement here:
        // this path is Eixample-only (gated above on 13a/13E), a Catastro manzana is street-bounded
        // by definition, so the CORRECT block frontage is the all-perimeter model below (§BCN-
        // MANZANA-PERIMETER), and in the dense Eixample the `way["highway"]…out geom` query is the
        // same cost-failure as buildings and returns 0 anyway (proved: overpass 406 / 45 s). Waiting
        // up to the proxy's 45 s budget on a call that almost always returns nothing — while the real
        // envelope is BLOCKED behind it — is exactly the latency the founder hit. Bound it to a tight
        // deadline: if roads arrive fast they still refine; otherwise resolve the envelope NOW from
        // the manzana-perimeter model. Parcel frontage is already road-independent (§L-515). The
        // underlying fetch is not cancelled — it still warms the context cache for the render layer.
        // §L-533 — 2000 → 600 ms. The comment above already establishes that in the dense Eixample
        // this query "returns 0 anyway"; the founder's logs bear that out on EVERY run
        // (`roads=0 way(s)` after the full deadline, every time). So the 2 s was a fixed tax on the
        // real envelope in exchange for a refinement that never arrives, and the manzana-perimeter
        // model that then runs is the CORRECT one for a street-bounded Catastro manzana regardless.
        // 600 ms still lets a genuinely fast/cached roads response refine the frontages — it only
        // stops us WAITING on the slow path. The fetch is not cancelled and still warms the context
        // cache for the render layer, so nothing is thrown away.
        const ENVELOPE_ROADS_DEADLINE_MS = 600;
        let roads: RoadPolyline[] = [];
        try {
            const roadCol = await Promise.race([
                fetchContextRoads(lat, lon),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), ENVELOPE_ROADS_DEADLINE_MS)),
            ]);
            if (roadCol) {
                roads = roadCol.ways.map((w) => ({
                    points: w.coords.map(([wlon, wlat]) => toAuthoringFrame({ lat: wlat, lon: wlon })),
                }));
            } else {
                console.warn(
                    `${TAG} §L-516 roads fetch exceeded ${ENVELOPE_ROADS_DEADLINE_MS} ms — resolving the ` +
                        `real envelope NOW from the manzana-perimeter model (roads are only a refinement).`,
                );
            }
        } catch (e) {
            console.warn(`${TAG} context-roads fetch failed (non-fatal) — 0 roads:`, e);
            roads = [];
        }
        let blockEdgeClassifications = classifyBlockFrontages(blockRing, roads);
        let frontCount = blockEdgeClassifications.filter((c) => c === 'front').length;
        console.log(
            `${TAG} roads=${roads.length} way(s); block frontages: ${frontCount} 'front' of ` +
                `${blockEdgeClassifications.length} block edges.`,
        );
        if (frontCount === 0) {
            // §BCN-MANZANA-PERIMETER-FRONTAGE (L-502) — roads came back EMPTY. That is not a real
            // "this block has no streets": the `way["highway"]…out geom` query over the dense
            // Eixample is the same query-cost failure as buildings (L-471/L-482) and Overpass hands
            // back an empty set (confirmed by direct probe: 0 ways for the central-Eixample bbox).
            // Refusing here would deny the flagship area the real envelope.
            //
            // A Catastro *manzana* is a STREET-BOUNDED BLOCK BY DEFINITION — the block route returns
            // exactly the parcels sharing the 5-char manzana prefix, i.e. one Cerdà block enclosed by
            // streets on every side. Art. 242.2 (the founder-signed source) derives the depth as "a
            // figure similar to the block, EQUIDISTANT FROM THE STREET FRONTAGES, leaving ≥30%
            // interior free" — and for a manzana those street frontages ARE its perimeter. So
            // classifying every block-ring edge as `front` is NOT a fabricated number; it is the
            // definition of the block for this rule, and it yields precisely the Eixample
            // perimeter-building-with-interior-courtyard morphology the ordinance intends. Roads,
            // when they DO classify a frontage, remain the refinement (this branch only fires on 0).
            //
            // Length is taken over `blockRing` so it satisfies the engine's `=== blockRing.length`
            // guard exactly (C58 §block-depth). If the dissolved ring were somehow not a plausible
            // block the earlier dissolve step would already have refused it as degenerate.
            blockEdgeClassifications = blockRing.map(() => 'front' as ParcelEdgeClassification);
            frontCount = blockEdgeClassifications.length;
            console.log(
                `${TAG} §BCN-MANZANA-PERIMETER — roads empty (dense-Eixample Overpass cost); applying ` +
                    `the manzana-perimeter frontage model: every one of the ${frontCount} block-ring ` +
                    `edges IS a street frontage (a Catastro manzana is street-bounded by definition; ` +
                    `PGM Art. 242.2 measures depth from those perimeter frontages).`,
            );
        }

        // (g) Solve. The ZoningRecord names the clau; the ENGINE reads the geometricRule FROM
        //     the pack zone (so we pass no geometricRule). Mirrors `estimatedDefaultZoningRecord`
        //     shape, with catastro-muc provenance and a null record-level ordinanceRef (the pack
        //     zone supplies the real citation).
        const record: ZoningRecord = {
            zoneCode: clau,
            zoneLabel: qual.clauLabel,
            jurisdictionId: 'es-08019-barcelona',
            structuredFields: {},
            overlays: [],
            ordinanceRef: null,
            provenance: {
                source: 'catastro-muc',
                label: 'Generalitat MUC (clau) + Catastro parcel/manzana',
                version: null,
                license: null,
                crs: 'EPSG:4326',
            },
        };
        // §L-515-FIX — the parcel's `front` edge must be the real STREET frontage, not the −Z
        // placeholder classifyEdges() (boundaryProjection.ts) assigns. That placeholder marks
        // whichever edge faces screen-"north" as front, so the profunditat edificable was clipped
        // from a SIDE edge on any parcel whose street isn't on its −Z side (founder: "the depth back
        // is applied to the SIDE of the parcel"). REAL frontage, road-independent: a parcel edge is a
        // street edge iff it lies on the BLOCK PERIMETER — the block ring was dissolved FROM these
        // parcels, so a parcel's street edge is (within tolerance) coincident with a block-ring edge,
        // while its party-wall/courtyard edges are not. Reuse the tested classifyBlockFrontages,
        // testing each PARCEL edge against the block ring as one closed polyline (tight 2 m). Same
        // authoring frame as the block (see the FRAME note above), so the test is valid. Guarded: if
        // it finds no perimeter frontage (shouldn't happen for a real block parcel), keep the
        // placeholder rather than risk a worse result.
        let parcelEdgeClassifications = boundary.edgeClassifications;
        try {
            const blockAsPolyline: RoadPolyline = { points: [...blockRing, blockRing[0]!] };
            const byPerimeter = classifyBlockFrontages(
                boundary.polygon,
                [blockAsPolyline],
                { maxDistance_m: 2, maxAngleDeg: 20 },
            );
            if (byPerimeter.length === boundary.polygon.length && byPerimeter.some((c) => c === 'front')) {
                parcelEdgeClassifications = byPerimeter;
            } else {
                console.warn(
                    `${TAG} §L-515-FIX block-perimeter frontage found ` +
                        `${byPerimeter.filter((c) => c === 'front').length} front of ${byPerimeter.length} parcel ` +
                        `edges — keeping the −Z placeholder classification.`,
                );
            }
        } catch (e) {
            console.warn(`${TAG} §L-515-FIX parcel-vs-block frontage failed (non-fatal):`, e);
        }
        // §L-515-FRONTAGE-DIAG — show the placeholder vs corrected `front` edge (bearing of each),
        // so the fix is verifiable in-browser: the corrected `front` should face the street, and the
        // depth insets from the FIRST corrected front edge.
        try {
            const bearingOf = (ring: { x: number; z: number }[], i: number): string => {
                const a = ring[i], b = ring[(i + 1) % ring.length];
                const deg = ((Math.atan2(b.x - a.x, -(b.z - a.z)) * 180) / Math.PI + 360) % 360;
                const mx = ((a.x + b.x) / 2).toFixed(1), mz = ((a.z + b.z) / 2).toFixed(1);
                return `#${i}@(${mx},${mz}) ${deg.toFixed(0)}°`;
            };
            // §GR-10/GR-14 — bare read: `boundary` is a `ZoningBoundary`, whose
            // `edgeClassifications` is REQUIRED. The removed `?? []` would have
            // printed an empty placeholder-front list — indistinguishable from a
            // genuinely front-less parcel — out of a corrupt record.
            const placeholderFront = boundary.edgeClassifications
                .map((c, i) => (c === 'front' ? bearingOf(boundary.polygon, i) : null)).filter(Boolean);
            const fixedFront = parcelEdgeClassifications
                .map((c, i) => (c === 'front' ? bearingOf(boundary.polygon, i) : null)).filter(Boolean);
            console.log(
                `${TAG} §L-515-FRONTAGE-DIAG placeholder(−Z) front=[${placeholderFront.join(' | ')}] → ` +
                    `block-perimeter front=[${fixedFront.join(' | ')}] · block ` +
                    `${blockEdgeClassifications.filter((c) => c === 'front').length}/${blockEdgeClassifications.length} front.`,
            );
        } catch { /* diagnostic only */ }
        const envelope = computeBuildableEnvelope({
            parcelRing: boundary.polygon,
            edgeClassifications: parcelEdgeClassifications,
            zoning: record,
            // §L-550 — the pack comes from the REGISTRY (`disposition.pack`), not from a fixed
            // import, so clau 13b's pack will flow through this same line unchanged.
            rulePack: zonePack,
            blockRing,
            blockEdgeClassifications,
        });

        // (g2) §BCN-ALCADA (L-525a) — CONSTRUCT the *alçada reguladora màxima*.
        //
        // A 13a zone publishes NO per-parcel height, exactly as it publishes no depth: Art. 327.2
        // gives a TABLE keyed by the *amplada de vial*, and the height falls out of the band the
        // street sits in. So the pack correctly ships `maxHeight_m: null` — and until now nothing
        // filled it, which meant the Cesium massing path fell back to a hardcoded 9 m and extruded
        // a fabricated ~PB+2 in the same purple volume as a real height, on streets whose real
        // answer is PB+5. That is the L-459 defect class (a fabricated value rendering exactly like
        // a measured one), reached through the envelope instead of the context.
        //
        // WHERE THE STREET WIDTH COMES FROM (§BCN-ALCADA-WIDTH, L-537 — this REPLACED an allow-list)
        // -------------------------------------------------------------------------------------
        // Art. 327 keys on the *ample oficial*, and Barcelona publishes none machine-readably
        // (probed 2026-07-21 — the only relevant `vial` dataset is a WMS raster with no width
        // attribute). The first cut therefore hand-curated ~26 Cerdà streets. That was honest and
        // it did not scale: Enric Granados and Ronda de la Universitat are unlisted, so `maxHeight`
        // stayed null and the massing path drew a 0.5 m footprint slab on real Eixample parcels.
        // **Coverage was the defect, not the honesty.**
        //
        // So the width is now CONSTRUCTED, exactly as the *profunditat edificable* is under
        // ADR-0271: measure the frontage-to-frontage distance from our block ring to the blocks
        // across the street. ⚠ IT COSTS NO NETWORK — the block route's bbox already returned the
        // surrounding parcels and now hands them back as `neighbours` (§STREET-WIDTH-NEIGHBOURS),
        // cached per manzana, so this is arithmetic on data we had already paid for.
        //
        // The dangerous step is turning a measurement into a DECLARED width, because the bands are
        // STEPS and the Cerdà grid sits ON one (19.99 m ⇒ 17.70 m, 20.00 m ⇒ 20.75 m). That is
        // gated on evidence, not intuition: 6,819 frontages across 697 blocks in 5 cities
        // (`spain/SPAIN-STREET-WIDTH-DISTRIBUTION-PROBE.md`) show Barcelona spikes of ×7.55 at 20 m
        // and ×7.51 at 30 m — and NO 10/15/25 m quantum at all, which is why the intuitive snap set
        // was NOT shipped. `resolveAmpladaDeVial` walks declared > snapped > measured > none, and
        // only the first two disarm `resolveAlcadaReguladora`'s band-edge guard.
        //
        // Every tier can still end in NO width — no block ring, no opposing frontage, a width
        // between bands. Then there is no constructed height and the caller shows none. That is the
        // correct failure: an absent height costs a flat study volume, a wrong one costs a wrong
        // building (C57 §1.5, ADR-0271, the whole discipline of this path).
        let alcadaHeightM: number | null = null;
        let alcadaFloors: number | null = null;
        let alcadaWhy = 'no street width could be established for this parcel';
        let alcadaProvenance: string | null = null;
        // §L-583 — the governing height ARTICLE + citation, resolved from the clau (Art. 327.2 for
        // 13a/13E, Art. 328 for 13b). Null until a zoned resolver answers, so a clau with no
        // encoded height article publishes no height rather than borrowing another zone's table.
        let alcadaArticle: string | null = null;
        let alcadaOrdinanceRef: string | null = null;
        try {
            const addr = typeof parcelFeat?.address === 'string' ? parcelFeat.address : '';
            const declared = addr ? officialStreetWidthForAddress(addr) : null;

            // Measure only when the curated list misses — on a listed street the declared figure
            // wins anyway, and the measurement would be computed to be discarded.
            let measurement = null as ReturnType<typeof governingStreetWidth>;
            let measureNote = '';
            if (!declared) {
                // §GR-10/GR-14 — `null` (the response carried no neighbours array
                // at all) is NOT `[]` (it did, and this block is isolated). Both
                // cost the width, but only one of them is a fact about Barcelona;
                // the other is a fact about our own data path, and an operator
                // reading `alcadaWhy` must not be sent hunting for an isolated
                // block that does not exist (C78 §1.4).
                const neighbourRingsXZ = block.neighbours === null
                    ? null
                    : block.neighbours.map((n) => n.ring.map(toAuthoringFrame));
                if (neighbourRingsXZ === null) {
                    measureNote =
                        'the block response carried NO neighbours array — the street-width question '
                        + 'was never answered for this block (not a finding that it has no neighbours)';
                } else if (neighbourRingsXZ.length === 0) {
                    measureNote = block.neighboursDropped > 0
                        ? `all ${block.neighboursDropped} neighbour parcel(s) returned for this block were `
                          + 'unparseable — measured against none'
                        : 'the block response returned zero neighbour parcels (isolated or edge-of-coverage block)';
                } else {
                    const widths = measureStreetWidths(blockRing, neighbourRingsXZ);
                    // Restrict to the block edges THIS parcel fronts. Taking the narrowest street
                    // around the whole block would under-build a parcel that only fronts the wide
                    // artery — wrong in the safe direction is still wrong. An empty result means we
                    // could not tell which edges are ours, and then the whole block is the honest
                    // fallback rather than an arbitrary pick.
                    const facing = blockEdgesFacingParcel(blockRing, boundary.polygon);
                    measurement = governingStreetWidth(widths, facing.length > 0 ? facing : undefined);
                    measureNote =
                        `${widths.measurements.length} of ` +
                        `${widths.measurements.length + widths.rejected.length} block edges measured; ` +
                        `parcel fronts edge(s) [${facing.join(',')}]`;
                }
            }

            const amplada = resolveAmpladaDeVial({
                declared,
                measurement,
                quantisation: BCN_STREET_WIDTH_QUANTISATION,
            });

            if (amplada) {
                alcadaProvenance = amplada.provenance;
                // §L-583 — ask the DATA LAYER which article governs this clau. `null` = PRYZM has
                // encoded no height table for it; then there is no constructed height, exactly as
                // when no width could be established. Substituting a neighbouring zone's table
                // would be the one failure mode worse than showing nothing.
                const zoned = resolveBcnAlcadaForZone(clau, amplada.width_m, {
                    trustedOfficialWidth: amplada.trustedOfficialWidth,
                    // §L-586 — hand the band-edge guard this measurement's OWN error bar. 0.5 m is
                    // the measured-for-declared substitution allowance, not a claim about THIS
                    // measurement's noise; a frontage whose rays disagree by more than that can
                    // straddle a band edge the constant clears (PS Gràcia 66: 19.15 m ± 0.87 m
                    // shipped 17.70 m while its own samples reached 20.02 m).
                    measurementSpread_m: amplada.measurementSpread_m,
                });
                if (!zoned) {
                    alcadaWhy =
                        `clau ${clau} has a rule pack but no encoded alçada reguladora article — ` +
                        `no height is published (another zone's table would be a mis-citation)`;
                }
                const r = zoned?.resolution ?? null;
                alcadaArticle = zoned?.article ?? null;
                alcadaOrdinanceRef = zoned?.ordinanceRef ?? null;
                if (r?.ok) {
                    alcadaHeightM = r.height_m;
                    // PB+N ⇒ N storeys ABOVE the ground floor, so N+1 levels in total.
                    alcadaFloors = r.floorsAboveGround + 1;
                    alcadaWhy =
                        `${amplada.why} → PB+${r.floorsAboveGround} = ${r.height_m.toFixed(2)} m ` +
                        // §L-583 — the article comes from the ZONE, never a literal. A 13b parcel
                        // must read "Art. 328", and it must be the article whose table produced
                        // the number above, resolved together in `resolveBcnAlcadaForZone`.
                        `(${alcadaArticle ?? 'article n/a'})` +
                        // §L-583 — was: "an official Barcelona certificate gives 22.40 m for PB+5
                        // — uncertified". That read as a RIVAL height and made our correct number
                        // look doubtful. 22.40 m is the Art. 21 *alçada reguladora incrementada*,
                        // a separate, CONDITIONAL allowance — stated as an allowance, never as a
                        // height, because we verify neither of its preconditions.
                        (r.corniceIncrementMax_m
                            ? ` · a cornice increment of up to ${r.corniceIncrementMax_m.toFixed(2)} m over this height may apply (Art. 21, Ordenança de l'Eixample, 2002) where the parcel is inside the Conjunt Especial de l'Eixample AND adjoins buildings predating 1932 — PRYZM does not verify either condition, so it is NOT included above`
                            : '');
                } else if (r) {
                    // A refusal is an ANSWER here, and the reason is the useful part: `band-edge`
                    // means the width genuinely cannot choose a storey band, not that we failed.
                    alcadaWhy =
                        `${amplada.width_m.toFixed(2)} m (${amplada.provenance}) rejected by ` +
                        `${alcadaArticle ?? 'the zone table'}: ${r.reason}` +
                        (r.straddles.length ? ` — straddles ${r.straddles.join(' / ')} m` : '');
                }
            } else if (measureNote) {
                alcadaWhy = `no width: ${measureNote}`;
            }
            console.log(
                `${TAG} §BCN-ALCADA height=${alcadaHeightM === null ? 'NONE' : alcadaHeightM.toFixed(2) + 'm'} ` +
                    `floors=${alcadaFloors ?? 'n/a'} tier=${alcadaProvenance ?? 'none'} ` +
                    `neighbours=${block.neighbours === null ? 'NOT-RETURNED' : block.neighbours.length}`
                    + `${block.neighboursDropped > 0 ? ` (+${block.neighboursDropped} dropped)` : ''} — ${alcadaWhy}.`,
            );
        } catch (e) {
            // Never allowed to cost the (already-correct) DEPTH envelope.
            console.warn(`${TAG} §BCN-ALCADA failed — height omitted:`, e);
        }

        // §STALE-ASYNC-ZONING — final resume point, after the block + roads + alçada chain (the
        // longest window of all). Re-check one last time immediately before the write.
        if (!bcnZoningStillCurrent(ctx, boundary, TAG)) return;

        // (h) Dispatch ONLY a status:'ok' envelope; anything else falls back (never a broken one).
        if (envelope.status === 'ok' && envelope.insetPolygon.length >= 3) {
            // §L-518 / §L-572 — the `block-constructed` tier USED TO BE STAMPED HERE, and is not
            // any more: `ZoningRulesEngine` now assigns it itself (search §L-572 there). The
            // condition is unchanged — the `alignment.depthBinding` derivation row is present iff
            // the depth was really solved from the block — but it is now a property of the
            // DETERMINATION rather than of this one UI path, so the per-parcel report, an export
            // or an API gets the same honest label without re-deriving it. Re-adding a re-label
            // here would create a second place for the tier to drift from the engine's caveats.
            // Founder-CONFIRMED 2026-07-21; badge conditions remain in
            // `jurisdictions/es/es-ct/08019-barcelona/RISK-REGISTER.md` (R1): word it "constructed", keep the
            // citations, keep the "2008 modification not reflected" caveat.
            const withTier = envelope;
            // §BCN-ALCADA (L-525a) — attach the CONSTRUCTED height + storey count, each with its own
            // citable "why" row. Only when we actually have one: leaving `maxHeight_m` null is what
            // makes the panel omit the row honestly, and is far better than a number nobody can cite.
            //
            // §L-619 / ADR-0273 — via the SANCTIONED helper, NOT an inline object spread. The spread
            // this replaced set `maxVolumeM3 = insetAreaM2 × height` with (a) NO FAR cap and (b) no
            // tier reconciliation. (a) is the L-616 OVERSTATES-FAR defect: block-derived zones ship
            // `maxHeight_m: null`, so the engine's L-616 cap was SKIPPED at solve time (the height did
            // not yet exist), and the spread never re-applied it — clau 12's real 1,40 índex (Art.
            // 316.2) never bound the volume. `applyConstructedHeight` recomputes `farLimitedHeight_m`
            // with the SAME `computeFarLimitedHeight` the engine uses, given the parcel ring as the
            // FAR denominator (C58 §1.7b.6). (b) it is also tier-safe — a single reader for both.
            // FAR-null zones (13a/13b, `maxFAR: null`) pass through byte-identically: the helper's
            // single-prism branch reproduces exactly today's `maxHeight_m`/`maxFloors`/`maxVolumeM3`,
            // and `computeFarLimitedHeight` returns null (solid == shell, no extra caveat).
            const dispatched =
                alcadaHeightM === null
                    ? withTier
                    : applyConstructedHeight(withTier, {
                          height_m: alcadaHeightM,
                          maxFloors: alcadaFloors,
                          // The parcel boundary polygon (scene-XZ) — the SAME ring handed to
                          // `computeBuildableEnvelope` above and the FAR denominator L-616 needs.
                          // Without it the cap is an honest no-op (never a fabricated number); with
                          // it, clau 12's 1,40 índex binds the volume the moment the height is known.
                          parcelRing: boundary.polygon,
                          // The `maxHeight` derivation row — authored HERE because only this path
                          // knows the article, the width tier and the "why". The helper appends it
                          // verbatim; it never authors a citation of its own.
                          derivationRow: {
                              constraint: 'maxHeight' as const,
                              value: alcadaHeightM,
                              zoneCode: withTier.zoneCode ?? clau,
                              // The construction is stated in the source string so the panel's
                              // explain-why shows HOW the number was reached, not just what it is.
                              // §L-583 — the ARTICLE is the zone's own (Art. 327.2 for 13a/13E,
                              // Art. 328 for 13b), never a literal. A row that named the wrong
                              // article would be the most damaging output this path can
                              // produce: a real number under an authoritative-looking citation
                              // to a document that does not govern the parcel (L-526).
                              source:
                                  `PGM ${alcadaArticle ?? 'alçada article n/a'} alçada ` +
                                  `reguladora [width tier: ` +
                                  `${alcadaProvenance ?? 'unknown'}] — ${alcadaWhy}`,
                              // NOT 'published'. The TABLE is the ordinance, but the WIDTH is
                              // never a published figure: it is a curated Cerdà nominal value
                              // pending L-528, a measurement attributed to a declared quantum,
                              // or a raw measurement — L-537's tier ladder, carried into this
                              // row verbatim so the panel's "Why these numbers?" says WHICH.
                              // Badging any of them as published would be the L-459 defect
                              // again (a constructed number rendering like a surveyed one).
                              fieldProvenance: 'ordinance-pdf' as const,
                              // §L-583 — the zone's own citation, resolved alongside the
                              // article that produced the number (never the 13a constant).
                              ordinanceRef: alcadaOrdinanceRef,
                          },
                      });
            dispatchEnvelope(ctx, site.id, dispatched, 'muc-catastro');
            // §L-507-DEPTH-DIAG — surface the REAL numbers so the founder can correlate the panel
            // + the 3D envelope SHAPE with the data ("is the 26 m depth what the prism shows?").
            // The depth + how it was bound live in the derivation trace (alignment.depth /
            // alignment.depthBinding); insetArea vs parcel area shows how much of the plot the
            // depth band covers (a mid-block parcel shallower than the depth → whole plot; a deep
            // parcel → a street-facing band leaving the interior free).
            const depthRow = envelope.derivation.find((d) => d.constraint === 'alignment.depth');
            const bindRow = envelope.derivation.find((d) => d.constraint === 'alignment.depthBinding');
            const parcelAreaM2 = Math.abs(
                boundary.polygon.reduce((acc, p, i) => {
                    const q = boundary.polygon[(i + 1) % boundary.polygon.length];
                    return acc + (p.x * q.z - q.x * p.z);
                }, 0) / 2,
            );
            console.log(
                `${TAG} envelope OK → confidence=${envelope.confidence} zone=${envelope.zoneCode ?? 'n/a'} ` +
                    `depth=${typeof depthRow?.value === 'number' ? depthRow.value.toFixed(1) + 'm' : 'n/a'} ` +
                    `(binding=${bindRow?.value ?? 'n/a'}) inset=${envelope.insetAreaM2.toFixed(1)}m² of ` +
                    `parcel~${parcelAreaM2.toFixed(0)}m² (${parcelAreaM2 > 0 ? Math.round((envelope.insetAreaM2 / parcelAreaM2) * 100) : '?'}% covered) ` +
                    `— REAL, cited per PGM Art. 242.2.`,
            );
        } else {
            // §L-574 — the construction RAN on a real block and produced no usable envelope
            // (`degenerate`: an irregular ring, no `front` edge, or Art. 242.2 with no solution).
            // The engine's caveats say exactly which, and are still logged — they render nowhere
            // yet (L-573), which is precisely why the refusal card has to carry the explanation.
            console.log(
                `${TAG} envelope status=${envelope.status} — §L-574 refusal. ` +
                    `caveats: ${envelope.caveats.join(' | ')}`,
            );
            refuseConstructionIncomplete('construction-no-solution');
        }
    } catch (e) {
        // §L-574 reasoning, §L-663 CONCLUSION REVERSED.
        //
        // L-574 argued this catch should keep the estimated fallback because a refusal card must
        // NAME the zone (L-553 rule 1), and a throw here may mean we never learned the clau —
        // `clau` / `knownFacts` are scoped to the `try` and genuinely unavailable. That premise
        // still holds. What it got wrong is the alternative it compared against: it weighed an
        // *unnamed refusal* against an *honestly-badged estimate* and picked the estimate. But the
        // estimate is not merely unnamed, it is a fabricated setback triple of the wrong SHAPE for
        // *alineacions de vial* fabric, and on screen it is indistinguishable from a determination.
        // An unnamed "we could not complete this" is a weaker card; a confident wrong volume is a
        // wrong answer.
        //
        // The card is no longer unnamed either: §L-663's refusal names the JURISDICTION (read live
        // from the registry) even when the zone is unknown, which is precisely the L-553 property —
        // proving we identified the user's land — at the coarsest granularity we can honestly claim.
        //
        // The five paths that DO know the clau still refuse individually above with the better,
        // zone-named card; this is the residual "we don't even know what we were solving" case.
        console.warn(`${TAG} §L-663 path failed before/outside the clau-known paths — the chokepoint refuses (no estimate):`, e);
        try { applyEstimatedZoning(ctx, estimated); } catch { /* estimated is best-effort too */ }
    }
}

/**
 * C58 §3.2 / §1.7 + §ENVELOPE-VIA-MASSING (L-402d) — THE SINGLE ESTIMATED-ENVELOPE
 * PRODUCER. Run the PURE estimated-default solver over the just-committed parcel and
 * cache the full `BuildableEnvelope` (confidence label + derivation + inset ring in
 * scene-XZ) so BOTH renderers read ONE geometry source: the Forma/Cesium 3D Site (via
 * `resolveFormaEnvelope`) AND the BIM three.js scene (via the site-element renderer),
 * plus the facts card. Called BEFORE `site.parcel-boundary-set` emits so the framing
 * render already has the ring (see `dispatchParcelBoundary`). In Denmark this estimated
 * ring is the immediate framing geometry; the real structured envelope replaces it in
 * `_lastEnvelope` when the async DK fetch returns (see `applyDkZoningThenFallback`).
 * `confidence: 'estimated-ruleset'` (the honest label, C58 §1.4). Fully guarded — never
 * throws into the commit path; returns the envelope (also cached) or null.
 */
function computeAndCacheEstimatedEnvelope(
    boundary: {
        polygon: XZPoint[];
        edgeClassifications: ParcelEdgeClassification[];
    },
): BuildableEnvelope | null {
    try {
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) return null;
        const envelope = solveEstimatedEnvelope(
            boundary.polygon,
            boundary.edgeClassifications,
        );
        _lastEnvelope = envelope;
        noteSiteDispatchOwner(); // §L-676 — record WHICH project this envelope belongs to.
        return envelope;
    } catch (e) {
        console.warn('[gis][c58] buildable-envelope solve failed (non-fatal):', e);
        return null;
    }
}

/**
 * C58 §1.7 — thread the (already-computed + cached) ESTIMATED envelope onto the C19
 * Parcel via the shared `dispatchEnvelope` (P6 `site.updateZoning` + `_lastEnvelope`
 * cache + `site.zoning-updated`). Takes the precomputed envelope from
 * `computeAndCacheEstimatedEnvelope` so the geometry is produced exactly once; this is
 * the non-DK / fallback path (`jurisdictionRef: 'estimated-default'`). Fully guarded —
 * never throws into the commit path.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * §L-663 — **THIS IS THE CHOKEPOINT. INSIDE A REGISTERED JURISDICTION IT PUBLISHES NO NUMBER.**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * WHAT THE FOUNDER SAW (prod build `6f7c9fd5`, 2026-08-01). A boundary hand-drawn at Carrer de la
 * Diputació × Carrer de Roger de Llúria — central Eixample, clau `13a`, four shipped Barcelona
 * packs — rendered `estimated-default` verbatim: 3.0 / 1.5 / 3.0 m, FAR 2.00, coverage 50 %,
 * `EST · zone generic-urban · no citation`. The SAME block, Catastro-SELECTED, resolved clau 13a
 * from the MUC and refused honestly (`source-data-unavailable`, block dissolve). Two answers on
 * one piece of land, and the fabricated one is the one that draws a purple volume.
 *
 * WHY IT WAS NOT ONE BAD LINE. There are (were) FIFTEEN `applyEstimatedZoning` call sites inside
 * the jurisdiction handlers — `!qual`, `!site`, `<3 vertices`, and one `catch` per city. Not one
 * of them is an intentional "we estimate here": every jurisdiction that reaches this file already
 * ships a cited refusal for its own failures. They are all GUARDS, and a guard whose failure mode
 * is "publish a number" is the §CONTEXT-DATA-HONESTY collapse fifteen times over. Fixing the one
 * line the founder happened to hit would have left fourteen.
 *
 * SO THE RULE IS STRUCTURAL AND IT IS ENFORCED HERE, ONCE: **if a registered jurisdiction claims
 * this parcel's point, the estimated pack is unreachable.** The honest answer inside a city we
 * cover is a cited refusal (`estimateSuppressedRefusal`), never a generic triple. Outside every
 * registration nothing changes at all — `estimated-default` remains the honest, badged answer for
 * land PRYZM makes no other claim about, which is exactly what C58 §1.6 authored it for.
 *
 * ⚠ THE POINT IS THE PARCEL'S, NOT THE ANCHOR'S (the L-521 lesson). `_lastParcelQueryPoint` is the
 * area centroid `applyZoning` already computed and routed on, so the guard and the `if` chain
 * cannot disagree about WHERE this parcel is. The site location is the fallback only if that is
 * somehow absent; on a DRAW flow §L-635 has already re-anchored it to the parcel's first vertex,
 * so it is on the parcel either way.
 *
 * ⚠ AND IT ASKS THE REGISTRY, NOT A LITERAL. `resolveRegisteredJurisdictionAt` applies the
 * registry's own §JURISDICTION-SPECIFICITY rule to `listJurisdictionCoverage()` — the same
 * `contains` predicates `applyZoning` routes on. Registering a new city therefore closes this hole
 * for that city with no edit here (C58 §1.5), and a city can never be lit on the coverage globe
 * while still receiving the estimate.
 *
 * ⚠ `'ambiguous'` COUNTS AS CLAIMED. Two registrations tied at the finest rung means we cannot say
 * which ordinance governs — which is strictly LESS certainty than a resolved claim, so it cannot
 * be the case that earns a number. It refuses too.
 */
function applyEstimatedZoning(
    ctx: SiteContext,
    envelope: BuildableEnvelope | null,
): void {
    try {
        const site = ctx.store.getSite();
        if (!site) return;
        // §L-663 — the guard runs BEFORE the `!envelope` bail on purpose. A registered jurisdiction
        // whose estimated solve ALSO failed must still get the refusal card; the old ordering
        // returned silently and left the panel blank, which reads as a crash (L-553).
        if (refuseEstimateInsideRegisteredJurisdiction(ctx, site.id)) return;
        if (!envelope) return;
        dispatchEnvelope(ctx, site.id, envelope, 'estimated-default');
    } catch (e) {
        // Envelope computation is best-effort site intelligence — never block the
        // parcel commit (the boundary is already set + emitted).
        console.warn('[gis][c58] buildable-envelope solve failed (non-fatal):', e);
    }
}

/**
 * §L-663 — the guard behind `applyEstimatedZoning`. Returns `true` when it HANDLED the parcel by
 * dispatching a cited refusal, i.e. when the caller must NOT publish the estimated triple.
 *
 * Split out of `applyEstimatedZoning` so the rule reads as one statement and so the test can drive
 * it through the real dispatcher rather than assert about it. NOT exported: the only sanctioned
 * way to reach it is the chokepoint, which is the property being enforced.
 */
function refuseEstimateInsideRegisteredJurisdiction(ctx: SiteContext, siteId: string): boolean {
    // The parcel's own point (L-521), falling back to the site anchor (which §L-635 has already
    // moved onto the parcel). A non-finite / absent point claims nothing and refuses nothing —
    // "we don't know where this is" must not become "a registered city covers it".
    const loc = ctx.store.getSite()?.location;
    const at =
        _lastParcelQueryPoint ??
        (loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)
            ? { lat: loc.latitude, lon: loc.longitude }
            : null);
    if (!at) return false;

    const claim = resolveRegisteredJurisdictionAt(at.lat, at.lon);
    if (claim.kind === 'none') return false; // Genuinely uncovered land — the estimate is honest here.

    const claimants =
        claim.kind === 'resolved' ? [claim.jurisdiction] : claim.candidates;
    const governing = claimants[0]!;
    // ⚠ On an `'ambiguous'` claim we still refuse, but the card must NOT name one of the tied
    // cities as though it won — that is the coin flip `JurisdictionClaimResolution` exists to
    // refuse. Name them all, and carry no `answerSummary` (there is no single promise to make).
    const displayName =
        claim.kind === 'resolved'
            ? governing.displayName
            : claimants.map((c) => c.displayName).join(' / ');
    const refusal = estimateSuppressedRefusal({
        jurisdictionDisplayName: displayName,
        answerSummary: claim.kind === 'resolved' ? governing.answerSummary : null,
        knownFacts: [
            `Jurisdiction: ${displayName}`,
            `Location: ${at.lat.toFixed(5)}, ${at.lon.toFixed(5)}`,
        ],
    });
    // `status: 'none'` — ATTEMPTED, no data. NOT `'not-applicable'`, which would assert the
    // ordinance answered "no envelope here"; we never even learned the zone. Both clear a stale
    // `buildableRing` (`dispatchEnvelope` writes one only on `'ok'`), so L-445 holds either way.
    // `zoneCode: null` — there is no zone to state, and a placeholder string would read as one.
    dispatchEnvelope(
        ctx,
        siteId,
        buildRefusedEnvelope(null, refusal, 'none'),
        claim.kind === 'resolved' ? governing.jurisdictionId : 'ambiguous-jurisdiction',
    );
    console.warn(
        `[gis][c58] §L-663 ESTIMATE SUPPRESSED — ${at.lat.toFixed(5)},${at.lon.toFixed(5)} is inside ` +
            `a REGISTERED jurisdiction (${claim.kind}: ${claimants.map((c) => c.jurisdictionId).join(', ')}), ` +
            `so the generic estimated-default triple (3.0/1.5/3.0 m, FAR 2.0, 50 %) was NOT published. ` +
            `A cited refusal was dispatched instead. ⚠ Reaching this line means an upstream lookup ` +
            `FAILED — the city path should have produced its own cited answer; look for the ` +
            `preceding §BCN/§MADRID/§MURCIA/… log line to see which input was missing.`,
    );
    return true;
}

/**
 * C58 §1.7 — thread a computed `BuildableEnvelope` onto the C19 Parcel via the
 * EXISTING `site.updateZoning` command (P6), cache the full object for the Forma
 * render + facts card, and emit `site.zoning-updated`. Shared by the DK (structured)
 * and estimated paths — the ONLY difference between them is the envelope + the
 * `jurisdictionRef` provenance tag.
 */
function dispatchEnvelope(
    ctx: SiteContext,
    siteId: string,
    envelope: BuildableEnvelope,
    jurisdictionRef: string,
): void {
    markStartupPhase(`envelope:dispatched(${envelope.status})`); // §STARTUP-BUDGET
    _lastEnvelope = envelope;
    noteSiteDispatchOwner(); // §L-676 — record WHICH project this envelope belongs to.
    // §NEARBY-HEIGHT-SUGGESTION — every NORMAL dispatch (this function) is, by construction, a
    // reviewed/confirmed result — never the admin-only unreviewed auto-preview (that path is
    // `previewSuggestedZoneEnvelope`, which sets the flag `true` itself, right after calling this
    // very function would otherwise have left it `false`). Resetting here — unconditionally, on
    // every call — is what makes "click Save + compute" flip the render back to the normal
    // confident/provisional colours even when the admin re-selects the SAME suggested zone.
    _lastEnvelopeIsSuggestedPreview = false;

    // Read the resolved per-edge setbacks off the derivation trace (the numeric
    // "why" entries) to patch the C19 mutable Parcel fields.
    const setbackOf = (
        constraint: 'setback.front' | 'setback.side' | 'setback.rear',
    ): number | undefined => {
        const e = envelope.derivation.find((d) => d.constraint === constraint);
        return typeof e?.value === 'number' ? e.value : undefined;
    };
    const setbacks: { front?: number; side?: number; rear?: number } = {};
    const f = setbackOf('setback.front');
    const s = setbackOf('setback.side');
    const r = setbackOf('setback.rear');
    if (f !== undefined) setbacks.front = f;
    if (s !== undefined) setbacks.side = s;
    if (r !== undefined) setbacks.rear = r;

    // ADR-0270 option A / C58 §1.7a (L-451) — PERSIST THE INSET RING. This is the half of the
    // A1c wiring that was missing: the schema (`Parcel.buildableRing`) and the command
    // (`siteUpdateZoning` preserve-on-omit) both landed, but NOTHING ever sent the field, so
    // the ring lived only in the `_lastEnvelope` module global and died on reload — the
    // L-445 root cause. An explicit `null` CLEARS a stale ring rather than leaving one that no
    // longer describes this parcel, which would be worse than none because it still looks
    // authoritative (C58 §1.4). A degenerate/rejected solve therefore clears, never writes.
    const insetRing =
        envelope.status === 'ok' && envelope.insetPolygon.length >= 3
            ? envelope.insetPolygon.map((p) => ({ x: p.x, z: p.z }))
            : null;

    const res = siteUpdateZoning(
        {
            siteId,
            setbacks: Object.keys(setbacks).length > 0 ? setbacks : undefined,
            maxFAR: envelope.maxFAR,
            maxHeight: envelope.maxHeight_m,
            buildableRing: insetRing,
            zoning: {
                category: envelope.zoneCode,
                jurisdictionRef,
            },
        },
        ctx.store,
    );
    if (!res.ok) {
        console.warn('[gis][c58] site.updateZoning soft-reject:', res.reason, res.message);
        return;
    }
    console.log(
        `[gis][c58] buildable envelope computed → confidence=${envelope.confidence} ` +
            `status=${envelope.status} inset=${envelope.insetAreaM2.toFixed(1)}m² ` +
            `height=${envelope.maxHeight_m ?? 'n/a'}m — zoning fields updated (P6).`,
    );
    ctx.rt.events?.emit('site.zoning-updated', res.event);
}
