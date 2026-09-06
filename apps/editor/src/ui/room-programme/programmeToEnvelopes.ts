/**
 * programmeToEnvelopes — THE INVERSION. The relationship graph is the INPUT to the
 * layout, not a read-out of it.
 *
 * Layer Affected:  UI — room programme (L7). PURE: no DOM, no THREE, no store, no bus,
 *                  no clock, no RNG. Never throws; every failure is a NAMED refusal.
 * File:            apps/editor/src/ui/room-programme/programmeToEnvelopes.ts
 * Strategy:        STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §9 · §10 · §25.5
 *                  (*"the graph should drive the initial layout generation"*)
 * Plan:            RESI-ORCHESTRATOR-PLAN §1 (§10 rows: level envelope ABSENT / room
 *                  envelope ABSENT — both now exist as C114 records) · §3 R4
 * Contracts:       C114 (§12 room ⊂ level) · C58 / C83 §1.2 (a refusal carries BOTH
 *                  numbers) · C84 EI-8a (no second copy of a predicate)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ WHAT MAKES THE GRAPH AN INPUT RATHER THAN A DECORATION
 * ─────────────────────────────────────────────────────────────────────────────
 * The layout is produced in two steps, and the graph decides the FIRST:
 *
 *   1. SERIATION — the rooms are put in an order in which graph neighbours are near
 *      each other (`seriateByGraph`). Plugging a relationship changes that order.
 *   2. RECURSIVE AREA BISECTION — the level footprint is cut in two along its longer
 *      axis at the coordinate where the areas match the two halves of the ordered
 *      list, then each half recurses. Contiguous runs of the SEQUENCE therefore
 *      occupy contiguous REGIONS of the plate.
 *
 * So an edge added or removed changes the geometry — which is the §25.5 requirement
 * stated as a mechanism rather than as an intention. And because step 2 is a heuristic
 * and not a solver, the result is MEASURED rather than claimed: `adjacency` reports,
 * per requested relationship, whether the two cells actually ended up sharing a wall
 * long enough for a door, using the SAME shared-face predicate the envelope family's
 * neighbour adaptation uses (`findSharedFaces`, C84 EI-9.2 — one question, one asker).
 *
 * ⛔ THIS IS NOT AN OPTIMISER AND MUST NOT BE DESCRIBED AS ONE. STR §25.0 is binding:
 * *"the layouts are not great and won't be — a human can and will be able to create
 * better layouts for now vs AI."* The deliverable is a first arrangement the human can
 * see, measure and then edit with the shipped per-face gizmo and profile editor. The
 * honest output of this module is therefore a layout PLUS the count of relationships it
 * failed to honour — never a layout alone.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE REMAINDER IS NAMED, NOT ABSORBED
 * ─────────────────────────────────────────────────────────────────────────────
 * If the brief asks for 210 m² on a 355 m² storey, the rooms are drawn at their TARGET
 * areas and the leftover 145 m² is reported as `residualAreaM2` and drawn as an
 * UNALLOCATED region. Scaling the rooms up to fill the plate would report areas nobody
 * asked for; dropping the remainder silently would let the plan look complete while a
 * third of the storey is unaccounted for. This is STR §25.2's arithmetic — *"we should
 * let the user know"* — applied one level down, from plot to plate.
 *
 * If the brief EXCEEDS the plate, this refuses with both numbers rather than shrinking
 * anything (C83: never clamp).
 */

import { intersectPolygons2D } from '@pryzm/geometry-kernel';
import {
  footprintAreaM2,
  findSharedFaces,
  type EnvelopePoint,
  type SpaceEnvelopeContextEntry,
} from '@pryzm/geometry-space-envelope';
import {
  occupancyTagFor,
  residentialRoomEntry,
  type ResidentialRoomKind,
} from './residentialRoomLibrary';
import type { RoomProgramme, RoomProgrammeEntry } from './roomProgrammeModel';
import { linkKey, programmeDegrees } from './roomProgrammeModel';

