/**
 * @file src/tools/operations/CopyPasteTool.ts
 *
 * Singleton clipboard manager for Copy + Paste operations.
 *
 * Design (per implementation plan §6.4):
 *   - copy()  → captures a deep-clone snapshot of the element; dispatches
 *               bim-clipboard-updated so the toolbar can show "Paste" as active.
 *   - paste() → enters placement mode (cursor = crosshair); the next
 *               bim-canvas-world-click fires CopyElementCommand with an offset
 *               from the source midpoint to the picked position.
 *   - activate() → alias for copy(); used by the SelectionOverlay button.
 *
 * Phase 1: wall elements only.  Cross-level paste is rejected by canExecute().
 *
 * Contract:
 *   §01 §2.1  — mutations via commandManager.execute() only
 *   §01 §2.6  — newId generated at Tool layer, passed to command
 *   §04 §2    — Tool layer
 */

import { OperationToolBase } from './OperationToolBase.js';
import type { OperationId } from './ElementCapabilities.js';
import { CopyElementCommand } from '@pryzm/command-registry';
import type { CommandManager } from '@pryzm/command-registry';
import type { Point3D } from '@pryzm/core-app-model';

interface ClipboardEntry {
    elementId:   string;
    elementType: string;
    /** XZ midpoint of the source element at copy time (used to compute paste offset). */
    sourceMidXZ: { x: number; z: number };
}

export class CopyPasteTool extends OperationToolBase {
    get operationId(): OperationId { return 'copy'; }

    private _clipboard: ClipboardEntry | null = null;
    private _inPasteMode = false;

    constructor(private readonly _cmd: CommandManager) {
        super();
    }

    /**
     * Called by the toolbar "Copy" button.
     * Captures a clipboard entry for the currently selected element.
     */
    activate(elementId: string, elementType: string): void {
        this.copy(elementId, elementType);
    }

    copy(elementId: string, elementType: string): void {
        const normType = (elementType ?? '').toLowerCase();
        let mx: number | undefined;
        let mz: number | undefined;

        if (normType === 'furniture') {
            // Furniture: midpoint is just the stored position (XZ).
            const fStore = window.furnitureStore; // TODO(TASK-08)
            const f      = fStore?.get?.(elementId);
            if (!f) {
                console.warn('[CopyPasteTool] Cannot copy — furniture not found:', elementId);
                return;
            }
            mx = f.position?.x ?? 0;
            mz = f.position?.z ?? 0;
        } else {
            // Walls: midpoint of the baseline.
            const wallStore = window.wallStore; // TODO(TASK-08)
            const wall      = wallStore?.getById?.(elementId);
            if (!wall) {
                console.warn('[CopyPasteTool] Cannot copy — element not found:', elementId);
                return;
            }
            mx = (wall.baseLine[0].x + wall.baseLine[1].x) / 2;
            mz = (wall.baseLine[0].z + wall.baseLine[1].z) / 2;
        }

        this._clipboard = {
            elementId,
            elementType,
            sourceMidXZ: { x: mx!, z: mz! },
        };

        window.dispatchEvent(new CustomEvent('bim-clipboard-updated', { // TODO(TASK-12)
            detail: { hasContent: true, elementType },
        }));

        this._showInstructions('Copied — press Ctrl+V or click Paste to place');
        setTimeout(() => { if (!this._inPasteMode) this._hideInstructions(); }, 3000);

        console.log('[CopyPasteTool] Copied element', elementId, '(', elementType, ')');
    }

    paste(): void {
        if (!this._clipboard) {
            this._showInstructions('⚠ Nothing in clipboard — copy an element first');
            setTimeout(() => this._hideInstructions(), 2500);
            return;
        }

        this._inPasteMode = true;
        this._setCursor('crosshair');
        this._showInstructions('Click to place the copy — same level only — Esc to cancel');

        const onEscape = (e: Event) => {
            if ((e as KeyboardEvent).key === 'Escape') {
                this._endPasteMode();
            }
        };
        window.addEventListener('keydown', onEscape);

        const onPlace = (e: Event) => {
            const { worldPoint } = (e as CustomEvent).detail ?? {};
            if (!worldPoint) return;
            this._executePaste(worldPoint as Point3D);
            window.removeEventListener('keydown', onEscape);
            window.removeEventListener('bim-canvas-world-click', onPlace);
        };

        window.addEventListener('bim-canvas-world-click', onPlace);
    }

    /** True if there is something in the clipboard. */
    get hasClipboard(): boolean {
        return this._clipboard !== null;
    }

    private _executePaste(targetPoint: Point3D): void {
        if (!this._clipboard) return;
        const { elementId, elementType, sourceMidXZ } = this._clipboard;

        const offset = {
            x: targetPoint.x - sourceMidXZ.x,
            y: 0,
            z: targetPoint.z - sourceMidXZ.z,
        };

        const newId  = crypto.randomUUID();
        const isFurn = (elementType ?? '').toLowerCase() === 'furniture';
        const cmd    = new CopyElementCommand({
            sourceId: elementId,
            newId,
            offset,
            elementType: isFurn ? 'furniture' : 'wall',
        });
        const result = this._cmd.execute(cmd);

        if (!result.success) {
            const info = result.info?.[0] ?? 'Paste failed';
            window.dispatchEvent(new CustomEvent('bim-operation-error', { detail: { msg: info } })); // TODO(TASK-12)
        }

        this._endPasteMode();
    }

    private _endPasteMode(): void {
        this._inPasteMode = false;
        this._restoreCursor();
        this._hideInstructions();
    }

    cancel(): void {
        this._endPasteMode();
        super.cancel();
    }
}
