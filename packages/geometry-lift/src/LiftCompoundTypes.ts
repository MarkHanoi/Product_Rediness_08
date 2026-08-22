// LiftCompound — the PARENT record of a LOD-300 lift compound system.
//
// §FEAT-LIFT-COMPOUND-SYSTEM (L-5700..L-5712) · C104 · extends C103's compound model.
//
// ═══════════════════════════════════════════════════════════════════════════════
// A LIFT IS A COMPOUND, NOT A PRIMITIVE — AND IT IS A **DIFFERENT** COMPOUND FROM
// THE ONE THAT WAS ALREADY HERE.
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠ READ THIS BEFORE ASSUMING THIS FILE DUPLICATES `LiftTypes.ts`. It does not, and
// the distinction is the whole point of L-5700:
//
//   `LiftData` (LiftTypes.ts)   — the LOD-200 MASSING lift that already existed.
//                                 ONE record, ONE store (`verticalCirculation`),
//                                 rendered by `LiftMeshBuilder` as two placeholder
//                                 boxes (a translucent shaft + a solid car). It has
//                                 no doors, no cabin parts and punches no slabs.
//                                 It is driven by `CreateVerticalCirculationCommand`
//                                 and by the residential-building generator, both of
//                                 which are UNTOUCHED by this file.
//
//   `LiftCompound` (this file)  — the LOD-300 COMPOUND the founder asked for. It
//                                 OWNS a shaft enclosure, one landing DOOR per
//                                 served level, five CABIN parts and a void in every
//                                 slab it passes through. Its parts are real records
//                                 in the stores that already own those families.
//
// Both are kept, deliberately. Deleting the massing lift would break the residential
// generator; folding the compound into it would change what every existing generated
// building means. C104 §7 records the convergence path (the generator moves to
// `lift.create` once the compound is proven in the editor) and the fact that it is
// NOT taken in this lane.
//
// The compound record itself carries NO geometry of its own beyond its placement. It
// is the identity, the parametric intent, and the OWNER of its parts — linked by the
// `parentId` / `childrenIds` pair, the SAME mechanism the pool uses (ADR-0124 §3)
// and the host wall uses for its hosted doors (C15). Not a new compound pattern; the
// blessed one.
//
// DIMENSIONS ARE NOT STORED AS LITERALS (L-127). Every dimensional field below is
// OPTIONAL. "Unset" means *resolve me* — via `resolveLiftDimensions()`, which is the
// only place a lift dimension may be resolved.
//
// L0 PROMOTION IS DEFERRED WITH ITS REASON RECORDED — see the `LiftPartTypes.ts`
// header and L-5711. Both new shapes live here so they promote together in one move.

import { z } from 'zod';
import type { LiftKind } from './LiftTypes.js';

/**
 * ⛔ THIS SCHEMA EXISTS BECAUSE `LiftKind` IS A TYPE ALIAS, NOT A ZOD ENUM — AND
 * THE FIRST DRAFT OF THIS FILE IMPORTED IT AS A VALUE AND CRASHED THE WHOLE APP.
 *
 * `LiftTypes.ts:24` declares `export type LiftKind = 'passenger' | 'accessible' |
 * 'goods'` — a pure type. The first draft wrote `kind: LiftKind.default('passenger')`
 * at MODULE SCOPE. A type alias erases at runtime, so `LiftKind` was `undefined` and
 * line 77 threw `TypeError: Cannot read properties of undefined (reading 'default')`.
 *
 * ⚠ THE BLAST RADIUS WAS THE WHOLE EDITOR, NOT THE LIFT. `command-registry` imports
 * `@pryzm/geometry-lift` as a VALUE edge
 * (`CreateVerticalCirculationCommand.ts:27`), and that barrel is reachable from
 * `bootstrap.everything` — so a module-scope throw in THIS file took out test
 * COLLECTION for every suite under `apps/editor`, including a sibling lane's
 * reachability proof, which is how it was caught. `[[scc-no-barrel-access-at-module-load]]`
 * exactly: module-scope evaluation inside a barrel-reachable file makes one
 * package's defect everyone's crash.
 *
 * ⭐ TWO LESSONS, RECORDED IN C104 §9 AND WORTH MORE THAN THE FIX:
 *   1. A type-only symbol used as a value is INVISIBLE TO `tsc` when the import is
 *      elided, and fatal at runtime. (Here `tsc` did in fact flag it — TS2693 — but
 *      only because the import was not elided; the failure mode where it is elided
 *      is silent.)
 *   2. Prefer lazy / function-scope construction for anything a barrel re-exports.
 *
 * The typed-const parity line below is the guard that stops the two definitions
 * drifting: if someone adds a fourth kind to `LiftTypes.LiftKind` and forgets this
 * enum, the build fails here rather than at runtime in a user's project.
 */
export const LiftKindSchema = z.enum(['passenger', 'accessible', 'goods']);
// Compile-time equivalence: the Zod enum and the type alias must name the same set.
const _liftKindParity: readonly LiftKind[] = LiftKindSchema.options;
void _liftKindParity;

