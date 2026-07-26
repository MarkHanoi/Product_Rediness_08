// L-550 — Phase 0.1 (rule-pack registry) + Phase 0.3/1b (refusal vocabulary).
//
// WHAT THESE TESTS ARE ACTUALLY GUARDING
// --------------------------------------
// The failure this slice exists to prevent is SILENT in both directions:
//   • refusing a buildable clau ⇒ the user is told the law forbids building on their plot;
//   • estimating on a refused clau ⇒ a fabricated setback triple over a park or a motorway.
// Neither throws, neither logs, and both render as a perfectly well-formed card. So the tests
// below assert the CLASSIFICATION boundaries directly, not merely that the lookup runs.

import { describe, it, expect } from 'vitest';
import { BuildableEnvelopeSchema } from '@pryzm/schemas';
import {
    resolveZoneDisposition,
    registeredPackZoneCodes,
    BCN_JURISDICTION_ID,
} from '../src/rulepacks/registry.js';
import {
    barcelonaZoneRefusal,
    barcelonaZoneRefusalFor,
    barcelonaConstructionIncompleteRefusal,
    BCN_ZONE_REFUSALS_BY_CLAU,
} from '../src/rulepacks/esBarcelonaZoneClassification.js';
import { buildRefusedEnvelope, isRefusedEnvelope } from '../src/rulepacks/zoneRefusal.js';
import { BCN_ENSANCHE_ZONE_CODES } from '../src/rulepacks/esBarcelonaEnsanche.js';
import { BCN_SEMIINTENSIVA_ZONE_CODES } from '../src/rulepacks/esBarcelonaSemiintensiva.js';
import { BCN_20A_AILLADA_ZONE_CODES } from '../src/rulepacks/esBarcelona20aAillada.js';
import { BCN_NUCLI_ANTIC_ZONE_CODES } from '../src/rulepacks/esBarcelonaNucliAntic.js';

