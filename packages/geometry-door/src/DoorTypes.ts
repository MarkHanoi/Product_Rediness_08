import { z } from 'zod';
// §OUTLINE80 — imported rather than retyped (C84 §8.d): a hand-copied `z.enum([...])` here would
// be a second list to keep in agreement with `OpeningProfile.OPENING_PROFILE_KINDS`.
// §OUTLINE80-CYCLE-FIX — the pure './opening-profile' subpath, NOT the bare barrel: the barrel
// drags in WallTool.ts -> @pryzm/command-registry -> this package -> the barrel again, mid-load
// (geometry-wall/package.json's exports-note explains the family of bug this dodges).
import { OPENING_PROFILE_KINDS, type OpeningProfileKind } from '@pryzm/geometry-wall/opening-profile';

/**
 * §OUTLINE80 (D1, D12) — the `'custom'` kind's companion ring, declared on the door's runtime
 * record for the SAME reason `circular` is in the enum below despite never being offered to a
 * door (`openingProfilesFor('door')`): the vocabulary is the OPENING's, shared with windows, and
 * narrowing a family's SCHEMA rather than its offered CHOICES would mint a second vocabulary.
 * `openingProfilesFor('door')` is what actually keeps a door from ever holding one in practice —
 * D5's floor-reaching refusal in `openingProfileShapeRefusal` refuses it independently too, since
 * a door's `sillHeight` is always at the floor.
 */
const CustomOutlineVertexSchema = z.object({
    u: z.number().finite(),
    v: z.number().finite(),
});
export const CustomOutlineSchema = z.object({
    vertices: z.array(CustomOutlineVertexSchema),
});

/**
 * Finish layer schema — compatible with DoorFinishLayer in DoorSystemTypeStore.
 * Defines a named finish material applied to a door component (frame, leaf, glass).
 * Stamped onto DoorOpening at creation time from the selected DoorSystemType.
 */
export const DoorFinishLayerSchema = z.object({
    name:          z.string(),
    materialColor: z.string().default('#f2f0ed'),
    materialId:    z.string().optional(),
    description:   z.string().optional(),
});
export type DoorFinishLayerData = z.infer<typeof DoorFinishLayerSchema>;

/**
 * A single horizontal row of the door leaf, with its own column division.
 * Adopted directly from Pascal DoorNode.segments (audited as gold standard).
 */
export const DoorSegmentSchema = z.object({
    type: z.enum(['panel', 'glass', 'empty']),
    heightRatio: z.number().positive(),
    columnRatios: z.array(z.number().positive()).min(1).default([1]),
    dividerThickness: z.number().nonnegative().default(0.03),
    panelDepth: z.number().default(0.01),
    panelInset: z.number().nonnegative().default(0.04),
});
export type DoorSegment = z.infer<typeof DoorSegmentSchema>;

/**
 * Rich parametric door record stored in DoorStore.
 *
 * KEY DESIGN RULE: `id` == `Opening.elementId` in WallData.openings[].
 * `wallId` == the host wall's id in WallStore.
 * `openingId` == `Opening.id` in WallData.openings[] (the geometry key).
 *
 * OFFSET ENCODING (PLAN-09 — CENTER convention): `offset` is the absolute distance
 * in metres from baseLine[0] to the CENTRE of the opening.
 * LEFT_EDGE = offset − width/2; RIGHT_EDGE = offset + width/2.
 * Same convention as Opening.offset in WallTypes.ts. NOT a wall-local [x,y,z] tuple.
 */
