// Tests for the El Sauzal (INE 38041) rule pack — the honesty-gate invariants matter as much as
// the numbers: this pack must NEVER be verified by anything other than a human signature, and it
// must NEVER claim a zone family it did not transcribe.

import { describe, expect, it } from 'vitest';
import {
    EL_SAUZAL_ENVELOPE_VERIFIED,
    EL_SAUZAL_JURISDICTION_ID,
    EL_SAUZAL_PACK_DEFAULT_CONFIDENCE,
    EL_SAUZAL_ZONE_CODES,
    ES_EL_SAUZAL_PACK,
    elSauzalNoRulePackRefusal,
} from '../src/rulepacks/esElSauzal.js';

describe('EL_SAUZAL_ENVELOPE_VERIFIED', () => {
    it('is false — no jurisdiction may ship pre-verified', () => {
        expect(EL_SAUZAL_ENVELOPE_VERIFIED).toBe(false);
    });
});

describe('EL_SAUZAL_ZONE_CODES', () => {
    it('names exactly the 17 RE-ViUf-N codes present in ZUSO.dbf', () => {
        expect(EL_SAUZAL_ZONE_CODES).toEqual(
            Array.from({ length: 17 }, (_, i) => `RE-ViUf-${i + 1}`),
        );
    });

    it('never claims the RE-ViCo family (unresolved typology binding)', () => {
        expect(EL_SAUZAL_ZONE_CODES.some((c) => c.startsWith('RE-ViCo'))).toBe(false);
    });
});

describe('ES_EL_SAUZAL_PACK', () => {
    it('parses (schema-valid) with jurisdictionId/crs/confidence set', () => {
        expect(ES_EL_SAUZAL_PACK.jurisdictionId).toBe(EL_SAUZAL_JURISDICTION_ID);
        expect(ES_EL_SAUZAL_PACK.crs).toBe('EPSG:32628');
        expect(ES_EL_SAUZAL_PACK.defaultConfidence).toBe('estimated-ruleset');
        expect(EL_SAUZAL_PACK_DEFAULT_CONFIDENCE).toBe('estimated-ruleset');
    });

    it('ships exactly 17 zones, one per RE-ViUf-N code', () => {
        expect(ES_EL_SAUZAL_PACK.zones).toHaveLength(17);
        const codes = ES_EL_SAUZAL_PACK.zones.map((z) => z.code).sort();
        expect(codes).toEqual([...EL_SAUZAL_ZONE_CODES].sort());
    });

    it('every zone carries the cited Ciudad Jardín envelope (Art. 10.24-10.32)', () => {
        for (const zone of ES_EL_SAUZAL_PACK.zones) {
            expect(zone.maxHeight_m).toBe(8.44);
            expect(zone.maxFloors).toBe(2);
            expect(zone.plotRatioFAR).toBe(0.6);
            expect(zone.maxCoverage).toBe(0.33);
            expect(zone.setbacks).toEqual({ front_m: 5, side_m: 3, rear_m: 3 });
            expect(zone.permittedUse).toEqual(['residential']);
            expect(zone.ordinanceRef).toBeTruthy();
            expect(zone.ordinanceRef).toContain('Art. 10.25');
            expect(zone.ordinanceRef).toContain('Art. 10.27');
        }
    });

    it('the Art. 10.31 height formula reproduces Art. 10.25\'s stated 8.44 m for n=2', () => {
        // H max = 1.40 + 3.80 + 3.24 * (n - 1), n = 2
        const hMax = 1.4 + 3.8 + 3.24 * (2 - 1);
        expect(hMax).toBeCloseTo(8.44, 2);
    });

    it('every field carries ordinance-pdf provenance', () => {
        for (const zone of ES_EL_SAUZAL_PACK.zones) {
            expect(zone.fieldProvenance.maxHeight).toBe('ordinance-pdf');
            expect(zone.fieldProvenance.maxFloors).toBe('ordinance-pdf');
            expect(zone.fieldProvenance.maxFAR).toBe('ordinance-pdf');
            expect(zone.fieldProvenance.maxCoverage).toBe('ordinance-pdf');
        }
    });
});

describe('elSauzalNoRulePackRefusal', () => {
    it('is legallyGrounded: false and carries no ordinanceRef (gate shut)', () => {
        const refusal = elSauzalNoRulePackRefusal('RE-ViUf-3');
        expect(refusal.legallyGrounded).toBe(false);
        expect(refusal.ordinanceRef).toBeNull();
        expect(refusal.code).toBe('no-rule-pack');
    });

    it('distinguishes a packed-but-unsigned zone from a genuinely unpacked zone in its headline', () => {
        const packed = elSauzalNoRulePackRefusal('RE-ViUf-3');
        const unpacked = elSauzalNoRulePackRefusal('RE-ViCo-7');
        expect(packed.headline).not.toEqual(unpacked.headline);
        expect(packed.headline).toContain('Ciudad Jardín');
        expect(unpacked.headline).toContain('outside the packed');
    });

    it('never throws for a null zone code', () => {
        expect(() => elSauzalNoRulePackRefusal(null)).not.toThrow();
    });
});
