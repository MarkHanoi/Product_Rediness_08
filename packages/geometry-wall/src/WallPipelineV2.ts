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

// ─── Feature flag ─────────────────────────────────────────────────────────────

/**
 * Pascal-style wall pipeline switch. **DEFAULT ON as of 2026-05-27.** The
 * legacy `MiterPrismBuilder` path is retained as an emergency opt-out — set
 * `window.__pryzmWallPipelineV2 = false` to fall back. Returns ON unless that
 * literal-false escape hatch is set. Reads `globalThis` so it works in browser
 * + Node (the latter for tests).
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
    const input: WallInput = { id: wall.id, start: wall.startXZ, end: wall.endXZ, thickness: wall.thickness };
    const miter = cache.getMiter(wall.id);
    const footprint = buildWallFootprint(input, miter);
    const geometry  = buildWallExtrusion(footprint, opts);
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
