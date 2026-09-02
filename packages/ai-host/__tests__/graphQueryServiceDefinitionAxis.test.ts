// ─── C71 §2.7 — the DEFINITION AXIS at the surface the AI host actually reads ──
//
// THE ACCEPTANCE (audit §12 lane 4G, spec §69):
//
//   `graph.query(<the thing instantiated>, 'instantiates')` RETURNS INSTANCES
//   instead of refusing — and the instance's definition, type and relationships
//   are answerable WITHOUT INSPECTING A MESH.
//
// WHY THIS FILE IS THE RIGHT LAYER (audit R14 — "every acceptance names the
// LAYER at which the property is read back, never the function that returned
// it"). The `graph.query` bus verb's handler is a pass-through: in
// `apps/editor/src/engine/graphQueryBusHandlers.ts`, `buildGraphQueryHandlers`
// registers `type: 'graph.query'` and its execute body is
// `service.query(cmd.elementId, cmd.relationshipType)` — the result object this
// suite asserts on IS the object the verb returns. Reading back from
// `SemanticGraphManager` instead would be reading back from the store the write
// API just wrote, which is the C16 CA-21 mistake one graph over.
//
// ⚠ WHAT IS NOT PROVEN HERE, so silence is never read as coverage: no
// production code writes these edges yet. C71 §2.7 obligation 1's writer is the
// component placement COMMAND (Phase 4C), which has not landed. Every graph
// below is driven through the write API directly.
//
// ⛔ NOT A NEW READER, NOT A NEW REFUSAL VOCABULARY (audit R1). Every reader is
// `SemanticGraphManager`'s and every `reason` below is that reader's own,
// forwarded verbatim.

import { describe, expect, it } from 'vitest';
import { SemanticGraphManager } from '@pryzm/core-app-model';
import {
  GraphQueryService,
  GRAPH_QUERY_DEFINITION_AXIS_RELATIONSHIPS,
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
 * §66's slice, minus the nineteen: a window definition, a Medium type over it,
 * and two placed occurrences. Every subject below is a real node of a real
 * graph — a stub built from the assertion could only agree with itself.
 */
function placedSlice(): SemanticGraphManager {
  const g = new SemanticGraphManager();
  g.recordInstantiation('inst-1', 'def-window');
  g.recordInstantiation('inst-2', 'def-window');
  g.recordSpecialization('type-medium', 'def-window', 'definition');
  g.recordDefinitionDependency('def-window', 'def-frame', 'slot-frame');
  return g;
}

describe('ACCEPTANCE — graph.query(definition, "instantiates") returns INSTANCES', () => {
  it('⭐ returns the two placed instances instead of refusing', () => {
    const r = svc(placedSlice()).query('def-window', 'instantiates');
    expect(r.ok).toBe(true);
    if (r.ok) expect([...r.targets].sort()).toEqual(['inst-1', 'inst-2']);
  });

  it('⭐ says WHICH question it answered — direction and node kind, never a bare list', () => {
    const r = svc(placedSlice()).query('def-window', 'instantiates');
    expect(r.ok).toBe(true);
    if (r.ok) {
      // C71 §1.5 semantic 7. Without these two fields a caller holding
      // `['inst-1','inst-2']` cannot tell instance ids from a definition id, and
      // this is the surface where that list becomes English in a prompt.
      expect(r.direction).toBe('incoming');
      expect(r.targetNodeKind).toBe('instance');
    }
  });

  it('the FORWARD question is still the forward question — the direction is not fixed to one answer', () => {
    const r = svc(placedSlice()).query('inst-1', 'instantiates');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.targets).toEqual(['def-window']);
      expect(r.direction).toBe('outgoing');
      expect(r.targetNodeKind).toBe('definition');
    }
  });

  it('§69 — definition, type and relationships are answerable WITHOUT INSPECTING A MESH', () => {
    const s = svc(placedSlice());
    // definition ("what is this thing?")
    const def = s.query('inst-1', 'instantiates');
    expect(def.ok && def.targets).toEqual(['def-window']);
    // type ("which types exist over this definition?")
    const types = s.query('def-window', 'specializes');
    expect(types.ok && types.targets).toEqual(['type-medium']);
    // relationships ("what does this definition nest?")
    const nests = s.query('def-window', 'dependsOnDefinition');
    expect(nests.ok && nests.targets).toEqual(['def-frame']);
    // Nothing above touched geometry, a mesh, a fragment or a renderer.
  });

  it('the three families are ROUTED to the definition axis, not to the getTargets path', () => {
    for (const f of ['instantiates', 'specializes', 'dependsOnDefinition'] as const) {
      expect(GRAPH_QUERY_SUPPORTED_RELATIONSHIPS).toContain(f);
      expect(GRAPH_QUERY_DEFINITION_AXIS_RELATIONSHIPS).toContain(f);
      // DISJOINT from the six L-12860 families: a definition-axis family that
      // drifted into that table would lose its direction discriminator and start
      // answering one of its two questions silently.
      expect(GRAPH_QUERY_TYPED_READER_RELATIONSHIPS).not.toContain(f);
    }
  });
});

