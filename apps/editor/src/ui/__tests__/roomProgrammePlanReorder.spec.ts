/**
 * §ROOM-PIN (L-13079) — REORGANISING THE ROOMS ON THE PLAN VIEW.
 *
 * Subjects:  apps/editor/src/ui/room-programme/roomProgrammePanel.ts
 *            apps/editor/src/ui/room-programme/roomProgrammeModel.ts
 *            apps/editor/src/ui/room-programme/programmeToEnvelopes.ts
 * Strategy:  STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §9 · §10 · §25.5
 * Contracts: C83 §1.2 (a refusal carries BOTH numbers) · C52 §3 (session override → re-run)
 *
 * Founder 2026-09-07: *"This room locator needs to be more flexible and more dynamic — I
 * shall be able to reorganize also the rooms on the plan view — draw them etc."*
 *
 * ⛔ WHY THIS SPEC IS ABOUT PERSISTENCE AND NOT ABOUT DRAGGING. L-13079's blocking finding is
 * that `render()` calls `solveProgrammeLayout` UNCONDITIONALLY on every intent, subscription and
 * store-dirty event, and the layout was a pure function of `(levelRing, programme)`. A drag that
 * moved a polygon and did not change the PROGRAMME would therefore be undone by the user's very
 * next keystroke — *"silently re-solves away the user's arrangement", worse than not shipping*.
 * So the arm that matters here is: after the gesture, does the programme hold a pin, and does a
 * subsequent unrelated edit leave the room where he put it?
 *
 * ⚠ WHAT THIS SPEC DOES NOT CLAIM, STATED SO NOBODY READS IT AS PROVEN: the pin lives in the
 * SESSION brief (`roomProgrammeModel.ts`, a module stash whose own header says *"⛔ NOTHING HERE
 * PERSISTS"*), so it does NOT survive a reload, and no assertion here pretends otherwise. What it
 * survives is the re-solve, which is the thing that was eating arrangements.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  ROOM_CELL_ID_ATTR,
  ROOM_CELL_ORDER_ATTR,
  ROOM_CELL_PINNED_ATTR,
  ROOM_PROGRAMME_PREVIEW_TESTID,
  ROOM_PROGRAMME_STATUS_TESTID,
  mountRoomProgrammePanel,
  type RoomProgrammePanelDeps,
} from '../room-programme/roomProgrammePanel';
import {
  EMPTY_ROOM_PROGRAMME,
  applyRoomProgrammeIntent,
  clearRoomProgramme,
  getRoomProgramme,
} from '../room-programme/roomProgrammeModel';
import type { SpaceEnvelopeRecordLike } from '../room-programme/roomEnvelopePlan';

/** A 24 × 10 m plate = 240 m², matching `roomProgrammeGraphLayout.spec.ts`. */
const PLATE = [
  { x: 0, y: 0, z: 0 },
  { x: 24, y: 0, z: 0 },
  { x: 24, y: 0, z: 10 },
  { x: 0, y: 0, z: 10 },
];

const LEVEL_REC: SpaceEnvelopeRecordLike = {
  id: 'lvl-env-1',
  role: 'level',
  levelId: 'L0',
  name: 'Ground floor envelope',
  baseOffset: 0,
  height: 3,
  withinId: null,
  footprint: PLATE,
};

function deps(over: Partial<RoomProgrammePanelDeps> = {}): RoomProgrammePanelDeps {
  let n = 0;
  return {
    resolveRuntime: () => null,
    readSpaceEnvelopes: () => [LEVEL_REC],
    readActiveLevelId: () => 'L0',
    mintId: () => `mint-${(n += 1)}`,
    readProjectRooms: () => [],
    ...over,
  };
}

/** Four rooms that fit the plate with room to spare, so the solver never refuses. */
function seedProgramme(): void {
  const rooms: ReadonlyArray<readonly [string, string, number]> = [
    ['living', 'living', 40],
    ['kitchen', 'kitchen', 30],
    ['bed', 'bedroom', 25],
    ['bath', 'bathroom', 12],
  ];
  for (const [id, kind, area] of rooms) {
    applyRoomProgrammeIntent({ type: 'programme.add-room', id, kind: kind as never, name: id });
    applyRoomProgrammeIntent({ type: 'programme.set-area', id, targetAreaM2: area });
  }
  applyRoomProgrammeIntent({ type: 'programme.link', aId: 'living', bId: 'kitchen' });
}

