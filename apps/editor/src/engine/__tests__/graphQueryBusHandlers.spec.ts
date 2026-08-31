// BIM 3.0 Phase 4 (Level 5) — the executed proof for the three read-only graph
// query verbs. Drives the REAL handler set (`buildGraphQueryHandlers`) and the
// REAL `GraphQueryService` over a REAL `CommandBus`, dispatching through
// `dispatchGraphQuery` exactly as a script / panel / AI consumer would (D-INV-3).
//
// The golden queries AND the refusal cases are both asserted, because the whole
// point of Phase 4 (D-INV-1) is that a verb distinguishes NO-RESULTS from
// UNKNOWN-ELEMENT from GRAPH-UNAVAILABLE from UNSUPPORTED-RELATIONSHIP — never a
// bare `[]`.

import { describe, expect, it } from 'vitest';
import { CommandBus } from '@pryzm/command-bus';
import { SemanticGraphManager } from '@pryzm/core-app-model';
import { GraphQueryService, type RoomGraphLike } from '@pryzm/ai-host';
import {
  buildGraphQueryHandlers,
  dispatchGraphQuery,
} from '../graphQueryBusHandlers.js';

const AUDIT = { actorId: 'test', projectId: 'p1', clientId: 'c1' };

/** A real graph with a room adjacency, a wall hosting a door, and a bounding edge. */
function seededGraph(): SemanticGraphManager {
  const g = new SemanticGraphManager();
  // room-A ↔ room-B adjacency (both directions, as the writer stores them).
  g.addRelationship({ type: 'adjacentTo', sourceId: 'room-A', targetId: 'room-B', createdBy: 'system' });
  g.addRelationship({ type: 'adjacentTo', sourceId: 'room-B', targetId: 'room-A', createdBy: 'system' });
  // wall-1 hosts door-1; room-A bounded by wall-1.
  g.addRelationship({ type: 'hosts', sourceId: 'wall-1', targetId: 'door-1', createdBy: 'system' });
  g.addRelationship({ type: 'hostedBy', sourceId: 'door-1', targetId: 'wall-1', createdBy: 'system' });
  g.addRelationship({ type: 'boundedBy', sourceId: 'room-A', targetId: 'wall-1', createdBy: 'system' });
  return g;
}

/** A room BFS stub: room-A and room-B are known on L0 with a doorway between them. */
const rooms: RoomGraphLike = {
  getLevelForRoom: (id) => (id === 'room-A' || id === 'room-B' ? 'L0' : null),
  findPath: (from, to) =>
    (from === 'room-A' && to === 'room-B') || (from === 'room-B' && to === 'room-A')
      ? [from, to]
      : [],
};

function busWith(service: GraphQueryService): CommandBus {
  const bus = new CommandBus({ audit: AUDIT });
  for (const h of buildGraphQueryHandlers(service)) bus.register(h);
  return bus;
}

