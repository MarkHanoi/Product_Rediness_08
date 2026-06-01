// layoutModalHtml — pure modal HTML renderer tests (SPEC §11, A5-modal).

import { describe, expect, it } from 'vitest';
import {
    buildLayoutModalHtml,
    buildProgramEditFormHtml,
    buildLayoutCardGridHtml,
    buildOccupancyLegendHtml,
    collectRoomNames,
} from '../src/ui/apartment-layout/layoutModalHtml.js';
import type { LayoutCardModel } from '../src/ui/apartment-layout/layoutCardModel.js';
import type { ApartmentProgram, LayoutOption } from '@pryzm/ai-host';

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

    // §MODAL-DYNAMIC (2026-05-29) — program-edit form + refresh.
    it('renders the program-edit form when program is supplied', () => {
        const program: ApartmentProgram = {
            bedrooms: 2, bathrooms: 1, masterEnSuite: true,
            openPlanKitchenDining: false, livingRoom: true, entranceHall: true,
        };
        const html = buildLayoutModalHtml([card()], [''], program);
        expect(html).toContain('class="alm-program"');
        expect(html).toContain('name="bedrooms"');
        expect(html).toContain('value="2"');
        expect(html).toContain('name="bathrooms"');
        expect(html).toContain('name="masterEnSuite" checked');
        expect(html).toContain('name="openPlanKitchenDining"');
        expect(html).not.toContain('name="openPlanKitchenDining" checked');
        expect(html).toContain('data-role="grid"');
    });

    it('omits the program-edit form when no program is supplied (back-compat)', () => {
        const html = buildLayoutModalHtml([card()], ['']);
        expect(html).not.toContain('class="alm-program"');
    });

    it('clamps program numbers to safe ranges (bedrooms 0-5, bathrooms 1-3)', () => {
        const html = buildProgramEditFormHtml({
            bedrooms: 999, bathrooms: -2, masterEnSuite: false,
            openPlanKitchenDining: true, livingRoom: false, entranceHall: false,
        });
        expect(html).toContain('value="5"');         // bedrooms clamped to 5
        expect(html).toContain('value="1"');         // bathrooms clamped to 1
    });

    it('buildLayoutCardGridHtml yields the grid contents only (no panel chrome)', () => {
        const html = buildLayoutCardGridHtml([card({ index: 0 })], ['<svg></svg>']);
        expect(html).toContain('class="alm-card"');
        expect(html).not.toContain('alm-panel');
        expect(html).not.toContain('alm-program');
    });

    // §MODAL-DYNAMIC part-3 (2026-05-29) — occupancy legend.
    const opt = (occupancies: string[]): LayoutOption => ({
        summary: '', corridorWidthMin: 0, doors: [], walls: [],
        rooms: occupancies.map((occ, i) => ({
            name: `r${i}`, type: 'living', area: 12, windowCount: 1,
            hasDirectAccess: true, adjacentTo: [],
            polygon: [
                { x: 0, y: 0 }, { x: 4000, y: 0 },
                { x: 4000, y: 3000 }, { x: 0, y: 3000 },
            ],
            occupancy: occ,
        })),
    });

    it('legend collects DISTINCT occupancies across all options', () => {
        const html = buildOccupancyLegendHtml([
            opt(['living-room', 'kitchen', 'living-room']),
            opt(['bedroom', 'bathroom']),
        ]);
        expect((html.match(/class="alm-legend-item"/g) ?? []).length).toBe(4);
        // Stable order: known occupancies sorted by knownOrder priority.
        const livingIdx = html.indexOf('>Living Room<');
        const bedroomIdx = html.indexOf('>Bedroom<');
        expect(livingIdx).toBeGreaterThan(-1);
        expect(bedroomIdx).toBeGreaterThan(-1);
        expect(livingIdx).toBeLessThan(bedroomIdx);
    });

    it('legend emits the SAME swatch colour as the thumbnail (no drift)', () => {
        const html = buildOccupancyLegendHtml([opt(['kitchen'])]);
        // kitchen → amber-100 #fef3c7
        expect(html).toContain('background:#fef3c7');
    });

    it('legend returns empty string when no options have rooms', () => {
        expect(buildOccupancyLegendHtml([])).toBe('');
        expect(buildOccupancyLegendHtml([opt([])])).toBe('');
    });

    // §ROOM-AREAS (2026-05-29) — per-RoomType m² inputs in the program form
    // (the fallback path when no options have rooms yet).
    it('emits a per-TYPE number input for every area field when no rooms are supplied', () => {
        const program: ApartmentProgram = {
            bedrooms: 2, bathrooms: 1, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const html = buildProgramEditFormHtml(program);
        expect(html).toContain('name="area_t_living"');
        expect(html).toContain('name="area_t_kitchen"');
        expect(html).toContain('name="area_t_dining"');
        expect(html).toContain('name="area_t_bedroom"');
        expect(html).toContain('name="area_t_master"');
        expect(html).toContain('name="area_t_bathroom"');
        // Blank by default (no override) — placeholder reads "auto".
        expect(html).toContain('placeholder="auto"');
    });

    it('pre-fills per-TYPE area inputs from roomAreas overrides when supplied', () => {
        const program: ApartmentProgram = {
            bedrooms: 2, bathrooms: 1, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
            roomAreas: { living: 22, kitchen: 12 },
        };
        const html = buildProgramEditFormHtml(program);
        expect(html).toMatch(/name="area_t_living"[^>]*value="22"/);
        expect(html).toMatch(/name="area_t_kitchen"[^>]*value="12"/);
        // unspecified types still blank.
        expect(html).toMatch(/name="area_t_bedroom"[^>]*value=""/);
    });

    // §ROOM-AREAS-BY-NAME (2026-05-29 follow-up) — per-INSTANCE inputs when
    // room names ARE supplied (the modal collects them from current options).
    it('emits a per-INSTANCE input for every room name when names are supplied', () => {
        const program: ApartmentProgram = {
            bedrooms: 2, bathrooms: 1, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const html = buildProgramEditFormHtml(program, ['Living Room', 'Kitchen', 'Master Bedroom', 'Bedroom 1', 'Bathroom']);
        expect(html).toContain('name="area_n_Living Room"');
        expect(html).toContain('name="area_n_Master Bedroom"');
        expect(html).toContain('name="area_n_Bedroom 1"');
        // The per-TYPE fallback is NOT emitted when names are supplied (form
        // shows ONE row, not both).
        expect(html).not.toContain('name="area_t_living"');
    });

    it('pre-fills per-instance area inputs from roomAreasByName', () => {
        const program: ApartmentProgram = {
            bedrooms: 2, bathrooms: 1, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
            roomAreasByName: { 'Master Bedroom': 20, 'Bedroom 1': 12 },
        };
        const html = buildProgramEditFormHtml(program, ['Master Bedroom', 'Bedroom 1', 'Kitchen']);
        expect(html).toMatch(/name="area_n_Master Bedroom"[^>]*value="20"/);
        expect(html).toMatch(/name="area_n_Bedroom 1"[^>]*value="12"/);
        expect(html).toMatch(/name="area_n_Kitchen"[^>]*value=""/);  // blank
    });

    it('collectRoomNames orders public-first across options, no duplicates', () => {
        // Two options share a "Kitchen" + add different bedrooms — distinct
        // names collected in public-first order.
        const optA = {
            summary: '', corridorWidthMin: 0, doors: [], walls: [],
            rooms: [
                { name: 'Kitchen', type: 'kitchen' as const, area: 0, windowCount: 0, hasDirectAccess: true, adjacentTo: [], occupancy: 'kitchen' },
                { name: 'Bedroom 1', type: 'bedroom' as const, area: 0, windowCount: 0, hasDirectAccess: true, adjacentTo: [], occupancy: 'bedroom' },
                { name: 'Living Room', type: 'living' as const, area: 0, windowCount: 0, hasDirectAccess: true, adjacentTo: [], occupancy: 'living-room' },
            ],
        };
        const optB = {
            summary: '', corridorWidthMin: 0, doors: [], walls: [],
            rooms: [
                { name: 'Kitchen', type: 'kitchen' as const, area: 0, windowCount: 0, hasDirectAccess: true, adjacentTo: [], occupancy: 'kitchen' },     // dup
                { name: 'Bedroom 2', type: 'bedroom' as const, area: 0, windowCount: 0, hasDirectAccess: true, adjacentTo: [], occupancy: 'bedroom' },
            ],
        };
        const names = collectRoomNames([optA, optB]);
        // Public-first: living-room before kitchen before bedroom.
        expect(names.indexOf('Living Room')).toBeLessThan(names.indexOf('Kitchen'));
        expect(names.indexOf('Kitchen')).toBeLessThan(names.indexOf('Bedroom 1'));
        expect(names.indexOf('Bedroom 1')).toBeLessThan(names.indexOf('Bedroom 2'));
        // Kitchen appears once (deduped).
        expect(names.filter(n => n === 'Kitchen').length).toBe(1);
    });

    it('modal panel embeds the legend wrapper only when options are non-empty', () => {
        const program: ApartmentProgram = {
            bedrooms: 1, bathrooms: 1, masterEnSuite: false,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const withRooms = buildLayoutModalHtml(
            [card()], [''], program, [opt(['living-room', 'kitchen'])],
        );
        expect(withRooms).toContain('class="alm-legend"');
        expect(withRooms).toContain('data-role="legend"');

        const noRooms = buildLayoutModalHtml([card()], [''], program, []);
        expect(noRooms).not.toContain('class="alm-legend"');
    });

    // §VALIDATION-DETAILS (2026-06-01) — pill + expandable per-class details
    // panel. The cardHtml renderer treats validation as OPTIONAL on the model
    // (defensive guard for legacy fixtures), so we add a dedicated card
    // builder that supplies a real ValidationBadge.
    describe('validation pill + expandable details', () => {
        const cardWithValidation = (badge: {
            label: string; passesLegality: boolean; total: number;
            errors: number; warnings: number; summaryLine: string;
            markdownReport: string;
        }) => ({ ...card(), validation: badge });

        it('renders the validation pill + a closed details <pre> when validation is present', () => {
            const html = buildLayoutCardGridHtml(
                [cardWithValidation({
                    label: '✓ Passes', passesLegality: true,
                    total: 0, errors: 0, warnings: 0,
                    summaryLine: '0 violations',
                    markdownReport: '## Apartment Layout Validation Report\n\n**No violations.**',
                }) as never],
                ['<svg></svg>'],
            );
            expect(html).toContain('class="alm-validation-pill alm-validation-pill--ok"');
            expect(html).toContain('data-action="toggle-validation"');
            expect(html).toContain('aria-expanded="false"');
            // Details panel rendered (CSS hides it; opens via .alm-card--expanded)
            expect(html).toContain('class="alm-validation-details"');
            expect(html).toContain('No violations');
            // The pill label appears as button text.
            expect(html).toContain('✓ Passes');
        });

        it('paints the pill amber for warnings-only and red for errors', () => {
            const warnHtml = buildLayoutCardGridHtml(
                [cardWithValidation({
                    label: '2 warnings', passesLegality: true,
                    total: 2, errors: 0, warnings: 2,
                    summaryLine: '2 violations: 0 errors, 2 warnings (A-3×2)',
                    markdownReport: 'fake report',
                }) as never],
                [''],
            );
            expect(warnHtml).toContain('alm-validation-pill--warn');

            const errHtml = buildLayoutCardGridHtml(
                [cardWithValidation({
                    label: '1 error', passesLegality: false,
                    total: 1, errors: 1, warnings: 0,
                    summaryLine: '1 violation: 1 error, 0 warnings (G-1×1)',
                    markdownReport: 'fake report',
                }) as never],
                [''],
            );
            expect(errHtml).toContain('alm-validation-pill--err');
        });

        it('details panel shows "Validation skipped" when markdownReport is empty', () => {
            const html = buildLayoutCardGridHtml(
                [cardWithValidation({
                    label: '? Unknown', passesLegality: true,
                    total: 0, errors: 0, warnings: 0,
                    summaryLine: 'validation skipped (projector error)',
                    markdownReport: '',
                }) as never],
                [''],
            );
            expect(html).toContain('alm-validation-pill--unknown');
            expect(html).toContain('Validation skipped');
        });

        it('escapes the markdownReport in the details panel (XSS guard)', () => {
            const html = buildLayoutCardGridHtml(
                [cardWithValidation({
                    label: '1 error', passesLegality: false,
                    total: 1, errors: 1, warnings: 0,
                    summaryLine: '1 error',
                    markdownReport: '<img src=x onerror=alert(1)>',
                }) as never],
                [''],
            );
            expect(html).not.toContain('<img src=x');
            expect(html).toContain('&lt;img src=x');
        });

        it('omits all validation HTML when the card model has no validation (back-compat)', () => {
            const html = buildLayoutCardGridHtml([card()], ['']);
            expect(html).not.toContain('alm-validation-pill');
            expect(html).not.toContain('alm-validation-details');
        });
    });
});
