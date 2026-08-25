// C108 §6 (brief §19) — the synthetic corpus, asserted against KNOWN GROUND TRUTH.
//
// ⛔ THE RULE THIS FILE OBEYS (C108 §6.2):
//
//     "no error thrown", "the array is non-empty" and "a facade was produced" are
//     NOT assertions and may not be added to this corpus.
//
// Every `expect` below compares a COMPUTED NUMBER to a number the generator DREW.
// That is the whole point: the founder's photograph is not in this repository
// (C108 §0.2, L-11001), so ground truth is the only oracle available, and a test
// that merely runs the pipeline proves nothing about it.

import { describe, expect, it } from 'vitest';

import { reconstructFacade } from '../src/index.js';
import {
    caseA,
    caseB,
    caseC,
    caseD,
    caseE,
    caseF,
    caseG,
    caseH,
    caseI,
    caseJ,
    caseK1,
    caseK2,
    caseK3,
    caseK4,
    caseL,
    CASE_L_TRUTH,
} from '../src/testing/syntheticFacades.js';

describe('C108 §6 corpus — A: a rectangular window grid', () => {
    it('recovers the DRAWN bay and storey counts (brief §14), not a hard-coded pair', async () => {
        const c = caseA();
        const { ir } = await reconstructFacade(c.image);
        expect(ir.facade.periodicity.repeatX).toBe(c.truth.bays);
        expect(ir.facade.periodicity.repeatY).toBe(c.truth.storeys);
    });

    it('lays a lattice matching the drawn grid, and finds one opening per cell', async () => {
        const c = caseA();
        const { ir } = await reconstructFacade(c.image);
        expect(ir.facade.zones.length).toBe(c.truth.storeys);
        expect(ir.facade.zones[0]!.cells.length).toBe(c.truth.bays);
        const withOpenings = ir.facade.zones.flatMap((z) => z.cells).filter((cell) => cell.opening !== null);
        expect(withOpenings.length).toBe(c.truth.openings.length);
    });

    it('recovers the drawn opening size to within 15% of the cell', async () => {
        const c = caseA();
        const { ir } = await reconstructFacade(c.image);
        // The generator draws each opening at 60% of its cell, in both axes.
        const cells = ir.facade.zones.flatMap((z) => z.cells).filter((cell) => cell.opening !== null);
        for (const cell of cells) {
            const ratioX = cell.opening!.width / cell.width;
            const ratioY = cell.opening!.height / cell.height;
            expect(ratioX).toBeGreaterThan(0.45);
            expect(ratioX).toBeLessThan(0.75);
            expect(ratioY).toBeGreaterThan(0.45);
            expect(ratioY).toBeLessThan(0.75);
        }
    });

    it('reports zones bottom-up in facade Y, covering [0,1] with no gap (C108 §2.1)', async () => {
        const { ir } = await reconstructFacade(caseA().image);
        const sorted = [...ir.facade.zones].sort((a, b) => a.y - b.y);
        expect(sorted[0]!.y).toBeCloseTo(0, 2);
        const top = sorted[sorted.length - 1]!;
        expect(top.y + top.height).toBeCloseTo(1, 2);
        const total = ir.facade.zones.reduce((a, z) => a + z.height, 0);
        expect(total).toBeCloseTo(1, 2);
    });

    it('finds NO periodicity break where none was drawn (brief §14)', async () => {
        const { diagnostics } = await reconstructFacade(caseA().image);
        expect(diagnostics.rows?.breaks.length ?? 0).toBe(0);
    });
});

