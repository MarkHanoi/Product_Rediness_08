// A.7.a (Phase A · Sprint 1) — ProvenanceRecord schema (C19 §2.6).
//
// Shared between `SiteModel.provenance` and `ContextBuilding.provenance`.
// Forward-compatible with [C23 Provenance & AI Audit].

import { z } from 'zod';

/**
 * Where this site / context-building came from. Per C19 §2.3 + §2.6:
 * `'auto-promoted'` for legacy auto-promotion path; `'user-authored'`
 * when the user drew the polygon manually; `'cesium-ion'` / `'osm'` /
 * `'msft-footprints'` for ingest paths; `'ifc-import'` for IFC4X3
 * IfcSite imports; `'survey'` for surveyor uploads; `'ai'` for
 * AI-generated context buildings (Phase D massing-AI).
 */
export const ProvenanceSourceSchema = z.enum([
    'auto-promoted',
    'user-authored',
    'cesium-ion',
    'osm',
    'msft-footprints',
    'ifc-import',
    'survey',
    'ai',
]);
export type ProvenanceSource = z.infer<typeof ProvenanceSourceSchema>;

/**
 * Per C19 §2.6 fields.
 *
 * `actor`: 'system' for system-initiated paths (auto-promotion, ingest);
 *          userId-shaped string for user-initiated paths. C13 actor model.
 */
export const ProvenanceRecordSchema = z.object({
    source: ProvenanceSourceSchema.default('auto-promoted'),
    sourceVersion: z.string().min(1).nullable().default(null),
    /** UTC ISO-8601 timestamp; the L3 store fills this with `new Date().toISOString()`. */
    ingestTimestamp: z.string().datetime().default(() => new Date().toISOString()),
    /** SPDX-id or free-form licence string. */
    license: z.string().min(1).nullable().default(null),
    /** `'system'` for system-initiated; userId-shaped string otherwise. */
    actor: z.string().min(1).default('system'),
});
export type ProvenanceRecord = z.infer<typeof ProvenanceRecordSchema>;
