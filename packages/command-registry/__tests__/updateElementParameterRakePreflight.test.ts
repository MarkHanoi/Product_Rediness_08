// §FIX-RAKE-REFUSAL-IS-NOT-A-CRASH (L-812 precedent, extended by L-814)
//
// A rake write that the store's invariant forbids must arrive as a REFUSAL from
// `canExecute`, never as a WallSchemaError thrown from inside execution.
//
// WHY THIS EXISTS: production 2026-08-10 — a REPLAYED `UPDATE_ELEMENT_PARAMETER`
// carrying `rakeAngleDeg` for a wall the user had SINCE switched to a LAYERED
// type produced, with no user action at all:
//   `[CommandManager] FATAL ERROR DURING EXECUTION WallSchemaError:
//    [WallStore.update] §WALL-RAKE rejected … not supported on a LAYERED wall`
// L-812 had already fixed exactly this shape on the wall-TYPE path
// (`UpdateWallSystemTypeCommand.canExecute` consults `rakeAuthorability`); the
// GENERIC parameter path — which is how `rakeAngleDeg` is actually written, both
// from the property panel and from collaboration replay — still had no gate.
//
// The refusal itself is CORRECT (ADR-0310). Delivering it as a crash is not.

import { describe, it, expect } from 'vitest';
import { UpdateElementParameterCommand } from '../src/generic/UpdateElementParameterCommand';
import type { CommandContext } from '../src/types';

interface W {
    id: string;
    rakeAngleDeg?: number;
    curve?: unknown;
    layers?: unknown[];
    openings?: unknown[];
}

function makeCtx(walls: W[]): CommandContext {
    const map = new Map<string, W>(walls.map(w => [w.id, structuredClone(w)]));
    return {
        stores: {
            wallStore: {
                getById: (id: string) => map.get(id),
                getAll: () => [...map.values()],
                update(id: string, partial: Partial<W>) {
                    const cur = map.get(id);
                    if (!cur) return;
                    const next = { ...cur, ...partial };
                    // Mirror WallStore.update's §WALL-RAKE throw so a missing
                    // pre-flight would surface here exactly as it does in production.
                    if (
                        next.rakeAngleDeg !== undefined &&
                        next.rakeAngleDeg !== 90 &&
                        (next.layers?.length ?? 0) > 1
                    ) {
                        throw new Error(
                            `[WallStore.update] §WALL-RAKE rejected for wall ${id}: ` +
                            'wall.rakeAngleDeg is not supported on a LAYERED wall',
                        );
                    }
                    map.set(id, next);
                },
            },
        },
    } as unknown as CommandContext;
}

function rakeCmd(wallId: string, deg: number): UpdateElementParameterCommand {
    return new UpdateElementParameterCommand({
        elementId: wallId,
        elementType: 'wall',
        parameters: { rakeAngleDeg: deg },
    });
}

describe('UpdateElementParameterCommand — §WALL-RAKE pre-flight (refusal, not crash)', () => {
    it('REFUSES a rake on a LAYERED wall at canExecute — the store is never reached', () => {
        const ctx = makeCtx([{ id: 'w-layered', layers: [{}, {}], openings: [] }]);
        const v = rakeCmd('w-layered', 120).canExecute(ctx);

        expect(v.ok).toBe(false);
        expect(v.reason).toMatch(/LAYERED/i);
        // The refusal must be readable by a human, not a bare schema string.
        expect(v.reason).toMatch(/angled \(raked\)/i);
    });

    it('the refusal replaces what used to be a FATAL throw from inside execute()', () => {
        const ctx = makeCtx([{ id: 'w-layered', layers: [{}, {}], openings: [] }]);
        const cmd = rakeCmd('w-layered', 140);

        // Pre-flight refuses…
        expect(cmd.canExecute(ctx).ok).toBe(false);
        // …and the store's throw is still there as defence in depth, which is
        // precisely why callers must honour canExecute rather than execute blindly.
        expect(() => cmd.execute(ctx)).toThrow(/§WALL-RAKE/);
    });

    it('REFUSES a rake on a CURVED wall and on an OPENING-HOSTING wall', () => {
        const ctx = makeCtx([
            { id: 'w-curved', curve: { r: 3 }, openings: [] },
            { id: 'w-hosting', openings: [{ id: 'o1' }] },
        ]);
        expect(rakeCmd('w-curved', 70).canExecute(ctx).ok).toBe(false);
        expect(rakeCmd('w-curved', 70).canExecute(ctx).reason).toMatch(/CURVED/i);
        expect(rakeCmd('w-hosting', 70).canExecute(ctx).ok).toBe(false);
    });

    it('ALLOWS an authorable rake on a plain single-layer wall, and executes it', () => {
        const ctx = makeCtx([{ id: 'w1', openings: [] }]);
        const cmd = rakeCmd('w1', 70);
        expect(cmd.canExecute(ctx).ok).toBe(true);
        expect(cmd.execute(ctx).success).toBe(true);
        expect((ctx.stores as any).wallStore.getById('w1').rakeAngleDeg).toBe(70);
    });

    it('90° (vertical) is authorable on EVERY wall shape — the gate never blocks un-raking', () => {
        const ctx = makeCtx([{ id: 'w-layered', layers: [{}, {}], openings: [] }]);
        // Un-raking a wall that became layered is the user's WAY OUT of the
        // refusal, so the gate must not stand in front of it.
        expect(rakeCmd('w-layered', 90).canExecute(ctx).ok).toBe(true);
    });

    it('does not interfere with non-rake parameters, non-wall elements, or vanished walls', () => {
        const ctx = makeCtx([{ id: 'w-layered', layers: [{}, {}], openings: [] }]);

        // No rake in the patch → gate is inert.
        expect(new UpdateElementParameterCommand({
            elementId: 'w-layered', elementType: 'wall', parameters: { height: 3.5 },
        }).canExecute(ctx).ok).toBe(true);

        // Not a wall → gate is inert.
        expect(new UpdateElementParameterCommand({
            elementId: 'd1', elementType: 'door', parameters: { rakeAngleDeg: 120 },
        }).canExecute(ctx).ok).toBe(true);

        // Wall not found → element-not-found stays execute()'s existing refusal
        // path; canExecute must not invent a second, different reason for it.
        expect(rakeCmd('ghost', 120).canExecute(ctx).ok).toBe(true);
    });
});
