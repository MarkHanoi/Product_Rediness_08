// §UNDO-HISTORY-DROPDOWN (ADR-0341) — DOM gate for the undo/redo caret + history
// popover on `SaveUndoRedoHUD`.
//
// WHAT THIS PINS. The founder asked for a caret beside undo/redo that lists what
// was done and lets him go back to a point in time. Three of those four things
// are structural and are asserted here:
//   • the CARET exists on BOTH controls and is a separate control from the button
//     (so a plain click still means one undo);
//   • the popover lists rows in PLAIN LANGUAGE, newest first;
//   • hovering row k marks rows 0..k — the visible statement that this is
//     SEQUENTIAL jump-back (reading A), not selective undo (reading B), together
//     with the header sentence that says so in words;
//   • clicking row k requests exactly k+1 steps.
//
// The fourth — that k+1 `performUndo()` calls revert the right k+1 things in a
// live session — is `undoHistoryTimeline.test.ts`'s job and, at the browser
// level, is UNPROVEN (ISSUE-LOG L-1883).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const undoThrough = vi.fn(() => ({ direction: 'undo' as const, requested: 1, completed: 1 }));
const redoThrough = vi.fn(() => ({ direction: 'redo' as const, requested: 1, completed: 1 }));
let timelineRows: { undo: unknown[]; redo: unknown[] } = { undo: [], redo: [] };

vi.mock('../../engine/undo/undoHistoryTimeline.js', () => ({
  buildUndoTimeline: () => timelineRows,
  undoThrough: (...a: unknown[]) => undoThrough(...(a as [])),
  redoThrough: (...a: unknown[]) => redoThrough(...(a as [])),
  describeCommandToken: (t: string) => t,
}));

import { SaveUndoRedoHUD } from '../SaveUndoRedoHUD';

function row(label: string, extra: Record<string, unknown> = {}): unknown {
  return {
    key: `k-${label}`, label, labelAuthored: false, rawType: label,
    elementIds: [], stack: 'ring-buffer', ...extra,
  };
}

let hud: SaveUndoRedoHUD;

beforeEach(() => {
  undoThrough.mockClear();
  redoThrough.mockClear();
  timelineRows = { undo: [], redo: [] };
  document.body.innerHTML = '';
});

afterEach(() => {
  hud?.dispose();
  document.body.innerHTML = '';
});

function mount(): HTMLElement {
  hud = new SaveUndoRedoHUD();
  document.body.appendChild(hud.element);
  return hud.element;
}
function caret(el: HTMLElement, dir: 'undo' | 'redo'): HTMLButtonElement {
  return el.querySelector(`[data-surh-caret="${dir}"]`) as HTMLButtonElement;
}
function rows(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll('.surh-row')] as HTMLElement[];
}

describe('SaveUndoRedoHUD — the caret', () => {
  it('renders a caret beside BOTH undo and redo', () => {
    const el = mount();
    expect(caret(el, 'undo')).toBeTruthy();
    expect(caret(el, 'redo')).toBeTruthy();
  });

  it('keeps the caret SEPARATE from the button, so a plain click is still one undo', () => {
    const el = mount();
    // Four icon buttons (save, undo, redo) + two carets — the carets must not BE
    // the undo/redo buttons, or the founder loses Ctrl+Z's mouse equivalent.
    expect(el.querySelectorAll('.surh-btn')).toHaveLength(3);
    expect(el.querySelectorAll('.surh-caret')).toHaveLength(2);
  });

  it('opens on click and closes on a second click (toggle)', () => {
    const el = mount();
    caret(el, 'undo').click();
    expect(el.querySelector('.surh-pop')).toBeTruthy();
    expect(caret(el, 'undo').getAttribute('aria-expanded')).toBe('true');
    caret(el, 'undo').click();
    expect(el.querySelector('.surh-pop')).toBeNull();
  });

  it('switching carets replaces the popover rather than stacking two', () => {
    const el = mount();
    caret(el, 'undo').click();
    caret(el, 'redo').click();
    expect(el.querySelectorAll('.surh-pop')).toHaveLength(1);
    expect(caret(el, 'undo').getAttribute('aria-expanded')).toBe('false');
    expect(caret(el, 'redo').getAttribute('aria-expanded')).toBe('true');
  });

  it('closes on Escape', () => {
    const el = mount();
    caret(el, 'undo').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(el.querySelector('.surh-pop')).toBeNull();
  });
});

