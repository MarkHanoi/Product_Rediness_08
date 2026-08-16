/**
 * §FIX-WALL-CREATE-ON-HOST-FACE — a wall drawn onto another wall's BODY is AUTHORED at the
 * host FACE (L-929, closing the reachability half of L-919).
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * WHAT WENT WRONG, AND WHY THE OBVIOUS PLACE IS THE WRONG PLACE.
 *
 * L-919 put the body-penetration retreat in `WallJoinResolver._applyT`. The math is right,
 * it fires at production snapRadius, and it is bounded by the HOST's thickness rather than
 * the camera — but it is DISCARDED one hop later and the fix shipped inert.
 * `WallRebuildCoordinator._flush` anchors every moved, authored-valid wall back to its
 * authored line (`§FIX-WALL-JOIN-BASELINE-IMMUTABLE`, :1770 / :1804 / :1822 / :1894 / :1930)
 * and hands `buildWall` the un-retreated centreline (:1972). Only the miter normals survive
 * — a cap-plane ORIENTATION which `MiterPrismBuilder` anchors at `centerlineStart`, i.e.
 * `hostHalfT` INSIDE the host solid. Measured, both halves, in
 * `apps/editor/__tests__/wallCreateOnHostBodyStoredBaseline.test.ts` (§MEASURED-RETREAT-
 * DISCARDED, committed alone before this file existed).
 *
 * THAT DISCARD IS NOT A BUG. §FIX-WALL-JOIN-BASELINE-IMMUTABLE is a deliberate founder
 * invariant (L-44 / L-46 / L-47): a join re-resolve is a RENDER-TIME footprint operation and
 * may NEVER mutate a stored baseline — because when it did, a nearby create shrank an
 * unrelated wall (L-47), a type change shrank a wall (L-46), and a committed 3-wall T
 * diverged from its own clean preview (L-44). A body-T retreat is a genuine LENGTH change,
 * so it can never be delivered through `resolveLevel` AT ALL. Re-routing it there would be
 * re-opening three closed founder defects to close a fourth.
 *
 * SO THE RETREAT IS AUTHORED AT CREATION. The authored line then already terminates at the
 * face, and immutability DEFENDS it instead of reverting it. Both pipelines read the same
 * stored `baseLine`, so both are fixed by one write, and the result is zoom-independent.
 *
 * ─── C83 §10.2.3 — THE SNAP POINT DOES NOT MOVE ─────────────────────────────────────────
 *
 * The founder ruled on this explicitly and `WallJoinResolver.ts:3050-3056` already states
 * it. Snapping to a host CENTRELINE (or midpoint) is CORRECT and useful: it is the feature
 * the user aimed at, and it is what drives the snap indicator and the on-screen dimension
 * readout. Offsetting the snap would corrupt both the user's intent and the numbers they are
 * reading. **Only the AUTHORED GEOMETRY terminates at the face.** Nothing in this file is
 * reachable from the snapping package or the preview overlay, by construction — it operates
 * on committed store records, after the gesture is over.
 *
 * ─── WHY THIS DERIVES GEOMETRICALLY INSTEAD OF READING THE SNAP RESULT ──────────────────
 *
 * Reading the snap would be better IF the snap reached the commit. It does not, and for the
 * surface that matters most it CANNOT without a separate piece of work:
 *
 *   • The 3D `WallTool` genuinely knows — `SnapCandidate{ type: CENTERLINE|EDGE|FACE,
 *     sourceId, metadata:{ wallId, t, refType } }`, and it even retains a richer
 *     `WallAnchor{ wallId, type, t, normal, side }` on `WallTool.startAnchor`. Both are
 *     dropped: `getSnappedPoint` returns a bare `Vector3` (`WallTool.ts:1081/1093`) and
 *     `createWall` never reads `startAnchor` (`WallTool.ts:1729/1770`).
 *   • The PLAN-VIEW tool — which is how interior partitions are actually drawn, and the
 *     surface of the founder's report — does NOT know. `PlanSnapEngine` builds its wall
 *     candidates from projected `LineSegments` geometry and assigns `sourceId` ONLY for grid
 *     snaps; `PlanSnapType` has no `centerline`/`edge`/`face` member at all. The host id is
 *     not dropped there, it was never computed.
 *   • Copy / mirror / offset / `wall.batch.create` / AI generation have no gesture at all.
 *
 * Threading a field through the one producer that knows would fix 1 of 6 — the EXACT defect
 * L-927's census measured and closed for `joinIntent`, and the exact shape of the three
 * committed-but-unreachable fixes that preceded this lane. So the fact is derived where
 * every producer necessarily passes, from the same committed-sibling set `deriveJoinIntent`
 * already uses. When a producer later carries a declared host, an explicit stamp should win
 * over this derivation, exactly as an explicit `joinIntent` already does.
 *
 * ─── THE BOUNDS ARE THE RESOLVER'S OWN, DELIBERATELY ────────────────────────────────────
 *
 * Every refusal below is copied in SUBSTANCE from `WallJoinResolver._applyT` so that the two
 * can never disagree about what counts as a T-join: the depth cap (one host thickness) and
 * the grazing cap (`penetration / sin 30°`, expressed as the ratio it always was — L-928).
 * If `_applyT` refuses a configuration, this must refuse it too, or creation would author a
 * line the resolver then treats as an un-joined clash.
 */

