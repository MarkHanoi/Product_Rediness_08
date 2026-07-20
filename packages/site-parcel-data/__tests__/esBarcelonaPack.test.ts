// ADR-0271 P5 — the Barcelona ensanche pack.
//
// ⚠ THE FIRST TEST IS THE ONE THAT MATTERS: the pack runs `JurisdictionZoningContractSchema.parse`
// at MODULE LOAD, so a schema violation is a runtime throw, not a type error. `tsc` passing says
// nothing about it. That is the L-445 lesson — a schema half of a feature that nothing exercises
// is indistinguishable from a feature that does not exist.
//
// The rest pin the REFUSALS the founder's source decision does NOT cover. The founder accepted
// the 2009 AMB consolidation (the L-449 human gate). That authorised the Art. 242.2 construction
// and nothing else — so height, floors and FAR must stay null, and a future edit that "helpfully"
// fills them in with the circulating 3,35 m table would be encoding a number the signed source
// does not contain. These tests exist to make that edit fail.

import { describe, it, expect } from 'vitest';
import {
    ES_BARCELONA_ENSANCHE_PACK,
    BCN_ENSANCHE_RULE,
    BCN_ENSANCHE_ZONE_CODES,
} from '../src/rulepacks/esBarcelonaEnsanche.js';

describe('ADR-0271 P5 — the pack is VALID (parses at load)', () => {
    it('parsed the schema without throwing', () => {
        expect(ES_BARCELONA_ENSANCHE_PACK.jurisdictionId).toBe('es-08019-barcelona');
        expect(ES_BARCELONA_ENSANCHE_PACK.zones).toHaveLength(2);
    });

    it('ships `estimated-ruleset`, never `structured`', () => {
        // The source disclaims its own official status. No cleaner copy of the same document can
        // promote this label — it is a property of the source, not of our transcription quality.
        expect(ES_BARCELONA_ENSANCHE_PACK.defaultConfidence).toBe('estimated-ruleset');
    });

    it('registers BOTH 13a and 13E against the same rules', () => {
        // Not a claim they are equivalent — a refusal to pick while the 2002 ordinance's force
        // is unknown. Live MUC returns 13a; the ordinance says 13E substitutes clau 13.
        expect([...BCN_ENSANCHE_ZONE_CODES]).toEqual(['13a', '13E']);
        for (const code of BCN_ENSANCHE_ZONE_CODES) {
            expect(ES_BARCELONA_ENSANCHE_PACK.zones.find((z) => z.code === code)).toBeDefined();
        }
    });
});

describe('ADR-0271 P5 — what the signed source did NOT authorise stays null', () => {
    const zones = () => ES_BARCELONA_ENSANCHE_PACK.zones;

    it('maxHeight_m and maxFloors are NULL — the source contains no height bands', () => {
        // ⚠ IF THIS TEST GOES RED, someone has encoded the 9,00/12,35/…/25,75 m table. That is
        // the claimed *Barcelona variant* at 3,35 m/floor, which verification never located in
        // the accepted document — what it repeatedly confirmed was the GENERIC PGM at 3,05 m.
        // Restore null. An absent number is honest; a plausible one is not.
        for (const z of zones()) {
            expect(z.maxHeight_m).toBeNull();
            expect(z.maxFloors).toBeNull();
        }
    });

    it('plotRatioFAR is NULL — and that is a FINDING, not a gap', () => {
        // PGM Art. 322.1: edificabilitat here is defined "per l'envolupant màxima de volum" —
        // the envelope IS the rule, there is no per-parcel FAR. The 2,20 / 1,20 coefficients are
        // PERI / estudi-de-detall gated (Art. 322.2/.3); applying either per-parcel would
        // over-constrain every plot in the district (C58 §1.11 category error).
        for (const z of zones()) expect(z.plotRatioFAR).toBeNull();
    });

    it('setbacks are NULL, not zero — null ≠ 0 (C58 §1.7a)', () => {
        // 0 would assert "the ordinance requires zero clearance here", which is a claim we have
        // not established. The containment check SKIPS a null edge; it would ENFORCE a 0.
        for (const z of zones()) {
            expect(z.setbacks?.front_m ?? null).toBeNull();
            expect(z.setbacks?.side_m ?? null).toBeNull();
            expect(z.setbacks?.rear_m ?? null).toBeNull();
        }
    });

    it('every populated field is `ordinance-pdf`, never `published-structured`', () => {
        for (const z of zones()) {
            for (const [field, prov] of Object.entries(z.fieldProvenance ?? {})) {
                expect(prov, `${z.code}.${field}`).not.toBe('published-structured');
            }
        }
    });

    it('carries an ordinanceRef naming the source AND its 2009 staleness', () => {
        // C58 §1.3 — an estimated value must cite what it came from. The consolidation date is
        // part of the citation because a 2008 Art. 327 modification post-dates it.
        for (const z of zones()) {
            expect(z.ordinanceRef).toBeTruthy();
            expect(z.ordinanceRef).toMatch(/2009/);
            expect(z.ordinanceRef).toMatch(/Art\. 242\.2/);
        }
    });
});

describe('ADR-0271 P5 — the Art. 242.2 construction, which IS authorised', () => {
    it('carries the ordinance parameters, not a hard-coded depth', () => {
        // The entire point: no `buildableDepth_m` anywhere. A scalar would be someone's answer
        // for one block, which is why the circulating 20 m / 24 m figures contradict each other.
        expect(BCN_ENSANCHE_RULE.kind).toBe('block-derived-alignment');
        expect(BCN_ENSANCHE_RULE).not.toHaveProperty('buildableDepth_m');
        if (BCN_ENSANCHE_RULE.kind === 'block-derived-alignment') {
            expect(BCN_ENSANCHE_RULE.interiorFreeRatio).toBe(0.3);
            expect(BCN_ENSANCHE_RULE.minDepth_m).toBe(11);
            expect(BCN_ENSANCHE_RULE.maxDepth_m).toBe(30);
        }
    });

    it('is alignment-to-street with party walls — the mitgera configuration', () => {
        if (BCN_ENSANCHE_RULE.kind === 'block-derived-alignment') {
            expect(BCN_ENSANCHE_RULE.alignTo).toBe('street');
            expect(BCN_ENSANCHE_RULE.alignmentOffset_m).toBe(0);
            // The configuration that exposed L-462 — a zero side setback on every Eixample plot.
            expect(BCN_ENSANCHE_RULE.sideTreatment).toBe('party-wall');
        }
    });
});
