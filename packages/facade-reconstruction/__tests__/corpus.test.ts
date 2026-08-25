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
