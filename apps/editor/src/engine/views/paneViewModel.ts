// §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59) — PURE core of the native multi-pane
// view system: a renderer-agnostic model of WHICH view is assigned to WHICH pane,
// plus the invariants that keep the heavyweight singleton renderers (one Cesium
// instance, one WebGPU device) safe.
//
// WHY A PURE MODULE (no DOM / no Cesium / no THREE / no I/O): the live pane hosts
// mount real renderers that cannot run headless, so — exactly as with
// `globePlacementDecisions.ts` (L-193) and `siteAuthoringSplit` — we pin the
// DECISION logic (assignment, swap, singleton-conflict validation, mount-target
// resolution) here so the founder-visible behaviour ("swap any view into either
// pane, natively, robust for the long run") is unit-testable WITHOUT a live viewer.
// Pure decisions are P8 span-exempt (see globePlacementDecisions header).
//
// This is Phase 1a of C59 (SPEC-MULTI-PANE-VIEW-SYSTEM). It defines the vocabulary
// (ViewType / RendererKind / PaneId) + the pure layout algebra. The live
// `PaneHost` DOM/renderer wiring (mounting Cesium/MapLibre/WebGPU/Canvas2D into a
// pane element instead of always #container) lands in later phases ON TOP of this
// model — see the phased plan in the SPEC.

// ── Vocabulary ──────────────────────────────────────────────────────────────

/** The rendering backend a view type is drawn with. */
export type RendererKind =
    | 'maplibre'      // 2D site map (SiteBoundaryMap2D)
    | 'cesium'        // 3D Site / globe (CesiumViewport) — heavyweight singleton
    | 'webgpu-three'  // BIM 3D editor (renderer-three) — heavyweight singleton
    | 'canvas2d';     // BIM plan / section projection (SplitViewManager / PlanViewCanvas)

/**
 * A hostable view. Extensible: RCP, schedules, sheets slot in later.
 *
 * §C59 Phase 2 — `bim-elevation-2d` / `bim-section-2d` were added here (contract
 * §1.1 records the extension + why). They are REAL surfaces today — the Canvas2D
 * plan pane renders `viewType: 'plan' | 'section' | 'elevation'` from
 * `viewDefinitionStore` — but they are not yet independently PANE-assignable
 * (choosing one needs a per-pane view-definition id, i.e. Phase 3's per-pane view
 * state). They are therefore registered as NOT pane-hostable WITH A REASON, so the
 * per-pane picker can list them honestly ("all the views") and explain the block,
 * rather than silently omitting them or half-wiring them.
 */
export type ViewType =
    | 'site-map-2d'       // MapLibre parcel draw/select surface
    | 'site-3d'           // Cesium Forma / 3D Site (boundary + buildable envelope)
    | 'bim-3d'            // BIM WebGPU 3D editor
    | 'bim-plan-2d'       // Canvas2D plan projection (the SVP secondary pane's renderer)
    | 'bim-elevation-2d'  // Canvas2D elevation projection (same renderer, different view def)
    | 'bim-section-2d';   // Canvas2D section projection (same renderer, different view def)

/** A pane slot. `left`/`right` today; extensible to `pane-2`, `pane-3`, … for N-up. */
export type PaneId = string;
export const LEFT_PANE: PaneId = 'left';
export const RIGHT_PANE: PaneId = 'right';

