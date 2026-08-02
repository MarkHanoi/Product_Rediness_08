// §CORDOBA-UNPACKED-FAMILY-SPLIT (L-677) — the FIVE families COACo publishes that PRYZM does not pack.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS FILE IS FOR
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Measured live against the publisher on 2026-08-01, `coaco:ordenanzas` returns **453 polygons,
// Σ `sup_m2` 1 628 615.63 m², TEN distinct `ordenanza` families**. PRYZM holds transcribed rules for
// five (Manzana Cerrada · Ordenación Abierta · Colonia Tradicional Popular · Plurifamiliar aislada ·
// Unifamiliar Adosada = 95.47 % of ordenanzas land). The other five are **4.53 %** and each must
// reach a TERMINAL, EVIDENCE-BACKED state — C63 §1.5 / L-656: a cited refusal is a correct answer.
//
// ⚠ THE PROPERTY BEING PINNED IS NOT "A REFUSAL APPEARS". It is that each family's refusal is
//   (a) TYPED to its own cause, (b) LAND-IDENTIFYING (it names the family, so the owner can tell it
//   is about their parcel), and (c) either NAMES THE ARTICLE that makes it non-computable or states
//   the measured absence of a retrievable one. A refusal that says only "we have no rule" is the
//   defect that deleted four Barcelona branches — it makes a publisher's gap read as PRYZM's queue,
//   and a legal delegation read as a coverage gap.
//
// The three legally-grounded families now cite Art. 13.4.1 / Art. 13.12.2 / Art. 13.3; the two
// coverage families are split apart, because "we read the chapter and it does not resolve"
// (Industrial) and "we could not read the chapter" (UAS) are DIFFERENT VALUES (L-422/457/467/469).

import { describe, it, expect } from 'vitest';
import {
    cordobaZoneRefusalFor,
    cordobaNoRulePackRefusal,
    cordobaIndustrialUnbindableRefusal,
    cordobaUasChapterUnobtainableRefusal,
    CORDOBA_LEGALLY_REFUSED_ORDENANZAS,
} from '../src/rulepacks/esCordobaZoneClassification.js';
import { CORDOBA_PGOU2001_ZONE_CODES } from '../src/rulepacks/esCordobaPGOU2001.js';

/**
 * The TEN families COACo publishes, with the live-measured land each holds. Re-measured 2026-08-01
 * (WFS 2.0.0 `coaco:ordenanzas`, `outputFormat=application/json`, Σ `sup_m2` grouped by `ordenanza`).
 * `packed` is a fact about PRYZM; every row is a fact about the publisher.
 */
const COACO_FAMILIES = [
    { family: 'Manzana Cerrada', polygons: 226, m2: 716991.42, packed: true },
    { family: 'Ordenacion Abierta', polygons: 43, m2: 296976.84, packed: true },
    { family: 'Colonia Tradicional Popular', polygons: 99, m2: 280139.6, packed: true },
    { family: 'Plurifamiliar aislada', polygons: 30, m2: 172760.95, packed: true },
    { family: 'Unifamiliar Adosada', polygons: 22, m2: 87911.86, packed: true },
    { family: 'Uso Comercial', polygons: 8, m2: 37095.55, packed: false },
    { family: 'CTP1- Campo de la Verdad', polygons: 16, m2: 21284.9, packed: false },
    { family: 'Elemento protegido', polygons: 7, m2: 10846.19, packed: false },
    { family: 'Unifamiliar Aislada', polygons: 1, m2: 2687.97, packed: false },
    { family: 'Uso Industrial', polygons: 1, m2: 1920.35, packed: false },
] as const;

const ORDENANZAS_LAND_M2 = 1628615.63;

