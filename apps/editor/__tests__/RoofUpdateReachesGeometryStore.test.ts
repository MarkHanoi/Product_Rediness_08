// @vitest-environment happy-dom
//
// §FIX-ROOF-UPDATE-REACH-RECORD (L-839) — the roof twin of §FIX-DIMS-REACH-RECORD (L-815).
//
// CLAIM UNDER TEST: dispatching `roof.update` on the production bus must mutate the
// GEOMETRY roof record — the `@pryzm/geometry-roof` `RoofStore` that
// `RoofFragmentBuilder` rebuilds from, that `ProjectSerializer.serializeRoof` reads
// (`roofStore.getAll()`), and that `ProjectLoader` restores. NOT the plugin DTO store.
//
// WHY THIS SUITE EXISTS AT ALL. `apps/editor/__tests__/MaterialDispatch.test.ts` already
// lists `roof.update` in its `LIVE_COMMANDS` set — and it is green. That suite verifies
// which command a route NAMES; it cannot see which handler the bus actually resolves that
// name to. Two handlers claim `roof.update`:
//
//   1. `UpdateRoofHandler` (plugins/roof) — `produceCommand` against `ctx.stores.roof`,
//      a FRESH `new RoofStore()` built by PluginRegistry that no renderer, no plan
//      projector, no IFC exporter and no persistence path reads.
//   2. The `initBusHandlers.ts` legacy bridge — `_cmExec(new UpdateRoofCommand(...))`,
//      which mutates `context.stores.roofStore`, the geometry store.
//
// `CommandBus.register` THROWS on a duplicate type and `initBusHandlers.ts:2201` skips a
// bridge whose verb is already taken, so **the first registration wins**. The plugin set
// is registered inside `composeRuntime` (PluginRegistry → bootstrap.everything →
// bootstrap), which runs BEFORE `initBusHandlers`. The plugin handler therefore wins and
// the bridge is never registered. `roof.update` reports `success` and changes nothing.
//
// The `initTools.ts` §P3.2-RF mirror does NOT rescue this: it subscribes to `roof.created`
// only, hard-gates `ev.commandType !== 'roof.create'`, and dedups on `roofStore.getById`.
// It carries CREATION, never updates. Verified 2026-08-11.
//
// VERIFY AT THE OUTCOME, NOT AT THE SEAM: every assertion below reads the geometry
// record back. `success === true` is deliberately never asserted on its own.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommandBus } from '@pryzm/command-bus';
import { buildRoofHandlerSet } from '@pryzm/plugin-roof';
import { RoofStore as GeometryRoofStore } from '@pryzm/geometry-roof';
import { UpdateRoofCommand } from '@pryzm/command-registry';

const ROOF_ID = 'roof-probe-1';

/** The geometry record the renderer / serializer / loader consult. */
function seedGeometryStore(): GeometryRoofStore {
    const store = new GeometryRoofStore();
    store.add({
        id: ROOF_ID,
        type: 'roof',
        levelId: 'L0',
        footprint: { polygon: [[-5, -5], [5, -5], [5, 5], [-5, 5]], centroid: [0, 0] },
        roofType: 'gable',
        slope: 0.5,
        overhang: 0.3,
        baseOffset: 2.7,
        thickness: 0.2,
        properties: {},
    } as never);
    return store;
}

/**
 * Reproduces the production wiring at the ONE point that matters: boot order.
 *
 *  - `composeRuntime` registers the plugin handler set FIRST.
 *  - `initBusHandlers` then attempts its bridge, skipping any verb already taken
 *    (`initBusHandlers.ts:2201`, `registry?.has?.(spec.type)` → `continue`).
 *
 * `_cmExec` is modelled by a `window.commandManager` stub that runs the legacy command
 * against the geometry store — exactly what `initBusHandlers._cmExec` does in production.
 */