export interface ViewTypeDescriptor {
    readonly viewType: ViewType;
    readonly rendererKind: RendererKind;
    /**
     * True when the backing renderer is a heavyweight app-wide singleton (one Cesium
     * viewer / one WebGPU device). A singleton view MUST NOT be mounted into two
     * panes at once (that would require a second GPU device / Cesium instance — the
     * exact double-mount the founder's constraints forbid). Non-singleton views
     * (a Canvas2D projection) can be replicated cheaply.
     */
    readonly singleton: boolean;
    /** Human-readable label for the pane's view-picker. */
    readonly label: string;
    /**
     * §C59 Phase 2 — can this view be hosted in a PANE today?
     *
     * `false` does NOT mean "hidden". A non-hostable view still appears in the
     * per-pane picker, DISABLED and with `unavailableReason` shown, because a greyed
     * option with no explanation is a worse answer than no option at all (C59 §4
     * Phase 2). It flips to `true` when its mounter lands (Phase 3 for the WebGPU BIM
     * 3D re-target and the per-pane view-definition state elevations/sections need).
     */
    readonly paneHostable: boolean;
    /** WHY this view cannot be pane-hosted yet — surfaced verbatim in the picker. */
    readonly unavailableReason?: string;
    /** Short one-glyph mark for compact picker chrome (brand-neutral, no colour). */
    readonly glyph?: string;
    /**
     * §VIEW-PANEL-PER-PANE (founder 2026-09-06) — is this view a ROW on the always-on view
     * panel, as opposed to something you reach through the pane menu?
     *
     * The founder named the panel's contents exactly: *"WE KEEP THE PANEL WITH ALL MAIN
     * OPTIONS TO THE TOP: 2D SITE MAP / 2D SATELLITE / 3D SITE / 3D GLOBE / 3D PRYZM / 2D
     * PRYZM — if the user wants to open more they can do it in the browser."* That is FOUR
     * views (two of them offered under two variants each), not six, and the two he left out
     * — elevation and section — are the two whose own `unavailableReason` already says they
     * are chosen INSIDE the plan pane rather than assigned to a pane. So "promoted" is a
     * registry fact about the view, declared once here.
     *
     * ⛔ THE PANEL DERIVES ITS SET FROM THIS FLAG — it does not carry a second census.
     * `viewPanelOptions.ts` asserts both directions: a promoted view with no panel row
     * fails, and a panel row for a view that is not promoted fails. Promote a view here and
     * it appears; that is the whole edit.
     *
     * `false`/absent does NOT mean hidden — every registry view is still listed, with its
     * reason, in the per-pane picker (`describePaneViewOptions`).
     */
    readonly panelPromoted?: boolean;
}

