/**
 * SaveOrchestrator — Reactive save trigger layer (Phase 1 + Phase 2).
 *
 * Replaces the 18-event list + 5-minute interval in PlatformShell with a
 * robust orchestrator that:
 *   • Subscribes to all known BIM store mutation events (and 'bim-store-mutated')
 *   • Debounces at 1 000 ms before triggering a save
 *   • Compares a content hash so undo-to-saved-state does NOT re-save
 *   • Guards against concurrent save, load-in-progress, and version-preview mode
 *   • Flushes an emergency localStorage save on 'beforeunload'
 *   • Emits a SaveStatus state-machine value for the toolbar
 *
 * Contract compliance:
 *   §06 §1  — No BIM engine imports. All store access is via the injected
 *             `getHash` and `onAutoSave` callbacks supplied by PlatformShell.
 *   §01 §2.1 — Does NOT mutate any store. Read-only access via callbacks.
 *   §06 §7  — localStorage writes remain exclusively in ProjectRepository.
 *             The orchestrator never touches localStorage directly.
 */

import { SaveStatus } from './PlatformShellTypes';

export type { SaveStatus };

export interface SaveOrchestratorOptions {
    /**
     * Returns a serialised string of the current project state. Used to detect
     * real content changes (hash comparison). Called only when the debounce fires,
     * not on every mutation event — so the serialisation cost is bounded to once
     * per DEBOUNCE_MS at most.
     */
    getHash: () => string;

    /**
     * Called by the orchestrator when it decides a save should occur.
     * The implementation in PlatformShell writes to localStorage and enqueues
     * a server sync. Must be synchronous (localStorage is synchronous); any
     * async tail (server POST) is fire-and-forget inside the implementation.
     */
    onAutoSave: (label: string) => void;

    /**
     * Optional: called whenever the SaveStatus state machine transitions.
     * The toolbar uses this to show: Saved / Unsaved changes / Saving… / etc.
     */
    onSaveStatusChange?: (status: SaveStatus) => void;

    /** Debounce window in milliseconds. Defaults to 1 000 ms. */
    debounceMs?: number;
}

/**
 * All DOM events that signal a BIM store mutation.
 *
 * 'bim-store-mutated' is a single synthetic aggregator event that each store
 * should emit on any write (Option A from the implementation plan). The full
 * list below ensures backward compatibility while stores are migrated.
 *
 * ⛔ §VIEWLOAD36-AUTHORING-IS-A-MUTATION (L-10700) — READ THIS BEFORE ADDING A STORE.
 *
 * "Option A" NEVER LANDED. `bim-store-mutated` is dispatched by exactly ONE
 * production file (`PlatformProjectBrowser.ts:161`); `StoreEventBus` — the bus
 * every store DOES emit into — dispatches no window event at all. So this list is
 * not a "backward-compatibility" fallback, it is THE WHOLE TRIGGER, and anything
 * absent from it is a subsystem whose authored work is never saved.
 *
 * It held forty `bim-*` ELEMENT events and nothing else. Views, sheets, schedules
 * and annotations are all serialised by `ProjectSerializer` and were all missing,
 * so authoring them marked the project CLEAN: no debounce armed, no
 * `beforeunload` flush (it returns early on `!hasDirtyChanges`), nothing written.
 * The founder authored an RCP, a Structural plan, a Render view, a Drafting view
 * and a sheet, closed the tab, and reopened a project carrying exactly the six
 * views `DefaultViewsManager` mints from code and the sixteen schedules
 * `ScheduleStore.seedDefaultSchedules()` seeds from code. Nothing was dropped by
 * the loader — nothing was ever written.
 *
 * ⭐ THE RULE, so this cannot rot again: **if `ProjectSerializer` persists a
 * store, that store's authoring events belong in this list.** A store added to
 * the snapshot and not added here is silent data loss, not a missing feature.
 * `viewSheetAuthoringSurvivesReload.test.ts` drives the REAL stores against a
 * REAL orchestrator and fails if any of the four families stops arming a save.
 *
 * ⚠ `*:store-loaded` / `*:store-reset` are deliberately NOT here: they fire from
 * `deserialize()` / `reset()` — i.e. DURING a load — and are load lifecycle, not
 * authoring. (`isLoading` would discard them anyway; keeping them out means the
 * list does not depend on that guard being correct.)
 */