describe('C108 §6 corpus — B: a break in the vertical rhythm', () => {
    it('DISCOVERS the break at the drawn storey line, within 8% of the height', async () => {
        const c = caseB();
        const { diagnostics } = await reconstructFacade(c.image);
        const rect = diagnostics.rectified.image;
        expect(rect).not.toBeNull();
        const breaks = diagnostics.rows?.breaks ?? [];
        // The lowest storey was replaced, so the comb must fail across the bottom
        // quarter. Nothing told the pipeline that ground floors differ (brief §22).
        expect(breaks.length).toBeGreaterThan(0);
        const lowest = Math.max(...breaks) / rect!.height;
        expect(lowest).toBeGreaterThan(0.6);
    });

    it('still recovers the DRAWN bay count above the break', async () => {
        const c = caseB();
        const { ir } = await reconstructFacade(c.image);
        expect(ir.facade.periodicity.repeatX).toBe(c.truth.bays);
    });
});

describe('C108 §6 corpus — C: arched heads, measured CONTINUOUSLY (brief §9)', () => {
    it('reports high archness on drawn arches and ~0 on the flat case-A grid', async () => {
        const arched = await reconstructFacade(caseC().image);
        const flat = await reconstructFacade(caseA().image);
        const meanArchness = (r: typeof arched): number => {
            const vals = r.ir.facade.zones
                .flatMap((z) => z.cells)
                .map((cell) => cell.opening?.archness)
                .filter((v): v is number => v !== undefined);
            return vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
        };
        const archedMean = meanArchness(arched);
        const flatMean = meanArchness(flat);
        expect(flatMean).toBeLessThan(0.1);
        expect(archedMean).toBeGreaterThan(0.5);
        expect(archedMean - flatMean).toBeGreaterThan(0.4);
    });

    it('fits a LOW superellipse exponent to an arch and a HIGH one to a rectangle', async () => {
        const arched = await reconstructFacade(caseC().image);
        const flat = await reconstructFacade(caseA().image);
        const meanN = (r: typeof arched): number => {
            const vals = r.ir.facade.zones
                .flatMap((z) => z.cells)
                .map((cell) => cell.opening?.n)
                .filter((v): v is number => v !== undefined);
            return vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
        };
        // The generator drew n = 2 (a true semicircle).
        expect(meanN(arched)).toBeLessThan(4);
        expect(meanN(flat)).toBeGreaterThan(meanN(arched));
    });
});

describe('C108 §6 corpus — D: balconies. The CUE is measured; the DEPTH is UNKNOWN', () => {
    it('⛔ NEVER reports a depth (brief §11: "never hallucinate exact dimensions")', async () => {
        const { ir } = await reconstructFacade(caseD().image);
        const protrusions = ir.facade.zones
            .flatMap((z) => z.cells)
            .map((cell) => cell.protrusion)
            .filter((p): p is NonNullable<typeof p> => p !== null);
        for (const p of protrusions) {
            expect(p.depth).toBeNull();
            expect(p.unknownReason).toBe('geometry-incomplete');
        }
    });

    it('measures the DRAWN soffit band height to within a factor of two', async () => {
        const c = caseD();
        const { diagnostics } = await reconstructFacade(c.image);
        expect(diagnostics.soffits.length).toBeGreaterThan(0);
        const rect = diagnostics.rectified.image!;
        // The band was drawn at 8 px on a 300 px-tall facade; the rectified facade
        // is a different size, so the ASSERTION IS ON THE FRACTION, not the pixels.
        const drawnFraction = c.truth.soffitBandHeight / (c.truth.facadeRect.y1 - c.truth.facadeRect.y0);
        const measuredFraction =
            diagnostics.soffits.reduce((a, s) => a + s.bandHeight, 0) /
            diagnostics.soffits.length /
            rect.height;
        expect(measuredFraction).toBeGreaterThan(drawnFraction * 0.5);
        expect(measuredFraction).toBeLessThan(drawnFraction * 2.5);
    });

    it('the FLAT case-A grid produces no soffit cue at all', async () => {
        const { diagnostics } = await reconstructFacade(caseA().image);
        expect(diagnostics.soffits.length).toBe(0);
    });

    it('folds the shadow BLOBS into the cue — one per band, no outliers, no features (L-11180)', async () => {
        const c = caseD();
        const { ir, diagnostics } = await reconstructFacade(c.image);
        // Before §L-11180 the three drawn shadows reached the IR TWICE: as three
        // soffit cues AND as three "unclassified" outliers, a fact no assertion here
        // could see because case D draws no non-grid object (L-11184). One
        // measurement, one name.
        const shadows = diagnostics.blobs.filter((b) => b.soffitBand !== null);
        expect(shadows).toHaveLength(diagnostics.soffits.length);
        expect(ir.facade.outliers).toHaveLength(c.truth.nonGridObjects);
        expect(ir.facade.features).toHaveLength(c.truth.nonGridObjects);
        for (const b of shadows) expect(b.bbox.x1 - b.bbox.x0).toBeGreaterThan(b.bbox.y1 - b.bbox.y0);
    });
});

