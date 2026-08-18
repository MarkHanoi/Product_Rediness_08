// §FEAT-WALL-LAYER-ADD-BATCH (ADR-0315) — batch add-finish-layer semantics.
//
// Pins the contract points:
//   1. INSTANCE-scoped: layers land on the WALL RECORD via the proven
//      UpdateWallSystemTypeCommand route — the type catalogue is never
//      touched, siblings sharing the systemTypeId are untouched.
//   2. SIDE SEMANTICS: arrays are EXTERIOR-FIRST, so interior appends and
//      exterior prepends; a monolithic wall is seeded with its body first.
//   3. THICKNESS CONTRACT: wall.thickness == sum(layers) after the add.
//   4. RAKE HONESTY: a raked wall REFUSES the layer with a reason (L-812 gate
//      via the child's canExecute) — skipped, not crashed, not silently kept.
//   5. ONE undo entry restores every touched wall byte-for-byte.
//   6. Value guards: thickness bounds + '#rrggbb' + non-empty name refuse
//      visibly; the finish-NAME vocabulary lives in ai-host finishRef, not here.

import { describe, it, expect, beforeEach } from 'vitest';
import { AddWallLayerBatchCommand } from '../src/walls/AddWallLayerBatchCommand';
import type { CommandContext } from '../src/types';

type Pt = { x: number; y: number; z: number };
interface W {
    id: string;
    levelId: string;
    baseLine: [Pt, Pt];
    thickness: number;
    materialColor?: string;
    systemTypeId?: string;
    rakeAngleDeg?: number;
    layers?: Record<string, unknown>[];
    openings: unknown[];
    childrenIds: string[];
}

function p(x: number, z: number): Pt { return { x, y: 0, z }; }

function wall(id: string, over: Partial<W> = {}): W {
    return {
        id, levelId: 'L0',
        baseLine: [p(0, 0), p(5, 0)],
        thickness: 0.2,
        materialColor: '#cccccc',
        openings: [], childrenIds: [],
        ...over,
    };
}

// UpdateWallSystemTypeCommand writes via updateWall(nextState) and snapshots
// via serializeWallSnapshot/restoreSnapshot — mirror the store surface it uses.
function makeWallStore(seed: W[]) {
    const map = new Map<string, W>(seed.map(w => [w.id, structuredClone(w)]));
    return {
        map,
        getById(id: string) { return map.get(id); },
        getAll() { return [...map.values()]; },
        updateWall(next: W) { map.set(next.id, structuredClone(next)); },
        restoreSnapshot(snap: W) { map.set(snap.id, structuredClone(snap)); },
    };
}

function makeCtx(store: ReturnType<typeof makeWallStore>): CommandContext {
    return { stores: { wallStore: store } } as unknown as CommandContext;
}

const PLASTER = { name: 'Plaster · Skim Coat (Painted)', materialColor: '#f5f5f0', materialId: 'gypsum-skim' };

