// @vitest-environment happy-dom
//
// §FIX-SHEET-ADDVIEWPORT-SHADOW (MT-03) — the READ-BACK that decides the
// `sheet.addViewport` dual registration. The MT-03 brief marked this verb
// CONTESTED: its plugin arm `produceCommand`s against a REAL declared store
// (`['sheet']`), so precedent could not decide the direction — only an
// executed read-back against authoritative state could (CA-21).
//
// ── THE TWO ARMS ────────────────────────────────────────────────────────────
//
//   (1) `plugins/sheets/src/handlers/AddViewport.ts` — a real produceCommand
//       handler against `ctx.stores.sheet`, the plugin-DTO SheetsState.
//   (2) the §E.5.5 bridge at `initBusHandlers.ts:2320` —
//       `_cmExec(new AddViewportToSheetCommand(cmd))`, which writes the
//       `@pryzm/core-app-model` `sheetStore` MODULE SINGLETON.
//
// ── THE READ-BACK VERDICT (measured, not preferred) ─────────────────────────
//
//   · AUTHORITATIVE STORE. The CA-21 liveness census
//     (tools/rac-conformance/runtime-harness) records the `sheet` family as
//     reachable via `@pryzm/core-app-model::sheetStore` — the singleton the
//     production ProjectSerializer consults. That is the store a viewport must
//     land in to survive a save. The plugin arm's `ctx.stores.sheet` DTO state
//     is not that store.
//   · WIRING. `registerSheetHandlers()` has ZERO production callers — the
//     sheets plugin set is not in PluginRegistry and engineLauncher never
//     registers it. The plugin arm never claimed the verb on ANY production
//     bus; the bridge has owned it all along. (Measured RED-first: with the
//     pre-deletion set registered ahead of the bridge, this suite watched the
//     dispatch report success while the core-app-model sheetStore did NOT
//     change — the exact readback-negative CA-21 names.)
//   · PAYLOAD. The one live dispatcher, ViewsRailPanel.ts:909, sends
//     `{ sheetId, viewportId, viewId, position: {x, y}, scale, viewType }` —
//     the BRIDGE/AddViewportToSheetCommand shape. The plugin arm requires
//     top-level finite `x, y, width, height` and would REFUSE that payload.
//
// So the bridge wins on all three axes, and the plugin arm is deleted —
// `plugins/sheets/__tests__/addViewportShadow.test.ts` is the structural pin
// on the plugin side; THIS file is the executed proof the surviving arm
// reaches authoritative state.
//
// KNOWN, PRE-EXISTING, NOT WIDENED HERE: `ViewportManager.buildDropPayload()`
// (plugins/sheets/src/viewport.ts) still builds the PLUGIN-shaped payload.
// `handleDropView()` has no production caller today (sheet-editor-host uses
// only `computeWorldBounds`), so no live gesture sends that shape; wiring it
// would first need the payload reconciled with AddViewportToSheetParams.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommandBus } from '@pryzm/command-bus';
import { buildSheetHandlerSet } from '@pryzm/plugin-sheets';
import { sheetStore } from '@pryzm/core-app-model';
import { AddViewportToSheetCommand } from '@pryzm/command-registry';

const SHEET_ID = 'sheet-probe-1';
const VIEW_ID = 'view-probe-1';

/**
 * Reproduces the production wiring at the ONE point that matters: boot order.
 * `composeRuntime` registers plugin handler sets FIRST (none of the sheets set
 * is among them in production, but the STRONGEST case for the plugin arm is
 * modelled anyway by registering it here); `initBusHandlers` then attempts its
 * bridge, skipping any verb already taken (`registry?.has?.(spec.type)` →
 * `continue`). `_cmExec` is modelled by a `window.commandManager` stub that
 * runs the legacy command — exactly what initBusHandlers does in production
 * (mirrors CeilingUpdateReachesGeometryStore.test.ts).
 */
