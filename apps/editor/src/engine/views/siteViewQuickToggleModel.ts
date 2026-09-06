// §SITE-VIEW-QUICK-TOGGLE (L-5110..L-5117 · C59 §2 · C06 §15) — the PURE decision half
// of the view panel.
//
// Founder 2026-08-21: *"we don't really need this 3D Site button on the top-right corner
// (almost hidden) — at this stage the user should be able to just go to 3D globe, so a
// button 3D globe / 3D site in the middle top would be beneficial."*
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ §VIEW-PANEL-PER-PANE — REWRITTEN 2026-09-06 ON A DIRECT FOUNDER REQUEST
// ═══════════════════════════════════════════════════════════════════════════════
// *"the 2d map satellite and non-satellite option is MASKED FOR ANOTHER PANEL — add those
//  options to the main panel as being: 2d site map (existing pastel nice map) / 2d
//  Satellite / 3d site / 3d globe … WHEN BEING IN A SINGLE VIEW (this applies even in PRYZM
//  views) WE KEEP THE PANEL WITH ALL MAIN OPTIONS TO THE TOP: 2D SITE MAP / 2D SATELLITE /
//  3D SITE / 3D GLOBE / 3D PRYZM / 2D PRYZM … WHEN BEING IN SPLIT VIEW — WE SHALL HAVE TWO
//  PANELS LIKE THAT — AND THE USER CAN DECIDE WHAT TO ADD IN EACH OF THE SPLIT VIEWS."*
//
// TWO THINGS CHANGED, and both were reversals of decisions recorded in this file:
//
//   1. THE ROWS COME FROM `viewPanelOptions()`, THE ONE PANEL DEFINITION — not from a
//      renderer-kind filter over the registry. The filter could not express the founder's
//      list, and that is a structural fact, not an oversight: his six are FOUR views, two of
//      them offered under two VARIANTS each (map ⇄ satellite, site ⇄ world). A registry that
//      does not model variants can never yield six rows. This is the same wall the globe hit
//      in August (L-6802), and the answer then — model the variant BESIDE the segments — is
//      now generalised: a variant is a first-class row, so satellite and the globe have ONE
//      shape between them instead of one being special.
//
//   2. THE BIM PROJECTIONS ARE PROMOTED. This file used to say, in bold, *"promoting them
//      here would make this bar a rival to that menu"*. The founder has now named `3D PRYZM`
//      and `2D PRYZM` as panel rows himself. The pane menu is NOT removed — it still lists
//      every registry view with its refusal, and it is still where elevations and sections
//      live (*"if the user wants to open more they can do it in the browser"*).
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⛔ WHAT DID **NOT** CHANGE — the three rules that were paid for in defects
// ═══════════════════════════════════════════════════════════════════════════════
//   · NO GLOBE `ViewType` WAS MINTED (C60 §6.10). The `3D Globe` row's `viewType` is
//     `site-3d`; only its `variant` differs. C60 §6.5: the globe and the 3D Site ARE the
//     same viewer at different camera altitudes. L-6802 MEASURED the alternative: a rival
//     cesium row beside `site-3d` gives
//     `validatePaneLayout → {ok:false, conflicts:[{rendererKind:'cesium',panes:['left','right']}]}`
//     — refusing on every click in the founder's own default split.
//   · NO SECOND SATELLITE PATH. The `2D Satellite` row's `viewType` is `site-map-2d`; its
//     variant is a MapLibre style, dispatched to the map's own `swapBasemap` (A.8.c.f.4).
//     A rival `site-satellite-2d` view type would mean a second MapLibre map.
//   · NO ONE-WAY DOOR (L-6804). If the "frame on the site" port is missing, the `3D Globe`
//     row is REFUSED — the gate is on the way OUT, where refusing is free, never on the way
//     back, where refusing strands.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHY PURE
// ═══════════════════════════════════════════════════════════════════════════════
// Same reason `paneViewOptions.ts` and `globePlacementDecisions.ts` are pure: the live
// surface needs Cesium and MapLibre and cannot run headless, so the DECISION — which rows
// exist, which is active, what a click dispatches, and what is refused and why — is pinned
// here and unit-tested without a viewer. Pure decisions are P8 span-exempt (see
// `paneViewModel.ts`'s header for the precedent).

import {
    LEFT_PANE,
    VIEW_TYPE_REGISTRY,
    assignViewToPane,
    type PaneId,
    type PaneLayout,
    type RendererKind,
    type ViewType,
    type ViewTypeDescriptor,
} from './paneViewModel';
import {
    viewPanelOptions,
    type ViewPanelOption,
    type ViewPanelOptionId,
    type ViewPanelVariant,
} from './viewPanelOptions';

