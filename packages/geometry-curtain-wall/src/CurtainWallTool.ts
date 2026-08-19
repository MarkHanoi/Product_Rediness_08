/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Tool (UI / Input Layer)
 * Phase:             Phase 1 (Current) + Issue 1 Snap Infrastructure
 * Files Modified:    CurtainWallTool.ts
 *
 * Additions over original (2026-03-31 base):
 *   • CurtainWallDrawingMode support: SINGLE, POLYLINE, ORTHO, CURVED
 *   • POLYLINE/ORTHO: continuous segment chaining.
 *   • ORTHO: endpoint constrained to nearest 45° increment (8-direction ortho,
 *     up from previous 90°-only implementation). Ortho is applied AFTER snap.
 *   • CURVED: three-point arc.
 *   • Snap infrastructure (Issue 1 fix — 2026-03-31):
 *       - SnapManager with CurtainWallSnapProvider + WallSnapProvider
 *       - _resolvePoint(): raw point → snap → snapped point
 *       - Ortho applied to snapped point (snap-first / ortho-second ordering)
 *       - setActiveStartPoint() called on every segment start for perpendicular snap
 *       - Snap visualizer hidden on deactivate/dispose
 *   • POLYLINE loop closure: when cursor snaps near the chain's first point,
 *     creates a closing segment and deactivates automatically.
 *
 * Contract References:
 *   §2.7  Tool must use commandManager.execute() exclusively — no direct builder calls.
 *   §4.1  ID pre-generated in Tool, before constructing CreateCurtainWallCommand.
 *   §4.2  Preview meshes tagged userData.isPreview = true.
 *   §4.3  Preview meshes fully disposed (geometry + material) before finalisation.
 *   §4.4  Preview root never reused as a final root.
 *   §05-UI §7.8  No bim-* elements in new code; HUD uses plain HTML + th-overlay classes.
 *
 * Risk Level: Low — purely Tool-layer additions; no store, command, builder, or event-bus
 * changes required.
 *
 * PERF-FIX-1 addition (2026-04-08):
 *   activate() now calls CurtainWallBuilder.beginPlacementMode() (static signal only —
 *   no build logic invoked; §02 §6.1 compliant) so the builder defers shadow passes
 *   while the user is actively placing walls. deactivate() calls endPlacementMode() to
 *   flush all deferred shadows in one idle callback. This eliminates the 123–255ms
 *   per-wall LONGTASK observed during interactive curtain wall placement.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { createId } from '@pryzm/schemas';
import type { CurtainWallDrawingMode, CurtainWallToolCallbacks } from './CurtainWallTypes.js';
import { CurtainWallStore } from './CurtainWallStore.js';
import { CurtainWallBuilder } from './CurtainWallBuilder.js';
import { SnapManager, CurtainWallSnapProvider, WallSnapProvider } from '@pryzm/snapping';
// §PERF-2026-Q2-CW-CREATE/F3 — Static import of the create command. The
// previous `await import(...)` inside `_createSegment()` reran a microtask
// hop on every interactive click and ran a cold-fetch on the very first
// click. The plan-view tool already imports this command statically; this
// makes the 3D tool match.
import { CreateCurtainWallCommand } from '@pryzm/command-registry';
// §PERF-2026-Q2-CW-CREATE/F3 — Same treatment for the from-slab command;
// previously a `then(m => …)` inside `createFromSelectedSlab()`.
import { CreateCurtainWallsFromSlabCommand } from '@pryzm/command-registry';
// §WALL-AUDIT-2026-W5: shared camera-zoom-aware tolerance.
import {
    DEFAULT_SNAP_PIXEL_RADIUS,
    getWorldToleranceForActiveCamera,
} from '@pryzm/core-app-model';
import {
    PREVIEW_COLOR,
    createGhostBoxBetween,
    createFootprintLine,
    disposePreviewObject,
} from '@pryzm/core-app-model';

/** Pre-draw configuration set by the Property Panel before the user places points. */
interface CurtainWallPredrawConfig {
    height: number;
    uSpacing: number;
    vSpacing: number;
    mullionSize: number;
    /**
     * §FEAT-CURTAIN-WALL-CREATE-TYPE (L-964) — the published type the user armed in the
     * creation panel, plus the finish fields that type resolves to.
     *
     * The TOOL stays dumb on purpose: it never reads `CurtainWallTypeStore` and never
     * resolves a type. The panel does that (it already owns the catalogue through
     * `ElementTypeCatalogRegistry`) and pushes the resolved numbers down here. Keeping the
     * resolution in ONE place is the §FIX-STAIR-RAILING-TYPE-PICKER lesson: when the
     * widget and the tool each project a catalogue onto fields, they drift.
     *
     * All optional — a wall drawn without choosing a type is still a valid plain curtain
     * wall, which is the default the founder asked for ("click on canvas to draw" with no
     * dropdown interaction required).
     */
    systemTypeId?: string;
    mullionMaterialId?: string;
    mullionColor?: string;
    glazingMaterialId?: string;
    panelThickness?: number;
}

const CURTAIN_WALL_PREDRAW_DEFAULTS: CurtainWallPredrawConfig = {
    height: 3,
    uSpacing: 1.5,
    vSpacing: 1.0,
    mullionSize: 0.05,
};

/** Number of straight-segment approximations for the CURVED mode arc. */
const ARC_SEGMENTS = 10;

/**
 * Snap radius to the polyline origin for loop closure detection.
 * Matches the default SnapManager snapRadius (0.5 m).
 */
const CLOSURE_SNAP_RADIUS = 0.5;

// ────────────────────────────────────────────────────────────────────────────
// §PERF-2026-Q2-CW-CREATE/F11 — Module-scope marker primitives.
//
// The previous per-marker `new SphereGeometry(0.12, 12, 12)` +
// `new MeshBasicMaterial({...})` allocated GPU buffers on every click
// (~150 vertices × N markers) and immediately disposed them on
// `_clearMarkers`. The geometry and material are identical for every
// marker, so we hoist both once at module load and stamp the marker mesh
// with `userData.sharedGeometry` + `userData.sharedMaterial` so anyone
// sweeping the scene knows not to dispose them.
// ────────────────────────────────────────────────────────────────────────────
const MARKER_GEOMETRY: THREE.SphereGeometry = new THREE.SphereGeometry(0.12, 12, 12);
const MARKER_MATERIAL: THREE.MeshBasicMaterial = new THREE.MeshBasicMaterial({ color: 0x2196f3 });

/**
 * §PERF-2026-Q2-CW-CREATE/F10 — Snap-provider refresh debounce window (ms).
 * After a curtain-wall segment lands, the snap providers must rebuild their
 * caches so the new segment is snappable. During fast successive clicks the
 * old code rebuilt those caches on every click, which is wasteful — the
 * provider only needs to be current by the time the cursor next moves.
 * 50 ms is below the perceptible ortho/snap delay threshold.
 */
const SNAP_PROVIDER_DEBOUNCE_MS = 50;

/**
 * §CURTAIN-WALL-AUDIT-2026 §5.1 / §5.4 — Dependency-injection struct for
 * CurtainWallTool. All cross-layer collaborators MUST be passed in
 * explicitly; the legacy `window.*` reads are retained ONLY as
 * a backward-compat fallback so EngineBootstrap construction never breaks
 * during the DI migration.
 *
 * Mandatory: curtainWallStore (no parallel-store fallback — see audit
 * §5.1 "fallback-store-construction defect").
 */
