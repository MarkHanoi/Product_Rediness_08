// ─── L-12860 — the dynamic path must not be more confident than the typed reader ───
//
// THE DEFECT (STR-06 §6-bis · C71 §4.4 · C78 §1.4 · §CONTEXT-DATA-HONESTY):
//
//   Six supported families already had refusal-bearing typed readers on
//   `SemanticGraphManager`, with live production consumers —
//   `getHostedOpenings` · `getBoundingWalls` · `getConnectedRooms` ·
//   `getAdjacentRooms` · `getContainedElements` · `getJoinedWalls`. Each can say
//   "NO ANSWER" for a subject the writer never covered, or one whose region
//   conclusion a move/delete left UNDETERMINED.
//
//   `GraphQueryService` — the surface behind the `graph.query` / `graph.neighbors`
//   BUS VERBS, i.e. the surface the AI host actually reads — answered all six
//   through the bare `graph.getTargets(id, type)` and returned a CONFIDENT
//   `{ ok: true, targets: [] }` on exactly those subjects. At that boundary the
//   `[]` stops being a value and becomes English in a prompt: "this wall bounds
//   nothing" and "I could not determine what this wall bounds" are one sentence,
//   and the model states the first with confidence.
//
// WHAT THIS SUITE PINS. Every case drives a REAL `SemanticGraphManager` — a stub
// built from the assertion could only prove the stub agrees with it. Each refusal
// case carries its own CONTROL: the typed reader is called directly in the same
// test, so the suite proves the two surfaces AGREE rather than that the service
// refuses for some reason of its own. And each family carries a POSITIVE control,
// because a fix that refuses everywhere destroys the feature just as surely as the
// `[]` defamed it (the §GR13 lesson: the empty success is the query's real subject).
//
// ⛔ NOT A NEW READER (hard stop 3). No seventh reader exists; this is routing.

// Imported from the MODULE, not the package barrel — see the sibling suite's note
// on the SCC / no-barrel-access-at-module-load hazard.
import { describe, expect, it } from 'vitest';
import { SemanticGraphManager } from '@pryzm/core-app-model';
import {
  GraphQueryService,
  GRAPH_QUERY_TYPED_READER_RELATIONSHIPS,
  GRAPH_QUERY_SUPPORTED_RELATIONSHIPS,
  type RoomGraphLike,
} from '../src/graph/GraphQueryService.js';

const rooms: RoomGraphLike = { getLevelForRoom: () => 'L0', findPath: () => [] };

/** The service over a real graph, with the hierarchy projection out of the way. */
function svc(graph: SemanticGraphManager): GraphQueryService {
  return new GraphQueryService({ graph, rooms, partOf: null });
}

/**
 * A graph in which every subject below IS a node — the whole point. A subject the
 * graph has never heard of would refuse `unknown-element` anyway, which is the
 * refusal that was ALREADY there and never the defect. The defect is a subject the
 * graph knows, answered confidently for a family nobody established.
 */
function realGraph(): SemanticGraphManager {
  const g = new SemanticGraphManager();
  // room-A is a real, detected-looking room: bounded by wall-1, adjacent to room-B.
  g.addRelationship({ type: 'boundedBy', sourceId: 'room-A', targetId: 'wall-1', createdBy: 'system' });
  g.addRelationship({ type: 'adjacentTo', sourceId: 'room-A', targetId: 'room-B', createdBy: 'system' });
  // wall-1 is a real wall: it sits on a level. It is a node of the graph, and the
  // opening writer has never said a word about it.
  g.addRelationship({ type: 'sitsOn', sourceId: 'wall-1', targetId: 'level-0', createdBy: 'system' });
  return g;
}

