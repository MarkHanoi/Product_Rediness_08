/**
 * §MESH110-SHADOW-POLICY (L-11565) — the per-family shadow-caster policy, and the
 * sweep that executes it.
 *
 * THE MEASUREMENT: 907 of the founder's 978 meshes were shadow casters, and the
 * only "policy" in the scene was `_enableShadowsOnScene`'s blanket promotion —
 * which also silently UNDID every deliberate builder non-caster (the furniture
 * budget's decorative-off, CeilingPanelBuilder's `castShadow = false`, the
 * lighting builder's cables). These tests pin the three verdicts and, separately,
 * that the sweep EXECUTES them — because a policy the sweep ignores is exactly
 * the defect L-11565 measured.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { shadowCasterVerdict, MIN_CASTER_RADIUS_M } from './shadowCasterPolicy';
import { pascalSceneLighting } from './PascalSceneLighting';

// ── The pure verdicts ──────────────────────────────────────────────────────────

describe('shadowCasterVerdict — the pure per-family policy', () => {
    it('structural BIM families cast (wall / slab / door / window / column / stair)', () => {
        for (const elementType of ['wall', 'Slab', 'Door', 'DoorLeaf', 'Window', 'beam', 'Stair', 'CurtainWall']) {
            expect(shadowCasterVerdict({ elementType })).toBe('cast');
        }
    });

    it('a mesh with NO attribution at all casts — unattributed geometry keeps today\'s look', () => {
        expect(shadowCasterVerdict({})).toBe('cast');
    });

    it('a builder-declared shadowPolicy=never is the strongest verdict — it beats every family arm', () => {
        expect(shadowCasterVerdict({ shadowPolicy: 'never' })).toBe('no-cast');
        expect(shadowCasterVerdict({ shadowPolicy: 'never', elementType: 'wall' })).toBe('no-cast');
        expect(shadowCasterVerdict({ shadowPolicy: 'never', furnitureType: 'sofa' })).toBe('no-cast');
    });

    it('hit-proxies never cast — an invisible raycast helper must not render shadow depth', () => {
        expect(shadowCasterVerdict({ role: 'hit-proxy', elementType: 'wall' })).toBe('no-cast');
    });

    it('flat floor/wall decor never casts, at ANY tier (rug / carpets / wall art / curtains)', () => {
        for (const furnitureType of [
            'rug', 'wall_art', 'wall_mirror', 'wall_tapestry', 'curtain_rod', 'curtain_panel',
            'parametric_persian_carpet', 'round_carpet',
        ]) {
            expect(shadowCasterVerdict({ furnitureType, elementType: 'FurniturePart' })).toBe('no-cast');
        }
    });

    it('non-flat furniture is the BUILDER\'s call — the budget + engines own the flag', () => {
        expect(shadowCasterVerdict({ furnitureType: 'sofa', elementType: 'FurniturePart' })).toBe('builder');
        expect(shadowCasterVerdict({ elementType: 'KitchenCabinetPart' })).toBe('builder');
        expect(shadowCasterVerdict({ elementType: 'Furniture' })).toBe('builder');
    });

    it('lighting is the BUILDER\'s call — bodies cast, cables/lenses deliberately do not', () => {
        expect(shadowCasterVerdict({ elementType: 'Lighting' })).toBe('builder');
        expect(shadowCasterVerdict({ elementType: 'Lighting', role: 'lighting.lens' })).toBe('builder');
    });
});

// ── The sweep executes the verdicts ────────────────────────────────────────────

function sweep(scene: THREE.Scene): void {
    (pascalSceneLighting as unknown as { _enableShadowsOnScene(s: THREE.Scene): void })
        ._enableShadowsOnScene(scene);
}

function bimMesh(name: string, ud: Record<string, unknown>, size = 2): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshStandardMaterial());
    m.name = name;
    Object.assign(m.userData, ud);
    return m;
}

describe('PascalSceneLighting sweep executes §MESH110-SHADOW-POLICY', () => {
    let scene: THREE.Scene;

    beforeEach(() => {
        scene = new THREE.Scene();
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('a carpet already promoted by an earlier blanket pass is DEMOTED, not skipped', () => {
        const carpet = bimMesh('carpet', {
            elementType: 'FurniturePart', furnitureType: 'parametric_persian_carpet',
        });
        carpet.castShadow = true;  // the pre-policy sweep set this
        scene.add(carpet);

        sweep(scene);

        expect(carpet.castShadow).toBe(false);
        expect(carpet.receiveShadow).toBe(true);
    });

    it("the furniture budget's verdict finally STICKS — the sweep no longer re-promotes a decorative-off build", () => {
        // FurnitureFragmentBuilder built this at castShadow=false under
        // budget 'decorative-off'. Before this policy, the very next sweep
        // silently re-promoted it (the L-11565 finding).
        const plant = bimMesh('plant', { elementType: 'FurniturePart', furnitureType: 'plant_ficus' });
        plant.castShadow = false;
        scene.add(plant);

        // And a sofa the builder DID mark as caster keeps casting.
        const sofa = bimMesh('sofa', { elementType: 'FurniturePart', furnitureType: 'sofa' });
        sofa.castShadow = true;
        scene.add(sofa);

        sweep(scene);

        expect(plant.castShadow).toBe(false);   // builder verdict respected
        expect(sofa.castShadow).toBe(true);     // builder verdict respected
        expect(plant.receiveShadow).toBe(true);
        expect(sofa.receiveShadow).toBe(true);
    });

    it("lighting keeps its per-part flags — the builder's cables-don't-cast survives the sweep", () => {
        const body = bimMesh('fixture-body', { elementType: 'Lighting' }, 0.4);
        body.castShadow = true;
        const cable = bimMesh('fixture-cable', { elementType: 'Lighting' }, 0.4);
        cable.castShadow = false;
        scene.add(body, cable);

        sweep(scene);

        expect(body.castShadow).toBe(true);
        expect(cable.castShadow).toBe(false);
    });

    it("a ceiling panel's declared shadowPolicy='never' survives the sweep (it used to be re-promoted)", () => {
        const soffit = bimMesh('ceiling-body', { ceilingId: 'c1', role: 'body', shadowPolicy: 'never' }, 6);
        soffit.castShadow = false;
        scene.add(soffit);

        sweep(scene);

        expect(soffit.castShadow).toBe(false);
        expect(soffit.receiveShadow).toBe(true);
    });

    it('a hit-proxy is demoted — before the policy the shadow pass rendered its wall-sized depth', () => {
        const proxy = bimMesh('proxy', { role: 'hit-proxy' }, 4);
        proxy.castShadow = true;
        scene.add(proxy);

        sweep(scene);

        expect(proxy.castShadow).toBe(false);
    });

    it('a sub-texel part (< MIN_CASTER_RADIUS_M) is demoted on the cast path — it cannot mark one texel', () => {
        // A hinge-plate-sized box: 0.012 m => bounding radius ~0.010 m, far
        // below one ~10 cm shadow texel of the 1024²/±50 m map.
        const hinge = bimMesh('hinge', { elementType: 'Door' }, 0.012);
        hinge.castShadow = true;
        scene.add(hinge);

        sweep(scene);

        expect(hinge.castShadow).toBe(false);
        expect(hinge.receiveShadow).toBe(true);
        // The floor really is sub-texel scaled: this is a policy constant test,
        // not a magic number — one texel of the default map is ~0.1 m.
        expect(MIN_CASTER_RADIUS_M).toBeLessThanOrEqual(0.1);
    });

    it('structural geometry above the floor still casts — the policy must not eat the building', () => {
        const wall = bimMesh('wall_01', { elementType: 'wall', id: 'w1' }, 3);
        scene.add(wall);

        sweep(scene);

        expect(wall.castShadow).toBe(true);
        expect(wall.receiveShadow).toBe(true);
    });
});
