// Contract 44 — G3: linked levels (stacked buildings) MUST isolate correctly.
//
// Spec: docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md §S33 line 624.

import { describe, expect, it } from 'vitest';
import { Wall, createId } from '@pryzm/schemas';
import { scopeToActiveLevels, scopeToLinkedModel } from '@pryzm/plugin-plan-view';

function wall(levelId: string, x = 0): Wall {
  return Wall.parse({
    id: createId('wall'),
    levelId,
    baseLine: [
      { x, y: 0, z: 0 },
      { x: x + 4, y: 0, z: 0 },
    ],
    thickness: 0.2,
  });
}

describe('Contract 44 — G3: linked-level scoping', () => {
  it('active level + linked levels render together; other levels do not', () => {
    const wLocal  = wall('L1');
    const wLinkA  = wall('linkedA:L1');
    const wLinkB  = wall('linkedB:L0');
    const wOther  = wall('L2');
    const wOtherLink = wall('linkedC:L1');

    const out = scopeToActiveLevels(
      [wLocal, wLinkA, wLinkB, wOther, wOtherLink],
      'L1',
      ['linkedA:L1', 'linkedB:L0'],
      (w) => w.levelId,
    );
    const ids = out.map((w) => w.id).sort();
    expect(ids).toEqual([wLocal.id, wLinkA.id, wLinkB.id].sort());
  });

  it('linked-model prefix scoping ignores prefix-collisions without colon', () => {
    const wA   = wall('linkedA:L1');
    const wA2  = wall('linkedA:L2');
    const wColl = wall('linkedA-extra:L1');
    const out = scopeToLinkedModel([wA, wA2, wColl], 'linkedA', (w) => w.levelId);
    const ids = out.map((w) => w.id).sort();
    expect(ids).toEqual([wA.id, wA2.id].sort());
  });
});
