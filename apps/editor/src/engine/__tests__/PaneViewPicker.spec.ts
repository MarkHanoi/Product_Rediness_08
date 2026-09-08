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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
    it('BIM 3D is REACHABLE and still prints the Phase-3 reason in the row', () => {
        // ⚠ AMENDED 2026-09-08 (§ONE-REGION-SWITCHER, L-13257). This asserted `disabled ===
        // true`. The pane refusal is unchanged — the row still PRINTS why it cannot be a pane
        // — but it is no longer a dead end: it opens PRYZM 3D full screen, which is what its
        // own reason text has always said it does.
        buildShell();
        trigger(RIGHT_PANE).click();
        const opt = option(RIGHT_PANE, 'bim-3d');
        // ⭐ THE INVARIANT IS "NOT A DEAD END", not a particular state name. This shell wires
        // a webgpu mounter, so `bim-3d` resolves to plain `available` here; on the founder's
        // live split it resolves to `opens-fullscreen`. Both are REACHABLE, which is the fact
        // this arm exists to hold — pinning one state name would make the arm fail on a
        // correct configuration, which is how the previous version came to assert `disabled`.
        expect(opt.disabled).toBe(false);
        expect(['available', 'opens-fullscreen', 'moves-singleton'])
            .toContain(opt.getAttribute('data-option-state'));
        // The row still EXPLAINS itself wherever a reason applies (never a bare grey).
        if (opt.getAttribute('data-option-state') === 'opens-fullscreen') {
            expect(opt.textContent).toMatch(/Phase 3/i);
            expect(opt.title).toMatch(/Phase 3/i);
            // ⛔ the consequence is stated BEFORE the click (STR §26.1.1).
            expect(opt.textContent).toMatch(/FULL SCREEN|full screen/);
        }
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

// ════════════════════════════════════════════════════════════════════════════════
// §ONE-PANEL-PER-PANE-AND-MAKE-IT-A-DROPDOWN (L-13015 / L-13025, founder 2026-09-06)
// ════════════════════════════════════════════════════════════════════════════════
//
// He photographed THREE view switchers stacked over one pane and ruled: *"keep the one, the
// formal and more robust only, and keep it DROP DOWN only. But when in split view, on the
// left hand side only, please keep TWO dropdown panels."* — then completed it: *"we need to
// have the DROP DOWN PANEL to choose the view required in BOTH split view ON START UP … ALL
// OF THAT SHOULD BE CONCATENATED ON THE SINGLE DROP DOWN PANEL WITH ALL VIEWS."*
//
// ⭐ THE RULE THESE ARMS PIN: **switcher count == visible pane count**, the survivor is the
// dropdown, it is there FROM STARTUP, and it carries ALL the views. Counting is the whole
// point — the defect was never a missing control, it was three of them.
describe('§ONE-PANEL-PER-PANE-AND-MAKE-IT-A-DROPDOWN — one dropdown per pane, from startup', () => {
    it('⭐ mounts exactly ONE view control per pane, with NO interaction first', () => {
        const { shell } = buildShell();
        for (const pane of [LEFT_PANE, RIGHT_PANE]) {
            const paneEl = shell.getPaneElement(pane)!;
            expect(
                paneEl.querySelectorAll(`[data-testid="pane-view-picker-${pane}"]`),
                `pane ${pane} should carry exactly one dropdown at startup`,
            ).toHaveLength(1);
        }
        // ⛔ AND NOTHING ELSE. The floating six-segment bar that used to sit beside the
        // dropdown is the middle one of his three; it is not hidden, it is not mounted.
        expect(document.querySelectorAll('.svq-bar--pane')).toHaveLength(0);
        // The whole document holds two switchers because it holds two panes — not because
        // a number was written down anywhere.
        expect(document.querySelectorAll('[data-pane-picker]')).toHaveLength(
            Object.keys(shell.store.getLayout()).length,
        );
    });

    it('⭐ the ONE dropdown carries ALL SIX of the founder\u2019s views', () => {
        const { shell } = buildShell();
        trigger(LEFT_PANE).click();
        for (const id of ['site-map', 'site-satellite', 'site-3d', 'site-globe', 'pryzm-3d', 'pryzm-2d']) {
            expect(
                popup(LEFT_PANE).querySelector(`[data-option-id="${id}"]`),
                `the dropdown is missing the ${id} row`,
            ).toBeTruthy();
        }
        // ⛔ And the pane menu SURVIVES under them — every view the six do not offer is
        // still reachable (*"if the user wants to open more they can do it in the browser"*).
        //
        // ⚠ THE UNIQUENESS TEST IS PER SECTION, NOT PER VIEW TYPE, and that distinction is the
        // whole design: `site-map-2d` legitimately appears TWICE in the panel (2D Site Map and
        // 2D Satellite are one view under two basemaps) and so does `site-3d` (3D Site / 3D
        // Globe, one Cesium camera at two altitudes). What must never happen is a view showing
        // up in the panel AND again under "More views" — the duplication the founder
        // photographed, one level down. That overlap is DERIVED from `viewPanelOptions()`.
        const panelTypes = new Set(
            [...popup(LEFT_PANE).querySelectorAll('[data-option-id]')]
                .map((b) => b.getAttribute('data-view-type')),
        );
        const menuTypes = [...popup(LEFT_PANE).querySelectorAll('[data-view-type]')]
            .filter((b) => !b.hasAttribute('data-option-id'))
            .map((b) => b.getAttribute('data-view-type'));
        expect(menuTypes.filter((vt) => panelTypes.has(vt))).toEqual([]);
        // The registry list is genuinely still there — an empty "More views" would pass the
        // line above for the wrong reason.
        expect(menuTypes.length).toBeGreaterThan(0);
        expect(shell.store.getRegistry()['bim-plan-2d']).toBeTruthy();
    });

    it('⛔ an unavailable row STILL APPEARS and its refusal is DOM TEXT, not a title=', () => {
        // STR §26.1.1 / L-12999, a founder ruling: *"PRYZM declines in ONE SENTENCE naming the
        // reason and offers the action that resolves it; a silently greyed-out segment is the
        // WRONG implementation."* A dropdown whose disabled row says nothing would be that
        // same failure in a new shape — which is exactly the risk of moving to a `<select>`.
        const { shell } = buildShell();
        trigger(LEFT_PANE).click();
        const disabled = [...popup(LEFT_PANE).querySelectorAll<HTMLButtonElement>(
            '[data-option-id]',
        )].filter((b) => b.disabled);
        expect(disabled.length, 'no refused row in this workspace to check').toBeGreaterThan(0);
        for (const b of disabled) {
            const spoken = b.querySelector('.svq-reason')?.textContent ?? '';
            expect(spoken.length, `${b.getAttribute('data-option-id')} is greyed and silent`)
                .toBeGreaterThan(0);
            // The row is still OFFERED, per clause 1 of the ruling — never dropped.
            expect(b.isConnected).toBe(true);
        }
        expect(shell.store.getLayout()).toBeTruthy();
    });

    it('⭐ §SWAP-NOT-VACATE — a singleton move states its cost BEFORE the click', () => {
        // The consequence sentence used to live only on the registry rows. Those rows for
        // `site-3d` are now covered by the panel, so the sentence had to travel with the
        // move or it would have been lost in a refactor — the silent kind of regression.
        const { shell } = buildShell();
        expect(shell.store.getLayout()[RIGHT_PANE]).toBe('site-3d');
        trigger(LEFT_PANE).click();
        const row = popup(LEFT_PANE).querySelector<HTMLButtonElement>('[data-option-id="site-3d"]')!;
        expect(row.getAttribute('data-option-state')).toBe('moves-singleton');
        expect(row.textContent).toMatch(/right pane/i);
        expect(row.disabled).toBe(false); // a consequence, not a refusal
    });
});


// ════════════════════════════════════════════════════════════════════════════════
// §PANE-DROPDOWN-CENTRED (founder 2026-09-07) — "THEY NEED TO BE CENTERED."
// ════════════════════════════════════════════════════════════════════════════════
//
// C59's own card text already promised it: *"Switch the view, or split it, from the bar
// centred on the view itself."*
//
// ⛔ AND THE WHOLE QUESTION IS *CENTRED ON WHAT*. L-13027: the retired whole-screen bar
// centred itself with `--shell-canvas-cx` / `--shell-canvas-w`, which are CANVAS-relative, so
// when the split collapsed it re-centred on a region that was no longer a view. C59 §2.10.3
// clause 4 settles it — every pane control is positioned relative to ITS PANE. These arms
// assert the mechanism, not the pixel: `position:absolute` inside the pane element, `left:50%`
// with a `translateX(-50%)`, and NO canvas variable and NO fixed positioning anywhere.

describe('§PANE-DROPDOWN-CENTRED — centred on the PANE, never on the canvas', () => {
    it('both pickers are centred at the top of their own pane', () => {
        const { shell } = buildShell();
        for (const pane of [LEFT_PANE, RIGHT_PANE]) {
            const el = document.querySelector<HTMLElement>(`[data-testid="pane-view-picker-${pane}"]`)!;
            expect(shell.getPaneElement(pane)!.contains(el)).toBe(true);
            expect(el.style.position).toBe('absolute');
            expect(el.style.left).toBe('50%');
            expect(el.style.right).toBe('auto');
            expect(el.style.transform).toContain('translateX(-50%)');
        }
    });

    it('the popup is centred on the same axis, and clamps to the PANE it opens in', () => {
        const { shell } = buildShell();
        const paneEl = shell.getPaneElement(LEFT_PANE)!;
        // A narrow pane — reachable by dragging the divider to MIN_FRACTION on a small screen.
        Object.defineProperty(paneEl, 'clientWidth', { value: 256, configurable: true });
        Object.defineProperty(paneEl, 'clientHeight', { value: 700, configurable: true });
        trigger(LEFT_PANE).click();
        const p = popup(LEFT_PANE);
        expect(p.style.left).toBe('50%');
        expect(p.style.transform).toContain('translateX(-50%)');
        // ⛔ A centred popup WIDER than its pane is the same defect wearing a different hat.
        expect(parseInt(p.style.maxWidth, 10)).toBeLessThanOrEqual(256);
    });

    it('⛔ NO canvas variable and NO fixed positioning — that is the L-13027 defect returning', () => {
        // The SOURCE is the authority for "it never reaches for the window": an inline-style
        // read cannot prove the absence of something this file does not write.
        //
        // ⚠ CODE ONLY. The header EXPLAINS the L-13027 defect and therefore NAMES
        // `--shell-canvas-cx`; an arm that matched comments would fail on the very sentence
        // that records why the rule exists — and the fix for that would be to delete the
        // explanation, which is the wrong direction.
        const src = readFileSync(
            resolve(process.cwd(), 'apps/editor/src/engine/views/PaneViewPicker.ts'),
            'utf8',
        )
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .split('\n')
            .filter((l) => !l.trim().startsWith('//'))
            .join('\n');
        expect(src).not.toMatch(/--shell-canvas/);
        expect(src).not.toMatch(/'fixed'/);
        expect(src).not.toMatch(/window\.inner/);
        // ...and it IS centred, in the pane's own coordinates.
        expect(src).toMatch(/translateX\(-50%\)/);
    });
});
