/**
 * @file apps/editor/src/ui/layout/elementAuthoringContext.ts
 *
 * §AUTHORING-CONTEXT-GATE (L-5100..L-5106) — THE ONE predicate that answers
 * "may the user create a BIM element right now?", for every layer that needs to
 * ask.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE FOUNDER'S REPORT, AND WHAT WAS ACTUALLY MEASURED
 * ═════════════════════════════════════════════════════════════════════════════
 * Verbatim: *"in the location parcel selection the user in this view clicks 'WA'
 * and activates the wall tool — which should not be the case."* His screenshot
 * shows the CEILING mode strip (`Linear · Orthogonal · … · ESC to finish`)
 * rendered across the top of the 2D parcel map at STEP 3 OF 4 of project setup.
 *
 * ⛔ C01 §6 RULE 6 — "no gate exists" is a MEASUREMENT. It was measured, and the
 * answer is ABSENT, not unreachable. There are THREE live element-creation
 * shortcut layers in this app and they had THREE DIFFERENT answers:
 *
 *   1. `BottomActionMenu._attachKeyboardShortcuts()` — the two-letter combos
 *      WA/CW/DO/WN/SL/FL/CE. Its `window.addEventListener('keydown', …)` guards
 *      were EXACTLY TWO: `e.target instanceof HTMLInputElement/HTMLTextAreaElement`
 *      and `e.ctrlKey || e.metaKey || e.altKey`. **No context gate of any kind.**
 *      `grep -n 'onboard\|Onboard' BottomActionMenu.ts` → 0 hits. THIS is the
 *      layer the founder hit.
 *   2. `CreateRailPanel._tryFireShortcut()` — the Alt+letter layer. It DOES gate,
 *      but on a DIFFERENT and weaker proposition:
 *      `this._props.bimManager.getLevels().length > 0`. "A level exists" is a
 *      proxy for "a model exists", and it is not the same question.
 *   3. `DrawingModeBar`'s own `keyHandler` — only bound while a bar is on screen,
 *      so it is gated transitively by whatever put the bar there.
 *
 * That is the hand-copied per-layer `if` this module exists to delete. One
 * predicate, asked by every layer, is the whole point — a second per-tool guard
 * would rebuild the defect one file at a time.
 *
 * ⚠ `@pryzm/keyboard-registry` DECLARES a `context?: 'editor' | 'modal' |
 * 'panel' | 'global'` field on every shortcut (`types.ts:57`). It ENFORCES
 * nothing: `grep -rn 'keyboard-registry' apps packages plugins` resolves to
 * `ShortcutCheatSheet.ts` and `creationToolShortcuts.ts`'s comment only — the
 * registry is read by the cheat-sheet UI and dispatches no key. The declared
 * `context` column is documentation, not a gate. Do not cite it as one.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHY THIS DERIVES FROM `appPhase()` AND INVENTS NO SECOND STATE MACHINE
 * ═════════════════════════════════════════════════════════════════════════════
 * `panelDefaults.AppPhase` already owns the coarse "is there a BIM canvas yet"
 * question, it is already live, and it is already the thing `phaseChrome`
 * enforces against. Measured, so the derivation is not assumed:
 *
 *   · `OnboardingStepController.start()` (:427) calls
 *     `resetAppPhaseForNewProject()` → phase is `'onboarding-globe'`.
 *   · `setAppPhase('canvas')` is reached from that controller at exactly ONE
 *     place — `dispose()` (:457), the §L-1186 bracket-closing call every exit
 *     passes through.
 *
 * So for the whole of steps 1–4, INCLUDING the parcel draw the founder was on,
 * `appPhase() === 'onboarding-globe'`. The predicate therefore has a real,
 * already-wired signal to read and needs no rival machine. C60's
 * `SiteEntryStage` (world → country → city → parcel) answers a finer, different
 * question and is deliberately NOT merged here — same reasoning as
 * `panelDefaults`' own header.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⚠ NAMED GAP — the axis this does NOT yet check (L-5106)
 * ═════════════════════════════════════════════════════════════════════════════
 * The honest scope of this predicate is PHASE, and phase alone. The 2D site map
 * and the 3D globe are ALSO reachable AFTER onboarding (the launcher rail's
 * site-view pill), and in that state `appPhase()` is `'canvas'` — so this
 * predicate returns AVAILABLE while the user looks at a MapLibre parcel surface.
 *
 * That axis is not wired because there is no owned live accessor for it to read:
 * `paneViewModel.ts` is a PURE module (its header says so) and holds no runtime
 * state, and a repo-wide grep for a live active-view accessor
 * (`activeViewType|currentViewType|getActiveView|activePaneView`) returns only
 * per-panel private fields and the plugin-SDK's async `views.getActiveView()` —
 * nothing this can synchronously ask. Half-wiring it against a guessed global
 * would be the "fake more capable than real" defect.
 *
 * It is recorded here as a NAMED GAP rather than silently counted as covered:
 * when a live pane-view store lands, {@link elementAuthoringAvailability} gains
 * a SECOND clause **in this function** — never an `if` at a call site.
 */