/** The canonical view-type registry. The live PaneHost consults this to pick a mounter. */
export const VIEW_TYPE_REGISTRY: Readonly<Record<ViewType, ViewTypeDescriptor>> = {
    // ⚠ DECLARATION ORDER IS THE PANEL'S ORDER (`listPaneViewTypes` returns the keys in
    // this order, and `viewPanelOptions()` walks it). It is the founder's own order,
    // 2026-09-06: 2D SITE MAP · 2D SATELLITE · 3D SITE · 3D GLOBE · 3D PRYZM · 2D PRYZM —
    // which is why `bim-3d` now precedes `bim-plan-2d`.
    'site-map-2d': {
        // ⚠ `singleton: true` — §MAP-IS-A-SINGLETON-TOO (L-12992, founder 2026-09-06:
        // *"on the right hand splitted view 3d site worked — but if i clicked 2d map view it
        // would render on the left hand side"*, with the LEFT pane BLACK and its panel reading
        // `2D Site Map` selected).
        //
        // ⛔ THIS FLAG WAS `false` AND THE COMMENT BESIDE IT READ "MapLibre is cheap". Cheapness
        // is not what this flag means. `singleton` asks whether the backing renderer can exist in
        // two panes AT ONCE, and there is exactly ONE `SiteBoundaryMap2D` in this app, reached
        // through exactly ONE mounter (`GISAreaLayout`'s `mapMounter` → `startBoundaryDraw`), whose
        // handle is a single module-scoped `map2dHandle`. So `{left:'site-map-2d',
        // right:'site-map-2d'}` was a layout the pure model called LEGAL and the live host could
        // not realise: the one map went to whichever pane the reconcile reached last and the other
        // pane was left holding a view with no surface — the founder's black pane, exactly.
        //
        // ⭐ Marking it a singleton is not a cost claim; it makes `assignViewToPane` MOVE the map
        // the way it already moves Cesium, which is the behaviour the founder asked for by name:
        // *"the user should be able to customize which view to have in each of the splitted
        // views"*. The MOVE itself is cheap precisely because MapLibre is cheap — and it is a
        // re-parent, not a rebuild (`SiteBoundaryMap2DHandle.reparentTo`).
        //
        // ⚠ THIS COMMENT SAID "(vacating the other pane)" UNTIL §SWAP-NOT-VACATE (2026-09-06).
        // It no longer does: an occupied target SWAPS, so moving the map into the pane that
        // holds the 3D Site hands the 3D Site back to the map's old pane. The map being a
        // singleton is still exactly why it MOVES; what changed is what it leaves behind.
        viewType: 'site-map-2d', rendererKind: 'maplibre', singleton: true,
        label: '2D Site Map', glyph: '▦', paneHostable: true, panelPromoted: true,
    },
    'site-3d': {
        viewType: 'site-3d', rendererKind: 'cesium', singleton: true,
        label: '3D Site', glyph: '◉', paneHostable: true, panelPromoted: true,
    },
    'bim-3d': {
        viewType: 'bim-3d', rendererKind: 'webgpu-three', singleton: true,
        // §VIEW-PANEL-PER-PANE — the founder's word ("3D PRYZM"), replacing "3D Model".
        label: '3D PRYZM', glyph: '◧', paneHostable: false, panelPromoted: true,
        unavailableReason:
            'The PRYZM 3D renderer still owns the whole viewport (#container) and cannot be ' +
            're-targeted into a pane yet — that is C59 Phase 3. It opens FULL SCREEN instead ' +
            '(the panel offers that route), which leaves this split.',
    },
    'bim-plan-2d': {
        // ⚠ `singleton: true` — the SAME correction as `site-map-2d` above, and for the same
        // measured reason rather than by analogy: the `canvas2d` mounter
        // (`createSvpPlanPaneMounter`) drives the ONE `SplitViewManager` and RE-PARENTS its ONE
        // `#svp-secondary-pane` node. A DOM node has one parent, so a layout naming
        // `bim-plan-2d` in both panes is unrealisable in exactly the way the map's was. The old
        // `false` was reasoning about the CANVAS being cheap to draw twice — true, and not what
        // this flag asks. A genuinely replicable plan pane needs per-pane view state (C59
        // Phase 3); until then the honest model is one instance that MOVES.
        viewType: 'bim-plan-2d', rendererKind: 'canvas2d', singleton: true,
        // §VIEW-PANEL-PER-PANE — the founder's word ("2D PRYZM"), replacing "Plan".
        label: '2D PRYZM', glyph: '▤', paneHostable: true, panelPromoted: true,
    },
    'bim-elevation-2d': {
        viewType: 'bim-elevation-2d', rendererKind: 'canvas2d', singleton: false,
        label: 'Elevation', glyph: '◪', paneHostable: false,
        unavailableReason:
            'Elevations render in the 2D PRYZM (plan) pane — pick "2D PRYZM", then choose the elevation in ' +
            'that pane\'s own view selector. A directly assignable elevation pane needs ' +
            'per-pane view state (C59 Phase 3).',
    },
    'bim-section-2d': {
        viewType: 'bim-section-2d', rendererKind: 'canvas2d', singleton: false,
        label: 'Section', glyph: '◫', paneHostable: false,
        unavailableReason:
            'Sections render in the 2D PRYZM (plan) pane — pick "2D PRYZM", then choose the section in that ' +
            'pane\'s own view selector. A directly assignable section pane needs per-pane ' +
            'view state (C59 Phase 3).',
    },
};

/**
 * §C59 Phase 2 — the picker's stable presentation order. Derived from the registry
 * (never a second hardcoded list): registry keys in declaration order, so adding a
 * view type = ONE registry entry and it appears in every pane's picker (invariant 6).
 */
export function listPaneViewTypes(
    registry: Readonly<Record<ViewType, ViewTypeDescriptor>> = VIEW_TYPE_REGISTRY,
): ViewType[] {
    return Object.keys(registry) as ViewType[];
}

