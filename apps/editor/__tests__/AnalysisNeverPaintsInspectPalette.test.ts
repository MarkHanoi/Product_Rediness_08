// @vitest-environment happy-dom
//
// §ANALYSIS-OWNS-ITS-PALETTE (L-9200..L-9206), 2026-08-23 — lane INSP46, REOPENED.
//
// ── THE REGRESSION, on the live deploy `2f8d9470` ────────────────────────────
//
// Founder: *"check the Analysis view — before this deployment it was graphically
// good, now it goes to 'inspect' graphic modes."* His console:
//
//   [§INSPECT-FOCUS-IS-ELEMENT-SHAPED] focus=[…105 ids…] — 1016 solid mesh(es)
//                                       in the inspect blue, 75 via the proxy
//   [DiagnosticMaterialManager] Lens applied: ghost (focus: …)
//
// `ghost`, while the workspace was Analysis.
//
// ⭐ WHY THE EXISTING GUARD DID NOT CATCH IT. `_applyLensImmediate` tests
// `lens !== 'analysis'` before painting the Inspect focus, and that test was and is
// correct. But `_activeLens` had exactly ONE writer — `_onSetLens`, fed by
// `pryzm-set-inspect-lens`, whose only emitter is `WorkspaceController.ts:339` (a
// user clicking an INSPECT lens chip). Entering Analysis passed the LITERAL
// 'analysis' to applyLens and never assigned the field, so it kept its 'ghost'
// default — and every later re-apply read the field. A guard is only as right as
// whoever set the value it tests.
//
// ⛔ THESE TESTS EXIST BECAUSE THE STATE COMBINATION WAS REACHABLE ONLY BY A PATH NO
// TEST WALKED. L-8200 was correct and still shipped this. So the four entry orders
// are enumerated explicitly, and each is followed by the action that actually
// triggered the breach: a SELECTION arriving while Analysis is showing.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
  getFrameScheduler,
  _resetFrameSchedulerForTest,
  FakeRafAdapter,
} from '@pryzm/frame-scheduler';
import { selectionBus } from '@pryzm/core-app-model';
import { inspectModeCoordinator } from '../src/engine/inspect/InspectModeCoordinator.js';

// Literals, not imported constants — a test that imports the value it checks agrees
// with the implementation by construction and moves with it.
const INSPECT_BLUE         = 0x00aaff; // §INSPECT-FOCUS-IS-THE-ONLY-COLOUR (L-3511)
const GHOST_STRUCTURAL_HEX = 0xc0e0ff; // §1.1 structural frosted ghost — Inspect only
const ANALYSIS_GHOST_GREY  = 0xd8dce3; // §ANALYSIS-IS-GREY-AND-PURPLE (L-6410)
const PRYZM_PURPLE         = 0x6600ff; // C18 §1 — the unified brand purple

// ── A minimal runtime.events bus, so the REAL coordinator can be driven ───────
type Handler = (payload: unknown) => void;
function makeBus() {
  const handlers = new Map<string, Set<Handler>>();
  return {
    on(name: string, fn: Handler) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name)!.add(fn);
      return () => handlers.get(name)?.delete(fn);
    },
    emit(name: string, payload?: unknown) {
      for (const fn of [...(handlers.get(name) ?? [])]) fn(payload);
    },
  };
}

let fake: FakeRafAdapter;

function frames(n = 3): void { fake.pumpFrames(n); }

function buildScene() {
  const scene = new THREE.Scene();
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x998877 }),
  );
  wall.userData = { id: 'wall_W1', type: 'wall', elementType: 'wall', levelId: 'L0' };
  scene.add(wall);
  const other = new THREE.Mesh(
    new THREE.BoxGeometry(4, 3, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x998877 }),
  );
  other.userData = { id: 'wall_W2', type: 'wall', elementType: 'wall', levelId: 'L0' };
  scene.add(other);
  return { scene, wall, other };
}

