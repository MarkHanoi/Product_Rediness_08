import { describe, it, expect, beforeEach } from 'vitest';
import {
  BuildingGraph,
  UbgSnapshotSchema,
  type UbgNode,
  type UbgEdge,
} from '../src/index.js';

function room(id: string, props?: Record<string, unknown>): UbgNode {
  return { id, kind: 'room', ...(props ? { props } : {}) };
}
function wall(id: string): UbgNode {
  return { id, kind: 'wall' };
}
function edge(from: string, to: string, type: UbgEdge['type'], extra?: Partial<UbgEdge>): UbgEdge {
  return { from, to, type, ...extra };
}

describe('BuildingGraph — nodes & edges', () => {
  let g: BuildingGraph;
  beforeEach(() => {
    g = new BuildingGraph();
  });

  it('adds and retrieves nodes', () => {
    g.addNode(room('r1', { area: 12 }));
    expect(g.nodeCount).toBe(1);
    expect(g.getNode('r1')).toEqual({ id: 'r1', kind: 'room', props: { area: 12 } });
    expect(g.hasNode('r1')).toBe(true);
    expect(g.getNode('missing')).toBeUndefined();
  });

  it('replaces a node with the same id (last-write-wins)', () => {
    g.addNode(room('r1', { area: 12 }));
    g.addNode(room('r1', { area: 20 }));
    expect(g.nodeCount).toBe(1);
    expect(g.getNode('r1')?.props).toEqual({ area: 20 });
  });

  it('rejects an invalid node', () => {
    expect(() => g.addNode({ id: '', kind: 'room' })).toThrow();
    // @ts-expect-error — kind is required
    expect(() => g.addNode({ id: 'x' })).toThrow();
  });

  it('adds edges and preserves insertion order', () => {
    g.addNode(room('r1'));
    g.addNode(room('r2'));
    g.addEdge(edge('r1', 'r2', 'adjacentTo', { weight: 3 }));
    g.addEdge(edge('r2', 'r1', 'adjacentTo'));
    expect(g.edgeCount).toBe(2);
    expect(g.allEdges().map((e) => e.from)).toEqual(['r1', 'r2']);
  });

  it('deduplicates identical edges (same from/to/type)', () => {
    g.addEdge(edge('r1', 'r2', 'connectsTo', { weight: 1 }));
    g.addEdge(edge('r1', 'r2', 'connectsTo', { weight: 9 }));
    expect(g.edgeCount).toBe(1);
    expect(g.allEdges()[0]?.weight).toBe(9);
  });

  it('rejects an invalid edge type', () => {
    // @ts-expect-error — not a UbgEdgeType
    expect(() => g.addEdge(edge('a', 'b', 'nonsense'))).toThrow();
  });
});

describe('BuildingGraph — neighbors & edge queries', () => {
  let g: BuildingGraph;
  beforeEach(() => {
    g = new BuildingGraph();
    // r1 --adjacentTo--> r2, r1 --connectsTo--> r3, r1 --adjacentTo--> r4(unmaterialised)
    ['r1', 'r2', 'r3'].forEach((id) => g.addNode(room(id)));
    g.addEdge(edge('r1', 'r2', 'adjacentTo'));
    g.addEdge(edge('r1', 'r3', 'connectsTo'));
    g.addEdge(edge('r1', 'r4', 'adjacentTo')); // r4 not materialised
    g.addEdge(edge('r2', 'r1', 'connectsTo'));
  });

  it('returns out-edges, optionally filtered by type', () => {
    expect(g.outEdges('r1')).toHaveLength(3);
    expect(g.outEdges('r1', 'adjacentTo').map((e) => e.to)).toEqual(['r2', 'r4']);
    expect(g.outEdges('r1', 'connectsTo').map((e) => e.to)).toEqual(['r3']);
  });

  it('returns in-edges, optionally filtered by type', () => {
    expect(g.inEdges('r1').map((e) => e.from)).toEqual(['r2']);
    expect(g.inEdges('r1', 'adjacentTo')).toHaveLength(0);
    expect(g.inEdges('r1', 'connectsTo').map((e) => e.from)).toEqual(['r2']);
  });

  it('neighbors returns only materialised targets, filtered & deduped', () => {
    // r4 is unmaterialised → excluded
    expect(g.neighbors('r1').map((n) => n.id)).toEqual(['r2', 'r3']);
    expect(g.neighbors('r1', 'adjacentTo').map((n) => n.id)).toEqual(['r2']);
    expect(g.neighbors('r1', 'connectsTo').map((n) => n.id)).toEqual(['r3']);
  });

  it('returns empty for an unknown node', () => {
    expect(g.neighbors('zzz')).toEqual([]);
    expect(g.outEdges('zzz')).toEqual([]);
    expect(g.inEdges('zzz')).toEqual([]);
  });
});

