// Contract 44 — G8: poche pattern MUST apply to linked-model elements.
//
// Spec: docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md §S33 line 629.

import { describe, expect, it } from 'vitest';
import { Wall, createId } from '@pryzm/schemas';
import { computePocheFills } from '@pryzm/geometry-kernel';
import {
  scopeToActiveLevels,
  StyleResolver,
  type ElementStyle,
} from '@pryzm/plugin-plan-view';

function wall(levelId: string, x = 0): Wall {
  return Wall.parse({
    id: createId('wall'),
    levelId,
    baseLine: [
      { x, y: 0, z: 0 },
      { x: x + 4, y: 0, z: 0 },
    ],
    thickness: 0.2,
    height: 3,
  });
}

describe('Contract 44 — G8: linked-model walls receive poche fills + style overrides', () => {
  it('walls from linkedA model produce poche fills and honour overrides', () => {
    const wLocal = wall('L1');
    const wLinked = wall('linkedA:L1', 6);

    // Active scope = active level + linked level.
    const scoped = scopeToActiveLevels(
      [wLocal, wLinked],
      'L1',
      ['linkedA:L1'],
      (w) => w.levelId,
    );
    expect(scoped).toHaveLength(2);

    // Compute poche over the SCOPED collection — which includes the linked wall.
    const fills = computePocheFills({ walls: scoped, doors: [], windows: [], levelZ: 0 });
    const elementIds = new Set(fills.map((f) => f.elementId));
    expect(elementIds.has(wLocal.id)).toBe(true);
    expect(elementIds.has(wLinked.id)).toBe(true);

    // Override the linked-model wall only — the local wall is unaffected.
    const resolver = new StyleResolver(
      [{ viewId: 'view-A', elementId: wLinked.id, fillColorOverride: '#0066aa' }],
      'view-A',
    );
    const DEFAULT: ElementStyle = { fillColor: '#cccccc' };

    for (const fill of fills) {
      const effective = resolver.resolve(fill.elementId, DEFAULT).fillColor;
      if (fill.elementId === wLinked.id) {
        expect(effective).toBe('#0066aa');
      } else {
        expect(effective).toBe('#cccccc');
      }
    }
  });
});
