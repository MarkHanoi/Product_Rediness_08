// @vitest-environment happy-dom
//
// A.6.b (Phase A · IP-A3 Sprint 3) — TypologyPickerPanel L5 tests.
//
// Drives the panel against a real TypologyRegistry + buildPickerCards.
// Asserts: build shape, phase-gate group rendering, locked-card badge
// + onPick gating, registry-subscription re-render, dispose hygiene,
// plus the pure helpers (labelForPhaseGate, phaseGateClass, formatRating).

import { describe, it, expect } from 'vitest';
import {
    TypologyManifestSchema,
    type PlanTier,
} from '@pryzm/schemas';
import {
    createTypologyRegistry,
    type RegisteredTypologyPack,
    type GenerativeStage,
} from '@pryzm/typology-pipeline';
import {
    TypologyPickerPanel,
    labelForPhaseGate,
    phaseGateClass,
    formatRating,
} from '../src/ui/onboarding/TypologyPickerPanel';

// ── fixtures ────────────────────────────────────────────────────────────

const noopGenerative: GenerativeStage = () => ({
    ok: true,
    artifact: { engine: 'deterministic', payload: null },
});

function makePack(
    id: string,
    overrides: {
        phaseGate?: 'alpha' | 'beta' | 'ga' | 'community-marketplace';
        requiredPlanTier?: PlanTier;
        marketplace?: { averageRating?: number; reviewCount?: number };
    } = {},
): RegisteredTypologyPack {
    const baseManifest = {
        id,
        displayName: id.charAt(0).toUpperCase() + id.slice(1),
        category: 'residential' as const,
        version: '1.0.0',
        description: `${id} pack`,
        thumbnail: 'thumb.webp',
        author: 'PRYZM',
        requiredPlanTier: overrides.requiredPlanTier ?? 'solo',
        cognitionLayers: ['L1-environmental'] as const,
        programRulesEntry: 'p.json',
        deterministicEngineEntry: 'det.js',
        roomTypes: ['living'] as const,
        phaseGate: overrides.phaseGate ?? 'alpha',
        ...(overrides.marketplace
            ? {
                  marketplaceListing: {
                      publisherId: 'pub_xyz',
                      publishedAt: '2026-06-01T00:00:00.000Z',
                      listingPath: `/marketplace/${id}`,
                      pricing: { model: 'free' as const },
                      averageRating: overrides.marketplace.averageRating,
                      reviewCount: overrides.marketplace.reviewCount,
                  },
              }
            : {}),
    };
    const manifest = TypologyManifestSchema.parse(baseManifest);
    return { manifest, stages: { generative: noopGenerative } };
}

function makeRegistry(packs: readonly RegisteredTypologyPack[] = [makePack('apartment')]) {
    const r = createTypologyRegistry();
    for (const p of packs) r.register(p);
    return r;
}

// ── pure helpers ────────────────────────────────────────────────────────

describe('labelForPhaseGate', () => {
    it('returns "Generally available" for ga', () => {
        expect(labelForPhaseGate('ga')).toBe('Generally available');
    });
    it('returns "Beta" / "Alpha" / "Community" for the others', () => {
        expect(labelForPhaseGate('beta')).toBe('Beta');
        expect(labelForPhaseGate('alpha')).toBe('Alpha');
        expect(labelForPhaseGate('community-marketplace')).toBe('Community');
    });
});

describe('phaseGateClass', () => {
    it('returns a distinct class per gate', () => {
        const classes = new Set([
            phaseGateClass('ga'),
            phaseGateClass('beta'),
            phaseGateClass('alpha'),
            phaseGateClass('community-marketplace'),
        ]);
        expect(classes.size).toBe(4);
        for (const c of classes) expect(c.startsWith('tp-badge--')).toBe(true);
    });
});

describe('formatRating', () => {
    it('returns "—" when the card has no rating', () => {
        const card = {
            averageRating: null,
            reviewCount: null,
        } as Parameters<typeof formatRating>[0];
        expect(formatRating(card)).toBe('—');
    });
    it('formats "★ 4.6 (12)" when rated', () => {
        const card = {
            averageRating: 4.6,
            reviewCount: 12,
        } as Parameters<typeof formatRating>[0];
        expect(formatRating(card)).toBe('★ 4.6 (12)');
    });
});

// ── panel lifecycle ─────────────────────────────────────────────────────

