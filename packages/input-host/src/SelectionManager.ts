
import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
// §SELECT-HIGHLIGHT-RELEASE-AT-BOUNDARY (L-1002) — `scheduleGpuRelease` is the
// frame-boundary release queue (ADR-0297 INVARIANT L2), drained by
// `RenderPipelineManager.render()`. The `safeDispose*` helpers remain for the
// two sites that free a resource which was NEVER attached to the scene, and so
// can never be referenced by an in-flight submit.
import { TransformControls, getThreeRenderer, safeDisposeMaterial, safeDisposeGeometry, scheduleGpuRelease } from '@pryzm/renderer-three';
import { CurtainSubElement } from '@pryzm/geometry-curtain-wall';
import { LevelPlaneConstraint } from './LevelPlaneConstraint.js';
import { BIM_LAYER } from '@pryzm/scene-committer';
import { DeleteOpeningCommand } from '@pryzm/command-registry';
import { DeleteLightingCommand } from '@pryzm/command-registry';
import { BVHQuery } from '@pryzm/spatial-index';
import type { BVHElement } from '@pryzm/spatial-index';
import type { PickStrategy, PickContext, GpuPickRenderer, ElementRegistry, ElementKind } from '@pryzm/picking';
// §FIX-3D-DOOR-PICK-PRIORITY (L-99b) — let a wall-hosted door/window win over its host.
import { resolveHostedPickPriority } from '@pryzm/picking';
// §PRYZM-PERF (INSTR1) — a self-heal that runs OFTEN is a bug wearing a bandage.
// ADR-0299 catalogues this family as a CONCEALING recovery: every fire is a
// suppressed defect, and until now nothing counted the fires.
import { bumpPerf, PERF_KEYS } from '@pryzm/frame-scheduler';
import { getFrameScheduler } from '@pryzm/frame-scheduler';
import type { TickListenerDisposer } from '@pryzm/frame-scheduler';
import { elementRegistry as bimElementRegistry } from '@pryzm/core-app-model/element-registry';
// §SELECT-SURVIVES-THE-REBUILD (L-3530) — the pure decision behind the re-resolve
// miss branch. Separated so the thing that was WRONG (the inference, not the
// drawing) is unit-testable without standing up a world + canvas.
import { decideReresolveFate } from './reresolveFate';
// §FIX-PICK-CACHE-STORE-BUS (L-1194) — the family-agnostic store channel every
// ElementStore must publish through (§3.5). Replaces enumerating DOM event names.
import { storeEventBus } from '@pryzm/core-app-model';
// §MULTI-SELECT-SHIFT (L-1550) — the SelectionBus is the C27 §4 authority on WHAT IS
// SELECTED. `MarqueeSelectionTool`, in this same package, already imports it; this
// class is the surface that until now did not, which is precisely why the bus went
// stale on every plain 3-D click.
import { selectionBus } from '@pryzm/core-app-model';
import { SelectionBoundsRegistry, buildDefaultSelectionBoundsRegistry } from './SelectionBoundsRegistry.js';
import { startSpan } from './otel.js';
import type { ISelectionManager } from '@pryzm/engine';

// ── §PERF2-HOTLOG (L-1157) — throttled warnings for the per-frame paths ──────
//
// Three of this file's `console.warn`s and one `console.debug` sit on the HOVER
// rAF and the frame-scheduler tick, i.e. they run at display refresh rate for as
// long as the condition holds — and the conditions here are persistent states,
// not rare events. `_safeUpdateMatrixWorldForPick`'s own docblock says its throw
// "happens CONSTANTLY on a resi building whose 92 walls are re-queued + rebuilt
// in the background". A `console.warn` is a synchronous, formatting, DevTools-
// serialising call; at 60 Hz that is real main-thread cost inside the exact
// window the founder measures as a freeze.
//
// ⚠ DELETING THEM WOULD LOSE A REAL SIGNAL — each one marks a genuine defect
// someone still needs to see. So they are THROTTLED, not removed: first
// occurrence logs immediately, then 10th, 100th, 1000th…, and every line carries
// its own occurrence count. A reader sees the problem AND its true frequency,
// which is strictly more information than an unthrottled flood conveys, because
// nobody counts 4,000 identical lines by eye.
const _hotLogCounts = new Map<string, number>();

/** Log `msg` on the 1st, 10th, 100th … occurrence of `key`, carrying the count. */
function warnHot(key: string, msg: string, detail?: unknown): void {
    const n = (_hotLogCounts.get(key) ?? 0) + 1;
    _hotLogCounts.set(key, n);
    // 1, 10, 100, 1000, … — a decade scale, so a persistent condition reports
    // roughly once per order of magnitude instead of once per frame.
    let isDecade = false;
    for (let d = 1; d <= n; d *= 10) { if (d === n) { isDecade = true; break; } }
    if (!isDecade) return;
    if (detail === undefined) console.warn(`${msg} [occurrence #${n}]`);
    else console.warn(`${msg} [occurrence #${n}]`, detail);
}

/** Test/diagnostic seam — resets the throttle counters. */
export function __resetHotLogCounts(): void { _hotLogCounts.clear(); }

/**
 * Effective scene visibility — true only when `obj` AND every ancestor is
 * `.visible`. THREE's Raycaster ignores `.visible`, so a hidden element
 * (root `.visible = false`, set by isolate/hide, or a hidden level root) would
 * otherwise stay selectable through the raw-raycast fallback below
 * (#113 — hidden elements must not be selectable). The GpuPickStrategy primary
 * path and the BvhPickStrategy already exclude hidden elements; this brings the
 * legacy fallback to parity.
 */
function isObjectEffectivelyVisible(obj: THREE.Object3D): boolean {
    let cur: THREE.Object3D | null = obj;
    while (cur !== null) {
        if (cur.visible === false) return false;
        cur = cur.parent;
    }
    return true;
}

/**
 * SelectionManager
 *
 * Handles all 3D scene click-selection, transform-control attachment,
 * and green highlight box around the selected element.
 *
 * ## Curtain Wall Sub-Element Selection (Revit-like, Phase 1)
 *
 * Curtain walls use a two-step selection pattern matching Revit:
 *   • First click  → selects the parent curtain wall group (green highlight, CW properties)
 *   • Second click (on panel / mullion with CW already selected)
 *                 → keeps CW selected for TransformControls; shows sub-element properties
 *                    in the PropertyPanel + draws an amber highlight on the specific mesh
 *   • Tab key      → cycles through all panels then mullions of the selected CW,
 *                    one sub-element at a time (amber highlight follows)
 *   • Clicking     → reset sub-element mode; go back to parent CW view
 *     empty space
 *
 * The window.__curtainSubElement cache is:
 *   - Written here (performSelection + cycleSubElement)
 *   - Cleared here  (unselectAll, first-click-on-new-CW)
 *   - Read + cleared by PropertyPanel.showElement()
 *
 * All other element types (wall, slab, door, …) are completely unaffected.
 *
 * Contract compliance:
 *   §01: No store writes — read-only detection only.
 *   §04: Additive only — no existing handlers changed.
 *   §05: UI state bridge via window cache; PropertyPanel consumes it.
 */
export class SelectionManager implements ISelectionManager {
    selectedObject: THREE.Object3D | null = null;

    // ── §MULTI-SELECT-SHIFT (L-1550) — SHIFT+click add/toggle on the 3-D viewport ──
    //
    // The founder's ask (item 0.1) is "multi select elements via SHIFT + another
    // element". The model to hold that set ALREADY EXISTED — `selectionBus` carries
    // `currentIds` and `selectMany`, and `applyMarqueeHighlights` below paints the
    // secondary set — but the only producer was `MarqueeSelectionTool` (SHIFT+DRAG).
    // A SHIFT+CLICK reached `performSelection` and was handled as an ordinary click,
    // replacing the set.
    //
    // `performSelection` calls `select()` from FIVE different branches (hover-anchor
    // fast path, curtain-wall parent, curtain-wall sub-element, instanced pick, and
    // the general path). Branching on the modifier at each of them would be five
    // chances to disagree, so the modifier is latched here for the duration of one
    // gesture and consumed inside `select()` — one modifier, one behaviour, every
    // branch. It is CONSUMED (not merely read) so that any nested `select()` the
    // additive path itself provokes runs the ordinary path.
    private _additivePick = false;

    /** True while `_applyAdditivePick` owns the bus round-trip, so `select()`'s
     *  own bus mirror does not fire in the middle of it and collapse the set. */
    private _suppressBusMirror = false;
    // §SELECT-HIGHLIGHT-GEOMETRY — may be a single Mesh (registry mesh path /
    // box fallback) OR a Group of geometry-overlay clones (the default for
    // walls/doors/windows/columns/furniture/stairs…).  clearHighlight() disposes
    // either shape and never disposes geometry buffers SHARED with live elements.
    highlightMesh: THREE.Object3D | null = null;
    private touchStartTime = 0;
    private readonly TOUCH_THRESHOLD = 250;
    private isTransforming = false;
    /** Whether pointer-click selection is active. Public per `ISelectionManager`. */
    enabled = true;

    // ── §SELECT-STUCK-STATE-SELFHEAL — pointer-drag tracking for self-healing ──
    // The click→select guard in performSelection() early-returns when
    // `window.isCameraDragging` or `this.isTransforming` is true. Both are set by
    // EVENTS that can be MISSED — a programmatic camera transition (dblclick-zoom
    // `setLookAt(...,true)`) fires `controlstart` (→ isCameraDragging=true) but
    // does NOT always fire a matching `rest`/`sleep` (e.g. the camera was already
    // framed → no movement → no `rest`), so the flag sticks TRUE forever and EVERY
    // subsequent click is swallowed → "after a double-click, nothing selects, no
    // recovery". Likewise a TransformControls drag whose `dragging-changed:false`
    // is missed (pointer left canvas / exception) leaves isTransforming stuck.
    //
    // Self-heal: a browser `click` only fires after press+release WITHOUT a real
    // drag, so if these flags are set at click time but the user did NOT actually
    // drag this gesture (and the gizmo is not LIVE-dragging per
    // transformControls.dragging), the flags are STALE — we clear them and proceed.
    /** clientX at the last pointerdown on the canvas (null = no live press). */
    private _pointerDownClientX: number | null = null;
    /** clientY at the last pointerdown on the canvas. */
    private _pointerDownClientY: number | null = null;
    /** True once the pointer moved past the drag threshold since pointerdown. */
    private _pointerDraggedThisGesture = false;
    /** Squared px distance past which a press counts as a real drag, not a click. */
    private static readonly POINTER_DRAG_PX2 = 6 * 6;

    // ── Curtain-wall sub-element tracking ───────────────────────────────────
    /** Amber highlight mesh placed on the currently active sub-element. */
    private cwSubHighlight: THREE.Mesh | null = null;
    /** Ordered list of sub-elements (panels then mullions) for Tab cycling. */
    private cwSubElements: CurtainSubElement[] = [];
    /** Current index into cwSubElements (-1 = parent CW view). */
    private cwSubElementIndex = -1;
    // ────────────────────────────────────────────────────────────────────────

    // ── Kitchen-cabinet sub-element tracking ─────────────────────────────────
    /** Ordered list of kitchen unit descriptors for Tab cycling. */
    private kcSubUnits: Array<{ group: THREE.Object3D; index: number; arm: string }> = [];
    /** Current Tab index: -1 = whole run, 0..N-1 = unit, N = countertop slab. */
    private kcSubUnitIndex = -1;
    /** Amber highlight mesh for the active kitchen sub-element. */
    private kcSubHighlight: THREE.Mesh | null = null;
    // ─────────────────────────────────────────────────────────────────────────

    // ── Wardrobe-cabinet sub-element tracking (§16 §2.6) ─────────────────────
    /** Ordered list of wardrobe unit descriptors for Tab cycling. */
    private wdSubUnits: Array<{ group: THREE.Object3D; index: number; arm: string }> = [];
    /** Current Tab index: -1 = whole run, 0..N-1 = unit. */
    private wdSubUnitIndex = -1;
    /** Amber highlight mesh for the active wardrobe sub-element. */
    private wdSubHighlight: THREE.Mesh | null = null;
    // ─────────────────────────────────────────────────────────────────────────

    // PERF-FIX-#5: Allocate Raycaster and mouse Vector2 once as instance fields
    // instead of creating new objects on every click event (avoids GC pressure).
    private readonly _raycaster = new THREE.Raycaster();
    private readonly _mouse = new THREE.Vector2();

    // ── Level-plane Y-lock (prevents vertical gizmo movement) ───────────────
    /** Injected after construction by EngineBootstrap via setLevelPlaneConstraint(). */
    private levelPlaneConstraint: LevelPlaneConstraint | null = null;

    // W5 §SLAB-SYSTEM-AUDIT-2026: Injected callback for slab double-click →
    // profile-edit-mode entry.  Replaces window.slabTool read.
    private _onSlabProfileEdit: ((slabId: string) => Promise<void>) | null = null;

    // ── Hover tracking (Phase A2 — bim-hover-changed → TSL outline) ─────────
    /** UUID of the last object reported as hovered (null = no hover). */
    private _lastHoveredUuid: string | null = null;
    /** The actual last hovered semantic root — used by Enter-key selection. */
    private _lastHoveredObject: THREE.Object3D | null = null;
    /**
     * §SELECT-TAB-CYCLE (DAILY-USE 2026-05-21) — Architectural TAB-cycle for
     * overlapping selection candidates (Revit / SketchUp / ArchiCAD convention).
     * When the architect clicks at a position where multiple selectable
     * elements project to the same pixel (e.g. a door INSIDE a wall, or a
     * column BEHIND a slab edge), the first click selects the front-most
     * candidate; subsequent TAB presses cycle to the next candidate without
     * the architect having to move the camera.
     *
     * Fields:
     *   • `_tabCycleCandidates` — the ordered list of candidates captured at
     *     the last click. Ordered front-to-back by camera distance from BVH
     *     raycast hits, deduplicated by selectable root.
     *   • `_tabCycleIndex` — which candidate is currently selected (0 =
     *     front-most, captured on the original click).
     *   • `_tabCycleAnchorClientX/Y` — the cursor position at the time the
     *     candidates were captured. TAB cycles only when the cursor is still
     *     within TAB_CYCLE_ANCHOR_PX of this anchor; cursor drift beyond
     *     that re-enumerates candidates from the new position on the next
     *     click.
     *
     * Cleared on: every fresh click outside the anchor radius, on unselect,
     * on tool switch, on Escape.
     *
     * Architectural alignment:
     *   - Composable with #59 (Round 9 GPU/BVH split): candidate list is the
     *     full BVH hit set; GPU pick still owns the FRONT-MOST claim.
     *   - C13 §3 (selection authority) extended with cycle semantics — TAB
     *     advances within the same authoritative candidate list, not a
     *     parallel pick.
     *   - C14 §2.3 (interaction precedence): TAB precedence above other
     *     shortcuts when cycle state is non-null. `e.preventDefault()` so
     *     the browser's tab-traversal doesn't move focus out of the canvas.
     */
    private _tabCycleCandidates: THREE.Object3D[] | null = null;
    private _tabCycleIndex = 0;
    private _tabCycleAnchorClientX: number | null = null;
    private _tabCycleAnchorClientY: number | null = null;
    /** Max cursor drift (CSS px) before TAB re-enumerates instead of cycling. */
    private static readonly TAB_CYCLE_ANCHOR_PX = 16;

    /**
     * §SELECT-3D-1 (DAILY-USE 2026-05-20) — GPU-CONFIRMED last hovered semantic
     * root.  Distinct from `_lastHoveredObject` (which is written by BOTH the
     * BVH/raycaster fast-path AND the GPU rAF) — this field is set ONLY by the
     * GPU pick rAF on a hit, and cleared on a miss.
     *
     * Architectural motivation:
     *   The click-anchor branch in `performSelection()` (FIX-S16-ANCHOR) uses
     *   `_lastHoverConfirmedClientX/Y` — coordinates that ONLY the GPU rAF
     *   writes — as the gate, but then it dereferenced `_lastHoveredObject`,
     *   which the BVH path also writes on every pointermove.  At far camera
     *   distance (zoomed out), the BVH raycast can hit a different (often
     *   front-most-AABB-overlap) element than the pixel-accurate GPU pick:
     *
     *     T0 pointermove#1 → BVH writes _lastHoveredObject=A, schedules GPU rAF
     *     T1 GPU rAF      → writes _lastHoveredObject=B (correct), anchor=(x,y)
     *     T2 pointermove#2 (same spot) → BVH writes _lastHoveredObject=A again
     *     T3 click ←  anchor branch fires (cursor within 8px of T1 anchor),
     *                 reads _lastHoveredObject=A → WRONG ELEMENT SELECTED.
     *
     *   Reported by the architect: "the selection of objects - plan view works
     *   great - but 3d scene not - when I point element on far distance select
     *   others. Normally when being close to the element works well - but in
     *   the distance not."  (Daily-use audit 2026-05-20.)
     *
     * Fix: split the two refs. `_lastHoveredObjectGpu` is written only by the
     * GPU path; the anchor branch dereferences IT — so even if the BVH later
     * overwrites the cursor-feedback ref, the GPU-confirmed click target is
     * untouched. The BVH ref keeps its role: immediate-feedback cursor swap
     * + `bim-hover-changed` dispatch (TSL outline) — both unaffected if the
     * BVH guess is slightly off, because they re-converge on the next rAF.
     */
    private _lastHoveredObjectGpu: THREE.Object3D | null = null;

    /**
     * §SELECT-INSTANCED-FURNITURE-PICK — the PER-INSTANCE element id GPU-confirmed at
     * the last hover, when `_lastHoveredObjectGpu` is an InstancedElementRenderer
     * group hosting many elements (instanced furniture / columns / beams). The
     * click-anchor branch passes this to select() as the per-instance override so an
     * anchored click on an instanced item selects (and highlights) the RIGHT instance,
     * not the whole group. `null` when the hovered target is a normal element (its own
     * root carries the id) or there is no hover. Reset alongside `_lastHoveredObjectGpu`.
     */
    private _lastHoveredInstanceIdGpu: string | null = null;

    // ── §MARQUEE-SELECT-2026 — Multi-element marquee highlights ─────────────
    /**
     * Wireframe AABB highlight meshes for each NON-PRIMARY element in a
     * marquee selection.  The primary element keeps the precise OBB built
     * by `applyHighlight()`; these secondary highlights are intentionally
     * cheap (world-space AABB wireframe) so we can show many at once.
     */
    private _marqueeHighlightMeshes: THREE.Object3D[] = [];
    /** Timestamp of the last pointermove raycast (used for throttle). */
    private _lastPointerMoveTime = 0;
    /** Minimum ms between hover raycasts — keeps cost negligible at 60 fps. */
    private readonly HOVER_THROTTLE_MS = 50;

    // G2-T1: rAF-throttled GPU pick ──────────────────────────────────────────
    // The raw pointermove handler only STORES the latest cursor position and
    // schedules exactly one rAF callback per frame.  Multiple pointer events
    // between two animation frames collapse to a single GPU pick, preventing
    // the 95–451 ms LONGTASKs that fired synchronously on every pointermove.
    /** Most-recent clientX captured in pointermove (updated without a pick). */
    private _pendingHoverClientX = 0;
    /** Most-recent clientY captured in pointermove (updated without a pick). */
    private _pendingHoverClientY = 0;
    /**
     * Non-null while a FrameScheduler 'pre-render' slot is already queued
     * for the GPU hover pick.  Prevents double-scheduling when multiple
     * pointermove events arrive in the same animation-frame interval.
     * Holds the disposer returned by `getFrameScheduler().scheduleOnce()`.
     * The scheduler auto-disposes on fire; this field is set to null by
     * `_onHoverGpuPickRaf()` at the top of the callback.
     */
    private _hoverRafId: TickListenerDisposer | null = null;

    // FIX-S16-ANCHOR: cursor position at the time of the last confirmed GPU
    // hover hit.  Used by performSelection() to anchor a click to the hover-
    // confirmed element when the cursor hasn't moved more than CLICK_HOVER_SNAP_PX
    // pixels since the last hover RAF, eliminating hover-shows-A / selects-B.
    private _lastHoverConfirmedClientX: number | null = null;
    private _lastHoverConfirmedClientY: number | null = null;
    // ─────────────────────────────────────────────────────────────────────────

    // PERF-FIX-#6: Cache the list of selectable scene objects so we only traverse
    // the scene graph once, not on every click. The cache is invalidated when any
    // BIM element is added, updated, or removed from the scene.
    private _selectableCache: THREE.Object3D[] | null = null;
    /** §FIX-ELEMENT-REBIND-ON-ROOT-SWAP — disposer for the elementRegistry subscription. */
    private _rootSwapUnsub: (() => void) | null = null;

    /**
     * §SELECT-SURVIVES-THE-REBUILD (L-3530) — bounded retry budget for
     * `_reresolveSelectionAfterRebuild`, keyed by element id so a retry budget
     * spent on one element can never suppress the first attempt for the next.
     */
    private _reresolveRetry: { id: string; n: number } | null = null;

    /**
     * How many times a re-resolve may retry before concluding the registration is
     * orphaned. 4 × 50 ms ≈ 200 ms — comfortably more than the couple of frames a
     * `pre-render` build-queue drain needs, and far less than a user would read as
     * "stuck". Not a tuning knob: raising it hides orphaned registrations, and
     * lowering it re-opens the race.
     */
    private static readonly RERESOLVE_MAX_RETRIES = 4;
    private static readonly RERESOLVE_RETRY_MS = 50;

    // Sprint F-2.0 §E2: pluggable highlight bounds registry — plugins call
    // `selectionManager.boundsRegistry.register(type, builderFn)` at startup.
    private readonly _boundsRegistry: SelectionBoundsRegistry = buildDefaultSelectionBoundsRegistry();

    /** Pluggable highlight-bounds registry.  Plugins register custom highlight
     *  shapes for their own element types:
     *  ```ts
     *  selectionManager.boundsRegistry.register('my-beam', buildMyBeamHighlight);
     *  ```
     */
    get boundsRegistry(): SelectionBoundsRegistry { return this._boundsRegistry; }

    // A16-T8: BVH spatial acceleration (C04 §3) — O(log n) candidate pruning
    // before the O(n·triangles) mesh-level THREE.Raycaster intersectObjects call.
    // The BVH is rebuilt from element AABBs whenever _selectableCache is rebuilt.
    // Falls back to full _selectableCache when BVH is null or produces zero hits.
    private _bvhQuery: BVHQuery | null = null;
    /** Maps each cached Object3D → its semantic root's element ID (null = no root). */
    private _objectRootIdCache: Map<THREE.Object3D, string | null> = new Map();

    // Wave 36 U-2 (A16-T8 completion): resolved pick strategy — GPU when available,
    // otherwise null (SelectionManager keeps using its own BVH+raycaster path).
    // Injected after construction via setPickStrategy(). C04 §3.2: PickStrategyResolver
    // MUST be the only decision point for strategy selection at runtime.
    private _pickStrategy: PickStrategy | null = null;

    // Define valid semantic types that should be selectable.
    // 'instancedelement' covers InstancedElementRenderer meshes (structural columns,
    // beams, repeated furniture) whose userData.elementType is set to 'InstancedElement'
    // by InstancedElementRenderer.register().  These are also guarded by the
    // userData.isInstancedGroup === true early-return in findSelectableRoot() and the
    // matching include-guard in _ensureSelectableCache() (BUG-04).  Listing the type
    // here ensures isSemanticType() returns true for completeness and future callers.
    // §SELECT-SEMANTIC-TYPE-NAMES (2026-05-23) — these MUST match the actual
    // `userData.elementType` strings the builders stamp (lower-cased). Two entries
    // were stale and never matched any element: 'stairs' (plural) — the real type
    // is 'stair' (StairMeshBuilder.ts:145 'Stair'); and 'railing' — the real types
    // are 'handrail' (HandrailFragmentBuilder.ts:79 'Handrail', root selectable) and
    // 'stair-railing' (StairRailingBuilder, deliberately selectable:false so it is
    // intentionally NOT listed here). Single-click on a stair still worked via the
    // findSelectableRoot() step-4 `selectable:true` fallback, but the semantic-type
    // gated paths — findSelectableRoot() step-3 and the overlapping-candidate
    // collection (~L2562, the TAB-cycle / slab-vs-stair tie-break) — silently
    // dropped stairs, letting a slab underneath win. Corrected to the real names.
    private readonly SEMANTIC_TYPES = [
        'wall', 'window', 'door', 'slab', 'furniture', 'column',
        'beam', 'roof', 'stair', 'ramp', 'handrail', 'opening',
        'curtainwall', 'ceiling', 'floor', 'lighting',
        'instancedelement',
    ].map(type => type.toLowerCase());

