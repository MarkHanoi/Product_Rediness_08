// L-591 — the `20a` (*ordenació en edificació aïllada*) pack, pinned against the PRIMARY SOURCE.
//
// Every numeric assertion below is a transcription of the Barcelona-exclusive text of PGM Arts.
// 340/342/343 as printed in `docs/04-reference/spain/barcelona-catalonia/PGM-NNUU-metropolitana.pdf`
// (printed pp. 110–113 for Art. 340, pp. 179–183 for the Barcelona Arts. 342/343). They exist so a
// future "tidy-up" of the table fails here rather than in someone's planning application.

import { describe, it, expect } from 'vitest';
import {
    ES_BARCELONA_20A_AILLADA_PACK,
    BCN_20A_AILLADA_ZONE_CODES,
    resolve20aEdificabilitat,
    resolve20aParcelOverrides,
    BCN_20A_SUBZONES,
    BCN_20A_BY_CLAU,
    BCN_ALCADA_20A_V_TABLE,
    BCN_ART342_5_EDGE_CONVENTION,
    BCN_20A_ART342_DWELLING_MODULE_M2,
    resolveAlcada20aSubzonaV,
    resolveBcnAlcadaForZone,
    resolveZoneDisposition,
    BCN_JURISDICTION_ID,
} from '../src/index.js';

const zone = (clau: string) =>
    ES_BARCELONA_20A_AILLADA_PACK.zones.find((z) => z.code === clau);

describe('L-591 — Art. 340.1, the net edificabilitat table', () => {
    it('transcribes all ten claus exactly as printed on p. 111', () => {
        const expected: ReadonlyArray<readonly [string, number]> = [
            ['20a/6', 0.25], // I
            ['20a/5', 0.5], // II
            ['20a/7', 0.75], // III
            ['20a/9', 1.0], // IVa
            ['20a/9b', 1.0], // IVb
            ['20a/8', 1.5], // V
            ['20a/9u', 1.0], // VI
            ['20a/10', 0.75], // VII
            ['20a/11', 0.5], // VIII
            ['20a/12', 0.25], // IX
        ];
        expect(BCN_20A_SUBZONES.map((s) => [s.clau, s.edificabilitatNeta])).toEqual(
            expected.map(([c, v]) => [c, v]),
        );
    });

    it('Art. 340.2 is an ALGORITHM scoped to the UNIFAMILIAR subzones — not a global reduction', () => {
        // ⚠ THE ASSERTION THIS FILE EXISTS FOR. IVa and IVb also carry 1,00, and they are
        // PLURIFAMILIAR. Art. 340.2 says "A les subzones unifamiliars…" — reading the reduction as
        // global would cut a 300 m² IVa parcel by 25 % on an article that does not reach it.
        for (const clau of ['20a/9', '20a/9b']) {
            const r = resolve20aEdificabilitat(clau, { parcelArea_m2: 300 });
            expect(r.ok, clau).toBe(true);
            if (!r.ok) continue;
            expect(r.index, clau).toBe(1.0);
            expect(r.article, clau).toBe('Art. 340.1');
        }
        // …and subzona VI, which IS unifamiliar, does take the reduction.
        const vi = resolve20aEdificabilitat('20a/9u', { parcelArea_m2: 300 });
        expect(vi.ok).toBe(true);
        if (vi.ok) {
            expect(vi.index).toBe(0.75);
            expect(vi.article).toMatch(/Art\. 340\.2/);
        }
        const viLarge = resolve20aEdificabilitat('20a/9u', { parcelArea_m2: 500 });
        expect(viLarge.ok && viLarge.index).toBe(1.0);
    });

    it('subzona VI below Barcelona Art. 343.1\'s 200 m² floor states NO index — not 0,75, not 0', () => {
        const r = resolve20aEdificabilitat('20a/9u', { parcelArea_m2: 150 });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('below-ordinance-floor');
        expect(r.detail).toMatch(/200 m²/);
    });

    it('refuses subzona VI without a parcel area rather than guessing which side of 400 m² it is', () => {
        const r = resolve20aEdificabilitat('20a/9u');
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('needs-parcel-area');
    });

    it('never states an index for a clau it does not know — including bare "20a"', () => {
        for (const clau of ['20a', '20a/99', '13a', '']) {
            const r = resolve20aEdificabilitat(clau, { parcelArea_m2: 500 });
            expect(r.ok, clau).toBe(false);
            if (!r.ok) expect(r.reason, clau).toBe('unknown-clau');
        }
    });

    it('always carries the Art. 255 slope caveat — the terrain gap must never be silent', () => {
        for (const s of BCN_20A_SUBZONES) {
            const r = resolve20aEdificabilitat(s.clau, { parcelArea_m2: 5000, amplada_m: 20 });
            expect(r.ok, s.clau).toBe(true);
            if (!r.ok) continue;
            expect(r.caveats.join(' '), s.clau).toMatch(/Art\. 255/);
            expect(r.caveats.join(' '), s.clau).toMatch(/inedificable/i);
        }
    });
});

