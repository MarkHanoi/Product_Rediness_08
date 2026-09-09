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
//
// ══════════════════════════════════════════════════════════════════════════════
// ⭐ §KEEPING-A-MASSING-OPTION-ACCUMULATES-INSTEAD-OF-REPLACING (L-13038, 2026-09-07)
// ══════════════════════════════════════════════════════════════════════════════
// Founder: *"WHEN I SELECT ANOTHER MASSING OPTION THE PREVIOUS ONE SHALL BE REMOVED."*
// Every press of "Keep this as a level envelope" minted a NEW envelope on the same
// storey, so trying three options left three rivals and the room solver then —
// correctly — refused to guess which one the rooms belonged inside.
//
// ⛔ THE FIX IS AT THE MINT, AND IT COULD NOT BE "DELETE THEN CREATE". C114 §6a is
// explicit that `batchCoordinator.runBatch` is undo-NEUTRAL: `spaceEnvelope.delete`
// followed by `spaceEnvelope.batch.create` is TWO ring entries, so the user would
// undo a replacement twice and see a torn intermediate state in between. So the
// create verb gained `supersedes`: the envelopes this batch REPLACES are removed in
// the SAME `produceCommand`, which is the only thing that buys one Ctrl+Z.
//
// ⛔ AND THE HANDLER NEVER DECIDES *WHETHER* TO REPLACE. It is handed the ids. The
// judgement — is this a plate PRYZM generated, or the user's own drawing? — belongs
// to the surface that knows which question the user was asking, and it is made in
// `apps/editor/src/ui/site/levelEnvelopeSupersession.ts` against `provenance`
// (C75 §2.6: only `authored` may be described as the user's). A handler that
// silently removed an envelope it decided was "the old one" would be the same
// class of defect as the accumulation it replaced, pointed the other way.

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
    type SpaceEnvelopeGroup,
} from '@pryzm/plugin-sdk';
import { recomputeSpaceEnvelopeMetrics } from '@pryzm/geometry-space-envelope';
import type { SpaceEnvelopeData, SpaceEnvelopesState } from '../store.js';
import { MaximumBuildableNotAuthorableError, SpaceEnvelopeGeometryError } from '../errors.js';
import { containmentRefusalFor } from './containmentGate.js';
import { removeEnvelopesFromDraft } from './removeEnvelopes.js';

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
    /**
     * §L-13038 — WHO produced this envelope (C75 §1.1 / §2.2), carried into the
     * record so it survives save/load and so a later gesture can tell a plate PRYZM
     * COMPUTED from a volume the user AUTHORED.
     *
     * ⛔ Typed off the schema (`SpaceEnvelopeData['provenance']`) rather than
     * re-imported: the provenance vocabulary lives at `@pryzm/schemas/provenance`,
     * which is deliberately NOT on the root barrel this plugin reaches through, and
     * a hand-written structural copy of it here would be C84 EI-8. Omitted ⇒ the
     * schema's own retrofit default (`predates-provenance`), which is honest: a
     * caller that says nothing has told us nothing.
     */
    readonly provenance?: SpaceEnvelopeData['provenance'];
    /**
     * ⭐ WHICH BUILDING (massing group) this envelope belongs to — ADR-0383 D1 / C114 §6d
     * clause 6 / §6e. A parcel may hold several independent buildings; this is what makes one
     * distinguishable from another, and it is the field
     * `resolveLevelEnvelopeSupersession` buckets on so that creating Block B cannot delete
     * Block A (D3).
     *
     * ⛔ IT IS `?`, NOT `| null` ALONE, AND THAT IS THE WHOLE POINT OF THE SHAPE.
     * "The caller said nothing" and "the caller said explicitly ungrouped" reach the SAME
     * stored value today — `null`, the ungrouped bucket — but they must reach it by
     * DIFFERENT ROUTES: omitted lets the schema's own `.default(null)` apply, explicit
     * `null` is a statement this caller made. §CONTEXT-DATA-HONESTY (L-581 / L-616) is that a
     * failure-to-state and an emptiness must never share a code path, because the day they
     * need to differ the distinction has to still exist. Same shape as `provenance` above,
     * for the same reason.
     *
     * ⛔ IT IS NOT `withinId`. `withinId` is CONTAINMENT (a room inside a level envelope) and
     * is refined to `null` for `role: 'level'`; `group` is IDENTITY, and a `role: 'level'`
     * record is exactly the one that carries it. Conflating them would make "Block A" mean
     * "inside Block A's ground floor" (C114 §6e clause 1).
     *
     * ⛔ AND IT IS NOT THE CONTAINMENT AUTHORITY. ADR-0385 / ADR-0328: `hierarchyStore`
     * answers *"which building is this element in"* for the exporter and both trees; `group`
     * is the massing-stage AUTHORING axis and PROJECTS into it, as `partOf` does. Nothing
     * downstream may read this field to answer that question.
     */
    readonly group?: SpaceEnvelopeGroup | null;
}

