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
import {
    resolveJunctions, resolveJunctionsWithRecords,
    type Pt2, type WallInput, type WallJunctionRecord, type WallMiter,
} from './JunctionResolverV2';
import { buildWallFootprint, type WallFootprint } from './WallFootprint2D';
// §L955-ONE-CORNER-RULE — the band slicer, so the LAYERED path can be lofted by the
// SAME twin solve the plain path uses. Pure 2-D; no cycle (WallLayerFootprint2D imports
// only types from JunctionResolverV2/WallFootprint2D plus WallRake).
import { buildWallLayerBands } from './WallLayerFootprint2D';
import { buildWallExtrusion, type ExtrudeOpts } from './WallPolygonExtruder';
import { isVerticalRake, RAKE_MIN_DEG, rakedPlanThickness, rakeTopOffset, resolveRakeDeg } from './WallRake';

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

/** §WALL-RAKE-JOINT-STALE-CACHE — the float-noise floor for "this DEGREE field has not
 *  moved". Deliberately not a `@pryzm/geometry-kernel` role: those are metre- and
 *  radian-valued model-space questions (C73 §2.4) and this one is neither. See
 *  {@link WallPipelineV2Cache.rakeIsFreshFor}, its only consumer. */
const RAKE_DEG_IDENTITY = 1e-9;

/** Shoelace signed area — the orientation test both loft consumers apply. */
function signedArea(pts: ReadonlyArray<Pt2>): number {
    let a2 = 0;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        const q = pts[(i + 1) % pts.length]!;
        a2 += p.x * q.z - q.x * p.z;
    }
    return a2 / 2;
}

/**
 * §JOIN1-DEGRADATION-IS-NOT-SILENT (L-1270) — why a raked wall took the ADR-0310 uniform
 * shear instead of the ADR-0312 loft. Each value names a DIFFERENT geometric situation;
 * they are not interchangeable and must not be collapsed into a boolean.
 *
 *  · `probe-index-misaligned` — the junction topology bifurcated within the probe
 *    elevation. Vanishingly rare by construction; a genuine "cannot answer".
 *  · `drift-non-finite` / `drift-past-bound` — a degenerate probe artefact.
 *  · `top-face-overtrimmed` — ⭐ THE FOUNDER'S WEDGE. The wall's mitre corner drifts
 *    further than the wall is long, so its lofted top face inverts. Real geometry, not
 *    noise: the joint has consumed the wall's top. The wall is drawn with its own
 *    uniform shear while its (longer) neighbour lofts, and the shared corner opens.
 */
export type RakeJointRefusalReason =
    | 'probe-index-misaligned'
    | 'drift-non-finite'
    | 'drift-past-bound'
    | 'top-face-overtrimmed';

/** One wall that could not take the lofted joint, with the numbers that say why. */
export interface RakeJointRefusal {
    readonly wallId: string;
    readonly reason: RakeJointRefusalReason;
    readonly detail: string;
}

/**
 * §L955-ONE-CORNER-RULE — THE loft: difference a base polygon against its probe-solve
 * twin and scale the per-metre drift to `height`.
 *
 * Extracted so the WALL polygon ({@link WallPipelineV2Cache.rakedTopOffsets}) and the
 * per-LAYER band polygons ({@link WallPipelineV2Cache.rakedLayerBandTopOffsets}) place
 * a shared corner by ONE rule and cannot drift apart — the defect class L-955 is. It is
 * also why neither consumer spells `cot(rake)`: the shear reached these polygons through
 * the probe walls `refresh()` built with `WallRake.rakeTopOffset`, the single authority.
 *
 * Returns null — never a throw — on a non-finite drift, a drift past the geometric bound
 * ({@link RAKE_JOINT_MAX_DRIFT_PER_M}), or a lofted polygon whose orientation flips (an
 * inside-out top). Callers read null as "use the ADR-0310 uniform shear".
 *
 * ── §JOIN1-DEGRADATION-IS-NOT-SILENT (L-1270, founder 2026-08-19) ────────────────
 *
 * ⛔ THAT LAST SENTENCE DESCRIBES THE FOUNDER'S WEDGE, NOT A SAFETY NET. "Use the
 * ADR-0310 uniform shear" IS the pre-ADR-0312 geometry — the one whose top corner is
 * measurably OPEN, and the one this whole loft exists to replace. So on refusal the
 * caller does not degrade to something weaker-but-sound; it degrades to the DEFECT.
 *
 * ⭐ AND THE REFUSAL IS PER-WALL, WHICH IS THE ACTUAL DEFECT. A mitre corner belongs to
 * TWO walls. Each calls this function about its OWN polygon and each decides alone.
 * Measured (`L1270RakedJoinShortNeighbour.test.ts`, real store→join→build path):
 *
 *     9.237 m wall @80°  ∨  0.5 m return @80°, H = 3 m
 *       long wall  → LOFT (its top polygon is healthy)
 *       short wall → orientation flip → UNIFORM
 *       ⇒ base corner shared to 0 mm, TOP corner 71 mm apart. At H = 4 m, 105 mm.
 *
 * The long wall the founder selected is built CORRECTLY. Its 0.5 m neighbour is not,
 * and the hole is on the corner they share. This is §L955-ONE-CORNER-RULE one level up:
 * L-955 was three BODY BUILDERS placing one corner by different rules; this is two
 * WALLS placing one corner by different rules.
 *
 * ⭐ WHY THE GUARD IS KEPT, AND WHAT IS FIXED INSTEAD. The flip is REAL, not numerical:
 * a wall whose mitre corner drifts further than its own length has a top face of
 * NEGATIVE area — the joint has consumed it. Removing the guard closes the measured gap
 * to 0 in every case (probe: `alwaysLoft=0.0000`, all rows) but does so with a
 * self-intersecting bow-tie top, which is a different wrong answer, not a fix. The
 * architecturally correct solid is one CLIPPED at the height where its top face
 * degenerates — a height-varying mitre — and that is a change to the extruder's contract
 * (a wall whose top is a LINE, not a face), deliberately NOT attempted here.
 *
 * ⭐ WHAT IS FIXED: the refusal stops being SILENT. `onRefuse` reports it with BOTH
 * numbers, `WallPipelineV2Cache.rakeJointRefusals()` names every wall that took the
 * uniform fallback, and `C85 §RAKE-JOINT-OVERTRIM` states the invariant. A refusal and a
 * success were the same value — the §CONTEXT-DATA-HONESTY failure this repo has now hit
 * repeatedly — and that is what changes. Do not "fix" this by deleting the guard.
 */
