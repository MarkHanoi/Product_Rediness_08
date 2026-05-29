// layoutThumbnail — pure SVG plan thumbnail tests (SPEC §11, A5-modal-core).

import { describe, expect, it } from 'vitest';
import { buildLayoutThumbnailSvg } from '../src/ui/apartment-layout/layoutThumbnail.js';
import type { LayoutOption } from '@pryzm/ai-host';

function opt(over: Partial<LayoutOption> = {}): LayoutOption {
    return {
        summary: 's', rooms: [], corridorWidthMin: 1000,
        walls: [
            { start: { x: 0, y: 0 }, end: { x: 5000, y: 0 } },
            { start: { x: 5000, y: 0 }, end: { x: 5000, y: 4000 } },
        ],
        doors: [{ wallRef: 0, offset: 2000, width: 900 }],
        ...over,
    };
}

describe('buildLayoutThumbnailSvg (A5-modal-core)', () => {
    it('emits a sized svg with a viewBox', () => {
        const svg = buildLayoutThumbnailSvg(opt(), { width: 200, height: 150 });
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg.endsWith('</svg>')).toBe(true);
        expect(svg).toContain('viewBox="0 0 200 150"');
        expect(svg).toContain('width="200"');
    });

    it('draws one <line> per wall and door symbols (opening line + arc + hinge) per door', () => {
        const svg = buildLayoutThumbnailSvg(opt());
        // Walls: one <line> per wall + one <line> per door (opening gap).
        // (2 walls + 1 door's opening line = 3 lines.)
        expect((svg.match(/<line /g) ?? []).length).toBe(3);
        // Each door = ONE swing-arc path + ONE hinge circle.
        expect((svg.match(/<path /g) ?? []).length).toBe(1);
        expect((svg.match(/<circle /g) ?? []).length).toBe(1);
    });

    it('keeps drawn coordinates inside the padded box', () => {
        const svg = buildLayoutThumbnailSvg(opt(), { width: 160, height: 120, padding: 8 });
        const nums = [...svg.matchAll(/(?:x1|y1|x2|y2|cx|cy)="([\d.]+)"/g)].map(m => Number(m[1]));
        expect(nums.length).toBeGreaterThan(0);
        for (const n of nums) {
            expect(n).toBeGreaterThanOrEqual(8 - 0.01);
            expect(n).toBeLessThanOrEqual(160 - 8 + 0.01);
        }
    });

    it('flips Y so plan-north reads up (smaller svg-y for larger plan-y)', () => {
        // A single vertical wall from y=0 to y=4000: its end (higher plan-y)
        // must map to a SMALLER svg y than its start.
        const svg = buildLayoutThumbnailSvg({
            summary: '', rooms: [], doors: [], corridorWidthMin: 0,
            walls: [{ start: { x: 0, y: 0 }, end: { x: 0, y: 4000 } }],
        });
        const m = svg.match(/<line x1="[\d.]+" y1="([\d.]+)" x2="[\d.]+" y2="([\d.]+)"/)!;
        const y1 = Number(m[1]); const y2 = Number(m[2]);
        expect(y2).toBeLessThan(y1);
    });

    it('drops a door whose wallRef is out of range (no throw)', () => {
        const svg = buildLayoutThumbnailSvg(opt({ doors: [{ wallRef: 9, offset: 100, width: 900 }] }));
        // No door symbols rendered: only the 2 wall lines, no arc, no hinge.
        expect((svg.match(/<path /g) ?? []).length).toBe(0);
        expect((svg.match(/<circle /g) ?? []).length).toBe(0);
        expect((svg.match(/<line /g) ?? []).length).toBe(2);
    });

    it('an option with no walls yields a valid empty svg', () => {
        const svg = buildLayoutThumbnailSvg(opt({ walls: [], doors: [] }), { width: 100, height: 80 });
        expect(svg).toContain('viewBox="0 0 100 80"');
        expect(svg).toContain('</svg>');
        expect((svg.match(/<line /g) ?? []).length).toBe(0);
    });

    it('renders a background rect only when a background colour is given', () => {
        expect(buildLayoutThumbnailSvg(opt(), { background: '#fff' })).toContain('<rect ');
        expect(buildLayoutThumbnailSvg(opt())).not.toContain('<rect ');
    });

    // §SUB-ZONE upgrade (2026-05-29): rooms with polygons render as filled
    // <polygon> elements with occupancy-based fills + labels.
    it('renders a <polygon> per room with a polygon + occupancy-based fill', () => {
        const svg = buildLayoutThumbnailSvg({
            summary: '', corridorWidthMin: 0, doors: [], walls: [],
            rooms: [
                {
                    name: 'Living Room', type: 'living', area: 18, windowCount: 1,
                    hasDirectAccess: true, adjacentTo: [],
                    polygon: [
                        { x: 0, y: 0 }, { x: 5000, y: 0 },
                        { x: 5000, y: 4000 }, { x: 0, y: 4000 },
                    ],
                    occupancy: 'living-room',
                },
            ],
        }, { width: 200, height: 150 });
        expect((svg.match(/<polygon /g) ?? []).length).toBe(1);
        // living-room fill in the palette is blue-200 (#bfdbfe).
        expect(svg).toContain('fill="#bfdbfe"');
    });

    it('renders a label (name + area) when the room is large enough', () => {
        const svg = buildLayoutThumbnailSvg({
            summary: '', corridorWidthMin: 0, doors: [], walls: [],
            rooms: [
                {
                    name: 'Kitchen', type: 'kitchen', area: 12, windowCount: 1,
                    hasDirectAccess: true, adjacentTo: [],
                    polygon: [
                        { x: 0, y: 0 }, { x: 6000, y: 0 },
                        { x: 6000, y: 4000 }, { x: 0, y: 4000 },
                    ],
                    occupancy: 'kitchen',
                },
            ],
        }, { width: 320, height: 240 });
        expect(svg).toContain('>Kitchen<');
        expect(svg).toContain('>12 m²<');
    });

    it('skips room labels when showLabels:false', () => {
        const svg = buildLayoutThumbnailSvg({
            summary: '', corridorWidthMin: 0, doors: [], walls: [],
            rooms: [
                {
                    name: 'Bedroom', type: 'bedroom', area: 10, windowCount: 1,
                    hasDirectAccess: true, adjacentTo: [],
                    polygon: [
                        { x: 0, y: 0 }, { x: 4000, y: 0 },
                        { x: 4000, y: 3000 }, { x: 0, y: 3000 },
                    ],
                    occupancy: 'bedroom',
                },
            ],
        }, { width: 320, height: 240, showLabels: false });
        expect(svg).not.toContain('>Bedroom<');
        expect((svg.match(/<text /g) ?? []).length).toBe(0);
    });

    it('uses room polygons (not wall bbox) for layout when both are present', () => {
        // Polygons at x ∈ [0, 10000] but walls at x ∈ [-500, 500]: the SVG
        // should fit polygons (the EXACT shell) and clip the wall stubs.
        const svg = buildLayoutThumbnailSvg({
            summary: '', corridorWidthMin: 0, doors: [],
            walls: [{ start: { x: -500, y: 0 }, end: { x: 500, y: 0 } }],
            rooms: [
                {
                    name: 'A', type: 'living', area: 0, windowCount: 0,
                    hasDirectAccess: true, adjacentTo: [],
                    polygon: [
                        { x: 0, y: 0 }, { x: 10000, y: 0 },
                        { x: 10000, y: 6000 }, { x: 0, y: 6000 },
                    ],
                    occupancy: 'living-room',
                },
            ],
        }, { width: 200, height: 150, padding: 0 });
        // Wall start (mm x=-500) maps to negative svg-x when bbox is rooms[0]
        // x ∈ [0, 10000]. Check the FIRST wall x1 attribute is negative.
        const m = svg.match(/<line x1="(-?[\d.]+)"/);
        expect(m).toBeTruthy();
        expect(Number(m![1])).toBeLessThan(0);
    });
});
