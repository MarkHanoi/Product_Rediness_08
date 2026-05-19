// drag — plan-view drag → MoveElement commands (G10).
//
// Spec: `phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md` §S33 G10 (lines 731–786):
//   "Drag in plan view does not create commands (data lost on reload).
//    Fix: plan-view/drag.ts — drag dispatches `MoveElement` commands."
//
// Subordinate ADR: `docs/architecture/adr/0025-plan-view-svp-parity-contract-44.md`.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • pointerdown on a SELECTED element starts a drag (caller decides
//   "selected" via the supplied SelectionStore lookup).
// • pointermove past the 3 px screen-space threshold begins live preview:
//     `commandBus.executeCommand('element.move.preview', { ... })`
//   The preview command is intentionally ephemeral — handlers SHOULD NOT
//   push it to the undo stack.
// • pointerup commits with `element.move`:
//     `commandBus.executeCommand('element.move', { ... })`
//   The persisted command is what undo / redo / sync replay see.  If
//   the drag never crossed the threshold, no persisted command fires
//   (a click is not a drag).
// • dispose() removes DOM listeners and releases pointer capture.
//
// HOST WIRING
// ─────────────────────────────────────────────────────────────────────────────
// The host supplies `getElementPosition(id)` so the drag can stamp
// `originalPosition` once at pointerdown.  It also supplies `hitTest`
// (which need NOT be limited to selected elements — the drag filters
// to selected via `selectedIdsLookup`).

import type { PlanCamera } from './PlanCamera.js';
import type { PlanCommandBus } from './selection.js';

/** Minimal frame-scheduler shape — `requestFrame(reason)` is all we need. */
export interface PlanFrameScheduler {
  requestFrame(reason: string): void;
}

/** Returns `true` iff the element id is currently selected. */
export type SelectedIdsLookup = (elementId: string) => boolean;

/** Returns the world-space position of an element (anchor for the move). */
export type ElementPositionLookup = (elementId: string) =>
  | { readonly x: number; readonly y: number; readonly z: number }
  | undefined;

/** 2D point-in-element hit-test, identical signature to selection.ts. */
export type HitTestFn = (worldX: number, worldZ: number) => string | null;

export interface PlanViewDragOptions {
  readonly canvas: HTMLCanvasElement;
  readonly camera: PlanCamera;
  readonly commandBus: PlanCommandBus;
  readonly hitTest: HitTestFn;
  readonly selectedIdsLookup: SelectedIdsLookup;
  readonly elementPositionLookup: ElementPositionLookup;
  /** Drag threshold in CSS pixels.  Default 3 px — under this distance,
   *  the gesture is treated as a click (no `element.move` is dispatched). */
  readonly dragThresholdPx?: number;
  readonly onError?: (err: unknown) => void;
}

interface DragTarget {
  readonly elementId: string;
  readonly originalPosition: { readonly x: number; readonly y: number; readonly z: number };
  readonly downScreenX: number;
  readonly downScreenY: number;
  readonly pointerId: number;
}

export class PlanViewDrag {
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: PlanCamera;
  private readonly commandBus: PlanCommandBus;
  private readonly hitTest: HitTestFn;
  private readonly selectedIdsLookup: SelectedIdsLookup;
  private readonly elementPositionLookup: ElementPositionLookup;
  private readonly dragThresholdPx: number;
  private readonly onError: (err: unknown) => void;
  private dragTarget: DragTarget | null = null;
  private isDragging = false;
  private disposed = false;

  private readonly downHandler: (e: PointerEvent) => void;
  private readonly moveHandler: (e: PointerEvent) => void;
  private readonly upHandler: (e: PointerEvent) => void;

