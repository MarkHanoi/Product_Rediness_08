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
    BCN_ENSANCHE_BASE_ZONE_CODE,
    BCN_13E_ZONE_CODE,
    BCN_13E_SUPPLEMENT,
    BCN_13E_INSTRUMENT_STATUS,
    BCN_13E_TRANSCRIPTION_PRECONDITION,
    bcn13ESupplementedZone,
} from '../src/rulepacks/esBarcelonaEnsanche.js';
import { resolveZoneDisposition, BCN_JURISDICTION_ID } from '../src/rulepacks/registry.js';

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

    it('registers BOTH 13a and 13E — 13E through the supplement, not as a second rule set', () => {
        // §DEC-2 (2026-08-01) — this used to read "a refusal to pick while the 2002 ordinance's
        // force is unknown". Both halves are closed: L-667 established `13E` IN FORCE from the 2026
        // repeal annex itself, and the founder decided the SHAPE — `13E` inherits `13a` plus an
        // explicit delta. Live MUC returns 13a; the 2002 ordinance says 13E substitutes clau 13.
        expect([...BCN_ENSANCHE_ZONE_CODES]).toEqual(['13a', '13E']);
        for (const code of BCN_ENSANCHE_ZONE_CODES) {
            expect(ES_BARCELONA_ENSANCHE_PACK.zones.find((z) => z.code === code)).toBeDefined();
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// §DEC-2 (founder, 2026-08-01) — clau `13E` IS A **SUPPLEMENT OVER `13a`**, NEVER A PARALLEL PACK.
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// EVERY TEST BELOW FAILS ON `main` AS IT STOOD BEFORE THIS CHANGE: there was no supplement, no
// delta and no instrument-status record — `13E` was a SECOND CALL to the same zone builder with a
// different literal, identical to `13a` by coincidence of two call sites rather than by
// construction. The day someone corrected `13a` (as §L-594 did, `minDepth_m` 12 → 11) nothing would
// have made them correct `13E` too.
//
// The decision has three halves and each is pinned:
//   1. INHERITANCE IS THE IMPLEMENTATION — `13E` is DERIVED from `13a` plus a delta;
//   2. THE DELTA IS EMPTY **AND DECLARED EMPTY** — an absence and a measured zero are different
//      values (§CONTEXT-DATA-HONESTY), so "nobody has transcribed it" is stated, not inferred;
//   3. THE TRANSCRIPTION PRECONDITION IS RECORDED WHERE THE NEXT PERSON HITS IT — any transcription
//      must start from the CURRENT consolidated text (2012 partial nullity of Art. 15 + 2018 / 2019
//      / 2023 modifications), never from the 2002 text as published.

describe('§DEC-2 — 13E resolves THROUGH 13a, and today matches it exactly', () => {
    const zoneOf = (code: string) => ES_BARCELONA_ENSANCHE_PACK.zones.find((z) => z.code === code)!;

    it('declares its inheritance in data — `13E` inherits `13a`', () => {
        expect(BCN_13E_SUPPLEMENT.zoneCode).toBe(BCN_13E_ZONE_CODE);
        expect(BCN_13E_SUPPLEMENT.inheritsFromZoneCode).toBe(BCN_ENSANCHE_BASE_ZONE_CODE);
        expect(BCN_ENSANCHE_BASE_ZONE_CODE).toBe('13a');
        expect(BCN_13E_ZONE_CODE).toBe('13E');
    });

    it('⚠ every RULE-BEARING field of 13E equals 13a — only `code` and `label` differ', () => {
        // The load-bearing assertion of the supplement. If 13E ever diverges from 13a in a field
        // that is NOT written into `BCN_13E_SUPPLEMENT.delta`, this goes red — which is exactly the
        // silent drift a parallel pack would have produced at the first amendment.
        const base = { ...zoneOf(BCN_ENSANCHE_BASE_ZONE_CODE) } as Record<string, unknown>;
        const supp = { ...zoneOf(BCN_13E_ZONE_CODE) } as Record<string, unknown>;
        delete base.code; delete supp.code;
        delete base.label; delete supp.label;
        expect(supp).toEqual(base);
    });

    it('is BUILT from 13a rather than re-typed — the builder returns the same body', () => {
        // Not a claim about the two literals matching today; a claim about where the second one
        // comes from. `bcn13ESupplementedZone()` spreads the 13a base and then the delta.
        const built = bcn13ESupplementedZone();
        expect(built.code).toBe(BCN_13E_ZONE_CODE);
        expect(built.label).toBe(BCN_13E_SUPPLEMENT.label);
        expect(built.geometricRule).toEqual(BCN_ENSANCHE_RULE);
        // …and the pack publishes exactly what the builder produced.
        expect(zoneOf(BCN_13E_ZONE_CODE)).toEqual(built);
    });

    it('⚠ the delta is EMPTY and DECLARED empty — never merely absent', () => {
        // "Empty" and "nobody looked" must not be the same value. `deltaIsEmpty` +
        // `deltaEmptyBecause` say WHICH, in the shipping data, where this test can read them.
        expect(BCN_13E_SUPPLEMENT.delta).toBeDefined();
        expect(Object.keys(BCN_13E_SUPPLEMENT.delta)).toHaveLength(0);
        expect(BCN_13E_SUPPLEMENT.deltaIsEmpty).toBe(true);
        expect(BCN_13E_SUPPLEMENT.deltaEmptyBecause.length).toBeGreaterThan(0);
        expect(BCN_13E_SUPPLEMENT.deltaEmptyBecause).toMatch(/consolidated/i);
        // The one open item on 13E is named, so "closed" cannot be read as "finished".
        expect(BCN_13E_SUPPLEMENT.openItem).toMatch(/transcribe/i);
    });

    it('⚠ records that any transcription must start from the CURRENT consolidated text', () => {
        // Recorded on the supplement, i.e. where the next person opens the file to fill the delta —
        // not in a doc they may never read. Transcribing the 2002 text as published would encode a
        // rule that has not been in force for over a decade, under an authoritative-looking citation.
        const p = BCN_13E_TRANSCRIPTION_PRECONDITION;
        expect(BCN_13E_SUPPLEMENT.transcriptionPrecondition).toBe(p);
        expect(p.art15PartialNullityYear).toBe(2012);
        expect([...p.subsequentModificationYears]).toEqual([2018, 2019, 2023]);
        expect(p.consolidatedTextHeld).toBe(false);
        expect(p.startFrom).toMatch(/CURRENT/);
    });

    it('records 13E as IN FORCE on the ANNEX ITSELF, not on catalogue metadata (L-667)', () => {
        const s = BCN_13E_INSTRUMENT_STATUS;
        expect(s.status).toBe('in-force');
        // ⚠ The distinction that made the earlier "CLOSED" verdict an overclaim, and that this
        // field exists to keep visible: a `dc.relation.replaces` catalogue entry is not the annex.
        expect(s.evidenceIsPrimarySource).toBe(true);
        expect(s.evidence).toMatch(/annex_2026\.pdf/);
        expect(s.evidence).toMatch(/11703\/144636/);
        expect(s.evidence).toMatch(/no express reference/i);
        // What would reopen it — and what would NOT (the 1986 repeal).
        expect(s.reopensIf).toMatch(/2002/);
        expect(s.reopensIf).toMatch(/1986 repeal is\s+not that/i);
        expect(s.findingRef).toMatch(/L-667-13E-IN-FORCE-CLOSED\.md/);
    });

    it('a 13E parcel resolves through the SAME pack as 13a in the shipping registry', () => {
        // End to end, through the path the dispatcher actually uses — not a direct pack import.
        const a = resolveZoneDisposition(BCN_JURISDICTION_ID, BCN_ENSANCHE_BASE_ZONE_CODE);
        const e = resolveZoneDisposition(BCN_JURISDICTION_ID, BCN_13E_ZONE_CODE);
        expect(a.kind).toBe('pack');
        expect(e.kind).toBe('pack');
        if (a.kind !== 'pack' || e.kind !== 'pack') return;
        // ONE pack object, not two. A parallel pack would make these different references and is
        // precisely what §DEC-2 forbids.
        expect(e.pack).toBe(a.pack);
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

    it('carries an ordinanceRef naming the LIVING consolidated source (L-526, v255)', () => {
        // C58 §1.3 — an estimated value must cite what it came from.
        //
        // ⚠ THIS ASSERTION USED TO REQUIRE `/2009/`, on the reasoning that the consolidation date
        // belonged in the citation because a 2008 Art. 327 modification post-dated it. L-526 found
        // that reasoning wrong twice over: a text consolidated to 31-12-2009 ALREADY contains a
        // DOGC 29-09-2008 modification (so the caveat was self-contradictory), and the modification
        // is to the HEIGHT table, not to the depth this pack derives. The "AMB … Dec 2010" vintage
        // was also anachronistic — the AMB did not exist until July 2011.
        //
        // So the citation is now the LIVING consolidated refós (RPUC / NUMAMB), which has no single
        // frozen date to assert. Pinning a year here would re-introduce exactly the stale-vintage
        // claim L-526 removed, so the test pins the SOURCE and the ARTICLES instead.
        for (const z of zones()) {
            expect(z.ordinanceRef).toBeTruthy();
            expect(z.ordinanceRef).toMatch(/RPUC|NUMAMB/);
            expect(z.ordinanceRef).toMatch(/Art\. 242/);
            // The anachronistic attribution must not come back.
            expect(z.ordinanceRef).not.toMatch(/AMB Normativa Urbanística Metropolitana \(Dec 2010\)/);
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
            // 12 m, not 11 — Art. 242 sets the ordinance MINIMUM depth at 12 m (L-526 primary-source
            // finding, shipped v254). The 11 m this once asserted was our own misreading.
            // §L-594 — 11 m, per the PRIMARY TEXT (NNUU p. 81, Art. 242.4): *"…profunditat
            // edificable INFERIOR A 11 m., s'haurà de prendre aquesta dimensió…"*. Was 12,
            // which OVER-STATED depth (a floor raises the answer) — C58 §1.4's forbidden
            // direction. Two agents disagreed and the assertive one was believed until the
            // ordinance was read. Pinned at 11 so it cannot drift back.
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