/**
 * The clear width a shared wall must have before two rooms can be said to be
 * connected. 0.9 m is a door leaf plus frame — below it the two cells touch at a
 * corner or a sliver, which is a topological accident, not a relationship.
 *
 * ⚠ It is a THRESHOLD FOR A REPORT, not a rule that shapes geometry: nothing here
 * moves a wall to reach it. It is stated so the report's word "adjacent" has one
 * meaning the reader can check.
 */
export const DOOR_CLEAR_WIDTH_M = 0.9;

/** Below this the remainder is rounding, not a region worth drawing. */
export const RESIDUAL_FLOOR_M2 = 0.5;

/** Bisection iterations per split. 44 ⇒ the split coordinate is exact to ~1e-13 of the span. */
const SPLIT_ITERATIONS = 44;

// ─────────────────────────────────────────────────────────────────────────────
// I/O
// ─────────────────────────────────────────────────────────────────────────────

export interface ProgrammeLayoutInput {
  /** The LEVEL envelope's own footprint. Never re-derived here (§25.11 clause 1). */
  readonly levelRing: readonly EnvelopePoint[];
  readonly programme: RoomProgramme;
}

export interface RoomEnvelopeCell {
  readonly roomId: string;
  readonly kind: ResidentialRoomKind;
  readonly name: string;
  /** The room-topology spelling, or `undefined` for the library's no-mapping arm. */
  readonly occupancy: string | undefined;
  readonly ring: readonly EnvelopePoint[];
  /** What this cell ACTUALLY measures, m². */
  readonly areaM2: number;
  /** What the brief asked for, m². Printed beside the above so drift is visible. */
  readonly targetAreaM2: number;
}

export interface AdjacencyVerdict {
  readonly aId: string;
  readonly bId: string;
  /** Total shared wall length between the two cells, m. */
  readonly sharedEdgeM: number;
  readonly satisfied: boolean;
}

export interface ProgrammeLayout {
  readonly ok: true;
  readonly cells: readonly RoomEnvelopeCell[];
  /** The unallocated remainder of the plate, m². 0 when the brief fills it. */
  readonly residualAreaM2: number;
  /** The unallocated region, when there is one worth drawing. */
  readonly residualRing: readonly EnvelopePoint[] | null;
  /** The seriation the graph produced — room ids, in placement order. */
  readonly order: readonly string[];
  readonly adjacency: readonly AdjacencyVerdict[];
  readonly satisfiedCount: number;
  readonly requestedCount: number;
  readonly levelAreaM2: number;
  readonly programmeAreaM2: number;
}

export type ProgrammeLayoutRefusalCode =
  /** The brief is empty — there is nothing to lay out. */
  | 'no-rooms'
  /** The level envelope has no usable footprint. */
  | 'no-level-ring'
  /** Σ target areas exceeds the plate. Refused with BOTH numbers; nothing is shrunk. */
  | 'programme-exceeds-level'
  /** A room's target is below the library's floor for its kind. */
  | 'room-below-minimum'
  /** A cut produced two disjoint regions — a concave plate this heuristic cannot serve. */
  | 'multi-region-split'
  /** A cut produced no usable polygon. A bug-catcher; never "repaired". */
  | 'degenerate-split';

export interface ProgrammeLayoutRefusal {
  readonly ok: false;
  readonly code: ProgrammeLayoutRefusalCode;
  /** Plain language, both numbers where there are two. Shown to the user verbatim. */
  readonly statement: string;
}

export type ProgrammeLayoutResult = ProgrammeLayout | ProgrammeLayoutRefusal;

// ─────────────────────────────────────────────────────────────────────────────
// SERIATION — the graph's contribution to the geometry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Order the rooms so that graph neighbours land near each other in the sequence.
 *
 * Greedy, and DETERMINISTIC by construction — every tie is broken by a stated rule, so
 * the same programme always produces the same plan and a re-render never reshuffles a
 * layout the user was reading:
 *
 *   · seed: the highest-degree room; ties → the earliest in the programme;
 *   · step: of the rooms not yet placed, the one with the most links to rooms ALREADY
 *     placed; ties → higher total degree; ties → earliest in the programme;
 *   · a disconnected remainder starts again from its own highest-degree room, so an
 *     unlinked room is appended rather than dropped.
 *
 * This is a Cuthill–McKee-shaped ordering: it minimises how far apart, in the sequence,
 * the two ends of an edge sit — which is exactly the quantity the area bisection then
 * turns into spatial distance.
 */
