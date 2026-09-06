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
    parcelLawDefaultLayout,
    siteAuthoringDefaultLayout,
    type PaneLayout,
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


// ═══════════════════════════════════════════════════════════════════════════════════════
// §PANE-PLACEMENT-AFTER-MODE-SWITCH (L-12988) + §MAP-IS-A-SINGLETON-TOO (L-12992)
//
// The founder's report, verbatim: *"after selecting analyse — parcel law — then author the
// right hand side gets corrupted"*, with the 3D Site filling the LEFT half and the RIGHT half
// blank; and *"if i clicked 2d map view it would render on the left hand side"*, with the pane
// that asked for the map BLACK.
//
// ⭐ WHAT THESE TESTS MODEL, AND WHY IT IS THE REAL SHAPE. A real mounter owns ONE surface
// node and re-parents it; `FakeMounter` above owns nothing, so it can record that it was
// CALLED but never that the surface ended up in the wrong pane — which is the entire defect.
// `SurfaceMounter` below therefore keeps a real DOM node and real (stubbed) geometry, so
// "parent and measured width agree with the pane the view model says owns it" is an assertion
// about the document rather than about a call log.
// ═══════════════════════════════════════════════════════════════════════════════════════

/** Give a pane element a MEASURABLE box (happy-dom reports 0 for everything by default). */
function stubWidth(el: HTMLElement, width: number): void {
    Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
}

/**
 * A mounter that behaves like the real singletons: it owns ONE surface node, MOVES it between
 * panes, can say where that node actually is, and measures itself against the pane it lands in.
 */
class SurfaceMounter implements PaneRendererMounter {
    readonly surface = document.createElement('div');
    mountCount = 0;
    unmountCount = 0;
    relocateCount = 0;
    resizeCount = 0;
    /** The width the surface last measured — the canvas size, in the founder's console. */
    measuredWidth = 0;
    /** Where a `mount()` should re-home the surface when it leaves a pane (like #container). */
    home: HTMLElement | null = null;
    /** Set to a Promise to make `mount()` async, like Cesium's. */
    pending: Promise<void> | null = null;

    constructor(readonly rendererKind: RendererKind) {}

    mount(paneEl: HTMLElement): void | Promise<void> {
        this.mountCount++;
        if (!this.pending) { this.place(paneEl); return; }
        const p = this.pending;
        this.pending = null;
        return p.then(() => { this.place(paneEl); });
    }
    relocate(paneEl: HTMLElement): void {
        this.relocateCount++;
        this.place(paneEl);
    }
    isPlacedIn(paneEl: HTMLElement): boolean {
        return this.surface.parentElement === paneEl;
    }
    unmount(): void {
        this.unmountCount++;
        if (this.home) this.home.appendChild(this.surface);
        else this.surface.remove();
    }
    resize(): void {
        this.resizeCount++;
        this.measuredWidth = (this.surface.parentElement as HTMLElement | null)?.clientWidth ?? 0;
    }
    private place(paneEl: HTMLElement): void {
        paneEl.appendChild(this.surface);
        this.resize();
    }
}

/** Let the shell's coalesced settle pass (frame scheduler → deferWork fallback) run. */
const flushSettle = (): Promise<void> =>
    new Promise((resolve) => { setTimeout(resolve, 5); });

