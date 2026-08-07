/**
 * §FEAT-HOSTED-ON-CURVED-WALL — the radial-band carve.
 *
 * Asserts, numerically:
 *   • an opening spanning MULTIPLE tessellated sub-segments carves as ONE void,
 *     not N — the founder's crux question;
 *   • the carved void's measured width on the HOSTING (centreline) face equals
 *     the opening width within tolerance;
 *   • there is NO over/under-cut wedge: the jamb is radial, so the deviation of
 *     the band's terminal face from the true arc normal is ~0, whereas a straight
 *     box subtraction would deviate by a measurable angle;
 *   • occupancy overlap is judged in ARC length — two openings that chord maths
 *     judges wrongly are judged correctly;
 *   • straight walls are unchanged.
 */

import { describe, it, expect } from 'vitest';
import {
    computeCurvedWallBands,
    clusterArcOpenings,
    stationArcLengths,
    sliceStations,
    bandCapTangents,
    type ArcOpeningInput,
} from '../src/CurvedWallOpeningBuilder';
import { wallCentreline, wallCentrelineLength, arcFrameAt, type ArcHostWall } from '../src/WallArcParam';
import { wallOccupancyStore } from '../src/WallOccupancyStore';
import type { Station } from '../src/CurvedWallLayerBuilder';
import type { WallData } from '../src/WallTypes';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CURVED: ArcHostWall = {
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    curve: { control: { x: 3, y: 0, z: 4 }, segments: 24 },
};

/**
 * Build stations in the SAME (start-relative, outward-normal) convention
 * `computeStations` uses, but without importing THREE — these tests must stay
 * pure so they run in the Node environment.
 */
function stationsFor(wall: ArcHostWall): Station[] {
    const cl = wallCentreline(wall);
    const n = cl.pts.length;
    const p0 = cl.pts[0]!;
    const out: Station[] = [];
    for (let i = 0; i < n; i++) {
        const a = i < n - 1 ? cl.pts[i]! : cl.pts[i - 1]!;
        const b = i < n - 1 ? cl.pts[i + 1]! : cl.pts[i]!;
        const tx = b.x - a.x;
        const tz = b.z - a.z;
        const l = Math.hypot(tx, tz) || 1;
        out.push({
            cx: cl.pts[i]!.x - p0.x,
            cz: cl.pts[i]!.z - p0.z,
            nx: -tz / l,
            nz: tx / l,
        });
    }
    return out;
}

function asWall(w: ArcHostWall, openings: Array<Partial<ArcOpeningInput> & { id: string }>): WallData {
    return {
        id: 'wall_test',
        type: 'wall',
        baseLine: w.baseLine as WallData['baseLine'],
        curve: w.curve ?? undefined,
        thickness: 0.3,
        height: 3,
        levelId: 'L0',
        openings: openings.map(o => ({
            id: o.id,
            elementId: `el_${o.id}`,
            type: 'window',
            offset: o.offset ?? 0,
            width: o.width ?? 1,
            height: o.height ?? 1.2,
            sillHeight: o.sillHeight ?? 0.9,
        })),
    } as unknown as WallData;
}

// ── Band decomposition ────────────────────────────────────────────────────────

