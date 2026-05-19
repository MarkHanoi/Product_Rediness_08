import { describe, expect, it } from 'vitest';
import {
  applyVisibilityIntent,
  emptyResult,
  fromJSON,
  toJSON,
  type VisibilityIntentIndex,
} from '../src/index.js';

const INDEX: VisibilityIntentIndex = {
  elementsByCategory: new Map([
    ['furniture', new Set(['f1', 'f2', 'f3'])],
    ['wall', new Set(['w1', 'w2'])],
  ]),
  elementsByLinkedGroup: new Map([
    ['grp:kitchen', new Set(['f1', 'w1'])],
  ]),
};

describe('applyVisibilityIntent', () => {
  it('wave 3: hide a category fans to every element in the category', () => {
    const r = applyVisibilityIntent(
      emptyResult('view-A'),
      { viewId: 'view-A', verb: 'hide', target: { kind: 'category', category: 'furniture' } },
      INDEX,
    );
    expect([...r.hidden].sort()).toEqual(['f1', 'f2', 'f3']);
  });

  it('wave 4: halftone a linkedGroup fans to every linked element', () => {
    const r = applyVisibilityIntent(
      emptyResult('view-A'),
      { viewId: 'view-A', verb: 'halftone', target: { kind: 'linkedGroup', linkedGroupId: 'grp:kitchen' } },
      INDEX,
    );
    expect([...r.halftone].sort()).toEqual(['f1', 'w1']);
  });

  it('hide overrides halftone for the same id', () => {
    const after = applyVisibilityIntent(
      { viewId: 'view-A', hidden: new Set(), halftone: new Set(['f1']) },
      { viewId: 'view-A', verb: 'hide', target: { kind: 'element', elementId: 'f1' } },
      INDEX,
    );
    expect(after.hidden.has('f1')).toBe(true);
    expect(after.halftone.has('f1')).toBe(false);
  });

  it('show clears a hide row', () => {
    const after = applyVisibilityIntent(
      { viewId: 'view-A', hidden: new Set(['f1', 'f2']), halftone: new Set() },
      { viewId: 'view-A', verb: 'show', target: { kind: 'element', elementId: 'f1' } },
      INDEX,
    );
    expect(after.hidden.has('f1')).toBe(false);
    expect(after.hidden.has('f2')).toBe(true);
  });

  it('intents for a different viewId are no-ops', () => {
    const before = emptyResult('view-A');
    const after = applyVisibilityIntent(
      before,
      { viewId: 'view-OTHER', verb: 'hide', target: { kind: 'category', category: 'wall' } },
      INDEX,
    );
    expect(after).toBe(before);
  });

  it('JSON wire round-trip is byte-stable', () => {
    const r = applyVisibilityIntent(
      emptyResult('view-A'),
      { viewId: 'view-A', verb: 'hide', target: { kind: 'category', category: 'furniture' } },
      INDEX,
    );
    const wire = JSON.stringify(toJSON(r));
    const decoded = fromJSON(JSON.parse(wire));
    expect([...decoded.hidden].sort()).toEqual([...r.hidden].sort());
    expect(decoded.viewId).toBe('view-A');
  });
});
