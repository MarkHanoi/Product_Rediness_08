// §LIVE-MODAL (SPEC-LIVE-SINGLE-OPTION-LAYOUT-MODAL) — house modal pure-HTML +
// bubble-graph interactive-option tests. Node env (no DOM): the builders are pure
// string functions, so we assert on the emitted markup.

import { describe, expect, it } from 'vitest';
import {
    buildHouseModalHtml,
    buildHouseCardGridHtml,
    buildNodeInspectorHtml,
    buildHouseProgramEditFormHtml,
} from '../src/ui/house-layout/houseModalHtml.js';
import { buildHouseCardModel } from '../src/ui/house-layout/houseCardModel.js';
import { buildLayoutBubbleGraphSvg } from '../src/ui/apartment-layout/layoutBubbleGraph.js';
// §BARREL-LAZY — HouseLayoutModal no longer eagerly imports the @pryzm/ai-host value
// barrel (it lazily loads `resolveEntranceDoor`), so the pure `parseHouseProgramFormState`
// is statically importable in this DOM-free `node` suite.
import { parseHouseProgramFormState } from '../src/ui/house-layout/HouseLayoutModal.js';
import type {
    LayoutOption, LayoutRoom, ScoredLayoutOption, ScoredHouseLayoutOption, ApartmentProgram,
} from '@pryzm/ai-host';

function room(name: string, occupancy: string, x: number, y: number) {
    return {
        name, occupancy, type: occupancy, area: 12,
        polygon: [
            { x, y }, { x: x + 3000, y }, { x: x + 3000, y: y + 3000 }, { x, y: y + 3000 },
        ],
        adjacentTo: [] as string[],
    };
}

function storeyOption(): ScoredLayoutOption {
    const opt: LayoutOption = {
        summary: 's', corridorWidthMin: 1000,
        rooms: [room('Bedroom 1', 'bedroom', 0, 0), room('Kitchen', 'kitchen', 3000, 0)] as never,
        walls: [
            { start: { x: 0, y: 0 }, end: { x: 6000, y: 0 }, isExternal: true },
            { start: { x: 6000, y: 0 }, end: { x: 6000, y: 3000 }, isExternal: true },
        ],
        doors: [],
    };
    return { ...opt, score: { overall: 84, naturalLight: 80, privacy: 70, kitchenWorkflow: 90, corridorEfficiency: 60 } } as ScoredLayoutOption;
}

function houseOption(index: number): ScoredHouseLayoutOption {
    const opt = storeyOption();
    return {
        variantIndex: index,
        overallScore: 84,
        result: {
            storeys: [
                { levelId: 'L0', storeyIndex: 0, elevationM: 0, floorToFloorM: 3, footprint: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 3 }, { x: 0, z: 3 }] },
                { levelId: 'L1', storeyIndex: 1, elevationM: 3, floorToFloorM: 3, footprint: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 3 }, { x: 0, z: 3 }] },
            ],
            perStoreyLayout: [opt, opt],
            stairs: [], voids: [],
            roof: { kind: 'gable' } as never,
        },
    };
}

