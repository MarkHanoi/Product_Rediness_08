// producePlumbing — analytic parity (S26-T4 / ADR-0023).

import { describe, expect, it } from 'vitest';
import { Plumbing, createId } from '@pryzm/schemas';
import {
  producePlumbing,
  composePlumbingGeometryHash,
  composePlumbingMaterialKey,
  NO_JOINS,
  assertValidDescriptor,
  PLUMBING_HASH_SCHEMA_VERSION,
} from '../src/index.js';

function make(partial: Partial<Plumbing>): Plumbing {
  return Plumbing.parse({
    id: createId('plumbing'),
    levelId: 'L1',
    ...partial,
  });
}

describe('producePlumbing — analytic parity (S26)', () => {
  it('case 1: straight 1m pipe AABB spans exactly the length along +X', () => {
    const p = make({ kind: 'straight', length: 1, diameter: 0.05, rotation: 0 });
    const d = producePlumbing(p, NO_JOINS, 0);
    assertValidDescriptor(d);
    expect(d.bounds.max.x - d.bounds.min.x).toBeCloseTo(1, 4);
    expect(d.bounds.max.z - d.bounds.min.z).toBeCloseTo(0.05, 4);
  });

  it('case 2: rotation 90° around Y swaps the axis the pipe runs along', () => {
    const p = make({ kind: 'straight', length: 1, rotation: Math.PI / 2 });
    const d = producePlumbing(p, NO_JOINS, 0);
    expect(d.bounds.max.z - d.bounds.min.z).toBeGreaterThan(0.95);
    expect(d.bounds.max.x - d.bounds.min.x).toBeLessThan(0.06);
  });

  it('case 3: elbow occupies both +X and +Z arms', () => {
    const p = make({ kind: 'elbow', length: 0.5, diameter: 0.05 });
    const d = producePlumbing(p, NO_JOINS, 0);
    expect(d.bounds.max.x).toBeGreaterThan(0.45);
    expect(d.bounds.max.z).toBeGreaterThan(0.45);
  });

  it('case 4: tee occupies +X, −X and +Z arms (crossbar in X, branch in Z)', () => {
    const p = make({ kind: 'tee', length: 0.5 });
    const d = producePlumbing(p, NO_JOINS, 0);
    expect(d.bounds.min.x).toBeLessThan(-0.45);
    expect(d.bounds.max.x).toBeGreaterThan(0.45);
    expect(d.bounds.max.z).toBeGreaterThan(0.45);
  });

  it('case 5: material key encodes the system tag colour for cold-water', () => {
    const p = make({ kind: 'straight', systemTag: 'cold-water' });
    expect(composePlumbingMaterialKey(p)).toContain('|cold-water|#4a9bd1|');
  });

  it('case 6: material key falls back when system tag is unknown', () => {
    const p = make({ kind: 'straight', systemTag: 'mystery-fluid' });
    expect(composePlumbingMaterialKey(p)).toContain('|#7a8392|');
  });

  it('case 7: hash schema version is stamped, identical inputs ⇒ identical hash', () => {
    const a = make({ id: 'plumbing_01HZZZZZZZZZZZZZZZZZZZZZZZ', kind: 'straight', length: 1 });
    const b = make({ id: 'plumbing_01HZZZZZZZZZZZZZZZZZZZZZZZ', kind: 'straight', length: 1 });
    expect(composePlumbingGeometryHash(a, 0)).toBe(composePlumbingGeometryHash(b, 0));
    expect(composePlumbingGeometryHash(a, 0).startsWith(`plumbing:v${PLUMBING_HASH_SCHEMA_VERSION}|`)).toBe(true);
  });

  it('case 8: tee descriptor has 3× the index count of a straight (3 arms vs 1)', () => {
    const straight = producePlumbing(make({ kind: 'straight', length: 0.5 }), NO_JOINS, 0);
    const tee      = producePlumbing(make({ kind: 'tee',      length: 0.5 }), NO_JOINS, 0);
    expect(tee.index.length).toBe(straight.index.length * 3);
  });
});
