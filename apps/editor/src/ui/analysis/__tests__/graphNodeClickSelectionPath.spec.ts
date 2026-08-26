/**
 * §ROOM-NODE-CLICK-SELECTION-PATH (L-12240) — lane ROOMVOL138.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ THE HYPOTHESIS THIS SUITE WAS BUILT TO TEST, AND WHAT IT FOUND
 * ═════════════════════════════════════════════════════════════════════════════
 * The founder's ask ("clicking a room node should paint its VOLUME, like Inspect
 * does") came with a strong prior: rooms are known to travel a DIFFERENT selection
 * path from every other family elsewhere in this codebase (§TREE134, commit
 * b3be2c09: "rooms still route `onRoomSelect` + the two room events; everything
 * else `onElementSelect` + `selectionBus`" — a fact about the INSPECT AUDIT TREE's
 * OWN row wiring, `ProjectTreeZone.ts`/`DiscoveryModeZone.ts`).
 *
 * ⛔ THAT HYPOTHESIS DOES NOT HOLD FOR THIS CARD, and this suite is the proof
 * rather than an assertion of it. `widgetRenderers.ts` `renderGraph`'s `onPick`
 * (both the 2-D `renderNodeLink` branch and the 3-D `mountGraphViewport` branch)
 * dispatches `selectionBus.dispatch({ type: 'select', source: 'analytics',
 * elementIds: [id] })` UNCONDITIONALLY — no branch on `node.kind` exists, and this
 * suite proves that is CORRECT, not an oversight: `selectionBus` is exactly what a
 * room click in the 3-D VIEWPORT ITSELF already uses
 * (`packages/input-host/src/SelectionManager.ts:2449`,
 * `selectionBus.select(elementId, '3d-canvas')` — no room-specific branch there
 * either), and `InspectModeCoordinator` subscribes to `selectionBus` DIRECTLY
 * (§INSPECT-FOCUS-IS-ELEMENT-SHAPED, L-8200) and feeds a room id into the SAME
 * sink a wall id reaches. Diverting a room graph-node click to the audit tree's
 * bespoke `pryzm-inspect-room-focus` event instead would have been a REGRESSION:
 * that event does not update `_analysisSelection` (only Inspect's own focus set),
 * so this card's OWN "what does the current selection relate to" read
 * (`selectionBus.currentIds`, `widgetRenderers.ts` `renderGraph`) would go blind
 * for exactly the case being fixed.
 *
 * ⭐ THIS PARTLY SETTLES §QTYHL132's L-12125 ("highlight coverage per element
 * family is unmeasured … families like floor finishes/lighting may not stamp
 * [userData.id]") FOR ROOMS SPECIFICALLY: a room volume mesh DOES carry
 * `userData.id` (`RoomBoundaryBuilder.ts:405`, `volumeMesh.userData.id =
 * room.id`), so it is NOT the "no pickable mesh at all" case L-12125 worried
 * rooms might be — the mesh exists, is addressable, and the generic
 * `_resolveElementId` walk already finds it. What WAS missing (fixed alongside
 * this suite, see `AnalysisRoomVolumeSelected.test.ts`) is downstream of
 * selection entirely: the Analysis lens's paint function never touched
 * `.visible`, and a room's only visible geometry is gated behind an unrelated
 * ambient preference. L-12125 remains OPEN for every OTHER family this suite does
 * not touch (floor finishes, lighting) — this does not close the row, only the
 * room slice of it.
 *
 * So: the fix that ships alongside this suite lives entirely in
 * `DiagnosticMaterialManager._applyAnalysisSelection` (a NEW `isRoomVolume`
 * branch, keyed on the mesh's OWN `userData.isRoomVolume`/`roomId` — the single
 * existing authority for "is this a room", never a second one derived from the
 * graph node's `kind`). `widgetRenderers.ts`'s dispatch is UNCHANGED, and this
 * suite is the evidence for why it must stay that way.
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';

import { selectionBus } from '@pryzm/core-app-model';

import { flushRuntimeEventListeners } from '../../../engine/runtimeEventBridge';
import '../AnalysisSurface';
import { GRAPH_VIEW_EVENT, resetGraphViewState } from '../graphViewState';

interface Rec { id: string; levelId?: string }
const listStore = (rows: Rec[]): { getAll: () => Rec[] } => ({ getAll: () => rows });

function installGraph(): void {
  const nodes = [
    { id: 'wall_a', kind: 'wall' },
    { id: 'room_1', kind: 'room' },
    { id: 'room_2', kind: 'room' },
  ];
  const edges = [
    { from: 'wall_a', to: 'room_1', type: 'bounds' },
    { from: 'room_1', to: 'room_2', type: 'adjacentTo' },
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

async function resetCard(): Promise<void> {
  resetGraphViewState();
  window.dispatchEvent(new CustomEvent(GRAPH_VIEW_EVENT));
  await settle();
}

async function openRelationshipsAs2D(): Promise<HTMLElement> {
  const el = document.getElementById('anl-surface')!;
  const tab = el.querySelector<HTMLButtonElement>('.anl-tab[data-tab="relationships"]');
  tab!.click();
  await settle();
  let card = el.querySelector<HTMLElement>('[data-widget="relationship-graph"]')!;
  // happy-dom has no WebGL, but the click handler under test lives in the SAME
  // `renderGraph` function for both modes — 2-D is the one that actually mounts
  // real, clickable DOM nodes in this environment (§GRAPH-3D-VIEWPORT already
  // documents the 3-D canvas's honest-failure path elsewhere).
  const twoD = card.querySelector<HTMLButtonElement>('.anl-scope-chip');
  const chip = [...card.querySelectorAll<HTMLButtonElement>('.anl-scope-chip')].find((b) => b.textContent === '2D');
  expect(chip, '2D toggle missing from the graph toolbar').toBeTruthy();
  chip!.click();
  await settle();
  card = document.querySelector<HTMLElement>('[data-widget="relationship-graph"]')!;
  expect(card.querySelector('svg.anl-nodelink'), 'the 2-D SVG did not render').not.toBeNull();
  void twoD;
  return card;
}

/** Find a node's clickable `<g>` by the id `nodeLinkSvg.ts` writes into its `<title>`. */
function findNodeGroup(card: HTMLElement, id: string): SVGGElement {
  const titles = [...card.querySelectorAll('title')];
  const title = titles.find((t) => (t.textContent ?? '').endsWith(`— ${id}`));
  expect(title, `no graph node found for id "${id}"`).toBeTruthy();
  const g = title!.parentElement as unknown as SVGGElement;
  expect(g?.getAttribute?.('role'), `"${id}"'s <title> parent is not the clickable node <g>`).toBe('button');
  return g;
}

