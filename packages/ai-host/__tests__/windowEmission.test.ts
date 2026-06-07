// T1.W-A — window emission engine (P1) pure tests.

import { describe, expect, it } from 'vitest';
import {
    emitWindowsForRoom,
    emitAllWindows,
} from '../src/workflows/apartmentLayout/windowEmission/emitWindows.js';
import {
    isWindowable,
    WINDOW_SPECS,
    type ExternalWallSegment,
    type OccupiedSpan,
    type PartitionJunction,
} from '../src/workflows/apartmentLayout/windowEmission/types.js';

// A 5-metre-long horizontal wall starting at the origin.
const wall = (lenMm: number, wallIndex: number): ExternalWallSegment => ({
    start: { x: 0, y: 0 },
    end:   { x: lenMm, y: 0 },
    wallIndex,
});

describe('isWindowable (T1.W-A)', () => {
    it('classifies habitable + wet rooms as windowable', () => {
        for (const t of ['living', 'kitchen', 'dining', 'master', 'bedroom', 'study',
                          'bathroom', 'ensuite', 'wc'] as const) {
            expect(isWindowable(t)).toBe(true);
        }
    });
    it('classifies circulation + utility as NON-windowable', () => {
        for (const t of ['hall', 'corridor', 'utility'] as const) {
            expect(isWindowable(t)).toBe(false);
        }
    });
});

describe('WINDOW_SPECS (T1.W-A)', () => {
    it('every windowable type has a spec with positive dimensions', () => {
        for (const [type, spec] of Object.entries(WINDOW_SPECS)) {
            expect(spec.widthMm, `${type} widthMm`).toBeGreaterThan(0);
            expect(spec.heightMm).toBeGreaterThan(0);
            expect(spec.sillMm).toBeGreaterThanOrEqual(0);
            expect(spec.minWallLengthMm).toBeGreaterThanOrEqual(spec.widthMm);
            expect(spec.minWidthMm).toBeGreaterThanOrEqual(0);
            expect(spec.minWidthMm).toBeLessThanOrEqual(spec.widthMm);
        }
    });

    it('wet-room sills are at privacy height (> 1500 mm)', () => {
        expect(WINDOW_SPECS.bathroom.sillMm).toBeGreaterThan(1500);
        expect(WINDOW_SPECS.ensuite.sillMm).toBeGreaterThan(1500);
        expect(WINDOW_SPECS.wc.sillMm).toBeGreaterThan(1500);
    });

    it('living + dining sills are at view height (≤ 500 mm)', () => {
        expect(WINDOW_SPECS.living.sillMm).toBeLessThanOrEqual(500);
        expect(WINDOW_SPECS.dining.sillMm).toBeLessThanOrEqual(500);
    });

    it('kitchen sill clears a 900 mm worktop', () => {
        expect(WINDOW_SPECS.kitchen.sillMm).toBeGreaterThanOrEqual(900);
    });
});

