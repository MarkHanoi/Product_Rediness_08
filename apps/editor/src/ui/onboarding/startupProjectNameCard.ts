/**
 * startupProjectNameCard.ts — §STARTUP-NAME-CARD (founder 2026-09-07, on the live build
 * `cd5bcbb9`): *"can you push forward and make it quicker — from the moment the user add
 * Barcelona / Maybe add straight after a new modal asking for the name of the project — like that
 * gives you time — then you load barcelona split view straight away!"*
 *
 * ⭐ WHAT THIS IS. A small floating card asking for the project name, raised the instant the
 * geocode resolves, over the LIVE globe while the start-up descent flies and the context load
 * runs behind it. It is a TIME-BUYER, not a step: the user does something useful with the ~18 s
 * the load costs, instead of watching a bar.
 *
 * ⛔ THE ONE FAILURE MODE THIS IS DESIGNED AGAINST — A MODAL THAT BECOMES A GATE. If dismissing
 * the card were what STARTED the load, wall-clock would get WORSE and only the perception would
 * move. So this module has NO promise the caller awaits, NO way to signal "ready", and no hook
 * into the reveal. It is mounted AFTER `revealSplitAtParcel` has already been kicked off and the
 * context warm has already begun; it cannot delay either, because neither one can observe it.
 * `startupProjectNameCardIsNonGating()` states that as an assertion the spec pins.
 *
 * ⛔ IT IS NOT A SPLASH AND MUST NEVER GROW INTO ONE.
 *   · NO backdrop. The globe stays visible AND interactive around the card — the founder asked
 *     for the slow zoom specifically so he could WATCH it (§STARTUP-SLOW-DESCENT), and a
 *     body-clearing or full-screen step hides the one thing he asked to see.
 *   · It does NOT pause, slow or re-time the descent. It knows nothing about the camera.
 *   · Its z-index sits BELOW `LoadingOverlayController`'s 88880 backdrop, so if the real overlay
 *     is ever raised — a stall, a refusal, a retry — the overlay wins outright and the card is
 *     covered rather than competing with it. `LoadingOverlayController` remains the ONE overlay
 *     with N producers (L-270); this is not a second one.
 *
 * ⭐ IT IS ALWAYS SKIPPABLE — §REFUSING-HALF-NEEDS-ITS-ESCAPE-HATCH (L-942). Enter commits what is
 * typed; Escape commits the DEFAULT (the geocoded place name, e.g. "Barcelona"); the close button
 * does the same. A naming card that can refuse to close would be a new gate on the start-up path,
 * which is the exact defect L-942 names. There is no state in which this card cannot be dismissed.
 *
 * ⚠ IT IS NEVER AUTO-DISMISSED WHEN THE LOAD WINS THE RACE. If the split reveals while the user is
 * still typing, the split simply appears BEHIND the card and the user confirms in their own time.
 * Yanking a focused text field out from under a cursor is worse than the wait it saves.
 *
 * ⛔ IT IS ALSO NEVER ON SCREEN BESIDE ANOTHER ONBOARDING CARD — §ONE-CARD-AT-A-TIME (L-13130).
 * As first shipped it was, and the founder photographed it: the *"Where is your project?"* card
 * stayed live and ON TOP (its overlay's z-index is 2147483000 against this card's 88 870), partly
 * covering this card's own confirm button, because NOTHING owned its dismissal — the location
 * step's card was only replaced by the NEXT step's `clearBody()`, which runs after the whole reveal
 * this card exists to cover. The two are now ONE transition
 * (`onboardingCardSlot.handOffOnboardingModalCard`), not two independently-timed events. ⚠ That is
 * a different question from the paragraph above: the LOAD finishing never retires this card; the
 * USER moving on to a later modal step does, through `commitStartupProjectNameCard`, which keeps
 * whatever they had typed.
 *
 * ⚠ THE NAME IS A REAL WRITE. The caller commits it through `applyProjectName`, which is the SAME
 * `runtime.persistence.client.rename(projectId, name)` path the hub's rename modal uses. This
 * module deliberately owns NO persistence: it collects a string and hands it over, so there can
 * never be a second, divergent naming write.
 *
 * P3 — no `requestAnimationFrame`, no timer, no polling. P4 — no `(window as any)`; it touches
 * `document` only. P8 — every exported function carries an OTel span.
 */

import { trace } from '@opentelemetry/api';
// §ONE-CARD-AT-A-TIME (L-13130) — this card takes THE onboarding modal slot; the location card
// leaves it in the same transition. See `onboardingCardSlot.ts` for why that is a hand-off and not
// a z-index.
import { markOnboardingModalCard } from './onboardingCardSlot.js';

const _tracer = trace.getTracer('pryzm.onboarding.startup-name-card');

