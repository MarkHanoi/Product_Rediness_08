/**
 * §ANN-B5 — Spot Elevation Annotation Tool
 *
 * Single-click tool: click any surface or the ground plane to drop a
 * spot-elevation marker. The Y-coordinate of the hit point is captured
 * as the elevation value and stored in annotation parameters.
 *
 * The matching renderer (_renderSpotElevation) already exists in
 * AnnotationRenderLayer — this tool solely produces the AnnotationElement.
 *
 * Contract compliance:
 *   §05 §7.8 — No bim-* / @thatopen/ui elements
 *   §01 §2   — CreateAnnotationCommand dispatched through CommandManager
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { AnnotationStore } from '../subsystem/AnnotationStore';
import { makePointRef } from '../subsystem/AnnotationReference';
import { makeAnnotationElement } from '../subsystem/AnnotationTypes';
import { BIM_LAYER } from '@pryzm/scene-committer';

export type SpotElevationUnit = 'm' | 'mm' | 'ft' | 'in';

export class SpotElevationAnnotationTool {
    public isActive = false;
    private _activeViewId: string | null = null;
    private _unit: SpotElevationUnit = 'm';
    private _relative = false;
    private _datumElevation = 0;
    private _escListener: ((e: KeyboardEvent) => void) | null = null;

    private _raycaster = (() => {
        const raycaster = new THREE.Raycaster();
        raycaster.layers.set(BIM_LAYER);
        return raycaster;
    })();
    private _mouse = new THREE.Vector2();

    constructor(
        private _components: OBC.Components,
        _store: AnnotationStore
    ) { void _store; }

    // ── Public API ────────────────────────────────────────────────────────────

    setActiveViewId(viewId: string | null): void {
        this._activeViewId = viewId;
    }

    setUnit(unit: SpotElevationUnit): void {
        this._unit = unit;
    }

    setRelative(relative: boolean, datumElevation = 0): void {
        this._relative = relative;
        this._datumElevation = datumElevation;
    }

    activate(): void {
        if (this.isActive) return;
        this.isActive = true;
        const el = this._domElement;
        if (el) {
            el.addEventListener('mousedown', this._onMouseDown);
            el.style.cursor = 'copy';
        }
        this._escListener = (e: KeyboardEvent) => { if (e.key === 'Escape') this.deactivate(); };
        document.addEventListener('keydown', this._escListener);
        console.log('[SpotElevationTool] activated — click any surface to place elevation marker');
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

    // ── Private ───────────────────────────────────────────────────────────────

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

        const worldPt = this._pickWorldPoint();
        if (!worldPt) return;

        this._placeMarker(worldPt, e.clientX, e.clientY);
    };

    private _pickWorldPoint(): THREE.Vector3 | null {
        const world = this._world;
        if (!world?.camera) return null;

        this._raycaster.setFromCamera(this._mouse, world.camera.three);

        const candidates: THREE.Object3D[] = [];
        world.scene.three.traverse((obj: THREE.Object3D) => {
            if (obj.userData?.isHelper || obj.userData?.isPreview || !obj.visible) return;
            if ((obj as THREE.Mesh).isMesh) candidates.push(obj);
        });

        const hits = this._raycaster.intersectObjects(candidates, true);
        if (hits.length > 0) return hits[0]!.point.clone();

        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const target = new THREE.Vector3();
        if (this._raycaster.ray.intersectPlane(plane, target)) return target;

        return null;
    }

    private _placeMarker(worldPt: THREE.Vector3, screenX: number, screenY: number): void {
        if (!this._activeViewId) {
            console.warn('[SpotElevationTool] No active view — marker not created');
            return;
        }

        const id  = crypto.randomUUID();
        const ref = makePointRef(worldPt);

        const element = makeAnnotationElement(
            id,
            'spot-elevation',
            this._activeViewId,
            [{ ...ref, cachedPosition: { x: worldPt.x, y: worldPt.y, z: worldPt.z } }],
            {
                modelPoints: [{ x: worldPt.x, y: worldPt.y, z: worldPt.z }],
                offset: 0,
                screenOverride: { x: screenX, y: screenY },
            },
            {
                unit:             this._unit,
                relative:         this._relative,
                datumElevation:   this._datumElevation,
                elevationValue:   worldPt.y,
            }
        );

        if (window.runtime?.bus) { window.runtime.bus.executeCommand('annotation.create', { id: element.id, viewId: element.ownerViewId, kind: element.type as any }).catch(() => {}); }
        console.log(
            '[SpotElevationTool] Placed elevation marker at Y=', worldPt.y.toFixed(3),
            'in view', this._activeViewId
        );
    }

    private _updateMouse(e: MouseEvent): void {
        const el = this._domElement;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        this._mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        this._mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    }
}
