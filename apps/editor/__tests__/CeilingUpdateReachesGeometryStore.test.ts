// @vitest-environment happy-dom
//
// §FIX-CEILING-UPDATE-REACH-RECORD — the ceiling twin of §FIX-ROOF-UPDATE-REACH-RECORD
// (L-839, commit 2c8b4904), which is itself the roof twin of §FIX-DIMS-REACH-RECORD
// (L-815 / ADR-0315 U1).
//
// CLAIM UNDER TEST: dispatching `ceiling.update` on the production bus must mutate the
// GEOMETRY ceiling record — the `@pryzm/core-app-model` `CeilingStore` that
// `engineLauncher.ts:307` constructs and injects as `context.stores.ceilingStore`, that
// the ceiling fragment builder rebuilds from (`bim-ceiling-updated`), and that
// `ProjectSerializer` / `ProjectLoader` round-trip. NOT the plugin DTO store.
//
// WHY THIS SUITE EXISTS. `apps/editor/__tests__/MaterialDispatch.test.ts:148` and
// `planMoveParity.spec.ts:128` are both green on `ceiling.update`. They verify which
// command a route NAMES; neither can see which handler the bus resolves that name to.
// Two handlers claim `ceiling.update`:
//
//   1. `UpdateCeilingHandler` (plugins/ceiling) — `produceCommand` against
//      `ctx.stores.ceiling`, a FRESH plugin DTO store built by PluginRegistry that no
//      renderer, no 2-D projector, no IFC exporter and no persistence path reads.
//   2. The `initBusHandlers.ts:631-636` legacy bridge — `_cmExec(new UpdateCeilingCommand(...))`,
//      which mutates `context.stores.ceilingStore`, the geometry store.
//
// `CommandBus.register` THROWS on a duplicate type and `initBusHandlers` skips a bridge
// whose verb is already taken, so **the first registration wins**. The plugin set is
// registered inside `composeRuntime` (PluginRegistry → bootstrap.everything), which runs
// BEFORE `initBusHandlers`. The plugin handler therefore won and the bridge was never
// registered. Every ceiling move (3-D gizmo `registerTransformDragHandler.ts:523`, plan
// Move tool `elementMove.ts:362`, Align tool `AlignPlanToolHandler.ts:407`), every
// ceiling material pick (`MaterialDispatch.ts:112`) and every ceiling property edit
// (`CeilingPropertySection.ts:170`) reported success and reached nothing.
//
// VERIFY AT THE OUTCOME, NOT AT THE SEAM: every assertion below reads the geometry
// record back. `success === true` is deliberately never asserted on its own.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommandBus } from '@pryzm/command-bus';
import { buildCeilingHandlerSet } from '@pryzm/plugin-ceiling';
import { CeilingStore as GeometryCeilingStore } from '@pryzm/core-app-model';
import { UpdateCeilingCommand } from '@pryzm/command-registry';

const CEILING_ID = 'ceiling-probe-1';

/** The geometry record the renderer / serializer / loader consult. */
function seedGeometryStore(): GeometryCeilingStore {
    const store = new GeometryCeilingStore();
    store.add({
        id: CEILING_ID,
        type: 'ceiling',
        levelId: 'L0',
        label: 'Probe ceiling',
        ceilingNumber: 'C001',
        boundary: {
            polygon: [{ x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 }],
            height: 2.7,
            thickness: 0.05,
            baseOffset: 0,
            detectionMethod: 'manual-polygon',
        },
        finishSpec: { exposedStructure: false },
        holeElements: [],
        coveredRoomIds: [],
        boundingWallIds: [],
        visible: true,
        colour: '#ffffff',
        properties: {},
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'probe', version: 1 },
    } as never);
    return store;
}

/**
 * Reproduces the production wiring at the ONE point that matters: boot order.
 *
 *  - `composeRuntime` registers the plugin handler set FIRST.
 *  - `initBusHandlers` then attempts its bridge, skipping any verb already taken
 *    (`registry?.has?.(spec.type)` → `continue`).
 *
 * `_cmExec` is modelled by a `window.commandManager` stub that runs the legacy command
 * against the geometry store — exactly what `initBusHandlers._cmExec` does in production.
 */
