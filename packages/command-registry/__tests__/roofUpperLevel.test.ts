// §ROOF-UPPER-LEVEL (founder ruling, 2026-08-09).
//
// "When creating a roof — it will always belong to the upper level", where upper
// level = the level IMMEDIATELY ABOVE the one it was drawn on (not the topmost
// level in the project).
//
// This is a genuine STAMPING change, not a display one: CreateRoofCommand wrote
// `payload.levelId` (the active level) straight into RoofData.levelId, into
// bimManager.registerElement() and into the semantic graph.
//
// DATA/COMMAND test (no THREE, no canvas): drives the command against faithful
// in-memory stubs and asserts the stamped level, the preserved world height, the
// working inverse, and that non-interactive callers are untouched.

import { describe, it, expect, beforeEach } from 'vitest';
import { CreateRoofCommand, type CreateRoofPayload } from '../src/roofs/CreateRoofCommand';
import type { CommandContext } from '../src/types';

interface LevelStub { id: string; name: string; elevation: number }

// ElementRegistry is a process-wide singleton that rejects duplicate ids, so
// every case mints its own roof id.
let _n = 0;
let RID = '';
beforeEach(() => { RID = `roof-upper-${++_n}`; });

function makeCtx(levels: LevelStub[], activeLevelId: string) {
    const roofs = new Map<string, any>();
    const levelList = [...levels];
    const roofStore = {
        add: (d: any) => { roofs.set(d.id, d); },
        remove: (id: string) => { roofs.delete(id); },
        get: (id: string) => roofs.get(id),
        getById: (id: string) => roofs.get(id),
        getAll: () => Array.from(roofs.values()),
    };
    const registered = new Map<string, string>();
    const bimManager = {
        getLevels: () => levelList,
        getLevelById: (id: string) => levelList.find(l => l.id === id),
        registerElement: (elId: string, lvl: string) => { registered.set(elId, lvl); },
        unregisterElement: (elId: string) => { registered.delete(elId); },
    };
    const ctx = {
        bimManager,
        projectContext: { activeLevelId },
        stores: { roofStore, wallStore: { getByLevel: () => [] } },
    } as unknown as CommandContext;
    return { ctx, roofs, registered, levelList };
}

const FOOTPRINT = { polygon: [[-2, -2], [2, -2], [2, 2], [-2, 2]] as [number, number][], centroid: [0, 0] as [number, number] };

function payload(over: Partial<CreateRoofPayload> = {}): CreateRoofPayload {
    return {
        levelId: 'L0',
        footprint: FOOTPRINT,
        roofType: 'gable' as any,
        baseOffset: 3.0,
        thickness: 0.2,
        overhang: 0.3,
        ...over,
    };
}

/** Roof world height = level.elevation + baseOffset (RoofFragmentBuilder). */
function worldY(roof: any, levels: LevelStub[]): number {
    return levels.find(l => l.id === roof.levelId)!.elevation + roof.baseOffset;
}

const SIX = [
    { id: 'L0', name: 'Ground', elevation: 0 },
    { id: 'L-01-x', name: 'One', elevation: 3 },
    { id: 'L-02-x', name: 'Two', elevation: 6 },
    { id: 'L-03-x', name: 'Three', elevation: 9 },
    { id: 'L-04-x', name: 'Four', elevation: 12 },
    { id: 'L-05-x', name: 'Five', elevation: 15 },
];

