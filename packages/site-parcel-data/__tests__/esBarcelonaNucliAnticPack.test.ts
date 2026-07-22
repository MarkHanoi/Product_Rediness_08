// L-591 — the Barcelona clau `12` (*Nucli Antic, Subzona I*) pack + its Art. 320.3a height table.
//
// WHAT THESE TESTS GUARD, IN ORDER OF HOW MUCH DAMAGE GETTING THEM WRONG WOULD DO
// -------------------------------------------------------------------------------
//   1. **The height article is 320.3a and NOT 317.** The brief that commissioned this pack said
//      "believed Art. 317" — a plausible, confidently-held, WRONG attribution of exactly the L-526
//      kind. Art. 317 is the reforma-interior standards article and states no height at all. If a
//      future edit "tidies" the citation onto 317, this suite is what stops it.
//   2. **The 60 % is a BLOCK occupation, not a parcel coverage.** `maxCoverage: 0.60` is the single
//      most natural-looking wrong edit available in this pack, and it changes the DENOMINATOR — a
//      C58 §1.11.2 category error that would invent a per-parcel entitlement.
//   3. **The depth ratio is 0.40 and the sibling zones' is 0.30.** Copying a constant across would
//      rewrite one zone's ordinance from another's.
//   4. **`12b` is never registered against this pack.** Its height and depth are surveys of the
//      existing fabric, not constructions — Ciutat Vella must not get subzona I's geometry.
//   5. **The band edges are 8 / 12 / 15**, not Art. 328's 8 / 11 / 15.

import { describe, it, expect } from 'vitest';
import {
    ES_BARCELONA_NUCLI_ANTIC_PACK,
    BCN_NUCLI_ANTIC_RULE,
    BCN_NUCLI_ANTIC_ZONE_CODES,
    BCN_12_ORDINANCE_REF,
    BCN_ART316_EDIFICABILITAT_NETA,
    BCN_ART316_PERI_FAR_NOT_APPLICABLE,
    BCN_ART318_DWELLING_MODULE_M2,
    BCN_ART317_PERI_STANDARDS,
    BCN_12_METROPOLITAN_DENSITY_HAB_PER_HA,
} from '../src/rulepacks/esBarcelonaNucliAntic.js';
import {
    resolveAlcadaNucliAntic,
    BCN_ALCADA_NUCLI_ANTIC_TABLE,
    BCN_ART320_EDGE_CONVENTION,
    BCN_ART320_CLAUSES_NOT_IN_THE_2007_TEXT,
} from '../src/rulepacks/bcnAlcadaNucliAntic.js';
import { ES_BARCELONA_ENSANCHE_PACK } from '../src/rulepacks/esBarcelonaEnsanche.js';
import {
    ES_BARCELONA_SEMIINTENSIVA_PACK,
    BCN_SEMIINTENSIVA_RULE,
} from '../src/rulepacks/esBarcelonaSemiintensiva.js';
import { BCN_ALCADA_SEMIINTENSIVA_TABLE } from '../src/rulepacks/bcnAlcadaSemiintensiva.js';

const zone = () => ES_BARCELONA_NUCLI_ANTIC_PACK.zones[0]!;

describe('L-591 — the clau 12 pack is VALID (parses at load)', () => {
    it('parsed the schema without throwing', () => {
        // The pack runs `JurisdictionZoningContractSchema.parse` at MODULE LOAD, so a schema
        // violation is a runtime throw that `tsc` says nothing about.
        expect(ES_BARCELONA_NUCLI_ANTIC_PACK.jurisdictionId).toBe('es-08019-barcelona');
        expect(ES_BARCELONA_NUCLI_ANTIC_PACK.zones).toHaveLength(1);
        expect(zone().code).toBe('12');
    });

    it('⚠ registers ONLY `12` — never `12b`', () => {
        // 12b is the same zona, a different subzona, and a different KIND of rule: its height is
        // the MEAN of the existing buildings on the street stretch and its depth is that of the
        // adjacent existing buildings. Neither input exists in our pipeline, and handing Ciutat
        // Vella a 40 %-block depth would be a fabricated envelope on the most sensitive fabric in
        // the city.
        expect([...BCN_NUCLI_ANTIC_ZONE_CODES]).toEqual(['12']);
        expect([...BCN_NUCLI_ANTIC_ZONE_CODES]).not.toContain('12b');
    });

    it('ships `estimated-ruleset` — a pack cannot self-certify (§L-572)', () => {
        expect(ES_BARCELONA_NUCLI_ANTIC_PACK.defaultConfidence).toBe('estimated-ruleset');
    });
});

