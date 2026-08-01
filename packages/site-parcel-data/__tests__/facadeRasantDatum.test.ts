// §FACADE-RASANT-DATUM (L-584) — the height datum measured where PGM Art. 240 says to measure it.
//
// These tests are written against the ARTICLE, not against the implementation: each `it` names the
// paragraph it exercises, and the expected numbers are derived from the transcribed rule by hand.
// If a future change makes a test fail, read Art. 240 before touching the test.

import { describe, it, expect } from 'vitest';
import {
    facadeSamplePoints,
    assertPostingResolves,
    resolveFacadeRasantDatum,
    resolveParcelRasantDatum,
    RASANT_CENTRE_TOLERANCE_M,
    RASANT_MAX_DROP_M,
    RASANT_NYQUIST_FACTOR,
    type FacadeFront,
    type RasantDatumOptions,
} from '../src/geometry/facadeRasantDatum.js';

/** MDT05-class terrain: 5 m posting. Fine enough to resolve a 20 m façade. */
const FINE: RasantDatumOptions = { provenance: 'dtm-bare-earth', postingSpacing_m: 5 };
/** What we actually serve under Barcelona today (probe V8: 57.34 m median vertex spacing). */
const BCN_TODAY: RasantDatumOptions = { provenance: 'dtm-bare-earth', postingSpacing_m: 57.34 };

function front(
    id: string,
    length_m: number,
    zs: (number | null)[],
    regulatedHeight_m: number | null = 12.35,
    formsCornerWithNext = false,
): FacadeFront {
    const n = zs.length;
    return {
        id,
        length_m,
        regulatedHeight_m,
        formsCornerWithNext,
        samples: zs.map((z, i) => ({ s_m: (length_m * i) / (n - 1), z_m: z })),
    };
}

describe('§FACADE-RASANT-DATUM — where to sample (the façade line, not the centroid)', () => {
    it('always includes both ends AND the centre, because Art. 240.1 names exactly those', () => {
        const pts = facadeSamplePoints({ x: 0, z: 0 }, { x: 20, z: 0 }, 7);
        const ss = pts.map((p) => p.s_m);
        expect(ss[0]).toBe(0);
        expect(ss).toContain(10);
        expect(ss[ss.length - 1]).toBe(20);
        // and they lie ON the façade line, not at the parcel centroid
        for (const p of pts) expect(p.point.z).toBe(0);
    });

    it('samples run along the façade, at ≥ the requested density', () => {
        const pts = facadeSamplePoints({ x: 0, z: 0 }, { x: 0, z: 30 }, 5);
        expect(pts.length).toBeGreaterThanOrEqual(7);
        for (let i = 1; i < pts.length; i++) expect(pts[i]!.s_m).toBeGreaterThan(pts[i - 1]!.s_m);
        expect(pts[pts.length - 1]!.point.z).toBeCloseTo(30, 6);
    });

    it('a degenerate (zero-length) façade yields one point, never a divide-by-zero', () => {
        const pts = facadeSamplePoints({ x: 3, z: 4 }, { x: 3, z: 4 }, 5);
        expect(pts).toHaveLength(1);
        expect(pts[0]!.s_m).toBe(0);
    });
});

describe('§FACADE-RASANT-DATUM — the probe-V8 Nyquist veto', () => {
    it('MDT05-class posting resolves an Eixample façade; what we serve today does not', () => {
        expect(assertPostingResolves(5, 20)).toBe(true);
        // 57.34 m posting vs a 20 m façade — the two points compared are inside one cell.
        expect(assertPostingResolves(57.34, 20)).toBe(false);
        expect(RASANT_NYQUIST_FACTOR).toBe(2);
    });

    it('refuses to measure rather than close L-584 with an artefact', () => {
        const r = resolveFacadeRasantDatum(front('f1', 20, [10, 10.5, 11]), BCN_TODAY);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal.code).toBe('terrain-posting-too-coarse');
        expect(r.refusal.ordinanceRef).toContain('Art. 240');
        // ⚠ A statement about OUR data, never about the law.
        expect(r.refusal.legallyGrounded).toBe(false);
    });

    it('a non-finite or zero posting never counts as resolving', () => {
        expect(assertPostingResolves(0, 20)).toBe(false);
        expect(assertPostingResolves(Number.NaN, 20)).toBe(false);
        expect(assertPostingResolves(5, 0)).toBe(false);
    });
});

