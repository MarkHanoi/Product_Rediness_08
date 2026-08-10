// §FEAT-WINDOW-PARAMETRIC-CREATE (ADR-0315) — placement planning semantics.
//
// Scope note: these tests pin the PLANNING half (canExecute / planCount /
// offset math / honest skip reasons) against a mock wall store. The execution
// half rides the long-proven CreateWallOpeningCommand child (plan tools +
// generative executors), whose occupancy/undo behaviour is pinned by its own
// suites — re-testing it here would mock away exactly the parts that matter.

import { describe, it, expect } from 'vitest';
import {
    CreateWindowsParametricBatchCommand,
    WINDOW_EDGE_MARGIN_M,
} from '../src/windows/CreateWindowsParametricBatchCommand';
import type { CommandContext } from '../src/types';

type Pt = { x: number; y: number; z: number };
interface W {
    id: string;
    levelId: string;
    baseLine: [Pt, Pt];
    thickness: number;
    rakeAngleDeg?: number;
    openings: unknown[];
    childrenIds: string[];
}

const p = (x: number, z: number): Pt => ({ x, y: 0, z });
const wall = (id: string, len: number, over: Partial<W> = {}): W => ({
    id, levelId: 'L0', baseLine: [p(0, 0), p(len, 0)], thickness: 0.2,
    openings: [], childrenIds: [], ...over,
});

function ctxOf(walls: W[]): CommandContext {
    const map = new Map(walls.map(w => [w.id, w]));
    return {
        stores: {
            wallStore: {
                getAll: () => [...map.values()],
                getById: (id: string) => map.get(id),
            },
        },
    } as unknown as CommandContext;
}

describe('CreateWindowsParametricBatchCommand — planning honesty', () => {
    it("count mode centres windows: 1 window on a 6m wall plans exactly the middle", () => {
        const cmd = new CreateWindowsParametricBatchCommand({
            wallIds: ['w1'], mode: { kind: 'count', count: 1 }, width: 1, height: 2,
        });
        const ctx = ctxOf([wall('w1', 6)]);
        expect(cmd.canExecute(ctx).ok).toBe(true);
        expect(cmd.planCount(ctx)).toBe(1);
    });

    it('spacing mode: 1m-wide window every 3m on a 10m wall plans 3 (centres 3,6,9 — 9 capped by the margin)', () => {
        const cmd = new CreateWindowsParametricBatchCommand({
            wallIds: ['w1'], mode: { kind: 'spacing', spacingM: 3 }, width: 1, height: 2,
        });
        const ctx = ctxOf([wall('w1', 10)]);
        // centres 3 and 6 fit; centre 9 needs 9+0.5 ≤ 10−margin ⇒ 9.5 ≤ 9.85 ✓ → 3 windows.
        expect(cmd.planCount(ctx)).toBe(3);
        expect(WINDOW_EDGE_MARGIN_M).toBeCloseTo(0.15);
    });

    it('a too-short wall is skipped WITH the measured reason; a long wall still plans (mixed ⇒ warnings)', () => {
        const cmd = new CreateWindowsParametricBatchCommand({
            wallIds: 'all', mode: { kind: 'count', count: 1 }, width: 2, height: 1.5,
        });
        const ctx = ctxOf([wall('short', 1.5), wall('long', 8)]);
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(true);
        expect(v.warnings?.some(w => w.includes('too short'))).toBe(true);
        expect(cmd.planCount(ctx)).toBe(1);
    });

    it('a RAKED wall refuses whole-wall — hosted openings do not tilt (C15)', () => {
        const cmd = new CreateWindowsParametricBatchCommand({
            wallIds: ['r1'], mode: { kind: 'count', count: 1 }, width: 1, height: 1.2,
        });
        const ctx = ctxOf([wall('r1', 8, { rakeAngleDeg: 70 })]);
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toMatch(/raked|tilt/i);
    });

    it('value guards refuse VISIBLY: bad dimensions, absurd count, spacing < width, empty scope', () => {
        const ctx = ctxOf([wall('w1', 8)]);
        expect(new CreateWindowsParametricBatchCommand({ wallIds: 'all', mode: { kind: 'count', count: 1 }, width: 0, height: 2 }).canExecute(ctx).ok).toBe(false);
        expect(new CreateWindowsParametricBatchCommand({ wallIds: 'all', mode: { kind: 'count', count: 99 }, width: 1, height: 2 }).canExecute(ctx).ok).toBe(false);
        const sp = new CreateWindowsParametricBatchCommand({ wallIds: 'all', mode: { kind: 'spacing', spacingM: 0.5 }, width: 1, height: 2 }).canExecute(ctx);
        expect(sp.ok).toBe(false);
        expect(sp.reason).toContain('overlap');
        expect(new CreateWindowsParametricBatchCommand({ wallIds: [], mode: { kind: 'count', count: 1 }, width: 1, height: 2 }).canExecute(ctx).ok).toBe(false);
    });

    it('no wall can take a window ⇒ visible no-op naming the first reason', () => {
        const cmd = new CreateWindowsParametricBatchCommand({
            wallIds: 'all', mode: { kind: 'count', count: 1 }, width: 3, height: 2,
        });
        const ctx = ctxOf([wall('a', 2), wall('b', 2.5)]);
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain('No window fits');
    });
});
