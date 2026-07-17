import { enablePatches } from 'immer';
import { Command, CommandResult, CommandContext } from './types';
import { doorStore } from '@pryzm/geometry-door';
import { windowStore } from '@pryzm/geometry-window';

// Contract 01 §2.2 — enable Immer patch infrastructure.
// Scoped snapshots currently use structuredClone (legacy pattern, §3.4 permitted
// during transition).  This call establishes the patch infrastructure so
// per-command produceWithPatches migration (Phase 1.5) can proceed incrementally.
enablePatches();

export type CommandSource = 'HUMAN_DIRECT' | 'AI_PROPOSAL' | 'REMOTE' | 'PROJECT_LOAD';

export interface CommandMetadata {
    source: CommandSource;
    userId?: string;
    proposalId?: string;
}

// ------------------------------------------------------------------
// FIX 1: Typed command-executed callback registry
// Previously onCommandExecuted was missing entirely from the class,
// so PropertyInspector's Contract 31.7 refresh hook was silently a no-op.
// ------------------------------------------------------------------
type CommandExecutedCallback = (cmd: Command, result: CommandResult) => void;

/**
 * Legacy command dispatcher.  This is the L2 owner the spec marks for
 * deletion in Phase E (per `13-vision-conformance.md` row L2: *"runtime.bus
 * exposed; legacy commandManager deleted with src/commands/ (Phase E)"*).
 *
 * @deprecated TODO(E-finish.3) — replaced by `runtime.bus.executeCommand(...)`
 *   in `packages/runtime-composer/src/composeRuntime.ts` (the L2 Command/Event
 *   Bus per `02-runtime-architecture.md`).  As of 2026-04-29 there are
 *   **202 `commandManager.execute(...)` reaches across 121 files** that must
 *   migrate before this class can be deleted.  The new bus dispatch path is
 *   live in 4 plugins (`plugins/wall/`, `plugins/window/`, `plugins/structural/`,
 *   `plugins/toy-cube/`) and ~10 reaches across `apps/headless/` + tests, so
 *   the wire-format is proven; what's missing is the per-family migration.
 *   Migration order per `15-subphases-E-families.md`:
 *     - E-bus.1 (S79): walls, slabs, doors, windows, curtain-walls
 *     - E-bus.2 (S79): floors, ceilings, roofs
 *     - E-bus.3 (S80): stairs, handrails, columns, beams
 *     - E-bus.4 (S80): grids, openings
 *     - E-bus.5 (S80): furniture, plumbing, room-bounding
 *     - E-bus.6 (S80): PropertyInspector.ts mass migration (15+ reaches across families)
 *   After all 18 families have bus handlers + zero residual
 *   `commandManager.execute` reaches in `src/`, this class is deletable
 *   (E-finish.3).  Do NOT add new call sites — use the bus instead.
 *   See `docs/archive/pryzm3-internal/00_NEW_ARCHITECTURE/phases/audits/PHASES-A-F-RECONCILIATION-2026-04-29/05-phase-E-audit-and-plan.md`.
 */
export class CommandManager {
    private history: { command: Command, metadata: CommandMetadata }[] = [];
    private redoStack: { command: Command, metadata: CommandMetadata }[] = [];
    private context: CommandContext;

    // FIX 1: Persistent callback list instead of a single ad-hoc registration
    private commandExecutedCallbacks: CommandExecutedCallback[] = [];

    constructor(context: CommandContext) {
        // Ensure stores are available in context stores from window if needed
        const w = window as any;
        if (!context.stores.curtainWallStore && w.curtainWallStore) {
            context.stores.curtainWallStore = w.curtainWallStore;
        }
        if (!context.stores.plumbingStore && w.plumbingStore) {
            context.stores.plumbingStore = w.plumbingStore;
        }
        if (!(context.stores as any).furnitureStore && w.furnitureStore) {
            (context.stores as any).furnitureStore = w.furnitureStore;
        }
        this.context = context;
    }

    getContext(): CommandContext {
        return this.context;
    }