describe('CreateRoofCommand — §ROOF-UPPER-LEVEL', () => {
    it('drawn on L0 of a 6-level project → stamped on the NEXT level up (L-01), not the topmost', () => {
        const { ctx, roofs, registered } = makeCtx(SIX, 'L0');
        const cmd = new CreateRoofCommand(RID, payload({ levelId: 'L0', levelPolicy: 'upper' }));
        expect(cmd.canExecute(ctx).ok).toBe(true);
        const res = cmd.execute(ctx);

        expect(res.success).toBe(true);
        expect(roofs.get(RID).levelId).toBe('L-01-x');
        expect(roofs.get(RID).parentId).toBe('L-01-x');
        // The BimManager registration — the thing production logs as
        // "Registered element … to level L0" — must follow the stamp.
        expect(registered.get(RID)).toBe('L-01-x');
    });

    it('re-homing does NOT move the roof: world height is preserved via baseOffset', () => {
        const { ctx, roofs } = makeCtx(SIX, 'L0');
        new CreateRoofCommand(RID, payload({ levelId: 'L0', levelPolicy: 'upper' })).execute(ctx);
        const roof = roofs.get(RID);
        expect(roof.baseOffset).toBeCloseTo(0, 10);          // 3.0 − (3 − 0)
        expect(worldY(roof, SIX)).toBeCloseTo(3.0, 10);      // exactly where it was drawn
    });

    it('drawn on the TOPMOST level → kept there, geometry untouched, and it says so', () => {
        const { ctx, roofs } = makeCtx(SIX, 'L-05-x');
        const res = new CreateRoofCommand(RID, payload({ levelId: 'L-05-x', levelPolicy: 'upper' })).execute(ctx);
        expect(roofs.get(RID).levelId).toBe('L-05-x');
        expect(roofs.get(RID).baseOffset).toBeCloseTo(3.0, 10);
        expect(res.info!.join(' ')).toMatch(/no level above/i);
    });

    it('single-level project → the only level (both readings of "upper" collapse)', () => {
        const ONE = [{ id: 'L0', name: 'Ground', elevation: 0 }];
        const { ctx, roofs } = makeCtx(ONE, 'L0');
        new CreateRoofCommand(RID, payload({ levelId: 'L0', levelPolicy: 'upper' })).execute(ctx);
        expect(roofs.get(RID).levelId).toBe('L0');
        expect(worldY(roofs.get(RID), ONE)).toBeCloseTo(3.0, 10);
    });

    it('ADDING A LEVEL ABOVE afterwards does NOT re-home an existing roof', () => {
        // DECISION: level assignment is resolved once, at creation. A later level
        // insert is a separate edit; silently walking every roof upward would
        // mutate user-owned elements outside any command's inverse. Moving a roof
        // is what `roof.changeLevel` is for.
        const ONE = [{ id: 'L0', name: 'Ground', elevation: 0 }];
        const { ctx, roofs, levelList } = makeCtx(ONE, 'L0');
        new CreateRoofCommand(RID, payload({ levelId: 'L0', levelPolicy: 'upper' })).execute(ctx);
        expect(roofs.get(RID).levelId).toBe('L0');

        levelList.push({ id: 'L1', name: 'One', elevation: 3 });
        expect(roofs.get(RID).levelId).toBe('L0');
        expect(roofs.get(RID).baseOffset).toBeCloseTo(3.0, 10);
    });

    it('undo removes it; redo reproduces the SAME level even if the level set changed (C16)', () => {
        const { ctx, roofs, levelList } = makeCtx([...SIX], 'L0');
        const cmd = new CreateRoofCommand(RID, payload({ levelId: 'L0', levelPolicy: 'upper' }));
        cmd.execute(ctx);
        expect(roofs.get(RID).levelId).toBe('L-01-x');

        cmd.undo(ctx);
        expect(roofs.get(RID)).toBeUndefined();

        // A new level slips in between L0 and L-01 while the create is undone.
        levelList.push({ id: 'L-mezz', name: 'Mezz', elevation: 1.5 });
        cmd.execute(ctx);
        expect(roofs.get(RID).levelId).toBe('L-01-x');           // frozen, not re-resolved
        expect(roofs.get(RID).baseOffset).toBeCloseTo(0, 10);
    });

    it('serialises the RESOLVED level and drops the policy, so replay cannot walk the roof up', () => {
        const { ctx } = makeCtx(SIX, 'L0');
        const cmd = new CreateRoofCommand(RID, payload({ levelId: 'L0', levelPolicy: 'upper' }));
        cmd.execute(ctx);
        const s = cmd.serialize();
        expect(s.payload.levelId).toBe('L-01-x');
        expect(s.payload.baseOffset).toBeCloseTo(0, 10);
        expect(s.payload.levelPolicy).toBe('explicit');

        // Replaying the serialised payload is idempotent — no second hop upward.
        const { ctx: ctx2, roofs: roofs2 } = makeCtx(SIX, 'L0');
        const { roofId: _replayedId, ...rest } = s.payload as any;
        const replayId = `${RID}-replay`;
        new CreateRoofCommand(replayId, rest).execute(ctx2);
        expect(roofs2.get(replayId).levelId).toBe('L-01-x');
        expect(roofs2.get(replayId).baseOffset).toBeCloseTo(0, 10);
    });

    it('non-interactive callers (loader, IFC import, AI, generators) are UNCHANGED', () => {
        // No levelPolicy → 'explicit': the payload level is the answer.
        const { ctx, roofs } = makeCtx(SIX, 'L0');
        new CreateRoofCommand(RID, payload({ levelId: 'L-03-x' })).execute(ctx);
        expect(roofs.get(RID).levelId).toBe('L-03-x');
        expect(roofs.get(RID).baseOffset).toBeCloseTo(3.0, 10);
    });

    it('autoBaseOffset measures the walls of the level DRAWN ON, not of the re-homed level', () => {
        const { ctx, roofs } = makeCtx(SIX, 'L0');
        (ctx as any).stores.wallStore = {
            getByLevel: (lvl: string) => (lvl === 'L0' ? [{ height: 3.4 }] : []),
        };
        new CreateRoofCommand(RID, payload({ levelId: 'L0', levelPolicy: 'upper', autoBaseOffset: true })).execute(ctx);
        // 3.4 measured on L0, then compensated for the 3 m hop to L-01.
        expect(roofs.get(RID).levelId).toBe('L-01-x');
        expect(roofs.get(RID).baseOffset).toBeCloseTo(0.4, 10);
        expect(worldY(roofs.get(RID), SIX)).toBeCloseTo(3.4, 10);
    });
});
