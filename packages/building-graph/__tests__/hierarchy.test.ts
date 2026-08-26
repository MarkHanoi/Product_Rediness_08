/**
 * §GRAPH-HIERARCHY-VIEWS (L-8413 … L-8420) — six projections of ONE graph.
 *
 * ⭐ WHAT THIS SUITE IS FOR. Not "does the function return an array". Each arm
 * below is DIFFERENTIATING: it fails if the specific honesty property it names is
 * removed. The properties are the deliverable; the arrays are incidental.
 *
 * ⛔ The arm that matters most is `system`. It asserts that an empty view carries
 * a NAMED CAUSE naming C71's parked status — because the founder will open that
 * view, it will be blank, and a blank canvas reads as a broken feature. A test
 * that only checked `edges.length === 0` would pass on a blank canvas too.
 */

import { describe, expect, it } from 'vitest';

import {
  HIERARCHY_VIEWS,
  UNDIRECTED_FAMILIES,
  describeFocus,
  disciplineOfFamily,
  familyOfNode,
  focusNeighbourhood,
  ifcClassLabel,
  projectHierarchy,
  viewDef,
  type ElementFamilyResolver,
  type IfcClassResolver,
  type UbgEdge,
  type UbgNode,
} from '../src/index.js';

// ── A small, fully-known building ────────────────────────────────────────────
//
// Two rooms joined by a door; a wall bounding one of them and hosting the door;
// a column; a light. Chosen so every discipline bucket has exactly one occupant
// and a miscount is visible by inspection.

const NODES: UbgNode[] = [
  { id: 'wall_a', kind: 'wall' },
  { id: 'room_1', kind: 'room' },
  { id: 'room_2', kind: 'room' },
  { id: 'door_1', kind: 'door' },
  { id: 'column_1', kind: 'column' },
  { id: 'light_1', kind: 'element' }, // ⛔ the generic kind — see the census arm
  { id: 'grid_1', kind: 'grid' },
];

const EDGES: UbgEdge[] = [
  { from: 'wall_a', to: 'room_1', type: 'bounds' },
  { from: 'room_1', to: 'room_2', type: 'adjacentTo' },
  { from: 'door_1', to: 'wall_a', type: 'hostedIn' },
  { from: 'room_1', to: 'room_2', type: 'connectsTo' },
  { from: 'column_1', to: 'wall_a', type: 'dependsOn' },
];

const CENSUS: ElementFamilyResolver = {
  familyOf(id) {
    if (id === 'light_1') return 'lighting';
    if (id === 'grid_1') return 'grids';
    if (id.startsWith('wall')) return 'walls';
    if (id.startsWith('room')) return 'rooms';
    if (id.startsWith('door')) return 'doors';
    if (id.startsWith('column')) return 'columns';
    return undefined; // ⛔ NOT claimed — distinct from "claimed with no family"
  },
};

describe('L-8413 — a view is a SUBSET of the ten families, never a rival graph', () => {
  it('every declared view projects only edge types the UBG declares, and `mixed` is the union', () => {
    const mixed = viewDef('mixed').families;
    for (const v of HIERARCHY_VIEWS) {
      if (v.id === 'mixed') continue;
      for (const f of v.families) {
        // Differentiating: adding a family to a view that `mixed` does not carry
        // would mean two views disagreed about what the graph contains.
        expect(mixed, `${v.id} projects ${f}, which mixed does not`).toContain(f);
      }
    }
    expect(mixed).toHaveLength(10);
  });

  it('⛔ EVERY view carries a non-empty empty-sentence — a blank canvas is never reachable', () => {
    for (const v of HIERARCHY_VIEWS) {
      expect(v.emptySentence.length, `${v.id} has no empty sentence`).toBeGreaterThan(80);
      expect(v.basis.length, `${v.id} has no basis`).toBeGreaterThan(40);
    }
  });

  it('⛔ an unknown view id THROWS rather than defaulting to mixed', () => {
    // Defaulting would draw the whole graph under another view's heading — a
    // wrong picture under a right title.
    expect(() => viewDef('nope' as never)).toThrow(/unknown view/);
  });
});

