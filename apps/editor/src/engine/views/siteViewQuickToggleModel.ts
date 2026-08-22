// §SITE-VIEW-QUICK-TOGGLE (L-5110..L-5117 · C59 §2 · C06 §15) — the PURE decision half
// of the top-centre 3D globe / 3D site control.
//
// Founder 2026-08-21: *"we don't really need this 3D Site button on the top-right corner
// (almost hidden) — at this stage the user should be able to just go to 3D globe, so a
// button 3D globe / 3D site in the middle top would be beneficial."*
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⛔ WHAT THIS DOES **NOT** DO — THE PANE MENU SURVIVES
// ═══════════════════════════════════════════════════════════════════════════════
// The existing per-pane picker ("SHOW IN THIS PANE": 2D Site Map · 3D Site · Plan ·
// 3D Model · Elevation · Section) is NOT removed and NOT replaced. Four of its six
// entries are disabled AND state why — that is C59 Phase 2's disable-or-explain rule,
// and those refusals are real information about Phase 3 work that is genuinely not
// done. Deleting them to make room for a prettier control would trade a truthful
// refusal for a shorter list, which is the opposite of the trade this codebase makes.
//
// This adds a PROMOTED SHORTCUT to the two views that are hostable TODAY, in the place
// the founder asked for. Everything else stays where it is.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHY A PURE MODULE
// ═══════════════════════════════════════════════════════════════════════════════
// Same reason `paneViewOptions.ts` and `globePlacementDecisions.ts` are pure: the live
// surface needs Cesium and MapLibre and cannot run headless, so the DECISION — which
// segments exist, which is active, what a click should dispatch, and what is refused
// and why — is pinned here and unit-tested without a viewer. Pure decisions are P8
// span-exempt (see `paneViewModel.ts`'s header for the precedent).
//
// ⚠ THE SEGMENT SET IS DERIVED, NOT LISTED. It is every registry entry whose renderer
// is a SITE renderer (`maplibre` / `cesium`). Hand-listing `['site-map-2d', 'site-3d']`
// here would be a second census beside `VIEW_TYPE_REGISTRY`, and this repo's own
// finding is that censuses rot (C06 §15 / C01 §6 rule 6). Add a site view to the
// registry and it appears here with no edit.
//
// ═══════════════════════════════════════════════════════════════════════════════
// §GLOBE-QUICK-TOGGLE (L-6800..L-6807 · C59 §2 · C60 §6.5/§6.10) — ⭐ WHY THE GLOBE
// BUTTON WAS MISSING, WHICH IS NOT WHAT IT LOOKS LIKE
// ═══════════════════════════════════════════════════════════════════════════════
// Founder 2026-08-22: *"add in the top panel buttons **3d globe** also"* — this bar,
// which shipped as `▦ 2D Site Map | ◉ 3D Site | ◧ Split`.
//
// The 2026-08-21 pass named this file "the top-centre 3D globe / 3D site control" and
// then could not produce a globe segment. **That was not an oversight and no amount of
// care would have caught it, because the two halves of the design forbid each other:**
//
//   · `segments` is DERIVED from `VIEW_TYPE_REGISTRY` (the paragraph directly above).
//     A globe segment therefore requires a globe `ViewType`.
//   · **C60 §6.10 forbids exactly that ViewType** — *"the entry flow is a STATE of the
//     `site-3d` view, not a new view mechanism. It adds no `ViewType`, no renderer and
//     no pane framework"* — because C60 §6.5 says the globe and the 3D Site **ARE the
//     same viewer at different camera altitudes**.
//
// So the derivation could NEVER yield a globe, and the header promised one anyway. The
// globe is ABSENT from this bar for a structural reason, while the globe SUBSYSTEM is
// fully built and merely UNREACHABLE outside onboarding (L-6801) — two different
// defects with opposite fixes, which is why the distinction is not pedantry.
//
// ⭐ THE FIX IS THEREFORE NOT A THIRD SEGMENT. It is an ACTION beside the segments —
// `SiteViewGlobeAction`, modelled exactly like the `◧ Split` affordance already is —
// that puts the ONE cesium view on screen and then moves the ONE camera. See that
// interface for the measurement that rules the rival-ViewType design out (L-6802).

