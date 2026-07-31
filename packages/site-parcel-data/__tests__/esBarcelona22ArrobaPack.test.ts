// Barcelona clau `22@` (*zona d'activitats 22@*) — MPGM 22@BCN, Art. 8.
//
// WHAT THESE TESTS GUARD
// ----------------------
// 1. **The four-table collision.** Barcelona now has FOUR street-width height ladders — Art. 327
//    (13a), Art. 328 (13b), Art. 350.2.c (22a) and Art. 8.1.b (22@). They share band edges (8, 11,
//    20) and agree on NOT ONE height. Copying a row between them is the L-526 failure class, and
//    is the single most likely wrong edit to this pack.
// 2. **The 2,2 granularity flip.** Art. 8.1's 2,2 is *per parcel·la*; Art. 16.4.a's identical 2,2
//    is *"aplicats sobre la superfície de l'illa"*. Same digits, different denominator — C58
//    §1.11.2 says that is a category error, not an imprecision.
// 3. **The three 70 % figures.** Art. 8.1.f (70 % of the PARCEL), PGM Art. 350.2.b (70 % of the
//    BLOCK above the ground floor) and PGM Art. 350.1.2n (70 % of the parcel for *aïllada*
//    sectors). 22@ is subject to all three articles at once via Art. 5's supletory clause.
// 4. **Someone registering this pack.** It is authored and correct in every scalar and it is
//    deliberately absent from `registry.ts`: Art. 8 states no *profunditat edificable*, so
//    `geometricRule` is `null`, and a null rule with null setbacks yields the WHOLE parcel next to
//    the 70 % occupation cap the same card publishes.

import { describe, it, expect } from 'vitest';
import { JurisdictionZoningContractSchema } from '@pryzm/schemas';
import {
    ES_BARCELONA_22ARROBA_PACK,
    BCN_22ARROBA_ZONE_CODES,
    BCN_22ARROBA_ORDINANCE_REF,
    BCN_ALCADA_22ARROBA_TABLE,
    BCN_22ARROBA_EDGE_CONVENTION,
    BCN_22ARROBA_ART8_LIMITS,
    BCN_22ARROBA_TRANSFORMATION_COEFFICIENTS,
    BCN_22ARROBA_ENVELOPE_BLOCKER,
    BCN_22ARROBA_OPEN_QUESTIONS,
    resolveAlcada22Arroba,
} from '../src/rulepacks/esBarcelona22Arroba.js';
import { BCN_ALCADA_REGULADORA_TABLE } from '../src/rulepacks/bcnAlcadaReguladora.js';
import { BCN_ALCADA_SEMIINTENSIVA_TABLE } from '../src/rulepacks/bcnAlcadaSemiintensiva.js';
import { BCN_ALCADA_INDUSTRIAL_TABLE } from '../src/rulepacks/bcnAlcadaIndustrial.js';
import { BCN_INDUSTRIAL_ZONE_CODES } from '../src/rulepacks/esBarcelonaIndustrial.js';
import { resolveZoneDisposition, BCN_JURISDICTION_ID } from '../src/rulepacks/registry.js';

const zone = ES_BARCELONA_22ARROBA_PACK.zones[0]!;

describe('clau 22@ — the pack itself', () => {
    it('validates against the contract schema', () => {
        expect(() => JurisdictionZoningContractSchema.parse(ES_BARCELONA_22ARROBA_PACK)).not.toThrow();
    });

    it('answers for `22@` and for nothing else — never for `22a`', () => {
        expect([...BCN_22ARROBA_ZONE_CODES]).toEqual(['22@']);
        expect(zone.code).toBe('22@');
        // 22a is PGM Art. 350; citing it for 22@ land (or vice versa) is L-526 one clau over.
        expect([...BCN_INDUSTRIAL_ZONE_CODES]).not.toContain('22@');
        expect([...BCN_22ARROBA_ZONE_CODES] as string[]).not.toContain('22a');
    });

    it('cites the MPGM 22@ and its 2006 re-approval — NOT the PGM article that governs 22a', () => {
        expect(zone.ordinanceRef).toBe(BCN_22ARROBA_ORDINANCE_REF);
        expect(BCN_22ARROBA_ORDINANCE_REF).toContain('22@BCN');
        expect(BCN_22ARROBA_ORDINANCE_REF).toContain('1 de març de 2006');
        expect(BCN_22ARROBA_ORDINANCE_REF).toContain('DOGC núm. 4654');
        // The superseded instrument is named too, so the supersession stays auditable.
        expect(BCN_22ARROBA_ORDINANCE_REF).toContain('DOGC núm. 3239');
        expect(BCN_22ARROBA_ORDINANCE_REF).toContain('Art. 8.1');
    });

    it('is never `certified` — the source is a re-typeset re-edition read from a raster', () => {
        expect(ES_BARCELONA_22ARROBA_PACK.defaultConfidence).toBe('estimated-ruleset');
    });
});

