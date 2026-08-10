// residentialCardModel — pure card view-model tests (P3.3).

import { describe, expect, it } from 'vitest';
import {
    buildResidentialCardModel,
    floorLabel,
} from '../src/ui/residential-building/residentialCardModel.js';
import type {
    ResidentialBuildingOk,
    PlacedApartment,
    ScoredLayoutOption,
} from '@pryzm/ai-host';

function layout(over: Partial<ScoredLayoutOption> = {}): ScoredLayoutOption {
    return {
        summary: 'cell',
        corridorWidthMin: 900,
        walls: [],
        doors: [],
        rooms: [
            { name: 'Bedroom 1', type: 'bedroom', area: 12, windowCount: 1, hasDirectAccess: true, adjacentTo: [] },
            { name: 'Bathroom', type: 'bathroom', area: 4, windowCount: 0, hasDirectAccess: true, adjacentTo: [] },
            { name: 'Kitchen', type: 'kitchen', area: 8, windowCount: 1, hasDirectAccess: true, adjacentTo: [] },
        ],
        windows: [{ wallRef: 0, offset: 100, width: 1000, height: 1200, sillHeight: 900 }],
        score: { overall: 77.4, breakdown: { naturalLight: 0.8, privacy: 0.7, kitchenWorkflow: 0.9, corridorEfficiency: 0.6 } },
        ...over,
    };
}

function placed(over: Partial<PlacedApartment> = {}): PlacedApartment {
    return {
        typology: 'T2',
        targetAreaM2: 55.23,
        program: { bedrooms: 2, bathrooms: 1, masterEnSuite: false, openPlanKitchenDining: true, livingRoom: true, entranceHall: false },
        cell: { rect: { x0: 0, z0: 0, x1: 8, z1: 7 }, doorEdge: 'z0' } as PlacedApartment['cell'],
        status: 'ok',
        layout: layout(),
        facadeEdges: ['x0', 'z1'],
        blindEdges: ['x1'],
        ...over,
    };
}

function okResult(over: Partial<ResidentialBuildingOk> = {}): ResidentialBuildingOk {
    return {
        status: 'ok',
        core: { x0: 7, z0: 6, x1: 13, z1: 10 },
        transform: { thetaRad: 0, pivot: { x: 0, z: 0 } },
        levels: [
            { levelIndex: 0, role: 'ground', elevationM: 0, floorToFloorM: 3, footprint: [], commercialGroundFloor: true },
            { levelIndex: 1, role: 'upper', elevationM: 3, floorToFloorM: 3, footprint: [] },
        ],
        perLevelApartments: [
            { levelIndex: 0, role: 'ground', apartments: [], publicCorridor: [] },
            {
                levelIndex: 1, role: 'upper',
                apartments: [
                    placed(),
                    placed({ typology: 'T3', status: 'rejected', rejectReason: 'over-programmed', layout: undefined as unknown as ScoredLayoutOption }),
                ],
                publicCorridor: [{ x0: 0, z0: 7, x1: 20, z1: 8.5 }],
            },
        ],
        groundFloor: {
            lobby: { x0: 9, x1: 11, z0: 0, z1: 6 },
            entranceEdge: 'z0',
            entranceCenter: { x: 10, z: 0 },
            entranceWidthM: 1.8,
        },
        // §RESI-STRETCH-TO-RUN honesty — the user's requested per-apartment band, echoed by the
        // orchestrator so the card can flag units it sized outside it.
        requestedBandM2: { min: 45, max: 120 },
        diagnostic: 'test',
        ...over,
    };
}

/** A placed apartment with a REAL cell area (the fixture's default cell carries none). */
function placedWithArea(areaM2: number, over: Partial<PlacedApartment> = {}): PlacedApartment {
    return placed({
        cell: { rect: { x0: 0, z0: 0, x1: 12, z1: areaM2 / 12 }, doorEdge: 'z0', areaM2 } as PlacedApartment['cell'],
        ...over,
    });
}

describe('floorLabel', () => {
    it('maps 0→Ground, 1→First, 2→Second', () => {
        expect(floorLabel(0)).toBe('Ground floor');
        expect(floorLabel(1)).toBe('First floor');
        expect(floorLabel(2)).toBe('Second floor');
    });
    it('falls back to "Floor N" past the ordinal table', () => {
        expect(floorLabel(15)).toBe('Floor 15');
    });
});

