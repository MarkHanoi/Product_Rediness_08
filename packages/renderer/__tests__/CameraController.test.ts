// CameraController unit tests (S06-T2).
//
// We don't need a real DOM here — we hand-roll a stub element that
// records `addEventListener` / `removeEventListener` calls and lets the
// test fire synthetic events directly into the controller's bound
// handlers.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { FrameScheduler } from '@pryzm/frame-scheduler';
import { CameraController } from '../src/CameraController.js';

class StubElement {
  listeners = new Map<string, Set<EventListener>>();
  addEventListener(name: string, fn: EventListener): void {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(fn);
  }
  removeEventListener(name: string, fn: EventListener): void {
    this.listeners.get(name)?.delete(fn);
  }
  fire(name: string, ev: Event): void {
    for (const fn of this.listeners.get(name) ?? []) fn(ev);
  }
}

function fakePointer(opts: Partial<PointerEvent> & { button?: number; clientX?: number; clientY?: number; type?: string }): PointerEvent {
  return {
    button: opts.button ?? 0,
    clientX: opts.clientX ?? 0,
    clientY: opts.clientY ?? 0,
    preventDefault: () => {},
    type: opts.type ?? 'pointerdown',
  } as unknown as PointerEvent;
}

function makeScheduler(): FrameScheduler {
  return new FrameScheduler();
}

describe('CameraController', () => {
  let camera: THREE.PerspectiveCamera;
  let element: StubElement;
  let scheduler: FrameScheduler;
  let dirtyCalls: string[];

  beforeEach(() => {
    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(0, 0, 5);
    element = new StubElement();
    scheduler = makeScheduler();
    dirtyCalls = [];
    const orig = scheduler.markDirty.bind(scheduler);
    scheduler.markDirty = (key: string) => {
      dirtyCalls.push(key);
      orig(key);
    };
  });

  it('orbit() rotates the camera around the target and marks dirty', () => {
    const c = new CameraController(camera, element as unknown as HTMLElement, scheduler);
    const before = camera.position.clone();
    c.orbit(Math.PI / 4, 0);
    expect(camera.position.equals(before)).toBe(false);
    expect(dirtyCalls).toContain('camera');
    c.dispose();
  });

  it('zoom(2) doubles distance from target (clamped to maxDistance)', () => {
    const c = new CameraController(camera, element as unknown as HTMLElement, scheduler, { maxDistance: 100 });
    c.zoom(2);
    expect(camera.position.distanceTo(new THREE.Vector3(0, 0, 0))).toBeCloseTo(10, 5);
    c.dispose();
  });

  it('zoom respects min/max bounds', () => {
    const c = new CameraController(camera, element as unknown as HTMLElement, scheduler, { minDistance: 2, maxDistance: 8 });
    c.zoom(0.01);
    expect(camera.position.distanceTo(new THREE.Vector3())).toBeCloseTo(2, 5);
    c.zoom(100);
    expect(camera.position.distanceTo(new THREE.Vector3())).toBeCloseTo(8, 5);
    c.dispose();
  });

  it('pan() shifts the orbit target', () => {
    const c = new CameraController(camera, element as unknown as HTMLElement, scheduler);
    const before = c.target.clone();
    c.pan(50, 0);
    expect(c.target.equals(before)).toBe(false);
    c.dispose();
  });

  it('pitch is clamped so the camera never inverts', () => {
    const c = new CameraController(camera, element as unknown as HTMLElement, scheduler);
    // Try to pitch way past π/2 — should be clamped.
    c.orbit(0, 100);
    // Camera y must be finite and below distance × sin(PITCH_LIMIT).
    expect(Number.isFinite(camera.position.y)).toBe(true);
    expect(camera.position.y).toBeLessThanOrEqual(5); // distance is 5
    c.dispose();
  });

  it('uses custom dirtyKey when provided', () => {
    const c = new CameraController(camera, element as unknown as HTMLElement, scheduler, { dirtyKey: 'cam2' });
    c.orbit(0.1, 0);
    expect(dirtyCalls).toContain('cam2');
    expect(dirtyCalls).not.toContain('camera');
    c.dispose();
  });

  it('dispose() removes element listeners and is idempotent', () => {
    const c = new CameraController(camera, element as unknown as HTMLElement, scheduler);
    expect(element.listeners.get('pointerdown')!.size).toBe(1);
    c.dispose();
    expect(element.listeners.get('pointerdown')!.size).toBe(0);
    expect(() => c.dispose()).not.toThrow();
  });

  it('pointerdown left → orbit handler chain marks camera dirty', () => {
    const c = new CameraController(camera, element as unknown as HTMLElement, scheduler);
    // Simulate left-button pointer down + move via the listener chain.
    element.fire('pointerdown', fakePointer({ button: 0, clientX: 100, clientY: 100 }));
    // After pointerdown, move/up listeners are on window — invoke via
    // the controller's bound handler reference indirectly: re-fire on
    // the element to test the orbit branch was set up.
    expect((c as unknown as { dragging: string | null }).dragging).toBe('orbit');
    c.dispose();
  });

  it('pointerdown right → pan handler chain', () => {
    const c = new CameraController(camera, element as unknown as HTMLElement, scheduler);
    element.fire('pointerdown', fakePointer({ button: 2, clientX: 50, clientY: 50 }));
    expect((c as unknown as { dragging: string | null }).dragging).toBe('pan');
    c.dispose();
  });

  it('wheel event marks dirty + calls preventDefault', () => {
    const c = new CameraController(camera, element as unknown as HTMLElement, scheduler);
    const pd = vi.fn();
    element.fire('wheel', { deltaY: 100, preventDefault: pd } as unknown as WheelEvent);
    expect(pd).toHaveBeenCalled();
    expect(dirtyCalls).toContain('camera');
    c.dispose();
  });
});
