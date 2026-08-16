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

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
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

    it('BEHAVIOURAL: after a real geometry change + the real production event, the OPEN panel REFRESHES', () => {
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

        // D — the verdict. RE-STATED at the fix (PR-12): this assertion used to read
        // `toEqual(before)` / `['24.00']`, which PINNED THE DEFECT rather than the
        // behaviour — it was green precisely because the panel was wrong. It is now
        // stated as the behaviour an architect is owed: the open panel shows the
        // area the model actually has.
        expect(before, 'the pre-change reading the refresh has to move off').toEqual(['24.00']);
        expect(after, 'PR-12: the open panel must not keep painting the pre-change area')
            .not.toEqual(before);
        expect(after).toEqual(['40.00']);
    });

    it('CONTROL — the subscription is what moved the cell, and an explicit render agrees with it', () => {
        panel.show(SCHEDULE_ID);
        expect(areaCellsInDom()).toEqual(['24.00']);

        slabs[0].polygon = rect(10, 4);
        announceGeometryChange('pr12-slab-1');
        // RE-STATED at the fix: this used to assert `['24.00']` — "stale, as measured
        // above". The control still does its original job, which was to separate
        // "the extractor cannot see the new geometry" from "the panel is never told
        // to re-render": the subscription now reaches render(), and the explicit
        // show() below reads the SAME value, so the two paths agree.
        const afterSubscription = areaCellsInDom();
        expect(afterSubscription, 'the subscription reached render()').toEqual(['40.00']);

        // Same store, same extractor, same instant; the only difference is which
        // caller invoked render().
        panel.show(SCHEDULE_ID);
        const afterExplicitRender = areaCellsInDom();
        console.log('[PR-12 CONTROL] area cells after an explicit show() = ' +
            JSON.stringify(afterExplicitRender));
        expect(afterExplicitRender,
            'if the two paths disagreed, the subscription would be painting something the extractor does not hold')
            .toEqual(afterSubscription);
        expect(afterExplicitRender).toEqual(['40.00']);
    });

    it('HISTORICAL SIDE-FINDING — a DEFINITION event still refreshes, and no longer has to', () => {
        // Recorded from the pre-fix measurement: `render()` re-pulls everything, so a
        // schedule-definition edit silently repaired the stale geometry cell — which
        // meant the panel was sometimes right and sometimes wrong for reasons the
        // user could not see. RE-STATED at the fix: the geometry announce alone now
        // does the work, and the definition event is merely idempotent on top of it.
        // Kept so a future change cannot quietly reintroduce the "only a definition
        // edit repairs it" behaviour without turning this case red.
        panel.show(SCHEDULE_ID);
        slabs[0].polygon = rect(10, 4);
        announceGeometryChange('pr12-slab-1');
        expect(areaCellsInDom(), 'the geometry event alone is now sufficient').toEqual(['40.00']);

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

    it('STRUCTURAL — the panel registers a GEOMETRY subscription alongside the two DEFINITION events', () => {
        // RE-STATED AT THE FIX (PR-12), AND THE MECHANISM CHANGED, NOT ONLY THE LIST.
        //
        // This case used to read the SOURCE with a regex for
        // `window.addEventListener('<literal>'` and assert the result was exactly
        // ['sched:schedule-updated','sched:store-loaded']. Simply updating that
        // literal list would have been WORSE THAN USELESS: the fix registers the
        // geometry family through a `for (const evt of …) addEventListener(evt, …)`
        // loop, so the argument is a VARIABLE and the old regex cannot see a single
        // one of them. The case would have stayed GREEN on the old two-item list
        // while 30 new subscriptions went unmeasured — a pin that no longer pins.
        //
        // That is precisely the failure this programme found elsewhere the same week:
        // a gate that counts ARTEFACTS can be satisfied by producing artefacts, and
        // only a check that observes REACHED BEHAVIOUR cannot be gamed — including
        // accidentally, by an honest change (§10.2b, C70 §4.2).
        //
        // So the check now OBSERVES THE REAL REGISTRATION: it spies on
        // window.addEventListener across a genuine construction and asserts what the
        // panel actually subscribed to. It is strictly stronger than the regex it
        // replaces — it sees literal and computed registrations alike.
        // §P4-CAST-AT-SOURCE (H4, 2026-08-16) — the observation is UNCHANGED; only
        // the two `(window as any)` casts are gone. This block used to hand-roll the
        // spy by overwriting `window.addEventListener` through `(window as any)`,
        // which is precisely the spelling `check-cast-count` exists to forbid, and
        // it was two of the five sites holding that gate at exit 3. `vi.spyOn` is
        // the typed equivalent and is strictly better here for two reasons beyond
        // the cast: Vitest's spyOn CALLS THROUGH to the real listener registration
        // by default (so the panel is genuinely constructed and its listeners
        // genuinely registered — the same fact this case measures), and it restores
        // the global itself rather than relying on a hand-written finally.
        const seen: string[] = [];
        const spy = vi.spyOn(window, 'addEventListener');
        try {
            new SchedulePanel(null);
            // ⚠ Read the calls INSIDE the try: `mockRestore()` below both un-patches
            // the global AND clears `mock.calls`. Reading after it would silently
            // observe an empty list and turn this case green-for-the-wrong-reason —
            // the exact "never ran and passed look identical" failure this suite
            // keeps paying for.
            for (const call of spy.mock.calls) seen.push(String(call[0]));
        } finally {
            // Restore in a finally so a construction throw cannot leave the global
            // patched for every later case in the file.
            spy.mockRestore();
        }
        expect(seen.length, 'the spy observed no registration at all — nothing below would mean anything')
            .toBeGreaterThan(0);

        const definition = seen.filter((t) => t.startsWith('sched:')).sort();
        const geometry = seen.filter((t) => /^bim-/.test(t)).sort();
        console.log('[PR-12 STRUCTURAL] definition listeners = ' + JSON.stringify(definition));
        console.log('[PR-12 STRUCTURAL] geometry listeners  = ' + geometry.length + ' events');

        // The two definition subscriptions are UNCHANGED — the fix adds, it does not
        // replace. If a future change drops one of these, this goes red.
        expect(definition).toEqual(['sched:schedule-updated', 'sched:store-loaded']);

        // The claim the row is actually about, inverted from the defect it pinned:
        // an open schedule IS told when the model changes.
        expect(geometry.length, 'PR-12: the panel must subscribe to model-change events')
            .toBeGreaterThan(0);

        // ⚠ NOT slab-only. The measured bug used a slab, but a schedule tabulates
        // walls, doors, windows, roofs, stairs, columns, beams, furniture and curtain
        // walls too. Pinning the whole family stops a future "fix" from narrowing
        // this back to whatever element the test fixture happened to use (C74 §3.4).
        for (const kind of ['wall', 'slab', 'door', 'window', 'roof', 'stair', 'column', 'beam', 'furniture', 'curtainwall']) {
            expect(geometry, `a ${kind} schedule must refresh too`).toContain(`bim-${kind}-updated`);
        }
        // Row COUNT changes on add/remove, not only quantities on update.
        expect(geometry).toContain('bim-wall-added');
        expect(geometry).toContain('bim-wall-removed');
    });
});
