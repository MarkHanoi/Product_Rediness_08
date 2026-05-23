/**
 * ServerSyncQueue — Reliable server synchronisation layer (Phase 1 + Phase 2).
 *
 * Replaces the fire-and-forget `trySaveToServer()` in PlatformShell with a
 * queue-based approach that:
 *   Phase 1:
 *     • Retries failed POSTs (basic retry, 2 attempts at 5-second intervals)
 *     • Sends X-Idempotency-Key so the server can deduplicate retries
 *   Phase 2:
 *     • Exponential backoff: 5 s, 15 s, 45 s, 2 min, 5 min
 *     • Suspends the queue while the browser is offline; resumes on reconnect
 *     • Persists the queue to localStorage so it survives page refresh (emergency
 *       saves queued during 'beforeunload' are retried next session)
 *     • Updates VersionRecord.syncStatus ('local-only' → 'sync-pending' → 'synced')
 *       and notifies PlatformShell so the version history UI can show sync badges
 *
 * Contract compliance:
 *   §07 §1.4 — All server calls go through Express authMiddleware + rate limiter.
 *              The queue POSTs to /api/projects/:id/versions (existing route).
 *   §06 §7   — localStorage writes: queue persistence uses its own dedicated key
 *              ('pryzm-sync-queue'), distinct from bim-project-* and bim-projects-index.
 *   §06 §1   — No BIM engine imports. Operates only on serialised VersionRecord data.
 */

import { VersionRecord } from './PlatformShellTypes';
import { apiFetch } from '@pryzm/core-app-model';

// ── Backoff schedule (Phase 2) ────────────────────────────────────────────────

const BACKOFF_SCHEDULE_MS = [5_000, 15_000, 45_000, 120_000, 300_000] as const;

function backoffMs(attemptIndex: number): number {
    const idx = Math.min(attemptIndex, BACKOFF_SCHEDULE_MS.length - 1);
    return BACKOFF_SCHEDULE_MS[idx];
}

// ── Queue persistence key ─────────────────────────────────────────────────────

const QUEUE_STORAGE_KEY = 'pryzm-sync-queue';
const MAX_QUEUE_ITEMS = 50;

// ── Types ─────────────────────────────────────────────────────────────────────

interface QueueItem {
    version: VersionRecord;
    projectId: string;
    attemptCount: number;
    nextAttemptAt: number;
}

export interface ServerSyncQueueOptions {
    /**
     * Called when a version's sync status changes.
     * PlatformShell uses this to update VersionRecord.syncStatus in localStorage
     * and refresh the version history UI.
     */
    onSyncStatusChange?: (
        versionId: string,
        projectId: string,
        status: 'synced' | 'sync-pending' | 'local-only'
    ) => void;

    /**
     * Called when the server permanently rejects a save (HTTP 4xx).
     * Provides the HTTP status and parsed response body so the UI can
     * show an actionable warning (e.g. "Sign in to enable server saves").
     */
    onSaveRejected?: (status: number, body: Record<string, unknown>) => void;
}

// ── ServerSyncQueue ───────────────────────────────────────────────────────────

/**
 * @deprecated TODO(C.11.03) — Phase C exit gate.  Replaced by the
 *   `ProjectListController` + `attachEventLog` queue inside the
 *   persistence client (`@pryzm/persistence-client`) which the runtime
 *   exposes as `runtime.persistence.client.enqueue(...)` semantics
 *   (status changes flow through `runtime.events.on('persistence.status', ...)`).
 *   Deletion blocked on `PlatformShell.ts` migrating its single
 *   instantiation (line 689) to `runtime.persistence.*`.
 *
 *   ⚠️ Migration NOTE: the sticky `_planRejectsSync` latch (lines 92, 145–175,
 *   272–274 — added 2026-04-29 to suppress retry storms when the user's plan
 *   gates server-side version writes) MUST be ported into the new client's
 *   429/402 handling path before deletion can land.
 *
 *   See `docs/03_PRYZM3/00_NEW_ARCHITECTURE/phases/audits/PHASES-A-F-RECONCILIATION-2026-04-29/03-phase-C-audit-and-plan.md`
 *   §"C-cleanup.1".
 */
export class ServerSyncQueue {
    private queue: QueueItem[] = [];
    private isOnline: boolean = navigator.onLine;
    private isFlushing: boolean = false;
    private flushTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * PERF-FIX (2026-04-29) — sticky "plan rejects versions" latch.
     * Once the server has returned a plan-gating 4xx (e.g. free plan, no
     * version history), every subsequent enqueue short-circuits to a
     * `local-only` status update without serialising, POSTing, or holding
     * a queue slot.  Cleared only by a full page reload (a plan upgrade
     * would also trigger a reload via the auth flow).
     *
     * Before this latch every wall/slab click on free-plan accounts paid
     * ~150 ms of LONGTASK to build a snapshot, capture a thumbnail and
     * round-trip a POST that the server immediately 403'd — the dominant
     * cause of the per-wall jank reported in the 2026-04-29 logs.
     */
    private _planRejectsSync: boolean = false;
    private _planRejectsReason: { status: number; body: Record<string, unknown> } | null = null;

