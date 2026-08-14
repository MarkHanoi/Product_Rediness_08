/**
 * @file WallRegionExtractor.ts
 *
 * @deprecated
 * ─────────────────────────────────────────────────────────────────────────────
 * ARCHITECTURAL STATUS: PLACEHOLDER — DO NOT EXTEND
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ─── C74 §3.4 SCAFFOLD DECLARATION (CO-06) ───────────────────────────────────
 * owner: @pryzm/ai-host (topology-layer stream; the Phase E replacement is this
 *   package's debt, not the caller's)
 * date: 2026-08-14
 *
 * WHAT IS FAKE, stated plainly — this file is named for a region extractor and
 *   is not one. It computes a JARVIS-MARCH CONVEX HULL and offers it where a
 *   PLANAR-GRAPH TOPOLOGY LAYER is specified (01-BIM-ENGINE-CORE-CONTRACT §1.2
 *   Phase 2). A hull cannot represent an L, a U, or a courtyard: on any
 *   non-convex building it BRIDGES THE NOTCH, and that ring used to be committed
 *   as the building perimeter by `AIService.CREATE_ROOF_BY_REGION` — roof over
 *   open air, then elaborated by the eave and hip offsets into a confidently
 *   wrong roof. It also reads `window.wallStore` directly, which is the
 *   store-unification debt tracked as TASK-08 / ADR-0318, not a local shortcut.
 *
 * WHAT IS REAL — the REFUSAL. Since §W2A-HULL-IS-NOT-A-PERIMETER the caller-facing
 *   path returns `{ kind: 'refused', reason }` naming the bridging edge rather
 *   than returning a hull it cannot justify. The stand-in is honest about its own
 *   limit; it is still a stand-in.
 *
 * RETIRING ASSERTION (executable, not prose) —
 *   `packages/ai-host/__tests__/WallRegionExtractor.hullRefusal.test.ts`, the test
 *   named "THE DEFECT: an L-shaped building is REFUSED — the old path committed
 *   the hull", asserts `r.kind === 'refused'` for an L-shaped plan. A REAL planar
 *   topology layer returns the correct L perimeter instead of refusing, so that
 *   assertion FAILS the moment the replacement lands — which forces this header
 *   and the placeholder posture to be retired in the same change. It cannot rot
 *   quietly: the pair is all-or-nothing.
 *
 * EXIT CONDITION — Phase E of the PDF-to-BIM reconstruction plan: a planar graph
 *   built from wall-intersection nodes, DFS cycle detection for room faces, outer
 *   face extraction for the perimeter, driven through `AIReadModel.getWallsByLevel()`
 *   (which also discharges the `window.wallStore` half). Until that exists this
 *   file stays a refusing placeholder. There is no third state where it quietly
 *   becomes adequate.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This file is currently used only by AIService.ts → CREATE_ROOF_BY_REGION intent.
 * It contains two known contract violations and one algorithmic inadequacy:
 *
 * 1. CONTRACT VIOLATION (Class C — 04-BIM-AI-MODIFICATION-PROTOCOL §3.1):
 *    Directly accesses `window.wallStore` instead of using AIReadModel or // TODO(TASK-08)
 *    the Store Event Bus. This breaks the AI layer's isolation contract.
 *
 * 2. CONTRACT VIOLATION (01-BIM-ENGINE-CORE-CONTRACT §1.2 Phase 2):
 *    This class is supposed to implement the Topology Layer (planar graph +
 *    cycle detection). The current implementation is a convex hull, not a
 *    planar graph. A convex hull cannot represent L-shaped, U-shaped, or
 *    courtyard buildings — it always produces the outermost rectangular
 *    approximation, which is wrong for any non-convex building.
 *
 * 3. ALGORITHMIC INADEQUACY:
 *    The Jarvis march (gift wrapping) convex hull algorithm cannot detect
 *    rooms or non-convex building perimeters. The class comment itself
 *    acknowledges: "In a real implementation, this would use a graph-based
 *    cycle detection."
 *
 * PLANNED REPLACEMENT (Phase E):
 *    Replace with a true Topology Layer implementing:
 *    - Planar graph construction from wall intersection nodes and edges
 *    - DFS cycle detection for room face identification
 *    - Outer face extraction for building perimeter (→ slab and roof polygon)
 *    - Driven via AIReadModel.getWallsByLevel() — no direct store access
 *
 * Until Phase E is implemented, this placeholder remains in use for the roof
 * creation feature. Do not copy its patterns elsewhere in the codebase.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as THREE from '@pryzm/renderer-three/three';
import { AIWall } from './AITypes.js';

export class WallRegionExtractor {
    /**
     * Extracts the outermost closed perimeter from a set of walls.
     *
     * @deprecated See file-level deprecation notice. This uses a convex hull,
     * not a planar graph. Produces incorrect results for non-convex buildings.
     * Replacement is tracked under Phase E of the PDF-to-BIM reconstruction plan.
     */
    static extractOutermostRegion(walls: AIWall[]): THREE.Vector2[] | null {
        if (walls.length < 3) return null;

        // CONTRACT VIOLATION: direct window.wallStore access.
        // This should use AIReadModel.getWallsByLevel() per 04-BIM §3.1.
        // Retained as-is pending Phase E replacement.
        const wallStore = window.wallStore; // TODO(TASK-08)
        if (!wallStore) return null;

        const levelId = walls[0]!.levelId;
        const levelWalls = wallStore.getByLevel(levelId);

        if (levelWalls.length < 3) return null;

        const points: THREE.Vector2[] = [];
        for (const wall of levelWalls) {
            if (wall.baseLine && wall.baseLine.length >= 2) {
                points.push(new THREE.Vector2(wall.baseLine[0].x, wall.baseLine[0].z));
                points.push(new THREE.Vector2(wall.baseLine[1].x, wall.baseLine[1].z));
            }
        }

        if (points.length < 3) return null;

        // Convex hull via Jarvis march (gift wrapping).
        // NOTE: This is NOT a room boundary algorithm. For convex buildings it
        // approximates the perimeter. For L-shaped or non-convex buildings it
        // will produce a hull that cuts across interior space.
        const hull: THREE.Vector2[] = [];

        let l = 0;
        for (let i = 1; i < points.length; i++) {
            if (points[i]!.x < points[l]!.x) l = i;
        }

        let p = l, q;
        do {
            hull.push(points[p]!);
            q = (p + 1) % points.length;

            for (let i = 0; i < points.length; i++) {
                const val =
                    (points[i]!.y - points[p]!.y) * (points[q]!.x - points[i]!.x) -
                    (points[i]!.x - points[p]!.x) * (points[q]!.y - points[i]!.y);
                if (val < 0) q = i;
            }

            p = q;
        } while (p !== l);

        return hull;
    }

    /**
     * §W2A-HULL-IS-NOT-A-PERIMETER (defect 5) — ADR-0299 §RECOVERY-MUST-REFUSE.
     *
     * ─────────────────────────────────────────────────────────────────────────
     * THE DEFECT
     * ─────────────────────────────────────────────────────────────────────────
     * This file's own header has said since it was written that "a convex hull
     * cannot represent L-shaped, U-shaped, or courtyard buildings". It said so,
     * and then returned the hull anyway — and `AIService.CREATE_ROOF_BY_REGION`
     * fed it straight into `CreateRoofCommand` as the building perimeter. On any
     * non-convex building the hull BRIDGES THE NOTCH: the roof is committed over
     * open air, and it then becomes the input to the eave offset and the
     * hip/mansard inward offsets (W2-A defects 1 and 2), so a wrong ring is
     * elaborated into a confidently wrong roof.
     *
     * A known-wrong answer that is returned anyway is not a placeholder. It is
     * the exact failure ADR-0299 forbids.
     *
     * ─────────────────────────────────────────────────────────────────────────
     * THE DISCRIMINATOR — AND WHY IT IS NOT "IS ANY POINT INSIDE THE HULL"
     * ─────────────────────────────────────────────────────────────────────────
     * Interior partition walls legitimately sit inside the perimeter, so
     * "something is inside the hull ⇒ non-convex" would refuse on every real
     * building. The honest test is the one the geometry actually claims:
     *
     *     IF the hull is the building perimeter, every hull EDGE runs along a
     *     WALL. A hull edge covered by nothing is a bridge across open air.
     *
     * So each hull edge is sampled and each sample must lie within `tolM` of
     * some wall centreline. The diagonal edge across an L's notch is covered by
     * nothing and is caught; a convex building passes unchanged.
     *
     * @returns `{ kind: 'perimeter' }` when the hull is defensible as the
     *          building perimeter, else `{ kind: 'refused', reason }`. The
     *          reason names the offending edge so the user can see WHERE.
     */
    static extractOutermostRegionResult(
        walls: AIWall[],
        tolM = 0.6,
    ):
        | { kind: 'perimeter'; polygon: THREE.Vector2[] }
        | { kind: 'refused'; reason: string } {
        const hull = this.extractOutermostRegion(walls);
        if (!hull || hull.length < 3) {
            return { kind: 'refused', reason: 'the walls do not form a closed region' };
        }

        const wallStore = window.wallStore; // TODO(TASK-08) — see file header §1
        const levelWalls = wallStore?.getByLevel(walls[0]!.levelId) ?? [];
        const segs: Array<[number, number, number, number]> = [];
        for (const w of levelWalls) {
            if (w.baseLine && w.baseLine.length >= 2) {
                segs.push([w.baseLine[0].x, w.baseLine[0].z, w.baseLine[1].x, w.baseLine[1].z]);
            }
        }
        if (segs.length === 0) {
            return { kind: 'refused', reason: 'no wall centrelines were readable on this level' };
        }

        const distToSeg = (px: number, pz: number, s: [number, number, number, number]): number => {
            const [ax, az, bx, bz] = s;
            const dx = bx - ax, dz = bz - az;
            const l2 = dx * dx + dz * dz;
            if (l2 < 1e-12) return Math.hypot(px - ax, pz - az);
            let t = ((px - ax) * dx + (pz - az) * dz) / l2;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
        };

        const SAMPLES = 12;
        for (let i = 0; i < hull.length; i++) {
            const a = hull[i]!;
            const b = hull[(i + 1) % hull.length]!;
            let uncovered = 0;
            for (let k = 1; k < SAMPLES; k++) {
                const t = k / SAMPLES;
                const px = a.x + (b.x - a.x) * t;
                const pz = a.y + (b.y - a.y) * t;
                let best = Infinity;
                for (const s of segs) {
                    const d = distToSeg(px, pz, s);
                    if (d < best) best = d;
                    if (best <= tolM) break;
                }
                if (best > tolM) uncovered++;
            }
            // A third of an edge with no wall under it is a bridge, not a rounding
            // artefact at a corner.
            if (uncovered > (SAMPLES - 1) / 3) {
                return {
                    kind: 'refused',
                    reason:
                        `the convex hull bridges open air between (${a.x.toFixed(2)}, ${a.y.toFixed(2)}) and ` +
                        `(${b.x.toFixed(2)}, ${b.y.toFixed(2)}): ${uncovered} of ${SAMPLES - 1} samples on that ` +
                        `edge have no wall within ${tolM} m. This building is NOT convex, and a convex hull ` +
                        `cannot represent an L-shaped, U-shaped or courtyard perimeter — it would put roof over ` +
                        `the notch. Refusing rather than committing a perimeter that is known to be wrong ` +
                        `(ADR-0299 §RECOVERY-MUST-REFUSE). A true planar-graph outer-face extraction is the fix ` +
                        `(Phase E, see this file's header).`,
                };
            }
        }

        return { kind: 'perimeter', polygon: hull };
    }
}
