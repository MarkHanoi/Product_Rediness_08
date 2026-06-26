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
        // §OP-LISTEN-DEFER — clear any not-yet-attached deferred canvas listener
        // so a cancel/complete that lands before the defer fires cannot leak it.
        if (this._deferHandle !== null) {
            clearTimeout(this._deferHandle);
            this._deferHandle = null;
        }
        this._canvasClickHandler = null;
        for (const { type, handler, target } of this._listeners) {
            target.removeEventListener(type, handler);
        }
        this._listeners.length = 0;
    }

    // ── §OP-LISTEN-DEFER — canvas-click listener helpers ─────────────────────
    //
    // ROOT CAUSE (founder: "WITHOUT DOING ANYTHING THE WALLS CHANGE"): the very
    // pointer event that SELECTED wall A (and surfaced the contextual edit bar)
    // dispatches `bim-canvas-world-click` synchronously from the SelectionManager
    // pick path. A tool that attaches its `bim-canvas-world-click` listener
    // SYNCHRONOUSLY inside activate() therefore receives the *activating* click as
    // its "second pick" — the operation fires against whatever wall is under the
    // cursor before the user has deliberately clicked again. The SelectionManager
    // can additionally dispatch the same event up to three times for one physical
    // click (hover-anchor + GPU + BVH paths), so a naively-attached handler can
    // even double-fire its own state machine.
    //
    // FIX: never attach a canvas-click listener in the SAME task as activate().
    // `_addCanvasClickListener` defers the real attach to a macrotask (setTimeout
    // 0), which runs strictly AFTER the current event has finished dispatching —
    // so the activating click is gone by the time the listener exists. Tools also
    // pass the activating element id; a click whose `elementId` equals it is
    // ignored as residual selection noise. The handler is wrapped so the first
    // accepted invocation removes the listener immediately, making the triple
    // dispatch idempotent (one click ⇒ at most one accepted pick).

    /** Pending deferred-attach timer for the canvas-click listener (if any). */
    private _deferHandle: ReturnType<typeof setTimeout> | null = null;

    /** Currently-attached canvas-click handler, so it can be swapped/removed. */
    private _canvasClickHandler: EventListener | null = null;

    /**
     * Element id that triggered activation. A `bim-canvas-world-click` whose
     * `detail.elementId` equals this is treated as residual selection noise from
     * the activating click and is dropped (never delivered to the tool handler).
     */
    private _activatingElementId: string | null = null;

    /** Internal: build the wrapped listener with the auto-remove-on-consume guard. */
    private _wrapCanvasClickHandler(
        handler: (detail: { worldPoint?: unknown; elementId?: string | null; elementType?: string | null }) => boolean | void,
    ): EventListener {
        const wrapped: EventListener = (e: Event) => {
            const detail = (e as CustomEvent).detail ?? {};
            // Residual selection noise from the activating click — ignore.
            if (this._activatingElementId !== null && detail.elementId === this._activatingElementId) {
                return;
            }
            const consumed = handler(detail) === true;
            if (consumed && this._canvasClickHandler === wrapped) {
                // Auto-remove so the triple-dispatch (hover/GPU/BVH) for the SAME
                // physical click cannot re-enter the step.
                window.removeEventListener('bim-canvas-world-click', wrapped);
                const idx = this._listeners.findIndex(l => l.handler === wrapped);
                if (idx >= 0) this._listeners.splice(idx, 1);
                this._canvasClickHandler = null;
            }
        };
        return wrapped;
    }

    /**
     * Attach a `bim-canvas-world-click` listener that:
     *   - is installed on a later macrotask, so the activating click cannot reach it;
     *   - drops any event whose `elementId` matches the activating element;
     *   - is auto-removed the first time `handler` accepts the event (returns true),
     *     so the SelectionManager's multi-dispatch cannot fire the step twice.
     *
     * `handler` MUST return `true` when it consumed the click (advancing/finishing
     * the operation) and `false`/void when it ignored it (e.g. empty click), so a
     * rejected click does not tear down the listener prematurely.
     */
    protected _addCanvasClickListener(
        handler: (detail: { worldPoint?: unknown; elementId?: string | null; elementType?: string | null }) => boolean | void,
        opts: { ignoreElementId?: string | null } = {},
    ): void {
        this._activatingElementId = opts.ignoreElementId ?? null;
        const wrapped = this._wrapCanvasClickHandler(handler);
        // Defer the actual attach past the current event-loop tick so the click
        // that activated this tool is fully dispatched before the listener exists.
        this._deferHandle = setTimeout(() => {
            this._deferHandle = null;
            if (!this._active) return;            // cancelled before the defer ran
            this._canvasClickHandler = wrapped;
            this._addListener('bim-canvas-world-click', wrapped, window);
        }, 0);
    }

    /**
     * Replace the active canvas-click handler with `next` (multi-step tools call
     * this when advancing from one pick step to the next). The new handler keeps
     * the same auto-remove-on-consume + activating-element guard semantics.
     * Subsequent steps are already past the activating click, so this attaches
     * immediately (no defer) — only the FIRST listener needs the activation defer.
     */
    protected _swapCanvasClickListener(
        next: (detail: { worldPoint?: unknown; elementId?: string | null; elementType?: string | null }) => boolean | void,
        opts: { ignoreElementId?: string | null } = {},
    ): void {
        if (this._canvasClickHandler) {
            window.removeEventListener('bim-canvas-world-click', this._canvasClickHandler);
            const idx = this._listeners.findIndex(l => l.handler === this._canvasClickHandler);
            if (idx >= 0) this._listeners.splice(idx, 1);
            this._canvasClickHandler = null;
        }
        this._activatingElementId = opts.ignoreElementId ?? null;
        const wrapped = this._wrapCanvasClickHandler(next);
        this._canvasClickHandler = wrapped;
        this._addListener('bim-canvas-world-click', wrapped, window);
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
