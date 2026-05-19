// produceHandrail — robustness / property test (S14-T6).

import { describe, expect, it } from 'vitest';
import { produceHandrail } from '../src/producers/handrail.js';
import { NO_JOINS } from '../src/types/JoinData.js';
import { assertValidDescriptor } from '../src/types/assertValidDescriptor.js';
import { HANDRAIL_FIXTURES } from './__configs__/handrail-index.js';

describe('produceHandrail — fixture invariants', () => {
  for (const f of HANDRAIL_FIXTURES) {
    it(`${f.id}: produces a valid descriptor`, () => {
      const desc = produceHandrail(f.handrail, NO_JOINS, f.worldY);
      assertValidDescriptor(desc);
      expect(desc.position.length % 3).toBe(0);
      expect(desc.normal.length).toBe(desc.position.length);
      expect(desc.uv.length).toBe((desc.position.length / 3) * 2);
      for (const v of desc.position) expect(Number.isFinite(v)).toBe(true);
      for (const v of desc.normal)   expect(Number.isFinite(v)).toBe(true);
    });

    it(`${f.id}: hash deterministic`, () => {
      const a = produceHandrail(f.handrail, NO_JOINS, f.worldY);
      const b = produceHandrail(f.handrail, NO_JOINS, f.worldY);
      expect(a.hash).toBe(b.hash);
    });

    it(`${f.id}: bounds enclose all positions`, () => {
      const d = produceHandrail(f.handrail, NO_JOINS, f.worldY);
      for (let i = 0; i < d.position.length; i += 3) {
        expect(d.position[i]!).toBeGreaterThanOrEqual(d.bounds.min.x - 1e-6);
        expect(d.position[i]!).toBeLessThanOrEqual(d.bounds.max.x + 1e-6);
        expect(d.position[i + 1]!).toBeGreaterThanOrEqual(d.bounds.min.y - 1e-6);
        expect(d.position[i + 1]!).toBeLessThanOrEqual(d.bounds.max.y + 1e-6);
      }
    });
  }
});
