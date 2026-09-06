// §VIEW-PANEL-PER-PANE (founder 2026-09-06, with screenshots · C59 §2 · C06 §15) — THE ONE
// PANEL DEFINITION: the six options the founder named, in his order, each bound to a
// declared view type AND a declared GIS action.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// HIS WORDS
// ═══════════════════════════════════════════════════════════════════════════════════════
// *"the 2d map satellite and non-satellite option is MASKED FOR ANOTHER PANEL — add those
//  options to the main panel as being: 2d site map (existing pastel nice map) / 2d
//  Satellite / 3d site / 3d globe … WHEN BEING IN A SINGLE VIEW (this applies even in PRYZM
//  views) WE KEEP THE PANEL WITH ALL MAIN OPTIONS TO THE TOP: 2D SITE MAP / 2D SATELLITE /
//  3D SITE / 3D GLOBE / 3D PRYZM / 2D PRYZM — if the user wants to open more they can do it
//  in the browser. WHEN BEING IN SPLIT VIEW — WE SHALL HAVE TWO PANELS LIKE THAT — AND THE
//  USER CAN DECIDE WHAT TO ADD IN EACH OF THE SPLIT VIEWS (LEFT OR RIGHT)."*
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// ⭐ SIX OPTIONS, FOUR VIEWS — AND THAT IS THE WHOLE DESIGN
// ═══════════════════════════════════════════════════════════════════════════════════════
// Read as a list of views, the founder's six do not exist: this app has FOUR promoted views
// (`site-map-2d`, `site-3d`, `bim-3d`, `bim-plan-2d`) and two of them are offered under two
// VARIANTS each:
//
//   2D SITE MAP  ┐                    3D SITE   ┐
//                ├─ site-map-2d       3D GLOBE  ├─ site-3d
//   2D SATELLITE ┘  (MapLibre style)            ┘  (Cesium camera altitude)
//
// This is not a convenience: it is the ONLY shape the codebase permits, and both halves are
// already MEASURED findings rather than opinions.
//
//   · THE GLOBE. C60 §6.5 — *"the globe and the 3D Site ARE the same viewer at different
//     camera altitudes"* — and C60 §6.10 forbids a globe `ViewType` outright. L-6802
//     measured what happens if you mint one anyway: `assignViewToPane` vacates only the SAME
//     view type, so a rival cesium row beside `site-3d` yields
//     `validatePaneLayout → {ok:false, conflicts:[{rendererKind:'cesium',panes:['left','right']}]}`
//     — the globe button would refuse on every click in the founder's own default split.
//
//   · SATELLITE. The identical argument one layer down. Satellite is a MapLibre STYLE on the
//     one 2D map (`SiteBoundaryMap2D.swapBasemap`, A.8.c.f.4, shipped 2026-06-03). A rival
//     `site-satellite-2d` view type would need a SECOND MapLibre map and a second mounter —
//     i.e. a second satellite implementation, which is the single thing this lane was
//     forbidden to build. The founder's complaint was REACHABILITY (*"MASKED FOR ANOTHER
//     PANEL"*), not absence.
//
// So a panel row is `(viewType, variant?)`, and the variant is dispatched to a DIFFERENT
// port from the view: the view goes to `PaneLayoutStore`, the basemap to the map and the
// framing to the camera. Keeping those apart is why the pane store never grew an altitude
// field, and it is why it does not now grow a basemap one.
//
// ═══════════════════════════════════════════════════════════════════════════════════════
// THE SET IS DERIVED; THE ROWS ARE DECLARED; BOTH DIRECTIONS ARE CHECKED
// ═══════════════════════════════════════════════════════════════════════════════════════
// `VIEW_TYPE_REGISTRY.panelPromoted` decides WHICH views the panel carries — one registry
// fact, not a second census (C06 §15 / C01 §6 rule 6: censuses rot). `PANEL_ROWS` below
// declares WHAT each promoted view offers, because a variant is not derivable from a
// registry that does not model variants. `viewPanelCoverage()` reports both mismatches — a
// promoted view with no rows, and rows for a view that is not promoted — and the spec fails
// on either, so the pair cannot drift the way two hand-written lists do.
//
// ⛔ `actionId` IS LOAD-BEARING, NOT DECORATION. It names a row in `GIS_ACTIONS`
// (`ui/gis/gisActionRegistry.ts`), which is the authority for the WHOLE-SCREEN route — the
// route `viewSegmentSwitcher` dispatches and the only route that exists for a view no pane
// can host. `viewSegmentSwitcher.spec.ts` asserts every id here resolves to a declared
// action with a registered entry point, so a renamed or deleted registry row fails the build
// instead of silently rendering a dead segment. That guarantee is inherited here, not
// re-invented.
//
// ⚠ THIS FILE HOLDS NO ACTION ID *IMPORT*. It is an `engine/views` module and
// `gisActionRegistry` is a `ui/gis` one; importing it would drag the whole GIS surface into
// the pure pane model that `paneViewModel.ts` exists to keep headless. The ids are strings
// here and are resolved by the UI hosts, exactly as `SiteViewCameraPorts` are injected
// rather than resolved.
//
// PURE: no DOM, no renderer, no store, no I/O. Pure decisions are P8 span-exempt (see
// `paneViewModel.ts`'s header for the precedent). P4: no globals. P6: no store writes.

