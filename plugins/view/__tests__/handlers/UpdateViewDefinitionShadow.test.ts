// @vitest-environment happy-dom
//
// §FIX-VIEW-UPDATEDEF-SHADOW (MT-03) — the view plugin must NOT declare
// `view.updateDefinition`.
//
// ── THE RIVALRY, AND WHY THE BRIDGE WINS ────────────────────────────────────
//
// `view.updateDefinition` had TWO declaring sites:
//
//   (1) `plugins/view/src/handlers/UpdateViewDefinition.ts` — in this plugin's
//       ALL_HANDLERS, registered only by `registerViewHandlers()`;
//   (2) the §E.5.4 bridge in `apps/editor/src/engine/initBusHandlers.ts:2134`.
//
// ⚠ THE DIRECTION IS THE REVERSE OF THE stair/selection CASES, and here the
// repo had ALREADY ruled, in writing, which arm is authoritative: the bridge's
// own §FIX-VIEW-UPDATE-PAYLOAD-KEY comment (initBusHandlers.ts:2124-2126) —
// "This bridge, not plugins/view's UpdateViewDefinitionHandler, is the live
// handler: initBusHandlers runs BEFORE registerViewHandlers and the bus is
// first-registration-wins" — pinned by
// `apps/editor/__tests__/viewBusLifecycle.test.ts`. PluginRegistry's `view`
// entry contributes only the five S17 handlers, `registerViewHandlers()` runs
// at engineLauncher.ts:605 AFTER initBusHandlers at :451 and aborts on its
// first duplicate, so the plugin arm never registered on any production bus.
//
// The plugin arm is also FUNCTIONALLY the loser, not just the boot-order
// loser: it reads ONLY `cmd.patch`, while the bridge accepts
// `patch ?? updates` — and the §PERF-ELEV-CROP-DRAG-FLOW (L-222) scope-drag
// commit in PlanViewInteraction sends `updates`, an invariant viewBusLifecycle
// pins. Handing the verb to the plugin arm would silently break L-222.
//
// Authority DECLARED: the §E.5.4 bridge. The loser is DELETED, not commented
// (095cfa10 / 95ce7932 precedent). Every dispatch site
// (`ViewPropertiesPanel.ts:952/965/1039`, `PlanViewInteraction.ts:1446`,
// `ElevMark*` flows) keeps dispatching `view.updateDefinition`, answered — as
// it always really was — by the bridge.
//
// This test is the pin. It failed before the deletion and passes after, and
// `check-verb-register`'s SHADOWED ratchet shrinks by one in the same commit.

import { describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/plugin-sdk';
import { registerViewHandlers } from '../../src/handlers/index.js';

describe('§FIX-VIEW-UPDATEDEF-SHADOW — the view plugin no longer declares view.updateDefinition', () => {
  it('registerViewHandlers does not register view.updateDefinition, leaving it FREE for the bridge', () => {
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      emitter: new PatchEmitter(),
      undoStack: new UndoStack({ maxSize: 8 }),
      storesProvider: () => ({ view: new Map() }),
    });
    const types = registerViewHandlers(bus);

    expect(types).not.toContain('view.updateDefinition');

    // The §OI-053 guard the bridge consults is exactly this reading. While the
    // plugin handler existed it read `true` on any bus this function reached.
    expect(bus.registry?.has?.('view.updateDefinition' as never) ?? false).toBe(false);

    // Negative control — the guard is not vacuously false: a verb this plugin
    // DOES register reads `true` through the same call.
    expect(bus.registry?.has?.('view.create' as never) ?? false).toBe(true);
  });
});
