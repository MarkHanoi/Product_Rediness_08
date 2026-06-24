// @vitest-environment happy-dom
//
// §DOC-VIEWS-IN-DROPDOWN (2026-06-24) — guards the fix for "batch-created views
// don't appear in the split-view VIEWS DROPDOWN".
//
// Root cause: SplitViewManager populated its view-type <select> once at header
// build and only re-rendered on `vd:view-updated` (edits to the ACTIVE view) — it
// never listened for `vd:view-created` / `vd:view-deleted`. So per-level plans and
// building elevations created in a batch never showed up in the dropdown; it kept
// displaying the stale "Floor Plans: Ground Floor / Elevations: (none created)".
//
// The fix adds a vd:view-created/deleted/store-loaded listener that re-runs the
// populate fn while preserving the current selection. This test exercises the
// extracted pure helper against a fake "store-backed" populate fn that mirrors the
// dropdown's getByType grouping — proving a freshly-created plan + elevation surface
// under their category and that the displayed pane does not jump.

import { describe, it, expect, beforeEach } from 'vitest';
import { repopulateViewSelectPreservingSelection } from '../src/engine/views/viewSelectRepopulate.js';

interface FakeView { id: string; name: string; viewType: 'plan' | 'elevation' | 'ceiling-plan' | 'section' }

// A fake view store standing in for viewDefinitionStore.getByType().
let store: FakeView[] = [];

const DEFAULT_PLAN_ID = 'vd-sys-plan-default';

/** Mirror SplitViewManager._buildViewSelectOptions grouping (plan/RCP/section/elev). */
function populate(sel: HTMLSelectElement): void {
    sel.innerHTML = '';
    const addGroup = (label: string, views: FakeView[], placeholder: string) => {
        const group = document.createElement('optgroup');
        group.label = label;
        if (views.length === 0) {
            const opt = document.createElement('option');
            opt.value = ''; opt.textContent = placeholder; opt.disabled = true;
            group.appendChild(opt);
        } else {
            for (const v of views) {
                const opt = document.createElement('option');
                opt.value = v.id; opt.textContent = v.name;
                group.appendChild(opt);
            }
        }
        sel.appendChild(group);
    };
    let plans = store.filter(v => v.viewType === 'plan');
    if (plans.length === 0) plans = [{ id: DEFAULT_PLAN_ID, name: 'Ground Floor', viewType: 'plan' }];
    addGroup('Floor Plans', plans, '(none)');
    addGroup('Reflected Ceiling Plans', store.filter(v => v.viewType === 'ceiling-plan'), '(none created)');
    addGroup('Sections', store.filter(v => v.viewType === 'section'), '(none created)');
    addGroup('Elevations', store.filter(v => v.viewType === 'elevation'), '(none created)');
}

function optionValues(sel: HTMLSelectElement): string[] {
    return Array.from(sel.options).filter(o => !o.disabled).map(o => o.value);
}
function groupLabelFor(sel: HTMLSelectElement, value: string): string | null {
    for (const og of Array.from(sel.querySelectorAll('optgroup'))) {
        if (Array.from(og.children).some(o => (o as HTMLOptionElement).value === value)) {
            return (og as HTMLOptGroupElement).label;
        }
    }
    return null;
}

beforeEach(() => { store = []; });

describe('§DOC-VIEWS-IN-DROPDOWN — view dropdown repopulation', () => {
    it('surfaces a newly-created plan view under "Floor Plans"', () => {
        const sel = document.createElement('select');
        populate(sel);                       // initial: only default "Ground Floor"
        sel.value = DEFAULT_PLAN_ID;
        expect(optionValues(sel)).toEqual([DEFAULT_PLAN_ID]);

        // Batch creates a per-level plan, then the listener repopulates.
        store.push({ id: 'vd-doc-plan-lvl-1', name: 'Level 1 Plan', viewType: 'plan' });
        repopulateViewSelectPreservingSelection(sel, populate, DEFAULT_PLAN_ID);

        expect(optionValues(sel)).toContain('vd-doc-plan-lvl-1');
        expect(groupLabelFor(sel, 'vd-doc-plan-lvl-1')).toBe('Floor Plans');
    });

    it('surfaces the four building elevations under "Elevations"', () => {
        const sel = document.createElement('select');
        populate(sel);
        // Before: elevations group is the "(none created)" placeholder.
        expect(groupLabelFor(sel, 'vd-doc-elev-N')).toBeNull();

        for (const d of ['N', 'S', 'E', 'W']) {
            store.push({ id: `vd-doc-elev-${d}`, name: `${d} Elevation`, viewType: 'elevation' });
        }
        repopulateViewSelectPreservingSelection(sel, populate, DEFAULT_PLAN_ID);

        for (const d of ['N', 'S', 'E', 'W']) {
            expect(optionValues(sel)).toContain(`vd-doc-elev-${d}`);
            expect(groupLabelFor(sel, `vd-doc-elev-${d}`)).toBe('Elevations');
        }
    });

    it('preserves the current selection across a repopulate (pane does not jump)', () => {
        store.push({ id: 'vd-doc-elev-N', name: 'N Elevation', viewType: 'elevation' });
        const sel = document.createElement('select');
        populate(sel);
        sel.value = 'vd-doc-elev-N';          // user is viewing the N elevation

        // A new plan is created elsewhere; repopulate must keep the N elevation selected.
        store.push({ id: 'vd-doc-plan-lvl-2', name: 'Level 2 Plan', viewType: 'plan' });
        repopulateViewSelectPreservingSelection(sel, populate, DEFAULT_PLAN_ID);

        expect(sel.value).toBe('vd-doc-elev-N');
    });

    it('falls back to the plan view id when the previous selection was deleted', () => {
        store.push({ id: 'vd-doc-elev-N', name: 'N Elevation', viewType: 'elevation' });
        const sel = document.createElement('select');
        populate(sel);
        sel.value = 'vd-doc-elev-N';

        // The selected elevation is deleted; repopulate must fall back to the plan id.
        store = store.filter(v => v.id !== 'vd-doc-elev-N');
        repopulateViewSelectPreservingSelection(sel, populate, DEFAULT_PLAN_ID);

        expect(sel.value).toBe(DEFAULT_PLAN_ID);
    });
});
