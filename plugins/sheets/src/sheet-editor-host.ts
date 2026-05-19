// SheetEditorHost — Canvas2D host for the sheet editor (S37 / ADR-0031 /
// Phase 2C).
//
// Spec: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S37 lines
// 134–243 ("Implementation Detail — sheet-editor-host.ts").
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Subclass of the existing `CanvasHost` base (`plugins/plan-view/
//   src/CanvasHost.ts`).  The spec references `@pryzm/ui/CanvasHost`
//   but no such package exists today — the plan-view file's header
//   explicitly notes that file is the live stand-in until promotion.
// • Pure data flow: sheet store + active-sheet store + LIVE view
//   renderer in; pixels out.  No Cesium, no THREE, no DOM beyond the
//   canvas the base class manages.
//
// VIEWPORTS ARE LIVE (S38 update — Revit-style) ──────────────────────────────
// Viewports are NOT bitmap snapshots/thumbnails of a view.  They are
// live windows: each frame, the host hands the supplied `ViewRenderer`
// a 2D context already clipped + translated to the viewport's paper-
// mm rect plus a `ViewportRenderRequest` (worldBounds + scale + size).
// The renderer draws the LIVE model into that rect, against the model's
// current state.  When the underlying model changes, the renderer's
// `subscribe` listener fires the per-view dirty signal and the host
// requests a re-render.  This matches Revit's semantics: edits to the
// model immediately update every sheet that embeds the affected view.
//
// Render pipeline (one frame):
//   1. clear → set transform identity, clearRect(0, 0, w, h)
//   2. paper space → translate(0, h), scale(1, -1), then apply camera
//      so paper origin = bottom-left and Y grows upward
//   3. paper boundary (white fill, hairline stroke)
//   4. each viewport: live `ViewRenderer.renderViewport(...)` (or
//      "View renderer not wired" placeholder) + border + scale label
//   5. title-block (S38 — real template when wired, else placeholder)
//   6. each widget: real renderer via `widgets/registry` (S39)

import type { FrameScheduler } from '@pryzm/plugin-sdk';
import type { Disposer } from '@pryzm/plugin-sdk';
import type {
  ProjectMetadata,
  SheetData,
  TitleBlockTemplate,
  ViewportDto,
  WidgetDto,
} from '@pryzm/plugin-sdk';
import { getSheetDimensions } from '@pryzm/plugin-sdk';
import { CanvasHost, type CanvasFactory } from '@pryzm/plugin-plan-view';
import { SheetCamera } from './sheet-camera.js';
import { withSheetSpan } from './tracing.js';
import { renderTitleBlock, computeTitleBlockRect } from './title-block.js';
import { ViewportManager } from './viewport.js';
import {
  renderWidget,
  type WidgetRenderEnv,
  type WidgetRegistry,
} from './widgets/index.js';

// ── Store contracts (minimum surface) ───────────────────────────────────────

export interface SheetReadStore {
  list(): ReadonlyArray<SheetData>;
  get(id: string): SheetData | undefined;
  subscribeDirty(listener: () => void): Disposer;
}

export interface ActiveSheetReadStore {
  getActive(): { readonly activeSheetId: string | null };
  subscribeDirty(listener: () => void): Disposer;
}

/** Read-only contract the host needs from a TitleBlockStore (S38).  We
 *  type just the surface used here to avoid coupling the host to the
 *  full @pryzm/stores TitleBlockStore class — keeps testing easy. */
export interface TitleBlockReadStore {
  get(id: string): TitleBlockTemplate | undefined;
  subscribeDirty(listener: () => void): Disposer;
}

/** Provider for project metadata (project name, drawn-by, …) used to
 *  resolve title-block fields.  The editor wires a real provider once
 *  a project is opened; before that the host falls back to the S37
 *  placeholder rendering. */
export interface ProjectMetadataProvider {
  getProjectMetadata(): ProjectMetadata;
  /** Optional listener — fires when project metadata changes (e.g. the
   *  user edits "Drawn By" in project settings).  The host wires this
   *  to a frame request so the title block updates without a manual
   *  refresh. */
  onMetadataUpdated?(listener: () => void): Disposer;
}

/** S38 — what the host hands the `ViewRenderer` for a single viewport.
 *  All units are millimetres unless explicitly suffixed (e.g. `Px`).
 *  The renderer draws into a ctx already clipped to the viewport rect
 *  and translated so (0,0) = viewport bottom-left, with Y growing up. */
