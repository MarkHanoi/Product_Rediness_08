/**
 * §ANN — Annotation Manager
 *
 * Top-level lifecycle manager for the annotation system.
 * Wires together: AnnotationStore → DependencyGraph → RenderLayer → Tools.
 *
 * Wired once in EngineBootstrap, then accessible via
 *   window.annotationManager
 *
 * Contract compliance:
 *   §06 §9   — Engine-layer code; only imported in EngineBootstrap
 *   §05 §7.8 — No bim-* / @thatopen/ui elements
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { annotationStore, AnnotationStore } from './subsystem/AnnotationStore';
import { AnnotationElement, DimensionElement, DimPoint2D } from './subsystem/AnnotationTypes';
import { AnnotationDependencyGraph } from './subsystem/AnnotationDependencyGraph';
import { AnnotationRenderLayer } from './AnnotationRenderLayer';
import { AnnotationVisibilityStore, annotationVisibilityStore } from './subsystem/AnnotationVisibilityStore';
import { LinearDimensionAnnotationTool } from './tools/LinearDimensionAnnotationTool';
import { AngularDimensionAnnotationTool } from './tools/AngularDimensionAnnotationTool';
import { TextNoteTool } from './tools/TextNoteTool';
import { ElementTagTool } from './tools/ElementTagTool';
import { SpotElevationAnnotationTool } from './tools/SpotElevationAnnotationTool';
import { KeynoteTool } from './tools/KeynoteTool';
import { ResolverStores } from './subsystem/AnnotationReference';
import { constraintStore } from './subsystem/ConstraintStore';
import { constraintSolver } from './subsystem/ConstraintSolver';
import { ConstraintViolationPanel } from './ConstraintViolationPanel';
import { obcAnnotationAdapter } from './OBCAnnotationAdapter';
import { viewTechnicalDrawingCache } from '@pryzm/core-app-model';
import { RadiusDimensionTool } from './tools/RadiusDimensionTool';
import { DiameterDimensionTool } from './tools/DiameterDimensionTool';
import { SlopeDimensionTool } from './tools/SlopeDimensionTool';
// DOC-2.5 — Specialised tag tools
import { DoorTagTool } from './tools/DoorTagTool';
import { WindowTagTool } from './tools/WindowTagTool';
import { LevelTagTool } from './tools/LevelTagTool';
import { GridBubbleTool } from './tools/GridBubbleTool';
// DOC-2.8 — Revision cloud tool
import { RevisionCloudTool } from './tools/RevisionCloudTool';
// DOC-2.7/2.8 — Section mark, elevation mark, callout detail
import { SectionMarkTool } from './tools/SectionMarkTool';
import { ElevationMarkTool } from './tools/ElevationMarkTool';
import { CalloutDetailTool } from './tools/CalloutDetailTool';

type CommandManager = { execute(cmd: unknown): void };

export class AnnotationManager {
    public readonly store: AnnotationStore = annotationStore;
    public readonly visibilityStore: AnnotationVisibilityStore = annotationVisibilityStore;

    private _depGraph: AnnotationDependencyGraph;
    private _renderLayer: AnnotationRenderLayer | null = null;
    /** §ANN-C3 — Panel that displays live constraint violation status */
    private _constraintPanel: ConstraintViolationPanel | null = null;
    /**
     * §ANN-SEL — Reference to the shared PropertyPanelAdapter (via setPropertyPanel).
     * When the user clicks a placed dimension the panel's showLinearDimension() method
     * is called so dimension editing lives in the standard property panel rather than
     * a separate floating overlay.
     */
    private _propertyPanel: { showLinearDimension: (ann: AnnotationElement, selectedWallId?: string) => void; hide: () => void } | null = null;
    /** §ANN-SEL — Canvas click handler reference so it can be removed on dispose */
    private _canvasClickHandler: ((e: MouseEvent) => void) | null = null;
    /** §ANN-SEL — The renderer canvas element; stored to wire/unwire click detection */
    private _rendererCanvas: HTMLCanvasElement | null = null;

    public linearDimTool:   LinearDimensionAnnotationTool   | null = null;
    public angularDimTool:  AngularDimensionAnnotationTool  | null = null;
    public textNoteTool:    TextNoteTool                    | null = null;
    public elementTagTool:  ElementTagTool                  | null = null;
    public spotElevationTool: SpotElevationAnnotationTool   | null = null;
    public keynoteTool:     KeynoteTool                     | null = null;
    // DOC-2.4 — New dimension tools
    public radiusDimTool:   RadiusDimensionTool             | null = null;
    public diameterDimTool: DiameterDimensionTool           | null = null;
    public slopeDimTool:    SlopeDimensionTool              | null = null;
    // DOC-2.5 — Specialised tag tools
    public doorTagTool:       DoorTagTool                   | null = null;
    public windowTagTool:     WindowTagTool                 | null = null;
    public levelTagTool:      LevelTagTool                  | null = null;
    public gridBubbleTool:    GridBubbleTool                | null = null;
    // DOC-2.8 — Revision cloud tool
    public revisionCloudTool: RevisionCloudTool             | null = null;
    // DOC-2.7/2.8 — Section mark, elevation mark, callout detail
    public sectionMarkTool:   SectionMarkTool               | null = null;
    public elevationMarkTool: ElevationMarkTool             | null = null;
    public calloutDetailTool: CalloutDetailTool             | null = null;

    private _activeViewId: string | null = null;
    private _world: any;

    // ── §DIM-IV-3: DI keyboard shortcut ──────────────────────────────────────
    // Tracks a two-key Revit-style sequence: press 'D', then 'I' within 1.5 s
    // to activate the Linear Dimension tool.
    private _diFirstKeyTime: number = 0;
    private _diHandler: ((e: KeyboardEvent) => void) | null = null;

    constructor(
        private _components: OBC.Components,
        private _commandManager: CommandManager,
        private _resolverStores: ResolverStores
    ) {
        this._depGraph = new AnnotationDependencyGraph(this.store, _resolverStores);
    }

    /**
     * ANNOTATION-SYSTEM-AUDIT-2026 — A5
     * Public accessor so initTools can wire the dependency graph into
     * CommandContext.annotationDependencyGraph and ProjectLoader can call
     * `rebuild()` after deserialise.
     */
    get dependencyGraph(): AnnotationDependencyGraph {
        return this._depGraph;
    }

    /**
     * §ANN-SEL: Wire the shared PropertyPanelAdapter into the manager.
     * Must be called from initTools after both annotationManager and inspector
     * are created. The adapter's showLinearDimension() will be called whenever
     * the user clicks a placed dimension line.
     */
    setPropertyPanel(panel: { showLinearDimension: (ann: AnnotationElement, selectedWallId?: string) => void; hide: () => void }): void {
        this._propertyPanel = panel;
    }

    /** Tracks whether the property panel is currently showing a dimension (not a BIM element). */
    private _dimensionPanelActive = false;

    /** §ANN-WALL-SEL — The currently selected BIM element ID (from bim-selection-changed). */
    private _selectedElementId: string | null = null;

    /**
     * §ANN-WALL-SEL — Notify the annotation system that a BIM element has been selected
     * (or deselected when id = null). Dimensions that reference the selected element
     * are highlighted in the render layer so the user knows they are interactive.
     */
    setSelectedElementId(id: string | null): void {
        this._selectedElementId = id;
        this._renderLayer?.setSelectedElementId(id);
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * Call once the 3D viewport container element is available.
     * @param container  The HTML element that wraps the Three.js renderer canvas.
     * @param world      The @thatopen/components OBC.World instance.
     */
    init(container: HTMLElement, world: any): void {
        this._world = world;

        this._renderLayer = new AnnotationRenderLayer(this.store, container);

        // Start dependency graph reactive loop
        this._depGraph.init();

        // When dependency graph flushes dirty annotations, request a re-render.
        // §C4 — Also re-evaluate all constraints: cached positions may have moved
        // (e.g. a wall was translated), so solver results must be refreshed.
        this._depGraph.onDirtyFlushed(() => {
            this._renderLayer?.requestRender();
            constraintSolver.checkAll(constraintStore, this._resolverStores);
        });

        // Keep camera synced for projection
        this._syncCamera();

        // Wire visibility store into render layer
        this._renderLayer.setVisibilityStore(this.visibilityStore);

        // §C3/C4 — Wire constraint store into render layer for violation overlays.
        this._renderLayer.setConstraintStore(constraintStore);

        // §ANN-SEL — Wire click detection on the renderer canvas.
        // The annotation canvas overlay (ann-render-layer) has pointer-events:none so
        // all mouse events reach the renderer canvas beneath it. We intercept clicks
        // here (before the 3D SelectionManager sees them) and check whether the click
        // is close to any rendered dim line. If yes, show the properties panel and stop
        // propagation so the SelectionManager does not also fire.
        const rendererCanvas = world?.renderer?.three?.domElement as HTMLCanvasElement | null;
        if (rendererCanvas) {
            this._rendererCanvas = rendererCanvas;
            this._canvasClickHandler = (e: MouseEvent) => {
                // Only intercept left-clicks with no annotation tool active
                if (e.button !== 0) return;
                const toolMgr = window.toolManager;
                const activeTool = toolMgr?.getActiveTool?.() ?? 'none';
                if (activeTool === 'linear-dim' || activeTool === 'linear-dimension') return;

                const rect = rendererCanvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                const ann = this._renderLayer?.getAnnotationAtPoint(x, y) ?? null;
                if (ann && ann.type === 'linear-dim') {
                    e.stopImmediatePropagation();
                    // §ANN-WALL-SEL: pass selected wall ID so PropertyPanel can offer
                    // the "Move Wall" drive-dimension field.
                    const selWall = this._selectedElementId ?? undefined;
                    this._propertyPanel?.showLinearDimension(ann, selWall);
                    this._dimensionPanelActive = true;
                    console.log('[AnnotationManager] Dimension selected via click:', ann.id, selWall ? `(wall: ${selWall})` : '');
                } else if (this._dimensionPanelActive) {
                    // Dismiss the property panel only if it was showing a dimension,
                    // so normal BIM element selection (wall, slab, …) is unaffected.
                    this._propertyPanel?.hide();
                    this._dimensionPanelActive = false;
                }
            };
            rendererCanvas.addEventListener('click', this._canvasClickHandler, { capture: true });
        }

        // §ANN-C3 — Mount the constraint violation panel to the viewport container.
        // It auto-hides when there are no active constraints.
        this._constraintPanel = new ConstraintViolationPanel(constraintStore);
        this._constraintPanel.mount(container);

        // §ANN-WALL-SEL — Listen for BIM element selection changes so we can
        // highlight dimensions that reference the newly selected element.
        // bim-selection-changed carries { object: THREE.Object3D | null }.
        // When object has userData.id, that element is selected; null = deselected.
        window.addEventListener('bim-selection-changed', (e: Event) => {
            const detail = (e as CustomEvent).detail as { object: any | null };
            if (detail?.object?.userData?.id) {
                this.setSelectedElementId(detail.object.userData.id);
            } else {
                this.setSelectedElementId(null);
            }
        });

        // §C3 — Reactively manage ConstraintRecords from the annotation store.
        // - 'add'    → create a record when a locked linear-dim is placed
        // - 'update' → re-create the record when lock state or parameters change
        // - 'remove' → delete the record so stale constraints don't linger
        // After any mutation, run a full solver pass to update violation status.
        this.store.onChange((type, ann) => {
            if (ann.type === 'linear-dim') {
                if (type === 'add') {
                    if (ann.parameters.isLocked) {
                        constraintStore.createFromAnnotation(ann);
                        console.log('[AnnotationManager] Constraint created for locked dim:', ann.id);
                    }
                } else if (type === 'update') {
                    // Lock state may have changed — remove any old record and re-seed
                    constraintStore.deleteByAnnotationId(ann.id);
                    if (ann.parameters.isLocked) {
                        constraintStore.createFromAnnotation(ann);
                        console.log('[AnnotationManager] Constraint updated for dim:', ann.id);
                    }
                }
            }
            if (type === 'remove') {
                constraintStore.deleteByAnnotationId(ann.id);
            }
            // §C4 — Always re-evaluate after any store change
            constraintSolver.checkAll(constraintStore, this._resolverStores);
        });

        // Wire tools — Phase I–III
        this.linearDimTool = new LinearDimensionAnnotationTool(
            this._components,
            this._commandManager,
            this.store,
            this._resolverStores
        );

        this.textNoteTool = new TextNoteTool(
            this._components,
            this.store
        );

        this.elementTagTool = new ElementTagTool(
            this._components,
            this.store,
            this._resolverStores
        );

        // Wire tools — Phase IV
        this.angularDimTool = new AngularDimensionAnnotationTool(
            this._components,
            this.store,
            this._resolverStores
        );

        this.spotElevationTool = new SpotElevationAnnotationTool(
            this._components,
            this.store
        );

        this.keynoteTool = new KeynoteTool(
            this._components,
            this.store,
            this._resolverStores
        );

        // DOC-2.4 — New dimension tools
        this.radiusDimTool = new RadiusDimensionTool(
            this._components,
            this._resolverStores
        );

        this.diameterDimTool = new DiameterDimensionTool(
            this._components,
            this._resolverStores
        );

        this.slopeDimTool = new SlopeDimensionTool(
            this._components,
            this._resolverStores
        );

        // DOC-2.5 — Specialised tag tools
        this.doorTagTool = new DoorTagTool(
            this._components,
            this._resolverStores
        );

        this.windowTagTool = new WindowTagTool(
            this._components,
            this._resolverStores
        );

        this.levelTagTool = new LevelTagTool(
            this._components,
            this._resolverStores
        );

        this.gridBubbleTool = new GridBubbleTool(
            this._components,
            this.store,
            this._resolverStores
        );

        // DOC-2.8 — Revision cloud tool
        this.revisionCloudTool = new RevisionCloudTool(
            this._components,
            this._resolverStores
        );

        // DOC-2.7/2.8 — Section mark, elevation mark, callout detail tools
        this.sectionMarkTool = new SectionMarkTool(
            this._components,
            this._commandManager,
        );

        this.elevationMarkTool = new ElevationMarkTool(
            this._components,
            this._commandManager,
        );

        this.calloutDetailTool = new CalloutDetailTool(
            this._components,
            this._commandManager,
        );

        // §DIM-IV-3: Register DI keyboard shortcut (Revit-style two-key sequence)
        this._registerDiShortcut();

        // §DIM-V-1/V-2: Wire hover-hint callback so the render layer can draw the
        // 2D canvas face-highlight quad and locked-reference dots on each frame.
        this.linearDimTool.setHoverHintCallback((hint) => {
            this._renderLayer?.setDimHoverHint(hint);
        });

        // §ANN-VIEW: Subscribe to 'view-selected' so every annotation tool knows which
        // floor-plan/elevation view is active.  ViewController dispatches this event
        // after every view transition with detail: { viewId: string }.
        window.addEventListener('view-selected', (e: Event) => {
            const detail = (e as CustomEvent<{ viewId: string }>).detail;
            if (detail?.viewId) {
                this.sectionMarkTool?.setActiveViewId(detail.viewId);
                this.elevationMarkTool?.setActiveViewId(detail.viewId);
                this.calloutDetailTool?.setActiveViewId(detail.viewId);
                this.setActiveView(detail.viewId);
                console.log('[AnnotationManager] active view set from view-selected →', detail.viewId);
            }
        });

        console.log('[AnnotationManager] init complete — Phase V hover hints wired');
    }

    // ── §DIM-IV-3: DI keyboard shortcut ──────────────────────────────────────

    /**
     * Registers a global keydown listener that detects the two-key sequence
     * 'D' → 'I' (pressed within 1.5 s) and activates the Linear Dimension tool.
     *
     * Skips activation when an input / textarea / select / contenteditable
     * element has focus, matching Revit's shortcut behaviour.
     *
     * Uses window.toolManager?.activateLinearDimension() so the full
     * ToolManager deactivation flow runs before the tool activates — preventing
     * multiple tools from being active simultaneously.
     */
    private _registerDiShortcut(): void {
        const TIMEOUT_MS = 1500;

        const handler = (e: KeyboardEvent): void => {
            // Skip when typing in an input field
            const target = e.target as HTMLElement | null;
            if (
                target instanceof HTMLInputElement  ||
                target instanceof HTMLTextAreaElement ||
                target instanceof HTMLSelectElement ||
                (target as HTMLElement)?.isContentEditable
            ) return;

            if (e.key === 'D' || e.key === 'd') {
                this._diFirstKeyTime = Date.now();
                return;
            }

            if ((e.key === 'I' || e.key === 'i') && this._diFirstKeyTime > 0) {
                if (Date.now() - this._diFirstKeyTime <= TIMEOUT_MS) {
                    this._diFirstKeyTime = 0;
                    console.log('[AnnotationManager] DI shortcut → activateLinearDimension');
                    // Delegate to ToolManager so all other tools are deactivated first
                    const toolMgr = window.toolManager;
                    // §DIM-IV-3: Use the Class A annotation tool (not legacy linear-dimension)
                    if (toolMgr?.activateLinearDimAnnotation) {
                        toolMgr.activateLinearDimAnnotation();
                    } else {
                        // Fallback: direct activation when ToolManager not yet available
                        this.linearDimTool?.activate();
                    }
                } else {
                    // Timed out — reset
                    this._diFirstKeyTime = 0;
                }
                return;
            }

            // Any other key cancels the first-key latch
            if (this._diFirstKeyTime > 0) this._diFirstKeyTime = 0;
        };

        this._diHandler = handler;
        window.addEventListener('keydown', handler);
    }

    // ── View management ───────────────────────────────────────────────────────

    setActiveView(viewId: string | null): void {
        this._activeViewId = viewId;
        this._renderLayer?.setActiveView(viewId);
        this._renderLayer?.requestRender();

        // Pass active view to all tools
        this.linearDimTool?.setActiveViewId(viewId);
        this.angularDimTool?.setActiveViewId(viewId);
        this.textNoteTool?.setActiveViewId(viewId);
        this.elementTagTool?.setActiveViewId(viewId);
        this.spotElevationTool?.setActiveViewId(viewId);
        this.keynoteTool?.setActiveViewId(viewId);
        // DOC-2.4
        this.radiusDimTool?.setActiveViewId(viewId);
        this.diameterDimTool?.setActiveViewId(viewId);
        this.slopeDimTool?.setActiveViewId(viewId);
        // DOC-2.5
        this.doorTagTool?.setActiveViewId(viewId);
        this.windowTagTool?.setActiveViewId(viewId);
        this.levelTagTool?.setActiveViewId(viewId);
        this.gridBubbleTool?.setActiveViewId(viewId);
        // DOC-2.8
        this.revisionCloudTool?.setActiveViewId(viewId);
        // Auto-place grid bubbles when a view is activated
        if (viewId && this.gridBubbleTool) {
            this.gridBubbleTool.autoPlaceForView(viewId);
        }

        // DOC-2.2: keep OBCAnnotationAdapter in sync with the active drawing so that
        // OBC annotation system onCommit events are attributed to the correct view.
        if (viewId) {
            const drawing = viewTechnicalDrawingCache.get(viewId);
            if (drawing) {
                obcAnnotationAdapter.attachToDrawing(drawing, viewId);
            } else {
                // Drawing not yet projected; detach so stale commits are rejected.
                obcAnnotationAdapter.detach();
            }
        } else {
            obcAnnotationAdapter.detach();
        }
    }

    getActiveViewId(): string | null {
        return this._activeViewId;
    }

    // ── Camera sync ───────────────────────────────────────────────────────────

    private _syncCamera(): void {
        if (!this._world?.renderer) return;
        const camera = this._world.camera?.three as THREE.Camera | undefined;
        if (camera) this._renderLayer?.setCamera(camera);

        this._world.renderer.onAfterUpdate?.add(() => {
            const cam = this._world.camera?.three as THREE.Camera | undefined;
            if (cam) {
                this._renderLayer?.setCamera(cam);
                this._renderLayer?.requestRender();
            }
        });
    }

    // ── Resolver store update (call after project load) ───────────────────────

    updateResolverStores(stores: ResolverStores): void {
        this._resolverStores = stores;
        this._depGraph.setResolverStores(stores);
        this.linearDimTool?.setResolverStores(stores);
        this.angularDimTool?.setResolverStores(stores);
        this.elementTagTool?.setResolverStores(stores);
        this.keynoteTool?.setResolverStores(stores);
        // DOC-2.4
        this.radiusDimTool?.setResolverStores(stores);
        this.diameterDimTool?.setResolverStores(stores);
        this.slopeDimTool?.setResolverStores(stores);
        // DOC-2.5
        this.doorTagTool?.setResolverStores(stores);
        this.windowTagTool?.setResolverStores(stores);
        this.levelTagTool?.setResolverStores(stores);
        this.gridBubbleTool?.setResolverStores(stores);
        // DOC-2.8
        this.revisionCloudTool?.setResolverStores(stores);
        this._depGraph.refreshAll();
        // §C4 — Re-evaluate constraints with the latest resolver stores
        constraintSolver.checkAll(constraintStore, stores);
    }

    // ── §DIM-VIII-1 — DimensionElement factory ───────────────────────────────

    /**
     * Create and store a new `DimensionElement` for the given view.
     *
     * @param p1       First reference point in world XZ (metres)
     * @param p2       Second reference point in world XZ (metres)
     * @param viewId   The view this dimension belongs to
     * @param offsetMm Perpendicular offset from the p1→p2 line (mm, default 10)
     * @param textOverride Optional verbatim label (null = compute from distance)
     * @returns The newly created dimension's id
     */
    createDimension(
        p1:           DimPoint2D,
        p2:           DimPoint2D,
        viewId:       string,
        offsetMm      = 10,
        textOverride: string | null = null,
    ): string {
        const now = Date.now();
        const dim: DimensionElement = {
            id:           crypto.randomUUID(),
            type:         'linear-dimension',
            p1,
            p2,
            offsetMm,
            textOverride,
            viewId,
            createdAt:    now,
            updatedAt:    now,
        };
        this.store.addDimension(dim);
        console.log('[AnnotationManager] createDimension:', dim.id, `(${p1.x.toFixed(3)},${p1.y.toFixed(3)})→(${p2.x.toFixed(3)},${p2.y.toFixed(3)}) offset=${offsetMm}mm`);
        return dim.id;
    }

    // ── Dispose ───────────────────────────────────────────────────────────────

    dispose(): void {
        this.linearDimTool?.deactivate();
        this.angularDimTool?.deactivate();
        this.textNoteTool?.deactivate();
        this.elementTagTool?.deactivate();
        this.spotElevationTool?.deactivate();
        this.keynoteTool?.deactivate();
        // DOC-2.4
        this.radiusDimTool?.deactivate();
        this.diameterDimTool?.deactivate();
        this.slopeDimTool?.deactivate();
        // DOC-2.5
        this.doorTagTool?.deactivate();
        this.windowTagTool?.deactivate();
        this.levelTagTool?.deactivate();
        this.gridBubbleTool?.deactivate();
        // DOC-2.8
        this.revisionCloudTool?.deactivate();
        this._depGraph.dispose();
        this._renderLayer?.dispose();
        this._constraintPanel?.dispose();
        this._constraintPanel = null;
        // §ANN-SEL: remove canvas click listener
        if (this._rendererCanvas && this._canvasClickHandler) {
            this._rendererCanvas.removeEventListener('click', this._canvasClickHandler, { capture: true } as EventListenerOptions);
        }
        this._canvasClickHandler = null;
        this._rendererCanvas = null;
        this._propertyPanel = null;
        this._dimensionPanelActive = false;
        // §C3 — Clear constraint records on manager teardown to prevent stale state
        constraintStore.clear();
        // §DIM-IV-3: Remove DI shortcut listener
        if (this._diHandler) {
            window.removeEventListener('keydown', this._diHandler);
            this._diHandler = null;
        }
        // DOC-2.2: detach OBCAnnotationAdapter so no stale commits reach the store
        obcAnnotationAdapter.detach();
    }
}
