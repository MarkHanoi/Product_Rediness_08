/**
 * §3D-CARRIES-NO-VG-FILL (L-1560) — "Materiales goes off when swapping views."
 *
 * CHARACTERISATION FIRST, then the lock.
 *
 * The founder's report is that assigned materials revert / go flat after a view
 * swap. Three mechanisms were on the table (see the lane brief): (a) LOSS — the
 * authored material is not re-read on rebuild; (b) OVERWRITE — per-view styling
 * re-applies over the authored material; (c) STALE CACHE — a cache key omits the
 * appearance version.
 *
 * This suite demonstrates (b) at the layer the user experiences: the LIVE
 * THREE.Mesh colour in the 3D scene, before and after a plan→3D round trip.
 * No rebuild happens in these tests, so (a) cannot be the cause of anything they
 * catch; no cache is consulted, so (c) cannot either.
 *
 * The mechanism:
 *   `VGSceneApplicator.applyToMesh()` writes `style.fillColor` — a 2D plan-poche
 *   concept — onto the live 3D material of EVERY category. Contract 25 §3 and the
 *   applicator's own §VG-3D-FIX comment both say 3D views carry NO VG styling
 *   data. §VG-3D-FIX honoured that with a hand-maintained ALLOWLIST OF FOUR WALL
 *   TYPES (`WALL_BODY_3D_TYPES`). Every other element family the 3D builders emit
 *   — `Slab`/`SlabPart`, `Column`, `Stair`, `Handrail`, `Furniture`/`FurniturePart`,
 *   `Door`, `Window`, `CurtainWall`/`CurtainPanel`, `PlumbingFixture`,
 *   `floor`, `ceiling` — fell straight through to
 *   `mat.color.set(style.fillColor)`, in the 3D view, on every view switch.
 *
 * C84 EI-8: colour/material is ONE vocabulary. The fix collapses to ONE producer
 * of 3D surface colour (the builder's authored material, patched only by the
 * intent system's `surface3D`) rather than reconciling a second one per type.
 */

// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { VGSceneApplicator } from './VGSceneApplicator';
import { vgGovernanceStore } from './VGGovernanceStore';
import { viewDefinitionStore } from '../views/ViewDefinitionStore';

const PLAN_VIEW_ID = 'vd-test-plan-l0';
const THREED_VIEW_ID = 'vd-test-3d';

/**
 * The element families the 3D builders actually stamp onto scene objects, with
 * the file that stamps them. Measured 2026-08-20 with
 * `rg "elementType:" -g "packages/geometry-**"`.
 *
 * `authored` is a distinctive colour standing in for whatever the builder baked
 * in (materialColor / catalogue material / per-element resolver).
 */
const FAMILIES: ReadonlyArray<{ elementType: string; authored: number; builder: string }> = [
    { elementType: 'WallPart',        authored: 0xb22222, builder: 'geometry-wall/WallFragmentBuilder' },
    { elementType: 'SlabPart',        authored: 0x336699, builder: 'geometry-slab/SlabFragmentBuilder:1594' },
    { elementType: 'Column',          authored: 0x2e7d32, builder: 'geometry-column/ColumnFragmentBuilder:293' },
    { elementType: 'Stair',           authored: 0x8b4513, builder: 'geometry-stair/StairMeshBuilder:155' },
    { elementType: 'Handrail',        authored: 0xffd700, builder: 'geometry-handrail/HandrailFragmentBuilder:349' },
    { elementType: 'FurniturePart',   authored: 0x9c27b0, builder: 'engine/initFurnitureInteraction:62' },
    { elementType: 'Door',            authored: 0x00838f, builder: 'geometry-door/DoorBuilder:537' },
    { elementType: 'Window',          authored: 0xef6c00, builder: 'geometry-window/WindowBuilder:673' },
    { elementType: 'CurtainPanel',    authored: 0x6d4c41, builder: 'geometry-curtain-wall/CurtainPanelFactory:195' },
    { elementType: 'PlumbingFixture', authored: 0x1b5e20, builder: 'geometry-plumbing/PlumbingFragmentBuilder:28' },
    { elementType: 'ceiling',         authored: 0x795548, builder: 'geometry-slab/ceiling/CeilingPanelBuilder:241' },
    { elementType: 'floor',           authored: 0x455a64, builder: 'geometry-slab/floor/FloorPanelBuilder:148' },
];

function buildScene(): { scene: THREE.Scene; meshes: Map<string, THREE.Mesh> } {
    const scene = new THREE.Scene();
    const meshes = new Map<string, THREE.Mesh>();
    for (const fam of FAMILIES) {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshStandardMaterial({ color: fam.authored }),
        );
        mesh.userData = {
            id: `el-${fam.elementType}`,
            elementId: `el-${fam.elementType}`,
            elementType: fam.elementType,
            modelId: 'model-default',
            levelId: 'L0',
        };
        scene.add(mesh);
        meshes.set(fam.elementType, mesh);
    }
    return { scene, meshes };
}