describe('C108 §6 corpus — E: a curved corner (brief §12)', () => {
    it('measures MORE outer-band deviation than the flat grid, on both sides', async () => {
        const curved = await reconstructFacade(caseE().image);
        const flat = await reconstructFacade(caseA().image);
        const dev = (r: typeof curved, side: 'left' | 'right'): number =>
            r.ir.facade.curvature[side].normalizedDeviation ?? 0;
        expect(dev(curved, 'left')).toBeGreaterThan(dev(flat, 'left'));
        expect(dev(curved, 'right')).toBeGreaterThan(dev(flat, 'right'));
    });

    it('⛔ reports normalizedRadius as NULL — one image does not determine it (L-11004)', async () => {
        const { ir } = await reconstructFacade(caseE().image);
        expect(ir.facade.curvature.left.normalizedRadius).toBeNull();
        expect(ir.facade.curvature.right.normalizedRadius).toBeNull();
    });
});

describe('C108 §6 corpus — F: a central vertical element (brief §10)', () => {
    it('places it in features[], NOT in a cell, and records the zones it spans', async () => {
        const c = caseF();
        const { ir } = await reconstructFacade(c.image);
        expect(ir.facade.features.length).toBeGreaterThanOrEqual(c.truth.nonGridObjects);
        const tallest = [...ir.facade.features].sort((a, b) => b.height - a.height)[0]!;
        // Drawn spanning every storey, inset a fifth of a cell top and bottom.
        expect(tallest.height).toBeGreaterThan(0.7);
        expect(tallest.zoneSpan).toBeGreaterThanOrEqual(2);
        // And it sits at the centre: the generator drew it at bay 2 of 5.
        expect(tallest.x + tallest.width / 2).toBeGreaterThan(0.4);
        expect(tallest.x + tallest.width / 2).toBeLessThan(0.6);
    });

    it('does not let it displace the drawn grid period', async () => {
        const c = caseF();
        const { ir } = await reconstructFacade(c.image);
        expect(ir.facade.periodicity.repeatY).toBe(c.truth.storeys);
    });
});

describe('C108 §6 corpus — G: missing windows (brief §14)', () => {
    it('recovers the SAME period as the complete grid despite three gaps', async () => {
        const complete = await reconstructFacade(caseA().image);
        const gapped = await reconstructFacade(caseG().image);
        expect(gapped.ir.facade.periodicity.repeatX).toBe(complete.ir.facade.periodicity.repeatX);
        expect(gapped.ir.facade.periodicity.repeatY).toBe(complete.ir.facade.periodicity.repeatY);
    });

    it('reports exactly the DRAWN number of openings — the gaps are empty cells', async () => {
        const c = caseG();
        const { ir } = await reconstructFacade(c.image);
        const found = ir.facade.zones.flatMap((z) => z.cells).filter((cell) => cell.opening !== null).length;
        expect(found).toBe(c.truth.openings.length);
    });
});

