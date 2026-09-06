// §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59 Phase 1b) — the DOM geometry for the
// site-authoring split: a LEFT pane + a draggable divider + a RIGHT pane, tiled
// inside a host element (default `#container`). This is the renderer-agnostic pane
// GEOMETRY the founder default layout (2D map LEFT · 3D Site RIGHT) lives in.
//
// The geometry (ratio + draggable divider + resize fan-out) MIRRORS the proven
// `SplitViewManager` split (`_buildDOM` / `_positionDivider` / `_onDividerMove`,
// SplitViewManager.ts:350–516) — but SplitViewManager's pane is hard-wired to a
// Canvas2D plan surface, so it cannot host Cesium/MapLibre. Rather than destabilise
// that legacy owner (its consolidation is C59 Phase 4), Phase 1b builds this minimal
// self-contained shell that hosts ARBITRARY renderers via the `PaneHost` abstraction.
// The panes TILE (no overlap, C59 §1.3): each renderer surface is a positioned child
// that fills its pane. No `requestAnimationFrame` here (P3) — divider drag only
// re-sizes; the renderers reflow via their `PaneHost.resize()`.

import { EMPTY_LR_LAYOUT, LEFT_PANE, RIGHT_PANE, type PaneId } from './paneViewModel';
import { PaneHost, MultiPaneController } from './PaneHost';
import { PaneLayoutStore } from './paneLayoutStore';
import { mountPaneViewPicker, type PaneViewPickerHandle } from './PaneViewPicker';
// §SITE-VIEW-QUICK-TOGGLE (L-5110) — the founder's top-centre 3D globe / 3D site
// control. It is SHELL chrome (fixed, budgeted on the canvas region), not pane chrome,
// which is why it mounts beside the panes rather than inside one. It shares the SAME
// store as the pickers below — there is no second write path.
import {
    mountSiteViewQuickToggle,
    type SiteViewCameraPorts,
    type SiteViewQuickToggleHandle,
} from './SiteViewQuickToggle';
// §GLOBE-QUICK-TOGGLE (L-6800..L-6807, C60 §6.5) — the DECLARED world framing. Imported here,
// in the COMPOSITION layer, and not by the bar's own model: C60 depends on C59 (C60 §7), so a
// C59 chrome module reaching into C60 for a lat/lon would invert that edge. The bar names the
// framing (`view.site.frame-globe`); this file is where "the globe framing" has a value.
import { worldFramingTarget } from './siteEntryModel';

/** The shell handle: pane elements, the store (the ONE write path), and disposal. */
export interface SiteAuthoringPaneShell {
    readonly root: HTMLElement;
    readonly controller: MultiPaneController;
    /**
     * §C59 Phase 2 — the view-state store. EVERY layout change (including a caller
     * applying a model-derived default) must go through `store.dispatch(...)`, not
     * `controller.applyLayout(...)`: the controller is the imperative shell the store
     * drives, and a caller that writes to it directly leaves the store — and therefore
     * every pane picker — stale (C59 §2 invariant 3).
     */
    readonly store: PaneLayoutStore;
    /** The pane element for `left` / `right` (for pane-scoped chrome, e.g. the facts card). */
    getPaneElement(paneId: PaneId): HTMLElement | null;
    /** Tear the shell down (removes the DOM + listeners). Idempotent. */
    dispose(): void;
    /** True once disposed. */
    readonly isDisposed: boolean;
}

export interface SiteAuthoringPaneShellOptions {
    /** Where to mount the split (defaults to `#container`). */
    parent?: HTMLElement;
    /** Initial LEFT-pane fraction of the width (0.2–0.8). Defaults to 0.5. */
    initialLeftFraction?: number;
    /** z-index for the shell root (defaults to just under Cesium's CESIUM_Z=15). */
    zIndex?: number;
    /** Called on every divider drag / resize so the controller can reflow renderers. */
    onResize?: () => void;
    /**
     * §C59 Phase 2 — mount the per-pane view picker on every pane (default true).
     * Off only for tests that want bare geometry.
     */
    viewPicker?: boolean;
    /**
     * §GLOBE-QUICK-TOGGLE (L-6800..L-6807) — the camera ports the top-centre `⊕ 3D Globe`
     * action dispatches into. Defaults to `defaultSiteViewCameraPorts()` (the declared typed
     * globals). Tests pass recorders.
     */
    camera?: SiteViewCameraPorts;
}

