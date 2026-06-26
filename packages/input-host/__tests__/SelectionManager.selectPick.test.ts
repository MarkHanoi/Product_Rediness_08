// @vitest-environment happy-dom
/**
 * §SELECT-INSTANCED-PICK — SelectionManager characterization tests for the
 * selection-spike fixes that live in this class:
 *
 *   FIX #2 (perf): the HOVER GPU pick passes { skipDepth: true }; the CLICK pick
 *     does NOT (clicks need depth for C04 §3 depth-sorted picks).
 *   FIX #3 (wrong-element): the hover-confirmed click anchor is cleared on a
 *     split-view visibility change, and a removed anchor target is treated stale.
 *   FIX #5 (cosmetic): an instanced-only element gets a real OBB highlight built
 *     from the per-instance extents, in the unified PRYZM purple (#6600FF).
 *
 * SelectionManager has heavy OBC/renderer deps, so we construct it with minimal
 * structural fakes and drive the specific methods directly. The constructor only
 * stores its params (no logic), so a fake World whose `scene.three` is a real
 * THREE.Scene is enough for the highlight + anchor paths.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { SelectionManager } from '../src/SelectionManager.js';

// ── Minimal structural fakes ────────────────────────────────────────────────

function makeWorld(scene: THREE.Scene) {
  // Minimal OBC renderer with a `.three` THREE-renderer-like object so
  // getThreeRenderer() / _buildGpuPickRenderer() succeed without a real GL ctx.
  const threeRenderer = {
    domElement: { clientWidth: 100, clientHeight: 100 },
    capabilities: { maxTextureSize: 4096 },
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    render: () => {},
    readRenderTargetPixels: () => {},
  };
  return {
    scene: { three: scene },
    renderer: { three: threeRenderer },
  } as unknown as ConstructorParameters<typeof SelectionManager>[0];
}

function makeCamera() {
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  cam.position.set(0, 0, 5);
  return { three: cam } as unknown as ConstructorParameters<typeof SelectionManager>[1];
}

function makeTransformControls() {
  return {
    attach: vi.fn(),
    detach: vi.fn(),
    addEventListener: vi.fn(),
  } as unknown as ConstructorParameters<typeof SelectionManager>[3];
}

function makeDom(): HTMLElement {
  // happy-dom is not enabled (node env); a structural stub is enough for the
  // methods under test — they never touch real layout here.
  return {
    style: {},
    addEventListener: vi.fn(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
  } as unknown as HTMLElement;
}

function makeManager(scene: THREE.Scene): SelectionManager {
  return new SelectionManager(
    makeWorld(scene),
    makeCamera(),
    makeDom(),
    makeTransformControls(),
    () => {},
  );
}

/** A fake InstancedElementRenderer group with the userData contract the real
 *  renderer stamps: synthetic id, per-instance element ids + OBB. */
function makeInstancedGroup(scene: THREE.Scene, elementIds: string[]): THREE.InstancedMesh {
  const geo = new THREE.BoxGeometry(0.4, 3, 0.4);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(), elementIds.length);
  im.count = elementIds.length;
  const obbs = new Map<number, {
    center: { x: number; y: number; z: number };
    size: { x: number; y: number; z: number };
    quaternion: { x: number; y: number; z: number; w: number };
  }>();
  elementIds.forEach((_, i) => {
    obbs.set(i, {
      center: { x: i * 2, y: 1.5, z: 0 },
      size: { x: 0.4, y: 3, z: 0.4 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
    });
  });
  im.userData.id = 'instanced-group-key';
  im.userData.isInstancedGroup = true;
  im.userData.elementType = 'column';
  im.userData.getOccupiedInstanceSlots = () => elementIds.map((_, i) => i);
  im.userData.getInstanceElementId = (s: number) => elementIds[s];
  im.userData.getInstanceObb = (s: number) => obbs.get(s);
  scene.add(im);
  return im;
}

// ── FIX #2 — hover skipDepth / click full-depth ─────────────────────────────

describe('SelectionManager FIX #2 — hover skipDepth, click full depth', () => {
  it('the HOVER rAF requests skipDepth: true and the CLICK does not', () => {
    const scene = new THREE.Scene();
    const mgr = makeManager(scene);

    const calls: Array<{ opts: { skipDepth?: boolean } | undefined }> = [];
    const strategy = {
      id: 'gpu-pick' as const,
      available: true,
      pick: (_p: unknown, _ctx: unknown, opts?: { skipDepth?: boolean }) => {
        calls.push({ opts });
        return null; // miss — keeps the code paths short
      },
      pickRect: () => [],
      probeAvailability: () => ({ ok: true }),
      dispose: () => {},
    };
    mgr.setPickStrategy(strategy as never);

    // Drive the hover rAF directly.
    (mgr as unknown as { _pendingHoverClientX: number })._pendingHoverClientX = 50;
    (mgr as unknown as { _pendingHoverClientY: number })._pendingHoverClientY = 50;
    (mgr as unknown as { _onHoverGpuPickRaf: () => void })._onHoverGpuPickRaf();

    // Drive a click pick.
    (mgr as unknown as { performSelection: (e: MouseEvent) => void }).performSelection({
      button: 0, clientX: 50, clientY: 50,
    } as MouseEvent);

    const hoverCall = calls.find((c) => c.opts?.skipDepth === true);
    const clickCall = calls.find((c) => c.opts === undefined || c.opts.skipDepth !== true);
    expect(hoverCall, 'hover pick must pass skipDepth:true').toBeTruthy();
    expect(clickCall, 'click pick must NOT pass skipDepth').toBeTruthy();
  });
});

