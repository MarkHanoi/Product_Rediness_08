// §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412 / L-405, C59 Phase 2) — LIVE picker specs
// (happy-dom). The pure halves are pinned in apps/editor/__tests__/PaneViewSwitcher.test.ts;
// here we prove the DOM surface the founder actually clicks:
//   • every pane gets a picker, in the split AND once a pane is full screen;
//   • clicking an option dispatches an INTENT (the renderer moves via the store, never
//     by the picker touching a mounter/DOM — C59 §2 invariant 3);
//   • the 3D Site moves between panes with ONE mounter instance (no clone);
//   • a blocked option is disabled AND its reason is rendered, not just a grey row;
//   • a rejected intent surfaces its reason instead of failing silently.

import { describe, it, expect, beforeEach } from 'vitest';
import { mountSiteAuthoringPaneShell } from '../views/SiteAuthoringPaneShell';
import { mountPaneViewPicker } from '../views/PaneViewPicker';
import { PaneLayoutStore } from '../views/paneLayoutStore';
import { PaneHost, MultiPaneController, type PaneRendererMounter } from '../views/PaneHost';
import {
    LEFT_PANE,
    RIGHT_PANE,
    siteAuthoringDefaultLayout,
    type RendererKind,
} from '../views/paneViewModel';

class FakeMounter implements PaneRendererMounter {
    mountCount = 0;
    unmountCount = 0;
    lastPaneEl: HTMLElement | null = null;
    constructor(readonly rendererKind: RendererKind) {}
    mount(paneEl: HTMLElement): void { this.mountCount++; this.lastPaneEl = paneEl; }
    unmount(): void { this.unmountCount++; this.lastPaneEl = null; }
    resize(): void { /* noop */ }
}

function buildShell(): {
    shell: ReturnType<typeof mountSiteAuthoringPaneShell>;
    cesium: FakeMounter;
    map: FakeMounter;
    plan: FakeMounter;
} {
    const parent = document.createElement('div');
    parent.id = 'container';
    document.body.appendChild(parent);
    const shell = mountSiteAuthoringPaneShell({ parent });
    const map = new FakeMounter('maplibre');
    const cesium = new FakeMounter('cesium');
    const plan = new FakeMounter('canvas2d');
    shell.controller.registerMounter(map);
    shell.controller.registerMounter(cesium);
    shell.controller.registerMounter(plan);
    shell.store.dispatch({ type: 'view.pane.set-layout', layout: siteAuthoringDefaultLayout() });
    return { shell, cesium, map, plan };
}

const popup = (pane: string): HTMLElement =>
    document.querySelector(`[data-testid="pane-view-picker-popup-${pane}"]`)!;
const trigger = (pane: string): HTMLButtonElement =>
    document.querySelector(`[data-testid="pane-view-picker-trigger-${pane}"]`)!;
const option = (pane: string, viewType: string): HTMLButtonElement =>
    popup(pane).querySelector(`[data-view-type="${viewType}"]`)!;

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('§C59 Phase 2 — a view picker on EVERY pane', () => {
    it('mounts one picker inside each pane element (pane-scoped chrome, C06 §7)', () => {
        const { shell } = buildShell();
        for (const pane of [LEFT_PANE, RIGHT_PANE]) {
            const el = document.querySelector(`[data-testid="pane-view-picker-${pane}"]`);
            expect(el).toBeTruthy();
            // Chrome belongs to ITS OWN pane — never a shell-level overlay.
            expect(shell.getPaneElement(pane)!.contains(el!)).toBe(true);
        }
    });

    it('the trigger names the view the pane is showing', () => {
        buildShell();
        expect(trigger(LEFT_PANE).textContent).toContain('2D Site Map');
        expect(trigger(RIGHT_PANE).textContent).toContain('3D Site');
    });

    it('lists EVERY registry view (3D Site and Plan are offered in both panes)', () => {
        buildShell();
        for (const pane of [LEFT_PANE, RIGHT_PANE]) {
            trigger(pane).click();
            expect(option(pane, 'site-3d')).toBeTruthy();
            expect(option(pane, 'bim-plan-2d')).toBeTruthy();
            expect(option(pane, 'bim-3d')).toBeTruthy();
        }
    });
});