describe('L-8414 — the SYSTEM view is empty, and it says WHY', () => {
  it('projects nothing, because `servesZone` has no writer', () => {
    const p = projectHierarchy(NODES, EDGES, 'system', { families: CENSUS });
    expect(p.edges).toHaveLength(0);
    expect(p.nodes).toHaveLength(0);
  });

  it('⭐ names C71 PARKED status and the missing zone model — not a generic "no data"', () => {
    const p = projectHierarchy(NODES, EDGES, 'system', { families: CENSUS });
    expect(p.empty).not.toBeNull();
    // Differentiating: replacing the sentence with "No data" fails all four.
    expect(p.empty).toMatch(/PARKED/);
    expect(p.empty).toMatch(/C71 §2\.2/);
    expect(p.empty).toMatch(/no `zone` element kind exists/);
    expect(p.empty).toMatch(/parked is NOT a gap/i);
  });

  it('⚠ distinguishes itself from the URBAN zoning subsystem, which is real and unrelated', () => {
    const p = projectHierarchy(NODES, EDGES, 'system', {});
    expect(p.empty).toMatch(/PARCEL, not a building element/);
  });
});

describe('L-8415 — `bounds` is undirected, and the projection says so', () => {
  it('the spatial view marks both symmetric families undirected', () => {
    const p = projectHierarchy(NODES, EDGES, 'spatial', { families: CENSUS });
    expect(p.undirected.has('bounds')).toBe(true);
    expect(p.undirected.has('adjacentTo')).toBe(true);
  });

  it('⛔ a view that does NOT project `bounds` does not claim it is undirected', () => {
    // The set is scoped to the view's own families, so a legend cannot inherit a
    // caveat about an edge it never draws.
    const p = projectHierarchy(NODES, EDGES, 'element', { families: CENSUS });
    expect(p.undirected.size).toBe(0);
  });

  it('the constant itself names both symmetric families and nothing else', () => {
    expect([...UNDIRECTED_FAMILIES].sort()).toEqual(['adjacentTo', 'bounds']);
  });
});

describe('L-8416 — the discipline tree, and the two absence rows that are not disciplines', () => {
  it('groups the known families into the reference’s five buckets', () => {
    const p = projectHierarchy(NODES, EDGES, 'mixed', { families: CENSUS });
    const byId = new Map(p.buckets.map((b) => [b.discipline, b]));
    expect(byId.get('structural')?.count).toBe(1);   // column_1
    expect(byId.get('architecture')?.count).toBe(2); // wall_a + door_1
    expect(byId.get('spatial')?.count).toBe(2);      // room_1 + room_2
  });

  it('⛔ the generic UBG kind `element` is NEVER folded into a discipline', () => {
    // Three of the five adapters stamp `kind: 'element'` on every endpoint they
    // materialise. Counting those inside a named bucket would make every bucket
    // unfalsifiable.
    expect(disciplineOfFamily('element')).toBe('unresolved');
    // …and with no census, a generic node resolves to no family at all.
    expect(familyOfNode({ id: 'x', kind: 'element' }, null)).toBeNull();
  });

  it('⭐ the CENSUS outranks the UBG kind, because the stores are the authority', () => {
    // `light_1` carries the generic kind but the census knows it is lighting.
    expect(familyOfNode({ id: 'light_1', kind: 'element' }, CENSUS)).toBe('lighting');
    expect(disciplineOfFamily('lighting')).toBe('mep');
  });

  it('⛔ a grid is `unclassified`, NOT a discipline and NOT unresolved', () => {
    // A datum is a known family this taxonomy deliberately places nowhere. That
    // is a decision; "unresolved" is an absence of information. Merging them
    // would hide a real gap inside a deliberate one.
    expect(disciplineOfFamily('grids')).toBe('unclassified');
    expect(disciplineOfFamily('nonesuch')).toBe('unresolved');
  });

  it('counts unresolved-family nodes so the caller can print a FLOOR', () => {
    const p = projectHierarchy(
      [...NODES, { id: 'mystery', kind: 'element' }],
      [...EDGES, { from: 'mystery', to: 'wall_a', type: 'dependsOn' }],
      'element',
      { families: CENSUS },
    );
    expect(p.unresolvedFamilyCount).toBe(1);
  });
});

