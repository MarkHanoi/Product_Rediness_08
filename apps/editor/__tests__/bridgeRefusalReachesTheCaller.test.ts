// @vitest-environment happy-dom
//
// §FIX-S4-VOICE-ABSENT-TARGET — a bridge aimed at an element that does not exist
// must REFUSE where the CALLER can see it (C16 §5.1 CA-18).
//
// ─── WHAT WAS MEASURED, AND WHY IT IS NOT A STATE BUG ────────────────────────
//
// `tools/rac-conformance/certification/gates/check-authoritative-state.ts` arm S4
// splits into two independently-reported halves, because they fail for different
// reasons: S4-STATE ("did anything move?") and S4-VOICE ("could the caller tell?").
// For these two verbs S4-STATE PASSED — nothing was mutated, the model was never
// at risk. S4-VOICE failed:
//
//   S4-VOICE REFUSAL wall.updateDimensions(absent wall)
//     wallId='no-such-wall-at-all' → dispatch resolves ok=true, 0 authoritative
//     paths, no refusal reaches the caller.
//   S4-VOICE REFUSAL roof.update(absent roof)
//     id='no-such-roof-at-all' → same.
//
// The defect is that SUCCESS AND REFUSAL WERE THE SAME OBSERVABLE at the dispatch
// site. A script, the AI, a batch or a retry loop could not tell "I set the roof
// thickness" from "there is no such roof" — the §CONTEXT-DATA-HONESTY family, one
// layer above the store.
//
// ─── THE TWO MECHANISMS, WHICH ARE DIFFERENT ─────────────────────────────────
//
//   wall.updateDimensions — the bridge `fn` did its OWN existence check against
//     the geometry `window.wallStore`, `console.warn`ed, and `return`ed. The bare
//     return produced `{forward:[],inverse:[]}` and the bus resolved ok=true.
//
//   roof.update — the bridge never checked anything; it did not need to.
//     `UpdateRoofCommand.canExecute` ALREADY refuses an absent roof by name
//     ("Roof not found") and `CommandManagerImpl.execute` returns that verdict as
//     `{success:false, info:[reason]}` WITHOUT throwing (CommandManagerImpl.ts:
//     172-185). The refusal existed and named its rule; `_cmExec`, declared
//     `: void`, DISCARDED it.
//
// Both now throw, so the bus rejects the dispatch. Throwing is not a new idiom
// invented here: `RoofUpdateReachesGeometryStore.test.ts:160` already pins
// `rejects.toThrow()` as the expected shape of a refused `roof.update`, the rooms
// plugin's `room.create` bridge reads `{success:false}` and throws
// (plugins/rooms/src/handlers/CreateRoom.ts:196), and EVERY live call site already
// terminates in `.catch(...)` — RoofPropertySheet.ts:318,
// PropertyInspectorApply.ts:210/:234/:552 (via surfaceCommandFailure),
// MaterialDispatch's roof route. A throw here is what those callers are written
// for; it converts a silent no-op into a named refusal, not into a crash.
//
// ─── WHY THIS SUITE DRIVES THE REAL `initBusHandlers` ────────────────────────
//
// The sibling `*UpdateReachesGeometryStore` suites hand-MODEL the bridge (they are
// about boot ORDER, where a model is the point). This suite is about the bridge
// BODY, so a model would prove nothing — it would assert that a stub written in
// this file throws. `initBusHandlers` is exported and takes `{ bus }`, exactly as
// `tools/rac-conformance/certification/world.ts:203-204` calls it, so the verbs
// under test here are the production registrations.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommandBus } from '@pryzm/command-bus';
import { initBusHandlers } from '../src/engine/initBusHandlers';

type AnyWindow = Record<string, unknown>;

const WALL_ID = 'wall-present-1';
const ROOF_ID = 'roof-present-1';

/** Outcome of a dispatch, reduced to the ONE discriminant a caller can branch on. */
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
 * A bus carrying the REAL editor bridge registrations, plus the two `window`
 * globals those bridges reach through in production: the geometry `wallStore`
 * (which `wall.updateDimensions` reads directly) and `commandManager` (which every
 * bridge delegates the authoritative mutation to).
 *
 * `cmResults` records what the legacy layer was asked to run, so the tests can
 * assert the refusal is the LEGACY layer's verdict being surfaced rather than a
 * new pre-check that short-circuits the bridge.
 */
