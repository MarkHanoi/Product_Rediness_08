// §CORDOBA-UNPACKED-FAMILY-SPLIT (L-677) — the THREE families COACo publishes that PRYZM does not pack.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS FILE IS FOR
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Measured live against the publisher on 2026-08-01, `coaco:ordenanzas` returns **453 polygons,
// Σ `sup_m2` 1 628 615.63 m², TEN distinct `ordenanza` families**. PRYZM holds transcribed rules for
// SEVEN as of 2026-08-05 (Manzana Cerrada · Ordenación Abierta · Colonia Tradicional Popular ·
// Plurifamiliar aislada · Unifamiliar Adosada · CTP1-Campo de la Verdad · Unifamiliar Aislada =
// 96.94 % of ordenanzas land). The other three are **3.06 %** and each must reach a TERMINAL,
// EVIDENCE-BACKED state — C63 §1.5 / L-656: a cited refusal is a correct answer.
//
// ⚠ THE PROPERTY BEING PINNED IS NOT "A REFUSAL APPEARS". It is that each family's refusal is
//   (a) TYPED to its own cause, (b) LAND-IDENTIFYING (it names the family, so the owner can tell it
//   is about their parcel), and (c) either NAMES THE ARTICLE that makes it non-computable or states
//   the measured absence of a retrievable one. A refusal that says only "we have no rule" is the
//   defect that deleted four Barcelona branches — it makes a publisher's gap read as PRYZM's queue,
//   and a legal delegation read as a coverage gap.
//
// The two legally-grounded families now cite Art. 13.12.2 / Art. 13.3; the one remaining coverage
// family, Uso Industrial, is `regime-undetermined` — the chapter IS read (Art. 13.11), but the
// publisher never names which IND subzone applies and the ordinance derives ocupación by algorithm.
//
// ⚠ 2026-08-05 — Unifamiliar Aislada MOVED OUT of the "unpacked coverage family" bucket this file
// used to describe. Its six subzones (Art. 13.10) are now packed (`esCordobaPGOU2001.ts`). It is
// STILL not resolvable via live COACo dispatch — the publisher's calificación names only the family,
// never a UAS-1…6 suffix — but that is now the SAME `regime-undetermined` shape as Uso Industrial,
// not a `no-rule-pack` document-absence claim (`cordobaUasSubzoneUnbindableRefusal`, renamed from
// `cordobaUasChapterUnobtainableRefusal`). See that function's own header for the full record of
// what changed and why the old "we could not read it" wording would now be false.

import { describe, it, expect } from 'vitest';
import {
    cordobaZoneRefusalFor,
    cordobaNoRulePackRefusal,
    cordobaIndustrialUnbindableRefusal,
    cordobaUasSubzoneUnbindableRefusal,
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
    // ⭐ 2026-08-04 — PACKED (`PTC` in `esCordobaPGOU2001.ts`, Art. 13.4.1 → Tomo VI's "PT" ordinance,
    // now held). Still resolves to NO envelope (MC-shaped structural refusal), but that is now a
    // PACKED refusal, not a "PRYZM has not transcribed this" coverage gap or a legal "no".
    { family: 'CTP1- Campo de la Verdad', polygons: 16, m2: 21284.9, packed: true },
    { family: 'Uso Comercial', polygons: 8, m2: 37095.55, packed: false },
    { family: 'Elemento protegido', polygons: 7, m2: 10846.19, packed: false },
    // ⭐ 2026-08-05 — PACKED (`UAS-1`…`UAS-6` in `esCordobaPGOU2001.ts`, Art. 13.10, all six subzones
    // held). Still resolves to NO live-COACo-dispatched envelope — the calificación names only the
    // family — but that is now a PACKED `regime-undetermined` refusal (a missing selector), never a
    // `no-rule-pack` "PRYZM has not transcribed this" coverage gap.
    { family: 'Unifamiliar Aislada', polygons: 1, m2: 2687.97, packed: true },
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
        // 7 of 10 families (2026-08-04: + `PTC`; 2026-08-05: + `Unifamiliar Aislada`) = 96.94 % of
        // ordenanzas land. ⚠ A LAND share, not an ANSWER share: ~44.7 % of that land is delegated to
        // a later instrument, MC's height table is unresolved, PTC itself is a structural refusal
        // (no stated buildable depth), and UAS itself still resolves to NO live-dispatch envelope
        // (subzone-unbindable), so the envelope that actually renders today is still ZERO for a
        // large share of this "packed" land (see the measurements record). Quoting 96.94 % as
        // coverage would be the withdrawn "89 %" error a fourth time.
        expect(packedShare).toBeGreaterThan(0.969);
        expect(packedShare).toBeLessThan(0.9695);
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
        // …and the pack really does carry a subzone for each of those seven families.
        const codes = CORDOBA_PGOU2001_ZONE_CODES as readonly string[];
        for (const prefix of ['MC-', 'OA-', 'CTP-', 'PAS-', 'UAD-', 'UAS-']) {
            expect(codes.some((c) => c.startsWith(prefix)), prefix).toBe(true);
        }
        expect(codes.includes('PTC'), 'PTC').toBe(true);
    });
});

