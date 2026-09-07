/**
 * roomDrawPlan — §ROOM-DRAW-NEW (L-13120). THE ONE ASKER FOR *"may this drawn rectangle
 * become a room, and what would it mean if it did?"*
 *
 * Layer Affected:  UI — room programme (L7). PURE: no DOM, no THREE, no store, no bus, no
 *                  clock, no RNG (the id is minted by the CALLER — C16 CA-2). Never throws.
 * File:            apps/editor/src/ui/room-programme/roomDrawPlan.ts
 * Strategy:        STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §9 · §10 · §25.5 · §26.6.7
 * Contracts:       C83 §1.2 / C58 (a refusal carries BOTH numbers, and never clamps) ·
 *                  C84 EI-8a (no second copy of a predicate) · C06 §13.3 (one producer per
 *                  live figure) · C114 §12 (room ⊂ level) · C52 §3 (session override → re-run)
 *
 * Founder 2026-09-07: *"This room locator needs to be more flexible and more dynamic — I shall
 * be able to reorganize also the rooms on the plan view — draw them etc."*
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE HARD PART WAS NEVER THE GESTURE. IT IS WHAT HAPPENS WHEN THE SHAPE IS WRONG.
 * ─────────────────────────────────────────────────────────────────────────────
 * §ROOM-PIN gave the user the ORDER; §ROOM-WALL-DRAG gave him the FOOTPRINT of rooms that
 * already exist, and it was scoped to a PARTY WALL for a reason worth restating: moving a shared
 * wall gives one room exactly what it takes from the other, so it cannot leave a gap or an
 * overlap. A drawn rectangle has no such guarantee. It can hang over the edge of the storey, it
 * can land on top of three rooms at once, and it can ask for more floor than the plate has left.
 *
 * So this module is mostly a TAXONOMY, and the taxonomy is the founder's own
 * (§SPATIAL-VALIDITY-RULES, 2026-08-14) — IMPOSSIBLE ≠ INADVISABLE ≠ FINE, keyed on what the
 * thing MEANS and not on raw geometry, and it ASKS rather than silently correcting:
 *
 *   · OUTSIDE THE LEVEL ENVELOPE — IMPOSSIBLE. C114 §12 makes a room a subset of its level;
 *     a room off the plate is not a room. REFUSED with both numbers. ⛔ Quietly keeping the part
 *     that fits would be the worse failure of the two: it reports a room the user did not draw
 *     as one he did (C83 — never clamp).
 *   · SMALLER THAN THE KIND'S FLOOR — IMPOSSIBLE, and refused HERE rather than later, because
 *     `solveProgrammeLayout` refuses the whole layout on `room-below-minimum`. One bad rectangle
 *     must not cost the user the plan he was drawing on.
 *   · BIGGER THAN THE UNALLOCATED PLATE — IMPOSSIBLE, same reasoning against
 *     `programme-exceeds-level`. ⭐ AND IT IS THE CLAUSE THAT DEFINES THE GESTURE: a drawn room
 *     takes its floor from the storey's FREE area and never from its neighbours. That is this
 *     gesture's conservation invariant, the counterpart of the wall drag's — the wall drag moves
 *     area between two rooms and changes no total; the draw consumes only what nothing else
 *     claims. Between them the two gestures cannot silently shrink a room the user did not touch.
 *   · DRAWN OVER EXISTING ROOMS — INADVISABLE, NOT IMPOSSIBLE, and therefore NOT REFUSED. The
 *     solver PARTITIONS the plate: nothing overlaps in its output, so a rectangle straddling three
 *     cells is not a contradiction — it is a request whose result will not look like the
 *     rectangle. The verdict SAYS SO, in the live message, before the user lets go. He decides by
 *     releasing. Refusing here would be the system substituting its taste for his.
 *
 * ⛔ EVERY REFUSAL CARRIES ITS OWN WAY OUT (§REFUSING-HALF-NEEDS-ITS-ESCAPE-HATCH, L-942): a
 * refusal whose yes-branch is unreachable is *"a regression with a citation attached"*. So the
 * verdict measures `largestDrawableM2` — the biggest room this very function would accept on this
 * plate right now — and when that is ZERO it says the dead end is a dead end and names the three
 * gestures that open it, rather than printing a number that looks like an invitation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ HOW "ONE ASKER" IS ACHIEVED LITERALLY, NOT BY DISCIPLINE
 * ─────────────────────────────────────────────────────────────────────────────
 * C84 EI-8a forbids a second copy of a predicate — a panel that re-derives *"is this allowed?"*
 * beside the reducer that decides it is how a control comes to say one thing and do another.
 * `describePairResize` obeys that by being called from both sides. This function goes further:
 *
 *   1. it REDUCES the very intent the panel will dispatch, with `reduceRoomProgramme`, and
 *   2. it RE-SOLVES the result, through `probeProgrammeLayout` — `solveProgrammeLayout`'s OWN
 *      body with the policy search truncated at the first feasible partition, so the ok/refused
 *      verdict and the refusal CODE are identical and only the cost differs (that truncation is
 *      not an optimisation of taste: the full solve is 14.7 ms per pointer move at four rooms and
 *      37.3 ms at twenty, against a 16.7 ms frame budget — benched, not assumed), and
 *   3. on a refusal it hands back the SOLVER'S OWN code and statement, verbatim, and
 *   4. it RETURNS THE INTENT in the verdict — so the panel cannot dispatch anything this
 *      function did not authorise, because the panel never builds one.
 *
 * The consequence is that the local tests above are not a rival ruleset: they exist to produce a
 * BETTER SENTENCE for the three cases a user actually meets, and step 2 remains the authority for
 * everything else — a concave plate the bisection cannot cut, a pin collision, a future rule this
 * file has never heard of. If the solver learns a new refusal tomorrow, this gesture inherits it.
 *
 * ⚠ WHAT IS NOT BUILT, SAID PLAINLY SO NOBODY READS MORE INTO IT. This is not a freehand
 * vertex-by-vertex boundary tool, and one is not expressible: `solveProgrammeLayout` PARTITIONS
 * the plate, so a cell's ring is a pure function of the areas and the order, and an authored ring
 * would be re-solved away on the user's next keystroke (the defect L-13079 names). A drawn
 * rectangle therefore contributes the two things the solver can keep — an AREA and a POSITION IN
 * THE ORDER — and the panel says out loud that the room lands where those put it. The rectangle
 * is a way of SAYING those two numbers, not a boundary that is stored.
 */

