// §FIX-SHEET-CREATE-SHADOW (C-FIX LANE 3) — the sheets plugin must NOT declare
// `sheet.create`.
//
// ── WHY THIS VERB WAS SHADOWED AT ALL ────────────────────────────────────────
//
// `sheet.create` was the ONLY verb of the 361 in the P3 AXIS C command audit
// with TWO registration sites, i.e. the whole of the gate's SHADOWED class:
//
//     plugins/sheets/src/handlers/CreateSheet.ts:51      (this plugin)
//     apps/editor/src/engine/initBusHandlers.ts:2641     (the L-1590 bridge)
//
// The second one is NEW: it landed for L-1590 §SHEET-CREATE-HAS-NO-ROUTE after
// the founder reported "I am not able to create sheets" with
// `CommandBusError: no handler registered for: sheet.create`. Adding it is what
// moved this verb from UNKNOWN to SHADOWED.
//
// ── WHICH ARM IS REACHABLE — MEASURED, NOT ASSUMED ───────────────────────────
//
// ⛔ The gate's generic SHADOWED sentence ("the plugin one wins and the live
// bridge never registers") is FALSE FOR THIS VERB, and deleting the arm that
// sentence names would have removed the LIVE one. Three independent readings,
// all pointing the other way:
//
//   1. WIRING — `registerSheetHandlers()` has ZERO production callers. It is
//      not in `apps/editor/src/PluginRegistry.ts` (whose only `sheets` entry
//      registers a TOOL, not a handler set) and no `engineLauncher` line calls
//      it. So the §OI-053 `registry.has('sheet.create')` skip at
//      initBusHandlers.ts:2902 NEVER fires for this verb, and the bridge
//      registers on every real boot. This plugin's arm claims the verb on no
//      production bus at all.
//
//   2. STORE — the bridge runs `CreateSheetCommand`, which writes the
//      `@pryzm/core-app-model` `sheetStore` MODULE SINGLETON. That is the store
//      the one live UI reads: `SheetsRailPanel.build()` calls
//      `sheetStore.getAll()`. This plugin's arm produced Immer patches against
//      a DETACHED DTO `SheetsState` under storeKey `sheet` — a key the composed
//      runtime does not even own (the P3 audit measured its undo unit as
//      STRANDED: "owner=nothing: sheet"). A sheet minted here would never
//      appear in the rail.
//
//   3. PAYLOAD — the sole live dispatcher,
//      `SheetsRailPanel._executeCreateSheet`, sends `{ id, sheetNumber, name }`
//      — exactly the BRIDGE's validated shape. `CreateSheetPayload` had no
//      `sheetNumber` field at all, so this arm would have silently DROPPED the
//      number the user typed and auto-generated `A-1` in its place. The two
//      remaining literal dispatchers are dead code: `SheetTool`
//      (plugins/sheets/src/tool.ts) is never instantiated in production and
//      `dispatchCreateSheet` (sheet-list.ts) has no caller outside the barrel.
//
// All three axes agree with §FIX-SHEET-ADDVIEWPORT-SHADOW (MT-03), which
// decided the IDENTICAL question one command over by executed read-back and
// declared the initBusHandlers bridge the authority for the sheet family. This
// is that ruling applied to the last verb still contradicting it.
//
// Authority DECLARED: the L-1590 bridge at initBusHandlers.ts:2641. The loser
// is DELETED, not commented (095cfa10 / 95ce7932 precedent), together with its
// dead unit suite `handlers.create.test.ts` (CA-21: "a dead verb's tests MUST
// NOT pin the lie").
//
// This test is the pin. It was watched FAILING 3/3 before the deletion.

import { describe, expect, it } from 'vitest';
import { CommandBus } from '@pryzm/plugin-sdk';
import { buildSheetHandlerSet, SHEET_HANDLER_TYPES } from '../src/handlers/index.js';

describe('§FIX-SHEET-CREATE-SHADOW — the sheets plugin yields sheet.create to the bridge', () => {
  it('SHEET_HANDLER_TYPES does not declare sheet.create', () => {
    expect(SHEET_HANDLER_TYPES as readonly string[]).not.toContain('sheet.create');
  });

  it('no handler in the built set answers to sheet.create', () => {
    const types = buildSheetHandlerSet().map((h) => h.type);
    expect(types).not.toContain('sheet.create');
  });

  it('after registering the sheets set on a real bus, the type is still FREE for the bridge to claim', () => {
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({ sheet: {} }),
    });
    for (const h of buildSheetHandlerSet()) bus.register(h as Parameters<CommandBus['register']>[0]);

    // The §OI-053 guard the bridge consults at initBusHandlers.ts:2902 is
    // exactly this reading. FALSE ⇒ the bridge registers.
    expect(bus.registry?.has?.('sheet.create' as never) ?? false).toBe(false);

    // Negative control — the guard is not vacuously false: a verb the sheets
    // plugin DOES still own reads `true` through the same call.
    expect(bus.registry?.has?.('sheet.rename' as never) ?? false).toBe(true);
  });
});
