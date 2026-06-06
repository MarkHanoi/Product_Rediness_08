// GRAPH.2-wiring — buildBuildingGraph() projects the live runtime graphs into
// the UBG. Each test feeds a FAKE runtime (small fixtures per service) and
// asserts the UBG ends up with the expected node kinds + edge types. The pure
// @pryzm/building-graph adapter tests stay separate (packages/building-graph).

import { describe, it, expect } from 'vitest';
import {
  buildBuildingGraph,
  extractTopologySnapshot,
  extractRoomGraphSnapshot,
  extractSemanticSnapshot,
  extractDependencySnapshot,
  extractConstraintSnapshot,
  wallFacadeCompass,
  kindFromId,
  type BuildBuildingGraphServices,
  type TopologyLayerLike,
  type RoomGraphServiceLike,
  type SemanticGraphManagerLike,
  type ConstraintSourceLike,
  type RoomStoreLike,
  type WallStoreLike,
  type WindowStoreLike,
} from '../src/engine/buildBuildingGraph.js';
import { humanNodeLabel, nodeRationale } from '@pryzm/building-graph';

// ── Fakes ─────────────────────────────────────────────────────────────────────

/** Per-element adjacency keyed map, mirroring TopologyLayer. */
function fakeTopology(
  byElement: Record<string, Array<{ sourceId: string; targetId: string; kind: 'adjacentTo' | 'intersects' }>>,
): TopologyLayerLike {
  return {
    getAdjacencyRelationships: (id) => byElement[id] ?? [],
  };
}

/** One-level RoomGraphService using Maps (the real shape). */
function fakeRoomGraph(graph: {
  levelId: string;
  nodes: Array<{ roomId: string }>;
  edges: Array<{ fromRoomId: string; toRoomId: string; doorId?: string; doorWidth?: number }>;
}): RoomGraphServiceLike {
  const nodes = new Map(graph.nodes.map((n) => [n.roomId, n]));
  const edges = new Map(graph.edges.map((e, i) => [`${e.fromRoomId}|${e.toRoomId}|${i}`, e]));
  return {
    getGraph: (levelId) =>
      levelId === graph.levelId
        ? { levelId, nodes, edges }
        : { levelId, nodes: new Map(), edges: new Map() },
  };
}

function fakeSemantic(
  rels: Array<{ sourceId: string; targetId: string; type: string }>,
): SemanticGraphManagerLike {
  return { getAll: () => rels };
}

function fakeConstraint(
  violations: Array<{ ruleId: string; elementId: string; ruleName?: string; severity?: string | { level?: string }; message?: string }>,
): ConstraintSourceLike {
  return { validateModel: () => ({ violations }) };
}

// ── Full build: all five sources present ────────────────────────────────────