describe('§C59 Phase 2 — choosing a view dispatches an intent (P6)', () => {
    it('moves the SINGLE Cesium into the left pane; the right pane takes the 2D map', () => {
        // ⚠ THIS ARM ASSERTED `[RIGHT_PANE]).toBeNull()` UNTIL §SWAP-NOT-VACATE (L-12999
        // clause 4, 2026-09-06) — the founder ruled that the pane a Cesium view moves out
        // of must never be left blank, and this is the DOM route he actually clicks. The
        // half this arm was really guarding — ONE Cesium instance, re-targeted, never a
        // second viewer (§L-412) — is untouched and is still asserted on every line below.
        const { shell, cesium, map } = buildShell();
        expect(cesium.lastPaneEl).toBe(shell.getPaneElement(RIGHT_PANE));

        trigger(LEFT_PANE).click();
        const opt = option(LEFT_PANE, 'site-3d');
        expect(opt.getAttribute('data-option-state')).toBe('moves-singleton');
        expect(opt.textContent).toMatch(/right pane/i); // the consequence is stated up-front
        opt.click();

        expect(shell.store.getLayout()[LEFT_PANE]).toBe('site-3d');
        expect(shell.store.getLayout()[RIGHT_PANE]).toBe('site-map-2d');
        expect(cesium.lastPaneEl).toBe(shell.getPaneElement(LEFT_PANE)); // ONE instance, re-targeted
        expect(cesium.mountCount).toBe(2);
        expect(cesium.unmountCount).toBe(1);
        // ⭐ AND THE OTHER PANE IS LIVE, not merely non-null in the store: the ONE MapLibre
        // map really landed in it. A store that moved on from the renderers is how panes go
        // blank with no way back, so the layout claim is checked against the mounter.
        expect(map.lastPaneEl).toBe(shell.getPaneElement(RIGHT_PANE));
    });

    it('puts the PLAN in a pane next to the 3D Site (the founder\'s plan ⇄ 3D Site ask)', () => {
        const { shell, plan } = buildShell();
        trigger(LEFT_PANE).click();
        option(LEFT_PANE, 'bim-plan-2d').click();
        expect(shell.store.getLayout()[LEFT_PANE]).toBe('bim-plan-2d');
        expect(shell.store.getLayout()[RIGHT_PANE]).toBe('site-3d'); // both live
        expect(plan.lastPaneEl).toBe(shell.getPaneElement(LEFT_PANE));
    });

    it('repaints every pane\'s picker from the store after a change', () => {
        // ⚠ THE EXPECTED RIGHT-PANE TRIGGER WAS `/Empty pane/` UNTIL §SWAP-NOT-VACATE
        // (L-12999 clause 4, 2026-09-06). The arm is about REPAINTING — that a change made
        // in one pane's picker is reflected in the other's — and that property is what it
        // still asserts; only the text it repaints TO changed, because the right pane now
        // receives the displaced view instead of being emptied. The "Empty pane" label is
        // not dead code — the arm below exercises it on a layout where a pane genuinely is
        // empty, which is now the only way to reach it.
        const { shell } = buildShell();
        trigger(LEFT_PANE).click();
        option(LEFT_PANE, 'site-3d').click();
        expect(trigger(LEFT_PANE).textContent).toContain('3D Site');
        expect(trigger(RIGHT_PANE).textContent).toContain('2D Site Map');
        expect(shell.store.getLayout()[RIGHT_PANE]).toBe('site-map-2d');
    });

    it('§SWAP-NOT-VACATE — an intentional empty still repaints to "Empty pane"', () => {
        // The guarded half: `assign(pane, null)` is the user asking, and the picker must
        // still say so. This is the label the arm above used to assert, on the layout that
        // actually produces it.
        const { shell } = buildShell();
        shell.store.dispatch({ type: 'view.pane.assign', paneId: RIGHT_PANE, viewType: null });
        expect(trigger(RIGHT_PANE).textContent).toMatch(/Empty pane/);
        expect(shell.store.getLayout()[RIGHT_PANE]).toBeNull();
    });
});

