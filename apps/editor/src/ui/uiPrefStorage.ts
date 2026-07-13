/**
 * uiPrefStorage — §FIX-STORAGE-QUOTA-SILENT-INDEX-FAILURE (L-269).
 *
 * The single funnel for UI-CHROME preference writes (panel positions, panel sizes,
 * rail widths — cosmetic layout state).
 *
 * WHY THIS EXISTS
 * ───────────────
 * The founder's console carried an UNCAUGHT exception on every panel drag once the
 * origin filled up:
 *
 *   Uncaught QuotaExceededError: Failed to execute 'setItem' on 'Storage':
 *   Setting the value of 'bim-pp-pos' exceeded the quota.
 *
 * `bim-pp-pos` is a property-panel POSITION — ~30 bytes of pure decoration. It was
 * written with a bare `localStorage.setItem` inside a mouseup handler, so a full
 * origin turned a cosmetic preference into an uncaught error escaping into the app.
 *
 * The rule this module enforces: **UI chrome must never throw into the app, and a
 * cosmetic preference must never compete with project data for storage.** On quota
 * (or private-mode / disabled storage) the preference is simply DROPPED — the panel
 * reverts to its CSS default next session, which is a non-event. Project data keeps
 * the entire budget.
 *
 * Contract C13 (project isolation): callers pass app-global UI keys that are
 * allowlisted in `scripts/check/check-storage-isolation.mjs`. This module adds no
 * new key semantics — it only makes the write non-fatal.
 */

/**
 * Persist a UI-chrome preference. Returns true when it was stored, false when it
 * was dropped (quota exhausted, storage unavailable). NEVER throws.
 */
export function writeUiPreference(key: string, value: string): boolean {
    try {
        // @project-isolation: caller-supplied app-global UI-chrome key (allowlisted
        // in check-storage-isolation.mjs — e.g. `bim-pp-pos`, `pryzm-pp-size`).
        localStorage.setItem(key, value);
        return true;
    } catch (err) {
        // A cosmetic preference is never worth an exception, a retry, or an eviction
        // that could cost the user real project data. Drop it and move on.
        const name = (err as { name?: string } | null)?.name ?? 'unknown';
        console.warn(`[uiPrefStorage] Dropped UI preference "${key}" (${name}) — storage is full or unavailable. Layout will fall back to its default.`);
        return false;
    }
}

/** Read a UI-chrome preference. NEVER throws — returns null when unavailable. */
export function readUiPreference(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

/** Remove a UI-chrome preference. NEVER throws. */
export function clearUiPreference(key: string): void {
    try { localStorage.removeItem(key); } catch { /* nothing to do — it is decoration */ }
}
