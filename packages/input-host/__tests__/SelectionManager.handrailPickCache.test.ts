// @vitest-environment happy-dom
/**
 * §FIX-HANDRAIL-3D-PICK-CACHE (L-1190) — "Handrail selection on 3D view seems not
 * possible" (founder-reported 2026-08-19).
 *
 * ─── WHAT WAS ACTUALLY WRONG ────────────────────────────────────────────────
 * NOT the mesh, NOT the store, NOT the panel. `HandrailFragmentBuilder` stamps a
 * correct selectable root (`id`, `elementType: 'Handrail'`, `selectable: true`) and
 * `SEMANTIC_TYPES` has contained `'handrail'` since §SELECT-SEMANTIC-TYPE-NAMES.
 * The defect was ONE dead event key.
 *
 * `SelectionManager.init()`'s `cacheInvalidationEvents` listened for
 * `bim-railing-added` / `bim-railing-removed`. Measured 2026-08-19 across
 * `packages/ apps/ plugins/ src/`: **both have ZERO emitters** — nothing in this
 * repository dispatches either. The family emits `bim-handrail-added` /
 * `-removed` / `-updated` (`HandrailStore.emit`). So the listener whose job is to
 * keep the 3-D pick caches honest for railings was UNSATISFIABLE BY CONSTRUCTION —
 * the same shape as the `doorsRegistered=0` counter in §PICKDIAG-CASING (L-1173),
 * where two ISSUE-LOG rows were written off an instrument that could never fire.
 *
 * `_selectableCache` is built ONCE, lazily, and rebuilt only on those events. BOTH
 * 3-D pick paths read it and nothing else — `_buildElementRegistry()` feeds the GPU
 * pick's element registry (an id absent there has no clone in the pick scene, so
 * the pixel under the cursor belongs to whatever is BEHIND the railing) and
 * `_rebuildBVHFromCache()` builds the ray-prune AABBs. A handrail drawn after the
 * first hover therefore entered neither, and no railing event could ever invalidate
 * it. Plan view and the browser tree select BY ID and bypass both caches — which is
 * why the founder's property panel could show HANDRAIL HR046 while his 3-D click
 * could not reach it.
 *
 * ─── WHY THESE TESTS AND NOT A STUBBED RESOLVER ─────────────────────────────
 * They drive the REAL `init()` listener registration, the REAL `_ensureSelectableCache`
 * scene traversal and the REAL `_buildElementRegistry` / `findSelectableRoot` — the
 * exact functions the click path calls. Only the OBC world / camera / DOM are
 * structural fakes (same fakes as SelectionManager.selectPick.test.ts); none of them
 * is the thing under test. The handrail root's `userData` mirrors what
 * `HandrailFragmentBuilder` really stamps (ll.271-283 + the `role: 'geometry',
 * selectable: false` sub-meshes), so a builder change that broke this contract would
 * be caught here rather than papered over.
 *
 * Each test first asserts the NEGATIVE (the cache really is stale / the registry
 * really is blind) so it cannot pass vacuously — an assertion that can never fail is
 * how L-912/L-913 happened.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { SelectionManager } from '../src/SelectionManager.js';

// ── Minimal structural fakes (mirrors SelectionManager.selectPick.test.ts) ───

function makeWorld(scene: THREE.Scene) {
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
  cam.position.set(0, 2, 10);
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

/**
 * A handrail root as `HandrailFragmentBuilder` really builds it: a Group carrying
 * the semantic userData, with `role: 'geometry', selectable: false` sub-meshes for
 * the rail / posts / balusters. The sub-meshes deliberately carry NO `id` and NO
 * `parentId` — that is the builder's actual contract, and it is why the raycast leg
 * has to resolve the root by walking up to a SEMANTIC_TYPES ancestor.
 */
function makeHandrailRoot(scene: THREE.Scene, id: string): THREE.Group {
  const root = new THREE.Group();
  root.userData = {
    id,
    type: 'Handrail',
    elementType: 'Handrail',
    levelId: 'level-1',
    modelId: 'model-default',
    selectable: true,
    version: 1,
  };
  const rail = new THREE.Mesh(new THREE.BoxGeometry(3, 0.05, 0.05), new THREE.MeshBasicMaterial());
  rail.position.set(0, 1.1, 0);
  rail.userData = { role: 'geometry', selectable: false, member: 'rail' };
  root.add(rail);

  const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.1, 0.04), new THREE.MeshBasicMaterial());
  post.position.set(-1.5, 0.55, 0);
  post.userData = { role: 'geometry', selectable: false, member: 'post' };
  root.add(post);

  scene.add(root);
  root.updateMatrixWorld(true);
  return root;
}

/** A slab root, so the "warm the cache" step is not an empty-scene special case. */
function makeSlabRoot(scene: THREE.Scene, id: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 10), new THREE.MeshBasicMaterial());
  m.userData = { id, type: 'Slab', elementType: 'slab', selectable: true, levelId: 'level-1' };
  scene.add(m);
  m.updateMatrixWorld(true);
  return m;
}