function bootBus(): { bus: CommandBus; bridgeRegistered: boolean } {
    const pluginSheetState: Record<string, unknown> = {};

    const bus = new CommandBus({
        audit: { actorId: 'probe', source: 'LOCAL' } as never,
        storesProvider: () => ({ sheet: pluginSheetState }) as never,
    } as never);

    // ── phase 1: the plugin handler set, ahead of the bridge ──
    for (const h of buildSheetHandlerSet()) bus.register(h as never);

    // ── phase 2: initBusHandlers, with the real skip-if-present guard ──
    (window as unknown as { commandManager: { execute(c: unknown): void } }).commandManager = {
        execute: (cmd: unknown) => {
            const c = cmd as {
                canExecute(ctx: unknown): { ok: boolean; reason?: string };
                execute(ctx: unknown): unknown;
            };
            const v = c.canExecute({});
            if (!v.ok) throw new Error(`legacy command refused: ${v.reason ?? 'no reason'}`);
            c.execute({});
        },
    };

    let bridgeRegistered = false;
    const registry = (bus as unknown as { handlers: Map<string, unknown> }).handlers;
    if (!registry.has('sheet.addViewport')) {
        bus.register({
            type: 'sheet.addViewport',
            affectedStores: [] as never,
            canExecute: (_ctx: unknown, cmd: { sheetId?: string; viewId?: string }) =>
                (cmd.sheetId && cmd.viewId
                    ? { valid: true }
                    : { valid: false, reason: 'sheetId and viewId are required' }),
            execute: (_ctx: unknown, cmd: Record<string, unknown>) => {
                (window as unknown as { commandManager: { execute(c: unknown): void } })
                    .commandManager.execute(new AddViewportToSheetCommand(cmd as never));
                return { forward: [], inverse: [] };
            },
        } as never);
        bridgeRegistered = true;
    }

    return { bus, bridgeRegistered };
}

describe('§FIX-SHEET-ADDVIEWPORT-SHADOW — sheet.addViewport must reach the core-app-model sheetStore', () => {
    beforeEach(() => {
        sheetStore.deserialize({ version: 1, sheets: [] });
        sheetStore.create({ id: SHEET_ID, sheetNumber: 'A-101', name: 'Probe sheet' });
    });
    afterEach(() => {
        delete (window as unknown as Record<string, unknown>).commandManager;
        sheetStore.deserialize({ version: 1, sheets: [] });
    });

    it('the sheets plugin does not claim sheet.addViewport, so the editor bridge can register it', () => {
        // The structural invariant. If someone re-adds AddViewportHandler to the
        // plugin build set AND wires registerSheetHandlers, the bridge is
        // silently skipped again and the authoritative write goes dead again.
        const types = buildSheetHandlerSet().map((h) => h.type);
        expect(types).not.toContain('sheet.addViewport');

        const { bridgeRegistered } = bootBus();
        expect(bridgeRegistered).toBe(true);
    });

    it('the ViewsRailPanel payload lands the viewport in the AUTHORITATIVE sheetStore (executed read-back)', async () => {
        const { bus } = bootBus();

        expect(sheetStore.get(SHEET_ID)?.viewports ?? []).toHaveLength(0);

        // Exactly the payload ViewsRailPanel.ts:909 dispatches.
        await bus.executeCommand('sheet.addViewport', {
            sheetId: SHEET_ID,
            viewportId: 'vp-probe-1',
            viewId: VIEW_ID,
            position: { x: 100, y: 100 },
            scale: 100,
            viewType: 'plan',
        });

        // The authoritative read — NOT the plugin DTO store, NOT `success === true`.
        const vps = sheetStore.get(SHEET_ID)?.viewports ?? [];
        expect(vps).toHaveLength(1);
        expect(vps[0]).toMatchObject({ id: 'vp-probe-1', viewId: VIEW_ID, position: { x: 100, y: 100 } });
    });

    it('a refused add (unknown sheet) leaves the authoritative store untouched', async () => {
        const { bus } = bootBus();

        await expect(
            bus.executeCommand('sheet.addViewport', {
                sheetId: 'sheet-does-not-exist',
                viewportId: 'vp-probe-2',
                viewId: VIEW_ID,
                position: { x: 0, y: 0 },
            }),
        ).rejects.toThrow();

        expect(sheetStore.get(SHEET_ID)?.viewports ?? []).toHaveLength(0);
    });
});