describe('L-591 — Barcelona Art. 342.5, the subzona V street-width ladder', () => {
    it('transcribes Taula 10/11 exactly, height AND edificabilitat on the same row', () => {
        expect(BCN_ALCADA_20A_V_TABLE.map((b) => [b.height_m, b.floorsAboveGround, b.edificabilitatNeta]))
            .toEqual([
                [7.55, 1, 0.6],
                [10.6, 2, 0.9],
                [13.65, 3, 1.2],
                [16.7, 4, 1.5],
            ]);
    });

    it('the band edges ARE stated by the ordinance here (unlike Art. 328\'s adopted convention)', () => {
        expect(BCN_ART342_5_EDGE_CONVENTION.statedByOrdinance).toBe(true);
        expect(BCN_ART342_5_EDGE_CONVENTION.lowerInclusive).toBe(true);
    });

    it('every band differs in BOTH height and index, so the height-based guard also guards the index', () => {
        // The `band-edge` refusal compares heights. That is only a sufficient guard for the index
        // while no two rows share a height. Pin it.
        const heights = BCN_ALCADA_20A_V_TABLE.map((b) => b.height_m);
        const indices = BCN_ALCADA_20A_V_TABLE.map((b) => b.edificabilitatNeta);
        expect(new Set(heights).size).toBe(heights.length);
        expect(new Set(indices).size).toBe(indices.length);
    });

    it('resolves a mid-band official width to the row\'s height AND its index together', () => {
        const r = resolveAlcada20aSubzonaV(12.5, { trustedOfficialWidth: true });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.height_m).toBe(13.65);
        expect(r.floorsAboveGround).toBe(3);
        expect(r.edificabilitatNeta).toBe(1.2);
        // No Eixample cornice increment on a 20a parcel — it is a different ordinance's allowance.
        expect(r.corniceIncrementMax_m).toBeNull();
    });

    it('refuses a MEASURED width sitting on a band edge — noise must not pick a 2,5× index', () => {
        const r = resolveAlcada20aSubzonaV(15.0);
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.reason).toBe('band-edge');
            expect(r.straddles).toEqual([13.65, 16.7]);
        }
        // …and the same refusal must propagate through the edificabilitat resolver, not be
        // silently downgraded to Art. 340.1's headline 1,50.
        const e = resolve20aEdificabilitat('20a/8', { amplada_m: 15.0 });
        expect(e.ok).toBe(false);
        if (!e.ok) expect(e.reason).toBe('band-edge');
    });

    it('refuses subzona V with no width rather than publishing Art. 340.1\'s 1,50', () => {
        const r = resolve20aEdificabilitat('20a/8', { parcelArea_m2: 900 });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.reason).toBe('needs-street-width');
            expect(r.detail).toMatch(/2,5×/);
        }
    });

    it('a narrow-street subzona V parcel gets 0,60 — the whole point of the Barcelona column', () => {
        const r = resolve20aEdificabilitat('20a/8', {
            amplada_m: 6.5,
            trustedOfficialWidth: true,
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.index).toBe(0.6);
            expect(r.article).toMatch(/Art\. 342\.5/);
        }
    });
});

