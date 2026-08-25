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
// ⛔ IT IS A PROBE, AND ITS ASSERTIONS PIN WHATEVER IS TRUE TODAY (the L-10947
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

/** The strip sits in slot 2 of 6 → engine bay column 2 of its 6-bay lattice. */
const PHANTOM_BAY_COL = 2;

describe('C108 corpus case M — PROBE: the feature strip + railing class (L-11120..L-11123)', () => {
    it('reads the zones CORRECTLY — 7 of 7, as on the real photograph', async () => {
        const c = caseM();
        const { ir } = await reconstructFacade(c.image);
        // GENUINE: zones survive the clutter. This half must NOT regress while
        // the bay half is fixed.
        expect(ir.facade.zones.length).toBe(CASE_M_TRUTH.zones);
        expect(ir.facade.periodicity.repeatY).toBe(CASE_M_TRUTH.zones);
    });

    it('PINS THE DEFECT (L-11121): the strip mints a PHANTOM BAY — 6 bays where 5 are drawn', async () => {
        const c = caseM();
        const { ir, diagnostics } = await reconstructFacade(c.image);
        // ⛔ WRONG TODAY, PINNED: drawn truth is CASE_M_TRUTH.bays === 5. The
        // strip's per-storey chunks (split by the light slab faces) vote a bay
        // line at the strip's centre with support 7, indistinguishable to the
        // clusterer from a real bay. A fix makes these two read 5 and goes red
        // here — which is the point.
        expect(ir.facade.zones[0]!.cells.length).toBe(6);
        expect(ir.facade.periodicity.repeatX).toBe(6);
        // The phantom column IS the strip's: its band contains the strip centre.
        const band = ir.facade.zones[0]!.cells[PHANTOM_BAY_COL]!;
        expect(CASE_M_TRUTH.stripCentreX).toBeGreaterThan(band.x);
        expect(CASE_M_TRUTH.stripCentreX).toBeLessThan(band.x + band.width);
        // The cross-check honesty held (the panel's SOURCES DISAGREE row).
        expect(diagnostics.notes.some((n) => n.includes('SOURCES DISAGREE'))).toBe(true);
    });

    it('PINS THE DEFECT (L-11122): the strip is LOST as a feature — its 7 chunks match as OPENINGS', async () => {
        const c = caseM();
        const { ir } = await reconstructFacade(c.image);
        const cells = ir.facade.zones.flatMap((z) => z.cells);
        // ⛔ WRONG TODAY, PINNED: 42 matched where 35 openings are drawn — the
        // 7 extra are the strip's per-storey chunks seated in the phantom column.
        expect(cells.filter((cell) => cell.opening !== null).length).toBe(42);
        for (const z of ir.facade.zones) {
            expect(z.cells[PHANTOM_BAY_COL]!.opening).not.toBeNull();
        }
        // ⛔ WRONG TODAY, PINNED: 10 features where ONE is drawn — the strip
        // (drawn, vertically continuous, brief §10's own object) is NOT among
        // them; the 10 are soffit-shadow segments split by the strip, each
        // straddling a zone boundary. Outliers read 0.
        expect(ir.facade.features.length).toBe(10);
        expect(ir.facade.outliers.length).toBe(0);
    });

    it('PINS THE DEFECT (L-11123): archness ~1.0 stamped on ALL 30 drawn-RECTANGULAR windows', async () => {
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
        // ⛔ WRONG TODAY, PINNED: every one of the 30 rectangular windows reads
        // archness >= 0.9 (measured: 1.00 across the board; the real photograph
        // read 0.87–0.98). Mechanism: the dark railing is WIDER than the window
        // and merged with it by overlap, so the blob's top boundary is deep at
        // the railing wings and flat over the window — the exact profile the
        // superellipse fits with a large amplitude. Drawn truth is archness 0.
        expect(arched.length).toBe(30);
        for (const cell of arched) {
            expect(cell.opening!.archness).toBeGreaterThanOrEqual(0.9);
        }
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
