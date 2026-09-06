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
    listPaneViewTypes,
    paneOccupancy,
    emptyPanes,
    type PaneLayout,
    type ViewType,
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
        // ...and the reducer never produces it: assigning it right SWAPS the two panes.
        //
        // ⚠ THIS ARM READ `expect(moved[LEFT_PANE]).toBeNull()` UNTIL §SWAP-NOT-VACATE
        // (L-12999 clause 4, 2026-09-06). The assertion is CHANGED, not weakened, and what
        // superseded it is the founder's ruling that the other pane must never be left
        // blank: `assignViewToPane` now hands the displaced view back instead of writing
        // `null`. The PROPERTY this arm exists for — the model never puts the one MapLibre
        // map in both panes — is unchanged and still asserted on the line below it, and the
        // new occupancy assertion makes it strictly stronger than it was.
        const moved = assignViewToPane(
            { [LEFT_PANE]: 'site-map-2d', [RIGHT_PANE]: 'site-3d' },
            RIGHT_PANE,
            'site-map-2d',
        );
        expect(moved[RIGHT_PANE]).toBe('site-map-2d');
        expect(moved[LEFT_PANE]).toBe('site-3d');   // handed back, never blanked.
        expect(validatePaneLayout(moved).ok).toBe(true);
        expect(paneOccupancy(moved)).toBe(2);
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

    it('MOVES a singleton (3D Site) into an EMPTY pane — the old pane has nothing to take back', () => {
        // Founder's canonical case: 3D Site on the right, then the user drags it to the
        // left. There is ONE Cesium instance, so the right pane must empty out.
        //
        // ⭐ THIS ARM WAS NOT TOUCHED BY §SWAP-NOT-VACATE, and that is the point of it.
        // The TARGET pane here is EMPTY, so there is no displaced view to hand back and a
        // swap and a vacate are the same layout. This is the surviving half of the old
        // rule, pinned deliberately: the change is "hand back what the target was holding",
        // NOT "never empty a pane", and an implementation that emptied nothing ever would
        // have to invent a view to put here. Its two siblings above and below — where the
        // target IS occupied — carry the changed behaviour.
        const rightHas3d = assignViewToPane(EMPTY, RIGHT_PANE, 'site-3d');
        const movedLeft = assignViewToPane(rightHas3d, LEFT_PANE, 'site-3d');
        expect(movedLeft[LEFT_PANE]).toBe('site-3d');
        expect(movedLeft[RIGHT_PANE]).toBeNull(); // nothing to give back — never two Cesium mounts.
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

    it('lets the user then SWAP the 3D Site into the LEFT pane — and the map comes back right', () => {
        // ⚠ THIS ARM READ `expect(moved[RIGHT_PANE]).toBeNull()` UNTIL §SWAP-NOT-VACATE
        // (L-12999 clause 4, 2026-09-06), and its title already said SWAP while its body
        // asserted a vacate. What superseded it: the founder ruled that the pane a
        // singleton moves OUT of must never be left blank, and STR §26.1.1 names the
        // resolution — *"swap the panes, or move 3D here and put 2D there"*. The singleton
        // still MOVES (that half was always right and is still asserted); what it leaves
        // behind is the displaced view instead of nothing.
        const start = siteAuthoringDefaultLayout();
        const moved = assignViewToPane(start, LEFT_PANE, 'site-3d');
        expect(moved[LEFT_PANE]).toBe('site-3d');
        expect(moved[RIGHT_PANE]).toBe('site-map-2d'); // the swap — never two Cesium mounts.
        expect(validatePaneLayout(moved).ok).toBe(true);
        expect(panesShowingRenderer(moved, 'cesium')).toEqual([LEFT_PANE]);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// §SWAP-NOT-VACATE (L-12999 clause 4 · STR §26.1.1 · C57 §1.5)
// ═══════════════════════════════════════════════════════════════════════════════════════
// THE FOUNDER'S RULING, clause 4, verbatim: *"The other pane must not be left blank … Pane
// A must end holding something it can state."* Three of the ruling's four clauses hold
// STRUCTURALLY and need no test here — 3D Site and 3D Globe are two `framing` VARIANTS of
// the one `site-3d` type (so two Cesium views are unrepresentable, C60 §6.10), both stay
// offered, and the refusal already speaks through `seg.reason`. Clause 4 was the only one
// that failed, and it failed in ONE line: `assignViewToPane` wrote `null` into the pane the
// singleton moved out of.
//
// ⛔ THE ASSERTIONS ARE ON THE PROPERTY, NOT ON THE FOUNDER'S PATH. His click is one triple
// out of (layouts × panes × views); pinning only that would fix his instance and leave the
// class open — [[committed-is-not-reachable]]. So the headline arm sweeps EVERY pane-hostable
// view into EVERY pane of EVERY interesting layout and asserts occupancy never drops.
// ═══════════════════════════════════════════════════════════════════════════════════════
describe('§SWAP-NOT-VACATE (L-12999) — no pane-to-pane move may leave a pane blank', () => {
    const hostable = (): ViewType[] =>
        listPaneViewTypes().filter((vt) => VIEW_TYPE_REGISTRY[vt].paneHostable);

    it('⭐ THE INVARIANT: an assign naming a view NEVER reduces the number of occupied panes', () => {
        const layouts: Array<[string, PaneLayout]> = [
            ['onboarding default', siteAuthoringDefaultLayout()],
            ['parcel-law default', parcelLawDefaultLayout()],
            ['map left · plan right', { [LEFT_PANE]: 'site-map-2d', [RIGHT_PANE]: 'bim-plan-2d' }],
            ['3D Site left · map right', { [LEFT_PANE]: 'site-3d', [RIGHT_PANE]: 'site-map-2d' }],
            ['solo right', { [LEFT_PANE]: null, [RIGHT_PANE]: 'site-3d' }],
            ['solo left', { [LEFT_PANE]: 'site-map-2d', [RIGHT_PANE]: null }],
            ['both empty', EMPTY],
        ];
        for (const [name, layout] of layouts) {
            for (const paneId of [LEFT_PANE, RIGHT_PANE]) {
                for (const viewType of hostable()) {
                    const next = assignViewToPane(layout, paneId, viewType);
                    expect(
                        paneOccupancy(next),
                        `${name}: assigning "${viewType}" to ${paneId} lost a pane`,
                    ).toBeGreaterThanOrEqual(paneOccupancy(layout));
                    // …and the reason the old code existed still holds: no double-mount.
                    expect(
                        validatePaneLayout(next).ok,
                        `${name}: assigning "${viewType}" to ${paneId} double-mounted a singleton`,
                    ).toBe(true);
                }
            }
        }
    });

    it('⭐ THE FOUNDER\'S CLICK: 3D Globe in the LEFT pane while the RIGHT holds the 3D Site', () => {
        // `3D Globe` is `site-3d` at the `world` framing — the SAME view type (C60 §6.10),
        // so pressing it in the other pane is an ordinary singleton assign. Before this
        // change it produced `{left:'site-3d', right:null}`: the right pane vacated, its
        // surface unmounted and its view panel collapsed with it — the black rectangle the
        // founder photographed and reported as *"the right hand side is corrupted"*.
        const start = siteAuthoringDefaultLayout();
        const after = assignViewToPane(start, LEFT_PANE, 'site-3d');

        expect(after).toEqual({ [LEFT_PANE]: 'site-3d', [RIGHT_PANE]: 'site-map-2d' });
        expect(emptyPanes(after)).toEqual([]);          // ⛔ clause 4: nothing left blank.
        expect(panesShowingRenderer(after, 'cesium')).toEqual([LEFT_PANE]); // ⛔ clause 2: ONE Cesium.
    });

    it('a move into an EMPTY pane still empties the source — there is nothing to hand back', () => {
        // The honest remainder. `emptyPanes` reports it rather than the model pretending
        // otherwise, and the shell collapses a pane that is alone-empty (full screen), so
        // this is a LAYOUT the user can see and name, not a failure dressed as an empty.
        const soloRight: PaneLayout = { [LEFT_PANE]: null, [RIGHT_PANE]: 'site-3d' };
        const after = assignViewToPane(soloRight, LEFT_PANE, 'site-3d');
        expect(after).toEqual({ [LEFT_PANE]: 'site-3d', [RIGHT_PANE]: null });
        expect(paneOccupancy(after)).toBe(1); // unchanged — the invariant is ≥, not =.
    });

    it('an EXPLICIT empty is still honoured — the user asked for it', () => {
        // ⛔ The guarded half. "Never blank a pane" must not become "a pane can never be
        // emptied": `assign(pane, null)` and `solo` are the user's own intent, and removing
        // them would break full screen. Only the INVOLUNTARY vacate is gone.
        const cleared = assignViewToPane(siteAuthoringDefaultLayout(), RIGHT_PANE, null);
        expect(cleared[RIGHT_PANE]).toBeNull();
        expect(cleared[LEFT_PANE]).toBe('site-map-2d');
    });

    it('a non-singleton replacement is untouched — it was never a move', () => {
        // Assigning a view that is NOT live elsewhere simply replaces this pane's view.
        // Occupancy is unchanged and no other pane is consulted at all.
        const start = siteAuthoringDefaultLayout();
        const after = assignViewToPane(start, LEFT_PANE, 'bim-plan-2d');
        expect(after).toEqual({ [LEFT_PANE]: 'bim-plan-2d', [RIGHT_PANE]: 'site-3d' });
    });

    it('the swap is REVERSIBLE — pressing the same row in the other pane undoes it', () => {
        // ⭐ THE ESCAPE HATCH, at the model. L-942 / [[refusing-half-needs-its-escape-hatch]]:
        // the old vacate took the source pane's view PANEL off screen with it (the panel is
        // mounted inside the pane element and the shell collapses an alone-empty pane), and
        // `view.pane.assign` nulls the split memory, so `◧ Split` could not bring it back.
        // A swap has no such trap: the inverse gesture is the same gesture.
        const start = siteAuthoringDefaultLayout();
        const there = assignViewToPane(start, LEFT_PANE, 'site-3d');
        const back = assignViewToPane(there, RIGHT_PANE, 'site-3d');
        expect(back).toEqual(start);
    });

    it('⭐ THE FOUNDER\'S END-TO-END FLOW: 2D map left · 3D site right, globe right, satellite left', () => {
        // "Left = 2D map, right = 3D site; press 3D Globe in the right pane; press 2D
        // Satellite in the left." Both presses name the view the pane ALREADY holds, so the
        // pane model is not even asked to move anything — the globe is a camera framing and
        // the satellite a basemap style, dispatched to their own ports. Asserted here so a
        // future change that routes a variant through an ASSIGN (which would move the
        // singleton, and used to blank a pane) fails this arm instead of the founder.
        let l = siteAuthoringDefaultLayout();
        expect(emptyPanes(l)).toEqual([]);

        l = assignViewToPane(l, RIGHT_PANE, 'site-3d');    // 3D Globe, right pane.
        expect(l).toEqual(siteAuthoringDefaultLayout());
        expect(emptyPanes(l)).toEqual([]);

        l = assignViewToPane(l, LEFT_PANE, 'site-map-2d'); // 2D Satellite, left pane.
        expect(l).toEqual(siteAuthoringDefaultLayout());
        expect(emptyPanes(l)).toEqual([]);
    });

    it('and the SAME flow performed CROSS-PANE never blanks either — the hard version', () => {
        // The same four surfaces, but each pressed in the pane that does NOT hold it, which
        // is the sequence that actually exercised the vacate. Every step must leave two
        // occupied panes.
        let l = siteAuthoringDefaultLayout();
        const steps: Array<[string, ViewType]> = [
            [LEFT_PANE, 'site-3d'],        // 3D Globe / 3D Site into the left
            [LEFT_PANE, 'site-map-2d'],    // 2D Satellite back into the left
            [RIGHT_PANE, 'site-map-2d'],   // the map into the right
            [RIGHT_PANE, 'bim-plan-2d'],   // 2D PRYZM into the right
            [LEFT_PANE, 'bim-plan-2d'],    // and across again
        ];
        for (const [paneId, viewType] of steps) {
            l = assignViewToPane(l, paneId, viewType);
            expect(emptyPanes(l), `"${viewType}" → ${paneId} left a pane blank`).toEqual([]);
            expect(validatePaneLayout(l).ok).toBe(true);
        }
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
