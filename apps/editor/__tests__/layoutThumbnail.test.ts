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

    it('draws one <line> per wall and one <circle> per door', () => {
        const svg = buildLayoutThumbnailSvg(opt());
        expect((svg.match(/<line /g) ?? []).length).toBe(2);
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
});
