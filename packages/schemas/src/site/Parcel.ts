// A.7.a (Phase A · Sprint 1) — Parcel schema (C19 §2.3).
//
// The legal lot outline + setbacks + zoning attributes. The polygon
// itself is immutable post-create per C19 §1.4; setbacks/FAR/zoning
// are MUTABLE via `site.updateZoning` per C19 §4.

import { z } from 'zod';
import { PtSchema } from './types.js';

/**
 * The edge classification array MUST have exactly one entry per edge of
 * the polygon (`edgeClassifications.length === polygon.length`) per
 * [C19 §2.7 cross-schema validation 3]. Front / side / rear is needed
 * for the per-edge setback compliance check (C19 §1.6).
 */
export const ParcelEdgeClassificationSchema = z.enum([
    'front',
    'side',
    'rear',
    'unclassified',
]);
export type ParcelEdgeClassification = z.infer<
    typeof ParcelEdgeClassificationSchema
>;

/**
 * The parcel boundary — closed polygon in scene-XZ metres + per-edge
 * classifications. Per [C19 §1.4] this is immutable post-create.
 */
export const ParcelBoundarySchema = z.object({
    polygon: z.array(PtSchema).default([]),
    edgeClassifications: z.array(ParcelEdgeClassificationSchema).default([]),
});
export type ParcelBoundary = z.infer<typeof ParcelBoundarySchema>;

export const ParcelSetbacksSchema = z.object({
    front: z.number().min(0).default(0),
    side: z.number().min(0).default(0),
    rear: z.number().min(0).default(0),
});
export type ParcelSetbacks = z.infer<typeof ParcelSetbacksSchema>;

export const ParcelZoningSchema = z.object({
    /** Jurisdiction-specific zone code (e.g. `'R-2'`, `'C-1'`). */
    category: z.string().min(1).nullable().default(null),
    /** Overlay codes (conservation area, flood zone, heritage). */
    overlays: z.array(z.string().min(1)).default([]),
    /** Future link to a Jurisdiction registry — out of scope C19. */
    jurisdictionRef: z.string().min(3).max(64).nullable().default(null),
});
export type ParcelZoning = z.infer<typeof ParcelZoningSchema>;

/**
 * The canonical Parcel. Per C19 §2.3 fields.
 *
 * `area` is computed (square metres of polygon) and recomputed only on
 * `site.create` per §1.4. The schema does not validate this — the L3
 * SiteModelStore enforces it.
 */
export const ParcelSchema = z.object({
    boundary: ParcelBoundarySchema.default({
        polygon: [],
        edgeClassifications: [],
    }),
    setbacks: ParcelSetbacksSchema.default({ front: 0, side: 0, rear: 0 }),
    maxFAR: z.number().min(0).nullable().default(null),
    maxHeight: z.number().min(0).nullable().default(null),
    zoning: ParcelZoningSchema.default({
        category: null,
        overlays: [],
        jurisdictionRef: null,
    }),
    /** Computed square metres of polygon; the L3 store fills this. */
    area: z.number().min(0).default(0),
});
export type Parcel = z.infer<typeof ParcelSchema>;
