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

        // §OP-LISTEN-DEFER — step0 is attached on the next macrotask so the click
        // that activated the Mirror tool (the selecting click) cannot be consumed
        // as the first axis point.
        const step0 = (detail: { worldPoint?: unknown }): boolean => {
            const worldPoint = detail.worldPoint as Point3D | undefined;
            if (!worldPoint) return false;

            this._p1 = worldPoint;

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
            this._swapCanvasClickListener(step1);
            return true;
        };

        const step1 = (detail: { worldPoint?: unknown }): boolean => {
            const worldPoint = detail.worldPoint as Point3D | undefined;
            if (!worldPoint) return false;

            const p2 = worldPoint;
            const dx = p2.x - this._p1!.x, dz = p2.z - this._p1!.z;
            if (Math.sqrt(dx * dx + dz * dz) < 0.05) {
                this._showInstructions('⚠ Points are too close — pick a farther second point');
                return false;
            }

            this._gizmo?.dispose();
            this._gizmo = null;
            this._executeMirror(this._p1!, p2);
            return true;
        };

        this._addCanvasClickListener(step0);
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
            // §FIX-MIRROR-STUCK-AFTER-FAILURE (L-813) — the early `return` here left
            // the tool ACTIVE with its canvas-click listener already auto-removed by
            // the consume guard (step1 returned true). The Mirror button stayed lit,
            // the cursor stayed a crosshair, and no further click did anything — a
            // dead armed tool. Join and Cut both `_complete()` on a failed command;
            // Mirror now matches. The refusal message survives because the overlay no
            // longer lets the completion hide wipe it (§FIX-OP-REFUSAL-VISIBLE).
            this._complete();
            return;
        }
        this._complete();
    }
}