describe('L-8411 — the IFC class is a SEAM, and an unwired seam says so', () => {
  it('⛔ renders a named non-answer, never a guess, when the authority is absent', () => {
    const label = ifcClassLabel('walls', null);
    expect(label).toMatch(/not resolved/i);
    expect(label).not.toMatch(/IfcWall/);
  });

  it('accepts lane IFCTREE47’s return shape verbatim', () => {
    const resolve: IfcClassResolver = (f) =>
      f === 'walls'
        ? { status: 'mapped', ifcClass: 'IfcWall' }
        : { status: 'unmapped', reason: 'no-contract-row' };
    expect(ifcClassLabel('walls', resolve)).toBe('IfcWall');
    expect(ifcClassLabel('grids', resolve)).toMatch(/No ratified IFC class/);
  });

  it('⭐ keeps the two unmapped reasons DISTINCT — by design vs a real gap', () => {
    const notProduct: IfcClassResolver = () => ({ status: 'unmapped', reason: 'not-a-product' });
    const noRow: IfcClassResolver = () => ({ status: 'unmapped', reason: 'no-contract-row' });
    expect(ifcClassLabel('x', notProduct)).toMatch(/by design, not by gap/);
    expect(ifcClassLabel('x', noRow)).toMatch(/C25 §2 does not yet rank/);
    expect(ifcClassLabel('x', notProduct)).not.toBe(ifcClassLabel('x', noRow));
  });
});

describe('L-8420 — "select a wall in PRYZM, see its topology"', () => {
  const topo = () => projectHierarchy(NODES, EDGES, 'topology', { families: CENSUS });

  it('a wall’s 1-hop neighbourhood is its own relations, not the whole graph', () => {
    const f = focusNeighbourhood(topo(), ['wall_a'], 1);
    expect(f.seeds).toEqual(['wall_a']);
    // wall_a --bounds--> room_1  and  door_1 --hostedIn--> wall_a
    expect([...f.nodeIds].sort()).toEqual(['door_1', 'room_1', 'wall_a']);
  });

  it('⭐ traversal is UNDIRECTED even where the edge is directed', () => {
    // `door_1 --hostedIn--> wall_a` points AT the wall. Following only out-edges
    // would answer "what does this wall point at" — a fact about the adapter's
    // iteration order, not about the building.
    const f = focusNeighbourhood(topo(), ['wall_a'], 1);
    expect(f.nodeIds.has('door_1')).toBe(true);
  });

  it('depth widens the answer, and the depth is reported', () => {
    const one = focusNeighbourhood(topo(), ['door_1'], 1);
    const two = focusNeighbourhood(topo(), ['door_1'], 2);
    expect(one.nodeIds.size).toBeLessThan(two.nodeIds.size);
    expect(two.depth).toBe(2);
  });

  it('⛔ depth is clamped to 1..4 — a focus that selects everything is no focus', () => {
    expect(focusNeighbourhood(topo(), ['wall_a'], 0).depth).toBe(1);
    expect(focusNeighbourhood(topo(), ['wall_a'], 99).depth).toBe(4);
  });

  it('⛔ a seed absent from the view is REPORTED, never silently dropped', () => {
    const f = focusNeighbourhood(topo(), ['wall_a', 'ghost_9'], 1);
    expect(f.seeds).toEqual(['wall_a']);
    expect(f.seedsNotInView).toEqual(['ghost_9']);
  });

  it('⭐ the sentence explains a MISS as a fact about the projection, not a failure', () => {
    const f = focusNeighbourhood(topo(), ['ghost_9'], 1);
    const s = describeFocus(f, 'Topology-based');
    expect(s).toMatch(/projection, not a census/);
    expect(s).not.toMatch(/^0 /);
  });

  it('⭐ the sentence states EVERY operand, so the reader can check it', () => {
    const f = focusNeighbourhood(topo(), ['wall_a'], 1);
    const s = describeFocus(f, 'Topology-based');
    expect(s).toMatch(/1 selected/);
    expect(s).toMatch(/2 related element\(s\) within 1 hop/);
    expect(s).toMatch(/bounds 1/);
    expect(s).toMatch(/hostedIn 1/);
    expect(s).toMatch(/dimmed, not removed/);
  });

  it('reports per-family tallies inside the neighbourhood', () => {
    const f = focusNeighbourhood(topo(), ['room_1'], 1);
    expect(f.byFamily.get('adjacentTo')).toBe(1);
    expect(f.byFamily.get('connectsTo')).toBe(1);
  });
});

