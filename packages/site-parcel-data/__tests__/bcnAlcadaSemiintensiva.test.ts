// ✍ SIG-2 (2026-08-01): expectations updated from the BASE metropolitan ladder to the
// BARCELONA values of the MPGM 02-03-2007 (DOGC 4893). See sources/VERIFICATION.md.
// L-583 §4 — PGM Art. 328 *alçada reguladora* resolution for clau 13b, and the zone→article
// dispatch that keeps it apart from Art. 327.
//
// The thing under test decides how TALL a building may be, from a STEPPED table, on 8.8 % of
// Barcelona's private buildable land. So the assertions target the two failures that matter and
// are otherwise SILENT:
//   • picking the wrong STEP (a shifted table passes any spot-check);
//   • picking the wrong TABLE — handing a 13b parcel Art. 327's six-band ladder, which would
//     over-build it by up to two storeys AND cite an article that does not govern it.

import { describe, it, expect } from 'vitest';
import {
    resolveAlcadaSemiintensiva,
    BCN_ALCADA_SEMIINTENSIVA_TABLE,
    BCN_ART328_EDGE_CONVENTION,
} from '../src/rulepacks/bcnAlcadaSemiintensiva.js';
import {
    BCN_ALCADA_REGULADORA_TABLE,
    BAND_EDGE_GUARD_M,
} from '../src/rulepacks/bcnAlcadaReguladora.js';
import { resolveBcnAlcadaForZone } from '../src/rulepacks/bcnAlcadaByZone.js';

describe('L-583 §4 — the Art. 328 table (clau 13b, Subzona II)', () => {
    it('covers the width axis with no gap and no overlap', () => {
        // A gap silently falls through to the top band; an overlap makes the answer depend on
        // iteration order. Either is a wrong building height, not a lint issue.
        for (let i = 1; i < BCN_ALCADA_SEMIINTENSIVA_TABLE.length; i++) {
            expect(BCN_ALCADA_SEMIINTENSIVA_TABLE[i]!.minWidth_m).toBe(
                BCN_ALCADA_SEMIINTENSIVA_TABLE[i - 1]!.maxWidth_m,
            );
        }
        expect(BCN_ALCADA_SEMIINTENSIVA_TABLE[0]!.minWidth_m).toBe(0);
        expect(
            BCN_ALCADA_SEMIINTENSIVA_TABLE[BCN_ALCADA_SEMIINTENSIVA_TABLE.length - 1]!.maxWidth_m,
        ).toBe(Infinity);
    });

    it('is monotonic — a wider street never permits a lower building', () => {
        for (let i = 1; i < BCN_ALCADA_SEMIINTENSIVA_TABLE.length; i++) {
            expect(BCN_ALCADA_SEMIINTENSIVA_TABLE[i]!.height_m).toBeGreaterThan(
                BCN_ALCADA_SEMIINTENSIVA_TABLE[i - 1]!.height_m,
            );
            expect(BCN_ALCADA_SEMIINTENSIVA_TABLE[i]!.floorsAboveGround).toBeGreaterThan(
                BCN_ALCADA_SEMIINTENSIVA_TABLE[i - 1]!.floorsAboveGround,
            );
        }
    });

    // Mid-band widths, one per row: verifies the VALUES, not just the shape.
    it.each([
        [6, 8.25, 1],
        [9.5, 12.0, 2],
        [13, 15.4, 3],
        [25, 18.8, 4],
    ])('a %s m street ⇒ %s m (PB+%s)', (width, height, floors) => {
        const r = resolveAlcadaSemiintensiva(width);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.height_m).toBe(height);
            expect(r.floorsAboveGround).toBe(floors);
        }
    });

    it('⚠ IS NOT THE Art. 327 TABLE — four bands, PB+4 ceiling, different figures', () => {
        // THE ASSERTION THAT STOPS THE MOST LIKELY WRONG EDIT: "13b is 13a with different
        // numbers, so let me reuse/align the table." L-552 §3.2 measured that the 13b ladder is
        // not derivable from the 13a one by any transformation.
        expect(BCN_ALCADA_SEMIINTENSIVA_TABLE).toHaveLength(4);
        expect(BCN_ALCADA_REGULADORA_TABLE).toHaveLength(6);
        const top = BCN_ALCADA_SEMIINTENSIVA_TABLE[BCN_ALCADA_SEMIINTENSIVA_TABLE.length - 1]!;
        expect(top.floorsAboveGround).toBe(4);
        expect(top.height_m).toBe(18.8);
        // No band shares a height with the Art. 327 table — the two ladders are disjoint.
        const art327Heights = new Set(BCN_ALCADA_REGULADORA_TABLE.map((b) => b.height_m));
        for (const b of BCN_ALCADA_SEMIINTENSIVA_TABLE) {
            expect(art327Heights.has(b.height_m), `${b.height_m} m must not be an Art. 327 value`)
                .toBe(false);
        }
    });

    it('carries NO Eixample cornice increment — Art. 21 governs the Eixample, not 13b', () => {
        // 13a's resolver returns 2.25 m here. Carrying it across would apply the Ordenança de
        // Rehabilitació i Millora de l'Eixample to land it does not govern.
        const r = resolveAlcadaSemiintensiva(9.5);
        expect(r.ok && r.corniceIncrementMax_m).toBeNull();
    });
});

