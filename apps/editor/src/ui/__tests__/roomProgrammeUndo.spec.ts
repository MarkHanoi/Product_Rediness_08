/**
 * §ROOM-BRIEF-UNDO (L-13120) — TAKING BACK A GESTURE ON THE ROOM PROGRAMME.
 *
 * Subjects:  apps/editor/src/ui/room-programme/roomProgrammeModel.ts   (the history)
 *            apps/editor/src/ui/room-programme/roomProgrammePanel.ts   (who presses it)
 * Strategy:  STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §9 · §25.5
 * Contracts: C114 §6a (ONE undo entry for ONE gesture) · C52 §3 (session override → re-run) ·
 *            C83 §1.2 (a control states what it will do, with its subject named) ·
 *            C84 EI-8a (one choke point, not a discipline kept at fourteen call sites) ·
 *            C03 §4.6 (there is ONE undo path per subject, and it is named)
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ⭐ WHAT WAS WRONG, AND WHY IT IS WORTH A FILE
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * L-13120 shipped the third plan gesture (draw a room) and recorded two limits honestly. The
 * first was this: *"Ctrl+Z doesn't take a drawn room back and the panel says so."* Undo is a user
 * EXPECTATION, not a feature — and an un-undoable gesture sitting beside undoable ones (placing
 * envelopes IS a bus command) is worse than either, because the user cannot predict which of his
 * actions are reversible, so he stops using the ones he is unsure about.
 *
 * ⛔ IT WAS NOT A P6 BREACH, AND SAYING SO PRECISELY IS HALF THE FIX. Two facts had been run
 * together as one:
 *   1. the brief is NOT a bus command — a DECISION (`roomProgrammeModel.ts` argues it in full;
 *      the blessed precedent is the `activeRoom*Overrides` family, C52 §3), and it stands;
 *   2. the brief kept NO HISTORY — `applyRoomProgrammeIntent` overwrote the state and dropped
 *      the old value, so even a panel-local Ctrl+Z had nothing to restore. That was the DEFECT.
 * Fixing (2) does not touch (1): the history is a second stack for a second subject, which is
 * why most of the DOM half below is about WHICH stack a keypress means.
 *
 * ── THE SPLIT BETWEEN THE TWO HALVES, STATED ────────────────────────────────────────────────
 * The HISTORY is proven against the module stash, where every state is one this file made. The
 * DOM half proves the WIRING — that the controls exist, that a real keypress reaches the history
 * only when it should, and that the panel's sentences match what the buttons do. Proving the
 * history through the DOM would make the expectations a restatement of the implementation
 * (§FAKE-MORE-CAPABLE-THAN-REAL).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  ROOM_DRAW_TOGGLE_TESTID,
  ROOM_PROGRAMME_LOAD_BTN_TESTID,
  ROOM_PROGRAMME_PLACE_BTN_TESTID,
  ROOM_PROGRAMME_PREVIEW_TESTID,
  ROOM_PROGRAMME_REDO_TESTID,
  ROOM_PROGRAMME_STATUS_TESTID,
  ROOM_PROGRAMME_UNDO_TESTID,
  mountRoomProgrammePanel,
  type RoomProgrammePanelDeps,
} from '../room-programme/roomProgrammePanel';
import {
  EMPTY_ROOM_PROGRAMME,
  ROOM_PROGRAMME_HISTORY_LIMIT,
  applyRoomProgrammeIntent,
  clearRoomProgramme,
  describeProgrammeIntent,
  getRoomProgramme,
  peekRoomProgrammeRedo,
  peekRoomProgrammeUndo,
  redoRoomProgramme,
  reduceRoomProgramme,
  roomProgrammeHistoryDepth,
  undoRoomProgramme,
} from '../room-programme/roomProgrammeModel';
import type { ProjectRoomLike } from '../room-programme/projectRoomsToProgramme';
import type { SpaceEnvelopeRecordLike } from '../room-programme/roomEnvelopePlan';

// ═════════════════════════════════════════════════════════════════════════════
// THE FIXTURE — the 24 × 10 m plate the three sibling gesture specs use
// ═════════════════════════════════════════════════════════════════════════════

const PLATE = [
  { x: 0, y: 0, z: 0 },
  { x: 24, y: 0, z: 0 },
  { x: 24, y: 0, z: 10 },
  { x: 0, y: 0, z: 10 },
];

const LEVEL_REC: SpaceEnvelopeRecordLike = {
  id: 'lvl-env-1',
  role: 'level',
  levelId: 'L0',
  name: 'Ground floor envelope',
  baseOffset: 0,
  height: 3,
  withinId: null,
  footprint: PLATE,
};

const ROOMS: ReadonlyArray<readonly [string, string, number]> = [
  ['living', 'living', 40],
  ['kitchen', 'kitchen', 30],
  ['bed', 'bedroom', 25],
  ['bath', 'bathroom', 12],
];

function seedProgramme(): void {
  for (const [id, kind, area] of ROOMS) {
    applyRoomProgrammeIntent({ type: 'programme.add-room', id, kind: kind as never, name: id });
    applyRoomProgrammeIntent({ type: 'programme.set-area', id, targetAreaM2: area });
  }
  applyRoomProgrammeIntent({ type: 'programme.link', aId: 'living', bId: 'kitchen' });
}

/** A clean stash AND a clean history — `clearRoomProgramme` is asserted to do both below. */
beforeEach(() => {
  clearRoomProgramme();
  applyRoomProgrammeIntent({ type: 'programme.reset', next: EMPTY_ROOM_PROGRAMME });
  clearRoomProgramme();
});

