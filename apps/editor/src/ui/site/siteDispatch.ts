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
} from '@pryzm/schemas';
import { SiteModelSchema } from '@pryzm/schemas';
import {
    solveEstimatedEnvelope,
    computeBuildableEnvelope,
    DkZoningProvider,
    isInDenmark,
} from '@pryzm/site-parcel-data';
import { GeospatialAdapter } from '@pryzm/geospatial';
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
// The computed `BuildableEnvelope` is TRANSIENT per C58 §1.7 (only the numeric
// setback/height fields persist on the C19 Parcel via `site.updateZoning`; the
// confidence label + derivation trace + inset ring are not persisted authored
// data). We cache the last-computed envelope here — mirroring the `_lastSiteOrigin`
// pattern above — so the Forma render + facts card can read the full object
// (inset ring in scene-XZ, height, confidence, derivation) without recomputing.
let _lastEnvelope: BuildableEnvelope | null = null;

/** C58 — the last computed buildable envelope for the current parcel, or null. */
export function getLastBuildableEnvelope(): BuildableEnvelope | null {
    return _lastEnvelope;
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

    const boundaryRes = siteSetParcelBoundary({ siteId, boundary }, ctx.store);
    if (!boundaryRes.ok) {
        console.error('[gis] site.setParcelBoundary rejected:', boundaryRes.reason, boundaryRes.message);
        ctx.toast(`Set parcel boundary failed: ${boundaryRes.message}`, 'error');
        return false;
    }
    console.log('[gis] site.parcel-boundary-set', boundaryRes.event, 'area(m²)=', boundaryRes.event.area);
    ctx.rt.events?.emit('site.parcel-boundary-set', boundaryRes.event);

    // C58 (L-398 / L-399a) — the payoff of committing a parcel: compute the
    // buildable envelope and write its numeric results onto the C19 Parcel via
    // the EXISTING `site.updateZoning` command (P6 — the UI never writes zoning
    // fields directly). Jurisdiction-selected: a plot in Denmark resolves REAL
    // structured Plandata.dk zoning; everywhere else uses the estimated default.
    applyZoning(ctx, boundary);
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
 * else uses the curated `estimated-default` pack (`estimated-ruleset`).
 *
 * The DK path is async (same-origin proxy fetch) and best-effort: on ANY
 * failure / no-plan it falls back to the estimated default, so the envelope is
 * NEVER broken (C58 §1.2 fidelity-3 graceful degradation). Non-DK plots keep the
 * exact synchronous estimated path they had before — no behaviour change.
 *
 * Kept deliberately minimal (another agent may touch this file): selection is a
 * bbox predicate on the site location; the shared dispatch + estimated solve are
 * unchanged below.
 */
function applyZoning(ctx: SiteContext, boundary: ZoningBoundary): void {
    try {
        const loc = ctx.store.getSite()?.location;
        if (loc && isInDenmark(loc.latitude, loc.longitude)) {
            void applyDkZoningThenFallback(ctx, boundary, loc.latitude, loc.longitude);
            return;
        }
    } catch (e) {
        console.warn('[gis][c58] jurisdiction selection failed (non-fatal) — using estimated default:', e);
    }
    applyEstimatedZoning(ctx, boundary);
}

/**
 * L-399a — the Denmark path: fetch structured zoning from Plandata.dk (via the
 * same-origin keyless proxy), solve a `structured` envelope, and dispatch it. On
 * a miss / any failure, fall back to the estimated default (never a broken
 * envelope). Fully guarded — never throws into the commit path.
 */
async function applyDkZoningThenFallback(
    ctx: SiteContext,
    boundary: ZoningBoundary,
    lat: number,
    lon: number,
): Promise<void> {
    try {
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) return;
        const record = await DkZoningProvider.fetchZoningAtPoint(lat, lon);
        if (!record) {
            // No usable Danish plan at this point → estimated default.
            applyEstimatedZoning(ctx, boundary);
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
        try { applyEstimatedZoning(ctx, boundary); } catch { /* estimated is best-effort too */ }
    }
}

/**
 * C58 §3.2 / §1.7 — run the PURE estimated-default solver over the just-committed
 * parcel (the non-DK / fallback path) and dispatch its numeric results.
 * `confidence: 'estimated-ruleset'` (the honest label, C58 §1.4). Fully guarded.
 */
function applyEstimatedZoning(ctx: SiteContext, boundary: ZoningBoundary): void {
    try {
        if (!Array.isArray(boundary.polygon) || boundary.polygon.length < 3) return;
        const site = ctx.store.getSite();
        if (!site) return;
        const envelope = solveEstimatedEnvelope(
            boundary.polygon,
            boundary.edgeClassifications,
        );
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

    const res = siteUpdateZoning(
        {
            siteId,
            setbacks: Object.keys(setbacks).length > 0 ? setbacks : undefined,
            maxFAR: envelope.maxFAR,
            maxHeight: envelope.maxHeight_m,
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