    // Sub-element roles that resolve to their parent via parentId (like role:'geometry')
    private readonly PARENT_RESOLVED_ROLES = ['geometry', 'mullion', 'panel'];

    constructor(
        private world: OBC.World,
        private camera: OBC.SimpleCamera,
        private domElement: HTMLElement,
        private transformControls: TransformControls,
        private updateInspector: (obj: THREE.Object3D) => void
    ) {}

    /**
     * Inject the LevelPlaneConstraint after construction.
     * Called by EngineBootstrap once both SelectionManager and
     * LevelPlaneConstraint are ready.
     */
    setLevelPlaneConstraint(constraint: LevelPlaneConstraint): void {
        this.levelPlaneConstraint = constraint;
    }

    /**
     * W5 §SLAB-SYSTEM-AUDIT-2026: Inject the slab profile-edit callback.
     * Replaces the dblclick handler's window.slabTool read.
     * Called by EngineBootstrap after both SelectionManager and SlabTool are ready.
     */
    setSlabProfileEditCallback(cb: (slabId: string) => Promise<void>): void {
        this._onSlabProfileEdit = cb;
    }

    /**
     * §EDIT-PROFILE / §98 (2026-05-22) — public entry point for slab profile
     * editing, now invoked by the contextual "Edit Profile" toolbar button
     * (ContextualEditBar) instead of the old double-click handler (removed so
     * double-click zooms like every other element). Prefers the injected
     * callback (set via setSlabProfileEditCallback by initTools) so this class
     * keeps no hard window dependency; falls back to window.slabTool for the
     * bootstrap window before the callback is wired.
     */
    async enterSlabProfileEdit(slabId: string): Promise<void> {
        if (!slabId) return;
        if (this._onSlabProfileEdit) {
            await this._onSlabProfileEdit(slabId);
            return;
        }
        const slabTool = window.slabTool;
        if (slabTool && typeof slabTool.enterProfileEditMode === 'function') {
            await slabTool.enterProfileEditMode(slabId);
        }
    }

    /**
     * Wave 36 U-2 (A16-T8 completion, C04 §3.2): inject the resolved PickStrategy.
     * Pass the result of `resolvePickStrategy()` for GPU picking, or null to keep
     * SelectionManager's own BVH+raycaster path active (headless / WebGL fallback).
     * Called by initTools after selectionManager.init().
     */
    setPickStrategy(strategy: PickStrategy | null): void {
        this._pickStrategy = strategy;
        console.log('[SelectionManager] PickStrategy set:', strategy?.id ?? 'null (BVH path active)');
    }

    /**
     * Wave 36 U-2: Build a live ElementRegistry adapter from the current selectable
     * cache. Passed to PickStrategy.pick() at click time. The registry is rebuilt
     * per-pick so it reflects the latest scene state without external coordination.
     */
    private _buildElementRegistry(): ElementRegistry {
        const cache = this._selectableCache ?? [];
        const idToObj = new Map<string, THREE.Object3D>();
        // BUG-01: Prefer the highest ancestor when multiple cache entries share the
        // same userData.id (e.g. a wall Group and wall-fragment sub-meshes both
        // tagged with the same id, or IFC entity groups and their child meshes).
        // Without this guard the last traversed object wins (last-write-wins),
        // which was unpredictable and caused the GPU pick renderer to use a
        // deep-nested mesh instead of the semantic root Group.  Using the
        // highest ancestor ensures extractGeometry / collectVisibleMeshes get
        // the full geometry tree and objectFor() returns the right root.
        for (const obj of cache) {
            const id = obj.userData?.id as string | undefined;
            if (!id) continue;
            const existing = idToObj.get(id);
            if (!existing || this._isAncestorOf(obj, existing)) {
                idToObj.set(id, obj);
            }
        }
        // §SELECT-INSTANCED-FURNITURE-PICK — also index every PER-INSTANCE element id
        // of an InstancedElementRenderer group → the group object. Walls/columns keep
        // their own (empty-but-visible) root + hit-proxy in the cache, so objectFor(id)
        // already resolves them; INSTANCED FURNITURE does NOT — when an item is
        // instanced its per-item root is set visible=false (FurnitureFragmentBuilder)
        // and excluded from the selectable cache, so the GPU pick's per-instance
        // elementId had NO entry in idToObj. objectFor() returned null → the GPU hit
        // was dropped (click silently fell back to the slower BVH path; HOVER showed
        // no outline and never armed the click anchor). Mapping each occupied
        // instance's element id to its hosting group makes objectFor(furnitureId)
        // resolve the group; the GPU resolution below then selects it with that id as
        // the per-instance override (mirroring the BVH path's getInstanceElementId →
        // select(group, instanceId)). The synthetic group id stays mapped to the group
        // itself (set in the loop above) — we never overwrite an existing id, so a real
        // own-root always wins. Per-instance BIM ids are unique, so this is additive.
        for (const obj of cache) {
            if (obj.userData?.isInstancedGroup !== true) continue;
            const getSlots = obj.userData?.getOccupiedInstanceSlots as
                (() => readonly number[]) | undefined;
            const getElemId = obj.userData?.getInstanceElementId as
                ((slot: number) => string | undefined) | undefined;
            if (!getSlots || !getElemId) continue;
            for (const slot of getSlots()) {
                const memberId = getElemId(slot);
                if (memberId !== undefined && !idToObj.has(memberId)) {
                    idToObj.set(memberId, obj);
                }
            }
        }
        return {
            ids: (): readonly string[] => [...idToObj.keys()],
            kindOf: (id: string): ElementKind | null => {
                const obj = idToObj.get(id);
                if (!obj) return null;
                return ((obj.userData?.elementType ?? obj.userData?.type ?? null) as ElementKind | null);
            },
            objectFor: (id: string): THREE.Object3D | null => idToObj.get(id) ?? null,
        };
    }

    /**
     * BUG-01: Returns true if `candidate` is a strict ancestor of `descendant`
     * in the Three.js parent chain.
     *
     * Used by `_buildElementRegistry` to prefer the highest-ancestor object
     * when multiple selectable-cache entries share the same `userData.id`
     * (e.g. a wall Group and its fragment sub-meshes, or IFC entity groups
     * and their child geometry nodes).
     *
     * Complexity: O(depth).  BIM element hierarchies are ≤ 4 levels deep.
     */
    private _isAncestorOf(candidate: THREE.Object3D, descendant: THREE.Object3D): boolean {
        let curr: THREE.Object3D | null = descendant.parent;
        while (curr !== null) {
            if (curr === candidate) return true;
            curr = curr.parent;
        }
        return false;
    }

    /**
     * Wave 36 U-2: Build a GpuPickRenderer adapter wrapping the THREE.WebGLRenderer
     * exposed by `world.renderer.three`. Required by GpuPickStrategy.pick().
     * SelectionManager restores render target + override material after each pick.
     */
    private _buildGpuPickRenderer(): GpuPickRenderer {
        // B4: getThreeRenderer() replaces the `(world.renderer as any).three as any`
        // cast and centralises the OBC→THREE bridge in @pryzm/renderer-three.
        const renderer = getThreeRenderer(this.world.renderer);
        return {
            // BUG-05: Use CSS pixels (clientWidth/clientHeight) so viewport
            // dimensions match the CSS-pixel coordinates supplied by
            // getBoundingClientRect() in performSelection / _onPointerMove.
            // domElement.width/height are physical pixels (DPR-multiplied),
            // causing a scale error equal to devicePixelRatio on HiDPI screens.
            get width()  { return renderer.domElement.clientWidth;  },
            get height() { return renderer.domElement.clientHeight; },
            // §SELECT-PICK-RESOLUTION — GPU max single-texture dimension. Lets
            // GpuPickStrategy size the id-buffer to the FULL device-pixel
            // viewport (viewport × dpr), clamped only to this real hardware
            // limit — not the old fixed 1280 that downscaled wide viewports to
            // ~0.67× and made thin elements (columns, railings) unhittable.
            get maxTextureSize() {
                return (renderer as { capabilities?: { maxTextureSize?: number } })
                    .capabilities?.maxTextureSize ?? 4096;
            },
            // §SS-FIX-SELECTION-SURVIVES-DEVICE-LOSS (L-329, P2 — C04) — feed the
            // GPU-pick strategy the app's EXISTING device-loss counter so it can
            // self-heal after a WebGPU device loss + recovery. createRenderer.ts
            // bumps `globalThis.__pryzmDeviceLossCount` once per recovered device
            // (the ShadowDepthTexture-mid-submit → Device Lost → zero-size
            // framebuffer cascade the founder saw). GpuPickStrategy records the
            // generation its pick render target + per-element id registrations were
            // built under and, when this advances, rebuilds them against the live
            // device BEFORE the next readback — so 3D selection keeps working
            // instead of silently returning nothing forever. Read fresh on every
            // pick (this adapter is rebuilt per-pick); no edit to the renderer
            // subsystem (RenderPipelineManager / createRenderer) required.
            get contextGeneration() {
                return (globalThis as { __pryzmDeviceLossCount?: number })
                    .__pryzmDeviceLossCount ?? 0;
            },
            renderToTarget(
                scene: THREE.Scene,
                camera: THREE.Camera,
                target: THREE.WebGLRenderTarget,
                override: THREE.Material | null,
            ): void {
                const prevTarget   = renderer.getRenderTarget();
                // Three.js r152+: overrideMaterial lives on Scene, not WebGLRenderer.
                const prevOverride = scene.overrideMaterial;
                renderer.setRenderTarget(target);
                scene.overrideMaterial = override;
                try {
                    renderer.render(scene, camera);
                } finally {
                    // F-P1: try/finally guarantees overrideMaterial and renderTarget
                    // are always restored even if renderer.render() throws (shader
                    // compilation error, context loss during render, etc.).
                    // Without this, a throw leaves overrideMaterial as the pick-colour
                    // material permanently, blanking the scene on every subsequent frame.
                    scene.overrideMaterial = prevOverride;
                    renderer.setRenderTarget(prevTarget);
                }
            },
            readPixels(
                target: THREE.WebGLRenderTarget,
                x: number, y: number, w: number, h: number,
                buffer: Uint8Array,
            ): void {
                renderer.readRenderTargetPixels(target, x, y, w, h, buffer);
            },
            createRenderTarget(w: number, h: number): THREE.WebGLRenderTarget {
                return new THREE.WebGLRenderTarget(w, h);
            },
        };
    }

    /**
     * §SELECT-INSTANCED-PICK (FIX #3) / §SELECT-SVP3D-ANCHOR-SKIP — clear the
     * hover-confirmed click anchor.
     *
     * When the split-view 3D pane opens or closes, `_lastHoverConfirmedClientX/Y`
     * (and the GPU-confirmed hover ref) can hold STALE pre-pane coordinates: while
     * the cursor was over the SVP pane the MAIN canvas received no hover rAF, so a
     * subsequent main-canvas click within CLICK_HOVER_SNAP_PX of the stale position
     * would "snap back" to the old element (the architect's "selection reverts to
     * the latest selected"). Clearing the anchor on the visibility transition forces
     * the next click to run a fresh pick. This complements the per-click
     * __pryzmForwarded skip already in performSelection() — that handles forwarded
     * clicks; this handles the FIRST real main-canvas click after the layout change.
     *
     * Also clears if the GPU-confirmed hover target was removed from the scene
     * (liveness guard) so a deleted element can't remain the anchor.
     */
    clearHoverAnchor(): void {
        this._lastHoverConfirmedClientX = null;
        this._lastHoverConfirmedClientY = null;
        this._lastHoveredObjectGpu = null;
        this._lastHoveredInstanceIdGpu = null;
    }

    /**
     * §SELECT-INSTANCED-PICK (FIX #3) — liveness guard: returns true (and clears
     * the anchor) when the GPU-confirmed hover target is no longer attached to the
     * scene graph (parent chain detached). Called before honouring the click anchor
     * so a removed element can never resolve a stale selection.
     */
    private _anchorTargetIsStale(): boolean {
        const target = this._lastHoveredObjectGpu;
        if (target === null) return false;
        if (this._isAttachedToScene(target)) return false;
        // Detached — clear and report stale.
        this.clearHoverAnchor();
        return true;
    }

    /**
     * §SELECT-GIZMO-REATTACH — true when `obj`'s parent chain reaches the live
     * scene root (i.e. it is still part of the scene graph). When an element is
     * MOVED / UNDONE / re-created its mesh is disposed + rebuilt (old group
     * scene.remove()'d, new group scene.add()'d), so a cached reference to the
     * old object becomes detached. THREE's TransformControls.updateMatrixWorld
     * throws "The attached 3D object must be a part of the scene graph" on EVERY
     * render frame while the gizmo stays attached to such a detached object —
     * which floods the console and wedges the interaction loop so subsequent
     * picks no longer select. Used by the rebuild handler + gizmo guard below.
     */
    private _isAttachedToScene(obj: THREE.Object3D): boolean {
        const sceneRoot = this.world.scene.three as THREE.Object3D;
        let cur: THREE.Object3D | null = obj;
        while (cur !== null) {
            if (cur === sceneRoot) return true;
            cur = cur.parent;
        }
        return false;
    }

    /**
     * §SELECT-GIZMO-REATTACH — defensive guard against the TransformControls
     * "must be a part of the scene graph" per-frame flood.
     *
     * If the gizmo is attached to an object that is no longer in the scene graph
     * (its element was rebuilt/disposed and we did not get a chance to re-resolve
     * it, e.g. an external scene clear or a rebuild that fired no `bim-*-updated`
     * event), DETACH it. The next selection click re-attaches cleanly. Returns
     * true if it detached a stale object. Safe to call every frame.
     *
     * Note: wall/stair gizmos attach to an invisible PROXY (added to the scene by
     * WallTransformController / StairTransformController); those proxies stay in
     * the scene while their controller is active, so this guard leaves them alone.
     */
    guardTransformControlsAttachment(): boolean {
        const tcObj = (this.transformControls as { object?: THREE.Object3D | null }).object ?? null;
        if (tcObj === null) return false;
        if (this._isAttachedToScene(tcObj)) return false;
        // §PERF2-HOTLOG — this runs on the frame-scheduler 'pre-render' tick
        // (registered as 'selection-manager-gizmo-liveness-guard') AND from the
        // hover rAF, so the message's own phrase "to stop the per-frame flood"
        // described a log that WAS the per-frame flood.
        warnHot('gizmo-reattach', '[SelectionManager] §SELECT-GIZMO-REATTACH gizmo attached to a detached object — detaching to stop the per-frame flood');
        this.transformControls.detach();
        return true;
    }

    /**
     * §SELECT-HOVER-MATRIX-GUARD (FIX #1 + #2) — propagate world matrices for a
     * GPU pick WITHOUT letting a stale gizmo abort the frame.
     *
     * Both the hover RAF (`_onHoverGpuPickRaf`) and the click pick path call
     * `scene.updateMatrixWorld(true)` to bring batch-created / matrixAutoUpdate=false
     * elements current before the pick render. TransformControls is itself a child
     * of the scene, and stock THREE's `TransformControls.updateMatrixWorld()` THROWS
     * ("The attached 3D object must be a part of the scene graph") the instant its
     * attached object's parent chain no longer reaches the scene root — which happens
     * CONSTANTLY on a resi building whose 92 walls are re-queued + rebuilt in the
     * background (§RESI-EXTERIOR-WALL-MITER-FIX2): the selected wall's old mesh is
     * disposed mid-hover before our deferred `_reresolveSelectionAfterRebuild` runs.
     *
     * When that throw fires inside the hover RAF:
     *   • the GPU hover pick NEVER runs → `_lastHoveredObjectGpu` / the click anchor
     *     are never refreshed → every subsequent click snaps back to the LAST wall
     *     (the "stuck selection" symptom);
     *   • the half-finished `updateMatrixWorld` traversal + the WebGPU dispose it
     *     triggers surface the §I2/§I3 `usedTimes` device-loss family UNGUARDED into
     *     ViewportCrashGuard, which aborts that frame's render (the highlight
     *     "flickers off").
     *
     * Fix: detach any stale gizmo FIRST (so the throw can't happen at all), then run
     * the matrix update inside a try/catch as belt-and-braces — if anything still
     * throws (e.g. a wall/stair PROXY whose WallTransformController removed it from
     * the scene during the same rebuild), we detach the gizmo and retry ONCE so the
     * scene matrices still get updated and the pick can proceed. The render frame is
     * never aborted by a hover.
     */
    private _safeUpdateMatrixWorldForPick(): void {
        // (1) Never let the gizmo poison the traversal: drop a detached target up front.
        this.guardTransformControlsAttachment();
        const sceneRoot = this.world.scene.three as THREE.Object3D;
        try {
            sceneRoot.updateMatrixWorld(true);
        } catch (err) {
            // (2) Belt-and-braces: a gizmo/proxy can detach between the guard above
            // and this call under heavy rebuild churn. Detach + retry once so the
            // hover/click never throws into ViewportCrashGuard and aborts the frame.
            // §PERF2-HOTLOG — reached from the hover rAF; the docblock above
            // states this throw "happens CONSTANTLY" during background rebuilds.
            warnHot(
                'hover-matrix-throw',
                '[SelectionManager] §SELECT-HOVER-MATRIX-GUARD updateMatrixWorld threw ' +
                '(likely a detached gizmo target during a background rebuild) — detaching gizmo and retrying once:',
                err instanceof Error ? err.message : err,
            );
            try { this.transformControls.detach(); } catch { /* already detached */ }
            try {
                sceneRoot.updateMatrixWorld(true);
            } catch (err2) {
                // Still throwing — swallow so the pick can fall through to the BVH
                // path and the render frame survives. Never rethrow on a hover.
                // §PERF2-HOTLOG — same hover-rAF path, one level deeper.
                warnHot(
                    'hover-matrix-throw-after-detach',
                    '[SelectionManager] §SELECT-HOVER-MATRIX-GUARD updateMatrixWorld still threw after gizmo detach — skipping matrix sync this frame:',
                    err2 instanceof Error ? err2.message : err2,
                );
            }
        }
    }

    /**
     * §SELECT-STUCK-STATE-SELFHEAL — clear stale interaction flags that can
     * permanently swallow click-selection.
     *
     * `isTransforming` (gizmo-drag mirror) and `window.isCameraDragging` (camera
     * orbit / programmatic transition) gate `performSelection()`. Both are cleared
     * by events that can be missed — most notably a dblclick-zoom
     * `setLookAt(...,true)` that fires `controlstart` (→ isCameraDragging=true) but
     * no matching `rest` when the camera was already framed — leaving selection
     * dead for the session. This is the user's universal escape hatch: unless the
     * gizmo is GENUINELY live-dragging (`transformControls.dragging === true`),
     * every stuck flag is reset so the next click selects again.
     *
     * Called on Escape (any time) and on every fresh canvas pointerdown.
     */
    private _healStuckInteractionState(reason: string): void {
        const gizmoLiveDragging =
            (this.transformControls as { dragging?: boolean }).dragging === true;
        if (gizmoLiveDragging) return; // a real drag is in progress — leave it alone
        let healed = false;
        if (this.isTransforming) { this.isTransforming = false; healed = true; }
        if (window.isCameraDragging) { window.isCameraDragging = false; healed = true; }
        this._pointerDraggedThisGesture = false;
        if (healed) {
            bumpPerf(PERF_KEYS.SELECT_SELFHEAL);
            console.warn(`[SelectionManager] §SELECT-STUCK-STATE-SELFHEAL cleared stale interaction flags (${reason}) — selection un-wedged`);
        }
    }

    /**
     * §SELECT-GIZMO-REATTACH — re-resolve the selected element after its mesh was
     * rebuilt.
     *
     * Called when a `bim-<type>-updated` event fires for the element that is
     * currently selected. The builder disposes the old Object3D and adds a fresh
     * one carrying the same `userData.id`; our `selectedObject` (and the gizmo's
     * attached object) still point at the now-detached old mesh. We:
     *   1. Detach the gizmo if it is bound to a detached object (stops the flood).
     *   2. Re-resolve the current Object3D for the element id from the (already
     *      invalidated) selectable cache / scene.
     *   3. If found and it differs from the stale `selectedObject`, re-select it —
     *      `select()` re-applies the highlight, re-attaches the gizmo and re-fires
     *      `bim-selection-changed` so the wall/stair/hosted controllers re-bind to
     *      the NEW mesh.
     *   4. If the element is gone (e.g. undo of a create), `unselectAll()` so the
     *      gizmo never holds a dangling object.
     */
    private _reresolveSelectionAfterRebuild(updatedId: string): void {
        if (!updatedId) return;
        const sel = this.selectedObject;
        if (!sel || sel.userData?.id !== updatedId) return;

        // (1) Always detach a stale gizmo immediately — even if re-resolution
        // below fails, we must not leave the gizmo on a detached object.
        this.guardTransformControlsAttachment();

        // (2) Re-resolve the live Object3D for this element id. The same rebuild
        // event invalidated _selectableCache (registered in init()), so
        // _resolveLiveObjectById() rebuilds it on demand and returns the NEW mesh.
        const fresh = this._resolveLiveObjectById(updatedId);

        if (!fresh) {
            // ── §SELECT-SURVIVES-THE-REBUILD (L-3530), founder 2026-08-22 ─────
            //
            // ⛔ THIS BRANCH USED TO READ, IN FULL:
            //      // Element no longer in the scene (e.g. undo-of-create removed it)
            //      this.unselectAll();
            //
            // ⭐ AND "NO LIVE MESH FOR THIS ID" IS NOT "THE ELEMENT IS GONE". They
            // are two facts with the SAME VALUE at this line, and the old code read
            // the second from the first. That is [[context-data-honesty-family]]
            // exactly — failure and empty are the same value — and it deselects a
            // perfectly live wall.
            //
            // MEASURED, the race: `_resolveLiveObjectById` only returns objects
            // whose parent chain reaches the scene root (its own docblock: *"Only
            // returns objects that are actually attached to the scene graph"*). The
            // caller defers by `setTimeout(…, 0)` "so the builder's scene.remove(old)
            // + scene.add(new) has settled" — but for the `onRootSwapped` trigger
            // that assumption is stated and then contradicted three lines later:
            // *"Builders register the root BEFORE scene.add()"*. A builder that
            // registers on one tick and attaches on a later FRAME (the build queue
            // drains from `getFrameScheduler().schedule('pre-render', …)`) is
            // therefore observed here as ABSENT, and the selection is dropped.
            //
            // That is the founder's *"highlights for about a second, then the
            // highlight is lost"*: select a wall → `bim-selection-changed` →
            // `wallTransformController.activateFor` → the wall is re-queued and
            // rebuilt → `bim-wall-updated` → this runs before the mesh is back.
            //
            // THE FIX ASKS THE DOMAIN, NOT THE SCENE. `elementRegistry` is, by its
            // own header, *"the SINGLE SOURCE OF TRUTH for what scene roots are
            // placed BIM elements"*; `getStoreType()` survives the transient
            // `unregisterRoot()` + `registerRoot()` pair a stair-shaped rebuild
            // performs, and is cleared only by a REAL `unregister()`. So:
            //   · the domain still knows this id  ⇒ the mesh is LATE, not gone.
            //     Keep the selection and the highlight, and retry.
            //   · the domain has forgotten it     ⇒ it really was removed (the
            //     undo-of-create case this branch was written for). Deselect.
            //
            // ⚠ THE RETRY IS BOUNDED AND SAYS SO WHEN IT GIVES UP. An unbounded
            // retry would hold a selection on an element that will never come back;
            // a silent give-up would restore the very ambiguity L-3531 removes.
            const attempt = this._reresolveRetry?.id === updatedId
                ? this._reresolveRetry.n
                : 0;
            const fate = decideReresolveFate({
                domainKnowsId:
                    bimElementRegistry.getStoreType(updatedId) !== undefined
                    || bimElementRegistry.getRoot(updatedId) !== undefined,
                attemptsSoFar: attempt,
                maxRetries: SelectionManager.RERESOLVE_MAX_RETRIES,
            });

            if (fate === 'retry') {
                this._reresolveRetry = { id: updatedId, n: attempt + 1 };
                setTimeout(
                    () => this._reresolveSelectionAfterRebuild(updatedId),
                    SelectionManager.RERESOLVE_RETRY_MS,
                );
                return; // selection + highlight SURVIVE
            }

            this._reresolveRetry = null;
            if (fate === 'deselect-orphan') {
                console.warn(
                    `[§SELECT-SURVIVES-THE-REBUILD] id=${updatedId} is still registered in `
                    + 'elementRegistry but no scene-attached mesh appeared after '
                    + `${SelectionManager.RERESOLVE_MAX_RETRIES} retries over `
                    + `~${SelectionManager.RERESOLVE_MAX_RETRIES * SelectionManager.RERESOLVE_RETRY_MS}ms `
                    + '— deselecting. This is an ORPHANED REGISTRATION (registered root, never '
                    + 'attached), not a normal removal.',
                );
                this.unselectAll('reresolve-timed-out-orphan-registration');
                return;
            }
            this.unselectAll('reresolve-element-removed-from-domain');
            return;
        }
        // Resolved — drop any in-flight retry budget for this id.
        this._reresolveRetry = null;

        const freshRoot = this.findSelectableRoot(fresh) ?? fresh;
        if (freshRoot === sel && this._isAttachedToScene(sel)) {
            // Same object reference AND still attached (builder reused the root
            // and only swapped children) — just refresh the highlight extents.
            this.applyHighlight(sel);
            // Re-attach the gizmo in case the guard above detached it.
            const elemType = (sel.userData?.elementType ?? sel.userData?.type ?? '').toLowerCase();
            if (elemType !== 'room') {
                this.transformControls.attach(sel);
                // §SELECT-GIZMO-REATTACH (L-961) — THE ROOT is that the line above
                // is not, on its own, a re-bind. For most element types the gizmo
                // does drive the root directly, but for the ones with a dedicated
                // controller it does NOT: a WALL's gizmo lives on
                // WallTransformController's invisible, wall-ALIGNED proxy, a
                // STAIR's on StairTransformController's, and a hosted door/window
                // is a 1-axis local-space binding configured by
                // HostedElementDragController. Those controllers re-bind on an
                // EVENT, and this branch emitted none — so every rebuild that
                // reused its root ripped the gizmo off the proxy onto the raw
                // group, silently dropping setSpace('local') and the wall's axis
                // alignment. The founder hit it by adding a window to a selected
                // wall, but MEASURED (SelectionManager.gizmoRebindOnRebuild
                // PROBE 3) it is EVERY wall rebuild — move, height, type, or a
                // neighbour's join — because WallFragmentBuilder keeps a
                // PERSISTENT root in `wallRoots` and registerRoot() is idempotent
                // on it, so a wall NEVER fires onRootSwapped and ALWAYS lands here.
                this._reanchorTransformControllers(sel);
            }
            return;
        }

        // Builder swapped in a brand-new root → re-select it. select() resets
        // selectedObject, re-applies highlight, re-attaches the gizmo, and
        // re-fires bim-selection-changed so the per-type controllers re-bind.
        //
        // NOTE — deliberately NO _reanchorTransformControllers() call on this arm.
        // select() already dispatches `bim-selection-changed`, which runs the same
        // wall/stair/endpoint/hosted activateFor() chain; re-anchoring here as well
        // would run it twice per rebuild.
        this.select(freshRoot);
    }

