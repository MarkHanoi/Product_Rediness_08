import { z } from 'zod';
import { SteelProfileLibrary } from '@pryzm/plugin-structural';

const xYZPoint = z.object({ x: z.number(), y: z.number(), z: z.number() });
const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const ColumnDataSchema = z
    .object({
        id: z.string().min(1, { message: 'ColumnData.id must not be empty' }),
        type: z.literal('column'),
        levelId: z.string().min(1, { message: 'ColumnData.levelId must not be empty' }),
        parentId: z.string().optional(),
        position: xYZPoint,
        height: z.number().positive({ message: 'ColumnData.height must be > 0' }),
        rotation: z.number(),
        profile: z.enum(['rectangular', 'circular', 'UC', 'UB']),
        width: z.number().positive({ message: 'ColumnData.width must be > 0' }),
        depth: z.number().positive({ message: 'ColumnData.depth must be > 0' }),
        baseOffset: z.number(),
        materialId: z.string().optional(),
        materialColor: z
            .string()
            .regex(HEX_COLOR, { message: 'ColumnData.materialColor must be a CSS hex (#RGB or #RRGGBB)' })
            .optional(),
        steelProfileName: z.string().optional(),
        properties: z.record(z.string(), z.any()).optional(),
        ifcData: z
            .object({ guid: z.string(), ifcClass: z.string() })
            .partial({ ifcClass: true })
            .passthrough()
            .optional(),
    })
    .passthrough()
    .superRefine((data, ctx) => {
        if (data.profile === 'UC' || data.profile === 'UB') {
            if (!data.steelProfileName) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "ColumnData.steelProfileName is required when profile is 'UC' or 'UB'.",
                    path: ['steelProfileName'],
                });
            } else {
                const p = SteelProfileLibrary.get(data.steelProfileName);
                if (!p) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `ColumnData.steelProfileName "${data.steelProfileName}" not found in SteelProfileLibrary.`,
                        path: ['steelProfileName'],
                    });
                }
            }
        }
    });

export type ColumnDataValidated = z.infer<typeof ColumnDataSchema>;

export function validateColumnData(data: unknown): ColumnDataValidated {
    return ColumnDataSchema.parse(data);
}