describe('C108 §6 corpus — H: foreground clutter (brief §2, §15)', () => {
    it('keeps the clutter OUT of the cells, and the cell count unchanged from A', async () => {
        const clean = await reconstructFacade(caseA().image);
        const cluttered = await reconstructFacade(caseH().image);
        const cells = (r: typeof clean): number => r.ir.facade.zones.flatMap((z) => z.cells).length;
        expect(cells(cluttered)).toBe(cells(clean));
        const withOpenings = (r: typeof clean): number =>
            r.ir.facade.zones.flatMap((z) => z.cells).filter((c) => c.opening !== null).length;
        expect(withOpenings(cluttered)).toBe(withOpenings(clean));
    });

    it('reports the drawn clutter as features or outliers, never silently drops it', async () => {
        const c = caseH();
        const { ir } = await reconstructFacade(c.image);
        const unclassified = ir.facade.outliers.length + ir.facade.features.length;
        expect(unclassified).toBeGreaterThanOrEqual(c.truth.nonGridObjects);
    });
});

describe('C108 §6 corpus — I: perspective (brief §6)', () => {
    it('recovers each of the four DRAWN quad corners to within 5% of the frame', async () => {
        const c = caseI();
        const { diagnostics } = await reconstructFacade(c.image);
        expect(diagnostics.facadeQuad.quad).not.toBeNull();
        const q = diagnostics.facadeQuad.quad!;
        const drawn = c.truth.facadeQuad;
        expect(drawn).toBeDefined();
        const tol = 0.05 * c.image.width;
        // Corner by corner, against the trapezoid the generator actually drew — not
        // against the axis-aligned rect it was derived from.
        for (let i = 0; i < 4; i++) {
            expect(Math.abs(q[i]!.x - drawn![i]!.x)).toBeLessThan(tol);
            expect(Math.abs(q[i]!.y - drawn![i]!.y)).toBeLessThan(tol);
        }
    });

    it('recovers the DRAWN bay count after rectification', async () => {
        const c = caseI();
        const { ir } = await reconstructFacade(c.image);
        expect(ir.facade.periodicity.repeatX).toBe(c.truth.bays);
    });
});

describe('C108 §6 corpus — J: noise and low contrast', () => {
    it('gives the SAME structural answer as the clean grid', async () => {
        const clean = await reconstructFacade(caseA().image);
        const noisy = await reconstructFacade(caseJ().image);
        expect(noisy.ir.facade.periodicity.repeatX).toBe(clean.ir.facade.periodicity.repeatX);
        expect(noisy.ir.facade.periodicity.repeatY).toBe(clean.ir.facade.periodicity.repeatY);
    });

    it('⭐ recovers the openings STRICTLY LESS CLEANLY than from the clean grid', async () => {
        // The deliberate assertion of the whole corpus: the degradation must be
        // VISIBLE in a measured quantity, not only in whether the answer is right.
        //
        // ⚠ AND THE HONEST PART — WHAT DID *NOT* DEGRADE, MEASURED 2026-08-25.
        // At this noise level the PERIODIC STRUCTURE is essentially as well supported
        // as in the clean image: the row comb fit falls (0.917 -> 0.894) but the
        // COLUMN comb fit RISES (0.869 -> 0.888), because noise adds a little energy
        // at every tooth as well as between them. Asserting "every confidence goes
        // down" would therefore be false, and picking whichever number happened to
        // move in the convenient direction would be the confident-register-row defect
        // in a test file.
        //
        // What degrades reliably is the OPENING BOUNDARY: a noisy threshold produces
        // a raggeder connected component, so `rectangularity` falls. That is the
        // quantity asserted, and the claim it supports is exactly the true one — the
        // structure survives the noise and the edges do not.
        const clean = await reconstructFacade(caseA().image);
        const noisy = await reconstructFacade(caseJ().image);
        const meanRectangularity = (r: typeof clean): number => {
            const bs = r.diagnostics.blobs;
            expect(bs.length).toBe(20);
            return bs.reduce((a, b) => a + b.rectangularity, 0) / bs.length;
        };
        expect(meanRectangularity(noisy)).toBeLessThan(meanRectangularity(clean));
    });

    it('reports a lower ROW comb fit — the axis whose evidence the noise really erodes', async () => {
        const clean = await reconstructFacade(caseA().image);
        const noisy = await reconstructFacade(caseJ().image);
        expect(noisy.diagnostics.rows?.fit as number).toBeLessThan(
            clean.diagnostics.rows?.fit as number,
        );
    });

    it('still reports a real confidence rather than silently dropping to unknown', async () => {
        const noisy = await reconstructFacade(caseJ().image);
        const c = noisy.ir.facade.periodicity.confidence;
        expect(typeof c).toBe('number');
        expect(c as number).toBeGreaterThan(0);
        expect(c as number).toBeLessThanOrEqual(1);
    });
});

