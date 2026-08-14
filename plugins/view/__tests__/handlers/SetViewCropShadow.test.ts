// @vitest-environment happy-dom
//
// §FIX-VIEW-CROP-SHADOW (MT-03) — the view plugin must NOT declare
// `view.setCrop`.
//
// ── THE RIVALRY, AND WHY THE BRIDGE WINS ────────────────────────────────────
//
// `view.setCrop` had TWO declaring sites:
//
//   (1) `plugins/view/src/handlers/SetViewCrop.ts` — in this plugin's
//       ALL_HANDLERS, registered only by `registerViewHandlers()`;
//   (2) the §E.5.4 bridge in `apps/editor/src/engine/initBusHandlers.ts:2150`
//       — `_cmExec(new SetViewCropCommand(...))` against the authoritative
//       `@pryzm/core-app-model` viewDefinitionStore.
//
// ⚠ THE DIRECTION IS THE REVERSE OF THE stair/selection CASES, and the file
// header of the DELETED handler ("this handler is now the sole state-mutation
// path for view.setCrop") was FALSE at runtime. PluginRegistry's `view` entry
// contributes ONLY the five S17 handlers (Create/Delete/Rename/Switch/
// UpdateViewCamera — PluginRegistry.ts:466-472); the crop handler is NOT among
// them. `registerViewHandlers()` runs at engineLauncher.ts:605, AFTER
// `initBusHandlers(runtime)` at :451 — and it aborts on its FIRST duplicate
// (`bus.register` THROWS; `view.create` is already taken from composeRuntime),
// so the crop handler never registered on any production bus. The BRIDGE is
// the live arm — exactly as its sibling `view.updateDefinition` documents in
// initBusHandlers.ts:2124-2126, pinned by
// `apps/editor/__tests__/viewBusLifecycle.test.ts`.
//
// So the SHADOWED pair here was (live bridge, dead plugin handler), and the
// plugin arm additionally could not have run outside the editor: it reads
// `ctx.stores.view.getState()` — the ViewRegistry instance shape that the
// composed bus's storesProvider does not pass (the liveness ledger's
// `view.create` row fails on precisely that read).
//
// Authority DECLARED: the §E.5.4 bridge. The loser is DELETED, not commented
// (095cfa10 / 95ce7932 precedent). Every dispatch site
// (`ViewPropertiesPanel.ts:978`, `PlanViewInteraction.ts:1625`) keeps
// dispatching `view.setCrop`, answered — as it always really was — by the
// bridge.
//
// This test is the pin. It failed before the deletion and passes after, and
// `check-verb-register`'s SHADOWED ratchet shrinks by one in the same commit.

import { describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/plugin-sdk';
import { registerViewHandlers } from '../../src/handlers/index.js';

describe('§FIX-VIEW-CROP-SHADOW — the view plugin no longer declares view.setCrop', () => {
  it('registerViewHandlers does not register view.setCrop, leaving it FREE for the bridge', () => {
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      emitter: new PatchEmitter(),
      undoStack: new UndoStack({ maxSize: 8 }),
      storesProvider: () => ({ view: new Map() }),
    });
    const types = registerViewHandlers(bus);

    expect(types).not.toContain('view.setCrop');

    // The §OI-053 guard the bridge consults is exactly this reading. While the
    // plugin handler existed it read `true` on any bus this function reached.
    expect(bus.registry?.has?.('view.setCrop' as never) ?? false).toBe(false);

    // Negative control — the guard is not vacuously false: a verb this plugin
    // DOES register reads `true` through the same call.
    expect(bus.registry?.has?.('view.create' as never) ?? false).toBe(true);
  });
});
