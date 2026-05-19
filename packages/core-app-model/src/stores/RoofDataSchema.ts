import { z } from 'zod';
import { RoofData, RoofType } from './RoofTypes';

export const RoofFootprintSchema = z.object({
    polygon: z.array(z.tuple([z.number(), z.number()])).min(3, {
        message: 'footprint.polygon: requires at least 3 vertices',
    }),
    centroid: z.tuple([z.number(), z.number()]),
});

export const RoofMetadataSchema = z.object({
    createdAt:   z.number(),
    modifiedAt:  z.number(),
    createdBy:   z.string(),
    version:     z.number().int().positive(),
    tags:        z.array(z.string()).optional(),
    description: z.string().optional(),
});

const ROOF_TYPES = ['flat','shed','gable','hip','dutch','gambrel','mansard','barrel','by_region'] as const;

const SlopeArrowSchema = z.object({
    edgeIndex:  z.number().int().nonnegative(),
    slope:      z.number().positive(),
    riseAtTail: z.number(),
});

const RoofSegmentSpecSchema: z.ZodType<any> = z.lazy(() =>
    z.object({
        subPolygon: RoofFootprintSchema,
        roofType:   z.enum(ROOF_TYPES),
        slope:      z.number().positive().optional(),
        overhang:   z.number().nonnegative().optional(),
        thickness:  z.number().positive().optional(),
    })
);

export const RoofDataAddSchema = z.object({
    id:             z.string().min(1, 'id: required'),
    type:           z.literal('roof'),
    levelId:        z.string().min(1, 'levelId: required'),
    footprint:      RoofFootprintSchema,
    roofType:       z.enum(ROOF_TYPES),
    slope:          z.number().positive().optional(),
    overhang:       z.number().nonnegative(),
    thickness:      z.number().positive({ message: 'thickness: must be > 0' }),
    baseOffset:     z.number(),
    autoBaseOffset: z.boolean().optional(),
    slopeArrows:    z.array(SlopeArrowSchema).optional(),
    segments:       z.array(RoofSegmentSpecSchema).optional(),
    metadata:       RoofMetadataSchema.optional(),
}).passthrough();

export type RoofDataAddInput = z.infer<typeof RoofDataAddSchema>;

export function formatZodError(error: z.ZodError): string {
    return error.issues
        .map(issue => {
            const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
            return `${path}: ${issue.message}`;
        })
        .join('; ');
}

// ──────────────────────────────────────────────────────────────────────────────
// P2.9 — Migration System
// Handles legacy RoofData documents that pre-date the footprint schema.
// Called before adding to the store when loading persisted project data.
// ──────────────────────────────────────────────────────────────────────────────

const VALID_ROOF_TYPES = new Set<string>(ROOF_TYPES);

/**
 * Migrate a legacy or partially-formed RoofData record to the current schema.
 *
 * Transformations applied:
 *   - Synthesises footprint.polygon from deprecated `width`/`depth`/`position` fields
 *   - Synthesises footprint.centroid from deprecated `position`
 *   - Maps deprecated `mode` string to `roofType`
 *   - Ensures all required numeric fields have sane defaults
 *   - Stamps version 1 metadata if absent
 *
 * Returns the migrated object (does not mutate the input).
 */
export function migrateRoofData(raw: Record<string, any>): RoofData {
    const now = Date.now();
    const out: Record<string, any> = { ...raw };

    // ── roofType ──────────────────────────────────────────────────────────────
    if (!out.roofType && out.mode) {
        const modeMap: Record<string, RoofType> = {
            RECTANGLE:    'flat',
            POLYLINE:     'flat',
            REGION:       'flat',
            SINGLE_SLOPE: 'shed',
            HIP_ROOF:     'hip',
            hip:          'hip',
            shed:         'shed',
            flat:         'flat',
            gable:        'gable',
            dutch:        'dutch',
            gambrel:      'gambrel',
            mansard:      'mansard',
            barrel:       'barrel',
            by_region:    'by_region',
        };
        out.roofType = modeMap[String(out.mode)] ?? 'flat';
    }
    if (!out.roofType || !VALID_ROOF_TYPES.has(out.roofType)) {
        out.roofType = 'flat';
    }

    // ── footprint ─────────────────────────────────────────────────────────────
    if (!out.footprint || !Array.isArray(out.footprint?.polygon) || out.footprint.polygon.length < 3) {
        // Attempt to synthesise from deprecated polygon field
        if (Array.isArray(out.polygon) && out.polygon.length >= 3) {
            const poly = out.polygon as [number, number][];
            const cx   = poly.reduce((s: number, p: [number, number]) => s + p[0], 0) / poly.length;
            const cz   = poly.reduce((s: number, p: [number, number]) => s + p[1], 0) / poly.length;
            out.footprint = { polygon: poly, centroid: [cx, cz] };
        } else if (out.width != null && out.depth != null) {
            // Synthesise from deprecated width/depth
            const px = out.position?.x ?? 0;
            const pz = out.position?.z ?? 0;
            const hw = (out.width  as number) / 2;
            const hd = (out.depth  as number) / 2;
            out.footprint = {
                polygon: [
                    [px - hw, pz - hd],
                    [px + hw, pz - hd],
                    [px + hw, pz + hd],
                    [px - hw, pz + hd],
                ],
                centroid: [px, pz],
            };
        } else {
            // Last resort: 1×1 square at origin
            out.footprint = {
                polygon:  [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]],
                centroid: [0, 0],
            };
        }
    }

    // ── numeric fields ────────────────────────────────────────────────────────
    if (typeof out.overhang   !== 'number' || isNaN(out.overhang))   out.overhang   = 0;
    if (typeof out.baseOffset !== 'number' || isNaN(out.baseOffset)) out.baseOffset = 0;
    if (typeof out.thickness  !== 'number' || isNaN(out.thickness) || out.thickness <= 0) out.thickness = 0.2;
    if (out.slope !== undefined && (typeof out.slope !== 'number' || out.slope <= 0)) delete out.slope;

    // ── metadata ──────────────────────────────────────────────────────────────
    if (!out.metadata || typeof out.metadata !== 'object') {
        out.metadata = { createdAt: now, modifiedAt: now, createdBy: 'migration', version: 1 };
    } else {
        if (!out.metadata.createdAt)  out.metadata.createdAt  = now;
        if (!out.metadata.modifiedAt) out.metadata.modifiedAt = now;
        if (!out.metadata.createdBy)  out.metadata.createdBy  = 'migration';
        if (!out.metadata.version)    out.metadata.version    = 1;
    }

    // ── required string fields ────────────────────────────────────────────────
    if (!out.id)      out.id      = `roof-migrated-${now}`;
    if (!out.type)    out.type    = 'roof';
    if (!out.levelId) out.levelId = '';
    if (!out.properties || typeof out.properties !== 'object') out.properties = {};

    return out as RoofData;
}