/** Which MapLibre basemap the 2D site map is drawing. */
export type SiteViewBasemap = 'map' | 'satellite';

/**
 * §GLOBE-QUICK-TOGGLE — where the ONE Cesium camera is framed.
 *
 * TWO VALUES, not three, and deliberately NOT the four C60 stages. This is not the entry
 * flow's `SiteEntryStage`: the editor has no stage machine and must not acquire one (L-6803).
 */
export type SiteViewGlobeFraming = 'site' | 'world';

/** What one row of the panel is, once the layout and the two readings have been read. */
export interface SiteViewSegment {
    /** The panel definition's stable row id (`viewPanelOptions.ts`). */
    readonly optionId: ViewPanelOptionId;
    readonly viewType: ViewType;
    readonly label: string;
    readonly glyph?: string;
    readonly rendererKind: RendererKind;
    /** Absent ⇒ the view as it is; present ⇒ the view in this state. */
    readonly variant?: ViewPanelVariant;
    /** Hover copy for the ENABLED state — a disabled row shows `reason` instead. */
    readonly title: string;
    /** TRUE ⇒ this row is what the user is looking at (view hosted AND variant matching). */
    readonly active: boolean;
    /** TRUE ⇒ it is hosted AND that pane is the only occupied one (already full screen). */
    readonly soloed: boolean;
    /**
     * ⚠ UNREPORTED ≠ NOT CURRENT (C84 EI-1b). TRUE ⇒ the view IS hosted, but the reading
     * that would say whether THIS variant is the live one is not available in this session
     * (no basemap port wired). The row must render `aria-pressed="mixed"` and say so —
     * never `false`, which ASSERTS that the user is not looking at it. This is the same
     * vocabulary `viewSegmentSwitcher` uses for an action with no `activeWhen`.
     */
    readonly variantUnreported: boolean;
    readonly enabled: boolean;
    /** WHY it is not selectable. Present whenever `enabled` is false — never a bare grey. */
    readonly reason?: string;
    /** The pane a click would put it in. */
    readonly targetPane: PaneId;
    /**
     * TRUE ⇒ this panel addresses ONE pane, so a click ASSIGNS and leaves the other pane
     * alone (the founder's *"the user can decide what to add in each of the split views"*).
     * FALSE ⇒ the panel addresses the whole screen, so a click assigns AND solos.
     */
    readonly paneScoped: boolean;
}

/** The `◧ Back to split` affordance, modelled beside the rows rather than inside. */
export interface SiteViewSplitAction {
    readonly label: string;
    readonly enabled: boolean;
    readonly reason?: string;
}

export interface SiteViewQuickToggleModel {
    readonly segments: readonly SiteViewSegment[];
    readonly split: SiteViewSplitAction;
    /** The pane this panel addresses, or `null` when it addresses the whole screen. */
    readonly paneId: PaneId | null;
}