describe('L-12860 — the four REQUIRED families REFUSE where their typed reader refuses', () => {
  it('hosts: a wall the opening writer never covered is NO ANSWER, not "hosts nothing"', () => {
    const g = realGraph();

    // CONTROL — the typed reader, the authority, refuses this exact subject.
    const typed = g.getHostedOpenings('wall-1');
    expect(typed.ok).toBe(false);
    if (typed.ok) throw new Error('unreachable — control asserted above');
    expect(typed.reason).toBe('wall-unknown-to-hosts-writer');

    // …and the dynamic path now agrees, verbatim, instead of answering [].
    const r = svc(g).query('wall-1', 'hosts');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('THE DEFECT: a confident empty where the typed reader refuses');
    expect(r.reason).toBe(typed.reason);
    expect(r.detail).toBe(typed.detail);
    expect(r.detail).toMatch(/NO ANSWER/);

    // The subject really is a graph node — so this is NOT the old unknown-element
    // refusal wearing a new name, it is the confident [] that used to be returned.
    expect(r.reason).not.toBe('unknown-element');
    expect(g.getRelationships('wall-1').length).toBeGreaterThan(0);
  });

  it('boundedBy: a boundary left UNDETERMINED by a delete refuses with the WRITER cause', () => {
    const g = realGraph();
    // The bounding wall is deleted. The room region conclusion is now undetermined
    // (C79 §5.2) — and the `boundedBy` edges are measured FALSE, not merely stale.
    const { invalidatedRoomIds } = g.invalidateRegionConclusionsForDeletedElement('wall-1');
    expect(invalidatedRoomIds).toContain('room-A');

    const typed = g.getBoundingWalls('room-A');
    expect(typed.ok).toBe(false);
    if (typed.ok) throw new Error('unreachable — control asserted above');
    expect(typed.reason).toBe('boundary-undetermined-after-element-delete');

    const r = svc(g).query('room-A', 'boundedBy');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('THE DEFECT: the raw edge set still answered confidently');
    expect(r.reason).toBe(typed.reason);
    expect(r.detail).toBe(typed.detail);
  });

  it('boundedBy: a room no boundary writer ever covered refuses rather than "bounded by nothing"', () => {
    const g = realGraph();
    // room-B is a node (target of adjacentTo) but nothing was ever written ABOUT
    // its boundary. A detected room is bounded by >=1 element by construction, so
    // zero edges here can only be a refusal.
    const typed = g.getBoundingWalls('room-B');
    expect(typed.ok).toBe(false);
    if (typed.ok) throw new Error('unreachable — control asserted above');
    expect(typed.reason).toBe('room-unknown-to-boundedBy-writer');

    const r = svc(g).query('room-B', 'boundedBy');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('THE DEFECT: a confident empty for a room nobody bounded');
    expect(r.reason).toBe('room-unknown-to-boundedBy-writer');
  });

  it('connectedTo: "no detection pass covered this room" is not "a room without a door"', () => {
    const g = realGraph();
    // This is the COMPLIANCE-SHAPED case §GR13 was written about: the AI host asks
    // which rooms a door connects, gets [], and reports an egress defect it made up.
    const typed = g.getConnectedRooms('room-A');
    expect(typed.ok).toBe(false);
    if (typed.ok) throw new Error('unreachable — control asserted above');
    expect(typed.reason).toBe('room-unknown-to-adjacency-writer');

    const r = svc(g).query('room-A', 'connectedTo');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('THE DEFECT: a manufactured "room without a door"');
    expect(r.reason).toBe('room-unknown-to-adjacency-writer');
    expect(r.detail).toBe(typed.detail);
  });

  it('contains: a room the furniture writer never touched is UNKNOWN, not EMPTY', () => {
    const g = realGraph();
    const typed = g.getContainedElements('room-A');
    expect(typed.ok).toBe(false);
    if (typed.ok) throw new Error('unreachable — control asserted above');
    expect(typed.reason).toBe('room-unknown-to-contains-writer');

    const r = svc(g).query('room-A', 'contains');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('THE DEFECT: an unfurnished room reported as an empty one');
    expect(r.reason).toBe('room-unknown-to-contains-writer');
  });

  it('hosts: a CORRUPT pair (hosts without its hostedBy) refuses instead of answering partially', () => {
    const g = realGraph();
    // The load dropped the inverse row. `getHostedOpenings` returns NO ANSWER
    // rather than the consistent subset (C79 §5.3 — worst of its edges).
    g.addRelationship({ type: 'hosts', sourceId: 'wall-1', targetId: 'door-1', createdBy: 'system' });

    const typed = g.getHostedOpenings('wall-1');
    expect(typed.ok).toBe(false);
    if (typed.ok) throw new Error('unreachable — control asserted above');
    expect(typed.reason).toBe('hosts-hostedBy-pair-broken');

    const r = svc(g).query('wall-1', 'hosts');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('THE DEFECT: a corrupt edge set answered as a confident list');
    expect(r.reason).toBe('hosts-hostedBy-pair-broken');
  });
});

