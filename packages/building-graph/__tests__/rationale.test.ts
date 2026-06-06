import { describe, it, expect, beforeEach } from 'vitest';
import {
  BuildingGraph,
  humanNodeLabel,
  doorRoomPair,
  roomRelationshipSentences,
  nodeRationale,
  type UbgNode,
} from '../src/index.js';

// GRAPH.5 / A.21.D16 — human labels + room relationships + element rationale.
// These prove the overlay's "what it is / relationships / why it's here" surface
// is GENERATED from real node/graph data (never the bare generic kind "Element",
// never fabricated reasons).

function room(id: string, props?: Record<string, unknown>): UbgNode {
  return { id, kind: 'room', ...(props ? { props } : {}) };
}

describe('humanNodeLabel — never bare "Element"', () => {
  let g: BuildingGraph;
  beforeEach(() => {
    g = new BuildingGraph();
  });

  it('labels a room by its name', () => {
    expect(humanNodeLabel(room('r1', { name: 'Master Bedroom' }))).toBe('Master Bedroom');
  });

  it('falls back to a room occupancy when there is no name', () => {
    expect(humanNodeLabel(room('r2', { occupancy: 'bathroom' }))).toBe('Bathroom');
  });

  it('labels a window with its façade', () => {
    expect(humanNodeLabel({ id: 'win1', kind: 'window', props: { facade: 'south' } })).toBe(
      'Window · south façade',
    );
  });

  it('labels a door with the two rooms it links (from refs)', () => {
    g.addNode(room('bed', { name: 'Bedroom' }));
    g.addNode(room('cor', { name: 'Corridor' }));
    const door: UbgNode = { id: 'd1', kind: 'door', refs: ['bed', 'cor'] };
    g.addNode(door);
    expect(humanNodeLabel(door, g)).toBe('Door · Bedroom ↔ Corridor');
  });

  it('labels a wall by its exterior/interior role', () => {
    expect(humanNodeLabel({ id: 'w1', kind: 'wall', props: { role: 'exterior' } })).toBe(
      'Wall · exterior',
    );
    expect(humanNodeLabel({ id: 'w2', kind: 'wall', props: { isExterior: false } })).toBe(
      'Wall · interior',
    );
  });

  it('humanises an unknown kind instead of showing the raw slug', () => {
    expect(humanNodeLabel({ id: 'x', kind: 'curtain_wall' })).toBe('Curtain Wall');
  });

  it('labels a rule by its ruleName', () => {
    expect(
      humanNodeLabel({ id: 'rule:min-area', kind: 'rule', props: { ruleName: 'Minimum room area' } }),
    ).toBe('Minimum room area');
  });
});

describe('doorRoomPair', () => {
  it('resolves the two linked rooms from connectsTo edges when refs are absent', () => {
    const g = new BuildingGraph();
    g.addNode(room('kitchen', { name: 'Kitchen' }));
    g.addNode(room('living', { name: 'Living' }));
    g.addNode({ id: 'd1', kind: 'door' });
    g.addEdge({ from: 'kitchen', to: 'd1', type: 'connectsTo' });
    g.addEdge({ from: 'd1', to: 'living', type: 'connectsTo' });
    const pair = doorRoomPair(g.getNode('d1')!, g);
    expect(pair).not.toBeNull();
    expect(new Set(pair!)).toEqual(new Set(['Kitchen', 'Living']));
  });

  it('returns null when fewer than two rooms are resolvable', () => {
    const g = new BuildingGraph();
    g.addNode({ id: 'd1', kind: 'door', refs: ['onlyroom'] });
    g.addNode(room('onlyroom', { name: 'Solo' }));
    expect(doorRoomPair(g.getNode('d1')!, g)).toBeNull();
  });
});

describe('roomRelationshipSentences — plain language', () => {
  let g: BuildingGraph;
  beforeEach(() => {
    g = new BuildingGraph();
    g.addNode(room('living', { name: 'Living' }));
    g.addNode(room('kitchen', { name: 'Kitchen' }));
    g.addNode(room('corridor', { name: 'Corridor' }));
  });

  it('describes door connections and adjacency in plain English', () => {
    g.addEdge({ from: 'living', to: 'corridor', type: 'connectsTo' });
    g.addEdge({ from: 'living', to: 'kitchen', type: 'adjacentTo' });
    const sentences = roomRelationshipSentences(g.getNode('living')!, g).map((s) => s.text);
    expect(sentences).toContain('connects to Corridor via a door');
    expect(sentences).toContain('adjacent to Kitchen');
  });

  it('describes inbound circulation as "reached via"', () => {
    g.addNode({ id: 'corr1', kind: 'circulation', props: { name: 'Hall' } });
    g.addEdge({ from: 'corr1', to: 'living', type: 'circulatesVia' });
    const sentences = roomRelationshipSentences(g.getNode('living')!, g).map((s) => s.text);
    expect(sentences).toContain('reached via Hall');
  });

  it('returns nothing for a non-room node', () => {
    expect(roomRelationshipSentences({ id: 'w', kind: 'wall' }, g)).toEqual([]);
  });
});

describe('nodeRationale — the "why", generated from real data', () => {
  let g: BuildingGraph;
  beforeEach(() => {
    g = new BuildingGraph();
  });

  it('explains a window by its façade + latitude (equator-facing daylight)', () => {
    const r = nodeRationale(
      { id: 'win1', kind: 'window', props: { facade: 'south', latDeg: 51 } },
      g,
    );
    expect(r?.reason).toMatch(/south façade/);
    expect(r?.reason).toMatch(/equator-facing/);
    expect(r?.source).toMatch(/latitude/);
  });

  it('prefers an explicit window orientationReason when present', () => {
    const r = nodeRationale(
      { id: 'win2', kind: 'window', props: { facade: 'north', orientationReason: 'custom reason' } },
      g,
    );
    expect(r?.reason).toBe('custom reason');
  });

  it('explains a door by the rooms it links + a program reason', () => {
    g.addNode(room('bed', { name: 'Bedroom' }));
    g.addNode(room('cor', { name: 'Corridor' }));
    g.addNode({
      id: 'd1',
      kind: 'door',
      refs: ['bed', 'cor'],
      props: { programReason: 'required corridor access for the bedroom' },
    });
    const r = nodeRationale(g.getNode('d1')!, g);
    expect(r?.reason).toContain('Links Bedroom ↔ Corridor');
    expect(r?.reason).toContain('required corridor access for the bedroom');
  });

  it('explains a private room placement from its occupancy', () => {
    const r = nodeRationale(room('b', { name: 'Bedroom', occupancy: 'bedroom' }), g);
    expect(r?.reason).toMatch(/private room/);
    expect(r?.source).toBe('room occupancy');
  });

  it('explains a wet room placement', () => {
    const r = nodeRationale(room('bath', { occupancy: 'bathroom' }), g);
    expect(r?.reason).toMatch(/wet room/);
  });

  it('returns null when no specific reason is derivable (never fabricates)', () => {
    expect(nodeRationale(room('mystery'), g)).toBeNull();
    expect(nodeRationale({ id: 'w', kind: 'wall' }, g)).toBeNull();
    expect(nodeRationale({ id: 'win', kind: 'window' }, g)).toBeNull();
  });
});
