/**
 * roomProgrammeModel — the room programme and the relationship graph, as ONE reducer
 * over ONE session state, plus the session stash the panel reads it from.
 *
 * Layer Affected:  UI — room programme (L7). PURE reducer + module state. No DOM, no
 *                  THREE, no clock, no RNG (ids are minted by the CALLER).
 * File:            apps/editor/src/ui/room-programme/roomProgrammeModel.ts
 * Strategy:        STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §8 · §9 · §25.5
 * Plan:            RESI-ORCHESTRATOR-PLAN §1 (§9 rows) · §3 R4
 * Contracts:       C52 §3 (per-node override → existing engine re-run) · C114 · C03
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ P6 IS NOT BREACHED BY THIS FILE, AND HERE IS THE ARGUMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * P6 — *"commands are the only mutation path; UI must not write a store directly"* —
 * is about the DOMAIN stores: the records that are persisted, undone, exported and
 * rendered. A room programme is not one of those. It is a BRIEF: what the user says
 * they want, held for this session, from which a layout is SOLVED and then COMMITTED
 * through the bus.
 *
 * The precedent is exact and already blessed: `activeRoomAreaOverrides.ts`,
 * `activeRoomTypeOverrides.ts`, `activeRoomFloorOverrides.ts` and
 * `activeRoomAdjacencyOverrides.ts` are all module-level session stashes read by a
 * regenerate; C52 §3 is the discipline they cite. This file is their sibling with two
 * differences that matter:
 *
 *  1. it is keyed by a MINTED ENTRY ID, not by display name. The name-keyed stash's own
 *     engine logs `§ROOM-ADJACENCY-NAME-MISS` when a rename silently breaks a link —
 *     that failure mode is designed out here rather than inherited.
 *  2. its consumer emits ENVELOPES, never walls. STR §25.5 gates walls explicitly
 *     (*"until this is sound we would not generate walls, doors etc…"*), which is why
 *     this does not route through `activeRoomAdjacencyOverrides` → `bubbleGraph` →
 *     `HouseLayoutExecutor` → `wall.batch.create`. That chain is real, reachable and
 *     wired — and it produces exactly the thing this stage forbids.
 *
 * ⛔ NOTHING HERE PERSISTS ACROSS LOADS. A brief restored on next load would present a
 * programme nobody asked for as though the product had decided something — the same rule
 * `GISAreaLayout`'s massing-option set states for itself.
 *
 * ⭐ WITHIN THE SESSION IT IS FULLY UNDOABLE, AND THAT IS NOT THE SAME CLAIM (§ROOM-BRIEF-UNDO,
 * L-13120). The two were run together — *"no persistence"* was written as one limit and read as
 * one — and they are different facts with different arguments. Cross-session restore is REFUSED
 * on the ground above. Taking back the gesture you just made is a USER EXPECTATION, not a
 * feature: a gesture that cannot be reversed makes people afraid to use the tool, and an
 * un-undoable gesture sitting beside undoable ones (place envelopes IS on the bus) is worse than
 * either, because the user cannot predict which of his actions are reversible. So this stash
 * keeps its OWN bounded history — see §ROOM-BRIEF-UNDO at the bottom of this file for why that
 * is a history and not a bus command, and `roomProgrammePanel.ts` for who presses it.
 */

import {
  isResidentialRoomKind,
  residentialRoomEntry,
  type ResidentialRoomKind,
} from './residentialRoomLibrary';
import type { ProgrammeRoomSpec } from '@pryzm/room-topology';

// ─────────────────────────────────────────────────────────────────────────────
// THE STATE
// ─────────────────────────────────────────────────────────────────────────────

export interface RoomProgrammeEntry {
  /** Minted by the caller. STABLE across renames — that is the whole reason it exists. */
  readonly id: string;
  readonly kind: ResidentialRoomKind;
  readonly name: string;
  readonly targetAreaM2: number;
  /**
   * §ROOM-PIN (L-13079, founder 2026-09-07: *"I shall be able to reorganize also the rooms on
   * the plan view"*) — the position in the SOLVED ORDER the user has fixed this room to, or
   * `undefined` when the solver is free to place it.
   *
   * ⭐ WHY AN ORDINAL AND NOT AN {x,z}. `solveProgrammeLayout` does not PLACE rooms, it
   * PARTITIONS a plate: it seriates the rooms (Cuthill–McKee) and then bisects the level ring
   * by area in that sequence, so a cell is a pure function of a room's INDEX in the order. An
   * {x,z} is therefore not expressible in that solver's output — honouring one would mean
   * replacing the solver, and storing one without honouring it is the "silently re-solves away
   * the user's arrangement" failure this field exists to prevent. An ordinal is the largest
   * statement of intent this solver can actually keep, so it is the one that gets persisted.
   *
   * ⛔ IT IS `authored` IN THE SENSE `RoomBoundary.detectionMethod: 'manual-boundary'` IS
   * (`RoomTypes.ts`) — *the one origin the system may never invent*. Nothing in this file, the
   * solver, or the panel ever WRITES a pin except from an explicit user gesture, and a re-solve
   * may reorder every unpinned room around it but may never move it.
   *
   * ⚠ RANGE: `0 … entries.length - 1`, and unique among pinned rooms. The reducer refuses any
   * intent that would break either, and `programme.remove-room` DROPS a pin the removal would
   * put out of range — see that case for why dropping is not clamping.
   */
  readonly pinnedOrder?: number;
}

