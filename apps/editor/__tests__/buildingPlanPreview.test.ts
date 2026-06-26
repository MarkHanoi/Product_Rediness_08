// §BUILDING-PREVIEW-MODULAR — the shared, building-type-AGNOSTIC plan-preview kit.
// These tests pin the renderer's contract directly on a descriptor (no resi/house
// coupling): the REAL footprint polygon is honoured (incl. an L-shape, NOT a bbox rect),
// cells/legend/core render, a NON-residential typology descriptor renders, and the façade
// palette is a single source with the original 7 preserved.

import { describe, it, expect } from 'vitest';
import { buildBuildingPlanSvg } from '../src/ui/preview-kit/buildingPlanSvg.js';
import {
    FACADE_PALETTE, DEFAULT_FACADE_HEX, isHexColor,
    type BuildingPlanDescriptor,
} from '../src/ui/preview-kit/buildingPlanDescriptor.js';

/** An L-shaped footprint: a 20×14 rectangle with the top-right 8×6 corner removed. */
const L_FOOTPRINT = [
    { x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 8 },
    { x: 12, z: 8 }, { x: 12, z: 14 }, { x: 0, z: 14 },
];

function descriptor(over: Partial<BuildingPlanDescriptor> = {}): BuildingPlanDescriptor {
    return {
        footprint: L_FOOTPRINT,
        cells: [
            { rect: { x0: 0, z0: 0, x1: 9, z1: 6 }, fillKey: 'T2', label: 'T2', subLabel: '54 m²', doorEdge: 'z1' },
            { rect: { x0: 11, z0: 0, x1: 20, z1: 6 }, fillKey: 'T3', label: 'T3', subLabel: '78 m²', doorEdge: 'z1' },
            { rect: { x0: 0, z0: 9, x1: 9, z1: 14 }, fillKey: 'T2', label: 'T2', subLabel: '54 m²', doorEdge: 'z0' },
        ],
        corridors: [{ rect: { x0: 0, z0: 6, x1: 20, z1: 9 } }],
        core: { rect: { x0: 9, z0: 6, x1: 11, z1: 9 }, label: 'CORE' },
        palette: { fills: { T2: '#dcd0ff', T3: '#c3adff' }, defaultFill: '#dcd0ff' },
        legend: [
            { fill: '#dcd0ff', stroke: '#9b8cc4', label: 'T2 · 2-bed' },
            { fill: '#6600ff', stroke: '#4a00bf', label: 'Core' },
        ],
        levelLabel: 'Floor 1',
        ...over,
    };
}

