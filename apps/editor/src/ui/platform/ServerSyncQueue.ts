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
import { getVersionCacheStore } from './VersionCacheStore';
import {
    decideRejectionFate,
    describeRejection,
    type RejectionCode,
    type RejectionRetryTrigger,
    type RejectionScope,
} from './serverSaveRejectionFate';

// ── Backoff schedule (Phase 2) ────────────────────────────────────────────────

const BACKOFF_SCHEDULE_MS = [5_000, 15_000, 45_000, 120_000, 300_000] as const;

function backoffMs(attemptIndex: number): number {
    const idx = Math.min(attemptIndex, BACKOFF_SCHEDULE_MS.length - 1);
    return BACKOFF_SCHEDULE_MS[idx];
}

// ── §FIX-DB-SATURATION-RESILIENCE (L-137, 2026-07-06) — circuit breaker ────────
//
// The 2026-07-06 DB-saturation cascade was AMPLIFIED by this queue: when the
// Supabase pooler was already saturated, every failed autosave retried, adding
// MORE write load to the exhausted pool — a positive-feedback spiral. A circuit
// breaker caps that: after N consecutive server-health failures (5xx / timeout /
// network) we STOP hammering the server for a cooldown window, then probe with a
// single item ("half-open"); a success closes the breaker, a failure re-opens it.
//
// This never sends requests FASTER than the existing exponential backoff — the
// breaker only ever ADDS delay (a sane floor), never removes it.
const BREAKER_FAILURE_THRESHOLD = 5;   // consecutive server failures before opening
const BREAKER_COOLDOWN_MS = 30_000;    // quiet window while the breaker is open (floor)

// ── Queue persistence key ─────────────────────────────────────────────────────

const QUEUE_STORAGE_KEY = 'pryzm-sync-queue';

/**
 * §FIX-QUEUE-CAP-SILENT-EVICTION (L-1312) — the cap is a SCHEDULING target, not a
 * licence to delete.
 *
 * `enqueue()` used to read:
 *
 *     if (this.queue.length >= MAX_QUEUE_ITEMS) {
 *         console.warn('[ServerSyncQueue] Queue full — dropping oldest item');
 *         this.queue.shift();                       // ← the oldest upload, gone
 *     }
 *
 * A `console.warn` is not a surface. With ~50 local-only projects, a bulk
 * re-save reaches the cap partway through and then **evicts its own backlog** —
 * every project queued before the halfway point silently stops being uploaded.
 * A cap that drops the oldest item without telling anyone is data loss with a
 * different name.
 *
 * Replaced by: evict only a **superseded** item (an older queued version of a
 * project that also has a newer one queued — genuinely redundant, since the
 * newer snapshot contains the older state), and if there is nothing superseded
 * to reclaim, **refuse the new enqueue and SURFACE it** rather than deleting
 * someone else's pending upload. Nothing is dropped quietly in either arm.
 */
const MAX_QUEUE_ITEMS = 50;

/**
 * Absolute retention ceiling, counting blocked items. Blocked items cost no
 * network and no CPU — they only hold memory and persisted bytes — so the
 * ceiling is far above the active target. Reaching it is the only condition
 * under which an enqueue can be refused, and that refusal is reported.
 */
const HARD_QUEUE_CEILING = 250;

/**
 * §SYNC-QUEUE-QUOTA (2026-06-23) — soft byte budget for the persisted queue.
 *
 * Each QueueItem carries a FULL VersionRecord.snapshot (the entire serialised
 * BIM scene — every wall/slab/element). A single real project snapshot is
 * easily hundreds of KB to several MB. localStorage is ~5 MB *total* and is
 * shared with the actual project data (`bim-project-*`, `bim-projects-index`).
 * Serialising up to 50 full snapshots therefore blows the quota → setItem
 * throws QuotaExceededError → the old catch silently dropped the ENTIRE queue
 * → any not-yet-synced autosaves were lost on reload.
 *
 * We cap the persisted payload at ~1.5 MB and keep the NEWEST items that fit,
 * dropping oldest first. The newest queued version is always the most valuable
 * (it supersedes older snapshots of the same project), so trimming oldest is
 * the data-safe choice. In-memory `this.queue` is untouched — only what we
 * write to localStorage is trimmed, so the live session still retries every
 * item; the trim only bounds what survives a reload.
 */
const PERSIST_BYTE_BUDGET = 1_500_000;

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * §FIX-REJECTED-SAVE-IS-NOT-A-COMPLETED-SAVE (L-1310) — a recorded server refusal.
 * Attached to a queue item INSTEAD of deleting it, and mirrored into
 * `_sessionBlock` / `_projectBlocks` so later enqueues inherit it without a
 * second round-trip.
 */