function boot(): {
    bus: CommandBus;
    executed: Array<{ type: string; targetIds: readonly string[] }>;
} {
    const bus = new CommandBus({
        audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
        storesProvider: () => ({}),
    } as never);

    const executed: Array<{ type: string; targetIds: readonly string[] }> = [];

    const w = globalThis.window as unknown as AnyWindow;

    // The GEOMETRY wall store — only WALL_ID exists in it.
    w.wallStore = {
        getById: (id: string) =>
            (id === WALL_ID ? { id, height: 3, thickness: 0.2 } : undefined),
    };

    // A stand-in for CommandManagerImpl that reproduces the ONE behaviour that
    // matters here and is easy to get wrong: a refused command RESOLVES with
    // `{success:false, info:[reason]}`. It does NOT throw. That is the real
    // class's contract (CommandManagerImpl.ts:172-185) and it is precisely why the
    // verdict was so easy to discard.
    w.commandManager = {
        execute: (cmd: unknown) => {
            const c = cmd as { type?: string; targetIds?: readonly string[] };
            const id = c.targetIds?.[0] ?? '';
            executed.push({ type: String(c.type ?? ''), targetIds: c.targetIds ?? [] });
            if (id === ROOF_ID || id === WALL_ID) {
                return { success: true, affectedElementIds: [id] };
            }
            return {
                success: false,
                affectedElementIds: [],
                info: [`Roof '${id}' not found`],
            };
        },
    };

    initBusHandlers({ bus } as never);
    return { bus, executed };
}

