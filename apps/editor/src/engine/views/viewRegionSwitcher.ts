/**
 * viewRegionSwitcher.ts — §ONE-REGION-SWITCHER (founder 2026-09-08 · L-13257 · C59 §1.4)
 *
 * Layer Affected:  engine — view model (PURE decisions; no DOM, no renderer, no store, no I/O)
 * File:            apps/editor/src/engine/views/viewRegionSwitcher.ts
 * Contracts:       C59 §1.4 (ONE picker component, on every view region) · C59 §2 invariant 9
 *                  (a registry-derived surface offers VIEWS; anything else is modelled beside
 *                  it) · C59 §2.10.3 clause 4 (chrome is positioned relative to ITS OWN
 *                  region) · C59 §6 (view PROPERTIES are a different concern from view
 *                  SWITCHING) · C06 §6.1 (one chrome language) · C84 EI-8 (one spelling)
 * Issue log:       L-13257
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE ASK, VERBATIM (founder 2026-09-08, with two screenshots)
 * ═════════════════════════════════════════════════════════════════════════════
 * *"I have requested this multiple times - I need a lane for this - I need to have the most
 * possible robust architecture for views - we have many view types - cesium views (3d globe +
 * 3d site) we have 2d site map (open street views) + 2d satellite - then we have 3d pryzm
 * views, plan view pryzm, elevations, sections etc... per level - I want them to work together
 * in the most possible robust way - I want to have two options - no matter whether the user is
 * in Site / Author / Inspect / Analyse - the user could have the views split (in author will
 * be full screen; in the others have) or not split - single view - the way the user can change
 * a view should always be robust and the same - drop down on the middle of the view already
 * implemented but not always implemented - on pryzm view (check first image) we still have the
 * legacy style; and in other instances too. I want this absolutely standardized and really
 * architecturally sound - so perform an audit and make it sound - document - analyse and
 * implement."*
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐⭐ THE AUDIT THAT PRODUCED THIS FILE — FIVE HOSTS, TWO OPTION TABLES
 * ═════════════════════════════════════════════════════════════════════════════
 * §ONE-VIEW-SWITCHER (L-13160) counted switchers and got the COUNT right: one per visible
 * view region. It did not measure their FORM, and the founder's two screenshots are exactly
 * that gap. Measured at HEAD before this lane:
 *
 *   1. `PaneViewPicker`        · site-authoring panes  · ⭐ centred pill  · registry-derived
 *   2. `ViewSwitcherPill`      · `#container` (PRYZM)  · ⭐ centred pill  · `viewPanelOptions()`
 *   3. `viewSegmentSwitcher`   · whole-screen site     ·    segmented bar · `viewPanelOptions()`
 *   4. `viewSwitcherOnView`    · Analysis / Parcel Law ·    body-level bar · `viewPanelOptions()`
 *   5. `svp-view-select`       · `#svp-secondary-pane` · ⛔ NATIVE <select> in a grey 36 px
 *                                                          header · `viewDefinitionStore`
 *
 * ⛔ ROW 5 IS THE FOUNDER'S FIRST SCREENSHOT, AND `oneViewSwitcher.spec.ts` ARM K BLESSED IT
 * BY NAME: *"the plan pane's `svp-view-select` is already its ONE dropdown (no second one is
 * mounted beside it)"*. That arm is **overruled by this lane, and the reason is worth keeping**:
 * the arm asked *"how many controls does this region have?"* and the answer (one) was correct.
 * The founder's question is *"is it the SAME control?"* — and a native `<select>` sunk in a
 * grey uppercase header is not the white/violet centred pill every other region carries.
 * **A count invariant cannot see a form divergence.** {@link viewRegionSwitcherCoverage} adds
 * the second axis, so the next divergence fails a spec instead of arriving as a screenshot.
 *
 * ⚠ AND THE TWO OPTION TABLES DISAGREE — the deeper half of the defect. `describePaneViewOptions`
 * offers the six registry VIEW TYPES; `viewPanelOptions()` offers the founder's six ROWS, which
 * are four view types under variants and therefore INCLUDE 3D Globe and 2D Satellite. So the
 * same gesture offered a different set depending on which region you made it in — the globe and
 * the satellite reachable from a PRYZM view and not from a site pane. {@link REGION_OFFERS}
 * settles it: **every region offers the founder's six**, because they are the founder's six.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ WHAT THIS FILE IS AND IS NOT
 * ═════════════════════════════════════════════════════════════════════════════
 * It is the CENSUS OF VIEW REGIONS and the rules a switcher on one must obey. It mounts
 * nothing and defines no rows: the rows are still `viewPanelOptions()` (ONE definition, four
 * hosts) and per-pane assignment is still `describePaneViewOptions`. What was missing was an
 * authority that says WHICH REGIONS EXIST — every host previously decided for itself, which is
 * precisely how a region acquired a different control without anything failing.
 *
 * ⛔ NO SIXTH SWITCHER IS MINTED. This lane RETIRES row 5's form into row 2's component and
 * declares the result, so the population goes 5 hosts of 3 shapes → 4 hosts of ONE shape.
 *
 * PURE: no DOM, no renderer, no store, no I/O, no globals. Pure decisions are P8 span-exempt
 * (the precedent is `paneViewModel.ts`'s header). P4: no `window`. P6: no store writes.
 */