describe('§PANE-PLACEMENT-AFTER-MODE-SWITCH (L-12988) — placement is asserted, not assumed', () => {
    it('a mount that resolves AFTER the layout moved on lands in the pane the LAYOUT names', async () => {
        // THE FOUNDER'S SEQUENCE. Cesium's mount awaits `awaitCesiumReady()`; while it awaits,
        // the mode switch re-applies a layout. The old code let the late mount re-parent the
        // ONE container into a pane the layout had already vacated, and nothing looked again —
        // `reparentContainerTo #pryzm-pane-right` while the picture was in the other half.
        const { controller, left, right } = makeController();
        const cesium = new SurfaceMounter('cesium');
        controller.registerMounter(cesium);

        let release!: () => void;
        cesium.pending = new Promise<void>((r) => { release = r; });
        const inFlight = controller.assignView(RIGHT_PANE, 'site-3d');
        expect(cesium.surface.parentElement).toBeNull(); // still constructing.

        // The layout moves on while the mount is in flight.
        controller.applyLayout({ [LEFT_PANE]: 'site-3d', [RIGHT_PANE]: null });

        release();
        await inFlight;

        // ⭐ The committed layout wins. One container, in the LEFT pane, and the right is empty.
        expect(cesium.surface.parentElement).toBe(left);
        expect(right.contains(cesium.surface)).toBe(false);
        expect(controller.paneHosting('site-3d')).toBe(LEFT_PANE);
    });

    it('a mount that resolves after its view was VACATED sends its surface home', async () => {
        const { controller } = makeController();
        const home = document.createElement('div');
        document.body.appendChild(home);
        const cesium = new SurfaceMounter('cesium');
        cesium.home = home;
        controller.registerMounter(cesium);

        let release!: () => void;
        cesium.pending = new Promise<void>((r) => { release = r; });
        const inFlight = controller.assignView(RIGHT_PANE, 'site-3d');
        controller.applyLayout({ [LEFT_PANE]: null, [RIGHT_PANE]: null });
        release();
        await inFlight;

        // Not parked in a pane nothing points at — re-homed, exactly as the unmount path does.
        expect(cesium.surface.parentElement).toBe(home);
    });

    it('reassertPlacement PUTS BACK a surface that is in the wrong pane, and re-measures it', () => {
        const { controller, left, right } = makeController();
        stubWidth(left, 300);
        stubWidth(right, 784);
        const cesium = new SurfaceMounter('cesium');
        controller.registerMounter(cesium);
        controller.applyLayout({ [LEFT_PANE]: null, [RIGHT_PANE]: 'site-3d' });
        expect(cesium.surface.parentElement).toBe(right);

        // Simulate the disagreement the founder photographed: the surface is in the OTHER pane
        // while the layout still says `right`. (In production this is a late mount, a mode
        // switch re-writing #container, or a third writer moving the box underneath.)
        left.appendChild(cesium.surface);

        const report = controller.reassertPlacement();
        expect(cesium.surface.parentElement).toBe(right);
        expect(cesium.measuredWidth).toBe(784);           // measured against the RIGHT pane.
        expect(report.find((r) => r.paneId === RIGHT_PANE)?.corrected).toBe(true);
    });

    it('reassertPlacement leaves a correctly placed surface alone (no re-mount churn)', () => {
        const { controller, right } = makeController();
        stubWidth(right, 784);
        const cesium = new SurfaceMounter('cesium');
        controller.registerMounter(cesium);
        controller.applyLayout({ [LEFT_PANE]: null, [RIGHT_PANE]: 'site-3d' });
        const mountsBefore = cesium.mountCount;
        const relocsBefore = cesium.relocateCount;

        controller.reassertPlacement();

        expect(cesium.mountCount).toBe(mountsBefore);
        expect(cesium.relocateCount).toBe(relocsBefore);
        expect(cesium.surface.parentElement).toBe(right);
    });

    it('never re-mounts a mounter that cannot report its placement (no second instance)', () => {
        // ⛔ The safety rule: `mount()` is not universally idempotent — the real MapLibre
        // mounter's OPENS a map. A mounter with no `isPlacedIn` is reflowed and left alone.
        const { controller } = makeController();
        const blind = new FakeMounter('maplibre');
        controller.registerMounter(blind);
        controller.assignView(LEFT_PANE, 'site-map-2d');
        const mountsBefore = blind.mountCount;

        const report = controller.reassertPlacement();

        expect(blind.mountCount).toBe(mountsBefore);
        expect(report.find((r) => r.paneId === LEFT_PANE)?.unknown).toBe(true);
    });

    it('a late mount into a DISPOSED shell re-homes instead of parking in a detached pane', async () => {
        const { controller } = makeController();
        const home = document.createElement('div');
        document.body.appendChild(home);
        const cesium = new SurfaceMounter('cesium');
        cesium.home = home;
        controller.registerMounter(cesium);

        let release!: () => void;
        cesium.pending = new Promise<void>((r) => { release = r; });
        const inFlight = controller.assignView(RIGHT_PANE, 'site-3d');
        controller.dispose();
        release();
        await inFlight;

        expect(cesium.surface.parentElement).toBe(home);
    });
});

