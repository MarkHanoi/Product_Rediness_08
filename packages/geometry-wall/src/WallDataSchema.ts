/**
 * WallDataSchema.ts
 *
 * §STEP5 — Zod runtime validation at the WallStore.add() / WallStore.update() boundary.
 *
 * Contract mandate (PascalWins.md Area 6 / Contract §04):
 *   Every write to the wall store — especially from AI mutation paths — must be
 *   validated at runtime before semantic state is modified.  TypeScript interfaces
 *   provide compile-time safety; Zod provides the same guarantees at runtime so
 *   that untrusted inputs (deserialized JSON, AI-generated payloads) cannot corrupt
 *   the frozen store state.
 *
 * Design rules:
 *   - Schemas mirror the WallTypes.ts interfaces exactly — no divergence.
 *   - z.infer<typeof WallDataAddSchema> is structurally compatible with WallData.
 *   - THREE.Vector3 instances validated via z.instanceof().
 *   - .passthrough() on top-level schemas allows unknown fields (e.g. materialId,
 *     properties, ifcData) — Zod guards the numeric/enum/structural invariants
 *     only; extra fields pass through without error.
 *   - All schemas are exported so AI-path commands can pre-validate before calling
 *     WallStore.add() / update() (fail-fast at the command layer, not deep in geometry).
 *
 * Layer compliance: Store layer only.  No THREE scene access, no store reads.
 */

import { z } from 'zod';

// ─── §WALL-AUDIT-2026 (RESOLVED 2026-04-24): semantic invariant constants ─────

/**
 * Minimum permitted wall length, in metres. Mirrors
 * `DEFAULT_MIN_WALL_LENGTH` in `WallJoinResolver`. Walls below this length
 * are degenerate — they cannot be reliably mitered, projected, or selected,
 * and almost always indicate a degenerate user input (e.g. double-click
 * during placement) or a stale cascade. Enforced at the WallStore.add() /
 * update() boundary via the Zod refinements below.
 */
export const MIN_WALL_LEN = 0.05;

// ─── §STEP6: Wall side classification schema ───────────────────────────────────

/**
 * Valid values for WallData.frontSide / WallData.backSide.
 * Pascal Pattern Area 5 — interior/exterior side detection.
 * 'unknown' is the safe default; Topology Layer stamps the real value.
 */
export const WallSideClassificationSchema = z.enum(
    ['interior', 'exterior', 'unknown'],
    { message: 'frontSide/backSide must be "interior", "exterior", or "unknown"' }
);

// ─── Primitive helpers ─────────────────────────────────────────────────────────

/**
 * Validates a plain Point3D { x, y, z } object.
 *
 * Phase B DTO migration: replaces z.instanceof(THREE.Vector3).
 * Stores hold plain serializable Point3D DTOs; THREE.Vector3 instances are
 * constructed only inside builder files at render time.
 *
 * Accepts both freshly-written {x,y,z} literals and objects spread from
 * existing Point3D store values — JSON-safe, structuredClone-safe, and
 * Immer produceWithPatches-compatible.
 */
export const Point3DSchema = z.object({
    x: z.number().finite({ message: 'Point3D.x must be finite' }),
    y: z.number().finite({ message: 'Point3D.y must be finite' }),
    z: z.number().finite({ message: 'Point3D.z must be finite' }),
});

// ─── Opening sub-schema ────────────────────────────────────────────────────────

/**
 * Validates an Opening descriptor embedded in WallData.openings[].
 * Matches interface Opening in WallTypes.ts exactly.
 */
export const OpeningSchema = z.object({
    id:         z.string().min(1, 'opening.id is required'),
    type:       z.enum(['window', 'door'], { message: 'opening.type must be "window" or "door"' }),
    offset:     z.number().finite({ message: 'opening.offset must be finite' }),
    width:      z.number().positive({ message: 'opening.width must be > 0' }),
    height:     z.number().positive({ message: 'opening.height must be > 0' }),
    sillHeight: z.number().min(0, { message: 'opening.sillHeight must be ≥ 0' }),
    elementId:  z.string().min(1, 'opening.elementId is required'),
    doorType:   z.enum(['single', 'double']).optional(),
    windowType: z.enum(['single', 'double']).optional(),
});

export type OpeningInput = z.infer<typeof OpeningSchema>;

// ─── WallMetadata sub-schema ───────────────────────────────────────────────────

/**
 * Validates the optional metadata block (Contract §03-1.1).
 * Stamped by WallStore.add() — callers normally omit this field.
 */