    // ------------------------------------------------------------------
    // FIX 1: Public subscription API for post-command refresh hooks.
    // Returns an unsubscribe function so callers can clean up.
    // ------------------------------------------------------------------
    onCommandExecuted(cb: CommandExecutedCallback): () => void {
        this.commandExecutedCallbacks.push(cb);
        return () => {
            this.commandExecutedCallbacks = this.commandExecutedCallbacks.filter(fn => fn !== cb);
        };
    }

    // ------------------------------------------------------------------
    // FIX 2: Snapshot scope extended to cover curtainWallStore, columnStore,
    // roofStore, furnitureStore, and handrailStore so rollbacks are complete.
    // Previously only wallStore + slabStore were snapshotted, meaning a
    // failed command that mutated other stores would leave them dirty.
    // ------------------------------------------------------------------
    execute(command: Command, metadata: CommandMetadata = { source: 'HUMAN_DIRECT' }): CommandResult {
        // PROJECT-LOAD FAST PATH — Contract 13 §5 / Contract 20 §4.4
        // During project rehydration the snapshot/undo/log overhead is provably
        // wasted: load is atomic (a failed command discards the whole project),
        // the undo stack must be empty after open (§20 GAP-3), and per-command
        // logs flood the DevTools console for thousands of milliseconds.
        // Skipping these for `PROJECT_LOAD` removes the O(N²) snapshot cost
        // (`structuredClone` over already-loaded stores) without changing any
        // element semantics.
        const isLoad = metadata.source === 'PROJECT_LOAD';

        // §GEN-LOG-GATING (L-376e / L-375c, 2026-07-17) — a resi/office/house generation drives
        // hundreds of commands (per-wall REDETECT_ROOMS, openings, finishes) through this method;
        // the EXECUTE + snapshot logs below then flood DevTools and block the main thread (each
        // console.log is synchronous with DevTools open) for the whole "finishing up" phase. Extend
        // the PROJECT_LOAD fast-path to ALSO skip the two log lines while
        // `globalThis.__pryzmBuildingGenActive` is set (buildingGenerationLifecycle). LOGGING ONLY:
        // the snapshot / undo / history behaviour is unchanged — only the console.log is skipped.
        const isGen = (globalThis as unknown as { __pryzmBuildingGenActive?: boolean }).__pryzmBuildingGenActive === true;
        const skipLog = isLoad || isGen;

        if (!skipLog) {
            console.log(`[CommandManager] EXECUTE: ${command.type}`);
        }

        const validation = command.canExecute(this.context);
        if (!validation.ok) {
            return { success: false, affectedElementIds: [], info: [validation.reason || 'Validation failed'] };
        }

        // BEGIN TRANSACTION SNAPSHOT — Contract 01 §2.2
        // Scoped to command.affectedStores when declared; falls back to all stores
        // for commands that have not yet been migrated (backward-compatible).
        // Skipped during PROJECT_LOAD — see fast-path comment above.
        let snapshot: Record<string, any[]> | null = null;
        if (!isLoad) {
            // The snapshot itself is REQUIRED during generation (a failed command must roll back),
            // so it is still taken here — only the per-command log line is gated (see §GEN-LOG-GATING
            // above): `skipLog` covers both PROJECT_LOAD and the building-generation flood.
            const __t_snapshot_start = performance.now();
            snapshot = this.createSnapshot(command);
            if (!skipLog) {
                const __t_snap_elapsed = (performance.now() - __t_snapshot_start).toFixed(1);
                const __t_scope = command.affectedStores ? command.affectedStores.join(',') : 'ALL(legacy)';
                console.log(`[CommandManager] snapshot commandType="${(command as any).constructor?.name ?? 'unknown'}" scope=[${__t_scope}] elapsed=${__t_snap_elapsed}ms`);
            }
        }

        try {
            const result = command.execute(this.context);

            if (!result.success) {
                if (snapshot) this.restoreSnapshot(snapshot);
                return result;
            }

            // Non-undoable commands (e.g. automatic background operations like
            // ReDetectRoomsCommand) are executed but never pushed onto the undo
            // history stack.  This prevents phantom undo entries that force the
            // user to press Ctrl+Z multiple times to undo a single user action.
            //
            // §30-REAL-TIME-COLLABORATION §3.5 — REMOTE commands are also excluded
            // from the undo stack. Each user's undo history reflects only their own
            // local intent. Undoing a remote collaborator's command is not supported;
            // doing so silently would cause the two clients to diverge.
            //
            // Contract 20 GAP-3 — PROJECT_LOAD commands are also excluded; opening
            // a project is a rehydration, not a user action, so the undo stack must
            // be empty after the load completes.
            if (!command.nonUndoable && metadata.source !== 'REMOTE' && !isLoad) {
                this.history.push({ command, metadata });
                this.redoStack = [];
            }

            // FIX 1: Notify all post-command subscribers
            this.commandExecutedCallbacks.forEach(cb => {
                try { cb(command, result); } catch (e) {
                    console.warn('[CommandManager] Error in commandExecuted callback', e);
                }
            });

            return result;

        } catch (err) {
            console.error(`[CommandManager] FATAL ERROR DURING EXECUTION`, err);

            if (snapshot) this.restoreSnapshot(snapshot);

            return {
                success: false,
                affectedElementIds: [],
                info: ['Execution failed — state rolled back'],
                error: err instanceof Error ? err.message : 'Unknown error'
            };
        }
    }

