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
 *   See `docs/03_PRYZM3/00_NEW_ARCHITECTURE/phases/audits/PHASES-A-F-RECONCILIATION-2026-04-29/05-phase-E-audit-and-plan.md`.
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

        if (!isLoad) {
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
            const __t_snapshot_start = performance.now();
            snapshot = this.createSnapshot(command);
            const __t_snap_elapsed = (performance.now() - __t_snapshot_start).toFixed(1);
            const __t_scope = command.affectedStores ? command.affectedStores.join(',') : 'ALL(legacy)';
            console.log(`[CommandManager] snapshot commandType="${(command as any).constructor?.name ?? 'unknown'}" scope=[${__t_scope}] elapsed=${__t_snap_elapsed}ms`);
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

        const result = entry.command.undo(this.context);
        console.log(`[CommandManager] UNDO result: success=${result.success}`, result.info ?? '');
        if (result.success) {
            this.redoStack.push(entry);
        }
        return result;
    }

    redo(): CommandResult | null {
        const entry = this.redoStack.pop();
        if (!entry) {
            console.log('[CommandManager] REDO: redoStack empty — nothing to redo');
            return null;
        }
        console.log(`[CommandManager] REDO: ${entry.command.type} (redoStack remaining: ${this.redoStack.length})`);

        const result = entry.command.execute(this.context);
        console.log(`[CommandManager] REDO result: success=${result.success}`, result.info ?? '');
        if (result.success) {
            this.history.push(entry);
        }
        return result;
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
}
