/**
 * @file src/tools/operations/OperationToolBase.ts
 *
 * Abstract base class for all contextual editing operation tools.
 * Enforces consistent lifecycle, event cleanup, cursor management, and
 * escape-key cancellation across all eight operation tools.
 *
 * Subclasses implement:
 *   - get operationId(): OperationId
 *   - activate(elementId, elementType): void
 *   - (optionally) protected _onActivate(): void — additional setup
 *
 * CONTRACT §01 §2.1 — Tools never mutate stores directly. All mutations
 *                      go through commandManager.execute().
 * CONTRACT §04 §2   — Class A; abstract base only, no direct store access.
 *
 * Implementation plan reference: Phase A, Step 2
 * docs/SELECTION-TOOLBAR-TOOLS-IMPLEMENTATION-PLAN.md §3
 */

import type { OperationId } from './ElementCapabilities.js';

export interface ActiveElementContext {
    elementId:   string;
    elementType: string;
}

export abstract class OperationToolBase {
    protected _active  = false;
    protected _ctx:    ActiveElementContext | null = null;

    /** Bound event listeners registered while active — cleaned up on cancel/complete. */
    private readonly _listeners: Array<{ type: string; handler: EventListener; target: EventTarget }> = [];

    // ── Abstract API — subclasses must implement ─────────────────────────────

    abstract get operationId(): OperationId;

    /**
     * Start the operation for the given element.
     * Subclasses must call `super._baseActivate(elementId, elementType)` first,
     * then install their own step-specific listeners.
     */
    abstract activate(elementId: string, elementType: string): void;

    // ── Lifecycle helpers — call from subclass ───────────────────────────────

    /**
     * Sets up the active flag and context. Must be called at the top of
     * every subclass activate() implementation.
     */
    protected _baseActivate(elementId: string, elementType: string): void {
        if (this._active) this.cancel();   // clean up any previous session
        this._active = true;
        this._ctx    = { elementId, elementType };

        // Mark button as active in the toolbar
        this._dispatchStateChange(true);

        // Global Escape listener — cancels any active operation
        this._addListener('keydown', (e: Event) => {
            if ((e as KeyboardEvent).key === 'Escape') this.cancel();
        }, window);

        // External cancel-all broadcast (e.g. from SelectionOverlay Escape handler)
        this._addListener('bim-operation-cancel-all', () => this.cancel(), window);

        console.log(`[${this.constructor.name}] Activated for element: ${elementId} (${elementType})`);
    }

    /**
     * Cancels the current operation. Cleans up listeners, cursor, and instructions.
     * Safe to call even when not active.
     */
    cancel(): void {
        if (!this._active) return;
        this._active = false;
        this._ctx    = null;

        this._removeAllListeners();
        this._restoreCursor();
        this._hideInstructions();
        this._dispatchStateChange(false);

        window.dispatchEvent(new CustomEvent('bim-operation-cancelled', { // TODO(TASK-12)
            detail: { operationId: this.operationId },
        }));

        console.log(`[${this.constructor.name}] Cancelled`);
    }

    /**
     * Marks the operation as successfully completed.
     * Cleans up the same way as cancel() but dispatches a different event.
     */
    protected _complete(): void {
        this._active = false;
        this._ctx    = null;

        this._removeAllListeners();
        this._restoreCursor();
        this._hideInstructions();
        this._dispatchStateChange(false);

        window.dispatchEvent(new CustomEvent('bim-operation-completed', { // TODO(TASK-12)
            detail: { operationId: this.operationId },
        }));

        console.log(`[${this.constructor.name}] Completed`);
    }

    /** Free all resources. Call on engine teardown. */
    dispose(): void {
        if (this._active) this.cancel();
    }

    // ── Instruction bar helpers ──────────────────────────────────────────────

    /**
     * Shows a contextual instruction in the OperationModeOverlay.
     * Pass `null` to hide.
     */
    protected _showInstructions(msg: string | null): void {
        window.dispatchEvent(new CustomEvent('bim-operation-instructions', { // TODO(TASK-12)
            detail: { msg, operationId: this.operationId },
        }));
    }

    protected _hideInstructions(): void {
        this._showInstructions(null);
    }

    // ── Cursor helpers ───────────────────────────────────────────────────────

    protected _setCursor(cursor: string): void {
        document.body.style.cursor = cursor;
    }

    protected _restoreCursor(): void {
        document.body.style.cursor = '';
    }

    // ── Event listener management ────────────────────────────────────────────

    /**
     * Registers a listener that will be automatically removed when the
     * operation is cancelled or completed.
     */
    protected _addListener(
        type:    string,
        handler: EventListener,
        target:  EventTarget = window,
    ): void {
        target.addEventListener(type, handler);
        this._listeners.push({ type, handler, target });
    }

    private _removeAllListeners(): void {
        for (const { type, handler, target } of this._listeners) {
            target.removeEventListener(type, handler);
        }
        this._listeners.length = 0;
    }

    // ── Step counter helpers (for multi-step operations) ────────────────────

    /** Tracks which step the multi-step operation is currently on (0-indexed). */
    protected _step = 0;

    protected _nextStep(instructions: string): void {
        this._step++;
        this._showInstructions(instructions);
    }

    protected _resetStep(): void {
        this._step = 0;
    }

    // ── Private ──────────────────────────────────────────────────────────────

    private _dispatchStateChange(active: boolean): void {
        window.dispatchEvent(new CustomEvent('bim-operation-state-changed', { // TODO(TASK-12)
            detail: { operationId: this.operationId, active },
        }));
    }
}