export interface SiteViewQuickToggleInput {
    readonly layout: PaneLayout;
    /**
     * §VIEW-PANEL-PER-PANE — the pane this panel belongs to. Omit for the whole-screen
     * panel (a click solos); pass `'left'` / `'right'` for one of the two split panels (a
     * click assigns to THAT pane only).
     */
    readonly paneId?: PaneId | null;
    /** `store.canRestoreSplit()` — whether a previous split is remembered. */
    readonly canRestoreSplit: boolean;
    /**
     * Renderer kinds with a mounter registered in THIS workspace
     * (`MultiPaneController.registeredKinds()`). `null` ⇒ skip the runtime check.
     */
    readonly mountableKinds?: ReadonlySet<RendererKind> | null;
    readonly registry?: Readonly<Record<ViewType, ViewTypeDescriptor>>;
    /**
     * §ONBOARDING-STEP-PINS-ITS-SURFACE (L-10720) — `store.pinnedViews()`: views a caller
     * has declared LOAD-BEARING for what the user is doing right now, mapped to the reason
     * to show them. See `PaneLayoutStore.pinView` for the full finding.
     */
    readonly pinnedViews?: ReadonlyMap<ViewType, string> | null;
    /**
     * §VIEW-PANEL-PER-PANE — the LIVE basemap reading (`window.pryzmGetSiteBasemap`, which
     * asks the map itself). `null`/undefined ⇒ NOT REPORTED, and the two 2D rows say so
     * rather than one of them claiming to be current.
     *
     * ⭐ A READING, NOT A MEMORY, and that is deliberate: the map's own corner chip can swap
     * the basemap without this panel hearing about it, so a remembered command would report
     * a swap the user made as not having happened.
     */
    readonly basemap?: SiteViewBasemap | null;
    /**
     * §GLOBE-QUICK-TOGGLE — the framing the CONTROL last commanded. Defaults to `'site'`.
     *
     * ⚠ IT IS A MEMORY, NOT A CAMERA READING, and the distinction is load-bearing (L-6805).
     * `siteEntryModel.ts` disqualifies camera sniffing outright — *"IT FLAPS… STAGE IS A
     * CAUSE, NOT AN EFFECT"* — so nothing here asks the camera where it is. It is the exact
     * analogue of `PaneLayoutStore._splitMemory`, the memory that makes `◧ Split` work.
     *
     * ⚠ It is an INPUT rather than a field on this module because two split panels share ONE
     * camera: a per-panel memory would let the left panel say "you are on the globe" while
     * the right one says you are not. The shell owns it; both panels read it.
     */
    readonly globeFraming?: SiteViewGlobeFraming | null;
    /**
     * Whether the "back to the site" reframe has a live entry point (production:
     * `window.pryzmZoomToSite`, the ONE declared `site.zoom-to-site` action).
     * Defaults to `true`.
     *
     * ⛔ FALSE DISABLES THE `3D Globe` ROW (L-6804). A control that flies the user to
     * 20,000 km with no way back is the L-942 shape — a branch whose escape hatch was never
     * built. The gate is on the WAY OUT, where refusing is free.
     */
    readonly canReturnToSite?: boolean;
    /**
     * Whether the basemap swap has a live entry point (production:
     * `window.pryzmSetSiteBasemap`). Defaults to `true`. FALSE refuses BOTH 2D rows with a
     * reason — pressing either would otherwise open the 2D map and silently leave whichever
     * basemap happened to be up, which is the dead-click this panel exists to remove.
     */
    readonly canSetBasemap?: boolean;
}

/** The pane currently hosting `viewType`, or null. */
function paneHosting(layout: PaneLayout, viewType: ViewType): PaneId | null {
    for (const paneId of Object.keys(layout)) {
        if (layout[paneId] === viewType) return paneId;
    }
    return null;
}

/** The first pane holding nothing, or null when every pane is occupied. */
function firstEmptyPane(layout: PaneLayout): PaneId | null {
    for (const paneId of Object.keys(layout)) {
        if (layout[paneId] == null) return paneId;
    }
    return null;
}

/** How many panes currently hold a view. */
function occupiedCount(layout: PaneLayout): number {
    return Object.keys(layout).filter((p) => layout[p] != null).length;
}

/**
 * §ONBOARDING-STEP-PINS-ITS-SURFACE — the reason a click on this row is refused, or `null`.
 *
 * ⭐ DERIVED FROM THE HYPOTHETICAL LAYOUT, not re-implemented per panel kind. A pane-scoped
 * click produces `assignViewToPane(layout, targetPane, viewType)`; a whole-screen click
 * additionally vacates every other pane. In both cases the question is the same: would the
 * pinned view still be hosted afterwards? Asking it of the layout the click would produce is
 * exact, and it is how `describePaneViewOptions` already answers it.
 *
 * ⚠ Only when the pinned view is CURRENTLY hosted. A pin on a view that is not on screen
 * refuses nothing — otherwise the click that would BRING IT BACK would be disabled by its
 * own pin, which is the unsatisfiable-gate shape (§L-716).
 */
function pinRefusal(
    pinned: ReadonlyMap<ViewType, string> | null,
    layout: PaneLayout,
    candidate: ViewType,
    targetPane: PaneId,
    paneScoped: boolean,
    registry: Readonly<Record<ViewType, ViewTypeDescriptor>>,
): string | null {
    if (!pinned || pinned.size === 0) return null;
    let hypothetical = assignViewToPane(layout, targetPane, candidate, registry);
    if (!paneScoped) {
        // A whole-screen click SOLOs `targetPane` — every other pane empties.
        const soloed: Record<PaneId, ViewType | null> = { ...hypothetical };
        for (const p of Object.keys(soloed)) if (p !== targetPane) soloed[p] = null;
        hypothetical = soloed;
    }
    for (const [viewType, reason] of pinned) {
        if (paneHosting(layout, viewType) === null) continue;
        if (Object.values(hypothetical).includes(viewType)) continue;
        return reason;
    }
    return null;
}

/** Is the variant this row asks for the one currently live? `null` ⇒ not reported. */
function variantIsLive(
    variant: ViewPanelVariant | undefined,
    basemap: SiteViewBasemap | null,
    framing: SiteViewGlobeFraming,
): boolean | null {
    if (!variant) return true;                       // no variant — hosting is the whole answer
    if (variant.kind === 'framing') return framing === variant.value;
    return basemap == null ? null : basemap === variant.value;
}

