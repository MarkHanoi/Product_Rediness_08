/**
 * §SWAP-NOT-VACATE (L-12999 clause 4, founder ruling · STR §26.1.1 · C57 §1.5) — NO PANE IS
 * EVER A BLANK RECTANGLE.
 *
 * THE RULING, clause 4, verbatim:
 *
 *   > *"The other pane must not be left blank … pane A must end holding SOMETHING IT CAN
 *   >  STATE — a 2D view, or an honest placeholder that says why it is not showing 3D and
 *   >  what to press to get it back."*
 *
 * Two mechanisms serve that one sentence and this file pins the SECOND:
 *   · `assignViewToPane`'s SWAP removes the involuntary empty (pinned in
 *     `apps/editor/__tests__/PaneViewModel.test.ts`);
 *   · `describeEmptyPane` + `mountPaneEmptyState` give the VOLUNTARY empties words.
 *
 * ⛔ WHY BOTH, AND WHY THE SECOND IS NOT REDUNDANT. `SiteAuthoringPaneShell.applyFraction`
 * collapses a pane only when EXACTLY ONE pane is occupied. The shell OPENS on
 * `EMPTY_LR_LAYOUT` — both panes empty, nothing solo, both on screen holding nothing. That
 * is the *"BLANK light-lavender rectangle with only the tool rail"* the founder photographed
 * (L-13000), and no swap can fix it because there is nothing to swap.
 *
 * ⛔ AND THE FIX MAY NOT BE CSS. The ruling forbids hiding a blank pane by name. Arm 6
 * asserts the pane is still THERE and still sized — content, not concealment.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
    EMPTY_LR_LAYOUT,
    LEFT_PANE,
    RIGHT_PANE,
    siteAuthoringDefaultLayout,
    type PaneLayout,
    type RendererKind,
} from '../views/paneViewModel';
import { describeEmptyPane } from '../views/paneViewOptions';
import { PaneLayoutStore } from '../views/paneLayoutStore';
import { mountSiteAuthoringPaneShell } from '../views/SiteAuthoringPaneShell';
import { PaneHost, MultiPaneController, type PaneRendererMounter } from '../views/PaneHost';
import { mountPaneEmptyState } from '../views/PaneEmptyState';

class FakeMounter implements PaneRendererMounter {
    lastPaneEl: HTMLElement | null = null;
    constructor(readonly rendererKind: RendererKind) {}
    mount(paneEl: HTMLElement): void { this.lastPaneEl = paneEl; }
    unmount(): void { this.lastPaneEl = null; }
    resize(): void { /* noop */ }
}

const ALL_KINDS = new Set<RendererKind>(['maplibre', 'cesium', 'canvas2d']);

describe('§SWAP-NOT-VACATE — describeEmptyPane (the pure statement)', () => {
    it('says NOTHING about a pane that holds a view — there is nothing to state', () => {
        const layout = siteAuthoringDefaultLayout();
        expect(describeEmptyPane({ layout, paneId: LEFT_PANE })).toBeNull();
        expect(describeEmptyPane({ layout, paneId: RIGHT_PANE })).toBeNull();
    });

    it('⭐ the shell\'s OPENING state — both panes empty — gets words in BOTH panes', () => {
        // The founder's L-13000 rectangle. `applyFraction` cannot collapse this (nothing is
        // solo), so it is the one empty that reaches the screen as a blank.
        for (const paneId of [LEFT_PANE, RIGHT_PANE]) {
            const s = describeEmptyPane({ layout: EMPTY_LR_LAYOUT, paneId, mountableKinds: ALL_KINDS });
            expect(s, `${paneId} said nothing`).not.toBeNull();
            expect(s!.headline).toBe('This pane is empty');
            expect(s!.detail).toMatch(/No view has been assigned to either pane yet/i);
            // …and it OFFERS THE ACTION THAT RESOLVES IT (STR §26.1.1), not just a diagnosis.
            expect(s!.action).toBeDefined();
            expect(s!.action!.kind).toBe('assign');
        }
    });

    it('names the OTHER pane and what it is showing — the "why", in this layout\'s terms', () => {
        const soloLeft: PaneLayout = { [LEFT_PANE]: 'site-3d', [RIGHT_PANE]: null };
        const s = describeEmptyPane({ layout: soloLeft, paneId: RIGHT_PANE, mountableKinds: ALL_KINDS })!;
        expect(s.detail).toContain('The left pane is showing 3D Site.');
    });

    it('⭐ the suggested view ADDS a surface — it never moves one out of the other pane', () => {
        // THE PROPERTY THAT MATTERS. A placeholder whose button emptied the sibling pane
        // would be this bug with extra steps. So the offer is derived as "the first
        // pane-hostable view with a mounter that is NOT already on screen", and filling this
        // pane with it leaves the other pane exactly as it was.
        const soloLeft: PaneLayout = { [LEFT_PANE]: 'site-3d', [RIGHT_PANE]: null };
        const s = describeEmptyPane({ layout: soloLeft, paneId: RIGHT_PANE, mountableKinds: ALL_KINDS })!;
        expect(s.action!.viewType).not.toBe('site-3d');

        const store = new PaneLayoutStore(soloLeft, { applier: { applyLayout: () => {}, registeredKinds: () => ALL_KINDS } });
        const r = store.dispatch({ type: 'view.pane.assign', paneId: RIGHT_PANE, viewType: s.action!.viewType! });
        expect(r.ok).toBe(true);
        expect(store.getLayout()[LEFT_PANE]).toBe('site-3d');   // untouched.
        expect(store.getLayout()[RIGHT_PANE]).toBe(s.action!.viewType);
    });

    it('never suggests a view whose renderer has no mounter in THIS workspace', () => {
        // The runtime half of availability. Offering a Cesium view where no Cesium mounter
        // is registered is a dead button — the disable-or-EXPLAIN rule, one layer down.
        const s = describeEmptyPane({
            layout: EMPTY_LR_LAYOUT,
            paneId: LEFT_PANE,
            mountableKinds: new Set<RendererKind>(['canvas2d']),
        })!;
        expect(s.action!.viewType).toBe('bim-plan-2d');
    });

    it('⛔ with nothing left to offer it still SPEAKS — it never renders a dead button', () => {
        // Every hostable view already on screen and no split to restore. There is no honest
        // action, so there is no action — and the detail says what to do instead. A pane
        // that fell silent here would be the blank rectangle again, just later.
        const s = describeEmptyPane({
            layout: { [LEFT_PANE]: 'site-map-2d', [RIGHT_PANE]: null, extra: 'site-3d' },
            paneId: RIGHT_PANE,
            mountableKinds: new Set<RendererKind>(['maplibre', 'cesium']),
            canRestoreSplit: false,
        })!;
        expect(s.action).toBeUndefined();
        expect(s.detail).toMatch(/already on screen/i);
        expect(s.detail).toMatch(/panel above/i);
    });

    it('offers "back to split" when that is the only thing left that would fill it', () => {
        const s = describeEmptyPane({
            layout: { [LEFT_PANE]: 'site-map-2d', [RIGHT_PANE]: null, extra: 'site-3d' },
            paneId: RIGHT_PANE,
            mountableKinds: new Set<RendererKind>(['maplibre', 'cesium']),
            canRestoreSplit: true,
        })!;
        expect(s.action!.kind).toBe('restore-split');
    });
});

