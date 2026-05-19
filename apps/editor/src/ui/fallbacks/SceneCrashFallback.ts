/**
 * @file src/ui/fallbacks/SceneCrashFallback.ts
 *
 * Vanilla TypeScript equivalent of Pascal's EditorSceneCrashFallback React component.
 *
 * CONTRACT (08-ERROR-RESILIENCE-CRASH-RECOVERY §Mechanism 1):
 *  - Shows when the 3D viewport crashes (render-loop error, GPU device loss,
 *    or pipeline exhausting all retries).
 *  - Provides "Reload viewport" (soft recovery via RPM.onProjectSwitch, or
 *    hard reload as fallback) and "Back to projects" (navigation, app shell intact).
 *  - The rest of the PRYZM shell (toolbar, sidebar) remains functional — only
 *    the canvas element is affected.
 *
 * CONTRACT (05-BIM-UI-ARCHITECTURE §2):
 *  - CSS class prefix: `scf-` (Scene Crash Fallback).
 *  - Styles live in AppTheme.ts (SCF_STYLES constant) and are injected once
 *    via injectAppTheme() — this file emits NO inline <style> tags.
 *  - AppTheme design tokens (--app-*) are used via var() in CSS, not hardcoded here.
 *
 * Usage:
 *   showSceneCrashFallback({ error, onRetry })   // display
 *   hideSceneCrashFallback()                     // remove
 */

// ── Public API ─────────────────────────────────────────────────────────────

export interface SceneCrashFallbackOptions {
    /** Error object to display in development mode. */
    error?: Error | null;
    /** Called when "Reload viewport" is clicked. Defaults to window.location.reload(). */
    onRetry?: () => void;
}

const SCF_ROOT_ID = 'scf-root';

/**
 * Creates and appends the crash fallback DOM tree to `document.body`.
 * Idempotent — removes any existing fallback before inserting the new one.
 *
 * Layout (mirrors Pascal's EditorSceneCrashFallback):
 *   fixed full-screen overlay
 *     └─ centred card
 *          ├─ heading
 *          ├─ body copy
 *          ├─ [error message in dev mode]
 *          └─ action row: "Reload viewport" | "Back to projects"
 */
export function showSceneCrashFallback(opts: SceneCrashFallbackOptions = {}, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime showSceneCrashFallback */): void {
    void runtime; /* B-runtime-void showSceneCrashFallback — TODO(C.3.x): once runtime.telemetry.captureException is wired, the dev-mode error display can also forward to runtime.telemetry */
    hideSceneCrashFallback();

    const root = document.createElement('div');
    root.id   = SCF_ROOT_ID;
    root.className = 'scf-root';

    const card = document.createElement('div');
    card.className = 'scf-card';

    // ── Heading ────────────────────────────────────────────────────────────
    const heading = document.createElement('h2');
    heading.className   = 'scf-heading';
    heading.textContent = 'The viewport failed to render';

    // ── Body ───────────────────────────────────────────────────────────────
    const body = document.createElement('p');
    body.className   = 'scf-body';
    body.textContent =
        'This is usually caused by a GPU driver issue or browser memory pressure. ' +
        'Your project data is safe.';

    card.append(heading, body);

    // ── Dev-mode error details ─────────────────────────────────────────────
    const isDev = (import.meta as any).env?.MODE === 'development'
        || (typeof process !== 'undefined' && (process as any).env?.NODE_ENV === 'development');

    if (isDev && opts.error) {
        const pre = document.createElement('pre');
        pre.className   = 'scf-error-details';
        pre.textContent = opts.error.message + (opts.error.stack ? '\n\n' + opts.error.stack : '');
        card.appendChild(pre);
    }

    // ── Actions ────────────────────────────────────────────────────────────
    const actions = document.createElement('div');
    actions.className = 'scf-actions';

    const reloadBtn = document.createElement('button');
    reloadBtn.type        = 'button';
    reloadBtn.className   = 'scf-btn-primary';
    reloadBtn.textContent = 'Reload viewport';
    reloadBtn.addEventListener('click', opts.onRetry ?? (() => window.location.reload()));

    const homeLink = document.createElement('a');
    homeLink.className   = 'scf-btn-secondary';
    homeLink.href        = '/';
    homeLink.textContent = 'Back to projects';

    actions.append(reloadBtn, homeLink);
    card.appendChild(actions);

    root.appendChild(card);
    document.body.appendChild(root);
}

/**
 * Removes the crash fallback overlay from `document.body`.
 * No-op if no fallback is currently shown.
 */
export function hideSceneCrashFallback(): void {
    document.getElementById(SCF_ROOT_ID)?.remove();
}
