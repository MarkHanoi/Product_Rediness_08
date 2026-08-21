/**
 * ubgDeltaConvergence.test.ts — the differential test ADR-0343 asked for.
 *
 * ADR:        ADR-0343 "Negative / deferred" — *"A new read model is a new index
 *             to keep correct. Its failure mode is a WRONG NUMBER, which is worse
 *             than a missing one. It needs a differential test against a full
 *             scan from day one."*
 * STR:        STR-14 §3
 * Issue log:  L-3251 · L-3252
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE ONE QUESTION THIS FILE ANSWERS
 * ─────────────────────────────────────────────────────────────────────────────
 * An incremental index earns its speed by NOT looking at everything. The only
 * thing that makes that safe is a proof that it lands on the same answer as
 * looking at everything. So every test here does the same thing:
 *
 *     mutate the fake services  →  apply a DELTA  →  build a FULL graph
 *     →  assert the two graphs are IDENTICAL (nodes, edges, directions)
 *
 * ⚠ The comparison is set-based on `from|to|type|evidence`, NOT on insertion
 * order. Insertion order legitimately differs — the delta touches a
 * neighbourhood, the rebuild sweeps the id universe — and asserting on it would
 * make this test fail for a reason that is not a defect. Node/edge COUNTS and
 * MEMBERSHIP are the invariants; order is not one.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BuildingGraph } from '@pryzm/building-graph';

import { buildBuildingGraph, type BuildBuildingGraphServices } from '../src/engine/buildBuildingGraph';
import { applyUbgDelta } from '../src/engine/buildingGraphMaintainer';

// ── A tiny mutable world the fakes read from ─────────────────────────────────

interface World {
  /** elementId → the ids it is topologically adjacent to. Symmetric by construction. */
  adjacency: Map<string, Set<string>>;
  semantic: Array<{ sourceId: string; targetId: string; type: string }>;
}

function makeWorld(): World {
  return { adjacency: new Map(), semantic: [] };
}

function link(w: World, a: string, b: string): void {
  if (!w.adjacency.has(a)) w.adjacency.set(a, new Set());
  if (!w.adjacency.has(b)) w.adjacency.set(b, new Set());
  w.adjacency.get(a)!.add(b);
  w.adjacency.get(b)!.add(a);
}

function unlink(w: World, a: string, b: string): void {
  w.adjacency.get(a)?.delete(b);
  w.adjacency.get(b)?.delete(a);
}

function services(w: World): BuildBuildingGraphServices {
  return {
    topology: {
      getAdjacencyRelationships(id: string) {
        return [...(w.adjacency.get(id) ?? [])].map((other) => ({
          sourceId: id,
          targetId: other,
          kind: 'adjacentTo' as const,
        }));
      },
    },
    semantic: { getAll: () => w.semantic },
    elementIds: [...w.adjacency.keys()],
    levelIds: [],
    kindOf: (id: string) => (id.startsWith('wall') ? 'wall' : 'room'),
  };
}

/** Canonical, order-independent fingerprint of a graph. */
function fingerprint(g: BuildingGraph): { nodes: string[]; edges: string[] } {
  return {
    nodes: g
      .allNodes()
      .map((n) => `${n.id}:${n.kind}`)
      .sort(),
    edges: g
      .allEdges()
      .map((e) => `${e.from}|${e.to}|${e.type}|${e.evidence ?? ''}`)
      .sort(),
  };
}

/** Build the same world from scratch — the authority the delta is measured against. */
function fullRebuild(w: World): BuildingGraph {
  return buildBuildingGraph({ services: services(w) });
}

