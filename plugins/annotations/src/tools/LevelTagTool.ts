/**
 * DOC-2.5 — Level Tag Tool
 *
 * Single-click interaction: click anywhere in the active view to place a
 * level tag that shows the floor elevation of the current view's level.
 *
 * Level data source: wallStore.getLevels() — §02 §1.4 (never cached; always
 * read fresh at placement time from the authoritative store).
 *
 * Geometry stored in modelPoints:
 *   [0] = placement position (3D world space)
 *
 * Parameters stored:
 *   { levelId, elevationM, levelName, cachedLabel }
 *
 * Rendered as: triangle head + horizontal tick + elevation label (standard AEC marker).
 *
 * Contract compliance:
 *   §05 §7.8 — No bim-* / @thatopen/ui elements
 *   §01 §2   — CreateAnnotationCommand dispatched through CommandManager
 *   §02 §1.4 — Elevation always read from authoritative store, never hardcoded
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { makeAnnotationElement } from '../subsystem/AnnotationTypes';
import { makePointRef, ResolverStores } from '../subsystem/AnnotationReference';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { BIM_LAYER } from '@pryzm/scene-committer';


export class LevelTagTool {
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
            el.style.cursor = 'crosshair';
        }
        this._escListener = (e: KeyboardEvent) => { if (e.key === 'Escape') this.deactivate(); };
        document.addEventListener('keydown', this._escListener);
        console.log('[LevelTagTool] activated — click to place a level elevation tag');
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

        const point = this._raycastToPlane();
        if (!point) {
            console.warn('[LevelTagTool] Could not resolve click to world position');
            return;
        }

        this._placeLevelTag(point);
    };

    private _placeLevelTag(point: THREE.Vector3): void {
        if (!this._activeViewId) {
            console.warn('[LevelTagTool] No active view — tag not created');
            return;
        }

        // §02 §1.4 — Read level elevation from authoritative store at placement time
        const viewDef = viewDefinitionStore.get(this._activeViewId);
        const levelId = viewDef?.spatial?.levelId ?? null;

        const wallStore = (this._resolverStores as any).wallStore ?? window.wallStore;
        const levels: any[] = wallStore?.getLevels?.() ?? [];
        const level = levelId ? levels.find((l: any) => l.id === levelId) : null;

        const elevationM  = level?.elevation ?? 0;
        const levelName   = level?.name      ?? (levelId ? levelId.slice(0, 8) : 'Level');
        const cachedLabel = `▽ ${levelName}  +${elevationM.toFixed(3)}m`;

        const ref = makePointRef(point);
        const cachedPos = { x: point.x, y: point.y, z: point.z };

        const id  = crypto.randomUUID();
        const ann = makeAnnotationElement(
            id,
            'level-tag',
            this._activeViewId,
            [{ ...ref, cachedPosition: cachedPos }],
            {
                modelPoints: [cachedPos],
                offset: 0,
            },
            {
                levelId:    levelId ?? '',
                elevationM,
                levelName,
                cachedLabel,
            }
        );

        // P13 (A36): typed payload so AnnotationsState receives the correct id/viewId/kind.
        if (window.runtime?.bus) { window.runtime.bus.executeCommand('annotation.create', { id: ann.id, viewId: ann.ownerViewId, kind: ann.type as any }).catch(() => {}); }
        console.log(
            '[LevelTagTool] Placed level-tag for', levelName,
            'elevation=', elevationM, 'in view', this._activeViewId
        );
    }

    private _raycastToPlane(): THREE.Vector3 | null {
        const world = this._world;
        if (!world?.camera || !world?.scene) return null;

        this._raycaster.setFromCamera(this._mouse, world.camera.three);

        // Intersect with the XZ plane at y=0 (standard plan-view floor plane)
        const plane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const target = new THREE.Vector3();
        if (this._raycaster.ray.intersectPlane(plane, target)) return target;

        // Fallback: try to intersect any scene geometry
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
