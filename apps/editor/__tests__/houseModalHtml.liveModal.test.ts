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
        expect(html).toContain('door to Corridor');
        expect(html).toContain('hlm-insp-circ--on');
    });

    it('CIRCULATION = ON for the corridor itself (it IS the spine, not served-through)', () => {
        // Founder bug: a corridor whose neighbours are all habitable rooms (none of type
        // corridor/hall) must NOT read "Not on circulation (served through …)".
        const html = buildNodeInspectorHtml(storey[0], storey); // Corridor
        expect(html).toContain('On circulation ✓');
        expect(html).toContain('(the spine)');
        expect(html).toContain('hlm-insp-circ--on');
        expect(html).not.toContain('Not on circulation');
    });

    it('§STAIR-PUBLIC-FLOW: stair is ON only with a DOOR onto a public space', () => {
        // A stair with a DOOR to a public circulation space (living/dining/kitchen/
        // corridor/hall) is compliant; "connects floors" alone is NOT enough.
        const living: LayoutRoom = { name: 'Living Room', type: 'living', area: 30, adjacentTo: ['Stair'] } as LayoutRoom;
        const stair: LayoutRoom = { name: 'Stair', type: 'stair', area: 9, adjacentTo: ['Living Room'], doorAdjacentTo: ['Living Room'] } as LayoutRoom;
        const html = buildNodeInspectorHtml(stair, [stair, living]);
        expect(html).toContain('On circulation ✓');
        expect(html).toContain('door to Living Room');
        expect(html).not.toContain('Not on circulation');
    });

    it('§STAIR-PUBLIC-FLOW: stair WALL-adjacent to a public space but with NO door is RED', () => {
        // Founder: a stair that connects floors but is not reached from any public
        // space is non-compliant — the panel must say so + name where a door is needed.
        const kitchen: LayoutRoom = { name: 'Kitchen', type: 'kitchen', area: 12, adjacentTo: ['Stair'] } as LayoutRoom;
        const stair: LayoutRoom = { name: 'Stair', type: 'stair', area: 9, adjacentTo: ['Kitchen'], doorAdjacentTo: [] } as LayoutRoom;
        const html = buildNodeInspectorHtml(stair, [stair, kitchen]);
        expect(html).toContain('Not on circulation ✗');
        expect(html).toContain('needs a door to Kitchen');
        expect(html).toContain('hlm-insp-circ--off');
    });

    it('CIRCULATION = OFF when served only through a non-circulation room', () => {
        const html = buildNodeInspectorHtml(storey[3], storey); // Store → Bedroom 1 (not circulation)
        expect(html).toContain('Not on circulation ✗');
        expect(html).toContain('door only into Bedroom 1');
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
        expect(html).toContain('no door — sealed');
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
// the per-RoomType size SLIDER is parsed into the engine's per-room target. After
// §REMOVE-GLOBAL-PROGRAM (founder 2026-06-18) the per-room size slider lives ONLY
// inside the per-level tabs (`s{i}.area_t_<type>`) and lands on
// `perStoreyPrograms[i].roomAreas[<type>]` (threaded to `HouseLayoutOptions.perStoreyOverrides`,
// merged over the storey program; the bubble graph reads it as the room target). The parse
// is exercised through the PURE `parseHouseProgramFormState` (DOM-free) over the namespaced
// fields the tab HTML emits, so the slider-name ↔ reader contract can't silently drift. The
// ENGINE half is covered by the ai-host suite and not re-run here.
describe('§MODAL-SIZE-OVERRIDE-THREADED — s{i}.area_t_<type> slider → perStoreyPrograms[i].roomAreas[<type>]', () => {
    // The form-emitted control set: a 2-storey form's per-level size sliders. Mirrors what
    // `form.elements` yields (name + string value + checked). NO global bedrooms/bathrooms
    // or boolean controls — they were removed (§REMOVE-GLOBAL-PROGRAM).
    const fields = [
        { name: 'storeys', value: '2' },
        { name: 's0.bedrooms', value: '1' },        // ground: 1 bed
        { name: 's0.bathrooms', value: '1' },       // ground: 1 bath
        { name: 's1.bedrooms', value: '2' },        // first: 2 beds
        { name: 's1.bathrooms', value: '1' },       // first: 1 bath
        { name: 's0.area_t_kitchen', value: '24' }, // the user dragged the ground Kitchen slider
        { name: 's0.area_t_living', value: '0' },   // untouched → auto
        { name: 's1.area_t_bedroom', value: '0' },  // untouched → auto
        { name: 'weight_naturalLight', value: '50' },
    ];

    it('a positive per-storey Kitchen slider lands on perStoreyPrograms[0].roomAreas.kitchen', () => {
        const state = parseHouseProgramFormState(fields);
        expect(state.perStoreyPrograms).toBeTruthy();
        expect(state.perStoreyPrograms![0]!.roomAreas).toBeTruthy();
        expect(state.perStoreyPrograms![0]!.roomAreas!.kitchen).toBe(24);
        // Untouched (value 0) sliders are OMITTED → that type stays "auto".
        expect(state.perStoreyPrograms![0]!.roomAreas!.living).toBeUndefined();
        // §REMOVE-GLOBAL-PROGRAM — the whole-house program is DERIVED from the per-level
        // tabs: bedrooms = SUM of explicit per-level counts (1 + 2), bathrooms = 1 + 1.
        expect(state.storeyCount).toBe(2);
        expect(state.program.bedrooms).toBe(3);
        expect(state.program.bathrooms).toBe(2);
    });

    it('all-auto per-storey area sliders ⇒ no roomAreas field on that storey (byte-identical baseline)', () => {
        const zeroed = fields.map(f => (f.name.includes('.area_t_') ? { ...f, value: '0' } : f));
        const state = parseHouseProgramFormState(zeroed);
        for (const ov of state.perStoreyPrograms ?? []) {
            expect(ov?.roomAreas).toBeUndefined();
        }
    });

    it('§REMOVE-GLOBAL-PROGRAM: the form HTML NO LONGER emits global bedrooms/bathrooms or room booleans', () => {
        // The global whole-house Bedrooms/Bathrooms number inputs + the four global room
        // booleans were removed (founder 2026-06-18 — "we don't need the top part since we
        // have it in the per-floor interface"). Only the FLOORS input survives at the top.
        const html = buildHouseProgramEditFormHtml({
            storeyCount: 2,
            program: {
                bedrooms: 3, bathrooms: 2, masterEnSuite: false,
                openPlanKitchenDining: false, livingRoom: true, includeKitchen: true, entranceHall: false,
            } as ApartmentProgram,
            weights: { naturalLight: 0.5, privacy: 0.5, kitchenWorkflow: 0.5, corridorEfficiency: 0.5 },
        });
        // No GLOBAL count inputs (top-level names, never namespaced).
        expect(html).not.toContain('name="bedrooms"');
        expect(html).not.toContain('name="bathrooms"');
        // No GLOBAL room booleans.
        expect(html).not.toContain('name="livingRoom"');
        expect(html).not.toContain('name="includeKitchen"');
        expect(html).not.toContain('name="openPlanKitchenDining"');
        expect(html).not.toContain('name="masterEnSuite"');
        // No GLOBAL `area_t_*` slider either (removed earlier).
        expect(html).not.toContain('name="area_t_kitchen"');
        // The FLOORS input is kept (it drives the tab count).
        expect(html).toContain('name="storeys"');
        // Per-level bed/bath controls ARE present (the new single source of truth).
        expect(html).toContain('name="s0.bedrooms"');
        expect(html).toContain('name="s1.bathrooms"');
    });

    it('§PER-STOREY-SIZE: a multi-storey form emits per-storey s{i}.area_t_<type> size sliders + ↔ Corridor toggles', () => {
        const html = buildHouseProgramEditFormHtml({
            storeyCount: 2,
            program: {
                bedrooms: 3, bathrooms: 2, masterEnSuite: true,
                openPlanKitchenDining: false, livingRoom: true, includeKitchen: true, entranceHall: false,
            } as ApartmentProgram,
            weights: { naturalLight: 0.5, privacy: 0.5, kitchenWorkflow: 0.5, corridorEfficiency: 0.5 },
        });
        // Per-storey size sliders live inside the tabs (namespaced).
        expect(html).toContain('name="s0.area_t_kitchen"');
        expect(html).toContain('name="s1.area_t_bedroom"');
        // Per-storey bed/bath + booleans (the per-floor single source of truth).
        expect(html).toContain('name="s0.bedrooms"');
        expect(html).toContain('name="s0.livingRoom"');
        // §FORCE-CORRIDOR-DIRECT — per-storey "↔ Corridor" toggles are present.
        expect(html).toContain('name="s0.corridor_bedroom"');
        expect(html).toContain('name="s1.corridor_bathroom"');
    });
});

// §REMOVE-GLOBAL-PROGRAM (founder 2026-06-18) — the whole-house ApartmentProgram is now
// DERIVED from the per-level tabs. Counts = SUM of explicit per-level counts (auto level
// adds nothing — the engine fills it to the plate); each boolean = ON when ANY level sets
// it on; an all-auto / 1-storey form falls back to the engine's prior whole-house default.
describe('§REMOVE-GLOBAL-PROGRAM — whole-house program derived from per-level tabs', () => {
    it('1-storey (no tabs) falls back to the implicit ground default (1 bed / 1 bath / living + kitchen on)', () => {
        const state = parseHouseProgramFormState([{ name: 'storeys', value: '1' }]);
        expect(state.program.bedrooms).toBe(1);
        expect(state.program.bathrooms).toBe(1);
        expect(state.program.livingRoom).toBe(true);
        expect(state.program.includeKitchen).toBe(true);
        // No per-storey override on a tab-less 1-storey form.
        expect(state.perStoreyPrograms).toBeUndefined();
    });

    it('all-auto multi-storey form falls back to the scaled whole-house default (no regression for a user who never opens a tab)', () => {
        // 3 storeys, NOTHING overridden → the engine's prior default seed: 1 + 2×(n−1) beds.
        const state = parseHouseProgramFormState([{ name: 'storeys', value: '3' }]);
        expect(state.program.bedrooms).toBe(5);   // 1 + 2*2
        expect(state.program.bathrooms).toBe(3);  // clamp(1 + (3−1)) = 3
        // All booleans default ON (matches the removed DEFAULT_PROGRAM seed).
        expect(state.program.livingRoom).toBe(true);
        expect(state.program.includeKitchen).toBe(true);
        expect(state.program.masterEnSuite).toBe(true);
        expect(state.program.openPlanKitchenDining).toBe(true);
    });

    it('explicit per-level counts SUM into the whole-house total; auto level adds 0', () => {
        const state = parseHouseProgramFormState([
            { name: 'storeys', value: '3' },
            { name: 's0.bedrooms', value: '1' }, // ground explicit
            { name: 's1.bedrooms', value: '2' }, // first explicit
            // s2 (second) left on auto → contributes 0 to the seed
            { name: 's0.bathrooms', value: '1' },
        ]);
        expect(state.program.bedrooms).toBe(3);  // 1 + 2 + 0(auto)
        expect(state.program.bathrooms).toBe(1); // 1 + auto + auto
    });

    it('a boolean turned ON on ANY level makes the whole-house flag ON; OFF on all turns it off', () => {
        const onState = parseHouseProgramFormState([
            { name: 'storeys', value: '2' },
            { name: 's1.masterEnSuite', value: 'on' },  // first floor forces en-suite on
            { name: 's0.livingRoom', value: 'off' },    // ground forces living off
            { name: 's1.livingRoom', value: 'off' },    // first forces living off
        ]);
        expect(onState.program.masterEnSuite).toBe(true);
        // Living is explicitly OFF on every level that set it → whole-house off.
        expect(onState.program.livingRoom).toBe(false);
    });
});

// §FORCE-CORRIDOR-DIRECT (founder 2026-06-18) — the per-level "↔ Corridor" room toggles
// (`s{i}.corridor_<type>`) parse into `perStoreyPrograms[i].corridorDirectRoomTypes`, which
// the controller threads to the engine (HouseLayoutOptions.perStoreyOverrides). An unchecked
// toggle ⇒ NOT listed ⇒ engine decides (byte-identical). Exercised through the PURE
// `parseHouseProgramFormState` over the namespaced fields the tab HTML emits.
describe('§FORCE-CORRIDOR-DIRECT — s{i}.corridor_<type> toggle → perStoreyPrograms[i].corridorDirectRoomTypes', () => {
    const base = [
        { name: 'storeys', value: '2' },
        { name: 's0.corridor_living', value: 'on', checked: true },   // ground: living on the spine
        { name: 's1.corridor_bedroom', value: 'on', checked: true },  // first: bedroom on the spine
        { name: 's1.corridor_bathroom', value: 'on', checked: false },// unchecked → NOT listed
    ];

    it('checked toggles land in the storey override; unchecked are omitted', () => {
        const state = parseHouseProgramFormState(base);
        expect(state.perStoreyPrograms).toBeTruthy();
        expect(state.perStoreyPrograms![0]!.corridorDirectRoomTypes).toEqual(['living']);
        expect(state.perStoreyPrograms![1]!.corridorDirectRoomTypes).toEqual(['bedroom']);
        // The unchecked bathroom toggle is NOT in the list.
        expect(state.perStoreyPrograms![1]!.corridorDirectRoomTypes).not.toContain('bathroom');
    });

    it('NO corridor toggle checked ⇒ no corridorDirectRoomTypes field (byte-identical baseline)', () => {
        const none = base.map(f => (f.name.includes('.corridor_') ? { ...f, value: '', checked: false } : f));
        const state = parseHouseProgramFormState(none);
        // No storey carries a corridor override → either no perStoreyPrograms at all, or the
        // entries have no corridorDirectRoomTypes field.
        for (const ov of state.perStoreyPrograms ?? []) {
            expect(ov?.corridorDirectRoomTypes).toBeUndefined();
        }
    });
});