describe('L-591 — the pack', () => {
    it('registers exactly the ten subzone claus, and NOT bare "20a"', () => {
        expect([...BCN_20A_AILLADA_ZONE_CODES].sort()).toEqual(
            [
                '20a/10',
                '20a/11',
                '20a/12',
                '20a/5',
                '20a/6',
                '20a/7',
                '20a/8',
                '20a/9',
                '20a/9b',
                '20a/9u',
            ].sort(),
        );
        expect(BCN_20A_AILLADA_ZONE_CODES).not.toContain('20a');
    });

    it('bare "20a" still refuses as a COVERAGE gap — the zone is not the subzone', () => {
        const d = resolveZoneDisposition(BCN_JURISDICTION_ID, '20a');
        expect(d.kind).toBe('refusal');
        if (d.kind === 'refusal') {
            expect(d.refusal.code).toBe('no-rule-pack');
            expect(d.refusal.legallyGrounded).toBe(false);
        }
    });

    it('every subzone clau now resolves to a PACK', () => {
        for (const clau of BCN_20A_AILLADA_ZONE_CODES) {
            const d = resolveZoneDisposition(BCN_JURISDICTION_ID, clau);
            expect(d.kind, clau).toBe('pack');
        }
    });

    it('uses `kind: "setback"` — the ordinance\'s own shape, not a forced fit', () => {
        for (const s of BCN_20A_SUBZONES) {
            const z = zone(s.clau)!;
            expect(z.geometricRule?.kind, s.clau).toBe('setback');
            expect(z.setbacks.front_m, s.clau).toBe(s.separations.front_m);
            expect(z.setbacks.side_m, s.clau).toBe(s.separations.side_m);
            expect(z.setbacks.rear_m, s.clau).toBe(s.separations.rear_m);
        }
    });

    it('transcribes Art. 342.7 / 343.3 front–lateral–fons exactly as printed', () => {
        const expected: Record<string, readonly [number, number, number]> = {
            '20a/6': [12, 8, 10],
            '20a/5': [10, 6, 8],
            '20a/7': [8, 4, 6],
            '20a/9': [3, 3, 3],
            '20a/9b': [8, 5, 6],
            '20a/8': [4, 4, 5],
            '20a/9u': [3, 3, 3],
            '20a/10': [5, 3, 5],
            '20a/11': [8, 5, 8],
            '20a/12': [12, 10, 12],
        };
        for (const [clau, [f, s, r]] of Object.entries(expected)) {
            const sub = BCN_20A_BY_CLAU.get(clau)!;
            expect([sub.separations.front_m, sub.separations.side_m, sub.separations.rear_m], clau)
                .toEqual([f, s, r]);
        }
    });

    it('transcribes Art. 342.2 / 343.1 ocupació màxima exactly as printed', () => {
        const expected: Record<string, number> = {
            '20a/6': 0.15,
            '20a/5': 0.2,
            '20a/7': 0.3,
            '20a/9': 0.4,
            '20a/9b': 0.25,
            '20a/8': 0.3,
            '20a/9u': 0.4,
            '20a/10': 0.3,
            '20a/11': 0.2,
            '20a/12': 0.1,
        };
        for (const [clau, cov] of Object.entries(expected)) {
            expect(zone(clau)!.maxCoverage, clau).toBe(cov);
        }
    });

    it('heights: 9,15 m PB+2 everywhere, 15,25 m PB+4 for IVb, and NULL for V', () => {
        for (const s of BCN_20A_SUBZONES) {
            const z = zone(s.clau)!;
            if (s.clau === '20a/8') {
                // Art. 342.5 is a construction — a scalar would be one street's answer.
                expect(z.maxHeight_m).toBeNull();
                expect(z.maxFloors).toBeNull();
                expect(z.plotRatioFAR).toBeNull();
            } else if (s.clau === '20a/9b') {
                expect(z.maxHeight_m).toBe(15.25);
                expect(z.maxFloors).toBe(5); // PB + 4 pisos ⇒ 5 levels
            } else {
                expect(z.maxHeight_m, s.clau).toBe(9.15);
                expect(z.maxFloors, s.clau).toBe(3); // PB + 2 pisos ⇒ 3 levels
            }
        }
    });

    it('subzona VI ships NO scalar FAR — Art. 340.2 makes it a parcel-area construction', () => {
        expect(zone('20a/9u')!.plotRatioFAR).toBeNull();
        // …while every unconditional subzone DOES carry its Art. 340.1 figure.
        expect(zone('20a/10')!.plotRatioFAR).toBe(0.75);
        expect(zone('20a/12')!.plotRatioFAR).toBe(0.25);
        expect(zone('20a/9')!.plotRatioFAR).toBe(1.0);
    });

    it('cites the right ARTICLE per family, and names the Barcelona-exclusive instrument', () => {
        const pluri = zone('20a/7')!.ordinanceRef!;
        expect(pluri).toMatch(/Art\. 342\.7/);
        expect(pluri).toMatch(/Art\. 342\.2/);
        expect(pluri).not.toMatch(/Art\. 343/);

        const uni = zone('20a/11')!.ordinanceRef!;
        expect(uni).toMatch(/Art\. 343\.3/);
        expect(uni).toMatch(/Art\. 343\.1/);
        expect(uni).not.toMatch(/Art\. 342\./);

        for (const s of BCN_20A_SUBZONES) {
            const ref = zone(s.clau)!.ordinanceRef!;
            // The Barcelona override must be named on EVERY value — this is the failure mode the
            // brief called the worst this system has: encoding another municipality's rule.
            expect(ref, s.clau).toMatch(/DOGC núm\. 4277/);
            expect(ref, s.clau).toMatch(/exclusivament/);
            // …and the re-edition caveat must travel with it. Nothing here is certified.
            expect(ref, s.clau).toMatch(/RE-EDITION/);
            // …as must the terrain gap.
            expect(ref, s.clau).toMatch(/Art\. 255/);
        }
    });

    it('never claims `certified` confidence', () => {
        expect(ES_BARCELONA_20A_AILLADA_PACK.defaultConfidence).toBe('estimated-ruleset');
    });

    it('marks every value `ordinance-pdf`, never `published-structured`', () => {
        for (const z of ES_BARCELONA_20A_AILLADA_PACK.zones) {
            for (const [k, v] of Object.entries(z.fieldProvenance)) {
                expect(v, `${z.code}.${k}`).toBe('ordinance-pdf');
            }
            // A null field must NOT carry a provenance flag — that would badge an absent value.
            if (z.maxHeight_m === null) expect(z.fieldProvenance['maxHeight']).toBeUndefined();
            if (z.plotRatioFAR === null) expect(z.fieldProvenance['maxFAR']).toBeUndefined();
        }
    });
});