describe('§FEAT-HOSTED-ON-CURVED-WALL — band decomposition', () => {
    it('a wall with no openings is ONE full-height pier', () => {
        const bands = computeCurvedWallBands([], 8, 3);
        expect(bands).toHaveLength(1);
        expect(bands[0]).toMatchObject({ s0: 0, s1: 8, yLo: 0, yHi: 3, kind: 'pier', atStart: true, atEnd: true });
    });

    it('one window leaves pier · sill · header · pier — and exactly ONE void', () => {
        const bands = computeCurvedWallBands(
            [{ offset: 2, width: 1.2, height: 1.2, sillHeight: 0.9 }],
            8,
            3,
        );
        const kinds = bands.map(b => b.kind);
        expect(kinds).toEqual(['pier', 'sill', 'header', 'pier']);

        // The void is the gap left in the full-height coverage. Measured at the
        // window's mid-height (1.5 m), exactly one contiguous span is uncovered.
        const y = 1.5;
        const covering = bands
            .filter(b => b.yLo <= y && b.yHi >= y)
            .map(b => [b.s0, b.s1] as const)
            .sort((a, b) => a[0] - b[0]);
        const gaps: Array<[number, number]> = [];
        let cursor = 0;
        for (const [a, b] of covering) {
            if (a > cursor + 1e-9) gaps.push([cursor, a]);
            cursor = Math.max(cursor, b);
        }
        if (cursor < 8 - 1e-9) gaps.push([cursor, 8]);

        expect(gaps).toHaveLength(1);
        expect(gaps[0]![0]).toBeCloseTo(2, 9);
        expect(gaps[0]![1]).toBeCloseTo(3.2, 9);
        // ── the void's measured width equals the opening width ──
        expect(gaps[0]![1] - gaps[0]![0]).toBeCloseTo(1.2, 9);
    });

    it('a door (sillHeight 0) produces NO sill band and one full-depth void', () => {
        const bands = computeCurvedWallBands(
            [{ offset: 1, width: 0.9, height: 2.1, sillHeight: 0 }],
            6,
            3,
        );
        expect(bands.map(b => b.kind)).toEqual(['pier', 'header', 'pier']);
        const header = bands.find(b => b.kind === 'header')!;
        expect(header.yLo).toBeCloseTo(2.1, 9);
        expect(header.yHi).toBeCloseTo(3, 9);
    });

    it('two overlapping openings become ONE cluster with a shared header', () => {
        const clusters = clusterArcOpenings([
            { offset: 1.404, width: 1.2, height: 1.2, sillHeight: 0.9 },
            { offset: 1.888, width: 1.2, height: 1.2, sillHeight: 0.9 },
        ]);
        expect(clusters).toHaveLength(1);
        expect(clusters[0]!.minLeft).toBeCloseTo(1.404, 9);
        expect(clusters[0]!.maxRight).toBeCloseTo(3.088, 9);
    });

    it('two separated openings stay separate and leave TWO voids', () => {
        const bands = computeCurvedWallBands(
            [
                { offset: 1, width: 1, height: 1.2, sillHeight: 0.9 },
                { offset: 4, width: 1, height: 1.2, sillHeight: 0.9 },
            ],
            8,
            3,
        );
        expect(bands.filter(b => b.kind === 'header')).toHaveLength(2);
        expect(bands.filter(b => b.kind === 'pier')).toHaveLength(3);
    });

    it('only the terminal bands carry the miter caps', () => {
        const bands = computeCurvedWallBands(
            [{ offset: 2, width: 1.2, height: 1.2, sillHeight: 0.9 }],
            8,
            3,
        );
        expect(bands.filter(b => b.atStart)).toHaveLength(1);
        expect(bands.filter(b => b.atEnd)).toHaveLength(1);
        expect(bands.find(b => b.atStart)!.s0).toBe(0);
        expect(bands.find(b => b.atEnd)!.s1).toBe(8);
        // The sill and header bands are INTERIOR — they must not be miter-projected.
        expect(bands.find(b => b.kind === 'sill')!.atStart).toBe(false);
        expect(bands.find(b => b.kind === 'header')!.atEnd).toBe(false);
    });

    it('an opening flush with the wall start produces no leading pier', () => {
        const bands = computeCurvedWallBands(
            [{ offset: 0, width: 1, height: 2.1, sillHeight: 0 }],
            6,
            3,
        );
        expect(bands.map(b => b.kind)).toEqual(['header', 'pier']);
        expect(bands[0]!.s0).toBe(0);
    });
});

// ── ONE opening across MANY tessellated sub-segments ──────────────────────────

