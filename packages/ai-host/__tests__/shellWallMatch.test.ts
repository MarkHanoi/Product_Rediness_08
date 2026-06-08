// T1.W-C — shell-wall matcher pure tests.

import { describe, expect, it } from 'vitest';
import {
    matchShellHost,
    resolveShellWindow,
    resolveAllShellWindows,
    cornerSetbackForWall,
    type ShellWall,
} from '../src/workflows/apartmentLayout/windowEmission/shellWallMatch.js';
import type { LayoutWall, LayoutWindow } from '../src/workflows/apartmentLayout/types.js';

// Default planToWorld: mm → m, plan-y = world-z.
const shell = (id: string, sx: number, sz: number, ex: number, ez: number): ShellWall =>
    ({ id, start: { x: sx, z: sz }, end: { x: ex, z: ez } });

const optWall = (sxMm: number, syMm: number, exMm: number, eyMm: number, isExternal = true): LayoutWall =>
    ({ start: { x: sxMm, y: syMm }, end: { x: exMm, y: eyMm }, isExternal });

describe('matchShellHost (T1.W-C)', () => {
    it('matches same-direction endpoints (no reverse)', () => {
        // Plan wall (0..5000, 0) → world (0..5, 0). Shell wall (0,0) → (5,0).
        const o = optWall(0, 0, 5000, 0);
        const m = matchShellHost(o, [shell('shell-1', 0, 0, 5, 0)]);
        expect(m).not.toBeNull();
        expect(m!.shell.id).toBe('shell-1');
        expect(m!.reversed).toBe(false);
    });

    it('matches reversed shell wall (start/end swapped)', () => {
        const o = optWall(0, 0, 5000, 0);
        const m = matchShellHost(o, [shell('shell-1', 5, 0, 0, 0)]);
        expect(m).not.toBeNull();
        expect(m!.reversed).toBe(true);
    });

    it('tolerates sub-cm endpoint drift', () => {
        const o = optWall(0, 0, 5000, 0);
        // 5 mm drift on each endpoint — well within ENDPOINT_TOL_M = 0.01.
        const m = matchShellHost(o, [shell('shell-1', 0.005, 0, 4.995, 0)]);
        expect(m).not.toBeNull();
    });

    it('returns null when no shell wall matches', () => {
        const o = optWall(0, 0, 5000, 0);
        const m = matchShellHost(o, [shell('shell-A', 0, 4, 5, 4)]);
        expect(m).toBeNull();
    });

    it('returns null on empty shell wall list', () => {
        expect(matchShellHost(optWall(0, 0, 5000, 0), [])).toBeNull();
    });

    it('picks the first matching shell wall when multiple overlap (deterministic order)', () => {
        const o = optWall(0, 0, 5000, 0);
        const m = matchShellHost(o, [shell('first', 0, 0, 5, 0), shell('second', 0, 0, 5, 0)]);
        expect(m!.shell.id).toBe('first');
    });

    // §SHELL-MATCH-TOLERANT — the NON-ORTHOGONAL case the founder hit: the D-TGL's
    // axis-aligned perimeter doesn't EXACTLY match an angled drawn shell, so the
    // tolerant fallback hosts the window on the nearest near-parallel, near-
    // collinear, overlapping shell wall (the fix for "windows never created").
    describe('§SHELL-MATCH-TOLERANT (non-orthogonal)', () => {
        it('matches a near-parallel, near-collinear shell wall with NO exact endpoint match', () => {
            // Option wall world (0,0)→(5,0.3): 3.4° off the shell + 0.3 m endpoint
            // drift → NO exact match, but within the angle (30°) + perp (1 m) tols.
            const o = optWall(0, 0, 5000, 300);
            const m = matchShellHost(o, [shell('shell-1', 0, 0, 5, 0)]);
            expect(m).not.toBeNull();
            expect(m!.shell.id).toBe('shell-1');
        });

        it('rejects a parallel shell wall beyond the perpendicular tolerance (>1 m away)', () => {
            const o = optWall(0, 0, 5000, 0);
            const m = matchShellHost(o, [shell('far', 0, 1.5, 5, 1.5)]);
            expect(m).toBeNull();
        });

        it('rejects a shell wall beyond the angle tolerance (>30°)', () => {
            const o = optWall(0, 0, 3000, 3000); // 45° option wall
            const m = matchShellHost(o, [shell('cross', 0, 0, 5, 0)]); // 0° shell
            expect(m).toBeNull();
        });

        it('projects the window onto the tolerant-matched shell wall (offset preserved ≈)', () => {
            // Window at 1.0 m offset, 1.5 m wide on the 3.4°-off option wall → its
            // centre projects to ≈ 1.0 m along the clean shell wall.
            const r = resolveShellWindow(
                { wallRef: 0, offset: 1000, width: 1500, height: 1300, sillHeight: 900, roomType: 'living' } satisfies LayoutWindow,
                [optWall(0, 0, 5000, 300)],
                [shell('shell-1', 0, 0, 5, 0)],
            );
            expect(r).not.toBeNull();
            expect(r!.shellWallId).toBe('shell-1');
            expect(r!.offsetM).toBeGreaterThan(0.7);
            expect(r!.offsetM).toBeLessThan(1.3);
            expect(r!.widthM).toBeCloseTo(1.5, 6);
        });
    });
});

