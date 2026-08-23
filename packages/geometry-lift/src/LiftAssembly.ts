// LiftAssembly — one lift record -> every part it owns, at LOD 300.
//
// §FEAT-LIFT-COMPOUND-SYSTEM (L-5700..L-5712) · C104 · extends C103's compound model.
//
// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSE, DO NOT INVENT — the rule `PoolAssembly.ts` states and this file obeys.
// ═══════════════════════════════════════════════════════════════════════════════
// Four of the five kinds of part a lift owns ALREADY EXIST as element families, and
// this file re-implements none of them:
//
//   • the SHAFT ENCLOSURE  -> real `Wall` records (type A) or real `CurtainWall`
//                             records (type B). Full-height, pit to overrun.
//   • the LANDING DOORS    -> real `Door` records, ONE PER SERVED LEVEL, hosted in
//                             the shaft's landing wall (C15).
//   • the SLAB VOIDS       -> a loop appended to each penetrated `Slab.holes`
//                             (already a field — the pool punches its hole the
//                             same way).
//   • the CABIN PARTS      -> `LiftPart` records: the ONE new family, for the
//                             reasons `LiftPartTypes.ts` sets out at length.
//
// There is no hole-punching routine here, no wall builder, no door builder. There
// is arithmetic and there are record literals.
//
// PURITY: a pure function of the lift record + the served levels. No THREE, no DOM,
// no store, no id minting (ids are passed IN — CA-2 requires them stable across
// redo, so the caller mints them once and reuses them). Every dimension arrives
// from `resolveLiftDimensions()`; there is not one dimensional literal below.
//
// ── COORDINATE MODEL, STATED EXPLICITLY ───────────────────────────────────────
// EVERYTHING IS WORLD SPACE, exactly as `PoolAssembly` (whose header records why:
// the stair's local-space conversion only works because slab position happens to
// be zero). `Wall.baseLine`, `CurtainWall.baseLine` and the hole loops are all
// world XZ with `y` carrying an elevation.
//
// The shaft footprint is a rectangle centred on `lift.origin`, `shaftWidth` across
// local X, `shaftDepth` along local Z, rotated `lift.rotation` about world Y.
// LOCAL -Z IS THE LANDING SIDE — the side the doors open onto. So a lift with
// rotation 0 has its doors facing -Z, and `rotation` aims the doors.
//
// ── VERTICAL MODEL ────────────────────────────────────────────────────────────
//
//   shaft top  = highest served elevation + overrun    <- headroom above the car
//   ...
//   level k    = a LANDING DOOR at sillHeight = elev(k) - shaftBase
//   ...
//   level 0    = the lowest served level
//   shaft base = lowest served elevation - pit          <- the buffer pit
//
// ⭐ ONE TALL SHAFT WALL CARRYING N DOORS AT DIFFERENT `sillHeight`s IS THE WHOLE
// TRICK, and it is why the landing doors can be real `Door` records rather than a
// bespoke sub-element: `Door` already has `wallId` + `sillHeight` + `offset`, and a
// shaft wall that spans pit-to-overrun is a single wall those N doors can host in.
// That is exactly how a shaft is drawn in section, so the model matches the drawing.

import { trace } from '@opentelemetry/api';
import type { Vec3 } from './LiftTypes.js';
import type { LiftPart, LiftPartKind } from './LiftPartTypes.js';
import {
    LIFT_PART_DEFAULT_MATERIAL_IDS,
    LIFT_FRAME_MATERIAL_ID,
    LIFT_GLASS_MATERIAL_ID,
    LIFT_GUIDE_RAIL_MATERIAL_ID,
    LIFT_LANDING_DOOR_MATERIAL_ID,
} from './LiftMaterials.js';
import {
    resolveLiftDimensions,
    type LiftDimensionInput,
    type ResolvedLiftDimensions,
} from './LiftDimensions.js';
import type { LiftTypeDefinition } from './LiftTypeDefinitions.js';

const _tracer = trace.getTracer('@pryzm/geometry-lift', '0.1.0');

/**
 * The two LIFT TYPES the founder asked for. This is the `type` axis of "I need a
 * LOD 300 system. With types." — orthogonal to `LiftKind`
 * (passenger/accessible/goods), which is about the CAR. This is about the SHAFT.
 */
export type LiftEnclosureType =
    /** Type A — wall-hosted. Opaque shaft walls; placed against a host wall. */
    | 'wall-hosted'
    /** Type B — standalone. Glass curtain-wall enclosure, placed on a floor. */
    | 'standalone-glass';

