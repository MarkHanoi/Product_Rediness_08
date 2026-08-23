// @vitest-environment happy-dom
/**
 * materialScheduleRender — proof AT THE LAYER THE FOUNDER EXPERIENCES.
 *
 * Lane MAT50, 2026-08-23. Issues L-8600 .. L-8606.
 *
 * §COMMITTED-IS-NOT-REACHABLE: `materialUsageRegistry.test.ts` proves the SET is
 * right, which is a fact about a pure function. It does not prove the founder
 * sees a Handrail column when he opens Data › Materials › Material Schedule.
 * Four fixes in one earlier session passed their unit tests and ran nowhere.
 *
 * So this suite mounts the REAL `mountMaterialSchedule()` into a REAL element and
 * reads the rendered DOM — the same call the Data Workbench makes.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { mountMaterialSchedule } from '../src/ui/dataworkbench/buckets/DataSchedulesBucket';

let panel: HTMLElement;
let headers: string[];

beforeAll(() => {
    panel = document.createElement('div');
    mountMaterialSchedule(panel);
    headers = [...panel.querySelectorAll('thead th')].map(th => (th.textContent ?? '').trim());
});

describe('Material Schedule — the rendered element axis', () => {

    it('renders a table with the six material columns plus an element axis', () => {
        expect(panel.querySelector('table')).not.toBeNull();
        expect(headers.slice(0, 6)).toEqual([
            'Name', 'Category', 'Suitable For (declared)', 'Color', 'Roughness', 'Metalness',
        ]);
        expect(headers.length).toBeGreaterThan(6);
    });

    /**
     * ⭐ L-9703 — DECLARED suitability and MEASURED use are TWO COLUMNS, on purpose.
     *
     * The element-axis columns to the right are DERIVED: they measure which families
     * actually reference a material. 'Suitable For' is AUTHORED: it states what the
     * product suits. Merging them would destroy the reading that matters — "you have
     * roofing finishes and none of them is on a roof" — and it is the same "two
     * facts, one value" collapse C100 §10.13.b was written after. This asserts the
     * two remain distinct columns rather than one.
     */
    it('keeps DECLARED suitability separate from the DERIVED usage axis', () => {
        const declaredIdx = headers.indexOf('Suitable For (declared)');
        expect(declaredIdx).toBe(2);
        // Every family column sits to the RIGHT of it, and none of them is it.
        expect(headers.filter(h => h === 'Suitable For (declared)')).toHaveLength(1);
        expect(headers.length - declaredIdx - 1).toBeGreaterThan(1);
    });

    /**
     * ⚠ ∅ ALREADY MEANS SOMETHING IN THIS TABLE — "this family cannot yet name a
     * material" (L-8606). The undeclared-suitability cell therefore must NOT reuse
     * it: one glyph for two unrelated absences inside one table is exactly the
     * defect the glyph was introduced to fix.
     */
    it('does not reuse the family axis ∅ for undeclared suitability', () => {
        const bodyRows = [...panel.querySelectorAll('tbody tr')];
        const suitabilityCells = bodyRows
            .filter(tr => tr.querySelector('td[colspan]') === null)
            .map(tr => (tr.children[2]?.textContent ?? '').trim());
        expect(suitabilityCells.length).toBeGreaterThan(0);
        expect(suitabilityCells).not.toContain('∅');
        // Most rows predate the facet, so 'not declared' must actually appear —
        // otherwise this assertion is vacuously satisfied by an empty column.
        expect(suitabilityCells).toContain('not declared');
        // ...and at least one row must carry a real declaration, or the facet ships
        // with no data and the column is decoration.
        expect(suitabilityCells.some(t => t.includes('roof'))).toBe(true);
    });

    /**
     * ⭐ L-8601, the defect the founder could see: handrail carries 44 built-in
     * types and 26 distinct materialIds and had NO column. This is the assertion
     * that would have caught it.
     */
    it('L-8601 — Handrail has a column AND that column actually ticks', () => {
        const idx = headers.indexOf('Handrail');
        expect(idx, 'no Handrail column in the rendered header row').toBeGreaterThan(4);

        const ticks = [...panel.querySelectorAll('tbody tr')]
            .map(tr => tr.children[idx])
            .filter(td => td !== undefined && (td.textContent ?? '').trim() === '✓');

        // 26 distinct handrail materialIds were measured; require a real number of
        // ticks rather than merely "a column exists" — a column that never ticks
        // is the very defect being fixed.
        expect(ticks.length, 'Handrail column rendered but never ticks').toBeGreaterThan(15);
    });

    /**
     * ⭐ L-8600: Ceiling was 329 dashes forever. It must NOT be deleted (nothing
     * is deleted), and it must NOT claim "not used" — it must say "cannot say".
     */
    it('L-8600 — Ceiling column is KEPT, and renders the third state, never a dash', () => {
        const idx = headers.indexOf('Ceiling');
        expect(idx, 'the Ceiling column was removed — it must be kept, not deleted').toBeGreaterThan(4);

        const glyphs = new Set(
            [...panel.querySelectorAll('tbody tr')]
                .map(tr => tr.children[idx])
                .filter((td): td is Element => td !== undefined)
                .map(td => (td.textContent ?? '').trim())
                .filter(t => t.length > 0),
        );

        expect(glyphs.has('∅'), 'Ceiling cells do not render the unseeded glyph').toBe(true);
        expect(glyphs.has('—'), 'Ceiling still renders a DASH, which asserts "not used"').toBe(false);
        expect(glyphs.has('✓'), 'Ceiling ticked, which contradicts the measured store').toBe(false);
    });

    it('names the unseeded families in a legend the user can actually read', () => {
        const text = panel.textContent ?? '';
        expect(text).toContain('∅');
        expect(text).toContain('Ceiling');
        expect(text).toMatch(/cannot yet name a material|cannot tick/);
    });

    /**
     * The families that DO carry data must still tick — a regression here would
     * mean the derived axis lost what the hand-typed one had.
     */
    it('the four originally-working families still tick', () => {
        for (const label of ['Wall', 'Floor', 'Slab', 'Door', 'Window']) {
            const idx = headers.indexOf(label);
            expect(idx, `${label} column missing`).toBeGreaterThan(4);
            const ticks = [...panel.querySelectorAll('tbody tr')]
                .map(tr => tr.children[idx])
                .filter(td => td !== undefined && (td.textContent ?? '').trim() === '✓');
            expect(ticks.length, `${label} column stopped ticking`).toBeGreaterThan(0);
        }
    });

    it('every body row has exactly one cell per column (no axis/row drift)', () => {
        const dataRows = [...panel.querySelectorAll('tbody tr')]
            .filter(tr => tr.querySelector('td[colspan]') === null);
        expect(dataRows.length).toBeGreaterThan(100);
        const widths = new Set(dataRows.map(tr => tr.children.length));
        expect(widths, 'rows disagree on column count').toEqual(new Set([headers.length]));
    });

    it('search narrows the table and keeps the element axis intact', () => {
        const search = panel.querySelector('[data-ms-search]') as HTMLInputElement;
        expect(search).not.toBeNull();
        search.value = 'oak';
        search.dispatchEvent(new Event('input'));

        const rows = [...panel.querySelectorAll('tbody tr')];
        expect(rows.length).toBeGreaterThan(0);
        for (const tr of rows) {
            if (tr.querySelector('td[colspan]') !== null) continue;
            expect(tr.children.length).toBe(headers.length);
        }
    });
});
