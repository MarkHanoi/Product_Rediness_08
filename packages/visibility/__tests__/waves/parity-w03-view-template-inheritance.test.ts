// Parity fixture for w03-view-template-inheritance.

import { describe, expect, it } from 'vitest';
import {
  w03ViewTemplateInheritance,
  type VisibilityElement,
  type VisibilityView,
  type VisibilityViewTemplate,
  type VisibilityWaveContext,
} from '../../src/waves/index.js';

const tpl = (
  id: string,
  catMap: Iterable<[string, 'show' | 'hide' | 'halftone']>,
  parent: VisibilityViewTemplate | null = null,
): VisibilityViewTemplate => ({
  id, categoryVisibility: new Map(catMap), parent,
});

const view = (template: VisibilityViewTemplate | null): VisibilityView => ({
  id: 'plan-L1', visibleLevels: new Set(['L1']), unlevelScoped: false,
  categoryVisibility: new Map(), viewTemplate: template,
});

const el = (over: Partial<VisibilityElement> = {}): VisibilityElement => ({
  id: 'e1', category: 'wall', levelId: 'L1', ...over,
});

const ctx = (e: VisibilityElement, v: VisibilityView): VisibilityWaveContext => ({
  element: e, activeView: v, resolvedVisibility: new Map(),
});

describe('w03-view-template-inheritance (parity)', () => {
  it('no template → pass through visible', () => {
    expect(w03ViewTemplateInheritance(ctx(el(), view(null))).visible).toBe(true);
  });

  it('template hides the category → element hidden', () => {
    const t = tpl('T1', [['wall', 'hide']]);
    expect(w03ViewTemplateInheritance(ctx(el(), view(t))).visible).toBe(false);
  });

  it('template halftones the category → halftone flag set', () => {
    const t = tpl('T1', [['wall', 'halftone']]);
    const r = w03ViewTemplateInheritance(ctx(el(), view(t)));
    expect(r.visible).toBe(true);
    expect(r.halftone).toBe(true);
  });

  it('first template in chain wins (parent template ignored when child decides)', () => {
    const parent = tpl('parent', [['wall', 'hide']]);
    const child = tpl('child', [['wall', 'show']], parent);
    expect(w03ViewTemplateInheritance(ctx(el(), view(child))).visible).toBe(true);
  });

  it('parent template consulted when child template doesn\'t pin the category', () => {
    const parent = tpl('parent', [['wall', 'hide']]);
    const child = tpl('child', [], parent);
    expect(w03ViewTemplateInheritance(ctx(el(), view(child))).visible).toBe(false);
  });

  it('explicit "show" in template lets later waves run (bug #8214)', () => {
    const t = tpl('T1', [['wall', 'show']]);
    const r = w03ViewTemplateInheritance(ctx(el(), view(t)));
    expect(r.visible).toBe(true);
    expect(r.halftone).toBeFalsy();
  });

  it('view itself defines the category → wave-3 is a pass-through', () => {
    // wave-2 covered this already; wave-3 must not override.
    const view2: VisibilityView = {
      id: 'plan-L1', visibleLevels: new Set(['L1']), unlevelScoped: false,
      categoryVisibility: new Map([['wall', 'hide']]),
      viewTemplate: tpl('T1', [['wall', 'show']]),
    };
    expect(w03ViewTemplateInheritance(ctx(el(), view2)).visible).toBe(true);
  });

  it('element override "show" wins over template "hide"', () => {
    const t = tpl('T1', [['wall', 'hide']]);
    expect(w03ViewTemplateInheritance(ctx(
      el({ categoryOverride: 'show' }), view(t),
    )).visible).toBe(true);
  });
});
