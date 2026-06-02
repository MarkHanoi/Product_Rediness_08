// L1-α-4 — formatLayoutSummary tests.

import { describe, expect, it } from 'vitest';
import { formatLayoutSummary } from '../src/workflows/apartmentLayout/formatLayoutSummary.js';
import type { LayoutOption, LayoutRoom, RoomType } from '../src/workflows/apartmentLayout/types.js';

function room(type: RoomType, area: number, name?: string): LayoutRoom {
    return {
        name: name ?? type,
        type,
        area,
        windowCount: 0,
        hasDirectAccess: true,
        adjacentTo: [],
    };
}

function layoutOf(rooms: LayoutRoom[]): LayoutOption {
    return {
        summary: '',
        rooms,
        walls: [],
        doors: [],
        corridorWidthMin: 1000,
    };
}

describe('formatLayoutSummary — bedroom-count tag', () => {
    it('studio (no bedrooms) → "studio apartment"', () => {
        const out = formatLayoutSummary(
            layoutOf([
                room('living', 18),
                room('kitchen', 6),
                room('bathroom', 4),
            ]),
        );
        expect(out).toContain('studio apartment');
    });

    it('1 master only → "1-bed apartment"', () => {
        const out = formatLayoutSummary(
            layoutOf([room('master', 14), room('living', 18), room('bathroom', 5)]),
        );
        expect(out).toContain('1-bed apartment');
    });

    it('1 master + 1 bedroom → "2-bed apartment"', () => {
        const out = formatLayoutSummary(
            layoutOf([
                room('master', 14),
                room('bedroom', 12),
                room('living', 22),
                room('bathroom', 5),
            ]),
        );
        expect(out).toContain('2-bed apartment');
    });

    it('1 master + 2 bedrooms → "3-bed apartment"', () => {
        const out = formatLayoutSummary(
            layoutOf([
                room('master', 14),
                room('bedroom', 12),
                room('bedroom', 11),
                room('living', 22),
            ]),
        );
        expect(out).toContain('3-bed apartment');
    });
});

describe('formatLayoutSummary — total area + per-room', () => {
    it('rounds total area to nearest m²', () => {
        const out = formatLayoutSummary(
            layoutOf([
                room('master', 14.6),
                room('bedroom', 12.4),
                room('living', 21.5),
                room('bathroom', 4.5),
            ]),
        );
        // 14.6 + 12.4 + 21.5 + 4.5 = 53m²
        expect(out).toContain('53m²');
    });

    it('orders rooms by canonical type order (programme-first then service)', () => {
        const out = formatLayoutSummary(
            layoutOf([
                room('bathroom', 5),
                room('corridor', 4),
                room('bedroom', 12),
                room('master', 14),
                room('kitchen', 8),
                room('living', 22),
            ]),
        );
        // Verify "master" appears before "bedroom", "bedroom" before
        // "living", etc.
        const masterIdx = out.indexOf('master');
        const bedroomIdx = out.indexOf('bedroom');
        const livingIdx = out.indexOf('living');
        const kitchenIdx = out.indexOf('kitchen');
        const bathIdx = out.indexOf('bath');
        const corridorIdx = out.indexOf('corridor');
        expect(masterIdx).toBeGreaterThan(0);
        expect(masterIdx).toBeLessThan(bedroomIdx);
        expect(bedroomIdx).toBeLessThan(livingIdx);
        expect(livingIdx).toBeLessThan(kitchenIdx);
        expect(kitchenIdx).toBeLessThan(bathIdx);
        expect(bathIdx).toBeLessThan(corridorIdx);
    });

    it('aggregates multiple rooms of the same type with ×N tag', () => {
        const out = formatLayoutSummary(
            layoutOf([
                room('master', 14),
                room('bedroom', 12),
                room('bedroom', 11),
                room('bedroom', 10),
            ]),
        );
        expect(out).toContain('bedroom ×3 33m²');
    });

    it('single rooms omit the ×N tag', () => {
        const out = formatLayoutSummary(
            layoutOf([room('master', 14), room('living', 22)]),
        );
        expect(out).toContain('master 14m²');
        expect(out).toContain('living 22m²');
        expect(out).not.toContain('×1');
    });

    it('bath / ensuite / wc render with shortened labels', () => {
        const out = formatLayoutSummary(
            layoutOf([
                room('master', 14),
                room('bathroom', 5),
                room('ensuite', 4),
                room('wc', 2),
            ]),
        );
        expect(out).toContain('bath 5m²');
        expect(out).toContain('ensuite 4m²');
        expect(out).toContain('wc 2m²');
    });
});

describe('formatLayoutSummary — edge cases', () => {
    it('empty layout returns the empty marker', () => {
        const out = formatLayoutSummary(layoutOf([]));
        expect(out).toBe('empty apartment · 0m²');
    });

    it('omits room types absent from the layout', () => {
        const out = formatLayoutSummary(
            layoutOf([room('living', 20), room('kitchen', 8)]),
        );
        expect(out).not.toContain('bath');
        expect(out).not.toContain('master');
    });

    it('uses · as the separator', () => {
        const out = formatLayoutSummary(
            layoutOf([room('master', 14), room('living', 22)]),
        );
        expect(out.split(' · ').length).toBeGreaterThan(2);
    });
});

describe('formatLayoutSummary — full example', () => {
    it('matches the architect-readable 2-bed apartment format', () => {
        const out = formatLayoutSummary(
            layoutOf([
                room('master', 16),
                room('bedroom', 12),
                room('living', 22),
                room('kitchen', 8),
                room('bathroom', 5),
                room('corridor', 6),
            ]),
        );
        expect(out).toBe(
            '2-bed apartment · 69m² · master 16m² · bedroom 12m² · living 22m² · kitchen 8m² · bath 5m² · corridor 6m²',
        );
    });
});
