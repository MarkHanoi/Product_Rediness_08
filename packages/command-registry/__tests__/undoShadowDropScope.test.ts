// §UNDO-SHADOW-DROP-SCOPE — G10 gate for `CommandManager.dropEntriesForTargets()`
// (C03 §4.6 U-8, the "one action ⇒ one undo" invariant).
//
// WHAT SHADOW-DROP IS FOR (U-8)
// ----------------------------------------------------------------------------
// The 8 legacy 3D tools DUAL-DISPATCH: they run `bus.executeCommand(...)` AND
// `commandManager.execute(new CreateXCommand(...))` for the SAME element, so one
// gesture lands in BOTH undo stacks. `performUndo()` reverts it via the ring
// buffer; the orphaned `CreateXCommand` left in `commandManager.history` would then
// eat a second Ctrl+Z as a no-op (the phantom-undo bug). So after a successful
// ring-buffer undo, `performUndo` calls `dropEntriesForTargets(idsJustReverted)`.
//
// THE DEFECT THIS PINS (found while closing G10)
// ----------------------------------------------------------------------------
// The predicate was `targetIds ⊆ idsJustReverted` over the WHOLE history — an
// element-identity match with no notion of WHICH gesture the entry belongs to. So
// it did not only drop the twin of the gesture just undone: it dropped EVERY
// entry, however old, that touched those ids. Undoing a bus-only FIELD edit on
// wall W (element still alive) therefore destroyed the user's earlier
// commandManager entries for W — e.g. a JoinTool / OffsetTool / property-panel
// edit (all still `commandManager.execute` sites) — which are then permanently
// un-undoable and un-redoable. Silent, unrecoverable history loss.
//
// THE INVARIANT (fix): shadow-drop is ORPHAN-SCOPED. An entry may only be dropped
// when every element it targets NO LONGER EXISTS in the stores — i.e. the
// ring-buffer undo really did remove it, so the entry's own `undo()` could only
// ever be a no-op. If the element is still alive, the entry is still a meaningful
// step in the user's timeline and MUST survive.

import { describe, it, expect, beforeEach } from 'vitest';
import { CommandManager } from '../src/CommandManagerImpl';
import type { Command, CommandContext, CommandResult, CommandValidationResult } from '../src/types';

interface Rec { id: string; height?: number }

function makeStore() {
  const map = new Map<string, Rec>();
  return {
    map,
    add(e: Rec) { map.set(e.id, e); },
    remove(id: string) { map.delete(id); },
    update(id: string, u: Partial<Rec>) { const e = map.get(id); if (e) map.set(id, { ...e, ...u }); },
    getById(id: string) { return map.get(id); },
    getAll() { return [...map.values()]; },
    clear() { map.clear(); },
  };
}

/** A stand-in for the legacy CreateXCommand / UpdateXCommand objects. */
function fakeCommand(type: string, targetIds: string[], onExecute?: () => void, onUndo?: () => void): Command {
  return {
    id: `cmd_${type}_${targetIds.join('_')}`,
    type: type as Command['type'],
    timestamp: Date.now(),
    targetIds,
    affectedStores: ['wall'],
    canExecute: (): CommandValidationResult => ({ ok: true }),
    execute: (): CommandResult => { onExecute?.(); return { success: true, affectedElementIds: targetIds }; },
    undo: (): CommandResult => { onUndo?.(); return { success: true, affectedElementIds: targetIds }; },
    serialize: () => ({ type, targetIds, timestamp: 0, version: 1, payload: {} }),
  } as unknown as Command;
}

