// ─── graph.query and the hierarchy families: ANSWER partOf, REFUSE the rest ───
//
// The defect this pins (ADR-0325 · C71 §4.4 · C70 §5.6 · §CONTEXT-DATA-HONESTY):
//
//   `GraphQueryService` listed `partOf` / `unitOf` / `levelOf` in its supported
//   query vocabulary while `partOf` had NO production writer — the sole writer
//   was the loader's reconstruction from the authoritative `room.unitId` field —
//   and `unitOf` / `levelOf` were PARKED with zero writers and zero readers
//   (C71 §2.2). So `graph.query(roomId, 'partOf')` returned `{ ok: true,
//   targets: [] }`.
//
//   The existing `unknown-element` refusal does NOT cover this: it fires only when
//   the id is a node of NO edge at all. A room carries `boundedBy` / `adjacentTo`
//   edges, so the room IS a node — and the `partOf` question therefore got a
//   CONFIDENT `[]`. "nobody ever wrote this edge" and "this room is in no unit"
//   were the same value, which is precisely the defect C71 §4.4 forbids.
//
// ADR-0325 settled the prior question: `hierarchyStore` + `parentId` is the SOLE
// hierarchy substrate, and `room.unitId` is the authoritative unit-containment
// field. Its remedy was to refuse all three families.
//
// ── ADR-0328 SUPERSEDES THE `partOf` HALF ────────────────────────────────────
//
// The founder ruled that hierarchy nodes ARE graph citizens and that `partOf` is
// the DERIVED graph semantic over that same sole substrate. ADR-0325's PREMISE
// (the edge lags the field until a reload) is what ADR-0328 removes, so the
// refusal it justified is now the regression. This suite therefore pins THREE
// things at once, and the third is what stops the fix becoming the old defect
// again:
//
//   1. `partOf` ANSWERS, and the answer tracks the substrate.
//   2. `unitOf` / `levelOf` still REFUSE with `hierarchy-not-in-graph` — one
//      family was unparked on one consumer's evidence, not the family resemblance.
//   3. The `partOf` answer still distinguishes "established: in no unit" (`[]`)
//      from "the substrate could not be read" (a refusal). Answering the second
//      as the first is the original defect wearing the fix's clothes.

// Imported from the MODULE, not the package barrel: `../src/index.js` transitively
// pulls `LayoutGenerator` → `ConstraintEngine`, which touches `window` at module
// load and dies in a Node-env suite (the SCC / no-barrel-access-at-module-load
// hazard). This service has no DOM dependency and must be testable without one.
import { describe, expect, it } from 'vitest';
import {
  SemanticGraphManager,
  PartOfProjection,
  type PartOfSubstrateSnapshot,
} from '@pryzm/core-app-model';
import {
  GraphQueryService,
  GRAPH_QUERY_SUPPORTED_RELATIONSHIPS,
  GRAPH_QUERY_PARKED_HIERARCHY_RELATIONSHIPS,
  type RoomGraphLike,
} from '../src/graph/GraphQueryService.js';

/** A room that IS a node of the graph via its OTHER edges — the whole point. */
function graphWithARealRoom(): SemanticGraphManager {
  const g = new SemanticGraphManager();
  g.addRelationship({ type: 'boundedBy', sourceId: 'room-A', targetId: 'wall-1', createdBy: 'system' });
  g.addRelationship({ type: 'adjacentTo', sourceId: 'room-A', targetId: 'room-B', createdBy: 'system' });
  return g;
}

const rooms: RoomGraphLike = {
  getLevelForRoom: (id) => (id === 'room-A' || id === 'room-B' ? 'L0' : null),
  findPath: () => [],
};

/**
 * A REAL projection over a substrate the test drives — not a stub. A stub would
 * only prove that the stub agrees with the assertion; the claim under test is
 * that this surface reports what the hierarchy substrate actually says.
 */
function serviceOver(substrate: () => PartOfSubstrateSnapshot): GraphQueryService {
  const graph = graphWithARealRoom();
  return new GraphQueryService({ graph, rooms, partOf: new PartOfProjection(graph, substrate) });
}

/** room-A is in unit-1, which is on level-0. room-B is in no unit. */
const LIVE: PartOfSubstrateSnapshot = {
  nodes: [{ id: 'level-0' }, { id: 'unit-1', parentId: 'level-0' }],
  rooms: [{ id: 'room-A', unitId: 'unit-1' }, { id: 'room-B' }],
};

const svc = () => serviceOver(() => LIVE);