import { intersectPolygons2D } from '@pryzm/geometry-kernel';
import { footprintAreaM2, type EnvelopePoint } from '@pryzm/geometry-space-envelope';
import { residentialRoomEntry, type ResidentialRoomKind } from './residentialRoomLibrary';
import {
  reduceRoomProgramme,
  type RoomProgramme,
  type RoomProgrammeIntent,
} from './roomProgrammeModel';
import {
  probeProgrammeLayout,
  type ProgrammeLayout,
  type ProgrammeLayoutRefusalCode,
} from './programmeToEnvelopes';

// ─────────────────────────────────────────────────────────────────────────────
// THE NUMBERS THIS MODULE DECIDES — each one named where it is chosen
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How much of a drawn rectangle may fall outside the level ring and still count as inside, m².
 *
 * ⚠ IT IS A FLOAT TOLERANCE, NOT A GRACE ALLOWANCE. The kernel boolean rounds coordinates to
 * 1e-6 m, so on a 24 m plate the clipped-area residue is far below a square millimetre; 1e-3 m²
 * is three orders of magnitude of headroom above that and still one ten-thousandth of the
 * smallest room floor in the library. A rectangle that genuinely hangs over the edge misses this
 * by centimetres at worst, and is refused.
 */
export const DRAW_INSIDE_EPSILON_M2 = 1e-3;

/**
 * The share of a drawn rectangle that must lie on ONE room's cell before the drawing is taken to
 * be pointing at that room's position in the order.
 *
 * ⭐ WHY A MAJORITY AND NOT A CENTROID OR A NEAREST-CELL. A rectangle more than half of which
 * sits on one room is unambiguously pointing at it. One spread across three cells and the
 * unallocated remainder is not pointing anywhere in particular, and seating it somewhere anyway
 * would be — in `applyPinnedOrder`'s own words about the failure it refuses — *"a position you
 * did not choose, presented as one you did"*. Below this share the room is added UNPINNED, which
 * is the documented default for every other new room, and the panel says so.
 */
