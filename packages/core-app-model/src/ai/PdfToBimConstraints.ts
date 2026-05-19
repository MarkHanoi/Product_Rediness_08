/**
 * @file PdfToBimConstraints.ts
 * @description Centralised constraint definitions for the PDF-to-BIM pipeline.
 *
 * CONTRACT (04-BIM §3.1 Tool Layer):
 *  - NEVER mutates stores. NEVER calls builders. NEVER calls commandManager.execute().
 *  - Pure constants and pure utility functions ONLY.
 *  - Imported by FloorPlanCommandBatcher (post-processing) and FloorPlanAIFactory (prompts).
 *  - Zero coupling to Three.js, stores, or scene objects.
 *
 * ── Wall deduplication constraint ──────────────────────────────────────────────
 *
 * PARALLEL_WALL_MIN_SEP_M (0.70 m)
 *   Two nearly-parallel walls whose centrelines are less than 0.70 m apart are
 *   considered duplicate face-line traces of the SAME physical wall and the second
 *   one is discarded.
 *
 *   Rationale:
 *     Architectural floor plans draw exterior walls as two parallel lines with
 *     hatching between them (the wall cross-section). A poorly-tuned AI may report
 *     BOTH the inner face and the outer face as separate wall centre-lines.
 *     At typical BIM scales:
 *       - Exterior wall thickness: 0.20–0.40 m → face separation ≤ 0.40 m
 *       - Interior partition thickness: 0.08–0.20 m → face separation ≤ 0.20 m
 *       - Real parallel corridor walls: ≥ 0.80 m apart (standard minimum corridor)
 *     A threshold of 0.70 m safely covers all face-line duplicates without
 *     collapsing real parallel corridor walls (which are always ≥ 0.80 m apart).
 *
 * ── Door anatomy description ────────────────────────────────────────────────────
 *
 * DOOR_ANATOMY_DESCRIPTION
 *   A richly-detailed architectural description of the floor plan door symbol
 *   intended for injection into AI analysis prompts. It covers:
 *     1. The three visual components of a door symbol (jambs, leaf, swing arc).
 *     2. How to measure the gap width and gap midpoint.
 *     3. The wall-continuity principle: walls are never broken by doors in BIM —
 *        the opening is cut INTO the continuous wall after creation.
 *     4. Self-check steps the AI must complete before reporting each door.
 */

// ── Wall deduplication constant ─────────────────────────────────────────────────

/**
 * Minimum perpendicular separation (metres) between two accepted parallel walls
 * before the later wall is treated as a duplicate face-line trace and discarded.
 *
 * Any two nearly-parallel walls (angle difference < PARALLEL_ANGLE_TOL_DEG = 8°)
 * whose centrelines are closer than this threshold AND share ≥ 50% projected
 * overlap along the first wall's axis are considered the same physical wall.
 *
 * 0.70 m is chosen to be:
 *   • ABOVE the maximum realistic exterior wall thickness (≤ 0.40 m)
 *   • ABOVE the maximum realistic interior wall thickness (≤ 0.20 m)
 *   • BELOW the minimum real-world corridor / room separation (≥ 0.80 m)
 *
 * This prevents phantom duplicate walls from face-line artefacts while never
 * collapsing real parallel structural walls across a corridor or room boundary.
 */
export const PARALLEL_WALL_MIN_SEP_M = 0.70;

/**
 * Maximum angular difference (degrees) between two walls to be considered parallel
 * for the purposes of duplicate detection.
 */
export const PARALLEL_WALL_ANGLE_TOL_DEG = 8.0;

/**
 * Minimum fractional overlap along the primary wall's axis that the candidate
 * wall must share before it is treated as a duplicate face-line.
 * 0.50 = must overlap at least 50% of the shorter wall's length.
 */
export const PARALLEL_WALL_OVERLAP_RATIO = 0.50;

// ── Door anatomy AI prompt injection ───────────────────────────────────────────

