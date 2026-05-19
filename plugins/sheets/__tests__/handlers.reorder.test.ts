// ReorderSheetHandler — coverage (S37 / ADR-0031).

import { describe, it, expect } from 'vitest';
import { ReorderSheetHandler } from '../src/handlers/ReorderSheet.js';
import { SheetNotFoundError } from '../src/errors.js';
import type { SheetData } from '@pryzm/plugin-sdk';
import type { SheetsState } from '@pryzm/plugin-sdk';

type Stores = Readonly<{ sheet: SheetsState }>;
const ctx = (s: SheetsState): { stores: Stores } => ({ stores: { sheet: s } });

function build(seqs: ReadonlyArray<readonly [string, number]>): SheetsState {
  const s: SheetsState = {};
  for (const [id, seq] of seqs) {
    s[id] = {
      id, name: id.toUpperCase(), number: `A-${String(seq + 1).padStart(3, '0')}`,
      size: 'A1', orientation: 'landscape', titleBlockId: 'tb',
      viewports: [], widgets: [], revision: '', issue: '', seq,
    } as SheetData;
  }
  return s;
}

function applyForward(state: SheetsState, patches: readonly { op: string; path: readonly (string | number)[]; value?: unknown }[]): SheetsState {
  // Simple synthetic apply for tests — the real Store applies via immer.
  const out: SheetsState = JSON.parse(JSON.stringify(state));
  for (const p of patches) {
    if (p.op === 'replace' && p.path.length === 2 && p.path[1] === 'seq') {
      const sheet = out[p.path[0] as string];
      if (sheet) (sheet as { seq: number }).seq = p.value as number;
    }
  }
  return out;
}

describe('ReorderSheetHandler.canExecute', () => {
  const h = new ReorderSheetHandler();

  it('rejects empty sheetId', () => {
    expect(h.canExecute(ctx({}) as never, { sheetId: '', newIndex: 0 }).valid).toBe(false);
  });
  it('rejects unknown sheet id', () => {
    expect(h.canExecute(ctx({}) as never, { sheetId: 'x', newIndex: 0 }).valid).toBe(false);
  });
  it('rejects out-of-range newIndex', () => {
    const state = build([['a', 0], ['b', 1]]);
    expect(h.canExecute(ctx(state) as never, { sheetId: 'a', newIndex: 2 }).valid).toBe(false);
    expect(h.canExecute(ctx(state) as never, { sheetId: 'a', newIndex: -1 }).valid).toBe(false);
    expect(h.canExecute(ctx(state) as never, { sheetId: 'a', newIndex: 1.5 }).valid).toBe(false);
  });
  it('accepts a valid in-range newIndex', () => {
    const state = build([['a', 0], ['b', 1], ['c', 2]]);
    expect(h.canExecute(ctx(state) as never, { sheetId: 'b', newIndex: 0 }).valid).toBe(true);
  });
});

describe('ReorderSheetHandler.execute', () => {
  const h = new ReorderSheetHandler();

  it('moves a sheet from end to start (a, b, c → c, a, b)', () => {
    const state = build([['a', 0], ['b', 1], ['c', 2]]);
    const r = h.execute(ctx(state) as never, { sheetId: 'c', newIndex: 0 });
    const next = applyForward(state, r.forward as never);
    const ordered = Object.values(next).sort((x, y) => x.seq - y.seq).map((s) => s.id);
    expect(ordered).toEqual(['c', 'a', 'b']);
  });

  it('moves a sheet from start to end (a, b, c → b, c, a)', () => {
    const state = build([['a', 0], ['b', 1], ['c', 2]]);
    const r = h.execute(ctx(state) as never, { sheetId: 'a', newIndex: 2 });
    const next = applyForward(state, r.forward as never);
    const ordered = Object.values(next).sort((x, y) => x.seq - y.seq).map((s) => s.id);
    expect(ordered).toEqual(['b', 'c', 'a']);
  });

  it('produces dense seqs (0..N-1) after reorder', () => {
    const state = build([['a', 0], ['b', 5], ['c', 10]]);
    const r = h.execute(ctx(state) as never, { sheetId: 'c', newIndex: 0 });
    const next = applyForward(state, r.forward as never);
    const seqs = Object.values(next).map((s) => s.seq).sort((x, y) => x - y);
    expect(seqs).toEqual([0, 1, 2]);
  });

  it('no-op when newIndex matches current position emits 0 patches', () => {
    const state = build([['a', 0], ['b', 1], ['c', 2]]);
    const r = h.execute(ctx(state) as never, { sheetId: 'b', newIndex: 1 });
    expect(r.forward.length).toBe(0);
  });

  it('throws SheetNotFoundError on missing id (defence-in-depth)', () => {
    expect(() => h.execute(ctx({}) as never, { sheetId: 'no', newIndex: 0 }))
      .toThrow(SheetNotFoundError);
  });

  it('inverse undoes the reorder', () => {
    const state = build([['a', 0], ['b', 1], ['c', 2]]);
    const r = h.execute(ctx(state) as never, { sheetId: 'a', newIndex: 2 });
    const after = applyForward(state, r.forward as never);
    const restored = applyForward(after, r.inverse as never);
    const ordered = Object.values(restored).sort((x, y) => x.seq - y.seq).map((s) => s.id);
    expect(ordered).toEqual(['a', 'b', 'c']);
  });
});