/** An UNDIRECTED relationship. STR §9: *"Living ↔ Kitchen"*, *"Bedroom ↔ Ensuite"*. */
export interface RoomProgrammeLink {
  readonly aId: string;
  readonly bId: string;
}

export interface RoomProgramme {
  readonly entries: readonly RoomProgrammeEntry[];
  readonly links: readonly RoomProgrammeLink[];
}

export const EMPTY_ROOM_PROGRAMME: RoomProgramme = { entries: [], links: [] };

// ─────────────────────────────────────────────────────────────────────────────
// THE INTENTS — STR §9's list of what the user can do, one member each
// ─────────────────────────────────────────────────────────────────────────────

export type RoomProgrammeIntent =
  /** Drag a library chip in (or click it). `id` is minted by the caller — CA-2. */
  | { readonly type: 'programme.add-room'; readonly id: string; readonly kind: ResidentialRoomKind; readonly name?: string }
  | { readonly type: 'programme.remove-room'; readonly id: string }
  | { readonly type: 'programme.rename-room'; readonly id: string; readonly name: string }
  | { readonly type: 'programme.set-area'; readonly id: string; readonly targetAreaM2: number }
  /** PLUG a relationship. STR §25.5: this is what re-generates the layout. */
  | { readonly type: 'programme.link'; readonly aId: string; readonly bId: string }
  /** UNPLUG one. `removeRoomAdjacency` in the name-keyed stash has zero callers; this has one. */
  | { readonly type: 'programme.unlink'; readonly aId: string; readonly bId: string }
  /**
   * §ROOM-PIN (L-13079) — FIX this room at `order` in the solved sequence. The founder's
   * *"reorganize also the rooms on the plan view"*, expressed in the only currency the area
   * bisection can honour. See `RoomProgrammeEntry.pinnedOrder`.
   *
   * ⛔ REFUSED (state returned UNCHANGED) when `order` is outside `0 … entries.length - 1` or
   * another room already holds it. Nothing is nudged to the nearest free slot: a pin the user
   * did not ask for is exactly as wrong as losing the one he did.
   */
  | { readonly type: 'programme.pin-room'; readonly id: string; readonly order: number }
  /** §ROOM-PIN — hand the room back to the solver. */
  | { readonly type: 'programme.unpin-room'; readonly id: string }
  /**
   * §ROOM-WALL-DRAG (L-13096, founder 2026-09-07: *"This room locator needs to be more flexible
   * and more dynamic — I shall be able to reorganize also the rooms on the plan view — draw them
   * etc."*) — MOVE THE WALL BETWEEN TWO ROOMS, by restating BOTH their target areas at once.
   *
   * ⭐ WHY A PAIR AND NOT TWO `programme.set-area`s. Moving a party wall is ONE gesture with ONE
   * meaning: area leaves one room and arrives in the other. Two separate intents would re-solve
   * the plate in between, at a moment when one room had grown and the other had not yet shrunk —
   * a transient the user sees as a flash and, when the brief already fills the plate, as a
   * `programme-exceeds-level` refusal for a drag that never asked for more space. Atomic is
   * therefore not a nicety: it is what makes the intent mean "wall", not "two resizes".
   *
   * ⛔ CONSERVATION IS AN INVARIANT, NOT AN EXPECTATION. `aAreaM2 + bAreaM2` must equal the two
   * rooms' CURRENT sum within `PAIR_RESIZE_EPSILON_M2`, and an intent that breaks it is REFUSED.
   * That is what separates a wall move from a resize: the plate's total demand does not change,
   * so a drag can never newly trip the solver's `programme-exceeds-level`. A caller that wants to
   * GROW the programme asks in the currency that says so — `programme.set-area`.
   *
   * ⛔ REFUSED (state returned UNCHANGED) by `describePairResize` AND BY NOTHING ELSE — the
   * reducer delegates every test to it so the panel's message and the reducer's decision cannot
   * disagree about what is allowed (C84 EI-8a: no second copy of a predicate). The floor a room
   * may not cross is `residentialRoomEntry(kind).minAreaM2` — the SAME number
   * `solveProgrammeLayout` refuses `room-below-minimum` on, so a drag this reducer ACCEPTS can
   * never produce a layout the solver then rejects for that reason.
   */
  | {
      readonly type: 'programme.resize-pair';
      readonly aId: string; readonly aAreaM2: number;
      readonly bId: string; readonly bAreaM2: number;
    }
  /**
   * §ROOM-DRAW-NEW (L-13120, founder 2026-09-07: *"This room locator needs to be more flexible
   * and more dynamic — I shall be able to reorganize also the rooms on the plan view — draw them
   * etc."*) — ADD A ROOM BY DRAWING IT. One rectangle on the plan becomes one room, at the area
   * that rectangle measures and, when the drawing points at one position unambiguously, at that
   * position in the solved order.
   *
   * ⭐ WHY THIS IS ONE INTENT AND NOT `add-room` + `set-area` + `pin-room`. Those three exist and
   * would compose to the same END state — through TWO intermediate states the solver would be run
   * on and the panel would repaint: first a room at the LIBRARY'S PRESET area (the wrong size,
   * briefly drawn), then that room at the drawn area but in the SOLVER'S position (the wrong
   * place, briefly drawn). Worse than the flicker: when the preset area does not fit the free
   * plate, the FIRST of the three refuses — so a draw that is perfectly legal at the size the user
   * drew would be rejected at a size he never asked for. Atomic is therefore not tidiness here; it
   * is what makes the intent mean *"this room"* rather than *"three edits"*. It is the same
   * argument `programme.resize-pair` makes for the party wall, arriving from the other direction.
   *
   * ⛔ `targetAreaM2` MUST ALREADY CLEAR THE LIBRARY FLOOR, AND THIS CASE REFUSES IT OTHERWISE.
   * That floor is the SAME number `solveProgrammeLayout` refuses `room-below-minimum` on, so a
   * draw this reducer accepts can never produce a layout the solver then rejects for that reason
   * — the sibling guarantee `describePairResize` gives the wall drag.
   *
   * ⚠ `atOrder` IS A REQUEST, NOT A GUARANTEE, AND THE DIFFERENCE IS REPORTED RATHER THAN HIDDEN.
   * A position already held by another PINNED room is not taken from it — `programme.pin-room`
   * refuses that too, and for the reason it states: displacing someone else's pin without saying
   * so is a silent overwrite in a nicer costume. The room is then added UNPINNED, which is the
   * documented default; and because `describeDrawnRoom` REDUCES THIS VERY INTENT before the panel
   * dispatches it, the sentence the user reads reports the pin the room actually got, not the one
   * the drawing asked for.
   */
  | {
      readonly type: 'programme.draw-room';
      readonly id: string;
      readonly kind: ResidentialRoomKind;
      readonly name?: string;
      readonly targetAreaM2: number;
      /** The position the drawing points at. Absent ⇒ the solver's choice, as for any new room. */
      readonly atOrder?: number;
    }
  | { readonly type: 'programme.reset'; readonly next: RoomProgramme };

