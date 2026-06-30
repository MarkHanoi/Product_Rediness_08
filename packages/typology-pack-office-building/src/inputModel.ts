// Office building — the pure, validated INPUT MODEL for the office-tower typology.
//
// The typed counterpart of the manifest's `briefSchema`: where the brief schema
// declares the UI controls, this schema declares the strongly-typed object the
// office orchestrator consumes. Pure (Zod-only, no I/O) so it is unit-testable and
// reusable by the L2 orchestrator without UI coupling.
//
// Input model:
//   { stories 1..40, floorToFloorM, radiusM, deskDensityPer1000Sqft 4..8,
//     deskMode: bench|individual, culture: open-plan-first|perimeter-offices-first,
//     plateShape: circular }

import { z } from 'zod';

export const DeskMode = z.enum(['bench', 'individual']);
export type DeskMode = z.infer<typeof DeskMode>;

export const WorkplaceCulture = z.enum(['open-plan-first', 'perimeter-offices-first']);
export type WorkplaceCulture = z.infer<typeof WorkplaceCulture>;

export const PlateShape = z.enum(['circular']);
export type PlateShape = z.infer<typeof PlateShape>;

/**
 * The office-building generation input. PURE — no I/O, no THREE, no DOM.
 */
export const OfficeBuildingInput = z.object({
    /** Storeys in the tower. */
    stories: z.number().int().min(1).max(40).default(40),
    /** Floor-to-floor height (m). */
    floorToFloorM: z.number().positive().min(3).max(6).default(4),
    /** Circular floor-plate radius (m). */
    radiusM: z.number().positive().min(10).max(45).default(22),
    /** Desks per 1000 sqft. */
    deskDensityPer1000Sqft: z.number().min(4).max(8).default(6),
    /** Bench vs individual workstations. */
    deskMode: DeskMode.default('bench'),
    /** Workplace culture toggle. */
    culture: WorkplaceCulture.default('open-plan-first'),
    /** Plate shape (circular for the demo). */
    plateShape: PlateShape.default('circular'),
});
export type OfficeBuildingInput = z.infer<typeof OfficeBuildingInput>;

/**
 * Adapt a free-form RAC/brief `metadata` bag (keyed by the manifest briefSchema
 * field ids) into the typed `OfficeBuildingInput`. Throws (Zod) on an invalid
 * combination — the caller converts that into a C50 soft-fail.
 */
export function parseOfficeBuildingInput(
    metadata: Record<string, unknown>,
): OfficeBuildingInput {
    return OfficeBuildingInput.parse({
        ...(metadata.stories !== undefined ? { stories: metadata.stories } : {}),
        ...(metadata.floorToFloorM !== undefined ? { floorToFloorM: metadata.floorToFloorM } : {}),
        ...(metadata.radiusM !== undefined ? { radiusM: metadata.radiusM } : {}),
        ...(metadata.deskDensityPer1000Sqft !== undefined ? { deskDensityPer1000Sqft: metadata.deskDensityPer1000Sqft } : {}),
        ...(metadata.deskMode !== undefined ? { deskMode: metadata.deskMode } : {}),
        ...(metadata.culture !== undefined ? { culture: metadata.culture } : {}),
        ...(metadata.plateShape !== undefined ? { plateShape: metadata.plateShape } : {}),
    });
}
