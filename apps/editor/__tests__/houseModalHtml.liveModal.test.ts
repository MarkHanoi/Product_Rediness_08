// §LIVE-MODAL (SPEC-LIVE-SINGLE-OPTION-LAYOUT-MODAL) — house modal pure-HTML +
// bubble-graph interactive-option tests. Node env (no DOM): the builders are pure
// string functions, so we assert on the emitted markup.

import { describe, expect, it } from 'vitest';
import {
    buildHouseModalHtml,
    buildHouseCardGridHtml,
} from '../src/ui/house-layout/houseModalHtml.js';
import { buildHouseCardModel } from '../src/ui/house-layout/houseCardModel.js';
import { buildLayoutBubbleGraphSvg } from '../src/ui/apartment-layout/layoutBubbleGraph.js';
import type { LayoutOption, ScoredLayoutOption, ScoredHouseLayoutOption } from '@pryzm/ai-host';

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
