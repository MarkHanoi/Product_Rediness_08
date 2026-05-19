import { Command, CommandContext, CommandType, CommandValidationResult, CommandResult, SerializedCommand } from '../types';
import * as THREE from '@pryzm/renderer-three/three';
import { doorStore } from '@pryzm/geometry-door';
import { wallOccupancyStore } from '@pryzm/geometry-wall';

/**
 * MoveDoorCommand — relative-move command (distance + direction) used by the
 * AI service and by the command-replay registry.  The drag-end pipeline now
 * dispatches the absolute SetDoorOffsetCommand instead, so this command's
 * primary remaining role is scripted / serialized invocations.
 *
 * §REDO-IDEMPOTENCY §WALL-AUDIT-2026: A command's execute() must be IDEMPOTENT
 * across re-execution (i.e. redo).  The previous implementation re-derived
 * `oldOffset` and `newOffset` from the live store on every execute(), which
 * meant two intermixed redo cycles would compute different offsets each pass
 * (a sequence-dependent state machine instead of a deterministic delta).
 *
 * Architectural fix: capture both `oldOffset` and `newOffset` ONCE on the first
 * execute() (delta resolved against the store at that instant); on every
 * subsequent execute() (redo) reapply the stored absolute newOffset directly.
 * undo() reapplies the stored absolute oldOffset.  An `executed` flag prevents
 * double-execution from advancing the saved deltas.  Mirrors the same pattern
 * used by UpdateWallBaselineCommand (executed flag + ctorPrev snapshot).
 */
export class MoveDoorCommand implements Command {
    readonly affectedStores = ["door", "wall"] as const;
    id: string = crypto.randomUUID();
    type = CommandType.MOVE_DOOR;
    timestamp: number = Date.now();
    targetIds: string[];

    // §REDO-IDEMPOTENCY: captured once on first execute, reused on redo.
    private oldOffset: number | null = null;
    private newOffset: number | null = null;
    private executed = false;

    constructor(private doorId: string, private distance: number, private direction: 'left' | 'right') {
        this.targetIds = [doorId];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const doorElem = context.stores.wallStore.getDoor(this.doorId);
        if (!doorElem) return { ok: false, reason: 'Door not found' };

        const wall = context.stores.wallStore.getById(doorElem.wallId);
        if (!wall) return { ok: false, reason: 'Host wall not found' };

        const start = wall.baseLine[0];
        const end = wall.baseLine[1];
        const wallLength = new THREE.Vector3().subVectors(end, start).length();

        // §REDO-IDEMPOTENCY: when re-executing (redo), validate against the
        // already-resolved absolute newOffset rather than re-applying the delta
        // to the (post-undo) live offset — otherwise the validation would
        // diverge from execute()'s actual mutation.
        const targetOffset = this.executed && this.newOffset !== null
            ? this.newOffset
            : this._clampedDelta(doorElem.offset, doorElem.width, wallLength);

        const occupancy = wallOccupancyStore.canPlace(wall, targetOffset, doorElem.width, doorElem.id);
        if (!occupancy.valid) {
            return { ok: false, reason: occupancy.reason ?? 'Position is occupied or out of bounds' };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const wallStore = context.stores.wallStore;
        const doorElem = wallStore.getDoor(this.doorId);
        if (!doorElem) return { success: false, affectedElementIds: [] };

        const wall = wallStore.getById(doorElem.wallId);
        if (!wall) return { success: false, affectedElementIds: [] };

        // §REDO-IDEMPOTENCY: resolve absolute offsets ONCE on first execute.
        // On every subsequent execute() (redo) reuse the saved newOffset so the
        // command is deterministic regardless of where the live store happens
        // to be at redo time.
        if (!this.executed) {
            const start = wall.baseLine[0];
            const end = wall.baseLine[1];
            const wallLength = new THREE.Vector3().subVectors(end, start).length();
            this.oldOffset = doorElem.offset;
            this.newOffset = this._clampedDelta(doorElem.offset, doorElem.width, wallLength);
        }

        if (this.newOffset === null) return { success: false, affectedElementIds: [] };

        wallStore.updateDoor(this.doorId, { offset: this.newOffset });

        if (doorStore.has(this.doorId)) {
            doorStore.update(this.doorId, { offset: this.newOffset });
        }

        this.executed = true;
        return { success: true, affectedElementIds: [this.doorId] };
    }

    undo(context: CommandContext): CommandResult {
        if (!this.executed || this.oldOffset === null) {
            return { success: false, affectedElementIds: [] };
        }
        context.stores.wallStore.updateDoor(this.doorId, { offset: this.oldOffset });

        if (doorStore.has(this.doorId)) {
            doorStore.update(this.doorId, { offset: this.oldOffset });
        }

        this.executed = false;
        return { success: true, affectedElementIds: [this.doorId] };
    }

    /**
     * PLAN-11 CENTER-convention clamp: offset is the distance from baseLine[0]
     * to the CENTRE of the opening, so the valid range is [halfW, length - halfW].
     */
    private _clampedDelta(currentOffset: number, width: number, wallLength: number): number {
        const moveDist = this.direction === 'right' ? this.distance : -this.distance;
        const halfW = width / 2;
        return Math.max(halfW, Math.min(currentOffset + moveDist, wallLength - halfW));
    }

    serialize(): SerializedCommand {
        return { type: this.type, targetIds: this.targetIds, timestamp: this.timestamp, payload: { doorId: this.doorId, distance: this.distance, direction: this.direction }, version: 1 };
    }
}
