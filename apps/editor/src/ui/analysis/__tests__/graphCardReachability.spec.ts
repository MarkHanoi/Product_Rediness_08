/**
 * §GRAPH-3D-VIEWPORT / §GRAPH-FOCUS-FROM-MODEL — does the founder's card actually
 * appear, and does clicking a wall in the model actually reach it?
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THIS FILE EXISTS SEPARATELY FROM THE UNIT SPECS
 * ═════════════════════════════════════════════════════════════════════════════
 * MEMORY §committed-is-not-reachable: four fixes in one session ran nowhere, every
 * one with green unit tests, because each was verified at the layer of a pure
 * function's return value rather than at the layer the user experiences.
 *
 * `hierarchy.test.ts` proves `projectHierarchy` is correct. `graph3dViewState.spec.ts`
 * proves the subject and the export are correct. **Neither proves the founder can
 * see any of it.** This file drives the REAL `AnalysisSurface` through the REAL
 * workspace-mode event, clicks the REAL Relationships tab, and reads the DOM.
 *
 * It also drives the half of the founder's request that did not exist before this
 * lane: a `selectionBus` dispatch — the very bus the 3-D viewport, the plan view
 * and the project browser all publish on — must make the relationship card
 * re-render with a focus sentence. That is the wire, exercised end to end at the
 * surface layer, not a call to `focusNeighbourhood` in isolation.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⛔ WHAT THIS ARM CANNOT ESTABLISH — stated, never glossed
 * ═════════════════════════════════════════════════════════════════════════════
 * happy-dom performs no layout, paints nothing, and provides **no WebGL context**.
 * So the 3-D viewport here takes its documented FAILURE path: the canvas mounts,
 * `requestGraphDraw` finds no context, and the honest "3-D graph unavailable"
 * overlay is shown. That is exactly the branch worth pinning in this environment —
 * it proves the widget is reachable AND that its failure is named rather than
 * blank — but it is NOT a proof that a GPU draws anything. Nothing here measures a
 * pixel, and no assertion below should ever be read as if it did.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { selectionBus } from '@pryzm/core-app-model';

import { flushRuntimeEventListeners } from '../../../engine/runtimeEventBridge';
import '../AnalysisSurface';
import { GRAPH_VIEW_EVENT, resetGraphViewState } from '../graphViewState';

interface Rec { id: string; levelId?: string }
const listStore = (rows: Rec[]): { getAll: () => Rec[] } => ({ getAll: () => rows });

/**
 * A UBG stub in the shape `graphReadModel.projectGraph()` reads — a wall bounding
 * a room, a door hosted in that wall, two adjacent rooms joined by a door.
 *
 * ⚠ Deliberately built from the SAME window key production uses
 * (`window.__pryzmBuildingGraph`) rather than by injecting a projection. A stub
 * that bypassed the reader would prove the reader works, which is the one thing
 * it cannot prove.
 */
function installGraph(): void {
  const nodes = [
    { id: 'wall_a', kind: 'wall' },
    { id: 'room_1', kind: 'room' },
    { id: 'room_2', kind: 'room' },
    { id: 'door_1', kind: 'door' },
  ];
  const edges = [
    { from: 'wall_a', to: 'room_1', type: 'bounds' },
    { from: 'room_1', to: 'room_2', type: 'adjacentTo' },
    { from: 'door_1', to: 'wall_a', type: 'hostedIn' },
    { from: 'room_1', to: 'room_2', type: 'connectsTo' },
  ];
  (window as unknown as Record<string, unknown>).__pryzmBuildingGraph = {
    allNodes: () => nodes,
    allEdges: () => edges,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };
  (window as unknown as Record<string, unknown>).__pryzmUbgLiveness = {
    freshness: 'maintained',
    deltasApplied: 3,
    eventsObserved: 3,
    lastDelta: null,
  };
}

function installRuntimeBus(): { emit: (e: string, p: unknown) => void } {
  const handlers = new Map<string, Array<(p: unknown) => void>>();
  const events = {
    on(event: string, handler: (p: unknown) => void): () => void {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return () => { /* not exercised here */ };
    },
    emit(event: string, payload: unknown): void {
      for (const h of handlers.get(event) ?? []) h(payload);
    },
  };
  window.runtime = { events } as never;
  return { emit: (e, p) => events.emit(e, p) };
}

let bus: { emit: (e: string, p: unknown) => void };

const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};

