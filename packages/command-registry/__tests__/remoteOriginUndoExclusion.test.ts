// §UNDO-REMOTE-ORIGIN + §UNDO-SCOPED-TO-AUTHORED-FIELDS — C03 §4.6 U-1 / §4.5-4.8.
//
// THE DEFECT THIS PINS. Measured 2026-08-12 by the two-client concurrency
// harness (tools/rac-conformance/certification), finding
// `undo/undo-did-not-revert-own`, with `undo/undo-reverted-peer-work` behind it:
//
//   Client A makes ONE edit (`wall.updateDimensions height=5`) and syncs with a
//   peer B that recoloured the SAME wall. A then presses Ctrl+Z on its OWN
//   gesture. Two separate bugs made that press wrong:
//
//   (1) REMOTE COMMANDS ON THE LOCAL UNDO STACK. The CRDT read-back sink
//       (initRemoteElementSync) dispatches `element.updateParameters` for a
//       PEER's change; the bridge calls `_cmExec(cmd)` with no metadata, so
//       `CommandMetadata.source` defaulted to 'HUMAN_DIRECT' and B's edits were
//       pushed onto A's history. A's history held THREE entries after ONE local
//       edit, so A's first Ctrl+Z was a no-op and its second reverted B's work.
//       C03 §4.6 U-1 already REQUIRED the exclusion; the CRDT leg never reached
//       it, while the socket.io leg (RemoteCommandDispatcher, which stamps
//       `{source:'REMOTE'}`) always did.
//
//   (2) WHOLE-RECORD UNDO. `UpdateWallDimensionsCommand.undo` restored the
//       ENTIRE pre-execute wall snapshot — ~12 fields, including a
//       `materialColor` the command never authored. So even with (1) fixed, A's
//       Ctrl+Z reverted B's colour as collateral.
//
// Both arms below carry a POSITIVE CONTROL that reproduces the PRE-FIX
// behaviour verbatim and asserts it STILL fails, so a green run cannot mean
// "this scenario never had a defect".

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommandManager } from '../src/CommandManagerImpl';
import type { Command, CommandContext, CommandResult, CommandValidationResult } from '../src/types';

const REMOTE_SLOT = '__pryzmRemoteOriginDispatch';
type RemoteHost = { [REMOTE_SLOT]?: boolean };

/** Mirrors `withRemoteOrigin` in @pryzm/command-bus (L1). This package is L2 and
 *  must not import it — the global slot IS the contract between them, exactly as
 *  `__pryzmBuildingGenActive` already is (CommandManagerImpl.ts §GEN-LOG-GATING). */
function withRemoteOrigin<T>(body: () => T): T {
  const host = globalThis as unknown as RemoteHost;
  const previous = host[REMOTE_SLOT];
  host[REMOTE_SLOT] = true;
  try { return body(); } finally { host[REMOTE_SLOT] = previous; }
}

// ─── A minimal wall store with the real WallStore's mutation shape ───────────
interface WallRec {
  id: string; height: number; thickness: number; materialColor: string;
}

function makeWallStore() {
  const walls = new Map<string, WallRec>();
  return {
    walls,
    add(w: WallRec) { walls.set(w.id, { ...w }); },
    getById(id: string) { const w = walls.get(id); return w ? { ...w } : undefined; },
    getAll: vi.fn(() => [...walls.values()].map(w => ({ ...w }))),
    /** WallStore.update(id, updates, preserveMetadata) — FIELD-SCOPED. */
    update(id: string, updates: Partial<WallRec>) {
      const cur = walls.get(id);
      if (!cur) return undefined;
      for (const [k, v] of Object.entries(updates)) {
        if (v !== undefined) (cur as Record<string, unknown>)[k] = v;
      }
      return { ...cur };
    },
    /** WallStore.restoreSnapshot(snapshot) — WHOLE-RECORD. The pre-fix path. */
    restoreSnapshot(snap: WallRec) { walls.set(snap.id, { ...snap }); },
  };
}

type Store = ReturnType<typeof makeWallStore>;

function makeCtx(wallStore: Store): CommandContext {
  return { stores: { wallStore }, bimManager: {}, projectContext: {} } as unknown as CommandContext;
}

