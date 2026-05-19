/**
 * PlanSnapEngine — Contract 32 (Universal Snap)
 *
 * Single source of truth for the plan / split-view-plan / elevation / section
 * snap pipeline.  Replaces the inline `SvpSnapService` (which only implemented
 * endpoint / midpoint / perpendicular) and the snap helpers that previously
 * lived inline in `PlanViewInteraction`.
 *
 * Snap families surfaced (priority desc):
 *   210  midpoint (short seg) — wall end-cap centerline = wall-join point
 *                                (§WALL-JOIN-SNAP-2026 — see below)
 *   200  endpoint            — vertices of drawing line segments
 *   190  grid-intersection   — two BIM grid datums crossing
 *   180  intersection        — two drawing segments crossing
 *   160  midpoint            — midpoint of a drawing segment
 *   150  grid-line           — perpendicular foot on a BIM grid datum
 *   140  perpendicular       — perpendicular foot on a drawing segment
 *    40  nearest             — nearest point on any segment (low-prio fallback)
 *
 * §WALL-JOIN-SNAP-2026:
 *   A wall is rendered into the technical drawing as four line segments —
 *   two long sides (face lines) and two short end-caps.  At an L corner, the
 *   end-caps from both walls produce FOUR outline-vertex endpoints clustered
 *   at the corner, all at priority 200.  The user's natural intent when
 *   joining a new wall there is to continue the wall straight — i.e. snap to
 *   the CENTERLINE endpoint, which is geometrically the MIDPOINT of an
 *   end-cap segment.  We detect end-cap midpoints by segment length
 *   (< SHORT_SEG_THRESHOLD_M, i.e. typical wall thickness range) and promote
 *   them to priority 210, above outline endpoints.  Long-segment midpoints
 *   keep the original priority 160 so mid-wall snapping is unchanged.
 *
 * Staleness detection:
 *   The cache invalidates whenever EITHER:
 *     - the cached drawing object reference changes (cache.get returns a new
 *       OBC.TechnicalDrawing), OR
 *     - the drawing's `__cacheVersion` integer increments (in-place updates).
 *   This belt-and-braces strategy fixes the long-standing intermittent-snap
 *   bug where `__cacheVersion` was never incremented by the projection
 *   pipeline, so the cache stayed stale forever after the first build.
 *
 * `prewarmCache()` lets tool overlays warm the cache at activation time so the
 * very first hover (and the very first click) sees fresh snap candidates.
 */

import * as THREE from '@pryzm/renderer-three/three';
import type { PlanViewCanvas } from './PlanViewCanvas';
import { viewTechnicalDrawingCache } from './ViewTechnicalDrawingCache';

// ── Public types ──────────────────────────────────────────────────────────────

export type PlanSnapType =
    | 'endpoint'
    | 'midpoint'
    | 'perpendicular'
    | 'grid-line'
    | 'grid-intersection'
    | 'intersection'
    | 'nearest';