const MUTATION_EVENTS: ReadonlyArray<string> = [
    'bim-store-mutated',
    'bim-wall-added',        'bim-wall-updated',      'bim-wall-removed',
    'bim-slab-added',        'bim-slab-updated',      'bim-slab-removed',
    'bim-furniture-added',   'bim-furniture-updated', 'bim-furniture-removed',
    'bim-roof-added',        'bim-roof-removed',
    'bim-opening-added',     'bim-opening-removed',
    'beam-store-update',
    'bim-level-added',       'bim-level-removed',
    'bim-stair-added',       'bim-stair-removed',
    'curtainwall-store-update',
    'bim-column-added',      'bim-column-updated',    'bim-column-removed',
    'bim-handrail-added',    'bim-handrail-removed',
    'bim-plumbing-added',    'bim-plumbing-removed',
    'bim-beam-added',        'bim-beam-removed',
    'bim-grid-added',        'bim-grid-updated',      'bim-grid-removed',
    // Grid commands also dispatch un-prefixed names (AddGrid/UpdateGrid/RemoveGrid).
    // §13 §8: include them so add/update/remove all mark the project dirty.
    'grid-added',            'grid-updated',          'grid-removed',
    'bim-curtainwall-added', 'bim-curtainwall-removed',
    'bim-window-added',      'bim-window-removed',
    'bim-door-added',        'bim-door-removed',

    // ── §VIEWLOAD36-AUTHORING-IS-A-MUTATION (L-10700) — the DOCUMENT families ──
    //
    // Every name below is dispatched by a store that `ProjectSerializer` writes
    // into the snapshot (`viewDefinitions:1459`, `sheets:1538`, `schedules:1541`),
    // so every one of them changes what a save would write.

    // ViewDefinitionStore (core-app-model/views/ViewDefinitionStore.ts) — the RCP,
    // Structural, Render and Drafting views the founder lost are `vd:view-created`.
    'vd:view-created',       'vd:view-updated',       'vd:view-deleted',
    'vd:view-range-changed', 'vd:drawing-scale-changed',
    'vd:projection-changed', 'vd:rules-changed',
    'vd:template-changed',   'vd:template-override-changed',
    'vd:design-option-changed',

    // SheetStore — `sd:sheet-updated` also covers viewport add/remove/move/scale,
    // which is how a sheet's PLACED VIEWS are persisted (the "a001 — SWEG" sheet
    // carried two viewports and neither the sheet nor the viewports were saved).
    'sd:sheet-created',      'sd:sheet-updated',      'sd:sheet-deleted',

    // ScheduleStore — a user-authored schedule is lost the same way; the sixteen
    // a fresh project shows are `seedDefaultSchedules()` output, not saved data.
    'sched:schedule-created', 'sched:schedule-updated', 'sched:schedule-deleted',

    // TitleBlockStore — §TITLE-BLOCK-EDIT-FORKS (L-10690) LEG 3 of 3, and the leg
    // that actually failed the founder in L-10700: the store was correct and
    // NOTHING MARKED THE PROJECT DIRTY, so no debounce armed and
    // `flushBeforeUnload()` returned early on `!hasDirtyChanges`. A user's own
    // title block is authored work and is lost the same way.
    // ⛔ `tb:store-loaded` is deliberately EXCLUDED — it fires during a load.
    'tb:template-created',   'tb:template-updated',   'tb:template-deleted',

    // AnnotationStore (plugins/annotations) has NO window events of its own — it
    // emits only on `storeEventBus`, which dispatches nothing. It broadcasts
    // 'bim-store-mutated' (already first in this list) as of L-10701; see
    // `plugins/annotations/src/subsystem/AnnotationStore.ts`.
];

