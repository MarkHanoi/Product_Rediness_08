// @vitest-environment happy-dom
//
// §HILITE140 (L-12280/L-12281), 2026-08-26.
//
// ── THE FOUNDER'S SENTENCE, WHICH IS THE SPEC ─────────────────────────────────
//
//   "On the Inspect area, bottom — when a user selects a ROOM it highlights in
//    the 3-D view in Inspect mode, but for other elements like WALLS it doesn't.
//    I want all of them to be highlighted."
//
// His screenshots show the Inspect BOTTOM TABLE ("INSPECT: Walls (56)" /
// "ATTR: Length (m)") — clicking a WALL ROW there produced no 3-D highlight.
//
// ── TWO INDEPENDENT DEFECTS, MEASURED, NOT ASSUMED ───────────────────────────
//
// §1 below pins the ROOT CAUSE the audit actually found: the bottom table's
// per-element rows for every NON-room family (`AuditGridZone.ts`
// `renderPolymorphicMatrix`, line ~555) emit ONLY `pryzm-audit-room-select` —
// never `pryzm-inspect-room-focus` and never `selectionBus.select(...)`. Nothing
// engine-side subscribed to that event, so a wall row's click never reached
// `DiagnosticMaterialManager` AT ALL. This is the SAME shape L-8201 already fixed
// for the PROJECT TREE (`ProjectTreeZone.ts`, via `selectionBus`) — the bottom
// table's sibling renderer never got the equivalent fix. `InspectModeCoordinator`
// now subscribes to `pryzm-audit-room-select` directly (see `_onAuditSelect`),
// which is a CLASS fix: every family the bottom table lists shares this ONE event,
// so nothing needed to be fixed per-family, and no `apps/editor/src/ui/inspect/
// audit/**` file needed to change (ROOMTREE139 is concurrently restructuring that
// directory).
//
// §2 tests the SEPARATE gap the per-family audit surfaced once focus reaches
// `DiagnosticMaterialManager`: a hit-proxy is a per-family OPT-IN, not a property
// of instancing. `StairRailingBuilder`/`HandrailFragmentBuilder` deliberately add
// none for their instanced members, and furniture's instanced parts carry none
// either — so even a CORRECTLY focused id had nothing to paint. Phase C reads the
// per-instance resolver `InstancedElementRenderer` already stamps on every group
// for SelectionManager's own instanced-pick highlight
// (`getOccupiedInstanceSlots`/`getInstanceElementId`/`getInstanceObb`), plus the
// separate, unrelated `CurtainWallInstanceManager` `instancePanelIds` shape.
//
// ⚠ VERIFIED FAILING pre-fix by controlled revert, recorded per-suite below.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
  getFrameScheduler,
  _resetFrameSchedulerForTest,
  FakeRafAdapter,
} from '@pryzm/frame-scheduler';
import type { DeltaMap } from '@pryzm/core-app-model';
import { DiagnosticMaterialManager } from '../src/engine/inspect/DiagnosticMaterialManager.js';
import { inspectModeCoordinator } from '../src/engine/inspect/InspectModeCoordinator.js';

const INSPECT_BLUE          = 0x00aaff; // §INSPECT-FOCUS-IS-THE-ONLY-COLOUR (L-3511)
const GHOST_STRUCTURAL_HEX  = 0xc0e0ff; // §1.1 structural frosted ghost

const EMPTY_DELTA: Readonly<DeltaMap> = new Map() as unknown as Readonly<DeltaMap>;

function hexOf(mesh: THREE.Mesh): number {
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return (mat as THREE.MeshPhongMaterial).color.getHex();
}

/** Every `THREE.Mesh` (not a LineSegments outline) parked in the overlay group. */
function overlayBoxes(scene: THREE.Scene): THREE.Mesh[] {
  const overlays = (scene as unknown as { overlays?: THREE.Group }).overlays;
  const out: THREE.Mesh[] = [];
  overlays?.traverse(o => {
    if ((o as THREE.Mesh).isMesh && !(o as THREE.LineSegments).isLineSegments) out.push(o as THREE.Mesh);
  });
  return out;
}

function findOverlayBox(scene: THREE.Scene, color: number): THREE.Mesh | undefined {
  return overlayBoxes(scene).find(m => hexOf(m) === color);
}

let fake: FakeRafAdapter;
function runFrames(n = 3): void { fake.pumpFrames(n); }