/** A dimension command in the shape of the real one. `wholeRecordUndo` selects
 *  the PRE-FIX undo so the control can prove the old path still clobbers. */
class DimCommand implements Command {
  readonly affectedStores = ['wall'] as const;
  id = 'dim-' + Math.random().toString(36).slice(2);
  type = 'UPDATE_WALL_DIMENSIONS' as never;
  timestamp = Date.now();
  targetIds: string[];
  private prev: WallRec | null = null;

  constructor(
    private wallId: string,
    private height: number,
    private wholeRecordUndo = false,
  ) { this.targetIds = [wallId]; }

  canExecute(ctx: CommandContext): CommandValidationResult {
    return (ctx.stores as never as { wallStore: Store }).wallStore.getById(this.wallId)
      ? { ok: true } : { ok: false, reason: 'Wall not found' };
  }

  execute(ctx: CommandContext): CommandResult {
    const store = (ctx.stores as never as { wallStore: Store }).wallStore;
    const cur = store.getById(this.wallId);
    if (!cur) return { success: false, affectedElementIds: [] };
    this.prev = { ...cur };                 // whole-record snapshot, as the real one takes
    store.update(this.wallId, { height: this.height });
    return { success: true, affectedElementIds: [this.wallId] };
  }

  undo(ctx: CommandContext): CommandResult {
    if (!this.prev) return { success: false, affectedElementIds: [] };
    const store = (ctx.stores as never as { wallStore: Store }).wallStore;
    if (this.wholeRecordUndo) {
      store.restoreSnapshot(this.prev);     // PRE-FIX
    } else {
      store.update(this.wallId, {           // FIXED — only the authored field
        height: this.prev.height, thickness: this.prev.thickness,
      });
    }
    return { success: true, affectedElementIds: [this.wallId] };
  }

  serialize() { return { type: this.type, targetIds: this.targetIds, timestamp: this.timestamp, version: 1, payload: {} }; }
}

/** A colour command standing in for the PEER's edit arriving over the read leg. */
class ColorCommand implements Command {
  readonly affectedStores = ['wall'] as const;
  id = 'col-' + Math.random().toString(36).slice(2);
  type = 'UPDATE_ELEMENT_PARAMETER' as never;
  timestamp = Date.now();
  targetIds: string[];
  private prev = '';

  constructor(private wallId: string, private color: string) { this.targetIds = [wallId]; }
  canExecute(): CommandValidationResult { return { ok: true }; }
  execute(ctx: CommandContext): CommandResult {
    const store = (ctx.stores as never as { wallStore: Store }).wallStore;
    this.prev = store.getById(this.wallId)?.materialColor ?? '';
    store.update(this.wallId, { materialColor: this.color });
    return { success: true, affectedElementIds: [this.wallId] };
  }
  undo(ctx: CommandContext): CommandResult {
    (ctx.stores as never as { wallStore: Store }).wallStore
      .update(this.wallId, { materialColor: this.prev });
    return { success: true, affectedElementIds: [this.wallId] };
  }
  serialize() { return { type: this.type, targetIds: this.targetIds, timestamp: this.timestamp, version: 1, payload: {} }; }
}

