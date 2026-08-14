// @vitest-environment happy-dom
//
// §FIX-STAIR-CREATE-SHADOW (MT-03 / L-MT8) — dispatching `stair.create` on the
// production bus must mint the stair in the GEOMETRY record — the
// `@pryzm/geometry-stair` `StairStore` that `initBuilders.ts:902` constructs and
// exposes as `window.stairStore`, that StairMeshBuilder / StairRailingBuilder
// rebuild from (`bim-stair-added` / `bim-stair-updated`), that the plan
// projector reads, and that ProjectSerializer / ProjectLoader round-trip.
// NOT the plugin DTO store.
//
// THE RIVALRY (CA-21 executed read-back, per the sheet.addViewport precedent):
// two handlers declare `stair.create`, and only one can register —
// `CommandBus.register` THROWS on a duplicate and `initBusHandlers` skips a
// bridge whose verb is already taken (§OI-053 `registry.has()` guard), so the
// FIRST registration wins. The stair plugin set is contributed by
// `PluginRegistry.ts:310-314` inside composeRuntime, which runs BEFORE
// initBusHandlers — the exact boot order `plugins/stair/src/handlers/MoveStair.ts`
// documents for `stair.move` (§FIX-STAIR-MOVE-DETACHED-STORE):
//
//   1. `CreateStairHandler` (plugins/stair) — `produceCommand` against
//      `ctx.stores.stair`, a FRESH plugin DTO store nothing renders, projects,
//      exports or persists. Its payload is the PLUGIN shape ({ levelId, origin,
//      numRisers, shape: 'straight' | 'l-shape' | … }).
//   2. The §E.5.4 bridge (initBusHandlers.ts) — `_cmExec(new CreateStairCommand(cmd))`
//      → the geometry `stairStore` + bimManager + elementRegistry + semanticGraph
//      + the auto slab-void carve + the railing proposals.
//
// The ONE live production dispatcher of this verb, `StairPlanToolHandler.ts:246`
// (§P3.3 made it bus-only), sends the BRIDGE'S CreateStairInput shape:
// `{ baseLevelId, topLevelId, shape: 'I'|'L'|'U', riserHeight, treadDepth, width,
// startPosition, flights, landings, … }` — and its own header says in writing
// that the §E.5.4 bridge is the handler it expects. The plugin arm loses on all
// three sheet-precedent axes:
//
//   STORE   — it writes only the detached DTO store;
//   PAYLOAD — `shape: 'I'` is not in the plugin Zod enum
//             ('straight' | 'l-shape' | 'u-shape' | 'spiral'), so the live plan
//             payload is REFUSED (StairSchemaError), and `baseLevelId` /
//             `startPosition` / `flights` are ignored even when a payload parses;
//   FUNCTION — no bimManager / elementRegistry / semanticGraph registration, no
//             slab-void carve, no railing proposals, no level-height validation.
//
// The 3-D stair tools (`StairTool.ts:283`, `StairPathToolController.ts:746`) run
// the real creation through `commandManager.execute(new CreateStairCommand(...))`
// DIRECTLY and additionally fire `bus.executeCommand('stair.create', {})` as
// fire-and-forget telemetry. Under the plugin arm that telemetry dispatch MINTED
// A PHANTOM DTO STAIR (all defaults, levelId '') on every 3-D stair placement;
// under the bridge it is refused at validate (`baseLevelId is required`) and
// swallowed by its own `.catch(() => {})` — the third test pins that.
//
// VERIFY AT THE OUTCOME, NOT AT THE SEAM: every assertion reads the geometry
// record back. `success === true` is never asserted on its own.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommandBus } from '@pryzm/command-bus';
import { buildStairHandlerSet } from '@pryzm/plugin-stair';
import { StairStore as GeometryStairStore } from '@pryzm/geometry-stair';
import { CreateStairCommand } from '@pryzm/command-registry';

/** Two levels 2.7 m apart — riserHeight 0.18 × riserCount 15 === 2.7 exactly,
 *  the invariant CreateStairCommand.canExecute checks against HEIGHT_TOLERANCE. */
const LEVELS = [
    { id: 'L0', name: 'Ground', elevation: 0 },
    { id: 'L1', name: 'Level 1', elevation: 2.7 },
];

/**
 * EXACTLY the payload `StairPlanToolHandler._commitStair` dispatches for a
 * straight (I) run drawn along +Z (lines 246-260): the CreateStairInput shape.
 */
const PLAN_TOOL_PAYLOAD = {
    baseLevelId: 'L0',
    topLevelId: 'L1',
    shape: 'I',
    riserHeight: 0.18,
    treadDepth: 0.28,
    width: 1.0,
    startPosition: { x: 2, y: 0, z: 3 },
    flights: [{ direction: { x: 0, y: 0, z: 1 }, riserCount: 15 }],
    landings: [],
    typeId: undefined,
    turnDirection: undefined,
    secondRunSide: undefined,
    stepsBeforeLanding: undefined,
};

