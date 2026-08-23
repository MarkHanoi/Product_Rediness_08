// @vitest-environment happy-dom
//
// §INSPECT-FOCUS-IS-ELEMENT-SHAPED (L-8200..L-8280), 2026-08-23 — lane INSP46.
//
// ── THE FOUNDER'S SENTENCE, WHICH IS THE SPEC ─────────────────────────────────
//
//   *"INSPECT TAB: when I select the room, it highlights in the 3-D view in inspect
//    mode and works perfect. However, when I select a wall it highlights for a
//    second — or less — and stops being highlighted."*
//
// ── WHAT THESE TESTS PIN, AND WHY EACH ONE EXISTS ────────────────────────────
//
// ⭐ The defect was NOT a race and NOT a rival event. It was that
// `DiagnosticMaterialManager` carried ONE focus parameter, named `selectedRoomId`,
// and every lens decided emphasis with `ud.isRoomVolume && ud.roomId ===
// selectedRoomId`. A wall mesh has no `roomId` and is not `isRoomVolume`, so that
// comparison is UNREACHABLE FOR A WALL BY CONSTRUCTION — there is no scene in which
// it can be true. Rooms "work perfect" because the jewel is RE-MINTED BY THE LENS on
// every apply; a wall's only emphasis was `SelectionManager`'s purple overlay, which
// lives OUTSIDE the lens and which the next lens pass repaints at the 4%
// non-structural ghost weight (a highlight clone carries `isHelper`/`sharedGeometry`
// and NO `type`, so `resolveGhostRole` classifies it `'non-structural'`).
// One frame. That is the "second — or less", measured rather than guessed.
//
// ⛔ THE ASSERTION THAT MAKES THIS SUITE DIFFERENTIATING is §2: apply, let the frame
// run, then apply AGAIN — the exact re-apply the founder's own console shows
// happening one line after his wall was selected — and require the wall to STILL be
// emphasised. A test that only checked the first frame would have passed against the
// purple overlay too, and would have proved nothing.
//
// ⚠ VERIFIED FAILING ON HEAD by controlled revert (C01 §6 rule 6): the four lane
// files were copied aside, the `bb62a15c` versions restored in place, this suite
// re-run, and the originals put back — see the ISSUE-LOG L-8200 row for the reading.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
  getFrameScheduler,
  _resetFrameSchedulerForTest,
  FakeRafAdapter,
} from '@pryzm/frame-scheduler';
import type { DeltaMap } from '@pryzm/core-app-model';
import { DiagnosticMaterialManager } from '../src/engine/inspect/DiagnosticMaterialManager.js';
import { resolveFocusRole, toFocusSet, EMPTY_FOCUS } from '../src/engine/inspect/inspectFocus.js';

// The palette values under test, restated here as LITERALS on purpose: importing the
// module constants would make the test agree with the implementation by construction
// and pass even if both moved together. These are the numbers the founder sees.
const INSPECT_BLUE          = 0x00aaff; // §INSPECT-FOCUS-IS-THE-ONLY-COLOUR (L-3511)
const VIOLET_ROOM_JEWEL     = 0x8b5cf6; // §1.3 selected jewel
const GHOST_STRUCTURAL_HEX  = 0xc0e0ff; // §1.1 structural frosted ghost
const FOCUS_EDGE_WHITE      = 0xffffff; // §INSPECT-FOCUS-IS-ELEMENT-SHAPED outline

const EMPTY_DELTA: Readonly<DeltaMap> = new Map() as unknown as Readonly<DeltaMap>;

// ── Fixture ───────────────────────────────────────────────────────────────────

interface Fixture {
  scene:        THREE.Scene;
  wallMesh:     THREE.Mesh;
  roomVolume:   THREE.Mesh;
  doorSubMesh:  THREE.Mesh;  // untagged child of a door GROUP — exercises the ancestor walk
  hitProxy:     THREE.Mesh;  // invisible selection proxy — must NEVER be painted
  highlightClone: THREE.Mesh; // a SelectionManager-shaped overlay clone at the scene root
}