describe('§3PANE — three-pane house modal (SPEC-DYNAMIC-PROGRAM-CANVAS §1.1)', () => {
    it('header reads "Design your house — live" (no option count)', () => {
        const card = buildHouseCardModel(houseOption(0), 0);
        const html = buildHouseModalHtml([card]);
        expect(html).toContain('Design your house — live');
        // No "N option(s)" suffix.
        expect(html).not.toMatch(/\d+ option/);
    });

    it('renders the three panes (plans LEFT, graphs CENTER) + tools rail RIGHT + one Execute', () => {
        const card = buildHouseCardModel(houseOption(0), 0);
        const html = buildHouseModalHtml([card], [['<svg id="plan0"></svg>', '<svg id="plan1"></svg>']]);
        // LEFT plans + CENTER graphs panes, RIGHT tools rail.
        expect(html).toContain('hlm-pane--plans');
        expect(html).toContain('hlm-pane--graphs');
        expect(html).toContain('hlm-tools-rail');
        // The LEFT+CENTER live in the regenerated [data-role="grid"] region.
        expect(html).toContain('data-role="grid"');
        expect(html).toContain('<svg id="plan0"></svg>');
        // Exactly one terminal Execute ("Use this layout") for the single best option.
        expect((html.match(/class="alm-select hlm-execute"/g) ?? []).length).toBe(1);
        // The 3-pane body is NOT the old card grid + has no per-storey toggle.
        expect(html).not.toContain('class="alm-card hlm-card"');
        expect(html).not.toContain('hlm-storey-toggle');
    });

    // §3PANE IT-4 — the CENTER pane is ONE unified Miro/Mural canvas (both storeys'
    // graphs as lanes in a pan/zoom world), not two stacked graph boxes.
    it('CENTER pane is a unified Miro canvas: viewport + world + one lane per storey + zoom controls', () => {
        const card = buildHouseCardModel(houseOption(0), 0);
        const graphs = [['<svg id="g0"></svg>', '<svg id="g1"></svg>']];
        const html = buildHouseModalHtml([card], [['<svg id="plan0"></svg>']], undefined, graphs);
        expect(html).toContain('data-role="miro"');
        expect(html).toContain('data-role="miro-viewport"');
        expect(html).toContain('data-role="miro-world"');
        // One lane per storey, each tagged with its source storey index (the cross-floor
        // move handle) — the card has 2 storeys.
        expect((html.match(/class="hlm-miro-lane"/g) ?? []).length).toBe(card.storeys.length);
        expect(html).toContain('data-storey-index="0"');
        expect(html).toContain('data-storey-index="1"');
        // Both storey graphs land inside the single canvas.
        expect(html).toContain('<svg id="g0"></svg>');
        expect(html).toContain('<svg id="g1"></svg>');
        // Zoom controls present.
        expect(html).toContain('data-miro="in"');
        expect(html).toContain('data-miro="out"');
        expect(html).toContain('data-miro="reset"');
    });
});

describe('§LIVE-MODAL.B — living graph + per-storey Plan/Graph toggle', () => {
    it('emits a per-storey Plan/Graph toggle + graph view when graphs are supplied', () => {
        const card = buildHouseCardModel(houseOption(0), 0);
        const thumbs = [['<svg id="plan0"></svg>', '<svg id="plan1"></svg>']];
        const graphs = [['<svg id="graph0"></svg>', '<svg id="graph1"></svg>']];
        const html = buildHouseCardGridHtml([card], thumbs, graphs);
        // Two storeys → two toggles (one per storey row).
        expect((html.match(/hlm-storey-toggle/g) ?? []).length).toBe(2);
        expect((html.match(/hlm-storey-view--graph/g) ?? []).length).toBe(2);
        expect(html).toContain('<svg id="graph0"></svg>');
        expect(html).toContain('data-action="toggle-graph"');
    });

    it('omits the toggle when no graphs are supplied (plan-only, pre-LIVE-MODAL look)', () => {
        const card = buildHouseCardModel(houseOption(0), 0);
        const html = buildHouseCardGridHtml([card], [['<svg></svg>', '<svg></svg>']]);
        expect(html).not.toContain('hlm-storey-toggle');
        expect(html).not.toContain('hlm-storey-view--graph');
    });
});

describe('§LIVE-MODAL.D — interactive bubble-graph nodes (opt-in)', () => {
    const opt = storeyOption();

    it('default (non-interactive) nodes are inert — no data-room-name, pointer-events:none', () => {
        const svg = buildLayoutBubbleGraphSvg(opt);
        expect(svg).not.toContain('data-room-name');
        expect(svg).not.toContain('alm-graph-node');
        expect(svg).toContain('pointer-events="none"');
    });

    it('interactive:true makes nodes clickable with data-room-name + alm-graph-node', () => {
        const svg = buildLayoutBubbleGraphSvg(opt, { interactive: true });
        expect(svg).toContain('class="alm-graph-node"');
        expect(svg).toContain('data-room-name="Bedroom 1"');
        expect(svg).toContain('data-room-name="Kitchen"');
        expect(svg).toContain('pointer-events="auto"');
        expect(svg).toContain('role="button"');
    });
});

