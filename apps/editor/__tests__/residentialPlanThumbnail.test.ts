// §RESI-PREVIEW-PRODUCTION (2026-06-24) — smoke tests for the production plan-render
// SVG builder + the §RESI-PREVIEW-DEDUPE-TYPES type grouping. Pure (no DOM): the builder
// returns an SVG string; the grouper collapses identical layouts. Mirrors the
// residentialCardModel test's mock shape.

import { describe, expect, it } from 'vitest';
import { buildResidentialPlanSvg, buildResidentialPlanDescriptor } from '../src/ui/residential-building/residentialPlanThumbnail.js';
import { groupApartmentTypes } from '../src/ui/residential-building/residentialModalHtml.js';
import { buildResidentialCardModel } from '../src/ui/residential-building/residentialCardModel.js';
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

/** A floor with `n` apartments at sequential x-offsets (so they don't overlap). */
function upperFloor(levelIndex: number, apts: PlacedApartment[]): ResidentialBuildingOk['perLevelApartments'][number] {
    return {
        levelIndex, role: 'upper',
        apartments: apts,
        publicCorridor: [{ x0: 0, z0: 7, x1: 40, z1: 8.5 }],
    };
}

function aptAt(x: number, over: Partial<PlacedApartment> = {}): PlacedApartment {
    return placed({
        cell: { rect: { x0: x, z0: 0, x1: x + 8, z1: 7 }, doorEdge: 'z0' } as PlacedApartment['cell'],
        ...over,
    });
}

function okResult(over: Partial<ResidentialBuildingOk> = {}): ResidentialBuildingOk {
    return {
        status: 'ok',
        core: { x0: 16, z0: 6, x1: 22, z1: 10 },
        transform: { thetaRad: 0, pivot: { x: 0, z: 0 } },
        levels: [
            { levelIndex: 0, role: 'ground', elevationM: 0, floorToFloorM: 3, footprint: [], commercialGroundFloor: true },
            { levelIndex: 1, role: 'upper', elevationM: 3, floorToFloorM: 3, footprint: [] },
            { levelIndex: 2, role: 'upper', elevationM: 6, floorToFloorM: 3, footprint: [] },
        ],
        perLevelApartments: [
            { levelIndex: 0, role: 'ground', apartments: [], publicCorridor: [] },
            upperFloor(1, [aptAt(0), aptAt(8), aptAt(24), aptAt(32)]),
            upperFloor(2, [aptAt(0), aptAt(8), aptAt(24), aptAt(32)]),
        ],
        groundFloor: {
            lobby: { x0: 17, x1: 21, z0: 0, z1: 6 },
            entranceEdge: 'z0',
            entranceCenter: { x: 19, z: 0 },
            entranceWidthM: 1.8,
        },
        diagnostic: 'test',
        ...over,
    };
}

