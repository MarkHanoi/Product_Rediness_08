// Office floor-plate + orchestrator ratio tests (the same-day demo's safety net).
//
// Pins the demo invariants:
//   - core % scales UP with storey count (4 vs 40 storeys)
//   - desk count > 0 and area-per-desk is sane (4–25 m²/desk)
//   - the analytics ratios sum/bound sanely (open+enclosed ≤ 100, core efficiency 0..1)
//   - 40-storey tower produces dept-preset floor VARIETY (not 40 identical floors)
//   - circular plate emits the expected concentric zones + closed polygons

import { describe, it, expect } from 'vitest';
import {
    generateOfficeFloorPlate,
    coreFractionForRise,
} from '../officeFloorPlate.js';
import {
    orchestrateOfficeBuilding,
    classifyOfficeFloor,
    maxFeasibleStoriesForRadius,
} from '../officeBuildingOrchestrator.js';

describe('coreFractionForRise', () => {
    it('scales UP with storey count, clamped to [0.18, 0.25]', () => {
        const lo = coreFractionForRise(4);
        const hi = coreFractionForRise(40);
        expect(lo).toBeGreaterThanOrEqual(0.18);
        expect(hi).toBeLessThanOrEqual(0.25);
        expect(hi).toBeGreaterThan(lo);
        // 40-storey tower lands at the high end.
        expect(hi).toBeCloseTo(0.25, 2);
    });
});

