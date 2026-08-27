/**
 * §ANALYZE129 — the founder read the shipped relationship card and said:
 * *"the relationship graph is absolutely amazing; however it is difficult to
 * read."* Five requests came with it. This suite is the five, at the layer he
 * experiences them.
 *
 * Issue log: L-12060 (separation) · L-12061 (node legend) · L-12062 (expand) ·
 *            L-12063 (folds) · L-12064 (colour axis)
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐⭐ THE ARM THAT MATTERS MOST IS `THE HONESTY PIN`, AND IT IS NOT A POLISH TEST
 * ═════════════════════════════════════════════════════════════════════════════
 * The blocks the founder asked to fold are §CONTEXT-DATA-HONESTY artefacts: they
 * exist so a LOWER-BOUND number is never read as a complete one. A fold that hid
 * the whole block would turn a qualified number into an apparently-unqualified one
 * — which is the same family of defect as a refusal and a real answer collapsing
 * to one value, and this repository has paid for that family four times.
 *
 * So `THE HONESTY PIN` collapses EVERY fold on the card and then asserts what a
 * reader can still see. If a later change makes that arm red, the correct response
 * is to put the qualifier back on screen, never to relax the arm.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⛔ WHAT THIS SUITE CANNOT ESTABLISH — stated, never glossed
 * ═════════════════════════════════════════════════════════════════════════════
 * happy-dom performs no layout, paints nothing, and provides NO WebGL context.
 *   · Nothing here measures a pixel or a separation ON SCREEN. The separation arms
 *     measure the LAYOUT'S OUTPUT COORDINATES, which is where the change lives.
 *   · `.anl-graph-stage--expanded` is asserted as a CLASS and a set of reachable
 *     controls. That the class produces a larger picture is CSS, and CSS is not
 *     executed here. The class is the contract this file can hold.
 *   · The timing arms assert the COMPLEXITY SHAPE, never a millisecond budget
 *     (C66 §1.1). The wall-clock readings behind the 2.2 choice live in
 *     `forceLayoutND.SEPARATION_DEFAULT`, with the machine named.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { selectionBus } from '@pryzm/core-app-model';

import { flushRuntimeEventListeners } from '../../../engine/runtimeEventBridge';
import '../AnalysisSurface';
import {
  GRAPH_VIEW_EVENT,
  GRAPH_SEPARATION_3D,
  graphExpanded,
  graphOrbit,
  resetGraphViewState,
  setGraphExpanded,
} from '../graphViewState';
import { SEPARATION_DEFAULT, layoutND } from '../forceLayoutND';
import { _clearFoldsForTest } from '../analysisLayout';

interface Rec { id: string; levelId?: string }
const listStore = (rows: Rec[]): { getAll: () => Rec[] } => ({ getAll: () => rows });

/**
 * A UBG stub in the shape `graphReadModel.projectGraph()` reads.
 *
 * ⚠ `freshness: 'stale'` IS THE POINT OF THIS FIXTURE, not an accident. A card
 * over a complete graph has no lower-bound claim to lose, so it could not fail the
 * honesty arm however badly the folds behaved. The suite therefore drives the card
 * in the state where folding is DANGEROUS.
 *
 * ⚠ Built from the SAME window key production reads rather than by injecting a
 * projection: a stub that bypassed the reader would prove the reader works, which
 * is the one thing it cannot prove.
 */
