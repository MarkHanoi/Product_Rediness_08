// §ONE-CARD-AT-A-TIME — THE LOCATION → NAME → SPLIT HAND-OFF (L-13130, lane ONBOARDING-CARD-ORDER,
// 2026-09-07).
//
// ⛔ THE DEFECT, from the founder's screenshot of the LIVE build. TWO onboarding cards on screen at
// once: the new "Name your project" card (§STARTUP-NAME-CARD, `24135434`) and, ON TOP of it and
// covering its confirm button, the older "Where is your project?" card — still holding his typed
// query, still printing "Found: Barcelona, Barcelonès, …", still offering a live
// "Skip — no location".
//
// ⭐ IT WAS NEVER A RACE, WHICH IS WHY NO TIMER COULD HAVE FIXED IT. Nothing owned the location
// card's dismissal. `leaveLocationStep()` disposes the GLOBE and only the globe (and must keep
// doing so — the split re-parents that viewport, §REVEAL-FLIGHT-COMPLETE); the card's DOM was
// replaced later, by the next step's own `clearBody()`, which sits after `await
// this.revealInFlight` — i.e. after the entire ~18 s reveal the name card exists to cover. The two
// overlapped for exactly that window, deterministically, every run.
//
// ⭐ WHAT THIS FILE PINS, IN THREE ARMS THAT FAIL DIFFERENTLY:
//   ARM A — the SLOT itself: retire-then-raise is one synchronous body, and the slot ENFORCES its
//           own emptiness, so a wrong `retire` degrades to a log line instead of to two cards.
//   ARM B — the REAL sequence: the real `GlobeHeroSearch` stage chain driving the real
//           `showStartupProjectNameCard` through the real hand-off, with the modal-card census
//           taken at every point of location → name → split. It carries the DEFECT as well as the
//           cure: one case reproduces the shipped two-card state, so the census is proven able to
//           go red rather than merely observed green.
//   ARM C — the PRODUCTION wiring, read out of `OnboardingStepController.ts`, because Arm B drives
//           a reconstruction and by construction cannot see a regression in the real file. It also
//           pins the two fixes this must NOT be: no timer, no z-index.
//
// ⚠ IT DOES NOT RE-PIN THE NON-GATING INVARIANT — `startupNameCardLoadOrdering.spec.ts` owns that,
// and it must stay green: the load starts and CONTINUES while the card is up, and the card is
// never auto-dismissed by the load winning the race. Arm B asserts the second half explicitly,
// because a "one card at a time" rule is one careless edit away from being enforced by killing the
// name card at reveal — which would destroy the feature to satisfy the invariant.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GlobeHeroSearch } from '../GlobeHeroSearch';
import {
    handOffOnboardingModalCard,
    markOnboardingModalCard,
    unmarkOnboardingModalCard,
    visibleOnboardingModalCards,
    ONBOARDING_MODAL_CARD_ATTR,
} from '../onboardingCardSlot';
import {
    showStartupProjectNameCard,
    dismissStartupProjectNameCard,
    startupProjectNameDefault,
    STARTUP_NAME_CARD_SLOT_ID,
} from '../startupProjectNameCard';

const NAME_CARD = '#pryzm-startup-name-card';

/** A stand-in for the onboarding overlay: marked with the REAL marker, hidden with the REAL
 *  mechanism (`hidden`), so the census under test is the one the product runs. */
function mountLocationCard(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.id = 'os-onboarding-overlay';
    markOnboardingModalCard(overlay, 'onboarding-step');
    const skip = document.createElement('button');
    skip.setAttribute('data-testid', 'onboarding-location-skip');
    skip.textContent = 'Skip — no location';
    overlay.appendChild(skip);
    document.body.appendChild(overlay);
    return overlay;
}

/** `retireLocationCard()`'s two effects, reproduced: empty the body, hide the shell. */
function retireLocationCard(overlay: HTMLElement): void {
    while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
    overlay.hidden = true;
}

