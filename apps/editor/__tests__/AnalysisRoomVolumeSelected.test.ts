// @vitest-environment happy-dom
//
// §ANALYSIS-ROOM-VOLUME-SELECTED (L-12240) — lane ROOMVOL138.
//
// ── THE FOUNDER'S REQUEST, WHICH IS THE SPEC ──────────────────────────────────
//
//   "In the Analysis graph — relationships — when a room is selected, highlighted
//    as you do in Inspect mode: the VOLUME."
//
// ── WHAT WAS MEASURED BEFORE CHANGING ANYTHING ───────────────────────────────
//
// The room's graph-node click was ALREADY reaching `selectionBus` with the room's
// own id (`widgetRenderers.ts` `onPick`, both the 2-D and 3-D branches) — the SAME
// bus a room click in the 3-D viewport itself uses (`SelectionManager.ts:2449`,
// `selectionBus.select(elementId, '3d-canvas')`). `InspectModeCoordinator` already
// subscribes to that bus directly (§INSPECT-FOCUS-IS-ELEMENT-SHAPED, L-8200) and
// feeds BOTH Inspect's focus set and Analysis' own `_analysisSelection`. So the
// DISPATCH was never the defect — see `graphNodeClickSelectionPath.spec.ts` for the
// suite that proves this half and settles it against the initial hypothesis.
//
// ⛔ THE REAL DEFECT is entirely inside `_applyAnalysisSelection` — the ANALYSIS
// lens' own paint function:
//   1. A room's ONLY visible 3-D geometry under any Inspect/Analysis lens is its
//      VOLUME mesh (`isRoomVolume`) — the floor overlay is always forced to
//      `VOLUME_FLOOR_OPACITY` (effectively invisible) regardless of selection.
//   2. That volume mesh's `.visible` is gated behind the ambient "Room Volume
//      Colour" user preference (`UiPreferences.showRoomVolumeColour`, default OFF,
//      `initScene.ts:1004`) — a decorative toggle nothing to do with selection.
//   3. `_applyToMesh` only ever replaces `.material`; nothing in either lens ever
//      touched `.visible`. So — BEFORE this lane — a selected room volume got the
//      RIGHT material computed and applied to a mesh that stayed INVISIBLE
//      whenever that ambient preference was off: the click, the resolve and the
//      paint were all correct, and the founder still saw nothing.
//
// The fix teaches `_applyAnalysisSelection` a dedicated `isRoomVolume` branch that
// (a) forces the volume visible for exactly as long as it is selected, restoring
// the ambient preference the instant it is not, and (b) paints it with Analysis'
// OWN purple, translucent and PULSING — reusing the SAME `_pulseMeshes` /
// `_startPulse` mechanism Inspect's own §1.3 jewel drives, never Inspect's violet
// (§ANALYSIS-IS-GREY-AND-PURPLE, L-6410 forbids the two palettes crossing).
//
// ⚠ VERIFIED FAILING pre-fix: every assertion in the first two `describe` blocks
// below was checked BY HAND against the code as it stood before this lane's edit to
// `DiagnosticMaterialManager.ts` (`_applyAnalysisSelection` had no `isRoomVolume`
// branch at all — a room volume fell into the generic id-match branch, which
// paints `.material` correctly but never touches `.visible`, so §1's "becomes
// visible" and §2's "restores visibility on deselect" assertions failed against
// the un-fixed file; `.visible` stayed at its construction-time value throughout).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
  getFrameScheduler,
  _resetFrameSchedulerForTest,
  FakeRafAdapter,
} from '@pryzm/frame-scheduler';
import type { DeltaMap } from '@pryzm/core-app-model';
import { DiagnosticMaterialManager } from '../src/engine/inspect/DiagnosticMaterialManager.js';
import { UiPreferences } from '../src/ui/UiPreferences.js';

