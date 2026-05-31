// P0.4 slice A (Family Platform) — L0 documentation sub-schema for a
// FamilyRequest.
//
// Documents the user-supplied artefacts (PDFs, spec sheets, reference images)
// that describe the family being submitted for registration.  Downstream
// Stage-1 ingestion will parse the artefacts; this layer only models the
// STRUCTURAL reference to each asset — no I/O, no fetching, no parsing.
//
// L0-pure: Zod-only.  No I/O, no THREE, no DOM, no `@pryzm/*` imports
// outside the `@pryzm/schemas` package itself.
//
// References:
//   - APARTMENT-FAMILY-PLATFORM-AND-USER-DEFINED-ELEMENTS-2026-05-30.md §3
//     (FamilyRequest data shape — `documentation` block)
//   - §4 Stage 1 (Ingestion — consumes these refs)

import { z } from 'zod';

/**
 * A reference to an uploaded asset by URI + content type.  Pure structural
 * type — the schema layer does no I/O; the loader resolves the URI.
 *
 *   - `uri`         `file://...`, `data:...`, `https://...` (loader-dependent)
 *   - `contentType` MIME type (`application/pdf`, `image/png`, etc.)
 *   - `byteCount`   optional advisory size — the loader is the source of truth
 *   - `hash`        optional content hash (e.g. `sha256:...`) for cache-keying
 */
export const AssetRefSchema = z.object({
    uri:         z.string().min(1),
    contentType: z.string().min(1),
    byteCount:   z.number().int().nonnegative().optional(),
    hash:        z.string().optional(),
});
export type AssetRef = z.infer<typeof AssetRefSchema>;

/**
 * Aggregated documentation supplied with a FamilyRequest.  Every list
 * defaults to `[]` so a minimal request can omit the block entirely (and
 * still parse with sensible defaults applied).
 *
 *   - `pdfs`              spec PDFs, installation manuals, catalogue pages
 *   - `specSheets`        structured spec data (CSV / JSON / per-vendor sheets)
 *   - `referenceImages`   user-supplied photos / renders for AI grounding
 */
export const FamilyDocumentationSchema = z.object({
    pdfs:            z.array(AssetRefSchema).default([]),
    specSheets:      z.array(AssetRefSchema).default([]),
    referenceImages: z.array(AssetRefSchema).default([]),
});
export type FamilyDocumentation = z.infer<typeof FamilyDocumentationSchema>;
