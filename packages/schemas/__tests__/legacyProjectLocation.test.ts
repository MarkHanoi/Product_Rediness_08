// A.7.e — legacy `Project.location` ↔ SiteLocation adapter tests.
//
// Pins the [C19 §8.1 + §8.2] invariants:
//   - promotion is information-preserving for the 5 v1 fields
//   - v2-only fields default to null (legacy snapshots had no PII)
//   - the reverse view is a clean strip (lossy by design)
//   - v1FieldsEqual ignores the 3 v2-only fields

import { describe, expect, it } from 'vitest';
import {
    promoteProjectLocationToSite,
    siteLocationToLegacyProjectLocation,
    v1FieldsEqual,
    type LegacyProjectLocation,
} from '../src/site/legacyProjectLocation.js';
import { SiteLocationSchema } from '../src/site/SiteLocation.js';

const LEGACY: LegacyProjectLocation = {
    latitude: 51.5074,
    longitude: -0.1278,
    elevationAsl: 35,
    trueNorth: 0.123,
    basePoint: { x: 1, y: 2, z: 3 },
};

describe('promoteProjectLocationToSite()', () => {
    it('copies the 5 v1 fields verbatim', () => {
        const site = promoteProjectLocationToSite(LEGACY);
        expect(site.latitude).toBe(LEGACY.latitude);
        expect(site.longitude).toBe(LEGACY.longitude);
        expect(site.elevationAsl).toBe(LEGACY.elevationAsl);
        expect(site.trueNorth).toBe(LEGACY.trueNorth);
        expect(site.basePoint).toEqual(LEGACY.basePoint);
    });

    it('defaults the v2-only fields to null (no PII in v1)', () => {
        const site = promoteProjectLocationToSite(LEGACY);
        expect(site.crs).toBeNull();
        expect(site.siteAddress).toBeNull();
        expect(site.landTitleNumber).toBeNull();
    });

    it('output parses cleanly against the canonical SiteLocationSchema', () => {
        const site = promoteProjectLocationToSite(LEGACY);
        expect(() => SiteLocationSchema.parse(site)).not.toThrow();
    });

    it('is idempotent — same input → same output', () => {
        const a = promoteProjectLocationToSite(LEGACY);
        const b = promoteProjectLocationToSite(LEGACY);
        expect(a).toEqual(b);
    });

    it('handles the all-zeros legacy (a freshly-created project)', () => {
        const site = promoteProjectLocationToSite({
            latitude: 0,
            longitude: 0,
            elevationAsl: 0,
            trueNorth: 0,
            basePoint: { x: 0, y: 0, z: 0 },
        });
        expect(site.latitude).toBe(0);
        expect(site.longitude).toBe(0);
        expect(site.crs).toBeNull();
    });

    it('rejects out-of-range legacy values via the v2 schema', () => {
        // SiteLocationSchema validates lat ∈ [-90, 90]; promoted illegal
        // legacy must throw, not silently clamp.
        expect(() =>
            promoteProjectLocationToSite({
                ...LEGACY,
                latitude: 91,
            }),
        ).toThrow();
        expect(() =>
            promoteProjectLocationToSite({
                ...LEGACY,
                longitude: -181,
            }),
        ).toThrow();
    });

    it('handles trueNorth at the radian edge cases', () => {
        const pos = promoteProjectLocationToSite({
            ...LEGACY,
            trueNorth: Math.PI,
        });
        expect(pos.trueNorth).toBeCloseTo(Math.PI);
        const neg = promoteProjectLocationToSite({
            ...LEGACY,
            trueNorth: -Math.PI,
        });
        expect(neg.trueNorth).toBeCloseTo(-Math.PI);
    });
});

describe('siteLocationToLegacyProjectLocation()', () => {
    it('strips the 3 v2-only fields cleanly', () => {
        const site = SiteLocationSchema.parse({
            latitude: 40.7128,
            longitude: -74.006,
            elevationAsl: 10,
            trueNorth: 0,
            basePoint: { x: 0, y: 0, z: 0 },
            crs: 'EPSG:32618',
            siteAddress: '1 Main St, NYC, NY 10001',
            landTitleNumber: 'NYC-2026-12345',
        });
        const legacy = siteLocationToLegacyProjectLocation(site);
        // Legacy has only the 5 v1 fields.
        expect(Object.keys(legacy).sort()).toEqual([
            'basePoint',
            'elevationAsl',
            'latitude',
            'longitude',
            'trueNorth',
        ]);
        expect(legacy.latitude).toBe(40.7128);
        expect(legacy.longitude).toBe(-74.006);
    });

    it('round-trips promote → strip when v2-only fields are null', () => {
        const site = promoteProjectLocationToSite(LEGACY);
        const back = siteLocationToLegacyProjectLocation(site);
        expect(back).toEqual(LEGACY);
    });

    it('strip → promote loses the v2-only fields (lossy by design)', () => {
        const original = SiteLocationSchema.parse({
            latitude: 35,
            longitude: 139,
            elevationAsl: 5,
            trueNorth: 0,
            basePoint: { x: 0, y: 0, z: 0 },
            crs: 'EPSG:32654',
            siteAddress: 'Tokyo',
            landTitleNumber: 'JP-XXX',
        });
        const stripped = siteLocationToLegacyProjectLocation(original);
        const repromoted = promoteProjectLocationToSite(stripped);
        // v1 fields preserve.
        expect(repromoted.latitude).toBe(original.latitude);
        expect(repromoted.longitude).toBe(original.longitude);
        // v2-only fields LOST — null in the repromoted output.
        expect(repromoted.crs).toBeNull();
        expect(repromoted.siteAddress).toBeNull();
        expect(repromoted.landTitleNumber).toBeNull();
    });
});

describe('v1FieldsEqual()', () => {
    const A = promoteProjectLocationToSite(LEGACY);

    it('returns true for identical sites', () => {
        const B = promoteProjectLocationToSite(LEGACY);
        expect(v1FieldsEqual(A, B)).toBe(true);
    });

    it('returns false when latitude differs', () => {
        const B = promoteProjectLocationToSite({ ...LEGACY, latitude: 52 });
        expect(v1FieldsEqual(A, B)).toBe(false);
    });

    it('returns false when basePoint differs', () => {
        const B = promoteProjectLocationToSite({
            ...LEGACY,
            basePoint: { x: 99, y: 2, z: 3 },
        });
        expect(v1FieldsEqual(A, B)).toBe(false);
    });

    it('IGNORES the v2-only fields (the whole point)', () => {
        const B = SiteLocationSchema.parse({
            ...LEGACY,
            crs: 'EPSG:4326',
            siteAddress: 'totally different address',
            landTitleNumber: 'LTN-XYZ',
        });
        // v1 fields are identical → returns true even though v2 fields diverge.
        expect(v1FieldsEqual(A, B)).toBe(true);
    });

    it('returns false when trueNorth differs', () => {
        const B = promoteProjectLocationToSite({
            ...LEGACY,
            trueNorth: LEGACY.trueNorth + 0.001,
        });
        expect(v1FieldsEqual(A, B)).toBe(false);
    });

    it('returns false when elevationAsl differs', () => {
        const B = promoteProjectLocationToSite({
            ...LEGACY,
            elevationAsl: 100,
        });
        expect(v1FieldsEqual(A, B)).toBe(false);
    });
});
