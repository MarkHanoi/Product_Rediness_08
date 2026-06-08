// A.21.D29 #3 — main-entrance door resolver tests.
//
// Pure: feeds a ground-floor LayoutOption + world-metre shell walls; asserts the
// resolver picks the shell wall bounding the entrance hall, centres + clamps the
// door, degrades sensibly when no hall fronts the perimeter, and never overruns
// a short shell wall.

import { describe, expect, it } from 'vitest';
import {
    resolveEntranceDoor,
    ENTRANCE_DOOR_WIDTH_M,
    type EntranceDoorDispatch,
} from '../src/workflows/apartmentLayout/entranceDoor/entranceDoor.js';
import type { LayoutOption, LayoutRoom } from '../src/workflows/apartmentLayout/types.js';
import type { ShellWall } from '../src/workflows/apartmentLayout/windowEmission/shellWallMatch.js';

// A 10 m × 8 m rectangle (world metres). The DEFAULT projector is plan-mm/1000,
// so a room centroid in mm maps 1:1 (×1/1000) into this frame.
const SHELL: ShellWall[] = [
    { id: 'n', start: { x: 0,  z: 0 }, end: { x: 10, z: 0 } },  // north (z=0)
    { id: 'e', start: { x: 10, z: 0 }, end: { x: 10, z: 8 } },  // east  (x=10)
    { id: 's', start: { x: 10, z: 8 }, end: { x: 0,  z: 8 } },  // south (z=8)
    { id: 'w', start: { x: 0,  z: 8 }, end: { x: 0,  z: 0 } },  // west  (x=0)
];

function room(over: Partial<LayoutRoom> & Pick<LayoutRoom, 'type' | 'centroid'>): LayoutRoom {
    return {
        name: over.name ?? over.type,
        area: over.area ?? 10,
        windowCount: 0,
        hasDirectAccess: true,
        adjacentTo: [],
        ...over,
    } as LayoutRoom;
}

function option(rooms: LayoutRoom[]): LayoutOption {
    return {
        summary: 'test', rooms, walls: [], doors: [],
        corridorWidthMin: 900,
    } as unknown as LayoutOption;
}

