// CreateBoundaryLineHandler — ONE gesture, ONE undo entry, ONE store.
// §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7911) · C105 §1 · C11 · C16 §8.6 · C100.
//
// ⭐ SINGLE-STORE, AND THAT IS THE WHOLE ARGUMENT FOR `produceCommand` HERE.
// `CreatePoolHandler` must use `produceMultiStoreCommand` because a pool spans four
// stores and store-RELATIVE patches would route to nothing (CommandBus §U-B6). A
// boundary line writes exactly one store, so `produceCommand(ctx.stores.boundaryLine, …)`
// covers the whole gesture and its patch pair routes correctly. Reaching for the
// multi-store chokepoint anyway would be cargo, and the wrong shape of comment to
// leave behind.
//
// ⛔ THE LINE DOES NOT CREATE ANYTHING ELSE. Not a wall, not a slab, not a massing
// block. That is the difference between this and the pool / balcony / lift compounds,
// and it is deliberate: a setting-out line is what you draw BEFORE you decide what
// goes on it. Populating it is a separate gesture (by hand, or through RAC), and
// making creation implicitly build walls would take the decision away from the
// architect at exactly the moment the tool exists to support it.

import {
    withHandlerSpan,
    type CommandHandler,
    type HandlerContext,
    type HandlerResult,
    type ValidationResult,
    produceCommand,
} from '@pryzm/plugin-sdk';
import { BoundaryLine } from '@pryzm/plugin-sdk';
import { resolveBoundaryLineMaterial } from '@pryzm/geometry-boundary-line';
import type { BoundaryLineData, BoundaryLinesState } from '../store.js';
import { BoundaryLineGeometryError } from '../errors.js';

