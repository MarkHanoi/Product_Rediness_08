/**
 * §L-847 — THE SHIPPED F3 DATA SURFACE IS DataWorkbench (founder decision, 2026-08-13).
 *
 * Differentiating suite: these tests FAIL if the F3 mount reverts to the
 * DataCommandCenter/AuditBucket overlay. That regression has a precise shape —
 * WorkspaceController's 'data' case going back to `dw.setMode('hidden')` and/or
 * DataCommandCenter re-claiming the 'pryzm-workspace-mode' event — and it is
 * exactly what made the Hierarchy model tree unreachable: the shipped surface
 * had NO sub-tab bar at all, so `contains`-backed furniture rows (first-party
 * writer e1e375d0, rebuild 76a212aa) had no panel to render into.
 *
 * Environment: happy-dom (root vitest.config.ts). The runtime events bus is
 * faked BEFORE the modules under test are imported, so the module-load
 * singleton (dataCommandCenter) and DataWorkbench subscribe against a live bus
 * rather than queueing in the deferral bridge.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';

type Handler = (payload: unknown) => void;

function makeEventsBus() {
    const handlers = new Map<string, Set<Handler>>();
    return {
        on(event: string, handler: Handler): () => void {
            if (!handlers.has(event)) handlers.set(event, new Set());
            handlers.get(event)!.add(handler);
            return () => { handlers.get(event)?.delete(handler); };
        },
        emit(event: string, payload?: unknown): void {
            handlers.get(event)?.forEach(h => h(payload));
        },
    };
}

interface WorkbenchLike {
    setMode(mode: 'hidden' | 'panel' | 'split' | 'full'): void;
}

let workspaceController: { setMode(m: 'author' | 'inspect' | 'data'): void };
let DataWorkbenchCtor: new (runtime: null) => WorkbenchLike;

beforeAll(async () => {
    (window as unknown as { runtime: unknown }).runtime = { events: makeEventsBus() };
    ({ workspaceController } = await import('../../WorkspaceController'));
    // Side-effect import — constructs the module-load dataCommandCenter
    // singleton, which appends #dcc-shell and subscribes to the mode event.
    await import('../../data/DataCommandCenter');
    ({ DataWorkbench: DataWorkbenchCtor } = await import('../DataWorkbench') as unknown as {
        DataWorkbench: new (runtime: null) => WorkbenchLike;
    });
}, 300_000);
// ── WHY 300s, AND WHY THAT IS A SYMPTOM PATCH — read this before touching the number.
//
//    THIS IS A TREATED SYMPTOM, NOT A CLOSED DEFECT. The honest cause is named below
//    and is NOT fixed. 120s was not a stale pin: at 120s this file passes SOLO (~75s)
//    and TIMES OUT the moment it runs beside other spec files, which is how CI runs it
//    — measured, three files, `Hook timed out in 120000ms`, transform 406s across the
//    run. The import is genuinely that big; the budget was not the lie, the graph is.
//
// ── WHAT IT ACTUALLY COSTS, MEASURED — the previous note here said "DataCommandCenter
//    pulls THREE".
//    THAT WAS FALSE and it sent the next reader at the wrong module. Bisected by
//    dynamic import, one target per process:
//        @pryzm/renderer-three/three          108ms   ← the accused; pre-bundled, free
//        @pryzm/core-app-model (root barrel)  95,325ms
//    The cost is the 863-export root barrel, not THREE. Counting UNIQUE modules through
//    a Vite transform hook (load-independent, unlike wall clock on a shared box):
//        this beforeAll                       2,164 modules
//        └─ ../../data/DataCommandCenter      1,580 of them
//    and DataCommandCenter is imported here PURELY for its side effect — it is the
//    PARKED surface, and test 2 exists to prove it stays parked. So the cost is real and
//    the import cannot be dropped without deleting the differentiator.
//    One cause was fixable and is FIXED (c3b39373): 13 modules inside core-app-model
//    imported their own package index, so `core-app-model/presentation` alone cost
//    >=1,564 modules / 43s; it is now 70 modules / 7s.
//    The residual is a PACKAGE-LEVEL BARREL CYCLE this lane cannot close:
//    @pryzm/command-registry has 223 value imports of the core-app-model ROOT barrel,
//    and core-app-model depends on command-registry — so touching either loads both
//    (308 + 269 modules). That is the L2-imports-L4 debt named in CLAUDE.md. Narrowing
//    all six root-barrel imports in apps/editor/src/ui/data/ to subpaths was tried and
//    MEASURED INEFFECTIVE — 1,576 → 1,580 modules — precisely because command-registry
//    re-enters the barrel from 223 other places. The narrowing was kept (it is correct)
//    but it buys nothing until that cycle is cut.
//
//    DO NOT raise this number again to make a red run green. If this times out, the
//    graph grew: re-count it (a Vite `transform` hook that records module ids) and fix
//    the new edge. 300s is already ~4x the solo cost; anything past it is a hang.

describe('L-847 — DataWorkbench is the shipped F3 Data surface', () => {
    it('WorkspaceController data mode drives window.dataWorkbench to FULL, not hidden', () => {
        const setMode = vi.fn();
        (window as unknown as { dataWorkbench: unknown }).dataWorkbench = { setMode };

        workspaceController.setMode('data');

        // The differentiator: the pre-L-847 code called setMode('hidden') here,
        // benching the only surface with the Hierarchy sub-tab.
        expect(setMode).toHaveBeenCalledWith('full');
        expect(setMode).not.toHaveBeenCalledWith('hidden');
    });

    it('DataCommandCenter (AuditBucket shell) stays PARKED on the data mode event', () => {
        const shell = document.getElementById('dcc-shell');
        expect(shell).toBeTruthy(); // parked, not deleted — still constructed

        (window as unknown as { runtime: { events: { emit(e: string, p?: unknown): void } } })
            .runtime.events.emit('pryzm-workspace-mode', { mode: 'data' });

        // Pre-L-847 this became 'flex' and the fixed inset-0 overlay covered
        // the DataWorkbench.
        expect(shell!.style.display).toBe('none');
    });

    let dwInstance: WorkbenchLike;

    it('the shipped workbench exposes the Hierarchy sub-tab and constructs HierarchyTreePanel', () => {
        dwInstance = new DataWorkbenchCtor(null);
        const el = document.getElementById('dw-workbench');
        expect(el).toBeTruthy();

        // Enter the AUDIT bucket — its default tab is 'hierarchy'.
        const auditBtn = el!.querySelector<HTMLButtonElement>('[data-bucket="audit"]');
        expect(auditBtn).toBeTruthy();
        auditBtn!.click();

        // The sub-tab bar (absent entirely from AuditBucket's delta grid) must
        // offer the hierarchy pill…
        const hierBtn = el!.querySelector('.dw-subtab-btn[data-subtab="hierarchy"]');
        expect(hierBtn).toBeTruthy();

        // …and the audit split (hierarchy tree pane) must be on screen…
        const split = el!.querySelector<HTMLElement>('.dw-audit-split');
        expect(split).toBeTruthy();
        expect(split!.style.display).toBe('flex');

        // …with HierarchyTreePanel actually constructed into the hierarchy
        // panel node (it renders at least its guarded placeholder/toolbar even
        // with no stores on window).
        const hierPanel = el!.querySelector('[data-panel="hierarchy"]');
        expect(hierPanel).toBeTruthy();
        expect(hierPanel!.childElementCount).toBeGreaterThan(0);
        // 60s, not the config's 10s: `new DataWorkbench(null)` builds the DOM of every
        // bucket and constructs HierarchyTreePanel SYNCHRONOUSLY, so this body blocks
        // for as long as the machine makes it block. Same symptom-patch caveat as the
        // beforeAll above — measured <1s solo, >10s beside other spec files.
    }, 60_000);

    it('full mode is really full: a prior panel stint must not pin an inline 420px width', () => {
        const el = document.getElementById('dw-workbench') as HTMLElement;
        dwInstance.setMode('panel');
        dwInstance.setMode('full');
        // Inline width from 'panel' outranks the .dw--full class rule; the
        // §L-847 fix clears it so full width is class-driven.
        expect(el.classList.contains('dw--full')).toBe(true);
        expect(el.style.width).toBe('');
    }, 60_000);
});
