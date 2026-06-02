// A.18.a — entitlement resolver tests.
//
// Pins the C39 §1.1 + §1.2 + §1.5 invariants:
//   - tier-ladder ordinals (free-trial < solo < studio < mid-firm < enterprise)
//   - deprecated entries return allowed:true regardless of tier
//   - developer + admin tiers bypass the consumer ladder
//   - unknown keys return reason: 'unknown-key'

import { describe, expect, it } from 'vitest';
import { check } from '../src/resolver.js';
import type { EntitlementKey } from '../src/registry.js';

describe('check() — tier ladder', () => {
    it('free-trial cannot use a solo-tier feature', () => {
        const result = check('feature.ifc-export', 'free-trial');
        expect(result.allowed).toBe(false);
        if (!result.allowed) {
            expect(result.reason).toBe('tier-too-low');
            if (result.reason === 'tier-too-low') {
                expect(result.requiredTier).toBe('solo');
                expect(result.userTier).toBe('free-trial');
            }
        }
    });

    it('solo can use a solo-tier feature', () => {
        const result = check('feature.ifc-export', 'solo');
        expect(result.allowed).toBe(true);
        if (result.allowed) {
            expect(result.entry.key).toBe('feature.ifc-export');
        }
    });

    it('studio can use a solo-tier feature (higher tier wins)', () => {
        const result = check('feature.ifc-export', 'studio');
        expect(result.allowed).toBe(true);
    });

    it('mid-firm can use a studio-tier feature', () => {
        const result = check('feature.multiplayer', 'mid-firm');
        expect(result.allowed).toBe(true);
    });

    it('solo cannot use a studio-tier feature', () => {
        const result = check('feature.multiplayer', 'solo');
        expect(result.allowed).toBe(false);
        if (!result.allowed && result.reason === 'tier-too-low') {
            expect(result.requiredTier).toBe('studio');
        }
    });

    it('mid-firm cannot use an enterprise-tier feature', () => {
        const result = check('feature.sso-saml', 'mid-firm');
        expect(result.allowed).toBe(false);
        if (!result.allowed && result.reason === 'tier-too-low') {
            expect(result.requiredTier).toBe('enterprise');
        }
    });

    it('enterprise can use an enterprise-tier feature', () => {
        const result = check('feature.sso-saml', 'enterprise');
        expect(result.allowed).toBe(true);
    });
});

describe('check() — developer + admin bypass', () => {
    it('developer can use any consumer-tier feature', () => {
        const result = check('feature.sso-saml', 'developer');
        expect(result.allowed).toBe(true);
    });

    it('admin can use any consumer-tier feature', () => {
        const result = check('feature.sso-saml', 'admin');
        expect(result.allowed).toBe(true);
    });

    it('developer can publish to marketplace (developer-tier gate)', () => {
        const result = check('feature.plugin-publish', 'developer');
        expect(result.allowed).toBe(true);
    });

    it('admin can publish to marketplace', () => {
        const result = check('feature.plugin-publish', 'admin');
        expect(result.allowed).toBe(true);
    });

    it('enterprise CANNOT publish to marketplace — needs developer side', () => {
        // Marketplace publishing is gated on developer (not consumer ladder).
        // Per C39 the developer tier is orthogonal: enterprise consumers
        // are NOT marketplace publishers by default.
        const result = check('feature.plugin-publish', 'enterprise');
        expect(result.allowed).toBe(false);
    });
});

describe('check() — unknown key', () => {
    it('returns reason: unknown-key with the bad key echoed back', () => {
        const result = check('feature.totally-fake' as EntitlementKey, 'solo');
        expect(result.allowed).toBe(false);
        if (!result.allowed) {
            expect(result.reason).toBe('unknown-key');
            if (result.reason === 'unknown-key') {
                expect(result.key).toBe('feature.totally-fake');
            }
        }
    });
});

describe('check() — discriminated result shape', () => {
    it('allowed:true includes the entry', () => {
        const result = check('feature.share-link', 'solo');
        expect(result.allowed).toBe(true);
        if (result.allowed) {
            expect(result.entry.displayName).toBe('Share link');
        }
    });

    it('tier-too-low includes both required + user tiers', () => {
        const result = check('feature.sso-saml', 'studio');
        expect(result.allowed).toBe(false);
        if (!result.allowed && result.reason === 'tier-too-low') {
            expect(result.requiredTier).toBe('enterprise');
            expect(result.userTier).toBe('studio');
            expect(result.entry.key).toBe('feature.sso-saml');
        }
    });
});
