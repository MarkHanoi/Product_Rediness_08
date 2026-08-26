// CreateBathroomPodHandler — ONE gesture, ONE undo entry, ONE declared store.
//
// §BATH102 (L-11480..L-11486) · C109 §2 / §8 / R-1 / R-3 / R-7 · C99 §2 EI-1a ·
// C03 §4.6 U-2 · C16 §8.6 B-6 · C84.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⛔⛔ READ THIS BEFORE ADDING `'plumbing'` TO `affectedStores`. C109 §8 SAID TO,
//     AND THE MEASUREMENT SAYS THE OPPOSITE. THE CONTRACT IS AMENDED IN PLACE.
// ═══════════════════════════════════════════════════════════════════════════════
//
// C109 §8 as minted read: *"`affectedStores` MUST be `['bathroomPod', 'plumbing']`
// — the measured write set"*, with a ⚠ paragraph immediately below it inheriting
// C99's EI-1a hazard. Building the dispatch half measured TWO independent facts that
// together make the two-store declaration WRONG, not merely hazardous:
//
//   1. ⛔ `ctx.stores.plumbing` IS NOT THE FIXTURE STORE. It is the plugin DTO store
//      `plugins/plumbing/src/store.ts` — `Store<Plumbing>`, whose Zod shape is a
//      PIPE (`kind` / `diameter` / `bendRadius`). `CreatePlumbingFixture.ts:167-174`
//      states this in as many words: *"The old `plumbing.create` target is the *pipe*
//      handler … it silently dropped every fixture field (fixtureType, position,
//      variants)."* Writing pod members there would put sanitaryware into the PIPE
//      store, where `PlumbingFragmentBuilder`, `PlumbingPlanSymbolBuilder`,
//      `PlumbingElevationSymbolBuilder`, `ProjectSerializer` and `PlumbingReader` —
//      the five consumers C109 §2 reason 2 names — do not look. The members would be
//      real records in the wrong half of the family: invisible in 3-D, absent from
//      the plan symbol, absent from the elevation, absent from IFC.
//
//   2. ⛔ AND UNDO WOULD RESOLVE THE KEY TO A THIRD STORE AGAIN. `buildUndoStoreMap()`
//      (`apps/editor/src/engine/undo/performUndoRedo.ts:432`) maps
//      `plumbing: w.plumbingStore` — the LEGACY `@pryzm/geometry-plumbing` FIXTURE
//      store. So a declared `'plumbing'` writes the PIPE DTO store on the way forward
//      and applies its inverse to the LEGACY FIXTURE store on the way back. That is
//      C03 §4.6 U-2b verbatim — *"a declared key that does not resolve to the store
//      the handler wrote is satisfied by the CORRUPTING case"* — and
//      `liftUndoAdapter.ts:17-26` forbids exactly this pattern by name for the lift.
//
// ⭐ SO THE DECLARATION IS `['bathroomPod']`, AND IT IS THE TRUTHFUL ONE: this
// command's PATCHES write exactly one store. That is not a narrowing of the feature —
// the members are all IN the pod record (`BathroomPod.members`, which C109 §4 rules
// STORED and calls *"the SINGLE statement of what the pod contains"*), so a single
// patch pair carries every one of them and Ctrl+Z takes back the whole pod atomically.
//
// ⚠ AND THE COST IS NAMED RATHER THAN HIDDEN: the members are MATERIALISED into the
// legacy fixture store by a MIRROR that subscribes to this store's `subscribeDirty()`
// (`apps/editor/src/engine/undo/bathroomPodMemberMirror.ts`). One subscription sees
// create, undo, redo AND delete, because all four arrive as `Store.applyPatch()` —
// so there is exactly ONE road from the record to the fixture family and it cannot
// drift from a second one. What that does NOT buy is a fixture record that survives
// a project RELOAD as a pod member: `ProjectSerializer` persists the legacy fixture
// store and knows nothing about pods, so a reloaded project keeps every MEMBER and
// loses the PARENT. That is C109 §12's L-11405, still OPEN, and this lane does not
// close it.
//
// ── NOT A `CompositeCommand`, NOT `runBatch()` ─────────────────────────────────
// C104 §9.2 / L-2401: `CompositeCommand` returns unconditionally `true` in BOTH
// directions and counts children ATTEMPTED, not landed — a pod that half-created
// would be a room with a shower and no WC, reported as a success. C16 §8.6 B-6:
// `runBatch()` is UNDO-NEUTRAL; one gesture is one undo entry because it is ONE
// command, never because a batch was held open.