/**
 * @deprecated TODO(C.11.02) — Phase C exit gate.  Replaced by
 *   `runtime.persistence.eventLog.tag('user-version', {label})` (C.6.04) +
 *   `runtime.events.on('persistence.status', ...)` (C.6.01).  Deletion
 *   blocked on `PlatformShell.ts` migrating its single instantiation
 *   (line 698) and `saveVersionInternal()` to `runtime.persistence.*`.
 *   See `docs/archive/pryzm3-internal/00_NEW_ARCHITECTURE/phases/audits/PHASES-A-F-RECONCILIATION-2026-04-29/03-phase-C-audit-and-plan.md`
 *   §"C-cleanup.2".
 */
export class SaveOrchestrator {
    readonly DEBOUNCE_MS: number;

    private debounceTimer: ReturnType<typeof setTimeout> | null = null;

    /** A save is currently executing (serialise + localStorage + queue enqueue). */
    private isSaving: boolean = false;

    /** ProjectLoader.load() is running — discard all dirty signals. */
    private isLoading: boolean = false;

    /** User is previewing an old version — pause autosave. */
    private isVersionPreviewMode: boolean = false;

    /** True when a mutation was received but could not be acted on immediately. */
    private pendingSave: boolean = false;

    /** The serialised string from the last successful save. */
    private lastHash: string = '';

    /** Whether the content has changed since the last save. */
    private hasDirtyChanges: boolean = false;

    private currentStatus: SaveStatus = 'idle';

    /**
     * PERF-FIX (Apr 2026): Post-load settle window.
     * Project load triggers a cascade of follow-up mutations (room re-detection,
     * wall join refresh, etc.) that previously fired an autosave within ~1 s of
     * `pryzm-project-loaded`. Re-serialising a 50 MB+ snapshot at that moment
     * caused multi-second LONGTASKs on the post-load critical path.
     * While `Date.now() < _settleUntil`, mutations still mark dirty state but
     * `executeSave()` defers itself to the settle deadline, so all post-load
     * cleanup mutations coalesce into a single autosave once the model is calm.
     */
    private _settleUntil: number = 0;

    /**
     * §AUTOSAVE-BATCH-SUPPRESS (2026-06-26) — number of batch windows currently
     * open. A multi-level generation (furnish-all-floors) runs ONE
     * `batchCoordinator.runBatch()` per level; each fires `pryzm-batch-started`
     * then `pryzm-batch-ended`. While `_batchDepth > 0` mutations still mark the
     * project dirty, but `executeSave()` DEFERS — so the dozens of per-fixture /
     * per-level mutations coalesce into ONE autosave at the end instead of the
     * repeated full-project serialize+compress the founder saw mid-furnish. The
     * depth counter coalesces back-to-back per-level batches: a brief gap between
     * two batches must NOT trip a save, so on the drain-to-zero we open a short
     * settle window (`_BATCH_SETTLE_MS`) and only then schedule the single save.
     */
    private _batchDepth: number = 0;

    /**
     * §AUTOSAVE-SUPPRESS-DURING-LOAD (2026-07-02) — boolean latch, TRUE for the
     * entire load/restore window. Unlike the caller-driven `isLoading` flag (which
     * closes the moment `loadAdapter.load()`'s promise resolves), this latch is
     * driven by ProjectLoader itself via `pryzm-load-suppress-begin` /
     * `pryzm-load-suppress-end`, so it stays set across the fire-and-forget post-load
     * redetect + wall-resolve sweep that continues AFTER load() resolves — the exact
     * window in which ADR-0098 F2's "post-load rebuild storm" fires the mutations that
     * used to trigger a full 22.7 MB snapshot serialize mid-load (the reported freeze).
     * Modelled as a boolean latch (not a ref-count) so a stale/cancelled load's END
     * cannot prematurely re-enable autosave for a fresher load: `setLoading(true)`
     * clears it on every new load, and only a matching `-end` clears it otherwise.
     */
    private _loadSuppressActive: boolean = false;

