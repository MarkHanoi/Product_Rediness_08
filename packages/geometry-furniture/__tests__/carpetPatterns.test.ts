/**
 * §CARPET97 (founder, 2026-08-25) — the PURE half of the ten new carpets.
 *
 * What this suite pins, and why each of these is the interesting question:
 *
 *  A. THE PARAMETRIC RULE. Resizing a rug must EXTEND its pattern (more motifs
 *     at constant real-world scale), never STRETCH it. Doubling the width must
 *     roughly double `motifCountX` while `wavelengthXm` holds. A stretching
 *     implementation fails this exactly backwards — constant count, doubled
 *     wavelength — so the assertion discriminates, it does not merely pass.
 *
 *  B. THE CANVAS BUDGET ("LIGHT — PERFORMANCE BEST POSSIBLE"). Every design's
 *     texture must stay inside a stated ceiling at a realistic rug size, and the
 *     tiled designs must be a further order of magnitude below that. The legacy
 *     budget is computed alongside so the win is a NUMBER in the test output,
 *     not an adjective in a commit message.
 *
 *  C. DETERMINISM. Same dimensions ⇒ byte-identical draw-call sequence. No
 *     Math.random anywhere; command snapshots must round-trip.
 *
 *  D. THE DRAWERS ACTUALLY DRAW. `happy-dom` returns **null** from
 *     `canvas.getContext('2d')`, which is why no builder-level test has ever
 *     reached a drawing statement in this package. The recording context below
 *     implements `Carpet2DContext` — the SAME interface the real browser context
 *     is checked against in `carpetTexture.ts` — so the double cannot be more
 *     capable than the real thing.
 */
import { describe, it, expect } from 'vitest';
import {
    type CarpetPatternId,
    type Carpet2DContext,
    CARPET_PATTERNS,
    RECTANGULAR_CARPET_PATTERNS,
    ROUND_CARPET_PATTERNS,
    CARPET_MAX_CANVAS_PX,
    planCarpetTexture,
    drawCarpetPattern,
    carpetTextureBytes,
    carpetSeedFromPosition,
    pickCarpetPatternForSeed,
} from '../src/builders/carpetPatterns';

const ALL_IDS = Object.keys(CARPET_PATTERNS) as CarpetPatternId[];

// ─── A recording 2D context ──────────────────────────────────────────────────
// Implements exactly `Carpet2DContext`, no more. Numbers are rounded into the
// call log so sub-pixel float noise cannot make a deterministic run look
// non-deterministic.
interface RecordingCtx extends Carpet2DContext { readonly calls: string[] }

function makeRecordingCtx(): RecordingCtx {
    const calls: string[] = [];
    const n = (v: number): string => String(Math.round(v * 100) / 100);
    const ctx: RecordingCtx = {
        calls,
        fillStyle: '' as unknown,
        strokeStyle: '' as unknown,
        lineWidth: 1,
        lineCap: 'butt' as unknown,
        lineJoin: 'miter' as unknown,
        miterLimit: 10,
        globalAlpha: 1,
        fillRect: (x, y, w, h) => { calls.push(`fillRect ${n(x)} ${n(y)} ${n(w)} ${n(h)} ${String(ctx.fillStyle)}`); },
        beginPath: () => { calls.push('beginPath'); },
        closePath: () => { calls.push('closePath'); },
        moveTo: (x, y) => { calls.push(`moveTo ${n(x)} ${n(y)}`); },
        lineTo: (x, y) => { calls.push(`lineTo ${n(x)} ${n(y)}`); },
        quadraticCurveTo: (cx, cy, x, y) => { calls.push(`quad ${n(cx)} ${n(cy)} ${n(x)} ${n(y)}`); },
        arc: (x, y, r, a0, a1) => { calls.push(`arc ${n(x)} ${n(y)} ${n(r)} ${n(a0)} ${n(a1)}`); },
        fill: () => { calls.push(`fill ${String(ctx.fillStyle)}`); },
        stroke: () => { calls.push(`stroke ${String(ctx.strokeStyle)} w=${n(ctx.lineWidth)}`); },
        save: () => { calls.push('save'); },
        restore: () => { calls.push('restore'); },
    };
    return ctx;
}

const drawTo = (id: CarpetPatternId, w: number, l: number): RecordingCtx => {
    const ctx = makeRecordingCtx();
    drawCarpetPattern(id, ctx, planCarpetTexture(id, w, l));
    return ctx;
};