function installGraph(): void {
  const nodes = [
    { id: 'wall_a', kind: 'wall' },
    { id: 'wall_b', kind: 'wall' },
    { id: 'room_1', kind: 'room' },
    { id: 'room_2', kind: 'room' },
    { id: 'door_1', kind: 'door' },
    { id: 'slab_1', kind: 'slab' },
  ];
  const edges = [
    { from: 'wall_a', to: 'room_1', type: 'bounds' },
    { from: 'wall_b', to: 'room_2', type: 'bounds' },
    { from: 'room_1', to: 'room_2', type: 'adjacentTo' },
    { from: 'door_1', to: 'wall_a', type: 'hostedIn' },
    { from: 'room_1', to: 'room_2', type: 'connectsTo' },
    { from: 'slab_1', to: 'room_1', type: 'bounds' },
  ];
  (window as unknown as Record<string, unknown>).__pryzmBuildingGraph = {
    allNodes: () => nodes,
    allEdges: () => edges,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };
  (window as unknown as Record<string, unknown>).__pryzmUbgLiveness = {
    freshness: 'stale',
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

/** The live card, after whatever the last action re-rendered. */
function card(): HTMLElement {
  const c = document.querySelector<HTMLElement>('[data-widget="relationship-graph"]');
  expect(c, 'the relationship-graph card vanished').not.toBeNull();
  return c!;
}

function fold(id: string): HTMLElement {
  const f = card().querySelector<HTMLElement>(`[data-fold="${id}"]`);
  expect(f, `no fold "${id}" on the relationship card`).not.toBeNull();
  return f!;
}

const foldHead = (id: string): HTMLButtonElement =>
  fold(id).querySelector<HTMLButtonElement>('.anl-fold-head')!;

const isOpen = (id: string): boolean => foldHead(id).getAttribute('aria-expanded') === 'true';

beforeAll(async () => {
  bus = installRuntimeBus();
  installGraph();
  window.wallStore = listStore([{ id: 'wall_a', levelId: 'L0' }, { id: 'wall_b', levelId: 'L0' }]);
  window.roomStore = listStore([{ id: 'room_1', levelId: 'L0' }, { id: 'room_2', levelId: 'L0' }]);
  window.doorStore = listStore([{ id: 'door_1', levelId: 'L0' }]);
  window.slabStore = listStore([{ id: 'slab_1', levelId: 'L0' }]);
  window.bimManager = { getLevels: () => [{ id: 'L0', name: 'Ground floor' }] };
  flushRuntimeEventListeners();
  resetGraphViewState();
  bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
  await settle();
});

beforeEach(async () => {
  // ⛔ Folds PERSIST by design, so every arm must start from a known state or the
  // suite would be order-dependent — which is the same defect as an invisible
  // filter, one layer down.
  _clearFoldsForTest();
  setGraphExpanded(false);
  selectionBus.dispatch({ type: 'clear', source: 'analytics', elementIds: [] });
  window.dispatchEvent(new CustomEvent(GRAPH_VIEW_EVENT));
  await settle();
});

afterAll(() => {
  selectionBus.dispatch({ type: 'clear', source: 'analytics', elementIds: [] });
  document.getElementById('anl-surface')?.remove();
});

// ═════════════════════════════════════════════════════════════════════════════
describe('ASK 5 — §ANALYSIS-FOLD-STATE (L-12063): the notes fold', () => {
  it('⭐ every note block on the card is a fold, and every one ships COLLAPSED', async () => {
    await openRelationships();
    // The founder listed these by name. Each is a fold; none is open on arrival.
    for (const id of ['graph.liveness', 'graph.scope', 'graph.basis', 'graph.truncation']
      .filter((f) => card().querySelector(`[data-fold="${f}"]`) !== null)) {
      expect(isOpen(id), `${id} shipped OPEN; the founder asked for collapsed`).toBe(false);
    }
    // ⛔ Differentiating: the two blocks that MUST exist on this fixture.
    expect(card().querySelector('[data-fold="graph.liveness"]')).not.toBeNull();
    expect(card().querySelector('[data-fold="graph.scope"]')).not.toBeNull();
  });

  it('⛔ a COLLAPSED fold keeps its prose OUT OF THE DOCUMENT, not merely hidden', async () => {
    await openRelationships();
    // `livenessSentence` for a STALE graph explains that store events arrived
    // with no graph to apply them to. That explanation is the part that folds.
    expect(fold('graph.liveness').textContent ?? '').not.toMatch(/no graph to apply them to/);
    foldHead('graph.liveness').click();
    expect(fold('graph.liveness').textContent ?? '').toMatch(/no graph to apply them to/);
    // ⭐ …and the qualifier NEVER folded: it is on the header in both states.
    expect(fold('graph.liveness').querySelector('.anl-fold-chip')!.textContent).toMatch(/STALE/);
  });

  it('toggling opens and closes, and the control announces its state', async () => {
    await openRelationships();
    expect(isOpen('graph.scope')).toBe(false);
    foldHead('graph.scope').click();
    expect(isOpen('graph.scope')).toBe(true);
    foldHead('graph.scope').click();
    expect(isOpen('graph.scope')).toBe(false);
  });

  it('⭐ the fold state SURVIVES a full card re-render — it is persisted, not local', async () => {
    await openRelationships();
    foldHead('graph.scope').click();
    expect(isOpen('graph.scope')).toBe(true);

    // A selection rebuilds the card WHOLE. A fold held in a renderer closure would
    // be back to its default here; this one is read from the same browser-local
    // record the arrangement uses (L-3007), so it comes back open.
    selectionBus.dispatch({ type: 'select', source: '3d-canvas', elementIds: ['wall_a'] });
    await settle();

    expect(isOpen('graph.scope'), 'the fold reset on re-render — it is not persisted').toBe(true);
    // …and a fold the reader never touched is still at its default.
    expect(isOpen('graph.liveness')).toBe(false);
  });

  it('⛔ toggling a fold does NOT re-render the surface — the WebGL mount must not churn', async () => {
    await openRelationships();
    let renders = 0;
    const count = (): void => { renders += 1; };
    window.addEventListener(GRAPH_VIEW_EVENT, count);
    foldHead('graph.scope').click();
    await settle();
    window.removeEventListener(GRAPH_VIEW_EVENT, count);
    expect(renders, 'a disclosure triangle fired a surface-wide refresh').toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('⭐⭐ THE HONESTY PIN — what survives when EVERY block is collapsed', () => {
  it('⛔ a fully-collapsed card still says INCOMPLETE and still says LOWER BOUND', async () => {
    await openRelationships();

    // Collapse everything that can be collapsed, on the whole surface.
    for (const head of document.querySelectorAll<HTMLButtonElement>('.anl-fold-head')) {
      if (head.getAttribute('aria-expanded') === 'true') head.click();
    }
    for (const head of document.querySelectorAll<HTMLButtonElement>('.anl-fold-head')) {
      expect(head.getAttribute('aria-expanded'), 'a fold refused to collapse').toBe('false');
    }

    const c = card();
    const visible = c.textContent ?? '';

    // 1 ─ the card header badge, owned by `AnalysisSurface._card`, is not a fold.
    const badge = c.querySelector('.anl-card-head .anl-badge--warn');
    expect(badge, 'the INCOMPLETE badge left the card head').not.toBeNull();
    expect(badge!.textContent).toBe('INCOMPLETE');

    // 2 ─ the always-visible honesty pin INSIDE the graph stage. This is the one
    //     that also survives EXPANSION, which covers the card head.
    const pin = c.querySelector('.anl-graph-stage > .anl-honesty-pin');
    expect(pin, 'the honesty pin is missing or left the stage').not.toBeNull();
    expect(pin!.textContent).toMatch(/INCOMPLETE/);
    expect(pin!.textContent).toMatch(/LOWER BOUND/);
    // ⛔ …with the OPERANDS, so "a lower bound of what" is answerable.
    expect(pin!.textContent).toMatch(/\d+ of \d+ elements/);

    // 3 ─ the liveness qualifier rode the fold header as a chip.
    expect(fold('graph.liveness').querySelector('.anl-fold-chip')!.textContent).toMatch(/STALE/);

    // 4 ─ and the whole card, collapsed, still contains the claim in plain text.
    expect(visible).toMatch(/LOWER BOUND/);
    expect(visible).toMatch(/INCOMPLETE/);
  });

  // ⚠ AMENDED §CLEAN150 (L-12480) — the founder's NEXT report asked for the
  // opposite of what this arm used to assert: *"exclude the yellow tabs
  // completely when the graph is big (extended) - leave all white."* The
  // verbose, always-visible pin is now demoted to a quiet fold under
  // expansion — see `analysisCleanExpandedGraph.spec.ts` for the full
  // coverage of that substitute (it survives, discoverable and keyboard-
  // reachable; it is simply no longer a standing paragraph).
  it('⛔ the verbose pin is GONE under EXPANSION — it is demoted, not deleted', async () => {
    await openRelationships();
    setGraphExpanded(true);
    await settle();
    const stage = card().querySelector('.anl-graph-stage--expanded');
    expect(stage, 'the stage did not take the expanded class').not.toBeNull();
    expect(stage!.querySelector('.anl-honesty-pin'), 'the verbose pin survived expansion').toBeNull();
    // The claim is not lost — a quiet, collapsed fold takes its place. Full
    // coverage of that substitute lives in `analysisCleanExpandedGraph.spec.ts`.
    const notice = stage!.querySelector('[data-fold="graph.bound"]');
    expect(notice, 'no quiet substitute took the pin\'s place').not.toBeNull();
    expect(notice!.textContent ?? '').toMatch(/LOWER BOUND/);
  });

  it('⛔ the card FOOTER still prints its operands and is not foldable', async () => {
    await openRelationships();
    const feet = [...card().querySelectorAll('.anl-card-foot')].map((n) => n.textContent ?? '');
    expect(feet.some((f) => /drawn relationship\(s\) of \d+ projected/.test(f))).toBe(true);
    expect(card().querySelector('.anl-card-foot')!.closest('.anl-fold-body')).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('ASK 3+4 — §GRAPH-EXPAND (L-12062): the corner control', () => {
  it('⭐ the graph carries a maximise control in its own corner', async () => {
    await openRelationships();
    const btn = card().querySelector<HTMLButtonElement>('.anl-graph-frame > .anl-graph-expand');
    expect(btn, 'no expand control in the graph frame').not.toBeNull();
    expect(btn!.getAttribute('aria-pressed')).toBe('false');
  });

  it('⭐ clicking it expands, and every control comes with it', async () => {
    await openRelationships();
    card().querySelector<HTMLButtonElement>('.anl-graph-expand')!.click();
    await settle();

    const stage = card().querySelector<HTMLElement>('.anl-graph-stage--expanded');
    expect(stage, 'the stage did not expand').not.toBeNull();
    // ⛔ DRAW / NODE SIZE / FOCUS HOPS / Reset / Export must still be reachable —
    // an expanded view that stranded the controls would be a dead end.
    const labels = [...stage!.querySelectorAll('.anl-scope-chip')].map((b) => b.textContent);
    for (const wanted of ['3D', '2D', 'Labels', 'Reset view', 'Export network data', 'Export PNG']) {
      expect(labels, `${wanted} is not reachable inside the expanded graph`).toContain(wanted);
    }
    expect(stage!.querySelectorAll('input[type="range"]').length, 'the sliders did not come along').toBe(2);
    // …and an obvious way back.
    expect(stage!.querySelector('.anl-graph-expand')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('⭐ Escape closes it', async () => {
    await openRelationships();
    setGraphExpanded(true);
    await settle();
    expect(graphExpanded()).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();

    expect(graphExpanded(), 'Escape did not close the expanded graph').toBe(false);
    expect(card().querySelector('.anl-graph-stage--expanded')).toBeNull();
  });

  it('⛔ Escape with nothing expanded is a NO-OP — the listener must not be greedy', async () => {
    await openRelationships();
    expect(graphExpanded()).toBe(false);
    const ev = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented, 'the graph swallowed an Escape it did not handle').toBe(false);
  });

  it('⭐⭐ the SELECTION and the CAMERA survive expand → collapse', async () => {
    await openRelationships();
    selectionBus.dispatch({ type: 'select', source: '3d-canvas', elementIds: ['wall_a'] });
    await settle();
    // The founder's own orientation, chosen before he maximised.
    const orbit = graphOrbit();
    orbit.yaw = 1.234;
    orbit.pitch = -0.321;
    orbit.zoom = 1.75;

    setGraphExpanded(true);
    await settle();
    // ⚠ AMENDED §CLEAN150 (L-12480) — the "N selected" readout lived in the
    // `graph.focus` fold, part of the notes row that now goes quiet under
    // expansion (same treatment as presentation mode — see
    // `analysisCleanExpandedGraph.spec.ts`). This arm's actual claim is that
    // the SELECTION STATE itself is untouched by expand/collapse, which is
    // what `selectionBus` — the state, not a rendering of it — proves directly.
    expect(selectionBus.currentIds).toEqual(['wall_a']);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();

    // ⛔ Not "a camera at those values" — the SAME live object, unmutated. A
    // viewport that owned its own orbit would have snapped it back on remount.
    expect(graphOrbit().yaw).toBe(1.234);
    expect(graphOrbit().pitch).toBe(-0.321);
    expect(graphOrbit().zoom).toBe(1.75);
    expect(card().textContent ?? '', 'the selection was dropped by collapsing').toMatch(/1 selected/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('ASK 2 — §GRAPH-NODE-COLOUR / §GRAPH-NODE-LEGEND (L-12061, L-12064)', () => {
  /** Switch to the 2-D SVG, where the marks are inspectable without WebGL. */
  async function open2d(): Promise<HTMLElement> {
    await openRelationships();
    const two = [...card().querySelectorAll<HTMLButtonElement>('.anl-scope-chip')]
      .find((b) => b.textContent === '2D')!;
    two.click();
    await settle();
    return card();
  }

  const TOKEN = /--app-cat-[a-z0-9]+/g;

  it('⭐ the card carries a NODE legend, distinct from the edge legend', async () => {
    const c = await open2d();
    const nodes = c.querySelector('.anl-nodelink-legend--nodes');
    expect(nodes, 'no node legend — the "colour = element category" claim has no key').not.toBeNull();
    expect(nodes!.textContent).toMatch(/Node colour = element category/);
    // Two legends, and the SHAPE distinguishes them: disc for nodes, bar for edges.
    expect(nodes!.querySelectorAll('.anl-nodelink-swatch--node').length).toBeGreaterThan(0);
    expect(c.querySelectorAll('.anl-nodelink-legend').length).toBe(2);
  });

  it('⭐⭐ the legend is TOTAL over the population it claims to cover', async () => {
    const c = await open2d();
    const rows = [...c.querySelectorAll('.anl-nodelink-legend--nodes .anl-nodelink-legend-row')];
    const counts = rows.map((r) => Number(/·\s*(\d+)\s*$/.exec(r.textContent ?? '')?.[1] ?? NaN));
    for (const n of counts) expect(Number.isFinite(n), 'a legend row has no count').toBe(true);

    const drawn = c.querySelectorAll('svg.anl-nodelink g[role="button"]').length;
    expect(drawn, 'no nodes were drawn').toBeGreaterThan(0);
    // ⛔ THE SUM IS THE POPULATION. A legend that omitted a family would still look
    // like a legend; this is the arm that notices.
    expect(counts.reduce((a, b) => a + b, 0)).toBe(drawn);
  });

  it('⛔ every colour ON the picture has a row IN the legend, and vice versa', async () => {
    const c = await open2d();
    const fills = new Set(
      [...c.querySelectorAll('svg.anl-nodelink circle')]
        .map((n) => n.getAttribute('fill') ?? '')
        .flatMap((f) => f.match(TOKEN) ?? []),
    );
    const swatches = new Set(
      [...c.querySelectorAll('.anl-nodelink-legend--nodes .anl-nodelink-swatch--node')]
        .map((n) => n.getAttribute('style') ?? '')
        .flatMap((s) => s.match(TOKEN) ?? []),
    );
    expect(fills.size, 'the nodes are drawn without a categorical token').toBeGreaterThan(1);
    expect([...swatches].sort()).toEqual([...fills].sort());
  });

  it('⛔ the colours come from the SHIPPED categorical scale — no minted palette', async () => {
    const c = await open2d();
    for (const n of c.querySelectorAll('svg.anl-nodelink circle')) {
      const fill = n.getAttribute('fill') ?? '';
      expect(fill, `a node was filled with "${fill}", which is not an --app-cat token`)
        .toMatch(/^var\(--app-cat-(?:[1-8]|unassigned)\)$/);
    }
  });

  it('a legend row is a QUERY surface — it lights its whole family', async () => {
    const c = await open2d();
    const row = c.querySelector<HTMLElement>('.anl-nodelink-legend--nodes .anl-nodelink-legend-row')!;
    expect(row.getAttribute('role')).toBe('button');
    expect(row.getAttribute('data-series')).toMatch(/^g:/);
    row.click();
    expect(c.querySelectorAll('.anl-focused').length).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('ASK 1 — §GRAPH-SEPARATION (L-12060): the nodes are further apart', () => {
  /** A deterministic connected graph: a ring plus chords. */
  function ring(n: number): { ids: string[]; pairs: Array<readonly [string, string]> } {
    const ids = Array.from({ length: n }, (_, i) => `n${i}`);
    const pairs: Array<readonly [string, string]> = [];
    for (let i = 0; i < n; i++) pairs.push([ids[i]!, ids[(i + 1) % n]!] as const);
    for (let i = 0; i < n; i += 7) pairs.push([ids[i]!, ids[(i + Math.floor(n / 3)) % n]!] as const);
    return { ids, pairs };
  }

  /** Mean and minimum nearest-neighbour distance, and how hollow the cloud is. */
  function spread(pos: Map<string, number[]>, extent: readonly number[]): {
    mean: number; min: number; innerHalf: number;
  } {
    const arr = [...pos.values()];
    let sum = 0;
    let min = Infinity;
    for (let i = 0; i < arr.length; i++) {
      let best = Infinity;
      for (let j = 0; j < arr.length; j++) {
        if (i === j) continue;
        let s = 0;
        for (let k = 0; k < extent.length; k++) { const d = arr[i]![k]! - arr[j]![k]!; s += d * d; }
        if (s < best) best = s;
      }
      sum += Math.sqrt(best);
      if (best < min) min = best;
    }
    const c = extent.map((e) => e / 2);
    const radii = arr.map((p) => Math.hypot(...p.map((v, k) => v - c[k]!)));
    const rMax = Math.max(...radii);
    return {
      mean: sum / arr.length,
      min: Math.sqrt(min),
      innerHalf: radii.filter((r) => r < rMax * 0.5).length / arr.length,
    };
  }

  const N = 240;
  const D3: readonly number[] = [600, 600, 600];

  it('⛔ the DEFAULT is exactly 1, and 1 is byte-identical to not passing it at all', () => {
    // `x * 1` is exact in IEEE-754, which is what lets the whole existing
    // `graphLayout3d.spec.ts` fixture argument survive this parameter.
    expect(SEPARATION_DEFAULT).toBe(1);
    const { ids, pairs } = ring(80);
    const a = layoutND(ids, pairs, [620, 380], 40);
    const b = layoutND(ids, pairs, [620, 380], 40, 1);
    expect([...b.entries()]).toEqual([...a.entries()]);
  });

  it('⭐ the card asks for 2.2, and 2.2 genuinely separates the 3-D cloud', () => {
    expect(GRAPH_SEPARATION_3D).toBe(2.2);
    const { ids, pairs } = ring(N);
    const before = spread(layoutND(ids, pairs, D3, 160, 1), D3);
    const after = spread(layoutND(ids, pairs, D3, 160, GRAPH_SEPARATION_3D), D3);
    expect(after.mean, `mean nearest-neighbour ${before.mean} -> ${after.mean}`)
      .toBeGreaterThan(before.mean * 1.05);
    // ⛔ AND IT DOES NOT PUSH ANY PAIR CLOSER. A "spread" that improved the average
    // by crushing one corner would be a legibility regression with a nice number.
    expect(after.min).toBeGreaterThanOrEqual(before.min * 0.95);
  });

  it('⛔⛔ the shipped 2.2 leaves the cloud INTERIOR POPULATED — the ceiling arm', () => {
    // ⭐ A "spread" that evacuated the middle would draw a SHELL: visible
    // structure the model does not contain, which is a legibility regression
    // wearing the costume of the founder's request. This arm fails if the
    // constant is ever raised into that regime.
    //
    // ⚠⚠ AND THIS ARM DELIBERATELY DOES NOT ASSERT THE CONVERSE. The first draft
    // did — `expect(spread(…, 6).innerHalf).toBeLessThan(at.innerHalf)` — and it
    // was RED, because the measurement does not support it: interior occupancy is
    // NOT monotone in separation. n=320 reads 10.3 / 4.7 / 4.7 / 0.6 / 0.3 / 2.5 /
    // 0.0 % at sep 1 / 2.2 / 3 / 4 / 5 / 6 / 8, and n=240 reads 5.4 / 5.0 / 4.6 /
    // 5.8 / 6.7 / 7.5 / 1.7 % — it does not evacuate at that size at all. The
    // evacuation is real AT THE CAP and is not a trend. Pinning it as one would be
    // a confident assertion the data cannot carry, so the full table lives in
    // `forceLayoutND.SEPARATION_DEFAULT` and only the reproducible half is pinned
    // here. A lane raising this constant must re-run the sweep at ITS node count.
    const { ids, pairs } = ring(N);
    const at = spread(layoutND(ids, pairs, D3, 160, GRAPH_SEPARATION_3D), D3);
    expect(at.innerHalf, 'the shipped separation has evacuated the cloud interior')
      .toBeGreaterThan(0.02);
  });

  it('⭐ in 2-D the lever is the EXTENT, and the old card size could COINCIDE nodes', () => {
    // Measured, and it is the reason the 2-D card grew its viewBox instead of
    // taking the multiplier: at 620x380 the pass is saturated against the padding
    // clamp, and the MINIMUM separation reaches zero — exactly coincident bodies.
    const { ids, pairs } = ring(320);
    const small = spread(layoutND(ids, pairs, [620, 380], 160, 1), [620, 380]);
    const large = spread(layoutND(ids, pairs, [900, 560], 160, 1), [900, 560]);
    expect(large.mean).toBeGreaterThan(small.mean * 1.3);
    expect(small.min).toBe(0);
    expect(large.min).toBeGreaterThan(0);
  });

  it('⛔ separation does not change the COMPLEXITY SHAPE (C66 §1.1 — shape, not ms)', () => {
    const time = (n: number, sep: number): number => {
      const { ids, pairs } = ring(n);
      const t0 = performance.now();
      layoutND(ids, pairs, D3, 40, sep);
      return Math.max(performance.now() - t0, 0.01);
    };
    // Warm, so JIT compilation is not counted as growth.
    time(120, GRAPH_SEPARATION_3D);
    time(480, GRAPH_SEPARATION_3D);
    const ratio = time(480, GRAPH_SEPARATION_3D) / time(120, GRAPH_SEPARATION_3D);
    // O(n^2) predicts ~16x for a 4x node count; O(n log n) predicts ~4.5x. The
    // bound is deliberately generous — this runs on CI hardware, not a bench —
    // and still cleanly separates the two shapes.
    expect(ratio, `n 120->480 at sep ${GRAPH_SEPARATION_3D} cost ${ratio.toFixed(1)}x`)
      .toBeLessThan(10);
  });
});
