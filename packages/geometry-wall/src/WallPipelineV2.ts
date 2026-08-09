// WallPipelineV2 — ADR-0055 P3b integration shim.
//
// Composes the three new modules into one cohesive API that `WallFragmentBuilder`
// (and anything else that wants the Pascal-style wall geometry) can call without
// having to wire P1 → P2 → P3a by hand:
//
//   P1  JunctionResolverV2.resolveJunctions(walls)        — per-level, ring-sweep miters
//   P2  WallFootprint2D.buildWallFootprint(wall, miter)   — per-wall, 4/5/6-vert polygon
//   P3a WallPolygonExtruder.buildWallExtrusion(fp, opts)  — per-wall, BufferGeometry
//
// The shim adds two things on top:
//
//   • `WallPipelineV2Cache` — a per-level cache for the miters (P1 is a global solve;
//      every wall on the level needs the same result, computed once per rebuild).
//   • `isWallPipelineV2Enabled()` — a feature flag (`globalThis.__pryzmWallPipelineV2`)
//     so the new pipeline can be opted into per session via DevTools without forking
//     the build. Defaults to OFF; flipping it ON routes the eligible call sites in
//     `WallFragmentBuilder` through the new pipeline.
//
// Pure module (THREE only via the extruder). Nothing here writes to a store or
// emits an event — that's the caller's job.

import * as THREE from '@pryzm/renderer-three/three';
import { resolveJunctions, type Pt2, type WallInput, type WallMiter } from './JunctionResolverV2';
import { buildWallFootprint, type WallFootprint } from './WallFootprint2D';
import { buildWallExtrusion, type ExtrudeOpts } from './WallPolygonExtruder';
import { rakeTopOffset } from './WallRake';

// ─── Feature flag ─────────────────────────────────────────────────────────────

/**
 * Pascal-style wall pipeline switch. **DEFAULT ON (restored 2026-06-19 — founder).**
 * History: ON since 2026-05-27 (the "wall issue solved!!!!" state, with the
 * §V2-SPIKE-GUARD falling spiking walls back to legacy). Briefly flipped OFF
 * (22ad6a87) to chase a "mitre-flat-after-pipeline" report — but running EVERY
 * wall through the legacy `MiterPrismBuilder` made the 3-WALL (T/X) JOINS WORSE:
 * legacy over-extends at complex junctions into degenerate dark slivers (founder:
 * "black shapes appearing in joins, often 3 wall joins, got worse"). V2 builds
 * edge-coincident corners BY CONSTRUCTION, so it doesn't spike at those joins;
 * the §V2-SPIKE-GUARD still covers the rare tilted-plate footprint degeneracy by
 * falling that single wall back to legacy. So default-ON is the lesser evil and
 * the founder-confirmed-good baseline. Set `window.__pryzmWallPipelineV2 = false`
 * to force the all-legacy path. Reads `globalThis` (browser + Node for tests).
 */
export function isWallPipelineV2Enabled(): boolean {
    return (globalThis as { __pryzmWallPipelineV2?: boolean }).__pryzmWallPipelineV2 !== false;
}

// ─── Per-level miter cache ────────────────────────────────────────────────────

/** Minimal wall record the cache needs — pluck from the live WallData at the call site. */
export interface LevelWallSpec {
    readonly id: string;
    readonly startXZ: Pt2;
    readonly endXZ:   Pt2;
    readonly thickness: number;
    /** §FIX-WALL-V2-EXISTING-CORNER-IMMUTABLE (L-130) — the wall's WallSystemType id, threaded
     *  into `WallInput.systemTypeId` so `JunctionResolverV2` can freeze an existing same-type
     *  L-corner when a DIFFERENT-type wall joins it. Optional: absent ⇒ the guard is a no-op. */
    readonly systemTypeId?: string;
    /**
     * §FIX-WALL-ARC-LINEAR-MITRE (founder 2026-08-06) — the wall's quadratic-Bézier control
     * point in plan XZ (`WallData.curve.control`), when the wall is CURVED. Absent ⇒ straight.
     *
     * The shim (not the resolver) owns the shape→heading conversion, so `JunctionResolverV2`
     * stays pure and shape-agnostic: it is handed unit HEADINGS, which is all a mitre ever
     * needed. Quadratic-Bézier tangents: ∝ (control − start) at t=0, ∝ (end − control) at t=1.
     * The legacy `WallJoinResolver._wallDirAtJoin` uses the identical formula, so the two
     * pipelines now agree on the cut plane at an arc↔straight corner instead of one cutting
     * on the tangent and the other square-capping on the chord (the founder's wedge).
     */
    readonly curveControlXZ?: Pt2;
    /**
     * §WALL-RAKE — the wall's lean from the floor plane in degrees (`WallData.rakeAngleDeg`).
     * Absent or 90 ⇒ VERTICAL, and the whole pipeline behaves exactly as before.
     *
     * Deliberately NOT forwarded to `JunctionResolverV2`. The resolver mitres the BASE
     * footprint, and under this rake model the base footprint is identical whatever the
     * angle — so the resolver has nothing to learn and stays pure and shape-agnostic,
     * exactly as §FIX-WALL-ARC-LINEAR-MITRE left it. That is also the honest limit of
     * this foundation: the mitre is exact AT THE FLOOR and only there, which is why a
     * rake is refused on walls that would expose the discrepancy.
     */
    readonly rakeAngleDeg?: number;
}

