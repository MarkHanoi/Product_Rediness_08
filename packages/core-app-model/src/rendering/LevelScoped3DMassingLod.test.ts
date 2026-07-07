/**
 * §FIX-HEAVY-SCENE-MASSING-LOD (L-150) — the L-139 level-scoped 3D culler now renders
 * out-of-scope levels as a lightweight MASSING LOD (one instanced block per level)
 * instead of hiding them outright, so a large tower shows its whole silhouette while
 * full-detail BIM stays scoped to the active level ± N. Device-loss safety is kept:
 * far-level full geometry is still hidden (not submitted) — only its bounding box is
 * read to size the block.
 *
 * These tests lock in:
 *   • large model + default (massing) → far levels HIDDEN + present as a massing mesh
 *   • active-level change → LOD ↔ full-detail swaps cleanly (restore + retire parity)
 *   • 'scoped' mode → far levels hidden, NO massing (exact L-139 behaviour)
 *   • 'all' mode / legacy flag=false → everything full detail, no massing (escape hatch)
 *   • small model → service no-ops (nothing hidden, no massing)
 *   • setMode toggles create / clear the massing LOD and stay coherent with the flag
 *   • the massing mesh is a shadow-free helper (does not re-inflate the caster budget)
 *
 * Node env (no window): we drive derive() directly rather than via DOM events.
 * Imports the modules directly (not the barrel) to keep the node env free of
 * window-touching siblings.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { LevelScoped3DCullingService, type LevelScoped3DMode } from './LevelScoped3DCullingService';
import { levelMassingRenderer, LEVEL_MASSING_MESH_NAME } from './LevelMassingRenderer';

interface TestGlobals {
    __pryzmLevelScoped3DCulling?: boolean;
    __pryzmLevelScoped3DMode?: LevelScoped3DMode;
    __pryzmLevelScopedAdjacent?: number;
    __pryzmLevelCullStats?: unknown;
    bimManager?: unknown;
    projectContext?: unknown;
    threeCamera?: { isOrthographicCamera?: boolean };
}
function G(): TestGlobals {
    return globalThis as unknown as TestGlobals;
}

/** A BIM element root: a Group (as builders emit) with a child box mesh, stamped level. */
function addElement(scene: THREE.Scene, id: string, levelId: string, elevation: number): THREE.Object3D {
    const root = new THREE.Group();
    root.userData.id = id;
    root.userData.levelId = levelId;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), new THREE.MeshStandardMaterial());
    root.add(mesh);
    root.position.set(0, elevation, 0);
    scene.add(root);
    return root;
}

/**
 * Build an N-level tower (elementsPerLevel elements/level, default 2) and wire the
 * fake bim manager.
 *
 * §FIX-MASSING-LOD-THRESHOLD-TOO-AGGRESSIVE (L-164): the service now AUTO-ESCALATES to
 * massing ONLY on a device-loss-risk model — ≥ 15 levels AND ≥ 1000 elements (or ≥ 4000
 * elements outright). So a heavy tower is built with a high element count per level; a
 * modest building (few levels, low element count) must stay at full detail.
 */
function buildTower(
    scene: THREE.Scene,
    levelCount: number,
    activeLevelId: string,
    elementsPerLevel = 2,
): {
    levels: Array<{ id: string; elevation: number }>;
    rootsByLevel: Map<string, THREE.Object3D[]>;
} {
    const levels: Array<{ id: string; elevation: number }> = [];
    const rootsByLevel = new Map<string, THREE.Object3D[]>();
    for (let i = 0; i < levelCount; i++) {
        const levelId = `L${i}`;
        const elevation = i * 3;
        levels.push({ id: levelId, elevation });
        const roots: THREE.Object3D[] = [];
        for (let e = 0; e < elementsPerLevel; e++) {
            roots.push(addElement(scene, `${levelId}-${e}`, levelId, elevation));
        }
        rootsByLevel.set(levelId, roots);
    }
    G().bimManager = {
        getLevels: () => levels,
        getLevelForElement: () => null,
        activeLevelId,
    };
    return { levels, rootsByLevel };
}

/**
 * A genuinely device-loss-risk tower: 16 levels × 64 elements = 1024 elements — clears
 * BOTH the level gate (≥ 15) and the element gate (≥ 1000), so the service auto-escalates
 * to massing with NO explicit mode set. Active level 'L5', adjacency ±1 → visible L4/L5/L6,
 * 13 out-of-scope levels.
 */
const HEAVY_LEVELS = 16;
const HEAVY_PER_LEVEL = 64;
const HEAVY_HIDDEN_LEVELS = HEAVY_LEVELS - 3; // active ± 1 → 3 visible
function buildHeavyTower(scene: THREE.Scene, activeLevelId = 'L5') {
    return buildTower(scene, HEAVY_LEVELS, activeLevelId, HEAVY_PER_LEVEL);
}

function massingMesh(scene: THREE.Scene): THREE.Object3D | undefined {
    return scene.children.find((c) => c.name === LEVEL_MASSING_MESH_NAME);
}

