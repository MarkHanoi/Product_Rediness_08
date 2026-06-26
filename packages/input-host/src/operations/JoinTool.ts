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

        // §OP-LISTEN-DEFER — the listener is attached on the NEXT macrotask (see
        // OperationToolBase) so the click that activated this tool cannot be
        // consumed as wall B, and clicks on wall A itself are ignored as residual
        // selection noise. The handler returns true ONLY when it actually picks a
        // distinct second wall, so an empty / wall-A / non-wall click does not tear
        // the listener down — the user can click again.
        this._addCanvasClickListener(
            (detail) => {
                const pickedId   = detail.elementId ?? null;
                const pickedType = detail.elementType ?? null;
                if (!pickedId) return false;                 // no element under cursor
                if (pickedType && pickedType !== 'wall') {
                    this._showInstructions('⚠ Only walls can be joined in Phase 1 — click a wall');
                    return false;
                }
                if (pickedId === this._wallAId) {
                    this._showInstructions('⚠ Cannot join a wall to itself — click a different wall');
                    return false;
                }
                return this._executeJoin(pickedId);
            },
            { ignoreElementId: this._wallAId },
        );
    }

    /** Returns true when the join consumed the click (succeeded OR errored on a real pick). */
    private _executeJoin(wallBId: string): boolean {
        const cmd = new JoinWallsCommand({ wallAId: this._wallAId, wallBId });
        const result = this._cmd.execute(cmd);
        if (!result.success) {
            const info = result.info?.[0] ?? 'Join failed';
            this._showError(info);
            // A real wall-B was picked; the operation is over (the user got an
            // explanatory toast). Consume the click so the tool deactivates rather
            // than silently waiting for another pick the user does not expect.
            this._complete();
            return true;
        }
        this._complete();
        return true;
    }

    private _showError(msg: string): void {
        window.dispatchEvent(new CustomEvent('bim-operation-error', { detail: { msg } })); // TODO(TASK-12)
    }
}