import { appPhase, type AppPhase } from './panelDefaults';

/**
 * Machine-readable reason code. Stable — it is what tests and callers branch on;
 * the prose in `reason` is for humans and may be reworded.
 */
export type AuthoringBlockCode =
    /** Guided project setup is still running: site not chosen, no model exists. */
    | 'project-setup';

export interface ElementAuthoringAvailability {
    /** TRUE ⇒ element-creation tools may be activated in this context. */
    readonly available: boolean;
    /** Non-null EXACTLY when `available` is false. Never a bare "not allowed". */
    readonly code: AuthoringBlockCode | null;
    /**
     * User-facing sentence saying WHY, in the founder's register. C82 §1.2 — a
     * refusal without a reason is worse than no control at all, so every caller
     * that surfaces the block has a sentence to surface and none has to invent
     * one.
     */
    readonly reason: string | null;
}

const AVAILABLE: ElementAuthoringAvailability = {
    available: true,
    code: null,
    reason: null,
};

/**
 * The blocked results, keyed by code, so the prose lives beside the code and a
 * caller can never pair one with the other's text.
 */
const BLOCKED: Readonly<Record<AuthoringBlockCode, ElementAuthoringAvailability>> = {
    'project-setup': {
        available: false,
        code: 'project-setup',
        reason:
            'Project setup is still choosing a site — there is no model to draw into yet. ' +
            'Finish setup to create walls, doors, slabs and the rest.',
    },
};

/**
 * ⭐ THE predicate. Every element-creation entry point asks THIS, and asks it at
 * the moment of the gesture — never caches the answer, because the phase flips
 * under a long-lived listener.
 *
 * `phase` is injectable for tests ONLY. Production callers pass nothing so there
 * is exactly one live source.
 */
export function elementAuthoringAvailability(
    phase: AppPhase = appPhase(),
): ElementAuthoringAvailability {
    // The guided flow owns the screen: the globe, the 2D parcel map, and the
    // setup panel. No BIM canvas exists behind any of them.
    if (phase === 'onboarding-globe') return BLOCKED['project-setup'];
    return AVAILABLE;
}

/**
 * Convenience boolean for call sites that only branch and never explain.
 *
 * ⚠ It takes `phase?` and FORWARDS it rather than defaulting to `appPhase()`
 * itself. That is deliberate: a second `= appPhase()` here would be a second
 * live read of the phase inside the one module that exists to have exactly one,
 * and the two could drift the day a caching layer is added. One reader, in
 * {@link elementAuthoringAvailability}, asserted by the spec.
 */
export function isElementAuthoringAvailable(phase?: AppPhase): boolean {
    return elementAuthoringAvailability(phase).available;
}

/**
 * Log-and-refuse helper for the shortcut layers.
 *
 * It exists so the two live layers do not each hand-write a `console.info` and
 * drift in wording — and so a refusal is VISIBLE in the console rather than
 * being a silent no-op the next reporter has to guess at. Returns `true` when
 * the caller should STOP.
 */
export function refuseElementAuthoring(source: string): boolean {
    const verdict = elementAuthoringAvailability();
    if (verdict.available) return false;
    console.info(
        `[authoring-context] ${source} refused — ${verdict.code}: ${verdict.reason}`,
    );
    return true;
}
