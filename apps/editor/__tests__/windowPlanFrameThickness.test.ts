// @vitest-environment happy-dom
//
// §FIX-WINDOW-PLAN-FRAME-THICKNESS (L-280) — MEASUREMENT FIRST, THEN A GUARD.
//
// Founder: "the frame in plan view is much THICKER than in reality" (3D slender timber
// section vs a fat chunky band in plan). TWO candidates look identical on screen and
// have OPPOSITE fixes:
//   (A) GEOMETRY — the symbol draws the band at the wrong width (a literal, the wall
//       thickness, or a frame/sash confusion). Fix: derive it from the record.
//   (B) PEN — the band is the RIGHT width but is STROKED with a cut pen so heavy that
//       the stroke itself reads as a band. "Fixing" the geometry then makes the window
//       dimensionally WRONG in order to chase a rendering artefact.
//
// A WEIGHT IS NOT A THICKNESS. This file MEASURES the geometry the symbol actually
// emits (the outcome, not the seam) against `resolveWindowDimensions()`.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
    windowPlanSymbolBuilder,
    buildWindowStoreRecord,
    resolveWindowDimensions,
} from '@pryzm/geometry-window';

const _here = dirname(fileURLToPath(import.meta.url));
const SYMBOL_SRC = resolve(_here, '../../../packages/geometry-window/src/WindowPlanSymbolBuilder.ts');

const WALL_THICKNESS = 0.2;

/** A real host wall: 6 m along +X, 200 mm thick. */
const WALL = {
    id: 'wall-1',
    thickness: WALL_THICKNESS,
    levelId: 'L0',
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
};

/** A real placed window, built through the ONE creation chokepoint. */
function makeWindow() {
    return buildWindowStoreRecord({
        opening: {
            id: 'op-1', elementId: 'win-1', type: 'window', windowType: 'single',
            systemTypeId: 'wt-timber-casement',
            offset: 2.0, width: 1.2, height: 1.2, sillHeight: 1.0,
            frameDepth: WALL_THICKNESS,
        },
        wallId: 'wall-1',
    }) as Record<string, unknown>;
}

/**
 * The symbol runs along +X, so a point's `s` (along-wall, from the opening centre) is
 * `x − centre` and its `n` (across-wall) is `z`. Extract both from the emitted buffer.
 */
function readSegments(geo: { getAttribute(n: string): { array: ArrayLike<number>; count: number } } | null, centreX: number) {
    if (!geo) return [];
    const pos = geo.getAttribute('position');
    const out: Array<{ s: number; n: number }> = [];
    for (let i = 0; i < pos.count; i++) {
        out.push({ s: +(pos.array[i * 3]! - centreX).toFixed(6), n: +(pos.array[i * 3 + 2]!).toFixed(6) });
    }
    return out;
}