describe('§SWAP-NOT-VACATE — the live placeholder in the shell', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    function buildShell() {
        const parent = document.createElement('div');
        parent.id = 'container';
        document.body.appendChild(parent);
        const shell = mountSiteAuthoringPaneShell({ parent });
        for (const k of ALL_KINDS) shell.controller.registerMounter(new FakeMounter(k));
        return shell;
    }

    const el = (pane: string) =>
        document.querySelector<HTMLElement>(`[data-testid="pane-empty-state-${pane}"]`)!;

    it('⭐ the shell OPENS with both panes empty — and both say so, in words', () => {
        buildShell();
        for (const pane of [LEFT_PANE, RIGHT_PANE]) {
            expect(el(pane), `${pane} has no empty-state element at all`).toBeTruthy();
            expect(el(pane).hidden).toBe(false);
            expect(el(pane).textContent).toContain('This pane is empty');
        }
    });

    it('⛔ it is CONTENT, not concealment — the pane keeps its box and its chrome', () => {
        // The ruling forbids hiding a blank pane with CSS by name. The placeholder is a
        // CHILD of the pane, the pane is still displayed, and the pane's own view panel is
        // still mounted inside it — which is what the placeholder's copy points at.
        const shell = buildShell();
        const paneEl = shell.getPaneElement(RIGHT_PANE)!;
        expect(paneEl.style.display).not.toBe('none');
        expect(paneEl.contains(el(RIGHT_PANE))).toBe(true);
        expect(paneEl.querySelector('[data-testid="pane-view-picker-right"]')).toBeTruthy();
    });

    it('gets out of the way the moment the pane holds a view', () => {
        const shell = buildShell();
        shell.store.dispatch({ type: 'view.pane.set-layout', layout: siteAuthoringDefaultLayout() });
        expect(el(LEFT_PANE).hidden).toBe(true);
        expect(el(RIGHT_PANE).hidden).toBe(true);
    });

    it('⭐ its button FILLS the pane, and leaves the other pane exactly as it was', () => {
        const shell = buildShell();
        shell.store.dispatch({ type: 'view.pane.set-layout', layout: siteAuthoringDefaultLayout() });
        // The one remaining voluntary empty that is NOT collapsed into full screen is a
        // deliberate clear; drive it through the store, then recover from the placeholder.
        shell.store.dispatch({ type: 'view.pane.assign', paneId: RIGHT_PANE, viewType: null });
        expect(el(RIGHT_PANE).hidden).toBe(false);

        document.querySelector<HTMLButtonElement>(`[data-testid="pane-empty-action-${RIGHT_PANE}"]`)!.click();

        expect(shell.store.getLayout()[RIGHT_PANE]).not.toBeNull();
        expect(shell.store.getLayout()[LEFT_PANE]).toBe('site-map-2d'); // sibling untouched.
        expect(el(RIGHT_PANE).hidden).toBe(true);
    });

    it('a REJECTED recovery says why, instead of a button that does nothing', () => {
        // The store rejects an intent the applier refuses, and a rejected intent mutates
        // nothing — so without this the one button an empty pane offers would look broken.
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        const host = new PaneHost(LEFT_PANE, parent);
        const controller = new MultiPaneController([host]);
        const store = new PaneLayoutStore({ [LEFT_PANE]: null }, {
            applier: {
                applyLayout: () => { throw new Error('mount refused'); },
                registeredKinds: () => ALL_KINDS,
            },
        });
        const paneEl = document.createElement('div');
        parent.appendChild(paneEl);
        mountPaneEmptyState({ paneId: LEFT_PANE, paneEl, store });

        paneEl.querySelector<HTMLButtonElement>(`[data-testid="pane-empty-action-${LEFT_PANE}"]`)!.click();

        const err = paneEl.querySelector<HTMLElement>(`[data-testid="pane-empty-error-${LEFT_PANE}"]`)!;
        expect(err.hidden).toBe(false);
        expect(err.textContent).toMatch(/mount refused/i);
        controller.dispose();
    });
});
