// §ENVELOPE-MODE-BAR (lane ENVELOPE-DRAW-AND-STOREYS, 2026-09-07) — L-13152.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE FOUNDER ASKED FOR THIS TWICE, AND THE STORE BEHIND IT WAS ALREADY BUILT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// *"I need the draw tool as you see on the image 4 - as we have in pryzm"*, and earlier *"i would
// like the panel with curved - stright line - orothogonal etc.. as we have with the slab / wall
// tool in pryzm views"*.
//
// ⛔ THE DEFECT WAS REACHABILITY, NOT ABSENCE. `siteEnvelopeDrawArming` has carried a six-mode
// store since the draw shipped — `setEnvelopeDrawMode` / `resolveEnvelopeDrawMode`, read fresh on
// every click exactly as designed — and `setEnvelopeDrawMode` had **ZERO production callers**. The
// gestures existed and no user could ever reach one: every perimeter was drawn in the `'linear'`
// default. [[authored-but-unwired-is-the-bottleneck]].
//
// ⛔ WHAT THESE CASES PIN, AND WHAT THEY DO NOT. They exercise the shared `DrawingModeBar` with the
// envelope's real pill declaration, in happy-dom. They establish that the strip renders the seven
// pills, that picking one writes the ONE mode store, that the unavailable pill is visible, disabled
// and carries its reason, and that its accelerator neither fires nor swallows the key. ⚠ They do
// NOT establish that the strip appears on a real site view — that is `siteEnvelopeTool`'s mount and
// it needs a runtime ([[committed-is-not-reachable]]).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DrawingModeBar } from '../../DrawingModeBar';
import { setAppPhase } from '../../layout/panelDefaults';
import {
    ENVELOPE_DRAW_BAR_MODES,
    ENVELOPE_DRAW_MODES,
    __resetEnvelopeDrawArmingForTests,
    isEnvelopeDrawMode,
    resolveEnvelopeDrawMode,
    setEnvelopeDrawMode,
} from '../siteEnvelopeDrawArming';

let bar: DrawingModeBar;

beforeEach(() => {
    // §AUTHORING-CONTEXT-GATE (L-5103) — `DrawingModeBar.show` refuses outside the canvas phase,
    // and a suite that forgot this would be silently dark (the L-7006 shape, recorded in
    // `drawingModeBar.spec.ts`'s own header).
    setAppPhase('canvas');
    __resetEnvelopeDrawArmingForTests();
    document.body.innerHTML = '';
    bar = new DrawingModeBar();
});
afterEach(() => {
    bar.dismiss();
    __resetEnvelopeDrawArmingForTests();
    document.body.innerHTML = '';
});

const show = (): HTMLElement => {
    bar.show({
        label: 'Mode:',
        modes: ENVELOPE_DRAW_BAR_MODES,
        initialMode: resolveEnvelopeDrawMode(),
        onSelect: (id) => setEnvelopeDrawMode(id),
        escHint: 'ENTER closes · ESC cancels',
    });
    const el = document.querySelector<HTMLElement>('.wdh-bar');
    expect(el, 'the strip must be in the document').not.toBeNull();
    return el!;
};
const pills = (el: HTMLElement): HTMLButtonElement[] =>
    [...el.querySelectorAll<HTMLButtonElement>('.wdh-btn')];

