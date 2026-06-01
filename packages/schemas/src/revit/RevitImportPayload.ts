// C26 REV-α-1 (Revit Round-Trip) — L0 RevitImportPayload substrate.
//
// The summary the importer surfaces back to the editor after consuming a
// Revit-flavoured IFC4X3-RV file (typically from Revit's own IFC export
// or from the optional external Python adapter per C26 §6).
//
// `unmappedFamilies` captures the Revit family names that had no PRYZM
// Family mapping at import time — they survive in the model as generic
// proxies (`glb_import` / `ai_element`, per C26 §3 row 11) but UI can
// prompt the user to teach a mapping.
//
// L0-pure: Zod only.
//
// References:
//   - C26-REVIT-ROUND-TRIP.md §1.1 (IFC4 canonical bridge),
//     §3 (family translation table — generic-model fallback),
//     §7 (round-trip validation summary).

import { z } from 'zod';

/**
 * Severity of an import warning.  Mirrors the engine's tri-level
 * severity (matches `QualityRuleSeveritySchema` in `data/`).
 */
export const RevitImportWarningSeveritySchema = z.enum([
    'info',
    'warning',
    'error',
]);
export type RevitImportWarningSeverity = z.infer<
    typeof RevitImportWarningSeveritySchema
>;

/**
 * One warning row.  `elementId` is the PRYZM-side element id (when known)
 * so the UI can deep-link to the offending element.
 */
export const RevitImportWarningSchema = z.object({
    severity: RevitImportWarningSeveritySchema,
    message: z.string(),
    elementId: z.string().optional(),
});
export type RevitImportWarning = z.infer<typeof RevitImportWarningSchema>;

/**
 * Summary returned by the Revit importer.
 *
 *   - `sourceFilename`     filename of the imported IFC.
 *   - `sourceVersion`      source Revit version string, e.g. `"2025.1"`.
 *   - `importedAt`         ISO 8601 timestamp.
 *   - `elementsImported`   count of PRYZM elements created.
 *   - `psetsImported`      count of IFC property sets translated.
 *   - `familiesImported`   count of Revit families mapped to PRYZM
 *                          Families.
 *   - `warnings`           per-row warning log.
 *   - `unmappedFamilies`   Revit family names that had no PRYZM mapping.
 */
export const RevitImportPayloadSchema = z.object({
    sourceFilename: z.string().min(1),
    sourceVersion: z.string().min(1),
    importedAt: z.string().refine(
        (s) => !isNaN(Date.parse(s)),
        'importedAt must be parsable as ISO 8601',
    ),
    elementsImported: z.number().int().nonnegative(),
    psetsImported: z.number().int().nonnegative(),
    familiesImported: z.number().int().nonnegative(),
    warnings: z.array(RevitImportWarningSchema).readonly(),
    unmappedFamilies: z.array(z.string()).readonly(),
});
export type RevitImportPayload = z.infer<typeof RevitImportPayloadSchema>;
