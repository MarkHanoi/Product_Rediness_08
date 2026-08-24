// UpdateBoundaryLineHandler / DeleteBoundaryLineHandler.
// §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7913) · C106 §5 · C106 §6 · C84 EI-5.

import {
    withHandlerSpan,
    type CommandHandler,
    type HandlerContext,
    type HandlerResult,
    type ValidationResult,
    produceCommand,
} from '@pryzm/plugin-sdk';
import { BoundaryLine } from '@pryzm/plugin-sdk';
import { resolveBoundaryLineMaterial, type BoundaryLineData } from '@pryzm/geometry-boundary-line';
import type { BoundaryLinesState } from '../store.js';

type Stores = Readonly<{ boundaryLine: BoundaryLinesState } & Record<string, unknown>>;

/**
 * The fields a user may change on an existing boundary line WITHOUT moving it.
 *
 * ⛔ `vertices` IS DELIBERATELY ABSENT, AND THAT IS THE MOST IMPORTANT LINE IN THIS
 * FILE. Changing the geometry is a HOST MOVE: every attached wall, slab and column
 * has to be carried or refused by name, as ONE undo unit
 * (`MoveBoundaryLineCommand`, C106 §3). If `boundaryLine.update` accepted `vertices`
 * it would become a SECOND, quieter way to move the line — one that writes the new
 * geometry and strands every dependent in silence. That is precisely the defect C84
 * EI-PROP calls SILENT, and the way to make it unreachable is to leave the field out
 * of the payload rather than to remember not to send it.
 *
 * `closed` is absent for the same reason: opening or closing a loop adds or removes a
 * SEGMENT, and every attachment stores a `segmentIndex`.
 */
export interface UpdateBoundaryLinePayload {
    readonly boundaryLineId: string;
    /** ⭐ The founder's volume bool, as authored on the element. */
    readonly hasVolume?: boolean;
    readonly height?: number;
    readonly thickness?: number;
    readonly baseOffset?: number;
    readonly systemTypeId?: string;
    readonly materialId?: string;
    readonly materialColor?: string;
    readonly name?: string;
    /**
     * ⭐ §FEAT-BOUNDARY-LINE-PINNED (L-10504) — THE UNPIN ROUTE, and it belongs HERE.
     *
     * `pinned` is the one geometry-ADJACENT field that is not geometry: flipping it
     * moves nothing, renumbers no segment and re-anchors no attachment, so it is
     * exactly the class of change this payload exists for. §40 §3 draws the same line
     * for grids — `TogglePinGridCommand` is an ordinary update, while the geometry it
     * guards is refused.
     *
     * ⛔ AND WITHOUT IT THE PIN WOULD BE A TRAP. A default of `true` with no way to
     * clear it is not "pinned", it is "immutable", and the founder asked for the
     * former. `[[refusing-half-needs-its-escape-hatch]]` (L-942) is the standing
     * receipt: a gate whose "yes" branch goes nowhere is a REGRESSION with a contract
     * citation attached. The refusal in `MoveBoundaryLineCommand` names this field by
     * name so the user is told which door to open.
     */
    readonly pinned?: boolean;
}

