// LiftPart — the LOD-300 CABIN sub-elements of a lift compound system.
//
// §FEAT-LIFT-COMPOUND-SYSTEM (L-5700..L-5712) · C104 · extends C103's compound model.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHY THE CABIN PARTS ARE THEIR OWN FAMILY AND **NOT** SLABS, CEILINGS OR WALLS
// ═══════════════════════════════════════════════════════════════════════════════
// This is the same argument ADR-0124 section 4 makes for `water` not being "a slab
// with a blue material", and it is made here from measurement, not preference:
//
//  1. A CABIN PART IS NOT LEVEL-BOUND. Every one of `Slab`, `Ceiling`, `Floor` and
//     `Wall` carries a `levelId` and is positioned relative to THAT level's datum.
//     A lift car travels: its floor is at a different elevation on every storey it
//     serves, and at no storey at all while moving. There is no `levelId` that is
//     true of it. Writing one would be a lie the whole level-membership system
//     (`bimManager.registerElement`, per-level visibility, plan-view banding) then
//     believes.
//
//  2. A CABIN FLOOR IS NOT FLOOR AREA. A `slab` record lands in every floor-area
//     schedule (C28), every quantity take-off and every `IfcSlab` export. A 1.5 m^2
//     car floor counted once per storey served would inflate the gross floor area
//     of a 10-storey building by 15 m^2 of area that does not exist. That is a
//     data-integrity defect, not a cosmetic one — the identical defect the `Water`
//     header records for a blue slab.
//
//  3. THE PARTS ARE CAB-LOCAL, AND THAT IS THE WHOLE MODELLING INSIGHT. Every
//     geometry field below is expressed in CAR-LOCAL space (origin = the centre of
//     the car floor's TOP face, +Y up, +X across the door, +Z into the car). The
//     car's world placement is `LiftData.origin` + the park elevation, applied ONCE
//     by the consumer. So "move the lift" moves one number and every part follows,
//     and a part can never drift out of the car.
//
//  4. THEY ARE STILL REAL, QUERYABLE, SELECTABLE RECORDS. They live in their own
//     store, carry `parentId` (the assembly link C103 section 2 requires) and are
//     addressed by id — which is exactly what the founder's "all sub elements
//     querible and selectable" asks for. Being a distinct family is what makes them
//     queryable WITHOUT corrupting the families they are not.
//
// L0 PROMOTION IS DEFERRED, AND THE REASON IS RECORDED RATHER THAN HIDDEN (L-5711).
// `Pool` and `Water` live in `packages/schemas` (L0) and are named in `registry.ts`
// + `types/Id.ts`. `liftPart` SHOULD join them. It has not, this lane, because
// `packages/schemas/src/types/Id.ts` and `packages/schemas/src/elements/index.ts`
// both carry ANOTHER LANE'S UNCOMMITTED WORK (measured: `git status --short` shows
// both ` M` while `packages/schemas/src/elements/Balcony.ts` is still `??`).
// Read-modify-writing either file would have silently destroyed that lane's edits —
// the exact failure `[[multi-agent-shared-tree-collisions]]` records. The Zod schema
// below is therefore declared here and is a DROP-IN for promotion: it uses the same
// `z.object` shape the L0 families use, so promotion is a move plus three registry
// lines, not a rewrite.
//
// PURITY: no THREE, no DOM, no store, no id minting. Zod + arithmetic only.

import { z } from 'zod';

/**
 * The kinds of part a LOD-300 lift car decomposes into.
 *
 * This list is the founder's, verbatim — "structure, finishes wall, floor ceiling
 * etc." — with the car door added because a car door is a real, separately
 * specified, separately maintained component of a lift installation and is the one
 * part an architect is most likely to want to select on its own.
 *
 * ⚠ `cabin-door` is the door that TRAVELS WITH THE CAR. It is NOT a landing door.
 * The landing doors are one real `Door` record per served level, hosted in the
 * shaft's landing wall — see `LiftAssembly.ts` section 4 for why those are `Door`
 * records and these are not.
 */
export const LIFT_CABIN_PART_KINDS = [
    'cabin-structure',
    'cabin-wall-finish',
    'cabin-floor',
    'cabin-ceiling',
    'cabin-door',
] as const;