function loftOffsets(
    base: ReadonlyArray<Pt2>,
    probe: ReadonlyArray<Pt2>,
    height: number,
    onRefuse?: (reason: RakeJointRefusalReason, detail: string) => void,
): Pt2[] | null {
    const refuse = (reason: RakeJointRefusalReason, detail: string): null => {
        onRefuse?.(reason, detail);
        return null;
    };
    if (probe.length !== base.length) {
        return refuse(
            'probe-index-misaligned',
            `probe polygon has ${probe.length} vertices, base has ${base.length} — the junction ` +
            `topology bifurcated under the ${RAKE_JOINT_PROBE_H} m probe`,
        );
    }
    const offsets: Pt2[] = [];
    for (let i = 0; i < base.length; i++) {
        const b = base[i]!;
        const p = probe[i]!;
        const vx = (p.x - b.x) / RAKE_JOINT_PROBE_H;   // drift per metre of height
        const vz = (p.z - b.z) / RAKE_JOINT_PROBE_H;
        if (!Number.isFinite(vx) || !Number.isFinite(vz)) {
            return refuse('drift-non-finite', `vertex ${i} drifted to a non-finite value`);
        }
        const perM = Math.hypot(vx, vz);
        if (perM > RAKE_JOINT_MAX_DRIFT_PER_M) {
            return refuse(
                'drift-past-bound',
                `vertex ${i} drifts ${perM.toFixed(1)} m per metre of height, past the geometric ` +
                `bound ${RAKE_JOINT_MAX_DRIFT_PER_M.toFixed(1)}`,
            );
        }
        offsets.push({ x: vx * height, z: vz * height });
    }
    // The lofted top polygon must keep the base polygon's orientation — an inverted
    // (bow-tie / negative-area) top would render inside-out. On flip, degrade.
    const baseArea = signedArea(base);
    const topArea = signedArea(base.map((p, i) => ({ x: p.x + offsets[i]!.x, z: p.z + offsets[i]!.z })));
    if (!(Math.sign(topArea) === Math.sign(baseArea) && Math.abs(topArea) > 1e-9)) {
        const worst = Math.max(...offsets.map(o => Math.hypot(o.x, o.z)));
        return refuse(
            'top-face-overtrimmed',
            `at height ${height.toFixed(3)} m the lofted top face has area ${topArea.toFixed(4)} m² ` +
            `against a base of ${baseArea.toFixed(4)} m² (worst corner drift ${worst.toFixed(3)} m) — ` +
            `the mitre has consumed this wall's top. Its corner falls back to the ADR-0310 uniform ` +
            `shear while a longer neighbour lofts, so the shared corner OPENS toward the top`,
        );
    }
    return offsets;
}

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
    /**
     * §FEAT-RAKE-LAYERED (founder 2026-08-18) — TRUE when this wall carries a multi-layer
     * construction assembly (`WallData.layers.length > 1`).
     *
     * It exists for ONE reason: for a layered wall `thickness` is stamped as `Σ layer.thickness`
     * (`CreateWallCommand`), and every term of that sum is a PERPENDICULAR thickness. So when
     * such a wall is RAKED, its true PLAN thickness is `thickness / sin θ` — see
     * {@link effectivePlanThickness}. A PLAIN wall's `thickness` is a plan quantity already and
     * is never rescaled, which is what keeps every existing raked wall byte-identical.
     *
     * Absent / false ⇒ no rescale ⇒ this whole feature is a strict no-op, which is why every
     * pre-existing caller may keep omitting it.
     */
    readonly layered?: boolean;
}