export interface ViewportRenderRequest {
  /** Stable id of this viewport on the sheet. */
  readonly viewportId: string;
  /** Id of the source view (3D, plan, section, …) being embedded. */
  readonly viewId: string;
  /** Drawing scale denominator (e.g. 50 = 1:50: 1 mm on paper = 50 mm
   *  in world space). */
  readonly scale: number;
  /** Viewport size on paper (mm). */
  readonly paperWidthMm: number;
  readonly paperHeightMm: number;
  /** World-space rectangle visible inside the viewport, in millimetres
   *  (centre + extents).  Computed from the viewport's clippingBox if
   *  set, else from `paperWidth × scale` × `paperHeight × scale`. */
  readonly worldBounds: {
    readonly worldX: number;
    readonly worldY: number;
    readonly worldWidth: number;
    readonly worldHeight: number;
  };
}

/** S38 — Revit-style live view renderer.  Replaces the deprecated
 *  `ViewThumbnailProvider` (snapshot/bitmap) approach.  Implementations
 *  hold a reference to the live view + scene graph; the host calls
 *  `renderViewport` on every frame the host paints, and the renderer
 *  paints the current model state into the supplied ctx. */
export interface ViewRenderer {
  /** Paint the live view into the already-clipped + translated ctx.
   *  CONTRACT: the host has applied a `clip()` to the viewport rect and
   *  translated the origin to the viewport's bottom-left in paper-mm
   *  space (Y grows up).  The renderer MUST NOT mutate the transform
   *  outside its own `save()/restore()` pair. */
  renderViewport(ctx: CanvasRenderingContext2D, request: ViewportRenderRequest): void;
  /** Optional — fires whenever any embedded view's underlying model
   *  changes (i.e. any time the view would re-paint to a different
   *  result).  The host wires this to a frame request so the sheet
   *  re-paints automatically.  The id of the dirtied view is passed so
   *  observers can do per-view diffing if they want. */
  subscribe?(listener: (viewId: string) => void): Disposer;
}

export interface SheetEditorHostOptions {
  readonly scheduler: FrameScheduler;
  readonly sheetStore: SheetReadStore;
  readonly activeSheetStore: ActiveSheetReadStore;
  /** S38 — live (Revit-style) view renderer.  When omitted the host
   *  paints a placeholder rectangle inside each viewport. */
  readonly viewRenderer?: ViewRenderer;
  /** S38 — registry of title-block templates (read surface). */
  readonly titleBlockStore?: TitleBlockReadStore;
  /** S38 — project metadata provider for title-block field resolution. */
  readonly projectMetadata?: ProjectMetadataProvider;
  /** S39 — widget registry override.  Defaults to the built-in registry
   *  which ships with the 10 standard widgets (text, image, north
   *  arrow, scale bar, legend, revisions table, schedule snapshot,
   *  bim tag, line, region). */
  readonly widgetRegistry?: WidgetRegistry;
  /** S39 — environment data passed to widget renderers (legend element
   *  list, schedule snapshot data, …).  Optional — widgets that need
   *  data they aren't given render an empty/skeleton state. */
  readonly widgetEnv?: WidgetRenderEnv;
  readonly canvasFactory?: CanvasFactory;
  readonly listenerId?: string;
}

// ── Render constants (CSS px in sheet-paper-mm space) ───────────────────────
//
// These constants are intentionally plain — the editor is a 2D doc
// renderer; there is no need for an HSL palette / theming pass yet
// (S38 introduces a fuller palette when title blocks ship).

const PAPER_FILL = '#FFFFFF';
const PAPER_STROKE = '#000000';
const PAPER_STROKE_WIDTH_MM = 0.25;

const VIEWPORT_PLACEHOLDER_FILL = '#F0F0F0';
const VIEWPORT_PLACEHOLDER_TEXT = '#666666';
const VIEWPORT_BORDER = '#000000';
const VIEWPORT_BORDER_WIDTH_MM = 0.25;
const VIEWPORT_LABEL = '#000000';

const TITLE_BLOCK_PLACEHOLDER_FILL = '#FAFAFA';
const TITLE_BLOCK_PLACEHOLDER_STROKE = '#888888';
const TITLE_BLOCK_PLACEHOLDER_TEXT = '#444444';
const TITLE_BLOCK_HEIGHT_MM = 25; // strip across the bottom of the sheet
const TITLE_BLOCK_INSET_MM = 5;

