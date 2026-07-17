// CompositeCommand — coalesce N already-executed child commands into ONE
// undo-stack entry (L-376d / L-375d, C16 §8.6).
//
// WHY THIS EXISTS
// ----------------------------------------------------------------------------
// A residential / office / house generation drives HUNDREDS of individual
// `commandManager.execute(new CreateXCommand(...))` calls (stairs, lifts, slabs,
// floors, roofs, room-bounding lines, rooms, handrails, furniture…). Walls are
// already coalesced to one `wall.batch.create` per level on the bus (L-131), but
// every OTHER element type went through the legacy CommandManager one at a time,
// each paying:
//   • a `createSnapshot()` (`structuredClone` over the command's `affectedStores`
//     — for stairs that scope is `["stair","opening","slab"]`, so each per-stair
//     snapshot clones the GROWING slab store → an O(N·M) tail), and
//   • a separate `history.push()` → the generation was hundreds of undo entries,
//     not one undo unit (L-376f, a C16 §8.6 violation).
//
// The BatchCoordinator is explicitly undo-neutral (its own header, §8.7): "one
// gesture = one undo entry is bought by dispatching ONE batch command, never by
// holding a batch open." On the BUS that batch command is `*.batch.create`
// (produceCommand → one patch pair). Stairs and lifts, however, render ONLY
// through the legacy CommandManager path (Path C — there is no bus render bridge
// for them, see CommandEventBridge.ts TASK-13), so the canonical legacy-side
// equivalent of `wall.batch.create` is this: ONE command that wraps the SAME
// per-element child commands the executors already build, executed against the
// SAME `ctx.stores` — so the geometry / auto-openings / railings / rooms are
// byte-identical, but the whole set is ONE snapshot + ONE undo unit.
//
// USAGE
// ----------------------------------------------------------------------------
// This command is NOT dispatched through `commandManager.execute()`. Its children
// are executed individually (so per-child validation, per-child result handling,
// and per-child side effects — e.g. the executors' stair-void recording — are all
// preserved). The CommandManager accumulates the successfully-executed children
// during a generation batch and, at `endGenerationBatch()`, wraps them in ONE
// CompositeCommand pushed directly onto the undo history. The composite therefore
// only ever runs its `undo()` (Ctrl+Z) and `execute()` (redo) — never a first
// `execute()` from the CommandManager dispatch path.

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';

export class CompositeCommand implements Command {
    readonly id: string;
    readonly type = CommandType.COMPOSITE;
    readonly timestamp: number;
    readonly targetIds: string[];
    /** Union of every child's declared store footprint (deduped). Used by the
     *  CommandManager's scoped snapshot IF the composite is ever dispatched
     *  through `execute()` — the coalesced path never does, but the Command
     *  contract requires an accurate declaration. */
    readonly affectedStores: ReadonlyArray<string>;

    /** The children in EXECUTION order. `undo()` reverses this order; `execute()`
     *  (redo) replays it. */
    private readonly children: readonly Command[];
    private readonly label: string;

    /**
     * @param children  The child commands, in the order they were executed.
     * @param label     Human-readable tag for logs (e.g. "Generate building").
     */
    constructor(children: readonly Command[], label = 'Composite') {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        this.children = children.slice();
        this.label = label;

        const stores = new Set<string>();
        const targets: string[] = [];
        for (const child of this.children) {
            for (const s of child.affectedStores ?? []) stores.add(s);
            for (const t of child.targetIds ?? []) targets.push(t);
        }
        this.affectedStores = [...stores];
        this.targetIds = targets;
    }

    /** Number of wrapped child commands (test / diagnostic seam). */
    get childCount(): number {
        return this.children.length;
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        // Defensive only — the coalesced path never calls this (children were
        // validated + executed individually). A redo re-validates each child.
        for (const child of this.children) {
            const r = child.canExecute(ctx);
            if (!r.ok) return r;
        }
        return { ok: true };
    }

    /** REDO — replay every child in original execution order. Mirrors the
     *  CommandManager.redo() single-command path (`command.execute(ctx)`), just
     *  fanned across the wrapped set. A failing child is logged and skipped so a
     *  single re-create failure cannot strand the rest of the redo. */
    execute(ctx: CommandContext): CommandResult {
        const affectedElementIds: string[] = [];
        for (const child of this.children) {
            try {
                const r = child.execute(ctx);
                if (r?.affectedElementIds) affectedElementIds.push(...r.affectedElementIds);
                if (r && r.success === false) {
                    console.warn(`[CompositeCommand:${this.label}] child redo returned failure:`, r.info ?? r.error);
                }
            } catch (err) {
                console.warn(`[CompositeCommand:${this.label}] child redo threw (non-fatal):`, err);
            }
        }
        return { success: true, affectedElementIds, info: [`Redid ${this.children.length} command(s) — ${this.label}`] };
    }

    /** UNDO — reverse every child in REVERSE execution order so dependent
     *  mutations unwind in the right order (e.g. an opening punched by a later
     *  child is removed before the slab it sits on). Each child owns its own undo
     *  (CreateStairCommand.undo removes the stair + auto-opening + railings, etc.).
     *  A throwing child is logged and skipped so one bad undo cannot strand the
     *  rest of the batch. */
    undo(ctx: CommandContext): CommandResult {
        const affectedElementIds: string[] = [];
        for (let i = this.children.length - 1; i >= 0; i--) {
            const child = this.children[i]!;
            try {
                const r = child.undo(ctx);
                if (r?.affectedElementIds) affectedElementIds.push(...r.affectedElementIds);
            } catch (err) {
                console.warn(`[CompositeCommand:${this.label}] child undo threw (non-fatal):`, err);
            }
        }
        return { success: true, affectedElementIds, info: [`Undid ${this.children.length} command(s) — ${this.label}`] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: {
                label: this.label,
                children: this.children.map(c => c.serialize()),
            },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
        };
    }
}
