// §GB-SPECIFICITY-INVERSION (L-652) — a PIN on a latent border regression that is inert TODAY and
// activates silently the day one field changes.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT IS WRONG, AND WHY NOTHING IS BROKEN YET
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `parcelProviders/registry.ts` ranks candidates by SMALLEST BBOX AREA (`parcelJurisdictionSpecificity`,
// the L-650 fix). `SCOTLAND_BBOX` ≈ 50.4 deg² is FRACTIONALLY SMALLER than `ENGLAND_BBOX` ≈ 51.2 deg²,
// so in the 54.6–55.9°N band where the two boxes overlap — Carlisle, Newcastle, Berwick, the whole
// Anglo-Scottish border — SCOTLAND IS RANKED FIRST FOR ENGLISH LAND. The area difference is 1.6 %; it
// carries no information about which land register governs, and the rule reads it as if it did.
//
// It is harmless today for ONE reason and one only: `GB-SCT` is a `footprint-fallback` with
// `proxyPath: null`, so the priority resolver calls it, gets `null` immediately (there is nothing to
// call), and falls THROUGH to the live HMLR England cadastre. The registry row says so in a comment.
//
// ⚠ THE MOMENT `GB-SCT` GAINS A PROXY AND BECOMES `kind: 'cadastral'` — which is a plausible,
// welcome change, gated only on a ScotLIS data agreement — every English border click starts asking
// Registers of Scotland first, and a Newcastle title would be answered from the WRONG REGISTER.
// The correct fix at that point is a KIND-AWARE sort (a `footprint-fallback` must never out-rank a
// `cadastral`), NOT a hand-tuned bbox. This file makes that change impossible to make silently: the
// pin below fails, and its message says what to do.
//
// Sibling of `jurisdictionSpecificity.test.ts`, which fixes the same class of defect in the RULE-PACK
// registry. The two registries deliberately use DIFFERENT rules — see the §JURISDICTION-SPECIFICITY
// header in `rulepacks/registry.ts` on why area is defensible for a fall-through walk and not for a
// single verdict — and this file is the evidence for that argument.
//
// NETWORK: none.

import { describe, it, expect } from 'vitest';
import {
    resolveParcelCandidates,
    parcelJurisdictionSpecificity,
    listParcelJurisdictions,
} from '../src/parcelProviders/registry.js';
import { ENGLAND_BBOX } from '../src/parcelProviders/gbOsInspireParcelProvider.js';
import { SCOTLAND_BBOX } from '../src/parcelProviders/scotlandRosParcelProvider.js';

const area = (b: { minLat: number; maxLat: number; minLon: number; maxLon: number }): number =>
    (b.maxLat - b.minLat) * (b.maxLon - b.minLon);

/** Real English places inside the Anglo-Scottish overlap band. */
const ENGLISH_BORDER_PLACES: ReadonlyArray<readonly [string, number, number]> = [
    ['Carlisle', 54.8925, -2.9329],
    ['Newcastle upon Tyne', 54.9783, -1.6178],
    ['Berwick-upon-Tweed', 55.7708, -2.0059],
    ['Hexham', 54.9714, -2.1017],
];

describe('§GB-SPECIFICITY-INVERSION — the area rule ranks Scotland above England on English land', () => {
    it('measures the inversion rather than describing it', () => {
        // If this ever flips, the note in the GB-SCT registry row is stale and must be corrected.
        expect(area(SCOTLAND_BBOX)).toBeLessThan(area(ENGLAND_BBOX));
    });

    it('ranks GB-SCT FIRST at every English border place — the live mis-ranking', () => {
        for (const [name, lat, lon] of ENGLISH_BORDER_PLACES) {
            const ids = resolveParcelCandidates(lat, lon).map((j) => j.regionCode);
            expect(ids, `${name} must be claimed by both GB boxes`).toContain('GB-ENG');
            expect(ids, `${name} must be claimed by both GB boxes`).toContain('GB-SCT');
            expect(
                ids.indexOf('GB-SCT'),
                `${name}: GB-SCT is ranked ahead of GB-ENG by bbox area`,
            ).toBeLessThan(ids.indexOf('GB-ENG'));
        }
    });

    it('⚠ THE PIN — GB-SCT is inert ONLY because it is a proxy-less footprint-fallback', () => {
        const sct = listParcelJurisdictions().find((j) => j.regionCode === 'GB-SCT');
        expect(sct, 'GB-SCT must stay registered — an absent row lies by omission').toBeDefined();
        const why =
            'GB-SCT has become a live cadastral row while the parcel registry still sorts candidates ' +
            'by bbox area alone. SCOTLAND_BBOX is smaller than ENGLAND_BBOX, so Registers of Scotland ' +
            'is now asked FIRST for English border land (Carlisle/Newcastle/Berwick) and can answer ' +
            'from the wrong register. Before wiring the proxy, make the sort KIND-AWARE — a ' +
            'footprint-fallback must never out-rank a cadastral, and two cadastral rows must not be ' +
            'ordered by a 1.6% bbox-area difference. Do NOT "fix" this by shrinking a bbox.';
        expect(sct!.kind, why).toBe('footprint-fallback');
        expect(sct!.proxyPath, why).toBeNull();
    });

    it('…so an English border click still falls THROUGH to the live England cadastre', () => {
        // The behavioural consequence, asserted through the real resolver rather than inferred.
        for (const [name, lat, lon] of ENGLISH_BORDER_PLACES) {
            const cadastral = resolveParcelCandidates(lat, lon).filter((j) => j.kind === 'cadastral');
            expect(cadastral[0]?.regionCode, `${name} first CADASTRAL candidate`).toBe('GB-ENG');
        }
    });

    it('the area metric itself is still well-defined for both GB rows (no +Infinity fall-off)', () => {
        for (const code of ['GB-ENG', 'GB-SCT']) {
            const row = listParcelJurisdictions().find((j) => j.regionCode === code)!;
            expect(Number.isFinite(parcelJurisdictionSpecificity(row)), code).toBe(true);
        }
    });
});