export class UpdateBoundaryLineHandler
implements CommandHandler<UpdateBoundaryLinePayload, Stores> {
    readonly type = 'boundaryLine.update';
    readonly affectedStores = ['boundaryLine'] as const;

    canExecute(ctx: HandlerContext<Stores>, cmd: UpdateBoundaryLinePayload): ValidationResult {
        const line = ctx.stores.boundaryLine[cmd.boundaryLineId];
        if (!line) return { valid: false, reason: `boundary line not found: ${cmd.boundaryLineId}` };

        const next = this._merged(line as BoundaryLineData, cmd);
        const parsed = BoundaryLine.safeParse(next);
        if (!parsed.success) {
            return { valid: false, reason: parsed.error.issues[0]?.message ?? 'invalid boundary line' };
        }
        // ⭐ C100 — SWITCHING VOLUME ON IS THE MOMENT A MATERIAL BECOMES REQUIRED.
        // This is the exact gesture that would otherwise produce the handrail defect:
        // a line that was legitimately material-free as linework becomes a solid, and
        // a builder paints it a fallback tint no schedule can see. The refusal names
        // BOTH routes back (pick a material, or leave it as linework).
        const mat = resolveBoundaryLineMaterial(parsed.data as BoundaryLineData);
        if (mat.kind === 'unresolved') return { valid: false, reason: mat.reason };
        return { valid: true };
    }

    execute(ctx: HandlerContext<Stores>, cmd: UpdateBoundaryLinePayload): HandlerResult {
        return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
            const line = ctx.stores.boundaryLine[cmd.boundaryLineId] as BoundaryLineData;
            const next = BoundaryLine.parse(this._merged(line, cmd)) as BoundaryLineData;
            const [nextState, forward, inverse] = produceCommand<BoundaryLinesState>(
                ctx.stores.boundaryLine,
                (draft) => {
                    (draft as Record<string, unknown>)[cmd.boundaryLineId] = next;
                },
            );
            return { forward, inverse, nextStates: { boundaryLine: nextState } };
        });
    }

    /**
     * The next record. ⚠ `undefined` means "not sent", NOT "clear it" — a spread of
     * `{ height: undefined }` over a record that HAS a height would erase it, and the
     * user who toggled `hasVolume` would silently lose an authored dimension.
     */
    private _merged(line: BoundaryLineData, cmd: UpdateBoundaryLinePayload): Record<string, unknown> {
        const patch: Record<string, unknown> = {};
        for (const k of [
            'hasVolume', 'height', 'thickness', 'baseOffset',
            'systemTypeId', 'materialId', 'materialColor', 'name',
            // §FEAT-BOUNDARY-LINE-PINNED (L-10504) — see the payload field's note.
            'pinned',
        ] as const) {
            const v = cmd[k];
            if (v !== undefined) patch[k] = v;
        }
        return { ...(line as unknown as Record<string, unknown>), ...patch };
    }
}

export interface DeleteBoundaryLinePayload {
    readonly boundaryLineId: string;
}

/**
 * ⛔ DELETING THE LINE DELETES **ONLY** THE LINE. C106 §6, and it is a rule rather
 * than an omission.
 *
 * `pool.delete` removes its walls, floor and water; `lift.delete` removes its
 * enclosure, doors and cabin parts; `balcony.delete` removes its plate, finish and
 * railings. All three are right, because those members BELONG to the compound —
 * `childrenIds` says so, and they have no independent existence.
 *
 * A boundary line is NOT a compound. The wall an architect drew along a setting-out
 * line is HERS, not the line's; `childrenIds` stays empty and `attachments` records a
 * reference, not ownership. Deleting the line she used to set the building out must
 * not delete the building. C84 EI-5 (create/delete symmetry) is satisfied exactly:
 * `boundaryLine.create` wrote one record in one store, so `boundaryLine.delete`
 * removes one record from one store.
 *
 * ⚠ The attached elements are left in place with no boundary line above them, which
 * means they stop following anything. That is the correct outcome and it is stated
 * so nobody "fixes" it later: an element whose host is gone is a free element, not an
 * orphan, and the alternative — refusing to delete a line while anything is attached —
 * would trap the user with a line they can neither move nor remove.
 */
export class DeleteBoundaryLineHandler
implements CommandHandler<DeleteBoundaryLinePayload, Stores> {
    readonly type = 'boundaryLine.delete';
    readonly affectedStores = ['boundaryLine'] as const;

    canExecute(ctx: HandlerContext<Stores>, cmd: DeleteBoundaryLinePayload): ValidationResult {
        if (!ctx.stores.boundaryLine[cmd.boundaryLineId]) {
            return { valid: false, reason: `boundary line not found: ${cmd.boundaryLineId}` };
        }
        return { valid: true };
    }

    execute(ctx: HandlerContext<Stores>, cmd: DeleteBoundaryLinePayload): HandlerResult {
        return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
            const [next, forward, inverse] = produceCommand<BoundaryLinesState>(
                ctx.stores.boundaryLine,
                (draft) => {
                    delete (draft as Record<string, unknown>)[cmd.boundaryLineId];
                },
            );
            return { forward, inverse, nextStates: { boundaryLine: next } };
        });
    }
}
