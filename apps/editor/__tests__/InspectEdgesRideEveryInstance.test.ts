// @vitest-environment happy-dom
//
// §INSPECT-EDGES-RIDE-EVERY-INSTANCE (L-12140), 2026-08-26 — lane INSPECT133.
//
// ── THE FOUNDER'S SENTENCE, WHICH IS THE SPEC ─────────────────────────────────
//
//   *"Check the Inspect view — it feels like the mullions on the curtain panel are
//    not rendering properly."*
//
// His screenshots (Inspect, X-Ray lens, "Stacked" level view) show long thin
// OPAQUE CYAN vertical sticks standing through the otherwise ghosted model and
// **hanging far below the floor plates they belong to** — dangling past several
// storeys, with a green arrow pointing at one.
//
// ── WHAT THESE TESTS PIN, AND WHY EACH ONE EXISTS ────────────────────────────
//
// ⭐ THE MULLIONS WERE NEVER WRONG. They are correct in Author, in plan, and in
// Inspect — `CurtainWallBuilder.ts:1283` lifts every instance by `cw.height / 2`
// so each real mullion spans [0, height] in group space. What the founder saw is
// the Inspect ghost lens's OWN cyan edge overlay (`GHOST_EDGE_COLOR = 0x00e5ff`)
// landing where no mullion is.
//
// ⛔ THE MECHANISM: the overlay was `new THREE.EdgesGeometry(obj.geometry)` added
// as a CHILD of the mullion rack. **A non-instanced child of an `InstancedMesh` is
// drawn ONCE, at the parent's own transform** — `instanceMatrix` applies to that
// mesh's draw call and to nothing else. The rack's base geometry is a CENTRED
// `BoxGeometry(mullionSize, cw.height, mullionSize)`, so the outline rendered at
// the UN-lifted centred box: spanning `[worldY − height/2, worldY + height/2]`,
// i.e. exactly half a wall height BELOW the storey's floor plate.
//
// ⚠ IT IS NOT "the lens skips instanced meshes". `THREE.InstancedMesh extends
// THREE.Mesh`, so every `obj instanceof THREE.Mesh` guard in
// `DiagnosticMaterialManager` admits it and the rack DOES get its ghost material.
// Only the DERIVED EDGE OVERLAY was instance-blind. A test aimed at the traversal
// guards would have passed on HEAD and proved nothing.
//
// ⛔ THE DIFFERENTIATING ASSERTION is §1: the overlay's WORLD-SPACE vertical extent
// must lie inside the host curtain wall's storey band. The fixture is deliberately
// placed at a NON-GROUND storey (`worldY = 6`), because at ground level the
// downward dangle would fall below y=0 where a lenient bound could hide it.
//
// ⚠ VERIFIED FAILING ON HEAD by controlled revert (C01 §6 rule 6): the two lane
// files were set aside, the pre-lane `_applyGhostToNonRoomMesh` edge branch
// restored inline, this suite re-run — §1 and §2 fail, §3/§4 pass — and the
// originals put back. The reading is in the ISSUE-LOG L-12140 row.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
  getFrameScheduler,
  _resetFrameSchedulerForTest,
  FakeRafAdapter,
} from '@pryzm/frame-scheduler';
import type { DeltaMap } from '@pryzm/core-app-model';
import { DiagnosticMaterialManager } from '../src/engine/inspect/DiagnosticMaterialManager.js';

// The palette value under test, restated as a LITERAL on purpose: importing the
// module constant would make the test agree with the implementation by
// construction. This is the colour the founder photographed.
const GHOST_EDGE_CYAN = 0x00e5ff;

const EMPTY_DELTA: Readonly<DeltaMap> = new Map() as unknown as Readonly<DeltaMap>;

// ── The real curtain-wall recipe, copied from CurtainWallBuilder ──────────────

const MULLION_SIZE = 0.05;   // cw.mullionSize
const CW_HEIGHT    = 3.0;    // cw.height
const CW_LENGTH    = 4.0;    // the wall's length
const STOREY_Y     = 6.0;    // group.position.y — level 2, NOT ground (see header)
const U_LINES      = [0, 0.5, 1];  // three vertical mullions, as grid.uLines

interface Fixture {
  scene:     THREE.Scene;
  group:     THREE.Group;
  rack:      THREE.InstancedMesh;
  plainWall: THREE.Mesh;
}

/**
 * A curtain wall built exactly as `CurtainWallBuilder._buildOne` builds it:
 * a centred box geometry, instances lifted by `height / 2`, the rack stamped
 * `elementType: 'CurtainWallPart'` (which `STRUCTURAL_TYPE_FRAGMENTS` matches on
 * the substring `'wall'`, so the ghost lens classifies it `'structural'` and gives
 * it the cyan edge overlay).
 */