describe('resolveShellWindow (T1.W-C)', () => {
    const win = (over: Partial<LayoutWindow> = {}): LayoutWindow => ({
        wallRef: 0, offset: 1000, width: 1500, height: 1300, sillHeight: 900, ...over,
    });

    it('resolves a window on an external option wall to the matching shell wall', () => {
        const r = resolveShellWindow(
            win({ roomType: 'bedroom', name: 'Bedroom Window' }),
            [optWall(0, 0, 5000, 0)],
            [shell('shell-1', 0, 0, 5, 0)],
        );
        expect(r).not.toBeNull();
        expect(r!.shellWallId).toBe('shell-1');
        // 1000 mm + 1500 mm window on a 5 m wall, same direction.
        expect(r!.offsetM).toBeCloseTo(1.0, 6);
        expect(r!.widthM).toBeCloseTo(1.5, 6);
        expect(r!.heightM).toBeCloseTo(1.3, 6);
        expect(r!.sillM).toBeCloseTo(0.9, 6);
        expect(r!.roomType).toBe('bedroom');
        expect(r!.name).toBe('Bedroom Window');
    });

    it('flips the offset when the shell wall is reversed', () => {
        // Wall length 5 m; window at 1.0 m offset, 1.5 m wide → reversed
        // offset = 5 - 1.0 - 1.5 = 2.5 m.
        const r = resolveShellWindow(
            win({ offset: 1000, width: 1500 }),
            [optWall(0, 0, 5000, 0)],
            [shell('shell-1', 5, 0, 0, 0)],
        );
        expect(r!.offsetM).toBeCloseTo(2.5, 6);
    });

    it('returns null when the host wall is INTERIOR (not isExternal)', () => {
        const r = resolveShellWindow(
            win(),
            [optWall(0, 0, 5000, 0, /* isExternal */ false)],
            [shell('shell-1', 0, 0, 5, 0)],
        );
        expect(r).toBeNull();
    });

    it('returns null when wallRef is out of range', () => {
        const r = resolveShellWindow(
            win({ wallRef: 99 }),
            [optWall(0, 0, 5000, 0)],
            [shell('shell-1', 0, 0, 5, 0)],
        );
        expect(r).toBeNull();
    });

    it('returns null when no shell wall matches the external option wall', () => {
        const r = resolveShellWindow(
            win(),
            [optWall(0, 0, 5000, 0)],
            [shell('shell-elsewhere', 0, 9, 5, 9)],
        );
        expect(r).toBeNull();
    });

    // §WINDOW-SHELL-CLAMP (A.21.D28 #5) — an over-wide window is no longer left at
    // its full width with the offset merely clamped (which pushed the opening PAST
    // the wall end — the founder's "window outside the shell"). The width is now
    // clamped to FIT the host shell wall (minus a small end clearance) and the
    // offset is kept strictly inside both ends.
    it('clamps an over-wide window to fit the host shell wall (never overruns)', () => {
        // Window 6 m wide on a 5 m wall, reversed.
        const r = resolveShellWindow(
            win({ offset: 0, width: 6000 }),     // 6 m wide, wall 5 m
            [optWall(0, 0, 5000, 0)],
            [shell('shell-1', 5, 0, 0, 0)],
        );
        expect(r).not.toBeNull();
        // A.21.D45 — width clamped to wall length − 2×CORNER_SETBACK (0.5 m on a 5 m
        // wall) = 5 − 1.0 = 4.0 m, leaving a real corner pier at each end.
        expect(r!.widthM).toBeCloseTo(4.0, 6);
        // The WHOLE opening stays on the wall WITH the corner setback at both ends.
        expect(r!.offsetM).toBeGreaterThanOrEqual(0.5 - 1e-9);
        expect(r!.offsetM + r!.widthM).toBeLessThanOrEqual(5 - 0.5 + 1e-9);
    });

    it('drops a window when the host shell wall is too short for any opening', () => {
        // A 0.3 m shell wall can't host even a minimal (0.4 m) window.
        const r = resolveShellWindow(
            win({ offset: 0, width: 1500 }),
            [optWall(0, 0, 300, 0)],
            [shell('tiny', 0, 0, 0.3, 0)],
        );
        expect(r).toBeNull();
    });

    it('keeps the whole opening strictly inside the wall for a normal window', () => {
        const r = resolveShellWindow(
            win({ offset: 1000, width: 1500 }),
            [optWall(0, 0, 5000, 0)],
            [shell('shell-1', 0, 0, 5, 0)],
        );
        expect(r).not.toBeNull();
        // A.21.D45 — the real corner setback (0.5 m on a 5 m wall) at both ends.
        expect(r!.offsetM).toBeGreaterThanOrEqual(0.5 - 1e-9);
        expect(r!.offsetM + r!.widthM).toBeLessThanOrEqual(5 - 0.5 + 1e-9);
    });
});

