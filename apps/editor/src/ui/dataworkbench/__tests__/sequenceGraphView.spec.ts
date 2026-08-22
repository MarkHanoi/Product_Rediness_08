/**
 * §SEQUENCE-GRAPH (L-6300..L-6330) — the derived sequence drawn as a DEPENDENCY
 * GRAPH, asserted at the DOM the founder actually sees.
 *
 * ⭐ THE DEFECT CLASS THIS PINS is narrow and specific: a picture that LOOKS like
 * a programme. The 4D tab's refusals (no output rates, no invented durations,
 * MEASURES NOTHING kept visible, unmeasured trades named) were founder-ratified
 * decisions, and the easiest way to lose all four at once is to render the same
 * data through a new view that quietly drops the caveats. So the assertions that
 * matter most below are the ones that fail if the graph ever grows a time axis,
 * a duration, a critical path, or a silent omission.
 *
 * These mount the REAL 4D panel over a stubbed `window.wallStore`, click the real
 * view switch, and read the rendered DOM.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountTimePanel } from '../buckets/MedicionesTimeCarbon';

type Win = typeof globalThis & Record<string, unknown>;

// One 5.000 × 3.000 wall with a single 0.900 × 2.100 door, on level L0.
const WALLS = [{
    id: 'wall-alpha',
    type: 'wall',
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
    height: 3,
    thickness: 0.2,
    baseOffset: 0,
    levelId: 'L0',
    childrenIds: [],
    openings: [{
        id: 'op-1', elementId: 'door-beta', type: 'door', doorType: 'single',
        offset: 2, width: 0.9, height: 2.1, sillHeight: 0,
    }],
}];

function mountPoint(): HTMLElement {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
}

/** Click the "Execution graph" switch on the real panel. */
function showGraph(panel: HTMLElement): void {
    const btn = panel.querySelector<HTMLButtonElement>('[data-seq-view="graph"]');
    expect(btn, 'the Execution graph switch must exist on the 4D tab').not.toBeNull();
    btn!.click();
}

describe('MEDICIONES › 4D Time › Execution graph — the switch', () => {
    let panel: HTMLElement;

    beforeEach(() => {
        (globalThis as Win).wallStore = { getAll: () => WALLS };
        panel = mountPoint();
    });
    afterEach(() => {
        delete (globalThis as Win).wallStore;
        panel.remove();
    });

    it('⭐ LIST IS THE DEFAULT — a new view must not take away the one he uses', () => {
        mountTimePanel(panel, null);
        expect(panel.querySelector('[data-seq-view="list"]')?.getAttribute('aria-pressed')).toBe('true');
        expect(panel.querySelector('[data-seq-view="graph"]')?.getAttribute('aria-pressed')).toBe('false');
        expect(panel.querySelector('[data-seq-graph]')).toBeNull();
    });

    it('both views are reachable, and the list comes back', () => {
        mountTimePanel(panel, null);
        showGraph(panel);
        expect(panel.querySelector('[data-seq-graph]')).not.toBeNull();

        panel.querySelector<HTMLButtonElement>('[data-seq-view="list"]')!.click();
        expect(panel.querySelector('[data-seq-graph]')).toBeNull();
        // The list's own affordance is back.
        expect(panel.textContent ?? '').toContain('Adopt as task');
    });

    it('⛔ THERE IS NO SECOND TAB CALLED 6D — the graph is a view, not a dimension', () => {
        mountTimePanel(panel, null);
        // The switch labels name what the view IS.
        const labels = [...panel.querySelectorAll('[data-seq-view]')].map((b) => b.textContent?.trim());
        expect(labels).toEqual(['List', 'Execution graph']);
        expect(labels.join(' ')).not.toContain('6D');
    });
});

