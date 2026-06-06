// A.21.D24 — Living Graph data binding: the room → GraphNode projection.
//
// Covers the additive enrichment shipped in D24:
//   • REAL area resolution — scalar metric (area / computed.area) OR a shoelace
//     area computed from the room boundary polygon (the "— m²" fix);
//   • the room OCCUPANCY tag surfaced on the node (humanised);
//   • room-only filtering + deterministic mapping are preserved.
//
// `buildLiveGraph()` reads the CACHED `window.__pryzmBuildingGraph`; the tests
// install a minimal `{ allNodes, allEdges }` stub on window and assert the
// projected nodes — no DOM/canvas needed (pure mapping).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildLiveGraph } from '../src/ui/living-graph/livingGraphData';

interface StubNode {
  id: string;
  kind: string;
  props?: Record<string, unknown>;
  refs?: string[];
}

function installGraph(nodes: StubNode[], edges: Array<{ from: string; to: string; type: string; weight?: number }> = []): void {
  (globalThis as unknown as { window?: unknown }).window =
    (globalThis as unknown as { window?: unknown }).window ?? {};
  (globalThis as unknown as { window: Record<string, unknown> }).window.__pryzmBuildingGraph = {
    allNodes: () => nodes,
    allEdges: () => edges,
  };
}

beforeEach(() => {
  installGraph([]);
});

afterEach(() => {
  const w = (globalThis as unknown as { window?: Record<string, unknown> }).window;
  if (w) delete w.__pryzmBuildingGraph;
});

describe('buildLiveGraph — real area (§LG-REAL-AREA)', () => {
  it('uses a scalar area prop when present', () => {
    installGraph([{ id: 'room_a', kind: 'room', props: { name: 'Lounge', area: 18.4 } }]);
    const g = buildLiveGraph();
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0]!.areaSqm).toBeCloseTo(18.4, 3);
  });

  it('reads the detected-room shape area at computed.area', () => {
    installGraph([{ id: 'room_b', kind: 'room', props: { name: 'Kitchen', computed: { area: 9.25 } } }]);
    expect(buildLiveGraph().nodes[0]!.areaSqm).toBeCloseTo(9.25, 3);
  });

  it('computes a shoelace area from a boundary polygon when no scalar is given', () => {
    // A 4×3 m rectangle (world-XZ) → 12 m².
    const polygon = [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
      { x: 4, z: 3 },
      { x: 0, z: 3 },
    ];
    installGraph([{ id: 'room_c', kind: 'room', props: { name: 'Bath', boundary: { polygon } } }]);
    expect(buildLiveGraph().nodes[0]!.areaSqm).toBeCloseTo(12, 3);
  });

  it('computes shoelace area from a bare polygon prop too', () => {
    const polygon = [
      { x: 0, z: 0 },
      { x: 2, z: 0 },
      { x: 2, z: 2 },
      { x: 0, z: 2 },
    ];
    installGraph([{ id: 'room_d', kind: 'room', props: { name: 'WC', polygon } }]);
    expect(buildLiveGraph().nodes[0]!.areaSqm).toBeCloseTo(4, 3);
  });

  it('leaves area 0 (→ "— m²") only when neither metric nor boundary exists', () => {
    installGraph([{ id: 'room_e', kind: 'room', props: { name: 'Void' } }]);
    expect(buildLiveGraph().nodes[0]!.areaSqm).toBe(0);
  });
});

describe('buildLiveGraph — occupancy + filtering', () => {
  it('surfaces the humanised occupancy tag on the node', () => {
    installGraph([{ id: 'room_f', kind: 'room', props: { name: 'Bedroom 1', occupancyType: 'master_bedroom', area: 14 } }]);
    expect(buildLiveGraph().nodes[0]!.occupancy).toBe('Master Bedroom');
  });

  it('excludes non-room kinds (walls / doors / windows / furniture)', () => {
    installGraph([
      { id: 'room_g', kind: 'room', props: { name: 'Hall', area: 6 } },
      { id: 'wall_1', kind: 'wall' },
      { id: 'door_1', kind: 'door' },
      { id: 'window_1', kind: 'window' },
      { id: 'furn_1', kind: 'furniture' },
    ]);
    const g = buildLiveGraph();
    expect(g.nodes.map((n) => n.id)).toEqual(['room_g']);
  });

  it('is deterministic for the same cached graph', () => {
    const nodes: StubNode[] = [
      { id: 'r1', kind: 'room', props: { name: 'A', area: 10 } },
      { id: 'r2', kind: 'room', props: { name: 'B', area: 12 } },
    ];
    installGraph(nodes);
    const a = buildLiveGraph().nodes.map((n) => n.areaSqm);
    installGraph(nodes);
    const b = buildLiveGraph().nodes.map((n) => n.areaSqm);
    expect(a).toEqual(b);
  });
});