const ANALYSIS_PURPLE   = 0x6600ff; // §ANALYSIS-IS-GREY-AND-PURPLE (L-6410)
const INSPECT_VIOLET    = 0x8b5cf6; // §1.3 jewel — must NEVER appear in Analysis
const ROOM_ORIGINAL_HEX = 0x223344; // the room's own authored colour

const EMPTY_DELTA: Readonly<DeltaMap> = new Map() as unknown as Readonly<DeltaMap>;

interface Fixture {
  scene:      THREE.Scene;
  wallMesh:   THREE.Mesh;
  roomVolume: THREE.Mesh;
}

function buildScene(): Fixture {
  const scene = new THREE.Scene();

  const wallMesh = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x998877 }),
  );
  wallMesh.userData = { id: 'wall_W1', type: 'wall', elementType: 'wall', levelId: 'L0' };
  scene.add(wallMesh);

  // A room volume, exactly as RoomBoundaryBuilder._buildVolumeMesh stamps it
  // (`RoomBoundaryBuilder.ts:404-416`) — `roomId` AND `id` both carry the room's
  // id, `isRoomVolume` is the tag, and `.visible` starts false to match the
  // ambient "Room Volume Colour" preference's documented default (OFF).
  const roomVolume = new THREE.Mesh(
    new THREE.BoxGeometry(5, 2.7, 4),
    new THREE.MeshPhongMaterial({ color: ROOM_ORIGINAL_HEX }),
  );
  roomVolume.userData = { isRoomVolume: true, roomId: 'room-A', id: 'room-A' };
  roomVolume.visible = false;
  scene.add(roomVolume);

  return { scene, wallMesh, roomVolume };
}

function hexOf(mesh: THREE.Mesh): number {
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return (mat as THREE.MeshPhongMaterial).color.getHex();
}

let fake: FakeRafAdapter;
function runFrames(n = 3): void { fake.pumpFrames(n); }

