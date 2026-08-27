/**
 * §CLEAN150 (L-12481) — the founder's report, verbatim: *"there nodes called
 * elements - but we know for sure what element is - provide the category
 * please."* His graph showed `wall 01M0` / `curtainwall 01M0` / `room b2b0` /
 * `floor 01M0` / `slab 01M0` correctly labelled, alongside generic
 * `element 4afc` / `element ebd2` nodes.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ROOT CAUSE, PROVEN HERE RATHER THAN ASSERTED
 * ═════════════════════════════════════════════════════════════════════════════
 * Three of the five UBG adapters (`semanticAdapter.ts:46-47`,
 * `dependencyAdapter.ts:36-37`, `constraintAdapter.ts:50`, all in
 * `@pryzm/building-graph`) stamp `kind: 'element'` UNCONDITIONALLY on every
 * endpoint they materialise, regardless of what the element actually is.
 * `readableLabel()` in `widgetRenderers.ts` used to fall back to that raw
 * `node.kind` — so a node reached ONLY through `hostedIn` / `dependsOn` (the
 * "Element-based" view) printed "element ####" even when the SAME node's
 * COLOUR was already correct, because colour reads `familyOfNode(n, families)`
 * — the census-then-kind ladder `hierarchy.ts` documents as authoritative — and
 * the label did not. That is a within-card rival-authority contradiction
 * (C84 EI-9): the legend says "door" in the right colour, the label under the
 * dot says "element".
 *
 * This suite drives that exact shape: `door_1`'s UBG node carries
 * `kind: 'element'` (as `semanticAdapter`/`dependencyAdapter`/
 * `constraintAdapter` would stamp it), while `window.doorStore` — the SAME
 * census `censusFamilies()` reads for colour — knows it is a door. The fixed
 * label must read the census's answer, not the UBG's generic placeholder.
 *
 * ⛔ HONESTY HALF: a node the census ALSO cannot place (no store claims its id,
 * `kind` is the generic placeholder) must NOT silently render as a plausible
 * category. It renders as a NAMED, visibly-different non-answer —
 * "unresolved element ####" — never a bare family name, and never the same
 * text a real family produces.
 *
 * ⚠ WHAT THIS SUITE DOES NOT ESTABLISH: production census/UBG coverage.
 * `analysisReadModel.ts`'s `CENSUS_SOURCES` (18 declared families) is itself
 * missing 3 families `apps/editor/src/ui/inspect/audit/inspectCategories.ts`'s
 * `INSPECT_CATEGORIES` (20 families) knows about — `curtainPanelStore`,
 * `stairRailingStore`, `liftStore` are published on `window`
 * (`initBuilders.ts:344,985,1014`) but absent from the census table. Elements
 * of those three families will still read "unresolved element ####" AFTER
 * this fix, correctly (the ladder has no answer for them) rather than
 * incorrectly (a wrong label). Reconciling that table is `L-12165`'s
 * concurrent sweep across six rival element-family lists and is NOT done by
 * this lane, to avoid duplicating it — reported to the register instead.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { selectionBus } from '@pryzm/core-app-model';

import { flushRuntimeEventListeners } from '../../../engine/runtimeEventBridge';
import '../AnalysisSurface';
import { GRAPH_VIEW_EVENT, resetGraphViewState, setGraphMode } from '../graphViewState';
import { _clearFoldsForTest, setPresentationMode } from '../analysisLayout';

interface Rec { id: string; levelId?: string }
const listStore = (rows: Rec[]): { getAll: () => Rec[] } => ({ getAll: () => rows });

/**
 * `door_1` and `wall_a` both carry the GENERIC `kind: 'element'` — exactly what
 * `semanticAdapter` / `dependencyAdapter` / `constraintAdapter` stamp on every
 * endpoint, regardless of what the element actually is. `mystery_1` ALSO
 * carries it, but (unlike the other two) is claimed by NO census store — the
 * genuinely-unresolvable case.
 */
