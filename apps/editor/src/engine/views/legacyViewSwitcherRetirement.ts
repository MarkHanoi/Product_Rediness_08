/**
 * legacyViewSwitcherRetirement.ts — §ONE-VIEW-SWITCHER (founder 2026-09-07 · L-13160 · C59 §1.4)
 *
 * Layer Affected:  engine — view model (pure decisions)
 * File:            apps/editor/src/engine/views/legacyViewSwitcherRetirement.ts
 * Contracts:       C59 §1.4 (ONE picker, mounted on every pane) · C59 §2 invariant 9
 *                  (a registry-derived surface may only offer VIEWS; anything else is
 *                  modelled BESIDE it, as an action) · C59 §2.10.3 clause 4 (pane chrome
 *                  is positioned relative to its pane) · C59 §4 Phase 3 (the WebGPU BIM
 *                  renderer still owns `#container`) · C19 §5.6 / C06 §13 (a panel is a
 *                  HOST; the action is the AUTHORITY)
 * Issue log:       L-13160
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ASK, VERBATIM
 * ─────────────────────────────────────────────────────────────────────────────
 * *"At the moment we have a sound format at the beginning — this shall continue during the
 * whole project life cycle — at the beginning we have a dropdown panel to select the desired
 * view — but after we move into PRYZM 3D / PRYZM 2D view the layout changes — so I want to
 * keep the same all through."*
 *
 * And, earlier, the same request: *"THE PRYZM 3D VIEW SHALL HAVE JUST THE TWO DROP DOWN TO
 * SWITCH TO OTHER VIEW - AS WE HAVE ON THE INITIAL LAYOUT - SAME PRINCIPAL - CLEAN THE REST
 * ON THE TOP - MAKE IT SIMPLE"*.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ WHAT §BIM-3D-CHROME-QUIET (`e737bb54`) GOT RIGHT, AND THE ONE ROUTE IT MISSED
 * ─────────────────────────────────────────────────────────────────────────────
 * That lane tore the segmented strip down in `applyBimDualPane` — *"the ONE place the BIM
 * dual pane becomes the view"*. The reasoning is right and this file extends it rather than
 * fighting it. ⛔ **But `applyBimDualPane` is NOT the one place.** MEASURED at HEAD:
 *
 *   · `applyBimDualPane` is reached only from `applyResultView('2D')` — the post-generate
 *     landing and the retired strip's own `◧ 3D + plan` segment.
 *   · Every OTHER route into a PRYZM view lands on **`activateView(mode)`**:
 *     `window.pryzmActivateBimView` (`GISAreaLayout.ts:2255`) — which is what
 *     `GIS_ACTIONS['site.bim-3d']` / `['site.bim-plan']` dispatch, i.e. the founder's own
 *     `3D PRYZM` / `2D PRYZM` rows on the per-pane dropdown and on the whole-screen panel —
 *     plus `enterPlanViewGis` (`site.plan-gis`) and the site-overlay landing
 *     `enterCanvasWithSitePlanUnderlay` (his *"✓ Finish"*).
 *   · `activateView` calls `toggleGIS(false)` and `ViewController.activate(mode)` and
 *     **tears down neither bar**; `toggleGIS(false)`'s deactivate arm hides the Cesium
 *     canvas and the geocode box and touches no bar either.
 *
 * ⇒ The founder reached PRYZM 3D through the dropdown, which is the route the previous lane
 * built the dropdown FOR, and both legacy rows came with him. That is his screenshot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐⭐ THE CLASSIFICATION IS THE POINT — DELETING A WORKING CONTROL BESIDE A REDUNDANT ONE
 * ─────────────────────────────────────────────────────────────────────────────
 * Those two rows are NOT all view switches, and treating them as one row of "view buttons"
 * is how a cleanup becomes a loss. {@link LEGACY_BAR_CONTROLS} sorts every one of them with
 * its `file:line`, and the sort is **by SUBJECT, not by adjacency**:
 *
 *   · **VIEW SWITCHES** put a different VIEW on screen. They are exactly what the per-pane
 *     dropdown already offers (`viewPanelOptions()` — the ONE definition), so they RETIRE
 *     into it and the bar loses them.
 *   · **EVERYTHING ELSE** — a camera framing, a render fidelity, a panel toggle, a level
 *     filter — has the **Cesium 3D-Site/Globe surface** as its subject. On a PRYZM view
 *     there is no Cesium massing to frame, no globe tiles to re-render, no Forma analysis
 *     panel and no placed-massing storey band: those controls were not *doing* anything
 *     there, they were merely left behind by a transition that forgot to clean up.
 *
 * ⭐ **So NOTHING is relocated by this lane, and that is a measured finding rather than a
 * convenience.** The bars stay mounted, unchanged, on the views their controls act on
 * (`mountResultToggleBar` on the globe, `mountFormaViewToggle` on 3D Site / Plan-oblique).
 * Every non-view control ALSO already carries a second declared home in `GIS_ACTIONS`
 * (`site.zoom-to-site` · `site.analysis` · `site.fidelity.real` · `site.fidelity.massing` ·
 * `site.floor-filter`), rendered by `renderGisActions` in the Project Browser's GIS tab.
 * {@link legacyNonViewControls} carries that id on every row so the claim is checkable and
 * `oneViewSwitcher.spec.ts` fails the build if one of those declarations disappears.
 *
 * ⚠ `site.floor-filter` is DECLARED WITH NO ENTRY POINT — the registry says so itself
 * (*"Not yet re-hosted — the floor selector drives CesiumViewport.setVisibleFormaLevels
 * through a closure with no registered entry point"*). That is an honest pre-existing gap,
 * NOT something this lane opened, and it is recorded on the row rather than smoothed over:
 * the `▤ All floors` selector is reachable ONLY from the Forma sub-bar today.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ WHAT C59 PHASE 3 STILL PREVENTS — AND WHAT IT DOES NOT
 * ─────────────────────────────────────────────────────────────────────────────
 * `VIEW_TYPE_REGISTRY` refuses `bim-3d` per-pane BY NAME: the WebGPU renderer owns
 * `#container` and cannot be re-targeted into a pane element. So a PRYZM 3D view **cannot
 * be a pane**, and this lane does not pretend otherwise — no `PaneLayoutStore` is minted for
 * it, no second layout owner appears, and the dropdown's own refusal text keeps saying why.
 *
 * ⭐ **That blocks PANING, not SWITCHING.** The dropdown can still be the one switcher on a
 * view that opens full-screen; it just dispatches the WHOLE-SCREEN route (`GIS_ACTIONS`)
 * instead of a `view.pane.*` intent. Two hosts, ONE definition — the rule `viewSegmentSwitcher`
 * already states in its own header, applied to a third host. {@link PRYZM_VIEW_PANE_LIMIT_NOTE}
 * is the sentence the surface prints so the limit stays visible to the user, not only to us.
 *
 * PURE: no DOM, no renderer, no store, no I/O, no globals. Pure decisions are P8 span-exempt
 * (the precedent is `paneViewModel.ts`'s header). P4: no `window`. P6: no store writes.
 */

