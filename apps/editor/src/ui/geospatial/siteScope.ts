// siteScope.ts — §SITE-SCOPE (L-645 re-opened 2026-09-07; C12 §13; ADR-0382) — the 3D-Site scope
// as a VALUE: resolution from the persisted `SiteModel.scope`, its polygon in every frame the
// scene uses, and the containment predicate every layer must agree on.
//
// Founder, verbatim: "I want to have a slide of the scope on 3D Site view — like cityweft does —
// basically we have a scope — could be circular or rectangular whatever is easier for you — and
// then we crop everything — absolutely everything — but within the scope should be sound — really
// detailed and completed."
//
// WHAT THIS MODULE IS. Pure. No THREE, no Cesium, no DOM, no store. It is the ONE place the scope's
// geometry is derived, so the globe clip, the geometric pre-clip of every entity layer, the
// instance-centre filter, the fetch bbox and the slider's preview ring all read the SAME polygon.
// The retired §CTX-EARTH-SLAB (commits 392601e6 → 1b366ed2) failed precisely because it cut ONE
// thing (the globe surface) to ONE disc that nothing else knew about; this module exists so that
// cannot happen again — a layer that does not read this polygon has no scope, and C12 §13.1 forbids
// drawing it.
//
// FRAMES — THREE, AND EXACTLY ONE CONVERSION EACH (C12 §9: never a second projection):
//   • PROJECT (scene-XZ, project north). The persisted value lives here, centred on the site frame
//     origin (scene 0,0). A `rectangle`'s half-extents run along scene X / Z so it stays aligned
//     with the parcel's dominant edge. `scopePolygonXZ` is this frame.
//   • TRUE (true-north XZ: x = east, z = −north). Where OSM / baked context geometry lives after
//     `latLonToSceneXZ` (it is true-north by origin — `sceneEnuFrame.ts` EXEMPT list). The scope
//     gets there by `sceneXZToEnu` — θ applied ONCE, to the scope's ≤256 vertices rather than to
//     tens of thousands of feature vertices. `scopePolygonTrueXZ` is this frame.
//   • WGS84 (lat/lon). `sceneXZToLatLon` — the SAME local equirectangular projection the parcel
//     ring is committed with (`boundaryProjection.ts`), never a second one. `scopePolygonLatLon`.
//
// THE ONE-POLYGON RULE (C12 §13.2). A `circle` is rendered, clipped and tested as ITS POLYGON — the
// n-gon `scopePolygonXZ` emits — never as the analytic circle. An instance whose centre passes an
// exact `x²+z² ≤ r²` test can sit up to r·(1 − cos(π/n)) OUTSIDE the n-gon the globe was cut to
// (1.1 m at r = 900 m, n = 64): a tree floating past the slab edge. `createScopeContainment`
// therefore answers with the polygon, and only uses the circle as a fast pre-check strictly INSIDE
// the inscribed radius or strictly OUTSIDE the circumscribed one. The segment count is chosen from a
// sagitta bound, not a taste number, so the visible edge is round at any radius.
//
// RANGE. The product's slider range (150 … 1781 m today) is a MEASURED tile-fan-out fact owned by
// `contextExtentBudget.ts` (`CTX_SCOPE_MIN_RADIUS_M` / `CTX_SCOPE_MAX_RADIUS_M`, lane
// CONTEXT-EXTENT-2X). This module takes it as a PARAMETER (`SiteScopeRange`) rather than importing
// it, so the two can be committed independently and there is still exactly one number per fact.
//
// P8: exported entry points that run once per load carry a span; the per-point containment
// predicate is hot and deliberately does not.

import { trace } from '@opentelemetry/api';
import { SiteScopeSchema, type SiteScope, type SiteScopeShape } from '@pryzm/schemas';
import { pointInPolygonXZ } from '@pryzm/geometry-kernel';
import { latLonToSceneXZ, sceneXZToLatLon, type LatLon, type XZPoint } from '../site/boundaryProjection';
import { sceneXZToEnu } from './sceneEnuFrame';

export type { SiteScope, SiteScopeShape } from '@pryzm/schemas';

const _tracer = trace.getTracer('pryzm.gis.site-scope');

/** WGS84 equatorial radius (metres) — the SAME literal `boundaryProjection.ts` projects with. */
const EARTH_RADIUS_M = 6_378_137;
const DEG2RAD = Math.PI / 180;

