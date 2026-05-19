/**
 * DxfUnderlayTool.ts — Phase 1, §31
 *
 * Manages a DXF overlay group in the Three.js scene.
 * Pattern: FloorPlanUnderlayTool (§31 §5.2).
 *
 * CONTRACT (§31 §7.1 – §7.4):
 *   - The overlay is a raw THREE.js object — NOT a semantic BIM element.
 *   - Never registered in any ElementStore, BimManager, or ElementRegistry.
 *   - All objects in the group have userData.selectable = false (§31 §7.3).
 *   - Group renderOrder = -1, renders behind BIM elements (§31 §7.4).
 *   - No CommandManager calls — overlay placement is non-semantic.
 *   - dispose() traverses the full group and releases all GPU resources (§31 §7.8).
 */

import * as THREE from '@pryzm/renderer-three/three';
import { buildDxfGeometry, disposeDxfGroup, setLayerColor, setLayerVisible } from '@pryzm/file-format';
import type { DxfDocument } from '@pryzm/file-format';
import type { DxfGroupMetadata } from '@pryzm/file-format';

export interface DxfOverlayState {
    group: THREE.Group;
    meta: DxfGroupMetadata;
    /** DXF source text — stored for Phase 2 project persistence */
    sourceText: string;
    /** Original file name */
    fileName: string;
    overlayId: string;
    metersPerUnit: number;
    elevation: number;
    opacity: number;
    locked: boolean;
}

export class DxfUnderlayTool {
    private state: DxfOverlayState | null = null;
    private isDragging = false;
    private dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    private dragOffset = new THREE.Vector3();
    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();
    private _hitProxy: THREE.Mesh | null = null;

    private boundOnMouseDown: (e: MouseEvent) => void;
    private boundOnMouseMove: (e: MouseEvent) => void;
    private boundOnMouseUp: (e: MouseEvent) => void;

    constructor(
        private scene: THREE.Scene,
        private camera: THREE.Camera,
        private domElement: HTMLElement,
    ) {
        this.boundOnMouseDown = this.onMouseDown.bind(this);
        this.boundOnMouseMove = this.onMouseMove.bind(this);
        this.boundOnMouseUp = this.onMouseUp.bind(this);
    }

    // ── Public API ──────────────────────────────────────────────────────────────

    create(
        doc: DxfDocument,
        sourceText: string,
        fileName: string,
        overlayId: string,
        metersPerUnitOverride?: number,
        elevation: number = 0.01,
    ): DxfOverlayState {
        this.dispose();

        const metersPerUnit = metersPerUnitOverride ?? 0.001;
        const { group, meta } = buildDxfGeometry(doc, elevation, metersPerUnit);

        // Transparent hit-proxy mesh for drag detection — not rendered
        const { minX, minZ, maxX, maxZ } = meta.worldBounds;
        const w = Math.max(maxX - minX, 0.1);
        const h = Math.max(maxZ - minZ, 0.1);
        const proxyGeo = new THREE.PlaneGeometry(w, h);
        const proxyMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
        this._hitProxy = new THREE.Mesh(proxyGeo, proxyMat);
        this._hitProxy.rotation.x = -Math.PI / 2;
        this._hitProxy.position.set((minX + maxX) / 2, elevation, (minZ + maxZ) / 2);
        this._hitProxy.userData = { selectable: false, isDxfProxy: true };
        this.scene.add(this._hitProxy);

        this.scene.add(group);

        this.state = {
            group,
            meta,
            sourceText,
            fileName,
            overlayId,
            metersPerUnit,
            elevation,
            opacity: 0.85,
            locked: false,
        };

        this.attachListeners();
        console.log(`[DxfUnderlayTool] Created overlay "${overlayId}" with ${meta.layerObjects.size} layers`);
        return this.state;
    }

    getState(): DxfOverlayState | null { return this.state; }