beforeEach(() => {
    dismissStartupProjectNameCard();
    document.body.innerHTML = '';
});
afterEach(() => {
    dismissStartupProjectNameCard();
});

// ── ARM A — the slot ──────────────────────────────────────────────────────────────────────────

describe('ARM A — the slot admits exactly one modal card, and enforces it', () => {
    it('runs `retire` BEFORE `raise` — observed from inside `raise`, not asserted about it', () => {
        const overlay = mountLocationCard();
        let slotWhenRaised: string[] | null = null;
        handOffOnboardingModalCard({
            from: 'onboarding-step',
            to: STARTUP_NAME_CARD_SLOT_ID,
            retire: () => retireLocationCard(overlay),
            // ⛔ THE ORDERING GUARANTEE, READ AT THE ONE MOMENT IT MATTERS. If the hand-off ever
            // becomes "raise, then retire on a timer", this is empty no longer.
            raise: () => { slotWhenRaised = visibleOnboardingModalCards(); },
        });
        expect(slotWhenRaised).toEqual([]);
    });

    it('returns a plain object, never a promise — nothing here can be awaited by a loader', () => {
        const overlay = mountLocationCard();
        const r = handOffOnboardingModalCard({
            from: 'onboarding-step',
            to: null,
            retire: () => retireLocationCard(overlay),
            raise: () => {},
        });
        // §STARTUP-NAME-CARD's whole value is that the load is already running behind the card.
        // A hand-off with a `then` is one edit away from being awaited on the start-up path.
        expect((r as unknown as { then?: unknown }).then).toBeUndefined();
        expect(r.mounted).toEqual([]);
    });

    it('SWEEPS a card whose own retire left it standing — the guarantee does not rely on callers', () => {
        const overlay = mountLocationCard();
        const errors: unknown[][] = [];
        const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a); });
        const result = handOffOnboardingModalCard({
            from: 'onboarding-step',
            to: STARTUP_NAME_CARD_SLOT_ID,
            // ⛔ A DELIBERATELY BROKEN RETIRE — the shipped defect, in one line.
            retire: () => { /* forgets to take the location card down */ },
            raise: () => { showStartupProjectNameCard({ defaultName: 'Barcelona', onCommit: () => {} }); },
        });
        spy.mockRestore();
        expect(result.swept).toEqual(['onboarding-step']);
        expect(overlay.hidden).toBe(true);
        // The invariant HOLDS anyway — that is the point of enforcing rather than asserting.
        expect(result.mounted).toEqual([STARTUP_NAME_CARD_SLOT_ID]);
        expect(visibleOnboardingModalCards()).toEqual([STARTUP_NAME_CARD_SLOT_ID]);
        // ...and it is REPORTED, so a wrong retire is a visible bug rather than a silent recovery.
        expect(errors.length).toBeGreaterThan(0);
        expect(String(errors[0]?.[0])).toContain('ONE-CARD-AT-A-TIME');
    });

    it('a `to: null` hand-off leaves the slot legitimately EMPTY', () => {
        // Reachable in production: an address with no usable place name raises no name card
        // (`startupProjectNameDefault` never invents one), and the loading overlay owns the screen.
        expect(startupProjectNameDefault('')).toBe('');
        const overlay = mountLocationCard();
        const r = handOffOnboardingModalCard({
            from: 'onboarding-step',
            to: null,
            retire: () => retireLocationCard(overlay),
            raise: () => {},
        });
        expect(r.swept).toEqual([]);
        expect(r.mounted).toEqual([]);
    });

    it('a HIDDEN ancestor takes a card out of the slot — visibility is inherited, not local', () => {
        const shell = document.createElement('div');
        const card = document.createElement('div');
        markOnboardingModalCard(card, 'onboarding-step');
        shell.appendChild(card);
        document.body.appendChild(shell);
        expect(visibleOnboardingModalCards()).toEqual(['onboarding-step']);
        shell.hidden = true;
        expect(visibleOnboardingModalCards()).toEqual([]);
    });

    it('unmarking removes a surface from the slot WITHOUT hiding it — the docked banner case', () => {
        const overlay = mountLocationCard();
        unmarkOnboardingModalCard(overlay);
        expect(overlay.hidden).toBe(false);
        expect(overlay.hasAttribute(ONBOARDING_MODAL_CARD_ATTR)).toBe(false);
        expect(visibleOnboardingModalCards()).toEqual([]);
    });
});

