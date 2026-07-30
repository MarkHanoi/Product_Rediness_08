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
    madridNZ1Refusal,
    // L-550 Phase 0.1/0.3 — the rule-pack REGISTRY replaced the hard-coded
    // `BCN_ENSANCHE_ZONE_CODES.includes(clau)` gate that used to live here, so a new clau (or a
    // new city) is a data addition in `@pryzm/site-parcel-data`, not an edit to this L5 file
    // (C58 §1.5). It answers `pack` / `refusal` / `unregistered` — three outcomes, because
    // "the ordinance grants no envelope here" and "PRYZM has not encoded this zone yet" are
    // opposite claims and the old boolean collapsed them.
    resolveZoneDisposition,
    buildRefusedEnvelope,
    // §L-591 — clau `20a/*` (*edificació aïllada*). Its rule is a plain `setback` inset from the
    // parcel's own boundary, so it must NOT be routed through the block-derived Art. 242 path.
    // Two of the ten subzones state their numbers as CONSTRUCTIONS, resolved per parcel here.
    resolve20aEdificabilitat,
    resolve20aParcelOverrides,
    // §L-574 — the third refusal: an ENCODED clau whose construction could not complete.
    barcelonaConstructionIncompleteRefusal,
    type ConstructionFailureReason,
    BCN_JURISDICTION_ID,
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
    // BARCELONA-GIS-AUDIT-SPIKE — clau 18 (volumetria específica) explicit-area path. The AMB Refós
    // OV_Trames resolver (footprint + PLANTES floor count, WGS84, never throws) + its UNREGISTERED
    // pack. Gated on `BCN_REFOS_OV_CERTIFIED` (default OFF): while closed, clau 18 keeps its cited
    // refusal (`resolveZoneDisposition` still refuses it) and this branch is skipped entirely.
    resolveBcnRefosOV,
    BCN_REFOS_OV_RING_REF,
    BCN_REFOS_OV_CERTIFIED,
    ES_BARCELONA_VOLUMETRIA_18_PACK,
    BCN_VOLUMETRIA_18_ZONE_CODE,
    BCN_VOLUMETRIA_18_ORDINANCE_REF,
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
} from '@pryzm/site-parcel-data';
import { GeospatialAdapter } from '@pryzm/geospatial';
// ADR-0271 §BCN-REAL-ENVELOPE — the impure edge providers the Barcelona path injects into the
// PURE engine: clau (MUC), parcel refcat + block (Catastro), and OSM road centrelines.
import { fetchQualificationAtPoint } from './zoning/MucZoningProvider.js';
import { catastroParcelProvider } from './parcel/CatastroParcelProvider.js';
import { fetchBlockForParcel } from './parcel/CatastroBlockProvider.js';
import { fetchContextRoads } from '../geospatial/contextRoads.js';
import { fetchContextBuildingsNearAndFar } from '../geospatial/contextBuildings.js';
import { latLonToSceneXZ, sceneXZToLatLon, type LatLon } from './boundaryProjection.js';
import { trace } from '@opentelemetry/api';
import { polygonAreaXZ } from './siteInspectorData';

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

