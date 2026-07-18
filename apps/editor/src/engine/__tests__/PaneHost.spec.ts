// §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59 Phase 1b) — LIVE pane-host tests.
//
// The Phase-1a pure model is pinned in apps/editor/__tests__/PaneViewModel.test.ts.
// Here we pin the LIVE wiring (PaneHost + MultiPaneController + SiteAuthoringPaneShell)
// against happy-dom with FAKE mounters that record how they are driven — so we prove,
// without a real Cesium/MapLibre, that:
//   • a view mounts into its assigned PANE element (not #container);
//   • the singleton (3D Site) MOVES between panes — the SAME mounter instance is
//     re-targeted (never a second instance), the old pane is unmounted;
//   • validatePaneLayout is asserted before a (re)mount (double-mount throws);
//   • the founder default layout mounts the 2D map LEFT + 3D Site RIGHT;
//   • the divider shell builds the tiled DOM + reflows on dispose.

import { describe, it, expect, beforeEach } from 'vitest';
import { PaneHost, MultiPaneController, type PaneRendererMounter } from '../views/PaneHost';
import { mountSiteAuthoringPaneShell } from '../views/SiteAuthoringPaneShell';
import {
    LEFT_PANE,
    RIGHT_PANE,
    siteAuthoringDefaultLayout,
    type RendererKind,
} from '../views/paneViewModel';

/** A fake mounter that records every call + the pane element it was mounted into. */
class FakeMounter implements PaneRendererMounter {
    mountCount = 0;
    unmountCount = 0;
    resizeCount = 0;
    lastPaneEl: HTMLElement | null = null;
    mountedInto: HTMLElement[] = [];
    constructor(readonly rendererKind: RendererKind) {}
    mount(paneEl: HTMLElement): void {
        this.mountCount++;
        this.lastPaneEl = paneEl;
        this.mountedInto.push(paneEl);
    }
    unmount(): void {
        this.unmountCount++;
        this.lastPaneEl = null;
    }
    resize(): void {
        this.resizeCount++;
    }
}

function makeController(): {
    controller: MultiPaneController;
    left: HTMLElement;
    right: HTMLElement;
} {
    const left = document.createElement('div');
    const right = document.createElement('div');
    document.body.append(left, right);
    const controller = new MultiPaneController([
        new PaneHost(LEFT_PANE, left),
        new PaneHost(RIGHT_PANE, right),
    ]);
    return { controller, left, right };
}

beforeEach(() => {
    document.body.innerHTML = '';
});

describe('§L-412 PaneHost — a view mounts into its PANE element', () => {
    it('mounts the mounter into the pane element (not #container)', () => {
        const el = document.createElement('div');
        const host = new PaneHost(LEFT_PANE, el);
        const m = new FakeMounter('maplibre');
        host.mount('site-map-2d', m);
        expect(m.mountCount).toBe(1);
        expect(m.lastPaneEl).toBe(el);
        // The host makes the pane a positioning context so an inset:0 surface fills it.
        expect(el.style.position).toBe('relative');
        expect(el.style.overflow).toBe('hidden');
    });

    it('re-mounting the SAME view+mounter only resizes (idempotent)', () => {
        const host = new PaneHost(LEFT_PANE, document.createElement('div'));
        const m = new FakeMounter('cesium');
        host.mount('site-3d', m);
        host.mount('site-3d', m);
        expect(m.mountCount).toBe(1);
        expect(m.resizeCount).toBe(1);
    });

    it('unmounts the previous view when a different view is mounted', () => {
        const host = new PaneHost(LEFT_PANE, document.createElement('div'));
        const map = new FakeMounter('maplibre');
        const cesium = new FakeMounter('cesium');
        host.mount('site-map-2d', map);
        host.mount('site-3d', cesium);
        expect(map.unmountCount).toBe(1);
        expect(cesium.mountCount).toBe(1);
        expect(host.viewType).toBe('site-3d');
    });
});