    /**
     * §SELECT-GIZMO-REATTACH (L-961) — tell the per-type transform controllers to
     * re-bind their gizmo to `obj` after a rebuild that REUSED the element's root.
     *
     * `pryzm-reanchor-transform` is the channel that already exists for exactly
     * this: `registerTransformDragHandler` subscribes it and re-runs
     * `wallTransformController` / `stairTransformController` /
     * `wallEndpointController` / `hostedDragController` `.activateFor(obj)`, which
     * is what re-seats a wall's oriented proxy and a hosted element's 1-axis
     * constraint. `LevelExplodeController._refreshSelectionAnchor()` emits the same
     * event for the same reason after an explode lift.
     *
     * It is emitted here rather than `bim-selection-changed` on purpose: this fires
     * on EVERY rebuild of the selected element, and `bim-selection-changed`
     * re-populates every property panel — which would make an edit-in-progress
     * (a value the architect is typing into the panel) churn on each rebuild.
     * `pryzm-reanchor-transform` moves the gizmo and nothing else, and that
     * distinction is stated in the explode controller's own comment.
     *
     * Never called with a detached object: both call sites have already proved
     * `_isAttachedToScene(obj)`. That matters — re-arming `activateFor()` on a
     * detached object is precisely what L-233 P4 found re-creating the per-frame
     * "must be a part of the scene graph" flood the guard exists to stop.
     */
    private _reanchorTransformControllers(obj: THREE.Object3D): void {
        try {
            (window as { runtime?: { events?: { emit?: (e: string, p: unknown) => void } } })
                .runtime?.events?.emit?.('pryzm-reanchor-transform', { object: obj });
        } catch (err) {
            // A controller that throws must never break re-resolution: the
            // selection and highlight above are already correct.
            console.warn('[SelectionManager] §SELECT-GIZMO-REATTACH re-anchor emit failed:', err);
        }
    }

    /**
     * §SELECT-GIZMO-REATTACH — resolve the live (scene-attached) Object3D that
     * currently carries `id`. Prefers the selectable cache (rebuilt lazily after
     * the rebuild event invalidated it) and falls back to a scene traversal.
     * Only returns objects that are actually attached to the scene graph so a
     * stale cache entry pointing at a disposed mesh is never returned.
     */
    private _resolveLiveObjectById(id: string): THREE.Object3D | null {
        this._ensureSelectableCache();
        if (this._selectableCache) {
            for (const obj of this._selectableCache) {
                if (obj.userData?.id === id && this._isAttachedToScene(obj)) return obj;
            }
        }
        let found: THREE.Object3D | null = null;
        try {
            const sceneRoot = this.world.scene?.three as THREE.Object3D | undefined;
            if (sceneRoot) {
                sceneRoot.traverse((obj) => {
                    if (!found && obj.userData?.id === id) found = obj;
                });
            }
        } catch (err) {
            console.warn('[SelectionManager.§SELECT-GIZMO-REATTACH] scene traversal error:', err);
        }
        return found;
    }

    setEnabled(enabled: boolean) {
        this.enabled = enabled;
        if (!enabled) {
            this.unselectAll('tool-activated-selection-disabled');
            // Reset hover cursor so it doesn't stay as 'pointer' while a tool is active
            this.domElement.style.cursor = '';
            this._lastHoveredUuid = null;
            this._lastHoveredObject = null;
            // §SELECT-3D-1 — mirror reset for the GPU-confirmed hover ref so a
            // stale tool-entry doesn't leak a pre-tool click target.
            this._lastHoveredObjectGpu = null;
            this._lastHoveredInstanceIdGpu = null;
            this._lastHoverConfirmedClientX = null;
            this._lastHoverConfirmedClientY = null;
            // §SELECT-TAB-CYCLE — clear cycle state on tool switch so the
            // architect can't TAB through stale candidates from before the
            // tool change.
            this._tabCycleCandidates    = null;
            this._tabCycleIndex         = 0;
            this._tabCycleAnchorClientX = null;
            this._tabCycleAnchorClientY = null;
        }
    }