export const DoorOpeningSchema = z.object({
    // Identity
    id:         z.string().min(1),   // == Opening.elementId
    openingId:  z.string().min(1),   // == Opening.id
    wallId:     z.string().min(1),

    // Geometry (mirrors Opening for bi-directional lookups)
    offset:     z.number().nonnegative(),
    width:      z.number().positive(),
    height:     z.number().positive(),
    sillHeight: z.number().nonnegative(),

    /**
     * §OPENING-PROFILE (L-1251) — the void SHAPE.
     *
     * ⛔ NOT OPTIONAL POLISH: `DoorStore.add` parses through this schema and Zod STRIPS keys it
     * does not declare, so a field written to the store and missing here survives exactly one
     * session. Absent ⇒ rectangular, so every door persisted before this loads unchanged.
     *
     * `circular` IS in the union but is never offered for a door (`openingProfilesFor('door')`) —
     * the union is the OPENING's vocabulary, shared with windows, and narrowing it per family
     * here would mint a second vocabulary, which is the defect this axis was designed to avoid.
     *
     * §OUTLINE80 (D1) — `'custom'` joins the union for the identical reason. `openingProfilesFor
     * ('door')` still never offers it (D12), and D5's floor-reaching refusal in
     * `openingProfileShapeRefusal` refuses a `'custom'` opening at a floor-level sill independently
     * — a door's sill is always at the floor, so this is doubly closed, not merely declared shut.
     */
    openingProfile: z.enum(
        OPENING_PROFILE_KINDS as unknown as [OpeningProfileKind, ...OpeningProfileKind[]],
        { message: `openingProfile must be one of: ${OPENING_PROFILE_KINDS.join(', ')}` },
    ).optional(),

    /**
     * §OUTLINE80 (D1) — the companion carrier of `openingProfile === 'custom'`. Declared here so
     * Zod does not silently strip a ring on a malformed/legacy record; D12 means no live authoring
     * surface ever WRITES this on a door, so in practice it is always absent.
     */
    customOutline: CustomOutlineSchema.optional(),

    // Frame
    frameThickness: z.number().positive().default(0.05),
    frameDepth:     z.number().positive().default(0.07),
    frameColor:     z.string().default('#f2f0ed'),

    // Leaf
    leafThickness:    z.number().positive().default(0.04),
    leafColor:        z.string().default('#f2f0ed'),
    leafVisibleInPlan: z.boolean().default(false),
    hingesSide:       z.enum(['left', 'right']).default('left'),
    swingDirection:   z.enum(['inward', 'outward']).default('inward'),
    segments: z.array(DoorSegmentSchema).min(1).default([
        { type: 'panel', heightRatio: 0.4, columnRatios: [1], dividerThickness: 0.03, panelDepth: 0.01, panelInset: 0.04 },
        { type: 'panel', heightRatio: 0.6, columnRatios: [1], dividerThickness: 0.03, panelDepth: 0.01, panelInset: 0.04 },
    ]),
    contentPadding: z.tuple([z.number(), z.number()]).default([0.04, 0.04]),

    // Handle
    handle:       z.boolean().default(true),
    handleHeight: z.number().positive().default(1.05),
    handleSide:   z.enum(['left', 'right']).default('right'),

    // Threshold
    threshold:       z.boolean().default(true),
    thresholdHeight: z.number().nonnegative().default(0.02),

    // IFC / BIM fields
    doorType:          z.enum(['single', 'double']).default('single'),
    fireRating:        z.string().optional(),
    accessibilityType: z.string().optional(),

    // DW-12 FIX: Persistent mark stored on the element instance.
    // Format: D-<NNN> (e.g. "D-001", "D-002").
    // Auto-generated by CreateWallOpeningCommand at placement time.
    // Editable by the user via the property panel markInput.
    mark: z.string().optional(),

    // Finish — structured finish layers stamped from DoorSystemType at creation time.
    // These are the primary BIM finish records; frameColor / leafColor are derived
    // from these for the 3-D renderer (backward-compatible render fields preserved).
    frameFinish: DoorFinishLayerSchema.optional(),
    leafFinish:  DoorFinishLayerSchema.optional(),

    // Derived finish material name for room finish schedules (auto-set from leafFinish.name)
    finishMaterial:    z.string().optional(),

    // Type system — reference to the DoorSystemType that generated this door's finish defaults
    systemTypeId:      z.string().optional(),
}).superRefine((val, ctx) => {
    // §OUTLINE80 (D1) — the same "one axis, one carrier" rule the host and window schemas
    // enforce. In practice this never fires for a door in the field (D12), but the schema does
    // not rely on that being true elsewhere to stay internally consistent.
    const isCustom = val.openingProfile === 'custom';
    if (isCustom && !val.customOutline) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "customOutline is required when openingProfile is 'custom'",
            path: ['customOutline'],
        });
    }
    if (!isCustom && val.customOutline !== undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "customOutline must be absent unless openingProfile is 'custom'",
            path: ['customOutline'],
        });
    }
});

export type DoorOpening = z.infer<typeof DoorOpeningSchema>;
