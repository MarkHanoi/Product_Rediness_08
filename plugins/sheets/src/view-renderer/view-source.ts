// View source contract — what a sheet viewport's "live source" looks
// like (S40 / Phase 2C / ADR-0031).
//
// The `plugins/sheets` package MUST NOT import from `plugins/plan-view`,
// `plugins/section-view`, `packages/renderer`, etc. — those are L0
// kernels and Sheets is L1.  Instead, the orchestrator (`apps/web` or
// equivalent) registers a `ViewSource` callback per `viewId` that wraps
// the concrete kernel renderer.  This file defines the pure contract.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • A ViewSource is a single function: given a request, paint pixels.
//   No methods, no state — the orchestrator captures the renderer +
//   model state via closure when registering the source.
// • The ctx handed to the source is ALREADY clipped to the viewport
//   rect and translated so (0,0) = viewport bottom-left, with Y up.
//   The source MUST NOT escape that rect (the host's clip prevents
//   visual escape, but transform leaks would corrupt the next viewport).
// • The source is given the COMPOSED worldBounds — i.e. the host's
//   computed worldBounds with the user's per-viewport edit camera (pan
//   + zoom) applied.  The source therefore does not need to know about
//   "activate viewport" UX state — it just paints the world rect it's
//   handed.

import type { ViewportRenderRequest } from '../sheet-editor-host.js';

/** Subset of `View.kind` from `@pryzm/schemas` — kept inline here so this
 *  module stays L0 (no schema dependency). */
export type ViewKind =
  | 'plan'
  | 'rcp'
  | 'section'
  | 'elevation'
  | '3d'
  | 'detail'
  | 'drafting'
  | 'schedule';

export const VIEW_KINDS: readonly ViewKind[] = Object.freeze([
  'plan', 'rcp', 'section', 'elevation', '3d', 'detail', 'drafting', 'schedule',
]);

/** Per-viewport edit camera — represents the user's current "activate
 *  viewport" navigation state.  Identity when not navigating. */
export interface EditCamera {
  /** World-space pan applied to the viewport's worldBounds centre.
   *  Units = same as the source view's world units (mm for plan). */
  readonly panWorldX: number;
  readonly panWorldY: number;
  /** Multiplier on the worldBounds extents.  `2` zooms IN by 2× (the
   *  visible world rect halves); `0.5` zooms OUT by 2×.  MUST be > 0. */
  readonly zoom: number;
}

export const IDENTITY_EDIT_CAMERA: EditCamera = Object.freeze({
  panWorldX: 0,
  panWorldY: 0,
  zoom: 1,
});

/** Request handed to a ViewSource for a single render call. */
export interface ViewSourceRequest {
  /** Already clipped + translated ctx — see file header CONTRACT. */
  readonly ctx: CanvasRenderingContext2D;
  /** The viewport's request from the host, with worldBounds already
   *  composed with the per-viewport edit camera. */
  readonly viewport: ViewportRenderRequest;
  /** The raw edit camera (informational — the source doesn't need this
   *  to draw, but adapters that want to tweak line weights based on
   *  zoom level can read `editCamera.zoom`). */
  readonly editCamera: EditCamera;
}

/** A view source — paint the live model into the supplied ctx.  Throws
 *  iff the underlying kernel renderer throws; the host catches and
 *  paints "View render error" in that viewport. */
export type ViewSource = (req: ViewSourceRequest) => void;

/** Pure: apply an edit-camera (pan + zoom) to a worldBounds rectangle.
 *
 *  Pan is in WORLD units and shifts the visible rect's centre.
 *  Zoom > 1 narrows the rect (zoom in); zoom < 1 widens it (zoom out).
 *  Output rect has the same aspect ratio as the input. */
export function applyEditCamera(
  bounds: ViewportRenderRequest['worldBounds'],
  cam: EditCamera,
): ViewportRenderRequest['worldBounds'] {
  if (!Number.isFinite(cam.zoom) || cam.zoom <= 0) {
    throw new Error(`[view-source] EditCamera.zoom must be > 0 (got ${cam.zoom})`);
  }
  const w = bounds.worldWidth / cam.zoom;
  const h = bounds.worldHeight / cam.zoom;
  // Centre of the original bounds shifted by the world-pan.
  const cx = bounds.worldX + bounds.worldWidth / 2 + cam.panWorldX;
  const cy = bounds.worldY + bounds.worldHeight / 2 + cam.panWorldY;
  return Object.freeze({
    worldX: cx - w / 2,
    worldY: cy - h / 2,
    worldWidth: w,
    worldHeight: h,
  });
}
