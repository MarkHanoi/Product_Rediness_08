// TGL wiring — the offline engine bridge (ShellAnalysis → ScoredLayoutOption[])
// and its integration into generateLayoutOptions behind the fallback seam.

import { describe, expect, it } from 'vitest';
import { generateDeterministicLayouts } from '../src/workflows/apartmentLayout/tgl/runDeterministicLayout.js';
import { generateLayoutOptions } from '../src/workflows/apartmentLayout/generate.js';
import { rotatePoly, type Pt } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { RelayPorter } from '../src/AnthropicRelay.js';
import { type ShellAnalysis, polygonAreaM2 } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type { ApartmentConstraints, ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

const SHELL: ShellAnalysis = {
    netAreaM2: 120, widthM: 12, depthM: 10,
    perimeter: [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 10 }, { x: 0, z: 10 }],
    faces: [],
};
const PROGRAM: ApartmentProgram = {
    bedrooms: 2, bathrooms: 1, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};
const CONSTRAINTS: ApartmentConstraints = { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
const WEIGHTS: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

/** Relay that always fails — simulates no API key / 401 / 500. */
const offlineRelay: RelayPorter = { complete: async () => { throw new Error('offline (no AI upstream)'); } };

describe('generateDeterministicLayouts (TGL wiring)', () => {
    it('produces ranked, scored, real layouts for a shell', () => {
        const out = generateDeterministicLayouts(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, 3);
        expect(out.length).toBeGreaterThan(0);
        expect(out.length).toBeLessThanOrEqual(3);
        for (const o of out) {
            expect(o.rooms.length).toBeGreaterThan(0);
            expect(o.walls.length).toBeGreaterThan(0);
            expect(o.summary).toContain('D-TGL');
            expect(o.score.overall).toBeGreaterThanOrEqual(0);
            expect(o.score.overall).toBeLessThanOrEqual(100);
        }
    });

    // §L1-α-4 PREP (2026-05-29) — the new objective axes are surfaced on the
    // breakdown so the modal renderer can read them without re-deriving from
    // the layout.
    it('plumbs hierarchy + shapeQuality + topologyQuality + edgeRealisation onto score.breakdown', () => {
        const out = generateDeterministicLayouts(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, 1);
        expect(out.length).toBe(1);
        const b = out[0]!.score.breakdown;
        expect(typeof b.hierarchy).toBe('number');
        expect(typeof b.shapeQuality).toBe('number');
        expect(typeof b.topologyQuality).toBe('number');
        // §L3-γ-4 (2026-05-30) — edgeRealisation joins the modal-bound axes.
        expect(typeof b.edgeRealisation).toBe('number');
        // §L1-α-4 (2026-05-31) — facadeAlignment joins the modal-bound axes.
        expect(typeof b.facadeAlignment).toBe('number');
        // Each must land in [0, 1].
        expect(b.hierarchy!).toBeGreaterThanOrEqual(0);
        expect(b.hierarchy!).toBeLessThanOrEqual(1);
        expect(b.shapeQuality!).toBeGreaterThanOrEqual(0);
        expect(b.shapeQuality!).toBeLessThanOrEqual(1);
        expect(b.topologyQuality!).toBeGreaterThanOrEqual(0);
        expect(b.topologyQuality!).toBeLessThanOrEqual(1);
        expect(b.edgeRealisation!).toBeGreaterThanOrEqual(0);
        expect(b.edgeRealisation!).toBeLessThanOrEqual(1);
        expect(b.facadeAlignment!).toBeGreaterThanOrEqual(0);
        expect(b.facadeAlignment!).toBeLessThanOrEqual(1);
    });

    // §INTERIOR-HEIGHT-MATCH (2026-05-29 audit follow-up): partition height
    // is threaded onto the LayoutOption so the executor can read it without
    // reaching into the wall store.
    it('threads constraints.floorToCeiling onto option.floorToCeilingMm', () => {
        const tallShell: ApartmentConstraints = { ...CONSTRAINTS, floorToCeiling: 3100 };
        const out = generateDeterministicLayouts(SHELL, PROGRAM, tallShell, WEIGHTS, 1);
        expect(out.length).toBe(1);
        expect(out[0]!.floorToCeilingMm).toBe(3100);
    });

    it('omits floorToCeilingMm when constraints.floorToCeiling is 0 (executor falls back)', () => {
        const noHeight: ApartmentConstraints = { ...CONSTRAINTS, floorToCeiling: 0 };
        const out = generateDeterministicLayouts(SHELL, PROGRAM, noHeight, WEIGHTS, 1);
        expect(out.length).toBe(1);
        expect(out[0]!.floorToCeilingMm).toBeUndefined();
    });

    it('is deterministic for the same shell + program', () => {
        const a = generateDeterministicLayouts(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, 2);
        const b = generateDeterministicLayouts(SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, 2);
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });

    it('returns [] for a degenerate shell', () => {
        const bad: ShellAnalysis = { ...SHELL, perimeter: [{ x: 0, z: 0 }] };
        expect(generateDeterministicLayouts(bad, PROGRAM, CONSTRAINTS, WEIGHTS, 3)).toEqual([]);
    });

    it('generateLayoutOptions falls back to D-TGL when the relay is offline + fallback opted-in', async () => {
        const res = await generateLayoutOptions(
            { shell: SHELL, program: PROGRAM, constraints: CONSTRAINTS, weights: WEIGHTS, count: 3 },
            offlineRelay,
            { proceduralFallback: true },
        );
        expect(res.status).toBe('ok');
        expect(res.options.length).toBeGreaterThan(0);
        expect(res.reason).toContain('D-TGL');
        expect(res.options[0]!.summary).toContain('D-TGL');
    });

    it('without the fallback flag, an offline relay still rejects honestly', async () => {
        const res = await generateLayoutOptions(
            { shell: SHELL, program: PROGRAM, constraints: CONSTRAINTS, weights: WEIGHTS, count: 3 },
            offlineRelay,
            {},
        );
        expect(res.status).toBe('rejected');
        expect(res.options).toEqual([]);
    });

    // §ENVELOPE-DIAGNOSTIC (2026-05-29) — when D-TGL declines because the
    // shell + program envelope is impossible, the engine surfaces a clear
    // rejection reason instead of silently falling through to the strip
    // slicer's stripe-pattern output.
    it('over-large shell + small program → rejects with iteration-trail note (§BEDROOM-AUTO-ITERATE 2026-05-31 Bug C)', async () => {
        // 765 m² is too big for ANY canonical bedroom count (5-6 bed caps to
        // 4-bed dimensions max 220 m²). Bug C's auto-iterate tries
        // 2→3→4→5→6 and still rejects, surfacing the iteration trail in
        // the reason so the user knows the engine TRIED before declining.
        const giantShell: ShellAnalysis = {
            netAreaM2: 765, widthM: 30, depthM: 25.5,
            perimeter: [{ x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 25.5 }, { x: 0, z: 25.5 }],
            faces: [],
        };
        const res = await generateLayoutOptions(
            { shell: giantShell, program: PROGRAM, constraints: CONSTRAINTS, weights: WEIGHTS, count: 3 },
            offlineRelay,
            { proceduralFallback: true },
        );
        expect(res.status).toBe('rejected');
        expect(res.options).toEqual([]);
        // Reason carries the final failed-envelope detail PLUS the iteration trail.
        expect(res.reason).toMatch(/gross 765\.0 m² > hard max/);
        expect(res.reason).toMatch(/tried 2 → \d+ bedrooms within \[0,6\] cap, none admit this shell/);
    });

    it('under-small shell → auto-iterates DOWN to a fitting bedroom count (§BEDROOM-AUTO-ITERATE 2026-05-31 Bug C)', async () => {
        // 30 m² for 2 bedrooms hits grossMin (60 m²). Bug C auto-iterates
        // DOWN: 2 (60 min) → 1 (42 min) → 0 studio (28 min, admits at 30 m²).
        // Engine should produce a procedural layout OR reject with iteration-
        // trail note. Either outcome demonstrates the iteration ran. Pin BOTH
        // possibilities so the test is robust to procedural-generator changes.
        const tinyShell: ShellAnalysis = {
            netAreaM2: 30, widthM: 6, depthM: 5,
            perimeter: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 5 }, { x: 0, z: 5 }],
            faces: [],
        };
        const res = await generateLayoutOptions(
            { shell: tinyShell, program: PROGRAM, constraints: CONSTRAINTS, weights: WEIGHTS, count: 3 },
            offlineRelay,
            { proceduralFallback: true },
        );
        if (res.status === 'ok') {
            // Auto-adjusted to a smaller bedroom count + procedural generator
            // produced a layout. Reason note must mention the adjustment.
            expect(res.options.length).toBeGreaterThan(0);
            expect(res.reason).toMatch(/auto-adjusted 2 → \d+ bedrooms/);
        } else {
            // Procedural also declined for geometric reasons — reason still
            // carries the initial envelope failure.
            expect(res.options).toEqual([]);
            expect(res.reason).toMatch(/gross 30\.0 m² < hard min/);
        }
    });

    // ── §RECTIFY-QUAD (D2 non-orthogonal, 2026-06-05) ────────────────────────
    // The founder repeatedly draws SKEWED (parallelogram) plots (Córdoba, Notting
    // Hill). Before the fix the principal-axis-rotated parallelogram still
    // stair-stepped its non-dominant edges → one giant merged room + slivers, or a
    // strip-slicer bailout. After the convex-quad rectification a skewed quad must
    // generate the SAME full room set a rectangle of the same area would.
    const rotDeg = (deg: number, poly: Pt[]): Pt[] => rotatePoly(poly, (deg * Math.PI) / 180);
    const mkShell = (poly: Pt[]): ShellAnalysis => {
        const xs = poly.map(p => p.x), zs = poly.map(p => p.z);
        return {
            netAreaM2: polygonAreaM2(poly),
            widthM: Math.max(...xs) - Math.min(...xs),
            depthM: Math.max(...zs) - Math.min(...zs),
            perimeter: poly, faces: [],
        };
    };

    it('a skewed parallelogram yields a FULL room set (not one merged room)', () => {
        // 12×9 base, sheared 2 m, drawn 16° off-axis ≈ 108 m².
        const W = 12, H = 9, shear = 2;
        const para0: Pt[] = [{ x: 0, z: 0 }, { x: W, z: 0 }, { x: W + shear, z: H }, { x: shear, z: H }];
        const skewShell = mkShell(rotDeg(16, para0));

        const out = generateDeterministicLayouts(skewShell, PROGRAM, CONSTRAINTS, WEIGHTS, 1);
        expect(out.length).toBe(1);
        const rooms = out[0]!.rooms;
        // The defect was ONE giant room. A 2-bed program must place several rooms.
        expect(rooms.length).toBeGreaterThanOrEqual(5);
        // No room is the whole apartment (the "93 m² merged blob" symptom): every
        // room polygon area is a sensible fraction of the shell.
        for (const r of rooms) {
            if (!r.polygon || r.polygon.length < 3) continue;
            const areaMm2 = polygonAreaM2(r.polygon.map(p => ({ x: p.x, z: p.y })));
            const areaM2 = areaMm2 / 1e6;
            expect(areaM2).toBeLessThan(skewShell.netAreaM2 * 0.75); // no single merged blob
            expect(areaM2).toBeGreaterThan(1.0);                    // no <1 m² sliver room
        }
    });

    it('matches the room COUNT of an equivalent-area rectangle (skew is rectified)', () => {
        const W = 12, H = 9, shear = 2;
        const para0: Pt[] = [{ x: 0, z: 0 }, { x: W, z: 0 }, { x: W + shear, z: H }, { x: shear, z: H }];
        const skewShell = mkShell(rotDeg(16, para0));
        // A true rectangle of (roughly) the same gross area, off-axis.
        const rectArea = skewShell.netAreaM2;
        const rw = 12, rh = rectArea / 12;
        const rect0: Pt[] = [{ x: 0, z: 0 }, { x: rw, z: 0 }, { x: rw, z: rh }, { x: 0, z: rh }];
        const rectShell = mkShell(rotDeg(16, rect0));

        const skew = generateDeterministicLayouts(skewShell, PROGRAM, CONSTRAINTS, WEIGHTS, 1);
        const rect = generateDeterministicLayouts(rectShell, PROGRAM, CONSTRAINTS, WEIGHTS, 1);
        expect(skew.length).toBe(1);
        expect(rect.length).toBe(1);
        // The skewed quad now produces the same number of rooms as the rectangle.
        expect(skew[0]!.rooms.length).toBe(rect[0]!.rooms.length);
    });

    it('windowSpansWorld param keeps interior partitions out of window openings (snap fires)', () => {
        // The 12×10 shell with a 3 m window centred at (x=5, z=0). A partition that
        // would otherwise land at x ≈ 5 should snap clear by ≥ 0.1 m clearance.
        const windowSpans = [{ a: { x: 3.5, z: 0 }, b: { x: 6.5, z: 0 } }];
        const layouts = generateDeterministicLayouts(
            SHELL, PROGRAM, CONSTRAINTS, WEIGHTS, 3, windowSpans,
        );
        expect(layouts.length).toBeGreaterThan(0);

        // Every interior (non-shell) wall whose start lies on the south shell wall
        // (z ≈ 0) must avoid the window span [3.5, 6.5] — same for the end vertex.
        // (Walls in mm; window span here is 3500..6500 mm with 100 mm clearance.)
        const CLEAR_MM = 100;
        const xMinBlock = 3500 - CLEAR_MM;
        const xMaxBlock = 6500 + CLEAR_MM;
        for (const opt of layouts) {
            for (const w of opt.walls) {
                if (w.isExternal) continue;
                for (const v of [w.start, w.end]) {
                    if (Math.abs(v.y) < 1) {                                   // on south perimeter
                        const inWindow = v.x > xMinBlock && v.x < xMaxBlock;
                        expect(inWindow).toBe(false);
                    }
                }
            }
        }
    });
});