export const DRAW_PIN_MAJORITY = 0.5;

// ─────────────────────────────────────────────────────────────────────────────
// I/O
// ─────────────────────────────────────────────────────────────────────────────

/** A rectangle the user dragged out, in WORLD METRES on the level's own plane. Un-normalised. */
export interface DrawnRect {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
}

/** One room the drawn rectangle landed on. INADVISABLE, not impossible — reported, not refused. */
export interface DrawnRoomOverlap {
  readonly roomId: string;
  readonly name: string;
  /** How much of the rectangle lies on that room's cell, m². */
  readonly areaM2: number;
}

/**
 * Why a drawing was refused. Every member is a sentence the panel has to be able to speak, and
 * `solver-refused` is the arm that carries whatever `solveProgrammeLayout` said instead.
 */
export type DrawnRoomRefusalCode =
  /** A click, or a drag of no extent — there is no rectangle to measure. */
  | 'nothing-drawn'
  /** Not one square metre of it is on the plate. */
  | 'outside-level'
  /** Part of it hangs over the storey's edge. Refused whole; never trimmed to fit. */
  | 'partly-outside-level'
  /** Smaller than PRYZM's floor for that kind of room. */
  | 'below-minimum'
  /** Bigger than the storey's UNALLOCATED area. A drawn room never takes from its neighbours. */
  | 'exceeds-free-plate'
  /** The solver refused the resulting programme. Its own code and statement are carried through. */
  | 'solver-refused';

export interface DrawnRoomVerdict {
  readonly ok: boolean;
  readonly code: DrawnRoomRefusalCode | null;
  /** The solver's own code when `code === 'solver-refused'`; otherwise null. */
  readonly solverCode: ProgrammeLayoutRefusalCode | null;
  /**
   * Plain language, both numbers where there are two, and the way out. Shown to the user
   * VERBATIM — during the drag as a proposal, on release as the reason nothing happened.
   */
  readonly statement: string;
  /** What the rectangle measures, m². */
  readonly drawnAreaM2: number;
  /** How much of it is inside the level envelope, m². */
  readonly insideAreaM2: number;
  /** PRYZM's floor for this kind of room, m². The second of C83's two numbers. */
  readonly floorAreaM2: number;
  /** The storey's unallocated area, m² — the only floor a drawn room may consume. */
  readonly freeAreaM2: number;
  /** L-942 — the largest room this function would accept here, m². 0 ⇒ an honest dead end. */
  readonly largestDrawableM2: number;
  /** The rooms drawn over, largest share first. Advisory: present on an ACCEPTED verdict too. */
  readonly overlaps: readonly DrawnRoomOverlap[];
  /** The position the room will actually take, or null for the solver's choice. */
  readonly pinnedOrder: number | null;
  /**
   * ⭐ THE INTENT ITSELF, so the panel cannot dispatch one this function did not authorise.
   * Null on every refusal.
   */
  readonly intent: RoomProgrammeIntent | null;
}