// ─────────────────────────────────────────────────────────────────────────────
// §ROOM-WALL-DRAG (L-13096) — THE ONE ASKER FOR "MAY THIS WALL MOVE THAT FAR?"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * How exactly the two new areas must still add up to the two old ones, m².
 *
 * ⚠ IT IS A FLOAT TOLERANCE, NOT A BUDGET. The panel derives the second area by SUBTRACTING the
 * first from the pair's current sum, so the residual it has to absorb is the ~1e-13 of a double,
 * not a discretion the caller may spend. It is stated as a named constant rather than an inline
 * `1e-6` so a future reader can see there is exactly one place it is decided.
 */
export const PAIR_RESIZE_EPSILON_M2 = 1e-6;

/** Why a wall move was refused. Every member is a sentence the panel has to be able to speak. */
export type PairResizeRefusalCode =
    /** One of the two ids is not in the programme. */
    | 'unknown-room'
    /** Both ids name the same room — a wall has two sides. */
    | 'same-room'
    /** An area is NaN, infinite, or not positive. */
    | 'not-finite'
    /** The two new areas do not add up to the two old ones: this is a resize, not a wall move. */
    | 'not-conserved'
    /** A room would drop below its library floor. THE refusal the user actually meets. */
    | 'below-minimum';

/**
 * The verdict on one wall move, carrying the numbers a refusal has to state.
 *
 * ⭐ IT CARRIES `maxTransferM2` BECAUSE §REFUSING-HALF-NEEDS-ITS-ESCAPE-HATCH (L-942) REQUIRES IT.
 * A refusal whose yes-branch is unreachable is *"a regression with a citation attached"*. So the
 * verdict does not merely say no: it measures the largest move IN THE SAME DIRECTION that this
 * very function would accept, which the user can then perform. When it is 0 the room is already
 * at its floor and the panel says THAT instead — an honest dead end named as one, rather than a
 * number that looks like an invitation.
 */
export interface PairResizeVerdict {
    readonly ok: boolean;
    readonly code: PairResizeRefusalCode | null;
    /** The room that would breach its floor (`below-minimum` only). */
    readonly offenderId: string | null;
    readonly offenderName: string | null;
    /** What the drag asked that room to become, m². The FIRST of C83's two numbers. */
    readonly askedAreaM2: number | null;
    /** Its library floor, m². The SECOND. */
    readonly floorAreaM2: number | null;
    /** L-942 — the largest transfer this function accepts in the requested direction, m². */
    readonly maxTransferM2: number;
}

function refusal(
    code: PairResizeRefusalCode,
    maxTransferM2: number,
    offender?: { readonly id: string; readonly name: string; readonly asked: number; readonly floor: number },
): PairResizeVerdict {
    return {
        ok: false,
        code,
        offenderId: offender?.id ?? null,
        offenderName: offender?.name ?? null,
        askedAreaM2: offender?.asked ?? null,
        floorAreaM2: offender?.floor ?? null,
        maxTransferM2,
    };
}

/**
 * THE predicate behind `programme.resize-pair`. Total, pure, never throws.
 *
 * ⛔ THE REDUCER CALLS THIS AND SO DOES THE PANEL, WHICH IS THE POINT. `applyReorder`'s sibling
 * defect — a panel that re-derives "is this allowed?" beside the reducer that decides it — is how
 * a control comes to say one thing and do another. Here the message the user reads is built from
 * the verdict that actually refused the intent.
 */