describe('buildBuildingGraph — full projection', () => {
  it('projects every source into one UBG with the expected node kinds + edge types', () => {
    const services: BuildBuildingGraphServices = {
      topology: fakeTopology({
        w1: [{ sourceId: 'w1', targetId: 'living', kind: 'intersects' }],
        living: [{ sourceId: 'living', targetId: 'kitchen', kind: 'adjacentTo' }],
      }),
      elementIds: ['w1', 'living', 'kitchen'],
      kindOf: (id) => (id.startsWith('w') ? 'wall' : 'room'),
      roomGraph: fakeRoomGraph({
        levelId: 'L1',
        nodes: [{ roomId: 'living' }, { roomId: 'kitchen' }],
        edges: [{ fromRoomId: 'living', toRoomId: 'kitchen', doorId: 'd1', doorWidth: 0.9 }],
      }),
      levelIds: ['L1'],
      semantic: fakeSemantic([
        { sourceId: 'wallB', targetId: 'wallA', type: 'branchedFrom' }, // derivesFrom
        { sourceId: 'd1', targetId: 'w1', type: 'hostedBy' }, // dependency (and ignored by semantic)
      ]),
      dependencyFrom: fakeSemantic([
        { sourceId: 'w1', targetId: 'd1', type: 'hosts' }, // d1 dependsOn w1
        { sourceId: 'living', targetId: 'w1', type: 'boundedBy' }, // living dependsOn w1
      ]),
      constraint: fakeConstraint([
        { ruleId: 'min-area', elementId: 'kitchen', severity: { level: 'error' }, message: 'too small' },
      ]),
    };

    const g = buildBuildingGraph({ services });

    const edgeTypes = new Set(g.allEdges().map((e) => e.type));
    expect(edgeTypes).toEqual(
      new Set(['bounds', 'adjacentTo', 'connectsTo', 'derivesFrom', 'dependsOn', 'violates']),
    );

    // node kinds
    expect(g.getNode('w1')?.kind).toBe('wall');
    expect(g.getNode('living')?.kind).toBe('room');
    expect(g.getNode('d1')?.kind).toBe('door');
    expect(g.getNode('rule:min-area')?.kind).toBe('rule');

    // specific projected edges
    expect(g.query({ edgeType: 'bounds' }).edges[0]).toMatchObject({ from: 'w1', to: 'living' });
    expect(g.query({ edgeType: 'connectsTo' }).edges[0]).toMatchObject({
      from: 'living',
      to: 'kitchen',
      weight: 0.9,
    });
    expect(g.query({ edgeType: 'derivesFrom' }).edges[0]).toMatchObject({ from: 'wallB', to: 'wallA' });
    expect(g.query({ edgeType: 'dependsOn' }).edges.map((e) => `${e.from}->${e.to}`).sort()).toEqual([
      'd1->w1',
      'living->w1',
    ]);
    expect(g.query({ edgeType: 'violates' }).edges[0]).toMatchObject({
      from: 'kitchen',
      to: 'rule:min-area',
    });
  });
});

// ── Guards: absent services are skipped, never fatal ─────────────────────────

describe('buildBuildingGraph — guards', () => {
  it('returns an empty graph when no service is present', () => {
    const g = buildBuildingGraph({ services: {} });
    expect(g.nodeCount).toBe(0);
    expect(g.edgeCount).toBe(0);
  });

  it('skips topology when elementIds are absent', () => {
    const g = buildBuildingGraph({
      services: { topology: fakeTopology({ a: [{ sourceId: 'a', targetId: 'b', kind: 'adjacentTo' }] }) },
    });
    expect(g.query({ edgeType: 'adjacentTo' }).edges).toHaveLength(0);
  });

  it('skips roomGraph when levelIds are absent', () => {
    const g = buildBuildingGraph({
      services: {
        roomGraph: fakeRoomGraph({ levelId: 'L1', nodes: [{ roomId: 'r' }], edges: [] }),
      },
    });
    expect(g.query({ kind: 'room' }).nodes).toHaveLength(0);
  });

  it('does not throw when a single source throws — other adapters still project', () => {
    const throwingTopology: TopologyLayerLike = {
      getAdjacencyRelationships: () => {
        throw new Error('boom');
      },
    };
    const g = buildBuildingGraph({
      services: {
        topology: throwingTopology,
        elementIds: ['x'],
        semantic: fakeSemantic([{ sourceId: 'a', targetId: 'b', type: 'supersedes' }]),
      },
    });
    // topology contributed nothing, but the semantic adapter still ran.
    expect(g.query({ edgeType: 'derivesFrom' }).edges).toHaveLength(1);
  });

  it('only projects derivation relationships from the semantic source', () => {
    const g = buildBuildingGraph({
      services: {
        semantic: fakeSemantic([
          { sourceId: 'a', targetId: 'b', type: 'hosts' }, // not a derivation → no edge
        ]),
      },
    });
    expect(g.edgeCount).toBe(0);
  });
});

// ── Extractors ───────────────────────────────────────────────────────────────

