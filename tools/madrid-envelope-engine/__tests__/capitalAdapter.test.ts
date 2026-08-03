// CAPITAL ADAPTER TESTS — the floorspace determination, and the envelope refusal that always
// accompanies it.
//
// ⭐ The rows exercised here are REAL attribute shapes from
// `ANALISIS_URBANO/Visor_Edificabilidad_enero_2026/MapServer/14`, read live 2026-08-02 and quoted
// in `capitalAdapter.ts`'s header with their census counts.

import { describe, it, expect } from 'vitest';
import {
    adaptCapitalRow, classifyCapitalUnit, isPlanSourced, CAPITAL_MEASURED_2026_08_02,
} from '../capitalAdapter';

/** A real NZ-1.3 row from Barrio de Salamanca, verified by spatial round-trip on 2026-08-02. */
const salamanca = {
    OBJECTID: 1, UBOV_TX_ET: 'A05459', USP_TX_DEN: 'RESIDENCIAL VIVIENDA COLECTIVA',
    UUBV_NM_ED: 7164, UNI_TX_DEN: 'm² Est', AMB_TX_ETI: '1.3', 'Shape.STArea()': 4102.5,
};
/** A real APR row — UVA DE HORTALEZA, the development-instrument case. */
const hortaleza = {
    OBJECTID: 2, UBOV_TX_ET: 'R21-T', USP_TX_DEN: 'RESIDENCIAL VIVIENDA COLECTIVA',
    UUBV_NM_ED: 3638, UNI_TX_DEN: 'm² Plan', AMB_TX_ETI: 'APR.16.04',
    AMB_TX_DEN: 'UVA DE HORTALEZA', 'Shape.STArea()': 780.8,
};

describe('classifyCapitalUnit — the provenance column', () => {
    it('classifies all six observed tokens', () => {
        expect(classifyCapitalUnit('m² Plan')).toBe('floorspace-m2-plan');
        expect(classifyCapitalUnit('m²/m² Plan')).toBe('plot-ratio-plan');
        expect(classifyCapitalUnit('m² Cat')).toBe('floorspace-m2-cadastral');
        expect(classifyCapitalUnit('m² Est')).toBe('floorspace-m2-estimated');
        expect(classifyCapitalUnit('m² Rev')).toBe('unknown-token');
        expect(classifyCapitalUnit('m² Libre')).toBe('unknown-token');
    });

    // ⛔ MUTATION: fuzzy matching (`.includes('Plan')`). A loose matcher would also accept a token
    // the publisher introduces later and means something else by — silently, on a cited number.
    it('does not accept a near-miss spelling', () => {
        for (const t of ['m2 Plan', 'M² PLAN', 'm² planificado', '', null, undefined]) {
            expect(classifyCapitalUnit(t)).toBe('unknown-token');
        }
    });

    // ⭐ ONLY TWO OF SIX ARE CITABLE — 41.48 % of rows. The other 57.7 % is what checking bought.
    it('marks only the two plan-sourced kinds as citable', () => {
        expect(isPlanSourced('floorspace-m2-plan')).toBe(true);
        expect(isPlanSourced('plot-ratio-plan')).toBe(true);
        expect(isPlanSourced('floorspace-m2-cadastral')).toBe(false);
        expect(isPlanSourced('floorspace-m2-estimated')).toBe(false);
        expect(isPlanSourced('unknown-token')).toBe(false);
    });
});