/** A level the lift SERVES: it gets a landing door, and its slab gets a void. */
export interface ServedLevel {
    readonly levelId: string;
    readonly elevation: number;
    /**
     * The slab the shaft passes through at this level, if there is one. The shaft
     * voids it. `undefined` means "no slab here" — a legitimate state (the lowest
     * served level often sits on grade), NOT an error, and NOT silently a hole.
     */
    readonly slabId?: string;
}

/** Ids the caller pre-minted. CA-2: stable across redo, so minted once, outside. */
export interface LiftPartIds {
    /** One per enclosure side. Length must equal the side count for the type. */
    readonly enclosureIds: readonly string[];
    /** One per SERVED LEVEL, in `servedLevels` order. */
    readonly landingDoorIds: readonly string[];
    /** One per `LIFT_PART_CYCLE_ORDER` entry, in that order. */
    readonly cabinPartIds: readonly string[];
}

/** The lift record fields the assembly reads. */
export interface LiftAssemblyInput extends LiftDimensionInput {
    readonly id: string;
    readonly levelId: string;
    readonly origin: Vec3;
    readonly rotation: number;
    readonly enclosureType: LiftEnclosureType;
    /** Type A only — the wall the lift was placed against (drives the preview). */
    readonly hostWallId?: string;
    readonly materialId?: string;
    readonly glassMaterialId?: string;
    /** §FEAT-LIFT-OBSERVATION-FRAME (L-9400) — unset resolves to the master row. */
    readonly frameMaterialId?: string;
    readonly guideRailMaterialId?: string;
    readonly metadata?: unknown;
}

/** One void to append to one slab's `holes`. */
export interface LiftSlabVoid {
    readonly slabId: string;
    /** World-XZ OPEN loop — the shaft footprint. */
    readonly loop: readonly Vec3[];
}

/**
 * A shaft enclosure side, emitted as the shape the target store wants. `kind`
 * selects which store it lands in — `wall` or `curtainWall`.
 */
export interface LiftEnclosureSide {
    readonly id: string;
    readonly kind: 'wall' | 'curtainWall';
    /** True for the side the landing doors host in. Exactly one side has this. */
    readonly isLandingSide: boolean;
    readonly record: Record<string, unknown>;
}

/** Everything a lift owns, ready for ONE patch pair across the stores. */
export interface LiftAssembly {
    readonly dims: ResolvedLiftDimensions;
    readonly shaftBaseY: number;
    readonly shaftTopY: number;
    readonly shaftHeight: number;
    readonly enclosure: readonly LiftEnclosureSide[];
    /** The one side the landing doors are hosted in. */
    readonly landingSideId: string;
    readonly landingDoors: readonly Record<string, unknown>[];
    readonly cabinParts: readonly LiftPart[];
    /**
     * ⭐ §FEAT-LIFT-OBSERVATION-FRAME (L-9400) — the painted steel tower and the
     * guide rails: four corner columns pit-to-overrun, a ring beam per side at every
     * served storey plus the head, cross-bracing in the top bay, and two car guide
     * rails. Same `liftPart` family as `cabinParts`, same store, same `childrenIds`
     * — separated here only because their ids are DERIVED rather than pre-minted
     * (see `derivedShaftPartId`), never because they are a different kind of thing.
     */
    readonly shaftParts: readonly LiftPart[];
    /** Car floor top face when parked, relative to the level datum (C104 §4). */
    readonly carParkOffsetY: number;
    /** Pit floor, relative to the level datum. Same value the enclosure carries. */
    readonly shaftBaseOffset: number;
    readonly slabVoids: readonly LiftSlabVoid[];
    /** Every child id the parent must own — the C103 §2 `childrenIds`. */
    readonly childrenIds: readonly string[];
}

/** Side count per type. Type A builds all four; type B keeps a solid landing side. */
export const ENCLOSURE_SIDE_COUNT = 4;