export interface DrawnRoomInput {
  /** The LEVEL envelope's own footprint. Never re-derived here (§25.11 clause 1). */
  readonly levelRing: readonly EnvelopePoint[];
  readonly programme: RoomProgramme;
  /**
   * The layout the user is LOOKING AT. The overlaps and the position are read off the plan on
   * screen, not off a re-solve — so "you drew over Living" names the cell he actually drew over.
   */
  readonly layout: ProgrammeLayout;
  readonly kind: ResidentialRoomKind;
  readonly rect: DrawnRect;
  /** The id the new room will carry. Minted by the CALLER (C16 CA-2) — this module never mints. */
  readonly id: string;
  readonly name?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// GEOMETRY — through the kernel's ONE boolean, never a sixth Sutherland–Hodgman
// ─────────────────────────────────────────────────────────────────────────────

/** ⚠ MUTABLE ON PURPOSE — the KERNEL's spelling. See `programmeToEnvelopes.ts`'s note on `Pt2`. */
type Pt2 = [number, number];

const round2 = (n: number): number => Math.round(n * 100) / 100;
/** Round DOWN to a centimetre-squared: a stated ceiling must be one the user can actually reach. */
const floor2 = (n: number): number => Math.floor(n * 100) / 100;

function rectCorners(r: DrawnRect): Pt2[] {
  const x0 = Math.min(r.x0, r.x1);
  const x1 = Math.max(r.x0, r.x1);
  const z0 = Math.min(r.z0, r.z1);
  const z1 = Math.max(r.z0, r.z1);
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
}

/** The area shared by the rectangle and a ring, m². 0 when they miss, or when the clip refuses. */
function overlapAreaM2(rect: Pt2[], ring: readonly EnvelopePoint[]): number {
  if (ring.length < 3) return 0;
  const res = intersectPolygons2D(ring.map((p) => [p.x, p.z] as Pt2), rect);
  if (!res.ok) return 0;
  let total = 0;
  // ⭐ EVERY LOOP IS SUMMED, not just the first. A concave storey can meet one rectangle in two
  // separate pieces; taking one of them would UNDER-report how much is inside, which turns an
  // acceptable drawing into a refusal — a refusal is only honest if its number is.
  for (const loop of res.loops) {
    if (loop.length < 3) continue;
    total += footprintAreaM2(loop.map(([x, z]) => ({ x, y: 0, z })));
  }
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE ONE ASKER
// ─────────────────────────────────────────────────────────────────────────────

function refuse(
  code: DrawnRoomRefusalCode,
  statement: string,
  base: Omit<DrawnRoomVerdict, 'ok' | 'code' | 'statement' | 'intent' | 'solverCode'>,
  solverCode: ProgrammeLayoutRefusalCode | null = null,
): DrawnRoomVerdict {
  return { ...base, ok: false, code, solverCode, statement, intent: null };
}

/**
 * May this drawn rectangle become a room — and, if it may, what will it actually do?
 *
 * Total, pure, never throws. Returns the intent to dispatch on an accepted verdict and `null` on
 * every refusal, so there is exactly one place a drawn room can be authorised.
 */
export function describeDrawnRoom(input: DrawnRoomInput): DrawnRoomVerdict {
  const { levelRing, programme, layout, kind, rect, id } = input;
  const lib = residentialRoomEntry(kind);
  const label = lib?.label.toLowerCase() ?? kind;
  const floorAreaM2 = lib?.minAreaM2 ?? 0;

  const corners = rectCorners(rect);
  const widthM = Math.abs(rect.x1 - rect.x0);
  const depthM = Math.abs(rect.z1 - rect.z0);
  const drawnAreaM2 = round2(widthM * depthM);

  // The only floor a drawn room may consume. ⛔ COMPUTED FROM THE SOLVER'S OWN TWO FIGURES, not
  // from `residualAreaM2` — that one is suppressed below `RESIDUAL_FLOOR_M2` for DRAWING, and a
  // budget that reads 0 because a region was too small to paint would refuse a legal room.
  const freeAreaM2 = round2(Math.max(0, layout.levelAreaM2 - layout.programmeAreaM2));
  // L-942. The ceiling is the free plate — floored to a centimetre-squared so the number the user
  // is told to draw to is one he can reach without being refused by the rounding itself. When the
  // plate has less free floor than the kind's minimum there is NO acceptable drawing, and the
  // verdict says zero rather than quoting a size that would be refused for a second reason.
  const largestDrawableM2 = freeAreaM2 + 1e-9 >= floorAreaM2 ? floor2(freeAreaM2) : 0;

  const overlaps: DrawnRoomOverlap[] = [];
  for (const c of layout.cells) {
    const a = overlapAreaM2(corners, c.ring);
    if (a > DRAW_INSIDE_EPSILON_M2) overlaps.push({ roomId: c.roomId, name: c.name, areaM2: round2(a) });
  }
  overlaps.sort((p, q) => q.areaM2 - p.areaM2);

  const insideAreaM2 = round2(overlapAreaM2(corners, levelRing));
  const base = {
    solverCode: null,
    drawnAreaM2,
    insideAreaM2,
    floorAreaM2,
    freeAreaM2,
    largestDrawableM2,
    overlaps: overlaps as readonly DrawnRoomOverlap[],
    pinnedOrder: null,
  };

  // ── The way out, in one sentence, reused by every refusal that has an area ceiling ──────────
  const hatch = largestDrawableM2 > 0
    ? `The largest ${label} this storey can take right now is ${largestDrawableM2.toFixed(2)} m² — `
      + 'that is how much of it no room has claimed.'
    // ⛔ AN HONEST DEAD END, NAMED AS ONE, WITH THE GESTURES THAT OPEN IT. A number here would
    // read as an invitation to a drawing that would then be refused for a second reason.
    : `This storey has ${freeAreaM2.toFixed(2)} m² unclaimed and PRYZM's floor for a ${label} is `
      + `${floorAreaM2.toFixed(2)} m², so there is no room left to draw one. Free some floor `
      + 'first — shrink a room in the list, drag a party wall, or grow the level envelope — then '
      + 'draw again.';

  if (!(drawnAreaM2 > 0) || !Number.isFinite(drawnAreaM2)) {
    return refuse('nothing-drawn',
      'That was a click, not a drag, so there is no rectangle to measure and nothing was added. '
      + 'Press on the plan and drag out a rectangle: the area it covers becomes the new room\'s '
      + `target, and where you draw it decides where it sits. ${hatch}`,
      base);
  }

  // ── IMPOSSIBLE #1 — off the plate. C114 §12: a room is a subset of its level. ───────────────
  if (insideAreaM2 <= DRAW_INSIDE_EPSILON_M2) {
    return refuse('outside-level',
      `You drew ${drawnAreaM2.toFixed(2)} m² and none of it — 0.00 m² — is inside this storey's `
      + 'outline. A room has to be on the plate it belongs to, so nothing was added and nothing '
      + `was moved to make it fit. Draw again inside the outline. ${hatch}`,
      base);
  }
  if (insideAreaM2 + DRAW_INSIDE_EPSILON_M2 < drawnAreaM2) {
    // ⛔ REFUSED WHOLE, NEVER TRIMMED TO FIT (C83). Keeping the part that is inside would report a
    // room the user did not draw as one he did — and he would have no way to see the difference,
    // because the rectangle is not what gets stored.
    return refuse('partly-outside-level',
      `You drew ${drawnAreaM2.toFixed(2)} m², and only ${insideAreaM2.toFixed(2)} m² of it is `
      + `inside this storey's outline — ${(drawnAreaM2 - insideAreaM2).toFixed(2)} m² hangs over `
      + 'the edge. PRYZM will not quietly keep the part that fits: that would be a room you did '
      + `not draw, reported as one you did. Draw again fully inside the outline. ${hatch}`,
      base);
  }

  // ── IMPOSSIBLE #2 — under the library floor. Refused HERE so the plan survives. ─────────────
  if (drawnAreaM2 < floorAreaM2) {
    // The escape hatch as a DIMENSION, not just an area: at the width he already drew, this is
    // how much deeper he has to go. A number he can act on with the same gesture.
    const needDepthM = widthM > 1e-6 ? floorAreaM2 / widthM : 0;
    const deeper = needDepthM > 0
      ? ` At the ${widthM.toFixed(2)} m width you drew, that is ${needDepthM.toFixed(2)} m deep.`
      : '';
    return refuse('below-minimum',
      `${drawnAreaM2.toFixed(2)} m² is below PRYZM's floor of ${floorAreaM2.toFixed(2)} m² for a `
      + `${label}, so nothing was added and the rectangle was not grown to reach it. Draw at least `
      + `${floorAreaM2.toFixed(2)} m².${deeper} (This floor is a PRYZM default for sanity, not a `
      + 'habitability minimum for any jurisdiction.)',
      base);
  }

  // ── IMPOSSIBLE #3 — more floor than the storey has left. THE gesture's invariant. ───────────
  if (drawnAreaM2 > freeAreaM2 + 1e-9) {
    return refuse('exceeds-free-plate',
      `A drawn room takes its floor from what this storey has NOT allocated — never from its `
      + `neighbours. You drew ${drawnAreaM2.toFixed(2)} m² and only ${freeAreaM2.toFixed(2)} m² is `
      + `unclaimed: ${(drawnAreaM2 - freeAreaM2).toFixed(2)} m² more than there is free floor. `
      + `Nothing was shrunk to make space. ${hatch}`
      + (largestDrawableM2 > 0
        ? ' To go bigger than that, take the space deliberately first: shrink a room in the list, '
          + 'or drag the wall between two rooms.'
        : ''),
      base);
  }

  // ── WHERE IT LANDS — a majority of the rectangle on one cell, or the solver's choice ────────
  const top = overlaps[0];
  const wantsOrder = top !== undefined && top.areaM2 >= drawnAreaM2 * DRAW_PIN_MAJORITY
    ? layout.order.indexOf(top.roomId)
    : -1;
  const atOrder = wantsOrder >= 0 ? wantsOrder : undefined;

  const intent: RoomProgrammeIntent = {
    type: 'programme.draw-room',
    id,
    kind,
    ...(input.name !== undefined ? { name: input.name } : {}),
    targetAreaM2: drawnAreaM2,
    ...(atOrder !== undefined ? { atOrder } : {}),
  };

  // ── STEP 1 & 2 OF "ONE ASKER": reduce the real intent, then solve the real result ───────────
  const candidate = reduceRoomProgramme(programme, intent);
  if (candidate === programme) {
    // ⛔ A BUG-CATCHER, NOT A REPAIR. Every test the reducer applies has been applied above, so
    // reaching this means the two disagree — and the honest answer is to say the drawing was
    // refused and change nothing, never to dispatch it anyway and hope.
    return refuse('solver-refused',
      'PRYZM could not add that room and did not change anything. This is a gap in the drawing '
      + 'check, not a statement about your rectangle — the room programme is untouched.',
      base);
  }
  const seated = candidate.entries.find((e) => e.id === id);
  const pinnedOrder = seated?.pinnedOrder ?? null;
  const withSeat = { ...base, pinnedOrder };

  // ⚡ `probeProgrammeLayout`, NOT `solveProgrammeLayout`, AND THE REASON IS MEASURED. This runs
  // on every pointer move, and the full solve costs 14.7 ms per move at 4 rooms and 37.3 ms at 20
  // against a 16.7 ms frame budget — a drag that stutters at a realistic brief. The probe is the
  // SAME BODY with the policy search truncated at the first feasible partition: identical ok/
  // refused verdict, identical refusal code, ~3× cheaper. It returns no layout precisely so this
  // cannot come to depend on which arrangement won.
  const refusal = probeProgrammeLayout({ levelRing, programme: candidate });
  if (refusal) {
    // ⭐ STEP 3: THE SOLVER'S OWN SENTENCE, VERBATIM. If it learns a new refusal tomorrow, this
    // gesture inherits it — which is the whole reason the check is a re-solve and not a ruleset.
    return refuse('solver-refused',
      `That room would not lay out, so nothing was added and your plan is untouched. ${refusal.statement}`,
      withSeat, refusal.code);
  }

  // ── FINE, or INADVISABLE-AND-SAID-SO. The overlap is a caveat, never a refusal. ─────────────
  const name = seated?.name ?? 'The room';
  const where = pinnedOrder !== null
    ? `at position ${pinnedOrder + 1}, where you drew it`
    : 'in the position the graph gives it — drag it onto another room afterwards to pin it';
  const overlapNote = overlaps.length > 0
    // ⛔ SAID, NOT REFUSED — and not silently corrected either. §SPATIAL-VALIDITY: an overlap is
    // INADVISABLE, not impossible, so the user is told exactly what it will and will not do and
    // then decides by releasing. He is also pointed at the gesture that does the OTHER thing he
    // may have meant, so the sentence ends in a choice rather than a caution.
    ? ` You drew over ${overlaps.map((o) => o.name).join(', ')} — that is allowed, but it does not `
      + 'take floor from them: the plan re-solves and they keep their areas. To move area between '
      + 'two rooms, drag the wall between them instead.'
    : '';
  return {
    ...withSeat,
    ok: true,
    code: null,
    statement:
      `${name} — ${drawnAreaM2.toFixed(2)} m², ${where}. It takes that from the `
      + `${freeAreaM2.toFixed(2)} m² this storey has not allocated, leaving `
      + `${(freeAreaM2 - drawnAreaM2).toFixed(2)} m² free.${overlapNote} Release to add it.`,
    intent,
  };
}
