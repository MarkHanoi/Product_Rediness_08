// §MADRID-CLOSURE-INVARIANTS (L-676) — the assertions `docs/.../28079-madrid/CLOSURE-REGISTER.md`
// rests on, pinned in code so the register cannot go stale the way `NEXT.md`, `RATE.md`,
// `ENVELOPE.md`, `README.md` and `LEGISLATION-RATE.md` all did.
//
// WHY THIS FILE EXISTS, AND WHY IT IS NOT A DUPLICATE OF `madridPgoum97Wiring.test.ts`
// ------------------------------------------------------------------------------------
// That file asks *"is the transcribed ordinance REACHABLE?"*. This one asks a different and, on the
// evidence, more neglected question: ***are the claims our own documents make about Madrid still
// true?*** On 2026-08-01 five Madrid documents simultaneously asserted `packsByZone` was EMPTY —
// twelve days after 23 zones were registered — and reported the ENVELOPE axis as a *measured* 0 %
// on that basis. Nothing failed, because nothing was checking.
//
// ⚠ The most valuable assertion here is §VOCABULARY-CENSUS: our three routing families must
// partition EXACTLY the 34 `AMB_TX_ETIQ` codes the municipal layer publishes — measured live
// (unfiltered `returnCountOnly` = 34; `groupBy` = 34 groups × n=1), recorded in
// `docs/.../extracted/nz-land-share-and-coefz-probe.json`. If Madrid publishes a 35th code, or if
// someone moves a code between families, a Madrid parcel silently changes which law it is judged
// by. That is not caught anywhere else.
//
// PURE. No I/O, no network — the live census is a RECORDED CONSTANT below with its provenance, not
// a fetch. (A test that hits sigma.madrid.es would fail on a municipal outage, which is a statement
// about their uptime, not about our correctness.)

import { describe, expect, it } from 'vitest';
import {
    MADRID_NZ1_ZONE_CODES,
    MADRID_NZ1_CODE_PREFIX,
    ES_MADRID_NZ1_PACK,
    MADRID_NZ1_RULE,
} from '../src/rulepacks/esMadridNZ1.js';
import {
    MADRID_PGOUM97_ZONE_CODES,
    MADRID_NZ3_ZONE_CODES,
    MADRID_ENVELOPE_VERIFIED,
} from '../src/rulepacks/esMadridPgoum97.js';

/**
 * §VOCABULARY-CENSUS — the live `AMB_TX_ETIQ` inventory, MEASURED 2026-08-01.
 *
 * Source: `sigma.madrid.es/hosted/rest/services/DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/
 * MapServer/0/query`, `where=1=1`, `groupByFieldsForStatistics=AMB_TX_ETIQ,AMB_TX_DENOM`.
 * Cross-checked EXHAUSTIVE: unfiltered `returnCountOnly` returned `{"count":34}` and the groupBy
 * returned 34 groups with `n = 1` each ⇒ one multipart feature per code, no pagination artefact.
 *
 * ⚠ This is a RECORDED response, not an assumption. Raw data + method:
 * `docs/04-reference/jurisdictions/es/es-md/28079-madrid/extracted/nz-land-share-and-coefz-probe.json`
 * and `findings/L-676-MADRID-LAND-SHARE-AND-COEFZ-MEASURED.md`.
 */
const MADRID_LIVE_ZONE_CODES_2026_08_01 = [
    '1.1', '1.2', '1.3', '1.4', '1.5', '1.6',
    '3.1', '3.1.a', '3.1.b', '3.1.c', '3.2',
    '4',
    '5.1', '5.2', '5.3',
    '7.1.a', '7.1.b', '7.2.e',
    '8.1.a', '8.1.c', '8.2.a', '8.2.b', '8.2.c', '8.3.a', '8.3.c', '8.4', '8.5', '8.6',
    '9.1', '9.2', '9.3', '9.4.a', '9.4.b', '9.5',
] as const;

/**
 * §LAND-SHARE — measured `sum(SHAPE.STArea())` per Norma-Zonal family, in m², 2026-08-01.
 *
 * ⚠⚠ DENOMINATOR: **land the PGOUM-97 zoning layer assigns a Norma Zonal to.** NOT the municipal
 * area (≈604 km²) and NOT the L-656 private-buildable denominator, which Madrid does not have.
 * Every ENVELOPE figure derived from these is therefore an UPPER BOUND (CLOSURE-REGISTER row 9).
 */
