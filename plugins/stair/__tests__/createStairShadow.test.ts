// §FIX-STAIR-CREATE-SHADOW (MT-03) — the stair plugin must NOT claim `stair.create`.
//
// ── THE RIVALRY, DECIDED BY READ-BACK, NOT PRECEDENT ────────────────────────
//
// `stair.create` had TWO declaring sites and only one could ever register:
//
//   (1) `plugins/stair/src/handlers/CreateStair.ts` — in STAIR_HANDLER_TYPES,
//       contributed by PluginRegistry.ts:310-314 at composeRuntime() time,
//       BEFORE initBusHandlers runs. It `produceCommand`ed against
//       `ctx.stores.stair`, the plugin's DETACHED Immer DTO store — the store
//       this plugin's own `MoveStair.ts` header documents as "which nothing
//       writes in production" (§FIX-STAIR-MOVE-DETACHED-STORE).
//   (2) the §E.5.4 bridge in `apps/editor/src/engine/initBusHandlers.ts` —
//       `_cmExec(new CreateStairCommand(cmd))` → the geometry `StairStore`
//       (`window.stairStore`) that StairMeshBuilder, the plan projector and
//       ProjectSerializer read — skipped by the §OI-053 `registry.has()` guard
//       BECAUSE (1) got there first.
//
// The executed read-back that decides it lives in
// `apps/editor/__tests__/StairCreateReachesGeometryStore.test.ts`; verdict —
// the plugin arm loses on all three sheet-precedent axes:
//
//   · STORE — only the detached DTO store; no bimManager / elementRegistry /
//     semanticGraph registration, no slab-void carve, no railing proposals;
//   · PAYLOAD — the ONE live dispatcher (StairPlanToolHandler.ts:246, bus-only
//     since §P3.3) sends CreateStairInput (`baseLevelId`, `startPosition`,
//     `flights`, shape 'I'|'L'|'U'); the plugin arm REFUSED shape 'I'
//     (its Zod enum is 'straight'|'l-shape'|'u-shape'|'spiral') and ignored
//     `baseLevelId` even when a payload parsed;
//   · FUNCTION — the 3-D tools' fire-and-forget `stair.create` `{}` telemetry
//     dispatches (StairTool.ts:283, StairPathToolController.ts:746) minted a
//     PHANTOM default DTO stair on every 3-D placement; the bridge refuses
//     them at validate (`baseLevelId is required`).
//
// Authority DECLARED: the §E.5.4 bridge. The loser is DELETED, not commented
// (095cfa10 / 95ce7932 precedent). `CreateStairPayload` (still the entry shape
// of `stair.batch.create`) moved to `CreateStairBatch.ts`.
//
// This test is the pin. It failed before the deletion and passes after, and
// `check-verb-register`'s SHADOWED ratchet shrinks by one in the same commit.

import { describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/plugin-sdk';
import { buildStairHandlerSet, STAIR_HANDLER_TYPES } from '../src/handlers/index.js';

describe('§FIX-STAIR-CREATE-SHADOW — the stair plugin yields stair.create to the bridge', () => {
  it('STAIR_HANDLER_TYPES does not declare stair.create', () => {
    expect(STAIR_HANDLER_TYPES as readonly string[]).not.toContain('stair.create');
  });

  it('no handler in the built set answers to stair.create', () => {
    const types = buildStairHandlerSet().map((h) => h.type);
    expect(types).not.toContain('stair.create');
  });

  it('after registering the stair set on a real bus, the type is still FREE for the bridge to claim', () => {
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      emitter: new PatchEmitter(),
      undoStack: new UndoStack({ maxSize: 8 }),
      storesProvider: () => ({ stair: {} }),
    });
    for (const h of buildStairHandlerSet()) bus.register(h as Parameters<CommandBus['register']>[0]);

    // The §OI-053 guard the bridge consults is exactly this reading. While the
    // plugin handler existed it read `true` and the bridge was skipped.
    expect(bus.registry?.has?.('stair.create' as never) ?? false).toBe(false);

    // Negative control — the guard is not vacuously false: a verb the stair
    // plugin DOES own reads `true` through the same call. `stair.move` is the
    // ruled owner of its verb (the §FIX-STAIR-MOVE-DETACHED-STORE dual-store
    // hybrid — MT-03 kept the plugin arm and deleted the dead bridge).
    expect(bus.registry?.has?.('stair.move' as never) ?? false).toBe(true);
  });
});