describe('L-550 P0.1 — the rule-pack registry', () => {
    it('answers `pack` for every clau a Barcelona pack is registered for', () => {
        // §L-583 — 13b joined 13a/13E here. The loop is over the packs' OWN code lists rather
        // than a literal, so registering the next clau cannot leave this test asserting the old
        // coverage while passing.
        for (const clau of [
            ...BCN_ENSANCHE_ZONE_CODES,
            ...BCN_SEMIINTENSIVA_ZONE_CODES,
            // §L-591 — the ten `20a/*` subzone claus joined on the same terms.
            ...BCN_20A_AILLADA_ZONE_CODES,
            ...BCN_NUCLI_ANTIC_ZONE_CODES,   // §L-595 — clau 12 (annexed nuclis antics)
        ]) {
            const d = resolveZoneDisposition(BCN_JURISDICTION_ID, clau);
            expect(d.kind, clau).toBe('pack');
            if (d.kind === 'pack') {
                expect(d.pack.jurisdictionId).toBe(BCN_JURISDICTION_ID);
                // The pack must genuinely contain the zone it is registered against, or the
                // engine would resolve `zone === null` and silently produce an all-estimated
                // envelope while the dispatcher believed a real pack had answered.
                expect(d.pack.zones.some((z) => z.code === clau)).toBe(true);
            }
        }
        expect(registeredPackZoneCodes(BCN_JURISDICTION_ID)).toEqual([
            ...BCN_ENSANCHE_ZONE_CODES,
            ...BCN_SEMIINTENSIVA_ZONE_CODES,
            ...BCN_20A_AILLADA_ZONE_CODES,
            ...BCN_NUCLI_ANTIC_ZONE_CODES,   // §L-595 — clau 12 (annexed nuclis antics)
        ]);
    });

    it('§L-583 — 13b resolves to the 13b pack, never to the 13a one', () => {
        // The two packs share the Art. 242 depth construction and NOTHING else. If 13b ever
        // resolved through the ensanche pack, the engine would read 13a's zone entry and the
        // panel would cite Art. 327 on Subzona II land (L-526's failure class).
        const d = resolveZoneDisposition(BCN_JURISDICTION_ID, '13b');
        expect(d.kind).toBe('pack');
        if (d.kind !== 'pack') return;
        const zone = d.pack.zones.find((z) => z.code === '13b');
        expect(zone).toBeDefined();
        expect(zone!.ordinanceRef).toMatch(/Art\. 326/);
        expect(zone!.ordinanceRef).toMatch(/Art\. 328 states NO depth rule/);
        // The rule is the Art. 242 CONSTRUCTION, not a transcribed depth (the "18,00 m" trap).
        expect(zone!.geometricRule?.kind).toBe('block-derived-alignment');
        // And every number the ordinance does not state per-parcel stays absent.
        expect(zone!.maxHeight_m).toBeNull();
        expect(zone!.plotRatioFAR).toBeNull();
    });

    it('L-553 — refuses a privately buildable clau with no pack, as a COVERAGE gap not a legal one', () => {
        // FOUNDER DECISION 2026-07-21: 12/12b/22a/22@/20a lose their envelope rather than be
        // shown a generic setback triple, because in an *alineacions de vial* zone that triple is
        // the wrong geometric OPERATION, and no badge can label a category error.
        // §L-583 — `13b` has LEFT this list because it now has a pack, not because the policy
        // changed. That is the intended way out of a coverage gap: ship the zone's own article.
        // §L-591 — `20a/10` left for the same reason (the whole `20a/*` family is now packed).
        // ⚠ BARE `20a` STAYS. It names the zone, not the subzone, and the ten subzones span
        // 0,25–1,50 in edificabilitat — there is no representative value, so it remains a gap.
        // ⚠⚠ §L-590c — `22a` HAS LEFT THIS LIST, and NOT because it was packed. It now returns a
        // NAMED `regime-undetermined` refusal (ADR-0274) that publishes the regime-neutral half of
        // PGM Art. 350 under its own citation. Keeping it here would assert that a 22a owner is
        // told "PRYZM has not encoded this zone's rules yet" — a statement that has been FALSE
        // since `esBarcelonaIndustrial.ts` was authored. Note in particular that the
        // `ordinanceRef === null` assertion below is CORRECT for a coverage gap and would be
        // WRONG for 22a: that card DOES make claims about the ordinance and must cite them
        // (C58 §1.13.4). Its own assertions live in `esBarcelonaIndustrialPack.test.ts`.
        for (const clau of ['12b', '22@', '20a']) {   // §L-595 — '12' is packed now
            const d = resolveZoneDisposition(BCN_JURISDICTION_ID, clau);
            expect(d.kind, clau).toBe('refusal');
            if (d.kind !== 'refusal') continue;
            expect(d.refusal.code, clau).toBe('no-rule-pack');
            // ⚠ THE LOAD-BEARING ASSERTION. A coverage gap must NEVER claim to be a legal
            // finding — that would tell a developer the law forbids building on their perfectly
            // buildable plot, which is a worse error than the one this replaced.
            expect(d.refusal.legallyGrounded, clau).toBe(false);
            // …and must carry no ordinance citation, for the same reason (L-526).
            expect(d.refusal.ordinanceRef, clau).toBeNull();
        }
    });

    it('L-553 — a LEGAL refusal is never displaced by the coverage-gap fallback', () => {
        // Precedence: the ordinance's answer outranks a statement about PRYZM's coverage. If this
        // inverted, every park in Barcelona would read "rules coming soon".
        for (const clau of ['6a', '18', '27', 'SX1', '8a']) {
            const d = resolveZoneDisposition(BCN_JURISDICTION_ID, clau);
            expect(d.kind, clau).toBe('refusal');
            if (d.kind !== 'refusal') continue;
            expect(d.refusal.code, clau).not.toBe('no-rule-pack');
            expect(d.refusal.legallyGrounded, clau).toBe(true);
        }
    });

    it('L-553 — the coverage-gap card names the zone and carries the parcel facts', () => {
        // The card is what decides whether full honesty succeeds or reads as a crash, so its
        // inputs are asserted, not assumed. Half of Barcelona's buildable land sees this.
        // §L-583 — the specimen clau moved from `13b` (now packed) to `12b` (Barcelona's nucli
        // antic de conservació, still a genuine coverage gap and a HARD one: L-583 §5.2 shows it
        // is a neighbour-survey rule, not a table, and §5.3 that our height inputs are 0.9 %
        // surveyed). The card's rules are unchanged; only the zone standing in for them is.
        const facts = ['Cadastral reference: 0230904DF3803', 'Parcel area: 412 m²'];
        const d = resolveZoneDisposition(BCN_JURISDICTION_ID, '12b', {
            zoneLabel: 'Nucli Antic de Conservació',
            knownFacts: facts,
        });
        expect(d.kind).toBe('refusal');
        if (d.kind !== 'refusal') return;
        // Rule 1 — the zone, in the ordinance's own words, in the headline.
        expect(d.refusal.headline).toContain('Nucli Antic de Conservació');
        expect(d.refusal.headline).toContain('12b');
        // Rule 2 — "not encoded yet", never "no envelope applies" (that is the legal card).
        expect(d.refusal.headline).toMatch(/not encoded/i);
        expect(d.refusal.headline).not.toMatch(/no envelope applies/i);
        // Rule 3 — the reason nothing is drawn, in the user's terms.
        expect(d.refusal.detail).toMatch(/coverage gap, not an error/i);
        expect(d.refusal.detail).toMatch(/rather show you nothing than something wrong/i);
        // Rule 4 — a roadmap, with the covered zone named.
        expect(d.refusal.detail).toMatch(/13a/);
        // …and the facts, so the panel is never blank.
        expect(d.refusal.knownFacts).toEqual(facts);
    });

    it('L-553 — the "why nothing is drawn" reason is TRUE OF EACH ZONE, not one sentence for all', () => {
        // ⚠ THE BUG THIS PINS, caught in review before it shipped. The first draft of the card
        // told every unpacked clau "the façade sits on the street line … a setback estimate would
        // be the wrong shape". True for 12/12b/13b — FLATLY WRONG for 20a, where *edificació
        // aïllada* separations ARE real front/side/rear distances and a setback triple is the
        // correct shape (ADR-0272 §3.7). It would have stated a confident falsehood about the
        // user's land inside the copy written to explain why we refuse to do exactly that.
        const detailFor = (clau: string): string => {
            const d = resolveZoneDisposition(BCN_JURISDICTION_ID, clau);
            expect(d.kind).toBe('refusal');
            return d.kind === 'refusal' ? d.refusal.detail : '';
        };
        // Alineació de vial — the shape argument is correct here. (§L-583: `13b` is no longer in
        // this list because it is packed; the argument still holds for it, it is just no longer
        // reached.)
        for (const clau of ['12b']) {   // §L-595 — '12' is packed now
            expect(detailFor(clau), clau).toMatch(/façade sits on the street line/i);
            expect(detailFor(clau), clau).toMatch(/wrong SHAPE/);
        }
        // Edificació aïllada — must NOT claim the shape is wrong; it must say the opposite.
        // §L-591 — the suffixed claus are packed now; bare `20a` is the remaining gap and still
        // reaches this copy, which is what keeps the per-family wording under test.
        for (const clau of ['20a']) {
            expect(detailFor(clau), clau).not.toMatch(/wrong SHAPE/);
            expect(detailFor(clau), clau).not.toMatch(/façade sits on the street line/i);
            expect(detailFor(clau), clau).toMatch(/IS governed by real separation distances/i);
        }
        // Industrial. ⚠ §L-590c — `22a` IS NO LONGER HERE: it does not reach the coverage-gap
        // copy at all, because `barcelonaZoneRefusalFor` answers it first with the named
        // `regime-undetermined` card. `22@` remains, and its copy has been RE-POINTED at 22@'s
        // own blocker (a distinct subzone with its own articles) rather than inheriting 22a's —
        // leaving 22a's wording on a card 22a can no longer reach would have left a sentence
        // that is true of nothing.
        for (const clau of ['22@']) {
            expect(detailFor(clau), clau).not.toMatch(/wrong SHAPE/);
            expect(detailFor(clau), clau).toMatch(/formally distinct subzone/i);
            // …and it must NOT quote the base zone's article at 22@, which is the whole reason
            // 22@ is unpacked in the first place.
            expect(detailFor(clau), clau).not.toMatch(/Art\. 350/);
        }
        // Every card, whatever the family, must carry the three invariants.
        for (const clau of ['12b', '20a', '22@', '99z']) {   // §L-595 — '12' is packed now
            const d = detailFor(clau);
            expect(d, clau).toMatch(/coverage gap, not an error/i);
            // The COMMITMENT, not one exact phrasing: every card must say, in whatever words fit
            // that family, that showing nothing is preferred to showing something wrong. (The
            // 20a copy reaches it via "worse than showing none" — asserting a fixed string here
            // would have forced the wrong sentence into the right card.)
            expect(d, clau).toMatch(
                /rather show you nothing than something wrong|worse than showing none/i,
            );
            expect(d, clau).toMatch(/13a/); // the roadmap names what IS covered
        }
    });

    it('L-553 — a jurisdiction with no coverage-gap policy still answers `unregistered`', () => {
        // Deleting the `unregistered` outcome would bake Barcelona's answer into every future
        // city. In suburban/detached fabric a setback triple is the RIGHT shape and an estimate
        // is genuinely just an estimate.
        // ⚠ Uses a genuinely-UNREGISTERED id: Madrid (es-28079-madrid) is now registered as a
        // refusal jurisdiction (L-608), so it no longer answers `unregistered`.
        expect(resolveZoneDisposition('es-99999-unregistered', 'anything').kind).toBe('unregistered');
    });

    it('answers `unregistered` for an unknown jurisdiction rather than throwing', () => {
        // Every plot outside a registered city must keep working exactly as it does today.
        expect(resolveZoneDisposition('es-99999-unregistered', '13a').kind).toBe('unregistered');
        expect(resolveZoneDisposition('', '').kind).toBe('unregistered');
    });

    it('gives a registered PACK precedence over a refusal classification', () => {
        // A clau that is both packed and classified must resolve to the pack — a working
        // envelope surfaces the contradiction, a silent denial hides it.
        const packed = new Set<string>(registeredPackZoneCodes(BCN_JURISDICTION_ID));
        for (const clau of packed) {
            if (BCN_ZONE_REFUSALS_BY_CLAU.has(clau)) {
                expect(resolveZoneDisposition(BCN_JURISDICTION_ID, clau).kind).toBe('pack');
            }
        }
    });
});