describe('buildBuildingPlanSvg — §BUILDING-PREVIEW-MODULAR shared kit', () => {
    it('renders a valid SVG with the cell/core/legend content', () => {
        const out = buildBuildingPlanSvg(descriptor(), { targetPx: 300 });
        expect(out.svg).toContain('<svg');
        expect(out.svg).toContain('viewBox');
        expect(out.svg).toContain('</svg>');
        expect(out.placed).toBe(3);
        expect(out.muted).toBe(0);
        expect(out.svg).toContain('CORE');
        expect(out.svg).toContain('T2 · 2-bed');     // legend
        expect(out.svg).toContain('>N<');            // north arrow
        expect(out.svg).toMatch(/\d+ m</);           // scale bar
        expect(out.svg).not.toContain('NaN');
        expect(out.svg).not.toContain('undefined');
        expect(out.svg).not.toContain('Infinity');
    });

    it('L-SHAPE FIX — draws the REAL footprint POLYGON as the shell boundary, not a bbox rect', () => {
        const out = buildBuildingPlanSvg(descriptor(), { targetPx: 200 });
        // The shell is a <polygon> (6 verts), NOT a full-plate <rect> covering the bbox.
        const polyMatches = out.svg.match(/<polygon[^>]*stroke="#2a1a52"[^>]*stroke-width="2\.4"/g);
        expect(polyMatches, 'a heavy shell polygon is drawn').toBeTruthy();
        // The shell polygon must have 6 vertex pairs (the L), not 4 (a rectangle).
        const shellPoly = out.svg.match(/<polygon points="([^"]+)" fill="none" stroke="#2a1a52"/);
        expect(shellPoly).toBeTruthy();
        const verts = shellPoly![1]!.trim().split(/\s+/);
        expect(verts.length).toBe(6);
    });

    it('honours a cell POLYGON over its rect when provided (non-rectilinear unit)', () => {
        const d = descriptor({
            cells: [{
                rect: { x0: 0, z0: 0, x1: 6, z1: 6 },
                polygon: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 3, z: 6 }, { x: 0, z: 6 }],
                fillKey: 'T2', label: 'T2',
            }],
        });
        const out = buildBuildingPlanSvg(d, { targetPx: 200 });
        // A 5-vertex cell polygon appears (the cell is drawn as a polygon, not a rect).
        expect(out.svg).toMatch(/<polygon points="[^"]+" fill="#dcd0ff"/);
    });

    it('renders a muted (no-fit) cell as a hatch, counted in `muted`', () => {
        const d = descriptor({
            cells: [{ rect: { x0: 0, z0: 0, x1: 9, z1: 6 }, fillKey: 'T4', muted: true, label: 'T4', mutedNote: 'no fit' }],
        });
        const out = buildBuildingPlanSvg(d);
        expect(out.placed).toBe(0);
        expect(out.muted).toBe(1);
        expect(out.svg).toContain('url(#bpReject)');
    });

    it('a NON-RESIDENTIAL typology descriptor renders (no core, room-style cells) — extension point works', () => {
        // A "small office" style: a footprint, a few rooms (cells), NO core, a corridor.
        const office: BuildingPlanDescriptor = {
            footprint: [{ x: 0, z: 0 }, { x: 16, z: 0 }, { x: 16, z: 10 }, { x: 0, z: 10 }],
            cells: [
                { rect: { x0: 0, z0: 0, x1: 7, z1: 4 }, fillKey: 'office', label: 'Office' },
                { rect: { x0: 9, z0: 0, x1: 16, z1: 4 }, fillKey: 'meeting', label: 'Meeting' },
                { rect: { x0: 0, z0: 6, x1: 16, z1: 10 }, fillKey: 'openplan', label: 'Open plan' },
            ],
            corridors: [{ rect: { x0: 0, z0: 4, x1: 16, z1: 6 } }],
            core: null,
            palette: { fills: { office: '#dcd0ff', meeting: '#c3adff', openplan: '#efeaff' }, defaultFill: '#efeaff' },
            legend: [{ fill: '#dcd0ff', stroke: '#9b8cc4', label: 'Office' }],
            levelLabel: 'Ground floor',
        };
        const out = buildBuildingPlanSvg(office, { targetPx: 260 });
        expect(out.svg).toContain('<svg');
        expect(out.placed).toBe(3);
        expect(out.svg).not.toContain('CORE');       // no core for this typology
        expect(out.svg).toContain('Office');
    });

    it('returns empty svg for a degenerate descriptor (no geometry)', () => {
        const out = buildBuildingPlanSvg(descriptor({ footprint: [], cells: [], corridors: [], core: null }));
        expect(out.svg).toBe('');
    });

    it('uses NO pure-black ink (brand white + purple)', () => {
        const svg = buildBuildingPlanSvg(descriptor()).svg;
        expect(svg).not.toMatch(/#000\b/);
        expect(svg).not.toContain('#000000');
        expect(svg).not.toContain('"black"');
    });
});

describe('FACADE_PALETTE — §BUILDING-PREVIEW-MODULAR single source', () => {
    it('preserves the original 7 swatches at the head (existing picks resolve)', () => {
        const head = FACADE_PALETTE.slice(0, 7).map(s => s.hex);
        expect(head).toEqual(['#f4f1ec', '#f3dca0', '#e9b7b0', '#c97b6e', '#a9c2d4', '#aec7a8', '#cfcdc8']);
        expect(DEFAULT_FACADE_HEX).toBe('#f4f1ec');
    });

    it('is an expanded (~21) palette of valid, unique pastel hexes', () => {
        expect(FACADE_PALETTE.length).toBeGreaterThanOrEqual(21);
        for (const s of FACADE_PALETTE) {
            expect(isHexColor(s.hex), `${s.name} ${s.hex} is a valid hex`).toBe(true);
            expect(s.name.length).toBeGreaterThan(0);
        }
        const hexes = FACADE_PALETTE.map(s => s.hex.toLowerCase());
        expect(new Set(hexes).size, 'all hexes unique').toBe(hexes.length);
    });

    it('isHexColor validates #rrggbb only', () => {
        expect(isHexColor('#6600ff')).toBe(true);
        expect(isHexColor('#fff')).toBe(false);
        expect(isHexColor('6600ff')).toBe(false);
        expect(isHexColor(123)).toBe(false);
    });
});
