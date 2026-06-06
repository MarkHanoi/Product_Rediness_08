// A.21.D17 — Living Building Graph force-simulation: the PURE physics core.
//
// Asserts the prototype's two load-bearing properties:
//   1. the sim CONVERGES — total kinetic energy decreases as the field anneals,
//      and `isSettled` flips true once alpha cools;
//   2. springs WORK — a connected (edge) pair ends CLOSER together than a
//      non-connected pair starting from the same scatter.
// Plus determinism (no Math.random) + layer-toggle behaviour.

import { describe, it, expect } from 'vitest';
import {
  createSimState,
  isSettled,
  nodeDistance,
  reheat,
  scatterNodes,
  simulateStep,
} from '../src/ui/living-graph/forceSimulation';
import {
  defaultLayerState,
  type GraphEdge,
  type GraphNode,
  type LiveGraph,
} from '../src/ui/living-graph/livingGraphSchema';

function node(id: string): GraphNode {
  return {
    id,
    label: id,
    type: 'unknown',
    areaSqm: 12,
    sunExposure: 0.5,
    noiseLevel: 0.4,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 20,
  };
}

function edge(a: string, b: string, layers: GraphEdge['layers'] = ['adjacency']): GraphEdge {
  return { a, b, layers, weight: 1 };
}

function makeGraph(): LiveGraph {
  // 6 rooms: a–b–c form a connected triangle (springs); d, e, f are isolated.
  const nodes = ['a', 'b', 'c', 'd', 'e', 'f'].map(node);
  const edges = [edge('a', 'b'), edge('b', 'c'), edge('a', 'c')];
  return { nodes, edges };
}

describe('forceSimulation — convergence', () => {
  it('total kinetic energy trends down as the field anneals', () => {
    const g = makeGraph();
    scatterNodes(g.nodes);
    const state = createSimState();

    // Take an early energy sample after the field has been kicked into motion,
    // then a late one once it has annealed.
    let early = 0;
    for (let i = 0; i < 4; i++) early = simulateStep(g, defaultLayerState(), state);
    let late = early;
    for (let i = 0; i < 240; i++) late = simulateStep(g, defaultLayerState(), state);

    expect(late).toBeLessThan(early);
    expect(isSettled(state)).toBe(true);
  });

  it('isSettled is false while warm, true once cooled', () => {
    const g = makeGraph();
    scatterNodes(g.nodes);
    const state = createSimState();
    expect(isSettled(state)).toBe(false);
    for (let i = 0; i < 200; i++) simulateStep(g, defaultLayerState(), state);
    expect(isSettled(state)).toBe(true);
  });
});

describe('forceSimulation — springs pull connected nodes closer', () => {
  it('a connected pair ends closer than a non-connected pair', () => {
    const g = makeGraph();
    scatterNodes(g.nodes);
    const state = createSimState();
    for (let i = 0; i < 220; i++) simulateStep(g, defaultLayerState(), state);

    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    const connected = nodeDistance(byId.get('a')!, byId.get('b')!); // shares an edge
    // Average isolated-pair distance (d,e,f have no springs → repelled apart).
    const isoPairs = [
      nodeDistance(byId.get('d')!, byId.get('e')!),
      nodeDistance(byId.get('e')!, byId.get('f')!),
      nodeDistance(byId.get('d')!, byId.get('f')!),
    ];
    const avgIso = isoPairs.reduce((s, v) => s + v, 0) / isoPairs.length;

    expect(connected).toBeLessThan(avgIso);
  });
});

describe('forceSimulation — determinism + layer toggles', () => {
  it('scatter + step are deterministic (no Math.random)', () => {
    const run = (): number[] => {
      const g = makeGraph();
      scatterNodes(g.nodes);
      const state = createSimState();
      for (let i = 0; i < 60; i++) simulateStep(g, defaultLayerState(), state);
      return g.nodes.flatMap((n) => [n.x, n.y]);
    };
    expect(run()).toEqual(run());
  });

  it('turning a layer off makes its edge inert (same result as no edge)', () => {
    // A 4-node ring where a–b are bound ONLY by an acoustic edge. With the
    // acoustic layer OFF, that edge must exert NO force, so the final layout is
    // bit-identical to the same graph with no edges at all.
    const withEdge = (): number[] => {
      const g: LiveGraph = {
        nodes: ['a', 'b', 'c', 'd'].map(node),
        edges: [edge('a', 'b', ['acoustic'])],
      };
      scatterNodes(g.nodes);
      const st = createSimState();
      const layersOff = { ...defaultLayerState(), acoustic: false };
      for (let i = 0; i < 120; i++) simulateStep(g, layersOff, st);
      return g.nodes.flatMap((n) => [n.x, n.y]);
    };
    const noEdge = (): number[] => {
      const g: LiveGraph = { nodes: ['a', 'b', 'c', 'd'].map(node), edges: [] };
      scatterNodes(g.nodes);
      const st = createSimState();
      for (let i = 0; i < 120; i++) simulateStep(g, defaultLayerState(), st);
      return g.nodes.flatMap((n) => [n.x, n.y]);
    };
    expect(withEdge()).toEqual(noEdge());
  });

  it('the acoustic spring pulls its pair closer than the same pair unbound', () => {
    // Same 4-node graph; with the acoustic edge ON, a–b sit closer than with the
    // edge inert (layer OFF) — the spring does measurable work.
    const distFor = (acousticOn: boolean): number => {
      const g: LiveGraph = {
        nodes: ['a', 'b', 'c', 'd'].map(node),
        edges: [edge('a', 'b', ['acoustic'])],
      };
      scatterNodes(g.nodes);
      const st = createSimState();
      const layers = { ...defaultLayerState(), acoustic: acousticOn };
      for (let i = 0; i < 220; i++) simulateStep(g, layers, st);
      const byId = new Map(g.nodes.map((n) => [n.id, n]));
      return nodeDistance(byId.get('a')!, byId.get('b')!);
    };
    expect(distFor(true)).toBeLessThan(distFor(false));
  });

  it('reheat lifts alpha so a settled field re-anneals', () => {
    const state = createSimState();
    const g = makeGraph();
    scatterNodes(g.nodes);
    for (let i = 0; i < 200; i++) simulateStep(g, defaultLayerState(), state);
    expect(isSettled(state)).toBe(true);
    reheat(state, 0.8);
    expect(isSettled(state)).toBe(false);
  });
});
