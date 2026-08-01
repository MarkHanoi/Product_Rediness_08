// Barcelona CLOSURE-REGISTER — the three ENGINEERING blockers closed on 2026-08-01, pinned.
//
//   • **blocker 11** — §COSSOS-SORTINTS (L-672): tribunes are a projection BEYOND the envelope.
//   • **blocker 7**  — §BARE-20A-EXHAUSTED (L-673): bare `20a` states ten regimes and no selector.
//   • **blocker 3**  — §CLAU-12-PREDICATE (L-674): Art. 315.2 states no geographic test to encode.
//
// EVERY TEST IN THE §BARE-20A BLOCK FAILS ON `main` AS IT STOOD BEFORE THIS CHANGE. Before it, a
// bare-`20a` parcel got `barcelonaNoRulePackRefusal` — code `no-rule-pack`, `ordinanceRef: null` —
// whose copy said PRYZM did not hold *"THIS subzone's own sourced numbers: its separations, its
// minimum parcel size, its maximum occupation and its net buildability index."* All four have been
// in `bcn20aSubzones.ts`, for all ten subzones, since 2026-07-22.

import { describe, it, expect } from 'vitest';
import {
    resolveZoneDisposition,
    BCN_JURISDICTION_ID,
    barcelona20aSubzoneUndeterminedRefusal,
    barcelonaCosSortintDisposition,
    BCN_COSSOS_SORTINTS_NEVER_OVERSTATE,
    BCN_COSSOS_SORTINTS_ORDINANCE_REF,
    BCN_ART229_COMPUTATION,
    BCN_ART230_I_ALINEACIONS_DE_VIAL,
    BCN_ART230_III_VOLUMETRIA_ESPECIFICA,
    BCN_20A_BARE_ORDINANCE_REF,
    BCN_20A_ZONE_CODES,
    BCN_20A_SUBZONES,
    BCN_CLAU_12_GEOGRAPHIC_PREDICATE_EXISTS,
    BCN_CLAU_12_PREDICATE_FINDING,
} from '../src/index.js';
// ⚠ Direct, not via the barrel: `esBarcelonaNucliAntic.ts` is consumed by `registry.ts` and is not
// re-exported from `src/index.ts`. Reaching for it here keeps the `12` / `12b` invariant asserted
// against the module the registry actually reads.
import { BCN_NUCLI_ANTIC_ZONE_CODES } from '../src/rulepacks/esBarcelonaNucliAntic.js';