describe('BuildingGraph — subgraph BFS', () => {
  let g: BuildingGraph;
  beforeEach(() => {
    g = new BuildingGraph();
    // chain a -> b -> c -> d  + a -> e
    ['a', 'b', 'c', 'd', 'e'].forEach((id) => g.addNode(wall(id)));
    g.addEdge(edge('a', 'b', 'dependsOn'));
    g.addEdge(edge('b', 'c', 'dependsOn'));
    g.addEdge(edge('c', 'd', 'dependsOn'));
    g.addEdge(edge('a', 'e', 'dependsOn'));
  });

  it('depth 0 = just the root', () => {
    const sub = g.subgraph('a', 0);
    expect(sub.nodes.map((n) => n.id)).toEqual(['a']);
    expect(sub.edges).toEqual([]);
  });

  it('depth 1 = root + direct out-neighbors', () => {
    const sub = g.subgraph('a', 1);
    expect(sub.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'e']);
    // only edges with both endpoints visited
    expect(sub.edges.map((e) => `${e.from}->${e.to}`).sort()).toEqual(['a->b', 'a->e']);
  });

  it('depth 2 = two hops out', () => {
    const sub = g.subgraph('a', 2);
    expect(sub.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c', 'e']);
  });

  it('returns empty for an unknown root', () => {
    expect(g.subgraph('zzz', 3)).toEqual({ nodes: [], edges: [] });
  });
});

describe('BuildingGraph — query', () => {
  let g: BuildingGraph;
  beforeEach(() => {
    g = new BuildingGraph();
    g.addNode(room('r1'));
    g.addNode(room('r2'));
    g.addNode(wall('w1'));
    g.addEdge(edge('r1', 'r2', 'adjacentTo'));
    g.addEdge(edge('w1', 'r1', 'bounds'));
  });

  it('no filter returns everything', () => {
    const res = g.query();
    expect(res.nodes).toHaveLength(3);
    expect(res.edges).toHaveLength(2);
  });

  it('filters nodes by kind', () => {
    expect(g.query({ kind: 'room' }).nodes.map((n) => n.id)).toEqual(['r1', 'r2']);
    expect(g.query({ kind: 'wall' }).nodes.map((n) => n.id)).toEqual(['w1']);
  });

  it('filters edges by type', () => {
    expect(g.query({ edgeType: 'bounds' }).edges.map((e) => e.from)).toEqual(['w1']);
    expect(g.query({ edgeType: 'adjacentTo' }).edges.map((e) => e.from)).toEqual(['r1']);
  });
});

describe('BuildingGraph — clear', () => {
  it('removes all nodes, edges and indexes', () => {
    const g = new BuildingGraph();
    g.addNode(room('r1'));
    g.addNode(room('r2'));
    g.addEdge(edge('r1', 'r2', 'adjacentTo'));
    g.clear();
    expect(g.nodeCount).toBe(0);
    expect(g.edgeCount).toBe(0);
    expect(g.neighbors('r1')).toEqual([]);
  });
});

describe('BuildingGraph — JSON round-trip (strategy §5)', () => {
  function build(): BuildingGraph {
    const g = new BuildingGraph();
    g.addNode(room('r1', { area: 12, name: 'Living' }));
    g.addNode(room('r2', { area: 8 }));
    g.addNode(wall('w1'));
    g.addEdge(edge('w1', 'r1', 'bounds', { evidence: 'topology' }));
    g.addEdge(edge('r1', 'r2', 'connectsTo', { weight: 0.9, evidence: 'roomGraph' }));
    return g;
  }

  it('toJSON emits a versioned, schema-valid snapshot', () => {
    const snap = build().toJSON();
    expect(snap.version).toBe(1);
    expect(() => UbgSnapshotSchema.parse(snap)).not.toThrow();
    expect(snap.nodes).toHaveLength(3);
    expect(snap.edges).toHaveLength(2);
  });

  it('round-trips through JSON.stringify → fromJSON identically', () => {
    const original = build();
    const wire = JSON.parse(JSON.stringify(original.toJSON()));
    const restored = BuildingGraph.fromJSON(wire);
    expect(restored.toJSON()).toEqual(original.toJSON());
    // behaviour preserved
    expect(restored.neighbors('r1', 'connectsTo').map((n) => n.id)).toEqual(['r2']);
    expect(restored.inEdges('r1', 'bounds').map((e) => e.from)).toEqual(['w1']);
  });

  it('instance fromJSON replaces existing contents', () => {
    const g = build();
    g.fromJSON({ version: 1, nodes: [room('only')], edges: [] });
    expect(g.nodeCount).toBe(1);
    expect(g.getNode('only')).toBeDefined();
    expect(g.getNode('r1')).toBeUndefined();
  });

  it('fromJSON rejects an invalid snapshot', () => {
    expect(() => BuildingGraph.fromJSON({ version: 2, nodes: [], edges: [] })).toThrow();
    expect(() => BuildingGraph.fromJSON({ nodes: [], edges: [] })).toThrow();
  });
});
