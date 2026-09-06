// apps/editor — §GIS-ACTION-REGISTRY (L-1187, C06 §13) — the ONE declared list of
// GIS / site-view actions, and the ONE resolver from a declared action to its LIVE
// dispatch.
//
// ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────────
//
// The founder's ask was "make sure all these buttons are in the GIS tab, and the
// legacy buttons are gone". The audit that answered it (L-1187) found that the 19
// boxed controls are NOT 19 actions: they are 14 actions under 19 spellings, spread
// over five independent surfaces that each hand-wrote their own button list and
// their own handler:
//
//   • GISAreaLayout.mountResultToggleBar()   — the top segmented switch
//   • GISAreaLayout.mountFormaViewToggle()   — the secondary "3D Site" sub-bar
//   • GISAreaLayout.mountSiteViewLauncher()  — the bottom-left floating pill stack
//   • ProjectBrowserPanel._buildGISPanel()   — the rail panel behind the globe icon
//   • GISRailPanel.ts                        — DELETED: a fifth list with ZERO importers
//
// Five hand-written lists produced exactly the defects a hand-written list produces:
// "3D Site" naming two different things, "PRYZM Earth" and "3D Site" naming the SAME
// thing, "Real" / "Massing" / "Zoom to Site" each appearing twice against two
// different state variables, and a whole surface (GISRailPanel) that nobody ever
// mounted. This repo's recurring defect this week is "an enumerated list that must be
// REMEMBERED rather than DERIVED"; a second hand-written button list in a new panel
// would have been the same defect in a tidier box.
//
// ── THE RULE THIS FILE ENCODES ──────────────────────────────────────────────────
//
//   A panel is a HOST; the action is the AUTHORITY.
//
// A surface RENDERS this registry. It never invents a label, never invents a handler,
// and never re-spells an action that is already declared here. `dispatch` calls the
// EXISTING entry points registered by GISAreaLayout — no handler logic is copied into
// this file, because copying is precisely how GISRailPanel and ProjectBrowserPanel
// came to disagree, with one of them silently no-op.
//
// ── HONEST UNAVAILABILITY ───────────────────────────────────────────────────────
//
// `entryPoints: []` means "declared, audited, NOT YET re-hosted": the capability has
// no registered entry point to dispatch to, because it lives as a closure inside
// mountGISArea and has never been exported. Such an action MUST render disabled with
// its reason shown — never as a live-looking button. That is the whole point: a dead
// button that looked alive is its own bug, and the founder has been clicking them.
// `gisActionRegistry.test.ts` fails the build if a declared action resolves to nothing
// and a surface still paints it live, or if a `dispatch` claims an entry point it does
// not actually call.

