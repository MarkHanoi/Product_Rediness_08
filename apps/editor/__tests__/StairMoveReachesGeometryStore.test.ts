// @vitest-environment happy-dom
//
// §FIX-STAIR-MOVE-SHADOW (MT-03 / L-MT8) — `stair.move` resolved by MERGE, not
// deletion of the plugin arm.
//
// ── WHY THIS VERB IS THE REVERSE of the sheet/create precedents ─────────────
//
// `stair.move` had TWO declaring sites:
//
//   (1) `plugins/stair/src/handlers/MoveStair.ts` — registered FIRST
//       (PluginRegistry.ts:310-314 at composeRuntime) and therefore the arm the
//       bus holds. Since §FIX-STAIR-MOVE-DETACHED-STORE (2026-08-06) it is
//       DELIBERATELY DUAL-STORE: canExecute accepts the stair from EITHER store;
//       execute bridges `MoveStairCommand` through `window.commandManager`
//       whenever the geometry store holds the stair (the command owns the store
//       mutation, the undo snapshot, and the `bim-stair-updated` emit that
//       carries the railings), AND applies the Immer patch when the plugin DTO
//       store holds it — so neither authority diverges mid-migration.
//   (2) the `initBusHandlers.ts` §STAIR-3D-MOVE bridge — DEAD since the plugin
//       set registered first (§OI-053 `registry.has()` skip). Read side-by-side
//       before deciding (the MT-03 mandate): everything the bridge did is a
//       strict subset of (1) — same `new MoveStairCommand({stairId, delta})`,
//       weaker validation (presence vs finite-Vec3), and `_cmExec`'s
//       fire-and-forget void return where (1) THROWS when the move could not
//       land anywhere. `_cmExec`'s gestureId stamp is not load-bearing on this
//       path: the bridged move returns EMPTY patches, so no ring-buffer twin
//       exists for performUndo to pair with.
//
// So the MERGED handler is (1), already in the tree; MT-03 deletes the dead
// bridge entry. The repo had already ruled this direction in writing:
// `transformDragUndoCapture.matrix.test.ts` keeps `stair.move` as its POSITIVE
// CONTROL — "a genuinely LIVE hybrid" — and `plugins/stair/__tests__/
// handlers.test.ts` pins the dual-store acceptance + the bridge dispatch.
//
// ⚠ HONESTY NOTE (C70 §5.6): deleting the dead bridge is a runtime NO-OP, so
// this suite is green both before and after the deletion — it is the CA-21
// read-back proving the KEPT arm reaches the authoritative record, not a
// red-first pin of the deletion. The watched-RED for this verb is the GATE:
// with the bridge deleted and `stair.move` still on the SHADOWED baseline,
// `check-verb-register` fails V4 ("no longer qualifies") until the name is
// struck in the same commit.
//
// VERIFY AT THE OUTCOME: every assertion reads the geometry record back.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommandBus } from '@pryzm/command-bus';
import { buildStairHandlerSet } from '@pryzm/plugin-stair';
import { StairStore as GeometryStairStore, type StairData } from '@pryzm/geometry-stair';
import { MoveStairCommand } from '@pryzm/command-registry';

const STAIR_ID = 'stair-probe-move-1';

/** A U-shape stair with a flight startOverride and a landing centre — the two
 *  secondary anchors MoveStairCommand must shift alongside startPosition. */