describe('buildResidentialPlanSvg', () => {
    it('renders a non-empty SVG string with a viewBox for a placed floor', () => {
        const out = buildResidentialPlanSvg(okResult(), { targetPx: 300 });
        expect(out.svg).toContain('<svg');
        expect(out.svg).toContain('viewBox');
        expect(out.svg).toContain('</svg>');
        expect(out.placed).toBe(4);
        expect(out.rejected).toBe(0);
        expect(out.levelLabel).toBe('Floor 1');
        // No numeric leakage into coordinates / dimensions.
        expect(out.svg).not.toContain('NaN');
        expect(out.svg).not.toContain('undefined');
        expect(out.svg).not.toContain('Infinity');
    });

    it('draws the core symbol, a north arrow, a scale bar and a typology legend', () => {
        const svg = buildResidentialPlanSvg(okResult(), { targetPx: 320 }).svg;
        expect(svg).toContain('CORE');          // core label
        expect(svg).toContain('>N<');           // north arrow label
        expect(svg).toMatch(/\d+ m</);          // scale bar metres label
        expect(svg).toContain('2-bed');         // legend typology label (T2)
    });

    it('uses NO pure-black ink (brand white + purple, deep-indigo ink)', () => {
        const svg = buildResidentialPlanSvg(okResult(), { targetPx: 300 }).svg;
        expect(svg).not.toMatch(/#000\b/);
        expect(svg).not.toContain('#000000');
        expect(svg).not.toContain('"black"');
    });

    it('returns empty svg when there is no drawable geometry', () => {
        const degenerate = okResult({
            core: { x0: 0, z0: 0, x1: 0, z1: 0 },
            perLevelApartments: [
                { levelIndex: 0, role: 'ground', apartments: [], publicCorridor: [] },
                { levelIndex: 1, role: 'upper', apartments: [], publicCorridor: [] },
            ],
        });
        const out = buildResidentialPlanSvg(degenerate);
        expect(out.svg).toBe('');
    });

    // §BUILDING-PREVIEW-MODULAR L-SHAPE FIX — the preview must render the REAL drawn
    // footprint polygon (the L), not a bounding-box rectangle.
    it('L-SHAPE — threads the real footprint polygon (de-rotated to LOCAL) into the descriptor', () => {
        // An L-shaped WORLD footprint (top-right 8×6 corner removed), angle 0 so LOCAL == WORLD.
        const lFootprint = [
            { x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 8 },
            { x: 12, z: 8 }, { x: 12, z: 14 }, { x: 0, z: 14 },
        ];
        const r = okResult({
            levels: [
                { levelIndex: 0, role: 'ground', elevationM: 0, floorToFloorM: 3, footprint: lFootprint, commercialGroundFloor: true },
                { levelIndex: 1, role: 'upper', elevationM: 3, floorToFloorM: 3, footprint: lFootprint },
                { levelIndex: 2, role: 'upper', elevationM: 6, floorToFloorM: 3, footprint: lFootprint },
            ],
        });
        const d = buildResidentialPlanDescriptor(r)!;
        expect(d).not.toBeNull();
        // The descriptor's footprint is the 6-vertex L, NOT a 4-vertex rectangle.
        expect(d.footprint.length).toBe(6);
        // It contains the concave notch corner (12,8) — proving it's the L, not the bbox.
        expect(d.footprint.some(p => Math.abs(p.x - 12) < 1e-6 && Math.abs(p.z - 8) < 1e-6)).toBe(true);
        // The rendered SVG draws the shell as a 6-vertex polygon (not a bbox rect).
        const svg = buildResidentialPlanSvg(r).svg;
        const shellPoly = svg.match(/<polygon points="([^"]+)" fill="none" stroke="#2a1a52"/);
        expect(shellPoly).toBeTruthy();
        expect(shellPoly![1]!.trim().split(/\s+/).length).toBe(6);
    });

    it('L-SHAPE — de-rotates a ROTATED world footprint into the LOCAL cell frame', () => {
        // A unit-rotated footprint about the origin; the descriptor must un-rotate it back so it
        // aligns with the LOCAL (axis-aligned) cells. Use a 90°-ish rotation for a clean check:
        // θ = π/2 about pivot (0,0): world (x,z) → local via −θ. We assert the footprint resolves
        // to an axis-aligned-ish L (6 distinct verts) and is finite.
        const lWorld = [
            { x: 0, z: 0 }, { x: 0, z: 20 }, { x: -8, z: 20 },
            { x: -8, z: 12 }, { x: -14, z: 12 }, { x: -14, z: 0 },
        ];
        const r = okResult({
            transform: { thetaRad: Math.PI / 2, pivot: { x: 0, z: 0 } },
            levels: [
                { levelIndex: 0, role: 'ground', elevationM: 0, floorToFloorM: 3, footprint: lWorld, commercialGroundFloor: true },
                { levelIndex: 1, role: 'upper', elevationM: 3, floorToFloorM: 3, footprint: lWorld },
                { levelIndex: 2, role: 'upper', elevationM: 6, floorToFloorM: 3, footprint: lWorld },
            ],
        });
        const d = buildResidentialPlanDescriptor(r)!;
        expect(d.footprint.length).toBe(6);
        for (const p of d.footprint) {
            expect(Number.isFinite(p.x)).toBe(true);
            expect(Number.isFinite(p.z)).toBe(true);
        }
    });

    it('falls back to a bbox rectangle when the level carries no footprint polygon', () => {
        // okResult()'s levels have footprint: [] → the descriptor falls back to the cell bbox (4 verts).
        const d = buildResidentialPlanDescriptor(okResult())!;
        expect(d.footprint.length).toBe(4);
    });

    // §BUILDING-PREVIEW-QUALITY — the apartment's INTERNAL rooms are threaded into the descriptor
    // cells as sub-rooms (so each unit renders like a real plan, not a flat box).
    it('§BUILDING-PREVIEW-QUALITY — threads apartment rooms (with polygons) into cell.subRooms + a room legend', () => {
        const roomLayout = layout({
            rooms: [
                { name: 'Living', type: 'living', area: 20, windowCount: 1, hasDirectAccess: true, adjacentTo: [],
                  polygon: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 7000 }, { x: 0, y: 7000 }] },
                { name: 'Kitchen', type: 'kitchen', area: 10, windowCount: 1, hasDirectAccess: true, adjacentTo: [],
                  polygon: [{ x: 4000, y: 0 }, { x: 8000, y: 0 }, { x: 8000, y: 3500 }, { x: 4000, y: 3500 }] },
                { name: 'Bedroom 1', type: 'bedroom', area: 12, windowCount: 1, hasDirectAccess: true, adjacentTo: [],
                  polygon: [{ x: 4000, y: 3500 }, { x: 8000, y: 3500 }, { x: 8000, y: 7000 }, { x: 4000, y: 7000 }] },
            ],
        });
        const r = okResult({
            perLevelApartments: [
                { levelIndex: 0, role: 'ground', apartments: [], publicCorridor: [] },
                upperFloor(1, [aptAt(0, { layout: roomLayout })]),
                { levelIndex: 2, role: 'upper', apartments: [], publicCorridor: [] },
            ],
        });
        const d = buildResidentialPlanDescriptor(r)!;
        const cell = d.cells[0]!;
        expect(cell.subRooms).toBeTruthy();
        expect(cell.subRooms!.length).toBe(3);
        // Polygons were converted mm→m (plan-y → world-z) into the LOCAL cell frame.
        expect(cell.subRooms![0]!.polygon[0]).toEqual({ x: 0, z: 0 });
        expect(cell.subRooms![0]!.polygon[2]).toEqual({ x: 4, z: 7 });
        // Room types normalised; a room palette is supplied for the renderer.
        expect(cell.subRooms!.map(rm => rm.roomType)).toEqual(['living-room', 'kitchen', 'bedroom']);
        expect(d.roomPalette).toBeTruthy();
        // The legend now reads room types (house parity), not typology swatches.
        const labels = d.legend.map(l => l.label);
        expect(labels).toContain('Living');
        expect(labels).toContain('Kitchen');
        expect(labels).toContain('Bedroom');
        // The rendered SVG draws the room fills with a thin partition stroke (house-grade detail).
        const svg = buildResidentialPlanSvg(r).svg;
        expect(svg).toMatch(/<polygon points="[^"]+" fill="#[0-9a-f]{6}" stroke="#9b8cc4" stroke-width="0\.8"/);
    });

    it('marks rejected cells (counts them) without a big red ×', () => {
        const r = okResult({
            perLevelApartments: [
                { levelIndex: 0, role: 'ground', apartments: [], publicCorridor: [] },
                upperFloor(1, [aptAt(0), aptAt(8, { status: 'rejected', rejectReason: 'over-programmed', layout: undefined as unknown as ScoredLayoutOption })]),
                { levelIndex: 2, role: 'upper', apartments: [], publicCorridor: [] },
            ],
        });
        const out = buildResidentialPlanSvg(r);
        expect(out.placed).toBe(1);
        expect(out.rejected).toBe(1);
        // No giant red cross glyph as a cell label.
        expect(out.svg).not.toMatch(/>×</);
    });
});