import type { ViewPanelOptionId } from './viewPanelOptions';

// ═════════════════════════════════════════════════════════════════════════════
// PHASES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The view the user is standing in, as far as the view-switching CHROME is concerned.
 *
 * ⚠ This is deliberately NOT a `ViewType`. `ViewType` answers *"what can a pane host"*;
 * this answers *"which surface owns view switching right now"*, and the two differ exactly
 * where C59 Phase 3 bites — `bim-3d` is a phase here and is not pane-hostable there.
 */
export type ViewSwitcherPhase =
    /** The site-authoring pane shell is up: 2D map / 3D Site in two panes. */
    | 'site-authoring-split'
    /** One Cesium/MapLibre site surface, whole screen (2D map · 3D Site · 3D Globe). */
    | 'site-whole-screen'
    /** A PRYZM (BIM) view owns the canvas — 3D, Top/plan, or an elevation/section. */
    | 'pryzm-view';

/**
 * The two legacy floating rows, by the class they carry on the DOM.
 *
 * ⛔ NEITHER IS DELETED BY THIS LANE, and the ids exist so the spec can say which is
 * expected where. `mountResultToggleBar` is still the switch on the photoreal globe and
 * `mountFormaViewToggle` still carries the Forma sub-controls on 3D Site / Plan-oblique;
 * deleting either would remove controls that have no equivalent anywhere else
 * (`▶ Fly tour`, `▤ All floors`).
 */
