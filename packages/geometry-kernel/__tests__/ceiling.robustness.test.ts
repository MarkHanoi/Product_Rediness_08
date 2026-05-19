// produceCeiling — robustness / property test (S14-T8).

import { describe, expect, it } from 'vitest';
import { produceCeiling } from '../src/producers/ceiling.js';
import { NO_JOINS } from '../src/types/JoinData.js';
import { assertValidDescriptor } from '../src/types/assertValidDescriptor.js';
import { CEILING_FIXTURES } from './__configs__/ceiling-index.js';

describe('produceCeiling — fixture invariants', () => {
  for (const f of CEILING_FIXTURES) {
    it(`${f.id}: produces a valid descriptor`, () => {
      const desc = produceCeiling(f.ceiling, NO_JOINS, f.worldY);
      assertValidDescriptor(desc);
      expect(desc.position.length % 3).toBe(0);
      expect(desc.normal.length).toBe(desc.position.length);
      expect(desc.uv.length).toBe((desc.position.length / 3) * 2);
      for (const v of desc.position) expect(Number.isFinite(v)).toBe(true);
      for (const v of desc.normal)   expect(Number.isFinite(v)).toBe(true);
    });

    it(`${f.id}: top + bottom + edge groups present`, () => {
      const desc = produceCeiling(f.ceiling, NO_JOINS, f.worldY);
      const slots = desc.materialKeys.map((k) => k.split('|').pop());
      expect(slots).toContain('top');
      expect(slots).toContain('bottom');
      expect(slots).toContain('edge');
    });

    it(`${f.id}: top sits above bottom`, () => {
      const desc = produceCeiling(f.ceiling, NO_JOINS, f.worldY);
      expect(desc.bounds.max.y).toBeGreaterThan(desc.bounds.min.y);
      expect(desc.bounds.max.y - desc.bounds.min.y).toBeCloseTo(f.ceiling.thickness, 6);
    });

    it(`${f.id}: hash deterministic`, () => {
      const a = produceCeiling(f.ceiling, NO_JOINS, f.worldY);
      const b = produceCeiling(f.ceiling, NO_JOINS, f.worldY);
      expect(a.hash).toBe(b.hash);
    });
  }
});

describe('produceCeiling — invariant guards', () => {
  it('rejects boundary < 3 points', () => {
    expect(() => produceCeiling(
      {
        id: 'ceiling:bad', type: 'ceiling', childrenIds: [],
        metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'fixture', version: 1 },
        levelId: 'level:0',
        boundary: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
        ceilingHeight: 2.7, thickness: 0.05,
      } as Parameters<typeof produceCeiling>[0],
      NO_JOINS, 0,
    )).toThrow(/boundary requires/);
  });

  it('rejects thickness >= ceilingHeight', () => {
    expect(() => produceCeiling(
      {
        id: 'ceiling:bad2', type: 'ceiling', childrenIds: [],
        metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'fixture', version: 1 },
        levelId: 'level:0',
        boundary: [
          { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
          { x: 1, y: 0, z: 1 }, { x: 0, y: 0, z: 1 },
        ],
        ceilingHeight: 0.05, thickness: 0.05,
      } as Parameters<typeof produceCeiling>[0],
      NO_JOINS, 0,
    )).toThrow(/thickness/);
  });
});