describe('C108 §3.1 crop — the four refusal cases', () => {
    it('K1: a clean photograph is trimmed by EXACTLY ZERO pixels', async () => {
        const c = caseK1();
        const { diagnostics } = await reconstructFacade(c.image);
        expect(diagnostics.crop.applied).toBe(false);
        expect(diagnostics.crop.rect).toEqual({ x0: 0, y0: 0, x1: c.image.width, y1: c.image.height });
        expect(diagnostics.crop.refusedReason).toBeNull();
    });

    it('K2: solid screenshot chrome is trimmed to within 6 px of the drawn inner rect', async () => {
        const c = caseK2();
        const { diagnostics } = await reconstructFacade(c.image);
        expect(diagnostics.crop.applied).toBe(true);
        expect(Math.abs(diagnostics.crop.rect.y0 - c.truth.chromeTrim.top)).toBeLessThanOrEqual(6);
        expect(
            Math.abs(c.image.height - diagnostics.crop.rect.y1 - c.truth.chromeTrim.bottom),
        ).toBeLessThanOrEqual(6);
    });

    it('⛔ K3: a uniform SKY band SURVIVES — 0 pixels trimmed from the top', async () => {
        // Without the inter-row-variation criterion this stage trims the top off
        // every outdoor photograph, silently and plausibly (C108 §3.1 refusal 3).
        const c = caseK3();
        const { diagnostics } = await reconstructFacade(c.image);
        expect(diagnostics.crop.rect.y0).toBe(0);
        expect(diagnostics.crop.rect.y1).toBe(c.image.height);
    });

    it('⛔ K4: an over-trimming candidate is REFUSED with a named reason, not applied', async () => {
        const c = caseK4();
        const { diagnostics } = await reconstructFacade(c.image);
        expect(c.truth.cropRefused).toBe(true);
        expect(diagnostics.crop.applied).toBe(false);
        expect(diagnostics.crop.refusedReason).toBe('cap-exceeded');
        expect(diagnostics.crop.rect).toEqual({ x0: 0, y0: 0, x1: c.image.width, y1: c.image.height });
    });
});

// ── L (lane FACADEREAL60) ────────────────────────────────────────────────────
//
// ⭐ THE CASE THE CORPUS DID NOT HAVE. A–K are one facade — 5 bays x 4 storeys,
// flat ground floor — under fourteen different degradations. Case L is a DIFFERENT
// FACADE: six regular storeys, a five-arch arcade zone, balcony soffits on every
// floor, 35 openings, 7 zones. It was added on 2026-08-25 after the founder ran the
// FIRST REAL PHOTOGRAPH (L-11001) and got a 2 zone x 2 bay lattice on a building of
// exactly this class.
//
// ⛔ It is SYNTHETIC. It is not his building (C108 §0.2) and nothing here may be
// read as evidence about his building. It proves the CLASS, against ground truth
// the generator drew, which is the only oracle C108 §6.2 accepts.

