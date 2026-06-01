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

    private readonly getHash: () => string;
    private readonly onAutoSave: (label: string) => void;
    private readonly onSaveStatusChange: (status: SaveStatus) => void;

    private readonly mutationHandler: () => void;
    private readonly clearHandler: () => void;
    private readonly beforeUnloadHandler: () => void;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(options: SaveOrchestratorOptions, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this.DEBOUNCE_MS = options.debounceMs ?? 1000;
        this.getHash = options.getHash;
        this.onAutoSave = options.onAutoSave;
        this.onSaveStatusChange = options.onSaveStatusChange ?? (() => { });

        this.mutationHandler = () => this.handleMutation();
        this.clearHandler = () => {
            this.hasDirtyChanges = false;
            this.pendingSave = false;
            this.cancelDebounce();
            this.setStatus('idle');
        };
        this.beforeUnloadHandler = () => this.flushBeforeUnload();

        MUTATION_EVENTS.forEach(evt => window.addEventListener(evt, this.mutationHandler));
        window.addEventListener('bim-project-cleared', this.clearHandler);
        window.addEventListener('beforeunload', this.beforeUnloadHandler);

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
        console.log('[SaveOrchestrator] Disposed');
    }
}