import {
    produceCommand,
    withHandlerSpan,
    type CommandHandler,
    type HandlerContext,
    type HandlerResult,
    type ValidationResult,
} from '@pryzm/plugin-sdk';
import {
    buildBathroomPod,
    bathroomPodMemberCount,
    validateBathroomPod,
    // The member set a pod carries when the caller names none. Owned by the rules file
    // (`BathroomPodRules.ts`), never re-typed here — a second default set is a second
    // statement of what a bathroom pod IS.
    BATHROOM_POD_DEFAULT_MEMBERS,
    type BathroomPodHandedness,
    type BathroomPodMemberKind,
    type BathroomPodRoom,
} from '@pryzm/geometry-plumbing';
import { BathroomPodFitError, BathroomPodSchemaError } from '../errors.js';
import type { BathroomPodsState } from '../bathroomPodStore.js';

/**
 * The payload.
 *
 * ⭐ EVERY ID IS PRE-MINTED BY THE CALLER (the plan tool), never generated in here —
 * CA-2: `execute()` runs AGAIN on redo, so minting inside would silently produce a
 * DIFFERENT pod (and different members) the second time. `bathroomPodMemberCount()`
 * is exported by the geometry package precisely so the tool can mint exactly the
 * right number without re-deriving the normalisation rule.
 */
export interface CreateBathroomPodPayload {
    readonly podId: string;
    readonly levelId: string;
    /** The room envelope the solver is asked to fit the module into. */
    readonly room: BathroomPodRoom;
    readonly handedness: BathroomPodHandedness;
    /** Which members the pod declares. Unset resolves to the documented default set. */
    readonly members?: readonly BathroomPodMemberKind[];
    /** Pre-minted, one per NORMALISED member, in `bathroomPodMemberOrder()` order. */
    readonly memberIds: readonly string[];
    /** Optional per-kind variant overrides. Unset means *resolve me* (the L-127 chain). */
    readonly variantOverrides?: Readonly<Partial<Record<BathroomPodMemberKind, string>>>;
    readonly mark?: string;
    readonly materialId?: string;
}

/** The ONE store this command's patches write. See the header for the measurement. */
type BathroomPodHandlerStores = Readonly<
    { bathroomPod: BathroomPodsState } & Record<string, unknown>
>;