/**
 * ⭐ THE DERIVED ID FOR A SHAFT PART — §FEAT-LIFT-OBSERVATION-FRAME (L-9400).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHY THESE ARE DERIVED WHERE EVERY OTHER MEMBER ID IS PRE-MINTED.
 * ═══════════════════════════════════════════════════════════════════════════════
 * CA-2 requires member ids to be IDENTICAL across redo, because `execute()` runs
 * again on redo and a freshly-minted id would produce a DIFFERENT lift the second
 * time. The compound buys that today by having the TOOL mint every id once and pass
 * it in — which works, and which means every new member kind needs a matching change
 * in the tool.
 *
 * A pure function of `(liftId, tag)` satisfies CA-2 **more strongly than pre-minting
 * does**, not less: it cannot differ across redo because it is not random, and it
 * cannot be forgotten by a caller because there is no caller to forget it. The frame
 * has a variable member count (four columns, but `4 x (servedLevels + 1)` ring beams)
 * so pre-minting would have meant the tool computing the assembly's own arithmetic
 * to know how many ids to mint — two producers of one number, which is the defect
 * shape C104 §4 exists to prevent.
 *
 * ⚠ THE `liftPart_` PREFIX IS KEPT, DELIBERATELY. C84 EI-8 is one vocabulary per
 * concept: a shaft part is a `liftPart` and its id must say so, exactly as the
 * pre-minted cabin ids do. What follows the prefix is the parent's own ULID stem
 * plus a member tag, so the id is unique by construction (one lift owns one frame),
 * greppable back to its parent, and stable.
 */
export function derivedShaftPartId(liftId: string, tag: string): string {
    const sep = liftId.indexOf('_');
    const stem = sep >= 0 ? liftId.slice(sep + 1) : liftId;
    return `liftPart_${stem}_${tag}`;
}

/** The opening record id for a landing door. Same derivation, same reasons. */
export function derivedLandingOpeningId(doorId: string): string {
    const sep = doorId.indexOf('_');
    const stem = sep >= 0 ? doorId.slice(sep + 1) : doorId;
    return `opening_${stem}_ld`;
}

/** A point in SHAFT-LOCAL space (see `LiftPartSchema.axis`). */
interface LocalPt {
    readonly x: number;
    readonly z: number;
}

/** Rotate a local (x, z) offset by `rot` about Y and translate to world. */
function toWorld(origin: Vec3, rot: number, lx: number, lz: number): { x: number; z: number } {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    return { x: origin.x + lx * c + lz * s, z: origin.z - lx * s + lz * c };
}

/**
 * Compute every part of a lift.
 *
 * @param lift    the lift record (dimensions optional — resolved here)
 * @param ids     pre-minted ids (CA-2)
 * @param servedLevels  the levels the user chose, ASCENDING by elevation. This is
 *                the founder's "asked how many stories that lift should cover based
 *                on the existing levels" — the ANSWER arrives here as data.
 * @param systemType  the resolved lift system type (tier 2 of the dimension chain)
 */
