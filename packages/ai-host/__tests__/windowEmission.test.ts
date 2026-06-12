// T1.W-A — window emission engine (P1) pure tests.

import { describe, expect, it } from 'vitest';
import {
    emitWindowsForRoom,
    emitAllWindows,
} from '../src/workflows/apartmentLayout/windowEmission/emitWindows.js';
import {
    isWindowable,
    WINDOW_SPECS,
    WINDOW_SIZE_CLASS,
    LARGE_MIN_WIDTH_MM,
    SMALL_MAX_WIDTH_MM,
    type ExternalWallSegment,
    type OccupiedSpan,
    type PartitionJunction,
    type WindowableRoomType,
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

    it('wet-room sills are at privacy height (> 1300 mm, above eye level)', () => {
        // §68.16 — wet-room windows are bigger but still privacy-silled (1400 mm).
        expect(WINDOW_SPECS.bathroom.sillMm).toBeGreaterThan(1300);
        expect(WINDOW_SPECS.ensuite.sillMm).toBeGreaterThan(1300);
        expect(WINDOW_SPECS.wc.sillMm).toBeGreaterThan(1300);
    });

    it('living is a full-height sliding/patio door (§68.11 — sill ≈ 10 mm, head ≈ 2200 mm, 2–3 m span)', () => {
        expect(WINDOW_SPECS.living.sillMm).toBeLessThanOrEqual(50);          // ~0.01 m sill
        expect(WINDOW_SPECS.living.sillMm + WINDOW_SPECS.living.heightMm).toBe(2200); // head 2200 mm
        expect(WINDOW_SPECS.living.widthMm).toBeGreaterThanOrEqual(2000);    // patio span 2–3 m
        expect(WINDOW_SPECS.living.widthMm).toBeLessThanOrEqual(3000);
        expect(WINDOW_SPECS.living.minWidthMm).toBeGreaterThanOrEqual(2000); // never a small window
    });

    it('dining sill is at view height (≤ 500 mm)', () => {
        expect(WINDOW_SPECS.dining.sillMm).toBeLessThanOrEqual(500);
    });

    it('kitchen sill clears a 900 mm worktop', () => {
        expect(WINDOW_SPECS.kitchen.sillMm).toBeGreaterThanOrEqual(900);
    });

    it('§WINDOW-HEAD-FIT — every spec head (sill + height) fits under a ~2.4 m clear storey (≤ 2300 mm)', () => {
        for (const [type, spec] of Object.entries(WINDOW_SPECS)) {
            expect(spec.sillMm + spec.heightMm, `${type} head height`).toBeLessThanOrEqual(2300);
        }
    });
});

