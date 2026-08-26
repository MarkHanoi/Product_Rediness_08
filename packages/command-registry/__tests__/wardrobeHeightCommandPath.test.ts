// §WARD118 (founder, 2026-08-26) — the COMMAND PATH is where a wardrobe height
// binds (P6: commands are the only mutation path). Before this lane NO command
// validated it: the only "floor" was a range slider's `min: 1.80` that coerced
// silently, so a payload that bypassed the slider could commit 0 or NaN.
//
// Pins, against faithful in-memory stores (no THREE scene, no DOM widgets):
//   §1  UpdateFurnitureParametersCommand — 1.00 m reaches BOTH the top-level
//       `height` and `wardrobeCabinetConfig.height` (the engine reads the latter),
//       and ONE undo restores both.
//   §2  canExecute REFUSES below the physical floor by name with both numbers and
//       a stable code — on either field the authority judges — and accepts the
//       floor exactly. A non-wardrobe item is NOT judged (the branch is
//       wardrobe-only).
//   §3  CreateFurnitureCommand — same verdict, same wording, at creation.

import { describe, it, expect } from 'vitest';
import { CreateFurnitureCommand } from '../src/furniture/CreateFurnitureCommand';
import { UpdateFurnitureParametersCommand } from '../src/furniture/UpdateFurnitureParametersCommand';
import type { CommandContext } from '../src/types';
import {
    buildDefaultWardrobeCabinetConfig,
    WARDROBE_HEIGHT_FLOOR,
    type WardrobeCabinetConfig,
} from '../../geometry-furniture/src/WardrobeCabinetTypes';

const LEVEL = 'L1';

function makeCtx(): { ctx: CommandContext; furniture: Map<string, any> } {
    const furniture = new Map<string, any>();
    const furnitureStore = {
        getAll: () => Array.from(furniture.values()),
        add:    (d: any) => { furniture.set(d.id, d); },
        remove: (id: string) => { furniture.delete(id); },
        get:    (id: string) => furniture.get(id),
        update: (id: string, d: any) => { furniture.set(id, d); },
    };
    const bimManager = {
        getLevelById: (id: string) => (id === LEVEL ? { id, name: 'Level 1', elevation: 0 } : undefined),
        registerElement: () => {},
        unregisterElement: () => {},
    };
    const ctx = {
        bimManager,
        stores: { furnitureStore, floorStore: { getByLevel: () => [] } },
    } as unknown as CommandContext;
    return { ctx, furniture };
}

function wardrobeRecord(id: string, cfg: WardrobeCabinetConfig) {
    return {
        id, type: 'furniture', furnitureType: cfg.layoutType, furnitureCategory: 'bedroom',
        position: { x: 1, y: 0, z: 2 }, rotation: { x: 0, y: 0, z: 0, order: 'XYZ' },
        levelId: LEVEL, baseOffset: 0,
        width: cfg.length, length: cfg.depth, height: cfg.height,
        material: 'wood', properties: {},
        wardrobeCabinetConfig: cfg,
    };
}

function seeded(layout: 'wardrobe_straight' | 'wardrobe_l_shape' | 'wardrobe_u_shape' = 'wardrobe_u_shape') {
    const { ctx, furniture } = makeCtx();
    const cfg = buildDefaultWardrobeCabinetConfig(layout);
    const id = `ward118-${layout}`;
    furniture.set(id, wardrobeRecord(id, cfg));
    return { ctx, furniture, cfg, id };
}