import type { Point3D } from '@pryzm/core-app-model';
import { COINCIDENT_M } from '@pryzm/geometry-kernel';
import { JOIN_INTENT_EPS } from './WallJoinIntentStamp';

/**
 * Mirrors `WallJoinResolver.DEFAULT_MIN_WALL_LENGTH` and `WallJoinResolver.CLASH_EPS_M`.
 *
 * NOT imported from there ON PURPOSE: `WallJoinResolver` pulls in THREE and `SpatialGrid`,
 * and this module is loaded by `WallStore` — the lowest-level wall record holder. Dragging a
 * renderer-weight module into the store's import graph to fetch two numbers is how barrel
 * cycles and module-load-order faults get minted here (SCC: no barrel access at module load).
 *
 * A copied constant is a drift hazard, so it is guarded STRUCTURALLY rather than by this
 * comment: `WallHostBodyRetreat.measure.test.ts` imports both modules and asserts the values
 * are equal. If either moves, that test reddens.
 */
const MIN_WALL_LENGTH_M = 0.05;
const CLASH_EPS_M = 0.0015;

/** sin 30° — the approach band `_applyT`'s own derivation declares. Not a tolerance. */
const GRAZING_SIN_MIN = 0.5;

/**
 * The minimum this needs from a wall — deliberately narrow so it is trivially testable, and
 * a superset of {@link import('./WallJoinIntentStamp').JoinIntentCandidate} by design.
 */
export interface HostBodyCandidate {
    id: string;
    levelId: string;
    thickness: number;
    baseLine: readonly [Point3D, Point3D] | Point3D[];
}

/** Which end retreated, from where, to where, and against which host. Diagnostics + tests. */
export interface HostBodyRetreat {
    end: 'start' | 'end';
    hostId: string;
    /** Perpendicular depth of the authored endpoint inside the host solid, metres. */
    penetration: number;
    /** Distance the endpoint travelled along the NEW wall's own axis, metres. */
    alongTrim: number;
    from: Point3D;
    to: Point3D;
}

export interface HostBodyRetreatResult {
    baseLine: [Point3D, Point3D];
    retreats: HostBodyRetreat[];
}

const sub2 = (a: Point3D, b: Point3D) => ({ x: a.x - b.x, z: a.z - b.z });
const dot2 = (a: { x: number; z: number }, b: { x: number; z: number }) => a.x * b.x + a.z * b.z;
const len2 = (a: { x: number; z: number }) => Math.hypot(a.x, a.z);

/**
 * Retreat any endpoint of `wall` that was authored INSIDE a sibling wall's solid back onto
 * that sibling's near FACE, along the new wall's OWN axis.
 *
 * Pure. Returns the original baseline (same values, fresh objects) when nothing qualifies —
 * so the caller can always use the result unconditionally.
 *
 * @param existing Walls ALREADY committed on this level. Must not include `wall`; filtered
 *                 defensively by id anyway.
 * @param wall     The wall being created, at its as-drawn baseline.
 */