describe('extractors map live shapes → inputs.ts snapshots', () => {
  it('extractTopologySnapshot de-dups the symmetric pair', () => {
    const topo = fakeTopology({
      a: [{ sourceId: 'a', targetId: 'b', kind: 'adjacentTo' }],
      b: [{ sourceId: 'b', targetId: 'a', kind: 'adjacentTo' }], // same edge, reversed
    });
    const snap = extractTopologySnapshot(topo, ['a', 'b']);
    expect(snap.relationships).toHaveLength(1);
  });

  it('extractRoomGraphSnapshot reads Map-backed nodes/edges', () => {
    const rg = fakeRoomGraph({
      levelId: 'L1',
      nodes: [{ roomId: 'r1' }, { roomId: 'r2' }],
      edges: [{ fromRoomId: 'r1', toRoomId: 'r2', doorId: 'd', doorWidth: 0.8 }],
    }).getGraph('L1');
    const snap = extractRoomGraphSnapshot(rg);
    expect(snap.levelId).toBe('L1');
    expect(snap.nodes).toHaveLength(2);
    expect(snap.edges[0]).toMatchObject({ fromRoomId: 'r1', toRoomId: 'r2', doorId: 'd', doorWidth: 0.8 });
  });

  it('extractSemanticSnapshot passes through every relationship type', () => {
    const snap = extractSemanticSnapshot(
      fakeSemantic([
        { sourceId: 'a', targetId: 'b', type: 'branchedFrom' },
        { sourceId: 'c', targetId: 'd', type: 'hosts' },
      ]),
    );
    expect(snap.relationships).toHaveLength(2);
  });

  it('extractDependencySnapshot derives dependsOn pairs from structural relations only', () => {
    const snap = extractDependencySnapshot(
      fakeSemantic([
        { sourceId: 'w1', targetId: 'd1', type: 'hosts' }, // d1 dependsOn w1
        { sourceId: 'r1', targetId: 'w1', type: 'boundedBy' }, // r1 dependsOn w1
        { sourceId: 'x', targetId: 'y', type: 'branchedFrom' }, // not structural → skipped
      ]),
    );
    const pairs = snap.edges.map((e) => `${e.dependentId}->${e.dependsOnId}`).sort();
    expect(pairs).toEqual(['d1->w1', 'r1->w1']);
  });

  it('extractConstraintSnapshot flattens RuleSeverity.level → string', () => {
    const snap = extractConstraintSnapshot(
      fakeConstraint([
        { ruleId: 'r', elementId: 'e', severity: { level: 'warning' }, message: 'm' },
      ]),
    );
    expect(snap.violations[0]).toMatchObject({ ruleId: 'r', elementId: 'e', severity: 'warning', message: 'm' });
  });
});

// ── A.21.D16 — kind-from-id + façade compass (pure) ───────────────────────────

describe('kindFromId', () => {
  it('reads the element-id prefix as the node kind', () => {
    expect(kindFromId('wall_01H8')).toBe('wall');
    expect(kindFromId('room_01H8')).toBe('room');
    expect(kindFromId('window_01H8')).toBe('window');
  });
  it('returns undefined for unknown or un-prefixed ids (→ generic element)', () => {
    expect(kindFromId('mystery_01H8')).toBeUndefined();
    expect(kindFromId('nounderscore')).toBeUndefined();
  });
});

describe('wallFacadeCompass — outward normal → compass slug', () => {
  // A horizontal wall (along world X) with the room to its SOUTH (+z) faces NORTH.
  it('orients the outward normal away from the room centroid', () => {
    const a = { x: 0, z: 0 };
    const b = { x: 4, z: 0 };
    expect(wallFacadeCompass(a, b, { x: 2, z: 2 })).toBe('north'); // room south → wall faces north
    expect(wallFacadeCompass(a, b, { x: 2, z: -2 })).toBe('south'); // room north → wall faces south
  });
  it('returns null for a degenerate (zero-length) wall', () => {
    expect(wallFacadeCompass({ x: 1, z: 1 }, { x: 1, z: 1 }, { x: 0, z: 0 })).toBeNull();
  });
});

// ── A.21.D16 — enrichment: rich room props + window façade + adjacency ────────

