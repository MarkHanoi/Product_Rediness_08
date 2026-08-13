// ─── PR-12 PROBE — "Schedules have no geometry subscription" is MEASURED, not read ───
//
// BIM30-GAP-REGISTER row PR-12 reads: *"Schedules have no geometry subscription —
// open panels show stale areas after a geometry change."* Its status column says
// **UNPROVEN**, and its own fix column says **"a subscription; verify the staleness
// first"**. Nobody had verified it: the row was classified BY-READ and never
// re-checked. This file is that verification, by EXECUTION.
//
// WHAT IS MEASURED (the subject is the PANEL, not the store)
// ─────────────────────────────────────────────────────────────────────────────
// `SchedulePanel` is constructed by `engineLauncher.ts:204` and is the surface an
// architect leaves open beside the model. Its only data source is
// `ScheduleExtractor.getRows(category)`, called exactly once per `render()`, and
// `render()` is reachable from exactly four places in the class:
//
//   1. `show(scheduleId)`                      — the user opens the panel
//   2. the Edit / Done button                  — a definition edit
//   3. `window 'sched:schedule-updated'`       — a DEFINITION change
//   4. `window 'sched:store-loaded'`           — a DEFINITION load
//
// Every one of those is about the schedule DEFINITION. None is a geometry signal.
//
// PROTOCOL (C78 §1.1 — DETERMINED-affected / DETERMINED-unaffected / UNDETERMINED)
//   A. open the panel, read the `Area (m²)` cell out of the live DOM
//   B. change the slab's geometry in the store the extractor reads
//   C. announce it with `bim-slab-updated` — the REAL event `SlabStore._emit`
//      dispatches (`packages/geometry-slab/src/SlabStore.ts:189`) — and nothing else
//   D. re-read the DOM. Unchanged ⇒ STALE.
//
// THE CONTROL THAT MAKES THE VERDICT MEAN SOMETHING (C70 §5.6): a later case calls
// `show()` again — the same extractor, same store, same instant — and the cell DOES
// move. That separates the two rival explanations that would otherwise both
// "confirm" a stale cell:
//   · the extractor cannot see the new geometry  → would still read stale
//   · the panel is never told to re-render        → reads fresh   ← THE DEFECT
// Without that control this file would prove nothing; with it, the missing link is
// named exactly: a subscription, and only a subscription.
//
// MEASURED SIDE-FINDING, recorded because it was nearly missed: an UNRELATED
// `sched:schedule-updated` (a schedule DEFINITION edit) does incidentally refresh
// the geometry numbers, because `render()` re-pulls the whole row set. So the
// staleness is real but *escapable by an unrelated action* — which is worse to
// diagnose in the field, not better: the same panel is sometimes right and
// sometimes wrong for reasons the user cannot see. Case `SIDE-FINDING` pins it.
//
// STAND-IN LEDGER, declared rather than buried: `window.slabStore` here is a
// two-method object (`getAll`, `getById`). That is the ENTIRE contract
// `ScheduleExtractor`'s Slabs branch consumes (`ScheduleExtractor.ts:423-442`
// calls `slabStore.getAll?.()` and nothing else), so no measured behaviour is
// faked — the real `SlabStore` would hand the extractor the same array. The
// authoritative-store fidelity question is Harness 1's, not this probe's.
//
// WHAT THIS PROBE DOES **NOT** COVER — do not let it read wider than it is:
//   · only the `Slabs Schedule` category. The other registry categories share the
//     same single `render()` chokepoint by construction, but they are NOT
//     separately executed here.
//   · it does not prove any OTHER panel is stale, and does not prove any panel is
//     fresh.
//   · it says nothing about whether a subscription, once added, would be correct
//     (scoping, per-view, undo) — only that today there is none.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { ScheduleRegistry } from '@pryzm/core-app-model';
import { SchedulePanel } from '../../ui/SchedulePanel/SchedulePanel';

const SCHEDULE_ID = 'Slabs Schedule';

interface SlabRec {
    id: string;
    levelId: string;
    thickness: number;
    polygon: Array<{ x: number; z: number }>;
    position: { x: number; y: number; z: number };
}