const WIDGET_PLACEHOLDER_STROKE = '#444444';
const WIDGET_PLACEHOLDER_FILL = '#FFFCF0';

const EMPTY_STATE_BG = '#222222';
const EMPTY_STATE_TEXT = '#FFFFFF';

// Minimal Canvas2D-like surface so headless (node-canvas) and DOM contexts
// both satisfy the host without us depending on lib.dom in the host signature.
type Ctx2D = CanvasRenderingContext2D;

// ── Host ────────────────────────────────────────────────────────────────────

export class SheetEditorHost extends CanvasHost {
  private readonly camera: SheetCamera;
  private readonly sheetStore: SheetReadStore;
  private readonly activeSheetStore: ActiveSheetReadStore;
  private readonly viewRenderer: ViewRenderer | undefined;
  private readonly titleBlockStore: TitleBlockReadStore | undefined;
  private readonly projectMetadata: ProjectMetadataProvider | undefined;
  private readonly widgetRegistry: WidgetRegistry | undefined;
  private readonly widgetEnv: WidgetRenderEnv;
  private readonly subscriptionDisposers: Disposer[] = [];
  private lastActiveSheetId: string | null = null;

  constructor(opts: SheetEditorHostOptions) {
    super({
      scheduler: opts.scheduler,
      canvasFactory: opts.canvasFactory,
      listenerId: opts.listenerId,
    });
    this.sheetStore = opts.sheetStore;
    this.activeSheetStore = opts.activeSheetStore;
    this.viewRenderer = opts.viewRenderer;
    this.titleBlockStore = opts.titleBlockStore;
    this.projectMetadata = opts.projectMetadata;
    this.widgetRegistry = opts.widgetRegistry;
    this.widgetEnv = opts.widgetEnv ?? {};
    this.camera = new SheetCamera({ onDirty: () => this.requestRender() });

    this.subscriptionDisposers.push(
      this.sheetStore.subscribeDirty(() => this.requestRender()),
      this.activeSheetStore.subscribeDirty(() => {
        this.onActiveSheetChanged();
        this.requestRender();
      }),
    );
    if (this.viewRenderer?.subscribe) {
      this.subscriptionDisposers.push(
        this.viewRenderer.subscribe(() => this.requestRender()),
      );
    }
    if (this.titleBlockStore) {
      this.subscriptionDisposers.push(
        this.titleBlockStore.subscribeDirty(() => this.requestRender()),
      );
    }
    if (this.projectMetadata?.onMetadataUpdated) {
      this.subscriptionDisposers.push(
        this.projectMetadata.onMetadataUpdated(() => this.requestRender()),
      );
    }
  }

  protected subsystemId(): string { return 'sheet-editor'; }

  /** Public read-only accessor for tests + downstream UI (pan/zoom panels). */
  getCamera(): SheetCamera { return this.camera; }

  /** Auto-fit the active sheet to the canvas viewport.  No-op when no
   *  sheet is active or the canvas has zero dimensions. */
  fitActiveSheet(marginPx: number = 24): void {
    const sheet = this.getActiveSheetSafely();
    if (!sheet) return;
    const { widthMm, heightMm } = getSheetDimensions(sheet.size, sheet.orientation);
    this.camera.fitToPaper(widthMm, heightMm, this.canvas.width, this.canvas.height, marginPx);
  }

  /** Render entry point.  Wraps the body in `pryzm.sheet.render`
   *  (per S37 D8 OTel deliverable). */
  protected render(): void {
    withSheetSpan('pryzm.sheet.render', () => {
      const ctx = this.canvas.getContext('2d') as Ctx2D | null;
      if (!ctx) return;
      this.renderInto(ctx, this.canvas.width, this.canvas.height);
    });
  }