describe('§FIX-S4-VOICE-ABSENT-TARGET — an absent target yields a refusal the CALLER can see', () => {
    const w = () => globalThis.window as unknown as AnyWindow;
    let saved: { wallStore?: unknown; commandManager?: unknown; runtime?: unknown };

    beforeEach(() => {
        saved = {
            wallStore: w().wallStore,
            commandManager: w().commandManager,
            runtime: w().runtime,
        };
    });
    afterEach(() => {
        for (const k of ['wallStore', 'commandManager', 'runtime'] as const) {
            if (saved[k] === undefined) delete w()[k];
            else w()[k] = saved[k];
        }
    });

    // ── wall.updateDimensions ────────────────────────────────────────────────

    it('wall.updateDimensions REJECTS for a wall absent from the geometry store, naming the id', async () => {
        const { bus } = boot();
        const r = await dispatch(bus, 'wall.updateDimensions', {
            wallId: 'no-such-wall-at-all',
            height: 9.9,
        });
        // The DISCRIMINANT — not "it didn't throw", not a console assertion.
        expect(r.outcome).toBe('rejected');
        expect(r.message).toMatch(/no wall 'no-such-wall-at-all' exists in the geometry store/);
        expect(r.message).toMatch(/nothing was changed/);
    });

    it('wall.updateDimensions: a caller can DISTINGUISH the absent wall from a real edit', async () => {
        const { bus } = boot();
        const present = await dispatch(bus, 'wall.updateDimensions', { wallId: WALL_ID, height: 5.5 });
        const absent = await dispatch(bus, 'wall.updateDimensions', { wallId: 'no-such-wall-at-all', height: 5.5 });

        expect(present.outcome).toBe('resolved');
        expect(absent.outcome).toBe('rejected');
        expect(present.outcome).not.toBe(absent.outcome);
    });

    it('wall.updateDimensions: ZERO behaviour change when the wall EXISTS — the legacy command still runs', async () => {
        const { bus, executed } = boot();
        const r = await dispatch(bus, 'wall.updateDimensions', { wallId: WALL_ID, height: 5.5 });

        expect(r.outcome).toBe('resolved');
        // The success path is unchanged: exactly one legacy command, aimed at the wall.
        expect(executed).toHaveLength(1);
        expect(executed[0]?.targetIds).toContain(WALL_ID);
    });

    it('wall.updateDimensions: the PAYLOAD refusal is unchanged (canExecute still owns shape)', async () => {
        const { bus, executed } = boot();
        // No wallId at all → refused by the bridge's `validate`, BEFORE the store is
        // consulted. This path predates the fix and must be untouched by it.
        const r = await dispatch(bus, 'wall.updateDimensions', { height: 1 });
        expect(r.outcome).toBe('rejected');
        expect(r.message).toMatch(/wallId is required/);
        expect(executed).toHaveLength(0);
    });

    // ── roof.update ──────────────────────────────────────────────────────────

    it('roof.update SURFACES the legacy refusal for an absent roof instead of resolving ok', async () => {
        const { bus } = boot();
        const r = await dispatch(bus, 'roof.update', {
            id: 'no-such-roof-at-all',
            updates: { thickness: 0.9 },
        });
        expect(r.outcome).toBe('rejected');
        // The reason NAMES THE RULE, carried up from the legacy layer verbatim —
        // it is not a sentence manufactured at the bridge (C58 §1.13 / arm A of
        // check-refusal-identity).
        expect(r.message).toMatch(/roof\.update: the command manager refused — Roof 'no-such-roof-at-all' not found/);
    });

    it('roof.update: the refusal is the LEGACY verdict surfaced, not a new short-circuit', async () => {
        const { bus, executed } = boot();
        await dispatch(bus, 'roof.update', { id: 'no-such-roof-at-all', updates: { thickness: 0.9 } });
        // The bridge still DELEGATED — it did not grow its own existence check.
        // This matters: an existence check at the bridge would be a second source of
        // truth about what exists, which is the S3 defect one lane over.
        expect(executed).toHaveLength(1);
        expect(executed[0]?.targetIds).toContain('no-such-roof-at-all');
    });

    it('roof.update: a caller can DISTINGUISH the absent roof from a real update', async () => {
        const { bus } = boot();
        const present = await dispatch(bus, 'roof.update', { id: ROOF_ID, updates: { thickness: 0.5 } });
        const absent = await dispatch(bus, 'roof.update', { id: 'no-such-roof-at-all', updates: { thickness: 0.5 } });

        expect(present.outcome).toBe('resolved');
        expect(absent.outcome).toBe('rejected');
        expect(present.outcome).not.toBe(absent.outcome);
    });

    it('roof.update: ZERO behaviour change when the roof EXISTS', async () => {
        const { bus, executed } = boot();
        const r = await dispatch(bus, 'roof.update', { id: ROOF_ID, updates: { thickness: 0.5 } });

        expect(r.outcome).toBe('resolved');
        expect(executed).toHaveLength(1);
        expect(executed[0]?.targetIds).toContain(ROOF_ID);
    });

    it('roof.update: a command manager returning void / a non-object still RESOLVES', async () => {
        // The historical `execute(): void` shape, and the `arr.push(...)` doubles
        // used throughout this repo's suites (push returns a NUMBER). Only an
        // explicit `success === false` refuses — reading ABSENCE as refusal would
        // invent a failure where none was reported, which is the mirror image of
        // the defect being fixed.
        for (const execute of [
            () => { /* void */ },
            () => 3,
            () => ({ success: true, affectedElementIds: [ROOF_ID] }),
            () => ({ affectedElementIds: [ROOF_ID] }), // no `success` field at all
        ]) {
            const bus = new CommandBus({
                audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
                storesProvider: () => ({}),
            } as never);
            (globalThis.window as unknown as AnyWindow).commandManager = { execute };
            initBusHandlers({ bus } as never);
            const r = await dispatch(bus, 'roof.update', { id: ROOF_ID, updates: { thickness: 0.5 } });
            expect(r.outcome).toBe('resolved');
        }
    });

    it('roof.update REFUSES, rather than silently dropping, when there is no command manager', async () => {
        // The pre-existing `_cmExec` behaviour here was `console.error` + return,
        // i.e. the same lie by a different route. `_cmExecOrRefuse` is symmetric
        // with the rooms plugin's §FIX-DEAD-VERB-ROOM-BRIDGE branch: no command
        // manager means the ONLY path to authoritative state is absent, which is a
        // failure and not a no-op.
        const bus = new CommandBus({
            audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
            storesProvider: () => ({}),
        } as never);
        delete (globalThis.window as unknown as AnyWindow).commandManager;
        initBusHandlers({ bus } as never);

        const r = await dispatch(bus, 'roof.update', { id: ROOF_ID, updates: { thickness: 0.5 } });
        expect(r.outcome).toBe('rejected');
        expect(r.message).toMatch(/roof\.update: the command manager is not available/);
    });
});
