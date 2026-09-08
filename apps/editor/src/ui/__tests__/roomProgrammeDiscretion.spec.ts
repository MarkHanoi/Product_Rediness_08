/**
 * §STAGE-05-DENSITY (C115 §8.1 `C115-173`/`C115-174` · L-13237) — THE ROOM SURFACE GOT SMALLER
 * AND LOST NOTHING.
 *
 * Subject:   apps/editor/src/ui/room-programme/roomProgrammePanel.ts
 * Founder 2026-09-07: *"THE ROOMS SHOULD BE THE NEW SECTION 4 — BUT MAKE IT SMALLER AND MORE
 * DISCREET — BOTH THE ROOM GRAPH AND THE 'ROOMS PER LEVEL' SECTION — SLIGHTLY SMALLER."*
 * Contracts: C115 `C115-72` (⛔ do not remove the graph — it is the INPUT to the solver) ·
 *            `C115-74` (seven graph behaviours) · `C115-76` (the library, the list, the actions) ·
 *            `C115-39` clauses 1 and 4 (a named absence has something to say; the escape hatch
 *            survives) · `C115-77` (the programme is session-only and must say so).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ⭐ WHY THIS FILE EXISTS AT ALL, AND WHY IT IS WRITTEN AS A PAIR OF STATES
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * "Make it smaller" is the single most dangerous instruction on this surface, because the cheapest
 * way to satisfy it is to delete something and the reader cannot tell the difference from a
 * screenshot. C115 §13 AC-4 answers that with *"0 graph functionality removed"*, and an assertion
 * is not evidence — so every arm below is a BEHAVIOUR exercised on the compacted panel, not a
 * property of a constant.
 *
 * ⛔ AND IT MUST NOT BE VACUOUS. happy-dom has no layout engine, so no spec here can measure a
 * rendered pixel; a suite that "proved smaller" by reading a CSS string would pass forever. What
 * IS falsifiable is the ARM: the canvas declares `data-graph-arm="compact"` with a stated height
 * when the programme is empty and `full` with no height when it is not, and the transition
 * between them is driven here by a REAL drop and a REAL click — the two gestures that add a room.
 * Restore the old always-190 canvas and the first arm fails; break the drop target to get the
 * height down and the second fails.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  ROOM_PROGRAMME_CHIP_ATTR,
  ROOM_PROGRAMME_GRAPH_EMPTY_ATTR,
  ROOM_PROGRAMME_GRAPH_TESTID,
  ROOM_PROGRAMME_LIBRARY_TESTID,
  ROOM_PROGRAMME_LIST_TESTID,
  ROOM_PROGRAMME_NODE_ATTR,
  ROOM_PROGRAMME_EDGE_ATTR,
  ROOM_PROGRAMME_PLACE_BTN_TESTID,
  ROOM_PROGRAMME_SUMMARY_TESTID,
  ROOM_PROGRAMME_SUMMARY_STATE_ATTR,
  ROOM_PROGRAMME_UNDO_TESTID,
  ROOM_PROGRAMME_REDO_TESTID,
  ROOM_DRAG_MIME,
  ROOM_DRAG_PREFIX,
  mountRoomProgrammePanel,
  type RoomProgrammePanelDeps,
} from '../room-programme/roomProgrammePanel';
import {
  clearRoomProgramme,
  getRoomProgramme,
  applyRoomProgrammeIntent,
} from '../room-programme/roomProgrammeModel';
import { RESIDENTIAL_ROOM_LIBRARY } from '../room-programme/residentialRoomLibrary';

function deps(over: Partial<RoomProgrammePanelDeps> = {}): RoomProgrammePanelDeps {
  let n = 0;
  return {
    resolveRuntime: () => null,
    readSpaceEnvelopes: () => [],
    readActiveLevelId: () => 'L0',
    mintId: () => `mint-${(n += 1)}`,
    readProjectRooms: () => [],
    ...over,
  };
}

function mount(): { host: HTMLElement; dispose: () => void } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const panel = mountRoomProgrammePanel(host, deps());
  return { host, dispose: () => { try { panel.dispose(); } catch { /* teardown */ } host.remove(); } };
}

