import { describe, it, expect, beforeEach } from 'vitest';
import {
  BuildingGraph,
  createTopologyAdapter,
  createRoomGraphAdapter,
  createSemanticAdapter,
  createDependencyAdapter,
  createConstraintAdapter,
  ruleNodeId,
  TOPOLOGY_ADAPTER_NAME,
  ROOM_GRAPH_ADAPTER_NAME,
  SEMANTIC_ADAPTER_NAME,
  DEPENDENCY_ADAPTER_NAME,
  CONSTRAINT_ADAPTER_NAME,
  DERIVATION_TYPES,
  type UbgAdapter,
} from '../src/index.js';

// GRAPH.2 — every concrete adapter projects its specialised graph into the UBG.
// One describe per adapter; each proves the EDGE TYPE(S) that adapter emits from
// a small realistic fixture, plus idempotence (re-project = same graph) per
// ADR-0058 §4.

describe('topologyAdapter — bounds + adjacentTo', () => {
  let g: BuildingGraph;
  beforeEach(() => {
    g = new BuildingGraph();
  });

  it('projects `intersects` → bounds and `adjacentTo` → adjacentTo', () => {
    const adapter = createTopologyAdapter({
      relationships: [
        { sourceId: 'w1', targetId: 'r1', kind: 'intersects' }, // wall bounds room
        { sourceId: 'r1', targetId: 'r2', kind: 'adjacentTo' }, // rooms adjacent
      ],
      kindOf: (id) => (id.startsWith('w') ? 'wall' : 'room'),
    });
    adapter.project(g);

    const bounds = g.query({ edgeType: 'bounds' }).edges;
    expect(bounds).toHaveLength(1);
    expect(bounds[0]).toMatchObject({ from: 'w1', to: 'r1', type: 'bounds', evidence: 'topology' });

    const adj = g.query({ edgeType: 'adjacentTo' }).edges;
    expect(adj).toHaveLength(1);
    expect(adj[0]).toMatchObject({ from: 'r1', to: 'r2', type: 'adjacentTo' });

    // endpoint nodes materialised with the resolved kind
    expect(g.getNode('w1')?.kind).toBe('wall');
    expect(g.getNode('r1')?.kind).toBe('room');
    expect(adapter.name).toBe(TOPOLOGY_ADAPTER_NAME);
  });

  it('defaults node kind to `element` without a kindOf resolver', () => {
    createTopologyAdapter({
      relationships: [{ sourceId: 'a', targetId: 'b', kind: 'adjacentTo' }],
    }).project(g);
    expect(g.getNode('a')?.kind).toBe('element');
  });

  it('is idempotent — re-project yields the same graph', () => {
    const adapter = createTopologyAdapter({
      relationships: [{ sourceId: 'w1', targetId: 'r1', kind: 'intersects' }],
    });
    adapter.project(g);
    adapter.project(g);
    expect(g.nodeCount).toBe(2);
    expect(g.edgeCount).toBe(1);
  });
});

describe('roomGraphAdapter — connectsTo + circulatesVia', () => {
  let g: BuildingGraph;
  beforeEach(() => {
    g = new BuildingGraph();
  });

  it('projects door edges → connectsTo with doorWidth weight + door node', () => {
    createRoomGraphAdapter({
      levelId: 'L1',
      nodes: [
        { roomId: 'living', props: { name: 'Living', area: 24 } },
        { roomId: 'kitchen', props: { name: 'Kitchen' } },
      ],
      edges: [{ fromRoomId: 'living', toRoomId: 'kitchen', doorId: 'd1', doorWidth: 0.9 }],
    }).project(g);

    const conn = g.query({ edgeType: 'connectsTo' }).edges;
    expect(conn).toHaveLength(1);
    expect(conn[0]).toMatchObject({
      from: 'living',
      to: 'kitchen',
      type: 'connectsTo',
      weight: 0.9,
      evidence: ROOM_GRAPH_ADAPTER_NAME,
    });

    // room nodes carry levelId + their props; door node references both rooms
    expect(g.getNode('living')?.props).toMatchObject({ levelId: 'L1', name: 'Living', area: 24 });
    expect(g.getNode('d1')).toMatchObject({ kind: 'door', refs: ['living', 'kitchen'] });
  });

  it('projects circulation paths → circulatesVia from a circulation node', () => {
    createRoomGraphAdapter({
      nodes: [{ roomId: 'hall' }, { roomId: 'bed1' }, { roomId: 'bed2' }],
      edges: [],
      circulationPaths: [{ id: 'corridor1', viaRoomIds: ['hall', 'bed1', 'bed2'] }],
    }).project(g);

    const via = g.query({ edgeType: 'circulatesVia' }).edges;
    expect(via).toHaveLength(3);
    expect(via.map((e) => e.to)).toEqual(['hall', 'bed1', 'bed2']);
    expect(via.every((e) => e.from === 'corridor1')).toBe(true);
    expect(g.getNode('corridor1')).toMatchObject({
      kind: 'circulation',
      refs: ['hall', 'bed1', 'bed2'],
    });
  });
});