// ── §WINDOW-IN-SHELL-FINAL (A.21.D36, 2026-06-07) — D34b recurrence ──────────
//
// The founder's re-test: window frames still floated OUTSIDE the shell on some
// plots. Every emitted opening MUST lie strictly within its host shell wall span
// — or the window is dropped. These tests pin the invariant for the cases that
// previously let a frame poke off the wall: an option wall that extends past the
// shell wall, and a window whose centre projects beyond the shell segment.
describe('resolveShellWindow — §WINDOW-IN-SHELL-FINAL: opening never floats off the wall', () => {
    const win = (over: Partial<LayoutWindow> = {}): LayoutWindow => ({
        wallRef: 0, offset: 1000, width: 1500, height: 1300, sillHeight: 900, ...over,
    });

    // Sweep: for any matched window, the emitted opening must be fully on the
    // host shell wall span [0, shellLen]. The matcher returns null OR an
    // in-shell opening — never an opening that overruns.
    it('every resolved opening lies fully within the host shell span (or is dropped)', () => {
        const shellLen = 5;
        const cases: Array<{ offset: number; width: number; ext: number }> = [
            { offset: 0,    width: 1500, ext: 5000 },   // normal
            { offset: 4000, width: 1500, ext: 5000 },   // near the far end
            { offset: 0,    width: 6000, ext: 5000 },   // over-wide
            { offset: 4500, width: 1500, ext: 7000 },   // option wall longer than shell; window near its far end
            { offset: 6000, width: 1500, ext: 7000 },   // window centre PAST the shell end → must drop
        ];
        for (const c of cases) {
            const r = resolveShellWindow(
                win({ offset: c.offset, width: c.width }),
                [optWall(0, 0, c.ext, 0)],
                [shell('shell-1', 0, 0, shellLen, 0)],
            );
            if (r === null) continue;                     // dropped — acceptable
            // The WHOLE opening is strictly inside the shell wall span.
            expect(r.offsetM, JSON.stringify(c)).toBeGreaterThanOrEqual(-1e-6);
            expect(r.offsetM + r.widthM, JSON.stringify(c)).toBeLessThanOrEqual(shellLen + 1e-6);
        }
    });

    // A window whose host option wall, in the world frame, extends WELL past the
    // matched shell wall — its centre projects beyond the shell segment — must be
    // DROPPED, not clamped onto a wall it doesn't front (a floating frame).
    it('drops a window whose centre projects outside the matched shell segment', () => {
        // Option wall 0..10 m; window centred at ~8.75 m (offset 8000, width 1500).
        // Shell wall only spans 0..5 m → the window centre at 8.75 m is off the
        // shell. It must be dropped, never rendered off the wall plane.
        const r = resolveShellWindow(
            win({ offset: 8000, width: 1500 }),
            [optWall(0, 0, 10000, 0)],
            [shell('shell-1', 0, 0, 5, 0)],
        );
        expect(r).toBeNull();
    });
});