// ─────────────────────────────────────────────────────────────────────────────────────────
// Resolution: persisted value (or null) → the scope the render uses
// ─────────────────────────────────────────────────────────────────────────────────────────

/** The product's slider range + the default, supplied by the owner of those measurements. */
export interface SiteScopeRange {
    /** Smallest allowed circumscribing radius, metres. */
    readonly minRadiusM: number;
    /** Largest allowed circumscribing radius, metres (the z16-complete read ceiling today). */
    readonly maxRadiusM: number;
    /** What an un-authored (`null`) scope resolves to. */
    readonly fallback: SiteScope;
}

export interface ResolvedSiteScope {
    readonly scope: SiteScope;
    /**
     *   • `authored` — the persisted value, inside the range, used verbatim.
     *   • `clamped`  — the persisted value was outside the range and was scaled onto it
     *                  (`clampedFromRadiusM` says from what). The product SAYS so (C12 §13.5).
     *   • `default`  — nothing authored (`null`); the range's fallback.
     *   • `invalid`  — the value did not parse as a `SiteScope` at all (a stale runtime object,
     *                  never a file — the schema rejects it at load); the fallback, and a note.
     */
    readonly source: 'authored' | 'clamped' | 'default' | 'invalid';
    readonly clampedFromRadiusM?: number;
    readonly note?: string;
}

/**
 * The scope's CIRCUMSCRIBING radius, metres — the one number every radial limit reduces it to
 * (mirrors `scopeOuterRadiusM` in `contextExtentBudget.ts` by definition, not by import). A
 * rectangle loads a superset of what it draws, which is the only safe direction.
 */
export function scopeOuterRadiusM(scope: SiteScope): number {
    return scope.shape === 'circle' ? scope.radiusM : Math.hypot(scope.halfWidthM, scope.halfDepthM);
}

/** The largest disc guaranteed INSIDE the scope, metres. Circle: r. Rectangle: the shorter half. */
export function scopeInnerRadiusM(scope: SiteScope): number {
    return scope.shape === 'circle' ? scope.radiusM : Math.min(scope.halfWidthM, scope.halfDepthM);
}

/** Plan area of the scope, m². Used with an eligible-feature count to reason about density. */
export function scopeAreaM2(scope: SiteScope): number {
    return scope.shape === 'circle'
        ? Math.PI * scope.radiusM * scope.radiusM
        : 4 * scope.halfWidthM * scope.halfDepthM;
}

/**
 * Scale a scope so its circumscribing radius lands inside `[min, max]`. SHAPE-PRESERVING: a
 * rectangle keeps its aspect (both half-extents scale together), a circle its centre. Returns the
 * same reference when nothing changes, so a caller can detect a clamp by identity.
 */
export function clampSiteScope(scope: SiteScope, range: Pick<SiteScopeRange, 'minRadiusM' | 'maxRadiusM'>): SiteScope {
    const outer = scopeOuterRadiusM(scope);
    const target = Math.min(range.maxRadiusM, Math.max(range.minRadiusM, outer));
    if (!(outer > 0) || target === outer) return scope;
    const k = target / outer;
    return scope.shape === 'circle'
        ? { shape: 'circle', radiusM: scope.radiusM * k }
        : { shape: 'rectangle', halfWidthM: scope.halfWidthM * k, halfDepthM: scope.halfDepthM * k };
}

/**
 * ⭐ §FULL-PLATE-READ (L-13123) — the scope GROWN by `slackM` on every side. PURE, shape-preserving,
 * and an EXACT Minkowski dilation for both shapes (a circle by its radius, a rectangle by each
 * half-extent), so `contains(dilate(s, d))` is exactly "within `d` metres of the scope".
 *
 * ⛔ WHY IT EXISTS, AND WHY IT IS NOT `clampSiteScope`. The buildings read is a SQUARE box around
 * the scope's circumscribing disc, so it returns roughly TWICE the footprints a rectangular plate
 * will draw — and the whole-scene cap was spent on that box, nearest-first, BEFORE the scope clip
 * ran. Culling to the scope FIRST spends every unit of the budget on a footprint that will actually
 * be drawn. But a plain centre-in-scope test would DELETE the straddlers the clip exists to SECTION
 * (the founder's own log reads `251 cut`), turning a clean vertical cut face into a missing
 * building. The dilation is that safety margin, expressed as geometry rather than as a fudge: a
 * footprint whose CENTRE is within `slackM` of the plate is kept and handed to the clip, which
 * decides. `clampSiteScope` SCALES to a target radius (it would grow a rectangle's short side by
 * the same RATIO as its long one); this ADDS a distance, which is the only correct sense of "near
 * enough to the edge to matter".
 */