export function describePairResize(
    state: RoomProgramme,
    aId: string,
    aAreaM2: number,
    bId: string,
    bAreaM2: number,
): PairResizeVerdict {
    if (aId === bId) return refusal('same-room', 0);
    const a = state.entries.find((e) => e.id === aId);
    const b = state.entries.find((e) => e.id === bId);
    if (!a || !b) return refusal('unknown-room', 0);
    if (![aAreaM2, bAreaM2].every((v) => Number.isFinite(v) && v > 0)) return refusal('not-finite', 0);

    // The room the drag SHRINKS is the only one that can hit a floor, and it is the one whose
    // headroom defines the escape hatch. When neither shrinks there is nothing to transfer.
    const shrinking = aAreaM2 < a.targetAreaM2 ? a : bAreaM2 < b.targetAreaM2 ? b : null;
    const floorOf = (e: RoomProgrammeEntry): number => residentialRoomEntry(e.kind)?.minAreaM2 ?? 0;
    const maxTransferM2 = shrinking ? Math.max(0, shrinking.targetAreaM2 - floorOf(shrinking)) : 0;

    // ⛔ CONSERVATION IS CHECKED BEFORE THE FLOOR, so a caller who tried to grow the programme is
    // told THAT rather than being handed a floor number for a question it never asked.
    const before = a.targetAreaM2 + b.targetAreaM2;
    if (Math.abs((aAreaM2 + bAreaM2) - before) > PAIR_RESIZE_EPSILON_M2) {
        return refusal('not-conserved', maxTransferM2);
    }

    for (const [e, asked] of [[a, aAreaM2], [b, bAreaM2]] as const) {
        const floor = floorOf(e);
        // ⛔ REFUSED, NEVER CLAMPED (C83). Silently seating the wall at the floor would report an
        // area nobody asked for under a gesture the user believes he controlled.
        if (asked < floor) {
            return refusal('below-minimum', maxTransferM2, { id: e.id, name: e.name, asked, floor });
        }
    }
    return { ok: true, code: null, offenderId: null, offenderName: null, askedAreaM2: null, floorAreaM2: null, maxTransferM2 };
}

/** Order-independent key so (A,B) and (B,A) are ONE link. Mirrors the name-keyed stash. */
export function linkKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

/** A distinct name for a new room of `kind`: "Bedroom", then "Bedroom 2", "Bedroom 3"… */
export function nextRoomName(
  entries: readonly RoomProgrammeEntry[],
  kind: ResidentialRoomKind,
): string {
  const base = residentialRoomEntry(kind)?.label ?? kind;
  const taken = new Set(entries.map((e) => e.name));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 500; n += 1) {
    const c = `${base} ${n}`;
    if (!taken.has(c)) return c;
  }
  return `${base} ${entries.length + 1}`;
}

/**
 * The ONE reducer. Total, pure, never throws; an intent it cannot honour returns the
 * state UNCHANGED (referentially identical), so a caller can tell "nothing happened"
 * from "something happened" without a second channel.
 */
