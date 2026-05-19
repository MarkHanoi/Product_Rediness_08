// produceLighting — analytic parity (S26-T4 / ADR-0023).

import { describe, expect, it } from 'vitest';
import { Lighting, createId } from '@pryzm/schemas';
import {
  produceLighting,
  composeLightingGeometryHash,
  composeLightingMaterialKey,
  NO_JOINS,
  assertValidDescriptor,
  LIGHTING_HASH_SCHEMA_VERSION,
} from '../src/index.js';

function make(partial: Partial<Lighting>): Lighting {
  return Lighting.parse({
    id: createId('lighting'),
    levelId: 'L1',
    ...partial,
  });
}

describe('produceLighting — analytic parity (S26)', () => {
  it('case 1: downlight produces a valid circular extrusion', () => {
    const l = make({ kind: 'downlight', width: 0.2, depth: 0.2, thickness: 0.05 });
    const d = produceLighting(l, NO_JOINS, 0);
    assertValidDescriptor(d);
    expect(d.bounds.max.x - d.bounds.min.x).toBeCloseTo(0.2, 4);
    expect(d.bounds.max.z - d.bounds.min.z).toBeCloseTo(0.2, 4);
    expect(d.bounds.max.y - d.bounds.min.y).toBeCloseTo(0.05, 6);
  });

  it('case 2: pendant drops below origin by dropLength', () => {
    const l0 = make({ kind: 'pendant', origin: { x: 0, y: 3, z: 0 }, dropLength: 0 });
    const l1 = make({ kind: 'pendant', origin: { x: 0, y: 3, z: 0 }, dropLength: 0.8 });
    const d0 = produceLighting(l0, NO_JOINS, 0);
    const d1 = produceLighting(l1, NO_JOINS, 0);
    expect(d0.bounds.min.y - d1.bounds.min.y).toBeCloseTo(0.8, 6);
  });

  it('case 3: strip is a long rectangular fixture (depth runs along world X)', () => {
    // linear-structural's basis maps profile.depth → world X and
    // profile.width → world Z for a vertical extrusion.
    const l = make({ kind: 'strip', width: 0.05, depth: 1.2, thickness: 0.04 });
    const d = produceLighting(l, NO_JOINS, 0);
    expect(d.bounds.max.x - d.bounds.min.x).toBeCloseTo(1.2, 4);
    expect(d.bounds.max.z - d.bounds.min.z).toBeCloseTo(0.05, 4);
  });

  it('case 4: wall-sconce body lies inside its width × depth × thickness box', () => {
    const l = make({ kind: 'wall-sconce', width: 0.15, depth: 0.1, thickness: 0.2 });
    const d = produceLighting(l, NO_JOINS, 0);
    expect(d.bounds.max.x - d.bounds.min.x).toBeCloseTo(0.1, 4);   // depth → X
    expect(d.bounds.max.z - d.bounds.min.z).toBeCloseTo(0.15, 4);  // width → Z
    expect(d.bounds.max.y - d.bounds.min.y).toBeCloseTo(0.2, 6);
  });

  it('case 5: emergency fixture carries the emergency flag in its material key', () => {
    const l = make({ kind: 'emergency', isEmergency: true });
    const k = composeLightingMaterialKey(l);
    const flagPart = k.split('|')[6];
    expect(flagPart).toBe('1');
  });

  it('case 6: material key encodes intensity + range', () => {
    const l = make({ kind: 'downlight', intensity: 2.5, range: 8 });
    const k = composeLightingMaterialKey(l);
    expect(k).toContain('|2.5000|');
    expect(k).toContain('|8.0000|');
  });

  it('case 7: hash schema version is stamped', () => {
    const l = make({ kind: 'downlight' });
    expect(composeLightingGeometryHash(l, 0).startsWith(`lighting:v${LIGHTING_HASH_SCHEMA_VERSION}|`)).toBe(true);
  });

  it('case 8: identical inputs ⇒ identical hash; changing color changes hash', () => {
    const a = make({ id: 'lighting_01HZZZZZZZZZZZZZZZZZZZZZZZ', kind: 'downlight', color: [1, 1, 1] });
    const b = make({ id: 'lighting_01HZZZZZZZZZZZZZZZZZZZZZZZ', kind: 'downlight', color: [1, 1, 1] });
    const c = make({ id: 'lighting_01HZZZZZZZZZZZZZZZZZZZZZZZ', kind: 'downlight', color: [1, 0, 0] });
    expect(composeLightingGeometryHash(a, 0)).toBe(composeLightingGeometryHash(b, 0));
    expect(composeLightingGeometryHash(a, 0)).not.toBe(composeLightingGeometryHash(c, 0));
  });

  it('case 9: every kind produces at least one draw group', () => {
    for (const kind of ['downlight', 'pendant', 'strip', 'wall-sconce', 'emergency'] as const) {
      const l = make({ kind });
      const d = produceLighting(l, NO_JOINS, 0);
      expect(d.groups.length).toBeGreaterThan(0);
    }
  });

  it('case 10: worldY shifts the entire fixture in Y', () => {
    const l = make({ kind: 'downlight' });
    const d0 = produceLighting(l, NO_JOINS, 0);
    const d5 = produceLighting(l, NO_JOINS, 5);
    expect(d5.bounds.min.y - d0.bounds.min.y).toBeCloseTo(5, 6);
  });
});
