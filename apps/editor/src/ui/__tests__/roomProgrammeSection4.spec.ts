/**
 * §ROOM-PROGRAMME-TARGET + §GRAPH-CLICK-TO-PLUG + §GRAPH-DRAG-TO-REARRANGE + §STAGE-05-SMALLER
 * (founder ruling 2026-09-11 — Site-panel restructure, Section 4 · C115 §8.1 `C115-74` (amended) ·
 * `C115-181` · `C115-174` · L-13317)
 *
 * Subject: apps/editor/src/ui/room-programme/roomProgrammePanel.ts + roomProgrammeTarget.ts
 * Founder: *"Room library, relationship graph, and the plan it resolves to — per building and level
 * … Click two rooms to plug a relationship between them; click a connecting line to unplug it. Drag
 * rooms to rearrange — nothing here is inferred, the graph drives the plan."* Plus: smaller chips,
 * smaller nodes. ⛔ *"Don't delete any information — it is a reshuffle."*
 *
 *   ARM A — ONE PICKER. The selectors only NARROW what `pickHostLevelEnvelope` sees; the default is
 *           byte-for-byte today's pick; a vanished building or storey drops back, never dangles.
 *   ARM B — THE SELECTORS, MOUNTED. Choosing a building resolves a storey the un-narrowed set could
 *           not, and the storey list follows the building.
 *   ARM C — THE GESTURES, IN A REAL DOM. Click-two plugs; the old drag-onto-a-room plug is KEPT;
 *           dragging to empty space rearranges without plugging; a line click still unplugs.
 *   ARM D — SMALLER WITHOUT LOSING TYPE (`C115-174`): the glyph and the whitespace shrink, the
 *           label sizes do not.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  ROOM_PROGRAMME_BUILDING_SELECT_TESTID,
  ROOM_PROGRAMME_CHIP_ATTR,
  ROOM_PROGRAMME_EDGE_ATTR,
  ROOM_PROGRAMME_GRAPH_TESTID,
  ROOM_PROGRAMME_LEVEL_SELECT_TESTID,
  ROOM_PROGRAMME_LIBRARY_TESTID,
  ROOM_PROGRAMME_NODE_ATTR,
  ROOM_PROGRAMME_NODE_SELECTED_ATTR,
  ROOM_PROGRAMME_TARGET_TESTID,
  mountRoomProgrammePanel,
  type RoomProgrammePanelDeps,
} from '../room-programme/roomProgrammePanel';
import {
  applyRoomProgrammeIntent,
  clearRoomProgramme,
  getRoomProgramme,
} from '../room-programme/roomProgrammeModel';
import {
  PROGRAMME_TARGET_DEFAULT,
  PROGRAMME_UNGROUPED_BUILDING,
  listProgrammeBuildings,
  narrowToProgrammeTarget,
  pickProgrammeHost,
  reconcileProgrammeTarget,
} from '../room-programme/roomProgrammeTarget';
import { pickHostLevelEnvelope, type SpaceEnvelopeRecordLike } from '../room-programme/roomEnvelopePlan';

// ─── fixtures ────────────────────────────────────────────────────────────────────────────────
const ring = (x0: number) => [{ x: x0, z: 0 }, { x: x0 + 12, z: 0 }, { x: x0 + 12, z: 9 }, { x: x0, z: 9 }];

/** A level envelope as the store holds it — `group` is the massing-group ref the roster reads. */
function level(id: string, levelId: string, group: { id: string; label: string } | null, x0: number): SpaceEnvelopeRecordLike {
  return {
    id, role: 'level', levelId, name: `ENV_${id.toUpperCase()}`, footprint: ring(x0),
    baseOffset: 0, height: 3, withinId: null, ...(group ? { group } : {}),
  } as unknown as SpaceEnvelopeRecordLike;
}
const A = { id: 'grp-a', label: 'Block A' };
const B = { id: 'grp-b', label: 'Block B' };
/** Two buildings on the ground storey — the un-narrowed pick is AMBIGUOUS on L0, exactly as today. */
const RECORDS: readonly SpaceEnvelopeRecordLike[] = [
  level('a0', 'L0', A, 0),
  level('a1', 'L1', A, 0),
  level('b0', 'L0', B, 40),
  { id: 'room-1', role: 'room', levelId: 'L0', withinId: 'a0', footprint: ring(1) } as unknown as SpaceEnvelopeRecordLike,
];

