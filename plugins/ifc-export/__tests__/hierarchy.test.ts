// hierarchy — IFC-α-1 (2026-06-01) pure-helper tests.
//
// The buildHierarchy() / buildSiteAddress() functions need a WebIFC.IfcAPI
// mock to exercise — covered indirectly by the IFC4X3Exporter round-trip
// tests. This file targets the pure exported helper `decimalToDegMinSecArray`
// directly + structural checks on the new SiteModel + SiteAddressInput
// type contracts.

import { describe, expect, it } from 'vitest';
import {
    decimalToDegMinSecArray,
    type SiteModel,
    type SiteAddressInput,
} from '../src/hierarchy.js';

describe('decimalToDegMinSecArray (IFC-α-1)', () => {
    it('zero → [0, 0, 0, 0]', () => {
        expect(decimalToDegMinSecArray(0)).toEqual([0, 0, 0, 0]);
    });

    it('positive integer degrees → [deg, 0, 0, 0]', () => {
        expect(decimalToDegMinSecArray(45)).toEqual([45, 0, 0, 0]);
        expect(decimalToDegMinSecArray(180)).toEqual([180, 0, 0, 0]);
    });

    it('negative integer degrees → [-deg, 0, 0, 0] (sign only on degrees)', () => {
        expect(decimalToDegMinSecArray(-45)).toEqual([-45, 0, 0, 0]);
        expect(decimalToDegMinSecArray(-180)).toEqual([-180, 0, 0, 0]);
    });

    it('London (51.5074°) → approx [51, 30, 26, …]', () => {
        const [d, m, s, mu] = decimalToDegMinSecArray(51.5074);
        expect(d).toBe(51);
        expect(m).toBe(30);
        expect(s).toBe(26);
        // Millionths-of-second: 51.5074° ≈ 51° 30′ 26.64″ → ~640000 millionths.
        // Allow tight tolerance (rounding artifacts up to a few units).
        expect(Math.abs(mu - 640000)).toBeLessThan(50);
    });

    it('Sydney (-33.8688°) → approx [-33, 52, 7, …] (sign on degrees only)', () => {
        const [d, m, s, mu] = decimalToDegMinSecArray(-33.8688);
        expect(d).toBe(-33);
        expect(m).toBe(52);             // non-negative
        expect(s).toBe(7);              // non-negative
        // -33.8688° ≈ -33° 52′ 7.68″ → millionths ~680000.
        expect(Math.abs(mu - 680000)).toBeLessThan(50);
        expect(mu).toBeGreaterThanOrEqual(0);
    });

    it('minute boundary (59.999999°) does NOT roll seconds past 60 (carry-on rounding guard)', () => {
        // Construct a value JUST shy of a degree boundary where rounding
        // could push millionths to 1_000_000. The guard inside the helper
        // bubbles the carry up.
        const [d, m, s, mu] = decimalToDegMinSecArray(0.999999722);  // ≈ 59′ 59.9″ 999_200µs
        expect(s).toBeLessThanOrEqual(59);
        expect(mu).toBeLessThanOrEqual(999_999);
        expect(m).toBeLessThanOrEqual(59);
        // Degrees should still be 0 unless the carry rolled all the way up.
        const deg_or_one = d === 0 || d === 1;
        expect(deg_or_one).toBe(true);
    });

    it('carry-on at exact second boundary (positive)', () => {
        // 1.0001° = 1° + 0.0001° = 1° + 0.36″ → [1, 0, 0, 360000]
        const [d, m, s, mu] = decimalToDegMinSecArray(1.0001);
        expect(d).toBe(1);
        expect(m).toBe(0);
        expect(s).toBe(0);
        expect(Math.abs(mu - 360000)).toBeLessThan(50);
    });

    it('round-trip approximation: deg + min/60 + sec/3600 + millionths/3.6e9 ≈ input', () => {
        const inputs = [0, 51.5074, -33.8688, 90, -90, 0.001, 179.99999];
        for (const input of inputs) {
            const [d, m, s, mu] = decimalToDegMinSecArray(input);
            // Reconstruct: handle sign correctly (sign is on d only).
            const sign = d < 0 ? -1 : 1;
            const absDeg = Math.abs(d);
            const reconstructed = sign * (absDeg + m / 60 + s / 3600 + mu / 3_600_000_000);
            expect(Math.abs(reconstructed - input)).toBeLessThan(1e-6);
        }
    });

    it('returns a 4-tuple of integers (IFC schema requires INTEGER for each component)', () => {
        const result = decimalToDegMinSecArray(12.3456);
        expect(result).toHaveLength(4);
        for (const v of result) {
            expect(Number.isInteger(v)).toBe(true);
        }
    });

    it('does NOT produce negative minutes/seconds/millionths for any input (sign-on-degrees invariant)', () => {
        const inputs = [-180, -179.999, -1, -0.0001, 0, 0.0001, 1, 179.999, 180];
        for (const input of inputs) {
            const [, m, s, mu] = decimalToDegMinSecArray(input);
            expect(m).toBeGreaterThanOrEqual(0);
            expect(s).toBeGreaterThanOrEqual(0);
            expect(mu).toBeGreaterThanOrEqual(0);
        }
    });
});

describe('SiteModel + SiteAddressInput structural contracts (IFC-α-1)', () => {
    it('SiteModel accepts the minimal { latitudeDeg, longitudeDeg, elevationM } shape', () => {
        const site: SiteModel = {
            latitudeDeg: 51.5074,
            longitudeDeg: -0.1278,
            elevationM: 25,
        };
        expect(site.latitudeDeg).toBe(51.5074);
        expect(site.longitudeDeg).toBe(-0.1278);
        expect(site.elevationM).toBe(25);
    });

    it('SiteModel accepts optional landTitleNumber + address', () => {
        const site: SiteModel = {
            latitudeDeg: 0,
            longitudeDeg: 0,
            elevationM: 0,
            landTitleNumber: 'AB-12345-X',
            address: {
                addressLines: ['10 Downing Street'],
                town: 'London',
                region: 'Greater London',
                postalCode: 'SW1A 2AA',
                country: 'United Kingdom',
            },
        };
        expect(site.landTitleNumber).toBe('AB-12345-X');
        expect(site.address?.town).toBe('London');
        expect(site.address?.country).toBe('United Kingdom');
        expect(site.address?.addressLines?.[0]).toBe('10 Downing Street');
    });

    it('SiteAddressInput is independently constructible', () => {
        const addr: SiteAddressInput = {
            town: 'Sydney',
            country: 'Australia',
        };
        expect(addr.town).toBe('Sydney');
        expect(addr.country).toBe('Australia');
    });
});