// ═════════════════════════════════════════════════════════════════════════════
// THE HISTORY — one gesture, one step
// ═════════════════════════════════════════════════════════════════════════════

describe('§ROOM-BRIEF-UNDO — one gesture is one step, and the step restores the state', () => {
  it('⭐ ONE drawn room is ONE step, and undo takes exactly that room back out (C114 §6a)', () => {
    seedProgramme();
    const before = getRoomProgramme();
    const depth0 = roomProgrammeHistoryDepth().past;

    applyRoomProgrammeIntent({
      type: 'programme.draw-room', id: 'drawn', kind: 'office' as never, targetAreaM2: 20,
    });
    expect(getRoomProgramme().entries.map((e) => e.id)).toContain('drawn');
    // ⛔ ONE step for one gesture. Three would mean three Ctrl+Z presses for one rectangle, which
    // is the defect `programme.draw-room` exists to prevent, arriving through the undo stack.
    expect(roomProgrammeHistoryDepth().past).toBe(depth0 + 1);

    const out = undoRoomProgramme();
    expect(out.ok).toBe(true);
    // ⭐ THE STATE IS RESTORED, NOT RE-DERIVED — referential identity, which is the strongest
    // available statement that nothing about the other four rooms was recomputed.
    expect(getRoomProgramme()).toBe(before);
    expect(roomProgrammeHistoryDepth()).toEqual({ past: depth0, future: 1 });
  });

  it('redo puts it back, and the two stacks trade one step each way', () => {
    seedProgramme();
    applyRoomProgrammeIntent({
      type: 'programme.draw-room', id: 'drawn', kind: 'office' as never, targetAreaM2: 20,
    });
    const after = getRoomProgramme();
    undoRoomProgramme();
    expect(getRoomProgramme().entries.map((e) => e.id)).not.toContain('drawn');
    const r = redoRoomProgramme();
    expect(r.ok).toBe(true);
    expect(getRoomProgramme()).toBe(after);
    expect(roomProgrammeHistoryDepth().future).toBe(0);
  });

  it('⭐ ONE wall drag is ONE step, and undo restores BOTH areas together', () => {
    seedProgramme();
    applyRoomProgrammeIntent({
      type: 'programme.resize-pair', aId: 'living', aAreaM2: 45, bId: 'kitchen', bAreaM2: 25,
    });
    const areaOf = (id: string): number =>
      getRoomProgramme().entries.find((e) => e.id === id)!.targetAreaM2;
    expect(areaOf('living')).toBe(45);
    undoRoomProgramme();
    // ⛔ CONSERVATION SURVIVES THE UNDO. A per-room undo would have restored one side and left
    // the other, which is a plate that never existed and a total the user never asked for.
    expect(areaOf('living')).toBe(40);
    expect(areaOf('kitchen')).toBe(30);
  });

  it('⛔ a REFUSED intent is not a step — the next undo still takes back the last real gesture', () => {
    seedProgramme();
    const depth = roomProgrammeHistoryDepth().past;
    // The reducer refuses this outright (a wall move must conserve area), returning the state
    // referentially unchanged.
    const changed = applyRoomProgrammeIntent({
      type: 'programme.resize-pair', aId: 'living', aAreaM2: 400, bId: 'kitchen', bAreaM2: 400,
    });
    expect(changed).toBe(false);
    expect(roomProgrammeHistoryDepth().past).toBe(depth);
    // ⛔ AND THE UNDO STILL MEANS WHAT IT SAID. A refused gesture that consumed a step would make
    // the next Ctrl+Z take back a gesture the user thought was two presses away.
    expect(peekRoomProgrammeUndo()).toContain('linking');
  });

  it('a new edit drops the redo branch — a redo can never re-apply a state from a dead branch', () => {
    seedProgramme();
    applyRoomProgrammeIntent({ type: 'programme.add-room', id: 'x', kind: 'office' as never });
    undoRoomProgramme();
    expect(roomProgrammeHistoryDepth().future).toBe(1);
    applyRoomProgrammeIntent({ type: 'programme.add-room', id: 'y', kind: 'office' as never });
    expect(roomProgrammeHistoryDepth().future).toBe(0);
    expect(peekRoomProgrammeRedo()).toBeNull();
  });

  it('⛔ `undoable: false` is INVISIBLE to the history — a change nobody asked for is not a step', () => {
    seedProgramme();
    const top = peekRoomProgrammeUndo();
    const depth = roomProgrammeHistoryDepth().past;
    // The one production caller is the panel's automatic mount-time load of the project's rooms.
    applyRoomProgrammeIntent(
      { type: 'programme.reset', next: EMPTY_ROOM_PROGRAMME }, { undoable: false });
    expect(getRoomProgramme().entries).toHaveLength(0);
    expect(roomProgrammeHistoryDepth().past).toBe(depth);
    // ⭐ THE STEPS UNDERNEATH SURVIVE, rather than being cleared. The user's own gestures are
    // still his to take back; the automatic change simply is not one of them.
    expect(peekRoomProgrammeUndo()).toBe(top);
  });

  it('the history is bounded, and it drops the OLDEST step', () => {
    seedProgramme();
    for (let i = 0; i < ROOM_PROGRAMME_HISTORY_LIMIT + 5; i += 1) {
      applyRoomProgrammeIntent({
        type: 'programme.set-area', id: 'living', targetAreaM2: 40 + (i % 7) + i / 1000,
      });
    }
    expect(roomProgrammeHistoryDepth().past).toBe(ROOM_PROGRAMME_HISTORY_LIMIT);
    // Undoing every remembered step still lands on a real state, never on `undefined`.
    for (let i = 0; i < ROOM_PROGRAMME_HISTORY_LIMIT; i += 1) undoRoomProgramme();
    expect(undoRoomProgramme()).toEqual({ ok: false, label: null });
    expect(getRoomProgramme().entries).toHaveLength(ROOMS.length);
  });

  it('⛔ a project switch DROPS the history — an undo may not reach across it', () => {
    seedProgramme();
    expect(roomProgrammeHistoryDepth().past).toBeGreaterThan(0);
    clearRoomProgramme();
    // ⛔ Undoing across a project switch would restore ANOTHER project's brief onto this plate:
    // rooms measured against a footprint that is no longer on screen.
    expect(roomProgrammeHistoryDepth()).toEqual({ past: 0, future: 0 });
    expect(peekRoomProgrammeUndo()).toBeNull();
  });

  it('an empty history refuses without changing anything, and says so in the value', () => {
    seedProgramme();
    while (roomProgrammeHistoryDepth().past > 0) undoRoomProgramme();
    const state = getRoomProgramme();
    expect(undoRoomProgramme()).toEqual({ ok: false, label: null });
    expect(getRoomProgramme()).toBe(state);
  });
});

