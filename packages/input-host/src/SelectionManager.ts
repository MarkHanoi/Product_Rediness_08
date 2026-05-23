
import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { TransformControls, getThreeRenderer } from '@pryzm/renderer-three';
import { CurtainSubElement } from '@pryzm/geometry-curtain-wall';
import { LevelPlaneConstraint } from './LevelPlaneConstraint.js';
import { BIM_LAYER } from '@pryzm/scene-committer';
import { DeleteOpeningCommand } from '@pryzm/command-registry';
import { DeleteLightingCommand } from '@pryzm/command-registry';
import { BVHQuery } from '@pryzm/spatial-index';
import type { BVHElement } from '@pryzm/spatial-index';
import type { PickStrategy, PickContext, GpuPickRenderer, ElementRegistry, ElementKind } from '@pryzm/picking';
import { getFrameScheduler } from '@pryzm/frame-scheduler';
import type { TickListenerDisposer } from '@pryzm/frame-scheduler';
import { SelectionBoundsRegistry, buildDefaultSelectionBoundsRegistry } from './SelectionBoundsRegistry.js';
import { startSpan } from './otel.js';
import type { ISelectionManager } from '@pryzm/engine';

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
    private readonly SEMANTIC_TYPES = [
        'wall', 'window', 'door', 'slab', 'furniture', 'column',
        'beam', 'roof', 'stairs', 'ramp', 'railing', 'opening',
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

    setEnabled(enabled: boolean) {
        this.enabled = enabled;
        if (!enabled) {
            this.unselectAll();
            // Reset hover cursor so it doesn't stay as 'pointer' while a tool is active
            this.domElement.style.cursor = '';
            this._lastHoveredUuid = null;
            this._lastHoveredObject = null;
            // §SELECT-3D-1 — mirror reset for the GPU-confirmed hover ref so a
            // stale tool-entry doesn't leak a pre-tool click target.
            this._lastHoveredObjectGpu = null;
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
            'bim-railing-added',  'bim-railing-removed',
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

        // ── Selection highlight refresh on geometry rebuild ───────────────
        // FurnitureFragmentBuilder.updateFurniture() reuses the same root
        // Object3D but disposes/reclears its children and rebuilds the mesh
        // tree. The cached `highlightMesh` (a world-space Box3 wireframe
        // computed at selection time) therefore points at stale extents
        // when the user resizes the element via the property panel.
        // Re-derive the highlight after each rebuild for the currently
        // selected furniture root. Deferred via setTimeout(0) so the
        // builder's own listener has already swapped in the new geometry.
        window.addEventListener('bim-furniture-updated', (e: any) => {
            const updatedId = e?.detail?.furniture?.id;
            if (!updatedId || !this.selectedObject) return;
            if (this.selectedObject.userData?.id !== updatedId) return;
            setTimeout(() => {
                const obj = this.selectedObject;
                if (obj && obj.userData?.id === updatedId) {
                    this.applyHighlight(obj);
                }
            }, 0);
        });

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
                    this.unselectAll();
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
                            this.unselectAll();
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
        this.domElement.addEventListener('pointerdown', () => {
            this.touchStartTime = Date.now();
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
        if (!this.enabled || this.isTransforming) return;
        // ── cameraDragging guard (Pascal §cameraDragging) ──────────────────
        // Prevents phantom selections when the user releases the mouse after
        // orbiting. Pascal sets cameraDragging=true on 'onTransitionStart' and
        // false on 'onRest'/'onSleep'. PRYZM uses a window flag set in EngineBootstrap.
        if (window.isCameraDragging) return;

        // MEDIUM-4: OTel span covering the full pick-to-select pipeline.
        // Attributes are set before the span ends so Honeycomb/Jaeger can
        // show strategy + hit outcome without needing a second query.
        const _pickSpan = startSpan('pryzm.selection.pick', {
            'pryzm.selection.strategy': this._pickStrategy?.id ?? 'none',
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
        if (
            _anchorTarget !== null &&
            this._lastHoverConfirmedClientX !== null &&
            this._lastHoverConfirmedClientY !== null
        ) {
            const dx = event.clientX - this._lastHoverConfirmedClientX;
            const dy = event.clientY - this._lastHoverConfirmedClientY;
            if (dx * dx + dy * dy <= CLICK_HOVER_SNAP_PX * CLICK_HOVER_SNAP_PX) {
                const resolvedRoot = this.findSelectableRoot(_anchorTarget) ?? _anchorTarget;
                // Dispatch bim-canvas-world-click via level-plane intersection
                // (no depth buffer available on this fast path).
                const levelY  = window.activeLevelElevation ?? 0;
                const levelPl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -levelY);
                const worldPt = new THREE.Vector3();
                this._raycaster.ray.intersectPlane(levelPl, worldPt);
                window.dispatchEvent(new CustomEvent('bim-canvas-world-click', { // TODO(TASK-11)
                    detail: {
                        worldPoint:  { x: worldPt.x, y: worldPt.y, z: worldPt.z },
                        elementId:   resolvedRoot.userData?.id ?? null,
                        elementType: resolvedRoot.userData?.elementType ?? resolvedRoot.userData?.type ?? null,
                    },
                }));
                console.log(`[PickResolver] hover-anchor hit=${resolvedRoot.userData?.id ?? resolvedRoot.uuid}`);
                _pickSpan.setAttribute('pryzm.selection.strategy', 'hover-anchor');
                _pickSpan.setAttribute('pryzm.selection.hit', true);
                window.__curtainSubElement = null;
                this.resetSubElementState();
                this.select(resolvedRoot);
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
            this.world.scene.three.updateMatrixWorld(true);
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
                    const obj = pickCtx.elementRegistry.objectFor(gpuResult.elementId);
                    console.log(`[PickResolver] strategy=${this._pickStrategy.id} hit=${gpuResult.elementId}`);
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
                                    elementId:   gpuResult.elementId,
                                    elementType: gpuResult.elementKind,
                                },
                            }));
                        }
                        // Route GPU hit through existing selection logic.
                        // Use findSelectableRoot to normalise to semantic root, then
                        // enter the same curtain-wall / select() branch as the BVH path.
                        const resolvedRoot = this.findSelectableRoot(obj) ?? obj;
                        window.__curtainSubElement = null;
                        this.resetSubElementState();
                        this.select(resolvedRoot);
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
                    this.unselectAll();
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
        const hits = this._raycaster.intersectObjects(candidates, true);

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
            this.unselectAll();
            return;
        }

        // Filter and sort hits to find the most relevant selectable entity
        const validHits = hits
            .map(hit => ({ hit, root: this.findSelectableRoot(hit.object) }))
            .filter(item => item.root !== null);

        if (validHits.length === 0) {
            this.unselectAll();
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
            _pickSpan.end();
        }
    }

    private select(obj: THREE.Object3D, elementIdOverride?: string) {
        if (this.selectedObject === obj && elementIdOverride === undefined) return;

        this.unselectAll();
        this.selectedObject = obj;

        this.applyHighlight(obj);
        this.updateInspector(obj);

        // Stairs have world-space geometry baked into the mesh at local position (0,0,0).
        // Attaching TransformControls to them places the gizmo at the world origin
        // rather than at the stair — skip gizmo attachment for stair elements.
        const elemType = (obj.userData?.elementType ?? obj.userData?.type ?? '').toLowerCase();
        const isStair = elemType === 'stairs' || elemType === 'stair';
        const isRoom  = elemType === 'room';
        if (!isStair && !isRoom) {
            this.transformControls.attach(obj);
        }
        // Note: applyHighlight() already applies LevelPlaneConstraint for non-hosted
        // elements. The transformControls.attach() above is a harmless re-attach that
        // does not reset showY, so the constraint remains in effect.

        // Notify UI that selection has changed to refresh menu states
        window.dispatchEvent(new CustomEvent('bim-selection-changed', { detail: { object: obj } })); // keep DOM for plugins
        (window as any).runtime?.events?.emit('bim-selection-changed', { object: obj }); // F.events.16 bridge

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

    applyHighlight(obj: THREE.Object3D) {
        this.clearHighlight();
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
            mat.dispose();
            return null;
        }
        return group;
    }


    unselectAll() {
        const wasSelected = this.selectedObject !== null
            || this._marqueeHighlightMeshes.length > 0;
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
            this.world.scene.three.remove(this.cwSubHighlight);
            this.cwSubHighlight.geometry.dispose();
            (this.cwSubHighlight.material as THREE.Material).dispose();
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
            this.world.scene.three.remove(this.kcSubHighlight);
            this.kcSubHighlight.geometry.dispose();
            (this.kcSubHighlight.material as THREE.Material).dispose();
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
            this.world.scene.three.remove(this.wdSubHighlight);
            this.wdSubHighlight.geometry.dispose();
            (this.wdSubHighlight.material as THREE.Material).dispose();
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
            const disposedMats = new Set<THREE.Material>();
            this.highlightMesh.traverse((child) => {
                const m = child as THREE.Mesh & THREE.LineSegments;
                if (!(m.isMesh || (m as unknown as THREE.Line).isLine)) return;
                if (!child.userData?.sharedGeometry) {
                    m.geometry?.dispose?.();
                }
                const mat = m.material as THREE.Material | THREE.Material[] | undefined;
                if (Array.isArray(mat)) {
                    for (const mm of mat) {
                        if (mm && !disposedMats.has(mm)) { disposedMats.add(mm); mm.dispose(); }
                    }
                } else if (mat && !disposedMats.has(mat)) {
                    disposedMats.add(mat);
                    mat.dispose();
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
                    || obj.userData?.underlayActive || !obj.visible) return;
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
                geo.dispose(); // EdgesGeometry has its own buffer
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
            if (scene) scene.remove(m);
            const ls = m as THREE.LineSegments;
            ls.geometry?.dispose?.();
            const mat = ls.material as THREE.Material | THREE.Material[] | undefined;
            if (Array.isArray(mat)) mat.forEach(mm => mm.dispose());
            else if (mat) mat.dispose();
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
            this.world.scene.three.updateMatrixWorld(true);

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
                console.debug(`[PickResolver/rAF] strategy=${this._pickStrategy.id} hover-hit=${gpuHoverResult.elementId}`);
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
            if (obj.userData?.isHelper || obj.userData?.isPreview || obj.userData?.underlayActive || !obj.visible) return;
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
