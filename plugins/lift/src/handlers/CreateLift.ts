// CreateLiftHandler — ONE gesture, ONE undo entry, FIVE kinds of part.
//
// §FEAT-LIFT-COMPOUND-SYSTEM (L-5700..L-5712) · C104 · ADR-0325 · C16 §8.6 · C11 §11.2
//
// ═══════════════════════════════════════════════════════════════════════════════
// READ THE UNDO ARGUMENT BEFORE CHANGING ANYTHING. IT IS THE POOL'S, AND IT IS
// LOAD-BEARING HERE FOR A STRICTLY LARGER REASON.
// ═══════════════════════════════════════════════════════════════════════════════
//
// Creating a lift touches FIVE stores:
//
//     lift         <- the compound parent                              (new)
//     wall         <- the shaft enclosure sides (3 or 4 of them)       (new)
//     curtainwall  <- the GLASS sides, standalone type only            (new)
//     door         <- ONE landing door PER SERVED LEVEL                (new)
//     liftPart     <- the five LOD-300 cabin parts                     (new)
//     slab         <- **the VOID in every slab the shaft passes**   (MUTATED)
//
// (Six keys; `curtainwall` carries no records for the wall-hosted type, and `slab`
// is the only one that is MUTATED rather than added to.)
//
// C16 §8.6 B-6, measured not assumed:
//
//   > "One gesture = one undo entry" is bought by dispatching ONE command (one
//   >  produceCommand -> one Immer patch pair -> one ring entry). It is NEVER bought
//   >  by holding a batch open. `runBatch()` is UNDO-NEUTRAL.
//
// So this is ONE command. ⭐ AND FOR A LIFT THE STAKES ARE HIGHER THAN FOR A POOL:
// a pool creates a fixed 6 parts, but a lift serving 10 storeys creates
// 4 + 10 + 5 = 19 records and punches 10 slabs. At one undo entry per part that is
// TWENTY-NINE Ctrl+Zs to take back one click, with the model in a different broken
// intermediate state after each one.
//
// ⛔ AND THIS IS WHY IT IS **NOT** A `CompositeCommand`. L-2401 measured that
// `CompositeCommand` returns unconditionally `true` in BOTH directions and counts
// children ATTEMPTED rather than LANDED — so a composite that half-failed would
// report success, and the undo of a half-failed composite would report success too.
// A lift that half-created leaves a shaft with no doors, or doors with no shaft, and
// the user would be told it worked. `produceMultiStoreCommand` gives ONE patch pair
// over all six stores: it lands completely or not at all.
//
// ── WHY THE SLAB VOID IS A WHOLE-ARRAY REPLACE, NOT A `push` ──────────────────
// Inherited verbatim from `CreatePool.ts`, because the defect is the same one:
// `s.holes.push(loop)` produces a DEEP patch (`path: [slabId,'holes',N]`). The
// legacy undo adapter (`elementUndoStoreAdapter`) collapses deep sub-paths to the
// top field and would call `slabStore.update(slabId, { holes: undefined })` on undo
// — wiping EVERY hole on that slab, not just the lift's.
//
// Assigning the WHOLE array (`s.holes = [...s.holes, loop]`) produces
// `{op:'replace', path:[slabId,'holes'], value:<newArray>}` forward and the SAME
// path with `<oldArray>` inverse, so the adapter's field branch restores the slab
// EXACTLY. ⭐ For a lift this matters on up to N slabs at once rather than one, and
// an un-healed lift void is a full-height hole through a floor plate.

import {
    produceMultiStoreCommand,
    withHandlerSpan,
    type CommandHandler,
    type HandlerContext,
    type HandlerResult,
    type ValidationResult,
} from '@pryzm/plugin-sdk';
import {
    buildLiftAssembly,
    BUILT_IN_LIFT_TYPES,
    LiftCompoundSchema,
    LIFT_PART_CYCLE_ORDER,
    ENCLOSURE_SIDE_COUNT,
    type LiftCompound,
    type LiftEnclosureType,
    type ServedLevel,
} from '@pryzm/geometry-lift';
import { LiftHostWallError, LiftServedLevelsError, LiftGeometryError } from '../errors.js';
import type { LiftCompoundsState, LiftPartsState } from '../store.js';

/**
 * The payload. EVERY ID IS PRE-MINTED BY THE CALLER (the tool), never generated in
 * here — CA-2: ids MUST be identical across redo, and `execute()` runs again on
 * redo. Minting inside would give a DIFFERENT lift on redo, silently.
 */