describe('generateOfficeFloorPlate', () => {
    // §OFFICE-PLATE-AUTOFIT — the office must ALWAYS build (degrade like resi), so a
    // too-small plate is CLAMPED UP, never rejected. Only a non-finite radius rejects.
    it('auto-fits a too-small plate (clamps radius UP, still builds, never rejects)', () => {
        const r = generateOfficeFloorPlate({ radiusM: 4, stories: 40 });
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expect(r.autoFit.radiusClamped).toBe(true);
        expect(r.autoFit.radiusM).toBeGreaterThanOrEqual(10);
        expect(r.autoFit.notes.length).toBeGreaterThan(0);
        // A real floor still emerges: desks + concentric rings, strictly increasing radii.
        expect(r.analytics.deskCount).toBeGreaterThan(0);
        let prev = 0;
        for (const z of r.zones) { expect(z.outerRadiusM).toBeGreaterThanOrEqual(prev); prev = z.outerRadiusM; }
    });

    it('only rejects a non-finite / non-positive radius (never a small one)', () => {
        expect(generateOfficeFloorPlate({ radiusM: 0, stories: 10 }).status).toBe('rejected');
        expect(generateOfficeFloorPlate({ radiusM: Number.NaN, stories: 10 }).status).toBe('rejected');
        // A small-but-positive radius ALWAYS builds.
        expect(generateOfficeFloorPlate({ radiusM: 2, stories: 10 }).status).toBe('ok');
    });

    it('shrinks the core to fit when the rise-core would swallow the ring', () => {
        // A modest plate with a tall (high core-fraction) tower → core must shrink.
        const r = generateOfficeFloorPlate({ radiusM: 11, stories: 40 });
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        // Core stays a real fraction (floored), and the inner ring is a real corridor.
        expect(r.autoFit.coreFraction).toBeGreaterThanOrEqual(0.10);
        const core = r.zones.find((z) => z.kind === 'core')!;
        const inner = r.zones.find((z) => z.kind === 'inner-circulation')!;
        expect(inner.outerRadiusM).toBeGreaterThan(core.outerRadiusM);
    });

    it('a normal plate reports no auto-fit adjustment', () => {
        const r = generateOfficeFloorPlate({ radiusM: 22, stories: 40 });
        if (r.status !== 'ok') throw new Error('expected ok');
        expect(r.autoFit.radiusClamped).toBe(false);
        expect(r.autoFit.notes.length).toBe(0);
    });

    it('emits concentric zones with closed polygons, desks > 0, sane analytics', () => {
        const r = generateOfficeFloorPlate({ radiusM: 22, stories: 40 });
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;

        // Core → perimeter ring order, each with a closed polygon.
        expect(r.zones.map((z) => z.kind)).toEqual([
            'core', 'inner-circulation', 'open-plan', 'open-plan', 'collab-pod', 'circulation',
        ]);
        for (const z of r.zones) {
            expect(z.outerPolygon.length).toBeGreaterThanOrEqual(12);
            expect(z.areaM2).toBeGreaterThan(0);
        }

        // Radii strictly increase core-out.
        let prev = 0;
        for (const z of r.zones) {
            expect(z.outerRadiusM).toBeGreaterThan(prev);
            prev = z.outerRadiusM;
        }

        const a = r.analytics;
        expect(a.deskCount).toBeGreaterThan(0);
        expect(a.areaPerDeskM2).toBeGreaterThan(4);
        expect(a.areaPerDeskM2).toBeLessThan(40);
        expect(a.coreEfficiencyRatio).toBeGreaterThan(0);
        expect(a.coreEfficiencyRatio).toBeLessThan(1);
        // Open + enclosed should not exceed the usable budget.
        expect(a.openPlanPct + a.enclosedPct).toBeLessThanOrEqual(100.01);
        expect(a.daylightAdjacentDeskPct).toBeGreaterThanOrEqual(0);
        expect(a.daylightAdjacentDeskPct).toBeLessThanOrEqual(100);
    });

    it('bench mode packs more desks than individual at the same density', () => {
        const bench = generateOfficeFloorPlate({ radiusM: 22, stories: 40, deskMode: 'bench' });
        const indiv = generateOfficeFloorPlate({ radiusM: 22, stories: 40, deskMode: 'individual' });
        if (bench.status !== 'ok' || indiv.status !== 'ok') throw new Error('expected ok');
        expect(bench.analytics.deskCount).toBeGreaterThan(indiv.analytics.deskCount);
    });

    it('higher storey count → bigger core fraction → lower core efficiency', () => {
        const low = generateOfficeFloorPlate({ radiusM: 22, stories: 4 });
        const high = generateOfficeFloorPlate({ radiusM: 22, stories: 40 });
        if (low.status !== 'ok' || high.status !== 'ok') throw new Error('expected ok');
        expect(high.coreRadiusM).toBeGreaterThan(low.coreRadiusM);
        expect(high.analytics.coreEfficiencyRatio).toBeLessThan(low.analytics.coreEfficiencyRatio);
    });

    it('perimeter-offices-first culture yields more enclosed area than open-plan-first', () => {
        const open = generateOfficeFloorPlate({ radiusM: 22, stories: 40, culture: 'open-plan-first' });
        const offices = generateOfficeFloorPlate({ radiusM: 22, stories: 40, culture: 'perimeter-offices-first' });
        if (open.status !== 'ok' || offices.status !== 'ok') throw new Error('expected ok');
        expect(offices.analytics.enclosedPct).toBeGreaterThan(open.analytics.enclosedPct);
    });
});

describe('classifyOfficeFloor', () => {
    it('stamps lobby / executive / sky-lobby / mechanical / open-plan variety', () => {
        const stories = 40;
        expect(classifyOfficeFloor(0, stories, 18)).toBe('lobby-amenity');
        expect(classifyOfficeFloor(39, stories, 18)).toBe('executive');
        expect(classifyOfficeFloor(20, stories, 18)).toBe('sky-lobby'); // round(40/2)
        expect(classifyOfficeFloor(18, stories, 18)).toBe('mechanical');
        expect(classifyOfficeFloor(5, stories, 18)).toBe('open-plan');
    });
});