function bootBus(geometry: GeometryCeilingStore): { bus: CommandBus; bridgeRegistered: boolean } {
    // The plugin DTO store PluginRegistry builds — detached by construction.
    const pluginCeilingState: Record<string, Record<string, unknown>> = {
        [CEILING_ID]: { id: CEILING_ID, type: 'ceiling', levelId: 'L0', colour: '#ffffff' },
    };

    const bus = new CommandBus({
        audit: { actorId: 'probe', source: 'LOCAL' } as never,
        storesProvider: () => ({ ceiling: pluginCeilingState }) as never,
    } as never);

    // ── phase 1: composeRuntime → PluginRegistry → bootstrap → bus.register(...) ──
    for (const h of buildCeilingHandlerSet()) bus.register(h as never);

    // ── phase 2: initBusHandlers, with the real skip-if-present guard ──
    (window as unknown as { commandManager: { execute(c: unknown): void } }).commandManager = {
        execute: (cmd: unknown) => {
            const c = cmd as {
                canExecute(ctx: unknown): { ok: boolean };
                execute(ctx: unknown): unknown;
            };
            const ctx = { stores: { ceilingStore: geometry } };
            const v = c.canExecute(ctx);
            if (!v.ok) throw new Error('legacy command refused');
            c.execute(ctx);
        },
    };

    let bridgeRegistered = false;
    const registry = (bus as unknown as { handlers: Map<string, unknown> }).handlers;
    if (!registry.has('ceiling.update')) {
        bus.register({
            type: 'ceiling.update',
            affectedStores: [] as never,
            canExecute: (_ctx: unknown, cmd: { ceilingId?: string }) =>
                (cmd.ceilingId ? { valid: true } : { valid: false, reason: 'ceilingId is required' }),
            execute: (_ctx: unknown, cmd: { ceilingId: string; updates: Record<string, unknown> }) => {
                (window as unknown as { commandManager: { execute(c: unknown): void } })
                    .commandManager.execute(
                        new UpdateCeilingCommand({ ceilingId: cmd.ceilingId, updates: cmd.updates as never }),
                    );
                return { forward: [], inverse: [] };
            },
        } as never);
        bridgeRegistered = true;
    }

    return { bus, bridgeRegistered };
}

describe('§FIX-CEILING-UPDATE-REACH-RECORD — ceiling.update must reach the geometry record', () => {
    let geometry: GeometryCeilingStore;

    beforeEach(() => { geometry = seedGeometryStore(); });
    afterEach(() => { delete (window as unknown as Record<string, unknown>).commandManager; });

    it('the ceiling plugin does not claim ceiling.update, so the editor bridge can register it', () => {
        // The structural invariant. If someone re-adds UpdateCeilingHandler to the plugin
        // build set, the bridge is silently skipped again and the verb goes dead again.
        const types = buildCeilingHandlerSet().map((h) => h.type);
        expect(types).not.toContain('ceiling.update');

        const { bridgeRegistered } = bootBus(geometry);
        expect(bridgeRegistered).toBe(true);
    });

    it('a property edit mutates the GEOMETRY record the renderer and serializer read', async () => {
        const { bus } = bootBus(geometry);

        expect(geometry.getById(CEILING_ID)?.colour).toBe('#ffffff');

        await bus.executeCommand('ceiling.update', {
            ceilingId: CEILING_ID,
            updates: { colour: '#334455' },
        });

        // The authoritative read — NOT the plugin DTO store, NOT `success === true`.
        expect(geometry.getById(CEILING_ID)?.colour).toBe('#334455');
    });

    it('a MOVE (boundary polygon translated) mutates the GEOMETRY record', async () => {
        const { bus } = bootBus(geometry);

        const before = geometry.getById(CEILING_ID)!.boundary;
        expect(before.polygon[0]).toEqual({ x: -5, z: -5 });

        // Exactly the payload `elementMove.ts:361-367` builds for a ceiling drag:
        // { ceilingId, updates: { boundary: { ...boundary, polygon } } }.
        await bus.executeCommand('ceiling.update', {
            ceilingId: CEILING_ID,
            updates: {
                boundary: {
                    ...before,
                    polygon: before.polygon.map((p) => ({ x: p.x + 3, z: p.z + 2 })),
                },
            },
        });

        const after = geometry.getById(CEILING_ID)!.boundary.polygon;
        // ensureCCW may rotate/reverse the ring, so compare as a SET of vertices.
        const key = (p: { x: number; z: number }): string => `${p.x},${p.z}`;
        expect(new Set(after.map(key))).toEqual(
            new Set(before.polygon.map((p) => key({ x: p.x + 3, z: p.z + 2 }))),
        );
    });

    it('a refused update leaves the geometry record untouched (refusal is not success)', async () => {
        const { bus } = bootBus(geometry);

        // UpdateCeilingCommand.canExecute refuses an unknown ceiling id. The verb must
        // REFUSE, not report success against a record it never found.
        await expect(
            bus.executeCommand('ceiling.update', {
                ceilingId: 'ceiling-does-not-exist',
                updates: { colour: '#000000' },
            }),
        ).rejects.toThrow();

        expect(geometry.getById(CEILING_ID)?.colour).toBe('#ffffff');
    });
});
