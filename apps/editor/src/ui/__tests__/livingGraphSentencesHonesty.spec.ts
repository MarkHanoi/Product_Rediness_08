// GR-10 (`[]`-means-unknown ledger · C75 §1.4 · C78 §1.4/§8.1 · C71 §4.4) —
// the Living Graph "Spaces" section stops rendering "no spatial neighbours"
// about a room whose relationship projection CRASHED.
//
// The old shape in LivingGraphOverlay was
// `try { roomRelationshipSentences(...) } catch { return []; }`, and an empty
// list omits the section — so "determined: zero neighbours" and "the
// projection threw" were the SAME pixels. The differentiating assertions below
// fail against that shape: it had no `kind` discriminator and no reason.

import { describe, it, expect } from 'vitest';
import { determineRoomRelationshipSentences } from '../living-graph/livingGraphSentences';
import type { BuildingGraph, UbgNode } from '@pryzm/building-graph';

/** A minimal graph stub satisfying the projection's read surface. */
function graphStub(edges: {
  out?: Record<string, Array<{ from: string; to: string }>>;
  nodes?: Record<string, { id: string; kind: string; name?: string }>;
}): BuildingGraph {
  return {
    outEdges: (id: string, type: string) => edges.out?.[type]?.filter((e) => e.from === id) ?? [],
    inEdges: (id: string, type: string) => edges.out?.[type]?.filter((e) => e.to === id) ?? [],
    getNode: (id: string) => edges.nodes?.[id],
  } as unknown as BuildingGraph;
}

describe('determineRoomRelationshipSentences — unknown is a VALUE, never [] (GR-10)', () => {
  it('a THROWING node/graph substrate is RELATIONSHIP_NOT_READABLE, not "no neighbours"', () => {
    const explosiveNode = Object.defineProperty({ id: 'room-1' }, 'kind', {
      get() { throw new Error('node record unreadable'); },
      enumerable: true,
    }) as unknown as UbgNode;
    const det = determineRoomRelationshipSentences(explosiveNode, graphStub({}));
    // FAILS against the old `catch { return []; }` shape — no discriminator,
    // no reason, no named scope.
    expect(det.kind).toBe('undetermined');
    if (det.kind === 'undetermined') {
      expect(det.reason).toBe('RELATIONSHIP_NOT_READABLE');
      expect(det.scope).toContain('room-1');
      expect(det.detail).toContain('node record unreadable');
    }
  });

  it('negative control: a room with genuinely NO neighbours is a DETERMINED empty', () => {
    const node = { id: 'room-lonely', kind: 'room' } as unknown as UbgNode;
    const det = determineRoomRelationshipSentences(node, graphStub({}));
    expect(det.kind).toBe('determined');
    if (det.kind === 'determined') expect(det.elements).toEqual([]);
  });

  it('a readable graph yields the real sentences (determined, with members)', () => {
    const node = { id: 'room-a', kind: 'room' } as unknown as UbgNode;
    const graph = graphStub({
      out: { connectsTo: [{ from: 'room-a', to: 'room-b' }] },
      nodes: { 'room-b': { id: 'room-b', kind: 'room', name: 'Corridor' } },
    });
    const det = determineRoomRelationshipSentences(node, graph);
    expect(det.kind).toBe('determined');
    if (det.kind === 'determined') {
      expect(det.elements.length).toBe(1);
      expect(det.elements[0]!.neighbourId).toBe('room-b');
      expect(det.elements[0]!.text).toContain('connects to');
    }
  });
});
