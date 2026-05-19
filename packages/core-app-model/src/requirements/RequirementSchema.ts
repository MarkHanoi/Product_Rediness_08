/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Semantic Model / Store validation gate
 * File:             src/core/requirements/RequirementSchema.ts
 * Contract:         01-BIM-ENGINE-CORE-CONTRACT §3.1–§3.3
 *
 * P9-W6 (2026-05-10) — lifted to packages/core-app-model/src/requirements/.
 * Only imports `zod` (already a package dependency).
 *
 * Zod runtime schemas for all RoomRequirement structures.
 * Applied at RequirementStore.add() and update() boundaries to reject
 * corrupt inputs before any store mutation.
 *
 * Design rules:
 *   - Mirrors RequirementTypes.ts exactly — no divergence.
 *   - All section schemas exported for pre-validation in command layer.
 *   - .passthrough() on add schema preserves forward-compat fields.
 */

import { z } from 'zod';

// ── Spatial ───────────────────────────────────────────────────────────────────

export const SpatialRequirementsSchema = z.object({
  targetArea_m2:     z.number().positive({ message: 'targetArea_m2 must be > 0' }),
  areaTolerance_pct: z.number().min(0).max(100),
  clearHeight_mm:    z.number().positive(),
  aspectRatioMax:    z.number().positive().optional(),
});

// ── Physics ───────────────────────────────────────────────────────────────────

export const PhysicsRequirementsSchema = z.object({
  stc_db:           z.number().nonnegative(),
  lux_task:         z.number().nonnegative(),
  ach:              z.number().nonnegative(),
  targetTemp_c:     z.number().optional(),
  tempTolerance_c:  z.number().nonnegative().optional(),
});

// ── Finishes ──────────────────────────────────────────────────────────────────

export const FinishRequirementsSchema = z.object({
  floorFinish:       z.string().min(1),
  wallFinish:        z.string().min(1),
  ceilingType:       z.string().min(1),
  skirtingHeight_mm: z.number().nonnegative().optional(),
});

// ── Assets ────────────────────────────────────────────────────────────────────

export const AssetRequirementsSchema = z.object({
  requiredAssets:    z.array(z.string()),
  powerSockets:      z.number().int().nonnegative(),
  dataPorts:         z.number().int().nonnegative(),
  plumbingFixtures:  z.number().int().nonnegative(),
});

// ── Safety ────────────────────────────────────────────────────────────────────

export const SafetyRequirementsSchema = z.object({
  maxEgressDist_m:  z.number().positive(),
  turningCircle_mm: z.number().positive(),
  sprinklerCount:   z.number().int().nonnegative(),
  fireRating_min:   z.number().int().nonnegative().optional(),
});

// ── Parameters ────────────────────────────────────────────────────────────────

export const RequirementParametersSchema = z.object({
  spatial:  SpatialRequirementsSchema,
  physics:  PhysicsRequirementsSchema,
  finishes: FinishRequirementsSchema,
  assets:   AssetRequirementsSchema,
  safety:   SafetyRequirementsSchema,
});

// ── Metadata ──────────────────────────────────────────────────────────────────

export const RequirementMetadataSchema = z.object({
  createdAt:  z.number(),
  modifiedAt: z.number(),
  createdBy:  z.string(),
  version:    z.number().int().min(1),
});

// ── Status ────────────────────────────────────────────────────────────────────

export const RequirementStatusSchema = z.enum(['active', 'archived', 'draft']);

// ── Add gate (full schema) ────────────────────────────────────────────────────

export const RoomRequirementAddSchema = z
  .object({
    id:               z.string().uuid({ message: 'requirement.id must be a valid UUID' }),
    type:             z.literal('RoomRequirement'),
    roomId:           z.string().min(1),
    levelId:          z.string().min(1),
    name:             z.string().max(256),
    department:       z.string().optional(),
    templateId:       z.string().optional(),
    status:           RequirementStatusSchema,
    overriddenFields: z.array(z.string()),
    parameters:       RequirementParametersSchema,
    metadata:         RequirementMetadataSchema,
  })
  .passthrough();

// ── Update gate (partial schema) ─────────────────────────────────────────────

export const RoomRequirementUpdateSchema = z.object({
  name:             z.string().max(256).optional(),
  department:       z.string().optional(),
  templateId:       z.string().optional(),
  status:           RequirementStatusSchema.optional(),
  overriddenFields: z.array(z.string()).optional(),
  parameters: z
    .object({
      spatial:  SpatialRequirementsSchema.partial().optional(),
      physics:  PhysicsRequirementsSchema.partial().optional(),
      finishes: FinishRequirementsSchema.partial().optional(),
      assets:   AssetRequirementsSchema.partial().optional(),
      safety:   SafetyRequirementsSchema.partial().optional(),
    })
    .optional(),
});

// ── Error formatter ───────────────────────────────────────────────────────────

export function formatRequirementZodError(error: z.ZodError): string {
  return error.issues
    .map(issue => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}
