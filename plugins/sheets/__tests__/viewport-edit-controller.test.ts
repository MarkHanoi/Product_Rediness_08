// ViewportEditController coverage (S40 — "activate viewport" mode).

import { describe, it, expect, vi } from 'vitest';
import { ViewportEditController } from '../src/view-renderer/viewport-edit-controller.js';
import { IDENTITY_EDIT_CAMERA } from '../src/view-renderer/view-source.js';

describe('ViewportEditController', () => {
  it('starts with no active viewport and identity camera', () => {
    const c = new ViewportEditController();
    expect(c.getActiveViewportId()).toBeNull();
    expect(c.getEditCamera('vp-1')).toEqual(IDENTITY_EDIT_CAMERA);
  });

  it('rejects bad min/max zoom', () => {
    expect(() => new ViewportEditController({ minZoom: 0 })).toThrow();
    expect(() => new ViewportEditController({ minZoom: -1 })).toThrow();
    expect(() => new ViewportEditController({ minZoom: 1, maxZoom: 1 })).toThrow();
  });

  it('setActiveViewport fires the listener exactly when it changes', () => {
    const c = new ViewportEditController();
    const listener = vi.fn();
    c.onActiveChanged(listener);
    c.setActiveViewport('vp-1');
    c.setActiveViewport('vp-1');     // same — no-op
    c.setActiveViewport('vp-2');
    c.setActiveViewport(null);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener.mock.calls.map((c) => c[0])).toEqual(['vp-1', 'vp-2', null]);
  });

  it('pan() is a no-op when no viewport is active', () => {
    const c = new ViewportEditController();
    c.pan(100, 50);
    expect(c.getEditCamera('vp-1')).toEqual(IDENTITY_EDIT_CAMERA);
  });

  it('pan() accumulates world deltas on the active viewport', () => {
    const c = new ViewportEditController();
    c.setActiveViewport('vp-1');
    c.pan(100, 50);
    c.pan(-30, 10);
    const cam = c.getEditCamera('vp-1');
    expect(cam.panWorldX).toBe(70);
    expect(cam.panWorldY).toBe(60);
    expect(cam.zoom).toBe(1);
  });

  it('pan() does NOT bleed into other viewports', () => {
    const c = new ViewportEditController();
    c.setActiveViewport('vp-1'); c.pan(50, 0);
    c.setActiveViewport('vp-2');
    expect(c.getEditCamera('vp-2')).toEqual(IDENTITY_EDIT_CAMERA);
    expect(c.getEditCamera('vp-1').panWorldX).toBe(50);
  });

  it('zoom() multiplies the active viewport zoom and clamps', () => {
    const c = new ViewportEditController({ minZoom: 0.25, maxZoom: 4 });
    c.setActiveViewport('vp-1');
    c.zoom(2);  expect(c.getEditCamera('vp-1').zoom).toBe(2);
    c.zoom(2);  expect(c.getEditCamera('vp-1').zoom).toBe(4);
    c.zoom(2);  expect(c.getEditCamera('vp-1').zoom).toBe(4);   // clamped
    c.zoom(0.01); expect(c.getEditCamera('vp-1').zoom).toBe(0.25); // clamped
  });

  it('zoom() rejects bad factors', () => {
    const c = new ViewportEditController();
    c.setActiveViewport('vp-1');
    expect(() => c.zoom(0)).toThrow();
    expect(() => c.zoom(-1)).toThrow();
    expect(() => c.zoom(NaN)).toThrow();
  });

  it('resetActive() drops the active viewport camera back to identity', () => {
    const c = new ViewportEditController();
    c.setActiveViewport('vp-1');
    c.pan(10, 10); c.zoom(2);
    c.resetActive();
    expect(c.getEditCamera('vp-1')).toEqual(IDENTITY_EDIT_CAMERA);
  });

  it('forgetViewport() drops the camera + clears active when needed', () => {
    const c = new ViewportEditController();
    c.setActiveViewport('vp-1');
    c.pan(10, 10);
    c.forgetViewport('vp-1');
    expect(c.getEditCamera('vp-1')).toEqual(IDENTITY_EDIT_CAMERA);
    expect(c.getActiveViewportId()).toBeNull();
  });

  it('setEditCamera() restores a persisted camera (e.g. from clippingBox on open)', () => {
    const c = new ViewportEditController();
    c.setEditCamera('vp-9', { panWorldX: 200, panWorldY: -50, zoom: 1.5 });
    const cam = c.getEditCamera('vp-9');
    expect(cam.panWorldX).toBe(200);
    expect(cam.panWorldY).toBe(-50);
    expect(cam.zoom).toBe(1.5);
  });
});
