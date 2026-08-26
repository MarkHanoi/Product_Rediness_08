// @vitest-environment happy-dom
//
// §HILITE140 (L-12292), 2026-08-26.
//
// ── THE FOUNDER'S SENTENCE, WHICH IS THE SPEC ─────────────────────────────────
//
//   "In Analysis → Relationships, when the user selects one element it gets
//    highlighted in the 3-D scene — which is great (I want it slightly more
//    transparent than now, maybe 10% more) — but I would like to also highlight
//    the elements that are being highlighted as RELATED in the graph … starting
//    anyway from a lighter one, so that clearly we identify the selected element
//    from the rest."
//
// This suite pins THREE things at the paint layer
// (`DiagnosticMaterialManager._applyAnalysisSelection` / `setAnalysisRelated`):
//   §1 the selection's own alpha moved from 0.80 to 0.72 (10% more transparent);
//   §2 a related element at hop N is lighter than hop N-1, numerically, not by
//      eye, and a selected element always outranks being ALSO "related";
//   §3 a related ROOM gets the SAME forced-`.visible` treatment §ROOMVOL138 gave
//      a SELECTED room, and deselecting restores everything, including that
//      forced visibility.
//
// ⚠ VERIFIED FAILING pre-fix by controlled revert (see the two hop-assertion
// tests' comments — reverting `setAnalysisRelated`'s call in `InspectModeCoordinator`
// equivalent, or reading `_analysisRelatedHops` as always-empty, makes every
// "related" assertion below fail against the un-fixed file).

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

const PRYZM_PURPLE      = 0x6600ff;
const SELECTED_ALPHA    = 0.72; // §HILITE140 (L-12291) — was 0.80 (L-9210)

const EMPTY_DELTA: Readonly<DeltaMap> = new Map() as unknown as Readonly<DeltaMap>;

interface Fixture {
  scene:      THREE.Scene;
  wall:       THREE.Mesh; // the SELECTED element
  hop1:       THREE.Mesh; // a direct neighbour
  hop2:       THREE.Mesh; // a neighbour of a neighbour
  beyond:     THREE.Mesh; // outside the configured FOCUS HOPS depth
  roomVolume: THREE.Mesh; // a related ROOM, starts invisible (ambient pref OFF)
}

function buildScene(): Fixture {
  const scene = new THREE.Scene();

  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x998877 }),
  );
  wall.userData = { id: 'wall_a', type: 'wall', elementType: 'wall', levelId: 'L0' };
  scene.add(wall);

  const hop1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 2.1, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x442200 }),
  );
  hop1.userData = { id: 'door_1', type: 'door', elementType: 'door', levelId: 'L0' };
  scene.add(hop1);

  const hop2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x334455 }),
  );
  hop2.userData = { id: 'column_1', type: 'column', elementType: 'column', levelId: 'L0' };
  scene.add(hop2);

  const beyond = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x556677 }),
  );
  beyond.userData = { id: 'light_9', type: 'lighting', elementType: 'lighting', levelId: 'L0' };
  scene.add(beyond);

  const roomVolume = new THREE.Mesh(
    new THREE.BoxGeometry(5, 2.7, 4),
    new THREE.MeshPhongMaterial({ color: 0x223344 }),
  );
  roomVolume.userData = { isRoomVolume: true, roomId: 'room-A', id: 'room-A' };
  roomVolume.visible = false; // ambient "Room Volume Colour" default: OFF
  scene.add(roomVolume);

  return { scene, wall, hop1, hop2, beyond, roomVolume };
}

function hexOf(mesh: THREE.Mesh): number {
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return (mat as THREE.MeshPhongMaterial).color.getHex();
}
function alphaOf(mesh: THREE.Mesh): number {
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return (mat as THREE.MeshPhongMaterial).opacity;
}

let fake: FakeRafAdapter;
function runFrames(n = 3): void { fake.pumpFrames(n); }