import type { ViewSwitcherPhase } from './legacyViewSwitcherRetirement';

// ═════════════════════════════════════════════════════════════════════════════
// THE REGION CENSUS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * A VIEW REGION is a rectangle of screen that shows ONE view and therefore needs exactly ONE
 * way to change it.
 *
 * ⚠ IT IS NOT A `PaneId` AND NOT A `ViewType`. `PaneId` names a slot in `PaneLayoutStore`,
 * which only the site-authoring shell has; `ViewType` names what can be shown. A region is the
 * third fact — *"there is a rectangle here, and something must switch it"* — and it is the one
 * the previous lanes had no name for, which is why `#svp-secondary-pane` was reasoned about as
 * "the legacy Canvas2D pane" in one file and not reasoned about at all in three others.
 */
export type ViewRegionId =
    /** Site-authoring shell, LEFT pane. `PaneLayoutStore`-backed. */
    | 'site-pane-left'
    /** Site-authoring shell, RIGHT pane. `PaneLayoutStore`-backed. */
    | 'site-pane-right'
    /** One site surface filling the screen (2D map · 3D Site · 3D Globe), shell not up. */
    | 'site-whole-screen'
    /** `#container` — the WebGPU BIM canvas. Whole screen, or the LEFT half under SVP. */
    | 'pryzm-canvas'
    /** `#svp-secondary-pane` — the Canvas2D plan / elevation / section pane. */
    | 'pryzm-plan-pane';

/**
 * The ONE control shape a view region may carry.
 *
 * ⛔ THERE IS DELIBERATELY NO `'select'` AND NO `'segmented-bar'` MEMBER. Both shapes exist in
 * the tree today and both are being retired from view SWITCHING; leaving them declarable here
 * would let the next region pick one and still pass coverage. A shape that must not appear is
 * not modelled — it is unspellable.
 */
export type SwitcherShape =
    /** `ViewSwitcherPill` — a white/violet pill, centred on the region's top edge. */
    | 'pill'
    /** `PaneViewPicker` — the same pill, with pane-assignment intents. Same visual language. */
    | 'pane-picker';

/** Why choosing a site view from the BIM canvas leaves the split (C59 §4 Phase 3). */
export const PRYZM_CANVAS_LIMIT_NOTE =
    'The PRYZM 3D renderer owns the whole viewport, so it cannot sit in a pane yet '
    + '(C59 Phase 3). Choosing a site view here opens it full screen and leaves this layout.';

/** Why choosing a site view from the plan pane leaves the split (C59 §3 Phase 4). */
export const PRYZM_PLAN_PANE_LIMIT_NOTE =
    'This pane draws the PRYZM plan, elevations and sections. It is not a site pane yet '
    + '(C59 Phase 4), so choosing 2D Site Map, 2D Satellite, 3D Site or 3D Globe opens that '
    + 'view full screen and leaves this layout.';