function buildScene(): Fixture {
  const scene = new THREE.Scene();

  // A wall, exactly as WallBuilder stamps it.
  const wallMesh = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x998877 }),
  );
  wallMesh.userData = { id: 'wall_W1', type: 'wall', elementType: 'wall', levelId: 'L0' };
  scene.add(wallMesh);

  // A second wall — nothing selects it, so it must stay ghosted. This is what
  // stops the focus pass from being "paint everything blue" and passing anyway.
  const otherWall = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x998877 }),
  );
  otherWall.userData = { id: 'wall_W2', type: 'wall', elementType: 'wall', levelId: 'L0' };
  scene.add(otherWall);

  // A room volume, as the room builder stamps it (`roomId` is its identity here).
  const roomVolume = new THREE.Mesh(
    new THREE.BoxGeometry(5, 2.7, 4),
    new THREE.MeshPhongMaterial({ color: 0x223344 }),
  );
  roomVolume.userData = { isRoomVolume: true, roomId: 'room-A', id: 'room-A' };
  scene.add(roomVolume);

  // A door GROUP with an untagged sub-mesh — C15: a hosted element is a group and
  // its sub-meshes carry no id of their own, so focus must resolve up the chain.
  const doorGroup = new THREE.Group();
  doorGroup.userData = { id: 'door_D1', elementType: 'door', type: 'door' };
  const doorSubMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 2.1, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x442200 }),
  );
  doorSubMesh.userData = {}; // deliberately empty
  doorGroup.add(doorSubMesh);
  // The invisible hit proxy the builders leave beside it (L-2031).
  const hitProxy = new THREE.Mesh(
    new THREE.BoxGeometry(1, 2.2, 0.3),
    new THREE.MeshBasicMaterial({ colorWrite: false }),
  );
  hitProxy.userData = { role: 'hit-proxy' };
  doorGroup.add(hitProxy);
  scene.add(doorGroup);

  // A `SelectionManager._buildGeometryHighlight`-shaped overlay clone: shares the
  // wall's geometry, purple, `isHelper` + `sharedGeometry`, NO type, parented at the
  // SCENE ROOT. Present so the suite records the real mechanism rather than a
  // sanitised one.
  const highlightGroup = new THREE.Group();
  highlightGroup.name = 'selection-highlight-overlay';
  highlightGroup.userData = { isHelper: true };
  const highlightClone = new THREE.Mesh(
    wallMesh.geometry,
    new THREE.MeshBasicMaterial({ color: 0x6600ff, transparent: true, opacity: 0.4 }),
  );
  highlightClone.userData = { isHelper: true, sharedGeometry: true };
  highlightGroup.add(highlightClone);
  scene.add(highlightGroup);

  return { scene, wallMesh, roomVolume, doorSubMesh, hitProxy, highlightClone };
}

function hexOf(mesh: THREE.Mesh): number {
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return (mat as THREE.MeshPhongMaterial).color.getHex();
}

/** True when `mesh` carries a `LineSegments` child in the focus outline colour. */
function hasFocusOutline(mesh: THREE.Mesh): boolean {
  return mesh.children.some(c =>
    (c as THREE.LineSegments).isLineSegments === true &&
    ((c as THREE.LineSegments).material as THREE.LineBasicMaterial).color.getHex() === FOCUS_EDGE_WHITE,
  );
}

let fake: FakeRafAdapter;

function runFrames(n = 3): void {
  fake.pumpFrames(n);
}

