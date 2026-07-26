// §FEAT-STANDARDIZED-VIEW-PROPERTIES (L-625, C59 §6) — the PURE model behind the
// founder's "no matter the view, all views should have the SAME properties available
// where meaningful, and kill duplicated information".
//
// WHAT THIS ANSWERS (two questions, one registry):
//   1. "Which properties are MEANINGFUL for this view?"  → `propertiesForView()`.
//      Every view draws from ONE catalogue (`VIEW_PROPERTY_REGISTRY`); a property is
//      surfaced in a view only when it applies there (a sun slider is meaningless on
//      the flat 2D site map; post-processing is meaningless on a Canvas2D plan). This
//      is "the same properties available WHERE MEANINGFUL", not "every control on
//      every surface".
//   2. "Who OWNS this property, so it is never shown twice as two divergent copies?"
//      → `descriptor.sharedEnvironment` + `canonicalOwner`. Sun / Shadow / Wind /
//      Climate / Population are SHARED-ENVIRONMENT properties: their value lives in a
//      SINGLE source of truth (`environmentAnalysisStore`), so even when two panels
//      render a control for the same property the DATA cannot diverge — which is the
//      de-duplication the founder asked for ("Site Analysis and VIEW PROPERTIES repeat
//      Sun/Shadow/Wind … single source of truth, not repeated between the panels").
//
// WHY PURE (no DOM / no renderer / no I/O): identical rationale to `paneViewModel.ts`
// and `paneViewOptions.ts` — the founder-visible standardisation ("same properties,
// where meaningful, never duplicated") must be unit-testable WITHOUT a live viewer.
// Pure decisions are P8 span-exempt (see `globePlacementDecisions.ts` header).
//
// This is the DECISION layer only. The live panels (`ViewPropertiesSection`,
// `FormaSiteAnalysisControls`) render from it and route every shared-environment write
// through `environmentAnalysisStore`; they never hold a second private copy of a value
// this registry marks `sharedEnvironment`.

import type { ViewType } from './paneViewModel';

// ── Vocabulary ──────────────────────────────────────────────────────────────

/**
 * The canonical, standardized property groups a view can expose. This is the ONE
 * catalogue every view draws from — adding a property is a single entry here, and it
 * then appears (where applicable) without a per-panel bespoke list.
 */
export type ViewProperty =
    | 'sun'            // sun position / time-of-day (drives lighting + shadow angle)
    | 'shadow'         // shadow casting (scene + ground catcher)
    | 'wind'           // wind direction + speed (environmental context)
    | 'climate'        // temperature + humidity
    | 'population'     // population density
    | 'postProcessing' // AO / bloom / exposure — GPU render finishing
    | 'sunPath'        // sun-path arc overlay (3D site analysis)
    | 'windRose'       // measured wind-rose visualisation (3D site analysis)
    | 'siteHeatmap'    // switchable analysis ground heatmap (sun-hours / temp / wind / pop)
    | 'camera';        // camera / navigation controls for this surface

/** The panels that surface view properties. The de-dup names ONE owner per property. */
export type PropertyPanelId = 'view-properties' | 'site-analysis';

export interface ViewPropertyDescriptor {
    readonly property: ViewProperty;
    readonly label: string;
    /**
     * The views for which this property is MEANINGFUL. A property is surfaced in a view
     * only when it is listed here — this is the "where meaningful" gate. A flat 2D map
     * lists no sun / shadow / post-processing; a Canvas2D plan lists no GPU post-proc.
     */
    readonly appliesTo: readonly ViewType[];
    /**
     * True when this property's VALUE is a shared-environment quantity that MUST have a
     * single source of truth (`environmentAnalysisStore`). Two panels may render a
     * control for it, but they read/write the ONE store so the value never diverges.
     * This flag is the de-duplication contract, machine-checkable by a test.
     */
    readonly sharedEnvironment: boolean;
    /**
     * The panel that OWNS the primary control surface for this property. The other panel
     * may still SHOW the value (reading the shared store) but the canonical, full control
     * lives here — so "Sun/Shadow/Wind" is authored in one place, not authored twice.
     */
    readonly canonicalOwner: PropertyPanelId;
}

// ── The registry ─────────────────────────────────────────────────────────────
//
// Meaningfulness, grounded in what each renderer actually is:
//   • `bim-3d`       — the WebGPU BIM scene: lit geometry, real shadows, post-processing.
//                      Sun / Shadow / Wind / Climate / Population / Post-proc all apply.
//   • `site-3d`      — the Cesium Forma site: sun scrubber + shadows, plus the site
//                      ANALYSIS layers (sun-path, wind rose, ground heatmap) that only
//                      exist here. Post-processing is a BIM-renderer concept, so it is
//                      NOT listed for site-3d (Cesium owns its own tone-mapping).
//   • `bim-plan-2d` / `bim-elevation-2d` / `bim-section-2d` — orthographic Canvas2D
//                      projections: no sun/shadow/post-proc; camera (pan/zoom) applies.
//   • `site-map-2d`  — the flat MapLibre parcel map: no sun/shadow; camera applies.
//
// Shared-environment properties (sun/shadow/wind/climate/population) carry
// `sharedEnvironment: true` and their canonical owner is the panel where the founder
// expects to AUTHOR them; the 3D-site-only analysis layers are owned by 'site-analysis'.