// ═══════════════════════════════════════════════════════════════════════════════
describe('§WARD118 §1 — UpdateFurnitureParametersCommand carries a precise 1.00 m to the config and undoes in one step', () => {

    it('the run inspector\'s payload shape (height + wardrobeCabinetConfig) lands 1.0 on both fields', () => {
        const { ctx, furniture, cfg, id } = seeded();
        const cmd = new UpdateFurnitureParametersCommand({
            id, width: cfg.length, length: cfg.depth, height: 1.0,
            wardrobeCabinetConfig: { ...cfg, height: 1.0 },
        });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        expect(cmd.execute(ctx).success).toBe(true);
        const rec = furniture.get(id);
        expect(rec.height).toBe(1.0);
        expect(rec.wardrobeCabinetConfig.height).toBe(1.0);
        // Sections, arms and everything else survive the edit.
        expect(rec.wardrobeCabinetConfig.sections.length).toBe(cfg.sections!.length);
        expect(rec.wardrobeCabinetConfig.lengthLeft).toBe(cfg.lengthLeft);

        // ONE undo restores both fields.
        expect(cmd.undo(ctx).success).toBe(true);
        expect(furniture.get(id).height).toBe(2.4);
        expect(furniture.get(id).wardrobeCabinetConfig.height).toBe(2.4);
    });

    it('a top-level `height` alone (the generic property panel\'s shape) is synced into wardrobeCabinetConfig.height', () => {
        const { ctx, furniture, id } = seeded('wardrobe_l_shape');
        const cmd = new UpdateFurnitureParametersCommand({ id, height: 1.0 });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        cmd.execute(ctx);
        expect(furniture.get(id).wardrobeCabinetConfig.height).toBe(1.0);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('§WARD118 §2 — canExecute refuses below the physical floor by name, with both numbers', () => {

    it('via wardrobeCabinetConfig.height', () => {
        const { ctx, cfg, id } = seeded();
        const v = new UpdateFurnitureParametersCommand({ id, wardrobeCabinetConfig: { ...cfg, height: 0.2 } }).canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toBe('WARDROBE_HEIGHT_BELOW_PHYSICAL_FLOOR');
        expect(v.blockingIssues?.[0]).toContain('0.200 m');
        expect(v.blockingIssues?.[0]).toContain('0.236 m');
    });

    it('via the top-level height (the config is the target\'s, the height would be synced into it)', () => {
        const { ctx, id } = seeded('wardrobe_straight');
        const v = new UpdateFurnitureParametersCommand({ id, height: 0.1 }).canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.blockingIssues?.[0]).toContain('0.100 m');
        expect(v.blockingIssues?.[0]).toContain('0.236 m');
    });

    it('the config\'s height WINS over a top-level height when both are present (execute precedence)', () => {
        const { ctx, cfg, id } = seeded();
        // config valid, top-level invalid → accepted (execute uses the config).
        expect(new UpdateFurnitureParametersCommand({ id, height: 0.1, wardrobeCabinetConfig: { ...cfg, height: 1.0 } }).canExecute(ctx).ok).toBe(true);
        // config invalid, top-level valid → refused.
        expect(new UpdateFurnitureParametersCommand({ id, height: 1.0, wardrobeCabinetConfig: { ...cfg, height: 0.1 } }).canExecute(ctx).ok).toBe(false);
    });

    it('the floor itself is accepted; NaN is refused with its own code', () => {
        const { ctx, cfg, id } = seeded();
        expect(new UpdateFurnitureParametersCommand({ id, wardrobeCabinetConfig: { ...cfg, height: WARDROBE_HEIGHT_FLOOR } }).canExecute(ctx).ok).toBe(true);
        const v = new UpdateFurnitureParametersCommand({ id, height: NaN }).canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toBe('WARDROBE_HEIGHT_NOT_A_NUMBER');
    });

    it('CONTROL — a non-wardrobe item is not judged by the wardrobe authority', () => {
        const { ctx, furniture } = makeCtx();
        furniture.set('chair-1', { id: 'chair-1', furnitureType: 'chair', width: 0.5, length: 0.5, height: 0.9, position: { x: 0, y: 0, z: 0 }, properties: {} });
        expect(new UpdateFurnitureParametersCommand({ id: 'chair-1', height: 0.1 }).canExecute(ctx).ok).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
describe('§WARD118 §3 — CreateFurnitureCommand applies the same verdict at creation', () => {

    function createPayload(height: number) {
        const cfg = buildDefaultWardrobeCabinetConfig('wardrobe_l_shape');
        cfg.height = height;
        return {
            furnitureType: cfg.layoutType as any,
            position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
            levelId: LEVEL, baseOffset: 0,
            width: cfg.length, length: cfg.depth, height,
            material: 'wood' as any, furnitureCategory: 'bedroom' as any,
            wardrobeCabinetConfig: cfg,
        };
    }

    it('refuses 0.2 m by name with both numbers', () => {
        const { ctx } = makeCtx();
        const v = new CreateFurnitureCommand(createPayload(0.2)).canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toBe('WARDROBE_HEIGHT_BELOW_PHYSICAL_FLOOR');
        expect(v.blockingIssues?.[0]).toContain('0.200 m');
        expect(v.blockingIssues?.[0]).toContain('0.236 m');
    });

    it('creates at 1.0 m — the record carries 1.0 on both fields', () => {
        const { ctx, furniture } = makeCtx();
        const cmd = new CreateFurnitureCommand(createPayload(1.0));
        expect(cmd.canExecute(ctx).ok).toBe(true);
        expect(cmd.execute(ctx).success).toBe(true);
        const made = Array.from(furniture.values())[0];
        expect(made.height).toBe(1.0);
        expect(made.wardrobeCabinetConfig.height).toBe(1.0);
    });
});
