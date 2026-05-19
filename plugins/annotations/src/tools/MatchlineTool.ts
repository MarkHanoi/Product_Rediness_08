/**
 * DOC-2.9 — MatchlineTool
 *
 * Two-click interaction: click two points to define a matchline.
 *   Click 1 → set start point
 *   Click 2 → set end point → fires CreateAnnotationCommand for 'matchline'
 *
 * The matchline is rendered by PlanViewAnnotationRenderer (_renderMatchline)
 * in the Canvas2D plan view as a heavy dashed line with "MATCH LINE" label.
 *
 * Parameters stored:
 *   { sheetRef: string, label: string }
 *
 * Contract compliance:
 *   §05 §7.8 — No bim-* / @thatopen/ui elements
 *   §01 §2   — CreateAnnotationCommand dispatched through CommandManager
 *   §01 §3.3 — AnnotationElement contains only plain serialisable primitives
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { makeAnnotationElement } from '../subsystem/AnnotationTypes';
import { makePointRef } from '../subsystem/AnnotationReference';
import { CreateAnnotationCommand } from '../commands/CreateAnnotationCommand';
import { BIM_LAYER } from '@pryzm/scene-committer';

type CommandManager = { execute(cmd: unknown): { success: boolean; error?: unknown } };

enum MatchlineState { IDLE, PICK_A, PICK_B }

export class MatchlineTool {
    public isActive = false;
    private _state = MatchlineState.IDLE;
    private _activeViewId: string | null = null;
    private _pointA: THREE.Vector3 | null = null;

    private _previewLine: THREE.Line | null = null;
    private _previewMat = new THREE.LineDashedMaterial({ color: 0x1a2035, linewidth: 2, dashSize: 8, gapSize: 4 });

    private _raycaster = (() => {
        const r = new THREE.Raycaster();
        r.layers.set(BIM_LAYER);
        return r;
    })();
    private _mouse = new THREE.Vector2();
    private _escListener: ((e: KeyboardEvent) => void) | null = null;

    constructor(
        private _components: OBC.Components,
        private _commandManager: CommandManager,
    ) {}

    setActiveViewId(viewId: string | null): void { this._activeViewId = viewId; }

    activate(): void {
        if (this.isActive) return;
        this.isActive = true;
        this._state = MatchlineState.PICK_A;
        const el = this._domElement;
        if (el) {
            el.addEventListener('mousedown', this._onMouseDown);
            el.addEventListener('mousemove', this._onMouseMove);
            el.style.cursor = 'crosshair';
        }
        this._escListener = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (this._state === MatchlineState.PICK_B) {
                    this._pointA = null;
                    this._removePreview();
                    this._state = MatchlineState.PICK_A;
                } else {
                    this.deactivate();
                }
            }
        };
        document.addEventListener('keydown', this._escListener);
        console.log('[MatchlineTool] activated — click two points to define a matchline');
    }

    deactivate(): void {
        if (!this.isActive) return;
        this.isActive = false;
        this._pointA = null;
        this._state = MatchlineState.IDLE;
        this._removePreview();
        const el = this._domElement;
        if (el) {
            el.removeEventListener('mousedown', this._onMouseDown);
            el.removeEventListener('mousemove', this._onMouseMove);
            el.style.cursor = '';
        }
        if (this._escListener) {
            document.removeEventListener('keydown', this._escListener);
            this._escListener = null;
        }
    }

    dispose(): void { this.deactivate(); this._previewMat.dispose(); }

    private readonly _onMouseDown = (e: MouseEvent): void => {
        if (e.button !== 0) return;
        const pt = this._getGroundPoint(e);
        if (!pt) return;

        if (this._state === MatchlineState.PICK_A) {
            this._pointA = pt;
            this._state  = MatchlineState.PICK_B;
            this._updatePreview(pt, pt);
        } else if (this._state === MatchlineState.PICK_B && this._pointA) {
            this._placeMatchline(this._pointA, pt);
        }
    };

    private readonly _onMouseMove = (e: MouseEvent): void => {
        if (this._state !== MatchlineState.PICK_B || !this._pointA) return;
        const pt = this._getGroundPoint(e);
        if (pt) this._updatePreview(this._pointA, pt);
    };

    private _placeMatchline(ptA: THREE.Vector3, ptB: THREE.Vector3): void {
        const viewId = this._activeViewId;
        if (!viewId) {
            console.warn('[MatchlineTool] No active view ID');
            return;
        }

        const ann = makeAnnotationElement(
            crypto.randomUUID(),
            'matchline',
            viewId,
            [makePointRef(ptA), makePointRef(ptB)],
            {
                modelPoints: [
                    { x: ptA.x, y: ptA.y, z: ptA.z },
                    { x: ptB.x, y: ptB.y, z: ptB.z },
                ],
                offset: 0,
            },
            { sheetRef: '', label: 'MATCH LINE' },
        );

        if (window.runtime?.bus) { window.runtime.bus.executeCommand('annotation.create', { id: ann.id, viewId: ann.ownerViewId, kind: ann.type as any }).catch(() => {}); }
        const result = this._commandManager.execute(new CreateAnnotationCommand(ann));
        if (result.success) {
            console.log('[MatchlineTool] Matchline placed from', ptA, 'to', ptB);
        } else {
            console.error('[MatchlineTool] CreateAnnotationCommand failed:', result.error);
        }

        this._removePreview();
        this.deactivate();
    }

    private _updatePreview(ptA: THREE.Vector3, ptB: THREE.Vector3): void {
        const scene = this._scene;
        if (!scene) return;

        this._removePreview();
        const geo = new THREE.BufferGeometry().setFromPoints([ptA, ptB]);
        this._previewLine = new THREE.Line(geo, this._previewMat);
        this._previewLine.computeLineDistances();
        scene.add(this._previewLine);
    }

    private _removePreview(): void {
        if (this._previewLine) {
            this._previewLine.parent?.remove(this._previewLine);
            this._previewLine.geometry.dispose();
            this._previewLine = null;
        }
    }

    private _getGroundPoint(e: MouseEvent): THREE.Vector3 | null {
        const el = this._domElement;
        const camera = this._camera;
        if (!el || !camera) return null;

        const rect = el.getBoundingClientRect();
        this._mouse.set(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        this._raycaster.setFromCamera(this._mouse, camera);
        const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const pt = new THREE.Vector3();
        return this._raycaster.ray.intersectPlane(ground, pt) ? pt : null;
    }

    private get _world(): any {
        try { return this._components.get(OBC.Worlds).list.values().next().value; }
        catch { return null; }
    }
    private get _domElement(): HTMLElement | null {
        return this._world?.renderer?.three?.domElement ?? null;
    }
    private get _camera(): THREE.Camera | null {
        return this._world?.camera?.three ?? null;
    }
    private get _scene(): THREE.Scene | null {
        return this._world?.scene?.three ?? null;
    }
}