    /** Settle window opened when the last batch drains, so consecutive per-level
     *  batches in one generation coalesce into a single autosave. */
    private static readonly _BATCH_SETTLE_MS = 1500;

    private readonly getHash: () => string;
    private readonly onAutoSave: (label: string) => void;
    private readonly onSaveStatusChange: (status: SaveStatus) => void;

    private readonly mutationHandler: () => void;
    private readonly clearHandler: () => void;
    private readonly beforeUnloadHandler: () => void;
    private readonly batchStartHandler: () => void;
    private readonly batchEndHandler: () => void;
    private readonly loadSuppressBeginHandler: () => void;
    private readonly loadSuppressEndHandler: () => void;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(options: SaveOrchestratorOptions, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        // §PERF-AUTOSAVE-DEBOUNCE (2026-06-27) — autosave does a FULL-project
        // serialize (793 elements → ~16.6 MB) TWICE per fire (once in getHash()
        // for the dirty-check, once in saveVersionInternal for the snapshot) plus
        // a main-thread deflate, on EVERY edit-burst. On a large 7-level building
        // a 1 s debounce re-pays that whole cost ~1 s after the user pauses even
        // briefly mid-edit. Widening the default to 2.5 s coalesces a rapid
        // edit-session (drag, nudge, retype) into far fewer heavy saves while
        // staying well inside the beforeunload emergency-flush safety net (which
        // still writes localStorage synchronously on tab close, so no edit is
        // lost). Callers can still override via options.debounceMs.
        this.DEBOUNCE_MS = options.debounceMs ?? 2500;
        this.getHash = options.getHash;
        this.onAutoSave = options.onAutoSave;
        this.onSaveStatusChange = options.onSaveStatusChange ?? (() => { });

        this.mutationHandler = () => this.handleMutation();
        this.clearHandler = () => {
            this.hasDirtyChanges = false;
            this.pendingSave = false;
            // §AUTOSAVE-BATCH-SUPPRESS — a project clear/switch ends any open batch
            // window; reset the depth so a forceReset that skipped the end event can
            // never leave autosave permanently suppressed.
            this._batchDepth = 0;
            this.cancelDebounce();
            this.setStatus('idle');
            // NOTE: intentionally do NOT clear _loadSuppressActive here — a
            // `bim-project-cleared` fires from ClearProjectCommand DURING a load (it is
            // the load's first step), so clearing the latch here would re-open autosave
            // for the rest of that same load. The latch is owned solely by the
            // load-suppress-begin/-end pair (+ setLoading reset on a new load).
        };
        this.beforeUnloadHandler = () => this.flushBeforeUnload();
        this.batchStartHandler = () => this.handleBatchStart();
        this.batchEndHandler = () => this.handleBatchEnd();
        this.loadSuppressBeginHandler = () => this.handleLoadSuppressBegin();
        this.loadSuppressEndHandler = () => this.handleLoadSuppressEnd();

        MUTATION_EVENTS.forEach(evt => window.addEventListener(evt, this.mutationHandler));
        window.addEventListener('bim-project-cleared', this.clearHandler);
        window.addEventListener('beforeunload', this.beforeUnloadHandler);
        // §AUTOSAVE-BATCH-SUPPRESS — coalesce a multi-batch generation to one save.
        window.addEventListener('pryzm-batch-started', this.batchStartHandler);
        window.addEventListener('pryzm-batch-ended', this.batchEndHandler);
        // §AUTOSAVE-SUPPRESS-DURING-LOAD — suppress autosave for the WHOLE load window
        // (incl. the fire-and-forget post-load sweep), driven by ProjectLoader.
        window.addEventListener('pryzm-load-suppress-begin', this.loadSuppressBeginHandler);
        window.addEventListener('pryzm-load-suppress-end', this.loadSuppressEndHandler);

        console.log('[SaveOrchestrator] Initialised — debounce:', this.DEBOUNCE_MS, 'ms');
    }