describe('§FEAT-HOSTED-ON-CURVED-WALL — an opening spanning many chords is ONE void', () => {
    it('sliceStations spans multiple tessellation chords without splitting the void', () => {
        const stations = stationsFor(CURVED);
        const cum = stationArcLengths(stations);
        const L = cum[cum.length - 1]!;
        const chord = L / (stations.length - 1);

        const openingWidth = 1.2;
        // Sanity: the opening genuinely straddles several chords, which is the case
        // the founder asked about.
        expect(openingWidth / chord).toBeGreaterThan(3);

        const s0 = 1.75;
        const s1 = s0 + openingWidth;

        // The wall is emitted as TWO bands around this opening, not one per chord.
        const bands = computeCurvedWallBands(
            [{ offset: s0, width: openingWidth, height: 3, sillHeight: 0 }],
            L,
            3,
        );
        expect(bands).toHaveLength(2);
        expect(bands.every(b => b.kind === 'pier')).toBe(true);
        expect(bands[0]!.s1).toBeCloseTo(s0, 9);
        expect(bands[1]!.s0).toBeCloseTo(s1, 9);

        // Each band's station list terminates EXACTLY at the opening edge, and it
        // carries the interior tessellation vertices it spans — one continuous
        // strip, not a per-chord fragment.
        const left = sliceStations(stations, cum, 0, s0);
        const right = sliceStations(stations, cum, s1, L);
        expect(left.length).toBeGreaterThan(2);
        expect(right.length).toBeGreaterThan(2);

        const leftLen = stationArcLengths(left).pop()!;
        const rightLen = stationArcLengths(right).pop()!;
        expect(leftLen).toBeCloseTo(s0, 6);
        expect(rightLen).toBeCloseTo(L - s1, 6);

        // ── THE VOID WIDTH ON THE HOSTING FACE ──
        // The gap between the two bands, measured along the centreline, is exactly
        // the opening width. This is the assertion that a per-chord cut fails.
        expect(L - leftLen - rightLen).toBeCloseTo(openingWidth, 6);
    });

    it('an opening NARROWER than one chord still yields exactly two bands', () => {
        const stations = stationsFor(CURVED);
        const cum = stationArcLengths(stations);
        const L = cum[cum.length - 1]!;
        const chord = L / (stations.length - 1);
        const width = chord * 0.4;

        const bands = computeCurvedWallBands([{ offset: 2, width, height: 3, sillHeight: 0 }], L, 3);
        expect(bands).toHaveLength(2);

        const left = sliceStations(stations, cum, 0, 2);
        const right = sliceStations(stations, cum, 2 + width, L);
        const gap = L - stationArcLengths(left).pop()! - stationArcLengths(right).pop()!;
        expect(gap).toBeCloseTo(width, 6);
    });

    it('sliceStations inserts exact edge stations even mid-chord', () => {
        const stations = stationsFor(CURVED);
        const cum = stationArcLengths(stations);
        // Deliberately land BETWEEN two tessellation vertices.
        const s0 = (cum[3]! + cum[4]!) / 2;
        const s1 = (cum[9]! + cum[10]!) / 2;
        const band = sliceStations(stations, cum, s0, s1);
        const bandCum = stationArcLengths(band);
        expect(bandCum[bandCum.length - 1]!).toBeCloseTo(s1 - s0, 6);
        // No duplicate/degenerate stations — a zero-length chord would produce a
        // NaN normal in the geometry generator.
        for (let i = 1; i < band.length; i++) {
            const d = Math.hypot(band[i]!.cx - band[i - 1]!.cx, band[i]!.cz - band[i - 1]!.cz);
            expect(d).toBeGreaterThan(0);
        }
    });
});

// ── No over/under-cut wedge: the jamb is RADIAL ───────────────────────────────

describe('§FEAT-HOSTED-ON-CURVED-WALL — the carve follows the curve (no wedge)', () => {
    it('the jamb normal matches the local ARC tangent, not the wall chord', () => {
        const stations = stationsFor(CURVED);
        const cum = stationArcLengths(stations);
        const L = cum[cum.length - 1]!;
        const s0 = 1.9;
        const s1 = 3.4;

        const leftBand = sliceStations(stations, cum, 0, s0);
        const caps = bandCapTangents(leftBand);

        // The jamb plane's normal is the band's terminal cap tangent. It must equal
        // the TRUE arc tangent at that arc length, within tessellation tolerance.
        const trueTan = arcFrameAt(CURVED, s0);
        const capAngle = Math.atan2(caps.end.z, caps.end.x);
        expect(Math.abs(capAngle - trueTan.angleY)).toBeLessThan(0.02); // < 1.2°

        // A STRAIGHT BOX SUBTRACTION would use the wall CHORD heading (0 rad here)
        // for both jambs. Assert the radial jamb is measurably different — i.e. the
        // wedge a box cut would leave is real, and we do not leave it.
        const chordHeading = 0;
        expect(Math.abs(trueTan.angleY - chordHeading)).toBeGreaterThan(0.3); // > 17°

        const rightBand = sliceStations(stations, cum, s1, L);
        const rightCaps = bandCapTangents(rightBand);
        const trueTan1 = arcFrameAt(CURVED, s1);
        const capAngle1 = Math.atan2(rightCaps.start.z, rightCaps.start.x);
        expect(Math.abs(capAngle1 - trueTan1.angleY)).toBeLessThan(0.02);

        // The two jambs of ONE opening are NOT parallel on a curved wall — which is
        // exactly what a box subtraction gets wrong.
        expect(Math.abs(trueTan.angleY - trueTan1.angleY)).toBeGreaterThan(0.1);
    });

    it('the interpolated jamb station lies ON the centreline arc', () => {
        const wall = CURVED;
        const stations = stationsFor(wall);
        const cum = stationArcLengths(stations);
        const p0 = wall.baseLine[0];

        for (const s of [0.35, 1.9, 3.4, 5.2]) {
            const band = sliceStations(stations, cum, s, s + 0.6);
            const first = band[0]!;
            const worldX = first.cx + p0.x;
            const worldZ = first.cz + p0.z;
            const truth = arcFrameAt(wall, s);
            // Deviation from the true arc: sub-millimetre at the built tessellation.
            const dev = Math.hypot(worldX - truth.x, worldZ - truth.z);
            expect(dev).toBeLessThan(1e-6);
        }
    });

    it('band arc lengths sum to the wall length minus the total opening width', () => {
        const stations = stationsFor(CURVED);
        const cum = stationArcLengths(stations);
        const L = cum[cum.length - 1]!;
        const openings: ArcOpeningInput[] = [
            { offset: 1.0, width: 0.9, height: 3, sillHeight: 0 },
            { offset: 3.5, width: 1.2, height: 3, sillHeight: 0 },
        ];
        const bands = computeCurvedWallBands(openings, L, 3).filter(b => b.kind === 'pier');
        const solid = bands.reduce((acc, b) => acc + (b.s1 - b.s0), 0);
        expect(solid).toBeCloseTo(L - 0.9 - 1.2, 9);
    });
});