function seedGeometryStore(): GeometryStairStore {
    const store = new GeometryStairStore({ activeLevelId: 'L0' } as never);
    store.add({
        id: STAIR_ID,
        type: 'stair',
        levelId: 'L0',
        baseLevelId: 'L0',
        topLevelId: 'L1',
        baseOffset: 0,
        topOffset: 0,
        shape: 'U',
        riserHeight: 0.18,
        treadDepth: 0.28,
        width: 1.2,
        riserCount: 15,
        startPosition: { x: 1, y: 0, z: 1 },
        flights: [
            { direction: { x: 0, y: 0, z: 1 }, riserCount: 8 },
            { direction: { x: 0, y: 0, z: -1 }, riserCount: 7, startOverride: { x: 2.4, y: 1.44, z: 3 } },
        ],
        landings: [{ depth: 1.2, center: { x: 1.7, y: 1.44, z: 3 } }],
        accessibilityType: 'standard',
        properties: {},
        parameters: {},
        metadata: { createdAt: '2026-08-14', modifiedAt: '2026-08-14', version: 0, source: 'user' },
        ifcData: { guid: 'probe-guid', ifcClass: 'IfcStair' },
    } as unknown as StairData);
    return store;
}

/** Production boot order: plugin set first, then the (former) bridge attempt
 *  with the real §OI-053 skip-if-present guard. */
function bootBus(geometry: GeometryStairStore): { bus: CommandBus; bridgeWasSkipped: boolean } {
    const bus = new CommandBus({
        audit: { actorId: 'probe', source: 'LOCAL' } as never,
        storesProvider: () => ({ stair: {} }) as never,
    } as never);

    // ── phase 1: composeRuntime → PluginRegistry → bus.register(...) ──
    for (const h of buildStairHandlerSet()) bus.register(h as never);

    // The plugin handler resolves the stair via window.stairStore and bridges
    // through window.commandManager — exactly the production seams.
    const legacyCtx = { stores: { stairStore: geometry } };
    const w = window as unknown as {
        stairStore?: unknown;
        commandManager?: { execute(c: unknown): void };
    };
    w.stairStore = geometry;
    w.commandManager = {
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

    // ── phase 2: what the deleted initBusHandlers bridge would have done ──
    // While the entry existed, this reading was `true` on every production boot,
    // so the bridge NEVER registered. Its deletion is a runtime no-op.
    const bridgeWasSkipped = bus.has('stair.move');

    return { bus, bridgeWasSkipped };
}

describe('§FIX-STAIR-MOVE-SHADOW — the merged plugin hybrid reaches the geometry record', () => {
    let geometry: GeometryStairStore;

    beforeEach(() => { geometry = seedGeometryStore(); });
    afterEach(() => {
        const w = window as unknown as Record<string, unknown>;
        delete w.commandManager;
        delete w.stairStore;
    });

    it('the plugin arm owns the verb at boot, so the deleted bridge entry was dead code', () => {
        const { bridgeWasSkipped } = bootBus(geometry);
        expect(bridgeWasSkipped).toBe(true);
    });

    it('the live gizmo payload { stairId, delta } moves the GEOMETRY record — all three anchors', async () => {
        const { bus } = bootBus(geometry);

        // Exactly what StairTransformController / MOVE_COMMAND_BY_TYPE.stair dispatch.
        const ev = await bus.executeCommand('stair.move', {
            stairId: STAIR_ID,
            delta: { x: 3, y: 0, z: -2 },
        });

        const moved = geometry.getById(STAIR_ID)!;
        expect(moved.startPosition).toEqual({ x: 4, y: 0, z: -1 });
        expect(moved.flights[1]!.startOverride).toEqual({ x: 5.4, y: 1.44, z: 1 });
        expect(moved.landings[0]!.center).toEqual({ x: 4.7, y: 1.44, z: 1 });

        // The bridged MoveStairCommand owns the mutation and the undo entry:
        // the bus record carries EMPTY patches (no ring-buffer twin to pair).
        expect(ev.forward).toEqual([]);
        expect(ev.inverse).toEqual([]);
    });

    it('an unknown stair is REFUSED by name and the geometry record is untouched', async () => {
        const { bus } = bootBus(geometry);

        await expect(
            bus.executeCommand('stair.move', { stairId: 'stair-nowhere', delta: { x: 1, y: 0, z: 0 } }),
        ).rejects.toThrow(/stair not found: stair-nowhere/);

        expect(geometry.getById(STAIR_ID)!.startPosition).toEqual({ x: 1, y: 0, z: 1 });
    });
});
