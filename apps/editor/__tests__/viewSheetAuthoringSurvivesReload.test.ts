// @vitest-environment happy-dom
//
// §VIEWLOAD36-AUTHORING-IS-A-MUTATION (L-10700 / L-10701) — the round-trip proof
// for authored VIEWS and SHEETS, and for the leg that actually broke.
//
// ── THE REPORT ──────────────────────────────────────────────────────────────
// Founder, 2026-08-24: *"In a previous session I created — RCP plan, Structural,
// Render, Draft view AND a Sheet. I closed the session, opened a new tab,
// logged in, opened the project — and NONE were there."* The reopened project
// showed `Views 6` (3D + Ground Floor + N/E/S/W) and `Schedules 16`.
//
// ── WHAT WAS MEASURED, AND WHAT IT RULED OUT ────────────────────────────────
//   · SIX is exactly what `DefaultViewsManager.ensureDefaultViews()` mints from
//     code, and SIXTEEN is exactly what `ScheduleStore.seedDefaultSchedules()`
//     seeds from code. Both counts are CODE OUTPUT, not restored data — so
//     "schedules survived" was never true and offers no contrast.
//   · The WRITER is sound: ProjectSerializer.ts:1459/:1538/:1541 put
//     `viewDefinitions` / `sheets` / `schedules` in every snapshot.
//   · The LOADER is sound: ProjectLoader.ts:2255/:2322/:2328 read all three back.
//   · `ensureDefaultViews()` is strictly create-if-missing and CANNOT clobber a
//     restored view — the leading ordering hypothesis, REFUTED.
//   ⛔ The break was upstream of both: `SaveOrchestrator.MUTATION_EVENTS` — the
//     window-event allowlist that is the ONLY autosave trigger — listed forty
//     `bim-*` ELEMENT events and no view, sheet, schedule or annotation event.
//     Authoring a view left the project marked CLEAN, so no debounce armed and
//     `flushBeforeUnload()` returned early on `!hasDirtyChanges`. The work was
//     never written. NOT dropped by the loader — never saved.
//
// ── WHY THIS SUITE IS SHAPED THE WAY IT IS ──────────────────────────────────
// ⛔ A test asserting "some views exist" passes on the six defaults and proves
// nothing. Every assertion below names an AUTHORED id, and PART 1 additionally
// asserts the six defaults are present ALONGSIDE them, so a regression that
// restores only defaults fails on the ids rather than on a count.
//
// ⚠ WHAT THIS DOES NOT ESTABLISH. It exercises the two store round-trips the
// serializer and loader actually call, plus the dirty-trigger leg. It does not
// boot `ProjectSerializer.serialize()` (needs a live BimManager) nor the server
// round trip, so "the bytes reach Postgres" remains unproven here.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import {
    viewDefinitionStore,
    sheetStore,
    scheduleStore,
    initDefaultViewsManager,
    DEFAULT_3D_VIEW_ID,
    DEFAULT_PLAN_VIEW_ID,
} from '@pryzm/core-app-model';
import { annotationStore } from '@pryzm/plugin-annotations';
import { SaveOrchestrator } from '../src/ui/platform/SaveOrchestrator';

/** The four families the founder authored, by id and by kind. */
const AUTHORED_VIEWS = [
    { id: 'vd-user-rcp-1',    name: 'RCP — Level 0',      viewType: 'ceiling-plan'    as const },
    { id: 'vd-user-struct-1', name: 'Structural — L0',    viewType: 'structural-plan' as const },
    { id: 'vd-user-render-1', name: 'Render — Lobby',     viewType: 'render'          as const },
    { id: 'vd-user-draft-1',  name: 'Draft — Detail 01',  viewType: 'drafting'        as const },
];

/** His sheet: `a001 — SWEG`, carrying two viewports. */
const SHEET_ID = 'sh-a001';
const SHEET_VIEWPORTS = [
    { id: 'vp-a001-1', viewId: 'vd-user-rcp-1',    position: { x: 40,  y: 60 } },
    { id: 'vp-a001-2', viewId: 'vd-user-struct-1', position: { x: 320, y: 60 } },
];

/** The six views a fresh project mints from code — the state he was shown. */
const SYSTEM_VIEW_IDS = [
    DEFAULT_3D_VIEW_ID,
    DEFAULT_PLAN_VIEW_ID,
    'vd-sys-elev-north', 'vd-sys-elev-east', 'vd-sys-elev-south', 'vd-sys-elev-west',
];