// ── ARM B — the real location → name → split sequence ─────────────────────────────────────────

/**
 * The production wiring of `renderLocationStep()`, port for port: a `warmContextCache` that starts
 * a load and holds its promise, and an `onParcelArrival` that kicks off the reveal and THEN hands
 * the slot from the location card to the name card.
 */
function wireLikeTheController(overlay: HTMLElement): {
    hero: GlobeHeroSearch;
    committed: string[];
    census: Record<string, string[]>;
    revealSplit: () => void;
} {
    const committed: string[] = [];
    const census: Record<string, string[]> = {};
    let warmStarted = false;
    census['before-search'] = visibleOnboardingModalCards();

    const hero = new GlobeHeroSearch({
        toggleGlobe: () => {},
        getCameraHost: () => ({ flyToGeographic: () => Promise.resolve() }),
        entries: [],
        geocode: async () => [{
            lat: 41.3874, lon: 2.1686,
            displayName: 'Barcelona, Barcelonès, Barcelona, Catalunya, 08001, España',
            bbox: [2.05, 41.32, 2.23, 41.47] as [number, number, number, number],
        }],
        warmContextCache: () => { warmStarted = true; },
        onParcelArrival: (picked) => {
            // `this.revealInFlight = this.revealSplitAtParcel({...})` — kicked off, not awaited.
            census['at-arrival-before-handoff'] = visibleOnboardingModalCards();
            const defaultName = startupProjectNameDefault(picked.address);
            handOffOnboardingModalCard({
                from: 'onboarding-step',
                to: defaultName ? STARTUP_NAME_CARD_SLOT_ID : null,
                retire: () => retireLocationCard(overlay),
                raise: () => {
                    census['inside-raise'] = visibleOnboardingModalCards();
                    if (!defaultName) return;
                    showStartupProjectNameCard({
                        defaultName,
                        onCommit: (name) => { committed.push(name); },
                    });
                },
            });
            census['after-handoff'] = visibleOnboardingModalCards();
        },
    });

    return {
        hero,
        committed,
        census,
        // The reveal landing: the split mounts and the flow moves to the DOCKED DRAW BANNER, which
        // is deliberately NOT a modal card — `setDrawingPresentation(true)` unmarks the overlay and
        // `renderDrawingStep()` un-hides it. Reproduced here exactly.
        revealSplit: () => {
            expect(warmStarted).toBe(true);
            unmarkOnboardingModalCard(overlay);
            overlay.hidden = false;
        },
    };
}

