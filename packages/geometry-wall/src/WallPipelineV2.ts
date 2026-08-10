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
import { isVerticalRake, RAKE_MIN_DEG, rakeTopOffset, resolveRakeDeg } from './WallRake';

// ─── §WALL-RAKE-JOINT (ADR-0312) — the twin-solve loft constants ──────────────
//
// The probe elevation for the SECOND junction solve. Every corner point
// `JunctionResolverV2` constructs is an AFFINE function of the elevation at which
// the wall centrelines are sampled (constant directions, linearly-translating
// anchors → line∩line, centroids, projections and caps are all affine), so the
// per-vertex drift PER METRE recovered by differencing the base solve against a
// probe solve at this tiny elevation is EXACT (to floating point) — provided both
// solves see the SAME junction topology. The probe displacement is bounded by
// `PROBE_H · |cot(RAKE_MIN_DEG)| ≈ 2e-5 · 3.732 ≈ 0.075 mm`, two orders of
// magnitude below the resolver's 1 mm SHARED_CORNER_TIGHT_M band and three below
// its 0.20 m cluster band, so topology is pinned everywhere except a measure-zero
// knife's-edge — and THAT case is caught by the footprint-alignment fallback in
// `rakedTopOffsets`, which degrades to the ADR-0310 uniform shear, never a throw.
const RAKE_JOINT_PROBE_H = 2e-5;

/** Per-metre drift cap for a lofted vertex. A mitre corner between two walls with
 *  per-metre shears s₁, s₂ meeting at plan angle φ drifts at most (|s₁|+|s₂|)/sin φ
 *  per metre, and the ring sweep refuses |sin φ| < 0.05 (its near-parallel cap) —
 *  so 2·max|cot(RAKE_MIN_DEG)|/0.05 bounds every legitimate corner. Anything past
 *  it is a degenerate probe artefact → fall back to the uniform shear. */