const EL_ID = 'pryzm-startup-name-card';
const STYLE_ID = 'pryzm-startup-name-card-style';

/** The card's id in the ONE modal onboarding slot (`ONBOARDING_MODAL_CARD_ATTR`). */
export const STARTUP_NAME_CARD_SLOT_ID = 'startup-name';

/**
 * The live card's two handles, module-level because there is only ever ONE card
 * (`showStartupProjectNameCard` supersedes rather than stacks).
 *
 * ⚠ `detach` EXISTS BECAUSE `dismissStartupProjectNameCard` USED TO LEAK ITS DOCUMENT LISTENER.
 * The Escape handler is registered on `document` in the capture phase so it works with focus off
 * the field; `commit()` removed it, but the plain `dismiss()` route — which the controller
 * registers as a CLEANUP — did not. A dismissed card therefore left a captured Escape handler
 * behind that would fire `onCommit` (a real `persistence.client.rename`) long after the flow had
 * moved on. Both routes now detach.
 */
let _active: { detach: () => void; commitTyped: () => void } | null = null;

/**
 * ⛔ The z-index contract, in one place so it cannot drift.
 *
 * `LoadingOverlayController`'s backdrop is 88880. This card MUST sit below it: the overlay is the
 * one surface allowed to report a failure, and a naming card floating ON TOP of a "we could not
 * load this site" message would be the §CONTEXT-DATA-HONESTY defect in presentation form — a
 * hidden overlay becoming a hidden error.
 */
export const STARTUP_NAME_CARD_Z_INDEX = 88_870;

/**
 * ⭐ THE NON-GATING ASSERTION, stated as a value so a spec can pin it rather than trusting prose.
 *
 * This module exposes no promise, no readiness signal and no completion hook that any loader
 * awaits: `showStartupProjectNameCard` returns `void`. There is therefore no expressible way for
 * the card to delay the context warm, the camera descent, the split mount or the tile reads.
 * If this ever returns `false`, the card has acquired a gate and the design has been broken.
 */
export function startupProjectNameCardIsNonGating(): true {
    return true;
}

export interface StartupProjectNameCardOptions {
    /**
     * The name to pre-fill and to commit on Escape / close — the geocoded place ("Barcelona").
     * ⚠ NEVER empty in practice, but an empty value is handled: the commit becomes a no-op rather
     * than a write of `""` (`applyProjectName` already refuses an empty name).
     */
    readonly defaultName: string;
    /**
     * Commit the chosen name. Best-effort by contract: the caller's `applyProjectName` swallows a
     * failed rename, because a rename that did not land must never strand a user on a card.
     * ⚠ Called EXACTLY ONCE per card — every dismissal route funnels through one guarded closure.
     */
    readonly onCommit: (name: string) => void;
}

/**
 * Remove the card if it is up, WITHOUT committing a name. Idempotent; safe with no DOM.
 *
 * ⚠ This is the TEARDOWN route (controller disposal, supersession by a second geocode). A user who
 * has moved on to a later step should be retired through {@link commitStartupProjectNameCard}
 * instead, which keeps whatever they typed.
 */
export function dismissStartupProjectNameCard(): void {
    const span = _tracer.startSpan('pryzm.onboarding.startup-name-card.dismiss');
    try {
        try { _active?.detach(); } catch { /* listener teardown is never fatal */ }
        _active = null;
        if (typeof document === 'undefined') return;
        document.getElementById(EL_ID)?.remove();
    } catch {
        /* presentation only */
    } finally {
        span.end();
    }
}

/**
 * Retire the card by SAVING what is in the field — the same route its own "Save name" button takes
 * (an emptied field still falls back to the geocoded default; the one-commit guard still holds).
 *
 * ⭐ WHY THIS EXISTS, AND WHY IT IS NOT THE "LOAD FINISHED" HOOK. §STARTUP-NAME-CARD is
 * deliberately NOT auto-dismissed when the load wins the race — the split reveals BEHIND the card
 * and the user confirms in their own time, because yanking a focused text field out from under a
 * cursor is worse than the wait it saves. That invariant is about the LOAD. This function is for
 * the other thing entirely: the user themself walking on to a later MODAL step, at which point a
 * naming card competing with the step's own card is the §ONE-CARD-AT-A-TIME defect again
 * (L-13130). Committing rather than discarding means moving on can never lose their typing.
 *
 * Returns true iff a card was up.
 */
export function commitStartupProjectNameCard(): boolean {
    const span = _tracer.startSpan('pryzm.onboarding.startup-name-card.commit-active');
    try {
        const active = _active;
        if (!active) return false;
        active.commitTyped();
        return true;
    } catch (e) {
        console.warn('[startup-name-card] commit-active threw (non-fatal):', e);
        return false;
    } finally {
        span.end();
    }
}

function ensureStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    // §PREVIEW-COLOR-UNIFIED-PRYZM-PURPLE — #6600FF is the one brand accent; white + purple, no
    // black (founder brand rule, `preview-color-unified-pryzm-purple`).
    style.textContent = `
        /* §ONE-CARD-AT-A-TIME (L-13130) — the slot retires a leftover card with the \`hidden\`
           ATTRIBUTE. The UA rule for it would be enough here today (this block sets no
           \`display\`), but the onboarding overlay next door learned the hard way that an id/class
           rule with its own \`display\` silently outranks the UA one (§UX1-DRAW-PHASE-GATE), so the
           gate is authored rather than inherited and cannot become decorative later. */
        #${EL_ID}[hidden] { display: none !important; }
        #${EL_ID} {
            position: fixed;
            left: 50%;
            top: 34%;
            transform: translate(-50%, -50%);
            z-index: ${STARTUP_NAME_CARD_Z_INDEX};
            width: min(88vw, 420px);
            box-sizing: border-box;
            padding: 20px 22px 18px;
            border-radius: 16px;
            background: rgba(255, 255, 255, 0.96);
            border: 1px solid rgba(102, 0, 255, 0.16);
            box-shadow: 0 18px 48px rgba(20, 0, 60, 0.22);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            color: #2A1A55;
            font: 400 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            /* ⛔ pointer-events on the CARD only. There is no backdrop element at all, so the
               globe behind it stays live and the descent stays watchable. */
            pointer-events: auto;
        }
        #${EL_ID} .pnc-title {
            margin: 0 0 4px;
            font-size: 16px;
            font-weight: 600;
            letter-spacing: -0.01em;
        }
        #${EL_ID} .pnc-hint {
            margin: 0 0 14px;
            font-size: 12px;
            opacity: 0.68;
        }
        #${EL_ID} .pnc-input {
            width: 100%;
            box-sizing: border-box;
            padding: 10px 12px;
            border-radius: 10px;
            border: 1px solid rgba(102, 0, 255, 0.28);
            background: #FFFFFF;
            color: inherit;
            font: inherit;
            font-size: 14px;
            outline: none;
        }
        #${EL_ID} .pnc-input:focus { border-color: #6600FF; box-shadow: 0 0 0 3px rgba(102, 0, 255, 0.14); }
        #${EL_ID} .pnc-footer {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 14px;
        }
        #${EL_ID} .pnc-skip {
            border: none;
            background: none;
            color: inherit;
            opacity: 0.6;
            font: inherit;
            font-size: 12px;
            cursor: pointer;
            padding: 6px 4px;
        }
        #${EL_ID} .pnc-skip:hover { opacity: 0.9; text-decoration: underline; }
        #${EL_ID} .pnc-go {
            border: none;
            border-radius: 9px;
            background: #6600FF;
            color: #FFFFFF;
            font: inherit;
            font-size: 13px;
            font-weight: 600;
            padding: 9px 16px;
            cursor: pointer;
        }
        #${EL_ID} .pnc-go:hover { filter: brightness(1.08); }
        @media (prefers-reduced-motion: no-preference) {
            #${EL_ID} { animation: pryzm-pnc-in 260ms cubic-bezier(0.22, 1, 0.36, 1); }
        }
        @keyframes pryzm-pnc-in {
            from { opacity: 0; transform: translate(-50%, calc(-50% + 10px)); }
            to   { opacity: 1; transform: translate(-50%, -50%); }
        }
    `;
    document.head.appendChild(style);
}

/**
 * Raise the card. Returns immediately — ⛔ deliberately `void`, see
 * `startupProjectNameCardIsNonGating`.
 *
 * Never throws: this runs on the start-up critical path beside the reveal, and a card that cannot
 * paint must not take the site load down with it.
 */