export function seriateByGraph(
  entries: readonly RoomProgrammeEntry[],
  links: readonly { readonly aId: string; readonly bId: string }[],
): readonly string[] {
  if (entries.length === 0) return [];
  const index = new Map(entries.map((e, i) => [e.id, i]));
  const neighbours = new Map<string, Set<string>>(entries.map((e) => [e.id, new Set<string>()]));
  for (const l of links) {
    if (!neighbours.has(l.aId) || !neighbours.has(l.bId) || l.aId === l.bId) continue;
    neighbours.get(l.aId)!.add(l.bId);
    neighbours.get(l.bId)!.add(l.aId);
  }
  const degree = (id: string): number => neighbours.get(id)?.size ?? 0;

  const placed: string[] = [];
  const done = new Set<string>();

  const better = (a: string, b: string, tiesA: number, tiesB: number): boolean => {
    if (tiesA !== tiesB) return tiesA > tiesB;
    const da = degree(a);
    const db = degree(b);
    if (da !== db) return da > db;
    return (index.get(a) ?? 0) < (index.get(b) ?? 0);
  };

  while (done.size < entries.length) {
    // Seed this component: the highest-degree unplaced room, earliest on a tie.
    let seed: string | null = null;
    for (const e of entries) {
      if (done.has(e.id)) continue;
      if (seed === null || better(e.id, seed, degree(e.id), degree(seed))) seed = e.id;
    }
    if (seed === null) break;
    placed.push(seed);
    done.add(seed);

    // Grow it.
    for (;;) {
      let best: string | null = null;
      let bestTies = -1;
      for (const e of entries) {
        if (done.has(e.id)) continue;
        let ties = 0;
        for (const n of neighbours.get(e.id) ?? []) if (done.has(n)) ties += 1;
        if (ties === 0) continue; // not in this component yet
        if (best === null || better(e.id, best, ties, bestTies)) {
          best = e.id;
          bestTies = ties;
        }
      }
      if (best === null) break;
      placed.push(best);
      done.add(best);
    }
  }
  return placed;
}

// ─────────────────────────────────────────────────────────────────────────────
// GEOMETRY — every clip goes through the kernel's ONE boolean
// ─────────────────────────────────────────────────────────────────────────────

type Pt2 = readonly [number, number];

function toPt2(ring: readonly EnvelopePoint[]): Pt2[] {
  return ring.map((p) => [p.x, p.z] as Pt2);
}

function toRing(loop: ReadonlyArray<readonly [number, number]>): EnvelopePoint[] {
  return loop.map(([x, z]) => ({ x: round6(x), y: 0, z: round6(z) }));
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

interface Bounds { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number }

function boundsOf(ring: readonly EnvelopePoint[]): Bounds {
  let x0 = Infinity; let x1 = -Infinity; let z0 = Infinity; let z1 = -Infinity;
  for (const p of ring) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.z < z0) z0 = p.z;
    if (p.z > z1) z1 = p.z;
  }
  return { x0, x1, z0, z1 };
}

type ClipOutcome =
  | { readonly kind: 'ring'; readonly ring: readonly EnvelopePoint[] }
  | { readonly kind: 'empty' }
  | { readonly kind: 'multi' }
  | { readonly kind: 'refused'; readonly detail: string };

/**
 * The half of `ring` on one side of an axis-aligned line.
 *
 * ⭐ IT IS THE KERNEL'S `intersectPolygons2D`, NOT A SIXTH SUTHERLAND–HODGMAN. The
 * kernel's own index says this tree once carried *"≥5 independent Sutherland–Hodgman
 * half-plane clippers, NO general clipper"*; GE-05 delivered one so the next caller
 * would not write the sixth. This is that next caller. The half-plane is expressed as
 * a rectangle covering the padded bounds, which is exact for an axis-aligned cut.
 */