import {
    VIEW_TYPE_REGISTRY,
    listPaneViewTypes,
    type ViewType,
    type ViewTypeDescriptor,
} from './paneViewModel';

/** Stable ids for the six rows. Hosts key off these, never off the labels. */
export type ViewPanelOptionId =
    | 'site-map'
    | 'site-satellite'
    | 'site-3d'
    | 'site-globe'
    | 'pryzm-3d'
    | 'pryzm-2d';

/**
 * The extra thing a row asks for beyond "put this view on screen".
 *
 * ⚠ TWO PORTS, DELIBERATELY NOT ONE. `basemap` is a MapLibre style on the 2D map;
 * `framing` is the ONE Cesium camera's altitude. Neither is pane-layout state, and
 * `PaneLayoutStore` — which owns which view is in which pane and nothing else — must not
 * acquire a second job it has no state for.
 */
export type ViewPanelVariant =
    /** Which MapLibre style the 2D site map draws (`SiteBoundaryMap2D.swapBasemap`). */
    | { readonly kind: 'basemap'; readonly value: 'map' | 'satellite' }
    /** Where the ONE Cesium camera is framed (C60 §6.5 — site altitude vs world). */
    | { readonly kind: 'framing'; readonly value: 'site' | 'world' };

export interface ViewPanelOption {
    readonly id: ViewPanelOptionId;
    /** The founder's word for it. ONE spelling, shared by every host (C84 EI-8). */
    readonly label: string;
    /** Monochrome geometric mark, in the `▦ ◉ ◧ ▤` family (C06 §6.1) — never an emoji. */
    readonly glyph: string;
    /** The DECLARED `VIEW_TYPE_REGISTRY` key this row puts on screen. */
    readonly viewType: ViewType;
    /** The DECLARED `GIS_ACTIONS` id for the WHOLE-SCREEN route. */
    readonly actionId: string;
    /** Absent ⇒ the view as it is; present ⇒ the view in this state. */
    readonly variant?: ViewPanelVariant;
    /** Longer hover copy. Says what the row does, in the founder's terms. */
    readonly title: string;
}

/** One declared row, before the registry supplies its view type. */
type PanelRowDecl = Omit<ViewPanelOption, 'viewType'>;

/**
 * WHAT each promoted view offers on the panel. The KEYS are checked against
 * `panelPromoted` in both directions by {@link viewPanelCoverage}; the ORDER within a view
 * is the founder's (plain state first, then the variant).
 */