export class CreateBathroomPodHandler
    implements CommandHandler<CreateBathroomPodPayload, BathroomPodHandlerStores>
{
    readonly type = 'bathroomPod.create';

    /**
     * ONE store — the truthful write set (C03 §4.6 U-2, and the header's two
     * measurements). ⛔ Do not add `'plumbing'`: it resolves to the PIPE DTO store on
     * write and to the LEGACY FIXTURE store on undo, which is U-2b's corrupting case.
     */
    readonly affectedStores = ['bathroomPod'] as const;

    canExecute(
        ctx: HandlerContext<BathroomPodHandlerStores>,
        cmd: CreateBathroomPodPayload,
    ): ValidationResult {
        if (typeof cmd.podId !== 'string' || cmd.podId.length === 0) {
            return { valid: false, reason: 'podId must be a non-empty string' };
        }
        if (ctx.stores.bathroomPod[cmd.podId]) {
            return { valid: false, reason: `duplicate bathroom pod id: ${cmd.podId}` };
        }
        if (typeof cmd.levelId !== 'string' || cmd.levelId.length === 0) {
            return { valid: false, reason: 'levelId must be a non-empty string' };
        }

        // ── The pre-minted id count, asked of the SOLVER rather than typed ────────
        // A hand-typed count here would be a second statement of a number
        // `normaliseMembers()` already owns — and it would be wrong the moment a pod
        // declares two accessories, which the normaliser permits and no other kind is.
        const kinds = cmd.members ?? BATHROOM_POD_DEFAULT_MEMBERS;
        const expected = bathroomPodMemberCount(kinds);
        if (!Array.isArray(cmd.memberIds) || cmd.memberIds.length !== expected) {
            return {
                valid: false,
                reason:
                    `expected ${expected} pre-minted member id(s) for this member set, got ` +
                    `${Array.isArray(cmd.memberIds) ? cmd.memberIds.length : 0}`,
            };
        }

        // ── THE FIT, AND ITS REFUSAL, BEFORE ANY MUTATION ────────────────────────
        // ⛔ C109 R-3: the solver never overlaps, never shrinks a fixture and never
        // drops a declared member. It fits or it REFUSES WITH BOTH NUMBERS. Running
        // the real solver here — not a cheaper approximation of it — is what makes
        // `canExecute` and `execute` unable to disagree about what fits.
        const built = buildBathroomPod(cmd.podId, cmd.levelId, this._inputOf(cmd));
        if (!built.ok) return { valid: false, reason: built.reason };

        // ⭐ AND THE RECORD ITSELF, THROUGH THE ONE VALIDATOR. `validateBathroomPod`
        // is called by BOTH arms for the same reason `LiftCompoundSchema.safeParse` is,
        // one family over: two definitions of "valid" is how a command accepts a record
        // its own execute then throws on.
        const checked = validateBathroomPod(built.pod);
        if (!checked.ok) return { valid: false, reason: checked.reason };
        return { valid: true };
    }

    execute(
        ctx: HandlerContext<BathroomPodHandlerStores>,
        cmd: CreateBathroomPodPayload,
    ): HandlerResult {
        return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
            const built = buildBathroomPod(cmd.podId, cmd.levelId, this._inputOf(cmd), {
                ...(cmd.mark !== undefined ? { mark: cmd.mark } : {}),
                ...(cmd.materialId !== undefined ? { materialId: cmd.materialId } : {}),
            });
            if (!built.ok) {
                // The refusal SENTENCE, not a generic failure. C16 CA-18 / C74: it
                // names the metres required and the metres available, and the route
                // back to success. `CommandBus` surfaces it as
                // `bathroomPod.create: …`, which is what the plan tool puts on screen.
                throw new BathroomPodFitError(built.reason);
            }
            const checked = validateBathroomPod(built.pod);
            if (!checked.ok) throw new BathroomPodSchemaError(checked.reason);
            const pod = checked.value;

            // ── THE ONE PATCH PAIR ───────────────────────────────────────────────
            // ⚠ `produceCommand` returns a TUPLE `[next, forward, inverse]`, not an
            // object. Destructuring it as `{ forward }` yields `undefined` and the bus
            // throws on `result.forward.length` — the failure `CreateBoundaryLine.ts`
            // records at its own call site.
            const [next, forward, inverse] = produceCommand<BathroomPodsState>(
                ctx.stores.bathroomPod as BathroomPodsState,
                (draft) => {
                    (draft as Record<string, unknown>)[pod.id] = pod;
                },
            );
            return { forward, inverse, nextStates: { bathroomPod: next } };
        }); // withHandlerSpan — CA-14 / C10 §2, merge-blocking
    }

    /**
     * The solver input, built ONCE and used by BOTH `canExecute` and `execute`.
     *
     * ⛔ If these two ever build different inputs, `canExecute` is validating a pod
     * the command does not create — the class of defect this repo has now recorded in
     * three families. One method, both callers.
     */
    private _inputOf(cmd: CreateBathroomPodPayload): {
        room: BathroomPodRoom;
        handedness: BathroomPodHandedness;
        members: readonly BathroomPodMemberKind[];
        memberIds: readonly string[];
        variantOverrides?: Readonly<Partial<Record<BathroomPodMemberKind, string>>>;
    } {
        return {
            room: cmd.room,
            handedness: cmd.handedness,
            members: cmd.members ?? BATHROOM_POD_DEFAULT_MEMBERS,
            memberIds: cmd.memberIds,
            ...(cmd.variantOverrides !== undefined
                ? { variantOverrides: cmd.variantOverrides }
                : {}),
        };
    }
}
