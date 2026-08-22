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
    readonly slabVoids: readonly LiftSlabVoid[];
    /** Every child id the parent must own — the C103 §2 `childrenIds`. */
    readonly childrenIds: readonly string[];
}

/** Side count per type. Type A builds all four; type B keeps a solid landing side. */
export const ENCLOSURE_SIDE_COUNT = 4;

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
                const record: Record<string, unknown> = useGlass
                    ? {
                          ...base,
                          type: 'curtainwall',
                          mullionThickness: dims.shaftWallThickness / 4,
                          panelThickness: dims.shaftWallThickness / 4,
                          panels: [],
                          ...(lift.glassMaterialId ? { materialId: lift.glassMaterialId } : {}),
                      }
                    : {
                          ...base,
                          type: 'wall',
                          thickness: dims.shaftWallThickness,
                          openings: [],
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
            const landingDoors = sorted.map((lvl, i) => ({
                id: ids.landingDoorIds[i]!,
                type: 'door',
                parentId: lift.id,
                childrenIds: [] as string[],
                // The door belongs to the LEVEL IT SERVES, not to the lift's base
                // level — that is what makes it appear on that storey's plan and in
                // that storey's door schedule.
                levelId: lvl.levelId,
                wallId: landingSide.id,
                openingId: '',
                doorType: 'single' as const,
                width: dims.doorWidth,
                height: dims.doorHeight,
                sillHeight: lvl.elevation - shaftBaseY,
                // Centred on the landing side.
                offset: Math.max(0, (dims.shaftWidth - dims.doorWidth) / 2),
                // A lift landing door is a SLIDING door. Saying so is not cosmetic:
                // the swing arc is what plan-view clearance checks read, and a hinged
                // arc drawn into a lift lobby is a clash that does not exist.
                swing: 'sliding' as const,
                ...(lift.materialId ? { leafMaterialId: lift.materialId } : {}),
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
                ...(lift.materialId ? { materialId: lift.materialId } : {}),
            }));

            const childrenIds = [
                ...enclosure.map((e) => e.id),
                ...landingDoors.map((d) => d.id),
                ...cabinParts.map((c) => c.id),
            ];

            span.setAttribute('pryzm.lift.servedLevels', sorted.length);
            span.setAttribute('pryzm.lift.landingDoors', landingDoors.length);
            span.setAttribute('pryzm.lift.slabVoids', slabVoids.length);
            span.setAttribute('pryzm.lift.shaftHeight', shaftHeight);
            span.setAttribute('pryzm.lift.enclosureType', lift.enclosureType);

            return {
                dims,
                shaftBaseY,
                shaftTopY,
                shaftHeight,
                enclosure,
                landingSideId: landingSide.id,
                landingDoors,
                cabinParts,
                slabVoids,
                childrenIds,
            };
        } finally {
            span.end();
        }
    });
}