/** The host object that carries the live GIS entry points (production: `window`). */
export interface GisCapabilityHost {
    /** §FEAT-SITE-VIEW-ALWAYS-ON (L-40, ADR-0114) — enter the Cesium site surface. */
    pryzmEnterSiteView?: (initial?: 'map2d' | 'plan' | '3d') => void;
    /** O.7.2 — the top-level result view: '2D' = BIM 3D+plan dual pane, '3D' = photoreal globe. */
    pryzmShowSiteResultView?: (initial?: '2D' | '3D') => void;
    /**
     * §PARCEL-LAW-BIM3D (L-12915 / STR §24.1 item 2) — activate a BIM view on the
     * WHOLE canvas: `activateView(mode)` exits GIS and routes through ViewController,
     * and it opens NO secondary pane. Registered by GISAreaLayout since L-78.
     *
     * ⭐ Declared here 2026-09-06 because it was a live window entry point that no
     * action named — so no surface could offer it, and every host that wanted "the
     * BIM 3D view" had to reach for `site.bim-split`, which opens a right-edge pane.
     */
    pryzmActivateBimView?: (mode?: 'Top' | '3D' | 'Front' | 'Back' | 'Left' | 'Right') => Promise<void> | void;
    /** §FEAT-PLAN-VIEW-GIS (L-104, ADR-0115) — plan view over the real-world aerial. */
    pryzmEnterPlanViewGis?: () => void | Promise<void>;
    /** FORMA.6 — building fidelity on the "3D Site" (Forma) surface. */
    pryzmSetFormaBuildingFidelity?: (fidelity: 'massing' | 'real') => void;
    /** §GLOBE-FIDELITY — building fidelity on the photoreal globe surface. */
    pryzmSetGlobeBuildingFidelity?: (fidelity: 'massing' | 'real') => void;
    /** GRAPH.3 — the static Building-Graph overlay. */
    pryzmShowBuildingGraph?: (show?: boolean) => void;
    /** A.21.D17 — the force-directed Living Building Graph overlay. */
    pryzmOpenLivingGraph?: (show?: boolean) => void;
    /** §GIS-ACTION-REGISTRY (L-1187) — the FORMA.5 site-analysis panel. */
    pryzmToggleSiteAnalysis?: () => void;
    /** §GIS-ACTION-REGISTRY (L-1187) — the buildable-envelope facts card. */
    pryzmToggleEnvelopeCard?: () => void;
    /** §GIS-ACTION-REGISTRY (L-1187) — reframe the camera on the site; the ACTIVE
     *  surface decides the target. */
    pryzmZoomToSite?: () => void;
    /** §GIS-ACTION-REGISTRY (L-1360) — restore every optional panel to its declared
     *  default. App-wide, not GIS-scoped. */
    pryzmResetPanelLayout?: () => void;
    /** §GIS-ACTION-REGISTRY (L-1361) — snapshot of the current site view + fidelity, so a
     *  surface can DERIVE its active state instead of mirroring it. */
    pryzmGetSiteViewState?: () => GisSiteViewState;
}

/**
 * What the site surfaces currently show. Read through `pryzmGetSiteViewState`.
 *
 * ⚠ A SNAPSHOT, not a subscription — it changes only when re-read. Any surface painting
 * from it must say when it repaints; a highlight that silently goes stale is worse than
 * no highlight, because it asserts a fact instead of omitting one.
 */
export interface GisSiteViewState {
    readonly segment: '2D' | '3D' | 'forma';
    readonly formaMode: 'map2d' | 'plan' | '3d';
    readonly buildingFidelity: 'massing' | 'real';
}

export type GisEntryPointName = keyof GisCapabilityHost;

/**
 * Functional grouping inside the GIS panel. The founder's ask was "stop scattering
 * this chrome", not "give me one flat list of nineteen" — so the panel groups.
 */
export type GisActionGroup = 'siteViews' | 'display' | 'utility';

export const GIS_GROUP_LABEL: Readonly<Record<GisActionGroup, string>> = {
    siteViews: 'Site views',
    display:   'Site display',
    // Deliberately NOT called "GIS utilities". The one action in here is app-wide, and
    // a group label that implied otherwise would be the host quietly re-scoping the
    // action — the thing C06 §13.7 verdict (d) exists to prevent.
    utility:   'Workspace',
};

export interface GisActionDecl {
    /** Stable id. Surfaces key off this, never off the label. */
    readonly id: string;
    /** THE spelling. C84 EI-8/EI-9 one-vocabulary: exactly one label per action. */
    readonly label: string;
    readonly icon: string;
    readonly title: string;
    readonly group: GisActionGroup;
    /**
     * Every host entry point `dispatch` calls. The test asserts `dispatch` calls ALL
     * of them and calls nothing else — so a declaration cannot drift from its handler,
     * and an entry point cannot be declared and then silently not invoked.
     * EMPTY ⇒ declared but not yet re-hosted; a surface must render it disabled.
     */
    readonly entryPoints: readonly GisEntryPointName[];
    /**
     * The retired spellings this action absorbs — the de-duplication ledger from the
     * L-1187 audit. Every string here was a real button on a real surface that
     * dispatched THIS action under a different name. Kept in code, not in a doc, so a
     * future surface that re-spells a retired name fails the registry's uniqueness test.
     */
    readonly absorbs: readonly string[];
    /** Why this action is not yet dispatchable — required exactly when `entryPoints` is empty. */
    readonly unavailableReason?: string;
    /**
     * Is this action's result what the user is currently looking at?
     *
     * DERIVED from the authority's snapshot — never a flag this registry maintains. The
     * legacy chrome kept `Real` lit on one bar and dark on another because each bar held
     * its own copy of the answer; one predicate over one snapshot cannot disagree with
     * itself. Omitted for actions that have no "currently on" reading (opening a graph
     * overlay, resetting the layout).
     */
    readonly activeWhen?: (state: GisSiteViewState) => boolean;
    /** Stated when the action's natural long-term home is NOT the GIS panel. */
    readonly homeNote?: string;
    readonly dispatch: (host: GisCapabilityHost) => void;
}