export const WallMetadataSchema = z.object({
    createdAt:   z.number({ message: 'metadata.createdAt must be a Unix timestamp (ms)' }),
    modifiedAt:  z.number({ message: 'metadata.modifiedAt must be a Unix timestamp (ms)' }),
    createdBy:   z.string(),
    version:     z.number().int().min(0, { message: 'metadata.version must be a non-negative integer' }),
    tags:        z.array(z.string()).optional(),
    description: z.string().optional(),
});

// ─── WallLayer sub-schema ──────────────────────────────────────────────────────

/**
 * All valid WallLayerFunction values (Contract §03-1.3).
 * Kept as a const tuple so z.enum() picks it up correctly.
 */
const WALL_LAYER_FUNCTIONS = [
    'finish-exterior',
    'substrate',
    'insulation',
    'air-barrier',
    'structure',
    'finish-interior',
] as const;

/**
 * Validates a single WallLayer entry in WallData.layers[].
 */
export const WallLayerSchema = z.object({
    name:          z.string().min(1, 'layer.name is required'),
    function:      z.enum(WALL_LAYER_FUNCTIONS, {
        message: `layer.function must be one of: ${WALL_LAYER_FUNCTIONS.join(', ')}`,
    }),
    thickness:     z.number().positive({ message: 'layer.thickness must be > 0' }),
    materialId:    z.string().optional(),
    materialColor: z.string().optional(),
});

export type WallLayerInput = z.infer<typeof WallLayerSchema>;

// ─── WallCurve sub-schema ──────────────────────────────────────────────────────

/**
 * Validates the optional curve descriptor (Contract §03-1.2).
 * control is stored as a plain {x,y,z} object (not a Vector3) for JSON round-trip.
 */
export const WallCurveSchema = z.object({
    control: z.object({
        x: z.number().finite(),
        y: z.number().finite(),
        z: z.number().finite(),
    }, { message: 'curve.control must be a plain {x,y,z} object' }),
    segments: z.number().int().min(4, { message: 'curve.segments must be ≥ 4' }),
});

// ─── WallData add-path schema ──────────────────────────────────────────────────

/**
 * §STEP5: Full schema applied at WallStore.add() before any mutation.
 *
 * Validates every structural invariant that cannot be expressed in TypeScript
 * alone (positive numbers, non-empty strings, Vector3 instances).
 *
 * .passthrough() preserves unknown fields (materialId, properties, ifcData,
 * parentId, childrenIds, etc.) so the full WallData is forwarded unchanged
 * after validation succeeds.
 */
export const WallDataAddSchema = z
    .object({
        id:         z.string().min(1, 'wall.id is required'),
        type:       z.literal('wall', { message: 'wall.type must be "wall"' }),
        levelId:    z.string().min(1, 'wall.levelId is required'),
        baseLine:   z.tuple([Point3DSchema, Point3DSchema], {
            message: 'wall.baseLine must be a [Point3D, Point3D] tuple',
        }),
        height:    z.number().positive({ message: 'wall.height must be > 0' }),
        thickness: z.number().positive({ message: 'wall.thickness must be > 0' }),
        baseOffset: z.number().finite({ message: 'wall.baseOffset must be finite' }).optional(),
        openings:   z.array(OpeningSchema).optional(),
        childrenIds: z.array(z.string()).optional(),
        layers:     z.array(WallLayerSchema).optional(),
        curve:      WallCurveSchema.optional(),
        metadata:   WallMetadataSchema.optional(),
        // §STEP6: Interior/Exterior side classification (Pascal Pattern Area 5)
        frontSide:  WallSideClassificationSchema.optional(),
        backSide:   WallSideClassificationSchema.optional(),
    })
    .passthrough()
    // §WALL-AUDIT-2026 (RESOLVED 2026-04-24) — schema-level enforcement of the
    // implicit semantic invariants previously only checked at runtime.
    .superRefine((wall, ctx) => {
        // (1) MIN_WALL_LEN: planar baseline length must meet the join-resolver
        //     minimum so the wall is non-degenerate. Y axis is intentionally
        //     ignored because baseLine.y carries the level elevation and is
        //     not part of the wall's planar length.
        const dx = wall.baseLine[1].x - wall.baseLine[0].x;
        const dz = wall.baseLine[1].z - wall.baseLine[0].z;
        const planarLen = Math.hypot(dx, dz);
        if (planarLen < MIN_WALL_LEN) {
            ctx.addIssue({
                code: 'custom',
                path: ['baseLine'],
                message:
                    `wall.baseLine planar length ${planarLen.toFixed(4)} m is below ` +
                    `MIN_WALL_LEN=${MIN_WALL_LEN} m (degenerate wall).`,
            });
        }
        // (2) baseLine endpoint y-consistency: both endpoints must share the
        //     same elevation. A wall baseLine is a horizontal segment by
        //     contract — divergent y values indicate a stale cascade or a
        //     mis-projected drag.
        if (wall.baseLine[0].y !== wall.baseLine[1].y) {
            ctx.addIssue({
                code: 'custom',
                path: ['baseLine'],
                message:
                    `wall.baseLine endpoints have inconsistent y values ` +
                    `(${wall.baseLine[0].y} vs ${wall.baseLine[1].y}); both must equal level elevation.`,
            });
        }
        // (3) Derived-index invariant: childrenIds must be a set-superset of
        //     openings[*].elementId. The runtime check in WallStore is a
        //     belt-and-braces guard against bypass code paths; this Zod-level
        //     refinement catches the same violation at the schema boundary.
        if (wall.openings && wall.childrenIds) {
            const expected = new Set(
                wall.openings
                    .map(o => o.elementId)
                    .filter((id): id is string => typeof id === 'string' && id.length > 0)
            );
            const actual = new Set(wall.childrenIds);
            for (const id of expected) {
                if (!actual.has(id)) {
                    ctx.addIssue({
                        code: 'custom',
                        path: ['childrenIds'],
                        message:
                            `wall.childrenIds is missing opening elementId "${id}" — ` +
                            `childrenIds must be a superset of openings[*].elementId.`,
                    });
                }
            }
        }
    });

