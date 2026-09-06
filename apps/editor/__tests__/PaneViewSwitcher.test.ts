// §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412 / L-405, C59 Phase 2) — unit tests for the
// registry-driven switcher's NON-DOM halves: the pure option describer
// (`paneViewOptions.ts`) and the view-state store / command layer (`paneLayoutStore.ts`).
//
// These sit beside PaneViewModel.test.ts (Phase 1a) and run in the same node env — no
// DOM required, because the decisions the founder cares about ("can I put the 3D Site in
// the left pane? what happens to the right one? why is 3D Model greyed out?") are all
// answered before any renderer is touched.

import { describe, it, expect, vi } from 'vitest';
import {
    LEFT_PANE,
    RIGHT_PANE,
    VIEW_TYPE_REGISTRY,
    listPaneViewTypes,
    type PaneLayout,
    type RendererKind,
} from '../src/engine/views/paneViewModel';
import {
    describePaneLayoutActions,
    describePaneViewOptions,
} from '../src/engine/views/paneViewOptions';
import { PaneLayoutStore, type PaneLayoutApplier } from '../src/engine/views/paneLayoutStore';

const EMPTY: PaneLayout = { [LEFT_PANE]: null, [RIGHT_PANE]: null };
const DEFAULT_SITE: PaneLayout = { [LEFT_PANE]: 'site-map-2d', [RIGHT_PANE]: 'site-3d' };
const ALL_KINDS: ReadonlySet<RendererKind> = new Set<RendererKind>([
    'maplibre', 'cesium', 'canvas2d', 'webgpu-three',
]);

function optionFor(layout: PaneLayout, paneId: string, viewType: string, kinds = ALL_KINDS) {
    const o = describePaneViewOptions({ layout, paneId, mountableKinds: kinds })
        .find((x) => x.viewType === viewType);
    if (!o) throw new Error(`no option for ${viewType}`);
    return o;
}

describe('§C59 Phase 2 — the picker is REGISTRY-driven, never a hardcoded list', () => {
    it('offers exactly the registry view types, in registry order', () => {
        const opts = describePaneViewOptions({ layout: EMPTY, paneId: LEFT_PANE });
        expect(opts.map((o) => o.viewType)).toEqual(listPaneViewTypes());
        // …and the founder's two headline views are both there for EITHER pane.
        for (const pane of [LEFT_PANE, RIGHT_PANE]) {
            const types = describePaneViewOptions({ layout: EMPTY, paneId: pane }).map((o) => o.viewType);
            expect(types).toContain('site-3d');
            expect(types).toContain('bim-plan-2d');
        }
    });
});

describe('§C59 Phase 2 — disable-or-EXPLAIN (never a bare greyed option)', () => {
    it('every non-plainly-available option carries a human reason', () => {
        const opts = describePaneViewOptions({
            layout: DEFAULT_SITE, paneId: LEFT_PANE, mountableKinds: ALL_KINDS,
        });
        for (const o of opts) {
            if (o.state !== 'available') expect(o.reason, `${o.viewType} has no reason`).toBeTruthy();
            if (!o.enabled) expect(o.reason!.length).toBeGreaterThan(20); // a real sentence
        }
    });

    it('marks BIM 3D unavailable and says it needs C59 Phase 3 (not silently omitted)', () => {
        const o = optionFor(EMPTY, LEFT_PANE, 'bim-3d');
        expect(o.state).toBe('unavailable');
        expect(o.enabled).toBe(false);
        expect(o.reason).toMatch(/Phase 3/i);
    });

    it('marks elevation/section unavailable and points at where they DO render', () => {
        // ⚠ UPDATED 2026-09-06 (§VIEW-PANEL-PER-PANE). The plan view is spelled "2D PRYZM"
        // now — the founder's own word for it — so this arm names the DESTINATION by the
        // registry's live label rather than by a hard-coded "Plan pane". Pinning the phrase
        // instead of the label is what let the two drift in the first place (C84 EI-8).
        const planLabel = VIEW_TYPE_REGISTRY['bim-plan-2d'].label;
        expect(planLabel).toBe('2D PRYZM');
        for (const vt of ['bim-elevation-2d', 'bim-section-2d']) {
            const o = optionFor(EMPTY, RIGHT_PANE, vt);
            expect(o.enabled).toBe(false);
            expect(o.reason, `${vt} no longer says where it renders`).toContain(planLabel);
            expect(o.reason).toMatch(/pane/i);
        }
    });

    it('explains a MISSING mounter (renderer not wired in this workspace)', () => {
        const o = optionFor(EMPTY, LEFT_PANE, 'bim-plan-2d', new Set<RendererKind>(['cesium']));
        expect(o.enabled).toBe(false);
        expect(o.reason).toMatch(/canvas2d/);
    });

    it('EXPLAINS a singleton move BEFORE the click — which pane empties', () => {
        const o = optionFor(DEFAULT_SITE, LEFT_PANE, 'site-3d');
        expect(o.state).toBe('moves-singleton');
        expect(o.enabled).toBe(true); // the founder's headline: 3D Site into EITHER pane.
        expect(o.movesFromPane).toBe(RIGHT_PANE);
        expect(o.reason).toMatch(/right pane/i);
        expect(o.reason).toMatch(/empt/i);
    });

    it('marks the view already in this pane as `current`', () => {
        const o = optionFor(DEFAULT_SITE, RIGHT_PANE, 'site-3d');
        expect(o.state).toBe('current');
    });
});

