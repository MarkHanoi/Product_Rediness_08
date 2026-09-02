/**
 * §PERF-WALL-ADD-PROXIMITY — per-level spatial hash feeding WallStore.add()'s two
 * creation-time derivations (2026-09-02 perf lane, diagnosis fix 2a).
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS FIXES. `add()` fed `deriveJoinIntent` (§WALL-JOIN-INTENT, L-927) and
 * `retreatOntoHostFaces` (§FIX-WALL-CREATE-ON-HOST-FACE, L-929) with ALL walls on the
 * level — O(levelWalls) per add, O(N²) per batch. Measured before the fix
 * (tools/perf/diagnose-wallstore-add-bench.mts): 1000 adds = 259 ms with 10.8× per-add
 * growth; the authoritative-mirror batch replay paid 80% of a 1000-wall batch there.
 *
 * WHAT THIS IS NOT. It changes NO answer. Both consumers keep their exact predicates and
 * re-check every candidate with the same epsilons; this index only shrinks the candidate
 * set they scan, and it is only ever queried with a SUPERSET guarantee:
 *
 *   • `endpointCandidates(p, eps)` returns every wall with ≥1 endpoint within `eps` of
 *     `p` (plus false positives, which the exact `Math.hypot` checks discard). Serves
 *     `deriveJoinIntent`'s committed-endpoint count AND `retreatOntoHostFaces` GUARD 1
 *     (endpoint-coincidence ⇒ corner, not body landing) — both at `JOIN_INTENT_EPS_M`.
 *   • `bandCandidates(p)` returns every wall whose SOLID BAND (centreline ± thickness/2,
 *     between the caps) can contain `p` (plus false positives). Serves the retreat's
 *     GUARD 2/3 pre-filter: a host whose band excludes the endpoint fails those guards
 *     for every configuration, so omitting it cannot change the result.
 *
 * SUPERSET PROOF SKETCH (why one own-cell lookup suffices for bands): each wall is
 * inserted into every cell intersecting the square of half-width R = pad + CELL around
 * samples spaced ≤ CELL along its centreline, pad = thickness/2 + margin. Any point p
 * inside the band is within pad of the centreline, hence within pad + CELL/2 < R
 * (Euclidean ⇒ Chebyshev) of some sample, so p's own cell was inserted for that wall.
 * Endpoints are inserted into their own cell only; the query therefore sweeps the cells
 * covering the eps-disc around p. Equivalence is asserted store-vs-full-scan in
 * `__tests__/wallJoinProximityEquivalence.test.ts`.
 *
 * FRESHNESS is the store's job, not this class's: WallStore builds one lazily per level,
 * inserts incrementally on add/level-move, and DROPS the level's index on any update or
 * removal (rebuilt on next add). A mutation-heavy interleave therefore degrades to the
 * pre-fix rebuild cost, never to a stale answer.
 */

import type { Point3D } from '@pryzm/core-app-model';

/** Cell size, metres. Big enough that an eps=20 mm endpoint query touches ≤4 cells. */
export const PROXIMITY_CELL_M = 1.0;

/** Extra band padding over thickness/2 — float-wobble defence only, not a semantic. */
const BAND_MARGIN_M = 0.01;

/** The minimum this needs from a wall — matches HostBodyCandidate's shape on purpose. */
export interface ProximityWall {
    id: string;
    thickness: number;
    baseLine: readonly [Point3D, Point3D] | Point3D[];
}

const keyOf = (cx: number, cz: number) => `${cx}|${cz}`;
const cellOf = (v: number) => Math.floor(v / PROXIMITY_CELL_M);

export class WallJoinProximityIndex {
    /** cell → wall ids owning ≥1 endpoint in that cell (duplicates fine — Set-unioned). */
    private endpointCells = new Map<string, string[]>();
    /** cell → wall ids whose padded band square covers that cell. */
    private bandCells = new Map<string, Set<string>>();

    insert(wall: ProximityWall): void {
        const p0 = wall.baseLine[0];
        const p1 = wall.baseLine[1];
        if (!p0 || !p1) return;

        for (const e of [p0, p1]) {
            const k = keyOf(cellOf(e.x), cellOf(e.z));
            const arr = this.endpointCells.get(k);
            if (arr) arr.push(wall.id);
            else this.endpointCells.set(k, [wall.id]);
        }

        const halfT = Number.isFinite(wall.thickness) && wall.thickness > 0 ? wall.thickness / 2 : 0;
        const R = halfT + BAND_MARGIN_M + PROXIMITY_CELL_M;
        const dx = p1.x - p0.x, dz = p1.z - p0.z;
        const len = Math.hypot(dx, dz);
        const steps = Math.max(1, Math.ceil(len / PROXIMITY_CELL_M));
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const sx = p0.x + dx * t, sz = p0.z + dz * t;
            const cx0 = cellOf(sx - R), cx1 = cellOf(sx + R);
            const cz0 = cellOf(sz - R), cz1 = cellOf(sz + R);
            for (let cx = cx0; cx <= cx1; cx++) {
                for (let cz = cz0; cz <= cz1; cz++) {
                    const k = keyOf(cx, cz);
                    let set = this.bandCells.get(k);
                    if (!set) { set = new Set(); this.bandCells.set(k, set); }
                    set.add(wall.id);
                }
            }
        }
    }

    /** Union into `out` the ids of walls that MAY have an endpoint within `eps` of `p`. */
    endpointCandidates(p: Point3D, eps: number, out: Set<string>): void {
        const cx0 = cellOf(p.x - eps), cx1 = cellOf(p.x + eps);
        const cz0 = cellOf(p.z - eps), cz1 = cellOf(p.z + eps);
        for (let cx = cx0; cx <= cx1; cx++) {
            for (let cz = cz0; cz <= cz1; cz++) {
                const arr = this.endpointCells.get(keyOf(cx, cz));
                if (arr) for (const id of arr) out.add(id);
            }
        }
    }

    /** Union into `out` the ids of walls whose solid band MAY contain `p`. */
    bandCandidates(p: Point3D, out: Set<string>): void {
        const set = this.bandCells.get(keyOf(cellOf(p.x), cellOf(p.z)));
        if (set) for (const id of set) out.add(id);
    }
}
