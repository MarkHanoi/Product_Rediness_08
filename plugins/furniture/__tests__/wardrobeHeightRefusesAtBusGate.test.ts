// @vitest-environment happy-dom
//
// §WARD118 (founder, 2026-08-26) — the BUS GATE refuses a wardrobe height the
// authority refuses, by name with both numbers (C16 CA-18), instead of reporting
// success while the legacy bridge quietly declined (C74's silent-success class).
//
// The handler does not import @pryzm/geometry-furniture (the SDK-bypass ratchet is
// shrink-only); it asks the legacy command's OWN canExecute through the live
// legacy context — one validator (C84 EI-9). This file drives the REAL CommandBus
// with the REAL handler and a legacy commandManager stub that runs the REAL
// legacy command against an in-memory furniture store, so a green here means the
// height reached the record through the bus, and a refusal reached the caller.

import { describe, it, expect, beforeEach } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/plugin-sdk';
import { RingBufferUndoStack } from '@pryzm/runtime-undo-stack';
import { UpdateFurnitureParametersHandler } from '../src/handlers/UpdateFurnitureParameters.js';
import { CreateFurnitureHandler } from '../src/handlers/CreateFurniture.js';
import { buildDefaultWardrobeCabinetConfig } from '../../../packages/geometry-furniture/src/WardrobeCabinetTypes';

const LEVEL = 'L1';

function legacyWorld() {
    const furniture = new Map<string, any>();
    const furnitureStore = {
        getAll: () => Array.from(furniture.values()),
        add:    (d: any) => { furniture.set(d.id, d); },
        remove: (id: string) => { furniture.delete(id); },
        get:    (id: string) => furniture.get(id),
        update: (id: string, d: any) => { furniture.set(id, d); },
    };
    const legacyCtx = {
        bimManager: {
            getLevelById: (id: string) => (id === LEVEL ? { id, name: 'Level 1', elevation: 0 } : undefined),
            registerElement: () => {}, unregisterElement: () => {},
        },
        stores: { furnitureStore, floorStore: { getByLevel: () => [] } },
    };
    // The legacy commandManager the bridge reaches for: validates then executes
    // the REAL command against the legacy context (what CommandManagerImpl does).
    const commandManager = {
        getContext: () => legacyCtx,
        execute: (cmd: { canExecute(c: unknown): { ok: boolean }; execute(c: unknown): unknown }) => {
            const v = cmd.canExecute(legacyCtx);
            if (!v.ok) return { success: false, affectedElementIds: [] };
            return cmd.execute(legacyCtx);
        },
    };
    return { furniture, legacyCtx, commandManager };
}

function bus() {
    const b = new CommandBus({
        audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
        emitter: new PatchEmitter(),
        undoStack: new UndoStack({ maxSize: 50 }),
        ringBuffer: new RingBufferUndoStack({ maxSize: 50 }),
        storesProvider: () => ({ furniture: {} }),
    });
    b.register(UpdateFurnitureParametersHandler as never);
    b.register(new CreateFurnitureHandler() as never);
    return b;
}

function seedWardrobe(furniture: Map<string, any>, id: string) {
    const cfg = buildDefaultWardrobeCabinetConfig('wardrobe_u_shape');
    furniture.set(id, {
        id, type: 'furniture', furnitureType: cfg.layoutType, levelId: LEVEL, baseOffset: 0,
        position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
        width: cfg.length, length: cfg.depth, height: cfg.height, material: 'wood', properties: {},
        wardrobeCabinetConfig: cfg,
    });
    return cfg;
}

describe('§WARD118 — furniture.updateParameters at the bus gate', () => {
    let world: ReturnType<typeof legacyWorld>;
    beforeEach(() => {
        world = legacyWorld();
        (window as unknown as Record<string, unknown>).commandManager = world.commandManager;
    });

    it('REFUSES 0.2 m — the rejection names the value and the floor, and the record is untouched', async () => {
        const b = bus();
        const cfg = seedWardrobe(world.furniture, 'w1');
        await expect(
            b.executeCommand('furniture.updateParameters', { id: 'w1', height: 0.2, wardrobeCabinetConfig: { ...cfg, height: 0.2 } }),
        ).rejects.toThrow(/0\.200 m[\s\S]*0\.236 m/);
        expect(world.furniture.get('w1').wardrobeCabinetConfig.height).toBe(2.4);
        expect(world.furniture.get('w1').height).toBe(2.4);
    });

    it('ACCEPTS 1.0 m — the height reaches the legacy record through the bridge', async () => {
        const b = bus();
        const cfg = seedWardrobe(world.furniture, 'w2');
        await b.executeCommand('furniture.updateParameters', { id: 'w2', height: 1.0, wardrobeCabinetConfig: { ...cfg, height: 1.0 } });
        expect(world.furniture.get('w2').wardrobeCabinetConfig.height).toBe(1.0);
        expect(world.furniture.get('w2').height).toBe(1.0);
    });

    it('CONTROL — a sofa at 0.2 m is not judged by the wardrobe authority', async () => {
        const b = bus();
        world.furniture.set('s1', { id: 's1', furnitureType: 'sofa', width: 2, length: 0.9, height: 0.8, position: { x: 0, y: 0, z: 0 }, properties: {} });
        await expect(b.executeCommand('furniture.updateParameters', { id: 's1', height: 0.2 })).resolves.toBeDefined();
        expect(world.furniture.get('s1').height).toBe(0.2);
    });

    it('CONTROL — headless (no legacy context): the gate is unchanged and the drag-end path still records', async () => {
        delete (window as unknown as Record<string, unknown>).commandManager;
        const b = bus();
        await expect(b.executeCommand('furniture.updateParameters', { id: 'x', height: 0.2 })).resolves.toBeDefined();
    });
});

describe('§WARD118 — furniture.create at the bus gate', () => {
    beforeEach(() => {
        const world = legacyWorld();
        (window as unknown as Record<string, unknown>).commandManager = world.commandManager;
    });

    function createPayload(height: number) {
        const cfg = buildDefaultWardrobeCabinetConfig('wardrobe_l_shape');
        cfg.height = height;
        return {
            id: `ward118-create-${height}`, furnitureType: cfg.layoutType,
            position: { x: 0, y: 0, z: 0 }, rotation: 0, levelId: LEVEL, baseOffset: 0,
            width: cfg.length, length: cfg.depth, height, material: 'wood', furnitureCategory: 'bedroom',
            wardrobeCabinetConfig: cfg,
        };
    }

    it('REFUSES a 0.2 m wardrobe at placement, by name with both numbers', async () => {
        await expect(bus().executeCommand('furniture.create', createPayload(0.2))).rejects.toThrow(/0\.200 m[\s\S]*0\.236 m/);
    });

    it('ACCEPTS a 1.0 m wardrobe at placement', async () => {
        await expect(bus().executeCommand('furniture.create', createPayload(1.0))).resolves.toBeDefined();
    });
});