function clipSide(
  ring: readonly EnvelopePoint[],
  axis: 'x' | 'z',
  value: number,
  side: 'le' | 'ge',
  bounds: Bounds,
): ClipOutcome {
  const pad = 1;
  const x0 = bounds.x0 - pad;
  const x1 = bounds.x1 + pad;
  const z0 = bounds.z0 - pad;
  const z1 = bounds.z1 + pad;
  let rect: Pt2[];
  if (axis === 'x') {
    const a = side === 'le' ? x0 : value;
    const b = side === 'le' ? value : x1;
    rect = [[a, z0], [b, z0], [b, z1], [a, z1]];
  } else {
    const a = side === 'le' ? z0 : value;
    const b = side === 'le' ? value : z1;
    rect = [[x0, a], [x1, a], [x1, b], [x0, b]];
  }
  const res = intersectPolygons2D(toPt2(ring), rect);
  if (!res.ok) return { kind: 'refused', detail: res.reason };
  const loops = res.loops.filter((l) => l.length >= 3);
  if (loops.length === 0) return { kind: 'empty' };
  if (loops.length > 1) return { kind: 'multi' };
  return { kind: 'ring', ring: toRing(loops[0]!) };
}

function areaOfClip(
  ring: readonly EnvelopePoint[],
  axis: 'x' | 'z',
  value: number,
  bounds: Bounds,
): number {
  const c = clipSide(ring, axis, value, 'le', bounds);
  return c.kind === 'ring' ? footprintAreaM2(c.ring) : 0;
}

/**
 * The coordinate on `axis` at which the `le` side of `ring` has area `targetArea`.
 * Deterministic bisection — the area of a half-plane clip grows monotonically with the
 * cut coordinate on a simple ring, so bisection converges to the exact answer.
 */