describe('§HILITE140 (L-12291) — the selection alpha moved 10% toward transparent', () => {
  beforeEach(() => {
    _resetFrameSchedulerForTest();
    fake = new FakeRafAdapter();
    getFrameScheduler().start(fake);
  });
  afterEach(() => {
    getFrameScheduler().stop();
    _resetFrameSchedulerForTest();
  });

  it('a selected (non-room) element now paints at 0.72, not the old 0.80', () => {
    const f = buildScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.setAnalysisSelection(['wall_a'], f.scene);
    mgr.applyLens('analysis', EMPTY_DELTA, f.scene, ['wall_a']);
    runFrames();

    expect(hexOf(f.wall)).toBe(PRYZM_PURPLE);
    expect(alphaOf(f.wall)).toBeCloseTo(SELECTED_ALPHA, 5);
    expect(alphaOf(f.wall)).toBeCloseTo(0.80 * 0.9, 10); // stated 10%-of-current reading
  });
});

describe('§HILITE140 (L-12292) — related elements ramp lighter with hop distance', () => {
  beforeEach(() => {
    _resetFrameSchedulerForTest();
    fake = new FakeRafAdapter();
    getFrameScheduler().start(fake);
    UiPreferences.set('showRoomVolumeColour', false);
  });
  afterEach(() => {
    getFrameScheduler().stop();
    _resetFrameSchedulerForTest();
  });

  it('a hop-1 element is highlighted, and LIGHTER than the selection (lower alpha, paler hue)', () => {
    const f = buildScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.setAnalysisSelection(['wall_a'], f.scene);
    mgr.setAnalysisRelated([['door_1', 1]], f.scene);
    mgr.applyLens('analysis', EMPTY_DELTA, f.scene, ['wall_a']);
    runFrames();

    // Highlighted at all — not left in the grey ghost.
    expect(hexOf(f.hop1)).not.toBe(0xd8dce3);
    // Numerically lighter: strictly lower alpha than the selection…
    expect(alphaOf(f.hop1)).toBeLessThan(alphaOf(f.wall));
    // …and a paler (higher-luminance) hue — every RGB channel closer to white.
    // PRYZM purple (0x6600ff) already has its BLUE channel saturated at 1.0, so
    // lerping toward white (also 1.0 blue) cannot move it further — red and
    // green are where the lightening is actually visible.
    const wallColor = new THREE.Color(hexOf(f.wall));
    const hop1Color = new THREE.Color(hexOf(f.hop1));
    expect(hop1Color.r).toBeGreaterThan(wallColor.r);
    expect(hop1Color.g).toBeGreaterThan(wallColor.g);
    expect(hop1Color.b).toBeCloseTo(wallColor.b, 5); // already 1.0 on both sides
  });

  it('a hop-2 element is lighter than hop-1 — asserted numerically, not by eye', () => {
    const f = buildScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.setAnalysisSelection(['wall_a'], f.scene);
    mgr.setAnalysisRelated([['door_1', 1], ['column_1', 2]], f.scene);
    mgr.applyLens('analysis', EMPTY_DELTA, f.scene, ['wall_a']);
    runFrames();

    expect(alphaOf(f.hop2)).toBeLessThan(alphaOf(f.hop1));
    const hop1Color = new THREE.Color(hexOf(f.hop1));
    const hop2Color = new THREE.Color(hexOf(f.hop2));
    // Farther = closer to white — on red/green, the channels not already
    // saturated (see the hop-1 test above for why blue is excluded).
    expect(hop2Color.r).toBeGreaterThan(hop1Color.r);
    expect(hop2Color.g).toBeGreaterThan(hop1Color.g);
    expect(hop2Color.b).toBeCloseTo(hop1Color.b, 5);
  });

  it('an element beyond the configured hop limit (absent from the hop map) stays UNTOUCHED — the plain grey ghost', () => {
    const f = buildScene();
    const mgr = new DiagnosticMaterialManager();

    // `light_9` is simply never in the hop map — exactly what "beyond the FOCUS
    // HOPS depth" looks like from this layer: `focusNeighbourhood` never
    // reached it, so it was never included, not filtered out here.
    mgr.setAnalysisSelection(['wall_a'], f.scene);
    mgr.setAnalysisRelated([['door_1', 1]], f.scene);
    mgr.applyLens('analysis', EMPTY_DELTA, f.scene, ['wall_a']);
    runFrames();

    expect(hexOf(f.beyond)).toBe(0xd8dce3); // ANALYSIS_GHOST_COLOR, unchanged
  });

  it('a SELECTED id wins over also being "related" — never double- or wrong-painted', () => {
    const f = buildScene();
    const mgr = new DiagnosticMaterialManager();

    // A pathological (but possible, e.g. a cycle) case: the selection's OWN id
    // also appears in the hop map. Selected must win, at the selection's alpha.
    mgr.setAnalysisSelection(['wall_a'], f.scene);
    mgr.setAnalysisRelated([['wall_a', 2], ['door_1', 1]], f.scene);
    mgr.applyLens('analysis', EMPTY_DELTA, f.scene, ['wall_a']);
    runFrames();

    expect(alphaOf(f.wall)).toBeCloseTo(SELECTED_ALPHA, 5);
  });

  it('⭐ a related ROOM at hop >= 1 becomes VISIBLE, exactly like §ROOMVOL138 for a SELECTED room', () => {
    const f = buildScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.setAnalysisSelection(['wall_a'], f.scene);
    mgr.setAnalysisRelated([['room-A', 2]], f.scene);
    mgr.applyLens('analysis', EMPTY_DELTA, f.scene, ['wall_a']);
    runFrames();

    expect(f.roomVolume.visible).toBe(true);
    expect(hexOf(f.roomVolume)).not.toBe(0x223344); // repainted, not left in its own colour
  });

  it('⛔ deselecting restores EVERYTHING — including the visibility a related hop forced', () => {
    const f = buildScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.setAnalysisSelection(['wall_a'], f.scene);
    mgr.setAnalysisRelated([['room-A', 1], ['door_1', 1]], f.scene);
    mgr.applyLens('analysis', EMPTY_DELTA, f.scene, ['wall_a']);
    runFrames();
    expect(f.roomVolume.visible).toBe(true); // sanity: it really was forced on

    mgr.setAnalysisSelection([], f.scene);
    mgr.setAnalysisRelated([], f.scene);
    mgr.applyLens('analysis', EMPTY_DELTA, f.scene, []);
    runFrames();

    expect(f.roomVolume.visible).toBe(false); // back to the ambient default
    expect(hexOf(f.roomVolume)).toBe(0x223344); // its own original colour, not stuck in purple
    expect(hexOf(f.hop1)).toBe(0xd8dce3); // back to the plain grey ghost
  });

  it('the ramp is a FUNCTION of hop index — an untested hop-3/hop-4 still orders correctly', () => {
    // Proves the ramp is derived, not a hand-listed two-row table: hops the
    // suite above never named still produce a strictly monotone sequence.
    const f = buildScene();
    const extra1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial());
    extra1.userData = { id: 'hop3_elem', type: 'beam', elementType: 'beam' };
    f.scene.add(extra1);
    const extra2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial());
    extra2.userData = { id: 'hop4_elem', type: 'beam', elementType: 'beam' };
    f.scene.add(extra2);

    const mgr = new DiagnosticMaterialManager();
    mgr.setAnalysisSelection(['wall_a'], f.scene);
    mgr.setAnalysisRelated([
      ['door_1', 1], ['column_1', 2], ['hop3_elem', 3], ['hop4_elem', 4],
    ], f.scene);
    mgr.applyLens('analysis', EMPTY_DELTA, f.scene, ['wall_a']);
    runFrames();

    const alphas = [alphaOf(f.hop1), alphaOf(f.hop2), alphaOf(extra1), alphaOf(extra2)];
    for (let i = 1; i < alphas.length; i++) expect(alphas[i]).toBeLessThan(alphas[i - 1]!);
  });
});