/**
 * Put the card back to its opening state and FORCE the re-render.
 *
 * ⚠ `resetGraphViewState()` deliberately does NOT announce — its own doc says so,
 * because every production caller re-renders immediately afterwards. The
 * "Reset view" button therefore dispatches `GRAPH_VIEW_EVENT` itself, and so must
 * this helper. Calling the setter alone leaves the PREVIOUS view on screen, which
 * is exactly how the first draft of this suite produced a false red against the
 * System view's (correct) empty state.
 */
async function resetCard(): Promise<void> {
  resetGraphViewState();
  window.dispatchEvent(new CustomEvent(GRAPH_VIEW_EVENT));
  await settle();
}

/** The relationships tab, clicked through the real tab strip. */
async function openRelationships(): Promise<HTMLElement> {
  const el = document.getElementById('anl-surface')!;
  const tab = el.querySelector<HTMLButtonElement>('.anl-tab[data-tab="relationships"]');
  expect(tab, 'the Relationships tab is missing from the tab strip').not.toBeNull();
  tab!.click();
  await settle();
  const card = el.querySelector<HTMLElement>('[data-widget="relationship-graph"]');
  expect(card, 'the relationship-graph card is not on the Relationships tab').not.toBeNull();
  return card!;
}

beforeAll(async () => {
  bus = installRuntimeBus();
  installGraph();
  window.wallStore = listStore([{ id: 'wall_a', levelId: 'L0' }]);
  window.roomStore = listStore([{ id: 'room_1', levelId: 'L0' }, { id: 'room_2', levelId: 'L0' }]);
  window.doorStore = listStore([{ id: 'door_1', levelId: 'L0' }]);
  window.bimManager = { getLevels: () => [{ id: 'L0', name: 'Ground floor' }] };
  flushRuntimeEventListeners();
  resetGraphViewState();
  bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
  await settle();
});

afterAll(() => {
  selectionBus.dispatch({ type: 'clear', source: 'analytics', elementIds: [] });
  document.getElementById('anl-surface')?.remove();
});

describe('§GRAPH-HIERARCHY-VIEWS — the six views are on screen and switchable', () => {
  it('⭐ the card renders a chip for every declared view', async () => {
    const card = await openRelationships();
    for (const label of ['Element-based', 'Spatial-based', 'System-based', 'Room-based', 'Topology-based', 'Mixed view']) {
      expect(
        [...card.querySelectorAll('.anl-scope-chip')].some((b) => b.textContent === label),
        `no chip for ${label}`,
      ).toBe(true);
    }
  });

  it('⛔ switching to System-Based renders the PARKED sentence, not a blank canvas', async () => {
    const card = await openRelationships();
    const chip = [...card.querySelectorAll<HTMLButtonElement>('.anl-scope-chip')]
      .find((b) => b.textContent === 'System-based')!;
    chip.click();
    await settle();

    const after = document.querySelector<HTMLElement>('[data-widget="relationship-graph"]')!;
    const text = after.textContent ?? '';
    // Differentiating: a blank canvas, or a generic "no data", fails all four.
    expect(text).toMatch(/No systems are authored in this model/);
    expect(text).toMatch(/PARKED/);
    expect(text).toMatch(/C71 §2\.2/);
    expect(text).toMatch(/parked is NOT a gap/i);
    // …and the reader can still leave the empty view: the toolbar ships anyway.
    expect(after.querySelector('.anl-scope-chip')).not.toBeNull();
  });

  it('the toolbar carries 2D/3D, labels and both exports', async () => {
    await resetCard();
    const card = await openRelationships();
    const labels = [...card.querySelectorAll('.anl-scope-chip')].map((b) => b.textContent);
    for (const wanted of ['3D', '2D', 'Labels', 'Reset view', 'Export network data', 'Export PNG']) {
      expect(labels, `no control labelled ${wanted}`).toContain(wanted);
    }
  });
});

describe('§GRAPH-3D-VIEWPORT — the viewport mounts, and its failure is NAMED', () => {
  it('⭐ 3D is the default and it mounts a canvas', async () => {
    await resetCard();
    const card = await openRelationships();
    expect(card.querySelector('canvas.anl-gv-canvas'), 'no 3-D canvas mounted').not.toBeNull();
  });

  it('⛔ with no WebGL context it says so, and points at the 2D fallback', async () => {
    // happy-dom provides no WebGL. This pins the honest-failure branch: the box
    // must NOT be blank, and it must distinguish "the viewport failed" from
    // "this view has nothing to draw".
    await resetCard();
    const card = await openRelationships();
    const text = card.textContent ?? '';
    expect(text).toMatch(/3-D graph unavailable/);
    expect(text).toMatch(/NOT a statement about your model/);
  });

  it('switching to 2D swaps in the SVG renderer', async () => {
    await resetCard();
    const card = await openRelationships();
    const two = [...card.querySelectorAll<HTMLButtonElement>('.anl-scope-chip')]
      .find((b) => b.textContent === '2D')!;
    two.click();
    await settle();
    const after = document.querySelector<HTMLElement>('[data-widget="relationship-graph"]')!;
    expect(after.querySelector('svg.anl-nodelink'), 'the 2-D SVG did not render').not.toBeNull();
    expect(after.querySelector('canvas.anl-gv-canvas'), 'the 3-D canvas was left behind').toBeNull();
  });
});