export interface PlanSnapResult {
    worldX: number;
    worldZ: number;
    snapType: PlanSnapType;
    sourceId?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Default snap radius in CSS pixels.  Matches the legacy value used by
 * PlanViewInteraction (15 px, bumped from 12 in Apr 2026 so grid placement
 * reliably picks up nearby datums and intersections).
 */
const DEFAULT_SNAP_RADIUS_PX = 15;

/**
 * §WALL-JOIN-SNAP-2026 — Segments shorter than this (in metres) are treated
 * as wall end-caps, so their midpoint becomes the high-priority "wall-join"
 * snap.  0.6 m comfortably covers all typical wall thicknesses (interior
 * partitions ≈ 0.10 m through exterior masonry ≈ 0.40 m) without catching
 * legitimate short walls (which start at ≈ 0.30 m drawn length and would
 * still be much longer than this in plan).
 */
const SHORT_SEG_THRESHOLD_M = 0.6;

/** Boosted priority for short-segment midpoints (= wall-join points). */
const PRIO_MIDPOINT_SHORT = 210;

const SNAP_PRIORITY: Record<PlanSnapType, number> = {
    'endpoint':          200,
    'grid-intersection': 190,
    'intersection':      180,
    'midpoint':          160,
    'grid-line':         150,
    'perpendicular':     140,
    'nearest':            40,
};

// ── Internal types ────────────────────────────────────────────────────────────

interface SnapCandidate {
    worldX: number;
    worldZ: number;
    snapType: PlanSnapType;
    /** screen-space distance² to the cursor (px²) */
    distSqPx: number;
    sourceId?: string;
    /**
     * §WALL-JOIN-SNAP-2026 — Optional priority override.  When set, this
     * value is used instead of SNAP_PRIORITY[snapType] in the resolver's
     * winner selection.  Used to promote short-segment midpoints (wall
     * end-cap centerlines) above outline endpoints while keeping the
     * snapType label as 'midpoint' for the visualizer.
     */
    priorityOverride?: number;
}

interface EndpointEntry {
    worldX: number;
    worldZ: number;
    snapType: 'endpoint' | 'midpoint';
    /**
     * §WALL-JOIN-SNAP-2026 — For midpoints only: length of the source segment
     * in metres.  Short segments (≤ SHORT_SEG_THRESHOLD_M) are wall end-caps,
     * whose midpoint = the wall's centerline endpoint = the canonical join
     * point for continuing a wall.  Endpoints don't use this field.
     */
    segLenM?: number;
}

interface SegmentEntry {
    ax: number; az: number;
    bx: number; bz: number;
}

interface GridHostLine {
    id: string;
    px: number; pz: number;
    dx: number; dz: number;
}

const _tmpV = new THREE.Vector3();

// ── Engine ────────────────────────────────────────────────────────────────────

export class PlanSnapEngine {
    private _planCanvas: PlanViewCanvas | null = null;
    private _viewId: string | null = null;
    private readonly _radiusPx: number;

    private _endpointCache: EndpointEntry[] = [];
    private _segmentCache:  SegmentEntry[]  = [];

    /**
     * Cached drawing object reference.  When `viewTechnicalDrawingCache.get()`
     * returns a different object instance, the cache is rebuilt — even if
     * `__cacheVersion` is unchanged.  This is the durable invalidation signal.
     */
    private _cacheDrawingRef: object | null = null;
    /** Secondary invalidation: `(drawing as any).__cacheVersion` integer. */
    private _cacheDrawingVersion: number = -1;