describe('L-550 P0.3/1b — the Barcelona clau classification', () => {
    it('refuses the systems, protected soil, open space and facility claus with the right code', () => {
        const cases: ReadonlyArray<readonly [string, string]> = [
            ['1a', 'public-system'],
            ['3', 'public-system'],
            ['4', 'public-system'],
            ['5b', 'public-system'],
            ['SX1', 'public-system'],
            ['SX3', 'public-system'],
            ['SH', 'public-system'],
            ['6a', 'public-open-space'],
            ['6c', 'public-open-space'],
            ['7a', 'facility-plan'],
            ['7hd', 'facility-plan'],
            ['9', 'protected-soil'],
            ['27', 'protected-soil'],
            ['29', 'protected-soil'],
            ['8a', 'protected-private-green'],
            ['18', 'derived-plan'],
            ['15', 'derived-plan'],
            ['16', 'derived-plan'],
            ['17/6', 'derived-plan'],
            ['14a', 'derived-plan'],
        ];
        for (const [clau, code] of cases) {
            const r = barcelonaZoneRefusal(clau);
            expect(r, `clau ${clau} must be classified`).not.toBeNull();
            expect(r!.code, `clau ${clau}`).toBe(code);
            expect(r!.legallyGrounded).toBe(true);
            expect(r!.ordinanceRef).toBeTruthy();
        }
    });

    it('does NOT refuse a buildable clau — including the ones whose first character collides', () => {
        // The prefix-matching trap, asserted rather than commented: `13a` starts with `1` (port),
        // `22a` with `2` (forest reserve), `20a` with `2`. A prefix table would refuse the
        // Eixample. This test fails loudly if anyone "simplifies" the enumeration.
        for (const clau of ['13a', '13E', '13b', '12', '12b', '20a', '20a/9u', '22a', '22@', '21']) {
            expect(barcelonaZoneRefusal(clau), `clau ${clau} must NOT be refused`).toBeNull();
        }
    });

    it('makes no claim about an unrecognised clau', () => {
        for (const clau of ['', '99z', '6', '7', '1', '2', 'SX', '13']) {
            expect(barcelonaZoneRefusal(clau)).toBeNull();
        }
    });

    it('cites PGM Art. 306 specifically on clau 18 — the one article the research reached', () => {
        const r = barcelonaZoneRefusal('18');
        expect(r!.ordinanceRef).toContain('Art. 306');
        // The detail must state that the PGM DELEGATES rather than that it is silent — those
        // are different legal claims and only the first is true.
        expect(r!.detail).toMatch(/volumetric ordering/i);
    });
});

