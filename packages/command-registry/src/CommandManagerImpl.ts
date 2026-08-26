import { enablePatches } from 'immer';
import { Command, CommandResult, CommandContext } from './types';
import { CompositeCommand } from './composite/CompositeCommand';
// §REFUSAL-IDENTITY (GE-09, C58 §1.13.8) — the ONE renderer for a refusal arriving
// from a command this dispatcher orchestrates but does not own. This is the WIDEST
// such seam in the product: every command in the app passes through it, so the
// manufactured 'Validation failed' it used to emit was the single most-rendered
// laundered refusal in PRYZM.
import { childRefusalText } from './refusal/childRefusalText';
import { doorStore } from '@pryzm/geometry-door';
import { windowStore } from '@pryzm/geometry-window';

// Contract 01 §2.2 — enable Immer patch infrastructure.
// Scoped snapshots currently use structuredClone (legacy pattern, §3.4 permitted
// during transition).  This call establishes the patch infrastructure so
// per-command produceWithPatches migration (Phase 1.5) can proceed incrementally.
enablePatches();

// §L-874-ONE-UNDO: 'STRUCTURAL_CASCADE' was ALREADY the runtime value both
// cascade dispatchers send (SlabWallConnectivityService / WallMoveReweldService
// pass it through their untyped CommandManagerRef seams) — the union simply
// never admitted it. Naming it lets execute() compose cascades into their
// spawning gesture instead of comparing against a value the type denies.
export type CommandSource = 'HUMAN_DIRECT' | 'AI_PROPOSAL' | 'REMOTE' | 'PROJECT_LOAD' | 'STRUCTURAL_CASCADE';

/**
 * §REFUSAL-IDENTITY (GE-09) — name the command that refused without stating why.
 *
 * Prefers the CLASS name (`UpdateWallSystemTypeCommand`) over `type`
 * (`UPDATE_WALL_SYSTEM_TYPE`): the class name is what a reader greps for when the
 * absence marker sends them to find the command with the missing refusal message,
 * which is the whole purpose of naming a silence. Falls back to `type`.
 *
 * Never throws — a refusal renderer that can crash turns a refusal into a crash,
 * which is the exact inversion §FIX-RAKE-REFUSAL-IS-NOT-A-CRASH was raised about.
 */
function commandIdentity(command: Command): string {
    try {
        const ctorName = (command as { constructor?: { name?: string } }).constructor?.name;
        if (ctorName && ctorName !== 'Object') return ctorName;
        return String(command.type ?? 'unknown command');
    } catch {
        return 'unknown command';
    }
}

/** §REFUSAL-IDENTITY (GE-09) — name WHAT was declined, so the line stays attributable. */
function commandSubject(command: Command): string {
    try {
        const ids = command.targetIds;
        if (Array.isArray(ids) && ids.length > 0) {
            return ids.length === 1 ? `element ${ids[0]}` : `${ids.length} elements (${ids.join(', ')})`;
        }
        return `a ${String(command.type ?? 'unknown')} command with no declared targetIds`;
    } catch {
        return 'an unnamed subject';
    }
}