/** What a region's switcher may put on screen, beyond the founder's six. */
export interface RegionSwitcherDescriptor {
    readonly regionId: ViewRegionId;
    /** The founder's word for this rectangle. ONE spelling (C84 EI-8). */
    readonly label: string;
    /** The DOM anchor the switcher is positioned INSIDE (C59 §2.10.3 clause 4). */
    readonly anchorSelector: string;
    /** Which component owns switching here. Both shapes are the same visual language. */
    readonly shape: SwitcherShape;
    /**
     * ⭐ TRUE for every region, without exception, and that is the point of the lane.
     * The founder's six are the six wherever you stand.
     */
    readonly offersTheSix: true;
    /**
     * Does this region ALSO choose among view DEFINITIONS (which plan, which section, which
     * elevation, per level)? Only the Canvas2D plan pane does — that granularity has nowhere
     * else to live until C59 Phase 3 gives every pane per-pane view state.
     */
    readonly offersViewDefinitions: boolean;
    /**
     * How choosing one of the six behaves HERE. `'pane'` re-homes the view into this pane;
     * `'whole-screen'` leaves the current layout and opens the view full screen.
     *
     * ⚠ NOT A PREFERENCE — a C59 phase fact. A region whose renderer owns `#container`, or
     * which is not a `PaneHost`, has no pane intent to dispatch.
     */
    readonly dispatch: 'pane' | 'whole-screen';
    /** The sentence the surface PRINTS when `dispatch` is `'whole-screen'` (STR §26.1.1). */
    readonly limitNote: string | null;
    /** Which phases this region is on screen in. Drives the coverage count. */
    readonly visibleIn: readonly ViewSwitcherPhase[];
}

/**
 * ⛔ THE ONE PLACE A VIEW REGION IS DECLARED. A new region (an N-up third pane, a sheet
 * region, a detail callout) is ONE row here and it acquires the pill, the six and the coverage
 * check together — which is the property the five ad-hoc hosts did not have.
 */
export const VIEW_REGION_REGISTRY: Readonly<Record<ViewRegionId, RegionSwitcherDescriptor>> = {
    'site-pane-left': {
        regionId: 'site-pane-left',
        label: 'Left pane',
        anchorSelector: '[data-pane-id="left"]',
        shape: 'pane-picker',
        offersTheSix: true,
        offersViewDefinitions: false,
        dispatch: 'pane',
        limitNote: null,
        visibleIn: ['site-authoring-split'],
    },
    'site-pane-right': {
        regionId: 'site-pane-right',
        label: 'Right pane',
        anchorSelector: '[data-pane-id="right"]',
        shape: 'pane-picker',
        offersTheSix: true,
        offersViewDefinitions: false,
        dispatch: 'pane',
        limitNote: null,
        visibleIn: ['site-authoring-split'],
    },
    'site-whole-screen': {
        regionId: 'site-whole-screen',
        label: 'Site',
        anchorSelector: '#cesium-container',
        shape: 'pill',
        offersTheSix: true,
        offersViewDefinitions: false,
        dispatch: 'whole-screen',
        limitNote: null,
        visibleIn: ['site-whole-screen'],
    },
    'pryzm-canvas': {
        regionId: 'pryzm-canvas',
        label: '3D PRYZM',
        anchorSelector: '#container',
        shape: 'pill',
        offersTheSix: true,
        offersViewDefinitions: false,
        dispatch: 'whole-screen',
        limitNote: PRYZM_CANVAS_LIMIT_NOTE,
        visibleIn: ['pryzm-view'],
    },
    'pryzm-plan-pane': {
        regionId: 'pryzm-plan-pane',
        label: '2D PRYZM',
        anchorSelector: '#svp-secondary-pane',
        shape: 'pill',
        offersTheSix: true,
        // ⭐ THE ONE REGION THAT CARRIES BOTH GRANULARITIES. The founder named *"plan view
        // pryzm, elevations, sections etc... per level"* — those are view DEFINITIONS, not view
        // TYPES, and this pane is where a definition is chosen today (C59 §1.1 records that
        // per-pane view state is Phase 3).
        offersViewDefinitions: true,
        dispatch: 'whole-screen',
        limitNote: PRYZM_PLAN_PANE_LIMIT_NOTE,
        visibleIn: ['pryzm-view'],
    },
};

// ═════════════════════════════════════════════════════════════════════════════
// READINGS
// ═════════════════════════════════════════════════════════════════════════════

