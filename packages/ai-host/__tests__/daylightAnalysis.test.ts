// §27 / §61 — per-room OFFLINE daylight analytic pass tests.
//
// Contract (SPIKE-DAYLIGHT-SUN-PENETRATION §B): pure, deterministic, renderer-
// independent. The metric must be MONOTONE in the founder's "depends on window
// size and location":
//   • a south-facing big window scores > a small north window > windowless = 0
//   • bigger window > smaller window
//   • lower sill > higher sill
//   • the integration is byte-stable across runs (determinism / ADR-0061)
//   • per-window contribution attribution is correct (which window lit the room)

import { describe, expect, it } from 'vitest';
import {
    computeRoomDaylight,
    computeBuildingDaylight,
    defaultSunSamples,
    sunDirection,
} from '../src/workflows/daylight/daylightAnalysis.js';
import type {
    Pt2,
    RoomDaylightInput,
    WindowAperture,
} from '../src/workflows/daylight/types.js';

// World XZ, metres. North = −z. The wall at z = D (max z) faces SOUTH (+z).
const W = 4, D = 4;
const rectPoly: Pt2[] = [
    { x: 0, z: 0 }, { x: W, z: 0 }, { x: W, z: D }, { x: 0, z: D },
];

/** A window on the SOUTH wall (z = D), outward normal +z. Centred at x = cx,
 *  spanning `width` metres, sill→head as given. */
function southWindow(width: number, sillM: number, headM: number, cx = W / 2): WindowAperture {
    return {
        a: { x: cx - width / 2, z: D },
        b: { x: cx + width / 2, z: D },
        sillM, headM,
        outwardNormal: { x: 0, z: 1 }, // South
        label: 'south',
    };
}

/** A window on the NORTH wall (z = 0), outward normal −z. */
function northWindow(width: number, sillM: number, headM: number, cx = W / 2): WindowAperture {
    return {
        a: { x: cx - width / 2, z: 0 },
        b: { x: cx + width / 2, z: 0 },
        sillM, headM,
        outwardNormal: { x: 0, z: -1 }, // North
        label: 'north',
    };
}

function room(windows: WindowAperture[], roomId = 'r1'): RoomDaylightInput {
    return { roomId, polygon: rectPoly, windows };
}

// Northern-hemisphere UK-ish latitude → noon sun in the South.
const sun = defaultSunSamples(51.5);

describe('sunDirection', () => {
    it('points East at azimuth 90, level', () => {
        const d = sunDirection(90, 0);
        expect(d.x).toBeCloseTo(1, 6);
        expect(d.y).toBeCloseTo(0, 6);
        expect(d.z).toBeCloseTo(0, 6);
    });
    it('points South (+z) at azimuth 180, level', () => {
        const d = sunDirection(180, 0);
        expect(d.x).toBeCloseTo(0, 6);
        expect(d.z).toBeCloseTo(1, 6);
    });
    it('points North (−z) at azimuth 0', () => {
        const d = sunDirection(0, 0);
        expect(d.z).toBeCloseTo(-1, 6);
    });
    it('is a unit vector', () => {
        const d = sunDirection(123, 37);
        expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 9);
    });
    it('rises with elevation (up = sin elev)', () => {
        expect(sunDirection(180, 30).y).toBeCloseTo(0.5, 6);
    });
});

describe('defaultSunSamples', () => {
    it('puts the noon sun in the South for the N hemisphere', () => {
        const s = defaultSunSamples(51.5).find(x => x.label === 'equinox noon')!;
        expect(s.azimuthDeg).toBe(180);
        expect(s.elevationDeg).toBeGreaterThan(0);
    });
    it('puts the noon sun in the North for the S hemisphere', () => {
        const s = defaultSunSamples(-33.8).find(x => x.label === 'equinox noon')!;
        expect(s.azimuthDeg).toBe(0);
    });
    it('is deterministic + pure (same lat → identical set)', () => {
        expect(defaultSunSamples(51.5)).toEqual(defaultSunSamples(51.5));
    });
    it('returns 9 samples (3 declinations × 3 hours)', () => {
        expect(defaultSunSamples(51.5)).toHaveLength(9);
    });
});

describe('computeRoomDaylight — monotonicity', () => {
    it('windowless room scores 0', () => {
        const r = computeRoomDaylight(room([]), sun);
        expect(r.score).toBe(0);
        expect(r.raw).toBe(0);
        expect(r.windows).toHaveLength(0);
        expect(r.sampleCount).toBeGreaterThan(0); // grid still laid
    });

    it('south-facing window scores > 0', () => {
        const r = computeRoomDaylight(room([southWindow(2.0, 0.9, 2.1)]), sun);
        expect(r.score).toBeGreaterThan(0);
        expect(r.raw).toBeGreaterThan(0);
        expect(r.sunlitFraction).toBeGreaterThan(0);
    });

    it('south-facing big window > small north window > windowless', () => {
        const bigSouth = computeRoomDaylight(room([southWindow(2.4, 0.1, 2.2)]), sun).score;
        const smallNorth = computeRoomDaylight(room([northWindow(0.7, 1.4, 2.2)]), sun).score;
        const none = computeRoomDaylight(room([]), sun).score;
        expect(bigSouth).toBeGreaterThan(smallNorth);
        expect(smallNorth).toBeGreaterThan(none);
        expect(none).toBe(0);
    });

    it('bigger window scores higher than a smaller one (same wall/sill)', () => {
        const big = computeRoomDaylight(room([southWindow(3.0, 0.9, 2.1)]), sun).score;
        const small = computeRoomDaylight(room([southWindow(1.0, 0.9, 2.1)]), sun).score;
        expect(big).toBeGreaterThan(small);
    });

    it('lower sill scores higher than a higher sill (same width/head)', () => {
        const low = computeRoomDaylight(room([southWindow(2.0, 0.1, 2.1)]), sun).score;
        const high = computeRoomDaylight(room([southWindow(2.0, 1.4, 2.1)]), sun).score;
        expect(low).toBeGreaterThan(high);
    });

    it('south window outscores an identical north window (orientation)', () => {
        const s = computeRoomDaylight(room([southWindow(2.0, 0.9, 2.1)]), sun).score;
        const n = computeRoomDaylight(room([northWindow(2.0, 0.9, 2.1)]), sun).score;
        expect(s).toBeGreaterThan(n);
    });

    it('score is clamped to [0,1]', () => {
        // A wall of glass on the sun-facing façade should saturate near 1.
        const r = computeRoomDaylight(room([southWindow(3.8, 0.01, 2.2)]), sun);
        expect(r.score).toBeGreaterThan(0);
        expect(r.score).toBeLessThanOrEqual(1);
    });
});