/**
 * ⭐ THE MODEL. Pure: layout + two readings in, rows out. No store, no DOM, no renderer.
 */
export function describeSiteViewQuickToggle(
    input: SiteViewQuickToggleInput,
): SiteViewQuickToggleModel {
    const registry = input.registry ?? VIEW_TYPE_REGISTRY;
    const { layout } = input;
    const mountable = input.mountableKinds ?? null;
    const pinned = input.pinnedViews ?? null;
    const paneId = input.paneId ?? null;
    const paneScoped = paneId !== null;
    const basemap = input.basemap ?? null;
    const framing: SiteViewGlobeFraming = input.globeFraming ?? 'site';
    const canReturnToSite = input.canReturnToSite ?? true;
    const canSetBasemap = input.canSetBasemap ?? true;
    const occupied = occupiedCount(layout);

    const segments = viewPanelOptions(registry).map((opt: ViewPanelOption): SiteViewSegment => {
        const d = registry[opt.viewType]!;
        const hostPane = paneHosting(layout, opt.viewType);
        const hosted = paneScoped ? layout[paneId] === opt.viewType : hostPane !== null;
        const live = variantIsLive(opt.variant, basemap, framing);
        const active = hosted && live === true;
        const variantUnreported = hosted && live === null;
        const soloed = hosted && occupied === 1;

        // A pane-scoped click lands in ITS pane, always. A whole-screen click lands where
        // the view already is, else a free pane, else the left pane.
        const targetPane = paneScoped ? paneId : (hostPane ?? firstEmptyPane(layout) ?? LEFT_PANE);

        const base = {
            optionId: opt.id,
            viewType: opt.viewType,
            label: opt.label,
            glyph: opt.glyph,
            rendererKind: d.rendererKind,
            ...(opt.variant ? { variant: opt.variant } : {}),
            title: opt.title,
            active,
            soloed,
            variantUnreported,
            targetPane,
            paneScoped,
        } as const;

        // STATIC half — the registry says this view cannot be pane-hosted yet.
        //
        // ⭐ AND IT IS A NAMED, HONEST DEGRADE RATHER THAN A HIDDEN ROW. `bim-3d` is the one
        // this bites: the PRYZM 3D renderer owns `#container` and cannot be re-targeted into
        // a pane (C59 Phase 3), so in a SPLIT there is genuinely nowhere to put it. The row
        // stays, disabled, printing that sentence — and the WHOLE-SCREEN panel offers the
        // same view through `site.bim-3d`, which fills the canvas. One view, two panels, two
        // honest answers.
        if (!d.paneHostable) {
            return {
                ...base,
                enabled: false,
                reason: d.unavailableReason ?? `${opt.label} cannot be hosted in a pane yet.`,
            };
        }
        // RUNTIME half — its renderer has no mounter registered in this workspace.
        if (mountable && !mountable.has(d.rendererKind)) {
            return {
                ...base,
                enabled: false,
                reason:
                    `${opt.label} needs the ${d.rendererKind} renderer, which is not `
                    + 'loaded in this workspace.',
            };
        }
        // VARIANT half — the port that would set this variant is not wired.
        if (opt.variant?.kind === 'basemap' && !canSetBasemap) {
            return {
                ...base,
                enabled: false,
                reason:
                    'The basemap swap is not wired in this workspace, so this would open the 2D '
                    + 'map and leave whichever basemap happened to be up. It stays off rather '
                    + 'than looking like it worked.',
            };
        }
        // ⛔ NO ONE-WAY DOOR (L-6804) — see `canReturnToSite`.
        if (opt.variant?.kind === 'framing' && opt.variant.value === 'world' && !canReturnToSite) {
            return {
                ...base,
                enabled: false,
                reason:
                    'Reframing on the site is not wired in this workspace, so the globe would '
                    + 'have no way back. This control stays off rather than strand you at world '
                    + 'altitude.',
            };
        }
        // PINNED half — §ONBOARDING-STEP-PINS-ITS-SURFACE (L-10720).
        const refusal = pinRefusal(pinned, layout, opt.viewType, targetPane, paneScoped, registry);
        if (refusal) return { ...base, enabled: false, reason: refusal };

        return { ...base, enabled: true };
    });

    return {
        segments,
        paneId,
        split: {
            label: '◧ Split',
            enabled: input.canRestoreSplit && occupied === 1,
            reason: occupied !== 1
                ? 'Already split.'
                : input.canRestoreSplit
                    ? undefined
                    : 'No previous split to restore — choose a view for the other pane.',
        },
    };
}