    // ── Internal state machine ────────────────────────────────────────────────

    private setStatus(status: SaveStatus): void {
        if (this.currentStatus === status) return;
        this.currentStatus = status;
        this.onSaveStatusChange(status);
    }

    private handleMutation(): void {
        if (this.isLoading) {
            return;
        }
        // §AUTOSAVE-SUPPRESS-DURING-LOAD — post-load sweep mutations: mark dirty so the
        // toolbar reflects unsaved state, but do NOT arm the debounce; the single save
        // is re-armed by handleLoadSuppressEnd() once the load fully settles.
        if (this._loadSuppressActive) {
            this.hasDirtyChanges = true;
            this.pendingSave = true;
            this.setStatus('pending');
            return;
        }
        if (this.isVersionPreviewMode) {
            this.pendingSave = true;
            return;
        }
        if (this.isSaving) {
            this.pendingSave = true;
            return;
        }
        this.scheduleDebounce();
    }

    private scheduleDebounce(): void {
        this.hasDirtyChanges = true;
        this.setStatus('pending');
        this.cancelDebounce();
        this.debounceTimer = setTimeout(() => this.executeSave(), this.DEBOUNCE_MS);
    }

    private cancelDebounce(): void {
        if (this.debounceTimer !== null) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }

    private executeSave(): void {
        if (!this.hasDirtyChanges) return;
        // Belt-and-suspenders: the debounce is always cancelled when
        // setLoading(true) is called, but guard here as well in case a
        // future refactor changes that invariant.
        if (this.isLoading) return;

        // §AUTOSAVE-SUPPRESS-DURING-LOAD — a project load/restore is in progress,
        // including its fire-and-forget post-load sweep. Keep the project marked dirty
        // but DEFER the serialize: handleLoadSuppressEnd() re-arms the debounce once the
        // load fully settles, so the whole open produces exactly ONE post-load snapshot
        // instead of a serialize storm mid-load (ADR-0098 F2 freeze).
        if (this._loadSuppressActive) {
            this.cancelDebounce();
            this.setStatus('pending');
            return;
        }

        // §AUTOSAVE-BATCH-SUPPRESS — a bulk generation is mid-flight (one or more
        // runBatch windows open). Keep the project marked dirty but defer the save;
        // handleBatchEnd() re-arms the debounce once every batch has drained, so the
        // whole multi-level furnish/generate produces exactly one snapshot write.
        if (this._batchDepth > 0) {
            this.cancelDebounce();
            this.setStatus('pending');
            return;
        }

        // PERF-FIX (Apr 2026): During the post-load settle window, defer the
        // actual save to the settle deadline so the post-load mutation storm
        // produces ONE autosave rather than several heavy snapshot writes.
        const now = Date.now();
        if (now < this._settleUntil) {
            this.cancelDebounce();
            this.debounceTimer = setTimeout(
                () => this.executeSave(),
                Math.max(50, this._settleUntil - now),
            );
            return;
        }

        const currentHash = this.getHash();
        if (this.lastHash !== '' && currentHash === this.lastHash) {
            console.log('[SaveOrchestrator] Content hash unchanged — save skipped');
            this.hasDirtyChanges = false;
            this.setStatus('idle');
            return;
        }

        this.isSaving = true;
        this.pendingSave = false;
        this.setStatus('saving');

        try {
            this.onAutoSave('Auto-save');
            this.lastHash = currentHash;
            this.hasDirtyChanges = false;
            this.setStatus('idle');
        } catch (err) {
            console.error('[SaveOrchestrator] Auto-save failed:', err);
            this.setStatus('error');
        } finally {
            this.isSaving = false;
            if (this.pendingSave) {
                this.pendingSave = false;
                this.scheduleDebounce();
            }
        }
    }

    // ── beforeunload emergency flush ──────────────────────────────────────────

