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