describe('resolveEntranceDoor (A.21.D29 #3)', () => {
    it('places the door on the shell wall bounding the entrance hall', () => {
        // Hall centroid near the SOUTH wall (z≈7.5 m → centroid mm {x:5000,y:7500}).
        const opt = option([
            room({ type: 'hall', name: 'Entrance Hall', centroid: { x: 5000, y: 7500 } }),
            room({ type: 'living', centroid: { x: 5000, y: 3000 } }),
        ]);
        const d = resolveEntranceDoor(opt, SHELL);
        expect(d).not.toBeNull();
        expect((d as EntranceDoorDispatch).shellWallId).toBe('s');     // hall fronts the south wall
        expect((d as EntranceDoorDispatch).widthM).toBeCloseTo(ENTRANCE_DOOR_WIDTH_M, 5);
        expect((d as EntranceDoorDispatch).name).toBe('Main Entrance Door');
    });

    it('centres the door on the chosen wall and keeps it within the span', () => {
        const opt = option([
            room({ type: 'hall', name: 'Entrance Hall', centroid: { x: 5000, y: 7500 } }),
        ]);
        const d = resolveEntranceDoor(opt, SHELL)!;
        // South wall is 10 m long; a centred 1 m door → offset 4.5 m.
        expect(d.offsetM).toBeCloseTo((10 - ENTRANCE_DOOR_WIDTH_M) / 2, 5);
        // Whole leaf stays strictly inside both ends.
        expect(d.offsetM).toBeGreaterThanOrEqual(0);
        expect(d.offsetM + d.widthM).toBeLessThanOrEqual(10);
    });

    it('is deterministic — same inputs give the same wall + offset', () => {
        const opt = option([room({ type: 'hall', centroid: { x: 5000, y: 7500 } })]);
        const a = resolveEntranceDoor(opt, SHELL)!;
        const b = resolveEntranceDoor(opt, SHELL)!;
        expect(a).toEqual(b);
    });

    it('falls back to a corridor when there is no hall', () => {
        const opt = option([
            room({ type: 'corridor', centroid: { x: 9500, y: 4000 } }),  // near east wall
            room({ type: 'bedroom', centroid: { x: 3000, y: 4000 } }),
        ]);
        const d = resolveEntranceDoor(opt, SHELL)!;
        expect(d.shellWallId).toBe('e');
    });

    it('falls back to a sensible façade (rooms centroid) when no hall/corridor', () => {
        // Single living room near the WEST wall → entrance on the nearest shell wall.
        const opt = option([room({ type: 'living', centroid: { x: 500, y: 4000 } })]);
        const d = resolveEntranceDoor(opt, SHELL)!;
        expect(d.shellWallId).toBe('w');
    });

    it('clamps the width to fit a short shell wall (A.21.D28 #5 discipline)', () => {
        const shortShell: ShellWall[] = [
            { id: 'n', start: { x: 0,   z: 0 }, end: { x: 1.2, z: 0 } },  // only 1.2 m
            { id: 'e', start: { x: 1.2, z: 0 }, end: { x: 1.2, z: 8 } },
            { id: 's', start: { x: 1.2, z: 8 }, end: { x: 0,   z: 8 } },
            { id: 'w', start: { x: 0,   z: 8 }, end: { x: 0,   z: 0 } },
        ];
        const opt = option([room({ type: 'hall', centroid: { x: 600, y: 100 } })]); // fronts north
        const d = resolveEntranceDoor(opt, shortShell)!;
        expect(d.shellWallId).toBe('n');
        // Width clamps to (1.2 − 2·0.15) = 0.9 m, never exceeding the wall span.
        expect(d.widthM).toBeLessThanOrEqual(1.2 - 0.3 + 1e-9);
        expect(d.offsetM + d.widthM).toBeLessThanOrEqual(1.2);
    });

    it('returns null when there are no shell walls', () => {
        const opt = option([room({ type: 'hall', centroid: { x: 5000, y: 7500 } })]);
        expect(resolveEntranceDoor(opt, [])).toBeNull();
    });

    it('uses the longest façade when there are no rooms at all', () => {
        const wideShell: ShellWall[] = [
            { id: 'short', start: { x: 0, z: 0 }, end: { x: 2, z: 0 } },
            { id: 'long',  start: { x: 2, z: 0 }, end: { x: 2, z: 9 } },  // longest
        ];
        const opt = option([]);
        const d = resolveEntranceDoor(opt, wideShell)!;
        expect(d.shellWallId).toBe('long');
    });

    // §ENTRANCE-DOOR-CLEAR (G4, 2026-06-08) — the door must avoid a shell window
    // already claimed on the same wall (else it overlaps → the batch skips it → the
    // "no entrance door" defect the founder hit).
    it('places the entrance door in a CLEAR gap, avoiding a shell window on the same wall', () => {
        const opt = option([
            room({ type: 'hall', name: 'Entrance Hall', centroid: { x: 5000, y: 7500 } }), // fronts 's'
            room({ type: 'living', centroid: { x: 5000, y: 3000 } }),
        ]);
        // A window sits across the CENTRE of the south wall ('s'), where the door
        // would otherwise go.
        const spans = new Map<string, ReadonlyArray<readonly [number, number]>>([
            ['s', [[4.0, 5.5]]],
        ]);
        const d = resolveEntranceDoor(opt, SHELL, undefined, spans)!;
        expect(d).not.toBeNull();
        expect(d.shellWallId).toBe('s');
        // Door span [offset, offset+width] must NOT overlap the window span [4.0, 5.5].
        const dStart = d.offsetM, dEnd = d.offsetM + d.widthM;
        const overlaps = dStart < 5.5 && 4.0 < dEnd;
        expect(overlaps).toBe(false);
        // Still a usable leaf, still inside the wall.
        expect(d.widthM).toBeGreaterThanOrEqual(0.7);
        expect(d.offsetM).toBeGreaterThanOrEqual(0.15 - 1e-9);
        expect(dEnd).toBeLessThanOrEqual(10 - 0.15 + 1e-9);
    });

    it('is byte-identical to the centred path when NO window spans are supplied', () => {
        const opt = option([
            room({ type: 'hall', name: 'Entrance Hall', centroid: { x: 5000, y: 7500 } }),
            room({ type: 'living', centroid: { x: 5000, y: 3000 } }),
        ]);
        const noSpans = new Map<string, ReadonlyArray<readonly [number, number]>>();
        // Empty map (size 0) and the absent-arg call must both take the original path.
        expect(resolveEntranceDoor(opt, SHELL, undefined, noSpans))
            .toEqual(resolveEntranceDoor(opt, SHELL));
    });
});