export interface CreateLiftPayload {
    readonly liftId: string;
    /** The BASE level the lift is anchored on. */
    readonly levelId: string;
    readonly enclosureType: LiftEnclosureType;
    /** Required for `wall-hosted`; the schema refuses the type without it. */
    readonly hostWallId?: string;

    /** Shaft footprint centre, world coords. */
    readonly origin: { readonly x: number; readonly y: number; readonly z: number };
    readonly rotation?: number;

    /**
     * ⭐ THE SERVED LEVELS — the founder's storey question, answered.
     *
     * Each entry names a level, its elevation, and the slab (if any) the shaft
     * voids there. One landing door is created per entry. The TOOL resolves these
     * from the project's existing levels and the user's choice; the handler only
     * validates and builds, so the storey question has exactly one answer in the
     * payload rather than being re-derived differently by each consumer.
     */
    readonly servedLevels: readonly ServedLevel[];

    /** Pre-minted, one per enclosure side (always 4). */
    readonly enclosureIds: readonly string[];
    /** Pre-minted, one per `servedLevels` entry, in that order. */
    readonly landingDoorIds: readonly string[];
    /** Pre-minted, one per `LIFT_PART_CYCLE_ORDER` entry, in that order. */
    readonly cabinPartIds: readonly string[];

    /** Optional parametric overrides — unset resolves via systemType -> default. */
    readonly typeId?: string;
    readonly kind?: LiftCompound['kind'];
    readonly shaftWidth?: number;
    readonly shaftDepth?: number;
    readonly shaftWallThickness?: number;
    readonly doorWidth?: number;
    readonly doorHeight?: number;
    readonly carCapacityPersons?: number;
    readonly pitDepth?: number;
    readonly overrunHeight?: number;
    readonly materialId?: string;
    readonly glassMaterialId?: string;
    /** FEAT-LIFT-OBSERVATION-FRAME (L-9400) — unset resolves to the master row. */
    readonly frameMaterialId?: string;
    readonly guideRailMaterialId?: string;
}

/** The stores a lift touches. All six MUST be declared — see the header. */
type LiftHandlerStores = Readonly<
    {
        lift: LiftCompoundsState;
        liftPart: LiftPartsState;
        wall: Record<string, unknown>;
        curtainwall: Record<string, unknown>;
        door: Record<string, unknown>;
        slab: Record<string, { holes: { x: number; y: number; z: number }[] }>;
    } & Record<string, unknown>
>;

/**
 * ⭐ THE DEFAULT SYSTEM TYPE IS THE 6-PERSON CAR — the founder's "default of
 * standard lift for 6 people", honoured HERE rather than by rewriting the
 * standards-cited `passenger-8` definition. See `LiftTypeDefinitions.ts` for the
 * three measured reasons that decision went the way it did, and C104 §6.
 */
export const DEFAULT_LIFT_TYPE_ID = 'passenger-6';

// CA-6/§U-B6: this command
// REALLY writes six stores; declaring fewer drops the undeclared stores' patches
// from undo routing (Ctrl+Z would remove the lift but leave a full-height hole
// through every floor plate). The rule has no multi-store option; the declaration
// below is the truth.
// ⚠ THE DIRECTIVE MUST BE THE LAST COMMENT LINE HERE. `-next-line` means the
// NEXT LINE: with the rationale below it, it pointed at a comment and suppressed
// NOTHING, so this deliberate exemption had been reporting as a hard lint ERROR.
// eslint-disable-next-line pryzm/store-single-channel
export class CreateLiftHandler implements CommandHandler<CreateLiftPayload, LiftHandlerStores> {
    readonly type = 'lift.create';

    /**
     * CA-6 / §U-B6. SIX stores, because the command really does write six.
     * Declaring fewer would silently DROP the undeclared store's patches from undo
     * routing. For `slab` specifically that means Ctrl+Z removing the lift but
     * LEAVING THE VOID — the pool's "worse than no feature" case, multiplied by the
     * number of storeys served.
     */
    // eslint-disable-next-line pryzm/store-single-channel -- CA-6/§U-B6, see above.
    readonly affectedStores = ['lift', 'liftPart', 'wall', 'curtainwall', 'door', 'slab'] as const;

