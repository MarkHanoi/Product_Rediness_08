// @vitest-environment happy-dom
/**
 * §PERF2-HOTLOG (L-1157) — the per-frame warnings must report the problem AND
 * its frequency, without costing a console write per frame.
 *
 * `guardTransformControlsAttachment()` is registered as a frame-scheduler
 * 'pre-render' tick listener ('selection-manager-gizmo-liveness-guard') and is
 * also called from the hover rAF. Its warning's own text said it was detaching
 * "to stop the per-frame flood" — while being the per-frame flood: at 60 Hz, a
 * synchronous formatting DevTools-serialising `console.warn` every frame for as
 * long as a stale gizmo persisted.
 *
 * ⚠ THE SIGNAL MUST SURVIVE THE FIX. Deleting the line would hide a real defect,
 * so it is throttled on a DECADE scale (1st, 10th, 100th, 1000th…) and every
 * surviving line carries its occurrence count. That is strictly MORE information
 * than the flood conveyed, because nobody counts 4,000 identical lines by eye.
 *
 * These tests drive the REAL production path — the same guard, through the same
 * public method, on the same fakes the §SELECT-GIZMO-REATTACH suite uses — not a
 * private helper poked directly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { SelectionManager, __resetHotLogCounts } from '../src/SelectionManager.js';

function makeWorld(scene: THREE.Scene) {
  const threeRenderer = {
    domElement: { clientWidth: 100, clientHeight: 100 },
    capabilities: { maxTextureSize: 4096 },
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    render: () => {},
    readRenderTargetPixels: () => {},
  };
  return { scene: { three: scene }, renderer: { three: threeRenderer } } as unknown as ConstructorParameters<typeof SelectionManager>[0];
}
function makeCamera() {
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  cam.position.set(0, 0, 5);
  return { three: cam } as unknown as ConstructorParameters<typeof SelectionManager>[1];
}
function makeTransformControls() {
  const tc: { object: THREE.Object3D | null; attach: ReturnType<typeof vi.fn>; detach: ReturnType<typeof vi.fn>; addEventListener: ReturnType<typeof vi.fn> } = {
    object: null, attach: vi.fn(), detach: vi.fn(), addEventListener: vi.fn(),
  };
  tc.attach.mockImplementation((o: THREE.Object3D) => { tc.object = o; });
  tc.detach.mockImplementation(() => { tc.object = null; });
  return tc;
}
function makeDom(): HTMLElement {
  return {
    style: {}, addEventListener: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  } as unknown as HTMLElement;
}

describe('§PERF2-HOTLOG — the per-frame gizmo warning is throttled, not silenced', () => {
  let scene: THREE.Scene;
  let tc: ReturnType<typeof makeTransformControls>;
  let mgr: SelectionManager;
  let warns: string[];

  beforeEach(() => {
    scene = new THREE.Scene();
    tc = makeTransformControls();
    mgr = new SelectionManager(
      makeWorld(scene), makeCamera(), makeDom(),
      tc as unknown as ConstructorParameters<typeof SelectionManager>[3],
      () => {},
    );
    warns = [];
    vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { warns.push(a.map(String).join(' ')); });
    __resetHotLogCounts();
  });
  afterEach(() => { vi.restoreAllMocks(); __resetHotLogCounts(); });

  /** One frame of the stale-gizmo condition: re-attach a detached object, then tick. */
  function frameWithStaleGizmo(i: number): void {
    const el = new THREE.Group();
    el.userData.id = `door-${i}`;
    scene.add(el);
    tc.attach(el);
    scene.remove(el);            // the rebuild that leaves the gizmo stale
    mgr.guardTransformControlsAttachment();
  }

  it('THE FIRST occurrence is reported immediately — a one-off defect is never swallowed', () => {
    frameWithStaleGizmo(0);
    const hits = warns.filter(w => w.includes('§SELECT-GIZMO-REATTACH'));
    expect(hits.length).toBe(1);
    expect(hits[0]).toContain('occurrence #1');
  });

  it('600 consecutive stale frames cost 3 lines, not 600', () => {
    for (let i = 0; i < 600; i++) frameWithStaleGizmo(i);
    const hits = warns.filter(w => w.includes('§SELECT-GIZMO-REATTACH'));
    // decades within 600: 1, 10, 100 → three lines.
    expect(hits.length).toBe(3);
    expect(hits[0]).toContain('occurrence #1');
    expect(hits[1]).toContain('occurrence #10');
    expect(hits[2]).toContain('occurrence #100');
  });

  it('⭐ the surviving lines carry the TRUE frequency — the count is the point', () => {
    // Without the count, a throttled log would understate a persistent defect,
    // which is the failure mode that makes throttling worse than flooding.
    for (let i = 0; i < 150; i++) frameWithStaleGizmo(i);
    const hits = warns.filter(w => w.includes('§SELECT-GIZMO-REATTACH'));
    expect(hits[hits.length - 1]).toContain('occurrence #100');
  });

  it('the GUARD ITSELF still fires every frame — only the logging is throttled', () => {
    // The throttle must never change behaviour. 600 stale frames = 600 detaches.
    for (let i = 0; i < 600; i++) frameWithStaleGizmo(i);
    expect(tc.detach.mock.calls.length).toBe(600);
  });

  it('a healthy scene logs nothing at all', () => {
    const el = new THREE.Group();
    el.userData.id = 'wall-1';
    scene.add(el);
    tc.attach(el);
    for (let i = 0; i < 600; i++) mgr.guardTransformControlsAttachment();
    expect(warns.filter(w => w.includes('§SELECT-GIZMO-REATTACH')).length).toBe(0);
  });
});
