import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { CreateFurnitureCommand } from '@pryzm/command-registry';
import { FurnitureStore } from './FurnitureStore';
import { FurnitureFragmentBuilder } from './FurnitureFragmentBuilder';
import { FurnitureType, FurnitureData } from './FurnitureTypes';
import { WardrobeConfig } from './WardrobeTypes';
import { CornerSofaBuilder } from './builders/CornerSofaBuilder';
import { WhiteSofaBuilder } from './builders/WhiteSofaBuilder';
import { BedBuilder } from './builders/BedBuilder';
import { JapaneseBedBuilder } from './builders/JapaneseBedBuilder';
import type { BedVariant } from './engines/BedEngine';
import { MaterialService } from './MaterialService';
import { PREVIEW_COLOR, OBJECT_PREVIEW_OPACITY, createObjectPreviewMaterial, tagPreview } from '@pryzm/core-app-model';

export class FurnitureTool {
    private isActive = false;
    private previewMesh: THREE.Group | null = null;
    private pointerMoveHandler: ((e: PointerEvent) => void) | null = null;
    private pointerDownHandler: ((e: PointerEvent) => void) | null = null;
    private _escListener: ((e: KeyboardEvent) => void) | null = null;
    private furnitureType: FurnitureType = 'bed';
    private startPoint: THREE.Vector3 | null = null;
    private cornerPoint: THREE.Vector3 | null = null;
    private isDrawing = false;
    private drawingStep = 0;
    private _getDescriptor: (type: string) => any;

    constructor(
        private world: OBC.World,
        public store: FurnitureStore,
        public builder: FurnitureFragmentBuilder,
        getDescriptor?: (type: string) => any,
    ) {
        this._getDescriptor = getDescriptor ?? (() => null);
    }

    setFurnitureType(type: FurnitureType) {
        this.furnitureType = type;
        this.startPoint = null;
        this.cornerPoint = null;
        this.isDrawing = false;
        this.drawingStep = 0;
        if (this.isActive) {
            this.removePreview();
            this.createPreview();
        }
    }

    activate() {
        if (this.isActive) return;
        this.isActive = true;
        this.startPoint = null;
        this.isDrawing = false;
        this._escListener = (e: KeyboardEvent) => { if (e.key === 'Escape') this.deactivate(); };
        document.addEventListener('keydown', this._escListener);
        this.attachListeners();
        this.createPreview();
    }

    deactivate() {
        if (!this.isActive) return;
        this.isActive = false;
        this.startPoint = null;
        this.isDrawing = false;
        if (this._escListener) {
            document.removeEventListener('keydown', this._escListener);
            this._escListener = null;
        }
        this.detachListeners();
        this.removePreview();
    }