const graphOf = (host: HTMLElement): SVGElement =>
  host.querySelector(`[data-testid="${ROOM_PROGRAMME_GRAPH_TESTID}"]`) as SVGElement;

const summaryOf = (host: HTMLElement): Element | null =>
  host.querySelector(`[data-testid="${ROOM_PROGRAMME_SUMMARY_TESTID}"]`);

/**
 * A `drop` carrying the panel's own drag payload.
 *
 * ⚠ happy-dom has no `DragEvent` constructor and no `DataTransfer`, so the payload is attached to
 * a plain `Event` — the idiom `sheetViewportPlacement.spec.ts` already uses in this suite. The
 * handler reads `dataTransfer.getData`, which is exactly what a browser hands it.
 */
function dropRoom(target: EventTarget, kind: string): void {
  const ev = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'dataTransfer', {
    value: {
      types: [ROOM_DRAG_MIME],
      getData: (t: string) => (t === ROOM_DRAG_MIME ? kind : `${ROOM_DRAG_PREFIX}${kind}`),
    },
  });
  target.dispatchEvent(ev);
}

beforeEach(() => {
  clearRoomProgramme();
  document.body.replaceChildren();
});

// ══════════════════════════════════════════════════════════════════════════════════════════
describe('§STAGE-05-DENSITY — the EMPTY graph is a rail, not a screen of blank canvas', () => {
  it('declares the COMPACT arm with a stated height, and keeps its sentence', () => {
    const m = mount();
    try {
      const svg = graphOf(m.host);
      expect(svg, 'the graph canvas is gone — C115-72 forbids that').not.toBeNull();
      expect(svg.getAttribute(ROOM_PROGRAMME_GRAPH_EMPTY_ATTR)).toBe('compact');
      // ⭐ THE MEASURABLE HALF. The old canvas set a viewBox and `width:100%` and NO height, so a
      // browser sized it by intrinsic ratio — 190/300 = 0.633 × the content width, roughly 250 px
      // of blank card in the founder's panel. A stated height is what removes that.
      expect(svg.getAttribute('height')).toBe('44');
      expect(svg.getAttribute('viewBox')).toBe('0 0 300 44');
      // ⛔ AND THE SENTENCE IS NOT FILLER — C115 §4.4 clause 1 and clause 4. It is the only place
      // the panel tells a reader that a chip CLICK adds a room, which is the one non-pointer route
      // in while C115-78 / D-9 stands.
      expect(svg.textContent).toContain('No rooms yet — drag one in, or click a chip above.');
      expect(svg.getAttribute('role')).toBe('group');
      expect(svg.getAttribute('aria-label')).toContain('0 rooms, 0 relationships');
    } finally { m.dispose(); }
  });

  it('⭐ is STILL A DROP TARGET at 44 px — and the drop grows it back to the full canvas', () => {
    const m = mount();
    try {
      expect(graphOf(m.host).getAttribute(ROOM_PROGRAMME_GRAPH_EMPTY_ATTR)).toBe('compact');
      // C115-74 behaviour 5: drop a library chip onto the graph to add a room. If the height
      // change had been bought by dropping the SVG, or by rendering a `<div>` rail instead, this
      // drop would land on nothing and the programme would stay empty.
      dropRoom(graphOf(m.host), 'kitchen');
      expect(getRoomProgramme().entries, 'the drop did not reach the compact rail').toHaveLength(1);

      // ⭐ GENEROUS WHEN FULL. The founder asked for discretion, not for a permanently tiny graph.
      const svg = graphOf(m.host);
      expect(svg.getAttribute(ROOM_PROGRAMME_GRAPH_EMPTY_ATTR)).toBe('full');
      expect(svg.getAttribute('viewBox')).toBe('0 0 300 190');
      // ⛔ NO height attribute on the full arm — `layoutND` positions nodes in the 300 × 190 box
      // and a fixed height would letterbox them.
      expect(svg.getAttribute('height')).toBeNull();
      expect(svg.querySelectorAll(`[${ROOM_PROGRAMME_NODE_ATTR}]`)).toHaveLength(1);
    } finally { m.dispose(); }
  });

  it('⛔ ONE DROP IS ONE ROOM — the nested drop targets no longer double-add (L-13238)', () => {
    // Found by the arm above, not designed for: `makeDropTarget` is applied to the graph SVG, the
    // programme list, the plan preview AND the panel root, `drop` bubbles, and `acceptDrop` did
    // not stop it — so a chip released on any inner target ran the handler twice and added TWO
    // rooms with two undo steps behind them. Every earlier spec dropped on the ROOT, where the
    // bubble has nowhere left to go, which is why this stood.
    const m = mount();
    try {
      dropRoom(graphOf(m.host), 'living');
      expect(getRoomProgramme().entries, 'one drop produced more than one room').toHaveLength(1);
      const list = m.host.querySelector(`[data-testid="${ROOM_PROGRAMME_LIST_TESTID}"]`)!;
      dropRoom(list, 'bathroom');
      expect(getRoomProgramme().entries.map((e) => e.kind)).toEqual(['living', 'bathroom']);
    } finally { m.dispose(); }
  });

  it('the chip CLICK fallback still works from the compact state (the only non-pointer route in)', () => {
    const m = mount();
    try {
      const library = m.host.querySelector(`[data-testid="${ROOM_PROGRAMME_LIBRARY_TESTID}"]`)!;
      const chips = library.querySelectorAll(`[${ROOM_PROGRAMME_CHIP_ATTR}]`);
      // C115-76 — the sixteen kinds, all still rendered. "Compact" did not become "fewer".
      expect(chips).toHaveLength(RESIDENTIAL_ROOM_LIBRARY.length);
      (library.querySelector(`[${ROOM_PROGRAMME_CHIP_ATTR}="living"]`) as HTMLButtonElement).click();
      expect(getRoomProgramme().entries.map((e) => e.kind)).toEqual(['living']);
      expect(graphOf(m.host).getAttribute(ROOM_PROGRAMME_GRAPH_EMPTY_ATTR)).toBe('full');
    } finally { m.dispose(); }
  });

  it('goes BACK to the rail when the last room is removed — the arm tracks the programme', () => {
    const m = mount();
    try {
      dropRoom(graphOf(m.host), 'bedroom');
      expect(graphOf(m.host).getAttribute(ROOM_PROGRAMME_GRAPH_EMPTY_ATTR)).toBe('full');
      const id = getRoomProgramme().entries[0]!.id;
      applyRoomProgrammeIntent({ type: 'programme.remove-room', id });
      expect(graphOf(m.host).getAttribute(ROOM_PROGRAMME_GRAPH_EMPTY_ATTR)).toBe('compact');
      expect(graphOf(m.host).getAttribute('height')).toBe('44');
    } finally { m.dispose(); }
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════
describe('§STAGE-05-DENSITY — ⛔ 0 GRAPH FUNCTIONALITY REMOVED (C115-74, walked)', () => {
  it('plugs, states both counts, titles its nodes and edges, and unplugs by click', () => {
    const m = mount();
    try {
      dropRoom(graphOf(m.host), 'living');
      dropRoom(graphOf(m.host), 'kitchen');
      const [a, b] = getRoomProgramme().entries;

      // 1 — the two counts are read off the surface.
      expect(m.host.textContent).toContain('Relationships — 0 plugged, 2 rooms');
      // 2 — every room is a node.
      expect(graphOf(m.host).querySelectorAll(`[${ROOM_PROGRAMME_NODE_ATTR}]`)).toHaveLength(2);

      // 3 — drag node → node PLUGS. The pointer arbitration itself is exercised by the panel's
      // own drag specs; what this asserts is that the intent still reaches the model through the
      // panel's channel and that the graph repaints an EDGE from it after the compaction.
      applyRoomProgrammeIntent({ type: 'programme.link', aId: a!.id, bId: b!.id });
      const edge = graphOf(m.host).querySelector(`[${ROOM_PROGRAMME_EDGE_ATTR}]`) as SVGElement;
      expect(edge, 'the plugged relationship drew no edge').not.toBeNull();
      expect(m.host.textContent).toContain('Relationships — 1 plugged, 2 rooms');
      // 6 — hover sentences, on the edge and on the nodes.
      expect(edge.querySelector('title')?.textContent ?? '').toContain('click to unplug');
      expect(
        (graphOf(m.host).querySelector(`[${ROOM_PROGRAMME_NODE_ATTR}] title`)?.textContent ?? '').length,
      ).toBeGreaterThan(0);

      // 4 — click an edge to UNPLUG.
      edge.dispatchEvent(new Event('click', { bubbles: true }));
      expect(getRoomProgramme().links).toHaveLength(0);
      expect(graphOf(m.host).querySelector(`[${ROOM_PROGRAMME_EDGE_ATTR}]`)).toBeNull();
    } finally { m.dispose(); }
  });

  it('the actions the founder photographed are all still there, with their reasons', () => {
    const m = mount();
    try {
      // Undo / Redo and the scoping note (image 4), and `Place envelopes in 3D` with its
      // disabled-with-reason title (C115-76 · §3.G).
      expect(m.host.querySelector(`[data-testid="${ROOM_PROGRAMME_UNDO_TESTID}"]`)).not.toBeNull();
      expect(m.host.querySelector(`[data-testid="${ROOM_PROGRAMME_REDO_TESTID}"]`)).not.toBeNull();
      const place = m.host.querySelector<HTMLButtonElement>(
        `[data-testid="${ROOM_PROGRAMME_PLACE_BTN_TESTID}"]`)!;
      expect(place, 'Place envelopes in 3D was dropped').not.toBeNull();
      // A disabled control still prints WHY — the §SiteEntryPanel idiom this panel uses.
      expect((place.title ?? '').length).toBeGreaterThan(0);
      expect(m.host.textContent).toContain('Ctrl+Z');
    } finally { m.dispose(); }
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════
describe('§STAGE-05-DENSITY — the PROGRAMME SUMMARY C115-73 asks for, as a mirror', () => {
  it('is addressable, states rooms and area, and carries the session-only standing (C115-77)', () => {
    const m = mount();
    try {
      const list = m.host.querySelector(`[data-testid="${ROOM_PROGRAMME_LIST_TESTID}"]`)!;
      const summary = summaryOf(m.host);
      expect(summary, 'question 4 has nothing to mirror').not.toBeNull();
      expect(list.contains(summary!), 'the summary is not inside the list it summarises').toBe(true);
      expect(summary!.textContent).toContain('Programme — 0 rooms, 0.0 m²');
      expect(summary!.getAttribute(ROOM_PROGRAMME_SUMMARY_STATE_ATTR)).toBe('nothing declared yet');

      dropRoom(graphOf(m.host), 'living');
      const after = summaryOf(m.host)!;
      expect(after.textContent).toContain('Programme — 1 rooms');
      // ⚠ C115-77 — the programme dies on reload while the envelopes it places persist. That
      // asymmetry is stated where C58 §1.2 puts a figure's standing, not left to be discovered.
      const state = after.getAttribute(ROOM_PROGRAMME_SUMMARY_STATE_ATTR) ?? '';
      expect(state).toContain('declared by you');
      expect(state).toContain('this session only');
    } finally { m.dispose(); }
  });
});