/**
 * §GLOBE-QUICK-TOGGLE (L-6800..L-6807) — resolve the two camera ports from the DECLARED typed
 * globals `GISAreaLayout` already registers. This is the whole production wiring.
 *
 * ⚠ TYPED GLOBALS, NOT `window as any` (P4). Both are declared in `src/types/globals.d.ts`;
 * this is the same idiom `OnboardingStepController` uses to reach the identical camera host for
 * `GlobeHeroSearch`. It lives in this composition file rather than in the bar so the bar stays
 * headless-testable and so there is exactly one place that knows how the globe is reached.
 *
 * ⭐ NEITHER PORT IS NEW MACHINERY.
 *   · `frameGlobe` → `CesiumViewport.flyToGeographic(worldFramingTarget())` — the SAME primitive
 *     and the SAME declared framing the onboarding globe already flies on this founder's WebGL
 *     box on every project start (`SiteEntryStore.frameCurrent()`), so its behaviour there is
 *     established rather than assumed.
 *   · `frameSite` → `window.pryzmZoomToSite`, the ONE declared `site.zoom-to-site` action in
 *     `gisActionRegistry.ts`, whose whole reason for existing is that the ACTIVE SURFACE decides
 *     the target. Re-deriving a "fly back to the site" target here would be a third copy of the
 *     thing that registry exists to de-duplicate.
 *
 * `canFrameSite` reports whether that entry point is registered AT ALL — the
 * `entryPoints: []` doctrine from the same registry: *"a dead button that looked alive is its
 * own bug"*. When it is missing the bar refuses the OUTBOUND click, so the user is never flown
 * somewhere the return trip cannot be made from.
 */
export function defaultSiteViewCameraPorts(): SiteViewCameraPorts {
    return {
        frameGlobe: () => {
            const host = window.pryzmGetSiteEntryCameraHost?.() ?? null;
            if (!host) {
                console.warn('[site-view-toggle] no globe mounted — world framing dropped.');
                return;
            }
            host.flyToGeographic(worldFramingTarget());
        },
        frameSite: () => {
            window.pryzmZoomToSite?.();
        },
        canFrameSite: () => typeof window.pryzmZoomToSite === 'function',
    };
}

const MIN_FRACTION = 0.2;
const MAX_FRACTION = 0.8;

/**
 * §SEAM-HAIRLINE-WHITE (L-12966, founder 2026-09-06, Córdoba: "the line between 2d and 3d should be
 * a super thin line white — not this one that we have now").
 *
 * WHAT IT WAS: a 6 px track filled with `linear-gradient(180deg,#2a2340,#6600FF)` — the PRYZM brand
 * purple used as furniture. It competed with the two maps it separates AND with the parcel
 * highlight, which is the one thing #6600FF is reserved for (§PREVIEW-COLOR-UNIFIED-PURPLE).
 *
 * WHAT IT IS: a 1 px WHITE hairline. The visible line is the flex track itself; the DRAG TARGET is a
 * transparent child that overhangs it by `DIVIDER_HIT_OVERHANG_PX` on each side, so the pointer
 * still has a 13 px band to grab. Shrinking the track to 1 px WITHOUT that overlay would have made
 * the seam thin by making the handle unusable — the founder asked for a thinner LINE, not a
 * harder-to-drag divider.
 *
 * `.svp-divider` (SplitViewManager's own body-level divider, styled in `ui/styles/panels/splitView.ts`)
 * needed no change: it is already `background: transparent`, and `svpPlanPaneMounter` hides it
 * outright inside this shell — this element is the ONLY seam the founder can be seeing.
 */
const DIVIDER_WIDTH_PX = 1;
const DIVIDER_COLOUR = '#FFFFFF';
/** Transparent grab margin either side of the hairline (total pointer target = 1 + 2×6 = 13 px). */
const DIVIDER_HIT_OVERHANG_PX = 6;

/**
 * Build the two-pane site-authoring shell. Returns the pane elements wrapped in a
 * `MultiPaneController` (with `left` + `right` `PaneHost`s) — the caller registers
 * the renderer mounters and applies the founder default layout via the pure model
 * (`siteAuthoringDefaultLayout()`).
 */