describe('C108 §6 corpus — L: seven zones, five bays, an arcade (brief §7, §14)', () => {
    it('⭐ recovers the DRAWN zone and bay counts — 7 x 5, not 2 x 2', async () => {
        const c = caseL();
        const { ir } = await reconstructFacade(c.image);
        expect(ir.facade.zones.length).toBe(CASE_L_TRUTH.zones);
        expect(ir.facade.zones[0]!.cells.length).toBe(CASE_L_TRUTH.bays);
        expect(ir.facade.periodicity.repeatY).toBe(CASE_L_TRUTH.zones);
        expect(ir.facade.periodicity.repeatX).toBe(CASE_L_TRUTH.bays);
    });

    it('matches EVERY drawn opening to a cell — 35 of 35', async () => {
        const c = caseL();
        const { ir } = await reconstructFacade(c.image);
        const matched = ir.facade.zones.flatMap((z) => z.cells).filter((cell) => cell.opening !== null);
        expect(matched.length).toBe(CASE_L_TRUTH.totalOpenings);
        expect(matched.length).toBe(c.truth.openings.length);
    });

    it('⭐ measures the FIVE ARCADE HEADS as arches and the upper storeys as flat (brief §9)', async () => {
        // The generator drew the arcade heads as true semicircles (rise == half
        // width, so archness 1) and every upper head flat (archness 0). ⛔ Nothing in
        // the engine is told there is an arcade, that it is at the bottom, or that a
        // ground floor differs from a storey — the zone is found by clustering and
        // its heads are fitted by the same superellipse search as every other head.
        const { ir } = await reconstructFacade(caseL().image);
        const zones = [...ir.facade.zones].sort((a, b) => a.y - b.y);
        const archnessOf = (zs: typeof zones): number => {
            const v = zs
                .flatMap((z) => z.cells)
                .map((cell) => cell.opening?.archness)
                .filter((a): a is number => a !== undefined);
            return v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
        };
        const arcade = zones[0]!;
        expect(arcade.cells.filter((cell) => cell.opening !== null).length).toBe(
            CASE_L_TRUTH.arcadeOpenings,
        );
        // Drawn archness 1 in the arcade, 0 above it.
        expect(archnessOf([arcade])).toBeGreaterThan(0.8);
        expect(archnessOf(zones.slice(1))).toBeLessThan(0.05);
        // And the drawn exponent was n = 2, a true semicircle.
        const arcadeN =
            arcade.cells.map((cell) => cell.opening?.n ?? 0).reduce((a, b) => a + b, 0) /
            CASE_L_TRUTH.arcadeOpenings;
        expect(arcadeN).toBeGreaterThan(1.5);
        expect(arcadeN).toBeLessThan(3);
    });

    it('places the arcade boundary within 5% of the DRAWN one, and it is the TALLEST zone', async () => {
        const { ir } = await reconstructFacade(caseL().image);
        const zones = [...ir.facade.zones].sort((a, b) => a.y - b.y);
        const arcade = zones[0]!;
        expect(Math.abs(arcade.height - CASE_L_TRUTH.arcadeTopY)).toBeLessThan(0.05);
        for (const z of zones.slice(1)) expect(arcade.height).toBeGreaterThan(z.height);
    });

    it('measures the DRAWN balcony soffit band on every storey line it was drawn on', async () => {
        const c = caseL();
        const { ir, diagnostics } = await reconstructFacade(c.image);
        // Five bands were drawn, one under each interior upper-storey line.
        expect(diagnostics.soffits.length).toBe(5);
        const rect = diagnostics.rectified.image!;
        const drawnFraction =
            c.truth.soffitBandHeight / (c.truth.facadeRect.y1 - c.truth.facadeRect.y0);
        const measuredFraction =
            diagnostics.soffits.reduce((a, s) => a + s.bandHeight, 0) /
            diagnostics.soffits.length /
            rect.height;
        expect(measuredFraction).toBeGreaterThan(drawnFraction * 0.5);
        expect(measuredFraction).toBeLessThan(drawnFraction * 2.5);
        // ⛔ And the DEPTH is still unknown (C108 §3.10, L-11005).
        for (const cell of ir.facade.zones.flatMap((z) => z.cells)) {
            if (cell.protrusion === null) continue;
            expect(cell.protrusion.depth).toBeNull();
            expect(cell.protrusion.unknownReason).toBe('geometry-incomplete');
        }
        // §L-11180 — the five shadow blobs are the cue, not five outliers (they
        // were, before the fold, and nothing asserted it: L-11184).
        expect(diagnostics.blobs.filter((b) => b.soffitBand !== null)).toHaveLength(5);
        expect(ir.facade.outliers).toHaveLength(0);
        expect(ir.facade.features).toHaveLength(0);
        // §L-11181 — and the cue reaches the IR on every zone a band was drawn
        // under: zones 1..5 top-down; zone 0 has no slab above, the arcade none.
        for (const z of ir.facade.zones.slice(1, 6)) {
            for (const cell of z.cells) expect(cell.protrusion).not.toBeNull();
        }
        for (const cell of ir.facade.zones[0]!.cells) expect(cell.protrusion).toBeNull();
    });

    it('⭐ beats the PROJECTION-PROFILE lattice on the same pixels — the A/B, measured', async () => {
        // C108 §3.4 keeps both sources. This is the assertion that the primary one
        // is primary for a REASON, on numbers rather than on a commit message.
        const c = caseL();
        const openings = await reconstructFacade(c.image);
        const profile = await reconstructFacade(c.image, { latticeSource: 'projection-profile' });
        const matched = (r: typeof openings): number =>
            r.ir.facade.zones.flatMap((z) => z.cells).filter((cell) => cell.opening !== null).length;
        expect(matched(openings)).toBe(CASE_L_TRUTH.totalOpenings);
        expect(matched(profile)).toBeLessThan(matched(openings));
        expect(profile.ir.facade.zones.length).not.toBe(CASE_L_TRUTH.zones);
        expect(openings.ir.facade.zones.length).toBe(CASE_L_TRUTH.zones);
        // And the disagreement is REPORTED, not swallowed (C108 §3.4).
        expect(openings.diagnostics.lattice.zones.source).toBe('openings');
        expect(openings.diagnostics.lattice.zones.fromProfile).not.toBe(CASE_L_TRUTH.zones);
        expect(openings.diagnostics.notes.some((n) => n.includes('SOURCES DISAGREE'))).toBe(true);
    });

    it('⛔ reports a FLAT facade at LOW curvature confidence, not moderate (L-10975)', async () => {
        // Case L is drawn DEAD FLAT (`truth.curved === false`). Case E is drawn
        // bent. The assertion is the SEPARATION between them, because a stage that
        // reports every facade as slightly curved has measured nothing.
        const flat = await reconstructFacade(caseL().image);
        const curved = await reconstructFacade(caseE().image);
        expect(caseL().truth.curved).toBe(false);
        expect(caseE().truth.curved).toBe(true);
        const conf = (r: typeof flat, side: 'left' | 'right'): number =>
            r.ir.facade.curvature[side].confidence ?? 1;
        expect(conf(flat, 'left')).toBeLessThan(0.35);
        expect(conf(flat, 'right')).toBeLessThan(0.35);
        expect(conf(curved, 'left')).toBeGreaterThan(conf(flat, 'left') + 0.3);
        expect(conf(curved, 'right')).toBeGreaterThan(conf(flat, 'right') + 0.3);
    });
});

