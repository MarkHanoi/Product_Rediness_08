// §FEAT-ELEMENT-CHANGE-TYPE (ADR-0105) — the uniform "change element type"
// contract, furniture member. This is a DATA/COMMAND test (no THREE, no DOM): it
// drives ChangeFurnitureTypeCommand directly against a faithful furnitureStore
// stub that mirrors get / update, and asserts the three contract guarantees:
//   (1) the type/asset is swapped,
//   (2) placement (id, position, rotation, level, host) is PRESERVED,
//   (3) the swap is undoable (restores the exact prior record).

import { describe, it, expect } from 'vitest';
import { ChangeFurnitureTypeCommand } from '../src/furniture/ChangeFurnitureTypeCommand';
import type { CommandContext } from '../src/types';

/** A minimal FurnitureData carrying the fields the change-type command touches
 *  plus the placement/identity fields it must preserve. */
function makeFurniture(overrides: Record<string, any> = {}): any {
    return {
        id: 'fu-1',
        type: 'furniture',
        furnitureType: 'sofa_3seat',
        furnitureCategory: 'sofas',
        position: { x: 3, y: 0, z: 5 },
        rotation: { x: 0, y: 1.5707, z: 0, order: 'XYZ' },
        levelId: 'L0',
        levelName: 'Ground',
        levelElevation: 0,
        baseOffset: 0.2,
        width: 2.4,
        length: 0.95,
        height: 0.8,
        material: 'fabric',
        color: '#8899aa',
        mark: 'FU-FF-001',
        hostedSpaceId: 'room-7',
        properties: {},
        ...overrides,
    };
}

/** Faithful in-memory furnitureStore stub: get returns the live record; update
 *  replaces it and counts calls so we can assert exactly one mutation per swap. */
function makeStore(initial: any) {
    const map = new Map<string, any>([[initial.id, initial]]);
    let updateCalls = 0;
    return {
        updateCalls: () => updateCalls,
        get: (id: string) => map.get(id),
        update: (id: string, data: any) => { map.set(id, data); updateCalls++; },
        peek: (id: string) => map.get(id),
    };
}

function makeCtx(store: ReturnType<typeof makeStore>): CommandContext {
    return { stores: { furnitureStore: store } } as unknown as CommandContext;
}

