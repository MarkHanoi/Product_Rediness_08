// ✍ SIG-2 (2026-08-01): expectations updated from the BASE metropolitan ladder to the
// BARCELONA values of the MPGM 02-03-2007 (DOGC 4893). See sources/VERIFICATION.md.
// L-590 — PGM Art. 350.2.c *alçada màxima* resolution for clau 22a, and the zone→article dispatch
// that keeps it apart from Arts. 327 and 328.
//
// The thing under test decides how TALL an industrial building may be, from a STEPPED table whose
// steps are 4 m apart. So the assertions target the failures that matter and are otherwise SILENT:
//   • picking the wrong STEP (a shifted table passes any spot-check);
//   • picking the wrong TABLE — handing a 22a parcel Art. 327's or Art. 328's ladder, which would
//     cite an article that does not govern it;
//   • **inventing a fourth band.** Every other Barcelona height table has a 15 m step; Art. 350.2.c
//     has three bands and an open-ended top, and pattern-matching to the neighbours is the single
//     most likely wrong edit to this table;
//   • answering at all for land whose Art. 350 regime is unknown.

import { describe, it, expect } from 'vitest';
import {
    resolveAlcadaIndustrial,
    BCN_ALCADA_INDUSTRIAL_TABLE,
    BCN_ART350_EDGE_CONVENTION,
    BCN_ART350_BLOCK_INTERIOR_HEIGHT_M,
} from '../src/rulepacks/bcnAlcadaIndustrial.js';
import {
    BCN_ALCADA_REGULADORA_TABLE,
    BAND_EDGE_GUARD_M,
} from '../src/rulepacks/bcnAlcadaReguladora.js';
import { BCN_ALCADA_SEMIINTENSIVA_TABLE } from '../src/rulepacks/bcnAlcadaSemiintensiva.js';
import { resolveBcnAlcadaForZone } from '../src/rulepacks/bcnAlcadaByZone.js';

/** Every call in this file that expects an ANSWER must declare the regime that grants one. */
const NO_PLA_PARCIAL = { planParcialRegime: 'none' } as const;

