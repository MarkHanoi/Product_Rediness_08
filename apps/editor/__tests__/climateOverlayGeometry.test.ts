// A.21.D24 — pure 3D climate-overlay geometry tests (node env, no DOM/Cesium).
//
// Validates the generators that back the Forma 3D site-analysis overlays:
//   - sun-path dome arcs are above-horizon, on the dome radius, North-up
//   - hour markers land on whole UTC hours
//   - wind streaks point FROM the prevailing sector and scale with frequency
//   - heat tint maps mean temperature warm↔cool monotonically

import { describe, it, expect } from 'vitest';
import type { ClimateDataset, WindRoseAggregate, NOAANormal } from '@pryzm/schemas';
import {
    sunDirToDomeEnu,
    sunArcEnuPoints,
    sunArcHourMarkers,
    windStreakSegments,
    windStreamlinePaths,
    dominantSpeedBand,
    heatTintColorHex,
    heatFieldCells,
    comfortToHex,
    tempToHex,
} from '../src/ui/climate/climateOverlayGeometry';
import { windRoseBars } from '../src/ui/climate/climateChartData';

// ── Sun-path dome ──────────────────────────────────────────────────────────────

describe('sun dome projection', () => {
    it('returns null for points at/below the horizon', () => {
        expect(sunDirToDomeEnu(0, 0, 100)).toBeNull();
        expect(sunDirToDomeEnu(-0.2, 1, 100)).toBeNull();
    });

    it('maps the zenith to straight up at the dome radius', () => {
        const p = sunDirToDomeEnu(Math.PI / 2, 0, 100)!;
        expect(p.up).toBeCloseTo(100, 3);
        expect(Math.hypot(p.east, p.north)).toBeCloseTo(0, 3);
    });

    it('azimuth 0 (North) at low altitude points +north', () => {
        const p = sunDirToDomeEnu(0.1, 0, 100)!;
        expect(p.north).toBeGreaterThan(0);
        expect(Math.abs(p.east)).toBeLessThan(1e-6);
    });

    it('azimuth 90 (East) at low altitude points +east', () => {
        const p = sunDirToDomeEnu(0.1, Math.PI / 2, 100)!;
        expect(p.east).toBeGreaterThan(0);
        expect(Math.abs(p.north)).toBeLessThan(1e-6);
    });
});

describe('sun-path arcs (ENU)', () => {
    it('produces three above-horizon arcs framed on the dome radius', () => {
        const radius = 120;
        const arcs = sunArcEnuPoints(51.5, -0.13, 2026, radius, 30);
        expect(arcs.length).toBe(3);
        // Summer solstice in London should have a non-trivial above-horizon arc.
        const summer = arcs[0];
        expect(summer.points.length).toBeGreaterThan(5);
        // Every arc point sits on the dome (distance ≈ radius) and is above ground.
        for (const pt of summer.points) {
            expect(Math.hypot(pt.east, pt.north, pt.up)).toBeCloseTo(radius, 2);
            expect(pt.up).toBeGreaterThan(0);
        }
    });

    it('emits whole-hour markers on the summer arc', () => {
        const markers = sunArcHourMarkers(51.5, -0.13, 2026, 100);
        expect(markers.length).toBeGreaterThan(2);
        for (const m of markers) {
            expect(Number.isInteger(m.hourUtc)).toBe(true);
            expect(m.point.up).toBeGreaterThan(0);
        }
    });
});

// ── Wind streaks ───────────────────────────────────────────────────────────────

function roseWithPrevailing(sectorDeg: number): WindRoseAggregate {
    const sectors = Array.from({ length: 16 }, (_, i) => {
        const deg = i * 22.5;
        const prevailing = Math.abs(deg - sectorDeg) < 1e-6;
        return {
            sectorDeg: deg,
            // The prevailing sector gets most hours; one strong bin to set band.
            speedBinHours: prevailing ? [10, 20, 200, 40, 10, 2] : [5, 4, 3, 1, 0, 0],
        };
    });
    return { sectors, meanSpeedMps: 4.2, p99SpeedMps: 14.1 } as WindRoseAggregate;
}

describe('wind streaks', () => {
    it('returns empty for an all-zero rose', () => {
        const zero: WindRoseAggregate = {
            sectors: Array.from({ length: 16 }, (_, i) => ({ sectorDeg: i * 22.5, speedBinHours: [0, 0, 0, 0, 0, 0] })),
            meanSpeedMps: 0,
            p99SpeedMps: 0,
        } as WindRoseAggregate;
        expect(windStreakSegments(windRoseBars(zero), 100)).toEqual([]);
    });

    it('the longest streak is the prevailing sector and points FROM it', () => {
        const rose = windRoseBars(roseWithPrevailing(90)); // prevailing = East
        const streaks = windStreakSegments(rose, 100, 1);
        expect(streaks.length).toBeGreaterThan(0);
        // The prevailing streak has frac == 1 (longest).
        const east = streaks.find((s) => Math.abs(s.sectorDeg - 90) < 1e-6)!;
        expect(east.frac).toBeCloseTo(1, 5);
        // It STARTS on the rim toward the East (where the wind comes from).
        expect(east.from.east).toBeGreaterThan(0);
        expect(Math.abs(east.from.north)).toBeLessThan(1e-6);
        // And the inner end is closer to the centre than the rim.
        expect(Math.hypot(east.to.east, east.to.north)).toBeLessThan(Math.hypot(east.from.east, east.from.north));
    });

    it('dominantSpeedBand picks the bin with the most hours', () => {
        expect(dominantSpeedBand([1, 2, 9, 3, 0, 0])).toBe(2);
        expect(dominantSpeedBand([0, 0, 0, 0, 0, 0])).toBe(0);
    });
});