describe('ChangeFurnitureTypeCommand — §FEAT-ELEMENT-CHANGE-TYPE (ADR-0105)', () => {
    it('swaps the furnitureType in place and PRESERVES id + transform + host', () => {
        const el = makeFurniture();
        const store = makeStore(el);
        const cmd = new ChangeFurnitureTypeCommand({ id: 'fu-1', newFurnitureType: 'sofa_2seat' as any });

        expect(cmd.canExecute(makeCtx(store)).ok).toBe(true);
        const res = cmd.execute(makeCtx(store));

        expect(res.success).toBe(true);
        expect(store.updateCalls()).toBe(1);

        const next = store.peek('fu-1');
        // (1) type swapped
        expect(next.furnitureType).toBe('sofa_2seat');
        // (2) placement + identity preserved verbatim
        expect(next.id).toBe('fu-1');
        expect(next.position).toEqual({ x: 3, y: 0, z: 5 });
        expect(next.rotation).toEqual({ x: 0, y: 1.5707, z: 0, order: 'XYZ' });
        expect(next.levelId).toBe('L0');
        expect(next.baseOffset).toBe(0.2);
        expect(next.mark).toBe('FU-FF-001');
        expect(next.hostedSpaceId).toBe('room-7');
        // dimensions untouched when not re-seeded
        expect(next.width).toBe(2.4);
    });

    it('re-seeds dimensions/colour from the target defaults when provided', () => {
        const el = makeFurniture();
        const store = makeStore(el);
        const cmd = new ChangeFurnitureTypeCommand({
            id: 'fu-1',
            newFurnitureType: 'armchair' as any,
            newFurnitureCategory: 'chairs',
            newWidth: 0.9, newLength: 0.9, newHeight: 0.8,
            newColor: '#334455',
        });
        cmd.execute(makeCtx(store));
        const next = store.peek('fu-1');
        expect(next.furnitureType).toBe('armchair');
        expect(next.furnitureCategory).toBe('chairs');
        expect(next.width).toBe(0.9);
        expect(next.color).toBe('#334455');
        // transform still preserved through a re-seed
        expect(next.position).toEqual({ x: 3, y: 0, z: 5 });
    });

    it('sheds a stale config that belongs to the previous type on swap', () => {
        const el = makeFurniture({ furnitureType: 'wardrobe', wardrobeConfig: { width: 2, sections: [] } });
        const store = makeStore(el);
        const cmd = new ChangeFurnitureTypeCommand({ id: 'fu-1', newFurnitureType: 'sofa_2seat' as any });
        cmd.execute(makeCtx(store));
        const next = store.peek('fu-1');
        expect(next.furnitureType).toBe('sofa_2seat');
        // a sofa must not carry the previous wardrobe's config
        expect(next.wardrobeConfig).toBeUndefined();
    });

    it('is undoable — restores the exact prior record', () => {
        const el = makeFurniture();
        const store = makeStore(el);
        const cmd = new ChangeFurnitureTypeCommand({ id: 'fu-1', newFurnitureType: 'sofa_1seat' as any });

        cmd.execute(makeCtx(store));
        expect(store.peek('fu-1').furnitureType).toBe('sofa_1seat');

        const undoRes = cmd.undo(makeCtx(store));
        expect(undoRes.success).toBe(true);
        const restored = store.peek('fu-1');
        expect(restored.furnitureType).toBe('sofa_3seat');
        expect(restored.width).toBe(2.4);
        expect(restored.position).toEqual({ x: 3, y: 0, z: 5 });
    });

    it('rejects when the furniture id is not found', () => {
        const store = makeStore(makeFurniture());
        const cmd = new ChangeFurnitureTypeCommand({ id: 'missing', newFurnitureType: 'sofa_2seat' as any });
        const v = cmd.canExecute(makeCtx(store));
        expect(v.ok).toBe(false);
    });

    it('declares affectedStores=["furniture"] and the CHANGE_FURNITURE_TYPE type', () => {
        const cmd = new ChangeFurnitureTypeCommand({ id: 'fu-1', newFurnitureType: 'sofa_2seat' as any });
        expect(cmd.affectedStores).toEqual(['furniture']);
        expect(cmd.type).toBe('CHANGE_FURNITURE_TYPE');
        // serialize round-trips the payload for collaboration replay.
        const ser = cmd.serialize();
        expect(ser.type).toBe('CHANGE_FURNITURE_TYPE');
        expect((ser.payload as any).newFurnitureType).toBe('sofa_2seat');
    });

    // ── §KITCHEN107 (L-11601) — kitchen→kitchen swaps RE-TARGET the config ───
    //
    // KitchenBuilder routes on `kitchenConfig.layoutType`, NOT on the record's
    // `furnitureType`. Before this fix the command kept the old config verbatim
    // on kitchen→kitchen swaps, so "L-Shape → U-Shape" changed the type STRING
    // while the rebuilt mesh reproduced the OLD shape (the founder's "changing
    // type doesn't really change it").
    describe('kitchen layout re-target (§KITCHEN107, L-11601)', () => {
        function makeKitchen(): any {
            return makeFurniture({
                furnitureType: 'kitchen_l_shape_tall',
                furnitureCategory: 'kitchen',
                kitchenConfig: {
                    layoutType: 'kitchen_l_shape_tall',
                    depth: 0.60, length: 3.60, height: 0.90,
                    numUnits: 6,
                    lengthLeft: 2.40, numUnitsLeft: 4,
                    frontMaterialId: 'wood-oak',
                    units: [
                        ...Array.from({ length: 6 }, (_, i) => ({ index: i, arm: 'main', front: 'door' })),
                        ...Array.from({ length: 4 }, (_, i) => ({ index: i, arm: 'left', front: 'door' })),
                    ],
                },
            });
        }

        it('L→U: the config layoutType FOLLOWS the new type and the right arm is seeded', () => {
            const store = makeStore(makeKitchen());
            const cmd = new ChangeFurnitureTypeCommand({ id: 'fu-1', newFurnitureType: 'kitchen_u_shape' as any });
            cmd.execute(makeCtx(store));
            const next = store.peek('fu-1');
            expect(next.furnitureType).toBe('kitchen_u_shape');
            // THE pin: the builder's routing field moved too.
            expect(next.kitchenConfig.layoutType).toBe('kitchen_u_shape');
            // Dimensions / materials survive (a resized run is not stomped).
            expect(next.kitchenConfig.length).toBe(3.60);
            expect(next.kitchenConfig.numUnits).toBe(6);
            expect(next.kitchenConfig.frontMaterialId).toBe('wood-oak');
            // The U-shape's right arm exists now.
            expect(next.kitchenConfig.numUnitsRight).toBeGreaterThan(0);
            expect(next.kitchenConfig.units.some((u: any) => u.arm === 'right')).toBe(true);
        });

        it('tall→tall keeps an upper row; the swap is undoable back to the exact L', () => {
            const store = makeStore(makeKitchen());
            const cmd = new ChangeFurnitureTypeCommand({ id: 'fu-1', newFurnitureType: 'kitchen_u_shape_tall' as any });
            cmd.execute(makeCtx(store));
            const next = store.peek('fu-1');
            expect(next.kitchenConfig.layoutType).toBe('kitchen_u_shape_tall');
            // §KITCHEN107 — the independent upper row is materialised for the
            // new arm set (derived, since the record predates `upperUnits`).
            expect(Array.isArray(next.kitchenConfig.upperUnits)).toBe(true);
            expect(next.kitchenConfig.upperUnits.some((u: any) => u.arm === 'right')).toBe(true);

            const undoRes = cmd.undo(makeCtx(store));
            expect(undoRes.success).toBe(true);
            const restored = store.peek('fu-1');
            expect(restored.furnitureType).toBe('kitchen_l_shape_tall');
            expect(restored.kitchenConfig.layoutType).toBe('kitchen_l_shape_tall');
            expect(restored.kitchenConfig.numUnitsLeft).toBe(4);
        });

        it('an explicit newKitchenConfig still wins over the derived retarget', () => {
            const store = makeStore(makeKitchen());
            const explicit = {
                layoutType: 'kitchen_straight', depth: 0.6, length: 2.4, height: 0.9, numUnits: 4,
            };
            const cmd = new ChangeFurnitureTypeCommand({
                id: 'fu-1',
                newFurnitureType: 'kitchen_straight' as any,
                newKitchenConfig: explicit as any,
            });
            cmd.execute(makeCtx(store));
            expect(store.peek('fu-1').kitchenConfig).toEqual(explicit);
        });
    });
});
