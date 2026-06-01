// selection — plan-view click → CommandBus dispatch (G9).
//
// Spec: `phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md` §S33 G9 (lines 680–727):
//   "Selection in plan view doesn't update 3D selection.  Fix:
//    plan-view/selection.ts — selection dispatches to SelectionStore."
//
// Subordinate ADR: `docs/02-decisions/adrs/0025-plan-view-svp-parity-contract-44.md`.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • The class owns no selection state — selection is the SelectionStore's
//   responsibility (single source of truth across views).
// • Click dispatches `selection.select` with `mode: 'add'` (shift) or
//   `mode: 'replace'` (no modifier).
// • Click on empty world dispatches `selection.clear`.
// • Hover triggers a `'plan-hover-change'` frame request via the
//   FrameScheduler (so the renderer can paint a hover ring) — purely
//   visual; no command is dispatched on hover.
// • dispose() removes both DOM listeners and forgets the canvas.
//
// We type the bus loosely as `PlanCommandBus` so plan-view stays decoupled
// from `@pryzm/command-bus` (which would be a heavy dep for this plugin
// — the host wires in the real bus).

import type { PlanCamera } from './PlanCamera.js';
import type { PlanFrameScheduler } from './drag.js';

/**
 * Resolves a world-space (x, z) point to an element id, or `null` if
 * nothing is hit.  Built by `buildPlanHitTest`.
 */
export type HitTestFn = (worldX: number, worldZ: number) => string | null;

/**
 * Resolves an element id to its `SelectionKind` (e.g. `'wall'`).  The
 * `selection.select` payload requires it.  When the element id is
 * unknown, return `undefined` and the click will be ignored (defence-
 * in-depth — never dispatch a malformed command).
 */
export type ElementKindLookup = (elementId: string) => string | undefined;

/** Loose CommandBus shape — keeps cross-package coupling thin. */
export interface PlanCommandBus {
  executeCommand<T>(type: string, payload: T): Promise<unknown>;
}

export interface PlanViewSelectionOptions {
  readonly canvas: HTMLCanvasElement;
  readonly camera: PlanCamera;
  readonly scheduler: PlanFrameScheduler;
  readonly commandBus: PlanCommandBus;
  readonly hitTest: HitTestFn;
  readonly elementKindLookup: ElementKindLookup;
  /** Optional sink for unhandled async dispatch errors.  Defaults to
   *  `console.error` so we never silently swallow a bus rejection. */
  readonly onError?: (err: unknown) => void;
}

/**
 * Wires plan-view click + pointermove events to selection commands.
 * Construct once per host mount; call `dispose()` on host unmount.
 */
export class PlanViewSelection {
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: PlanCamera;
  private readonly scheduler: PlanFrameScheduler;
  private readonly commandBus: PlanCommandBus;
  private readonly hitTest: HitTestFn;
  private readonly elementKindLookup: ElementKindLookup;
  private readonly onError: (err: unknown) => void;
  private hoveredId: string | null = null;
  private disposed = false;

  // Bound listener handles (referenced by removeEventListener on dispose).
  private readonly clickHandler: (e: MouseEvent) => void;
  private readonly moveHandler: (e: MouseEvent) => void;

  constructor(opts: PlanViewSelectionOptions) {
    this.canvas = opts.canvas;
    this.camera = opts.camera;
    this.scheduler = opts.scheduler;
    this.commandBus = opts.commandBus;
    this.hitTest = opts.hitTest;
    this.elementKindLookup = opts.elementKindLookup;
    this.onError = opts.onError ?? ((err) => {
      // eslint-disable-next-line no-console
      console.error('[PlanViewSelection] command bus rejected:', err);
    });

    this.clickHandler = this.onClick.bind(this);
    this.moveHandler = this.onPointerMove.bind(this);
    this.canvas.addEventListener('click', this.clickHandler);
    this.canvas.addEventListener('pointermove', this.moveHandler);
  }

  /** Currently-hovered element id (null when over empty world). */
  get hovered(): string | null {
    return this.hoveredId;
  }

  /** Tear down DOM listeners.  Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.canvas.removeEventListener('click', this.clickHandler);
    this.canvas.removeEventListener('pointermove', this.moveHandler);
    this.disposed = true;
    this.hoveredId = null;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private onClick(e: MouseEvent): void {
    if (this.disposed) return;
    const { x, z } = this.camera.screenToWorld(e.offsetX, e.offsetY);
    const elementId = this.hitTest(x, z);

    if (elementId) {
      const kind = this.elementKindLookup(elementId);
      if (!kind) return; // unknown id — drop silently (test asserts no dispatch)
      this.dispatch('selection.select', {
        targets: [{ id: elementId, kind }],
        mode: e.shiftKey ? 'add' : 'replace',
      });
    } else {
      this.dispatch('selection.clear', {});
    }
  }

  private onPointerMove(e: MouseEvent): void {
    if (this.disposed) return;
    const { x, z } = this.camera.screenToWorld(e.offsetX, e.offsetY);
    const newHovered = this.hitTest(x, z);
    if (newHovered !== this.hoveredId) {
      this.hoveredId = newHovered;
      this.scheduler.requestFrame('plan-hover-change');
    }
  }

  private dispatch<T>(type: string, payload: T): void {
    let promise: Promise<unknown>;
    try {
      promise = this.commandBus.executeCommand(type, payload);
    } catch (err) {
      this.onError(err);
      return;
    }
    promise.catch(this.onError);
  }
}