describe('adaptCapitalRow — provenance refusals', () => {
    // `m² Cat` is 42.47 % of rows: floorspace measured from the CADASTRE, i.e. what EXISTS.
    // Reading it as an allowance is ADR-0270's wrong-KIND error, the same shape as Murcia's RB/RU.
    it('refuses a cadastral-derived figure as EXISTING-derived, not as a low number', () => {
        const r = adaptCapitalRow({ ...salamanca, UNI_TX_DEN: 'm² Cat' });
        expect(r.refusals.some((x) => x.reason === 'value-is-existing-derived')).toBe(true);
        expect(r.buildableFloorspace_m2).toBeNull();
    });

    // `m² Est` is 15.14 %: the publisher's own estimate. It has no article behind it, so it cannot
    // be cited — and C58 §1.3 requires every published number to carry its citation.
    it('refuses the publisher\'s own estimate on the real Salamanca row', () => {
        const r = adaptCapitalRow(salamanca);
        expect(r.quantityKind).toBe('floorspace-m2-estimated');
        expect(r.refusals.some((x) => x.reason === 'value-is-publisher-estimate')).toBe(true);
        expect(r.buildableFloorspace_m2).toBeNull();
    });

    it('refuses an undocumented unit token rather than guessing the unit', () => {
        const r = adaptCapitalRow({ ...salamanca, AMB_TX_ETI: '1.3', UNI_TX_DEN: 'm² Rev' });
        expect(r.refusals.some((x) => x.reason === 'value-unit-undocumented')).toBe(true);
    });

    // 759 of 19,833 rows carry exactly 0. A stored zero on a buildability field is an absence.
    it('refuses a zero or negative quantity as UNKNOWN, never as "no buildability"', () => {
        for (const q of [0, -5, null]) {
            const r = adaptCapitalRow({ ...salamanca, UNI_TX_DEN: 'm² Plan', UUBV_NM_ED: q });
            expect(r.buildableFloorspace_m2).toBeNull();
            expect(r.refusals.some((x) => x.reason === 'required-parameter-unknown')).toBe(true);
        }
    });
});

describe('adaptCapitalRow — routing refusals', () => {
    // 40.29 % of the layer's rows route to a development instrument.
    it('refuses the real UVA DE HORTALEZA APR row even though its figure IS plan-sourced', () => {
        const r = adaptCapitalRow(hortaleza);
        expect(r.quantityKind).toBe('floorspace-m2-plan');
        const dev = r.refusals.find((x) => x.reason === 'development-ambito-governs');
        expect(dev).toBeDefined();
        expect(dev?.legallyGrounded).toBe(true);
        expect(dev?.headline).toContain('APR.16.04');
        expect(dev?.headline).toContain('UVA DE HORTALEZA');
        // ⛔ A GOOD NUMBER UNDER THE WRONG INSTRUMENT IS THE FAILURE THIS ADAPTER EXISTS TO STOP.
        expect(r.buildableFloorspace_m2).toBeNull();
    });

    it('refuses UZP and other development prefixes the same way', () => {
        for (const amb of ['UZP.2.01', 'UZPp.03.01-RP', 'APE.10.02']) {
            const r = adaptCapitalRow({ ...hortaleza, AMB_TX_ETI: amb });
            expect(r.refusals.some((x) => x.reason === 'development-ambito-governs')).toBe(true);
        }
    });

    it('refuses a missing planning reference rather than assuming the base plan', () => {
        const r = adaptCapitalRow({ ...hortaleza, AMB_TX_ETI: null });
        expect(r.refusals.some((x) => x.reason === 'routing-token-unrecognised')).toBe(true);
    });
});

describe('adaptCapitalRow — the SURVIVORS', () => {
    // 2,005 rows, 10.51 % of rows, 18.85 % of area. This is what the capital can actually say.
    it('computes an absolute floorspace from a plan-stated m² on a Norma-Zonal parcel', () => {
        const r = adaptCapitalRow({ ...hortaleza, AMB_TX_ETI: '8.4', UNI_TX_DEN: 'm² Plan', UUBV_NM_ED: 3638 });
        expect(r.buildableFloorspace_m2).toBe(3638);
        expect(r.floorspaceBasis).toBe('stated-by-plan');
    });

    it('computes floorspace from a plot ratio × the published parcel area, and says so', () => {
        const r = adaptCapitalRow({
            ...hortaleza, AMB_TX_ETI: '9.5', UNI_TX_DEN: 'm²/m² Plan',
            UUBV_NM_ED: 1.5, 'Shape.STArea()': 1000,
        });
        expect(r.buildableFloorspace_m2).toBe(1500);
        // ⚠ The basis names the denominator. L-656: state the denominator every time — the
        // *parcela urbanística* is not necessarily the cadastral parcel.
        expect(r.floorspaceBasis).toBe('plot-ratio × published parcel area');
    });

    it('refuses a plot ratio with no area rather than inventing a denominator', () => {
        const r = adaptCapitalRow({
            ...hortaleza, AMB_TX_ETI: '9.5', UNI_TX_DEN: 'm²/m² Plan',
            UUBV_NM_ED: 1.5, 'Shape.STArea()': null,
        });
        expect(r.buildableFloorspace_m2).toBeNull();
        expect(r.floorspaceBasis).toBeNull();
    });
});

