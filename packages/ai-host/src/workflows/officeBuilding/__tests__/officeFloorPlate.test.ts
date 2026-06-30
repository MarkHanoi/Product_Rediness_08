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
    it('rejects a too-small plate (soft-fail, never throws)', () => {
        const r = generateOfficeFloorPlate({ radiusM: 4, stories: 40 });
        expect(r.status).toBe('rejected');
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
        expect(r.floors[0].type).toBe('lobby-amenity');
        expect(r.floors[39].type).toBe('executive');

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

    it('rejects out-of-range stories (soft-fail)', () => {
        expect(orchestrateOfficeBuilding({ radiusM: 22, stories: 0 }).status).toBe('rejected');
        expect(orchestrateOfficeBuilding({ radiusM: 22, stories: 99 }).status).toBe('rejected');
    });
});