export interface SaveBlock {
    readonly status: number;
    readonly code: RejectionCode;
    readonly scope: RejectionScope;
    readonly retryable: RejectionRetryTrigger;
    readonly detail: string;
    /** Human copy for a banner / badge tooltip. */
    readonly message: string;
    readonly at: number;
    /** The parsed server body, for diagnostics. */
    readonly body: Record<string, unknown>;
}

interface QueueItem {
    version: VersionRecord;
    projectId: string;
    attemptCount: number;
    nextAttemptAt: number;
    /**
     * Set when the server ANSWERED "no" for this item. The item stays in the
     * queue with its full payload; `flush()` skips it. Cleared by `unblock()`.
     */
    blocked?: SaveBlock;
    /**
     * §GUARD-EMPTY-SNAPSHOT (L-10040) — set ONLY when the user explicitly asked
     * for this save (Save button / Ctrl+S / the save modal) AND the snapshot is
     * bare. It becomes `"force": true` on the wire, which is the ONE thing that
     * gets a bare snapshot past the server's empty-snapshot refusal.
     *
     * ⛔ It is NOT set for an autosave, ever. If it were, the client would be
     * disarming the server guard on every request and the server would stop
     * protecting anyone — including a stale tab running pre-guard code, a
     * replayed request, or any other client. Defence in depth means the outer
     * layer must not be able to switch off the inner one by default.
     */
    emptyOverwriteIntent?: boolean;
}

interface SerialisableQueueItem {
    version: VersionRecord;
    projectId: string;
    attemptCount: number;
    nextAttemptAt: number;
    blocked?: SaveBlock;
    emptyOverwriteIntent?: boolean;
}

/**
 * §SYNC-QUEUE-QUOTA — pure helper: given the queue items (oldest→newest) and a
 * byte budget, return the JSON string for the LARGEST newest-first suffix whose
 * UTF-16 byte estimate fits the budget, plus how many oldest items were dropped.
 *
 * Returns `null` when even a single (the newest) item exceeds the budget — the
 * caller then logs and skips the write rather than throwing. Exported for unit
 * testing; has no DOM / localStorage dependency.
 */