export interface CurtainWallToolDependencies {
    curtainWallStore: CurtainWallStore;
    wallStore?: any;
    selectionManager?: any;
    toolManager?: any;
    commandManager?: any;
    projectContext?: any;
    bimManager?: any;
    curtainWallModePicker?: any;
    /**
     * §FIX-CW-BYSLAB-ASK (L-1160) — the pick-a-slab flow, INJECTED.
     *
     * This tool sits at L2 and the flow lives at the app layer (it drives
     * `ToolManager.deactivateAll()`, a DOM overlay and the `bim-selection-changed`
     * bus). It is NOT re-implemented here: `apps/editor/src/ui/layout/ToolsAreaLayout.ts`
     * owns exactly one `_pickSlabThen`, extracted from the wall's private body by
     * lane HR2 (`86483b5c`) precisely so the railing and THIS family could adopt it
     * rather than write a third copy — which is C84 EI-4a twice over.
     *
     * When absent (tests, early boot, headless), `createFromSelectedSlab()` falls
     * back to the named refusal. It never silently does nothing.
     */
    requestSlabPick?: SlabPickRequester;
}

/**
 * §FIX-CW-BYSLAB-ASK (L-1160) — "ask the user which slab, then call back with its id".
 *
 * The signature is deliberately `(message, onSlab)` and NOT `() => Promise<string>`:
 * the flow can be cancelled (ESC) and a cancelled pick must resolve to *nothing
 * happening*, not to a rejected promise every caller then has to remember to swallow.
 */
export type SlabPickRequester = (message: string, onSlab: (slabId: string) => void) => void;

export class CurtainWallTool {
    private world: OBC.World;
    private callbacks: CurtainWallToolCallbacks;
    private store: CurtainWallStore;
    /** §CURTAIN-WALL-AUDIT-2026 §5.4 — injected deps (optional during migration). */
    private _deps: Partial<CurtainWallToolDependencies>;

    // ── Snap infrastructure (Issue 1) ────────────────────────────────────────
    private snapManager: SnapManager | null = null;

    private _isActive = false;
    private _mode: CurtainWallDrawingMode = 'SINGLE';
    private _disposed = false;

    /**
     * §FIX-CW-BYSLAB-SELECTION-CLEARED (L-1074, founder-reported 2026-08-19).
     *
     * The slab the user had selected at the MOMENT THIS TOOL WAS ACTIVATED.
     *
     * ⭐ WHY THIS FIELD HAS TO EXIST, because the obvious reading is that it does not.
     * `ToolManager.activateTool()` runs in this order (`ToolManager.ts:543-552`):
     *   1. `deactivateAllInternal()`
     *   2. `activateFn()`  →  `CurtainWallTool.activate(mode)`   ← selection still LIVE here
     *   3. `this.selectionManager.setEnabled(false)`             ← and here it is DESTROYED
     * and `SelectionManager.setEnabled(false)` calls `unselectAll()`
     * (`SelectionManager.ts`), so `selectedObject` is `null` by the time the user can
     * possibly reach the "By Slab" button this tool renders at `_showModeBar()`.
     *
     * `createFromSelectedSlab()` read the LIVE selection, so it ALWAYS took its
     * refusal branch and alerted "Please select a slab first." — with a slab visibly
     * selected a moment earlier. The refusal was correct; its INPUT had been erased.
     *
     * The wall does not have this bug because `WallTool.createFromSelectedSlab()`
     * accepts an explicit `targetSlab?` argument and `ToolsAreaLayout` snapshots the
     * selection BEFORE activating (`_bySlabCapture`, ToolsAreaLayout.ts:270,361).
     * Step 2 above is the window that makes the same rescue possible from INSIDE this
     * tool, without a second wiring site.
     */
    private _bySlabCapture: unknown = null;

    /** Pre-draw config set by Property Panel before element creation. */
    private _predrawConfig: CurtainWallPredrawConfig = { ...CURTAIN_WALL_PREDRAW_DEFAULTS };

    // ── Per-mode drawing state ───────────────────────────────────────────────
    /** First point of the current segment (all modes). */
    private startPoint: THREE.Vector3 | null = null;
    /** POLYLINE/ORTHO: the very first point of the chain — used for loop closure. */
    private polylineOrigin: THREE.Vector3 | null = null;
    /** CURVED mode: the "through point" selected on the second click. */
    private arcMidPoint: THREE.Vector3 | null = null;
    /** Live preview line (start → cursor). */
    private previewLine: THREE.Line | null = null;
    /** Translucent 3D ghost body (extruded box) for the current segment. */
    private previewBody: THREE.Mesh | null = null;
    /** CURVED mode: secondary preview arc drawn after midpoint is selected. */
    private arcPreviewLine: THREE.Line | null = null;
    /** CURVED mode: 3D ghost body group (one box per arc segment). */
    private arcPreviewBody: THREE.Group | null = null;
    /** Dot markers placed at clicked points. */
    private markers: THREE.Mesh[] = [];

    // ── Keyboard listener ────────────────────────────────────────────────────
    private escHandler: ((e: KeyboardEvent) => void) | null = null;

    /** Phase 12: counts segments placed in the current polyline chain for Close-Polyline guard. */
    private _polySegmentCount: number = 0;

    constructor(
        world: OBC.World,
        callbacks: CurtainWallToolCallbacks,
        deps: Partial<CurtainWallToolDependencies> = {},
    ) {
        this.world = world;
        this.callbacks = callbacks;
        this._deps = deps;

        // §CURTAIN-WALL-AUDIT-2026 §5.1 FIX (fallback-store-construction defect):
        // Resolve canonical CurtainWallStore via injected deps first, then fall
        // back to the global registry. Constructing a parallel store here would
        // diverge state from the projection/builder layer and silently corrupt
        // the project — it is now strictly forbidden. If neither source exists
        // we fail loudly so the bootstrap order can be corrected at the call
        // site rather than producing ghost walls in production.
        const canonicalStore: CurtainWallStore | undefined =
            (deps.curtainWallStore as CurtainWallStore | undefined)
            ?? window.curtainWallStore; // TODO(TASK-08)
        if (!canonicalStore) {
            throw new Error(
                '[CurtainWallTool] §CURTAIN-WALL-AUDIT-2026 §5.1: canonical '
                + 'CurtainWallStore unavailable. Construct CurtainWallStore in '
                + 'initBuilders.ts before instantiating CurtainWallTool, and '
                + 'pass it explicitly via the deps argument.',
            );
        }
        this.store = canonicalStore;

        // §DW-04 (2026-03-31): Builder is no longer owned by this tool.
        // CurtainWallBuilder is instantiated in EngineBootstrap (bootstrap/projection layer)
        // and exposed via window.curtainWallBuilder from there.
        // Contract §01 §2.7: tools must not own or call builders.

        this._initSnapManager();
    }

    // ────────────────────────────────────────────────────────────────────────
    // §CURTAIN-WALL-AUDIT-2026 §5.4 — Dependency accessors. Each one prefers
    // the constructor-injected dep; falls back to the legacy window global
    // (and only the legacy global) so existing call sites that have not yet
    // been updated continue to work during the DI migration.
    // ────────────────────────────────────────────────────────────────────────

    private _getWallStore():       any { return this._deps.wallStore       ?? window.wallStore; } // TODO(TASK-08)
    private _getSelectionManager():any { return this._deps.selectionManager?? window.selectionManager; }
    private _getToolManager():     any { return this._deps.toolManager     ?? window.toolManager; }
    private _getCommandManager():  any { return this._deps.commandManager  ?? (this.callbacks as any)?.commandManager ?? window.commandManager; } // TODO(TASK-06): migrate when bus handler exists
    private _getProjectContext():  any { return this._deps.projectContext  ?? window.projectContext; }
    private _getBimManager():      any { return this._deps.bimManager      ?? window.bimManager; }
    private _getCurtainWallModePicker(): any { return this._deps.curtainWallModePicker ?? window.curtainWallModePicker; }

