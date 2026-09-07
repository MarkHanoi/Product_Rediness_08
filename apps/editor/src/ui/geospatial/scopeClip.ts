// scopeClip.ts — §SITE-SCOPE (L-645; C12 §13.3; ADR-0382) — the GEOMETRIC pre-clip: cut every
// context feature to the scope BEFORE it is built, so nothing outside the slab is ever constructed.
//
// WHY GEOMETRY AND NOT A GPU CLIP. Measured against the shipped Cesium 1.143.0
// (`node_modules/cesium/Build/CesiumUnminified/index.js`): `clippingPolygons` is owned by exactly
// three classes — `Globe` (:214816), `Cesium3DTileset` (:152219) and `Model` (:123472) — and
// `clippingPlanes` by those plus `ModelGraphics`, `VoxelPrimitive`, `TimeDynamicPointCloud`.
// NOT `Primitive`, NOT `GroundPrimitive`, NOT an entity `polygon` / `corridor` / `wall`. Every
// ground layer on the 3D-Site (land-use ~8 km, sea ~11 km, parks, roads, rails, waterways) is a
// `viewer.entities.add` polygon/corridor at absolute height, and the far tier / trees / street life
// are `Cesium.Primitive` batches — so there is NO clip parameter anywhere in the API that can touch
// them. That is the root cause the retired §CTX-EARTH-SLAB named and did not act on. The only
// mechanism that cuts an entity or a primitive is to cut its INPUT: polygon ∩ scope, polyline ∩
// scope, instance-centre ∈ scope. This module is that cut, pure and tested.
//
// THE THREE OPERATIONS, ONE FRAME. Features arrive as WGS84 `[lon, lat]` rings/lines (the tile
// readers' convention). They are projected into TRUE-north XZ about the site frame origin with the
// ONE projection (`latLonToSceneXZ`), clipped against the scope polygon in that frame (θ applied to
// the scope, not to the feature — `siteScope.ts`), and the kept geometry is projected back with the
// exact inverse (`sceneXZToLatLon`). A feature wholly inside is returned AS THE SAME REFERENCE —
// no projection, no copy, no drift. Only a feature that STRADDLES the edge is re-projected, and the
// spec pins that round trip under one centimetre.
//
//   • RINGS (land-use, parks, water areas, sea, building footprints — near, demoted and far tier):
//     `intersectPolygons2D` from `@pryzm/geometry-kernel` (§C73-POLY-BOOLEAN — the oracle-pinned
//     concave∩concave boolean `massingShapeOptions.ts` already uses). A straddling ring is CUT,
//     never dropped; a building on the edge becomes the clean vertical section the founder's
//     reference shows, extruded to its own height by the caller.
//   • POLYLINES (roads, rails, waterway centre-lines — the corridor layers): each segment is split
//     at its crossings with the scope polygon (`intersectSegments2D`, the kernel's canonical
//     segment/segment body) and the sub-segments whose midpoints lie inside are chained back into
//     pieces. A road that leaves and re-enters becomes two pieces.
//   • POINTS (trees, canopies, lamps, people, furniture): centre-in-scope. Dropped ones are COUNTED.
//
// HONESTY (C12 §13.5 / C57 §1.5). A ring the boolean REFUSES (self-intersecting OSM input — the
// kernel does not repair, and `contextRingGeometry.ts` documents that such rings exist) is KEPT
// WHOLE and reported as `refused`, never silently dropped: an overshoot past the slab edge is
// visible and honest, a missing building inside it is neither. Every result carries a verdict so
// the loader's console line can print inside / cut / outside / refused counts per layer.
//
// P8: the exported per-feature operations carry a span each; the tally is a plain accumulator.

import { trace } from '@opentelemetry/api';
import { intersectPolygons2D, intersectSegments2D, type Pt2 } from '@pryzm/geometry-kernel';
import { sceneXZToLatLon, type LatLon, type XZPoint } from '../site/boundaryProjection';
import {
    createScopeContainment,
    latLonToTrueXZ,
    scopeAreaM2,
    scopeOuterRadiusM,
    scopePolygonLatLon,
    type ScopeContainment,
    type SiteScope,
} from './siteScope';

const _tracer = trace.getTracer('pryzm.gis.site-scope');

/** `[lon, lat]` — the tile readers' vertex convention (`contextLanduseSeaClip.ts` `LonLat`). */
export type LonLat = readonly [lon: number, lat: number];