describe('L-550 — the harmonised MUC-code fallback (the COMPOSITE-clau gap the probe found)', () => {
    it('refuses the composite system claus the enumeration could not anticipate', () => {
        // Measured live, from `scratchpad/bcn-clau-distribution.json`: these four claus occurred
        // in Barcelona, are systems by their own MUC label, and were falling to the estimated
        // pack — a fabricated setback triple on a civic way and on parkland.
        const measured: ReadonlyArray<readonly [string, string]> = [
            ['1a-5b', 'SX2'], // "Vies cíviques"
            ['3-5', 'SX2'], // "Sistema viari bàsic"
            ['7b-6b', 'SV'], // "Parcs i jardins urbans"
            ['3-6b', 'SV'], // "Parcs i jardins urbans"
        ];
        for (const [clau, muc] of measured) {
            expect(barcelonaZoneRefusal(clau), `${clau} is not enumerated`).toBeNull();
            const r = barcelonaZoneRefusalFor(clau, muc);
            expect(r, `${clau} must be refused via its harmonised code`).not.toBeNull();
            expect(r!.code).toBe('public-system');
            // The weaker evidence tier must be VISIBLE, not silently upgraded to an article.
            expect(r!.ordinanceRef).toContain('CODI_QUAL_MUC');
            expect(r!.detail).toMatch(/harmonised/i);
        }
    });

    it('never lets the harmonised code call a buildable zone a SYSTEM', () => {
        // The cross-tab over all 1 014 measured points: A1/M*/R* are the private zones and
        // contain no systems. If a future MUC class beginning with S were buildable this test
        // is where the assumption breaks, loudly.
        //
        // ⚠ Note what is asserted, and what deliberately is NOT. Since L-553 these claus DO
        // refuse — as a COVERAGE GAP, a statement about PRYZM. What must never happen is the
        // harmonised code declaring them public domain, because that is a claim about the LAW
        // and it would tell a developer their buildable plot is a road.
        for (const [clau, muc] of [
            ['13a', 'R2'], ['13b', 'R2'], ['12', 'R1'], ['12b', 'R1'],
            ['22a', 'A1'], ['22@', 'M3'], ['20a/10', 'R6'], ['20a', 'R4'],
        ] as const) {
            const d = resolveZoneDisposition(BCN_JURISDICTION_ID, clau, { harmonisedCode: muc });
            if (d.kind === 'refusal') {
                // ⚠ §L-590c — this asserted the literal `'no-rule-pack'`, which was a proxy for
                // the real invariant and broke the moment a second `legallyGrounded: false` code
                // was introduced for one of these claus (`22a` ⇒ `regime-undetermined`). It now
                // asserts the invariant the test's own header states: whatever the code, it must
                // be a statement about PRYZM, never one of the LEGAL system classifications. A
                // proxy assertion that fails on a correct change is a test encoding the wrong
                // thing, so it is re-aimed rather than relaxed — the allow-list is CLOSED, so a
                // future third code must be added here deliberately.
                expect(
                    ['no-rule-pack', 'regime-undetermined'],
                    `${clau}/${muc} — a buildable clau may only ever refuse with a code that is ` +
                        'about PRYZM, never with a legal system classification',
                ).toContain(d.refusal.code);
                expect(d.refusal.legallyGrounded, `${clau}/${muc}`).toBe(false);
            } else {
                expect(d.kind, `${clau}/${muc}`).toBe('pack');
            }
        }
    });

    it('degrades to the per-clau table when no harmonised code is supplied', () => {
        expect(barcelonaZoneRefusalFor('6a', null)!.code).toBe('public-open-space');
        expect(barcelonaZoneRefusalFor('1a-5b', null)).toBeNull();
        expect(barcelonaZoneRefusalFor('1a-5b', undefined)).toBeNull();
    });

    it('lets the per-clau (article-cited) table win over the harmonised code', () => {
        // clau 18 is `R4` — not an S class — but even if the codes disagreed the enumerated,
        // Art. 306-cited answer must govern, because it is the stronger evidence.
        const r = barcelonaZoneRefusalFor('18', 'SV');
        expect(r!.code).toBe('derived-plan');
        expect(r!.ordinanceRef).toContain('Art. 306');
    });
});