// ══════════════════════════════════════════════════════════════════════════════════════════════
// BLOCKER 11 — §COSSOS-SORTINTS: a tribuna is NOT part of the envelope.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('§COSSOS-SORTINTS — tribunes project BEYOND the envelope, so omitting them is safe', () => {
    it('⚠⚠ THE INVARIANT — no Barcelona clau over-states when cossos sortints are ignored', () => {
        // The whole closure rests on this. If a future zone flips it, the constant must be edited
        // by hand and the change argued — which is why it is written down rather than derived.
        expect(BCN_COSSOS_SORTINTS_NEVER_OVERSTATE).toBe(true);
        const claus = [
            '12', '12b', '13a', '13E', '13b', '22a', '22@', '18',
            ...BCN_20A_ZONE_CODES,
            '20a',
        ];
        for (const clau of claus) {
            const d = barcelonaCosSortintDisposition(clau);
            expect(d, `no disposition recorded for clau ${clau}`).not.toBeNull();
            expect(d!.omissionDirection, `clau ${clau} OVER-states`).not.toBe('over-states');
        }
    });

    it('the *alineacions de vial* claus take Art. 230.I and UNDER-state', () => {
        for (const clau of ['13a', '13E', '13b', '22a', '22@']) {
            const d = barcelonaCosSortintDisposition(clau)!;
            expect(d.relation, clau).toBe('projects-beyond-envelope');
            expect(d.omissionDirection, clau).toBe('under-states');
            expect(d.article, clau).toBe('PGM Art. 230.I');
        }
    });

    it('⚠ *nucli antic* is EXCLUDED from Art. 230.I by its own words — 12/12b take Art. 320.5a', () => {
        // Art. 230.I.1: "excepte les del nucli antic que tenen una normativa especial per
        // consideracions especials". Handing clau 12 the 1/10-of-street-width, 1,50 m allowance
        // would apply an article that names its own exclusion — the L-526 failure one clau over.
        for (const clau of ['12', '12b']) {
            const d = barcelonaCosSortintDisposition(clau)!;
            expect(d.relation, clau).toBe('prohibited-with-narrow-exceptions');
            expect(d.article, clau).toContain('320.5a');
            expect(d.article, clau).not.toContain('230.I)');
        }
    });

    it('⚠ *edificació aïllada* is EXACT, not under-stating — Art. 230.II charges the same budget', () => {
        // The one place the sign could have flipped. Art. 230.II counts *cossos sortints* into the
        // occupation percentage AND into the boundary separations the envelope is already drawn
        // to, so a projection cannot enlarge the permitted volume by one cubic metre.
        for (const clau of ['20a', ...BCN_20A_ZONE_CODES]) {
            const d = barcelonaCosSortintDisposition(clau)!;
            expect(d.relation, clau).toBe('consumed-by-occupation-and-separations');
            expect(d.omissionDirection, clau).toBe('exact');
            expect(d.article, clau).toBe('PGM Art. 230.II');
        }
    });

    it('an unrecognised clau gets NO disposition — never one inferred from its first character', () => {
        // The module-header rule of `esBarcelonaZoneClassification.ts`, applied here: `13a` starts
        // with `1` and `22a` with `2`; a prefix table would mis-classify half the city silently.
        for (const clau of ['21', '24', '99z', '2', '1a', '', '20']) {
            expect(barcelonaCosSortintDisposition(clau), clau).toBeNull();
        }
    });

    it('the transcribed Art. 229/230 figures match the primary text, and the two caps DIFFER', () => {
        // ⚠ 1,50 m (Art. 230.I) vs 1,80 m (Art. 230.III). Same rule, different ordination type;
        // collapsing them would publish the wrong cap for whichever zone lost.
        expect(BCN_ART230_I_ALINEACIONS_DE_VIAL.maxProjection_m).toBe(1.5);
        expect(BCN_ART230_III_VOLUMETRIA_ESPECIFICA.maxProjection_m).toBe(1.8);
        expect(BCN_ART230_I_ALINEACIONS_DE_VIAL.maxProjectionFractionOfStreetWidth).toBe(0.1);
        expect(BCN_ART230_I_ALINEACIONS_DE_VIAL.shallowProjectionExemption_m).toBe(0.45);
        expect(BCN_ART230_I_ALINEACIONS_DE_VIAL.lateralLimitPlaneFromPartyWall_m).toBe(1);
        // Art. 229.3 — the asymmetry that makes this a FAR question rather than a geometric one.
        expect(BCN_ART229_COMPUTATION.enclosedCountsTowardSostre).toBe(true);
        expect(BCN_ART229_COMPUTATION.openCountsTowardSostre).toBe(false);
        expect(BCN_ART229_COMPUTATION.prohibitedAtGroundFloor).toBe(true);
    });

    it('the citation names the DEFINITION article, not only the dimension article', () => {
        // Art. 230's figures without Art. 223.2.g's definition would leave the load-bearing fact —
        // that the thing being measured is outside the envelope — uncited.
        expect(BCN_COSSOS_SORTINTS_ORDINANCE_REF).toContain('Art. 223.2.g');
        expect(BCN_COSSOS_SORTINTS_ORDINANCE_REF).toContain('sobresurt');
        expect(BCN_COSSOS_SORTINTS_ORDINANCE_REF).toContain('Art. 229.2');
        expect(BCN_COSSOS_SORTINTS_ORDINANCE_REF).toContain('Art. 320.5a');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// BLOCKER 7 — §BARE-20A-EXHAUSTED: ten regimes, no selector.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('§BARE-20A-EXHAUSTED — bare `20a` is a subzone-undetermined refusal, not a coverage gap', () => {
    it('resolves to a REFUSAL, never to a pack and never to unregistered', () => {
        const d = resolveZoneDisposition(BCN_JURISDICTION_ID, '20a');
        expect(d.kind).toBe('refusal');
    });

    it('the refusal is `regime-undetermined` — not a coverage gap, not a delegation', () => {
        const d = resolveZoneDisposition(BCN_JURISDICTION_ID, '20a');
        expect(d.kind).toBe('refusal');
        if (d.kind !== 'refusal') return;
        expect(d.refusal.code).toBe('regime-undetermined');
        // `no-rule-pack` (what shipped before) was false: the ten subzones are transcribed.
        expect(d.refusal.code).not.toBe('no-rule-pack');
        // `derived-plan` would assert the PGM delegates this land elsewhere. Arts. 340/342/343
        // state the numbers outright — asserting a delegation would be L-526 verbatim.
        expect(d.refusal.code).not.toBe('derived-plan');
        // `source-data-unavailable` is the one TRANSIENT code and offers a retry that can never
        // succeed: no retry produces a subzone the source does not carry.
        expect(d.refusal.code).not.toBe('source-data-unavailable');
    });

    it('⚠ `legallyGrounded: false` — the law is known; the INPUT is not', () => {
        // Flipping this to `true` would render the card as "the ordinance grants no envelope here"
        // and tell the owner of a buildable villa plot their land cannot be built on — the false
        // negative L-553 ranks as the worst outcome in the set.
        const d = resolveZoneDisposition(BCN_JURISDICTION_ID, '20a');
        expect(d.kind).toBe('refusal');
        if (d.kind !== 'refusal') return;
        expect(d.refusal.legallyGrounded).toBe(false);
        // …and it still cites, because it makes real claims about the ordinance (C58 §1.13.4).
        expect(d.refusal.ordinanceRef).toBe(BCN_20A_BARE_ORDINANCE_REF);
    });

    it('⚠ the ten SUFFIXED claus are untouched — they have a pack and must keep it', () => {
        // The exact-equality match exists so a refactor cannot turn ten real envelopes into ten
        // refusals. `20a/*` must resolve to a pack, never to this card.
        expect(BCN_20A_ZONE_CODES).toHaveLength(10);
        for (const clau of BCN_20A_ZONE_CODES) {
            const d = resolveZoneDisposition(BCN_JURISDICTION_ID, clau);
            expect(d.kind, clau).toBe('pack');
        }
        expect(BCN_20A_ZONE_CODES).not.toContain('20a');
    });

    it('names Art. 339 (the rule KIND, subzone-neutral) and the articles that key the numbers', () => {
        const d = resolveZoneDisposition(BCN_JURISDICTION_ID, '20a');
        expect(d.kind).toBe('refusal');
        if (d.kind !== 'refusal') return;
        const { headline, detail } = d.refusal;
        // L-553 rule 1 — the zone, named, first.
        expect(headline).toContain('20a');
        expect(headline).toMatch(/subzone/i);
        // The one determination that IS subzone-neutral, and it is a KIND, not a figure.
        expect(detail).toMatch(/Art\. 339/);
        expect(detail).toMatch(/edificació aïllada/);
        // The articles that establish the ten-way split and key the parameters to it.
        expect(detail).toMatch(/Art\. 314\.5/);
        expect(detail).toMatch(/Art\. 338\.2/);
        expect(detail).toMatch(/Art\. 340\.1/);
        expect(detail).toMatch(/Art\. 342\.8/);
        // The missing input, NAMED — what makes it actionable rather than "we don't know".
        expect(detail).toMatch(/selector/i);
    });

    it('⚠ does NOT say PRYZM has not encoded 20a — the sentence that was false since the pack landed', () => {
        const d = resolveZoneDisposition(BCN_JURISDICTION_ID, '20a');
        expect(d.kind).toBe('refusal');
        if (d.kind !== 'refusal') return;
        const text = `${d.refusal.headline} ${d.refusal.detail}`;
        expect(text).not.toMatch(/has not encoded/i);
        expect(text).not.toMatch(/does not yet hold/i);
        expect(text).not.toMatch(/coming soon/i);
    });

    it('⚠⚠ THE LEAK TEST — the refusal publishes NO figure in the prose the user reads', () => {
        // The §DEC-1 discipline, mirrored. 22a's card may state two figures because they are
        // REGIME-NEUTRAL; NOT ONE 20a envelope figure is subzone-neutral, so printing any of them
        // — or a range — as this parcel's limit would assert the very fact the card declines.
        const d = resolveZoneDisposition(BCN_JURISDICTION_ID, '20a');
        expect(d.kind).toBe('refusal');
        if (d.kind !== 'refusal') return;
        const prose = `${d.refusal.headline} ${d.refusal.detail}`;
        const LEAKS = [
            '0,25', '0.25', '1,50', '1.50', '0,75', '0,50', '1,00', // Art. 340.1 indices
            '15 %', '40 %', '30 %', '20 %', '10 %',                 // Arts. 342.2 / 343.1 occupation
            '9,15', '15,25', '16,70', '7,55', '13,65', '10,60',     // Arts. 342.3/.4/.5 / 343.2 heights
            '2.000', '1.500', '1.000', '400', '600',                // Arts. 342.1 / 343.1 min parcels
            '12 m', '3 m', '8 m',                                   // Art. 342.8 separations
            'PB +', 'PB+',                                          // storey counts
        ];
        for (const leak of LEAKS) {
            expect(prose, `the bare-20a refusal leaked "${leak}"`).not.toContain(leak);
        }
        // …and the figures ARE available, under the citation, where they can be checked against
        // the articles. Withholding them entirely would be its own dishonesty (C58 §1.13.7).
        expect(d.refusal.ordinanceRef).toContain('0,25');
        expect(d.refusal.ordinanceRef).toContain('1,50');
        expect(d.refusal.ordinanceRef).toContain('Art. 342.8');
    });

    it('the citation carries the exhaustiveness finding — ten suffixed claus and no bare one', () => {
        // This is what makes the closure PERMANENT-until-a-selector-appears rather than pending a
        // portal sweep: the PGM's own catalogue is the negative result.
        for (const s of BCN_20A_SUBZONES) {
            expect(BCN_20A_BARE_ORDINANCE_REF, s.clau).toContain(s.clau);
        }
        expect(BCN_20A_BARE_ORDINANCE_REF).toContain('Art. 314.5');
        expect(BCN_20A_BARE_ORDINANCE_REF).toContain('Art. 339');
    });

    it('knownFacts are merged through, and the constructor never mutates the caller\'s array', () => {
        const facts = Object.freeze(['Parcel 1234', '812 m²']) as readonly string[];
        const r = barcelona20aSubzoneUndeterminedRefusal('20a', null, facts);
        expect(r.knownFacts).toEqual(['Parcel 1234', '812 m²']);
        expect(r.knownFacts).not.toBe(facts);
    });

    it('a caller-supplied label wins, and the ordinance label is the fallback', () => {
        expect(barcelona20aSubzoneUndeterminedRefusal('20a', 'Edif. aïllada').headline).toContain(
            'Edif. aïllada (clau 20a)',
        );
        expect(barcelona20aSubzoneUndeterminedRefusal('20a', '   ').headline).toContain(
            'Zona d’ordenació en edificació aïllada (clau 20a)',
        );
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// BLOCKER 3 — §CLAU-12-PREDICATE: there is no geographic predicate to write.
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe('§CLAU-12-PREDICATE — Art. 315.2 states no geographic test, so PRYZM encodes none', () => {
    it('⚠ the finding is recorded as data, so a polygon cannot be added quietly', () => {
        // Setting this to `true` requires an ordinance citation for a BOUNDARY — a plànol or an
        // article that delimits subzona I or II. A district polygon or a measured clau
        // distribution is not that: one is a different document, the other tells you what the
        // SOURCE says, not what the ordinance requires.
        expect(BCN_CLAU_12_GEOGRAPHIC_PREDICATE_EXISTS).toBe(false);
        expect(BCN_CLAU_12_PREDICATE_FINDING).toContain('Art. 315.2');
        expect(BCN_CLAU_12_PREDICATE_FINDING).toContain('preferentment');
        expect(BCN_CLAU_12_PREDICATE_FINDING).toContain('plànol d’ordenació');
        expect(BCN_CLAU_12_PREDICATE_FINDING).toContain('NOT-THE-RULE-KIND');
    });

    it('⚠⚠ THE INVARIANT THAT DOES THE WORK — `12` and `12b` never share a code path', () => {
        // The failure mode the register feared (Ciutat Vella receiving subzona I's 60 %-block
        // depth and street-width height) can only arise from a wrong clau in the SOURCE, never
        // from a routing mistake here. `12b`'s own rules are a SURVEY of the existing neighbours
        // (Art. 320.2a/3a subzona II), an input PRYZM holds nothing for.
        expect(BCN_NUCLI_ANTIC_ZONE_CODES).toEqual(['12']);
        expect(BCN_NUCLI_ANTIC_ZONE_CODES as readonly string[]).not.toContain('12b');

        const twelve = resolveZoneDisposition(BCN_JURISDICTION_ID, '12');
        expect(twelve.kind).toBe('pack');

        const twelveB = resolveZoneDisposition(BCN_JURISDICTION_ID, '12b');
        expect(twelveB.kind).toBe('refusal');
        if (twelveB.kind !== 'refusal') return;
        // ⚠ §CLAU-12B-TRAM-UNDEFINED (L-676) — this asserted `no-rule-pack` + `legallyGrounded:
        // false`, i.e. a COVERAGE GAP. That is no longer the truth and asserting it would hold the
        // shipped card to a superseded finding. PGM Art. 320.3a states subzona II's height rule
        // COMPLETELY as a rule; what it never defines is *un tram de vial*, and Art. 320.2a hands
        // the particular and detailed determination for this subzona to a **pla especial**. So the
        // refusal is a statement about the LAW — `derived-plan`, like clau 18 and 22@ — not about
        // PRYZM's coverage. The invariant this test exists for is UNCHANGED and still asserted
        // below: `12` and `12b` never share a code path.
        expect(twelveB.refusal.code).toBe('derived-plan');
        expect(twelveB.refusal.legallyGrounded).toBe(true);
        // ⚠ AND THE ORIGINAL GUARD SURVIVES, RE-AIMED. The failure mode is subzona I's CONSTRUCTION
        // being applied to subzona II's land: its 60 %-of-block depth and its street-width height
        // table. Art. 320.2a may now be NAMED (12b's own card cites it — it is the paragraph that
        // delegates to the pla especial), but subzona I's construction must never appear.
        expect(twelveB.refusal.detail).not.toMatch(/60 ?%/);
        expect(twelveB.refusal.detail).not.toMatch(/street-width band|amplada del vial/i);
        // ⚠ §DEC-1 leak rule — no figure in the prose. The article's own numbers (4 m, 3,05 m) live
        // in the citation and nowhere a reader could mistake them for their entitlement.
        expect(twelveB.refusal.detail).not.toMatch(/3[,.]05/);
        expect(twelveB.refusal.detail).not.toMatch(/\b4 m\b/);
        expect(twelveB.refusal.ordinanceRef).toContain('Art. 320.3a');
        expect(twelveB.refusal.ordinanceRef).toContain('tram de vial');
        expect(twelveB.refusal.ordinanceRef).toContain('pla especial');
        // ⚠ THE HALF INHERITED FROM `zoneRegistryAndRefusals.test.ts`, which `12b` left when it
        // stopped being a coverage gap. `12b` is a BUILDABLE clau, so the harmonised MUC code must
        // never call it public domain — telling a Ciutat Vella owner their plot is a road is the
        // false-negative-about-someone's-land error L-553 ranks worst. `derived-plan` says the rule
        // is in another instrument; it does NOT say the land is a system.
        const viaHarmonised = resolveZoneDisposition(BCN_JURISDICTION_ID, '12b', { harmonisedCode: 'R1' });
        expect(viaHarmonised.kind).toBe('refusal');
        if (viaHarmonised.kind !== 'refusal') return;
        expect(viaHarmonised.refusal.code).toBe('derived-plan');
        expect(['public-open-space', 'public-system', 'protected-soil', 'facility-plan'])
            .not.toContain(viaHarmonised.refusal.code);
    });

    it('⚠ the roadmap copy neither under-states our coverage NOR promises a zone the LAW delegates', () => {
        // It named `12` and "the 20a family" as *next* long after both shipped. A roadmap sentence
        // that under-states coverage is read by the owner of a zone we DO cover, and is the same
        // class of false statement as one that over-states it.
        //
        // ⚠ §CLAU-12B-TRAM-UNDEFINED (L-676) — the SPECIMEN MOVED, because `12b` no longer reaches
        // the roadmap line at all: it has its own cited `derived-plan` card. The line is now read
        // by the owner of any clau that falls through to the coverage gap, so that is what is
        // asserted. And the line's OWN defect is pinned: it used to end *"Next: 12b, whose rules
        // are a survey of the existing neighbours"* — **a promise PRYZM cannot keep**, because the
        // plan delegates 12b's determination rather than withholding a dataset. Promising a zone
        // the LAW delegates is the same class of false statement as under-stating coverage.
        const d = resolveZoneDisposition(BCN_JURISDICTION_ID, 'ZZ-not-a-real-clau');
        expect(d.kind).toBe('refusal');
        if (d.kind !== 'refusal') return;
        expect(d.refusal.code).toBe('no-rule-pack');
        expect(d.refusal.detail).not.toMatch(/Next: 12 \/ 12b/);
        expect(d.refusal.detail).toMatch(/clau 12 \(nucli antic/);
        expect(d.refusal.detail).not.toMatch(/Next: 12b/);
    });
});