// ── The registry ────────────────────────────────────────────────────────────────
//
// §SITE-VIEWPOINT-CONSISTENT — `site.earth` enters on '3d'. The two legacy surfaces
// disagreed: the floating "PRYZM Earth" pill passed 'plan' while the "3D Site"
// segment passed DEFAULT_3D_SITE_VIEW ('3d'). Same action, two landing viewpoints,
// one of them contradicting the constant that exists to declare the default. The
// declared default wins.

export const GIS_ACTIONS: readonly GisActionDecl[] = [
    // ── Site views ──────────────────────────────────────────────────────────────
    {
        id: 'site.earth',
        label: 'PRYZM Earth',
        icon: '◉',
        title: 'Open PRYZM Earth — the 3D site view on the real-world plot (true north + geolocation). Works from any view.',
        group: 'siteViews',
        activeWhen: (s) => s.segment === 'forma' && s.formaMode === '3d',
        entryPoints: ['pryzmEnterSiteView'],
        // The PRD (PRYZM-EARTH-ONBOARDING §10) renamed this entry "3D Site / Globe"
        // → "PRYZM Earth" but only on the floating pill; three other surfaces kept the
        // old spelling, which is how the founder ended up seeing "3D Site" twice.
        absorbs: [
            '3D Site (view-mode switch segment)',
            '3D Site (GIS rail panel button — surface deleted)',
            '3D Site (Forma sub-bar context label)',
            '3D (Forma sub-bar)',
        ],
        dispatch: (h) => { h.pryzmEnterSiteView?.('3d'); },
    },
    {
        id: 'site.plan-oblique',
        label: 'Plan (oblique)',
        icon: '◳',
        title: 'Near-top-down shadowed massing over the real plot — the plan-oblique site view.',
        group: 'siteViews',
        activeWhen: (s) => s.segment === 'forma' && s.formaMode === 'plan',
        entryPoints: ['pryzmEnterSiteView'],
        absorbs: ['Plan (Forma sub-bar)'],
        dispatch: (h) => { h.pryzmEnterSiteView?.('plan'); },
    },
    {
        id: 'site.map-2d',
        label: '2D Map',
        icon: '▦',
        title: 'Drop to the 2D draw map to draw or edit the site boundary.',
        group: 'siteViews',
        activeWhen: (s) => s.segment === 'forma' && s.formaMode === 'map2d',
        entryPoints: ['pryzmEnterSiteView'],
        absorbs: ['2D Map (Forma sub-bar)'],
        dispatch: (h) => { h.pryzmEnterSiteView?.('map2d'); },
    },
    {
        id: 'site.globe',
        label: '3D globe (photoreal)',
        icon: '\u{1F310}',
        title: 'The photoreal globe — real imagery and 3D tiles with your building placed on them.',
        group: 'siteViews',
        activeWhen: (s) => s.segment === '3D',
        // NOT the same action as `site.earth`, despite the names. The founder
        // reasonably read "3D globe" and "PRYZM Earth" as one thing; they are not.
        // "PRYZM Earth" opens the Forma / massing site surface; THIS opens the
        // photoreal-tiles result view. The names are inverted, not duplicated.
        entryPoints: ['pryzmShowSiteResultView'],
        absorbs: ['3D globe (view-mode switch segment)'],
        dispatch: (h) => { h.pryzmShowSiteResultView?.('3D'); },
    },
    {
        id: 'site.bim-split',
        label: '3D + plan',
        icon: '◧',
        title: 'The BIM dual pane — 3D on the left, floor plan on the right.',
        group: 'siteViews',
        activeWhen: (s) => s.segment === '2D',
        entryPoints: ['pryzmShowSiteResultView'],
        absorbs: ['3D + plan (view-mode switch segment)'],
        dispatch: (h) => { h.pryzmShowSiteResultView?.('2D'); },
    },
    {
        // §PARCEL-LAW-BIM3D (L-12915 · STR §24.1 item 2) — the founder's "BIM 3D", as a
        // LEFT-PANE view rather than a dual pane.
        //
        // ⭐ WHY THIS ROW EXISTS, MEASURED RATHER THAN ASSERTED. `site.bim-split` was the
        // only declared way to reach a BIM 3D view, and it opens the SplitViewManager
        // secondary pane: `.svp-pane` is `position: fixed; right: 0; width: 40%;
        // z-index: 1` (styles/panels/splitView.ts). The Analysis surface is
        // `#anl-surface { position: fixed; right: 0; width: 50%; z-index: 50 }`
        // (styles/panels/analysisSurface.ts). So from the PARCEL LAW tab — which lives ON
        // that surface — pressing "BIM 3D" opened a pane ENTIRELY BEHIND the panel, and
        // `SplitViewManager._buildDOM` additionally wrote `#container.style.width = '60%'`
        // over the 50% `WorkspaceController` had just set, sliding the right tenth of the
        // 3-D viewport under the panel too. Two right-edge claimants, one inline style.
        //
        // This action is the one that was always there and never declared: `activateView`
        // exits GIS, routes through ViewController, and opens no pane at all — so the BIM
        // 3D view fills the canvas half the reader can actually see.
        //
        // ⛔ `site.bim-split` is NOT removed (C19 §5.6 clause 4 — a route is added, never
        // removed). It stays declared, stays on the GIS bar, and stays correct in a
        // full-canvas mode, which is the mode it was designed for.
        //
        // ⚠ NO `activeWhen`, AND THAT IS THE HONEST STATE, NOT AN OMISSION.
        // `GisSiteViewState` carries `segment` / `formaMode` / `buildingFidelity`; none of
        // them reports which BIM view ViewController activated, and `activateView` does not
        // move `activeSegment`. Inventing a predicate over the fields that DO exist would
        // paint a highlight from a fact the authority never stated. A surface that renders
        // this action therefore shows it as never-current and must SAY so — see
        // `viewSegmentSwitcher`'s unreported-state arm. The fix is a field on the snapshot,
        // owned by GISAreaLayout; it is named in this lane's report as a seam.
        id: 'site.bim-3d',
        label: 'BIM 3D',
        icon: '▣',
        title: 'The BIM model in 3D, filling the canvas — no secondary plan pane. '
            + 'Leaves the site/globe surfaces and returns to the PRYZM model view.',
        group: 'siteViews',
        entryPoints: ['pryzmActivateBimView'],
        absorbs: [],
        dispatch: (h) => { void h.pryzmActivateBimView?.('3D'); },
    },
    {
        id: 'site.plan-gis',
        label: 'Plan + Site',
        icon: '▤',
        title: 'Plan view composited over the real-world aerial context, on project north.',
        group: 'siteViews',
        // ⚠ UNDER REPAIR — L-1197 / lane UND1. This action is RE-HOSTED here only; its
        // handler (`enterPlanViewGis`) is owned by that lane while the import-overlay
        // scoping defect is fixed. Do not rewire it from this file.
        entryPoints: ['pryzmEnterPlanViewGis'],
        absorbs: ['Plan + Site (floating launcher pill)'],
        dispatch: (h) => { void h.pryzmEnterPlanViewGis?.(); },
    },

    // ── Site display ────────────────────────────────────────────────────────────
    //
    // "Real" / "Massing" existed TWICE with identical labels against two different
    // state variables (formaBuildingFidelity / globeBuildingFidelity), on two bars a
    // user reads as one bar. One label meant two things depending on which view
    // happened to be active — the exact C84 EI-8 breach. Fidelity is ONE user intent
    // ("show me the real building" / "show me blocks"), so one action sets it on BOTH
    // surfaces. This is not copied logic: both setters are existing declared entry
    // points, and both are internally guarded (each re-renders only while its own
    // surface is the active one), so setting both is safe and makes the two surfaces
    // agree instead of drifting apart.
    {
        id: 'site.fidelity.real',
        label: 'Real',
        icon: '◉',
        title: 'Show the real PRYZM building with full elements (windows · doors · roof · furniture).',
        group: 'display',
        activeWhen: (s) => s.buildingFidelity === 'real',
        entryPoints: ['pryzmSetFormaBuildingFidelity', 'pryzmSetGlobeBuildingFidelity'],
        absorbs: ['Real (Forma sub-bar)', 'Real (globe segment of the view-mode switch)'],
        dispatch: (h) => {
            h.pryzmSetFormaBuildingFidelity?.('real');
            h.pryzmSetGlobeBuildingFidelity?.('real');
        },
    },
    {
        id: 'site.fidelity.massing',
        label: 'Massing',
        icon: '▢',
        title: 'Show the abstract massing study (white / pastel volumes) instead of the real building.',
        group: 'display',
        activeWhen: (s) => s.buildingFidelity === 'massing',
        entryPoints: ['pryzmSetFormaBuildingFidelity', 'pryzmSetGlobeBuildingFidelity'],
        absorbs: ['Massing (Forma sub-bar)', 'Massing (globe segment of the view-mode switch)'],
        dispatch: (h) => {
            h.pryzmSetFormaBuildingFidelity?.('massing');
            h.pryzmSetGlobeBuildingFidelity?.('massing');
        },
    },
    {
        id: 'site.zoom-to-site',
        label: 'Zoom to Site',
        icon: '⤢',
        title: 'Reframe the camera on the site and the placed building.',
        group: 'display',
        // The two legacy buttons wore this label against DIFFERENT targets — the Forma
        // preset and the placed building on the photoreal tiles — so which one you got
        // depended on which bar you reached for. `pryzmZoomToSite` resolves that by
        // asking the ACTIVE surface, which is what the user meant in both cases.
        entryPoints: ['pryzmZoomToSite'],
        absorbs: ['Zoom to Site (Forma sub-bar)', 'Zoom to Site (globe segment)'],
        homeNote:
            'This is a CAMERA action, not a GIS one. Its long-term home is with the other camera ' +
            'controls (Camera & Render); it is declared here because the founder boxed it and ' +
            'because both legacy copies must retire together.',
        dispatch: (h) => { h.pryzmZoomToSite?.(); },
    },
    {
        id: 'site.analysis',
        label: 'Site Analysis',
        icon: '☀',
        title: 'Show / hide the site-analysis panel (sun · weather · wind).',
        group: 'display',
        entryPoints: ['pryzmToggleSiteAnalysis'],
        // The floating "Site Analysis" pill and the "Analysis" sub-bar button had
        // line-for-line identical handler bodies. Two names, one action — and now one
        // registered entry point that both of them, and this panel, can call.
        absorbs: ['Analysis (Forma sub-bar)', 'Site Analysis (floating launcher pill)'],
        dispatch: (h) => { h.pryzmToggleSiteAnalysis?.(); },
    },
    {
        id: 'site.buildable-envelope',
        label: 'Buildable Envelope',
        icon: '▧',
        title: 'Show / hide the buildable-envelope facts card.',
        group: 'display',
        entryPoints: ['pryzmToggleEnvelopeCard'],
        absorbs: [],
        dispatch: (h) => { h.pryzmToggleEnvelopeCard?.(); },
    },
    {
        id: 'site.floor-filter',
        label: 'Floors shown',
        icon: '▤',
        title: 'Choose which floor(s) of the placed building are shown on the site view.',
        group: 'display',
        entryPoints: [],
        unavailableReason:
            'Not yet re-hosted — the floor selector drives CesiumViewport.setVisibleFormaLevels ' +
            'through a closure with no registered entry point.',
        absorbs: ['All floors (Forma sub-bar selector)'],
        homeNote:
            'This is a LEVEL filter, not a GIS action — its natural home is Levels & Grids, ' +
            'alongside the BIM level visibility it duplicates for the Cesium surface. It is ' +
            'declared here because the founder boxed it; the recommendation is to move the ' +
            'capability to Levels & Grids and have the site view read the same level intent ' +
            '(P7 — visibility intent is a domain concept, not per-surface UI state).',
        dispatch: () => { /* unavailable — see unavailableReason */ },
    },

    // ── Graphs — MOVED OUT 2026-08-21 (lane UBG1, ADR-0343 §D.7, L-3259) ────────
    //
    // `graph.building` (⚛ Graph) and `graph.living` (✦ Living Graph) used to live
    // here, as 2 of 15 actions in a `graphs` group declared solely for them. They
    // are BUILDING concerns and this is the SITE tab; the founder said so, and
    // ADR-0343 §D.7 specified the move.
    //
    // ⛔ The move was BLOCKED, and the block was real: §D.7's binding precondition
    // was that the Unified Building Graph be StoreEventBus-maintained first
    // (L-2131). Moving a stale-by-construction view onto a surface the founder
    // reads as LIVE would have converted a quiet defect into a visible one, and
    // the move would have been blamed for it. L-3251 discharged the precondition;
    // this removal is the second half.
    //
    // The `window` entry-point seam is UNCHANGED — `installLiveGraphWiring()`
    // still installs both overlays and both console openers still work. Only the
    // HOST moved. Their new home is the Analysis surface (F4): the
    // `relationship-graph` widget and its `relationship-coverage` companion, both
    // on the default dashboard.
    //
    // ⚖ STILL THE FOUNDER'S CALL, DELIBERATELY NOT TAKEN HERE (ADR-0343 §U.1):
    // whether `graph.building` RETIRES in favour of `graph.living`.
    // `living-graph/index.ts` states in its own header that the Living Graph "is
    // intended to SUPERSEDE the static ⚛ Graph view as the primary graph UI", and
    // that reconciliation has never happened — which is why two adjacent pills
    // existed for one concept. Retiring it would delete a live capability, so both
    // overlays remain installed and reachable. The decision costs one edit either
    // way; this lane surfaced it rather than making it.

    // ── Workspace ───────────────────────────────────────────────────────────────
    //
    // ⚠ APP-WIDE, and said so on the control. `resetPanelLayout()` walks the whole
    // PANEL_REGISTRY — view-properties, level-stepper, site-plan-overlay — so this is
    // not a site action. It is hosted here because the floating launcher rail it used
    // to live in is gone (L-1360) and it is the only route to recovering a panel dragged
    // half off-screen (§UX1-PANEL-DEFAULTS D2). C06 §13.7 verdict (d): state where a
    // control really belongs rather than let its host imply a scope it does not have.
    {
        id: 'panel.reset-layout',
        label: 'Reset panel layout',
        icon: '⟲',
        title: 'Reset ALL optional panels app-wide — close them and restore their default size and position. Not limited to the site panels.',
        group: 'utility',
        entryPoints: ['pryzmResetPanelLayout'],
        absorbs: ['⟲ (floating launcher pill)'],
        homeNote:
            'App-wide panel recovery, not a GIS action. Hosted here because the launcher rail it ' +
            'lived in was removed and no other surface offers it; its natural long-term home is ' +
            'wherever panel management is surfaced (C06 §2).',
        dispatch: (h) => { h.pryzmResetPanelLayout?.(); },
    },
];

/**
 * Resolve a declared action to its LIVE dispatch against a host, or `null`.
 *
 * `null` is the honest answer for "this button would do nothing", and it is the ONLY
 * way a surface may learn that. A surface must render a `null`-resolving action as
 * disabled — never as a live button, and never by substituting a handler of its own.
 */
export function resolveGisAction(
    decl: GisActionDecl,
    host: GisCapabilityHost,
): (() => void) | null {
    if (decl.entryPoints.length === 0) return null;
    for (const ep of decl.entryPoints) {
        if (typeof host[ep] !== 'function') return null;
    }
    return () => decl.dispatch(host);
}

/** The declared actions in one group, registry order preserved. */
export function gisActionsInGroup(group: GisActionGroup): readonly GisActionDecl[] {
    return GIS_ACTIONS.filter((a) => a.group === group);
}