describe('§ANALYSIS-ROOM-VOLUME-SELECTED (L-12240) — a selected room becomes its VOLUME', () => {
  beforeEach(() => {
    _resetFrameSchedulerForTest();
    fake = new FakeRafAdapter();
    getFrameScheduler().start(fake);
    // The ambient preference this whole mechanism must not fight with — pinned
    // to its DOCUMENTED default (OFF) so each test starts from a known state.
    UiPreferences.set('showRoomVolumeColour', false);
  });

  afterEach(() => {
    getFrameScheduler().stop();
    _resetFrameSchedulerForTest();
  });

  it('an unselected room volume stays exactly as it started — invisible, ambient default OFF', () => {
    const f = buildScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.setAnalysisSelection([], f.scene);
    mgr.applyLens('analysis', EMPTY_DELTA, f.scene, []);
    runFrames();

    expect(f.roomVolume.visible).toBe(false);
  });

  it('⭐ selecting the room from the graph makes its VOLUME visible', () => {
    const f = buildScene();
    const mgr = new DiagnosticMaterialManager();

    // The exact call shape `InspectModeCoordinator._setAnalysisEmphasis` /
    // `_setFocusedElements` produce when a `selectionBus` 'select' event fires —
    // see `graphNodeClickSelectionPath.spec.ts` for the proof that a room node's
    // graph click actually dispatches `elementIds: ['room-A']` on that bus.
    mgr.setAnalysisSelection(['room-A'], f.scene);
    mgr.applyLens('analysis', EMPTY_DELTA, f.scene, ['room-A']);
    runFrames();

    expect(f.roomVolume.visible).toBe(true);
  });

  it('the visible volume reads in ANALYSIS purple, never Inspect\'s violet jewel', () => {
    const f = buildScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.setAnalysisSelection(['room-A'], f.scene);
    mgr.applyLens('analysis', EMPTY_DELTA, f.scene, ['room-A']);
    runFrames();

    expect(hexOf(f.roomVolume)).toBe(ANALYSIS_PURPLE);
    expect(hexOf(f.roomVolume)).not.toBe(INSPECT_VIOLET);
  });

  it('⛔ deselecting the room restores BOTH the ambient visibility AND the original colour', () => {
    const f = buildScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.setAnalysisSelection(['room-A'], f.scene);
    mgr.applyLens('analysis', EMPTY_DELTA, f.scene, ['room-A']);
    runFrames();
    expect(f.roomVolume.visible).toBe(true); // sanity: it was actually on

    mgr.setAnalysisSelection([], f.scene);
    mgr.applyLens('analysis', EMPTY_DELTA, f.scene, []);
    runFrames();

    expect(f.roomVolume.visible).toBe(false); // ambient default — never left lit
    expect(hexOf(f.roomVolume)).toBe(ROOM_ORIGINAL_HEX); // never stuck in last click's purple
  });

  it('with the ambient preference ON, an UNSELECTED room stays visible in its OWN colour', () => {
    UiPreferences.set('showRoomVolumeColour', true);
    const f = buildScene();
    f.roomVolume.visible = true; // what RoomBoundaryBuilder itself would set when the pref is ON
    const mgr = new DiagnosticMaterialManager();

    mgr.setAnalysisSelection([], f.scene);
    mgr.applyLens('analysis', EMPTY_DELTA, f.scene, []);
    runFrames();

    expect(f.roomVolume.visible).toBe(true);
    expect(hexOf(f.roomVolume)).toBe(ROOM_ORIGINAL_HEX); // untouched — not selected, so not repainted
  });

  it('with the ambient preference ON, selecting then deselecting returns to ON, not OFF', () => {
    UiPreferences.set('showRoomVolumeColour', true);
    const f = buildScene();
    f.roomVolume.visible = true;
    const mgr = new DiagnosticMaterialManager();

    mgr.setAnalysisSelection(['room-A'], f.scene);
    mgr.applyLens('analysis', EMPTY_DELTA, f.scene, ['room-A']);
    runFrames();
    expect(hexOf(f.roomVolume)).toBe(ANALYSIS_PURPLE);

    mgr.setAnalysisSelection([], f.scene);
    mgr.applyLens('analysis', EMPTY_DELTA, f.scene, []);
    runFrames();

    // ⛔ THE DIFFERENTIATING ASSERTION — a naive "restore to false" would wrongly
    // turn OFF a volume the user's own preference says should stay on.
    expect(f.roomVolume.visible).toBe(true);
    expect(hexOf(f.roomVolume)).toBe(ROOM_ORIGINAL_HEX);
  });

  // ── A TABLE OVER MESH KINDS — the room branch is new; the non-room branch must
  // stay byte-identical to what §8 of InspectWallFocusSurvivesTheNextFrame.test.ts
  // already pins for a WALL under the very same 'analysis' lens. ─────────────────
  it.each([
    { kind: 'room volume', getMesh: (f: Fixture) => f.roomVolume, id: 'room-A', expectVisibleChange: true },
    { kind: 'wall (non-room)', getMesh: (f: Fixture) => f.wallMesh, id: 'wall_W1', expectVisibleChange: false },
  ])('$kind: selected under the analysis lens reads in PRYZM purple', ({ getMesh, id, expectVisibleChange }) => {
    const f = buildScene();
    const mesh = getMesh(f);
    const wasVisible = mesh.visible;
    const mgr = new DiagnosticMaterialManager();

    mgr.setAnalysisSelection([id], f.scene);
    mgr.applyLens('analysis', EMPTY_DELTA, f.scene, [id]);
    runFrames();

    expect(hexOf(mesh)).toBe(ANALYSIS_PURPLE);
    // The room branch is the ONLY one that ever touches `.visible`; a non-room
    // mesh's visibility must be untouched by this lane's change.
    if (!expectVisibleChange) expect(mesh.visible).toBe(wasVisible);
  });
});