describe('§ROOM-BRIEF-UNDO — the step NAMES the gesture it will take back', () => {
  /** Every intent that can change the brief, and the words the control offers for it. */
  const cases: ReadonlyArray<readonly [string, Parameters<typeof describeProgrammeIntent>[2], string]> = [
    ['add', { type: 'programme.add-room', id: 'n1', kind: 'office' as never, name: 'Study' }, 'adding Study'],
    ['draw', { type: 'programme.draw-room', id: 'n2', kind: 'office' as never, name: 'Studio', targetAreaM2: 20 }, 'the Studio you drew'],
    ['remove', { type: 'programme.remove-room', id: 'bath' }, 'removing bath'],
    ['rename', { type: 'programme.rename-room', id: 'bath', name: 'Shower room' }, 'renaming bath to Shower room'],
    ['set-area', { type: 'programme.set-area', id: 'bath', targetAreaM2: 9 }, 'resizing bath to 9.00 m²'],
    ['link', { type: 'programme.link', aId: 'bed', bId: 'bath' }, 'linking bed to bath'],
    ['unlink', { type: 'programme.unlink', aId: 'living', bId: 'kitchen' }, 'unlinking living from kitchen'],
    ['pin', { type: 'programme.pin-room', id: 'bath', order: 0 }, 'moving bath to position 1'],
    ['resize-pair', { type: 'programme.resize-pair', aId: 'living', aAreaM2: 45, bId: 'kitchen', bAreaM2: 25 }, 'the wall you moved between living and kitchen'],
  ];

  it.each(cases)('%s', (_name, intent, expected) => {
    seedProgramme();
    const prev = getRoomProgramme();
    const next = reduceRoomProgramme(prev, intent);
    // ⭐ THE LABEL IS DERIVED FROM THE INTENT AND BOTH STATES, at the one choke point — which is
    // what stops the words and the state disagreeing about which gesture is coming back.
    expect(describeProgrammeIntent(prev, next, intent)).toBe(expected);
  });

  it('the label a room is REMOVED under names the room, read from the state BEFORE', () => {
    seedProgramme();
    applyRoomProgrammeIntent({ type: 'programme.remove-room', id: 'bath' });
    // A label read off the state AFTER would say "a room", because the room is gone by then.
    expect(peekRoomProgrammeUndo()).toBe('removing bath');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// THE DOM HALF — the controls, the keystroke, and WHICH stack it means
// ═════════════════════════════════════════════════════════════════════════════

const VIEWBOX_W = 300;

let host: HTMLElement;

function deps(over: Partial<RoomProgrammePanelDeps> = {}): RoomProgrammePanelDeps {
  let n = 0;
  return {
    resolveRuntime: () => null,
    readSpaceEnvelopes: () => [LEVEL_REC],
    readActiveLevelId: () => 'L0',
    mintId: () => `mint-${(n += 1)}`,
    readProjectRooms: () => [],
    ...over,
  };
}

beforeEach(() => {
  document.body.replaceChildren();
  host = document.createElement('div');
  document.body.appendChild(host);
});

const q = <T extends Element>(h: HTMLElement, testid: string): T =>
  h.querySelector<T>(`[data-testid="${testid}"]`)!;

const undoBtn = (h: HTMLElement): HTMLButtonElement => q<HTMLButtonElement>(h, ROOM_PROGRAMME_UNDO_TESTID);
const redoBtn = (h: HTMLElement): HTMLButtonElement => q<HTMLButtonElement>(h, ROOM_PROGRAMME_REDO_TESTID);
const statusText = (h: HTMLElement): string =>
  q(h, ROOM_PROGRAMME_STATUS_TESTID).textContent ?? '';

/** Draw a 4 × 5 m room through the real pointer gesture — the sibling spec's helper. */
function drawRoom(h: HTMLElement): void {
  q<HTMLButtonElement>(h, ROOM_DRAW_TOGGLE_TESTID).click();
  const svg = h.querySelector<SVGSVGElement>(`[data-testid="${ROOM_PROGRAMME_PREVIEW_TESTID}"] svg`)!;
  const vb = (svg.getAttribute('viewBox') ?? '0 0 300 125').split(' ').map(Number);
  const H = vb[3] ?? 125;
  Object.defineProperty(svg, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: VIEWBOX_W, height: H, left: 0, top: 0,
      right: VIEWBOX_W, bottom: H, x: 0, y: 0, toJSON: () => ({}),
    }),
  });
  const px = (x: number, z: number): { clientX: number; clientY: number } => ({
    clientX: x * ((VIEWBOX_W - 8) / 24) + 4,
    clientY: z * ((H - 8) / 10) + 4,
  });
  const P = (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent;
  svg.dispatchEvent(new P('pointerdown', { bubbles: true, ...px(1, 1) } as MouseEventInit));
  svg.dispatchEvent(new P('pointermove', { bubbles: true, ...px(5, 6) } as MouseEventInit));
  svg.dispatchEvent(new P('pointerup', { bubbles: true, ...px(5, 6) } as MouseEventInit));
}

/**
 * Press Ctrl+Z (or a redo combo) on `target`, and report whether ANYTHING consumed it.
 *
 * ⭐ `dispatchEvent` returns `false` exactly when `preventDefault()` was called, so the return
 * value is a MEASUREMENT of "the panel took this keypress", not an inference from the state.
 */
function pressUndo(
  target: Element,
  opts: { readonly shift?: boolean; readonly key?: string } = {},
): boolean {
  const ev = new KeyboardEvent('keydown', {
    key: opts.key ?? 'z',
    ctrlKey: true,
    shiftKey: opts.shift ?? false,
    bubbles: true,
    cancelable: true,
  });
  return !target.dispatchEvent(ev);
}

/** Put the keyboard's owner inside the panel, the way a pointer press does in production. */
function focusPanel(h: HTMLElement): void {
  const root = h.firstElementChild as HTMLElement;
  const P = (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent;
  root.dispatchEvent(new P('pointerdown', { bubbles: true } as MouseEventInit));
}

describe('§ROOM-BRIEF-UNDO — the controls say what they will do before they are pressed', () => {
  it('⛔ with nothing to take back both controls render DISABLED WITH THEIR REASON', () => {
    const panel = mountRoomProgrammePanel(host, deps());
    expect(undoBtn(host).disabled).toBe(true);
    expect(undoBtn(host).title).toContain('Nothing to take back');
    expect(redoBtn(host).disabled).toBe(true);
    panel.dispose();
  });

  it('⭐ after drawing a room, Undo NAMES the room it would take back', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    drawRoom(host);
    const b = undoBtn(host);
    expect(b.disabled).toBe(false);
    // The label comes from the intent the gesture dispatched — not from a second copy the panel
    // composed for the button, which could name a different gesture than the one on the stack.
    expect(b.title).toContain('Takes back the');
    expect(b.title).toContain('you drew');
    panel.dispose();
  });

  it('⭐ pressing Undo removes the drawn room, says what it took back, and offers Redo', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const before = getRoomProgramme().entries.length;
    drawRoom(host);
    expect(getRoomProgramme().entries).toHaveLength(before + 1);

    undoBtn(host).click();
    expect(getRoomProgramme().entries).toHaveLength(before);
    expect(statusText(host)).toContain('Took back');
    expect(statusText(host)).toContain('you drew');
    // ⭐ THE PLAN REPAINTED. An undo the panel does not re-solve would leave the user reading a
    // plan for a brief that no longer exists.
    expect(redoBtn(host).disabled).toBe(false);

    redoBtn(host).click();
    expect(getRoomProgramme().entries).toHaveLength(before + 1);
    expect(statusText(host)).toContain('Put back');
    panel.dispose();
  });

  it('the controls NAME their subject — two undo stacks are in play on this screen', () => {
    const panel = mountRoomProgrammePanel(host, deps());
    const text = host.textContent ?? '';
    expect(text).toContain('Undo/Redo act on the room programme');
    expect(text).toContain('Envelopes already placed in 3D are undone with Ctrl+Z in the scene');
    panel.dispose();
  });

  it('⛔ the plan hint no longer denies undo — the sentence moved with the behaviour', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const text = q(host, ROOM_PROGRAMME_PREVIEW_TESTID).textContent ?? '';
    // The negative control. This exact sentence shipped with L-13120 and was TRUE then.
    expect(text).not.toContain('None of the three gestures is undoable');
    expect(text).toContain('All three gestures are undoable');
    panel.dispose();
  });
});