describe('§INSPECT-FOCUS-IS-ELEMENT-SHAPED (L-8200) — a focused wall stays focused', () => {
  beforeEach(() => {
    _resetFrameSchedulerForTest();
    fake = new FakeRafAdapter();
    getFrameScheduler().start(fake);
  });

  afterEach(() => {
    getFrameScheduler().stop();
    _resetFrameSchedulerForTest();
  });

  // ── §1 — the wall is emphasised AT ALL ─────────────────────────────────────
  it('paints a focused WALL in the Inspect blue — the arm that did not exist', () => {
    const f = buildScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.applyLens('ghost', EMPTY_DELTA, f.scene, ['wall_W1']);
    runFrames();

    expect(hexOf(f.wallMesh)).toBe(INSPECT_BLUE);
    expect(hasFocusOutline(f.wallMesh)).toBe(true);
  });

  // ── §2 — THE DIFFERENTIATING TEST: it survives the NEXT frame ──────────────
  it('KEEPS the wall emphasised across a re-apply one frame later', () => {
    const f = buildScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.applyLens('ghost', EMPTY_DELTA, f.scene, ['wall_W1']);
    runFrames();
    expect(hexOf(f.wallMesh)).toBe(INSPECT_BLUE);

    // The re-apply the founder's console shows one line after his wall was
    // selected (a discovery re-render, a delta update, a second selection event).
    // Under the old code this is the frame the emphasis died in.
    mgr.applyLens('ghost', EMPTY_DELTA, f.scene, ['wall_W1']);
    runFrames();

    expect(hexOf(f.wallMesh)).toBe(INSPECT_BLUE);
    expect(hasFocusOutline(f.wallMesh)).toBe(true);
  });

  // ── §3 — it NAMES the wall: only the focused element is emphasised ─────────
  it('emphasises ONLY the focused id — the other wall stays ghosted', () => {
    const f = buildScene();
    const otherWall = f.scene.children.find(
      c => (c.userData as { id?: string }).id === 'wall_W2',
    ) as THREE.Mesh;
    const mgr = new DiagnosticMaterialManager();

    mgr.applyLens('ghost', EMPTY_DELTA, f.scene, ['wall_W1']);
    runFrames();

    expect(hexOf(f.wallMesh)).toBe(INSPECT_BLUE);
    expect(hexOf(otherWall)).toBe(GHOST_STRUCTURAL_HEX);
    expect(hasFocusOutline(otherWall)).toBe(false);
  });

  // ── §4 — the room jewel is UNCHANGED (the half that "works perfect") ───────
  it('still paints a focused ROOM as the violet jewel, not the solid blue', () => {
    const f = buildScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.applyLens('ghost', EMPTY_DELTA, f.scene, ['room-A']);
    runFrames();

    expect(hexOf(f.roomVolume)).toBe(VIOLET_ROOM_JEWEL);
    // ⛔ A room volume also stamps `userData.id`, so without the explicit room arm
    // in `resolveFocusRole` the solid pass would have repainted the jewel blue.
    expect(hexOf(f.roomVolume)).not.toBe(INSPECT_BLUE);
  });

  // ── §5 — the founder's standing constraint: nothing selected ⇒ no change ───
  it('emphasises NOTHING when the focus set is empty', () => {
    const f = buildScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.applyLens('ghost', EMPTY_DELTA, f.scene);
    runFrames();

    expect(hexOf(f.wallMesh)).toBe(GHOST_STRUCTURAL_HEX);
    expect(hasFocusOutline(f.wallMesh)).toBe(false);
    expect(hexOf(f.roomVolume)).not.toBe(VIOLET_ROOM_JEWEL);
  });

  // ── §6 — the ancestor walk: a hosted sub-mesh resolves to its group ────────
  it('focuses a DOOR through its group id, and leaves the hit proxy alone', () => {
    const f = buildScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.applyLens('ghost', EMPTY_DELTA, f.scene, ['door_D1']);
    runFrames();

    expect(hexOf(f.doorSubMesh)).toBe(INSPECT_BLUE);
    // L-2031 — the proxy resolves to `door_D1` via the SAME ancestor walk, and the
    // door HAS real geometry, so the proxy must not be surfaced. This is the
    // "only when nothing better existed" half of the two-phase pass.
    expect(hexOf(f.hitProxy)).not.toBe(INSPECT_BLUE);
    expect(hasFocusOutline(f.hitProxy)).toBe(false);
  });

  // ── §6b — THE INSTANCED CASE, which is most of the founder's real walls ────
  it('falls back to the hit-proxy for an INSTANCED element that has no visible mesh', () => {
    // `WallFragmentBuilder.ts:1303` estimates 70-85% of walls take the instanced
    // path. Its group then contains ONLY the invisible `colorWrite:false` proxy
    // (`WallFragmentBuilder.ts:1520`); the visible geometry is a shared InstancedMesh
    // at the SCENE ROOT stamped `instanced-group-<key>`, which resolves to a GROUP
    // id, never the wall's. Without this fallback the founder's most likely wall
    // highlights nothing — committed and unreachable, which looks fixed.
    const f = buildScene();
    const instancedWallGroup = new THREE.Group();
    instancedWallGroup.userData = { id: 'wall_INST', elementType: 'wall', type: 'wall' };
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(4, 3, 0.2),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
    );
    proxy.userData = { role: 'hit-proxy' };
    instancedWallGroup.add(proxy);
    f.scene.add(instancedWallGroup);

    const mgr = new DiagnosticMaterialManager();
    mgr.applyLens('ghost', EMPTY_DELTA, f.scene, ['wall_INST']);
    runFrames();

    expect(hexOf(proxy)).toBe(INSPECT_BLUE);
    // ⛔ …and the OTHER element's proxy is still untouched, so L-2031 holds: a
    // proxy is surfaced only for an element the user actually selected.
    expect(hexOf(f.hitProxy)).not.toBe(INSPECT_BLUE);
  });

  // ── §7 — focus survives every lens that can carry it ──────────────────────
  it.each(['ghost', 'spatial', 'openings', 'finishes', 'xray', 'assets'] as const)(
    'keeps the wall focused under the %s lens',
    (lens) => {
      const f = buildScene();
      const mgr = new DiagnosticMaterialManager();

      mgr.applyLens(lens, EMPTY_DELTA, f.scene, ['wall_W1']);
      runFrames();

      expect(hexOf(f.wallMesh)).toBe(INSPECT_BLUE);
    },
  );

  // ── §8 — Analysis keeps its OWN palette; the Inspect blue must not leak ────
  it('does NOT paint the Inspect blue under the analysis lens', () => {
    const f = buildScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.setAnalysisSelection(['wall_W1'], f.scene);
    mgr.applyLens('analysis', EMPTY_DELTA, f.scene, ['wall_W1']);
    runFrames();

    // §ANALYSIS-IS-GREY-AND-PURPLE (L-6410) — PRYZM purple, never INSPECT_BLUE.
    expect(hexOf(f.wallMesh)).toBe(0x6600ff);
    expect(hexOf(f.wallMesh)).not.toBe(INSPECT_BLUE);
  });

  // ── §9 — the OBSERVED mechanism, recorded rather than sanitised ────────────
  it('records that a scene-root selection-highlight clone is still ghosted by the lens', () => {
    const f = buildScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.applyLens('ghost', EMPTY_DELTA, f.scene, ['wall_W1']);
    runFrames();

    // ⚠ THIS IS THE DEFECT MECHANISM, PINNED AS OBSERVED — not as desired.
    // `SelectionManager`'s purple overlay clone carries `isHelper`/`sharedGeometry`
    // and NO `type`, so `resolveGhostRole` classifies it `'non-structural'` and the
    // ghost pass repaints it flat white at 4%. That is what made the founder's
    // purple vanish within one frame. The fix chosen was NOT to carve a helper
    // exemption into the ghost pass (that would also change how previews and
    // massing proxies render with NOTHING selected, which the founder's
    // *"don't compromise graphics"* constraint forbids) — it was to make the LENS
    // own the emphasis, exactly as it already did for rooms. This assertion exists
    // so that if someone later DOES exempt helpers, they must come here and say so.
    expect(hexOf(f.highlightClone)).toBe(0xffffff);
    // …and the wall is emphasised anyway, which is the whole point.
    expect(hexOf(f.wallMesh)).toBe(INSPECT_BLUE);
  });
});