describe('L-591 — THE CITATION. Art. 320.3a for the height, and NEVER Art. 317', () => {
    it('⚠ names Art. 320.3a for the height and says explicitly it is not Art. 317', () => {
        // THE LOAD-BEARING ASSERTION OF THIS FILE. The commissioning brief carried "believed
        // Art. 317"; the primary text puts the height in Art. 320 apartat 3a and puts the
        // reforma-interior standards in Art. 317. A confident citation to the wrong article is
        // the most damaging output this system produces (L-526).
        expect(BCN_12_ORDINANCE_REF).toMatch(/Alçada reguladora màxima: Art\. 320\.3a/);
        expect(BCN_12_ORDINANCE_REF).toMatch(/NOT Art\. 317, which states no\s+height rule/);
    });

    it('names Art. 320.2a for the depth, corroborated by Art. 242.2', () => {
        expect(BCN_12_ORDINANCE_REF).toMatch(/Profunditat edificable: Art\. 320\.2a/);
        expect(BCN_12_ORDINANCE_REF).toMatch(/Art\. 242\.2/);
        // The article that carries the FLOOR must be named too — 11 m comes from 242.5/.6, not
        // from 242.2, and citing "Art. 242" flat would be the imprecision L-526 warns about.
        expect(BCN_12_ORDINANCE_REF).toMatch(/floor 11 m \(Art\. 242\.5 and 242\.6\)/);
    });

    it('names Art. 316.2 for the edificabilitat, and Art. 319 for the ordering type', () => {
        expect(BCN_12_ORDINANCE_REF).toMatch(/Edificabilitat: Art\. 316\.2/);
        expect(BCN_12_ORDINANCE_REF).toMatch(/Art\. 319/);
    });

    it('⚠ records WHY clau 12 applies inside Barcelona at all (Art. 315.2)', () => {
        // An earlier research pass read Art. 315.2 as excluding the municipality and advised
        // deleting clau 12 from the roadmap. The counter-argument must travel WITH the pack, or
        // the next reader re-derives the same wrong conclusion from the same sentence.
        expect(BCN_12_ORDINANCE_REF).toMatch(/Art\. 315\.2/);
        expect(BCN_12_ORDINANCE_REF).toMatch(/Ciutat Vella/);
        expect(BCN_12_ORDINANCE_REF).toMatch(/Barcelona-exclusive Arts\. 317\/318/);
    });

    it('names the Barcelona-specific 2007 source for the height table', () => {
        // The shipped table is NOT the base 1988 text — which is missing from our volume — but the
        // municipality-specific modification the volume's own footnote 46 points to.
        expect(BCN_12_ORDINANCE_REF).toMatch(/DOGC 4893 of 29-05-2007/);
        expect(BCN_12_ORDINANCE_REF).toMatch(/MUNICIPALITY OF BARCELONA/);
        expect(BCN_12_ORDINANCE_REF).toMatch(/base 1988 quadre is MISSING/);
    });

    it('states its confidence honestly — estimated-ruleset, never certified', () => {
        expect(BCN_12_ORDINANCE_REF).toMatch(/estimated-ruleset,\s*\n?\s*never certified/);
        expect(BCN_12_ORDINANCE_REF).toMatch(/transcription errors/);
        expect(BCN_12_ORDINANCE_REF).not.toMatch(/certificat de règim|certified source/i);
        expect(zone().ordinanceRef).toBe(BCN_12_ORDINANCE_REF);
    });
});