let service: LevelScoped3DCullingService;
let scene: THREE.Scene;

beforeEach(() => {
    levelMassingRenderer.clear(); // reset the shared renderer singleton
    scene = new THREE.Scene();
    service = new LevelScoped3DCullingService();
    service.setScene(scene); // fans out to levelMassingRenderer.setScene
    const g = G();
    delete g.__pryzmLevelScoped3DCulling;
    delete g.__pryzmLevelScoped3DMode;
    delete g.__pryzmLevelScopedAdjacent;
    g.threeCamera = { isOrthographicCamera: false }; // 3D perspective view
});

afterEach(() => {
    levelMassingRenderer.clear();
    const g = G();
    delete g.bimManager;
    delete g.projectContext;
    delete g.threeCamera;
    delete g.__pryzmLevelScoped3DCulling;
    delete g.__pryzmLevelScoped3DMode;
});

describe('L-150 §FIX-HEAVY-SCENE-MASSING-LOD — massing LOD for out-of-scope levels', () => {
    it('heavy tower (auto-escalates to massing): far levels HIDDEN AND present as a massing mesh', () => {
        buildHeavyTower(scene, 'L5'); // 16 levels × 64 = 1024 elems → heavy; active L5, ±1 → visible L4/L5/L6
        service.derive();

        // No explicit mode set → auto-escalation resolves to massing on a heavy model.
        expect(service.getMode()).toBe('massing');

        // In-scope levels stay full detail (visible).
        for (const lvl of ['L4', 'L5', 'L6']) {
            for (const r of scene.children.filter((c) => c.userData.levelId === lvl)) {
                expect(r.visible).toBe(true);
            }
        }
        // Out-of-scope full-detail roots are hidden (device-loss safety preserved).
        const hiddenLevels = ['L0', 'L1', 'L2', 'L3', 'L7', 'L8', 'L9', 'L10', 'L11', 'L12', 'L13', 'L14', 'L15'];
        for (const lvl of hiddenLevels) {
            for (const r of scene.children.filter((c) => c.userData.levelId === lvl)) {
                expect(r.visible).toBe(false);
            }
        }
        // …but they are NOT invisible to the user: one massing block per out-of-scope level.
        expect(levelMassingRenderer.isActive).toBe(true);
        expect(levelMassingRenderer.levelCount).toBe(HEAVY_HIDDEN_LEVELS); // 13
        expect(massingMesh(scene)).toBeDefined();
    });

    it('massing mesh is a shadow-free helper (does not re-inflate the shadow-caster budget)', () => {
        buildHeavyTower(scene, 'L5');
        service.derive();
        const mesh = massingMesh(scene) as THREE.Mesh;
        expect(mesh).toBeDefined();
        expect(mesh.castShadow).toBe(false);
        expect(mesh.receiveShadow).toBe(false);
        expect(mesh.userData.isHelper).toBe(true);
        expect(mesh.userData.isMassingLod).toBe(true);
        // A single instanced block mesh → one draw call for the whole out-of-scope stack.
        expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
    });

    it('active-level change swaps LOD ↔ full detail cleanly', () => {
        const { rootsByLevel } = buildHeavyTower(scene, 'L5'); // visible L4/L5/L6
        service.derive();
        // L3 starts massed+hidden; L6 starts visible.
        expect(rootsByLevel.get('L3')!.every((r) => r.visible === false)).toBe(true);
        expect(rootsByLevel.get('L6')!.every((r) => r.visible === true)).toBe(true);

        // Move active down to L4 → visible L3/L4/L5. L3 restores, L6 drops out.
        (G().bimManager as { activeLevelId: string }).activeLevelId = 'L4';
        service.derive();

        expect(rootsByLevel.get('L3')!.every((r) => r.visible === true)).toBe(true);  // restored to full detail
        expect(rootsByLevel.get('L6')!.every((r) => r.visible === false)).toBe(true); // now hidden + massed
        expect(levelMassingRenderer.isActive).toBe(true);
        expect(levelMassingRenderer.levelCount).toBe(HEAVY_HIDDEN_LEVELS); // 16 - 3 in-scope
    });

    it("'scoped' mode hides far levels with NO massing (exact L-139 behaviour)", () => {
        buildTower(scene, 10, 'L5');
        service.setMode('scoped');
        expect(rootsHidden(scene, 'L0')).toBe(true);
        expect(levelMassingRenderer.isActive).toBe(false);
        expect(massingMesh(scene)).toBeUndefined();
    });

    it("'all' mode restores every level at full detail, no massing (escape hatch)", () => {
        buildTower(scene, 10, 'L5');
        service.setMode('massing'); // engage first
        expect(levelMassingRenderer.isActive).toBe(true);

        service.setMode('all');
        for (const c of scene.children) {
            if (c.name === LEVEL_MASSING_MESH_NAME) continue;
            if (c.userData.levelId) expect(c.visible).toBe(true);
        }
        expect(levelMassingRenderer.isActive).toBe(false);
        expect(massingMesh(scene)).toBeUndefined();
    });

    it('legacy console flag __pryzmLevelScoped3DCulling === false ⇒ all (back-compat)', () => {
        buildTower(scene, 10, 'L5');
        G().__pryzmLevelScoped3DCulling = false;
        service.derive();
        expect(service.getMode()).toBe('all');
        expect(rootsHidden(scene, 'L0')).toBe(false);
        expect(levelMassingRenderer.isActive).toBe(false);
    });

    it('small model → service no-ops (nothing hidden, no massing)', () => {
        // 4 levels, 8 elements → nowhere near device-loss-risk scale.
        buildTower(scene, 4, 'L1');
        service.derive();
        for (const c of scene.children) {
            if (c.userData.levelId) expect(c.visible).toBe(true);
        }
        expect(levelMassingRenderer.isActive).toBe(false);
        expect(massingMesh(scene)).toBeUndefined();
    });

    // ── §FIX-MASSING-LOD-THRESHOLD-TOO-AGGRESSIVE (L-164) regression guards ──────────
    // The L-150 default engaged massing at > 500 elements OR > 5 levels, so a normal
    // ~6-storey residential building collapsed its upper floors into a grey massing
    // block (the founder's "envelope shade"). These lock in full detail for anything a
    // normal GPU handles: massing auto-escalates ONLY on a genuinely huge model.

    it('L-164: a modest 6-storey / 600-element building renders FULL detail (no massing block)', () => {
        // Trips BOTH old gates (6 > 5 levels AND 600 > 500 elements) but neither new one
        // (6 < 15 levels; 600 < 4000). Default (no explicit mode) → 'all' → every floor full.
        buildTower(scene, 6, 'L0', 100); // 6 × 100 = 600 elements
        service.derive();

        expect(service.getMode()).toBe('all');
        for (const c of scene.children) {
            if (c.userData.levelId) expect(c.visible).toBe(true);
        }
        expect(levelMassingRenderer.isActive).toBe(false);
        expect(massingMesh(scene)).toBeUndefined();
        const stats = G().__pryzmLevelCullStats as { engaged: boolean };
        expect(stats.engaged).toBe(false);
    });

    it('L-164: a TALL-but-light tower (15 levels, 30 elems) stays full detail (AND gate)', () => {
        // Level gate met (15 ≥ 15) but NOT the element gate (30 < 1000) → not heavy.
        buildTower(scene, 15, 'L7'); // 15 × 2 = 30 elements
        service.derive();
        expect(service.getMode()).toBe('all');
        for (const c of scene.children) {
            if (c.userData.levelId) expect(c.visible).toBe(true);
        }
        expect(levelMassingRenderer.isActive).toBe(false);
    });

    it('L-164: an enormous single stack (≥ 4000 elements) DOES auto-escalate regardless of levels', () => {
        // Few levels but a huge element count → device-loss-risk on its own → massing.
        buildTower(scene, 8, 'L4', 520); // 8 × 520 = 4160 ≥ 4000 elements
        service.derive();
        expect(service.getMode()).toBe('massing');
        expect(levelMassingRenderer.isActive).toBe(true);
    });

    it('plan/section (orthographic) view stands down — no scoping, no massing', () => {
        buildTower(scene, 10, 'L5');
        service.setMode('massing');
        expect(levelMassingRenderer.isActive).toBe(true);

        G().threeCamera = { isOrthographicCamera: true };
        service.derive();
        for (const c of scene.children) {
            if (c.name === LEVEL_MASSING_MESH_NAME) continue;
            if (c.userData.levelId) expect(c.visible).toBe(true);
        }
        expect(levelMassingRenderer.isActive).toBe(false);
    });

    it('setMode toggles: massing → scoped clears massing; scoped → massing rebuilds it', () => {
        buildTower(scene, 10, 'L5');

        service.setMode('massing');
        expect(levelMassingRenderer.isActive).toBe(true);
        expect(G().__pryzmLevelScoped3DCulling).toBe(true); // flag stays coherent

        service.setMode('scoped');
        expect(levelMassingRenderer.isActive).toBe(false);
        expect(rootsHidden(scene, 'L0')).toBe(true); // still scoped (hidden)

        service.setMode('massing');
        expect(levelMassingRenderer.isActive).toBe(true);
        expect(levelMassingRenderer.levelCount).toBe(7);
    });

    it('exposes mode + massingLevels in the live stats snapshot', () => {
        buildHeavyTower(scene, 'L5');
        service.derive();
        const stats = G().__pryzmLevelCullStats as { mode: string; massingLevels: number; engaged: boolean };
        expect(stats.engaged).toBe(true);
        expect(stats.mode).toBe('massing');
        expect(stats.massingLevels).toBe(HEAVY_HIDDEN_LEVELS);
    });
});

/** True when every root on the level is hidden. */
function rootsHidden(scene: THREE.Scene, levelId: string): boolean {
    const roots = scene.children.filter((c) => c.userData.levelId === levelId);
    return roots.length > 0 && roots.every((r) => r.visible === false);
}