describe('C108 §3.4 — the projection profile is a FALLBACK, not dead code', () => {
    it('K4 has no lattice-supporting openings, so the derivation REFUSES and names why', async () => {
        // ⭐ The case that proves the fallback is reachable. K4 carries two dark
        // components and no repetition at all, so opening clustering cannot produce
        // a lattice — and the honest answer is to say so and let the projection
        // profile answer, not to invent a grid out of two boxes.
        const { diagnostics } = await reconstructFacade(caseK4().image);
        expect(diagnostics.lattice.zones.source).toBe('projection-profile');
        expect(diagnostics.lattice.zones.fromOpenings).toBeNull();
        expect(typeof diagnostics.lattice.zones.refusedReason).toBe('string');
        expect(diagnostics.lattice.zones.bands).toBe(diagnostics.lattice.zones.fromProfile);
    });

    it('case A answers IDENTICALLY from either source — the change is not a rewrite', async () => {
        const openings = await reconstructFacade(caseA().image);
        const profile = await reconstructFacade(caseA().image, {
            latticeSource: 'projection-profile',
        });
        const c = caseA();
        for (const r of [openings, profile]) {
            expect(r.ir.facade.zones.length).toBe(c.truth.storeys);
            expect(r.ir.facade.zones[0]!.cells.length).toBe(c.truth.bays);
            expect(
                r.ir.facade.zones.flatMap((z) => z.cells).filter((cell) => cell.opening !== null).length,
            ).toBe(c.truth.openings.length);
        }
    });
});