describe('L-590 §Art. 350.2.c — the clau 22a table', () => {
    it('covers the width axis with no gap and no overlap', () => {
        for (let i = 1; i < BCN_ALCADA_INDUSTRIAL_TABLE.length; i++) {
            expect(BCN_ALCADA_INDUSTRIAL_TABLE[i]!.minWidth_m).toBe(
                BCN_ALCADA_INDUSTRIAL_TABLE[i - 1]!.maxWidth_m,
            );
        }
        expect(BCN_ALCADA_INDUSTRIAL_TABLE[0]!.minWidth_m).toBe(0);
        expect(
            BCN_ALCADA_INDUSTRIAL_TABLE[BCN_ALCADA_INDUSTRIAL_TABLE.length - 1]!.maxWidth_m,
        ).toBe(Infinity);
    });

    it('is monotonic — a wider street never permits a lower building', () => {
        for (let i = 1; i < BCN_ALCADA_INDUSTRIAL_TABLE.length; i++) {
            expect(BCN_ALCADA_INDUSTRIAL_TABLE[i]!.height_m).toBeGreaterThan(
                BCN_ALCADA_INDUSTRIAL_TABLE[i - 1]!.height_m,
            );
            expect(BCN_ALCADA_INDUSTRIAL_TABLE[i]!.floorsAboveGround).toBeGreaterThan(
                BCN_ALCADA_INDUSTRIAL_TABLE[i - 1]!.floorsAboveGround,
            );
        }
    });

    it('⚠ HAS EXACTLY THREE BANDS WITH STEPS AT 8 AND 11 — no 15 m band, ever', () => {
        // THE ASSERTION THAT STOPS THE MOST LIKELY WRONG EDIT. Arts. 327 and 328 both step at 15 m;
        // Art. 350.2.c does not. Adding a fourth band by analogy would be a fabricated ordinance
        // rule published under a real citation (L-526).
        expect(BCN_ALCADA_INDUSTRIAL_TABLE).toHaveLength(3);
        expect(BCN_ALCADA_INDUSTRIAL_TABLE.map((b) => b.minWidth_m)).toEqual([0, 8, 11]);
        for (const b of BCN_ALCADA_INDUSTRIAL_TABLE) {
            expect(b.maxWidth_m, 'no band may end at 15 m').not.toBe(15);
        }
    });

    it('⚠ the heights are the ordinance’s round integers, on NO 3,05 m ladder', () => {
        // 9 / 13 / 17. The residential tables step by 3.05 m; "correcting" these to x,x5 values
        // would be pattern-matching a different article's typography onto this one's numbers.
        expect(BCN_ALCADA_INDUSTRIAL_TABLE.map((b) => b.height_m)).toEqual([9, 13, 17]);
        expect(BCN_ALCADA_INDUSTRIAL_TABLE.map((b) => b.floorsAboveGround)).toEqual([1, 2, 3]);
        for (const b of BCN_ALCADA_INDUSTRIAL_TABLE) {
            expect(Number.isInteger(b.height_m), `${b.height_m} must be an integer`).toBe(true);
        }
    });

    // Mid-band widths, one per row: verifies the VALUES, not just the shape.
    it.each([
        [6, 9, 1],
        [9.5, 13, 2],
        [14, 17, 3],
        [40, 17, 3],
        [200, 17, 3],
    ])('a %s m street ⇒ %s m (PB+%s)', (width, height, floors) => {
        const r = resolveAlcadaIndustrial(width, NO_PLA_PARCIAL);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.height_m).toBe(height);
            expect(r.floorsAboveGround).toBe(floors);
        }
    });

    it('⚠ IS NEITHER THE Art. 327 NOR THE Art. 328 TABLE (⚠ SIG-2: 9,00 m is now SHARED with 13a PB+1 — the ladders OVERLAP at one value; the guard is the ARTICLE, not the number)', () => {
        expect(BCN_ALCADA_INDUSTRIAL_TABLE).toHaveLength(3);
        expect(BCN_ALCADA_REGULADORA_TABLE).toHaveLength(6);
        expect(BCN_ALCADA_SEMIINTENSIVA_TABLE).toHaveLength(4);
        const others = new Set([
            ...BCN_ALCADA_REGULADORA_TABLE.map((b) => b.height_m),
            ...BCN_ALCADA_SEMIINTENSIVA_TABLE.map((b) => b.height_m),
        ]);
        // ⚠ SIG-2 (2026-08-01) BROKE THE DISJOINTNESS, and that is a real fact about the law, not a
        // test to relax away. Barcelona's MPGM-2007 Art. 327.2a table opens at 9,00 m (PB+1) — the
        // SAME figure as Art. 350.2.c's first industrial band. So a bare "9 m" no longer identifies
        // which article produced it. THE GUARD IS THE ARTICLE, NEVER THE NUMBER: any code that
        // infers a zone from a height is wrong, and this test now pins exactly that.
        const overlap = BCN_ALCADA_INDUSTRIAL_TABLE.filter((b) => others.has(b.height_m)).map(
            (b) => b.height_m,
        );
        expect(overlap, 'the ONLY permitted overlap is 9,00 m (13a PB+1 after SIG-2)').toEqual([9]);
        // The tables remain structurally distinct even where one value coincides.
        expect(BCN_ALCADA_INDUSTRIAL_TABLE.map((b) => b.height_m)).not.toEqual(
            BCN_ALCADA_REGULADORA_TABLE.slice(0, 3).map((b) => b.height_m),
        );
    });

    it('carries NO Eixample cornice increment — Art. 21 governs the Eixample, not industrial land', () => {
        const r = resolveAlcadaIndustrial(9.5, NO_PLA_PARCIAL);
        expect(r.ok && r.corniceIncrementMax_m).toBeNull();
    });

    it('records the Art. 350.2.e block-interior height as a SEPARATE figure, not a band', () => {
        // 5 m is the height of the mass in the block INTERIOR (one indivisible storey), not an
        // alternative reading of the table. It must never appear as a band height.
        expect(BCN_ART350_BLOCK_INTERIOR_HEIGHT_M).toBe(5);
        for (const b of BCN_ALCADA_INDUSTRIAL_TABLE) {
            expect(b.height_m).not.toBe(BCN_ART350_BLOCK_INTERIOR_HEIGHT_M);
        }
    });
});