export type ScopeClipVerdict =
    /** Every vertex inside — returned as the SAME reference, untouched. */
    | 'inside'
    /** Nothing inside — the caller builds nothing. */
    | 'outside'
    /** Straddles the edge — the returned geometry is the kept part(s), re-projected once. */
    | 'cut'
    /** The boolean refused (self-intersecting / degenerate input). Kept WHOLE, flagged. */
    | 'refused';

export interface RingClipResult {
    readonly verdict: ScopeClipVerdict;
    /** OPEN rings (no repeated closing vertex). `inside`/`refused` ⇒ `[ring]` (same reference);
     *  `outside` ⇒ `[]`; `cut` ⇒ one loop per kept region (a U-shape can become two). */
    readonly rings: ReadonlyArray<ReadonlyArray<LonLat>>;
    readonly refusal?: string;
}

export interface PolylineClipResult {
    readonly verdict: Exclude<ScopeClipVerdict, 'refused'>;
    /** `inside` ⇒ `[points]` (same reference); `outside` ⇒ `[]`; `cut` ⇒ the kept pieces in order. */
    readonly pieces: ReadonlyArray<ReadonlyArray<LonLat>>;
}

export interface PointFilterResult<T> {
    readonly kept: T[];
    readonly dropped: number;
}

export interface ScopeClipper {
    readonly scope: SiteScope;
    readonly origin: LatLon;
    readonly thetaRad: number;
    readonly containment: ScopeContainment;
    /** The scope polygon in WGS84 — what the globe / tileset clip and the preview ring consume. */
    readonly polygonLatLon: ReadonlyArray<LatLon>;
    /** As `[lon, lat]`, for callers that speak the tile convention. */
    readonly polygonLonLat: ReadonlyArray<LonLat>;
    containsLonLat(p: LonLat): boolean;
    clipRingLonLat(ring: ReadonlyArray<LonLat>): RingClipResult;
    clipPolylineLonLat(points: ReadonlyArray<LonLat>): PolylineClipResult;
    filterPointsLonLat<T>(points: ReadonlyArray<T>, at: (t: T) => LonLat): PointFilterResult<T>;
}

/** Sub-interval parameters closer than this (in [0,1] along a segment) are the same crossing. */
const T_EPS = 1e-9;

/**
 * Build the clipper for one scope about one origin. `thetaRad` is the site's project→true north
 * (`SiteLocation.trueNorth`), applied once to the scope polygon. Cheap; rebuild it when the scope,
 * the origin or θ changes — never per feature.
 */
