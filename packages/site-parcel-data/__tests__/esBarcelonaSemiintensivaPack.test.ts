// L-583 §9 — the Barcelona clau `13b` (*densificació urbana semiintensiva*) pack.
//
// WHAT THESE TESTS ACTUALLY GUARD, AND WHY THEY ARE NOT A COPY OF THE 13a SUITE
// -----------------------------------------------------------------------------
// The 13a suite guards against someone FILLING IN a null. This suite guards against something
// more specific and more likely: **someone treating 13b as "13a with different numbers"**. It is
// not. The two zones share ONE article (Art. 242, the depth, and only because Art. 326 puts both
// subzones under the same ordering type) and differ on the other (Art. 327 vs Art. 328). So the
// assertions below pin, in order of how much damage getting them wrong would do:
//
//   1. the DEPTH is cited to Art. 242 **via Art. 326** — and NEVER to Art. 328, which contains no
//      depth rule at all. A citation to Art. 328 for a depth is a fabricated attribution of
//      exactly the L-526 kind, and it is the single most damaging output this pack could produce;
//   2. every null stays null — in particular `plotRatioFAR`, where a real, tidy, procedurally
//      gated figure (1,80 m²st/m²s) is sitting right there waiting to be pasted in;
//   3. the pack cannot self-certify: `estimated-ruleset`, with the `block-constructed` tier left
//      to the engine.

import { describe, it, expect } from 'vitest';
import {
    ES_BARCELONA_SEMIINTENSIVA_PACK,
    BCN_SEMIINTENSIVA_RULE,
    BCN_SEMIINTENSIVA_ZONE_CODES,
    BCN_13B_ORDINANCE_REF,
    BCN_13B_PERI_FAR_NOT_APPLICABLE,
    BCN_13B_DENSITY_CAP_HAB_PER_HA,
} from '../src/rulepacks/esBarcelonaSemiintensiva.js';
import { ES_BARCELONA_ENSANCHE_PACK } from '../src/rulepacks/esBarcelonaEnsanche.js';

const zone = () => ES_BARCELONA_SEMIINTENSIVA_PACK.zones[0]!;

describe('L-583 §9 — the 13b pack is VALID (parses at load)', () => {
    it('parsed the schema without throwing', () => {
        // The pack runs `JurisdictionZoningContractSchema.parse` at MODULE LOAD, so a schema
        // violation is a runtime throw that `tsc` says nothing about.
        expect(ES_BARCELONA_SEMIINTENSIVA_PACK.jurisdictionId).toBe('es-08019-barcelona');
        expect(ES_BARCELONA_SEMIINTENSIVA_PACK.zones).toHaveLength(1);
        expect(zone().code).toBe('13b');
    });

    it('registers ONE clau, with no invented alias', () => {
        // 13a legitimately carries a second code (`13E`) because a NAMED 2002 municipal ordinance
        // says 13E substitutes clau 13 in the Eixample. No equivalent document is known for 13b,
        // so a "13Eb"-style alias would register a clau no source connects to this zone.
        expect([...BCN_SEMIINTENSIVA_ZONE_CODES]).toEqual(['13b']);
    });

    it('ships `estimated-ruleset` — a pack cannot self-certify (§L-572)', () => {
        // `block-constructed` is stamped by the ENGINE when the depth is really solved from a
        // dissolved cadastral block. It is a property of the determination, not of the pack.
        expect(ES_BARCELONA_SEMIINTENSIVA_PACK.defaultConfidence).toBe('estimated-ruleset');
    });
});

