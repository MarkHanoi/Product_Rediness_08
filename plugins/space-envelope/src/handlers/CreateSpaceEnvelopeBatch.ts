// CreateSpaceEnvelopeBatchHandler — the ONLY create path. N envelopes, ONE undo entry.
// §FEAT-SPACE-ENVELOPE (L-12900) · C114 §6 / §6a / §6b · C16 §8.6 B-6 · C11.
//
// ⭐ THERE IS NO SINGULAR `spaceEnvelope.create`, AND THAT IS THE DESIGN (C114 §6a).
// The batch verb is the create path even for ONE envelope, so no caller can reach for
// the wrong one. RESI-ORCHESTRATOR-PLAN §6 risk 7 is exactly this trap:
// `batchCoordinator.runBatch` is **undo-NEUTRAL**, so a multi-element pass that
// assumes it buys one undo ships N undo entries and spends the user's Ctrl+Z N times
// on one gesture. One gesture = one `produceCommand` = one Immer patch pair = one
// ring entry. That is the only way to buy it.
//
// ⛔ SINGLE-STORE, so `produceCommand` is correct here and
// `produceMultiStoreCommand` would be cargo. A space envelope writes exactly one
// store (C114 §2), unlike `pool`, which spans four and MUST use the multi-store
// chokepoint or its store-relative patches route to nothing (CommandBus §U-B6).

import {
    withHandlerSpan,
    type CommandHandler,
    type HandlerContext,
    type HandlerResult,
    type ValidationResult,
    produceCommand,
} from '@pryzm/plugin-sdk';
import {
    SpaceEnvelope,
    MAXIMUM_BUILDABLE_IS_NOT_AUTHORED,
    isAuthorableSpaceEnvelopeRole,
    type SpaceEnvelopeRole,
} from '@pryzm/plugin-sdk';
import { recomputeSpaceEnvelopeMetrics } from '@pryzm/geometry-space-envelope';
import type { SpaceEnvelopeData, SpaceEnvelopesState } from '../store.js';
import { MaximumBuildableNotAuthorableError, SpaceEnvelopeGeometryError } from '../errors.js';
import { containmentRefusalFor } from './containmentGate.js';

