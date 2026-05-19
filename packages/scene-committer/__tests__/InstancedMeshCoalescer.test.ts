// InstancedMeshCoalescer unit test — ADR-046 · C04 §3.5 · Task 4.1
//
// Acceptance criteria verified here:
//   ✓ onBatchStart() snapshots pre-batch InstancedMesh UUIDs.
//   ✓ _coalesceInternal() merges ≥2 same-(level,geo,mat) IMs into 1 merged IM.
//   ✓ Source IMs are hidden (visible=false) after coalescing.
//   ✓ Merged IM has total instance count == sum of source counts.
//   ✓ resolveInstanceToElementId() maps instance index → ElementId correctly.
//   ✓ isMergedMesh() correctly identifies merged vs source IMs.
//   ✓ decoalesce() for one element: rebuilds merged IM with remaining sources.
//   ✓ decoalesce() when < 2 sources remain: destroys merged IM, restores sources.
//   ✓ dispose() tears down all groups and restores source visibility.
//   ✓ P3 invariant: no requestAnimationFrame used (scheduler mocked).

import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { InstancedMeshCoalescer } from '../src/InstancedMeshCoalescer.js';

// ── Mock @pryzm/frame-scheduler — P3: no rAF in tests ────────────────────
// scheduleOnce runs the callback synchronously and returns a no-op disposer.
vi.mock('@pryzm/frame-scheduler', () => ({
  getFrameScheduler: () => ({
    scheduleOnce: (_reason: string, cb: () => void, _priority: string) => {
      cb();
      return () => {};
    },
  }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────

function makeScene(): THREE.Scene {
  return new THREE.Scene();
}

/**
 * Add a wall Group with the given userData to the scene and return it.
 */
function makeWallGroup(
  scene: THREE.Scene,
  levelId: string,
  elementId: string,
): THREE.Group {
  const g = new THREE.Group();
  g.userData.levelId = levelId;
  g.userData.id = elementId;
  scene.add(g);
  return g;
}

/**
 * Add a THREE.InstancedMesh using shared geometry + material to a wall Group.
 * Sharing geometry/material ensures the same coalesce key is produced.
 */
function addIM(
  group: THREE.Group,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  count: number,
): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    m.makeTranslation(i, 0, 0);
    im.setMatrixAt(i, m);
  }
  im.instanceMatrix.needsUpdate = true;
  group.add(im);
  return im;
}

// ── Suite ─────────────────────────────────────────────────────────────────

describe('InstancedMeshCoalescer', () => {
  let scene: THREE.Scene;
  let geo: THREE.BoxGeometry;
  let mat: THREE.MeshStandardMaterial;
  let coalescer: InstancedMeshCoalescer;

  beforeEach(() => {
    scene = makeScene();
    // Shared geometry + material → same (levelId:geoUUID:matUUID) key.
    geo = new THREE.BoxGeometry(1, 1, 1);
    mat = new THREE.MeshStandardMaterial({ color: 0xaabbcc });
    coalescer = new InstancedMeshCoalescer(() => scene);
  });

  it('onBatchStart + _coalesceInternal merges 3 wall IMs into 1 merged IM', () => {
    // Snapshot an empty scene (no pre-existing IMs).
    coalescer.onBatchStart();

    // Add 3 wall Groups on the same level, each with the shared geo+mat.
    const g1 = makeWallGroup(scene, 'L1', 'wall-a');
    const g2 = makeWallGroup(scene, 'L1', 'wall-b');
    const g3 = makeWallGroup(scene, 'L1', 'wall-c');
    const im1 = addIM(g1, geo, mat, 2);  // 2 instances
    const im2 = addIM(g2, geo, mat, 3);  // 3 instances
    const im3 = addIM(g3, geo, mat, 4);  // 4 instances

    // onBatchEnd triggers scheduleOnce which (mocked) runs _coalesceInternal immediately.
    coalescer.onBatchEnd();

    // Source IMs are now hidden.
    expect(im1.visible).toBe(false);
    expect(im2.visible).toBe(false);
    expect(im3.visible).toBe(false);

    // Exactly 1 merged IM added to the scene root (not inside wall groups).
    const mergedIMs: THREE.InstancedMesh[] = [];
    scene.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh && (obj.userData as Record<string, unknown>).isCoalesced) {
        mergedIMs.push(obj);
      }
    });
    expect(mergedIMs).toHaveLength(1);

    // Total instance count = 2 + 3 + 4 = 9.
    expect(mergedIMs[0]!.count).toBe(9);
  });

  it('resolveInstanceToElementId maps each instance slot to its owning wall', () => {
    coalescer.onBatchStart();

    const g1 = makeWallGroup(scene, 'L1', 'wall-a');
    const g2 = makeWallGroup(scene, 'L1', 'wall-b');
    addIM(g1, geo, mat, 2);
    addIM(g2, geo, mat, 3);

    coalescer.onBatchEnd();

    // Find the merged IM.
    let mergedIM: THREE.InstancedMesh | undefined;
    scene.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh && (obj.userData as Record<string, unknown>).isCoalesced) {
        mergedIM = obj;
      }
    });
    expect(mergedIM).toBeDefined();

    // Slots 0–1 → wall-a (first 2 instances), slots 2–4 → wall-b (next 3).
    expect(coalescer.resolveInstanceToElementId(mergedIM!, 0)).toBe('wall-a');
    expect(coalescer.resolveInstanceToElementId(mergedIM!, 1)).toBe('wall-a');
    expect(coalescer.resolveInstanceToElementId(mergedIM!, 2)).toBe('wall-b');
    expect(coalescer.resolveInstanceToElementId(mergedIM!, 3)).toBe('wall-b');
    expect(coalescer.resolveInstanceToElementId(mergedIM!, 4)).toBe('wall-b');
  });

  it('isMergedMesh returns true for the merged IM and false for sources', () => {
    coalescer.onBatchStart();

    const g1 = makeWallGroup(scene, 'L1', 'wall-a');
    const g2 = makeWallGroup(scene, 'L1', 'wall-b');
    const im1 = addIM(g1, geo, mat, 2);
    const im2 = addIM(g2, geo, mat, 3);

    coalescer.onBatchEnd();

    let mergedIM: THREE.InstancedMesh | undefined;
    scene.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh && (obj.userData as Record<string, unknown>).isCoalesced) {
        mergedIM = obj;
      }
    });

    expect(coalescer.isMergedMesh(mergedIM!)).toBe(true);
    expect(coalescer.isMergedMesh(im1)).toBe(false);
    expect(coalescer.isMergedMesh(im2)).toBe(false);
  });

  it('decoalesce removes one element: rebuilds merged IM with remaining sources', () => {
    coalescer.onBatchStart();

    const g1 = makeWallGroup(scene, 'L1', 'wall-a');
    const g2 = makeWallGroup(scene, 'L1', 'wall-b');
    const g3 = makeWallGroup(scene, 'L1', 'wall-c');
    const im1 = addIM(g1, geo, mat, 2);
    addIM(g2, geo, mat, 3);
    addIM(g3, geo, mat, 4);

    coalescer.onBatchEnd();

    // Decoalesce wall-a (2 instances) → merged IM rebuilt with 3+4=7 instances.
    coalescer.decoalesce('wall-a');

    // Source IM for wall-a is restored to visible.
    expect(im1.visible).toBe(true);

    // A new merged IM exists for the remaining walls.
    const mergedIMs: THREE.InstancedMesh[] = [];
    scene.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh && (obj.userData as Record<string, unknown>).isCoalesced) {
        mergedIMs.push(obj);
      }
    });
    expect(mergedIMs).toHaveLength(1);
    expect(mergedIMs[0]!.count).toBe(7);
  });

  it('decoalesce when only 1 source remains: destroys merged IM and restores both sources', () => {
    coalescer.onBatchStart();

    const g1 = makeWallGroup(scene, 'L1', 'wall-a');
    const g2 = makeWallGroup(scene, 'L1', 'wall-b');
    const im1 = addIM(g1, geo, mat, 2);
    const im2 = addIM(g2, geo, mat, 3);

    coalescer.onBatchEnd();

    coalescer.decoalesce('wall-a');

    // Both sources should be restored (wall-b's source is also made visible again).
    expect(im1.visible).toBe(true);
    expect(im2.visible).toBe(true);

    // No merged IM should remain.
    const mergedIMs: THREE.InstancedMesh[] = [];
    scene.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh && (obj.userData as Record<string, unknown>).isCoalesced) {
        mergedIMs.push(obj);
      }
    });
    expect(mergedIMs).toHaveLength(0);
  });

  it('single-IM group (< 2 sources) is not coalesced', () => {
    coalescer.onBatchStart();

    // Only one wall on this level with the shared geo/mat.
    const g1 = makeWallGroup(scene, 'L2', 'wall-only');
    const im1 = addIM(g1, geo, mat, 5);

    coalescer.onBatchEnd();

    // Source should remain visible (not merged).
    expect(im1.visible).toBe(true);

    const mergedIMs: THREE.InstancedMesh[] = [];
    scene.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh && (obj.userData as Record<string, unknown>).isCoalesced) {
        mergedIMs.push(obj);
      }
    });
    expect(mergedIMs).toHaveLength(0);
  });

  it('dispose restores all source IMs to visible and removes merged IMs', () => {
    coalescer.onBatchStart();

    const g1 = makeWallGroup(scene, 'L1', 'wall-a');
    const g2 = makeWallGroup(scene, 'L1', 'wall-b');
    const im1 = addIM(g1, geo, mat, 2);
    const im2 = addIM(g2, geo, mat, 3);

    coalescer.onBatchEnd();

    // Sanity: merged, sources hidden.
    expect(im1.visible).toBe(false);
    expect(im2.visible).toBe(false);

    coalescer.dispose();

    expect(im1.visible).toBe(true);
    expect(im2.visible).toBe(true);

    const mergedIMs: THREE.InstancedMesh[] = [];
    scene.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh && (obj.userData as Record<string, unknown>).isCoalesced) {
        mergedIMs.push(obj);
      }
    });
    expect(mergedIMs).toHaveLength(0);
  });

  it('pre-existing IMs are not re-coalesced on second onBatchEnd', () => {
    // First batch: coalesce two walls.
    coalescer.onBatchStart();
    const g1 = makeWallGroup(scene, 'L1', 'wall-a');
    const g2 = makeWallGroup(scene, 'L1', 'wall-b');
    addIM(g1, geo, mat, 2);
    addIM(g2, geo, mat, 3);
    coalescer.onBatchEnd();

    // Second batch: only one new wall is added.
    // onBatchStart snapshots all existing IMs (including the hidden sources).
    const geo2 = new THREE.BoxGeometry(2, 2, 2); // different geo → different key
    const g3 = makeWallGroup(scene, 'L1', 'wall-c');
    const im3 = addIM(g3, geo2, mat, 1);

    coalescer.onBatchStart();
    coalescer.onBatchEnd();

    // im3 is a lone IM with a unique geo key — should NOT be merged.
    expect(im3.visible).toBe(true);

    // Only the 1 merged IM from the first batch should be present.
    const mergedIMs: THREE.InstancedMesh[] = [];
    scene.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh && (obj.userData as Record<string, unknown>).isCoalesced) {
        mergedIMs.push(obj);
      }
    });
    expect(mergedIMs).toHaveLength(1);
  });
});
