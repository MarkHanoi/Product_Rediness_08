/**
 * §REGIONAL-BUILDING-COST (L-9100..L-9107, lane RATE53) — THE PROOF AT THE LAYER
 * THE FOUNDER EXPERIENCES.
 *
 * ⭐ WHY THIS FILE EXISTS SEPARATELY FROM `medicionesHonesty.spec.ts`.
 * §COMMITTED-IS-NOT-REACHABLE: four fixes in one session once passed their unit
 * tests and ran nowhere. `RegionalBuildingCost.test.ts` proves the MODEL — that
 * 1.428,96 × 120 is 171.475,20 and that the licence gate is green. It cannot
 * prove the thing the founder actually asked for, which is *"I open 5D Cost on my
 * Barcelona project and I see an estimate with its source named."*
 *
 * That sentence has five separate failure points the model test cannot see: the
 * parcel must resolve to a jurisdiction, the jurisdiction must reach the module,
 * the take-off must yield an area, the typology must persist, and the number must
 * reach the DOM. This file mounts the REAL panel over a stubbed jurisdiction and
 * a stubbed slab store and reads the rendered text.
 *
 * ⚠ `resolveCostJurisdiction` is mocked because the harness has no site
 * subsystem — NOT to fake the answer. The value it returns is the exact literal
 * `resolveRegisteredJurisdictionAt()` produces for a Barcelona parcel,
 * `'es-08019-barcelona'` (see `packages/site-parcel-data/src/rulepacks/
 * registry.ts:398`). If that literal ever changes, this test goes green while the
 * product breaks — which is why `RegionalBuildingCost.test.ts` pins the SAME
 * string on the model side, and why the key is written out here rather than
 * imported from the module under test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The one seam stubbed: geography. Everything downstream is the real code.
vi.mock('../buckets/resolveCostJurisdiction', () => ({
    currentCostJurisdiction: () => ({
        jurisdictionId: 'es-08019-barcelona',
        countryCode: 'es',
        regionKey: null,
        resolution: 'resolved' as const,
    }),
    costJurisdictionDiagLine: () => '[test] barcelona',
}));

import { mountCostPanel } from '../buckets/MedicionesBucket';

type Win = typeof globalThis & Record<string, unknown>;

/** Two 10 × 6 m slabs = 120 m² of plan area, 200 mm thick. */
const SLABS = [
    { id: 'slab-l0', materialId: 'concrete-smooth', thickness: 0.2, levelId: 'L0',
      polygon: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 6 }, { x: 0, z: 6 }] },
    { id: 'slab-l1', materialId: 'concrete-smooth', thickness: 0.2, levelId: 'L1',
      polygon: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 6 }, { x: 0, z: 6 }] },
];

const CHOICE_KEY = 'pryzm.mediciones.buildingGroup.unscoped';

function mountPoint(): HTMLElement {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
}