// ── FIX #3 — anchor cleared on split-view visibility + stale liveness ────────

describe('SelectionManager FIX #3 — hover anchor lifecycle (§SELECT-SVP3D-ANCHOR-SKIP)', () => {
  let scene: THREE.Scene;
  let mgr: SelectionManager;
  beforeEach(() => {
    scene = new THREE.Scene();
    mgr = makeManager(scene);
  });

  it('clearHoverAnchor() clears the confirmed coords and the GPU-confirmed ref', () => {
    const m = mgr as unknown as {
      _lastHoverConfirmedClientX: number | null;
      _lastHoverConfirmedClientY: number | null;
      _lastHoveredObjectGpu: THREE.Object3D | null;
      clearHoverAnchor: () => void;
    };
    m._lastHoverConfirmedClientX = 120;
    m._lastHoverConfirmedClientY = 80;
    m._lastHoveredObjectGpu = new THREE.Object3D();

    mgr.clearHoverAnchor();

    expect(m._lastHoverConfirmedClientX).toBeNull();
    expect(m._lastHoverConfirmedClientY).toBeNull();
    expect(m._lastHoveredObjectGpu).toBeNull();
  });

  it('a removed anchor target is reported stale and the anchor is cleared', () => {
    const m = mgr as unknown as {
      _lastHoveredObjectGpu: THREE.Object3D | null;
      _lastHoverConfirmedClientX: number | null;
      _anchorTargetIsStale: () => boolean;
    };

    // Detached object (never added to scene) → stale.
    const detached = new THREE.Object3D();
    m._lastHoveredObjectGpu = detached;
    m._lastHoverConfirmedClientX = 50;
    expect(m._anchorTargetIsStale()).toBe(true);
    expect(m._lastHoveredObjectGpu).toBeNull();
    expect(m._lastHoverConfirmedClientX).toBeNull();

    // Attached object → not stale.
    const attached = new THREE.Object3D();
    scene.add(attached);
    m._lastHoveredObjectGpu = attached;
    expect(m._anchorTargetIsStale()).toBe(false);
    expect(m._lastHoveredObjectGpu).toBe(attached);
  });
});

// ── FIX #5 — instanced-only highlight from the per-instance OBB ──────────────

describe('SelectionManager FIX #5 — instanced-only highlight is a real OBB (#6600FF)', () => {
  it('applyHighlight builds a purple OBB for an instanced-only element, not the AABB fallback', () => {
    const scene = new THREE.Scene();
    const mgr = makeManager(scene);
    const group = makeInstancedGroup(scene, ['col-0', 'col-1', 'col-2']);

    // Select instance col-2 (source slot 2): centre (4, 1.5, 0), box 0.4×3×0.4.
    mgr.applyHighlight(group, 'col-2');

    const hl = (mgr as unknown as { highlightMesh: THREE.Object3D | null }).highlightMesh;
    expect(hl, 'a highlight must be produced').not.toBeNull();
    expect(hl).toBeInstanceOf(THREE.Mesh);

    const mesh = hl as THREE.Mesh;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    // Unified PRYZM purple.
    expect(mat.color.getHex()).toBe(0x6600ff);
    // Strong fill, not the faint 0.15 fallback box.
    expect(mat.opacity).toBeGreaterThan(0.15);

    // Positioned at the SELECTED instance's centre (4,1.5,0), NOT the group union.
    expect(mesh.position.x).toBeCloseTo(4, 5);
    expect(mesh.position.y).toBeCloseTo(1.5, 5);

    // The box matches the single instance (≈0.4 wide), not the 3-column union (≈4 wide).
    const params = (mesh.geometry as THREE.BoxGeometry).parameters;
    expect(params.width).toBeLessThan(1);
  });

  it('falls through to the generic path when no instance id is supplied', () => {
    const scene = new THREE.Scene();
    const mgr = makeManager(scene);
    const group = makeInstancedGroup(scene, ['col-0']);
    // No instanceElementId → must NOT throw; falls to the generic highlight path.
    expect(() => mgr.applyHighlight(group)).not.toThrow();
  });
});