describe('§ROOM-BRIEF-UNDO — Ctrl+Z, and which stack it means', () => {
  it('⭐ Ctrl+Z with focus in the panel takes the brief gesture back AND consumes the keypress', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const before = getRoomProgramme().entries.length;
    drawRoom(host);
    focusPanel(host);

    const consumed = pressUndo(document.activeElement ?? host);
    expect(consumed).toBe(true);
    expect(getRoomProgramme().entries).toHaveLength(before);
    panel.dispose();
  });

  it('⛔ Ctrl+Z with focus OUTSIDE the panel is left for the scene — untouched and unconsumed', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    drawRoom(host);
    const after = getRoomProgramme();

    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    // ⛔ NOT CONSUMED is the load-bearing half: `initUI`'s window handler must still get this
    // keypress, or the panel would have stolen the scene's undo just by being on screen.
    expect(pressUndo(outside)).toBe(false);
    expect(getRoomProgramme()).toBe(after);
    panel.dispose();
  });

  it('⛔ Ctrl+Z inside a text field belongs to the text field', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    drawRoom(host);
    const after = getRoomProgramme();
    const input = host.querySelector('input[type="text"]') as HTMLInputElement;
    input.focus();
    expect(pressUndo(input)).toBe(false);
    expect(getRoomProgramme()).toBe(after);
    panel.dispose();
  });

  it('Ctrl+Shift+Z and Ctrl+Y both redo', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    const before = getRoomProgramme().entries.length;
    drawRoom(host);
    focusPanel(host);
    pressUndo(document.activeElement ?? host);
    expect(getRoomProgramme().entries).toHaveLength(before);
    expect(pressUndo(document.activeElement ?? host, { shift: true })).toBe(true);
    expect(getRoomProgramme().entries).toHaveLength(before + 1);
    pressUndo(document.activeElement ?? host);
    expect(pressUndo(document.activeElement ?? host, { key: 'y' })).toBe(true);
    expect(getRoomProgramme().entries).toHaveLength(before + 1);
    panel.dispose();
  });

  it('⛔ with an EMPTY history the keypress is NOT swallowed (§UNDO-NO-PHANTOM, L-691)', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    while (roomProgrammeHistoryDepth().past > 0) undoRoomProgramme();
    focusPanel(host);
    // A handler that consumed a keypress it did no work for would turn the scene's undo into a
    // silent no-op for as long as this panel is open.
    expect(pressUndo(document.activeElement ?? host)).toBe(false);
    panel.dispose();
  });

  it('⛔ a DISPOSED panel answers nothing — the window listener goes with it', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    drawRoom(host);
    const el2 = document.createElement('div');
    document.body.appendChild(el2);
    panel.dispose();
    const after = getRoomProgramme();
    expect(pressUndo(el2)).toBe(false);
    expect(getRoomProgramme()).toBe(after);
  });

  it('⛔ a keypress the panel answers does NOT also reach the global handler', () => {
    seedProgramme();
    const panel = mountRoomProgrammePanel(host, deps());
    drawRoom(host);
    focusPanel(host);
    // The stand-in for `initUI`'s `window.addEventListener('keydown', …)` — BUBBLE phase, on the
    // same window. Without `stopPropagation` one press would undo twice, in two subsystems.
    let globalSaw = 0;
    const spy = (): void => { globalSaw += 1; };
    window.addEventListener('keydown', spy);
    pressUndo(document.activeElement ?? host);
    window.removeEventListener('keydown', spy);
    expect(globalSaw).toBe(0);
    panel.dispose();
  });
});

