/**
 * §PV-02-REPAIR-IS-INFERRED — the boundary-provenance decision, as a PURE function.
 *
 * C75 §2.3 / §7 exit condition 2. `RoomDetectionEngine.detectRoomsForLevel` used to
 * inline this decision inside a ~700-line method that needs a `WallStore`, a
 * `UiPreferences` singleton and a wall plan whose traced face happens to come back
 * self-intersecting. That made the ONE line that matters — which `detectionMethod`
 * a repaired ring is stamped with — unreachable from a test without reproducing a
 * §A.21.D58 upper-storey pinch out of wall coordinates. A rule that cannot be
 * tested is a convention, and C75 §2.8 ranks a convention last.
 *
 * So the decision is extracted here, whole, and the engine calls it. There is
 * exactly ONE site that decides whether a detected boundary is `auto-topology` or
 * `repaired-ring`, it is pure, and it is directly executable.
 *
 * ─── WHAT IS BEING DISTINGUISHED, AND WHY IT IS NOT COSMETIC ─────────────────
 * `auto-topology`  → C75 §1.1 **computed**. The wall graph entails this ring; the
 *                    same graph reproduces it. Nothing was chosen.
 * `repaired-ring`  → C75 §1.1 **inferred**. The face tracer emitted a
 *                    self-intersecting ring and `repairToSimplePolygon()`
 *                    substituted its largest simple sub-ring — a polygon the
 *                    topology NEVER TRACED, discarding vertices, so the room's true
 *                    extent may be larger than what is stored. Plausible, not
 *                    entailed.
 *
 * C75 §1.2 forbids merging those two, and C75 §0 Finding 4 is that merge caught in
 * the act: before 2026-08-12 both were written `detectionMethod: 'auto-topology'`
 * and the substitution was reported by `console.debug`. **The console is not the
 * model** (C75 §4.c) — it survives no reload, reaches no exporter, and answers no
 * question a user or a regeneration pass will later ask.
 *
 * ─── REFUSAL, AND WHY IT IS THE THIRD OUTCOME ────────────────────────────────
 * When the ring cannot be repaired at all there is no honest value to write, so
 * this returns a REFUSAL rather than a boundary — the
 * `SlabFragmentBuilder.ts:706` form (§REFUSE-NONSIMPLE-SLAB-RING, ADR-0299
 * §RECOVERY-MUST-REFUSE): refuse rather than emit "geometry that is wrong but
 * plausible enough to be read as a modelling quirk". C75 §2.3 names exactly these
 * two acceptable behaviours — record what you did, or refuse — and this function
 * returns one or the other and never a third thing.
 *
 * ─── WHAT THIS FILE DOES NOT DO ──────────────────────────────────────────────
 *  • It does not score confidence (C62 owns *how sure*; C75 owns *where from*).
 *  • It does not re-state the five-value L0 vocabulary. `RoomDetectionMethod` is a
 *    room-domain determination union that `ElementProvenanceIndex` TRANSLATES into
 *    `@pryzm/schemas`' `ValueOrigin`; C78 §8.6 / §13.1 forbid absorbing or aliasing
 *    C75's vocabulary, so it is referenced, never copied.
 *  • It does not decide whether the room is big enough, what colour it gets, or
 *    which walls bound it. Those stay in the engine; only the provenance decision
 *    moved.
 *
 * Strategic context — docs/02-decisions/contracts/C75-PROVENANCE.md §2.3, §7.2.
 */

import type { RoomBoundary, RoomVertex } from './RoomTypes';
import { ensureCCW, isSimple, repairToSimplePolygon } from './RoomPolygonUtils';

/**
 * The engine could not produce an honest boundary for this face and declined to
 * produce a dishonest one. Carries WHICH thing failed, in the C58/C64
 * member-per-cause idiom — a refusal that does not say what was wrong is only
 * marginally better than a silent drop.
 */
export interface RoomBoundaryRefusal {
    readonly refused: true;
    readonly reason: 'irreparably-self-intersecting';
    readonly detail: string;
}

export type RoomBoundaryResult =
    | { readonly refused: false; readonly boundary: RoomBoundary }
    | RoomBoundaryRefusal;

/** Narrowing helper so a caller reaches a boundary only by handling the refusal. */
export function isRoomBoundaryRefusal(
    r: RoomBoundaryResult,
): r is RoomBoundaryRefusal {
    return r.refused;
}

/**
 * Build a detected room's boundary from an already-sanitised traced ring, stamping
 * the provenance that is TRUE of it.
 *
 * @param sanitised   the ring as `sanitisePolygon` left it. MUTATED in the simple
 *                    case only insofar as `ensureCCW` rewinds it, matching the
 *                    engine's prior behaviour exactly.
 * @param levelHeight room clear height, passed through unchanged.
 *
 * Postconditions, which the test asserts rather than trusts:
 *  - a ring that was already simple → `detectionMethod: 'auto-topology'`, and
 *    **no** `detectionDetail` (there is nothing to explain; the member names the
 *    producer).
 *  - a ring that was repaired      → `detectionMethod: 'repaired-ring'` with a
 *    non-empty `detectionDetail` stating the vertex counts that were traded away.
 *  - a ring that could not be repaired → a refusal, never a boundary.
 */
export function buildDetectedRoomBoundary(
    sanitised: RoomVertex[],
    levelHeight: number,
): RoomBoundaryResult {
    let finalPolygon = sanitised;
    let repairDetail: string | undefined;

    if (!isSimple(sanitised)) {
        const repaired = repairToSimplePolygon(sanitised);
        if (!repaired) {
            // ADR-0299 §RECOVERY-MUST-REFUSE. There is no value here that is both
            // available and true, so none is written.
            return {
                refused: true,
                reason: 'irreparably-self-intersecting',
                detail:
                    `§A.21.D58 — a SELF-INTERSECTING traced ring (${sanitised.length} verts) could ` +
                    'not be reduced to any simple sub-ring. No boundary is emitted: a polygon we ' +
                    'cannot describe the origin of is worse than a missing room, because a missing ' +
                    'room is visibly missing (C75 §0.1).',
            };
        }
        repairDetail =
            `§A.21.D58 repair — the face tracer emitted a SELF-INTERSECTING ring (${sanitised.length} ` +
            `verts) and repairToSimplePolygon() substituted its largest simple sub-ring ` +
            `(${repaired.length} verts). This polygon was NOT traced by the topology: ` +
            `${sanitised.length - repaired.length} vertex/vertices were discarded, so the room's true ` +
            'extent may be larger than what is stored. Plausible, not entailed (C75 §1.1 `inferred`).';
        finalPolygon = repaired;
    }

    ensureCCW(finalPolygon);

    // Two different claims, two different members — never the same stamp, which is
    // what C75 §0 Finding 4 found happening here.
    const boundary: RoomBoundary = repairDetail === undefined
        ? {
            polygon: finalPolygon,
            height: levelHeight,
            baseOffset: 0,
            detectionMethod: 'auto-topology',
        }
        : {
            polygon: finalPolygon,
            height: levelHeight,
            baseOffset: 0,
            detectionMethod: 'repaired-ring',
            detectionDetail: repairDetail,
        };

    return { refused: false, boundary };
}