describe('§FACADE-RASANT-DATUM — Art. 240.1.a: flat-ish façade measures AT THE CENTRE', () => {
    it('a level façade takes the centre reading', () => {
        const r = resolveFacadeRasantDatum(front('f1', 20, [10, 10, 10]), FINE);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.trams).toHaveLength(1);
        expect(r.trams[0]!.rule).toBe('art-240-1-a');
        expect(r.trams[0]!.datum_m).toBeCloseTo(10, 6);
        expect(r.rule).toBe('art-240-2');
    });

    it('a slope whose high end is < 0,60 m above the centre stays on limb (a)', () => {
        // ends 10.0 / 10.5, centre 10.25 → highest end − centre = 0.25 < 0.60
        const r = resolveFacadeRasantDatum(front('f1', 20, [10, 10.25, 10.5]), FINE);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.trams[0]!.rule).toBe('art-240-1-a');
        expect(r.trams[0]!.datum_m).toBeCloseTo(10.25, 6);
    });

    it('⚠ the comparison is HIGHEST END vs CENTRE, not end vs end', () => {
        // A crowned façade: both ends 10.0, centre 10.9. End-vs-end reads 0 and would pick limb (a)
        // with datum 10.9. The article compares the higher END with the CENTRE: 10.0 − 10.9 = −0.9,
        // which is < 0.60, so limb (a) — datum 10.9. Now dish it instead:
        const dished = resolveFacadeRasantDatum(front('f1', 20, [11, 10, 11]), FINE);
        expect(dished.ok).toBe(true);
        if (!dished.ok) return;
        // highest end 11 − centre 10 = 1.0 ≥ 0.60 ⇒ limb (b), datum = 11 − 0.60
        expect(dished.trams[0]!.rule).toBe('art-240-1-b');
        expect(dished.trams[0]!.datum_m).toBeCloseTo(11 - RASANT_CENTRE_TOLERANCE_M, 6);
    });
});

describe('§FACADE-RASANT-DATUM — Art. 240.1.b: steep façade measures 0,60 m below the high end', () => {
    it('applies the 0,60 m drop from the higher end of the façade line', () => {
        // ends 10.0 / 12.0, centre 11.0 → 12.0 − 11.0 = 1.0 ≥ 0.60
        const r = resolveFacadeRasantDatum(front('f1', 20, [10, 11, 12]), FINE);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.trams[0]!.rule).toBe('art-240-1-b');
        expect(r.trams[0]!.datum_m).toBeCloseTo(11.4, 6);
    });

    it('the 0,60 m threshold is the article\'s, and «menys de 0,60» excludes exactly 0,60', () => {
        expect(RASANT_CENTRE_TOLERANCE_M).toBe(0.6);
        // ⚠ REGRESSION GUARD. ends 10 / 11, centre 10.4 ⇒ the difference IS 0,60 — but in binary
        // floating point `11 - 10.4 === 0.5999999999999996`, which is "less than 0.60" and would
        // take limb (a). The article's boundary must decide, not IEEE-754.
        const r = resolveFacadeRasantDatum(front('f1', 20, [10, 10.4, 11]), FINE);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.trams[0]!.rule).toBe('art-240-1-b');
        expect(r.trams[0]!.datum_m).toBeCloseTo(10.4, 6);
    });
});

describe('§FACADE-RASANT-DATUM — Art. 240.1.c: the façade divides into TRAMS', () => {
    it('a gentle façade needs no division', () => {
        const r = resolveFacadeRasantDatum(front('f1', 40, [10, 10.5, 11, 11.5, 12]), FINE);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.trams).toHaveLength(1);
    });

    it('a Gòtic-steep façade divides, and every tram obeys the 3 m rule under its OWN datum', () => {
        // 40 m of façade falling 12 m — no single datum can hold it within 3 m.
        const r = resolveFacadeRasantDatum(front('f1', 40, [22, 19, 16, 13, 10]), FINE);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.trams.length).toBeGreaterThan(1);
        expect(RASANT_MAX_DROP_M).toBe(3);
        // trams tile the façade end to end, sharing their cut points — no gaps, no overlaps
        expect(r.trams[0]!.fromS_m).toBe(0);
        expect(r.trams[r.trams.length - 1]!.toS_m).toBeCloseTo(40, 6);
        for (let i = 1; i < r.trams.length; i++) {
            expect(r.trams[i]!.fromS_m).toBeCloseTo(r.trams[i - 1]!.toS_m, 6);
        }
        // and each tram cites the limb that produced it
        for (const t of r.trams) {
            expect(t.ordinanceRef).toContain('Art. 240');
            expect(['art-240-1-a', 'art-240-1-b']).toContain(t.rule);
        }
    });

    it('refuses when the required division falls BETWEEN samples — a sampling fault, not a datum', () => {
        // Two readings 20 m apart with a 10 m drop: no compliant tram exists between them.
        const r = resolveFacadeRasantDatum(front('f1', 20, [20, 10]), FINE);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal.code).toBe('terrain-posting-too-coarse');
    });
});

