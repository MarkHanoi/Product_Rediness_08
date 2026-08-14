// @vitest-environment happy-dom
//
// §FIX-ELEMENT-MARK-SHADOW (MT-03) — the selection plugin must NOT claim
// `element.updateMark`.
//
// ── THE RIVALRY, AND WHY THE BRIDGE WINS ────────────────────────────────────
//
// `element.updateMark` had TWO declaring sites and only one of them could ever
// register:
//
//   (1) `plugins/selection/src/handlers/UpdateElementMark.ts` — in
//       SELECTION_HANDLER_TYPES / buildSelectionHandlerSet(), which
//       PluginRegistry.ts contributes at composeRuntime() time, BEFORE
//       initBusHandlers runs.
//   (2) the §FIX-ELEMENT-MARK-UNHANDLED bridge in
//       `apps/editor/src/engine/initBusHandlers.ts:2041` — skipped by the
//       §OI-053 `runtime.bus.registry?.has?.(spec.type)` guard precisely
//       BECAUSE (1) got there first.
//
// That is the SHADOWED shape `check-verb-register` names. This file pays the
// verb, per the fc4de954 (`template.assignToNode`) precedent.
//
// The two arms are NOT equivalent, and the plugin arm is strictly worse:
//
//   · it wraps the dispatch in `catch (e) { console.error(...) }` and returns
//     `{ forward: [], inverse: [] }` — a FAILED mutation reported to the bus as
//     a clean success. C16 §5.1 CA-18 names that exact shape as PROHIBITED.
//   · if `window.commandManager` is absent it does nothing AT ALL and still
//     reports success — the same defect one level down, silently.
//   · it routes to `UpdateElementMarkCommand`, which writes `properties.mark`
//     for EVERY type. The bridge routes the ONE generic
//     `UpdateElementParameterCommand` and writes the TOP-LEVEL `mark` field —
//     the field the schedule reads (C28; PropertyPanel.ts:1035 "its mark is
//     EDITABLE and writes `element.mark` — and therefore the schedule") — with
//     the stair `properties.mark` mapping handled explicitly (StairData has no
//     top-level mark; the bridge's own §FIX-ELEMENT-MARK-UNHANDLED comment).
//     Under the plugin arm, a wall/slab/column/beam mark edit never reached the
//     schedule column.
//
// KNOWN DELTA, stated so nobody rediscovers it as a surprise: elements whose
// `properties.mark` was set by the OLD plugin path keep that value, and
// PropertyPanel's header read (`properties?.mark ?? mark`) prefers it over the
// bridge's top-level write. That read-precedence is pre-existing panel
// behaviour, not a regression introduced by handing the verb to the bridge.
//
// Authority DECLARED: the §FIX-ELEMENT-MARK-UNHANDLED bridge. The loser is
// DELETED, not commented (095cfa10 / 95ce7932 precedent). Deleting the plugin
// declaration does not delete the verb: every dispatch site
// (`ui/property-panel/PropertyPanel.ts:971`,
// `ui/property-inspector/PropertyInspectorApply.ts:139`) keeps dispatching the
// same `element.updateMark` payload, now answered by the bridge.
//
// This test is the pin. It failed before the deletion and passes after, and
// `check-verb-register`'s SHADOWED ratchet moves 8 → 7 in the same commit.

import { describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack, SelectionStore } from '@pryzm/plugin-sdk';
import { buildSelectionHandlerSet, SELECTION_HANDLER_TYPES } from '../../src/handlers/index.js';

describe('§FIX-ELEMENT-MARK-SHADOW — the selection plugin yields element.updateMark to the bridge', () => {
  it('SELECTION_HANDLER_TYPES does not declare element.updateMark', () => {
    expect(SELECTION_HANDLER_TYPES as readonly string[]).not.toContain('element.updateMark');
  });

  it('no handler in the built set answers to element.updateMark', () => {
    const types = buildSelectionHandlerSet().map((h) => h.type);
    expect(types).not.toContain('element.updateMark');
  });

  it('after registering the selection set on a real bus, the type is still FREE for the bridge to claim', () => {
    const selection = new SelectionStore();
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      emitter: new PatchEmitter(),
      undoStack: new UndoStack({ maxSize: 8 }),
      storesProvider: () => ({ selection }),
    });
    for (const h of buildSelectionHandlerSet()) bus.register(h as Parameters<CommandBus['register']>[0]);

    // The §OI-053 guard the bridge consults is exactly this reading. While the
    // plugin handler existed it read `true` and the bridge was skipped.
    expect(bus.registry?.has?.('element.updateMark' as never) ?? false).toBe(false);

    // Negative control — the guard is not vacuously false: a verb the selection
    // plugin DOES own reads `true` through the same call.
    expect(bus.registry?.has?.('selection.select' as never) ?? false).toBe(true);
  });
});
