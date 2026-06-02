// A.18 (Phase A · Sprint 2) — @pryzm/entitlements public surface.
//
// Per [C39 §1.1] every feature gate in the product resolves through
// `check(key, userTier)`. The append-only registry per [§1.2] lives
// in `./registry.ts`. The pricing-page generator per [§1.13] lives
// in `./pricingPage.ts`.
//
// Strategic context:
//   - docs/02-decisions/contracts/C39-PRICING-AND-PLAN-TIERS.md
//   - docs/03-execution/plans/master-execution-tracker.md A.18

export {
    ENTITLEMENT_REGISTRY,
    findEntitlement,
    type EntitlementKey,
    type EntitlementEntry,
} from './registry.js';

export { check, type CheckResult } from './resolver.js';

export {
    buildPricingPageData,
    type PricingPageData,
    type PricingSection,
    type PricingRow,
} from './pricingPage.js';