export type LegacyViewBarId =
    /** `.pryzm-result-toggle` — `[◧ 3D + plan][◉ 3D globe][◉ 3D Site]` + globe sub-controls. */
    | 'result-toggle'
    /** `.pryzm-forma-view-toggle` — `[▦ 2D Map][◳ Plan][◉ 3D]` + Forma sub-controls. */
    | 'forma-view-toggle';

/** What a control on a legacy bar actually DOES. Only the first kind is a view switch. */
export type LegacyControlKind =
    /** Puts a different VIEW on screen. Retires into the dropdown. */
    | 'view-switch'
    /** Moves a camera. Not a view. */
    | 'camera-action'
    /** Changes how the CURRENT view draws (fidelity / massing-vs-real). Not a view. */
    | 'render-mode'
    /** Shows or hides a panel. Not a view. */
    | 'panel-toggle'
    /** Filters which storeys are shown. Not a view. */
    | 'level-filter';

/**
 * WHAT a control acts on. ⭐ THIS IS THE FIELD THAT DECIDES WHETHER RETIRING A BAR IS A FIX
 * OR A LOSS: a control whose subject is the Cesium site surface has no subject at all on a
 * PRYZM view, so its absence there costs nothing. A control whose subject is the app's view
 * layout must have somewhere else to live before its bar goes.
 */
export type LegacyControlSubject =
    /** The ONE Cesium viewer's camera, tiles, massing or analysis chrome. */
    | 'cesium-site-surface'
    /** Which view the application is showing. */
    | 'app-view-layout';

export interface LegacyBarControl {
    /** Stable id. Tests key off this, never off the label. */
    readonly id: string;
    /** The label as painted today, glyph and all. */
    readonly label: string;
    readonly bar: LegacyViewBarId;
    /** `file:line` of the line that mints this control, at the commit that added this row. */
    readonly source: string;
    readonly kind: LegacyControlKind;
    readonly subject: LegacyControlSubject;
    /**
     * The DECLARED `GIS_ACTIONS` row that carries this capability, or `null` when none does.
     * ⛔ A string, not an import: this is an `engine/views` module and `gisActionRegistry`
     * is a `ui/gis` one — the same reason `viewPanelOptions.ts` holds its ids as strings.
     */
    readonly actionId: string | null;
    /** For a `view-switch`: the `viewPanelOptions()` row it retires into, if the panel has one. */
    readonly retiresInto: ViewPanelOptionId | null;
    /** One sentence: where this capability lives after this lane. Printed by the spec on failure. */
    readonly disposition: string;
}

/**
 * ⭐ EVERY CONTROL ON BOTH LEGACY ROWS, SORTED BY SUBJECT.
 *
 * The `source` fields were read off HEAD when this table was written. They rot — that is what
 * a `file:line` does — so `oneViewSwitcher.spec.ts` re-derives the SET from the source text
 * (it greps the labels) rather than trusting the line numbers, and the numbers are here for a
 * human opening the file, not for the gate.
 */
