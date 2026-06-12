// T1.W-C — shell-wall matcher pure tests.

import { describe, expect, it, vi } from 'vitest';
import {
    matchShellHost,
    resolveShellWindow,
    resolveAllShellWindows,
    cornerSetbackForWall,
    shellJunctionsFromOptionWalls,
    roomIntervalOnShell,
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

// ── §DIAG-PARTY-WALL (PW.1, 2026-06-09) — blind/party-wall window suppression ──
//
// Founder: a shell wall that abuts a neighbouring building (a party/blind wall)
// must carry NO windows. resolveAllShellWindows takes an optional `blindFacadeWallIds`
// set; any window that resolves onto a blind shell wall is suppressed. The mechanism
// is ADDITIVE: empty / absent ⇒ byte-identical to the no-party-wall baseline.
describe('resolveAllShellWindows — §DIAG-PARTY-WALL: blind façade suppresses windows', () => {
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

    it('ADDITIVE: empty / absent blind set is byte-identical to the baseline', () => {
        const base = resolveAllShellWindows(windows, walls, shells);
        const emptyArr = resolveAllShellWindows(windows, walls, shells, undefined, []);
        const emptySet = resolveAllShellWindows(windows, walls, shells, undefined, new Set());
        expect(emptyArr).toEqual(base);
        expect(emptySet).toEqual(base);
        expect(base.length).toBeGreaterThan(0);
    });

    it('suppresses every window hosted on a blind shell wall', () => {
        const out = resolveAllShellWindows(windows, walls, shells, undefined, ['south']);
        // The south-fronting bedroom window is suppressed; the east kitchen window stays.
        expect(out.map(r => r.shellWallId)).toEqual(['east']);
    });

    it('accepts a Set as well as an array for the blind set', () => {
        const out = resolveAllShellWindows(windows, walls, shells, undefined, new Set(['east']));
        expect(out.map(r => r.shellWallId)).toEqual(['south']);
    });

    it('suppresses ALL windows when every façade is blind', () => {
        const out = resolveAllShellWindows(windows, walls, shells, undefined, ['south', 'east']);
        expect(out).toHaveLength(0);
    });

    it('the rescue pass never rescues a mandatory room onto a blind wall', () => {
        // A bedroom whose only external frontage is the (blind) south wall: the engine
        // would normally rescue it, but the blind set must block the rescue too →
        // the room stays windowless rather than getting a party-wall window.
        const bedroomOnly: LayoutWindow[] = [
            { wallRef: 0, offset: 0, width: 0, height: 1300, sillHeight: 900, roomType: 'bedroom', name: 'Bedroom' },
        ];
        const out = resolveAllShellWindows(
            bedroomOnly, [optWall(0, 0, 5000, 300)], [shell('south', 0, 0, 5, 0)], undefined, ['south'],
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

// ── §WINDOW-MANDATORY-RESCUE (A.21.D60, 2026-06-09) — never zero windows ──────
//
// The founder's recurring "rooms have doors but not windows": a window-MANDATORY
// room (bedroom/master/living/kitchen) ends with ZERO kept windows because every
// emitted window was DROPPED during shell-matching — the prod log was
//   §DIAG-WIN-DIST resolved=6 kept=4 droppedByDeOverlap=2 unmatchedToShell=6
//   §DIAG-WIN-UNMATCHED total=6 → cornerFitDrop:3 noShellMatch:3
// → a Bedroom with `w=0`. resolveAllShellWindows now runs a LAST-RESORT relaxed
// rescue (corner-setback → width → match tolerance) so such a room keeps ≥1 window
// whenever it has ANY external frontage with a glazable run.
describe('resolveAllShellWindows — §WINDOW-MANDATORY-RESCUE: a mandatory room never ends windowless', () => {
    // The EXACT bug: a skewed (tolerant-match) bedroom window whose centre lands near a
    // corner → the normal path drops it with `cornerFitDrop`. Proven by the relax=undefined
    // resolve returning null with that reason; the rescue (relaxCorner) reclaims it.
    it('reproduces the cornerFitDrop and proves the relaxed resolve reclaims the window', () => {
        const w: LayoutWindow = { wallRef: 0, offset: 200, width: 1500, height: 1300, sillHeight: 900, roomType: 'bedroom', name: 'Bedroom 1 Window' };
        const walls = [optWall(0, 0, 5000, 300)];           // 3.4° skew → tolerant (non-exact) match
        const shells = [shell('s', 0, 0, 5, 0)];
        // Normal path drops it via cornerFitDrop.
        const tally: Record<string, number> = {};
        expect(resolveShellWindow(w, walls, shells, undefined, tally)).toBeNull();
        expect(tally.cornerFitDrop).toBe(1);
        // Relaxed (corner) resolve reclaims it.
        const r = resolveShellWindow(w, walls, shells, undefined, undefined, { relaxCorner: true, widenMatch: false, shrinkWidth: false });
        expect(r).not.toBeNull();
        expect(r!.shellWallId).toBe('s');
    });

    it('keeps ≥1 window for a mandatory bedroom whose only emitted window cornerFitDropped', () => {
        const windows: LayoutWindow[] = [
            { wallRef: 0, offset: 200, width: 1500, height: 1300, sillHeight: 900, roomType: 'bedroom', name: 'Bedroom 1 Window' },
        ];
        const out = resolveAllShellWindows(windows, [optWall(0, 0, 5000, 300)], [shell('s', 0, 0, 5, 0)]);
        expect(out).toHaveLength(1);
        expect(out[0]!.roomType).toBe('bedroom');
    });

    it('rescued bedroom PRE-EMPTS a lower-priority WET conflicter on the same wall (task 2b)', () => {
        // Bathroom (wet) takes the wall exactly; the bedroom's only window is a skewed
        // near-corner overlap that normally cornerFitDrops. The rescue must reclaim the
        // bedroom and DROP the overlapping bathroom (habitable-mandatory beats wet).
        const windows: LayoutWindow[] = [
            { wallRef: 1, offset: 1000, width: 1500, height: 1300, sillHeight: 900, roomType: 'bathroom', name: 'Bathroom Window' },
            { wallRef: 0, offset: 200,  width: 1500, height: 1300, sillHeight: 900, roomType: 'bedroom',  name: 'Bedroom 1 Window' },
        ];
        const out = resolveAllShellWindows(
            windows,
            [optWall(0, 0, 5000, 300), optWall(0, 0, 5000, 0)],   // both front shell 's'
            [shell('s', 0, 0, 5, 0)],
        );
        expect(out.some(o => o.roomType === 'bedroom')).toBe(true);
        // The bathroom yielded — the bedroom (mandatory) claimed the shared wall.
        expect(out.some(o => o.roomType === 'bathroom')).toBe(false);
    });

    it('does NOT displace another HABITABLE room — reports NO-FRONTAGE instead', () => {
        // The bedroom's only window overlaps a LIVING window (also habitable) on the only
        // wall. The rescue must NOT cost the living room its window → bedroom stays
        // windowless and the situation is surfaced (NO-FRONTAGE), not silently swapped.
        const windows: LayoutWindow[] = [
            { wallRef: 0, offset: 1000, width: 1500, height: 1300, sillHeight: 900, roomType: 'living',  name: 'Living Window' },
            { wallRef: 0, offset: 1800, width: 1500, height: 1300, sillHeight: 900, roomType: 'bedroom', name: 'Bedroom 1 Window' },
        ];
        const out = resolveAllShellWindows(windows, [optWall(0, 0, 8000, 0)], [shell('s', 0, 0, 8, 0)]);
        expect(out.some(o => o.roomType === 'living')).toBe(true);
        expect(out.some(o => o.roomType === 'bedroom')).toBe(false);
    });

    it('§WINDOW-DESIRED (A.21.D61) — RESCUES a window-DESIRED room (study) with external frontage', () => {
        // The founder's rule is "EVERY room has a window": §WINDOW-DESIRED widens the
        // rescue beyond the legally-mandatory set to the whole windowable set (study,
        // dining, and the wet rooms) WHEN they have external frontage. A study on a
        // skewed external wall whose only window cornerFitDrops on the normal path is
        // now rescued (it previously shipped windowless — the pre-D61 behaviour).
        const windows: LayoutWindow[] = [
            { wallRef: 0, offset: 200, width: 1500, height: 1300, sillHeight: 900, roomType: 'study', name: 'Study Window' },
        ];
        const out = resolveAllShellWindows(windows, [optWall(0, 0, 5000, 300)], [shell('s', 0, 0, 5, 0)]);
        expect(out).toHaveLength(1);
        expect(out[0]!.roomType).toBe('study');
    });

    it('§WINDOW-DESIRED (A.21.D61) — does NOT rescue a NON-windowable room (corridor)', () => {
        // corridor / hall / utility are never glazed — windowDesiredFor is false, so no
        // rescue fires even with external frontage (the closed-world windowable set holds).
        const windows: LayoutWindow[] = [
            { wallRef: 0, offset: 200, width: 1500, height: 1300, sillHeight: 900, roomType: 'corridor', name: 'Corridor Window' },
        ];
        const out = resolveAllShellWindows(windows, [optWall(0, 0, 5000, 300)], [shell('s', 0, 0, 5, 0)]);
        expect(out).toHaveLength(0);
    });

    it('normal path is byte-identical when a mandatory room already keeps ≥1 window (no rescue)', () => {
        // A clean orthogonal bedroom window that hosts fine — the rescue must not run nor
        // perturb the result. Compare the dispatch to the single-window resolve.
        const windows: LayoutWindow[] = [
            { wallRef: 0, offset: 1000, width: 1500, height: 1300, sillHeight: 900, roomType: 'bedroom', name: 'Bedroom 1 Window' },
        ];
        const walls = [optWall(0, 0, 5000, 0)];
        const shells = [shell('s', 0, 0, 5, 0)];
        const out = resolveAllShellWindows(windows, walls, shells);
        const direct = resolveShellWindow(windows[0]!, walls, shells);   // no relax
        expect(out).toHaveLength(1);
        expect(out[0]).toEqual(direct);                                   // identical, un-relaxed
    });
});

// ── Founder rule #1 GENERAL (2026-06-10) — every perimeter room keeps a window ──
//
// Founder: "EVERY room that has a PERIMETER (shell) wall as part of its boundary MUST
// have ≥1 window" — except blind party-wall façades. The window-emission engine already
// rescues every WINDOW-DESIRED room that fronts a façade; this block pins the GENERAL
// guarantees the prompt asks for: a room touching only an external wall keeps ≥1 window,
// a blind façade stays windowless even though it's a perimeter wall, and the
// §DIAG-WINDOW-RULE perimeter-room domain is honoured.
describe('resolveAllShellWindows — founder rule #1: every perimeter room keeps a window', () => {
    it('a room touching ONLY an external wall keeps ≥1 window', () => {
        // A bedroom whose sole boundary wall is the external south shell → it must keep
        // a window (it fronts the outside; it is glazable).
        const windows: LayoutWindow[] = [
            { wallRef: 0, offset: 1500, width: 1500, height: 1300, sillHeight: 900, roomType: 'bedroom', name: 'Bedroom 1 Window' },
        ];
        const out = resolveAllShellWindows(
            windows, [optWall(0, 0, 6000, 0)], [shell('south', 0, 0, 6, 0)],
            undefined, undefined, [['Bedroom 1 Window', 'bedroom']],
        );
        expect(out).toHaveLength(1);
        expect(out[0]!.roomType).toBe('bedroom');
    });

    it('a blind-façade perimeter wall stays windowless even though it is a perimeter wall', () => {
        // The bedroom's only frontage is the blind party wall → no window, even though it
        // is a perimeter room (founder exception: blind façades carry NO glazing).
        const windows: LayoutWindow[] = [
            { wallRef: 0, offset: 1500, width: 1500, height: 1300, sillHeight: 900, roomType: 'bedroom', name: 'Bedroom 1 Window' },
        ];
        const out = resolveAllShellWindows(
            windows, [optWall(0, 0, 6000, 0)], [shell('south', 0, 0, 6, 0)],
            undefined, ['south'], [['Bedroom 1 Window', 'bedroom']],
        );
        expect(out).toHaveLength(0);   // blind façade suppresses the window
    });

    it('ADDITIVE: passing the perimeter-room set is byte-identical to omitting it', () => {
        // The perimeter set only drives §DIAG-WINDOW-RULE logging — it must NOT change the
        // dispatched windows.
        const windows: LayoutWindow[] = [
            { wallRef: 0, offset: 1000, width: 1500, height: 1300, sillHeight: 900, roomType: 'bedroom', name: 'Bedroom 1 Window' },
            { wallRef: 1, offset: 1000, width: 1200, height: 1200, sillHeight: 1000, roomType: 'kitchen', name: 'Kitchen Window' },
        ];
        const walls = [optWall(0, 0, 6000, 0), optWall(6000, 0, 6000, 4000)];
        const shells = [shell('south', 0, 0, 6, 0), shell('east', 6, 0, 6, 4)];
        const base = resolveAllShellWindows(windows, walls, shells);
        const withSet = resolveAllShellWindows(
            windows, walls, shells, undefined, undefined,
            [['Bedroom 1 Window', 'bedroom'], ['Kitchen Window', 'kitchen']],
        );
        expect(withSet).toEqual(base);
    });

    it('flags a perimeter room left windowless via §DIAG-WINDOW-RULE (⚠ violation logged)', () => {
        // A bedroom that fronts a façade but whose only candidate is dropped (a sub-minimal
        // host wall) → it appears in the perimeter set yet keeps no window → the resolver
        // must surface it as a perimeter-room violation. We assert the ⚠ line is logged.
        const logs: string[] = [];
        const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')); });
        try {
            // wallRef host is INTERIOR (isExternal false) so the window cannot resolve onto
            // a shell → the bedroom keeps zero windows though it is declared perimeter.
            const windows: LayoutWindow[] = [
                { wallRef: 0, offset: 1000, width: 1500, height: 1300, sillHeight: 900, roomType: 'bedroom', name: 'Ghost Bedroom Window' },
            ];
            resolveAllShellWindows(
                windows, [optWall(0, 0, 6000, 0, false)], [shell('south', 0, 0, 6, 0)],
                undefined, undefined, [['Ghost Bedroom Window', 'bedroom']],
            );
        } finally { spy.mockRestore(); }
        const ruleLines = logs.filter(l => l.includes('§DIAG-WINDOW-RULE'));
        expect(ruleLines.some(l => l.includes('Ghost Bedroom Window') && l.includes('PERIMETER-ROOM WINDOWLESS'))).toBe(true);
        expect(ruleLines.some(l => /perimeterRoomViolations=[1-9]/.test(l))).toBe(true);
    });
});

// ── Founder rule #2 (2026-06-10) — two windows never overlap (de-overlap + diag) ──
describe('resolveAllShellWindows — founder rule #2: §DIAG-WINDOW-OVERLAP de-overlap', () => {
    it('two windows that would overlap on one wall end up disjoint (lower-priority dropped)', () => {
        // Two windows on the SAME shell wall whose spans overlap → the de-overlap pass must
        // leave the kept set DISJOINT with the min gap; never overlapping.
        const windows: LayoutWindow[] = [
            { wallRef: 0, offset: 1000, width: 1500, height: 1300, sillHeight: 900, roomType: 'bedroom', name: 'Bedroom Window' },  // [1.0, 2.5]
            { wallRef: 0, offset: 2000, width: 1500, height: 1300, sillHeight: 900, roomType: 'bedroom', name: 'Bedroom Window' },  // [2.0, 3.5] overlaps
        ];
        const out = resolveAllShellWindows(windows, [optWall(0, 0, 8000, 0)], [shell('south', 0, 0, 8, 0)]);
        // Disjoint with the 0.1 m gap.
        const spans = out.map(r => [r.offsetM, r.offsetM + r.widthM] as const).sort((a, b) => a[0] - b[0]);
        for (let i = 1; i < spans.length; i++) {
            expect(spans[i]![0]).toBeGreaterThanOrEqual(spans[i - 1]![1] + 0.1 - 1e-9);
        }
    });

    it('logs §DIAG-WINDOW-OVERLAP with overlapsRemoved and a disjoint ✓ roll-up', () => {
        const logs: string[] = [];
        const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')); });
        try {
            const windows: LayoutWindow[] = [
                { wallRef: 0, offset: 1000, width: 1500, height: 1300, sillHeight: 900, roomType: 'bedroom', name: 'A Window' },
                { wallRef: 0, offset: 2000, width: 1500, height: 1300, sillHeight: 900, roomType: 'bedroom', name: 'B Window' },
            ];
            resolveAllShellWindows(windows, [optWall(0, 0, 8000, 0)], [shell('south', 0, 0, 8, 0)]);
        } finally { spy.mockRestore(); }
        const ov = logs.filter(l => l.includes('§DIAG-WINDOW-OVERLAP'));
        expect(ov.some(l => /overlapsRemoved=[1-9]/.test(l))).toBe(true);
        // The final roll-up must assert the kept set is disjoint.
        expect(ov.some(l => l.includes('all disjoint') && l.includes('residualOverlaps=0'))).toBe(true);
    });

    it('does NOT report removals when the windows are already disjoint', () => {
        const logs: string[] = [];
        const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')); });
        try {
            const windows: LayoutWindow[] = [
                { wallRef: 0, offset: 1000, width: 1500, height: 1300, sillHeight: 900, roomType: 'bedroom', name: 'A Window' },  // [1.0, 2.5]
                { wallRef: 0, offset: 4000, width: 1500, height: 1300, sillHeight: 900, roomType: 'bedroom', name: 'B Window' },  // [4.0, 5.5]
            ];
            resolveAllShellWindows(windows, [optWall(0, 0, 8000, 0)], [shell('south', 0, 0, 8, 0)]);
        } finally { spy.mockRestore(); }
        const roll = logs.find(l => l.includes('§DIAG-WINDOW-OVERLAP') && l.includes('wallsWithWindows'));
        expect(roll).toBeDefined();
        expect(roll!).toContain('overlapsRemoved=0');
        expect(roll!).toContain('all disjoint');
    });
});

// ── §WINDOW-ROOM-INTERVAL-CLAMP (#3, founder full-house 2026-06-12) ────────────
//
// THE founder's residual "window shared by two rooms" defect: a window correctly
// placed in the MODAL (the engine band) could, on the BUILD side, be carried /
// dragged across a partition T-junction onto a neighbouring room because the shell
// resolver clamped only to the WHOLE shell wall's corner piers — never to the room's
// junction-bounded portion. These tests pin the build-side interval clamp: a window
// on a shell wall shared by two rooms stays fully inside its OWN junction-bounded
// interval, centred on its midpoint, and NEVER crosses the junction.
describe('§WINDOW-ROOM-INTERVAL-CLAMP — never cross a partition junction (#3)', () => {
    // A 10 m south shell wall shared by two rooms. A single interior partition T-joins
    // it at x = 5 m (perpendicular stem, running south into the plan), splitting the
    // shell into Room-A [0,5] and Room-B [5,10].
    const southShell = (): ShellWall => shell('south', 0, 0, 10, 0);
    const sharedSouthOptWall = (): LayoutWall => optWall(0, 0, 10000, 0, true);
    // Interior partition: endpoint ON the shell at x=5000mm, stem running to z=3000mm.
    const partitionAtMid = (): LayoutWall => optWall(5000, 0, 5000, 3000, false);

    it('detects the interior-partition junction on the shared shell wall', () => {
        const js = shellJunctionsFromOptionWalls(
            southShell(),
            [sharedSouthOptWall(), partitionAtMid()],
        );
        // Two endpoints of the partition; only the one ON the shell (at x=5) is recorded.
        expect(js.length).toBe(1);
        expect(js[0]!.atM).toBeCloseTo(5, 3);
    });

    it('roomIntervalOnShell returns the junction-bounded portion containing the midpoint', () => {
        const js = shellJunctionsFromOptionWalls(southShell(), [sharedSouthOptWall(), partitionAtMid()]);
        // A window whose centre projects to 2.5 m owns the LEFT interval [0,5].
        expect(roomIntervalOnShell(10, js, 2.5)).toEqual({ lo: 0, hi: 5 });
        // A window whose centre projects to 7.5 m owns the RIGHT interval [5,10].
        expect(roomIntervalOnShell(10, js, 7.5)).toEqual({ lo: 5, hi: 10 });
    });

    it('a Room-A window near the junction is clamped back inside [0,5] (never crosses)', () => {
        // Room-A bedroom window emitted at offset 3800 mm, 1500 mm wide → span
        // [3.8, 5.3] m would CROSS the junction at 5.0 m onto Room-B. With the interval
        // clamp it must end at or before the junction band edge (≤ 5.0 − clearance).
        const win: LayoutWindow = {
            wallRef: 0, offset: 3800, width: 1500, height: 1300, sillHeight: 700,
            roomType: 'bedroom', name: 'Bedroom A Window',
        };
        const r = resolveAllShellWindows(
            [win],
            [sharedSouthOptWall(), partitionAtMid()],
            [southShell()],
        );
        expect(r.length).toBe(1);
        const w = r[0]!;
        expect(w.shellWallId).toBe('south');
        // The FULL span lies within Room-A's interval [0, 5], clear of the junction.
        expect(w.offsetM).toBeGreaterThanOrEqual(0.5 - 1e-6);          // corner setback
        expect(w.offsetM + w.widthM).toBeLessThanOrEqual(5.0 + 1e-6);  // never past the junction
    });

    it('two rooms sharing one shell wall each keep their window in their own interval', () => {
        // Room-A window centred ~2.5 m (interval [0,5]); Room-B window centred ~7.5 m
        // (interval [5,10]). Both must stay strictly on their own side of the 5 m junction.
        const windows: LayoutWindow[] = [
            { wallRef: 0, offset: 1750, width: 1500, height: 1300, sillHeight: 700, roomType: 'bedroom', name: 'Bedroom A Window' },  // centre 2.5
            { wallRef: 0, offset: 6750, width: 1500, height: 1300, sillHeight: 700, roomType: 'bedroom', name: 'Bedroom B Window' },  // centre 7.5
        ];
        const r = resolveAllShellWindows(
            windows,
            [sharedSouthOptWall(), partitionAtMid()],
            [southShell()],
        );
        expect(r.length).toBe(2);
        const byName = new Map(r.map(w => [w.name, w]));
        const a = byName.get('Bedroom A Window')!;
        const b = byName.get('Bedroom B Window')!;
        // A is entirely LEFT of the junction; B is entirely RIGHT — neither crosses 5.0 m.
        expect(a.offsetM + a.widthM).toBeLessThanOrEqual(5.0 + 1e-6);
        expect(b.offsetM).toBeGreaterThanOrEqual(5.0 - 1e-6);
        // No two windows overlap (they're on opposite sides of the junction).
        expect(a.offsetM + a.widthM).toBeLessThan(b.offsetM);
    });

    it('drops a window that cannot fit inside its own room portion rather than crossing', () => {
        // Junction at 1.2 m → Room-A interval [0, 1.2] is too short for a 1.5 m window
        // WITH corner+junction clearance. The window must be DROPPED, not emitted across
        // the junction. (Its midpoint at ~0.6 m owns [0,1.2].)
        const partitionNearStart = optWall(1200, 0, 1200, 3000, false);
        const win: LayoutWindow = {
            wallRef: 0, offset: 0, width: 1500, height: 1300, sillHeight: 700,
            roomType: 'bedroom', name: 'Tiny A Window',
        };
        const r = resolveAllShellWindows(
            [win],
            [sharedSouthOptWall(), partitionNearStart],
            [southShell()],
        );
        // Either dropped, or — if any fit survived — it never crosses the 1.2 m junction.
        for (const w of r) {
            expect(w.offsetM + w.widthM).toBeLessThanOrEqual(1.2 + 1e-6);
        }
    });

    it('back-compat: a junction-free shell wall is unaffected (byte-identical placement)', () => {
        // No interior partitions → no junctions → the whole-wall behaviour is preserved.
        const win: LayoutWindow = {
            wallRef: 0, offset: 4000, width: 1500, height: 1300, sillHeight: 700, roomType: 'bedroom',
        };
        const r = resolveShellWindow(win, [optWall(0, 0, 10000, 0)], [shell('s', 0, 0, 10, 0)]);
        expect(r).not.toBeNull();
        // Centred on its emitted midpoint (4.75 m), in-bounds of the whole wall.
        expect(r!.offsetM).toBeCloseTo(4.0, 3);
    });
});

// ── §WINDOW-CORNER-SETBACK (#2, founder full-house 2026-06-12) ─────────────────
//
// A window too near a shell corner protrudes past it. The resolver enforces a real
// masonry pier (≥ 0.5 m) at each corner so the window stays clear of the corner and
// inside the wall — no window edge lands within the setback of a corner.
describe('§WINDOW-CORNER-SETBACK — window clear of the corner (#2)', () => {
    it('a window emitted hard against the corner is pushed back by ≥ the corner pier', () => {
        // Window emitted at offset 0 (flush to the start corner), 1500 mm wide on a 6 m
        // wall. The resolver must slide it inward so its near edge is ≥ MIN_CORNER_SETBACK
        // (0.5 m) — never flush to the corner.
        const win: LayoutWindow = {
            wallRef: 0, offset: 0, width: 1500, height: 1300, sillHeight: 700, roomType: 'bedroom',
        };
        const r = resolveShellWindow(win, [optWall(0, 0, 6000, 0)], [shell('s', 0, 0, 6, 0)]);
        expect(r).not.toBeNull();
        const setback = cornerSetbackForWall(6);
        expect(setback).toBeGreaterThanOrEqual(0.5 - 1e-9);
        // Near edge clears the start corner; far edge clears the end corner.
        expect(r!.offsetM).toBeGreaterThanOrEqual(setback - 1e-6);
        expect(r!.offsetM + r!.widthM).toBeLessThanOrEqual(6 - setback + 1e-6);
    });

    it('the corner setback is enforced even when the window owns a corner room interval', () => {
        // Shared 10 m wall, partition at 5 m. A Room-A window emitted flush to the start
        // corner (offset 0) must clear BOTH the start corner (≥ setback) AND stay inside
        // the [0,5] interval — corner pier + junction clamp compose.
        const win: LayoutWindow = {
            wallRef: 0, offset: 0, width: 1500, height: 1300, sillHeight: 700,
            roomType: 'bedroom', name: 'Corner A Window',
        };
        const r = resolveAllShellWindows(
            [win],
            [optWall(0, 0, 10000, 0, true), optWall(5000, 0, 5000, 3000, false)],
            [shell('south', 0, 0, 10, 0)],
        );
        expect(r.length).toBe(1);
        const w = r[0]!;
        expect(w.offsetM).toBeGreaterThanOrEqual(0.5 - 1e-6);         // corner pier
        expect(w.offsetM + w.widthM).toBeLessThanOrEqual(5.0 + 1e-6); // inside Room-A
    });
});