    /**
     * §LOAD-CHUNKED (2026-06-29) — async, frame-yielding dispatch for the
     * PROJECT_LOAD fast path.
     *
     * Identical to `execute()`'s PROJECT_LOAD branch (no snapshot, no undo push,
     * no per-command log — load is atomic and the undo stack must be empty after
     * open) EXCEPT it `await`s the command's own `executeChunked(ctx, yieldFn)`
     * instead of calling the synchronous `execute(ctx)`. The command yields a
     * frame between element chunks via `yieldFn`, so the browser paints during a
     * heavy load instead of freezing (C11 §6.1 — batch geometry build spread
     * across frames). The post-command callback fan-out fires exactly once, as in
     * the synchronous path.
     *
     * Only used for `PROJECT_LOAD`; non-load callers continue through `execute()`.
     */
    async executeChunked(
        command: Command & { executeChunked(ctx: CommandContext, yieldFn: () => Promise<void>): Promise<CommandResult> },
        yieldFn: () => Promise<void>,
    ): Promise<CommandResult> {
        const validation = command.canExecute(this.context);
        if (!validation.ok) {
            return { success: false, affectedElementIds: [], info: [validation.reason || 'Validation failed'] };
        }
        try {
            const result = await command.executeChunked(this.context, yieldFn);
            if (!result.success) return result;
            // PROJECT_LOAD: no undo push (Contract 20 GAP-3). Fire the single
            // post-command fan-out so PropertyInspector / Contract 31.7 listeners
            // refresh once, exactly as the synchronous load path does.
            this.commandExecutedCallbacks.forEach(cb => {
                try { cb(command, result); } catch (e) {
                    console.warn('[CommandManager] Error in commandExecuted callback', e);
                }
            });
            return result;
        } catch (err) {
            console.error('[CommandManager] FATAL ERROR DURING CHUNKED EXECUTION', err);
            return {
                success: false,
                affectedElementIds: [],
                info: ['Chunked execution failed'],
                error: err instanceof Error ? err.message : 'Unknown error',
            };
        }
    }

