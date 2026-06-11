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
    readonly affectedStores = ["stair"] as const;
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

        _bus.emit('ai-model-update', {}); // F.events.17

        console.log(`[MoveStairCommand] Moved stair ${this.stairId} by`, this.delta);

        return { success: true, affectedElementIds: [this.stairId], info: ['Stair moved'] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.executed || !this._snapshot) {
            return { success: false, affectedElementIds: [], info: ['Cannot undo: command was never executed'] };
        }
        ctx.stores.stairStore.restoreSnapshot(this._snapshot);
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
