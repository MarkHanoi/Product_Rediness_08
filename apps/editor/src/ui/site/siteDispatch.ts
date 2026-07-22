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
    ZoningRecord,
    Pt,
} from '@pryzm/schemas';
import { SiteModelSchema } from '@pryzm/schemas';
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
    isInDenmark,
    // ADR-0271 §BCN-REAL-ENVELOPE — Barcelona ensanche real-envelope path.
    isInBarcelona,
    // L-550 Phase 0.1/0.3 — the rule-pack REGISTRY replaced the hard-coded
    // `BCN_ENSANCHE_ZONE_CODES.includes(clau)` gate that used to live here, so a new clau (or a
    // new city) is a data addition in `@pryzm/site-parcel-data`, not an edit to this L5 file
    // (C58 §1.5). It answers `pack` / `refusal` / `unregistered` — three outcomes, because
    // "the ordinance grants no envelope here" and "PRYZM has not encoded this zone yet" are
    // opposite claims and the old boolean collapsed them.
    resolveZoneDisposition,
    buildRefusedEnvelope,
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
    readonly source: 'solved' | 'persisted' | 're-inset';
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
            source: 'solved',
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
                source: 'persisted',
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
                    source: 're-inset',
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
    if (projectNorthRad !== 0) {
        // Persist θ FIRST: the consumers (globe, solar, north arrow, plan pane) read it from
        // `SiteLocation.trueNorth`, and `site.parcel-boundary-set` below triggers the first
        // render. Setting it after would paint one frame in the wrong orientation.
        dispatchSiteTrueNorth(ctx, projectNorthRad);
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
 * The DK path is async (same-origin proxy fetch) and best-effort: on ANY
 * failure / no-plan it falls back to the estimated envelope (already computed +
 * cached by `computeAndCacheEstimatedEnvelope`), so the envelope is NEVER broken
 * (C58 §1.2 fidelity-3 graceful degradation). Non-DK plots dispatch that same
 * precomputed estimated envelope synchronously — the geometry is solved once.
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
        // ADR-0271 §BCN-REAL-ENVELOPE — a Barcelona-metro plot resolves the REAL, cited
        // ensanche envelope (clau 13a/13E, block-derived profunditat edificable per PGM
        // Art. 242.2). Async + best-effort: ANY problem (or a non-Eixample clau) falls back
        // to the precomputed estimated envelope, exactly like the DK path.
        if (qLat != null && qLon != null && isInBarcelona(qLat, qLon)) {
            void applyBcnZoningThenFallback(ctx, boundary, qLat, qLon, estimated);
            return;
        }
    } catch (e) {
        console.warn('[gis][c58] jurisdiction selection failed (non-fatal) — using estimated default:', e);
    }
    applyEstimatedZoning(ctx, estimated);
}

/**
 * L-399a — the Denmark path: fetch structured zoning from Plandata.dk (via the
 * same-origin keyless proxy), solve a `structured` envelope, and dispatch it (which
 * RE-caches `_lastEnvelope` with the real geometry so both renderers redraw the true
 * DK envelope over the estimated framing ring). On a miss / any failure, fall back to
 * the precomputed estimated envelope (never a broken envelope). Fully guarded — never
 * throws into the commit path.
 */
async function applyDkZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
    estimated: BuildableEnvelope | null,
): Promise<void> {
    try {
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) return;
        const record = await DkZoningProvider.fetchZoningAtPoint(lat, lon);
        if (!record) {
            // No usable Danish plan at this point → the precomputed estimated envelope.
            applyEstimatedZoning(ctx, estimated);
            return;
        }
        const site = ctx.store.getSite();
        if (!site) return;
        const envelope = computeBuildableEnvelope({
            parcelRing: boundary.polygon,
            edgeClassifications: boundary.edgeClassifications,
            zoning: record,
            rulePack: null, // structured fields only → confidence 'structured' (C58 §1.2)
        });
        dispatchEnvelope(ctx, site.id, envelope, 'plandata-dk');
        console.log(
            `[gis][c58] DK Plandata structured zoning applied → confidence=${envelope.confidence} ` +
                `zone=${envelope.zoneCode ?? 'n/a'} height=${envelope.maxHeight_m ?? 'n/a'}m.`,
        );
    } catch (e) {
        console.warn('[gis][c58] DK zoning path failed (non-fatal) — falling back to estimated default:', e);
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
            // `spain/barcelona-catalonia/RISK-REGISTER.md` (R1): word it "constructed", keep the
            // citations, keep the "2008 modification not reflected" caveat.
            const withTier = envelope;
            // §BCN-ALCADA (L-525a) — attach the CONSTRUCTED height + storey count, each with its own
            // citable "why" row. Only when we actually have one: leaving `maxHeight_m` null is what
            // makes the panel omit the row honestly, and is far better than a number nobody can cite.
            const dispatched =
                alcadaHeightM === null
                    ? withTier
                    : {
                          ...withTier,
                          maxHeight_m: alcadaHeightM,
                          maxFloors: alcadaFloors,
                          maxVolumeM3: withTier.insetAreaM2 * alcadaHeightM,
                          derivation: [
                              ...withTier.derivation,
                              {
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
                          ],
                      };
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