// ── Heat tint ──────────────────────────────────────────────────────────────────

describe('heat tint', () => {
    it('maps cold → blue-ish and hot → red-ish', () => {
        const cold = tempToHex(-2);
        const hot = tempToHex(30);
        // Cold has more blue than red; hot has more red than blue.
        const blue = (hex: string) => parseInt(hex.slice(5, 7), 16);
        const red = (hex: string) => parseInt(hex.slice(1, 3), 16);
        expect(blue(cold)).toBeGreaterThan(red(cold));
        expect(red(hot)).toBeGreaterThan(blue(hot));
    });

    it('derives a tint from a dataset mean temperature', () => {
        const normals: NOAANormal[] = Array.from({ length: 12 }, (_, i) => ({
            month: i + 1,
            avgDryBulbC: 20,
            avgMinDryBulbC: 15,
            avgMaxDryBulbC: 25,
        })) as NOAANormal[];
        const ds = { monthlyNormals: normals } as ClimateDataset;
        const hex = heatTintColorHex(ds);
        expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    });
});

// ── Wind streamlines (A.21.D35) ─────────────────────────────────────────────────

describe('wind streamlines', () => {
    it('returns empty for an all-zero rose', () => {
        const zero: WindRoseAggregate = {
            sectors: Array.from({ length: 16 }, (_, i) => ({ sectorDeg: i * 22.5, speedBinHours: [0, 0, 0, 0, 0, 0] })),
            meanSpeedMps: 0,
            p99SpeedMps: 0,
        } as WindRoseAggregate;
        expect(windStreamlinePaths(windRoseBars(zero), 120)).toEqual([]);
    });

    it('returns empty for a zero/negative radius', () => {
        const rose = windRoseBars(roseWithPrevailing(90));
        expect(windStreamlinePaths(rose, 0)).toEqual([]);
        expect(windStreamlinePaths(rose, -10)).toEqual([]);
    });

    it('produces MANY smooth multi-point flow lines', () => {
        const rose = windRoseBars(roseWithPrevailing(270)); // prevailing = West
        const lines = windStreamlinePaths(rose, 150, { maxLines: 24, obstacleRadius: 20 });
        expect(lines.length).toBeGreaterThan(6);
        for (const l of lines) {
            // Each streamline is a real polyline (smooth = several points).
            expect(l.points.length).toBeGreaterThanOrEqual(2);
            expect(typeof l.strength).toBe('number');
            for (const p of l.points) {
                expect(Number.isFinite(p.east)).toBe(true);
                expect(Number.isFinite(p.north)).toBe(true);
                expect(p.up).toBeGreaterThan(0);
            }
        }
        // The longest lines (full-disc crossings) are smooth → many points.
        const longest = lines.reduce((m, l) => Math.max(m, l.points.length), 0);
        expect(longest).toBeGreaterThan(8);
    });

    it('the prevailing sector gets the densest flow (most lines)', () => {
        const rose = windRoseBars(roseWithPrevailing(0)); // prevailing = North
        const lines = windStreamlinePaths(rose, 150, { maxLines: 24 });
        const bySector = new Map<number, number>();
        for (const l of lines) bySector.set(l.sourceSectorDeg, (bySector.get(l.sourceSectorDeg) ?? 0) + 1);
        // North (0°) is the prevailing source → it has the largest line count.
        const northCount = bySector.get(0) ?? 0;
        const others = [...bySector.entries()].filter(([deg]) => deg !== 0).map(([, n]) => n);
        expect(northCount).toBeGreaterThan(0);
        for (const n of others) expect(northCount).toBeGreaterThanOrEqual(n);
    });

    it('seeds on the UPWIND side (toward the source the wind comes from)', () => {
        const rose = windRoseBars(roseWithPrevailing(90)); // wind FROM the East
        const lines = windStreamlinePaths(rose, 120, { maxLines: 16, obstacleRadius: 0 });
        const east = lines.filter((l) => Math.abs(l.sourceSectorDeg - 90) < 1e-6);
        expect(east.length).toBeGreaterThan(0);
        // The first (seed) point of an East line starts on the +east (upwind) rim
        // and the line then flows westward (east coordinate decreases overall).
        for (const l of east) {
            const first = l.points[0];
            const last = l.points[l.points.length - 1];
            expect(first.east).toBeGreaterThan(0);
            expect(last.east).toBeLessThan(first.east);
        }
    });

    it('is deterministic (same input → identical output)', () => {
        const rose = windRoseBars(roseWithPrevailing(180));
        const a = windStreamlinePaths(rose, 130, { maxLines: 20, obstacleRadius: 18 });
        const b = windStreamlinePaths(rose, 130, { maxLines: 20, obstacleRadius: 18 });
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });

    it('bends flow around the building proxy (no line crosses the obstacle core)', () => {
        const rose = windRoseBars(roseWithPrevailing(90));
        const obstacleR = 30;
        const lines = windStreamlinePaths(rose, 150, { maxLines: 24, obstacleRadius: obstacleR });
        // No polyline vertex sits deep inside the building footprint.
        for (const l of lines) {
            for (const p of l.points) {
                expect(Math.hypot(p.east, p.north)).toBeGreaterThan(obstacleR * 0.85);
            }
        }
    });
});

