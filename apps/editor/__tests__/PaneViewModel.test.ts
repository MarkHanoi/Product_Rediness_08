// §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59) — unit tests for the PURE pane/view
// model (Phase 1a). The live pane hosts mount real renderers (Cesium / MapLibre /
// WebGPU / Canvas2D) that cannot run headless, so we pin the layout algebra +
// singleton-safety invariant here — the same approach as GlobePlacementDecisions.test.ts.

import { describe, it, expect } from 'vitest';
import {
    LEFT_PANE,
    RIGHT_PANE,
    VIEW_TYPE_REGISTRY,
    assignViewToPane,
    swapPanes,
    validatePaneLayout,
    panesShowingRenderer,
    resolveHostPane,
    siteAuthoringDefaultLayout,
    type PaneLayout,
} from '../src/engine/views/paneViewModel';

const EMPTY: PaneLayout = { [LEFT_PANE]: null, [RIGHT_PANE]: null };

describe('§L-412 VIEW_TYPE_REGISTRY — renderer-agnostic view catalogue', () => {
    it('classifies the four launch view types + marks the heavyweight singletons', () => {
        expect(VIEW_TYPE_REGISTRY['site-3d'].rendererKind).toBe('cesium');
        expect(VIEW_TYPE_REGISTRY['site-3d'].singleton).toBe(true);
        expect(VIEW_TYPE_REGISTRY['bim-3d'].singleton).toBe(true);       // one WebGPU device
        expect(VIEW_TYPE_REGISTRY['site-map-2d'].singleton).toBe(false); // MapLibre is cheap
        expect(VIEW_TYPE_REGISTRY['bim-plan-2d'].singleton).toBe(false); // Canvas2D is cheap
    });
});

describe('§L-412 assignViewToPane — the "swap any view into any pane" core', () => {
    it('assigns a view to a pane immutably', () => {
        const next = assignViewToPane(EMPTY, LEFT_PANE, 'site-map-2d');
        expect(next[LEFT_PANE]).toBe('site-map-2d');
        expect(next[RIGHT_PANE]).toBeNull();
        expect(EMPTY[LEFT_PANE]).toBeNull(); // original untouched.
    });

    it('MOVES a singleton (3D Site) rather than cloning it — vacates the old pane', () => {
        // Founder's canonical case: 3D Site on the right, then the user drags it to the
        // left. There is ONE Cesium instance, so the right pane must empty out.
        const rightHas3d = assignViewToPane(EMPTY, RIGHT_PANE, 'site-3d');
        const movedLeft = assignViewToPane(rightHas3d, LEFT_PANE, 'site-3d');
        expect(movedLeft[LEFT_PANE]).toBe('site-3d');
        expect(movedLeft[RIGHT_PANE]).toBeNull(); // vacated — never two Cesium mounts.
        expect(validatePaneLayout(movedLeft).ok).toBe(true);
    });

    it('lets two CHEAP views co-exist (2D map left · plan right)', () => {
        let l = assignViewToPane(EMPTY, LEFT_PANE, 'site-map-2d');
        l = assignViewToPane(l, RIGHT_PANE, 'bim-plan-2d');
        expect(l[LEFT_PANE]).toBe('site-map-2d');
        expect(l[RIGHT_PANE]).toBe('bim-plan-2d');
        expect(validatePaneLayout(l).ok).toBe(true);
    });

    it('supports the founder default: 2D map LEFT · 3D Site RIGHT — valid, no conflict', () => {
        let l = assignViewToPane(EMPTY, LEFT_PANE, 'site-map-2d');
        l = assignViewToPane(l, RIGHT_PANE, 'site-3d');
        expect(validatePaneLayout(l).ok).toBe(true);
        expect(resolveHostPane(l, 'site-3d')).toBe(RIGHT_PANE);
        expect(resolveHostPane(l, 'site-map-2d')).toBe(LEFT_PANE);
    });
});

describe('§L-412 validatePaneLayout — singleton renderer safety (no double-mount / P3)', () => {
    it('flags a hand-built layout that puts two Cesium views in both panes', () => {
        const bad: PaneLayout = { [LEFT_PANE]: 'site-3d', [RIGHT_PANE]: 'site-3d' };
        const r = validatePaneLayout(bad);
        expect(r.ok).toBe(false);
        expect(r.conflicts[0]!.rendererKind).toBe('cesium');
        expect(r.conflicts[0]!.panes.sort()).toEqual([LEFT_PANE, RIGHT_PANE].sort());
    });

    it('flags two WebGPU BIM-3D views (one GPU device only)', () => {
        const bad: PaneLayout = { [LEFT_PANE]: 'bim-3d', [RIGHT_PANE]: 'bim-3d' };
        expect(validatePaneLayout(bad).ok).toBe(false);
    });

    it('a mixed singleton pair (3D Site + BIM 3D) is allowed — different devices', () => {
        const l: PaneLayout = { [LEFT_PANE]: 'bim-3d', [RIGHT_PANE]: 'site-3d' };
        expect(validatePaneLayout(l).ok).toBe(true);
    });
});

describe('§L-412 swapPanes — swap left ↔ right', () => {
    it('swaps the two panes’ views', () => {
        const start: PaneLayout = { [LEFT_PANE]: 'site-map-2d', [RIGHT_PANE]: 'site-3d' };
        const swapped = swapPanes(start, LEFT_PANE, RIGHT_PANE);
        expect(swapped[LEFT_PANE]).toBe('site-3d');
        expect(swapped[RIGHT_PANE]).toBe('site-map-2d');
        // A swap never breaks the singleton invariant.
        expect(validatePaneLayout(swapped).ok).toBe(true);
    });
});

describe('§L-412 siteAuthoringDefaultLayout — the Phase-1b founder default (model-derived)', () => {
    it('is 2D map LEFT · 3D Site RIGHT, derived through assignViewToPane (not hard-coded)', () => {
        const layout = siteAuthoringDefaultLayout();
        expect(layout[LEFT_PANE]).toBe('site-map-2d');
        expect(layout[RIGHT_PANE]).toBe('site-3d');
    });

    it('is conflict-free (no singleton double-mount) + resolves the hosts', () => {
        const layout = siteAuthoringDefaultLayout();
        expect(validatePaneLayout(layout).ok).toBe(true);
        expect(resolveHostPane(layout, 'site-3d')).toBe(RIGHT_PANE);
        expect(resolveHostPane(layout, 'site-map-2d')).toBe(LEFT_PANE);
        // The single Cesium is claimed by exactly one pane (the right).
        expect(panesShowingRenderer(layout, 'cesium')).toEqual([RIGHT_PANE]);
    });

    it('lets the user then SWAP the 3D Site into the LEFT pane — the singleton MOVES', () => {
        const start = siteAuthoringDefaultLayout();
        const moved = assignViewToPane(start, LEFT_PANE, 'site-3d');
        expect(moved[LEFT_PANE]).toBe('site-3d');
        expect(moved[RIGHT_PANE]).toBeNull(); // vacated — never two Cesium mounts.
        expect(validatePaneLayout(moved).ok).toBe(true);
    });
});

describe('§L-412 panesShowingRenderer — GPU accounting', () => {
    it('reports which panes drive a given renderer', () => {
        const l: PaneLayout = { [LEFT_PANE]: 'site-map-2d', [RIGHT_PANE]: 'site-3d' };
        expect(panesShowingRenderer(l, 'cesium')).toEqual([RIGHT_PANE]);
        expect(panesShowingRenderer(l, 'maplibre')).toEqual([LEFT_PANE]);
        expect(panesShowingRenderer(l, 'webgpu-three')).toEqual([]);
    });
});
