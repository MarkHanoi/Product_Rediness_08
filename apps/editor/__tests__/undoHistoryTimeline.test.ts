// @vitest-environment happy-dom
//
// §UNDO-HISTORY-DROPDOWN (ADR-0340) — gate for the undo/redo history projection
// and the sequential jump (reading A).
//
// WHAT THIS SUITE IS FOR, AND WHAT IT DELIBERATELY DOES NOT CLAIM.
// It proves three things and names the fourth as unproven:
//   1. LABELLING is a TOTAL transform — every token shape in this repo produces a
//      readable sentence, and an unknown token still does. This is the property a
//      lookup table would NOT have, and it is why a table was rejected.
//   2. The MERGE mirrors `performUndo`'s routing: chronological across stacks,
//      dual-dispatch twins collapsed to ONE row, absence-is-not-membership.
//   3. The JUMP is N sequential `performUndo()` calls and STOPS at the first step
//      that did not revert, reporting `completed`, not `requested`.
//   4. NOT PROVEN HERE: that the projected order equals the order a real session
//      reverts in. That needs a browser with both stacks live; the module's own
//      header states the two divergence modes. See ISSUE-LOG L-1873.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildUndoTimeline,
  describeCommandToken,
  undoThrough,
  redoThrough,
} from '../src/engine/undo/undoHistoryTimeline.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

interface RingRow {
  index: number; commandType?: string; affectedStores: string[];
  timestamp?: number; gestureId?: string; opPaths: string[]; isUndone: boolean;
}
interface CmRow {
  index: number; id: string; type: string; label?: string; timestamp?: number;
  gestureId?: string; targetIds: string[]; structuralChildCount: number;
}

function installRingBuffer(rows: RingRow[]): void {
  (window as unknown as { runtime?: unknown }).runtime = {
    bus: { ringBuffer: { listEntries: () => rows } },
  };
}
function installCommandManager(undo: CmRow[], redo: CmRow[] = []): void {
  (globalThis as { commandManager?: unknown }).commandManager = {
    getUndoHistoryView: () => undo,
    getRedoHistoryView: () => redo,
  };
}
function clearStacks(): void {
  delete (window as unknown as { runtime?: unknown }).runtime;
  delete (globalThis as { commandManager?: unknown }).commandManager;
}

function ring(p: Partial<RingRow> & { index: number }): RingRow {
  return {
    affectedStores: ['wall'], opPaths: ['/w1/height'], isUndone: false, ...p,
  } as RingRow;
}
function cm(p: Partial<CmRow> & { index: number; type: string }): CmRow {
  return { id: `c${p.index}`, targetIds: [], structuralChildCount: 0, ...p } as CmRow;
}

beforeEach(() => { clearStacks(); });

// ── 1. Labelling is a TOTAL transform ───────────────────────────────────────

describe('describeCommandToken — the transform that replaced a lookup table', () => {
  it('reads a dotted bus verb as an English sentence, noun after the leading verb word', () => {
    // The whole point: `element.updateParameters` must NOT read
    // "Update parameters element", which is what appending the noun produces.
    expect(describeCommandToken('wall.create')).toBe('Create wall');
    expect(describeCommandToken('element.updateParameters')).toBe('Update element parameters');
    expect(describeCommandToken('door.setOffset')).toBe('Set door offset');
    expect(describeCommandToken('view.switch')).toBe('Switch view');
    expect(describeCommandToken('slab.updateDimensions')).toBe('Update slab dimensions');
  });

  it('reads a SCREAMING_SNAKE legacy CommandType — including the three the brief named', () => {
    // These three are verbatim from the lane brief: a dropdown showing
    // `UPDATE_VIEWPORT_SCALE` is not the feature that was asked for.
    expect(describeCommandToken('MOVE_VIEWPORT')).toBe('Move viewport');
    expect(describeCommandToken('UPDATE_VIEWPORT_SCALE')).toBe('Update viewport scale');
    expect(describeCommandToken('SET_VIEW_CROP')).toBe('Set view crop');
    expect(describeCommandToken('CREATE_WALL')).toBe('Create wall');
    expect(describeCommandToken('ADD_OPENING')).toBe('Add opening');
  });

  it('moves `batch` out of the noun so the row names a real thing', () => {
    expect(describeCommandToken('wall.batch.create')).toBe('Create wall (batch)');
  });

  it('is TOTAL — an unknown, never-before-seen token still produces a sentence', () => {
    // This is the property a lookup table does not have. A table degrades to the
    // raw enum for every command authored after it, and nothing fails.
    expect(describeCommandToken('quantum.entangleFoo')).toBe('Entangle quantum foo');
    expect(describeCommandToken('WHATEVER_COMES_NEXT')).toBe('Whatever comes next');
    expect(describeCommandToken('lowercasething')).toBe('Lowercasething');
  });

  it('never returns an empty string, for any degenerate input', () => {
    for (const bad of ['', '   ', '...', '___', undefined, null]) {
      expect(describeCommandToken(bad as string).length).toBeGreaterThan(0);
    }
  });
});