export interface CommandMetadata {
    source: CommandSource;
    userId?: string;
    proposalId?: string;
    /**
     * §UNDO-GESTURE-ID (C03 §4.6 U-10) — the id of the USER INTERACTION that
     * produced this command, when the caller knows it.
     *
     * PRYZM has two undo stacks and one action can land in both (dual dispatch).
     * `performUndo` must tell that TWIN — undo it once, via the ring buffer + the
     * U-8 shadow-drop — from two separate actions, which undo newest-first. It
     * used to infer that from `|Δtimestamp| ≤ 250 ms`, i.e. from how fast the user
     * clicked. This carries the answer instead of guessing it.
     *
     * Minted by `@pryzm/command-bus`'s gesture scope. Two suppliers today:
     *   • `initBusHandlers._cmExec` stamps `currentGestureId()` — the id of the bus
     *     dispatch on whose stack the bridge is running (81 bridge handlers);
     *   • a tool that dual-dispatches wraps both calls in `withGesture` and passes
     *     the id here (`WallTool.createWall`).
     *
     * ABSENT means "unknown", never "same as the previous one": an entry with no
     * id is never classified as a twin, so it falls to chronological ordering.
     * Read back with {@link CommandManager.peekUndoGestureId}.
     */
    gestureId?: string;
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
/**
 * §L-874-ONE-UNDO — one undo-stack record. `structuralChildren` carries the
 * STRUCTURAL_CASCADE commands a gesture spawned from inside its execute()
 * (slab corner welds, junction re-welds): they revert and replay WITH the
 * gesture, so one user move costs ONE Ctrl+Z (founder acceptance, repro 3).
 */
export interface HistoryEntry {
    command: Command;
    metadata: CommandMetadata;
    structuralChildren?: HistoryEntry[];
}

/**
 * §UNDO-HISTORY-DROPDOWN (ADR-0341) — an IMMUTABLE, SERIALISABLE view of one
 * legacy history entry, for read-only consumers (the undo/redo dropdown).
 *
 * WHY THIS EXISTS RATHER THAN `getHistory()`. `getHistory()` already returns a
 * SHALLOW copy — a fresh array holding the LIVE `HistoryEntry` objects, i.e. the
 * live `Command` instances. A caller that takes one can call `.execute(ctx)` or
 * `.undo(ctx)` on it directly, out of band, with no dispatcher, no snapshot and
 * no history bookkeeping. That is a mutation path into model state that bypasses
 * the command dispatcher entirely (P6), handed to whoever asks. It is used today
 * by nothing on the UI path and is left in place rather than removed in this
 * change, but it is NOT the accessor a UI may use, and this one is.
 *
 * Everything here is a scalar or a frozen array of scalars. There is no route
 * back to a `Command`.
 */
export interface LegacyHistoryEntryView {
    /** Position in the stack, oldest = 0. Stable only until the next mutation. */
    readonly index: number;
    /** `Command.id` — the identity a caller can correlate across two reads. */
    readonly id: string;
    /** `Command.type` — the enum's string value (survives minification). */
    readonly type: string;
    /**
     * The command's own `describe()` when it authored one and it returned a
     * non-empty string; otherwise absent. NEVER a manufactured sentence: a
     * caller must be able to tell "the author wrote this" from "we derived it".
     */
    readonly label?: string;
    /** `Command.timestamp` — epoch-ms at construction. */
    readonly timestamp?: number;
    /** §UNDO-GESTURE-ID — the interaction that produced the entry, or absent. */
    readonly gestureId?: string;
    /** `Command.targetIds`, frozen. Post-U-9 this names every element touched. */
    readonly targetIds: readonly string[];
    /** Who dispatched it. REMOTE never appears — see `getUndoHistoryView`. */
    readonly source: CommandSource;
    /**
     * §L-874-ONE-UNDO — how many STRUCTURAL_CASCADE children this gesture
     * composed. They are NOT separate rows: one gesture is one row, and undoing
     * this entry reverts the children with it. Exposed so a view can say "and 2
     * related changes" instead of silently hiding them.
     */
    readonly structuralChildCount: number;
}

/**
 * §UNDO-HISTORY-DROPDOWN (ADR-0341) — `describe()`, defensively.
 *
 * A command author's `describe()` runs while a menu is being rendered, possibly
 * long after the command executed and against a context that has moved on. A
 * throw there must not take the dropdown — or the toolbar — down with it, and an
 * empty string must not become a blank row (a blank row is indistinguishable
 * from a missing one). Both cases return `undefined`, and the caller derives a
 * label from `type` instead.
 */
function _safeDescribe(command: Command): string | undefined {
    try {
        const d = command.describe?.();
        if (typeof d !== 'string') return undefined;
        const t = d.trim();
        return t.length > 0 ? t : undefined;
    } catch (err) {
        console.warn(`[CommandManager] describe() threw for ${String(command?.type ?? 'unknown')}`, err);
        return undefined;
    }
}

/** Freeze one entry into a {@link LegacyHistoryEntryView}. Never throws. */
function _viewOf(entry: HistoryEntry, index: number): LegacyHistoryEntryView {
    const cmd = entry.command;
    const label = _safeDescribe(cmd);
    const ts = cmd?.timestamp;
    const gid = entry.metadata?.gestureId;
    return Object.freeze({
        index,
        id: String(cmd?.id ?? ''),
        type: String(cmd?.type ?? 'unknown'),
        ...(label !== undefined ? { label } : {}),
        ...(typeof ts === 'number' && Number.isFinite(ts) ? { timestamp: ts } : {}),
        ...(typeof gid === 'string' && gid.length > 0 ? { gestureId: gid } : {}),
        targetIds: Object.freeze(Array.isArray(cmd?.targetIds) ? [...cmd.targetIds] : []),
        source: entry.metadata?.source ?? 'HUMAN_DIRECT',
        structuralChildCount: entry.structuralChildren?.length ?? 0,
    });
}

export class CommandManager {
    private history: HistoryEntry[] = [];
    private redoStack: HistoryEntry[] = [];
    private context: CommandContext;

    // FIX 1: Persistent callback list instead of a single ad-hoc registration
    private commandExecutedCallbacks: CommandExecutedCallback[] = [];

    // ------------------------------------------------------------------
    // §GEN-UNDO-COALESCE (L-376d / L-375d) — generation undo batch.
    //
    // While OPEN (between beginGenerationBatch() and endGenerationBatch(),
    // bracketed by buildingGenerationLifecycle across a WHOLE resi/office/house
    // generation), execute():
    //   • SKIPS the per-command `createSnapshot()` (the batch is atomic — a
    //     failed generation discards the whole building — exactly the reason the
    //     PROJECT_LOAD fast path already skips it; this kills the O(N·M)
    //     structuredClone tail the stair scope ["stair","opening","slab"] paid as
    //     the slab store grew), and
    //   • ACCUMULATES each undoable command instead of pushing it to `history`,
    //     so the whole generation collapses to ONE CompositeCommand undo entry at
    //     endGenerationBatch() (C16 §8.6 — "one gesture = one undo unit"; closes
    //     L-376f). Non-undoable / REMOTE / PROJECT_LOAD commands are gated exactly
    //     as in the normal path, so they never enter the composite.
    // null = no generation in flight → every command behaves byte-identically to
    // before (single snapshot + single history push).
    // ------------------------------------------------------------------
    private _genBatch: { command: Command, metadata: CommandMetadata }[] | null = null;

