// §FIX-FURNITURE-UPDATEPARAMS-SHADOW (MT-03 / L-MT8) — `furniture.updateParameters`
// resolved by keeping the PLUGIN arm and deleting the dead editor bridge.
//
// ── WHY THE DIRECTION IS THE REVERSE of the level.add / view.* precedents ───
//
// The verb had TWO declaring sites:
//
//   (1) `plugins/furniture/src/handlers/UpdateFurnitureParameters.ts` —
//       registered FIRST (PluginRegistry.ts:344-350 contributes the furniture
//       set at composeRuntime, before initBusHandlers; engineLauncher's
//       §P3.5-FU registerFurnitureHandlers re-attempt then throws on its first
//       duplicate and is caught non-fatal). This arm carries the
//       §FIX-UNDO-CAPTURE-SYSTEMIC (L-72) undo capture: on a 3D-gizmo drag-end
//       (`_recordUndo` + `_prev*`) it emits the forward/inverse PatchPair that
//       puts the move/rotate on the unified ring buffer — pinned by the
//       executed `updateParameters-undo-capture.test.ts` (4 cases) — AND it
//       bridges the SAME `UpdateFurnitureParametersCommand` to
//       `window.commandManager` for the authoritative geometry mutation.
//   (2) the `initBusHandlers.ts` bridge — `_cmExec(new
//       UpdateFurnitureParametersCommand(cmd))` with `stores: []` and NO undo
//       capture. DEAD since the furniture set registered first (§OI-053
//       `registry.has()` skip). Deleting the PLUGIN arm would have handed the
//       verb to an arm that LOSES the L-72 ring-buffer capture — every 3-D
//       furniture move/rotate would again be skipped by the ring-buffer-first
//       performUndo() and "stay moved" on Ctrl+Z (the exact L-72/L-49 defect).
//
// Authority DECLARED: the plugin arm — the winner already contains the undo
// capture, so the "merge" direction is satisfied by keeping it; the dead
// bridge contributes nothing that survives a side-by-side read. Residual,
// stated not hidden: `_cmExec` stamps `currentGestureId()` on the legacy
// metadata (§UNDO-GESTURE-ID) and the plugin arm does not — but that stamp
// never ran for this verb (the bridge never registered), and porting it would
// need a new plugin → @pryzm/command-bus import, a fresh SDK-bypass on the
// check-layer-boundaries ratchet. Recorded in the MT-03 commit instead.
//
// ⚠ The deleted bridge is DEAD CODE, so its removal is a runtime no-op and this
// suite is green before and after — it pins the OWNER, not the deletion. The
// watched-RED for this verb is the gate: with the bridge deleted and the verb
// still on the SHADOWED baseline, `check-verb-register` fails V4 until the
// name is struck in the same commit. The `UPDATE_FURNITURE_PARAMETERS`
// replay bridge (§FURNITURE-UPDATE-REPLAY, CommandType key) is a DIFFERENT
// wire identifier and stays.

import { describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/plugin-sdk';
import {
  buildFurnitureHandlerSet,
  FURNITURE_HANDLER_TYPES,
} from '../src/handlers/index.js';

describe('§FIX-FURNITURE-UPDATEPARAMS-SHADOW — the plugin arm owns furniture.updateParameters', () => {
  it('FURNITURE_HANDLER_TYPES declares the verb (the L-72 arm is the owner)', () => {
    expect(FURNITURE_HANDLER_TYPES as readonly string[]).toContain('furniture.updateParameters');
  });

  it('the built set answers the verb with the handler that declares the furniture store (ring-buffer routing)', () => {
    const handler = buildFurnitureHandlerSet().find((h) => h.type === 'furniture.updateParameters');
    expect(handler).toBeDefined();
    // affectedStores: ['furniture'] is what routes the L-72 PatchPair onto the
    // ring buffer. The dead bridge declared `stores: []` — losing this loses undo.
    expect((handler as unknown as { affectedStores: readonly string[] }).affectedStores)
      .toEqual(['furniture']);
  });

  it('after registering the furniture set on a real bus, the verb is TAKEN — any editor bridge attempt is skipped', () => {
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      emitter: new PatchEmitter(),
      undoStack: new UndoStack({ maxSize: 8 }),
      storesProvider: () => ({ furniture: {} }),
    });
    for (const h of buildFurnitureHandlerSet()) bus.register(h as Parameters<CommandBus['register']>[0]);

    // The §OI-053 guard the (deleted) bridge consulted read exactly this: TRUE
    // on every production boot, so the bridge never registered — dead code.
    expect(bus.registry?.has?.('furniture.updateParameters' as never) ?? false).toBe(true);

    // Negative control — has() is not vacuously true: a verb nobody declares
    // reads false through the same call.
    expect(bus.registry?.has?.('furniture.updateParameters.v2' as never) ?? false).toBe(false);
  });
});