describe('computeRoomDaylight — determinism', () => {
    it('is byte-stable across runs', () => {
        const inp = room([southWindow(2.0, 0.9, 2.1), northWindow(1.0, 1.0, 2.0)]);
        const a = computeRoomDaylight(inp, sun);
        const b = computeRoomDaylight(inp, sun);
        expect(a).toEqual(b);
        expect(a.raw).toBe(b.raw);
        expect(a.score).toBe(b.score);
    });

    it('grid is capped by maxSamplePoints', () => {
        const big: Pt2[] = [
            { x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }, { x: 0, z: 100 },
        ];
        const r = computeRoomDaylight(
            { roomId: 'big', polygon: big, windows: [] },
            sun, { gridSpacingM: 0.5, maxSamplePoints: 500 },
        );
        expect(r.sampleCount).toBeLessThanOrEqual(500);
    });
});

describe('computeRoomDaylight — window attribution', () => {
    it('attributes contributions per window, sorted by raw desc, fractions sum to ~1', () => {
        const r = computeRoomDaylight(
            room([southWindow(2.4, 0.1, 2.2), northWindow(0.7, 1.4, 2.0)]), sun,
        );
        expect(r.windows).toHaveLength(2);
        // Sorted descending by raw.
        expect(r.windows[0]!.raw).toBeGreaterThanOrEqual(r.windows[1]!.raw);
        // The south window (index 0) should dominate.
        expect(r.windows[0]!.windowIndex).toBe(0);
        const fracSum = r.windows.reduce((a, w) => a + w.fraction, 0);
        expect(fracSum).toBeCloseTo(1, 6);
    });
});

describe('computeRoomDaylight — degenerate inputs', () => {
    it('a <3-vertex polygon scores 0 with no samples', () => {
        const r = computeRoomDaylight(
            { roomId: 'deg', polygon: [{ x: 0, z: 0 }, { x: 1, z: 0 }], windows: [southWindow(1, 0.9, 2.1)] },
            sun,
        );
        expect(r.score).toBe(0);
        expect(r.sampleCount).toBe(0);
    });

    it('a zero-width / zero-height aperture contributes nothing', () => {
        const zeroW: WindowAperture = {
            a: { x: 2, z: D }, b: { x: 2, z: D }, sillM: 0.9, headM: 2.1,
            outwardNormal: { x: 0, z: 1 },
        };
        const r = computeRoomDaylight(room([zeroW]), sun);
        expect(r.raw).toBe(0);
    });

    it('below-horizon sun samples are skipped', () => {
        const r = computeRoomDaylight(
            room([southWindow(2, 0.9, 2.1)]),
            [{ azimuthDeg: 180, elevationDeg: -10 }],
        );
        expect(r.raw).toBe(0);
        expect(r.sunlitFraction).toBe(0);
    });
});

describe('computeBuildingDaylight', () => {
    it('scores every room, sorts brightest-first, reports extremes', () => {
        const bright = room([southWindow(3.0, 0.1, 2.2)], 'bright');
        const dim = room([northWindow(0.7, 1.5, 2.1)], 'dim');
        const dark = room([], 'dark');
        const out = computeBuildingDaylight([dim, dark, bright], sun);
        expect(out.rooms).toHaveLength(3);
        expect(out.rooms[0]!.roomId).toBe('bright');
        expect(out.rooms[out.rooms.length - 1]!.roomId).toBe('dark');
        expect(out.brightestRoomId).toBe('bright');
        expect(out.darkestRoomId).toBe('dark');
        expect(out.meanScore).toBeGreaterThan(0);
        expect(out.meanScore).toBeLessThanOrEqual(1);
    });

    it('empty building → mean 0, no extremes', () => {
        const out = computeBuildingDaylight([], sun);
        expect(out.rooms).toHaveLength(0);
        expect(out.meanScore).toBe(0);
        expect(out.brightestRoomId).toBeUndefined();
        expect(out.darkestRoomId).toBeUndefined();
    });

    it('is deterministic across runs', () => {
        const rooms = [room([southWindow(2, 0.9, 2.1)], 'a'), room([northWindow(1, 1, 2)], 'b')];
        expect(computeBuildingDaylight(rooms, sun)).toEqual(computeBuildingDaylight(rooms, sun));
    });
});
