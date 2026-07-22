// §CTX-USE-COLOUR (L-599) — the classification, the palette discipline and the long-tail legend.
//
// These tests encode the three constraints the ticket calls "lessons already paid for":
//   (1) the 9% unknown renders as EXPLICITLY unknown (no colour at all);
//   (2) the legend is built for the LONG TAIL, not for the 76% apartments;
//   (3) actual use and permitted use are never merged.

import { describe, it, expect } from 'vitest';
import {
    resolveUseTag,
    classifyContextUse,
    summariseContextUse,
    CONTEXT_USE_STYLE,
    type ContextUseClass,
} from '../contextBuildingUse';

describe('resolveUseTag — what OSM actually says', () => {
    it('ignores a bare building=yes (it says nothing)', () => {
        expect(resolveUseTag({ building: 'yes' })).toBeUndefined();
    });

    it('returns undefined for no tags at all', () => {
        expect(resolveUseTag(undefined)).toBeUndefined();
        expect(resolveUseTag({})).toBeUndefined();
    });

    it('returns the raw winning tag, uninterpreted', () => {
        expect(resolveUseTag({ building: 'apartments' })).toBe('building=apartments');
        expect(resolveUseTag({ building: 'yes', amenity: 'school' })).toBe('amenity=school');
    });

    it('collapses shop/office to the KEY (the value is a long tail of hundreds)', () => {
        expect(resolveUseTag({ building: 'yes', shop: 'bakery' })).toBe('shop=*');
        expect(resolveUseTag({ building: 'yes', office: 'lawyer' })).toBe('office=*');
    });

    it('honours the measured priority order (building beats amenity)', () => {
        expect(resolveUseTag({ building: 'church', amenity: 'place_of_worship' }))
            .toBe('building=church');
    });
});

describe('classifyContextUse — an unrecorded use is never inferred', () => {
    it('maps undefined to unknown, NOT to the majority class', () => {
        expect(classifyContextUse(undefined)).toBe('unknown');
        // The failure mode this guards: silently manufacturing ~9% more apartments than OSM knows.
        expect(classifyContextUse(undefined)).not.toBe('residential');
    });

    it('separates "we have a tag we do not bucket" from "we have no tag"', () => {
        expect(classifyContextUse('building=roof')).toBe('other-known');
        expect(classifyContextUse(undefined)).toBe('unknown');
        // Distinct classes AND distinct presentation — failure/empty must not look identical.
        expect(CONTEXT_USE_STYLE['other-known'].colorCss).not.toBeNull();
        expect(CONTEXT_USE_STYLE.unknown.colorCss).toBeNull();
    });

    it('buckets the measured distribution correctly', () => {
        const cases: ReadonlyArray<readonly [string, ContextUseClass]> = [
            ['building=apartments', 'residential'],
            ['building=residential', 'residential'],
            ['building=house', 'residential'],
            ['building=retail', 'retail'],
            ['building=commercial', 'retail'],
            ['shop=*', 'retail'],
            ['building=office', 'office'],
            ['office=*', 'office'],
            ['building=public', 'civic'],
            ['building=hospital', 'civic'],
            ['building=school', 'education'],
            ['building=university', 'education'],
            ['building=hotel', 'hospitality'],
            ['tourism=hotel', 'hospitality'],
            ['building=industrial', 'industrial'],
            ['building=warehouse', 'industrial'],
            ['building=church', 'religious'],
            ['amenity=place_of_worship', 'religious'],
        ];
        for (const [tag, cls] of cases) expect(classifyContextUse(tag), tag).toBe(cls);
    });
});

describe('the palette must not fight the existing massing semantics', () => {
    it('never uses the PRYZM purple reserved for the buildable envelope', () => {
        for (const style of Object.values(CONTEXT_USE_STYLE)) {
            expect(style.colorCss?.toUpperCase()).not.toBe('#6600FF');
        }
    });

    it('gives EVERY class except unknown a distinct swatch', () => {
        const colours = Object.entries(CONTEXT_USE_STYLE)
            .filter(([k]) => k !== 'unknown')
            .map(([, v]) => v.colorCss);
        expect(colours.every((c) => c !== null)).toBe(true);
        expect(new Set(colours).size).toBe(colours.length);
    });

    it('marks the majority class recessive so the long tail can be seen', () => {
        // 76.3% apartments + 3.2% residential + house: a normal-weight colour here paints the
        // whole city one shade and carries no information.
        expect(CONTEXT_USE_STYLE.residential.recessive).toBe(true);
        expect(CONTEXT_USE_STYLE.retail.recessive).toBeUndefined();
        expect(CONTEXT_USE_STYLE.office.recessive).toBeUndefined();
    });
});

describe('summariseContextUse — the legend describes THIS scene', () => {
    // A miniature of the measured Eixample distribution.
    const scene: ContextUseClass[] = [
        ...Array<ContextUseClass>(76).fill('residential'),
        ...Array<ContextUseClass>(4).fill('retail'),
        ...Array<ContextUseClass>(2).fill('office'),
        ...Array<ContextUseClass>(9).fill('unknown'),
        ...Array<ContextUseClass>(9).fill('civic'),
    ];

    it('counts what is on screen, never a hard-coded probe constant', () => {
        const legend = summariseContextUse(scene);
        expect(legend.total).toBe(100);
        expect(legend.unknownShare).toBeCloseTo(0.09, 5);
        const other = summariseContextUse(['office', 'office']);
        expect(other.unknownShare).toBe(0);   // a different scene ⇒ a different answer
    });

    it('orders minority uses FIRST, the recessive majority next, unknown LAST', () => {
        const order = summariseContextUse(scene).rows.map((r) => r.cls);
        expect(order[0]).toBe('civic');        // biggest minority
        expect(order[1]).toBe('retail');
        expect(order[2]).toBe('office');
        expect(order[3]).toBe('residential');  // recessive majority after the tail
        expect(order[order.length - 1]).toBe('unknown'); // pinned last, always
    });

    it('gives the unknown row no swatch and words that say why', () => {
        const row = summariseContextUse(scene).rows.find((r) => r.cls === 'unknown')!;
        expect(row.style.colorCss).toBeNull();
        expect(row.style.note).toMatch(/uncoloured/i);
        expect(row.count).toBe(9);
    });

    it('omits classes that are not present rather than showing empty rows', () => {
        const legend = summariseContextUse(['office', 'office']);
        expect(legend.rows.map((r) => r.cls)).toEqual(['office']);
    });

    it('is safe on an empty scene', () => {
        const legend = summariseContextUse([]);
        expect(legend.total).toBe(0);
        expect(legend.rows).toEqual([]);
        expect(legend.unknownShare).toBe(0);
    });
});

describe('⭐ actual use and permitted use are different questions', () => {
    it('the module answers ONE of them — no zoning/clau input exists on this surface', () => {
        // If a `clau` / MUC code ever becomes an argument to `classifyContextUse`, the two layers
        // have been merged and their DISAGREEMENT — the development signal — has been destroyed.
        expect(classifyContextUse.length).toBe(1);
        expect(summariseContextUse(['office'], 'actual').mode).toBe('actual');
    });
});
