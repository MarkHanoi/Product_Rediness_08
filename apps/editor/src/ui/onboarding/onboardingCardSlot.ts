/**
 * onboardingCardSlot.ts — §ONE-CARD-AT-A-TIME (L-13130, founder screenshot of the LIVE build,
 * 2026-09-07).
 *
 * ⛔ THE DEFECT THIS MODULE EXISTS FOR. The founder's screenshot shows TWO onboarding cards on
 * screen at once: the new *"Name your project"* card (§STARTUP-NAME-CARD, `24135434`) and, on top
 * of it and partly covering its confirm button, the older *"Where is your project?"* card — still
 * holding his typed query, still showing *"Found: Barcelona, …"*, still offering a live
 * *"Skip — no location"* button, several seconds AFTER the location had been accepted.
 *
 * ⭐ THE ROOT CAUSE WAS NOT A RACE, AND THAT IS THE POINT OF THIS FILE. Nothing owned the location
 * card's dismissal. `OnboardingStepController.leaveLocationStep()` is named as though it did, but
 * it disposes the GLOBE HERO only; the card's DOM was replaced later, by the next step's own
 * `clearBody()`, which sits AFTER `await this.revealInFlight` — i.e. after the entire ~18 s reveal
 * that the name card exists to cover. The two cards therefore overlapped for exactly the window
 * the name card occupies, deterministically, on every run.
 *
 * ⛔ SO THE FIX MUST NOT BE A TIMER OR A Z-INDEX. A `setTimeout` would leave the same missing
 * hand-off with a delay bolted on, and a z-index bump would leave a live, clickable
 * *"Skip — no location"* button under a card asking a different question. This repo has a
 * documented history of exactly that class of "fix" (§THREE-INVALIDATION-GATES-IN-SERIES,
 * §UNSATISFIABLE-GATE). What was missing is a TRANSITION, so this module is one:
 * {@link handOffOnboardingModalCard} retires the outgoing card and raises the incoming one inside
 * a single synchronous body, with the slot ENFORCING emptiness between the two — so the ordering
 * is a property of the call, not of the clock.
 *
 * ⭐ WHAT "ONE CARD" MEANS, EXACTLY — MODAL CARDS, NOT EVERY ONBOARDING SURFACE. The onboarding
 * overlay has two presentations and they are already distinguished in code
 * (`setDrawingPresentation`): a MODAL card (centred, `role="dialog"`, a full-viewport scrim in its
 * own box-shadow) and a NON-MODAL docked banner (`role="region"`, pointer events fall through to
 * the map). The banner and the confirm pill are DESIGNED to coexist with a live surface, and the
 * name card is deliberately never auto-dismissed when the load wins the race (the split reveals
 * BEHIND it). ⇒ the invariant is *at most one MODAL onboarding card is visible at a time*, carried
 * by an explicit attribute rather than by re-reading `role`, which is doing accessibility work and
 * must not quietly acquire a second meaning.
 *
 * P3 — no `requestAnimationFrame`, no timer, no polling: there is nothing here to schedule.
 * P4 — no `(window as any)`; `document` only. P8 — every exported function carries an OTel span.
 */

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.onboarding.card-slot');

/**
 * The marker for "this element is a MODAL onboarding card". Its VALUE is the card's id, used in
 * the log lines so a violation names both parties rather than reporting a count.
 *
 * ⚠ An element carrying this attribute is only IN the slot while it is actually on screen — the
 * `hidden` attribute (which `onboardingStyles.ts` backs with `display: none !important`, because
 * the UA rule alone loses to the overlay's own `display: flex`) takes it out of the slot without
 * destroying the shell that later steps re-use.
 */
export const ONBOARDING_MODAL_CARD_ATTR = 'data-onboarding-modal-card';

/** Mark `el` as the modal onboarding card `id`. Idempotent. */
export function markOnboardingModalCard(el: Element | null | undefined, id: string): void {
    const span = _tracer.startSpan('pryzm.onboarding.card-slot.mark');
    try {
        el?.setAttribute(ONBOARDING_MODAL_CARD_ATTR, id);
    } catch {
        /* presentation only */
    } finally {
        span.end();
    }
}

/**
 * Take `el` OUT of the modal slot without hiding it — the onboarding overlay does this when it
 * switches to its docked, non-blocking banner presentation, which is explicitly allowed to share
 * the screen with the name card.
 */
export function unmarkOnboardingModalCard(el: Element | null | undefined): void {
    const span = _tracer.startSpan('pryzm.onboarding.card-slot.unmark');
    try {
        el?.removeAttribute(ONBOARDING_MODAL_CARD_ATTR);
    } catch {
        /* presentation only */
    } finally {
        span.end();
    }
}

/** True when neither `el` nor any ancestor carries the `hidden` attribute. */
function isOnScreen(el: Element): boolean {
    let node: Element | null = el;
    while (node) {
        if (node.hasAttribute('hidden')) return false;
        node = node.parentElement;
    }
    return true;
}

/** Every modal onboarding card element currently ON SCREEN, in document order. */
function onScreenModalCardElements(): HTMLElement[] {
    if (typeof document === 'undefined') return [];
    return Array.from(
        document.querySelectorAll<HTMLElement>(`[${ONBOARDING_MODAL_CARD_ATTR}]`),
    ).filter(isOnScreen);
}

