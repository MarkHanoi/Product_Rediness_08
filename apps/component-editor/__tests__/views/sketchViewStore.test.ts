// sketchViewStore — WHICH work plane, plus the per-view camera.
//
// The camera half is what stops a view switch from throwing away the author's
// pan and zoom. Switching to the front elevation to check a head height and
// coming back to a plan that has jumped to the origin is the bug this store
// exists to prevent.
//
// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_VIEW_CAMERA,
  createSketchViewStore,
} from '../../src/views/sketchViewStore.js';
import type { SketchViewKind } from '../../src/views/viewProjection.js';

describe('sketchViewStore — the active work plane', () => {
  it('opens on the plan by default and reports a frozen snapshot', () => {
    const s = createSketchViewStore();
    expect(s.get().active).toBe('plan');
    expect(s.get().version).toBe(0);
    expect(Object.isFrozen(s.get())).toBe(true);
  });

  it('switches work plane and bumps the version', () => {
    const s = createSketchViewStore();
    s.setActive('elevation-front');
    expect(s.get().active).toBe('elevation-front');
    expect(s.get().version).toBe(1);
  });

  // Idempotence matters: the panel rebuilds the canvas on every view change,
  // so a redundant notification is a redundant teardown of live DOM.
  it('is idempotent — re-selecting the active view notifies nobody', () => {
    const s = createSketchViewStore('elevation-side');
    const fn = vi.fn();
    s.subscribe(fn);
    s.setActive('elevation-side');
    expect(fn).not.toHaveBeenCalled();
    expect(s.get().version).toBe(0);
  });

  it('notifies subscribers on a real change, and stops after unsubscribe', () => {
    const s = createSketchViewStore();
    const seen: SketchViewKind[] = [];
    const off = s.subscribe((snap) => seen.push(snap.active));
    s.setActive('elevation-front');
    s.setActive('plan');
    off();
    s.setActive('elevation-side');
    expect(seen).toEqual(['elevation-front', 'plan']);
  });

  it('refuses an invalid view rather than silently falling back to plan', () => {
    const s = createSketchViewStore();
    expect(() => s.setActive('elevation-back' as SketchViewKind)).toThrow(/invalid view/i);
    expect(() => createSketchViewStore('' as SketchViewKind)).toThrow(/invalid initial view/i);
  });
});

describe('sketchViewStore — the per-view camera', () => {
  it('starts every view at the default camera', () => {
    const s = createSketchViewStore();
    expect(s.cameraOf('plan')).toEqual(DEFAULT_VIEW_CAMERA);
    expect(s.cameraOf('elevation-front')).toEqual(DEFAULT_VIEW_CAMERA);
  });

  // THE PRESERVATION ASSERTION: each view remembers its OWN pan/zoom, and
  // moving one camera never disturbs another.
  it('remembers each work plane’s camera independently across switches', () => {
    const s = createSketchViewStore();
    s.setCamera('plan', { zoom: 2, panX: 100, panZ: 200 });
    s.setActive('elevation-front');
    s.setCamera('elevation-front', { zoom: 0.5, panX: -50, panZ: 0 });

    // Leave and come back — the plan camera is exactly where it was left.
    s.setActive('plan');
    expect(s.cameraOf('plan')).toEqual({ zoom: 2, panX: 100, panZ: 200 });
    expect(s.cameraOf('elevation-front')).toEqual({ zoom: 0.5, panX: -50, panZ: 0 });
    // …and the untouched view is still at the default.
    expect(s.cameraOf('elevation-side')).toEqual(DEFAULT_VIEW_CAMERA);
  });

  it('bumps the version on a camera change so a repaint is scheduled', () => {
    const s = createSketchViewStore();
    const before = s.get().version;
    s.setCamera('plan', { zoom: 3, panX: 0, panZ: 0 });
    expect(s.get().version).toBe(before + 1);
    // …but an unchanged camera is not a change.
    s.setCamera('plan', { zoom: 3, panX: 0, panZ: 0 });
    expect(s.get().version).toBe(before + 1);
  });

  // A zero or negative zoom divides by zero in `canvasToWorld`. Refusing here
  // keeps the failure at the write, where it names the caller.
  it('refuses a non-positive or non-finite camera', () => {
    const s = createSketchViewStore();
    expect(() => s.setCamera('plan', { zoom: 0, panX: 0, panZ: 0 })).toThrow(/zoom must be > 0/);
    expect(() => s.setCamera('plan', { zoom: -1, panX: 0, panZ: 0 })).toThrow(/zoom must be > 0/);
    expect(() => s.setCamera('plan', { zoom: 1, panX: Number.NaN, panZ: 0 }))
      .toThrow(/pan must be finite/);
    expect(() => s.cameraOf('nope' as SketchViewKind)).toThrow(/invalid view/i);
  });

  it('does not change the active view when only a camera moves', () => {
    const s = createSketchViewStore('elevation-side');
    s.setCamera('plan', { zoom: 4, panX: 1, panZ: 2 });
    expect(s.get().active).toBe('elevation-side');
  });
});