describe('L-550 — the refused envelope', () => {
    // Resolved through the public entry point, so the envelope under test is the one the
    // dispatcher actually builds (facts attached), not a hand-assembled approximation of it.
    const refusal = barcelonaZoneRefusalFor('6a', null, ['Parcel area: 900 m²'])!;
    const env = buildRefusedEnvelope('6a', refusal);

    it('parses against the schema, which enforces refusal ⇔ not-applicable', () => {
        expect(() => BuildableEnvelopeSchema.parse(env)).not.toThrow();
        // Both halves of the refinement.
        expect(() =>
            BuildableEnvelopeSchema.parse({ ...env, refusal: null }),
        ).toThrow();
        expect(() =>
            BuildableEnvelopeSchema.parse({ ...env, status: 'ok' }),
        ).toThrow();
    });

    it('carries NO numbers and NO ring — a refusal must not be extrudable', () => {
        // Every field a downstream consumer (storeyCap, the generators, the massing render)
        // could turn into a volume. One non-null here re-admits the fabrication.
        expect(env.insetPolygon).toEqual([]);
        expect(env.insetAreaM2).toBe(0);
        expect(env.maxHeight_m).toBeNull();
        expect(env.maxFloors).toBeNull();
        expect(env.maxFAR).toBeNull();
        expect(env.maxCoverage).toBeNull();
        expect(env.maxVolumeM3).toBeNull();
        expect(env.derivation).toEqual([]);
    });

    it('is labelled `not-determined`, never `estimated-ruleset`', () => {
        // The distinction Phase 1b is entirely about: an estimate is a number we produced and
        // labelled; this is the deliberate absence of one.
        expect(env.confidence).toBe('not-determined');
        expect(env.status).toBe('not-applicable');
        expect(env.zoneCode).toBe('6a');
        expect(isRefusedEnvelope(env)).toBe(true);
    });

    it('is distinguishable from `degenerate` and from `none`', () => {
        expect(isRefusedEnvelope({ ...env, status: 'degenerate' })).toBe(false);
        expect(isRefusedEnvelope({ ...env, status: 'none', refusal: null })).toBe(false);
        expect(isRefusedEnvelope(null)).toBe(false);
    });

    it('surfaces the reason in caveats too, so a caveat-only reader is not left blank', () => {
        expect(env.caveats).toContain(refusal.headline);
        expect(env.caveats.length).toBeGreaterThanOrEqual(2);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §L-574 — the THIRD refusal: an ENCODED clau whose construction could not complete.
//
// Founder-decided 2026-07-21. Before this, a 13a parcel whose Art. 242.2 construction failed
// (block unavailable, dissolve refused, no solution) fell through to the GENERIC ESTIMATED PACK
// and was shown a front/side/rear triple. For a *segons alineacions de vial* clau that triple is
// the wrong SHAPE, not an imprecise number (C58 §1.11) — an envelope spanning the full plot
// depth on the most valuable land in Barcelona. ~8.6 % of Eixample parcels take this path
// (the dissolve succeeds on 91.4 %, L-539), plus every transient Catastro failure.
// ─────────────────────────────────────────────────────────────────────────────
describe('§L-574 — construction-incomplete is its own refusal, not either existing one', () => {
    const REASONS = [
        'block-unavailable',
        'block-dissolve-refused',
        'construction-no-solution',
    ] as const;

    it('is NEVER legally grounded — it is a statement about PRYZM, not the ordinance', () => {
        // THE LOAD-BEARING ASSERTION. Wearing the legal chip would tell an Eixample owner the law
        // forbids building on their buildable plot — L-553: "a false negative about someone's
        // land, worse than the error this replaced."
        for (const reason of REASONS) {
            const r = barcelonaConstructionIncompleteRefusal('13a', reason);
            expect(r.legallyGrounded).toBe(false);
            expect(r.code).toBe('source-data-unavailable');
        }
    });

    it('never cites an ordinance — Art. 242.2 is not why we failed, our data path is', () => {
        // The L-526 error: an authoritative-looking citation for a claim the document never makes.
        for (const reason of REASONS) {
            expect(barcelonaConstructionIncompleteRefusal('13a', reason).ordinanceRef).toBeNull();
        }
    });

    it('does NOT claim the zone is unencoded — that is the other card, and it would be false', () => {
        // We HAVE the 13a pack and it works on 91.4 % of blocks. Saying "not encoded yet" here
        // would be a different lie from the one being fixed.
        for (const reason of REASONS) {
            const { headline, detail } = barcelonaConstructionIncompleteRefusal('13a', reason);
            expect(`${headline} ${detail}`).not.toMatch(/not encoded|has not encoded|coming soon/i);
        }
        // …and it says the opposite, explicitly.
        expect(barcelonaConstructionIncompleteRefusal('13a', 'block-unavailable').detail)
            .toMatch(/rules encoded/i);
    });

    it('names the zone first and says the land is unaffected (L-553 legibility rules)', () => {
        const r = barcelonaConstructionIncompleteRefusal('13a', 'block-unavailable', 'Eixample');
        expect(r.headline).toMatch(/^Eixample \(clau 13a\)/);
        expect(r.detail).toMatch(/not a limit on your land/i);
    });

    it('states each failure reason distinctly — a generic message would hide which one', () => {
        const details = REASONS.map(
            (x) => barcelonaConstructionIncompleteRefusal('13a', x).detail,
        );
        expect(new Set(details).size).toBe(REASONS.length);
    });

    it('signals that a retry may help — it is the ONLY transient refusal', () => {
        expect(barcelonaConstructionIncompleteRefusal('13a', 'block-unavailable').detail)
            .toMatch(/temporary|retry/i);
    });

    it('carries knownFacts so the panel is never blank (L-553)', () => {
        const r = barcelonaConstructionIncompleteRefusal('13a', 'block-unavailable', 'Eixample', [
            'Cadastral reference: 1234567AB1234C',
            'Area: 412 m²',
        ]);
        expect(r.knownFacts).toHaveLength(2);
    });

    it('builds an envelope with status `none`, NOT `not-applicable`', () => {
        // `not-applicable` means the ordinance ANSWERED "not by a zone envelope". A Catastro
        // outage establishes no such thing. `none` = attempted, no data — which is exactly true.
        const env = buildRefusedEnvelope(
            '13a',
            barcelonaConstructionIncompleteRefusal('13a', 'block-unavailable'),
            'none',
        );
        expect(env.status).toBe('none');
        expect(env.confidence).toBe('not-determined');
        // The L-445 protection must survive the new status: nothing extrudable escapes.
        expect(env.insetPolygon).toEqual([]);
        expect(env.insetAreaM2).toBe(0);
        expect(env.maxHeight_m).toBeNull();
        expect(isRefusedEnvelope(env)).toBe(true);
    });

    it('the legal refusal still defaults to `not-applicable` — the default did not shift', () => {
        // Guard on the signature change: adding an optional 3rd parameter must not silently
        // re-status the 24.2 % of Barcelona that is a genuine legal refusal.
        // Production attaches per-parcel facts before building (esBarcelonaZoneClassification
        // `attach()`); ClassifiedRefusal omits `knownFacts`, so mirror that step here.
        const legal = buildRefusedEnvelope('6b', { ...barcelonaZoneRefusal('6b')!, knownFacts: [] });
        expect(legal.status).toBe('not-applicable');
    });
});
