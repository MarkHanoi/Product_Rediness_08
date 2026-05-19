// Viewport edit controller — the "activate viewport" navigation state
// (S40 / Phase 2C).
//
// In Revit, double-clicking a viewport "activates" it: the user can
// then pan/zoom INSIDE the viewport while the rest of the sheet stays
// put.  This module owns the per-viewport edit camera (pan + zoom) and
// the active-viewport id.  Pure: no DOM, no command bus.  The UI layer
// translates pointer gestures into `pan(...)` / `zoom(...)` calls and
// optionally commits to persistent `clippingBox` via the
// `sheet.setViewportClippingBox` handler on gesture-end.

import type { Disposer } from '@pryzm/plugin-sdk';
import {
  IDENTITY_EDIT_CAMERA,
  type EditCamera,
} from './view-source.js';

export interface ViewportEditControllerOptions {
  /** Min zoom the user can navigate to (zoom < 1 = zoomed out).  10× is
   *  the Revit default cap. */
  readonly minZoom?: number;
  /** Max zoom the user can navigate to (zoom > 1 = zoomed in). */
  readonly maxZoom?: number;
}

export class ViewportEditController {
  private active: string | null = null;
  private readonly cameras = new Map<string, EditCamera>();
  private readonly listeners = new Set<(viewportId: string | null) => void>();
  private readonly minZoom: number;
  private readonly maxZoom: number;

  constructor(opts: ViewportEditControllerOptions = {}) {
    this.minZoom = opts.minZoom ?? 0.1;
    this.maxZoom = opts.maxZoom ?? 10;
    if (this.minZoom <= 0 || !Number.isFinite(this.minZoom)) {
      throw new Error(`[ViewportEditController] minZoom must be > 0 (got ${this.minZoom})`);
    }
    if (this.maxZoom <= this.minZoom) {
      throw new Error(`[ViewportEditController] maxZoom must be > minZoom (${this.maxZoom} <= ${this.minZoom})`);
    }
  }

  // ── Active-viewport selection ───────────────────────────────────────────

  /** Returns the id of the currently activated viewport, or null when
   *  the user is in normal "sheet space" mode. */
  getActiveViewportId(): string | null {
    return this.active;
  }

  /** Enter "activate viewport" mode for `viewportId`.  Pass null to
   *  exit.  Fires the active-change listeners. */
  setActiveViewport(viewportId: string | null): void {
    if (viewportId === this.active) return;
    this.active = viewportId;
    this.fireActiveChange();
  }

  /** Subscribe to active-viewport changes.  Returns a disposer. */
  onActiveChanged(listener: (viewportId: string | null) => void): Disposer {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  // ── Per-viewport edit camera ────────────────────────────────────────────

  /** Returns the current edit camera for the viewport.  Defaults to
   *  identity (no pan, zoom = 1) when the user has never navigated
   *  inside this viewport. */
  getEditCamera(viewportId: string): EditCamera {
    return this.cameras.get(viewportId) ?? IDENTITY_EDIT_CAMERA;
  }

  /** Replace the edit camera for the viewport.  Pan deltas come from
   *  `pan()`/`zoom()`; this lower-level setter is for restoring state
   *  from the persisted clippingBox after a sheet open. */
  setEditCamera(viewportId: string, cam: EditCamera): void {
    this.cameras.set(viewportId, this.clamp(cam));
  }

  /** Pan the active viewport's edit camera by world-space deltas.  No-op
   *  when no viewport is active (so stray gestures outside an activated
   *  viewport don't accidentally pan a random viewport). */
  pan(deltaWorldX: number, deltaWorldY: number): void {
    if (this.active === null) return;
    const cur = this.getEditCamera(this.active);
    this.cameras.set(this.active, this.clamp({
      panWorldX: cur.panWorldX + deltaWorldX,
      panWorldY: cur.panWorldY + deltaWorldY,
      zoom: cur.zoom,
    }));
  }

  /** Multiply the active viewport's edit camera zoom by `factor`.
   *  `factor > 1` zooms in; `factor < 1` zooms out.  No-op when no
   *  viewport is active. */
  zoom(factor: number): void {
    if (this.active === null) return;
    if (!Number.isFinite(factor) || factor <= 0) {
      throw new Error(`[ViewportEditController] zoom factor must be > 0 (got ${factor})`);
    }
    const cur = this.getEditCamera(this.active);
    this.cameras.set(this.active, this.clamp({
      panWorldX: cur.panWorldX,
      panWorldY: cur.panWorldY,
      zoom: cur.zoom * factor,
    }));
  }

  /** Reset the active viewport's edit camera to identity ("fit view"
   *  inside the viewport's nominal worldBounds).  No-op when no
   *  viewport is active. */
  resetActive(): void {
    if (this.active !== null) this.cameras.delete(this.active);
  }

  /** Reset every viewport's edit camera. */
  resetAll(): void {
    this.cameras.clear();
  }

  /** Drop a viewport's saved camera — call when a viewport is removed
   *  from the sheet so the controller doesn't leak per-deleted-viewport
   *  state. */
  forgetViewport(viewportId: string): void {
    this.cameras.delete(viewportId);
    if (this.active === viewportId) this.setActiveViewport(null);
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private clamp(cam: EditCamera): EditCamera {
    const z = Math.min(this.maxZoom, Math.max(this.minZoom, cam.zoom));
    return Object.freeze({ ...cam, zoom: z });
  }

  private fireActiveChange(): void {
    for (const l of this.listeners) {
      try { l(this.active); }
      catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[ViewportEditController] listener threw', err);
      }
    }
  }
}