describe('C108 §3.2 / brief §6 — the four corners are ASKED FOR, never assumed', () => {
    it('⛔ with detection not requested, NO cell claims a confidence — unknown in, unknown out', async () => {
        // The founder's own reading, 2026-08-25: his four clicks scored 1.00 where
        // detection scored 0.64 on the same photograph, and his rectification was
        // visibly better. C108 §4.3 makes a 0.64 plane cap EVERY downstream number,
        // so the honest default is to ask. This asserts the propagation: with the
        // plane unknown, the count of cells carrying a numeric confidence is ZERO —
        // not "low", not 0.0, but absent (C108 §2.3).
        const { ir, diagnostics } = await reconstructFacade(caseA().image, {
            autoDetectFacadePlane: false,
        });
        expect(diagnostics.facadeQuad.status).toBe('needs-user');
        expect(diagnostics.facadeQuad.quad).toBeNull();
        expect(diagnostics.facadeQuad.confidence).toBeNull();
        expect(diagnostics.rectified.image).toBeNull();
        expect(ir.facade.confidence).toBeNull();
        const cells = ir.facade.zones.flatMap((z) => z.cells);
        expect(cells.filter((c) => c.confidence !== null).length).toBe(0);
        expect(ir.facade.periodicity.confidence).toBeNull();
        // ⭐ And it still produced something to LOOK at (brief §18): the refusal is a
        // refusal to CLAIM, not a refusal to run. The crop and the edge map are the
        // layers a user needs in order to place the four corners at all.
        const c = caseA();
        expect(diagnostics.crop.image.width).toBe(c.image.width);
        expect(diagnostics.edges.image.width).toBe(c.image.width);
        expect(diagnostics.lines.length).toBeGreaterThan(0);
        expect(diagnostics.notes.some((n) => n.includes('ASKED FOR, never assumed'))).toBe(true);
        // ⚠ AND WHAT IS *NOT* PRODUCED, STATED RATHER THAN IMPLIED (L-10977). On the
        // UN-RECTIFIED frame Otsu's threshold separates SKY from WALL rather than
        // OPENING from WALL, so opening detection returns NOTHING: 0 blobs on the
        // very grid that yields 20 once a plane exists. The engine header calls this
        // path a "preliminary answer"; this is how preliminary it actually is, and
        // it is the strongest argument for asking for the corners up front.
        expect(diagnostics.blobs.length).toBe(0);
    });

    it('a user-supplied quad beats detection on the SAME image, and scores 1.00', async () => {
        // brief §6/§23 step 5: the user's quad always wins. Case I is the perspective
        // case, so its drawn quad is known and is exactly what a user would click.
        const c = caseI();
        const detected = await reconstructFacade(c.image);
        const supplied = await reconstructFacade(c.image, { facadeQuad: c.truth.facadeQuad });
        expect(supplied.diagnostics.facadeQuad.status).toBe('user-supplied');
        expect(supplied.diagnostics.facadeQuad.confidence).toBe(1);
        expect(detected.diagnostics.facadeQuad.confidence as number).toBeLessThan(1);
        expect(supplied.ir.facade.periodicity.repeatX).toBe(c.truth.bays);
        expect(supplied.ir.facade.periodicity.repeatY).toBe(c.truth.storeys);
    });
});