    /**
     * Contract 01 §2.2 — SCOPED SNAPSHOT
     *
     * When the command declares `affectedStores`, only those stores are cloned.
     * For example, UpdateWallHeightCommand declares ['wall'] → only wallStore is
     * snapshotted.  This eliminates the O(N × S) allocation (previously: 10 full
     * store clones per command regardless of scope).
     *
     * For commands that have not yet declared `affectedStores` (legacy), the method
     * falls back to the original all-stores snapshot so correctness is preserved.
     *
     * Mechanism: structuredClone — permitted as legacy pattern (Contract 01 §3.4)
     * while each command migrates to Immer produceWithPatches internally (Phase 1.5).
     */
    private createSnapshot(command: Command): Record<string, any[]> {
        const snap: Record<string, any[]> = {};
        const ctx = this.context;

        // Build a Set of requested store keys. null = no declaration → snapshot ALL.
        const scope: Set<string> | null = command.affectedStores && command.affectedStores.length > 0
            ? new Set(command.affectedStores)
            : null;

        const wants = (key: string): boolean => scope === null || scope.has(key);

        // ── Core stores ─────────────────────────────────────────────────────────
        if (wants('wall')) {
            snap.wallStore = structuredClone(ctx.stores.wallStore.getAll());
        }

        if (wants('slab')) {
            snap.slabStore = structuredClone(ctx.stores.slabStore.getAll());
        }

        // 'level' is not an ElementStore — it lives in BimManager (spatial authority)
        if (wants('level')) {
            snap.levels = structuredClone(ctx.bimManager.getLevels());
        }

        // ── Optional stores ──────────────────────────────────────────────────────
        // Each entry: [storeKey, snapshotKey, store reference]
        // §DOOR-AUDIT-2026 P0/§WINDOW-AUDIT-2026 W1: door & window stores
        // are first-class snapshot scopes so dual-store commands
        // (wallStore + doorStore/windowStore) roll back atomically on
        // execute failure.
        const optionalStores: Array<[string, string, any]> = [
            ['column',      'columnStore',      ctx.stores.columnStore],
            ['beam',        'beamStore',        ctx.stores.beamStore],
            ['roof',        'roofStore',        (ctx.stores as any).roofStore],
            ['curtainWall', 'curtainWallStore', ctx.stores.curtainWallStore],
            ['furniture',   'furnitureStore',   (ctx.stores as any).furnitureStore],
            ['handrail',    'handrailStore',    (ctx.stores as any).handrailStore],
            ['stair',       'stairStore',       ctx.stores.stairStore],
            ['ceiling',     'ceilingStore',     (ctx.stores as any).ceilingStore],
            ['floor',       'floorStore',       (ctx.stores as any).floorStore],
            ['door',        'doorStore',        doorStore],
            ['window',      'windowStore',      windowStore],
            ['visibility-intent', 'visibilityIntentStore', (ctx.stores as any).visibilityIntentStore ?? window.visibilityIntentStore], // TODO(TASK-08)
            ['view-intent-instance', 'viewIntentInstanceStore', (ctx.stores as any).viewIntentInstanceStore ?? window.viewIntentInstanceStore], // TODO(TASK-08)
        ];

        for (const [storeKey, snapKey, store] of optionalStores) {
            if (wants(storeKey) && store?.getAll) {
                try {
                    snap[snapKey] = store.serialize
                        ? structuredClone(store.serialize())
                        : structuredClone(store.getAll());
                } catch { snap[snapKey] = (store.serialize ? { version: 1 } : []) as any; }
            }
        }

        return snap;
    }