/** Which view (if any) each pane currently hosts. `null` = the pane is empty. */
export type PaneLayout = Readonly<Record<PaneId, ViewType | null>>;

// ── Pure layout algebra ─────────────────────────────────────────────────────

function descriptorOf(
    viewType: ViewType,
    registry: Readonly<Record<ViewType, ViewTypeDescriptor>>,
): ViewTypeDescriptor {
    return registry[viewType];
}

/** The panes currently hosting a view backed by `rendererKind`. */
export function panesShowingRenderer(
    layout: PaneLayout,
    rendererKind: RendererKind,
    registry: Readonly<Record<ViewType, ViewTypeDescriptor>> = VIEW_TYPE_REGISTRY,
): PaneId[] {
    return Object.keys(layout).filter((paneId) => {
        const vt = layout[paneId];
        return vt != null && descriptorOf(vt, registry).rendererKind === rendererKind;
    });
}

/**
 * Assign `viewType` to `paneId`, returning a NEW layout (immutable). When the view is a
 * heavyweight singleton already live in ANOTHER pane it cannot be cloned — the one
 * Cesium / WebGPU / MapLibre / Canvas2D instance can only be in one place — so it MOVES.
 * The question this function answers is what the pane it moved OUT OF is left holding:
 *
 *   · the target pane was OCCUPIED  ⇒ **SWAP.** The displaced view goes to the pane the
 *     singleton came from. Both panes end holding something.
 *   · the target pane was EMPTY     ⇒ **MOVE.** There is nothing to hand back, so the
 *     source pane empties — byte-for-byte the pre-2026-09-06 behaviour.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════
 * ⛔ §SWAP-NOT-VACATE (L-12999 clause 4, founder ruling · STR §26.1.1 · C57 §1.5)
 * ═════════════════════════════════════════════════════════════════════════════════════
 * THIS FUNCTION USED TO WRITE `null` INTO THE SOURCE PANE UNCONDITIONALLY, and that one
 * line is the last unmet clause of the founder's 2026-09-06 ruling on the two Cesium
 * views. Measured through the real click path (`segmentClickIntents` → here) from his own
 * default split `{left:'site-map-2d', right:'site-3d'}`, pressing **3D Globe in the LEFT
 * pane** produced `{left:'site-3d', right:null}` — the right pane vacated, its surface
 * unmounted, its view panel collapsed with it.
 *
 * ⭐ AND THE DEAD END WAS WORSE THAN THE BLANK. `SiteAuthoringPaneShell.applyFraction`
 * collapses a pane that is alone-empty, and the per-pane view panel is mounted INSIDE the
 * pane element — so the vacated pane took its own picker off screen with it. The only
 * remaining route back to a split is the surviving panel's `◧ Split`, which is gated on
 * `canRestoreSplit`, and `view.pane.assign` deliberately nulls the split memory. So the
 * refusal's "yes" branch was unreachable: exactly [[refusing-half-needs-its-escape-hatch]]
 * / L-942, *"a gate whose yes branch is unreachable is a regression with a citation
 * attached"*.
 *
 * ⭐ THE FIX SHAPE IS THE FOUNDER'S OWN SENTENCE, not an invention of this lane. STR
 * §26.1.1 names the resolution verbatim: *"offers the action that resolves it (swap the
 * panes, or move 3D here and put 2D there)"*. A swap IS that action, applied by the model
 * instead of demanded of the user.
 *
 * ⛔ WHY THIS IS UNIVERSAL AND NOT A CESIUM SPECIAL CASE — decided deliberately, recorded
 * so it is not narrowed later by someone who thinks the ruling was about Cesium:
 *   1. `singleton` is a fact about the RENDERER ("one instance, one place"). It justifies
 *      MOVING the view. It says nothing whatever about what the source pane should show
 *      afterwards, so the vacate was an extra consequence with no argument behind it.
 *   2. The blank panes the founder actually photographed were NOT Cesium. L-12992 is the
 *      MapLibre 2D map; L-12988 is the plan. A Cesium-only rule would close his instance
 *      and leave the class open — [[committed-is-not-reachable]].
 *   3. A per-renderer exception would be a SECOND CENSUS beside
 *      `ViewTypeDescriptor.singleton` (C01 §6 rule 6: censuses rot). `validatePaneLayout`
 *      two hundred lines below was corrected for exactly that defect on 2026-09-06.
 *   4. No pane in this model carries a capability the others lack, so a view that is legal
 *      in the target pane is legal in the source pane. There is no constructible case in
 *      which leaving a pane EMPTY beats handing it the displaced view.
 *
 * ⚠ WHAT IS NOT CHANGED, because these are INTENTIONAL emptyings rather than side effects:
 * `assignViewToPane(layout, pane, null)` (the user asked to empty that pane) and
 * `view.pane.solo` (the user asked for full screen, and the split is remembered so the way
 * back exists). Only the *involuntary* vacate — the one nobody asked for — is gone.
 *
 * ⭐ INVARIANT ESTABLISHED: an assign naming a non-null `viewType` never REDUCES the number
 * of panes holding a view. `paneOccupancy()` below is that property, named, and
 * `PaneViewModel.test.ts` asserts it across every (layout × pane × view) triple in the
 * registry rather than on the founder's one path.
 */