/**
 * §FEAT-RAKE-LAYERED — the PLAN (horizontal, XZ) thickness this wall actually occupies.
 *
 * Equal to `spec.thickness` for every wall except a RAKED LAYERED one, where it widens to
 * `thickness / sin θ` because the stored number is a perpendicular sum (see
 * {@link LevelWallSpec.layered}).
 *
 * THE POINT OF PUTTING IT HERE, rather than at the two call sites: the junction solve
 * (`refresh`) and the per-wall footprint (`buildWallV2Geometry`, and the layered branch of
 * `WallFragmentBuilder`) MUST agree on the wall's width, or the polygon zig-zags between two
 * frames — half its corners solved for a narrow wall, half its caps drawn for a wide one. One
 * exported function, consumed by all of them, makes that disagreement unrepresentable.
 */
export function effectivePlanThickness(spec: {
    readonly thickness: number;
    readonly rakeAngleDeg?: number;
    readonly layered?: boolean;
}): number {
    if (!spec.layered) return spec.thickness;
    return rakedPlanThickness(spec.thickness, spec.rakeAngleDeg);
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

// ─── §CONNECT-3 — the junction lookup result (BIM30 deliverable §D-7 / §G Tier 2) ──
//
// FAILURE ≠ EMPTINESS. `[]` for "this wall has no junctions" and `[]` for "I have never
// heard of this wall" is the exact conversion the doctrine forbids (context-data-honesty:
// failure and empty are the SAME VALUE). So the lookup returns a discriminated union with
// a named reason, following the refusal idiom already established in this package by
// `WallOccupancyStore.planOpeningRefit` / `CanPlaceResult` — a plain data result carrying
// a human-readable sentence that names the specifics, not a thrown error.

export type WallJunctionRefusalReason =
    /** `refresh()` has never run on this cache — it holds no level, so it cannot answer. */
    | 'cache-not-refreshed'
    /** The cache was refreshed, but this wall id was not in the level slice it was given. */
    | 'wall-not-on-level';

export type WallJunctionQuery =
    | {
        readonly ok: true;
        readonly wallId: string;
        /** Empty is a real, positive answer here: this wall is on the level and joins nothing. */
        readonly junctions: readonly WallJunctionRecord[];
    }
    | {
        readonly ok: false;
        readonly wallId: string;
        readonly reason: WallJunctionRefusalReason;
        /** Human-readable sentence naming what was asked and what the cache holds. */
        readonly detail: string;
    };

export type WallConnectivityQuery =
    | { readonly ok: true; readonly wallId: string; readonly connectedWallIds: readonly string[] }
    | {
        readonly ok: false;
        readonly wallId: string;
        readonly reason: WallJunctionRefusalReason;
        readonly detail: string;
    };

/**
 * Lazily-recomputed cache of `WallMiter` for every wall on one level, plus (§CONNECT-3)
 * the L/T/Y/X junction records that same solve produced.
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

    // ── §CONNECT-3 — the retained junction index ──────────────────────────────
    // Lives BESIDE the miter map, populated by the same `resolveJunctionsWithRecords`
    // call inside `refresh()`, and cleared by the same `refresh()` that clears the
    // miters — see the two §CONNECT-3 markers in that method. That is
    // the whole design: the index cannot outlive the solve that produced it, because
    // it is invalidated by the SAME statement. There is no second invalidation path
    // to keep in sync, no subscription, and no new store.
    /** Every junction on the refreshed level, detection order. */
    private _junctions: WallJunctionRecord[] = [];
    /** wallId → the junctions that wall participates in (detection order). */
    private _junctionsByWall = new Map<string, WallJunctionRecord[]>();
    /** FALSE until the first `refresh()`. Distinguishes "no level loaded" (a refusal)
     *  from "level loaded, this wall joins nothing" (a legitimate empty answer). */
    private _refreshed = false;

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

    /**
     * §JOIN1-DEGRADATION-IS-NOT-SILENT (L-1270) — every wall on this level whose lofted
     * joint was REFUSED, keyed by wall id so a wall reports once per refresh however many
     * times it is rebuilt. Populated lazily by {@link rakedTopOffsets} and friends, because
     * the refusal depends on the wall HEIGHT, which `refresh()` does not know.
     *
     * ⚠ Read this, not the absence of a warning: an empty map after a build means every
     * raked wall lofted; a NON-EMPTY map means the corners those walls share with their
     * neighbours are open at the top by up to the drift named in `detail`.
     */
    private _rakeRefusals = new Map<string, RakeJointRefusal>();

    refresh(walls: readonly LevelWallSpec[]): void {
        this._byId.clear();
        this._walls.clear();
        this._probeMiters.clear();
        this._probeWalls.clear();
        this._hasRake = false;
        this._rakeRefusals.clear();
        this._rakeJointSig = '';
        this._rakeUsed.clear();
        // §CONNECT-3 — same clear, same statement block, same lifetime as the miters.
        this._junctions = [];
        this._junctionsByWall.clear();
        this._refreshed = true;
        for (const w of walls) this._rakeUsed.set(w.id, resolveRakeDeg(w.rakeAngleDeg));
        if (walls.length === 0) return;
        const inputs: WallInput[] = walls.map(w => ({
            id: w.id,
            start: w.startXZ,
            end:   w.endXZ,
            // §FEAT-RAKE-LAYERED — a raked LAYERED wall is genuinely wider in plan than its
            // stored (perpendicular) thickness, so the junction solve must mitre the WIDE
            // wall. Identity for every other wall.
            thickness: effectivePlanThickness(w),
            systemTypeId: w.systemTypeId,
            // §FIX-WALL-ARC-LINEAR-MITRE — hand the resolver the arc's true heading at each end.
            ...curveTangents(w),
        }));
        for (const w of inputs) this._walls.set(w.id, w);
        // §CONNECT-3 — ONE solve, both products. The junction records are what
        // `resolveJunctions` used to discard on the way out of this exact call.
        const solved = resolveJunctionsWithRecords(inputs);
        for (const m of solved.miters) this._byId.set(m.id, m);
        this._junctions = solved.junctions;
        for (const rec of solved.junctions) {
            for (const wid of rec.wallIds) {
                const list = this._junctionsByWall.get(wid);
                if (list) list.push(rec);
                else this._junctionsByWall.set(wid, [rec]);
            }
        }

        // §WALL-RAKE-JOINT — the PROBE solve, run only when a rake exists on the
        // level (a vertical-only level pays nothing and stays byte-identical).
        //
        // ⚠ THIS BLOCK'S OWN COMMENT WAS FALSIFIED BY §FEAT-RAKE-CURVED, and the stale
        //   clause is quoted rather than deleted (C84 §6). It read: *"Each wall's
        //   endpoints translate by ε · (its per-metre shear vector); a vertical wall —
        //   AND EVERY CURVED WALL, SINCE CURVE × RAKE IS REFUSED — translates by zero."*
        //   Curve × rake is no longer refused, and a curved wall's endpoints do NOT
        //   translate by one shared vector.
        //
        // §FEAT-RAKE-CURVED-JOINT (L-1066) — A CONE'S TWO ENDS LEAN IN DIFFERENT
        // DIRECTIONS, so the probe displaces each endpoint along ITS OWN normal. That is
        // the same rule the body uses (`top(s) = base(s) + n(s)·h·cot θ`) evaluated at the
        // two stations the JUNCTION actually cares about — the corner is at an endpoint,
        // and nowhere else. Using the CHORD here, as this loop did, is the identical
        // mistake L-1068 found in the leaf: correct while a raked host could not be
        // curved, wrong the moment one could.
        //
        // THE HEADINGS ARE STILL UNCHANGED, which is what keeps the resolver honest. A
        // concentric arc has the SAME tangent direction at every corresponding station as
        // the arc it offsets, so `startDir`/`endDir` carry over untouched — and for a
        // STRAIGHT wall `curveTangents` returns `{}`, both ends fall back to the chord,
        // and every number below is bit-identical to the pre-curve behaviour.
        const rakedTags: string[] = [];
        const shearStartOf = new Map<string, Pt2>();
        const shearEndOf = new Map<string, Pt2>();
        for (const w of walls) {
            if (isVerticalRake(w.rakeAngleDeg)) continue;
            const chord = { x: w.endXZ.x - w.startXZ.x, z: w.endXZ.z - w.startXZ.z };
            const tan = curveTangents(w);
            // `rakeTopOffset(·, 1, dir)` is the shear per metre of height — the ONE place
            // cot(rake) is applied, called once per end rather than once per wall.
            const sStart = rakeTopOffset(w.rakeAngleDeg, 1, tan.startDir ?? chord);
            const sEnd = rakeTopOffset(w.rakeAngleDeg, 1, tan.endDir ?? chord);
            if (!sStart || !sEnd) continue;
            shearStartOf.set(w.id, sStart);
            shearEndOf.set(w.id, sEnd);
            rakedTags.push(`${w.id}:${(w.rakeAngleDeg ?? 90).toFixed(4)}`);
        }
        if (rakedTags.length === 0) return;
        this._hasRake = true;
        this._rakeJointSig = rakedTags.sort().join(',');

        const probeInputs: WallInput[] = inputs.map(w => {
            const ss = shearStartOf.get(w.id);
            const se = shearEndOf.get(w.id);
            if (!ss || !se) return w;
            return {
                ...w,
                start: { x: w.start.x + ss.x * RAKE_JOINT_PROBE_H, z: w.start.z + ss.z * RAKE_JOINT_PROBE_H },
                end:   { x: w.end.x   + se.x * RAKE_JOINT_PROBE_H, z: w.end.z   + se.z * RAKE_JOINT_PROBE_H },
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
     * §WALL-RAKE-JOINT-STALE-CACHE — TRUE when this cache's solves were run at the rake
     * the caller is about to build with, so its twin-solve loft may be consumed.
     *
     * §L955-ONE-CORNER-RULE folded three spellings of this comparison into one. The test
     * is a normalised-DEGREE identity, not a model-space tolerance: `resolveRakeDeg` maps
     * absent/null/non-finite to 90 first, so the only difference it can see is a real
     * authored change. That is why the band is a bare float-noise floor and not a
     * `@pryzm/geometry-kernel` role — those are metres and radians (C73 §2.4), and this
     * asks "did the stored degree field move at all". Keeping it on the cache also means
     * a caller cannot forget it: `buildWallV2Geometry`, the layered band arm and the
     * opening-host cap drift all ask the same question of the same object.
     *
     * FALSE when the wall was not part of the last `refresh()` — absent evidence is not a
     * pass. Callers read FALSE as "use the ADR-0310 uniform shear at the CURRENT angle",
     * never as "no rake".
     */
    rakeIsFreshFor(wallId: string, rakeAngleDeg: number | null | undefined): boolean {
        const used = this._rakeUsed.get(wallId);
        if (used === undefined) return false;
        return Math.abs(used - resolveRakeDeg(rakeAngleDeg)) <= RAKE_DEG_IDENTITY;
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
        if (probeFp.invalid || probeFp.polygon.length !== base.length) {
            this._recordRakeRefusal(
                wallId, 'probe-index-misaligned',
                probeFp.invalid
                    ? 'the probe footprint is invalid'
                    : `probe footprint has ${probeFp.polygon.length} vertices, base has ${base.length}`,
            );
            return null;
        }

        // §JOIN1-DEGRADATION-IS-NOT-SILENT (L-1270) — the recorder, not a bare null.
        return loftOffsets(base, probeFp.polygon, height, (reason, detail) =>
            this._recordRakeRefusal(wallId, reason, detail));
    }

    /**
     * §L955-ONE-CORNER-RULE (founder 2026-08-18) — the SAME twin-solve loft as
     * {@link rakedTopOffsets}, sliced into the per-LAYER bands a layered wall's body is
     * actually built from. One entry per band, each index-aligned with that band's own
     * polygon.
     *
     * ── WHY THIS EXISTS ────────────────────────────────────────────────────────────
     * The founder reported (live `d5b8d82f`) that a raked wall joins soundly ONLY when
     * it is plain. The layered path had OPTED OUT of the loft, in its own words
     * *"Deliberately NOT the per-vertex ADR-0312 loft: `rakedTopOffsets` is index-aligned
     * with the WALL polygon, and a BAND polygon has different vertices"* — a true
     * statement about `rakedTopOffsets`, answered here rather than accepted. Two walls
     * that place their shared top corner by DIFFERENT rules disagree above the floor,
     * and the disagreement grows with height: the founder's wedge of daylight.
     *
     * ── WHY IT IS EXACT AND NOT AN INTERPOLATION ───────────────────────────────────
     * The band slicer is a pair of half-plane clips of the wall footprint. Clipping
     * commutes with the affine base→probe map that the twin solve differences, so
     * slicing the PROBE footprint with the SAME thicknesses and the SAME rake yields
     * band polygons that correspond vertex-for-vertex with the base bands whenever the
     * junction topology is unchanged — which the probe elevation
     * ({@link RAKE_JOINT_PROBE_H}, ≈0.075 mm of displacement) is chosen to guarantee.
     * No new geometry predicate is introduced and no trigonometry is respelled: the
     * shear enters only through the probe walls, which `refresh()` displaced with
     * `WallRake.rakeTopOffset`.
     *
     * ── HONEST DEGRADATION (⇒ caller keeps the ADR-0310 uniform shear) ─────────────
     * Any of: no raked wall on the level; this wall unknown to the probe solve; the
     * probe footprint not index-aligned with `baseFootprint`; a band count or band
     * vertex-count mismatch between the two slices; a drift beyond the geometric bound
     * or non-finite; a band's lofted top polygon inverting. Never a throw
     * (§FIX-RAKE-REFUSAL-IS-NOT-A-CRASH).
     *
     * `baseFootprint` MUST be the footprint the caller will band-slice and extrude, and
     * `layerThicknesses` / `rakeAngleDeg` MUST be the ones it will slice with — this
     * returns offsets for THAT decomposition, not for a re-derived one.
     */
    rakedLayerBandTopOffsets(
        wallId: string,
        baseFootprint: WallFootprint,
        layerThicknesses: readonly number[],
        rakeAngleDeg: number | null | undefined,
        height: number,
    ): Pt2[][] | null {
        if (!this._hasRake || !Number.isFinite(height) || height === 0) return null;
        if (layerThicknesses.length === 0) return null;
        const probeWall = this._probeWalls.get(wallId);
        if (!probeWall) return null;
        if (baseFootprint.invalid || baseFootprint.polygon.length < 3) return null;
        const probeFp = buildWallFootprint(probeWall, this._probeMiters.get(wallId) ?? null);
        if (probeFp.invalid || probeFp.polygon.length !== baseFootprint.polygon.length) return null;

        const baseBands  = buildWallLayerBands(baseFootprint, layerThicknesses, rakeAngleDeg).bands;
        const probeBands = buildWallLayerBands(probeFp,       layerThicknesses, rakeAngleDeg).bands;
        if (baseBands.length !== probeBands.length || baseBands.length !== layerThicknesses.length) return null;

        const out: Pt2[][] = [];
        for (let i = 0; i < baseBands.length; i++) {
            const b = baseBands[i]!.polygon;
            const p = probeBands[i]!.polygon;
            if (b.length < 3 || p.length !== b.length) return null;
            const offs = loftOffsets(b, p, height, (reason, detail) =>
                this._recordRakeRefusal(wallId, reason, `layer band ${i}: ${detail}`));
            if (!offs) return null;
            out.push(offs);
        }
        return out;
    }

    /**
     * §WALL-RAKE-JOINT-OPENING-HOST (founder 2026-08-10) — the SAME twin-solve loft
     * as {@link rakedTopOffsets}, expressed as the FOUR NAMED CAP CORNERS
     * (start/end × left/right) instead of a polygon-index-aligned array.
     *
     * WHY a second shape for the same numbers: only the no-openings body path goes
     * through `buildWallV2Geometry` → the polygon extruder, which consumes the
     * index-aligned array. A wall that HOSTS AN OPENING is built by
     * `WallFragmentBuilder` as box segments around the holes, with the mitred END
     * segments built by `MiterPrismBuilder` — a builder addressed by named cap
     * corners, not by footprint index. Without this accessor that path had no way
     * to consume the loft at all, so placing a door on the neighbour of a raked
     * wall silently reverted the corner to the un-lofted (ADR-0310) state: the
     * founder's "the wall joint goes out" notch at the top of the corner.
     *
     * Self-contained by design — it rebuilds the wall's BASE footprint from this
     * cache's own base solve, so a caller cannot mis-pair a footprint with the
     * offsets (the one way `rakedTopOffsets` can be misused).
     *
     * Polygon layout is the documented `buildWallFootprint` order —
     * `[sR, eR, endPivot?, eL, sL, startPivot?]` — which is what makes the
     * index → named-corner mapping exact rather than a guess.
     *
     * Returns null (⇒ the caller keeps its existing un-lofted geometry) whenever
     * {@link rakedTopOffsets} degrades, the wall is unknown to the solve, or the
     * polygon is shorter than the four corners the mapping needs.
     */
    rakeJointCapDrift(
        wallId: string,
        height: number,
    ): { startLeft: Pt2; startRight: Pt2; endLeft: Pt2; endRight: Pt2 } | null {
        if (!this._hasRake) return null;
        const w = this._walls.get(wallId);
        if (!w) return null;
        const miter = this._byId.get(wallId) ?? null;
        const fp = buildWallFootprint(w, miter);
        if (fp.invalid) return null;
        const offs = this.rakedTopOffsets(wallId, fp, height);
        if (!offs) return null;
        const iEL = 2 + (miter?.endPivot ? 1 : 0);
        const iSL = iEL + 1;
        if (iSL >= offs.length) return null;
        // A wall on a raked LEVEL that is not itself at a lofted junction gets an
        // all-zero drift. Report that as null, not as a zero vector: callers use
        // non-null to mean "this wall needs the lofted body path", and handing them a
        // no-op drift would push an untouched wall off its normal (seam-free) body
        // path for no geometric gain.
        const worst = Math.max(
            ...[offs[0]!, offs[1]!, offs[iEL]!, offs[iSL]!].map(o => Math.hypot(o.x, o.z)),
        );
        if (!(worst > 1e-9)) return null;
        return {
            startRight: offs[0]!,
            endRight:   offs[1]!,
            endLeft:    offs[iEL]!,
            startLeft:  offs[iSL]!,
        };
    }

    /**
     * §FEAT-RAKE-CURVED-JOINT (L-1066) — the lofted TOP-CAP corner displacement for a
     * CURVED raked wall, as the four named cap corners.
     *
     * ── WHY THIS EXISTS ALONGSIDE `rakeJointCapDrift` RATHER THAN INSIDE IT ─────────
     *
     * `rakeJointCapDrift` gets its numbers by differencing a wall's base FOOTPRINT
     * POLYGON against its probe twin (`rakedTopOffsets` → `buildWallFootprint`). A curved
     * wall has no such polygon — `buildWallFootprint` is a straight-wall construction —
     * so that route cannot serve an arc without inventing a curved footprint builder.
     *
     * It does not need one. The MITER RECORD already carries the four corner POINTS, and
     * the loft is exactly their displacement between the base solve and the probe solve,
     * scaled from ε to the wall's height. Same twin solve, same ADR-0312 principle, read
     * from the product that already exists in the shape the curved builder consumes.
     *
     * ⚠ THE BASE CORNER IS NOT TAKEN FROM HERE — ONLY THE DELTA. The curved builder cuts
     *   its base caps with `WallJoinResolver` + `projectCapVertex`, a DIFFERENT solver
     *   from this one (L-1039: two solvers, one corner). Mixing the two solvers' absolute
     *   positions would be that defect; adding a delta computed entirely WITHIN this
     *   solver is not. It is sound because the two solvers are MEASURED to agree at the
     *   base — `baseSep = 0.000 m` at every neighbour combination in
     *   `RK1RakedCombinationMatrix`, curve↔straight included. **If that ever stops being
     *   true, this accessor is not the thing to fix — L-1039 is.**
     *
     * Returns null — never a throw — when the wall is unknown to either solve, or when
     * the per-metre drift exceeds the same geometric bound `loftOffsets` uses. Callers
     * read null as "keep the ADR-0310 uniform cone", which is exact at the floor.
     */
    curvedRakeCapDrift(
        wallId: string,
        height: number,
    ): { startLeft: Pt2; startRight: Pt2; endLeft: Pt2; endRight: Pt2 } | null {
        if (!this._hasRake || !Number.isFinite(height) || height === 0) return null;
        const base = this._byId.get(wallId);
        const probe = this._probeMiters.get(wallId);
        if (!base || !probe) return null;

        let worst = 0;
        const delta = (b: Pt2 | undefined, p: Pt2 | undefined): Pt2 => {
            // A free end has no corner in EITHER solve, and zero displacement is the
            // right answer for it — there is no mitre to re-solve. A corner present in
            // one solve and absent in the other means the topology BIFURCATED under the
            // ε probe; that is the `loftOffsets` degradation case and is caught below.
            if (!b || !p) return { x: 0, z: 0 };
            const vx = (p.x - b.x) / RAKE_JOINT_PROBE_H;
            const vz = (p.z - b.z) / RAKE_JOINT_PROBE_H;
            worst = Math.max(worst, Math.hypot(vx, vz));
            return { x: vx * height, z: vz * height };
        };
        const bifurcated =
            (!!base.startLeft !== !!probe.startLeft) || (!!base.startRight !== !!probe.startRight)
            || (!!base.endLeft !== !!probe.endLeft) || (!!base.endRight !== !!probe.endRight);
        if (bifurcated) {
            this._recordRakeRefusal(
                wallId, 'probe-index-misaligned',
                'a curved cap corner is present in one solve and absent in the other',
            );
            return null;
        }

        const out = {
            startLeft:  delta(base.startLeft,  probe.startLeft),
            startRight: delta(base.startRight, probe.startRight),
            endLeft:    delta(base.endLeft,    probe.endLeft),
            endRight:   delta(base.endRight,   probe.endRight),
        };
        if (!Number.isFinite(worst) || worst > RAKE_JOINT_MAX_DRIFT_PER_M) {
            this._recordRakeRefusal(
                wallId, Number.isFinite(worst) ? 'drift-past-bound' : 'drift-non-finite',
                `curved cap corner drifts ${worst.toFixed(1)} m per metre of height, past the ` +
                `geometric bound ${RAKE_JOINT_MAX_DRIFT_PER_M.toFixed(1)}`,
            );
            return null;
        }
        // An unjoined raked wall drifts by zero at every corner. Report that as null, not
        // as four zero vectors: non-null means "this wall needs the lofted cap", and
        // handing back a no-op would push a free-standing arc off its ordinary cap path
        // for no geometric gain. Same convention as `rakeJointCapDrift`.
        if (!(worst > 1e-9)) return null;
        return out;
    }

    // ─── §JOIN1-DEGRADATION-IS-NOT-SILENT (L-1270) ───────────────────────────
    //
    // A refusal and a success were the SAME VALUE — `null` — and nothing anywhere said
    // which one had happened. That is exactly the §CONTEXT-DATA-HONESTY failure, and it
    // is why a founder-visible 71 mm hole through a building corner had no line in any
    // log to grep for. These two members are the whole fix's observable half.

    /** First refusal wins: a wall reports the reason it FIRST could not loft, not the last
     *  of N rebuilds. Later calls at the same height would restate it; a different height
     *  is a different question and the first (usually the storey height) is the one the
     *  author is looking at. */
    private _recordRakeRefusal(wallId: string, reason: RakeJointRefusalReason, detail: string): void {
        if (this._rakeRefusals.has(wallId)) return;
        this._rakeRefusals.set(wallId, { wallId, reason, detail });
        // ONE line per wall per refresh — bounded by the level's wall count, never
        // per-frame, because `refresh()` clears the map. `top-face-overtrimmed` is a
        // user-visible open corner and is warned; the other three are degenerate-probe
        // arms that also open the corner, so they warn too. There is no quiet arm: the
        // whole point is that this can no longer happen without a line to find.
        // eslint-disable-next-line no-console
        console.warn(
            `[WallPipelineV2] §JOIN1-DEGRADATION-IS-NOT-SILENT wall ${wallId}: lofted joint ` +
            `REFUSED (${reason}) — ${detail}. Built with the ADR-0310 uniform shear; the corner ` +
            `it shares with a lofting neighbour is exact at the floor and OPEN at the top.`,
        );
    }

    /**
     * Every wall on the refreshed level whose ADR-0312 lofted joint was refused, so it was
     * built with the ADR-0310 uniform shear instead.
     *
     * ⚠ NON-EMPTY MEANS AN OPEN CORNER, not merely a slower path. A wall listed here shares
     * at least one mitre corner with a neighbour that may have lofted, and the two then
     * place that corner by DIFFERENT rules: exact at the floor, diverging with height.
     * `detail` carries the measured numbers.
     *
     * Empty is a positive answer ("every raked wall on this level lofted"), and it is
     * distinguishable from "never asked" because it is only ever populated by a BUILD —
     * `refresh()` cannot know the wall heights the refusal depends on.
     */
    rakeJointRefusals(): readonly RakeJointRefusal[] {
        return [...this._rakeRefusals.values()];
    }

    // ─── §CONNECT-3 — the retained-junction lookups ──────────────────────────
    //
    // These are the audit's Q4 ("which walls connect to wall Y") converted from
    // RE-DETECTION to LOOKUP. They read the index populated by `refresh()`; they
    // never re-run the resolver, and they never fall back to one — a lookup that
    // silently re-solves would hide exactly the staleness this design must not have.

    /** Every junction on the refreshed level, detection order. Empty before the first
     *  `refresh()` — use {@link junctionsFor} when you need the refusal instead. */
    get junctions(): readonly WallJunctionRecord[] {
        return this._junctions;
    }

    /** Shared pre-flight for both lookups: null when the cache CAN answer for `wallId`. */
    private _refuse(wallId: string): { reason: WallJunctionRefusalReason; detail: string } | null {
        if (!this._refreshed) {
            return {
                reason: 'cache-not-refreshed',
                detail:
                    `junction lookup for wall ${wallId}: this WallPipelineV2Cache has never been ` +
                    `refreshed, so it holds no level and cannot say whether that wall has junctions`,
            };
        }
        if (!this._walls.has(wallId)) {
            return {
                reason: 'wall-not-on-level',
                detail:
                    `junction lookup for wall ${wallId}: not among the ${this._walls.size} wall(s) ` +
                    `this cache was refreshed with — no answer, not an empty answer`,
            };
        }
        return null;
    }

    /**
     * The junctions wall `wallId` participates in.
     *
     * FAILURE ≠ EMPTINESS, deliberately: `{ok:true, junctions:[]}` means "this wall is on
     * the level and joins nothing" — a positive, trustworthy answer. `{ok:false, …}` means
     * the cache cannot answer, and names why. A caller that treats the two alike (e.g. an
     * IFC exporter emitting zero `IfcRelConnectsPathElements` for a wall the cache never
     * saw) would be converting absent evidence into a PASS.
     */
    junctionsFor(wallId: string): WallJunctionQuery {
        const refusal = this._refuse(wallId);
        if (refusal) return { ok: false, wallId, ...refusal };
        return { ok: true, wallId, junctions: this._junctionsByWall.get(wallId) ?? [] };
    }

    /**
     * §CONNECT-3 / audit §3 Q4 — the distinct ids of every wall sharing a junction with
     * `wallId`, excluding `wallId` itself. Deterministic order (junction detection order,
     * then sweep order within a junction).
     *
     * This is the payload `SemanticGraph.connectedTo` needs; see the handoff note in the
     * BIM30 deliverable. This class deliberately does NOT write that edge — it is a pure
     * geometry-side cache and owns no graph.
     */
    connectedWallIds(wallId: string): WallConnectivityQuery {
        const refusal = this._refuse(wallId);
        if (refusal) return { ok: false, wallId, ...refusal };
        const out: string[] = [];
        const seen = new Set<string>([wallId]);
        for (const rec of this._junctionsByWall.get(wallId) ?? []) {
            for (const other of rec.wallIds) {
                if (seen.has(other)) continue;
                seen.add(other);
                out.push(other);
            }
        }
        return { ok: true, wallId, connectedWallIds: out };
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
        // §FEAT-RAKE-LAYERED — same widening the cache's own solve used, so the footprint's
        // square-cap defaults and the miter's junction corners are in ONE frame.
        thickness: effectivePlanThickness(wall), systemTypeId: wall.systemTypeId,
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
    // §L955-ONE-CORNER-RULE — this comparison used to be spelled here; it now lives on the
    // cache as `rakeIsFreshFor`, so the three consumers of the loft cannot disagree about
    // when it is safe to consume. Behaviour is unchanged.
    const _cacheRakeFresh = cache.rakeIsFreshFor(wall.id, wall.rakeAngleDeg);
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