    /**
     * Contract 01 §2.2 — SCOPED RESTORE (rollback on failed execute only)
     *
     * Every key in `snapshot` is guarded — the snapshot may contain only a
     * subset of stores (when command.affectedStores was declared). Any key
     * absent from the snapshot is left untouched.
     *
     * §SAFE-RESTORE: Each store is cleared and re-populated inside a try-catch.
     * A single failed add() must NOT leave the store permanently empty.
     */
    private restoreSnapshot(snapshot: any) {
        const ctx = this.context;

        // ── Wall store ───────────────────────────────────────────────────────────
        if (snapshot.wallStore !== undefined) {
            if (ctx.stores.wallStore.clear) {
                ctx.stores.wallStore.clear();
            } else {
                ctx.stores.wallStore.getAll().forEach(w => ctx.stores.wallStore.remove(w.id));
            }
            snapshot.wallStore.forEach((wall: any) => {
                try { ctx.stores.wallStore.add(wall); }
                catch (e) { console.error('[CommandManager.restoreSnapshot] wall', wall?.id, e); }
            });
        }

        // ── Slab store ───────────────────────────────────────────────────────────
        if (snapshot.slabStore !== undefined) {
            const slabStore = ctx.stores.slabStore as any;
            if (slabStore.clear) {
                slabStore.clear();
            } else {
                slabStore.getAll().forEach((s: any) => slabStore.remove(s.id));
            }
            snapshot.slabStore.forEach((slab: any) => {
                try { slabStore.add(slab); }
                catch (e) { console.error('[CommandManager.restoreSnapshot] slab', slab?.id, e); }
            });
        }

        // ── Optional element stores ──────────────────────────────────────────────
        const optionalStoreKeys: Array<[string, any]> = [
            ['columnStore',      ctx.stores.columnStore],
            ['beamStore',        ctx.stores.beamStore],
            ['roofStore',        (ctx.stores as any).roofStore],
            ['curtainWallStore', ctx.stores.curtainWallStore],
            ['furnitureStore',   (ctx.stores as any).furnitureStore],
            ['handrailStore',    (ctx.stores as any).handrailStore],
            ['stairStore',       ctx.stores.stairStore],
            ['ceilingStore',     (ctx.stores as any).ceilingStore],
            ['floorStore',       (ctx.stores as any).floorStore],
            ['doorStore',        doorStore],
            ['windowStore',      windowStore],
            ['visibilityIntentStore', (ctx.stores as any).visibilityIntentStore ?? window.visibilityIntentStore], // TODO(TASK-08)
            ['viewIntentInstanceStore', (ctx.stores as any).viewIntentInstanceStore ?? window.viewIntentInstanceStore], // TODO(TASK-08)
        ];

        for (const [key, store] of optionalStoreKeys) {
            if (!store || snapshot[key] === undefined) continue;
            if (store.deserialize && snapshot[key]?.version !== undefined) {
                try { store.deserialize(snapshot[key]); continue; }
                catch (e) { console.error(`[CommandManager.restoreSnapshot] ${key}`, e); continue; }
            }
            if (store.clear) {
                store.clear();
            } else if (store.getAll && store.remove) {
                store.getAll().forEach((el: any) => store.remove(el.id));
            }
            snapshot[key].forEach((el: any) => {
                try { if (store.add) store.add(el); }
                catch (e) { console.error(`[CommandManager.restoreSnapshot] ${key}`, el?.id, e); }
            });
        }

        // ── Levels (spatial authority — not an ElementStore) ─────────────────────
        // Only restore if the snapshot includes levels (commands that declared 'level').
        if (snapshot.levels !== undefined) {
            const currentLevels = ctx.bimManager.getLevels();
            currentLevels.forEach(level => {
                const snapLevel = snapshot.levels.find((l: any) => l.id === level.id);
                if (snapLevel) {
                    level.childrenIds = [...snapLevel.childrenIds];
                }
            });
        }
    }

    undo(): CommandResult | null {
        const entry = this.history.pop();
        if (!entry) {
            console.log('[CommandManager] UNDO: history empty — nothing to undo');
            return null;
        }
        console.log(`[CommandManager] UNDO: ${entry.command.type} (history remaining: ${this.history.length})`);

        // §56 (DAILY-USE 2026-05-21) — pause RoomTopologyObserver +
        // wallRebuildCoordinator for the duration of the undo so the storm of
        // store events fired during undo (wall removed + opening removed +
        // room boundary changed) coalesces into ONE re-detect + ONE wall
        // rebuild pass when we resume. Without this, the user reported
        // "2-3× redetect per single Ctrl+Z, ~80ms LONGTASK" — every undo
        // produced multiple ReDetectRoomsCommand invocations because each
        // intermediate store mutation tripped the observer's debouncer.
        // Mirrors the §LOAD-RAF-PAUSE pattern that ProjectLoader uses
        // around bulk hydration (apps/editor/src/engine/persistence/
        // ProjectLoader.ts:279-296 + finally block at 1456-1495).
        return this._withPausedObservers('UNDO', () => {
            const result = entry.command.undo(this.context);
            console.log(`[CommandManager] UNDO result: success=${result.success}`, result.info ?? '');
            if (result.success) {
                this.redoStack.push(entry);
            }
            return result;
        });
    }