describe('§CORDOBA-UNPACKED-FAMILY-SPLIT — the publisher inventory this is measured against', () => {
    it('is TEN families and the shares reconcile to the publisher’s own total', () => {
        expect(COACO_FAMILIES).toHaveLength(10);
        const sum = COACO_FAMILIES.reduce((a, f) => a + f.m2, 0);
        // Within 1 m² of the live Σ `sup_m2` — the numbers are transcribed, not approximated.
        expect(Math.abs(sum - ORDENANZAS_LAND_M2)).toBeLessThan(1);
        const packedShare = COACO_FAMILIES.filter((f) => f.packed).reduce((a, f) => a + f.m2, 0) / sum;
        // 5 of 10 families = 95.47 % of ordenanzas land. ⚠ A LAND share, not an ANSWER share:
        // ~44.7 % of that land is delegated to a later instrument and MC's height table is
        // unresolved, so the envelope that actually renders today is ZERO (see the measurements
        // record). Quoting 95 % as coverage would be the withdrawn "89 %" error a third time.
        expect(packedShare).toBeGreaterThan(0.954);
        expect(packedShare).toBeLessThan(0.955);
    });

    it('every UNPACKED family reaches a refusal — none falls through to silence', () => {
        for (const f of COACO_FAMILIES.filter((x) => !x.packed)) {
            const legal = cordobaZoneRefusalFor(f.family);
            const refusal = legal ?? cordobaNoRulePackRefusal(f.family, f.family);
            expect(refusal, f.family).toBeTruthy();
            expect(refusal.code, f.family).toBeTruthy();
            // LAND-IDENTIFYING: the card names the family, so an owner can tell it is about them.
            const head = refusal.headline.toLowerCase();
            const firstWord = f.family.replace(/^CTP1-\s*/, '').trim().split(/\s+/)[0]!.toLowerCase();
            expect(head, `${f.family} headline must name the family`).toContain(firstWord);
        }
    });

    it('no PACKED family is ever answered with "PRYZM holds no rule"', () => {
        // The Barcelona `13b`/`22a`/`22@`/`20a` deletion, as a property. A packed family reaching
        // the coverage card would be a FALSE STATEMENT ABOUT OUR OWN COVERAGE.
        for (const f of COACO_FAMILIES.filter((x) => x.packed)) {
            expect(cordobaZoneRefusalFor(f.family), `${f.family} must not be a LEGAL "no"`).toBeNull();
        }
        // …and the pack really does carry a subzone for each of those five families.
        const codes = CORDOBA_PGOU2001_ZONE_CODES as readonly string[];
        for (const prefix of ['MC-', 'OA-', 'CTP-', 'PAS-', 'UAD-']) {
            expect(codes.some((c) => c.startsWith(prefix)), prefix).toBe(true);
        }
    });
});

describe('the THREE legally-grounded families each NAME their governing article', () => {
    const CASES = [
        { token: 'CTP1-Campo de la Verdad', article: 'Art. 13.4.1', mustSay: 'Tomo VI' },
        { token: 'Uso Comercial', article: 'Art. 13.12.2', mustSay: 'Plan Parcial' },
        { token: 'Elemento protegido', article: 'Art. 13.3', mustSay: 'protección' },
    ] as const;

    for (const c of CASES) {
        it(`${c.token} cites ${c.article}`, () => {
            const r = cordobaZoneRefusalFor(c.token);
            expect(r, `${c.token} must be classified`).not.toBeNull();
            expect(r!.legallyGrounded).toBe(true);
            expect(r!.ordinanceRef, 'a legally-grounded refusal without a citation is an assertion').toBeTruthy();
            expect(r!.ordinanceRef!).toContain(c.article);
            expect(r!.ordinanceRef!).toContain(c.mustSay);
        });
    }

    it('the classification table is DISJOINT and covers exactly these three families', () => {
        // Built at module load with a duplicate-throw; this pins the SIZE so a fourth family cannot
        // be added silently (it would need its own article and its own row here).
        const families = CORDOBA_LEGALLY_REFUSED_ORDENANZAS.filter((t) => t.includes(' '));
        expect(new Set(families).size).toBe(families.length);
        expect(families.sort()).toEqual(
            ['CTP1-Campo de la Verdad', 'Elemento protegido', 'Uso Comercial'].sort(),
        );
    });
});