function buildScene(): Fixture {
  const scene = new THREE.Scene();

  const group = new THREE.Group();
  group.userData = {
    id: 'cw_1', type: 'curtain-wall', elementType: 'CurtainWall', levelId: 'L2',
  };
  // ── 10. Position in world space — the storey band starts here.
  group.position.set(0, STOREY_Y, 0);

  // ── 9. Vertical mullion rack (CurtainWallBuilder.ts:1262-1288).
  const vGeo = new THREE.BoxGeometry(MULLION_SIZE, CW_HEIGHT, MULLION_SIZE); // CENTRED
  const rack = new THREE.InstancedMesh(
    vGeo,
    new THREE.MeshStandardMaterial({ color: 0x888888 }),
    U_LINES.length,
  );
  rack.userData = {
    elementType: 'CurtainWallPart',
    role:        'mullion-v-instanced',
    parentId:    'cw_1',
    isSubElement: true,
  };
  const dummy = new THREE.Object3D();
  U_LINES.forEach((t, i) => {
    const x = t * CW_LENGTH - CW_LENGTH / 2;
    dummy.position.set(x, CW_HEIGHT / 2, 0);   // the lift that makes Author correct
    dummy.updateMatrix();
    rack.setMatrixAt(i, dummy.matrix);
  });
  rack.instanceMatrix.needsUpdate = true;
  group.add(rack);
  scene.add(group);

  // ── The CONTROL: an ordinary, non-instanced structural wall. Its treatment must
  // be byte-identical to what it was before the lane, or the fix traded one view
  // for another.
  const plainWall = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x998877 }),
  );
  plainWall.userData = { id: 'wall_W1', type: 'wall', elementType: 'wall', levelId: 'L2' };
  plainWall.position.set(10, STOREY_Y + 1.5, 0);
  scene.add(plainWall);

  return { scene, group, rack, plainWall };
}

/** The cyan `LineSegments` the ghost lens parented onto `mesh`, if any. */
function cyanOverlayOf(mesh: THREE.Object3D): THREE.LineSegments | null {
  const hit = mesh.children.find(c =>
    (c as THREE.LineSegments).isLineSegments === true &&
    ((c as THREE.LineSegments).material as THREE.LineBasicMaterial).color.getHex() === GHOST_EDGE_CYAN,
  );
  return (hit as THREE.LineSegments) ?? null;
}

/** World-space Y range of every vertex the overlay actually draws. */
function worldYRange(line: THREE.LineSegments): { min: number; max: number } {
  line.updateWorldMatrix(true, false);
  const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(line.matrixWorld);
    if (v.y < min) min = v.y;
    if (v.y > max) max = v.y;
  }
  return { min, max };
}

function vertexCount(line: THREE.LineSegments): number {
  return (line.geometry.getAttribute('position') as THREE.BufferAttribute).count;
}

let fake: FakeRafAdapter;