    canExecute(ctx: HandlerContext<LiftHandlerStores>, cmd: CreateLiftPayload): ValidationResult {
        if (typeof cmd.liftId !== 'string' || cmd.liftId.length === 0) {
            return { valid: false, reason: 'liftId must be a non-empty string' };
        }
        if (ctx.stores.lift[cmd.liftId]) {
            return { valid: false, reason: `duplicate lift id: ${cmd.liftId}` };
        }

        // ── The served-level set. Refuse BEFORE any mutation. ──────────────────
        if (!Array.isArray(cmd.servedLevels) || cmd.servedLevels.length === 0) {
            return {
                valid: false,
                reason:
                    'a lift must serve at least one level — the storey question has no ' +
                    'valid empty answer',
            };
        }
        const seen = new Set<string>();
        for (const l of cmd.servedLevels) {
            if (typeof l.levelId !== 'string' || l.levelId.length === 0) {
                return { valid: false, reason: 'every served level must name a levelId' };
            }
            if (seen.has(l.levelId)) {
                // A duplicate storey would silently create TWO landing doors on one
                // floor, stacked exactly, and the second would be invisible.
                return { valid: false, reason: `served level listed twice: ${l.levelId}` };
            }
            seen.add(l.levelId);
            if (!Number.isFinite(l.elevation)) {
                return {
                    valid: false,
                    reason: `served level ${l.levelId} has a non-finite elevation`,
                };
            }
            // ⭐ A named slab that is NOT in the slab store is a dangling reference,
            // and it must fail here rather than produce a void on nothing. `undefined`
            // is fine and means "no slab at this level" — a real state, not an error.
            if (l.slabId !== undefined && !ctx.stores.slab[l.slabId]) {
                return {
                    valid: false,
                    reason: `served level ${l.levelId} names slab ${l.slabId}, which does not exist`,
                };
            }
        }

        // ── The host wall, for the wall-hosted type. ───────────────────────────
        if (cmd.enclosureType === 'wall-hosted') {
            if (!cmd.hostWallId) {
                return {
                    valid: false,
                    reason:
                        'a wall-hosted lift must name the wall it is hosted in (hostWallId)',
                };
            }
            if (!ctx.stores.wall[cmd.hostWallId]) {
                return { valid: false, reason: `host wall not found: ${cmd.hostWallId}` };
            }
        }

        // ── Pre-minted id counts. ──────────────────────────────────────────────
        if (cmd.enclosureIds.length !== ENCLOSURE_SIDE_COUNT) {
            return {
                valid: false,
                reason: `expected ${ENCLOSURE_SIDE_COUNT} enclosure ids, got ${cmd.enclosureIds.length}`,
            };
        }
        if (cmd.landingDoorIds.length !== cmd.servedLevels.length) {
            return {
                valid: false,
                reason:
                    `expected ${cmd.servedLevels.length} landing-door ids (one per served ` +
                    `level), got ${cmd.landingDoorIds.length}`,
            };
        }
        if (cmd.cabinPartIds.length !== LIFT_PART_CYCLE_ORDER.length) {
            return {
                valid: false,
                reason:
                    `expected ${LIFT_PART_CYCLE_ORDER.length} cabin-part ids, got ` +
                    `${cmd.cabinPartIds.length}`,
            };
        }

        // ── The record itself, through the schema, so canExecute and execute
        //    cannot disagree about what a valid lift is. ─────────────────────────
        const parsed = LiftCompoundSchema.safeParse(this._recordOf(cmd));
        if (!parsed.success) {
            return { valid: false, reason: parsed.error.issues[0]?.message ?? 'invalid lift' };
        }
        return { valid: true };
    }