/** A plain 3-D point in world metres. */
interface Pt {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export interface CreateBoundaryLinePayload {
    /**
     * ⚠ CA-2 — MINTED BY THE CALLER, NEVER HERE. `execute()` runs again on REDO, so
     * minting inside the handler would silently produce a DIFFERENT line the second
     * time and orphan every attachment that pointed at the first.
     */
    readonly boundaryLineId: string;
    readonly levelId: string;
    readonly vertices: readonly Pt[];
    readonly closed?: boolean;
    readonly drawMode?: string;
    /** The founder's volume bool, as authored at creation. Default false: linework. */
    readonly hasVolume?: boolean;
    readonly height?: number;
    readonly thickness?: number;
    readonly baseOffset?: number;
    readonly systemTypeId?: string;
    readonly materialId?: string;
    readonly materialColor?: string;
    readonly name?: string;
}

type BoundaryLineHandlerStores = Readonly<
    { boundaryLine: BoundaryLinesState } & Record<string, unknown>
>;

export class CreateBoundaryLineHandler
implements CommandHandler<CreateBoundaryLinePayload, BoundaryLineHandlerStores> {
    readonly type = 'boundaryLine.create';
    readonly affectedStores = ['boundaryLine'] as const;

    canExecute(
        ctx: HandlerContext<BoundaryLineHandlerStores>,
        cmd: CreateBoundaryLinePayload,
    ): ValidationResult {
        if (typeof cmd.boundaryLineId !== 'string' || cmd.boundaryLineId.length === 0) {
            return { valid: false, reason: 'boundaryLineId must be a non-empty string' };
        }
        if (ctx.stores.boundaryLine[cmd.boundaryLineId]) {
            return { valid: false, reason: `duplicate boundary line id: ${cmd.boundaryLineId}` };
        }
        if (typeof cmd.levelId !== 'string' || cmd.levelId.length === 0) {
            // A boundary line is drawn ON a storey. Without one, the solid has no
            // elevation to stand on and no attachment has a level to be compared
            // against — so this refuses rather than defaulting to "level-1", which
            // would put the line on a storey the user was not looking at.
            return { valid: false, reason: 'levelId is required — a boundary line is drawn on a level' };
        }
        // Fail HERE, with a `reason`, rather than throwing mid-mutation. The schema's
        // four refines are the authority on what a valid line is; this re-runs them so
        // the bus can reject cleanly (C16 CA-3).
        const parsed = BoundaryLine.safeParse(this._recordOf(cmd));
        if (!parsed.success) {
            return { valid: false, reason: parsed.error.issues[0]?.message ?? 'invalid boundary line' };
        }
        // ⭐ C100 — A SOLID MUST NAME A REAL MATERIAL. This is the check
        // `HandrailFragmentBuilder` does not have, which is why every balcony ships
        // with "3 handrails have NO RESOLVABLE MATERIAL". Refusing at the door means
        // the record can never reach a builder in that state.
        //
        // ⚠ It runs ONLY when volume is on. Linework legitimately has no material,
        // and treating that as a failure would be the emptiness/failure collapse.
        const mat = resolveBoundaryLineMaterial(parsed.data as BoundaryLineData);
        if (mat.kind === 'unresolved') return { valid: false, reason: mat.reason };
        return { valid: true };
    }

    execute(
        ctx: HandlerContext<BoundaryLineHandlerStores>,
        cmd: CreateBoundaryLinePayload,
    ): HandlerResult {
        return withHandlerSpan(
            this.type + '.handler',
            { 'pryzm.command.type': this.type },
            () => {
                const parsed = BoundaryLine.safeParse(this._recordOf(cmd));
                if (!parsed.success) {
                    throw new BoundaryLineGeometryError(
                        parsed.error.issues[0]?.message ?? 'invalid boundary line',
                    );
                }
                const record = parsed.data as BoundaryLineData;

                // `produceCommand` returns a TUPLE `[next, forward, inverse]`, not an
                // object — the same shape `CreateSlabHandler` destructures. Reading it as
                // `{ forward }` yields `undefined` and CommandBus throws on
                // `result.forward.length` at CommandBus.ts:477, which is exactly how this
                // was first written and exactly what the composed-runtime suite caught.
                const [next, forward, inverse] = produceCommand<BoundaryLinesState>(
                    ctx.stores.boundaryLine,
                    (draft) => {
                        (draft as Record<string, unknown>)[cmd.boundaryLineId] = record;
                    },
                );
                return { forward, inverse, nextStates: { boundaryLine: next } };
            },
        ); // withHandlerSpan — C16 CA-14 / C10 §2, merge-blocking
    }

    /** The record as the schema sees it — used by BOTH canExecute and execute, so the
     *  gate and the mutation can never disagree about what is being written. */
    private _recordOf(cmd: CreateBoundaryLinePayload): Record<string, unknown> {
        return {
            id: cmd.boundaryLineId,
            levelId: cmd.levelId,
            vertices: cmd.vertices,
            closed: cmd.closed ?? false,
            ...(cmd.drawMode !== undefined ? { drawMode: cmd.drawMode } : {}),
            hasVolume: cmd.hasVolume ?? false,
            // Every dimensional field is OMITTED when unset rather than passed as
            // `undefined` — "unset" is a first-class state meaning *resolve me*
            // (L-127), and an explicit `undefined` would be indistinguishable from an
            // authored zero once it round-tripped through JSON.
            ...(cmd.height !== undefined ? { height: cmd.height } : {}),
            ...(cmd.thickness !== undefined ? { thickness: cmd.thickness } : {}),
            ...(cmd.baseOffset !== undefined ? { baseOffset: cmd.baseOffset } : {}),
            ...(cmd.systemTypeId !== undefined ? { systemTypeId: cmd.systemTypeId } : {}),
            ...(cmd.materialId !== undefined ? { materialId: cmd.materialId } : {}),
            ...(cmd.materialColor !== undefined ? { materialColor: cmd.materialColor } : {}),
            ...(cmd.name !== undefined ? { name: cmd.name } : {}),
            attachments: [],
        };
    }
}
