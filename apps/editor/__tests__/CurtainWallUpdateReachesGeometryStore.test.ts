// @vitest-environment happy-dom
//
// §FIX-CW-UPDATE-REACH-RECORD — the curtain-wall sibling of
// §FIX-ROOF-UPDATE-REACH-RECORD (L-839, commit 2c8b4904) and
// §FIX-CEILING-UPDATE-REACH-RECORD.
//
// CLAIM UNDER TEST: dispatching `wall.updateCurtainWall` on the production bus must
// mutate the GEOMETRY curtain-wall record — the `@pryzm/geometry-curtain-wall`
// `CurtainWallStore` that `engineLauncher.ts:305,774,824` constructs and injects as
// `context.stores.curtainWallStore`, that `CurtainWallBuilder` rebuilds from, and that
// persistence round-trips. NOT the plugin DTO store.
//
// WHY THIS ONE IS WORSE THAN ITS SIBLINGS. Roof and ceiling each had a same-verb bridge
// sitting unregistered behind the plugin handler. `wall.updateCurtainWall` had NO bridge
// at all: TASK-07 Phase A DELETED it ("Replaced F-1.3 commandManager bridge with
// authoritative Immer produceCommand"), leaving `UpdateCurtainWallCommand` — the only
// code in the repo that writes the geometry curtain-wall record on an update — reachable
// from nothing but `CommandRegistry.ts:378` deserialization. So the verb was not merely
// shadowed; it was unbridged. Every one of its callers reported success and changed
// nothing authoritative:
//
//   • `registerTransformDragHandler.ts:435`  — 3-D gizmo drag-end
//   • `elementMove.ts:303`                   — plan Move tool
//   • `PropertyInspectorApply.ts:225,467,575`— property sheet edits
//   • `MaterialDispatch.ts:115`              — the Material control
//
// `SetCurtainWallMaterial.ts:57` refuses `curtain-wall.setMaterial` and tells the user to
// "Use `wall.updateCurtainWall` instead — it reaches the geometry record the builders
// read." That sentence was FALSE when written. This suite is what makes it true.
//
// VERIFY AT THE OUTCOME, NOT AT THE SEAM: every assertion below reads the geometry
// record back. `success === true` is deliberately never asserted on its own.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommandBus } from '@pryzm/command-bus';
import { buildCurtainWallHandlerSet } from '@pryzm/plugin-curtain-wall';
import { CurtainWallStore as GeometryCurtainWallStore } from '@pryzm/geometry-curtain-wall';
import { UpdateCurtainWallCommand } from '@pryzm/command-registry';

const CW_ID = 'cw-probe-1';