export function reduceRoomProgramme(
  state: RoomProgramme,
  intent: RoomProgrammeIntent,
): RoomProgramme {
  switch (intent.type) {
    case 'programme.add-room': {
      if (!isResidentialRoomKind(intent.kind)) return state;
      if (typeof intent.id !== 'string' || intent.id.length === 0) return state;
      if (state.entries.some((e) => e.id === intent.id)) return state;
      const lib = residentialRoomEntry(intent.kind)!;
      const name = (intent.name ?? '').trim() || nextRoomName(state.entries, intent.kind);
      return {
        entries: [
          ...state.entries,
          { id: intent.id, kind: intent.kind, name, targetAreaM2: lib.targetAreaM2 },
        ],
        links: state.links,
      };
    }

    case 'programme.remove-room': {
      if (!state.entries.some((e) => e.id === intent.id)) return state;
      const kept = state.entries.filter((e) => e.id !== intent.id);
      return {
        // §ROOM-PIN — A PIN THAT NO LONGER ADDRESSES A POSITION IS DROPPED, AND DROPPING IT IS
        // NOT CLAMPING. The solved sequence is exactly as long as the programme, so removing a
        // room can leave a pin addressing a slot that has ceased to exist. Clamping would keep
        // the pin's AUTHORITY while silently moving the room somewhere the user never chose —
        // the arrangement-eaten-by-a-re-solve failure with a pin's name on it. Dropping it
        // returns that ONE room to the solver, which is the documented default and visibly so.
        // Every in-range pin is untouched, so the arrangement the user built survives.
        entries: kept.map((e) => (
          e.pinnedOrder !== undefined && e.pinnedOrder >= kept.length
            ? { id: e.id, kind: e.kind, name: e.name, targetAreaM2: e.targetAreaM2 }
            : e
        )),
        // ⭐ Removing a room removes its relationships. A link to a room that is gone is
        // not a relationship the user still holds — it is a dangling reference, and the
        // §ROOM-ADJACENCY-NAME-MISS log exists because the name-keyed stash kept them.
        links: state.links.filter((l) => l.aId !== intent.id && l.bId !== intent.id),
      };
    }

    case 'programme.rename-room': {
      const name = (intent.name ?? '').trim();
      if (!name) return state;
      const cur = state.entries.find((e) => e.id === intent.id);
      if (!cur || cur.name === name) return state;
      return {
        entries: state.entries.map((e) => (e.id === intent.id ? { ...e, name } : e)),
        // ⭐ The links do not move. They are keyed by ID.
        links: state.links,
      };
    }

    case 'programme.set-area': {
      const v = intent.targetAreaM2;
      if (!Number.isFinite(v) || v <= 0) return state;
      const cur = state.entries.find((e) => e.id === intent.id);
      if (!cur || cur.targetAreaM2 === v) return state;
      return {
        entries: state.entries.map((e) => (e.id === intent.id ? { ...e, targetAreaM2: v } : e)),
        links: state.links,
      };
    }

    case 'programme.link': {
      const { aId, bId } = intent;
      if (!aId || !bId || aId === bId) return state;
      const ids = new Set(state.entries.map((e) => e.id));
      if (!ids.has(aId) || !ids.has(bId)) return state;
      const k = linkKey(aId, bId);
      if (state.links.some((l) => linkKey(l.aId, l.bId) === k)) return state;
      return { entries: state.entries, links: [...state.links, { aId, bId }] };
    }

    case 'programme.unlink': {
      const k = linkKey(intent.aId, intent.bId);
      const next = state.links.filter((l) => linkKey(l.aId, l.bId) !== k);
      if (next.length === state.links.length) return state;
      return { entries: state.entries, links: next };
    }

    case 'programme.pin-room': {
      const { id, order } = intent;
      if (!Number.isInteger(order)) return state;
      // ⛔ THE RANGE IS REFUSED, NEVER CORRECTED. `0 … entries.length - 1` is the whole solved
      // sequence; an order outside it names no cell. Returning the state unchanged makes
      // `applyRoomProgrammeIntent` answer `false`, which is the caller's channel for "that did
      // not happen" — see the reducer's referential-identity contract above.
      if (order < 0 || order >= state.entries.length) return state;
      const cur = state.entries.find((e) => e.id === id);
      if (!cur) return state;
      if (cur.pinnedOrder === order) return state;
      // ⛔ ONE ROOM PER SLOT. Two rooms pinned to the same cell is not a preference the solver
      // can split the difference on; the second pin is refused and the first stands. The caller
      // that wants a SWAP asks for one explicitly, by unpinning first — a drag that displaces
      // someone else's pin without saying so is the same silent overwrite in a nicer costume.
      if (state.entries.some((e) => e.id !== id && e.pinnedOrder === order)) return state;
      return {
        entries: state.entries.map((e) => (e.id === id ? { ...e, pinnedOrder: order } : e)),
        links: state.links,
      };
    }

    case 'programme.draw-room': {
      // ⛔ EVERY TEST THIS CASE APPLIES IS ONE THE SOLVER WOULD OTHERWISE APPLY LATER, AND THAT IS
      // THE POINT. A drawn room that entered the brief and then made `solveProgrammeLayout` refuse
      // would replace the user's whole plan with a refusal card — one bad rectangle costing him
      // the drawing he was working on. Refusing the INTENT leaves the plan exactly as it was.
      if (!isResidentialRoomKind(intent.kind)) return state;
      if (typeof intent.id !== 'string' || intent.id.length === 0) return state;
      if (state.entries.some((e) => e.id === intent.id)) return state;
      const v = intent.targetAreaM2;
      if (!Number.isFinite(v) || v <= 0) return state;
      const lib = residentialRoomEntry(intent.kind)!;
      // ⛔ REFUSED, NEVER RAISED TO THE FLOOR (C83). Seating a drawn room at the minimum would
      // report an area nobody drew under a gesture the user believes he controlled — and it is
      // the SAME floor `solveProgrammeLayout` refuses `room-below-minimum` on, so accepting one
      // below it merely moves the refusal to where it destroys more.
      if (v < lib.minAreaM2) return state;
      const name = (intent.name ?? '').trim() || nextRoomName(state.entries, intent.kind);
      // The drawn room is appended, so the positions a pin may address run `0 … entries.length`
      // INCLUSIVE — the new last slot exists only because this room does.
      const n = state.entries.length + 1;
      const wants = intent.atOrder;
      const seatable =
        wants !== undefined
        && Number.isInteger(wants)
        && wants >= 0
        && wants < n
        // ⛔ ONE ROOM PER SLOT, the rule `programme.pin-room` states. A drawing that lands on a
        // slot someone else pinned does not evict them; the room arrives unpinned instead, and
        // the panel says which of the two happened because it reads THIS state back.
        && !state.entries.some((e) => e.pinnedOrder === wants);
      const added: RoomProgrammeEntry = seatable
        ? { id: intent.id, kind: intent.kind, name, targetAreaM2: v, pinnedOrder: wants }
        : { id: intent.id, kind: intent.kind, name, targetAreaM2: v };
      return {
        entries: [...state.entries, added],
        // ⭐ A DRAWN ROOM ARRIVES WITH NO RELATIONSHIPS, AND THAT IS AN ANSWER, NOT AN OMISSION.
        // Guessing a link from adjacency would put an edge in the graph the user never plugged,
        // and the graph is the INPUT to the layout (§25.5) — an invented edge would then move
        // rooms he did not touch. He plugs the relationships he wants, as for any other room.
        links: state.links,
      };
    }

    case 'programme.resize-pair': {
      // ⛔ ONE ASKER. Every test lives in `describePairResize`; this case decides nothing of its
      // own, so the sentence the panel shows the user is derived from the very verdict that
      // refused the intent — not from a second reading of the same rules (C84 EI-8a).
      const verdict = describePairResize(state, intent.aId, intent.aAreaM2, intent.bId, intent.bAreaM2);
      if (!verdict.ok) return state;
      const a = state.entries.find((e) => e.id === intent.aId)!;
      const b = state.entries.find((e) => e.id === intent.bId)!;
      // A wall released where it was grabbed is a CANCEL, not an edit — the same rule the pin
      // gesture states for a release on its own cell.
      if (a.targetAreaM2 === intent.aAreaM2 && b.targetAreaM2 === intent.bAreaM2) return state;
      return {
        entries: state.entries.map((e) => (
          e.id === intent.aId ? { ...e, targetAreaM2: intent.aAreaM2 }
            : e.id === intent.bId ? { ...e, targetAreaM2: intent.bAreaM2 }
              : e
        )),
        // ⭐ THE PINS AND THE LINKS DO NOT MOVE. A wall drag restates two AREAS and nothing else:
        // the seriation is the graph's, and the order is the pins'. Touching either here would
        // make one gesture mean two things.
        links: state.links,
      };
    }

    case 'programme.unpin-room': {
      const cur = state.entries.find((e) => e.id === intent.id);
      if (!cur || cur.pinnedOrder === undefined) return state;
      return {
        entries: state.entries.map((e) => (
          e.id === intent.id
            // Rebuilt WITHOUT the key rather than set to `undefined`, so an unpinned entry is
            // structurally identical to one that was never pinned — nothing downstream, and no
            // future serialiser, can tell the two apart or has to.
            ? { id: e.id, kind: e.kind, name: e.name, targetAreaM2: e.targetAreaM2 }
            : e
        )),
        links: state.links,
      };
    }

    case 'programme.reset':
      return intent.next;

    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DERIVED READS
// ─────────────────────────────────────────────────────────────────────────────

export function programmeTotalTargetAreaM2(p: RoomProgramme): number {
  return p.entries.reduce((s, e) => s + e.targetAreaM2, 0);
}

/** Degree of every entry, links only (isolated rooms are present with 0). */
export function programmeDegrees(p: RoomProgramme): ReadonlyMap<string, number> {
  const d = new Map<string, number>(p.entries.map((e) => [e.id, 0]));
  for (const l of p.links) {
    if (d.has(l.aId)) d.set(l.aId, d.get(l.aId)! + 1);
    if (d.has(l.bId)) d.set(l.bId, d.get(l.bId)! + 1);
  }
  return d;
}

/**
 * The programme as `ProgrammeRoomSpec[]` — the plan's named DEAD type, given its first
 * consumer. `adjacencies` are DISPLAY NAMES because that is the field's declared shape.
 */
export function toProgrammeRoomSpecs(p: RoomProgramme): readonly ProgrammeRoomSpec[] {
  const nameOf = new Map(p.entries.map((e) => [e.id, e.name]));
  return p.entries.map((e) => {
    const lib = residentialRoomEntry(e.kind)!;
    const occ = lib.mapping.kind === 'mapped' ? lib.mapping.occupancy : 'unclassified';
    const adjacencies: string[] = [];
    for (const l of p.links) {
      if (l.aId === e.id) { const n = nameOf.get(l.bId); if (n) adjacencies.push(n); }
      else if (l.bId === e.id) { const n = nameOf.get(l.aId); if (n) adjacencies.push(n); }
    }
    return {
      occupancyType: occ,
      name: e.name,
      targetArea: e.targetAreaM2,
      minArea: lib.minAreaM2,
      quantity: 1,
      adjacencies,
      mustBeOnLevel: 'any',
    };
  });
}

/**
 * Build the default residential brief. The caller supplies the id minter (CA-2 — this
 * module never mints, so a second call with the same minter is reproducible).
 */
export function defaultResidentialProgramme(mintId: (kind: string) => string): RoomProgramme {
  const plan: ReadonlyArray<readonly [ResidentialRoomKind, string]> = [
    ['hall', 'Hall'],
    ['living', 'Living'],
    ['kitchen', 'Kitchen'],
    ['bedroom', 'Bedroom'],
    ['ensuite', 'Ensuite'],
    ['bathroom', 'Bathroom'],
    ['stair', 'Stair'],
  ];
  let s: RoomProgramme = EMPTY_ROOM_PROGRAMME;
  const byName = new Map<string, string>();
  for (const [kind, name] of plan) {
    const id = mintId(kind);
    byName.set(name, id);
    s = reduceRoomProgramme(s, { type: 'programme.add-room', id, kind, name });
  }
  // STR §9's own list, minus the two that need a Garden / Entrance node this stage has
  // no room kind for. Naming that omission rather than inventing the nodes.
  const wanted: ReadonlyArray<readonly [string, string]> = [
    ['Hall', 'Living'],
    ['Hall', 'Stair'],
    ['Hall', 'Bathroom'],
    ['Living', 'Kitchen'],
    ['Bedroom', 'Ensuite'],
    ['Hall', 'Bedroom'],
  ];
  for (const [a, b] of wanted) {
    const aId = byName.get(a);
    const bId = byName.get(b);
    if (aId && bId) s = reduceRoomProgramme(s, { type: 'programme.link', aId, bId });
  }
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE SESSION STASH — the sibling of `activeRoom*Overrides.ts`
// ─────────────────────────────────────────────────────────────────────────────

let _programme: RoomProgramme = EMPTY_ROOM_PROGRAMME;
const _listeners = new Set<() => void>();

/** The live brief. Never null — an empty programme is a state, not an absence. */
export function getRoomProgramme(): RoomProgramme {
  return _programme;
}

/**
 * Apply an intent. Returns `true` iff the state actually changed, so a caller can skip
 * a re-solve it does not need — the reducer's referential-identity contract is what
 * makes that a cheap and honest test.
 *
 * ⭐ AND IT IS THE ONE PLACE THE HISTORY IS WRITTEN. Every mutation of the brief in this
 * repo goes through this function — the panel has fourteen call sites and no other route —
 * so recording the previous state HERE makes "one gesture, one undo step" a property of the
 * choke point rather than a discipline fourteen call sites have to keep (C84 EI-8a).
 */
export function applyRoomProgrammeIntent(
  intent: RoomProgrammeIntent,
  opts?: ApplyRoomProgrammeOptions,
): boolean {
  const prev = _programme;
  const next = reduceRoomProgramme(prev, intent);
  // ⛔ A REFUSED INTENT IS NOT AN UNDO STEP. The reducer returns the state referentially
  // unchanged when it refuses, so a refused draw leaves the top of the history pointing at
  // the last gesture that DID something — which is what the next Ctrl+Z should take back.
  if (next === prev) return false;
  if (opts?.undoable === false) {
    // ⚠ INVISIBLE TO THE HISTORY, NOT A HISTORY RESET. The one caller is the panel's
    // mount-time load of the project's own rooms: the user did not ask for it, so it must not
    // be what his first Ctrl+Z takes back, and it must not erase the gestures underneath it.
    _future = [];
  } else {
    _past.push({ state: prev, label: describeProgrammeIntent(prev, next, intent) });
    if (_past.length > ROOM_PROGRAMME_HISTORY_LIMIT) _past.shift();
    // A new branch invalidates the old one — the standard rule, stated so nobody re-adds a
    // redo that would re-apply a state reached from a programme that no longer exists.
    _future = [];
  }
  _programme = next;
  _notify();
  return true;
}

function _notify(): void {
  for (const fn of [..._listeners]) {
    try { fn(); } catch (e) { console.warn('[room-programme] listener threw (non-fatal):', e); }
  }
}

/** Subscribe to programme changes. Returns the unsubscribe. */
export function subscribeRoomProgramme(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

/**
 * Drop the brief (e.g. a project switch). Notifies.
 *
 * ⛔ IT DROPS THE HISTORY TOO, AND THAT IS THE POINT OF DOING IT HERE. An undo that reached
 * back across a project switch would restore ANOTHER project's brief onto this plate —
 * rooms measured against a footprint that is no longer on screen. The states are dropped
 * rather than kept-and-guarded because a guard is a second thing to get right.
 */
export function clearRoomProgramme(): void {
  const had = _past.length > 0 || _future.length > 0;
  _past = [];
  _future = [];
  if (_programme.entries.length === 0 && _programme.links.length === 0) {
    // The brief was already empty, but the history may not have been — notify so a panel
    // showing enabled Undo/Redo buttons repaints them disabled.
    if (had) _notify();
    return;
  }
  applyRoomProgrammeIntent({ type: 'programme.reset', next: EMPTY_ROOM_PROGRAMME }, { undoable: false });
}

// ─────────────────────────────────────────────────────────────────────────────
// §ROOM-BRIEF-UNDO (L-13120) — TAKING BACK THE GESTURE YOU JUST MADE
// ─────────────────────────────────────────────────────────────────────────────
//
// ⭐ WHY IT WAS NOT UNDOABLE, STATED BEFORE THE FIX. Two independent reasons, and only the
// second one is a defect:
//
//   1. THE BRIEF IS NOT ON EITHER GLOBAL UNDO STACK, BY DESIGN. `performUndo()`
//      (`apps/editor/src/engine/undo/performUndoRedo.ts`) consults exactly two: the
//      CommandBus ring buffer and the legacy `commandManager`. A programme edit reaches
//      neither, because it is not a bus command — this file's header argues that in full and
//      C52 §3 is the discipline. ⛔ THIS IS NOT A P6 BREACH. P6 governs the DOMAIN stores
//      (persisted, exported, rendered, collaborated); a session brief is none of those, and
//      the blessed precedent is the `activeRoom*Overrides` family.
//   2. THE STASH KEPT NO HISTORY. `applyRoomProgrammeIntent` overwrote `_programme` and
//      dropped the previous value on the floor. So even a panel-local Ctrl+Z had nothing to
//      restore. THAT is the defect, and it is the one fixed here: the missing thing was a
//      history, not a command.
//
// ⛔ THE ALTERNATIVE — MINT BUS COMMANDS FOR THE BRIEF — WAS REJECTED, NOT OVERLOOKED. It
// would put a session brief into the ring buffer, whose entries carry `affectedStores` and
// drive inverse PATCHES against real stores (C03 §4.8); a brief has no store to patch, so the
// entry would be uncoverable — the `stranded` case `performUndo` reports when an entry cannot
// be applied. It would also interleave brief edits with element edits on ONE stack, so a
// Ctrl+Z aimed at a wall would take back a room's area. A separate history for a separate
// subject is the smaller and more honest structure; what it costs is the ordering question
// the panel answers, and answers explicitly.
//
// ⭐ ONE GESTURE = ONE STEP IS INHERITED, NOT ARRANGED (C114 §6a). It holds because the
// gestures were already atomic INTENTS: `programme.draw-room` is one intent for one rectangle
// (that argument is at the intent), `programme.resize-pair` is one for one wall drag, and the
// list's inputs dispatch on `change`, not `input`, so typing an area is one step and not one
// per keystroke. No coalescing window, no clock, no debounce — and therefore nothing that can
// merge two gestures the user made separately.

/** How many programme states back one session remembers. Snapshots are small (ids + numbers). */
export const ROOM_PROGRAMME_HISTORY_LIMIT = 100;

export interface ApplyRoomProgrammeOptions {
  /**
   * `false` ⇒ this change is invisible to the undo history. For changes the USER DID NOT
   * MAKE — today, exactly one: the panel's automatic mount-time load of the project's rooms.
   */
  readonly undoable?: boolean;
}

/** What one step of the history holds: the state to return to, and the words for it. */
interface RoomProgrammeHistoryStep {
  readonly state: RoomProgramme;
  readonly label: string;
}

export interface RoomProgrammeHistoryDepth {
  readonly past: number;
  readonly future: number;
}

export interface ProgrammeHistoryOutcome {
  readonly ok: boolean;
  /** What was taken back / put back — the SAME words the control offered beforehand. */
  readonly label: string | null;
}

let _past: RoomProgrammeHistoryStep[] = [];
let _future: RoomProgrammeHistoryStep[] = [];

/**
 * Name the change an intent makes, in words a user can check against what he just did.
 *
 * ⭐ IT IS DERIVED HERE AND NOWHERE ELSE. An undo control that says only *"Undo"* asks the
 * user to remember; one that says *"takes back the Bedroom 2 you drew"* can be checked before
 * it is pressed — the same rule C83 §1.2 states for refusals, applied to the reverse gesture.
 * Deriving it at the choke point (rather than passing a label in from fourteen call sites)
 * is what stops the words and the state disagreeing.
 *
 * Pure: `prev` names rooms the intent removes, `next` names rooms it creates.
 */
export function describeProgrammeIntent(
  prev: RoomProgramme,
  next: RoomProgramme,
  intent: RoomProgrammeIntent,
): string {
  const nameIn = (p: RoomProgramme, id: string): string =>
    p.entries.find((e) => e.id === id)?.name ?? 'a room';
  switch (intent.type) {
    case 'programme.add-room':
      return `adding ${nameIn(next, intent.id)}`;
    case 'programme.draw-room':
      return `the ${nameIn(next, intent.id)} you drew`;
    case 'programme.remove-room':
      return `removing ${nameIn(prev, intent.id)}`;
    case 'programme.rename-room':
      return `renaming ${nameIn(prev, intent.id)} to ${nameIn(next, intent.id)}`;
    case 'programme.set-area':
      return `resizing ${nameIn(prev, intent.id)} to ${intent.targetAreaM2.toFixed(2)} m²`;
    case 'programme.link':
      return `linking ${nameIn(prev, intent.aId)} to ${nameIn(prev, intent.bId)}`;
    case 'programme.unlink':
      return `unlinking ${nameIn(prev, intent.aId)} from ${nameIn(prev, intent.bId)}`;
    case 'programme.pin-room':
      return `moving ${nameIn(prev, intent.id)} to position ${intent.order + 1}`;
    case 'programme.unpin-room':
      return `unpinning ${nameIn(prev, intent.id)}`;
    case 'programme.resize-pair':
      return `the wall you moved between ${nameIn(prev, intent.aId)} and ${nameIn(prev, intent.bId)}`;
    case 'programme.reset':
      return `replacing the programme with ${intent.next.entries.length} room`
        + `${intent.next.entries.length === 1 ? '' : 's'}`;
    default:
      // Unreachable while the union is exhausted above; a NAME is still better than a throw.
      return 'that change';
  }
}

/** What the next undo would take back, or `null` when there is nothing to take back. */
export function peekRoomProgrammeUndo(): string | null {
  return _past.length > 0 ? _past[_past.length - 1]!.label : null;
}

/** What the next redo would put back, or `null` when there is nothing to put back. */
export function peekRoomProgrammeRedo(): string | null {
  return _future.length > 0 ? _future[_future.length - 1]!.label : null;
}

export function roomProgrammeHistoryDepth(): RoomProgrammeHistoryDepth {
  return { past: _past.length, future: _future.length };
}

/**
 * Take back the last gesture. Notifies exactly as an intent does, so every subscriber
 * repaints through the ONE path it already has.
 *
 * ⛔ IT RESTORES A SNAPSHOT, IT DOES NOT INVERT AN INTENT. A brief is a handful of ids,
 * names and numbers, so the whole state is cheaper to keep than an inverse is to derive —
 * and an inverse that is derived can be WRONG, which is the failure mode a restore does not
 * have. The ring buffer pays for inverse patches because it is undoing megabytes of geometry.
 */
export function undoRoomProgramme(): ProgrammeHistoryOutcome {
  const step = _past.pop();
  if (!step) return { ok: false, label: null };
  _future.push({ state: _programme, label: step.label });
  _programme = step.state;
  _notify();
  return { ok: true, label: step.label };
}

/** Put back what the last undo took. Mirror of {@link undoRoomProgramme}. */
export function redoRoomProgramme(): ProgrammeHistoryOutcome {
  const step = _future.pop();
  if (!step) return { ok: false, label: null };
  _past.push({ state: _programme, label: step.label });
  _programme = step.state;
  _notify();
  return { ok: true, label: step.label };
}

/**
 * Forget the history, keeping the brief. For a caller that has just replaced the brief by a
 * route this module cannot see, and for specs that need a known starting depth.
 */
export function resetRoomProgrammeHistory(): void {
  if (_past.length === 0 && _future.length === 0) return;
  _past = [];
  _future = [];
  _notify();
}
