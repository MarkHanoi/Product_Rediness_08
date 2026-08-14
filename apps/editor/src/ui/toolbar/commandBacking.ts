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

/**
 * C82 §1.3 — the reason must name the MISSING CAPABILITY, not merely the
 * refusal. "Unavailable" tells the user nothing they could act on; the row in
 * SPEC-50 (the ribbon handler backlog) says what has to be built. This map
 * carries each surface's SPEC-50 section, keyed by its `*_TOOLBAR_ID`.
 *
 * Several surfaces share a section — SPEC-50 groups them where the missing
 * capability is the same (sheets/sheet-sets/print all wait on the sheet
 * pipeline). That is SPEC-50's grouping, reproduced, not a simplification here.
 *
 * `__tests__/commandBacking.spec.ts` asserts every section cited below actually
 * exists as a heading in SPEC-50.md, so a renumbering upstream fails loudly
 * instead of leaving 276 buttons pointing at a row that no longer exists.
 */
const SPEC50_SECTION: Readonly<Record<string, string>> = {
    'main-toolbar': 'A.1',
    'drawing-toolbar': 'A.2',
    'room-toolbar': 'A.3',
    'view-toolbar': 'A.4',
    'plan-toolbar': 'A.5',
    'section-toolbar': 'A.6',
    'elevation-toolbar': 'A.6',
    'ifc-inspector-toolbar': 'A.7',
    'ifc-filter-toolbar': 'A.7',
    'dimension-toolbar': 'A.8',
    'annotation-toolbar': 'A.9',
    'sheet-toolbar': 'A.10',
    'sheet-sets-toolbar': 'A.10',
    'print-setup-toolbar': 'A.10',
    'schedule-toolbar': 'A.11',
    'quantity-toolbar': 'A.11',
    'family-toolbar': 'A.12',
    'bcf-toolbar': 'A.13',
    'edit-toolbar': 'A.14',
    'clash-detection-toolbar': 'B.1',
    'coordination-toolbar': 'B.2',
    'analysis-toolbar': 'B.3',
    'cde-toolbar': 'C.1',
    'model-management-toolbar': 'C.2',
    'layer-toolbar': 'C.3',
    'color-toolbar': 'C.4',
    'text-toolbar': 'C.5',
    'area-toolbar': 'C.6',
    'plugin-manager-toolbar': 'C.7',
    'settings-toolbar': 'C.8',
};

/** The 30 surface ids this module knows a SPEC-50 row for. Exported so the spec
 *  can pin it against the toolbar directory — a surface added without a row
 *  would otherwise refuse with a weaker reason and nobody would notice. */
export const SPEC50_SURFACE_IDS: readonly string[] = Object.keys(SPEC50_SECTION);

/**
 * The reason shown to the user on an unbacked button. Names the verb AND the
 * SPEC-50 row that owns the missing capability (C82 §1.3). A refusal that does
 * not say what was refused is barely better than silence; one that does not say
 * what is missing leaves the user with nowhere to go.
 *
 * `surfaceId` is optional only so a caller that has not been threaded yet
 * degrades to the verb-named form rather than throwing — but every one of the
 * 30 surfaces passes it, and the spec pins that.
 */
export function unbackedReason(commandType: string, surfaceId?: string): string {
    const section = surfaceId !== undefined ? SPEC50_SECTION[surfaceId] : undefined;
    const where = section !== undefined
        ? ` The missing capability is tracked in SPEC-50 §${section}.`
        : '';
    return `Unavailable — "${commandType}" has no registered handler in this build.`
        + where
        + ' The button is shown disabled rather than silently doing nothing (C82 §1.1).';
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
export function refuseUnbacked(commandType: string, surfaceId?: string): boolean {
    if (isBacked(commandType)) return false;
    console.warn(`[toolbar] REFUSED "${commandType}" — ${unbackedReason(commandType, surfaceId)}`);
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
export function applyCommandBacking(
    btn: HTMLButtonElement,
    commandType: string,
    surfaceId?: string,
): void {
    if (isBacked(commandType)) {
        btn.setAttribute('data-backed', '1');
        return;
    }
    btn.disabled = true;
    btn.setAttribute('data-unbacked', '1');
    btn.setAttribute('aria-disabled', 'true');
    btn.title = unbackedReason(commandType, surfaceId);
    btn.style.opacity = '0.42';
    btn.style.cursor = 'not-allowed';
}
