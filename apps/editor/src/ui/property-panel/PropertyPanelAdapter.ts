/**
 * PropertyPanelAdapter
 * --------------------
 * Bridges the new schema-driven PropertyPanel to the same interface
 * that PropertyInspector exposes in main.ts:
 *
 *   adapter.element  → the panel DOM node (appended to document.body)
 *   adapter.hide()   → hides the panel
 *   adapter.update() → shows the panel for a THREE.Object3D selection
 *                       (OBC.View selections are routed to viewPropertiesPanel
 *                        by main.ts itself, so we simply hide here)
 *
 * This file is intentionally the ONLY point of change wiring the new panel
 * into main.ts.  No other existing file is modified.
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { PropertyPanel } from './PropertyPanel';
import { AnnotationElement } from '@pryzm/plugin-annotations';

export interface PropertyPanelAdapterOptions {
    onUnselect?: () => void;
    onApplyHighlight?: (obj: THREE.Object3D) => void;
    onUpdateShadows?: () => Promise<void>;
    transformControls?: any;
    materialMap?: Map<string, any>;
    getCurrentVisualStyle?: () => string;
}

export class PropertyPanelAdapter {
    readonly element: HTMLDivElement;
    private readonly panel: PropertyPanel;

    /** Phase B (S73-WIRE) — runtime threaded by parent. */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(_options: PropertyPanelAdapterOptions = {}, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
        this.runtime = runtime;
        this.panel = new PropertyPanel();
        this.element = this.panel.element;

        this._applyStyling();
        this._bindGridSelectedEvent();
    }

    private _bindGridSelectedEvent(): void {
        // F.events.2d — runtime.events subscription (dispatch migrated in F.events.2c).
        // this.runtime is injected in the constructor (may be null during tests).
        (this.runtime?.events ?? window.runtime?.events)?.on('pryzm-grid-selected', (payload: unknown) => {
            const detail = payload as { gridId?: string; grid?: any } | undefined;
            if (!detail?.grid) return;
            this.panel.showGrid(detail.grid);
        });
    }

    /**
     * Mirrors PropertyInspector.hide().
     * Called by unselectAll() and the view-selected event handler.
     */
    public hide(): void {
        this.panel.hide();
    }

    /**
     * Mirrors PropertyInspector.update(obj).
     * - THREE.Object3D   → showElement (full property panel)
     * - null / undefined → showViewProperties (Phase 2.2 default inspector state)
     * - OBC.View / other → hide (views handled by viewPropertiesPanel)
     */
    public update(obj: THREE.Object3D | OBC.View | null | undefined): void {
        if (!obj) {
            this.panel.showViewProperties();
            return;
        }

        if (obj instanceof THREE.Object3D) {
            this.panel.showElement(obj);
        } else {
            this.panel.hide();
        }
    }

    /**
     * Shows the panel in pre-draw mode for wall creation.
     * The user picks a wall system type before placing the first point on the canvas.
     * Delegates directly to PropertyPanel.showWallPreDraw().
     * Called by Layout.ts when any wall drawing mode is activated.
     */
    public showWallPreDraw(wallTool: any): void {
        this.panel.showWallPreDraw(wallTool);
    }

    /**
     * Shows the panel in pre-draw mode for slab creation.
     * The user picks a slab system type before drawing on the canvas.
     * Delegates directly to PropertyPanel.showSlabPreDraw().
     * Called by Layout.ts when any slab drawing mode is activated.
     */
    public showSlabPreDraw(slabTool: any): void {
        this.panel.showSlabPreDraw(slabTool);
    }

    public showDoorPreDraw(doorTool: any): void {
        this.panel.showDoorPreDraw(doorTool);
    }

    public showWindowPreDraw(windowTool: any): void {
        this.panel.showWindowPreDraw(windowTool);
    }

    public showPlumbingPreDraw(plumbingTool: any): void {
        this.panel.showPlumbingPreDraw(plumbingTool);
    }

    /**
     * Shows the panel in pre-draw mode for curtain wall creation.
     * The user configures height, grid spacing, and mullion size before
     * placing the first point on the canvas.
     * Delegates directly to PropertyPanel.showCurtainWallPreDraw().
     * Called by Layout.ts when the curtain wall "Single" action is triggered.
     */
    public showCurtainWallPreDraw(curtainWallTool: any): void {
        this.panel.showCurtainWallPreDraw(curtainWallTool);
    }

    public setRoofStore(store: { getById(id: string): any }): void {
        this.panel.setRoofStore(store);
    }

    public setCommandManager(cmdMgr: any): void {
        this.panel.setCommandManager(cmdMgr);
    }

    /**
     * §ANN-SEL: Shows the property panel populated with dimension-editing fields
     * for a placed linear-dim annotation. Called by AnnotationManager when the
     * user clicks a dimension line in the viewport.
     * Delegates directly to PropertyPanel.showLinearDimension().
     *
     * @param selectedWallId  When a wall was selected at the time the user clicked
     *                        the dimension, pass its ID so the "Move Wall" field is shown.
     */
    public showLinearDimension(ann: AnnotationElement, selectedWallId?: string): void {
        this.panel.showLinearDimension(ann, undefined, selectedWallId);
    }

    /**
     * Only set display:none on startup; all other positioning is handled by
     * the .gpp-panel CSS class (right: 160px, beside the 140px Tools panel).
     */
    private _applyStyling(): void {
        this.element.style.display = 'none';
    }
}
