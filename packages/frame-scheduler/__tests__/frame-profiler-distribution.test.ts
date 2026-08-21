/**
 * §NAV-SMOOTHNESS (L-1782) — FrameProfiler must report the DISTRIBUTION, because
 * the average provably cannot see what the founder is complaining about.
 *
 * ═══ THE ARGUMENT THIS SUITE MAKES EXECUTABLE ══════════════════════════════
 *
 * The founder's request is *"I want to navigate flowing … as smooth as possible"*.
 * Smoothness is a property of the WORST frames. `FrameProfiler` shipped reporting
 * `fps` and an AVERAGE frame time, and those two numbers rank a hitchy session
 * ABOVE a smooth one:
 *
 *   • Session A — 58 frames at 8 ms + 2 frames at 120 ms.
 *     avg ≈ 11.7 ms, fps ≈ 60. Reads HEALTHY. The user saw two visible stalls.
 *   • Session B — 60 frames at 25 ms, dead steady.
 *     avg = 25 ms, fps = 40. Reads WORSE on both shipped numbers. FEELS BETTER.
 *
 * ⭐ So the first test below is a NON-VACUITY GUARD in the strongest form
 * available: it asserts that on the OLD numbers alone, A beats B — i.e. that the
 * shipped instrument really would have sent the reader to the wrong session — and
 * then asserts the NEW numbers rank them correctly. Without that first half, the
 * new rows could be right by accident and this suite would prove nothing.
 *
 * ⚠ AND ONE OF THE NEW ROWS WOULD ALSO HAVE MISSED IT. This suite was drafted
 * asserting that `p95` separates A from B. It does not, and the failing run was
 * correct: 2 stalls in 60 frames is 3.3% of the window, so the 95th percentile
 * lands inside the FAST frames and reads 8 ms for the hitchy session against 25 ms
 * for the smooth one. A percentile describes the BULK of a distribution and is
 * structurally blind to a rare spike. "Add p95" is the reflexive answer to "the
 * average is hiding something", and for THIS defect shape it would have been a
 * second instrument issuing a second false all-clear. `p95` is kept — it is the
 * right statistic for SUSTAINED slowness, and there is a test for that case — but
 * `worst` and `hitches` are the rows that answer the founder, and the blindness is
 * asserted rather than left as a comment.
 *
 * ⚠ WHAT IT DOES NOT ESTABLISH. There is no rAF and no GPU here; frame costs are
 * injected. This proves the STATISTIC (does the profiler compute and surface the
 * distribution it claims), never that any particular scene is smooth. Only the
 * founder's own console can say that, which is exactly why the row has to exist.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FrameProfiler } from '../src/FrameProfiler.js';

const g = globalThis as { __pryzmFrameProfile?: boolean };

/**
 * Drive one full 1 s window of frames through the profiler and return the single
 * line it logged. `endFrame` only emits once the window elapses, so the last frame
 * carries the clock past 1000 ms.
 */
function runWindow(frameCosts: number[]): string {
    const prof = new FrameProfiler();
    prof.isOn();
    let now = 0;
    prof.beginFrame(now);
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
        lines.push(a.map(String).join(' '));
    });
    try {
        for (let i = 0; i < frameCosts.length; i++) {
            const cost = frameCosts[i]!;
            // Advance past 1 s only on the final frame, so exactly one line lands.
            now += i === frameCosts.length - 1 ? 1001 : 1;
            prof.endFrame(cost, now);
        }
    } finally {
        spy.mockRestore();
    }
    expect(lines).toHaveLength(1);
    return lines[0]!;
}

/** Pull a `key=value` number out of the profiler's line. */
function field(line: string, key: string): number {
    const m = new RegExp(`${key}=([0-9.]+)`).exec(line);
    expect(m, `field "${key}" missing from: ${line}`).toBeTruthy();
    return Number(m![1]);
}

beforeEach(() => { g.__pryzmFrameProfile = true; });
afterEach(() => { delete g.__pryzmFrameProfile; });

// ═════════════════════════════════════════════════════════════════════════════

