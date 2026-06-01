// C26 REV-α-1 (Revit Round-Trip) — L0 RevitProjectMetadata substrate.
//
// Captures the project-level Revit metadata that Revit-API-aware tooling
// (the optional external Python adapter per C26 §1.2 / §6) needs in order
// to round-trip an IFC4X3-RV file back into a Revit-flavoured data model
// without re-discovering the project base point, survey point, discipline,
// and active phase filter.
//
// Coordinates here are intentionally untyped (raw numbers in project
// units).  The variant exporter (later RVT-α-2 slice) applies the unit
// scale and the LTP/ENU rotation; this L0 schema is a pure data envelope.
//
// L0-pure: Zod only.  No I/O, no THREE, no DOM, no `@pryzm/*` non-schema
// imports.
//
// References:
//   - C26-REVIT-ROUND-TRIP.md §1.1 (IFC4 as canonical bridge),
//     §6.2 (adapter contract surface) + §6.3 (adapter lifecycle).

import { z } from 'zod';

/**
 * Discipline of the export, mapped to Revit's discipline enumeration.
 *
 * `COORDINATION` is the Revit "coordination" view discipline used by
 * mixed-discipline central files.
 */
export const RevitDisciplineSchema = z.enum([
    'ARCHITECTURAL',
    'STRUCTURAL',
    'MECHANICAL',
    'ELECTRICAL',
    'PLUMBING',
    'COORDINATION',
]);
export type RevitDiscipline = z.infer<typeof RevitDisciplineSchema>;

/**
 * Revit Project Base Point.  Optional `angleToTrueNorth` (radians) so the
 * adapter can recover Revit's true-north rotation independently from the
 * model rotation.
 */
export const RevitProjectBasePointSchema = z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
    angleToTrueNorth: z.number().optional(),
});
export type RevitProjectBasePoint = z.infer<typeof RevitProjectBasePointSchema>;

/**
 * Revit Survey Point.
 */
export const RevitSurveyPointSchema = z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
});
export type RevitSurveyPoint = z.infer<typeof RevitSurveyPointSchema>;

/**
 * Project-level Revit metadata sidecar.  All fields are optional — an
 * empty object is the no-Revit-context default.
 *
 *   - `revitVersion`               e.g. `"2025.1"`, `"2024.2"`.
 *   - `sharedCoordinatesAcquired`  whether the source model has acquired
 *                                  shared coordinates from a host.
 *   - `projectBasePoint`           Revit Project Base Point.
 *   - `surveyPoint`                Revit Survey Point.
 *   - `discipline`                 one of the 6 Revit disciplines.
 *   - `phaseFilter`                Revit phase filter name,
 *                                  e.g. `"Show Complete"`, `"New Construction"`.
 */
export const RevitProjectMetadataSchema = z.object({
    revitVersion: z.string().optional(),
    sharedCoordinatesAcquired: z.boolean().optional(),
    projectBasePoint: RevitProjectBasePointSchema.optional(),
    surveyPoint: RevitSurveyPointSchema.optional(),
    discipline: RevitDisciplineSchema.optional(),
    phaseFilter: z.string().optional(),
});
export type RevitProjectMetadata = z.infer<typeof RevitProjectMetadataSchema>;
