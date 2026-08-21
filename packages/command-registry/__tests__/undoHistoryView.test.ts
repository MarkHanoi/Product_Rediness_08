// §UNDO-HISTORY-DROPDOWN (ADR-0341) — gate for `CommandManager.getUndoHistoryView()`
// / `getRedoHistoryView()` and the optional `Command.describe()` (C16 CA-22).
//
// WHY A SECOND ACCESSOR EXISTS ALONGSIDE `getHistory()`
// ----------------------------------------------------------------------------
// `getHistory()` returns a SHALLOW copy: a fresh array holding the LIVE `Command`
// instances. A caller that takes one can call `.execute(ctx)` / `.undo(ctx)` on
// it directly — out of band, with no dispatcher, no snapshot and no history
// bookkeeping. That is a mutation path into model state that bypasses the command
// dispatcher entirely (P6), handed to whoever asks. A history DROPDOWN is
// precisely "whoever asks", so it gets a frozen, scalar-only projection instead,
// and the no-route-back-to-a-Command property is asserted here rather than
// assumed.
//
// The other property this pins is the one the two-client harness measured:
// a COLLABORATOR'S EDIT MUST NEVER BE LISTED. The exclusion lives at the PUSH in
// `execute()` (C03 §4.6 U-1 / §UNDO-REMOTE-ORIGIN), not in the projection — so
// these tests drive `execute()` with remote metadata and assert the row never
// appears, rather than testing a filter that does not and should not exist.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandManager } from '../src/CommandManagerImpl';
import type { Command, CommandContext, CommandResult, CommandValidationResult } from '../src/types';

interface Rec { id: string }

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

function fakeCommand(
  type: string,
  targetIds: string[],
  extra: { describe?: () => string; timestamp?: number; nonUndoable?: boolean } = {},
): Command {
  return {
    id: `cmd_${type}_${targetIds.join('_')}`,
    type: type as Command['type'],
    timestamp: extra.timestamp ?? 4242,
    targetIds: [...targetIds],
    affectedStores: ['wall'],
    ...(extra.nonUndoable ? { nonUndoable: true } : {}),
    ...(extra.describe ? { describe: extra.describe } : {}),
    canExecute: (): CommandValidationResult => ({ ok: true }),
    execute: (): CommandResult => ({ success: true, affectedElementIds: targetIds }),
    undo: (): CommandResult => ({ success: true, affectedElementIds: targetIds }),
    serialize: () => ({ type, targetIds, timestamp: 0, version: 1, payload: {} }),
  } as unknown as Command;
}

