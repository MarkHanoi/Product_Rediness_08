/**
 * DOC-2.5 — Door Tag Tool
 *
 * Single-click interaction: click on a door mesh in the scene.
 * Reads the door's width, height, and mark from DoorStore, then
 * dispatches CreateAnnotationCommand for a 'door-tag' annotation.
 *
 * Geometry stored in modelPoints:
 *   [0] = door centroid (3D world position)
 *
 * Parameters stored:
 *   { doorId, width, height, mark, cachedLabel }
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

export class DoorTagTool {
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
        console.log('[DoorTagTool] activated — click a door to tag it');
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
            console.log('[DoorTagTool] No door hit at click position');
            return;
        }

        const root = this._findDoorRoot(hit.object);
        if (!root?.userData?.id) {
            console.log('[DoorTagTool] Clicked object is not a door — try clicking on a door');
            return;
        }

        this._placeDoorTag(root, hit.point);
    };

    private _placeDoorTag(obj: THREE.Object3D, hitPoint: THREE.Vector3): void {
        if (!this._activeViewId) {
            console.warn('[DoorTagTool] No active view — tag not created');
            return;
        }

        const doorId = obj.userData.id as string;

        const doorStore = (this._resolverStores as any).doorStore ?? window.doorStore;
        const door = doorStore?.getById?.(doorId);

        const widthMm   = door ? Math.round(door.width  * 1000) : 0;
        const heightMm  = door ? Math.round(door.height * 1000) : 0;
        const mark      = door?.mark?.trim() || `D-${doorId.slice(0, 4).toUpperCase()}`;
        const cachedLabel = mark;

        const ref = makeRef('door', doorId, 'centroid');
        const cachedPos = { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z };

        const id  = crypto.randomUUID();
        const ann = makeAnnotationElement(
            id,
            'door-tag',
            this._activeViewId,
            [{ ...ref, cachedPosition: cachedPos }],
            {
                modelPoints: [cachedPos],
                offset: 0,
            },
            {
                doorId,
                width:       door?.width  ?? 0,
                height:      door?.height ?? 0,
                widthMm,
                heightMm,
                mark,
                cachedLabel,
                showLeader:  true,
            }
        );

        // P13 (A36): typed payload so AnnotationsState receives the correct id/viewId/kind.
        if (window.runtime?.bus) { window.runtime.bus.executeCommand('annotation.create', { id: ann.id, viewId: ann.ownerViewId, kind: ann.type as any }).catch(() => {}); }
        console.log('[DoorTagTool] Tagged door', doorId, '→', cachedLabel, 'in view', this._activeViewId);
    }

    private _raycast(): THREE.Intersection | null {
        const world = this._world;
        if (!world?.camera || !world?.scene) return null;

        this._raycaster.setFromCamera(this._mouse, world.camera.three);

        const candidates: THREE.Object3D[] = [];
        world.scene.three.traverse((obj: THREE.Object3D) => {
            if (obj.userData?.isHelper || obj.userData?.isPreview || !obj.visible) return;
            const type = (obj.userData?.elementType || obj.userData?.type || '').toLowerCase();
            if (obj.userData?.selectable || type === 'door') candidates.push(obj);
        });

        const hits = this._raycaster.intersectObjects(candidates, true);
        for (const hit of hits) {
            const root = this._findDoorRoot(hit.object);
            if (root) return { ...hit, object: root };
        }
        return null;
    }

    private _findDoorRoot(obj: THREE.Object3D): THREE.Object3D | null {
        let curr: THREE.Object3D | null = obj;
        while (curr) {
            const type = (curr.userData?.elementType || curr.userData?.type || '').toLowerCase();
            if (curr.userData?.id && type === 'door') return curr;
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