export function dilateSiteScope(scope: SiteScope, slackM: number): SiteScope {
    const d = Number.isFinite(slackM) && slackM > 0 ? slackM : 0;
    if (d === 0) return scope;
    return scope.shape === 'circle'
        ? { shape: 'circle', radiusM: scope.radiusM + d }
        : { shape: 'rectangle', halfWidthM: scope.halfWidthM + d, halfDepthM: scope.halfDepthM + d };
}

/**
 * §FULL-PLATE-READ (L-13123) — how far outside the plate a footprint's CENTRE may sit and still be
 * handed to the clip. 150 m is a whole Barcelona Eixample block (113 m) plus half again; a footprint
 * whose centre is further out than this cannot reach the plate with any geometry this reader has
 * ever seen. Stated as a metre figure rather than a ratio so it does not silently grow with the
 * slider — the risk it covers is a BUILDING'S size, which does not depend on the scope.
 */
export const SCOPE_READ_STRADDLE_SLACK_M = 150;

/**
 * Resolve what the render uses from what the store holds. Total: never throws, never returns a
 * scope outside `range`, never returns "no scope" — "no scope" rendering as "no context" is the
 * §CONTEXT-DATA-HONESTY failure shape, so an un-authored value resolves to the range's fallback.
 */
export function resolveSiteScope(stored: SiteScope | null | undefined, range: SiteScopeRange): ResolvedSiteScope {
    const span = _tracer.startSpan('pryzm.gis.site-scope.resolveSiteScope');
    try {
        const fallback = clampSiteScope(range.fallback, range);
        if (stored == null) return { scope: fallback, source: 'default' };
        const parsed = SiteScopeSchema.safeParse(stored);
        if (!parsed.success) {
            return {
                scope: fallback,
                source: 'invalid',
                note: `stored scope did not parse (${parsed.error.issues[0]?.message ?? 'invalid'}); default used`,
            };
        }
        // `parsed.data` is a fresh object; hand back the CALLER'S reference when it is used
        // verbatim, so a consumer can detect "unchanged" by identity and skip a reload.
        const clamped = clampSiteScope(stored, range);
        if (clamped !== stored) {
            return {
                scope: clamped,
                source: 'clamped',
                clampedFromRadiusM: scopeOuterRadiusM(stored),
                note: `stored scope ${Math.round(scopeOuterRadiusM(stored))} m is outside ` +
                    `${range.minRadiusM}–${range.maxRadiusM} m; clamped to ${Math.round(scopeOuterRadiusM(clamped))} m`,
            };
        }
        return { scope: stored, source: 'authored' };
    } finally {
        span.end();
    }
}

/**
 * Change shape WITHOUT losing anything that was inside: circle → the SQUARE that contains the disc
 * (half-extent = r); rectangle → the DISC whose POLYGON contains the rectangle. Both directions
 * grow the area; neither can drop a feature the user could already see, which is what a shape
 * toggle on a live slab must guarantee. Same reference when the shape already matches.
 *
 * ⚠ The disc's radius is the half-diagonal divided by cos(π/n), NOT the bare half-diagonal. The
 * ONE-POLYGON RULE means a circle IS its inscribed n-gon, and a corner sitting exactly on the
 * circumscribed circle at a non-vertex angle is OUTSIDE that n-gon by up to the sagitta — a corner
 * building would be cut by the very toggle that promised to keep it. n is taken at the
 * half-diagonal; the final radius can only raise n, and a larger n only widens the inscribed circle,
 * so the containment holds for the polygon actually built (pinned by the spec).
 */