const RAKE_JOINT_MAX_DRIFT_PER_M =
    (2 * Math.abs(1 / Math.tan((RAKE_MIN_DEG * Math.PI) / 180))) / 0.05;

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

    // ── §WALL-RAKE-JOINT (ADR-0312) — the probe (twin) solve ──────────────────
    /** Probe-solve miters (base solve re-run at elevation RAKE_JOINT_PROBE_H). */
    private _probeMiters = new Map<string, WallMiter>();
    /** Probe-solve wall inputs (endpoints translated by ε · shear per wall). */
    private _probeWalls = new Map<string, WallInput>();
    /** TRUE when ≥1 wall on the level has a non-vertical rake. */
    private _hasRake = false;
    /** Sorted `id:rake` of every non-vertically-raked wall — the neighbour-rake
     *  cache-key fragment (empty ⇒ no raked wall ⇒ keys byte-identical to before). */
    private _rakeJointSig = '';
    /** §WALL-RAKE-JOINT-STALE-CACHE — the rake (normalised; absent ⇒ 90) each wall
     *  carried at the moment of THIS refresh. `buildWallV2Geometry` compares it to
     *  the spec's CURRENT rake and refuses the cached loft on a mismatch — a stale
     *  probe must never override the angle the store actually holds. */
    private _rakeUsed = new Map<string, number>();

    refresh(walls: readonly LevelWallSpec[]): void {
        this._byId.clear();
        this._walls.clear();
        this._probeMiters.clear();
        this._probeWalls.clear();
        this._hasRake = false;
        this._rakeJointSig = '';
        this._rakeUsed.clear();
        for (const w of walls) this._rakeUsed.set(w.id, resolveRakeDeg(w.rakeAngleDeg));
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

        // §WALL-RAKE-JOINT — the PROBE solve, run only when a rake exists on the
        // level (a vertical-only level pays nothing and stays byte-identical).
        // Each wall's endpoints translate by ε · (its per-metre shear vector); a
        // vertical wall — and every curved wall, since curve × rake is refused —
        // translates by zero. Directions (and curve tangents) are unchanged by a
        // translation, so the resolver sees the same headings.
        const rakedTags: string[] = [];
        const shearOf = new Map<string, Pt2>();
        for (const w of walls) {
            if (isVerticalRake(w.rakeAngleDeg)) continue;
            const dir = { x: w.endXZ.x - w.startXZ.x, z: w.endXZ.z - w.startXZ.z };
            const s = rakeTopOffset(w.rakeAngleDeg, 1, dir);   // shear per metre of height
            if (!s) continue;
            shearOf.set(w.id, s);
            rakedTags.push(`${w.id}:${(w.rakeAngleDeg ?? 90).toFixed(4)}`);
        }
        if (rakedTags.length === 0) return;
        this._hasRake = true;
        this._rakeJointSig = rakedTags.sort().join(',');

        const probeInputs: WallInput[] = inputs.map(w => {
            const s = shearOf.get(w.id);
            if (!s) return w;
            const dx = s.x * RAKE_JOINT_PROBE_H;
            const dz = s.z * RAKE_JOINT_PROBE_H;
            return {
                ...w,
                start: { x: w.start.x + dx, z: w.start.z + dz },
                end:   { x: w.end.x   + dx, z: w.end.z   + dz },
            };
        });
        for (const w of probeInputs) this._probeWalls.set(w.id, w);
        for (const m of resolveJunctions(probeInputs)) this._probeMiters.set(m.id, m);
    }

    /** §WALL-RAKE-JOINT — TRUE when the refreshed level carries ≥1 raked wall. */
    get hasRake(): boolean {
        return this._hasRake;
    }

    /**
     * §WALL-RAKE-JOINT — the neighbour-rake content signature for the level. A
     * wall's built TOP geometry depends on the rakes of the walls it joins, so
     * `WallFragmentBuilder._rakeTag` folds this into the per-wall cache keys
     * (gates 1+2 of §DIAG-INVALIDATION-COMPLETENESS). Empty on a level with no
     * raked wall — those keys stay byte-identical to the pre-ADR-0312 build.
     */
    get rakeJointSignature(): string {
        return this._rakeJointSig;
    }

    /**
     * §WALL-RAKE-JOINT-STALE-CACHE — the rake this cache's solves USED for one
     * wall (normalised; absent at refresh time ⇒ 90), or null when the wall was
     * not part of the refresh. Lets `buildWallV2Geometry` detect that the store
     * has moved a wall's rake since the last `refresh()` and honestly degrade to
     * the uniform ADR-0310 shear at the CURRENT angle instead of replaying the
     * previous angle's loft (the founder's "the 80° itself did not apply").
     */
    rakeUsedFor(wallId: string): number | null {
        return this._rakeUsed.get(wallId) ?? null;
    }

    /**
     * §WALL-RAKE-JOINT — the PER-VERTEX top-polygon offsets for one wall, or null
     * when the uniform ADR-0310 shear should be used instead.
     *
     * `baseFootprint` MUST be the footprint built from this cache's base solve
     * (same polygon the extruder will receive). Returns `polygon.length` offsets:
     * vertex i of the TOP polygon = base vertex i + offsets[i], placing every
     * mitred corner on the true 3-D mitre line it shares with its neighbours.
     *
     * Honest degradation to null (→ caller uses the uniform shear, floor-exact):
     *   · no raked wall on the level, or this wall unknown to the probe solve;
     *   · probe footprint does not index-align with the base footprint (the
     *     topology bifurcated within 0.075 mm of a classification threshold);
     *   · any per-vertex drift beyond the geometric bound, or non-finite;
     *   · the lofted top polygon inverts (its signed area flips sign).
     */
    rakedTopOffsets(
        wallId: string,
        baseFootprint: WallFootprint,
        height: number,
    ): Pt2[] | null {
        if (!this._hasRake || !Number.isFinite(height) || height === 0) return null;
        const probeWall = this._probeWalls.get(wallId);
        if (!probeWall) return null;
        const base = baseFootprint.polygon;
        if (base.length < 3) return null;
        const probeFp = buildWallFootprint(probeWall, this._probeMiters.get(wallId) ?? null);
        if (probeFp.invalid || probeFp.polygon.length !== base.length) return null;

        const offsets: Pt2[] = [];
        for (let i = 0; i < base.length; i++) {
            const b = base[i]!;
            const p = probeFp.polygon[i]!;
            const vx = (p.x - b.x) / RAKE_JOINT_PROBE_H;   // drift per metre of height
            const vz = (p.z - b.z) / RAKE_JOINT_PROBE_H;
            if (!Number.isFinite(vx) || !Number.isFinite(vz)) return null;
            if (Math.hypot(vx, vz) > RAKE_JOINT_MAX_DRIFT_PER_M) return null;
            offsets.push({ x: vx * height, z: vz * height });
        }

        // The lofted top polygon must keep the base polygon's orientation — an
        // inverted (bow-tie / negative-area) top would render inside-out. Compare
        // shoelace signs; on flip, degrade to the uniform shear.
        const area = (pts: ReadonlyArray<Pt2>): number => {
            let a2 = 0;
            for (let i = 0; i < pts.length; i++) {
                const p = pts[i]!;
                const q = pts[(i + 1) % pts.length]!;
                a2 += p.x * q.z - q.x * p.z;
            }
            return a2 / 2;
        };
        const baseArea = area(base);
        const topArea = area(base.map((p, i) => ({ x: p.x + offsets[i]!.x, z: p.z + offsets[i]!.z })));
        if (!(Math.sign(topArea) === Math.sign(baseArea) && Math.abs(topArea) > 1e-9)) return null;

        return offsets;
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
): {
    geometry: THREE.BufferGeometry;
    footprint: WallFootprint;
    miter: WallMiter | null;
    /** §WALL-RAKE-JOINT (ADR-0312) — the largest horizontal top-vertex drift (m) this build
     *  actually used. 0 for a vertical wall on an unraked level. The §V2-SPIKE-GUARD sizes
     *  its overshoot budget with this, so a legitimately-lofted joint corner is never
     *  demoted to the rake-less legacy prism (which would render the wall VERTICAL). */
    maxTopDriftM: number;
} {
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
    // §WALL-RAKE-JOINT (ADR-0312) — the twin-solve loft. Per-vertex top offsets place every
    // mitred corner on the true 3-D mitre line shared with its neighbours, closing joints
    // between walls of DIFFERENT rakes (incl. raked-meets-vertical) at every elevation.
    // Null (no raked wall on the level / topology fallback) ⇒ the ADR-0310 uniform shear.
    // An explicit caller-supplied `opts.topOffset` also wins here, for the same reason.
    //
    // §WALL-RAKE-JOINT-STALE-CACHE (founder 2026-08-09) — the loft is trusted ONLY
    // when the cache's recorded rake for THIS wall matches the spec's current rake.
    // The offsets are a function of the rakes the cache was REFRESHED with; consuming
    // them after the store moved this wall's rake replays the PREVIOUS angle's loft
    // and silently discards the new angle (the "one edit behind" render of the direct
    // per-wall rebuild path). On a mismatch: uniform shear at the CURRENT angle —
    // the wall's own lean is always honoured, and the joint refinement lands when the
    // coordinator's flush re-refreshes the cache in the same mutation cycle.
    const _cacheRake = cache.rakeUsedFor(wall.id);
    const _cacheRakeFresh =
        _cacheRake !== null && Math.abs(_cacheRake - resolveRakeDeg(wall.rakeAngleDeg)) <= 1e-9;
    const topOffsets = opts.topOffset !== undefined || opts.topOffsets !== undefined
        ? opts.topOffsets ?? null
        : _cacheRakeFresh
            ? cache.rakedTopOffsets(wall.id, footprint, opts.height)
            : null;
    const geometry  = buildWallExtrusion(footprint, { ...opts, topOffset, topOffsets });
    let maxTopDriftM = 0;
    if (topOffsets) {
        for (const o of topOffsets) maxTopDriftM = Math.max(maxTopDriftM, Math.hypot(o.x, o.z));
    } else if (topOffset) {
        maxTopDriftM = Math.hypot(topOffset.x, topOffset.z);
    }
    return { geometry, footprint, miter, maxTopDriftM };
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
): { geometry: THREE.BufferGeometry; footprint: WallFootprint; miter: WallMiter | null; maxTopDriftM: number } {
    const cache = new WallPipelineV2Cache();
    cache.refresh(levelWalls);
    return buildWallV2Geometry(wall, cache, opts);
}

// Re-export the underlying types so callers can avoid digging into the three
// modules separately when they only need the shim's surface.
export type { WallMiter, WallInput } from './JunctionResolverV2';
export type { WallFootprint } from './WallFootprint2D';
export type { ExtrudeOpts } from './WallPolygonExtruder';