    constructor(radiusPx: number = DEFAULT_SNAP_RADIUS_PX) {
        this._radiusPx = radiusPx;
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    attach(planCanvas: PlanViewCanvas, viewId: string): void {
        this._planCanvas = planCanvas;
        this._viewId = viewId;
        this._invalidateCache();
    }

    detach(): void {
        this._planCanvas = null;
        this._viewId = null;
        this._invalidateCache();
    }

    setViewId(viewId: string): void {
        if (this._viewId === viewId) return;
        this._viewId = viewId;
        this._invalidateCache();
    }

    /**
     * External signal that the drawing geometry may have changed.
     * Forces the next `querySnap` (or `prewarmCache`) to rebuild from scratch.
     */
    notifyDrawingChanged(viewId?: string): void {
        if (viewId) this._viewId = viewId;
        this._invalidateCache();
    }

    /**
     * Eagerly build the snap cache without performing a query.
     *
     * Intended for tool overlays to call from `_activateHandler()` — fixes the
     * "first click / first hover misses snap" intermittency where the cache was
     * built lazily on the first `querySnap` and the user's initial gesture
     * landed before that frame.
     *
     * Safe to call repeatedly — cheap when the cache is already current.
     */
    prewarmCache(): void {
        this._ensureCache();
    }

    // ── Snap query ───────────────────────────────────────────────────────────

    querySnap(sx: number, sy: number): PlanSnapResult | null {
        if (!this._planCanvas) return null;
        this._ensureCache();
        return this._queryNearestCandidate(sx, sy);
    }

    // ── Cache management ─────────────────────────────────────────────────────

    private _invalidateCache(): void {
        this._endpointCache = [];
        this._segmentCache  = [];
        this._cacheDrawingRef = null;
        this._cacheDrawingVersion = -1;
    }

    private _ensureCache(): void {
        if (!this._viewId) {
            this._invalidateCache();
            return;
        }
        const drawing = viewTechnicalDrawingCache.get(this._viewId);
        if (!drawing) {
            this._invalidateCache();
            return;
        }

        const version = (drawing as any).__cacheVersion ?? 0;
        // Rebuild if drawing OBJECT identity changed (most reliable signal —
        // the projection pipeline always allocates a new TechnicalDrawing on
        // re-projection) OR if version integer increments (in-place updates).
        const sameDrawing = this._cacheDrawingRef === (drawing as object);
        const sameVersion = version === this._cacheDrawingVersion;
        if (sameDrawing && sameVersion && this._endpointCache.length > 0) return;

        this._cacheDrawingRef = drawing as object;
        this._cacheDrawingVersion = version;

        const entries:  EndpointEntry[] = [];
        const segments: SegmentEntry[]  = [];

        (drawing as any).three?.traverse?.((child: THREE.Object3D) => {
            if (!(child instanceof THREE.LineSegments)) return;
            const posAttr = child.geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
            if (!posAttr || posAttr.count < 2) return;

            child.updateWorldMatrix(true, false);
            const mat = child.matrixWorld;

            for (let i = 0; i < posAttr.count - 1; i += 2) {
                _tmpV.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).applyMatrix4(mat);
                const ax = _tmpV.x, az = _tmpV.z;
                entries.push({ worldX: ax, worldZ: az, snapType: 'endpoint' });

                _tmpV.set(posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1)).applyMatrix4(mat);
                const bx = _tmpV.x, bz = _tmpV.z;
                entries.push({ worldX: bx, worldZ: bz, snapType: 'endpoint' });

                // §WALL-JOIN-SNAP-2026 — Stamp the source segment's length on
                // every midpoint entry so _queryNearestCandidate can promote
                // short-segment midpoints (= wall end-cap centerlines) above
                // outline-vertex endpoints.  Length is computed in world XZ
                // (metres) — the Y component is irrelevant in plan view.
                const _segDx = bx - ax;
                const _segDz = bz - az;
                const _segLenM = Math.sqrt(_segDx * _segDx + _segDz * _segDz);
                entries.push({
                    worldX: (ax + bx) / 2,
                    worldZ: (az + bz) / 2,
                    snapType: 'midpoint',
                    segLenM: _segLenM,
                });
                segments.push({ ax, az, bx, bz });
            }
        });

        this._endpointCache = entries;
        this._segmentCache  = segments;
    }

    // ── Multi-family resolver ────────────────────────────────────────────────