    init() {
        // PERF-FIX-#6: Invalidate the selectable-objects cache whenever any BIM
        // element is added, updated, or removed. Covers all element types that can
        // appear in the scene so the cache never becomes stale. No other files need
        // to change — purely additive event listeners on the existing event bus.
        const invalidateSelectableCache = () => {
            this._selectableCache = null;
            // A16-T8: invalidate BVH in lock-step with the selectable cache.
            this._bvhQuery = null;
            this._objectRootIdCache.clear();
        };
        const cacheInvalidationEvents = [
            'bim-wall-added',     'bim-wall-removed',     'bim-wall-updated',
            'bim-slab-added',     'bim-slab-removed',     'bim-slab-updated',
            'bim-furniture-added','bim-furniture-removed','bim-furniture-updated',
            'bim-column-added',   'bim-column-removed',
            'bim-beam-added',     'bim-beam-removed',
            'bim-roof-added',     'bim-roof-removed',     'bim-roof-updated',
            'bim-plumbing-added', 'bim-plumbing-removed',
            'bim-curtainwall-added','bim-curtainwall-removed',
            'bim-stair-added',    'bim-stair-removed',
            // ⭐ §FIX-HANDRAIL-3D-PICK-CACHE (L-1190) — THE RAILING FAMILY HAS TWO KEYS,
            // AND THIS LIST WAS LISTENING ON THE DEAD ONE.
            //
            // This line used to read `'bim-railing-added', 'bim-railing-removed'`.
            // Measured 2026-08-19 across `packages/ apps/ plugins/ src/`:
            // `bim-railing-added` and `bim-railing-removed` have **ZERO emitters** —
            // nothing in this repository has ever dispatched either. The handrail family
            // emits `bim-handrail-added` / `-removed` / `-updated` (`HandrailStore.emit`,
            // ll.202-204) and `UpdateElementParameterCommand` emits `bim-handrail-updated`.
            // So the ONE listener whose job is to keep the pick caches honest for railings
            // was **UNSATISFIABLE BY CONSTRUCTION**, exactly like the `doorsRegistered=0`
            // counter in §PICKDIAG-CASING (L-1173): the instrument could never fire.
            //
            // ⛔ WHY THAT MAKES A HANDRAIL UNSELECTABLE IN 3D — the founder's report.
            // `_selectableCache` is built ONCE (lazily, on the first hover/click) and only
            // rebuilt when one of these events fires. Both 3-D pick paths read it and
            // NOTHING else: `_buildElementRegistry()` (the GPU pick's element registry —
            // an id absent here has no clone in the pick scene, so the pixel under the
            // cursor belongs to whatever is behind the railing) and `_rebuildBVHFromCache()`
            // (the ray-prune AABBs). A handrail DRAWN after that first hover therefore
            // never entered either structure, and no railing event could invalidate it —
            // the click resolved to the slab/stair underneath, or to nothing. Plan view and
            // the browser tree select by id and bypass both caches, which is why the
            // property panel could still show HR046 while the 3-D click could not reach it.
            //
            // `-updated` is listed too, and is NOT redundant: `HandrailFragmentBuilder`
            // disposes and rebuilds the root's CHILDREN on every retype/edit while keeping
            // the root object. The cached BVH AABB is captured from the OLD children, so
            // after a type change the ray can miss a stale box and prune the railing out.
            // (The `-updated` keys on wall/slab/roof/ceiling/floor/furniture exist for the
            // same reason; railing was simply never given one.)
            'bim-handrail-added', 'bim-handrail-removed', 'bim-handrail-updated',
            'bim-door-added',     'bim-door-removed',
            'bim-window-added',   'bim-window-removed',
            'bim-ceiling-added',  'bim-ceiling-removed',  'bim-ceiling-updated',
            'bim-floor-added',    'bim-floor-removed',    'bim-floor-updated',
            'bim-lighting-added', 'bim-lighting-removed', 'bim-lighting-updated', 'bim-lighting-placed',
            'pryzm-ifc-imported', 'pryzm-ifc-tree-updated', 'pryzm-ifc-element-removed',
            // §21-VR-4: Underlay state changes — when a view is activated/closed
            // UnderlayRenderService sets userData.underlayActive on ghost elements.
            // Invalidate the cache so the next click rebuilds it without those objects.
            'view-selected',      'view-closed',
        ];
        cacheInvalidationEvents.forEach(evt =>
            window.addEventListener(evt, invalidateSelectableCache)
        );

        // ── ⭐ §FIX-PICK-CACHE-STORE-BUS (L-1194) — STOP ENUMERATING FAMILIES ─────
        //
        // The list above is a HAND-WRITTEN LITERAL of DOM event names, and a family
        // missing from it is UNPICKABLE IN 3-D until some unrelated element changes
        // (L-1190). Fixing that per family is the "enumerated arms" defect this repo
        // keeps paying for — the same shape as the shadow-freeze literal (L-1189) and
        // the delete census. The literal cannot be kept true, because it is keyed on a
        // vocabulary that stores are actively LEAVING:
        //
        //   · `bim-railing-added` / `-removed` — ZERO emitters (L-1190, fixed above).
        //   · `bim-column-added` / `-removed`  — ZERO emitters. `ColumnStore` states it
        //     outright: *"ColumnStore deliberately does NOT dispatch a legacy `bim-column-*`
        //     DOM CustomEvent (§COLUMN-SYSTEM-AUDIT-2026 §M14 — no dual-channel drift
        //     surface). All consumers must subscribe via subscribe() or storeEventBus."*
        //     This listener is one of the consumers that did not get the message.
        //   · `bim-beam-added` / `-removed`    — ZERO emitters. `BeamStore` publishes to
        //     `storeEventBus` only (BeamStore.ts:91/144/158/308).
        //
        // So a COLUMN and a BEAM have had the handrail defect all along, and every store
        // that migrates off the DOM channel silently acquires it next. Those literals are
        // left in place (a no-op listener costs nothing) but they are NOT the coverage.
        //
        // ⭐ `storeEventBus` IS the family-agnostic authority: §3.5 of the Master
        // Architecture Contract requires EVERY ElementStore to publish create/update/delete
        // through it, and it guarantees no drops and ordered delivery. One subscription
        // therefore covers every family that exists today AND every family added later,
        // with nothing to keep in sync. Invalidation is O(1) — three field writes — and the
        // rebuild stays lazy, so a 3,000-element import costs 3,000 null-writes and exactly
        // one traversal at the next click, which is what the wall/slab entries above
        // already cost.
        //
        // Not unsubscribed: `init()` runs once per process (its FrameScheduler tick
        // listener registers under a fixed id and throws on a second call), and this class
        // has no dispose path to hang an unsubscribe on.
        storeEventBus.subscribe(invalidateSelectableCache);

        // §SELECT-INSTANCED-PICK (FIX #3) — clear the hover-confirmed click anchor
        // whenever the split-view 3D pane opens/closes. The runtime EventBus
        // (DOMEventBus during migration) dispatches these as window CustomEvents,
        // so the existing window.addEventListener pattern reaches them. Without this,
        // `_lastHoverConfirmedClientX/Y` keep stale pre-pane coords and the first
        // main-canvas click after the layout change snaps to the wrong element
        // (§SELECT-SVP3D-ANCHOR-SKIP).
        window.addEventListener('split-view-activated',   () => this.clearHoverAnchor());
        window.addEventListener('split-view-deactivated', () => this.clearHoverAnchor());

        // ── §SELECT-GIZMO-REATTACH — re-bind the gizmo + selection on rebuild ──
        // When a selected element is MOVED / UNDONE / re-created, its mesh is
        // disposed and rebuilt: the old Object3D is removed from the scene graph
        // and a NEW group (same userData.id) is added. The TransformControls
        // gizmo (and `selectedObject`) still point at the now-DETACHED old mesh,
        // so THREE.TransformControls.updateMatrixWorld throws "The attached 3D
        // object must be a part of the scene graph" on EVERY render frame
        // (logged 156×/19×/425× in the field) — wedging the interaction loop so
        // subsequent clicks no longer resolve / select anything.
        //
        // Listening to the per-type `bim-<type>-updated` events (emitted by every
        // builder after it swaps the mesh) lets us, for the SELECTED element only,
        // re-resolve the current Object3D by id and re-attach the gizmo to the new
        // mesh (or detach + unselect if the element is gone). These run AFTER the
        // cache-invalidation listeners registered above (same event, registration
        // order preserved by the DOM), so _resolveLiveObjectById() rebuilds the
        // selectable cache fresh and returns the NEW mesh. Deferred via
        // setTimeout(0) so the builder's own scene.add() has completed first.
        const rebuiltEventToType: Record<string, string> = {
            'bim-wall-updated':        'wall',
            'bim-door-updated':        'door',
            'bim-window-updated':      'window',
            'bim-slab-updated':        'slab',
            'bim-roof-updated':        'roof',
            'bim-ceiling-updated':     'ceiling',
            'bim-floor-updated':       'floor',
            'bim-column-updated':      'column',
            'bim-beam-updated':        'beam',
            'bim-stair-updated':       'stair',
            // §FIX-HANDRAIL-3D-PICK-CACHE (L-1190) — the REAL key the handrail family
            // rebuilds under. `bim-railing-updated` below IS emitted (exactly once, by
            // registerTransformDragHandler's no-baseline snap-back) so it stays; but it
            // was the ONLY railing entry here, which meant a handrail whose mesh was
            // rebuilt by a type change or a property edit never re-bound its gizmo — the
            // §SELECT-GIZMO-REATTACH crash-and-wedge this table exists to prevent.
            'bim-handrail-updated':    'handrail',
            'bim-railing-updated':     'railing',
            'bim-curtainwall-updated': 'curtainwall',
            'bim-plumbing-updated':    'plumbing',
            'bim-lighting-updated':    'lighting',
            'bim-furniture-updated':   'furniture',
        };
        const extractRebuiltId = (e: Event, type: string): string | null => {
            const detail = (e as CustomEvent).detail as Record<string, unknown> | undefined;
            if (!detail) return null;
            // Builders emit either { id } (door/window/wall/…) or a nested
            // { <type>: { id } } payload (furniture-style). Accept both.
            const direct = detail.id;
            if (typeof direct === 'string') return direct;
            const nested = detail[type] as { id?: unknown } | undefined;
            if (nested && typeof nested.id === 'string') return nested.id;
            return null;
        };
        for (const [evt, type] of Object.entries(rebuiltEventToType)) {
            window.addEventListener(evt, (e) => {
                if (!this.selectedObject) return;
                const updatedId = extractRebuiltId(e, type);
                if (!updatedId || this.selectedObject.userData?.id !== updatedId) return;
                // Defer so the builder's scene.remove(old) + scene.add(new) has
                // settled before we re-resolve the live Object3D for this id.
                setTimeout(() => this._reresolveSelectionAfterRebuild(updatedId), 0);
            });
        }

        // ── §FIX-STAIR-SELECTION-REBIND / §FIX-ELEMENT-REBIND-ON-ROOT-SWAP ────
        //
        // INVARIANT: `selectedObject`, the highlight overlay and the pick caches
        // must always reference the element's LIVE scene root — never a root a
        // builder has swapped out. The `bim-<type>-updated` listeners above only
        // uphold that when a rebuild happens to emit its store event. They cannot
        // uphold it for rebuild paths that swap the mesh WITHOUT a store write:
        // `GenerateStairGeometryCommand` reconciles the derived fields and then
        // calls `stairMeshBuilder.updateStair()` DIRECTLY (it emits only
        // `bim-stair-geometry-updated`, which nothing here subscribes to), so after
        // a stair WIDTH edit the purple highlight kept cloning the OLD, disposed
        // group's BufferGeometry — the founder's stale-outline-at-the-old-width.
        // Whitelisting one more event would only move the hole (same failure class
        // as L-233's incomplete allowlist).
        //
        // `elementRegistry.registerRoot()` is the ONE call EVERY builder makes on
        // EVERY swap, so subscribing to it makes the guarantee hold by construction
        // for every element type — wall, slab, floor, ceiling, column, beam, stair,
        // lift, curtain-wall, door, window, roof, plumbing, furniture, lighting —
        // and for future types, with no list to fall out of.
        //
        // Cache invalidation is unconditional: a swapped-out root must never remain
        // a raycast/BVH candidate (`bim-stair-updated`, `bim-door-updated`,
        // `bim-window-updated`, `bim-column/beam/curtainwall/plumbing-updated` are
        // all absent from `cacheInvalidationEvents` above, so before this the pick
        // caches held DETACHED roots after any such rebuild).
        this._rootSwapUnsub?.();
        this._rootSwapUnsub = bimElementRegistry.onRootSwapped((swappedId) => {
            invalidateSelectableCache();
            if (!this.selectedObject) return;
            if (this.selectedObject.userData?.id !== swappedId) return;
            // Builders register the root BEFORE scene.add(); defer so the new root
            // is attached by the time we re-resolve it.
            setTimeout(() => this._reresolveSelectionAfterRebuild(swappedId), 0);
        });

        // ── Selection highlight refresh on geometry rebuild ───────────────
        // (Folded into the §SELECT-GIZMO-REATTACH `bim-furniture-updated`
        // handler above: FurnitureFragmentBuilder.updateFurniture() reuses the
        // same root Object3D and only swaps its children, so the cached
        // `highlightMesh` would otherwise point at stale extents after a
        // property-panel resize. `_reresolveSelectionAfterRebuild()` re-applies
        // the highlight on the reused-and-still-attached root — same effect as
        // the old dedicated listener, now unified for every element type.)

        // F.events.4 — DOM listener removed. engineLauncher.ts wires
        // runtime.events.on('pryzm-element-selected', ...) → selectById() after initTools().

        // PERF-FIX-#5: Configure raycaster thresholds once on init rather than
        // resetting them on every click inside performSelection.
        this._raycaster.layers.set(BIM_LAYER);
        this._raycaster.params.Line!.threshold = 0.1;
        this._raycaster.params.Points!.threshold = 0.1;

        window.addEventListener('keydown', (e) => {
            // ── E3: Delete handler — routed through CommandBus for undo stack ──
            // Opening and lighting used to go through legacy commandManager.execute()
            // directly, bypassing the undo stack.  Now the bus is the primary path:
            //   keydown Delete → bus.executeCommand('element.delete', {elementId, elementType})
            //     → DeleteElementHandler (plugins/view) → correct specialised command
            //       → commandManager.execute(DeleteOpeningCommand | DeleteLightingCommand)
            // The legacy commandManager path is retained as a fallback for the narrow
            // window when the runtime bus hasn't been wired yet (e.g. early boot).
            if (e.key === 'Delete' && this.selectedObject && this.enabled) {
                const type = (this.selectedObject.userData.elementType || this.selectedObject.userData.type || '').toLowerCase();
                const id   = this.selectedObject.userData.id as string | undefined;
                if ((type === 'opening' || type === 'lighting') && id) {
                    const bus = window.runtime?.bus;
                    if (bus) {
                        // Primary: dispatch through CommandBus — participates in undo stack.
                        (bus.executeCommand('element.delete', {
                            elementId:   id,
                            elementType: type,
                            source:      'user',
                        }) as Promise<unknown>).catch((err: unknown) =>
                            console.error('[SelectionManager] element.delete bus failed:', err),
                        );
                    } else {
                        // Fallback: legacy path when bus is not yet initialised.
                        const commandManager = window.commandManager; // TODO(TASK-06)
                        if (commandManager) {
                            if (type === 'opening') commandManager.execute(new DeleteOpeningCommand(id));
                            else                    commandManager.execute(new DeleteLightingCommand(id));
                        }
                    }
                    this.unselectAll('delete-key');
                }
            }

            // §SELECT-TAB-CYCLE (DAILY-USE 2026-05-21) — Generic cycle
            // through overlapping selection candidates (Revit / SketchUp /
            // ArchiCAD convention). Runs FIRST so the universal click-anchor
            // cycle is always reachable for non-CW/non-kitchen/non-wardrobe
            // element types. The special-case CW/kitchen/wardrobe Tab cases
            // below take precedence only when the architect's CURRENT
            // selection is one of those special types (they take the same
            // e.preventDefault() so the page focus never moves).
            if (e.key === 'Tab' && this.enabled && this._tabCycleCandidates !== null
                && this._tabCycleCandidates.length > 1
                && this._tabCycleAnchorClientX !== null
                && this._tabCycleAnchorClientY !== null) {
                // Anchor check: only cycle while the cursor is still close
                // to where the click captured the candidates. Past that
                // radius the architect has moved on; the next click will
                // re-enumerate from the new position.
                // _lastHoverConfirmedClientX/Y is updated by the GPU hover
                // rAF (most recent confirmed cursor position); falls back
                // to event.clientX/Y when the rAF hasn't fired yet.
                const cx = this._lastHoverConfirmedClientX
                    ?? (e as KeyboardEvent & { clientX?: number }).clientX
                    ?? this._tabCycleAnchorClientX;
                const cy = this._lastHoverConfirmedClientY
                    ?? (e as KeyboardEvent & { clientY?: number }).clientY
                    ?? this._tabCycleAnchorClientY;
                const dx = cx - this._tabCycleAnchorClientX;
                const dy = cy - this._tabCycleAnchorClientY;
                const dist2 = dx * dx + dy * dy;
                const r2 = SelectionManager.TAB_CYCLE_ANCHOR_PX * SelectionManager.TAB_CYCLE_ANCHOR_PX;
                if (dist2 <= r2) {
                    // Don't fire when the special-case CW/kitchen/wardrobe
                    // sub-element cycle owns the current selection — they
                    // have richer cycle semantics (sub-element drilling).
                    const selType = this.selectedObject
                        ? (this.selectedObject.userData?.type
                            || this.selectedObject.userData?.elementType
                            || '').toLowerCase()
                        : '';
                    const selIsCW = selType === 'curtain-wall' || selType === 'curtainwall';
                    const selIsKitchenOrWardrobe = this.selectedObject
                        ? (this.isKitchenFurniture(this.selectedObject)
                            || this.isWardrobeFurniture(this.selectedObject))
                        : false;
                    if (!selIsCW && !selIsKitchenOrWardrobe) {
                        e.preventDefault();
                        // Shift+TAB cycles backward; TAB cycles forward.
                        const n = this._tabCycleCandidates.length;
                        const delta = e.shiftKey ? -1 : 1;
                        this._tabCycleIndex = (this._tabCycleIndex + delta + n) % n;
                        const next = this._tabCycleCandidates[this._tabCycleIndex];
                        if (next) {
                            console.log(
                                `[SelectionManager] §SELECT-TAB-CYCLE cycle ` +
                                `${this._tabCycleIndex + 1}/${n} → ` +
                                `id=${(next.userData?.id ?? next.uuid)} ` +
                                `type=${next.userData?.elementType ?? '?'}`,
                            );
                            window.__curtainSubElement = null;
                            this.resetSubElementState();
                            this.select(next);
                        }
                        return;
                    }
                }
            }

            // ── Tab key — cycle through CW sub-elements ────────────────────
            // Only fires when a curtain wall is the current selected object.
            // Tab cycles: parent CW → panel[0] → panel[1] → … → mullion[0] → … → parent CW
            if (e.key === 'Tab' && this.enabled && this.selectedObject) {
                const selType = (
                    this.selectedObject.userData?.type ||
                    this.selectedObject.userData?.elementType || ''
                ).toLowerCase();
                const selIsCW = selType === 'curtain-wall' || selType === 'curtainwall';

                if (selIsCW) {
                    e.preventDefault(); // don't focus-trap the page
                    this.cycleSubElement(this.selectedObject);
                }

                // ── Tab key — cycle through kitchen units ─────────────────
                if (this.isKitchenFurniture(this.selectedObject)) {
                    e.preventDefault();
                    this.cycleKitchenUnit(this.selectedObject);
                }

                // ── Tab key — cycle through wardrobe units (§16 §2.6) ──────
                if (this.isWardrobeFurniture(this.selectedObject)) {
                    e.preventDefault();
                    this.cycleWardrobeUnit(this.selectedObject);
                }
            }

            // ── Escape key — deselect or go back to parent CW view ────────
            if (e.key === 'Escape') {
                // §SELECT-STUCK-STATE-SELFHEAL — Escape is the universal "un-stick"
                // key: always clear stale interaction flags so selection can never
                // stay permanently wedged, even if SelectionManager is disabled by
                // an active tool that itself got stuck.
                this._healStuckInteractionState('escape-key');
            }
            if (e.key === 'Escape' && this.enabled) {
                if (this.selectedObject) {
                    const selType = (
                        this.selectedObject.userData?.type ||
                        this.selectedObject.userData?.elementType || ''
                    ).toLowerCase();
                    const selIsCW = selType === 'curtain-wall' || selType === 'curtainwall';

                    if (selIsCW && this.cwSubElementIndex >= 0) {
                        // Step back: from sub-element view to parent CW view
                        this.resetSubElementState();
                        window.__curtainSubElement = null;
                        this.updateInspector(this.selectedObject);
                    } else {
                        // Global deselect for all other element types (wall, slab,
                        // furniture, door, window, curtain wall parent, etc.).
                        // Prefer the EngineBootstrap wrapper (window.unselectAll) so that
                        // the property panel and view-properties panel are also hidden.
                        // Falls back to this.unselectAll() if the wrapper isn't set yet.
                        const globalUnselect = window.unselectAll;
                        if (typeof globalUnselect === 'function') {
                            globalUnselect();
                        } else {
                            this.unselectAll('escape-key');
                        }
                        // §MULTI-SELECT-SHIFT (L-1550) — Escape clears the whole SET.
                        // `unselectAll()` drops `selectedObject` (the primary) and the
                        // secondary marquee highlights, but the BUS is what every other
                        // surface reads, and it was left holding the ids. Guarded so it
                        // is a no-op when the wrapper above already cleared the bus.
                        if (!selectionBus.isDispatching && selectionBus.currentIds.length > 0) {
                            selectionBus.clearAll('3d-canvas');
                        }
                    }
                }
            }
        });

        this.transformControls.addEventListener('dragging-changed', (e: any) => {
            this.isTransforming = !!e.value;

            // Handle hosted movement when dragging ends
            if (!this.isTransforming && this.selectedObject) {
                this.syncHostedElements(this.selectedObject);
            }
        });

        this.transformControls.addEventListener('change', () => {
            if (this.isTransforming && this.selectedObject) {
                this.syncHostedElements(this.selectedObject);
            }
        });

        // ── Primary click-selection trigger ────────────────────────────────────
        // The browser 'click' event is the MOST RELIABLE selection trigger:
        //   • The browser only fires it when press + release occurred without
        //     significant pointer movement — exactly what we need for selection.
        //   • Camera controls (CameraControls.js) use pointerdown/pointermove/
        //     pointerup for orbit/pan and may call setPointerCapture(), which
        //     causes the pointerdown→pointerup timing check to silently fail
        //     (touchStartTime stays near 0 so duration > TOUCH_THRESHOLD).
        //   • 'click' is a separate synthetic event and is NOT affected by
        //     setPointerCapture or camera control event handling.
        //   • Only fires for left-button (button === 0) by browser spec.
        this.domElement.addEventListener('click', (e) => {
            if ((e as MouseEvent).button !== 0) return; // left button only
            this.performSelection(e as MouseEvent);
        });

        // ── Double-click on a slab: DEPRECATED profile-edit trigger ─────────
        // §EDIT-PROFILE / §98 (2026-05-22): the architect's directive is
        // "double-click in general should zoom to the object", and slab profile
        // editing now lives on the contextual edit toolbar ("Edit Profile"
        // button + `P` shortcut, ContextualEditBar). Previously this handler
        // raycast slabs and called `e.preventDefault()` → SlabTool.enterProfileEditMode,
        // which SUPPRESSED the initUI double-click-zoom for slabs (the one
        // element type that didn't zoom). Removing it lets the initUI dblclick
        // handler frame the camera on a slab like every other element. The
        // `_onSlabProfileEdit` callback + SlabTool.enterProfileEditMode remain
        // the single profile-edit entry point, now invoked from the toolbar.
        // (Intentionally no dblclick listener here.)

        // ── Touch / pointer fallback ────────────────────────────────────────
        // Keep the pointerdown+pointerup timing as a secondary path for touch
        // devices where 'click' may not reliably fire on canvas elements.
        // On desktop (where 'click' fires), both may run — performSelection
        // is idempotent so a double-call on the same frame is harmless.
        this.domElement.addEventListener('pointerdown', (e) => {
            this.touchStartTime = Date.now();
            // §SELECT-STUCK-STATE-SELFHEAL — start a fresh gesture: remember where
            // the press began and assume it is a click until the pointer moves far
            // enough to count as a drag (set in the pointermove handler below).
            const pe = e as PointerEvent;
            this._pointerDownClientX = pe.clientX;
            this._pointerDownClientY = pe.clientY;
            this._pointerDraggedThisGesture = false;
        });

        this.domElement.addEventListener('pointerup', (e) => {
            // Only use this fallback on touch input (pointerType !== 'mouse').
            // On mouse input the 'click' handler above is the primary path.
            if ((e as PointerEvent).pointerType === 'mouse') return;
            const duration = Date.now() - this.touchStartTime;
            if (duration < this.TOUCH_THRESHOLD) {
                this.performSelection(e);
            }
        });

        // ── Enter key: confirm selection of hovered element ────────────────
        // When an element is highlighted (blue outline on hover) and the user
        // presses Enter, select it — useful for trackpad/accessibility or when
        // mouse click events are unreliable.
        window.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key !== 'Enter') return;
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (!this.enabled) return;
            if (this._lastHoveredObject) {
                const obj = this._lastHoveredObject;
                if (this.isCurtainWallGroup(obj)) {
                    if (this.selectedObject === obj) {
                        // Already selected — no-op on Enter (Tab cycles sub-elements)
                    } else {
                        window.__curtainSubElement = null;
                        this.resetSubElementState();
                        this.select(obj);
                    }
                } else {
                    window.__curtainSubElement = null;
                    this.resetSubElementState();
                    this.select(obj);
                }
                console.log('[SelectionManager] Enter key — selected hovered element:', obj.userData?.id ?? obj.uuid);
            }
        });

        // A2: Hover detection — throttled raycasting dispatches 'bim-hover-changed'
        // so the TSL OutlinePass can show the pulsing blue hover outline.
        this.domElement.addEventListener('pointermove', (e) => this._onPointerMove(e));

        // ── §SELECT-GIZMO-REATTACH — per-frame gizmo liveness guard ───────────
        // Belt-and-suspenders for the event-driven re-attach above: if a rebuild
        // detached the gizmo's target without firing a `bim-<type>-updated` event
        // (external scene clear / snapshot reload), or in the 1-tick window before
        // the deferred re-resolve runs, this `pre-render` tick detaches the gizmo
        // BEFORE THREE traverses the helper — preventing the per-frame
        // "must be a part of the scene graph" throw flood at its source.
        // O(depth) when a gizmo is attached, a single null-check otherwise.
        getFrameScheduler().addTickListener(
            'selection-manager-gizmo-liveness-guard',
            () => { this.guardTransformControlsAttachment(); },
            'pre-render',
        );
    }

    private syncHostedElements(_parent: THREE.Object3D) {
        // Spatial Hardening: Eliminated mesh.position.copy.
        // Hosted elements are now reprojected semantically via WallFragmentBuilder or SpatialAuthority listeners.
    }

    private findSelectableRoot(obj: THREE.Object3D): THREE.Object3D | null {
        let curr: THREE.Object3D | null = obj;

        // BUG-04: InstancedElementRenderer groups have no userData.id and their
        // elementType ('InstancedElement') is not in SEMANTIC_TYPES, so the
        // standard while-loop below would return null.  Return the IM itself so
        // the BVH hit path can resolve hit.instanceId → element ID via
        // getInstanceElementId(), enabling per-instance selection.
        if (obj.userData?.isInstancedGroup === true) {
            return obj;
        }

        // 🔒 PHASE 4: Normalize selection to semantic root
        // If it's a sub-element fragment (geometry, mullion, panel, etc.),
        // jump straight to its semantic parent via parentId.
        if (this.PARENT_RESOLVED_ROLES.includes(obj.userData.role) && obj.userData.parentId) {
            let rootSearch: THREE.Object3D | null = obj.parent;
            while (rootSearch) {
                if (rootSearch.userData?.id === obj.userData.parentId) {
                    return rootSearch;
                }
                rootSearch = rootSearch.parent;
            }
        }

        // Fallback to standard traversal for non-fragment elements
        while (curr) {
            // Check if this is a semantic root (has id and valid type)
            const type = (curr.userData?.elementType || curr.userData?.type || '').toLowerCase();
            if (curr.userData?.id && (this.isSemanticType(type) || type === 'slab')) {
                return curr;
            }
            curr = curr.parent;
        }

        // If we didn't find a semantic root, check if the clicked object itself
        // is selectable (for backwards compatibility with non-semantic objects)
        const type = (obj.userData?.elementType || obj.userData?.type || '').toLowerCase();
        if (obj.userData?.selectable && !this.isFragmentType(type)) {
            return obj;
        }

        return null;
    }

    private isSemanticType(type: string): boolean {
        return this.SEMANTIC_TYPES.includes(type.toLowerCase());
    }

    private isFragmentType(type: string): boolean {
        const fragmentTypes = [
            'wall-fragment', 'window-part', 'door-part',
            'opening', 'geometry', 'fragment', 'opening-fragment'
        ];
        return fragmentTypes.includes(type.toLowerCase());
    }

    private isCurtainWallGroup(obj: THREE.Object3D): boolean {
        const t = (obj.userData?.type || obj.userData?.elementType || '').toLowerCase();
        return t === 'curtain-wall' || t === 'curtainwall';
    }

    private performSelection(event: MouseEvent | PointerEvent) {
        if (!this.enabled) return;

        // ── §SELECT-STUCK-STATE-SELFHEAL — self-healing interaction guards ─────
        // The `isTransforming` and `window.isCameraDragging` flags gate selection
        // so a click that merely ends an orbit / gizmo drag doesn't mis-select.
        // But both are cleared by EVENTS that can be MISSED (a programmatic
        // dblclick-zoom `setLookAt(...,true)` fires `controlstart` but not always a
        // matching `rest`; a TransformControls drag whose `dragging-changed:false`
        // is dropped when the pointer leaves the canvas), leaving the flag stuck
        // TRUE so EVERY later click is swallowed with no recovery — the founder's
        // "after a double-click nothing selects" lockup.
        //
        // A browser `click` only fires after press+release WITHOUT a real drag, so
        // if a flag is set but THIS gesture did not actually drag (and the gizmo is
        // not LIVE-dragging per transformControls.dragging), the flag is STALE.
        // Heal it and proceed instead of returning forever. The gizmo's own live
        // `.dragging` boolean is the authoritative transform signal — if it is
        // genuinely dragging we still bail (a real drag-release click).
        const gizmoLiveDragging =
            (this.transformControls as { dragging?: boolean }).dragging === true;
        // Consume the per-gesture drag flag for THIS click and reset it so a later
        // click that arrives without a preceding canvas pointerdown (e.g. a
        // forwarded split-view click) defaults to "not dragged" and can never stay
        // wedged on a stale `true`.
        const userDraggedThisGesture = this._pointerDraggedThisGesture;
        this._pointerDraggedThisGesture = false;
        this._pointerDownClientX = null;
        this._pointerDownClientY = null;

        if (this.isTransforming && !gizmoLiveDragging) {
            bumpPerf(PERF_KEYS.SELECT_SELFHEAL);
            console.warn('[SelectionManager] §SELECT-STUCK-STATE-SELFHEAL stale isTransforming cleared (no live gizmo drag) — selection un-wedged');
            this.isTransforming = false;
        }
        if (window.isCameraDragging && !userDraggedThisGesture) {
            bumpPerf(PERF_KEYS.SELECT_SELFHEAL);
            console.warn('[SelectionManager] §SELECT-STUCK-STATE-SELFHEAL stale isCameraDragging cleared (click without a real pointer drag) — selection un-wedged');
            window.isCameraDragging = false;
        }

        // After healing, re-evaluate: only bail when a transform/orbit is GENUINELY
        // in progress for this gesture (a real drag-release click that should not
        // select). Otherwise fall through and select normally.
        if (gizmoLiveDragging || this.isTransforming) return;
        if (window.isCameraDragging && userDraggedThisGesture) return;

        // §MULTI-SELECT-SHIFT (L-1550) — latch the modifier for THIS gesture, AFTER
        // the drag/transform guards above (a click that merely ended an orbit must
        // not leave the latch armed) and BEFORE the first `select()` branch, so all
        // five of them inherit the same answer. Cleared in the `finally` below, so a
        // `select()` called from anywhere else can never inherit a stale latch.
        // `MarqueeSelectionTool` claims SHIFT+DRAG and explicitly declines to consume
        // a SHIFT+click that never crossed its 4 px threshold ("Shift+click still
        // propagates normally"), so the two do not collide: drag → marquee, click → this.
        this._additivePick = (event as { shiftKey?: boolean }).shiftKey === true;

        // MEDIUM-4: OTel span covering the full pick-to-select pipeline.
        // Attributes are set before the span ends so Honeycomb/Jaeger can
        // show strategy + hit outcome without needing a second query.
        const _pickSpan = startSpan('pryzm.selection.pick', {
            'pryzm.selection.strategy': this._pickStrategy?.id ?? 'none',
            'pryzm.selection.additive': this._additivePick,
        });

        try {

        const rect = this.domElement.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // PERF-FIX-#5: Reuse the instance-level Vector2 instead of allocating a new one.
        this._mouse.set(
            (x / rect.width) * 2 - 1,
            -(y / rect.height) * 2 + 1
        );

        // PERF-FIX-#5: Reuse the instance-level Raycaster (thresholds set once in init()).
        this._raycaster.setFromCamera(this._mouse, this.camera.three);

        // ── FIX-S16-ANCHOR: honour the hover-confirmed GPU result ─────────────────
        // When the cursor is within CLICK_HOVER_SNAP_PX of the last position at
        // which the GPU hover rAF reported a definite hit, skip a fresh GPU pick and
        // use _lastHoveredObject directly.  This eliminates two failure modes:
        //   a) Z-fighting at wall seam pixels makes the fresh GPU pick return the
        //      wall BEHIND the one shown by the hover outline (Root Cause 1).
        //   b) The ~50 ms + 1-frame lag between the hover rAF and the click event
        //      means the fresh GPU pick uses a cursor position that may have drifted
        //      across a wall boundary (Root Cause 2).
        // The snap radius (8 CSS px) is large enough to absorb normal hand tremor on
        // click but small enough that precise boundary clicks still work — the GPU
        // hover rAF will have settled on the correct element before the user clicks.
        // Following the SelectionTool principle: the hover hitTest is the authoritative
        // source; the click honours it rather than running a competing independent pick.
        const CLICK_HOVER_SNAP_PX = 8;
        // §SELECT-3D-1 (DAILY-USE 2026-05-20) — Use the GPU-CONFIRMED hover
        // target (`_lastHoveredObjectGpu`), not the BVH-derived
        // `_lastHoveredObject`. The GPU pick is pixel-accurate at any camera
        // distance; the BVH raycast can hit a different element when many
        // AABBs overlap on a single screen pixel at far zoom. Falls back to
        // the BVH ref only when the GPU pick strategy is unavailable (legacy
        // boot path / WebGL2 disabled), preserving previous behaviour there.
        const _anchorTarget = this._lastHoveredObjectGpu ?? (this._pickStrategy ? null : this._lastHoveredObject);
        // §SELECT-SVP3D-ANCHOR-SKIP — a click SYNTHESISED by the split-view 3D pane
        // (SplitViewManager._forward3dClickToMain) carries `__pryzmForwarded`. While
        // the cursor was over the SVP pane the MAIN canvas received no hover rAF, so
        // `_lastHoveredObjectGpu` / `_lastHoverConfirmedClient*` are STALE — they hold
        // the last element hovered/selected on the main canvas. Honouring the anchor
        // here makes a forwarded click "snap back" to that stale element (the
        // architect's "selection reverts to the latest selected"). Skip the anchor
        // for forwarded clicks so they always run a fresh pick at the forwarded point.
        const _isForwarded = (event as { __pryzmForwarded?: boolean }).__pryzmForwarded === true;
        if (
            !_isForwarded &&
            _anchorTarget !== null &&
            // §SELECT-INSTANCED-PICK (FIX #3) — liveness guard: skip (and clear) the
            // anchor when the GPU-confirmed hover target was removed from the scene
            // (e.g. element deleted, or stale across a split-view layout change), so
            // the click never resolves a dangling element.
            !this._anchorTargetIsStale() &&
            this._lastHoverConfirmedClientX !== null &&
            this._lastHoverConfirmedClientY !== null
        ) {
            const dx = event.clientX - this._lastHoverConfirmedClientX;
            const dy = event.clientY - this._lastHoverConfirmedClientY;
            if (dx * dx + dy * dy <= CLICK_HOVER_SNAP_PX * CLICK_HOVER_SNAP_PX) {
                const resolvedRoot = this.findSelectableRoot(_anchorTarget) ?? _anchorTarget;
                // §SELECT-INSTANCED-FURNITURE-PICK — if the GPU-confirmed hover target is
                // an instanced group, carry the per-instance element id captured at hover
                // time so the anchored click selects THAT instance, not the whole group.
                const anchorInstanceOverride =
                    resolvedRoot.userData?.isInstancedGroup === true
                        ? this._lastHoveredInstanceIdGpu ?? undefined
                        : undefined;
                // Dispatch bim-canvas-world-click via level-plane intersection
                // (no depth buffer available on this fast path).
                const levelY  = window.activeLevelElevation ?? 0;
                const levelPl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -levelY);
                const worldPt = new THREE.Vector3();
                this._raycaster.ray.intersectPlane(levelPl, worldPt);
                window.dispatchEvent(new CustomEvent('bim-canvas-world-click', { // TODO(TASK-11)
                    detail: {
                        worldPoint:  { x: worldPt.x, y: worldPt.y, z: worldPt.z },
                        elementId:   anchorInstanceOverride ?? resolvedRoot.userData?.id ?? null,
                        elementType: resolvedRoot.userData?.elementType ?? resolvedRoot.userData?.type ?? null,
                    },
                }));
                console.log(`[PickResolver] hover-anchor hit=${anchorInstanceOverride ?? resolvedRoot.userData?.id ?? resolvedRoot.uuid}`);
                _pickSpan.setAttribute('pryzm.selection.strategy', 'hover-anchor');
                _pickSpan.setAttribute('pryzm.selection.hit', true);
                window.__curtainSubElement = null;
                this.resetSubElementState();
                this.select(resolvedRoot, anchorInstanceOverride);
                return;
            }
        }
        // ── End FIX-S16-ANCHOR ───────────────────────────────────────────────────

        // PERF-FIX-#6: Build the candidates list from cache instead of traversing the
        // full scene graph on every click. The cache is invalidated by BIM mutation events
        // registered in init(), so it stays consistent with the scene at all times.
        // BUG-10: Extracted to _ensureSelectableCache() — single canonical path.
        this._ensureSelectableCache();

        // ── Wave 36 U-2 (A16-T8 completion, C04 §3.2): GPU pick probe ───────────
        // If a PickStrategy was injected (GPU path resolved at boot in initTools),
        // attempt a GPU pick BEFORE the BVH+raycaster path.  GPU pick is O(1) —
        // single framebuffer pixel read vs O(n·triangles) CPU raycast.
        // On GPU miss (background click) or unavailable strategy → fall through to BVH.
        //
        // CRITICAL FIX (F-NEW): Force-propagate all pending world-matrix updates
        // before the GPU pick render.  Three.js renderer does this at the start of
        // every render frame via scene.updateMatrixWorld().  Batch-created elements
        // (e.g. CreateCurtainWallsOnAllSlabsCommand across N floors) may have
        // matrixAutoUpdate=false and set their matrix directly — these never set
        // matrixWorldNeedsUpdate, so obj.updateMatrixWorld(false) inside syncPickScene
        // leaves their pick-scene clones at stale positions (Y=0 instead of Y=27/30).
        // Calling updateMatrixWorld(true) here is O(n_scene) but identical to the
        // cost paid by the normal render frame — it guarantees all matrixWorld values
        // are current before we query syncPickScene.
        if (this._pickStrategy) {
            // §SELECT-HOVER-MATRIX-GUARD (FIX #1/#2) — guarded matrix sync so a stale
            // gizmo can't throw into the click pick and wedge selection mid-rebuild.
            this._safeUpdateMatrixWorldForPick();
            const pickCtx: PickContext = {
                camera:          this.camera.three as THREE.Camera,
                elementRegistry: this._buildElementRegistry(),
                viewportWidth:   rect.width,
                viewportHeight:  rect.height,
                scene:           this.world.scene.three as THREE.Scene,
                renderer:        this._buildGpuPickRenderer(),
            };
            try {
                const gpuResult = this._pickStrategy.pick({ x, y }, pickCtx);
                if (gpuResult !== null) {
                    // §FIX-3D-DOOR-PICK-PRIORITY (L-99b) — `obj`/`pickedElementId`/`pickedKind`
                    // may be re-pointed at a wall-hosted door/window by the priority probe below.
                    let obj = pickCtx.elementRegistry.objectFor(gpuResult.elementId);
                    let pickedElementId = gpuResult.elementId;
                    let pickedKind: string = gpuResult.elementKind;
                    // §97 SLAB-VS-STAIR — decisive click log. The GPU pick is authoritative
                    // and "frontmost-at-the-clicked-pixel wins" (the professional standard).
                    // The old log printed only an opaque UUID, so a human couldn't tell WHAT
                    // was selected. Now it states the element TYPE + depth-distance, so ONE
                    // click distinguishes the two #97 hypotheses: if you click a stair tread
                    // and this prints type=slab at a plausibly-deeper dist, the slab was
                    // genuinely visible through a tread gap (expected, gap-click); if type=slab
                    // at a dist SHALLOWER than the tread you aimed at, that's a real depth
                    // artifact worth a tie-break fix.
                    const _hitType = (obj?.userData?.elementType ?? obj?.userData?.type ?? 'unknown');
                    console.log(
                        `[PickResolver] §97 click hit type=${_hitType} id=${gpuResult.elementId} ` +
                        `dist=${gpuResult.distance.toFixed(2)} strategy=${this._pickStrategy.id}`,
                    );

                    // ── §FIX-3D-DOOR-PICK-PRIORITY (L-99b) — DIAGNOSTICS + hosted-element priority ──
                    // The founder could not select a door in 3D at all — every pick resolved to the
                    // host WALL/FLOOR. (1) Make the failure OBSERVABLE: log the pick-target vs live
                    // viewport, how many door/window pick ids are registered (ZERO ⇒ the door mesh
                    // carries no pick id / isn't in the selectable cache → it can never be picked),
                    // and every candidate under the cursor. (2) When the winner is a large HOST and a
                    // wall-hosted door/window is present within a coplanar depth epsilon, PROMOTE the
                    // opening so the small door wins over its host. Only runs on host-kind hits — a
                    // direct door/other hit is untouched; the extra probe is one readback per click.
                    try {
                        const _HOST = new Set(['wall', 'slab', 'floor', 'ceiling', 'roof']);
                        let _doorIds = 0, _windowIds = 0;
                        for (const eid of pickCtx.elementRegistry.ids()) {
                            // ⭐ §PICKDIAG-CASING (L-1173) — `.toLowerCase()` IS THE WHOLE FIX, AND
                            // WITHOUT IT THIS COUNTER WAS UNSATISFIABLE. `kindOf` returns
                            // `userData.elementType` RAW, and C15 §12 FREEZES that as PascalCase
                            // (`'Door'`, `'Window'` — DoorBuilder.ts / WindowBuilder.ts stamp exactly
                            // those), mandating that every consumer normalise before comparing. This
                            // one did not, so `'Door' === 'door'` was false for every door this
                            // codebase can build: `doorsRegistered` was PINNED AT 0 by construction.
                            //
                            // ⚠ IT REPORTED A FALSE NEGATIVE, AND THE FALSE NEGATIVE WAS BELIEVED.
                            // The founder's `doorsRegistered=0 windowsRegistered=0` against 3,304
                            // openings does NOT mean the openings are missing from the pick registry —
                            // they are in `idToObj`, they are in `ids()`, and they are pickable. The
                            // DIAGNOSTIC was broken. ISSUE-LOG L-912/L-913 both concluded "hosted
                            // openings are absent from the pick registry" from this number; that
                            // conclusion was drawn from a counter hard-wired to zero.
                            //
                            // Note its own neighbours already obey the rule — `_HOST.has(String(
                            // _hitType).toLowerCase())` three lines down, `hostedPickPriority.ts`
                            // ll.64/80, `_ensureSelectableCache` — which is why the PROMOTION works
                            // while the counter that exists to EXPLAIN the promotion lies.
                            const k = String(pickCtx.elementRegistry.kindOf(eid) ?? '').toLowerCase();
                            if (k === 'door') _doorIds++;
                            else if (k === 'window') _windowIds++;
                        }
                        const _diagHead =
                            `[PickDiag] §L-99b winner=${_hitType} viewport=${Math.round(rect.width)}x${Math.round(rect.height)} ` +
                            `doorsRegistered=${_doorIds} windowsRegistered=${_windowIds}`;
                        if (_HOST.has(String(_hitType).toLowerCase()) && typeof this._pickStrategy.pickRect === 'function') {
                            const _R = 4; // CSS-px neighbourhood around the cursor
                            const _probe = this._pickStrategy.pickRect({ x: x - _R, y: y - _R, w: _R * 2 + 1, h: _R * 2 + 1 }, pickCtx);
                            const _cands = _probe.map((p) => ({
                                elementId:   p.elementId,
                                elementKind: (pickCtx.elementRegistry.kindOf(p.elementId) ?? p.elementKind ?? 'unknown') as string,
                                distance:    p.distance,
                            }));
                            console.log(
                                `${_diagHead} candidates=[${_cands.map((c) => `${c.elementKind}:${String(c.elementId).slice(0, 8)}@${c.distance.toFixed(2)}`).join(', ')}]`,
                            );
                            const _preferred = resolveHostedPickPriority(_cands);
                            if (_preferred && _preferred.elementId !== gpuResult.elementId) {
                                const _po = pickCtx.elementRegistry.objectFor(_preferred.elementId);
                                if (_po) {
                                    console.log(
                                        `[PickResolver] §FIX-3D-DOOR-PICK-PRIORITY promoting hosted ${_preferred.elementKind} ` +
                                        `${_preferred.elementId} over host ${_hitType}`,
                                    );
                                    obj = _po;
                                    pickedElementId = _preferred.elementId;
                                    pickedKind = _preferred.elementKind;
                                }
                            }
                        } else {
                            console.log(_diagHead);
                        }
                    } catch (err) {
                        console.debug('[PickDiag] §L-99b hosted-priority probe skipped:', err);
                    }
                    if (obj) {
                        // GPU pick succeeded — dispatch world-click event then select.
                        {
                            // BUG-07: Prefer gpuResult.hitPoint (depth-derived 3-D world
                            // position) over the level-plane intersection.  The level-plane
                            // fallback placed the worldPoint on the active floor elevation
                            // regardless of where the actual surface was, producing incorrect
                            // positions for elevated or inclined elements.  gpuResult.hitPoint
                            // is zero-vector only when the depth pass returns an all-zero
                            // pixel (depth buffer miss); fall back to level-plane in that case.
                            const hp = gpuResult.hitPoint;
                            const isHitPointValid = hp.x !== 0 || hp.y !== 0 || hp.z !== 0;
                            let worldPoint: { x: number; y: number; z: number };
                            if (isHitPointValid) {
                                worldPoint = { x: hp.x, y: hp.y, z: hp.z };
                            } else {
                                const levelY  = window.activeLevelElevation ?? 0;
                                const levelPl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -levelY);
                                const levelPt = new THREE.Vector3();
                                this._raycaster.ray.intersectPlane(levelPl, levelPt);
                                worldPoint = { x: levelPt.x, y: levelPt.y, z: levelPt.z };
                            }
                            window.dispatchEvent(new CustomEvent('bim-canvas-world-click', { // TODO(TASK-11)
                                detail: {
                                    worldPoint,
                                    elementId:   pickedElementId,  // §FIX-3D-DOOR-PICK-PRIORITY (L-99b)
                                    elementType: pickedKind,
                                },
                            }));
                        }
                        // Route GPU hit through existing selection logic.
                        // Use findSelectableRoot to normalise to semantic root, then
                        // enter the same curtain-wall / select() branch as the BVH path.
                        const resolvedRoot = this.findSelectableRoot(obj) ?? obj;
                        window.__curtainSubElement = null;
                        this.resetSubElementState();
                        // §SELECT-INSTANCED-FURNITURE-PICK — when the GPU hit resolved to
                        // an InstancedElementRenderer group whose synthetic group id is
                        // NOT the picked element id, the picked id is a PER-INSTANCE member
                        // (e.g. an instanced furniture item / column). Pass it as the
                        // per-instance override so select()/applyHighlight build the OBB for
                        // THAT instance (FIX #5) and the store receives the real element id —
                        // exactly as the BVH path does via getInstanceElementId(). For
                        // non-instanced hits the override is undefined (unchanged behaviour).
                        const instanceOverride =
                            resolvedRoot.userData?.isInstancedGroup === true &&
                            resolvedRoot.userData?.id !== pickedElementId  // §FIX-3D-DOOR-PICK-PRIORITY (L-99b)
                                ? pickedElementId
                                : undefined;
                        this.select(resolvedRoot, instanceOverride);
                        return;
                    }
                } else {
                    // §SELECT-3D-GPU-AUTHORITATIVE (DAILY-USE 2026-05-22): a GPU
                    // pick MISS (null) is pixel-accurate and AUTHORITATIVE —
                    // nothing selectable is rendered at this pixel. We MUST NOT
                    // fall through to the BVH raycast: a BVH ray continues
                    // through the whole scene and can intersect an OFF-SCREEN
                    // element's geometry further along the ray, selecting
                    // something the user can't even see (architect: "it selects
                    // a wall I selected before that doesn't show on screen", and
                    // it blocks selecting a sofa). Treat a GPU miss as an empty
                    // click: dispatch the ground-plane world-click so operation
                    // tools still get the point, clear the selection, and STOP.
                    // The BVH path below remains the fallback ONLY when there is
                    // no GPU strategy at all, or when the GPU pick THREW (catch).
                    // This mirrors how production editors (pascalorg/editor,
                    // SketchUp, Revit) treat the depth/pixel pick as the single
                    // source of truth — no secondary ray into hidden geometry.
                    console.debug(`[PickResolver] strategy=${this._pickStrategy.id} miss — authoritative empty (no BVH fallback)`);
                    const _levelY = window.activeLevelElevation ?? 0;
                    const _levelPl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -_levelY);
                    const _wp = new THREE.Vector3();
                    this._raycaster.ray.intersectPlane(_levelPl, _wp);
                    window.dispatchEvent(new CustomEvent('bim-canvas-world-click', { // TODO(TASK-11)
                        detail: { worldPoint: { x: _wp.x, y: _wp.y, z: _wp.z }, elementId: null, elementType: null },
                    }));
                    if (window.__underlayHit) return;
                    this.unselectAll('click-gpu-pick-miss');
                    return;
                }
            } catch (err) {
                console.warn('[PickResolver] GPU pick threw — falling back to BVH:', err);
            }
        }

        // A16-T8: Prune candidates with O(log n) BVH ray intersection before the
        // O(n·triangles) mesh-level raycast.  Falls back to full cache when BVH
        // is unavailable or when all elements are candidates (small scenes).
        const candidates = this._bvhPruneCandidates(this._selectableCache!);
        // #113 — drop hits on hidden elements (THREE's raycast ignores `.visible`).
        const hits = this._raycaster.intersectObjects(candidates, true)
            .filter(h => isObjectEffectivelyVisible(h.object));

        // ── Phase D: bim-canvas-world-click dispatch ────────────────────────
        // Compute the world-space point on the current level plane and dispatch
        // it so operation tools (JoinTool, CutTool, MirrorTool, …) can react.
        {
            const levelY = window.activeLevelElevation ?? 0;
            const levelPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -levelY);
            const worldPt = new THREE.Vector3();
            this._raycaster.ray.intersectPlane(levelPlane, worldPt);

            const firstHit  = hits[0] ?? null;
            const hitRoot   = firstHit ? this.findSelectableRoot(firstHit.object) : null;
            const hitId     = hitRoot?.userData?.id ?? null;
            const hitType   = hitRoot
                ? (hitRoot.userData?.elementType ?? hitRoot.userData?.type ?? null)
                : null;

            window.dispatchEvent(new CustomEvent('bim-canvas-world-click', { // TODO(TASK-11)
                detail: {
                    worldPoint:  { x: worldPt.x, y: worldPt.y, z: worldPt.z },
                    elementId:   hitId,
                    elementType: hitType,
                },
            }));
        }

        if (hits.length === 0) {
            // Don't override an underlay selection that just fired in mousedown.
            // FloorPlanUnderlayTool sets window.__underlayHit = true and clears it
            // in the next animation frame, bridging the mousedown → click gap.
            if (window.__underlayHit) return;
            this.unselectAll('click-bvh-fallback-no-hits');
            return;
        }

        // Filter and sort hits to find the most relevant selectable entity
        const validHits = hits
            .map(hit => ({ hit, root: this.findSelectableRoot(hit.object) }))
            .filter(item => item.root !== null);

        if (validHits.length === 0) {
            this.unselectAll('click-bvh-hits-no-selectable-root');
            return;
        }

        // Sort by distance to camera
        validHits.sort((a, b) => a.hit.distance - b.hit.distance);

        // §SELECT-TAB-CYCLE (DAILY-USE 2026-05-21) — capture the full
        // dedupe-by-root ordered candidate list at the click position.
        // Front-to-back by camera distance (already sorted above). The
        // TAB-key handler in `init()` will advance through this list when
        // the cursor is still within TAB_CYCLE_ANCHOR_PX of the anchor.
        // Without this capture, every TAB press would behave identically
        // to a fresh click — re-selecting the front-most element forever.
        {
            const seen = new Set<THREE.Object3D>();
            const dedupedRoots: THREE.Object3D[] = [];
            for (const v of validHits) {
                if (v.root && !seen.has(v.root)) {
                    seen.add(v.root);
                    dedupedRoots.push(v.root);
                }
            }
            this._tabCycleCandidates    = dedupedRoots;
            this._tabCycleIndex         = 0;
            this._tabCycleAnchorClientX = event.clientX;
            this._tabCycleAnchorClientY = event.clientY;
            if (dedupedRoots.length > 1) {
                console.log(
                    `[SelectionManager] §SELECT-TAB-CYCLE captured ${dedupedRoots.length} ` +
                    `overlapping candidates at click — TAB to cycle`,
                );
            }
        }

        const bestHit = validHits[0];
        const resolvedRoot = bestHit.root!;

        // ── BUG-04: InstancedElementRenderer per-instance resolution ──────────
        // When the BVH raycaster hits an IM group registered by
        // InstancedElementRenderer, THREE.js provides hit.instanceId.
        // We call getInstanceElementId(instanceId) to get the specific BIM
        // element ID, then dispatch selection with that override ID.
        // The IM itself becomes selectedObject (for TransformControls); the
        // inspector / store receive the correct per-instance element ID.
        if (resolvedRoot.userData?.isInstancedGroup === true && bestHit!.hit.instanceId !== undefined) {
            const getFn = resolvedRoot.userData.getInstanceElementId as
                ((i: number) => string | undefined) | undefined;
            const instanceElemId = getFn?.(bestHit!.hit.instanceId);
            if (instanceElemId) {
                window.__curtainSubElement = null;
                this.resetSubElementState();
                this.select(resolvedRoot, instanceElemId);
                return;
            }
        }

        // ── Curtain wall two-step selection (Revit-like) ─────────────────────
        //
        // Step 1 — CW not yet selected (or a different CW):
        //   → Select the parent CW group, show full CW properties.
        //     No sub-element shown on first click.
        //
        // Step 2 — Same CW already selected, user clicks again:
        //   → Detect which sub-element was clicked.
        //     Update property panel to show sub-element without changing
        //     the TransformControls target (CW group stays attached).
        //     Draw an amber highlight on the clicked sub-element.
        //
        // All other element types go through the unchanged select() path.
        // ────────────────────────────────────────────────────────────────────
        if (this.isCurtainWallGroup(resolvedRoot)) {
            if (this.selectedObject === resolvedRoot) {
                // ── Step 2: CW already selected → sub-element click ─────────
                const subEl = this.detectCurtainSubElement(bestHit.hit.object, bestHit.hit.instanceId);

                // Reset Tab cycling when user clicks directly (Tab will rebuild the list)
                this.cwSubElements = [];
                this.cwSubElementIndex = -1;

                if (subEl) {
                    // Show amber highlight on the specific sub-element
                    this.showSubElementHighlight(resolvedRoot, subEl, bestHit.hit.object, bestHit.hit.instanceId);
                } else {
                    // Clicked on CW frame / empty area → back to parent CW view
                    this.clearSubElementHighlight();
                }

                window.__curtainSubElement = subEl ?? null;
                this.updateInspector(this.selectedObject);

            } else {
                // ── Step 1: New CW selection → show parent CW properties ────
                window.__curtainSubElement = null; // no sub-element on first click
                this.resetSubElementState();
                this.select(resolvedRoot);
            }
        } else {
            // ── All other element types: unchanged selection path ────────────
            window.__curtainSubElement = null;
            this.resetSubElementState();
            this.select(resolvedRoot);
        }

        } finally {
            // §MULTI-SELECT-SHIFT (L-1550) — the latch lives for exactly one gesture.
            this._additivePick = false;
            _pickSpan.end();
        }
    }

    /**
     * §MULTI-SELECT-SHIFT (L-1550) — apply a SHIFT+click as an add/toggle against
     * the SelectionBus set. Returns TRUE when it handled the intent, FALSE when the
     * caller should fall through to the ordinary replace-selection path.
     *
     * FALSE is returned for a pick with NO RESOLVABLE ELEMENT ID — either no
     * `userData.id` at all, or the synthetic `instanced-group-<key>` handle that
     * `InstancedElementRenderer` stamps on a shared InstancedMesh. That handle is
     * truthy but names no store row (§FIX-SELECTION-PAYLOAD-INSTANCED-ID, L-813), so
     * adding it to the set would put an id in the selection that every downstream
     * command refuses — a multi-selection that silently cannot be deleted. Falling
     * through to a plain select is the honest outcome: the user sees ONE element
     * selected rather than a set with a poisoned member. In practice the pick paths
     * resolve instanced elements to their per-instance id and pass it as
     * `elementIdOverride`, so this arm is the guard, not the normal case.
     */
    private _applyAdditivePick(obj: THREE.Object3D, elementIdOverride?: string): boolean {
        const id = elementIdOverride ?? (obj.userData?.id as string | undefined);
        if (!id || id.startsWith('instanced-group-')) return false;

        const current = selectionBus.currentIds;
        if (current.includes(id)) {
            // Already in the set → SHIFT+click removes it (the CAD convention, and
            // the same rule `PlanViewInteraction` has applied since it gained shift).
            selectionBus.toggle(id, '3d-canvas');
            return true;
        }

        // ADD. The primary highlight/gizmo/inspector is applied LOCALLY first,
        // because the bus reaches back through `selectById(primary)`, whose scan
        // matches `userData.id` — and for an instanced element the per-instance id is
        // NOT on any Object3D, so that scan finds nothing and the primary would be
        // left unhighlighted. Doing it here keeps instanced and non-instanced
        // elements on the same path. The bus mirror inside `select()` is suppressed
        // for the duration so it does not collapse the set to `[id]` a moment before
        // `selectMany` restores it.
        this._suppressBusMirror = true;
        try {
            this.select(obj, elementIdOverride);
        } finally {
            this._suppressBusMirror = false;
        }
        selectionBus.toggle(id, '3d-canvas');
        return true;
    }

    private select(obj: THREE.Object3D, elementIdOverride?: string) {
        // §MULTI-SELECT-SHIFT (L-1550) — CONSUME the gesture latch. Consuming rather
        // than reading is what makes the re-entrant call from `_applyAdditivePick`
        // (and the one the bus makes through `selectById`) run the ordinary path
        // instead of recursing.
        if (this._additivePick) {
            this._additivePick = false;
            if (this._applyAdditivePick(obj, elementIdOverride)) return;
        }
        if (this.selectedObject === obj && elementIdOverride === undefined) return;

        this.unselectAll('about-to-select-something-else');
        this.selectedObject = obj;

        // §SELECT-INSTANCED-PICK (FIX #5) — pass the per-instance element id so the
        // highlight for an instanced-only element (column/beam) reads that one
        // instance's OBB, not the whole group's union AABB.
        this.applyHighlight(obj, elementIdOverride);
        this.updateInspector(obj);

        // §STAIR-3D-MOVE (2026-06-11) — stairs are now movable via the gizmo, the
        // same way walls/columns/beams/furniture are. The stair mesh bakes its
        // geometry in WORLD coordinates with the group at local origin (0,0,0), so
        // attaching TransformControls directly here would place the gizmo at the
        // world origin. We therefore attach as usual (parity with every other
        // element), then StairTransformController.activateFor() — fired by the
        // bim-selection-changed event below, exactly like WallTransformController —
        // RE-ATTACHES the gizmo to an invisible proxy positioned AT THE STAIR so it
        // renders in the right place and the drag delta moves the stair correctly.
        // Rooms still skip the gizmo (they are not directly movable).
        const elemType = (obj.userData?.elementType ?? obj.userData?.type ?? '').toLowerCase();
        const isRoom  = elemType === 'room';
        if (!isRoom) {
            this.transformControls.attach(obj);
        }
        // Note: applyHighlight() already applies LevelPlaneConstraint for non-hosted
        // elements. The transformControls.attach() above is a harmless re-attach that
        // does not reset showY, so the constraint remains in effect.

        // Notify UI that selection has changed to refresh menu states.
        //
        // §FIX-SELECTION-PAYLOAD-INSTANCED-ID (L-813) — the payload MUST carry the
        // RESOLVED per-instance element id, not just the Object3D.
        //
        // THE BUG THIS CLOSES. A plain wall (no openings, not curved, not joined)
        // renders through InstancedElementRenderer, which stamps a SYNTHETIC group id
        // (`instanced-group-<key>`) on the shared InstancedMesh — the real per-element
        // id lives in the slot table and is recovered here as `elementIdOverride`.
        // Every consumer that read `detail.object.userData.id` therefore got the
        // *group* handle: truthy, so no guard tripped, but no store row exists for it.
        // ContextualEditBar armed Join/Cut/Mirror/Offset with `instanced-group-…`, the
        // command's canExecute returned WALL_A_NOT_FOUND, and the refusal was swallowed
        // (see §FIX-OP-REFUSAL-VISIBLE) — the founder's "the edit buttons do nothing in
        // 3D". Plan view was unaffected because plan picking reads ids from the store,
        // which is exactly the reported plan-vs-3D divergence.
        //
        // `pryzm-element-selected` (below) already resolved this correctly; the two
        // payloads simply disagreed. They now agree.
        const _resolvedElementId   = elementIdOverride ?? (obj.userData?.id as string | undefined) ?? null;
        const _resolvedElementType = (obj.userData?.elementType ?? obj.userData?.type ?? null) as string | null;
        window.dispatchEvent(new CustomEvent('bim-selection-changed', {
            detail: { object: obj, elementId: _resolvedElementId, elementType: _resolvedElementType },
        })); // keep DOM for plugins
        (window as any).runtime?.events?.emit('bim-selection-changed', {
            object: obj, elementId: _resolvedElementId, elementType: _resolvedElementType,
        }); // F.events.16 bridge

        // ── Wardrobe run inspector ─────────────────────────────────────────────
        // Show the wardrobe run inspector immediately on click, hide on deselect.
        if (this.isWardrobeFurniture(obj)) {
            const wdRunInsp = window.wardrobeRunInspector;
            const furnitureId = obj.userData?.id as string | undefined;
            if (wdRunInsp && furnitureId) wdRunInsp.show(furnitureId);
        }

        // ── Kitchen run inspector ──────────────────────────────────────────────
        // §KITCHEN-RUN-INSPECTOR-PARITY (2026-05-23) — show the kitchen run inspector
        // immediately on click, exactly like the wardrobe above. Previously the
        // kitchen run inspector only appeared after TAB-cycling through every unit +
        // the countertop (the wrap branch in _advanceKcSubUnit), so the run-level
        // dimensions the creation panel exposes (height / depth / unit count) were
        // effectively unreachable once the kitchen was placed — "kitchen can only be
        // configured on creation". This gives full post-selection edit parity with
        // the wardrobe (the architect's request).
        if (this.isKitchenFurniture(obj)) {
            const kRunInsp = window.kitchenRunInspector;
            const furnitureId = obj.userData?.id as string | undefined;
            if (kRunInsp && furnitureId) kRunInsp.show(furnitureId);
        }

        // Phase 6 — bidirectional selection: broadcast to all UI panels.
        // Source '3d' so that the listener in init() does not create a feedback loop.
        // BUG-04: elementIdOverride is set for InstancedElementRenderer instances
        // where the IM group mesh has no userData.id but each slot has its own
        // BIM element ID resolved via getInstanceElementId(instanceId).
        const elementId = elementIdOverride ?? (obj.userData?.id as string | undefined);
        if (elementId) {
            (window as any).runtime?.events?.emit('pryzm-element-selected', {
                elementId,
                elementType: obj.userData?.elementType ?? obj.userData?.type,
                source: '3d',
            });
        }

        // ── §MULTI-SELECT-SHIFT (L-1550) — MIRROR THE 3-D SELECTION INTO THE BUS ──
        //
        // THE DIVERGENCE THIS CLOSES. `selectionBus` is documented (C27 §4, and its
        // own class docblock) as "the single source of truth for element selection
        // events across all PRYZM surfaces" — and `PlanViewCanvas`, `AIPanel` and
        // `ZeroTokenChatBridge` all read `selectionBus.currentIds` as THE selected
        // set. But NOTHING wrote a plain 3-D click into it. `selectById` came IN from
        // the bus; nothing went OUT. So after clicking a wall in the 3-D viewport the
        // bus still reported the PREVIOUS selection: "delete selected" in chat acted
        // on the wrong element, the plan canvas painted the wrong element as
        // selected, and a subsequent SHIFT+click would have added to a set the user
        // had already replaced. The 3-D viewport and the plan view genuinely
        // disagreed about what was selected, in the direction that is hardest to
        // notice — the 3-D highlight, which is what the user is looking at, was right.
        //
        // `isDispatching` is the recursion guard. A `select()` reached FROM the bus
        // (plan-view click, project-browser row, marquee primary) must not echo back:
        // the bus's own `_inFlight` source guard cannot stop it, because a mirror
        // labelled `'3d-canvas'` differs from the `'plan-view'` source in flight and
        // would pass — collapsing a plan-view multi-selection to a single element.
        //
        // AN UNRESOLVABLE PICK IS MIRRORED AS *NOTHING SELECTED*, NEVER AS ITSELF.
        // When the pick lands on an `InstancedElementRenderer` group and no
        // per-instance id was resolved, `elementId` is the synthetic
        // `instanced-group-<key>` handle: truthy, but naming no store row
        // (§FIX-SELECTION-PAYLOAD-INSTANCED-ID, L-813). Mirroring it would put an id
        // in the bus that every downstream command refuses — chat's "delete
        // selected" would refuse, the plan canvas would highlight nothing, and each
        // would look like its own separate bug. Leaving the PREVIOUS set in place is
        // no better: that is the stale-bus divergence this mirror exists to close.
        // So the set is emptied through `dispatch` rather than `clearAll`, because
        // `clearAll` calls back into `unselectAll()` and would tear down the
        // highlight this method just applied — the user is looking at a highlighted
        // group; what they must not get is a second surface naming an id for it.
        if (elementId && !this._suppressBusMirror && !selectionBus.isDispatching) {
            if (elementId.startsWith('instanced-group-')) {
                if (selectionBus.currentIds.length > 0) {
                    selectionBus.dispatch({ type: 'clear', source: '3d-canvas', elementIds: [] });
                }
            } else {
                selectionBus.select(elementId, '3d-canvas');
            }
        }
    }

    /**
     * Phase 6 — Bidirectional selection.
     * Locate a scene object by its userData.id and programmatically select it.
     * Returns true if the object was found and selected, false otherwise.
     */
    selectById(id: string): boolean {
        if (!id) return false;

        // F-P4: Consult _selectableCache first (O(1) Map lookup) before falling
        // back to a full scene.traverse().  _selectableCache may contain the raw
        // mesh rather than the selectable root, so we pass the result through
        // findSelectableRoot exactly as performSelection() does.
        let found: THREE.Object3D | null = null;

        if (this._selectableCache) {
            for (const obj of this._selectableCache) {
                if (obj.userData?.id === id) {
                    found = obj;
                    break;
                }
            }
        }

        if (!found) {
            try {
                const scene = (this.world as any).scene?.three as THREE.Scene | undefined;
                if (scene) {
                    scene.traverse((obj) => {
                        if (!found && obj.userData?.id === id) {
                            found = obj;
                        }
                    });
                }
            } catch (err) {
                console.warn('[SelectionManager.selectById] Scene traversal error:', err);
            }
        }

        if (found) {
            // Normalise to the selectable root just as performSelection() does.
            const root = this.findSelectableRoot(found) ?? found;
            this.select(root);
            return true;
        }
        return false;
    }

    /**
     * §FIX-LEVEL-EXPLODE-COORDINATION (L-113) — the active per-level explode Y
     * offset (metres) for `obj`, or 0 when the Level STACKED/UNSTACKED view is
     * inactive/collapsed. The explode lifts each level's meshes by a pure view
     * transform (root.position.y), so a MODEL-space highlight box (instanced wall
     * / OBB fallback, built from userData.baseLine at the element's TRUE
     * elevation) would float below the lifted mesh. Adding this offset to the OBB
     * centre.y places the highlight in the SAME exploded space the mesh is drawn.
     * Provided cross-layer by LevelExplodeController (a higher layer) via a typed
     * window slot — the same window-global escape hatch this file already uses for
     * gridStore/roomStore. Geometry-overlay + Box3 highlights already track the
     * mesh's world matrix, so this is applied ONLY on the model-space OBB paths.
     */
    private _explodeOffsetFor(obj: THREE.Object3D): number {
        const provider = (window as unknown as {
            pryzmLevelExplodeOffsetForObject?: (o: THREE.Object3D) => number;
        }).pryzmLevelExplodeOffsetForObject;
        if (typeof provider !== 'function') return 0;
        try {
            const v = provider(obj);
            return typeof v === 'number' && Number.isFinite(v) ? v : 0;
        } catch {
            return 0;
        }
    }

    applyHighlight(obj: THREE.Object3D, instanceElementId?: string) {
        this.clearHighlight();

        // §SELECT-INSTANCED-PICK (FIX #5) — instanced-only element (column/beam):
        // the selected element IS one slot of an InstancedElementRenderer group, so
        // there is no clonable per-element mesh — _buildGeometryHighlight would skip
        // the InstancedMesh and the AABB fallback would box the WHOLE group's union.
        // Build a real purple OBB from the per-instance extents stamped at register()
        // time (userData.getInstanceObb(slot)), keeping the unified PRYZM purple.
        if (obj.userData?.isInstancedGroup === true && instanceElementId) {
            const obb = this._instanceObbFor(obj, instanceElementId);
            if (obb) {
                this._applyObbHighlight(obj, obb.center, obb.size, obb.quaternion);
                return;
            }
            // No OBB available — fall through to the generic paths below.
        }

        if (!(obj instanceof THREE.Mesh || obj instanceof THREE.Group)) return;

        const elementType = (obj.userData?.elementType ?? '').toLowerCase();

        // Sprint F-2.0 §E2 — delegate bounds computation to the pluggable registry.
        // Plugins call `selectionManager.boundsRegistry.register(type, fn)` to
        // supply custom highlight shapes for their own element types.
        const result = this._boundsRegistry.build(elementType, obj);

        // ── Mesh path (slab / floor / ceiling / room — polygon extrusions) ───────
        if (result?.kind === 'mesh') {
            result.mesh.userData.isHelper = true;
            this.highlightMesh = result.mesh;
            this.world.scene.three.add(this.highlightMesh);
            if (!result.skipTransformControls) {
                this.transformControls.attach(obj);
            }
            this.selectedObject = obj;
            if (this.levelPlaneConstraint) {
                this.levelPlaneConstraint.detach();
                if (!result.skipTransformControls) {
                    this.levelPlaneConstraint.attach(obj);
                }
            }
            return;
        }

        // ── Geometry-accurate fill overlay (DEFAULT for walls / doors / windows /
        //    columns / furniture / stairs / beams / …) ────────────────────────────
        // §SELECT-HIGHLIGHT-GEOMETRY (DAILY-USE 2026-05-22) — the previous
        // translucent bounding BOX highlighted a box AROUND the element, not its
        // actual shape: incomplete coverage ("doesn't completely highlight"), a
        // faint 0.15 fill ("not strong"), and box-vs-surface z-fighting
        // ("glitching").  Instead, clone the element's live meshes — SHARING their
        // BufferGeometry — with a purple overlay pulled toward the camera, so the
        // exact silhouette reads as a strong, complete purple fill.  This is
        // independent of the TSL OutlinePass (works on plain WebGL too); together
        // they give fill + crisp edge.  Falls through to the OBB/AABB box only when
        // there is no clonable (non-instanced) geometry.
        const overlay = this._buildGeometryHighlight(obj);
        if (overlay) {
            this.highlightMesh = overlay;
            this.world.scene.three.add(overlay);
            this.transformControls.attach(obj);
            this.selectedObject = obj;
            if (this.levelPlaneConstraint) {
                this.levelPlaneConstraint.detach();
                const elemTypeOv = (obj.userData?.elementType ?? '').toLowerCase();
                const isHostedOv = elemTypeOv === 'door' || elemTypeOv === 'window';
                if (!isHostedOv) {
                    this.levelPlaneConstraint.attach(obj);
                }
            }
            return;
        }

        // ── OBB path (fallback: instanced-only elements / no clonable meshes) ─────
        let center: THREE.Vector3;
        let size: THREE.Vector3;
        let highlightQuaternion: THREE.Quaternion | null = null;

        if (result?.kind === 'obb') {
            center             = result.center;
            size               = result.size;
            highlightQuaternion = result.quaternion ?? null;
            // §FIX-LEVEL-EXPLODE-COORDINATION (L-113) — the model-space OBB builders
            // reaching this fallback (a 'wall' with only an InstancedMesh to clone)
            // return a centre at the element's TRUE elevation; lift it into the
            // exploded view so the box tracks the mesh instead of floating below it.
            // World-matrix OBB builders (door/column/curtain-wall via getWorldPosition)
            // already include the offset, so restrict the correction to 'wall'.
            if (elementType === 'wall') {
                center.y += this._explodeOffsetFor(obj);
            }
        } else {
            // No registry builder — fall back to world-space AABB.
            const box = new THREE.Box3().setFromObject(obj);
            size   = box.getSize(new THREE.Vector3());
            center = box.getCenter(new THREE.Vector3());
        }

        const PADDING = 0.06; // metres — small clearance so the box doesn't z-fight the surface
        const geo = new THREE.BoxGeometry(size.x + PADDING, size.y + PADDING, size.z + PADDING);
        const mat = new THREE.MeshBasicMaterial({
            color:       0x6600FF,
            transparent: true,
            opacity:     0.15,
            depthWrite:  false,
            side:        THREE.DoubleSide,
        });

        this.highlightMesh = new THREE.Mesh(geo, mat);
        this.highlightMesh.position.copy(center);
        if (highlightQuaternion) {
            this.highlightMesh.quaternion.copy(highlightQuaternion);
        }
        this.highlightMesh.userData.isHelper = true;

        const edgesGeo = new THREE.EdgesGeometry(geo);
        const edgesMat = new THREE.LineBasicMaterial({ color: 0x6600FF, linewidth: 2 });
        const edges    = new THREE.LineSegments(edgesGeo, edgesMat);
        this.highlightMesh.add(edges);

        this.world.scene.three.add(this.highlightMesh);

        this.transformControls.attach(obj);
        this.selectedObject = obj;

        // ── Level-plane Y-lock (applied here so that any direct call to
        // applyHighlight() — bypassing select() — is also constrained).
        // Detach first to reset any prior lock, then re-apply for the new obj.
        if (this.levelPlaneConstraint) {
            this.levelPlaneConstraint.detach();
            const elemTypeHL = (obj.userData?.elementType ?? '').toLowerCase();
            const isHostedHL = elemTypeHL === 'door' || elemTypeHL === 'window';
            if (!isHostedHL) {
                this.levelPlaneConstraint.attach(obj);
            }
        }
    }

    /**
     * §SELECT-HIGHLIGHT-GEOMETRY — build a purple FILL overlay that matches the
     * element's ACTUAL geometry (not a bounding box).  Each visible child mesh is
     * cloned, SHARING its BufferGeometry (no buffer duplication), and rendered with
     * a single shared purple overlay material pulled toward the camera via
     * polygonOffset so it reads as a strong, complete highlight without z-fighting
     * the surface.  Clones are flagged `sharedGeometry` so clearHighlight() never
     * disposes the live element's geometry.  Returns null when there is no clonable
     * (non-instanced) geometry — the caller then falls back to the OBB/AABB box.
     */
    private _buildGeometryHighlight(obj: THREE.Object3D): THREE.Group | null {
        const mat = new THREE.MeshBasicMaterial({
            color:               0x6600FF,
            transparent:         true,
            opacity:             0.4,
            depthWrite:          false,
            side:                THREE.DoubleSide,
            polygonOffset:       true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits:  -2,
        });

        const group = new THREE.Group();
        group.name = 'selection-highlight-overlay';
        group.userData.isHelper = true;

        obj.updateMatrixWorld(true);
        let count = 0;
        obj.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (!mesh.isMesh) return;
            // Skip helpers/previews and instanced geometry (handled by the box
            // fallback / curtain-wall sub-highlight).
            if (child.userData?.isHelper || child.userData?.isPreview) return;
            if ((mesh as unknown as THREE.InstancedMesh).isInstancedMesh) return;
            if (!mesh.visible) return;
            const g = mesh.geometry as THREE.BufferGeometry | undefined;
            if (!g) return;

            const clone = new THREE.Mesh(g, mat);
            clone.matrixAutoUpdate = false;
            mesh.updateWorldMatrix(true, false);
            clone.matrix.copy(mesh.matrixWorld);
            clone.userData.isHelper = true;
            clone.userData.sharedGeometry = true; // do NOT dispose g in clearHighlight
            clone.renderOrder = 999;              // composite above the element surface
            group.add(clone);
            count++;
        });

        if (count === 0) {
            // §SELECT-HIGHLIGHT-RELEASE-AT-BOUNDARY (L-1002) — DELIBERATELY synchronous,
            // and this is the distinction that keeps the fix honest: `mat` was minted a
            // few lines above and no mesh using it was ever added to the scene, so no
            // encoded frame can reference it and there is nothing to order against.
            // Deferring it would be cargo-cult, and would grow the boundary queue on a
            // path that runs per hover. WebGPU-safe wrapper retained for the device-loss
            // `usedTimes` throw.
            safeDisposeMaterial(mat);
            return null;
        }
        return group;
    }

    /**
     * §SELECT-INSTANCED-PICK (FIX #5) — resolve the per-instance world-space OBB
     * for `instanceElementId` within an InstancedElementRenderer group, or null if
     * the group does not expose the helpers / the element is not an instance.
     *
     * The group stamps `getOccupiedInstanceSlots()`, `getInstanceElementId(slot)`
     * and `getInstanceObb(slot)` on userData at register() time. We resolve the
     * slot whose element id matches, then read its OBB.
     */
    private _instanceObbFor(
        obj: THREE.Object3D,
        instanceElementId: string,
    ): { center: THREE.Vector3; size: THREE.Vector3; quaternion: THREE.Quaternion } | null {
        const ud = obj.userData as {
            getOccupiedInstanceSlots?: () => readonly number[];
            getInstanceElementId?: (slot: number) => string | undefined;
            getInstanceObb?: (slot: number) => {
                center: { x: number; y: number; z: number };
                size: { x: number; y: number; z: number };
                quaternion: { x: number; y: number; z: number; w: number };
            } | undefined;
        };
        if (!ud.getOccupiedInstanceSlots || !ud.getInstanceElementId || !ud.getInstanceObb) {
            return null;
        }
        for (const slot of ud.getOccupiedInstanceSlots()) {
            if (ud.getInstanceElementId(slot) === instanceElementId) {
                const raw = ud.getInstanceObb(slot);
                if (!raw) return null;
                return {
                    center: new THREE.Vector3(raw.center.x, raw.center.y, raw.center.z),
                    size: new THREE.Vector3(raw.size.x, raw.size.y, raw.size.z),
                    quaternion: new THREE.Quaternion(
                        raw.quaternion.x, raw.quaternion.y, raw.quaternion.z, raw.quaternion.w,
                    ),
                };
            }
        }
        return null;
    }

    /**
     * §SELECT-INSTANCED-PICK (FIX #5) — build a STRONG unified-purple (#6600FF) OBB
     * highlight box from an explicit oriented box. Used for instanced-only elements
     * where there is no clonable per-element mesh to overlay. Unlike the faint 0.15
     * AABB fallback, this is the element's EXACT oriented box (opacity 0.4 fill +
     * crisp purple edges), so columns/beams read as a real highlight.
     */
    private _applyObbHighlight(
        obj: THREE.Object3D,
        center: THREE.Vector3,
        size: THREE.Vector3,
        quaternion: THREE.Quaternion,
    ): void {
        // §FIX-LEVEL-EXPLODE-COORDINATION (L-113) — per-instance OBBs are stamped
        // at register() time in MODEL space (the element's true elevation); when the
        // level is exploded the hosting group is lifted by a view-only Y offset, so
        // add it here to keep the box on the lifted instance instead of floating.
        center = center.clone();
        center.y += this._explodeOffsetFor(obj);
        const PADDING = 0.06; // metres — small clearance so the box doesn't z-fight the surface
        const geo = new THREE.BoxGeometry(size.x + PADDING, size.y + PADDING, size.z + PADDING);
        const mat = new THREE.MeshBasicMaterial({
            color:               0x6600FF, // unified PRYZM purple
            transparent:         true,
            opacity:             0.4,      // strong fill (matches the geometry overlay), not the faint 0.15 box
            depthWrite:          false,
            side:                THREE.DoubleSide,
            polygonOffset:       true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits:  -2,
        });

        const box = new THREE.Mesh(geo, mat);
        box.position.copy(center);
        box.quaternion.copy(quaternion);
        box.userData.isHelper = true;
        box.renderOrder = 999;

        const edgesGeo = new THREE.EdgesGeometry(geo);
        const edgesMat = new THREE.LineBasicMaterial({ color: 0x6600FF, linewidth: 2 });
        box.add(new THREE.LineSegments(edgesGeo, edgesMat));

        this.highlightMesh = box;
        this.world.scene.three.add(box);

        this.transformControls.attach(obj);
        this.selectedObject = obj;

        if (this.levelPlaneConstraint) {
            this.levelPlaneConstraint.detach();
            const elemType = (obj.userData?.elementType ?? '').toLowerCase();
            const isHosted = elemType === 'door' || elemType === 'window';
            if (!isHosted) {
                this.levelPlaneConstraint.attach(obj);
            }
        }
    }


    /**
     * §SELECT-CLEARED-SAYS-WHY (L-3531, founder 2026-08-22) — the deselect probe.
     *
     * ── ⛔ WHY A REASON PARAMETER IS THE FIRST THING THIS DEFECT NEEDED ────────
     *
     * Founder: *"click a wall, it highlights for about a second, then the
     * highlight is lost."*
     *
     * MEASURED 2026-08-22 — `unselectAll()` has **eighteen** call sites that can
     * fire on or shortly after a click, across seven files, and they emit a
     * BYTE-IDENTICAL `bim-selection-changed { object: null }`. Among them:
     * `_reresolveSelectionAfterRebuild` (a rebuild the selection did not survive),
     * `setEnabled(false)` (reached from `ToolManager.activateTool` AFTER two
     * `await`s, i.e. an unbounded delay), three separate pick-miss branches inside
     * `performSelection`, `ViewController.activate` (every view switch), and
     * `select()` itself, which calls `unselectAll()` on EVERY successful selection
     * so a null always precedes the object.
     *
     * ⭐ SO "THE HIGHLIGHT DISAPPEARED" HAD EXACTLY ONE OBSERVABLE FORM FOR
     * EIGHTEEN DIFFERENT CAUSES, five of which are correct behaviour. That is the
     * `context-data-honesty-family` rule at the interaction layer — and it is why
     * the FIRST change here is the probe, not the fix
     * ([[context-data-honesty-family]]: ship the probe before the fix).
     *
     * `reason` is OPTIONAL so the ~14 external callers
     * (engineLauncher, ViewController, initUI, initTools, BimService,
     * ContextualEditBar, SlabPickWallsController, deleteIfcElement, SelectionBus)
     * compile and behave unchanged; they report as 'unspecified', which is itself
     * information — it says the clear came from outside this class.
     *
     * ⚠ THE LOG IS DELIBERATELY UNCONDITIONAL. A deselect is a user-visible state
     * change that happens a few times a minute, not a per-frame event, so it does
     * not need `warnHot` throttling — and throttling it would reintroduce exactly
     * the ambiguity it exists to remove.
     */
    unselectAll(reason: string = 'unspecified') {
        if (this.selectedObject) {
            console.log(
                `[§SELECT-CLEARED] reason=${reason} id=${String(this.selectedObject.userData?.id ?? 'n/a')} `
                + `type=${String(this.selectedObject.userData?.elementType ?? this.selectedObject.userData?.type ?? 'n/a')}`,
            );
        }
        // §FIX-ESC-DESELECT-ELEVATION (L-125) — the plan-view section/elevation MARK
        // selection (its marker highlight AND crop-gizmo scope handles) is tracked in
        // `window.__pryzmSelectedAnnotationId`, which PlanViewAnnotationRenderer reads via
        // `_getSelectedAnnotationId()` to paint the selected scope overlay and to enable
        // scope-handle hit-testing. That state lives OUTSIDE `selectedObject`, so
        // unselectAll() — the single owner of the deselect intent, reached on ESC via the
        // `window.unselectAll` wrapper — previously never cleared it. A section deselected
        // only because its teardown happened to run through here with a live selectedObject;
        // an elevation's mark selection was left "stuck" (marker + crop gizmo persisted after
        // ESC → deactivateAll → unselectAll). Clearing it here gives section AND elevation the
        // identical teardown path (no per-type branch). Including it in `wasSelected` fires
        // `bim-selection-changed`, which drives PlanViewManager to repaint and drop the overlay.
        const hadAnnotationSelection = window.__pryzmSelectedAnnotationId != null;
        if (hadAnnotationSelection) window.__pryzmSelectedAnnotationId = null;

        const wasSelected = this.selectedObject !== null
            || this._marqueeHighlightMeshes.length > 0
            || hadAnnotationSelection;
        this.selectedObject = null;

        // Release the level-plane Y constraint before clearing the highlight
        // (clearHighlight detaches TransformControls which implicitly resets showY,
        // but we detach first to restore showY cleanly and clear lockedY state).
        if (this.levelPlaneConstraint) {
            this.levelPlaneConstraint.detach();
        }

        this.clearHighlight();
        // §MARQUEE-SELECT-2026 — also dispose any secondary marquee highlights.
        this._clearMarqueeHighlights();

        // Clear sub-element cache and tracking state
        window.__curtainSubElement = null;
        this.resetSubElementState();

        // Reset kitchen sub-unit cycling state
        this.resetKcSubState();

        // Reset wardrobe sub-unit cycling state (§16 §2.6)
        this.resetWdSubState();

        // Hide wardrobe run inspector on deselect
        const wdRunInsp = window.wardrobeRunInspector;
        if (wdRunInsp) wdRunInsp.hide();

        // §KITCHEN-RUN-INSPECTOR-PARITY (2026-05-23) — hide the kitchen run + unit
        // inspectors on deselect too (mirrors the wardrobe above), so they don't
        // linger after the kitchen is deselected.
        const kRunInsp = window.kitchenRunInspector;
        if (kRunInsp) kRunInsp.hide();
        const kUnitInsp = window.kitchenUnitInspector;
        if (kUnitInsp) kUnitInsp.hide();

        // Reset hover cursor (element still under pointer but deselected)
        // _onPointerMove will restore 'pointer' on next move if element is still hovered
        this.domElement.style.cursor = '';
        this._lastHoveredUuid = null;
        this._lastHoveredObject = null;
        // §SELECT-3D-1 — mirror reset for the GPU-confirmed ref + anchor.
        this._lastHoveredObjectGpu = null;
        this._lastHoveredInstanceIdGpu = null;
        this._lastHoverConfirmedClientX = null;
        this._lastHoverConfirmedClientY = null;

        if (wasSelected) {
            window.dispatchEvent(new CustomEvent('bim-selection-changed', { detail: { object: null } })); // keep DOM for plugins
            (window as any).runtime?.events?.emit('bim-selection-changed', { object: null }); // F.events.16 bridge
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Curtain Wall Sub-Element Helpers
    // (All methods below are new — zero impact on any other element type)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Cycle to the next sub-element of the selected curtain wall.
     * Order: parent CW → panels (sorted by cell index) → mullions → parent CW (wrap)
     */
    private cycleSubElement(cwGroup: THREE.Object3D): void {
        const cwId = cwGroup.userData?.id;
        if (!cwId) return;

        // Build list on first Tab press after selecting (or after reset)
        if (this.cwSubElements.length === 0) {
            this.cwSubElements = this.buildSubElementList(cwGroup, cwId);
        }

        if (this.cwSubElements.length === 0) return; // nothing to cycle

        this.cwSubElementIndex++;

        if (this.cwSubElementIndex >= this.cwSubElements.length) {
            // Wrap around: back to parent CW view
            this.cwSubElementIndex = -1;
            this.clearSubElementHighlight();
            window.__curtainSubElement = null;
            this.updateInspector(cwGroup);

            // Small toast hint so the user knows we looped back
            console.log('[SelectionManager] CW sub-element cycling: back to parent curtain wall');
            return;
        }

        const subEl = this.cwSubElements[this.cwSubElementIndex];
        console.log(`[SelectionManager] CW sub-element: [${this.cwSubElementIndex + 1}/${this.cwSubElements.length}]`, subEl.type, subEl.id.slice(0, 12));

        // Show amber highlight on the sub-element
        this.showSubElementHighlight(cwGroup, subEl, null, undefined);

        window.__curtainSubElement = subEl;
        this.updateInspector(cwGroup);
    }

    /**
     * Build the ordered list of CurtainSubElement descriptors for Tab cycling.
     * Panels first (sorted row-major), then vertical mullions, then horizontal mullions.
     */
    private buildSubElementList(cwGroup: THREE.Object3D, cwId: string): CurtainSubElement[] {
        const list: CurtainSubElement[] = [];

        // ── Panels from CurtainPanelStore (non-empty only) ────────────────────
        const panelStore = window.curtainPanelStore; // TODO(TASK-08)
        if (panelStore) {
            const panels: any[] = panelStore.getByCurtainWallId?.(cwId) ?? [];
            // Sort: row ascending (j), then column ascending (i)
            panels.sort((a, b) => {
                const dj = (a.cellIndex?.[1] ?? 0) - (b.cellIndex?.[1] ?? 0);
                return dj !== 0 ? dj : ((a.cellIndex?.[0] ?? 0) - (b.cellIndex?.[0] ?? 0));
            });

            for (const panel of panels) {
                if (panel.panelType === 'SystemPanel_Empty') continue;
                list.push({
                    type: 'panel',
                    id: panel.id,
                    parentCwId: cwId,
                    panelData: panel,
                    cellIndex: panel.cellIndex,
                    panelType: panel.panelType,
                });
            }
        }

        // ── Mullions from scene children ──────────────────────────────────────
        cwGroup.children.forEach(child => {
            if (child.userData?.role === 'mullion' && child.userData?.id) {
                list.push({
                    type: 'mullion',
                    id: child.userData.id,
                    parentCwId: cwId,
                    mullionAxis: child.userData.mullionAxis ?? 'u',
                    mullionT: child.userData.mullionT,
                });
            }
        });

        return list;
    }

    /**
     * §Feasibility — Read-only sub-element cache writer.
     *
     * Inspects the raw hit object from the raycaster (before parent resolution)
     * to detect whether a curtain wall panel or mullion was clicked.
     * Returns a CurtainSubElement descriptor, or null if the hit is not a CW sub-element.
     *
     * This method never modifies SelectionManager state — it only reads userData.
     * It does NOT change which object gets selected (that remains the parent CW group).
     */
    private detectCurtainSubElement(
        obj: THREE.Object3D,
        instanceId?: number
    ): CurtainSubElement | null {
        const ud = obj.userData;
        if (!ud || !ud.isSubElement) return null;

        // ── Individual panel mesh (from CurtainPanelBuilder) ───────────────
        if (ud.elementType === 'CurtainPanel' && ud.elementId) {
            const panelStore = window.curtainPanelStore; // TODO(TASK-08)
            const panelData = panelStore?.get?.(ud.elementId);
            return {
                type: 'panel',
                id: ud.elementId,
                parentCwId: ud.curtainWallId || ud.parentId || '',
                panelData,
                cellIndex: ud.cellIndex ?? panelData?.cellIndex,
                panelType: ud.panelType ?? panelData?.panelType,
            };
        }

        // ── Instanced panel mesh (from CurtainWallInstanceManager) ─────────
        // InstancedMesh hit provides instanceId; instancePanelIds maps it to a panel ID.
        if (ud.elementType === 'CurtainPanelInstanced' && instanceId !== undefined) {
            const ids: string[] = ud.instancePanelIds ?? [];
            const panelId = ids[instanceId];
            if (panelId) {
                const panelStore = window.curtainPanelStore; // TODO(TASK-08)
                const panelData = panelStore?.get?.(panelId);
                return {
                    type: 'panel',
                    id: panelId,
                    parentCwId: panelData?.curtainWallId || ud.parentId || '',
                    panelData,
                    cellIndex: panelData?.cellIndex,
                    panelType: panelData?.panelType ?? ud.panelType,
                };
            }
        }

        // ── Mullion mesh (from CurtainWallBuilder — now with stable id) ────
        if (ud.role === 'mullion' && ud.id) {
            return {
                type: 'mullion',
                id: ud.id,
                parentCwId: ud.parentId || '',
                mullionAxis: ud.mullionAxis ?? 'u',
                mullionT: ud.mullionT,
            };
        }

        return null;
    }

    /**
     * Place a tight amber OBB around a curtain wall sub-element.
     *
     * The box is computed entirely in the CW group's LOCAL coordinate space
     * (where local-X = CW length direction, local-Y = vertical, local-Z = depth),
     * then oriented using the CW group's world-space yaw — exactly the same
     * technique used for the parent green highlight box.
     *
     * Size source (highest fidelity):
     *   • Instanced panel: instance matrix gives localPos + scale(panelW, panelH, 1);
     *     geometry.parameters.depth gives panelThickness.
     *   • Individual panel mesh: BoxGeometry.parameters gives (panelW, panelH, depth).
     *   • Mullion mesh: BoxGeometry.parameters gives the exact (w, h, d) for u/v mullions.
     *
     * @param cwGroup    — parent curtain wall Group (world transform source)
     * @param subEl      — sub-element descriptor (type, id)
     * @param hitObject  — raw raycaster-hit object, or null when called from Tab cycling
     * @param instanceId — InstancedMesh instance index (undefined when called from Tab)
     */
    private showSubElementHighlight(
        cwGroup: THREE.Object3D,
        subEl: CurtainSubElement,
        hitObject: THREE.Object3D | null,
        instanceId: number | undefined
    ): void {
        this.clearSubElementHighlight();

        // localCenter and size are both in the CW group's LOCAL space.
        // We transform localCenter to world space at the end via cwGroup.matrixWorld.
        let localCenter: THREE.Vector3 | null = null;
        let size: THREE.Vector3 | null = null;

        // ── 1. Try the direct raycaster hit (best accuracy on click) ─────────
        const bounds = hitObject
            ? this.boundsFromHit(hitObject, instanceId)
            : null;

        if (bounds) {
            localCenter = bounds.localCenter;
            size        = bounds.size;
        }

        // ── 2. Fall back: search cwGroup for the sub-element by id ───────────
        if (!localCenter || !size) {
            const found = this.boundsFromSearch(cwGroup, subEl);
            if (found) {
                localCenter = found.localCenter;
                size        = found.size;
            }
        }

        if (!localCenter || !size) return; // cannot determine bounds

        // ── 3. Transform local center → world space ───────────────────────────
        // cwGroup.matrixWorld encodes: scale(1,1,1) · rotation.y(angle+π/2) · translation
        // Applying it to a local point gives the exact world position.
        const worldCenter = localCenter.clone().applyMatrix4(cwGroup.matrixWorld);

        // ── 4. Build highlight mesh in world space with CW group OBB rotation ─
        // Extract yaw-only quaternion (same method as the parent green highlight)
        // so the box stays upright and aligned with the CW direction.
        const rawQ  = cwGroup.getWorldQuaternion(new THREE.Quaternion());
        const euler = new THREE.Euler().setFromQuaternion(rawQ, 'YXZ');
        const obb   = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, euler.y, 0, 'YXZ'));

        const PADDING = 0.04; // small clearance so the box doesn't z-fight the surface
        const geo = new THREE.BoxGeometry(
            size.x + PADDING,
            size.y + PADDING,
            Math.max(size.z, 0.06) + PADDING   // enforce minimum visible depth
        );

        const mat = new THREE.MeshBasicMaterial({
            color: 0xff8c00,  // amber/orange — distinct from the green parent highlight
            transparent: true,
            opacity: 0.22,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        this.cwSubHighlight = new THREE.Mesh(geo, mat);
        this.cwSubHighlight.position.copy(worldCenter);
        this.cwSubHighlight.quaternion.copy(obb);
        this.cwSubHighlight.userData.isHelper = true;

        const edgesGeo = new THREE.EdgesGeometry(geo);
        const edgesMat = new THREE.LineBasicMaterial({ color: 0xff8c00, linewidth: 2 });
        this.cwSubHighlight.add(new THREE.LineSegments(edgesGeo, edgesMat));

        this.world.scene.three.add(this.cwSubHighlight);
    }

    /**
     * Compute local-space center and size from the raycaster hit object.
     *
     * "Local space" here means the CW GROUP's local coordinate system
     * (same frame used by mesh.position in CurtainWallBuilder).
     *
     * Returns null when the geometry cannot be read (unexpected object type).
     */
    private boundsFromHit(
        hitObject: THREE.Object3D,
        instanceId: number | undefined
    ): { localCenter: THREE.Vector3; size: THREE.Vector3 } | null {

        if (hitObject instanceof THREE.InstancedMesh && instanceId !== undefined) {
            // ── Instanced panel ──────────────────────────────────────────────
            // InstancedMesh uses BoxGeometry(1, 1, panelThickness).
            // The instance matrix encodes: position=(cx,cy,0), scale=(panelW,panelH,1).
            const m = new THREE.Matrix4();
            hitObject.getMatrixAt(instanceId, m);

            const pos = new THREE.Vector3();
            const scl = new THREE.Vector3();
            const rot = new THREE.Quaternion();
            m.decompose(pos, rot, scl);

            const geomParams = (hitObject.geometry as THREE.BoxGeometry).parameters ?? {};
            const depth = geomParams.depth ?? 0.06;

            return {
                localCenter: pos,                           // already in group local space
                size: new THREE.Vector3(scl.x, scl.y, depth),
            };

        } else if (hitObject instanceof THREE.Mesh) {
            // ── Individual panel mesh or mullion mesh ────────────────────────
            // Both are built with BoxGeometry(w, h, d) at mesh.position in group local space.
            const geomParams = (hitObject.geometry as THREE.BoxGeometry).parameters ?? {};
            if (!geomParams.width) return null; // not a BoxGeometry

            return {
                localCenter: hitObject.position.clone(),    // local to CW group
                size: new THREE.Vector3(geomParams.width, geomParams.height, geomParams.depth),
            };
        }

        return null;
    }

    /**
     * Find the sub-element mesh by traversing cwGroup children and compute
     * its local-space center and size from geometry parameters.
     *
     * Used as fallback when hitObject is null (Tab cycling) or when the hit
     * object does not carry enough geometry info.
     */
    private boundsFromSearch(
        cwGroup: THREE.Object3D,
        subEl: CurtainSubElement
    ): { localCenter: THREE.Vector3; size: THREE.Vector3 } | null {

        let result: { localCenter: THREE.Vector3; size: THREE.Vector3 } | null = null;

        cwGroup.traverse(child => {
            if (result) return; // already found

            if (subEl.type === 'mullion') {
                // Mullion: match by userData.id
                if (child.userData?.id === subEl.id && child instanceof THREE.Mesh) {
                    const p = (child.geometry as THREE.BoxGeometry).parameters ?? {};
                    if (p.width) {
                        result = {
                            localCenter: child.position.clone(),
                            size: new THREE.Vector3(p.width, p.height, p.depth),
                        };
                    }
                }

            } else if (subEl.type === 'panel') {
                // Individual panel mesh (from CurtainPanelBuilder)
                if (child.userData?.elementId === subEl.id && child instanceof THREE.Mesh) {
                    const p = (child.geometry as THREE.BoxGeometry).parameters ?? {};
                    if (p.width) {
                        result = {
                            localCenter: child.position.clone(),
                            size: new THREE.Vector3(p.width, p.height, p.depth),
                        };
                    }
                    return;
                }

                // Instanced panel (from CurtainWallInstanceManager)
                if (child instanceof THREE.InstancedMesh) {
                    const ids: string[] = child.userData?.instancePanelIds ?? [];
                    const idx = ids.indexOf(subEl.id);
                    if (idx >= 0) {
                        const m = new THREE.Matrix4();
                        child.getMatrixAt(idx, m);

                        const pos = new THREE.Vector3();
                        const scl = new THREE.Vector3();
                        const rot = new THREE.Quaternion();
                        m.decompose(pos, rot, scl);

                        const geomParams = (child.geometry as THREE.BoxGeometry).parameters ?? {};
                        const depth = geomParams.depth ?? 0.06;

                        result = {
                            localCenter: pos,
                            size: new THREE.Vector3(scl.x, scl.y, depth),
                        };
                    }
                }
            }
        });

        return result;
    }

    /** Remove the amber sub-element highlight from the scene. */
    private clearSubElementHighlight(): void {
        if (this.cwSubHighlight) {
            this.world.scene.three.remove(this.cwSubHighlight);   // DETACH now…
            // §SELECT-HIGHLIGHT-RELEASE-AT-BOUNDARY (L-1002) — …RELEASE at the frame
            // boundary (see clearHighlight for the full reasoning). This clear is
            // reached from unselectAll() on every selection change, which is the exact
            // path the founder's `usedTimes` stack names.
            scheduleGpuRelease(this.cwSubHighlight.geometry as THREE.BufferGeometry);
            scheduleGpuRelease(this.cwSubHighlight.material as THREE.Material);
            this.cwSubHighlight = null;
        }
    }

    /** Reset all sub-element tracking state (without affecting window cache). */
    private resetSubElementState(): void {
        this.clearSubElementHighlight();
        this.cwSubElements = [];
        this.cwSubElementIndex = -1;
    }

    // ── Kitchen Tab cycling ───────────────────────────────────────────────────

    /** True if the given object is a placed kitchen cabinet furniture group. */
    private isKitchenFurniture(obj: THREE.Object3D): boolean {
        const ft = (obj.userData?.furnitureType ?? '').toString().toLowerCase();
        return ft.startsWith('kitchen_');
    }

    /** True if the given object is a placed wardrobe cabinet furniture group. */
    private isWardrobeFurniture(obj: THREE.Object3D): boolean {
        const ft = (obj.userData?.furnitureType ?? '').toString().toLowerCase();
        return ft.startsWith('wardrobe_');
    }

    /**
     * Cycle through kitchen units (and countertop slab) one Tab press at a time.
     * Order: whole run → unit[0] → unit[1] → … → countertop → whole run (wrap)
     */
    private cycleKitchenUnit(kitchenRoot: THREE.Object3D): void {
        const furnitureId = kitchenRoot.userData?.id as string | undefined;
        if (!furnitureId) return;

        // Build unit list on first Tab press
        if (this.kcSubUnits.length === 0) {
            this.kcSubUnits = this._buildKcUnitList(kitchenRoot);
        }

        // Total steps: N units + 1 countertop
        const totalSteps = this.kcSubUnits.length + 1;
        this.kcSubUnitIndex++;

        if (this.kcSubUnitIndex >= totalSteps) {
            // Wrap: back to whole-run view
            this.kcSubUnitIndex = -1;
            this._clearKcHighlight();
            window.__kitchenSubUnit = null;
            // Show run inspector
            const runInsp = window.kitchenRunInspector;
            if (runInsp) runInsp.show(furnitureId);
            const unitInsp = window.kitchenUnitInspector;
            if (unitInsp) unitInsp.hide();
            console.log('[SelectionManager] Kitchen: back to whole-run view');
            return;
        }

        const isCountertopStep = this.kcSubUnitIndex === this.kcSubUnits.length;

        if (isCountertopStep) {
            // Highlight the countertop slab
            this._clearKcHighlight();
            kitchenRoot.traverse(child => {
                if (child.userData?.isKitchenCountertop && !this.kcSubHighlight) {
                    const mesh = child as THREE.Mesh;
                    const bbox = new THREE.Box3().setFromObject(mesh);
                    const size   = new THREE.Vector3();
                    const center = new THREE.Vector3();
                    bbox.getSize(size);
                    bbox.getCenter(center);
                    const hlGeo = new THREE.BoxGeometry(size.x + 0.02, size.y + 0.02, size.z + 0.02);
                    const hlMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.4, depthTest: false });
                    this.kcSubHighlight = new THREE.Mesh(hlGeo, hlMat);
                    this.kcSubHighlight.position.copy(center);
                    this.world.scene.three.add(this.kcSubHighlight);
                }
            });
            window.__kitchenSubUnit = { type: 'countertop', furnitureId };
            const unitInsp = window.kitchenUnitInspector;
            if (unitInsp) unitInsp.hide();
            const runInsp  = window.kitchenRunInspector;
            if (runInsp) runInsp.show(furnitureId);
            console.log('[SelectionManager] Kitchen: countertop selected');
        } else {
            // Highlight a specific unit group
            const unitEntry = this.kcSubUnits[this.kcSubUnitIndex];
            this._clearKcHighlight();

            const bbox = new THREE.Box3().setFromObject(unitEntry.group);
            const size   = new THREE.Vector3();
            const center = new THREE.Vector3();
            bbox.getSize(size);
            bbox.getCenter(center);
            const hlGeo = new THREE.BoxGeometry(size.x + 0.03, size.y + 0.03, size.z + 0.03);
            const hlMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.4, depthTest: false });
            this.kcSubHighlight = new THREE.Mesh(hlGeo, hlMat);
            this.kcSubHighlight.position.copy(center);
            this.world.scene.three.add(this.kcSubHighlight);

            window.__kitchenSubUnit = { type: 'unit', furnitureId, unitIndex: unitEntry.index, arm: unitEntry.arm };
            const unitInsp = window.kitchenUnitInspector;
            if (unitInsp) unitInsp.show(furnitureId, unitEntry.index, unitEntry.arm as any);
            const runInsp  = window.kitchenRunInspector;
            if (runInsp) runInsp.hide();
            console.log(`[SelectionManager] Kitchen unit [${this.kcSubUnitIndex + 1}/${this.kcSubUnits.length}] arm=${unitEntry.arm} index=${unitEntry.index}`);
        }
    }

    /** Build ordered list of kitchen unit sub-elements from the furniture root. */
    private _buildKcUnitList(root: THREE.Object3D): Array<{ group: THREE.Object3D; index: number; arm: string }> {
        const list: Array<{ group: THREE.Object3D; index: number; arm: string }> = [];
        // The engine adds a child group (mesh group) to the root, then units are grandchildren
        root.traverse(child => {
            if (child.userData?.kitchenUnitIndex !== undefined && child.userData?.kitchenArm !== undefined) {
                list.push({
                    group: child,
                    index: child.userData.kitchenUnitIndex as number,
                    arm:   child.userData.kitchenArm as string,
                });
            }
        });
        // Sort: main arm first (by index), then left, then right
        const armOrder: Record<string, number> = { main: 0, left: 1, right: 2 };
        list.sort((a, b) => {
            const ao = armOrder[a.arm] ?? 9;
            const bo = armOrder[b.arm] ?? 9;
            return ao !== bo ? ao - bo : a.index - b.index;
        });
        return list;
    }

    /** Clear kitchen amber sub-highlight from scene. */
    private _clearKcHighlight(): void {
        if (this.kcSubHighlight) {
            this.world.scene.three.remove(this.kcSubHighlight);   // DETACH now…
            // §SELECT-HIGHLIGHT-RELEASE-AT-BOUNDARY (L-1002) — …RELEASE at the frame
            // boundary (see clearHighlight for the full reasoning). This clear is
            // reached from unselectAll() on every selection change, which is the exact
            // path the founder's `usedTimes` stack names.
            scheduleGpuRelease(this.kcSubHighlight.geometry as THREE.BufferGeometry);
            scheduleGpuRelease(this.kcSubHighlight.material as THREE.Material);
            this.kcSubHighlight = null;
        }
    }

    /** Reset kitchen cycling state. */
    private resetKcSubState(): void {
        this._clearKcHighlight();
        this.kcSubUnits      = [];
        this.kcSubUnitIndex  = -1;
        window.__kitchenSubUnit = null;
    }

    // ── Wardrobe Tab cycling (§16 §2.6 — parity with kitchen) ────────────────

    /**
     * Cycle through wardrobe units one Tab press at a time.
     * Order: whole run → unit[0] → unit[1] → … → whole run (wrap)
     */
    private cycleWardrobeUnit(wardrobeRoot: THREE.Object3D): void {
        const furnitureId = wardrobeRoot.userData?.id as string | undefined;
        if (!furnitureId) return;

        if (this.wdSubUnits.length === 0) {
            this.wdSubUnits = this._buildWdUnitList(wardrobeRoot);
        }

        // No discoverable sub-units → keep the whole-run highlight.
        if (this.wdSubUnits.length === 0) return;

        this.wdSubUnitIndex++;

        if (this.wdSubUnitIndex >= this.wdSubUnits.length) {
            this.wdSubUnitIndex = -1;
            this._clearWdHighlight();
            window.__wardrobeSubUnit = null;
            const runInsp = window.wardrobeRunInspector;
            if (runInsp) runInsp.show(furnitureId);
            const unitInsp = window.wardrobeSectionInspector;
            if (unitInsp) unitInsp.hide();
            return;
        }

        const unitEntry = this.wdSubUnits[this.wdSubUnitIndex];
        this._clearWdHighlight();

        const bbox = new THREE.Box3().setFromObject(unitEntry.group);
        const size   = new THREE.Vector3();
        const center = new THREE.Vector3();
        bbox.getSize(size);
        bbox.getCenter(center);
        const hlGeo = new THREE.BoxGeometry(size.x + 0.03, size.y + 0.03, size.z + 0.03);
        const hlMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.4, depthTest: false });
        this.wdSubHighlight = new THREE.Mesh(hlGeo, hlMat);
        this.wdSubHighlight.position.copy(center);
        this.world.scene.three.add(this.wdSubHighlight);

        window.__wardrobeSubUnit = { type: 'unit', furnitureId, unitIndex: unitEntry.index, arm: unitEntry.arm };
        const unitInsp = window.wardrobeSectionInspector;
        if (unitInsp) unitInsp.show(furnitureId, unitEntry.index, unitEntry.arm as any);
        const runInsp  = window.wardrobeRunInspector;
        if (runInsp) runInsp.hide();
    }

    /** Build ordered list of wardrobe unit sub-elements from the furniture root. */
    private _buildWdUnitList(root: THREE.Object3D): Array<{ group: THREE.Object3D; index: number; arm: string }> {
        const list: Array<{ group: THREE.Object3D; index: number; arm: string }> = [];
        root.traverse(child => {
            // The wardrobe engines tag unit groups with wardrobeUnitIndex/wardrobeArm
            // analogous to kitchenUnitIndex/kitchenArm.
            if (child.userData?.wardrobeUnitIndex !== undefined && child.userData?.wardrobeArm !== undefined) {
                list.push({
                    group: child,
                    index: child.userData.wardrobeUnitIndex as number,
                    arm:   child.userData.wardrobeArm as string,
                });
            }
        });
        const armOrder: Record<string, number> = { main: 0, left: 1, right: 2 };
        list.sort((a, b) => {
            const ao = armOrder[a.arm] ?? 9;
            const bo = armOrder[b.arm] ?? 9;
            return ao !== bo ? ao - bo : a.index - b.index;
        });
        return list;
    }

    /** Clear wardrobe amber sub-highlight from scene. */
    private _clearWdHighlight(): void {
        if (this.wdSubHighlight) {
            this.world.scene.three.remove(this.wdSubHighlight);   // DETACH now…
            // §SELECT-HIGHLIGHT-RELEASE-AT-BOUNDARY (L-1002) — …RELEASE at the frame
            // boundary (see clearHighlight for the full reasoning). This clear is
            // reached from unselectAll() on every selection change, which is the exact
            // path the founder's `usedTimes` stack names.
            scheduleGpuRelease(this.wdSubHighlight.geometry as THREE.BufferGeometry);
            scheduleGpuRelease(this.wdSubHighlight.material as THREE.Material);
            this.wdSubHighlight = null;
        }
    }

    /** Reset wardrobe cycling state. */
    private resetWdSubState(): void {
        this._clearWdHighlight();
        this.wdSubUnits      = [];
        this.wdSubUnitIndex  = -1;
        window.__wardrobeSubUnit = null;
    }

    private clearHighlight() {
        if (this.highlightMesh) {
            this.world.scene.three.remove(this.highlightMesh);
            // §SELECT-HIGHLIGHT-GEOMETRY — highlightMesh may be a single Mesh
            // (registry mesh path / box fallback, with an edges child) OR a Group
            // of geometry-overlay clones.  Traverse and dispose everything we own,
            // but NEVER dispose geometry SHARED with a live element (overlay clones,
            // flagged sharedGeometry) — that would destroy the real element's
            // buffers.  Materials are deduped so a shared overlay material is
            // disposed exactly once.
            //
            // §SELECT-CLEARHIGHLIGHT-DISPOSE-GUARD (superseded in part — read on) —
            // a raw `material.dispose()` throws `TypeError: Cannot read properties of
            // undefined (reading 'usedTimes')` on the WebGPU backend when the
            // material's NodeManager render-object was already torn down. Because
            // clearHighlight() runs at the TOP of applyHighlight() on EVERY selection,
            // that throw propagated out of the GPU click pick → `[PickResolver] GPU
            // pick threw — falling back to BVH` on every click.
            //
            // §SELECT-HIGHLIGHT-RELEASE-AT-BOUNDARY (L-1002, founder P0 2026-08-18) —
            // THE GUARD WAS NOT ENOUGH, AND THIS IS WHY. `safeDisposeMaterial` /
            // `safeDisposeGeometry` SWALLOW that TypeError. Swallowing is not
            // ordering. The resource was still freed here, inside the click handler,
            // while the previous frame's command buffer may still reference it — and
            // the throw is merely the LOUDEST possible outcome of that. The quiet
            // outcome is a corrupted program cache and a mesh that stops drawing. The
            // founder's console shows both halves: the EventBus reporting
            // `listener for "bim-selection-changed" threw: … 'usedTimes'` with
            // `unselectAll` in the stack, then `[ViewportCrashGuard] §I3 suppressed
            // non-fatal GPU internal … 1/12` twelve times over.
            //
            // The fix is the ordering ADR-0297 INVARIANT L2 already declares and every
            // fragment builder already uses: DETACH now (done above, `scene.remove`),
            // RELEASE at the frame boundary the RENDERER owns. `scheduleGpuRelease`
            // enqueues in O(1) and touches no GPU state, so it is safe from a click
            // handler; `RenderPipelineManager.render()` drains it at the top of a
            // frame — after the previous submit returned, before this frame opens an
            // encoder. That is the single declared authority for "when is it safe to
            // release", not a fifth local workaround.
            //
            // The resources are enqueued INDIVIDUALLY rather than as one subtree,
            // because this traverse knows something `safeDisposeObject3D` cannot:
            // §SELECT-HIGHLIGHT-GEOMETRY — a clone flagged `sharedGeometry` reuses a
            // LIVE element's buffers, and releasing it would destroy the real
            // element's geometry. Handing the whole group to the queue would have
            // traded this defect for a worse one. Materials stay deduped so a shared
            // overlay material is released exactly once.
            const releasedMats = new Set<THREE.Material>();
            this.highlightMesh.traverse((child) => {
                const m = child as THREE.Mesh & THREE.LineSegments;
                if (!(m.isMesh || (m as unknown as THREE.Line).isLine)) return;
                if (!child.userData?.sharedGeometry) {
                    scheduleGpuRelease(m.geometry as THREE.BufferGeometry | undefined);
                }
                const mat = m.material as THREE.Material | THREE.Material[] | undefined;
                if (Array.isArray(mat)) {
                    for (const mm of mat) {
                        if (mm && !releasedMats.has(mm)) { releasedMats.add(mm); scheduleGpuRelease(mm); }
                    }
                } else if (mat && !releasedMats.has(mat)) {
                    releasedMats.add(mat);
                    scheduleGpuRelease(mat);
                }
            });
            this.highlightMesh = null;
        }
        this.transformControls.detach();
    }

    /**
     * §MARQUEE-SELECT-2026 — Public read-only accessor for the selectable cache.
     *
     * `MarqueeSelectionTool` calls this on pointer-up to iterate every BIM
     * element in the scene and test its world-space AABB against the marquee
     * rectangle.  Returns the SAME array used by raycasting (built lazily on
     * first hover/click and invalidated on any element add/update/delete) so
     * marquee selection stays in lock-step with single-click selection.
     */
    public getSelectableCache(): readonly THREE.Object3D[] {
        if (!this._selectableCache) {
            // Lazy build, mirroring the hover path.
            this._selectableCache = [];
            this.world.scene.three.traverse(obj => {
                if (obj.userData?.isHelper || obj.userData?.isPreview
                    // §148 HIDDEN-LEVEL-NOT-SELECTABLE — cumulative ancestor visibility
                    // (matches the GPU/BVH pick) so an element under a hidden level/group
                    // is excluded even if its own .visible flag is still true.
                    || obj.userData?.underlayActive || !isObjectEffectivelyVisible(obj)) return;
                const type = (obj.userData?.elementType
                           || obj.userData?.type
                           || '').toLowerCase();
                if (obj.userData?.selectable
                    || this.isSemanticType(type)
                    || type === 'slab') {
                    this._selectableCache!.push(obj);
                }
            });
        }
        return this._selectableCache;
    }

    // ── §MARQUEE-SELECT-2026 — Marquee multi-highlight API ──────────────────

    /**
     * Replace the current set of secondary marquee highlights.
     *
     * Called by `SelectionBus.selectMany()` after the marquee tool resolves
     * the rectangle into element IDs.  This method is intentionally simple:
     * for each id, look up the scene object and add a green wireframe AABB
     * to the scene.  The PRIMARY (last-clicked) element is highlighted
     * separately by `applyHighlight()` with a precise OBB / extruded shape.
     *
     * Pass `[]` to clear all marquee highlights without touching the primary.
     */
    public applyMarqueeHighlights(ids: string[]): void {
        this._clearMarqueeHighlights();
        if (!ids || ids.length === 0) return;

        const scene = (this.world as any).scene?.three as THREE.Scene | undefined;
        if (!scene) return;

        // Build a one-shot id → object map so we don't traverse the scene per id.
        const wanted = new Set(ids);
        const found  = new Map<string, THREE.Object3D>();
        scene.traverse((obj) => {
            const oid = obj.userData?.id;
            if (oid && wanted.has(oid) && !found.has(oid)) found.set(oid, obj);
        });

        // §16 — Marquee highlight uses the same green family as the primary
        // highlight so the user reads them as one selection.  AABB is acceptable
        // here per §16 §2.4 because these are visually subordinate to the
        // primary OBB and only need to communicate "this is also selected".
        const lineMat = new THREE.LineBasicMaterial({
            color:        0x00ff66,
            transparent:  true,
            opacity:      0.85,
            depthTest:    false,
        });

        for (const id of ids) {
            const obj = found.get(id);
            if (!obj) continue;
            try {
                const box = new THREE.Box3().setFromObject(obj);
                if (box.isEmpty()) continue;
                const size   = new THREE.Vector3();
                const center = new THREE.Vector3();
                box.getSize(size);
                box.getCenter(center);
                if (size.x <= 0 || size.y <= 0 || size.z <= 0) continue;

                // PADDING so the wireframe sits visibly outside the geometry.
                const PAD = 0.02;
                const geo = new THREE.BoxGeometry(
                    size.x + PAD,
                    size.y + PAD,
                    size.z + PAD,
                );
                const edges = new THREE.EdgesGeometry(geo);
                const wire  = new THREE.LineSegments(edges, lineMat);
                wire.position.copy(center);
                wire.userData.isHelper      = true;
                wire.userData.isMarqueeHL   = true;
                wire.renderOrder            = 999;
                // §SELECT-HIGHLIGHT-RELEASE-AT-BOUNDARY (L-1002) — DELIBERATELY synchronous.
                // `geo` is the scratch BoxGeometry that EdgesGeometry was derived from on
                // the CPU two lines up; it is never added to the scene and never uploaded,
                // so no in-flight submit can reference it. Only resources that WERE being
                // drawn need the frame boundary.
                safeDisposeGeometry(geo); // EdgesGeometry has its own buffer
                scene.add(wire);
                this._marqueeHighlightMeshes.push(wire);
            } catch {
                // Defensive: never let a single bad bounding box break the loop.
            }
        }
    }

    /** Internal — dispose every secondary marquee highlight mesh. */
    private _clearMarqueeHighlights(): void {
        if (this._marqueeHighlightMeshes.length === 0) return;
        const scene = (this.world as any).scene?.three as THREE.Scene | undefined;
        for (const m of this._marqueeHighlightMeshes) {
            if (scene) scene.remove(m);          // DETACH now…
            const ls = m as THREE.LineSegments;
            // §SELECT-HIGHLIGHT-RELEASE-AT-BOUNDARY (L-1002) — …RELEASE at the frame
            // boundary. Same reasoning as clearHighlight(): these wires were being
            // drawn until the line above, so freeing them in the same turn is the
            // use-after-free ADR-0297 INVARIANT L2 exists to prevent. Every marquee
            // wire owns its own EdgesGeometry (minted in applyMarqueeHighlights), so
            // there is no shared-geometry exception to make here.
            scheduleGpuRelease(ls.geometry as THREE.BufferGeometry | undefined);
            const mat = ls.material as THREE.Material | THREE.Material[] | undefined;
            if (Array.isArray(mat)) mat.forEach(mm => scheduleGpuRelease(mm));
            else if (mat) scheduleGpuRelease(mat);
        }
        this._marqueeHighlightMeshes = [];
    }

    /**
     * A2 — Throttled hover detection via pointermove.
     *
     * Raycasts into the selectable scene objects at most once every
     * HOVER_THROTTLE_MS milliseconds. When the hovered root changes,
     * dispatches 'bim-hover-changed' so EngineBootstrap can forward it
     * to RenderPipelineManager.setHoveredObjects() for the TSL outline.
     *
     * Only fires when SelectionManager is enabled and the user is not
     * currently transforming (dragging) an object.
     */
    private _onPointerMove(event: PointerEvent): void {
        // §SELECT-STUCK-STATE-SELFHEAL — track real pointer-drag distance for the
        // self-healing click guard. MUST run BEFORE the guards below: a camera
        // orbit sets window.isCameraDragging=true, which would otherwise skip this
        // and we'd never learn the user actually dragged. Marks the current gesture
        // as a genuine drag once the pointer leaves the click threshold.
        if (!this._pointerDraggedThisGesture && this._pointerDownClientX !== null && this._pointerDownClientY !== null) {
            const ddx = event.clientX - this._pointerDownClientX;
            const ddy = event.clientY - this._pointerDownClientY;
            if (ddx * ddx + ddy * ddy > SelectionManager.POINTER_DRAG_PX2) {
                this._pointerDraggedThisGesture = true;
            }
        }

        if (!this.enabled || this.isTransforming) return;
        // Suppress hover raycasting while the camera is being dragged (orbit / pan).
        // Matches Pascal's cameraDragging guard for the SelectionManager hover path.
        if (window.isCameraDragging) return;

        const now = Date.now();
        if (now - this._lastPointerMoveTime < this.HOVER_THROTTLE_MS) return;
        this._lastPointerMoveTime = now;

        const rect = this.domElement.getBoundingClientRect();
        this._mouse.set(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );

        this._raycaster.setFromCamera(this._mouse, this.camera.three);

        // ── Phase D: bim-canvas-mouse-move dispatch (MirrorTool preview) ───
        {
            const levelY = window.activeLevelElevation ?? 0;
            const levelPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -levelY);
            const worldPt = new THREE.Vector3();
            this._raycaster.ray.intersectPlane(levelPlane, worldPt);
            window.dispatchEvent(new CustomEvent('bim-canvas-mouse-move', { // TODO(TASK-11)
                detail: { worldPoint: { x: worldPt.x, y: worldPt.y, z: worldPt.z } },
            }));
        }

        // BUG-10: Extracted to _ensureSelectableCache() — single canonical path.
        this._ensureSelectableCache();

        // ── G2-T1: rAF-throttled GPU pick (Wave 36 U-2 / A16-T8 / C04 §3.2) ───
        // The GPU pick is NEVER called synchronously here. Instead we capture the
        // latest cursor position and schedule _onHoverGpuPickRaf() for the next
        // animation frame.  If this pointermove arrives while an rAF is already
        // pending, we simply update the position — no second rAF is queued.
        // This collapses N pointer events per frame into exactly 1 GPU pick,
        // eliminating the 95–451 ms LONGTASKs that previously blocked the thread
        // on every mousemove burst.
        if (this._pickStrategy) {
            this._pendingHoverClientX = event.clientX;
            this._pendingHoverClientY = event.clientY;
            if (this._hoverRafId === null) {
                // G2-T1 / P3 compliance: use FrameScheduler's pre-render slot
                // rather than a bare rAF call (P3 gate: only RafAdapter owns rAF).
                // The scheduler auto-disposes on first fire; _onHoverGpuPickRaf
                // clears _hoverRafId so the next pointermove burst can re-arm.
                this._hoverRafId = getFrameScheduler().scheduleOnce(
                    'gpu-hover-pick',
                    () => this._onHoverGpuPickRaf(),
                    'pre-render',
                );
            }
            // BVH path below provides immediate (< 1 ms) feedback for the current
            // frame while GPU result arrives one pre-render slot later (~16 ms).
        }

        // A16-T8: BVH-pruned hover raycast — same pattern as click path.
        const hoverCandidates = this._bvhPruneCandidates(this._selectableCache!);
        const hits = this._raycaster.intersectObjects(hoverCandidates, true);

        let hoveredRoot: THREE.Object3D | null = null;
        if (hits.length > 0) {
            for (const hit of hits) {
                const root = this.findSelectableRoot(hit.object);
                if (root) { hoveredRoot = root; break; }
            }
        }

        const newUuid = hoveredRoot?.uuid ?? null;
        if (newUuid === this._lastHoveredUuid) return;
        this._lastHoveredUuid = newUuid;
        // Keep the actual object reference so Enter-key selection can use it
        this._lastHoveredObject = hoveredRoot;

        // Update cursor to give users clear visual feedback of hoverable elements
        this.domElement.style.cursor = hoveredRoot ? 'pointer' : '';

        window.dispatchEvent(new CustomEvent('bim-hover-changed', { // TODO(TASK-11)
            detail: { object: hoveredRoot },
        }));
    }

    /**
     * G2-T1 — rAF callback: GPU hover pick, executed at most once per frame.
     *
     * This method is scheduled by `_onPointerMove` via the FrameScheduler
     * `pre-render` slot and NEVER called directly.  It runs the GPU ID-buffer pick with the
     * latest cursor position stored in `_pendingHoverClientX/Y`.
     *
     * Contract:
     *  - `_hoverRafId` is set non-null by `_onPointerMove` before scheduling.
     *  - This method clears `_hoverRafId` first so that a new rAF can be
     *    queued by the next `pointermove` batch.
     *  - If GPU pick hits: hover state and cursor are updated and
     *    `bim-hover-changed` is dispatched (overriding the BVH result that
     *    `_onPointerMove` already dispatched for the same frame).
     *  - If GPU pick misses or throws: the BVH result dispatched by
     *    `_onPointerMove` stands — no corrective event needed.
     */
    private _onHoverGpuPickRaf(): void {
        this._hoverRafId = null;

        // Re-check guards — conditions may have changed since the rAF was queued.
        if (!this.enabled || this.isTransforming || window.isCameraDragging) return;
        if (!this._pickStrategy) return;

        // MEDIUM-4: OTel span covering the GPU hover pick.  No hit → span ends with
        // `pryzm.selection.hover.miss` event.  Throw → span ends with ERROR status.
        const _hoverSpan = startSpan('pryzm.selection.hover.raf', {
            'pryzm.selection.strategy': this._pickStrategy.id,
        });

        try {
            // CRITICAL FIX (F-NEW): Same pre-pick matrix sync as performSelection().
            // Hover RAF fires asynchronously — batch-created elements may have been
            // added between the last render frame and this pre-render slot, leaving
            // their pick-scene clones at stale world positions.
            // §SELECT-HOVER-MATRIX-GUARD (FIX #1/#2) — route through the guarded
            // helper so a stale gizmo (selected wall rebuilt out from under us by the
            // background resi rebuild) can't throw "must be a part of the scene graph"
            // here, abort the GPU hover pick, and leave the click anchor stale.
            this._safeUpdateMatrixWorldForPick();

            // FIX-S16-RC5: Ensure the selectable cache is warm before building
            // the element registry.  A bim-* mutation event between _onPointerMove
            // (which built the cache) and this pre-render slot nulls _selectableCache;
            // without this call _buildElementRegistry() returns an empty registry and
            // the GPU pick silently misses every element.
            this._ensureSelectableCache();

            const domRect = this.domElement.getBoundingClientRect();
            const hx = this._pendingHoverClientX - domRect.left;
            const hy = this._pendingHoverClientY - domRect.top;

            const hoverPickCtx: PickContext = {
                camera:          this.camera.three as THREE.Camera,
                elementRegistry: this._buildElementRegistry(),
                viewportWidth:   domRect.width,
                viewportHeight:  domRect.height,
                scene:           this.world.scene.three as THREE.Scene,
                renderer:        this._buildGpuPickRenderer(),
            };

            // §SELECT-PERF — hover only needs the elementId for the outline; skip the
            // depth pass so the per-frame hover pick is ONE render, not two. This is
            // the cost that scales with scene element count ("selection worsens as
            // more elements are added"). The click path keeps the full depth pick.
            const gpuHoverResult = this._pickStrategy.pick({ x: hx, y: hy }, hoverPickCtx, { skipDepth: true });
            if (gpuHoverResult !== null) {
                const hoverObj = hoverPickCtx.elementRegistry.objectFor(gpuHoverResult.elementId);
                // §PERF2-HOTLOG — ONE line per frame for as long as the cursor
                // rests on any geometry, and it reports a SUCCESS. Unlike the
                // three warnings above there is no defect here to preserve, so
                // this is flag-gated rather than throttled: nothing is lost when
                // it is off, and a hover trace is exactly the kind of thing you
                // want all of, or none of.
                if ((globalThis as { __pryzmPickTrace?: boolean }).__pryzmPickTrace === true) {
                    console.debug(`[PickResolver/rAF] strategy=${this._pickStrategy.id} hover-hit=${gpuHoverResult.elementId}`);
                }
                _hoverSpan.setAttribute('pryzm.selection.hit', true);
                _hoverSpan.setAttribute('pryzm.selection.element_id', gpuHoverResult.elementId);

                // FIX-S16-ANCHOR: Record the cursor position for every confirmed GPU
                // hover hit so performSelection() can anchor the click to this result.
                this._lastHoverConfirmedClientX = this._pendingHoverClientX;
                this._lastHoverConfirmedClientY = this._pendingHoverClientY;

                const hoveredRoot = hoverObj ? (this.findSelectableRoot(hoverObj) ?? hoverObj) : null;
                // §SELECT-3D-1 — record the GPU-CONFIRMED hover target so the
                // click-anchor branch can reach it without trusting the BVH
                // ref (which may have been overwritten by a stale raycast).
                this._lastHoveredObjectGpu = hoveredRoot;
                // §SELECT-INSTANCED-FURNITURE-PICK — when the hovered root is an
                // instanced group hosting many elements, remember WHICH per-instance
                // element the pixel resolved to (the picked id ≠ the synthetic group id)
                // so an anchored click selects that instance, not the whole group.
                this._lastHoveredInstanceIdGpu =
                    hoveredRoot?.userData?.isInstancedGroup === true &&
                    hoveredRoot.userData?.id !== gpuHoverResult.elementId
                        ? gpuHoverResult.elementId
                        : null;
                const newUuid = hoveredRoot?.uuid ?? null;
                if (newUuid !== this._lastHoveredUuid) {
                    this._lastHoveredUuid = newUuid;
                    this._lastHoveredObject = hoveredRoot;
                    this.domElement.style.cursor = hoveredRoot ? 'pointer' : '';
                    window.dispatchEvent(new CustomEvent('bim-hover-changed', { detail: { object: hoveredRoot } })); // TODO(TASK-11)
                }
            } else {
                // GPU miss → no-op; the BVH result dispatched in _onPointerMove stands.
                // FIX-S16-ANCHOR: clear the anchor so a stale hover result cannot
                // mislead a click after the cursor has moved to empty space.
                this._lastHoverConfirmedClientX = null;
                this._lastHoverConfirmedClientY = null;
                // §SELECT-3D-1 — also clear the GPU-confirmed ref so a stale
                // result cannot leak into a later click whose new anchor
                // happens to land within 8px of an old confirmed position.
                this._lastHoveredObjectGpu = null;
                this._lastHoveredInstanceIdGpu = null;
                _hoverSpan.setAttribute('pryzm.selection.hit', false);
            }
        } catch {
            // GPU threw → BVH result stands.
        } finally {
            _hoverSpan.end();
        }
    }

    // ── A16-T8: BVH acceleration helpers ────────────────────────────────────

    /**
     * Build an AABB BVH over all elements in `_selectableCache`.
     *
     * CONTRACT (C04 §3): spatial queries MUST use an acceleration structure.
     * Each element is represented by its world-space bounding box (union of
     * all mesh AABBs sharing the same semantic root ID).  The BVH allows
     * `intersectRay` and `frustumCull` queries in O(log n) time, reducing
     * the candidate set passed to THREE.Raycaster.intersectObjects (O(n·k)
     * where k = triangles/element) from N to O(log N) candidates on average.
     *
     * The `_objectRootIdCache` is populated alongside the BVH so the prune
     * step can filter the flat `_selectableCache` by semantic root ID.
     */
    /**
     * BUG-10: Single canonical implementation of the selectable-cache warm-up.
     * Previously this block was duplicated verbatim in performSelection (click
     * path) and _onPointerMove (hover path), meaning any change had to be made
     * in two places.  Both sites now call this method instead.
     *
     * BUG-04 inclusion: also adds InstancedElementRenderer group meshes
     * (userData.isInstancedGroup === true) so the BVH raycaster can hit them
     * and return hit.instanceId for per-instance element resolution.
     *
     * PERF-FIX-#6 + A16-T8: Rebuilds the BVH acceleration structure whenever
     * the cache is cold-built.  The cache is invalidated by BIM mutation events
     * registered in init(), so it stays consistent with the live scene.
     */
    private _ensureSelectableCache(): void {
        if (this._selectableCache) return;
        this._selectableCache = [];
        this.world.scene.three.traverse(obj => {
            // §21-VR-4: Exclude underlay ghost objects (set by UnderlayRenderService).
            // §148 HIDDEN-LEVEL-NOT-SELECTABLE — use cumulative ancestor visibility (matches
            // GPU/BVH pick) so elements under a hidden level/group are not selectable.
            if (obj.userData?.isHelper || obj.userData?.isPreview || obj.userData?.underlayActive || !isObjectEffectivelyVisible(obj)) return;
            const type = (obj.userData?.elementType || obj.userData?.type || '').toLowerCase();
            if (
                obj.userData?.selectable
                || this.isSemanticType(type)
                || type === 'slab'
                || obj.userData?.isInstancedGroup === true  // BUG-04
            ) {
                this._selectableCache!.push(obj);
            }
        });
        // A16-T8: Rebuild BVH whenever the selectable cache is rebuilt.
        this._rebuildBVHFromCache();
    }

    private _rebuildBVHFromCache(): void {
        if (!this._selectableCache || this._selectableCache.length === 0) {
            this._bvhQuery = null;
            this._objectRootIdCache.clear();
            return;
        }

        this._objectRootIdCache.clear();

        // Accumulate world-space bounding boxes grouped by element root ID.
        const elementBounds = new Map<string, THREE.Box3>();
        const _scratch = new THREE.Box3();

        for (const obj of this._selectableCache) {
            const root = this.findSelectableRoot(obj);
            const rootId = root?.userData?.id ?? null;
            this._objectRootIdCache.set(obj, rootId);

            if (rootId) {
                const existing = elementBounds.get(rootId);
                _scratch.setFromObject(obj);
                if (!_scratch.isEmpty()) {
                    if (existing) {
                        existing.union(_scratch);
                    } else {
                        elementBounds.set(rootId, _scratch.clone());
                    }
                }
            }
        }

        if (elementBounds.size === 0) {
            this._bvhQuery = null;
            return;
        }

        const bvhElements: BVHElement[] = [];
        for (const [id, bounds] of elementBounds) {
            bvhElements.push({ id, bounds });
        }

        this._bvhQuery = new BVHQuery();
        this._bvhQuery.build(bvhElements);
    }

    /**
     * Return the BVH-pruned subset of `allCandidates` whose AABB intersects
     * the current raycaster ray.
     *
     * - If the BVH is not ready, returns `allCandidates` (safe fallback).
     * - If the BVH returns zero hits, returns `[]` (empty scene / ray misses).
     * - Objects with no semantic root (rootId = null) are ALWAYS included
     *   because they are non-element selectables (e.g. legacy PDF underlay
     *   proxies) that the BVH does not index.
     */
    private _bvhPruneCandidates(allCandidates: THREE.Object3D[]): THREE.Object3D[] {
        if (!this._bvhQuery) return allCandidates;

        const ray = this._raycaster.ray;
        const candidateIds = this._bvhQuery.intersectRay(ray.origin, ray.direction);

        if (candidateIds.length === 0) {
            // BVH ray misses all element AABBs; still keep non-indexed objects
            // (rootId = null) since they may still be hit at mesh level.
            return allCandidates.filter(obj => {
                const rootId = this._objectRootIdCache.get(obj);
                return rootId === null || rootId === undefined;
            });
        }

        const hitSet = new Set(candidateIds);
        return allCandidates.filter(obj => {
            const rootId = this._objectRootIdCache.get(obj);
            // Include non-indexed objects unconditionally (safety net).
            if (rootId === null || rootId === undefined) return true;
            return hitSet.has(rootId);
        });
    }
}
