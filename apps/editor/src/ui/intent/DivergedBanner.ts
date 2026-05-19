/**
 * DivergedBanner — Master Implementation Plan Wave 6 / Stage A9.
 *
 * Per journeys §13 A9, when a view's `instance.pinnedVersion < intent.version`
 * the Properties panel spine shows a small banner:
 *
 *     ⚠ Intent updated to v7 (you're pinned to v5)
 *     [ Take v7 ]  [ Stay pinned ]
 *
 * Two semantics:
 *   - "Take v7"   → fires `TakeLatestIntentVersionCommand`. Pin advances to
 *                   the master version. Banner disappears.
 *   - "Stay pinned" → session-scoped dismissal. Banner hides until next page
 *                   reload or explicit re-show. **Wave 6 ships in-memory
 *                   dismissal only** — persistence across reloads is a
 *                   Wave 6.5 concern (needs a session store).
 *
 * Rendered at the top of `_buildVisibilityIntentSection` *only when*
 * `instance.pinnedVersion !== undefined && instance.pinnedVersion <
 * intent.version`. Absence of a pin (the default, "always-latest" semantics)
 * means the banner never appears — by design.
 *
 * Pure presentation. No store reads. Caller passes the values + handlers.
 */

export interface DivergedBannerOptions {
    pinnedVersion:    number;
    currentVersion:   number;
    onTakeLatest:     () => void;
    onStayPinned:     () => void;
}

/**
 * In-memory set of intentId|viewId composite keys the user has dismissed
 * this session. Cleared on page reload. Wave 6.5 will replace this with a
 * persisted-per-session store.
 */
const DISMISSED_THIS_SESSION = new Set<string>();

/**
 * Predicate the spine builder uses to decide whether to render the banner.
 * Centralised so the rendering decision and the dismissal lookup stay in
 * one place.
 */
export function shouldShowDivergedBanner(
    intentId: string,
    viewId: string,
    pinnedVersion: number | undefined,
    currentVersion: number,
): boolean {
    if (pinnedVersion === undefined) return false;
    if (pinnedVersion >= currentVersion) return false;
    return !DISMISSED_THIS_SESSION.has(`${intentId}|${viewId}`);
}

/**
 * Mark a (intent, view) pair as dismissed for the rest of the session.
 * Idempotent. Used by the "Stay pinned" button handler.
 */
export function dismissDivergedBanner(intentId: string, viewId: string): void {
    DISMISSED_THIS_SESSION.add(`${intentId}|${viewId}`);
}

/**
 * Renders the banner element. Caller is responsible for inserting it into
 * the DOM and removing it when the spine is rebuilt.
 */
export function renderDivergedBanner(opts: DivergedBannerOptions, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime renderDivergedBanner */): HTMLElement {
    void runtime; /* B-runtime-void renderDivergedBanner — TODO(C.3.x): once runtime.intent.* lands, route the take-latest / stay-pinned commands through runtime.bus.executeCommand instead of the DOM-level callbacks */
    const { pinnedVersion, currentVersion, onTakeLatest, onStayPinned } = opts;

    const root = document.createElement('div');
    root.className = 'vi-diverged';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');

    const message = document.createElement('div');
    message.className = 'vi-diverged__message';
    const icon = document.createElement('span');
    icon.className = 'vi-diverged__icon';
    icon.textContent = '⚠';
    icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'vi-diverged__text';
    text.textContent =
        `Intent updated to v${currentVersion} — you're pinned to v${pinnedVersion}.`;
    message.appendChild(icon);
    message.appendChild(text);
    root.appendChild(message);

    const actions = document.createElement('div');
    actions.className = 'vi-diverged__actions';

    const takeBtn = document.createElement('button');
    takeBtn.type = 'button';
    takeBtn.className = 'vi-diverged__btn vi-diverged__btn--primary';
    takeBtn.textContent = `Take v${currentVersion}`;
    takeBtn.setAttribute('aria-label', `Advance pin to intent version ${currentVersion}`);
    takeBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        onTakeLatest();
    });

    const stayBtn = document.createElement('button');
    stayBtn.type = 'button';
    stayBtn.className = 'vi-diverged__btn vi-diverged__btn--ghost';
    stayBtn.textContent = 'Stay pinned';
    stayBtn.setAttribute('aria-label', `Stay pinned to v${pinnedVersion} and dismiss this banner`);
    stayBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        onStayPinned();
    });

    actions.appendChild(takeBtn);
    actions.appendChild(stayBtn);
    root.appendChild(actions);

    return root;
}