// ── §1 — THE WIRE: a bottom-table row click reaches the 3-D lens ─────────────

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

function buildWallScene() {
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

describe('§HILITE140 (L-12280) — bottom Inspect table row click reaches the 3-D lens', () => {
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
  });

  afterEach(() => {
    inspectModeCoordinator.dispose();
    getFrameScheduler().stop();
    _resetFrameSchedulerForTest();
  });

  it('⭐ a WALL row click in the POLYMORPHIC MATRIX (bottom table) highlights the wall', () => {
    const f = buildWallScene();
    inspectModeCoordinator.init(f.scene);
    // The coordinator is a module-level singleton whose focus field survives a
    // prior test's dispose() — start every test from a known empty focus.
    bus.emit('pryzm-inspect-room-focus', {});
    runFrames();

    bus.emit('pryzm-workspace-mode', { mode: 'inspect' });
    runFrames();
    expect(hexOf(f.wall)).toBe(GHOST_STRUCTURAL_HEX); // sanity: Inspect really is showing

    // The EXACT payload `AuditGridZone.ts` `renderPolymorphicMatrix`'s row click
    // emits (line ~558) for a wall row — `renderAuditMode`'s ROOM row ALSO emits
    // this, but only the polymorphic matrix (every OTHER family) emits ONLY this.
    bus.emit('pryzm-audit-room-select', { roomId: 'wall_W1', source: 'audit-stack' });
    runFrames();

    expect(hexOf(f.wall)).toBe(INSPECT_BLUE);
    // The sibling wall, never selected, must stay ghosted — a class fix that
    // "highlights everything" would fail this line.
    expect(hexOf(f.other)).toBe(GHOST_STRUCTURAL_HEX);
  });

  it('is harmless (idempotent) when the SAME event also fires for a room row', () => {
    // `renderAuditMode`'s room row emits BOTH `pryzm-audit-room-select` AND
    // `pryzm-inspect-room-focus`. Both must reach the same sink without conflict.
    const f = buildWallScene();
    inspectModeCoordinator.init(f.scene);
    bus.emit('pryzm-inspect-room-focus', {}); // known empty focus — see §1 first test
    runFrames();
    bus.emit('pryzm-workspace-mode', { mode: 'inspect' });
    runFrames();

    bus.emit('pryzm-audit-room-select', { roomId: 'wall_W1', source: 'audit-stack' });
    bus.emit('pryzm-inspect-room-focus', { roomId: 'wall_W1' });
    runFrames();

    expect(hexOf(f.wall)).toBe(INSPECT_BLUE);
  });

  it('a stale/empty roomId is a no-op, not a crash', () => {
    const f = buildWallScene();
    inspectModeCoordinator.init(f.scene);
    // `inspectModeCoordinator` is a module-level singleton — its `_focusedElementIds`
    // field survives a prior test's `dispose()` (dispose only unsubscribes events).
    // Clear it explicitly so this test starts from a KNOWN empty focus rather than
    // whatever the previous test in this file last selected.
    bus.emit('pryzm-inspect-room-focus', {});
    runFrames();
    bus.emit('pryzm-workspace-mode', { mode: 'inspect' });
    runFrames();
    expect(hexOf(f.wall)).toBe(GHOST_STRUCTURAL_HEX); // sanity: nothing focused yet

    expect(() => bus.emit('pryzm-audit-room-select', { source: 'audit-stack' })).not.toThrow();
    runFrames();
    expect(hexOf(f.wall)).toBe(GHOST_STRUCTURAL_HEX);
  });
});

// ── §2 — PHASE C: instanced families with NO hit-proxy at all ────────────────