/**
 * The ids of every modal onboarding card currently on screen, in document order.
 *
 * ⭐ THIS IS THE INVARIANT, EXPRESSED AS A VALUE A SPEC CAN READ. `length <= 1` at every point of
 * the location → name → split transition is what the founder's screenshot violates, and asserting
 * it against the real DOM is the only form of that claim that can go red.
 */
export function visibleOnboardingModalCards(): string[] {
    const span = _tracer.startSpan('pryzm.onboarding.card-slot.visible');
    try {
        return onScreenModalCardElements()
            .map((el) => el.getAttribute(ONBOARDING_MODAL_CARD_ATTR) ?? '')
            .filter((id) => id !== '');
    } catch {
        return [];
    } finally {
        span.end();
    }
}

export interface OnboardingModalCardHandOff {
    /** The card being retired. Used in the log lines; the retirement itself is `retire`'s job. */
    readonly from: string;
    /**
     * The card being raised, or `null` when the slot is deliberately left EMPTY — a legitimate
     * outcome (an address with no usable place name raises no name card, and the loading overlay
     * owns the screen from there).
     */
    readonly to: string | null;
    /** Take the outgoing card down. Runs FIRST, synchronously. Must not throw; a throw is caught. */
    readonly retire: () => void;
    /** Raise the incoming card. Runs only after the slot has been proven empty. */
    readonly raise: () => void;
}

export interface OnboardingModalCardHandOffResult {
    /**
     * Cards the slot had to retire ITSELF because `retire` left them standing. ⛔ NON-EMPTY IS A
     * BUG — it means a hand-off's own teardown is wrong — and it is reported rather than papered
     * over, but it is still ENFORCED, so a wrong `retire` degrades to a log line instead of to the
     * two-cards-on-screen defect.
     */
    readonly swept: string[];
    /** The slot's contents after the raise. The invariant is `length <= 1`. */
    readonly mounted: string[];
}

/**
 * ⭐ THE TRANSITION. Retire the outgoing modal card and raise the incoming one as ONE step.
 *
 * ⛔ RETURNS A PLAIN OBJECT, NEVER A PROMISE, AND TAKES NO CALLBACK IT DEFERS. The card this was
 * written for is a TIME-BUYER whose entire value depends on the load already running behind it
 * (§STARTUP-NAME-CARD, `startupProjectNameCardIsNonGating`), so nothing here may be awaitable and
 * nothing here may be scheduled: `retire()` and `raise()` both run before this function returns,
 * on the caller's own stack.
 *
 * The ordering guarantee is structural, in three parts:
 *   1. `retire()` runs first — a statement, not a race.
 *   2. the slot then ENFORCES its own emptiness: anything still on screen and marked is hidden
 *      here, because the guarantee must not depend on every future `retire` being correct;
 *   3. only then does `raise()` run, so the incoming card cannot be mounted beside the outgoing
 *      one under any ordering of the callbacks.
 */
export function handOffOnboardingModalCard(
    h: OnboardingModalCardHandOff,
): OnboardingModalCardHandOffResult {
    const span = _tracer.startSpan('pryzm.onboarding.card-slot.hand-off');
    try {
        // 1 — RETIRE FIRST. Never fatal: a hand-off that throws on the way out would strand the
        // user on the card it was supposed to remove, which is the defect, not a report of it.
        try {
            h.retire();
        } catch (e) {
            console.warn(`[onboarding-card-slot] retire("${h.from}") threw (non-fatal):`, e);
        }

        // 2 — THE SLOT ENFORCES ITSELF.
        const swept: string[] = [];
        for (const el of onScreenModalCardElements()) {
            const id = el.getAttribute(ONBOARDING_MODAL_CARD_ATTR) ?? '';
            if (h.to !== null && id === h.to) continue; // the incoming card, already up: not a leftover
            swept.push(id);
            try {
                el.hidden = true;
            } catch {
                /* presentation only */
            }
            console.error(
                `[onboarding-card-slot] ⛔ §ONE-CARD-AT-A-TIME: "${id}" was still on screen when `
                + `"${h.to ?? '(none)'}" was raised — the hand-off's own retire did not clear it. `
                + 'Hidden here so the two cards cannot overlap, but the retire is what is wrong.',
            );
        }

        // 3 — RAISE INTO AN EMPTY SLOT.
        try {
            h.raise();
        } catch (e) {
            console.warn(`[onboarding-card-slot] raise("${h.to ?? '(none)'}") threw (non-fatal):`, e);
        }

        const mounted = visibleOnboardingModalCards();
        if (mounted.length > 1) {
            // Reachable only if `raise` mounted a SECOND marked card itself. Reported, never
            // silently tolerated — this is the exact state the founder photographed.
            console.error(
                `[onboarding-card-slot] ⛔ §ONE-CARD-AT-A-TIME VIOLATED after the hand-off `
                + `"${h.from}" → "${h.to ?? '(none)'}": ${mounted.length} modal cards on screen `
                + `(${mounted.join(', ')}).`,
            );
        } else {
            console.log(
                `[onboarding-card-slot] §ONE-CARD-AT-A-TIME: "${h.from}" → `
                + `"${h.to ?? '(none)'}" — slot now holds [${mounted.join(', ')}].`,
            );
        }
        return { swept, mounted };
    } finally {
        span.end();
    }
}
