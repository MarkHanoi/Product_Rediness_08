// A.23.a (Phase A · Sprint 2) — Building aggregate schema (C20 §2.1).
//
// Per [C20 §1.1] there is exactly ONE Building per Project today
// (multi-Building deferred to C20.1). The `ordinal` field reserves
// the slot for that future. Per [C20 §1.6] every Building belongs to
// the SAME project as its parent (cross-project leak is a §3.8
// isolation bug).
//
// Forward-link to C19: `siteId` is OPTIONAL (a Building can exist
// without a Site for ungeocoded concept-design projects, per C19's
// fallback-defaults equivalent). The C20 Building store + the C19
// SiteModelStore both hold their own copy of the relationship;
// `site.linkBuilding` (A.7.c.5) sets the inverse pointer on the Site.

import { z } from 'zod';
import { BuildingIdSchema } from './types.js';
import { ProjectIdSchema, SiteIdSchema } from '../site/types.js';

/**
 * Per [C20 §2.1] fields.
 *
 * Default `ordinal: 0` matches the C20.1-deferred "single Building"
 * semantics — every Building today sits at ordinal 0. Multi-Building
 * (future C20.1) will use positive ordinals for the inspect-tree order.
 */
export const BuildingSchema = z.object({
    id: BuildingIdSchema,
    projectId: ProjectIdSchema,
    name: z.string().min(1).max(120),
    description: z.string().max(2000).default(''),
    /** Forward reference to the C19 Site this Building stands on.
     *  Optional — concept-design projects without a real-world site
     *  do not have a Site element. The L3 BuildingStore enforces the
     *  cross-element check on read. */
    siteId: SiteIdSchema.optional(),
    /** UTC ISO 8601. Set server-side at create time. */
    createdAt: z.string().datetime(),
    /** UTC ISO 8601. Bumped on every mutation. */
    updatedAt: z.string().datetime(),
    /** Inspect-tree display ordinal among siblings. Per [C20 §2.1]
     *  always 0 in single-Building mode (today); C20.1 enables N > 1. */
    ordinal: z.number().int().min(0).default(0),
});
export type Building = z.infer<typeof BuildingSchema>;
