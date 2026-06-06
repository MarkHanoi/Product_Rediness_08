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
    dominantSpeedBand,
    heatTintColorHex,
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