describe('§INSPECT-EDGES-RIDE-EVERY-INSTANCE (L-12140) — the mullion outline stays on its storey', () => {
  beforeEach(() => {
    _resetFrameSchedulerForTest();
    fake = new FakeRafAdapter();
    getFrameScheduler().start(fake);
  });

  afterEach(() => {
    getFrameScheduler().stop();
    _resetFrameSchedulerForTest();
  });

  // ── §0 — THE AUTHOR-MODE HALF: the mullions themselves were never wrong ────
  //
  // ⭐ THIS IS THE ASSERTION THAT SPLITS THE PROBLEM IN TWO, and it must keep
  // passing forever. It runs with NO lens applied — the geometry as Author mode
  // draws it — and pins every real mullion inside its host wall's storey band.
  // If this ever fails, the defect has moved to the BUILDER and the fix belongs
  // in `CurtainWallBuilder`, not here.
  it('AUTHOR MODE: every real mullion instance already sits inside its storey band', () => {
    const f = buildScene();
    f.scene.updateMatrixWorld(true);

    // The rack's base geometry is CENTRED — on its own it spans [−1.5, +1.5].
    // What makes Author correct is the per-instance lift of `height / 2`.
    const local = new THREE.Box3().setFromBufferAttribute(
      f.rack.geometry.getAttribute('position') as THREE.BufferAttribute,
    );
    expect(local.min.y).toBeCloseTo(-CW_HEIGHT / 2, 5);   // the centred base box…
    expect(local.max.y).toBeCloseTo(+CW_HEIGHT / 2, 5);   // …which is NOT where a mullion is

    const m = new THREE.Matrix4();
    const box = new THREE.Box3();
    for (let i = 0; i < f.rack.count; i++) {
      f.rack.getMatrixAt(i, m);
      const inst = local.clone().applyMatrix4(m).applyMatrix4(f.rack.matrixWorld);
      box.union(inst);
    }
    // [6, 9] — flush with the floor plate, exactly one storey tall. No dangle.
    expect(box.min.y).toBeCloseTo(STOREY_Y, 5);
    expect(box.max.y).toBeCloseTo(STOREY_Y + CW_HEIGHT, 5);
  });

  // ── §1 — THE FOUNDER'S DEFECT, AS GEOMETRY ─────────────────────────────────
  it("keeps the cyan mullion outline inside its host wall's storey band — it no longer dangles below the plate", () => {
    const f = buildScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.applyLens('ghost', EMPTY_DELTA, f.scene);
    fake.pumpFrames(3);
    f.scene.updateMatrixWorld(true);

    const overlay = cyanOverlayOf(f.rack);
    expect(overlay).not.toBeNull();

    const { min, max } = worldYRange(overlay!);

    // The storey band of THIS curtain wall: [worldY, worldY + height] = [6, 9].
    // On HEAD the overlay spanned [4.5, 7.5] — 1.5 m of cyan hanging BELOW the
    // floor plate, which is the stalactite in the screenshot.
    expect(min).toBeGreaterThanOrEqual(STOREY_Y - 1e-6);
    expect(max).toBeLessThanOrEqual(STOREY_Y + CW_HEIGHT + 1e-6);
  });

  // ── §2 — EVERY instance is outlined, not just a phantom base box ────────────
  it('draws one outline per LIVE instance — the rack is not represented by a single un-transformed box', () => {
    const f = buildScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.applyLens('ghost', EMPTY_DELTA, f.scene);
    fake.pumpFrames(3);

    const overlay = cyanOverlayOf(f.rack)!;
    const perInstance = new THREE.EdgesGeometry(f.rack.geometry)
      .getAttribute('position').count;

    // On HEAD this was `perInstance` — ONE box for a three-mullion rack.
    expect(vertexCount(overlay)).toBe(perInstance * U_LINES.length);

    // And the outlines stand where the mullions stand: three distinct X columns.
    overlay.updateWorldMatrix(true, false);
    const pos = overlay.geometry.getAttribute('position') as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    const xs = new Set<string>();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(overlay.matrixWorld);
      xs.add(v.x.toFixed(3));
    }
    // Each mullion contributes two X faces (±mullionSize/2) → 3 mullions = 6 planes.
    expect(xs.size).toBe(U_LINES.length * 2);
  });

  // ── §3 — THE CONTROL: the plain-Mesh path is untouched ─────────────────────
  it('treats an ordinary non-instanced wall exactly as before — same outline, same place', () => {
    const f = buildScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.applyLens('ghost', EMPTY_DELTA, f.scene);
    fake.pumpFrames(3);
    f.scene.updateMatrixWorld(true);

    const overlay = cyanOverlayOf(f.plainWall);
    expect(overlay).not.toBeNull();

    // Byte-for-byte the geometry the old inline `new THREE.EdgesGeometry(...)` built.
    const expected = new THREE.EdgesGeometry(f.plainWall.geometry)
      .getAttribute('position').count;
    expect(vertexCount(overlay!)).toBe(expected);

    // And it still hugs the wall it outlines: a 3 m wall centred at y = 7.5.
    const { min, max } = worldYRange(overlay!);
    expect(min).toBeCloseTo(STOREY_Y, 5);
    expect(max).toBeCloseTo(STOREY_Y + CW_HEIGHT, 5);
  });

  // ── §4 — a PARKED (soft-deleted) instance contributes no outline ────────────
  it('skips zero-scale parked slots — InstanceGroup keeps count as a high-water mark', () => {
    const f = buildScene();

    // `InstanceGroup.removeInstance()` soft-deletes by writing a ZERO-SCALE matrix
    // into the slot while `mesh.count` stays put (InstanceGroup.ts:146,167-174).
    // The parked instance draws nothing, so it must be outlined by nothing.
    f.rack.setMatrixAt(1, new THREE.Matrix4().makeScale(0, 0, 0));
    f.rack.instanceMatrix.needsUpdate = true;

    const mgr = new DiagnosticMaterialManager();
    mgr.applyLens('ghost', EMPTY_DELTA, f.scene);
    fake.pumpFrames(3);

    const overlay = cyanOverlayOf(f.rack)!;
    const perInstance = new THREE.EdgesGeometry(f.rack.geometry)
      .getAttribute('position').count;

    expect(vertexCount(overlay)).toBe(perInstance * (U_LINES.length - 1));

    // Nothing collapsed onto the parked origin — no cyan speck at the rack's centre.
    overlay.updateWorldMatrix(true, false);
    const pos = overlay.geometry.getAttribute('position') as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    let atOrigin = 0;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (v.lengthSq() < 1e-9) atOrigin++;
    }
    expect(atOrigin).toBe(0);
  });
});
