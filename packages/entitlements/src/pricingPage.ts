// A.18 (Phase A · Sprint 2) — Pricing-page data generator.
//
// Per [C39 §1.13] the pricing page MUST be generated from the
// entitlement registry — no hand-written tier feature lists. This
// module turns the registry into a structured `PricingPageData`
// shape the L5 React component renders.
//
// The L5 component (`apps/docs-site/src/pricing.tsx`) imports this
// at build time + pre-renders the table. The generator stays L2-
// pure: no React, no DOM.

import type { PlanTier } from '@pryzm/schemas';
import {
    ENTITLEMENT_REGISTRY,
    type EntitlementEntry,
    type EntitlementKey,
} from './registry.js';

/** One row of the pricing-page comparison table. */
export interface PricingRow {
    readonly key: EntitlementKey;
    readonly displayName: string;
    readonly description: string;
    readonly category: EntitlementEntry['category'];
    /** Per-tier availability — true when the user tier qualifies. */
    readonly availability: Readonly<Record<PlanTier, boolean>>;
    readonly deprecated: boolean;
}

/** One section of the pricing page (a category grouping). */
export interface PricingSection {
    readonly category: EntitlementEntry['category'];
    readonly displayName: string;
    readonly rows: readonly PricingRow[];
}

/** The full pricing-page data shape. */
export interface PricingPageData {
    readonly tiers: readonly PlanTier[];
    readonly tierDisplayNames: Readonly<Record<PlanTier, string>>;
    readonly sections: readonly PricingSection[];
    /** Total entitlements covered — useful for sanity-check + telemetry. */
    readonly totalEntitlements: number;
}

const CONSUMER_TIERS: readonly PlanTier[] = [
    'free-trial',
    'solo',
    'studio',
    'mid-firm',
    'enterprise',
];

const TIER_DISPLAY_NAMES: Readonly<Record<PlanTier, string>> = {
    'free-trial': 'Free Trial',
    solo: 'Solo',
    studio: 'Studio',
    'mid-firm': 'Mid-Firm',
    enterprise: 'Enterprise',
    developer: 'Developer',
    admin: 'Admin',
};

const TIER_RANK: Record<string, number> = {
    'free-trial': 0,
    solo: 1,
    studio: 2,
    'mid-firm': 3,
    enterprise: 4,
};

const CATEGORY_DISPLAY: Readonly<
    Record<EntitlementEntry['category'], string>
> = {
    design: 'Design',
    output: 'Output formats',
    collaboration: 'Collaboration',
    quota: 'Usage limits',
    marketplace: 'Marketplace',
    enterprise: 'Enterprise',
};

/**
 * Build the full pricing-page data structure. Pure — same inputs (the
 * registry) always produce the same output.
 *
 * Sections appear in the canonical order: design → output →
 * collaboration → quota → marketplace → enterprise. Within a section,
 * rows appear in registry insertion order (which is itself stable per
 * the append-only invariant §1.2).
 *
 * Deprecated entries are INCLUDED on the pricing page but visibly
 * marked — customers who reference these in contracts need to see them.
 */
export function buildPricingPageData(): PricingPageData {
    const buckets = new Map<EntitlementEntry['category'], PricingRow[]>();

    for (const entry of ENTITLEMENT_REGISTRY) {
        const availability: Record<PlanTier, boolean> = {
            'free-trial': false,
            solo: false,
            studio: false,
            'mid-firm': false,
            enterprise: false,
            developer: true,
            admin: true,
        };
        const required = TIER_RANK[entry.requiredTier];
        if (required !== undefined) {
            for (const tier of CONSUMER_TIERS) {
                availability[tier] = (TIER_RANK[tier] ?? -1) >= required;
            }
        }
        const row: PricingRow = {
            key: entry.key,
            displayName: entry.displayName,
            description: entry.description,
            category: entry.category,
            availability,
            deprecated: Boolean(entry.deprecated),
        };
        const arr = buckets.get(entry.category) ?? [];
        arr.push(row);
        buckets.set(entry.category, arr);
    }

    const sectionOrder: readonly EntitlementEntry['category'][] = [
        'design',
        'output',
        'collaboration',
        'quota',
        'marketplace',
        'enterprise',
    ];
    const sections: PricingSection[] = sectionOrder
        .filter((cat) => buckets.has(cat))
        .map((cat) => ({
            category: cat,
            displayName: CATEGORY_DISPLAY[cat],
            rows: buckets.get(cat)!,
        }));

    return {
        tiers: CONSUMER_TIERS,
        tierDisplayNames: TIER_DISPLAY_NAMES,
        sections,
        totalEntitlements: ENTITLEMENT_REGISTRY.length,
    };
}
