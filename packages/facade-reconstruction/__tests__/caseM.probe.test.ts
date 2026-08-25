// PROBE (L-11120..L-11123, lane FACADECAL64) — corpus case M: the founder's
// SECOND real photograph's failure class, REPRODUCED synthetically and PINNED.
//
// The real run (live build 862f58c5, 2026-08-25): 7 storeys x 5 window bays +
// ONE full-height glazed feature strip in the centre + balcony railings over the
// window bottoms + dark shutter slats. The engine read 7 zones (CORRECT) x
// 7 bays (WRONG), stamped archness 0.87–0.98 on RECTANGULAR windows, and matched
// 23 / 4 features / 7 outliers where the case-L class predicts ~35 matched.
//
// Case M draws that class with ground truth the generator drew (C108 §0.2 — the
// photograph is not in this repository). Measured on first run, the engine reads:
//
//     zones 7 (drawn 7 — CORRECT)  ·  bays 6 (drawn 5 — a PHANTOM bay at the
//     strip)  ·  matched 42 (drawn 35 — the strip's 7 per-storey chunks matched
//     as openings in the phantom column)  ·  features 10 (drawn 1 — the strip is
//     LOST as a feature, and 10 split soffit-shadow segments are minted instead)
//     ·  archness 1.00 on all 30 drawn-RECTANGULAR windows (railing wings fake
//     the arch profile)  ·  outliers 0.
//
// ⭐ FIXED 2026-08-25 (§L-11121 continuity screen, §L-11122 reunion, §L-11123
// head-region model selection). The assertions below now hold the engine to the
// DRAWN TRUTH; the pinned-wrong values they replaced are quoted in each comment so
// the before/after stays legible. One residue is named, not hidden: the 10
// soffit-shadow segments that straddle zone boundaries still read as features
// (drawn 1, engine 1 strip + 10 segments) — that is S15/S13 ordering, a separate
// row, and it is NOT asserted away.
//
// ⛔ IT WAS A PROBE, AND ITS ASSERTIONS PINNED WHATEVER WAS TRUE THEN (the L-10947
// pattern). Where the current behaviour is WRONG the test says so in a comment
// beside the assertion and pins the wrong value, so the fix — when it lands —
// turns this file red on purpose and announces itself, instead of arriving
// silently. ⛔ Per C108 §9, the fix may NOT be a threshold chosen because it
// makes this case pass — it must hold A–L green at the same time.
//
// What differs from the real photograph, stated honestly rather than chased:
//   • real bays read 7 (two phantoms); case M reads 6 (one phantom, the strip's).
//   • real matched DEFLATED to 23 (camera noise loses windows); case M INFLATES
//     to 42 (the phantom column's chunks all match). Same mechanism, opposite
//     sign — the lattice is polluted by non-bay structure either way.

import { describe, expect, it } from 'vitest';

import { reconstructFacade } from '../src/index.js';
import { caseM, CASE_M_TRUTH } from '../src/testing/syntheticFacades.js';

/**
 * Historical: before the fix the strip sat in slot 2 of a 6-bay lattice and this
 * was the phantom column. With 5 bays there is no phantom column; the constant is
 * kept only so the arcade twin below can exclude nothing and read all 5 arches.
 */
const PHANTOM_BAY_COL = -1;