describe('§UNDO-SHADOW-DROP-SCOPE — dropEntriesForTargets is ORPHAN-scoped (C03 §4.6 U-8)', () => {
  let wallStore: ReturnType<typeof makeStore>;
  let slabStore: ReturnType<typeof makeStore>;
  let cm: CommandManager;

  beforeEach(() => {
    wallStore = makeStore();
    slabStore = makeStore();
    const ctx = {
      stores: { wallStore, slabStore },
      bimManager: { getLevels: () => [], getLevelById: () => undefined, registerElement: () => {}, unregisterElement: () => {} },
    } as unknown as CommandContext;
    cm = new CommandManager(ctx);
  });

  it('drops the dual-dispatch twin when the ring-buffer undo REMOVED the element (no phantom Ctrl+Z)', () => {
    wallStore.add({ id: 'W1' });
    cm.execute(fakeCommand('CREATE_WALL', ['W1']));      // the 3D tool's twin
    expect(cm.canUndo()).toBe(true);

    // performUndo() has just reverted the create through the ring buffer: the
    // adapter removed the element from the mesh-driving store.
    wallStore.remove('W1');
    const dropped = cm.dropEntriesForTargets(['W1']);

    expect(dropped).toBe(1);
    expect(cm.canUndo()).toBe(false);                     // → one gesture, one keypress
  });

  it('REGRESSION: an earlier legacy-only entry on a STILL-LIVE element survives (no silent history loss)', () => {
    wallStore.add({ id: 'W1', height: 3 });
    cm.execute(fakeCommand('CREATE_WALL', ['W1']));       // 3D create — dual-dispatched
    cm.execute(fakeCommand('UPDATE_WALL_HEIGHT', ['W1'])); // property panel / JoinTool — commandManager ONLY
    wallStore.update('W1', { height: 4 });
    expect(cm.getHistory().length).toBe(2);

    // The user's next gesture is a BUS-only edit of the same wall. Ctrl+Z reverts
    // it through the ring buffer (a FIELD patch — the wall is NOT removed), then
    // shadow-drops. The wall is still alive, so NOTHING here is orphaned.
    const dropped = cm.dropEntriesForTargets(['W1']);

    expect(dropped).toBe(0);
    expect(cm.getHistory().length).toBe(2);               // both legacy steps still undoable
    expect(cm.canUndo()).toBe(true);
  });

  it('an entry whose targets live in ANOTHER store is not dropped either', () => {
    slabStore.add({ id: 'S1' });
    cm.execute(fakeCommand('CREATE_SLAB', ['S1']));

    expect(cm.dropEntriesForTargets(['S1'])).toBe(0);     // S1 still exists → not an orphan
    expect(cm.getHistory().length).toBe(1);

    slabStore.remove('S1');                                // now the ring buffer removed it
    expect(cm.dropEntriesForTargets(['S1'])).toBe(1);
  });

  it('a multi-target entry is preserved unless ALL of its targets were reverted (subset rule kept)', () => {
    cm.execute(fakeCommand('MOVE_MANY', ['A', 'B']));      // both already gone from the stores

    expect(cm.dropEntriesForTargets(['A'])).toBe(0);       // only A reverted → keep the entry
    expect(cm.getHistory().length).toBe(1);

    expect(cm.dropEntriesForTargets(['A', 'B'])).toBe(1);  // whole target set reverted → drop
  });

  it('entries with no declared targetIds are never dropped', () => {
    cm.execute(fakeCommand('SOME_GLOBAL_OP', []));
    expect(cm.dropEntriesForTargets(['W1'])).toBe(0);
    expect(cm.getHistory().length).toBe(1);
  });

  // ── §UNDO-NO-PHANTOM (C03 §4.6 U-3/U-4) — a REJECTED command leaves no trace ──
  //
  // The legacy mirror of the ring buffer's empty-patch rule (U-3,
  // `CommandBus.ts:354`): a command that never mutated anything must not occupy
  // an undo slot, or the user pays a keypress for a no-op. On Path A the
  // equivalents are a `canExecute` refusal and an `execute()` that returns
  // `success: false` after its snapshot was rolled back.

  it('a canExecute REJECTION pushes no history entry (no phantom Ctrl+Z)', () => {
    const rejecting = fakeCommand('CREATE_WALL', ['WX']);
    (rejecting as unknown as { canExecute: () => unknown }).canExecute =
      () => ({ ok: false, reason: 'no active level' });

    const result = cm.execute(rejecting);

    expect(result.success).toBe(false);
    expect(cm.canUndo()).toBe(false);
    expect(cm.getHistory().length).toBe(0);
  });

  it('an execute() that returns success:false pushes no history entry either', () => {
    const failing = fakeCommand('CREATE_WALL', ['WY']);
    (failing as unknown as { execute: () => unknown }).execute =
      () => ({ success: false, affectedElementIds: [], info: ['degenerate geometry'] });

    expect(cm.execute(failing).success).toBe(false);
    expect(cm.canUndo()).toBe(false);
  });

  it('a rejection does NOT clear a pending redo stack', () => {
    wallStore.add({ id: 'W7' });
    cm.execute(fakeCommand('CREATE_WALL', ['W7']));
    cm.undo();
    expect(cm.canRedo()).toBe(true);

    const rejecting = fakeCommand('CREATE_WALL', ['WZ']);
    (rejecting as unknown as { canExecute: () => unknown }).canExecute = () => ({ ok: false, reason: 'nope' });
    cm.execute(rejecting);

    expect(cm.canRedo()).toBe(true);   // a refused command is not a new branch
  });

  it('an orphaned entry is dropped from the REDO stack too (no phantom redo)', () => {
    wallStore.add({ id: 'W9' });
    cm.execute(fakeCommand('CREATE_WALL', ['W9']));
    cm.undo();                                             // → moves the entry to redoStack
    expect(cm.canRedo()).toBe(true);

    wallStore.remove('W9');                                // element gone (ring-buffer undo)
    expect(cm.dropEntriesForTargets(['W9'])).toBe(1);
    expect(cm.canRedo()).toBe(false);
  });
});