describe('§L-412 MultiPaneController — layout drives the hosts', () => {
    it('applies the founder default: 2D map LEFT · 3D Site RIGHT', () => {
        const { controller, left, right } = makeController();
        const map = new FakeMounter('maplibre');
        const cesium = new FakeMounter('cesium');
        controller.registerMounter(map);
        controller.registerMounter(cesium);

        controller.applyLayout(siteAuthoringDefaultLayout());

        expect(map.lastPaneEl).toBe(left);   // 2D map in the LEFT pane element.
        expect(cesium.lastPaneEl).toBe(right); // 3D Site in the RIGHT pane element.
        expect(controller.hostsView('site-3d')).toBe(true);
        expect(controller.paneHosting('site-3d')).toBe(RIGHT_PANE);
        expect(controller.paneHosting('site-map-2d')).toBe(LEFT_PANE);
    });

    it('MOVES the 3D Site singleton between panes — the ONE mounter re-targets, no clone', () => {
        const { controller, left, right } = makeController();
        const cesium = new FakeMounter('cesium'); // the ONE Cesium instance.
        controller.registerMounter(cesium);

        controller.assignView(RIGHT_PANE, 'site-3d');
        expect(cesium.mountCount).toBe(1);
        expect(cesium.lastPaneEl).toBe(right);

        // Drag it to the LEFT pane: the SAME mounter is re-targeted; the right pane vacates.
        controller.assignView(LEFT_PANE, 'site-3d');
        expect(cesium.unmountCount).toBe(1);        // right pane unmounted...
        expect(cesium.mountCount).toBe(2);          // ...and re-mounted into left.
        expect(cesium.lastPaneEl).toBe(left);
        expect(controller.paneHosting('site-3d')).toBe(LEFT_PANE);
        expect(controller.getLayout()[RIGHT_PANE]).toBeNull(); // never two Cesium mounts.
        // Only ever ONE mounter instance existed — the host never constructs a second one.
        expect(cesium.mountedInto).toEqual([right, left]);
    });

    it('THROWS before touching renderers when a layout double-mounts a singleton', () => {
        const { controller } = makeController();
        controller.registerMounter(new FakeMounter('cesium'));
        // A hand-built illegal layout — both panes claim the single Cesium.
        expect(() =>
            controller.applyLayout({ [LEFT_PANE]: 'site-3d', [RIGHT_PANE]: 'site-3d' }),
        ).toThrow(/double-mount/i);
    });

    it('resize() fans out to the hosted renderer', () => {
        const { controller } = makeController();
        const cesium = new FakeMounter('cesium');
        controller.registerMounter(cesium);
        controller.assignView(RIGHT_PANE, 'site-3d');
        controller.resize();
        expect(cesium.resizeCount).toBeGreaterThanOrEqual(1);
    });
});

describe('§L-412 SiteAuthoringPaneShell — the tiled two-pane DOM geometry', () => {
    it('builds LEFT + divider + RIGHT tiled inside the parent', () => {
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        const shell = mountSiteAuthoringPaneShell({ parent });
        expect(shell.root.querySelector('#pryzm-pane-left')).toBeTruthy();
        expect(shell.root.querySelector('#pryzm-pane-divider')).toBeTruthy();
        expect(shell.root.querySelector('#pryzm-pane-right')).toBeTruthy();
        expect(shell.getPaneElement(LEFT_PANE)).toBeTruthy();
        expect(shell.getPaneElement(RIGHT_PANE)).toBeTruthy();
        expect(parent.contains(shell.root)).toBe(true);
    });

    it('mounts renderers into its panes and disposes cleanly', () => {
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        const shell = mountSiteAuthoringPaneShell({ parent });
        const map = new FakeMounter('maplibre');
        const cesium = new FakeMounter('cesium');
        shell.controller.registerMounter(map);
        shell.controller.registerMounter(cesium);
        shell.controller.applyLayout(siteAuthoringDefaultLayout());

        expect(map.lastPaneEl).toBe(shell.getPaneElement(LEFT_PANE));
        expect(cesium.lastPaneEl).toBe(shell.getPaneElement(RIGHT_PANE));

        shell.dispose();
        expect(shell.isDisposed).toBe(true);
        expect(parent.contains(shell.root)).toBe(false);
        // Dispose unmounts both renderers (Cesium re-homes / map disposes via mounter).
        expect(map.unmountCount).toBe(1);
        expect(cesium.unmountCount).toBe(1);
    });
});