import {
    LEFT_PANE,
    VIEW_TYPE_REGISTRY,
    type PaneId,
    type PaneLayout,
    type RendererKind,
    type ViewType,
    type ViewTypeDescriptor,
} from './paneViewModel';

/**
 * The renderer kinds that draw a SITE. Derived membership, so the segment set follows
 * the registry rather than a parallel list.
 *
 * `canvas2d` and `webgpu-three` are the BIM projections — they are what the pane menu
 * is for, and promoting them here would make this bar a rival to that menu instead of
 * a shortcut into it.
 */
const SITE_RENDERER_KINDS: ReadonlySet<RendererKind> = new Set<RendererKind>(['maplibre', 'cesium']);

/**
 * §GLOBE-QUICK-TOGGLE (L-6800..L-6807) — WHICH renderer carries the globe.
 *
 * ⚠ ONE DECLARED FACT, NOT A CENSUS. It is not `'site-3d'`: hard-coding the view type here
 * would be the second-list defect this file's header forbids. It is the RENDERER, because that
 * is the level C60 §6.5 states the fact at — *"the globe and the 3D Site are the same viewer at
 * different camera altitudes"* — so the globe is wherever the one cesium site view is, and the
 * bar follows the registry if that view is ever renamed or replaced.
 */
const GLOBE_RENDERER_KIND: RendererKind = 'cesium';

/** The `▦ 2D Site Map | ◉ 3D Site` glyph family is monochrome geometric (C06 §6.1). `⊕` reads
 *  as a graticuled sphere in that family; the emoji 🌐 `gisActionRegistry` uses for its own
 *  `site.globe` row would be the only colour in the bar. `⤢` is NOT a new mark — it is the
 *  glyph `gisActionRegistry.ts` already declares for `site.zoom-to-site`, which is the exact
 *  action the return click dispatches (C84 EI-8/EI-9 one vocabulary). */
const GLOBE_GLYPH = '⊕';
const RETURN_GLYPH = '⤢';

/** What one segment of the bar is, once the layout has been read. */
export interface SiteViewSegment {
    readonly viewType: ViewType;
    readonly label: string;
    readonly glyph?: string;
    readonly rendererKind: RendererKind;
    /** TRUE ⇒ this view is currently hosted in some pane (the bar highlights it). */
    readonly active: boolean;
    /** TRUE ⇒ it is hosted AND that pane is the only occupied one (already focused). */
    readonly soloed: boolean;
    readonly enabled: boolean;
    /**
     * WHY it is not selectable. Present whenever `enabled` is false — a greyed segment
     * with no reason is the answer C59 Phase 2 already ruled out.
     */
    readonly reason?: string;
    /** The pane a click would put it in (its current pane, an empty one, or LEFT). */
    readonly targetPane: PaneId;
}

/** The `◧ Back to split` affordance, modelled beside the segments rather than inside. */
export interface SiteViewSplitAction {
    readonly label: string;
    readonly enabled: boolean;
    readonly reason?: string;
}

/**
 * §GLOBE-QUICK-TOGGLE (L-6800..L-6807) — where the ONE Cesium camera is framed.
 *
 * TWO VALUES, not three, and deliberately NOT the four C60 stages. This is not the entry
 * flow's `SiteEntryStage`: the editor has no stage machine and must not acquire one (L-6803).
 * It is the ONE bit this control needs — "the last framing I commanded" — so it can say what a
 * click would do next.
 */
export type SiteViewGlobeFraming = 'site' | 'world';

/**
 * ⭐ THE `⊕ 3D Globe` AFFORDANCE — modelled BESIDE the segments, exactly like
 * `SiteViewSplitAction`, and for the same reason: it is an ACTION, not a view.
 *
 * ⛔ IT IS NOT A SEGMENT AND CANNOT BECOME ONE. `segments` is DERIVED from
 * `VIEW_TYPE_REGISTRY`, so a globe segment would require a globe `ViewType` — and
 * **C60 §6.10 forbids exactly that** (*"the entry flow is a STATE of the `site-3d` view, not a
 * new view mechanism… It adds no `ViewType`, no renderer and no pane framework"*), because
 * C60 §6.5 says the globe and the 3D Site **are the same viewer at different camera
 * altitudes**. A rival `site-globe-3d` cesium row is not merely redundant, it is REACHABLY
 * BROKEN: `assignViewToPane` vacates only the SAME view type, so assigning it beside `site-3d`
 * yields `validatePaneLayout → {ok:false, conflicts:[{rendererKind:'cesium',panes:['left','right']}]}`
 * — MEASURED, L-6802 — i.e. in the founder's own default split the globe button would refuse
 * on every click.
 */