describe('C108 corpus case M — PROBE: the feature strip + railing class (L-11120..L-11123)', () => {
    it('reads the zones CORRECTLY — 7 of 7, as on the real photograph', async () => {
        const c = caseM();
        const { ir } = await reconstructFacade(c.image);
        // GENUINE: zones survive the clutter. This half must NOT regress while
        // the bay half is fixed.
        expect(ir.facade.zones.length).toBe(CASE_M_TRUTH.zones);
        expect(ir.facade.periodicity.repeatY).toBe(CASE_M_TRUTH.zones);
    });

    it('FIXED (L-11121): the strip no longer mints a PHANTOM BAY — 5 bays, as drawn', async () => {
        const c = caseM();
        const { ir, diagnostics } = await reconstructFacade(c.image);
        // Was 6 / 6 (pinned wrong). The continuity screen measures the strip's
        // column: its largest inter-slice gap is the slab shadow, a small fraction
        // of the slice, far below the other columns' wall-sized gaps — one object,
        // no vote. And the interpolation step does not refill the vacated slot.
        expect(ir.facade.zones[0]!.cells.length).toBe(CASE_M_TRUTH.bays);
        expect(ir.facade.periodicity.repeatX).toBe(CASE_M_TRUTH.bays);
        // No bay LINE sits on the strip: every cell centre is clear of it by more
        // than a quarter cell.
        for (const cell of ir.facade.zones[0]!.cells) {
            const centre = cell.x + cell.width / 2;
            expect(Math.abs(centre - CASE_M_TRUTH.stripCentreX)).toBeGreaterThan(cell.width / 4);
        }
        expect(diagnostics.notes.some((n) => n.includes('continuous column/row(s) rejected'))).toBe(true);
        // The cross-check honesty still held (the panel's SOURCES DISAGREE row).
        expect(diagnostics.notes.some((n) => n.includes('SOURCES DISAGREE'))).toBe(true);
    });

    it('FIXED (L-11122): the strip is ONE reunited feature spanning every zone — 35 openings match, as drawn', async () => {
        const c = caseM();
        const { ir } = await reconstructFacade(c.image);
        const cells = ir.facade.zones.flatMap((z) => z.cells);
        // Was 42 (pinned wrong): the strip's 7 slices no longer seat as openings.
        expect(cells.filter((cell) => cell.opening !== null).length).toBe(CASE_M_TRUTH.totalOpenings);
        // The strip is back as what brief §10 says it is: ONE vertically continuous
        // feature, its box the union of its slices, containing the drawn centre.
        const strip = ir.facade.features.filter((f) => f.note === 'continuous-object-reunited');
        expect(strip).toHaveLength(1);
        expect(strip[0]!.zoneSpan).toBeGreaterThanOrEqual(CASE_M_TRUTH.zones - 1);
        expect(strip[0]!.x).toBeLessThan(CASE_M_TRUTH.stripCentreX);
        expect(strip[0]!.x + strip[0]!.width).toBeGreaterThan(CASE_M_TRUTH.stripCentreX);
        // ⚠ RESIDUE, NAMED: the 10 soffit-shadow segments (each straddling a zone
        // boundary) are still minted as features — drawn 1, engine 1 + 10. That is a
        // separate S15/S13 ordering row; this test does not assert it away.
        expect(ir.facade.features.length).toBeGreaterThanOrEqual(1);
        expect(ir.facade.outliers.length).toBe(0);
    });

    it('FIXED (L-11123): NO archness stamped on the 30 drawn-RECTANGULAR windows despite the railing wings', async () => {
        const c = caseM();
        const { ir } = await reconstructFacade(c.image);
        // Engine zone order is top-down: zones[6] is the arcade; zones[0..5] are
        // the six upper storeys (drawn archness 0 on every window).
        const upperWindowCells = ir.facade.zones
            .slice(0, 6)
            .flatMap((z) => z.cells.filter((_, col) => col !== PHANTOM_BAY_COL));
        const arched = upperWindowCells.filter(
            (cell) => cell.opening !== null && cell.opening.archness >= 0.5,
        );
        // Was 30 of 30 at >= 0.9 (pinned wrong; the real photograph read 0.87–0.98).
        // Mechanism: the dark railing is WIDER than the window and merged with it,
        // so the top boundary was deep at the wings and flat over the window. The
        // fit now compares a STEP model against the superellipse and, when the
        // step fits better, measures the head on the plateau alone. Drawn truth 0.
        expect(upperWindowCells.filter((cell) => cell.opening !== null)).toHaveLength(
            CASE_M_TRUTH.rectangularOpenings,
        );
        expect(arched).toHaveLength(0);
    });

    it('NON-VACUITY TWIN: the five drawn arcade arches are still measured as arches', async () => {
        const c = caseM();
        const { ir } = await reconstructFacade(c.image);
        // GENUINE: the arcade zone (bottom → engine zones[6]) carries the ONLY
        // drawn arches, and they read arched (measured 0.87–1.00). A fix for
        // L-11123 that flattens THESE has thrown out the measurement with the
        // pollution and is its own regression.
        const arcade = ir.facade.zones[ir.facade.zones.length - 1]!;
        const archCells = arcade.cells.filter((_, col) => col !== PHANTOM_BAY_COL);
        expect(archCells.length).toBe(5);
        for (const cell of archCells) {
            expect(cell.opening).not.toBeNull();
            expect(cell.opening!.archness).toBeGreaterThanOrEqual(0.8);
        }
    });
});
