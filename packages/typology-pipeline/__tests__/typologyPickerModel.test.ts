// A.6 (Phase A · Sprint 2) — TypologyPickerModel tests.

import { describe, expect, it } from 'vitest';
import {
    TypologyManifestSchema,
    type TypologyCategory,
    type PlanTier,
    type CognitionLayer,
} from '@pryzm/schemas';
import { createTypologyRegistry } from '../src/TypologyRegistry.js';
import {
    buildPickerCards,
    filterByCategory,
    filterAvailableOnly,
    filterByCognitionLayer,
    filterByRoomType,
    groupByCategory,
} from '../src/TypologyPickerModel.js';
import type {
    RegisteredTypologyPack,
    GenerativeStage,
} from '../src/types.js';

const noopGenerative: GenerativeStage = () => ({
    ok: true,
    artifact: { engine: 'deterministic', payload: null },
});

interface MakePackOpts {
    id?: string;
    displayName?: string;
    category?: TypologyCategory;
    version?: string;
    requiredPlanTier?: PlanTier;
    cognitionLayers?: readonly CognitionLayer[];
    roomTypes?: readonly string[];
    marketplaceListing?: {
        publisherId: string;
        publishedAt: string;
        listingPath: string;
        pricing: { model: 'free' };
        averageRating?: number;
        reviewCount?: number;
    };
}

function makePack(opts: MakePackOpts = {}): RegisteredTypologyPack {
    const id = opts.id ?? 'apartment';
    const manifest = TypologyManifestSchema.parse({
        id,
        displayName: opts.displayName ?? id.charAt(0).toUpperCase() + id.slice(1),
        category: opts.category ?? 'residential',
        version: opts.version ?? '1.0.0',
        description: `${id} pack`,
        thumbnail: 'thumb.webp',
        author: 'PRYZM',
        requiredPlanTier: opts.requiredPlanTier ?? 'solo',
        cognitionLayers: opts.cognitionLayers ?? ['L1-environmental'],
        programRulesEntry: 'program-rules.json',
        deterministicEngineEntry: 'det/run.js',
        roomTypes: opts.roomTypes ?? ['living'],
        ...(opts.marketplaceListing ? { marketplaceListing: opts.marketplaceListing } : {}),
    });
    return { manifest, stages: { generative: noopGenerative } };
}