describe('§CARPET97 — the ten designs are registered exactly once', () => {
    it('the id union, the spec table and the two shape lists agree', () => {
        expect(ALL_IDS).toHaveLength(10);
        expect(RECTANGULAR_CARPET_PATTERNS).toHaveLength(9);
        expect(ROUND_CARPET_PATTERNS).toEqual(['round_braided']);
        // Every id is in exactly one shape list, and the lists agree with the spec.
        for (const id of ALL_IDS) {
            const inRect = RECTANGULAR_CARPET_PATTERNS.includes(id);
            const inRound = ROUND_CARPET_PATTERNS.includes(id);
            expect(inRect !== inRound, `${id} must be in exactly one shape list`).toBe(true);
            expect(CARPET_PATTERNS[id].shape).toBe(inRound ? 'round' : 'rect');
        }
    });

    it('the ROUND design is excluded from the seeded variety pool', () => {
        // A round body inscribes itself in min(w, l) — handing it a rectangular
        // auto-furnish footprint would silently shrink the rug.
        for (let seed = 0; seed < 200; seed++) {
            expect(CARPET_PATTERNS[pickCarpetPatternForSeed(seed)].shape).toBe('rect');
        }
        // …and the pool does reach every rectangular design.
        const seen = new Set<CarpetPatternId>();
        for (let seed = 0; seed < 200; seed++) seen.add(pickCarpetPatternForSeed(seed));
        expect(seen.size).toBe(RECTANGULAR_CARPET_PATTERNS.length);
    });

    it('the position seed is pure and varies per room', () => {
        expect(carpetSeedFromPosition(1.2, 0, 3.4)).toBe(carpetSeedFromPosition(1.2, 0, 3.4));
        expect(carpetSeedFromPosition(1.2, 0, 3.4)).not.toBe(carpetSeedFromPosition(6.8, 0, 3.4));
    });
});

describe('§CARPET97 A — the pattern EXTENDS, it does not STRETCH', () => {
    // A stretching implementation would show the OPPOSITE of both assertions:
    // count unchanged, wavelength doubled.
    it.each(ALL_IDS)('%s: doubling the width doubles the motif count at constant wavelength', (id) => {
        const small = planCarpetTexture(id, 2.0, 2.0);
        const large = planCarpetTexture(id, 4.0, 2.0);

        expect(large.motifCountX, `${id} count did not grow — the pattern stretched`)
            .toBeGreaterThan(small.motifCountX * 1.6);

        // `checkerboard` snaps to whole periods so its border lands on a whole
        // square; that rounding moves the wavelength by at most half a period,
        // which is why this is a tolerance and not an equality. Every other
        // design holds its wavelength exactly.
        const tol = CARPET_PATTERNS[id].snapToWholePeriods ? 0.30 : 1e-9;
        const drift = Math.abs(large.wavelengthXm - small.wavelengthXm) / small.wavelengthXm;
        expect(drift, `${id} wavelength drifted ${(drift * 100).toFixed(1)}%`).toBeLessThanOrEqual(tol);
    });

    it.each(RECTANGULAR_CARPET_PATTERNS)('%s: doubling the LENGTH extends along Y too', (id) => {
        const spec = CARPET_PATTERNS[id];
        const small = planCarpetTexture(id, 3.0, 1.5);
        const large = planCarpetTexture(id, 3.0, 3.0);
        if (spec.periodYm === 0) {
            // `fine_stripe` is uniform along its length by design — there is no
            // Y motif to count, and claiming one would be a lie.
            expect(small.motifCountY).toBe(1);
            expect(large.motifCountY).toBe(1);
            return;
        }
        expect(large.motifCountY).toBeGreaterThan(small.motifCountY * 1.6);
        const tol = spec.snapToWholePeriods ? 0.30 : 1e-9;
        expect(Math.abs(large.wavelengthYm - small.wavelengthYm) / small.wavelengthYm)
            .toBeLessThanOrEqual(tol);
    });

    it('the motif wavelength is the SPEC period, in metres, at every rug size', () => {
        for (const id of ALL_IDS) {
            const spec = CARPET_PATTERNS[id];
            if (spec.snapToWholePeriods || spec.periodXm === 0) continue;
            for (const w of [1.0, 2.4, 3.0, 6.0]) {
                const plan = planCarpetTexture(id, w, 2.0);
                expect(plan.wavelengthXm, `${id} @ ${w} m`).toBeCloseTo(spec.periodXm, 6);
            }
        }
    });
});