describe('ADR-0325 — the PARKED hierarchy families refuse instead of answering empty', () => {
  const PARKED = ['unitOf', 'levelOf'] as const;

  it.each(PARKED)(
    'graph.query(room-A, %s) is a TYPED REFUSAL, never { ok: true, targets: [] }',
    (family) => {
      const r = svc().query('room-A', family);
      expect(r.ok).toBe(false);
      if (r.ok) throw new Error('unreachable — asserted above');
      expect(r.reason).toBe('hierarchy-not-in-graph');
      // The C78 §8.1 member, carried so a consequence consumer classifies this
      // with the SAME closed vocabulary every other producer uses.
      expect(r.undetermined).toBe('RELATIONSHIP_NOT_RECORDED');
      // The refusal must NAME the substrate that can answer, or it is a dead end.
      expect(r.detail).toMatch(/hierarchyStore|room\.unitId|parentId/);
    },
  );

  it.each(PARKED)('graph.neighbors(room-A, %s) refuses the same way', (family) => {
    const r = svc().neighbors('room-A', family);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable — asserted above');
    expect(r.reason).toBe('hierarchy-not-in-graph');
    expect(r.undetermined).toBe('RELATIONSHIP_NOT_RECORDED');
  });

  it('the refusal is DISTINCT from unknown-element — the room really is a node', () => {
    // Control: the same room answers a SUPPORTED family positively, which is what
    // makes the old `[]` a *confident* lie rather than a missing-node artefact.
    const ok = svc().query('room-A', 'boundedBy');
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.targets).toEqual(['wall-1']);

    // And an id that is genuinely absent still gets `unknown-element`, so the new
    // reason has not swallowed the old one.
    const unknown = svc().query('ghost-1', 'boundedBy');
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toBe('unknown-element');
  });

  it('NEGATIVE CONTROL: a genuinely empty SUPPORTED family is still a positive []', () => {
    // The gate this test is protecting must not over-fire. `hosts` is supported,
    // written in production, and room-A genuinely hosts nothing: that IS `[]`.
    const r = svc().query('room-A', 'hosts');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.targets).toEqual([]);
  });

  it('a non-RelationshipType string still gets unsupported-relationship, not the new reason', () => {
    const r = svc().query('room-A', 'notARelationshipAtAll');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unsupported-relationship');
  });

  it('the exported vocabularies are DISJOINT, and partOf has MOVED between them', () => {
    expect([...GRAPH_QUERY_PARKED_HIERARCHY_RELATIONSHIPS].sort()).toEqual(['levelOf', 'unitOf']);
    for (const f of GRAPH_QUERY_PARKED_HIERARCHY_RELATIONSHIPS) {
      expect(GRAPH_QUERY_SUPPORTED_RELATIONSHIPS).not.toContain(f);
    }
    // ADR-0328 — the one family that crossed over.
    expect(GRAPH_QUERY_SUPPORTED_RELATIONSHIPS).toContain('partOf');
  });
});

describe('ADR-0328 — partOf is ANSWERED, by derivation from the hierarchy substrate', () => {
  it('answers room→unit from room.unitId, with no command having written an edge', () => {
    const r = svc().query('room-A', 'partOf');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.targets).toEqual(['unit-1']);
  });

  it('answers unit→level from parentId — hierarchy nodes ARE graph citizens now', () => {
    const r = svc().query('unit-1', 'partOf');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.targets).toEqual(['level-0']);
  });

  it('⭐ the answer TRACKS the substrate — reassignment is visible with no reload', () => {
    // The exact disagreement ADR-0325 refused over: mid-session, the field moved
    // and the edge did not. Under a projection there is nothing to lag.
    let substrate: PartOfSubstrateSnapshot = LIVE;
    const service = serviceOver(() => substrate);

    const before = service.query('room-A', 'partOf');
    expect(before.ok && before.targets).toEqual(['unit-1']);

    substrate = {
      nodes: [{ id: 'level-0' }, { id: 'unit-1', parentId: 'level-0' }, { id: 'unit-2', parentId: 'level-0' }],
      rooms: [{ id: 'room-A', unitId: 'unit-2' }, { id: 'room-B' }],
    };

    const after = service.query('room-A', 'partOf');
    expect(after.ok && after.targets).toEqual(['unit-2']);
  });

  it('an UNASSIGNED room gets a positive [] — established, not unestablished', () => {
    const r = svc().query('room-B', 'partOf');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.targets).toEqual([]);
  });

  it('an id the SUBSTRATE does not know refuses — even though it is a graph node', () => {
    // wall-1 is a node of the graph (target of boundedBy) but is not a hierarchy
    // citizen. Answering `[]` would be the original defect with a new writer.
    const r = svc().query('wall-1', 'partOf');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable — asserted above');
    expect(r.reason).toBe('unknown-element');
    expect(r.undetermined).toBe('RELATIONSHIP_NOT_RECORDED');
    expect(r.detail).toMatch(/NO ANSWER/);
  });

  it('⭐ an UNREADABLE substrate refuses with its OWN reason, never a positive []', () => {
    const service = serviceOver(() => ({ nodes: LIVE.nodes, rooms: null }));
    const r = service.query('room-A', 'partOf');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable — asserted above');
    expect(r.reason).toBe('hierarchy-substrate-unreadable');
    expect(r.reason).not.toBe('hierarchy-not-in-graph');
    expect(r.detail).toMatch(/could not be read/);
  });

  it('with no composed projection the family refuses rather than reading the raw edge', () => {
    const graph = graphWithARealRoom();
    graph.addRelationship({ type: 'partOf', sourceId: 'room-A', targetId: 'ghost-unit', createdBy: 'rogue' });
    const r = new GraphQueryService({ graph, rooms, partOf: null }).query('room-A', 'partOf');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('graph-unavailable');
  });

  it('neighbors reconciles before sweeping, so it cannot report a stale partOf edge', () => {
    const graph = graphWithARealRoom();
    // An edge nobody derived — the substrate says room-A is in unit-1.
    graph.addRelationship({ type: 'partOf', sourceId: 'room-A', targetId: 'ghost-unit', createdBy: 'rogue' });
    const service = new GraphQueryService({
      graph,
      rooms,
      partOf: new PartOfProjection(graph, () => LIVE),
    });
    const r = service.neighbors('room-A', 'partOf');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.neighbors).toEqual([{ id: 'unit-1', relationshipType: 'partOf' }]);
  });
});