    redo(): CommandResult | null {
        const entry = this.redoStack.pop();
        if (!entry) {
            console.log('[CommandManager] REDO: redoStack empty — nothing to redo');
            return null;
        }
        console.log(`[CommandManager] REDO: ${entry.command.type} (redoStack remaining: ${this.redoStack.length})`);

        // §56 — same pause/resume scaffold for redo (re-executing a command
        // fires the same store-event burst that the original execute did).
        return this._withPausedObservers('REDO', () => {
            const result = entry.command.execute(this.context);
            console.log(`[CommandManager] REDO result: success=${result.success}`, result.info ?? '');
            if (result.success) {
                this.history.push(entry);
            }
            return result;
        });
    }

    /**
     * §56 (DAILY-USE 2026-05-21) — Pause RoomTopologyObserver +
     * wallRebuildCoordinator around an undo/redo operation so the storm of
     * intermediate store events coalesces into ONE re-detect + ONE wall
     * rebuild pass on resume. Best-effort — if either global is unavailable
     * (server-side / test environment) the operation still runs, just
     * without the optimisation. Mirrors ProjectLoader's pause-during-bulk-
     * load pattern exactly so the architectural invariant is consistent
     * across all bulk-mutation paths.
     */
    private _withPausedObservers<T>(label: 'UNDO' | 'REDO', body: () => T): T {
        type WallControl = { pause?: () => void; resumeAndFlush?: () => void };
        type TopologyControl = { pause?: () => void; resume?: () => void };
        const wallControl = (typeof window !== 'undefined'
            ? (window as { __wallRebuildControl?: WallControl }).__wallRebuildControl
            : undefined);
        const topology   = (typeof window !== 'undefined'
            ? (window as { roomTopologyObserver?: TopologyControl }).roomTopologyObserver
            : undefined);
        try { wallControl?.pause?.(); }   catch (e) { console.warn(`[CommandManager] §56 ${label}: wallControl.pause() failed`, e); }
        try { topology?.pause?.(); }      catch (e) { console.warn(`[CommandManager] §56 ${label}: topology.pause() failed`, e); }
        try {
            return body();
        } finally {
            try { wallControl?.resumeAndFlush?.(); } catch (e) { console.warn(`[CommandManager] §56 ${label}: wallControl.resumeAndFlush() failed`, e); }
            try { topology?.resume?.(); }            catch (e) { console.warn(`[CommandManager] §56 ${label}: topology.resume() failed`, e); }
        }
    }

    getHistory(): { command: Command, metadata: CommandMetadata }[] {
        return [...this.history];
    }

    // ------------------------------------------------------------------
    // FIX 3: canUndo / canRedo helpers — useful for toolbar button states
    // ------------------------------------------------------------------
    canUndo(): boolean { return this.history.length > 0; }
    canRedo(): boolean { return this.redoStack.length > 0; }

    clearHistory(): void {
        this.history = [];
        this.redoStack = [];
    }

    /**
     * §UNDO-SHADOW-DROP-SCOPE (G10) — is this element still alive in ANY store?
     *
     * The existence oracle for the orphan test in `dropEntriesForTargets()`. It reads
     * the SAME live legacy stores the undo adapter mutates (`elementUndoStoreAdapter`
     * drives `window.<x>Store.remove()`, and `context.stores.<x>Store` is that very
     * instance — C03 §4.4 "Legacy store" row), so "absent here" is exactly "the
     * ring-buffer undo removed it".
     *
     * Duck-typed over `getById`/`get` and defensive: a store that throws, or an env
     * with no stores at all (headless/tests), reads as "absent" — which degrades to
     * the previous, more permissive drop behaviour rather than to a phantom keypress.
     */
    private _elementExists(id: string): boolean {
        const stores = (this.context?.stores ?? {}) as Record<string, unknown>;
        const candidates: unknown[] = [...Object.values(stores), doorStore, windowStore];
        for (const store of candidates) {
            const s = store as { getById?: (i: string) => unknown; get?: (i: string) => unknown } | null | undefined;
            if (!s) continue;
            try {
                const found = typeof s.getById === 'function' ? s.getById(id)
                    : typeof s.get === 'function' ? s.get(id)
                    : undefined;
                if (found != null) return true;
            } catch { /* a non-element store that dislikes the key — not an existence signal */ }
        }
        return false;
    }