export function convertScopeShape(scope: SiteScope, shape: SiteScopeShape): SiteScope {
    if (scope.shape === shape) return scope;
    if (shape === 'rectangle') {
        const r = (scope as { radiusM: number }).radiusM;
        return { shape: 'rectangle', halfWidthM: r, halfDepthM: r };
    }
    const halfDiagonal = scopeOuterRadiusM(scope);
    const n = scopePolygonSegments({ shape: 'circle', radiusM: halfDiagonal });
    return { shape: 'circle', radiusM: halfDiagonal / Math.cos(Math.PI / n) };
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Geometry: the polygon, in the project frame, the true frame, and WGS84
// ─────────────────────────────────────────────────────────────────────────────────────────

/** Bound on how far the n-gon's edge may sag inside the true circle, metres. 0.25 m is invisible at
 *  any 3D-Site zoom and keeps n ≤ 256 up to a 5 km radius. */
export const SCOPE_CIRCLE_MAX_SAGITTA_M = 0.25;
export const SCOPE_CIRCLE_MIN_SEGMENTS = 32;
export const SCOPE_CIRCLE_MAX_SEGMENTS = 256;

/**
 * Vertex count of the scope polygon. A circle's count is derived from the sagitta bound
 * (s = r·(1 − cos(π/n)) ≤ SCOPE_CIRCLE_MAX_SAGITTA_M), rounded UP to a multiple of 4 so the four
 * cardinal points are always vertices, and clamped to [32, 256]. A rectangle has 4.
 */
export function scopePolygonSegments(scope: SiteScope, maxSagittaM: number = SCOPE_CIRCLE_MAX_SAGITTA_M): number {
    if (scope.shape === 'rectangle') return 4;
    const r = scope.radiusM;
    const ratio = 1 - Math.min(1, Math.max(0, maxSagittaM / Math.max(r, 1e-9)));
    const n = Math.ceil(Math.PI / Math.acos(ratio));
    const quad = Math.ceil(n / 4) * 4;
    return Math.min(SCOPE_CIRCLE_MAX_SEGMENTS, Math.max(SCOPE_CIRCLE_MIN_SEGMENTS, quad));
}

/**
 * The scope polygon in the PROJECT frame (scene-XZ, metres, about the site frame origin), as an
 * OPEN ring (no repeated closing vertex), positively wound in XZ (`signedAreaXZ > 0`, the
 * `boundaryProjection.ts` convention). Circle: vertex 0 on +X, counter-clockwise. Rectangle: the
 * four corners starting at (−hw, −hd).
 */
export function scopePolygonXZ(scope: SiteScope, segments: number = scopePolygonSegments(scope)): XZPoint[] {
    if (scope.shape === 'rectangle') {
        const { halfWidthM: hw, halfDepthM: hd } = scope;
        return [{ x: -hw, z: -hd }, { x: hw, z: -hd }, { x: hw, z: hd }, { x: -hw, z: hd }];
    }
    const n = Math.max(3, Math.floor(segments));
    const out: XZPoint[] = new Array(n);
    for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        out[i] = { x: scope.radiusM * Math.cos(t), z: scope.radiusM * Math.sin(t) };
    }
    return out;
}

/** Project-frame XZ → TRUE-north XZ (x = east, z = −north). θ applied exactly once, here. */
export function projectXZToTrueXZ(p: XZPoint, thetaRad: number): XZPoint {
    if (thetaRad === 0) return p;
    const enu = sceneXZToEnu(p.x, p.z, thetaRad);
    return { x: enu.east, z: -enu.north };
}

/** The scope polygon in the TRUE-north XZ frame — the frame OSM / baked context lives in. */
export function scopePolygonTrueXZ(scope: SiteScope, thetaRad: number, segments?: number): XZPoint[] {
    const ring = scopePolygonXZ(scope, segments);
    return thetaRad === 0 ? ring : ring.map((p) => projectXZToTrueXZ(p, thetaRad));
}

/**
 * The scope polygon as WGS84 lat/lon about `origin` (the site frame origin — `resolveSiteFrameOrigin`,
 * never a re-read geocode). This is what `globe.clippingPolygons`, `tileset.clippingPolygons` and
 * the preview ring consume. ONE projection: `sceneXZToLatLon`.
 */