function findAreaSplit(
  ring: readonly EnvelopePoint[],
  axis: 'x' | 'z',
  bounds: Bounds,
  targetArea: number,
): number {
  let lo = axis === 'x' ? bounds.x0 : bounds.z0;
  let hi = axis === 'x' ? bounds.x1 : bounds.z1;
  for (let i = 0; i < SPLIT_ITERATIONS; i += 1) {
    const mid = (lo + hi) / 2;
    if (areaOfClip(ring, axis, mid, bounds) < targetArea) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

interface Slot { readonly key: string; readonly areaM2: number }

/**
 * Recursively cut `ring` into one region per slot, in slot order, each with its own
 * area. Returns `null` on the first cut this heuristic cannot make — the caller turns
 * that into a NAMED refusal rather than a partial plan.
 */
function subdivideByArea(
  ring: readonly EnvelopePoint[],
  slots: readonly Slot[],
  out: Map<string, readonly EnvelopePoint[]>,
): ProgrammeLayoutRefusalCode | null {
  if (slots.length === 0) return null;
  if (slots.length === 1) {
    out.set(slots[0]!.key, ring);
    return null;
  }
  const total = slots.reduce((s, x) => s + x.areaM2, 0);
  if (!(total > 0)) return 'degenerate-split';

  // Split the ORDERED list at the point closest to half the area — contiguous runs of
  // the sequence stay contiguous, which is what carries the graph into the geometry.
  let cut = 1;
  let acc = slots[0]!.areaM2;
  let bestGap = Math.abs(acc - total / 2);
  let bestCut = 1;
  for (let i = 1; i < slots.length - 1; i += 1) {
    acc += slots[i]!.areaM2;
    const gap = Math.abs(acc - total / 2);
    if (gap < bestGap) { bestGap = gap; bestCut = i + 1; }
  }
  cut = bestCut;
  const head = slots.slice(0, cut);
  const tail = slots.slice(cut);
  const headArea = head.reduce((s, x) => s + x.areaM2, 0);

  const b = boundsOf(ring);
  // Cut across the LONGER side so both halves stay as square as the plate allows.
  const axis: 'x' | 'z' = (b.x1 - b.x0) >= (b.z1 - b.z0) ? 'x' : 'z';
  const ringArea = footprintAreaM2(ring);
  if (!(ringArea > 0)) return 'degenerate-split';
  // Scale the head's share to the ring's ACTUAL area, so accumulated clipping error
  // never starves the tail.
  const at = findAreaSplit(ring, axis, b, (headArea / total) * ringArea);

  const lo = clipSide(ring, axis, at, 'le', b);
  const hi = clipSide(ring, axis, at, 'ge', b);
  for (const c of [lo, hi]) {
    if (c.kind === 'multi') return 'multi-region-split';
    if (c.kind !== 'ring') return 'degenerate-split';
  }
  const loRing = (lo as { ring: readonly EnvelopePoint[] }).ring;
  const hiRing = (hi as { ring: readonly EnvelopePoint[] }).ring;
  return subdivideByArea(loRing, head, out) ?? subdivideByArea(hiRing, tail, out);
}

// ─────────────────────────────────────────────────────────────────────────────
// THE SOLVE
// ─────────────────────────────────────────────────────────────────────────────

const RESIDUAL_KEY = ' residual';

/**
 * Solve the programme against a level footprint. Pure; total; never throws.
 *
 * ⛔ IT EMITS NO COMMAND AND TOUCHES NO STORE. STR §25.5 gates elements at this stage
 * (*"not yet walls, floor, slabs etc… just spaces — envelopes"*), and even the
 * envelopes are only COMMITTED by an explicit user action elsewhere. This function's
 * whole output is a picture and a measurement.
 */
export function solveProgrammeLayout(input: ProgrammeLayoutInput): ProgrammeLayoutResult {
  const { levelRing, programme } = input;

  if (!Array.isArray(levelRing) || levelRing.length < 3) {
    return {
      ok: false,
      code: 'no-level-ring',
      statement:
        'This storey has no level envelope to lay rooms inside. Create one first — the '
        + 'buildable-envelope card\'s "Fit this on the ground floor" turns a target ground-floor '
        + 'area into a level envelope, and rooms are placed within it.',
    };
  }
  const levelAreaM2 = footprintAreaM2(levelRing);
  if (!(levelAreaM2 > 0)) {
    return {
      ok: false,
      code: 'no-level-ring',
      statement: 'The level envelope\'s footprint measures 0 m² — there is no plate to subdivide.',
    };
  }

  const entries = programme.entries;
  if (entries.length === 0) {
    return {
      ok: false,
      code: 'no-rooms',
      statement:
        'The programme is empty. Drag a room from the library onto the graph to start — the '
        + 'relationships you plug in are what drive the arrangement.',
    };
  }

  // Per-room floor, BEFORE the plate check, so the more specific refusal wins.
  for (const e of entries) {
    const lib = residentialRoomEntry(e.kind);
    if (lib && e.targetAreaM2 < lib.minAreaM2) {
      return {
        ok: false,
        code: 'room-below-minimum',
        statement:
          `${e.name} is set to ${e.targetAreaM2.toFixed(2)} m², below PRYZM's floor of `
          + `${lib.minAreaM2.toFixed(2)} m² for a ${lib.label.toLowerCase()}. Raise it, or remove `
          + 'the room. (This floor is a PRYZM default for sanity, not a habitability minimum for '
          + 'any jurisdiction.)',
      };
    }
  }

  const programmeAreaM2 = entries.reduce((s, e) => s + e.targetAreaM2, 0);
  if (programmeAreaM2 > levelAreaM2 + 1e-6) {
    return {
      ok: false,
      code: 'programme-exceeds-level',
      statement:
        `The programme asks for ${programmeAreaM2.toFixed(2)} m² and the level envelope measures `
        + `${levelAreaM2.toFixed(2)} m² — ${(programmeAreaM2 - levelAreaM2).toFixed(2)} m² more than `
        + 'there is floor. PRYZM will not shrink your rooms to make them fit: either reduce the '
        + 'programme by that much, or grow the level envelope (drag one of its faces, or edit its '
        + 'profile) and solve again.',
    };
  }

  const order = seriateByGraph(entries, programme.links);
  const byId = new Map(entries.map((e) => [e.id, e]));

  const slots: Slot[] = order
    .map((id) => byId.get(id))
    .filter((e): e is RoomProgrammeEntry => e !== undefined)
    .map((e) => ({ key: e.id, areaM2: e.targetAreaM2 }));

  const residualAreaM2 = Math.max(0, levelAreaM2 - programmeAreaM2);
  const drawResidual = residualAreaM2 >= RESIDUAL_FLOOR_M2;
  if (drawResidual) slots.push({ key: RESIDUAL_KEY, areaM2: residualAreaM2 });

  const rings = new Map<string, readonly EnvelopePoint[]>();
  const failure = subdivideByArea(levelRing, slots, rings);
  if (failure) {
    return {
      ok: false,
      code: failure,
      statement:
        failure === 'multi-region-split'
          ? 'One of the cuts split the plate into two separate pieces, so a room would have been '
            + 'drawn in two places at once. This arrangement heuristic cuts straight lines across '
            + 'the plate and cannot serve a footprint this concave. Edit the level envelope\'s '
            + 'profile into a simpler outline, or place the rooms by hand.'
          : 'A cut produced no usable region, so PRYZM stopped rather than drawing a partial plan. '
            + 'Nothing was created. This is a gap in the arrangement heuristic, not a statement '
            + 'about your programme.',
    };
  }

  const cells: RoomEnvelopeCell[] = [];
  for (const id of order) {
    const e = byId.get(id);
    const ring = rings.get(id);
    if (!e || !ring) continue;
    cells.push({
      roomId: e.id,
      kind: e.kind,
      name: e.name,
      occupancy: occupancyTagFor(e.kind),
      ring,
      areaM2: round6(footprintAreaM2(ring)),
      targetAreaM2: e.targetAreaM2,
    });
  }

  const adjacency = measureAdjacency(cells, programme.links);
  const satisfiedCount = adjacency.filter((a) => a.satisfied).length;

  return {
    ok: true,
    cells,
    residualAreaM2: round6(residualAreaM2),
    residualRing: drawResidual ? (rings.get(RESIDUAL_KEY) ?? null) : null,
    order,
    adjacency,
    satisfiedCount,
    requestedCount: adjacency.length,
    levelAreaM2: round6(levelAreaM2),
    programmeAreaM2: round6(programmeAreaM2),
  };
}

/**
 * Did each requested relationship survive the arrangement?
 *
 * ⭐ THE PREDICATE IS `findSharedFaces` — the SAME one `planSpaceEnvelopeFaceMoveInContext`
 * uses to decide which neighbour adapts when a face is dragged (C84 EI-9.2: *"the gate,
 * the pre-flight and the builder must ask the same one"*). If this file asked its own
 * question, the panel could report a relationship as connected that the face-drag would
 * then refuse to treat as a shared wall.
 */
export function measureAdjacency(
  cells: readonly RoomEnvelopeCell[],
  links: readonly { readonly aId: string; readonly bId: string }[],
): readonly AdjacencyVerdict[] {
  if (links.length === 0) return [];
  const world: SpaceEnvelopeContextEntry[] = cells.map((c) => ({
    prism: { id: c.roomId, footprint: c.ring, baseOffset: 0, height: 1 },
    role: 'room',
    levelId: 'layout-preview',
    withinId: null,
    name: c.name,
  }));
  const byId = new Map(world.map((w) => [w.prism.id, w]));

  const seen = new Set<string>();
  const out: AdjacencyVerdict[] = [];
  for (const l of links) {
    const k = linkKey(l.aId, l.bId);
    if (seen.has(k)) continue;
    seen.add(k);
    const a = byId.get(l.aId);
    if (!a || !byId.has(l.bId)) {
      out.push({ aId: l.aId, bId: l.bId, sharedEdgeM: 0, satisfied: false });
      continue;
    }
    let shared = 0;
    for (let i = 0; i < a.prism.footprint.length; i += 1) {
      for (const f of findSharedFaces(a, { kind: 'side', edgeIndex: i }, world)) {
        if (f.envelopeId === l.bId) shared += f.overlapM;
      }
    }
    out.push({
      aId: l.aId,
      bId: l.bId,
      sharedEdgeM: round6(shared),
      satisfied: shared >= DOOR_CLEAR_WIDTH_M,
    });
  }
  return out;
}

/** Degrees, re-exported so the panel does not import two modules for one picture. */
export { programmeDegrees };