    // ────────────────────────────────────────────────────────────────────────
    // Snap manager setup
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Creates a SnapManager wired with:
     *   - CurtainWallSnapProvider (this store — endpoint/mid/centerline/intersection)
     *   - WallSnapProvider        (window.wallStore — if available) // TODO(TASK-08)
     *
     * Called once in the constructor. The visualizer is initialised against the
     * scene immediately so snap markers appear as soon as the tool is activated.
     */
    private _initSnapManager(): void {
        try {
            this.snapManager = new SnapManager();
            this.snapManager.initVisualizer(this.world.scene.three as THREE.Scene);
            this.snapManager.registerProvider(new CurtainWallSnapProvider(this.store));

            // Also snap to regular walls (cross-element alignment — Issue 1)
            const wallStore = this._getWallStore();
            if (wallStore) {
                this.snapManager.registerProvider(new WallSnapProvider(wallStore));
            }

            console.log('[CurtainWallTool] SnapManager initialised (CurtainWall + Wall providers)');
        } catch (err) {
            console.warn('[CurtainWallTool] SnapManager init failed — snap disabled:', err);
            this.snapManager = null;
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // Public API
    // ────────────────────────────────────────────────────────────────────────

    get isActive(): boolean { return this._isActive; }

    getPredrawConfig(): Readonly<CurtainWallPredrawConfig> {
        return { ...this._predrawConfig };
    }

    setPredrawConfig(config: Partial<CurtainWallPredrawConfig>): void {
        this._predrawConfig = { ...CURTAIN_WALL_PREDRAW_DEFAULTS, ...this._predrawConfig, ...config };
    }

    /** Activate the tool with an optional drawing mode (defaults to 'SINGLE'). */
    activate(mode: CurtainWallDrawingMode = 'SINGLE'): void {
        this._mode = mode;
        this._isActive = true;
        console.log(`[CurtainWallTool] activated — mode: ${mode}`);

        // §FIX-CW-BYSLAB-SELECTION-CLEARED — snapshot BEFORE ToolManager clears it.
        // This line runs inside activateFn(), which ToolManager calls one statement
        // before `selectionManager.setEnabled(false)`. See _bySlabCapture's note.
        this._bySlabCapture = this._getSelectionManager()?.selectedObject ?? null;

        // PERF-FIX-1: Defer shadow passes for all walls placed during this session.
        // Shadows will be enabled in one consolidated idle-callback flush on deactivate().
        CurtainWallBuilder.beginPlacementMode();

        if (this.world.camera?.controls) this.world.camera.controls.enabled = false;
        this.attachListeners();
        this._attachEscHandler();
        this._showModeBar();
        this._showModeHUD();

        // Refresh snap providers so they pick up any elements placed since last activation
        if (this.snapManager) {
            this.snapManager.updateProviders();
        }
    }

    deactivate(): void {
        if (!this._isActive) return;
        this._isActive = false;
        console.log('[CurtainWallTool] deactivated');

        // PERF-FIX-1: End placement mode — schedules one consolidated shadow flush
        // for all walls placed since activate() was called.
        CurtainWallBuilder.endPlacementMode();

        if (this.world.camera?.controls) this.world.camera.controls.enabled = true;
        this.detachListeners();
        this._detachEscHandler();
        this._clearAllPreview();
        this._hideModeHUD();
        this.startPoint        = null;
        this.polylineOrigin    = null;
        this.arcMidPoint       = null;
        this._polySegmentCount = 0;
        // §FIX-CW-BYSLAB-SELECTION-CLEARED — release the snapshot so the NEXT
        // activation cannot inherit a slab the user selected two sessions ago.
        // A stale slab silently building walls in the wrong place is strictly worse
        // than the refusal this field exists to prevent.
        this._bySlabCapture    = null;

        // Hide snap visualizer when tool is not active
        if (this.snapManager) {
            this.snapManager.hideVisualizer();
            this.snapManager.setActiveStartPoint(null);
        }

        const selMgr = this._getSelectionManager();
        if (selMgr?.setEnabled) selMgr.setEnabled(true);

        const tm = this._getToolManager();
        if (tm?.getActiveTool?.() === 'curtain-wall') {
            setTimeout(() => tm.deactivateAll?.(), 0);
        }
    }

    cleanup(): void { this.deactivate(); }
    dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this.cleanup();
        // §PERF-2026-Q2-CW-CREATE/F10 — drop any queued snap-provider refresh
        this._cancelPendingSnapRefresh();
        if (this.snapManager) {
            this.snapManager.dispose();
            this.snapManager = null;
        }
        if (this._statusBar && this._statusBar.parentNode) {
            this._statusBar.parentNode.removeChild(this._statusBar);
            this._statusBar = null;
        }
    }

    /**
     * By-Slab creation (bypasses drawing state machine entirely).
     *
     * §FIX-CW-BYSLAB-SELECTION-CLEARED (L-1074) — resolution order now mirrors
     * `WallTool.createFromSelectedSlab(targetSlab?)`, the ONE implementation of this
     * gesture in the repo that works:
     *   1. an explicit `targetSlab` argument (a caller that already knows),
     *   2. `_bySlabCapture` — the pre-activation snapshot,
     *   3. the live selection — kept as the last resort, because a caller that
     *      invokes this WITHOUT going through tool activation still has one.
     *
     * ⛔ Do not "simplify" this back to reading the live selection alone. That is the
     * defect (L-1074): by the time this tool's own By-Slab button exists on screen,
     * `ToolManager` has already run `selectionManager.setEnabled(false)`, which calls
     * `unselectAll()`. Step 3 is a FALLBACK, never the primary.
     */
    createFromSelectedSlab(targetSlab?: unknown): void {
        const slabId = this.resolveBySlabTarget(targetSlab);

        if (slabId) { this.createFromSlabId(slabId); return; }

        // ── No slab resolvable: ASK, do not merely refuse ────────────────────
        //
        // §FIX-CW-BYSLAB-ASK (L-1160). L-1074 fixed the case where the user HAD
        // selected a slab. It left the other half exactly as broken as the railing's
        // was: a user who activates the tool first is told what they should have done
        // and given no way to do it — while the wall, from the same bar, in the same
        // gesture, ASKS (`ToolsAreaLayout._pickSlabThen`). "Wall works, curtain wall
        // does not" is that difference and nothing else.
        const ask = this._getSlabPickRequester();
        if (ask) {
            ask('Click a slab in the scene to wrap its perimeter in curtain walls', (id) => {
                this.createFromSlabId(id);
            });
            return;
        }

        // C16 CA-18 — name the mechanism and the live alternative, and say WHY, rather
        // than repeating "select a slab first" at a user who did exactly that. Reached
        // only when no requester was injected (tests, early boot, headless): the tool
        // must still say something rather than silently do nothing (C84 EI-6).
        alert(
            'Curtain wall BY SLAB — no slab to work from. '
            + 'Select the slab FIRST, then pick the Curtain Wall tool, then press S. '
            + 'Nothing was created.',
        );
    }

    /**
     * §FIX-CW-BYSLAB-SELECTION-CLEARED (L-1074) — the three-branch resolution, as a
     * predicate, so the "ask" branch below and any future caller share ONE answer to
     * *"which slab?"*. Returns the slab id or `null`; never throws, never alerts.
     */
    private resolveBySlabTarget(targetSlab?: unknown): string | null {
        // Deliberately NOT gated on selectionManager being present: the snapshot and
        // the explicit argument are both usable without it. Only branch 3 needs it.
        const selectionManager = this._getSelectionManager();

        const selectedObject = (targetSlab
            ?? this._bySlabCapture
            ?? selectionManager?.selectedObject) as
            { userData?: { id?: string; elementType?: string; type?: string } } | null | undefined;

        if (!selectedObject) return null;

        const ud = selectedObject.userData ?? {};
        // Case-insensitive: SlabFragmentBuilder writes 'Slab' (capital S) while callers
        // historically compared against lowercase 'slab' (C15 §12).
        const slabType = (ud.elementType || ud.type || '').toLowerCase();
        if (slabType !== 'slab') return null;

        return ud.id ?? null;
    }

    /**
     * §FIX-CW-BYSLAB-ASK (L-1160) — **THE PARAMETERISED ENTRY POINT.**
     *
     * ⭐ THIS IS THE MECHANISM THE FAMILY KEPT NOT COPYING. The wall's By Slab works
     * because `WallTool.createFromSelectedSlab(targetSlab?)` and
     * `wall.create-on-all-slabs` both take the slab **as an argument**; the railing's
     * did not work because it mirrored the pill, the label, the accelerator and the
     * refusal message and re-read the live selection (L-1103). Everything that knows
     * a slab id — the pre-activation snapshot, the pick-a-slab overlay, a plan-view
     * handler, RAC — lands HERE, and the "which slab?" question is answered exactly
     * once, above.
     */
    createFromSlabId(slabId: string): void {
        // §PERF-2026-Q2-CW-CREATE/F3 — Static import; no per-invocation
        // dynamic-import promise hop.
        const command = new CreateCurtainWallsFromSlabCommand({ slabId });
        const manager = this._getCommandManager();
        if (!manager) {
            // C84 EI-6 — a missing command manager is a bootstrap fault, not a user
            // error, and it must not read as "nothing to do".
            console.error('[CurtainWallTool] BY SLAB: no CommandManager — nothing was created.');
            return;
        }

        manager.execute(command);
        // §FIX-NAV-UNLOCK: The by-slab batch is a "fire and done" action — once
        // the command is dispatched the tool has no further drawing state to
        // maintain. Without this deactivate() call, camera.controls.enabled
        // remains false (set in activate()) for the entire duration of the batch
        // and subsequent GPU-compile LONGTASK, leaving navigation completely
        // broken until the user presses ESC.
        //
        // All deactivate() side-effects are safe to run immediately after dispatch:
        //   • controls.enabled = true   → restores orbit/pan navigation
        //   • detachListeners()          → no stale pointer events during batch
        //   • _clearAllPreview()         → no ghost geometry visible under overlay
        //   • CurtainWallBuilder.endPlacementMode() → consolidates shadow flush
        //
        // Safe on the ask-path too: `_pickSlabThen` has already deactivated the tool
        // and `deactivate()` early-returns when `_isActive` is false.
        this.deactivate();
    }

    /**
     * §FIX-CW-BYSLAB-ASK (L-1160) — wire the app's pick-a-slab flow in AFTER
     * construction.
     *
     * A constructor dep would not work: `initTools.ts` builds this tool long before
     * `ToolsAreaLayout` exists to own the flow, so the injection point has to be the
     * activation wrapper that already reaches this instance
     * (`props.toolManager.curtainWallTool`).
     */
    setSlabPickRequester(fn: SlabPickRequester | null): void {
        this._slabPickRequester = fn;
    }

    private _slabPickRequester: SlabPickRequester | null = null;

    private _getSlabPickRequester(): SlabPickRequester | null {
        return this._slabPickRequester ?? this._deps.requestSlabPick ?? null;
    }

    // ────────────────────────────────────────────────────────────────────────
    // Pointer listeners
    // ────────────────────────────────────────────────────────────────────────

    private attachListeners(): void {
        const canvas = this.world.renderer!.three.domElement;
        canvas.addEventListener('pointerdown', this.onPointerDown);
        canvas.addEventListener('pointermove', this.onPointerMove);
    }

    private detachListeners(): void {
        const canvas = this.world.renderer!.three.domElement;
        canvas.removeEventListener('pointerdown', this.onPointerDown);
        canvas.removeEventListener('pointermove', this.onPointerMove);
    }

    // ────────────────────────────────────────────────────────────────────────
    // Core pointer handlers
    // ────────────────────────────────────────────────────────────────────────

    private onPointerDown = (e: PointerEvent): void => {
        if (e.button !== 0) return;
        const point = this._resolvePoint(e);
        if (!point) return;

        switch (this._mode) {
            case 'SINGLE':   this._handleSingleClick(point); break;
            case 'POLYLINE': this._handlePolylineClick(point); break;
            case 'ORTHO':    this._handleOrthoClick(point); break;
            case 'CURVED':   this._handleCurvedClick(point); break;
        }
    };

    private onPointerMove = (e: PointerEvent): void => {
        // Always resolve the point so snap indicators show even before the first click.
        const point = this._resolvePoint(e);
        if (!point) return;

        // Only update the preview line once a start point has been placed.
        if (!this.startPoint) return;

        // Apply constraint (ortho) to the snapped point — ortho is always AFTER snap
        const constrained = this._applyConstraint(point);
        this._updatePrimaryPreview(this.startPoint, constrained);

        if (this._mode === 'CURVED' && this.arcMidPoint) {
            this._updateArcPreview(this.startPoint, this.arcMidPoint, constrained);
        }
    };

    // ────────────────────────────────────────────────────────────────────────
    // Mode handlers
    // ────────────────────────────────────────────────────────────────────────

    /** SINGLE: legacy two-click flow. */
    private _handleSingleClick(point: THREE.Vector3): void {
        if (!this.startPoint) {
            this.startPoint = point;
            this._addMarker(point);
            if (this.snapManager) this.snapManager.setActiveStartPoint(point);
            this._updateModeHUD('Click to set the end point');
        } else {
            this._addMarker(point);
            this._clearPrimaryPreview();
            void this._createSegment(this.startPoint, point);
            this.startPoint = null;
            if (this.snapManager) this.snapManager.setActiveStartPoint(null);
            this._updateModeHUD('Segment placed — click to start another');
        }
    }

    /**
     * POLYLINE (linear continuous): chain segments automatically.
     * Loop closure: if the clicked point is within CLOSURE_SNAP_RADIUS of the
     * chain's first point (polylineOrigin), the chain is closed automatically
     * and the tool deactivates.
     */
    private _handlePolylineClick(point: THREE.Vector3): void {
        if (!this.startPoint) {
            // First point of this chain — record as origin for loop closure detection
            this.startPoint     = point.clone();
            this.polylineOrigin = point.clone();
            this._addMarker(point);
            if (this.snapManager) this.snapManager.setActiveStartPoint(point);
            this._updateModeHUD('Click to set the end point');
            return;
        }

        // ── Loop closure check ─────────────────────────────────────────────
        if (
            this.polylineOrigin !== null &&
            point.distanceTo(this.polylineOrigin) <= CLOSURE_SNAP_RADIUS
        ) {
            // Snap exactly to origin and close the loop
            this._clearPrimaryPreview();
            void this._createSegment(this.startPoint, this.polylineOrigin);
            this._clearMarkers();
            this.startPoint      = null;
            this.polylineOrigin  = null;
            if (this.snapManager) this.snapManager.setActiveStartPoint(null);
            this.deactivate();
            if (this.callbacks.onCancel) this.callbacks.onCancel();
            return;
        }

        // ── Normal segment ─────────────────────────────────────────────────
        const end = point.clone();
        this._clearPrimaryPreview();
        void this._createSegment(this.startPoint, end);
        this._polySegmentCount++;
        // Chain: end becomes next start
        this.startPoint = end;
        this._clearMarkers();
        this._addMarker(end);
        if (this.snapManager) this.snapManager.setActiveStartPoint(end);
        this._updateModeHUD('Click to set the next point');
    }

    /**
     * ORTHO: same as POLYLINE but endpoint is constrained to 45° increments.
     * Constraint is applied here (after snap) before forwarding to polyline handler.
     */
    private _handleOrthoClick(point: THREE.Vector3): void {
        const constrained = this._applyOrthoConstraint(point);
        this._handlePolylineClick(constrained);
    }

    /**
     * CURVED: three-click arc.
     *   Click 1 → startPoint
     *   Click 2 → arcMidPoint (a point the arc must pass through)
     *   Click 3 → arcEnd → emit arc segments → reset to AWAITING_FIRST_POINT
     */
    private _handleCurvedClick(point: THREE.Vector3): void {
        if (!this.startPoint) {
            this.startPoint = point.clone();
            this._addMarker(point);
            if (this.snapManager) this.snapManager.setActiveStartPoint(point);
            this._updateModeHUD('Click a through-point for the arc');
        } else if (!this.arcMidPoint) {
            this.arcMidPoint = point.clone();
            this._addMarker(point);
            this._updateModeHUD('Click the arc end point');
        } else {
            const arcEnd = point.clone();
            this._clearPrimaryPreview();
            this._clearArcPreview();
            void this._createArcSegments(this.startPoint, this.arcMidPoint, arcEnd);
            // Reset for next arc
            this._clearMarkers();
            this.startPoint  = null;
            this.arcMidPoint = null;
            if (this.snapManager) this.snapManager.setActiveStartPoint(null);
            this._updateModeHUD('Arc placed — click to start another');
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // Point resolution (snap-aware)
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Resolves a pointer event to a 3D world point, applying snap.
     *
     * Pipeline:
     *   1. Cast a ray from the camera through the pointer onto the active level plane
     *   2. Pass the raw world point through SnapManager.snap() — finds nearest candidate
     *   3. Return the snapped point (or the raw point if no snap hit)
     *
     * Ortho constraint is NOT applied here; it is applied separately so that
     * the ORTHO handler can apply it after snap (correct ordering).
     */
    private _resolvePoint(e: PointerEvent): THREE.Vector3 | null {
        const rawPoint = this._getRawPoint(e);
        if (!rawPoint) return null;

        if (this.snapManager && this.snapManager.isEnabled()) {
            const screenPos = { x: e.clientX, y: e.clientY };
            // §WALL-AUDIT-2026-W5: pass camera-zoom-aware tolerance.
            const _camForSnap = this.world.camera?.three;
            const _canvasForSnap = this.world.renderer?.three?.domElement as HTMLCanvasElement | undefined;
            const _snapTolerance = getWorldToleranceForActiveCamera(
                DEFAULT_SNAP_PIXEL_RADIUS,
                _camForSnap,
                _canvasForSnap,
            );
            const result = this.snapManager.snap(rawPoint, screenPos, false, _snapTolerance);
            // Preserve the active level Y from the raw point — snap only adjusts XZ
            const snapped = result.point.clone();
            snapped.y = rawPoint.y;
            return snapped;
        }

        return rawPoint;
    }

    // ────────────────────────────────────────────────────────────────────────
    // Constraint helpers
    // ────────────────────────────────────────────────────────────────────────

    private _applyConstraint(point: THREE.Vector3): THREE.Vector3 {
        if (this._mode === 'ORTHO' && this.startPoint) {
            return this._applyOrthoConstraint(point);
        }
        return point;
    }

    /**
     * Constrain endpoint to the nearest 45° direction from startPoint (8-direction).
     *
     * Supported directions: 0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°
     *
     * Contract fix (Issue 6): previous implementation only supported 90° cardinal
     * axes. This implementation snaps to the nearest 45° increment using
     * Math.round(angle / (π/4)) — the standard Revit ortho behaviour.
     *
     * Ordering note: called AFTER snap (snap-first, ortho-second) per Issue 6 fix.
     */
    private _applyOrthoConstraint(point: THREE.Vector3): THREE.Vector3 {
        if (!this.startPoint) return point;
        const dx = point.x - this.startPoint.x;
        const dz = point.z - this.startPoint.z;

        if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return point;

        // Snap angle to nearest 45° increment
        const angle        = Math.atan2(dz, dx);
        const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        const dist         = Math.sqrt(dx * dx + dz * dz);

        const result = point.clone();
        result.x = this.startPoint.x + dist * Math.cos(snappedAngle);
        result.z = this.startPoint.z + dist * Math.sin(snappedAngle);
        return result;
    }

    // ────────────────────────────────────────────────────────────────────────
    // Raycaster (raw — no snap)
    // ────────────────────────────────────────────────────────────────────────

    private _getRawPoint(e: PointerEvent): THREE.Vector3 | null {
        const canvas = this.world.renderer!.three.domElement;
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width)  *  2 - 1,
            -((e.clientY - rect.top)  / rect.height) *  2 + 1,
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.world.camera.three);

        // §MI-06 FIX (2026-03-31): Intersect the horizontal plane at the active level's
        // floor elevation rather than the hard-coded Y=0 world origin.
        const worldY  = this._getActiveLevelElevation();
        const plane   = new THREE.Plane(new THREE.Vector3(0, 1, 0), -worldY);
        const intersect = new THREE.Vector3();
        return raycaster.ray.intersectPlane(plane, intersect) ? intersect.clone() : null;
    }

    /**
     * §MI-06: Returns the floor elevation of the currently active level.
     * Falls back to 0 if BimManager or the level is unavailable.
     */
    private _getActiveLevelElevation(): number {
        try {
            const ctx    = this._getProjectContext();
            const bimMgr = this._getBimManager();
            const levelId = ctx?.activeLevelId ?? 'L0';
            if (bimMgr && levelId) {
                const level = bimMgr.getLevelById(levelId);
                if (level != null) return level.elevation;
            }
        } catch {
            // Defensive — never crash the tool on a context lookup failure
        }
        return 0;
    }

    // ────────────────────────────────────────────────────────────────────────
    // Preview geometry (§4.2 / §4.3)
    // ────────────────────────────────────────────────────────────────────────

    private _updatePrimaryPreview(start: THREE.Vector3, end: THREE.Vector3): void {
        this._clearPrimaryPreview();

        const length = start.distanceTo(end);
        if (length < 0.05) return;

        const elevation = this._getActiveLevelElevation();
        const height    = this._predrawConfig.height;
        // Curtain walls are visually thin; use the mullion size as a
        // sensible thickness for the ghost so it reads as a panel rather
        // than a full wall (still > 0 so the body lights up the
        // presence-alpha threshold — see Contract §41,
        // docs/02-decisions/contracts/41-ELEMENT-PREVIEW-VISUAL-CONTRACT.md).
        const thickness = Math.max(this._predrawConfig.mullionSize, 0.02);

        // Footprint line on the floor — visible even when the body is occluded.
        this.previewLine = createFootprintLine(start, end, elevation, PREVIEW_COLOR.PRIMARY);
        this.world.scene.three.add(this.previewLine);

        // Translucent 3D ghost body — same convention as Wall / Handrail
        // (see docs/element-preview.md).
        this.previewBody = createGhostBoxBetween(start, end, elevation, {
            color:     PREVIEW_COLOR.PRIMARY,
            length,
            height,
            thickness,
        });
        this.world.scene.three.add(this.previewBody);
    }

    private _clearPrimaryPreview(): void {
        disposePreviewObject(this.previewLine); this.previewLine = null;
        disposePreviewObject(this.previewBody); this.previewBody = null;
    }

    /** Build a smooth arc preview polyline from start → mid → cursor. */
    private _updateArcPreview(start: THREE.Vector3, mid: THREE.Vector3, end: THREE.Vector3): void {
        this._clearArcPreview();
        const pts = this._sampleArc(start, mid, end, ARC_SEGMENTS);
        if (pts.length < 2) return;

        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color: 0x7c3aed, linewidth: 1.5 });
        this.arcPreviewLine = new THREE.Line(geo, mat);
        this.arcPreviewLine.userData.isPreview = true;
        this.world.scene.three.add(this.arcPreviewLine);

