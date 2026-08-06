/**
 * UpdateDoorSystemTypeCommand — §FIX-HOSTED-TYPE-CHANGE (L-620).
 *
 * ── THE DEFECT THIS CLOSES ────────────────────────────────────────────────────
 *
 * The properties-panel "Door Type" dropdown is fully populated and has an Apply button,
 * and applying did nothing. ADR-0105 introduced the uniform `element.changeType` bus
 * command and correctly routed WALLS to the LEGACY CommandManager command that reaches
 * the geometry store — but it left doors and windows routed to the plugin-bus handlers
 * `door.setType` / `window.setType`, and explicitly recorded that as out of scope
 * ("forking dedicated command-registry door/window type-change commands … not in scope").
 *
 * Those handlers mutate the plugin Immer DTO store (`plugins/door/src/store.ts`), which
 * is DETACHED from the geometry `doorStore` that `DoorBuilder` subscribes to and that the
 * DoorTool / plan bridge actually populate. So `canExecute` returned `door not found: <id>`,
 * the bus rejected, and the panel's `.then()` — and with it the host-wall rebuild nudge —
 * never ran. Exactly the wall disease ADR-0105 diagnosed, left in place for the openings.
 * (Second, independent break: `SetDoorTypeHandler.execute` never writes `systemTypeId` at
 * all, and `DoorData` in the plugin store has no such field — so even a populated DTO
 * store could not have persisted the type.)
 *
 * ── THE FIX, AND WHY IT IS THE WALL'S SHAPE ───────────────────────────────────
 *
 * This command is the door twin of `UpdateWallSystemTypeCommand`, the proven path:
 *   canExecute → the LEGACY geometry store;  execute → `doorStore.update()` → the store's
 *   `'update'` event → `DoorBuilder` rebuild (`systemTypeId` is deliberately NOT in
 *   `DoorBuilder._PROPERTY_ONLY_FIELDS`, so a type change forces a full mesh rebuild);
 *   undo → the EXACT pre-image via `doorStore.replace()`.
 *
 * `replace()` — not `update()` — for the undo, for the reason the backfill records: a
 * merge-patch can set a field but never UNSET one, and undo must restore the prior state,
 * not an approximation of it (C03 §4.5). Retyping a door that had NO type must be able to
 * take `systemTypeId` / `frameFinish` / `leafFinish` back OFF the record.
 *
 * C15 — the element id, the `openingId`, the host `wallId` and the structural void
 * (`offset` / `width` / `height` / `sillHeight`) are PRESERVED by `planDoorTypeChange`,
 * so the host wall's CSG opening is never disturbed and the hosted relationship survives.
 * This command writes NOTHING to the wall store.
 *
 * P8 — execute/undo emit spans; the planner emits its own.
 */

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { trace, type Tracer } from '@opentelemetry/api';
import { doorStore, planDoorTypeChange, type DoorOpening } from '@pryzm/geometry-door';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

export interface UpdateDoorSystemTypeInput {
    readonly doorId: string;
    readonly systemTypeId: string;
}

export class UpdateDoorSystemTypeCommand implements Command {
    /** Doors are hosted ON walls; the wall snapshot scope covers the opening. */
    readonly affectedStores = ['door', 'wall'] as const;
    id: string = crypto.randomUUID();
    type = CommandType.UPDATE_DOOR_SYSTEM_TYPE;
    timestamp: number = Date.now();
    targetIds: string[];

    /** EXACT pre-change record — the undo restores this verbatim. */
    private prevSnapshot: DoorOpening | null = null;

    constructor(private input: UpdateDoorSystemTypeInput) {
        this.targetIds = [input.doorId];
    }

    canExecute(_ctx: CommandContext): CommandValidationResult {
        const door = doorStore.getById(this.input.doorId);
        if (!door) return { ok: false, reason: `Door ${this.input.doorId} not found` };
        // A FINDING, not a silent fallback — an unresolvable type is refused, never invented.
        const plan = planDoorTypeChange(door, this.input.systemTypeId);
        if (plan.blockedReason) return { ok: false, reason: plan.blockedReason };
        return { ok: true };
    }

    execute(_ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.door.updateSystemType', (span) => {
            try {
                const door = doorStore.getById(this.input.doorId);
                if (!door) { span.end(); return { success: false, affectedElementIds: [] }; }

                const plan = planDoorTypeChange(door, this.input.systemTypeId);
                if (plan.blockedReason) {
                    console.warn(plan.blockedReason);
                    span.setAttribute('pryzm.door.typeChange.blocked', true);
                    span.end();
                    return { success: false, affectedElementIds: [], info: [plan.blockedReason] };
                }

                // Snapshot BEFORE mutating — the undo contract is "the original record,
                // byte-for-byte", and only a pre-image can honour that (C03 §4.5).
                this.prevSnapshot = structuredClone(door);

                doorStore.update(this.input.doorId, plan.patch as Partial<DoorOpening>);

                span.setAttribute('pryzm.door.id', this.input.doorId);
                span.setAttribute('pryzm.door.systemTypeId.from', plan.from ?? '<none>');
                span.setAttribute('pryzm.door.systemTypeId.to', plan.to);
                span.end();
                // The host wall is reported as affected so downstream repaint/selection
                // sees the opening; NO wall store write is performed (the void is unmoved).
                return { success: true, affectedElementIds: [this.input.doorId, door.wallId] };
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        });
    }

    undo(_ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.door.updateSystemType.undo', (span) => {
            try {
                if (!this.prevSnapshot) { span.end(); return { success: false, affectedElementIds: [] }; }
                // replace(), not update(): a merge-patch cannot UNSET a field, so it cannot
                // reverse a stamp onto a previously untyped door.
                doorStore.replace(this.prevSnapshot);
                span.end();
                return {
                    success: true,
                    affectedElementIds: [this.prevSnapshot.id, this.prevSnapshot.wallId],
                };
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        });
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
            payload: { doorId: this.input.doorId, systemTypeId: this.input.systemTypeId },
        };
    }
}
