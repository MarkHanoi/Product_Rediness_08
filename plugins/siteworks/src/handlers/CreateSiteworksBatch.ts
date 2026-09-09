// siteworks.batch.create — C116 §6 / §6a · ADR-0384 D8 · C16 CA-2 / CA-3 / CA-14.
//
// ⭐ THE BATCH VERB IS THE CREATE PATH, EVEN FOR ONE SURFACE. There is no singular
// `siteworks.create`, and that is C116 §6a rather than an omission: one drawn road is
// a batch of one, a masterplan laid out in one gesture is a batch of forty, and BOTH
// are ONE `produceCommand` → one Immer patch pair → one Ctrl+Z (C16 §8.6). Two verbs
// would let a masterplan spend forty undos on one gesture.
//
// ⛔ SINGLE-STORE, so `produceCommand` is correct here. C116 §2 records the contrast:
// `pool` spans four stores and MUST use `produceMultiStoreCommand` or its patches
// route to nothing.

import {
    withHandlerSpan,
    produceCommand,
    Siteworks,
    type CommandHandler,
    type HandlerContext,
    type HandlerResult,
    type ValidationResult,
    type SiteworksRole,
    type SiteworksForm,
} from '@pryzm/plugin-sdk';
import type { SiteworksData, SiteworksState } from '../store.js';
import { SiteworksGeometryError } from '../errors.js';

/** A ground-plane point. `y` must be 0; the schema enforces it. */
export interface SiteworksPoint { readonly x: number; readonly y: number; readonly z: number }

export interface SiteworksCreateSpec {
    /**
     * ⚠ C16 CA-2 — MINTED BY THE CALLER, NEVER HERE. `execute()` runs AGAIN on REDO,
     * so an id minted inside the handler would differ the second time and orphan
     * every reference that named the first.
     */
    readonly siteworksId: string;
    readonly levelId?: string;
    readonly name?: string;
    readonly role?: SiteworksRole;
    readonly form?: SiteworksForm;
    /** Linear form only. Refused on an areal surface by the schema. */
    readonly centreline?: readonly SiteworksPoint[];
    readonly widthM?: number;
    /** Areal form only. Refused on a linear surface by the schema. */
    readonly boundary?: readonly SiteworksPoint[];
    readonly holes?: readonly (readonly SiteworksPoint[])[];
    readonly thickness?: number;
    readonly baseOffset?: number;
    readonly materialId?: string;
    readonly materialColor?: string;
    /**
     * ⛔ Typed off the schema rather than re-imported: the provenance vocabulary lives
     * at `@pryzm/schemas/provenance`, and naming the type here would be a second
     * spelling of one concept. Omitting it lets the schema's own retrofit default
     * apply, which is honest — a hand-drawn road IS design intent.
     */
    readonly provenance?: SiteworksData['provenance'];
    readonly confidence?: SiteworksData['confidence'];
}

export interface CreateSiteworksBatchPayload {
    readonly surfaces: readonly SiteworksCreateSpec[];
}

type Stores = Readonly<{ siteworks: SiteworksState } & Record<string, unknown>>;