describe('L-591 — the Art. 320.2a depth CONSTRUCTION, reused not reimplemented', () => {
    it('carries the ordinance PARAMETERS, never a hard-coded depth', () => {
        expect(BCN_NUCLI_ANTIC_RULE.kind).toBe('block-derived-alignment');
        expect(BCN_NUCLI_ANTIC_RULE).not.toHaveProperty('buildableDepth_m');
    });

    it('⚠ interiorFreeRatio is 0.40 — the complement of Art. 320.2a’s 60 % block occupation', () => {
        if (BCN_NUCLI_ANTIC_RULE.kind !== 'block-derived-alignment') throw new Error('kind');
        expect(BCN_NUCLI_ANTIC_RULE.interiorFreeRatio).toBe(0.4);
        // The complement relation is the whole derivation — pin it so a future "simplification"
        // that writes 0.60 into the free-ratio slot cannot pass.
        expect(1 - BCN_NUCLI_ANTIC_RULE.interiorFreeRatio).toBeCloseTo(0.6, 10);
    });

    it('⚠ does NOT take the densificació-urbana 0.30 — a different subzone, a different sentence', () => {
        if (BCN_NUCLI_ANTIC_RULE.kind !== 'block-derived-alignment') throw new Error('kind');
        if (BCN_SEMIINTENSIVA_RULE.kind !== 'block-derived-alignment') throw new Error('kind');
        // Art. 242.2 names 40 % for "la zona de nucli antic subzona I" and 30 % for "les de
        // densificació urbana" in ONE sentence. Sharing a constant across the packs would let a
        // correction in one silently rewrite the other's ordinance.
        expect(BCN_NUCLI_ANTIC_RULE.interiorFreeRatio).not.toBe(
            BCN_SEMIINTENSIVA_RULE.interiorFreeRatio,
        );
        expect(BCN_SEMIINTENSIVA_RULE.interiorFreeRatio).toBe(0.3);
    });

    it('⚠ minDepth is 11 m — Art. 242.5/242.6, not the 12 m the sibling packs ship', () => {
        if (BCN_NUCLI_ANTIC_RULE.kind !== 'block-derived-alignment') throw new Error('kind');
        // A HIGHER floor yields a DEEPER building, i.e. an over-statement (C58 §1.4). The primary
        // text says 11 m twice. This assertion is the record of the deliberate divergence.
        expect(BCN_NUCLI_ANTIC_RULE.minDepth_m).toBe(11);
        expect(BCN_NUCLI_ANTIC_RULE.maxDepth_m).toBe(30); // Art. 242.2 "en cap cas"
    });

    it('is alignment-to-street with party walls — the Art. 319 ordering type', () => {
        if (BCN_NUCLI_ANTIC_RULE.kind !== 'block-derived-alignment') throw new Error('kind');
        expect(BCN_NUCLI_ANTIC_RULE.alignTo).toBe('street');
        expect(BCN_NUCLI_ANTIC_RULE.alignmentOffset_m).toBe(0);
        expect(BCN_NUCLI_ANTIC_RULE.sideTreatment).toBe('party-wall');
    });

    it('does NOT share a rule OBJECT or a pack object with 13a / 13b', () => {
        expect(zone().geometricRule).not.toBe(
            ES_BARCELONA_ENSANCHE_PACK.zones[0]!.geometricRule,
        );
        expect(zone().geometricRule).not.toBe(
            ES_BARCELONA_SEMIINTENSIVA_PACK.zones[0]!.geometricRule,
        );
        expect(ES_BARCELONA_NUCLI_ANTIC_PACK).not.toBe(ES_BARCELONA_ENSANCHE_PACK);
        expect(zone().ordinanceRef).not.toBe(ES_BARCELONA_ENSANCHE_PACK.zones[0]!.ordinanceRef);
        expect(zone().ordinanceRef).not.toBe(
            ES_BARCELONA_SEMIINTENSIVA_PACK.zones[0]!.ordinanceRef,
        );
    });
});

