// T1.W-C — shell-wall matcher pure tests.

import { describe, expect, it } from 'vitest';
import {
    matchShellHost,
    resolveShellWindow,
    resolveAllShellWindows,
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
        // Width clamped to wall length − 2×0.1 m end clearance.
        expect(r!.widthM).toBeCloseTo(4.8, 6);
        // The WHOLE opening stays on the wall: 0 ≤ offset and offset+width ≤ 5 m.
        expect(r!.offsetM).toBeGreaterThanOrEqual(0.1 - 1e-9);
        expect(r!.offsetM + r!.widthM).toBeLessThanOrEqual(5 + 1e-9);
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
        expect(r!.offsetM).toBeGreaterThanOrEqual(0.1 - 1e-9);
        expect(r!.offsetM + r!.widthM).toBeLessThanOrEqual(5 - 0.1 + 1e-9);
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