export function scopePolygonLatLon(scope: SiteScope, origin: LatLon, thetaRad: number, segments?: number): LatLon[] {
    const span = _tracer.startSpan('pryzm.gis.site-scope.scopePolygonLatLon');
    try {
        return scopePolygonTrueXZ(scope, thetaRad, segments).map((p) => sceneXZToLatLon(p, origin.lat, origin.lon));
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Containment — THE predicate. One polygon, every layer.
// ─────────────────────────────────────────────────────────────────────────────────────────

export interface ScopeContainment {
    readonly scope: SiteScope;
    readonly thetaRad: number;
    /** The polygon every answer is taken against (TRUE-north XZ when θ ≠ 0 or the caller asked). */
    readonly polygon: readonly XZPoint[];
    /** Axis-aligned bounds of `polygon` in its frame — the cheap reject. */
    readonly bbox: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number };
    /** Is (x, z) — in `polygon`'s frame — inside the scope polygon? */
    contains(x: number, z: number): boolean;
}

/**
 * Build the containment predicate for a scope. `frame` selects which XZ the caller's points are
 * in: `'true'` (default — OSM / baked context after `latLonToSceneXZ`) applies θ to the polygon;
 * `'project'` is for authored scene geometry (the parcel ring, envelopes) and applies no θ.
 *
 * Fast paths are EXACT with respect to the polygon (never a different answer, only a cheaper one):
 *   • bbox reject;
 *   • circle: `r² > R²` ⇒ outside (the n-gon is inscribed in the circle);
 *             `r² ≤ (R·cos(π/n))²` ⇒ inside (the inscribed circle of the n-gon);
 *   • rectangle at θ = 0: the half-extent test IS the polygon test.
 * Everything else is `pointInPolygonXZ` on the polygon.
 */
export function createScopeContainment(
    scope: SiteScope,
    thetaRad: number,
    opts: { readonly frame?: 'true' | 'project'; readonly segments?: number } = {},
): ScopeContainment {
    const theta = opts.frame === 'project' ? 0 : thetaRad;
    const segments = opts.segments ?? scopePolygonSegments(scope);
    const polygon = scopePolygonTrueXZ(scope, theta, segments);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of polygon) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    const bbox = { minX, maxX, minZ, maxZ };

    let contains: (x: number, z: number) => boolean;
    if (scope.shape === 'circle') {
        const R2 = scope.radiusM * scope.radiusM;
        const inner = scope.radiusM * Math.cos(Math.PI / polygon.length);
        const inner2 = inner * inner;
        contains = (x, z) => {
            const d2 = x * x + z * z;
            if (d2 > R2) return false;
            if (d2 <= inner2) return true;
            return pointInPolygonXZ(x, z, polygon);
        };
    } else if (theta === 0) {
        const { halfWidthM: hw, halfDepthM: hd } = scope;
        contains = (x, z) => x >= -hw && x <= hw && z >= -hd && z <= hd;
    } else {
        contains = (x, z) => {
            if (x < minX || x > maxX || z < minZ || z > maxZ) return false;
            return pointInPolygonXZ(x, z, polygon);
        };
    }
    return { scope, thetaRad: theta, polygon, bbox, contains };
}

/** Does the scope (project frame) contain EVERY vertex of an authored scene-XZ ring? For a CONVEX
 *  scope that is exactly "the ring is inside" (a convex set contains the hull of its points). */
export function scopeContainsRingXZ(scope: SiteScope, ring: ReadonlyArray<XZPoint>): boolean {
    if (ring.length === 0) return false;
    const c = createScopeContainment(scope, 0, { frame: 'project' });
    for (const p of ring) if (!c.contains(p.x, p.z)) return false;
    return true;
}

/**
 * The smallest scope of `shape` that contains an authored scene-XZ ring (the parcel) with `marginM`
 * of clearance — the slider's FLOOR: a slab may never be drawn tighter than the plot it exists for.
 * Circle: max vertex distance + margin. Rectangle: max |x| / |z| + margin (project-aligned).
 * `null` for an empty ring.
 */
export function minimumScopeContainingRing(ring: ReadonlyArray<XZPoint>, marginM: number, shape: SiteScopeShape): SiteScope | null {
    if (ring.length === 0) return null;
    if (shape === 'circle') {
        let r = 0;
        for (const p of ring) r = Math.max(r, Math.hypot(p.x, p.z));
        return { shape: 'circle', radiusM: r + marginM };
    }
    let hw = 0, hd = 0;
    for (const p of ring) {
        hw = Math.max(hw, Math.abs(p.x));
        hd = Math.max(hd, Math.abs(p.z));
    }
    return { shape: 'rectangle', halfWidthM: hw + marginM, halfDepthM: hd + marginM };
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Fetch extent — the scope as the ONE source of the loaders' half-degree
// ─────────────────────────────────────────────────────────────────────────────────────────

export interface LatLonBbox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLon: number;
    readonly maxLon: number;
}

