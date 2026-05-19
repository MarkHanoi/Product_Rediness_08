// plan-view-adapter unit suite (S34 / ADR-0024 + post-2B closeout / ADR-0030).

import { describe, expect, it } from 'vitest';
import { AnnotationStore, type AnnotationData } from '@pryzm/plugin-sdk';
import { Annotation, createId } from '@pryzm/plugin-sdk';
import {
  bindAnnotationStoreToPlanView,
  rendererKindFor,
  toPlanViewAnnotationLike,
} from '../src/plan-view-adapter.js';

function makeAnnotation(over: Partial<AnnotationData> = {}): AnnotationData {
  return Annotation.parse({
    id: createId('annotation'),
    viewId: 'view-A',
    kind: 'text-note',
    anchor: { x: 1, y: 2, z: 3 },
    text: 'sample',
    rotation: 0,
    textHeightMm: 2.5,
    ...over,
  });
}

describe('rendererKindFor — schema 11 → renderer 4 collapse', () => {
  it('text family maps to "text"', () => {
    for (const k of ['text-note', 'tag', 'keynote', 'level-tag', 'grid-bubble'] as const) {
      expect(rendererKindFor(k)).toBe('text');
    }
  });

  it('callout maps to "callout"', () => {
    expect(rendererKindFor('callout')).toBe('callout');
  });

  it('section / elevation marks map to "leader"', () => {
    expect(rendererKindFor('section-mark')).toBe('leader');
    expect(rendererKindFor('elevation-mark')).toBe('leader');
  });

  it('revision-cloud / north-arrow / scale-bar map to "region"', () => {
    expect(rendererKindFor('revision-cloud')).toBe('region');
    expect(rendererKindFor('north-arrow')).toBe('region');
    expect(rendererKindFor('scale-bar')).toBe('region');
  });
});

describe('toPlanViewAnnotationLike', () => {
  it('produces a renderer-friendly DTO that round-trips the anchor', () => {
    const a = makeAnnotation();
    const dto = toPlanViewAnnotationLike(a);
    expect(dto.id).toBe(a.id);
    expect(dto.viewId).toBe(a.viewId);
    expect(dto.text).toBe(a.text);
    expect(dto.anchor).toEqual(a.anchor);
    expect(dto.kind).toBe('text');
  });

  it('preserves color and textHeightMm when set', () => {
    const a = makeAnnotation({ color: '#aa00ff', textHeightMm: 4.5 });
    const dto = toPlanViewAnnotationLike(a);
    expect(dto.color).toBe('#aa00ff');
    expect(dto.textHeightMm).toBe(4.5);
  });
});

describe('bindAnnotationStoreToPlanView', () => {
  it('produces a PlanSourceStoreShape that exposes the store as a Map', () => {
    const store = new AnnotationStore();
    const a = makeAnnotation({ text: 'one' });
    const b = makeAnnotation({ text: 'two', kind: 'callout' });
    // Use applyPatch via internal mutation since this is a test fixture.
    // We hand-roll the patches the same way produceCommand would.
    store.applyPatch([
      { op: 'add', path: [a.id], value: a },
      { op: 'add', path: [b.id], value: b },
    ]);

    const adapter = bindAnnotationStoreToPlanView(store);
    const map = adapter.getState();
    expect(map.size).toBe(2);
    expect(map.get(a.id)?.text).toBe('one');
    expect(map.get(b.id)?.kind).toBe('callout');
  });

  it('subscribeDirty fans the underlying store dirty signal as a void event', () => {
    const store = new AnnotationStore();
    const adapter = bindAnnotationStoreToPlanView(store);
    let calls = 0;
    const off = adapter.subscribeDirty(() => { calls++; });

    const a = makeAnnotation();
    store.applyPatch([{ op: 'add', path: [a.id], value: a }]);
    expect(calls).toBe(1);

    off();
    store.applyPatch([{ op: 'remove', path: [a.id] }]);
    expect(calls).toBe(1); // unsubscribed
  });

  it('rebuilds the Map on each getState() call', () => {
    const store = new AnnotationStore();
    const adapter = bindAnnotationStoreToPlanView(store);
    const m1 = adapter.getState();
    const m2 = adapter.getState();
    expect(m1).not.toBe(m2);
  });
});