describe('MEDICIONES › 4D Time › Execution graph — what it refuses to draw', () => {
    let panel: HTMLElement;

    beforeEach(() => {
        (globalThis as Win).wallStore = { getAll: () => WALLS };
        panel = mountPoint();
        mountTimePanel(panel, null);
        showGraph(panel);
    });
    afterEach(() => {
        delete (globalThis as Win).wallStore;
        panel.remove();
    });

    it('⭐ ALL FOUR REFUSALS ARE ON SCREEN, above the picture', () => {
        const text = panel.querySelector('[data-seq-refusals]')?.textContent ?? '';
        expect(text).toContain('DEPENDENCY GRAPH, not a programme');
        expect(text).toContain('no time axis');
        expect(text).toContain('output rate');
        expect(text).toContain('DEPENDENCY DEPTH');
        expect(text).toContain('critical path');
    });

    it('the SVG announces the absence of a time axis to a screen reader too', () => {
        const svg = panel.querySelector('svg[role="img"]');
        expect(svg).not.toBeNull();
        const label = svg!.getAttribute('aria-label') ?? '';
        expect(label).toContain('no time axis');
        expect(label).toContain('no activity has a duration or a date');
    });

    /**
     * ⚠ CORRECTED ASSERTION (L-6306). This first read "the words 'critical path'
     * appear ONLY inside [data-seq-refusals]" and went RED — CORRECTLY, and
     * against the TEST, not the product. The phrase also occurs in the sequence's
     * OWN `coverageStatement`, which is rendered above the switch and is itself a
     * refusal ("Nothing here is a forward pass, a float or a critical path").
     * Two refusals is not a defect. The real invariant is that the phrase never
     * appears as an AFFORDANCE — nothing offers to compute one.
     */
    it('⛔ "critical path" is only ever REFUSED, never offered as a feature', () => {
        const refusals = panel.querySelector('[data-seq-refusals]')?.textContent ?? '';
        expect(refusals).toContain('critical path');
        // No control anywhere on the tab offers it.
        const controls = [...panel.querySelectorAll('button, [role="button"], a, input, select, summary')];
        for (const c of controls) {
            expect((c.textContent ?? '').toLowerCase()).not.toContain('critical path');
        }
        // Wherever it appears, it appears negated.
        const all = panel.textContent ?? '';
        for (const seg of all.split('critical path').slice(0, -1)) {
            expect(seg.slice(-90).toLowerCase()).toMatch(/nothing|no |not |never/);
        }
    });

    /**
     * ⚠ CORRECTED ASSERTION (L-6307). This first banned the word "days" from the
     * drawing entirely and went RED — again against the TEST. `durationNote` is
     * the REFUSAL itself and contains "the number of days is the one input only
     * you can source"; banning the word would delete the refusal to keep the test
     * green, which is precisely backwards. What must never appear is a COMPUTED
     * quantity of time: a NUMBER attached to a day, a week or a date.
     */
    it('⛔ no COMPUTED duration, date or day-count is printed on the graph', () => {
        const svgText = panel.querySelector('svg')!.textContent ?? '';
        expect(svgText).not.toMatch(/\d+(\.\d+)?\s*(day|days|week|weeks|month|months)\b/i);
        expect(svgText).not.toMatch(/\d{4}-\d{2}-\d{2}/);
        expect(svgText).not.toMatch(/\bfloat\b/i);
        // And the refusal that mentions "days" is still there, in full.
        expect(svgText).toContain('the number of days is the one input only you can source');
    });

    it('the ring note names the rings DEPENDENCY DEPTH and denies they are time', () => {
        const text = panel.querySelector('[data-seq-graph]')?.textContent ?? '';
        expect(text).toContain('DEPENDENCY DEPTH');
        expect(text).toContain('not weeks, dates or phases');
    });
});