    // ------------------------------------------------------------------
    // §L-874-ONE-UNDO — structural cascades compose into their gesture.
    //
    // A wall move dispatches nested STRUCTURAL_CASCADE commands (slab corner
    // welds, junction re-welds) from INSIDE the move command's execute().
    // Pushed as separate history entries, one user gesture cost 2–3 Ctrl+Z —
    // and the founder's acceptance for repro 3 is explicit: ONE undo restores
    // the entire pre-move state. This frame stack records, per in-flight
    // execute(), the structural children it spawned; on success they are
    // attached to the OUTER entry (`structuralChildren`) instead of the
    // history, and undo()/redo() replay them with the gesture: children are
    // undone FIRST in reverse chronological order (they mutated last), then
    // the outer command; redo re-executes outer then children in order.
    // A top-level STRUCTURAL_CASCADE (no enclosing execute) still becomes its
    // own entry — live-drag paths that emit outside a command are unchanged.
    // ------------------------------------------------------------------
    private _execFrames: Array<{ children: HistoryEntry[] }> = [];

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

        // §GEN-UNDO-COALESCE (L-376d / L-375d) — inside an explicit generation batch the
        // per-command snapshot is skipped (the batch is atomic like PROJECT_LOAD) and undoable
        // commands are accumulated into ONE composite entry instead of pushed individually. The
        // scope is the explicit `_genBatch` (opened by buildingGenerationLifecycle), NOT the ambient
        // `isGen` flag — so if the batch was never opened (e.g. commandManager not ready at lease
        // construction) execute() safely falls back to the per-command snapshot + push.
        const inGenBatch = this._genBatch !== null;

        if (!skipLog) {
            console.log(`[CommandManager] EXECUTE: ${command.type}`);
        }

        const validation = command.canExecute(this.context);
        if (!validation.ok) {
            // §FIX-VALIDATION-REASON-IS-HUMAN-READABLE (L-813, §CONTEXT-DATA-HONESTY) —
            // surface `blockingIssues[0]` (the sentence a command author wrote for a
            // human: "Walls are parallel — no intersection exists") in preference to
            // `reason`, which is a machine token ("WALLS_PARALLEL", "WALL_B_NOT_FOUND").
            // The tools render `result.info[0]` straight into the operation overlay, so
            // the token was what the founder saw — when the message survived at all.
            // `reason` remains the fallback, so commands that set no blockingIssues are
            // unchanged.
            //
            // §REFUSAL-IDENTITY (GE-09, C58 §1.13.8) — the `|| 'Validation failed'`
            // tail is gone. The L-813 PREFERENCE above is unchanged (blockingIssues
            // first, reason second); what changed is the third case, where the
            // command refused and stated NOTHING AT ALL. That used to become
            // 'Validation failed' — a sentence indistinguishable from a real reason,
            // rendered into the operation overlay, which meant a command with a
            // missing refusal message looked exactly like one with a deliberate
            // terse one. Now the absence is NAMED and attributed to the command
            // that went quiet, so it points at the defect instead of impersonating
            // an explanation.
            const _stated = validation.blockingIssues?.[0] || validation.reason;
            const _human = childRefusalText(
                _stated,
                `${commandIdentity(command)}.canExecute`,
                commandSubject(command),
            );
            // §REFUSAL-PRINTED-TWICE (L-1016) — print the second half ONLY when it
            // says something the first did not.
            //
            // The founder's console carried the whole refusal sentence twice,
            // concatenated with an em dash. Not a copy-paste: these are two REAL
            // fields that usually hold the same string. `_human` is
            // `childRefusalText(blockingIssues[0] || reason, …)`, and that function
            // returns `stated.trim()` verbatim when it is non-empty — so for the
            // common case of a command that sets `reason` and no `blockingIssues`,
            // the two halves are literally identical.
            //
            // Deleting either half unconditionally would have destroyed real
            // information, which is why this is a comparison and not a deletion.
            // The halves genuinely differ in the two cases that matter, and both
            // survive: when the command put its human sentence in
            // `blockingIssues[0]` and a machine token in `reason` (L-813 — the
            // token is the field an operator greps for), and when the command
            // refused stating NOTHING, where `_human` is the named
            // REFUSED_WITHOUT_REASON attribution and `reason` is 'unspecified'
            // (GE-09 — the absence must stay visible and attributed).
            const _rawReason = validation.reason?.trim();
            console.warn(
                `[CommandManager] REFUSED ${command.type}: ${validation.reason ?? 'unspecified'}`
                + (_human && _human !== _rawReason ? ` — ${_human}` : ''),
            );
            return { success: false, affectedElementIds: [], info: [_human] };
        }

        // BEGIN TRANSACTION SNAPSHOT — Contract 01 §2.2
        // Scoped to command.affectedStores when declared; falls back to all stores
        // for commands that have not yet been migrated (backward-compatible).
        // Skipped during PROJECT_LOAD (atomic load) AND during a generation batch
        // (§GEN-UNDO-COALESCE — atomic generation; kills the O(N·M) structuredClone tail).
        let snapshot: Record<string, any[]> | null = null;
        if (!isLoad && !inGenBatch) {
            const __t_snapshot_start = performance.now();
            snapshot = this.createSnapshot(command);
            if (!skipLog) {
                const __t_snap_elapsed = (performance.now() - __t_snapshot_start).toFixed(1);
                // §DIAG-SNAPSHOT-LOG-IS-HONEST (L-947, separate from the L-947 fix itself)
                //
                // TWO defects in this one line, both of the §CONTEXT-DATA-HONESTY shape
                // — a line that reports something OTHER than what the code did:
                //
                //  1. SCOPE. The guard was `command.affectedStores ? … : 'ALL(legacy)'`,
                //     but `createSnapshot` falls back to ALL stores when the declaration
                //     is EMPTY (`length > 0` at :562), not only when it is absent. An
                //     empty declaration therefore printed `scope=[]` while the snapshot
                //     covered every store. Now the two read the same condition.
                //  2. IDENTITY. `constructor?.name` is the MINIFIED class name in a
                //     production bundle — this is what printed `commandType="B0"` in the
                //     founder's L-947 console, an identity no reader can grep for.
                //     `command.type` is the CommandType enum's string value: it survives
                //     minification because it is data, not a symbol. It leads, and the
                //     class name follows only when it still carries information.
                const __t_declared = command.affectedStores;
                const __t_scope = __t_declared && __t_declared.length > 0 ? __t_declared.join(',') : 'ALL(legacy)';
                const __t_ctor = (command as { constructor?: { name?: string } }).constructor?.name;
                const __t_id = __t_ctor && __t_ctor !== 'Object' && __t_ctor !== String(command.type)
                    ? `${String(command.type)} (${__t_ctor})`
                    : String(command.type ?? 'unknown');
                console.log(`[CommandManager] snapshot commandType="${__t_id}" scope=[${__t_scope}] elapsed=${__t_snap_elapsed}ms`);
            }
        }

