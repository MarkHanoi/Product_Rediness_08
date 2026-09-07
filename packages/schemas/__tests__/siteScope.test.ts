// §SITE-SCOPE (L-645, C12 §13 / ADR-0382) — L0 tests for the persisted 3D-Site scope.
//
// What these pin: the value is a discriminated union (a circle cannot smuggle half-extents, a
// rectangle cannot smuggle a radius), the bounds are SANITY bounds and not the slider range, and
// adding `scope` to `SiteModel` is ADDITIVE — every pre-scope snapshot still parses with `null`.

import { describe, expect, it } from 'vitest';
import {
    SiteScopeSchema,
    SiteScopeShapeSchema,
    SITE_SCOPE_SANITY_MIN_M,
    SITE_SCOPE_SANITY_MAX_M,
    SiteModelSchema,
} from '../src/site/index.js';

describe('SiteScopeSchema — the value shape', () => {
    it('parses a circle', () => {
        expect(SiteScopeSchema.parse({ shape: 'circle', radiusM: 900 })).toEqual({
            shape: 'circle',
            radiusM: 900,
        });
    });

    it('parses a rectangle with both half-extents', () => {
        expect(
            SiteScopeSchema.parse({ shape: 'rectangle', halfWidthM: 600, halfDepthM: 450 }),
        ).toEqual({ shape: 'rectangle', halfWidthM: 600, halfDepthM: 450 });
    });

    it('a circle cannot carry half-extents and a rectangle cannot carry a radius', () => {
        // Zod strips unknown keys on a plain object; what matters is that the DEFINING number of
        // the other branch is not accepted in its place.
        expect(() => SiteScopeSchema.parse({ shape: 'circle', halfWidthM: 600, halfDepthM: 450 })).toThrow();
        expect(() => SiteScopeSchema.parse({ shape: 'rectangle', radiusM: 900 })).toThrow();
        expect(() => SiteScopeSchema.parse({ shape: 'rectangle', halfWidthM: 600 })).toThrow();
    });

    it('rejects an unknown shape', () => {
        expect(() => SiteScopeSchema.parse({ shape: 'hexagon', radiusM: 900 })).toThrow();
        expect(SiteScopeShapeSchema.options).toEqual(['circle', 'rectangle']);
    });

    it.each([NaN, Infinity, -Infinity, 0, -1, SITE_SCOPE_SANITY_MIN_M - 1, SITE_SCOPE_SANITY_MAX_M + 1])(
        'rejects a radius of %s (sanity bounds, non-finite, non-positive)',
        (bad) => {
            expect(() => SiteScopeSchema.parse({ shape: 'circle', radiusM: bad })).toThrow();
        },
    );

    it('the sanity bounds are inclusive and are NOT the slider range', () => {
        expect(() => SiteScopeSchema.parse({ shape: 'circle', radiusM: SITE_SCOPE_SANITY_MIN_M })).not.toThrow();
        expect(() => SiteScopeSchema.parse({ shape: 'circle', radiusM: SITE_SCOPE_SANITY_MAX_M })).not.toThrow();
        // The product slider is 150 … 1781 m today (a measured tile fan-out fact that lives beside
        // the measurement, not here). A stored 5000 m circle is a VALID FILE — it is clamped on
        // read, never rejected at parse, so re-measuring a ceiling cannot become data loss (C47).
        expect(() => SiteScopeSchema.parse({ shape: 'circle', radiusM: 5000 })).not.toThrow();
        expect(SITE_SCOPE_SANITY_MIN_M).toBeLessThan(150);
        expect(SITE_SCOPE_SANITY_MAX_M).toBeGreaterThan(1781);
    });
});

describe('SiteModel.scope — additive, null by default', () => {
    const base = {
        id: 'site_proj-001',
        projectId: 'proj-001',
        location: {},
        parcel: {},
        provenance: { source: 'auto-promoted' },
    };

    it('a pre-scope snapshot (no `scope` key) parses with scope: null', () => {
        const parsed = SiteModelSchema.parse(base);
        expect(parsed.scope).toBeNull();
    });

    it('an explicit null round-trips', () => {
        expect(SiteModelSchema.parse({ ...base, scope: null }).scope).toBeNull();
    });

    it('an authored scope round-trips verbatim', () => {
        const scope = { shape: 'rectangle', halfWidthM: 700, halfDepthM: 500 } as const;
        expect(SiteModelSchema.parse({ ...base, scope }).scope).toEqual(scope);
    });

    it('an invalid scope is rejected at the model boundary, not silently nulled', () => {
        expect(() => SiteModelSchema.parse({ ...base, scope: { shape: 'circle', radiusM: -5 } })).toThrow();
    });
});