describe('L-591 — every null is a FINDING, and the 60 % is NOT one of them', () => {
    it('maxHeight_m / maxFloors are NULL — the height is a per-street construction', () => {
        expect(zone().maxHeight_m).toBeNull();
        expect(zone().maxFloors).toBeNull();
    });

    it('⚠⚠ maxCoverage is NULL — Art. 320.2a’s 60 % is a BLOCK occupation, not parcel coverage', () => {
        // THE SECOND LOAD-BEARING ASSERTION. `maxCoverage` is a per-PARCEL ratio; the ordinance's
        // 60 % is measured on the ILLA. Same number, different denominator ⇒ a per-parcel
        // entitlement the ordinance never granted (C58 §1.11.2). The 60 % is consumed where it
        // belongs — as `interiorFreeRatio: 0.40` inside the block construction.
        expect(zone().maxCoverage).toBeNull();
        expect(zone().maxCoverage).not.toBe(0.6);
    });

    it('setbacks are NULL, not zero — null ≠ 0 (C58 §1.7a)', () => {
        expect(zone().setbacks?.front_m ?? null).toBeNull();
        expect(zone().setbacks?.side_m ?? null).toBeNull();
        expect(zone().setbacks?.rear_m ?? null).toBeNull();
    });

    it('never claims `published-structured` provenance for anything', () => {
        for (const [field, prov] of Object.entries(zone().fieldProvenance ?? {})) {
            expect(prov, `12.${field}`).not.toBe('published-structured');
        }
    });
});

describe('L-591 — Art. 316: the edificabilitat that IS encoded, and the one that is not', () => {
    it('plotRatioFAR is 1,40 m²st/m²s — Art. 316.2, confirmed from the primary text', () => {
        // Unlike 13a/13b (Art. 322.1: "l'edificabilitat es defineix per l'envolupant màxima de
        // volum" — no per-parcel index at all), Art. 316.2 DEFINES a net index for subzona I with
        // no procedural gate. This is the one numeric field clau 12 legitimately fills.
        expect(BCN_ART316_EDIFICABILITAT_NETA).toBe(1.4);
        expect(zone().plotRatioFAR).toBe(1.4);
        expect(zone().fieldProvenance?.maxFAR).toBe('ordinance-pdf');
    });

    it('⚠ the PERI-gated 0,84 is recorded and applied NOWHERE', () => {
        // Art. 316.4 binds a PERI that re-orders a whole SECTOR. It is the LOWER of the two, so
        // mistaking it for the per-parcel index fails silently — the answer merely looks
        // conservative. Its existence is also what proves 1,40 is not itself the gated figure.
        expect(BCN_ART316_PERI_FAR_NOT_APPLICABLE).toBe(0.84);
        expect(zone().plotRatioFAR).not.toBe(BCN_ART316_PERI_FAR_NOT_APPLICABLE);
        expect(BCN_12_ORDINANCE_REF).toMatch(/0,84 of Art\. 316\.4 is NOT applied/);
    });
});