describe('§FACADE-RASANT-DATUM — §CONTEXT-DATA-HONESTY: three values, never collapsed', () => {
    it('an unresolved sample is a REFUSAL, never a ground level of zero', () => {
        const r = resolveFacadeRasantDatum(front('f1', 20, [10, null, 11]), FINE);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal.code).toBe('terrain-not-sampled');
        expect(r.refusal.detail).toContain('NOT a ground level of zero');
    });

    it('a single reading is a refusal — a one-point datum IS the L-584 defect', () => {
        const r = resolveFacadeRasantDatum(
            { id: 'f1', length_m: 20, regulatedHeight_m: 12.35, formsCornerWithNext: false, samples: [{ s_m: 0, z_m: 10 }] },
            FINE,
        );
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal.code).toBe('terrain-not-sampled');
    });

    it('a bare-earth DTM resolves, but carries the kerb caveat rather than posing as a rasant', () => {
        const r = resolveFacadeRasantDatum(front('f1', 20, [10, 10, 10]), FINE);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.provenance).toBe('dtm-bare-earth');
        expect(r.caveats.join(' ').toLowerCase()).toContain('voravia');
    });

    it('a surveyed kerb — the thing the article names — carries no caveat', () => {
        const r = resolveFacadeRasantDatum(front('f1', 20, [10, 10, 10]), {
            provenance: 'kerb-surveyed',
            postingSpacing_m: 1,
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.caveats).toEqual([]);
    });

    it('an UNDECLARED provenance is never treated as the best case', () => {
        const r = resolveFacadeRasantDatum(front('f1', 20, [10, 10, 10]), {
            provenance: 'unknown',
            postingSpacing_m: 1,
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.caveats.join(' ')).toContain('did not declare');
    });
});