describe('§C59 Phase 2 — layout actions', () => {
    it('offers swap in a two-pane split and blocks solo/restore correctly', () => {
        const actions = describePaneLayoutActions(DEFAULT_SITE, LEFT_PANE, false);
        const byKind = Object.fromEntries(actions.map((a) => [a.kind, a]));
        expect(byKind['swap']!.enabled).toBe(true);
        expect(byKind['solo']!.enabled).toBe(true);
        expect(byKind['restore-split']!.enabled).toBe(false);
        expect(byKind['restore-split']!.reason).toBeTruthy();
    });

    it('in full screen: swap is blocked WITH a reason and restore becomes available', () => {
        const solo: PaneLayout = { [LEFT_PANE]: null, [RIGHT_PANE]: 'site-3d' };
        const actions = describePaneLayoutActions(solo, RIGHT_PANE, true);
        const byKind = Object.fromEntries(actions.map((a) => [a.kind, a]));
        expect(byKind['swap']!.enabled).toBe(false);
        expect(byKind['swap']!.reason).toBeTruthy();
        expect(byKind['restore-split']!.enabled).toBe(true);
    });
});

// ── The store / command layer (C59 §2 invariant 3) ───────────────────────────

class RecordingApplier implements PaneLayoutApplier {
    applied: PaneLayout[] = [];
    throwNext = false;
    constructor(private readonly kinds: ReadonlySet<RendererKind> = ALL_KINDS) {}
    applyLayout(next: PaneLayout): void {
        if (this.throwNext) {
            this.throwNext = false;
            throw new Error('mount refused');
        }
        this.applied.push(next);
    }
    registeredKinds(): ReadonlySet<RendererKind> {
        return this.kinds;
    }
}

