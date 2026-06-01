// C26 REV-α-1 (Revit Round-Trip) — L0 RevitFamilyMapping substrate.
//
// Maps one PRYZM Family identity to its Revit Family + Type + Category
// triple.  This is the row-shape of the type-system mapping table that
// the variant exporter (later RVT-α-2 slice) consumes to translate PRYZM
// instances into Revit-flavoured IFC entities + Pset_RevitType /
// Pset_RevitInstance properties.
//
// Per C26 §3 the family translation table is the contract surface;
// adding a Revit-family mapping equals a PR against this schema's
// consumers (the variant exporter).
//
// L0-pure: Zod only.
//
// References:
//   - C26-REVIT-ROUND-TRIP.md §3 (family translation table),
//     §4 (parameter translation),
//     §6.2 (adapter contract surface).

import { z } from 'zod';

/**
 * One row in the Revit parameter translation table.  Maps a PRYZM
 * parameter (Data Graph / Family parameter) to its Revit counterpart by
 * name — `StorageType` is inferred at export time and lives in the
 * variant exporter, not the L0 schema.
 */
export const RevitParameterMapEntrySchema = z.object({
    pryzmParam: z.string().min(1),
    revitParam: z.string().min(1),
});
export type RevitParameterMapEntry = z.infer<typeof RevitParameterMapEntrySchema>;

/**
 * Map one PRYZM Family identity to its Revit triple
 * (Family + Type + Category) plus an optional per-parameter rename map.
 *
 *   - `pryzmFamilyId`     the PRYZM Family identity (from `family-registry/`).
 *   - `revitFamilyName`   Revit family name, e.g. `"M_Door-Single-Flush"`.
 *   - `revitTypeName`     Revit type name, e.g. `"0915 x 2134mm"`.
 *   - `revitCategory`     Revit `BuiltInCategory` string, e.g. `"OST_Doors"`.
 *   - `parameterMap`      optional per-parameter rename entries.
 */
export const RevitFamilyMappingSchema = z.object({
    pryzmFamilyId: z.string().min(1),
    revitFamilyName: z.string().min(1),
    revitTypeName: z.string().min(1),
    revitCategory: z.string().min(1),
    parameterMap: z.array(RevitParameterMapEntrySchema).readonly().optional(),
});
export type RevitFamilyMapping = z.infer<typeof RevitFamilyMappingSchema>;