describe('emitWindowsForRoom (T1.W-A)', () => {
    it('returns [] for non-windowable rooms (corridor)', () => {
        expect(emitWindowsForRoom('corridor', [wall(5000, 0)])).toHaveLength(0);
    });

    it('returns [] when the room has no external walls', () => {
        expect(emitWindowsForRoom('living', [])).toHaveLength(0);
    });

    it('returns [] when every external wall is below the minimum host length', () => {
        // living min host = 2400; min fallback = minWidthMm+200 = 1400
        const tiny = [wall(800, 0)];   // below minWidthMm + 200
        expect(emitWindowsForRoom('living', tiny)).toHaveLength(0);
    });

    it('places ONE living-room window centred on a 5 m wall', () => {
        const ws = emitWindowsForRoom('living', [wall(5000, 0)]);
        expect(ws).toHaveLength(1);
        const w = ws[0]!;
        expect(w.widthMm).toBe(2000);                // preferred width
        expect(w.heightMm).toBe(1500);
        expect(w.sillMm).toBe(400);
        // Centred: (5000 - 2000) / 2 = 1500
        expect(w.offsetMm).toBe(1500);
        expect(w.roomType).toBe('living');
        expect(w.wallIndex).toBe(0);
    });

    it('picks the LONGEST external wall when multiple qualify', () => {
        const walls = [wall(2500, 0), wall(4000, 1), wall(3000, 2)];
        const ws = emitWindowsForRoom('living', walls);
        expect(ws[0]!.wallIndex).toBe(1);            // 4 m wall wins
        expect(ws[0]!.offsetMm).toBe(1000);          // (4000 - 2000) / 2
    });

    it('falls back to the SMALLER variant when no wall hosts the preferred width', () => {
        // bedroom preferred = 1500 width / 1900 min host; fallback minWidth = 1000.
        // A 1700 mm wall is below 1900 but above minWidth + 200 = 1200.
        const ws = emitWindowsForRoom('bedroom', [wall(1700, 0)]);
        expect(ws).toHaveLength(1);
        expect(ws[0]!.widthMm).toBe(1000);           // fell back to minWidthMm
    });

    it('emits a privacy bathroom window with high sill', () => {
        const ws = emitWindowsForRoom('bathroom', [wall(1500, 0)]);
        expect(ws).toHaveLength(1);
        expect(ws[0]!.widthMm).toBe(600);
        expect(ws[0]!.sillMm).toBeGreaterThan(1500);   // privacy height
    });

    it('stamps the room name on the placement when supplied', () => {
        const ws = emitWindowsForRoom('living', [wall(5000, 0)], 'Living Room');
        expect(ws[0]!.name).toBe('Living Room Window');
    });

    it('deterministic across runs — same inputs → same offset + wallIndex', () => {
        const inputs = [wall(3000, 5), wall(3000, 2)];   // tied length → lowest wallIndex
        const a = emitWindowsForRoom('bedroom', inputs)[0]!;
        const b = emitWindowsForRoom('bedroom', inputs)[0]!;
        expect(a.wallIndex).toBe(2);                       // tie broken by index
        expect(a.wallIndex).toBe(b.wallIndex);
        expect(a.offsetMm).toBe(b.offsetMm);
    });

    it('every room type produces a placement at preferred width on a generous wall', () => {
        const generous = [wall(5000, 0)];
        for (const t of ['living', 'kitchen', 'dining', 'master', 'bedroom', 'study',
                          'bathroom', 'ensuite', 'wc'] as const) {
            const ws = emitWindowsForRoom(t, generous);
            expect(ws, `${t} should emit one window`).toHaveLength(1);
            expect(ws[0]!.widthMm, `${t} preferred width`).toBe(WINDOW_SPECS[t].widthMm);
        }
    });
});

