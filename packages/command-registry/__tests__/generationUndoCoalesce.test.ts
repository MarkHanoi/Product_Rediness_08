// §GEN-UNDO-COALESCE — L-376d / L-375d gate for the CommandManager generation
// undo batch (C16 §8.6 — "one gesture = one undo unit").
//
// A resi/office/house generation drives HUNDREDS of legacy
// `commandManager.execute(new CreateXCommand(...))` calls (stairs, lifts, slabs,
// floors, roofs, rooms…). Before this change each paid a `createSnapshot()`
// (`structuredClone` over its `affectedStores` — for stairs the growing slab
// store, an O(N·M) tail) AND a separate `history.push()` (hundreds of undo
// entries — L-376f). buildingGenerationLifecycle now brackets the whole
// generation in beginGenerationBatch()/endGenerationBatch(), so inside it:
//   • the per-command snapshot is SKIPPED (atomic generation, like PROJECT_LOAD),
//   • every command's execute() STILL runs per element (per-element side effects /
//     `*.created` events are byte-identical), and
//   • the whole set collapses to ONE CompositeCommand undo entry.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandManager } from '../src/CommandManagerImpl';
import { CompositeCommand } from '../src/composite/CompositeCommand';
import type { Command, CommandContext, CommandResult, CommandValidationResult } from '../src/types';

interface Rec { id: string }

function makeStore() {
  const map = new Map<string, Rec>();
  // Spy on getAll so we can observe whether createSnapshot() (which does
  // `structuredClone(wallStore.getAll())` for an affectedStores=['wall'] command)
  // ran for a given execute() — the snapshot cost we are eliminating.
  const getAll = vi.fn(() => [...map.values()]);
  return {
    map,
    add(e: Rec) { map.set(e.id, e); },
    remove(id: string) { map.delete(id); },
    getById(id: string) { return map.get(id); },
    getAll,
    clear() { map.clear(); },
  };
}

/** A stand-in for a legacy CreateXCommand: on execute() it adds its element to the
 *  store AND fires a per-element "created" notification (mirrors CreateStairCommand
 *  firing its DOM event in execute()); on undo() it removes it. */
function fakeCreate(id: string, store: ReturnType<typeof makeStore>, events: string[]): Command {
  return {
    id: `cmd_${id}`,
    type: 'CREATE_WALL' as Command['type'],
    timestamp: Date.now(),
    targetIds: [id],
    affectedStores: ['wall'],
    canExecute: (): CommandValidationResult => ({ ok: true }),
    execute: (): CommandResult => {
      store.add({ id });
      events.push(`created:${id}`);           // per-element event still fires
      return { success: true, affectedElementIds: [id] };
    },
    undo: (): CommandResult => {
      store.remove(id);
      return { success: true, affectedElementIds: [id] };
    },
    serialize: () => ({ type: 'CREATE_WALL', targetIds: [id], timestamp: 0, version: 1, payload: {} } as any),
  } as unknown as Command;
}

