import { z } from 'zod';

/**
 * Finish layer schema — compatible with WindowFinishLayer in WindowSystemTypeStore.
 * Defines a named finish material applied to a window component (frame, sill, glass).
 * Stamped onto WindowOpening at creation time from the selected WindowSystemType.
 */
export const WindowFinishLayerSchema = z.object({
    name:          z.string(),
    materialColor: z.string().default('#e8e8e8'),
    materialId:    z.string().optional(),
    description:   z.string().optional(),
});
export type WindowFinishLayerData = z.infer<typeof WindowFinishLayerSchema>;

/**
 * Rich parametric window record stored in WindowStore.
 *
 * KEY DESIGN RULE: `id` == `Opening.elementId` in WallData.openings[].
 * OFFSET ENCODING (PLAN-09 — CENTER convention): `offset` is the absolute distance
 * in metres from baseLine[0] to the CENTRE of the opening.
 * LEFT_EDGE = offset − width/2; RIGHT_EDGE = offset + width/2.
 * Same convention as DoorTypes.ts and Opening.offset in WallTypes.ts.
 */
export const WindowOpeningSchema = z.object({
    // Identity
    id:        z.string().min(1),   // == Opening.elementId
    openingId: z.string().min(1),   // == Opening.id
    wallId:    z.string().min(1),

    // Geometry
    offset:     z.number().nonnegative(),
    width:      z.number().positive(),
    height:     z.number().positive(),
    sillHeight: z.number().nonnegative(),

    /**
     * §OPENING-PROFILE (L-1250) — the void SHAPE.
     *
     * ⛔ **THIS FIELD IS NOT OPTIONAL POLISH — WITHOUT IT THE PROFILE IS DELETED ON EVERY LOAD.**
     * `WindowStore.add` does `Object.freeze({ ...WindowOpeningSchema.safeParse(w).data })`, and
     * Zod STRIPS keys the schema does not declare. A field written to the store and absent here
     * survives exactly as long as the session. That is the same save/load hole three other
     * subsystems hit in one week, found here BEFORE the field shipped rather than after.
     *
     * Absent ⇒ rectangular, so every window persisted before this loads unchanged.
     */
    openingProfile: z.enum(['rectangular', 'round-arch', 'segmental-arch', 'circular']).optional(),

    // Frame
    frameThickness: z.number().positive().default(0.05),
    frameDepth:     z.number().positive().default(0.07),
    frameColor:     z.string().default('#e8e8e8'),

    /**
     * ⭐ §FEAT-WINDOW-REVEAL (L-1920 … L-1929) — THE REVEAL AXIS, on the RUNTIME record.
     *
     * ⛔ **THESE FIVE KEYS ARE NOT OPTIONAL POLISH — WITHOUT THEM THE REVEAL IS DELETED
     * ON EVERY LOAD.** The `openingProfile` warning forty lines above states the rule and
     * it applies verbatim: `WindowStore.add` does
     * `Object.freeze({ ...WindowOpeningSchema.safeParse(w).data })`, and **Zod STRIPS keys
     * the schema does not declare.** A field the panel writes and this schema does not name
     * survives exactly as long as the session. Declared here BEFORE the feature ships,
     * which is the whole lesson of that comment.
     *
     * The L0 twin is `packages/schemas/src/elements/Window.ts` and carries the full
     * reasoning; the MODEL is `WindowReveal.ts` and is the only place these are
     * interpreted. Three files, one meaning — the record does not re-derive geometry and
     * the geometry does not invent a field.
     *
     * `revealProjection` is SIGNED (positive = out past the wall's authored EXTERIOR face;
     * negative = recessed), so it is deliberately not `.positive()` like its neighbours.
     * The four angles are DEGREES per side, in construction vocabulary.
     *
     * Every default is 0 ⇒ every window persisted before today parses to "no reveal
     * authored", `isRevealAuthored()` returns false, and `WindowBuilder` /
     * `WindowPlanSymbolBuilder` take their existing code paths untouched.
     */
    /**
     * ⭐ §FEAT-REVEAL-DIRECTION (L-3410 … L-3416, founder 2026-08-22) — WHICH FACE the
     * reveal runs from.
     *
     * *"the reveal projection and splay are applied to the WRONG SIDE — both currently
     * modify the INDOOR face … I want an explicit direction option (Indoor / Outdoor) in
     * the Properties panel AND via RAC, modelled on the door's Swing: Inward | Outward."*
     *
     * ⛔ **IT IS AUTHORED, NOT INFERRED, AND THAT IS A MEASUREMENT NOT A PREFERENCE.**
     * PRYZM cannot currently tell which face of a wall looks outdoors. The slot for that
     * fact EXISTS — `WallData.frontSide` / `backSide`, vocabulary
     * `interior | exterior | unknown`, declared in THREE schemas — and
     * `grep -rnE "(frontSide|backSide)\s*[:=]"` over `packages/ plugins/ apps/ src/
     * server/` returns **ZERO writers**. So the capability is UNREACHABLE, never MISSING
     * (C01 §6 rule 6), and `WallSideFinishResolver` already REFUSES to guess it in prose:
     * *"nothing in this build ever sets them — so I will not guess"*. A default resolved
     * from a datum nothing writes would be a guess wearing a resolver's name.
     *
     * ⚠ The door's `swingDirection: 'inward' | 'outward'` — the prior art the founder
     * named — is likewise **purely authored**; there is no inward/outward resolver to
     * reuse. Measured, so the next reader does not go looking for one.
     *
     * Absent ⇒ `'outdoor'`, which is the founder's intent, so no persisted window needs
     * migrating and no load path invents a value.
     */
    revealDirection:       z.enum(['outdoor', 'indoor']).default('outdoor'),
    revealProjection:      z.number().default(0),
    revealSplayHead:       z.number().min(0).max(85).default(0),
    revealSplaySill:       z.number().min(0).max(85).default(0),
    revealSplayJambLeft:   z.number().min(0).max(85).default(0),
    revealSplayJambRight:  z.number().min(0).max(85).default(0),

    // §FEAT-WINDOW-PLAN-SYMBOL-SOUND (L-254) — the two dimensions an LOD-300 plan
    // symbol needs and the record did not carry. OPTIONAL (no default) so existing
    // persisted windows are untouched: `resolveWindowDimensions()` then falls
    // through to the selected WindowSystemType's `dimensions` block, and finally to
    // DEFAULT_WINDOW_DIMENSIONS. L-127 — the symbol NEVER invents these numbers.
    /** Glazing unit thickness (m) — drawn as the thin double line in plan. */
    glazingThickness: z.number().positive().optional(),
    /** Jamb rebate / check depth (m) — the frame pocket that captures the glazing. */
    rebateDepth:      z.number().nonnegative().optional(),

    // Glazing grid — adopted from Pascal WindowNode (gold standard)
    // [0.5, 0.5] = two equal panes, [1] = single pane
    columnRatios:           z.array(z.number().positive()).min(1).default([1]),
    rowRatios:              z.array(z.number().positive()).min(1).default([1]),
    columnDividerThickness: z.number().nonnegative().default(0.03),
    rowDividerThickness:    z.number().nonnegative().default(0.03),

    // Sill
    sill:           z.boolean().default(true),
    sillDepth:      z.number().nonnegative().default(0.08),
    sillThickness:  z.number().nonnegative().default(0.03),

    // Glass
    glassOpacity: z.number().min(0).max(1).default(0.3),

    // IFC / BIM fields
    windowType: z.enum(['single', 'double']).default('single'),
    fireRating: z.string().optional(),

    // DW-12 FIX: Persistent mark stored on the element instance.
    // Format: W-<NNN> (e.g. "W-001", "W-002").
    // Auto-generated by CreateWallOpeningCommand at placement time.
    // Editable by the user via the property panel markInput.
    mark: z.string().optional(),

    // Finish — structured finish layers stamped from WindowSystemType at creation time.
    // These are the primary BIM finish records; frameColor is derived from frameFinish
    // for the 3-D renderer (backward-compatible render field preserved).
    frameFinish: WindowFinishLayerSchema.optional(),
    sillFinish:  WindowFinishLayerSchema.optional(),

    // Derived finish material name for room finish schedules (auto-set from frameFinish.name)
    finishMaterial: z.string().optional(),

    // Type system — reference to the WindowSystemType that generated this window's finish defaults
    systemTypeId:   z.string().optional(),
});

export type WindowOpening = z.infer<typeof WindowOpeningSchema>;