export type WallDataAddInput = z.infer<typeof WallDataAddSchema>;

// ─── WallData update-path schema ───────────────────────────────────────────────

/**
 * §STEP5: Partial schema applied at WallStore.update() before mutation.
 *
 * All fields are optional — only those present in the updates object are
 * validated.  The contract guards that have always existed in WallStore.update()
 * (levelId immutability, openings redirection) remain in place; Zod adds the
 * numeric-range and Vector3-instance checks on top.
 *
 * .passthrough() again preserves unknown optional fields.
 */
export const WallDataUpdateSchema = z
    .object({
        height:     z.number().positive({ message: 'height must be > 0' }).optional(),
        thickness:  z.number().positive({ message: 'thickness must be > 0' }).optional(),
        baseOffset: z.number().finite({ message: 'baseOffset must be finite' }).optional(),
        baseLine:   z.tuple([Point3DSchema, Point3DSchema], {
            message: 'baseLine must be a [Point3D, Point3D] tuple',
        }).optional(),
        layers:     z.array(WallLayerSchema).optional(),
        curve:      WallCurveSchema.optional(),
        metadata:   WallMetadataSchema.optional(),
        // §STEP6: Topology Layer stamps frontSide/backSide via update() after space analysis
        frontSide:  WallSideClassificationSchema.optional(),
        backSide:   WallSideClassificationSchema.optional(),
    })
    .passthrough()
    // §WALL-AUDIT-2026 (RESOLVED 2026-04-24) — same baseline invariants as the
    // add-path schema, but only triggered when the caller explicitly sets
    // `baseLine` (the field is optional in the partial-update path).
    .superRefine((updates, ctx) => {
        if (!updates.baseLine) return;
        const dx = updates.baseLine[1].x - updates.baseLine[0].x;
        const dz = updates.baseLine[1].z - updates.baseLine[0].z;
        const planarLen = Math.hypot(dx, dz);
        if (planarLen < MIN_WALL_LEN) {
            ctx.addIssue({
                code: 'custom',
                path: ['baseLine'],
                message:
                    `baseLine planar length ${planarLen.toFixed(4)} m is below ` +
                    `MIN_WALL_LEN=${MIN_WALL_LEN} m (degenerate wall update).`,
            });
        }
        if (updates.baseLine[0].y !== updates.baseLine[1].y) {
            ctx.addIssue({
                code: 'custom',
                path: ['baseLine'],
                message:
                    `baseLine endpoints have inconsistent y values ` +
                    `(${updates.baseLine[0].y} vs ${updates.baseLine[1].y}); both must equal level elevation.`,
            });
        }
    });

export type WallDataUpdateInput = z.infer<typeof WallDataUpdateSchema>;

// ─── Formatting helper ─────────────────────────────────────────────────────────

/**
 * Formats a Zod error into a concise, human-readable string for store error
 * messages.  Each issue is reported as "path.to.field: message".
 */
export function formatZodError(error: z.ZodError): string {
    return error.issues
        .map(issue => {
            const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
            return `${path}: ${issue.message}`;
        })
        .join('; ');
}
