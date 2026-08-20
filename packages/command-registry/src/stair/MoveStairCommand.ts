// §03-STAIR-COMMAND-PIPELINE-CONTRACT — stair translation (3D-gizmo move).
//
// PURPOSE
// ───────────────────────────────────────────────────────────────────────────
// Translate a stair by a world-space delta. The stair mesh bakes its geometry
// in WORLD coordinates with the Object3D at local origin (0,0,0) — moving the
// stair therefore means shifting every world anchor the StairMeshBuilder reads:
//   • startPosition          — the primary build anchor
//   • flights[].startOverride — U/L flight re-anchors (corner-pinned)
//   • landings[].center       — polyline-corner landing centres
// then re-emitting `bim-stair-updated` so StairMeshBuilder.updateStair rebuilds
// the geometry at the new location.
//
// This mirrors the WALL move path (UpdateWallBaselineCommand / wall.updateBaseline)
// — the gizmo computes a delta, the command persists it through the store, and
// the builder rebuilds. P6 compliant (mutation only via command); undo via the
// full-snapshot restoreSnapshot path used by every other stair command.

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext
} from '../types';
import { StairData, Vec3 } from '@pryzm/geometry-stair';
// §STAIR-VOID-FOLLOWS-SPAN (L-1532, closes L-1432) — a move must drag EVERY void
// this stair owns, not only the slab one. See the module header there.
import {
    cascadeStairVoids,
    undoStairVoidCascade,
    toStairVoidSource,
    EMPTY_STAIR_VOID_CASCADE,
    type StairVoidCascade,
} from './StairVoidCascade';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface MoveStairInput {
    stairId: string;
    /** World-space translation. `y` defaults to 0 (level-plane move, like walls). */
    delta: { x: number; y?: number; z: number };
}

function isFiniteNum(n: unknown): n is number {
    return typeof n === 'number' && Number.isFinite(n);
}

export class MoveStairCommand implements Command {
    // §FIX-STAIR-MOVE-STRANDS-VOID (review C-02) — a move re-reconciles the
    // auto-carved slab void, so this command touches the opening + slab stores
    // exactly like DeleteStairCommand does.
    //
    // ⭐ §STAIR-VOID-FOLLOWS-SPAN (L-1532, closes L-1432) — 'floor' and 'ceiling'
    // JOIN the declaration, because this command now moves those voids too. It
    // moved NEITHER before: `pierceStairHorizontalHosts` had zero call sites in
    // this file, so a moved stair dragged its slab void along and left its
    // floor-finish and ceiling voids at the OLD footprint, permanently. An
    // undeclared cascade is invisible to the scoped snapshot (C03 §4.6 U-2), so the
    // declaration and the cascade land together — never one without the other.
    readonly affectedStores = ["stair", "opening", "slab", "floor", "ceiling"] as const;
    readonly id: string;
    readonly type = CommandType.MOVE_STAIR;
    readonly timestamp: number;
    readonly targetIds: string[];

    private stairId: string;
    private delta: { x: number; y: number; z: number };
    // Full StairData snapshot captured at execute() for a faithful undo (mirrors
    // UpdateStairParametersCommand / DeleteStairCommand — restoreSnapshot does
    // not bump version or modifiedAt).
    private _snapshot: StairData | null = null;
    // §FIX-STAIR-MOVE-STRANDS-VOID — before/after of the void cascade, reverted
    // inside THIS command's undo() (one undo unit for move + every void it moved).
    /** §L-1433 / §L-1532 — one record PER PIERCED DECK, in EVERY family. */
    private _voidCascade: StairVoidCascade = EMPTY_STAIR_VOID_CASCADE;
    private executed = false;

    constructor(input: MoveStairInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        this.stairId = input.stairId;
        this.delta = { x: input.delta.x, y: input.delta.y ?? 0, z: input.delta.z };
        this.targetIds = [input.stairId];
        Object.freeze(this.targetIds);
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        if (!isFiniteNum(this.delta.x) || !isFiniteNum(this.delta.y) || !isFiniteNum(this.delta.z)) {
            return { ok: false, reason: 'delta must be a finite Vec3', blockingIssues: ['delta must be a finite Vec3'] };
        }
        const stair = ctx.stores.stairStore.get(this.stairId);
        if (!stair) {
            return { ok: false, reason: `Stair "${this.stairId}" not found`, blockingIssues: [`Stair ${this.stairId} not found`] };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const { stairStore } = ctx.stores;
        const stair = stairStore.get(this.stairId);
        if (!stair) {
            return { success: false, affectedElementIds: [], info: [`Stair "${this.stairId}" not found`] };
        }

        // Snapshot BEFORE mutation for faithful undo.
        this._snapshot = structuredClone(stair as StairData);

        const d = this.delta;
        const shift = (v: Vec3): Vec3 => ({ x: v.x + d.x, y: v.y + d.y, z: v.z + d.z });

        const updates: Partial<StairData> = {
            startPosition: shift(stair.startPosition),
            flights: stair.flights.map(f =>
                f.startOverride ? { ...f, startOverride: shift(f.startOverride) } : { ...f }
            ),
            landings: stair.landings.map(l =>
                l.center ? { ...l, center: shift(l.center) } : { ...l }
            ),
        };

        stairStore.update(this.stairId, updates);
        this.executed = true;

        // §FIX-STAIR-MOVE-STRANDS-VOID (review C-02) — the auto-carved slab void
        // was keyed idempotently (`opening-stair-<id>`), so without this the void
        // stayed at the OLD footprint after a move. Re-reconcile against the moved
        // stair: the SAME opening id is updated in place (never a second void).
        //
        // §STAIR-VOID-FOLLOWS-SPAN (L-1532) — and the SAME is true of the
        // floor-finish and ceiling voids, which this command did not touch at all.
        // One cascade, every family, one undo record.
        try {
            const moved = stairStore.get(this.stairId);
            this._voidCascade = moved
                ? cascadeStairVoids(ctx, toStairVoidSource(moved as unknown as StairData))
                : EMPTY_STAIR_VOID_CASCADE;
        } catch (err) {
            console.warn('[MoveStairCommand] void cascade failed (non-fatal):', err);
            this._voidCascade = EMPTY_STAIR_VOID_CASCADE;
        }

        _bus.emit('ai-model-update', {}); // F.events.17

        console.log(`[MoveStairCommand] Moved stair ${this.stairId} by`, this.delta);

        return { success: true, affectedElementIds: [this.stairId], info: ['Stair moved'] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.executed || !this._snapshot) {
            return { success: false, affectedElementIds: [], info: ['Cannot undo: command was never executed'] };
        }
        ctx.stores.stairStore.restoreSnapshot(this._snapshot);
        // §STAIR-VOID-FOLLOWS-SPAN (L-1532) — revert the WHOLE void cascade in the
        // SAME undo unit as the move. The stair is restored FIRST: the
        // floor/ceiling half re-derives its voids from the restored record rather
        // than replaying a snapshot of a derived value.
        undoStairVoidCascade(ctx, this._voidCascade, toStairVoidSource(this._snapshot));
        this._voidCascade = EMPTY_STAIR_VOID_CASCADE;
        _bus.emit('ai-model-update', {}); // F.events.17
        console.log(`[MoveStairCommand] Undone move for stair ${this.stairId}`);
        return { success: true, affectedElementIds: [this.stairId], info: ['Stair move undone'] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { stairId: this.stairId, delta: this.delta },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}