export function retreatOntoHostFaces(
    existing: readonly HostBodyCandidate[],
    wall: HostBodyCandidate,
): HostBodyRetreatResult {
    const p0 = wall.baseLine[0];
    const p1 = wall.baseLine[1];
    const out: [Point3D, Point3D] = [
        { x: p0.x, y: p0.y, z: p0.z },
        { x: p1.x, y: p1.y, z: p1.z },
    ];
    const retreats: HostBodyRetreat[] = [];

    const siblings = existing.filter(
        w => w.levelId === wall.levelId && w.id !== wall.id
             && Number.isFinite(w.thickness) && w.thickness > 0
             && !!w.baseLine?.[0] && !!w.baseLine?.[1],
    );
    if (siblings.length === 0) return { baseLine: out, retreats };

    // ── GUARD 1: an endpoint sitting on a committed wall ENDPOINT is a CORNER, not a body
    // landing. `deriveJoinIntent` owns that case and the corner resolver mitres it; moving it
    // here would break committed mitres. Same 20 mm radius, deliberately — one question, one
    // epsilon.
    const isOnSomeEndpoint = (p: Point3D): boolean => {
        for (const s of siblings) {
            for (const e of [s.baseLine[0], s.baseLine[1]]) {
                if (!e) continue;
                if (Math.hypot(e.x - p.x, e.z - p.z) <= JOIN_INTENT_EPS) return true;
            }
        }
        return false;
    };

    for (const side of ['start', 'end'] as const) {
        const iJoin = side === 'start' ? 0 : 1;
        const iFree = side === 'start' ? 1 : 0;
        const joinP = out[iJoin];
        const freeP = out[iFree];

        if (isOnSomeEndpoint(joinP)) continue;

        // The new wall advances from its FREE end toward the joining end. This axis — not the
        // host's — is the one the retreat travels along, so the wall never moves LATERALLY off
        // the line the user drew. Only its LENGTH changes.
        const along = sub2(joinP, freeP);
        const alongLen = len2(along);
        if (alongLen < MIN_WALL_LENGTH_M) continue;
        const u = { x: along.x / alongLen, z: along.z / alongLen };

        let best: (HostBodyRetreat & { newP: Point3D }) | null = null;

        for (const host of siblings) {
            const h0 = host.baseLine[0];
            const h1 = host.baseLine[1];
            const axis = sub2(h1, h0);
            const hLen = len2(axis);
            if (hLen < 1e-9) continue;
            const a = { x: axis.x / hLen, z: axis.z / hLen };
            // XZ perpendicular of the host axis.
            const n = { x: a.z, z: -a.x };
            const halfT = host.thickness / 2;

            const rel = sub2(joinP, h0);
            const s = dot2(rel, a);              // distance along the host from h0
            const d = dot2(rel, n);              // signed perpendicular offset from the centreline

            // ── GUARD 2: must be INSIDE the host's solid band. |d| >= halfT is outside the
            // solid — that is the REACH case (an endpoint short of the face, in open space),
            // which is properly bounded by how close the user aimed and therefore belongs to
            // the resolver's camera-aware §T-JOIN-PERP-GATE, not to creation. Untouched here.
            if (Math.abs(d) >= halfT) continue;

            // ── GUARD 3: must land on the host's BODY, not past either end cap.
            if (s <= 0 || s >= hLen) continue;

            // ── GUARD 4: the approach side is decided by where the wall COMES FROM. A free
            // end sitting on the host centreline (|dFree| ~ 0) names no side, and a wall
            // running ALONG its host is an authoring collision rather than a junction.
            const dFree = dot2(sub2(freeP, h0), n);
            if (Math.abs(dFree) <= COINCIDENT_M) continue;
            const sign = dFree > 0 ? 1 : -1;

            // The near face: the one the newcomer approaches from.
            const faceN = { x: n.x * sign, z: n.z * sign };
            const signedGap = d * sign - halfT;          // < 0 ⇒ inside the solid
            const penetration = -signedGap;
            if (penetration <= COINCIDENT_M) continue;   // already at/outside the face — nothing to do

            // Retreating along the newcomer's OWN axis costs penetration / sin(approach).
            const uDotFace = dot2(u, faceN);
            if (uDotFace >= -1e-9) continue;             // not advancing into this face
            const alongTrim = penetration / Math.abs(uDotFace);

            // ── GUARD 5 (depth) — `_applyT` arm 1. Deeper than one host thickness means the
            // wall emerged out the FAR side: a CROSSING, not a T-join, and not something an
            // axial trim to this face expresses. Left alone, exactly as the resolver leaves it.
            if (penetration > host.thickness + CLASH_EPS_M) continue;

            // ── GUARD 6 (grazing) — `_applyT` arm 2, as the RATIO it always was (L-928):
            // `alongTrim <= penetration / sin 30°`, floored at one thickness so shallow
            // penetrations are not tightened.
            const alongCap = Math.max(host.thickness, penetration / GRAZING_SIN_MIN);
            if (alongTrim > alongCap + COINCIDENT_M) continue;

            const newP: Point3D = {
                x: joinP.x - u.x * alongTrim,
                y: joinP.y,
                z: joinP.z - u.z * alongTrim,
            };

            // ── GUARD 7: never author a degenerate stub. §RESOLVED-STUB-SWEEP would flag it
            // invalid and the builder would SKIP it — the wall would VANISH.
            if (Math.hypot(newP.x - freeP.x, newP.z - freeP.z) < MIN_WALL_LENGTH_M) continue;

            // Deepest clash wins; id breaks ties so the result never depends on Set order.
            if (!best
                || penetration > best.penetration + 1e-12
                || (Math.abs(penetration - best.penetration) <= 1e-12 && host.id < best.hostId)) {
                best = {
                    end: side, hostId: host.id, penetration, alongTrim,
                    from: { x: joinP.x, y: joinP.y, z: joinP.z }, to: newP, newP,
                };
            }
        }

        if (best) {
            out[iJoin] = { x: best.newP.x, y: best.newP.y, z: best.newP.z };
            const { newP: _drop, ...rec } = best;
            retreats.push(rec);
        }
    }

    // Both ends may retreat independently; the pair must still be a real wall.
    if (retreats.length === 2
        && Math.hypot(out[1].x - out[0].x, out[1].z - out[0].z) < MIN_WALL_LENGTH_M) {
        return {
            baseLine: [
                { x: p0.x, y: p0.y, z: p0.z },
                { x: p1.x, y: p1.y, z: p1.z },
            ],
            retreats: [],
        };
    }

    return { baseLine: out, retreats };
}
