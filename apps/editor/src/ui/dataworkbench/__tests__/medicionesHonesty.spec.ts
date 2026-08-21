/**
 * §MEDICIONES (L-2000..L-2005) — DIFFERENTIATING suite for the four MEDICIONES
 * tabs, asserted at the DOM the user actually sees.
 *
 * The defect class this pins is the one the founder has been burned by
 * repeatedly: a tab that is authored, reachable, and incapable of holding an
 * answer — or worse, one that holds a plausible-looking answer it did not
 * derive. A unit test of `computeTakeoff()` cannot catch that, because the
 * failure lives in what the PANEL renders. So these mount the real panels into
 * a real DOM over a stubbed `window.wallStore` and read the rendered text.
 *
 * Every assertion below fails against the shape that shipped before:
 *   • the old AUDIT › Quantities panel rendered COLUMN IDS, never a quantity;
 *   • a gross wall area would print 15.00 where these demand 13.11;
 *   • an unpriced line printed as `0` would pass a "there is a number" check
 *     and fails "the words NO RATE are on screen and no total is shown".
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    mountTakeoffPanel,
    mountCostPanel,
    mountTimePanel,
    mountCarbonPanel,
} from '../buckets/MedicionesBucket';

type Win = typeof globalThis & Record<string, unknown>;

// One 5.000 × 3.000 wall with a single 0.900 × 2.100 door.
// Gross face 15.00 m² · void 1.89 m² · NET 13.11 m².
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

describe('MEDICIONES › Take-off — the tab measures, and says what it did not', () => {
    let panel: HTMLElement;

    beforeEach(() => {
        (globalThis as Win).wallStore = { getAll: () => WALLS };
        panel = mountPoint();
    });
    afterEach(() => {
        delete (globalThis as Win).wallStore;
        panel.remove();
    });

    it('the HEADLINE quantity is the NET area, and the gross is demoted to a secondary measure', () => {
        mountTakeoffPanel(panel, null);
        // The priced quantity — the big number on the right of the row.
        const headline = panel.querySelector('[style*="font-size:16px"]');
        expect(headline?.textContent?.trim()).toBe('13.11');
        // 15.00 is still ON the panel, but only as the "Gross face" chip: the
        // netting has to be checkable. What must never happen is 15.00 being the
        // number a cost is multiplied by.
        const text = panel.textContent ?? '';
        expect(text).toContain('Gross face');
        expect(text).toContain('15.00');
    });

    it('shows the deduction as its own measure, so the netting is checkable', () => {
        mountTakeoffPanel(panel, null);
        const text = panel.textContent ?? '';
        expect(text).toContain('Openings deducted');
        expect(text).toContain('1.89');
    });

    it('names the elements it measured — the row is traceable to the model', () => {
        mountTakeoffPanel(panel, null);
        expect(panel.textContent ?? '').toContain('wall-alpha');
    });

    it('states the measurement basis on the line itself', () => {
        mountTakeoffPanel(panel, null);
        expect(panel.textContent ?? '').toMatch(/openingOutline/);
    });

    it('renders the coverage table, so the sheet cannot read as complete', () => {
        mountTakeoffPanel(panel, null);
        const text = panel.textContent ?? '';
        expect(text).toContain('NOT MEASURED');
        expect(text).toContain('Foundations');
        expect(text).toContain('Electrical & HVAC');
    });

    it('reports the stores it could NOT read, rather than showing them as empty', () => {
        mountTakeoffPanel(panel, null);
        expect(panel.textContent ?? '').toMatch(/not reachable/i);
    });

    it('with NO stores at all it says so, and prints no quantity', () => {
        delete (globalThis as Win).wallStore;
        mountTakeoffPanel(panel, null);
        const text = panel.textContent ?? '';
        expect(text).toContain('Nothing to measure yet');
        expect(text).toContain('NOT MEASURED');
    });
});

describe('MEDICIONES › 5D Cost — no rate is not a zero, and no rate ships', () => {
    let panel: HTMLElement;

    beforeEach(() => {
        (globalThis as Win).wallStore = { getAll: () => WALLS };
        localStorage.clear();
        panel = mountPoint();
    });
    afterEach(() => {
        delete (globalThis as Win).wallStore;
        localStorage.clear();
        panel.remove();
    });

    it('prices NOTHING out of the box — PRYZM ships no rates', () => {
        mountCostPanel(panel, null);
        const text = panel.textContent ?? '';
        expect(text).toContain('NO RATE');
        expect(text).toContain('NO LINE IS PRICED');
        expect(text).toContain('PRYZM ships no rates');
    });

    it('renders an em dash where a total would go, never a currency figure', () => {
        mountCostPanel(panel, null);
        const total = panel.querySelector('[style*="font-size:20px"]');
        expect(total?.textContent?.trim()).toBe('—');
    });

    it('an unpriced line says it is EXCLUDED from the total, not that it costs nothing', () => {
        mountCostPanel(panel, null);
        expect(panel.textContent ?? '').toContain('not in the total');
    });

    it('offers a source field per rate, so an unattributed price is visible as one', () => {
        mountCostPanel(panel, null);
        expect(panel.querySelectorAll('[data-source-for]').length).toBeGreaterThan(0);
    });

    it('says where rates are stored and what that does NOT give you', () => {
        mountCostPanel(panel, null);
        const text = panel.textContent ?? '';
        expect(text).toContain('in this browser only');
        expect(text).toMatch(/not covered by undo/);
    });
});

describe('4D and 6D — NOT BUILT, said in the product', () => {
    let panel: HTMLElement;
    beforeEach(() => { panel = mountPoint(); });
    afterEach(() => { panel.remove(); });

    it('4D says NOT BUILT and renders no schedule', () => {
        mountTimePanel(panel);
        const text = panel.textContent ?? '';
        expect(text).toContain('NOT BUILT');
        expect(text).toMatch(/no schedule entity of any kind/i);
        // DIFFERENTIATING: a placeholder timeline with invented dates is exactly
        // what must never appear here.
        expect(panel.querySelectorAll('table').length).toBe(0);
    });

    it('6D says NOT BUILT and names the missing carbon factors', () => {
        mountCarbonPanel(panel);
        const text = panel.textContent ?? '';
        expect(text).toContain('NOT BUILT');
        expect(text).toMatch(/no carbon factors/i);
        expect(text).toMatch(/densit/i);
        // No kgCO2e figure may appear on a tab that cannot compute one.
        expect(text).not.toMatch(/\d[\d.,]*\s*(kgCO|tCO)/i);
    });

    it('both name the ADR that records the decision', () => {
        mountTimePanel(panel);
        expect(panel.textContent ?? '').toContain('ADR-0344');
        panel.innerHTML = '';
        mountCarbonPanel(panel);
        expect(panel.textContent ?? '').toContain('ADR-0344');
    });
});