describe('§HILITE140 (L-12290) — hopOf: the SAME BFS names its own ring number', () => {
  const topo = () => projectHierarchy(NODES, EDGES, 'topology', { families: CENSUS });

  it('the seed is hop 0; the first ring reached is hop 1; a farther ring is hop 2', () => {
    const f = focusNeighbourhood(topo(), ['wall_a'], 2);
    expect(f.hopOf.get('wall_a')).toBe(0);
    expect(f.hopOf.get('room_1')).toBe(1);
    expect(f.hopOf.get('door_1')).toBe(1);
    // room_2 is reachable from wall_a only THROUGH room_1 (adjacentTo/connectsTo),
    // so it is two hops out, not one.
    expect(f.hopOf.get('room_2')).toBe(2);
  });

  it('hopOf holds EXACTLY the ids in nodeIds — the same set, named a different way', () => {
    const f = focusNeighbourhood(topo(), ['wall_a'], 1);
    expect(new Set(f.hopOf.keys())).toEqual(f.nodeIds);
    // room_2 is two hops out; at depth 1 it is in NEITHER set.
    expect(f.hopOf.has('room_2')).toBe(false);
    expect(f.nodeIds.has('room_2')).toBe(false);
  });

  it('two seeds are BOTH hop 0, even though they are on opposite sides of the graph', () => {
    const f = focusNeighbourhood(topo(), ['wall_a', 'room_2'], 1);
    expect(f.hopOf.get('wall_a')).toBe(0);
    expect(f.hopOf.get('room_2')).toBe(0);
    // room_1 is one hop from EITHER seed — still hop 1, not double-counted.
    expect(f.hopOf.get('room_1')).toBe(1);
  });
});

describe('L-8417 — node selection is EDGE-DRIVEN, so every count is exact for what is drawn', () => {
  it('⛔ an isolated node is not drawn under a heading that promises a relationship', () => {
    const withOrphan = [...NODES, { id: 'orphan_1', kind: 'wall' } as UbgNode];
    const p = projectHierarchy(withOrphan, EDGES, 'spatial', { families: CENSUS });
    expect(p.nodes.some((n) => n.id === 'orphan_1')).toBe(false);
  });

  it('the legend lists families that produced NOTHING, so silence is visible', () => {
    const p = projectHierarchy(NODES, [{ from: 'room_1', to: 'room_2', type: 'connectsTo' }], 'room', {
      families: CENSUS,
    });
    expect(p.edgeCounts.get('connectsTo')).toBe(1);
    // Differentiating: a legend built only from present edges would omit this row
    // and the reader could not tell that circulation produced nothing.
    expect(p.edgeCounts.get('circulatesVia')).toBe(0);
  });

  it('is deterministic — two runs over one model order identically', () => {
    const a = projectHierarchy(NODES, EDGES, 'mixed', { families: CENSUS });
    const b = projectHierarchy(NODES, EDGES, 'mixed', { families: CENSUS });
    expect(a.buckets.map((x) => [x.discipline, x.families.map((f) => f.family)]))
      .toEqual(b.buckets.map((x) => [x.discipline, x.families.map((f) => f.family)]));
  });
});