export function assignViewToPane(
    layout: PaneLayout,
    paneId: PaneId,
    viewType: ViewType | null,
    registry: Readonly<Record<ViewType, ViewTypeDescriptor>> = VIEW_TYPE_REGISTRY,
): PaneLayout {
    // What the target pane is giving up. `null` when it was empty — which is precisely
    // what makes the empty-target case degrade to the old vacate with no branch of its own.
    const displaced = layout[paneId] ?? null;
    const next: Record<PaneId, ViewType | null> = { ...layout, [paneId]: viewType };
    if (viewType != null && descriptorOf(viewType, registry).singleton) {
        // ⚠ `handedBack` matters only for a MALFORMED input layout that already holds the
        // singleton in two panes (`validatePaneLayout` calls that a conflict and the store
        // refuses it before it can reach here). Handing `displaced` to the first such pane
        // and `null` to the rest keeps this total and deterministic rather than minting a
        // duplicate of `displaced` while "fixing" a duplicate of `viewType`.
        let handedBack = false;
        for (const otherPane of Object.keys(next)) {
            if (otherPane === paneId || next[otherPane] !== viewType) continue;
            next[otherPane] = handedBack ? null : displaced;
            handedBack = true;
        }
    }
    return next;
}

/** How many panes currently hold a view. The quantity §SWAP-NOT-VACATE protects. */
export function paneOccupancy(layout: PaneLayout): number {
    return Object.keys(layout).filter((paneId) => layout[paneId] != null).length;
}

/**
 * §SWAP-NOT-VACATE — the panes that would be left holding NOTHING by `next`.
 *
 * ⛔ THE POINT IS THAT "EMPTY" IS NOT AUTOMATICALLY A DEFECT. `solo` empties every other
 * pane on purpose and the shell collapses them; an explicit `assign(pane, null)` is the
 * user asking. What C57 §1.5 forbids is a failure DRESSED AS AN EMPTY — a pane nobody
 * asked to empty, holding nothing, saying nothing. So this reports the SET, and the
 * callers that care (the tests, and the shell's honest-empty placeholder) decide.
 */
export function emptyPanes(layout: PaneLayout): PaneId[] {
    return Object.keys(layout).filter((paneId) => layout[paneId] == null);
}

/** Swap the views hosted by two panes, returning a NEW layout (immutable). */
export function swapPanes(layout: PaneLayout, a: PaneId, b: PaneId): PaneLayout {
    return { ...layout, [a]: layout[b] ?? null, [b]: layout[a] ?? null };
}

export interface LayoutConflict {
    readonly rendererKind: RendererKind;
    readonly panes: PaneId[];
}

