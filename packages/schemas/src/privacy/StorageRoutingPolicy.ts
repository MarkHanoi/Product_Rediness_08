// A.30.b (Phase A · Sprint 2) — StorageRoutingPolicy schema (C22 §2.2).
//
// The per-tier routing table the `StorageRouter` (§3.2) consults at every
// durable write: which bucket / database a tier's data lands in per region,
// what encryption it must carry, how long it may live, and which downcast
// transforms out of the tier are permitted. Per [C22 §1.3] an EU-region
// customer's PII / PROJECT data MUST land in an EU endpoint — this schema is
// the L0 shape that makes that routable + auditable from the row itself.
//
// L0-pure: Zod only.

import { z } from 'zod';
import { DataTierSchema } from './DataTier.js';

/**
 * One region's storage endpoints. Both the object bucket and the database
 * handle are named (non-empty) so a write can be routed to either backing
 * store. Per [C22 §1.3] the names are region-scoped (e.g. an EU bucket lives
 * in eu-west-1).
 */
export const StorageEndpointSchema = z.object({
    bucket: z.string().min(1),
    db: z.string().min(1),
});
export type StorageEndpoint = z.infer<typeof StorageEndpointSchema>;

/**
 * Per-region endpoint set per [C22 §2.2]. `eu` / `us` / `ap` are the three
 * managed regions and are REQUIRED so every managed customer is routable;
 * `selfHosted` is optional (only set when the tier supports a customer's own
 * infrastructure — a self-hosted breach is the customer's incident, not
 * PRYZM's, mirroring `BreachRegionSchema`).
 */
export const StorageEndpointsSchema = z.object({
    eu: StorageEndpointSchema,
    us: StorageEndpointSchema,
    ap: StorageEndpointSchema,
    selfHosted: StorageEndpointSchema.optional(),
});
export type StorageEndpoints = z.infer<typeof StorageEndpointsSchema>;

/**
 * Key custody mode per [C22 §2.2]:
 *
 *   - 'platform' — PRYZM-managed keys only (KMS-backed).
 *   - 'byok'     — customer-managed key REQUIRED (bring-your-own-key).
 *   - 'either'   — platform key by default, BYOK available on request.
 */
export const KeyModeSchema = z.enum(['platform', 'byok', 'either']);
export type KeyMode = z.infer<typeof KeyModeSchema>;

/**
 * Encryption requirement per [C22 §2.2]. The at-rest cipher and in-transit
 * floor are FIXED platform-wide (a routing policy may not weaken them); only
 * the key-custody mode varies per tier (PII tends to 'byok'/'either',
 * TELEMETRY to 'platform').
 */
export const StorageEncryptionSchema = z.object({
    atRest: z.literal('aes-256-gcm'),
    inTransit: z.literal('tls-1.3-min'),
    keyMode: KeyModeSchema,
});
export type StorageEncryption = z.infer<typeof StorageEncryptionSchema>;

/**
 * One permitted downcast OUT of the governing tier per [C22 §2.1] — e.g. PII
 * → DERIVED via the `anonymise` transform. `to` is the destination tier and
 * `transformId` names the registered transform that performs the downcast.
 */
export const AllowedDowncastSchema = z.object({
    to: DataTierSchema,
    transformId: z.string().min(1),
});
export type AllowedDowncast = z.infer<typeof AllowedDowncastSchema>;

/**
 * One row of the storage-routing table per [C22 §2.2]. The schema enforces:
 *
 *   - `maxRetentionDays` is a positive integer (a tier always has a ceiling);
 *   - a downcast may never target its OWN tier (`to !== tier`) — a "downcast"
 *     to self is a no-op that would mask a missing transform;
 *   - downcast targets are UNIQUE (one transform per destination tier — a
 *     duplicate target is a config error that hides the shadowed entry).
 */
export const StorageRoutingPolicySchema = z.object({
    /** The tier this policy governs. */
    tier: DataTierSchema,
    /** Per-region bucket / database endpoints. */
    endpoints: StorageEndpointsSchema,
    /** Encryption requirement. */
    encryption: StorageEncryptionSchema,
    /** Maximum retention before forced purge (positive integer days). */
    maxRetentionDays: z.number().int().positive(),
    /** Allowed downcast transforms out of this tier. */
    allowedDowncasts: z.array(AllowedDowncastSchema),
})
    .superRefine((p, ctx) => {
        const seen = new Set<string>();
        p.allowedDowncasts.forEach((d, i) => {
            if (d.to === p.tier) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['allowedDowncasts', i, 'to'],
                    message: `a downcast may not target its own tier ('${p.tier}')`,
                });
            }
            if (seen.has(d.to)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['allowedDowncasts', i, 'to'],
                    message: `duplicate downcast target tier '${d.to}' (one transform per destination tier)`,
                });
            }
            seen.add(d.to);
        });
    });

export type StorageRoutingPolicy = z.infer<typeof StorageRoutingPolicySchema>;