// ── Occupancy in ARC length ───────────────────────────────────────────────────

describe('§FEAT-HOSTED-ON-CURVED-WALL — occupancy uses arc length', () => {
    it('a placement legal on the ARC but past the CHORD end is ACCEPTED', () => {
        const arcLen = wallCentrelineLength(CURVED);
        expect(arcLen).toBeGreaterThan(6.5);
        const wall = asWall(CURVED, []);
        // Offset 6.2 m is beyond the 6 m chord — chord maths rejected this outright,
        // which is why doors "fell off the end" of a curved wall.
        const r = wallOccupancyStore.canPlace(wall, 6.2, 0.4);
        expect(r.valid).toBe(true);
    });

    it('a placement past the ARC end is still REJECTED', () => {
        const arcLen = wallCentrelineLength(CURVED);
        const wall = asWall(CURVED, []);
        const r = wallOccupancyStore.canPlace(wall, arcLen - 0.1, 1.0);
        expect(r.valid).toBe(false);
        expect(r.reason).toMatch(/extends beyond wall length/);
    });

    it('two openings that DO overlap in arc length are rejected', () => {
        const wall = asWall(CURVED, [{ id: 'a', offset: 1.404, width: 1.2 }]);
        const r = wallOccupancyStore.canPlace(wall, 1.888, 1.2);
        expect(r.valid).toBe(false);
        expect(r.conflictIds).toEqual(['a']);
    });

    it('two openings that do NOT overlap in arc length are accepted', () => {
        const wall = asWall(CURVED, [{ id: 'a', offset: 1.0, width: 1.2 }]);
        const r = wallOccupancyStore.canPlace(wall, 2.3, 1.2);
        expect(r.valid).toBe(true);
    });

    it('clampToWall clamps against the ARC, so a valid arc placement is preserved', () => {
        const arcLen = wallCentrelineLength(CURVED);
        const wall = asWall(CURVED, []);
        const dims = { offset: 6.1, width: 0.5, height: 1.2, sillHeight: 0.9 };
        const out = wallOccupancyStore.clampToWall(wall, dims);
        expect(out.clamped).toBe(false);
        expect(out.offset).toBeCloseTo(6.1, 9);
        expect(out.offset + out.width).toBeLessThanOrEqual(arcLen + 1e-9);
    });

    it('REGRESSION — a straight wall clamps and overlaps exactly as before', () => {
        const straight: ArcHostWall = { baseLine: [{ x: 0, z: 0 }, { x: 6.083, z: 0 }] };
        const wall = asWall(straight, [{ id: 'a', offset: 1.404, width: 1.2 }]);
        // Production-log case: offset 3.607, width 1.200, wallLen 6.083 → OK.
        expect(wallOccupancyStore.canPlace(wall, 3.607, 1.2).valid).toBe(true);
        // Production-log conflict case: [1.888, 3.088] vs [1.404, 2.604] → CONFLICT.
        expect(wallOccupancyStore.canPlace(wall, 1.888, 1.2).valid).toBe(false);
        // Beyond the wall → rejected.
        expect(wallOccupancyStore.canPlace(wall, 5.5, 1.2).valid).toBe(false);
        // Clamp pushes an over-run opening back inside the 6.083 m wall.
        const c = wallOccupancyStore.clampToWall(wall, { offset: 6, width: 1.2, height: 1.2, sillHeight: 0.9 });
        expect(c.clamped).toBe(true);
        expect(c.offset).toBeCloseTo(6.083 - 1.2, 9);
    });
});