function fakeRoomStore(byId: Record<string, { name?: string; occupancy?: string; area?: number }>): RoomStoreLike {
  return { getById: (id) => byId[id] ?? null };
}
function fakeWallStore(byId: Record<string, { baseLine?: Array<{ x: number; z: number }> }>): WallStoreLike {
  return { getById: (id) => byId[id] ?? null };
}
function fakeWindowStore(wins: Array<{ id: string; wallId?: string; width?: number; height?: number }>): WindowStoreLike {
  return { getAll: () => wins };
}

describe('buildBuildingGraph — A.21.D16 enrichment', () => {
  it('stamps human room name/occupancy/area + emits room↔room adjacency', () => {
    // RoomGraph carries adjacency on the node (adjacentRooms), RoomStore the names.
    const nodes = new Map<string, { roomId: string; adjacentRooms?: string[] }>([
      ['r_bed', { roomId: 'r_bed', adjacentRooms: ['r_kitchen'] }],
      ['r_kitchen', { roomId: 'r_kitchen', adjacentRooms: ['r_bed'] }],
    ]);
    const roomGraph: RoomGraphServiceLike = {
      getGraph: () => ({ levelId: 'L1', nodes, edges: new Map() }),
    };
    const g = buildBuildingGraph({
      services: {
        roomGraph,
        levelIds: ['L1'],
        roomStore: fakeRoomStore({
          r_bed: { name: 'Master Bedroom', occupancy: 'bedroom', area: 14 },
          r_kitchen: { name: 'Kitchen', occupancy: 'kitchen', area: 9 },
        }),
      },
    });
    expect(g.getNode('r_bed')?.props).toMatchObject({ name: 'Master Bedroom', occupancy: 'bedroom', area: 14 });
    expect(humanNodeLabel(g.getNode('r_bed')!)).toBe('Master Bedroom');
    // one symmetric adjacentTo edge (de-duped to the lower id)
    const adj = g.query({ edgeType: 'adjacentTo' }).edges;
    expect(adj).toHaveLength(1);
    expect(adj[0]).toMatchObject({ from: 'r_bed', to: 'r_kitchen' });
    // room rationale derives from occupancy
    expect(nodeRationale(g.getNode('r_bed')!, g)?.reason).toMatch(/private room/);
  });

  it('materialises a window node with façade + hostedIn edge + daylight rationale', () => {
    // A south-facing exterior wall bounds the living room (room to the north).
    const g = buildBuildingGraph({
      services: {
        topology: { getAdjacencyRelationships: (id) =>
          id === 'wall_s' ? [{ sourceId: 'wall_s', targetId: 'room_living', kind: 'intersects' }] : [] },
        elementIds: ['wall_s', 'room_living'],
        kindOf: kindFromId,
        roomStore: fakeRoomStore({ room_living: { name: 'Living', occupancy: 'living', area: 22 } }),
        wallStore: fakeWallStore({ wall_s: { baseLine: [{ x: 0, z: 0 }, { x: 5, z: 0 }] } }),
        windowStore: fakeWindowStore([{ id: 'window_1', wallId: 'wall_s', width: 1.5, height: 1.2 }]),
        latDeg: 51, // northern hemisphere → equator-facing = south
      },
    });
    const win = g.getNode('window_1');
    expect(win?.kind).toBe('window');
    // room_living centroid is at z=0 (only the wall baseline is known); with the
    // room to the north the wall faces south. Assert the façade resolved.
    expect(typeof win?.props?.facade).toBe('string');
    expect(g.query({ edgeType: 'hostedIn' }).edges).toMatchObject([{ from: 'window_1', to: 'wall_s' }]);
    const why = nodeRationale(win!, g);
    expect(why?.reason).toMatch(/façade/);
  });

  it('is a no-op when enrichment sources are absent (graph unchanged)', () => {
    const g = buildBuildingGraph({
      services: {
        roomGraph: { getGraph: () => ({ levelId: 'L1', nodes: new Map([['r', { roomId: 'r' }]]), edges: new Map() }) },
        levelIds: ['L1'],
      },
    });
    // room node present but un-enriched (no name prop), no windows, no crash.
    expect(g.getNode('r')?.kind).toBe('room');
    expect(g.query({ kind: 'window' }).nodes).toHaveLength(0);
  });
});