/**
 * Validate that no heavyweight singleton renderer is claimed by more than one pane.
 * A well-formed layout never has two panes both showing `cesium` (or both `webgpu-three`).
 * `assignViewToPane` maintains this invariant; `validatePaneLayout` is the guard the
 * live PaneHost asserts before it (re)mounts, and the property the tests pin.
 */
export function validatePaneLayout(
    layout: PaneLayout,
    registry: Readonly<Record<ViewType, ViewTypeDescriptor>> = VIEW_TYPE_REGISTRY,
): { ok: boolean; conflicts: LayoutConflict[] } {
    const conflicts: LayoutConflict[] = [];
    // ⛔ §MAP-IS-A-SINGLETON-TOO (L-12992) — THIS LINE USED TO BE
    //     const singletonKinds: RendererKind[] = ['cesium', 'webgpu-three'];
    // a HAND-WRITTEN SECOND CENSUS of a fact the registry two hundred lines above already
    // declares per view (`ViewTypeDescriptor.singleton`). The two disagreed, silently and in
    // the dangerous direction: the registry could say a renderer was a singleton and this
    // guard would still wave a double-mount through, because the kind was not in the literal.
    // C01 §6 rule 6 — censuses rot; derive it.
    const singletonKinds = new Set<RendererKind>();
    for (const viewType of listPaneViewTypes(registry)) {
        const d = registry[viewType];
        if (d?.singleton) singletonKinds.add(d.rendererKind);
    }
    for (const kind of singletonKinds) {
        const panes = panesShowingRenderer(layout, kind, registry);
        if (panes.length > 1) conflicts.push({ rendererKind: kind, panes });
    }
    return { ok: conflicts.length === 0, conflicts };
}

/**
 * Resolve the DOM element a view should mount into. In the multi-pane world a view
 * mounts into its assigned PANE element, NOT the shared `#container`. This is the
 * seam that fixes the three founder-found incompatibilities (SVP owns the right pane
 * via a fixed element; Cesium hard-targets `#container`; MapLibre is a `#container`
 * overlay): every renderer is handed a pane element to mount into.
 *
 * Returns the pane hosting `viewType`, or `null` when it is not currently assigned.
 */
export function resolveHostPane(layout: PaneLayout, viewType: ViewType): PaneId | null {
    for (const paneId of Object.keys(layout)) {
        if (layout[paneId] === viewType) return paneId;
    }
    return null;
}

/** An empty two-pane (left/right) layout — the starting point for site authoring. */
export const EMPTY_LR_LAYOUT: PaneLayout = { [LEFT_PANE]: null, [RIGHT_PANE]: null };

/**
 * §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59 Phase 1b) — the canonical site-authoring
 * default layout: **LEFT = 2D site map (draw/select) · RIGHT = live 3D Site
 * (boundary + buildable envelope)**. Derived through the pure `assignViewToPane`
 * algebra (NOT a hard-coded toggle), so the founder default is unit-testable and
 * provably conflict-free (`validatePaneLayout(...).ok === true`). This is the layout
 * the live `MultiPaneController` applies when the user enters the site step; the
 * user can subsequently swap the 3D Site into the LEFT pane and the singleton MOVES
 * (never clones — see `assignViewToPane`).
 */
export function siteAuthoringDefaultLayout(
    registry: Readonly<Record<ViewType, ViewTypeDescriptor>> = VIEW_TYPE_REGISTRY,
): PaneLayout {
    let layout = assignViewToPane(EMPTY_LR_LAYOUT, LEFT_PANE, 'site-map-2d', registry);
    layout = assignViewToPane(layout, RIGHT_PANE, 'site-3d', registry);
    return layout;
}