describe('resolveShellWindow — §WINDOW-CORNER-FIT (A.21.D39 + A.21.D45): graze-corner drops, exact-corner slides', () => {
    const win = (over: Partial<LayoutWindow> = {}): LayoutWindow => ({
        wallRef: 0, offset: 0, width: 1500, height: 1300, sillHeight: 900, ...over,
    });
    const shellLen = 5;
    // A.21.D45 — corner setback on a 5 m wall = 0.5 m (the real masonry pier).
    const END_CLEAR = 0.5;
    // A skewed (tolerant-match) option wall — 0.2 m drift so it matches the shell via
    // §SHELL-MATCH-TOLERANT (NOT an exact endpoint match), exercising the corner-fit
    // DROP path (the room only grazes the host near the corner → sliding would
    // misrepresent the façade, so it is dropped).
    const skewed = (sxMm = 0, syMm = 0, exMm = shellLen * 1000, eyMm = 200): LayoutWall =>
        optWall(sxMm, syMm, exMm, eyMm);

    it('drops a window whose GRAZED (tolerant-match) centre is closer to a corner than half-width + setback', () => {
        // 1.5 m window grazing a corner of a skew-matched shell: centre ≈ 0.5 m from the
        // start corner. It cannot sit fully inside with the 0.5 m corner setback from
        // BOTH corners (needs centre ≥ 0.75 + 0.5 = 1.25 m) → DROPPED (not slid onto a
        // wall the room only grazes).
        const r = resolveShellWindow(
            win({ offset: -250, width: 1500 }),   // centre at offset+width/2 ≈ 0.5 m
            [skewed()],
            [shell('shell-1', 0, 0, shellLen, 0)],
        );
        expect(r).toBeNull();
    });

    it('SLIDES an EXACT-match window inward to the corner pier instead of dropping it (A.21.D45)', () => {
        // The dominant orthogonal case: the room fronts the WHOLE shell wall (exact
        // endpoint match). A window that lands near the corner is SLID inward to the
        // 0.5 m pier, NOT dropped — so a long façade keeps its distributed windows.
        const r = resolveShellWindow(
            win({ offset: -250, width: 1500 }),   // would-be centre 0.5 m (near corner)
            [optWall(0, 0, shellLen * 1000, 0)],  // EXACT match
            [shell('shell-1', 0, 0, shellLen, 0)],
        );
        expect(r).not.toBeNull();
        expect(r!.offsetM).toBeGreaterThanOrEqual(END_CLEAR - 1e-6);    // slid to the pier
        expect(r!.offsetM + r!.widthM).toBeLessThanOrEqual(shellLen - END_CLEAR + 1e-6);
    });

    it('keeps a window comfortably away from both corners', () => {
        const r = resolveShellWindow(
            win({ offset: 1750, width: 1500 }),   // centre at 2.5 m (mid-wall)
            [optWall(0, 0, shellLen * 1000, 0)],
            [shell('shell-1', 0, 0, shellLen, 0)],
        );
        expect(r).not.toBeNull();
        // The kept window sits with the end clearance from both corners.
        expect(r!.offsetM).toBeGreaterThanOrEqual(END_CLEAR - 1e-6);
        expect(r!.offsetM + r!.widthM).toBeLessThanOrEqual(shellLen - END_CLEAR + 1e-6);
    });

    it('drops a GRAZED (tolerant-match) window crowding the FAR corner too', () => {
        const r = resolveShellWindow(
            win({ offset: 4250, width: 1500 }),   // centre ≈ 5.0 m == far corner
            [skewed()],
            [shell('shell-1', 0, 0, shellLen, 0)],
        );
        expect(r).toBeNull();
    });
});