describe('AddWallLayerBatchCommand — honest batch layer add', () => {
    let store: ReturnType<typeof makeWallStore>;
    let ctx: CommandContext;

    beforeEach(() => {
        store = makeWallStore([
            wall('mono'),                                              // monolithic — body must be seeded
            wall('layered', {
                layers: [
                    { name: 'Brick', function: 'structure', thickness: 0.1, materialColor: '#aa5533' },
                    { name: 'Board', function: 'finish-interior', thickness: 0.0125, materialColor: '#f0eeea' },
                ],
                thickness: 0.1125,
            }),
            // §FEAT-RAKE-LAYERED (2026-08-18) — was `{ rakeAngleDeg: 70 }` alone,
            // "refuses layers (L-812 gate)". A raked wall ACCEPTS layers now; what still
            // refuses them is a raked wall that HOSTS AN OPENING, because the layered
            // opening-segment builder has no shear. Same L-812 gate, narrower subject.
            wall('raked', { rakeAngleDeg: 70, openings: [{ id: 'o1' }] }),
        ]);
        ctx = makeCtx(store);
    });

    it('interior add APPENDS (exterior-first arrays); monolithic walls keep their body as a seeded structure layer', () => {
        const cmd = new AddWallLayerBatchCommand({
            wallIds: ['mono'], side: 'interior', thickness: 0.01, ...PLASTER,
        });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        const w = store.getById('mono')!;
        expect(w.layers!.length).toBe(2);
        expect(w.layers![0]).toMatchObject({ name: 'Wall Body', function: 'structure', thickness: 0.2, materialColor: '#cccccc' });
        expect(w.layers![1]).toMatchObject({ name: PLASTER.name, function: 'finish-interior', thickness: 0.01, materialId: 'gypsum-skim' });
        // §03-WALL-THICKNESS-CONTRACT — thickness re-derived from the stack.
        expect(w.thickness).toBeCloseTo(0.21, 6);
    });

    it('exterior add PREPENDS at index 0 on an already-layered wall', () => {
        const cmd = new AddWallLayerBatchCommand({
            wallIds: ['layered'], side: 'exterior', thickness: 0.02, ...PLASTER, layerFunction: 'finish-exterior',
        });
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        const w = store.getById('layered')!;
        expect(w.layers!.length).toBe(3);
        expect(w.layers![0]).toMatchObject({ name: PLASTER.name, function: 'finish-exterior', thickness: 0.02 });
        expect(w.layers![2]).toMatchObject({ name: 'Board' });
        expect(w.thickness).toBeCloseTo(0.1325, 6);
    });

    it('a RAKED wall is skipped WITH the rake gate reason — never crashed, never silently kept', () => {
        const cmd = new AddWallLayerBatchCommand({
            wallIds: 'all', side: 'interior', thickness: 0.01, ...PLASTER,
        });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(true);                       // mixed ⇒ proceed with warnings
        expect(v.warnings?.length).toBe(1);
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect(r.affectedElementIds.sort()).toEqual(['layered', 'mono']);
        expect(r.info?.[0]).toContain('2 of 3');
        expect(cmd.skipped[0]?.wallId).toBe('raked');
        expect(cmd.skipped[0]?.reason).toMatch(/angled|raked/i);
        expect(store.getById('raked')!.layers).toBeUndefined();
    });

    it('one undo entry restores EVERY touched wall byte-for-byte', () => {
        const before = new Map([...store.map.entries()].map(([k, v]) => [k, structuredClone(v)]));
        const cmd = new AddWallLayerBatchCommand({
            wallIds: ['mono', 'layered'], side: 'interior', thickness: 0.01, ...PLASTER,
        });
        cmd.execute(ctx);
        const u = cmd.undo(ctx);
        expect(u.success).toBe(true);
        for (const id of ['mono', 'layered']) {
            expect(store.getById(id)).toEqual(before.get(id));
        }
    });

    it('value guards refuse VISIBLY: thickness bounds, colour shape, empty name, empty scope', () => {
        expect(new AddWallLayerBatchCommand({ wallIds: 'all', side: 'interior', thickness: 0.0001, ...PLASTER })
            .canExecute(ctx).ok).toBe(false);
        expect(new AddWallLayerBatchCommand({ wallIds: 'all', side: 'interior', thickness: 0.9, ...PLASTER })
            .canExecute(ctx).ok).toBe(false);
        expect(new AddWallLayerBatchCommand({ wallIds: 'all', side: 'interior', thickness: 0.01, ...PLASTER, materialColor: 'white' })
            .canExecute(ctx).ok).toBe(false);
        expect(new AddWallLayerBatchCommand({ wallIds: 'all', side: 'interior', thickness: 0.01, ...PLASTER, name: '  ' })
            .canExecute(ctx).ok).toBe(false);
        expect(new AddWallLayerBatchCommand({ wallIds: [], side: 'interior', thickness: 0.01, ...PLASTER })
            .canExecute(ctx).ok).toBe(false);
    });
});
