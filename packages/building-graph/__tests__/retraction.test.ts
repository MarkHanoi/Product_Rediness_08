/**
 * retraction.test.ts — the delete leg of a delta (L-3250, lane UBG1).
 *
 * ADR:        ADR-0058 §4 (adapters project; idempotent) · ADR-0343 §D.7
 * STR:        STR-14 §3 ("Incrementally maintained off the StoreEventBus")
 * Issue log:  L-3250 (no retraction primitive) · L-2131 (nothing subscribes)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ WHAT THIS FILE IS ACTUALLY PROVING
 * ─────────────────────────────────────────────────────────────────────────────
 * Lane ANLZ1 measured that nothing subscribes the UBG to the StoreEventBus, and
 * corrected STR-14 §3 in place. This file measures the half that correction did
 * not reach: BEFORE `removeNode` / `removeEdge` / `retractIncident` existed, the
 * store had no way to withdraw a single fact. A subscriber written against the
 * old API could not have applied a delete.
 *
 * The two negative arms below are the ones that matter, because they encode the
 * failure a naive "just re-project on every event" maintainer would ship:
 *   • ARM D — re-projecting an adapter WITHOUT retracting leaves a stale edge
 *     that no longer holds, and the graph then OVERSTATES the model. That is
 *     the [[envelope-solid-overstates-partial-data]] shape in a new costume.
 *   • ARM E — an index leak reads as a CORRECT EMPTY RESULT. `outEdges` does
 *     `edges.get(key)` and `continue`s on undefined, so a key left behind in an
 *     adjacency index is silently skipped rather than throwing. A retraction
 *     that forgets an index is therefore invisible until a count is wrong.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BuildingGraph, createTopologyAdapter, type UbgEdge } from '../src/index.js';

function e(from: string, to: string, type: UbgEdge['type'], evidence?: string): UbgEdge {
  return { from, to, type, ...(evidence !== undefined ? { evidence } : {}) };
}

describe('BuildingGraph — retraction (ARM A: removeEdge)', () => {
  let g: BuildingGraph;
  beforeEach(() => {
    g = new BuildingGraph();
    g.addNode({ id: 'wall_1', kind: 'wall' });
    g.addNode({ id: 'room_1', kind: 'room' });
    g.addEdge(e('wall_1', 'room_1', 'bounds', 'topology'));
  });

  it('removes the edge and reports true', () => {
    expect(g.edgeCount).toBe(1);
    expect(g.removeEdge('wall_1', 'room_1', 'bounds')).toBe(true);
    expect(g.edgeCount).toBe(0);
  });

  it('reports false for an edge that is not there — absent is not an error', () => {
    expect(g.removeEdge('wall_1', 'room_1', 'adjacentTo')).toBe(false);
    expect(g.removeEdge('nope', 'room_1', 'bounds')).toBe(false);
    expect(g.edgeCount).toBe(1);
  });

  it('leaves both endpoint NODES standing — an edge is not its endpoints', () => {
    g.removeEdge('wall_1', 'room_1', 'bounds');
    expect(g.hasNode('wall_1')).toBe(true);
    expect(g.hasNode('room_1')).toBe(true);
  });

  it('is type-discriminating: two edges between the same pair are independent', () => {
    g.addEdge(e('wall_1', 'room_1', 'adjacentTo', 'topology'));
    expect(g.edgeCount).toBe(2);
    g.removeEdge('wall_1', 'room_1', 'bounds');
    expect(g.edgeCount).toBe(1);
    expect(g.outEdges('wall_1').map((x) => x.type)).toEqual(['adjacentTo']);
  });
});

describe('BuildingGraph — retraction (ARM B: removeNode)', () => {
  let g: BuildingGraph;
  beforeEach(() => {
    g = new BuildingGraph();
    g.addNode({ id: 'wall_1', kind: 'wall' });
    g.addNode({ id: 'room_1', kind: 'room' });
    g.addNode({ id: 'room_2', kind: 'room' });
    g.addEdge(e('wall_1', 'room_1', 'bounds', 'topology')); // out-edge of wall_1
    g.addEdge(e('room_2', 'wall_1', 'adjacentTo', 'topology')); // IN-edge of wall_1
  });

  it('removes the node and EVERY incident edge, in both directions', () => {
    expect(g.removeNode('wall_1')).toBe(2);
    expect(g.hasNode('wall_1')).toBe(false);
    expect(g.edgeCount).toBe(0);
  });

  it('does not touch unrelated nodes', () => {
    g.removeNode('wall_1');
    expect(g.hasNode('room_1')).toBe(true);
    expect(g.hasNode('room_2')).toBe(true);
    expect(g.nodeCount).toBe(2);
  });

  it('distinguishes "no such node" (-1) from "node with no edges" (0)', () => {
    g.addNode({ id: 'lonely', kind: 'room' });
    expect(g.removeNode('lonely')).toBe(0);
    expect(g.removeNode('never_existed')).toBe(-1);
  });

  it('still retracts incident edges of a node that was never materialised', () => {
    // addEdge does not require its endpoints to exist (see BuildingGraph.addEdge).
    const g2 = new BuildingGraph();
    g2.addEdge(e('ghost', 'room_9', 'bounds', 'topology'));
    expect(g2.edgeCount).toBe(1);
    expect(g2.removeNode('ghost')).toBe(-1); // node absent…
    expect(g2.edgeCount).toBe(0); // …but its dangling edge is gone
  });
});

describe('BuildingGraph — retraction (ARM C: retractIncident, the delta primitive)', () => {
  let g: BuildingGraph;
  beforeEach(() => {
    g = new BuildingGraph();
    g.addNode({ id: 'wall_1', kind: 'wall' });
    g.addEdge(e('wall_1', 'room_1', 'bounds', 'topology'));
    g.addEdge(e('wall_1', 'room_2', 'adjacentTo', 'topology'));
    g.addEdge(e('wall_1', 'wall_0', 'derivesFrom', 'semantic:branchedFrom'));
    g.addEdge(e('wall_1', 'rule:R1', 'violates', 'constraint:error:too thin'));
  });

  it('retracts ONLY the named adapter’s edges, leaving the others intact', () => {
    expect(g.edgeCount).toBe(4);
    expect(g.retractIncident('wall_1', 'topology')).toBe(2);
    expect(g.edgeCount).toBe(2);
    expect(g.outEdges('wall_1').map((x) => x.type).sort()).toEqual([
      'derivesFrom',
      'violates',
    ]);
  });

  it('keeps the NODE — retraction re-derives a fact, it does not delete the thing', () => {
    g.retractIncident('wall_1', 'topology');
    expect(g.hasNode('wall_1')).toBe(true);
  });

  it('matches IN-edges too, not only out-edges', () => {
    g.addEdge(e('room_7', 'wall_1', 'adjacentTo', 'topology'));
    expect(g.retractIncident('wall_1', 'topology')).toBe(3);
  });

  it('prefix-matches, so `semantic` catches `semantic:branchedFrom`', () => {
    expect(g.retractIncident('wall_1', 'semantic')).toBe(1);
  });

  it('NEVER retracts an edge with no evidence — un-stamped means un-withdrawable', () => {
    const g2 = new BuildingGraph();
    g2.addNode({ id: 'x', kind: 'wall' });
    g2.addEdge(e('x', 'y', 'bounds')); // no evidence
    expect(g2.retractIncident('x', '')).toBe(0);
    expect(g2.retractIncident('x', 'topology')).toBe(0);
    expect(g2.edgeCount).toBe(1);
  });
});

describe('ARM D — re-projecting WITHOUT retracting overstates the model', () => {
  it('is the defect: a fact that stopped holding survives an idempotent re-project', () => {
    const g = new BuildingGraph();
    const kindOf = (id: string) => (id.startsWith('wall') ? 'wall' : 'room');

    // t0 — wall_1 bounds room_1 and room_2.
    createTopologyAdapter({
      relationships: [
        { sourceId: 'wall_1', targetId: 'room_1', kind: 'intersects' },
        { sourceId: 'wall_1', targetId: 'room_2', kind: 'intersects' },
      ],
      kindOf,
    }).project(g);
    expect(g.outEdges('wall_1', 'bounds')).toHaveLength(2);

    // t1 — the wall MOVED. It now bounds only room_1. Re-project the new truth.
    const t1 = createTopologyAdapter({
      relationships: [{ sourceId: 'wall_1', targetId: 'room_1', kind: 'intersects' }],
      kindOf,
    });
    t1.project(g);

    // ⛔ The stale room_2 edge SURVIVES. `project` is additive; idempotence is
    // not retraction. This is exactly what a naive maintainer would ship.
    expect(g.outEdges('wall_1', 'bounds')).toHaveLength(2);

    // ⭐ Retract-then-project is the correct delta, and it converges.
    g.retractIncident('wall_1', 'topology');
    t1.project(g);
    expect(g.outEdges('wall_1', 'bounds')).toHaveLength(1);
    expect(g.outEdges('wall_1', 'bounds')[0]!.to).toBe('room_1');
  });
});

describe('ARM E — the adjacency indices stay EXACT after retraction', () => {
  // An index leak reads as a correct empty result, so it must be measured
  // structurally rather than trusted.
  it('a retracted edge cannot be resurrected by re-adding an unrelated one', () => {
    const g = new BuildingGraph();
    g.addNode({ id: 'a', kind: 'wall' });
    g.addNode({ id: 'b', kind: 'room' });
    g.addEdge(e('a', 'b', 'bounds', 'topology'));
    g.removeEdge('a', 'b', 'bounds');

    expect(g.outEdges('a')).toEqual([]);
    expect(g.inEdges('b')).toEqual([]);
    expect(g.neighbors('a')).toEqual([]);
    expect(g.allEdges()).toEqual([]);
    expect(g.toJSON().edges).toEqual([]);
  });

  it('re-adding the same edge after retraction restores it exactly once', () => {
    const g = new BuildingGraph();
    g.addNode({ id: 'a', kind: 'wall' });
    g.addNode({ id: 'b', kind: 'room' });
    g.addEdge(e('a', 'b', 'bounds', 'topology'));
    g.retractIncident('a', 'topology');
    g.addEdge(e('a', 'b', 'bounds', 'topology'));

    expect(g.edgeCount).toBe(1);
    expect(g.outEdges('a')).toHaveLength(1);
    expect(g.inEdges('b')).toHaveLength(1);
    expect(g.neighbors('a').map((n) => n.id)).toEqual(['b']);
  });

  it('removeNode leaves no key behind that a later same-id node could inherit', () => {
    const g = new BuildingGraph();
    g.addNode({ id: 'a', kind: 'wall' });
    g.addNode({ id: 'b', kind: 'room' });
    g.addEdge(e('a', 'b', 'bounds', 'topology'));
    g.removeNode('a');

    // The id comes back (undo, re-create with a stable id) — it must be clean.
    g.addNode({ id: 'a', kind: 'wall' });
    expect(g.outEdges('a')).toEqual([]);
    expect(g.inEdges('b')).toEqual([]);
    expect(g.edgeCount).toBe(0);
  });

  it('toJSON round-trips a retracted graph without the retracted edges', () => {
    const g = new BuildingGraph();
    g.addNode({ id: 'a', kind: 'wall' });
    g.addEdge(e('a', 'b', 'bounds', 'topology'));
    g.addEdge(e('a', 'c', 'adjacentTo', 'topology'));
    g.retractIncident('a', 'topology');

    const round = BuildingGraph.fromJSON(g.toJSON());
    expect(round.edgeCount).toBe(0);
    expect(round.nodeCount).toBe(g.nodeCount);
  });
});