describe('UBG delta — converges on the full rebuild', () => {
  let w: World;
  let live: BuildingGraph;

  beforeEach(() => {
    w = makeWorld();
    link(w, 'wall_a', 'room_1');
    link(w, 'wall_a', 'room_2');
    link(w, 'wall_b', 'room_2');
    live = fullRebuild(w);
    // Sanity: the baseline is not vacuous. A convergence test where both sides
    // are empty proves nothing, which is its own classic defect.
    expect(live.edgeCount).toBeGreaterThan(0);
    expect(fingerprint(live)).toEqual(fingerprint(fullRebuild(w)));
  });

  it('ARM 1 — a NEW adjacency', () => {
    link(w, 'wall_b', 'room_3');
    applyUbgDelta(live, new Map([['wall_b', 'upsert']]), false, services(w));
    expect(fingerprint(live)).toEqual(fingerprint(fullRebuild(w)));
  });

  it('ARM 2 — a REMOVED adjacency (the case idempotent re-projection cannot see)', () => {
    unlink(w, 'wall_a', 'room_2');
    applyUbgDelta(live, new Map([['wall_a', 'upsert']]), false, services(w));
    expect(fingerprint(live)).toEqual(fingerprint(fullRebuild(w)));
  });

  it('ARM 3 — a DELETED element takes its node and every incident edge', () => {
    for (const other of [...(w.adjacency.get('wall_a') ?? [])]) unlink(w, 'wall_a', other);
    w.adjacency.delete('wall_a');
    applyUbgDelta(live, new Map([['wall_a', 'delete']]), false, services(w));
    expect(live.hasNode('wall_a')).toBe(false);
    expect(fingerprint(live)).toEqual(fingerprint(fullRebuild(w)));
  });

  it('ARM 4 — ⭐ REPEATED deltas do not drift the edge count upward', () => {
    // This is the arm that would fail without the neighbourhood expansion.
    // Topology adjacency is symmetric and the extractor de-dups the pair, so
    // retracting one endpoint and re-projecting only it flips the edge's
    // direction — and the NEXT delta on the other endpoint then adds the
    // opposite direction alongside it. The count climbs on every edit while
    // every individual delta looks correct.
    const before = live.edgeCount;
    for (let i = 0; i < 10; i++) {
      applyUbgDelta(live, new Map([['wall_a', 'upsert']]), false, services(w));
      applyUbgDelta(live, new Map([['room_2', 'upsert']]), false, services(w));
      applyUbgDelta(live, new Map([['wall_b', 'upsert']]), false, services(w));
    }
    expect(live.edgeCount).toBe(before);
    expect(fingerprint(live)).toEqual(fingerprint(fullRebuild(w)));
  });

  it('ARM 5 — a multi-element delta (one coalesced frame)', () => {
    link(w, 'wall_c', 'room_3');
    unlink(w, 'wall_a', 'room_1');
    applyUbgDelta(
      live,
      new Map([
        ['wall_c', 'upsert'],
        ['wall_a', 'upsert'],
        ['room_3', 'upsert'],
      ]),
      false,
      services(w),
    );
    expect(fingerprint(live)).toEqual(fingerprint(fullRebuild(w)));
  });

  it('ARM 6 — create-then-delete in one frame leaves nothing behind', () => {
    link(w, 'wall_tmp', 'room_1');
    applyUbgDelta(live, new Map([['wall_tmp', 'upsert']]), false, services(w));
    expect(live.hasNode('wall_tmp')).toBe(true);

    unlink(w, 'wall_tmp', 'room_1');
    w.adjacency.delete('wall_tmp');
    applyUbgDelta(live, new Map([['wall_tmp', 'delete']]), false, services(w));
    expect(live.hasNode('wall_tmp')).toBe(false);
    expect(fingerprint(live)).toEqual(fingerprint(fullRebuild(w)));
  });

  it('ARM 7 — the semantic leg converges too, and only on its own edges', () => {
    w.semantic.push({ sourceId: 'wall_a', targetId: 'wall_b', type: 'branchedFrom' });
    applyUbgDelta(live, new Map([['wall_a', 'upsert']]), false, services(w));
    expect(fingerprint(live)).toEqual(fingerprint(fullRebuild(w)));

    // …and withdrawing it retracts the edge rather than stranding it.
    w.semantic.length = 0;
    applyUbgDelta(live, new Map([['wall_a', 'upsert']]), false, services(w));
    expect(fingerprint(live)).toEqual(fingerprint(fullRebuild(w)));
  });

  it('ARM 8 — a delta touching an element with NO relationships is a no-op', () => {
    const before = fingerprint(live);
    w.adjacency.set('wall_lonely', new Set());
    applyUbgDelta(live, new Map([['wall_lonely', 'upsert']]), false, services(w));
    expect(fingerprint(live).edges).toEqual(before.edges);
  });
});