/** The geometry record the builder / serializer / loader consult. */
function seedGeometryStore(): GeometryCurtainWallStore {
    const store = new GeometryCurtainWallStore();
    store.set(CW_ID, {
        id: CW_ID,
        type: 'curtain-wall',
        levelId: 'L0',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
        height: 3,
        baseOffset: 0,
        gridXSpacing: 1.5,
        gridYSpacing: 1.5,
        mullionSize: 0.05,
        panelThickness: 0.024,
        mullionColor: '#888888',
        properties: {},
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
 * `bimManager` is stubbed because `UpdateCurtainWallCommand` touches it on a levelId
 * change (§DW-03); it is inside a try/catch there, but the probe supplies a real one so a
 * silently-swallowed throw cannot be mistaken for a pass.
 */
function bootBus(geometry: GeometryCurtainWallStore): { bus: CommandBus; bridgeRegistered: boolean } {
    // The plugin DTO store PluginRegistry builds — detached by construction.
    const pluginCwState: Record<string, Record<string, unknown>> = {
        [CW_ID]: {
            id: CW_ID, type: 'curtain-wall', levelId: 'L0',
            baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
            mullionColor: '#888888',
        },
    };

    const bus = new CommandBus({
        audit: { actorId: 'probe', source: 'LOCAL' } as never,
        storesProvider: () => ({ curtainwall: pluginCwState }) as never,
    } as never);

    // ── phase 1: composeRuntime → PluginRegistry → bootstrap → bus.register(...) ──
    for (const h of buildCurtainWallHandlerSet()) bus.register(h as never);

    // ── phase 2: initBusHandlers, with the real skip-if-present guard ──
    (window as unknown as { commandManager: { execute(c: unknown): void } }).commandManager = {
        execute: (cmd: unknown) => {
            const c = cmd as {
                canExecute(ctx: unknown): { ok: boolean };
                execute(ctx: unknown): unknown;
            };
            const ctx = {
                stores: { curtainWallStore: geometry },
                bimManager: { unregisterElement: () => {}, registerElement: () => {} },
            };
            const v = c.canExecute(ctx);
            if (!v.ok) throw new Error('legacy command refused');
            c.execute(ctx);
        },
    };

    let bridgeRegistered = false;
    const registry = (bus as unknown as { handlers: Map<string, unknown> }).handlers;
    if (!registry.has('wall.updateCurtainWall')) {
        bus.register({
            type: 'wall.updateCurtainWall',
            affectedStores: [] as never,
            canExecute: (_ctx: unknown, cmd: { id?: string }) =>
                (cmd.id ? { valid: true } : { valid: false, reason: 'id is required' }),
            execute: (_ctx: unknown, cmd: { id: string; updates: Record<string, unknown> }) => {
                (window as unknown as { commandManager: { execute(c: unknown): void } })
                    .commandManager.execute(
                        new UpdateCurtainWallCommand({ id: cmd.id, updates: cmd.updates as never }),
                    );
                return { forward: [], inverse: [] };
            },
        } as never);
        bridgeRegistered = true;
    }

    return { bus, bridgeRegistered };
}

describe('§FIX-CW-UPDATE-REACH-RECORD — wall.updateCurtainWall must reach the geometry record', () => {
    let geometry: GeometryCurtainWallStore;

    beforeEach(() => { geometry = seedGeometryStore(); });
    afterEach(() => { delete (window as unknown as Record<string, unknown>).commandManager; });

    it('the curtain-wall plugin does not claim wall.updateCurtainWall, so the bridge can register it', () => {
        // The structural invariant. If someone re-adds UpdateCurtainWallHandler to the
        // plugin build set, the bridge is silently skipped and the verb goes dead again.
        const types = buildCurtainWallHandlerSet().map((h) => h.type);
        expect(types).not.toContain('wall.updateCurtainWall');

        const { bridgeRegistered } = bootBus(geometry);
        expect(bridgeRegistered).toBe(true);
    });

    it('a MOVE (baseLine translated) mutates the GEOMETRY record — both move surfaces', async () => {
        const { bus } = bootBus(geometry);

        expect(geometry.get(CW_ID)?.baseLine[0]).toEqual({ x: 0, y: 0, z: 0 });

        // Verbatim the payload `registerTransformDragHandler.ts:435` and
        // `elementMove.ts:296-311` build: { id, updates: { baseLine: [p0, p1] } }.
        await bus.executeCommand('wall.updateCurtainWall', {
            id: CW_ID,
            updates: {
                baseLine: [
                    { x: 4, y: 0, z: 2 },
                    { x: 10, y: 0, z: 2 },
                ],
            },
        });

        const bl = geometry.get(CW_ID)!.baseLine;
        expect(bl[0]).toEqual({ x: 4, y: 0, z: 2 });
        expect(bl[1]).toEqual({ x: 10, y: 0, z: 2 });
    });

    it('a property/material edit mutates the GEOMETRY record', async () => {
        const { bus } = bootBus(geometry);

        expect(geometry.get(CW_ID)?.mullionColor).toBe('#888888');

        // PropertyInspectorApply.ts:225 / MaterialDispatch.ts:115 shape.
        await bus.executeCommand('wall.updateCurtainWall', {
            id: CW_ID,
            updates: { mullionColor: '#112233', height: 4.5 },
        });

        expect(geometry.get(CW_ID)?.mullionColor).toBe('#112233');
        expect(geometry.get(CW_ID)?.height).toBe(4.5);
    });

    it('a refused update leaves the geometry record untouched (refusal is not success)', async () => {
        const { bus } = bootBus(geometry);

        // UpdateCurtainWallCommand.canExecute refuses an id the geometry store does not
        // hold. The verb must REFUSE, not report success against a record it never found.
        await expect(
            bus.executeCommand('wall.updateCurtainWall', {
                id: 'cw-does-not-exist',
                updates: { mullionColor: '#000000' },
            }),
        ).rejects.toThrow();

        expect(geometry.get(CW_ID)?.mullionColor).toBe('#888888');
    });
});
