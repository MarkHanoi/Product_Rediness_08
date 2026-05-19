/**
 * DOC-2.9 — NorthArrowTool
 *
 * Single-click interaction: click once to place a north-arrow annotation at
 * the clicked world position. The symbol is rendered by PlanViewAnnotationRenderer
 * (_renderNorthArrow) in the Canvas2D plan view.
 *
 * Parameters stored:
 *   { northAngle: number }  — rotation in degrees from screen-up (0 = pointing up, CW positive)
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

export class NorthArrowTool {
    public isActive = false;
    private _activeViewId: string | null = null;

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
        const el = this._domElement;
        if (el) {
            el.addEventListener('mousedown', this._onMouseDown);
            el.style.cursor = 'crosshair';
        }
        this._escListener = (e: KeyboardEvent) => { if (e.key === 'Escape') this.deactivate(); };
        document.addEventListener('keydown', this._escListener);
        console.log('[NorthArrowTool] activated — click to place north arrow');
    }

    deactivate(): void {
        if (!this.isActive) return;
        this.isActive = false;
        const el = this._domElement;
        if (el) {
            el.removeEventListener('mousedown', this._onMouseDown);
            el.style.cursor = '';
        }
        if (this._escListener) {
            document.removeEventListener('keydown', this._escListener);
            this._escListener = null;
        }
    }

    dispose(): void { this.deactivate(); }

    private readonly _onMouseDown = (e: MouseEvent): void => {
        if (e.button !== 0) return;
        const el = this._domElement;
        if (!el) return;

        const rect = el.getBoundingClientRect();
        this._mouse.set(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );

        const camera = this._camera;
        if (!camera) return;

        this._raycaster.setFromCamera(this._mouse, camera);
        const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const pt = new THREE.Vector3();
        if (!this._raycaster.ray.intersectPlane(ground, pt)) return;

        this._placeNorthArrow(pt);
    };

    private _placeNorthArrow(pt: THREE.Vector3): void {
        const viewId = this._activeViewId;
        if (!viewId) {
            console.warn('[NorthArrowTool] No active view ID');
            return;
        }

        const ann = makeAnnotationElement(
            crypto.randomUUID(),
            'north-arrow',
            viewId,
            [makePointRef(pt)],
            {
                modelPoints: [{ x: pt.x, y: pt.y, z: pt.z }],
                offset: 0,
            },
            { northAngle: 0 },
        );

        if (window.runtime?.bus) { window.runtime.bus.executeCommand('annotation.create', { id: ann.id, viewId: ann.ownerViewId, kind: ann.type as any }).catch(() => {}); }
        const result = this._commandManager.execute(new CreateAnnotationCommand(ann));
        if (result.success) {
            console.log('[NorthArrowTool] North arrow placed at', pt);
        } else {
            console.error('[NorthArrowTool] CreateAnnotationCommand failed:', result.error);
        }

        this.deactivate();
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
}