    /**
     * Collects ALL candidates within radiusPx from every snap family
     * (endpoint, midpoint, perpendicular, grid-line, grid-intersection,
     * segment-intersection, nearest) and picks the strongest one by
     * (priority desc, screen-distance asc).
     */
    private _queryNearestCandidate(sx: number, sy: number): PlanSnapResult | null {
        const planCanvas = this._planCanvas;
        if (!planCanvas) return null;

        const radSq = this._radiusPx * this._radiusPx;
        const cursorWorld = planCanvas.screenToWorld(sx, sy);
        if (!cursorWorld) return null;
        const cwX = cursorWorld.worldX;
        const cwZ = cursorWorld.worldZ;

        const candidates: SnapCandidate[] = [];

        const distSqPx = (worldX: number, worldZ: number): number => {
            const { sx: ex, sy: ey } = planCanvas.worldToScreen(worldX, worldZ);
            return (sx - ex) * (sx - ex) + (sy - ey) * (sy - ey);
        };

        // ── 1. Endpoints + midpoints (drawing geometry) ──────────────────────
        for (const e of this._endpointCache) {
            const dSq = distSqPx(e.worldX, e.worldZ);
            if (dSq > radSq) continue;

            // §WALL-JOIN-SNAP-2026 — Boost short-segment midpoints to a
            // priority above outline endpoints.  These midpoints sit on
            // wall end-cap centerlines and represent the canonical
            // wall-join point users expect when continuing a wall.
            const isShortMid = e.snapType === 'midpoint'
                && e.segLenM !== undefined
                && e.segLenM <= SHORT_SEG_THRESHOLD_M;

            candidates.push({
                worldX:   e.worldX,
                worldZ:   e.worldZ,
                snapType: e.snapType,
                distSqPx: dSq,
                ...(isShortMid ? { priorityOverride: PRIO_MIDPOINT_SHORT } : {}),
            });
        }

        // ── 2. Per-segment foot (perpendicular) + nearest fallback ──────────
        const worldRadius = this._estimateWorldRadius(this._radiusPx);
        const worldBuf    = worldRadius * 1.5;
        const nearbySegs: SegmentEntry[] = [];
        for (const seg of this._segmentCache) {
            const minX = Math.min(seg.ax, seg.bx) - worldBuf;
            const maxX = Math.max(seg.ax, seg.bx) + worldBuf;
            const minZ = Math.min(seg.az, seg.bz) - worldBuf;
            const maxZ = Math.max(seg.az, seg.bz) + worldBuf;
            if (cwX < minX || cwX > maxX || cwZ < minZ || cwZ > maxZ) continue;
            nearbySegs.push(seg);
        }

        let bestNearest: SnapCandidate | null = null;
        for (const seg of nearbySegs) {
            const dx = seg.bx - seg.ax;
            const dz = seg.bz - seg.az;
            const lenSq = dx * dx + dz * dz;
            if (lenSq < 1e-8) continue;

            const tRaw = ((cwX - seg.ax) * dx + (cwZ - seg.az) * dz) / lenSq;

            // Perpendicular (interior of segment only — endpoints handled above)
            if (tRaw > 0.02 && tRaw < 0.98) {
                const fx = seg.ax + tRaw * dx;
                const fz = seg.az + tRaw * dz;
                const dSq = distSqPx(fx, fz);
                if (dSq <= radSq) {
                    candidates.push({ worldX: fx, worldZ: fz, snapType: 'perpendicular', distSqPx: dSq });
                }
            }

            // Nearest-on-segment (clamped to [0,1]) — low-priority fallback
            const tClamped = Math.max(0, Math.min(1, tRaw));
            const nx = seg.ax + tClamped * dx;
            const nz = seg.az + tClamped * dz;
            const dSqN = distSqPx(nx, nz);
            if (dSqN <= radSq && (!bestNearest || dSqN < bestNearest.distSqPx)) {
                bestNearest = { worldX: nx, worldZ: nz, snapType: 'nearest', distSqPx: dSqN };
            }
        }
        if (bestNearest) candidates.push(bestNearest);

        // ── 3. Segment × Segment intersections (within snap radius) ──────────
        for (let i = 0; i < nearbySegs.length; i++) {
            for (let j = i + 1; j < nearbySegs.length; j++) {
                const ix = this._intersectSegments(nearbySegs[i], nearbySegs[j]);
                if (!ix) continue;
                const dSq = distSqPx(ix.x, ix.z);
                if (dSq <= radSq) {
                    candidates.push({ worldX: ix.x, worldZ: ix.z, snapType: 'intersection', distSqPx: dSq });
                }
            }
        }

        // ── 4. BIM grid lines + grid intersections ──────────────────────────
        const gridLines = this._collectVisibleGridLines();
        if (gridLines.length > 0) {
            // 4a. Grid-line foot
            for (const gl of gridLines) {
                const t = (cwX - gl.px) * gl.dx + (cwZ - gl.pz) * gl.dz;
                const fx = gl.px + t * gl.dx;
                const fz = gl.pz + t * gl.dz;
                const dSq = distSqPx(fx, fz);
                if (dSq <= radSq) {
                    candidates.push({
                        worldX: fx, worldZ: fz,
                        snapType: 'grid-line', sourceId: gl.id,
                        distSqPx: dSq,
                    });
                }
            }
            // 4b. Grid × grid intersections (infinite-line)
            for (let i = 0; i < gridLines.length; i++) {
                for (let j = i + 1; j < gridLines.length; j++) {
                    const ix = this._intersectInfiniteLines(gridLines[i], gridLines[j]);
                    if (!ix) continue;
                    const dSq = distSqPx(ix.x, ix.z);
                    if (dSq <= radSq) {
                        candidates.push({
                            worldX: ix.x, worldZ: ix.z,
                            snapType: 'grid-intersection',
                            sourceId: `${gridLines[i].id}×${gridLines[j].id}`,
                            distSqPx: dSq,
                        });
                    }
                }
            }
        }

        if (candidates.length === 0) return null;

        // ── 5. Pick winner: highest priority, ties broken by distance ────────
        // §WALL-JOIN-SNAP-2026 — `priorityOverride` (when present) replaces
        // the static SNAP_PRIORITY lookup.  Used by short-segment midpoints
        // to outrank outline endpoints without changing their snapType label.
        const prioOf = (c: SnapCandidate): number =>
            c.priorityOverride ?? SNAP_PRIORITY[c.snapType];

        let best = candidates[0];
        let bestPrio = prioOf(best);
        for (let i = 1; i < candidates.length; i++) {
            const c = candidates[i];
            const p = prioOf(c);
            if (p > bestPrio || (p === bestPrio && c.distSqPx < best.distSqPx)) {
                best = c;
                bestPrio = p;
            }
        }
        return { worldX: best.worldX, worldZ: best.worldZ, snapType: best.snapType, sourceId: best.sourceId };
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private _estimateWorldRadius(radiusPx: number): number {
        if (!this._planCanvas) return radiusPx * 0.05;
        const a = this._planCanvas.screenToWorld(0, 0);
        const b = this._planCanvas.screenToWorld(radiusPx, 0);
        if (!a || !b) return radiusPx * 0.05;
        return Math.hypot(b.worldX - a.worldX, b.worldZ - a.worldZ);
    }

    private _collectVisibleGridLines(): GridHostLine[] {
        const gridStore = window.gridStore; // TODO(TASK-08)
        if (!gridStore?.getAll) return [];
        const grids: any[] = gridStore.getAll() ?? [];
        if (grids.length === 0) return [];

        const out: GridHostLine[] = [];
        for (const g of grids) {
            if (!g || g.isVisible === false) continue;
            const isLinear = g.mode === 'linear'
                && Number.isFinite(g.startX) && Number.isFinite(g.startZ)
                && Number.isFinite(g.endX)   && Number.isFinite(g.endZ);
            if (isLinear) {
                const dx = g.endX - g.startX, dz = g.endZ - g.startZ;
                const len = Math.hypot(dx, dz);
                if (len < 1e-9) continue;
                out.push({ id: g.id, px: g.startX, pz: g.startZ, dx: dx / len, dz: dz / len });
            } else if (g.axis === 'X') {
                out.push({ id: g.id, px: g.position, pz: 0, dx: 0, dz: 1 });
            } else {
                out.push({ id: g.id, px: 0, pz: g.position, dx: 1, dz: 0 });
            }
        }
        return out;
    }

    private _intersectInfiniteLines(a: GridHostLine, b: GridHostLine): { x: number; z: number } | null {
        const cross = a.dx * b.dz - a.dz * b.dx;
        if (Math.abs(cross) < 1e-9) return null;
        const rx = b.px - a.px;
        const rz = b.pz - a.pz;
        const t = (rx * b.dz - rz * b.dx) / cross;
        return { x: a.px + t * a.dx, z: a.pz + t * a.dz };
    }

    private _intersectSegments(s1: SegmentEntry, s2: SegmentEntry): { x: number; z: number } | null {
        const r_dx = s1.bx - s1.ax, r_dz = s1.bz - s1.az;
        const s_dx = s2.bx - s2.ax, s_dz = s2.bz - s2.az;
        const denom = r_dx * s_dz - r_dz * s_dx;
        if (Math.abs(denom) < 1e-9) return null;
        const qpx = s2.ax - s1.ax, qpz = s2.az - s1.az;
        const t = (qpx * s_dz - qpz * s_dx) / denom;
        const u = (qpx * r_dz - qpz * r_dx) / denom;
        if (t < -0.001 || t > 1.001 || u < -0.001 || u > 1.001) return null;
        return { x: s1.ax + t * r_dx, z: s1.az + t * r_dz };
    }
}