describe('§ENVELOPE-MODE-BAR — the pills the founder asked for', () => {
    it('⭐ renders the PRYZM bar: Mode: · L O C · Q I E · S, and an ENTER/ESC hint', () => {
        const el = show();
        expect(el.querySelector('.wdh-mode-lbl')!.textContent).toBe('Mode:');
        expect(pills(el).map((b) => b.dataset.mode)).toEqual([
            'linear', 'ortho', 'curved', 'rectangular', 'circular', 'elliptical', 'byslab',
        ]);
        expect(pills(el).map((b) => b.querySelector('.wdh-key')!.textContent)).toEqual(
            ['L', 'O', 'C', 'Q', 'I', 'E', 'S'],
        );
        // ⚠ NOT the wall's "ESC to finish": here Esc CANCELS and Enter finishes, and a shared
        // component printing the wrong verb would lose the user's perimeter.
        expect(el.querySelector('.wdh-esc')!.textContent).toBe('ENTER closes · ESC cancels');
        expect(el.querySelector('.wdh-esc')!.textContent).not.toContain('ESC to finish');
    });

    it('⭐ the three PATH pills are the WALL’s own constants — parity by construction', () => {
        const el = show();
        const labels = pills(el).slice(0, 3).map((b) => b.querySelector('.wdh-lbl')!.textContent);
        expect(labels).toEqual(['Linear', 'Orthogonal', 'Curved']);
    });

    it('⛔ clicking a pill writes the ONE mode store, and nothing re-arms', () => {
        const el = show();
        expect(resolveEnvelopeDrawMode()).toBe('linear');
        pills(el).find((b) => b.dataset.mode === 'ortho')!.click();
        expect(resolveEnvelopeDrawMode()).toBe('ortho');
        pills(el).find((b) => b.dataset.mode === 'elliptical')!.click();
        expect(resolveEnvelopeDrawMode()).toBe('elliptical');
    });

    it('⛔ the accelerator writes it too, so the strip and the keyboard are one control', () => {
        show();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true }));
        expect(resolveEnvelopeDrawMode()).toBe('curved');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Q', bubbles: true }));
        expect(resolveEnvelopeDrawMode()).toBe('rectangular');
    });

    // ══════════════════════════════════════════════════════════════════════════════════════════
    // ⭐⭐ THE FOUNDER'S OWN RULE FOR AN INAPPLICABLE MODE
    // ══════════════════════════════════════════════════════════════════════════════════════════
    // *"If a mode cannot apply, it must be visibly unavailable with a reason — never silently
    // absent, and never present-but-inert."* All three halves are asserted below, because each one
    // is a different way of getting it wrong.
    it('⭐ "By Slab" is PRESENT — never silently absent', () => {
        const el = show();
        const s = pills(el).find((b) => b.dataset.mode === 'byslab');
        expect(s, 'omitting it makes the bar read as a different, smaller tool').toBeDefined();
        expect(s!.querySelector('.wdh-lbl')!.textContent).toBe('By Slab');
    });

    it('⭐ …VISIBLY UNAVAILABLE, and it SAYS WHY on hover', () => {
        const el = show();
        const s = pills(el).find((b) => b.dataset.mode === 'byslab')!;
        expect(s.disabled).toBe(true);
        expect(s.dataset.unavailable).toBe('1');
        expect(s.getAttribute('aria-disabled')).toBe('true');
        expect(s.title).toContain('Not on a site view');
        expect(s.title).toContain('no slab to pick');
        // ⚠ The REASON replaces the description rather than following it: a user hovering a greyed
        // pill is asking one question, and answering a different one first buries it.
        expect(s.title).not.toContain('Create the perimeter from a selected slab');
    });

    it('⛔ …and NEVER present-but-inert: neither its click nor its key changes anything', () => {
        const el = show();
        const before = resolveEnvelopeDrawMode();
        pills(el).find((b) => b.dataset.mode === 'byslab')!.click();
        expect(resolveEnvelopeDrawMode()).toBe(before);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
        expect(resolveEnvelopeDrawMode()).toBe(before);
    });

    it('⛔ an unavailable accelerator does not SWALLOW the key either', () => {
        show();
        let reachedSomethingElse = false;
        const listener = (): void => { reachedSomethingElse = true; };
        window.addEventListener('keydown', listener);
        try {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
        } finally {
            window.removeEventListener('keydown', listener);
        }
        // "Not offered here" must mean the key is free, not that it is eaten in silence.
        expect(reachedSomethingElse).toBe(true);
    });

    // ══════════════════════════════════════════════════════════════════════════════════════════
    // ⛔ ONE DECLARATION, TWO READERS — the bar and the gesture cannot disagree
    // ══════════════════════════════════════════════════════════════════════════════════════════
    it('⛔ every AVAILABLE pill is a real gesture mode, and every gesture mode has a pill', () => {
        const offered = ENVELOPE_DRAW_BAR_MODES.filter((m) => m.unavailable === undefined).map((m) => m.id);
        expect(offered).toEqual([...ENVELOPE_DRAW_MODES]);
        for (const id of offered) expect(isEnvelopeDrawMode(id)).toBe(true);
        // ⛔ And the unavailable one is NOT a gesture mode — a pill the gesture would silently
        // ignore is a dead control that looks alive.
        for (const m of ENVELOPE_DRAW_BAR_MODES.filter((x) => x.unavailable !== undefined)) {
            expect(ENVELOPE_DRAW_MODES).not.toContain(m.id);
        }
    });

    it('⛔ every pill has a UNIQUE accelerator — two pills on one key is a coin toss', () => {
        const keys = ENVELOPE_DRAW_BAR_MODES.map((m) => m.key.toUpperCase());
        expect(new Set(keys).size).toBe(keys.length);
    });
});
