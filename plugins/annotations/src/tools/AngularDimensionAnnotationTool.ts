/**
 * §ANN-B2 — Angular Dimension Annotation Tool
 *
 * Three-click interaction:
 *   1. Click to pick the vertex (the angle corner point)
 *   2. Click to pick end-point A (first ray)
 *   3. Click to pick end-point B (second ray)
 *   → Fires CreateAnnotationCommand for an 'angular-dim' annotation
 *
 * Geometry stored in modelPoints:
 *   [0] = vertex  [1] = endA  [2] = endB
 *
 * Parameters stored: { unit: 'deg', angleValue: number (degrees) }
 *
 * Contract compliance:
 *   §05 §7.8 — No bim-* / @thatopen/ui elements
 *   §01 §2   — ID generated here; CreateAnnotationCommand dispatched through CommandManager
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { AnnotationStore } from '../subsystem/AnnotationStore';
import { makePointRef, makeRef, resolveReferenceToPoint, ResolverStores, StableReference } from '../subsystem/AnnotationReference';
import { makeAnnotationElement } from '../subsystem/AnnotationTypes';
import { BIM_LAYER } from '@pryzm/scene-committer';

export enum AngularDimToolState {
    IDLE,
    PICK_VERTEX,
    PICK_A,
    PICK_B,
}

export class AngularDimensionAnnotationTool {
    public isActive = false;
    private _state = AngularDimToolState.IDLE;
    private _activeViewId: string | null = null;

    private _vertex: THREE.Vector3 | null = null;
    private _refVertex: StableReference | null = null;
    private _endA: THREE.Vector3 | null = null;
    private _refA: StableReference | null = null;

    private _previewLine: THREE.Line | null = null;
    private _raycaster = (() => {
        const raycaster = new THREE.Raycaster();
        raycaster.layers.set(BIM_LAYER);
        return raycaster;
    })();
    private _mouse = new THREE.Vector2();

    constructor(
        private _components: OBC.Components,
        _store: AnnotationStore,
        private _resolverStores: ResolverStores
    ) { void _store; }

    // ── Public API ────────────────────────────────────────────────────────────

    setActiveViewId(viewId: string | null): void {
        this._activeViewId = viewId;
    }

    setResolverStores(stores: ResolverStores): void {
        this._resolverStores = stores;
    }

    activate(): void {
        if (this.isActive) return;
        this.isActive = true;
        this._state = AngularDimToolState.PICK_VERTEX;
        this._attachListeners();
        if (this._domElement) this._domElement.style.cursor = 'crosshair';
        console.log('[AngularDimTool] activated — click the angle vertex point');
    }

    deactivate(): void {
        if (!this.isActive) return;
        this.isActive = false;
        this._state = AngularDimToolState.IDLE;
        this._detachListeners();
        this._clearPreview();
        this._reset();
        if (this._domElement) this._domElement.style.cursor = 'default';
    }

    dispose(): void {
        this.deactivate();
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private get _world(): any {
        const worlds = this._components.get(OBC.Worlds);
        return worlds.list.get('main') || Array.from(worlds.list.values())[0];
    }

    private get _domElement(): HTMLCanvasElement | null {
        return this._world?.renderer?.three.domElement ?? null;
    }

    private _escListener: ((e: KeyboardEvent) => void) | null = null;

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

        if (
            (this._state === AngularDimToolState.PICK_A || this._state === AngularDimToolState.PICK_B) &&
            this._vertex
        ) {
            const hit = this._raycast();
            if (hit) this._updatePreview(this._vertex, hit.point);
        }
    };

    private _onMouseDown = (e: MouseEvent): void => {
        if (!this.isActive || e.button !== 0) return;
        this._updateMouse(e);
        const hit = this._raycast();
        if (!hit) return;

        if (this._state === AngularDimToolState.PICK_VERTEX) {
            this._vertex   = hit.point.clone();
            this._refVertex = this._makeRefFromHit(hit);
            this._state    = AngularDimToolState.PICK_A;
            console.log('[AngularDimTool] Vertex picked');

        } else if (this._state === AngularDimToolState.PICK_A) {
            this._endA  = hit.point.clone();
            this._refA  = this._makeRefFromHit(hit);
            this._state = AngularDimToolState.PICK_B;
            console.log('[AngularDimTool] End A picked');

        } else if (this._state === AngularDimToolState.PICK_B) {
            if (!this._vertex || !this._endA || !this._refVertex || !this._refA) return;
            const endB  = hit.point.clone();
            const refB  = this._makeRefFromHit(hit);
            this._createAngularDim(this._refVertex, this._refA, refB, this._vertex, this._endA, endB);
            this._reset();
            this._state = AngularDimToolState.PICK_VERTEX;
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

    private _createAngularDim(
        refVertex: StableReference,
        refA: StableReference,
        refB: StableReference,
        vertex: THREE.Vector3,
        endA: THREE.Vector3,
        endB: THREE.Vector3
    ): void {
        if (!this._activeViewId) {
            console.warn('[AngularDimTool] No active view — annotation not created');
            return;
        }

        // Compute angle between rays (vertex→A) and (vertex→B)
        const rayA = new THREE.Vector3().subVectors(endA, vertex).normalize();
        const rayB = new THREE.Vector3().subVectors(endB, vertex).normalize();
        const angleDeg = THREE.MathUtils.radToDeg(Math.acos(Math.max(-1, Math.min(1, rayA.dot(rayB)))));

        const id = crypto.randomUUID();

        const resolvePos = (ref: StableReference, fallback: THREE.Vector3) => {
            const pt = resolveReferenceToPoint(ref, this._resolverStores);
            return pt ? { x: pt.x, y: pt.y, z: pt.z } : { x: fallback.x, y: fallback.y, z: fallback.z };
        };

        const refs: StableReference[] = [
            { ...refVertex, cachedPosition: resolvePos(refVertex, vertex) },
            { ...refA,      cachedPosition: resolvePos(refA, endA) },
            { ...refB,      cachedPosition: resolvePos(refB, endB) },
        ];

        const element = makeAnnotationElement(
            id,
            'angular-dim',
            this._activeViewId,
            refs,
            {
                modelPoints: [
                    { x: vertex.x, y: vertex.y, z: vertex.z },
                    { x: endA.x,   y: endA.y,   z: endA.z },
                    { x: endB.x,   y: endB.y,   z: endB.z },
                ],
                offset: 0,
            },
            { unit: 'deg', angleValue: angleDeg }
        );

        // P13 (A36): typed payload so AnnotationsState receives the correct id/viewId/kind.
        if (window.runtime?.bus) { window.runtime.bus.executeCommand('annotation.create', { id: element.id, viewId: element.ownerViewId, kind: element.type as any }).catch(() => {}); }
        console.log('[AngularDimTool] Created angular dim', id, `(${angleDeg.toFixed(1)}°) in view`, this._activeViewId);
    }

    // ── Preview ───────────────────────────────────────────────────────────────

    private _updatePreview(from: THREE.Vector3, to: THREE.Vector3): void {
        const world = this._world;
        if (!world) return;

        if (!this._previewLine) {
            const geo = new THREE.BufferGeometry();
            const mat = new THREE.LineBasicMaterial({ color: 0x6600ff, depthTest: false });
            this._previewLine = new THREE.Line(geo, mat);
            this._previewLine.renderOrder = 999;
            world.scene.three.add(this._previewLine);
        }

        const pts = this._vertex ? [this._vertex, from, to].filter(Boolean) : [from, to];
        this._previewLine.geometry.setFromPoints(pts as THREE.Vector3[]);
        this._previewLine.visible = true;
    }

    private _clearPreview(): void {
        if (this._previewLine) this._previewLine.visible = false;
    }

    // ── Raycast ───────────────────────────────────────────────────────────────

    private _raycast(): THREE.Intersection | null {
        const world = this._world;
        if (!world?.camera || !world?.scene) return null;

        this._raycaster.setFromCamera(this._mouse, world.camera.three);

        // Fallback: intersect a horizontal ground plane
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const target = new THREE.Vector3();
        if (this._raycaster.ray.intersectPlane(plane, target)) {
            return {
                distance: target.distanceTo(this._raycaster.ray.origin),
                point: target.clone(),
                object: world.scene.three,
            } as any;
        }

        // Raycast against selectable scene objects
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
        this._vertex    = null;
        this._refVertex = null;
        this._endA      = null;
        this._refA      = null;
        this._clearPreview();
    }
}