describe('L-12860 — and it STILL SUCCEEDS wherever the typed reader succeeds', () => {
  it('an ESTABLISHED empty is still a positive [] for every delegated family', () => {
    const g = realGraph();
    g.markAdjacencyCoverage(['room-A']);

    // connectedTo — the adjacency pass covered this room and no door connects it.
    // This is the answer the "rooms without a door" feature actually needs, and a
    // fix that refused it would have destroyed the feature it was protecting.
    const connected = svc(g).query('room-A', 'connectedTo');
    expect(connected.ok).toBe(true);
    if (connected.ok) expect(connected.targets).toEqual([]);
  });

  it('a NON-EMPTY answer is unchanged and still comes back as targets', () => {
    const g = realGraph();
    g.addRelationship({ type: 'hosts', sourceId: 'wall-1', targetId: 'door-1', createdBy: 'system' });
    g.addRelationship({ type: 'hostedBy', sourceId: 'door-1', targetId: 'wall-1', createdBy: 'system' });
    g.addRelationship({ type: 'contains', sourceId: 'room-A', targetId: 'sofa-1', createdBy: 'system' });

    const hosted = svc(g).query('wall-1', 'hosts');
    expect(hosted.ok).toBe(true);
    if (hosted.ok) expect(hosted.targets).toEqual(['door-1']);

    const bounded = svc(g).query('room-A', 'boundedBy');
    expect(bounded.ok).toBe(true);
    if (bounded.ok) expect(bounded.targets).toEqual(['wall-1']);

    const contains = svc(g).query('room-A', 'contains');
    expect(contains.ok).toBe(true);
    if (contains.ok) expect(contains.targets).toEqual(['sofa-1']);

    const adjacent = svc(g).query('room-A', 'adjacentTo');
    expect(adjacent.ok).toBe(true);
    if (adjacent.ok) expect(adjacent.targets).toEqual(['room-B']);
  });

  it('the routing did not become a blanket refusal — a NON-delegated family still answers', () => {
    // `sitsOn` is deliberately NOT in the table: its typed reader is the REVERSE
    // traversal and would answer a different question. It must still read raw.
    const g = realGraph();
    const r = svc(g).query('wall-1', 'sitsOn');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.targets).toEqual(['level-0']);
  });

  it('the PRE-EXISTING refusals are intact: unknown id, parked family, non-relationship', () => {
    const g = realGraph();
    // An id the graph has never heard of keeps `unknown-element` — the delegated
    // reader would have refused too, but this reason is the one callers branch on.
    const ghost = svc(g).query('ghost-1', 'boundedBy');
    expect(ghost.ok).toBe(false);
    if (!ghost.ok) {
      expect(ghost.reason).toBe('unknown-element');
      // Nothing the reader knew is thrown away.
      expect(ghost.detail).toMatch(/typed boundedBy reader also refused/);
    }

    const parked = svc(g).query('room-A', 'unitOf');
    expect(parked.ok).toBe(false);
    if (!parked.ok) expect(parked.reason).toBe('hierarchy-not-in-graph');

    const nonsense = svc(g).query('room-A', 'notARelationshipAtAll');
    expect(nonsense.ok).toBe(false);
    if (!nonsense.ok) expect(nonsense.reason).toBe('unsupported-relationship');
  });
});

describe('L-12860 — graph.neighbors: the EMPTY typed sweep is gated by the same reader', () => {
  it('an empty typed sweep the reader cannot establish REFUSES', () => {
    const g = realGraph();
    const r = svc(g).neighbors('wall-1', 'hosts');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('THE DEFECT: neighbors answered [] where the reader refuses');
    expect(r.reason).toBe('wall-unknown-to-hosts-writer');
    expect(r.detail).toMatch(/in either direction/);
  });

  it('an empty typed sweep the reader CAN establish is still a positive []', () => {
    const g = realGraph();
    g.markAdjacencyCoverage(['room-A']);
    const r = svc(g).neighbors('room-A', 'connectedTo');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.neighbors).toEqual([]);
  });

  it('the REVERSE direction still answers — the gate fires only on an empty sweep', () => {
    // `neighbors(door-1, 'hosts')` is legitimately non-empty via the reverse edge,
    // even though `getHostedOpenings('door-1')` — a directional, wall-keyed reader —
    // would refuse. Delegating here instead of gating would have dropped this.
    const g = realGraph();
    g.addRelationship({ type: 'hosts', sourceId: 'wall-1', targetId: 'door-1', createdBy: 'system' });
    g.addRelationship({ type: 'hostedBy', sourceId: 'door-1', targetId: 'wall-1', createdBy: 'system' });

    expect(g.getHostedOpenings('door-1').ok).toBe(false);

    const r = svc(g).neighbors('door-1', 'hosts');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.neighbors).toEqual([{ id: 'wall-1', relationshipType: 'hosts' }]);
  });
});

describe('L-12860 — the routing table is EXPORTED so it can be asserted, not inferred', () => {
  it('covers the four REQUIRED relationship families, plus the two same-shaped ones', () => {
    const routed = [...GRAPH_QUERY_TYPED_READER_RELATIONSHIPS].sort();
    expect(routed).toEqual(
      ['adjacentTo', 'boundedBy', 'connectedTo', 'contains', 'hosts', 'joinedTo'].sort(),
    );
    // The four the C71 write-coverage ledger names as REQUIRED.
    for (const required of ['hosts', 'boundedBy', 'connectedTo', 'contains']) {
      expect(routed).toContain(required);
    }
  });

  it('every routed family is a SUPPORTED family — routing cannot smuggle in a parked one', () => {
    for (const f of GRAPH_QUERY_TYPED_READER_RELATIONSHIPS) {
      expect(GRAPH_QUERY_SUPPORTED_RELATIONSHIPS).toContain(f);
    }
  });
});
