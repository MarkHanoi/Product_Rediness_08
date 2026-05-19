import {
    Command, CommandContext, CommandType,
    CommandValidationResult, CommandResult, SerializedCommand,
} from '../types';
import { doorStore } from '@pryzm/geometry-door';
import { DoorOpening, DoorOpeningSchema } from '@pryzm/geometry-door';

/**
 * D3 — UpdateDoorParameterCommand
 *
 * Applies an arbitrary parameter patch to a DoorOpening in the rich DoorStore
 * and propagates compatible fields to the legacy WallStore so both stores remain
 * in sync (§03 two-store sync rule).
 *
 * §DOOR-AUDIT-2026 P-EXEC-PREV (P2 #8):
 *   `prev` is now captured at execute() time from the live store snapshot.
 *   The constructor argument is treated as a hint only — it is overwritten
 *   on first execute() so undo always restores the exact pre-execute values
 *   even after deferred / queued execution.
 *
 * §DOOR-AUDIT-2026 P-CAN-EXEC-VALIDATE (P2 #13):
 *   `canExecute()` runs `DoorOpeningSchema.safeParse(merged)` so validation
 *   failures surface as `{ ok: false, reason }` rather than thrown exceptions
 *   inside `execute()`.
 *
 * §DOOR-AUDIT-2026 / §WIN-AUDIT-2026 deep-freeze (M2 mirror):
 *   Both `patch` and the captured `prev` are deeply frozen so no caller can
 *   mutate the historical record (e.g. nested arrays in `segments`).
 *
 * Contract compliance:
 *  - §03: Command → Store flow; builder is notified via DoorStore 'update' event
 *  - §06: DoorStore.update() calls storeEventBus.emit() internally
 *  - Identity fields (id, wallId, openingId) are guarded by DoorStore.update()
 *  - PLAN-04: O(n) wall scan and window.wallFragmentBuilder removed —
 *    WallStore.updateDoor() emits its own 'update' event which WallFragmentBuilder
 *    already subscribes to, making the direct builder call redundant.
 */
function deepFreeze<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
    for (const key of Object.keys(obj as Record<string, unknown>)) {
        const v = (obj as Record<string, unknown>)[key];
        if (v && typeof v === 'object') deepFreeze(v);
    }
    return Object.freeze(obj);
}

export class UpdateDoorParameterCommand implements Command {
    readonly affectedStores = ["door", "wall"] as const;
    id: string = crypto.randomUUID();
    type = CommandType.UPDATE_DOOR_PARAMETER;
    timestamp: number = Date.now();
    targetIds: string[];

    private prev: Partial<DoorOpening>;
    private prevCapturedAtExecute = false;

    constructor(
        private doorId: string,
        private patch: Partial<DoorOpening>,
        prev: Partial<DoorOpening> = {},
    ) {
        this.targetIds = [doorId];
        this.patch = deepFreeze({ ...patch });
        this.prev  = deepFreeze({ ...prev });
    }

    canExecute(_context: CommandContext): CommandValidationResult {
        const current = doorStore.getById(this.doorId);
        if (!current) {
            return { ok: false, reason: `Door not found: ${this.doorId}` };
        }
        const merged = { ...current, ...this.patch };
        const parsed = DoorOpeningSchema.safeParse(merged);
        if (!parsed.success) {
            return { ok: false, reason: `Invalid door patch: ${parsed.error.issues.map(i => i.message).join('; ')}` };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const current = doorStore.getById(this.doorId);
        if (!current) {
            return { success: false, affectedElementIds: [], info: [`Door not found: ${this.doorId}`] };
        }
        // §DOOR-AUDIT-2026 P-EXEC-PREV: capture prev at execute-time (idempotent
        // across redo — only first execute writes; subsequent redoes use the
        // captured value to keep undo deterministic).
        if (!this.prevCapturedAtExecute) {
            const captured: Partial<DoorOpening> = {};
            for (const key of Object.keys(this.patch) as (keyof DoorOpening)[]) {
                (captured as any)[key] = current[key];
            }
            this.prev = deepFreeze(captured);
            this.prevCapturedAtExecute = true;
        }
        doorStore.update(this.doorId, this.patch);
        this._syncWallStore(context, this.patch);
        return { success: true, affectedElementIds: [this.doorId] };
    }

    undo(context: CommandContext): CommandResult {
        if (!doorStore.has(this.doorId)) {
            return { success: false, affectedElementIds: [], info: [`Door not found for undo: ${this.doorId}`] };
        }
        doorStore.update(this.doorId, this.prev);
        this._syncWallStore(context, this.prev);
        return { success: true, affectedElementIds: [this.doorId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            payload: { doorId: this.doorId, patch: this.patch, prev: this.prev },
            version: 2,
        };
    }

    private _syncWallStore(context: CommandContext, delta: Partial<DoorOpening>): void {
        try {
            const ws = context.stores.wallStore;
            if (!ws.getDoor(this.doorId)) return;
            ws.updateDoor(this.doorId, delta as any);
        } catch {
        }
    }
}
