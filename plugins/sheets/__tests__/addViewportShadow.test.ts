// §FIX-SHEET-ADDVIEWPORT-SHADOW (MT-03) — the sheets plugin must NOT declare
// `sheet.addViewport`.
//
// ── THE RIVALRY, DECIDED BY READ-BACK, NOT PRECEDENT ────────────────────────
//
// The MT-03 brief marked this verb CONTESTED: the plugin arm produceCommands
// against a REAL declared store (['sheet']), so it could not be dismissed as a
// swallow-bridge. The executed read-back that decides it lives in
// `apps/editor/__tests__/SheetAddViewportReachesSheetStore.test.ts`; verdict:
//
//   · the AUTHORITATIVE store for sheets is the `@pryzm/core-app-model`
//     `sheetStore` module singleton (the CA-21 liveness census's own row) —
//     written by the bridge's AddViewportToSheetCommand, NOT by this plugin's
//     DTO SheetsState;
//   · `registerSheetHandlers()` has ZERO production callers (not in
//     PluginRegistry, never called by engineLauncher) — this plugin's arm
//     never claimed the verb on any production bus;
//   · the one live dispatcher (ViewsRailPanel.ts:909) sends the
//     BRIDGE-shaped payload (`position: {x,y}`, `viewportId`), which this
//     plugin's handler would REFUSE (it required top-level finite
//     x/y/width/height).
//
// Authority DECLARED: the §E.5.5 bridge at initBusHandlers.ts:2320. The loser
// is DELETED, not commented (095cfa10 / 95ce7932 precedent), together with
// its dead unit suite (CA-21: "a dead verb's tests MUST NOT pin the lie").
// `ViewportManager` keeps building its drop payload with a local type — its
// `handleDropView()` has no production caller today, and wiring it must first
// reconcile the payload with AddViewportToSheetParams (recorded in the
// read-back suite's header).
//
// This test is the pin. It failed before the deletion and passes after, and
// `check-verb-register`'s SHADOWED ratchet shrinks by one in the same commit.

import { describe, expect, it } from 'vitest';
import { CommandBus } from '@pryzm/plugin-sdk';
import { buildSheetHandlerSet, SHEET_HANDLER_TYPES } from '../src/handlers/index.js';

describe('§FIX-SHEET-ADDVIEWPORT-SHADOW — the sheets plugin yields sheet.addViewport to the bridge', () => {
  it('SHEET_HANDLER_TYPES does not declare sheet.addViewport', () => {
    expect(SHEET_HANDLER_TYPES as readonly string[]).not.toContain('sheet.addViewport');
  });

  it('no handler in the built set answers to sheet.addViewport', () => {
    const types = buildSheetHandlerSet().map((h) => h.type);
    expect(types).not.toContain('sheet.addViewport');
  });

  it('after registering the sheets set on a real bus, the type is still FREE for the bridge to claim', () => {
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      storesProvider: () => ({ sheet: {} }),
    });
    for (const h of buildSheetHandlerSet()) bus.register(h as Parameters<CommandBus['register']>[0]);

    // The §OI-053 guard the bridge consults is exactly this reading.
    expect(bus.registry?.has?.('sheet.addViewport' as never) ?? false).toBe(false);

    // Negative control — the guard is not vacuously false: a verb the sheets
    // plugin DOES own reads `true` through the same call.
    //
    // ⚠ This control used to name 'sheet.create'. §FIX-SHEET-CREATE-SHADOW
    // (C-FIX LANE 3) yielded that verb to the L-1590 initBusHandlers bridge for
    // the same three reasons this file records for 'sheet.addViewport', so it
    // is no longer a verb the plugin owns and would no longer be a control.
    // 'sheet.rename' is: it is still in SHEET_HANDLER_TYPES. See
    // __tests__/createSheetShadow.test.ts.
    expect(bus.registry?.has?.('sheet.rename' as never) ?? false).toBe(true);
  });
});
