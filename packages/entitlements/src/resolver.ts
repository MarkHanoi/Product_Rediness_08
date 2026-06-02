// A.18 (Phase A · Sprint 2) — Entitlement resolver.
//
// Pure `(key, userTier) → CheckResult` per [C39 §1.1]. The L5 wrapper
// in apps/editor combines this with the live BillingState (active /
// past_due / suspended) and the C08 role to produce the final allow /
// deny decision per §1.5.

import type { PlanTier } from '@pryzm/schemas';
import {
    findEntitlement,
    type EntitlementKey,
    type EntitlementEntry,
} from './registry.js';

/**
 * Discriminated-union result per [C39 §1.1].
 *
 *   - `allowed: true` — the gate opens. `entry` is included so the
 *     caller can render a tooltip or telemetry-tag without re-looking-up.
 *   - `allowed: false` — the gate is closed. `reason` is one of:
 *       'tier-too-low'    — user is on a lower tier than required
 *       'unknown-key'     — caller passed an unrecognised key
 *                           (programmer bug; surfaced as a hard fail
 *                           in tests + a soft deny in production)
 */
export type CheckResult =
    | {
          readonly allowed: true;
          readonly entry: EntitlementEntry;
      }
    | {
          readonly allowed: false;
          readonly reason: 'tier-too-low';
          readonly entry: EntitlementEntry;
          readonly requiredTier: PlanTier;
          readonly userTier: PlanTier;
      }
    | {
          readonly allowed: false;
          readonly reason: 'unknown-key';
          readonly key: string;
      };

/** Plan tier ordinals per C39 §1.3 (consumer ladder).
 *  developer + admin are orthogonal — they bypass the consumer gate. */
const TIER_RANK: Record<string, number> = {
    'free-trial': 0,
    solo: 1,
    studio: 2,
    'mid-firm': 3,
    enterprise: 4,
};

/**
 * Resolve a feature gate.
 *
 * Per [C39 §1.2]: deprecated entries ALWAYS allow (the gate is open;
 * the feature is being retired but historical consumers still work).
 *
 * Per [C39]: developer + admin tiers bypass the consumer-tier ladder
 * — they are orthogonal classes (marketplace publisher + PRYZM staff)
 * not consumer tiers.
 *
 * O(1) lookup via the registry index.
 */
export function check(key: EntitlementKey, userTier: PlanTier): CheckResult {
    const entry = findEntitlement(key);
    if (!entry) {
        return { allowed: false, reason: 'unknown-key', key };
    }

    // Deprecated gates are OPEN per §1.2.
    if (entry.deprecated) {
        return { allowed: true, entry };
    }

    // Developer + admin bypass the consumer ladder.
    if (userTier === 'developer' || userTier === 'admin') {
        return { allowed: true, entry };
    }

    const required = TIER_RANK[entry.requiredTier];
    const user = TIER_RANK[userTier];
    if (required === undefined || user === undefined) {
        // Programmer error: unknown tier. Treat as too low (closed).
        return {
            allowed: false,
            reason: 'tier-too-low',
            entry,
            requiredTier: entry.requiredTier,
            userTier,
        };
    }

    if (user >= required) {
        return { allowed: true, entry };
    }

    return {
        allowed: false,
        reason: 'tier-too-low',
        entry,
        requiredTier: entry.requiredTier,
        userTier,
    };
}
