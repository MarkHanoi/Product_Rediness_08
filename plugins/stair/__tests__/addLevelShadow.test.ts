// @vitest-environment happy-dom
//
// §FIX-LEVEL-ADD-SHADOW (MT-03) — the stair plugin must NOT claim `level.add`.
//
// ── THE RIVALRY, AND WHY THE BRIDGE WINS ────────────────────────────────────
//
// `level.add` had TWO declaring sites and only one of them could ever register:
//
//   (1) `plugins/stair/src/handlers/AddLevel.ts` — parked in the STAIR plugin
//       ("Placed in stair plugin to avoid creating a new plugin registration",
//       its own header) and in STAIR_HANDLER_TYPES, which PluginRegistry.ts:313
//       contributes at composeRuntime() time, BEFORE initBusHandlers runs.
//   (2) the §E.5.4 bridge in `apps/editor/src/engine/initBusHandlers.ts:2088` —
//       skipped by the §OI-053 `runtime.bus.registry?.has?.(spec.type)` guard
//       precisely BECAUSE (1) got there first.
//
// That is the SHADOWED shape `check-verb-register` names. This file pays the
// verb, per the fc4de954 (`template.assignToNode`) precedent.
//
// This was never two different things: BOTH arms construct the SAME
// `AddLevelCommand` from `@pryzm/command-registry` and BOTH honour the §R7-FIX
// `_skipBridge` dual-write guard (C02 §3.4). They differ only in ways that make
// the plugin arm strictly worse:
//
//   · it wraps the dispatch in `catch (e) { console.error(...) }` and returns
//     `{ forward: [], inverse: [] }` — a FAILED mutation reported to the bus as
//     a clean success. C16 §5.1 CA-18 names that exact shape as PROHIBITED.
//   · if `window.commandManager` is absent it does nothing AT ALL and still
//     reports success. The bridge's `_cmExec` at least logs the §P1.4
//     "commandManager not ready — command dropped" error.
//   · its `canExecute` is unconditionally `{ valid: true }`; the bridge
//     validates `levelId` — and every live dispatcher sends one
//     (ProjectTreeSection.ts:176, GridsLevelsRailPanel.ts:246,
//     StairLevelRequiredPanel.ts:159 and PlanViewToolOverlay.ts:800, the last
//     two with `_skipBridge: true`, honoured identically by the bridge at
//     initBusHandlers.ts:2097).
//
// Authority DECLARED: the §E.5.4 bridge. The loser is DELETED, not commented
// (095cfa10 / 95ce7932 precedent). Deleting the plugin declaration does not
// delete the verb: it hands it to the arm written to own it.
//
// This test is the pin. It failed before the deletion and passes after, and
// `check-verb-register`'s SHADOWED ratchet shrinks by one in the same commit.

import { describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/plugin-sdk';
import { buildStairHandlerSet, STAIR_HANDLER_TYPES } from '../src/handlers/index.js';

describe('§FIX-LEVEL-ADD-SHADOW — the stair plugin yields level.add to the bridge', () => {
  it('STAIR_HANDLER_TYPES does not declare level.add', () => {
    expect(STAIR_HANDLER_TYPES as readonly string[]).not.toContain('level.add');
  });

  it('no handler in the built set answers to level.add', () => {
    const types = buildStairHandlerSet().map((h) => h.type);
    expect(types).not.toContain('level.add');
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
    expect(bus.registry?.has?.('level.add' as never) ?? false).toBe(false);

    // Negative control — the guard is not vacuously false: a verb the stair
    // plugin DOES own reads `true` through the same call. (`stair.create` was
    // this control until §FIX-STAIR-CREATE-SHADOW handed it to the bridge too;
    // `stair.move` is the plugin's ruled KEEP — the dual-store hybrid.)
    expect(bus.registry?.has?.('stair.move' as never) ?? false).toBe(true);
  });
});
