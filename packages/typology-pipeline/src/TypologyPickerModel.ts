// A.6 (Phase A · Sprint 2) — L3 TypologyPicker pure model.
//
// The model layer that the L5 React `TypologyPicker.tsx` consumes.
// Pure functions over the L3 `TypologyRegistry` — turns the registered
// packs into a sorted, filtered, badge-annotated array of picker cards
// the UI renders.
//
// Per [C50 §5.3] the picker MUST show every registered pack — even
// the ones the current user can't dispatch — so the user sees the
// upgrade path. The model annotates each card with `locked` + a
// `lockReason` rather than dropping locked cards from the list.
//
// L3-layer: pure orchestration. No DOM, no React, no I/O.
//
// Strategic context — see:
//   - docs/02-decisions/contracts/C50-TYPOLOGY-PIPELINE.md §5.3
//   - docs/03-execution/plans/master-execution-tracker.md A.6

import type { PlanTier, TypologyCategory, CognitionLayer } from '@pryzm/schemas';
import type { TypologyRegistry } from './TypologyRegistry.js';

/**
 * A single card the L5 React picker renders. Stable shape across
 * filter / sort operations — every field is read-only.
 */
export interface PickerCard {
    readonly id: string;
    readonly displayName: string;
    readonly category: TypologyCategory;
    readonly version: string;
    readonly description: string;
    readonly thumbnail: string;
    readonly author: string;
    readonly requiredPlanTier: PlanTier;
    readonly cognitionLayers: readonly CognitionLayer[];
    readonly roomTypes: readonly string[];
    readonly phaseGate: 'alpha' | 'beta' | 'ga' | 'community-marketplace';
    /** True when the user's current tier is below `requiredPlanTier`.
     *  The L5 picker shows a "Requires <X> plan" lock badge per
     *  C50 §5.3 — does NOT hide the card. */
    readonly locked: boolean;
    /** Human-readable explanation of the lock state. Empty when not
     *  locked. */
    readonly lockReason: string;
    /** Whether the pack is a marketplace pack (carries a marketplaceListing). */
    readonly isMarketplace: boolean;
    /** Star rating 0-5 if the pack has a marketplaceListing rating;
     *  null otherwise. */
    readonly averageRating: number | null;
    /** Marketplace review count when present; null otherwise. */
    readonly reviewCount: number | null;
}

// Tier ordering per C39 — duplicated from PipelineRouter to keep this
// module independent. The 7 tiers from `PlanTierEnum`:
//   free-trial < solo < studio < mid-firm < enterprise
// `developer` and `admin` are orthogonal (marketplace publisher /
// PRYZM staff) and bypass the consumer-tier gate.
const TIER_RANK: Record<string, number> = {
    'free-trial': 0,
    solo: 1,
    studio: 2,
    'mid-firm': 3,
    enterprise: 4,
};

function isLockedForTier(
    requiredTier: PlanTier,
    userTier: PlanTier,
): { locked: boolean; reason: string } {
    if (userTier === 'developer' || userTier === 'admin') {
        return { locked: false, reason: '' };
    }
    const required = TIER_RANK[requiredTier];
    const user = TIER_RANK[userTier];
    if (required === undefined || user === undefined) {
        return {
            locked: true,
            reason: `Unknown plan tier '${userTier}'`,
        };
    }
    if (user >= required) {
        return { locked: false, reason: '' };
    }
    return {
        locked: true,
        reason: `Requires ${formatTier(requiredTier)} plan or higher`,
    };
}

function formatTier(tier: PlanTier): string {
    switch (tier) {
        case 'free-trial':
            return 'Free Trial';
        case 'solo':
            return 'Solo';
        case 'studio':
            return 'Studio';
        case 'mid-firm':
            return 'Mid-Firm';
        case 'enterprise':
            return 'Enterprise';
        case 'developer':
            return 'Developer';
        case 'admin':
            return 'Admin';
        default:
            return tier;
    }
}

/**
 * Build the picker cards from the registry + the user's plan tier.
 *
 * Sort order (deterministic, stable across calls):
 *   1. category (alphabetical)
 *   2. displayName (alphabetical, case-insensitive)
 *
 * Per [C50 §5.3] every registered pack appears in the result — locked
 * cards are annotated, not filtered out. Filtering is the caller's
 * concern (the React component applies user-driven filters on top).
 */
export function buildPickerCards(
    registry: TypologyRegistry,
    userTier: PlanTier,
): readonly PickerCard[] {
    const cards: PickerCard[] = [];
    for (const pack of registry.list()) {
        const m = pack.manifest;
        const lock = isLockedForTier(m.requiredPlanTier, userTier);
        cards.push({
            id: m.id,
            displayName: m.displayName,
            category: m.category,
            version: m.version,
            description: m.description,
            thumbnail: m.thumbnail,
            author: m.author,
            requiredPlanTier: m.requiredPlanTier,
            cognitionLayers: m.cognitionLayers,
            roomTypes: m.roomTypes,
            phaseGate: m.phaseGate,
            locked: lock.locked,
            lockReason: lock.reason,
            isMarketplace: Boolean(m.marketplaceListing),
            averageRating: m.marketplaceListing?.averageRating ?? null,
            reviewCount: m.marketplaceListing?.reviewCount ?? null,
        });
    }
    // Sort: category asc, then displayName asc (case-insensitive).
    cards.sort((a, b) => {
        if (a.category !== b.category) {
            return a.category < b.category ? -1 : 1;
        }
        const an = a.displayName.toLowerCase();
        const bn = b.displayName.toLowerCase();
        if (an !== bn) return an < bn ? -1 : 1;
        return 0;
    });
    return cards;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter helpers — pure; UI applies these after `buildPickerCards`.
// ─────────────────────────────────────────────────────────────────────────────

export function filterByCategory(
    cards: readonly PickerCard[],
    category: TypologyCategory,
): readonly PickerCard[] {
    return cards.filter((c) => c.category === category);
}

export function filterAvailableOnly(
    cards: readonly PickerCard[],
): readonly PickerCard[] {
    return cards.filter((c) => !c.locked);
}

export function filterByCognitionLayer(
    cards: readonly PickerCard[],
    layer: CognitionLayer,
): readonly PickerCard[] {
    return cards.filter((c) => c.cognitionLayers.includes(layer));
}

export function filterByRoomType(
    cards: readonly PickerCard[],
    roomType: string,
): readonly PickerCard[] {
    return cards.filter((c) => c.roomTypes.includes(roomType));
}

/**
 * Group picker cards by category for a section-header UI. Returns an
 * array of `{ category, cards }` tuples in the same alphabetical-category
 * order as `buildPickerCards`. Empty categories are omitted.
 */
export function groupByCategory(
    cards: readonly PickerCard[],
): ReadonlyArray<{
    readonly category: TypologyCategory;
    readonly cards: readonly PickerCard[];
}> {
    const buckets = new Map<TypologyCategory, PickerCard[]>();
    for (const c of cards) {
        const arr = buckets.get(c.category);
        if (arr) arr.push(c);
        else buckets.set(c.category, [c]);
    }
    return Array.from(buckets.entries())
        .map(([category, cs]) => ({ category, cards: cs }))
        .sort((a, b) => (a.category < b.category ? -1 : 1));
}