    /**
     * §OI-054 SHADOW-DROP (C03 §4.6 U-5) — remove every undo/redo entry whose
     * `targetIds` are a SUBSET of `ids` **and whose elements no longer exist**,
     * returning the count removed.
     *
     * WHY: the 3D create tools (WallTool, Slab, Roof, Furniture, Plumbing,
     * Stair, Handrail, Beam) DUAL-DISPATCH — they run `bus.executeCommand(...)`
     * (→ CommandBus ring buffer) AND `commandManager.execute(CreateXCommand)`
     * (→ this.history) for the SAME element. The unified undo path
     * (apps/editor/src/engine/undo/performUndoRedo.ts) undoes such an element via
     * the ring buffer. The orphaned `CreateXCommand` left here would then cause a
     * PHANTOM second Ctrl+Z — its `undo()` finds the element already gone and
     * no-ops, but still consumes a keypress. performUndo calls this right after a
     * successful ring-buffer undo to discard that twin, so one action ⇒ one undo.
     *
     * Subset (not intersection) match: only drop an entry when ALL of its targets
     * were just reverted, so a multi-target legacy command that merely overlaps is
     * preserved. Entries with no declared targetIds are never dropped.
     *
     * §UNDO-SHADOW-DROP-SCOPE (G10, 2026-07-13) — ORPHAN-SCOPED, and this is the
     * load-bearing half of the predicate.
     *
     * ROOT CAUSE it fixes: the subset rule alone is an ELEMENT-IDENTITY match with no
     * notion of WHICH gesture an entry belongs to, applied across the WHOLE history.
     * So it dropped far more than the twin. Undoing a bus-only FIELD edit on wall W
     * (`wall.setHeight`, a `replace` patch — the wall is NOT removed) hands `ids=[W]`
     * to this method, and every older commandManager entry that touched W — a JoinTool
     * / OffsetTool / CutTool / property-panel command, all still live
     * `commandManager.execute` sites — was deleted from BOTH the history and the redo
     * stack. Those user steps became permanently un-undoable and un-redoable: silent,
     * unrecoverable timeline loss, and the exact opposite of what U-8 is for.
     *
     * The phantom keypress U-8 exists to kill only ever happens when the ring-buffer
     * undo REMOVED the element — that is what makes the twin's `undo()` a no-op. So
     * that is the precise condition to test: an entry is dropped only when every one
     * of its targets is GONE from the stores. A still-live element means the entry is
     * still a real step in the user's timeline, and it survives.
     */
    dropEntriesForTargets(ids: readonly string[]): number {
        if (ids.length === 0) return 0;
        const wanted = new Set(ids);
        // Existence is per-id, not per-entry — cache it so a 500-element batch undo
        // does not re-scan the stores once per (entry × target).
        const aliveCache = new Map<string, boolean>();
        const isOrphaned = (id: string): boolean => {
            let alive = aliveCache.get(id);
            if (alive === undefined) { alive = this._elementExists(id); aliveCache.set(id, alive); }
            return !alive;
        };
        const covers = (entry: { command: Command }): boolean => {
            const targets = entry.command.targetIds;
            if (!Array.isArray(targets) || targets.length === 0) return false;
            return targets.every(t => wanted.has(t)) && targets.every(isOrphaned);
        };
        let removed = 0;
        const before = this.history.length + this.redoStack.length;
        this.history = this.history.filter(e => !covers(e));
        this.redoStack = this.redoStack.filter(e => !covers(e));
        removed = before - (this.history.length + this.redoStack.length);
        return removed;
    }
}
