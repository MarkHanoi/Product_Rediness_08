// Stair → Handrail cascade rule (S14-T7).

import { describe, expect, it } from 'vitest';
import {
  buildStairHandrailCascadeRule,
  STAIR_HANDRAIL_CASCADE_TRIGGERS,
} from '../src/stair-handrail.js';
import type { CascadeCommand, CascadeContext } from '@pryzm/plugin-sdk';

const CTX: CascadeContext = { stores: {}, depth: 0, rootCommandId: 'root', visitedRules: new Set() } as unknown as CascadeContext;

function rule(over: Partial<Parameters<typeof buildStairHandrailCascadeRule>[0]> = {}) {
  return buildStairHandrailCascadeRule({
    handrailsOnStair: () => ['rail:1', 'rail:2'],
    resampleHandrailPath: () => [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
    ],
    ...over,
  });
}

describe('cross.stair-handrail — appliesTo', () => {
  it('fires for the documented six trigger types', () => {
    const r = rule();
    for (const t of STAIR_HANDRAIL_CASCADE_TRIGGERS) {
      expect(r.appliesTo(t)).toBe(true);
    }
    expect(r.appliesTo('stair.setType')).toBe(false);
    expect(r.appliesTo('stair.delete')).toBe(false);
    expect(r.appliesTo('wall.transform')).toBe(false);
  });
});

describe('cross.stair-handrail — resolveAffected', () => {
  it('returns rail ids from injected lookup', () => {
    const r = rule();
    const cmd: CascadeCommand = { type: 'stair.move', payload: { stairId: 'stair:A' } };
    expect(r.resolveAffected(cmd, CTX)).toEqual(['rail:1', 'rail:2']);
  });

  it('throws if cmd payload has no stairId', () => {
    const r = rule();
    expect(() => r.resolveAffected({ type: 'stair.move', payload: {} } as CascadeCommand, CTX))
      .toThrow(/stairId/);
  });
});

describe('cross.stair-handrail — synthesize', () => {
  it('emits handrail.recompute carrying the new path + cause', () => {
    const r = rule();
    const cmd: CascadeCommand = { type: 'stair.move', payload: { stairId: 'stair:A' } };
    const out = r.synthesize('rail:1', cmd, CTX);
    expect(out.type).toBe('handrail.recompute');
    const p = out.payload as { handrailId: string; path: unknown[]; cause: string; stairId: string };
    expect(p.handrailId).toBe('rail:1');
    expect(p.path.length).toBe(2);
    expect(p.cause).toBe('cascade:stair.move');
    expect(p.stairId).toBe('stair:A');
  });

  it('falls back when lookup returns null', () => {
    const r = rule({ resampleHandrailPath: () => null });
    const cmd: CascadeCommand = { type: 'stair.setShape', payload: { stairId: 'stair:A' } };
    const out = r.synthesize('rail:1', cmd, CTX);
    expect(out.type).toBe('handrail.recompute');
    const p = out.payload as { cause: string; path: unknown[] };
    expect(p.cause).toContain('lookup-failed');
    expect(p.path.length).toBe(2);
  });
});

describe('cross.stair-handrail — guard rails', () => {
  it('throws if handrailsOnStair is missing', () => {
    expect(() => buildStairHandrailCascadeRule({
      handrailsOnStair: undefined as unknown as () => string[],
      resampleHandrailPath: () => null,
    })).toThrow(/handrailsOnStair/);
  });

  it('throws if resampleHandrailPath is missing', () => {
    expect(() => buildStairHandrailCascadeRule({
      handrailsOnStair: () => [],
      resampleHandrailPath: undefined as unknown as () => null,
    })).toThrow(/resampleHandrailPath/);
  });
});