export class CreateSiteworksBatchHandler
implements CommandHandler<CreateSiteworksBatchPayload, Stores> {
    readonly type = 'siteworks.batch.create';
    readonly affectedStores = ['siteworks'] as const;

    canExecute(ctx: HandlerContext<Stores>, cmd: CreateSiteworksBatchPayload): ValidationResult {
        if (!Array.isArray(cmd.surfaces) || cmd.surfaces.length === 0) {
            return { valid: false, reason: 'surfaces must be a non-empty array' };
        }
        const seen = new Set<string>();
        for (const spec of cmd.surfaces) {
            if (typeof spec.siteworksId !== 'string' || spec.siteworksId.length === 0) {
                return { valid: false, reason: 'siteworksId must be a non-empty string' };
            }
            if (seen.has(spec.siteworksId)) {
                return { valid: false, reason: `duplicate id within the batch: ${spec.siteworksId}` };
            }
            seen.add(spec.siteworksId);
            if (ctx.stores.siteworks[spec.siteworksId] !== undefined) {
                return { valid: false, reason: `siteworks ${spec.siteworksId} already exists` };
            }
            // ⭐ THE SAME PRODUCER THE MUTATION USES (C84 EI-9.2). The gate and the
            // write cannot disagree about what is being created, because they build
            // the identical record from the identical function.
            const parsed = Siteworks.safeParse(this._recordOf(spec));
            if (!parsed.success) {
                return {
                    valid: false,
                    reason: parsed.error.issues[0]?.message ?? 'invalid siteworks surface',
                };
            }
        }
        return { valid: true };
    }

    execute(ctx: HandlerContext<Stores>, cmd: CreateSiteworksBatchPayload): HandlerResult {
        return withHandlerSpan(
            this.type + '.handler',
            { 'pryzm.command.type': this.type, 'pryzm.batch.size': cmd.surfaces.length },
            () => {
                const fresh: SiteworksData[] = [];
                for (const spec of cmd.surfaces) {
                    const parsed = Siteworks.safeParse(this._recordOf(spec));
                    if (!parsed.success) {
                        // C16 CA-3 — refuse BEFORE mutating, so a batch can never half-happen.
                        throw new SiteworksGeometryError(
                            parsed.error.issues[0]?.message ?? 'invalid siteworks surface',
                        );
                    }
                    fresh.push(parsed.data as SiteworksData);
                }

                // ⭐ ONE `produceCommand` FOR THE WHOLE SET — one Immer patch pair, one
                // ring entry, one Ctrl+Z. This single call is what "one gesture, one
                // undo" actually rests on, and the suite asserts the stack DEPTH rather
                // than the final state, because a state assertion passes just as
                // happily with N entries.
                //
                // ⚠ `produceCommand` returns a TUPLE, not an object. Destructuring it as
                // `{ forward }` yields `undefined` and CommandBus throws on
                // `result.forward.length` — the bug CreateBoundaryLine.ts records.
                const [next, forward, inverse] = produceCommand<SiteworksState>(
                    ctx.stores.siteworks,
                    (draft) => {
                        for (const s of fresh) (draft as Record<string, unknown>)[s.id] = s;
                    },
                );
                return { forward, inverse, nextStates: { siteworks: next } };
            },
        ); // withHandlerSpan — C16 CA-14 / C10 §2, ZONE A zero tolerance
    }

    /**
     * The record as the schema sees it — used by BOTH `canExecute` and `execute`.
     *
     * ⭐ NOTHING DERIVED IS WRITTEN. No swept ring, no area. A caller who could supply
     * the area of their own polygon could make the reported figure disagree with the
     * geometry it is drawn from; `siteworksAreaM2` is the one answer (C84 EI-9).
     */
    private _recordOf(spec: SiteworksCreateSpec): Record<string, unknown> {
        return {
            id: spec.siteworksId,
            type: 'siteworks',
            ...(spec.levelId !== undefined ? { levelId: spec.levelId } : {}),
            ...(spec.name !== undefined ? { name: spec.name } : {}),
            ...(spec.role !== undefined ? { role: spec.role } : {}),
            ...(spec.form !== undefined ? { form: spec.form } : {}),
            ...(spec.centreline !== undefined ? { centreline: spec.centreline } : {}),
            ...(spec.widthM !== undefined ? { widthM: spec.widthM } : {}),
            ...(spec.boundary !== undefined ? { boundary: spec.boundary } : {}),
            ...(spec.holes !== undefined ? { holes: spec.holes } : {}),
            ...(spec.thickness !== undefined ? { thickness: spec.thickness } : {}),
            ...(spec.baseOffset !== undefined ? { baseOffset: spec.baseOffset } : {}),
            ...(spec.materialId !== undefined ? { materialId: spec.materialId } : {}),
            ...(spec.materialColor !== undefined ? { materialColor: spec.materialColor } : {}),
            // Omitted ⇒ the schema's retrofit defaults apply, which is the honest
            // reading: a surface the user drew is design intent, not a survey.
            ...(spec.provenance !== undefined ? { provenance: spec.provenance } : {}),
            ...(spec.confidence !== undefined ? { confidence: spec.confidence } : {}),
        };
    }
}