describe('emitWindowsForRoom — door avoidance (T1.W-B-2)', () => {
    // A 6 m wall — long enough that a living window (2 m) can slide clear of a
    // centred door. living preferred width = 2000, centred offset would be 2000.
    const wide = (lenMm: number, wallIndex = 0): ExternalWallSegment =>
        ({ start: { x: 0, y: 0 }, end: { x: lenMm, y: 0 }, wallIndex });
    const door = (wallIndex: number, startMm: number, widthMm: number): OccupiedSpan =>
        ({ wallIndex, startMm, endMm: startMm + widthMm });

    it('with no occupied spans, behaves exactly like before (centred)', () => {
        const ws = emitWindowsForRoom('living', [wide(5000)], undefined, []);
        expect(ws[0]!.offsetMm).toBe(1500);          // (5000 - 2000) / 2
    });

    it('slides the window clear of a centred door on the same wall (no overlap)', () => {
        // 6 m wall; a 0.9 m door centred at 2550..3450. A 2 m living window
        // centred at 2000..4000 would overlap → must slide clear.
        const doors = [door(0, 2550, 900)];
        const ws = emitWindowsForRoom('living', [wide(6000)], undefined, doors);
        expect(ws).toHaveLength(1);
        const w = ws[0]!;
        const wLo = w.offsetMm, wHi = w.offsetMm + w.widthMm;
        const dLo = 2550, dHi = 3450;
        expect(wLo < dHi && wHi > dLo).toBe(false);   // no overlap with the door
        expect(w.wallIndex).toBe(0);
    });

    it('falls through to the next wall when the longest is fully blocked', () => {
        // Wall 0 (5 m) is blocked end-to-end by a door footprint spanning it;
        // wall 1 (4 m) is clear → window lands on wall 1.
        const walls = [wide(5000, 0), wide(4000, 1)];
        const doors = [door(0, 100, 4800)];           // occupies almost all of wall 0
        const ws = emitWindowsForRoom('living', walls, undefined, doors);
        expect(ws).toHaveLength(1);
        expect(ws[0]!.wallIndex).toBe(1);
    });

    it('returns [] when every qualifying wall is fully blocked by doors', () => {
        const doors = [door(0, 0, 5000)];
        const ws = emitWindowsForRoom('living', [wide(5000, 0)], undefined, doors);
        expect(ws).toHaveLength(0);
    });

    it('ignores doors on OTHER walls', () => {
        const doors = [door(7, 2000, 900)];           // door on an unrelated wall
        const ws = emitWindowsForRoom('living', [wide(5000, 0)], undefined, doors);
        expect(ws[0]!.offsetMm).toBe(1500);           // unaffected → centred
    });
});

describe('emitWindowsForRoom — multiple windows on a long wall (D5.c)', () => {
    const wide = (lenMm: number, wallIndex = 0): ExternalWallSegment =>
        ({ start: { x: 0, y: 0 }, end: { x: lenMm, y: 0 }, wallIndex });
    const door = (wallIndex: number, startMm: number, widthMm: number): OccupiedSpan =>
        ({ wallIndex, startMm, endMm: startMm + widthMm });

    // No-overlap helpers, in mm along the wall.
    const spanOf = (w: { offsetMm: number; widthMm: number }) =>
        ({ lo: w.offsetMm, hi: w.offsetMm + w.widthMm });
    const overlaps = (a: { lo: number; hi: number }, b: { lo: number; hi: number }) =>
        a.lo < b.hi && a.hi > b.lo;

    it('keeps ONE centred window on a medium (5 m) wall', () => {
        // Unchanged behaviour: 5 m is not "much longer" than a 2 m living window.
        const ws = emitWindowsForRoom('living', [wide(5000)]);
        expect(ws).toHaveLength(1);
        expect(ws[0]!.offsetMm).toBe(1500);   // still centred
    });

    it('emits ≥ 2 evenly-spaced windows on a genuinely long wall', () => {
        // 10 m living wall: floor((10000-1400)/(2000+1400)) = floor(2.53) = 2.
        const ws = emitWindowsForRoom('living', [wide(10000)]);
        expect(ws.length).toBeGreaterThanOrEqual(2);
        for (const w of ws) {
            expect(w.wallIndex).toBe(0);
            expect(w.widthMm).toBe(2000);
            // inside the wall with end clearance
            expect(w.offsetMm).toBeGreaterThanOrEqual(100);
            expect(w.offsetMm + w.widthMm).toBeLessThanOrEqual(10000 - 100 + 1e-6);
        }
    });

    it('multiple windows on one wall never overlap each other', () => {
        const ws = emitWindowsForRoom('living', [wide(10000)]);
        expect(ws.length).toBeGreaterThanOrEqual(2);
        const sorted = [...ws].sort((a, b) => a.offsetMm - b.offsetMm);
        for (let i = 1; i < sorted.length; i++) {
            expect(overlaps(spanOf(sorted[i - 1]!), spanOf(sorted[i]!))).toBe(false);
        }
    });

    it('multiple windows on a long wall still avoid a door', () => {
        // 9 m living wall with a door mid-span; every emitted window must miss it.
        const doors = [door(0, 4000, 900)];   // 4000..4900
        const ws = emitWindowsForRoom('living', [wide(9000)], undefined, doors);
        expect(ws.length).toBeGreaterThanOrEqual(2);
        const dSpan = { lo: 4000, hi: 4900 };
        for (const w of ws) {
            expect(overlaps(spanOf(w), dSpan)).toBe(false);
        }
        // and not each other
        const sorted = [...ws].sort((a, b) => a.offsetMm - b.offsetMm);
        for (let i = 1; i < sorted.length; i++) {
            expect(overlaps(spanOf(sorted[i - 1]!), spanOf(sorted[i]!))).toBe(false);
        }
    });

    it('respects the per-wall window cap (≤ 3 on one wall)', () => {
        // A very long bedroom wall (20 m) would fit many windows but is capped.
        const ws = emitWindowsForRoom('bedroom', [wide(20000)]);
        const onWall0 = ws.filter(w => w.wallIndex === 0);
        expect(onWall0.length).toBeLessThanOrEqual(3);
        expect(onWall0.length).toBeGreaterThanOrEqual(2);
    });

    it('is deterministic across runs (offsets + count)', () => {
        const a = emitWindowsForRoom('living', [wide(10000)]);
        const b = emitWindowsForRoom('living', [wide(10000)]);
        expect(a.map(w => w.offsetMm)).toEqual(b.map(w => w.offsetMm));
    });
});

