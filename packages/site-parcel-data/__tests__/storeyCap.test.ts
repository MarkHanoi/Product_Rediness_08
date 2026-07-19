// §L-401 slice 2 — storey height-cap tests.
//
// Every number this module returns is a claim about what is LEGAL to build, so the tests
// target the ways it could be plausibly WRONG rather than merely broken:
//   • stealing a legal storey to floating-point error (the exact-fit case is the COMMON case);
//   • inventing a cap from a missing constraint (silently under-building the plot);
//   • using the footprint instead of the site area as the FAR denominator (ditto, worse);
//   • emitting a non-compliant building instead of reporting infeasibility.

import { describe, it, expect } from 'vitest';
import { capStoreysToEnvelope } from '../src/storeyCap';

describe('§L-401 capStoreysToEnvelope', () => {
    it('leaves the request untouched when nothing binds (byte-identity for un-zoned sites)', () => {
        const r = capStoreysToEnvelope({ requestedStoreys: 6, maxHeightM: null, storeyHeightM: 3 });
        expect(r.storeys).toBe(6);
        expect(r.capped).toBe(false);
        expect(r.binding).toBe('none');
        expect(r.infeasible).toBe(false);
    });

    it('caps to the height limit', () => {
        // 12 m limit at 3 m storeys ⇒ 4 storeys.
        const r = capStoreysToEnvelope({ requestedStoreys: 10, maxHeightM: 12, storeyHeightM: 3 });
        expect(r.storeys).toBe(4);
        expect(r.capped).toBe(true);
        expect(r.binding).toBe('height');
        expect(r.resultingHeightM).toBe(12);
    });

    it('does NOT steal a legal storey to floating-point error (the exact-fit case)', () => {
        // An 8.1 m limit at 2.7 m storeys is EXACTLY 3 storeys — and both numbers are ordinary
        // real-world zoning values. But 8.1 / 2.7 === 2.9999999999999996 in IEEE 754, so a
        // naive Math.floor returns 2 and silently costs the developer a whole legal storey.
        // Exact fits are the COMMON case in zoning (limits are usually set to a whole number
        // of storeys), so this is the main path, not an edge case. A sweep of realistic
        // limit/storey pairs finds ~100 such undershoots.
        expect(8.1 / 2.7).toBeLessThan(3);                       // prove the hazard is real
        const r = capStoreysToEnvelope({ requestedStoreys: 5, maxHeightM: 8.1, storeyHeightM: 2.7 });
        expect(r.storeys).toBe(3);
        expect(r.capped).toBe(true);
    });

    it('never grants a storey that does not genuinely fit', () => {
        // The epsilon must not round a real overflow away: 11.9 m cannot hold 4 × 3 m.
        const r = capStoreysToEnvelope({ requestedStoreys: 10, maxHeightM: 11.9, storeyHeightM: 3 });
        expect(r.storeys).toBe(3);
    });

    it('reports INFEASIBLE rather than emitting a non-compliant building', () => {
        const r = capStoreysToEnvelope({ requestedStoreys: 4, maxHeightM: 2.5, storeyHeightM: 3 });
        expect(r.infeasible).toBe(true);
        expect(r.storeys).toBe(1);            // a 0-storey answer is useless; caller must surface it
        expect(r.binding).toBe('height');
        expect(r.explanation).toMatch(/cannot comply/i);
    });

    it('SKIPS the FAR cap when the site area is unknown — never approximates one', () => {
        // Honesty rule: an invented cap under-builds the plot invisibly.
        const r = capStoreysToEnvelope({
            requestedStoreys: 8, maxHeightM: null, storeyHeightM: 3,
            maxFAR: 2, footprintAreaM2: 500, siteAreaM2: null,
        });
        expect(r.farAllowedStoreys).toBeNull();
        expect(r.storeys).toBe(8);
        expect(r.capped).toBe(false);
    });

    it('FAR uses SITE area as the denominator, not the footprint (or it under-builds)', () => {
        // Site 1000 m², FAR 2 ⇒ GFA 2000 m². Footprint 500 m² ⇒ 4 storeys.
        // The wrong convention (footprint × FAR) would give storeys ≤ FAR = 2 — HALF the
        // legal building. That error is invisible: the result still looks like a real answer.
        const r = capStoreysToEnvelope({
            requestedStoreys: 10, maxHeightM: null, storeyHeightM: 3,
            maxFAR: 2, siteAreaM2: 1000, footprintAreaM2: 500,
        });
        expect(r.farAllowedStoreys).toBe(4);
        expect(r.storeys).toBe(4);
        expect(r.binding).toBe('far');
        expect(r.storeys).toBeGreaterThan(2);   // guards specifically against the footprint×FAR bug
    });

    it('the STRICTER of height and FAR governs, and is named correctly', () => {
        // Height allows 10, FAR allows 4 ⇒ FAR binds.
        const farBinds = capStoreysToEnvelope({
            requestedStoreys: 20, maxHeightM: 30, storeyHeightM: 3,
            maxFAR: 2, siteAreaM2: 1000, footprintAreaM2: 500,
        });
        expect(farBinds.storeys).toBe(4);
        expect(farBinds.binding).toBe('far');

        // Height allows 3, FAR allows 4 ⇒ height binds.
        const heightBinds = capStoreysToEnvelope({
            requestedStoreys: 20, maxHeightM: 9, storeyHeightM: 3,
            maxFAR: 2, siteAreaM2: 1000, footprintAreaM2: 500,
        });
        expect(heightBinds.storeys).toBe(3);
        expect(heightBinds.binding).toBe('height');
    });

    it('never reports a binding when it did not actually cap', () => {
        // Requesting FEWER storeys than allowed must not be labelled "capped by height".
        const r = capStoreysToEnvelope({ requestedStoreys: 2, maxHeightM: 30, storeyHeightM: 3 });
        expect(r.storeys).toBe(2);
        expect(r.capped).toBe(false);
        expect(r.binding).toBe('none');
        expect(r.heightAllowedStoreys).toBe(10);   // still reported, for the explain-why panel
    });

    it('survives degenerate input without inventing an answer', () => {
        const noStoreyH = capStoreysToEnvelope({ requestedStoreys: 5, maxHeightM: 12, storeyHeightM: 0 });
        expect(noStoreyH.storeys).toBe(5);
        expect(noStoreyH.capped).toBe(false);

        const negative = capStoreysToEnvelope({ requestedStoreys: -3, maxHeightM: 12, storeyHeightM: 3 });
        expect(negative.storeys).toBeGreaterThanOrEqual(1);

        const nanHeight = capStoreysToEnvelope({ requestedStoreys: 5, maxHeightM: Number.NaN, storeyHeightM: 3 });
        expect(nanHeight.capped).toBe(false);
        expect(nanHeight.heightAllowedStoreys).toBeNull();
    });
});
