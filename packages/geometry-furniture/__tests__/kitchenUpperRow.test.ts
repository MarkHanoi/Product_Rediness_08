// §KITCHEN107 (L-11600) — the upper (wall cabinet) row is an INDEPENDENT unit
// list with its own, narrower vocabulary, and its own corner resolution.
//
// Founder defect (verbatim): the "+ Wall Cabinets" layouts REPLICATED the base
// row's per-unit config into the upper row — a hob authored on a base unit
// materialised as a hob on the wall cabinet above it (physically nonsensical),
// a fridge duplicated as a second floating fridge in the upper zone, and the
// upper rows had NO corner resolution at the L/U junction (the base rows do).
//
// These tests pin the fix at the geometry the user sees:
//   1. Upper units carry NO appliance geometry — every mesh of an upper unit
//      lies within the wall-cabinet Y envelope (a mirrored hob sits on top of
//      it; a mirrored fridge is 1.85 m tall — both violate the envelope).
//   2. The upper row above a TALL appliance bay (full-height fridge) is
//      omitted.
//   3. Base and upper rows are independent: per-unit fronts differ when the
//      configs say so; base 'drawers' does NOT mirror upward.
//   4. Corner rule (C84 EI-9 — the base row's convention at the upper row's
//      own depth): all upper runs are FLUSH to their wall plane, the MAIN run
//      covers the corner, perpendicular runs butt against it — slot rects
//      tile with ZERO overlap and ZERO gap at the joint, for L and U shapes.
//   5. Legacy records (persisted before `upperUnits` existed) render the
//      derived sound upper row — same slots, impossible features dropped.

import * as THREE from '@pryzm/renderer-three/three';
import { describe, expect, it } from 'vitest';
import { KitchenCabinetEngine } from '../src/engines/KitchenCabinetEngine';
import {
    buildDefaultKitchenConfig,
    buildDefaultUnits,
    KITCHEN_DEFAULTS,
    type KitchenCabinetConfig,
    type KitchenLayoutType,
} from '../src/KitchenTypes';

const EPS = 1e-6;

type SlotRect = { x0: number; x1: number; z0: number; z1: number };

function build(config: KitchenCabinetConfig): THREE.Group {
    const g = new KitchenCabinetEngine().create(config);
    g.updateMatrixWorld(true);
    return g;
}

/** All upper-cabinet unit groups. */
function upperGroups(root: THREE.Group): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    root.traverse(o => { if (o.userData?.isUpperCabinet === true) out.push(o); });
    return out;
}

/** All BASE unit groups (kitchen units that are not upper cabinets). */
function baseGroups(root: THREE.Group): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    root.traverse(o => {
        if (o.userData?.kitchenUnitIndex !== undefined && o.userData?.isUpperCabinet !== true) out.push(o);
    });
    return out;
}

function rectOverlapArea(a: SlotRect, b: SlotRect): number {
    const dx = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const dz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    return dx > EPS && dz > EPS ? dx * dz : 0;
}

/** A legacy-shaped tall L config: `units` with appliances, NO `upperUnits` —
 *  exactly what records persisted before §KITCHEN107 look like. */
function legacyTallL(): KitchenCabinetConfig {
    const units = [
        ...buildDefaultUnits(5, 'main'),
        ...buildDefaultUnits(3, 'left'),
    ];
    (units[1] as any).appliance = 'sink_inox';
    (units[2] as any).appliance = 'hob';
    (units[3] as any).front     = 'drawers';
    (units[4] as any).appliance = 'fridge_combi_silver';
    return {
        layoutType: 'kitchen_l_shape_tall',
        depth: 0.60, length: 3.00, height: 0.90,
        numUnits: 5,
        lengthLeft: 1.80, numUnitsLeft: 3,
        units,
        // upperUnits deliberately ABSENT (legacy record)
    };
}

