// layoutModalHtml — pure modal HTML renderer tests (SPEC §11, A5-modal).

import { describe, expect, it } from 'vitest';
import { buildLayoutModalHtml } from '../src/ui/apartment-layout/layoutModalHtml.js';
import type { LayoutCardModel } from '../src/ui/apartment-layout/layoutCardModel.js';

function card(over: Partial<LayoutCardModel> = {}): LayoutCardModel {
    return {
        index: 0, title: 'Central corridor', overall: 83,
        bars: [
            { key: 'naturalLight', label: 'Light', pct: 91 },
            { key: 'privacy', label: 'Privacy', pct: 50 },
            { key: 'kitchenWorkflow', label: 'Kitchen', pct: 100 },
            { key: 'corridorEfficiency', label: 'Circulation', pct: 33 },
        ],
        rooms: [{ name: 'Living', type: 'living', area: 22.3, windows: 2 }],
        roomCount: 1, wallCount: 2, doorCount: 1, totalAreaM2: 22.3,
        ...over,
    };
}

describe('buildLayoutModalHtml (A5-modal)', () => {
    it('renders one card per model with data-index + a Select button', () => {
        const html = buildLayoutModalHtml([card({ index: 0 }), card({ index: 1, title: 'B' })], ['<svg></svg>', '<svg></svg>']);
        expect((html.match(/class="alm-card"/g) ?? []).length).toBe(2);
        expect(html).toContain('data-index="0"');
        expect(html).toContain('data-index="1"');
        expect((html.match(/class="alm-select"/g) ?? []).length).toBe(2);
        expect(html).toContain('class="alm-cancel"');
        expect(html).toContain('2 options');
    });

    it('embeds the per-card thumbnail svg', () => {
        const html = buildLayoutModalHtml([card()], ['<svg id="t0"></svg>']);
        expect(html).toContain('<svg id="t0"></svg>');
    });

    it('renders the 4 score bars with width percentages', () => {
        const html = buildLayoutModalHtml([card()], ['']);
        expect((html.match(/class="alm-bar"/g) ?? []).length).toBe(4);
        expect(html).toContain('width:91%');
        expect(html).toContain('width:33%');
    });

    it('escapes untrusted title / room name (XSS guard)', () => {
        const html = buildLayoutModalHtml(
            [card({ title: '<img src=x onerror=alert(1)>', rooms: [{ name: '<b>x</b>', type: 'living', area: 1, windows: 0 }] })],
            [''],
        );
        expect(html).not.toContain('<img src=x');
        expect(html).toContain('&lt;img src=x');
        expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    });

    it('shows an empty-state with a Close button when no cards', () => {
        const html = buildLayoutModalHtml([], []);
        expect(html).toContain('alm-empty');
        expect(html).toContain('No valid layouts');
        expect(html).toContain('class="alm-cancel"');
        expect(html).not.toContain('alm-card"');
    });

    it('tolerates missing thumbnails array (defaults to empty)', () => {
        const html = buildLayoutModalHtml([card()]);
        expect(html).toContain('class="alm-thumb"');
        expect((html.match(/class="alm-card"/g) ?? []).length).toBe(1);
    });
});