/**
 * Detailed architectural description of the floor plan door symbol for AI prompts.
 *
 * This string is designed to be embedded verbatim into Stage B2 of the
 * FloorPlanAIFactory system prompt. It replaces or augments the DOOR SYMBOL ANATOMY
 * section to give the model precise, unambiguous instructions about:
 *   (a) What a door looks like in a 2D floor plan.
 *   (b) Where the centrePx must be placed (midpoint of the gap, ON the wall line).
 *   (c) The wall-continuity principle (walls are never broken by doors in the BIM model).
 */
export const DOOR_ANATOMY_DESCRIPTION = `
DOOR SYMBOL — COMPLETE ARCHITECTURAL ANATOMY (read every word before reporting any door):

A floor plan door is drawn using EXACTLY THREE visual components. All three must be present
before you report a door. If any component is missing, do NOT report a door.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPONENT 1 — THE WALL GAP (most important — find this FIRST)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A door can ONLY exist where there is a BREAK in the wall lines — a visible white space
where the wall stops and restarts. This break is called the DOOR GAP.

  • The gap is BOUNDED on each side by a DOOR JAMB.
  • A door jamb is a small filled rectangle or a short perpendicular stroke that sits
    flush with the wall face at the exact edge of the gap.
  • There are ALWAYS exactly TWO jambs — one at each end of the gap.
  • The pixel distance between the two jambs (measured along the wall direction) is the
    door opening width.

HOW TO LOCATE THE GAP:
  1. Scan the wall for a continuous white break in the wall lines.
  2. Identify the two small filled blocks or strokes at each edge of the break.
  3. Those two blocks are the jambs. The space between them is the door gap.
  4. If you cannot find a clear continuous white break — there is NO door here.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPONENT 2 — THE DOOR LEAF (straight line inside the gap)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The door leaf is a SINGLE STRAIGHT LINE drawn inside the gap, running parallel to the
wall face. It starts at one jamb and ends at the free (hinge) side of the door.

  • The door leaf's LENGTH equals the gap width (= jamb-to-jamb distance).
  • It shows the door panel in the fully-open position (90°).
  • It is a THIN single line — not the wall itself, not hatching.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPONENT 3 — THE SWING ARC (quarter-circle showing door travel)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The swing arc is a QUARTER-CIRCLE (90° arc) drawn from the free end of the door leaf
back to the wall face at the jamb. It shows the path that the free edge of the door
travels when the door opens from fully-closed (flush with the wall face) to fully-open
(the door leaf position).

  • The arc's RADIUS equals the door opening width (= gap between the two jambs).
  • The arc's CENTRE is at the pivot jamb (the jamb the door is hinged to).
  • The arc sweeps INTO THE ROOM — into the open space on one side of the wall.
  • The arc may be drawn with a solid line or a dashed line.
    - SOLID arc = door at the cutting plane level (standard).
    - DASHED arc = door below the cutting plane (e.g. cellar door, below-level door).
    Both types are valid doors — treat them identically.

CRITICAL: the swing arc is SECONDARY EVIDENCE. Do NOT work backwards from an arc to
a wall. ALWAYS find the gap in the wall first, then confirm the arc originates from
one of the jambs of that gap.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHERE TO PLACE centrePx — THE GAP MIDPOINT RULE (MANDATORY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
centrePx MUST be the EXACT MIDPOINT between the two jambs.

  Let jamb_A = pixel coordinates of the first jamb edge: (x1, y1)
  Let jamb_B = pixel coordinates of the second jamb edge: (x2, y2)

  centrePx.x = (x1 + x2) / 2
  centrePx.y = (y1 + y2) / 2

This point lies ON THE WALL CENTRELINE — it is midway along the door gap, equidistant
from both jambs.

DO NOT use:
  ✗ The visual centre of the swing arc bounding box.
  ✗ The centre of the arc radius circle.
  ✗ The midpoint of the door leaf.
  ✗ Any point that is NOT on the wall line itself.

The centrePx MUST be within 5px of the host wall's centreline. If your computed
centrePx is far from the wall line you have measured the arc centroid — discard that
value and re-measure from the jamb positions.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WALL CONTINUITY PRINCIPLE (critical for correct BIM placement)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
In the BIM model, WALLS ARE ALWAYS CONTINUOUS through door locations.
The door opening is CUT INTO the wall after the wall is created — the wall geometry
is never broken by a door. What you see as a gap in the floor plan drawing is the
VISUAL REPRESENTATION of the opening cut, not a physical break in the wall element.

This means:
  • You must ALWAYS assign a hostWallId — every door must belong to a continuous wall.
  • The wall you assign as the host PASSES THROUGH the door area completely.
  • The opening is positioned at the gap MIDPOINT (centrePx) along that continuous wall.
  • A door with no host wall cannot be placed — do NOT report it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY 6-STEP SELF-CHECK before reporting each door:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Step 1: Find the wall gap. Confirm you see a white break in the wall lines.
          If no gap → STOP. Do not report this door.
  Step 2: Find both jambs. Confirm two blocks/strokes bound the gap at each edge.
          If you cannot find two clear jambs → STOP.
  Step 3: Record jamb pixel coordinates: jamb_A = (x1, y1), jamb_B = (x2, y2).
  Step 4: Compute centrePx.x = (x1+x2)/2, centrePx.y = (y1+y2)/2.
          Verify this point lies ON the host wall centreline (within 5px).
  Step 5: Compute widthPx = sqrt((x2-x1)² + (y2-y1)²). This is the gap width.
  Step 6: Find the hostWallId from the confirmed wall list — the wall whose centreline
          passes through centrePx. Verify it is in the confirmed wall context.
          If no matching wall → STOP. Do not report this door.
`.trim();