    execute(ctx: HandlerContext<LiftHandlerStores>, cmd: CreateLiftPayload): HandlerResult {
        return withHandlerSpan(this.type + '.handler', { 'pryzm.command.type': this.type }, () => {
            const parsed = LiftCompoundSchema.safeParse(this._recordOf(cmd));
            if (!parsed.success) {
                throw new LiftGeometryError(
                    parsed.error.issues[0]?.message ?? 'invalid lift record',
                );
            }
            const lift = parsed.data;

            if (lift.enclosureType === 'wall-hosted' && !ctx.stores.wall[lift.hostWallId!]) {
                throw new LiftHostWallError(`host wall not found: ${lift.hostWallId}`);
            }
            if (cmd.servedLevels.length === 0) {
                throw new LiftServedLevelsError('a lift must serve at least one level');
            }

            // The resolved system type — tier 2 of the dimension chain. Unknown ids
            // resolve to `undefined`, which falls through to the documented defaults
            // rather than throwing: an unrecognised type is a reason to use the
            // default, not a reason to refuse to place a lift.
            const systemType = BUILT_IN_LIFT_TYPES.find(
                (t) => t.id === (cmd.typeId ?? DEFAULT_LIFT_TYPE_ID),
            );

            // The PURE assembly (@pryzm/geometry-lift). Every dimension it uses
            // resolves through `resolveLiftDimensions()` — record -> systemType ->
            // documented default. There is not a single dimensional literal below.
            const asm = buildLiftAssembly(
                {
                    id: lift.id,
                    levelId: lift.levelId,
                    origin: lift.origin,
                    rotation: lift.rotation,
                    enclosureType: lift.enclosureType,
                    ...(lift.hostWallId ? { hostWallId: lift.hostWallId } : {}),
                    ...(lift.materialId ? { materialId: lift.materialId } : {}),
                    ...(lift.glassMaterialId ? { glassMaterialId: lift.glassMaterialId } : {}),
                    ...(lift.frameMaterialId ? { frameMaterialId: lift.frameMaterialId } : {}),
                    ...(lift.guideRailMaterialId
                        ? { guideRailMaterialId: lift.guideRailMaterialId }
                        : {}),
                    ...(lift.shaftWidth !== undefined ? { shaftWidth: lift.shaftWidth } : {}),
                    ...(lift.shaftDepth !== undefined ? { shaftDepth: lift.shaftDepth } : {}),
                    ...(lift.shaftWallThickness !== undefined
                        ? { shaftWallThickness: lift.shaftWallThickness }
                        : {}),
                    ...(lift.doorWidth !== undefined ? { doorWidth: lift.doorWidth } : {}),
                    ...(lift.doorHeight !== undefined ? { doorHeight: lift.doorHeight } : {}),
                    ...(lift.carCapacityPersons !== undefined
                        ? { carCapacityPersons: lift.carCapacityPersons }
                        : {}),
                    ...(lift.pitDepth !== undefined ? { pitDepth: lift.pitDepth } : {}),
                    ...(lift.overrunHeight !== undefined
                        ? { overrunHeight: lift.overrunHeight }
                        : {}),
                },
                {
                    enclosureIds: cmd.enclosureIds,
                    landingDoorIds: cmd.landingDoorIds,
                    cabinPartIds: cmd.cabinPartIds,
                },
                cmd.servedLevels,
                systemType,
            );

            // The lift OWNS its parts (C103 §2 / ADR-0124 §3): `childrenIds` on the
            // parent, `parentId` on each child (the assembly stamps the latter). ONE
            // thing to select, inspect and delete — and the list the Tab drill-in
            // descends into.
            const liftRecord: LiftCompound = {
                ...lift,
                childrenIds: [...asm.childrenIds],
                landingSideId: asm.landingSideId,
                penetratedSlabIds: asm.slabVoids.map((v) => v.slabId),
                // FEAT-LIFT-OBSERVATION-FRAME (L-9400) — the resolved vertical span,
                // written ONCE by the one producer that computes it. See the
                // `shaftBaseOffset` docstring in `LiftCompoundTypes.ts` for why three
                // derived scalars are stored on the parent: the enclosure sides this
                // same assembly emits already persist the identical two numbers as
                // `height` and `baseOffset`, so this adds no new drift class — and
                // without them the render layer would have to re-resolve the project
                // level table, becoming a SECOND producer that could disagree with
                // the walls.
                shaftBaseOffset: asm.shaftBaseOffset,
                shaftHeight: asm.shaftHeight,
                carParkOffsetY: asm.carParkOffsetY,
            };

            // ── THE ONE PATCH PAIR ─────────────────────────────────────────────
            const out = produceMultiStoreCommand(
                {
                    lift: ctx.stores.lift,
                    liftPart: ctx.stores.liftPart,
                    wall: ctx.stores.wall,
                    curtainwall: ctx.stores.curtainwall,
                    door: ctx.stores.door,
                    slab: ctx.stores.slab,
                },
                {
                    lift: (d) => {
                        (d as Record<string, unknown>)[lift.id] = liftRecord;
                    },
                    liftPart: (d) => {
                        for (const p of asm.cabinParts) (d as Record<string, unknown>)[p.id] = p;
                        // FEAT-LIFT-OBSERVATION-FRAME (L-9400) — the four corner
                        // columns, the per-storey ring beams, the top-bay bracing and
                        // the two guide rails. SAME family, SAME store, SAME patch
                        // pair: they are lift parts, so they land where lift parts
                        // land and they are undone by the same single Ctrl+Z.
                        //
                        // NOT a seventh store and not a second command. C104 R-3 is
                        // explicit that a new kind of part joins the family that owns
                        // that kind of thing, and R-4 is explicit that one gesture is
                        // one patch pair over the DECLARED stores — so adding a store
                        // here without adding it to `affectedStores` would silently
                        // drop these from undo routing, and adding one that is not
                        // needed would widen the blast radius for nothing.
                        for (const p of asm.shaftParts) (d as Record<string, unknown>)[p.id] = p;
                    },
                    wall: (d) => {
                        for (const s of asm.enclosure) {
                            if (s.kind === 'wall') (d as Record<string, unknown>)[s.id] = s.record;
                        }
                    },
                    curtainwall: (d) => {
                        for (const s of asm.enclosure) {
                            if (s.kind === 'curtainWall') {
                                (d as Record<string, unknown>)[s.id] = s.record;
                            }
                        }
                    },
                    door: (d) => {
                        for (const dr of asm.landingDoors) {
                            (d as Record<string, unknown>)[dr.id as string] = dr;
                        }
                    },
                    slab: (d) => {
                        const draft = d as Record<string, { holes: unknown[] }>;
                        // THE VOIDS. WHOLE-ARRAY REPLACE, never `push` — see the
                        // header. These lines are what make the shaft a real
                        // penetration through every floor plate it passes, and their
                        // INVERSE patches are what heal every one of them on Ctrl+Z.
                        for (const v of asm.slabVoids) {
                            const s = draft[v.slabId];
                            if (s) s.holes = [...(s.holes ?? []), v.loop];
                        }
                    },
                },
            );

            return {
                forward: out.forward,
                inverse: out.inverse,
                nextStates: out.nextStates,
            };
        }); // withHandlerSpan — CA-14 / C10 §2, merge-blocking
    }