    /**
     * §L-B2 (DAILY-USE-AUDIT 2026-05-20) — Optimistic-concurrency tracking.
     * For each project this client has saved to, we remember the version count
     * the server most recently confirmed. The next save sends
     * `If-Match: "v${count}"` so the server (server.js:2806-2817) can detect
     * concurrent edits from a second tab / second device / collaborator and
     * return HTTP 412. Without this, all four scenarios silently last-writer-wins
     * — the slower client's snapshot is appended to history but their working
     * scene diverges silently from what's on the server. C05 §4 — the server
     * already enforces the optimistic-concurrency contract; this is the missing
     * client half.
     */
    private _serverVersionCountByProject: Map<string, number> = new Map();

    /**
     * §L-B2-RECONCILE (2026-05-23) — version ids for which we have already adopted
     * the server's actual count and retried after a 412. Bounds the self-heal to ONE
     * reconcile per save so a genuine rapid-conflict storm cannot loop; a second 412
     * for the same save falls through to the local-only preservation path. Cleared on
     * successful sync. In-memory only (per session) — not persisted with the queue.
     */
    private _reconciledVersionIds: Set<string> = new Set();

    private readonly onSyncStatusChange: NonNullable<ServerSyncQueueOptions['onSyncStatusChange']>;
    private readonly onSaveRejected: NonNullable<ServerSyncQueueOptions['onSaveRejected']>;

