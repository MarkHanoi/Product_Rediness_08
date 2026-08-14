// ─── graph.query must REFUSE the hierarchy families, not answer them empty ───
//
// The defect this pins (ADR-0325 · C71 §4.4 · C70 §5.6 · §CONTEXT-DATA-HONESTY):
//
//   `GraphQueryService` listed `partOf` / `unitOf` / `levelOf` in its supported
//   query vocabulary. `partOf` has NO production writer — the sole writer is the
//   loader's reconstruction from the authoritative `room.unitId` field — and
//   `unitOf` / `levelOf` are PARKED with zero writers and zero readers (C71 §2.2).
//   So `graph.query(roomId, 'partOf')` returned `{ ok: true, targets: [] }`.
//
//   The existing `unknown-element` refusal does NOT cover this: it fires only when
//   the id is a node of NO edge at all. A room carries `boundedBy` / `adjacentTo`
//   edges, so the room IS a node — and the `partOf` question therefore got a
//   CONFIDENT `[]`. "nobody ever wrote this edge" and "this room is in no unit"
//   were the same value, which is precisely the defect C71 §4.4 forbids.
//
// ADR-0325 settles the prior question: `hierarchyStore` + `parentId` is the SOLE
// hierarchy substrate, and `room.unitId` is the authoritative unit-containment
// field. The hierarchy families are therefore PARKED FOR QUERY — they must
// refuse, and the refusal must point the caller at the substrate that CAN answer.

// Imported from the MODULE, not the package barrel: `../src/index.js` transitively
// pulls `LayoutGenerator` → `ConstraintEngine`, which touches `window` at module
// load and dies in a Node-env suite (the SCC / no-barrel-access-at-module-load
// hazard). This service has no DOM dependency and must be testable without one.
import { describe, expect, it } from 'vitest';
import { SemanticGraphManager } from '@pryzm/core-app-model';
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

const svc = () => new GraphQueryService({ graph: graphWithARealRoom(), rooms });

describe('ADR-0325 — the hierarchy families refuse instead of answering empty', () => {
  const HIERARCHY = ['partOf', 'unitOf', 'levelOf'] as const;

  it.each(HIERARCHY)(
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

  it.each(HIERARCHY)('graph.neighbors(room-A, %s) refuses the same way', (family) => {
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

  it('the exported vocabularies are DISJOINT and the hierarchy set is exactly the three', () => {
    expect([...GRAPH_QUERY_PARKED_HIERARCHY_RELATIONSHIPS].sort()).toEqual([
      'levelOf',
      'partOf',
      'unitOf',
    ]);
    for (const f of GRAPH_QUERY_PARKED_HIERARCHY_RELATIONSHIPS) {
      expect(GRAPH_QUERY_SUPPORTED_RELATIONSHIPS).not.toContain(f);
    }
  });
});