describe('UBG delta — the report is honest about what it did', () => {
  it('names each leg, and marks the SKIPPED ones skipped rather than omitting them', () => {
    const w = makeWorld();
    link(w, 'wall_a', 'room_1');
    const g = fullRebuild(w);

    const r = applyUbgDelta(g, new Map([['wall_a', 'upsert']]), false, services(w));

    expect(r.legs.topology).toBe('exact');
    expect(r.legs.semantic).toBe('scan');
    // roomGraph was NOT re-read: no connectivity type was dirty and no roomGraph
    // service was supplied. It must say `skipped`, not silently vanish — an
    // absent leg and a clean leg are different answers.
    expect(r.legs.roomGraph).toBe('skipped');
    expect(r.legs.constraint).toBe('skipped');
    expect(r.elements).toBe(1);
    expect(r.deletes).toBe(0);
    expect(r.nodeCountAfter).toBe(g.nodeCount);
    expect(r.edgeCountAfter).toBe(g.edgeCount);
  });

  it('counts the neighbours it pulled in — the correctness step is visible', () => {
    const w = makeWorld();
    link(w, 'wall_a', 'room_1');
    link(w, 'wall_a', 'room_2');
    const g = fullRebuild(w);

    const r = applyUbgDelta(g, new Map([['wall_a', 'upsert']]), false, services(w));
    expect(r.neighbours).toBe(2); // room_1 + room_2
  });

  it('counts deletes separately from upserts', () => {
    const w = makeWorld();
    link(w, 'wall_a', 'room_1');
    const g = fullRebuild(w);

    const r = applyUbgDelta(
      g,
      new Map([
        ['wall_a', 'delete'],
        ['room_1', 'upsert'],
      ]),
      false,
      services(w),
    );
    expect(r.deletes).toBe(1);
    expect(r.elements).toBe(2);
  });
});

describe('UBG delta — cost, MEASURED not claimed', () => {
  /**
   * ⚠ C66 §1.1 by analogy: this is a RELATIVE structural measurement in a fake
   * world on one machine, not a benchmark of the product. What it establishes is
   * the SHAPE — that the delta's work does not grow with model size — which is
   * the property ADR-0343 §D.4 actually requires ("O(Δ), never O(n)"). It
   * deliberately asserts on the number of SOURCE READS, not on wall-clock, so it
   * cannot flake on a loaded CI box.
   */
  it('⭐ topology source reads scale with |Δ|·deg, NOT with model size', () => {
    function build(n: number): { w: World; reads: () => number; svc: () => BuildBuildingGraphServices } {
      const w = makeWorld();
      for (let i = 0; i < n; i++) link(w, `wall_${i}`, `room_${i}`);
      let reads = 0;
      const svc = (): BuildBuildingGraphServices => ({
        ...services(w),
        topology: {
          getAdjacencyRelationships(id: string) {
            reads++;
            return [...(w.adjacency.get(id) ?? [])].map((other) => ({
              sourceId: id,
              targetId: other,
              kind: 'adjacentTo' as const,
            }));
          },
        },
      });
      return { w, reads: () => reads, svc };
    }

    // Small model.
    const small = build(50);
    const gs = buildBuildingGraph({ services: small.svc() });
    const smallAfterRebuild = small.reads();
    applyUbgDelta(gs, new Map([['wall_0', 'upsert']]), false, small.svc());
    const smallDelta = small.reads() - smallAfterRebuild;

    // Model 20× larger.
    const big = build(1000);
    const gb = buildBuildingGraph({ services: big.svc() });
    const bigAfterRebuild = big.reads();
    applyUbgDelta(gb, new Map([['wall_0', 'upsert']]), false, big.svc());
    const bigDelta = big.reads() - bigAfterRebuild;

    // The FULL rebuild scales with the model — that is the cost being avoided.
    expect(smallAfterRebuild).toBe(100); // 50 walls + 50 rooms
    expect(bigAfterRebuild).toBe(2000);
    expect(bigAfterRebuild / smallAfterRebuild).toBe(20);

    // ⭐ The DELTA does not. Identical work at 20× the model size.
    expect(smallDelta).toBe(2); // wall_0 + its one neighbour room_0
    expect(bigDelta).toBe(2);
    expect(bigDelta).toBe(smallDelta);
  });
});