describe('FAILURE ≠ EMPTINESS at the query surface', () => {
  it('a definition the writer covered with nothing placed answers a POSITIVE empty', () => {
    const g = placedSlice();
    g.markDefinitionAxisCoverage('definition', ['def-unused']);
    const r = svc(g).query('def-unused', 'instantiates');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.targets).toEqual([]);
      expect(r.direction).toBe('incoming');
    }
  });

  it('⛔ an id nothing has declared REFUSES rather than guessing a direction', () => {
    const g = placedSlice();
    // `inst-1` IS a node of this graph — so the pre-existing `unknown-element`
    // refusal does not fire — and nothing has said a word about it under
    // `dependsOnDefinition`. This is the exact shape ADR-0325 fixed for partOf.
    const r = svc(g).query('inst-1', 'dependsOnDefinition');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('definition-axis-node-kind-undetermined');
      expect(r.detail).toContain('NO ANSWER');
    }
  });

  it('graph.neighbors takes the same gate: an empty definition-axis sweep is put to the reader', () => {
    const g = placedSlice();
    const r = svc(g).neighbors('inst-1', 'dependsOnDefinition');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('definition-axis-node-kind-undetermined');
  });

  it('the reader’s refusal reason is forwarded VERBATIM, never flattened into one of this file’s own', () => {
    // The subject's KIND resolves (it is the source of `instantiates` edges), so
    // the axis reaches the FAMILY reader — which then refuses on corruption. That
    // is the case that proves forwarding, and it is why an id nothing knows is
    // NOT the right subject for this control: that one refuses one step earlier,
    // at the kind resolution, and never reaches the reader at all.
    const g = new SemanticGraphManager();
    g.recordInstantiation('inst-1', 'def-a');
    g.recordInstantiation('inst-1', 'def-b');
    const direct = g.getInstantiatedDefinition('inst-1');
    const viaQuery = svc(g).query('inst-1', 'instantiates');
    expect(direct.ok).toBe(false);
    expect(viaQuery.ok).toBe(false);
    // The service and the reader AGREE — the point of the control is that the
    // service is not refusing for a reason of its own.
    if (!direct.ok && !viaQuery.ok) {
      expect(viaQuery.reason).toBe(direct.reason);
      expect(viaQuery.reason).toBe('instance-instantiates-multiple-definitions');
    }
  });
});

describe('⛔ FALSIFICATION — the two severings, each with its OWN named test', () => {
  it('SEVER THE WRITER: with no recordInstantiation call, the acceptance query returns NO instances', () => {
    const g = new SemanticGraphManager();
    // Everything else about the project is intact — the definition is a real
    // node of the graph, reachable through its nesting edge.
    g.recordDefinitionDependency('def-window', 'def-frame', 'slot-frame');
    const r = svc(g).query('def-window', 'instantiates');
    // Not a confident `[]`: the graph refuses, because no writer ever covered
    // this id under this family and no `instantiates` edge places it on either
    // side. The acceptance above therefore measures the WRITER, not the routing.
    //
    // ⚠ The reason is the KIND refusal, not the family one, and that is the
    // honest reading: with the writer severed the graph cannot even establish
    // that `def-window` IS a definition — which is a weaker state than "a known
    // definition with no instances", and must not be reported as the same thing.
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('definition-axis-node-kind-undetermined');
    // … and the SAME query answers once the writer runs. One line apart, so the
    // control cannot pass for a reason unrelated to the writer.
    g.recordInstantiation('inst-1', 'def-window');
    const after = svc(g).query('def-window', 'instantiates');
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.targets).toEqual(['inst-1']);
  });

  it('SEVER THE READER: a graph whose typed reader refuses makes the query refuse — it never falls back to the raw edge set', () => {
    class ReaderSevered extends SemanticGraphManager {
      override getInstancesOfDefinition(
        definitionId: string,
      ): ReturnType<SemanticGraphManager['getInstancesOfDefinition']> {
        return {
          ok: false,
          definitionId,
          reason: 'id-unknown-to-instantiates-writer',
          detail: 'SEVERED — this reader was disabled by the falsification control.',
        };
      }
    }
    const g = new ReaderSevered();
    g.recordInstantiation('inst-1', 'def-window');
    // The EDGES are there: a service reading `getSources` directly would answer
    // `{ok:true, targets:['inst-1']}` and this test would fail. It refuses,
    // which is what proves the answer flows THROUGH the reader.
    expect(g.getSources('def-window', 'instantiates')).toEqual(['inst-1']);
    const r = svc(g).query('def-window', 'instantiates');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain('SEVERED');
  });

  it('CONTROL — the unsevered graph answers, so the two severings above are not vacuous', () => {
    const r = svc(placedSlice()).query('def-window', 'instantiates');
    expect(r.ok).toBe(true);
  });
});

describe('REGRESSION — the twelve instance-only families are untouched', () => {
  it('a supported instance-only family still answers directionally, with no discriminator', () => {
    const g = new SemanticGraphManager();
    // BOTH halves of the pair — `getHostedOpenings` refuses a half-written pair
    // (`hosts-hostedBy-pair-broken`), which is its own pre-existing behaviour.
    g.addRelationship({ type: 'hosts', sourceId: 'wall-1', targetId: 'win-1', createdBy: 'system' });
    g.addRelationship({ type: 'hostedBy', sourceId: 'win-1', targetId: 'wall-1', createdBy: 'system' });
    const r = svc(g).query('wall-1', 'hosts');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.targets).toEqual(['win-1']);
      // The `sitsOn` exclusion in this file's header still stands: only the
      // definition axis carries a direction field.
      expect(r.direction).toBeUndefined();
      expect(r.targetNodeKind).toBeUndefined();
    }
  });

  it('a parked family still refuses as unsupported', () => {
    const g = placedSlice();
    const r = svc(g).query('inst-1', 'supersedes');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unsupported-relationship');
  });

  it('a hierarchy family still refuses with hierarchy-not-in-graph', () => {
    const r = svc(placedSlice()).query('inst-1', 'levelOf');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('hierarchy-not-in-graph');
  });
});