function hexOf(mesh: THREE.Mesh): number {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    return mat.color.getHex();
}

describe('§3D-CARRIES-NO-VG-FILL (L-1560) — a plan→3D round trip must not repaint the model', () => {
    let scene: THREE.Scene;
    let meshes: Map<string, THREE.Mesh>;
    let applicator: VGSceneApplicator;

    beforeEach(() => {
        viewDefinitionStore.reset();
        viewDefinitionStore.create({ id: PLAN_VIEW_ID,   name: 'Level 0',  viewType: 'plan', spatial: { levelId: 'L0' } });
        viewDefinitionStore.create({ id: THREED_VIEW_ID, name: '3D View',  viewType: '3d' });
        vgGovernanceStore.ensureModel('model-default', 'Main Model');
        ({ scene, meshes } = buildScene());
        applicator = new VGSceneApplicator(scene, vgGovernanceStore as never, 'model-default');
    });

    afterEach(() => {
        applicator.dispose();
        vgGovernanceStore.resetModelCategoryOverride('model-default', 'stair');
        viewDefinitionStore.reset();
    });

    it('CHARACTERISATION — the plan view DOES repaint every category (this is correct, and it is 2D poche)', () => {
        applicator.applyAll(PLAN_VIEW_ID);
        // At least the structural families must have moved off their authored colour:
        // if they had NOT, the whole premise below would be untested.
        const slab = meshes.get('SlabPart')!;
        expect(hexOf(slab)).not.toBe(0x336699);
    });

    it('the 3D view restores EVERY family, not just wall bodies (round trip is identity)', () => {
        const before = new Map<string, number>();
        for (const [t, m] of meshes) before.set(t, hexOf(m));

        // Swap: 3D → plan → 3D.
        applicator.applyAll(THREED_VIEW_ID);
        applicator.applyAll(PLAN_VIEW_ID);
        applicator.applyAll(THREED_VIEW_ID);

        const drifted: string[] = [];
        for (const [t, m] of meshes) {
            if (hexOf(m) !== before.get(t)) {
                drifted.push(
                    `${t}: authored #${before.get(t)!.toString(16).padStart(6, '0')} → ` +
                    `#${hexOf(m).toString(16).padStart(6, '0')}`,
                );
            }
        }
        expect(drifted).toEqual([]);
    });

    it('a direct 3D apply (no plan visit) never writes VG fillColor either', () => {
        const before = new Map<string, number>();
        for (const [t, m] of meshes) before.set(t, hexOf(m));

        applicator.applyAll(THREED_VIEW_ID);

        for (const [t, m] of meshes) {
            expect(`${t}=${hexOf(m).toString(16)}`).toBe(`${t}=${before.get(t)!.toString(16)}`);
        }
    });

    /**
     * The SECOND half of the defect: `ViewController` emits
     * `view-selected { viewId: null }` for the 3D view whenever activation did not
     * go through the View Browser rail (ViewCube, BottomActionMenu, the
     * activate('3D') error fallback). The applicator's handler is `if (viewId)`,
     * so it does nothing at all — `activeViewId` stays pinned to the PLAN view and
     * the poche colours are simply left on screen.
     *
     * `view-activated` is emitted on EVERY activation and always carries
     * `mode: '3D'`, so it is the reliable authority.
     */
    it('a 3D activation with a null view-selected id still restores the model', () => {
        applicator.applyAll(PLAN_VIEW_ID);

        window.dispatchEvent(new CustomEvent('view-activated', {
            detail: { view: {}, mode: '3D', type: 'perspective', source: 'view-switch', camera: {} },
        }));
        window.dispatchEvent(new CustomEvent('view-selected', { detail: { viewId: null } }));

        for (const fam of FAMILIES) {
            const m = meshes.get(fam.elementType)!;
            expect(`${fam.elementType}=${hexOf(m).toString(16)}`)
                .toBe(`${fam.elementType}=${fam.authored.toString(16)}`);
        }
    });

    /**
     * Non-colour VG semantics that ARE valid in 3D must survive the fix:
     * hide/isolate (visible) and ghost (transparency). Regressing these would
     * silently break VG hide in 3D.
     */
    /**
     * The shared-material hazard. Element builders cache one material per
     * (levelId, colour) — the `_sharedFrameMats` idiom — so several elements hold
     * the SAME `THREE.Material` reference. VG's 3D leg applies ghost / phase /
     * glazing transparency, and if it did so IN PLACE it would re-ghost every
     * other element sharing that reference and overwrite an authored glass
     * opacity with the template's. It must write to a VG-owned clone instead.
     */
    it('3D transparency lands on a VG-owned clone, never on the shared authored material', () => {
        const shared = new THREE.MeshStandardMaterial({ color: 0x223344, opacity: 0.25, transparent: true });
        const glazed = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared);
        glazed.userData = { id: 'w-1', elementId: 'w-1', elementType: 'Window', modelId: 'model-default', levelId: 'L0' };
        const sibling = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared);
        sibling.userData = { id: 'w-2', elementId: 'w-2', elementType: 'Window', modelId: 'model-default', levelId: 'L0' };
        scene.add(glazed, sibling);

        applicator.applyAll(THREED_VIEW_ID);

        // The authored (shared) material is untouched in every field.
        expect(shared.opacity).toBe(0.25);
        expect(shared.color.getHex()).toBe(0x223344);
        // The mesh now renders through a clone that carries the authored COLOUR
        // and the VG transparency (template: window = 40).
        const live = glazed.material as THREE.MeshStandardMaterial;
        expect(live).not.toBe(shared);
        expect(live.color.getHex()).toBe(0x223344);
        expect(live.opacity).toBeCloseTo(0.6, 5);
    });

    /**
     * Repeated swaps must not accumulate: the clone is reused, and its colour is
     * re-synced from the authored material every pass, so a poche colour written
     * while the mesh sat in a plan view can never survive forward into 3D.
     */
    it('twenty plan↔3D swaps neither drift the colour nor mint a new material each time', () => {
        const glazed = meshes.get('Window')!;
        applicator.applyAll(THREED_VIEW_ID);
        const firstClone = glazed.material;

        for (let i = 0; i < 20; i++) {
            applicator.applyAll(PLAN_VIEW_ID);
            applicator.applyAll(THREED_VIEW_ID);
        }

        expect(glazed.material).toBe(firstClone);
        expect(hexOf(glazed)).toBe(0xef6c00);

        const drifted = [...meshes].filter(([t, m]) =>
            hexOf(m) !== FAMILIES.find(f => f.elementType === t)!.authored,
        ).map(([t]) => t);
        expect(drifted).toEqual([]);
    });

    /**
     * §H2 / LRU-eviction shape from the lane brief: the NativeElementMeshExporter
     * proxy cache evicts on every switch, so an element can be rebuilt mid-session
     * and hand the scene a BRAND NEW material instance. VG's snapshot
     * (`vgOriginalMaterial`) was taken against the OLD one. The 3D leg must follow
     * the re-assignment rather than restoring a stale snapshot.
     */
    it('a material re-assigned after VG first saw the mesh is respected, not reverted', () => {
        const stair = meshes.get('Stair')!;
        applicator.applyAll(PLAN_VIEW_ID);   // VG snapshots + clones the mesh.

        // The element rebuilds (cache miss) and the builder hands over a new material.
        stair.material = new THREE.MeshStandardMaterial({ color: 0x00ff7f });
        delete stair.userData.vgOriginalMaterial;   // builders re-stamp userData on rebuild
        delete stair.userData.vgClonedMaterial;

        applicator.applyAll(THREED_VIEW_ID);
        expect(hexOf(stair).toString(16)).toBe('ff7f');
    });

    /**
     * The same staleness, WITHOUT the userData being re-stamped — the harder case.
     * A catalogue material applied in place leaves `vgOriginalMaterial` pointing at
     * the material the user just replaced. Writing that snapshot back on the next
     * view switch would BE the founder's defect, arriving through the restore path
     * rather than the fillColor path. VG restores only what VG installed.
     */
    it('an in-place material re-assignment survives the 3D restore (stale snapshot is not written back)', () => {
        const column = meshes.get('Column')!;
        applicator.applyAll(THREED_VIEW_ID);   // VG snapshots the authored material.

        // User assigns a new material; nothing clears VG's userData.
        column.material = new THREE.MeshStandardMaterial({ color: 0x123456 });

        applicator.applyAll(PLAN_VIEW_ID);
        applicator.applyAll(THREED_VIEW_ID);

        expect(hexOf(column).toString(16)).toBe('123456');
    });

    /**
     * The DOC-4.7 underlay path swaps in the P4.4 dot-grid ShaderMaterial. Returning
     * to 3D must take the mesh back off it — a shader left on is "the material went
     * off" in the most literal sense.
     */
    it('an underlay halftone is removed on return to 3D', () => {
        applicator.setUnderlayLevelId('L0');
        applicator.applyAll(PLAN_VIEW_ID);
        const stair = meshes.get('Stair')!;
        expect(stair.userData.vgHalftone).toBeDefined();

        applicator.setUnderlayLevelId(null);
        applicator.applyAll(THREED_VIEW_ID);

        expect(stair.userData.vgHalftone).toBeUndefined();
        expect(hexOf(stair)).toBe(0x8b4513);
    });

    /**
     * `@thatopen/fragments` hands back objects whose `userData` is sealed, and a
     * throw inside `scene.traverse()` aborts the whole walk — which would leave
     * every element AFTER the sealed one un-restored. That is "materials went off"
     * for an arbitrary suffix of the model, which is close to how the founder
     * described it, so it is worth locking that the walk completes.
     *
     * ⚠ HONEST SCOPE — this test does NOT prove the `deleteUD` conversion.
     * Falsified 2026-08-20: reverting `deleteUD(mesh, 'vgHalftone')` and
     * `deleteUD(mesh, this.CLONED_KEY)` back to bare `delete` leaves this test
     * GREEN. The reason is that `setUD()` reaches its step-3 branch on the first
     * touch of a sealed map and REPLACES `userData` with an extensible copy, so no
     * later `delete` in this file ever meets a sealed object. The `deleteUD`
     * conversion is therefore defence in depth against a future ordering change,
     * not a fix for a reachable throw — recorded here rather than claimed.
     */
    it('a sealed-userData fragment in the scene does not break the round trip', () => {
        const sealed = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshStandardMaterial({ color: 0x010203 }),
        );
        sealed.userData = Object.seal({
            id: 'ifc-1', elementId: 'ifc-1', elementType: 'Slab',
            modelId: 'model-default', levelId: 'L0',
            vgHalftone: undefined, vgClonedMaterial: undefined,
        });
        // Insert it FIRST so anything downstream of an abort would be visible.
        scene.children.unshift(sealed);

        expect(() => {
            applicator.applyAll(PLAN_VIEW_ID);
            applicator.applyAll(THREED_VIEW_ID);
        }).not.toThrow();

        // Everything after the sealed object still round-tripped.
        for (const fam of FAMILIES) {
            const m = meshes.get(fam.elementType)!;
            expect(`${fam.elementType}=${hexOf(m).toString(16)}`)
                .toBe(`${fam.elementType}=${fam.authored.toString(16)}`);
        }
    });

    /**
     * §VG-VIEW-IDENTITY-IS-A-CALL (L-1563) — the REACHABLE path.
     *
     * The event tests above exercise a channel that production does not actually
     * use: `ViewController` emits on `runtime.events`
     * (runtime-composer/src/EventBus.ts — a Map of handler sets, no
     * `window.dispatchEvent` anywhere in it), while this class subscribes with
     * `window.addEventListener`. Nothing bridges them, so `activeViewId` stayed
     * null for the whole session and `setUnderlayLevelId()` — a DIRECT call
     * ViewController really does make on plan and 3D activation — drove a full
     * traversal with no view type, i.e. straight down the 2D poche path in 3D.
     *
     * These two tests use only direct calls, so they hold on the wiring that ships.
     */
    it('the underlay-driven traversal no longer paints poche once the view identity is set (3D)', () => {
        applicator.setActiveView(null, '3d');
        const before = new Map([...meshes].map(([t, m]) => [t, hexOf(m)] as const));

        // Exactly what ViewController._activate3DView does.
        applicator.setUnderlayLevelId(null);
        applicator.setUnderlayLevelId('L0');
        applicator.setUnderlayLevelId(null);

        for (const [t, m] of meshes) {
            expect(`${t}=${hexOf(m).toString(16)}`).toBe(`${t}=${before.get(t)!.toString(16)}`);
        }
    });

    it('setActiveView round-trips plan→3D with no drift, using no events at all', () => {
        const before = new Map([...meshes].map(([t, m]) => [t, hexOf(m)] as const));

        applicator.setActiveView(PLAN_VIEW_ID, 'plan');
        expect(hexOf(meshes.get('SlabPart')!)).not.toBe(before.get('SlabPart'));

        applicator.setActiveView(null, '3d');       // ViewCube path — no view id.
        for (const [t, m] of meshes) {
            expect(`${t}=${hexOf(m).toString(16)}`).toBe(`${t}=${before.get(t)!.toString(16)}`);
        }

        applicator.setActiveView(THREED_VIEW_ID, '3d');   // rail path — with an id.
        for (const [t, m] of meshes) {
            expect(`${t}=${hexOf(m).toString(16)}`).toBe(`${t}=${before.get(t)!.toString(16)}`);
        }
    });

    it('visibility and transparency ARE still applied in 3D', () => {
        vgGovernanceStore.setModelCategoryOverride('model-default', 'stair', { visible: false });
        applicator.applyAll(THREED_VIEW_ID);
        expect(meshes.get('Stair')!.visible).toBe(false);
    });
});