describe('§GRAPH-FOCUS-FROM-MODEL — selecting in the model reaches the graph', () => {
  it('⭐⭐ a selectionBus dispatch re-renders the card WITH a focus sentence', async () => {
    await resetCard();
    await openRelationships();

    // ⭐ `source: '3d-canvas'` is not a placeholder — it is the LITERAL source the
    // founder's own click produces (`SelectionBus.ts:23`). Using an invented source
    // string would have tested a dispatch nothing in the product makes; the type
    // checker caught exactly that on the first draft of this line.
    // The same bus the plan view and the project browser publish on (C27 §4). ⛔ Before this lane, nothing re-rendered this card on a
    // selection at all — the widget was `refresh: 'manual'`.
    selectionBus.dispatch({ type: 'select', source: '3d-canvas', elementIds: ['wall_a'] });
    await settle();

    const card = document.querySelector<HTMLElement>('[data-widget="relationship-graph"]')!;
    const text = card.textContent ?? '';
    expect(text).toMatch(/1 selected/);
    expect(text).toMatch(/related element\(s\) within 1 hop/);
    // ⛔ DORMANT, NOT GONE — the sentence must say so, because every count above
    // it still covers the whole scope.
    expect(text).toMatch(/dimmed, not removed/);
  });

  it('⛔ names the per-family tallies, so the reader can decompose the answer', async () => {
    const card = document.querySelector<HTMLElement>('[data-widget="relationship-graph"]')!;
    const text = card.textContent ?? '';
    // wall_a: one `bounds` to room_1, one `hostedIn` from door_1.
    expect(text).toMatch(/bounds 1/);
    expect(text).toMatch(/hostedIn 1/);
  });

  it('⛔ carries the UNDIRECTED caveat for the symmetric families it drew', async () => {
    const card = document.querySelector<HTMLElement>('[data-widget="relationship-graph"]')!;
    expect(card.textContent).toMatch(/drawn UNDIRECTED/);
    expect(card.textContent).toMatch(/never "this one contains that one"/);
  });

  it('clearing the selection removes the focus sentence', async () => {
    selectionBus.dispatch({ type: 'clear', source: '3d-canvas', elementIds: [] });
    await settle();
    const card = document.querySelector<HTMLElement>('[data-widget="relationship-graph"]')!;
    expect(card.textContent).not.toMatch(/related element\(s\) within/);
  });
});

describe('§GRAPH-CATEGORY-TREE — discipline, family, count, and a NAMED IFC non-answer', () => {
  it('⭐ renders the discipline tree with per-family counts', async () => {
    await resetCard();
    const card = await openRelationships();
    const heads = [...card.querySelectorAll('.anl-cat-label')].map((n) => n.textContent ?? '');
    expect(heads.some((h) => h.startsWith('Architecture')), 'no Architecture bucket').toBe(true);
    expect(heads.some((h) => h.startsWith('Spatial')), 'no Spatial bucket').toBe(true);
    expect(card.querySelectorAll('.anl-cat-row').length).toBeGreaterThan(0);
  });

  it('⛔ every IFC cell is a NAMED non-answer while the authority is unwired — never a guess', async () => {
    const card = document.querySelector<HTMLElement>('[data-widget="relationship-graph"]')!;
    const cells = [...card.querySelectorAll('.anl-cat-row-ifc')].map((n) => n.textContent ?? '');
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) {
      expect(c, 'an IFC cell is blank or guessed').toMatch(/not resolved/i);
      expect(c).not.toMatch(/^Ifc/);
    }
  });

  it('⚠ states that discipline is a FAMILY tally, never a structural analysis', async () => {
    const card = document.querySelector<HTMLElement>('[data-widget="relationship-graph"]')!;
    expect(card.textContent).toMatch(/per FAMILY, not per element/);
    expect(card.textContent).toMatch(/never a structural analysis/);
  });
});