describe('§NAV-SMOOTHNESS — FrameProfiler distribution', () => {

    /** 58 fast frames + 2 stalls. Feels BAD. */
    const HITCHY = [...Array<number>(58).fill(8), 120, 118];
    /** 60 steady frames. Feels GOOD. */
    const STEADY = Array<number>(60).fill(25);

    it('⭐ NON-VACUITY — on AVERAGE alone the hitchy session outranks the steady one', () => {
        const hitchyAvg = HITCHY.reduce((a, b) => a + b, 0) / HITCHY.length;
        const steadyAvg = STEADY.reduce((a, b) => a + b, 0) / STEADY.length;
        // This is the defect, stated as an inequality: the OLD instrument's headline
        // number says the session the user hated is the better one.
        expect(hitchyAvg).toBeLessThan(steadyAvg);
    });

    it('⭐ …and worst + hitches rank them the right way round', () => {
        const hitchy = runWindow(HITCHY);
        const steady = runWindow(STEADY);

        expect(field(hitchy, 'worst')).toBeGreaterThan(field(steady, 'worst'));
        expect(hitchy).toContain('hitches=2/60');
        expect(steady).toContain('hitches=0/60');
    });

    it(
        '⭐⭐ AND p95 ALONE WOULD ALSO HAVE MISSED IT — which is why `worst` and ' +
        '`hitches` exist beside it, and why this is asserted rather than assumed',
        () => {
            // ⚠ THIS TEST WAS WRITTEN EXPECTING THE OPPOSITE AND THE CODE WAS RIGHT.
            // The first draft asserted `p95(hitchy) > p95(steady)`; it failed, reading
            // 8 vs 25, and the FAILURE was correct arithmetic: 2 stalls in 60 frames
            // is 3.3% of the window, so the 95th percentile sits at rank 56 — squarely
            // inside the fast frames. A percentile is a statistic about the BULK of a
            // distribution and is structurally blind to a rare spike.
            //
            // That is worth an assertion of its own, because "add p95" is the reflexive
            // answer to "the average is hiding something" and, for THIS defect shape —
            // occasional navigation hitches — it would have been a second instrument
            // giving a second false all-clear. p95 stays (it is the right statistic for
            // SUSTAINED slowness, and it correctly ranks the steady session as the more
            // expensive one). But `worst` and `hitches` are what answer the founder.
            const hitchy = runWindow(HITCHY);
            const steady = runWindow(STEADY);

            // p95 ranks them the "wrong" way — correctly, by its own definition.
            expect(field(hitchy, 'p95')).toBeLessThan(field(steady, 'p95'));
            // …while worst ranks them the way the USER experienced them.
            expect(field(hitchy, 'worst')).toBeGreaterThan(field(steady, 'worst'));
        },
    );

    it('p95 DOES catch sustained slowness — half the window slow moves it', () => {
        // The case p95 is genuinely for: not a spike, a regime.
        const sustained = [...Array<number>(30).fill(8), ...Array<number>(30).fill(60)];
        const line = runWindow(sustained);
        expect(field(line, 'p95')).toBeGreaterThan(field(line, 'frame'));
        expect(field(line, 'p95')).toBeCloseTo(60, 1);
    });

    it('worst is the single worst frame, not an average of the bad ones', () => {
        const line = runWindow(HITCHY);
        expect(field(line, 'worst')).toBeCloseTo(120, 1);
    });

    it('the hitchy window still SURFACES its stalls, via worst not via the mean', () => {
        const line = runWindow(HITCHY);
        const avg = field(line, 'frame');
        expect(field(line, 'worst')).toBeGreaterThan(avg * 5);
        expect(line).toContain('frames over 32ms');
    });

    it('hitches ALWAYS carry their denominator — a bare count is not a finding', () => {
        const line = runWindow(HITCHY);
        expect(line).toContain(`hitches=2/${HITCHY.length}`);
    });

    it('a steady window reports ZERO hitches and says so in words', () => {
        const line = runWindow(STEADY);
        expect(line).toContain(`hitches=0/${STEADY.length}`);
        expect(line).not.toContain('frames over');
    });

    it('a truly smooth window is called smooth', () => {
        const line = runWindow(Array<number>(60).fill(8));
        expect(line).toContain('smooth');
        expect(field(line, 'worst')).toBeCloseTo(8, 1);
    });

    it('the window RESETS — a hitch does not haunt the next second', () => {
        const prof = new FrameProfiler();
        prof.isOn();
        const lines: string[] = [];
        const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
            lines.push(a.map(String).join(' '));
        });
        let now = 0;
        prof.beginFrame(now);
        try {
            // Window 1: one enormous stall.
            for (let i = 0; i < 30; i++) { now += 1; prof.endFrame(i === 0 ? 200 : 8, now); }
            now += 1001; prof.endFrame(8, now);
            // Window 2: clean.
            for (let i = 0; i < 30; i++) { now += 1; prof.endFrame(8, now); }
            now += 1001; prof.endFrame(8, now);
        } finally {
            spy.mockRestore();
        }
        expect(lines).toHaveLength(2);
        expect(field(lines[0]!, 'worst')).toBeCloseTo(200, 1);
        // If this reads 200, the accumulator is not being cleared and every later
        // window inherits the first stall — a permanently red instrument.
        expect(field(lines[1]!, 'worst')).toBeCloseTo(8, 1);
    });

    it('costs NOTHING when the flag is off — isOn() is the only read', () => {
        delete g.__pryzmFrameProfile;
        const prof = new FrameProfiler();
        expect(prof.isOn()).toBe(false);
    });
});
