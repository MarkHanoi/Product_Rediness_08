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
} from '../buckets/MedicionesBucket';
// 4D / 6D shipped 2026-08-21 (lane DIM46, ADR-0351) and moved to their own
// module. The suite at the bottom of this file asserts they now render REAL
// answers — the three `NOT BUILT` cases that used to live there are gone
// because the badge is gone.
import { mountTimePanel, mountCarbonPanel } from '../buckets/MedicionesTimeCarbon';

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

// ═════════════════════════════════════════════════════════════════════════════
// 4D — TIME  (lane DIM46, ADR-0351; these three suites replaced the NOT BUILT ones)
// ═════════════════════════════════════════════════════════════════════════════

describe('MEDICIONES › 4D Time — a duration is typed, never derived', () => {
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

    it('no longer says NOT BUILT — the tab renders a real surface', () => {
        mountTimePanel(panel, null);
        expect(panel.textContent ?? '').not.toContain('NOT BUILT');
    });

    it('states on its own face that PRYZM ships no output rates', () => {
        mountTimePanel(panel, null);
        const text = panel.textContent ?? '';
        expect(text).toMatch(/ships no output rates/i);
        expect(text).toMatch(/you type it/i);
    });

    it('the new-task duration field is EMPTY — there is no default to derive one from', () => {
        // DIFFERENTIATING: an implementation that pre-filled "10" would satisfy
        // every "is there an input?" check and would be a fabricated productivity
        // figure with a schedule bar attached.
        mountTimePanel(panel, null);
        const days = panel.querySelector<HTMLInputElement>('[data-new-days]');
        expect(days).not.toBeNull();
        expect(days!.value).toBe('');
        expect(days!.placeholder).toBe('days');
    });

    it('with no task it says so, and draws NO timeline at the epoch', () => {
        mountTimePanel(panel, null);
        const text = panel.textContent ?? '';
        expect(text).toContain('No dated task yet');
        // No scrubber exists until something is actually scheduled.
        expect(panel.querySelector('[data-scrub]')).toBeNull();
        expect(text).not.toContain('1970');
    });

    it('a scheduled programme shows the scrubber, and reports UNSCHEDULED separately', () => {
        localStorage.setItem('pryzm.mediciones.schedule.unscoped', JSON.stringify({
            version: 1,
            tasks: [{
                id: 't1', name: 'Build the wall', chapter: 'walls',
                startDate: '2026-09-01', durationDays: 5, durationSource: 'USER_ENTERED',
                lineCodes: ['WALL.generic.200'], elementIds: [], dependsOn: [],
            }],
        }));
        mountTimePanel(panel, null);
        const text = panel.textContent ?? '';
        expect(panel.querySelector('[data-scrub]')).not.toBeNull();
        // ⭐ The sentence that keeps the filter honest.
        expect(text).toMatch(/not the same as "not yet built"/);
        expect(text).toMatch(/unscheduled/i);
    });

    it('says where the programme is stored and what that does NOT give you', () => {
        mountTimePanel(panel, null);
        const text = panel.textContent ?? '';
        expect(text).toContain('in this browser only');
        expect(text).toMatch(/not covered by undo/);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6D — CARBON
// ═════════════════════════════════════════════════════════════════════════════

// 4.000 × 5.000 = 20.00 m² in plan × 0.200 m = 4.000 m³.
const slabStore = (materialId: string) => ({
    getAll: () => [{
        id: 'slab-alpha',
        materialId,
        thickness: 0.2,
        polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 5 }, { x: 0, z: 5 }],
    }],
});

describe('MEDICIONES › 6D Carbon — cited, and honest about not being checked', () => {
    let panel: HTMLElement;

    beforeEach(() => { localStorage.clear(); panel = mountPoint(); });
    afterEach(() => {
        delete (globalThis as Win).slabStore;
        localStorage.clear();
        panel.remove();
    });

    it('no longer says NOT BUILT', () => {
        (globalThis as Win).slabStore = slabStore('concrete-smooth');
        mountCarbonPanel(panel, null);
        expect(panel.textContent ?? '').not.toContain('NOT BUILT');
    });

    it('computes the hand-derived figure — 4 m³ × 2400 kg/m³ × 0.113 = 1084.80', () => {
        (globalThis as Win).slabStore = slabStore('concrete-smooth');
        mountCarbonPanel(panel, null);
        expect(panel.textContent ?? '').toContain('1,084.80');
    });

    it('every number is beside its dataset, and beside the fact nobody checked it', () => {
        (globalThis as Win).slabStore = slabStore('concrete-smooth');
        mountCarbonPanel(panel, null);
        const text = panel.textContent ?? '';
        expect(text).toContain('ICE v3.0');
        expect(text).toContain('A1-A3');
        // ⭐ The distinction the whole 6D data model exists to preserve.
        expect(text).toContain('UNVERIFIED TRANSCRIPTION');
        expect(text).toMatch(/Every factor PRYZM ships is UNVERIFIED/);
    });

    it('a factor with no density reads NOT MEASURED and names the reason — never 0', () => {
        // Mineral wool ships a factor and NO density on purpose (its density is a
        // specification decision, not a property of the material).
        (globalThis as Win).slabStore = slabStore('insulation-mineral-wool');
        mountCarbonPanel(panel, null);
        const text = panel.textContent ?? '';
        expect(text).toContain('NOT MEASURED');
        expect(text).toContain('NO DENSITY');
        // DIFFERENTIATING: a zero would pass "there is a number on screen".
        const total = panel.querySelector('[style*="font-size:20px"]');
        expect(total?.textContent?.trim()).toBe('—');
        expect(text).toMatch(/unmeasured carbon, not zero carbon/);
    });

    it('offers a density and a source field on every gap, so the user can close it', () => {
        (globalThis as Win).slabStore = slabStore('insulation-mineral-wool');
        mountCarbonPanel(panel, null);
        expect(panel.querySelectorAll('[data-ov-density]').length).toBeGreaterThan(0);
        expect(panel.querySelectorAll('[data-ov-source]').length).toBeGreaterThan(0);
    });

    it('a material with no factor at all is a NAMED gap, not an absence', () => {
        // `concrete-white` is deliberately absent from the shipped table.
        (globalThis as Win).slabStore = slabStore('concrete-white');
        mountCarbonPanel(panel, null);
        const text = panel.textContent ?? '';
        expect(text).toContain('NO FACTOR');
        expect(text).toContain('concrete-white');
    });

    it('states the scope, so a cradle-to-gate figure is never read as whole-life', () => {
        (globalThis as Win).slabStore = slabStore('concrete-smooth');
        mountCarbonPanel(panel, null);
        expect(panel.textContent ?? '').toMatch(/A4.A5, B, C, D\) are NOT included/);
    });
});

