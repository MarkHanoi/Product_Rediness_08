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

// ─────────────────────────────────────────────────────────────────────────────
// §UNDO93-COALESCED-IM-KEEPS-ITS-LEVEL (L-11320)
//
// The founder's console, production, 2026-08-25:
//   §LEVEL-COVERAGE exploded: ⚠ 166 of 615 drawn objects (27.0%) are in NO level
//   group … Worst: (unattributed)=97/131 … 97 also carry no userData.elementType.
//
// A merged IM is `scene.add()`-ed at the SCENE ROOT, so the level-coverage census
// can only count it as covered if it is ITSELF a level root — which needs a
// resolvable `levelId` on its own userData. The merge is BY level (the levelId is
// literally the first segment of the group key), so the value was always present
// and always discarded.
//
// ⚠ EACH ARM CARRIES ITS NEGATIVE CONTROL, so a green arm cannot mean "it always
// stamps": the disagreeing-sources arm asserts `elementType` is ABSENT while
// `levelId` is still present, which is the distinction the fix is built on.
// ─────────────────────────────────────────────────────────────────────────────

/** As `makeWallGroup`, but also declares the family the way a real builder does. */
function makeTypedWallGroup(
  scene: THREE.Scene,
  levelId: string,
  elementId: string,
  elementType: string | undefined,
): THREE.Group {
  const g = new THREE.Group();
  g.userData.levelId = levelId;
  g.userData.id = elementId;
  if (elementType !== undefined) g.userData.elementType = elementType;
  scene.add(g);
  return g;
}

/** The census's own coverage question, transcribed from
 *  `BottomActionMenu._censusLevelCoverage` / `_isBimObject` / `_objectLevelId`:
 *  a scene-root object is covered iff it can act as its own level root. */
function isOwnLevelRoot(obj: THREE.Object3D): boolean {
  const ud = obj.userData as Record<string, unknown>;
  if (ud.isHelper || ud.isPreview || ud.role === 'edges') return false;
  return typeof ud.levelId === 'string' && (ud.levelId as string).length > 0;
}

function mergedMeshes(scene: THREE.Scene): THREE.InstancedMesh[] {
  const out: THREE.InstancedMesh[] = [];
  scene.traverse((o) => {
    if (o instanceof THREE.InstancedMesh && (o.userData as Record<string, unknown>).isCoalesced) out.push(o);
  });
  return out;
}

describe('§UNDO93-COALESCED-IM-KEEPS-ITS-LEVEL (L-11320)', () => {
  let scene: THREE.Scene;
  let geo: THREE.BoxGeometry;
  let mat: THREE.MeshStandardMaterial;
  let coalescer: InstancedMeshCoalescer;

  beforeEach(() => {
    scene = new THREE.Scene();
    geo = new THREE.BoxGeometry(1, 1, 1);
    mat = new THREE.MeshStandardMaterial({ color: 0xaabbcc });
    coalescer = new InstancedMeshCoalescer(() => scene);
  });

  it('the merged product carries the levelId the merge was keyed BY — so it lifts on explode', () => {
    coalescer.onBatchStart();
    const a = makeTypedWallGroup(scene, 'level-7', 'cw-a', 'CurtainWall');
    const b = makeTypedWallGroup(scene, 'level-7', 'cw-b', 'CurtainWall');
    const imA = addIM(a, geo, mat, 2);
    const imB = addIM(b, geo, mat, 3);
    coalescer.onBatchEnd();

    const merged = mergedMeshes(scene);
    expect(merged).toHaveLength(1);
    const m = merged[0]!;

    // The product is a SCENE-ROOT child — this is what makes the stamp load-bearing.
    expect(m.parent).toBe(scene);
    expect((m.userData as Record<string, unknown>).levelId).toBe('level-7');
    expect((m.userData as Record<string, unknown>).elementType).toBe('CurtainWall');
    // The census's own predicate, executed.
    expect(isOwnLevelRoot(m)).toBe(true);

    // NEGATIVE CONTROL — the sources it replaced are hidden, so the merged mesh is
    // the ONLY visible carrier of this geometry. If it did not lift, nothing would.
    expect(imA.visible).toBe(false);
    expect(imB.visible).toBe(false);
  });

  it('sources that DISAGREE on elementType leave the field absent — but the level tag still lands', () => {
    coalescer.onBatchStart();
    const a = makeTypedWallGroup(scene, 'level-3', 'e-a', 'CurtainWall');
    const b = makeTypedWallGroup(scene, 'level-3', 'e-b', 'Wall');
    addIM(a, geo, mat, 1);
    addIM(b, geo, mat, 1);
    coalescer.onBatchEnd();

    const m = mergedMeshes(scene)[0]!;
    const ud = m.userData as Record<string, unknown>;
    // No invented aggregate word (C84 EI-9 — one vocabulary, not a second copy).
    expect(ud.elementType).toBeUndefined();
    // Coverage does not depend on the elementType half.
    expect(ud.levelId).toBe('level-3');
    expect(isOwnLevelRoot(m)).toBe(true);
  });

  it('a source whose parent declared no elementType does not fabricate one', () => {
    coalescer.onBatchStart();
    const a = makeTypedWallGroup(scene, 'level-1', 'u-a', undefined);
    const b = makeTypedWallGroup(scene, 'level-1', 'u-b', undefined);
    addIM(a, geo, mat, 1);
    addIM(b, geo, mat, 1);
    coalescer.onBatchEnd();

    const ud = mergedMeshes(scene)[0]!.userData as Record<string, unknown>;
    expect(ud.elementType).toBeUndefined();
    expect(ud.levelId).toBe('level-1');
  });

  it('⭐ the DECOALESCE rebuild keeps the stamp — the undo/redo half of the report', () => {
    coalescer.onBatchStart();
    const a = makeTypedWallGroup(scene, 'level-9', 'cw-a', 'CurtainWall');
    const b = makeTypedWallGroup(scene, 'level-9', 'cw-b', 'CurtainWall');
    const c = makeTypedWallGroup(scene, 'level-9', 'cw-c', 'CurtainWall');
    addIM(a, geo, mat, 2);
    addIM(b, geo, mat, 2);
    addIM(c, geo, mat, 2);
    coalescer.onBatchEnd();

    const before = mergedMeshes(scene)[0]!;
    expect((before.userData as Record<string, unknown>).levelId).toBe('level-9');

    // Delete one element → the group shrinks and a SECOND product is minted.
    coalescer.decoalesce('cw-b');

    const after = mergedMeshes(scene);
    expect(after).toHaveLength(1);
    const rebuilt = after[0]!;
    // Prove we are looking at the rebuilt object, not the original.
    expect(rebuilt).not.toBe(before);
    expect(rebuilt.count).toBe(4);
    expect(rebuilt.parent).toBe(scene);
    // THE ASSERTION: attribution survives the gesture.
    expect((rebuilt.userData as Record<string, unknown>).levelId).toBe('level-9');
    expect((rebuilt.userData as Record<string, unknown>).elementType).toBe('CurtainWall');
    expect(isOwnLevelRoot(rebuilt)).toBe(true);
  });
});
