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
    BCN_ZONE_REFUSALS_BY_CLAU,
} from '../src/rulepacks/esBarcelonaZoneClassification.js';
import { buildRefusedEnvelope, isRefusedEnvelope } from '../src/rulepacks/zoneRefusal.js';
import { BCN_ENSANCHE_ZONE_CODES } from '../src/rulepacks/esBarcelonaEnsanche.js';

describe('L-550 P0.1 — the rule-pack registry', () => {
    it('answers `pack` for every clau the Barcelona ensanche pack is registered for', () => {
        for (const clau of BCN_ENSANCHE_ZONE_CODES) {
            const d = resolveZoneDisposition(BCN_JURISDICTION_ID, clau);
            expect(d.kind).toBe('pack');
            if (d.kind === 'pack') {
                expect(d.pack.jurisdictionId).toBe(BCN_JURISDICTION_ID);
                // The pack must genuinely contain the zone it is registered against, or the
                // engine would resolve `zone === null` and silently produce an all-estimated
                // envelope while the dispatcher believed a real pack had answered.
                expect(d.pack.zones.some((z) => z.code === clau)).toBe(true);
            }
        }
        expect(registeredPackZoneCodes(BCN_JURISDICTION_ID)).toEqual([...BCN_ENSANCHE_ZONE_CODES]);
    });

    it('L-553 — refuses a privately buildable clau with no pack, as a COVERAGE gap not a legal one', () => {
        // FOUNDER DECISION 2026-07-21: 13b/12/12b/22a/22@/20a lose their envelope rather than be
        // shown a generic setback triple, because in an *alineacions de vial* zone that triple is
        // the wrong geometric OPERATION, and no badge can label a category error.
        for (const clau of ['13b', '12', '12b', '22a', '22@', '20a', '20a/10']) {
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
        const facts = ['Cadastral reference: 0230904DF3803', 'Parcel area: 412 m²'];
        const d = resolveZoneDisposition(BCN_JURISDICTION_ID, '13b', {
            zoneLabel: 'Densificació Urbana Semiintensiva',
            knownFacts: facts,
        });
        expect(d.kind).toBe('refusal');
        if (d.kind !== 'refusal') return;
        // Rule 1 — the zone, in the ordinance's own words, in the headline.
        expect(d.refusal.headline).toContain('Densificació Urbana Semiintensiva');
        expect(d.refusal.headline).toContain('13b');
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
        // Alineació de vial — the shape argument is correct here.
        for (const clau of ['12', '12b', '13b']) {
            expect(detailFor(clau), clau).toMatch(/façade sits on the street line/i);
            expect(detailFor(clau), clau).toMatch(/wrong SHAPE/);
        }
        // Edificació aïllada — must NOT claim the shape is wrong; it must say the opposite.
        for (const clau of ['20a', '20a/10', '20a/9u']) {
            expect(detailFor(clau), clau).not.toMatch(/wrong SHAPE/);
            expect(detailFor(clau), clau).not.toMatch(/façade sits on the street line/i);
            expect(detailFor(clau), clau).toMatch(/IS governed by real separation distances/i);
        }
        // Industrial — coverage % + floor-area index, the ADR-0272 gap.
        for (const clau of ['22a', '22@']) {
            expect(detailFor(clau), clau).not.toMatch(/wrong SHAPE/);
            expect(detailFor(clau), clau).toMatch(/floor-area index/i);
        }
        // Every card, whatever the family, must carry the three invariants.
        for (const clau of ['12', '13b', '20a/10', '22a', '99z']) {
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
        expect(resolveZoneDisposition('es-28079-madrid', 'anything').kind).toBe('unregistered');
    });

    it('answers `unregistered` for an unknown jurisdiction rather than throwing', () => {
        // Every plot outside a registered city must keep working exactly as it does today.
        expect(resolveZoneDisposition('es-28079-madrid', '13a').kind).toBe('unregistered');
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
                expect(d.refusal.code, `${clau}/${muc}`).toBe('no-rule-pack');
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