describe('the TWO coverage families are SPLIT — "read but unresolvable" ≠ "could not read"', () => {
    it('Uso Industrial is `regime-undetermined` and cites Art. 13.11, never "we have not read it"', () => {
        const r = cordobaIndustrialUnbindableRefusal('Uso Industrial', 'Uso Industrial');
        expect(r).not.toBeNull();
        // ⚠ NOT `no-rule-pack`: PRYZM HAS read `O_INDUSTRIAL.pdf` (born-digital, 23 620 chars).
        expect(r!.code).toBe('regime-undetermined');
        expect(r!.legallyGrounded).toBe(false);
        expect(r!.ordinanceRef!).toContain('Art. 13.11');
        // BOTH independent reasons must be stated — closing either alone still yields no number.
        expect(r!.detail).toMatch(/IND-1\/2\/3\/G\/C\/SC-C/);
        expect(r!.detail).toMatch(/algorithm/i);
        // The verbatim ordinance phrase that makes ocupación an algorithm (ADR-0271 shape).
        expect(r!.ordinanceRef!).toContain('la resultante de la aplicación de los parámetros');
        // It must NOT claim PRYZM has not transcribed the ordenanza.
        expect(r!.detail).not.toMatch(/has not transcribed/i);
    });

    it('Unifamiliar Aislada is `no-rule-pack` — a DOCUMENT absence, and never a legal "no"', () => {
        const r = cordobaUasChapterUnobtainableRefusal('UAS-1', 'Unifamiliar Aislada');
        expect(r).not.toBeNull();
        expect(r!.code).toBe('no-rule-pack');
        // ⚠ NOT legally grounded: asserting the ordinance refuses an envelope on buildable land is
        // the false-negative-about-someone's-land error C58 ranks worst.
        expect(r!.legallyGrounded).toBe(false);
        expect(r!.ordinanceRef).toBeNull();
        // The copy must say the plot IS buildable and that the gap is the publisher's.
        expect(r!.detail).toMatch(/nothing here says the plot is unbuildable/i);
        expect(r!.detail).toMatch(/Server under construction/i);
        // ⚠ NOT `source-data-unavailable` — that code is DEFINED as transient and carries the only
        // retry affordance; nothing here clears on a retry, and the copy says so.
        expect(r!.code).not.toBe('source-data-unavailable');
        expect(r!.detail).toMatch(/retrying will not\s+change it/i);
    });

    it('the two cards are genuinely DIFFERENT values, not one card with two sentences', () => {
        const ind = cordobaIndustrialUnbindableRefusal('Uso Industrial')!;
        const uas = cordobaUasChapterUnobtainableRefusal('Unifamiliar Aislada')!;
        expect(ind.code).not.toBe(uas.code);
        expect(ind.headline).not.toBe(uas.headline);
        // Neither may recite the other's cause — that is the "Either… or…" defect being closed.
        expect(ind.detail).not.toMatch(/Unifamiliar Aislada/);
        expect(uas.detail).not.toMatch(/Uso Industrial|IND-1/);
    });

    it('each returns `null` for a family it is not about (no card may claim another’s land)', () => {
        for (const other of ['MC-2', 'CTP-1', 'Ordenacion Abierta', 'Uso Comercial', '']) {
            expect(cordobaIndustrialUnbindableRefusal(other), other).toBeNull();
            expect(cordobaUasChapterUnobtainableRefusal(other), other).toBeNull();
        }
    });

    it('the shared coverage card ROUTES to them, so the dispatcher wiring needs no edit', () => {
        // `noRulePackRefusal` is what `registry.ts` hands the dispatcher; the split must be reachable
        // through it or it is authored-but-unwired (the trap the ROI board keeps re-learning).
        expect(cordobaNoRulePackRefusal('INDUSTRIAL', 'Uso Industrial').code).toBe('regime-undetermined');
        expect(cordobaNoRulePackRefusal('UAS-1', 'Unifamiliar Aislada').code).toBe('no-rule-pack');
        expect(cordobaNoRulePackRefusal('UAS-1', 'Unifamiliar Aislada').detail)
            .toMatch(/Server under construction/i);
        // …and an UNANTICIPATED family still gets the generic card rather than a throw or a number.
        const fallback = cordobaNoRulePackRefusal('SOMETHING-NEW', 'A Family Nobody Anticipated');
        expect(fallback.code).toBe('no-rule-pack');
        expect(fallback.headline).toContain('A Family Nobody Anticipated');
        // ⚠ The generic card must no longer recite the two named families — that recitation was
        // the whole defect, and leaving it would make every future family read as Industrial+UAS.
        expect(fallback.detail).not.toMatch(/Uso Industrial|Unifamiliar Aislada/);
    });

    it('every card carries the per-parcel knownFacts through, so no panel is ever blank (L-553)', () => {
        const facts = ['Parcel area: 412 m²', 'Location: Córdoba'];
        for (const r of [
            cordobaIndustrialUnbindableRefusal('Uso Industrial', null, facts)!,
            cordobaUasChapterUnobtainableRefusal('Unifamiliar Aislada', null, facts)!,
            cordobaNoRulePackRefusal('X', 'X', facts),
            cordobaZoneRefusalFor('Uso Comercial', null, facts)!,
        ]) {
            expect(r.knownFacts).toEqual(facts);
        }
    });
});
