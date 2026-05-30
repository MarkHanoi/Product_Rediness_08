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
