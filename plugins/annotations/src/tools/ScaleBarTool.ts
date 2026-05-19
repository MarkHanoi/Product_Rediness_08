/**
 * DOC-2.9 — ScaleBarTool
 *
 * Single-click interaction: click once to place a scale-bar annotation at
 * the clicked world position. The symbol is rendered by PlanViewAnnotationRenderer
 * (_renderScaleBar) in the Canvas2D plan view.
 *
 * Parameters stored:
 *   { scale: number, segmentCount: number, unit: string, segmentSize: number }
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

export interface ScaleBarToolOptions {
    scale?: number;
    segmentCount?: number;
    unit?: 'm' | 'mm';
    segmentSize?: number;
}

export class ScaleBarTool {
    public isActive = false;
    private _activeViewId: string | null = null;
    private _options: ScaleBarToolOptions = {};

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
    setOptions(opts: ScaleBarToolOptions): void { this._options = opts; }

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
        console.log('[ScaleBarTool] activated — click to place scale bar');
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

        this._placeScaleBar(pt);
    };

    private _placeScaleBar(pt: THREE.Vector3): void {
        const viewId = this._activeViewId;
        if (!viewId) {
            console.warn('[ScaleBarTool] No active view ID');
            return;
        }

        const ann = makeAnnotationElement(
            crypto.randomUUID(),
            'scale-bar',
            viewId,
            [makePointRef(pt)],
            {
                modelPoints: [{ x: pt.x, y: pt.y, z: pt.z }],
                offset: 0,
            },
            {
                scale:        this._options.scale        ?? 100,
                segmentCount: this._options.segmentCount ?? 4,
                unit:         this._options.unit         ?? 'm',
                segmentSize:  this._options.segmentSize  ?? 20,
            },
        );

        if (window.runtime?.bus) { window.runtime.bus.executeCommand('annotation.create', { id: ann.id, viewId: ann.ownerViewId, kind: ann.type as any }).catch(() => {}); }
        const result = this._commandManager.execute(new CreateAnnotationCommand(ann));
        if (result.success) {
            console.log('[ScaleBarTool] Scale bar placed at', pt);
        } else {
            console.error('[ScaleBarTool] CreateAnnotationCommand failed:', result.error);
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