describe('resolveAllShellWindows (T1.W-C)', () => {
    it('flattens resolutions across multiple windows', () => {
        const windows: LayoutWindow[] = [
            { wallRef: 0, offset: 500,  width: 1500, height: 1300, sillHeight: 900,  roomType: 'bedroom' },
            { wallRef: 1, offset: 1000, width: 1200, height: 1200, sillHeight: 1000, roomType: 'kitchen' },
        ];
        const walls: LayoutWall[] = [
            optWall(0, 0, 5000, 0),
            optWall(5000, 0, 5000, 4000),
        ];
        const shells: ShellWall[] = [
            shell('south', 0, 0, 5, 0),
            shell('east',  5, 0, 5, 4),
        ];
        const out = resolveAllShellWindows(windows, walls, shells);
        expect(out).toHaveLength(2);
        expect(out.map(r => r.shellWallId).sort()).toEqual(['east', 'south']);
    });

    it('drops unmatchable windows silently', () => {
        const out = resolveAllShellWindows(
            [{ wallRef: 0, offset: 500, width: 1500, height: 1300, sillHeight: 900 }],
            [optWall(0, 0, 5000, 0)],
            [],
        );
        expect(out).toHaveLength(0);
    });
});

// ── §WINDOW-CORNER-SPAN (A.21.D40 #1, 2026-06-07) — founder v49 re-test ───────
//
// The founder still saw a window poke past a CORNER on some plots. The old final
// invariant only required the opening inside [0, shellLen]; an over-wide
// (width-clamped) window was drag-fitted by the offset clamp and could land flush
// against a corner (offset < END_CLEAR, or end > shellLen − END_CLEAR), which —
// after the perpendicular neighbour's thickness — reads as overrunning the corner.
// Now the FULL span must sit inside [END_CLEAR, shellLen − END_CLEAR] for EVERY
// window, clamped or not; if it can't, the window is DROPPED.
describe('resolveShellWindow — §WINDOW-CORNER-SPAN: full span respects end clearance', () => {
    const win = (over: Partial<LayoutWindow> = {}): LayoutWindow => ({
        wallRef: 0, offset: 0, width: 1500, height: 1300, sillHeight: 900, ...over,
    });
    // A.21.D45 — corner setback on a 5 m wall = 0.5 m (the real masonry pier).
    const END_CLEAR = 0.5;

    // Sweep a range of offsets/widths/option-extents on a 5 m shell wall: EVERY
    // resolved opening must sit inside [END_CLEAR, shellLen − END_CLEAR] — never just
    // flush against a corner. The matcher returns null OR an in-clearance opening.
    it('every resolved opening sits inside [END_CLEAR, shellLen − END_CLEAR] (or is dropped)', () => {
        const shellLen = 5;
        const cases: Array<{ offset: number; width: number; ext: number }> = [
            { offset: 1000, width: 1500, ext: 5000 },   // normal, mid-wall
            { offset: 0,    width: 6000, ext: 5000 },   // over-wide → width-clamped, drag-fitted
            { offset: -250, width: 1500, ext: 5000 },   // centre near start corner
            { offset: 4250, width: 1500, ext: 5000 },   // far corner
            { offset: 3500, width: 1500, ext: 5000 },   // near the far end but inside
            { offset: 4500, width: 1500, ext: 7000 },   // option wall longer than shell
        ];
        for (const c of cases) {
            const r = resolveShellWindow(
                win({ offset: c.offset, width: c.width }),
                [optWall(0, 0, c.ext, 0)],
                [shell('shell-1', 0, 0, shellLen, 0)],
            );
            if (r === null) continue;                  // dropped — acceptable
            expect(r.offsetM, JSON.stringify(c)).toBeGreaterThanOrEqual(END_CLEAR - 1e-6);
            expect(r.offsetM + r.widthM, JSON.stringify(c)).toBeLessThanOrEqual(shellLen - END_CLEAR + 1e-6);
        }
    });

    it('an over-wide window is width-clamped AND kept inside both corner clearances', () => {
        const r = resolveShellWindow(
            win({ offset: 0, width: 6000 }),           // 6 m window on a 5 m wall
            [optWall(0, 0, 5000, 0)],
            [shell('shell-1', 0, 0, 5, 0)],
        );
        expect(r).not.toBeNull();
        expect(r!.offsetM).toBeGreaterThanOrEqual(END_CLEAR - 1e-9);
        expect(r!.offsetM + r!.widthM).toBeLessThanOrEqual(5 - END_CLEAR + 1e-9);
    });

    it('width-clamps a window so it fits WITH corner clearance on a short wall', () => {
        // 1.5 m window on a 1.6 m shell wall: A.21.D45 corner setback = 0.5 m, so
        // §WINDOW-SHELL-CLAMP shrinks the width to 1.6 − 2×0.5 = 0.6 m and it sits
        // inside [0.5, 1.1] — fully clear of both corners with a real pier. Hosted.
        const r = resolveShellWindow(
            win({ offset: 0, width: 1500 }),
            [optWall(0, 0, 1600, 0)],
            [shell('short', 0, 0, 1.6, 0)],
        );
        expect(r).not.toBeNull();
        expect(r!.widthM).toBeCloseTo(0.6, 6);
        expect(r!.offsetM).toBeGreaterThanOrEqual(END_CLEAR - 1e-6);
        expect(r!.offsetM + r!.widthM).toBeLessThanOrEqual(1.6 - END_CLEAR + 1e-6);
    });

    it('drops a window when the wall is too short to host even a minimal opening', () => {
        // A 0.3 m shell wall: even with the corner setback collapsed to 0, the
        // usable width (0.3 m) is below the 0.4 m minimum window → dropped.
        const r = resolveShellWindow(
            win({ offset: 0, width: 1500 }),
            [optWall(0, 0, 300, 0)],
            [shell('tiny', 0, 0, 0.3, 0)],
        );
        expect(r).toBeNull();
    });
});