export function createScopeClipper(scope: SiteScope, origin: LatLon, thetaRad: number): ScopeClipper {
    const span = _tracer.startSpan('pryzm.gis.site-scope.createScopeClipper');
    try {
        const containment = createScopeContainment(scope, thetaRad, { frame: 'true' });
        const polygon = containment.polygon;
        const polygonLatLon = scopePolygonLatLon(scope, origin, thetaRad, polygon.length);
        const polygonLonLat: LonLat[] = polygonLatLon.map((p) => [p.lon, p.lat] as const);
        const toXZ = (p: LonLat): XZPoint => latLonToTrueXZ({ lat: p[1], lon: p[0] }, origin);
        const toLonLat = (p: XZPoint): LonLat => {
            const ll = sceneXZToLatLon(p, origin.lat, origin.lon);
            return [ll.lon, ll.lat] as const;
        };
        const containsXZ = (p: XZPoint): boolean => containment.contains(p.x, p.z);

        const clipper: ScopeClipper = {
            scope,
            origin,
            thetaRad,
            containment,
            polygonLatLon,
            polygonLonLat,
            containsLonLat: (p) => containsXZ(toXZ(p)),
            clipRingLonLat: (ring) => clipRingXZ(ring, toXZ, toLonLat, containment),
            clipPolylineLonLat: (points) => clipPolylineXZ(points, toXZ, toLonLat, containment),
            filterPointsLonLat: (points, at) => {
                const kept: typeof points[number][] = [];
                let dropped = 0;
                for (const t of points) {
                    if (containsXZ(toXZ(at(t)))) kept.push(t);
                    else dropped++;
                }
                return { kept, dropped };
            },
        };
        return clipper;
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Rings
// ─────────────────────────────────────────────────────────────────────────────────────────

function clipRingXZ(
    ring: ReadonlyArray<LonLat>,
    toXZ: (p: LonLat) => XZPoint,
    toLonLat: (p: XZPoint) => LonLat,
    c: ScopeContainment,
): RingClipResult {
    const span = _tracer.startSpan('pryzm.gis.site-scope.clipRing');
    try {
        // Drop a repeated closing vertex: the boolean wants open rings and a closed one would put a
        // zero-length edge into its arrangement.
        let n = ring.length;
        if (n >= 2) {
            const a = ring[0]!, b = ring[n - 1]!;
            if (a[0] === b[0] && a[1] === b[1]) n--;
        }
        if (n < 3) return { verdict: 'outside', rings: [] };

        const xz: XZPoint[] = new Array(n);
        let allInside = true;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < n; i++) {
            const p = toXZ(ring[i]!);
            xz[i] = p;
            if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) {
                return { verdict: 'refused', rings: [ring], refusal: 'non-finite vertex' };
            }
            if (allInside && !c.contains(p.x, p.z)) allInside = false;
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
        }
        // A convex scope contains the hull of any point set it contains every vertex of.
        if (allInside) return { verdict: 'inside', rings: [ring] };
        // Bounding boxes disjoint ⇒ no overlap, and no enclosure either (a ring enclosing the scope
        // has a bbox enclosing the scope's).
        if (maxX < c.bbox.minX || minX > c.bbox.maxX || maxZ < c.bbox.minZ || minZ > c.bbox.maxZ) {
            return { verdict: 'outside', rings: [] };
        }

        const subject: Pt2[] = xz.map((p) => [p.x, p.z]);
        const clip: Pt2[] = c.polygon.map((p) => [p.x, p.z]);
        const res = intersectPolygons2D(subject, clip);
        if (!res.ok) {
            return { verdict: 'refused', rings: [ring], refusal: res.detail ? `${res.reason}: ${res.detail}` : res.reason };
        }
        // An intersection of two hole-free rings has only positive loops (kernel contract); keep
        // any loop with a real area, which also drops a sliver the model calls "the same place".
        const kept: LonLat[][] = [];
        for (const loop of res.loops) {
            if (loop.length < 3) continue;
            let a = 0;
            for (let i = 0; i < loop.length; i++) {
                const p = loop[i]!, q = loop[(i + 1) % loop.length]!;
                a += p[0] * q[1] - q[0] * p[1];
            }
            if (Math.abs(a / 2) <= 1e-6) continue;
            kept.push(loop.map(([x, z]) => toLonLat({ x, z })));
        }
        if (kept.length === 0) return { verdict: 'outside', rings: [] };
        return { verdict: 'cut', rings: kept };
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Polylines
// ─────────────────────────────────────────────────────────────────────────────────────────

function clipPolylineXZ(
    points: ReadonlyArray<LonLat>,
    toXZ: (p: LonLat) => XZPoint,
    toLonLat: (p: XZPoint) => LonLat,
    c: ScopeContainment,
): PolylineClipResult {
    const span = _tracer.startSpan('pryzm.gis.site-scope.clipPolyline');
    try {
        const n = points.length;
        if (n === 0) return { verdict: 'outside', pieces: [] };
        const xz: XZPoint[] = new Array(n);
        const inside: boolean[] = new Array(n);
        let allInside = true;
        for (let i = 0; i < n; i++) {
            const p = toXZ(points[i]!);
            xz[i] = p;
            inside[i] = Number.isFinite(p.x) && Number.isFinite(p.z) && c.contains(p.x, p.z);
            if (!inside[i]) allInside = false;
        }
        if (allInside) return { verdict: 'inside', pieces: [points] };
        if (n === 1) return { verdict: 'outside', pieces: [] };

        const poly = c.polygon;
        const m = poly.length;
        const pieces: LonLat[][] = [];
        let current: LonLat[] | null = null;
        let currentEndXZ: XZPoint | null = null;

        const push = (a: XZPoint, b: XZPoint, aLonLat: LonLat | null, bLonLat: LonLat | null): void => {
            // Extend the open piece when this sub-segment starts where it ended; else open a new one.
            const contiguous = current !== null && currentEndXZ !== null
                && Math.abs(currentEndXZ.x - a.x) < 1e-9 && Math.abs(currentEndXZ.z - a.z) < 1e-9;
            if (!contiguous) {
                current = [aLonLat ?? toLonLat(a)];
                pieces.push(current);
            }
            current!.push(bLonLat ?? toLonLat(b));
            currentEndXZ = b;
        };

        for (let i = 0; i < n - 1; i++) {
            const a = xz[i]!, b = xz[i + 1]!;
            if (!Number.isFinite(a.x) || !Number.isFinite(a.z) || !Number.isFinite(b.x) || !Number.isFinite(b.z)) {
                current = null;
                currentEndXZ = null;
                continue;
            }
            if (inside[i] && inside[i + 1]) {
                // Both ends inside a CONVEX scope ⇒ the whole segment is inside. Original vertices.
                push(a, b, points[i]!, points[i + 1]!);
                continue;
            }
            // Split at every crossing with the scope boundary, classify sub-intervals by midpoint.
            const ts: number[] = [0, 1];
            for (let k = 0; k < m; k++) {
                const e = poly[k]!, f = poly[(k + 1) % m]!;
                const hit = intersectSegments2D(a.x, a.z, b.x, b.z, e.x, e.z, f.x, f.z);
                if (hit !== null) ts.push(hit.t);
            }
            ts.sort((p, q) => p - q);
            let prev = -1;
            for (let k = 0; k < ts.length; k++) {
                const t = ts[k]!;
                if (prev >= 0 && t - prev > T_EPS) {
                    const mid = (prev + t) / 2;
                    const mx = a.x + (b.x - a.x) * mid, mz = a.z + (b.z - a.z) * mid;
                    if (c.contains(mx, mz)) {
                        const pa = prev === 0 ? a : { x: a.x + (b.x - a.x) * prev, z: a.z + (b.z - a.z) * prev };
                        const pb = t === 1 ? b : { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
                        push(pa, pb, prev === 0 ? points[i]! : null, t === 1 ? points[i + 1]! : null);
                    } else {
                        // Leaving the scope: whatever piece was open is closed.
                        current = null;
                        currentEndXZ = null;
                    }
                }
                if (prev < 0 || t - prev > T_EPS) prev = t;
            }
        }
        if (pieces.length === 0) return { verdict: 'outside', pieces: [] };
        return { verdict: 'cut', pieces };
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Tally — the per-layer honesty line
// ─────────────────────────────────────────────────────────────────────────────────────────

export interface ScopeClipTally {
    add(layer: string, verdict: ScopeClipVerdict, count?: number): void;
    addDropped(layer: string, dropped: number, kept: number): void;
    /** One line per layer: `landuse: 12 inside · 7 cut · 41 outside · 1 refused (kept whole)`. */
    lines(): string[];
    counts(layer: string): Readonly<Record<ScopeClipVerdict, number>>;
}

export function createScopeClipTally(): ScopeClipTally {
    const map = new Map<string, Record<ScopeClipVerdict, number>>();
    const row = (layer: string): Record<ScopeClipVerdict, number> => {
        let r = map.get(layer);
        if (!r) {
            r = { inside: 0, outside: 0, cut: 0, refused: 0 };
            map.set(layer, r);
        }
        return r;
    };
    return {
        add: (layer, verdict, count = 1) => { row(layer)[verdict] += count; },
        addDropped: (layer, dropped, kept) => {
            const r = row(layer);
            r.inside += kept;
            r.outside += dropped;
        },
        counts: (layer) => ({ ...row(layer) }),
        lines: () => {
            const out: string[] = [];
            for (const [layer, r] of map) {
                out.push(
                    `${layer}: ${r.inside} inside · ${r.cut} cut · ${r.outside} outside` +
                        (r.refused > 0 ? ` · ${r.refused} refused (kept whole)` : ''),
                );
            }
            return out;
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// Caps inside the scope — "within the scope should be sound — really detailed and completed"
// ─────────────────────────────────────────────────────────────────────────────────────────

export interface CapVerdict {
    readonly layer: string;
    /** Features eligible INSIDE the scope (after the clip), before any cap. */
    readonly eligible: number;
    readonly cap: number;
    /** `eligible − cap` when positive — what the cap would silently thin. */
    readonly dropped: number;
    /** `true` when the cap does not bite: every eligible feature inside the scope is drawn. */
    readonly complete: boolean;
    /** At the SAME density, the circumscribing radius at which this cap would hold. Estimate
     *  (uniform density assumed); the product re-measures after any change. `null` when complete. */
    readonly completeRadiusM: number | null;
    /** The sentence the product prints (C12 §13.5): numbers, never a bare "some were dropped". */
    readonly line: string;
}

/**
 * Decide whether a per-layer cap is honoured inside the scope, and if not, say by how much and
 * at what scope it would be. Caps on MAPPED layers (buildings, trees, mapped lamps) are
 * completeness facts; caps on SYNTHESISED layers (people, synthetic lamps, canopy fill) are density
 * parameters — the caller labels the layer accordingly; this function only does the arithmetic.
 */
export function capVerdict(layer: string, eligibleInside: number, cap: number, scope: SiteScope): CapVerdict {
    const eligible = Math.max(0, Math.floor(eligibleInside));
    const dropped = Math.max(0, eligible - cap);
    const complete = dropped === 0;
    let completeRadiusM: number | null = null;
    if (!complete && eligible > 0) {
        // density = eligible / area; the cap holds when area' = cap / density, i.e. every linear
        // dimension scales by sqrt(cap / eligible).
        const k = Math.sqrt(cap / eligible);
        completeRadiusM = scopeOuterRadiusM(scope) * k;
    }
    const line = complete
        ? `${layer}: ${eligible} of ${eligible} inside the scope drawn (cap ${cap} not reached)`
        : `${layer}: ${cap} of ${eligible} inside the scope drawn — ${dropped} dropped by the cap; ` +
          `complete at a scope of ~${Math.round(completeRadiusM!)} m (density ` +
          `${(eligible / Math.max(1, scopeAreaM2(scope)) * 1e6).toFixed(0)} / km²)`;
    return { layer, eligible, cap, dropped, complete, completeRadiusM, line };
}

/** Where the slider's "complete" mark sits, and WHY it sits there. */
export interface ScopeCompleteMark {
    readonly radiusM: number;
    /** The layer whose cap decides it, or the label of the read ceiling. */
    readonly boundBy: string;
    /**
     * `cap`  — a per-layer RENDER cap bites first: past the mark the rim is THINNED.
     * `read` — the z16 READ ceiling bites first: past the mark the tile read steps to a coarser
     *          zoom and the bake has already DELETED features, so the rim is not thinned, it is
     *          MISSING — a different fact, and a worse one (see `readCompleteCeilingM` below).
     * `none` — nothing bites at the measured scope; the mark is a lower bound, not a maximum.
     */
    readonly kind: 'cap' | 'read' | 'none';
}

/** The label the `read` arm reports itself under. One string, so a caption and a tooltip agree. */
export const SCOPE_READ_CEILING_LABEL = 'the zoom-16 building + canopy read';

/**
 * The largest circumscribing radius at which the scope is COMPLETE — the slider's "complete" mark.
 * `null` when nothing is known. Each `layers` entry is a MAPPED layer's (eligible inside the
 * measured scope, cap); the measured scope is the one the counts were taken in.
 *
 * ⭐ TWO DIFFERENT CEILINGS, AND COLLAPSING THEM WOULD HIDE THE WORSE ONE (added 2026-09-07, lane
 * SCOPE-CUT, for the founder's "4x the area" ask).
 *
 *   · a RENDER CAP is a density fact measured at run time: past it the nearest-first sort keeps the
 *     nearest N and the rim THINS. Every one of these is knowable only after a load.
 *
 *   · the READ ceiling (`readCompleteCeilingM`) is a DATA fact, knowable before any load and true
 *     of every city: past it `zoomForExtent` steps the buildings/canopy read below z16, and the
 *     bake runs `tippecanoe --drop-densest-as-needed`, which does not COARSEN a dense core — it
 *     DELETES features from it. So a wider scope returns FEWER buildings than a narrower one. That
 *     is L-579 ("a lot of buildings are not coming through anymore") arriving through a zoom step,
 *     and it is exactly what the founder's "within the scope should be sound — really detailed and
 *     completed" forbids.
 *
 * The read ceiling therefore wins the mark whenever it is the tighter of the two, AND it is
 * reported even when no density has been measured yet — a caption that says "not measured" while a
 * known data ceiling is already breached is the §CONTEXT-DATA-HONESTY failure in its politest form.
 */
export function completeScopeRadiusM(
    measured: SiteScope,
    layers: ReadonlyArray<{ readonly layer: string; readonly eligible: number; readonly cap: number }>,
    readCompleteCeilingM?: number | null,
): ScopeCompleteMark | null {
    let best: { radiusM: number; boundBy: string } | null = null;
    const outer = scopeOuterRadiusM(measured);
    for (const l of layers) {
        if (l.eligible <= 0) continue;
        const r = l.eligible <= l.cap ? Infinity : outer * Math.sqrt(l.cap / l.eligible);
        if (best === null || r < best.radiusM) best = { radiusM: r, boundBy: l.layer };
    }
    const capMark: ScopeCompleteMark | null =
        best === null
            ? null
            : Number.isFinite(best.radiusM)
              ? { radiusM: best.radiusM, boundBy: best.boundBy, kind: 'cap' }
              : { radiusM: outer, boundBy: 'none (every cap holds at the measured scope)', kind: 'none' };

    const ceiling =
        typeof readCompleteCeilingM === 'number' && Number.isFinite(readCompleteCeilingM) && readCompleteCeilingM > 0
            ? readCompleteCeilingM
            : null;
    if (ceiling === null) return capMark;
    if (capMark === null || ceiling < capMark.radiusM) {
        return { radiusM: ceiling, boundBy: SCOPE_READ_CEILING_LABEL, kind: 'read' };
    }
    return capMark;
}