describe('semanticAdapter — derivesFrom', () => {
  let g: BuildingGraph;
  beforeEach(() => {
    g = new BuildingGraph();
  });

  it('projects only derivation relationships → derivesFrom (source → origin)', () => {
    createSemanticAdapter({
      relationships: [
        { sourceId: 'wallB', targetId: 'wallA', type: 'branchedFrom' },
        { sourceId: 'roofNew', targetId: 'roofOld', type: 'supersedes' },
        { sourceId: 'x', targetId: 'y', type: 'hostedIn' }, // NOT a derivation → ignored
      ],
    }).project(g);

    const derives = g.query({ edgeType: 'derivesFrom' }).edges;
    expect(derives).toHaveLength(2);
    expect(derives.map((e) => `${e.from}->${e.to}`)).toEqual(['wallB->wallA', 'roofNew->roofOld']);
    expect(derives[0]?.evidence).toBe(`${SEMANTIC_ADAPTER_NAME}:branchedFrom`);
    // the non-derivation relationship produced no edge AND no nodes
    expect(g.getNode('x')).toBeUndefined();
  });

  it('projects every documented derivation type', () => {
    createSemanticAdapter({
      relationships: DERIVATION_TYPES.map((type, i) => ({
        sourceId: `s${i}`,
        targetId: `t${i}`,
        type,
      })),
    }).project(g);
    expect(g.query({ edgeType: 'derivesFrom' }).edges).toHaveLength(DERIVATION_TYPES.length);
  });
});

describe('dependencyAdapter — dependsOn', () => {
  it('projects cascade pairs → dependsOn (dependent → dependsOn) with priority weight', () => {
    const g = new BuildingGraph();
    createDependencyAdapter({
      edges: [
        { dependentId: 'door1', dependsOnId: 'wall1', priority: 1 },
        { dependentId: 'wall1', dependsOnId: 'level1' },
      ],
    }).project(g);

    const deps = g.query({ edgeType: 'dependsOn' }).edges;
    expect(deps).toHaveLength(2);
    expect(deps[0]).toMatchObject({
      from: 'door1',
      to: 'wall1',
      type: 'dependsOn',
      weight: 1,
      evidence: DEPENDENCY_ADAPTER_NAME,
    });
    // the second pair has no priority → no weight key
    expect(deps[1]?.weight).toBeUndefined();
    expect(g.getNode('level1')?.kind).toBe('element');
  });
});

describe('constraintAdapter — violates', () => {
  it('projects violations → violates (element → rule:{ruleId}) with synthetic rule node', () => {
    const g = new BuildingGraph();
    createConstraintAdapter({
      violations: [
        {
          ruleId: 'min-room-area',
          elementId: 'room1',
          ruleName: 'Minimum room area',
          severity: 'error',
          message: 'area 4m² < 6m²',
        },
      ],
    }).project(g);

    const violates = g.query({ edgeType: 'violates' }).edges;
    expect(violates).toHaveLength(1);
    expect(violates[0]).toMatchObject({
      from: 'room1',
      to: ruleNodeId('min-room-area'),
      type: 'violates',
    });
    // severity + message carried in evidence for auditability
    expect(violates[0]?.evidence).toBe(`${CONSTRAINT_ADAPTER_NAME}:error:area 4m² < 6m²`);

    const ruleNode = g.getNode(ruleNodeId('min-room-area'));
    expect(ruleNode).toMatchObject({
      kind: 'rule',
      props: { ruleId: 'min-room-area', ruleName: 'Minimum room area' },
    });
  });

  it('falls back to `violation` evidence when severity/message are absent', () => {
    const g = new BuildingGraph();
    createConstraintAdapter({
      violations: [{ ruleId: 'r', elementId: 'e' }],
    }).project(g);
    expect(g.query({ edgeType: 'violates' }).edges[0]?.evidence).toBe(
      `${CONSTRAINT_ADAPTER_NAME}:violation`,
    );
  });
});

describe('adapters compose into one graph (projectAll-style)', () => {
  it('all six edge types coexist in a single UBG from layered adapters', () => {
    const g = new BuildingGraph();
    const adapters: UbgAdapter[] = [
      createTopologyAdapter({
        relationships: [
          { sourceId: 'w1', targetId: 'living', kind: 'intersects' },
          { sourceId: 'living', targetId: 'kitchen', kind: 'adjacentTo' },
        ],
      }),
      createRoomGraphAdapter({
        nodes: [{ roomId: 'living' }, { roomId: 'kitchen' }],
        edges: [{ fromRoomId: 'living', toRoomId: 'kitchen', doorId: 'd1', doorWidth: 0.8 }],
        circulationPaths: [{ id: 'corr', viaRoomIds: ['living', 'kitchen'] }],
      }),
      createSemanticAdapter({
        relationships: [{ sourceId: 'kitchen', targetId: 'living', type: 'branchedFrom' }],
      }),
      createDependencyAdapter({
        edges: [{ dependentId: 'd1', dependsOnId: 'w1' }],
      }),
      createConstraintAdapter({
        violations: [{ ruleId: 'egress', elementId: 'kitchen' }],
      }),
    ];
    for (const a of adapters) a.project(g);

    const types = new Set(g.allEdges().map((e) => e.type));
    expect(types).toEqual(
      new Set(['bounds', 'adjacentTo', 'connectsTo', 'circulatesVia', 'derivesFrom', 'dependsOn', 'violates']),
    );
  });
});