describe('§CARPET97 B — the canvas budget is bounded and measured', () => {
    /** What the pre-existing PatchworkCarpetBuilder mints for the same rug:
     *  cols = round(3.0/0.10) = 30, rows = round(2.0/0.10) = 20, 64 px per tile
     *  ⇒ 1920 × 1280 RGBA, ×4/3 for the mip chain. */
    const LEGACY_PATCHWORK_BYTES = Math.round(1920 * 1280 * 4 * (4 / 3));

    it('reports every design at 3.0 × 2.0 m, against the legacy budget', () => {
        const rows = ALL_IDS.map((id) => {
            const plan = planCarpetTexture(id, 3.0, 2.0);
            return {
                id, tiled: plan.tiled,
                canvas: `${plan.canvasW}x${plan.canvasH}`,
                kb: Math.round(carpetTextureBytes(plan) / 1024),
                'x lighter': +(LEGACY_PATCHWORK_BYTES / carpetTextureBytes(plan)).toFixed(1),
            };
        });
        // Printed on purpose — the founder asked for numbers, so the suite emits them.
        // eslint-disable-next-line no-console
        console.table(rows);
        expect(Math.round(LEGACY_PATCHWORK_BYTES / 1024)).toBe(12800); // 12.5 MB legacy
        expect(rows).toHaveLength(10);
    });

    it.each(ALL_IDS)('%s: a 3.0 × 2.0 m rug stays under 2.2 MB of texture', (id) => {
        const bytes = carpetTextureBytes(planCarpetTexture(id, 3.0, 2.0));
        expect(bytes).toBeLessThanOrEqual(2.2 * 1024 * 1024);
        expect(bytes).toBeLessThan(LEGACY_PATCHWORK_BYTES / 5); // ≥5× lighter than legacy
    });

    it('TILED designs are a further order of magnitude below the full-canvas ones', () => {
        for (const id of ALL_IDS) {
            if (!CARPET_PATTERNS[id].tiled) continue;
            const bytes = carpetTextureBytes(planCarpetTexture(id, 3.0, 2.0));
            expect(bytes, `${id}`).toBeLessThanOrEqual(400 * 1024);
        }
    });

    it('a HUGE rug is capped, not allowed to mint a 4096² canvas', () => {
        for (const id of ALL_IDS) {
            const plan = planCarpetTexture(id, 12.0, 9.0);
            expect(plan.canvasW, `${id}`).toBeLessThanOrEqual(CARPET_MAX_CANVAS_PX);
            expect(plan.canvasH, `${id}`).toBeLessThanOrEqual(CARPET_MAX_CANVAS_PX);
            // …and the motif count still grew, so capping cost resolution, not scale.
            expect(plan.motifCountX).toBeGreaterThan(planCarpetTexture(id, 3.0, 2.0).motifCountX);
        }
    });

    it('a TINY rug still gets a usable canvas', () => {
        for (const id of ALL_IDS) {
            const plan = planCarpetTexture(id, 0.4, 0.3);
            expect(plan.canvasW, `${id}`).toBeGreaterThanOrEqual(4);
            expect(plan.canvasH, `${id}`).toBeGreaterThanOrEqual(4);
        }
    });
});