export const LEGACY_BAR_CONTROLS: readonly LegacyBarControl[] = Object.freeze([
    // ── `.pryzm-result-toggle` (mountResultToggleBar) ────────────────────────────────
    Object.freeze({
        id: 'result.bim-split',
        label: '◧ 3D + plan',
        bar: 'result-toggle',
        source: 'apps/editor/src/ui/layout/GISAreaLayout.ts:1998',
        kind: 'view-switch',
        subject: 'app-view-layout',
        actionId: 'site.bim-split',
        retiresInto: 'pryzm-3d',
        disposition:
            'Retires into the dropdown as `3D PRYZM`. ⚠ NOT the same dispatch: the panel row '
            + 'is `site.bim-3d` (the model filling the canvas), while `site.bim-split` opens '
            + 'the dual pane. §PARCEL-LAW-BIM3D chose the former for a panel host deliberately '
            + '(the pane would open behind the Analysis surface); `site.bim-split` stays '
            + 'declared and stays in the GIS panel.',
    }),
    Object.freeze({
        id: 'result.globe',
        label: '◉ 3D globe',
        bar: 'result-toggle',
        source: 'apps/editor/src/ui/layout/GISAreaLayout.ts:1999',
        kind: 'view-switch',
        subject: 'app-view-layout',
        actionId: 'site.globe',
        retiresInto: 'site-globe',
        disposition: 'Retires into the dropdown as `3D Globe` (the same `site.globe` dispatch).',
    }),
    Object.freeze({
        id: 'result.earth',
        label: '◉ 3D Site',
        bar: 'result-toggle',
        source: 'apps/editor/src/ui/layout/GISAreaLayout.ts:2013',
        kind: 'view-switch',
        subject: 'app-view-layout',
        actionId: 'site.earth',
        retiresInto: 'site-3d',
        disposition: 'Retires into the dropdown as `3D Site` (the same `site.earth` dispatch).',
    }),
    Object.freeze({
        id: 'result.fidelity-real',
        label: '◉ Real',
        bar: 'result-toggle',
        source: 'apps/editor/src/ui/layout/GISAreaLayout.ts:2069',
        kind: 'render-mode',
        subject: 'cesium-site-surface',
        actionId: 'site.fidelity.real',
        retiresInto: null,
        disposition:
            'STAYS on the globe bar — its subject is the photoreal tiles. Already hidden off '
            + 'the globe by `refreshResultButtons`. Second home: `GIS_ACTIONS.site.fidelity.real`.',
    }),
    Object.freeze({
        id: 'result.fidelity-massing',
        label: '▢ Massing',
        bar: 'result-toggle',
        source: 'apps/editor/src/ui/layout/GISAreaLayout.ts:2070',
        kind: 'render-mode',
        subject: 'cesium-site-surface',
        actionId: 'site.fidelity.massing',
        retiresInto: null,
        disposition:
            'STAYS on the globe bar. Second home: `GIS_ACTIONS.site.fidelity.massing`.',
    }),
    Object.freeze({
        id: 'result.zoom-to-site',
        label: '⤢ Zoom to Site',
        bar: 'result-toggle',
        source: 'apps/editor/src/ui/layout/GISAreaLayout.ts:2094',
        kind: 'camera-action',
        subject: 'cesium-site-surface',
        actionId: 'site.zoom-to-site',
        retiresInto: null,
        disposition:
            'STAYS on the globe bar — it reframes the ONE Cesium camera on the placed building, '
            + 'which does not exist on a PRYZM view. Second home: `GIS_ACTIONS.site.zoom-to-site`.',
    }),
    Object.freeze({
        id: 'result.fly-tour',
        label: '▶ Fly tour',
        bar: 'result-toggle',
        source: 'apps/editor/src/ui/layout/GISAreaLayout.ts:2116',
        kind: 'camera-action',
        subject: 'cesium-site-surface',
        actionId: null,
        retiresInto: null,
        disposition:
            'STAYS on the globe bar. ⚠ IT HAS NO DECLARED ACTION AND NO SECOND HOME — '
            + '`CesiumViewport.flyTour()` is reached only here. That is why the bar is retired '
            + 'from the PRYZM views rather than deleted.',
    }),

    // ── `.pryzm-forma-view-toggle` (mountFormaViewToggle) ────────────────────────────
    Object.freeze({
        id: 'forma.map-2d',
        label: '▦ 2D Map',
        bar: 'forma-view-toggle',
        source: 'apps/editor/src/ui/layout/GISAreaLayout.ts:6305',
        kind: 'view-switch',
        subject: 'app-view-layout',
        actionId: 'site.map-2d',
        retiresInto: 'site-map',
        disposition: 'Retires into the dropdown as `2D Site Map` (the same `site.map-2d` dispatch).',
    }),
    Object.freeze({
        id: 'forma.plan-oblique',
        label: '◳ Plan',
        bar: 'forma-view-toggle',
        source: 'apps/editor/src/ui/layout/GISAreaLayout.ts:6306',
        kind: 'view-switch',
        subject: 'app-view-layout',
        actionId: 'site.plan-oblique',
        retiresInto: null,
        disposition:
            '⚠ NOT one of the founder\'s six, so the dropdown does not carry it — and it is NOT '
            + 'removed (C19 §5.6 clause 4). It is a CAMERA PRESET of the 3D Site (C60 §6.5: same '
            + 'viewer, different pitch), it stays on this bar where that viewer is, and '
            + '`renderGisActions` still renders `site.plan-oblique` in the GIS panel.',
    }),
    Object.freeze({
        id: 'forma.3d',
        label: '◉ 3D',
        bar: 'forma-view-toggle',
        source: 'apps/editor/src/ui/layout/GISAreaLayout.ts:6307',
        kind: 'view-switch',
        subject: 'app-view-layout',
        actionId: 'site.earth',
        retiresInto: 'site-3d',
        disposition: 'Retires into the dropdown as `3D Site` — the same view as `result.earth`.',
    }),
    Object.freeze({
        id: 'forma.zoom-to-site',
        label: '⤢ Zoom to Site',
        bar: 'forma-view-toggle',
        source: 'apps/editor/src/ui/layout/GISAreaLayout.ts:6319',
        kind: 'camera-action',
        subject: 'cesium-site-surface',
        actionId: 'site.zoom-to-site',
        retiresInto: null,
        disposition:
            'STAYS on the Forma bar — it re-flies the ACTIVE Forma preset. Second home: '
            + '`GIS_ACTIONS.site.zoom-to-site`, which resolves whichever surface is active '
            + '(that is why the two legacy copies share one declared action).',
    }),
    Object.freeze({
        id: 'forma.analysis',
        label: '☀ Analysis',
        bar: 'forma-view-toggle',
        source: 'apps/editor/src/ui/layout/GISAreaLayout.ts:6343',
        kind: 'panel-toggle',
        subject: 'cesium-site-surface',
        actionId: 'site.analysis',
        retiresInto: null,
        disposition:
            'STAYS on the Forma bar — `FormaSiteAnalysisControls` is mounted only in Forma '
            + 'Plan/3D and disposed on exit, so on a PRYZM view this button had no panel to '
            + 'toggle. Second home: `GIS_ACTIONS.site.analysis`.',
    }),
    Object.freeze({
        id: 'forma.fidelity-real',
        label: '◉ Real',
        bar: 'forma-view-toggle',
        source: 'apps/editor/src/ui/layout/GISAreaLayout.ts:6394',
        kind: 'render-mode',
        subject: 'cesium-site-surface',
        actionId: 'site.fidelity.real',
        retiresInto: null,
        disposition: 'STAYS on the Forma bar. Second home: `GIS_ACTIONS.site.fidelity.real`.',
    }),
    Object.freeze({
        id: 'forma.fidelity-massing',
        label: '▢ Massing',
        bar: 'forma-view-toggle',
        source: 'apps/editor/src/ui/layout/GISAreaLayout.ts:6395',
        kind: 'render-mode',
        subject: 'cesium-site-surface',
        actionId: 'site.fidelity.massing',
        retiresInto: null,
        disposition: 'STAYS on the Forma bar. Second home: `GIS_ACTIONS.site.fidelity.massing`.',
    }),
    Object.freeze({
        id: 'forma.floor-filter',
        label: '▤ All floors',
        bar: 'forma-view-toggle',
        source: 'apps/editor/src/ui/layout/GISAreaLayout.ts:6414',
        kind: 'level-filter',
        subject: 'cesium-site-surface',
        actionId: 'site.floor-filter',
        retiresInto: null,
        disposition:
            'STAYS on the Forma bar, and it HAS to: it drives '
            + '`CesiumViewport.setVisibleFormaLevels` and filters the storeys of the placed '
            + 'MASSING — a thing that exists only on the Cesium surface. ⚠ `site.floor-filter` '
            + 'is declared with an EMPTY `entryPoints` array and an `unavailableReason` saying '
            + 'so, i.e. the GIS-panel copy is honestly refused. Pre-existing (L-1187), named '
            + 'here rather than inherited silently.',
    }),
]);

