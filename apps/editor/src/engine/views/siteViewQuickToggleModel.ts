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

export interface SiteViewQuickToggleModel {
    readonly segments: readonly SiteViewSegment[];
    readonly split: SiteViewSplitAction;
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
): ReadonlyArray<
    | { readonly type: 'view.pane.assign'; readonly paneId: PaneId; readonly viewType: ViewType | null }
    | { readonly type: 'view.pane.solo'; readonly paneId: PaneId }
> {
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
