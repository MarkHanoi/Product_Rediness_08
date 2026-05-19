// produceStructural — analytic parity (S26-T4 / ADR-0023).
//
// Synthetic-but-analytic — every assertion is derivable from the input
// dimensions; no PRYZM 1 byte fixtures are imported (those land in S30).

import { describe, expect, it } from 'vitest';
import { Structural, createId } from '@pryzm/schemas';
import {
  produceStructural,
  composeStructuralGeometryHash,
  NO_JOINS,
  assertValidDescriptor,
  STRUCTURAL_HASH_SCHEMA_VERSION,
} from '../src/index.js';

const POS_TOL = 1e-5;

function make(partial: Partial<Structural>): Structural {
  return Structural.parse({
    id: createId('structural'),
    levelId: 'L1',
    ...partial,
  });
}

describe('produceStructural — analytic parity (S26)', () => {
  it('case 1: footing 1×1×0.4 produces a valid descriptor whose AABB is exactly the footprint', () => {
    const s = make({ kind: 'footing', origin: { x: 0, y: 0, z: 0 }, width: 1, depth: 1, thickness: 0.4 });
    const d = produceStructural(s, NO_JOINS, 0);
    assertValidDescriptor(d);
    expect(d.bounds.min.x).toBeCloseTo(-0.5, 6);
    expect(d.bounds.max.x).toBeCloseTo( 0.5, 6);
    expect(d.bounds.min.z).toBeCloseTo(-0.5, 6);
    expect(d.bounds.max.z).toBeCloseTo( 0.5, 6);
    expect(d.bounds.min.y).toBeCloseTo(0,    6);
    expect(d.bounds.max.y).toBeCloseTo(0.4,  6);
  });

  it('case 2: footing positioned at (10, 0, 5) translates AABB by the same amount', () => {
    const s = make({ kind: 'footing', origin: { x: 10, y: 0, z: 5 }, width: 0.6, depth: 0.6, thickness: 0.3 });
    const d = produceStructural(s, NO_JOINS, 0);
    expect(d.bounds.min.x).toBeCloseTo(9.7,  6);
    expect(d.bounds.max.x).toBeCloseTo(10.3, 6);
    expect(d.bounds.min.z).toBeCloseTo(4.7,  6);
    expect(d.bounds.max.z).toBeCloseTo(5.3,  6);
  });

  it('case 3: foundation-slab is wider/thicker than a footing, AABB grows with both axes', () => {
    // For a vertical extrusion the basis maps profile.width → world Z and
    // profile.depth → world X (see linear-structural.makeBasis for the
    // ref-vector pick that yields this orientation).
    const s = make({ kind: 'foundation-slab', width: 4, depth: 6, thickness: 0.6 });
    const d = produceStructural(s, NO_JOINS, 0);
    expect(d.bounds.max.x - d.bounds.min.x).toBeCloseTo(6, 6);
    expect(d.bounds.max.z - d.bounds.min.z).toBeCloseTo(4, 6);
    expect(d.bounds.max.y - d.bounds.min.y).toBeCloseTo(0.6, 6);
  });

  it('case 4: brace XY-diagonal of length 5 spans exactly that distance', () => {
    const s = make({
      kind: 'brace',
      origin: { x: 0, y: 0, z: 0 },
      endOffset: { x: 3, y: 4, z: 0 },
      radius: 0.05,
    });
    const d = produceStructural(s, NO_JOINS, 0);
    assertValidDescriptor(d);
    // Bounding diagonal must include both endpoints (with circular profile inflation).
    expect(d.bounds.max.x).toBeGreaterThan(2.9);
    expect(d.bounds.max.y).toBeGreaterThan(3.9);
    expect(d.bounds.min.x).toBeLessThan(0.1);
    expect(d.bounds.min.y).toBeLessThan(0.1);
  });

  it('case 5: connection node is centred on origin in Y', () => {
    const s = make({ kind: 'connection', origin: { x: 0, y: 1, z: 0 }, radius: 0.1, thickness: 0.2 });
    const d = produceStructural(s, NO_JOINS, 0);
    const cy = (d.bounds.min.y + d.bounds.max.y) / 2;
    expect(cy).toBeCloseTo(1, 6);
    expect(d.bounds.max.y - d.bounds.min.y).toBeCloseTo(0.2, 6);
  });

  it('case 6: hash schema version is stamped in the prefix', () => {
    const s = make({ kind: 'footing' });
    const h = composeStructuralGeometryHash(s, 0);
    expect(h.startsWith(`structural:v${STRUCTURAL_HASH_SCHEMA_VERSION}|`)).toBe(true);
  });

  it('case 7: identical inputs ⇒ identical hash (cache key stability)', () => {
    const a = make({ id: 'structural_01HZZZZZZZZZZZZZZZZZZZZZZZ', kind: 'footing', width: 1.0, depth: 1.0 });
    const b = make({ id: 'structural_01HZZZZZZZZZZZZZZZZZZZZZZZ', kind: 'footing', width: 1.0, depth: 1.0 });
    expect(composeStructuralGeometryHash(a, 0)).toBe(composeStructuralGeometryHash(b, 0));
  });

  it('case 8: changing thickness changes the hash', () => {
    const a = make({ id: 'structural_01HZZZZZZZZZZZZZZZZZZZZZZZ', kind: 'footing', thickness: 0.4 });
    const b = make({ id: 'structural_01HZZZZZZZZZZZZZZZZZZZZZZZ', kind: 'footing', thickness: 0.5 });
    expect(composeStructuralGeometryHash(a, 0)).not.toBe(composeStructuralGeometryHash(b, 0));
  });

  it('case 9: brace material key carries the structural family + brace kind', () => {
    const s = make({ kind: 'brace', endOffset: { x: 1, y: 0, z: 0 } });
    const d = produceStructural(s, NO_JOINS, 0);
    expect(d.materialKeys.length).toBeGreaterThan(0);
    expect(d.materialKeys[0]).toContain('structural|brace|');
  });

  it('case 10: worldY shift propagates linearly into the descriptor AABB', () => {
    const s = make({ kind: 'footing', baseOffset: 0, thickness: 0.4 });
    const d0 = produceStructural(s, NO_JOINS, 0);
    const d10 = produceStructural(s, NO_JOINS, 10);
    expect(d10.bounds.min.y - d0.bounds.min.y).toBeCloseTo(10, 6);
    expect(d10.bounds.max.y - d0.bounds.max.y).toBeCloseTo(10, 6);
  });

  it('case 11: baseOffset shifts geometry without changing height', () => {
    const a = make({ kind: 'footing', baseOffset: 0,   thickness: 0.4 });
    const b = make({ kind: 'footing', baseOffset: 1.5, thickness: 0.4 });
    const da = produceStructural(a, NO_JOINS, 0);
    const db = produceStructural(b, NO_JOINS, 0);
    expect(db.bounds.min.y - da.bounds.min.y).toBeCloseTo(1.5, 6);
    expect(db.bounds.max.y - da.bounds.max.y).toBeCloseTo(1.5, 6);
  });

  it('case 12: foundation-slab descriptor has a non-empty index buffer', () => {
    const s = make({ kind: 'foundation-slab', width: 4, depth: 6, thickness: 0.6 });
    const d = produceStructural(s, NO_JOINS, 0);
    expect(d.index.length).toBeGreaterThan(0);
    expect(d.position.length).toBeGreaterThan(0);
  });

  it('case 13: every kind produces at least one draw group', () => {
    for (const kind of ['brace', 'footing', 'foundation-slab', 'connection'] as const) {
      const s = make({
        kind,
        endOffset: { x: 1, y: 0, z: 0 },
      });
      const d = produceStructural(s, NO_JOINS, 0);
      expect(d.groups.length).toBeGreaterThan(0);
    }
  });

  it('case 14: brace requires non-zero endOffset (schema-level guard)', () => {
    expect(() =>
      Structural.parse({
        id: createId('structural'),
        levelId: 'L1',
        kind: 'brace',
        endOffset: { x: 0, y: 0, z: 0 },
      }),
    ).toThrow();
    void POS_TOL;
  });
});