// ── The PURE decision, driven headlessly ─────────────────────────────────────

describe('resolveFocusRole — the pure focus decision', () => {
  const solid = {
    elementId: 'wall_W1', roomId: null, isRoomVolume: false,
    isRoomOverlay: false, role: null, isShaderMaterial: false,
  };

  it('returns none for every subject when nothing is focused', () => {
    expect(resolveFocusRole(solid, EMPTY_FOCUS)).toBe('none');
    expect(resolveFocusRole({ ...solid, isRoomVolume: true, roomId: 'r' }, EMPTY_FOCUS)).toBe('none');
  });

  it('returns solid-focus for a focused non-room element', () => {
    expect(resolveFocusRole(solid, toFocusSet(['wall_W1']))).toBe('solid-focus');
  });

  it('returns none for an UNfocused element', () => {
    expect(resolveFocusRole(solid, toFocusSet(['wall_W2']))).toBe('none');
  });

  it('returns room-jewel for a focused room volume, keyed on roomId', () => {
    const room = { ...solid, elementId: 'room-A', roomId: 'room-A', isRoomVolume: true };
    expect(resolveFocusRole(room, toFocusSet(['room-A']))).toBe('room-jewel');
  });

  it('offers a FOCUSED element hit proxy as a fallback, and the caller owns the policy', () => {
    expect(resolveFocusRole({ ...solid, role: 'hit-proxy' }, toFocusSet(['wall_W1']))).toBe('proxy-fallback');
  });

  it('never offers an UNFOCUSED hit proxy — the whole of L-2031', () => {
    expect(resolveFocusRole({ ...solid, role: 'hit-proxy' }, toFocusSet(['wall_W2']))).toBe('none');
  });

  it('never focuses a ShaderMaterial mesh (the uZoom crash guard)', () => {
    expect(resolveFocusRole({ ...solid, isShaderMaterial: true }, toFocusSet(['wall_W1']))).toBe('none');
  });

  it('never focuses a room floor overlay', () => {
    const overlay = { ...solid, elementId: 'room-A', isRoomOverlay: true };
    expect(resolveFocusRole(overlay, toFocusSet(['room-A']))).toBe('none');
  });

  it('collapses undefined / null / [] into ONE empty set', () => {
    expect(toFocusSet(undefined)).toBe(EMPTY_FOCUS);
    expect(toFocusSet(null)).toBe(EMPTY_FOCUS);
    expect(toFocusSet([])).toBe(EMPTY_FOCUS);
    expect(toFocusSet([''])).toBe(EMPTY_FOCUS);
  });
});