// ── §WINDOW-DEOVERLAP (A.21.D40 #2, 2026-06-07) — founder v49 re-test ─────────
//
// The founder's log showed `CONFLICT new=[…] vs existing […] → opening skipped`:
// two windows resolved to OVERLAPPING spans on the SAME shell wall, and the second
// wall.createOpening was silently rejected by the occupancy check → a dropped
// window. resolveAllShellWindows now de-conflicts up front: overlapping windows on
// one wall are dropped DELIBERATELY so the dispatched set is conflict-free.
describe('resolveAllShellWindows — §WINDOW-DEOVERLAP: no overlapping spans on one wall', () => {
    it('drops the second of two overlapping windows on the SAME shell wall', () => {
        // Two windows from two rooms both front the south shell wall and overlap:
        //   A: offset 1.0 m, width 1.5 m → span [1.0, 2.5]
        //   B: offset 2.0 m, width 1.5 m → span [2.0, 3.5]  (overlaps A)
        const windows: LayoutWindow[] = [
            { wallRef: 0, offset: 1000, width: 1500, height: 1300, sillHeight: 900 },
            { wallRef: 0, offset: 2000, width: 1500, height: 1300, sillHeight: 900 },
        ];
        const out = resolveAllShellWindows(
            windows,
            [optWall(0, 0, 8000, 0)],
            [shell('south', 0, 0, 8, 0)],
        );
        expect(out).toHaveLength(1);
        // The kept window is the first (lower offset) one.
        expect(out[0]!.offsetM).toBeCloseTo(1.0, 6);
    });

    it('keeps both windows when their spans are clear of each other on one wall', () => {
        // A.21.D45 — both windows sit clear of the 0.8 m corner setback on this 8 m
        // wall AND clear of each other → both kept.
        const windows: LayoutWindow[] = [
            { wallRef: 0, offset: 1000, width: 1500, height: 1300, sillHeight: 900 },  // [1.0, 2.5]
            { wallRef: 0, offset: 4000, width: 1500, height: 1300, sillHeight: 900 },  // [4.0, 5.5]
        ];
        const out = resolveAllShellWindows(
            windows,
            [optWall(0, 0, 8000, 0)],
            [shell('south', 0, 0, 8, 0)],
        );
        expect(out).toHaveLength(2);
        // No two emitted spans overlap.
        const spans = out.map(r => [r.offsetM, r.offsetM + r.widthM] as const)
            .sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < spans.length; i++) {
            expect(spans[i]![0]).toBeGreaterThanOrEqual(spans[i - 1]![1] - 1e-9);
        }
    });

    it('does not de-conflict windows on DIFFERENT shell walls', () => {
        // Same numeric offset/width but on two different walls → both kept.
        const windows: LayoutWindow[] = [
            { wallRef: 0, offset: 1000, width: 1500, height: 1300, sillHeight: 900 },
            { wallRef: 1, offset: 1000, width: 1500, height: 1300, sillHeight: 900 },
        ];
        const out = resolveAllShellWindows(
            windows,
            [optWall(0, 0, 5000, 0), optWall(5000, 0, 5000, 4000)],
            [shell('south', 0, 0, 5, 0), shell('east', 5, 0, 5, 4)],
        );
        expect(out).toHaveLength(2);
    });
});