function authorTheSession(): void {
    for (const v of AUTHORED_VIEWS) {
        viewDefinitionStore.create({
            id: v.id, name: v.name, viewType: v.viewType,
            discipline: 'all', createdBy: 'user',
        });
    }
    sheetStore.create({
        id: SHEET_ID, sheetNumber: 'A001', name: 'SWEG',
        viewports: SHEET_VIEWPORTS, createdBy: 'user',
    });
}

describe('§VIEWLOAD36 — authored views and sheets survive a session boundary', () => {
    beforeAll(() => {
        // Boot the default-view guarantee once, exactly as `initUI.ts:797` does,
        // so the six system views are present and the reload half runs against
        // the SAME create-if-missing manager production uses.
        initDefaultViewsManager({ bootEnsure: 'immediate' });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PART 1 — the round trip, asserted by AUTHORED id and by kind.
    // ─────────────────────────────────────────────────────────────────────────

    it('restores every authored view BY ID AND KIND, alongside the six defaults', () => {
        viewDefinitionStore.reset();
        sheetStore.reset();
        initDefaultViewsManager({ bootEnsure: 'immediate' });   // re-seed the six
        authorTheSession();

        // ── SAVE: measure the PAYLOAD, not the call site ──
        const viewPayload  = viewDefinitionStore.serialize();
        const sheetPayload = sheetStore.serialize();

        const savedIds = viewPayload.views.map(v => v.id);
        for (const v of AUTHORED_VIEWS) {
            expect(savedIds, `authored view ${v.id} must reach the snapshot`).toContain(v.id);
        }
        expect(sheetPayload.sheets.map((s: { id: string }) => s.id)).toContain(SHEET_ID);

        // ── THE SESSION BOUNDARY: stores wiped exactly as a project open wipes them ──
        viewDefinitionStore.reset();
        sheetStore.reset();
        initDefaultViewsManager({ bootEnsure: 'immediate' });   // defaults re-mint FIRST…
        expect(viewDefinitionStore.getAll()).toHaveLength(6);   // …this is the state he saw

        // ── LOAD ──
        viewDefinitionStore.deserialize(viewPayload);
        sheetStore.deserialize(sheetPayload);

        // ⛔ Named ids, never a count: a count passes on the six defaults.
        for (const v of AUTHORED_VIEWS) {
            const back = viewDefinitionStore.get(v.id);
            expect(back, `authored view ${v.id} must come back`).toBeDefined();
            expect(back!.viewType, `${v.id} must come back as ${v.viewType}`).toBe(v.viewType);
            expect(back!.name).toBe(v.name);
        }
        // The defaults must survive the same restore — the fix must not trade one for the other.
        for (const id of SYSTEM_VIEW_IDS) {
            expect(viewDefinitionStore.get(id), `system view ${id} must survive`).toBeDefined();
        }
        expect(viewDefinitionStore.getAll().length).toBe(6 + AUTHORED_VIEWS.length);
    });

    it('restores the sheet WITH BOTH VIEWPORTS — a sheet without its viewports is still lost work', () => {
        viewDefinitionStore.reset();
        sheetStore.reset();
        authorTheSession();

        const sheetPayload = sheetStore.serialize();
        sheetStore.reset();
        expect(sheetStore.getAll()).toHaveLength(0);

        sheetStore.deserialize(sheetPayload);

        const back = sheetStore.get(SHEET_ID);
        expect(back).toBeDefined();
        expect(back!.sheetNumber).toBe('A001');
        expect(back!.name).toBe('SWEG');
        expect(back!.viewports.map(vp => vp.id)).toEqual(['vp-a001-1', 'vp-a001-2']);
        expect(back!.viewports.map(vp => vp.viewId)).toEqual(['vd-user-rcp-1', 'vd-user-struct-1']);
        expect(back!.viewports[0].position).toEqual({ x: 40, y: 60 });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PART 2 — THE LEG THAT ACTUALLY BROKE.
    //
    // A round trip through the stores was ALWAYS green; it is green above and it
    // was green before the fix. What was red is this: authoring never told the
    // save layer anything had changed, so the round trip above was never entered.
    // ─────────────────────────────────────────────────────────────────────────

    describe('authoring a document element arms autosave', () => {
        let saves: string[];
        let orch: SaveOrchestrator;

        beforeEach(() => {
            vi.useFakeTimers();
            saves = [];
            let n = 0;
            orch = new SaveOrchestrator({
                // A distinct hash every call, so the "content unchanged" skip can
                // never mask a save that legitimately fired.
                getHash: () => `hash-${++n}`,
                onAutoSave: (label: string) => { saves.push(label); },
                debounceMs: 10,
            });
            viewDefinitionStore.reset();
            sheetStore.reset();
            annotationStore.clear();
            saves.length = 0;   // discard anything the resets dispatched
        });

        afterEach(() => {
            orch.dispose();
            vi.useRealTimers();
        });

        it('creating a view (RCP / Structural / Render / Drafting) marks the project dirty', () => {
            for (const v of AUTHORED_VIEWS) {
                saves.length = 0;
                viewDefinitionStore.create({
                    id: v.id, name: v.name, viewType: v.viewType,
                    discipline: 'all', createdBy: 'user',
                });
                vi.advanceTimersByTime(50);
                expect(saves, `authoring a ${v.viewType} view must arm autosave`).toHaveLength(1);
            }
        });

        it('renaming a view marks the project dirty', () => {
            viewDefinitionStore.create({
                id: 'vd-user-rcp-1', name: 'RCP', viewType: 'ceiling-plan',
                discipline: 'all', createdBy: 'user',
            });
            vi.advanceTimersByTime(50);
            saves.length = 0;

            viewDefinitionStore.update('vd-user-rcp-1', { name: 'RCP — Level 0' });
            vi.advanceTimersByTime(50);
            expect(saves).toHaveLength(1);
        });

        it('creating a sheet marks the project dirty', () => {
            sheetStore.create({ id: SHEET_ID, sheetNumber: 'A001', name: 'SWEG', createdBy: 'user' });
            vi.advanceTimersByTime(50);
            expect(saves).toHaveLength(1);
        });

        it('placing a viewport on a sheet marks the project dirty', () => {
            sheetStore.create({ id: SHEET_ID, sheetNumber: 'A001', name: 'SWEG', createdBy: 'user' });
            vi.advanceTimersByTime(50);
            saves.length = 0;

            const ok = sheetStore.addViewport(SHEET_ID, SHEET_VIEWPORTS[0]);
            expect(ok).toBe(true);
            vi.advanceTimersByTime(50);
            expect(saves).toHaveLength(1);
        });

        it('creating a schedule marks the project dirty', () => {
            scheduleStore.create({
                id: 'sched-user-1',
                name: 'Custom Door Schedule',
                scheduleType: 'doors',
                fields: ['id', 'type'],
            });
            vi.advanceTimersByTime(50);
            expect(saves).toHaveLength(1);
        });

        it('L-10701 — adding an annotation marks the project dirty (a drafting view IS its annotations)', () => {
            annotationStore.add({
                id: 'ann-user-1',
                type: 'text-note',
                ownerViewId: 'vd-user-draft-1',
                position: { x: 0, y: 0, z: 0 },
                parameters: { text: 'DETAIL 01' },
                createdAt: Date.now(),
                updatedAt: Date.now(),
            } as never);
            vi.advanceTimersByTime(50);
            expect(saves, 'annotation authoring must arm autosave').toHaveLength(1);
        });

        it('a project LOAD must not be mistaken for authoring', () => {
            // `deserialize()` dispatches `vd:store-loaded` / `sd:store-loaded`; those
            // are load lifecycle and are deliberately absent from MUTATION_EVENTS.
            //
            // The payload carries the six system views ON PURPOSE — see the sibling
            // test below for what happens when it does not, and why that case is a
            // real mutation rather than an exception to this rule.
            initDefaultViewsManager({ bootEnsure: 'immediate' });
            vi.advanceTimersByTime(50);   // let the SEEDING save fire and settle
            const complete = viewDefinitionStore.serialize();
            viewDefinitionStore.reset();
            saves.length = 0;

            viewDefinitionStore.deserialize(complete);
            sheetStore.deserialize({ version: 1, sheets: [] });
            vi.advanceTimersByTime(50);
            expect(saves, 'restoring a complete snapshot must not trigger a save').toHaveLength(0);
        });

        it('MEASURED, DELIBERATE: restoring a snapshot MISSING a system view does save — because one was minted', () => {
            // ⚠ Named rather than hidden. `DefaultViewsManager` listens for
            // `vd:store-loaded` and tops up any system view the snapshot lacks
            // (create-if-missing — it never clobbers a restored view). That top-up
            // is a genuine new record that MUST be persisted, so arming a save is
            // correct, not a leak. In production it lands inside the load window,
            // where `isLoading` / `_loadSuppressActive` defer it to a single
            // post-load save whose hash comparison drops it when nothing changed.
            viewDefinitionStore.reset();
            saves.length = 0;

            viewDefinitionStore.deserialize({ version: 1, views: [] });
            expect(viewDefinitionStore.getAll().length).toBe(6);   // the top-up ran
            vi.advanceTimersByTime(50);
            expect(saves).toHaveLength(1);
        });
    });
});
