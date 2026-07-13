/**
 * StorageQuotaDiagnostics — §FIX-STORAGE-QUOTA-SILENT-INDEX-FAILURE (L-269).
 *
 * WHY THIS EXISTS
 * ───────────────
 * The founder's console showed, on EVERY autosave:
 *
 *   [VersionRepository] Quota exceeded — project meta index not updated (eviction exhausted)
 *   [VersionRepository] 12 version(s) persisted to IndexedDB (~0.6 MB compressed)
 *   Uncaught QuotaExceededError: … 'bim-pp-pos' exceeded the quota.
 *
 * The obvious reading — "0.6 MB of versions exhausted the quota" — is WRONG, and
 * so was the "eviction exhausted" message. Two facts:
 *
 *   • The 0.6 MB lives in **IndexedDB** (§VERSION-QUOTA-INDEXEDDB moved it there);
 *     it does not consume the ~5 MB **localStorage** origin cap at all. The store
 *     that is full is localStorage, and it is full of something ELSE.
 *   • The quota-recovery valve in ProjectRepository (`_setItemWithEviction`) can
 *     only ever evict ONE key family — the legacy `bim-project-<id>-versions`
 *     blobs — which §VERSION-QUOTA-INDEXEDDB already migrated OUT of localStorage.
 *     So its candidate list is EMPTY and the loop reports "exhausted" having
 *     evicted precisely nothing. It was never spent; it was never applicable.
 *
 * We were therefore guessing at WHICH subsystem fills the origin. This module
 * stops the guessing: it measures localStorage, ranks the consumers by key family,
 * and attaches that report to the failure that surfaces to the user (P8 — a
 * data-losing persistence failure is a user-resolvable event, not a console.warn).
 *
 * Contracts: C05 (persistence & file format) §quota; C13 (project isolation) —
 * this module READS every key but OWNS and MUTATES none. Reclamation of a key
 * family is always performed by the module that owns that family.
 */

/** Bytes used by one key family (a stable prefix such as `pryzm.scoped`). */
export interface StorageFamilyUsage {
    /** Stable prefix that groups related keys (never the full per-project key). */
    family: string;
    /** UTF-16 bytes consumed by every key in the family (key + value). */
    bytes: number;
    /** Number of localStorage keys in the family. */
    keys: number;
}

/** A ranked snapshot of what is actually occupying the localStorage origin cap. */
export interface StorageUsageReport {
    /** Total UTF-16 bytes across every key (key length + value length) × 2. */
    totalBytes: number;
    /** Every family, largest first. */
    families: StorageFamilyUsage[];
    /** The individual heaviest keys, largest first (capped at TOP_KEYS). */
    topKeys: { key: string; bytes: number }[];
    /** When the measurement was taken. */
    measuredAt: number;
}

/** How many individual keys the report names. Enough to identify a hog. */
const TOP_KEYS = 8;

/**
 * Known key families, longest-prefix-first. A key that matches none of these is
 * reported under its own name — an unknown hog must never hide inside a bucket.
 */
const KNOWN_FAMILIES: readonly string[] = [
    'pryzm.scoped',
    'pryzm.floorPlanUnderlay',
    'pryzm.sitePlanOverlay',
    'pryzm.renderGallery',
    'pryzm.entitlements',
    'pryzm.aiusage',
    'pryzm.projectRepository',
    'pryzm.serverSync',
    'bim-projects-index',
    'bim-project-',
    'bim-rendergallery-',
    'bim-platform-',
    'pryzm-sync-queue',
];

/** Classify a key into its family. Unknown keys are their own family. */
function _familyOf(key: string): string {
    for (const f of KNOWN_FAMILIES) {
        if (key === f || key.startsWith(f)) return f;
    }
    return key;
}

/** UTF-16 byte cost of a stored entry (what the browser actually charges). */
function _entryBytes(key: string, value: string): number {
    return (key.length + value.length) * 2;
}

/**
 * Measure the localStorage origin, grouped by key family and ranked by size.
 * NEVER throws — a browser that denies storage access reports an empty origin.
 */
export function measureLocalStorageUsage(): StorageUsageReport {
    const report: StorageUsageReport = { totalBytes: 0, families: [], topKeys: [], measuredAt: Date.now() };
    let entries: { key: string; bytes: number }[] = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k == null) continue;
            const v = localStorage.getItem(k) ?? '';
            entries.push({ key: k, bytes: _entryBytes(k, v) });
        }
    } catch {
        return report; // storage denied (private mode / disabled) — nothing to report
    }

    const byFamily = new Map<string, StorageFamilyUsage>();
    for (const e of entries) {
        report.totalBytes += e.bytes;
        const family = _familyOf(e.key);
        const acc = byFamily.get(family) ?? { family, bytes: 0, keys: 0 };
        acc.bytes += e.bytes;
        acc.keys += 1;
        byFamily.set(family, acc);
    }

    report.families = [...byFamily.values()].sort((a, b) => b.bytes - a.bytes);
    entries = entries.sort((a, b) => b.bytes - a.bytes).slice(0, TOP_KEYS);
    report.topKeys = entries;
    return report;
}

/** Human-readable one-liner per family — goes into the console error AND the banner. */
export function formatStorageUsageReport(report: StorageUsageReport): string {
    const mb = (b: number) => `${(b / 1024 / 1024).toFixed(2)} MB`;
    const lines = [`localStorage: ${mb(report.totalBytes)} across ${report.families.reduce((n, f) => n + f.keys, 0)} key(s).`];
    for (const f of report.families.slice(0, 5)) {
        lines.push(`  • ${f.family} — ${mb(f.bytes)} (${f.keys} key${f.keys === 1 ? '' : 's'})`);
    }
    return lines.join('\n');
}

/** The single heaviest family — the answer to "what is actually filling the origin?". */
export function largestStorageConsumer(report: StorageUsageReport): StorageFamilyUsage | null {
    return report.families[0] ?? null;
}

// ── Terminal-state latch ─────────────────────────────────────────────────────
//
// "Eviction exhausted" is TERMINAL, not a warning: the recovery path is spent (or,
// as it turns out, was never applicable) and EVERY subsequent autosave will fail
// the same way. Latch it so the app reports it ONCE, loudly, with a user-resolvable
// action — instead of silently re-entering the failing loop every 30 seconds.

let _terminal: StorageUsageReport | null = null;

/** True once a quota failure has latched the storage layer into its terminal state. */
export function isStorageQuotaTerminal(): boolean {
    return _terminal !== null;
}

/** The usage report captured when the terminal state was entered (null if healthy). */
export function storageQuotaTerminalReport(): StorageUsageReport | null {
    return _terminal;
}

/**
 * Enter the terminal state. Returns TRUE only the FIRST time — the caller uses
 * that to raise the user-facing surface exactly once per session, while still
 * being free to log every individual failure.
 */
export function markStorageQuotaTerminal(report: StorageUsageReport): boolean {
    const first = _terminal === null;
    _terminal = report;
    return first;
}

/**
 * Leave the terminal state — called on the next SUCCESSFUL index write, i.e. after
 * the user freed space. Without this the banner could never be earned back.
 */
export function resetStorageQuotaTerminal(): void {
    _terminal = null;
}
