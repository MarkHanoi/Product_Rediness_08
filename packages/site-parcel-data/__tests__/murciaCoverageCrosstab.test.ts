// §MURCIA-CROSSTAB — the measurement that turned "≤ 33.0 %" into a point value, PINNED.
//
// WHAT THIS FILE DEFENDS
// ----------------------
// `tools/murcia-coverage-crosstab/` measures how much of Murcia's private buildable land a signed
// `MURCIA_ENVELOPE_VERIFIED` would actually render. To do that it must mirror two things from the
// shipping code: the exact calificación allow-list `resolveMurciaPgouZone` answers for, and the
// ámbito prefixes `murciaEnvelopeDisposition` treats as remitted.
//
// ⚠ A MIRROR THAT DRIFTS IS WORSE THAN NO MIRROR — it publishes a coverage figure for code that no
// longer exists. These tests fail the moment the pack or the disposition changes and the tool does
// not, which is the only way a measured number stays true after the measurement session ends.
//
// They also pin the MEASUREMENT ITSELF against the committed `out-crosstab.json`, so the numbers
// quoted in `RATE.md` §CLOSURE cannot be edited in the prose without the artefact disagreeing.
//
// ⚠ NOTHING HERE AUTHORISES ANYTHING. `MURCIA_ENVELOPE_VERIFIED` stays `false` and a test below
// pins that too. Measuring what a signature WOULD render is not signing.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
    MURCIA_PGOU2012_ZONE_CODES,
    MURCIA_PGOU2012_VARIANT_ZONE_CODES,
} from '../src/rulepacks/esMurciaPgou2012.js';
import { REMITTED_AMBITO_PREFIXES } from '../src/providers/murciaZoningProvider.js';
import { MURCIA_ENVELOPE_VERIFIED } from '../src/rulepacks/esMurciaEnvelope.js';