type Internals = {
  _ensureSelectableCache: () => void;
  _selectableCache: THREE.Object3D[] | null;
  _bvhQuery: unknown | null;
  _buildElementRegistry: () => {
    ids: () => readonly string[];
    kindOf: (id: string) => string | null;
    objectFor: (id: string) => THREE.Object3D | null;
  };
  findSelectableRoot: (o: THREE.Object3D) => THREE.Object3D | null;
};

describe('§FIX-HANDRAIL-3D-PICK-CACHE — the 3-D pick caches must see a handrail', () => {
  // ONE manager for the file: `init()` registers a FrameScheduler tick listener under a
  // fixed id and the scheduler is a process-wide singleton, so a second init() throws.
  // That is the real class's real lifetime contract — respect it rather than stub it.
  const scene = new THREE.Scene();
  const mgr = makeManager(scene);
  const m = mgr as unknown as Internals;

  beforeAll(() => {
    mgr.init(); // registers the REAL window listeners under test
  });

  beforeEach(() => {
    // Reset to the "cold" state the class starts in; nothing else is touched.
    m._selectableCache = null;
    m._bvhQuery = null;
  });

  it('a handrail created after the cache is warm reaches the GPU pick element registry', () => {
    makeSlabRoot(scene, 'slab-1');

    // 1. Warm the cache exactly as the first hover/click does.
    m._ensureSelectableCache();
    expect(m._selectableCache, 'cache must be warm before the handrail is drawn').not.toBeNull();
    expect(m._buildElementRegistry().ids()).toContain('slab-1');

    // 2. The user draws a handrail — the builder adds the root to the scene.
    const root = makeHandrailRoot(scene, 'HR046');

    // NEGATIVE CONTROL — replay the click path (`_ensureSelectableCache()` then
    // `_buildElementRegistry()`, exactly as performSelection does). With a warm cache
    // and no invalidation, ensure() early-returns and the registry is genuinely blind.
    // If this ever starts passing, the assertion below is no longer measuring anything.
    m._ensureSelectableCache();
    expect(
      m._buildElementRegistry().objectFor('HR046'),
      'a stale cache must NOT already contain the new handrail — otherwise this test is vacuous',
    ).toBeNull();

    // 3. `HandrailStore.emit` dispatches this — the REAL key, not `bim-railing-added`.
    window.dispatchEvent(new CustomEvent('bim-handrail-added', { detail: { id: 'HR046' } }));

    // 4. Same click path again. The GPU pick's element registry — the structure whose
    //    absence made the click resolve to the slab underneath — now resolves the railing.
    m._ensureSelectableCache();
    const registry = m._buildElementRegistry();
    expect(registry.ids(), 'handrail id must be pickable').toContain('HR046');
    expect(registry.objectFor('HR046')).toBe(root);
    expect(String(registry.kindOf('HR046')).toLowerCase()).toBe('handrail');

    scene.remove(root);
  });

  it('bim-handrail-removed invalidates the caches so a deleted railing stops being pickable', () => {
    const root = makeHandrailRoot(scene, 'HR047');
    m._ensureSelectableCache();
    expect(m._buildElementRegistry().ids()).toContain('HR047');

    scene.remove(root);

    // NEGATIVE CONTROL — the stale cache still hands the GPU pick a detached object.
    m._ensureSelectableCache();
    expect(
      m._buildElementRegistry().ids(),
      'a stale cache must still list the removed railing — otherwise this test is vacuous',
    ).toContain('HR047');

    window.dispatchEvent(new CustomEvent('bim-handrail-removed', { detail: { id: 'HR047' } }));

    m._ensureSelectableCache();
    expect(m._buildElementRegistry().ids()).not.toContain('HR047');
  });

  it('bim-handrail-updated invalidates the BVH so a rebuilt railing is not pruned by a stale AABB', () => {
    const root = makeHandrailRoot(scene, 'HR048');
    m._ensureSelectableCache();
    expect(m._bvhQuery, 'BVH is built alongside the selectable cache').not.toBeNull();

    // A retype disposes and rebuilds the root's CHILDREN (the root object survives),
    // so every cached AABB captured from the old children is now stale.
    window.dispatchEvent(new CustomEvent('bim-handrail-updated', { detail: { id: 'HR048' } }));

    expect(m._selectableCache, 'cache must be invalidated on a handrail rebuild').toBeNull();
    expect(m._bvhQuery, 'BVH must be invalidated in lock-step').toBeNull();

    scene.remove(root);
  });

  it('findSelectableRoot resolves a handrail SUB-MESH to the semantic root (the raycast leg)', () => {
    const root = makeHandrailRoot(scene, 'HR049');
    const rail = root.children[0]!;

    // The sub-mesh carries role:'geometry' but NO parentId, so the PARENT_RESOLVED_ROLES
    // shortcut cannot fire — resolution depends entirely on 'handrail' being in
    // SEMANTIC_TYPES and the root carrying userData.id. Assert the real behaviour.
    expect(rail.userData.parentId).toBeUndefined();
    expect(m.findSelectableRoot(rail)).toBe(root);

    scene.remove(root);
  });
});