describe('§C59 Phase 2 — disabled options EXPLAIN themselves', () => {
    it('BIM 3D is disabled and prints the Phase-3 reason in the row', () => {
        buildShell();
        trigger(RIGHT_PANE).click();
        const opt = option(RIGHT_PANE, 'bim-3d');
        expect(opt.disabled).toBe(true);
        expect(opt.textContent).toMatch(/Phase 3/i);   // rendered, not just a title=
        expect(opt.title).toMatch(/Phase 3/i);
    });

    it('a view with no mounter in this workspace is disabled with a wiring reason', () => {
        // A controller with ONLY the map mounter — the plan has nowhere to mount.
        const paneEl = document.createElement('div');
        document.body.appendChild(paneEl);
        const controller = new MultiPaneController([new PaneHost(LEFT_PANE, paneEl)]);
        controller.registerMounter(new FakeMounter('maplibre'));
        const store = new PaneLayoutStore({ [LEFT_PANE]: null }, { applier: controller });
        mountPaneViewPicker({ paneId: LEFT_PANE, paneEl, store });

        trigger(LEFT_PANE).click();
        const opt = option(LEFT_PANE, 'bim-plan-2d');
        expect(opt.disabled).toBe(true);
        expect(opt.textContent).toMatch(/canvas2d/);
    });
});

describe('§C59 Phase 2 — full screen keeps its picker', () => {
    it('solo collapses the other pane + divider, and the survivor still has a picker', () => {
        const { shell } = buildShell();
        trigger(RIGHT_PANE).click();
        document.querySelector<HTMLButtonElement>(
            `[data-testid="pane-layout-action-solo-${RIGHT_PANE}"]`,
        )!.click();

        expect(shell.store.getLayout()[LEFT_PANE]).toBeNull();
        expect(shell.getPaneElement(LEFT_PANE)!.style.display).toBe('none');
        expect(shell.root.querySelector<HTMLElement>('#pryzm-pane-divider')!.style.display).toBe('none');
        // The founder's requirement: in FULL SCREEN you can still switch view.
        expect(trigger(RIGHT_PANE)).toBeTruthy();
        expect(shell.getPaneElement(RIGHT_PANE)!.style.display).not.toBe('none');

        // …and get back to the split through the same picker.
        trigger(RIGHT_PANE).click();
        document.querySelector<HTMLButtonElement>(
            `[data-testid="pane-layout-action-restore-split-${RIGHT_PANE}"]`,
        )!.click();
        expect(shell.store.getLayout()[LEFT_PANE]).toBe('site-map-2d');
        expect(shell.getPaneElement(LEFT_PANE)!.style.display).not.toBe('none');
    });
});

describe('§C59 Phase 2 — a rejected intent is never silent', () => {
    it('shows the rejection reason in the popup and leaves the layout untouched', () => {
        const paneEl = document.createElement('div');
        document.body.appendChild(paneEl);
        // No applier ⇒ no registered kinds ⇒ availability is judged statically; force a
        // rejection by dispatching through a store whose applier always refuses.
        const store = new PaneLayoutStore(
            { [LEFT_PANE]: null },
            { applier: { applyLayout: () => { throw new Error('mount refused'); } } },
        );
        mountPaneViewPicker({ paneId: LEFT_PANE, paneEl, store });
        trigger(LEFT_PANE).click();
        option(LEFT_PANE, 'site-3d').click();

        const err = document.querySelector(`[data-testid="pane-view-picker-error-${LEFT_PANE}"]`);
        expect(err?.textContent).toMatch(/mount refused/);
        expect(store.getLayout()[LEFT_PANE]).toBeNull();
    });
});
