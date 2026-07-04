// §FIX-FURNITURE-FFL-DEFAULT (L-87) + §FIX-FURNITURE-BASE-OFFSET (L-86).
//
// CreateFurnitureCommand must seat a new furniture item on the FINISHED floor
// level (FFL = the applied floor finish's top face), NOT the bare structural slab
// top (the level datum). The mount base-offset then STACKS on that FFL baseline
// and DEFAULTS to 0 (floor-standing) — never the old 0.2 that floated items.
//
// DATA/COMMAND test (no THREE, no DOM): drives the command against faithful
// in-memory store stubs and asserts the stored position.y + baseOffset.

import { describe, it, expect } from 'vitest';
import { CreateFurnitureCommand } from '../src/furniture/CreateFurnitureCommand';
import type { CommandContext } from '../src/types';

const FINISH = 0.015; // 15 mm finish → FFL 15 mm above the slab top (datum).

/** floorStore stub — one finish covering the whole level at `fflOffset`. */
function makeFloorStore(levelId: string, fflOffset: number | null) {
    return {
        getByLevel: (lvl: string) => {
            if (lvl !== levelId || fflOffset === null) return [];
            return [{
                id: 'floor-1', type: 'floor', levelId,
                boundary: {
                    polygon: [{ x: -50, z: -50 }, { x: 50, z: -50 }, { x: 50, z: 50 }, { x: -50, z: 50 }],
                    baseOffset: fflOffset, thickness: FINISH, detectionMethod: 'from-room',
                },
                visible: true,
            }];
        },
    };
}

function makeCtx(opts: { elevation: number; fflOffset: number | null }): { ctx: CommandContext; furniture: Map<string, any> } {
    const furniture = new Map<string, any>();
    const levelId = 'L1';
    const furnitureStore = {
        getAll: () => Array.from(furniture.values()),
        add: (d: any) => { furniture.set(d.id, d); },
        remove: (id: string) => { furniture.delete(id); },
        get: (id: string) => furniture.get(id),
    };
    const bimManager = {
        getLevelById: (id: string) => (id === levelId ? { id, name: 'Level 1', elevation: opts.elevation } : undefined),
        registerElement: () => {},
        unregisterElement: () => {},
    };
    const ctx = {
        bimManager,
        stores: { furnitureStore, floorStore: makeFloorStore(levelId, opts.fflOffset) },
    } as unknown as CommandContext;
    return { ctx, furniture };
}

function payload(over: Record<string, any> = {}) {
    return {
        furnitureType: 'chair' as any,
        position: { x: 2, y: 999, z: 3 }, // incoming y is ignored — command re-datums it
        rotation: { x: 0, y: 0, z: 0 },
        levelId: 'L1',
        baseOffset: 0,
        width: 0.5, length: 0.5, height: 0.9,
        material: 'wood' as any,
        ...over,
    };
}

describe('§FIX-FURNITURE-FFL-DEFAULT / §FIX-FURNITURE-BASE-OFFSET — CreateFurnitureCommand', () => {
    it('seats Y at the FFL (slab top + finish), NOT the bare slab top', () => {
        const { ctx, furniture } = makeCtx({ elevation: 3.0, fflOffset: FINISH });
        const res = new CreateFurnitureCommand(payload()).execute(ctx);
        expect(res.success).toBe(true);
        const made = Array.from(furniture.values())[0];
        // FFL = level.elevation(3.0) + finish(0.015) — above the slab top.
        expect(made.position.y).toBeCloseTo(3.015, 9);
        expect(made.position.y).toBeGreaterThan(3.0);
    });

    it('with NO floor finish on the level, seats at the slab top (datum)', () => {
        const { ctx, furniture } = makeCtx({ elevation: 3.0, fflOffset: null });
        new CreateFurnitureCommand(payload()).execute(ctx);
        const made = Array.from(furniture.values())[0];
        expect(made.position.y).toBeCloseTo(3.0, 9);
    });

    it('defaults an omitted baseOffset to 0 (floor-standing), never 0.2', () => {
        const { ctx, furniture } = makeCtx({ elevation: 0, fflOffset: null });
        const p = payload();
        delete (p as { baseOffset?: number }).baseOffset;
        new CreateFurnitureCommand(p).execute(ctx);
        const made = Array.from(furniture.values())[0];
        expect(made.baseOffset).toBe(0);
    });

    it('a supplied mount baseOffset is preserved (stacks on the FFL downstream)', () => {
        const { ctx, furniture } = makeCtx({ elevation: 0, fflOffset: FINISH });
        new CreateFurnitureCommand(payload({ baseOffset: 1.2 })).execute(ctx);
        const made = Array.from(furniture.values())[0];
        expect(made.baseOffset).toBe(1.2);
        // position.y is the FFL datum; the mount offset is applied once downstream.
        expect(made.position.y).toBeCloseTo(FINISH, 9);
    });
});