describe('§FIX-WINDOW-PLAN-FRAME-THICKNESS (L-280) — the plan frame band is a DIMENSION', () => {
    it('MEASURED: the emitted frame band equals resolveWindowDimensions().frameThickness exactly', () => {
        const win = makeWindow();
        const dims = resolveWindowDimensions(win as never);
        const centreX = (win.offset as number) + (win.width as number) / 2;

        const geo = (windowPlanSymbolBuilder as unknown as {
            _computeSymbolGeometry(w: unknown, wall: unknown, lod: string): { cut: never; proj: never } | null;
        })._computeSymbolGeometry(win, WALL, 'fine');
        expect(geo).not.toBeNull();

        const cut = readSegments(geo!.cut, centreX);
        const halfW = (win.width as number) / 2;

        // The frame band, MEASURED off the emitted geometry: the distance from the
        // opening VOID EDGE (|s| = halfW) to the frame's INNER FACE (the next |s| in).
        // NOTE (measured, not assumed): at `fine` the cut profile carries THREE |s|
        // stations — the void edge (halfW), the REBATE POCKET (clearHalf + rebate) and
        // the frame INNER FACE (clearHalf). The pocket lies OUTBOARD of the inner face
        // (the glass is captured in it and so spans past the clear opening), so the
        // frame member runs from the void edge to the SMALLEST |s|, not to the next one.
        const sMags = [...new Set(cut.map(p => Math.abs(p.s)))].sort((a, b) => b - a);
        const voidEdge = sMags[0]!;
        const innerFace = sMags[sMags.length - 1]!;
        const measuredBand = voidEdge - innerFace;

        // The across-wall extent of the cut profile — the reveal it occupies.
        const nMags = [...new Set(cut.map(p => Math.abs(p.n)))].sort((a, b) => b - a);
        const measuredReveal = nMags[0]! * 2;

        // eslint-disable-next-line no-console
        console.log('[L-280 MEASUREMENT]', {
            record_frameThickness: win.frameThickness,
            resolved_frameThickness: dims.frameThickness,
            resolved_frameDepth: dims.frameDepth,
            symbol_measured_band_along_wall: measuredBand,
            symbol_measured_reveal_across_wall: measuredReveal,
            wall_thickness: WALL_THICKNESS,
            three_d_frame_face_width: win.frameThickness,          // WindowBuilder: `const { frameThickness: ft } = win`
            three_d_frame_depth: WALL_THICKNESS + 0.02,            // WindowBuilder: wall.thickness + 0.02
        });

        // THE GAP IS THE BUG — and there is none. The band the symbol draws IS the
        // frame's real face width, to the micron.
        expect(measuredBand).toBeCloseTo(dims.frameThickness, 9);
        expect(measuredBand).toBeCloseTo(win.frameThickness as number, 9);

        // …and the frame section correctly fills the reveal, exactly as the 3D builder
        // extrudes it (`frameDepth = wall.thickness + 0.02`). A frame in plan SECTION
        // spans the wall — that is what a section IS.
        expect(measuredReveal).toBeCloseTo(WALL_THICKNESS, 9);
    });

    it('the band TRACKS the record: a slimmer frame draws a slimmer band (no literal)', () => {
        // The decisive test for candidate (A): if a literal were baked into the symbol,
        // halving the frame's face width would NOT halve the band.
        const win = { ...makeWindow(), frameThickness: 0.025 };
        const centreX = (win.offset as number) + (win.width as number) / 2;

        const geo = (windowPlanSymbolBuilder as unknown as {
            _computeSymbolGeometry(w: unknown, wall: unknown, lod: string): { cut: never; proj: never } | null;
        })._computeSymbolGeometry(win, WALL, 'fine');

        const cut = readSegments(geo!.cut, centreX);
        const sMags = [...new Set(cut.map(p => Math.abs(p.s)))].sort((a, b) => b - a);
        const measuredBand = sMags[0]! - sMags[sMags.length - 1]!;

        expect(measuredBand).toBeCloseTo(0.025, 9);
    });

    // ── §FIX-WINDOW-SYMBOL-FRAME-BRIDGE (L-289) — C09 §4.6.4c ────────────────────
    //
    // THE ACTUAL CAUSE, after my PEN hypothesis was REFUTED by the drawing agent
    // (`symbolicRuleForLayer()` returns null for any `:cut` layer, so the window's CUT
    // frame never entered the symbolic path — it got the full 0.35 mm CUT pen all along).
    //
    // The symbol was closing itself into a RECTANGLE by running the frame's wall-face CUT
    // lines ACROSS THE FULL OPENING WIDTH — i.e. across the glazing. A heavy CUT line
    // along the wall face across the glass ASSERTS A SOLID THAT IS NOT THERE, so the
    // window read as one continuous band of full wall thickness. A window in plan reads
    // `frame | glazing | frame`.
    //
    // THE FRAME WIDTH WAS NEVER WRONG (measured above) AND IS NOT TOUCHED.

    /** Cut segments as (start, end) pairs in symbol-local (s = along wall, n = across). */
    function cutSegments(win: Record<string, unknown>, lod = 'fine') {
        const centreX = (win.offset as number) + (win.width as number) / 2;
        const geo = (windowPlanSymbolBuilder as unknown as {
            _computeSymbolGeometry(w: unknown, wall: unknown, lod: string): { cut: never; proj: never } | null;
        })._computeSymbolGeometry(win, WALL, lod);
        const pts = readSegments(geo!.cut, centreX);
        const segs: Array<{ a: { s: number; n: number }; b: { s: number; n: number } }> = [];
        for (let i = 0; i < pts.length - 1; i += 2) segs.push({ a: pts[i]!, b: pts[i + 1]! });
        return segs;
    }

    it('L-289: NO CUT segment spans the glazing — the window is frame | glazing | frame', () => {
        for (const lod of ['coarse', 'medium', 'fine']) {
            const win = makeWindow();
            const dims = resolveWindowDimensions(win as never);
            const halfW = (win.width as number) / 2;
            const clearHalf = halfW - dims.frameThickness;   // the frame's inner face
            const EPS = 1e-6;

            for (const { a, b } of cutSegments(win, lod)) {
                // (1) No cut segment may cross the centre of the opening — that is the
                //     glazing zone, and the cut plane does not slice the void.
                const crossesCentre = Math.sign(a.s) * Math.sign(b.s) < 0;
                expect(crossesCentre, `[${lod}] cut segment spans the opening centre`).toBe(false);

                // (2) Every cut vertex lives ON a frame member: |s| ≥ the frame's inner
                //     face. Anything inboard of that is a solid the cut plane never met.
                //     (The rebate pocket at clearHalf+rebate is OUTBOARD of it, so it passes.)
                for (const p of [a, b]) {
                    expect(
                        Math.abs(p.s) + EPS,
                        `[${lod}] cut vertex at s=${p.s} lies inside the glazing band`,
                    ).toBeGreaterThanOrEqual(clearHalf);
                }
            }
        }
    });

    it('L-289: the JAMB SEAM REMAINS CLOSED — the frame face line starts ON the void edge', () => {
        // THE ONE REAL RISK of deleting the bridge. The host wall's plan face lines are
        // clipped at the opening's VOID EDGES; the symbol must put linework exactly there,
        // on BOTH wall faces, or a gap opens between the wall line and the frame.
        const win = makeWindow();
        const dims = resolveWindowDimensions(win as never);
        const halfW = (win.width as number) / 2;
        const clearHalf = halfW - dims.frameThickness;
        const halfThk = WALL_THICKNESS / 2;
        const EPS = 1e-6;

        const segs = cutSegments(win, 'fine');
        const near = (v: number, t: number) => Math.abs(v - t) < EPS;

        for (const sign of [-1, 1]) {
            for (const n of [-halfThk, +halfThk]) {
                // (a) A vertex sits exactly on the void edge at this wall face — the point
                //     the wall's clipped face line terminates on.
                const onVoidEdge = segs.some(({ a, b }) =>
                    [a, b].some(p => near(p.s, sign * halfW) && near(p.n, n)));
                expect(onVoidEdge, `no cut vertex on void edge s=${sign * halfW}, n=${n}`).toBe(true);

                // (b) …and it is the END of the frame's FACE LINE, which runs inward along
                //     the wall face to the frame's inner face. Wall → frame is continuous.
                const faceLine = segs.some(({ a, b }) =>
                    near(a.n, n) && near(b.n, n) &&
                    ((near(a.s, sign * halfW) && near(b.s, sign * clearHalf)) ||
                     (near(b.s, sign * halfW) && near(a.s, sign * clearHalf))));
                expect(faceLine, `frame face line missing at n=${n}, side=${sign}`).toBe(true);
            }
        }

        // And the jamb tick still bridges the full reveal AT the void edge, so the two wall
        // face lines are tied together there (the seam is closed across the wall, too).
        for (const sign of [-1, 1]) {
            const tick = segs.some(({ a, b }) =>
                near(a.s, sign * halfW) && near(b.s, sign * halfW) &&
                near(Math.abs(a.n - b.n), WALL_THICKNESS));
            expect(tick, `jamb tick missing at void edge side=${sign}`).toBe(true);
        }
    });

    it('L-289: the degenerate case (frame ≥ half the opening) still draws the full-width face line', () => {
        // There, the cut IS solid frame all the way across — no glazing band exists to
        // cross, so the full-width line is the HONEST reading, not the bug.
        const win = { ...makeWindow(), frameThickness: 0.8 };   // ≥ halfW (0.6)
        const halfW = (win.width as number) / 2;
        const segs = cutSegments(win, 'fine');
        const spans = segs.some(({ a, b }) =>
            Math.abs(a.n - b.n) < 1e-6 && Math.abs(Math.abs(a.s - b.s) - 2 * halfW) < 1e-6);
        expect(spans).toBe(true);
    });

    it('NO literal thickness survives in the symbol builder (the bug WAS literals — forbid them)', () => {
        // Same source-level assertion pattern as windowCreationParity P-4.
        const src = readFileSync(SYMBOL_SRC, 'utf8');
        const code = src
            .replace(/\/\*[\s\S]*?\*\//g, '')     // block comments
            .replace(/^\s*\/\/.*$/gm, '');        // line comments

        // No hard-coded metric thickness assigned to a frame/sash/glazing/mullion name.
        expect(code).not.toMatch(/frameThick\w*\s*[:=]\s*0?\.\d+/);
        expect(code).not.toMatch(/sashThick\w*\s*[:=]\s*0?\.\d+/);
        expect(code).not.toMatch(/glazThick\w*\s*[:=]\s*0?\.\d+/);
        expect(code).not.toMatch(/mullion\w*\s*[:=]\s*0?\.\d+/);
        expect(code).not.toMatch(/rebate\w*\s*[:=]\s*0?\.\d+/);

        // And every dimension it draws with comes from the ONE resolver.
        expect(code).toMatch(/resolveWindowDimensions\s*\(/);
    });
});
