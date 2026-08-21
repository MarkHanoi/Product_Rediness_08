/**
 * §FINISH-FOLLOW-LATE-ATTRIBUTION (L-2090 · C79 §5 · C72 §5 · C78 §1.4)
 *
 * The composition-root half of the floor/ceiling follow repair. Supplies
 * `FinishHostDependencyTracker` with its `attributeLate` hook: given a finish
 * whose stored record carries NO host reference at all, decide whether the ONE
 * wall that just moved bounded it, and if so hand back the outer-loop edge list
 * the re-projection needs.
 *
 * ── WHY IT LIVES HERE AND NOT IN `@pryzm/finish-host-tracker` ────────────────
 * Because the attribution maths must be the SAME maths creation uses, and that
 * is `buildRoomFinishBoundarySketch` in `@pryzm/command-registry`
 * (`src/rooms/roomBoundarySketch.ts`) — the ONE builder `CreateFloorCommand` and
 * `CreateCeilingCommand` both run. C79 §7.4 forbids per-path divergence, and a
 * second copy of `_attributeEdge` inside the tracker package would be exactly
 * that: two implementations of one relationship, free to drift, each green
 * against its own tests. `finish-host-tracker` deliberately depends on two
 * packages only, so the dependency is INVERTED instead — the tracker declares a
 * hook, the composition root fills it. Same pattern, same reason, as the
 * `makeBoundaryCommand` factory next to it in `initTools.ts`.
 *
 * ── WHY IT IS NOT A MODULE-PRIVATE CLOSURE IN `initTools.ts` ─────────────────
 * `initTools.ts` needs a THREE world and twenty stores to run one line, so a
 * closure there is unreachable from every suite in the repository. That is the
 * measured reason `beamCreatedMirror.ts` and `roofCreatedMirror.ts` were
 * extracted (a hardcoded `loadBearing: false` survived unnoticed inside one).
 * This file is a pure function with injected inputs, and
 * `packages/finish-host-tracker/__tests__/finishLateAttribution.test.ts`
 * executes it.
 *
 * ── THE CONTRACT POSITION, stated because a reader will challenge it ─────────
 * C79 §2.2 forbids re-deriving attribution "by proximity, nearest-neighbour
 * search, coordinate matching, or any other after-the-fact geometric query".
 * The distinction §2.2 itself draws is not *whether geometry is consulted* —
 * `SlabRegionTracer` consults geometry too — but whether the CANDIDATE SET is
 * closed by construction or open. Here the candidate set is a SINGLETON: the
 * wall the user just moved, in its PRE-MOVE state. The question asked is not the
 * forbidden *"which wall bounds this edge?"* (whose wrong answer is §2.3's wrong
 * host) but *"did THIS wall bound this edge?"* — a yes/no with no alternative to
 * be confused with. `ambiguous` is unreachable: `_attributeEdge` can only report
 * it when two DIFFERENT candidates satisfy one edge, and there is one candidate.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 *  · It never runs against a record that already carries a host reference. The
 *    recorded relationship is the authority; this is a repair for records that
 *    have none (`RELATIONSHIP_NOT_RECORDED`). The tracker enforces this by only
 *    ever offering it members of its `unattributed` index; the guard below is
 *    belt-and-braces, not the mechanism.
 *  · It never attributes a CURVED host. `_attributeEdge` drops curved matches to
 *    `freeLine` (C79 §2.5 — curved fallback is PERMANENT because `WallFaceRef`
 *    cannot express "the 7th chord of this arc"), so `hostEdges` comes back 0 and
 *    this returns `null`. Stated rather than left to be rediscovered.
 *  · It is not a substitute for minting the relationship at creation. The three
 *    floor creation paths in this tree do not agree — `CreateFloorCommand`
 *    builds the sketch, while `plugins/floor/src/handlers/CreateFloor.ts:137`
 *    and the §P3.2-FL bus→legacy mirror in `initTools.ts` both write
 *    `boundingWallIds: []` and no sketch. That divergence is L-2091 and is NOT
 *    closed by this file.
 */

