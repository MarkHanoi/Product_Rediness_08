/**
 * §HILITE140 (L-12292) — the relationship graph's hop-N neighbourhood reaches
 * the 3-D scene, not only the graph card.
 *
 * ⚠ Deliberately does NOT import `AnalysisSurface` / `widgetRenderers` — both
 * are mid-edit by a concurrent lane (§DEMO141) at the time this suite was
 * written. `computeRelatedHops` and the `selectionBus` wiring are independent
 * of the DOM card entirely (see `analysisRelatedHighlight.ts`'s own header for
 * why), so this suite drives them directly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { selectionBus } from '@pryzm/core-app-model';

import {
  computeRelatedHops,
  initAnalysisRelatedHighlight,
  disposeAnalysisRelatedHighlight,
} from '../analysisRelatedHighlight';
import { resetGraphViewState, setGraphFocusDepth, setGraphView } from '../graphViewState';

interface Rec { id: string; levelId?: string }
const listStore = (rows: Rec[]): { getAll: () => Rec[] } => ({ getAll: () => rows });

// ── The same small graph `hierarchy.test.ts` uses for its own hop tests ──────
// wall_a --bounds--> room_1 --adjacentTo--> room_2 ; door_1 --hostedIn--> wall_a
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
  ];
  (window as unknown as Record<string, unknown>).__pryzmBuildingGraph = {
    allNodes: () => nodes,
    allEdges: () => edges,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  };
  (window as unknown as Record<string, unknown>).__pryzmUbgLiveness = {
    freshness: 'maintained',
    deltasApplied: 1,
    eventsObserved: 1,
    lastDelta: null,
  };
}

function installCensus(): void {
  window.wallStore = listStore([{ id: 'wall_a', levelId: 'L0' }]);
  window.roomStore = listStore([{ id: 'room_1', levelId: 'L0' }, { id: 'room_2', levelId: 'L0' }]);
  window.doorStore = listStore([{ id: 'door_1', levelId: 'L0' }]);
}

beforeEach(() => {
  installGraph();
  installCensus();
  resetGraphViewState();
  setGraphView('topology');
});

afterEach(() => {
  selectionBus.dispatch({ type: 'clear', source: 'analytics', elementIds: [] });
});

describe('computeRelatedHops — the pure hop-map orchestration', () => {
  it('excludes the seed itself — the selection is painted elsewhere, not as "related"', () => {
    const hops = computeRelatedHops(['wall_a']);
    expect(hops.find(([id]) => id === 'wall_a')).toBeUndefined();
  });

  it('a 1-hop neighbour is reported at hop 1', () => {
    const hops = new Map(computeRelatedHops(['wall_a']));
    expect(hops.get('room_1')).toBe(1);
    expect(hops.get('door_1')).toBe(1);
  });

  it('respects the FOCUS HOPS depth — room_2 (2 hops out) appears only once depth >= 2', () => {
    setGraphFocusDepth(1);
    let hops = new Map(computeRelatedHops(['wall_a']));
    expect(hops.has('room_2')).toBe(false);

    setGraphFocusDepth(2);
    hops = new Map(computeRelatedHops(['wall_a']));
    expect(hops.get('room_2')).toBe(2);
  });

  it('nothing selected ⇒ nothing related, honestly, not an error', () => {
    expect(computeRelatedHops([])).toEqual([]);
  });

  it('the graph unreachable ⇒ an empty answer, not a throw', () => {
    delete (window as unknown as Record<string, unknown>).__pryzmBuildingGraph;
    expect(() => computeRelatedHops(['wall_a'])).not.toThrow();
    expect(computeRelatedHops(['wall_a'])).toEqual([]);
  });
});

describe('§HILITE140 — the selectionBus → runtime-event wire', () => {
  type Handler = (payload: unknown) => void;

  function installBus() {
    const handlers = new Map<string, Set<Handler>>();
    (window as unknown as { runtime?: unknown }).runtime = {
      events: {
        on(name: string, fn: Handler) {
          if (!handlers.has(name)) handlers.set(name, new Set());
          handlers.get(name)!.add(fn);
          return () => handlers.get(name)?.delete(fn);
        },
        emit(name: string, payload?: unknown) {
          for (const fn of [...(handlers.get(name) ?? [])]) fn(payload);
        },
      },
    };
    return handlers;
  }

  beforeEach(() => {
    disposeAnalysisRelatedHighlight();
    installBus();
    initAnalysisRelatedHighlight();
    setGraphFocusDepth(2);
  });

  afterEach(() => {
    disposeAnalysisRelatedHighlight();
  });

  it('a selectionBus SELECT publishes the hop map on the runtime bus', () => {
    const seen: Array<ReadonlyArray<readonly [string, number]>> = [];
    window.runtime!.events!.on('pryzm-analysis-related-elements', (p: unknown) => {
      seen.push((p as { hops: ReadonlyArray<readonly [string, number]> }).hops);
    });

    selectionBus.dispatch({ type: 'select', source: 'test', elementIds: ['wall_a'] });

    expect(seen).toHaveLength(1);
    expect(new Map(seen[0])).toEqual(new Map([['room_1', 1], ['door_1', 1], ['room_2', 2]]));
  });

  it('a selectionBus CLEAR publishes an empty hop map', () => {
    selectionBus.dispatch({ type: 'select', source: 'test', elementIds: ['wall_a'] });
    const seen: Array<ReadonlyArray<readonly [string, number]>> = [];
    window.runtime!.events!.on('pryzm-analysis-related-elements', (p: unknown) => {
      seen.push((p as { hops: ReadonlyArray<readonly [string, number]> }).hops);
    });

    selectionBus.dispatch({ type: 'clear', source: 'test', elementIds: [] });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual([]);
  });

  it('a decoration event ("highlight") does NOT republish — the set did not move', () => {
    selectionBus.dispatch({ type: 'select', source: 'test', elementIds: ['wall_a'] });
    const seen: unknown[] = [];
    window.runtime!.events!.on('pryzm-analysis-related-elements', (p: unknown) => seen.push(p));

    selectionBus.dispatch({ type: 'highlight', source: 'test', elementIds: ['zzz'] });

    expect(seen).toHaveLength(0);
  });

  it('initAnalysisRelatedHighlight() is idempotent — a second call does not double-publish', () => {
    initAnalysisRelatedHighlight(); // already called once in beforeEach
    const seen: unknown[] = [];
    window.runtime!.events!.on('pryzm-analysis-related-elements', (p: unknown) => seen.push(p));

    selectionBus.dispatch({ type: 'select', source: 'test', elementIds: ['wall_a'] });

    expect(seen).toHaveLength(1); // not 2
  });
});
