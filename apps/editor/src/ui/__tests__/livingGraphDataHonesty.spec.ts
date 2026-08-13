// GR-10 (`[]`-means-unknown ledger · C75 §1.4 · C78 §1.4/§8.1 · C71 §4.4) —
// buildLiveGraph stops rendering "no relationships" about a cached building
// graph whose edge set could not be READ.
//
// The old shape was `rawEdges = ubg.allEdges() ?? [];` inside a catch that
// returned a bare `{ nodes: [], edges: [] }` — so an unreadable UBG and a
// genuinely relationship-less model produced IDENTICAL output, and the
// overlay drew a field of rooms with no lines either way. The differentiating
// assertions below fail against that shape: it carried no `edgesUndetermined`
// field and no reason.

import { describe, it, expect, afterEach } from 'vitest';
import { buildLiveGraph } from '../living-graph/livingGraphData';

type AnyWindow = Window & { __pryzmBuildingGraph?: unknown };
const w = window as unknown as AnyWindow;

afterEach(() => {
  delete w.__pryzmBuildingGraph;
});

const ROOM = { id: 'r1', kind: 'room', props: { name: 'Kitchen', area: 12 } };

describe('buildLiveGraph — an unreadable edge set is NAMED, never an empty graph (GR-10)', () => {
  it('allEdges() answering no array sets edgesUndetermined; rooms still render', () => {
    w.__pryzmBuildingGraph = {
      allNodes: () => [ROOM],
      allEdges: () => undefined,
    };
    const g = buildLiveGraph();
    expect(g.nodes.map((n) => n.id)).toEqual(['r1']);
    expect(g.edges).toEqual([]);
    // FAILS against the old `?? []` shape, which had no such field.
    expect(g.edgesUndetermined).toBeDefined();
    expect(g.edgesUndetermined!.reason).toBe('RELATIONSHIP_NOT_READABLE');
  });

  it('a THROWING cached graph is undetermined, not an honest empty', () => {
    w.__pryzmBuildingGraph = {
      allNodes: () => { throw new Error('graph store unreadable'); },
      allEdges: () => [],
    };
    const g = buildLiveGraph();
    expect(g.nodes).toEqual([]);
    expect(g.edgesUndetermined).toBeDefined();
    expect(g.edgesUndetermined!.reason).toBe('RELATIONSHIP_NOT_READABLE');
    expect(g.edgesUndetermined!.detail).toContain('graph store unreadable');
  });

  it('negative control: a READABLE graph with zero edges is a DETERMINED empty (no flag)', () => {
    w.__pryzmBuildingGraph = {
      allNodes: () => [ROOM],
      allEdges: () => [],
    };
    const g = buildLiveGraph();
    expect(g.nodes.map((n) => n.id)).toEqual(['r1']);
    expect(g.edges).toEqual([]);
    expect(g.edgesUndetermined).toBeUndefined();
  });

  it('negative control: NO cached graph at all stays the plain empty graph (pre-existing contract)', () => {
    const g = buildLiveGraph();
    expect(g.nodes).toEqual([]);
    expect(g.edgesUndetermined).toBeUndefined();
  });
});