// ── §WINDOW-CORNER-SETBACK (A.21.D45, 2026-06-08) — "window on the EDGE" FINALLY ─
//
// The recurring founder defect: shell windows landed at `offset=0.100m` from the
// wall start (the live `[WallOccupancyStore] canPlace OK … offset=0.100m`) — flush
// against the corner with only the cosmetic 0.1 m `END_CLEAR_M` as a pier. The
// corner clearance is now a REAL wall-length-scaled masonry setback (≥ 0.5 m), and
// EVERY resolved opening must sit inside [setback, shellLen − setback] at BOTH ends.
describe('resolveShellWindow — §WINDOW-CORNER-SETBACK (A.21.D45): real corner pier, no edge windows', () => {
    const win = (over: Partial<LayoutWindow> = {}): LayoutWindow => ({
        wallRef: 0, offset: 0, width: 1500, height: 1300, sillHeight: 900, ...over,
    });

    it('cornerSetbackForWall scales with wall length within [0.5, 1.2] m', () => {
        expect(cornerSetbackForWall(5)).toBeCloseTo(0.5, 6);    // floor on a short-ish wall
        expect(cornerSetbackForWall(8)).toBeCloseTo(0.8, 6);    // 0.10 × 8
        expect(cornerSetbackForWall(16.983)).toBeCloseTo(1.2, 6); // capped on the live-log wall
        // Never the cosmetic 0.1 m, ever.
        for (const len of [2, 4, 6, 10, 17, 30]) {
            expect(cornerSetbackForWall(len)).toBeGreaterThanOrEqual(0.4);
        }
    });

    // The EXACT live-log reproduction: a 1.8 m window emitted at offset 0.1 m on a
    // 16.983 m shell wall (the founder's `offset=0.100m width=1.800m wallLen=16.983m`).
    // After the fix the resolved opening must be pulled well clear of the corner —
    // its offset must be ≥ the 1.2 m setback for this wall, NOT 0.1 m.
    it('pulls the live-log corner-hugging window back to a real pier (NOT offset 0.1 m)', () => {
        const shellLen = 16.983;
        const r = resolveShellWindow(
            win({ offset: 100, width: 1800 }),     // the live-log window (mm)
            [optWall(0, 0, shellLen * 1000, 0)],
            [shell('wall_live', 0, 0, shellLen, 0)],
        );
        expect(r).not.toBeNull();
        const setback = cornerSetbackForWall(shellLen); // 1.2 m
        expect(r!.offsetM).toBeGreaterThanOrEqual(setback - 1e-6);
        expect(r!.offsetM).toBeGreaterThan(0.1);        // NEVER the old corner-hug
        expect(r!.offsetM + r!.widthM).toBeLessThanOrEqual(shellLen - setback + 1e-6);
    });

    // Sweep offsets all along a long wall: NONE may resolve within the setback of a
    // corner — first, last, or middle. The matcher returns null OR an in-pier opening.
    it('no offset along a long wall ever resolves within the corner setback', () => {
        const shellLen = 16.983;
        const setback = cornerSetbackForWall(shellLen);
        for (let offMm = 0; offMm <= shellLen * 1000; offMm += 500) {
            const r = resolveShellWindow(
                win({ offset: offMm, width: 1800 }),
                [optWall(0, 0, shellLen * 1000, 0)],
                [shell('wall_live', 0, 0, shellLen, 0)],
            );
            if (r === null) continue;
            expect(r.offsetM, `off=${offMm}`).toBeGreaterThanOrEqual(setback - 1e-6);
            expect(r.offsetM + r.widthM, `off=${offMm}`)
                .toBeLessThanOrEqual(shellLen - setback + 1e-6);
        }
    });
});
