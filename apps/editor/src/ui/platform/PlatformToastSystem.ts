/**
 * PlatformToastSystem — Shared UI helpers for PlatformShell sub-modules.
 *
 * Extracted from PlatformShell.ts (Wave 14 FILE 2 god-file split, 2026-05-02).
 * Originally defined as module-level functions in PlatformShell.ts; moved here
 * so all sub-controllers can import without creating circular dependencies.
 *
 * Exports:
 *   showToast    — renders a transient status toast at the bottom of the viewport
 *   syncBadge    — returns an HTML badge string for VersionRecord.syncStatus
 *   formatDate   — human-readable date string for version timestamps
 *   generateId   — unique project/version ID (timestamp + random suffix)
 */

import type { VersionRecord } from './PlatformShellTypes';

// ── Toast ─────────────────────────────────────────────────────────────────────

let _toastTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Shows a transient toast notification at the bottom-centre of the viewport.
 * Dismisses any existing toast first; auto-removes after `durationMs`.
 */
export function showToast(
    msg: string,
    type: 'success' | 'error' | 'info' = 'info',
    durationMs = 3000,
): void {
    const existing = document.querySelector('.plat-toast');
    if (existing) existing.remove();
    if (_toastTimeout) clearTimeout(_toastTimeout);

    const toast = document.createElement('div');
    toast.className = `plat-toast ${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);

    _toastTimeout = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, durationMs);
}

// ── Sync status badge ─────────────────────────────────────────────────────────

/**
 * Returns an HTML badge string representing the server-sync status of a version.
 * Used in the version history list rows.
 */
export function syncBadge(syncStatus: VersionRecord['syncStatus']): string {
    if (!syncStatus || syncStatus === 'local-only') {
        return `<span class="plat-sync-badge plat-sync-local" title="Saved locally — not yet synced to server">⬡ Local</span>`;
    }
    if (syncStatus === 'sync-pending') {
        return `<span class="plat-sync-badge plat-sync-pending" title="Waiting to sync to server">↻ Syncing</span>`;
    }
    return `<span class="plat-sync-badge plat-sync-done" title="Synced to server">✓ Synced</span>`;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Returns a human-readable date string from a Unix timestamp (ms).
 * Output example: "May 2, 2:15 PM"
 */
export function formatDate(ts: number): string {
    return new Date(ts).toLocaleString(undefined, {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

/**
 * Generates a unique project / version ID.
 * Format: `proj-<timestamp>-<5-char random>`, e.g. `proj-1714680000000-x3k9a`.
 */
export function generateId(): string {
    return `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