describe('groupApartmentTypes (§RESI-PREVIEW-DEDUPE-TYPES)', () => {
    it('collapses identical layouts across floors into ONE group with a count', () => {
        // 4 identical T2s on each of 2 floors = 8 instances, all the same layout.
        const card = buildResidentialCardModel(okResult());
        const groups = groupApartmentTypes(card);
        expect(groups).toHaveLength(1);
        const g = groups[0]!;
        expect(g.typology).toBe('T2');
        expect(g.status).toBe('ok');
        expect(g.count).toBe(8);
        expect(g.floorLabels).toHaveLength(2);   // two upper floors
    });

    it('keeps genuinely-different layouts as separate groups', () => {
        const differentT3 = aptAt(24, {
            typology: 'T3',
            targetAreaM2: 78,
            layout: layout({
                rooms: [
                    { name: 'Bedroom 1', type: 'bedroom', area: 14, windowCount: 1, hasDirectAccess: true, adjacentTo: [] },
                    { name: 'Bedroom 2', type: 'bedroom', area: 11, windowCount: 1, hasDirectAccess: true, adjacentTo: [] },
                    { name: 'Bedroom 3', type: 'bedroom', area: 10, windowCount: 1, hasDirectAccess: true, adjacentTo: [] },
                    { name: 'Kitchen', type: 'kitchen', area: 9, windowCount: 1, hasDirectAccess: true, adjacentTo: [] },
                ],
            }),
        });
        const r = okResult({
            perLevelApartments: [
                { levelIndex: 0, role: 'ground', apartments: [], publicCorridor: [] },
                upperFloor(1, [aptAt(0), aptAt(8), differentT3]),
                { levelIndex: 2, role: 'upper', apartments: [], publicCorridor: [] },
            ],
        });
        const groups = groupApartmentTypes(buildResidentialCardModel(r));
        expect(groups).toHaveLength(2);                       // T2 (×2) + T3 (×1)
        const t3 = groups.find(g => g.typology === 'T3')!;
        expect(t3.count).toBe(1);
        const t2 = groups.find(g => g.typology === 'T2')!;
        expect(t2.count).toBe(2);
    });

    it('collapses rejected apartments into one calm group', () => {
        const rej = (x: number): PlacedApartment => aptAt(x, {
            typology: 'T4', status: 'rejected', rejectReason: 'over-programmed',
            layout: undefined as unknown as ScoredLayoutOption,
        });
        const r = okResult({
            perLevelApartments: [
                { levelIndex: 0, role: 'ground', apartments: [], publicCorridor: [] },
                upperFloor(1, [aptAt(0), rej(8), rej(24)]),
                { levelIndex: 2, role: 'upper', apartments: [], publicCorridor: [] },
            ],
        });
        const groups = groupApartmentTypes(buildResidentialCardModel(r));
        const rejGroup = groups.find(g => g.status === 'rejected')!;
        expect(rejGroup).toBeTruthy();
        expect(rejGroup.count).toBe(2);
    });
});