describe('L-583 §9 — THE CITATION. Art. 242 via Art. 326, and never Art. 328 for the depth', () => {
    it('names Art. 242 for the depth and Art. 326 as the route to it', () => {
        expect(BCN_13B_ORDINANCE_REF).toMatch(/Art\. 242/);
        expect(BCN_13B_ORDINANCE_REF).toMatch(/Art\. 326/);
        expect(zone().ordinanceRef).toBe(BCN_13B_ORDINANCE_REF);
    });

    it('⚠ NEVER attributes a DEPTH rule to Art. 328 — Art. 328 has no depth rule', () => {
        // THE LOAD-BEARING ASSERTION OF THIS FILE. *Profunditat edificable* appears nowhere in
        // Arts. 321–328 (L-583 §4.1). If a future edit "simplifies" the citation to "Art. 328"
        // for everything because 328 is the 13b article, this test is what stops it — and the
        // failure it stops is precisely L-526: a wrong article published as authoritative.
        expect(BCN_13B_ORDINANCE_REF).toMatch(/Art\. 328 states NO depth rule/);
        // The citation must not be reduced to a form where 328 is the only article present.
        expect(BCN_13B_ORDINANCE_REF).toMatch(/profunditat edificable: Art\. 242/);
    });

    it('names Art. 328 for the HEIGHT, and does not confuse it with Art. 327', () => {
        expect(BCN_13B_ORDINANCE_REF).toMatch(/Alçada reguladora màxima: Art\. 328/);
        // Art. 327 may only appear as the thing this zone is DISTINGUISHED from.
        expect(BCN_13B_ORDINANCE_REF).toMatch(/distinct from\s+Art\. 327/);
    });

    it('states its confidence honestly — corroborated, never certified', () => {
        // Barcelona's own 08019 consolidation remains unretrieved (L-583 §7). Nothing in this
        // system is `certified`, and the citation says so rather than implying otherwise.
        expect(BCN_13B_ORDINANCE_REF).toMatch(/corroborated, never certified/);
        expect(BCN_13B_ORDINANCE_REF).not.toMatch(/certificat de règim|certified source/i);
    });

    it('records the Art. 323 density cap as a limit we do NOT model', () => {
        // A 13b envelope is not a complete statement of what may be built there (L-552 §4.2).
        expect(BCN_13B_ORDINANCE_REF).toMatch(/Art\. 323/);
        expect(BCN_13B_ORDINANCE_REF).toMatch(/PRYZM does not model/);
    });
});

describe('L-583 §9 — every null is a FINDING, and stays null', () => {
    it('maxHeight_m / maxFloors are NULL — the height is a per-street construction (Art. 328)', () => {
        // ⚠ IF THIS GOES RED someone has written a scalar height into the zone. Art. 328 keys the
        // height on the *amplada de vial*; a scalar would publish one street's answer city-wide.
        expect(zone().maxHeight_m).toBeNull();
        expect(zone().maxFloors).toBeNull();
    });

    it('plotRatioFAR is NULL — 1,80 m²st/m²s answers a DIFFERENT question', () => {
        // ⚠ THE MOST TEMPTING FIELD IN THE PACK (L-552 §4.1): unlike 13a's 2,20/1,20 pair, 13b's
        // figure is a single tidy number. It is gated to plans especials de reforma interior /
        // estudis de detall. Applying it per-parcel would over-constrain every 13b plot in the
        // city — a real number answering a different question (C58 §1.11).
        expect(zone().plotRatioFAR).toBeNull();
        // …and the figure is recorded, so nobody re-discovers it and "helpfully" wires it in.
        expect(BCN_13B_PERI_FAR_NOT_APPLICABLE).toBe(1.8);
    });

    it('maxCoverage is NULL — no Subzona II text states a ground-occupation ratio', () => {
        expect(zone().maxCoverage).toBeNull();
    });

    it('setbacks are NULL, not zero — null ≠ 0 (C58 §1.7a)', () => {
        // 0 would assert "the ordinance requires zero clearance here". The containment check SKIPS
        // a null edge; it would ENFORCE a 0.
        expect(zone().setbacks?.front_m ?? null).toBeNull();
        expect(zone().setbacks?.side_m ?? null).toBeNull();
        expect(zone().setbacks?.rear_m ?? null).toBeNull();
    });

    it('never claims `published-structured` provenance for anything', () => {
        for (const [field, prov] of Object.entries(zone().fieldProvenance ?? {})) {
            expect(prov, `13b.${field}`).not.toBe('published-structured');
        }
    });

    it('records the Art. 323 density cap as data, and applies it NOWHERE', () => {
        // No GeometricRule kind and no contract field models a dwelling-count cap. The constant
        // exists so the gap is discoverable in code; the pack must not pretend to encode it.
        expect(BCN_13B_DENSITY_CAP_HAB_PER_HA).toBe(250);
        // It must appear in the CITATION (so the user is told the envelope is not the whole
        // story) and in NO numeric slot (so nothing can extrude, cap or compare against it).
        expect(BCN_13B_ORDINANCE_REF).toContain('250 habitatges/ha');
        const numericSlots = [
            zone().maxHeight_m,
            zone().maxFloors,
            zone().plotRatioFAR,
            zone().maxCoverage,
            zone().setbacks?.front_m ?? null,
            zone().setbacks?.side_m ?? null,
            zone().setbacks?.rear_m ?? null,
        ];
        for (const v of numericSlots) expect(v).not.toBe(BCN_13B_DENSITY_CAP_HAB_PER_HA);
    });
});