describe('KitchenCabinetEngine — §KITCHEN107 independent upper row', () => {

    it('upper units carry NO appliance geometry (Y envelope holds; the mirrored hob/fridge would break it)', () => {
        const root = build(legacyTallL());
        const uppers = upperGroups(root);
        expect(uppers.length).toBeGreaterThan(0);

        const upperBaseY = 0.90 + KITCHEN_DEFAULTS.upperCabinetGap;           // 1.35
        const upperTopY  = upperBaseY + KITCHEN_DEFAULTS.upperCabinetHeight;  // 2.05

        for (const grp of uppers) {
            const bbox = new THREE.Box3().setFromObject(grp as THREE.Object3D);
            // A mirrored fridge (1.85 m body starting at the unit origin) tops out
            // ~3.2 m; a mirrored hob sits ON TOP of the wall cabinet (> upperTopY).
            expect(bbox.min.y).toBeGreaterThanOrEqual(upperBaseY - 0.02);
            expect(bbox.max.y).toBeLessThanOrEqual(upperTopY + 0.02);
        }
    });

    it('omits the upper slot above a tall fridge bay (legacy derivation)', () => {
        const root = build(legacyTallL());
        const mainUppers = upperGroups(root).filter(g => g.userData.kitchenArm === 'main');
        // 5 main slots, slot 4 hosts the full-height fridge → 4 wall cabinets.
        expect(mainUppers.length).toBe(4);
        expect(mainUppers.some(g => g.userData.kitchenUnitIndex === 4)).toBe(false);
    });

    it('does NOT mirror base fronts: base drawers stay below, the upper defaults to a door', () => {
        const root = build(legacyTallL());
        const upper3 = upperGroups(root).find(
            g => g.userData.kitchenArm === 'main' && g.userData.kitchenUnitIndex === 3,
        );
        const base3 = baseGroups(root).find(
            g => g.userData.kitchenArm === 'main' && g.userData.kitchenUnitIndex === 3,
        );
        expect(base3?.userData.kitchenFront).toBe('drawers');
        expect(upper3?.userData.kitchenFront).toBe('door');   // drawers are unrepresentable up there
    });

    it('renders an AUTHORED independent upper row (glass door above, plain door below)', () => {
        const cfg = buildDefaultKitchenConfig('kitchen_l_shape_tall');
        // Author the upper row independently of the base row.
        cfg.upperUnits = cfg.upperUnits!.map(u =>
            u.arm === 'main' && u.index === 0 ? { ...u, front: 'glass_door' as const } : u,
        );
        const root = build(cfg);
        const upper0 = upperGroups(root).find(
            g => g.userData.kitchenArm === 'main' && g.userData.kitchenUnitIndex === 0,
        );
        const base0 = baseGroups(root).find(
            g => g.userData.kitchenArm === 'main' && g.userData.kitchenUnitIndex === 0,
        );
        expect(upper0?.userData.kitchenFront).toBe('glass_door');
        expect(base0?.userData.kitchenFront).toBe('door');
    });

    it("an upper slot authored 'omitted' is not built", () => {
        const cfg = buildDefaultKitchenConfig('kitchen_straight_tall');
        cfg.upperUnits = cfg.upperUnits!.map(u =>
            u.arm === 'main' && u.index === 1 ? { ...u, front: 'omitted' as const } : u,
        );
        const root = build(cfg);
        const mainUppers = upperGroups(root).filter(g => g.userData.kitchenArm === 'main');
        expect(mainUppers.some(g => g.userData.kitchenUnitIndex === 1)).toBe(false);
    });

    describe('corner rule — flush to wall, zero overlap, zero gap (L and U)', () => {
        const cases: Array<[KitchenLayoutType, number]> = [
            ['kitchen_l_shape_tall', 2],   // main + left
            ['kitchen_u_shape_tall', 3],   // main + left + right
        ];

        for (const [layout, armCount] of cases) {
            it(`${layout}: upper slot rects tile without overlap and butt exactly`, () => {
                const cfg = buildDefaultKitchenConfig(layout);
                // Strip appliances: the pure corner rule is what is measured
                // here. (The default U-kitchen parks its tall fridge in the
                // main run's LAST bay — the right upper run's corner slot is
                // then correctly omitted; that interaction has its own test.)
                cfg.units = cfg.units!.map(u => {
                    const { appliance: _a, ...rest } = u as any;
                    return rest;
                });
                cfg.upperUnits = undefined;   // re-derive from the clean base row
                const root = build(cfg);
                const uppers = upperGroups(root);
                const arms = new Set(uppers.map(g => g.userData.kitchenArm));
                expect(arms.size).toBe(armCount);

                const rects = uppers.map(g => g.userData.kitchenUpperSlot as SlotRect);
                expect(rects.every(r => !!r)).toBe(true);

                // 1. ZERO overlap between any two upper slots (this is the pin
                //    the founder's colliding corner fails).
                for (let i = 0; i < rects.length; i++) {
                    for (let j = i + 1; j < rects.length; j++) {
                        expect(rectOverlapArea(rects[i]!, rects[j]!)).toBe(0);
                    }
                }

                const depth    = cfg.depth;
                const length   = cfg.length;
                const upperDep = cfg.upperCabinetDepth ?? KITCHEN_DEFAULTS.upperCabinetDepth;

                // 2. FLUSH to the wall planes (root-local frame: main wall at
                //    z = -depth/2, left wall at x = 0, right wall at x = length).
                const mainR  = uppers.filter(g => g.userData.kitchenArm === 'main').map(g => g.userData.kitchenUpperSlot as SlotRect);
                const leftR  = uppers.filter(g => g.userData.kitchenArm === 'left').map(g => g.userData.kitchenUpperSlot as SlotRect);
                for (const r of mainR) expect(Math.abs(r.z0 - (-depth / 2))).toBeLessThan(EPS);
                for (const r of leftR) expect(Math.abs(r.x0)).toBeLessThan(EPS);

                // 3. BUTT JOINT: the perpendicular run starts EXACTLY where the
                //    main upper run's footprint ends (gap = 0 — the declared
                //    joint rule).
                const mainFront = -depth / 2 + upperDep;
                const leftStart = Math.min(...leftR.map(r => r.z0));
                expect(Math.abs(leftStart - mainFront)).toBeLessThan(EPS);

                // 4. The perpendicular run ends flush with its base arm's far end.
                const leftEnd  = Math.max(...leftR.map(r => r.z1));
                expect(Math.abs(leftEnd - (depth / 2 + (cfg.lengthLeft ?? 0)))).toBeLessThan(1e-9);

                if (layout === 'kitchen_u_shape_tall') {
                    const rightR = uppers.filter(g => g.userData.kitchenArm === 'right').map(g => g.userData.kitchenUpperSlot as SlotRect);
                    for (const r of rightR) expect(Math.abs(r.x1 - length)).toBeLessThan(EPS);
                    const rightStart = Math.min(...rightR.map(r => r.z0));
                    expect(Math.abs(rightStart - mainFront)).toBeLessThan(EPS);
                }
            });
        }

        it('a tall fridge in the corner bay omits the CROSS-ARM upper slot passing over it', () => {
            // Default U-kitchen: fridge_combi_silver in the main run's LAST bay
            // (x ∈ [2.4, 3.0]) — the right upper run's first slot passes over
            // that bay across the corner and must NOT be built through the
            // fridge (1.85 m tall, well into the wall-cabinet zone).
            const root = build(buildDefaultKitchenConfig('kitchen_u_shape_tall'));
            const rightUppers = upperGroups(root).filter(g => g.userData.kitchenArm === 'right');
            expect(rightUppers.some(g => g.userData.kitchenUnitIndex === 0)).toBe(false);
            // The rest of the right run is present.
            expect(rightUppers.length).toBeGreaterThan(0);
        });

        it('upper cabinet SOLIDS do not intersect at the corner (mesh AABBs, carcass level)', () => {
            const root = build(buildDefaultKitchenConfig('kitchen_l_shape_tall'));
            const uppers = upperGroups(root);
            // Compare CARCASS envelopes: the slot rect ±(upperDep/2) in Y terms is
            // already pinned above; here we confirm the built meshes agree with
            // their declared slots (no mesh spills past its slot rect by more
            // than the door/handle front protrusion, which faces the ROOM, never
            // a neighbouring run).
            for (const g of uppers) {
                const rect = g.userData.kitchenUpperSlot as SlotRect;
                const bbox = new THREE.Box3().setFromObject(g as THREE.Object3D);
                // Root was recentred by -length/2 in X at the end of create().
                const shift = 1.5; // length 3.0 → recenter offset
                const FRONT_ALLOW = 0.06;  // door panel + handle protrusion
                expect(bbox.min.x + shift).toBeGreaterThanOrEqual(rect.x0 - FRONT_ALLOW);
                expect(bbox.max.x + shift).toBeLessThanOrEqual(rect.x1 + FRONT_ALLOW);
                expect(bbox.min.z).toBeGreaterThanOrEqual(rect.z0 - FRONT_ALLOW);
                expect(bbox.max.z).toBeLessThanOrEqual(rect.z1 + FRONT_ALLOW);
            }
        });
    });

    describe('coverage: I / L / U × ± wall cabinets', () => {
        const tall: KitchenLayoutType[]    = ['kitchen_straight_tall', 'kitchen_l_shape_tall', 'kitchen_u_shape_tall'];
        const nonTall: KitchenLayoutType[] = ['kitchen_straight', 'kitchen_l_shape', 'kitchen_u_shape'];

        for (const layout of tall) {
            it(`${layout} builds an upper row`, () => {
                const root = build(buildDefaultKitchenConfig(layout));
                expect(upperGroups(root).length).toBeGreaterThan(0);
            });
        }
        for (const layout of nonTall) {
            it(`${layout} builds NO upper row`, () => {
                const root = build(buildDefaultKitchenConfig(layout));
                expect(upperGroups(root).length).toBe(0);
            });
        }
    });

    it('meshes-per-kitchen census (for lane PERF105 — informational)', () => {
        const counts: Record<string, number> = {};
        for (const layout of [
            'kitchen_straight', 'kitchen_l_shape_tall', 'kitchen_u_shape_tall',
        ] as KitchenLayoutType[]) {
            const root = build(buildDefaultKitchenConfig(layout));
            let meshes = 0;
            root.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes++; });
            counts[layout] = meshes;
        }
        // eslint-disable-next-line no-console
        console.log('[KITCHEN107→PERF105] meshes per default kitchen:', JSON.stringify(counts));
        expect(Object.values(counts).every(n => n > 0)).toBe(true);
    });
});