/**
 * §PANE-DEFAULT-IS-PLAN-LEFT (L-12988, founder 2026-09-06) — the PARCEL LAW / authoring
 * default layout: **LEFT = the plan (2D PRYZM) · RIGHT = the live 3D Site**.
 *
 * ⭐ WHY A SECOND DEFAULT AND NOT A CHANGED ONE. `siteAuthoringDefaultLayout()` above is the
 * ONBOARDING default, and its 2D-map-left is load-bearing there: that map is the surface the
 * guided flow makes the user DRAW their plot on (§ONBOARDING-STEP-PINS-ITS-SURFACE pins it for
 * exactly that reason). Re-pointing it at the plan would break the draw step to fix a different
 * screen. The founder's sentence — *"it should initially the plan view to the left and 3d site
 * to right"* — is about the tab he was on, which is a host that opens on an ALREADY-drawn plot.
 * Two hosts, two openings, one algebra.
 *
 * Derived through `assignViewToPane` like its sibling, so it is provably conflict-free
 * (`validatePaneLayout(...).ok === true`) rather than a hand-written pair. The user can then
 * put anything in either pane — both views here are singletons, so a re-assignment MOVES the
 * one surface and SWAPS the displaced view back into the pane it came from (§SWAP-NOT-VACATE;
 * this line read "vacates the pane it came from" until 2026-09-06).
 */
export function parcelLawDefaultLayout(
    registry: Readonly<Record<ViewType, ViewTypeDescriptor>> = VIEW_TYPE_REGISTRY,
): PaneLayout {
    let layout = assignViewToPane(EMPTY_LR_LAYOUT, LEFT_PANE, 'bim-plan-2d', registry);
    layout = assignViewToPane(layout, RIGHT_PANE, 'site-3d', registry);
    return layout;
}

/**
 * The DECLARED openings a pane-shell host may ask for by name. A string rather than a
 * `PaneLayout` because it crosses the `window` boundary (`pryzmMountSiteAuthoringPanes`), and a
 * layout object shipped through a global is a second place for a default to live.
 */
export type PaneLayoutPreset = 'site-authoring' | 'parcel-law';

// ─────────────────────────────────────────────────────────────────────────────
// §SINGLE-VIEW-IS-A-LAYOUT-FACT (L-13053) — "single view" is a LAYOUT, not a teardown
// ─────────────────────────────────────────────────────────────────────────────
//
// Founder 2026-09-07: *"WHEN HAVING ANALYSIS — PARCEL LAW ACTIVE — THEN IT IS ON SPLIT ON —
// WORKS WELL. BUT IF WE GO TO SINGLE VIEW, SOMEHOW IT GETS A WHITE SCREEN."*
//
// ⛔ THE MEASURED ROOT WAS NOT A RACE AND NOT A PLACEMENT BUG. "Single view" was wired to
// `pryzmUnmountSiteAuthoringPanes()` — it DISPOSED the whole pane shell. Its teardown
// disposes the MapLibre map and re-homes the ONE Cesium viewer to `#container` with
// `setVisible(false)`, so in the Analysis workspace (`canvas:'half'`) the left region was
// left holding an empty BIM canvas: the founder's white screen, and the reason the retired
// whole-screen six-segment bar came back in the same gesture (it re-appears exactly when the
// shell root is gone).
//
// C59 §1.4 already states the rule: *"`view.pane.solo` vacates the other pane(s); the shell
// then collapses the empty pane and the divider so the SURVIVOR fills the shell — carrying
// its picker with it. That is how 'in each view, split OR complete, change to another view'
// holds without a second switcher."* These two helpers are that sentence, made computable.

/** What a pane shell is showing, stated as a fact about the LAYOUT, never about the DOM. */
export type SitePaneMode = 'absent' | 'single' | 'split';

/**
 * Is `layout` a SOLO (full-screen) layout — exactly one pane occupied in a shell that has
 * more than one pane?
 *
 * ⭐ THIS IS THE SHELL'S OWN RULE, LIFTED SO THERE IS ONE COPY. `SiteAuthoringPaneShell`'s
 * `applyFraction()` collapses the vacated pane and the divider on `leftEmpty !== rightEmpty`,
 * which for its two panes is exactly this predicate. The mode a control REPORTS and the
 * geometry the shell APPLIES must not be two independent readings of the same thing.
 */