/** C58 — the last computed buildable envelope for the current parcel, or null. */
export function getLastBuildableEnvelope(): BuildableEnvelope | null {
    return _lastEnvelope;
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
            _lastSiteOrigin = null;
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
function resolveActiveProjectId(rt: PryzmRuntime): string | null {
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
    console.log('[gis] site.location-changed', locRes.event);
    ctx.rt.events?.emit('site.location-changed', locRes.event);
    return true;
}

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

    const boundaryRes = siteSetParcelBoundary({ siteId, boundary }, ctx.store);
    if (!boundaryRes.ok) {
        console.error('[gis] site.setParcelBoundary rejected:', boundaryRes.reason, boundaryRes.message);
        ctx.toast(`Set parcel boundary failed: ${boundaryRes.message}`, 'error');
        return false;
    }
    console.log('[gis] site.parcel-boundary-set', boundaryRes.event, 'area(m²)=', boundaryRes.event.area);

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
function applyZoning(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    estimated: BuildableEnvelope | null,
): void {
    try {
        const loc = ctx.store.getSite()?.location;
        // §L-521 — resolve the jurisdiction + fetch the REAL zoning at the DRAWN PARCEL'S actual
        // centroid, NOT the site anchor. On a SELECT flow the anchor IS the parcel (centroid ≈
        // anchor ⇒ unchanged); on a DRAW flow the anchor is the initial geocode (e.g. the Barcelona
        // city centre / Gothic Quarter) while the boundary is drawn elsewhere (Passeig de Gràcia),
        // so querying at the anchor hit a NON-Eixample clau and fell back to estimated — the
        // founder's "the drawn envelope stays on placeholder dims". Recover the centroid's lat/lon:
        // undo the commit θ-rotation (project→true via -θ), then invert the equirectangular
        // projection about the site origin (= anchor lat/lon).
        let qLat: number | undefined = loc?.latitude;
        let qLon: number | undefined = loc?.longitude;
        if (loc && boundary.polygon.length >= 3) {
            // §L-521b — use the AREA centroid (shoelace), NOT the vertex average. A hand-drawn boundary
            // can be irregular/concave, where the vertex average drifts OUTSIDE the polygon and would
            // query Catastro/MUC at the wrong point → wrong clau / no parcel → estimated fallback (the
            // founder's recurring "estimated on a Barcelona draw"). The area centroid is the proper
            // polygon centroid and lands inside for the typical near-convex parcel; a degenerate
            // (near-zero) area falls back to the vertex average.
            const poly = boundary.polygon;
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
            const theta = Number.isFinite(loc.trueNorth) ? loc.trueNorth : 0;
            const tn = theta === 0
                ? { east: cx, north: -cz }
                : trueVectorToProjectNorth({ east: cx, north: -cz }, -theta);
            const ll = sceneXZToLatLon({ x: tn.east, z: -tn.north }, loc.latitude, loc.longitude);
            qLat = ll.lat;
            qLon = ll.lon;
        }
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
        if (qLat != null && qLon != null && isInBarcelona(qLat, qLon)) {
            void applyBcnZoningThenFallback(ctx, boundary, qLat, qLon, estimated);
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
        // §COR-ENVELOPE — a Córdoba (Sur + Noroeste pilot) plot. ⚠ The pack is machine-OCR'd and
        // UNVERIFIED, so this path renders NO number: until `sources/VERIFICATION.md` is signed it
        // dispatches a cited "machine-extracted, unverified" refusal, never a fabricated envelope.
        if (qLat != null && qLon != null && isInCordoba(qLat, qLon)) {
            void applyCordobaZoningThenFallback(ctx, boundary, qLat, qLon, estimated);
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
            const envelope = computeBuildableEnvelope({
                parcelRing: boundary.polygon,
                edgeClassifications: boundary.edgeClassifications,
                zoning: zoningForEnvelope,
                rulePack: null, // structured fields only → confidence 'structured' (C58 §1.2)
            });
            // A resolvable HEIGHT (published OR storey-derived) means a study volume can be drawn.
            if (envelope.status === 'ok' && envelope.maxHeight_m !== null) {
                const env2: typeof envelope = heightDerivedFromFloors
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
                dispatchEnvelope(ctx, site.id, env2, 'plandata-dk');
                console.log(
                    `${TAG} ${heightDerivedFromFloors ? 'storey-DERIVED' : 'structured'} envelope → ` +
                        `confidence=${env2.confidence} zone=${envelope.zoneCode ?? 'n/a'} ` +
                        `height=${envelope.maxHeight_m}m` +
                        `${heightDerivedFromFloors ? ` (from ${sf.maxFloors} storeys)` : ''}.`,
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
async function applyMadridZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    _estimated: BuildableEnvelope | null,
): Promise<void> {
    const TAG = '[gis][c58] §MADRID-NZ1';
    try {
        const site = ctx.store.getSite();
        if (!site) return; // No site to dispatch onto — nothing to render either way.
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) {
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(MADRID_NZ1_ZONE_CODES[0], madridNZ1Refusal(), 'none'),
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
                buildRefusedEnvelope(MADRID_NZ1_ZONE_CODES[0], madridNZ1Refusal(), 'none'),
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
                zoneCode: MADRID_NZ1_ZONE_CODES[0], // reads the pack zone's explicit-area rule.
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
            madridOutcome.status === 'transient' ? madridNZ1Refusal() : madridNZ1AbsentRefusal();
        dispatchEnvelope(
            ctx,
            site.id,
            buildRefusedEnvelope(MADRID_NZ1_ZONE_CODES[0], madridRefusal, 'none'),
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
                    buildRefusedEnvelope(MADRID_NZ1_ZONE_CODES[0], madridNZ1Refusal(), 'none'),
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
 */
async function applyCordobaZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    estimated: BuildableEnvelope | null,
): Promise<void> {
    const TAG = '[gis][c58] §COR-ENVELOPE';
    // A placeholder zone code for the refusal envelope: no COACo subzone resolver is wired yet
    // (WIRING-TODO 5, unblocked WITH the verification sign-off), so a Córdoba parcel is not yet
    // bound to PAS-1/MC-3/etc. `zoneCode` is required (min length 1); this names the pilot, not a
    // subzone, and no number rides on it.
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
        const knownFacts = [
            `Location: Córdoba (${lat.toFixed(5)}, ${lon.toFixed(5)}) — Sur + Noroeste PGOU-2001 pilot`,
            parcelAreaM2 !== null ? `Parcel area: ${Math.round(parcelAreaM2).toLocaleString()} m²` : null,
            'Planning source: Ayuntamiento de Córdoba PGOU-2001 (COACo) — machine-extracted, unverified',
        ].filter((s): s is string => typeof s === 'string');

        if (!CORDOBA_ENVELOPE_VERIFIED) {
            // ⚠⚠⚠ THE HONESTY GATE. Unverified → refuse, never a number. `status: 'none'` = attempted,
            // value WITHHELD pending human verification (NOT `'not-applicable'`, which would assert the
            // ordinance grants no envelope — it does grant one, we simply have not checked our OCR of it).
            const refusal = cordobaUnverifiedRefusal(null, null, knownFacts);
            dispatchEnvelope(
                ctx,
                site.id,
                buildRefusedEnvelope(CORDOBA_PILOT_ZONE_CODE, refusal, 'none'),
                'coaco-pgou',
            );
            console.log(
                `${TAG} §HONESTY-GATE CORDOBA_ENVELOPE_VERIFIED=false — dispatched the ` +
                    `machine-extracted-unverified refusal; NO number rendered (${refusal.code}). ` +
                    `area=${parcelAreaM2?.toFixed(0) ?? 'n/a'} m². Signs off via sources/VERIFICATION.md.`,
            );
            return;
        }

        // ── VERIFICATION SIGNED (future) — resolve the subzone from COACo `ordenanza` + the `O_*`
        // link suffix (WIRING-TODO 5), ask the registry (`resolveZoneDisposition`), and for a covered
        // subzone compute a `pipeline-extracted-unverified` envelope with the louder affordance;
        // otherwise dispatch the registry refusal (legal "no" family / coverage gap). That resolver +
        // engine wiring lands together WITH the sign-off, so it is not present while the gate is
        // closed. Until it is, refusing is the only honest output — a covered parcel with no wired
        // resolver cannot bind a subzone, so it gets the coverage gap, never a fabricated number.
        console.warn(
            `${TAG} verification is signed but the COACo subzone resolver is not wired yet ` +
                `(WIRING-TODO 5) — dispatching the coverage-gap refusal rather than an unresolved number.`,
        );
        const coverageGap = cordobaNoRulePackRefusal(CORDOBA_PILOT_ZONE_CODE, null, knownFacts);
        dispatchEnvelope(
            ctx,
            site.id,
            buildRefusedEnvelope(CORDOBA_PILOT_ZONE_CODE, coverageGap, 'none'),
            'coaco-pgou',
        );
    } catch (e) {
        console.warn(`${TAG} Córdoba path failed (non-fatal) — falling back to estimated default:`, e);
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
): Promise<boolean> {
    const TAG = '[gis][c58] §BCN-CLAU18-OV';
    try {
        const site = ctx.store.getSite();
        if (!site) return false;
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) return false;

        // (1) Resolve the published volumetric footprint + PLANTES at the parcel point (WGS84).
        // Never throws; a typed refusal → we return false and the caller keeps the clau-18 refusal.
        const resolution = await resolveBcnRefosOV(BCN_REFOS_OV_RING_REF, { lat, lon });
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
            jurisdictionId: BCN_JURISDICTION_ID,
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
            rulePack: ES_BARCELONA_VOLUMETRIA_18_PACK,
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
 * ADR-0271 §BCN-REAL-ENVELOPE — the Barcelona (Eixample) path. Resolves a REAL, CITED
 * buildable envelope for a clau 13a/13E parcel: the *profunditat edificable* is CONSTRUCTED
 * from the block per PGM Art. 242.2 (`ES_BARCELONA_ENSANCHE_PACK` +
 * `block-derived-alignment`), never guessed.
 *
 * THE SAFETY CONTRACT (founder's rule): an ABSENT/refused envelope costs nothing, a WRONG
 * *profunditat edificable* costs credibility. So EVERY problem — no clau / non-Eixample clau /
 * no refcat / no block / a non-conforming block tiling (dissolve `degenerate`) / no street
 * frontages / any thrown error / an envelope whose `status !== 'ok'` — routes to
 * `applyEstimatedZoning` (the precomputed estimated envelope). The worst outcome is "same as
 * today (estimated)". Never throws into the commit path.
 *
 * ⚠ FRAME (the correctness crux): by the time this runs, `boundary.polygon` is already in the
 * θ-DE-ROTATED authoring frame (`dispatchParcelBoundary` squared the parcel to project north
 * BEFORE `applyZoning`). So the block ring AND the roads are projected about the SAME site
 * origin and de-rotated by the SAME θ (`site.location.trueNorth`, which `dispatchParcelBoundary`
 * persisted via `dispatchSiteTrueNorth`) — see `toAuthoringFrame` below. Any other frame yields
 * a garbage envelope.
 */
async function applyBcnZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    estimated: BuildableEnvelope | null,
): Promise<void> {
    const TAG = '[gis][c58] §BCN-REAL-ENVELOPE';
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
        const [qual, parcelFeat] = await Promise.all([
            fetchQualificationAtPoint(lat, lon),
            catastroParcelProvider.fetchParcelAtPoint(lon, lat),
        ]);
        if (!qual) {
            // The MUC refused to name a clau (an ambiguous pixel, or a failed lookup). That is a
            // FAILURE, not a legal answer, so it must NOT become a refusal — estimated fallback.
            console.log(`${TAG} no clau resolved at point — estimated fallback.`);
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
        const disposition = resolveZoneDisposition(BCN_JURISDICTION_ID, clau, {
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
            if (BCN_REFOS_OV_CERTIFIED && clau === BCN_VOLUMETRIA_18_ZONE_CODE) {
                const rendered = await tryBcnClau18Volumetria(ctx, boundary, lat, lon, qual.clauLabel ?? null);
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
                jurisdictionId: BCN_JURISDICTION_ID,
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

        // (d) The block (manzana) this parcel belongs to.
        // §BLOCK-CENTROID-REUSE (L-533) — hand the proxy the centroid we ALREADY have from the
        // parcel fetch above, so it can skip its own `GetParcel` round-trip to the same slow WFS.
        const pRing = Array.isArray(parcelFeat?.ring) ? parcelFeat.ring : null;
        const centroid =
            pRing && pRing.length >= 3
                ? {
                      lat: pRing.reduce((s: number, p: LatLon) => s + p.lat, 0) / pRing.length,
                      lon: pRing.reduce((s: number, p: LatLon) => s + p.lon, 0) / pRing.length,
                  }
                : undefined;
        const tBlock = performance.now();
        const block = await fetchBlockForParcel(refcat, undefined, centroid);
        console.log(
            `${TAG} §BCN-ENVELOPE-TIMING block fetch ${(performance.now() - tBlock).toFixed(0)} ms ` +
                `(centroid ${centroid ? 'reused — GetParcel skipped' : 'unavailable'}).`,
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
            const placeholderFront = (boundary.edgeClassifications ?? [])
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
                const neighbourRingsXZ = (block.neighbours ?? []).map((n) =>
                    n.ring.map(toAuthoringFrame),
                );
                if (neighbourRingsXZ.length === 0) {
                    measureNote = 'no neighbour parcels returned for this block';
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
                    `neighbours=${block.neighbours?.length ?? 0} — ${alcadaWhy}.`,
            );
        } catch (e) {
            // Never allowed to cost the (already-correct) DEPTH envelope.
            console.warn(`${TAG} §BCN-ALCADA failed — height omitted:`, e);
        }

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
        // §L-574 — DELIBERATELY still the estimated fallback, and NOT a refusal.
        //
        // A refusal card must NAME the zone (L-553 rule 1: proving we identified the land
        // correctly is what separates "missing data" from "broken"). This catch wraps the WHOLE
        // path, including everything before the clau is resolved, so a throw here may mean we
        // never learned the zone at all — and `clau` / `knownFacts` are scoped to the `try` and
        // genuinely unavailable here. Emitting an unnamed "could not complete" card would be a
        // worse answer than the honestly-badged estimate, and inventing a zone name to fill it
        // would be the fabrication this whole item removes.
        //
        // The five paths that DO know the clau refuse individually above; this is the residual
        // "we don't even know what we were solving" case.
        console.warn(`${TAG} path failed before/outside the clau-known paths — estimated fallback:`, e);
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
 */
function applyEstimatedZoning(
    ctx: SiteContext,
    envelope: BuildableEnvelope | null,
): void {
    try {
        if (!envelope) return;
        const site = ctx.store.getSite();
        if (!site) return;
        dispatchEnvelope(ctx, site.id, envelope, 'estimated-default');
    } catch (e) {
        // Envelope computation is best-effort site intelligence — never block the
        // parcel commit (the boundary is already set + emitted).
        console.warn('[gis][c58] buildable-envelope solve failed (non-fatal):', e);
    }
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
    _lastEnvelope = envelope;

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