beforeAll(async () => {
  bus = installRuntimeBus();
  installGraph();
  window.wallStore = listStore([{ id: 'wall_a', levelId: 'L0' }]);
  window.roomStore = listStore([{ id: 'room_1', levelId: 'L0' }, { id: 'room_2', levelId: 'L0' }]);
  window.bimManager = { getLevels: () => [{ id: 'L0', name: 'Ground floor' }] };
  flushRuntimeEventListeners();
  resetGraphViewState();
  bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
  await settle();
});

afterEach(() => {
  selectionBus.dispatch({ type: 'clear', source: 'analytics', elementIds: [] });
});

describe('§ROOM-NODE-CLICK-SELECTION-PATH — a table over node kinds', () => {
  // ⭐ THE TABLE. Both rows dispatch through the exact same call — that sameness
  // is the finding, not an assumption. A future change that special-cases one
  // kind at the DISPATCH site (rather than in the paint function, where the fix
  // in this lane actually lives) will fail one arm of this table and must
  // explain why before touching it.
  it.each([
    { kind: 'room' as const, id: 'room_1' },
    { kind: 'wall' as const, id: 'wall_a' },
  ])('clicking a $kind node dispatches selectionBus.select with its own id, source "analytics"', async ({ id }) => {
    await resetCard();
    const card = await openRelationshipsAs2D();

    const seen: Array<{ type: string; source: string; ids: readonly string[] }> = [];
    const off = selectionBus.subscribe((ev) => {
      if (ev.type !== 'select') return;
      seen.push({ type: ev.type, source: ev.source, ids: selectionBus.currentIds });
    });

    const g = findNodeGroup(card, id);
    g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    off();

    expect(seen).toHaveLength(1);
    expect(seen[0]!.source).toBe('analytics');
    expect(seen[0]!.ids).toEqual([id]);
    expect(selectionBus.currentIds).toEqual([id]);
  });

  it('a ROOM node click reaches selectionBus.currentIds with the room\'s OWN id — the id DiagnosticMaterialManager keys its room-volume branch on', async () => {
    await resetCard();
    const card = await openRelationshipsAs2D();

    const g = findNodeGroup(card, 'room_1');
    g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();

    // `RoomBoundaryBuilder.ts` stamps `volumeMesh.userData.roomId = room.id` and
    // `_applyAnalysisSelection`'s new branch reads exactly that field — so the id
    // landing here, unmodified, IS the id the paint function will match against.
    expect(selectionBus.currentIds).toEqual(['room_1']);
  });

  it('clearing the selection after a room-node click clears selectionBus for everyone downstream — same clear as any other click', async () => {
    await resetCard();
    const card = await openRelationshipsAs2D();

    const g = findNodeGroup(card, 'room_1');
    g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(selectionBus.currentIds).toEqual(['room_1']);

    selectionBus.dispatch({ type: 'clear', source: 'analytics', elementIds: [] });
    await settle();
    expect(selectionBus.currentIds).toEqual([]);
  });
});