import { buildRoomFinishBoundarySketch } from '@pryzm/command-registry';
import type { FinishSketchEdge, IdentifiedFinishWall } from '@pryzm/command-registry';

/** The finish record surface this module reads. Structural, so a floor, a
 *  ceiling and a probe double all satisfy it without a cast. */
export interface LateAttributionRecord {
    id: string;
    boundary: { polygon: ReadonlyArray<{ x: number; z: number }> };
    sketch?: { outerLoop: { edges: ReadonlyArray<{ type: string }> } };
}

/** The PRE-MOVE wall snapshot (`prevState`, the §STEP7 third callback argument
 *  — C72 §3.1). NEVER the live wall: the store already holds the moved one, and
 *  attributing the old ring against the new centreline would diff a value
 *  against itself and report "no match" (C72 §3.5). */
export interface LateAttributionWall {
    id: string;
    baseLine: ReadonlyArray<{ x: number; y?: number; z: number }>;
    thickness?: number;
    curve?: { control: { x: number; z: number; y?: number }; segments?: number };
}

/** A room id that cannot collide with a real one — `buildRoomFinishBoundarySketch`
 *  requires a truthy `hostRoomId` to enter its candidate branch at all, and the
 *  lookup below answers for this key alone. */
const SINGLETON_ROOM_KEY = '__pryzm-late-attribution-singleton__';

/**
 * Attribute `rec`'s stored ring against `prevWall` ALONE.
 *
 * @returns the outer-loop edge list, index-aligned with `rec.boundary.polygon`
 *          (edge `i` runs `polygon[i] → polygon[(i+1) % n]`), in which the edges
 *          this wall produced are `hostReference` and every other edge is
 *          `freeLine`; or `null` when the wall bounded no edge of it, the ring
 *          is degenerate, the record is already attributed, or the wall snapshot
 *          cannot be read.
 */
export function attributeFinishAgainstMovedWall(
    rec: LateAttributionRecord,
    prevWall: LateAttributionWall,
): FinishSketchEdge[] | null {
    // Already attributed → the recorded relationship is the authority. Never
    // overwrite a recorded reference with a re-derived one (C79 §2.2/§2.3).
    const recorded = rec.sketch?.outerLoop.edges;
    if (recorded && recorded.some((e) => e.type === 'hostReference')) return null;

    const ring = rec.boundary?.polygon;
    if (!ring || ring.length < 3) return null;

    const w0 = prevWall.baseLine?.[0];
    const w1 = prevWall.baseLine?.[prevWall.baseLine.length - 1];
    if (!w0 || !w1 || prevWall.baseLine.length < 2) return null;

    // A non-finite thickness would poison `_attributeEdge`'s perpendicular band
    // (`PERP_TOL_M + thickness / 2` → NaN → every comparison false → silently no
    // match). Zero is the honest floor: the band degrades to the join-trim
    // tolerance alone, which is a NARROWER test, never a wider one.
    const thickness = Number.isFinite(prevWall.thickness) ? (prevWall.thickness as number) : 0;

    const candidate: IdentifiedFinishWall = {
        id: prevWall.id,
        baseLine: [{ x: w0.x, z: w0.z }, { x: w1.x, z: w1.z }],
        thickness,
        ...(prevWall.curve ? { curve: prevWall.curve } : {}),
    };

    const sketch = buildRoomFinishBoundarySketch(
        ring.map((v) => ({ x: v.x, z: v.z })),
        SINGLETON_ROOM_KEY,
        {
            getRoomById: (id) => (id === SINGLETON_ROOM_KEY ? { boundingWallIds: [prevWall.id] } : undefined),
            getWallById: (id) => (id === prevWall.id ? candidate : undefined),
        },
    );

    // §2.6 — zero-host and some-host are different readings, and this is the
    // caller that acts on the difference. Zero means "this wall bounds no edge of
    // this finish", which is a real answer and is reported as one by the tracker.
    if (sketch.attribution.hostEdges === 0) return null;

    return sketch.outerLoop.edges;
}