        // §L-874-ONE-UNDO — open a frame so nested STRUCTURAL_CASCADE dispatches
        // (fired by store-event reactors DURING this command's execute) compose
        // into THIS gesture instead of minting their own undo entries.
        const myFrame: { children: HistoryEntry[] } = { children: [] };
        this._execFrames.push(myFrame);

        try {
            const result = command.execute(this.context);

            if (!result.success) {
                if (snapshot) this.restoreSnapshot(snapshot);
                return result;
            }

            // §UNDO-TARGET-IDENTITY (C03 §4.6 U-9) — THE chokepoint that makes the
            // U-8 shadow-drop safe for every command family at once. See
            // `_unionTargetIds` for the full rationale.
            this._unionTargetIds(command, result);

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
            // §UNDO-REMOTE-ORIGIN (C03 §4.6 U-1) — a command a BRIDGE created
            // inside a REMOTE-originated bus dispatch is REMOTE, whatever the
            // bridge's default metadata says.
            //
            // The rule directly above was correct and simply unreachable on the
            // CRDT read leg. `apps/editor/src/engine/initRemoteElementSync.ts`
            // dispatches `element.updateParameters` for a PEER's change; the
            // `initBusHandlers` bridge for that verb calls `_cmExec(cmd)` with no
            // metadata, so `metadata.source` defaulted to `'HUMAN_DIRECT'` and a
            // collaborator's edit was pushed onto THIS user's undo history as if
            // this user had authored it. The socket.io path never had the bug
            // because `RemoteCommandDispatcher.ts:378` passes `{source:'REMOTE'}`
            // explicitly.
            //
            // MEASURED (tools/rac-conformance/certification, two-client harness):
            // client A made ONE edit and its history held THREE entries after
            // sync, all `HUMAN_DIRECT` — so A's first Ctrl+Z was a no-op, its
            // SECOND reverted client B's colour, and only the THIRD reverted A's
            // own gesture. Findings `undo/undo-did-not-revert-own` and
            // `undo/undo-reverted-peer-work` are both this one defect.
            //
            // THE EXCLUSION IS NOT WEAKENED — it is EXTENDED to the path that was
            // escaping it. A's own edits are unaffected: they do not run inside a
            // remote dispatch, so this reads `false` for them. The flag is an
            // ambient global rather than an import because this package (L2) does
            // not depend on `@pryzm/command-bus` (L1) and must not start to for
            // one boolean — the same reason, and the same mechanism, as
            // `__pryzmBuildingGenActive` above. `withRemoteOrigin` restores the
            // previous value in a `finally`, so the flag cannot stick ON and make
            // subsequent LOCAL edits silently un-undoable.
            const isRemoteOrigin =
                metadata.source === 'REMOTE' ||
                (globalThis as unknown as { __pryzmRemoteOriginDispatch?: boolean })
                    .__pryzmRemoteOriginDispatch === true;

            if (!command.nonUndoable && !isRemoteOrigin && !isLoad) {
                const entry: HistoryEntry = {
                    command, metadata,
                    ...(myFrame.children.length > 0
                        ? { structuralChildren: [...myFrame.children] }
                        : {}),
                };
                // §L-874-ONE-UNDO — a structural cascade dispatched INSIDE
                // another command's execute() belongs to that gesture: attach
                // to the ENCLOSING frame instead of the history. Top-level
                // cascades (no enclosing execute — e.g. live-drag store writes)
                // keep their own entry, unchanged.
                const enclosing = this._execFrames.length >= 2
                    ? this._execFrames[this._execFrames.length - 2]
                    : null;
                if (inGenBatch) {
                    // §GEN-UNDO-COALESCE — accumulate for one composite entry at
                    // endGenerationBatch() instead of pushing per command.
                    this._genBatch!.push(entry);
                } else if (enclosing && metadata.source === 'STRUCTURAL_CASCADE') {
                    enclosing.children.push(entry);
                } else {
                    this.history.push(entry);
                    this.redoStack = [];
                }
            } else if (myFrame.children.length > 0 && !isLoad) {
                // The outer command itself is not undoable (or is REMOTE) but it
                // spawned undoable structural children — never lose them from
                // history: push them as their own entries (the pre-composition
                // shape), so the cascade stays revertible.
                for (const child of myFrame.children) this.history.push(child);
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
        } finally {
            // §L-874-ONE-UNDO — close this command's frame on EVERY exit path.
            // A leaked frame would make every later top-level command look
            // nested, silently swallowing its cascades from the history.
            this._execFrames.pop();
        }
    }