/**
 * The SHAFT parts — §FEAT-LIFT-OBSERVATION-FRAME (L-9400).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THESE ARE `liftPart` RECORDS AND NOT `column` / `beam` RECORDS.
 * ═══════════════════════════════════════════════════════════════════════════════
 * "Compose, do not invent" (the rule `LiftAssembly.ts` states and obeys) points at
 * `Column` and `Beam` for a steel frame, and those two families already render, so
 * the cheap answer would have been to emit them. It is the wrong answer, for a
 * reason C104 R-3 already names:
 *
 *   1. A LIFT FRAME IS NOT THE BUILDING FRAME. Every structural schedule, every
 *      load take-down, every `IfcColumn` export and the structural analysis view
 *      read the column and beam stores. A lift's corner posts are supplied, priced
 *      and installed by the LIFT CONTRACTOR as part of the lift package; counting
 *      them as building columns inflates the structural steel tonnage by members
 *      the structural engineer never designed. That is a data-integrity defect of
 *      exactly the shape `LiftPartTypes`'s own header records for a car floor
 *      counted as floor area.
 *   2. THEY ARE NOT LEVEL-BOUND EITHER. A corner column spans PIT TO OVERRUN —
 *      through every storey the shaft passes. `ColumnData` carries a `levelId` and
 *      is banded per level in plan; there is no single level that is true of it.
 *   3. `lift.delete` REAPS BY `childrenIds`. A part in the lift's own family is
 *      deleted with the lift by construction (C104 §8). Spraying members into two
 *      more stores would add two more chances to leave an orphan behind.
 *
 * They are still real, queryable, selectable, materially-specified records — which
 * is the property C104 R-3 asks the `liftPart` family to provide, and the reason
 * that family exists at all.
 */
export const LIFT_SHAFT_PART_KINDS = [
    'frame-column',
    'frame-ring-beam',
    'frame-brace',
    'guide-rail',
] as const;

export const LIFT_PART_KINDS = [
    ...LIFT_CABIN_PART_KINDS,
    ...LIFT_SHAFT_PART_KINDS,
] as const;

export const LiftPartKind = z.enum(LIFT_PART_KINDS);
export type LiftPartKind = z.infer<typeof LiftPartKind>;

/**
 * Human labels for the parts, so the inspector, the Tab drill-in readout and the
 * schedule all name a part the SAME way. One table, not three.
 */
export const LIFT_PART_LABELS: Readonly<Record<LiftPartKind, string>> = Object.freeze({
    'cabin-structure':   'Car structure',
    'cabin-wall-finish': 'Car wall finish',
    'cabin-floor':       'Car floor',
    'cabin-ceiling':     'Car ceiling',
    'cabin-door':        'Car door',
    'frame-column':      'Shaft frame column',
    'frame-ring-beam':   'Shaft ring beam',
    'frame-brace':       'Shaft cross-brace',
    'guide-rail':        'Car guide rail',
});

/**
 * The Tab drill-in ORDER. Declared here, once, so the cycle order is a property of
 * the domain rather than of whatever order a `traverse()` happened to visit meshes
 * in. `SelectionManager._buildKcUnitList` sorts the kitchen's units for exactly
 * this reason; this table is the lift's equivalent, and it is data, not a sort
 * comparator, because the order is editorial (outside-in) rather than numeric.
 */
/*
 * ⛔ DO NOT ADD THE SHAFT KINDS TO THE LIST BELOW. Its LENGTH is a contract:
 * `CreateLiftHandler.canExecute` refuses a payload whose `cabinPartIds.length`
 * does not equal it, and the plan tool pre-mints exactly that many ids (CA-2).
 * Growing it here would make every existing lift-placement gesture fail
 * validation — a five-line edit in one file breaking a tool in another, which is
 * precisely the coupling `LIFT_SHAFT_PART_KINDS` is kept separate to avoid.
 *
 * ⚠ CONSEQUENCE, STATED RATHER THAN HIDDEN: the shaft parts are therefore NOT in
 * the Tab drill-in cycle yet. They are selectable BY ID and they render; Tab walks
 * the five cabin parts only. Recorded as L-9405, OPEN.
 */
export const LIFT_PART_CYCLE_ORDER: readonly LiftPartKind[] = Object.freeze([
    'cabin-structure',
    'cabin-wall-finish',
    'cabin-floor',
    'cabin-ceiling',
    'cabin-door',
]);

/**
 * A LOD-300 lift cabin part.
 *
 * GEOMETRY IS AN AXIS-ALIGNED BOX IN CAR-LOCAL SPACE (see the header, point 3).
 * Every part of a lift car really is a box at LOD 300 — a sling, a lining panel, a
 * floor plate, a ceiling raft, a door leaf. LOD 350+ would add the guide-rail
 * brackets, the door operator and the fixings; those are explicitly OUT of scope
 * and named as such in C104 section 5, so nobody mistakes this for a fabrication model.
 */