describe('SaveUndoRedoHUD — the history list', () => {
  it('says there is nothing rather than showing an empty box', () => {
    const el = mount();
    caret(el, 'undo').click();
    expect(el.querySelector('.surh-pop-empty')?.textContent).toContain('Nothing to undo');
  });

  it('lists the rows in plain language, newest first, numbered', () => {
    timelineRows = { undo: [row('Create wall'), row('Move slab')], redo: [] };
    const el = mount();
    caret(el, 'undo').click();
    const labels = [...el.querySelectorAll('.surh-row-label')].map(n => n.textContent);
    expect(labels).toEqual(['Create wall', 'Move slab']);
    expect([...el.querySelectorAll('.surh-row-ord')].map(n => n.textContent)).toEqual(['1', '2']);
  });

  it('STATES that this is sequential jump-back, not selective undo, in words', () => {
    // The one assertion that keeps the product honest about (A) vs (B). If this
    // sentence is ever removed, the UI starts implying a capability that would
    // corrupt a model — see undoHistoryTimeline.ts's header for why (B) is unsound.
    timelineRows = { undo: [row('Create wall')], redo: [] };
    const el = mount();
    caret(el, 'undo').click();
    const note = el.querySelector('.surh-pop-note')?.textContent ?? '';
    expect(note).toContain('everything above it');
    expect(note).toContain('not supported');
  });

  it('hovering row k marks rows 0..k as in-scope — the visible (A) statement', () => {
    timelineRows = { undo: [row('a'), row('b'), row('c'), row('d')], redo: [] };
    const el = mount();
    caret(el, 'undo').click();
    const r = rows(el);
    r[2]!.dispatchEvent(new MouseEvent('mouseenter'));
    expect(r.map(x => x.classList.contains('is-in-scope'))).toEqual([true, true, true, false]);
    expect(r.map(x => x.classList.contains('is-target'))).toEqual([false, false, true, false]);
  });

  it('shows the element count and cascade count when the row carries them', () => {
    timelineRows = { undo: [row('Move wall', { detail: '3 elements · +2 related changes' })], redo: [] };
    const el = mount();
    caret(el, 'undo').click();
    expect(el.querySelector('.surh-row-detail')?.textContent).toContain('3 elements');
  });

  it('SAYS SO when the list is truncated — a silent cut implies the work is gone', () => {
    timelineRows = { undo: Array.from({ length: 47 }, (_, i) => row(`step ${i}`)), redo: [] };
    const el = mount();
    caret(el, 'undo').click();
    expect(rows(el)).toHaveLength(40);
    expect(el.querySelector('.surh-pop-foot')?.textContent).toContain('7 older steps not shown');
  });
});

describe('SaveUndoRedoHUD — the jump', () => {
  it('clicking row 0 asks for ONE step', () => {
    timelineRows = { undo: [row('a'), row('b'), row('c')], redo: [] };
    const el = mount();
    caret(el, 'undo').click();
    rows(el)[0]!.click();
    expect(undoThrough).toHaveBeenCalledWith(0);
  });

  it('clicking row 4 asks for FIVE steps — reading (A), not selective undo', () => {
    timelineRows = { undo: Array.from({ length: 6 }, (_, i) => row(`s${i}`)), redo: [] };
    const el = mount();
    caret(el, 'undo').click();
    rows(el)[4]!.click();
    expect(undoThrough).toHaveBeenCalledWith(4);
    expect(redoThrough).not.toHaveBeenCalled();
  });

  it('the redo caret routes to redoThrough, never to undoThrough', () => {
    timelineRows = { undo: [], redo: [row('a'), row('b')] };
    const el = mount();
    caret(el, 'redo').click();
    rows(el)[1]!.click();
    expect(redoThrough).toHaveBeenCalledWith(1);
    expect(undoThrough).not.toHaveBeenCalled();
  });

  it('closes the popover on jump so a stale list cannot be clicked twice', () => {
    timelineRows = { undo: [row('a'), row('b')], redo: [] };
    const el = mount();
    caret(el, 'undo').click();
    rows(el)[1]!.click();
    expect(el.querySelector('.surh-pop')).toBeNull();
  });

  it('a jump that throws does not take the toolbar down', () => {
    undoThrough.mockImplementationOnce(() => { throw new Error('boom'); });
    timelineRows = { undo: [row('a')], redo: [] };
    const el = mount();
    caret(el, 'undo').click();
    expect(() => rows(el)[0]!.click()).not.toThrow();
    expect(document.body.contains(el)).toBe(true);
  });
});
