/**
 * DOC-2.8 — CalloutDetailTool
 *
 * Click-drag interaction in a plan view:
 *   Press + drag → define the callout rectangle (cropRegion for the detail view)
 *   Release → fires CreateCalloutDetailCommand
 *
 * The command atomically creates both a detail ViewDefinition (with cropRegion)
 * and a callout-detail AnnotationElement in the host plan view.
 *
 * Visual feedback:
 *   - Dashed rectangle preview during drag
 *   - Cursor: crosshair when active
 *
 * Contract compliance:
 *   §05 §7.8 — No bim-* / @thatopen/ui elements
 *   §01 §2   — CreateCalloutDetailCommand dispatched through CommandManager
 *   §01 §3.3 — AnnotationElement contains only plain serialisable primitives
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { CreateCalloutDetailCommand } from '../commands/CreateCalloutDetailCommand';
import { BIM_LAYER } from '@pryzm/scene-committer';

type CommandManager = { execute(cmd: unknown): void };

enum CalloutState { IDLE, DRAGGING }

export class CalloutDetailTool {
    public isActive = false;
    private _state = CalloutState.IDLE;
    private _activeViewId: string | null = null;
    private _dragStart: THREE.Vector3 | null = null;

    private _raycaster = (() => {
        const r = new THREE.Raycaster();
        r.layers.set(BIM_LAYER);
        return r;
    })();
    private _mouse = new THREE.Vector2();

    private _previewBox: THREE.LineLoop | null = null;
    private _previewMat = new THREE.LineBasicMaterial({ color: 0xff8800, linewidth: 1 });

    private _escListener: ((e: KeyboardEvent) => void) | null = null;

    constructor(
        private _components: OBC.Components,
        private _commandManager: CommandManager,
    ) {}

    setActiveViewId(viewId: string | null): void { this._activeViewId = viewId; }

    activate(): void {
        if (this.isActive) return;
        this.isActive = true;
        this._state = CalloutState.IDLE;
        const el = this._domElement;
        if (el) {
            el.addEventListener('mousedown', this._onMouseDown);
            el.addEventListener('mousemove', this._onMouseMove);
            el.addEventListener('mouseup', this._onMouseUp);
            el.style.cursor = 'crosshair';
        }
        this._escListener = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this._dragStart = null;
                this._removePreview();
                this._state = CalloutState.IDLE;
                if (this._state === CalloutState.IDLE) this.deactivate();
            }
        };
        document.addEventListener('keydown', this._escListener);
        console.log('[CalloutDetailTool] activated — click and drag to define callout area');
    }

    deactivate(): void {
        if (!this.isActive) return;
        this.isActive = false;
        this._state = CalloutState.IDLE;
        this._dragStart = null;
        this._removePreview();
        const el = this._domElement;
        if (el) {
            el.removeEventListener('mousedown', this._onMouseDown);
            el.removeEventListener('mousemove', this._onMouseMove);
            el.removeEventListener('mouseup', this._onMouseUp);
            el.style.cursor = 'default';
        }
        if (this._escListener) {
            document.removeEventListener('keydown', this._escListener);
            this._escListener = null;
        }
    }

    dispose(): void { this.deactivate(); this._previewMat.dispose(); }

    private get _world(): any {
        const worlds = this._components.get(OBC.Worlds);
        return worlds.list.get('main') || Array.from(worlds.list.values())[0];
    }

    private get _domElement(): HTMLCanvasElement | null {
        return this._world?.renderer?.three.domElement ?? null;
    }

    private get _scene(): THREE.Scene | null {
        return this._world?.scene?.three ?? null;
    }

    private get _camera(): THREE.Camera | null {
        return this._world?.camera?.three ?? null;
    }

    private _worldPoint(e: MouseEvent): THREE.Vector3 | null {
        const el = this._domElement;
        const camera = this._camera;
        const scene = this._scene;
        if (!el || !camera || !scene) return null;
        const rect = el.getBoundingClientRect();
        this._mouse.set(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        this._raycaster.setFromCamera(this._mouse, camera);
        const hits = this._raycaster.intersectObjects(scene.children, true);
        if (hits.length > 0) return hits[0]!.point.clone();
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const pt = new THREE.Vector3();
        this._raycaster.ray.intersectPlane(plane, pt);
        return pt;
    }

    private _onMouseDown = (e: MouseEvent): void => {
        if (!this.isActive || e.button !== 0) return;
        const pt = this._worldPoint(e);
        if (!pt) return;
        this._dragStart = pt;
        this._state = CalloutState.DRAGGING;
        this._initPreview(pt);
    };

    private _onMouseMove = (e: MouseEvent): void => {
        if (!this.isActive || this._state !== CalloutState.DRAGGING || !this._dragStart) return;
        const pt = this._worldPoint(e);
        if (!pt || !this._previewBox) return;
        this._updatePreview(this._dragStart, pt);
    };

    private _onMouseUp = (e: MouseEvent): void => {
        if (!this.isActive || this._state !== CalloutState.DRAGGING || !this._dragStart) return;
        const pt = this._worldPoint(e);
        this._removePreview();
        this._state = CalloutState.IDLE;

        if (!pt) { this._dragStart = null; return; }

        const start = this._dragStart;
        this._dragStart = null;

        const minX = Math.min(start.x, pt.x);
        const maxX = Math.max(start.x, pt.x);
        const minZ = Math.min(start.z, pt.z);
        const maxZ = Math.max(start.z, pt.z);

        if (Math.abs(maxX - minX) < 0.1 || Math.abs(maxZ - minZ) < 0.1) {
            console.warn('[CalloutDetailTool] Callout region too small — cancelled');
            return;
        }

        const centroid = {
            x: (minX + maxX) / 2,
            y: start.y,
            z: (minZ + maxZ) / 2,
        };

        const y = start.y;
        const _annId = crypto.randomUUID();
        if (window.runtime?.bus) { window.runtime.bus.executeCommand('annotation.create', { id: _annId, viewId: this._activeViewId ?? '', kind: 'callout-detail' as any }).catch(() => {}); }
        this._commandManager.execute(new CreateCalloutDetailCommand({
            detailViewId:   crypto.randomUUID(),
            detailViewName: `Detail ${Date.now().toString(36).toUpperCase()}`,
            annotationId:   _annId,
            parentViewId:   this._activeViewId ?? '',
            hostViewId:     this._activeViewId ?? '',
            cropPoints: [
                { x: minX, y, z: minZ },
                { x: maxX, y, z: maxZ },
            ],
            leaderPoint: { x: centroid.x, y, z: centroid.z },
        }));

        console.log('[CalloutDetailTool] Callout detail created');
    };

    private _initPreview(start: THREE.Vector3): void {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(4 * 3);
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this._previewBox = new THREE.LineLoop(geo, this._previewMat);
        this._scene?.add(this._previewBox);
        this._updatePreview(start, start);
    }

    private _updatePreview(start: THREE.Vector3, end: THREE.Vector3): void {
        if (!this._previewBox) return;
        const positions = (this._previewBox.geometry as THREE.BufferGeometry)
            .attributes.position as THREE.BufferAttribute;
        const y = start.y + 0.01;
        positions.setXYZ(0, start.x, y, start.z);
        positions.setXYZ(1, end.x,   y, start.z);
        positions.setXYZ(2, end.x,   y, end.z);
        positions.setXYZ(3, start.x, y, end.z);
        positions.needsUpdate = true;
    }

    private _removePreview(): void {
        if (this._previewBox) {
            this._scene?.remove(this._previewBox);
            this._previewBox.geometry.dispose();
            this._previewBox = null;
        }
    }
}