// ═════════════════════════════════════════════════════════════════════════════
// QUERIES
// ═════════════════════════════════════════════════════════════════════════════

/** The controls that put a different VIEW on screen — the ones the dropdown replaces. */
export function legacyViewSwitches(
    table: readonly LegacyBarControl[] = LEGACY_BAR_CONTROLS,
): readonly LegacyBarControl[] {
    return table.filter((c) => c.kind === 'view-switch');
}

/**
 * ⭐ THE CONTROLS THAT MUST NOT BE SWEPT UP WITH THE ROWS THAT CONTAIN THEM.
 * Every one of these is `subject: 'cesium-site-surface'` — which is the whole reason the
 * bars can leave the PRYZM views without anything being lost.
 */
export function legacyNonViewControls(
    table: readonly LegacyBarControl[] = LEGACY_BAR_CONTROLS,
): readonly LegacyBarControl[] {
    return table.filter((c) => c.kind !== 'view-switch');
}

/** The controls a given legacy bar carries. */
export function legacyBarControls(
    bar: LegacyViewBarId,
    table: readonly LegacyBarControl[] = LEGACY_BAR_CONTROLS,
): readonly LegacyBarControl[] {
    return table.filter((c) => c.bar === bar);
}

// ═════════════════════════════════════════════════════════════════════════════
// THE DECISION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⭐ MAY EITHER LEGACY BAR BE ON SCREEN IN THIS PHASE?
 *
 * `false` for `'pryzm-view'` and ONLY there — which is exactly the founder's sentence
 * (*"clean the rest on the top"*, said about PRYZM 3D / PRYZM 2D) and exactly the scope
 * §BIM-3D-CHROME-QUIET chose. On the site surfaces the bars ARE the controls for the
 * surface in front of you, and removing them there would be the loss this lane exists to
 * avoid.
 *
 * ⚠ THE PHASE IS THE INPUT, NOT THE ROUTE. A predicate keyed on *how you got here* would
 * have to be repeated at every entry point and would be wrong at the next one added — which
 * is the defect this file is fixing (`applyBimDualPane` was one route of four).
 */