const cells = (host: HTMLElement): HTMLElement[] =>
  [...host.querySelectorAll<HTMLElement>(
    `[data-testid="${ROOM_PROGRAMME_PREVIEW_TESTID}"] g[${ROOM_CELL_ID_ATTR}]`,
  )];

const idsInOrder = (host: HTMLElement): string[] =>
  cells(host).map((g) => g.getAttribute(ROOM_CELL_ID_ATTR)!);

const cellFor = (host: HTMLElement, id: string): HTMLElement =>
  cells(host).find((g) => g.getAttribute(ROOM_CELL_ID_ATTR) === id)!;

/**
 * Drive the reorder exactly as a browser produces it: `pointerdown` on the SOURCE cell, then
 * `pointerup` ON THE DESTINATION, bubbling to the `<svg>` that carries the release listener.
 *
 * ⛔ THE RELEASE IS DISPATCHED ON THE DESTINATION BECAUSE THAT IS WHERE A BROWSER FIRES IT.
 * Without pointer capture, `pointerup` goes to the element under the pointer at release, not to
 * the one the gesture started on. Dispatching it on the source — with the destination faked into
 * `event.target` — would pass against a per-cell listener the browser would never invoke, which
 * is §FAKE-MORE-CAPABLE-THAN-REAL: a fixture built from the implementation cannot falsify it.
 * Releasing on the polygon (a CHILD of the cell group) also exercises the handler's `closest()`
 * walk, which is how a release on a room's own label resolves to that room.
 */
function dragOnto(host: HTMLElement, fromId: string, toId: string): void {
  const from = cellFor(host, fromId);
  const to = cellFor(host, toId);
  from.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  (to.querySelector('polygon') ?? to).dispatchEvent(new Event('pointerup', { bubbles: true }));
}

let host: HTMLElement;

beforeEach(() => {
  clearRoomProgramme();
  applyRoomProgrammeIntent({ type: 'programme.reset', next: EMPTY_ROOM_PROGRAMME });
  document.body.replaceChildren();
  host = document.createElement('div');
  document.body.appendChild(host);
});

describe('§ROOM-PIN — the plan cells are ADDRESSABLE (the blocker that came first)', () => {
  it('every room cell carries its id and its position — not just a prose <title>', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const list = cells(host);
    expect(list).toHaveLength(4);
    for (const [i, g] of list.entries()) {
      expect(g.getAttribute(ROOM_CELL_ID_ATTR)).toBeTruthy();
      // ⭐ The position is the currency a pin is written in, and it must be the INDEX in the
      // solved order — `layout.cells[i].roomId === layout.order[i]` by construction.
      expect(g.getAttribute(ROOM_CELL_ORDER_ATTR)).toBe(String(i));
    }
    // Distinct ids: two cells claiming one room would make every gesture ambiguous.
    expect(new Set(idsInOrder(host)).size).toBe(4);
    panel.dispose();
  });

  it('nothing is pinned until the user pins something', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    expect(cells(host).some((g) => g.hasAttribute(ROOM_CELL_PINNED_ATTR))).toBe(false);
    for (const e of getRoomProgramme().entries) expect(e.pinnedOrder).toBeUndefined();
    panel.dispose();
  });
});