describe('clau 22@ — Art. 8.1 scalars, and the traps around them', () => {
    it('FAR is 2,2 m²st/m²s, stated PER PARCEL and reachable by direct licence (Art. 8.1)', () => {
        expect(zone.plotRatioFAR).toBe(2.2);
        expect(BCN_22ARROBA_ART8_LIMITS.plotRatioFAR).toBe(2.2);
        expect(BCN_22ARROBA_ART8_LIMITS.plotRatioFARGranularity).toBe('parcel');
    });

    it('⚠ Art. 16.4.a states the SAME 2,2 over the ILLA — the granularity must stay separated', () => {
        expect(BCN_22ARROBA_TRANSFORMATION_COEFFICIENTS.net).toBe(2.2);
        expect(BCN_22ARROBA_TRANSFORMATION_COEFFICIENTS.granularity).toBe('block');
        // Same number, different denominator. If these two ever merge into one constant the
        // distinction dies silently, so they are asserted as separate objects on purpose.
        expect(BCN_22ARROBA_ART8_LIMITS.plotRatioFARGranularity).not.toBe(
            BCN_22ARROBA_TRANSFORMATION_COEFFICIENTS.granularity,
        );
    });

    it('the transformation ceiling is 3,0 in general and 3,2 in the six delimited ámbitos', () => {
        const t = BCN_22ARROBA_TRANSFORMATION_COEFFICIENTS;
        // Prescription (b) of the 27-07-2000 approval: 2,0 + 0,2 + 0,5 + 0,3 = 3,0.
        expect(t.net + t.complementaryAtActivities + t.complementaryMunicipalProtectedHousing)
            .toBeCloseTo(t.generalCeiling, 10);
        // Prescription (c): + 0,20 in the six delimited ámbitos.
        expect(t.generalCeiling + t.delimitedAmbitIncrement).toBeCloseTo(t.delimitedAmbitCeiling, 10);
        expect(t.delimitedAmbits).toHaveLength(6);
        expect(t.delimitedAmbits).toContain('Perú-Pere IV');
    });

    it('the dwelling module is 90 m² of HOUSING floor area — not a hab/ha density', () => {
        // Art. 16.4.d. Recorded so it is never rendered as a site-area density like Art. 323's
        // 350/250 hab/ha (clau 13a/13b) or Art. 363's 75 hab/ha (clau 16).
        expect(BCN_22ARROBA_TRANSFORMATION_COEFFICIENTS.dwellingModule_m2).toBe(90);
    });

    it('occupation is 70 % of the PARCEL (Art. 8.1.f), and says what it is not', () => {
        expect(zone.maxCoverage).toBe(0.7);
        expect(BCN_22ARROBA_ART8_LIMITS.maxCoverage).toBe(0.7);
        expect(BCN_22ARROBA_ART8_LIMITS.maxCoverageArticle).toBe('8.1.f');
        expect(BCN_22ARROBA_ART8_LIMITS.maxCoverageNotToBeConfusedWith).toContain('350.2.b');
        expect(BCN_22ARROBA_ART8_LIMITS.maxCoverageNotToBeConfusedWith).toContain('BLOCK');
    });

    it('minimum parcel is 500 m² (Art. 8.1.e) — not 300 m², which is clau 22a (Art. 350.2.d)', () => {
        expect(BCN_22ARROBA_ART8_LIMITS.minParcel_m2).toBe(500);
    });

    it('setbacks are NULL, not zero — this is an alignment zone (Art. 8.1.a, C58 §1.7a)', () => {
        expect(zone.setbacks).toEqual({ front_m: null, side_m: null, rear_m: null });
    });

    it('height is NOT a zone scalar — Art. 8.1.b is keyed to the amplada de vial', () => {
        expect(zone.maxHeight_m).toBeNull();
        expect(zone.maxFloors).toBeNull();
    });

    it('permits `industrial` only — Art. 6.2 gates the other uses behind a derived plan', () => {
        expect(zone.permittedUse).toEqual(['industrial']);
    });

    it('records Art. 8.1.c/.d — altells + enclosed projections COUNT, subsoil is fully occupiable', () => {
        expect(BCN_22ARROBA_ART8_LIMITS.altellsAndEnclosedProjectionsCountTowardFAR).toBe(true);
        expect(BCN_22ARROBA_ART8_LIMITS.subsoilFullyOccupiable).toBe(true);
    });
});