    /**
     * §UNDO-TARGET-IDENTITY (C03 §4.6 **U-9**) — union the elements a command
     * ACTUALLY touched into its `targetIds`, at the single point every legacy
     * command passes through.
     *
     * THE INVARIANT (U-9): *a command's `targetIds` MUST name every element it
     * creates, not only its host or parent.*
     *
     * WHY IT MATTERS. The U-8 shadow-drop (`dropEntriesForTargets`) is an
     * ELEMENT-IDENTITY predicate: after a ring-buffer undo it deletes every entry
     * whose `targetIds` are a subset of the ids just reverted AND whose elements
     * are all gone. A create command that names only its HOST therefore looks
     * exactly like the host's own dual-dispatch twin — so undoing the host
     * silently destroys the child's entry from `history` AND `redoStack`, and the
     * child's creation becomes invisible to undo and redo. That is the
     * founder-reported "Ctrl+Z jumps over the door/window" bug, and it is a
     * property a whole FAMILY of commands can have. Audited instances at the time
     * of writing: `CreateWallOpeningCommand` / `CreateWallOpeningsBatchCommand`
     * (host = wall), `CreateStairRailingCommand` (host = stair),
     * `DetectRoomFromWallsCommand` (host = walls), `CreatePlanViewCommand`
     * (host = level).
     *
     * WHY HERE AND NOT PER COMMAND. `CommandResult.affectedElementIds` is already
     * the authored answer to "which elements did this touch" — every command
     * returns it, and for the host-only creators above it correctly names the
     * CREATED element (the railing id, the room id, the view id) even when
     * `targetIds` does not. Unioning it in at the one chokepoint every command
     * flows through fixes the whole registry, keeps ONE undo path (C03 §4.5 U-5),
     * and cannot be forgotten by a future command author. Per-command edits would
     * be 60 copies of the same rule with no enforcement.
     *
     * DIRECTIONAL SAFETY. Widening `targetIds` can only make the shadow-drop
     * STRICTER (a superset is a subset of fewer id sets, and every extra id must
     * also be orphaned), so it can never delete an entry it did not delete
     * before — it can only preserve entries that were being destroyed. The
     * legitimate dual-dispatch drop is unaffected: for those commands
     * `affectedElementIds` equals `targetIds` already.
     *
     * Mutates in place (several commands declare `readonly targetIds: string[]`
     * — the binding is readonly, the array is not) and is fully defensive: any
     * command with a non-array or frozen `targetIds` is left exactly as it was.
     */
    private _unionTargetIds(command: Command, result: CommandResult): void {
        try {
            const created = result.affectedElementIds;
            if (!Array.isArray(created) || created.length === 0) return;
            const targets = command.targetIds;
            if (!Array.isArray(targets)) return;
            const known = new Set(targets);
            const missing = created.filter(id => typeof id === 'string' && id.length > 0 && !known.has(id));
            if (missing.length === 0) return;
            targets.push(...missing);
        } catch (err) {
            // A frozen/exotic targetIds must never break execution — the command
            // already succeeded. Worst case the entry keeps its authored ids.
            console.warn('[CommandManager] §UNDO-TARGET-IDENTITY: could not widen targetIds for', command.type, err);
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
            // §REFUSAL-IDENTITY (GE-09) — the chunked driver's copy of the seam
            // above. It ALSO honours the L-813 blockingIssues preference now: the
            // two drivers must not disagree about what a refusal says, and this one
            // silently didn't (it read `reason` only, so a command whose human
            // sentence lived in `blockingIssues` rendered its machine token here and
            // its sentence in `execute()` — for the same refusal).
            const stated = validation.blockingIssues?.[0] || validation.reason;
            return {
                success: false,
                affectedElementIds: [],
                info: [childRefusalText(
                    stated,
                    `${commandIdentity(command)}.canExecute`,
                    commandSubject(command),
                )],
            };
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
            // §L-1050 / C87 §7 CW-U-2(a) — `curtainPanel` was a DECLARED-BUT-ABSENT
            // rollback scope (C84 EI-7d). FOUR commands declare it —
            // `AddCurtainGridLineCommand.ts:69` and `RemoveCurtainGridLineCommand.ts:53`
            // as `["curtainWall","curtainPanel"]`, and `ReplacePanelTypeCommand.ts:56` /
            // `ReplacePanelWithDoorCommand.ts:62` as `["curtainPanel"]` ALONE. For the
            // last two `scope` was non-null and matched NO row here, so the whole
            // snapshot was `{}`, `restoreSnapshot` restored nothing, and a failed
            // execute left the panel store holding the half-applied change — silently.
            // That is L-947's exact shape, in the rollback table rather than the
            // undo one. `curtainPanelStore` is already on the context
            // (`command-registry/src/types.ts:467`) and exposes getAll/add/remove, so
            // the generic loop in `restoreSnapshot` handles it unchanged.
            ['curtainPanel', 'curtainPanelStore', (ctx.stores as any).curtainPanelStore],
            ['furniture',   'furnitureStore',   (ctx.stores as any).furnitureStore],
            ['handrail',    'handrailStore',    (ctx.stores as any).handrailStore],
            ['stair',       'stairStore',       ctx.stores.stairStore],
            ['ceiling',     'ceilingStore',     (ctx.stores as any).ceilingStore],
            ['floor',       'floorStore',       (ctx.stores as any).floorStore],
            ['door',        'doorStore',        doorStore],
            ['window',      'windowStore',      windowStore],
            // Narrow structural window casts (not the ambient global-window.d.ts slot,
            // which is out of scope in per-package isolated compiles — TS2339 there).
            ['visibility-intent', 'visibilityIntentStore', (ctx.stores as any).visibilityIntentStore ?? (window as { visibilityIntentStore?: unknown }).visibilityIntentStore], // TODO(TASK-08)
            ['view-intent-instance', 'viewIntentInstanceStore', (ctx.stores as any).viewIntentInstanceStore ?? (window as { viewIntentInstanceStore?: unknown }).viewIntentInstanceStore], // TODO(TASK-08)
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
            // §L-1050 — the restore half of the `curtainPanel` scope added to
            // createSnapshot above. Order matters: the wall is restored BEFORE its
            // panels, so `CurtainPanelStore.set()`'s `byWallId` re-index
            // (`CurtainPanelStore.ts:107-119`) lands against a wall that exists.
            ['curtainPanelStore', (ctx.stores as any).curtainPanelStore],
            ['furnitureStore',   (ctx.stores as any).furnitureStore],
            ['handrailStore',    (ctx.stores as any).handrailStore],
            ['stairStore',       ctx.stores.stairStore],
            ['ceilingStore',     (ctx.stores as any).ceilingStore],
            ['floorStore',       (ctx.stores as any).floorStore],
            ['doorStore',        doorStore],
            ['windowStore',      windowStore],
            ['visibilityIntentStore', (ctx.stores as any).visibilityIntentStore ?? (window as { visibilityIntentStore?: unknown }).visibilityIntentStore], // TODO(TASK-08)
            ['viewIntentInstanceStore', (ctx.stores as any).viewIntentInstanceStore ?? (window as { viewIntentInstanceStore?: unknown }).viewIntentInstanceStore], // TODO(TASK-08)
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

    /**
     * §L-874 — revert-in-progress latch. While undo()/redo() replays a
     * command's inverse (or re-executes it), every store event it fires is a
     * REPLAY, not a user gesture. Structural wall-cascade services
     * (SlabWallConnectivityService, WallMoveReweldService) MUST consult this:
     * without it, undoing UPDATE_WALL_BASELINE re-emitted the moved wall's
     * restore, the services dispatched a fresh FORWARD cascade (via execute(),
     * which also pushed a new history entry and cleared the redo stack), and
     * every Ctrl+Z was immediately compensated — the founder's "2–3 undos did
     * not work, screenshots identical" treadmill. The cascade entries on the
     * history stack restore the neighbours themselves; during a revert the
     * services' only correct behaviour is silence.
     */
    private _reverting = 0;
    isReverting(): boolean { return this._reverting > 0; }

    /**
     * §L-4101 — THE RING-BUFFER HALF OF THE SAME LATCH, which L-874 never had.
     *
     * ⚠ READ THE `_reverting` DOC ABOVE FIRST: it describes this exact defect and
     * fixes it for ONE of the two undo legs. `_reverting` is incremented ONLY
     * inside `undo()` / `redo()` below, so it is raised for the commandManager
     * leg and is **false for the ring-buffer leg** — and the ring-buffer leg is
     * the FIRST one `performUndo` tries (`performUndoRedo.ts`, "RING-BUFFER
     * FIRST"). A ring-buffer inverse patch reaches the wall store as a plain
     * `store.update(id, { baseLine })` through `elementUndoStoreAdapter`, which is
     * byte-indistinguishable from a fresh user move to every subscriber.
     *
     * MEASURED, and it was measured BEFORE this method existed —
     * `WA1MoveTransactionAtomicity.measure.test.ts` (L-1110) §C/§D, re-run
     * 2026-08-21, 6/6 green while DOCUMENTING the break:
     *   [WA-1 C] isReverting() during a ring-buffer undo = false;
     *            cm history: 1 -> 3 (+2 entries minted BY the undo write); canRedo = false
     *   [WA-1 D] pose after Ctrl+Z #1 === pre-move pose ? true
     *   [WA-1 D] pose after Ctrl+Z #2 === pre-move pose ? false   ← the partner re-displaced
     *
     * That is the founder's 2026-08-21 report verbatim — *"I used the undo
     * dropdown, clicked two steps back, and the adjacent walls did NOT move"* —
     * because step 1 (ring buffer) silently MINTED a fresh forward cascade onto
     * this history, and step 2 then undid THAT cascade, whose captured "before"
     * is the partner's DISPLACED pose. Two steps, both reporting success, and the
     * original cascade never reverted at all.
     *
     * Depth-counted and paired in a `finally` by the one caller
     * (`performUndoRedo._withPausedObservers`) so a throw inside the patch apply
     * cannot strand the latch raised — a stuck latch would silence every
     * structural cascade for the rest of the session, which is a worse defect
     * than the one this closes.
     *
     * ⛔ NOT a general-purpose "suppress everything" switch. It means exactly what
     * `isReverting()` has always meant: *the mutation you are watching is a REPLAY
     * of recorded history, and the history holds its own entry for the
     * consequence you are about to compute.* Do not raise it around a forward
     * gesture.
     */
    beginExternalRevert(): void { this._reverting++; }
    /** Pair of {@link beginExternalRevert}. Floors at 0 — an unbalanced end must
     *  not drive the counter negative and permanently disarm the latch. */
    endExternalRevert(): void { this._reverting = Math.max(0, this._reverting - 1); }

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
            // §L-874 — replayed inverse mutations are not user gestures.
            this._reverting++;
            try {
                // §L-874-ONE-UNDO — the gesture's structural cascades mutated
                // AFTER the command's own write: revert them FIRST, in reverse
                // chronological order, so the whole gesture is one Ctrl+Z.
                this._undoStructuralChildren(entry.structuralChildren);
                const result = entry.command.undo(this.context);
                console.log(`[CommandManager] UNDO result: success=${result.success}`, result.info ?? '');
                if (result.success) {
                    this.redoStack.push(entry);
                }
                return result;
            } finally {
                this._reverting--;
            }
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
            // §L-874 — a redo replays the recorded forward mutation; the cascade
            // entries replay themselves. Services must not re-cascade on top.
            this._reverting++;
            try {
                const result = entry.command.execute(this.context);
                console.log(`[CommandManager] REDO result: success=${result.success}`, result.info ?? '');
                if (result.success) {
                    // §L-874-ONE-UNDO — replay the gesture's structural cascades
                    // in chronological order (services are silent behind the
                    // reverting latch, so nothing re-fires them implicitly).
                    this._redoStructuralChildren(entry.structuralChildren);
                    this.history.push(entry);
                }
                return result;
            } finally {
                this._reverting--;
            }
        });
    }