function deps(records: readonly SpaceEnvelopeRecordLike[] = []): RoomProgrammePanelDeps {
  let n = 0;
  return {
    resolveRuntime: () => null,
    readSpaceEnvelopes: () => records,
    readActiveLevelId: () => 'L0',
    mintId: () => `mint-${(n += 1)}`,
    readProjectRooms: () => [],
  };
}

function mount(records: readonly SpaceEnvelopeRecordLike[] = []): { host: HTMLElement; dispose: () => void } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const panel = mountRoomProgrammePanel(host, deps(records));
  return { host, dispose: () => { try { panel.dispose(); } catch { /* teardown */ } host.remove(); } };
}

const graphOf = (host: HTMLElement): SVGSVGElement =>
  host.querySelector(`[data-testid="${ROOM_PROGRAMME_GRAPH_TESTID}"]`) as SVGSVGElement;
const nodeOf = (host: HTMLElement, id: string): Element =>
  graphOf(host).querySelector(`[${ROOM_PROGRAMME_NODE_ATTR}="${id}"]`)!;

/** A pointer event a browser would send; happy-dom may lack `PointerEvent`, so fall back to its parent. */
function pointer(target: EventTarget, type: string, clientX = 0, clientY = 0): void {
  const Ctor = (globalThis as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
  target.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, clientX, clientY }));
}
/** Press and release on one room without moving — a CLICK in the graph's own terms. */
function clickNode(host: HTMLElement, id: string): void {
  const n = nodeOf(host, id);
  pointer(n, 'pointerdown');
  pointer(n, 'pointerup');
}

function addTwoRooms(): [string, string] {
  applyRoomProgrammeIntent({ type: 'programme.add-room', id: 'r-living', kind: 'living' });
  applyRoomProgrammeIntent({ type: 'programme.add-room', id: 'r-kitchen', kind: 'kitchen' });
  return ['r-living', 'r-kitchen'];
}