describe('emitWindowsForRoom (T1.W-A)', () => {
    it('returns [] for non-windowable rooms (corridor)', () => {
        expect(emitWindowsForRoom('corridor', [wall(5000, 0)])).toHaveLength(0);
    });

    it('returns [] when the room has no external walls', () => {
        expect(emitWindowsForRoom('living', [])).toHaveLength(0);
    });

    it('returns [] when no external wall can host EVEN a minimal opening (with corner piers)', () => {
        // §WINDOW-EVERY-FRONTAGE (founder 2026-06-11) — the floor is now the MINIMAL
        // opening (MIN_WINDOW_MM=400) + its two corner piers, NOT the spec/fallback width.
        // A 350 mm wall genuinely can't host a 400 mm window between any reveals → [].
        const tooShort = [wall(350, 0)];
        expect(emitWindowsForRoom('living', tooShort)).toHaveLength(0);
    });

    it('places ONE living-room sliding-door window centred on a 5 m wall (§68.11)', () => {
        const ws = emitWindowsForRoom('living', [wall(5000, 0)]);
        expect(ws).toHaveLength(1);
        const w = ws[0]!;
        expect(w.widthMm).toBe(2400);                // preferred patio-door span
        expect(w.heightMm).toBe(2190);               // full-height (head 2200 mm)
        expect(w.sillMm).toBe(10);                   // ~0.01 m sill (founder)
        // Centred: (5000 - 2400) / 2 = 1300
        expect(w.offsetMm).toBe(1300);
        expect(w.roomType).toBe('living');
        expect(w.wallIndex).toBe(0);
    });

    it('picks the LONGEST external wall when multiple qualify', () => {
        const walls = [wall(2500, 0), wall(4000, 1), wall(3000, 2)];
        const ws = emitWindowsForRoom('living', walls);
        expect(ws[0]!.wallIndex).toBe(1);            // 4 m wall wins
        expect(ws[0]!.offsetMm).toBe(800);           // (4000 - 2400) / 2
    });

    it('falls back to the SMALLER variant when no wall hosts the preferred width', () => {
        // bedroom preferred = 1800 width / 2100 min host; fallback minWidth = 1200.
        // A 1700 mm wall is below 2100 but above minWidth + 200 = 1400.
        const ws = emitWindowsForRoom('bedroom', [wall(1700, 0)]);
        expect(ws).toHaveLength(1);
        expect(ws[0]!.widthMm).toBe(1200);           // fell back to minWidthMm
    });

    it('emits a privacy bathroom window with high sill', () => {
        const ws = emitWindowsForRoom('bathroom', [wall(1500, 0)]);
        expect(ws).toHaveLength(1);
        expect(ws[0]!.widthMm).toBe(800);
        expect(ws[0]!.sillMm).toBeGreaterThan(1300);   // privacy height
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

describe('emitWindowsForRoom — §WINDOW-EVERY-FRONTAGE last-resort tier (founder 2026-06-11)', () => {
    // Founder rule: EVERY room that CAN have a window (has a real external wall long
    // enough to host even a minimal opening) MUST get one. The defect: a façade-fronting
    // window-desired room whose ONLY external wall was just below the spec/fallback host
    // length emitted ZERO candidates → the shell rescue (which retries the room's EMITTED
    // windows) had nothing to retry → the room shipped WINDOWLESS. The last-resort tier
    // guarantees ≥1 candidate on any external wall that can physically host MIN_WINDOW_MM
    // (400) + corner piers.
    const win = (lenMm: number, idx = 0): ExternalWallSegment =>
        ({ start: { x: 0, y: 0 }, end: { x: lenMm, y: 0 }, wallIndex: idx });

    // Each type, with an external wall just BELOW its `minWidthMm + 200` fallback host —
    // previously ZERO, now exactly ONE minimal window that sits ON the wall.
    const belowFallback: ReadonlyArray<readonly [Parameters<typeof emitWindowsForRoom>[0], number]> = [
        ['living',   1300],   // fallback 1400
        ['kitchen',  1000],   // fallback 1100
        ['dining',   1300],   // fallback 1400
        ['master',   1150],   // fallback 1200
        ['bedroom',  1100],   // fallback 1200
        ['study',    1000],   // fallback 1100
        ['bathroom',  600],   // fallback  700
        ['ensuite',   600],   // fallback  700
        ['wc',        600],   // fallback  700
    ];

    it('emits exactly ONE on-wall window for every window-desired room with a short-but-hostable external wall', () => {
        for (const [type, lenMm] of belowFallback) {
            const ws = emitWindowsForRoom(type, [win(lenMm)]);
            expect(ws, `${type} @ ${lenMm}mm should get its one frontage window`).toHaveLength(1);
            const w = ws[0]!;
            // On the wall, ≥ MIN_WINDOW_MM wide, never overrunning either end.
            expect(w.widthMm, `${type} width`).toBeGreaterThanOrEqual(400);
            expect(w.offsetMm, `${type} offset ≥ 0`).toBeGreaterThanOrEqual(0);
            expect(w.offsetMm + w.widthMm, `${type} fits on wall`).toBeLessThanOrEqual(lenMm + 1e-6);
            expect(w.roomType).toBe(type);
        }
    });

    it('still returns [] when the wall is too short for even a minimal opening + piers', () => {
        // 350 mm < MIN_WINDOW_MM (400) → no opening fits between any reveals.
        for (const type of ['living', 'bedroom', 'bathroom'] as const) {
            expect(emitWindowsForRoom(type, [win(350)]), `${type} @ 350mm`).toHaveLength(0);
        }
    });

    it('an interior room (no external wall) still emits NOTHING (last-resort only fires on real frontage)', () => {
        for (const type of ['living', 'bedroom', 'bathroom'] as const) {
            expect(emitWindowsForRoom(type, [])).toHaveLength(0);
        }
    });

    it('does NOT change the normal tier — a generous wall keeps its full spec width + multi-window rhythm', () => {
        // 9 m living wall (well above the 2400 host) → the normal tier, byte-identical:
        // full 2000 mm windows, NOT shrunk to the 400 mm last-resort minimum.
        const ws = emitWindowsForRoom('living', [win(9000)]);
        expect(ws.length).toBeGreaterThanOrEqual(2);
        for (const w of ws) expect(w.widthMm).toBe(WINDOW_SPECS.living.widthMm);
    });

    it('non-windowable rooms (corridor) never get a last-resort window', () => {
        expect(emitWindowsForRoom('corridor', [win(1300)])).toHaveLength(0);
        expect(emitWindowsForRoom('hall', [win(1300)])).toHaveLength(0);
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
        expect(ws[0]!.offsetMm).toBe(1300);          // (5000 - 2400) / 2
    });

    it('slides the window clear of a centred door on the same wall (no overlap)', () => {
        // A.21.D45 — a 7 m wall (long enough to slide a 2 m living window clear of a
        // centred 0.9 m door AND keep the 0.7 m corner pier at both ends). The centred
        // window 2500..4500 overlaps the door at 2550..3450 → it slides past the door
        // (to ~3550..5550) while still inside [setback, len−setback].
        const doors = [door(0, 2550, 900)];
        const ws = emitWindowsForRoom('living', [wide(7000)], undefined, doors);
        expect(ws).toHaveLength(1);
        const w = ws[0]!;
        const wLo = w.offsetMm, wHi = w.offsetMm + w.widthMm;
        const dLo = 2550, dHi = 3450;
        expect(wLo < dHi && wHi > dLo).toBe(false);   // no overlap with the door
        expect(w.wallIndex).toBe(0);
        // and clear of both corners with the real pier.
        expect(wLo).toBeGreaterThanOrEqual(700 - 1e-6);
        expect(wHi).toBeLessThanOrEqual(7000 - 700 + 1e-6);
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
        expect(ws[0]!.offsetMm).toBe(1300);           // unaffected → centred (5000-2400)/2
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
        // Unchanged behaviour: 5 m is not "much longer" than a 2.4 m living patio span.
        const ws = emitWindowsForRoom('living', [wide(5000)]);
        expect(ws).toHaveLength(1);
        expect(ws[0]!.offsetMm).toBe(1300);   // still centred (5000-2400)/2
    });

    it('emits ≥ 2 evenly-spaced windows on a genuinely long wall', () => {
        // 10 m living wall: floor((10000-1400)/(2400+1400)) = floor(2.26) = 2.
        const ws = emitWindowsForRoom('living', [wide(10000)]);
        expect(ws.length).toBeGreaterThanOrEqual(2);
        for (const w of ws) {
            expect(w.wallIndex).toBe(0);
            expect(w.widthMm).toBe(2400);
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

    it('caps total windows per NON-living room at 4 even with many long walls', () => {
        const many = [
            wide(10000, 0), wide(10000, 1), wide(10000, 2), wide(10000, 3), wide(10000, 4),
        ];
        const ws = emitWindowsForRoom('bedroom', many);
        expect(ws.length).toBeLessThanOrEqual(4);
    });

    it('§WINDOW-LIVING-PATIO — the LIVING room earns a more generous cap (≤ 6) so it glazes more frontage', () => {
        const many = [
            wide(10000, 0), wide(10000, 1), wide(10000, 2), wide(10000, 3), wide(10000, 4),
        ];
        const ws = emitWindowsForRoom('living', many);
        expect(ws.length).toBeLessThanOrEqual(6);
        expect(ws.length).toBeGreaterThan(4);   // genuinely more than the standard cap
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
        expect(ws[0]!.offsetMm).toBe(1300);          // (5000 - 2400) / 2
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

    it('§68.16 GUARANTEE — a short wall split by a junction still keeps ONE minimal window in a sub-portion', () => {
        // A short 2.6 m living wall with a junction dead-centre: no 2.4 m patio span fits
        // either side, but the room's portion ([0,1300] longest interval) DOES host a
        // minimal opening. The founder's guarantee — "a window in every windowable
        // perimeter room with usable frontage" — now retains that minimal window via the
        // §WINDOW-EVERY-FRONTAGE safety net rather than dropping it. The window stays IN
        // its sub-portion and clear of the junction band.
        const js = [junction(0, 1300, 100)];
        const ws = emitWindowsForRoom('living', [wide(2600)], undefined, [], null, js);
        expect(ws).toHaveLength(1);
        const w = ws[0]!;
        expect(w.widthMm).toBeGreaterThanOrEqual(400);                  // ≥ MIN_WINDOW_MM
        expect(overlaps(spanOf(w), bandOf(js[0]!))).toBe(false);        // clears the junction
        expect(w.offsetMm).toBeGreaterThanOrEqual(0);
        expect(w.offsetMm + w.widthMm).toBeLessThanOrEqual(2600 + 1e-6); // on the wall
    });

    it('ignores junctions on OTHER walls', () => {
        const js = [junction(7, 2500, 100)];        // unrelated wall
        const ws = emitWindowsForRoom('living', [wide(5000, 0)], undefined, [], null, js);
        expect(ws[0]!.offsetMm).toBe(1300);          // unaffected → centred (5000-2400)/2
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

// ── §WINDOW-ROOM-PORTION (§57.2 + §57.8, founder 2026-06-11) ──────────────────
//
// Two founder defects on the generative path:
//   §57.8 — a room's window must be CENTRED on the room's OWN stretch of the
//           (possibly shared) external façade wall, not the whole wall.
//   §57.2 — two rooms fronting the SAME wall must not produce overlapping windows.
// The wiring passes the FULL shell wall as each room's ExternalWallSegment; the
// partition junctions on it bracket each room's portion. The window-band is the
// junction-bounded interval containing the room centroid (passed explicitly so it
// works near the equator where `solar` is absent), so the window centres on the
// room's stretch and can never spill into a neighbour's stretch of the same wall.
describe('emitWindowsForRoom — §WINDOW-ROOM-PORTION centring (§57.8 / §57.2)', () => {
    const wide = (lenMm: number, wallIndex = 0): ExternalWallSegment =>
        ({ start: { x: 0, y: 0 }, end: { x: lenMm, y: 0 }, wallIndex });
    const junction = (atMm: number, thicknessMm = 100): PartitionJunction =>
        ({ wallIndex: 0, atMm, thicknessMm });
    const centreOf = (w: { offsetMm: number; widthMm: number }) => w.offsetMm + w.widthMm / 2;

    it('single-external-wall room: window is centred on the wall segment', () => {
        // A room whose ONLY external wall is a 6 m segment → window centred at 3000.
        const ws = emitWindowsForRoom('bedroom', [wide(6000)], 'Bed');
        expect(ws).toHaveLength(1);
        // within 10% of the segment centre (3000 mm)
        expect(Math.abs(centreOf(ws[0]!) - 3000)).toBeLessThanOrEqual(0.10 * 6000);
        expect(ws[0]!.offsetMm).toBeCloseTo((6000 - ws[0]!.widthMm) / 2, 6);
    });

    it('shared façade: window centres on the ROOM portion (containing the centroid), not the wall', () => {
        // 12 m shared wall; THIS room owns [3000, 7000] (partitions at 3000 & 7000),
        // its centroid projects to ~5000 along the wall. The window must centre on the
        // room portion centre (5000), NOT the full-wall centre (6000) nor a neighbour's
        // stretch. Centroid passed explicitly (equator-safe path, no solar).
        const js = [junction(3000), junction(7000)];
        const ws = emitWindowsForRoom('bedroom', [wide(12000)], 'Bed', [], null, js, { x: 5000, y: 2000 });
        expect(ws.length).toBeGreaterThanOrEqual(1);
        // every emitted window sits inside the room's own portion [3000, 7000]
        for (const w of ws) {
            expect(w.offsetMm).toBeGreaterThanOrEqual(3000 - 1e-6);
            expect(w.offsetMm + w.widthMm).toBeLessThanOrEqual(7000 + 1e-6);
        }
        // and the (single) window is centred on the room portion centre (5000) ±10%
        expect(Math.abs(centreOf(ws[0]!) - 5000)).toBeLessThanOrEqual(0.10 * 4000);
    });

    it('two rooms on the SAME shared wall never produce overlapping spans (no spill)', () => {
        // Wall split at 6000: room A owns [0, 6000] (centroid ~3000), room B owns
        // [6000, 12000] (centroid ~9000). Each emits within its own half → disjoint.
        const js = [junction(6000)];
        const a = emitWindowsForRoom('bedroom', [wide(12000)], 'A', [], null, js, { x: 3000, y: 2000 });
        const b = emitWindowsForRoom('bedroom', [wide(12000)], 'B', [], null, js, { x: 9000, y: 2000 });
        expect(a.length + b.length).toBeGreaterThanOrEqual(2);
        // No A window overlaps any B window on this shared wall.
        for (const wa of a) for (const wb of b) {
            const aLo = wa.offsetMm, aHi = wa.offsetMm + wa.widthMm;
            const bLo = wb.offsetMm, bHi = wb.offsetMm + wb.widthMm;
            expect(aLo < bHi && aHi > bLo, `A[${aLo},${aHi}] vs B[${bLo},${bHi}]`).toBe(false);
        }
    });

    it('falls back to the longest junction interval when no centroid is supplied', () => {
        // No centroid + a junction at 4000 on a 10 m wall → band = longest interval
        // [4000, 10000] (6 m) over [0, 4000] (4 m). Window stays inside that interval.
        const js = [junction(4000)];
        const ws = emitWindowsForRoom('living', [wide(10000)], 'L', [], null, js);
        expect(ws.length).toBeGreaterThanOrEqual(1);
        for (const w of ws) {
            expect(w.offsetMm).toBeGreaterThanOrEqual(4000 - 1e-6);
            expect(w.offsetMm + w.widthMm).toBeLessThanOrEqual(10000 + 1e-6);
        }
    });
});

// ── §WINDOW-ROOM-PORTION-ROBUST (§72.1 + §72.2, founder full-house, 2026-06-12) ─
//
// The founder's full-house test surfaced a window straddling a partition that
// T-joins the MIDDLE of a long SHARED shell wall: one window centred on the WHOLE
// wall run sits ON the partition (visually "shared by two rooms" — §72.2) and is
// off the room's own portion (§72.1). The §WINDOW-ROOM-PORTION band already confines
// a window to the room's junction-bounded interval when the junction is supplied;
// these pin the HARDENED guarantees:
//   • a window NEVER straddles a T-junction on its host wall's body (the band can't
//     contain a cut by construction, AND the junction is a blocked span);
//   • each room's window is CENTRED on the room's OWN portion (not the whole wall);
//   • duplicate junction detections (one partition surfacing two near-coincident
//     cuts) don't collapse the band to a sliver; and
//   • two rooms sharing one wall resolve to DIFFERENT portions even when a centroid
//     projects onto a junction (no cross-room spill / forced de-overlap drop).
describe('emitWindowsForRoom — §WINDOW-ROOM-PORTION-ROBUST (§72.1 / §72.2)', () => {
    const wide = (lenMm: number, wallIndex = 0): ExternalWallSegment =>
        ({ start: { x: 0, y: 0 }, end: { x: lenMm, y: 0 }, wallIndex });
    const junction = (atMm: number, thicknessMm = 100): PartitionJunction =>
        ({ wallIndex: 0, atMm, thicknessMm });
    const centreOf = (w: { offsetMm: number; widthMm: number }) => w.offsetMm + w.widthMm / 2;
    const jBand = (j: PartitionJunction) => {
        const half = (j.thicknessMm ?? 0) > 0 ? j.thicknessMm! / 2 + 100 : 150;
        return { lo: j.atMm - half, hi: j.atMm + half };
    };
    const overlaps = (a: { lo: number; hi: number }, b: { lo: number; hi: number }) =>
        a.lo < b.hi && a.hi > b.lo;

    it('long shared wall, partition T-joins the MIDDLE: each room owns its portion, neither straddles', () => {
        // An 8 m shell wall (e.g. a 200 mm shell) shared by TWO bedrooms; a partition
        // T-joins its dead centre at 4000. Room A's centroid projects to ~2000 (owns
        // [0,4000]); Room B's to ~6000 (owns [4000,8000]). BEFORE the fix a window
        // centred on the WHOLE 8 m wall lands at 3100..4900 — straddling the 4000
        // junction (the founder's "window shared by two rooms"). AFTER, each window is
        // confined to + centred on its OWN half and clears the partition band.
        const j = junction(4000);
        const a = emitWindowsForRoom('bedroom', [wide(8000)], 'A', [], null, [j], { x: 2000, y: 1500 });
        const b = emitWindowsForRoom('bedroom', [wide(8000)], 'B', [], null, [j], { x: 6000, y: 1500 });
        expect(a).toHaveLength(1);
        expect(b).toHaveLength(1);
        // (§72.2) neither window crosses the partition junction band …
        expect(overlaps({ lo: a[0]!.offsetMm, hi: a[0]!.offsetMm + a[0]!.widthMm }, jBand(j))).toBe(false);
        expect(overlaps({ lo: b[0]!.offsetMm, hi: b[0]!.offsetMm + b[0]!.widthMm }, jBand(j))).toBe(false);
        // … and each lies WHOLLY within its own portion (A in [0,4000], B in [4000,8000]).
        expect(a[0]!.offsetMm + a[0]!.widthMm).toBeLessThanOrEqual(4000 + 1e-6);
        expect(b[0]!.offsetMm).toBeGreaterThanOrEqual(4000 - 1e-6);
        // (§72.1) each is CENTRED on its own portion centre (2000 / 6000), not the wall
        // centre (4000).
        expect(Math.abs(centreOf(a[0]!) - 2000)).toBeLessThanOrEqual(0.10 * 4000);
        expect(Math.abs(centreOf(b[0]!) - 6000)).toBeLessThanOrEqual(0.10 * 4000);
        // The two windows are disjoint on the shared wall (no spill → no de-overlap drop).
        const aLo = a[0]!.offsetMm, aHi = a[0]!.offsetMm + a[0]!.widthMm;
        const bLo = b[0]!.offsetMm, bHi = b[0]!.offsetMm + b[0]!.widthMm;
        expect(aLo < bHi && aHi > bLo).toBe(false);
    });

    it('the window that previously SPANNED the junction now does not', () => {
        // Direct before/after pin. Whole-wall centred window on an 8 m wall = [3100,4900]
        // for a 1.8 m bedroom window — it SPANS the 4000 junction. With the room-portion
        // band the emitted window must NOT contain 4000.
        const j = junction(4000);
        const ws = emitWindowsForRoom('bedroom', [wide(8000)], 'A', [], null, [j], { x: 2000, y: 1500 });
        expect(ws).toHaveLength(1);
        const w = ws[0]!;
        const spansJunction = w.offsetMm < 4000 && w.offsetMm + w.widthMm > 4000;
        expect(spansJunction).toBe(false);
        // The naive whole-wall centred placement WOULD have spanned it (sanity on the repro).
        const naiveOff = (8000 - w.widthMm) / 2;
        expect(naiveOff < 4000 && naiveOff + w.widthMm > 4000).toBe(true);
    });

    it('duplicate junction detections (same partition) do NOT collapse the band to a sliver', () => {
        // The wiring emits one junction per interior-wall ENDPOINT landing on the shell, so
        // a single partition can surface two near-coincident cuts (e.g. 4000 and 4040). The
        // de-dup must treat them as ONE cut so the room still owns a full half, not a sliver.
        const js = [junction(4000), junction(4040)];
        const ws = emitWindowsForRoom('bedroom', [wide(8000)], 'A', [], null, js, { x: 2000, y: 1500 });
        expect(ws).toHaveLength(1);
        const w = ws[0]!;
        // Window hosts in the [0,~4000] portion, not squeezed into a sub-40 mm sliver.
        expect(w.widthMm).toBeGreaterThanOrEqual(400);
        expect(w.offsetMm + w.widthMm).toBeLessThanOrEqual(4040 + 1e-6);
    });

    it('three rooms sharing one wall: middle room centres on its MIDDLE portion', () => {
        // 12 m wall split at 4000 and 8000 → three 4 m portions. The middle room (centroid
        // ~6000) must centre its window on [4000,8000], not an end portion.
        const js = [junction(4000), junction(8000)];
        const mid = emitWindowsForRoom('bedroom', [wide(12000)], 'Mid', [], null, js, { x: 6000, y: 1500 });
        expect(mid.length).toBeGreaterThanOrEqual(1);
        for (const w of mid) {
            expect(w.offsetMm).toBeGreaterThanOrEqual(4000 - 1e-6);
            expect(w.offsetMm + w.widthMm).toBeLessThanOrEqual(8000 + 1e-6);
        }
        expect(Math.abs(centreOf(mid[0]!) - 6000)).toBeLessThanOrEqual(0.10 * 4000);
    });

    it('is deterministic across runs', () => {
        const js = [junction(4000)];
        const a = emitWindowsForRoom('bedroom', [wide(8000)], 'A', [], null, js, { x: 2000, y: 1500 });
        const b = emitWindowsForRoom('bedroom', [wide(8000)], 'A', [], null, js, { x: 2000, y: 1500 });
        expect(a.map(w => [w.offsetMm, w.widthMm])).toEqual(b.map(w => [w.offsetMm, w.widthMm]));
    });
});

// ── §68.16 — BIGGER windows + a window in EVERY windowable perimeter room ──────
//
// Founder 2026-06-11: "windows are a big issue — we need BIGGER windows and windows
// in ALL rooms." These pin the three new guarantees: (1) bigger generous specs that
// still fit under the storey head height; (2) a window in EVERY windowable room that
// fronts a usable external wall (≥ MIN_WINDOW_MM between corner piers); (3) the bigger
// widths stay IN-BOUNDS — a window wider than its host wall clamps to fit, never
// overruns the run.
describe('§68.16 — bigger windows + window in every windowable perimeter room', () => {
    const wide = (lenMm: number, wallIndex = 0): ExternalWallSegment =>
        ({ start: { x: 0, y: 0 }, end: { x: lenMm, y: 0 }, wallIndex });

    it('every windowable perimeter room on a representative house plate gets ≥1 window', () => {
        // A house plate's rooms, each fronting one external wall of a realistic length.
        // BEFORE §68.16 (old specs + reject-on-short-wall) several of these — a wall just
        // below the room's minWallLength with no fallback host — shipped WINDOWLESS; the
        // guarantee now retains ≥1 window for each. (See the FAIL-before note below.)
        const plate: ReadonlyArray<readonly [Parameters<typeof emitWindowsForRoom>[0], number]> = [
            ['living',   3200],
            ['kitchen',  1800],
            ['dining',   2300],
            ['master',   2000],
            ['bedroom',  1900],
            ['bedroom',  1600],
            ['study',    1500],
            ['bathroom', 1100],
            ['ensuite',  1050],
            ['wc',        900],
        ];
        plate.forEach(([type, lenMm], i) => {
            const ws = emitWindowsForRoom(type, [wide(lenMm, i)], `${type}-${i}`);
            expect(ws.length, `${type} @ ${lenMm}mm must get ≥1 window`).toBeGreaterThanOrEqual(1);
            for (const w of ws) {
                // Every emitted window sits ON its host wall run (in-bounds).
                expect(w.offsetMm, `${type} offset ≥ 0`).toBeGreaterThanOrEqual(0);
                expect(w.offsetMm + w.widthMm, `${type} fits on wall`).toBeLessThanOrEqual(lenMm + 1e-6);
                // Head height fits under a ~2.4 m clear storey.
                expect(w.sillMm + w.heightMm, `${type} head ≤ 2300`).toBeLessThanOrEqual(2300);
            }
        });
    });

    it('a bigger spec on a SHORT wall clamps to fit — never overruns the host run (§68.4)', () => {
        // A living patio door (preferred 2400 mm) on a 2.5 m wall: it cannot host the
        // full span, so the engine emits a shrunk-to-fit minimal window that stays ON
        // the wall (never a 2400 mm span overflowing a 2500 mm wall).
        for (const [type, lenMm] of [['living', 2500], ['master', 2300], ['dining', 2400]] as const) {
            const ws = emitWindowsForRoom(type, [wide(lenMm)]);
            expect(ws.length, `${type} @ ${lenMm}mm`).toBeGreaterThanOrEqual(1);
            for (const w of ws) {
                expect(w.offsetMm).toBeGreaterThanOrEqual(0);
                expect(w.offsetMm + w.widthMm, `${type} window must not overrun the wall`)
                    .toBeLessThanOrEqual(lenMm + 1e-6);
            }
        }
    });

    it('a generous wall keeps the FULL bigger spec width (no shrink when it fits)', () => {
        // Living on a 4 m wall hosts the full 2400 mm patio span; bedroom 1800 mm; etc.
        expect(emitWindowsForRoom('living', [wide(4000)])[0]!.widthMm).toBe(2400);
        expect(emitWindowsForRoom('bedroom', [wide(4000)])[0]!.widthMm).toBe(1800);
        expect(emitWindowsForRoom('dining', [wide(4000)])[0]!.widthMm).toBe(2100);
        // §WINDOW-SIZE-BY-TYPE (#8) — kitchen is now a LARGE window (1800), matching bedroom.
        expect(emitWindowsForRoom('kitchen', [wide(4000)])[0]!.widthMm).toBe(1800);
    });

    it('the living spec is the full-height sliding/patio door (dims)', () => {
        const w = emitWindowsForRoom('living', [wide(5000)])[0]!;
        expect(w.sillMm).toBe(10);
        expect(w.heightMm).toBe(2190);
        expect(w.sillMm + w.heightMm).toBe(2200);   // head reaches 2.2 m
        expect(w.widthMm).toBe(2400);
    });
});

// ── #4 — §WINDOW-IN-BOUNDS-POSTCOND (founder full-house, 2026-06-12) ───────────
//
// "A window STILL goes out through a perimeter wall." The HARD post-condition: EVERY
// emitted window must satisfy offset ≥ corner-setback AND offset+width ≤ wallLen −
// corner-setback for its host ExternalWallSegment. These pin the guarantee across the
// whole emission surface (spec width, climate/style bias, multi-window, short walls,
// junction-split bands, doors) — no emitted span may ever exceed its host wall run.
describe('#4 — §WINDOW-IN-BOUNDS-POSTCOND: no window ever exceeds its host wall', () => {
    const wide = (lenMm: number, wallIndex = 0): ExternalWallSegment =>
        ({ start: { x: 0, y: 0 }, end: { x: lenMm, y: 0 }, wallIndex });
    const junction = (atMm: number, thicknessMm = 100): PartitionJunction =>
        ({ wallIndex: 0, atMm, thicknessMm });
    const door = (startMm: number, widthMm: number): OccupiedSpan =>
        ({ wallIndex: 0, startMm, endMm: startMm + widthMm });

    // Corner setback mirrors endSetbackMm in emitWindows.ts (for the assertion).
    const setbackOf = (wallLenMm: number): number => {
        const scaled = Math.min(1200, Math.max(500, 0.10 * wallLenMm));
        const maxAffordable = Math.max(0, (wallLenMm - 400) / 2);
        return Math.min(scaled, maxAffordable);
    };
    const inBounds = (ws: ReadonlyArray<{ offsetMm: number; widthMm: number }>, wallLenMm: number, label: string) => {
        const sb = setbackOf(wallLenMm);
        for (const w of ws) {
            // HARD #4 guarantee: never past either wall end.
            expect(w.offsetMm, `${label} offset ≥ 0`).toBeGreaterThanOrEqual(-1e-3);
            expect(w.offsetMm + w.widthMm, `${label} offset+width ≤ wallLen`)
                .toBeLessThanOrEqual(wallLenMm + 1e-3);
            // Corner pier honoured WHEN the wall can afford it (a short wall legitimately
            // centres the window with a reduced/zero pier, like the placer).
            if (wallLenMm - w.widthMm >= 2 * sb - 1e-3) {
                expect(w.offsetMm, `${label} offset ≥ setback (afforded)`).toBeGreaterThanOrEqual(sb - 1e-3);
                expect(w.offsetMm + w.widthMm, `${label} ≤ wallLen − setback (afforded)`)
                    .toBeLessThanOrEqual(wallLenMm - sb + 1e-3);
            }
        }
    };

    const ALL: WindowableRoomType[] =
        ['living', 'kitchen', 'dining', 'master', 'bedroom', 'study', 'bathroom', 'ensuite', 'wc'];

    it('every room type, across a sweep of wall lengths, lands strictly in-bounds', () => {
        for (const t of ALL) {
            // From just-hostable (≈ a minimal opening + piers) up to a long ribbon wall.
            for (const lenMm of [900, 1100, 1500, 2000, 2600, 3500, 5000, 7000, 10000, 14000]) {
                const ws = emitWindowsForRoom(t, [wide(lenMm)], `${t}`);
                inBounds(ws, lenMm, `${t}@${lenMm}`);
            }
        }
    });

    it('with the style glazing bias up (1.4×), the widened window still stays in-bounds', () => {
        for (const t of ALL) {
            for (const lenMm of [2000, 2600, 3500, 5000, 9000]) {
                const ws = emitWindowsForRoom(t, [wide(lenMm)], `${t}`, [], null, [], null, 1.4);
                inBounds(ws, lenMm, `${t}@${lenMm} bias1.4`);
            }
        }
    });

    it('a junction-split short band keeps its window in-bounds of the FULL wall', () => {
        // 2.6 m living wall split dead-centre — the window must stay ON the 2.6 m wall.
        // (HARD bounds only: the window sits in a ~1.3 m sub-band, whose own affordable
        // corner pier is smaller than the full-wall pier — the #4 guarantee is the hard
        // [0, wallLen] span, which the post-condition + band confinement both enforce.)
        const ws = emitWindowsForRoom('living', [wide(2600)], 'L', [], null, [junction(1300)]);
        expect(ws.length).toBeGreaterThanOrEqual(1);
        for (const w of ws) {
            expect(w.offsetMm, 'living split offset ≥ 0').toBeGreaterThanOrEqual(-1e-3);
            expect(w.offsetMm + w.widthMm, 'living split ≤ wallLen').toBeLessThanOrEqual(2600 + 1e-3);
        }
    });

    it('a crowded long wall (doors + junctions) never emits a window past either corner', () => {
        const doors = [door(1000, 900), door(5000, 900)];
        const js = [junction(3000), junction(7000)];
        for (const t of ['living', 'bedroom', 'kitchen'] as const) {
            const ws = emitWindowsForRoom(t, [wide(9000)], `${t}`, doors, null, js);
            inBounds(ws, 9000, `${t} crowded`);
        }
    });
});

// ── #6 — LIVING (and every habitable perimeter room) ALWAYS gets a window ──────
//
// "Of extreme importance, the daylight of the living room is really important." The
// hardened §WINDOW-EVERY-FRONTAGE safety net guarantees a window on ANY external wall
// that can host a minimal opening between its corner piers — even when the spec-width
// candidate was crowded out by doors / partition junctions, even when the room's portion
// is short, by progressively shrinking the width and (as a last resort) ignoring the
// blocked spans and using the whole wall. A perimeter living room is NEVER windowless.
describe('#6 — living always gets a window on any hostable frontage', () => {
    const wide = (lenMm: number, wallIndex = 0): ExternalWallSegment =>
        ({ start: { x: 0, y: 0 }, end: { x: lenMm, y: 0 }, wallIndex });
    const junction = (atMm: number, thicknessMm = 100): PartitionJunction =>
        ({ wallIndex: 0, atMm, thicknessMm });
    const door = (startMm: number, widthMm: number): OccupiedSpan =>
        ({ wallIndex: 0, startMm, endMm: startMm + widthMm });

    it('living on a short hostable wall (1.1 m) gets its window', () => {
        const ws = emitWindowsForRoom('living', [wide(1100)], 'Living');
        expect(ws.length).toBeGreaterThanOrEqual(1);
    });

    it('living whose only wall is crowded by a centred door STILL gets a window', () => {
        // A 5 m wall with a centred door — the spec patio span (2400) can't sit clear, but
        // a smaller window fits in a side gap. The hardened net retains one window.
        const ws = emitWindowsForRoom('living', [wide(5000)], 'Living', [door(1900, 1200)]);
        expect(ws.length, 'living must not ship windowless on real frontage').toBeGreaterThanOrEqual(1);
        const w = ws[0]!;
        // never carved over the door.
        expect(w.offsetMm < 3100 && w.offsetMm + w.widthMm > 1900).toBe(false);
    });

    it('living on a wall split into short portions by two junctions STILL gets a window', () => {
        // Junctions at 1.4 m + 2.8 m → three ~1.4 m portions; no patio span fits, but the
        // net shrinks the width / uses the whole wall to keep one window.
        const ws = emitWindowsForRoom('living', [wide(4200)], 'Living', [], null,
            [junction(1400), junction(2800)], { x: 700, y: 2000 });
        expect(ws.length).toBeGreaterThanOrEqual(1);
    });

    it('every habitable perimeter room on a crowded frontage keeps ≥1 window', () => {
        for (const t of ['living', 'kitchen', 'dining', 'master', 'bedroom', 'study'] as const) {
            // A wall with a door eating much of the middle but a real side gap remaining.
            const ws = emitWindowsForRoom(t, [wide(4500)], `${t}`, [door(900, 1800)]);
            expect(ws.length, `${t} habitable perimeter room must keep a window`).toBeGreaterThanOrEqual(1);
        }
    });

    it('a genuinely interior living room (no external wall) still emits nothing', () => {
        expect(emitWindowsForRoom('living', [])).toHaveLength(0);
    });
});

// ── #8 — WINDOW SIZE BY ROOM TYPE (founder full-house, 2026-06-12) ─────────────
//
// "Bedrooms should have LARGE windows, as well as kitchen, living and dining; SMALL
// windows only for corridors, hall and bathrooms/ensuite." The WINDOW_SIZE_CLASS table
// is the single source of truth; these pin the LARGE/SMALL contract + that the engine
// realises it on a generous wall.
describe('#8 — window size by room type (large habitable / small wet)', () => {
    const wide = (lenMm: number, wallIndex = 0): ExternalWallSegment =>
        ({ start: { x: 0, y: 0 }, end: { x: lenMm, y: 0 }, wallIndex });

    it('size class table: living/dining/kitchen/master/bedroom/study = large; wet rooms = small', () => {
        for (const t of ['living', 'dining', 'kitchen', 'master', 'bedroom', 'study'] as const) {
            expect(WINDOW_SIZE_CLASS[t], `${t} should be LARGE`).toBe('large');
        }
        for (const t of ['bathroom', 'ensuite', 'wc'] as const) {
            expect(WINDOW_SIZE_CLASS[t], `${t} should be SMALL`).toBe('small');
        }
    });

    it('every LARGE spec is ≥ LARGE_MIN_WIDTH_MM; every SMALL spec ≤ SMALL_MAX_WIDTH_MM', () => {
        for (const [t, cls] of Object.entries(WINDOW_SIZE_CLASS)) {
            const spec = WINDOW_SPECS[t as WindowableRoomType];
            if (cls === 'large') {
                expect(spec.widthMm, `${t} large width ≥ ${LARGE_MIN_WIDTH_MM}`).toBeGreaterThanOrEqual(LARGE_MIN_WIDTH_MM);
                expect(spec.minWidthMm, `${t} large min ≥ 1000`).toBeGreaterThanOrEqual(1000);
            } else {
                expect(spec.widthMm, `${t} small width ≤ ${SMALL_MAX_WIDTH_MM}`).toBeLessThanOrEqual(SMALL_MAX_WIDTH_MM);
            }
        }
    });

    it('living/dining/kitchen are the daylight showpieces — strictly wider than the wet rooms', () => {
        const wet = Math.max(WINDOW_SPECS.bathroom.widthMm, WINDOW_SPECS.ensuite.widthMm, WINDOW_SPECS.wc.widthMm);
        for (const t of ['living', 'dining', 'kitchen'] as const) {
            expect(WINDOW_SPECS[t].widthMm, `${t} wider than any wet room`).toBeGreaterThan(wet);
        }
    });

    it('emits a LARGE window for bedroom/kitchen and a SMALL one for bathroom on a generous wall', () => {
        const bedroom = emitWindowsForRoom('bedroom', [wide(5000)])[0]!;
        const kitchen = emitWindowsForRoom('kitchen', [wide(5000)])[0]!;
        const bath    = emitWindowsForRoom('bathroom', [wide(5000)])[0]!;
        expect(bedroom.widthMm).toBeGreaterThanOrEqual(LARGE_MIN_WIDTH_MM);
        expect(kitchen.widthMm).toBeGreaterThanOrEqual(LARGE_MIN_WIDTH_MM);
        expect(bath.widthMm).toBeLessThanOrEqual(SMALL_MAX_WIDTH_MM);
        expect(bath.sillMm).toBeGreaterThan(1300);   // small + privacy-silled
        // the large rooms are genuinely larger in glazed area than the wet room.
        expect(bedroom.widthMm).toBeGreaterThan(bath.widthMm);
        expect(kitchen.widthMm).toBeGreaterThan(bath.widthMm);
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