export interface CreateSpaceEnvelopeBatchPayload {
    readonly envelopes: readonly CreateSpaceEnvelopeSpec[];
    /**
     * §L-13038 — the envelopes this batch REPLACES. They are removed in the SAME
     * `produceCommand` as the creations, so a replacement is ONE undo entry (C114
     * §6a / C16 §8.6 B-6) rather than a delete the user must undo separately.
     *
     * ⛔ EVERY ID MUST EXIST, and one that does not is a REFUSAL, not a silent skip:
     * a caller asking to replace something that is not there has a stale picture of
     * the store, and creating anyway is exactly the accumulation this field exists to
     * end. Children naming a superseded envelope in `withinId` are NOT cascaded —
     * their `withinId` is cleared, the same rule `spaceEnvelope.delete` keeps, in the
     * one implementation both verbs share (`removeEnvelopesFromDraft`, C114 §8).
     */
    readonly supersedes?: readonly string[];
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
        // ⭐ §L-13038 — the REPLACE half. Asked last, so a batch that is invalid on its own
        // terms is refused for that reason rather than for a supersede id it never reached.
        const supersedeRefusal = this._supersedeRefusal(ctx, cmd, seen);
        if (supersedeRefusal) return { valid: false, reason: supersedeRefusal };
        return { valid: true };
    }

    /**
     * §L-13038 — why this batch may NOT remove what it says it replaces, or `null`.
     *
     * ⛔ ONE PRODUCER, asked by `canExecute` AND by `execute` (C84 EI-9.2 — the gate and the
     * mutation must not be able to disagree about what is legal). `seen` is the id set the
     * batch is CREATING, so an id that is both created and superseded is refused by name
     * instead of falling through to the generic duplicate-id message.
     */
    private _supersedeRefusal(
        ctx: HandlerContext<Stores>,
        cmd: CreateSpaceEnvelopeBatchPayload,
        seen: ReadonlySet<string>,
    ): string | null {
        const supersedes = cmd.supersedes;
        if (supersedes === undefined) return null;
        if (!Array.isArray(supersedes)) return 'supersedes must be an array of space envelope ids';
        for (const id of supersedes) {
            if (typeof id !== 'string' || id.length === 0) {
                return 'supersedes entries must be non-empty space envelope ids';
            }
            if (seen.has(id)) {
                return `a batch cannot supersede an envelope it is also creating: ${id}`;
            }
            if (!ctx.stores.spaceEnvelope[id]) {
                // A refusal, never a silent skip — see the payload field's own note.
                return `no such space envelope to supersede: ${id}`;
            }
        }
        return null;
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
                // §L-13038 — the SAME question `canExecute` asked, from the same producer, so a
                // replacement can never half-happen (C16 CA-3: refuse before mutating).
                const supersedeRefusal = this._supersedeRefusal(
                    ctx, cmd, new Set(fresh.map((r) => r.id)),
                );
                if (supersedeRefusal) throw new SpaceEnvelopeGeometryError(supersedeRefusal);

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
                        // ⭐ §L-13038 — REMOVE THEN ADD, INSIDE THE ONE PRODUCER. This ordering is
                        // what makes "choose a different massing option" one gesture and one undo:
                        // both halves are in a single Immer patch pair, so there is no ring entry
                        // in which the storey is empty.
                        removeEnvelopesFromDraft(draft as SpaceEnvelopesState, cmd.supersedes ?? []);
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
            // §L-13038 — carried through UNTOUCHED, and absent when the caller said nothing, so
            // the schema's retrofit default (`predates-provenance`) applies rather than an
            // origin this handler would have had to invent. ⛔ The handler never upgrades,
            // downgrades or defaults an origin: C75 §2.2 makes `authored` unrepresentable to a
            // system pass, and a create verb that stamped one would defeat that by hand.
            ...(spec.provenance !== undefined ? { provenance: spec.provenance } : {}),
            // ⭐ ADR-0383 / C114 §6d clause 6 — carried through UNTOUCHED, and ABSENT when the caller
            // said nothing, so the schema's own `.default(null)` applies rather than a group this
            // handler would have had to invent. ⛔ The handler never mints, defaults, upgrades or
            // INFERS a group: a create verb that guessed which building an envelope belongs to would
            // be deciding the master plan on the user's behalf, and the supersession rule buckets on
            // this exact field — a wrong guess here DELETES another block (§6e clause 3).
            ...(spec.group !== undefined ? { group: spec.group } : {}),
            footprintAreaM2: metrics.footprintAreaM2,
            volumeM3: metrics.volumeM3,
        };
    }
}
