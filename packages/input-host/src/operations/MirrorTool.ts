/**
 * @file src/tools/operations/MirrorTool.ts
 *
 * Two-click operation: user picks two points to define a mirror axis; a new
 * mirrored copy of the selected element is created via MirrorElementCommand.
 *
 * Interaction flow:
 *   1. SelectionOverlay calls activate(elementId, elementType)
 *   2. Instruction: "Click first point of mirror axis"
 *   3. User clicks → P1 stored, MirrorGizmo shows dashed line following cursor
 *   4. Instruction: "Click second point of mirror axis"
 *   5. User clicks → P2 stored → MirrorElementCommand executed
 *
 * MirrorGizmo renders a dashed Three.js Line in the scene that follows the
 * cursor while waiting for P2.  The scene is injected optionally — if not
 * provided, the gizmo is skipped (no visual preview, command still executes).
 *
 * Contract:
 *   §01 §2.1  — mutations via commandManager.execute() only
 *   §01 §2.6  — newId generated at Tool layer, passed to command
 *   §04 §2    — Tool layer
 */

import * as THREE from '@pryzm/renderer-three/three';
import { OperationToolBase } from './OperationToolBase.js';
import type { OperationId } from './ElementCapabilities.js';
import { MirrorElementCommand } from '@pryzm/command-registry';
import type { CommandManager } from '@pryzm/command-registry';
import type { Point3D } from '@pryzm/core-app-model';
import { MirrorGizmo } from '../gizmo/MirrorGizmo.js';

export class MirrorTool extends OperationToolBase {
    get operationId(): OperationId { return 'mirror'; }

    private _elementId = '';
    private _p1: Point3D | null = null;
    private _gizmo: MirrorGizmo | null = null;

    constructor(
        private readonly _cmd: CommandManager,
        /** Optional: provide the Three.js scene for live preview gizmo. */
        private readonly _scene?: THREE.Scene,
    ) {
        super();
    }

    activate(elementId: string, elementType: string): void {
        this._baseActivate(elementId, elementType);
        this._elementId = elementId;
        this._p1        = null;
        this._resetStep();

        this._setCursor('crosshair');
        this._showInstructions('Click the FIRST point of the mirror axis — Esc to cancel');

        const step0 = (e: Event) => {
            const { worldPoint } = (e as CustomEvent).detail ?? {};
            if (!worldPoint) return;

            this._p1 = worldPoint as Point3D;

            // Start dashed-line gizmo if scene is available
            if (this._scene) {
                this._gizmo = new MirrorGizmo(this._scene);
                this._gizmo.setP1(this._p1);

                // Track cursor movement for live preview line
                const mouseTrack = (me: Event) => {
                    const wp = (me as CustomEvent).detail?.worldPoint;
                    if (wp) this._gizmo?.updateCursor(wp);
                };
                this._addListener('bim-canvas-mouse-move', mouseTrack as EventListener, window);
            }

            this._nextStep('Click the SECOND point of the mirror axis — Esc to cancel');
            this._swapCanvasHandler(step0, step1);
        };

        const step1 = (e: Event) => {
            const { worldPoint } = (e as CustomEvent).detail ?? {};
            if (!worldPoint) return;

            const p2 = worldPoint as Point3D;
            const dx = p2.x - this._p1!.x, dz = p2.z - this._p1!.z;
            if (Math.sqrt(dx * dx + dz * dz) < 0.05) {
                this._showInstructions('⚠ Points are too close — pick a farther second point');
                return;
            }

            this._gizmo?.dispose();
            this._gizmo = null;
            this._executeMirror(this._p1!, p2);
        };

        this._addListener('bim-canvas-world-click', step0 as EventListener, window);
    }

    override cancel(): void {
        this._gizmo?.dispose();
        this._gizmo = null;
        super.cancel();
    }

    private _executeMirror(p1: Point3D, p2: Point3D): void {
        const newId = crypto.randomUUID();
        const cmd   = new MirrorElementCommand({
            sourceId:        this._elementId,
            newId,
            mirrorLineStart: p1,
            mirrorLineEnd:   p2,
        });
        const result = this._cmd.execute(cmd);
        if (!result.success) {
            const info = result.info?.[0] ?? 'Mirror failed';
            window.dispatchEvent(new CustomEvent('bim-operation-error', { detail: { msg: info } })); // TODO(TASK-12)
            return;
        }
        this._complete();
    }

    /** Swap the bim-canvas-world-click handler in the managed listener list. */
    private _swapCanvasHandler(oldFn: EventListener, newFn: EventListener): void {
        const arr = (this as any)._listeners as Array<{ type: string; handler: EventListener; target: EventTarget }>;
        const type = 'bim-canvas-world-click';
        window.removeEventListener(type, oldFn);
        const idx = arr.findLastIndex((e: any) => e.type === type && e.handler === oldFn);
        if (idx >= 0) arr[idx] = { type, handler: newFn, target: window };
        window.addEventListener(type, newFn);
    }
}