describe('L-591 — the height dispatcher only claims a WIDTH construction where there is one', () => {
    it('routes 20a/8 to Art. 342.5', () => {
        const z = resolveBcnAlcadaForZone('20a/8', 12.5, { trustedOfficialWidth: true });
        expect(z).not.toBeNull();
        expect(z!.article).toMatch(/Art\. 342\.5/);
        expect(z!.resolution.ok && z!.resolution.height_m).toBe(13.65);
    });

    it('returns null for the other nine 20a claus — their height is a zone SCALAR, not a construction', () => {
        for (const clau of ['20a/6', '20a/5', '20a/7', '20a/9', '20a/9b', '20a/9u', '20a/10', '20a/11', '20a/12']) {
            expect(resolveBcnAlcadaForZone(clau, 18, { trustedOfficialWidth: true }), clau).toBeNull();
        }
        // …and the scalar is in the pack, so nothing is lost by that null.
        expect(zone('20a/10')!.maxHeight_m).toBe(9.15);
    });

    it('never hands a 20a clau the 13a or 13b table', () => {
        const z = resolveBcnAlcadaForZone('20a/8', 25, { trustedOfficialWidth: true });
        // Art. 327 would give 20,75 m / PB+5 at 25 m; Art. 342.5 tops out at 16,70 m / PB+4.
        expect(z!.resolution.ok && z!.resolution.height_m).toBe(16.7);
        expect(z!.ordinanceRef).not.toMatch(/Art\. 327/);
        expect(z!.ordinanceRef).not.toMatch(/Art\. 328/);
    });
});

describe('L-591 — the parcel-conditional overrides (Barcelona Arts. 343.1/343.2/343.3)', () => {
    it('subzona VI under 400 m² drops to 7 m / PB+1 with a 2 m lateral separation', () => {
        const o = resolve20aParcelOverrides('20a/9u', 320);
        expect(o.maxHeight_m).toBe(7);
        expect(o.floorsAboveGround).toBe(1);
        expect(o.side_m).toBe(2);
        expect(o.article).toMatch(/343\.2/);
        // The exception cases we cannot check must be surfaced, never assumed satisfied.
        expect(o.unverifiedConditions.length).toBeGreaterThan(0);
    });

    it('subzones VII/VIII from 250 m² get the 125 m² / PB+1 / 7 m regime', () => {
        for (const clau of ['20a/10', '20a/11']) {
            const o = resolve20aParcelOverrides(clau, 300);
            expect(o.maxBuiltArea_m2, clau).toBe(125);
            expect(o.maxHeight_m, clau).toBe(7);
            expect(o.article, clau).toMatch(/343\.1/);
        }
    });

    it('a conforming parcel gets NO override, and an unknown clau or missing area gets none either', () => {
        expect(resolve20aParcelOverrides('20a/9u', 500).article).toBeNull();
        expect(resolve20aParcelOverrides('20a/9u', null).article).toBeNull();
        expect(resolve20aParcelOverrides('13a', 300).article).toBeNull();
        // Below every stated floor, there is no override either — the parcel is simply not
        // buildable in isolation, which the edificabilitat resolver reports.
        expect(resolve20aParcelOverrides('20a/9u', 120).article).toBeNull();
        expect(resolve20aParcelOverrides('20a/10', 200).article).toBeNull();
    });
});

describe('L-591 — recorded-but-not-applied facts', () => {
    it('keeps Barcelona\'s 80 m² dwelling module (base PGM says 100 m²) out of the envelope fields', () => {
        expect(BCN_20A_ART342_DWELLING_MODULE_M2).toBe(80);
        // It is a PROGRAMME cap. Nothing in the pack may encode it as an envelope number.
        for (const z of ES_BARCELONA_20A_AILLADA_PACK.zones) {
            expect(z.maxCoverage).not.toBe(80);
            expect(z.plotRatioFAR).not.toBe(80);
        }
    });
});