// ── Heat / comfort field (A.21.D35) ─────────────────────────────────────────────

function datasetWithUniformTemp(avgC: number): ClimateDataset {
    const normals: NOAANormal[] = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        avgDryBulbC: avgC,
        avgMinDryBulbC: avgC - 5,
        avgMaxDryBulbC: avgC + 5,
    })) as NOAANormal[];
    return { monthlyNormals: normals } as ClimateDataset;
}

describe('comfort ramp', () => {
    it('maps low → green and high → red', () => {
        const green = comfortToHex(0);
        const red = comfortToHex(1);
        const r = (hex: string) => parseInt(hex.slice(1, 3), 16);
        const g = (hex: string) => parseInt(hex.slice(3, 5), 16);
        // Comfortable (green): green channel dominates red.
        expect(g(green)).toBeGreaterThan(r(green));
        // Hot (red): red channel dominates green.
        expect(r(red)).toBeGreaterThan(g(red));
    });

    it('clamps out-of-range scores', () => {
        expect(comfortToHex(-1)).toBe(comfortToHex(0));
        expect(comfortToHex(2)).toBe(comfortToHex(1));
    });
});

describe('heat field cells', () => {
    it('returns empty when there are no normals', () => {
        const ds = { monthlyNormals: [] } as unknown as ClimateDataset;
        expect(heatFieldCells(ds, 120)).toEqual([]);
    });

    it('returns empty for a zero radius', () => {
        expect(heatFieldCells(datasetWithUniformTemp(20), 0)).toEqual([]);
    });

    it('produces a grid of valid coloured cells within the disc', () => {
        const radius = 120;
        const cells = heatFieldCells(datasetWithUniformTemp(20), radius, { gridCount: 12, obstacleRadius: 20 });
        expect(cells.length).toBeGreaterThan(20);
        for (const c of cells) {
            expect(c.colorHex).toMatch(/^#[0-9a-f]{6}$/);
            expect(c.score).toBeGreaterThanOrEqual(0);
            expect(c.score).toBeLessThanOrEqual(1);
            // Inside the disc, outside the building footprint.
            const dist = Math.hypot(c.center.east, c.center.north);
            expect(dist).toBeLessThanOrEqual(radius * 1.001);
            expect(dist).toBeGreaterThanOrEqual(20);
            expect(c.halfSize).toBeGreaterThan(0);
        }
    });

    it('hot climate biases warmer than cool climate (higher mean score)', () => {
        const radius = 120;
        const hot = heatFieldCells(datasetWithUniformTemp(34), radius, { gridCount: 10, obstacleRadius: 20 });
        const cool = heatFieldCells(datasetWithUniformTemp(8), radius, { gridCount: 10, obstacleRadius: 20 });
        const mean = (cs: ReturnType<typeof heatFieldCells>) => cs.reduce((s, c) => s + c.score, 0) / (cs.length || 1);
        expect(mean(hot)).toBeGreaterThan(mean(cool));
    });

    it('the sun-facing side is hotter than the sheltered side', () => {
        const radius = 120;
        // Sun comes FROM the East (bearing 90) → +east cells are the hot side.
        const cells = heatFieldCells(datasetWithUniformTemp(22), radius, {
            gridCount: 14,
            obstacleRadius: 30,
            sunBearingDeg: 90,
        });
        const near = cells.filter((c) => Math.hypot(c.center.east, c.center.north) < 70);
        const sunSide = near.filter((c) => c.center.east > 20);
        const shadeSide = near.filter((c) => c.center.east < -20);
        const mean = (cs: typeof cells) => cs.reduce((s, c) => s + c.score, 0) / (cs.length || 1);
        expect(sunSide.length).toBeGreaterThan(0);
        expect(shadeSide.length).toBeGreaterThan(0);
        expect(mean(sunSide)).toBeGreaterThan(mean(shadeSide));
    });

    it('is deterministic', () => {
        const a = heatFieldCells(datasetWithUniformTemp(18), 100, { gridCount: 12, obstacleRadius: 16 });
        const b = heatFieldCells(datasetWithUniformTemp(18), 100, { gridCount: 12, obstacleRadius: 16 });
        expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    });
});