describe('§54 — living-graph node inspector (INFORMATION · DEPENDENCIES · ADJACENCY · CIRCULATION)', () => {
    // A small storey: a corridor that serves a bedroom + bathroom; a sealed store.
    const storey: LayoutRoom[] = [
        { name: 'Corridor', type: 'corridor', area: 6, adjacentTo: ['Bedroom 1', 'Bathroom'] } as LayoutRoom,
        { name: 'Bedroom 1', type: 'bedroom', area: 14, adjacentTo: ['Corridor'] } as LayoutRoom,
        { name: 'Bathroom', type: 'bathroom', area: 5, adjacentTo: ['Corridor'] } as LayoutRoom,
        { name: 'Store', type: 'utility', area: 3, adjacentTo: ['Bedroom 1'] } as LayoutRoom,
    ];

    it('renders all four labelled sections for a room', () => {
        const html = buildNodeInspectorHtml(storey[1], storey); // Bedroom 1
        expect(html).toContain('data-role="node-inspector"');
        expect(html).toContain('>Information<');
        expect(html).toContain('>Dependencies<');
        expect(html).toContain('>Adjacency<');
        expect(html).toContain('>Circulation<');
    });

    it('INFORMATION shows name, human type label + area', () => {
        const html = buildNodeInspectorHtml(storey[1], storey); // Bedroom 1
        expect(html).toContain('<b>Bedroom 1</b>');
        expect(html).toContain('Bedroom · 14 m²');
    });

    it('ADJACENCY renders each connected room as a chip', () => {
        const html = buildNodeInspectorHtml(storey[0], storey); // Corridor
        expect(html).toContain('class="hlm-insp-chip">Bedroom 1<');
        expect(html).toContain('class="hlm-insp-chip">Bathroom<');
    });

    it('CIRCULATION = ON when adjacent to a corridor/hall (shows the via-room)', () => {
        const html = buildNodeInspectorHtml(storey[1], storey); // Bedroom 1 → Corridor
        expect(html).toContain('On circulation ✓');
        expect(html).toContain('(via Corridor)');
        expect(html).toContain('hlm-insp-circ--on');
    });

    it('CIRCULATION = OFF when served only through a non-circulation room', () => {
        const html = buildNodeInspectorHtml(storey[3], storey); // Store → Bedroom 1 (not circulation)
        expect(html).toContain('Not on circulation ✗');
        expect(html).toContain('served through Bedroom 1');
        expect(html).toContain('hlm-insp-circ--off');
    });

    it('DEPENDENCIES derives a program role from type (private/public)', () => {
        expect(buildNodeInspectorHtml(storey[1], storey)).toContain('Private — off the corridor'); // bedroom
        expect(buildNodeInspectorHtml(storey[0], storey)).toContain('Circulation — serves other rooms'); // corridor
    });

    it('empty adjacency → "No connected rooms" + sealed circulation', () => {
        const sealed: LayoutRoom = { name: 'Vault', type: 'utility', area: 2, adjacentTo: [] } as LayoutRoom;
        const html = buildNodeInspectorHtml(sealed, [sealed]);
        expect(html).toContain('No connected rooms');
        expect(html).toContain('(sealed)');
    });

    it('missing room → empty string (modal falls back to the bare editor)', () => {
        expect(buildNodeInspectorHtml(undefined, storey)).toBe('');
    });

    it('escapes runtime strings (XSS guard)', () => {
        const evil: LayoutRoom = { name: '<img src=x>', type: 'bedroom', area: 10, adjacentTo: [] } as LayoutRoom;
        const html = buildNodeInspectorHtml(evil, [evil]);
        expect(html).not.toContain('<img src=x>');
        expect(html).toContain('&lt;img src=x&gt;');
    });
});