describe('§ROOM-BRIEF-UNDO — the placement debt: the newest thing wins', () => {
  /** A bus that records what it was asked to do — the panel's ONE dispatch. */
  function busDeps(sent: string[]): RoomProgrammePanelDeps {
    return deps({
      resolveRuntime: () => ({ bus: { executeCommand: (t: string) => { sent.push(t); return null; } } }),
    });
  }

  it('⭐ the FIRST Ctrl+Z after placing envelopes is left for the scene; the SECOND is the brief', () => {
    seedProgramme();
    const sent: string[] = [];
    const panel = mountRoomProgrammePanel(host, busDeps(sent));
    drawRoom(host);
    const withRoom = getRoomProgramme();

    q<HTMLButtonElement>(host, ROOM_PROGRAMME_PLACE_BTN_TESTID).click();
    expect(sent).toContain('spaceEnvelope.batch.create');
    focusPanel(host);

    // ⛔ THE ENVELOPES ARE NEWER THAN THE DRAWING, so this keypress belongs to the ring buffer —
    // §UNDO-CROSS-STACK-ORDER, with the only two facts this panel can establish.
    expect(pressUndo(document.activeElement ?? host)).toBe(false);
    expect(getRoomProgramme()).toBe(withRoom);

    // The debt is paid; the next press is the brief's.
    expect(pressUndo(document.activeElement ?? host)).toBe(true);
    expect(getRoomProgramme()).not.toBe(withRoom);
    panel.dispose();
  });

  it('⭐ the BUTTON never defers — pressing a control that names the programme IS the choice', () => {
    seedProgramme();
    const sent: string[] = [];
    const panel = mountRoomProgrammePanel(host, busDeps(sent));
    const before = getRoomProgramme().entries.length;
    drawRoom(host);
    q<HTMLButtonElement>(host, ROOM_PROGRAMME_PLACE_BTN_TESTID).click();

    undoBtn(host).click();
    expect(getRoomProgramme().entries).toHaveLength(before);
    panel.dispose();
  });

  it('the next brief edit clears the debt — the brief is the newest thing again', () => {
    seedProgramme();
    const sent: string[] = [];
    const panel = mountRoomProgrammePanel(host, busDeps(sent));
    drawRoom(host);
    q<HTMLButtonElement>(host, ROOM_PROGRAMME_PLACE_BTN_TESTID).click();
    applyRoomProgrammeIntent({ type: 'programme.set-area', id: 'bath', targetAreaM2: 13 });
    focusPanel(host);
    expect(pressUndo(document.activeElement ?? host)).toBe(true);
    expect(getRoomProgramme().entries.find((e) => e.id === 'bath')!.targetAreaM2).toBe(12);
    panel.dispose();
  });
});