export interface SiteViewGlobeAction {
    readonly label: string;
    readonly glyph: string;
    /** The framing a click MOVES TO — never a claim about where the camera *is* (L-6805). */
    readonly moveTo: SiteViewGlobeFraming;
    readonly enabled: boolean;
    /** Present whenever `enabled` is false. C59 §2 disable-or-explain; no bare grey. */
    readonly reason?: string;
    /** Hover copy for the ENABLED state — the disabled state shows `reason` instead. */
    readonly title: string;
    /** The view type carrying the globe (the cesium site view), or null when none is registered. */
    readonly viewType: ViewType | null;
}

export interface SiteViewQuickToggleModel {
    readonly segments: readonly SiteViewSegment[];
    readonly split: SiteViewSplitAction;
    readonly globe: SiteViewGlobeAction;
}

export interface SiteViewQuickToggleInput {
    readonly layout: PaneLayout;
    /** `store.canRestoreSplit()` — whether a previous split is remembered. */
    readonly canRestoreSplit: boolean;
    /**
     * Renderer kinds with a mounter registered in THIS workspace
     * (`MultiPaneController.registeredKinds()`). `null` ⇒ skip the runtime check.
     * This is the runtime half of availability; `descriptor.paneHostable` is the
     * static half — exactly the split `describePaneViewOptions` already draws.
     */
    readonly mountableKinds?: ReadonlySet<RendererKind> | null;
    readonly registry?: Readonly<Record<ViewType, ViewTypeDescriptor>>;
    /**
     * §GLOBE-QUICK-TOGGLE — the framing this control LAST COMMANDED. Defaults to `'site'`.
     *
     * ⚠ IT IS THE CONTROL'S MEMORY OF ITS OWN COMMAND, NOT A CAMERA READING, and that
     * distinction is load-bearing (L-6805). `siteEntryModel.ts`'s header disqualifies camera
     * sniffing outright — *"IT FLAPS… STAGE IS A CAUSE, NOT AN EFFECT"* — so this control never
     * asks the camera where it is. It is the exact analogue of `PaneLayoutStore._splitMemory`,
     * which is what makes `◧ Split` work: a store remembering the intent it issued.
     *
     * The consequence, stated so nobody "fixes" it: if the user grabs the globe and flies
     * somewhere by hand, this value does not move. That is not a lie, because
     * `SiteViewGlobeAction` describes **what the click does**, never where the camera is — and
     * both labels stay useful and true under any hand-flown camera.
     */
    readonly globeFraming?: SiteViewGlobeFraming;
    /**
     * Whether the "back to the site" reframe has a live entry point (production:
     * `window.pryzmZoomToSite`, the ONE declared `site.zoom-to-site` action in
     * `gisActionRegistry.ts`). Defaults to `true`.
     *
     * ⛔ FALSE DISABLES THE OUTBOUND CLICK TOO, and that is the point (L-6804). A control that
     * flies the user to 20,000 km with no way back is the L-942 shape — a branch whose escape
     * hatch was never built. The gate is on the WAY OUT, where refusing is free, not on the way
     * back, where refusing strands.
     */
    readonly canReturnToSite?: boolean;
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
 * ⭐ THE MODEL. Pure: `layout` in, segments out. No store, no DOM, no renderer.
 */
export function describeSiteViewQuickToggle(
    input: SiteViewQuickToggleInput,
): SiteViewQuickToggleModel {
    const registry = input.registry ?? VIEW_TYPE_REGISTRY;
    const { layout } = input;
    const mountable = input.mountableKinds ?? null;
    const occupied = occupiedCount(layout);

    const segments = (Object.keys(registry) as ViewType[])
        .filter((vt) => SITE_RENDERER_KINDS.has(registry[vt]!.rendererKind))
        .map((viewType): SiteViewSegment => {
            const d = registry[viewType]!;
            const hostPane = paneHosting(layout, viewType);
            const active = hostPane !== null;
            const soloed = active && occupied === 1;

            // A click must land somewhere real: the pane it is already in, else a free
            // pane, else the left pane (which the assign intent will simply replace).
            const targetPane = hostPane ?? firstEmptyPane(layout) ?? LEFT_PANE;

            const base = {
                viewType,
                label: d.label,
                glyph: d.glyph,
                rendererKind: d.rendererKind,
                active,
                soloed,
                targetPane,
            } as const;

            // STATIC half — the registry says this view cannot be pane-hosted yet.
            if (!d.paneHostable) {
                return {
                    ...base,
                    enabled: false,
                    reason: d.unavailableReason
                        ?? `${d.label} cannot be hosted in a pane yet.`,
                };
            }
            // RUNTIME half — its renderer has no mounter registered in this workspace.
            if (mountable && !mountable.has(d.rendererKind)) {
                return {
                    ...base,
                    enabled: false,
                    reason:
                        `${d.label} needs the ${d.rendererKind} renderer, which is not `
                        + 'loaded in this workspace.',
                };
            }
            return { ...base, enabled: true };
        });

    return {
        segments,
        split: {
            label: '◧ Split',
            enabled: input.canRestoreSplit && occupied === 1,
            reason: occupied !== 1
                ? 'Already split.'
                : input.canRestoreSplit
                    ? undefined
                    : 'No previous split to restore — choose a view for the other pane.',
        },
        globe: describeGlobeAction(segments, input),
    };
}

/**
 * §GLOBE-QUICK-TOGGLE — the founder's *"add in the top panel buttons 3d globe also"*.
 *
 * DERIVED, like everything else here: the globe rides the ONE cesium site segment, so every
 * refusal the bar already computes for that segment (not pane-hostable / no mounter registered)
 * is INHERITED rather than restated. A second copy of "why can't I open the 3D Site" is a second
 * thing that can disagree.
 */
function describeGlobeAction(
    segments: readonly SiteViewSegment[],
    input: SiteViewQuickToggleInput,
): SiteViewGlobeAction {
    const framing: SiteViewGlobeFraming = input.globeFraming ?? 'site';
    const canReturn = input.canReturnToSite ?? true;
    // Where a click MOVES TO — the opposite of where this control last went.
    const moveTo: SiteViewGlobeFraming = framing === 'world' ? 'site' : 'world';

    const outbound = moveTo === 'world';
    const label = outbound ? `${GLOBE_GLYPH} 3D Globe` : `${RETURN_GLYPH} Back to site`;
    const carrier = segments.find((s) => s.rendererKind === GLOBE_RENDERER_KIND) ?? null;

    const base = {
        label,
        glyph: outbound ? GLOBE_GLYPH : RETURN_GLYPH,
        moveTo,
        viewType: carrier?.viewType ?? null,
    } as const;

    // No cesium site view is registered at all — there is no globe to fly. Unreachable while
    // `site-3d` exists, but a silent empty branch here would be the thing that hides its removal.
    if (!carrier) {
        return {
            ...base,
            enabled: false,
            title: label,
            reason:
                'No 3D Site view is registered, so there is no globe to fly — the globe IS that '
                + 'view at world altitude (C60 §6.5), not a view of its own.',
        };
    }
    // INHERITED refusal — the same reason the `◉ 3D Site` segment is already showing.
    if (!carrier.enabled) {
        return { ...base, enabled: false, title: label, reason: carrier.reason };
    }
    // ⛔ NO ONE-WAY DOOR. See `canReturnToSite` — the gate is on the way OUT.
    if (!canReturn) {
        return {
            ...base,
            enabled: false,
            title: label,
            reason:
                'Reframing on the site is not wired in this workspace, so the globe would have '
                + 'no way back. This control stays off rather than strand you at world altitude.',
        };
    }
    return {
        ...base,
        enabled: true,
        title: outbound
            ? `Zoom ${carrier.label} out to the whole Earth. Your project is not touched — this `
              + 'moves the camera only.'
            : `Bring ${carrier.label} back down to your site.`,
    };
}

/**
 * The intents ONE segment click must dispatch, in order.
 *
 * ⛔ Returned as DATA rather than executed, so the sequencing is unit-testable and so
 * the DOM layer cannot invent a fourth way to move a view. C59 §2 invariant 3: a click
 * never touches a renderer or the `MultiPaneController` — it dispatches `view.pane.*`
 * into the store and repaints from the store's notification.
 *
 * "Show me the 3D globe" means SHOW IT, so the sequence is assign-then-solo:
 *   · not hosted anywhere → assign it to `targetPane`, then solo that pane;
 *   · hosted but sharing the screen → solo its pane (no assign; re-assigning the view
 *     it already holds would be a needless re-mount of a heavyweight singleton);
 *   · already alone on screen → NOTHING. Re-soloing a soloed pane is a no-op that
 *     would still churn the store, and the segment renders as the current one.
 */
export function segmentClickIntents(
    segment: SiteViewSegment,
    layout: PaneLayout,
): readonly SiteViewPaneIntent[] {
    if (!segment.enabled) return [];
    if (segment.soloed) return [];

    const alreadyThere = layout[segment.targetPane] === segment.viewType;
    const assign = {
        type: 'view.pane.assign' as const,
        paneId: segment.targetPane,
        viewType: segment.viewType,
    };
    const solo = { type: 'view.pane.solo' as const, paneId: segment.targetPane };
    return alreadyThere ? [solo] : [assign, solo];
}

/** The pane intents this bar may emit — the `PaneLayoutStore` vocabulary, unextended. */
export type SiteViewPaneIntent =
    | { readonly type: 'view.pane.assign'; readonly paneId: PaneId; readonly viewType: ViewType | null }
    | { readonly type: 'view.pane.solo'; readonly paneId: PaneId };

/**
 * The CAMERA intents. A SEPARATE namespace from `view.pane.*` on purpose: they go to a
 * different port. `PaneLayoutStore` owns which view is in which pane and knows nothing about
 * altitude; the ONE Cesium camera is moved by the camera port (C60 §4), and conflating the two
 * would give the pane store a second job it has no state for.
 *
 * ⚠ DELIBERATELY PAYLOAD-FREE. The world framing is C60's to declare
 * (`siteEntryModel.worldFramingTarget()`), and C60 DEPENDS ON C59 (C60 §7) — so a C59 chrome
 * module importing C60 to fill in a lat/lon/altitude would invert that edge. The model says
 * WHICH framing; the port, which is the C60-aware adapter, says what that framing is.
 */
export type SiteViewCameraIntent =
    /** Fly the ONE Cesium camera to the declared WORLD framing. */
    | { readonly type: 'view.site.frame-globe' }
    /** Reframe it on the site — the declared `site.zoom-to-site` action. */
    | { readonly type: 'view.site.frame-site' };

/**
 * ⭐ The intents ONE `3D Globe` / `Back to site` click must dispatch, in order.
 *
 * Returned as DATA for the same three reasons `segmentClickIntents` is: the sequencing is
 * unit-testable, the DOM layer cannot invent a fourth way to move a view (C59 §2 invariant 3),
 * and a click never touches a renderer.
 *
 * ⭐ THE PANE HALF IS `segmentClickIntents` ITSELF, NOT A COPY OF IT. "Show me the globe" first
 * means "put the 3D Site on screen, alone" — which is *exactly* what clicking `◉ 3D Site`
 * means, and is also exactly what C60's own `siteEntryPaneIntent()` requests (assign + solo,
 * C59 §2 invariant 5: no live BIM pane behind a photoreal globe on the WebGL fallback). By
 * delegating, this inherits that function's no-churn rules for free — no re-assign of a
 * heavyweight singleton into the pane it already occupies, no re-solo of a soloed pane — and
 * the two controls can never disagree about how a view reaches the screen.
 *
 * THEN the camera moves. Order matters: framing a pane that is not mounted yet drops the
 * target (`cesiumSiteEntryCameraPort` logs exactly that), so the camera intent is last.
 */
export function globeClickIntents(
    globe: SiteViewGlobeAction,
    segments: readonly SiteViewSegment[],
    layout: PaneLayout,
): ReadonlyArray<SiteViewPaneIntent | SiteViewCameraIntent> {
    if (!globe.enabled) return [];
    const carrier = segments.find((s) => s.viewType === globe.viewType);
    if (!carrier) return [];
    const camera: SiteViewCameraIntent =
        globe.moveTo === 'world'
            ? { type: 'view.site.frame-globe' }
            : { type: 'view.site.frame-site' };
    return [...segmentClickIntents(carrier, layout), camera];
}