export function buildLiftAssembly(
    lift: LiftAssemblyInput,
    ids: LiftPartIds,
    servedLevels: readonly ServedLevel[],
    systemType?: Pick<LiftTypeDefinition, 'defaults'>,
): LiftAssembly {
    return _tracer.startActiveSpan('pryzm.lift.buildAssembly', (span) => {
        try {
            if (servedLevels.length === 0) {
                throw new Error(
                    '[buildLiftAssembly] a lift must serve at least one level. ' +
                    'An empty served-level set is a caller bug, not a degenerate lift.',
                );
            }
            if (ids.enclosureIds.length !== ENCLOSURE_SIDE_COUNT) {
                throw new Error(
                    `[buildLiftAssembly] expected ${ENCLOSURE_SIDE_COUNT} enclosure ids, ` +
                    `got ${ids.enclosureIds.length}. Ids are pre-minted so they are stable ` +
                    'across redo (CA-2).',
                );
            }
            if (ids.landingDoorIds.length !== servedLevels.length) {
                throw new Error(
                    `[buildLiftAssembly] expected ${servedLevels.length} landing-door ids ` +
                    `(one per served level), got ${ids.landingDoorIds.length}.`,
                );
            }

            const dims = resolveLiftDimensions(lift, systemType);

            // ── The vertical span. See the header diagram. ───────────────────────
            const sorted = [...servedLevels].sort((a, b) => a.elevation - b.elevation);
            const lowest = sorted[0]!.elevation;
            const highest = sorted[sorted.length - 1]!.elevation;
            const shaftBaseY = lowest - dims.pitDepth;
            const shaftTopY = highest + dims.overrunHeight;
            const shaftHeight = shaftTopY - shaftBaseY;

            // The lift's own level datum — `baseOffset` on every enclosure side is
            // relative to it, exactly as `Wall.baseOffset` is everywhere else.
            const datumY = lift.origin.y;

            const hw = dims.shaftWidth / 2;
            const hd = dims.shaftDepth / 2;

            // Footprint corners, local -> world. LOCAL -Z IS THE LANDING SIDE.
            //   c0 = (-hw, -hd)  front-left    c1 = (+hw, -hd)  front-right
            //   c2 = (+hw, +hd)  back-right    c3 = (-hw, +hd)  back-left
            const c0 = toWorld(lift.origin, lift.rotation, -hw, -hd);
            const c1 = toWorld(lift.origin, lift.rotation, +hw, -hd);
            const c2 = toWorld(lift.origin, lift.rotation, +hw, +hd);
            const c3 = toWorld(lift.origin, lift.rotation, -hw, +hd);

            // ⭐ THE SAME FOUR CORNERS IN SHAFT-LOCAL SPACE, for the frame members.
            // ⛔ NOT a second footprint — the SAME one, before `toWorld`. The frame
            // is stored shaft-local (see `LiftPartSchema.axis`) so that moving the
            // lift moves the steel with the glass; deriving a local footprint by
            // un-rotating the world one would be a second producer of the geometry
            // that must agree with the enclosure, and C104 §4's whole subject is two
            // values that must agree being computed twice.
            const l0: LocalPt = { x: -hw, z: -hd }; // front-left  (landing side)
            const l1: LocalPt = { x: +hw, z: -hd }; // front-right (landing side)
            const l2: LocalPt = { x: +hw, z: +hd }; // back-right
            const l3: LocalPt = { x: -hw, z: +hd }; // back-left
            const localCorners: readonly LocalPt[] = [l0, l1, l2, l3];

            // Local Y is measured from the level datum, exactly as `baseOffset` is.
            const shaftBaseOffset = shaftBaseY - datumY;
            const shaftTopOffset = shaftTopY - datumY;
            /**
             * ⭐ THE CAR PARKS AT THE LOWEST SERVED LEVEL. Not at the pit floor —
             * a car resting in its own pit is a car that has crashed. `offsetY` on
             * every cabin part is measured from this plane (`LiftPartTypes.ts`
             * header point 3), so this single number is what turns five car-local
             * boxes into a car standing at a landing.
             */
            const carParkOffsetY = lowest - datumY;

            /**
             * The typical storey height, used as the glazing BAY height so the panes
             * break at the floors rather than on an arbitrary grid. One served level
             * has no "between", so the whole shaft is one bay.
             */
            const storeyHeight =
                sorted.length > 1
                    ? (highest - lowest) / (sorted.length - 1)
                    : shaftHeight;

            // ── 1. THE SLAB VOIDS ────────────────────────────────────────────────
            // The shaft footprint IS the void. One polygon, one source of truth, so
            // the enclosure and every hole it passes through cannot drift apart.
            //
            // ⭐ A LEVEL WITH NO SLAB PRODUCES NO VOID, and that is a decision, not a
            // gap: `slabId === undefined` means the shaft passes through open air
            // there. Emitting a void for a slab that does not exist would be a
            // dangling reference the store would have to tolerate.
            const footprint: Vec3[] = [
                { x: c0.x, y: 0, z: c0.z },
                { x: c1.x, y: 0, z: c1.z },
                { x: c2.x, y: 0, z: c2.z },
                { x: c3.x, y: 0, z: c3.z },
            ];
            const slabVoids: LiftSlabVoid[] = sorted
                .filter((l) => typeof l.slabId === 'string' && l.slabId.length > 0)
                .map((l) => ({
                    slabId: l.slabId!,
                    loop: footprint.map((p) => ({ x: p.x, y: l.elevation, z: p.z })),
                }));

            // ── 2. THE SHAFT ENCLOSURE ───────────────────────────────────────────
            // Four sides, full height, pit to overrun. Side 0 is the LANDING side.
            //
            // TYPE A (wall-hosted): all four sides are opaque `Wall` records.
            // TYPE B (standalone-glass): the three NON-landing sides are
            //   `CurtainWall` records — the founder's "glass curtain wall lift" —
            //   and the LANDING side stays a `Wall`.
            //
            // ⭐ WHY THE LANDING SIDE IS A WALL EVEN IN THE GLASS TYPE. `Door.wallId`
            // is `idRef('wall')`: a door hosts in a WALL, and `CurtainWall` has no
            // opening list at all. Making the landing side glass would leave the
            // landing doors with nothing to host in, and the only ways out are to
            // invent a lift-specific door (losing the schedule and the IFC export —
            // see §4) or to widen the `Door` schema (a change to a shared family for
            // one caller's benefit). A solid landing side is ALSO how observation
            // lifts are really built: the doors and the structure are on the landing
            // face, the glass is on the three faces people look out of.
            const sideDefs: ReadonlyArray<{
                a: { x: number; z: number };
                b: { x: number; z: number };
                landing: boolean;
            }> = [
                { a: c0, b: c1, landing: true },  // front — the landing side
                { a: c1, b: c2, landing: false }, // right
                { a: c2, b: c3, landing: false }, // back
                { a: c3, b: c0, landing: false }, // left
            ];

            // ── 2a. THE LANDING OPENINGS — COMPUTED BEFORE THE WALL THEY SIT IN ──
            //
            // ⭐ §FIX-LIFT-DOORS-WITH-NO-HOLE (L-9402). The landing side used to be
            // emitted with `openings: []` while N `Door` records claimed to be hosted
            // in it. C15 is unambiguous that a hosted opening lives in its HOST's
            // opening list — that array is what every wall mesh path subtracts to
            // punch the hole, what the plan symbol reads to draw the reveal, and what
            // the legacy §P2.3 mirror dedups against. A door record pointing at a wall
            // that does not list it is a door in front of solid concrete: the schedule
            // counts it, the IFC export has it, and you cannot walk through it.
            //
            // The doors are therefore derived HERE, once, and BOTH the wall's
            // `openings[]` and the `Door` records below are built from this one list —
            // so the two cannot disagree about how wide the door is or where it sits.
            const doorOffset = Math.max(0, (dims.shaftWidth - dims.doorWidth) / 2);
            const landingOpenings = sorted.map((lvl, i) => {
                const doorId = ids.landingDoorIds[i]!;
                return {
                    id: derivedLandingOpeningId(doorId),
                    type: 'door' as const,
                    doorType: 'single' as const,
                    offset: doorOffset,
                    width: dims.doorWidth,
                    height: dims.doorHeight,
                    // ⛔ `sillHeight` is measured from the WALL BASE, and the shaft
                    // wall's base is the PIT FLOOR, not the storey. So a door on
                    // level k sits `elev(k) - shaftBase` up a single tall wall —
                    // which is the whole trick that lets N landing doors be real
                    // C15 openings in ONE enclosure side (see the file header).
                    sillHeight: Math.max(0, lvl.elevation - shaftBaseY),
                    elementId: doorId,
                    levelId: lvl.levelId,
                };
            });

            const isGlass = lift.enclosureType === 'standalone-glass';
            const enclosure: LiftEnclosureSide[] = sideDefs.map((sd, i) => {
                const id = ids.enclosureIds[i]!;
                const useGlass = isGlass && !sd.landing;
                const base = {
                    id,
                    parentId: lift.id,
                    childrenIds: [] as string[],
                    levelId: lift.levelId,
                    baseLine: [
                        { x: sd.a.x, y: datumY, z: sd.a.z },
                        { x: sd.b.x, y: datumY, z: sd.b.z },
                    ],
                    height: shaftHeight,
                    baseOffset: shaftBaseY - datumY,
                };
                // The side's own plan length — one glazing bay per face, so a pane
                // spans the face and the mullions land ON the corner columns rather
                // than somewhere across the glass.
                const sideLength = Math.hypot(sd.b.x - sd.a.x, sd.b.z - sd.a.z);
                const record: Record<string, unknown> = useGlass
                    ? {
                          ...base,
                          type: 'curtainwall',
                          mullionThickness: dims.shaftWallThickness / 4,
                          panelThickness: dims.shaftWallThickness / 4,
                          // ⭐ §FIX-LIFT-GLASS-EMPTY-MESH (L-9401). `bayWidth` /
                          // `bayHeight` are NOT decoration: the legacy curtain-wall
                          // builder's `migrateToGridSystem()` reads them as
                          // `gridXSpacing` / `gridYSpacing`, and without finite
                          // positive values it produces NaN -> 0 mullion counts ->
                          // AN EMPTY MESH. The mirror has defaults (1.2 x 1.5), so
                          // omitting them would not have crashed — it would have
                          // silently glazed a 1.5 m shaft on a 1.2 m grid, which is
                          // a sliver of a second pane on every face.
                          bayWidth: Math.max(0.1, sideLength),
                          bayHeight: Math.max(0.1, storeyHeight),
                          panels: [],
                          materialId:
                              lift.glassMaterialId ?? LIFT_GLASS_MATERIAL_ID,
                      }
                    : {
                          ...base,
                          type: 'wall',
                          thickness: dims.shaftWallThickness,
                          // ⭐ THE LANDING SIDE CARRIES THE DOORS' OPENINGS (L-9402).
                          // The other three sides are blind. See §2a above.
                          openings: sd.landing
                              ? landingOpenings.map((o) => ({
                                    id: o.id,
                                    type: o.type,
                                    doorType: o.doorType,
                                    offset: o.offset,
                                    width: o.width,
                                    height: o.height,
                                    sillHeight: o.sillHeight,
                                    elementId: o.elementId,
                                }))
                              : [],
                          ...(lift.materialId ? { materialId: lift.materialId } : {}),
                      };
                return {
                    id,
                    kind: useGlass ? ('curtainWall' as const) : ('wall' as const),
                    isLandingSide: sd.landing,
                    record,
                };
            });
            const landingSide = enclosure.find((e) => e.isLandingSide)!;

            // ── 3. THE LANDING DOORS — ONE PER SERVED LEVEL ──────────────────────
            // Real `Door` records. See §4 of C104 for why: schedules (C28), IFC
            // export (C25) and quantity take-off ALL read the door store, and "how
            // many lift landing doors does this building have?" is a question a fire
            // strategy really asks. A lift-specific sub-element would be invisible
            // to all three.
            //
            // They host in the LANDING SIDE, at `sillHeight = elev - shaftBase`, and
            // are centred along it (`offset` measured from the wall start).
            const landingDoors = landingOpenings.map((o) => ({
                id: o.elementId,
                type: 'door',
                parentId: lift.id,
                childrenIds: [] as string[],
                // The door belongs to the LEVEL IT SERVES, not to the lift's base
                // level — that is what makes it appear on that storey's plan and in
                // that storey's door schedule.
                levelId: o.levelId,
                wallId: landingSide.id,
                // ⭐ §FIX-LIFT-DOORS-WITH-NO-HOLE (L-9402) — this was the EMPTY
                // STRING. `openingId` is the back-reference from the door to the
                // hole it occupies; blank, the door could never be matched to an
                // opening in the wall it claims to be hosted in, which is the same
                // defect as the wall's empty `openings[]` seen from the other end.
                openingId: o.id,
                doorType: o.doorType,
                width: o.width,
                height: o.height,
                sillHeight: o.sillHeight,
                // Centred on the landing side.
                offset: o.offset,
                // A lift landing door is a SLIDING door. Saying so is not cosmetic:
                // the swing arc is what plan-view clearance checks read, and a hinged
                // arc drawn into a lift lobby is a clash that does not exist.
                swing: 'sliding' as const,
                // C100 §6.1 — a MASTER id, not a hex. The reference render's dark
                // grey landing assemblies are `Steel · Powder-Coated Dark Grey`.
                leafMaterialId: lift.materialId ?? LIFT_LANDING_DOOR_MATERIAL_ID,
            }));

            // ── 4. THE CABIN — THE LOD-300 DECOMPOSITION ─────────────────────────
            // Five parts, CAR-LOCAL (see `LiftPartTypes.ts` header point 3). The car
            // floor's TOP face is y = 0 in car-local space, so:
            //   - the floor build-up hangs BELOW it            (offsetY negative)
            //   - the finishes and structure rise from it      (offsetY >= 0)
            //   - the ceiling raft hangs from the car top      (offsetY = carHeight)
            const cw = dims.carWidth;
            const cd = dims.carDepth;
            const partSpec: ReadonlyArray<{
                kind: LiftPartKind;
                width: number;
                depth: number;
                height: number;
                offsetY: number;
            }> = [
                // The sling: the full car envelope, structural.
                {
                    kind: 'cabin-structure',
                    width: cw,
                    depth: cd,
                    height: dims.carHeight,
                    offsetY: 0,
                },
                // The lining, inset by the structure it hangs on.
                {
                    kind: 'cabin-wall-finish',
                    width: Math.max(0.1, cw - 2 * dims.structureThickness),
                    depth: Math.max(0.1, cd - 2 * dims.structureThickness),
                    height: Math.max(0.1, dims.carHeight - dims.ceilingThickness),
                    offsetY: 0,
                },
                // The floor build-up, hanging below the walking surface.
                {
                    kind: 'cabin-floor',
                    width: cw,
                    depth: cd,
                    height: dims.floorThickness,
                    offsetY: -dims.floorThickness,
                },
                // The ceiling raft, hanging from the car top.
                {
                    kind: 'cabin-ceiling',
                    width: Math.max(0.1, cw - 2 * dims.structureThickness),
                    depth: Math.max(0.1, cd - 2 * dims.structureThickness),
                    height: dims.ceilingThickness,
                    offsetY: dims.carHeight - dims.ceilingThickness,
                },
                // The car door — on the landing face, so as wide as the landing door.
                {
                    kind: 'cabin-door',
                    width: dims.doorWidth,
                    depth: dims.carDoorThickness,
                    height: dims.doorHeight,
                    offsetY: 0,
                },
            ];
            if (ids.cabinPartIds.length !== partSpec.length) {
                throw new Error(
                    `[buildLiftAssembly] expected ${partSpec.length} cabin-part ids ` +
                    `(one per LIFT_PART_CYCLE_ORDER entry), got ${ids.cabinPartIds.length}.`,
                );
            }
            const cabinParts: LiftPart[] = partSpec.map((p, i) => ({
                id: ids.cabinPartIds[i]!,
                type: 'liftPart' as const,
                parentId: lift.id,
                liftId: lift.id,
                kind: p.kind,
                width: p.width,
                depth: p.depth,
                height: p.height,
                offsetY: p.offsetY,
                // C100 section 6.1 — a MASTER id per PART KIND, not one id for the
                // whole car and never a hex. A car is not one material: the sling is
                // structural steel, the linings and the door are brushed stainless,
                // the floor is a dark platform. `lift.materialId`, when the author
                // set one, still wins for all of them — an explicit override is
                // exactly what an override is for.
                materialId: lift.materialId ?? LIFT_PART_DEFAULT_MATERIAL_IDS[p.kind],
            }));

            // -- 5. THE STRUCTURAL FRAME AND THE GUIDE RAILS ---------------------
            // FEAT-LIFT-OBSERVATION-FRAME (L-9400). The founder's reference render.
            //
            // NOT DECORATION, AND NOT A HARD-CODED FOUR-STOREY TOWER. Every member
            // below is placed from `localCorners`, `sorted` and `dims` — so a
            // two-storey lift gets two rings and an eleven-storey lift gets eleven,
            // a 3 m x 3 m goods shaft gets a 3 m frame, and none of it is a literal.
            // "Exactly the same as the render" is the founder's standard for the
            // LOOK; a geometry that only matched at four storeys would be a picture,
            // not a model.
            const frameMaterialId = lift.frameMaterialId ?? LIFT_FRAME_MATERIAL_ID;
            const railMaterialId = lift.guideRailMaterialId ?? LIFT_GUIDE_RAIL_MATERIAL_ID;
            const shaftParts: LiftPart[] = [];

            const pushLinear = (
                tag: string,
                kind: LiftPartKind,
                start: { x: number; y: number; z: number },
                end: { x: number; y: number; z: number },
                sectionW: number,
                sectionD: number,
                materialId: string,
            ): void => {
                const len = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
                // A degenerate member is DROPPED, not emitted at zero length: the
                // schema's `.positive()` would refuse it and take the whole lift with
                // it. A shaft one member short is a real lift; a lift that refuses to
                // be placed because a brace came out 0 mm long is not.
                if (!(len > 1e-6)) return;
                shaftParts.push({
                    id: derivedShaftPartId(lift.id, tag),
                    type: 'liftPart' as const,
                    parentId: lift.id,
                    liftId: lift.id,
                    kind,
                    width: sectionW,
                    depth: sectionD,
                    // For a LINEAR member `height` is the LENGTH along `axis` — see
                    // the `axis` docstring in `LiftPartTypes.ts`.
                    height: len,
                    offsetY: 0,
                    materialId,
                    axis: { start, end },
                });
            };

            // (a) FOUR CORNER COLUMNS, pit to overrun. The tall painted posts.
            const colSize = dims.frameColumnSize;
            localCorners.forEach((corner, i) => {
                pushLinear(
                    `fc${i}`,
                    'frame-column',
                    { x: corner.x, y: shaftBaseOffset, z: corner.z },
                    { x: corner.x, y: shaftTopOffset, z: corner.z },
                    colSize,
                    colSize,
                    frameMaterialId,
                );
            });

            // (b) A RING BEAM PER SIDE AT EVERY SERVED STOREY, PLUS THE HEAD.
            //     Four beams per ring; the ring elevations come from the SERVED
            //     LEVELS, so inserting a storey adds a ring and a skipped storey does
            //     not get one — the same property `servedLevelIds` buys for the doors.
            const ringYs: number[] = [
                ...sorted.map((l) => l.elevation - datumY),
                shaftTopOffset,
            ];
            ringYs.forEach((ringY, ri) => {
                for (let side = 0; side < localCorners.length; side++) {
                    const a = localCorners[side]!;
                    const b = localCorners[(side + 1) % localCorners.length]!;
                    pushLinear(
                        `fb${ri}s${side}`,
                        'frame-ring-beam',
                        { x: a.x, y: ringY, z: a.z },
                        { x: b.x, y: ringY, z: b.z },
                        dims.frameBeamWidth,
                        dims.frameBeamDepth,
                        frameMaterialId,
                    );
                }
            });

            // (c) CROSS-BRACING IN THE TOP BAY — the machine / overrun zone.
            //     THE LANDING FACE (side 0) IS LEFT CLEAR, deliberately. A diagonal
            //     across the face the doors are in is a brace through the door head
            //     at the top landing; observation lifts brace the three blind faces
            //     for exactly that reason. This is the same "side 0 is special" fact
            //     the enclosure already encodes, read once rather than restated.
            const braceBottom = highest - datumY;
            const braceTop = shaftTopOffset;
            for (let side = 1; side < localCorners.length; side++) {
                const a = localCorners[side]!;
                const b = localCorners[(side + 1) % localCorners.length]!;
                pushLinear(
                    `bx${side}a`,
                    'frame-brace',
                    { x: a.x, y: braceBottom, z: a.z },
                    { x: b.x, y: braceTop, z: b.z },
                    dims.frameBraceSize,
                    dims.frameBraceSize,
                    frameMaterialId,
                );
                pushLinear(
                    `bx${side}b`,
                    'frame-brace',
                    { x: b.x, y: braceBottom, z: b.z },
                    { x: a.x, y: braceTop, z: a.z },
                    dims.frameBraceSize,
                    dims.frameBraceSize,
                    frameMaterialId,
                );
            }

            // (d) TWO CAR GUIDE RAILS, full height, on the two faces the car is
            //     guided from — the ones PERPENDICULAR to the landing face, because
            //     the door is on the landing face and a rail cannot cross it. Inset
            //     clear of the enclosure so they read as being inside the shaft.
            const railInset = dims.shaftWallThickness + dims.guideRailDepth / 2;
            const railX = Math.max(0.02, hw - railInset);
            const railTags: ReadonlyArray<readonly [string, number]> = [
                ['gr0', -1],
                ['gr1', 1],
            ];
            for (const [tag, sx] of railTags) {
                pushLinear(
                    tag,
                    'guide-rail',
                    { x: sx * railX, y: shaftBaseOffset, z: 0 },
                    { x: sx * railX, y: shaftTopOffset, z: 0 },
                    dims.guideRailDepth,
                    dims.guideRailWidth,
                    railMaterialId,
                );
            }

            const childrenIds = [
                ...enclosure.map((e) => e.id),
                ...landingDoors.map((d) => d.id),
                ...cabinParts.map((c) => c.id),
                // THE FRAME IS OWNED, SO IT IS REAPED. C104 section 8: `lift.delete`
                // removes exactly `childrenIds`, so a member absent from this list is
                // an ORPHAN that outlives its parent — the stair-void defect that
                // section 8 calls its own unflattering precedent, with a steel tower
                // left standing instead of a hole left punched.
                ...shaftParts.map((p) => p.id),
            ];

            span.setAttribute('pryzm.lift.servedLevels', sorted.length);
            span.setAttribute('pryzm.lift.landingDoors', landingDoors.length);
            span.setAttribute('pryzm.lift.slabVoids', slabVoids.length);
            span.setAttribute('pryzm.lift.shaftHeight', shaftHeight);
            span.setAttribute('pryzm.lift.enclosureType', lift.enclosureType);

            span.setAttribute('pryzm.lift.shaftParts', shaftParts.length);

            return {
                dims,
                shaftBaseY,
                shaftTopY,
                shaftHeight,
                enclosure,
                landingSideId: landingSide.id,
                landingDoors,
                cabinParts,
                shaftParts,
                carParkOffsetY,
                shaftBaseOffset,
                slabVoids,
                childrenIds,
            };
        } finally {
            span.end();
        }
    });
}
