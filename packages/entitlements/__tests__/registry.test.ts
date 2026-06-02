// A.18.a — entitlement registry tests.
//
// These tests pin the C39 §1.2 invariants:
//   - keys are unique
//   - every registry entry has a non-empty displayName + description
//   - every requiredTier is a recognised PlanTier
//   - findEntitlement() is O(1) and returns the same reference

import { describe, expect, it } from 'vitest';
import {
    ENTITLEMENT_REGISTRY,
    findEntitlement,
    type EntitlementKey,
} from '../src/registry.js';

describe('ENTITLEMENT_REGISTRY', () => {
    it('has no duplicate keys', () => {
        const seen = new Set<EntitlementKey>();
        for (const entry of ENTITLEMENT_REGISTRY) {
            expect(seen.has(entry.key), `duplicate key: ${entry.key}`).toBe(false);
            seen.add(entry.key);
        }
    });

    it('every entry has a non-empty displayName + description', () => {
        for (const entry of ENTITLEMENT_REGISTRY) {
            expect(entry.displayName.length, entry.key).toBeGreaterThan(0);
            expect(entry.description.length, entry.key).toBeGreaterThan(0);
        }
    });

    it('every requiredTier is a known PlanTier', () => {
        const valid = new Set([
            'free-trial',
            'solo',
            'studio',
            'mid-firm',
            'enterprise',
            'developer',
            'admin',
        ]);
        for (const entry of ENTITLEMENT_REGISTRY) {
            expect(valid.has(entry.requiredTier), entry.key).toBe(true);
        }
    });

    it('every category is one of the 6 fixed groupings', () => {
        const valid = new Set([
            'design',
            'output',
            'collaboration',
            'quota',
            'marketplace',
            'enterprise',
        ]);
        for (const entry of ENTITLEMENT_REGISTRY) {
            expect(valid.has(entry.category), entry.key).toBe(true);
        }
    });

    it('replacedBy (when set) points to an existing key', () => {
        const allKeys = new Set(ENTITLEMENT_REGISTRY.map((e) => e.key));
        for (const entry of ENTITLEMENT_REGISTRY) {
            if (entry.replacedBy) {
                expect(allKeys.has(entry.replacedBy), entry.key).toBe(true);
            }
        }
    });
});

describe('findEntitlement()', () => {
    it('returns the matching entry by key', () => {
        const entry = findEntitlement('feature.ifc-export');
        expect(entry).toBeDefined();
        expect(entry?.key).toBe('feature.ifc-export');
        expect(entry?.category).toBe('output');
    });

    it('returns the SAME reference on repeated calls (Map-backed, no copies)', () => {
        const a = findEntitlement('feature.multiplayer');
        const b = findEntitlement('feature.multiplayer');
        expect(a).toBe(b);
    });

    it('returns undefined for unknown keys', () => {
        const entry = findEntitlement('feature.does-not-exist' as EntitlementKey);
        expect(entry).toBeUndefined();
    });

    it('covers every registry entry', () => {
        // Every entry in the registry is resolvable via findEntitlement.
        for (const e of ENTITLEMENT_REGISTRY) {
            expect(findEntitlement(e.key), e.key).toBeDefined();
        }
    });
});