describe('§ROOM-BRIEF-UNDO — a change the user did not make is not his to undo', () => {
  const PROJECT_ROOMS: readonly ProjectRoomLike[] = [
    { id: 'r1', name: 'Living', levelId: 'L0', area: 30 },
    { id: 'r2', name: 'Kitchen', levelId: 'L0', area: 18 },
  ];

  it('⛔ the automatic mount-time load of the project rooms leaves Undo DISABLED', () => {
    const panel = mountRoomProgrammePanel(host, deps({ readProjectRooms: () => PROJECT_ROOMS }));
    // The panel read the project's own rooms into the brief before the first paint. Undo must
    // not offer to take that back: the user would press it expecting his own last gesture and
    // watch the panel empty instead.
    expect(getRoomProgramme().entries.length).toBeGreaterThan(0);
    expect(undoBtn(host).disabled).toBe(true);
    panel.dispose();
  });

  it('⭐ the explicit "re-read the project" BUTTON is a gesture, and IS undoable', () => {
    const panel = mountRoomProgrammePanel(host, deps({ readProjectRooms: () => PROJECT_ROOMS }));
    // It REPLACES the brief and its own tooltip warns that plugged relationships are cleared —
    // which is exactly the gesture a user most needs to be able to take back.
    const loaded = getRoomProgramme();
    applyRoomProgrammeIntent({ type: 'programme.link', aId: loaded.entries[0]!.id, bId: loaded.entries[1]!.id });
    const withLink = getRoomProgramme();
    q<HTMLButtonElement>(host, ROOM_PROGRAMME_LOAD_BTN_TESTID).click();
    expect(getRoomProgramme().links).toHaveLength(0);
    undoBtn(host).click();
    expect(getRoomProgramme()).toBe(withLink);
    panel.dispose();
  });
});

/**
 * ⛔ WHAT THIS FILE DOES NOT CLAIM.
 *
 * 1. NO CROSS-SESSION PERSISTENCE. The brief still dies with the tab, deliberately
 *    (`roomProgrammeModel.ts`'s header). Undo is a within-session guarantee; restoring a brief
 *    on next load is a different decision with a different argument, and it is not made here.
 * 2. NO GLOBAL CHRONOLOGY. A bus command dispatched by ANOTHER surface while focus sat in this
 *    panel is invisible to the debt counter, so a Ctrl+Z could take back a brief edit older than
 *    it. Closing that needs one clock shared by the ring buffer and this history — a change to
 *    `performUndoRedo.ts`, not to this panel. It is stated in the panel's own source and here,
 *    rather than left for a user to discover.
 * 3. PIXELS UNVERIFIED. happy-dom lays nothing out; the layout box is stubbed, as in the three
 *    sibling gesture specs.
 */