describe('BIM30 Phase 4 — graph.* read-only bus verbs (D-INV-1/2/3)', () => {
  it('GOLDEN: "which rooms border room-A" via graph.neighbors, over the composed bus', async () => {
    const bus = busWith(new GraphQueryService({ graph: seededGraph(), rooms }));
    const r = await dispatchGraphQuery(bus, 'graph.neighbors', {
      elementId: 'room-A',
      relationshipType: 'adjacentTo',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.neighbors.map((n) => n.id)).toEqual(['room-B']);
      expect(r.neighbors[0]!.relationshipType).toBe('adjacentTo');
    }
  });

  it('GOLDEN: typed edge set via graph.query (getTargets semantics)', async () => {
    const bus = busWith(new GraphQueryService({ graph: seededGraph(), rooms }));
    const r = await dispatchGraphQuery(bus, 'graph.query', {
      elementId: 'wall-1',
      relationshipType: 'hosts',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.targets).toEqual(['door-1']);
  });

  it('GOLDEN: "path from room-A to room-B" via graph.path (BFS route)', async () => {
    const bus = busWith(new GraphQueryService({ graph: seededGraph(), rooms }));
    const r = await dispatchGraphQuery(bus, 'graph.path', {
      fromRoomId: 'room-A',
      toRoomId: 'room-B',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.connected).toBe(true);
      expect(r.route).toEqual(['room-A', 'room-B']);
    }
  });

  it('NO-RESULTS ≠ refusal: an ESTABLISHED empty answers ok+empty, not a refusal', async () => {
    // ⚠ REWRITTEN FOR L-12860 — the invariant is unchanged, the SUBJECT was wrong.
    //
    // This case read `graph.query(room-B, 'hosts')` on the rationale *"room-B is a
    // graph node (adjacency) but hosts nothing"*. It does not host nothing: room-B
    // is a ROOM, the opening writer has never covered it, and `getHostedOpenings`
    // — the typed reader that has existed on `SemanticGraphManager` all along —
    // refuses that exact subject with `wall-unknown-to-hosts-writer`. So the case
    // was pinning a CONFIDENT EMPTY over a question nobody had answered, which is
    // the D-INV-1 defect this very file exists to forbid, asserted as its proof.
    //
    // D-INV-1 still needs its positive half — an emptiness that IS an answer must
    // stay `{ ok: true, targets: [] }`, or the surface refuses everything and the
    // feature dies. So the subject becomes one the WRITER has declared coverage
    // over: the adjacency pass looked at room-B and found no door connecting it.
    const graph = seededGraph();
    graph.markAdjacencyCoverage(['room-B']);
    const bus = busWith(new GraphQueryService({ graph, rooms }));
    const r = await dispatchGraphQuery(bus, 'graph.query', {
      elementId: 'room-B',
      relationshipType: 'connectedTo',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.targets).toEqual([]);
  });

  it('L-12860: an UNESTABLISHED empty is a REFUSAL at the bus verb, not ok+empty', async () => {
    // The other half, over the same composed bus (D-INV-3): the same shaped query
    // on a subject the writer never covered must reach the AI host as a refusal.
    // Without the coverage mark above, "no door connects room-B" and "no detection
    // pass has ever looked at room-B" were the same value at this boundary.
    const bus = busWith(new GraphQueryService({ graph: seededGraph(), rooms }));
    const r = await dispatchGraphQuery(bus, 'graph.query', {
      elementId: 'room-B',
      relationshipType: 'connectedTo',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('room-unknown-to-adjacency-writer');
      expect(r.reason).not.toBe('unknown-element');
      expect(r.detail).toMatch(/NO ANSWER/);
    }
  });

  it('REFUSAL: unknown element → typed unknown-element, NOT []', async () => {
    const bus = busWith(new GraphQueryService({ graph: seededGraph(), rooms }));
    const r = await dispatchGraphQuery(bus, 'graph.neighbors', {
      elementId: 'ghost-999',
      relationshipType: 'adjacentTo',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unknown-element');
  });

  it('REFUSAL: parked relationship → unsupported-relationship (C71 §4.3)', async () => {
    const bus = busWith(new GraphQueryService({ graph: seededGraph(), rooms }));
    const r = await dispatchGraphQuery(bus, 'graph.query', {
      elementId: 'room-A',
      relationshipType: 'precededBy', // a Phase-G parked type, no writer/data
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unsupported-relationship');
  });

  it('REFUSAL: no composed graph → graph-unavailable for every verb', async () => {
    const bus = busWith(new GraphQueryService({ graph: null, rooms: null }));
    const q = await dispatchGraphQuery(bus, 'graph.query', { elementId: 'x', relationshipType: 'hosts' });
    const n = await dispatchGraphQuery(bus, 'graph.neighbors', { elementId: 'x' });
    const p = await dispatchGraphQuery(bus, 'graph.path', { fromRoomId: 'x', toRoomId: 'y' });
    expect(q.ok).toBe(false);
    expect(n.ok).toBe(false);
    expect(p.ok).toBe(false);
    if (!q.ok) expect(q.reason).toBe('graph-unavailable');
    if (!n.ok) expect(n.reason).toBe('graph-unavailable');
    if (!p.ok) expect(p.reason).toBe('graph-unavailable');
  });

  it('REFUSAL: path to an unknown room → unknown-element, distinct from "no route"', async () => {
    const bus = busWith(new GraphQueryService({ graph: seededGraph(), rooms }));
    const unknown = await dispatchGraphQuery(bus, 'graph.path', { fromRoomId: 'room-A', toRoomId: 'ghost' });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toBe('unknown-element');
  });

  it('malformed payload is rejected at canExecute (throws), NOT delivered as an empty answer', async () => {
    const bus = busWith(new GraphQueryService({ graph: seededGraph(), rooms }));
    await expect(
      bus.executeCommand('graph.neighbors', { elementId: '' }),
    ).rejects.toThrow(/canExecute rejected/);
  });
});