export function isSoloLayout(layout: PaneLayout): boolean {
    const paneIds = Object.keys(layout);
    if (paneIds.length < 2) return false;
    let occupied = 0;
    for (const paneId of paneIds) if (layout[paneId] != null) occupied++;
    return occupied === 1;
}

/**
 * The mode a LIVE shell showing `layout` is in. `'absent'` is not derivable from a layout —
 * it is the caller's reading of whether a shell exists at all — so this returns only the two
 * a live shell can be in.
 */
export function describeSitePaneMode(layout: PaneLayout): Exclude<SitePaneMode, 'absent'> {
    return isSoloLayout(layout) ? 'single' : 'split';
}

/** Where a "go to single view" lands: which pane survives, and what it must be handed first. */
export interface SingleViewTarget {
    /** The pane that will be soloed. */
    readonly paneId: PaneId;
    /**
     * The view to ASSIGN into `paneId` before soloing it, or `null` when that pane already
     * holds the preferred view and the solo alone is the whole move.
     */
    readonly assign: ViewType | null;
}

/**
 * §26.6 / L-13053 requirement 3 — founder: *"AND BY DEFAULT RENDER 2D PLAN VIEW ON THIS
 * ENVIRONMENT."* Decide which pane survives a "go to single view" in an environment whose
 * declared single view is `preferred`.
 *
 * ⭐ PREFER THE PANE THAT ALREADY HOLDS IT. Then the move is one `view.pane.solo` and the
 * user's own arrangement is respected — "by default" means the default when he has not said
 * otherwise, not an override of what he chose. Only when NO pane holds the preferred view is
 * it assigned, into the first pane, and the assignment happens BEFORE the solo so the solo's
 * remembered split (`_splitMemory`) is a real two-pane layout and `◧ Back to split` still has
 * somewhere to go.
 *
 * Returns `null` for a shell with no panes at all — there is nothing to solo, and inventing a
 * pane id here would be a decision this model cannot make.
 */
export function describeSingleViewTarget(
    layout: PaneLayout,
    preferred: ViewType,
): SingleViewTarget | null {
    const paneIds = Object.keys(layout);
    if (paneIds.length === 0) return null;
    for (const paneId of paneIds) {
        if (layout[paneId] === preferred) return { paneId, assign: null };
    }
    return { paneId: paneIds[0]!, assign: preferred };
}

/** Resolve a declared preset to its layout. Unknown presets fall back to site authoring. */
export function paneLayoutForPreset(
    preset: PaneLayoutPreset | undefined,
    registry: Readonly<Record<ViewType, ViewTypeDescriptor>> = VIEW_TYPE_REGISTRY,
): PaneLayout {
    return preset === 'parcel-law'
        ? parcelLawDefaultLayout(registry)
        : siteAuthoringDefaultLayout(registry);
}

/**
 * §SINGLE-VIEW-IS-A-LAYOUT-FACT (L-13053) — the view a preset's SINGLE (full-screen) state
 * shows by default.
 *
 * Founder 2026-09-07, about the Analysis · Parcel Law screen: *"AND BY DEFAULT RENDER 2D PLAN
 * VIEW ON THIS ENVIRONMENT."* `bim-plan-2d` is `paneHostable: true` above with a registered
 * mounter (`createSvpPlanPaneMounter`), so this is a DEFAULT, not new plumbing.
 *
 * ⛔ IT IS PER-PRESET, exactly as `paneLayoutForPreset` is, and for the same reason: the
 * onboarding host opens on a plot that does not exist yet, where the useful single view is the
 * 2D map the guided flow makes you draw on — the plan of an unbuilt building is a blank sheet.
 * *"This environment"* is the Parcel Law tab, not every single-view state.
 */
export function singleViewForPreset(preset: PaneLayoutPreset | undefined): ViewType {
    return preset === 'parcel-law' ? 'bim-plan-2d' : 'site-map-2d';
}
