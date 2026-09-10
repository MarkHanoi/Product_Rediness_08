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
import { appPhase, resetAppPhaseForNewProject, setAppPhase } from '../../layout/panelDefaults';
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

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭐⭐ §SITE-AUTHORING-IS-NOT-BIM-AUTHORING (L-13303) — THE STRIP MUST RISE IN THE PHASE THE
//    GESTURE ACTUALLY RUNS IN, AND THIS IS THE ARM THE SUITE ABOVE COULD NOT SEE
// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ EVERY CASE ABOVE CALLS `setAppPhase('canvas')` IN ITS `beforeEach` — its own header says so
// and gives the reason (a suite that forgot would be silently dark). That was correct for what
// those cases pin, and it is EXACTLY why they stayed green while the founder saw no pills at all:
// they measured the strip in a phase the envelope draw is never in.
//
// ⛔ MEASURED, and it is written twice in this repository by the lane that regressed on it
// (L-13297): `setAppPhase('canvas')` fires only when onboarding DISPOSES or a BIM view activates.
// Throughout the whole site-authoring session — parcel select, the Site tab, the envelope card,
// massing — the phase is STILL `'onboarding-globe'`. The envelope draw runs ONLY on the 2-D Site
// Map and the 3-D Site. So `refuseElementAuthoring` returned `true` on 100% of this gesture's
// surfaces, and the strip was dead by construction.
//
// ⭐ THESE CASES SET THE REAL PHASE AND ASSERT AGAINST IT. That is the whole point: a test written
// in `'canvas'` cannot fail for this defect, no matter what it asserts.
describe('§SITE-AUTHORING-IS-NOT-BIM-AUTHORING (L-13303) — the strip in the phase it lives in', () => {
    beforeEach(() => {
        // ⛔ THE REAL PHASE OF THE SITE-AUTHORING SESSION — NOT `'canvas'`. Do not "fix" a failure
        // here by flipping this to `'canvas'`: that restores the blindness this block exists to
        // remove and re-ships the founder's bug with a green suite over it.
        resetAppPhaseForNewProject();
        expect(appPhase(), 'the premise of this whole block').toBe('onboarding-globe');
    });

    it('⭐ the envelope strip RENDERS during onboarding-globe — the founder\'s missing pills', () => {
        bar.show({
            label: 'Mode:',
            modes: ENVELOPE_DRAW_BAR_MODES,
            initialMode: resolveEnvelopeDrawMode(),
            onSelect: (id) => setEnvelopeDrawMode(id),
            escHint: 'ENTER closes · ESC cancels',
            gestureKind: 'site-authoring',
        });
        expect(bar.isVisible(), 'the strip was refused in the only phase it ever runs in').toBe(true);
        const el = document.querySelector<HTMLElement>('.wdh-bar');
        expect(el, 'no .wdh-bar in the document').not.toBeNull();
        // The six the gesture honours, plus the one that says why it cannot apply here.
        expect([...el!.querySelectorAll<HTMLButtonElement>('.wdh-btn')].map((b) => b.dataset.mode))
            .toEqual(['linear', 'ortho', 'curved', 'rectangular', 'circular', 'elliptical', 'byslab']);
    });

    // ══════════════════════════════════════════════════════════════════════════════════════════
    // ⛔⛔ THE SCRAMBLE CONTROL (L-586) — WITHOUT THIS, "DELETE THE GATE" PASSES THE CASE ABOVE
    // ══════════════════════════════════════════════════════════════════════════════════════════
    // The cheapest wrong fix for the founder's report is to rip `refuseElementAuthoring` out of
    // `DrawingModeBar.show`, and it would make every assertion above green. It would also re-open
    // L-5103 — his ORIGINAL report, a stray mode strip over the parcel map at step 3 of 4 of
    // project setup. These two cases fail loudly on that fix, which is the only reason the case
    // above is worth anything.
    it('⛔ SCRAMBLE: a BIM-element strip is STILL refused in the same phase, same instant', () => {
        bar.show({
            label: 'Mode:',
            modes: ENVELOPE_DRAW_BAR_MODES,
            initialMode: 'linear',
            onSelect: () => { /* never reached */ },
            // ⛔ THE ONLY DIFFERENCE FROM THE PASSING CASE ABOVE IS THIS ONE FIELD. Same phase,
            // same pills, same instant — so a green here means the gate was removed, not narrowed.
            gestureKind: 'bim-element',
        });
        expect(bar.isVisible(), 'L-5103 IS RE-OPENED: the stray strip can render over the parcel map again')
            .toBe(false);
        expect(document.querySelector('.wdh-bar')).toBeNull();
    });

    it('⛔ SCRAMBLE: the DEFAULT (field omitted) is the refusing one — no caller opts in by accident', () => {
        bar.show({
            label: 'Slab:',
            modes: ENVELOPE_DRAW_BAR_MODES,
            initialMode: 'linear',
            onSelect: () => { /* never reached */ },
        });
        expect(bar.isVisible(), 'omitting gestureKind must NOT grant the exemption').toBe(false);
    });

    it('⭐ and on the BIM canvas BOTH kinds render — the exemption widens nothing there', () => {
        setAppPhase('canvas');
        bar.show({ label: 'Mode:', modes: ENVELOPE_DRAW_BAR_MODES, initialMode: 'linear', onSelect: () => {} });
        expect(bar.isVisible()).toBe(true);
        bar.show({
            label: 'Mode:', modes: ENVELOPE_DRAW_BAR_MODES, initialMode: 'linear',
            onSelect: () => {}, gestureKind: 'site-authoring',
        });
        expect(bar.isVisible()).toBe(true);
    });
});