const MADRID_NZ_FAMILY_AREA_M2 = {
    '3': 90_431_315, // Volumetría Específica — a legally-grounded refusal, Art. 8.3.1
    '1': 17_493_655, // Protección del Patrimonio Histórico — explicit-area, renders today
    '8': 14_388_685,
    '4': 13_203_046,
    '9': 10_351_077,
    '7': 2_176_513,
    '5': 1_532_879,
} as const;
const MADRID_NZ_TOTAL_AREA_M2 = 149_577_170;

describe('§VOCABULARY-CENSUS — our three routing families partition the live 34 codes exactly', () => {
    const routed = [
        ...MADRID_NZ1_ZONE_CODES,
        ...MADRID_NZ3_ZONE_CODES,
        ...MADRID_PGOUM97_ZONE_CODES,
    ];

    it('routes 6 + 5 + 23 = 34 codes, with no duplicate between families', () => {
        expect(MADRID_NZ1_ZONE_CODES).toHaveLength(6);
        expect(MADRID_NZ3_ZONE_CODES).toHaveLength(5);
        expect(MADRID_PGOUM97_ZONE_CODES).toHaveLength(23);
        expect(routed).toHaveLength(34);
        expect(new Set(routed).size).toBe(34);
    });

    it('covers EXACTLY the live inventory — no code un-routed, no code invented', () => {
        expect([...routed].sort()).toEqual([...MADRID_LIVE_ZONE_CODES_2026_08_01].sort());
    });

    it('assigns every live code to the family its prefix implies', () => {
        // ⚠ The three families answer under three DIFFERENT legal theories (published geometry /
        // exhausted aprovechamiento / transcribed parameters). A code in the wrong bucket is a
        // parcel judged under the wrong law, and it would still route "successfully".
        for (const c of MADRID_NZ1_ZONE_CODES) expect(c.startsWith('1.')).toBe(true);
        for (const c of MADRID_NZ3_ZONE_CODES) expect(c.startsWith('3')).toBe(true);
        for (const c of MADRID_PGOUM97_ZONE_CODES) {
            expect(c.startsWith('1')).toBe(false);
            expect(c.startsWith('3')).toBe(false);
        }
    });

    it('⛔ NZ 2 / 6 / 10 / 11 are absent — and the read that establishes it was EXHAUSTIVE', () => {
        // L-676 / VERIFICATION V13: `returnCountOnly` = 34 == 34 groups ⇒ this is a census, so the
        // absence is a MEASURED-EMPTY, not a filtering artefact. ⇒ those names govern 0 m² and no
        // parcel can route to them (`SOURCES.md` §0.3 candidate (c) eliminated).
        for (const missing of ['2', '6', '10', '11']) {
            expect(
                MADRID_LIVE_ZONE_CODES_2026_08_01.some((c) => c === missing || c.startsWith(`${missing}.`)),
            ).toBe(false);
        }
    });
});

describe('§NZ1-CODES — the placeholder is gone and stays gone (NEXT.md §4.2(c))', () => {
    it('ships the six VERIFIED grados, never the `NZ1` placeholder', () => {
        expect([...MADRID_NZ1_ZONE_CODES]).toEqual(['1.1', '1.2', '1.3', '1.4', '1.5', '1.6']);
        expect([...MADRID_NZ1_ZONE_CODES]).not.toContain('NZ1');
    });

    it('the registry/dispatcher prefix is derivable from the codes, not a restated literal', () => {
        // Both `registry.ts` and `siteDispatch.ts` route on MADRID_NZ1_CODE_PREFIX. If it ever
        // drifted from the codes, `1.*` parcels would fall to the coverage-gap card instead of
        // NZ 1's settled explicit-area answer.
        expect(MADRID_NZ1_CODE_PREFIX).toBe('1.');
        for (const c of MADRID_NZ1_ZONE_CODES) expect(c.startsWith(MADRID_NZ1_CODE_PREFIX)).toBe(true);
    });

    it('every grado carries the SAME explicit-area rule — the geometry IS the rule', () => {
        expect(ES_MADRID_NZ1_PACK.zones).toHaveLength(6);
        for (const z of ES_MADRID_NZ1_PACK.zones) expect(z.geometricRule).toEqual(MADRID_NZ1_RULE);
    });
});