describe('buildResidentialCardModel', () => {
    it('produces one floor card per level (positional zip)', () => {
        const m = buildResidentialCardModel(okResult());
        expect(m.floorCount).toBe(2);
        expect(m.floors).toHaveLength(2);
        expect(m.floors[0]!.role).toBe('ground');
        expect(m.floors[0]!.commercialGroundFloor).toBe(true);
        expect(m.floors[1]!.role).toBe('upper');
    });

    it('counts placed vs rejected apartments + sums net area (placed only)', () => {
        const m = buildResidentialCardModel(okResult());
        expect(m.totalApartments).toBe(1);   // one OK
        expect(m.totalRejected).toBe(1);     // one rejected
        expect(m.totalNetAreaM2).toBe(55.2); // rounded targetAreaM2 of the placed apt
        expect(m.upperLevels).toBe(1);
    });

    it('marks the rejected apartment + carries its reason', () => {
        const m = buildResidentialCardModel(okResult());
        const upper = m.floors[1]!;
        expect(upper.placedCount).toBe(1);
        expect(upper.rejectedCount).toBe(1);
        const rej = upper.apartments.find(a => a.status === 'rejected')!;
        expect(rej.rejectReason).toBe('over-programmed');
        expect(rej.score).toBe(0);
        expect(rej.roomSummary).toContain('over-programmed');
    });

    it('summarises a placed apartment (rooms, windows, score, brief line)', () => {
        const m = buildResidentialCardModel(okResult());
        const ok = m.floors[1]!.apartments.find(a => a.status === 'ok')!;
        expect(ok.typology).toBe('T2');
        expect(ok.roomCount).toBe(3);
        expect(ok.windowCount).toBe(1);
        expect(ok.score).toBe(77);                 // clampPct(77.4)
        expect(ok.roomSummary).toContain('1 bed');
        expect(ok.roomSummary).toContain('1 bath');
        expect(ok.roomSummary).toContain('kitchen');
    });

    it('formats the core size as W×D m', () => {
        const m = buildResidentialCardModel(okResult());
        expect(m.coreSize).toBe('6×4 m');
    });

    // ── founder 2026-08-10 §CONTEXT-DATA-HONESTY: the two ways band and plate disagree ──────────

    it('§RESI-STRETCH-TO-RUN — flags units stretched ABOVE the user max, quoting the largest', () => {
        const m = buildResidentialCardModel(okResult({
            requestedBandM2: { min: 45, max: 120 },
            perLevelApartments: [
                { levelIndex: 0, role: 'ground', apartments: [], publicCorridor: [] },
                {
                    levelIndex: 1, role: 'upper', publicCorridor: [],
                    apartments: [placedWithArea(100), placedWithArea(146)],
                },
            ],
        }));
        expect(m.overBandNote).toBeDefined();
        expect(m.overBandNote).toContain('120');   // the user's own max
        expect(m.overBandNote).toContain('146');   // the largest stretched unit
        expect(m.overBandNote).toContain('dead strip');
    });

    it('§RESI-STRETCH-TO-RUN — stays SILENT when every unit is inside the band', () => {
        const m = buildResidentialCardModel(okResult({
            requestedBandM2: { min: 45, max: 120 },
            perLevelApartments: [
                { levelIndex: 0, role: 'ground', apartments: [], publicCorridor: [] },
                { levelIndex: 1, role: 'upper', publicCorridor: [], apartments: [placedWithArea(100)] },
            ],
        }));
        expect(m.overBandNote).toBeUndefined();
    });

    it('§RESI-BAND-UNDERFILL — explains band-emptied rows with the number that unblocks them', () => {
        const m = buildResidentialCardModel(okResult({
            perLevelApartments: [
                { levelIndex: 0, role: 'ground', apartments: [], publicCorridor: [] },
                {
                    levelIndex: 1, role: 'upper', publicCorridor: [], apartments: [placedWithArea(146)],
                    bandUnderfill: { largestRowUnitAreaM2: 95.4, requestedMinAreaM2: 110 },
                },
            ],
        }));
        expect(m.underfillNote).toBeDefined();
        expect(m.underfillNote).toContain('95.4');   // the honest row ceiling — the actionable number
        expect(m.underfillNote).toContain('110');    // the user's own minimum
        expect(m.underfillNote).toContain('lower the minimum');
    });

    it('§RESI-BAND-UNDERFILL — quotes the WORST level, so the number unblocks every floor', () => {
        const m = buildResidentialCardModel(okResult({
            perLevelApartments: [
                { levelIndex: 0, role: 'ground', apartments: [], publicCorridor: [] },
                {
                    levelIndex: 1, role: 'upper', publicCorridor: [], apartments: [],
                    bandUnderfill: { largestRowUnitAreaM2: 95.4, requestedMinAreaM2: 110 },
                },
                {
                    levelIndex: 2, role: 'upper', publicCorridor: [], apartments: [],
                    bandUnderfill: { largestRowUnitAreaM2: 71.2, requestedMinAreaM2: 110 },
                },
            ],
        }));
        expect(m.underfillNote).toContain('71.2');
        expect(m.underfillNote).not.toContain('95.4');
    });

    it('§RESI-BAND-UNDERFILL — stays SILENT when no row was emptied on band grounds', () => {
        expect(buildResidentialCardModel(okResult()).underfillNote).toBeUndefined();
    });
});