    /**
     * Called synchronously in 'beforeunload'. Triggers a localStorage-only save
     * (the synchronous path of onAutoSave completes; any async server tail is
     * fire-and-forget and will be retried by ServerSyncQueue next session).
     */
    private flushBeforeUnload(): void {
        if (!this.hasDirtyChanges) return;
        // Project-isolation: NEVER save during a load.  At this point the
        // projectId has already been updated to the incoming project but the
        // stores have NOT been cleared yet.  Saving here would write the
        // previous project's elements under the new project's localStorage key.
        if (this.isLoading) {
            console.log('[SaveOrchestrator] Emergency save skipped — load in progress (project switch race)');
            return;
        }

        const currentHash = this.getHash();
        if (this.lastHash !== '' && currentHash === this.lastHash) return;

        try {
            this.cancelDebounce();
            this.onAutoSave('Emergency save (tab closed)');
            console.log('[SaveOrchestrator] Emergency save triggered (beforeunload)');
        } catch (err) {
            console.error('[SaveOrchestrator] Emergency save failed in beforeunload:', err);
        }
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Called by PlatformShell before and after ProjectLoader.load() runs.
     * While loading=true, all mutation events are silently discarded.
     */
    setLoading(isLoading: boolean): void {
        this.isLoading = isLoading;
        if (isLoading) {
            // §AUTOSAVE-BATCH-SUPPRESS — a load supersedes any in-flight batch.
            this._batchDepth = 0;
            // §AUTOSAVE-SUPPRESS-DURING-LOAD — a new load supersedes any stale
            // suppression latch left by a cancelled/interrupted prior load. The new
            // load's own `pryzm-load-suppress-begin` (fired from ProjectLoader) re-sets
            // it immediately; resetting here means a stale prior `-end` can never leave
            // suppression falsely OFF at the start of this load.
            this._loadSuppressActive = false;
            this.cancelDebounce();
            // Clear any stale dirty state from the previous project immediately.
            // This ensures flushBeforeUnload() finds hasDirtyChanges=false if it
            // fires during the async load (the isLoading guard above is the primary
            // defence; this is a belt-and-suspenders secondary defence).
            this.hasDirtyChanges = false;
            this.pendingSave = false;
            // Reset hash so the next resetDirtyAfterLoad() captures fresh state.
            this.lastHash = '';
            this.setStatus('idle');
        } else {
            // PERF-FIX (Apr 2026): Open a 4 s post-load settle window. Any
            // mutations triggered by post-load cleanup (room re-detection,
            // wall joins, view rebuilds) are coalesced into a single autosave
            // that fires once the deadline passes.
            this._settleUntil = Date.now() + 4000;
        }
    }

    // ── §AUTOSAVE-BATCH-SUPPRESS: bulk-generation coalescing ──────────────────

    /**
     * Fired on `pryzm-batch-started`. Marks a batch window open so executeSave()
     * defers. Ref-counted because a multi-level generation opens several batch
     * windows in sequence (and they may briefly overlap). Cancels any in-flight
     * debounce so a save already armed by the first mutations of the batch does
     * not fire mid-generation.
     */
    private handleBatchStart(): void {
        this._batchDepth++;
        this.cancelDebounce();
        // Mutations during the batch are real changes — reflect "pending" so the
        // toolbar shows unsaved work, but the actual write waits for drain.
        if (this.hasDirtyChanges) this.setStatus('pending');
    }

    /**
     * Fired on `pryzm-batch-ended`. Decrements the ref-count; when the LAST batch
     * window drains, opens a short settle window and (if anything is dirty)
     * schedules the single coalesced autosave. The settle window prevents a brief
     * inter-batch gap in a multi-level furnish from arming a premature save.
     */
    private handleBatchEnd(): void {
        if (this._batchDepth > 0) this._batchDepth--;
        if (this._batchDepth > 0) return;

        // Coalesce consecutive per-level batches: a save armed now would still see
        // _settleUntil in the future and defer to the deadline (executeSave's
        // settle-window branch), so back-to-back batches collapse to one write.
        this._settleUntil = Math.max(
            this._settleUntil,
            Date.now() + SaveOrchestrator._BATCH_SETTLE_MS,
        );
        if (this.hasDirtyChanges || this.pendingSave) {
            this.pendingSave = false;
            this.scheduleDebounce();
        }
    }

    // ── §AUTOSAVE-SUPPRESS-DURING-LOAD: load-window coalescing ────────────────

    /**
     * Fired on `pryzm-load-suppress-begin` (dispatched by ProjectLoader at the very
     * start of a load). Latches suppression ON and cancels any armed debounce so a
     * save queued by the previous project cannot fire mid-load.
     */
    private handleLoadSuppressBegin(): void {
        this._loadSuppressActive = true;
        this.cancelDebounce();
    }

    /**
     * Fired on `pryzm-load-suppress-end` (dispatched by ProjectLoader once the load
     * AND its fire-and-forget post-load sweep have fully drained). Clears the latch
     * and — if the load produced dirty state — arms exactly ONE coalesced autosave so
     * the just-settled project is persisted. resetDirtyAfterLoad() (called by the load
     * caller) may have already cleared dirty state, in which case nothing fires.
     */
    private handleLoadSuppressEnd(): void {
        this._loadSuppressActive = false;
        if (this.isLoading) return; // caller still owns the primary load fence
        if (this.hasDirtyChanges || this.pendingSave) {
            this.pendingSave = false;
            this.scheduleDebounce();
        }
    }

    /**
     * Called when entering/leaving version preview mode.
     * While in preview mode the save status becomes 'paused'; any pending dirty
     * state is preserved so autosave resumes immediately when preview ends.
     */
    setVersionPreviewMode(isPreview: boolean): void {
        this.isVersionPreviewMode = isPreview;
        if (isPreview) {
            this.cancelDebounce();
            this.setStatus('paused');
        } else {
            if (this.hasDirtyChanges || this.pendingSave) {
                this.pendingSave = false;
                this.scheduleDebounce();
            } else {
                this.setStatus('idle');
            }
        }
    }

    /**
     * Called after a manual save completes. Resets the dirty state and sets the
     * content-hash baseline so the next autosave only fires on real changes.
     *
     * @param hash - Optional: the serialised hash of the just-saved snapshot.
     *               If omitted, the next mutation will recompute it.
     */
    markClean(hash?: string): void {
        this.hasDirtyChanges = false;
        this.pendingSave = false;
        this.cancelDebounce();
        if (hash !== undefined) {
            this.lastHash = hash;
        }
        if (this.currentStatus !== 'paused') {
            this.setStatus('idle');
        }
    }

    /**
     * Called after ProjectLoader.load() completes. Serialises the just-loaded
     * state and stores it as the hash baseline so autosave won't fire until
     * the user makes a real change.
     */
    resetDirtyAfterLoad(): void {
        try {
            const hash = this.getHash();
            this.markClean(hash);
        } catch {
            this.markClean();
        }
    }

    /** Current save status — useful for UI queries without subscribing. */
    getStatus(): SaveStatus {
        return this.currentStatus;
    }

    /** True when there are unsaved changes not yet written to localStorage. */
    isDirty(): boolean {
        return this.hasDirtyChanges;
    }

    /**
     * Release all event listeners. Call from PlatformShell.dispose().
     */
    dispose(): void {
        this.cancelDebounce();
        MUTATION_EVENTS.forEach(evt => window.removeEventListener(evt, this.mutationHandler));
        window.removeEventListener('bim-project-cleared', this.clearHandler);
        window.removeEventListener('beforeunload', this.beforeUnloadHandler);
        window.removeEventListener('pryzm-batch-started', this.batchStartHandler);
        window.removeEventListener('pryzm-batch-ended', this.batchEndHandler);
        window.removeEventListener('pryzm-load-suppress-begin', this.loadSuppressBeginHandler);
        window.removeEventListener('pryzm-load-suppress-end', this.loadSuppressEndHandler);
        console.log('[SaveOrchestrator] Disposed');
    }
}