  /**
   * Public render-into hook: draw the current frame into an arbitrary
   * 2D context (used by the export worker in S40 to rasterise at 300 DPI
   * into a node-canvas surface).  Pure: does not touch `this.dirty` or
   * the FrameScheduler.
   */
  renderInto(ctx: Ctx2D, widthPx: number, heightPx: number): void {
    // 1. Reset transform + clear.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, widthPx, heightPx);

    const sheet = this.getActiveSheetSafely();
    if (!sheet) {
      this.renderEmptyState(ctx, widthPx, heightPx);
      return;
    }

    const { widthMm, heightMm } = getSheetDimensions(sheet.size, sheet.orientation);

    // 2. Paper-space transform: origin = bottom-left of the canvas,
    //    Y grows upward, then camera pan + zoom.
    ctx.save();
    ctx.translate(0, heightPx);
    ctx.scale(1, -1);
    ctx.translate(this.camera.panX, this.camera.panY);
    ctx.scale(this.camera.pixelsPerMm, this.camera.pixelsPerMm);

    // 3. Paper boundary.
    ctx.fillStyle = PAPER_FILL;
    ctx.fillRect(0, 0, widthMm, heightMm);
    ctx.strokeStyle = PAPER_STROKE;
    ctx.lineWidth = PAPER_STROKE_WIDTH_MM;
    ctx.strokeRect(0, 0, widthMm, heightMm);

    // 4. Viewports.
    for (const vp of sheet.viewports) this.drawViewport(ctx, vp);

    // 5. Title block — render the real template (S38) when the store +
    //    project metadata are wired; otherwise fall back to the S37
    //    placeholder strip so legacy boots still see something useful.
    this.drawTitleBlock(ctx, sheet, widthMm, heightMm);

    // 6. Widgets — S39 real renderers via the widget registry; falls
    //    back to a stub box if the kind isn't registered (e.g. a custom
    //    widget shipped by a future plugin and not yet loaded).
    for (const w of sheet.widgets) this.drawWidget(ctx, w);

    ctx.restore();
  }

  dispose(): void {
    for (const d of this.subscriptionDisposers) {
      try { d(); } catch { /* swallow — disposer is best-effort */ }
    }
    this.subscriptionDisposers.length = 0;
    this.camera.onDirty = undefined;
    super.dispose();
  }

  // ── internal helpers ──────────────────────────────────────────────────────

  private getActiveSheetSafely(): SheetData | undefined {
    const id = this.activeSheetStore.getActive().activeSheetId;
    if (!id) return undefined;
    return this.sheetStore.get(id);
  }

  private onActiveSheetChanged(): void {
    const newId = this.activeSheetStore.getActive().activeSheetId;
    if (newId === this.lastActiveSheetId) return;
    this.lastActiveSheetId = newId;
    if (newId !== null) withSheetSpan('pryzm.sheet.activate', () => { /* span-only */ });
  }