export const LiftPartSchema = z.object({
    /** `liftpart_<26-char Crockford ULID>` — minted ONCE by the command (CA-2). */
    id: z.string().min(1),
    type: z.literal('liftPart'),
    /** The lift that OWNS this part. The C103 section 2 assembly link. */
    parentId: z.string().min(1),
    /** Denormalised for a cheap store-side query: same value as `parentId`. */
    liftId: z.string().min(1),
    kind: LiftPartKind,
    /** Extent across the car door opening (m), car-local X. */
    width: z.number().positive(),
    /** Extent into the car (m), car-local Z. */
    depth: z.number().positive(),
    /** Vertical extent (m), car-local Y. */
    height: z.number().positive(),
    /**
     * Height of this part's BOTTOM face above the car floor's top face (m).
     * The car floor itself is the datum, so its own `offsetY` is negative by
     * exactly its thickness — it hangs BELOW the surface people stand on.
     */
    offsetY: z.number(),
    materialId: z.string().optional(),
    /** Schedule mark, e.g. `LF001-CEIL`. */
    mark: z.string().optional(),

    /**
     * ⭐ §FEAT-LIFT-OBSERVATION-FRAME (L-9400) — THE LINEAR-MEMBER DISCRIMINATOR.
     *
     * ═══════════════════════════════════════════════════════════════════════════
     * PRESENT  -> this part is a LINEAR MEMBER swept along `axis`, in SHAFT-LOCAL
     *             space, and `width`/`depth` are its SECTION while `height` is its
     *             LENGTH. Columns, ring beams, cross-braces and guide rails.
     * ABSENT   -> this part is the axis-aligned CAR-LOCAL box the header describes.
     *             The five cabin parts. Unchanged, byte for byte.
     * ═══════════════════════════════════════════════════════════════════════════
     *
     * ⛔ IT IS SHAFT-LOCAL, NOT WORLD, AND THAT IS THE WHOLE REASON THE FIELD CAN
     * EXIST AT ALL. Header point 3 states the invariant this schema is built on —
     * *"the car's world placement is applied ONCE by the consumer, so 'move the
     * lift' moves one number and every part follows, and a part can never drift out
     * of the car."* Baking a WORLD placement into a frame column would break that
     * for the frame: move the lift and the glass, the doors and the car would
     * follow while the steel stayed behind, with nothing complaining, because both
     * values would be individually valid. C104 §4's derived-vs-stored rule, applied
     * to a placement instead of a dimension.
     *
     * Shaft-local space: origin = `lift.origin` projected onto the lift's LEVEL
     * DATUM, +X across the landing face, +Y up, LOCAL -Z is the landing side — the
     * SAME frame `LiftAssembly` already uses for the footprint corners, so there is
     * one convention here and not two. `y` is measured from the level datum, which
     * is the same datum `Wall.baseOffset` uses on the enclosure sides.
     *
     * A brace is a DIAGONAL, which is why this is a segment and not an offset+size:
     * an `offsetY`-and-box representation cannot express one, and inventing a
     * rotation triple to carry it would be a second placement vocabulary for the
     * same family.
     */
    axis: z
        .object({
            start: z.object({ x: z.number(), y: z.number(), z: z.number() }),
            end: z.object({ x: z.number(), y: z.number(), z: z.number() }),
        })
        .optional(),
});

/**
 * Is this part a LINEAR MEMBER (swept along `axis`) rather than a car-local box?
 *
 * ⭐ ONE PREDICATE, so the renderer, the inspector and any future quantity
 * take-off cannot disagree about which of the two geometries a part has. The
 * discriminator is the PRESENCE OF `axis`, never the `kind` — keying on `kind`
 * would mean every new kind had to be added to a switch in every consumer, and the
 * consumer that was missed would silently draw the part in the wrong space.
 */
export function isLinearLiftPart(
    part: Pick<LiftPart, 'axis'>,
): part is Pick<LiftPart, 'axis'> & { axis: NonNullable<LiftPart['axis']> } {
    return part.axis !== undefined;
}

export type LiftPart = z.infer<typeof LiftPartSchema>;

/** Store shape: `{ [liftPartId]: LiftPart }`, mirroring every other element store. */
export type LiftPartsState = Readonly<Record<string, LiftPart>>;