// ── Utility: parallel-wall duplicate test ──────────────────────────────────────

/**
 * Returns true if `candidate` is a near-parallel duplicate of `accepted`.
 *
 * A candidate is a duplicate when ALL three conditions hold:
 *   1. The two walls are nearly parallel (angle difference < PARALLEL_WALL_ANGLE_TOL_DEG).
 *   2. The perpendicular distance between their centrelines is < PARALLEL_WALL_MIN_SEP_M.
 *   3. They share at least PARALLEL_WALL_OVERLAP_RATIO of projected length overlap.
 *
 * @param accepted       World-space start/end of the already-accepted wall (XZ plane).
 * @param candidate      World-space start/end of the candidate wall being tested.
 * @returns true if the candidate should be rejected as a duplicate.
 */
export function isParallelWallDuplicate(
    accepted: { startX: number; startZ: number; endX: number; endZ: number },
    candidate: { startX: number; startZ: number; endX: number; endZ: number },
): boolean {
    const aLen = Math.hypot(accepted.endX - accepted.startX, accepted.endZ - accepted.startZ);
    const bLen = Math.hypot(candidate.endX - candidate.startX, candidate.endZ - candidate.startZ);
    if (aLen < 0.01 || bLen < 0.01) return false;

    const aDx = (accepted.endX - accepted.startX) / aLen;
    const aDz = (accepted.endZ - accepted.startZ) / aLen;
    const bDx = (candidate.endX - candidate.startX) / bLen;
    const bDz = (candidate.endZ - candidate.startZ) / bLen;

    const dot = Math.abs(aDx * bDx + aDz * bDz);
    const angleDeg = (Math.acos(Math.min(1, dot)) * 180) / Math.PI;
    if (angleDeg > PARALLEL_WALL_ANGLE_TOL_DEG) return false;

    const toPtX = candidate.startX - accepted.startX;
    const toPtZ = candidate.startZ - accepted.startZ;
    const perpDist = Math.abs(toPtX * aDz - toPtZ * aDx);
    if (perpDist >= PARALLEL_WALL_MIN_SEP_M) return false;

    const proj0 = (candidate.startX - accepted.startX) * aDx + (candidate.startZ - accepted.startZ) * aDz;
    const proj1 = (candidate.endX   - accepted.startX) * aDx + (candidate.endZ   - accepted.startZ) * aDz;
    const overlapStart = Math.max(0,    Math.min(proj0, proj1));
    const overlapEnd   = Math.min(aLen, Math.max(proj0, proj1));
    const overlapLen   = overlapEnd - overlapStart;
    const minLen       = Math.min(aLen, bLen);

    return overlapLen >= minLen * PARALLEL_WALL_OVERLAP_RATIO;
}