/**
 * Reproduces the production wiring at the ONE point that matters: boot order.
 *
 *  - composeRuntime registers the plugin handler set FIRST (PluginRegistry).
 *  - initBusHandlers then attempts its §E.5.4 bridge, skipping any verb already
 *    taken (`registry?.has?.(spec.type)` → `continue`).
 *
 * `_cmExec` is modelled by a `window.commandManager` stub that runs the legacy
 * command against a CommandContext holding the REAL geometry StairStore — what
 * `CommandManagerImpl` does in production.
 */
function bootBus(geometry: GeometryStairStore): { bus: CommandBus; bridgeRegistered: boolean } {
    const bus = new CommandBus({
        audit: { actorId: 'probe', source: 'LOCAL' } as never,
        // The plugin DTO store PluginRegistry builds — detached by construction.
        // The surviving stair handlers still declare affectedStores: ['stair'].
        storesProvider: () => ({ stair: {} }) as never,
    } as never);

    // ── phase 1: composeRuntime → PluginRegistry → bus.register(...) ──
    for (const h of buildStairHandlerSet()) bus.register(h as never);

    // ── phase 2: initBusHandlers, with the real skip-if-present guard ──
    const legacyCtx = {
        stores: {
            stairStore: geometry,
            wallStore: { getLevels: () => LEVELS },
            // no stairTypeStore (optional), no slabStore/openingStore — the
            // auto-opening carve is try/caught non-fatal in CreateStairCommand.
        },
        bimManager: { registerElement: () => { /* side index; no-op in probe */ } },
        projectContext: { activeLevelId: 'L0' },
    };
    (window as unknown as { commandManager: { execute(c: unknown): void } }).commandManager = {
        execute: (cmd: unknown) => {
            const c = cmd as {
                canExecute(ctx: unknown): { ok: boolean; reason?: string };
                execute(ctx: unknown): { success: boolean };
            };
            const v = c.canExecute(legacyCtx);
            if (!v.ok) throw new Error(`legacy command refused: ${v.reason ?? 'no reason'}`);
            c.execute(legacyCtx);
        },
    };

    let bridgeRegistered = false;
    if (!bus.has('stair.create')) {
        // The §E.5.4 bridge, verbatim in shape (initBusHandlers.ts).
        bus.register({
            type: 'stair.create',
            affectedStores: [] as never,
            canExecute: (_ctx: unknown, cmd: { baseLevelId?: string }) =>
                (cmd.baseLevelId ? { valid: true } : { valid: false, reason: 'baseLevelId is required' }),
            execute: (_ctx: unknown, cmd: Record<string, unknown>) => {
                (window as unknown as { commandManager: { execute(c: unknown): void } })
                    .commandManager.execute(new CreateStairCommand(cmd as never));
                return { forward: [], inverse: [] };
            },
        } as never);
        bridgeRegistered = true;
    }

    return { bus, bridgeRegistered };
}

describe('§FIX-STAIR-CREATE-SHADOW — stair.create must reach the geometry record', () => {
    let geometry: GeometryStairStore;

    beforeEach(() => {
        geometry = new GeometryStairStore({ activeLevelId: 'L0' } as never);
    });
    afterEach(() => { delete (window as unknown as Record<string, unknown>).commandManager; });

    it('the stair plugin does not claim stair.create, so the editor bridge can register it', () => {
        // The structural invariant. If someone re-adds CreateStairHandler to the
        // plugin build set, the bridge is silently skipped again, the plan tool
        // goes dead again, and the 3-D tools resume minting phantom DTO stairs.
        const types = buildStairHandlerSet().map((h) => h.type);
        expect(types).not.toContain('stair.create');

        const { bridgeRegistered } = bootBus(geometry);
        expect(bridgeRegistered).toBe(true);
    });

    it('the live StairPlanToolHandler payload mints the stair in the GEOMETRY store', async () => {
        const { bus } = bootBus(geometry);

        expect(geometry.getAll()).toHaveLength(0);

        await bus.executeCommand('stair.create', PLAN_TOOL_PAYLOAD);

        // The authoritative read — NOT the plugin DTO store, NOT `success === true`.
        const all = geometry.getAll();
        expect(all).toHaveLength(1);
        const stair = all[0]!;
        expect(stair.baseLevelId).toBe('L0');
        expect(stair.topLevelId).toBe('L1');
        expect(stair.shape).toBe('I');
        expect(stair.startPosition).toEqual({ x: 2, y: 0, z: 3 });
        expect(stair.riserCount).toBe(15);
        // The bridge's command mints the IFC join key the plugin arm never did.
        expect(stair.ifcData?.guid).toBeTruthy();
    });

    it('the 3-D tools\' fire-and-forget telemetry dispatch ({}) is REFUSED and mints nothing anywhere', async () => {
        const { bus } = bootBus(geometry);

        // StairTool.ts:283 / StairPathToolController.ts:746 — the real creation
        // goes through commandManager directly; the bus dispatch is `{}`. Under
        // the plugin arm this minted a phantom default stair in the DTO store.
        await expect(bus.executeCommand('stair.create', {})).rejects.toThrow(/baseLevelId/);

        expect(geometry.getAll()).toHaveLength(0);
    });
});