export function legacyViewBarsAllowedIn(phase: ViewSwitcherPhase): boolean {
    return phase !== 'pryzm-view';
}

/** @see legacyViewBarsAllowedIn — the complement, for a caller that reads better this way. */
export function shouldRetireLegacyViewBars(phase: ViewSwitcherPhase): boolean {
    return !legacyViewBarsAllowedIn(phase);
}

/**
 * The one sentence the retirement logs, so a console reader can tell a deliberate teardown
 * from a bar that failed to mount. Names the founder's words and the surviving route.
 */
export const LEGACY_VIEW_BAR_RETIREMENT_REASON =
    '§ONE-VIEW-SWITCHER (L-13160) — the two legacy view-toggle rows are retired on PRYZM '
    + 'views: every view switch on them is offered by the view dropdown, and every other '
    + 'control on them acts on the Cesium site surface, which is not on screen here. Both '
    + 'bars stay mounted on the 3D Site / 3D Globe views, where their controls have a subject.';

/**
 * ⛔ THE HONEST NOTE, kept because the founder has never complained about this kind of copy
 * and because deleting it would make a real limit invisible.
 *
 * C59 §4 Phase 3: the WebGPU renderer owns `#container`, so `bim-3d` is `paneHostable:false`
 * and a PRYZM view cannot be a pane. The dropdown is still the switcher there; it just takes
 * the whole screen when you pick something.
 */
export const PRYZM_VIEW_PANE_LIMIT_NOTE =
    'This is the PRYZM model view. It fills the screen rather than sitting in a pane — the '
    + 'renderer still owns the whole viewport, which is C59 Phase 3 — so picking another '
    + 'view here replaces this one instead of splitting beside it. Use ◧ Split once you are '
    + 'on a site view.';