/** Registry keys in declaration order. Never a second hardcoded list. */
export function listViewRegions(
    registry: Readonly<Record<ViewRegionId, RegionSwitcherDescriptor>> = VIEW_REGION_REGISTRY,
): readonly ViewRegionId[] {
    return Object.keys(registry) as ViewRegionId[];
}

/** The regions on screen in a given phase — i.e. how many switchers must exist. */
export function regionsVisibleIn(
    phase: ViewSwitcherPhase,
    registry: Readonly<Record<ViewRegionId, RegionSwitcherDescriptor>> = VIEW_REGION_REGISTRY,
): readonly RegionSwitcherDescriptor[] {
    return listViewRegions(registry)
        .map((id) => registry[id])
        .filter((r) => r.visibleIn.includes(phase));
}

/**
 * Is this region ever on screen BESIDE another one? i.e. does the user have a layout here
 * that a whole-screen choice would collapse?
 *
 * ⭐ DERIVED, NOT DECLARED. A boolean field on the descriptor would be a second census of a
 * fact `visibleIn` already carries, and the row that forgot to set it would pass silently.
 */
export function sharesItsPhase(
    region: RegionSwitcherDescriptor,
    registry: Readonly<Record<ViewRegionId, RegionSwitcherDescriptor>> = VIEW_REGION_REGISTRY,
): boolean {
    return region.visibleIn.some((phase) => regionsVisibleIn(phase, registry).length > 1);
}

/** Every region offers the founder's six. A reading, so hosts never assume it. */
export const REGION_OFFERS = {
    theSix: (r: RegionSwitcherDescriptor): boolean => r.offersTheSix,
} as const;

// ═════════════════════════════════════════════════════════════════════════════
// ⭐ WHERE THE SWITCHER SITS — COLLISION IS RESOLVED, NOT GUESSED
// ═════════════════════════════════════════════════════════════════════════════

/** A rectangle in viewport coordinates. The shape `getBoundingClientRect()` returns. */
export interface Box {
    readonly top: number;
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
}

/** Default distance from a region's top edge, when nothing is in the way. */
export const SWITCHER_DEFAULT_TOP_PX = 10;

/** Gap left between the switcher and whatever it had to move below. */
export const SWITCHER_CLEARANCE_PX = 8;

/**
 * How far BELOW the default band a piece of chrome can start and still count as being in the
 * switcher's way. Chrome further down than this is beside the view, not over the pill.
 */
export const SWITCHER_BAND_DEPTH_PX = 40;

/**
 * Resolve the switcher's `top`, in pixels FROM THE REGION'S OWN TOP EDGE, so it never lands
 * underneath a piece of app chrome that floats over the same band.
 *
 * ⭐⭐ THIS IS THE SECOND HALF OF THE FOUNDER'S FIRST SCREENSHOT, AND IT IS NOT A STYLE NIT.
 * On a PRYZM view the pill IS mounted — `ensurePryzmViewPill` puts it on `#container` at
 * `top: 10`. But `#container` starts at the WINDOW's top edge, and the app's floating mode bar
 * (`Site · Author · Inspect · Analysis · Data`) floats over that exact band, horizontally
 * CENTRED — which is precisely where a `top-center` pill sits. In the site-authoring shell the
 * panes begin BELOW that bar, so the same 10 px is clear and both pills are visible: that is
 * why the founder's second screenshot shows two pills and his first shows none.
 * **The control was not missing. It was underneath the toolbar.**
 *
 * ⛔ A HARDCODED OFFSET WOULD BE THE WRONG FIX. The mode bar's height is a function of the
 * font, the workspace, and whether the level chip is in its slot; a constant tuned to today's
 * screenshot is the stale-transcription shape this repo keeps re-learning. So the caller
 * MEASURES the obstacles and this function decides.
 *
 * ⚠ ZERO-AREA OBSTACLES ARE IGNORED. `getBoundingClientRect()` returns an all-zero box for a
 * `display:none` node and for every node in happy-dom. Treating that as an obstacle at the top
 * of the screen would push every pill down by the clearance in tests and under hidden chrome —
 * a fake obstacle producing a real displacement ([[fake-more-capable-than-real]]).
 *
 * @param region     the region's own box (the pill is positioned inside it).
 * @param obstacles  boxes of chrome that floats OVER the region in the same band.
 * @param defaultTop distance used when nothing overlaps. Defaults to {@link SWITCHER_DEFAULT_TOP_PX}.
 */