const THREE_D: readonly ViewType[] = ['bim-3d', 'site-3d'];
const ALL_2D: readonly ViewType[] = ['bim-plan-2d', 'bim-elevation-2d', 'bim-section-2d', 'site-map-2d'];
const SITE_3D_ONLY: readonly ViewType[] = ['site-3d'];
const ALL_VIEWS: readonly ViewType[] = [...THREE_D, ...ALL_2D];

export const VIEW_PROPERTY_REGISTRY: Readonly<Record<ViewProperty, ViewPropertyDescriptor>> = {
    sun: {
        property: 'sun', label: 'Sun & time of day', appliesTo: THREE_D,
        sharedEnvironment: true, canonicalOwner: 'view-properties',
    },
    shadow: {
        property: 'shadow', label: 'Shadows', appliesTo: THREE_D,
        sharedEnvironment: true, canonicalOwner: 'view-properties',
    },
    wind: {
        property: 'wind', label: 'Wind', appliesTo: THREE_D,
        sharedEnvironment: true, canonicalOwner: 'view-properties',
    },
    climate: {
        property: 'climate', label: 'Climate / heat', appliesTo: THREE_D,
        sharedEnvironment: true, canonicalOwner: 'view-properties',
    },
    population: {
        property: 'population', label: 'Population density', appliesTo: THREE_D,
        sharedEnvironment: true, canonicalOwner: 'view-properties',
    },
    postProcessing: {
        property: 'postProcessing', label: 'Post-processing', appliesTo: ['bim-3d'],
        sharedEnvironment: false, canonicalOwner: 'view-properties',
    },
    sunPath: {
        property: 'sunPath', label: 'Sun-path overlay', appliesTo: SITE_3D_ONLY,
        sharedEnvironment: false, canonicalOwner: 'site-analysis',
    },
    windRose: {
        property: 'windRose', label: 'Wind rose', appliesTo: SITE_3D_ONLY,
        sharedEnvironment: false, canonicalOwner: 'site-analysis',
    },
    siteHeatmap: {
        property: 'siteHeatmap', label: 'Analysis heatmap', appliesTo: SITE_3D_ONLY,
        sharedEnvironment: false, canonicalOwner: 'site-analysis',
    },
    camera: {
        property: 'camera', label: 'Camera & navigation', appliesTo: ALL_VIEWS,
        sharedEnvironment: false, canonicalOwner: 'view-properties',
    },
};

/**
 * The catalogue's stable presentation order. Derived from the registry (never a second
 * hardcoded list): adding a property is ONE registry entry and it appears here.
 */
export function listViewProperties(
    registry: Readonly<Record<ViewProperty, ViewPropertyDescriptor>> = VIEW_PROPERTY_REGISTRY,
): ViewProperty[] {
    return Object.keys(registry) as ViewProperty[];
}

/** Is `property` meaningful for `viewType`? (The "where meaningful" gate.) */
export function isPropertyMeaningfulIn(
    property: ViewProperty,
    viewType: ViewType,
    registry: Readonly<Record<ViewProperty, ViewPropertyDescriptor>> = VIEW_PROPERTY_REGISTRY,
): boolean {
    return registry[property].appliesTo.includes(viewType);
}

/**
 * The standardized property set for a view: every catalogue property that is meaningful
 * there, in registry order. This is the founder's "all views expose the SAME set of
 * properties where meaningful" — one function, every view, one catalogue.
 */
export function propertiesForView(
    viewType: ViewType,
    registry: Readonly<Record<ViewProperty, ViewPropertyDescriptor>> = VIEW_PROPERTY_REGISTRY,
): ViewProperty[] {
    return listViewProperties(registry).filter((p) => isPropertyMeaningfulIn(p, viewType, registry));
}

/**
 * The shared-environment properties — the ones with a single source of truth
 * (`environmentAnalysisStore`). This is exactly the set the de-dup covers: a change to
 * any of these from either panel updates the ONE store, so the panels cannot diverge.
 */
export function sharedEnvironmentProperties(
    registry: Readonly<Record<ViewProperty, ViewPropertyDescriptor>> = VIEW_PROPERTY_REGISTRY,
): ViewProperty[] {
    return listViewProperties(registry).filter((p) => registry[p].sharedEnvironment);
}

/** The properties a given panel OWNS the canonical control surface for. */
export function propertiesOwnedBy(
    panel: PropertyPanelId,
    registry: Readonly<Record<ViewProperty, ViewPropertyDescriptor>> = VIEW_PROPERTY_REGISTRY,
): ViewProperty[] {
    return listViewProperties(registry).filter((p) => registry[p].canonicalOwner === panel);
}