describe('L-583 §9 — the Art. 242 construction, reused not reimplemented', () => {
    it('carries the ordinance PARAMETERS, never a hard-coded depth', () => {
        // The entire point of ADR-0271: no `buildableDepth_m` anywhere. A scalar would be one
        // block's answer, which is why the circulating "18,00 m" figure for 13b is a trap
        // (L-552 §2) — a stated depth is flatly incompatible with an Art. 242 CONSTRUCTION.
        expect(BCN_SEMIINTENSIVA_RULE.kind).toBe('block-derived-alignment');
        expect(BCN_SEMIINTENSIVA_RULE).not.toHaveProperty('buildableDepth_m');
        if (BCN_SEMIINTENSIVA_RULE.kind === 'block-derived-alignment') {
            // Art. 242.2 scopes 40 % to *nucli antic subzona I* (named explicitly) and 30 % to
            // *les de densificació urbana* (the category, unqualified). 13b is in that category.
            expect(BCN_SEMIINTENSIVA_RULE.interiorFreeRatio).toBe(0.3);
            // §L-594 — 11 m, per the PRIMARY TEXT (NNUU p. 81, Art. 242.4): *"…profunditat
            // edificable INFERIOR A 11 m., s'haurà de prendre aquesta dimensió…"*. Was 12,
            // which OVER-STATED depth (a floor raises the answer) — C58 §1.4's forbidden
            // direction. Two agents disagreed and the assertive one was believed until the
            // ordinance was read. Pinned at 11 so it cannot drift back.
            expect(BCN_SEMIINTENSIVA_RULE.minDepth_m).toBe(11);
            expect(BCN_SEMIINTENSIVA_RULE.maxDepth_m).toBe(30); // Art. 242.2 cap
        }
    });

    it('is alignment-to-street with party walls — the Art. 326 ordering type', () => {
        if (BCN_SEMIINTENSIVA_RULE.kind === 'block-derived-alignment') {
            expect(BCN_SEMIINTENSIVA_RULE.alignTo).toBe('street');
            expect(BCN_SEMIINTENSIVA_RULE.alignmentOffset_m).toBe(0);
            expect(BCN_SEMIINTENSIVA_RULE.sideTreatment).toBe('party-wall');
        }
    });

    it('does NOT share the 13a rule OBJECT — they agree by law, not by construction', () => {
        // Sharing the constant would make a future divergence in one zone silently rewrite the
        // other. L-583 §4.2 makes the same point about the nucli antic 40 %: the ratio must come
        // from the zone, never from a global.
        const ensancheRule = ES_BARCELONA_ENSANCHE_PACK.zones[0]!.geometricRule;
        expect(zone().geometricRule).not.toBe(ensancheRule);
    });

    it('is a DIFFERENT pack object from 13a, with its own citation', () => {
        // 13b must never resolve through the 13a pack: the depth is the same article, the height
        // is not, and the two packs' ordinanceRefs are what tell them apart downstream.
        expect(ES_BARCELONA_SEMIINTENSIVA_PACK).not.toBe(ES_BARCELONA_ENSANCHE_PACK);
        expect(zone().ordinanceRef).not.toBe(
            ES_BARCELONA_ENSANCHE_PACK.zones[0]!.ordinanceRef,
        );
    });
});