describe('§ROOM-PIN — dragging a room writes a pin that the re-solve honours', () => {
  it('⭐ a drag moves the room AND persists as a pin — the arrangement is not decorative', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const before = idsInOrder(host);
    const moved = before[before.length - 1]!;
    const target = before[0]!;

    dragOnto(host, moved, target);

    // The PROGRAMME changed, which is the whole point: a drag that only moved pixels would be
    // erased by the next re-solve.
    expect(getRoomProgramme().entries.find((e) => e.id === moved)!.pinnedOrder).toBe(0);
    // …and the strip repainted to show it.
    expect(idsInOrder(host)[0]).toBe(moved);
    expect(cellFor(host, moved).getAttribute(ROOM_CELL_PINNED_ATTR)).toBe('1');
    panel.dispose();
  });

  it('⛔ THE DEFECT L-13079 NAMES: an unrelated rename no longer erases the arrangement', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const moved = idsInOrder(host)[3]!;
    dragOnto(host, moved, idsInOrder(host)[0]!);
    expect(idsInOrder(host)[0]).toBe(moved);

    // The intent the finding calls out by name — `render()` re-solves unconditionally on it.
    applyRoomProgrammeIntent({ type: 'programme.rename-room', id: 'bath', name: 'Shower room' });
    expect(idsInOrder(host)[0]).toBe(moved);

    // …and so does adding a room, which changes the seriation for everyone else.
    applyRoomProgrammeIntent({ type: 'programme.add-room', id: 'study', kind: 'office' as never });
    expect(idsInOrder(host)[0]).toBe(moved);
    panel.dispose();
  });

  it('the rooms the user did NOT pin keep their relative order around the pin', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const before = idsInOrder(host);
    const moved = before[before.length - 1]!;
    dragOnto(host, moved, before[0]!);
    expect(idsInOrder(host)).toEqual([moved, ...before.filter((id) => id !== moved)]);
    panel.dispose();
  });

  it('a release on the room it started on is a CANCEL, not a pin', () => {
    // ⛔ A stray click must not become a silent commitment.
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const id = idsInOrder(host)[1]!;
    dragOnto(host, id, id);
    expect(getRoomProgramme().entries.find((e) => e.id === id)!.pinnedOrder).toBeUndefined();
    panel.dispose();
  });

  it('double-clicking a pinned room hands it back to the solver, and says so', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const moved = idsInOrder(host)[3]!;
    dragOnto(host, moved, idsInOrder(host)[0]!);
    expect(getRoomProgramme().entries.find((e) => e.id === moved)!.pinnedOrder).toBe(0);

    cellFor(host, moved).dispatchEvent(new Event('dblclick', { bubbles: true }));
    expect(getRoomProgramme().entries.find((e) => e.id === moved)!.pinnedOrder).toBeUndefined();
    const status = host.querySelector(`[data-testid="${ROOM_PROGRAMME_STATUS_TESTID}"]`);
    expect(status?.textContent ?? '').toContain('no longer pinned');
    panel.dispose();
  });
});

describe('§ROOM-PIN — a refused move is SPOKEN, never a silent no-op', () => {
  it('⛔ dragging onto a slot another room is pinned to names the holder and the way out', () => {
    // A drag that appears to do nothing is exactly the "did my change save?" failure this lane
    // exists to remove, so the collision the reducer refuses must reach the user in words.
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const first = idsInOrder(host)[0]!;
    const second = idsInOrder(host)[1]!;
    const third = idsInOrder(host)[2]!;

    dragOnto(host, second, first);          // second is now pinned at position 0
    expect(getRoomProgramme().entries.find((e) => e.id === second)!.pinnedOrder).toBe(0);

    dragOnto(host, third, second);          // …and `second` still holds position 0
    expect(getRoomProgramme().entries.find((e) => e.id === third)!.pinnedOrder).toBeUndefined();
    const status = host.querySelector(`[data-testid="${ROOM_PROGRAMME_STATUS_TESTID}"]`);
    const text = status?.textContent ?? '';
    expect(text).toContain('position 1');
    expect(text).toContain('will not decide which of the two you meant');
    expect(text).toContain('unpin');
    panel.dispose();
  });

  it('the pin states that Ctrl+Z will not release it — the brief is not the undo stack', () => {
    // ⚠ `roomProgrammeModel.ts` argues P6 in full: a programme is a session BRIEF, not a domain
    // store, and the bus is reached when it is COMMITTED. So the panel must not let the user
    // believe a pin is undoable. Saying it is cheaper than the support ticket that isn't.
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    dragOnto(host, idsInOrder(host)[3]!, idsInOrder(host)[0]!);
    const status = host.querySelector(`[data-testid="${ROOM_PROGRAMME_STATUS_TESTID}"]`);
    expect(status?.textContent ?? '').toContain('Ctrl+Z');
    panel.dispose();
  });
});
