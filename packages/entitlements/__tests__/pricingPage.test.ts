// A.18.a — pricing-page generator tests.
//
// Pins the C39 §1.13 invariants:
//   - sections appear in canonical order
//   - rows have a complete per-tier availability matrix
//   - totalEntitlements equals the registry size

import { describe, expect, it } from 'vitest';
import { buildPricingPageData } from '../src/pricingPage.js';
import { ENTITLEMENT_REGISTRY } from '../src/registry.js';

describe('buildPricingPageData()', () => {
    it('totalEntitlements equals the registry size', () => {
        const data = buildPricingPageData();
        expect(data.totalEntitlements).toBe(ENTITLEMENT_REGISTRY.length);
    });

    it('exposes the 5 consumer tiers', () => {
        const data = buildPricingPageData();
        expect(data.tiers).toEqual([
            'free-trial',
            'solo',
            'studio',
            'mid-firm',
            'enterprise',
        ]);
    });

    it('sections appear in canonical order', () => {
        const data = buildPricingPageData();
        const order = data.sections.map((s) => s.category);
        // Canonical: design → output → collaboration → quota → marketplace → enterprise.
        // Any section without entries is omitted; current registry covers all 6.
        expect(order).toEqual([
            'design',
            'output',
            'collaboration',
            'quota',
            'marketplace',
            'enterprise',
        ]);
    });

    it('every row has a complete per-tier availability matrix', () => {
        const data = buildPricingPageData();
        for (const section of data.sections) {
            for (const row of section.rows) {
                expect(row.availability['free-trial']).toBeDefined();
                expect(row.availability.solo).toBeDefined();
                expect(row.availability.studio).toBeDefined();
                expect(row.availability['mid-firm']).toBeDefined();
                expect(row.availability.enterprise).toBeDefined();
                // developer + admin always true (orthogonal classes).
                expect(row.availability.developer).toBe(true);
                expect(row.availability.admin).toBe(true);
            }
        }
    });

    it('availability matrix is monotonic up the consumer ladder', () => {
        // For each row, if a lower tier qualifies, every higher tier MUST too.
        const data = buildPricingPageData();
        for (const section of data.sections) {
            for (const row of section.rows) {
                const ladder = [
                    row.availability['free-trial'],
                    row.availability.solo,
                    row.availability.studio,
                    row.availability['mid-firm'],
                    row.availability.enterprise,
                ];
                let seenTrue = false;
                for (const v of ladder) {
                    if (v) seenTrue = true;
                    if (seenTrue) {
                        expect(v, `${row.key}: monotonic broken`).toBe(true);
                    }
                }
            }
        }
    });

    it('IFC export is available solo-and-above but NOT free-trial', () => {
        const data = buildPricingPageData();
        const ifc = data.sections
            .find((s) => s.category === 'output')!
            .rows.find((r) => r.key === 'feature.ifc-export')!;
        expect(ifc.availability['free-trial']).toBe(false);
        expect(ifc.availability.solo).toBe(true);
        expect(ifc.availability.studio).toBe(true);
        expect(ifc.availability['mid-firm']).toBe(true);
        expect(ifc.availability.enterprise).toBe(true);
    });

    it('SSO is enterprise-only', () => {
        const data = buildPricingPageData();
        const sso = data.sections
            .find((s) => s.category === 'enterprise')!
            .rows.find((r) => r.key === 'feature.sso-saml')!;
        expect(sso.availability['free-trial']).toBe(false);
        expect(sso.availability.solo).toBe(false);
        expect(sso.availability.studio).toBe(false);
        expect(sso.availability['mid-firm']).toBe(false);
        expect(sso.availability.enterprise).toBe(true);
    });

    it('marketplace-publish: NO consumer tier qualifies (developer-only)', () => {
        const data = buildPricingPageData();
        const publish = data.sections
            .find((s) => s.category === 'marketplace')!
            .rows.find((r) => r.key === 'feature.plugin-publish')!;
        // None of free-trial..enterprise qualify (developer-tier gate).
        expect(publish.availability['free-trial']).toBe(false);
        expect(publish.availability.solo).toBe(false);
        expect(publish.availability.studio).toBe(false);
        expect(publish.availability['mid-firm']).toBe(false);
        expect(publish.availability.enterprise).toBe(false);
        // But developer + admin always qualify.
        expect(publish.availability.developer).toBe(true);
        expect(publish.availability.admin).toBe(true);
    });

    it('section row counts sum to totalEntitlements', () => {
        const data = buildPricingPageData();
        const sum = data.sections.reduce((acc, s) => acc + s.rows.length, 0);
        expect(sum).toBe(data.totalEntitlements);
    });

    it('every section has at least one row', () => {
        const data = buildPricingPageData();
        for (const section of data.sections) {
            expect(section.rows.length, section.category).toBeGreaterThan(0);
        }
    });

    it('rows within a section preserve registry insertion order', () => {
        const data = buildPricingPageData();
        // Build expected order per section from the raw registry.
        const expectedByCategory = new Map<string, string[]>();
        for (const entry of ENTITLEMENT_REGISTRY) {
            const arr = expectedByCategory.get(entry.category) ?? [];
            arr.push(entry.key);
            expectedByCategory.set(entry.category, arr);
        }
        for (const section of data.sections) {
            const actual = section.rows.map((r) => r.key);
            const expected = expectedByCategory.get(section.category);
            expect(actual).toEqual(expected);
        }
    });

    it('tier display names are human-readable for every tier', () => {
        const data = buildPricingPageData();
        expect(data.tierDisplayNames['free-trial']).toBe('Free Trial');
        expect(data.tierDisplayNames.solo).toBe('Solo');
        expect(data.tierDisplayNames.studio).toBe('Studio');
        expect(data.tierDisplayNames['mid-firm']).toBe('Mid-Firm');
        expect(data.tierDisplayNames.enterprise).toBe('Enterprise');
    });
});