export function resolveSwitcherTopPx(
    region: Box,
    obstacles: readonly Box[],
    defaultTop: number = SWITCHER_DEFAULT_TOP_PX,
): number {
    let top = defaultTop;
    for (const o of obstacles) {
        // A zero-area box is an ABSENCE, not an obstacle at the origin. See the note above.
        if (o.bottom <= o.top || o.right <= o.left) continue;
        // Only chrome that actually overlaps this region horizontally can occlude it.
        if (o.right <= region.left || o.left >= region.right) continue;
        const relBottom = o.bottom - region.top;
        if (relBottom <= top) continue;                                  // already above the pill.
        if (o.top - region.top > top + SWITCHER_BAND_DEPTH_PX) continue; // far below the band.
        top = relBottom + SWITCHER_CLEARANCE_PX;
    }
    return Math.max(0, Math.round(top));
}

// ═════════════════════════════════════════════════════════════════════════════
// ⭐ SPLIT / SINGLE — the founder's SECOND option, on the PRYZM regions
// ═════════════════════════════════════════════════════════════════════════════

/**
 * *"I want to have two options - no matter whether the user is in Site / Author / Inspect /
 * Analyse - the user could have the views split ... or not split - single view."*
 *
 * ⛔ THE MEASURED GAP: that toggle existed in exactly ONE place — `.vsw-split`, on the Analysis
 * on-view bar (`viewSwitcherOnView.ts`) — plus the site panes' own layout actions inside
 * `PaneViewPicker`. On a PRYZM view there was **no split control at all**: the 3D+plan split
 * could only be opened by the post-generate landing or by closing the pane from its header.
 *
 * ⚠ AND IT CANNOT REUSE `describeSplitToggle` — THE TWO SPLITS ARE DIFFERENT OBJECTS, WHICH IS
 * THE DEBT C59 §1.5.3 NAMES RATHER THAN HIDES. `describeSplitToggle` reasons about the
 * SITE-AUTHORING PANE SHELL (`PaneLayoutStore`, `view.pane.solo`). The PRYZM split is
 * `SplitViewManager` — a different owner, with a different lifecycle. Rendering the site
 * decision on a BIM view would offer to split something that is not on screen.
 *
 * ⭐ SO: TWO OWNERS, ONE VOCABULARY. This returns the SAME `SplitTogglePresentation` the site
 * toggle returns, so both hosts render one shape of control and the user cannot tell which
 * layout owner is underneath — which is the whole of what the founder asked for. Collapsing
 * the two OWNERS is a later increment and is recorded as such.
 */
export interface PryzmSplitToggleState {
    /** Is the PRYZM plan pane on screen? A READING of `SplitViewManager`, never a memory. */
    readonly open: boolean;
    /** `window.splitViewManager` exposes `activate`/`deactivate` in this session. */
    readonly canToggle: boolean;
}

/** The sentence the PRYZM split toggle shows when it cannot act (STR §26.1.1). */
export const PRYZM_SPLIT_UNAVAILABLE_TEXT =
    'Split is not available from here in this session: the PRYZM plan pane '
    + '(SplitViewManager) has not registered. Open a PRYZM view once, then return.';

/**
 * The PRYZM split/single decision. Pure, so the pill on `#container` and the pill on the plan
 * pane render ONE decision rather than two drifting copies of it.
 */
export function describePryzmSplitToggle(
    state: PryzmSplitToggleState,
): { readonly label: string; readonly enabled: boolean; readonly pressed: boolean; readonly title: string } {
    if (!state.canToggle) {
        return {
            label: '◧ Split', enabled: false, pressed: state.open,
            title: PRYZM_SPLIT_UNAVAILABLE_TEXT,
        };
    }
    return state.open
        ? {
            label: '▣ Single view', enabled: true, pressed: true,
            title: 'Close the plan pane and let the PRYZM model fill the screen. '
                + 'The plan keeps the view definition it is showing.',
        }
        : {
            label: '◧ Split', enabled: true, pressed: false,
            title: 'Show the PRYZM model and its plan side by side. Each half keeps its own '
                + 'view dropdown, so you choose what goes in each.',
        };
}