describe('TypologyPickerPanel build()', () => {
    it('returns an HTMLElement with the tp-panel test id', () => {
        const panel = new TypologyPickerPanel({
            registry: makeRegistry(),
            userTier: 'solo',
        });
        const el = panel.build();
        expect(el).toBeInstanceOf(HTMLElement);
        expect(el.getAttribute('data-testid')).toBe('tp-panel');
    });

    it('renders one tp-card per registered pack', () => {
        const panel = new TypologyPickerPanel({
            registry: makeRegistry([makePack('apartment'), makePack('house'), makePack('gym')]),
            userTier: 'solo',
        });
        const el = panel.build();
        const cards = el.querySelectorAll('.tp-card');
        expect(cards.length).toBe(3);
    });

    it('groups cards by phase gate in canonical order (ga > beta > alpha > community)', () => {
        const panel = new TypologyPickerPanel({
            registry: makeRegistry([
                makePack('a-alpha', { phaseGate: 'alpha' }),
                makePack('b-beta', { phaseGate: 'beta' }),
                makePack('c-ga', { phaseGate: 'ga' }),
                makePack('d-comm', { phaseGate: 'community-marketplace' }),
            ]),
            userTier: 'solo',
        });
        const el = panel.build();
        const groups = el.querySelectorAll('[data-testid^="tp-group-"]');
        const order = Array.from(groups).map((g) =>
            g.getAttribute('data-testid')!.replace('tp-group-', ''),
        );
        expect(order).toEqual(['ga', 'beta', 'alpha', 'community-marketplace']);
    });

    it('shows the summary text "N packs · M unlocked"', () => {
        const panel = new TypologyPickerPanel({
            registry: makeRegistry([
                makePack('apartment'),
                makePack('locked-1', { requiredPlanTier: 'enterprise' }),
            ]),
            userTier: 'solo',
        });
        const el = panel.build();
        const summary = el.querySelector('[data-testid="tp-summary"]')!;
        expect(summary.textContent).toBe('2 packs · 1 unlocked');
    });

    it('renders an empty state when no packs are registered', () => {
        const panel = new TypologyPickerPanel({
            registry: createTypologyRegistry(),
            userTier: 'solo',
        });
        const el = panel.build();
        const empty = el.querySelector('[data-testid="tp-empty"]');
        expect(empty).not.toBeNull();
        expect(empty!.textContent).toContain('No typology packs');
    });
});

describe('TypologyPickerPanel locked cards', () => {
    it('renders a lock badge with the tier reason on locked cards', () => {
        const panel = new TypologyPickerPanel({
            registry: makeRegistry([
                makePack('apartment'),
                makePack('enterprise-only', { requiredPlanTier: 'enterprise' }),
            ]),
            userTier: 'solo',
        });
        const el = panel.build();
        const lock = el.querySelector('[data-testid="tp-lock-enterprise-only"]')!;
        expect(lock).not.toBeNull();
        expect(lock.textContent).toContain('Enterprise');
    });

    it('disables the card button and sets aria-disabled on locked cards', () => {
        const panel = new TypologyPickerPanel({
            registry: makeRegistry([
                makePack('enterprise-only', { requiredPlanTier: 'enterprise' }),
            ]),
            userTier: 'solo',
        });
        const el = panel.build();
        const card = el.querySelector<HTMLButtonElement>('[data-testid="tp-card-enterprise-only"]')!;
        expect(card.disabled).toBe(true);
        expect(card.getAttribute('aria-disabled')).toBe('true');
    });

    it('does NOT fire onPick when a locked card is clicked', () => {
        let picked: string | null = null;
        const panel = new TypologyPickerPanel({
            registry: makeRegistry([
                makePack('enterprise-only', { requiredPlanTier: 'enterprise' }),
            ]),
            userTier: 'solo',
            onPick: (id) => { picked = id; },
        });
        const el = panel.build();
        const card = el.querySelector<HTMLButtonElement>('[data-testid="tp-card-enterprise-only"]')!;
        card.click();
        expect(picked).toBeNull();
    });
});

describe('TypologyPickerPanel onPick', () => {
    it('fires onPick with the typology id when an unlocked card is clicked', () => {
        let picked: string | null = null;
        const panel = new TypologyPickerPanel({
            registry: makeRegistry([makePack('apartment')]),
            userTier: 'solo',
            onPick: (id) => { picked = id; },
        });
        const el = panel.build();
        const card = el.querySelector<HTMLButtonElement>('[data-testid="tp-card-apartment"]')!;
        card.click();
        expect(picked).toBe('apartment');
    });
});

describe('TypologyPickerPanel registry subscription', () => {
    it('re-renders when a new pack registers', () => {
        const registry = makeRegistry([makePack('apartment')]);
        const panel = new TypologyPickerPanel({ registry, userTier: 'solo' });
        const el = panel.build();
        expect(el.querySelectorAll('.tp-card').length).toBe(1);
        registry.register(makePack('house'));
        expect(el.querySelectorAll('.tp-card').length).toBe(2);
    });
});

describe('TypologyPickerPanel dispose()', () => {
    it('detaches the root from its parent + unsubscribes from the registry', () => {
        const registry = makeRegistry([makePack('apartment')]);
        const panel = new TypologyPickerPanel({ registry, userTier: 'solo' });
        const el = panel.build();
        document.body.appendChild(el);
        panel.dispose();
        expect(el.parentNode).toBeNull();
        // After dispose, registry mutations must NOT crash the panel.
        expect(() => registry.register(makePack('house'))).not.toThrow();
    });

    it('is idempotent — second dispose() is a no-op', () => {
        const panel = new TypologyPickerPanel({
            registry: makeRegistry(),
            userTier: 'solo',
        });
        panel.build();
        panel.dispose();
        expect(() => panel.dispose()).not.toThrow();
    });
});