  private renderEmptyState(ctx: Ctx2D, widthPx: number, heightPx: number): void {
    ctx.fillStyle = EMPTY_STATE_BG;
    ctx.fillRect(0, 0, widthPx, heightPx);
    ctx.fillStyle = EMPTY_STATE_TEXT;
    ctx.font = '14px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(
      'No sheet selected — click + to create',
      widthPx / 2,
      heightPx / 2,
    );
  }

  /** S38 — render a viewport LIVE (Revit-style).  The host clips to the
   *  viewport rect, translates the origin to the viewport's bottom-left
   *  (Y still up — same paper-mm orientation as the rest of the host),
   *  then hands the ctx to the live `ViewRenderer`.  No bitmap snapshot
   *  in the middle: any model edit re-paints next frame. */
  private drawViewport(ctx: Ctx2D, vp: ViewportDto): void {
    withSheetSpan('pryzm.sheet.viewport.render', () => {
      // Clip to viewport bounds and translate origin to its bottom-left.
      ctx.save();
      ctx.beginPath();
      ctx.rect(vp.x, vp.y, vp.width, vp.height);
      ctx.clip();

      if (this.viewRenderer) {
        ctx.save();
        ctx.translate(vp.x, vp.y);
        const request: ViewportRenderRequest = {
          viewportId: vp.id,
          viewId: vp.viewId,
          scale: vp.scale,
          paperWidthMm: vp.width,
          paperHeightMm: vp.height,
          worldBounds: ViewportManager.computeWorldBounds(vp),
        };
        try {
          this.viewRenderer.renderViewport(ctx as CanvasRenderingContext2D, request);
        } catch {
          // Loud-fail in dev would break the whole sheet; degrade
          // gracefully to the unwired placeholder.
          this.fillViewportPlaceholder(ctx, vp, 'View render error');
        }
        ctx.restore();
      } else {
        this.fillViewportPlaceholder(ctx, vp, 'View renderer not wired');
      }
      ctx.restore();

      // Border + scale label outside the clip.
      ctx.strokeStyle = VIEWPORT_BORDER;
      ctx.lineWidth = VIEWPORT_BORDER_WIDTH_MM;
      ctx.strokeRect(vp.x, vp.y, vp.width, vp.height);
      this.drawTextUpright(
        ctx,
        `1:${vp.scale}`,
        vp.x + 2,
        vp.y + 2,
        3,
        VIEWPORT_LABEL,
        'left',
      );
    });
  }

  private fillViewportPlaceholder(ctx: Ctx2D, vp: ViewportDto, msg: string): void {
    ctx.fillStyle = VIEWPORT_PLACEHOLDER_FILL;
    ctx.fillRect(vp.x, vp.y, vp.width, vp.height);
    this.drawTextUpright(
      ctx,
      msg,
      vp.x + vp.width / 2,
      vp.y + vp.height / 2,
      4,
      VIEWPORT_PLACEHOLDER_TEXT,
      'center',
    );
  }

  /** S38 entry point — render the real title block when wired, else
   *  fall back to the S37 placeholder strip. */
  private drawTitleBlock(
    ctx: Ctx2D,
    sheet: SheetData,
    widthMm: number,
    heightMm: number,
  ): void {
    const tb = this.titleBlockStore?.get(sheet.titleBlockId);
    const meta = this.projectMetadata?.getProjectMetadata();
    if (tb && meta) {
      const rect = computeTitleBlockRect(tb, widthMm, heightMm);
      renderTitleBlock(ctx, tb, meta, sheet, rect.x, rect.y, rect.width, rect.height);
      return;
    }
    this.drawTitleBlockPlaceholder(ctx, sheet, widthMm);
  }

  private drawTitleBlockPlaceholder(ctx: Ctx2D, sheet: SheetData, widthMm: number): void {
    const x = TITLE_BLOCK_INSET_MM;
    const y = TITLE_BLOCK_INSET_MM;
    const w = widthMm - TITLE_BLOCK_INSET_MM * 2;
    const h = TITLE_BLOCK_HEIGHT_MM;
    ctx.fillStyle = TITLE_BLOCK_PLACEHOLDER_FILL;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = TITLE_BLOCK_PLACEHOLDER_STROKE;
    ctx.lineWidth = 0.25;
    ctx.strokeRect(x, y, w, h);
    this.drawTextUpright(
      ctx,
      `${sheet.number}  ·  ${sheet.name}`,
      x + 4,
      y + h - 4,
      6,
      TITLE_BLOCK_PLACEHOLDER_TEXT,
      'left',
    );
    if (sheet.revision) {
      this.drawTextUpright(
        ctx,
        `Rev ${sheet.revision}`,
        x + w - 4,
        y + h - 4,
        4,
        TITLE_BLOCK_PLACEHOLDER_TEXT,
        'right',
      );
    }
  }

  private drawWidget(ctx: Ctx2D, w: WidgetDto): void {
    const ok = renderWidget(
      ctx as CanvasRenderingContext2D,
      w,
      this.widgetEnv,
      this.widgetRegistry,
    );
    if (!ok) this.drawWidgetPlaceholder(ctx, w);
  }

  private drawWidgetPlaceholder(ctx: Ctx2D, w: WidgetDto): void {
    ctx.fillStyle = WIDGET_PLACEHOLDER_FILL;
    ctx.fillRect(w.x, w.y, w.width, w.height);
    ctx.strokeStyle = WIDGET_PLACEHOLDER_STROKE;
    ctx.lineWidth = 0.2;
    ctx.strokeRect(w.x, w.y, w.width, w.height);
    this.drawTextUpright(
      ctx,
      w.kind,
      w.x + 2,
      w.y + 2,
      3,
      WIDGET_PLACEHOLDER_STROKE,
      'left',
    );
  }

  /** Draw text with the canvas's current paper-space transform but
   *  oriented upright on screen (counter-flips the Y mirror). */
  private drawTextUpright(
    ctx: Ctx2D,
    text: string,
    x: number,
    y: number,
    sizeMm: number,
    color: string,
    align: 'left' | 'center' | 'right',
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, -1);
    ctx.fillStyle = color;
    ctx.font = `${sizeMm}px sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = align;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
}