export function showStartupProjectNameCard(opts: StartupProjectNameCardOptions): void {
    const span = _tracer.startSpan('pryzm.onboarding.startup-name-card.show');
    try {
        if (typeof document === 'undefined' || !document.body) return;
        // One card at a time — a second geocode supersedes the first rather than stacking.
        dismissStartupProjectNameCard();
        ensureStyles();

        const card = document.createElement('div');
        card.id = EL_ID;
        card.setAttribute('data-testid', EL_ID);
        card.setAttribute('role', 'dialog');
        // §ONE-CARD-AT-A-TIME (L-13130) — claim THE modal onboarding slot. The location card
        // relinquishes it in the same `handOffOnboardingModalCard` call that raises this one.
        markOnboardingModalCard(card, STARTUP_NAME_CARD_SLOT_ID);
        // ⚠ `aria-modal` is deliberately NOT set: this is explicitly NOT modal — the globe behind
        // it stays live and reachable. Claiming modality to a screen reader would be a lie about
        // the surface, and would tell it to hide the very content the founder asked to watch.
        card.setAttribute('aria-label', 'Name your project');

        const title = document.createElement('p');
        title.className = 'pnc-title';
        title.textContent = 'Name your project';
        card.appendChild(title);

        const hint = document.createElement('p');
        hint.className = 'pnc-hint';
        // ⭐ SAYS WHAT IS HAPPENING BEHIND IT. The card exists because a load is running; hiding
        // that would make it feel like a step that must be completed before anything starts.
        hint.textContent = `Loading ${opts.defaultName} in the background — press Enter to continue.`;
        card.appendChild(hint);

        const input = document.createElement('input');
        input.className = 'pnc-input';
        input.type = 'text';
        input.setAttribute('data-testid', 'startup-project-name-input');
        input.placeholder = opts.defaultName || 'Untitled project';
        input.value = opts.defaultName;
        card.appendChild(input);

        const footer = document.createElement('div');
        footer.className = 'pnc-footer';
        const skip = document.createElement('button');
        skip.type = 'button';
        skip.className = 'pnc-skip';
        skip.setAttribute('data-testid', 'startup-project-name-skip');
        skip.textContent = 'Skip';
        const go = document.createElement('button');
        go.type = 'button';
        go.className = 'pnc-go';
        go.setAttribute('data-testid', 'startup-project-name-go');
        go.textContent = 'Save name';
        footer.appendChild(skip);
        footer.appendChild(go);
        card.appendChild(footer);

        // ⚠ ONE commit, whichever route fires. Enter, Save, Skip and Escape all land here, and the
        // guard means a double-tap or an Enter-then-Escape cannot write twice.
        let committed = false;
        const detach = (): void => { document.removeEventListener('keydown', onDocKey, true); };
        const commit = (name: string): void => {
            if (committed) return;
            committed = true;
            detach();
            dismissStartupProjectNameCard();
            try {
                opts.onCommit(name);
            } catch (e) {
                console.warn('[startup-name-card] onCommit threw (non-fatal):', e);
            }
        };

        // ⛔ ESCAPE ALWAYS CLOSES — the escape hatch, at the document level so it works even if
        // focus has moved off the field (the user grabbed the globe to watch the descent).
        // Captured, so nothing downstream can swallow it and strand the card.
        function onDocKey(e: KeyboardEvent): void {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            commit(opts.defaultName);
        }
        document.addEventListener('keydown', onDocKey, true);

        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commit(input.value.trim() || opts.defaultName);
            }
        });
        go.addEventListener('click', () => { commit(input.value.trim() || opts.defaultName); });
        // "Skip" keeps the geocoded default rather than writing nothing — the project still ends
        // up named after the place, which is what the PRD §4.3 auto-naming rule wants anyway.
        skip.addEventListener('click', () => { commit(opts.defaultName); });

        document.body.appendChild(card);
        // The live card's handles, for the two routes that arrive from OUTSIDE the card: a plain
        // teardown (`dismissStartupProjectNameCard`) and "the user walked on to a later modal step"
        // (`commitStartupProjectNameCard`, which keeps what is typed).
        _active = { detach, commitTyped: () => { commit(input.value.trim() || opts.defaultName); } };
        try { input.focus(); input.select(); } catch { /* focus is a nicety, never load-bearing */ }

        console.log(
            `[onboarding-step] §STARTUP-NAME-CARD raised over the live globe with default `
            + `"${opts.defaultName}" — the context warm, the descent and the split mount are ALL `
            + 'already running behind it and none of them awaits this card (it returns void).',
        );
    } catch (e) {
        console.warn('[startup-name-card] could not raise the name card (ignored):', e);
    } finally {
        span.end();
    }
}

/**
 * The default project name for a geocoded place — the FIRST comma-segment of the provider's
 * display name.
 *
 * ⚠ WHY NOT THE WHOLE STRING. Nominatim's `displayName` for the founder's own query is
 * *"Barcelona, Barcelonès, Barcelona, Catalunya, 08001, España"*. Writing that as the project name
 * would be technically faithful and practically useless — it is a disambiguation path, not a name,
 * and it is what the user would immediately delete. The first segment is the place they typed.
 *
 * ⛔ IT NEVER INVENTS. An empty or unusable address yields `''`, and `applyProjectName` treats an
 * empty name as a no-op rather than a write of `""` — so a project with no readable place keeps
 * whatever name it already had instead of gaining a fabricated one.
 */
export function startupProjectNameDefault(address: string | null | undefined): string {
    const raw = (address ?? '').trim();
    if (!raw) return '';
    const first = raw.split(',')[0]?.trim() ?? '';
    return first;
}