describe('L-590 — the band boundaries at 8 and 11 m, and the OPEN-ENDED top', () => {
    it('declares the inclusive/exclusive rule as STATED by the ordinance, not adopted', () => {
        // ⚠ The one place this differs from Art. 328: "De menys de 8" / "De 8 a menys d’11" /
        // "De 11 en endavant" states the boundary rule in words, so the flag is TRUE here and
        // FALSE for 13b. Getting this backwards would over-claim a legal finding.
        expect(BCN_ART350_EDGE_CONVENTION.statedByOrdinance).toBe(true);
        expect(BCN_ART350_EDGE_CONVENTION.lowerInclusive).toBe(true);
        expect(BCN_ART350_EDGE_CONVENTION.why).toMatch(/De menys de 8/);
    });

    it.each([
        [8, 13, 2],
        [11, 17, 3],
    ])(
        'exactly %s m (OFFICIAL width) falls in the UPPER band ⇒ %s m (PB+%s)',
        (width, height, floors) => {
            const r = resolveAlcadaIndustrial(width, {
                ...NO_PLA_PARCIAL,
                trustedOfficialWidth: true,
            });
            expect(r.ok).toBe(true);
            if (r.ok) {
                expect(r.height_m).toBe(height);
                expect(r.floorsAboveGround).toBe(floors);
            }
        },
    );

    it.each([[8], [11]])(
        'REFUSES a MEASURED width sitting on the %s m edge rather than let noise pick a storey',
        (width) => {
            const r = resolveAlcadaIndustrial(width, NO_PLA_PARCIAL);
            expect(r.ok).toBe(false);
            if (!r.ok) {
                expect(r.reason).toBe('band-edge');
                expect(r.straddles).toHaveLength(2);
            }
        },
    );

    it('the 0.5 m guard still fits inside the narrowest (3 m) band', () => {
        // 8–11 is 3 m wide, exactly like Art. 328's narrowest. If the guard ever exceeded half the
        // band it would swallow it whole and the middle row would become unreachable.
        const narrowest = Math.min(
            ...BCN_ALCADA_INDUSTRIAL_TABLE.filter((b) => Number.isFinite(b.maxWidth_m)).map(
                (b) => b.maxWidth_m - b.minWidth_m,
            ),
        );
        expect(narrowest).toBe(3);
        expect(BAND_EDGE_GUARD_M * 2).toBeLessThan(narrowest);
    });

    it('⚠ INVENTS NO EDGE ABOVE 11 m — the top band is open-ended, so nothing there can straddle', () => {
        // The guard must not manufacture a boundary the ordinance does not state. Sweep the whole
        // region a fourth band would have lived in (15 m is where 327/328 both step) with MEASURED
        // widths — every one must answer, none may refuse.
        for (const w of [12.35, 12, 14.5, 15, 15.5, 20, 30, 60, 500]) {
            const r = resolveAlcadaIndustrial(w, NO_PLA_PARCIAL);
            expect(r.ok, `${w} m must resolve — no band edge exists above 11 m`).toBe(true);
            if (r.ok) expect(r.height_m).toBe(17);
        }
    });

    it('a huge measurement spread still cannot conjure a refusal in the top band', () => {
        // §L-586 widens the guard to the measurement's own error bar. Even a ±10 m spread has no
        // edge to straddle up there.
        const r = resolveAlcadaIndustrial(40, { ...NO_PLA_PARCIAL, measurementSpread_m: 10 });
        expect(r.ok).toBe(true);
        // …but the SAME spread does straddle the real 11 m edge.
        const near = resolveAlcadaIndustrial(14, { ...NO_PLA_PARCIAL, measurementSpread_m: 10 });
        expect(near.ok).toBe(false);
        if (!near.ok) expect(near.reason).toBe('band-edge');
    });

    it('rejects unusable widths', () => {
        for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
            const r = resolveAlcadaIndustrial(bad, NO_PLA_PARCIAL);
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.reason).toBe('bad-input');
        }
    });
});