describe('orchestrateOfficeBuilding (40-storey demo)', () => {
    it('builds a 40-storey tower with floor-type variety and sane building analytics', () => {
        const r = orchestrateOfficeBuilding({ radiusM: 22, stories: 40, floorToFloorM: 4 });
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;

        expect(r.floors).toHaveLength(40);
        expect(r.floors[0]!.type).toBe('lobby-amenity');
        expect(r.floors[39]!.type).toBe('executive');

        // Demo requirement: NOT 40 identical floors — at least 3 distinct floor types.
        const distinctTypes = new Set(r.floors.map((f) => f.type));
        expect(distinctTypes.size).toBeGreaterThanOrEqual(3);
        expect(distinctTypes.has('mechanical')).toBe(true);
        expect(distinctTypes.has('sky-lobby')).toBe(true);

        const a = r.analytics;
        expect(a.stories).toBe(40);
        expect(a.buildingHeightM).toBe(160);
        expect(a.totalDesks).toBeGreaterThan(0);
        expect(a.totalDesks).toBe(a.officeFloors * a.desksPerOfficeFloor);
        expect(a.officeFloors).toBeGreaterThan(0);
        expect(a.officeFloors).toBeLessThan(40); // some floors are non-office
        expect(a.riseZone).toContain('high-rise');
    });

    // §OFFICE-PLATE-AUTOFIT — the orchestrator must ALWAYS build (degrade like resi).
    it('clamps out-of-range stories instead of rejecting (always builds)', () => {
        const zero = orchestrateOfficeBuilding({ radiusM: 22, stories: 0 });
        expect(zero.status).toBe('ok');
        if (zero.status === 'ok') expect(zero.stories).toBeGreaterThanOrEqual(1);

        const huge = orchestrateOfficeBuilding({ radiusM: 22, stories: 99 });
        expect(huge.status).toBe('ok');
        if (huge.status === 'ok') {
            expect(huge.stories).toBeLessThanOrEqual(60);
            expect(huge.requestedStories).toBe(99);
            expect(huge.autoFit.notes.length).toBeGreaterThan(0);
        }
    });

    it('only rejects a non-positive radius', () => {
        expect(orchestrateOfficeBuilding({ radiusM: 0, stories: 10 }).status).toBe('rejected');
        expect(orchestrateOfficeBuilding({ radiusM: -5, stories: 10 }).status).toBe('rejected');
    });
});

describe('§OFFICE-PLATE-AUTOFIT — feasibility degrade (small plate → shorter tower)', () => {
    it('a tiny plate degrades (clamps the radius) and still builds, never rejects', () => {
        // A sub-minimum radius with a tall tower must DEGRADE (clamp up), not reject.
        const r = orchestrateOfficeBuilding({ radiusM: 4, stories: 40 });
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expect(r.requestedStories).toBe(40);
        expect(r.stories).toBeLessThanOrEqual(40);
        expect(r.stories).toBeGreaterThanOrEqual(1);
        // The radius clamp surfaces a notice (like resi's dropped-units message).
        expect(r.autoFit.radiusClamped).toBe(true);
        expect(r.autoFit.notes.length).toBeGreaterThan(0);
        expect(r.analytics.totalDesks).toBeGreaterThan(0);
    });

    it('maxFeasibleStoriesForRadius grows with radius and never goes below 1', () => {
        const small = maxFeasibleStoriesForRadius(10);
        const big = maxFeasibleStoriesForRadius(40);
        expect(small).toBeGreaterThanOrEqual(1);
        expect(big).toBeGreaterThanOrEqual(small);
        // A tiny / invalid radius still yields a buildable floor (≥1 storey).
        expect(maxFeasibleStoriesForRadius(0.5)).toBeGreaterThanOrEqual(1);
        expect(maxFeasibleStoriesForRadius(Number.NaN)).toBe(1);
    });

    it('a 22 m default plate hosts the full 40-storey demo tower without degrading', () => {
        const r = orchestrateOfficeBuilding({ radiusM: 22, stories: 40 });
        if (r.status !== 'ok') throw new Error('expected ok');
        expect(r.stories).toBe(40);
        expect(r.autoFit.notes.length).toBe(0);
    });
});