interface Pt {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export interface CreateSpaceEnvelopeSpec {
    /**
     * ⚠ CA-2 — MINTED BY THE CALLER, NEVER HERE. `execute()` runs again on REDO, so
     * minting inside the handler would produce a DIFFERENT envelope the second time
     * and orphan every `withinId` that pointed at the first.
     */
    readonly spaceEnvelopeId: string;
    readonly levelId: string;
    readonly footprint: readonly Pt[];
    readonly baseOffset?: number;
    readonly height?: number;
    readonly role?: SpaceEnvelopeRole;
    readonly withinId?: string | null;
    readonly name?: string;
    readonly occupancy?: string;
    readonly materialColor?: string;
}

export interface CreateSpaceEnvelopeBatchPayload {
    readonly envelopes: readonly CreateSpaceEnvelopeSpec[];
}

type Stores = Readonly<{ spaceEnvelope: SpaceEnvelopesState } & Record<string, unknown>>;

export class CreateSpaceEnvelopeBatchHandler
implements CommandHandler<CreateSpaceEnvelopeBatchPayload, Stores> {
    readonly type = 'spaceEnvelope.batch.create';
    readonly affectedStores = ['spaceEnvelope'] as const;

    canExecute(ctx: HandlerContext<Stores>, cmd: CreateSpaceEnvelopeBatchPayload): ValidationResult {
        if (!Array.isArray(cmd.envelopes) || cmd.envelopes.length === 0) {
            return { valid: false, reason: 'envelopes must be a non-empty array' };
        }
        const seen = new Set<string>();
        const parsedRecords: SpaceEnvelopeData[] = [];
        for (const spec of cmd.envelopes) {
            if (typeof spec.spaceEnvelopeId !== 'string' || spec.spaceEnvelopeId.length === 0) {
                return { valid: false, reason: 'spaceEnvelopeId must be a non-empty string' };
            }
            if (seen.has(spec.spaceEnvelopeId)) {
                return { valid: false, reason: `duplicate id within the batch: ${spec.spaceEnvelopeId}` };
            }
            seen.add(spec.spaceEnvelopeId);
            if (ctx.stores.spaceEnvelope[spec.spaceEnvelopeId]) {
                return { valid: false, reason: `duplicate space envelope id: ${spec.spaceEnvelopeId}` };
            }
            if (typeof spec.levelId !== 'string' || spec.levelId.length === 0) {
                // An envelope is seated ON a storey; its baseOffset and height are
                // measured from that level's datum. Defaulting would put the volume on
                // a storey the user was not looking at.
                return { valid: false, reason: 'levelId is required — an envelope is seated on a level' };
            }
            // ⛔ C114 §6b — THE ROLE REFUSAL. The sentence comes from the schema's own
            // exported constant and is NEVER re-typed here (C84 EI-8a: the cheapest way
            // to have no second copy of a string is to have exactly one).
            if (spec.role !== undefined && !isAuthorableSpaceEnvelopeRole(spec.role)) {
                return { valid: false, reason: MAXIMUM_BUILDABLE_IS_NOT_AUTHORED };
            }
            // The schema's three refines are the authority on what a valid envelope is;
            // re-running them here lets the bus reject cleanly rather than throw
            // mid-mutation (C16 CA-3).
            const parsed = SpaceEnvelope.safeParse(this._recordOf(spec));
            if (!parsed.success) {
                return {
                    valid: false,
                    reason: parsed.error.issues[0]?.message ?? 'invalid space envelope',
                };
            }
            parsedRecords.push(parsed.data as SpaceEnvelopeData);
        }
        // §RESI-STAGE-G — a room born outside the level it names is REFUSED with the
        // measured excursion (STR §12), never accepted-and-flagged. The level may be in
        // the store OR minted earlier in this same batch, which is why the gate is asked
        // after the whole batch has parsed rather than per spec.
        const levelsInBatch = parsedRecords.filter((r) => r.role === 'level');
        for (const rec of parsedRecords) {
            const refusal = containmentRefusalFor(ctx.stores.spaceEnvelope, rec, levelsInBatch);
            if (refusal) return { valid: false, reason: refusal };
        }
        return { valid: true };
    }

    execute(ctx: HandlerContext<Stores>, cmd: CreateSpaceEnvelopeBatchPayload): HandlerResult {
        return withHandlerSpan(
            this.type + '.handler',
            { 'pryzm.command.type': this.type, 'pryzm.batch.size': cmd.envelopes.length },
            () => {
                const fresh: SpaceEnvelopeData[] = [];
                for (const spec of cmd.envelopes) {
                    if (spec.role !== undefined && !isAuthorableSpaceEnvelopeRole(spec.role)) {
                        throw new MaximumBuildableNotAuthorableError(MAXIMUM_BUILDABLE_IS_NOT_AUTHORED);
                    }
                    const parsed = SpaceEnvelope.safeParse(this._recordOf(spec));
                    if (!parsed.success) {
                        throw new SpaceEnvelopeGeometryError(
                            parsed.error.issues[0]?.message ?? 'invalid space envelope',
                        );
                    }
                    fresh.push(parsed.data as SpaceEnvelopeData);
                }
                const levelsInBatch = fresh.filter((r) => r.role === 'level');
                for (const rec of fresh) {
                    const refusal = containmentRefusalFor(ctx.stores.spaceEnvelope, rec, levelsInBatch);
                    if (refusal) throw new SpaceEnvelopeGeometryError(refusal);
                }

                // ⭐ ONE `produceCommand` FOR THE WHOLE SET — one Immer patch pair, one
                // ring entry, one Ctrl+Z. This single call is what the "one gesture =
                // one undo" claim actually rests on, and the suite asserts the stack
                // DEPTH rather than the final state, because a state assertion passes
                // just as happily with N entries.
                //
                // ⚠ `produceCommand` returns a TUPLE, not an object. Destructuring it
                // as `{ forward }` yields `undefined` and CommandBus throws on
                // `result.forward.length` — the bug CreateBoundaryLine.ts records.
                const [next, forward, inverse] = produceCommand<SpaceEnvelopesState>(
                    ctx.stores.spaceEnvelope,
                    (draft) => {
                        for (const e of fresh) (draft as Record<string, unknown>)[e.id] = e;
                    },
                );
                return { forward, inverse, nextStates: { spaceEnvelope: next } };
            },
        ); // withHandlerSpan — C16 CA-14 / C10 §2, merge-blocking
    }

    /**
     * The record as the schema sees it — used by BOTH `canExecute` and `execute`, so
     * the gate and the mutation can never disagree about what is being written.
     *
     * ⭐ `footprintAreaM2` AND `volumeM3` ARE RECOMPUTED, NEVER READ FROM THE PAYLOAD
     * (C114 §5). A caller who could supply the area of their own polygon could make
     * the intended-area channel disagree with the geometry it is drawn from — and the
     * ONE writer of those two fields is `recomputeSpaceEnvelopeMetrics` (C114 §2b).
     */
    private _recordOf(spec: CreateSpaceEnvelopeSpec): Record<string, unknown> {
        const footprint = (spec.footprint ?? []).map((p) => ({ x: p.x, y: 0, z: p.z }));
        const height = spec.height ?? 3;
        const baseOffset = spec.baseOffset ?? 0;
        const metrics = recomputeSpaceEnvelopeMetrics({
            id: spec.spaceEnvelopeId,
            footprint,
            baseOffset,
            height,
        });
        return {
            id: spec.spaceEnvelopeId,
            type: 'spaceEnvelope',
            levelId: spec.levelId,
            footprint,
            baseOffset,
            height,
            role: spec.role ?? 'room',
            withinId: spec.withinId ?? null,
            ...(spec.name !== undefined ? { name: spec.name } : {}),
            ...(spec.occupancy !== undefined ? { occupancy: spec.occupancy } : {}),
            ...(spec.materialColor !== undefined ? { materialColor: spec.materialColor } : {}),
            footprintAreaM2: metrics.footprintAreaM2,
            volumeM3: metrics.volumeM3,
        };
    }
}