/** Metres → degrees of LATITUDE under the `boundaryProjection.ts` equirectangular model. */
export function metresToDegLat(m: number): number {
    return m / (DEG2RAD * EARTH_RADIUS_M);
}
/** Metres → degrees of LONGITUDE at `latDeg` (the parallel is shorter by cos φ). */
export function metresToDegLon(m: number, latDeg: number): number {
    return m / (DEG2RAD * EARTH_RADIUS_M * Math.cos(latDeg * DEG2RAD));
}

/**
 * The WGS84 bbox that CONTAINS the scope — from its circumscribing radius, so a rotated rectangle
 * is covered too. Over-reading is the only honest direction: a box inside the scope has holes.
 */
export function scopeBboxLatLon(scope: SiteScope, origin: LatLon): LatLonBbox {
    const r = scopeOuterRadiusM(scope);
    const dLat = metresToDegLat(r);
    const dLon = metresToDegLon(r, origin.lat);
    return { minLat: origin.lat - dLat, maxLat: origin.lat + dLat, minLon: origin.lon - dLon, maxLon: origin.lon + dLon };
}

/**
 * THE ONE HALF-DEGREE the loaders' `contextBboxAround(lat, lon, halfDeg)` must be given so the box
 * covers the scope: the scope's circumscribing radius in DEGREES OF LATITUDE.
 *
 * ⛔ RETRACTION (2026-09-07, AUDIT-3D-SITE-SCOPE-CROP F-1 — WITHDRAWN). This function first
 * returned the LONGITUDE requirement (`r / (111 320 · cos φ)`) on the claim that
 * `contextBboxAround` applies one number to both axes and therefore reads a disc 25 % short
 * east–west at Barcelona. That claim was made from a grep and is FALSE: `contextBboxAround`
 * (`contextBuildings.ts`, "Widen E/W a touch by latitude") multiplies its longitude half-extent by
 * `1 / cos φ` itself. Feeding it the longitude value would have widened twice — a 1.33× wider read
 * at Barcelona, 2× at Oslo — for a shortfall that did not exist. The latitude value is the honest
 * input; `scopeBboxLatLon` above does its own longitude widening because it builds a box, not an
 * argument to that helper. (Memory `confident-register-rows-are-the-wrong-ones`, again.)
 */
export function scopeFetchHalfDeg(scope: SiteScope): number {
    return metresToDegLat(scopeOuterRadiusM(scope));
}

