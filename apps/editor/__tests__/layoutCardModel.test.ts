// layoutCardModel — pure card view-model tests (SPEC §11, A5-modal-core).

import { describe, expect, it } from 'vitest';
import { buildLayoutCardModel } from '../src/ui/apartment-layout/layoutCardModel.js';
import type { ScoredLayoutOption } from '@pryzm/ai-host';

function opt(over: Partial<ScoredLayoutOption> = {}): ScoredLayoutOption {
    return {
        summary: 'Central corridor',
        corridorWidthMin: 1000,
        walls: [{ start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } }, { start: { x: 0, y: 0 }, end: { x: 0, y: 1000 } }],
        doors: [{ wallRef: 0, offset: 300, width: 900 }],
        rooms: [
            { name: 'Living', type: 'living', area: 22.34, windowCount: 2, hasDirectAccess: true, adjacentTo: [] },
            { name: 'Kitchen', type: 'kitchen', area: 10, windowCount: 1, hasDirectAccess: true, adjacentTo: [] },
        ],
        score: { overall: 82.6, breakdown: { naturalLight: 0.91, privacy: 0.5, kitchenWorkflow: 1, corridorEfficiency: 0.333 } },
        ...over,
    };
}

describe('buildLayoutCardModel (A5-modal-core)', () => {
    it('maps title, overall, bars, rooms, counts', () => {
        const m = buildLayoutCardModel(opt(), 0);
        expect(m.index).toBe(0);
        expect(m.title).toBe('Central corridor');
        expect(m.overall).toBe(83);                 // rounded
        expect(m.roomCount).toBe(2);
        expect(m.wallCount).toBe(2);
        expect(m.doorCount).toBe(1);
    });

    it('builds the 4 score bars as 0-100 percentages in fixed order', () => {
        const m = buildLayoutCardModel(opt(), 0);
        expect(m.bars.map(b => b.key)).toEqual(['naturalLight', 'privacy', 'kitchenWorkflow', 'corridorEfficiency']);
        expect(m.bars.map(b => b.pct)).toEqual([91, 50, 100, 33]);
        expect(m.bars.map(b => b.label)).toEqual(['Light', 'Privacy', 'Kitchen', 'Circulation']);
    });

    it('rounds room areas + sums total area to 0.1', () => {
        const m = buildLayoutCardModel(opt(), 0);
        expect(m.rooms[0]!.area).toBe(22.3);
        expect(m.totalAreaM2).toBe(32.3);           // 22.34 + 10 → 32.34 → 32.3
        expect(m.rooms[0]).toEqual({ name: 'Living', type: 'living', area: 22.3, windows: 2 });
    });

    it('falls back to "Option N" when summary is blank', () => {
        expect(buildLayoutCardModel(opt({ summary: '' }), 2).title).toBe('Option 3');
        expect(buildLayoutCardModel(opt({ summary: '   ' }), 0).title).toBe('Option 1');
    });

    it('clamps overall + bar pct into [0,100]', () => {
        const m = buildLayoutCardModel(opt({
            score: { overall: 250, breakdown: { naturalLight: 1.5, privacy: -0.2, kitchenWorkflow: 0, corridorEfficiency: 0.5 } },
        }), 0);
        expect(m.overall).toBe(100);
        expect(m.bars[0]!.pct).toBe(100);
        expect(m.bars[1]!.pct).toBe(0);
    });
});