describe('emitWindowsForRoom — multiple external walls per room (D5.c)', () => {
    const wide = (lenMm: number, wallIndex: number): ExternalWallSegment =>
        ({ start: { x: 0, y: 0 }, end: { x: lenMm, y: 0 }, wallIndex });

    it('a corner room with two qualifying walls gets a window on each', () => {
        // Two separate external walls (different wall indices) → cover both.
        const ws = emitWindowsForRoom('bedroom', [wide(2500, 0), wide(2500, 1)]);
        const walls = new Set(ws.map(w => w.wallIndex));
        expect(walls.has(0)).toBe(true);
        expect(walls.has(1)).toBe(true);
    });

    it('caps total windows per room at 4 even with many long walls', () => {
        const many = [
            wide(10000, 0), wide(10000, 1), wide(10000, 2), wide(10000, 3), wide(10000, 4),
        ];
        const ws = emitWindowsForRoom('living', many);
        expect(ws.length).toBeLessThanOrEqual(4);
    });
});

describe('emitWindowsForRoom — interior-partition avoidance (A.21.D33(d))', () => {
    const wide = (lenMm: number, wallIndex = 0): ExternalWallSegment =>
        ({ start: { x: 0, y: 0 }, end: { x: lenMm, y: 0 }, wallIndex });
    const junction = (wallIndex: number, atMm: number, thicknessMm = 100): PartitionJunction =>
        ({ wallIndex, atMm, thicknessMm });

    const spanOf = (w: { offsetMm: number; widthMm: number }) =>
        ({ lo: w.offsetMm, hi: w.offsetMm + w.widthMm });
    // band kept clear around a junction = thickness/2 + 100 mm clearance
    const bandOf = (j: PartitionJunction) => {
        const half = (j.thicknessMm ?? 0) > 0 ? j.thicknessMm! / 2 + 100 : 150;
        return { lo: j.atMm - half, hi: j.atMm + half };
    };
    const overlaps = (a: { lo: number; hi: number }, b: { lo: number; hi: number }) =>
        a.lo < b.hi && a.hi > b.lo;

    it('with no junctions, behaves exactly like before (centred)', () => {
        const ws = emitWindowsForRoom('living', [wide(5000)], undefined, [], null, []);
        expect(ws[0]!.offsetMm).toBe(1500);          // (5000 - 2000) / 2
    });

    it('offsets a window clear of a partition junction it would otherwise straddle', () => {
        // 6 m wall; a 2 m living window centred at 2000..4000. An interior partition
        // meets the shell at 3000 mm (dead centre) — the centred window would sit on
        // that junction. The window must slide clear of the 100 mm-partition band.
        const js = [junction(0, 3000, 100)];
        const ws = emitWindowsForRoom('living', [wide(6000)], undefined, [], null, js);
        expect(ws).toHaveLength(1);
        const w = ws[0]!;
        expect(overlaps(spanOf(w), bandOf(js[0]!))).toBe(false);   // window clears the junction
        // and stays inside the wall
        expect(w.offsetMm).toBeGreaterThanOrEqual(100);
        expect(w.offsetMm + w.widthMm).toBeLessThanOrEqual(6000 - 100 + 1e-6);
    });

    it('uses a wider clear band for a thicker partition', () => {
        const thick = [junction(0, 3000, 400)];   // half = 200 + 100 = 300 mm band
        const ws = emitWindowsForRoom('living', [wide(6000)], undefined, [], null, thick);
        expect(ws).toHaveLength(1);
        expect(overlaps(spanOf(ws[0]!), bandOf(thick[0]!))).toBe(false);
    });

    it('drops the window when junctions leave no clear span long enough', () => {
        // A short 2.6 m living wall (just hosts a 2 m window normally) with a junction
        // dead-centre: there is no 2 m clear slot either side → window dropped.
        const js = [junction(0, 1300, 100)];
        const ws = emitWindowsForRoom('living', [wide(2600)], undefined, [], null, js);
        expect(ws).toHaveLength(0);
    });

    it('ignores junctions on OTHER walls', () => {
        const js = [junction(7, 2500, 100)];        // unrelated wall
        const ws = emitWindowsForRoom('living', [wide(5000, 0)], undefined, [], null, js);
        expect(ws[0]!.offsetMm).toBe(1500);          // unaffected → centred
    });

    it('avoids BOTH a door and a partition junction on the same wall', () => {
        // 9 m wall: door at 2000..2900, junction at 6000.
        const doors: OccupiedSpan[] = [{ wallIndex: 0, startMm: 2000, endMm: 2900 }];
        const js = [junction(0, 6000, 100)];
        const ws = emitWindowsForRoom('living', [wide(9000)], undefined, doors, null, js);
        expect(ws.length).toBeGreaterThanOrEqual(1);
        const dSpan = { lo: 2000, hi: 2900 };
        for (const w of ws) {
            expect(overlaps(spanOf(w), dSpan)).toBe(false);          // clears the door
            expect(overlaps(spanOf(w), bandOf(js[0]!))).toBe(false); // clears the junction
        }
    });

    it('is deterministic across runs (offsets + count)', () => {
        const js = [junction(0, 3000, 100)];
        const a = emitWindowsForRoom('living', [wide(6000)], undefined, [], null, js);
        const b = emitWindowsForRoom('living', [wide(6000)], undefined, [], null, js);
        expect(a.map(w => w.offsetMm)).toEqual(b.map(w => w.offsetMm));
        expect(a.length).toBe(b.length);
    });
});

describe('emitAllWindows (T1.W-A)', () => {
    it('flattens emissions across multiple rooms', () => {
        const out = emitAllWindows([
            { roomType: 'living',  externalWalls: [wall(5000, 0)] },
            { roomType: 'kitchen', externalWalls: [wall(3000, 1)] },
            { roomType: 'corridor', externalWalls: [wall(5000, 2)] }, // skipped
        ]);
        expect(out).toHaveLength(2);
        const types = new Set(out.map(w => w.roomType));
        expect(types.has('living')).toBe(true);
        expect(types.has('kitchen')).toBe(true);
    });

    it('returns [] for an entirely interior room set', () => {
        const out = emitAllWindows([
            { roomType: 'living', externalWalls: [] },
            { roomType: 'bedroom', externalWalls: [] },
        ]);
        expect(out).toHaveLength(0);
    });
});