/**
 * The BIM `ViewMode` values a PRYZM view can be in (`@pryzm/core-app-model`'s `ViewMode`).
 *
 * ⚠ SPELLED, NOT IMPORTED. This module is pure `engine/views` and takes a plain string so a
 * caller can hand it `props._viewController?.currentMode` without this file acquiring a
 * dependency on the navigation package — the same reason `viewPanelOptions.ts` holds its
 * action ids as strings.
 */
export type PryzmViewModeName =
    '3D' | 'Top' | 'Ceiling' | 'ceiling-plan' | 'Front' | 'Back' | 'Left' | 'Right';

/**
 * ⭐ WHAT THE PILL SAYS IT IS SHOWING, in the founder's own spelling.
 *
 * ⛔ `null` FOR ANYTHING NOT RECOGNISED, and the caller prints a neutral word rather than a
 * guessed view name. C84 EI-1b — *"failure and emptiness becoming one value is this repo's
 * most expensive recurring defect"* — applied to a label: a pill that names the wrong view is
 * worse than one that names none, because it is the thing the user reads to know where he is.
 *
 * ⚠ THE ELEVATIONS GET AN HONEST LABEL, NOT ONE OF THE SIX. `Front`/`Back`/`Left`/`Right` are
 * real PRYZM views and are NOT rows on `viewPanelOptions()` (C59 §1.1 — `bim-elevation-2d`
 * needs per-pane view state, Phase 3). Calling one of them "3D PRYZM" to fit the panel would
 * be the same defect one level down.
 */
export function pryzmViewPillLabel(mode: string | null | undefined): string | null {
    switch (mode) {
        case '3D': return '3D PRYZM';
        case 'Top': return '2D PRYZM';
        case 'Ceiling':
        case 'ceiling-plan': return 'PRYZM reflected ceiling';
        case 'Front':
        case 'Back':
        case 'Left':
        case 'Right': return `PRYZM elevation — ${mode}`;
        default: return null;
    }
}

/** What view-switching chrome a phase mounts, and how many of it. */
export interface ViewSwitcherSurface {
    /**
     * The ONE mechanism. `'pane-dropdown'` in every phase — that is the whole point of this
     * lane, and a spec asserting it can fail if a fourth bar ever appears.
     */
    readonly surface: 'pane-dropdown';
    /**
     * How many dropdowns are on screen. §ONE-PANEL-PER-PANE-AND-MAKE-IT-A-DROPDOWN (L-13015):
     * **SWITCHER COUNT == VISIBLE VIEW-REGION COUNT.**
     */
    readonly count: 1 | 2;
    /** Whether the dropdown dispatches pane intents or whole-screen routes in this phase. */
    readonly dispatch: 'view.pane.*' | 'GIS_ACTIONS';
    /** Non-null only where a real limit applies. Printed on the surface, never swallowed. */
    readonly limitNote: string | null;
}

/**
 * ⭐ ONE MECHANISM, EVERY PHASE — the founder's *"same principle … all through"*.
 *
 * The only thing that varies is the **port** the dropdown dispatches into, and it varies for
 * a measured reason rather than a stylistic one: a pane-hosted view moves through
 * `PaneLayoutStore` (C59 §2 invariant 3), and a view that cannot be paned has no pane to move
 * within, so it takes the declared whole-screen route. Two hosts, ONE option definition —
 * `viewPanelOptions.ts`, which neither host copies.
 */
export function describeViewSwitcherSurface(phase: ViewSwitcherPhase): ViewSwitcherSurface {
    switch (phase) {
        case 'site-authoring-split':
            return Object.freeze({
                surface: 'pane-dropdown', count: 2, dispatch: 'view.pane.*', limitNote: null,
            });
        case 'site-whole-screen':
            return Object.freeze({
                surface: 'pane-dropdown', count: 1, dispatch: 'view.pane.*', limitNote: null,
            });
        case 'pryzm-view':
            return Object.freeze({
                surface: 'pane-dropdown',
                count: 1,
                dispatch: 'GIS_ACTIONS',
                limitNote: PRYZM_VIEW_PANE_LIMIT_NOTE,
            });
    }
}
