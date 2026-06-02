// A.30.a (Phase A · Sprint 2) — Public surface for the L0 C22 Privacy
// substrate.
//
// Subpath-only — `import { DataTierSchema } from '@pryzm/schemas/privacy'`.
// Not re-exported via the root barrel.
//
// Slice contents (A.30.a):
//   - DataTier            4-tier classification enum per §2.1
//   - Region              4-region enum per §1.3
//   - DsarRequest         DSAR audit row per §2.4
//   - Consent             per-purpose consent record per §2.6
//   - RetentionPolicy     per-tier retention config per §2.3
//
// Deferred to later slices:
//   - A.30.b L0 BreachIncident + StorageRoutingPolicy (per §2.2 + §2.5)
//   - A.30.c L3 ConsentStore + RetentionScheduler
//   - A.30.d server-side DSAR worker + privacy settings UI
//
// Strategic context: docs/02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md.

export * from './DataTier.js';
export * from './DsarRequest.js';
export * from './Consent.js';
export * from './RetentionPolicy.js';