export function mountSiteAuthoringPaneShell(
    opts: SiteAuthoringPaneShellOptions = {},
): SiteAuthoringPaneShell {
    const parent = opts.parent ?? document.getElementById('container') ?? document.body;
    const zIndex = opts.zIndex ?? 14; // below Cesium's own container z (15) — it fills its pane.
    let leftFraction = clampFraction(opts.initialLeftFraction ?? 0.5);

    // ── Root (tiles the parent viewport) ────────────────────────────────────────
    const root = document.createElement('div');
    root.id = 'pryzm-site-authoring-panes';
    root.setAttribute('data-testid', 'site-authoring-panes');
    Object.assign(root.style, {
        position: 'absolute',
        inset: '0',
        display: 'flex',
        flexDirection: 'row',
        zIndex: String(zIndex),
        background: '#0b0b12',
    } satisfies Partial<CSSStyleDeclaration>);

    // Ensure the parent is a positioning context so `inset:0` fills it.
    if (parent instanceof HTMLElement && !parent.style.position) {
        parent.style.position = 'relative';
    }

    const leftPaneEl = document.createElement('div');
    leftPaneEl.id = 'pryzm-pane-left';
    leftPaneEl.setAttribute('data-pane', LEFT_PANE);
    Object.assign(leftPaneEl.style, {
        position: 'relative',
        overflow: 'hidden',
        flex: `0 0 ${(leftFraction * 100).toFixed(3)}%`,
        minWidth: '0',
        height: '100%',
    } satisfies Partial<CSSStyleDeclaration>);

    // §SEAM-HAIRLINE-WHITE (L-12966) — see the constants above for the founder quote and the reason
    // the visible line and the hit area are two elements.
    const divider = document.createElement('div');
    divider.id = 'pryzm-pane-divider';
    divider.setAttribute('data-testid', 'pane-divider');
    Object.assign(divider.style, {
        position: 'relative',
        flex: `0 0 ${DIVIDER_WIDTH_PX}px`,
        cursor: 'col-resize',
        background: DIVIDER_COLOUR,
        zIndex: '2',
        userSelect: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    // The grab band. A CHILD of the divider, so the single `mousedown` listener on `divider` still
    // receives the press by bubbling — no second listener, no second drag path to keep in sync.
    // It overhangs both panes by `DIVIDER_HIT_OVERHANG_PX`; the divider's `zIndex: 2` keeps it above
    // the pane surfaces, and it is fully transparent, so nothing is drawn over either map.
    const dividerHit = document.createElement('div');
    dividerHit.setAttribute('data-testid', 'pane-divider-hit');
    Object.assign(dividerHit.style, {
        position: 'absolute',
        top: '0',
        bottom: '0',
        left: `-${DIVIDER_HIT_OVERHANG_PX}px`,
        right: `-${DIVIDER_HIT_OVERHANG_PX}px`,
        cursor: 'col-resize',
        background: 'transparent',
    } satisfies Partial<CSSStyleDeclaration>);
    divider.appendChild(dividerHit);

    const rightPaneEl = document.createElement('div');
    rightPaneEl.id = 'pryzm-pane-right';
    rightPaneEl.setAttribute('data-pane', RIGHT_PANE);
    Object.assign(rightPaneEl.style, {
        position: 'relative',
        overflow: 'hidden',
        flex: '1 1 0',
        minWidth: '0',
        height: '100%',
    } satisfies Partial<CSSStyleDeclaration>);

    root.appendChild(leftPaneEl);
    root.appendChild(divider);
    root.appendChild(rightPaneEl);
    parent.appendChild(root);

    const leftHost = new PaneHost(LEFT_PANE, leftPaneEl);
    const rightHost = new PaneHost(RIGHT_PANE, rightPaneEl);
    const controller = new MultiPaneController([leftHost, rightHost]);

    // ── §C59 Phase 2 — the view-state store (the ONE write path) + per-pane pickers ──
    // The store owns the layout and drives the controller; the pickers only dispatch
    // intents into it (C59 §2 invariant 3). The shell itself never assigns a view.
    const store = new PaneLayoutStore(EMPTY_LR_LAYOUT, { applier: controller });

    // ── Divider drag (mirrors SplitViewManager._onDividerMove) ──────────────────
    let dragging = false;
    const applyFraction = (): void => {
        // §C59 Phase 2 — FULL SCREEN is a LAYOUT fact, not a second mechanism: when
        // exactly one pane holds a view (the `solo` / "empty this pane" intents), the
        // vacated pane and the divider collapse and the surviving pane fills the shell —
        // carrying its picker with it, which is how the founder's "in each view, split
        // OR complete, change to another view" holds in full screen too.
        const layout = store.getLayout();
        const leftEmpty = layout[LEFT_PANE] == null;
        const rightEmpty = layout[RIGHT_PANE] == null;
        const solo = leftEmpty !== rightEmpty; // exactly one occupied → full screen.

        divider.style.display = solo ? 'none' : '';
        if (solo && leftEmpty) {
            leftPaneEl.style.display = 'none';
            rightPaneEl.style.display = '';
            rightPaneEl.style.flex = '1 1 0';
        } else if (solo && rightEmpty) {
            rightPaneEl.style.display = 'none';
            leftPaneEl.style.display = '';
            leftPaneEl.style.flex = '1 1 100%';
        } else {
            leftPaneEl.style.display = '';
            rightPaneEl.style.display = '';
            rightPaneEl.style.flex = '1 1 0';
            leftPaneEl.style.flex = `0 0 ${(leftFraction * 100).toFixed(3)}%`;
        }
    };
    const onDown = (e: MouseEvent): void => {
        dragging = true;
        e.preventDefault();
        document.body.style.userSelect = 'none';
    };
    const onMove = (e: MouseEvent): void => {
        if (!dragging) return;
        const rect = root.getBoundingClientRect();
        if (rect.width <= 0) return;
        leftFraction = clampFraction((e.clientX - rect.left) / rect.width);
        applyFraction();
        // Reflow the hosted renderers to the new pane sizes (no re-fly — C59 §3.4).
        controller.resize();
        opts.onResize?.();
    };
    const onUp = (): void => {
        if (!dragging) return;
        dragging = false;
        document.body.style.userSelect = '';
        controller.resize();
        opts.onResize?.();
    };
    divider.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    // ── Window resize → reflow both renderers ────────────────────────────────────
    const onWindowResize = (): void => {
        controller.resize();
        opts.onResize?.();
    };
    window.addEventListener('resize', onWindowResize);

    // ── Layout changes → re-tile (split ⇄ full screen) + reflow the renderers ────
    // The store notifies AFTER the controller has mounted/unmounted, so the renderer
    // that just moved is reflowed to the box it actually ended up in. No rAF (P3): a
    // flex change is synchronous and each mounter's `resize()` is its own reflow
    // primitive (Cesium's one-shot settle lives inside `reflowContainer()`).
    const unsubscribeLayout = store.subscribe(() => {
        applyFraction();
        controller.resize();
        opts.onResize?.();
    });

    // ── §C59 Phase 2 — the per-pane view picker, on EVERY pane ──────────────────
    // ONE component, mounted per pane, content derived from VIEW_TYPE_REGISTRY. This is
    // the standardised switcher the founder asked for; it replaces per-surface bespoke
    // toggles for pane views (C59 §4 Phase 2, absorbing L-405).
    const pickers: PaneViewPickerHandle[] = [];
    if (opts.viewPicker !== false) {
        pickers.push(
            mountPaneViewPicker({ paneId: LEFT_PANE, paneEl: leftPaneEl, store, corner: 'top-left' }),
            mountPaneViewPicker({ paneId: RIGHT_PANE, paneEl: rightPaneEl, store, corner: 'top-right' }),
        );
    }

    // ── §SITE-VIEW-QUICK-TOGGLE (L-5110..L-5117) — the top-centre shortcut ──────
    //
    // Founder: "we don't really need this 3D Site button on the top-right corner
    // (almost hidden) … a button 3D globe / 3D site in the middle top would be
    // beneficial."
    //
    // ⛔ It is mounted IN ADDITION to the pickers above, never instead of them. Four
    // of the pane menu's six entries are disabled WITH REASONS (C59 Phase 2's
    // disable-or-explain rule) and those refusals are real information about Phase 3
    // work; a shortcut bar is not a licence to delete them.
    //
    // It reads and writes the SAME `store`, so a change made from either surface
    // repaints the other — the two cannot disagree about which view is where.
    //
    // Gated on the same `viewPicker` flag: a test asking for bare geometry wants no
    // chrome at all, and splitting the flag would let one arrive without the other.
    const quickToggle: SiteViewQuickToggleHandle | null =
        opts.viewPicker !== false
            ? mountSiteViewQuickToggle({
                store,
                mountableKinds: () => controller.registeredKinds?.() ?? null,
                camera: opts.camera ?? defaultSiteViewCameraPorts(),
            })
            : null;

    let disposed = false;
    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        divider.removeEventListener('mousedown', onDown);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        window.removeEventListener('resize', onWindowResize);
        unsubscribeLayout();
        for (const p of pickers) {
            try { p.dispose(); } catch { /* chrome already gone */ }
        }
        try { quickToggle?.dispose(); } catch { /* chrome already gone */ }
        // Detach both hosted renderers before removing the DOM (the mounters re-home
        // their singleton — e.g. Cesium back to #container — on unmount).
        leftHost.unmount();
        rightHost.unmount();
        if (root.parentElement) root.parentElement.removeChild(root);
    };

    return {
        root,
        controller,
        store,
        getPaneElement: (paneId) => controller.getPaneElement(paneId),
        dispose,
        get isDisposed() {
            return disposed;
        },
    };
}

function clampFraction(f: number): number {
    if (!Number.isFinite(f)) return 0.5;
    return Math.max(MIN_FRACTION, Math.min(MAX_FRACTION, f));
}