function installGraph(): void {
  const nodes = [
    { id: 'wall_a', kind: 'element' },
    { id: 'door_1', kind: 'element' },
    { id: 'room_1', kind: 'room' },
    { id: 'mystery_1', kind: 'element' },
  ];
  const edges = [
    { from: 'door_1', to: 'wall_a', type: 'hostedIn' },
    { from: 'wall_a', to: 'room_1', type: 'dependsOn' },
    // ⚠ `hostedIn`, NOT `dependsOn` — the default view is 'topology' (families
    // `bounds` / `adjacentTo` / `hostedIn` / `connectsTo`; see
    // `graphViewState.ts`), and node selection is EDGE-DRIVEN: `projectHierarchy`
    // keeps a node only when one of ITS OWN edges is in the active view's family
    // set (C71 §4.4 — a view is a SUBSET, never a graph of its own). `dependsOn`
    // is an 'element'-view-only family, so a `mystery_1 --dependsOn--> wall_a`
    // edge would silently drop `mystery_1` from this view before the label
    // resolver this suite is testing ever runs on it.
    { from: 'mystery_1', to: 'wall_a', type: 'hostedIn' },
  ];
  (window as unknown as Record<string, unknown>).__pryzmBuildingGraph = {
    allNodes: () => nodes,
    allEdges: () => edges,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };
  (window as unknown as Record<string, unknown>).__pryzmUbgLiveness = {
    freshness: 'maintained',
    deltasApplied: 0,
    eventsObserved: 0,
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

function surface(): HTMLElement {
  return document.getElementById('anl-surface')!;
}

function graphCard(): HTMLElement {
  const c = surface().querySelector<HTMLElement>('[data-widget="relationship-graph"]');
  expect(c, 'the relationship-graph card is not on the Relationships tab').not.toBeNull();
  return c!;
}

async function openRelationships2d(): Promise<HTMLElement> {
  const tab = surface().querySelector<HTMLButtonElement>('.anl-tab[data-tab="relationships"]');
  expect(tab, 'the Relationships tab is missing').not.toBeNull();
  tab!.click();
  await settle();
  setGraphMode('2d'); // the marks are inspectable DOM text/attributes without WebGL
  window.dispatchEvent(new CustomEvent(GRAPH_VIEW_EVENT));
  await settle();
  return graphCard();
}

/** Every drawn node's `aria-label`, split into `{ label, group }`. */
function drawnNodes(card: HTMLElement): Array<{ id: string; label: string; group: string }> {
  const out: Array<{ id: string; label: string; group: string }> = [];
  for (const g of card.querySelectorAll<SVGGElement>('svg.anl-nodelink g[role="button"]')) {
    const aria = g.getAttribute('aria-label') ?? '';
    const title = g.querySelector('title')?.textContent ?? '';
    const m = /^(.*) — (.*)\. Select in the model\.$/.exec(aria);
    const idMatch = /—\s*([^—]+)$/.exec(title); // "label (group) — id"
    out.push({
      id: idMatch?.[1]?.trim() ?? '',
      label: m?.[1] ?? aria,
      group: m?.[2] ?? '',
    });
  }
  return out;
}

beforeAll(async () => {
  bus = installRuntimeBus();
  installGraph();
  // ⭐ THE POINT OF THE FIXTURE: `doorStore` and `wallStore` claim these ids —
  // the SAME census `familyOf` (colour) already reads — even though the UBG
  // node's own `kind` is the generic 'element'.
  window.wallStore = listStore([{ id: 'wall_a', levelId: 'L0' }]);
  window.doorStore = listStore([{ id: 'door_1', levelId: 'L0' }]);
  window.roomStore = listStore([{ id: 'room_1', levelId: 'L0' }]);
  // `mystery_1` is claimed by NOTHING — no store lists it — so it stays
  // genuinely unresolved after the fix, honestly.
  window.bimManager = { getLevels: () => [{ id: 'L0', name: 'Ground floor' }] };
  flushRuntimeEventListeners();
  resetGraphViewState();
  bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
  await settle();
});

beforeEach(async () => {
  _clearFoldsForTest();
  setPresentationMode(false);
  selectionBus.dispatch({ type: 'clear', source: 'analytics', elementIds: [] });
});

afterAll(() => {
  selectionBus.dispatch({ type: 'clear', source: 'analytics', elementIds: [] });
  document.getElementById('anl-surface')?.remove();
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§CLEAN150 (L-12481) — the node label agrees with the SAME resolver the colour uses', () => {
  it('⭐⭐ a node stamped `kind: \'element\'` by the UBG, but KNOWN to the census, is labelled by its REAL family', async () => {
    const card = await openRelationships2d();
    const nodes = drawnNodes(card);

    const door = nodes.find((n) => n.id === 'door_1');
    expect(door, 'door_1 was not drawn').toBeDefined();
    // ⛔ THE DEFECT THIS PROVES IS FIXED: the label is NOT "element ####" even
    // though the UBG node's own `kind` is literally 'element'.
    expect(door!.label).not.toMatch(/^element\b/);
    expect(door!.label).toMatch(/^doors\b/); // the census group key (CENSUS_SOURCES: 'doors')

    const wall = nodes.find((n) => n.id === 'wall_a');
    expect(wall, 'wall_a was not drawn').toBeDefined();
    expect(wall!.label).not.toMatch(/^element\b/);
    expect(wall!.label).toMatch(/^walls\b/);
  });

  it('⛔ the label and the COLOUR now agree — they read the identical resolver', async () => {
    const card = await openRelationships2d();
    // The node legend lists the SAME family key the label uses ("doors"), with
    // a real categorical colour — not the neutral "unresolved" swatch.
    const legendText = card.querySelector('.anl-nodelink-legend--nodes')?.textContent ?? '';
    expect(legendText).toMatch(/doors/);
    expect(legendText).toMatch(/walls/);

    const doorCircle = [...card.querySelectorAll<SVGGElement>('svg.anl-nodelink g[role="button"]')]
      .find((g) => (g.querySelector('title')?.textContent ?? '').startsWith('doors'))
      ?.querySelector('circle');
    expect(doorCircle, 'door_1\'s circle was not found under its new label').not.toBeNull();
    expect(doorCircle!.getAttribute('fill')).toMatch(/--app-cat-/);
  });

  it('⛔⛔ a node NEITHER the census NOR the UBG can name stays HONESTLY unresolved — never a fabricated category', async () => {
    const card = await openRelationships2d();
    const nodes = drawnNodes(card);
    const mystery = nodes.find((n) => n.id === 'mystery_1');
    expect(mystery, 'mystery_1 was not drawn').toBeDefined();
    // ⛔ §CONTEXT-DATA-HONESTY: "unknown" and a real family name must never be
    // the same text. This is visibly DIFFERENT from "doors ####" / "walls
    // ####", not a generic "element" that could be mistaken for a category.
    expect(mystery!.label).toMatch(/^unresolved element\b/);
    expect(mystery!.label).not.toBe('element');
  });

  it('⛔ the genuinely-unresolved count in the label matches the card\'s OWN disclosed count', async () => {
    const card = await openRelationships2d();
    const nodes = drawnNodes(card);
    const unresolvedLabelled = nodes.filter((n) => n.label.startsWith('unresolved element')).length;

    // The footer already discloses `projection.unresolvedFamilyCount` verbatim
    // — see `renderGraph`'s "⚠ N node(s) have no category the census can
    // resolve" line. The two must agree, or the label and the count would be
    // telling the reader two different stories about the same graph.
    const foot = [...card.querySelectorAll('.anl-card-foot')]
      .map((n) => n.textContent ?? '')
      .find((t) => /node\(s\) have no category the census can resolve/.test(t));
    expect(foot, 'the unresolved-category footer note is missing').toBeDefined();
    const declared = Number(/⚠ (\d+) node\(s\) have no category/.exec(foot!)?.[1] ?? NaN);
    expect(Number.isFinite(declared), 'could not parse the declared unresolved count').toBe(true);
    expect(unresolvedLabelled).toBe(declared);
    expect(declared, 'this fixture has exactly one genuinely-unresolvable node').toBe(1);
  });
});