/** Convenience: a WGS84 point → TRUE-north XZ about `origin` (ONE projection — `latLonToSceneXZ`). */
export function latLonToTrueXZ(p: LatLon, origin: LatLon): XZPoint {
    return latLonToSceneXZ(p, origin.lat, origin.lon);
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// The slab's look — decided here (ADR-0382 D4/D5), consumed by the render path
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * The slab SIDE and FLOOR colour: a NEUTRAL grey, R = G = B ± 3, one step below the building fill.
 * Drawn with `PerInstanceColorAppearance({ flat: true })` — unlit — so this IS the pixel colour at
 * every angle under any light. The retired skirt was a LIT entity wall in the warm ground tan, seen
 * edge-on under the Forma key light: the founder's "red ring". A lit material on the slab side is
 * forbidden by name (C12 §13.6).
 */
export const SITE_SCOPE_SLAB_SIDE_CSS = '#E6E6E3';
/** How far the side wall's top sits ABOVE the terrain sampled along the ring. The globe clip's edge
 *  is exact; the wall is sampled at n points, so between samples the true relief can sit above the
 *  wall's straight top and show the backdrop through a sliver. 0.3 m of lip covers that; it reads
 *  as the slab's rim. */
export const SITE_SCOPE_SLAB_LIP_M = 0.3;
/**
 * ⛔⛔ THE PLATE'S DEPTH IS A FRACTION OF ITS WIDTH, NOT A CONSTANT — §FULL-PLATE-DEPTH (L-13122,
 * founder 2026-09-07: *"WE NEED THE FULL PLATE ON THE 3D SITE — THE FULL CUT SECTION"*).
 *
 * ⚠ THIS CONSTANT USED TO BE THE WHOLE ANSWER: `SITE_SCOPE_SLAB_DEPTH_M = 60`, one number, at every
 * scope. Its doc line said *"a thick block of earth, not a paper cut-out"* — and that sentence was
 * true only at the radius it was written for. THE SLIDER'S RANGE IS 150 m → 7 071 m, a 47× span,
 * and the depth did not move across any of it. Read as the aspect ratio a viewer actually sees —
 * depth ÷ DIAMETER, because that is what shares the screen:
 *
 *   scope radius   diameter   fixed 60 m depth   what it reads as
 *   ───────────────────────────────────────────────────────────────────────────────────────
 *      150 m         300 m        20.0 %         a chunky block  (fine)
 *      900 m       1 800 m         3.3 %         a thin lip
 *    3 020 m       6 040 m         1.0 %         ⛔ A FLAT MAP DECAL — the founder's screenshot
 *    7 071 m      14 142 m         0.42 %        ⛔ invisible; sub-pixel at any framing
 *
 * At the founder's 3 020 m circle the side is ONE PERCENT of the disc. Tilt the camera to 30° and
 * that is a handful of pixels against a 6 km plate on a white ground — which is exactly what he
 * photographed and described as *"no visible slab side or depth… a flat map decal, not a cut
 * section of ground"*. ⭐ THE SIDE WAS BUILT. The build log's `SIDE + FLOOR BUILT` line was TRUE.
 * The primitive was there, correctly coloured, correctly seated — and 1 % tall. A rendering defect
 * whose evidence reads as a success is the worst shape to diagnose, and it is why this is stated
 * here as arithmetic rather than left as a tuned literal.
 *
 * THE RULE: `depth = clamp(k · circumscribing radius, MIN, MAX)`.
 *
 * `k = 0.12` of the RADIUS is 6 % of the DIAMETER, which is the aspect the physical reference this
 * feature is named after holds — a cityweft-style cut block reads as a plate, not a wafer, at
 * roughly one part in twenty of its width. It is a LOOK, deliberately, and it is spelled as one
 * number so it can be moved as one.
 *
 * `MIN = 60` is the old constant, kept EXACTLY, so nothing at or below a 500 m scope moves: the
 * founder has already looked at the small end and did not complain about it, and a lane that fixes
 * the wide end by changing the narrow end has traded one defect for another it cannot see.
 *
 * `MAX = 900` bounds the widest plate at 849 m of earth (7 071 · 0.12), so the cap is a guard, not
 * the operating point — no real scope reaches it. ⛔ It exists because the depth extends the scene's
 * bounding volume DOWNWARD and an unbounded fraction would let a future range raise push the
 * camera's far plane by kilometres for a surface nobody looks at.
 */
export const SITE_SCOPE_SLAB_DEPTH_MIN_M = 60;
/** See `SITE_SCOPE_SLAB_DEPTH_MIN_M`. A guard on the widest plate, never the operating point. */
export const SITE_SCOPE_SLAB_DEPTH_MAX_M = 900;
/** Fraction of the CIRCUMSCRIBING RADIUS the plate is deep — 6 % of its diameter. */
export const SITE_SCOPE_SLAB_DEPTH_PER_RADIUS = 0.12;

/**
 * §FULL-PLATE-DEPTH (L-13122) — how deep the cut plate is AT THIS SCOPE, metres. PURE.
 *
 * ⚠ Reads the CIRCUMSCRIBING radius, which is the same number the slider's track carries and every
 * radial limit in `contextExtentBudget.ts` reduces to — so a rectangle and the circle that
 * circumscribes it are the same thickness, and the shape toggle never changes the plate's depth.
 * A non-finite or non-positive scope yields the MIN rather than a NaN wall (a NaN `minimumHeights`
 * entry makes `WallGeometry` produce nothing at all, silently — the one failure mode that would
 * reproduce the very symptom this exists to fix).
 */
export function siteScopeSlabDepthM(scope: SiteScope): number {
    const r = scopeOuterRadiusM(scope);
    if (!Number.isFinite(r) || r <= 0) return SITE_SCOPE_SLAB_DEPTH_MIN_M;
    const wanted = r * SITE_SCOPE_SLAB_DEPTH_PER_RADIUS;
    return Math.min(SITE_SCOPE_SLAB_DEPTH_MAX_M, Math.max(SITE_SCOPE_SLAB_DEPTH_MIN_M, wanted));
}
/** The slider's live preview ring — the ONE brand accent (#6600FF, `FORMA_PALETTE_V2.parcelAccent`). */
export const SITE_SCOPE_PREVIEW_CSS = '#6600FF';
