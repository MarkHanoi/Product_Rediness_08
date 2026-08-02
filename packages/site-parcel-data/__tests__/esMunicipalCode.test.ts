// §ES-MUNICIPAL-CODE-VOCABULARY — the INE/DGC boundary, and the three measured collisions.
//
// ⚠ THESE TESTS EXERCISE A PATH THAT DID NOT EXIST BEFORE 2026-08-02. Every one of them fails to
// COMPILE against the previous tree (there was no `esMunicipalCode.ts`), which is the strongest
// available form of "this test runs the new code".
//
// WHY THE FILE IS AT PACKAGE ROOT. `vitest.config.ts` has `include: ['__tests__/**/*.test.ts']`,
// which matches PACKAGE-ROOT `__tests__/` only — a test placed under `src/**/__tests__/` is
// silently UNCOLLECTED and reports nothing at all. That has bitten this repo three times, and a
// glob that matches nothing looks exactly like a suite that passes.
//
// THE CONTROL THIS FILE IS. `08196` is a known-answer case the previous guards passed cleanly on:
// INE 08196 = Sant Andreu de la Barca (inside the AMB extent, WITH published polygons) while DGC
// 08196 = Sant Andreu de Llavaneres (~40 km away, not in the AMB). Both are Barcelona province, so
// a province-prefix check passes too. A guard that passes on a known collision is not a guard.

import { describe, it, expect } from 'vitest';
import {
    parseIneCode,
    parseDgcCode,
    ineCodeLiteral,
    dgcCodeLiteral,
    isKnownCollidingMunicipalCode,
    crosswalkMunicipalCode,
    ES_MUNICIPAL_CODE_COLLISIONS,
    type IneCode,
    type DgcCode,
} from '../src/index.js';

describe('§ES-MUNICIPAL-CODE — the two vocabularies are TYPE-DISTINGUISHED', () => {
    it('parses five digits in either vocabulary, and refuses anything else', () => {
        expect(parseIneCode('08019')).toBe('08019');
        expect(parseDgcCode('08019')).toBe('08019');
        for (const bad of ['8019', '080199', 'ES08019', '', '  08019', '0801a', null, undefined, 8019]) {
            expect(parseIneCode(bad), `INE ${String(bad)}`).toBeNull();
            expect(parseDgcCode(bad), `DGC ${String(bad)}`).toBeNull();
        }
    });

    it('a literal is validated at load — a typo in committed source THROWS, it does not degrade', () => {
        expect(() => ineCodeLiteral('0801')).toThrow(/five-digit INE/);
        expect(() => dgcCodeLiteral('nope')).toThrow(/five-digit DGC/);
        expect(ineCodeLiteral('08019')).toBe('08019');
    });

    it('⛔ the BRAND is what stops a DGC code reaching an INE slot — a compile-time guarantee', () => {
        // This is the half `tsc` enforces and no runtime check can: both values are the string
        // "08196", so NOTHING at runtime can tell them apart. The proof is that the assignments
        // below only typecheck in the direction the brand allows.
        const ine: IneCode = ineCodeLiteral('08196');
        const dgc: DgcCode = dgcCodeLiteral('08196');
        expect(ine).toBe(dgc); // same digits — indistinguishable at runtime, which IS the defect
        // @ts-expect-error a DgcCode is NOT assignable to an IneCode. If this line ever stops
        // erroring, the vocabulary boundary has been erased and 08196 can cross it again.
        const leaked: IneCode = dgc;
        expect(leaked).toBe('08196');
        // @ts-expect-error and a bare string is assignable to neither — the entry point must state
        // which vocabulary it is reading.
        const bare: IneCode = '08019';
        expect(bare).toBe('08019');
    });
});

describe('§ES-CODE-COLLISIONS — the known-answer controls', () => {
    it('08196 is registered, with BOTH municipalities named', () => {
        const hit = ES_MUNICIPAL_CODE_COLLISIONS.find((c) => c.code === '08196');
        expect(hit, '08196 must be a registered collision — the guards passed cleanly on it').toBeDefined();
        expect(hit!.ineMunicipality).toBe('Sant Andreu de la Barca');
        expect(hit!.dgcMunicipality).toBe('Sant Andreu de Llavaneres');
        // The hazard is recorded, not implied — this is the record of WHY it is dangerous here.
        expect(hit!.hazard.length).toBeGreaterThan(60);
    });

    it('46250 is registered — DGC Turís vs INE València, a shipped PRYZM jurisdiction', () => {
        const hit = ES_MUNICIPAL_CODE_COLLISIONS.find((c) => c.code === '46250');
        expect(hit).toBeDefined();
        expect(hit!.ineMunicipality).toBe('València');
        expect(hit!.dgcMunicipality).toBe('Turís');
    });

    it('every registered collision names two DIFFERENT municipalities', () => {
        // A row where the two names agree would not be a collision, and its presence would dilute
        // the register into documentation.
        for (const c of ES_MUNICIPAL_CODE_COLLISIONS) {
            expect(c.ineMunicipality, c.code).not.toBe(c.dgcMunicipality);
            expect(/^\d{5}$/.test(c.code), c.code).toBe(true);
        }
    });

    it('isKnownCollidingMunicipalCode answers for the register and only the register', () => {
        expect(isKnownCollidingMunicipalCode('08196')).toBe(true);
        expect(isKnownCollidingMunicipalCode('46250')).toBe(true);
        // ⚠ `false` means NOT MEASURED, never "measured to agree" — see the crosswalk test below,
        // which refuses on 08019 too.
        expect(isKnownCollidingMunicipalCode('08019')).toBe(false);
    });
});

describe('§ES-VOCABULARY-BOUNDARY — the crosswalk REFUSES rather than guessing', () => {
    it('⛔ a colliding code refuses `ambiguous-collision`, naming both municipalities', () => {
        const r = crosswalkMunicipalCode('08196', 'dgc', 'ine');
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('ambiguous-collision');
        expect(r.detail).toContain('Sant Andreu de la Barca');
        expect(r.detail).toContain('Sant Andreu de Llavaneres');
    });

    it('⛔ a NON-colliding code ALSO refuses — "the digits usually match" is not a crosswalk', () => {
        // This is the test that stops a future author turning the crosswalk into an identity
        // function on the grounds that it "works for Barcelona". PRYZM holds no INE↔DGC table.
        const r = crosswalkMunicipalCode('08019', 'ine', 'dgc');
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('no-crosswalk-held');
        expect(r.detail).toMatch(/absence of a MEASUREMENT/);
    });

    it('a malformed code refuses `malformed-code`, distinctly from the other two', () => {
        const r = crosswalkMunicipalCode('81', 'ine', 'dgc');
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.reason).toBe('malformed-code');
    });

    it('the ONE safe identity is same-vocabulary → same-vocabulary (no boundary is crossed)', () => {
        const r = crosswalkMunicipalCode('08196', 'ine', 'ine');
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.code).toBe('08196');
    });

    it('⛔ NO conversion direction ever succeeds across the boundary, for ANY registered collision', () => {
        // The register is a control: if a future crosswalk lands, these must be the codes it is
        // tested hardest on, not the ones it quietly passes through.
        for (const c of ES_MUNICIPAL_CODE_COLLISIONS) {
            for (const [from, to] of [
                ['ine', 'dgc'],
                ['dgc', 'ine'],
            ] as const) {
                const r = crosswalkMunicipalCode(c.code, from, to);
                expect(r.ok, `${c.code} ${from}→${to} must refuse`).toBe(false);
                if (!r.ok) expect(r.reason).toBe('ambiguous-collision');
            }
        }
    });
});