    /**
     * §GRAPH115 / ADR-0374 — structural children NEST, and the walk must too.
     *
     * A cascade dispatched from inside ANOTHER cascade's execute() — the
     * measured case: a fixture anchored to a wall that `CascadeWallBaselineCommand`
     * moved, or a finish following that same neighbour wall — attaches to the
     * INNER frame (`_execFrames[len-2]` is the cascade, not the gesture), so it
     * lands one level deeper than the gesture's own `structuralChildren`. The
     * previous walker called `child.command.undo()` on the first level only and
     * never looked inside: a depth-2 child was neither undone nor redone, and
     * nothing printed. One Ctrl+Z then left the fixture where the cascade put it
     * — the C84 EI-7 write-set ⊋ restore-set inequality, hidden inside the very
     * mechanism built to close it. Both walkers now recurse; a flat entry (no
     * nested children) takes exactly the path it always took.
     *
     * Order is the §L-874 rule applied at every depth: undo visits a child's OWN
     * children first (they mutated after it), then the child; redo replays the
     * child, then its children.
     */
    private _undoStructuralChildren(subs: HistoryEntry[] | undefined): void {
        if (!subs) return;
        for (let i = subs.length - 1; i >= 0; i--) {
            const child = subs[i]!;
            this._undoStructuralChildren(child.structuralChildren);
            try {
                const r = child.command.undo(this.context);
                if (!r.success) {
                    console.warn(`[CommandManager] UNDO structural child ${child.command.type} reported failure`, r.info ?? '');
                }
            } catch (e) {
                console.warn(`[CommandManager] UNDO structural child ${child.command.type} threw`, e);
            }
        }
    }