/** An axis-aligned rectangle → `w * d` m². */
function rect(w: number, d: number): Array<{ x: number; z: number }> {
    return [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
}

let slabs: SlabRec[];
let panel: SchedulePanel;

/** Read every `Area (m²)` cell currently painted in the panel's DOM. */
function areaCellsInDom(): string[] {
    const table = document.querySelector('.sched-panel .sched-table');
    if (!table) return [];
    const headers = Array.from(table.querySelectorAll('thead th .sched-th-label'))
        .map((el) => (el.textContent ?? '').trim());
    const areaIdx = headers.indexOf('Area (m²)');
    if (areaIdx < 0) return [];
    return Array.from(table.querySelectorAll('tbody tr')).map((tr) => {
        const tds = tr.querySelectorAll('td');
        return (tds[areaIdx]?.textContent ?? '').trim();
    });
}

/** Announce a geometry change exactly as production announces one — the events a
 *  slab edit actually dispatches, and nothing from the `sched:` definition family. */
function announceGeometryChange(slabId: string): void {
    window.dispatchEvent(new CustomEvent('bim-slab-updated', { detail: { id: slabId } }));
    window.dispatchEvent(new CustomEvent('bim-element-updated', { detail: { id: slabId } }));
    window.dispatchEvent(new CustomEvent('pryzm-geometry-changed', { detail: { id: slabId } }));
}

beforeAll(() => {
    ScheduleRegistry.registerDefaultSchedules();
    (window as unknown as Record<string, unknown>).slabStore = {
        getAll: () => slabs,
        getById: (id: string) => slabs.find((s) => s.id === id),
    };
    panel = new SchedulePanel(null);
});

beforeEach(() => {
    // Every case starts from the same authored geometry: 6 × 4 = 24.00 m².
    slabs = [{
        id: 'pr12-slab-1',
        levelId: 'L0',
        thickness: 0.25,
        polygon: rect(6, 4),
        position: { x: 0, y: 0, z: 0 },
    }];
});

afterAll(() => {
    delete (window as unknown as Record<string, unknown>).slabStore;
});

describe('PR-12 — SchedulePanel geometry subscription (measured, not read)', () => {
    it('MISCONFIGURED GUARD — the panel paints a real area before anything is changed', () => {
        panel.show(SCHEDULE_ID);
        const cells = areaCellsInDom();
        console.log('[PR-12 A] area cells at open = ' + JSON.stringify(cells));
        expect(cells, 'the probe never got a rendered table — nothing below would mean anything')
            .toEqual(['24.00']);
    });

    it('MEASURED: after a real geometry change + the real production event, the OPEN panel is STALE', () => {
        panel.show(SCHEDULE_ID);
        const before = areaCellsInDom();

        // B — the geometry genuinely changes: 6 × 4 = 24 m² → 10 × 4 = 40 m².
        slabs[0].polygon = rect(10, 4);

        // C — announce it the way production announces it.
        announceGeometryChange('pr12-slab-1');

        const after = areaCellsInDom();
        console.log('[PR-12 B/C/D] before=' + JSON.stringify(before) +
            ' | after geometry change + bim-slab-updated = ' + JSON.stringify(after) +
            ' | true area now = 40.00');

        // D — the verdict. This is the row's claim, now EXECUTED.
        expect(after, 'PR-12 measured: the open panel still shows the pre-change area')
            .toEqual(before);
        expect(after).toEqual(['24.00']);
    });

    it('CONTROL — the data IS fresh; only the re-render is missing (so "stale" names a subscription, not a read)', () => {
        panel.show(SCHEDULE_ID);
        expect(areaCellsInDom()).toEqual(['24.00']);

        slabs[0].polygon = rect(10, 4);
        announceGeometryChange('pr12-slab-1');
        expect(areaCellsInDom(), 'stale, as measured above').toEqual(['24.00']);

        // Same store, same extractor, same instant; the only difference is that
        // something finally called render().
        panel.show(SCHEDULE_ID);
        const afterExplicitRender = areaCellsInDom();
        console.log('[PR-12 CONTROL] area cells after an explicit show() = ' +
            JSON.stringify(afterExplicitRender));
        expect(afterExplicitRender,
            'if this were also 24.00 the defect would be in the extractor, not the subscription')
            .toEqual(['40.00']);
    });

    it('SIDE-FINDING — an unrelated DEFINITION event incidentally refreshes the geometry numbers', () => {
        // Not a mitigation. `render()` re-pulls everything, so a schedule-definition
        // edit silently repairs the stale geometry cell. The panel is therefore
        // sometimes right and sometimes wrong for reasons invisible to the user —
        // recorded so a future fix does not mistake this for an existing subscription.
        panel.show(SCHEDULE_ID);
        slabs[0].polygon = rect(10, 4);
        announceGeometryChange('pr12-slab-1');
        expect(areaCellsInDom()).toEqual(['24.00']);

        window.dispatchEvent(new CustomEvent('sched:schedule-updated', { detail: {} }));
        const afterDefinitionEvent = areaCellsInDom();
        console.log('[PR-12 SIDE-FINDING] after an unrelated sched:schedule-updated = ' +
            JSON.stringify(afterDefinitionEvent));
        expect(afterDefinitionEvent).toEqual(['40.00']);
    });

    it('FALSIFIABILITY — the DOM reader reports a change when there is one', () => {
        // The comparator used above is `areaCellsInDom()`. If it were blind — a
        // wrong selector, a wrong column index — every run would report "stale"
        // whatever happened, and the measurement would be worthless. Plant a real
        // divergence and require the reader to see it.
        panel.show(SCHEDULE_ID);
        const seen1 = areaCellsInDom();
        slabs[0].polygon = rect(3, 2);      // 6.00 m²
        panel.show(SCHEDULE_ID);            // re-render
        const seen2 = areaCellsInDom();
        console.log('[PR-12 FALSIFY] reader saw ' + JSON.stringify(seen1) +
            ' then ' + JSON.stringify(seen2));
        expect(seen1).toEqual(['24.00']);
        expect(seen2).toEqual(['6.00']);
        expect(seen2).not.toEqual(seen1);
    });

    it('STRUCTURAL — the panel subscribes to DEFINITION events only; no geometry signal is listened for', async () => {
        // The behavioural verdict above is confirmed at the source: the class
        // registers exactly two window listeners, both `sched:` definition events.
        // If a geometry subscription is ever added, this assertion goes RED and
        // must be re-stated — which is the point.
        const fs = await import('node:fs');
        const path = await import('node:path');
        const src = fs.readFileSync(
            path.resolve(__dirname, '../../ui/SchedulePanel/SchedulePanel.ts'), 'utf8');
        const listeners = [...src.matchAll(/window\.addEventListener\(\s*'([^']+)'/g)]
            .map((m) => m[1]).sort();
        console.log('[PR-12 STRUCTURAL] window listeners in SchedulePanel = ' +
            JSON.stringify(listeners));
        expect(listeners).toEqual(['sched:schedule-updated', 'sched:store-loaded']);
        expect(listeners.some((l) => /bim-|geometry|element-updated/.test(l)),
            'a geometry subscription would appear here').toBe(false);
    });
});
