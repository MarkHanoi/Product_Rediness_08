// §HONEST-PICKER (L-4200..L-4207, 2026-08-22) — the PICKER half of the founder's
// Room 03-002 report.
//
// Two facts about that card were rendering defects, not engine defects:
//
//   • its whole shape disclosure ("planned on inscribed 7.9x8.8 m rectangle; site
//     is non-rectangular") was appended to `summary`, and `.alm-title` clipped it
//     with `text-overflow: ellipsis; white-space: nowrap`. He read
//     "Procedural A - 7 rooms (offlin...". A 13 % shortfall against the real room,
//     hidden by one CSS line.
//   • it read "4 errors" on a pill that had to be CLICKED to reveal them, while
//     "Use this layout" sat beside it fully enabled. A count is not a finding.
//
// These tests pin the fixes at the layer the user actually experiences: the HTML
// string the modal sets as innerHTML.

import { describe, expect, it } from 'vitest';
import { buildLayoutCardGridHtml } from '../src/ui/apartment-layout/layoutModalHtml.js';
import { buildLayoutCardModel, type LayoutCardModel } from '../src/ui/apartment-layout/layoutCardModel.js';
import type { LayoutLimitation, ScoredLayoutOption } from '@pryzm/ai-host';

function card(over: Partial<LayoutCardModel> = {}): LayoutCardModel {
    return {
        index: 0, title: 'Central corridor', overall: 83,
        bars: [{ key: 'naturalLight', label: 'Light', pct: 91, group: 'primary' }],
        rooms: [{ name: 'Living', type: 'living', area: 22.3, windows: 2 }],
        roomCount: 1, wallCount: 2, doorCount: 1, totalAreaM2: 22.3,
        validation: {
            passesLegality: true, total: 0, errors: 0, warnings: 0, notMeasured: 0,
            label: '✓ Passes', summaryLine: 'no violations', markdownReport: '',
            errorLines: [],
        },
        circulationPct: 100, circulationExact: true,
        limitations: [], limitationErrors: 0,
        ...over,
    };
}

const SHAPE_LIMIT: LayoutLimitation = {
    code: 'shape-approximated',
    severity: 'warning',
    text: 'This shape is approximated by an inscribed 7.9 × 8.8 m rectangle (70.0 m²). '
        + 'The room is 80.6 m², so 10.6 m² of it — 13% — is NOT covered by this layout.',
};
const ENGINE_LIMIT: LayoutLimitation = {
    code: 'engine-fallback',
    severity: 'warning',
    text: 'The architectural layout engine DECLINED this programme on this shape.',
};
const MIN_LIMIT: LayoutLimitation = {
    code: 'room-below-minimum',
    severity: 'error',
    text: 'Master 5 is 9.3 m² — below the 12.0 m² minimum this room type requires.',
};

describe('§HONEST-PICKER — stated limitations render BEFORE the commit button', () => {
    it('prints every limitation in full, in the card, above "Use this layout"', () => {
        const html = buildLayoutCardGridHtml([card({ limitations: [SHAPE_LIMIT], limitationErrors: 0 })], ['']);
        expect(html).toContain('data-role="limitations"');
        // The whole sentence, including the m² that was clipped away before.
        expect(html).toContain('10.6 m');
        expect(html).toContain('is NOT covered');
        // ORDER is what makes it legible: the limitations precede the button.
        expect(html.indexOf('data-role="limitations"')).toBeLessThan(html.indexOf('alm-select'));
    });

    it('renders errors first and marks the block as an error block', () => {
        const html = buildLayoutCardGridHtml(
            [card({ limitations: [MIN_LIMIT, SHAPE_LIMIT], limitationErrors: 1 })], [''],
        );
        expect(html).toContain('alm-limits--err');
        expect(html).toContain('1 problem with this layout');
        expect(html.indexOf('data-code="room-below-minimum"'))
            .toBeLessThan(html.indexOf('data-code="shape-approximated"'));
    });

    it('emits NOTHING when the option carries no limitations — no empty reassurance box', () => {
        const html = buildLayoutCardGridHtml([card()], ['']);
        expect(html).not.toContain('data-role="limitations"');
    });

    it('escapes limitation text (C08 §3.1 XSS guard)', () => {
        const evil: LayoutLimitation = { code: 'engine-fallback', severity: 'warning', text: '<img src=x onerror=alert(1)>' };
        const html = buildLayoutCardGridHtml([card({ limitations: [evil] })], ['']);
        expect(html).not.toContain('<img src=x');
        expect(html).toContain('&lt;img src=x');
    });
});

describe('§HONEST-PICKER — validation ERRORS are visible, not one click away', () => {
    it('prints the error sentences beside the pill', () => {
        const html = buildLayoutCardGridHtml([card({
            validation: {
                passesLegality: false, total: 4, errors: 4, warnings: 0, notMeasured: 0,
                label: '4 errors', summaryLine: '4 violations', markdownReport: '# report',
                errorLines: ['G-1: Living 3.0 m² exceeds nothing', 'A-3: bathroom off living'],
            },
            limitationErrors: 0,
        })], ['']);
        expect(html).toContain('data-role="validation-errors"');
        expect(html).toContain('A-3: bathroom off living');
        expect(html.indexOf('data-role="validation-errors"')).toBeLessThan(html.indexOf('alm-select'));
    });

    it('emits no error list when the layout has none', () => {
        const html = buildLayoutCardGridHtml([card()], ['']);
        expect(html).not.toContain('data-role="validation-errors"');
    });
});

describe('§HONEST-PICKER — the card model passes limitations through from the option', () => {
    it('carries LayoutOption.limitations onto the card, errors first', () => {
        const option = {
            summary: 'Procedural A', rooms: [], walls: [], doors: [], corridorWidthMin: 900,
            limitations: [SHAPE_LIMIT, MIN_LIMIT, ENGINE_LIMIT],
            score: {
                overall: 89,
                breakdown: { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 },
            },
        } as unknown as ScoredLayoutOption;
        const model = buildLayoutCardModel(option, 0);
        expect(model.limitations.map(l => l.code)).toEqual([
            'room-below-minimum', 'shape-approximated', 'engine-fallback',
        ]);
        expect(model.limitationErrors).toBe(1);
    });

    it('yields an EMPTY list (never undefined) for an option that carries none', () => {
        const option = {
            summary: 'x', rooms: [], walls: [], doors: [], corridorWidthMin: 900,
            score: {
                overall: 50,
                breakdown: { naturalLight: 0.5, privacy: 0.5, kitchenWorkflow: 0.5, corridorEfficiency: 0.5 },
            },
        } as unknown as ScoredLayoutOption;
        const model = buildLayoutCardModel(option, 0);
        expect(model.limitations).toEqual([]);
        expect(model.limitationErrors).toBe(0);
    });
});