describe('§GEN-UNDO-COALESCE — CommandManager generation batch (L-376d / L-375d)', () => {
  let wallStore: ReturnType<typeof makeStore>;
  let cm: CommandManager;
  let events: string[];

  beforeEach(() => {
    wallStore = makeStore();
    events = [];
    const ctx = {
      stores: { wallStore },
      bimManager: { getLevels: () => [], getLevelById: () => undefined, registerElement: () => {}, unregisterElement: () => {} },
    } as unknown as CommandContext;
    cm = new CommandManager(ctx);
  });

  it('BASELINE (no batch): N creates → N snapshots + N undo entries', () => {
    cm.execute(fakeCreate('W1', wallStore, events));
    cm.execute(fakeCreate('W2', wallStore, events));
    cm.execute(fakeCreate('W3', wallStore, events));

    // Each execute took a scoped snapshot → wallStore.getAll() called ≥ once per command.
    expect(wallStore.getAll.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(cm.getHistory().length).toBe(3);                 // hundreds-of-entries world
  });

  it('BATCH: N creates → ZERO snapshots + ONE composite undo entry, but N per-element events', () => {
    cm.beginGenerationBatch();
    expect(cm.isGenerationBatchOpen).toBe(true);

    const snapshotCallsBefore = wallStore.getAll.mock.calls.length;
    cm.execute(fakeCreate('W1', wallStore, events));
    cm.execute(fakeCreate('W2', wallStore, events));
    cm.execute(fakeCreate('W3', wallStore, events));

    // (1) O(N·M) snapshot tail killed — no createSnapshot ran inside the batch.
    expect(wallStore.getAll.mock.calls.length).toBe(snapshotCallsBefore);
    // (2) per-element execute() STILL ran → N elements created + N events fired.
    expect(wallStore.getAll().map(w => w.id)).toEqual(['W1', 'W2', 'W3']);
    expect(events).toEqual(['created:W1', 'created:W2', 'created:W3']);
    // (3) nothing pushed yet — accumulated.
    expect(cm.getHistory().length).toBe(0);

    const coalesced = cm.endGenerationBatch();
    expect(coalesced).toBe(3);
    expect(cm.isGenerationBatchOpen).toBe(false);

    // (4) ONE undo unit for the whole generation.
    const history = cm.getHistory();
    expect(history.length).toBe(1);
    const entry = history[0]!.command;
    expect(entry).toBeInstanceOf(CompositeCommand);
    expect((entry as CompositeCommand).childCount).toBe(3);
  });

  it('ONE Ctrl+Z reverses the whole generation; redo replays it (children in order)', () => {
    cm.beginGenerationBatch();
    cm.execute(fakeCreate('W1', wallStore, events));
    cm.execute(fakeCreate('W2', wallStore, events));
    cm.execute(fakeCreate('W3', wallStore, events));
    cm.endGenerationBatch();

    expect(wallStore.getAll().length).toBe(3);
    expect(cm.canUndo()).toBe(true);

    // ONE undo removes ALL three (composite.undo reverses children in reverse order).
    cm.undo();
    expect(wallStore.getAll().length).toBe(0);
    expect(cm.canUndo()).toBe(false);
    expect(cm.canRedo()).toBe(true);

    // ONE redo re-creates all three.
    cm.redo();
    expect(wallStore.getAll().map(w => w.id)).toEqual(['W1', 'W2', 'W3']);
    expect(cm.canUndo()).toBe(true);
  });

  it('an empty generation batch flushes nothing (no phantom undo entry)', () => {
    cm.beginGenerationBatch();
    expect(cm.endGenerationBatch()).toBe(0);
    expect(cm.getHistory().length).toBe(0);
    expect(cm.canUndo()).toBe(false);
  });

  it('nonUndoable commands inside a batch run but are NOT coalesced', () => {
    cm.beginGenerationBatch();
    cm.execute(fakeCreate('W1', wallStore, events));
    // A background op (e.g. ReDetectRoomsCommand) — runs but must never enter the composite.
    const bg = fakeCreate('BG', wallStore, events);
    (bg as any).nonUndoable = true;
    cm.execute(bg);
    const coalesced = cm.endGenerationBatch();

    expect(coalesced).toBe(1);                              // only W1 coalesced
    const entry = cm.getHistory()[0]!.command as CompositeCommand;
    expect(entry.childCount).toBe(1);
    expect(entry.targetIds).toEqual(['W1']);
  });

  it('beginGenerationBatch is idempotent (generations do not nest)', () => {
    cm.beginGenerationBatch();
    cm.execute(fakeCreate('W1', wallStore, events));
    cm.beginGenerationBatch();                              // second begin — no-op, does not reset
    cm.execute(fakeCreate('W2', wallStore, events));
    expect(cm.endGenerationBatch()).toBe(2);               // both still in the one batch
  });
});