describe('ARM B — the real sequence: location → name → split', () => {
    it('⛔ THE DEFECT, REPRODUCED: raising the name card WITHOUT the hand-off puts two cards on screen', () => {
        // This is what `24135434` shipped, in two statements. It is here so the census below is
        // known to be capable of failing — a green invariant nobody has ever seen go red is the
        // §COMMITTED-IS-NOT-REACHABLE shape.
        const overlay = mountLocationCard();
        showStartupProjectNameCard({ defaultName: 'Barcelona', onCommit: () => {} });
        expect(visibleOnboardingModalCards()).toEqual(['onboarding-step', STARTUP_NAME_CARD_SLOT_ID]);
        // ...and the location card is the one ON TOP in the real build (2147483000 vs 88 870), with
        // its "Skip — no location" button still live over the name card's confirm.
        expect(overlay.querySelector('[data-testid="onboarding-location-skip"]')).not.toBeNull();
    });

    it('holds ONE modal card at every point of the transition', async () => {
        const overlay = mountLocationCard();
        const { hero, census, revealSplit } = wireLikeTheController(overlay);

        expect(census['before-search']).toEqual(['onboarding-step']);
        await hero.search('Barcelona');

        // At arrival the location card is still up — the reveal has only just been kicked off.
        expect(census['at-arrival-before-handoff']).toEqual(['onboarding-step']);
        // Inside `raise`, the slot is EMPTY: the location card left before the name card arrived.
        expect(census['inside-raise']).toEqual([]);
        // And after: exactly one card, and it is the name card.
        expect(census['after-handoff']).toEqual([STARTUP_NAME_CARD_SLOT_ID]);
        expect(visibleOnboardingModalCards()).toEqual([STARTUP_NAME_CARD_SLOT_ID]);
        expect(document.querySelectorAll(NAME_CARD).length).toBe(1);

        // The split reveals BEHIND the card and the draw banner docks — still one modal card.
        revealSplit();
        expect(visibleOnboardingModalCards()).toEqual([STARTUP_NAME_CARD_SLOT_ID]);
    });

    it('⚠ the load WINNING THE RACE still does not retire the name card', async () => {
        // §STARTUP-NAME-CARD's own invariant, re-pinned HERE because "one card at a time" is one
        // careless edit away from being enforced by killing the name card at reveal — which would
        // destroy the feature in order to satisfy the rule.
        const overlay = mountLocationCard();
        const { hero, committed, revealSplit } = wireLikeTheController(overlay);
        await hero.search('Barcelona');
        revealSplit();
        expect(document.querySelector(NAME_CARD)).not.toBeNull();
        expect(committed).toEqual([]);
        // The user confirms in their own time, and the name they typed is what is written.
        const input = document.querySelector<HTMLInputElement>('[data-testid="startup-project-name-input"]');
        expect(input).not.toBeNull();
        input!.value = 'Sagrada tower';
        input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(committed).toEqual(['Sagrada tower']);
        expect(visibleOnboardingModalCards()).toEqual([]);
    });

    it('the location card\'s controls are OUT OF THE DOCUMENT, not merely covered', async () => {
        // ⛔ THE SKIP PATH. While the card lingered, "Skip — no location" stayed clickable AFTER a
        // location had been accepted — a state nobody designed: it discarded a location the reveal
        // had already anchored, disposed the globe the split was about to adopt, and raised a
        // SECOND naming prompt. A z-index fix would have left that button exactly where it was.
        const overlay = mountLocationCard();
        const { hero } = wireLikeTheController(overlay);
        await hero.search('Barcelona');
        expect(document.querySelector('[data-testid="onboarding-location-skip"]')).toBeNull();
        expect(overlay.hidden).toBe(true);
    });

    it('a dismissed name card leaves NO document listener behind that can rename later', () => {
        // Regression: `dismissStartupProjectNameCard()` (the controller's own cleanup route) used
        // to remove the element while leaving its CAPTURED document Escape handler attached, so a
        // later Escape fired `onCommit` — a real `persistence.client.rename` — long after the flow
        // had moved on.
        const onCommit = vi.fn();
        showStartupProjectNameCard({ defaultName: 'Barcelona', onCommit });
        dismissStartupProjectNameCard();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(onCommit).not.toHaveBeenCalled();
    });
});

// ── ARM C — the production wiring, read out of the real controller ────────────────────────────
//
// ⚠ WHY A SOURCE READ. `OnboardingStepController.ts` pulls in the whole editor graph and builds
// DOM at import time — the same reason `startupNameCardLoadOrdering.spec.ts` reads it rather than
// importing it. Arm B drives a reconstruction and cannot see a regression in the real file.

const CONTROLLER_SRC = resolve(__dirname, '..', 'OnboardingStepController.ts');

/**
 * ⚠ COMMENTS STRIPPED, DELIBERATELY. The "no timer, no z-index" arm is about CODE — and the very
 * comment that explains why those two fixes were rejected NAMES them, so matching the raw body
 * would fail on its own rationale and pressure a future author into deleting the explanation to
 * make the test pass. That is a worse outcome than the test not existing.
 */
