// CompositeViewRenderer — the concrete `ViewRenderer` the sheet host
// receives at construction time (S40 / Phase 2C / ADR-0031).
//
// Dispatches each viewport.render call by viewId → ViewRegistry →
// ViewSource.  Composes the host's worldBounds with the per-viewport
// edit camera (so "activate viewport" pan/zoom appears immediately).
// Paints a "view loading" skeleton when the viewId is unknown.

import type {
  ViewRenderer,
  ViewportRenderRequest,
} from '../sheet-editor-host.js';
import type { Disposer } from '@pryzm/plugin-sdk';
import type { ViewRegistry } from './view-registry.js';
import type { ViewportEditController } from './viewport-edit-controller.js';
import {
  applyEditCamera,
  IDENTITY_EDIT_CAMERA,
  type EditCamera,
  type ViewSourceRequest,
} from './view-source.js';

const SKELETON_FILL = '#FAFAFA';
const SKELETON_STROKE = '#CCCCCC';
const SKELETON_TEXT = '#999999';

export interface CompositeViewRendererOptions {
  readonly registry: ViewRegistry;
  /** Optional — when omitted, every viewport renders with the identity
   *  edit camera (no in-sheet navigation). */
  readonly editController?: ViewportEditController;
}

export class CompositeViewRenderer implements ViewRenderer {
  private readonly registry: ViewRegistry;
  private readonly editController: ViewportEditController | undefined;

  constructor(opts: CompositeViewRendererOptions) {
    this.registry = opts.registry;
    this.editController = opts.editController;
  }

  renderViewport(ctx: CanvasRenderingContext2D, request: ViewportRenderRequest): void {
    const entry = this.registry.get(request.viewId);
    if (!entry) {
      this.paintSkeleton(ctx, request, `Loading view "${request.viewId}"…`);
      return;
    }

    const cam: EditCamera = this.editController
      ? this.editController.getEditCamera(request.viewportId)
      : IDENTITY_EDIT_CAMERA;

    const composedBounds = applyEditCamera(request.worldBounds, cam);
    const composedRequest: ViewportRenderRequest = {
      ...request,
      worldBounds: composedBounds,
    };

    const sourceReq: ViewSourceRequest = {
      ctx,
      viewport: composedRequest,
      editCamera: cam,
    };

    // The host already wraps this call in `try`; we don't double-catch.
    // Sources are responsible for their own internal save()/restore().
    entry.source(sourceReq);
  }

  /** S38 — fires whenever the registry signals a viewId has changed
   *  (model edit, source replaced, view added/removed).  The host wires
   *  this to a frame request. */
  subscribe(listener: (viewId: string) => void): Disposer {
    return this.registry.subscribe(listener);
  }

  // ── Loading skeleton ────────────────────────────────────────────────────

  private paintSkeleton(
    ctx: CanvasRenderingContext2D,
    req: ViewportRenderRequest,
    label: string,
  ): void {
    ctx.save();
    ctx.fillStyle = SKELETON_FILL;
    ctx.fillRect(0, 0, req.paperWidthMm, req.paperHeightMm);
    ctx.strokeStyle = SKELETON_STROKE;
    ctx.lineWidth = 0.25;
    // Diagonal "no-content" cross — Revit uses the same convention for
    // a viewport whose source isn't loaded yet.
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(req.paperWidthMm, req.paperHeightMm);
    ctx.moveTo(0, req.paperHeightMm); ctx.lineTo(req.paperWidthMm, 0);
    ctx.stroke();
    // Label — text MUST flip back to upright (the host inverted Y for
    // paper-up convention).
    ctx.save();
    ctx.scale(1, -1);
    ctx.fillStyle = SKELETON_TEXT;
    ctx.font = '4px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, req.paperWidthMm / 2, -req.paperHeightMm / 2);
    ctx.restore();
    ctx.restore();
  }
}
