/**
 * commandBacking — §L-MOUNT PHASE 3: the toolbar family must REFUSE, not no-op.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────────────────────────────────────────────────────────────
 * The 30 surfaces in this directory declare 280 gesture→command pairs. The H6
 * probe (`tools/rac-conformance/gesture-reach/`) and the Phase-1 backing census
 * (`.../results/verb-census.json`) measured, independently and agreeing, that
 * exactly FOUR of those 280 verbs have a production CommandHandler:
 *
 *     zoom-fit, zoom-selected      apps/editor/src/engine/engineLauncher.ts §C-B1
 *     copy-selection,              plugins/selection/src/handlers/*,
 *     paste-clipboard              registered at engineLauncher §FIX-COPY-PASTE
 *
 * The other 276 dispatch into nothing. Every one of the 280 buttons was
 * nevertheless authored to dispatch unconditionally. While the surfaces were
 * unmounted that was invisible; the moment any of them is mounted it becomes
 * the §C-B1 defect at 276× — "The MainToolbar buttons dispatched these bus
 * commands, but no handler was registered anywhere → every click was a silent
 * no-op". **A button that appears and does nothing is a lie the user can
 * click.** §10.2: PRYZM must say what it knows.
 *
 * WHAT THIS MODULE DOES
 * A button whose verb is not BACKED renders `disabled`, `aria-disabled`, and
 * carries `data-unbacked="1"` plus a title that NAMES the reason. It cannot be
 * clicked, so it cannot dispatch, so it cannot no-op. It is visible and it is
 * honest about being unavailable.
 *
 * WHAT THIS MODULE DOES **NOT** CLAIM
 *  • It does not prove a BACKED verb's handler is registered on the bus the
 *    surface dispatches to at click time — the handler exists in production
 *    source; H6 re-run is the executed arm. `zoom-fit`/`zoom-selected`/
 *    `copy-selection`/`paste-clipboard` register LATE in engineLauncher, after
 *    the composition root, so a surface mounted before that boot step would
 *    still find no handler.
 *  • It does not make any unbacked verb work. Inventing handlers to light
 *    buttons up is a different, much larger piece of work and is deliberately
 *    NOT done here.
 *  • It says nothing about handler-write CORRECTNESS (check-verb-liveness).
 *
 * KEEPING THE SET HONEST: `__tests__/commandBacking.spec.ts` pins this set
 * against the generated census JSON. If a handler is added or removed, the
 * census is regenerated (`npx tsx tools/rac-conformance/gesture-reach/build-census.ts`)
 * and the pin fails until this set is corrected. The set is never edited to go
 * green — it is edited to match a measurement.
 */

/**
 * The verbs declared by a toolbar surface for which a production CommandHandler
 * was MEASURED to exist. Source of truth:
 * `tools/rac-conformance/gesture-reach/results/verb-census.json` → rows where
 * `backing === 'BACKED'`. Do not extend by hand.
 */
export const BACKED_TOOLBAR_VERBS: ReadonlySet<string> = new Set([
    'copy-selection',
    'paste-clipboard',
    'zoom-fit',
    'zoom-selected',
]);

/** The reason shown to the user on an unbacked button. Names the verb — a
 *  refusal that does not say WHAT was refused is barely better than silence. */
export function unbackedReason(commandType: string): string {
    return `Unavailable — "${commandType}" has no registered handler in this build. `
        + 'The button is shown disabled rather than silently doing nothing (§L-MOUNT Phase 3).';
}

/** True when a gesture wired to this verb reaches real production code. */
export function isBacked(commandType: string): boolean {
    return BACKED_TOOLBAR_VERBS.has(commandType);
}

/**
 * The DISPATCH-side arm of the refusal. `disabled` stops the mouse; it does not
 * stop `triggerCommand()` — the public programmatic entry point every surface
 * exposes for keyboard shortcuts — nor any future caller. Both doors must
 * refuse or the lie simply moves.
 *
 * Returns true when the dispatch MUST NOT happen; the caller returns early.
 * Never throws: a refusal is an answer, not a crash.
 */
export function refuseUnbacked(commandType: string): boolean {
    if (isBacked(commandType)) return false;
    console.warn(`[toolbar] REFUSED "${commandType}" — ${unbackedReason(commandType)}`);
    return true;
}

/**
 * Apply the backing state to a freshly-built toolbar button.
 *
 * Call immediately after `btn.setAttribute('data-command', def.commandType)`,
 * BEFORE the click listener is attached — the listener is left in place either
 * way; `disabled` is what prevents the dispatch, so the dispatch path stays a
 * single code path and there is no second, divergent "refusing" dispatcher.
 */
export function applyCommandBacking(btn: HTMLButtonElement, commandType: string): void {
    if (isBacked(commandType)) {
        btn.setAttribute('data-backed', '1');
        return;
    }
    btn.disabled = true;
    btn.setAttribute('data-unbacked', '1');
    btn.setAttribute('aria-disabled', 'true');
    btn.title = unbackedReason(commandType);
    btn.style.opacity = '0.42';
    btn.style.cursor = 'not-allowed';
}