const PANEL_ROWS: Readonly<Partial<Record<ViewType, readonly PanelRowDecl[]>>> = {
    'site-map-2d': [
        {
            id: 'site-map',
            label: '2D Site Map',
            glyph: '▦',
            actionId: 'site.map-2d',
            variant: { kind: 'basemap', value: 'map' },
            title: 'The pastel vector site map — draw or edit your plot on it.',
        },
        {
            id: 'site-satellite',
            label: '2D Satellite',
            glyph: '◎',
            actionId: 'site.satellite-2d',
            variant: { kind: 'basemap', value: 'satellite' },
            title: 'The same 2D site map under real satellite imagery. Your boundary stays on it.',
        },
    ],
    'site-3d': [
        {
            id: 'site-3d',
            label: '3D Site',
            glyph: '◉',
            actionId: 'site.earth',
            variant: { kind: 'framing', value: 'site' },
            title: 'PRYZM Earth — the 3D site on the real plot, framed on your site.',
        },
        {
            id: 'site-globe',
            label: '3D Globe',
            glyph: '⊕',
            actionId: 'site.globe',
            variant: { kind: 'framing', value: 'world' },
            title: 'The same 3D site view, zoomed out to the whole Earth. This moves the camera '
                + 'only — your project is not touched.',
        },
    ],
    'bim-3d': [
        {
            id: 'pryzm-3d',
            label: '3D PRYZM',
            glyph: '◧',
            actionId: 'site.bim-3d',
            title: 'Your PRYZM model in 3D.',
        },
    ],
    'bim-plan-2d': [
        {
            id: 'pryzm-2d',
            label: '2D PRYZM',
            glyph: '▤',
            actionId: 'site.bim-plan',
            title: 'Your PRYZM model in plan.',
        },
    ],
};

/**
 * ⭐ THE PANEL, in the founder's order.
 *
 * Derived: registry declaration order × the promoted flag × the declared rows. Adding a
 * promoted view to `VIEW_TYPE_REGISTRY` and a row here makes it appear on EVERY host of
 * this panel with no other edit — and forgetting either half is a spec failure, not a
 * silently short panel.
 */
export function viewPanelOptions(
    registry: Readonly<Record<ViewType, ViewTypeDescriptor>> = VIEW_TYPE_REGISTRY,
): readonly ViewPanelOption[] {
    const out: ViewPanelOption[] = [];
    for (const viewType of listPaneViewTypes(registry)) {
        if (!registry[viewType]?.panelPromoted) continue;
        for (const row of PANEL_ROWS[viewType] ?? []) out.push({ ...row, viewType });
    }
    return out;
}

/** What {@link viewPanelCoverage} found. Empty arrays ⇒ the two halves agree. */
export interface ViewPanelCoverage {
    /** Promoted in the registry, but this file declares no row for it — a MISSING option. */
    readonly promotedWithoutRows: ViewType[];
    /** Rows declared here for a view the registry does not promote — an ORPHAN option. */
    readonly rowsWithoutPromotion: ViewType[];
}

/**
 * ⛔ THE BOTH-DIRECTIONS CHECK, and it is a function rather than a comment because the
 * repo's own finding is that a count can be right while the set is wrong
 * (`check-contract-index-equivalence.ts`, the fifth recurrence of exactly that). A panel
 * that silently lost a row would look like a working panel.
 */
export function viewPanelCoverage(
    registry: Readonly<Record<ViewType, ViewTypeDescriptor>> = VIEW_TYPE_REGISTRY,
): ViewPanelCoverage {
    const promoted = listPaneViewTypes(registry).filter((vt) => registry[vt]?.panelPromoted);
    const declared = Object.keys(PANEL_ROWS) as ViewType[];
    return {
        promotedWithoutRows: promoted.filter((vt) => (PANEL_ROWS[vt] ?? []).length === 0),
        rowsWithoutPromotion: declared.filter((vt) => !registry[vt]?.panelPromoted),
    };
}

/** The panel rows that put `viewType` on screen (one row, or a row per variant). */
export function viewPanelOptionsForView(
    viewType: ViewType,
    registry: Readonly<Record<ViewType, ViewTypeDescriptor>> = VIEW_TYPE_REGISTRY,
): readonly ViewPanelOption[] {
    return viewPanelOptions(registry).filter((o) => o.viewType === viewType);
}