describe('L-591 — Arts. 317 / 318 (Barcelona-exclusive): recorded, applied nowhere', () => {
    it('Art. 318 caps dwellings by an 80 m² module of BUILT area, not by density', () => {
        expect(BCN_ART318_DWELLING_MODULE_M2).toBe(80);
        expect(BCN_12_ORDINANCE_REF).toMatch(/superfície construïda ÷ a 80 m² module/);
        expect(BCN_12_ORDINANCE_REF).toMatch(/PRYZM records but does not model/);
    });

    it('⚠ the METROPOLITAN 200 hab/ha is retained only as a deprecated trap', () => {
        // The metropolitan Art. 318 is a DENSITY; Barcelona's is a per-parcel count from built
        // area. A different SHAPE of rule, not a different number — the L-526 failure class.
        expect(BCN_12_METROPOLITAN_DENSITY_HAB_PER_HA).toBe(200);
        const numericSlots = [
            zone().maxHeight_m,
            zone().maxFloors,
            zone().plotRatioFAR,
            zone().maxCoverage,
            zone().setbacks?.front_m ?? null,
            zone().setbacks?.side_m ?? null,
            zone().setbacks?.rear_m ?? null,
        ];
        for (const v of numericSlots) {
            expect(v).not.toBe(BCN_12_METROPOLITAN_DENSITY_HAB_PER_HA);
            expect(v).not.toBe(BCN_ART318_DWELLING_MODULE_M2);
        }
    });

    it('Art. 317 carries all four figures — because only clause c changed', () => {
        // The two PERCENTAGES are identical in the metropolitan and Barcelona texts. Anyone
        // diffing on those alone would conclude nothing changed and then apply the superseded
        // 120 hab/ha density. All four are recorded together so that cannot happen.
        expect(BCN_ART317_PERI_STANDARDS.vialsAndParkingFraction).toBe(0.2352);
        expect(BCN_ART317_PERI_STANDARDS.greenAndFacilitiesFraction).toBe(0.1648);
        expect(BCN_ART317_PERI_STANDARDS.dwellingModule_m2).toBe(80);
        expect(BCN_ART317_PERI_STANDARDS.supersededMetropolitanDensity_habPerHa).toBe(120);
    });

    it('the PERI standards are not a parcel constraint and reach no numeric slot', () => {
        expect(zone().maxCoverage).not.toBe(BCN_ART317_PERI_STANDARDS.vialsAndParkingFraction);
        expect(zone().maxCoverage).not.toBe(BCN_ART317_PERI_STANDARDS.greenAndFacilitiesFraction);
        expect(zone().plotRatioFAR).not.toBe(BCN_ART317_PERI_STANDARDS.vialsAndParkingFraction);
    });
});

describe('L-591 — Art. 320.3a, the height table (DOGC 4893, 02-03-2007, Barcelona)', () => {
    it('has FOUR bands, open-ended at the top, ceiling PB+4', () => {
        // ⚠ Do not extend it. Art. 350.c (22a) has THREE bands; Art. 327 (13a) has SIX. The band
        // count is a per-article fact and every attempt to predict one from another has been
        // wrong (L-590 §3).
        expect(BCN_ALCADA_NUCLI_ANTIC_TABLE).toHaveLength(4);
        expect(BCN_ALCADA_NUCLI_ANTIC_TABLE[3]!.maxWidth_m).toBe(Infinity);
        expect(BCN_ALCADA_NUCLI_ANTIC_TABLE[3]!.floorsAboveGround).toBe(4);
    });

    it('transcribes the quadre exactly: 7,90 / 11,25 / 14,60 / 17,95 m', () => {
        expect(BCN_ALCADA_NUCLI_ANTIC_TABLE.map((b) => b.height_m)).toEqual([
            7.9, 11.25, 14.6, 17.95,
        ]);
        expect(BCN_ALCADA_NUCLI_ANTIC_TABLE.map((b) => b.floorsAboveGround)).toEqual([1, 2, 3, 4]);
    });

    it('⚠ breaks at 8 / 12 / 15 — NOT at Art. 328’s 8 / 11 / 15', () => {
        // Between 11,00 m and 12,00 m of street width the two articles disagree by a whole
        // storey. Copying either table onto the other moves a real building.
        expect(BCN_ALCADA_NUCLI_ANTIC_TABLE.map((b) => b.minWidth_m)).toEqual([0, 8, 12, 15]);
        expect(BCN_ALCADA_SEMIINTENSIVA_TABLE.map((b) => b.minWidth_m)).toEqual([0, 8, 11, 15]);
    });

    it('partitions the width axis with no gap and no overlap', () => {
        for (let i = 1; i < BCN_ALCADA_NUCLI_ANTIC_TABLE.length; i += 1) {
            expect(BCN_ALCADA_NUCLI_ANTIC_TABLE[i]!.minWidth_m).toBe(
                BCN_ALCADA_NUCLI_ANTIC_TABLE[i - 1]!.maxWidth_m,
            );
        }
    });

    it('⚠ its band-edge convention is STATED by the ordinance, unlike Arts. 327/328', () => {
        // "De 8 m a menys de 12 m" is lower-inclusive / upper-exclusive in the ordinance's own
        // words. This flag must not be quietly downgraded to `false` to match its neighbours.
        expect(BCN_ART320_EDGE_CONVENTION.lowerInclusive).toBe(true);
        expect(BCN_ART320_EDGE_CONVENTION.statedByOrdinance).toBe(true);
    });
});

