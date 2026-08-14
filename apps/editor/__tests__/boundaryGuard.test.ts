// §L-907A-BOUNDARY-GUARD + §L-907b — executor-side boundary containment and the
// result≠proposal user-visible report. Pure module, plain-Node testable.
//
// The walls fed to the check are PRODUCED by the real generator (the strip
// slicer running on a T-shell), never hand-fed coordinates invented for the
// assertion — per the lane rule "driving real request paths".

import { describe, expect, it } from 'vitest';
import {
    chainShellPerimeter,
    checkPlannedWallsInsideBoundary,
    boundaryFindingMessage,
    roomCountDivergenceMessage,
    type GuardShellSeg,
} from '../src/ui/apartment-layout/boundaryGuard.js';
import {
    generateProceduralLayout,
    generateProceduralLayoutHonest,
} from '@pryzm/ai-host/workflows/apartmentLayout/proceduralLayout';
import { analyseShell } from '@pryzm/ai-host/workflows/apartmentLayout/shellAnalysis';

// The probe's non-orthogonal T footprint (world metres, XZ).
const T = [
    { x: 0, z: 0 }, { x: 16, z: 0 }, { x: 16.8, z: 5 }, { x: 11, z: 5 },
    { x: 11, z: 11 }, { x: 5, z: 11 }, { x: 5, z: 5 }, { x: 0, z: 5 },
];
const tSegs: GuardShellSeg[] = T.map((p, i) => ({ start: p, end: T[(i + 1) % T.length]! }));
const tShell = analyseShell(
    T.map((p, i) => ({ id: `w${i}`, baseLine: [p, T[(i + 1) % T.length]!] as [typeof p, typeof p] })),
    { entranceWallId: 'w0', windowCountByWall: {} },
);
const program = { bedrooms: 2, bathrooms: 1, masterEnSuite: false, openPlanKitchenDining: true, livingRoom: true, entranceHall: true };
const constraints = { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: 'partition' };
const weights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

describe('chainShellPerimeter', () => {
    it('chains unordered shell segments into a closed ring', () => {
        const shuffled = [tSegs[3]!, tSegs[0]!, tSegs[6]!, tSegs[1]!, tSegs[4]!, tSegs[7]!, tSegs[2]!, tSegs[5]!];
        const ring = chainShellPerimeter(shuffled);
        expect(ring).not.toBeNull();
        expect(ring!.length).toBe(8);
    });

    it('returns null (unmeasurable) when the segments do not close', () => {
        expect(chainShellPerimeter(tSegs.slice(0, 4))).toBeNull();
    });
});

describe('checkPlannedWallsInsideBoundary (§L-907A-BOUNDARY-GUARD)', () => {
    it('FLAGS the legacy bbox-sliced plan as outside the T boundary', () => {
        // Reconstruct the pre-fix defect: strips sliced across the FULL bbox.
        // (The honest generator no longer produces this — recreate it from the
        // bbox exactly as proceduralLayout.ts:57-87 did before the fix.)
        const n = 7;
        const cellM = tShell.widthM / n;
        const legacyWalls = Array.from({ length: n - 1 }, (_, i) => ({
            start: { x: (0 + (i + 1) * cellM) * 1000, y: 0 },
            end: { x: (0 + (i + 1) * cellM) * 1000, y: tShell.depthM * 1000 },
        }));
        const check = checkPlannedWallsInsideBoundary(legacyWalls, tSegs);
        expect(check.kind).toBe('outside');
        if (check.kind === 'outside') {
            expect(check.outsideWallCount).toBeGreaterThan(0);
            const msg = boundaryFindingMessage(check)!;
            expect(msg).toMatch(/outside/);
            expect(msg).toMatch(new RegExp(`${check.outsideWallCount} of ${check.total}`));
        }
    });

    it('PASSES the honest generator output on the same T boundary', () => {
        const { options } = generateProceduralLayoutHonest(tShell, program, constraints, weights, 2);
        expect(options.length).toBeGreaterThan(0);
        for (const opt of options) {
            const check = checkPlannedWallsInsideBoundary(opt.walls, tSegs);
            expect(check.kind).toBe('inside');
            expect(boundaryFindingMessage(check)).toBeNull();
        }
    });

    it('reports UNMEASURABLE (never a silent pass) when the shell does not chain', () => {
        const rect = [{ x: 100, z: 50 }, { x: 130, z: 50 }, { x: 130, z: 70 }, { x: 100, z: 70 }];
        const shell = analyseShell(
            rect.map((p, i) => ({ id: `w${i}`, baseLine: [p, rect[(i + 1) % rect.length]!] as [typeof p, typeof p] })),
            { entranceWallId: 'w0', windowCountByWall: {} },
        );
        const [opt] = generateProceduralLayout(shell, program, constraints, weights, 1);
        const check = checkPlannedWallsInsideBoundary(opt!.walls, tSegs.slice(0, 2));
        expect(check.kind).toBe('unmeasurable');
        expect(boundaryFindingMessage(check)).toMatch(/NOT verified|not possible/i);
    });

    it('skips walls flagged isExternal (they ARE the boundary)', () => {
        const externals = tSegs.map(s => ({
            start: { x: s.start.x * 1000, y: s.start.z * 1000 },
            end: { x: s.end.x * 1000, y: s.end.z * 1000 },
            isExternal: true,
        }));
        const check = checkPlannedWallsInsideBoundary(externals, tSegs);
        expect(check.kind).toBe('inside');
        expect(check.total).toBe(0);
    });
});

describe('roomCountDivergenceMessage (§L-907b)', () => {
    it('reports BOTH numbers on the founder-observed merge (6 detected vs 7 planned)', () => {
        const msg = roomCountDivergenceMessage(6, 7)!;
        expect(msg).toMatch(/6 rooms detected/);
        expect(msg).toMatch(/7 planned/);
        expect(msg).toMatch(/merged/);
    });

    it('reports fragmentation when detected exceeds planned', () => {
        const msg = roomCountDivergenceMessage(9, 7)!;
        expect(msg).toMatch(/9 rooms detected/);
        expect(msg).toMatch(/fragmented/);
    });

    it('reports NOT MEASURED (never success) when the store could not be read', () => {
        const msg = roomCountDivergenceMessage(-1, 7)!;
        expect(msg).toMatch(/NOT verified/);
        expect(msg).toMatch(/7-room/);
    });

    it('is silent only on exact match', () => {
        expect(roomCountDivergenceMessage(7, 7)).toBeNull();
    });
});
