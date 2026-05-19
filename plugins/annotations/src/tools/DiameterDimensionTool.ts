/**
 * DOC-2.4 — Diameter Dimension Tool
 *
 * Two-click interaction:
 *   1. Click to pick point A (one side of the diameter)
 *   2. Click to pick point B (opposite side of the diameter)
 *   → Fires CreateAnnotationCommand for a 'diameter-dim' annotation
 *
 * Geometry stored in modelPoints:
 *   [0] = pointA  [1] = pointB
 *
 * Parameters stored: { diameterMetres: number, unit: 'mm'|'cm'|'m' }
 *
 * Rendered as: line from A to B with filled arrowheads at both ends and
 * "Ø xxxx mm" label above the midpoint.
 *
 * Contract compliance:
 *   §05 §7.8 — No bim-* / @thatopen/ui elements
 *   §01 §2   — ID generated here; CreateAnnotationCommand dispatched through CommandManager
 *   §01 §3.3 — AnnotationElement contains only plain serialisable primitives
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { makeAnnotationElement } from '../subsystem/AnnotationTypes';
import { makePointRef, makeRef, resolveReferenceToPoint, ResolverStores, StableReference } from '../subsystem/AnnotationReference';
import { BIM_LAYER } from '@pryzm/scene-committer';

export enum DiameterDimToolState {
    IDLE,
    PICK_A,
    PICK_B,
}

export class DiameterDimensionTool {
    public isActive = false;
    private _state = DiameterDimToolState.IDLE;
    private _activeViewId: string | null = null;

    private _pointA: THREE.Vector3 | null = null;
    private _refA: StableReference | null = null;

    private _previewLine: THREE.Line | null = null;
    private _raycaster = (() => {
        const raycaster = new THREE.Raycaster();
        raycaster.layers.set(BIM_LAYER);
        return raycaster;
    })();
    private _mouse = new THREE.Vector2();

    private _escListener: ((e: KeyboardEvent) => void) | null = null;

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
        this._state = DiameterDimToolState.PICK_A;
        this._attachListeners();
        if (this._domElement) this._domElement.style.cursor = 'crosshair';
        console.log('[DiameterDimTool] activated — click the first diameter point');
    }

    deactivate(): void {
        if (!this.isActive) return;
        this.isActive = false;
        this._state = DiameterDimToolState.IDLE;
        this._detachListeners();
        this._clearPreview();
        this._reset();
        if (this._domElement) this._domElement.style.cursor = 'default';
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

    private _attachListeners(): void {
        const el = this._domElement;
        if (!el) return;
        el.addEventListener('mousemove', this._onMouseMove);
        el.addEventListener('mousedown', this._onMouseDown);
        this._escListener = (e: KeyboardEvent) => { if (e.key === 'Escape') this.deactivate(); };
        document.addEventListener('keydown', this._escListener);
    }

    private _detachListeners(): void {
        const el = this._domElement;
        if (!el) return;
        el.removeEventListener('mousemove', this._onMouseMove);
        el.removeEventListener('mousedown', this._onMouseDown);
        if (this._escListener) {
            document.removeEventListener('keydown', this._escListener);
            this._escListener = null;
        }
    }

    private _onMouseMove = (e: MouseEvent): void => {
        if (!this.isActive) return;
        this._updateMouse(e);
        if (this._state === DiameterDimToolState.PICK_B && this._pointA) {
            const hit = this._raycast();
            if (hit) this._updatePreview(this._pointA, hit.point);
        }
    };

    private _onMouseDown = (e: MouseEvent): void => {
        if (!this.isActive || e.button !== 0) return;
        this._updateMouse(e);
        const hit = this._raycast();
        if (!hit) return;

        if (this._state === DiameterDimToolState.PICK_A) {
            this._pointA = hit.point.clone();
            this._refA   = this._makeRefFromHit(hit);
            this._state  = DiameterDimToolState.PICK_B;
            console.log('[DiameterDimTool] Point A picked at', this._pointA.toArray());

        } else if (this._state === DiameterDimToolState.PICK_B) {
            if (!this._pointA || !this._refA) return;
            const pointB = hit.point.clone();
            const refB   = this._makeRefFromHit(hit);
            this._createDiameterDim(this._refA, refB, this._pointA, pointB);
            this._reset();
            this._state = DiameterDimToolState.PICK_A;
        }
    };

    private _makeRefFromHit(hit: THREE.Intersection): StableReference {
        const obj = this._findSelectableRoot(hit.object);
        if (obj?.userData?.id && obj?.userData?.elementType) {
            const elType = (obj.userData.elementType as string).toLowerCase();
            return makeRef(elType, obj.userData.id as string, 'param', 0.5);
        }
        return makePointRef(hit.point);
    }

    private _createDiameterDim(
        refA: StableReference,
        refB: StableReference,
        pointA: THREE.Vector3,
        pointB: THREE.Vector3
    ): void {
        if (!this._activeViewId) {
            console.warn('[DiameterDimTool] No active view — annotation not created');
            return;
        }

        const diameterMetres = pointA.distanceTo(pointB);
        const id = crypto.randomUUID();

        const resolvePos = (ref: StableReference, fallback: THREE.Vector3) => {
            const pt = resolveReferenceToPoint(ref, this._resolverStores);
            return pt ? { x: pt.x, y: pt.y, z: pt.z } : { x: fallback.x, y: fallback.y, z: fallback.z };
        };

        const refs: StableReference[] = [
            { ...refA, cachedPosition: resolvePos(refA, pointA) },
            { ...refB, cachedPosition: resolvePos(refB, pointB) },
        ];

        const element = makeAnnotationElement(
            id,
            'diameter-dim',
            this._activeViewId,
            refs,
            {
                modelPoints: [
                    { x: pointA.x, y: pointA.y, z: pointA.z },
                    { x: pointB.x, y: pointB.y, z: pointB.z },
                ],
                offset: 0,
            },
            { diameterMetres, unit: 'mm' }
        );

        // P13 (A36): typed payload so AnnotationsState receives the correct id/viewId/kind.
        if (window.runtime?.bus) { window.runtime.bus.executeCommand('annotation.create', { id: element.id, viewId: element.ownerViewId, kind: element.type as any }).catch(() => {}); }
        console.log('[DiameterDimTool] Created diameter-dim', id, `Ø=${(diameterMetres * 1000).toFixed(0)}mm in view`, this._activeViewId);
    }

    private _updatePreview(pointA: THREE.Vector3, pointB: THREE.Vector3): void {
        const world = this._world;
        if (!world) return;

        if (!this._previewLine) {
            const geo = new THREE.BufferGeometry();
            const mat = new THREE.LineBasicMaterial({ color: 0x0088ff, depthTest: false });
            this._previewLine = new THREE.Line(geo, mat);
            this._previewLine.renderOrder = 999;
            world.scene.three.add(this._previewLine);
        }

        this._previewLine.geometry.setFromPoints([pointA, pointB]);
        this._previewLine.visible = true;
    }

    private _clearPreview(): void {
        if (this._previewLine) this._previewLine.visible = false;
    }

    private _raycast(): THREE.Intersection | null {
        const world = this._world;
        if (!world?.camera || !world?.scene) return null;

        this._raycaster.setFromCamera(this._mouse, world.camera.three);

        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const target = new THREE.Vector3();
        if (this._raycaster.ray.intersectPlane(plane, target)) {
            return {
                distance: target.distanceTo(this._raycaster.ray.origin),
                point: target.clone(),
                object: world.scene.three,
            } as any;
        }

        const candidates: THREE.Object3D[] = [];
        world.scene.three.traverse((obj: THREE.Object3D) => {
            if (obj.userData?.isHelper || obj.userData?.isPreview || !obj.visible) return;
            const type = (obj.userData?.elementType || obj.userData?.type || '').toLowerCase();
            const semantic = ['wall', 'window', 'door', 'slab', 'furniture', 'column', 'beam', 'roof', 'stairs', 'ramp', 'railing'];
            if (obj.userData?.selectable || semantic.includes(type)) candidates.push(obj);
        });

        const hits = this._raycaster.intersectObjects(candidates, true);
        return hits[0] ?? null;
    }

    private _findSelectableRoot(obj: THREE.Object3D): THREE.Object3D | null {
        let curr: THREE.Object3D | null = obj;
        while (curr) {
            const type = (curr.userData?.elementType || curr.userData?.type || '').toLowerCase();
            const semantic = ['wall', 'window', 'door', 'slab', 'furniture', 'column', 'beam', 'roof', 'stairs', 'ramp', 'railing'];
            if (curr.userData?.id && semantic.includes(type)) return curr;
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

    private _reset(): void {
        this._pointA = null;
        this._refA   = null;
        this._clearPreview();
    }
}