describe('L-591 — resolveAlcadaNucliAntic refuses rather than guesses', () => {
    it('resolves a width comfortably inside a band', () => {
        const r = resolveAlcadaNucliAntic(13.5);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.height_m).toBe(14.6);
        expect(r.floorsAboveGround).toBe(3);
    });

    it('⚠ returns NO cornice increment — the Eixample ordinance does not govern the nucli antic', () => {
        const r = resolveAlcadaNucliAntic(20);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // The nucli antic is, definitionally, the fabric the Eixample was built OUTSIDE.
        expect(r.corniceIncrementMax_m).toBeNull();
    });

    it('refuses a MEASURED width sitting on a band edge', () => {
        // The nucli antic is the medieval fabric — a large share of its streets sit near the 8 m
        // edge, the one that decides between PB+1 and PB+2.
        const r = resolveAlcadaNucliAntic(8.0);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('band-edge');
        expect(r.straddles).toEqual([7.9, 11.25]);
    });

    it('accepts an OFFICIAL width on a band edge, and the ordinance’s own wording decides', () => {
        const r = resolveAlcadaNucliAntic(8.0, { trustedOfficialWidth: true });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // Lower-inclusive: "de 8 m a menys de 12 m" ⇒ 8,00 m is the SECOND band.
        expect(r.height_m).toBe(11.25);
    });

    it('§L-586 — a wide measurement spread widens the guard and forces a refusal', () => {
        // 13.0 m is 1.0 m clear of the 12 m edge, so the default 0.5 m guard passes it…
        expect(resolveAlcadaNucliAntic(13.0).ok).toBe(true);
        // …but a measurement whose own rays span 1.2 m cannot decide the band.
        const r = resolveAlcadaNucliAntic(13.0, { measurementSpread_m: 1.2 });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('band-edge');
    });

    it('rejects unusable inputs rather than throwing', () => {
        for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
            const r = resolveAlcadaNucliAntic(bad);
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.reason).toBe('bad-input');
        }
    });

    it('is PURE — the same input yields the same output (C58 §1.1)', () => {
        expect(resolveAlcadaNucliAntic(16.4)).toEqual(resolveAlcadaNucliAntic(16.4));
    });
});

describe('L-591 — the 1988 clauses absent from the 2007 Barcelona text stay unapplied', () => {
    it('records the narrow-façade cap without applying it', () => {
        const cap = BCN_ART320_CLAUSES_NOT_IN_THE_2007_TEXT.narrowFacadeCap;
        expect(cap.facadeLengthBelow_m).toBe(6.5);
        expect(cap.cappedHeight_m).toBe(10.6);
        expect(cap.cappedFloorsAboveGround).toBe(2);
        // ⚠ It must not have leaked into the shipped table: 10,60 belongs to the PRE-2007 datum.
        expect(BCN_ALCADA_NUCLI_ANTIC_TABLE.map((b) => b.height_m)).not.toContain(10.6);
    });

    it('records the ±10 % readjustment allowance without applying it', () => {
        // A discretionary planning allowance granted case by case, not an entitlement to extrude.
        expect(BCN_ART320_CLAUSES_NOT_IN_THE_2007_TEXT.readjustmentAllowanceFraction).toBe(0.1);
        const r = resolveAlcadaNucliAntic(16.0);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.height_m).toBe(17.95); // the table value, un-inflated
    });
});