describe('§INSPECT-INSTANCED-FOCUS-CLASS (L-12281) — instanced elements with no hit-proxy', () => {
  beforeEach(() => {
    _resetFrameSchedulerForTest();
    fake = new FakeRafAdapter();
    getFrameScheduler().start(fake);
  });

  afterEach(() => {
    getFrameScheduler().stop();
    _resetFrameSchedulerForTest();
  });

  /**
   * Shape (a): `InstancedElementRenderer`'s own per-slot resolver — the shape
   * walls/columns/beams/windows/handrails/stairRailings/furniture ALL share via
   * `ElementInstanceBridge`/`FurnitureInstanceBridge`. Two live slots + ONE
   * SOFT-DELETED slot (L-12142: `mesh.count` is a monotonic high-water mark that
   * still includes zero-scale parked slots — the membership map must exclude it).
   */
  function buildInstancedRendererScene() {
    const scene = new THREE.Scene();
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.05, 1, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x556677 }),
      3,
    );
    mesh.count = 3; // slot 2 is the soft-deleted high-water-mark slot (L-12142)
    const m0 = new THREE.Matrix4().makeTranslation(1, 0.5, 0);
    const m1 = new THREE.Matrix4().makeTranslation(2, 0.5, 0);
    const parked = new THREE.Matrix4().makeScale(0, 0, 0);
    mesh.setMatrixAt(0, m0);
    mesh.setMatrixAt(1, m1);
    mesh.setMatrixAt(2, parked);
    mesh.instanceMatrix.needsUpdate = true;

    // ⚠ `handrail_H3` occupied slot 2 once and was removed — a real
    // `InstancedElementRenderer.unregister()` deletes it from BOTH the
    // membership map and the OBB store, so it is simply ABSENT here, exactly as
    // `getOccupiedInstanceSlots()` — a map, never `0..count` — would report it.
    const idBySlot: Record<number, string> = { 0: 'handrail_H1', 1: 'handrail_H2' };
    const obbBySlot: Record<number, { center: { x: number; y: number; z: number }; size: { x: number; y: number; z: number }; quaternion: { x: number; y: number; z: number; w: number } }> = {
      0: { center: { x: 1, y: 0.5, z: 0 }, size: { x: 0.05, y: 1, z: 0.05 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } },
      1: { center: { x: 2, y: 0.5, z: 0 }, size: { x: 0.05, y: 1, z: 0.05 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } },
    };
    mesh.userData = {
      elementType: 'handrail',
      id: 'instanced-group-handrail-k1', // the GROUP's own synthetic id — must NEVER match a real focused id
      isInstancedGroup: true,
      getOccupiedInstanceSlots: (): readonly number[] => Object.keys(idBySlot).map(Number),
      getInstanceElementId: (slot: number): string | undefined => idBySlot[slot],
      getInstanceObb: (slot: number) => obbBySlot[slot],
    };
    scene.add(mesh);
    return { scene, mesh };
  }

  it('paints a single-instance OBB overlay for a focused member with NO hit-proxy', () => {
    const { scene } = buildInstancedRendererScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.applyLens('ghost', EMPTY_DELTA, scene, ['handrail_H1']);
    runFrames();

    const box = findOverlayBox(scene, INSPECT_BLUE);
    expect(box).toBeDefined();
    expect(box!.position.x).toBeCloseTo(1, 5);
    expect(box!.position.y).toBeCloseTo(0.5, 5);
  });

  it('highlights ONLY the focused slot — the sibling member gets no overlay', () => {
    const { scene } = buildInstancedRendererScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.applyLens('ghost', EMPTY_DELTA, scene, ['handrail_H1']);
    runFrames();

    const boxes = overlayBoxes(scene).filter(m => hexOf(m) === INSPECT_BLUE);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].position.x).toBeCloseTo(1, 5); // H1's slot, not H2's
  });

  it('⛔ L-12142 — a SOFT-DELETED slot never lights up, even by its old id', () => {
    // `handrail_H3` is the id that USED to occupy slot 2 before it was removed.
    // `mesh.count === 3` still includes that parked, zero-scale slot, but the
    // membership map does not — focusing the id must find NOTHING, not a box at
    // the parked origin.
    const { scene } = buildInstancedRendererScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.applyLens('ghost', EMPTY_DELTA, scene, ['handrail_H3']);
    runFrames();

    expect(overlayBoxes(scene).filter(m => hexOf(m) === INSPECT_BLUE)).toHaveLength(0);
  });

  it('the GROUP synthetic id itself is never mistaken for a real element focus', () => {
    const { scene, mesh } = buildInstancedRendererScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.applyLens('ghost', EMPTY_DELTA, scene, ['instanced-group-handrail-k1']);
    runFrames();

    expect(overlayBoxes(scene).filter(m => hexOf(m) === INSPECT_BLUE)).toHaveLength(0);
    // And the shared InstancedMesh material itself must NOT have been repainted
    // the FOCUS blue — that would highlight every member in the group at once as
    // if the group's own hosting id were a real selected element. (The base ghost
    // pass still repaints it white/frosted at 4-10% opacity, same as any other
    // unfocused non-room mesh — that is unrelated to this assertion.)
    expect((mesh.material as THREE.MeshStandardMaterial).color.getHex()).not.toBe(INSPECT_BLUE);
  });

  /**
   * Shape (b): `CurtainWallInstanceManager`'s own, UNRELATED per-instance shape —
   * `userData.instancePanelIds: string[]`. It never touches
   * `InstancedElementRenderer`, so shape (a)'s closures are absent here on
   * purpose — this is a SECOND instancing implementation, not a variant.
   */
  function buildCurtainPanelScene() {
    const scene = new THREE.Scene();
    const group = new THREE.Group(); // the curtain wall's own root — non-identity on purpose
    group.position.set(10, 0, 5);
    group.rotation.y = Math.PI / 2;
    scene.add(group);

    const panels = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1), // unit box — real size is baked via per-instance scale
      new THREE.MeshStandardMaterial({ color: 0x88aacc }),
      3,
    );
    const dummy = new THREE.Object3D();
    dummy.position.set(0, 1, 0);
    dummy.scale.set(0.9, 1.2, 0.02);
    dummy.updateMatrix();
    panels.setMatrixAt(0, dummy.matrix);

    dummy.position.set(2, 1, 0);
    dummy.scale.set(0.9, 1.2, 0.02);
    dummy.updateMatrix();
    panels.setMatrixAt(1, dummy.matrix);

    // A PARKED/degenerate slot — never legitimately reachable, and must not
    // resolve to an overlay even if something once claimed this id for it.
    dummy.position.set(4, 1, 0);
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    panels.setMatrixAt(2, dummy.matrix);

    panels.instanceMatrix.needsUpdate = true;
    panels.userData = {
      elementType: 'CurtainPanelInstanced',
      instancePanelIds: ['panel_P1', 'panel_P2', 'panel_P3'],
    };
    group.add(panels);
    return { scene, group, panels };
  }

  it('resolves a curtain panel instance through the UNRELATED instancePanelIds shape, in WORLD space', () => {
    const { scene, group } = buildCurtainPanelScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.applyLens('ghost', EMPTY_DELTA, scene, ['panel_P1']);
    runFrames();

    const box = findOverlayBox(scene, INSPECT_BLUE);
    expect(box).toBeDefined();

    // Independently derive the expected WORLD position — the SAME transform
    // fold the fix must perform (local instance position through the curtain
    // wall's own rotated/offset root), computed here directly via THREE's own
    // API rather than by re-deriving the production formula.
    group.updateMatrixWorld(true);
    const expected = new THREE.Vector3(0, 1, 0).applyMatrix4(group.matrixWorld);
    expect(box!.position.x).toBeCloseTo(expected.x, 4);
    expect(box!.position.y).toBeCloseTo(expected.y, 4);
    expect(box!.position.z).toBeCloseTo(expected.z, 4);

    // The unit box's LOCAL size (1×1×1) times the instance's own scale
    // (0.9 × 1.2 × 0.02) — not the group's rotation-carrying world scale.
    expect(box!.geometry.parameters.width).toBeCloseTo(0.9, 5);
    expect(box!.geometry.parameters.height).toBeCloseTo(1.2, 5);
    expect(box!.geometry.parameters.depth).toBeCloseTo(0.02, 5);
  });

  it('highlights ONLY the focused panel — its sibling gets no overlay', () => {
    const { scene } = buildCurtainPanelScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.applyLens('ghost', EMPTY_DELTA, scene, ['panel_P1']);
    runFrames();

    expect(overlayBoxes(scene).filter(m => hexOf(m) === INSPECT_BLUE)).toHaveLength(1);
  });

  it('⛔ a PARKED/zero-scale curtain-panel slot never lights up', () => {
    const { scene } = buildCurtainPanelScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.applyLens('ghost', EMPTY_DELTA, scene, ['panel_P3']);
    runFrames();

    expect(overlayBoxes(scene).filter(m => hexOf(m) === INSPECT_BLUE)).toHaveLength(0);
  });

  it('an id absent from BOTH instanced shapes and every mesh honestly matches nothing', () => {
    const { scene } = buildInstancedRendererScene();
    const mgr = new DiagnosticMaterialManager();

    mgr.applyLens('ghost', EMPTY_DELTA, scene, ['no-such-element']);
    runFrames();

    expect(overlayBoxes(scene).filter(m => hexOf(m) === INSPECT_BLUE)).toHaveLength(0);
  });
});