describe('§COEF-Z-QUARANTINE — no Madrid pack may publish a FAR (L-616 / CLOSURE-REGISTER row 2)', () => {
    it('NZ 1 states plotRatioFAR = null on every grado — COEF_Z is NOT an edificabilidad', () => {
        // MEASURED (L-676): 15,907 layer-6 polygons, 57 distinct COEF_Z values, 100 % integers in
        // 0–8, and 47.56 % COMPOUND ("0 / 5", "0 / 6 / 7"). A polygon cannot hold three plot ratios.
        // `parseFloat("0 / 5") === 0` would publish a ZERO-buildability envelope on ~48 % of them;
        // `parseFloat("8")` would publish FAR 8.0 on the numeric ~45 %. Neither may ever happen.
        for (const z of ES_MADRID_NZ1_PACK.zones) {
            expect(z.plotRatioFAR).toBeNull();
            expect(z.maxHeight_m).toBeNull();
            expect(z.maxFloors).toBeNull();
            expect(z.maxCoverage).toBeNull();
        }
    });

    it('NZ 1 asserts NO setback triple — an explicit-area zone states none', () => {
        // Publishing a front/side/rear estimate here is the wrong geometric SHAPE, which is the
        // §CONTEXT-DATA-HONESTY failure the whole explicit-area path exists to avoid.
        for (const z of ES_MADRID_NZ1_PACK.zones) {
            expect(z.setbacks).toEqual({ front_m: null, side_m: null, rear_m: null });
        }
    });
});

describe('§CLOSURE-ARITHMETIC — the numbers CLOSURE-REGISTER.md publishes are reproducible', () => {
    const share = (fam: keyof typeof MADRID_NZ_FAMILY_AREA_M2) =>
        MADRID_NZ_FAMILY_AREA_M2[fam] / MADRID_NZ_TOTAL_AREA_M2;

    it('the seven family areas sum to the measured total (no code lost in aggregation)', () => {
        const sum = Object.values(MADRID_NZ_FAMILY_AREA_M2).reduce((a, b) => a + b, 0);
        expect(Math.abs(sum - MADRID_NZ_TOTAL_AREA_M2)).toBeLessThanOrEqual(2);
    });

    it('NZ 3 — a cited DELEGATION — is 60.46 % of Madrid, the single largest fact in the dossier', () => {
        expect(share('3')).toBeCloseTo(0.60458, 4);
    });

    it('TERMINAL today = NZ 3 delegation + NZ 1 envelope = 72.15 %', () => {
        expect(share('3') + share('1')).toBeCloseTo(0.72153, 4);
    });

    it('the 23 packed zones — PENDING one signature — are 27.85 %', () => {
        const packed = (['8', '4', '9', '7', '5'] as const).reduce((a, f) => a + share(f), 0);
        expect(packed).toBeCloseTo(0.27847, 4);
    });

    it('⚠ the ENVELOPE axis today is ≈4.7 %, NOT the 0 % five documents reported', () => {
        // Σ(share × tier weight), C63 §3.2 / L-664: NZ 1 renders at `estimated-ruleset` (0.4);
        // NZ 3's cited delegation and the gated packs both weigh 0.0 (register row 6 — the ladder
        // has no tier for a legally-grounded delegation, so 60.46 % of correct answers score zero).
        const today = share('1') * 0.4;
        expect(today).toBeCloseTo(0.0468, 4);
        expect(today).toBeGreaterThan(0); // the load-bearing assertion: it is NOT zero.
    });

    it('the ENVELOPE arithmetic MAXIMUM is ≈36.8 %, and ~96 % of the gap is LAW', () => {
        const packed = (['8', '4', '9', '7', '5'] as const).reduce((a, f) => a + share(f), 0);
        const max = share('1') * 1.0 + packed * 0.9; // authoritative + structured, the best tiers
        expect(max).toBeCloseTo(0.36757, 4);
        // Of the ~63.2 points ENVELOPE can never reach, NZ 3's 60.46 is law — not effort.
        expect(share('3') / (1 - max)).toBeGreaterThan(0.95);
    });
});

describe('§THE-GATE — nothing in this file may be read as an authorisation', () => {
    it('MADRID_ENVELOPE_VERIFIED is STILL false — no number ships for the 23 packed zones', () => {
        // L-449: signing a transcription is a HUMAN act. This suite measures and pins; it certifies
        // nothing. If this assertion ever needs changing, a human signed `sources/VERIFICATION.md`.
        expect(MADRID_ENVELOPE_VERIFIED).toBe(false);
    });
});