describe('L-590 — the Art. 350.1 / 350.2 Pla Parcial gate', () => {
    it('REFUSES by default: an unstated regime is not a licence to apply Art. 350.2', () => {
        // The default must be the refusing one. "We found no Pla Parcial" and "no Pla Parcial
        // exists" are the same absence of data; only the second licenses this table.
        const r = resolveAlcadaIndustrial(14);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('pla-parcial-unknown');
    });

    it('REFUSES distinctly when a Pla Parcial IS known to govern (Art. 350.1)', () => {
        // A different answer, not a different flavour of the same one: here the height exists and
        // lives in a document we do not hold, which is actionable for the user in a way that
        // "unknown" is not.
        const r = resolveAlcadaIndustrial(14, { planParcialRegime: 'approved' });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('pla-parcial-governs');
    });

    it('checks the regime BEFORE the width, so the blocking problem is the one reported', () => {
        // A caller with no regime AND a bad width must hear about the regime — it is the reason
        // this zone has no coverage, and a width complaint would hide it.
        const r = resolveAlcadaIndustrial(-1);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('pla-parcial-unknown');
    });

    it('answers only for the established Art. 350.2 regime', () => {
        expect(resolveAlcadaIndustrial(14, { planParcialRegime: 'none' }).ok).toBe(true);
    });
});

describe('L-590 — zone→article dispatch: a 22a parcel must cite Art. 350, never 327 or 328', () => {
    it('routes clau 22a to Art. 350.2.c with the 22a citation', () => {
        // THE DEFECT THIS PREVENTS is documented in `bcnAlcadaByZone.ts` and it has happened once
        // already (13b silently receiving Art. 327's ladder under Art. 327's citation).
        const z = resolveBcnAlcadaForZone('22a', 14, { planParcialRegime: 'none' });
        expect(z).not.toBeNull();
        expect(z!.article).toBe('Art. 350.2.c');
        expect(z!.ordinanceRef).toMatch(/clau 22a/);
        expect(z!.ordinanceRef).toMatch(/Art\. 350\.2\.c/);
        expect(z!.resolution.ok).toBe(true);
        if (z!.resolution.ok) expect(z!.resolution.height_m).toBe(17);
    });

    it('does NOT give 22a a 13a or 13b height under any width', () => {
        for (const w of [6, 9.5, 14, 25, 40]) {
            const z = resolveBcnAlcadaForZone('22a', w, {
                planParcialRegime: 'none',
                trustedOfficialWidth: true,
            });
            expect(z!.article).toBe('Art. 350.2.c');
            if (z!.resolution.ok) {
                expect([9, 13, 17]).toContain(z!.resolution.height_m);
            }
        }
    });

    it('forwards the Pla Parcial regime — the dispatcher must not swallow the gate', () => {
        const z = resolveBcnAlcadaForZone('22a', 14);
        expect(z).not.toBeNull();
        expect(z!.article).toBe('Art. 350.2.c');
        expect(z!.resolution.ok).toBe(false);
        if (!z!.resolution.ok) expect(z!.resolution.reason).toBe('pla-parcial-unknown');
    });

    it('the three claus keep their own articles and citations', () => {
        expect(resolveBcnAlcadaForZone('13a', 14)!.article).toBe('Art. 327.2');
        expect(resolveBcnAlcadaForZone('13b', 14)!.article).toBe('Art. 328');
        expect(resolveBcnAlcadaForZone('22a', 14)!.article).toBe('Art. 350.2.c');
        // ⚠ 22@ is a formally distinct subzone with its own articles (MPGM 2000). Answering for it
        // from Art. 350 would be the L-526 failure one clau over.
        expect(resolveBcnAlcadaForZone('22@', 14)).toBeNull();
    });

    it('the planParcialRegime option is inert for 13a/13b — Arts. 327/328 have no such gate', () => {
        const a = resolveBcnAlcadaForZone('13a', 14, { planParcialRegime: 'approved' });
        expect(a!.resolution.ok).toBe(true);
        const b = resolveBcnAlcadaForZone('13b', 14, { planParcialRegime: 'unknown' });
        expect(b!.resolution.ok).toBe(true);
    });

    it('is deterministic (C58 §1.1)', () => {
        const once = resolveBcnAlcadaForZone('22a', 14, { planParcialRegime: 'none' });
        const twice = resolveBcnAlcadaForZone('22a', 14, { planParcialRegime: 'none' });
        expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
    });
});
