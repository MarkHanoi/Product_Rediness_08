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
    parcelLawDefaultLayout,
    paneLayoutForPreset,
    type PaneLayout,
} from '../src/engine/views/paneViewModel';

const EMPTY: PaneLayout = { [LEFT_PANE]: null, [RIGHT_PANE]: null };

describe('§L-412 VIEW_TYPE_REGISTRY — renderer-agnostic view catalogue', () => {
    it('classifies the four launch view types + marks the heavyweight singletons', () => {
        expect(VIEW_TYPE_REGISTRY['site-3d'].rendererKind).toBe('cesium');
        expect(VIEW_TYPE_REGISTRY['site-3d'].singleton).toBe(true);
        expect(VIEW_TYPE_REGISTRY['bim-3d'].singleton).toBe(true);       // one WebGPU device
        // §MAP-IS-A-SINGLETON-TOO (L-12992) — ⛔ THESE TWO READ `false` UNTIL 2026-09-06, WITH
        // THE COMMENTS "MapLibre is cheap" / "Canvas2D is cheap" BESIDE THEM. Cheapness is not
        // what this flag means: `singleton` asks whether the backing renderer can be in two
        // panes AT ONCE, and neither of these can. There is ONE `SiteBoundaryMap2D` behind one
        // module-scoped handle, and ONE `#svp-secondary-pane` DOM node (a node has one parent).
        // The measured consequence of the old answer is the founder's black pane: the model
        // called `{left:'site-map-2d', right:'site-map-2d'}` legal, the live host could only
        // realise half of it, and the pane that lost held a view with no surface.
        expect(VIEW_TYPE_REGISTRY['site-map-2d'].singleton).toBe(true);
        expect(VIEW_TYPE_REGISTRY['bim-plan-2d'].singleton).toBe(true);
    });

    it('§L-12992 refuses a layout that puts the ONE 2D map in BOTH panes', () => {
        // The founder's gesture: the map is on the left, he asks for it on the right.
        const both: PaneLayout = { [LEFT_PANE]: 'site-map-2d', [RIGHT_PANE]: 'site-map-2d' };
        const check = validatePaneLayout(both);
        expect(check.ok).toBe(false);
        expect(check.conflicts.map((c) => c.rendererKind)).toContain('maplibre');
        // ...and the reducer never produces it: assigning it right VACATES the left.
        const moved = assignViewToPane(
            { [LEFT_PANE]: 'site-map-2d', [RIGHT_PANE]: 'site-3d' },
            RIGHT_PANE,
            'site-map-2d',
        );
        expect(moved[RIGHT_PANE]).toBe('site-map-2d');
        expect(moved[LEFT_PANE]).toBeNull();
        expect(validatePaneLayout(moved).ok).toBe(true);
    });

    it('§L-12992 refuses the same for the ONE Canvas2D plan node', () => {
        const both: PaneLayout = { [LEFT_PANE]: 'bim-plan-2d', [RIGHT_PANE]: 'bim-plan-2d' };
        expect(validatePaneLayout(both).ok).toBe(false);
    });
});

describe('§PANE-DEFAULT-IS-PLAN-LEFT (L-12988) — the Parcel Law opening', () => {
    it('opens PLAN LEFT · 3D SITE RIGHT — the founder\'s sentence, verbatim', () => {
        const layout = parcelLawDefaultLayout();
        expect(layout[LEFT_PANE]).toBe('bim-plan-2d');
        expect(layout[RIGHT_PANE]).toBe('site-3d');
        expect(validatePaneLayout(layout).ok).toBe(true);
    });

    it('does NOT change the onboarding opening — the 2D draw map stays on its left', () => {
        // ⛔ The guarded half. Onboarding's left pane is the surface its flow makes the user
        // draw the plot on (§ONBOARDING-STEP-PINS-ITS-SURFACE); re-pointing it at the plan
        // would break the draw step to fix a different screen.
        const onboarding = siteAuthoringDefaultLayout();
        expect(onboarding[LEFT_PANE]).toBe('site-map-2d');
        expect(onboarding[RIGHT_PANE]).toBe('site-3d');
    });

    it('resolves both presets by NAME, and an absent preset is the onboarding one', () => {
        expect(paneLayoutForPreset('parcel-law')).toEqual(parcelLawDefaultLayout());
        expect(paneLayoutForPreset('site-authoring')).toEqual(siteAuthoringDefaultLayout());
        expect(paneLayoutForPreset(undefined)).toEqual(siteAuthoringDefaultLayout());
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