describe('§UNDO-HISTORY-DROPDOWN — CommandManager history projection', () => {
  let wallStore: ReturnType<typeof makeStore>;
  let cm: CommandManager;

  beforeEach(() => {
    wallStore = makeStore();
    const ctx = {
      stores: { wallStore },
      bimManager: {
        getLevels: () => [], getLevelById: () => undefined,
        registerElement: () => {}, unregisterElement: () => {},
      },
    } as unknown as CommandContext;
    cm = new CommandManager(ctx);
  });

  it('is empty before anything happens', () => {
    expect(cm.getUndoHistoryView()).toEqual([]);
    expect(cm.getRedoHistoryView()).toEqual([]);
  });

  it('lists executed commands oldest-first with the fields a label needs', () => {
    wallStore.add({ id: 'W1' });
    cm.execute(fakeCommand('CREATE_WALL', ['W1'], { timestamp: 1000 }));
    cm.execute(fakeCommand('UPDATE_WALL_HEIGHT', ['W1'], { timestamp: 2000 }));
    const rows = cm.getUndoHistoryView();
    expect(rows.map(r => r.type)).toEqual(['CREATE_WALL', 'UPDATE_WALL_HEIGHT']);
    expect(rows[1]).toMatchObject({
      index: 1, timestamp: 2000, targetIds: ['W1'], source: 'HUMAN_DIRECT', structuralChildCount: 0,
    });
  });

  it('carries the gestureId when one was stamped, and omits it when not', () => {
    cm.execute(fakeCommand('CREATE_WALL', ['W1']), { source: 'HUMAN_DIRECT', gestureId: 'g-7' });
    cm.execute(fakeCommand('CREATE_SLAB', ['S1']));
    const rows = cm.getUndoHistoryView();
    expect(rows[0]!.gestureId).toBe('g-7');
    // Absence must stay absent — an invented id would make an unrelated entry
    // look like a dual-dispatch twin (C03 §4.6 U-10: absence is not membership).
    expect(rows[1]).not.toHaveProperty('gestureId');
  });

  it('NEVER hands back a Command — no execute/undo route out of the projection', () => {
    cm.execute(fakeCommand('CREATE_WALL', ['W1']));
    const row = cm.getUndoHistoryView()[0]! as unknown as Record<string, unknown>;
    expect(row['command']).toBeUndefined();
    expect(typeof row['execute']).toBe('undefined');
    expect(typeof row['undo']).toBe('undefined');
    // The contrast that motivates this accessor: getHistory() DOES hand one back.
    expect(typeof cm.getHistory()[0]!.command.undo).toBe('function');
  });

  it('returns frozen rows and frozen id arrays', () => {
    cm.execute(fakeCommand('CREATE_WALL', ['W1']));
    const rows = cm.getUndoHistoryView();
    expect(Object.isFrozen(rows)).toBe(true);
    expect(Object.isFrozen(rows[0])).toBe(true);
    expect(Object.isFrozen(rows[0]!.targetIds)).toBe(true);
  });

  it('the projected targetIds are a COPY — mutating them cannot reach the command', () => {
    const cmd = fakeCommand('CREATE_WALL', ['W1']);
    cm.execute(cmd);
    const ids = cm.getUndoHistoryView()[0]!.targetIds as string[];
    expect(() => { ids.push('HACKED'); }).toThrow();
    expect(cmd.targetIds).toEqual(['W1']);
  });

  it('NEVER lists a collaborator\'s edit — REMOTE is excluded at the push, not here', () => {
    cm.execute(fakeCommand('CREATE_WALL', ['W1']), { source: 'HUMAN_DIRECT' });
    cm.execute(fakeCommand('UPDATE_WALL_COLOR', ['W2']), { source: 'REMOTE' });
    expect(cm.getUndoHistoryView().map(r => r.type)).toEqual(['CREATE_WALL']);
  });

  it('NEVER lists an edit made inside a remote-origin dispatch (§UNDO-REMOTE-ORIGIN)', () => {
    // The CRDT read leg: a bridge dispatches with DEFAULT metadata while the
    // ambient remote flag is set. This is the exact shape that put a peer's edit
    // on this user's undo stack, and the dropdown must not resurrect it.
    const g = globalThis as unknown as { __pryzmRemoteOriginDispatch?: boolean };
    g.__pryzmRemoteOriginDispatch = true;
    try {
      cm.execute(fakeCommand('UPDATE_WALL_COLOR', ['W9']));
    } finally {
      g.__pryzmRemoteOriginDispatch = false;
    }
    expect(cm.getUndoHistoryView()).toEqual([]);
  });

  it('never lists a PROJECT_LOAD rehydration or a nonUndoable background command', () => {
    cm.execute(fakeCommand('CREATE_WALL', ['W1']), { source: 'PROJECT_LOAD' });
    cm.execute(fakeCommand('REDETECT_ROOMS', ['W1'], { nonUndoable: true }));
    expect(cm.getUndoHistoryView()).toEqual([]);
  });

  it('moves a row from undo to redo on undo(), and back on redo()', () => {
    cm.execute(fakeCommand('CREATE_WALL', ['W1']));
    cm.undo();
    expect(cm.getUndoHistoryView()).toEqual([]);
    expect(cm.getRedoHistoryView().map(r => r.type)).toEqual(['CREATE_WALL']);
    cm.redo();
    expect(cm.getUndoHistoryView().map(r => r.type)).toEqual(['CREATE_WALL']);
    expect(cm.getRedoHistoryView()).toEqual([]);
  });
});

describe('§UNDO-HISTORY-DROPDOWN — Command.describe() (C16 CA-22)', () => {
  let cm: CommandManager;
  beforeEach(() => {
    cm = new CommandManager({
      stores: { wallStore: makeStore() },
      bimManager: {
        getLevels: () => [], getLevelById: () => undefined,
        registerElement: () => {}, unregisterElement: () => {},
      },
    } as unknown as CommandContext);
  });

  it('surfaces an authored sentence as `label`', () => {
    cm.execute(fakeCommand('UPDATE_WALL_HEIGHT', ['W1'], { describe: () => 'Set wall height to 3.2 m' }));
    expect(cm.getUndoHistoryView()[0]!.label).toBe('Set wall height to 3.2 m');
  });

  it('OMITS `label` when the command authored none — never a manufactured sentence', () => {
    // The caller must be able to tell "the author wrote this" from "we derived
    // it". A fabricated label here would make the derivation invisible.
    cm.execute(fakeCommand('UPDATE_WALL_HEIGHT', ['W1']));
    expect(cm.getUndoHistoryView()[0]).not.toHaveProperty('label');
  });

  it('treats an EMPTY describe() as absent — a blank row reads as a missing one', () => {
    cm.execute(fakeCommand('UPDATE_WALL_HEIGHT', ['W1'], { describe: () => '   ' }));
    expect(cm.getUndoHistoryView()[0]).not.toHaveProperty('label');
  });

  it('a describe() that THROWS does not take the dropdown down with it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    cm.execute(fakeCommand('UPDATE_WALL_HEIGHT', ['W1'], {
      describe: () => { throw new Error('author bug'); },
    }));
    const rows = cm.getUndoHistoryView();
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('label');
    expect(rows[0]!.type).toBe('UPDATE_WALL_HEIGHT');
    warn.mockRestore();
  });
});