function hexOf(mesh: THREE.Mesh): number {
  const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return (m as THREE.MeshPhongMaterial).color.getHex();
}
function alphaOf(mesh: THREE.Mesh): number {
  const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return (m as THREE.MeshPhongMaterial).opacity;
}
/** Every cyan/white outline the INSPECT lenses hang off a mesh. Analysis draws none. */
function outlineCount(root: THREE.Object3D): number {
  let n = 0;
  root.traverse(o => { if ((o as THREE.LineSegments).isLineSegments) n++; });
  return n;
}

/** Assert the founder's sentence: this scene is Analysis, not Inspect. */
function expectAnalysisLook(f: ReturnType<typeof buildScene>): void {
  expect(hexOf(f.other)).toBe(ANALYSIS_GHOST_GREY);
  expect(hexOf(f.other)).not.toBe(GHOST_STRUCTURAL_HEX); // not Inspect's frosted ghost
  expect(hexOf(f.wall)).not.toBe(INSPECT_BLUE);          // not Inspect's focus blue
  expect(outlineCount(f.scene)).toBe(0);                 // no cyan wireframe (image 2)
}

describe('§ANALYSIS-OWNS-ITS-PALETTE (L-9200) — Analysis never paints Inspect', () => {
  let bus: ReturnType<typeof makeBus>;

  beforeEach(() => {
    _resetFrameSchedulerForTest();
    fake = new FakeRafAdapter();
    getFrameScheduler().start(fake);
    bus = makeBus();
    (window as unknown as { runtime?: unknown }).runtime = { events: bus };
    (window as unknown as { workspaceController?: unknown }).workspaceController = {
      getMode: () => 'author',
    };
    selectionBus.dispatch({ type: 'clear', source: 'test', elementIds: [] });
  });

  afterEach(() => {
    inspectModeCoordinator.dispose();
    getFrameScheduler().stop();
    _resetFrameSchedulerForTest();
  });

  // ── ENTRY ORDER 1 — Author → Analysis ────────────────────────────────────
  it('Author to Analysis, then select: grey ghost + purple, never inspect blue', () => {
    const f = buildScene();
    inspectModeCoordinator.init(f.scene);
    frames();

    bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
    frames();
    selectionBus.dispatch({ type: 'select', source: 'analytics', elementIds: ['wall_W1'] });
    frames();

    expectAnalysisLook(f);
    expect(hexOf(f.wall)).toBe(PRYZM_PURPLE);
  });

  // ── ENTRY ORDER 2 — Inspect → Analysis ⭐ THE FOUNDER'S PATH ──────────────
  it('Inspect to Analysis, then select: the exact combination that shipped the bug', () => {
    const f = buildScene();
    inspectModeCoordinator.init(f.scene);
    frames();

    // Inspect first — this is what leaves `_activeLens === 'ghost'`.
    bus.emit('pryzm-workspace-mode', { mode: 'inspect' });
    frames();
    expect(hexOf(f.other)).toBe(GHOST_STRUCTURAL_HEX); // Inspect really is showing

    bus.emit('pryzm-workspace-mode', { mode: 'analysis' });
    frames();
    // THE TRIGGER: the Analysis family highlight dispatches on selectionBus
    // (`selectionFacets.ts:262`). Under the old code this re-applied `_activeLens`,
    // i.e. 'ghost', and painted 1016 meshes inspect blue.
    selectionBus.dispatch({ type: 'select', source: 'analytics', elementIds: ['wall_W1'] });
    frames();

    expectAnalysisLook(f);
    expect(hexOf(f.wall)).toBe(PRYZM_PURPLE);
  });

  // ── ENTRY ORDER 3 — reload straight into Analysis ────────────────────────
  it('reload-into-Analysis (init catch-up), then select', () => {
    const f = buildScene();
    (window as unknown as { workspaceController?: unknown }).workspaceController = {
      getMode: () => 'analysis',
    };
    inspectModeCoordinator.init(f.scene);
    frames();
    selectionBus.dispatch({ type: 'select', source: 'analytics', elementIds: ['wall_W1'] });
    frames();

    expectAnalysisLook(f);
  });

  // ── ENTRY ORDER 4 — Analysis → Inspect → Analysis ────────────────────────
  it('Analysis to Inspect to Analysis, then select', () => {
    const f = buildScene();
    inspectModeCoordinator.init(f.scene);
    frames();

    bus.emit('pryzm-workspace-mode', { mode: 'analysis' });  frames();
    bus.emit('pryzm-workspace-mode', { mode: 'inspect' });   frames();
    bus.emit('pryzm-workspace-mode', { mode: 'analysis' });  frames();
    selectionBus.dispatch({ type: 'select', source: 'analytics', elementIds: ['wall_W1'] });
    frames();

    expectAnalysisLook(f);
  });

  // ── The other two writers that could repaint Inspect on the Analysis surface ─
  it('an INSPECT LENS CHIP clicked while Analysis shows does not repaint Inspect', () => {
    const f = buildScene();
    inspectModeCoordinator.init(f.scene);
    frames();
    bus.emit('pryzm-workspace-mode', { mode: 'analysis' }); frames();

    bus.emit('pryzm-set-inspect-lens', { lens: 'xray' });
    frames();

    expectAnalysisLook(f);
  });

  it('an ELEMENT-TYPE family focus is refused while Analysis shows', () => {
    const f = buildScene();
    inspectModeCoordinator.init(f.scene);
    frames();
    bus.emit('pryzm-workspace-mode', { mode: 'analysis' }); frames();

    // `applyGhostWithFocus` BYPASSES applyLens and paints the inspect blue
    // unconditionally, so the lens resolver cannot protect it.
    bus.emit('pryzm-inspect-element-type', { elementType: 'wall' });
    frames();

    expectAnalysisLook(f);
  });

  // ── …and the user's Inspect choice is REMEMBERED, not destroyed ──────────
  it('restores the lens chip the user picked when they go back to Inspect', () => {
    const f = buildScene();
    inspectModeCoordinator.init(f.scene);
    frames();

    bus.emit('pryzm-workspace-mode', { mode: 'inspect' });  frames();
    bus.emit('pryzm-set-inspect-lens', { lens: 'xray' });   frames();
    bus.emit('pryzm-workspace-mode', { mode: 'analysis' }); frames();
    expectAnalysisLook(f);

    bus.emit('pryzm-workspace-mode', { mode: 'inspect' });  frames();
    // The point is that the lens was not silently reset to Analysis' grey: the
    // user's chip survived the round trip.
    expect(hexOf(f.other)).not.toBe(ANALYSIS_GHOST_GREY);
  });

  // ── C — the selection colour and the reading taken for its alpha ──────────
  it('paints the selection in the CONTRACTUAL purple at the documented alpha', () => {
    const f = buildScene();
    inspectModeCoordinator.init(f.scene);
    frames();
    bus.emit('pryzm-workspace-mode', { mode: 'analysis' }); frames();
    selectionBus.dispatch({ type: 'select', source: 'analytics', elementIds: ['wall_W1'] });
    frames();

    // C18 §1 fixes the HUE and C16 CA-13 makes it mandatory — not a judgement call.
    expect(hexOf(f.wall)).toBe(PRYZM_PURPLE);
    // ⚠ The ALPHA is NOT in any contract (C18's only opacity, 0.55, is for object
    // placement previews, §3). "80% transparent" is read as alpha 0.20; the reasons
    // are on `ANALYSIS_SELECTED_OPACITY`. This assertion is here so that flipping the
    // reading is a deliberate two-line change, not a silent drift.
    expect(alphaOf(f.wall)).toBeCloseTo(0.20, 5);
  });
});