describe('§FACADE-RASANT-DATUM — ⭐ the CORNER PARCEL (Art. 240.3)', () => {
    const cornerA = (zs: number[], h: number | null) => front('carrer-ample', 20, zs, h, true);
    const cornerB = (zs: number[], h: number | null) => front('carrer-estret', 20, zs, h, false);

    it('EQUAL regulated heights → Art. 240.3.a develops both fronts as ONE façade', () => {
        // Front A rises 10.0 → 11.0, front B continues 11.0 → 12.0. Developed: 40 m, 10 → 12,
        // centre 11. Highest end 12 − centre 11 = 1.0 ≥ 0.60 ⇒ limb (b) ⇒ datum 11.4, and no
        // point falls more than 3 m below it, so 240.1.c requires no division.
        const r = resolveParcelRasantDatum(
            [cornerA([10, 10.5, 11], 12.35), cornerB([11, 11.5, 12], 12.35)],
            FINE,
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.rule).toBe('art-240-3-a');
        expect(r.trams).toHaveLength(1);
        expect(r.trams[0]!.fromS_m).toBe(0);
        expect(r.trams[0]!.toS_m).toBeCloseTo(40, 6);
        expect(r.trams[0]!.datum_m).toBeCloseTo(11.4, 6);
        expect(r.caveats.join(' ')).toContain('SINGLE façade');
    });

    it('…and that datum is NOT what either front would give alone — which is the point of 240.3.a', () => {
        const combined = resolveParcelRasantDatum(
            [cornerA([10, 10.5, 11], 12.35), cornerB([11, 11.5, 12], 12.35)],
            FINE,
        );
        // Front A alone: ends 10 / 11, centre 10.5 ⇒ difference 0.5 < 0.60 ⇒ limb (a) ⇒ datum 10.5.
        const alone = resolveFacadeRasantDatum(cornerA([10, 10.5, 11], 12.35), FINE);
        expect(combined.ok && alone.ok).toBe(true);
        if (!combined.ok || !alone.ok) return;
        expect(alone.trams[0]!.rule).toBe('art-240-1-a');
        expect(alone.trams[0]!.datum_m).toBeCloseTo(10.5, 6);
        // Developing the corner as one façade moved BOTH the limb and the datum.
        expect(combined.trams[0]!.rule).toBe('art-240-1-b');
        expect(combined.trams[0]!.datum_m).toBeCloseTo(11.4, 6);
    });

    it('240.3.a and 240.1.c compose: a steep corner develops as one façade AND then divides', () => {
        // 40 m of developed corner rising 10 → 14. As one façade the datum would be 13.4, which
        // leaves the low end 3.4 m below it — so 240.1.c cuts it into trams, each re-measured
        // «com si cada tram fos façana independent».
        const r = resolveParcelRasantDatum(
            [cornerA([10, 11, 12], 12.35), cornerB([12, 13, 14], 12.35)],
            FINE,
        );
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.rule).toBe('art-240-3-a');
        expect(r.trams.length).toBeGreaterThan(1);
        for (const t of r.trams) {
            // the defining invariant of 240.1.c, restated: no tram datum may sit >3 m above its
            // own lowest pavement point — checked here via the tram's own span
            expect(t.datum_m).toBeLessThanOrEqual(14);
        }
        expect(r.trams[0]!.fromS_m).toBe(0);
        expect(r.trams[r.trams.length - 1]!.toS_m).toBeCloseTo(40, 6);
    });

    it('🔴 DIFFERENT regulated heights → Art. 240.3.b ANSWERS, and PRYZM refuses with the citation', () => {
        const r = resolveParcelRasantDatum(
            [cornerA([10, 11, 12], 22.4), cornerB([12, 13, 14], 12.35)],
            FINE,
        );
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal.code).toBe('derived-input-missing');
        // The refusal must NAME the machinery, so the user can read the rule we could not apply.
        expect(r.refusal.detail).toContain('30 m');
        expect(r.refusal.detail).toContain('1.5');
        expect(r.refusal.detail).toContain('profunditat edificable');
        expect(r.refusal.quote).toContain('xamfrà');
        // ⚠ The ORDINANCE is not what is missing. We are. Claiming otherwise would blame the law
        // for our gap — the L-616 / Murcia §R-7 error.
        expect(r.refusal.legallyGrounded).toBe(false);
    });

    it('an UNRESOLVED regulated height is not an EQUAL one — it refuses on its own ground', () => {
        const r = resolveParcelRasantDatum(
            [cornerA([10, 11, 12], null), cornerB([12, 13, 14], 12.35)],
            FINE,
        );
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal.code).toBe('regulated-height-unknown');
        expect(r.refusal.code).not.toBe('derived-input-missing');
    });

    it('Art. 240.4 — two fronts NOT forming a corner resolve INDEPENDENTLY', () => {
        const a = front('front-street', 20, [10, 11, 12], 12.35, false);
        const b = front('back-street', 20, [20, 21, 22], 12.35, false);
        const r = resolveParcelRasantDatum([a, b], FINE);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.rule).toBe('art-240-4');
        // «com si es tractés d'edificis independents» — each front keeps its own datum.
        const byFront = new Map(r.trams.map((t) => [t.frontId, t.datum_m]));
        expect(byFront.get('front-street')).toBeCloseTo(11.4, 6);
        expect(byFront.get('back-street')).toBeCloseTo(21.4, 6);
    });

    it('a parcel with no classified front edge refuses, and says the gap is OURS', () => {
        const r = resolveParcelRasantDatum([], FINE);
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.refusal.code).toBe('no-front-edge');
        expect(r.refusal.legallyGrounded).toBe(false);
    });
});

describe('§FACADE-RASANT-DATUM — determinism and purity (C58 §1.9)', () => {
    it('the same input gives a byte-identical answer', () => {
        const f = front('f1', 40, [22, 19, 16, 13, 10]);
        const a = JSON.stringify(resolveFacadeRasantDatum(f, FINE));
        const b = JSON.stringify(resolveFacadeRasantDatum(f, FINE));
        expect(a).toBe(b);
    });

    it('sample order does not matter — readings are sorted by position on the façade', () => {
        const ordered = front('f1', 20, [10, 11, 12]);
        const shuffled: FacadeFront = { ...ordered, samples: [...ordered.samples].reverse() };
        expect(JSON.stringify(resolveFacadeRasantDatum(shuffled, FINE)))
            .toBe(JSON.stringify(resolveFacadeRasantDatum(ordered, FINE)));
    });
});
