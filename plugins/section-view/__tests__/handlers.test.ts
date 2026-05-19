// Section handlers — per-handler validation + execution tests (W-09).

import { describe, expect, it } from 'vitest';
import type { HandlerContext } from '@pryzm/plugin-sdk';
import type { SectionsState } from '@pryzm/plugin-sdk';
import {
  CreateSectionHandler,
  DeleteSectionHandler,
  MoveSectionLineHandler,
  SetSectionDepthHandler,
  SetSectionMarkHandler,
  SetSectionScaleHandler,
} from '../src/handlers/index.js';

type Stores = Readonly<{ section: SectionsState } & Record<string, unknown>>;
function ctx(state: SectionsState): HandlerContext<Stores> {
  return { stores: { section: state } } as unknown as HandlerContext<Stores>;
}

const LINE = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, lookDepth: 5 };

describe('CreateSectionHandler', () => {
  it('accepts a minimal payload + assigns seq=0 + scale=50', () => {
    const h = new CreateSectionHandler();
    const c = ctx({});
    expect(h.canExecute(c, { line: LINE })).toEqual({ valid: true });
    const r = h.execute(c, { line: LINE });
    const id = Object.keys(r.nextStates!.section)[0]!;
    expect(r.nextStates!.section[id]?.scale).toBe(50);
    expect(r.nextStates!.section[id]?.seq).toBe(0);
    expect(r.nextStates!.section[id]?.line.lookDepth).toBe(5);
  });

  it('rejects a duplicate id', () => {
    const h = new CreateSectionHandler();
    const c = ctx({ 'sec-1': { id: 'sec-1', line: LINE, scale: 50, seq: 0 } });
    expect(h.canExecute(c, { id: 'sec-1', line: LINE })).toMatchObject({ valid: false });
  });

  it('rejects a non-finite line endpoint', () => {
    const h = new CreateSectionHandler();
    const bad = { a: { x: NaN, y: 0 }, b: { x: 10, y: 0 }, lookDepth: 5 };
    expect(h.canExecute(ctx({}), { line: bad })).toMatchObject({ valid: false });
  });

  it('rejects a negative lookDepth', () => {
    const h = new CreateSectionHandler();
    const bad = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, lookDepth: -1 };
    expect(h.canExecute(ctx({}), { line: bad })).toMatchObject({ valid: false });
  });

  it('appends after existing seq', () => {
    const h = new CreateSectionHandler();
    const c = ctx({
      a: { id: 'a', line: LINE, scale: 50, seq: 0 },
      b: { id: 'b', line: LINE, scale: 50, seq: 7 },
    });
    const r = h.execute(c, { line: LINE });
    const ids = Object.keys(r.nextStates!.section).filter((k) => k !== 'a' && k !== 'b');
    expect(r.nextStates!.section[ids[0]!]?.seq).toBe(8);
  });
});

describe('DeleteSectionHandler', () => {
  it('removes an existing section', () => {
    const h = new DeleteSectionHandler();
    const c = ctx({ s1: { id: 's1', line: LINE, scale: 50, seq: 0 } });
    expect(h.canExecute(c, { id: 's1' })).toEqual({ valid: true });
    const r = h.execute(c, { id: 's1' });
    expect(r.nextStates!.section).toEqual({});
  });

  it('rejects unknown id', () => {
    const h = new DeleteSectionHandler();
    expect(h.canExecute(ctx({}), { id: 'missing' })).toMatchObject({ valid: false });
  });
});

describe('MoveSectionLineHandler', () => {
  it('updates endpoints + preserves lookDepth', () => {
    const h = new MoveSectionLineHandler();
    const c = ctx({ s: { id: 's', line: LINE, scale: 50, seq: 0 } });
    const r = h.execute(c, { id: 's', a: { x: 1, y: 1 }, b: { x: 9, y: 9 } });
    expect(r.nextStates!.section.s?.line).toEqual({
      a: { x: 1, y: 1 },
      b: { x: 9, y: 9 },
      lookDepth: 5,
    });
  });

  it('rejects non-finite coordinates', () => {
    const h = new MoveSectionLineHandler();
    const c = ctx({ s: { id: 's', line: LINE, scale: 50, seq: 0 } });
    expect(h.canExecute(c, { id: 's', a: { x: 0, y: 0 }, b: { x: Infinity, y: 0 } }))
      .toMatchObject({ valid: false });
  });
});

describe('SetSectionDepthHandler', () => {
  it('updates lookDepth', () => {
    const h = new SetSectionDepthHandler();
    const c = ctx({ s: { id: 's', line: LINE, scale: 50, seq: 0 } });
    const r = h.execute(c, { id: 's', lookDepth: 12 });
    expect(r.nextStates!.section.s?.line.lookDepth).toBe(12);
  });

  it('rejects negative depth', () => {
    const h = new SetSectionDepthHandler();
    const c = ctx({ s: { id: 's', line: LINE, scale: 50, seq: 0 } });
    expect(h.canExecute(c, { id: 's', lookDepth: -3 })).toMatchObject({ valid: false });
  });
});

describe('SetSectionMarkHandler', () => {
  it('updates the mark', () => {
    const h = new SetSectionMarkHandler();
    const c = ctx({ s: { id: 's', line: LINE, scale: 50, seq: 0 } });
    const r = h.execute(c, { id: 's', mark: '1/A-201' });
    expect(r.nextStates!.section.s?.mark).toBe('1/A-201');
  });

  it('rejects empty mark', () => {
    const h = new SetSectionMarkHandler();
    const c = ctx({ s: { id: 's', line: LINE, scale: 50, seq: 0 } });
    expect(h.canExecute(c, { id: 's', mark: '' })).toMatchObject({ valid: false });
  });
});

describe('SetSectionScaleHandler', () => {
  it('updates scale', () => {
    const h = new SetSectionScaleHandler();
    const c = ctx({ s: { id: 's', line: LINE, scale: 50, seq: 0 } });
    const r = h.execute(c, { id: 's', scale: 100 });
    expect(r.nextStates!.section.s?.scale).toBe(100);
  });

  it('rejects zero/negative scale', () => {
    const h = new SetSectionScaleHandler();
    const c = ctx({ s: { id: 's', line: LINE, scale: 50, seq: 0 } });
    expect(h.canExecute(c, { id: 's', scale: 0 })).toMatchObject({ valid: false });
    expect(h.canExecute(c, { id: 's', scale: -1 })).toMatchObject({ valid: false });
  });
});