describe('§MAP-IS-A-SINGLETON-TOO (L-12992) — a pane-to-pane move RELOCATES, never disposes', () => {
    it('moving the 2D map to the other pane keeps the ONE map alive and vacates the first', () => {
        // THE FOUNDER'S CLICK. `unmount()` on the real MapLibre mounter DISPOSES the map (that
        // is how it goes away at generate-time), so a move used to destroy it: `map2d:
        // disposed`, tiles refetched, the draw-readiness stamp cleared, a black pane and a
        // watchdog spinning on `surface-not-ready`.
        const { controller, left, right } = makeController();
        const map = new SurfaceMounter('maplibre');
        controller.registerMounter(map);
        controller.assignView(LEFT_PANE, 'site-map-2d');
        expect(map.surface.parentElement).toBe(left);

        controller.assignView(RIGHT_PANE, 'site-map-2d');

        expect(map.unmountCount).toBe(0);          // ⭐ never torn down for a move.
        expect(map.relocateCount).toBe(1);
        expect(map.surface.parentElement).toBe(right);
        // The pure model VACATED the left pane, so no pane is left holding a surfaceless view.
        expect(controller.getLayout()[LEFT_PANE]).toBeNull();
        expect(controller.paneHosting('site-map-2d')).toBe(RIGHT_PANE);
    });

    it('a genuine departure still unmounts (relocate does not swallow teardown)', () => {
        const { controller } = makeController();
        const map = new SurfaceMounter('maplibre');
        controller.registerMounter(map);
        controller.assignView(LEFT_PANE, 'site-map-2d');

        controller.applyLayout({ [LEFT_PANE]: null, [RIGHT_PANE]: null });

        expect(map.unmountCount).toBe(1);
        expect(map.relocateCount).toBe(0);
    });
});

describe('§PANE-PLACEMENT-AFTER-MODE-SWITCH — the shell settles ONCE per transition', () => {
    it('collapses a burst of resize triggers into ONE reflow pass', async () => {
        // THE THRASH, MEASURED: ONE layout change produced SEVEN Cesium resizes to seven
        // different widths (511 → 372 → 367 → 256 → 248 → 252 → 391). Each is a buffer
        // re-allocation against a box that has not stopped moving, and the last one it happens
        // to catch is the width the canvas keeps.
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        const shell = mountSiteAuthoringPaneShell({ parent, viewPicker: false });
        const cesium = new SurfaceMounter('cesium');
        shell.controller.registerMounter(cesium);
        shell.store.dispatch({
            type: 'view.pane.set-layout',
            layout: { [LEFT_PANE]: null, [RIGHT_PANE]: 'site-3d' },
        });
        await flushSettle();
        const before = cesium.resizeCount;

        for (let i = 0; i < 7; i++) window.dispatchEvent(new Event('resize'));
        await flushSettle();

        // One settle pass. (It reflows the hosted renderer once; the placement check reflows
        // it as its last step, which is the same pass — never seven.)
        expect(cesium.resizeCount - before).toBeLessThanOrEqual(2);
        shell.dispose();
    });

    it('after a mode switch the surface’s parent AND its measured width agree with the pane the store owns it in', async () => {
        // ⭐ THE REGRESSION THE FOUNDER REPORTED, END TO END. The shell's box is re-written
        // underneath it (a workspace mode switch rewrites `#container.style.width` — three
        // writers, no protocol) and the surface is left in the wrong pane. One placement pass
        // has to make the DOCUMENT agree with the STORE again, in both parent and size.
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        const shell = mountSiteAuthoringPaneShell({ parent, viewPicker: false });
        const plan = new SurfaceMounter('canvas2d');
        const cesium = new SurfaceMounter('cesium');
        shell.controller.registerMounter(plan);
        shell.controller.registerMounter(cesium);

        // The founder's asked-for opening: PLAN LEFT · 3D SITE RIGHT.
        const layout: PaneLayout = parcelLawDefaultLayout();
        shell.store.dispatch({ type: 'view.pane.set-layout', layout });
        await flushSettle();

        const leftEl = shell.getPaneElement(LEFT_PANE)!;
        const rightEl = shell.getPaneElement(RIGHT_PANE)!;
        // The mode switch: the shell is now half as wide, and the panes with it.
        stubWidth(leftEl, 392);
        stubWidth(rightEl, 392);
        // ...and the transition left the 3D Site in the WRONG pane.
        leftEl.appendChild(cesium.surface);

        shell.reassertPlacement();
        await flushSettle();

        expect(shell.store.getLayout()[LEFT_PANE]).toBe('bim-plan-2d');
        expect(shell.store.getLayout()[RIGHT_PANE]).toBe('site-3d');
        expect(cesium.surface.parentElement).toBe(rightEl);   // parent agrees with the store...
        expect(cesium.measuredWidth).toBe(392);               // ...and so does the measurement.
        expect(plan.surface.parentElement).toBe(leftEl);
        expect(plan.measuredWidth).toBe(392);
        shell.dispose();
    });
});
