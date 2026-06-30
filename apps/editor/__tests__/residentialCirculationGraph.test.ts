// §RESI-CIRC-GRAPH — smoke tests for the residential setup-modal circulation bubble graph
// (the house-modal "Living-Graph" parity). Pure: the wrapper synthesises a LayoutOption-shaped
// graph (core hub + one node per apartment) and CONSUMES the shared bubble renderer; it returns
// an SVG string. Mirrors the residentialPlanThumbnail test's mock shape.

import { describe, expect, it } from 'vitest';
import { buildResidentialCirculationGraphSvg } from '../src/ui/residential-building/residentialCirculationGraph.js';
import type { ResidentialBuildingOk, PlacedApartment } from '@pryzm/ai-host';

function placed(typology: PlacedApartment['typology'], x: number): PlacedApartment {
    return {
        typology,
        targetAreaM2: 55,
        program: { bedrooms: 2, bathrooms: 1, masterEnSuite: false, openPlanKitchenDining: true, livingRoom: true, entranceHall: false },
        cell: { rect: { x0: x, z0: 0, x1: x + 8, z1: 7 }, doorEdge: 'z0' } as PlacedApartment['cell'],
        status: 'ok',
        layout: undefined,
        facadeEdges: ['z1'],
        blindEdges: ['x1'],
    };
}

function okResult(apts: PlacedApartment[]): ResidentialBuildingOk {
    return {
        status: 'ok',
        core: { x0: 16, z0: 6, x1: 22, z1: 10 },
        transform: { thetaRad: 0, pivot: { x: 0, z: 0 } },
        levels: [
            { levelIndex: 0, role: 'ground', elevationM: 0, floorToFloorM: 3, footprint: [], commercialGroundFloor: true },
            { levelIndex: 1, role: 'upper', elevationM: 3, floorToFloorM: 3, footprint: [] },
        ],
        perLevelApartments: [
            { levelIndex: 0, role: 'ground', apartments: [], publicCorridor: [] },
            { levelIndex: 1, role: 'upper', apartments: apts, publicCorridor: [{ x0: 0, z0: 7, x1: 40, z1: 8.5 }] },
        ],
        groundFloor: { lobby: { x0: 16, z0: 0, x1: 22, z1: 6 }, entranceEdge: 'z0', entranceCenter: { x: 19, z: 0 }, entranceWidthM: 1.8 },
        diagnostic: 'test',
    } as ResidentialBuildingOk;
}

describe('buildResidentialCirculationGraphSvg — §RESI-CIRC-GRAPH', () => {
    it('renders an SVG with one node per apartment plus the core hub', () => {
        const res = okResult([placed('T2', 0), placed('T1', 8), placed('T3', 24)]);
        const { svg, nodeCount } = buildResidentialCirculationGraphSvg(res, { levelIndex: 1 });
        expect(svg).toContain('<svg');
        expect(nodeCount).toBe(3);
        // 4 circles = core hub + 3 apartments.
        const circles = (svg.match(/<circle/g) ?? []).length;
        expect(circles).toBe(4);
        // Edges connect each apartment to the core (lines drawn before nodes).
        const lines = (svg.match(/<line/g) ?? []).length;
        expect(lines).toBe(3);
    });

    it('returns empty for a floor with no apartments (no graph panel rendered)', () => {
        const res = okResult([]);
        const { svg, nodeCount } = buildResidentialCirculationGraphSvg(res, { levelIndex: 1 });
        expect(svg).toBe('');
        expect(nodeCount).toBe(0);
    });

    it('falls back to the representative upper floor when levelIndex is omitted', () => {
        const res = okResult([placed('T2', 0), placed('T2', 8)]);
        const { nodeCount } = buildResidentialCirculationGraphSvg(res);
        expect(nodeCount).toBe(2);
    });

    it('is deterministic (same input → same SVG)', () => {
        const res = okResult([placed('T2', 0), placed('T1', 8)]);
        const a = buildResidentialCirculationGraphSvg(res, { levelIndex: 1 });
        const b = buildResidentialCirculationGraphSvg(res, { levelIndex: 1 });
        expect(b.svg).toBe(a.svg);
    });
});
