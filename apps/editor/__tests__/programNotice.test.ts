// A.21.D5 editor follow-up — reduced-programme + plate-rejection notices.
// Node env (no DOM): the builders are pure string functions, so we assert on the
// emitted markup and on the requested-vs-built shortfall math.

import { describe, expect, it } from 'vitest';
import {
    computeProgramShortfall,
    summariseDroppedRoomTypes,
    summariseShortfall,
    buildReducedProgramNoticeHtml,
    buildRejectionNoticeHtml,
} from '../src/ui/apartment-layout/programNotice.js';
import { buildHouseModalHtml, buildHouseResultHtml } from '../src/ui/house-layout/houseModalHtml.js';
import { buildLayoutModalHtml } from '../src/ui/apartment-layout/layoutModalHtml.js';
import type { HouseCardModel } from '../src/ui/house-layout/houseCardModel.js';

describe('computeProgramShortfall', () => {
    it('reports a shortfall only where built < requested, ordered canonically', () => {
        const sf = computeProgramShortfall(
            { bedroom: 4, bathroom: 2, kitchen: 1 },
            { bedroom: 3, bathroom: 2, kitchen: 1 },
        );
        expect(sf).toEqual([{ type: 'bedroom', requested: 4, built: 3, dropped: 1 }]);
    });

    it('returns empty when everything fit', () => {
        expect(computeProgramShortfall({ bedroom: 3 }, { bedroom: 3 })).toEqual([]);
        expect(computeProgramShortfall({ bedroom: 3 }, { bedroom: 4 })).toEqual([]); // over-built ⇒ no notice
    });

    it('orders bedrooms before bathrooms', () => {
        const sf = computeProgramShortfall(
            { bathroom: 2, bedroom: 5 },
            { bathroom: 1, bedroom: 4 },
        );
        expect(sf.map(s => s.type)).toEqual(['bedroom', 'bathroom']);
    });
});

describe('summariseDroppedRoomTypes', () => {
    it('counts structured DroppedRoom[] by type (future engine path)', () => {
        expect(summariseDroppedRoomTypes([{ type: 'bedroom' }, { type: 'bedroom' }, { type: 'wc' }]))
            .toEqual({ bedroom: 2, wc: 1 });
    });
});

describe('summariseShortfall', () => {
    it('renders one type', () => {
        expect(summariseShortfall([{ type: 'bedroom', requested: 4, built: 3, dropped: 1 }]))
            .toBe("1 bedroom couldn't fit at minimum size on this plot");
    });
    it('renders multiple types with an Oxford-style "and"', () => {
        expect(summariseShortfall([
            { type: 'bedroom', requested: 4, built: 3, dropped: 1 },
            { type: 'bathroom', requested: 2, built: 1, dropped: 1 },
        ])).toBe("1 bedroom and 1 bathroom couldn't fit at minimum size on this plot");
    });
});

describe('buildReducedProgramNoticeHtml', () => {
    it('renders a dismissible non-blocking chip listing dropped rooms + built N of M', () => {
        const html = buildReducedProgramNoticeHtml([{ type: 'bedroom', requested: 4, built: 3, dropped: 1 }]);
        expect(html).toContain('data-role="reduced-program-notice"');
        expect(html).toContain('Reduced programme');
        expect(html).toContain('1 bedroom');
        expect(html).toContain('built 3 of 4');
        expect(html).toContain('data-action="dismiss-notice"'); // dismissible
    });

    it('returns empty string when nothing was dropped', () => {
        expect(buildReducedProgramNoticeHtml([])).toBe('');
    });
});

describe('buildRejectionNoticeHtml', () => {
    it('renders the engine reason + an actionable hint', () => {
        const html = buildRejectionNoticeHtml('plate too small for the requested rooms at minimum sizes');
        expect(html).toContain('data-role="rejection-notice"');
        expect(html).toContain('No layout fits this plot');
        expect(html).toContain('plate too small for the requested rooms');
        expect(html).toMatch(/reduce the number of bedrooms/i);
    });

    it('returns empty string when there is no reason', () => {
        expect(buildRejectionNoticeHtml('')).toBe('');
        expect(buildRejectionNoticeHtml(undefined)).toBe('');
    });

    it('escapes the reason (XSS guard)', () => {
        const html = buildRejectionNoticeHtml('<img src=x onerror=alert(1)>');
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;img');
    });
});

// ── modal integration: the notice renders in the result rail / region ──────────

function houseCard(): HouseCardModel {
    return {
        index: 0,
        title: 'House layout 1',
        overall: 82,
        storeyCount: 2,
        stairCount: 1,
        roofKind: 'gable',
        storeys: [
            { storeyIndex: 0, label: 'Ground floor', option: { rooms: [], walls: [], doors: [], summary: '', corridorWidthMin: 1000, score: { overall: 80 } } as never, score: 80, roomCount: 0, totalAreaM2: 40, roomSummary: '2 bed' },
        ],
    };
}

describe('house modal renders the notice in the result rail', () => {
    it('injects the reduced-programme notice above the score', () => {
        const notice = buildReducedProgramNoticeHtml([{ type: 'bedroom', requested: 4, built: 3, dropped: 1 }]);
        const html = buildHouseResultHtml(houseCard(), notice);
        expect(html).toContain('data-role="reduced-program-notice"');
        // notice precedes the score block
        expect(html.indexOf('reduced-program-notice')).toBeLessThan(html.indexOf('alm-overall'));
    });

    it('full modal threads the notice through to the tools rail', () => {
        const notice = buildReducedProgramNoticeHtml([{ type: 'bathroom', requested: 2, built: 1, dropped: 1 }]);
        const html = buildHouseModalHtml([houseCard()], [[]], undefined, [[]], notice);
        expect(html).toContain('data-role="reduced-program-notice"');
        expect(html).toContain('1 bathroom');
    });

    it('no notice when the HTML is empty', () => {
        const html = buildHouseResultHtml(houseCard(), '');
        expect(html).not.toContain('reduced-program-notice');
    });
});

describe('apartment modal renders the notice region', () => {
    it('places the notice between the legend and the cards', () => {
        const notice = buildReducedProgramNoticeHtml([{ type: 'bedroom', requested: 3, built: 2, dropped: 1 }]);
        const html = buildLayoutModalHtml([], [], undefined, [], [], notice);
        expect(html).toContain('data-role="program-notice"');
        expect(html).toContain('reduced-program-notice');
        // region sits before the grid
        expect(html.indexOf('program-notice')).toBeLessThan(html.indexOf('data-role="grid"'));
    });

    it('renders an empty (but present) notice region when there is no shortfall', () => {
        const html = buildLayoutModalHtml([], [], undefined, [], [], '');
        expect(html).toContain('data-role="program-notice"');
        expect(html).not.toContain('reduced-program-notice');
    });
});