describe('clau 22@ — Art. 8.1.b height table', () => {
    it('has exactly four bands, edges at 8 / 11 / 20, top band open-ended', () => {
        expect(BCN_ALCADA_22ARROBA_TABLE).toHaveLength(4);
        expect(BCN_ALCADA_22ARROBA_TABLE.map((b) => b.minWidth_m)).toEqual([0, 8, 11, 20]);
        expect(BCN_ALCADA_22ARROBA_TABLE[3]!.maxWidth_m).toBe(Infinity);
    });

    it('transcribes the article: 9,60 / 14,40 / 19,20 / 24,00 at PB+1 / +2 / +3 / +4', () => {
        expect(BCN_ALCADA_22ARROBA_TABLE.map((b) => b.height_m)).toEqual([9.6, 14.4, 19.2, 24]);
        // *"planta baixa i N pisos"* ⇒ N storeys ABOVE the ground floor. PB+4 is 4, never 5.
        expect(BCN_ALCADA_22ARROBA_TABLE.map((b) => b.floorsAboveGround)).toEqual([1, 2, 3, 4]);
    });

    it('the band edges are STATED by the article, not a convention we supplied', () => {
        expect(BCN_22ARROBA_EDGE_CONVENTION.statedByOrdinance).toBe(true);
        expect(BCN_22ARROBA_EDGE_CONVENTION.lowerInclusive).toBe(true);
    });

    it('⚠ agrees with NONE of the other three Barcelona ladders on any height', () => {
        const mine = new Set(BCN_ALCADA_22ARROBA_TABLE.map((b) => b.height_m));
        const others = [
            ...BCN_ALCADA_REGULADORA_TABLE, // Art. 327 — clau 13a
            ...BCN_ALCADA_SEMIINTENSIVA_TABLE, // Art. 328 — clau 13b
            ...BCN_ALCADA_INDUSTRIAL_TABLE, // Art. 350.2.c — clau 22a
        ].map((b) => b.height_m);
        for (const h of others) expect(mine.has(h)).toBe(false);
    });

    it('⚠ shares band EDGES with the other ladders — which is exactly why copying a row is easy', () => {
        // 8 and 11 are 13b's and 22a's edges; 20 is 13a's. The overlap is real and is the reason
        // the height assertion above exists.
        const edges = BCN_ALCADA_22ARROBA_TABLE.map((b) => b.minWidth_m);
        expect(edges).toContain(8);
        expect(edges).toContain(11);
        expect(edges).toContain(20);
    });
});