describe('the TWO legally-grounded families each NAME their governing article', () => {
    // ⚠ CTP1-Campo de la Verdad used to be a THIRD row here (Art. 13.4.1 → Tomo VI "not held"). It
    // is now PACKED (`PTC` in `esCordobaPGOU2001.ts`, Tomo VI IS held) and no longer classified as a
    // legally-grounded "no" — see the removal note in `esCordobaZoneClassification.ts`.
    const CASES = [
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

    it('CTP1-Campo de la Verdad is no longer a legal "no" — it is PACKED', () => {
        expect(cordobaZoneRefusalFor('CTP1-Campo de la Verdad')).toBeNull();
        expect(cordobaZoneRefusalFor('O_PTC')).toBeNull();
        expect(cordobaZoneRefusalFor('PTC')).toBeNull();
    });

    it('the classification table is DISJOINT and covers exactly these two families', () => {
        // Built at module load with a duplicate-throw; this pins the SIZE so a third family cannot
        // be added silently (it would need its own article and its own row here).
        const families = CORDOBA_LEGALLY_REFUSED_ORDENANZAS.filter((t) => t.includes(' '));
        expect(new Set(families).size).toBe(families.length);
        expect(families.sort()).toEqual(
            ['Elemento protegido', 'Uso Comercial'].sort(),
        );
    });
});

describe('Uso Industrial — the last remaining coverage family, "read but unresolvable"', () => {
    it('is `regime-undetermined` and cites Art. 13.11, never "we have not read it"', () => {
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

    it('returns `null` for a family it is not about', () => {
        for (const other of ['MC-2', 'CTP-1', 'Ordenacion Abierta', 'Uso Comercial', '']) {
            expect(cordobaIndustrialUnbindableRefusal(other), other).toBeNull();
        }
    });
});

// ⭐ 2026-08-05 — Unifamiliar Aislada moved from "could not read the chapter" (`no-rule-pack`) to
// "read it, but the live map cannot bind a parcel to one of six subzones" (`regime-undetermined`) —
// now the SAME shape as Uso Industrial, for its own independently-cited article (13.10, not 13.11).
describe('Unifamiliar Aislada — PACKED 2026-08-05, still `regime-undetermined` via live COACo', () => {
    it('is `regime-undetermined` and cites Art. 13.10, never "we could not read it"', () => {
        const r = cordobaUasSubzoneUnbindableRefusal('UAS-1', 'Unifamiliar Aislada');
        expect(r).not.toBeNull();
        // ⚠ NOT `no-rule-pack`: PRYZM HAS packed all six UAS-1…UAS-6 subzones (Art. 13.10).
        expect(r!.code).toBe('regime-undetermined');
        expect(r!.legallyGrounded).toBe(false);
        // The old wording asserted a DOCUMENT absence; that must not survive the rename.
        expect(r!.detail).not.toMatch(/Server under construction/i);
        expect(r!.detail).not.toMatch(/has never been able to read/i);
        // It must instead say the LAW is known and the gap is the published SELECTOR.
        expect(r!.detail).toMatch(/has read this ordinance chapter/i);
        expect(r!.detail).toMatch(/UAS-1…UAS-6|UAS-1\.\.\.UAS-6|UAS-1…UAS-6 suffix|never a UAS-1/i);
        expect(r!.detail).not.toMatch(/has not transcribed/i);
    });

    it('returns `null` for a family it is not about', () => {
        for (const other of ['MC-2', 'CTP-1', 'Ordenacion Abierta', 'Uso Comercial', '']) {
            expect(cordobaUasSubzoneUnbindableRefusal(other), other).toBeNull();
        }
    });

    it('the two cards are genuinely DIFFERENT values, not one card with two sentences', () => {
        const ind = cordobaIndustrialUnbindableRefusal('Uso Industrial')!;
        const uas = cordobaUasSubzoneUnbindableRefusal('Unifamiliar Aislada')!;
        // Same CODE family now (both `regime-undetermined`), but distinct headlines/citations —
        // neither may recite the other's cause.
        expect(ind.headline).not.toBe(uas.headline);
        expect(ind.ordinanceRef).not.toBe(uas.ordinanceRef);
        expect(ind.detail).not.toMatch(/Unifamiliar Aislada/);
        expect(uas.detail).not.toMatch(/Uso Industrial|IND-1/);
    });

    it('the shared coverage card ROUTES to it as `regime-undetermined`, not `no-rule-pack`', () => {
        // `noRulePackRefusal` is what `registry.ts` hands the dispatcher; the split must be reachable
        // through it or it is authored-but-unwired (the trap the ROI board keeps re-learning).
        expect(cordobaNoRulePackRefusal('INDUSTRIAL', 'Uso Industrial').code).toBe('regime-undetermined');
        const uasRouted = cordobaNoRulePackRefusal('UAS-1', 'Unifamiliar Aislada');
        expect(uasRouted.code).toBe('regime-undetermined');
        expect(uasRouted.detail).not.toMatch(/Server under construction/i);
        // …and an UNANTICIPATED family still gets the generic card rather than a throw or a number.
        const fallback = cordobaNoRulePackRefusal('SOMETHING-NEW', 'A Family Nobody Anticipated');
        expect(fallback.code).toBe('no-rule-pack');
        expect(fallback.headline).toContain('A Family Nobody Anticipated');
        // ⚠ The generic card must not recite either named family.
        expect(fallback.detail).not.toMatch(/Uso Industrial|Unifamiliar Aislada/);
    });

    it('every card carries the per-parcel knownFacts through, so no panel is ever blank (L-553)', () => {
        const facts = ['Parcel area: 412 m²', 'Location: Córdoba'];
        for (const r of [
            cordobaIndustrialUnbindableRefusal('Uso Industrial', null, facts)!,
            cordobaUasSubzoneUnbindableRefusal('Unifamiliar Aislada', null, facts)!,
            cordobaNoRulePackRefusal('X', 'X', facts),
            cordobaZoneRefusalFor('Uso Comercial', null, facts)!,
        ]) {
            expect(r.knownFacts).toEqual(facts);
        }
    });
});