describe('5D Cost › the Barcelona building estimate, on the panel', () => {
    let panel: HTMLElement;

    beforeEach(() => {
        (globalThis as Win).slabStore = { getAll: () => SLABS };
        localStorage.clear();
        panel = mountPoint();
    });
    afterEach(() => {
        delete (globalThis as Win).slabStore;
        localStorage.clear();
        panel.remove();
    });

    it('names the source instrument, its edition and its price date — before any figure', () => {
        mountCostPanel(panel, null);
        const text = panel.textContent ?? '';
        expect(text).toContain('Regional building estimate');
        expect(text).toContain('Ordenança fiscal núm. 2.1');
        expect(text).toContain('Ajuntament de Barcelona');
        expect(text).toContain('2026-02-02');
        expect(text).toContain('BOPB CVE 202610021075');
        // ⭐ The published table itself is a real, cited regional answer, and it
        // is on screen even with no typology chosen.
        expect(text).toContain('866.04');
    });

    it('⛔ shows NO figure until the building type is chosen, and says why', () => {
        // DIFFERENTIATING: an implementation that defaulted the typology would
        // render a number here, and it would be a guess with a legal citation
        // attached. Barcelona's table spans 259,81 to 2.381,61 €/m².
        mountCostPanel(panel, null);
        expect(panel.querySelector('[data-building-estimate]')).toBeNull();
        expect(panel.textContent ?? '').toContain('CHOOSE THE BUILDING TYPE');
        const select = panel.querySelector<HTMLSelectElement>('[data-building-group]');
        expect(select).not.toBeNull();
        expect(select!.value).toBe('');
    });

    it('⭐⭐ THE FOUNDER’S SENTENCE — with the type chosen, the figure is on screen with its source', () => {
        // Group V (dwellings 90–130 m²) = 1.428,96 €/m². 2 slabs x 60 m² = 120 m².
        // 1428.96 x 120 = 171,475.20 — computed by hand, not read from the code.
        localStorage.setItem(CHOICE_KEY, JSON.stringify({ groupId: 'V', correctionId: null }));
        mountCostPanel(panel, null);

        const figure = panel.querySelector('[data-building-estimate]');
        expect(figure).not.toBeNull();
        expect(figure!.textContent).toContain('171,475.20');

        const text = panel.textContent ?? '';
        expect(text).toContain('1,428.96');
        expect(text).toContain('120.00');
        expect(text).toContain('Estimate — not a price');
    });

    it('applies the published correction factor, and names it', () => {
        // 1428.96 x 0.4 = 571.58; 571.58 x 120 = 68,589.60.
        localStorage.setItem(CHOICE_KEY, JSON.stringify({ groupId: 'V', correctionId: 'interior-reform' }));
        mountCostPanel(panel, null);
        expect(panel.querySelector('[data-building-estimate]')!.textContent).toContain('68,589.60');
        expect(panel.textContent ?? '').toMatch(/correction for interior reform/i);
    });

    it('⛔ the PRICED TOTAL is still an em dash — the estimate is not money in the total', () => {
        // ⭐ THE ASSERTION THAT KEEPS THE FEATURE FROM BECOMING A LIE. A large
        // amber number sits on the panel; the priced total must remain empty,
        // because the user has typed no rate.
        localStorage.setItem(CHOICE_KEY, JSON.stringify({ groupId: 'V', correctionId: null }));
        mountCostPanel(panel, null);
        const total = panel.querySelector('[style*="font-size:20px"]');
        expect(total?.textContent?.trim()).toBe('—');
        expect(panel.textContent ?? '').toContain('NO LINE IS PRICED');
        expect(panel.textContent ?? '').toContain('THIS IS AN ESTIMATE AND IT IS NOT IN THE PRICED TOTAL');
    });

    it('states that the area is a PROXY, and which take-off lines it came from', () => {
        localStorage.setItem(CHOICE_KEY, JSON.stringify({ groupId: 'V', correctionId: null }));
        mountCostPanel(panel, null);
        const text = panel.textContent ?? '';
        expect(text).toMatch(/plan area of 1 measured slab line|plan area of \d+ measured slab lines/);
        expect(text).toMatch(/proxy/i);
        expect(text).toMatch(/does not compute superfície construïda/i);
    });

    it('lists what the €/m² EXCLUDES — or it is read as a project cost', () => {
        localStorage.setItem(CHOICE_KEY, JSON.stringify({ groupId: 'V', correctionId: null }));
        mountCostPanel(panel, null);
        const text = panel.textContent ?? '';
        expect(text).toMatch(/does NOT include/);
        expect(text).toMatch(/VAT/);
        expect(text).toMatch(/honoraris dels professionals|Professional fees/);
        expect(text).toMatch(/benefici empresarial/);
        // ⭐ The sentence that stops a fiscal reference being quoted as a tender.
        expect(text).toMatch(/administrative fiscal reference/i);
    });

    it('⛔ REFUSES when nothing measured an area, rather than showing a zero', () => {
        delete (globalThis as Win).slabStore;
        localStorage.setItem(CHOICE_KEY, JSON.stringify({ groupId: 'V', correctionId: null }));
        mountCostPanel(panel, null);
        const text = panel.textContent ?? '';
        // With no stores at all the take-off yields no lines and the panel takes
        // its "nothing to price" arm — the point is that no figure is invented.
        expect(panel.querySelector('[data-building-estimate]')).toBeNull();
        expect(text).not.toContain('0.00 EUR');
    });

    it('⛔ shows no figure when the area exists but the typology was cleared', () => {
        localStorage.setItem(CHOICE_KEY, JSON.stringify({ groupId: null, correctionId: null }));
        mountCostPanel(panel, null);
        expect(panel.querySelector('[data-building-estimate]')).toBeNull();
    });
});