describe('⛔ THE ENVELOPE IS ALWAYS REFUSED — a floorspace cap is not a solid', () => {
    // No height exists in 24,718 municipal fields, and 8.86 % on the regional layer. Drawing one
    // would require inventing a storey height, which is the L-616 fabrication verbatim.
    it('refuses the envelope even on a perfect survivor row', () => {
        const r = adaptCapitalRow({ ...hortaleza, AMB_TX_ETI: '8.4', UNI_TX_DEN: 'm² Plan' });
        expect(r.buildableFloorspace_m2).toBe(3638);   // the floorspace IS published
        expect(r.envelopeRefused).toBe(true);           // ⛔ and the volume is NOT
        expect(r.refusals.some((x) => /no maximum height or storey count/i.test(x.headline))).toBe(true);
    });

    it('refuses the envelope on every row, whatever else is true', () => {
        for (const row of [salamanca, hortaleza, { ...hortaleza, AMB_TX_ETI: '8.4' }]) {
            const r = adaptCapitalRow(row);
            expect(r.envelopeRefused).toBe(true);
            expect(r.refusals.length).toBeGreaterThan(0);
        }
    });

    it('cites source, dataset and fields on every determination', () => {
        const p = adaptCapitalRow(hortaleza).provenance;
        expect(p.source).toContain('sigma.madrid.es');
        expect(p.dataset).toContain('Visor_Edificabilidad_enero_2026');
        expect(p.document).toContain('PGOUM-97');
        expect(p.fields).toContain('UUBV_NM_ED');
        expect(p.fields).toContain('UNI_TX_DEN');
    });
});

describe('determinism', () => {
    it('adapts the same capital row identically twice', () => {
        for (const row of [salamanca, hortaleza]) {
            expect(JSON.stringify(adaptCapitalRow(row))).toBe(JSON.stringify(adaptCapitalRow(row)));
        }
    });
});

describe('CAPITAL_MEASURED_2026_08_02 — the record cannot drift from the probe', () => {
    it('pins the joint survivor count and the two refusal rates', () => {
        const m = CAPITAL_MEASURED_2026_08_02;
        expect(m.survivorRows).toBe(2005);
        expect(m.survivorPctOfRows).toBeCloseTo(10.51, 2);
        expect(m.survivorPctOfArea).toBeCloseTo(18.85, 2);
        expect(m.refusedRoutingPct).toBeCloseTo(40.48, 2);
        expect(m.refusedProvenancePct).toBeCloseTo(49.0, 2);
    });

    // ⭐ THE HEADLINE. Not a placeholder — the measured consequence of having no height.
    it('pins the drawable-envelope share at exactly zero', () => {
        expect(CAPITAL_MEASURED_2026_08_02.drawableEnvelopePct).toBe(0);
    });

    // ⛔ The census that closed hypothesis (a): 24,718 fields, zero depth and zero setback hits.
    it('pins the municipal field sweep that refuted the "richer municipal service" hypothesis', () => {
        const s = CAPITAL_MEASURED_2026_08_02.municipalFieldSweep;
        expect(s.fields).toBe(24718);
        expect(s.services).toBe(447);
        expect(s.depthFieldHits).toBe(0);
        expect(s.setbackFieldHits).toBe(0);
        expect(s.planningHeightFieldHits).toBe(0);
        // Access-gated services are UNKNOWN, never counted as absence (L-422/457/467/469).
        expect(s.accessGatedServices).toBeGreaterThan(0);
    });

    // ⚠ The marginals must NOT be multiplied — the provenance classes are not evenly spread across
    // ámbitos. This asserts the joint count is genuinely different from the product.
    it('shows the joint count is not the product of the marginals', () => {
        const m = CAPITAL_MEASURED_2026_08_02;
        const naive = (m.routing.normaZonalPct / 100)
            * ((m.provenance.planAbsolutePct + m.provenance.planRatioPct) / 100) * 100;
        expect(Math.abs(naive - m.survivorPctOfRows)).toBeGreaterThan(5);
    });
});