// §MODAL-SIZE-OVERRIDE-THREADED (2026-06-11, founder house-modal size bug) — proves
// the per-RoomType size SLIDER (`area_t_<type>`) is parsed into
// `program.roomAreas[<type>]`, which the controller passes straight to the engine
// (HouseLayoutController._computeVariants → generateHouseLayoutOptions, whose bubble
// graph reads `roomAreas[r.type]` as the room target). This is the exact thread the
// "kitchen size doesn't adapt" bug lives on. The parse is exercised through the PURE
// `parseHouseProgramFormState` (DOM-free) over the fields the form HTML emits, so the
// slider-name ↔ reader contract can't silently drift. The ENGINE half (does a bigger
// `roomAreas[kitchen]` build a bigger kitchen, modulo the §AREA-FRACTIONS clamp) is
// covered by the ai-host suite (packages/ai-host/__tests__/houseLayout.test.ts) and is
// not re-run here (importing the engine barrel needs a DOM env this `node` suite lacks).
describe('§MODAL-SIZE-OVERRIDE-THREADED — area_t_<type> slider → program.roomAreas[<type>]', () => {
    // The form-emitted control set: the area sliders the HTML builder renders, plus the
    // count fields. Mirrors what `form.elements` yields (name + string value + checked).
    const fields = [
        { name: 'storeys', value: '2' },
        { name: 'bedrooms', value: '3' },
        { name: 'bathrooms', value: '2' },
        { name: 'livingRoom', value: 'on', checked: true },
        { name: 'includeKitchen', value: 'on', checked: true },
        { name: 'area_t_kitchen', value: '24' },   // the user dragged the Kitchen slider
        { name: 'area_t_living', value: '0' },      // untouched → auto
        { name: 'area_t_bedroom', value: '0' },     // untouched → auto
        { name: 'weight_naturalLight', value: '50' },
    ];

    it('a positive Kitchen slider value lands on program.roomAreas.kitchen', () => {
        const state = parseHouseProgramFormState(fields);
        // The override the engine reads as the kitchen target — the bug = this is dropped.
        expect(state.program.roomAreas).toBeTruthy();
        expect(state.program.roomAreas!.kitchen).toBe(24);
        // Untouched (value 0) sliders are OMITTED → that type stays "auto".
        expect(state.program.roomAreas!.living).toBeUndefined();
        expect(state.program.roomAreas!.bedroom).toBeUndefined();
        // Counts + storeys are threaded too.
        expect(state.storeyCount).toBe(2);
        expect(state.program.bedrooms).toBe(3);
        expect(state.program.bathrooms).toBe(2);
    });

    it('all-zero area sliders ⇒ no roomAreas field (byte-identical baseline)', () => {
        const zeroed = fields.map(f => (f.name.startsWith('area_t_') ? { ...f, value: '0' } : f));
        const state = parseHouseProgramFormState(zeroed);
        expect(state.program.roomAreas).toBeUndefined();
    });

    it('the form HTML emits an area_t_kitchen slider seeded from program.roomAreas (round-trip)', () => {
        const html = buildHouseProgramEditFormHtml({
            storeyCount: 1,
            program: {
                bedrooms: 1, bathrooms: 1, masterEnSuite: false,
                openPlanKitchenDining: false, livingRoom: true, includeKitchen: true, entranceHall: false,
                roomAreas: { kitchen: 18 },
            } as ApartmentProgram,
            weights: { naturalLight: 0.5, privacy: 0.5, kitchenWorkflow: 0.5, corridorEfficiency: 0.5 },
        });
        // The slider exists with the reader's expected name and is seeded with the override
        // (so re-opening the modal mirrors the last requested size, and the reader round-trips).
        expect(html).toContain('name="area_t_kitchen"');
        expect(html).toContain('value="18"');
        expect(html).toContain('data-readout-for="area_t_kitchen"');
    });
});