/** The pane intents this panel may emit — the `PaneLayoutStore` vocabulary, unextended. */
export type SiteViewPaneIntent =
    | { readonly type: 'view.pane.assign'; readonly paneId: PaneId; readonly viewType: ViewType | null }
    | { readonly type: 'view.pane.solo'; readonly paneId: PaneId };

/**
 * The CAMERA intents. A SEPARATE namespace from `view.pane.*` on purpose: they go to a
 * different port. `PaneLayoutStore` owns which view is in which pane and knows nothing about
 * altitude; the ONE Cesium camera is moved by the camera port (C60 §4), and conflating the
 * two would give the pane store a second job it has no state for.
 *
 * ⚠ DELIBERATELY PAYLOAD-FREE. The world framing is C60's to declare
 * (`siteEntryModel.worldFramingTarget()`), and C60 DEPENDS ON C59 (C60 §7) — so a C59 chrome
 * module importing C60 to fill in a lat/lon/altitude would invert that edge.
 */
export type SiteViewCameraIntent =
    | { readonly type: 'view.site.frame-globe' }
    | { readonly type: 'view.site.frame-site' };

/**
 * §VIEW-PANEL-PER-PANE — the BASEMAP intent. A third namespace for the third port, for the
 * identical reason the camera has its own: the basemap is a MapLibre style owned by
 * `SiteBoundaryMap2D`, and the pane store has no field for it either.
 */
export type SiteViewBasemapIntent = {
    readonly type: 'view.site.basemap';
    readonly value: SiteViewBasemap;
};

export type SiteViewIntent = SiteViewPaneIntent | SiteViewCameraIntent | SiteViewBasemapIntent;

/**
 * The intents ONE row's click must dispatch, in order.
 *
 * ⛔ Returned as DATA rather than executed, so the sequencing is unit-testable and so the DOM
 * layer cannot invent a fourth way to move a view (C59 §2 invariant 3: a click never touches
 * a renderer or the `MultiPaneController` — it dispatches `view.pane.*` into the store and
 * repaints from the store's notification).
 *
 * THE SEQUENCE:
 *   · PANE-SCOPED panel — assign the view to THIS pane (skipped when it is already there,
 *     because re-assigning a heavyweight singleton into the pane it already occupies is a
 *     needless re-mount), then the variant. The other pane is never touched: that is the
 *     founder's *"the user can decide what to add in each of the split views."*
 *   · WHOLE-SCREEN panel — "show me the 3D globe" means SHOW IT, so assign-then-solo, then
 *     the variant. Already alone on screen with the right variant ⇒ NOTHING.
 *
 * ⚠ THE VARIANT IS ALWAYS LAST. Framing a pane that is not mounted yet drops the target
 * (`cesiumSiteEntryCameraPort` logs exactly that), and swapping the basemap of a map that
 * does not exist yet would be dropped the same way — which is why `GISAreaLayout` also
 * REMEMBERS the basemap request and applies it at mount. Two independent guards, because
 * this one cannot cover the lazy-import window on its own.
 */
export function segmentClickIntents(
    segment: SiteViewSegment,
    layout: PaneLayout,
): readonly SiteViewIntent[] {
    if (!segment.enabled) return [];

    const out: SiteViewIntent[] = [];
    const alreadyThere = layout[segment.targetPane] === segment.viewType;
    if (!alreadyThere) {
        out.push({ type: 'view.pane.assign', paneId: segment.targetPane, viewType: segment.viewType });
    }
    if (!segment.paneScoped && !segment.soloed) {
        out.push({ type: 'view.pane.solo', paneId: segment.targetPane });
    }

    // The variant. Skipped only when the panel can SEE that it is already live — an
    // unreported basemap is not a reason to skip the swap, it is a reason to make it.
    if (segment.variant && !segment.active) {
        if (segment.variant.kind === 'basemap') {
            out.push({ type: 'view.site.basemap', value: segment.variant.value });
        } else {
            out.push(
                segment.variant.value === 'world'
                    ? { type: 'view.site.frame-globe' }
                    : { type: 'view.site.frame-site' },
            );
        }
    }
    return out;
}

/** Type guard — the DOM layer forwards these to the camera port, not to the store. */
export function isCameraIntent(i: SiteViewIntent): i is SiteViewCameraIntent {
    return i.type === 'view.site.frame-globe' || i.type === 'view.site.frame-site';
}

/** Type guard — the DOM layer forwards these to the basemap port, not to the store. */
export function isBasemapIntent(i: SiteViewIntent): i is SiteViewBasemapIntent {
    return i.type === 'view.site.basemap';
}