    /**
     * The lift record as the schema sees it. Used by BOTH `canExecute` and
     * `execute` so they cannot disagree about what a valid lift is.
     */
    private _recordOf(cmd: CreateLiftPayload): unknown {
        return {
            id: cmd.liftId,
            type: 'lift',
            levelId: cmd.levelId,
            enclosureType: cmd.enclosureType,
            kind: cmd.kind ?? 'passenger',
            typeId: cmd.typeId ?? DEFAULT_LIFT_TYPE_ID,
            origin: cmd.origin,
            rotation: cmd.rotation ?? 0,
            servedLevelIds: cmd.servedLevels.map((l) => l.levelId),
            ...(cmd.hostWallId ? { hostWallId: cmd.hostWallId } : {}),
            childrenIds: [],
            penetratedSlabIds: [],
            ...(cmd.shaftWidth !== undefined ? { shaftWidth: cmd.shaftWidth } : {}),
            ...(cmd.shaftDepth !== undefined ? { shaftDepth: cmd.shaftDepth } : {}),
            ...(cmd.shaftWallThickness !== undefined
                ? { shaftWallThickness: cmd.shaftWallThickness }
                : {}),
            ...(cmd.doorWidth !== undefined ? { doorWidth: cmd.doorWidth } : {}),
            ...(cmd.doorHeight !== undefined ? { doorHeight: cmd.doorHeight } : {}),
            ...(cmd.carCapacityPersons !== undefined
                ? { carCapacityPersons: cmd.carCapacityPersons }
                : {}),
            ...(cmd.pitDepth !== undefined ? { pitDepth: cmd.pitDepth } : {}),
            ...(cmd.overrunHeight !== undefined ? { overrunHeight: cmd.overrunHeight } : {}),
            ...(cmd.materialId ? { materialId: cmd.materialId } : {}),
            ...(cmd.glassMaterialId ? { glassMaterialId: cmd.glassMaterialId } : {}),
            ...(cmd.frameMaterialId ? { frameMaterialId: cmd.frameMaterialId } : {}),
            ...(cmd.guideRailMaterialId
                ? { guideRailMaterialId: cmd.guideRailMaterialId }
                : {}),
        };
    }
}