// ── 2. The merge ────────────────────────────────────────────────────────────

describe('buildUndoTimeline — the cross-stack projection', () => {
  it('returns empty rather than throwing when neither stack is present', () => {
    const t = buildUndoTimeline();
    expect(t.undo).toEqual([]);
    expect(t.redo).toEqual([]);
  });

  it('lists ring-buffer entries newest-first, so undo[0] is the next Ctrl+Z', () => {
    installRingBuffer([
      ring({ index: 0, commandType: 'wall.create', timestamp: 1000, opPaths: ['/w1/x'] }),
      ring({ index: 1, commandType: 'slab.create', timestamp: 2000, opPaths: ['/s1/x'] }),
    ]);
    const t = buildUndoTimeline();
    expect(t.undo.map(r => r.label)).toEqual(['Create slab', 'Create wall']);
    expect(t.undo[0]!.elementIds).toEqual(['s1']);
  });

  it('partitions the ring buffer by isUndone — undone entries become the REDO list', () => {
    installRingBuffer([
      ring({ index: 0, commandType: 'wall.create', timestamp: 1000, isUndone: false }),
      ring({ index: 1, commandType: 'slab.create', timestamp: 2000, isUndone: true }),
    ]);
    const t = buildUndoTimeline();
    expect(t.undo.map(r => r.label)).toEqual(['Create wall']);
    expect(t.redo.map(r => r.label)).toEqual(['Create slab']);
  });

  it('orders ACROSS the two stacks chronologically — the U-10 rule, newest first', () => {
    // The founder-reported shape: a commandManager-only hosted opening committed
    // AFTER a ring-buffer wall must appear ABOVE it, or the list disagrees with
    // what Ctrl+Z will actually do.
    installRingBuffer([ring({ index: 0, commandType: 'wall.create', timestamp: 1000, opPaths: ['/w1/x'] })]);
    installCommandManager([cm({ index: 0, type: 'ADD_OPENING', timestamp: 5000, targetIds: ['w1', 'd1'] })]);
    const t = buildUndoTimeline();
    expect(t.undo.map(r => r.label)).toEqual(['Add opening', 'Create wall']);
  });

  it('collapses a DUAL-DISPATCH TWIN into ONE row (U-8) — one action, one row', () => {
    // Same gestureId AND cmTargets ⊆ ringIds. Listing this twice would break the
    // "one row = one performUndo()" contract the jump depends on.
    installRingBuffer([ring({
      index: 0, commandType: 'wall.create', timestamp: 1000,
      gestureId: 'g-1', opPaths: ['/w1/x'],
    })]);
    installCommandManager([cm({
      index: 0, type: 'CREATE_WALL', timestamp: 1002, gestureId: 'g-1', targetIds: ['w1'],
    })]);
    const t = buildUndoTimeline();
    expect(t.undo).toHaveLength(1);
    expect(t.undo[0]!.stack).toBe('both');
  });

  it('ABSENCE IS NOT MEMBERSHIP — an unstamped legacy entry is never a twin', () => {
    // C03 §4.6 U-10's amendment: an entry with no gestureId is NEVER another
    // entry's twin. Getting this backwards is the direction that HIDES a real
    // user action from the list.
    installRingBuffer([ring({
      index: 0, commandType: 'wall.create', timestamp: 1000, gestureId: 'g-1', opPaths: ['/w1/x'],
    })]);
    installCommandManager([cm({ index: 0, type: 'CREATE_WALL', timestamp: 1002, targetIds: ['w1'] })]);
    const t = buildUndoTimeline();
    expect(t.undo).toHaveLength(2);
  });

  it('a DIFFERENT gesture touching the same element gets its own row (shape 1 of L-690)', () => {
    // Draw a wall in plan (ring only), then change its colour (legacy only). The
    // ids are identical; the gestures are not. Two actions, two rows.
    installRingBuffer([ring({
      index: 0, commandType: 'wall.create', timestamp: 1000, gestureId: 'g-1', opPaths: ['/w1/x'],
    })]);
    installCommandManager([cm({
      index: 0, type: 'SET_WALL_COLOR', timestamp: 4000, gestureId: 'g-2', targetIds: ['w1'],
    })]);
    const t = buildUndoTimeline();
    expect(t.undo.map(r => r.label)).toEqual(['Set wall color', 'Create wall']);
  });

  it('prefers an AUTHORED describe() over the derived label, and says which it used', () => {
    installCommandManager([cm({
      index: 0, type: 'UPDATE_WALL_HEIGHT', timestamp: 1, targetIds: ['w1'],
      label: 'Set wall height to 3.2 m',
    })]);
    const t = buildUndoTimeline();
    expect(t.undo[0]!.label).toBe('Set wall height to 3.2 m');
    expect(t.undo[0]!.labelAuthored).toBe(true);
  });

  it('marks a derived label as NOT authored, so the two are never confused', () => {
    installCommandManager([cm({ index: 0, type: 'UPDATE_WALL_HEIGHT', timestamp: 1, targetIds: ['w1'] })]);
    expect(buildUndoTimeline().undo[0]!.labelAuthored).toBe(false);
  });

  it('names structural cascades in the detail line instead of hiding them (§L-874)', () => {
    installCommandManager([cm({
      index: 0, type: 'MOVE_WALL', timestamp: 1, targetIds: ['w1'], structuralChildCount: 2,
    })]);
    expect(buildUndoTimeline().undo[0]!.detail).toContain('+2 related changes');
  });

  it('counts elements when a row touches more than one', () => {
    installRingBuffer([ring({
      index: 0, commandType: 'wall.batch.create', timestamp: 1,
      opPaths: ['/w1/x', '/w2/x', '/w3/x'],
    })]);
    expect(buildUndoTimeline().undo[0]!.detail).toContain('3 elements');
  });

  it('survives a stack that throws — the other stack still projects', () => {
    (window as unknown as { runtime?: unknown }).runtime = {
      bus: { ringBuffer: { listEntries: () => { throw new Error('boom'); } } },
    };
    installCommandManager([cm({ index: 0, type: 'CREATE_LEVEL', timestamp: 1, targetIds: ['l1'] })]);
    const t = buildUndoTimeline();
    expect(t.undo.map(r => r.label)).toEqual(['Create level']);
  });

  it('returns frozen rows — a UI cannot mutate undo state through the projection', () => {
    installCommandManager([cm({ index: 0, type: 'CREATE_WALL', timestamp: 1, targetIds: ['w1'] })]);
    const row = buildUndoTimeline().undo[0]!;
    expect(Object.isFrozen(row)).toBe(true);
    expect(Object.isFrozen(row.elementIds)).toBe(true);
  });
});

