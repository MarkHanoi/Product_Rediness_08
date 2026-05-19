// Contract 44 — G7: poche pattern MUST honour override material (fill colour).
//
// Spec: docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md §S33 line 628.
//
// Implementation note: the kernel `computePocheFills` stays L0-pure (no plan-
// view imports).  Style override is applied at draw time through StyleResolver
// — so this test verifies the routing contract by resolving each PocheFill's
// fill colour through StyleResolver and asserting the override wins.

import { describe, expect, it } from 'vitest';
import { Wall, createId } from '@pryzm/schemas';
import { computePocheFills } from '@pryzm/geometry-kernel';
import { StyleResolver, type ElementStyle } from '@pryzm/plugin-plan-view';

const DEFAULT_FILL: ElementStyle = { fillColor: '#cccccc' };

describe('Contract 44 — G7: poche fills honour per-view override fillColor', () => {
  it('override fillColor on a wall propagates to its poche fill at draw time', () => {
    const w = Wall.parse({
      id: createId('wall'),
      levelId: 'L1',
      baseLine: [
        { x: 0, y: 0, z: 0 },
        { x: 4, y: 0, z: 0 },
      ],
      thickness: 0.2,
      height: 3,
    });

    const fills = computePocheFills({ walls: [w], doors: [], windows: [], levelZ: 0 });
    expect(fills.length).toBeGreaterThan(0);

    // Override only this wall in view-A.
    const resolver = new StyleResolver(
      [{ viewId: 'view-A', elementId: w.id, fillColorOverride: '#ff8800' }],
      'view-A',
    );

    // The host's draw-time wiring: route each fill's effective colour through
    // the resolver keyed on `fill.elementId`.
    for (const fill of fills) {
      const effective = resolver.resolve(fill.elementId, DEFAULT_FILL).fillColor;
      expect(effective).toBe('#ff8800');
    }

    // Other view sees default colour — no global leak.
    const otherResolver = new StyleResolver(
      [{ viewId: 'view-A', elementId: w.id, fillColorOverride: '#ff8800' }],
      'view-OTHER',
    );
    for (const fill of fills) {
      expect(otherResolver.resolve(fill.elementId, DEFAULT_FILL).fillColor).toBe('#cccccc');
    }
  });
});
