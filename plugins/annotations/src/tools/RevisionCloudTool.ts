/**
 * DOC-2.8 — Revision Cloud Tool
 *
 * Click to add vertices; double-click (or click near start) to close the cloud.
 * The closed polygon is stored as a `revision-cloud` AnnotationElement with
 * geometry2D.modelPoints containing the full vertex list in world space.
 *
 * Rendering (arc segments) is handled by AnnotationRenderLayer._renderRevisionCloud().
 *
 * Parameters stored:
 *   { vertices: Point3D[], revisionCode?: string, note?: string }
 *
 * Contract compliance:
 *   §05 §7.8 — No bim-* / @thatopen/ui elements
 *   §01 §2   — CreateAnnotationCommand dispatched through CommandManager
 *   §01 §3.3 — AnnotationElement contains only plain serialisable primitives
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { makeAnnotationElement } from '../subsystem/AnnotationTypes';
import { makePointRef, ResolverStores } from '../subsystem/AnnotationReference';
import { BIM_LAYER } from '@pryzm/scene-committer';


export class RevisionCloudTool {
    public isActive = false;

    private _activeViewId: string | null = null;
    private _resolverStores: ResolverStores;
    private _vertices: THREE.Vector3[] = [];
    private _escListener: ((e: KeyboardEvent) => void) | null = null;
    private _raycaster = (() => {
        const raycaster = new THREE.Raycaster();
        raycaster.layers.set(BIM_LAYER);
        return raycaster;
    })();
    private _mouse = new THREE.Vector2();

    /** Pixel radius within which a click near the start vertex closes the cloud */
    private static readonly CLOSE_THRESHOLD_PX = 12;

    constructor(
        private _components: OBC.Components,
        resolverStores: ResolverStores
    ) {
        this._resolverStores = resolverStores;
    }

    setActiveViewId(viewId: string | null): void {
        this._activeViewId = viewId;
    }

    setResolverStores(stores: ResolverStores): void {
        this._resolverStores = stores;
    }

    getResolverStores(): ResolverStores {
        return this._resolverStores;
    }

    activate(): void {
        if (this.isActive) return;
        this.isActive = true;
        this._vertices = [];

        const el = this._domElement;
        if (el) {
            el.addEventListener('mousedown', this._onMouseDown);
            el.addEventListener('dblclick', this._onDblClick);
            el.style.cursor = 'crosshair';
        }

        this._escListener = (e: KeyboardEvent) => {
            if (e.key === 'Escape') this.deactivate();
        };
        document.addEventListener('keydown', this._escListener);

        console.log('[RevisionCloudTool] activated — click to add vertices, double-click to close');
    }

    deactivate(): void {
        if (!this.isActive) return;
        this.isActive = false;
        this._vertices = [];

        const el = this._domElement;
        if (el) {
            el.removeEventListener('mousedown', this._onMouseDown);
            el.removeEventListener('dblclick', this._onDblClick);
            el.style.cursor = 'default';
        }

        if (this._escListener) {
            document.removeEventListener('keydown', this._escListener);
            this._escListener = null;
        }
    }

    dispose(): void {
        this.deactivate();
    }

    // ── Private ────────────────────────────────────────────────────────────────

    private get _world(): any {
        const worlds = this._components.get(OBC.Worlds);
        return worlds.list.get('main') || Array.from(worlds.list.values())[0];
    }

    private get _domElement(): HTMLCanvasElement | null {
        return this._world?.renderer?.three.domElement ?? null;
    }

    private _onMouseDown = (e: MouseEvent): void => {
        if (!this.isActive || e.button !== 0) return;
        // Ignore if it's the second click of a dblclick (browser fires mousedown before dblclick)
        this._updateMouse(e);
        const pt = this._raycastToPlane();
        if (!pt) return;

        // If there are already vertices and click is near start → close cloud
        if (this._vertices.length >= 3) {
            const el = this._domElement;
            if (el && this._isNearStart(e, el)) {
                this._commitCloud();
                return;
            }
        }

        this._vertices.push(pt.clone());
        console.log(`[RevisionCloudTool] Vertex added (${this._vertices.length}):`, pt);
    };

    private _onDblClick = (_e: MouseEvent): void => {
        if (!this.isActive) return;
        if (this._vertices.length < 3) {
            console.warn('[RevisionCloudTool] Need at least 3 vertices to close revision cloud');
            return;
        }
        this._commitCloud();
    };

    private _commitCloud(): void {
        if (!this._activeViewId) {
            console.warn('[RevisionCloudTool] No active view — revision cloud not created');
            this.deactivate();
            return;
        }

        const vertices = this._vertices.slice();
        const modelPoints = vertices.map(v => ({ x: v.x, y: v.y, z: v.z }));
        const references  = vertices.map(v => ({ ...makePointRef(v), cachedPosition: { x: v.x, y: v.y, z: v.z } }));

        const id  = crypto.randomUUID();
        const ann = makeAnnotationElement(
            id,
            'revision-cloud',
            this._activeViewId,
            references,
            { modelPoints, offset: 0 },
            { vertices: modelPoints, revisionCode: '', note: '' }
        );

        // P13 (A36): typed payload so AnnotationsState receives the correct id/viewId/kind.
        if (window.runtime?.bus) { window.runtime.bus.executeCommand('annotation.create', { id: ann.id, viewId: ann.ownerViewId, kind: ann.type as any }).catch(() => {}); }

        console.log('[RevisionCloudTool] Revision cloud committed with', vertices.length, 'vertices in view', this._activeViewId);

        this.deactivate();
    }

    private _isNearStart(e: MouseEvent, el: HTMLCanvasElement): boolean {
        if (this._vertices.length === 0) return false;
        const camera = this._world?.camera?.three;
        if (!camera) return false;

        const rect  = el.getBoundingClientRect();
        const start = this._vertices[0]!.clone().project(camera);
        const sx    = (start.x * 0.5 + 0.5) * rect.width;
        const sy    = (-start.y * 0.5 + 0.5) * rect.height;

        const dx = e.clientX - rect.left - sx;
        const dy = e.clientY - rect.top  - sy;
        return Math.sqrt(dx * dx + dy * dy) < RevisionCloudTool.CLOSE_THRESHOLD_PX;
    }

    private _raycastToPlane(): THREE.Vector3 | null {
        const world = this._world;
        if (!world?.camera || !world?.scene) return null;

        this._raycaster.setFromCamera(this._mouse, world.camera.three);

        const plane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const target = new THREE.Vector3();
        if (this._raycaster.ray.intersectPlane(plane, target)) return target;

        const hits = this._raycaster.intersectObjects(
            world.scene.three.children.filter((c: THREE.Object3D) => c.visible),
            true
        );
        return hits[0]?.point ?? null;
    }

    private _updateMouse(e: MouseEvent): void {
        const el = this._domElement;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        this._mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        this._mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    }
}