function codeOnly(s: string): string {
    return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

function braceBody(src: string, from: number): string {
    const open = src.indexOf('{', from);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) return src.slice(open, i + 1);
        }
    }
    throw new Error('unbalanced body');
}

describe('ARM C — the production hand-off in OnboardingStepController', () => {
    const src = readFileSync(CONTROLLER_SRC, 'utf8');
    const arrival = braceBody(src, src.indexOf('onParcelArrival: (picked) => {'));

    it('raises the name card THROUGH the hand-off, never beside the location card', () => {
        const handOff = arrival.indexOf('handOffOnboardingModalCard(');
        const raise = arrival.indexOf('showStartupProjectNameCard(');
        expect(handOff).toBeGreaterThan(-1);
        expect(raise).toBeGreaterThan(-1);
        // The raise is INSIDE the transition, so it cannot run without the retire having run.
        expect(handOff).toBeLessThan(raise);
        expect(arrival).toMatch(/retire:\s*\(\)\s*=>\s*this\.retireLocationCard\(/);
    });

    it('⛔ is NOT a timer and NOT a z-index — the two fixes this defect must never receive', () => {
        const code = codeOnly(arrival);
        // A `setTimeout` would leave the missing hand-off exactly where it was, with a delay bolted
        // on; a z-index bump would leave a live "Skip — no location" button under a card asking a
        // different question. Both are "fixes" this repo has shipped before and had to undo.
        expect(code).not.toMatch(/setTimeout|setInterval|requestAnimationFrame/);
        expect(code).not.toMatch(/zIndex|z-index/);
        // The rationale stays in the file — the assertion above reads code, not prose.
        expect(arrival).toMatch(/NOT A TIMER AND NOT A Z-INDEX/);
    });

    it('does not await the hand-off — the card still gates nothing', () => {
        expect(arrival).not.toMatch(/await\s+handOffOnboardingModalCard/);
        // and the reveal is still kicked off first (owned by startupNameCardLoadOrdering.spec.ts,
        // restated here only as the premise this arm reads under).
        expect(arrival.indexOf('this.revealSplitAtParcel(')).toBeLessThan(arrival.indexOf('handOffOnboardingModalCard('));
    });

    it('`retireLocationCard` empties the body AND hides the shell', () => {
        const body = braceBody(src, src.indexOf('private retireLocationCard(why: string): void'));
        expect(body).toMatch(/this\.clearBody\(\)/);
        expect(body).toMatch(/this\.overlay\.hidden\s*=\s*true/);
        expect(body).toMatch(/this\.locationCardRetired\s*=\s*true/);
    });

    it('⛔ `leaveLocationStep` still owns the GLOBE ONLY — the two halves stay separate', () => {
        // The reveal re-parents the globe's viewport into the split, so releasing it early is the
        // §22 black-3D-pane hazard. Folding the card teardown INTO this method would look like a
        // tidy-up and would re-open that one.
        const body = braceBody(src, src.indexOf('private leaveLocationStep(): void'));
        expect(body).toMatch(/this\.globeHero/);
        expect(body).not.toMatch(/hidden|clearBody|retireLocationCard/);
    });

    it('the location card\'s skip and submit refuse to fire once the card is retired', () => {
        expect(src).toMatch(/if\s*\(this\.locationCardRetired\)\s*\{[\s\S]{0,400}?Skip — no location/);
        expect(src).toMatch(/this\.locationCardRetired\s*=\s*false;/); // re-armed on a fresh card
    });

    it('the docked banner is NOT a modal card, and a modal step retires the name card', () => {
        const body = braceBody(src, src.indexOf('private setDrawingPresentation(drawing: boolean): void'));
        expect(body).toMatch(/unmarkOnboardingModalCard\(this\.overlay\)/);
        expect(body).toMatch(/markOnboardingModalCard\(this\.overlay,\s*'onboarding-step'\)/);
        // ⚠ COMMIT, not dismiss: moving on to a later modal step must never lose what was typed.
        expect(body).toMatch(/commitStartupProjectNameCard\(\)/);
    });
});