export function buildPersistedQueuePayload(
    items: ReadonlyArray<SerialisableQueueItem>,
    byteBudget: number = PERSIST_BYTE_BUDGET,
): { json: string; dropped: number } | null {
    if (items.length === 0) return { json: '[]', dropped: 0 };

    // Keep the newest items (end of the array); drop oldest (front) until it fits.
    let start = 0;
    while (start < items.length) {
        const slice = items.slice(start);
        const json = JSON.stringify(slice);
        // UTF-16 string length × 2 ≈ stored byte size (localStorage stores UTF-16).
        if (json.length * 2 <= byteBudget) {
            return { json, dropped: start };
        }
        start++;
    }
    // Even the single newest item is over budget.
    return null;
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

    /**
     * §FIX-QUEUE-CAP-SILENT-EVICTION (L-1312) — called when a version could NOT
     * be taken into the sync queue at all, because the retention ceiling is full
     * of items that are not superseded and therefore may not be discarded.
     *
     * The version is still in local version history; what did not happen is the
     * UPLOAD. That distinction is exactly what the old silent `shift()` erased,
     * so it gets its own callback rather than being folded into a `console.warn`.
     */
    onQueueOverflow?: (version: VersionRecord, projectId: string, queueLength: number) => void;
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
 *   See `docs/archive/pryzm3-internal/00_NEW_ARCHITECTURE/phases/audits/PHASES-A-F-RECONCILIATION-2026-04-29/03-phase-C-audit-and-plan.md`
 *   §"C-cleanup.1".
 */
export class ServerSyncQueue {
    private queue: QueueItem[] = [];
    private isOnline: boolean = navigator.onLine;
    private isFlushing: boolean = false;
    private flushTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * §FIX-DB-SATURATION-RESILIENCE (L-137) — circuit-breaker state.
     *   _consecutiveServerFailures — count of back-to-back server-health failures
     *     (5xx / timeout / network). Reset to 0 on ANY server response that proves
     *     the server is alive (2xx success OR a terminal 4xx rejection).
     *   _breakerOpenUntil — epoch ms until which the breaker is OPEN; while open,
     *     flush() does not touch the network (stops amplifying a saturated DB).
     */
    private _consecutiveServerFailures = 0;
    private _breakerOpenUntil = 0;

    /**
     * §FIX-REJECTED-SAVE-IS-NOT-A-COMPLETED-SAVE (L-1310) — WHAT REPLACED THE LATCH.
     *
     * ─── WHAT WAS HERE ──────────────────────────────────────────────────────
     *
     *     private _planRejectsSync: boolean = false;
     *
     * A single boolean, set by the first plan-gating 401/403 of the session, which
     *   • EMPTIED the entire queue (every pending upload, every project), and
     *   • short-circuited every later `enqueue()` to a status update with no POST,
     * and was cleared by nothing short of a full page reload.
     *
     * ⭐ MEASURED CONSEQUENCE: after that first 403, **no version could reach the
     * server again for the rest of the session** — `ServerSyncQueue.attemptSync`
     * is the only client-side POST to `/api/projects/:id/versions` in the repo,
     * `enqueue()` returned before touching it, and `flush()` had an empty queue to
     * flush. Every "Save Version" the user clicked afterwards reported success and
     * uploaded nothing.
     *
     * On the free plan the server's version limit is 1 PER PROJECT, so the SECOND
     * save of the FIRST project tripped it. That is how ~50 projects ended up
     * local-only: not "not yet uploaded", but **uploads thrown away**.
     *
     * ─── WHAT IS HERE NOW ───────────────────────────────────────────────────
     *
     * A refusal is recorded AT ITS OWN SCOPE and never deletes a payload:
     *   • `_sessionBlock`  — only 401 (not authenticated) is genuinely session-wide.
     *   • `_projectBlocks` — 403 plan limits, 400 `invalid_id`, 410: ONE project.
     *   • `item.blocked`   — 400 validation, 409, 412: ONE save.
     * Blocked items stay in the queue with their full snapshot; `flush()` skips
     * them, so there is no retry storm and no jank — the perf property the old
     * latch was introduced for is preserved without the data loss it caused.
     */
    private _sessionBlock: SaveBlock | null = null;
    private _projectBlocks: Map<string, SaveBlock> = new Map();

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
    private readonly onQueueOverflow: NonNullable<ServerSyncQueueOptions['onQueueOverflow']>;

    private readonly onlineHandler: () => void;
    private readonly offlineHandler: () => void;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(options: ServerSyncQueueOptions = {}, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this.onSyncStatusChange = options.onSyncStatusChange ?? (() => { });
        this.onSaveRejected = options.onSaveRejected ?? (() => { });
        this.onQueueOverflow = options.onQueueOverflow ?? (() => { });

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
     * §FIX-REJECTED-SAVE-IS-NOT-A-COMPLETED-SAVE (L-1310) — a version is ALWAYS
     * taken into the queue, blocked or not. The old code returned here without
     * queueing whenever the session latch was set, which is why a save could be
     * reported as done while its payload existed nowhere but local storage and
     * was never again destined for the server.
     *
     * When a block is in force the item is stored WITH the block, the status goes
     * to `local-only` (truthfully), and no flush is scheduled — so the perf
     * property the old latch bought (no snapshot round-trip per wall click on a
     * gated plan) is kept, without discarding anything.
     */
    enqueue(version: VersionRecord, projectId: string, opts?: { emptyOverwriteIntent?: boolean }): void {
        const block = this.getSaveBlock(projectId);
        // §GUARD-EMPTY-SNAPSHOT (L-10040) — carried, never inferred. See the field
        // docstring on QueueItem for why an autosave must never set this.
        const intent = opts?.emptyOverwriteIntent === true ? { emptyOverwriteIntent: true as const } : {};

        const existing = this.queue.findIndex(q => q.version.id === version.id);
        if (existing >= 0) {
            this.queue[existing] = {
                version, projectId, attemptCount: 0, nextAttemptAt: Date.now(),
                ...(block ? { blocked: block } : {}),
                ...intent,
            };
        } else {
            if (this.queue.length >= HARD_QUEUE_CEILING && !this._evictOneSupersededItem()) {
                // §FIX-QUEUE-CAP-SILENT-EVICTION (L-1312) — REFUSE, do not evict.
                // Nothing queued is redundant, so dropping any of it would be a
                // silent loss of somebody's pending upload. Say so instead.
                console.error(
                    `[ServerSyncQueue] Retention ceiling reached (${this.queue.length}) with nothing superseded ` +
                    `to reclaim — REFUSING to queue "${version.label}" rather than evicting another project's ` +
                    'pending upload. The version is in local history; it is the UPLOAD that did not happen.',
                );
                this.onSyncStatusChange(version.id, projectId, 'local-only');
                this.onQueueOverflow(version, projectId, this.queue.length);
                return;
            }
            this.queue.push({
                version, projectId, attemptCount: 0, nextAttemptAt: Date.now(),
                ...(block ? { blocked: block } : {}),
                ...intent,
            });
        }

        // The soft target is now REPORTING, not deleting. A backlog above it means
        // the uploader is behind — worth saying out loud during a bulk re-save,
        // and never again a reason to remove somebody's pending upload.
        const active = this._activeCount();
        if (active > MAX_QUEUE_ITEMS && active % 25 === 0) {
            console.warn(
                `[ServerSyncQueue] ${active} uploads pending (soft target ${MAX_QUEUE_ITEMS}). ` +
                'All are retained — the queue no longer evicts to stay under the target.',
            );
        }

        this.onSyncStatusChange(version.id, projectId, block ? 'local-only' : 'sync-pending');
        this.persistQueue();
        if (block) {
            this.onSaveRejected(block.status, { ...block.body, blockedCode: block.code, blockedScope: block.scope });
            return;
        }
        this.scheduleFlush(500);
    }

    /**
     * §FIX-QUEUE-CAP-SILENT-EVICTION (L-1312) — reclaim exactly one slot, and only
     * from an item that is genuinely REDUNDANT: an older queued version of a
     * project for which a NEWER queued version also exists. The newer snapshot
     * records a later state of the same project, so reclaiming the older one
     * loses no work the queue would otherwise have delivered — and both remain in
     * local version history regardless.
     *
     * Returns false when nothing is superseded, which is the caller's signal to
     * refuse rather than to delete something that matters.
     */
    private _evictOneSupersededItem(): boolean {
        const newestIndexByProject = new Map<string, number>();
        this.queue.forEach((item, i) => newestIndexByProject.set(item.projectId, i));
        for (let i = 0; i < this.queue.length; i++) {
            const newest = newestIndexByProject.get(this.queue[i].projectId);
            if (newest !== undefined && newest !== i) {
                const victim = this.queue[i];
                console.warn(
                    '[ServerSyncQueue] Retention ceiling reached — reclaiming the slot held by superseded ' +
                    `version "${victim.version.label}" of project ${victim.projectId} ` +
                    '(a newer version of the SAME project is queued and records a later state).',
                );
                this.queue.splice(i, 1);
                return true;
            }
        }
        return false;
    }

    // ── Block state (replaces the session-wide plan latch) ────────────────────

    /**
     * The block in force for `projectId`, or null. The session block (401) wins
     * over a project block because it is strictly wider.
     */
    getSaveBlock(projectId: string): SaveBlock | null {
        return this._sessionBlock ?? this._projectBlocks.get(projectId) ?? null;
    }

    /**
     * Every retained-but-not-uploaded version, with the reason. ⭐ This is the
     * list a user can be SHOWN — the whole point of retaining rather than
     * discarding is that "did not reach the server" becomes enumerable.
     */
    getBlockedSaves(): ReadonlyArray<{ versionId: string; projectId: string; label: string; block: SaveBlock }> {
        return this.queue
            .filter((q): q is QueueItem & { blocked: SaveBlock } => q.blocked !== undefined)
            .map(q => ({ versionId: q.version.id, projectId: q.projectId, label: q.version.label, block: q.blocked }));
    }

    /**
     * Clear blocks and re-attempt what they were holding.
     *
     * ⛔ NOT a retry loop. Nothing calls this on a timer — it is called when the
     * EVENT named by `SaveBlock.retryable` actually happens (a sign-in, a plan
     * change). Retrying a 403 on a schedule would be a different bug.
     *
     * @param trigger which class of block to release; 'all' releases everything.
     * @returns how many retained uploads were re-armed.
     */
    unblock(trigger: RejectionRetryTrigger | 'all' = 'all'): number {
        const releases = (b: SaveBlock): boolean => trigger === 'all' || b.retryable === trigger;

        if (this._sessionBlock && releases(this._sessionBlock)) this._sessionBlock = null;
        for (const [projectId, b] of [...this._projectBlocks]) {
            if (releases(b)) this._projectBlocks.delete(projectId);
        }

        let released = 0;
        for (const item of this.queue) {
            if (item.blocked && releases(item.blocked)) {
                delete item.blocked;
                item.attemptCount = 0;
                item.nextAttemptAt = Date.now();
                this.onSyncStatusChange(item.version.id, item.projectId, 'sync-pending');
                released++;
            }
        }
        if (released > 0) {
            console.log(`[ServerSyncQueue] Released ${released} blocked upload(s) on "${trigger}" — re-attempting.`);
            this.persistQueue();
            this.scheduleFlush(500);
        }
        return released;
    }

    /**
     * True when saves for `projectId` are blocked (or, with no argument, when the
     * whole SESSION is blocked — i.e. 401 only).
     *
     * ⚠ The no-argument reading CHANGED MEANING in L-1310, deliberately: it used
     * to answer "has any plan rejection happened this session", and callers used
     * that to skip work for EVERY project. Pass the project id.
     */
    isPlanRejected(projectId?: string): boolean {
        if (projectId === undefined) return this._sessionBlock !== null;
        return this.getSaveBlock(projectId) !== null;
    }

    /** The response that produced the block, for diagnostics. */
    getPlanRejectionReason(projectId?: string): { status: number; body: Record<string, unknown> } | null {
        const b = projectId === undefined ? this._sessionBlock : this.getSaveBlock(projectId);
        return b ? { status: b.status, body: b.body } : null;
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

    /** §FIX-DB-SATURATION-RESILIENCE — true while the breaker is open (network paused). */
    private _isBreakerOpen(): boolean {
        return this._breakerOpenUntil > Date.now();
    }

    /** §FIX-DB-SATURATION-RESILIENCE — the server proved it is alive; close the breaker. */
    private _recordServerSuccess(): void {
        if (this._consecutiveServerFailures > 0 || this._breakerOpenUntil !== 0) {
            console.log('[ServerSyncQueue] Server responsive again — resetting circuit breaker.');
        }
        this._consecutiveServerFailures = 0;
        this._breakerOpenUntil = 0;
    }

    /** §FIX-DB-SATURATION-RESILIENCE — a server-health failure (5xx / timeout /
     *  network). Opens the breaker for a cooldown once the threshold is hit (and
     *  re-opens it on a failed half-open probe). */
    private _recordServerFailure(): void {
        this._consecutiveServerFailures++;
        if (this._consecutiveServerFailures >= BREAKER_FAILURE_THRESHOLD) {
            this._breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
            console.warn(
                `[ServerSyncQueue] Circuit breaker OPEN — ${this._consecutiveServerFailures} consecutive ` +
                `server failures; pausing sync for ${Math.round(BREAKER_COOLDOWN_MS / 1000)}s to avoid ` +
                'amplifying server load.',
            );
        }
    }

    /** §FIX-DB-SATURATION-RESILIENCE — test/diagnostic accessors. */
    isCircuitOpen(): boolean { return this._isBreakerOpen(); }
    getConsecutiveFailures(): number { return this._consecutiveServerFailures; }

    /** Items that flush() may still send: everything not blocked by a server "no". */
    private _activeCount(): number {
        return this.queue.reduce((n, item) => n + (item.blocked ? 0 : 1), 0);
    }

    /**
     * §FIX-REJECTED-SAVE-IS-NOT-A-COMPLETED-SAVE (L-1310) — record a terminal
     * server refusal WITHOUT deleting anything.
     *
     * Three properties, and each one is a defect that used to be here:
     *   1. **the payload is retained.** The item keeps its snapshot and appears in
     *      `getBlockedSaves()`. Only a 2xx removes an item from this queue.
     *   2. **the scope is the server's, not ours.** A per-project refusal marks
     *      that project. Other projects keep syncing — the old code emptied the
     *      whole queue for a 403 about one project.
     *   3. **it is surfaced.** `onSaveRejected` fires for EVERY terminal refusal,
     *      not only 401/403, so a 400 `invalid_id` can no longer be invisible.
     */
    private _applyRejection(
        item: QueueItem,
        status: number,
        body: Record<string, unknown>,
        fate = decideRejectionFate(status, body),
    ): void {
        if (fate.action !== 'block') return;

        const block: SaveBlock = {
            status,
            code: fate.code,
            scope: fate.scope,
            retryable: fate.retryable,
            detail: fate.detail,
            message: describeRejection(fate.code, fate.scope),
            at: Date.now(),
            body,
        };

        console.warn(
            `[ServerSyncQueue] Server refused "${item.version.label}" (${status} · ${fate.code} · scope ` +
            `${fate.scope}). RETAINED, not dropped. ${fate.detail}`,
            body,
        );

        const markBlocked = (q: QueueItem): void => {
            if (q.blocked) return;
            q.blocked = block;
            this.onSyncStatusChange(q.version.id, q.projectId, 'local-only');
        };

        switch (fate.scope) {
            case 'this-session':
                // 401 only. Genuinely everything — but retained, and released by
                // `unblock('on-sign-in')` rather than by a page reload.
                this._sessionBlock = block;
                this.queue.forEach(markBlocked);
                break;
            case 'this-project':
                this._projectBlocks.set(item.projectId, block);
                this.queue.forEach(q => { if (q.projectId === item.projectId) markBlocked(q); });
                break;
            case 'this-save':
            default:
                markBlocked(item);
                break;
        }

        this.persistQueue();
        this.onSaveRejected(status, { ...body, blockedCode: fate.code, blockedScope: fate.scope });
    }

    private async flush(): Promise<void> {
        if (this.isFlushing || !this.isOnline || this._activeCount() === 0) return;

        // §FIX-DB-SATURATION-RESILIENCE — while the breaker is OPEN, do not touch
        // the network; reschedule for just after the cooldown expires so we probe
        // exactly once when it does.
        if (this._isBreakerOpen()) {
            const wait = this._breakerOpenUntil - Date.now();
            this.scheduleFlush(Math.max(wait, 1_000) + 200);
            return;
        }

        this.isFlushing = true;
        const now = Date.now();

        // §FIX-REJECTED-SAVE-IS-NOT-A-COMPLETED-SAVE (L-1310) — a BLOCKED item is
        // retained but never re-sent. This is what keeps "refuse, retain, surface"
        // from turning into a retry loop against a 403.
        const ready = this.queue.filter(item => !item.blocked && item.nextAttemptAt <= now);

        // §FIX-DB-SATURATION-RESILIENCE — HALF-OPEN probe: if we are still in a
        // degraded state (failures at/above threshold but the cooldown just
        // elapsed), send a SINGLE item to test the water rather than the whole
        // backlog. A success closes the breaker; a failure re-opens it.
        const halfOpen = this._consecutiveServerFailures >= BREAKER_FAILURE_THRESHOLD;
        const batch = halfOpen ? ready.slice(0, 1) : ready;

        let rescheduleMs: number | null = null;

        for (const item of batch) {
            const success = await this.attemptSync(item);
            if (success) {
                this._recordServerSuccess();
            } else {
                this._recordServerFailure();
                const delay = backoffMs(item.attemptCount - 1);
                item.nextAttemptAt = Date.now() + delay;
                if (rescheduleMs === null || delay < rescheduleMs) {
                    rescheduleMs = delay;
                }
                // If this failure just opened the breaker, stop the batch now —
                // do not keep hammering a server we've decided to back off from.
                if (this._isBreakerOpen()) break;
            }
        }

        this.persistQueue();
        this.isFlushing = false;

        if (this._activeCount() > 0) {
            // If the breaker opened during this pass, honour its cooldown floor.
            if (this._isBreakerOpen()) {
                this.scheduleFlush(Math.max(this._breakerOpenUntil - Date.now(), 1_000) + 200);
                return;
            }
            const minDelay = this.queue.reduce((min, item) => {
                if (item.blocked) return min;
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
                    // §GUARD-EMPTY-SNAPSHOT (L-10040) — the escape hatch, and the
                    // ONLY thing that gets a bare snapshot past the server refusal.
                    // Present only for a save the USER asked for; an autosave never
                    // sets it, so the server guard keeps protecting every other
                    // caller. Omitted entirely otherwise, so the request bytes of a
                    // normal save are unchanged.
                    ...(item.emptyOverwriteIntent === true ? { force: true } : {}),
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
                        // §FIX-IFMATCH-INVENTED-A-COUNT (L-5830) — ⛔ `?? 0` WAS THE BUG.
                        //
                        // `prior + 1` is a sound inference ONLY when `prior` was itself
                        // learned from the server: versions are append-only, so one
                        // successful save adds exactly one. The `?? 0` turned "I have
                        // never been told this project's count" into the assertion
                        // "the server holds zero" — and the very next save then sent
                        // `If-Match: "v1"` at a server holding 746.
                        //
                        // OBSERVED on the founder's console, and it is the line that
                        // produced it verbatim:
                        //   §L-B2-RECONCILE 412 for "Auto-save" — expected 1, server
                        //   has 746. Re-basing count + retrying once.
                        // Every such 412 costs a WASTED POST of the entire snapshot
                        // body before the retry — a doubled multi-MB round trip on the
                        // save path, to enforce a precondition that was never true.
                        //
                        // Absent authority we now assert nothing: no entry means no
                        // `If-Match`, which the server reads as "no precondition" and
                        // appends. That is not a weakening — a GUESSED precondition
                        // detects no real concurrent writer, it only manufactures
                        // conflicts with itself.
                        //
                        // ⚠ SO THE LOCK IS OFF UNTIL AN AUTHORITATIVE COUNT ARRIVES,
                        // and today exactly two sources provide one: a 412 body's
                        // `actual`, and a POST response carrying a count — which
                        // `POST /api/projects/:id/versions` does NOT send from any of
                        // its three backends (`server.js`: the Supabase RPC returns
                        // `to_jsonb(project_versions row)`, the Supabase fallback
                        // selects five columns, the PG path returns the version row,
                        // and the in-memory path returns a hand-built literal — none
                        // carries `version_count`, which lives on `projects`). The
                        // reader above has always looked for four spellings of a field
                        // the server never sends, so the guess was not a rare fallback
                        // — it was the ONLY path. Making one of those three return
                        // sites authoritative is what restores the lock; see
                        // ISSUE-LOG L-5831.
                        const prior = this._serverVersionCountByProject.get(projectId);
                        if (prior !== undefined) {
                            this._serverVersionCountByProject.set(projectId, prior + 1);
                        }
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
                // §FIX-REJECTED-SAVE-IS-NOT-A-COMPLETED-SAVE (L-1310) — this used to
                // `filter` the item OUT of the queue. It now stays, blocked at
                // 'this-save' scope, so the version is enumerable in
                // `getBlockedSaves()` instead of vanishing. Later saves of the same
                // project are unaffected: the block is per-save, not per-project.
                this._reconciledVersionIds.delete(version.id);
                // Reset the cache: the next save will go without If-Match (or
                // with a fresh count once a reload-and-re-init happens).
                this._serverVersionCountByProject.delete(projectId);
                this._applyRejection(item, 412, {
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

                // §FIX-REJECTED-SAVE-IS-NOT-A-COMPLETED-SAVE (L-1310).
                //
                // WAS: every 4xx deleted the payload from the queue, and a
                // plan-gating 401/403 additionally EMPTIED the queue and latched a
                // session-wide flag that made every later enqueue() a silent no-op.
                // See the `_sessionBlock` field comment for the measured
                // consequence — after the first 403 nothing could reach the server
                // again for the rest of the session.
                //
                // NOW: the policy is a pure function with no 'discard' arm, and the
                // refusal is applied AT ITS OWN SCOPE. `handleProjectApiError`
                // (server/errors.js) already separates terminal from retryable on
                // the server side; the only thing missing was a client that
                // respected the distinction without over-generalising it.
                const fate = decideRejectionFate(res.status, body);
                if (fate.action === 'retry') {
                    item.attemptCount++;
                    console.warn(
                        `[ServerSyncQueue] ${res.status} for "${version.label}" is not a terminal refusal ` +
                        `(${fate.detail}) — attempt ${item.attemptCount}, retained and retried with backoff.`,
                    );
                    return false;
                }

                this._applyRejection(item, res.status, body, fate);
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
            // §VERSION-QUOTA-INDEXEDDB — clear from BOTH stores so neither resurrects.
            try { getVersionCacheStore().clearSyncQueue(); } catch { /* non-fatal */ }
            try { localStorage.removeItem(QUEUE_STORAGE_KEY); } catch { /* localStorage unavailable */ }
            return;
        }

        const serialisable: SerialisableQueueItem[] = this.queue.map(item => ({
            version: item.version,
            projectId: item.projectId,
            attemptCount: item.attemptCount,
            nextAttemptAt: item.nextAttemptAt,
            // §FIX-REJECTED-SAVE-IS-NOT-A-COMPLETED-SAVE (L-1310) — the REASON travels
            // with the payload. Without it a reload would re-attempt a refusal the
            // server has already given (a retry loop against a 403) and, worse, would
            // lose the only record of why the version never uploaded.
            ...(item.blocked ? { blocked: item.blocked } : {}),
            // §GUARD-EMPTY-SNAPSHOT (L-10040) — the INTENT travels with the payload
            // too. A manual "yes, empty it" that has not uploaded before a reload
            // would otherwise come back without `force` and collect a 409 from the
            // guard the user already overrode.
            ...(item.emptyOverwriteIntent === true ? { emptyOverwriteIntent: true } : {}),
        }));

        // §VERSION-QUOTA-INDEXEDDB (2026-06-25) — PRIMARY persistence is IndexedDB,
        // whose quota (hundreds of MB+) easily holds full VersionRecord snapshots.
        // Each queue item carries an entire serialised BIM scene; on a large project
        // even ONE item exceeded the ~1.5 MB localStorage byte budget, so the newest
        // autosave could not survive a reload. IDB persists the WHOLE queue verbatim
        // (no budget trimming) and never throws.
        const store = getVersionCacheStore();
        if (!store.isDisabled()) {
            store.putSyncQueue(JSON.stringify(serialisable));   // mirror sync + IDB async
            // Drop any stale legacy localStorage queue so a cold-mirror load can't
            // resurrect an outdated (trimmed) copy from the fallback path.
            try { localStorage.removeItem(QUEUE_STORAGE_KEY); } catch { /* ignore */ }
            return;
        }

        // ── Fallback: IndexedDB unavailable → preserve the original byte-budgeted
        // localStorage persistence (graceful degrade, never crash). ─────────────
        // §SYNC-QUEUE-QUOTA — trim to the byte budget BEFORE the write so the
        // serialised payload is bounded. Then write with a quota-aware retry: if
        // the environment's real quota is still exceeded (other localStorage
        // consumers, smaller browser limit), drop the oldest surviving item and
        // retry, so we always persist the NEWEST autosaves rather than losing the
        // whole queue. This is the data-safety fix: a reload now recovers the most
        // recent queued versions instead of an all-or-nothing drop.
        const built = buildPersistedQueuePayload(serialisable);
        if (built === null) {
            console.warn(
                '[ServerSyncQueue] Newest queued version exceeds the persist byte budget ' +
                `(~${PERSIST_BYTE_BUDGET} bytes) — cannot persist it to localStorage. ` +
                'It stays in memory and will retry this session, but will NOT survive a reload.',
            );
            return;
        }
        if (built.dropped > 0) {
            console.warn(
                `[ServerSyncQueue] Persist budget reached — keeping the ${serialisable.length - built.dropped} ` +
                `newest queued version(s), dropping ${built.dropped} oldest from the PERSISTED copy ` +
                '(still retried in memory this session).',
            );
        }

        // candidate = the items we will actually try to write (newest suffix).
        let candidate = serialisable.slice(built.dropped);
        let json = built.json;
        // Retry loop: at most one write per surviving item.
        for (;;) {
            try {
                localStorage.setItem(QUEUE_STORAGE_KEY, json);
                return;
            } catch (err) {
                const name = (err as { name?: string } | null)?.name ?? '';
                const isQuota =
                    name === 'QuotaExceededError' ||
                    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
                    // Some engines report quota as code 22 with no useful name.
                    (err as { code?: number } | null)?.code === 22;
                if (isQuota && candidate.length > 1) {
                    // Drop the oldest surviving item and retry with the rest.
                    candidate = candidate.slice(1);
                    json = JSON.stringify(candidate);
                    console.warn(
                        `[ServerSyncQueue] localStorage quota exceeded — dropping oldest persisted item, ` +
                        `retrying with ${candidate.length} item(s).`,
                    );
                    continue;
                }
                // Non-quota error, or we are down to a single item that still
                // won't fit. Log the REAL reason and fail safe (in-memory queue
                // is intact; this session still retries the network sync).
                console.warn(
                    '[ServerSyncQueue] Could not persist queue to localStorage ' +
                    `(${name || 'unknown error'}) — in-memory queue preserved, server retries continue. ` +
                    'Queued autosaves may not survive a reload.',
                    err,
                );
                return;
            }
        }
    }

    private loadPersistedQueue(): void {
        // §VERSION-QUOTA-INDEXEDDB — the queue now lives in IndexedDB (read via a
        // synchronous mirror), with legacy localStorage as a fallback. At construction
        // the mirror is usually COLD (warm() is async), so this synchronous pass picks
        // up the legacy localStorage copy if present, and an async warm below loads the
        // IDB-resident queue (the durable, untrimmed one) and merges it in.
        const store = getVersionCacheStore();
        this._applyPersistedQueue(store.getSyncQueueSync() ?? localStorage.getItem(QUEUE_STORAGE_KEY));

        if (!store.isDisabled()) {
            store.warm().then(() => {
                const raw = store.getSyncQueueSync();
                if (!raw) return;
                const before = this.queue.length;
                this._applyPersistedQueue(raw);
                if (this.queue.length > before || before === 0) {
                    if (this.queue.length > 0) this.scheduleFlush(3000);
                }
            }).catch(() => { /* non-fatal — in-memory queue (if any) still retries */ });
        }
    }

    /** Parse a persisted queue JSON blob into `this.queue` (capped, backoff reset).
     *  Never throws; a malformed blob leaves the current queue untouched. */
    private _applyPersistedQueue(raw: string | null | undefined): void {
        if (!raw) return;
        try {
            const items = JSON.parse(raw) as QueueItem[];
            if (!Array.isArray(items)) return;
            // §FIX-QUEUE-CAP-SILENT-EVICTION (L-1312) — was `slice(0, MAX_QUEUE_ITEMS)`,
            // which keeps the OLDEST 50 and silently discards everything newer. On a
            // restored bulk backlog that is the exact inversion of what matters: the
            // newest queued version of a project supersedes the older ones. Keep the
            // newest, and SAY when anything was left behind.
            if (items.length > HARD_QUEUE_CEILING) {
                console.error(
                    `[ServerSyncQueue] Restored queue holds ${items.length} item(s), above the retention ` +
                    `ceiling of ${HARD_QUEUE_CEILING}. Keeping the ${HARD_QUEUE_CEILING} NEWEST; ` +
                    `${items.length - HARD_QUEUE_CEILING} older queued upload(s) were not restored. ` +
                    'Their versions remain in local history — it is the upload that was not resumed.',
                );
            }
            this.queue = items.slice(-HARD_QUEUE_CEILING);
            // Re-adopt persisted blocks so a reload does not re-POST a known refusal.
            for (const item of this.queue) {
                if (!item.blocked) continue;
                if (item.blocked.scope === 'this-session') this._sessionBlock = item.blocked;
                else if (item.blocked.scope === 'this-project') this._projectBlocks.set(item.projectId, item.blocked);
            }
            this.queue.forEach(item => {
                item.nextAttemptAt = Date.now() + 5000;
            });
        } catch {
            // leave existing queue as-is on a parse failure
        }
    }
}