        // 3D ghost body — one box per arc segment, mirroring Wall's curved
        // preview pattern (see WallTool.renderArcPreview).
        const elevation = this._getActiveLevelElevation();
        const height    = this._predrawConfig.height;
        const thickness = Math.max(this._predrawConfig.mullionSize, 0.02);

        const group = new THREE.Group();
        group.userData.isPreview = true;

        for (let i = 0; i < pts.length - 1; i++) {
            const s = pts[i];
            const e = pts[i + 1];
            const segLen = s.distanceTo(e);
            if (segLen < 0.01) continue;
            const segment = createGhostBoxBetween(s, e, elevation, {
                color:     PREVIEW_COLOR.PRIMARY,
                length:    segLen,
                height,
                thickness,
                opacity:   0.35,
            });
            group.add(segment);
        }

        this.arcPreviewBody = group;
        this.world.scene.three.add(this.arcPreviewBody);
    }

    private _clearArcPreview(): void {
        disposePreviewObject(this.arcPreviewLine); this.arcPreviewLine = null;
        disposePreviewObject(this.arcPreviewBody); this.arcPreviewBody = null;
    }

    private _addMarker(point: THREE.Vector3): void {
        // §PERF-2026-Q2-CW-CREATE/F11 — reuse module-cached primitives.
        const marker = new THREE.Mesh(MARKER_GEOMETRY, MARKER_MATERIAL);
        marker.position.copy(point);
        marker.position.y += 0.12;
        marker.userData.isPreview      = true;
        marker.userData.sharedGeometry = true;
        marker.userData.sharedMaterial = true;
        this.world.scene.three.add(marker);
        this.markers.push(marker);
    }

    private _clearMarkers(): void {
        // §PERF-2026-Q2-CW-CREATE/F11 — geometry / material are module-owned;
        // disposing them here would invalidate every other marker (and crash
        // the next placement). Just detach the mesh from the scene.
        for (const m of this.markers) {
            this.world.scene.three.remove(m);
        }
        this.markers = [];
    }

    private _clearAllPreview(): void {
        this._clearPrimaryPreview();
        this._clearArcPreview();
        this._clearMarkers();
    }

    // ────────────────────────────────────────────────────────────────────────
    // Command dispatch (§2.7 / §4.1)
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Create a single straight curtain-wall segment.
     * §4.1: cwId pre-generated in Tool, before constructing the command.
     * §2.7: commandManager.execute() is the ONLY creation path.
     *
     * §PERF-2026-Q2-CW-CREATE/F3 — Now synchronous. The command class is
     * imported statically at module load (top of file) so no per-click
     * `await import(...)` microtask hop and no cold-fetch on the first click.
     *
     * §PERF-2026-Q2-CW-CREATE/F10 — Snap-provider refresh is debounced via
     * `_scheduleSnapProvidersRefresh()` so back-to-back clicks (POLYLINE,
     * ORTHO, ARC) coalesce into one rebuild instead of one per segment.
     */
    private _createSegment(start: THREE.Vector3, end: THREE.Vector3): void {
        const ctx = this._getProjectContext();
        const activeLevelId = ctx?.activeLevelId || 'L0';

        const cwId = createId('curtainwall');  // §4.1 — generated in Tool layer; must be curtainwall_<ULID>

        const command = new CreateCurtainWallCommand({
            id: cwId,
            start: { x: start.x, z: start.z },
            end:   { x: end.x,   z: end.z   },
            height: this._predrawConfig.height,
            gridXSpacing: this._predrawConfig.uSpacing,
            gridYSpacing: this._predrawConfig.vSpacing,
            levelId: activeLevelId,
            // §FEAT-CURTAIN-WALL-CREATE-TYPE (L-964) — carry the armed type and its finish
            // onto the new wall.
            //
            // ⚠ `mullionSize` was ALREADY being collected by the pre-draw panel and then
            // DROPPED here, so `CreateCurtainWallCommand` fell back to its 0.08 default and
            // the user's chosen mullion size never reached a single wall they drew. That is
            // a pre-existing bug this line also fixes; it is grouped here rather than split
            // out because leaving it would make the new type picker look broken for exactly
            // the types whose mullion size differs from 0.08 — which is all of them.
            mullionSize:       this._predrawConfig.mullionSize,
            panelThickness:    this._predrawConfig.panelThickness,
            systemTypeId:      this._predrawConfig.systemTypeId,
            mullionMaterialId: this._predrawConfig.mullionMaterialId,
            mullionColor:      this._predrawConfig.mullionColor,
            glazingMaterialId: this._predrawConfig.glazingMaterialId,
        });

        const manager = this._getCommandManager();
        if (manager) {
            manager.execute(command);
            // §PERF-2026-Q2-CW-CREATE/F10 — debounced snap-provider refresh
            this._scheduleSnapProvidersRefresh();
        } else {
            console.error('[CurtainWallTool] commandManager not available — segment creation aborted');
        }
    }

    // ── §PERF-2026-Q2-CW-CREATE/F10 — snap-provider refresh debounce ────────
    private _snapRefreshHandle: ReturnType<typeof setTimeout> | null = null;

    private _scheduleSnapProvidersRefresh(): void {
        if (!this.snapManager) return;
        if (this._snapRefreshHandle !== null) return;   // a refresh is already queued
        this._snapRefreshHandle = setTimeout(() => {
            this._snapRefreshHandle = null;
            try {
                this.snapManager?.updateProviders();
            } catch (e) {
                console.error('[CurtainWallTool] snap provider refresh failed:', e);
            }
        }, SNAP_PROVIDER_DEBOUNCE_MS);
    }

    private _cancelPendingSnapRefresh(): void {
        if (this._snapRefreshHandle !== null) {
            clearTimeout(this._snapRefreshHandle);
            this._snapRefreshHandle = null;
        }
    }

    /**
     * Create arc segments approximating a circular arc through three XZ points.
     * Falls back to a single straight segment if the three points are collinear.
     */
    private _createArcSegments(
        arcStart: THREE.Vector3,
        arcMid:   THREE.Vector3,
        arcEnd:   THREE.Vector3,
    ): void {
        // §PERF-2026-Q2-CW-CREATE/F3 — `_createSegment` is now synchronous,
        // so the arc loop becomes a plain for-loop. Each segment goes through
        // the snap-refresh debouncer; only one rebuild fires for the whole arc.
        const pts = this._sampleArc(arcStart, arcMid, arcEnd, ARC_SEGMENTS);
        if (pts.length < 2) {
            this._createSegment(arcStart, arcEnd);
            return;
        }
        for (let i = 0; i < pts.length - 1; i++) {
            this._createSegment(pts[i], pts[i + 1]);
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // Arc mathematics (XZ plane)
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Sample N+1 equally-spaced points along the circular arc in the XZ plane
     * that passes through arcStart, arcMid, arcEnd.
     * Returns 2 linear points (just arcStart and arcEnd) when the inputs are collinear.
     */
    private _sampleArc(
        A: THREE.Vector3,
        B: THREE.Vector3,
        C: THREE.Vector3,
        n: number,
    ): THREE.Vector3[] {
        const center = this._circumcenter(A, B, C);
        if (!center) return [A.clone(), C.clone()];

        const r      = center.distanceTo(A);
        const angA   = Math.atan2(A.z - center.z, A.x - center.x);
        const angC   = Math.atan2(C.z - center.z, C.x - center.x);
        const angB   = Math.atan2(B.z - center.z, B.x - center.x);

        // Choose the arc direction that passes through B
        let sweepCCW = (angC - angA + Math.PI * 2) % (Math.PI * 2);
        let sweepCW  = (angA - angC + Math.PI * 2) % (Math.PI * 2);

        // Determine if B lies on the CCW arc from A to C
        const angBNorm = (angB - angA + Math.PI * 2) % (Math.PI * 2);
        const useCCW   = angBNorm <= sweepCCW;

        const totalSweep = useCCW ? sweepCCW : -sweepCW;

        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= n; i++) {
            const t     = i / n;
            const angle = angA + totalSweep * t;
            pts.push(new THREE.Vector3(
                center.x + r * Math.cos(angle),
                A.y,
                center.z + r * Math.sin(angle),
            ));
        }
        return pts;
    }

    /**
     * Circumcenter of the triangle formed by A, B, C in the XZ plane.
     * Returns null if the three points are collinear (no unique circle).
     */
    private _circumcenter(
        A: THREE.Vector3,
        B: THREE.Vector3,
        C: THREE.Vector3,
    ): THREE.Vector3 | null {
        const ax = A.x, az = A.z;
        const bx = B.x, bz = B.z;
        const cx = C.x, cz = C.z;

        const D = 2 * (ax * (bz - cz) + bx * (cz - az) + cx * (az - bz));
        if (Math.abs(D) < 1e-7) return null; // collinear

        const ux = (
            (ax * ax + az * az) * (bz - cz) +
            (bx * bx + bz * bz) * (cz - az) +
            (cx * cx + cz * cz) * (az - bz)
        ) / D;
        const uz = (
            (ax * ax + az * az) * (cx - bx) +
            (bx * bx + bz * bz) * (ax - cx) +
            (cx * cx + cz * cz) * (bx - ax)
        ) / D;

        return new THREE.Vector3(ux, 0, uz);
    }

    // ────────────────────────────────────────────────────────────────────────
    // Layer 1 — Mode bar (top-center, wdh-bar, z-index 9500)
    // Contract §UI_UX_LAYOUT_REFERENCE §2: mode buttons + ESC hint only.
    // ────────────────────────────────────────────────────────────────────────

    private _modeBar: HTMLElement | null = null;
    private _modeBarKeyHandler: ((e: KeyboardEvent) => void) | null = null;

    private _showModeBar(): void {
        this._hideModeBar();

        const bar = document.createElement('div');
        bar.className = 'wdh-bar';
        bar.id = 'cw-mode-bar';

        const lbl = document.createElement('span');
        lbl.className = 'wdh-mode-lbl';
        lbl.textContent = 'Mode:';
        bar.appendChild(lbl);

        // §FIX-CW-BYSLAB-KEY (L-1161, C84 EI-8) — `S` IS "BY SLAB" ACROSS THIS FAMILY.
        //
        // It was `S` = Single here and `B` = By Slab, while the wall
        // (`WallDrawingHUD.ts:82,106`) and the railing both bind `S` to By Slab. The
        // founder's stated reference is the wall, so pressing `S` on the curtain-wall
        // bar SWITCHED DRAWING MODE — a mode change is indistinguishable from "the
        // button did nothing" when the bar is already in that mode, which is one of
        // the ways "curtain wall does NOT work" is true without anything erroring.
        // Single moves to `1` (one segment); `B` is kept below as a deprecated alias
        // so anyone who learned it is not punished for it.
        const modes: Array<{ key: string; label: string; mode: CurtainWallDrawingMode }> = [
            { key: '1', label: 'Single',      mode: 'SINGLE'   },
            { key: 'L', label: 'Linear',      mode: 'POLYLINE' },
            { key: 'O', label: 'Orthogonal',  mode: 'ORTHO'    },
            { key: 'C', label: 'Curved',      mode: 'CURVED'   },
        ];

        for (const m of modes) {
            const btn = document.createElement('button');
            btn.className = 'wdh-btn' + (m.mode === this._mode ? ' wdh-btn--active' : '');
            btn.dataset.cwMode = m.mode;
            btn.innerHTML = `<span class="wdh-key">${m.key}</span><span class="wdh-lbl">${m.label}</span>`;
            btn.title = `Switch to ${m.label} mode (${m.key})`;
            btn.addEventListener('click', () => this._switchMode(m.mode));
            bar.appendChild(btn);
        }

        // By Slab — separator then action button
        const sep = document.createElement('span');
        sep.className = 'wdh-sep';
        bar.appendChild(sep);

        const slabBtn = document.createElement('button');
        slabBtn.className = 'wdh-btn wdh-btn--slab';
        slabBtn.dataset.mode = 'bySlab';
        slabBtn.innerHTML = `<span class="wdh-key">S</span><span class="wdh-lbl">By Slab</span>`;
        slabBtn.title = 'Create curtain walls from a slab perimeter (S)';
        slabBtn.addEventListener('click', () => this.createFromSelectedSlab());
        bar.appendChild(slabBtn);

        // ESC hint — plain text, not a button
        const esc = document.createElement('span');
        esc.className = 'wdh-esc';
        esc.textContent = 'ESC to finish';
        bar.appendChild(esc);

        document.body.appendChild(bar);
        this._modeBar = bar;

        // Keyboard shortcuts for mode switching — bubbling phase so capture-phase
        // escHandler (C = close polyline in POLYLINE/ORTHO) fires first.
        this._modeBarKeyHandler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
            const key = e.key.toLowerCase();

            // §FIX-CW-BYSLAB-KEY (L-1161) — By Slab is tested FIRST and returns, so
            // the mode map can never shadow it the way `s: 'SINGLE'` did.
            // `b` stays live as a deprecated alias of `s`.
            if (key === 's' || key === 'b') {
                e.stopImmediatePropagation();
                this.createFromSelectedSlab();
                return;
            }

            const modeMap: Record<string, CurtainWallDrawingMode> = {
                '1': 'SINGLE', 'l': 'POLYLINE', 'o': 'ORTHO', 'c': 'CURVED',
            };
            const newMode = modeMap[key];
            if (newMode && newMode !== this._mode) {
                e.stopImmediatePropagation();
                this._switchMode(newMode);
            }
        };
        window.addEventListener('keydown', this._modeBarKeyHandler);
    }

    private _hideModeBar(): void {
        if (this._modeBarKeyHandler) {
            window.removeEventListener('keydown', this._modeBarKeyHandler);
            this._modeBarKeyHandler = null;
        }
        if (this._modeBar) {
            this._modeBar.remove();
            this._modeBar = null;
        }
    }

    private _setModeBarActive(mode: CurtainWallDrawingMode): void {
        if (!this._modeBar) return;
        this._modeBar.querySelectorAll<HTMLButtonElement>('[data-cw-mode]').forEach(btn => {
            btn.classList.toggle('wdh-btn--active', btn.dataset.cwMode === mode);
        });
    }

    /** Switch drawing mode mid-session, resetting all in-progress drawing state. */
    private _switchMode(newMode: CurtainWallDrawingMode): void {
        if (newMode === this._mode) return;
        this._clearAllPreview();
        this.startPoint        = null;
        this.polylineOrigin    = null;
        this.arcMidPoint       = null;
        this._polySegmentCount = 0;
        if (this.snapManager) this.snapManager.setActiveStartPoint(null);
        this._mode = newMode;
        this._setModeBarActive(newMode);
        this._showModeHUD();

        // CW-1: Keep curtainWallModePicker in sync so CurtainWallPlanToolHandler
        // reads the correct mode even after the 3D tool switches internally.
        const pickerModeMap: Record<CurtainWallDrawingMode, string> = {
            SINGLE:   'linear',
            POLYLINE: 'linear',
            ORTHO:    'ortho',
            CURVED:   'curved',
        };
        this._getCurtainWallModePicker()?.setActiveMode?.(pickerModeMap[newMode] ?? 'linear');
    }

    // ────────────────────────────────────────────────────────────────────────
    // Layer 2 — Status / instruction bar (bottom-center, th-overlay, z-index 99999)
    // Contract §UI_UX_LAYOUT_REFERENCE §2: instruction text + inline Close Polyline
    // button (when applicable) + ESC hint. No separate Finish/Stop buttons.
    // ────────────────────────────────────────────────────────────────────────

    private _statusBar: HTMLElement | null = null;

    private _showModeHUD(): void {
        const firstMsg: Record<CurtainWallDrawingMode, string> = {
            SINGLE:   'Click to set the start point',
            POLYLINE: 'Click to set the start point',
            ORTHO:    'Click to set the start point',
            CURVED:   'Click to set the arc start point',
        };
        this._updateModeHUD(firstMsg[this._mode]);
    }

    private _updateModeHUD(message: string): void {
        if (!this._statusBar) {
            this._statusBar = document.createElement('div');
            this._statusBar.className = 'th-overlay';
            this._statusBar.id = 'cw-status-bar';

            const text = document.createElement('span');
            text.id = 'cw-status-text';
            text.className = 'th-text';
            this._statusBar.appendChild(text);

            const closeSep = document.createElement('span');
            closeSep.id = 'cw-close-sep';
            closeSep.className = 'th-sep';
            closeSep.style.display = 'none';
            this._statusBar.appendChild(closeSep);

            const closeBtn = document.createElement('button');
            closeBtn.id = 'cw-close-poly-btn';
            closeBtn.className = 'th-close-btn';
            closeBtn.style.display = 'none';
            closeBtn.innerHTML = `<span class="th-key">↵</span><span>Close Polyline</span>`;
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._closePolyline();
            });
            this._statusBar.appendChild(closeBtn);

            const sep = document.createElement('span');
            sep.className = 'th-sep';
            this._statusBar.appendChild(sep);

            const escHint = document.createElement('span');
            escHint.className = 'th-esc';
            escHint.textContent = 'ESC to finish';
            this._statusBar.appendChild(escHint);

            document.body.appendChild(this._statusBar);
        }

        const textEl = this._statusBar.querySelector<HTMLElement>('#cw-status-text');
        if (textEl) textEl.textContent = message;

        // Show Close Polyline inline button once a valid closeable chain exists (≥2 segments)
        // §FEAT-CW-POLY-ENTER — asks THE predicate, so the button and the keys can
        // never disagree about whether a loop is closeable.
        const canClose  = this._canClosePolyline();
        const closeSep  = this._statusBar.querySelector<HTMLElement>('#cw-close-sep');
        const closeBtn  = this._statusBar.querySelector<HTMLElement>('#cw-close-poly-btn');
        if (closeSep) closeSep.style.display = canClose ? '' : 'none';
        if (closeBtn) closeBtn.style.display = canClose ? '' : 'none';

        this._statusBar.style.display = 'flex';
    }

    private _hideModeHUD(): void {
        this._hideModeBar();
        if (this._statusBar) {
            this._statusBar.style.display = 'none';
        }
    }

    /**
     * §FEAT-CW-POLY-ENTER (C87 §13.8 CW-Poly-1) — THE ONE closure predicate for this
     * tool. ENTER, the `C` key and the HUD button's visibility all ask THIS, so the
     * button cannot appear while the keys refuse, or vice versa.
     *
     * ⭐ WHY A PREDICATE AND NOT A THIRD COPY. The wall family is the cautionary
     * tale the contract cites: its closure rule is re-typed FIVE times across
     * `WallPlanToolHandler` (:326, :1046, :1288) and `WallTool` (:1347, :1991), and
     * the copies have ALREADY drifted — the :1046 variant omits the `_wallFirstPoint`
     * term the other four carry. C87 §13.8 says to reuse wall's rule rather than
     * write a second one; wall does not expose one to reuse, so the honest reading is
     * to not start a sixth copy HERE. Extracting wall's own five is a separate lane's
     * work and is NOT done by this change.
     */
    private _canClosePolyline(): boolean {
        return (this._mode === 'POLYLINE' || this._mode === 'ORTHO')
            && this._polySegmentCount >= 2
            && this.polylineOrigin !== null
            && this.startPoint !== null;
    }

    /** Close the active polyline chain back to its origin, then deactivate. */
    private _closePolyline(): void {
        if (this.startPoint && this.polylineOrigin) {
            this._clearPrimaryPreview();
            void this._createSegment(this.startPoint, this.polylineOrigin);
            this._clearAllPreview();
            this.startPoint        = null;
            this.polylineOrigin    = null;
            this._polySegmentCount = 0;
            if (this.snapManager) this.snapManager.setActiveStartPoint(null);
            this.deactivate();
        }
    }

    // ────────────────────────────────────────────────────────────────────────
    // Keyboard handling (Phase 12: Enter to finish, C to close, Escape to cancel)
    // ────────────────────────────────────────────────────────────────────────

    private _attachEscHandler(): void {
        this.escHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                this.deactivate();
                if (this.callbacks.onCancel) this.callbacks.onCancel();
                return;
            }

            // §FEAT-CW-POLY-ENTER (C87 §13.8 CW-Poly-1) — ENTER CLOSES THE LOOP.
            //
            // ⛔ IT DID NOT, AND THE HUD SAID IT DID. The Close-Polyline button this
            // tool renders is labelled `↵` (_showModeHUD), but ENTER was bound to
            // *finish* — clear the preview and deactivate — while the actual closing
            // key was `C`, advertised nowhere. So the one affordance on screen named
            // the one key that did not do it. A control that names the wrong key is
            // worse than no control: it teaches the user the feature is broken.
            //
            // ENTER now CLOSES when there is a loop to close, and FINISHES otherwise
            // (2 points and no origin is a chain, not a loop — finishing it is the
            // only correct reading, and the previous behaviour is preserved there).
            if (e.key === 'Enter' && (this._mode === 'POLYLINE' || this._mode === 'ORTHO')) {
                if (this._canClosePolyline()) {
                    e.stopPropagation();
                    this._closePolyline();
                } else if (this.startPoint) {
                    e.stopPropagation();
                    this._clearAllPreview();
                    this.deactivate();
                }
                return;
            }

            // `C` is KEPT as an alias, not removed — it has been the working closure
            // key and muscle memory is real. It now delegates to _closePolyline()
            // instead of re-implementing it: the previous inline copy omitted the
            // `_polySegmentCount = 0` reset that _closePolyline performs (C84 EI-9,
            // two answers to one question).
            if ((e.key === 'c' || e.key === 'C') && (this._mode === 'POLYLINE' || this._mode === 'ORTHO')) {
                if (this._canClosePolyline()) {
                    e.stopPropagation();
                    this._closePolyline();
                }
                return;
            }
        };
        window.addEventListener('keydown', this.escHandler, { capture: true });
    }

    private _detachEscHandler(): void {
        if (this.escHandler) {
            window.removeEventListener('keydown', this.escHandler, { capture: true } as EventListenerOptions);
            this.escHandler = null;
        }
    }
}