// ═════════════════════════════════════════════════════════════════════════════
// ⭐ THE COVERAGE GATE — the axis `oneViewSwitcher.spec.ts` could not see
// ═════════════════════════════════════════════════════════════════════════════

/** One thing wrong with the region census, named so a spec can print it. */
export interface RegionSwitcherFinding {
    readonly regionId: ViewRegionId | '(none)';
    readonly kind:
        | 'region-offers-fewer-than-the-six'
        | 'region-has-no-declared-shape'
        | 'whole-screen-region-has-no-limit-note'
        | 'pane-region-carries-a-limit-note'
        | 'region-visible-in-no-phase'
        | 'phase-has-no-region';
    readonly detail: string;
}

/**
 * Check the census in BOTH directions, the way `viewPanelCoverage()` checks the panel.
 *
 * ⭐ WHAT THIS CATCHES THAT A COUNT CANNOT: a region that quietly offers a different set, a
 * region that acquires a non-pill control, a whole-screen region that stops explaining that it
 * leaves the layout, and a phase with no switcher at all. Every one of those shipped at some
 * point in the five-host era and none of them failed anything.
 */
export function viewRegionSwitcherCoverage(
    registry: Readonly<Record<ViewRegionId, RegionSwitcherDescriptor>> = VIEW_REGION_REGISTRY,
): readonly RegionSwitcherFinding[] {
    const findings: RegionSwitcherFinding[] = [];
    const shapes: readonly SwitcherShape[] = ['pill', 'pane-picker'];
    const phases: readonly ViewSwitcherPhase[] =
        ['site-authoring-split', 'site-whole-screen', 'pryzm-view'];

    for (const id of listViewRegions(registry)) {
        const r = registry[id];
        if (!REGION_OFFERS.theSix(r)) {
            findings.push({
                regionId: id, kind: 'region-offers-fewer-than-the-six',
                detail: `${r.label} does not offer the founder's six. Every region offers them.`,
            });
        }
        if (!shapes.includes(r.shape)) {
            findings.push({
                regionId: id, kind: 'region-has-no-declared-shape',
                detail: `${r.label} carries "${String(r.shape)}", which is not a pill.`,
            });
        }
        // ⭐ THE PREDICATE IS "DOES CHOOSING DESTROY A LAYOUT?", NOT "IS THE DISPATCH
        // WHOLE-SCREEN?" — and the difference was caught by this gate on its FIRST run, which
        // is the argument for having written it. `site-whole-screen` dispatches whole-screen
        // and correctly carries NO note: it is ALREADY the whole screen, so there is no split
        // to lose and a warning there would be the false-warning defect one row down.
        // A region only owes an explanation when it SHARES ITS PHASE with another region —
        // i.e. when the user has a layout that the choice will collapse. That is derived from
        // the census rather than declared, so a new region cannot forget to set a flag.
        if (r.dispatch === 'whole-screen' && !r.limitNote && sharesItsPhase(r, registry)) {
            findings.push({
                regionId: id, kind: 'whole-screen-region-has-no-limit-note',
                detail: `${r.label} shares its phase with another region, so choosing a view `
                    + 'collapses the split — and it says nothing about that.',
            });
        }
        if (r.dispatch === 'pane' && r.limitNote) {
            findings.push({
                regionId: id, kind: 'pane-region-carries-a-limit-note',
                detail: `${r.label} re-homes in place, so a limit note would be a false warning.`,
            });
        }
        if (r.visibleIn.length === 0) {
            findings.push({
                regionId: id, kind: 'region-visible-in-no-phase',
                detail: `${r.label} is declared but appears in no phase — it is unreachable.`,
            });
        }
    }

    for (const phase of phases) {
        if (regionsVisibleIn(phase, registry).length === 0) {
            findings.push({
                regionId: '(none)', kind: 'phase-has-no-region',
                detail: `Phase "${phase}" has no declared view region, so no switcher is required `
                    + 'in it — which is how a phase loses its switcher without failing anything.',
            });
        }
    }

    return findings;
}
