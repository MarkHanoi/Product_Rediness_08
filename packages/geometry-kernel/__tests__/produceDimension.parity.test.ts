// produceDimension — analytic parity (S29).
//
// `code-level ADR docs/architecture/adr/0028-plan-view-canvas-architecture.md`.

import { describe, expect, it } from 'vitest';
import { Dimension, createId } from '@pryzm/schemas';
import {
  produceDimension,
  analyseDimension,
  composeDimensionGeometryHash,
  composeDimensionMaterialKey,
  NO_JOINS,
  assertValidDescriptor,
  DIMENSION_HASH_SCHEMA_VERSION,
} from '../src/index.js';

function make(partial: Partial<Dimension>): Dimension {
  return Dimension.parse({
    id: createId('dimension'),
    levelId: 'L1',
    ...partial,
  });
}

describe('produceDimension — analytic parity (S29)', () => {
  it('case 1: linear dimension produces a valid descriptor and a 2-arrow analytic record', () => {
    const d = make({
      kind: 'linear',
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 4, y: 0, z: 0 },
      ],
    });
    const desc = produceDimension(d, NO_JOINS, 0);
    assertValidDescriptor(desc);
    const a = analyseDimension(d);
    expect(a.valid).toBe(true);
    expect(a.measurement).toBeCloseTo(4, 6);
    expect(a.arrowheads).toHaveLength(2);
    expect(a.dimensionLine).not.toBeNull();
    expect(a.label).toBe('4000 mm'); // default unit mm, precision 0
  });

  it('case 2: angular dimension measures the apex angle correctly', () => {
    const d = make({
      kind: 'angular',
      points: [
        { x: 1, y: 0, z: 0 },   // ray A
        { x: 0, y: 0, z: 0 },   // apex
        { x: 0, y: 0, z: 1 },   // ray B (90°)
      ],
      precision: 1,
    });
    const a = analyseDimension(d);
    expect(a.valid).toBe(true);
    expect((a.measurement * 180) / Math.PI).toBeCloseTo(90, 4);
    expect(a.label).toBe('90.0°');
    const desc = produceDimension(d, NO_JOINS, 0);
    assertValidDescriptor(desc);
  });

  it('case 3: radial dimension labels with the R prefix and the metric distance', () => {
    const d = make({
      kind: 'radial',
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 3, y: 0, z: 0 },
      ],
      units: 'm',
      precision: 2,
    });
    const a = analyseDimension(d);
    expect(a.measurement).toBeCloseTo(3, 6);
    expect(a.label).toBe('R 3.00 m');
    expect(a.arrowheads).toHaveLength(1);
  });

  it('case 4: diameter dimension is linear distance with the Ø prefix', () => {
    const d = make({
      kind: 'diameter',
      points: [
        { x: -2, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
      ],
      units: 'm',
      precision: 1,
    });
    const a = analyseDimension(d);
    expect(a.measurement).toBeCloseTo(4, 6);
    expect(a.label).toBe('Ø 4.0 m');
    expect(a.arrowheads).toHaveLength(2);
  });

  it('case 5: spot-elevation reports the y-coordinate with the EL prefix', () => {
    const d = make({
      kind: 'spot-elevation',
      points: [{ x: 0, y: 2.5, z: 0 }],
      units: 'm',
      precision: 2,
    });
    const a = analyseDimension(d);
    expect(a.measurement).toBeCloseTo(2.5, 6);
    expect(a.label).toBe('EL 2.50 m');
    expect(a.dimensionLine).toBeNull();
    expect(a.extensionLines.length).toBeGreaterThan(0);
  });

  it('case 6: slope reports rise/run as a percentage', () => {
    const d = make({
      kind: 'slope',
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 4, y: 1, z: 0 },
      ],
      precision: 1,
    });
    const a = analyseDimension(d);
    expect(a.measurement).toBeCloseTo(0.25, 6);
    expect(a.label).toBe('25.0 %');
  });

  it('case 7: every kind produces a valid descriptor', () => {
    for (const kind of ['linear', 'angular', 'radial', 'diameter', 'spot-elevation', 'slope'] as const) {
      const d = make({
        kind,
        points: kind === 'angular'
          ? [{ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }]
          : kind === 'spot-elevation'
            ? [{ x: 0, y: 1, z: 0 }]
            : [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
      });
      const desc = produceDimension(d, NO_JOINS, 0);
      assertValidDescriptor(desc);
      expect(desc.groups.length).toBeGreaterThan(0);
    }
  });

  it('case 8: hash is deterministic for identical inputs and changes when any field flips', () => {
    const id = createId('dimension');
    const a = make({ id, kind: 'linear' });
    const b = make({ id, kind: 'linear' });
    const c = make({ id, kind: 'linear', precision: 2 });
    const d = make({ id, kind: 'linear', units: 'm' });
    expect(composeDimensionGeometryHash(a, 0)).toBe(composeDimensionGeometryHash(b, 0));
    expect(composeDimensionGeometryHash(a, 0)).not.toBe(composeDimensionGeometryHash(c, 0));
    expect(composeDimensionGeometryHash(a, 0)).not.toBe(composeDimensionGeometryHash(d, 0));
  });

  it('case 9: material key encodes kind, style, unit, and precision', () => {
    const d = make({ kind: 'linear', units: 'ft', precision: 3, style: 'engineering' });
    expect(composeDimensionMaterialKey(d)).toBe('dimension|linear|engineering|ft|3|body');
  });

  it('case 10: hash schema version is stamped', () => {
    const d = make({});
    expect(composeDimensionGeometryHash(d, 0).startsWith(`dimension:v${DIMENSION_HASH_SCHEMA_VERSION}|`)).toBe(true);
  });

  it('case 11: override text bypasses formatting', () => {
    const d = make({
      kind: 'linear',
      points: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
      overridden: true,
      overrideText: '~4 m (approx)',
    });
    const a = analyseDimension(d);
    expect(a.label).toBe('~4 m (approx)');
  });

  it('case 12: invalid input (insufficient points) returns valid=false but still emits a descriptor', () => {
    // Force-construct via Dimension.parse with kind override + valid 1-point default.
    const d = make({ kind: 'angular', points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }] });
    // Now mutate after parse to simulate a downstream bug — produce should still emit something safe.
    const broken = { ...d, points: [d.points[0]!, d.points[1]!] } as Dimension;
    const a = analyseDimension(broken);
    expect(a.valid).toBe(false);
    const desc = produceDimension(broken, NO_JOINS, 0);
    assertValidDescriptor(desc);
  });

  it('case 13: worldY shifts the entire dimension geometry in Y', () => {
    const d = make({
      kind: 'linear',
      points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
    });
    const d0 = produceDimension(d, NO_JOINS, 0);
    const d5 = produceDimension(d, NO_JOINS, 5);
    expect(d5.bounds.min.y - d0.bounds.min.y).toBeCloseTo(5, 4);
  });

  it('case 14: custom style emits a single placeholder group at the anchor (no arrowheads)', () => {
    const d = make({
      kind: 'linear',
      style: 'custom',
      points: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
    });
    const desc = produceDimension(d, NO_JOINS, 0);
    expect(desc.groups).toHaveLength(1);
  });
});
