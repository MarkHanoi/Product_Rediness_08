// C26 REV-α-1 (Revit Round-Trip) — L0 RevitExportOptions substrate.
//
// The full options envelope the variant exporter (RVT-α-2 slice)
// consumes when it produces an IFC4X3-RV file.  Per C26 §1.1 the
// variant is PINNED to `'IFC4X3-RV'`; the schema enforces that
// invariant at L0.
//
// The three coordinate modes correspond to Revit's standard export
// origins: project base point, survey point, internal origin.  Default
// is `'project-base-point'` to match Revit's own IFC export default.
//
// L0-pure: Zod only.  No I/O, no THREE, no DOM, no `@pryzm/*` non-schema
// imports.
//
// References:
//   - C26-REVIT-ROUND-TRIP.md §1.1 (IFC4 / IFC4X3-RV as canonical),
//     §2 (mapping schemas table),
//     §5 (levels + views + sheets),
//     §6.2 (adapter contract surface).

import { z } from 'zod';
import { RevitProjectMetadataSchema } from './RevitProjectMetadata.js';
import { RevitFamilyMappingSchema } from './RevitFamilyMapping.js';
import { RevitWorksetSchema } from './RevitWorkset.js';

/**
 * The variant tag the exporter MUST emit.  Pinned to `'IFC4X3-RV'`
 * (Revit-specific IFC4X3 Reference View) per C26 §1.1.  Anything else
 * is a contract violation and rejected at the schema layer.
 */
export const RevitExportVariantSchema = z.literal('IFC4X3-RV');
export type RevitExportVariant = z.infer<typeof RevitExportVariantSchema>;

/**
 * Coordinate mode for the export.  Matches Revit's standard origin
 * choices:
 *
 *   - `project-base-point`   Revit Project Base Point (default).
 *   - `survey-point`         Revit Survey Point (shared-coordinates use).
 *   - `internal-origin`      Revit's internal origin (unscaled, unrotated).
 */
export const RevitCoordinateModeSchema = z.enum([
    'project-base-point',
    'survey-point',
    'internal-origin',
]);
export type RevitCoordinateMode = z.infer<typeof RevitCoordinateModeSchema>;

/**
 * Revit-flavoured IFC4X3-RV export options.
 *
 *   - `variant`                   pinned literal `'IFC4X3-RV'`.
 *   - `targetVersion`             target Revit version, e.g. `"2025.1"`.
 *   - `includeRevitGuidPsets`     when `true` the exporter writes the
 *                                 `Pset_RevitType` / `Pset_RevitInstance`
 *                                 property sets so a Revit round-trip
 *                                 can recover the original element ids.
 *   - `projectMetadata`           optional project-metadata sidecar.
 *   - `familyMappings`            optional family translation rows.
 *   - `worksets`                  optional workset sidecar.
 *   - `includeRoomNumbers`        when `true` rooms get a Revit
 *                                 `"Room Number"` parameter.  Default `true`.
 *   - `includeLevelElevations`    when `true` `IfcBuildingStorey.Elevation`
 *                                 is populated.  Default `true`.
 *   - `coordinateMode`            export origin.  Default `'project-base-point'`.
 */
export const RevitExportOptionsSchema = z.object({
    variant: RevitExportVariantSchema,
    targetVersion: z.string().min(1),
    includeRevitGuidPsets: z.boolean(),
    projectMetadata: RevitProjectMetadataSchema.optional(),
    familyMappings: z.array(RevitFamilyMappingSchema).optional(),
    worksets: z.array(RevitWorksetSchema).optional(),
    includeRoomNumbers: z.boolean().optional(),
    includeLevelElevations: z.boolean().optional(),
    coordinateMode: RevitCoordinateModeSchema.optional(),
});
export type RevitExportOptions = z.infer<typeof RevitExportOptionsSchema>;