    /**
     * Build a ghosted real-geometry preview for sofas using the real builder
     * (Contract §41 §2 — preview anatomy must match the final element).
     * Materials are overridden with a translucent accent so the user reads it
     * as a placement preview rather than a placed element. Origin convention
     * matches the builder (back-left corner) so the cursor anchors at the
     * sofa's back-left, identical to the committed geometry.
     */
    /**
     * Build a ghosted real-geometry preview for beds using the real builders.
     * Mirrors buildSofaPreview() for the bed family (legacy + 5 parametric).
     * Without this, parametric bed types (japanese_*, nordic_, solid_wood_)
     * had NO placement preview at all — the user dragged blind.
     */
    private buildBedPreview(): THREE.Group | null {
        // Contract §41 §3.1 — Object Placement Preview Standard.
        // PRYZM purple #8B5CF6 @ 0.55 opacity matches every other carousel
        // ghost (PlumbingTool, FurnitureDragDropHandler, KitchenCabinetTool).
        const ghostMat = new THREE.MeshBasicMaterial({
            color: PREVIEW_COLOR.OBJECT,
            transparent: true,
            opacity: OBJECT_PREVIEW_OPACITY,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        const apply = (g: THREE.Group): THREE.Group => {
            g.traverse(o => {
                const m = o as THREE.Mesh;
                if (m.isMesh) m.material = ghostMat;
            });
            return g;
        };

        // Match registry default dimensions per type so the ghost reads
        // 1:1 with the placed element.
        const PARAMETRIC_BEDS: Record<string, {
            variant: BedVariant; w: number; l: number; h: number;
        }> = {
            japanese_platform_bed: { variant: 'platform',   w: 1.90, l: 2.35, h: 0.40 },
            japanese_float_bed:    { variant: 'float',      w: 2.00, l: 2.30, h: 0.40 },
            japanese_walnut_bed:   { variant: 'walnut',     w: 2.10, l: 2.60, h: 0.40 },
            nordic_bed:            { variant: 'nordic',     w: 1.80, l: 2.20, h: 0.50 },
            solid_wood_bed:        { variant: 'solid_wood', w: 1.75, l: 2.20, h: 0.55 },
        };

        try {
            const ms = new MaterialService();
            if (this.furnitureType === 'bed') {
                const data: FurnitureData = {
                    id: 'preview',
                    furnitureType: 'bed',
                    width: 1.8, length: 2.0, height: 1.0,
                    hasHeadboard: true,
                    material: 'wood',
                } as FurnitureData;
                return apply(new BedBuilder(ms).build(data));
            }
            const cfg = PARAMETRIC_BEDS[this.furnitureType];
            if (cfg) {
                const data: FurnitureData = {
                    id: 'preview',
                    furnitureType: this.furnitureType as FurnitureType,
                    width: cfg.w, length: cfg.l, height: cfg.h,
                    material: 'wood',
                } as FurnitureData;
                return apply(new JapaneseBedBuilder(cfg.variant, ms).build(data));
            }
        } catch (err) {
            console.warn('[FurnitureTool] Bed preview build failed, falling back:', err);
        }
        return null;
    }

    private buildSofaPreview(): THREE.Group | null {
        // Contract §41 §3.1 — Object Placement Preview Standard.
        const ghostMat = new THREE.MeshBasicMaterial({
            color: PREVIEW_COLOR.OBJECT,
            transparent: true,
            opacity: OBJECT_PREVIEW_OPACITY,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        const apply = (g: THREE.Group): THREE.Group => {
            g.traverse(o => {
                const m = o as THREE.Mesh;
                if (m.isMesh) m.material = ghostMat;
            });
            return g;
        };

        try {
            const ms = new MaterialService();
            if (this.furnitureType === 'corner_sofa' || this.furnitureType === 'white_corner_sofa') {
                const data: FurnitureData = {
                    id: 'preview', furnitureType: this.furnitureType as FurnitureType,
                    width: 3.0, length: 2.0, height: 0.9,
                    seatDepthMain: 0.9, seatDepthSide: 0.85,
                } as FurnitureData;
                return apply(new CornerSofaBuilder(ms).build(data));
            }
            const SOFA_W: Record<string, number> = {
                white_sofa_1seat: 1.05, white_sofa_2seat: 1.85, white_sofa_3seat: 2.55,
                sofa_1seat: 1.05, sofa_2seat: 1.85, sofa_3seat: 2.55, sofa: 1.85,
            };
            if (this.furnitureType in SOFA_W) {
                const data: FurnitureData = {
                    id: 'preview', furnitureType: this.furnitureType as FurnitureType,
                    width: SOFA_W[this.furnitureType], length: 0.95, height: 0.85,
                } as FurnitureData;
                return apply(new WhiteSofaBuilder(ms).build(data));
            }
        } catch (err) {
            console.warn('[FurnitureTool] Sofa preview build failed, falling back:', err);
        }
        return null;
    }

    /**
     * Universal fallback ghost — sized purple box derived from the carousel
     * descriptor's `defaultDimensions`. Contract §41 §3.1 requires that every
     * carousel item have a visible preview before the user clicks to create.
     * Categories that currently lack a per-type real-geometry preview branch
     * (Outdoor, Decor, Soft Furnishings carpets, Bathroom trim, kitchen
     * placeholders, etc.) all flow through this helper so the user always
     * sees a sized purple silhouette anchored to the cursor.
     */
    private buildDescriptorPreview(): THREE.Group {
        const group = new THREE.Group();
        const desc  = this._getDescriptor(this.furnitureType as string);
        const dims  = desc?.defaultDimensions
            ?? { width: 1.0, length: 1.0, height: 1.0, baseOffset: 0.0 };

        const mat = createObjectPreviewMaterial();
        const geo = new THREE.BoxGeometry(dims.width, dims.height, dims.length);
        const body = new THREE.Mesh(geo, mat);
        body.position.y = dims.baseOffset + dims.height / 2;
        group.add(body);

        // Bold purple wireframe so the silhouette reads against any
        // background — mirrors FurnitureDragDropHandler._showPreview().
        const edgesGeo = new THREE.EdgesGeometry(geo);
        const edgesMat = new THREE.LineBasicMaterial({
            color:       PREVIEW_COLOR.OBJECT,
            transparent: true,
            opacity:     0.9,
        });
        const edges = new THREE.LineSegments(edgesGeo, edgesMat);
        edges.position.copy(body.position);
        group.add(edges);

        return tagPreview(group);
    }

    private createPreview() {
        // Real-geometry ghosted preview for sofas (Contract §41 §2.2.c).
        const sofaPreview = this.buildSofaPreview();
        if (sofaPreview) {
            this.previewMesh = tagPreview(sofaPreview);
            this.world.scene.three.add(this.previewMesh);
            return;
        }

        // Real-geometry ghosted preview for beds (parametric + legacy).
        const bedPreview = this.buildBedPreview();
        if (bedPreview) {
            this.previewMesh = tagPreview(bedPreview);
            this.world.scene.three.add(this.previewMesh);
            return;
        }

        // Contract §41 §3.1 — Object Placement Preview Standard.
        // PRYZM purple #8B5CF6 @ 0.55 opacity, shared by every carousel ghost.
        const group = new THREE.Group();
        const mat = createObjectPreviewMaterial();

        // NOTE: the legacy `bed` branch was removed — buildBedPreview() above
        // now handles every bed type (legacy + 5 parametric variants) using
        // the real builders, so the placement ghost matches the placed mesh.
        if (this.furnitureType === 'wardrobe' || this.furnitureType === 'wardrobe_glass_door' || this.furnitureType === 'corner_wardrobe') {
            const bodyGeo = new THREE.BoxGeometry(1, 2.4, 0.6);
            const body = new THREE.Mesh(bodyGeo, mat);
            body.position.y = 1.2;
            group.add(body);
        } else if (this.furnitureType === 'toilet_radiator') {
            const bodyGeo = new THREE.BoxGeometry(0.5, 1.2, 0.05);
            const body = new THREE.Mesh(bodyGeo, mat);
            body.position.y = 0.6;
            group.add(body);
        } else if (this.furnitureType === 'chimney') {
            const bodyGeo = new THREE.BoxGeometry(0.8, 0.6, 0.4);
            const body = new THREE.Mesh(bodyGeo, mat);
            body.position.y = 0.3;
            group.add(body);
            const pipeGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.0);
            const pipe = new THREE.Mesh(pipeGeo, mat);
            pipe.position.y = 1.1;
            group.add(pipe);
        } else if (this.furnitureType === 'coffee_table') {
            const topGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 32);
            const top = new THREE.Mesh(topGeo, mat);
            top.scale.set(1.0, 1, 0.6);
            top.position.y = 0.45;
            group.add(top);
        } else if (this.furnitureType.startsWith('table_')) {
            const topGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.06, 32);
            const top = new THREE.Mesh(topGeo, mat);
            top.position.y = 0.75;
            group.add(top);
            const baseGeo = new THREE.CylinderGeometry(0.22, 0.34, 0.68, 24);
            const base = new THREE.Mesh(baseGeo, mat);
            base.position.y = 0.34;
            group.add(base);
        } else if (this.furnitureType.startsWith('chair_') || this.furnitureType === 'chair') {
            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.52), mat);
            seat.position.y = 0.45;
            group.add(seat);
            const back = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.34, 0.05), mat);
            back.position.set(0, 0.72, -0.24);
            group.add(back);
        } else if (this.furnitureType === 'shower_glass_panel') {
            const panelGeo = new THREE.BoxGeometry(0.9, 2.0, 0.01);
            const panel = new THREE.Mesh(panelGeo, mat);
            panel.position.y = 1.0;
            group.add(panel);
        } else if (this.furnitureType === 'entrance_table') {
            const bodyGeo = new THREE.BoxGeometry(1.2, 0.75, 0.4);
            const body = new THREE.Mesh(bodyGeo, mat);
            body.position.y = 0.375;
            group.add(body);
        } else if (this.furnitureType === 'bedside_table') {
            const bodyGeo = new THREE.BoxGeometry(0.5, 0.5, 0.4);
            const body = new THREE.Mesh(bodyGeo, mat);
            body.position.y = 0.25;
            group.add(body);
        } else if (
            this.furnitureType === 'dining_table' ||
            this.furnitureType === 'dining_table_marble_brass'
        ) {
            const topGeo = new THREE.BoxGeometry(1.0, 0.05, 2.0);
            const top = new THREE.Mesh(topGeo, mat);
            top.position.y = 0.75;
            group.add(top);

            // Preview chairs — same purple ghost so the dining set reads
            // as one cohesive placement preview (Contract §41 §3.1).
            const chairMat = createObjectPreviewMaterial({ opacity: 0.35 });
            const chairGeo = new THREE.BoxGeometry(0.45, 0.45, 0.45);
            for (let side = -1; side <= 1; side += 2) {
                for (let i = 1; i <= 3; i++) {
                    const chair = new THREE.Mesh(chairGeo, chairMat);
                    chair.position.set(side * 0.9, 0.225, -1.0 + (i * 2.0 / 4));
                    group.add(chair);
                }
            }
        } else if (this.furnitureType === 'plant_01') {
            const potGeo = new THREE.CylinderGeometry(0.2, 0.15, 0.25, 12);
            const pot = new THREE.Mesh(potGeo, mat);
            pot.position.y = 0.125;
            group.add(pot);
            const plantGeo = new THREE.SphereGeometry(0.3, 8, 8);
            const plant = new THREE.Mesh(plantGeo, mat);
            plant.position.y = 0.5;
            group.add(plant);
        } else {
            // Universal fallback — every carousel item has a sized purple
            // silhouette derived from its `defaultDimensions`. This guarantees
            // Contract §41 §3.1 compliance for Outdoor, Decor, parametric
            // carpets (Soft Furnishings), trim Bathroom items, kitchen
            // placeholders, plants 02-08, and any future type added to the
            // registry without a per-type preview branch.
            this.previewMesh = this.buildDescriptorPreview();
            this.world.scene.three.add(this.previewMesh);
            return;
        }

        this.previewMesh = tagPreview(group);
        this.world.scene.three.add(this.previewMesh);
    }

    private removePreview() {
        if (this.previewMesh) {
            this.world.scene.three.remove(this.previewMesh);
            this.previewMesh = null;
        }
    }

    private attachListeners() {
        const canvas = this.world.renderer!.three.domElement;
        this.pointerMoveHandler = (e) => this.onPointerMove(e);
        this.pointerDownHandler = (e) => this.onPointerDown(e);
        canvas.addEventListener('pointermove', this.pointerMoveHandler, true);
        canvas.addEventListener('pointerdown', this.pointerDownHandler, true);
        this.createUI();
    }

    private detachListeners() {
        const canvas = this.world.renderer!.three.domElement;
        if (this.pointerMoveHandler) canvas.removeEventListener('pointermove', this.pointerMoveHandler, true);
        if (this.pointerDownHandler) canvas.removeEventListener('pointerdown', this.pointerDownHandler, true);
        this.pointerMoveHandler = null;
        this.pointerDownHandler = null;
        this.removeUI();
    }

    /**
     * Contract §42 §2.2.c — Point-and-place HUD pill.
     * Uses the canonical `.th-overlay / .th-text / .th-btn` classes from
     * `src/styles/panels/toolHud.ts` injected via `injectAppTheme()`.
     * No inline `<style>`, no hardcoded colours — same anatomy and palette
     * as the Wall, Column and Plumbing tools.
     */
    private createUI() {
        const stale = document.getElementById('furniture-tool-ui');
        if (stale) stale.remove();

        const name = this.furnitureType
            .split('_')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');

        const isCornerWardrobe = this.furnitureType === 'corner_wardrobe';
        const isLineWardrobe = this.furnitureType === 'wardrobe' || this.furnitureType === 'wardrobe_glass_door';
        const instruction = isCornerWardrobe
            ? 'Click to set start point'
            : isLineWardrobe
                ? 'Click to set start point'
                : 'Click to place · Esc to cancel';

        const ui = document.createElement('div');
        ui.id = 'furniture-tool-ui';
        ui.className = 'th-overlay';

        const text = document.createElement('div');
        text.id = 'furniture-tool-text';
        text.className = 'th-text';
        text.innerHTML = `<strong>${name}</strong> — ${instruction}`;
        ui.appendChild(text);

        const buttons = document.createElement('div');
        buttons.className = 'th-btn-row';

        const finishBtn = document.createElement('button');
        finishBtn.type = 'button';
        finishBtn.className = 'th-btn th-btn--primary';
        finishBtn.textContent = 'Finish';
        finishBtn.onclick = () => this.deactivate();
        buttons.appendChild(finishBtn);

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'th-btn th-btn--neutral';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = () => {
            this.startPoint = null;
            this.cornerPoint = null;
            this.isDrawing = false;
            this.drawingStep = 0;
            this.deactivate();
        };
        buttons.appendChild(cancelBtn);

        ui.appendChild(buttons);
        document.body.appendChild(ui);
    }

    /**
     * Contract §42 §2.2.a / §2.2.c — keep the pill in sync with the gesture
     * step. Called whenever the wardrobe / corner-wardrobe state machine
     * advances so the user sees "set corner point" / "set end point" / etc.
     */
    private updateHUDInstruction(instruction: string) {
        const text = document.getElementById('furniture-tool-text');
        if (!text) return;
        const name = this.furnitureType
            .split('_')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
        text.innerHTML = `<strong>${name}</strong> — ${instruction}`;
    }

    private removeUI() {
        const ui = document.getElementById('furniture-tool-ui');
        if (ui) ui.remove();
    }

    private onPointerMove(e: PointerEvent) {
        const point = this.getWorldPoint(e);
        if (point && this.previewMesh) {
            if (this.furnitureType === 'corner_wardrobe') {
                if (this.drawingStep === 0) {
                    this.previewMesh.position.copy(point);
                    this.previewMesh.scale.set(1, 1, 1);
                    this.previewMesh.rotation.set(0, 0, 0);
                } else if (this.drawingStep === 1 && this.startPoint) {
                    const distance = this.startPoint.distanceTo(point);
                    const angle = Math.atan2(point.x - this.startPoint.x, point.z - this.startPoint.z);
                    this.previewMesh.scale.x = distance || 0.001;
                    this.previewMesh.position.set(
                        (this.startPoint.x + point.x) / 2,
                        this.startPoint.y,
                        (this.startPoint.z + point.z) / 2
                    );
                    this.previewMesh.rotation.y = angle + Math.PI / 2;
                } else if (this.drawingStep === 2 && this.startPoint && this.cornerPoint) {
                    // Show L-shape preview (Contract §41 §3.1 — PRYZM purple).
                    this.previewMesh.clear();
                    const mat = createObjectPreviewMaterial();
                    
                    // Branch 1 (Start to Corner)
                    const dist1 = this.startPoint.distanceTo(this.cornerPoint);
                    const angle1 = Math.atan2(this.cornerPoint.x - this.startPoint.x, this.cornerPoint.z - this.startPoint.z);
                    const branch1 = new THREE.Mesh(new THREE.BoxGeometry(dist1, 2.4, 0.6), mat);
                    branch1.position.set(
                        (this.startPoint.x + this.cornerPoint.x) / 2 - point.x,
                        this.startPoint.y + 1.2 - point.y,
                        (this.startPoint.z + this.cornerPoint.z) / 2 - point.z
                    );
                    branch1.rotation.y = angle1 + Math.PI / 2;
                    this.previewMesh.add(branch1);

                    // Branch 2 (Corner to current Point)
                    const dist2 = this.cornerPoint.distanceTo(point);
                    const angle2 = Math.atan2(point.x - this.cornerPoint.x, point.z - this.cornerPoint.z);
                    const branch2 = new THREE.Mesh(new THREE.BoxGeometry(dist2, 2.4, 0.6), mat);
                    branch2.position.set(
                        (this.cornerPoint.x + point.x) / 2 - point.x,
                        this.cornerPoint.y + 1.2 - point.y,
                        (this.cornerPoint.z + point.z) / 2 - point.z
                    );
                    branch2.rotation.y = angle2 + Math.PI / 2;
                    this.previewMesh.add(branch2);
                    
                    this.previewMesh.position.copy(point);
                    this.previewMesh.scale.set(1, 1, 1);
                    this.previewMesh.rotation.set(0, 0, 0);
                }
            } else if ((this.furnitureType === 'wardrobe' || this.furnitureType === 'wardrobe_glass_door') && this.isDrawing && this.startPoint) {
                const distance = this.startPoint.distanceTo(point);
                const angle = Math.atan2(point.x - this.startPoint.x, point.z - this.startPoint.z);

                this.previewMesh.scale.x = distance || 0.001;
                this.previewMesh.position.set(
                    (this.startPoint.x + point.x) / 2,
                    this.startPoint.y,
                    (this.startPoint.z + point.z) / 2
                );
                this.previewMesh.rotation.y = angle + Math.PI / 2;
            } else {
                this.previewMesh.position.copy(point);
                this.previewMesh.scale.set(1, 1, 1);
                this.previewMesh.rotation.set(0, 0, 0);
            }

            // Phase 5 guard: skip needsUpdate when WebGPU canvas is active.
            // Triggering OBC's WebGL render in Phase 5 destroys PRYZM's ShadowDepthTexture.
            const renderer = this.world.renderer as any;
            if (renderer && renderer.mode === OBC.RendererMode.MANUAL && 'needsUpdate' in renderer && !window.pryzmCanvas) {
                renderer.needsUpdate = true;
            }
        }
    }

    private onPointerDown(e: PointerEvent) {
        if (e.button !== 0) return;
        const point = this.getWorldPoint(e);
        if (point) {
            const commandManager = window.commandManager; // TODO(TASK-06)
            const projectContext = window.projectContext;
            const levelId = projectContext.activeLevelId;

            if (!levelId) {
                console.error("No active level selected");
                return;
            }

            if (this.furnitureType === 'corner_wardrobe') {
                if (this.drawingStep === 0) {
                    this.startPoint = point.clone();
                    this.drawingStep = 1;
                    this.isDrawing = true;
                    this.updateHUDInstruction('Click to set corner point');
                } else if (this.drawingStep === 1) {
                    this.cornerPoint = point.clone();
                    this.drawingStep = 2;
                    this.updateHUDInstruction('Click to set end point');
                } else if (this.drawingStep === 2 && this.startPoint && this.cornerPoint) {
                    const endPoint = point.clone();
                    const width1 = this.startPoint.distanceTo(this.cornerPoint);
                    const width2 = this.cornerPoint.distanceTo(endPoint);
                    
                    const config: WardrobeConfig = {
                        width: width1,
                        height: 2.4,
                        depth: 0.6,
                        isCorner: true,
                        cornerPoint: this.cornerPoint,
                        sideWidth: width2,
                        widthBranchTwo: 0.6,
                        lengthBranchTwo: width2,
                        sections: [{ width: width1, doorType: 'double-hinged', components: [] }],
                        sideSections: [{ width: width2, doorType: 'double-hinged', components: [] }]
                    };

                    // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
                    if (window.runtime?.bus) { window.runtime.bus.executeCommand('furniture.create', {}).catch(() => {}); }
                    commandManager.execute(new CreateFurnitureCommand({
                        furnitureType: 'corner_wardrobe',
                        position: { x: this.startPoint.x, y: this.startPoint.y, z: this.startPoint.z },
                        rotation: { x: 0, y: 0, z: 0 },
                        levelId,
                        baseOffset: 0,
                        width: width1,
                        length: 0.6,
                        height: 2.4,
                        widthBranchTwo: 0.6,
                        lengthBranchTwo: width2,
                        material: 'wood',
                        wardrobeConfig: config,
                        startPoint: { x: this.startPoint.x, y: this.startPoint.y, z: this.startPoint.z },
                        cornerPoint: { x: this.cornerPoint.x, y: this.cornerPoint.y, z: this.cornerPoint.z },
                        endPoint: { x: endPoint.x, y: endPoint.y, z: endPoint.z }
                    }));

                    // Reset preview for next placement
                    this.removePreview();
                    this.createPreview();

                    this.startPoint = null;
                    this.cornerPoint = null;
                    this.isDrawing = false;
                    this.drawingStep = 0;
                }
                return;
            }

            if (this.furnitureType === 'wardrobe' || this.furnitureType === 'wardrobe_glass_door') {
                if (!this.isDrawing) {
                    this.startPoint = point.clone();
                    this.isDrawing = true;
                    this.updateHUDInstruction('Click to set end point');
                    return;
                } else if (this.startPoint) {
                    const endPoint = point.clone();
                    const distance = this.startPoint.distanceTo(endPoint);
                    const angle = Math.atan2(endPoint.x - this.startPoint.x, endPoint.z - this.startPoint.z);
                    const center = new THREE.Vector3().addVectors(this.startPoint, endPoint).multiplyScalar(0.5);

                    const width = distance;
                    const height = 2.4;
                    const depth = 0.6;

                    const defaultWardrobeConfig: WardrobeConfig = {
                        width,
                        height,
                        depth,
                        sections: [
                            {
                                width,
                                doorType: width > 1.2 ? 'double-hinged' : 'hinged-left',
                                components: [
                                    { type: 'shelf', positionY: height * 0.2 },
                                    { type: 'shelf', positionY: height * 0.4 },
                                    { type: 'shelf', positionY: height * 0.6 },
                                    { type: 'shelf', positionY: height * 0.8 }
                                ]
                            }
                        ]
                    };

                    const cmd = new CreateFurnitureCommand({
                        furnitureType: this.furnitureType,
                        position: { x: center.x, y: center.y, z: center.z },
                        rotation: { x: 0, y: angle + Math.PI / 2, z: 0 },
                        levelId: levelId,
                        baseOffset: 0,
                        width: distance,
                        length: 0.6, // default depth
                        height: 2.4, // default height
                        material: 'wood',
                        lo3: 200,
                        startPoint: { x: this.startPoint.x, y: this.startPoint.y, z: this.startPoint.z },
                        endPoint: { x: endPoint.x, y: endPoint.y, z: endPoint.z },
                        wardrobeConfig: defaultWardrobeConfig
                    });
                    // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
                    if (window.runtime?.bus) { window.runtime.bus.executeCommand('furniture.create', {}).catch(() => {}); }
                    commandManager.execute(cmd);

                    // Auto-selection for newly created wardrobe
                    if (window.selectionManager && window.bimManager) {
                        const scene = this.world.scene.three;
                        scene.traverse(obj => {
                            if (obj.userData?.id === (cmd as any).payload.id) {
                                window.selectionManager.select(obj);
                            }
                        });
                    }

                    this.startPoint = null;
                    this.isDrawing = false;
                }
            } else {
                const isBed = this.furnitureType === 'bed';
                const isTable = this.furnitureType === 'dining_table';
                const isParametricTable = this.furnitureType.startsWith('table_');
                const isChair = this.furnitureType === 'chair' || this.furnitureType.startsWith('chair_');
                const isEntranceTable = this.furnitureType === 'entrance_table';
                const isCoffeeTable = this.furnitureType === 'coffee_table';
                const isRadiator = this.furnitureType === 'toilet_radiator';
                const isChimney = this.furnitureType === 'chimney';
                const isPlant = this.furnitureType.startsWith('plant_');
                const isShowerPanel = this.furnitureType === 'shower_glass_panel';
                const isCornerSofa = this.furnitureType === 'corner_sofa' || this.furnitureType === 'white_corner_sofa';

                // Straight-sofa family (white_sofa_* and generic sofa_*) — same
                // construction logic as the corner sofa.  Per-seat-count widths
                // mirror FurnitureCategoryRegistry / WhiteSofaBuilder defaults
                // so the property panel doesn't surface a tiny 0.5×0.4×0.5
                // placeholder when these are placed via the tool path.
                const SOFA_WIDTHS: Record<string, number> = {
                    white_sofa_1seat: 1.05, white_sofa_2seat: 1.85, white_sofa_3seat: 2.55,
                    sofa_1seat:       1.05, sofa_2seat:       1.85, sofa_3seat:       2.55,
                    sofa:             1.85,
                };
                const isStraightSofa = this.furnitureType in SOFA_WIDTHS;
                const baseOffset = isBed ? 0.2 : 0.0; 

                const width = isBed ? 1.8 : (isTable ? 1.0 : (isParametricTable ? (this.furnitureType === 'table_wood_4leg' ? 1.6 : 1.2) : (isChair ? 0.58 : (isEntranceTable ? 1.2 : (isCoffeeTable ? 1.0 : (isRadiator ? 0.5 : (isChimney ? 0.8 : (isPlant ? 0.6 : (isShowerPanel ? 0.9 : (isCornerSofa ? 3.0 : (isStraightSofa ? SOFA_WIDTHS[this.furnitureType] : 0.5)))))))))));
                const length = isBed ? 2.0 : (isTable ? 2.0 : (isParametricTable ? (this.furnitureType === 'table_wood_4leg' ? 0.9 : 1.1) : (isChair ? 0.58 : (isEntranceTable ? 0.4 : (isCoffeeTable ? 0.6 : (isRadiator ? 0.05 : (isChimney ? 0.4 : (isPlant ? 0.6 : (isShowerPanel ? 0.01 : (isCornerSofa ? 2.0 : (isStraightSofa ? 0.95 : 0.4)))))))))));
                const height = isBed ? 1.0 : (isTable ? 0.75 : (isParametricTable ? 0.75 : (isChair ? 0.86 : (isEntranceTable ? 0.75 : (isCoffeeTable ? 0.45 : (isRadiator ? 1.2 : (isChimney ? 0.6 : (isPlant ? 0.8 : (isShowerPanel ? 2.0 : (isCornerSofa ? 0.9 : (isStraightSofa ? 0.85 : 0.5)))))))))));

                // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
                if (window.runtime?.bus) { window.runtime.bus.executeCommand('furniture.create', {}).catch(() => {}); }
                commandManager.execute(new CreateFurnitureCommand({
                    furnitureType: this.furnitureType,
                    position: { x: point.x, y: point.y, z: point.z },
                    rotation: { x: 0, y: 0, z: 0 },
                    levelId: levelId,
                    baseOffset: baseOffset,
                    width: width,
                    length: length,
                    height: height,
                    metadata: isShowerPanel ? { thickness: 0.01 } : undefined,
                    widthMain: isCornerSofa ? width : (undefined as any),
                    lengthSide: isCornerSofa ? length : (undefined as any),
                    seatDepthMain: isCornerSofa ? 0.9 : (undefined as any),
                    seatDepthSide: isCornerSofa ? 0.85 : (undefined as any),
                    material: (isShowerPanel || isEntranceTable || this.furnitureType === 'table_glass_wood_cylinder') ? 'glass' : (this.furnitureType === 'chair_textile_wood_arm' ? 'fabric' : 'wood'),
                    hasHeadboard: isBed
                }));
            }

            // Phase 5 guard: skip needsUpdate when WebGPU canvas is active.
            const renderer = this.world.renderer as any;
            if (renderer && renderer.mode === OBC.RendererMode.MANUAL && 'needsUpdate' in renderer && !window.pryzmCanvas) {
                renderer.needsUpdate = true;
            }
        }
    }

    private getWorldPoint(e: PointerEvent): THREE.Vector3 | null {
        const canvas = this.world.renderer!.three.domElement;
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.world.camera.three);

        const slabs = this.world.scene.three.children.filter(c => c.userData.elementType === 'Slab');
        const intersects = raycaster.intersectObjects(slabs);
        if (intersects.length > 0) return intersects[0].point;

        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const result = new THREE.Vector3();
        return raycaster.ray.intersectPlane(plane, result) ? result : null;
    }
}