/**
 * §FIX-WALL-ARC-LINEAR-MITRE — derive the per-endpoint forward tangents for a `LevelWallSpec`.
 * Returns `{}` for a straight wall (no control point) or a degenerate control point, so
 * `JunctionResolverV2` falls back to the chord exactly as before.
 */
function curveTangents(w: LevelWallSpec): { startDir?: Pt2; endDir?: Pt2 } {
    const c = w.curveControlXZ;
    if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.z)) return {};
    const s = { x: c.x - w.startXZ.x, z: c.z - w.startXZ.z };   // tangent at t = 0
    const e = { x: w.endXZ.x - c.x,   z: w.endXZ.z - c.z   };   // tangent at t = 1
    const sl = Math.hypot(s.x, s.z);
    const el = Math.hypot(e.x, e.z);
    if (!(sl > 1e-9) || !(el > 1e-9)) return {};                // control ≡ an endpoint → straight
    return {
        startDir: { x: s.x / sl, z: s.z / sl },
        endDir:   { x: e.x / el, z: e.z / el },
    };
}

/**
 * Lazily-recomputed cache of `WallMiter` for every wall on one level.
 *
 * Caller pattern in the builder:
 *
 *   const cache = new WallPipelineV2Cache();
 *   cache.refresh(allWallsOnLevel);   // ← once per level rebuild
 *   for (const wall of walls) {
 *       const miter = cache.getMiter(wall.id);
 *       // ... build wall geometry from miter
 *   }
 *
 * `refresh()` is idempotent + cheap (O(n) over walls and O(k log k) over junctions
 * per `JunctionResolverV2`). A fresh `WallPipelineV2Cache` per level rebuild is fine —
 * sharing one across rebuilds risks consuming a stale miter when a wall moves.
 */
export class WallPipelineV2Cache {
    private _byId = new Map<string, WallMiter>();
    private _walls = new Map<string, WallInput>();

    refresh(walls: readonly LevelWallSpec[]): void {
        this._byId.clear();
        this._walls.clear();
        if (walls.length === 0) return;
        const inputs: WallInput[] = walls.map(w => ({
            id: w.id,
            start: w.startXZ,
            end:   w.endXZ,
            thickness: w.thickness,
            systemTypeId: w.systemTypeId,
            // §FIX-WALL-ARC-LINEAR-MITRE — hand the resolver the arc's true heading at each end.
            ...curveTangents(w),
        }));
        for (const w of inputs) this._walls.set(w.id, w);
        for (const m of resolveJunctions(inputs)) this._byId.set(m.id, m);
    }

    getMiter(wallId: string): WallMiter | null {
        return this._byId.get(wallId) ?? null;
    }

    getWall(wallId: string): WallInput | null {
        return this._walls.get(wallId) ?? null;
    }

    /** Diagnostic: how many junctions did the resolver find (sum of all wall ends-at-junction). */
    get junctionEnds(): number {
        let n = 0;
        for (const m of this._byId.values()) {
            if (m.startLeft || m.startRight || m.startPivot) n++;
            if (m.endLeft   || m.endRight   || m.endPivot  ) n++;
        }
        return n;
    }
}

// ─── One-shot geometry build ──────────────────────────────────────────────────

/** Compose the three modules end-to-end for one wall. Returns a BufferGeometry
 *  ready to drop into a `THREE.Mesh`. The caller owns the material. */
export function buildWallV2Geometry(
    wall: LevelWallSpec,
    cache: WallPipelineV2Cache,
    opts: ExtrudeOpts,
): { geometry: THREE.BufferGeometry; footprint: WallFootprint; miter: WallMiter | null } {
    const input: WallInput = {
        id: wall.id, start: wall.startXZ, end: wall.endXZ,
        thickness: wall.thickness, systemTypeId: wall.systemTypeId,
        ...curveTangents(wall),   // §FIX-WALL-ARC-LINEAR-MITRE
    };
    const miter = cache.getMiter(wall.id);
    const footprint = buildWallFootprint(input, miter);
    // §WALL-RAKE — derive the top-polygon shear from the wall's own direction. An explicit
    // `opts.topOffset` from the caller wins (tests, and any future caller that computes the
    // shear itself); otherwise it comes from the spec's angle. Vertical ⇒ null ⇒ unchanged.
    const topOffset = opts.topOffset
        ?? rakeTopOffset(wall.rakeAngleDeg, opts.height, footprint.direction);
    const geometry  = buildWallExtrusion(footprint, { ...opts, topOffset });
    return { geometry, footprint, miter };
}

/**
 * Convenience for one-off builds (no caller-managed cache — useful in tests
 * or one-shot scripts). Builds the cache fresh from `levelWalls`, then the
 * geometry for `wall` (which must appear in `levelWalls`).
 */
export function buildWallV2GeometryOneShot(
    wall: LevelWallSpec,
    levelWalls: readonly LevelWallSpec[],
    opts: ExtrudeOpts,
): { geometry: THREE.BufferGeometry; footprint: WallFootprint; miter: WallMiter | null } {
    const cache = new WallPipelineV2Cache();
    cache.refresh(levelWalls);
    return buildWallV2Geometry(wall, cache, opts);
}

// Re-export the underlying types so callers can avoid digging into the three
// modules separately when they only need the shim's surface.
export type { WallMiter, WallInput } from './JunctionResolverV2';
export type { WallFootprint } from './WallFootprint2D';
export type { ExtrudeOpts } from './WallPolygonExtruder';
