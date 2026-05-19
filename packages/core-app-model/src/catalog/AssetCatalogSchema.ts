/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Semantic Model / Store validation gate
 * File:             src/core/catalog/AssetCatalogSchema.ts
 * Contract:         01-BIM-ENGINE-CORE-CONTRACT §3.1–§3.3
 *
 * Zod runtime schemas for all AssetCatalogEntry structures.
 * Applied at AssetCatalogStore.add() and update() boundaries to reject
 * corrupt inputs before any store mutation.
 *
 * Design rules:
 *   - Mirrors AssetCatalogTypes.ts exactly — no divergence.
 *   - All section schemas exported for pre-validation in command layer.
 *   - .passthrough() on add schema preserves forward-compat fields.
 */

import { z } from 'zod';

// ── Category ──────────────────────────────────────────────────────────────────

export const AssetCategorySchema = z.enum([
  'medical-imaging',
  'patient-care',
  'diagnostic',
  'sterilization',
  'laboratory',
  'it-infrastructure',
  'furniture',
  'hvac',
  'other',
]);

// ── Parameters ────────────────────────────────────────────────────────────────

export const AssetCatalogParametersSchema = z.object({
  name:               z.string().min(1).max(256),
  category:           AssetCategorySchema,
  width_mm:           z.number().positive({ message: 'width_mm must be > 0' }),
  depth_mm:           z.number().positive({ message: 'depth_mm must be > 0' }),
  height_mm:          z.number().positive({ message: 'height_mm must be > 0' }),
  powerDraw_kw:       z.number().nonnegative().optional(),
  weight_kg:          z.number().nonnegative().optional(),
  clearanceRadius_mm: z.number().nonnegative().optional(),
});

// ── Metadata ──────────────────────────────────────────────────────────────────

export const AssetCatalogMetadataSchema = z.object({
  createdAt:  z.number(),
  modifiedAt: z.number(),
  createdBy:  z.string(),
  version:    z.number().int().min(1),
});

// ── Add gate (full schema) ────────────────────────────────────────────────────

export const AssetCatalogEntryAddSchema = z
  .object({
    id:         z.string().uuid({ message: 'AssetCatalogEntry.id must be a valid UUID' }),
    type:       z.literal('AssetCatalogEntry'),
    levelId:    z.literal('CATALOG'),
    parameters: AssetCatalogParametersSchema,
    metadata:   AssetCatalogMetadataSchema,
  })
  .passthrough();

// ── Update gate (partial schema) ─────────────────────────────────────────────

export const AssetCatalogEntryUpdateSchema = z.object({
  parameters: AssetCatalogParametersSchema.partial().optional(),
});

// ── Error formatter ───────────────────────────────────────────────────────────

export function formatAssetCatalogZodError(error: z.ZodError): string {
  return error.issues
    .map(issue => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}
