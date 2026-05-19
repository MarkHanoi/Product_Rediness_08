/**
 * @file src/tools/operations/JoinTool.ts
 *
 * One-step operation: the already-selected element is wall A; the user clicks
 * a second wall (wall B) and the join is executed immediately.
 *
 * Interaction flow:
 *   1. SelectionOverlay calls activate(wallAId, elementType)
 *   2. Instruction: "Click the second wall to join with"
 *   3. User clicks a wall in the viewport → bim-canvas-world-click fires
 *   4. JoinWallsCommand executed with (wallAId, wallBId)
 *
 * Contract:
 *   §01 §2.1 — no direct store writes; all mutations via commandManager.execute()
 *   §04 §2   — Tool layer; no store imports, no builder calls
 */

import { OperationToolBase } from './OperationToolBase.js';
import type { OperationId } from './ElementCapabilities.js';
import { JoinWallsCommand } from '@pryzm/command-registry';
import type { CommandManager } from '@pryzm/command-registry';

export class JoinTool extends OperationToolBase {
    get operationId(): OperationId { return 'join'; }

    private _wallAId = '';

    constructor(private readonly _cmd: CommandManager) {
        super();
    }

    activate(elementId: string, elementType: string): void {
        this._baseActivate(elementId, elementType);
        this._wallAId = elementId;
        this._setCursor('crosshair');
        this._showInstructions('Click the second wall to join with — Esc to cancel');

        const handler = (e: Event) => {
            const { elementId: pickedId, elementType: pickedType } = (e as CustomEvent).detail ?? {};
            if (!pickedId) return;                          // no element under cursor
            if (pickedType && pickedType !== 'wall') {
                this._showInstructions('⚠ Only walls can be joined in Phase 1 — click a wall');
                return;
            }
            if (pickedId === this._wallAId) {
                this._showInstructions('⚠ Cannot join a wall to itself — click a different wall');
                return;
            }
            this._executeJoin(pickedId);
        };

        this._addListener('bim-canvas-world-click', handler as EventListener, window);
    }

    private _executeJoin(wallBId: string): void {
        const cmd = new JoinWallsCommand({ wallAId: this._wallAId, wallBId });
        const result = this._cmd.execute(cmd);
        if (!result.success) {
            const info = result.info?.[0] ?? 'Join failed';
            this._showError(info);
            return;
        }
        this._complete();
    }

    private _showError(msg: string): void {
        window.dispatchEvent(new CustomEvent('bim-operation-error', { detail: { msg } })); // TODO(TASK-12)
    }
}