describe('clau 22@ — resolveAlcada22Arroba', () => {
    const direct = { regime: 'art8-direct', trustedOfficialWidth: true } as const;

    it('refuses on the DEFAULT regime — "we did not look" never hardens into "there is none"', () => {
        const r = resolveAlcada22Arroba(15);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('pla-parcial-unknown');
    });

    it('refuses when an Art. 9 front edificatori governs — its height comes from PGM Art. 327', () => {
        const r = resolveAlcada22Arroba(15, { regime: 'front-edificatori', trustedOfficialWidth: true });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('pla-parcial-governs');
    });

    it('refuses inside an actuació de transformació — Art. 8.3 hands it to a Pla de Millora Urbana', () => {
        const r = resolveAlcada22Arroba(15, { regime: 'transformacio', trustedOfficialWidth: true });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('pla-parcial-governs');
    });

    it('checks the regime BEFORE the width — a bad width under an unknown regime reports the regime', () => {
        const r = resolveAlcada22Arroba(Number.NaN);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('pla-parcial-unknown');
    });

    it('resolves each band on an official width', () => {
        const cases: ReadonlyArray<readonly [number, number, number]> = [
            [4, 9.6, 1],
            [7.99, 9.6, 1],
            [8, 14.4, 2], // *"de 8 i menys d’11"* — 8,00 is in the SECOND band, stated.
            [10.99, 14.4, 2],
            [11, 19.2, 3], // *"d’11 m i menys de 20 m"* — 11,00 is in the THIRD band, stated.
            [19.99, 19.2, 3],
            [20, 24, 4], // *"de 20 m d’amplada o superior"* — 20,00 is in the TOP band, stated.
            [60, 24, 4],
        ];
        for (const [w, h, f] of cases) {
            const r = resolveAlcada22Arroba(w, direct);
            expect(r.ok).toBe(true);
            if (r.ok) {
                expect(r.height_m).toBe(h);
                expect(r.floorsAboveGround).toBe(f);
            }
        }
    });

    it('refuses a MEASURED width sitting on a band edge — the answer moves 4,80 m there', () => {
        const r = resolveAlcada22Arroba(11.1, { regime: 'art8-direct' });
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.reason).toBe('band-edge');
            expect(r.straddles).toEqual([14.4, 19.2]);
        }
    });

    it('does NOT fire the band-edge guard INSIDE the open-ended top band', () => {
        // ⚠ 20 m IS an edge, so 20,2 legitimately straddles it — asserted separately below. What
        // must NEVER happen is a guard firing at 21 m or 60 m, where the only edge that could
        // trigger it is one the ordinance does not state. *"De 20 m d’amplada o superior"* has no
        // upper bound; inventing one would invent a fifth band by the back door.
        for (const w of [21, 30, 60, 120]) {
            const r = resolveAlcada22Arroba(w, { regime: 'art8-direct' });
            expect(r.ok).toBe(true);
            if (r.ok) expect(r.height_m).toBe(24);
        }
        // …and the 20 m edge itself IS guarded, because it is a real, stated edge.
        const onEdge = resolveAlcada22Arroba(20.2, { regime: 'art8-direct' });
        expect(onEdge.ok).toBe(false);
        if (!onEdge.ok) expect(onEdge.reason).toBe('band-edge');
    });

    it('never offers a cornice increment — that allowance is the Eixample ordinance, clau 13a', () => {
        const r = resolveAlcada22Arroba(25, direct);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.corniceIncrementMax_m).toBeNull();
    });

    it('rejects unusable widths rather than guessing', () => {
        for (const w of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
            const r = resolveAlcada22Arroba(w, direct);
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.reason).toBe('bad-input');
        }
    });
});

describe('clau 22@ — the pack is NOT registered, and the reason is recorded', () => {
    it('carries no geometricRule — Art. 8 states no profunditat edificable', () => {
        expect(zone.geometricRule).toBeNull();
        expect(BCN_22ARROBA_ENVELOPE_BLOCKER.registered).toBe(false);
        expect(BCN_22ARROBA_ENVELOPE_BLOCKER.missingRuleKind).not.toBeNull();
        expect(BCN_22ARROBA_ENVELOPE_BLOCKER.reasons.length).toBeGreaterThanOrEqual(4);
    });

    it('⚠ the registry must NOT map `22@` to this pack while geometricRule is null', () => {
        // A null rule means "legacy per-edge inset from `setbacks`", and this zone's setbacks are
        // correctly null — so the solver would erode nothing and return the WHOLE parcel, on a
        // card printing 70 % occupation from Art. 8.1.f. Registering is a two-step change: the
        // rule KIND question first, then the registry.
        const d = resolveZoneDisposition(BCN_JURISDICTION_ID, '22@');
        expect(d.kind).not.toBe('pack');
    });

    it('leaves the three unresolved questions unresolved, in writing', () => {
        expect(BCN_22ARROBA_OPEN_QUESTIONS.art350_2bSupletory).toContain('UNRESOLVED');
        expect(BCN_22ARROBA_OPEN_QUESTIONS.planol3Fronts).toContain('UNRESOLVED');
        expect(BCN_22ARROBA_OPEN_QUESTIONS.planol2Ambits).toContain('UNRESOLVED');
        expect(BCN_22ARROBA_OPEN_QUESTIONS.post2006Amendments).toContain('NOT CHECKED');
    });
});
