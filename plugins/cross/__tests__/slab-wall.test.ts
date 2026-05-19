// plugins/cross/__tests__/slab-wall.test.ts — smoke tests for the
// slab→wall cascade rule.  Asserts the rule (a) fires for the documented
// trigger set, (b) routes through `payload.slabId`, (c) translates the
// slab payload into the right `wall.transform[move]` delta per kind,
// and (d) honours the `wallPinAnchor` filter for `slab.setThickness`.

import { describe, expect, it } from 'vitest';
import type { CascadeContext } from '@pryzm/plugin-sdk';
import {
  buildSlabWallCascadeRule,
  SLAB_WALL_CASCADE_TRIGGERS,
} from '../src/slab-wall.js';

const ctx: CascadeContext = { stores: {} };

describe('cross.slab-wall', () => {
  it('appliesTo exactly the documented trigger set', () => {
    const rule = buildSlabWallCascadeRule({ wallsPinnedToSlab: () => [] });
    for (const t of SLAB_WALL_CASCADE_TRIGGERS) {
      expect(rule.appliesTo(t)).toBe(true);
    }
    expect(rule.appliesTo('slab.setType')).toBe(false);
    expect(rule.appliesTo('slab.create')).toBe(false);
    expect(rule.appliesTo('slab.addHole')).toBe(false);
    expect(rule.appliesTo('wall.move')).toBe(false);
  });

  it('extractEntityId reads payload.slabId (overrides default)', () => {
    const rule = buildSlabWallCascadeRule({ wallsPinnedToSlab: () => [] });
    expect(rule.extractEntityId).toBeDefined();
    expect(
      rule.extractEntityId!({ type: 'slab.move', payload: { slabId: 'slab_X' } }),
    ).toBe('slab_X');
  });

  it('slab.move → wall.transform[move] with XZ delta only', () => {
    const rule = buildSlabWallCascadeRule({
      wallsPinnedToSlab: (id) => (id === 'slab_A' ? ['wall_1', 'wall_2'] : []),
    });
    const cmd = {
      type: 'slab.move',
      payload: { slabId: 'slab_A', delta: { x: 1, y: 99, z: -2 } },
    };
    const affected = rule.resolveAffected(cmd, ctx);
    expect(affected).toEqual(['wall_1', 'wall_2']);

    const synth = rule.synthesize('wall_1', cmd, ctx);
    expect(synth.type).toBe('wall.transform');
    expect(synth.payload).toMatchObject({
      wallId: 'wall_1',
      kind: 'move',
      delta: { x: 1, z: -2 },
      cascadedFrom: 'slab.move',
      slabId: 'slab_A',
    });
    // y intentionally NOT carried — slab.move is XZ-only at the slab layer.
    expect((synth.payload as { delta: { y?: number } }).delta.y).toBeUndefined();
  });

  it('slab.setBaseOffset → wall.transform[move] with Y delta only', () => {
    const rule = buildSlabWallCascadeRule({
      wallsPinnedToSlab: () => ['wall_1'],
    });
    const cmd = {
      type: 'slab.setBaseOffset',
      payload: { slabId: 'slab_A', baseOffset: 3.2, previousBaseOffset: 3.0 },
    };
    expect(rule.resolveAffected(cmd, ctx)).toEqual(['wall_1']);
    const synth = rule.synthesize('wall_1', cmd, ctx);
    expect(synth.payload).toMatchObject({
      wallId: 'wall_1',
      kind: 'move',
      delta: { x: 0, z: 0 },
    });
    expect(
      (synth.payload as { delta: { y: number } }).delta.y,
    ).toBeCloseTo(0.2, 10);
  });

  it('slab.setThickness only cascades to TOP-anchored walls', () => {
    const rule = buildSlabWallCascadeRule({
      wallsPinnedToSlab: () => ['wall_top', 'wall_bot'],
      wallPinAnchor: (_slab, wallId) =>
        wallId === 'wall_top' ? 'top' : 'bottom',
    });
    const cmd = {
      type: 'slab.setThickness',
      payload: { slabId: 'slab_A', thickness: 0.4, previousThickness: 0.3 },
    };
    expect(rule.resolveAffected(cmd, ctx)).toEqual(['wall_top']);

    const synth = rule.synthesize('wall_top', cmd, ctx);
    expect(
      (synth.payload as { delta: { y: number } }).delta.y,
    ).toBeCloseTo(0.1, 10);
  });

  it('default wallPinAnchor treats every wall as bottom (filters all out for setThickness)', () => {
    const rule = buildSlabWallCascadeRule({
      wallsPinnedToSlab: () => ['wall_1', 'wall_2'],
    });
    const cmd = {
      type: 'slab.setThickness',
      payload: { slabId: 'slab_A', thickness: 0.4, previousThickness: 0.3 },
    };
    expect(rule.resolveAffected(cmd, ctx)).toEqual([]);
  });

  it('throws clear error when payload.slabId is missing', () => {
    const rule = buildSlabWallCascadeRule({ wallsPinnedToSlab: () => [] });
    expect(() =>
      rule.extractEntityId!({ type: 'slab.move', payload: { delta: { x: 0, y: 0, z: 0 } } }),
    ).toThrow(/payload\.slabId/);
  });
});
