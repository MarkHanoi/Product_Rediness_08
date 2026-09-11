// @vitest-environment happy-dom
//
// §LEVEL-DELETE-ON-THE-BUS (L-13306) — the storey "−" beside the Master planning levels.
//
// Founder, 2026-09-11: *"add levels, delete levels (with a simple + - options next to current
// levels)"*. `DeleteLevelCommand` existed only on the legacy registry (`CommandRegistry.ts`
// DELETE_LEVEL), so the "−" had no bus verb to dispatch (P6) and Lane D's control had to
// disable itself. This suite pins the new `level.delete` bridge at the layer the control uses:
// the REAL `initBusHandlers` registration, driven through `bus.executeCommand`.
//
// ⭐ THE DISCRIMINANT IS resolved-vs-rejected, NOT "it didn't throw". `DeleteLevelCommand`'s own
// guards (the last remaining level, a level that still contains elements) come back from
// `CommandManagerImpl.execute` as `{ success:false, info:[reason] }` WITHOUT throwing. The bridge
// uses `_cmExecOrRefuse`, so that verdict must reach the caller BY NAME; with `_cmExec` a refused
// delete would read as done — the §FIX-S4-VOICE-ABSENT-TARGET defect, one verb over
// (bridgeRefusalReachesTheCaller.test.ts).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommandBus } from '@pryzm/command-bus';
import { initBusHandlers } from '../src/engine/initBusHandlers';

type AnyWindow = Record<string, unknown>;

const EMPTY_LEVEL = 'L2-empty';
const OCCUPIED_LEVEL = 'L1-occupied';
const OCCUPIED_REASON = "Cannot delete level 'Level 1': it contains 3 element(s). Move or delete them first.";

async function dispatch(
    bus: CommandBus,
    type: string,
    payload: unknown,
): Promise<{ outcome: 'resolved' | 'rejected'; message: string }> {
    try {
        await (bus as unknown as { executeCommand(t: string, p: unknown): Promise<unknown> })
            .executeCommand(type, payload);
        return { outcome: 'resolved', message: '' };
    } catch (e) {
        return { outcome: 'rejected', message: e instanceof Error ? e.message : String(e) };
    }
}

/**
 * A bus carrying the REAL editor bridge registrations. `commandManager` reproduces the ONE
 * behaviour that matters: a refused command RESOLVES with `{success:false, info:[reason]}`
 * (CommandManagerImpl.ts:172-185) — it does not throw.
 */
function boot(): { bus: CommandBus; executed: Array<{ type: string; targetIds: readonly string[] }> } {
    const bus = new CommandBus({
        audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
        storesProvider: () => ({}),
    } as never);
    const executed: Array<{ type: string; targetIds: readonly string[] }> = [];
    (globalThis.window as unknown as AnyWindow).commandManager = {
        execute: (cmd: unknown) => {
            const c = cmd as { type?: string; targetIds?: readonly string[] };
            executed.push({ type: String(c.type ?? ''), targetIds: c.targetIds ?? [] });
            const id = c.targetIds?.[0] ?? '';
            if (id === OCCUPIED_LEVEL) return { success: false, affectedElementIds: [], info: [OCCUPIED_REASON] };
            return { success: true, affectedElementIds: [id] };
        },
    };
    initBusHandlers({ bus } as never);
    return { bus, executed };
}

describe('§LEVEL-DELETE-ON-THE-BUS — the storey "−" reaches DeleteLevelCommand and hears its refusals', () => {
    const w = () => globalThis.window as unknown as AnyWindow;
    let saved: unknown;
    beforeEach(() => { saved = w().commandManager; });
    afterEach(() => {
        if (saved === undefined) delete w().commandManager;
        else w().commandManager = saved;
    });

    it('level.delete is a REGISTERED bus verb (the control gates on this and would otherwise stay disabled)', () => {
        const { bus } = boot();
        // `registeredTypes` is a GETTER (CommandBus.ts:179) — the exact read `projectStoreysRow`
        // makes to decide whether its "−" is live, so this is the join, not a proxy for it.
        const types = (bus as unknown as { registeredTypes: readonly string[] }).registeredTypes;
        expect(types).toContain('level.delete');
    });

    it('an empty storey: RESOLVES, and exactly one legacy DELETE_LEVEL ran against that storey', async () => {
        const { bus, executed } = boot();
        const r = await dispatch(bus, 'level.delete', { levelId: EMPTY_LEVEL });
        expect(r.outcome).toBe('resolved');
        expect(executed).toHaveLength(1);
        expect(executed[0]?.type).toBe('DELETE_LEVEL');
        expect(executed[0]?.targetIds).toEqual([EMPTY_LEVEL]);
    });

    it('a storey that still holds elements: REJECTS with the command\'s OWN sentence, verbatim', async () => {
        const { bus, executed } = boot();
        const r = await dispatch(bus, 'level.delete', { levelId: OCCUPIED_LEVEL });
        expect(r.outcome).toBe('rejected');
        expect(r.message).toContain('level.delete: the command manager refused');
        expect(r.message).toContain(OCCUPIED_REASON);
        // The bridge DELEGATED — it did not grow a second existence/occupancy check of its own.
        expect(executed).toHaveLength(1);
    });

    it('a caller can DISTINGUISH a done delete from a refused one', async () => {
        const { bus } = boot();
        const done = await dispatch(bus, 'level.delete', { levelId: EMPTY_LEVEL });
        const refused = await dispatch(bus, 'level.delete', { levelId: OCCUPIED_LEVEL });
        expect(done.outcome).not.toBe(refused.outcome);
    });

    it('no levelId: refused by the payload validator before the command manager is asked', async () => {
        const { bus, executed } = boot();
        const r = await dispatch(bus, 'level.delete', {});
        expect(r.outcome).toBe('rejected');
        expect(r.message).toMatch(/levelId is required/);
        expect(executed).toHaveLength(0);
    });

    it('no command manager: REFUSES, rather than silently dropping the delete', async () => {
        const bus = new CommandBus({
            audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
            storesProvider: () => ({}),
        } as never);
        delete w().commandManager;
        initBusHandlers({ bus } as never);
        const r = await dispatch(bus, 'level.delete', { levelId: EMPTY_LEVEL });
        expect(r.outcome).toBe('rejected');
        expect(r.message).toMatch(/level\.delete: the command manager is not available/);
    });
});