describe('MEDICIONES › 4D Time › Execution graph — what it does draw', () => {
    let panel: HTMLElement;

    beforeEach(() => {
        (globalThis as Win).wallStore = { getAll: () => WALLS };
        panel = mountPoint();
        mountTimePanel(panel, null);
        showGraph(panel);
    });
    afterEach(() => {
        delete (globalThis as Win).wallStore;
        panel.remove();
    });

    it('draws a node per activity, and the list and the graph agree on the count', () => {
        const nodes = panel.querySelectorAll('svg g[role="button"]');
        expect(nodes.length).toBeGreaterThan(0);
        // The header count is rendered from the same `seq.activities`.
        expect(panel.textContent ?? '').toContain(`${nodes.length} activities`);
    });

    it('⭐ EDGES ARE CURVED — the founder asked for a mind map, not a flowchart', () => {
        const paths = [...panel.querySelectorAll<SVGPathElement>('svg path[d]')];
        expect(paths.length).toBeGreaterThan(0);
        // A cubic Bézier. A straight edge would be an L or a bare M..L.
        for (const p of paths) expect(p.getAttribute('d')).toContain(' C ');
    });

    it('⭐ EVERY EDGE CARRIES ITS "WHY" — the reasoning is the deliverable', () => {
        const titles = [...panel.querySelectorAll('svg path > title')];
        expect(titles.length).toBeGreaterThan(0);
        for (const t of titles) {
            expect(t.textContent ?? '').toContain('WHY:');
            // Non-empty reason, not just the label.
            expect((t.textContent ?? '').split('WHY:')[1]!.trim().length).toBeGreaterThan(0);
        }
    });

    it('MEASURES NOTHING is drawn, labelled, and NOT shrunk to nothing', () => {
        const svg = panel.querySelector('svg')!;
        expect(svg.textContent ?? '').toContain('MEASURES NOTHING');
        // ⛔ The honesty marker must never be encoded as size. The substructure
        // node is the LARGEST node on the drawing, not the smallest.
        const radii = [...svg.querySelectorAll<SVGCircleElement>('g[role="button"] circle')]
            .map((c) => Number(c.getAttribute('r')));
        const dashed = [...svg.querySelectorAll<SVGCircleElement>('g[role="button"] circle')]
            .filter((c) => c.getAttribute('stroke-dasharray'));
        expect(dashed.length).toBe(1);
        expect(Number(dashed[0]!.getAttribute('r'))).toBe(Math.max(...radii));
    });

    it('⛔ unmeasured trades are NAMED as an absence, never drawn as empty nodes', () => {
        const text = panel.querySelector('[data-seq-refusals]')?.textContent ?? '';
        // The fixture measures walls and a door; several families are NOT measured.
        expect(text).toContain('NOT MEASURED');
        expect(text).toContain('not as a node, and not as a node of size zero');
    });

    it('the legend colours by TRADE and every node also carries its stage as text', () => {
        const svg = panel.querySelector('svg')!;
        const nodeLabels = [...svg.querySelectorAll('g[role="button"] text')]
            .map((t) => t.textContent ?? '');
        expect(nodeLabels.some((l) => l.length > 0)).toBe(true);
        // Colour is never the only channel: a label exists for every node.
        const nodes = svg.querySelectorAll('g[role="button"]');
        expect(nodeLabels.length).toBeGreaterThanOrEqual(nodes.length);
    });
});

describe('MEDICIONES › 4D Time › Execution graph — selection dims the rest', () => {
    let panel: HTMLElement;

    beforeEach(() => {
        (globalThis as Win).wallStore = { getAll: () => WALLS };
        panel = mountPoint();
        mountTimePanel(panel, null);
        showGraph(panel);
    });
    afterEach(() => {
        delete (globalThis as Win).wallStore;
        panel.remove();
    });

    it('⭐ picking a node lights it and makes the rest DORMANT, not gone', () => {
        const host = panel.querySelector<HTMLElement>('[data-seq-graph]')!;
        const node = panel.querySelector<SVGGElement>('svg g[role="button"]')!;
        node.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        // The shared Analysis mechanism, reused verbatim — one definition of "dormant".
        expect(host.classList.contains('anl-focus-on')).toBe(true);
        expect(node.classList.contains('anl-focused')).toBe(true);

        // ⛔ DORMANT, NOT GONE. Nothing is removed or hidden.
        const marks = host.querySelectorAll('[data-series]');
        expect(marks.length).toBeGreaterThan(1);
        for (const m of marks) {
            expect((m as HTMLElement).style.display).not.toBe('none');
            expect((m as HTMLElement).style.visibility).not.toBe('hidden');
        }
    });

    it('picking a node explains it, including its dependencies and the duration refusal', () => {
        const node = panel.querySelector<SVGGElement>('svg g[role="button"]')!;
        node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const strip = panel.querySelector('[data-seq-explain]')!.textContent ?? '';
        expect(strip).toContain('duration: none');
        expect(strip).toContain('output rate');
    });

    it('picking an EDGE explains WHY that dependency exists', () => {
        const edge = panel.querySelector<SVGPathElement>('svg path[d]')!;
        edge.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const strip = panel.querySelector('[data-seq-explain]')!.textContent ?? '';
        expect(strip).toContain('follows');
        expect(strip).toContain('why:');
    });

    it('every node is keyboard reachable — a graph only a mouse can drive is half a view', () => {
        for (const g of panel.querySelectorAll('svg g[role="button"]')) {
            expect(g.getAttribute('tabindex')).toBe('0');
            expect((g.getAttribute('aria-label') ?? '').length).toBeGreaterThan(0);
        }
    });
});
