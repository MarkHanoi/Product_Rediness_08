/**
 * DOC-2.5 — Window Tag Tool
 *
 * Single-click interaction: click on a window mesh in the scene.
 * Reads the window's width, height, and mark from WindowStore, then
 * dispatches CreateAnnotationCommand for a 'window-tag' annotation.
 *
 * Geometry stored in modelPoints:
 *   [0] = window centroid (3D world position)
 *
 * Parameters stored:
 *   { windowId, width, height, mark, cachedLabel }
 *
 * Contract compliance:
 *   §05 §7.8 — No bim-* / @thatopen/ui elements
 *   §01 §2   — CreateAnnotationCommand dispatched through CommandManager
 *   §01 §3.3 — AnnotationElement contains only plain serialisable primitives
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { makeAnnotationElement } from '../subsystem/AnnotationTypes';
import { makeRef, ResolverStores } from '../subsystem/AnnotationReference';
import { BIM_LAYER } from '@pryzm/scene-committer';


export class WindowTagTool {
    public isActive = false;
    private _activeViewId: string | null = null;
    private _escListener: ((e: KeyboardEvent) => void) | null = null;
    private _raycaster = (() => {
        const raycaster = new THREE.Raycaster();
        raycaster.layers.set(BIM_LAYER);
        return raycaster;
    })();
    private _mouse = new THREE.Vector2();

    constructor(
        private _components: OBC.Components,
        private _resolverStores: ResolverStores
    ) {}

    setActiveViewId(viewId: string | null): void {
        this._activeViewId = viewId;
    }

    setResolverStores(stores: ResolverStores): void {
        this._resolverStores = stores;
    }

    activate(): void {
        if (this.isActive) return;
        this.isActive = true;
        const el = this._domElement;
        if (el) {
            el.addEventListener('mousedown', this._onMouseDown);
            el.style.cursor = 'cell';
        }
        this._escListener = (e: KeyboardEvent) => { if (e.key === 'Escape') this.deactivate(); };
        document.addEventListener('keydown', this._escListener);
        console.log('[WindowTagTool] activated — click a window to tag it');
    }

    deactivate(): void {
        if (!this.isActive) return;
        this.isActive = false;
        const el = this._domElement;
        if (el) {
            el.removeEventListener('mousedown', this._onMouseDown);
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

    private get _world(): any {
        const worlds = this._components.get(OBC.Worlds);
        return worlds.list.get('main') || Array.from(worlds.list.values())[0];
    }

    private get _domElement(): HTMLCanvasElement | null {
        return this._world?.renderer?.three.domElement ?? null;
    }

    private _onMouseDown = (e: MouseEvent): void => {
        if (!this.isActive || e.button !== 0) return;
        this._updateMouse(e);

        const hit = this._raycast();
        if (!hit) {
            console.log('[WindowTagTool] No window hit at click position');
            return;
        }

        const root = this._findWindowRoot(hit.object);
        if (!root?.userData?.id) {
            console.log('[WindowTagTool] Clicked object is not a window — try clicking on a window');
            return;
        }

        this._placeWindowTag(root, hit.point);
    };

    private _placeWindowTag(obj: THREE.Object3D, hitPoint: THREE.Vector3): void {
        if (!this._activeViewId) {
            console.warn('[WindowTagTool] No active view — tag not created');
            return;
        }

        const windowId = obj.userData.id as string;

        const windowStore = (this._resolverStores as any).windowStore ?? window.windowStore;
        const win = windowStore?.getById?.(windowId);

        const widthMm   = win ? Math.round(win.width  * 1000) : 0;
        const heightMm  = win ? Math.round(win.height * 1000) : 0;
        const mark      = win?.mark?.trim() || `W-${windowId.slice(0, 4).toUpperCase()}`;
        const cachedLabel = mark;

        const ref = makeRef('window', windowId, 'centroid');
        const cachedPos = { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z };

        const id  = crypto.randomUUID();
        const ann = makeAnnotationElement(
            id,
            'window-tag',
            this._activeViewId,
            [{ ...ref, cachedPosition: cachedPos }],
            {
                modelPoints: [cachedPos],
                offset: 0,
            },
            {
                windowId,
                width:        win?.width  ?? 0,
                height:       win?.height ?? 0,
                widthMm,
                heightMm,
                mark,
                cachedLabel,
                showLeader:   true,
            }
        );

        // P13 (A36): typed payload so AnnotationsState receives the correct id/viewId/kind.
        if (window.runtime?.bus) { window.runtime.bus.executeCommand('annotation.create', { id: ann.id, viewId: ann.ownerViewId, kind: ann.type as any }).catch(() => {}); }
        console.log('[WindowTagTool] Tagged window', windowId, '→', cachedLabel, 'in view', this._activeViewId);
    }

    private _raycast(): THREE.Intersection | null {
        const world = this._world;
        if (!world?.camera || !world?.scene) return null;

        this._raycaster.setFromCamera(this._mouse, world.camera.three);

        const candidates: THREE.Object3D[] = [];
        world.scene.three.traverse((obj: THREE.Object3D) => {
            if (obj.userData?.isHelper || obj.userData?.isPreview || !obj.visible) return;
            const type = (obj.userData?.elementType || obj.userData?.type || '').toLowerCase();
            if (obj.userData?.selectable || type === 'window') candidates.push(obj);
        });

        const hits = this._raycaster.intersectObjects(candidates, true);
        for (const hit of hits) {
            const root = this._findWindowRoot(hit.object);
            if (root) return { ...hit, object: root };
        }
        return null;
    }

    private _findWindowRoot(obj: THREE.Object3D): THREE.Object3D | null {
        let curr: THREE.Object3D | null = obj;
        while (curr) {
            const type = (curr.userData?.elementType || curr.userData?.type || '').toLowerCase();
            if (curr.userData?.id && type === 'window') return curr;
            curr = curr.parent;
        }
        return null;
    }

    private _updateMouse(e: MouseEvent): void {
        const el = this._domElement;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        this._mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        this._mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    }
}