    private _redoStructuralChildren(subs: HistoryEntry[] | undefined): void {
        if (!subs) return;
        for (const child of subs) {
            try {
                const r = child.command.execute(this.context);
                if (!r.success) {
                    console.warn(`[CommandManager] REDO structural child ${child.command.type} reported failure`, r.info ?? '');
                }
            } catch (e) {
                console.warn(`[CommandManager] REDO structural child ${child.command.type} threw`, e);
            }
            this._redoStructuralChildren(child.structuralChildren);
        }
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

    getHistory(): HistoryEntry[] {
        return [...this.history];
    }

    /**
     * §UNDO-HISTORY-DROPDOWN (ADR-0341) — the undo history as FROZEN, LIVE-OBJECT-FREE
     * rows, oldest first. `[length - 1]` is what the next `undo()` would revert.
     *
     * THIS IS THE ACCESSOR A UI MAY USE. `getHistory()` above hands out the live
     * `Command` instances (see {@link LegacyHistoryEntryView}); this hands out
     * scalars with no route back to one.
     *
     * WHAT IT CANNOT CONTAIN, AND WHY THAT IS THE POINT. A collaborator's edit is
     * never in `this.history` — `execute()` excludes `source: 'REMOTE'` AND any
     * command dispatched inside a remote-origin bus dispatch (§UNDO-REMOTE-ORIGIN,
     * C03 §4.6 U-1). So this projection cannot list another user's action even by
     * accident: the exclusion is upstream of it, at the push, which is the only
     * place it can be enforced once. A filter HERE would have been a second,
     * weaker copy of that rule — and the first copy is the one the two-client
     * harness measured.
     *
     * Never throws. O(n) in history depth (≤ the legacy stack's natural size);
     * call it on demand when a menu opens, not per frame.
     */
    getUndoHistoryView(): readonly LegacyHistoryEntryView[] {
        try {
            return Object.freeze(this.history.map((e, i) => _viewOf(e, i)));
        } catch (err) {
            console.warn('[CommandManager] getUndoHistoryView failed', err);
            return Object.freeze([]);
        }
    }

    /**
     * §UNDO-HISTORY-DROPDOWN (ADR-0341) — the redo stack as frozen rows, in
     * STACK order (oldest push first). `[length - 1]` is what the next `redo()`
     * would re-apply. Mirror of {@link getUndoHistoryView}; same guarantees.
     */
    getRedoHistoryView(): readonly LegacyHistoryEntryView[] {
        try {
            return Object.freeze(this.redoStack.map((e, i) => _viewOf(e, i)));
        } catch (err) {
            console.warn('[CommandManager] getRedoHistoryView failed', err);
            return Object.freeze([]);
        }
    }

    // ------------------------------------------------------------------
    // FIX 3: canUndo / canRedo helpers — useful for toolbar button states
    // ------------------------------------------------------------------
    canUndo(): boolean { return this.history.length > 0; }
    canRedo(): boolean { return this.redoStack.length > 0; }

    // ------------------------------------------------------------------
    // §UNDO-CROSS-STACK-ORDER (C03 §4.5 / §4.7 follow-up 2) — read-only peeks
    // for the unified undo path (performUndoRedo.ts). The two undo stacks
    // (this history vs the CommandBus ring buffer) have independent cursors;
    // performUndo compares the TOP entry's commit time on each side and undoes
    // the NEWER one first, so a commandManager-only action (e.g. a 3D-placed
    // door/window ADD_OPENING) is not "jumped over" by an older ring-buffer
    // entry. `command.timestamp` is `Date.now()` at construction — the same
    // clock the ring buffer's PatchPair.timestamp uses at push.
    // Read-only: neither method moves a cursor or mutates the stacks.
    // ------------------------------------------------------------------

    /** Epoch-ms of the entry the next `undo()` would revert, or null when empty. */
    peekUndoTimestamp(): number | null {
        const top = this.history[this.history.length - 1];
        const t = top?.command?.timestamp;
        return typeof t === 'number' && Number.isFinite(t) ? t : null;
    }

    /**
     * The `targetIds` of the entry the next `undo()` would revert (empty when the
     * history is empty). `performUndoRedo` intersects these with the ids in the
     * ring buffer's top entry: an overlap means the two stacks hold the SAME
     * gesture (a dual-dispatch twin), not two different actions, so the
     * chronological ordering must NOT re-route it — see §UNDO-CROSS-STACK-ORDER.
     */
    peekUndoTargetIds(): readonly string[] {
        const top = this.history[this.history.length - 1];
        const t = top?.command?.targetIds;
        return Array.isArray(t) ? t : [];
    }

    /**
     * §UNDO-GESTURE-ID (C03 §4.6 U-10) — the gesture id of the entry the next
     * `undo()` would revert, or `null` when the history is empty OR the entry was
     * executed without a declared gesture.
     *
     * The two nulls are deliberately the same answer HERE because they mean the
     * same thing to the only caller: `performUndo` cannot prove this entry is the
     * ring buffer's twin, so it must not treat it as one. What it must never do is
     * treat "unknown" as "yes" — which is exactly what the 250 ms window did.
     */
    peekUndoGestureId(): string | null {
        const top = this.history[this.history.length - 1];
        const g = top?.metadata?.gestureId;
        return typeof g === 'string' && g.length > 0 ? g : null;
    }

    /** Epoch-ms of the entry the next `redo()` would re-apply, or null when empty. */
    peekRedoTimestamp(): number | null {
        const top = this.redoStack[this.redoStack.length - 1];
        const t = top?.command?.timestamp;
        return typeof t === 'number' && Number.isFinite(t) ? t : null;
    }

    clearHistory(): void {
        this.history = [];
        this.redoStack = [];
    }

    // ------------------------------------------------------------------
    // §GEN-UNDO-COALESCE (L-376d / L-375d) — generation undo-batch scope.
    // Bracketed by buildingGenerationLifecycle around a whole resi/office/house
    // generation. See the `_genBatch` field doc + execute() for the semantics.
    // ------------------------------------------------------------------

    /**
     * Open a generation undo batch. While open, execute() skips the per-command
     * snapshot (atomic generation — kills the O(N·M) `structuredClone` tail) and
     * accumulates undoable commands instead of pushing them, so the whole
     * generation collapses to ONE undo entry at endGenerationBatch().
     *
     * Idempotent: a begin while one is already open is a no-op (generations do
     * not nest in practice; the lifecycle reuses the in-flight lease).
     */
    beginGenerationBatch(): void {
        if (this._genBatch !== null) return;
        this._genBatch = [];
    }

    /** True while a generation undo batch is open (test / diagnostic seam). */
    get isGenerationBatchOpen(): boolean {
        return this._genBatch !== null;
    }

    /**
     * Close the generation undo batch: wrap every accumulated child command in
     * ONE {@link CompositeCommand} and push it as a single undo-stack entry
     * (C16 §8.6). A generation that accumulated nothing pushes nothing. Always
     * safe to call (idempotent when no batch is open).
     *
     * @returns the number of child commands coalesced (0 when nothing was open
     *          or nothing accumulated).
     */
    endGenerationBatch(): number {
        const batch = this._genBatch;
        this._genBatch = null;
        if (!batch || batch.length === 0) return 0;
        const composite = new CompositeCommand(batch.map(b => b.command), 'Generate building');
        // The generation is a single HUMAN-initiated action → HUMAN_DIRECT so it
        // is a normal undoable entry (never REMOTE / PROJECT_LOAD).
        this.history.push({ command: composite, metadata: { source: 'HUMAN_DIRECT' } });
        this.redoStack = [];
        console.log(`[CommandManager] §GEN-UNDO-COALESCE — collapsed ${batch.length} generation command(s) into ONE undo entry`);
        return batch.length;
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