describe('§CARPET97 C+D — the drawers run, and run deterministically', () => {
    it.each(ALL_IDS)('%s: draws without throwing and emits real work', (id) => {
        const ctx = drawTo(id, 3.0, 2.0);
        expect(ctx.calls.length).toBeGreaterThan(4);
        // Every design paints its ground first — a design that forgot would
        // leave a transparent rug.
        expect(ctx.calls[0]).toMatch(/^fillRect 0 0 /);
    });

    it.each(ALL_IDS)('%s: identical dimensions produce an identical call sequence', (id) => {
        expect(drawTo(id, 2.6, 1.8).calls).toEqual(drawTo(id, 2.6, 1.8).calls);
    });

    it.each(ALL_IDS)('%s: a different size changes the DRAWING or the REPEAT', (id) => {
        const smallCalls = drawTo(id, 2.0, 1.5).calls;
        const largeCalls = drawTo(id, 4.0, 3.0).calls;
        if (CARPET_PATTERNS[id].tiled) {
            // A tiled design's TILE is size-invariant on purpose — that is what
            // makes it cheap. The size lands entirely in texture.repeat, and
            // this is the assertion that proves the tile is genuinely one
            // period rather than a whole-rug canvas that happens to be small.
            expect(smallCalls, `${id} tile drifted with rug size`).toEqual(largeCalls);
            expect(planCarpetTexture(id, 4.0, 3.0).repeatX)
                .toBeGreaterThan(planCarpetTexture(id, 2.0, 1.5).repeatX);
        } else {
            expect(smallCalls).not.toEqual(largeCalls);
        }
    });

    it('each design uses the drawing primitive its reference actually needs', () => {
        // Guards against a design silently degrading to "flat rectangle" — the
        // failure mode a canvas-free test environment would otherwise hide.
        expect(drawTo('moons', 3, 2).calls.some((c) => c.startsWith('arc'))).toBe(true);
        expect(drawTo('round_braided', 3, 3).calls.some((c) => c.startsWith('arc'))).toBe(true);
        expect(drawTo('line_art', 3, 2).calls.some((c) => c.startsWith('quad'))).toBe(true);
        expect(drawTo('line_art', 3, 2).calls.some((c) => c.startsWith('stroke'))).toBe(true);
        expect(drawTo('diamond_trellis', 3, 2).calls.some((c) => c.startsWith('lineTo'))).toBe(true);
    });

    it('checkerboard paints two rust squares per tile, on a cream ground', () => {
        const calls = drawTo('checkerboard', 3.0, 2.0).calls;
        const rust = calls.filter((c) => c.includes('#a8482a'));
        expect(rust).toHaveLength(2);
    });

    it('staggered stripe offsets its three columns — not one plain band run', () => {
        const terracotta = drawTo('staggered_stripe', 3.0, 2.0).calls
            .filter((c) => c.includes('#b8542f'));
        // Three distinct column x-origins ⇒ the running-bond offset is real.
        const xs = new Set(terracotta.map((c) => c.split(' ')[1]));
        expect(xs.size).toBe(3);
        // …and the bands within a column sit at different y for different columns.
        const ys = new Set(terracotta.map((c) => c.split(' ')[2]));
        expect(ys.size).toBeGreaterThan(3);
    });

    it('bordered jute inks a border on all FOUR sides', () => {
        const sage = drawTo('bordered_jute', 3.0, 2.0).calls.filter((c) => c.includes('#7d8b63'));
        const plan = planCarpetTexture('bordered_jute', 3.0, 2.0);
        const xs = sage.map((c) => Number(c.split(' ')[1]));
        const ys = sage.map((c) => Number(c.split(' ')[2]));
        expect(Math.min(...xs)).toBeLessThan(plan.canvasW * 0.2);   // left run
        expect(Math.max(...xs)).toBeGreaterThan(plan.canvasW * 0.6); // right run
        expect(Math.min(...ys)).toBeLessThan(plan.canvasH * 0.2);   // top run
        expect(Math.max(...ys)).toBeGreaterThan(plan.canvasH * 0.6); // bottom run
    });

    it('colour block paints the pale-blue L focal point, cream notch and all', () => {
        const calls = drawTo('colour_block', 3.0, 2.0).calls;
        const paleIdx = calls.findIndex((c) => c.includes('#a9c4d6'));
        expect(paleIdx).toBeGreaterThan(0);
        // The cream knock-out that turns the 2×2 into an L is painted after it.
        expect(calls.slice(paleIdx + 1).some((c) => c.includes('#ece5d8'))).toBe(true);
    });

    it('fine stripe emits both the orange and the tan block once per tile', () => {
        const calls = drawTo('fine_stripe', 3.0, 2.0).calls;
        expect(calls.filter((c) => c.includes('#cf6a2a'))).toHaveLength(1);
        expect(calls.filter((c) => c.includes('#c39b62'))).toHaveLength(1);
        expect(calls.filter((c) => c.includes('#2b2823')).length).toBeGreaterThan(5);
    });

    it('braided jute stays TONAL — no second colour family enters the drawing', () => {
        const calls = drawTo('braided_jute', 3.0, 2.0).calls;
        const hexes = new Set(
            calls.map((c) => /#[0-9a-f]{6}/.exec(c)?.[0]).filter((h): h is string => !!h),
        );
        // Three close jute tones and nothing else.
        expect([...hexes].sort()).toEqual(['#d2bd91', '#dcc9a0', '#e2d2ad']);
    });
});