describe('L-583 §4 — the band boundaries at 8, 11 and 15 m, and the convention behind them', () => {
    it('⚠ DECLARES that the ordinance does NOT state the inclusive/exclusive rule', () => {
        // THE HONEST PART. The sourced material gives ranges ("8 – 11"), not a boundary rule. This
        // flag is how that gap stays discoverable from the code instead of being silently decided.
        expect(BCN_ART328_EDGE_CONVENTION.statedByOrdinance).toBe(false);
        expect(BCN_ART328_EDGE_CONVENTION.lowerInclusive).toBe(true);
        expect(BCN_ART328_EDGE_CONVENTION.why).toMatch(/ADOPTED CONVENTION, NOT A LEGAL FINDING/);
    });

    it.each([
        [8, 12.0, 2],
        [11, 15.4, 3],
        [15, 18.8, 4],
    ])(
        'exactly %s m (OFFICIAL width) falls in the UPPER band ⇒ %s m (PB+%s)',
        (width, height, floors) => {
            // Half-open [min, max): the edge belongs to the band it opens, not the one it closes.
            // Only reachable with a trusted official width — see the next test.
            const r = resolveAlcadaSemiintensiva(width, { trustedOfficialWidth: true });
            expect(r.ok).toBe(true);
            if (r.ok) {
                expect(r.height_m).toBe(height);
                expect(r.floorsAboveGround).toBe(floors);
            }
        },
    );

    it.each([[8], [11], [15]])(
        'REFUSES a MEASURED width sitting on the %s m edge rather than let noise pick a storey',
        (width) => {
            // This is why the unsourced convention almost never decides anything: a measured
            // width anywhere near an edge is refused outright. An absent height costs a flat
            // study volume; a wrong one costs a wrong building.
            const r = resolveAlcadaSemiintensiva(width);
            expect(r.ok).toBe(false);
            if (!r.ok) {
                expect(r.reason).toBe('band-edge');
                expect(r.straddles).toHaveLength(2);
            }
        },
    );

    it('refuses ANYWHERE within the guard band, on both sides of each edge', () => {
        for (const edge of [8, 11, 15]) {
            for (const w of [
                edge - BAND_EDGE_GUARD_M + 0.01,
                edge - 0.1,
                edge + 0.1,
                edge + BAND_EDGE_GUARD_M - 0.01,
            ]) {
                expect(
                    resolveAlcadaSemiintensiva(w).ok,
                    `measured ${w} m must not decide a storey band`,
                ).toBe(false);
            }
        }
    });

    it('answers normally once the measured width is clear of every edge', () => {
        const r = resolveAlcadaSemiintensiva(12.5);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.height_m).toBe(15.4);
    });

    it.each([[0], [-5], [Number.NaN], [Number.POSITIVE_INFINITY]])(
        'returns bad-input for %s rather than throwing',
        (w) => {
            const r = resolveAlcadaSemiintensiva(w as number);
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.reason).toBe('bad-input');
        },
    );

    it('is deterministic (C58 §1.1)', () => {
        expect(resolveAlcadaSemiintensiva(12.5)).toEqual(resolveAlcadaSemiintensiva(12.5));
    });
});