// ── 3. The jump (reading A) ─────────────────────────────────────────────────

describe('undoThrough / redoThrough — reading (A), sequential jump-back', () => {
  /** A ring buffer of N covered entries against a live store, driven for real
   *  through performUndo — no stubbing of the undo path itself. */
  function installLiveStack(n: number): { store: Map<string, unknown> } {
    const map = new Map<string, unknown>();
    for (let i = 0; i < n; i++) map.set(`w${i}`, { id: `w${i}` });
    (window as unknown as { wallStore?: unknown }).wallStore = {
      add(e: { id: string }) { map.set(e.id, e); },
      remove(id: string) { map.delete(id); },
      getById(id: string) { return map.get(id); },
      update(id: string, u: object) { const e = map.get(id); if (e) map.set(id, { ...(e as object), ...u }); },
      getAll() { return [...map.values()]; },
    };
    let cursor = n - 1;
    const entries = Array.from({ length: n }, (_, i) => ({
      forward: { ops: [{ op: 'add' as const, path: `/w${i}`, value: { id: `w${i}` } }] },
      inverse: { ops: [{ op: 'remove' as const, path: `/w${i}`, value: undefined }] },
      affectedStores: ['wall'],
      timestamp: 1000 + i,
      commandType: 'wall.create',
    }));
    (window as unknown as { runtime?: unknown }).runtime = {
      bus: {
        ringBuffer: {
          canUndo: () => cursor >= 0,
          canRedo: () => cursor < entries.length - 1,
          current: () => (cursor >= 0 ? entries[cursor] : null),
          peek: () => (cursor + 1 < entries.length ? entries[cursor + 1] : null),
          undoPatch: () => (cursor >= 0 ? entries[cursor--]!.inverse : null),
          redoPatch: () => (cursor + 1 < entries.length ? entries[++cursor]!.forward : null),
          listEntries: () => entries.map((e, i) => ({
            index: i, commandType: e.commandType, affectedStores: e.affectedStores,
            timestamp: e.timestamp, opPaths: e.forward.ops.map(o => o.path), isUndone: i > cursor,
          })),
        },
      },
    };
    return { store: map };
  }

  it('undoing row 0 is exactly ONE step', () => {
    const { store } = installLiveStack(3);
    const outcome = undoThrough(0);
    expect(outcome).toMatchObject({ direction: 'undo', requested: 1, completed: 1 });
    expect(store.size).toBe(2);
  });

  it('undoing row 4 undoes FIVE steps — rows 0..4, newest first (reading A)', () => {
    const { store } = installLiveStack(6);
    const outcome = undoThrough(4);
    expect(outcome.requested).toBe(5);
    expect(outcome.completed).toBe(5);
    expect(store.size).toBe(1);
    // The one that survives is the OLDEST — proving it undid the newest five,
    // which is what the highlighted range promised.
    expect([...store.keys()]).toEqual(['w0']);
  });

  it('REPORTS WHAT IT DID, not what it was asked — stops at the end of the stack', () => {
    const { store } = installLiveStack(2);
    const outcome = undoThrough(9);              // ask for 10, only 2 exist
    expect(outcome.requested).toBe(10);
    expect(outcome.completed).toBe(2);
    expect(outcome.stoppedBy).toBe('nothing-left');
    expect(store.size).toBe(0);
  });

  it('stops at a STRANDED entry rather than spinning, and names the reason', () => {
    // A ring entry whose store has no adapter (C03 §4.8) consumes no cursor and
    // reverts nothing. A loop that ignored the outcome would report N steps for
    // zero work — the exact failure≠emptiness shape this repo keeps closing.
    (window as unknown as { runtime?: unknown }).runtime = {
      bus: {
        ringBuffer: {
          canUndo: () => true,
          canRedo: () => false,
          current: () => ({ forward: { ops: [] }, inverse: { ops: [] }, affectedStores: ['section'] }),
          peek: () => null,
          undoPatch: () => null,
          redoPatch: () => null,
          listEntries: () => [],
        },
      },
    };
    const outcome = undoThrough(4);
    expect(outcome.completed).toBe(0);
    expect(outcome.stoppedBy).toBe('stranded');
    expect(outcome.reason).toContain('section');
  });

  it('redoThrough mirrors it — N forward steps, reporting completed', () => {
    const { store } = installLiveStack(4);
    undoThrough(3);
    expect(store.size).toBe(0);
    const outcome = redoThrough(2);
    expect(outcome).toMatchObject({ direction: 'redo', requested: 3, completed: 3 });
    expect(store.size).toBe(3);
  });

  it('a negative index is a no-op that says so, never a runaway loop', () => {
    installLiveStack(3);
    expect(undoThrough(-5)).toMatchObject({ requested: 0, completed: 0 });
  });

  it('goes through performUndo — never a second undo algorithm (P6 / C03 U-5)', async () => {
    // If a future edit reaches into the stores directly, this spy stops seeing
    // calls and the test fails. That is the whole assertion.
    const mod = await import('../src/engine/undo/performUndoRedo.js');
    const spy = vi.spyOn(mod, 'performUndo');
    installLiveStack(3);
    undoThrough(2);
    expect(spy).toHaveBeenCalledTimes(3);
    spy.mockRestore();
  });
});
