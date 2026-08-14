// §FIX-TEMPLATE-ASSIGN-SHADOW (MT-03) — the rooms plugin must NOT claim
// `template.assignToNode`.
//
// ── THE RIVALRY, AND WHY THE BRIDGE WINS ────────────────────────────────────
//
// `template.assignToNode` had TWO declaring sites and only one of them could
// ever register:
//
//   (1) `plugins/rooms/src/handlers/AssignTemplateToNode.ts` — in
//       ROOM_HANDLER_TYPES, so `registerRoomHandlers()` claims the type during
//       composeRuntime, BEFORE initBusHandlers runs.
//   (2) the §E.5.7 bridge in `apps/editor/src/engine/initBusHandlers.ts:2352` —
//       which is skipped by the `runtime.bus.registry?.has?.(spec.type)` guard
//       at :2575 (§OI-053) precisely BECAUSE (1) got there first.
//
// That is the SHADOWED shape `check-verb-register` names: a live bridge was
// written, and boot order guarantees it never registers. Nine such verbs
// remained at HEAD; this file pays one of them, and it is the only one of the
// nine that lives in this plugin.
//
// The two are NOT two different things — `plugins/rooms/src/handlers/
// legacyCommands.ts` re-exports `AssignTemplateToNodeCommand` from
// `@pryzm/command-registry`, so BOTH sites construct the SAME command class.
// They differ only in ways that make the plugin handler strictly worse:
//
//   · it wraps the dispatch in `catch (e) { console.error(...) }` and then
//     returns `{ forward: [], inverse: [] }` — a failed mutation reported to
//     the bus as a clean success. C16 §5.1 CA-18 names that exact shape as
//     PROHIBITED, and §FIX-COMMAND-REJECTION-SURFACED (Gate G7 / C11 §5) is
//     the rule the bridge obeys and this handler did not.
//   · if `window.commandManager` is absent it does nothing AT ALL and still
//     reports success — a silent no-op, the same defect one level down.
//   · it drops the bridge's `assignedBy: 'user'` default, so an omitted field
//     reached the command as `undefined` instead.
//
// So the authority is DECLARED to be the bridge, and the loser is DELETED
// rather than commented — the `095cfa10` / `95ce7932` precedent. Deleting the
// plugin declaration does not delete the verb: it hands it to the arm that was
// written to own it, and every dispatch site
// (`ui/dataworkbench/DataSheetPanel.ts:298`, `ui/generative/BriefInputPanel.ts:399`)
// keeps dispatching the same `template.assignToNode` payload.
//
// This test is the pin. It failed before the deletion and passes after, and
// `check-verb-register`'s SHADOWED ratchet moves 9 → 8 in the same commit.

import { describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/plugin-sdk';
import { buildRoomHandlerSet, ROOM_HANDLER_TYPES } from '../src/handlers/index.js';

describe('§FIX-TEMPLATE-ASSIGN-SHADOW — the rooms plugin yields template.assignToNode to the bridge', () => {
  it('ROOM_HANDLER_TYPES does not declare template.assignToNode', () => {
    expect(ROOM_HANDLER_TYPES as readonly string[]).not.toContain('template.assignToNode');
  });

  it('no handler in the built set answers to template.assignToNode', () => {
    const types = buildRoomHandlerSet().map((h) => h.type);
    expect(types).not.toContain('template.assignToNode');
  });

  it('after registering the rooms set on a real bus, the type is still FREE for the bridge to claim', () => {
    const emitter = new PatchEmitter();
    const bus = new CommandBus({
      audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
      emitter,
      undoStack: new UndoStack({ maxSize: 8 }),
      storesProvider: () => ({}),
    });
    for (const h of buildRoomHandlerSet()) bus.register(h);

    // The §OI-053 guard the bridge consults is exactly this reading. While the
    // plugin handler existed it read `true` and the bridge was skipped.
    expect(bus.registry?.has?.('template.assignToNode' as never) ?? false).toBe(false);

    // Negative control — the guard is not vacuously false: a verb the rooms
    // plugin DOES own reads `true` through the same call.
    expect(bus.registry?.has?.('room.create' as never) ?? false).toBe(true);
  });
});