describe('L-583 — resolveBcnAlcadaForZone: the right ARTICLE for the right clau', () => {
    it('gives 13a / 13E the Art. 327.2 table and citation', () => {
        for (const clau of ['13a', '13E']) {
            const z = resolveBcnAlcadaForZone(clau, 25, { trustedOfficialWidth: true });
            expect(z, clau).not.toBeNull();
            expect(z!.article).toBe('Art. 327.2');
            expect(z!.ordinanceRef).toMatch(/Art\. 242/);
            expect(z!.resolution.ok && z!.resolution.height_m).toBe(22.4);
        }
    });

    it('gives 13b the Art. 328 table and the 13b citation — NOT 13a’s', () => {
        // THE REGRESSION THIS FILE EXISTS FOR. Before the zone dispatch, the L5 path called
        // Art. 327's resolver unconditionally and stamped "Art. 327.2" into the derivation row.
        // On a 25 m street that would have published 22.4 m for a zone whose real answer is
        // 16.70 m — a 4 m over-build carrying a confident citation to the wrong article (L-526).
        const z = resolveBcnAlcadaForZone('13b', 25, { trustedOfficialWidth: true });
        expect(z).not.toBeNull();
        expect(z!.article).toBe('Art. 328');
        expect(z!.resolution.ok && z!.resolution.height_m).toBe(18.8);
        expect(z!.ordinanceRef).toMatch(/clau 13b/);
        expect(z!.ordinanceRef).toMatch(/Art\. 328 states NO depth rule/);
    });

    it('does not invent a sub-clause number for Art. 328', () => {
        // "328.2" by analogy with "327.2" would be fabricated precision. The source names the
        // article; it does not establish the clause.
        expect(resolveBcnAlcadaForZone('13b', 25)!.article).not.toMatch(/328\./);
    });

    it('returns NULL for a clau with no encoded height article, never a neighbour’s table', () => {
        // A packed zone whose height article we have not read must publish NO height. Borrowing
        // an adjacent zone's table is the one outcome worse than showing nothing.
        //
        // ⚠ §L-590 — `22a` WAS in this list and has MOVED OUT, not been dropped: PGM Art. 350.2.c
        // has since been read from the primary NNUU text and encoded, so 22a is no longer "a clau
        // with no encoded height article" and asserting `null` for it would now be asserting a
        // fact about our coverage that is false. The assertion it moved to is STRONGER — it pins
        // the article, not merely the absence of one. `22@` takes its place here, and belongs
        // here: it is a formally distinct subzone with its own articles, which Art. 350 does not
        // govern.
        for (const clau of ['12', '12b', '22@', '20a', '', '13']) {
            expect(resolveBcnAlcadaForZone(clau, 25), clau).toBeNull();
        }
    });

    it('§L-590 gives 22a its OWN article (Art. 350.2.c), never 327’s or 328’s table', () => {
        // The replacement for 22a's old `toBeNull()` row, and it guards more than that row did:
        // on a 25 m street Art. 327 would say 22.4 m and Art. 328 16.70 m, while Art. 350.2.c
        // says 17 m. All three are plausible-looking heights; only one is this land's.
        const z = resolveBcnAlcadaForZone('22a', 25, {
            trustedOfficialWidth: true,
            planParcialRegime: 'none',
        });
        expect(z).not.toBeNull();
        expect(z!.article).toBe('Art. 350.2.c');
        expect(z!.ordinanceRef).toMatch(/clau 22a/);
        expect(z!.resolution.ok && z!.resolution.height_m).toBe(17);
        expect(z!.resolution.ok && z!.resolution.height_m).not.toBe(22.4); // Art. 327
        expect(z!.resolution.ok && z!.resolution.height_m).not.toBe(18.8); // Art. 328
    });
});