describe('§UNDO-REMOTE-ORIGIN — a peer\'s edit never lands on the local undo stack', () => {
  let store: Store;
  let cm: CommandManager;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    store = makeWallStore();
    store.add({ id: 'w1', height: 3, thickness: 0.2, materialColor: '#aabbcc' });
    cm = new CommandManager(makeCtx(store));
  });

  afterEach(() => {
    delete (globalThis as unknown as RemoteHost)[REMOTE_SLOT];
    vi.restoreAllMocks();
  });

  it('excludes a command executed inside a REMOTE-originated dispatch', () => {
    cm.execute(new DimCommand('w1', 5));                                  // A's own
    withRemoteOrigin(() => { cm.execute(new ColorCommand('w1', '#c0ffee')); }); // B's

    expect(store.getById('w1')!.height).toBe(5);
    expect(store.getById('w1')!.materialColor).toBe('#c0ffee');

    // ONE entry — A's own gesture. B's edit applied to the store but is not undoable here.
    const history = cm.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.command.type).toBe('UPDATE_WALL_DIMENSIONS');
  });

  it("A's FIRST Ctrl+Z reverts A's OWN gesture and leaves the peer's work intact", () => {
    cm.execute(new DimCommand('w1', 5));
    withRemoteOrigin(() => { cm.execute(new ColorCommand('w1', '#c0ffee')); });

    cm.undo();

    // `undo-did-not-revert-own` — A's own edit IS reverted, on the first press.
    expect(store.getById('w1')!.height).toBe(3);
    // `undo-reverted-peer-work` — B's colour SURVIVES. The regression guard.
    expect(store.getById('w1')!.materialColor).toBe('#c0ffee');
  });

  it('POSITIVE CONTROL — the pre-fix path (no remote marking) still fails', () => {
    cm.execute(new DimCommand('w1', 5));
    // Exactly the old behaviour: the peer's command executed WITHOUT the remote
    // marking, i.e. what `_cmExec`'s default `{source:'HUMAN_DIRECT'}` produced.
    cm.execute(new ColorCommand('w1', '#c0ffee'));

    expect(cm.getHistory()).toHaveLength(2);   // the phantom entry is back

    cm.undo();                                  // A's first Ctrl+Z…
    expect(store.getById('w1')!.height).toBe(5);           // …did NOT revert A's own edit
    expect(store.getById('w1')!.materialColor).toBe('#aabbcc'); // …and DID revert B's work
  });

  it('an explicit {source:"REMOTE"} is still excluded — the original rule is intact', () => {
    cm.execute(new ColorCommand('w1', '#c0ffee'), { source: 'REMOTE' });
    expect(cm.getHistory()).toHaveLength(0);
    expect(store.getById('w1')!.materialColor).toBe('#c0ffee');
  });

  it('LOCAL edits are unaffected — the flag does not leak past the scope', () => {
    withRemoteOrigin(() => { cm.execute(new ColorCommand('w1', '#c0ffee')); });
    cm.execute(new DimCommand('w1', 5));         // local, AFTER the remote scope closed
    expect(cm.getHistory()).toHaveLength(1);
    cm.undo();
    expect(store.getById('w1')!.height).toBe(3);
  });

  it('a THROW inside the remote scope cannot leave the flag stuck ON', () => {
    expect(() => withRemoteOrigin(() => { throw new Error('boom'); })).toThrow('boom');
    cm.execute(new DimCommand('w1', 5));
    expect(cm.getHistory()).toHaveLength(1);     // still undoable — no silent loss
  });
});

describe('§UNDO-SCOPED-TO-AUTHORED-FIELDS — undo reverts only what the command authored', () => {
  let store: Store;
  let cm: CommandManager;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    store = makeWallStore();
    store.add({ id: 'w1', height: 3, thickness: 0.2, materialColor: '#aabbcc' });
    cm = new CommandManager(makeCtx(store));
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('a later colour change survives an undo of the earlier dimension change', () => {
    cm.execute(new DimCommand('w1', 5));                 // snapshot carries '#aabbcc'
    withRemoteOrigin(() => { cm.execute(new ColorCommand('w1', '#c0ffee')); });
    cm.undo();
    expect(store.getById('w1')!.height).toBe(3);
    expect(store.getById('w1')!.materialColor).toBe('#c0ffee');
  });

  it('POSITIVE CONTROL — the whole-record restoreSnapshot undo still clobbers', () => {
    cm.execute(new DimCommand('w1', 5, /* wholeRecordUndo */ true));
    withRemoteOrigin(() => { cm.execute(new ColorCommand('w1', '#c0ffee')); });
    cm.undo();
    expect(store.getById('w1')!.height).toBe(3);
    expect(store.getById('w1')!.materialColor).toBe('#aabbcc');  // the defect, reproduced
  });

  it('SINGLE-USER — the clobber was never collaboration-specific', () => {
    // No remote scope anywhere: a plain local colour edit after a dimension edit.
    cm.execute(new DimCommand('w1', 5));
    cm.execute(new ColorCommand('w1', '#ff0000'));
    cm.undo();                                   // undo the colour — its own entry
    expect(store.getById('w1')!.materialColor).toBe('#aabbcc');
    cm.undo();                                   // undo the dimension
    expect(store.getById('w1')!.height).toBe(3);
  });
});