function bootBus(geometry: GeometryRoofStore): { bus: CommandBus; bridgeRegistered: boolean } {
    // The plugin DTO store PluginRegistry builds — detached by construction.
    const pluginRoofState: Record<string, Record<string, unknown>> = {
        [ROOF_ID]: { id: ROOF_ID, type: 'roof', levelId: 'L0', overhang: 0.3, slope: 0.5, thickness: 0.2 },
    };

    const bus = new CommandBus({
        audit: { actorId: 'probe', source: 'LOCAL' } as never,
        storesProvider: () => ({ roof: pluginRoofState }) as never,
    } as never);

    // ── phase 1: composeRuntime → PluginRegistry → bootstrap → bus.register(...) ──
    for (const h of buildRoofHandlerSet()) bus.register(h as never);

    // ── phase 2: initBusHandlers, with the real skip-if-present guard ──
    (window as unknown as { commandManager: { execute(c: unknown): void } }).commandManager = {
        execute: (cmd: unknown) => {
            const c = cmd as {
                canExecute(ctx: unknown): { ok: boolean };
                execute(ctx: unknown): unknown;
            };
            const ctx = { stores: { roofStore: geometry } };
            const v = c.canExecute(ctx);
            if (!v.ok) throw new Error('legacy command refused');
            c.execute(ctx);
        },
    };

    let bridgeRegistered = false;
    const registry = (bus as unknown as { handlers: Map<string, unknown> }).handlers;
    if (!registry.has('roof.update')) {
        bus.register({
            type: 'roof.update',
            affectedStores: [] as never,
            canExecute: (_ctx: unknown, cmd: { id?: string }) =>
                (cmd.id ? { valid: true } : { valid: false, reason: 'id is required' }),
            execute: (_ctx: unknown, cmd: { id: string; updates: Record<string, unknown> }) => {
                (window as unknown as { commandManager: { execute(c: unknown): void } })
                    .commandManager.execute(new UpdateRoofCommand(cmd.id, cmd.updates as never));
                return { forward: [], inverse: [] };
            },
        } as never);
        bridgeRegistered = true;
    }

    return { bus, bridgeRegistered };
}

describe('§FIX-ROOF-UPDATE-REACH-RECORD (L-839) — roof.update must reach the geometry record', () => {
    let geometry: GeometryRoofStore;

    beforeEach(() => { geometry = seedGeometryStore(); });
    afterEach(() => { delete (window as unknown as Record<string, unknown>).commandManager; });

    it('the roof plugin does not claim roof.update, so the editor bridge can register it', () => {
        // The structural invariant. If someone re-adds UpdateRoofHandler to the plugin
        // build set, the bridge is silently skipped again and the verb goes dead again.
        const types = buildRoofHandlerSet().map((h) => h.type);
        expect(types).not.toContain('roof.update');

        const { bridgeRegistered } = bootBus(geometry);
        expect(bridgeRegistered).toBe(true);
    });

    it('changing the overhang mutates the GEOMETRY record the renderer and serializer read', async () => {
        const { bus } = bootBus(geometry);

        expect(geometry.getById(ROOF_ID)?.overhang).toBe(0.3);

        await bus.executeCommand('roof.update', { id: ROOF_ID, updates: { overhang: 0.75 } });

        // The authoritative read — NOT the plugin DTO store, NOT `success === true`.
        expect(geometry.getById(ROOF_ID)?.overhang).toBe(0.75);
    });

    it('changing the pitch/slope mutates the GEOMETRY record', async () => {
        const { bus } = bootBus(geometry);

        expect(geometry.getById(ROOF_ID)?.slope).toBe(0.5);

        await bus.executeCommand('roof.update', { id: ROOF_ID, updates: { slope: 1.25 } });

        expect(geometry.getById(ROOF_ID)?.slope).toBe(1.25);
    });

    it('a refused update leaves the geometry record untouched (refusal is not success)', async () => {
        const { bus } = bootBus(geometry);

        // UpdateRoofCommand.canExecute rejects thickness <= 0. The verb must REFUSE,
        // not report success against an unchanged record.
        await expect(
            bus.executeCommand('roof.update', { id: ROOF_ID, updates: { thickness: -1 } }),
        ).rejects.toThrow();

        expect(geometry.getById(ROOF_ID)?.thickness).toBe(0.2);
    });
});
