// ResidentialBuildingController pure helpers (P3.3) — input building + counts.

import { describe, expect, it } from 'vitest';
import {
    buildOrchestratorInput,
    countPlacedApartments,
    type ResidentialBuildingRequest,
} from '../src/ui/residential-building/ResidentialBuildingController.js';
import { isResidentialBuildingEnabled } from '../src/ui/residential-building/residentialBuildingTrigger.js';
import type { ResidentialBuildingOk } from '@pryzm/ai-host';

const RECT = [
    { x: 0, z: 0 },
    { x: 20, z: 0 },
    { x: 20, z: 14 },
    { x: 0, z: 14 },
];

function req(over: Partial<ResidentialBuildingRequest> = {}): ResidentialBuildingRequest {
    return {
        upperLevels: 4,
        typologies: { T2: true, T3: true },
        ...over,
    };
}

describe('buildOrchestratorInput', () => {
    it('fills sensible defaults for omitted dimensions', () => {
        const inp = buildOrchestratorInput(req(), RECT, 0);
        expect(inp.upperLevels).toBe(4);
        expect(inp.coreWidthM).toBeGreaterThan(0);
        expect(inp.coreDepthM).toBeGreaterThan(0);
        expect(inp.corridorWidthM).toBeGreaterThanOrEqual(0.8);
        expect(inp.minApartmentAreaM2).toBe(45);
        expect(inp.maxApartmentAreaM2).toBe(120);
        expect(inp.floorToFloorM).toBe(3.0);
        expect(inp.footprint).toBe(RECT);
        expect(inp.typologies).toEqual({ T1: false, T2: true, T3: true, T4: false });
    });

    it('clamps upperLevels into 1..20', () => {
        expect(buildOrchestratorInput(req({ upperLevels: 0 }), RECT, 0).upperLevels).toBe(1);
        expect(buildOrchestratorInput(req({ upperLevels: 99 }), RECT, 0).upperLevels).toBe(20);
    });

    it('keeps max ≥ min (raises max when an invalid band is given)', () => {
        const inp = buildOrchestratorInput(req({ minApartmentAreaM2: 80, maxApartmentAreaM2: 50 }), RECT, 0);
        expect(inp.minApartmentAreaM2).toBe(80);
        expect(inp.maxApartmentAreaM2).toBeGreaterThanOrEqual(80);
    });

    it('honours an explicit core/corridor + threads solar', () => {
        const inp = buildOrchestratorInput(
            req({ coreWidthM: 5, coreDepthM: 3, corridorWidthM: 1.2, siteLatitudeDeg: 51.5 }),
            RECT, 2.5,
        );
        expect(inp.coreWidthM).toBe(5);
        expect(inp.coreDepthM).toBe(3);
        expect(inp.corridorWidthM).toBe(1.2);
        expect(inp.baseElevationM).toBe(2.5);
        expect(inp.solar).toEqual({ latDeg: 51.5 });
    });
});

describe('countPlacedApartments', () => {
    it('counts only status==="ok" across all floors', () => {
        const result = {
            status: 'ok',
            core: { x0: 0, z0: 0, x1: 1, z1: 1 },
            levels: [],
            perLevelApartments: [
                { levelIndex: 0, role: 'ground', apartments: [], publicCorridor: [] },
                { levelIndex: 1, role: 'upper', apartments: [
                    { status: 'ok' }, { status: 'rejected' }, { status: 'ok' },
                ], publicCorridor: [] },
                { levelIndex: 2, role: 'upper', apartments: [{ status: 'ok' }], publicCorridor: [] },
            ],
            diagnostic: '',
        } as unknown as ResidentialBuildingOk;
        expect(countPlacedApartments(result)).toBe(3);
    });
});

describe('isResidentialBuildingEnabled (feature gate)', () => {
    it('is OFF by default and ON only when the flag is exactly true', () => {
        const g = globalThis as unknown as { __PRYZM_RESIDENTIAL_BUILDING__?: boolean };
        const prev = g.__PRYZM_RESIDENTIAL_BUILDING__;
        try {
            g.__PRYZM_RESIDENTIAL_BUILDING__ = undefined;
            expect(isResidentialBuildingEnabled()).toBe(false);
            g.__PRYZM_RESIDENTIAL_BUILDING__ = true;
            expect(isResidentialBuildingEnabled()).toBe(true);
            g.__PRYZM_RESIDENTIAL_BUILDING__ = false;
            expect(isResidentialBuildingEnabled()).toBe(false);
        } finally {
            g.__PRYZM_RESIDENTIAL_BUILDING__ = prev;
        }
    });
});