  constructor(opts: PlanViewDragOptions) {
    this.canvas = opts.canvas;
    this.camera = opts.camera;
    this.commandBus = opts.commandBus;
    this.hitTest = opts.hitTest;
    this.selectedIdsLookup = opts.selectedIdsLookup;
    this.elementPositionLookup = opts.elementPositionLookup;
    this.dragThresholdPx = opts.dragThresholdPx ?? 3;
    this.onError = opts.onError ?? ((err) => {
      // eslint-disable-next-line no-console
      console.error('[PlanViewDrag] command bus rejected:', err);
    });

    this.downHandler = this.onPointerDown.bind(this);
    this.moveHandler = this.onPointerMove.bind(this);
    this.upHandler = this.onPointerUp.bind(this);

    this.canvas.addEventListener('pointerdown', this.downHandler);
    this.canvas.addEventListener('pointermove', this.moveHandler);
    this.canvas.addEventListener('pointerup', this.upHandler);
    this.canvas.addEventListener('pointercancel', this.upHandler);
  }

  /** Currently-active drag target id, or `null` when not dragging. */
  get activeTargetId(): string | null {
    return this.dragTarget?.elementId ?? null;
  }

  /** Has the drag passed the threshold (i.e. is this an actual drag, not a click)? */
  get hasMoved(): boolean {
    return this.isDragging;
  }

  dispose(): void {
    if (this.disposed) return;
    this.canvas.removeEventListener('pointerdown', this.downHandler);
    this.canvas.removeEventListener('pointermove', this.moveHandler);
    this.canvas.removeEventListener('pointerup', this.upHandler);
    this.canvas.removeEventListener('pointercancel', this.upHandler);
    if (this.dragTarget) this.releasePointerCapture(this.dragTarget.pointerId);
    this.dragTarget = null;
    this.isDragging = false;
    this.disposed = true;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private onPointerDown(e: PointerEvent): void {
    if (this.disposed || this.dragTarget) return;
    const { x, z } = this.camera.screenToWorld(e.offsetX, e.offsetY);
    const elementId = this.hitTest(x, z);
    if (!elementId) return;
    if (!this.selectedIdsLookup(elementId)) return;
    const originalPosition = this.elementPositionLookup(elementId);
    if (!originalPosition) return;
    this.dragTarget = {
      elementId,
      originalPosition,
      downScreenX: e.offsetX,
      downScreenY: e.offsetY,
      pointerId: e.pointerId,
    };
    try {
      this.canvas.setPointerCapture?.(e.pointerId);
    } catch {
      // setPointerCapture can throw under jsdom — non-fatal.
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.disposed || !this.dragTarget) return;
    if (!this.isDragging) {
      const dx = e.offsetX - this.dragTarget.downScreenX;
      const dy = e.offsetY - this.dragTarget.downScreenY;
      if (Math.hypot(dx, dy) < this.dragThresholdPx) return;
      this.isDragging = true;
    }
    const { x, z } = this.camera.screenToWorld(e.offsetX, e.offsetY);
    this.dispatch('element.move.preview', {
      elementId: this.dragTarget.elementId,
      toX: x,
      toY: this.dragTarget.originalPosition.y,
      toZ: z,
      ephemeral: true,
    });
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.disposed || !this.dragTarget) return;
    const target = this.dragTarget;
    const wasDragging = this.isDragging;
    // Reset state BEFORE dispatch so a re-entrant pointerdown is safe.
    this.dragTarget = null;
    this.isDragging = false;
    this.releasePointerCapture(e.pointerId);

    if (wasDragging) {
      const { x, z } = this.camera.screenToWorld(e.offsetX, e.offsetY);
      this.dispatch('element.move', {
        elementId: target.elementId,
        fromX: target.originalPosition.x,
        fromY: target.originalPosition.y,
        fromZ: target.originalPosition.z,
        toX: x,
        toY: target.originalPosition.y,
        toZ: z,
      });
    }
  }

  private releasePointerCapture(pointerId: number): void {
    try {
      if (this.canvas.hasPointerCapture?.(pointerId)) {
        this.canvas.releasePointerCapture?.(pointerId);
      }
    } catch {
      // jsdom — non-fatal.
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