    private readonly onlineHandler: () => void;
    private readonly offlineHandler: () => void;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(options: ServerSyncQueueOptions = {}, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this.onSyncStatusChange = options.onSyncStatusChange ?? (() => { });
        this.onSaveRejected = options.onSaveRejected ?? (() => { });

        this.onlineHandler = () => {
            this.isOnline = true;
            console.log('[ServerSyncQueue] Online — resuming sync queue');
            this.scheduleFlush(1000);
        };
        this.offlineHandler = () => {
            this.isOnline = false;
            this.cancelFlush();
            console.log('[ServerSyncQueue] Offline — sync queue suspended');
        };

        window.addEventListener('online', this.onlineHandler);
        window.addEventListener('offline', this.offlineHandler);

        this.loadPersistedQueue();

        if (this.queue.length > 0) {
            console.log(`[ServerSyncQueue] Resuming ${this.queue.length} queued item(s) from previous session`);
            this.scheduleFlush(3000);
        }
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Enqueue a version for server synchronisation.
     * Call this immediately after writing to localStorage so the server sync
     * happens asynchronously in the background.
     *
     * PERF-FIX (2026-04-29) — when `_planRejectsSync` is latched, skip the
     * network round-trip entirely and immediately mark the version as
     * `local-only` so the UI badge is correct.  PlatformShell also reads
     * `isPlanRejected()` to skip the (heavy) thumbnail capture+upload on
     * the same path.
     */
    enqueue(version: VersionRecord, projectId: string): void {
        if (this._planRejectsSync) {
            this.onSyncStatusChange(version.id, projectId, 'local-only');
            return;
        }
        const existing = this.queue.findIndex(q => q.version.id === version.id);
        if (existing >= 0) {
            this.queue[existing] = { version, projectId, attemptCount: 0, nextAttemptAt: Date.now() };
        } else {
            if (this.queue.length >= MAX_QUEUE_ITEMS) {
                console.warn('[ServerSyncQueue] Queue full — dropping oldest item');
                this.queue.shift();
            }
            this.queue.push({ version, projectId, attemptCount: 0, nextAttemptAt: Date.now() });
        }
        this.onSyncStatusChange(version.id, projectId, 'sync-pending');
        this.persistQueue();
        this.scheduleFlush(500);
    }

    /**
     * True once the server has returned a plan-gating 4xx response.
     * PlatformShell uses this to skip the per-save thumbnail capture and
     * upload, and SaveOrchestrator could use it to widen its debounce.
     */
    isPlanRejected(): boolean {
        return this._planRejectsSync;
    }

    /** The 4xx response body that latched the rejection, for diagnostics. */
    getPlanRejectionReason(): { status: number; body: Record<string, unknown> } | null {
        return this._planRejectsReason;
    }

    /**
     * Release all resources. Call from PlatformShell.dispose().
     */
    dispose(): void {
        this.cancelFlush();
        window.removeEventListener('online', this.onlineHandler);
        window.removeEventListener('offline', this.offlineHandler);
    }

    // ── Flush logic ───────────────────────────────────────────────────────────

    private scheduleFlush(delayMs: number): void {
        this.cancelFlush();
        this.flushTimer = setTimeout(() => this.flush(), delayMs);
    }

    private cancelFlush(): void {
        if (this.flushTimer !== null) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
    }

    private async flush(): Promise<void> {
        if (this.isFlushing || !this.isOnline || this.queue.length === 0) return;

        this.isFlushing = true;
        const now = Date.now();

        const ready = this.queue.filter(item => item.nextAttemptAt <= now);
        let rescheduleMs: number | null = null;

        for (const item of ready) {
            const success = await this.attemptSync(item);
            if (!success) {
                const delay = backoffMs(item.attemptCount - 1);
                item.nextAttemptAt = Date.now() + delay;
                if (rescheduleMs === null || delay < rescheduleMs) {
                    rescheduleMs = delay;
                }
            }
        }

        this.persistQueue();
        this.isFlushing = false;

        if (this.queue.length > 0) {
            const minDelay = this.queue.reduce((min, item) => {
                const wait = Math.max(0, item.nextAttemptAt - Date.now());
                return Math.min(min, wait);
            }, rescheduleMs ?? 60_000);
            this.scheduleFlush(minDelay + 200);
        }
    }

    private async attemptSync(item: QueueItem): Promise<boolean> {
        const { version, projectId } = item;
        try {
            // §L-B2 — build headers with optional If-Match (only when the client
            // has previously confirmed a server-side count for this project).
            // The very first save for a fresh project has no expected count
            // (server treats absent If-Match as "no precondition") — that's the
            // correct semantics: first writer wins, every subsequent writer
            // must reconcile against the last seen count.
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'X-Idempotency-Key': version.id,
            };
            const expectedCount = this._serverVersionCountByProject.get(projectId);
            if (expectedCount !== undefined) {
                headers['If-Match'] = `"v${expectedCount}"`;
            }
            const res = await apiFetch(`/api/projects/${projectId}/versions`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    label: version.label,
                    snapshot: version.snapshot,
                    elementCount: version.elementCount,
                    versionId: version.id,
                }),
            });

            if (res.status === 201 || res.status === 200) {
                console.log(`[ServerSyncQueue] Synced version "${version.label}" (${version.id})`);
                this.queue = this.queue.filter(q => q.version.id !== version.id);
                this._reconciledVersionIds.delete(version.id);
                this.onSyncStatusChange(version.id, projectId, 'synced');
                // §L-B2 — update the server-version-count cache from the response
                // body (or, as a fallback, increment from the previous known
                // count by 1 — every successful save adds exactly one version).
                // §L-B2-RECONCILE — also read `version.version_count` (the actual
                // POST success shape is `{ version: <row> }`), so the cache is
                // seeded authoritatively and the `prior+1` guess is rarely needed.
                try {
                    const body = await res.json().catch(() => null) as { versionCount?: number; count?: number; total?: number; version?: { version_count?: number } } | null;
                    const serverCount =
                        (body && (typeof body.versionCount === 'number' ? body.versionCount
                                  : typeof body.count === 'number' ? body.count
                                  : typeof body.total === 'number' ? body.total
                                  : typeof body.version?.version_count === 'number' ? body.version.version_count
                                  : undefined));
                    if (typeof serverCount === 'number') {
                        this._serverVersionCountByProject.set(projectId, serverCount);
                    } else {
                        const prior = this._serverVersionCountByProject.get(projectId) ?? 0;
                        this._serverVersionCountByProject.set(projectId, prior + 1);
                    }
                } catch { /* non-fatal */ }
                return true;
            }

            // §L-B2 — 412 Precondition Failed: a concurrent writer (other tab /
            // collaborator / second device) saved a different version since we
            // last knew. We MUST NOT drop the local snapshot — that would be
            // exactly the silent data-loss the audit flagged. Mark it
            // `local-only`, surface to the host via `onSaveRejected`, and clear
            // the stale count cache so the next attempt sends no If-Match — the
            // operator should reload to merge or pick from version history.
            if (res.status === 412) {
                const body = await res.json().catch(() => ({})) as { actual?: number; expected?: number; error?: string };
                const actual = typeof body.actual === 'number' ? body.actual : undefined;

                // §L-B2-RECONCILE (2026-05-23) — a 412 means our expected version
                // count was STALE. The most common cause is NOT a real concurrent
                // edit but a client-side count desync: the POST success response
                // carries no authoritative count, so the success path falls back to
                // `prior+1` from an unseeded cache (→ "1") while the server is at 21.
                // Every subsequent save then sends If-Match "v1" → permanent 412 →
                // EVERY auto-save lost to `local-only` (exactly the architect's
                // "expected 1, server has 21" loop).
                //
                // The server hands us the ACTUAL count in the 412 body — adopt it and
                // retry ONCE inline. Versions are append-only, so re-basing onto the
                // real count and re-posting never overwrites a concurrent writer's
                // version: it appends ours after theirs (no data loss). Bounded to one
                // reconcile per save id; a second 412 falls through to local-only.
                if (actual !== undefined && !this._reconciledVersionIds.has(version.id)) {
                    this._reconciledVersionIds.add(version.id);
                    this._serverVersionCountByProject.set(projectId, actual);
                    console.warn(
                        `[ServerSyncQueue] §L-B2-RECONCILE 412 for "${version.label}" — ` +
                        `expected ${body.expected}, server has ${actual}. Re-basing count + retrying once.`,
                    );
                    return await this.attemptSync(item); // retries with If-Match "v${actual}"
                }

                console.warn(
                    `[ServerSyncQueue] §L-B2 412 Precondition Failed for "${version.label}" — ` +
                    `expected ${body.expected}, server has ${body.actual}. Local copy preserved.`,
                );
                // Drop from active queue (won't retry — same 412 would recur)
                // but the version stays in localStorage as `local-only` so the
                // user can manually copy/export it after reload.
                this.queue = this.queue.filter(q => q.version.id !== version.id);
                this._reconciledVersionIds.delete(version.id);
                this.onSyncStatusChange(version.id, projectId, 'local-only');
                // Reset the cache: the next save will go without If-Match (or
                // with a fresh count once a reload-and-re-init happens).
                this._serverVersionCountByProject.delete(projectId);
                this.onSaveRejected(412, {
                    error: 'concurrent_edit',
                    actual: body.actual,
                    expected: body.expected,
                    versionId: version.id,
                    label: version.label,
                });
                return true;
            }

            if (res.status >= 400 && res.status < 500) {
                const body = await res.json().catch(() => ({})) as Record<string, unknown>;
                console.warn(`[ServerSyncQueue] Version "${version.label}" rejected by server (${res.status}) — dropping:`, body);
                this.queue = this.queue.filter(q => q.version.id !== version.id);
                this.onSyncStatusChange(version.id, projectId, 'local-only');

                // PERF-FIX (2026-04-29) — latch the "plan rejects sync" flag
                // for plan-gating responses (401/403 with a `plan` field, or
                // an explicit `upgrade` field).  Future enqueue() calls then
                // short-circuit without hitting the network.  Other 4xx (bad
                // request, conflict, validation) are NOT latched — they only
                // drop the offending version.
                const looksLikePlanGate =
                    (res.status === 401 || res.status === 403) &&
                    (typeof body.plan === 'string' || typeof body.upgrade === 'string');
                if (looksLikePlanGate && !this._planRejectsSync) {
                    this._planRejectsSync = true;
                    this._planRejectsReason = { status: res.status, body };
                    // Drop everything that was queued before the latch — the
                    // server will reject all of them with the same 4xx.
                    if (this.queue.length > 0) {
                        for (const q of this.queue) {
                            this.onSyncStatusChange(q.version.id, q.projectId, 'local-only');
                        }
                        this.queue = [];
                        this.persistQueue();
                    }
                    console.warn('[ServerSyncQueue] Plan-gating latch engaged — future versions will stay local-only this session.');
                }

                this.onSaveRejected(res.status, body);
                return true;
            }

            item.attemptCount++;
            console.warn(`[ServerSyncQueue] Attempt ${item.attemptCount} failed for "${version.label}" — status ${res.status}`);
            return false;

        } catch (err) {
            item.attemptCount++;
            console.warn(`[ServerSyncQueue] Attempt ${item.attemptCount} failed for "${version.label}":`, err);
            return false;
        }
    }

    // ── Queue persistence ─────────────────────────────────────────────────────

    private persistQueue(): void {
        if (this.queue.length === 0) {
            try { localStorage.removeItem(QUEUE_STORAGE_KEY); } catch { }
            return;
        }
        try {
            const serialisable = this.queue.map(item => ({
                version: item.version,
                projectId: item.projectId,
                attemptCount: item.attemptCount,
                nextAttemptAt: item.nextAttemptAt,
            }));
            localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(serialisable));
        } catch {
            console.warn('[ServerSyncQueue] Could not persist queue to localStorage');
        }
    }

    private loadPersistedQueue(): void {
        try {
            const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
            if (!raw) return;
            const items = JSON.parse(raw) as QueueItem[];
            if (!Array.isArray(items)) return;
            this.queue = items.slice(0, MAX_QUEUE_ITEMS);
            this.queue.forEach(item => {
                item.nextAttemptAt = Date.now() + 5000;
            });
        } catch {
            this.queue = [];
        }
    }
}
