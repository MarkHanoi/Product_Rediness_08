// SelectionTool — pointer-driven element selection (S16 / ADR-0015).
//
// C1: Switched from `pointerdown` to `click` for mouse devices.
//     `pointerdown` fires at the START of a gesture — on a camera orbit
//     (pointerdown + drag + pointerup) it fires immediately, making every
//     orbit look like a selection attempt.  `click` fires only when pointer
//     down + up occur at the same position (browser guarantees this), so
//     camera drags and selection are naturally separated.
//
//     Touch devices use `pointerup` as a fallback because `click` may fire
//     with a 300 ms delay on mobile browsers, degrading responsiveness.
//     A `pointerType !== 'mouse'` guard in the pointerup handler ensures
//     the same gesture is never handled twice on hybrid (stylus/touch/mouse)
//     devices.
//
// C2: SelectionCommandBus is now typed with overloaded signatures for the
//     concrete command types the tool dispatches.  This ensures payload
//     shapes are verified at compile time rather than relying on the generic
//     `executeCommand<T>(type: string, payload: T)` overload.
//
// Behaviour (unchanged externally):
//   - Single click   → dispatch selection.select (replace mode)
//   - Shift+click    → dispatch selection.select (add mode)
//   - Click on empty → dispatch selection.clear
//   - Escape         → dispatch selection.clear

// ── Exported types ────────────────────────────────────────────────────────────

/** Minimal hit-test result returned by the host's hit-test function. */
export interface HitTarget {
  readonly id: string;
  /** Element kind: 'wall', 'door', 'slab', etc. */
  readonly kind: string;
}

/** Payload for the `selection.select` command. */
export interface SelectionSelectPayload {
  readonly targets: ReadonlyArray<HitTarget>;
  readonly mode: 'replace' | 'add';
}

/** Payload for the `selection.clear` command. */
export interface SelectionClearPayload {
  /** Informational hint for telemetry / undo-stack labelling. */
  readonly reason?: 'click' | 'keyboard' | 'programmatic';
}

/**
 * C2: Typed CommandBus interface — concrete overloads for the two command
 * types this tool dispatches plus a generic catch-all for extensibility.
 */
export interface SelectionCommandBus {
  executeCommand(type: 'selection.select', payload: SelectionSelectPayload): Promise<unknown>;
  executeCommand(type: 'selection.clear', payload: SelectionClearPayload): Promise<unknown>;
  executeCommand(type: string, payload: unknown): Promise<unknown>;
}

/** Host-injected hit-test function: canvas pixel → element or null. */
export type HitTestFn = (
  offsetX: number,
  offsetY: number,
) => HitTarget | null;

export interface SelectionToolOptions {
  readonly canvas: HTMLCanvasElement;
  readonly commandBus: SelectionCommandBus;
  readonly hitTest: HitTestFn;
  readonly onError?: (err: unknown) => void;
}

// ── SelectionTool ─────────────────────────────────────────────────────────────

/**
 * View-agnostic pointer tool that translates canvas clicks into selection
 * commands dispatched through the injected command bus.
 *
 * @example
 * ```ts
 * const tool = new SelectionTool({
 *   canvas: renderer.domElement,
 *   commandBus: myBus,
 *   hitTest: (x, y) => gpuPick(x, y),
 * });
 * // …later…
 * tool.dispose();
 * ```
 */
export class SelectionTool {
  private readonly canvas: HTMLCanvasElement;
  private readonly commandBus: SelectionCommandBus;
  private readonly hitTest: HitTestFn;
  private readonly onError: (err: unknown) => void;
  private disposed = false;

  // C1: Separate handlers for mouse (click) and touch/stylus (pointerup).
  private readonly clickHandler:    (e: MouseEvent)   => void;
  private readonly pointerUpHandler:(e: PointerEvent) => void;
  private readonly keyDownHandler:  (e: KeyboardEvent) => void;

  constructor(opts: SelectionToolOptions) {
    this.canvas       = opts.canvas;
    this.commandBus   = opts.commandBus;
    this.hitTest      = opts.hitTest;
    this.onError      = opts.onError ?? ((err) => {
      console.error('[SelectionTool] error:', err);
    });

    this.clickHandler     = this.onClick.bind(this);
    this.pointerUpHandler = this.onPointerUp.bind(this);
    this.keyDownHandler   = this.onKeyDown.bind(this);

    // `click` handles mouse: fires after full press-release cycle at same
    // position, so camera-orbit gestures (drag) are never misinterpreted.
    this.canvas.addEventListener('click', this.clickHandler);

    // `pointerup` handles touch/stylus: `click` fires 300 ms late on mobile.
    // The guard in onPointerUp skips mouse events to avoid double-firing.
    this.canvas.addEventListener('pointerup', this.pointerUpHandler);

    window.addEventListener('keydown', this.keyDownHandler);
  }

  dispose(): void {
    if (this.disposed) return;
    this.canvas.removeEventListener('click', this.clickHandler);
    this.canvas.removeEventListener('pointerup', this.pointerUpHandler);
    window.removeEventListener('keydown', this.keyDownHandler);
    this.disposed = true;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /** Shared selection logic; called by both onClick and onPointerUp. */
  private handleHit(offsetX: number, offsetY: number, shift: boolean): void {
    const hit = this.hitTest(offsetX, offsetY);
    if (!hit) {
      this.commandBus
        .executeCommand('selection.clear', { reason: 'click' })
        .catch(this.onError);
      return;
    }
    const mode: 'add' | 'replace' = shift ? 'add' : 'replace';
    this.commandBus
      .executeCommand('selection.select', { targets: [hit], mode })
      .catch(this.onError);
  }

  /** Handles mouse clicks (left button only). */
  private onClick(e: MouseEvent): void {
    if (this.disposed) return;
    if (e.button !== 0) return; // left button only
    this.handleHit(e.offsetX, e.offsetY, e.shiftKey);
  }

  /**
   * Touch / stylus fallback.
   * Skips mouse events — those are already handled by `click` above.
   * This prevents the same gesture from being processed twice on hybrid
   * devices (e.g. Surface Pro: touch finger + move to mouse).
   */
  private onPointerUp(e: PointerEvent): void {
    if (this.disposed || e.pointerType === 'mouse') return;
    this.handleHit(e.offsetX, e.offsetY, e.shiftKey);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.disposed) return;
    if (e.key === 'Escape') {
      this.commandBus
        .executeCommand('selection.clear', { reason: 'keyboard' })
        .catch(this.onError);
    }
  }
}