    setOpacity(opacity: number): void {
        if (!this.state) return;
        const clamped = Math.min(1, Math.max(0, opacity));
        this.state.opacity = clamped;
        this.state.group.traverse(obj => {
            if ((obj as THREE.LineSegments).isLineSegments) {
                (obj as THREE.LineSegments).material as THREE.LineBasicMaterial;
                ((obj as THREE.LineSegments).material as THREE.LineBasicMaterial).opacity = clamped;
            }
        });
    }

    setLocked(locked: boolean): void {
        if (this.state) this.state.locked = locked;
    }

    setLayerVisible(layerName: string, visible: boolean): void {
        if (!this.state) return;
        setLayerVisible(this.state.group, layerName, visible);
    }

    setLayerColor(layerName: string, hexColor: string): void {
        if (!this.state) return;
        setLayerColor(this.state.group, layerName, hexColor);
    }

    setElevation(y: number): void {
        if (!this.state) return;
        this.state.elevation = y;
        this.state.group.position.y = y;
        if (this._hitProxy) this._hitProxy.position.y = y;
        this.dragPlane.constant = -y;
    }

    /**
     * Center the overlay in the viewport (place centroid at origin).
     */
    centerAtOrigin(): void {
        if (!this.state) return;
        const { minX, maxX, minZ, maxZ } = this.state.meta.worldBounds;
        const cx = (minX + maxX) / 2;
        const cz = (minZ + maxZ) / 2;
        this.state.group.position.set(-cx, this.state.elevation, -cz);
        if (this._hitProxy) {
            this._hitProxy.position.set(0, this.state.elevation, 0);
        }
    }

    dispose(): void {
        this.detachListeners();
        if (!this.state) return;
        disposeDxfGroup(this.state.group, this.scene);
        if (this._hitProxy) {
            this.scene.remove(this._hitProxy);
            this._hitProxy.geometry.dispose();
            (this._hitProxy.material as THREE.Material).dispose();
            this._hitProxy = null;
        }
        this.state = null;
        console.log('[DxfUnderlayTool] Overlay disposed');
    }

    // ── Mouse drag (horizontal XZ plane) ────────────────────────────────────────

    private attachListeners(): void {
        this.domElement.addEventListener('mousedown', this.boundOnMouseDown);
        this.domElement.addEventListener('mousemove', this.boundOnMouseMove);
        this.domElement.addEventListener('mouseup',   this.boundOnMouseUp);
    }

    private detachListeners(): void {
        this.domElement.removeEventListener('mousedown', this.boundOnMouseDown);
        this.domElement.removeEventListener('mousemove', this.boundOnMouseMove);
        this.domElement.removeEventListener('mouseup',   this.boundOnMouseUp);
    }

    private updateMouse(e: MouseEvent): void {
        const rect = this.domElement.getBoundingClientRect();
        this.mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    }

    private onMouseDown(e: MouseEvent): void {
        if (!this.state || this.state.locked || e.button !== 0) return;
        if (!this._hitProxy) return;
        this.updateMouse(e);
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const hits = this.raycaster.intersectObject(this._hitProxy);
        if (hits.length === 0) return;

        this.isDragging = true;
        const hitPoint = hits[0].point;
        const groupPos = this.state.group.position;
        this.dragOffset.set(
            hitPoint.x - groupPos.x,
            0,
            hitPoint.z - groupPos.z,
        );
        this.dragPlane.constant = -this.state.elevation;
        e.stopPropagation();
    }

    private onMouseMove(e: MouseEvent): void {
        if (!this.isDragging || !this.state) return;
        this.updateMouse(e);
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const target = new THREE.Vector3();
        if (!this.raycaster.ray.intersectPlane(this.dragPlane, target)) return;

        const newX = target.x - this.dragOffset.x;
        const newZ = target.z - this.dragOffset.z;
        this.state.group.position.set(newX, this.state.elevation, newZ);
        if (this._hitProxy) {
            this._hitProxy.position.set(newX, this.state.elevation, newZ);
        }
    }

    private onMouseUp(e: MouseEvent): void {
        if (this.isDragging) {
            this.isDragging = false;
            e.stopPropagation();
        }
    }
}