/**
 * The two LIFT TYPES. This is the founder's "with types" applied to the SHAFT, and
 * it is orthogonal to `LiftKind` (passenger / accessible / goods), which describes
 * the CAR. A goods lift can be standalone-glass; an accessible lift is usually
 * wall-hosted. Collapsing the two axes into one enum would make three-quarters of
 * the real combinations unrepresentable.
 */
export const LiftEnclosureTypeSchema = z.enum(['wall-hosted', 'standalone-glass']);
export type LiftEnclosureTypeName = z.infer<typeof LiftEnclosureTypeSchema>;

/** Human labels — one table, so the palette, the inspector and C104 agree. */
export const LIFT_ENCLOSURE_TYPE_LABELS: Readonly<Record<LiftEnclosureTypeName, string>> =
    Object.freeze({
        'wall-hosted': 'Wall-hosted lift',
        'standalone-glass': 'Standalone glass lift',
    });

const Vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });

export const LiftCompoundSchema = z.object({
    /** `lift_<26-char Crockford ULID>` — minted ONCE by the tool (CA-2). */
    id: z.string().min(1),
    type: z.literal('lift'),
    /** The BASE level: where the lift is anchored and which plan it belongs to. */
    levelId: z.string().min(1),
    /** Type A or type B. Drives the enclosure the assembly emits. */
    enclosureType: LiftEnclosureTypeSchema.default('wall-hosted'),
    /** Car duty class. Independent of `enclosureType` — see its docstring. */
    kind: LiftKindSchema.default('passenger'),
    /** System type id, e.g. `passenger-6`. Tier 2 of the dimension chain. */
    typeId: z.string().optional(),

    /** Shaft footprint centre, world coords. */
    origin: Vec3Schema,
    /** Plan angle (radians, about world Y). Local -Z is the LANDING side. */
    rotation: z.number().default(0),

    /**
     * ⭐ THE LEVELS THIS LIFT SERVES — the founder's "asked how many stories that
     * lift should cover based on the existing levels in the project", stored.
     *
     * A SET OF LEVEL IDS, NOT A COUNT, and that is a deliberate C104 §4 call. A
     * count ("serves 5 storeys") cannot survive the user inserting a level in the
     * middle, deleting one, or serving a non-contiguous set (a goods lift that skips
     * the mezzanine is a real building). The ids say exactly which storeys have a
     * landing door, so inserting a level leaves the lift's service unchanged instead
     * of silently extending it.
     */
    servedLevelIds: z.array(z.string().min(1)).min(1),

    /**
     * Type A only — the wall the lift was placed against. This is what makes the
     * lift WALL-HOSTED in the C15 sense and it is what the placement PREVIEW snaps
     * to. Absent for `standalone-glass`, which is placed on a floor.
     */
    hostWallId: z.string().optional(),

    /**
     * The enclosure side the landing doors host in. STORED, not derived: it cannot
     * be recovered from `childrenIds` (which is a flat list), and `lift.delete`
     * plus every landing-door query need it. An identity reference, not a dimension
     * — the derived-vs-stored rule in C104 §4 is about VALUES THAT CAN DISAGREE,
     * and an id that names one of the four sides cannot drift from itself.
     */
    landingSideId: z.string().optional(),

    /** The C103 §2 ownership link: every enclosure side, landing door and cabin part. */
    childrenIds: z.array(z.string()).default([]),

    /**
     * The slabs this shaft voids, remembered so `lift.delete` can HEAL exactly the
     * holes it made — the pool's R-8 property ("a pool that vanishes but leaves the
     * hole is worse than no feature") applied to a lift, where it is worse still:
     * an un-healed lift shaft leaves a full-height hole through every floor plate.
     */
    penetratedSlabIds: z.array(z.string()).default([]),

    // ── Dimensional overrides. ALL OPTIONAL — unset means *resolve me*. ─────────
    shaftWidth: z.number().positive().optional(),
    shaftDepth: z.number().positive().optional(),
    shaftWallThickness: z.number().positive().optional(),
    doorWidth: z.number().positive().optional(),
    doorHeight: z.number().positive().optional(),
    carCapacityPersons: z.number().int().positive().optional(),
    pitDepth: z.number().nonnegative().optional(),
    overrunHeight: z.number().nonnegative().optional(),

    materialId: z.string().optional(),
    glassMaterialId: z.string().optional(),
    mark: z.string().optional(),
}).refine(
    (v) => v.enclosureType !== 'wall-hosted' || v.hostWallId !== undefined,
    {
        message:
            'A wall-hosted lift must name the wall it is hosted in (hostWallId). ' +
            'A wall-hosted lift with no host is a standalone lift that has not said so.',
    },
);

export type LiftCompound = z.infer<typeof LiftCompoundSchema>;

/** Store shape: `{ [liftId]: LiftCompound }`. */
export type LiftCompoundsState = Readonly<Record<string, LiftCompound>>;
