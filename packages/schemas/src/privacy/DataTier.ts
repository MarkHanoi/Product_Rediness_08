// A.30.a (Phase A · Sprint 2) — DataTier enum (C22 §2.1).
//
// The 4 classification tiers every piece of durable data MUST carry per
// [C22 §1.1] "tier-tag-at-write". The enum is CLOSED — adding a new tier
// requires an ADR.
//
// L0-pure: Zod only.

import { z } from 'zod';

/**
 * Data tier per [C22 §2.1]:
 *
 *   - 'pii'        — personally-identifiable (email, name, address, IP,
 *                    payment refs). Region-locked. Platform-key only
 *                    (BYOK forbidden — see [C22 §1.4]). DSAR-accessible.
 *   - 'project'    — customer-authored project data (geometry, element
 *                    properties, comments). Region-locked. BYOK
 *                    available. Customer-deletable.
 *   - 'telemetry'  — anonymised usage + perf metrics. Cross-region
 *                    aggregation allowed. Never receives raw PII.
 *   - 'derived'    — generated artefacts (layouts, exports, summaries)
 *                    whose source was PROJECT data. Inherits PROJECT
 *                    region. Anonymised on read where required.
 */
export const DataTierSchema = z.enum([
    'pii',
    'project',
    'telemetry',
    'derived',
]);
export type DataTier = z.infer<typeof DataTierSchema>;

/**
 * Region preference per [C22 §1.3]. Every customer record carries one
 * of these; PII + PROJECT writes MUST honour it.
 */
export const RegionSchema = z.enum(['eu', 'us', 'ap', 'self-hosted']);
export type Region = z.infer<typeof RegionSchema>;