beforeEach(() => {
  clearRoomProgramme();
  document.body.replaceChildren();
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('ARM A — one picker: the selectors narrow, they never pick', () => {
  it('⭐ the DEFAULT target hands the picker the very array and storey it had before — today\'s pick', () => {
    expect(narrowToProgrammeTarget(RECORDS, PROGRAMME_TARGET_DEFAULT)).toBe(RECORDS);
    expect(pickProgrammeHost(RECORDS, PROGRAMME_TARGET_DEFAULT, 'L0')).toEqual(pickHostLevelEnvelope(RECORDS, 'L0'));
    // …and today's pick on this fixture is the honest refusal: two buildings contend for L0.
    expect(pickProgrammeHost(RECORDS, PROGRAMME_TARGET_DEFAULT, 'L0').ok).toBe(false);
  });

  it('choosing a building resolves what the un-narrowed set could not — and rooms are never filtered out', () => {
    const narrowed = narrowToProgrammeTarget(RECORDS, { buildingKey: 'grp-a', levelId: null });
    expect(narrowed.map((r) => r.id)).toEqual(['a0', 'a1', 'room-1']);
    const pick = pickProgrammeHost(RECORDS, { buildingKey: 'grp-a', levelId: null }, 'L0');
    expect(pick.ok && pick.level.id).toBe('a0');
    // An explicit storey beats the active one.
    const up = pickProgrammeHost(RECORDS, { buildingKey: 'grp-a', levelId: 'L1' }, 'L0');
    expect(up.ok && up.level.id).toBe('a1');
  });

  it('lists buildings by massing group in the store\'s order, ungrouped in their own bucket, storeys counted', () => {
    const list = listProgrammeBuildings([...RECORDS, level('u0', 'L0', null, 80)]);
    expect(list.map((b) => b.key)).toEqual(['grp-a', 'grp-b', PROGRAMME_UNGROUPED_BUILDING]);
    expect(list[0]!.label).toBe('Block A');
    expect(list[0]!.storeys.map((s) => s.levelId)).toEqual(['L0', 'L1']);
    expect(list[0]!.storeys[0]!.label).toBe('ENV_A0');
  });

  it('a building or storey that vanished drops back to the default for that part — never a dangling selector', () => {
    const list = listProgrammeBuildings(RECORDS);
    const kept = { buildingKey: 'grp-a', levelId: 'L1' };
    expect(reconcileProgrammeTarget(kept, list)).toBe(kept); // unchanged → the SAME object
    expect(reconcileProgrammeTarget({ buildingKey: 'grp-gone', levelId: 'L1' }, list)).toEqual({ buildingKey: null, levelId: 'L1' });
    expect(reconcileProgrammeTarget({ buildingKey: 'grp-b', levelId: 'L1' }, list)).toEqual({ buildingKey: 'grp-b', levelId: null });
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('ARM B — the selectors, mounted: per building and level', () => {
  it('⭐ render the two selectors with today\'s rule first, then resolve the storey once a building is chosen', () => {
    const m = mount(RECORDS);
    try {
      const row = m.host.querySelector(`[data-testid="${ROOM_PROGRAMME_TARGET_TESTID}"]`);
      expect(row, 'the selector row is missing').not.toBeNull();
      const building = () => m.host.querySelector(`[data-testid="${ROOM_PROGRAMME_BUILDING_SELECT_TESTID}"]`) as HTMLSelectElement;
      const storey = () => m.host.querySelector(`[data-testid="${ROOM_PROGRAMME_LEVEL_SELECT_TESTID}"]`) as HTMLSelectElement;
      expect(building().value).toBe('');
      expect([...building().options].map((o) => o.textContent)).toEqual(['All buildings', 'Block A', 'Block B']);
      expect(storey().options[0]!.textContent).toBe('Active storey');

      // Today's rule on this site is the refusal — and the panel states it, in the picker's words.
      const refusal = pickHostLevelEnvelope(RECORDS, 'L0');
      expect(refusal.ok).toBe(false);
      const sentence = refusal.ok ? '' : refusal.statement;
      expect(m.host.textContent).toContain(sentence);

      building().value = 'grp-a';
      building().dispatchEvent(new Event('change'));
      // The refusal is gone: the chosen building has one envelope on the active storey.
      expect(m.host.textContent).not.toContain(sentence);
      // …and the storey list is that building's, not the site's.
      expect([...storey().options].map((o) => o.value)).toEqual(['', 'L0', 'L1']);
    } finally { m.dispose(); }
  });

  it('with no level envelope at all the selectors say so and stay disabled — never a blank control', () => {
    const m = mount([]);
    try {
      const building = m.host.querySelector(`[data-testid="${ROOM_PROGRAMME_BUILDING_SELECT_TESTID}"]`) as HTMLSelectElement;
      expect(building.disabled).toBe(true);
      expect(building.options[0]!.textContent).toBe('No building yet');
    } finally { m.dispose(); }
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('ARM C — the gestures, driven in a real DOM (C115-176: by gesture, never by setting the model)', () => {
  it('⭐ CLICK one room, then another, and they are plugged — the selection is shown, then cleared', () => {
    const [a, b] = addTwoRooms();
    const m = mount();
    try {
      clickNode(m.host, a);
      expect(nodeOf(m.host, a).getAttribute(ROOM_PROGRAMME_NODE_SELECTED_ATTR)).toBe('true');
      expect(getRoomProgramme().links).toHaveLength(0);
      clickNode(m.host, b);
      expect(getRoomProgramme().links.map((l) => [l.aId, l.bId].sort())).toEqual([[a, b].sort()]);
      expect(graphOf(m.host).querySelector(`[${ROOM_PROGRAMME_NODE_SELECTED_ATTR}]`)).toBeNull();
    } finally { m.dispose(); }
  });

  it('clicking the selected room again CANCELS — a mis-click never plugs anything', () => {
    const [a] = addTwoRooms();
    const m = mount();
    try {
      clickNode(m.host, a);
      clickNode(m.host, a);
      expect(graphOf(m.host).querySelector(`[${ROOM_PROGRAMME_NODE_SELECTED_ATTR}]`)).toBeNull();
      expect(getRoomProgramme().links).toHaveLength(0);
    } finally { m.dispose(); }
  });

  it('⛔ C115-74 behaviour 3 KEPT — pressing on one room and releasing on another still plugs them', () => {
    const [a, b] = addTwoRooms();
    const m = mount();
    try {
      pointer(nodeOf(m.host, a), 'pointerdown');
      pointer(nodeOf(m.host, b), 'pointerup');
      expect(getRoomProgramme().links).toHaveLength(1);
    } finally { m.dispose(); }
  });

  it('⭐ dragging a room to EMPTY space rearranges it — it moves, and nothing is plugged', () => {
    const [a] = addTwoRooms();
    const m = mount();
    try {
      const svg = graphOf(m.host);
      // happy-dom has no layout: give the canvas the 1:1 box a browser would, so the move is measurable.
      svg.getScreenCTM = () => null;
      svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 190, right: 300, bottom: 190, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
      const circle = () => nodeOf(m.host, a).querySelector('circle')!;
      pointer(nodeOf(m.host, a), 'pointerdown', 0, 0);
      pointer(svg, 'pointermove', 150, 90);
      pointer(svg, 'pointerup', 150, 90);
      expect(circle().getAttribute('cx')).toBe('150');
      expect(circle().getAttribute('cy')).toBe('90');
      expect(getRoomProgramme().links, 'a rearrange must never plug').toHaveLength(0);
      expect(graphOf(m.host).querySelector(`[${ROOM_PROGRAMME_NODE_SELECTED_ATTR}]`)).toBeNull();
    } finally { m.dispose(); }
  });

  it('C115-74 behaviour 4 KEPT — clicking a line unplugs it', () => {
    const [a, b] = addTwoRooms();
    applyRoomProgrammeIntent({ type: 'programme.link', aId: a, bId: b });
    const m = mount();
    try {
      (graphOf(m.host).querySelector(`[${ROOM_PROGRAMME_EDGE_ATTR}]`) as SVGElement)
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(getRoomProgramme().links).toHaveLength(0);
    } finally { m.dispose(); }
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('ARM D — smaller, and no type was harmed (C115-174)', () => {
  it('chips lose whitespace and swatch size, never their 11 px label', () => {
    const m = mount();
    try {
      const chip = m.host.querySelector(`[data-testid="${ROOM_PROGRAMME_LIBRARY_TESTID}"] [${ROOM_PROGRAMME_CHIP_ATTR}]`) as HTMLElement;
      expect(chip.style.padding).toBe('2px 6px');
      expect(chip.style.fontSize).toBe('11px');
      const dot = chip.querySelector('span') as HTMLElement;
      expect(dot.style.width).toBe('7px');
    } finally { m.dispose(); }
  });

  it('nodes shrink to r 6.5 and their names keep 9 units', () => {
    const [a] = addTwoRooms();
    const m = mount();
    try {
      const g = nodeOf(m.host, a);
      expect(g.querySelector('circle')!.getAttribute('r')).toBe('6.5');
      expect(g.querySelector('text')!.getAttribute('font-size')).toBe('9');
      expect((g.querySelector('title')?.textContent ?? '')).toContain('click it, then another room');
    } finally { m.dispose(); }
  });
});