function setupRegistry(packs: readonly RegisteredTypologyPack[]) {
    const registry = createTypologyRegistry();
    for (const p of packs) registry.register(p);
    return registry;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildPickerCards — basic shape
// ─────────────────────────────────────────────────────────────────────────────

describe('buildPickerCards', () => {
    it('returns one card per registered pack', () => {
        const registry = setupRegistry([
            makePack({ id: 'apartment' }),
            makePack({ id: 'house' }),
            makePack({ id: 'small-office', category: 'workplace' }),
        ]);
        const cards = buildPickerCards(registry, 'solo');
        expect(cards).toHaveLength(3);
        expect(cards.map((c) => c.id).sort()).toEqual([
            'apartment',
            'house',
            'small-office',
        ]);
    });

    it('returns empty array for an empty registry', () => {
        const registry = createTypologyRegistry();
        expect(buildPickerCards(registry, 'solo')).toEqual([]);
    });

    it('every card carries the manifest fields', () => {
        const registry = setupRegistry([makePack({ id: 'apartment' })]);
        const [card] = buildPickerCards(registry, 'solo');
        expect(card?.id).toBe('apartment');
        expect(card?.displayName).toBe('Apartment');
        expect(card?.category).toBe('residential');
        expect(card?.version).toBe('1.0.0');
        expect(card?.author).toBe('PRYZM');
        expect(card?.requiredPlanTier).toBe('solo');
        expect(card?.phaseGate).toBe('alpha');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sort order
// ─────────────────────────────────────────────────────────────────────────────

describe('buildPickerCards sort order', () => {
    it('sorts by category (alphabetical) then displayName', () => {
        const registry = setupRegistry([
            makePack({ id: 'house', displayName: 'House', category: 'residential' }),
            makePack({ id: 'gym', displayName: 'Gym', category: 'sports-leisure' }),
            makePack({ id: 'school', displayName: 'School', category: 'education' }),
            makePack({ id: 'apartment', displayName: 'Apartment', category: 'residential' }),
        ]);
        const cards = buildPickerCards(registry, 'solo');
        expect(cards.map((c) => c.id)).toEqual([
            'school',          // education
            'apartment',       // residential A
            'house',           // residential H
            'gym',             // sports-leisure
        ]);
    });

    it('case-insensitive displayName sort', () => {
        const registry = setupRegistry([
            makePack({ id: 'b-pack', displayName: 'apartment-B', category: 'residential' }),
            makePack({ id: 'a-pack', displayName: 'Apartment-A', category: 'residential' }),
        ]);
        const cards = buildPickerCards(registry, 'solo');
        expect(cards.map((c) => c.displayName)).toEqual([
            'Apartment-A',
            'apartment-B',
        ]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lock states (C50 §5.3)
// ─────────────────────────────────────────────────────────────────────────────

describe('buildPickerCards lock state', () => {
    it('marks solo-tier pack as UNLOCKED for solo user', () => {
        const registry = setupRegistry([
            makePack({ id: 'apartment', requiredPlanTier: 'solo' }),
        ]);
        const [card] = buildPickerCards(registry, 'solo');
        expect(card?.locked).toBe(false);
        expect(card?.lockReason).toBe('');
    });

    it('marks studio-tier pack as LOCKED for solo user (still in list per §5.3)', () => {
        const registry = setupRegistry([
            makePack({ id: 'studio-pack', requiredPlanTier: 'studio' }),
        ]);
        const cards = buildPickerCards(registry, 'solo');
        expect(cards).toHaveLength(1); // STILL in list
        expect(cards[0]?.locked).toBe(true);
        expect(cards[0]?.lockReason).toMatch(/Requires Studio plan/i);
    });

    it('marks enterprise-tier pack as LOCKED for studio user', () => {
        const registry = setupRegistry([
            makePack({ id: 'enterprise-pack', requiredPlanTier: 'enterprise' }),
        ]);
        const cards = buildPickerCards(registry, 'studio');
        expect(cards[0]?.locked).toBe(true);
        expect(cards[0]?.lockReason).toMatch(/Requires Enterprise plan/i);
    });

    it('developer tier bypasses the consumer-tier gate', () => {
        const registry = setupRegistry([
            makePack({ id: 'enterprise-pack', requiredPlanTier: 'enterprise' }),
        ]);
        const cards = buildPickerCards(registry, 'developer');
        expect(cards[0]?.locked).toBe(false);
    });

    it('admin tier bypasses the consumer-tier gate', () => {
        const registry = setupRegistry([
            makePack({ id: 'enterprise-pack', requiredPlanTier: 'enterprise' }),
        ]);
        const cards = buildPickerCards(registry, 'admin');
        expect(cards[0]?.locked).toBe(false);
    });

    it('user tier equal to required unlocks', () => {
        const registry = setupRegistry([
            makePack({ id: 'studio-pack', requiredPlanTier: 'studio' }),
        ]);
        const cards = buildPickerCards(registry, 'studio');
        expect(cards[0]?.locked).toBe(false);
    });

    it('user tier above required unlocks', () => {
        const registry = setupRegistry([
            makePack({ id: 'solo-pack', requiredPlanTier: 'solo' }),
        ]);
        const cards = buildPickerCards(registry, 'enterprise');
        expect(cards[0]?.locked).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Marketplace metadata
// ─────────────────────────────────────────────────────────────────────────────

describe('buildPickerCards marketplace fields', () => {
    it('PRYZM-first-party pack: isMarketplace false, no rating', () => {
        const registry = setupRegistry([makePack({ id: 'apartment' })]);
        const [card] = buildPickerCards(registry, 'solo');
        expect(card?.isMarketplace).toBe(false);
        expect(card?.averageRating).toBeNull();
        expect(card?.reviewCount).toBeNull();
    });

    it('marketplace pack: isMarketplace true with rating + count', () => {
        const registry = setupRegistry([
            makePack({
                id: 'community-pack',
                marketplaceListing: {
                    publisherId: 'pub-123',
                    publishedAt: '2026-09-15T10:00:00.000Z',
                    listingPath: '/marketplace/typology/community-pack',
                    pricing: { model: 'free' },
                    averageRating: 4.7,
                    reviewCount: 23,
                },
            }),
        ]);
        const [card] = buildPickerCards(registry, 'solo');
        expect(card?.isMarketplace).toBe(true);
        expect(card?.averageRating).toBeCloseTo(4.7);
        expect(card?.reviewCount).toBe(23);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Filter helpers
// ─────────────────────────────────────────────────────────────────────────────

describe('filterByCategory', () => {
    it('filters to a single category', () => {
        const registry = setupRegistry([
            makePack({ id: 'apartment', category: 'residential' }),
            makePack({ id: 'gym', category: 'sports-leisure' }),
            makePack({ id: 'house', category: 'residential' }),
        ]);
        const all = buildPickerCards(registry, 'solo');
        const residential = filterByCategory(all, 'residential');
        expect(residential.map((c) => c.id).sort()).toEqual(['apartment', 'house']);
    });
});

describe('filterAvailableOnly', () => {
    it('drops locked cards', () => {
        const registry = setupRegistry([
            makePack({ id: 'apartment', requiredPlanTier: 'solo' }),
            makePack({ id: 'studio-pack', requiredPlanTier: 'studio' }),
            makePack({ id: 'enterprise-pack', requiredPlanTier: 'enterprise' }),
        ]);
        const all = buildPickerCards(registry, 'solo');
        const available = filterAvailableOnly(all);
        expect(available.map((c) => c.id)).toEqual(['apartment']);
    });
});

describe('filterByCognitionLayer', () => {
    it('filters to packs declaring the layer', () => {
        const registry = setupRegistry([
            makePack({
                id: 'apartment',
                cognitionLayers: ['L1-environmental', 'L3-semantic-topology'],
            }),
            makePack({
                id: 'house',
                cognitionLayers: ['L1-environmental'],
            }),
            makePack({
                id: 'gym',
                cognitionLayers: ['L6-behavioural-simulation'],
            }),
        ]);
        const all = buildPickerCards(registry, 'solo');
        const semantic = filterByCognitionLayer(all, 'L3-semantic-topology');
        expect(semantic.map((c) => c.id)).toEqual(['apartment']);
    });
});

describe('filterByRoomType', () => {
    it('filters to packs declaring the roomType', () => {
        const registry = setupRegistry([
            makePack({ id: 'apartment', roomTypes: ['living', 'kitchen', 'bathroom'] }),
            makePack({ id: 'office', roomTypes: ['workstation', 'meeting'] }),
        ]);
        const all = buildPickerCards(registry, 'solo');
        const withKitchen = filterByRoomType(all, 'kitchen');
        expect(withKitchen.map((c) => c.id)).toEqual(['apartment']);
    });
});

describe('groupByCategory', () => {
    it('groups cards by category in alphabetical order', () => {
        const registry = setupRegistry([
            makePack({ id: 'apartment', category: 'residential' }),
            makePack({ id: 'gym', category: 'sports-leisure' }),
            makePack({ id: 'school', category: 'education' }),
            makePack({ id: 'house', category: 'residential' }),
        ]);
        const all = buildPickerCards(registry, 'solo');
        const grouped = groupByCategory(all);
        expect(grouped.map((g) => g.category)).toEqual([
            'education',
            'residential',
            'sports-leisure',
        ]);
        const residential = grouped.find((g) => g.category === 'residential');
        expect(residential?.cards.map((c) => c.id)).toEqual([
            'apartment',
            'house',
        ]);
    });

    it('returns empty array for empty input', () => {
        expect(groupByCategory([])).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// A.6.a.next — groupByPhaseGate + summarizePickerCards
// ─────────────────────────────────────────────────────────────────────────────

import { groupByPhaseGate, summarizePickerCards } from '../src/TypologyPickerModel.js';

function makePackWithPhase(
    id: string,
    phaseGate: 'alpha' | 'beta' | 'ga' | 'community-marketplace',
    opts: MakePackOpts = {},
): RegisteredTypologyPack {
    const merged: MakePackOpts = { id, ...opts };
    const base = makePack(merged);
    // The default schema sets phaseGate='alpha'; override by re-parsing.
    const manifest = TypologyManifestSchema.parse({
        ...base.manifest,
        phaseGate,
    });
    return { manifest, stages: base.stages };
}

describe('groupByPhaseGate', () => {
    it('groups cards in PHASE_GATE_ORDER (ga → beta → alpha → community)', () => {
        const registry = setupRegistry([
            makePackWithPhase('a-alpha', 'alpha'),
            makePackWithPhase('b-beta', 'beta'),
            makePackWithPhase('c-ga', 'ga'),
            makePackWithPhase('d-community', 'community-marketplace'),
        ]);
        const cards = buildPickerCards(registry, 'solo');
        const groups = groupByPhaseGate(cards);
        expect(groups.map((g) => g.phaseGate)).toEqual([
            'ga',
            'beta',
            'alpha',
            'community-marketplace',
        ]);
    });

    it('omits empty phase gates from the result', () => {
        const registry = setupRegistry([
            makePackWithPhase('a-ga', 'ga'),
            makePackWithPhase('b-ga', 'ga'),
        ]);
        const cards = buildPickerCards(registry, 'solo');
        const groups = groupByPhaseGate(cards);
        expect(groups.length).toBe(1);
        expect(groups[0]?.phaseGate).toBe('ga');
    });

    it('returns empty array for empty input', () => {
        expect(groupByPhaseGate([])).toEqual([]);
    });

    it('each group preserves card order from the input', () => {
        const registry = setupRegistry([
            makePackWithPhase('z-ga', 'ga'),
            makePackWithPhase('a-ga', 'ga'),
        ]);
        const cards = buildPickerCards(registry, 'solo');
        // buildPickerCards sorts by displayName asc → a then z.
        const ga = groupByPhaseGate(cards).find((g) => g.phaseGate === 'ga')!;
        expect(ga.cards.map((c) => c.id)).toEqual(['a-ga', 'z-ga']);
    });
});

describe('summarizePickerCards', () => {
    it('counts total / available / locked correctly', () => {
        const registry = setupRegistry([
            makePack({ id: 'pack-a', requiredPlanTier: 'solo' }),
            makePack({ id: 'pack-b', requiredPlanTier: 'studio' }),
            makePack({ id: 'pack-c', requiredPlanTier: 'enterprise' }),
        ]);
        const cards = buildPickerCards(registry, 'studio'); // unlocks 2/3
        const summary = summarizePickerCards(cards);
        expect(summary.total).toBe(3);
        expect(summary.available).toBe(2);
        expect(summary.locked).toBe(1);
    });

    it('categoryCount counts unique categories', () => {
        const registry = setupRegistry([
            makePack({ id: 'pack-a', category: 'residential' }),
            makePack({ id: 'pack-b', category: 'residential' }),
            makePack({ id: 'pack-c', category: 'workplace' }),
        ]);
        const cards = buildPickerCards(registry, 'solo');
        expect(summarizePickerCards(cards).categoryCount).toBe(2);
    });

    it('marketplaceCount counts cards with marketplaceListing', () => {
        const registry = setupRegistry([
            makePack({ id: 'pack-a' }),
            makePack({
                id: 'pack-b',
                marketplaceListing: {
                    publisherId: 'pub',
                    publishedAt: '2026-01-01T00:00:00.000Z',
                    listingPath: 'l',
                    pricing: { model: 'free' },
                },
            }),
        ]);
        const cards = buildPickerCards(registry, 'solo');
        expect(summarizePickerCards(cards).marketplaceCount).toBe(1);
    });

    it('byPhaseGate breakdown matches input distribution', () => {
        const registry = setupRegistry([
            makePackWithPhase('a-ga', 'ga'),
            makePackWithPhase('b-ga', 'ga'),
            makePackWithPhase('c-beta', 'beta'),
            makePackWithPhase('d-alpha', 'alpha'),
        ]);
        const cards = buildPickerCards(registry, 'solo');
        const summary = summarizePickerCards(cards);
        expect(summary.byPhaseGate.ga).toBe(2);
        expect(summary.byPhaseGate.beta).toBe(1);
        expect(summary.byPhaseGate.alpha).toBe(1);
        expect(summary.byPhaseGate['community-marketplace']).toBe(0);
    });

    it('empty registry → all-zeros summary', () => {
        const summary = summarizePickerCards([]);
        expect(summary.total).toBe(0);
        expect(summary.available).toBe(0);
        expect(summary.locked).toBe(0);
        expect(summary.categoryCount).toBe(0);
        expect(summary.marketplaceCount).toBe(0);
        expect(summary.byPhaseGate.ga).toBe(0);
    });

    it('available + locked sums to total', () => {
        const registry = setupRegistry([
            makePack({ id: 'pack-a', requiredPlanTier: 'solo' }),
            makePack({ id: 'pack-b', requiredPlanTier: 'enterprise' }),
            makePack({ id: 'pack-c', requiredPlanTier: 'mid-firm' }),
        ]);
        const cards = buildPickerCards(registry, 'studio');
        const s = summarizePickerCards(cards);
        expect(s.available + s.locked).toBe(s.total);
    });
});
