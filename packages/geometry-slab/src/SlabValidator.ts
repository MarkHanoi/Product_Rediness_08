import { z } from 'zod';

/**
 * SlabValidator
 *
 * Runtime validation schema for SlabData.
 * Called at the SlabStore.add() boundary — not inside commands.
 *
 * Mirrors the contract-required shape from 01-SLAB-DATA-MODEL-CONTRACT.md.
 * Only validates fields required for correct geometry and spatial registration.
 * Optional fields are permitted to be absent so that existing serialised projects
 * remain loadable without a migration pass.
 *
 * §01 §3.5 compliance: pure function — no store reads, no window access.
 */

const xYPoint = z.object({ x: z.number(), y: z.number() });

export const SlabDataSchema = z.object({
    id:         z.string().min(1, { message: 'SlabData.id must not be empty' }),
    type:       z.literal('slab'),
    levelId:    z.string().min(1, { message: 'SlabData.levelId must not be empty' }),
    thickness:  z.number().positive({ message: 'SlabData.thickness must be > 0' }),
    position:   z.object({
        x: z.number(),
        y: z.literal(0),   // §01 §1.2 + §02 §1.2: position.y MUST be 0 — world Y is resolved at projection time from BimManager
        z: z.number(),
    }),
    polygon:    z.array(xYPoint).min(3).optional(),
    holes:      z.array(z.array(xYPoint).min(3)).optional(),
    layers:     z.array(z.object({
        // §01 §3 FIX-1 (C-SCHEMA): `id` removed — SlabLayer interface has no `id` field.
        // Layers are positional (ordered top-to-bottom); identity is by array index.
        // Adding `id: z.string()` here caused ZodError on every layered-slab SlabStore.add() call.
        name:          z.string(),
        // M3 §SLAB-SYSTEM-AUDIT-2026: Tighten `function` from z.string() to the
        // closed SlabLayerFunction enum so invalid layer functions are caught at the
        // store boundary rather than silently passing into geometry / scheduling.
        function: z.enum([
            'finish-surface',
            'screed',
            'insulation',
            'structure',
            'substrate',
            'waterproofing',
        ]),
        thickness:     z.number().positive(),
        // M4 §SLAB-SYSTEM-AUDIT-2026: Validate materialColor as a CSS hex colour
        // (#RGB or #RRGGBB) so that non-colour strings do not silently reach THREE.
        materialColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
    })).optional(),
    width:         z.number().optional(),
    depth:         z.number().optional(),
    baseOffset:    z.number().optional(),
    // M4 §SLAB-SYSTEM-AUDIT-2026: Validate top-level materialColor as CSS hex colour.
    materialColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/).optional(),
    materialId:    z.string().optional(),
    systemTypeId:  z.string().optional(),
    sketch:        z.any().optional(),
}).superRefine((data, ctx) => {
    /**
     * FIX-10 §01 §1.2 M10: Conditional-required enforcement.
     *
     * When a slab has neither a polygon nor a sketch, it is a rectangular
     * parametric slab and MUST supply width > 0 and depth > 0 so the builder
     * can emit valid geometry. Without this guard, a slab with no polygon,
     * no sketch, and zero/absent dimensions passes schema validation and
     * silently renders as a zero-size box.
     *
     * Slabs with a polygon or sketch bypass this check — their geometry is
     * determined by the shape data, not by width/depth.
     */
    const hasPolygon = Array.isArray((data as any).polygon) && (data as any).polygon.length >= 3;
    const hasSketch  = !!(data as any).sketch;

    if (!hasPolygon && !hasSketch) {
        if (!data.width || data.width <= 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'SlabData.width > 0 is required when no polygon or sketch is provided.',
                path: ['width'],
            });
        }
        if (!data.depth || data.depth <= 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'SlabData.depth > 0 is required when no polygon or sketch is provided.',
                path: ['depth'],
            });
        }
    }
});

export type SlabDataValidated = z.infer<typeof SlabDataSchema>;

/**
 * Validates `data` against the SlabData schema.
 *
 * Throws a ZodError (with descriptive `.issues`) if validation fails.
 * Returns the parsed data on success.
 *
 * Call at SlabStore.add() — before structuredClone — so the ZodError
 * references the original source data, not a clone.
 */
export function validateSlabData(data: unknown): SlabDataValidated {
    return SlabDataSchema.parse(data);
}