const TOOL = new URL('../../../tools/murcia-coverage-crosstab/', import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const classify: any = await import(new URL('classify.mjs', TOOL).href);

interface CrosstabOut {
    ok: boolean;
    asOf: string;
    denominator: { privateBuildable_Mm2: number; polygons: number };
    honesty: { unjoinedShareOfBuildable_pct: number; notInForcePolygons: number; sectorClaseConflicts: number };
    delegationSplit: {
        pgouDirect_Mm2: number; pgouDirect_pct: number;
        delegated_Mm2: number; delegated_pct: number;
        byGround: Record<string, { pct: number; article: string }>;
    };
    intersection: {
        packedByCode_pct: number;
        packedAndDirect_Mm2: number; packedAndDirect_pct: number;
        packedButDelegated_pct: number;
        firmFloorExcludingInterimRL_Mm2: number; firmFloorExcludingInterimRL_pct: number;
    };
    shippingBehaviour: {
        wouldRenderOnSignature_pct: number;
        ofWhichOnLegallyDelegatedLand_pct: number;
        ofWhichOnLegallyDelegatedLand_byGround: Record<string, { pct: number; article: string }>;
    };
    byFamily: { family: string; class: string; shareOfBuildable_pct: number }[];
}

const OUT: CrosstabOut = JSON.parse(
    readFileSync(fileURLToPath(new URL('out-crosstab.json', TOOL)), 'utf8'),
);

describe('§MURCIA-CROSSTAB — the tool mirrors the shipping code', () => {
    it('CODE_PACKED_EXACT is exactly the pack allow-list + its two registered variants', () => {
        // ⚠ If a 15th calificación is transcribed, this fails until the tool is re-run. That is the
        // point: a new zone changes the coverage number and the number must be RE-MEASURED, never
        // extrapolated.
        expect([...classify.CODE_PACKED_EXACT].sort()).toEqual(
            [...MURCIA_PGOU2012_ZONE_CODES, ...MURCIA_PGOU2012_VARIANT_ZONE_CODES].sort(),
        );
    });

    it('PACKED_FAMILIES is exactly the 14 transcribed calificaciones', () => {
        expect([...classify.PACKED_FAMILIES].sort()).toEqual([...MURCIA_PGOU2012_ZONE_CODES].sort());
        expect(classify.PACKED_FAMILIES).toHaveLength(14);
    });

    it('CODE_REMITTED_PREFIXES mirrors REMITTED_AMBITO_PREFIXES verbatim', () => {
        expect([...classify.CODE_REMITTED_PREFIXES].sort()).toEqual([...REMITTED_AMBITO_PREFIXES].sort());
    });

    it('the LEGAL delegating set is a STRICT SUPERSET of the one the disposition branches on', () => {
        // This asymmetry is not an accident to be tidied away — it is the defect §MURCIA-CROSSTAB
        // measured. Every prefix the disposition knows must be legally delegating…
        for (const p of REMITTED_AMBITO_PREFIXES) {
            expect(classify.DELEGATING_AMBITO_PREFIXES).toContain(p);
        }
        // …and the legal set must be strictly larger (UE = Unidad de Actuación, UD = Estudio de
        // Detalle), or the measured over-publication finding would be stale.
        expect(classify.DELEGATING_AMBITO_PREFIXES.length).toBeGreaterThan(REMITTED_AMBITO_PREFIXES.length);
        expect(classify.DELEGATING_AMBITO_PREFIXES).toContain('UE');
        expect(classify.DELEGATING_AMBITO_PREFIXES).toContain('UD');
    });

    it('the denominator families are disjoint and every packed family is buildable', () => {
        const all: string[] = classify.BUILDABLE_FAMILIES;
        expect(new Set(all).size).toBe(all.length);
        for (const f of classify.PACKED_FAMILIES) expect(all).toContain(f);
        // A packed code is NEVER genérica and NEVER remitida — packing one would be transcribing an
        // ordinance the plan says does not fix the parameters.
        for (const f of classify.PACKED_FAMILIES) {
            expect(classify.GENERICA_FAMILIES).not.toContain(f);
            expect(classify.REMITTED_FAMILIES).not.toContain(f);
        }
    });
});

describe('§MURCIA-CROSSTAB — family assignment', () => {
    it('longest prefix wins, so RD1 variants never fall into RD', () => {
        expect(classify.calificacionFamily('RD1')).toBe('RD1');
        expect(classify.calificacionFamily('RD1-A')).toBe('RD1');
        expect(classify.calificacionFamily('RD')).toBe('RD');
        expect(classify.calificacionFamily('RD-EG1')).toBe('RD');
        expect(classify.calificacionFamily('RM1')).toBe('RM1');
        expect(classify.calificacionFamily('RM-SS1-1')).toBe('RM');
    });

    it('separators typed by hand are normalised before matching', () => {
        expect(classify.calificacionFamily('IC - AB1- 2')).toBe('IC');
        expect(classify.calificacionFamily('  ix-vj2  ')).toBe('IX');
    });

    it('public land is NOT in the buildable denominator (L-656)', () => {
        // Forest, open space, infrastructure and public facilities are not private buildable plots.
        for (const code of ['NF', 'FV', 'EV', 'EW', 'DE', 'EE', 'EG', 'EF', 'BA', 'CT', 'EH', 'RO']) {
            expect(classify.calificacionFamily(code)).toBeNull();
        }
    });

    it('an empty or absent calificación is null, never a family', () => {
        expect(classify.calificacionFamily(null)).toBeNull();
        expect(classify.calificacionFamily('')).toBeNull();
        expect(classify.calificacionFamily(undefined)).toBeNull();
    });
});

describe('§MURCIA-CROSSTAB — the delegation test carries its article', () => {
    it('a genérica code is delegated wherever it sits — Arts. 5.25.3.3 / 5.26.3.3', () => {
        expect(classify.delegationGround('RX', 'U', 'Urbano')).toBe('calificacion-generica');
    });

    it('a packed code inside a delegating ámbito STILL refuses — the order is load-bearing', () => {
        expect(classify.delegationGround('RM1', 'PERI', 'Urbano')).toBe('ambito-delegante');
        expect(classify.delegationGround('IX', 'UD', 'Urbano')).toBe('ambito-delegante');
    });

    it('a packed code on urbanizable land is delegated to a Plan Parcial — Art. 6.2.2.3', () => {
        expect(classify.delegationGround('IX', 'ZU', 'Urbanizable')).toBe('clase-urbanizable');
        expect(classify.isUrbanizable('Urbanizable')).toBe(true);
        // ⚠ "No Urbanizable" is not urbanizable. A substring test would invert the answer.
        expect(classify.isUrbanizable('No Urbanizable')).toBe(false);
    });

    it('a packed code on PGOU-direct urban land is NOT delegated', () => {
        expect(classify.delegationGround('RL', 'U', 'Urbano')).toBeNull();
    });

    it('UNJOINED (clase === undefined) is never silently treated as urbanizable', () => {
        // §CONTEXT-DATA-HONESTY: a failure, a genuine empty and an unjoined value are three values.
        expect(classify.delegationGround('RL', 'U', undefined)).toBeNull();
        expect(classify.delegationGround('RL', 'ZU', undefined)).toBeNull();
    });
});

describe('§MURCIA-CROSSTAB — the committed measurement', () => {
    it('reproduces the published baseline, which is what makes the new number credible', () => {
        // Every one of these was published BEFORE this tool existed
        // (`findings/MURCIA-DERIVED-PLAN-SPLIT-RESOLVED.md` §3b, `ENVELOPE.md` §2). Reproducing
        // them from the live layers is the tool's own correctness proof.
        expect(OUT.ok).toBe(true);
        expect(OUT.denominator.privateBuildable_Mm2).toBeCloseTo(75.145, 2);
        expect(OUT.delegationSplit.pgouDirect_Mm2).toBeCloseTo(24.8, 2);
        expect(OUT.delegationSplit.pgouDirect_pct).toBeCloseTo(33.0, 1);
        expect(OUT.delegationSplit.delegated_pct).toBeCloseTo(67.0, 1);
        // join rate 99.74 % ⇒ 0.26 % unjoined
        expect(OUT.honesty.unjoinedShareOfBuildable_pct).toBeCloseTo(0.26, 1);
        expect(OUT.honesty.sectorClaseConflicts).toBe(0);
        // the four delegation grounds, each within 0.1 pp of the published split
        expect(OUT.delegationSplit.byGround['calificacion-generica']!.pct).toBeCloseTo(30.2, 1);
        expect(OUT.delegationSplit.byGround['clase-urbanizable']!.pct).toBeCloseTo(20.5, 1);
        expect(OUT.delegationSplit.byGround['calificacion-remitida']!.pct).toBeCloseTo(11.2, 1);
        expect(OUT.delegationSplit.byGround['ambito-delegante']!.pct).toBeCloseTo(5.1, 1);
    });

    it('the CROSS-TAB point value replaces the "≤ 33.0 %" bound', () => {
        // ⭐ THE NUMBER. packed calificación ∧ NOT delegated.
        expect(OUT.intersection.packedAndDirect_pct).toBeCloseTo(23.51, 1);
        expect(OUT.intersection.packedAndDirect_Mm2).toBeCloseTo(17.663, 2);
        // It must respect the bound it replaces, and be strictly inside it.
        expect(OUT.intersection.packedAndDirect_pct).toBeLessThan(OUT.delegationSplit.pgouDirect_pct);
        // …and be strictly below the by-code share, because the delegation test bites.
        expect(OUT.intersection.packedAndDirect_pct).toBeLessThan(OUT.intersection.packedByCode_pct);
    });

    it('the FIRM FLOOR is 6.97 %, NOT the 16.5 % previously published', () => {
        // The old 16.5 % was `33.0 − 16.53(RL)`, which silently counted the REFUSED-but-direct
        // codes (RB, RC, RM, RN, RT, RU, MZ, MX) as if a signature would render them. It never
        // would: they are refused on a CONSTRUCTED or UNKNOWN parameter, not on a signature.
        expect(OUT.intersection.firmFloorExcludingInterimRL_pct).toBeCloseTo(6.97, 1);
        expect(OUT.intersection.firmFloorExcludingInterimRL_pct).toBeLessThan(16.5);
        // RL is the whole difference and every square metre of it is PGOU-direct.
        const rl = OUT.byFamily.find((r) => r.family === 'RL')!;
        expect(rl.shareOfBuildable_pct).toBeCloseTo(16.53, 1);
        expect(
            OUT.intersection.packedAndDirect_pct - OUT.intersection.firmFloorExcludingInterimRL_pct,
        ).toBeCloseTo(rl.shareOfBuildable_pct, 1);
    });

    it('⚠ pins the OVER-PUBLICATION gap so it cannot go quiet', () => {
        // The shipping disposition tests only `REMITTED_AMBITO_PREFIXES`. It applies NO
        // clase-de-suelo test and does not know UE / UD / P*. So on the day BOTH gates open it
        // would publish a general-plan number on land Arts. 6.2.2.3 / 5.25 / 5.26 delegate.
        expect(OUT.shippingBehaviour.wouldRenderOnSignature_pct).toBeCloseTo(36.59, 1);
        // ⚠⚠ It EXCEEDS the 33.0 % legal ceiling. That is the finding.
        expect(OUT.shippingBehaviour.wouldRenderOnSignature_pct).toBeGreaterThan(
            OUT.delegationSplit.pgouDirect_pct,
        );
        expect(OUT.shippingBehaviour.ofWhichOnLegallyDelegatedLand_pct).toBeCloseTo(13.09, 1);
        const g = OUT.shippingBehaviour.ofWhichOnLegallyDelegatedLand_byGround;
        expect(g['clase-urbanizable']!.article).toBe('Art. 6.2.2.3');
        expect(g['clase-urbanizable']!.pct).toBeCloseTo(10.64, 1);
        expect(g['ambito-delegante']!.pct).toBeCloseTo(2.45, 1);
    });

    it('MEASURING IS NOT AUTHORISING — the gate is still shut', () => {
        expect(MURCIA_ENVELOPE_VERIFIED).toBe(false);
    });
});
