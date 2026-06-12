// §59 P3 — kitchen SCORING + generate-N-and-rank.
//
// (A) scoreKitchenLayout rewards a good work-triangle over a bad one and a sink-
//     under-window over one that is not.
// (B) generate-N-and-rank ships the higher-scoring VALID candidate; a clean
//     galley/L scores well; the result is deterministic.
//
// Pure + deterministic.

import { describe, expect, it } from 'vitest';
import { planKitchen, planKitchenRun } from '../src/workflows/furnishLayout/kitchenLayout.js';
import {
    scoreKitchenLayout, formatKitchenScore,
} from '../src/workflows/furnishLayout/rules/kitchenScoring.js';
import { validateKitchenLayout } from '../src/workflows/furnishLayout/rules/kitchenValidation.js';
import type {
    FurnishRoomInput, Pt, PlacedFurniture, OpeningPose,
} from '../src/workflows/furnishLayout/types.js';
import { footprintOf } from '../src/workflows/furnishLayout/footprints.js';

/** Rectangular room [0,0]→[w,d], 4 walls, a door on the bottom wall, optional
 *  windows. (Same helper shape as kitchenWindowSink.test.ts.) */
function rectRoom(w: number, d: number, windows: OpeningPose[] = []): FurnishRoomInput {
    const poly: Pt[] = [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
    return {
        roomId: 'k1', levelId: 'L0', occupancy: 'kitchen',
        polygon: poly, centroid: { x: w / 2, z: d / 2 }, areaM2: w * d,
        walls: [
            { a: { x: 0, z: 0 }, b: { x: w, z: 0 }, inwardNormal: { x: 0, z: 1 }, length: w, isExterior: true },
            { a: { x: 0, z: d }, b: { x: w, z: d }, inwardNormal: { x: 0, z: -1 }, length: w, isExterior: true },
            { a: { x: 0, z: 0 }, b: { x: 0, z: d }, inwardNormal: { x: 1, z: 0 }, length: d, isExterior: true },
            { a: { x: w, z: 0 }, b: { x: w, z: d }, inwardNormal: { x: -1, z: 0 }, length: d, isExterior: true },
        ],
        doors: [{ type: 'door', center: { x: w / 2, z: 0 }, normal: { x: 0, z: 1 }, width: 0.9 }],
        windows,
        levelElevation: 0,
    };
}

const win = (cx: number, cz: number, nx: number, nz: number, width = 1.2): OpeningPose =>
    ({ type: 'window', center: { x: cx, z: cz }, normal: { x: nx, z: nz }, width });

describe('§59 P3 — scoreKitchenLayout work-triangle axis (A)', () => {
    const room = rectRoom(4.5, 3.8, [win(2.25, 3.8, 0, -1)]);
    const sinkFp = footprintOf('sink');
    const hobFp = footprintOf('hob');
    const fridgeFp = footprintOf('fridge');

    it('rewards a GOOD work-triangle (NKBA legs) over a BAD one (legs too short)', () => {
        // GOOD: sink/hob/fridge each ~1.8–2.2 m apart → legs in the 1.2–2.7 m band.
        const good: PlacedFurniture[] = [
            { kind: 'sink', position: { x: 2.25, y: 0, z: 3.5 }, rotationY: Math.PI, footprint: sinkFp, hostedSpaceId: 'k1' },
            { kind: 'hob', position: { x: 0.5, y: 0, z: 3.5 }, rotationY: Math.PI, footprint: hobFp, hostedSpaceId: 'k1' },
            { kind: 'fridge', position: { x: 0.35, y: 0, z: 1.7 }, rotationY: 0, footprint: fridgeFp, hostedSpaceId: 'k1' },
        ];
        // BAD: all three crammed within ~0.3 m of each other → legs far below 1.2 m.
        const bad: PlacedFurniture[] = [
            { kind: 'sink', position: { x: 2.25, y: 0, z: 3.5 }, rotationY: Math.PI, footprint: sinkFp, hostedSpaceId: 'k1' },
            { kind: 'hob', position: { x: 2.55, y: 0, z: 3.5 }, rotationY: Math.PI, footprint: hobFp, hostedSpaceId: 'k1' },
            { kind: 'fridge', position: { x: 2.4, y: 0, z: 3.2 }, rotationY: Math.PI, footprint: fridgeFp, hostedSpaceId: 'k1' },
        ];
        const sGood = scoreKitchenLayout(good, room);
        const sBad = scoreKitchenLayout(bad, room);
        expect(sGood.axes.workflow).toBeGreaterThan(sBad.axes.workflow);
        expect(sGood.total).toBeGreaterThan(sBad.total);
    });

    it('rewards the sink UNDER the window over the sink AWAY from it (naturalLight)', () => {
        // Under the window (window centre x = 2.25, top wall z = 3.8).
        const under: PlacedFurniture[] = [
            { kind: 'sink', position: { x: 2.25, y: 0, z: 3.5 }, rotationY: Math.PI, footprint: sinkFp, hostedSpaceId: 'k1' },
        ];
        // Far from the window (left wall, low z).
        const away: PlacedFurniture[] = [
            { kind: 'sink', position: { x: 0.35, y: 0, z: 0.5 }, rotationY: 0, footprint: sinkFp, hostedSpaceId: 'k1' },
        ];
        const sUnder = scoreKitchenLayout(under, room);
        const sAway = scoreKitchenLayout(away, room);
        expect(sUnder.axes.naturalLight).toBeGreaterThan(sAway.axes.naturalLight);
        expect(sUnder.axes.naturalLight).toBe(100);
    });

    it('produces a 0..100 total and all eight axes', () => {
        const placed = planKitchen(room, 'auto');
        const s = scoreKitchenLayout(placed, room);
        expect(s.total).toBeGreaterThanOrEqual(0);
        expect(s.total).toBeLessThanOrEqual(100);
        for (const k of ['workflow', 'circulation', 'storage', 'mep', 'naturalLight', 'buildability', 'cost', 'aesthetics'] as const) {
            expect(s.axes[k]).toBeGreaterThanOrEqual(0);
            expect(s.axes[k]).toBeLessThanOrEqual(100);
        }
    });

    it('is deterministic', () => {
        const placed = planKitchen(room, 'auto');
        const a = JSON.stringify(scoreKitchenLayout(placed, room));
        const b = JSON.stringify(scoreKitchenLayout(placed, room));
        expect(a).toEqual(b);
    });

    it('passes valid/hardFailures through into the LayoutScore', () => {
        const placed = planKitchenRun(room, 'auto');
        const v = validateKitchenLayout(placed, room);
        const s = scoreKitchenLayout(placed, room, { valid: v.valid, hardFailures: v.violations.map(x => x.rule) });
        expect(s.valid).toBe(v.valid);
        expect(formatKitchenScore('k1', 'x', s)).toContain('§DIAG-KITCHEN-SCORE');
    });
});

describe('§59 P3 — generate-N-and-rank (B)', () => {
    it('a clean L kitchen with a window scores well and ships a valid run', () => {
        const room = rectRoom(4.5, 3.8, [win(2.25, 3.8, 0, -1)]);
        const run = planKitchenRun(room, 'auto');
        expect(run.length).toBeGreaterThan(0);
        const v = validateKitchenLayout(run, room);
        const s = scoreKitchenLayout(run, room, { valid: v.valid, hardFailures: v.violations.map(x => x.rule) });
        expect(v.valid).toBe(true);
        // A clean windowed kitchen should score comfortably above the midpoint.
        expect(s.total).toBeGreaterThan(60);
        // naturalLight rewarded (sink under the window).
        expect(s.axes.naturalLight).toBeGreaterThanOrEqual(50);
    });

    it('the parametric-run result is deterministic across calls', () => {
        const room = rectRoom(4.5, 3.8, [win(2.25, 3.8, 0, -1)]);
        const a = JSON.stringify(planKitchenRun(room, 'auto'));
        const b = JSON.stringify(planKitchenRun(room, 'auto'));
        expect(a).toEqual(b);
    });

    it('a galley (single usable wall) ships a valid I run that scores its partial', () => {
        // A long narrow room — one long usable wall (door on the short bottom).
        const room = rectRoom(2.0, 5.0, [win(1.0, 5.0, 0, -1)]);
        const run = planKitchenRun(room, 'auto');
        expect(run.length).toBeGreaterThan(0);
        const v = validateKitchenLayout(run, room);
        expect(v.valid).toBe(true);
    });

    it('an explicit shape ships that single arrangement (back-compat)', () => {
        const room = rectRoom(4.5, 3.8, [win(2.25, 3.8, 0, -1)]);
        const forcedI = planKitchen(room, 'I');
        // Forced-I should produce the linear single-run arrangement (no L/U wrap).
        expect(forcedI.some(p => p.kind === 'sink')).toBe(true);
        // Deterministic.
        expect(JSON.stringify(planKitchen(room, 'I'))).toEqual(JSON.stringify(forcedI));
    });

    it('picks the higher-scoring VALID candidate among the room shapes', () => {
        // A roomy squarish kitchen that admits I, L and U. The winner must be one of
        // the candidate shapes and HARD-valid, with a total ≥ the forced-I total
        // (the rank never ships a worse arrangement than the linear fallback).
        const room = rectRoom(4.2, 4.0, [win(2.1, 4.0, 0, -1)]);
        const winner = planKitchenRun(room, 'auto');
        const vWin = validateKitchenLayout(winner, room);
        const sWin = scoreKitchenLayout(winner, room, { valid: vWin.valid, hardFailures: vWin.violations.map(x => x.rule) });

        const forcedI = planKitchenRun(room, 'I');
        const vI = validateKitchenLayout(forcedI, room);
        const sI = scoreKitchenLayout(forcedI, room, { valid: vI.valid, hardFailures: vI.violations.map(x => x.rule) });

        expect(vWin.valid).toBe(true);
        // The chosen (auto) candidate scores at least as well as the linear fallback.
        expect(sWin.total).toBeGreaterThanOrEqual(sI.total - 1e-6);
    });
});