describe('§C59 Phase 2 — PaneLayoutStore is the ONE write path (P6)', () => {
    it('an assign intent reduces through the pure model and applies to the shell', () => {
        const applier = new RecordingApplier();
        const store = new PaneLayoutStore(EMPTY, { applier });
        const seen: PaneLayout[] = [];
        store.subscribe((l) => seen.push(l));

        const r = store.dispatch({ type: 'view.pane.assign', paneId: RIGHT_PANE, viewType: 'site-3d' });
        expect(r.ok).toBe(true);
        expect(store.getLayout()[RIGHT_PANE]).toBe('site-3d');
        expect(applier.applied).toHaveLength(1);
        expect(seen).toHaveLength(1);
    });

    it('MOVES the singleton: assigning 3D Site to the other pane vacates the first', () => {
        const store = new PaneLayoutStore(DEFAULT_SITE, { applier: new RecordingApplier() });
        const r = store.dispatch({ type: 'view.pane.assign', paneId: LEFT_PANE, viewType: 'site-3d' });
        expect(r.ok).toBe(true);
        expect(store.getLayout()[LEFT_PANE]).toBe('site-3d');
        expect(store.getLayout()[RIGHT_PANE]).toBeNull(); // never two Cesium mounts.
    });

    it('REJECTS a non-hostable view with the contract reason — and changes NOTHING', () => {
        const applier = new RecordingApplier();
        const store = new PaneLayoutStore(DEFAULT_SITE, { applier });
        const listener = vi.fn();
        store.subscribe(listener);

        const r = store.dispatch({ type: 'view.pane.assign', paneId: LEFT_PANE, viewType: 'bim-3d' });
        expect(r.ok).toBe(false);
        expect(r.rejected).toMatch(/Phase 3/i);
        expect(store.getLayout()).toEqual(DEFAULT_SITE);
        expect(applier.applied).toHaveLength(0); // no renderer touched
        expect(listener).not.toHaveBeenCalled(); // no subscriber misled
    });

    it('REJECTS a view whose renderer has no mounter here, naming the renderer', () => {
        const store = new PaneLayoutStore(EMPTY, {
            applier: new RecordingApplier(new Set<RendererKind>(['maplibre'])),
        });
        const r = store.dispatch({ type: 'view.pane.assign', paneId: LEFT_PANE, viewType: 'site-3d' });
        expect(r.ok).toBe(false);
        expect(r.rejected).toMatch(/cesium/);
    });

    it('ROLLS BACK when the imperative shell refuses the mount', () => {
        const applier = new RecordingApplier();
        applier.throwNext = true;
        const store = new PaneLayoutStore(DEFAULT_SITE, { applier });
        const r = store.dispatch({ type: 'view.pane.assign', paneId: LEFT_PANE, viewType: 'bim-plan-2d' });
        expect(r.ok).toBe(false);
        expect(r.rejected).toMatch(/mount refused/);
        expect(store.getLayout()).toEqual(DEFAULT_SITE); // store never diverges from panes
    });

    it('guards a hand-built double-mount layout before any renderer is touched', () => {
        const applier = new RecordingApplier();
        const store = new PaneLayoutStore(EMPTY, { applier });
        const r = store.dispatch({
            type: 'view.pane.set-layout',
            layout: { [LEFT_PANE]: 'site-3d', [RIGHT_PANE]: 'site-3d' },
        });
        expect(r.ok).toBe(false);
        expect(r.rejected).toMatch(/only one cesium/i);
        expect(applier.applied).toHaveLength(0);
    });

    it('solo → full screen (other pane vacated) and restore-split brings it back', () => {
        const store = new PaneLayoutStore(DEFAULT_SITE, { applier: new RecordingApplier() });
        expect(store.canRestoreSplit()).toBe(false);

        const solo = store.dispatch({ type: 'view.pane.solo', paneId: RIGHT_PANE });
        expect(solo.ok).toBe(true);
        expect(store.getLayout()).toEqual({ [LEFT_PANE]: null, [RIGHT_PANE]: 'site-3d' });
        expect(store.canRestoreSplit()).toBe(true);

        const back = store.dispatch({ type: 'view.pane.restore-split' });
        expect(back.ok).toBe(true);
        expect(store.getLayout()).toEqual(DEFAULT_SITE);
        expect(store.canRestoreSplit()).toBe(false);
    });

    it('swap exchanges the two panes', () => {
        const store = new PaneLayoutStore(DEFAULT_SITE, { applier: new RecordingApplier() });
        store.dispatch({ type: 'view.pane.swap', a: LEFT_PANE, b: RIGHT_PANE });
        expect(store.getLayout()[LEFT_PANE]).toBe('site-3d');
        expect(store.getLayout()[RIGHT_PANE]).toBe('site-map-2d');
    });

    it('rejects an unknown pane', () => {
        const store = new PaneLayoutStore(EMPTY, { applier: new RecordingApplier() });
        const r = store.dispatch({ type: 'view.pane.assign', paneId: 'pane-9', viewType: 'site-3d' });
        expect(r.ok).toBe(false);
        expect(r.rejected).toMatch(/Unknown pane/);
    });

    it('a no-op dispatch neither re-applies nor notifies', () => {
        const applier = new RecordingApplier();
        const store = new PaneLayoutStore(DEFAULT_SITE, { applier });
        const listener = vi.fn();
        store.subscribe(listener);
        const r = store.dispatch({ type: 'view.pane.assign', paneId: RIGHT_PANE, viewType: 'site-3d' });
        expect(r.ok).toBe(true);
        expect(applier.applied).toHaveLength(0);
        expect(listener).not.toHaveBeenCalled();
    });
});

describe('§C59 Phase 2 — registry integrity', () => {
    it('every non-hostable view type states WHY (the picker has something to show)', () => {
        for (const vt of listPaneViewTypes()) {
            const d = VIEW_TYPE_REGISTRY[vt];
            if (!d.paneHostable) expect(d.unavailableReason, `${vt}`).toBeTruthy();
        }
    });

    it('the Phase-1b site views and the plan view are hostable today', () => {
        expect(VIEW_TYPE_REGISTRY['site-map-2d'].paneHostable).toBe(true);
        expect(VIEW_TYPE_REGISTRY['site-3d'].paneHostable).toBe(true);
        expect(VIEW_TYPE_REGISTRY['bim-plan-2d'].paneHostable).toBe(true);
    });
});
