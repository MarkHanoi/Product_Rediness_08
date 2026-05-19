// PlanViewCanvasHost — concrete plan-view canvas integration shell.
//
// History:
//   • S29  — first cut (skeleton: walls + slabs + doors via projection.ts).
//            `code-level ADR docs/architecture/adr/0028-plan-view-canvas-architecture.md`.
//   • S31  — promoted to first full plan-view implementation:
//              ‣ uses S30 `edge-projection` + `poche` from the geometry kernel
//              ‣ delegates draw to the new `PlanViewRenderer` (host/renderer split)
//              ‣ wires `PlanCamera.onDirty` to its own `requestRender()`
//              ‣ subscribes to optional Window/Room/Annotation/Dimension/Structural stores
//              ‣ ResizeObserver + DPR scaling for HiDPI parity
//            `code-level ADR docs/architecture/adr/0023-plan-view-canvas2d-renderer.md` §3 + §4.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// The host owns lifecycle + integration:
//   * Stores → snapshot once per frame
//   * FrameScheduler → 0-fps idle; one `interaction` request per dirty event
//   * DOM → ResizeObserver, devicePixelRatio scaling
//   * Camera → wires `onDirty` so pan/zoom flips the dirty flag
//
// The renderer owns pixels.  See `PlanViewRenderer.ts` for the draw loop.
// The kernel owns geometry.  See `packages/geometry-kernel/src/edge-projection.ts`
// and `packages/geometry-kernel/src/poche.ts` for the classifier + poche.

import type { FrameScheduler } from '@pryzm/plugin-sdk';
import {
  computePocheFills,
  evaluateDimensions,
  produceDimensions,
  projectWallEdges,
  type DimensionElementSnapshot,
  type DimensionRequest,
  type DoorLikeEvaluator,
  type Edge2D,
  type ElementSnapshotForDim,
  type PocheFill,
  type ProjectUnitSettings,
  type RoomLikeEvaluator,
  type WallLikeEvaluator,
  type WindowLikeEvaluator,
} from '@pryzm/plugin-sdk';
import type { Wall, Slab, Door, Window } from '@pryzm/plugin-sdk';
import type {
  DimensionString,
  EvaluatedDimension,
} from '@pryzm/plugin-sdk';
import {
  commitDimensions,
  type Canvas2DLike,
  type ViewTransformMatrix,
} from '@pryzm/drawing-primitives/dimensions';
import type { Disposer, DimensionViewSettings } from '@pryzm/plugin-sdk';
import { CanvasHost, type CanvasFactory } from './CanvasHost.js';
import { LevelStore } from './LevelStore.js';
import { PlanCamera } from './PlanCamera.js';
import {
  PlanViewRenderer,
  type PlanAnnotationLabel,
  type PlanDoorBreak,
  type PlanRenderingContext2D,
  type PlanRoomPolygon,
  type PlanSlabOutline,
  type PlanViewData,
  type PlanViewRendererOptions,
} from './PlanViewRenderer.js';
import {
  AnnotationCommitter,
  type AnnotationCommitContext2D,
} from './annotation-committer.js';
import {
  layoutAnnotations,
  type AnnotationDto,
  type LayoutCamera,
  type Vec2,
} from './annotation-renderer.js';
import { SPAN, withSpan } from './tracing.js';

// ── Store contracts ─────────────────────────────────────────────────────────
//
// We depend on the minimum surface — `getState()` + `subscribeDirty()` —
// so cross-package coupling stays thin.  The host doesn't care whether
// the store is the production `Store<T>` or a fake fixture; both meet
// this contract.

/** Minimal store-shape this host depends on — keeps cross-package coupling thin. */
export interface PlanViewSourceStore<T> {
  getState(): ReadonlyMap<string, T>;
  subscribeDirty(listener: () => void): Disposer;
}

/**
 * Optional annotation-store shape.  Annotations are scoped to a view, not a
 * level, but the supplemental Auto-Dim work at S31 lifts the constraint to
 * "level OR view scope" — we accept both.
 *
 * S32 extends the shape with optional leader / callout / region fields so
 * the host can adapt richer annotation kinds into the new
 * `layoutAnnotations` pipeline without a breaking change for callers
 * that only set `text`/`anchor`.  See ADR-0024 §2.
 */
export interface PlanViewAnnotationLike {
  readonly id: string;
  readonly viewId?: string;
  readonly levelId?: string;
  readonly anchor: { x: number; y?: number; z: number };
  readonly text: string;
  readonly rotation?: number;
  readonly textHeightMm?: number;
  readonly color?: string;
  /** S32 — discriminator for the new annotation pipeline.  Default `'text'`. */
  readonly kind?: 'text' | 'leader' | 'callout' | 'region';
  /** S32 — leader waypoints (world XZ; last is arrowhead). */
  readonly leaderPoints?: ReadonlyArray<{ x: number; z: number }>;
  /** S32 — callout: leader terminator (world XZ). */
  readonly leaderPoint?: { x: number; z: number };
  readonly calloutBoxWidth?: number;
  readonly calloutBoxHeight?: number;
  /** S32 — region polygon (world XZ; outer chain only). */
  readonly polygon?: ReadonlyArray<{ x: number; z: number }>;
  readonly fillColor?: string;
  readonly fillOpacity?: number;
  readonly strokeColor?: string;
}

export interface PlanViewRoomLike {
  readonly id: string;
  readonly levelId: string;
  /** Polygon in world XZ; vertex `.y` carries world-Z (matches kernel projection). */
  readonly polygon: ReadonlyArray<{ x: number; y: number }>;
  readonly fill?: string;
}

export interface PlanViewStructuralLike {
  readonly id: string;
  readonly levelId: string;
  /** Plan-view footprint polygon in world XZ. */
  readonly polygon: ReadonlyArray<{ x: number; y: number }>;
}

export interface PlanViewDimensionLike {
  readonly id: string;
  readonly viewId?: string;
  readonly levelId?: string;
}

// ── Host options ────────────────────────────────────────────────────────────

export interface PlanViewCanvasHostOptions {
  readonly scheduler: FrameScheduler;
  readonly levelStore: LevelStore;
  readonly wallStore: PlanViewSourceStore<Wall>;
  readonly slabStore: PlanViewSourceStore<Slab>;
  readonly doorStore: PlanViewSourceStore<Door>;
  /** Optional — when present, opening edges + door cut-throughs render in plan. */
  readonly windowStore?: PlanViewSourceStore<Window>;
  /** Optional — room fills render under the wall edges. */
  readonly roomStore?: PlanViewSourceStore<PlanViewRoomLike>;
  /** Optional — annotation labels render on top. */
  readonly annotationStore?: PlanViewSourceStore<PlanViewAnnotationLike>;
  /** Optional — dimension strings (S33+).  Subscribed for dirty events; not yet rendered. */
  readonly dimensionStore?: PlanViewSourceStore<PlanViewDimensionLike>;
  /**
   * S35 supplement — per-view auto-dim settings.  When the resolved value
   * is `undefined` or `autoDimensionMode === 'off'`, the auto-dim pipeline
   * is skipped entirely (zero per-frame allocations).  Accepts either a
   * static value or a callback that's invoked once per `render()` so the
   * caller can swap modes without re-instantiating the host.
   */
  readonly autoDimensionSettings?:
    | DimensionViewSettings
    | (() => DimensionViewSettings | undefined);
  /**
   * S35 supplement — id factory used by `produceDimensions` for the
   * auto-dim pipeline.  Defaults to a process-wide monotonic counter so
   * tests are reproducible without seeding ULID.  Pass a crypto-grade
   * factory (e.g. `() => 'dim-' + ulid()`) in production.
   */
  readonly dimensionIdFactory?: () => string;
  /**
   * S35 supplement — project unit settings used by the dim evaluator's
   * `formatDimension`.  Defaults to mm with zero decimals to match the
   * supplement §A3 example fixtures.
   */
  readonly projectUnits?: ProjectUnitSettings;
  /**
   * S35 supplement — sheet scale denominator (e.g. `50` for 1:50).  Used
   * by the auto-dim seam to convert paper-mm sizes (text/ticks/arrows)
   * into pixels at the current camera zoom: `paperMmToPx = (sheetScale ×
   * camera.scale) / 1000`.  Mirrors `resolveFontSizePx`'s hard-coded 50.
   * Per-view sheet scale via ViewTemplate is a S33-supplement follow-up.
   */
  readonly dimensionSheetScale?: number;
  /** Optional — structural footprints (column / beam) render under wall edges. */
  readonly structuralStore?: PlanViewSourceStore<PlanViewStructuralLike>;
  readonly camera?: PlanCamera;
  readonly canvasFactory?: CanvasFactory;
  /** Renderer overrides (palette + sheet scale). */
  readonly rendererOptions?: PlanViewRendererOptions;
  /** Default `1.0` m above level (architectural standard). */
  readonly cutHeight?: number;
  /** When true, use `window.devicePixelRatio` for HiDPI scaling.  Default `true`. */
  readonly hiDpi?: boolean;

  // ── S33 — Contract 44 G9/G10 wiring (all optional; backward-compatible) ────
  /**
   * When all of `commandBus`, `viewId`, `hitTestSource` and
   * `elementKindLookup` are set, the host instantiates {@link PlanViewSelection}
   * on `mount()` and disposes it on `dispose()`.  Adds {@link PlanViewDrag}
   * when `elementPositionLookup` and `selectedIdsLookup` are also supplied.
   */
  readonly commandBus?: import('./selection.js').PlanCommandBus;
  /** Active view id (used by upstream consumers; reserved for handler routing). */
  readonly viewId?: string;
  /** Returns the current hit-test inputs (called per click — keep cheap). */
  readonly hitTestSource?: () => import('./hit-test.js').PlanHitTestInput;
  /** elementId → element kind ('wall' | 'door' | 'slab' | …). */
  readonly elementKindLookup?: import('./selection.js').ElementKindLookup;
  /** elementId → world position (`{x,y,z}`).  Required to enable drag. */
  readonly elementPositionLookup?: import('./drag.js').ElementPositionLookup;
  /** elementId → boolean.  Drag only starts on a selected element. */
  readonly selectedIdsLookup?: import('./drag.js').SelectedIdsLookup;
  /** px-distance the pointer must move before a click upgrades to a drag.  Default 3. */
  readonly dragThresholdPx?: number;
}

// Local helpers / sentinels.
const isFiniteNumber = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n);

export class PlanViewCanvasHost extends CanvasHost {
  readonly camera: PlanCamera;
  readonly renderer: PlanViewRenderer;
  private readonly levelStore: LevelStore;
  private readonly wallStore: PlanViewSourceStore<Wall>;
  private readonly slabStore: PlanViewSourceStore<Slab>;
  private readonly doorStore: PlanViewSourceStore<Door>;
  private readonly windowStore: PlanViewSourceStore<Window> | undefined;
  private readonly roomStore: PlanViewSourceStore<PlanViewRoomLike> | undefined;
  private readonly annotationStore: PlanViewSourceStore<PlanViewAnnotationLike> | undefined;
  private readonly dimensionStore: PlanViewSourceStore<PlanViewDimensionLike> | undefined;
  private readonly structuralStore: PlanViewSourceStore<PlanViewStructuralLike> | undefined;
  // S35 supplement — auto-dim pipeline state.
  private readonly autoDimSettingsRaw:
    | DimensionViewSettings
    | (() => DimensionViewSettings | undefined)
    | undefined;
  private readonly dimensionIdFactory: () => string;
  private readonly projectUnits: ProjectUnitSettings;
  private readonly dimensionSheetScale: number;
  private readonly subscriptions: Disposer[] = [];
  private readonly cutHeight: number;
  private readonly hiDpi: boolean;
  private resizeObserver: ResizeObserver | null = null;

  // S33 — Contract 44 G9/G10 controllers (lazy-instantiated on mount).
  private readonly interactionOpts: PlanViewCanvasHostOptions;
  private selectionController: import('./selection.js').PlanViewSelection | null = null;
  private dragController: import('./drag.js').PlanViewDrag | null = null;

  constructor(opts: PlanViewCanvasHostOptions) {
    super({
      scheduler: opts.scheduler,
      canvasFactory: opts.canvasFactory,
      listenerId: 'plan-view-render',
    });
    this.levelStore = opts.levelStore;
    this.wallStore = opts.wallStore;
    this.slabStore = opts.slabStore;
    this.doorStore = opts.doorStore;
    this.windowStore = opts.windowStore;
    this.roomStore = opts.roomStore;
    this.annotationStore = opts.annotationStore;
    this.dimensionStore = opts.dimensionStore;
    this.structuralStore = opts.structuralStore;
    // S35 — auto-dim wiring.  All four fields are optional; sensible
    // defaults keep the pipeline opt-in (a host with no
    // `autoDimensionSettings` does zero auto-dim work per frame).
    this.autoDimSettingsRaw = opts.autoDimensionSettings;
    this.dimensionIdFactory =
      opts.dimensionIdFactory ?? makeDefaultDimensionIdFactory();
    this.projectUnits = opts.projectUnits ?? { unit: 'mm', decimalPlaces: 0 };
    this.dimensionSheetScale = opts.dimensionSheetScale ?? 50;
    this.camera = opts.camera ?? new PlanCamera();
    this.renderer = new PlanViewRenderer(opts.rendererOptions);
    this.cutHeight = opts.cutHeight ?? 1.0;
    this.hiDpi = opts.hiDpi ?? true;
    this.interactionOpts = opts;

    const dirty = (): void => this.requestRender();
    this.subscriptions.push(this.wallStore.subscribeDirty(dirty));
    this.subscriptions.push(this.slabStore.subscribeDirty(dirty));
    this.subscriptions.push(this.doorStore.subscribeDirty(dirty));
    this.subscriptions.push(this.levelStore.subscribeDirty(dirty));
    if (this.windowStore)     this.subscriptions.push(this.windowStore.subscribeDirty(dirty));
    if (this.roomStore)       this.subscriptions.push(this.roomStore.subscribeDirty(dirty));
    if (this.annotationStore) this.subscriptions.push(this.annotationStore.subscribeDirty(dirty));
    if (this.dimensionStore)  this.subscriptions.push(this.dimensionStore.subscribeDirty(dirty));
    if (this.structuralStore) this.subscriptions.push(this.structuralStore.subscribeDirty(dirty));

    // Wire the camera's dirty hook (S31).  If the caller passed a
    // pre-built camera with its own onDirty already set, chain ours
    // after theirs so we don't drop external listeners.
    const prior = this.camera.onDirty;
    this.camera.onDirty = () => {
      if (prior) {
        try { prior(); }
        catch (err) {
          // eslint-disable-next-line no-console
          console.error('[PlanViewCanvasHost] prior camera onDirty threw:', err);
        }
      }
      this.requestRender();
    };
  }

  protected subsystemId(): string { return 'plan-view'; }

  override mount(container: HTMLElement): void {
    super.mount(container);
    this.attachResizeObserver(container);
    // First mount may need to size the canvas before the FRO ticks.
    this.syncCanvasSize(container);
    void this.attachInteractionControllers();
  }

  override dispose(): void {
    if (this.resizeObserver) {
      try { this.resizeObserver.disconnect(); } catch { /* swallow */ }
      this.resizeObserver = null;
    }
    if (this.selectionController) {
      try { this.selectionController.dispose(); } catch { /* swallow */ }
      this.selectionController = null;
    }
    if (this.dragController) {
      try { this.dragController.dispose(); } catch { /* swallow */ }
      this.dragController = null;
    }
    for (const s of this.subscriptions) s();
    this.subscriptions.length = 0;
    super.dispose();
  }

  /**
   * S33 — Contract 44 G9/G10.  Idempotent: safe to call after a mount or
   * after a dispose+remount.  Does nothing when the required interaction
   * options are not all supplied (backward-compatible).
   */
  private async attachInteractionControllers(): Promise<void> {
    const o = this.interactionOpts;
    if (!o.commandBus || !o.hitTestSource || !o.elementKindLookup) return;

    const [{ buildPlanHitTest }, { PlanViewSelection }, { PlanViewDrag }] = await Promise.all([
      import('./hit-test.js'),
      import('./selection.js'),
      import('./drag.js'),
    ]);

    // Re-build the hit-test closure on every click — the host has no
    // way to know when stores mutate aside from `requestRender`, but we
    // already pay an O(n) traversal per click in any case.
    const hitTest = (worldX: number, worldZ: number): string | null =>
      buildPlanHitTest(o.hitTestSource!())(worldX, worldZ);

    this.selectionController = new PlanViewSelection({
      canvas: this.canvas,
      camera: this.camera,
      scheduler: { requestFrame: () => this.requestRender() },
      commandBus: o.commandBus,
      hitTest,
      elementKindLookup: o.elementKindLookup,
    });

    if (o.elementPositionLookup && o.selectedIdsLookup) {
      this.dragController = new PlanViewDrag({
        canvas: this.canvas,
        camera: this.camera,
        commandBus: o.commandBus,
        hitTest,
        selectedIdsLookup: o.selectedIdsLookup,
        elementPositionLookup: o.elementPositionLookup,
        ...(o.dragThresholdPx !== undefined ? { dragThresholdPx: o.dragThresholdPx } : {}),
      });
    }
  }

  /** Force a re-render without waiting for a store mutation (e.g. camera pan). */
  invalidate(): void { this.requestRender(); }

  protected render(): void {
    const ctx = this.canvas.getContext('2d') as PlanRenderingContext2D | null;
    if (!ctx) return;

    // The renderer needs CSS-pixel dimensions and the DPR for the
    // background clear + line-weight conversion.  When the host runs
    // in a browser the canvas backing-store is `cssWidth * dpr`; we
    // record cssWidth here and scale via setTransform inside the
    // renderer.  When running headless (tests, bake worker) the
    // canvas reports raw `.width` and we fall back to that.
    const dpr = this.hiDpi ? this.currentDpr() : 1;
    const cssWidth = (this.canvas.width || 0) / dpr;
    const cssHeight = (this.canvas.height || 0) / dpr;
    this.renderer.setCanvasGeometry(cssWidth, cssHeight, dpr);

    const active = this.levelStore.getActiveLevel();
    if (!active) {
      // Still clear so a level switch from "something" to "nothing"
      // wipes the previous frame.  Cheap.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width || 0, this.canvas.height || 0);
      return;
    }
    const levelId = active.id;
    const levelZ = isFiniteNumber(active.elevation) ? active.elevation : 0;

    const walls = this.collectByLevel(this.wallStore.getState(), levelId, (w) => w.levelId);
    const slabs = this.collectByLevel(this.slabStore.getState(), levelId, (s) => s.levelId);
    const doors = [...this.doorStore.getState().values()];
    const windows = this.windowStore
      ? [...this.windowStore.getState().values()]
      : [];

    // Derived inputs for the kernel — pure data; safe to pass to the
    // bake-worker tests verbatim.
    const edges: Edge2D[] = projectWallEdges({
      walls, doors, windows, levelZ, cutHeight: this.cutHeight,
    });
    const pocheFills: PocheFill[] = computePocheFills({
      walls, doors, windows, levelZ, cutHeight: this.cutHeight,
    });

    const slabOutlines: PlanSlabOutline[] = slabs.map((slab) => ({
      elementId: slab.id,
      points: slabOutlinePoints(slab),
    }));

    const doorBreaks: PlanDoorBreak[] = computeDoorBreaks(walls, doors);

    const rooms = this.collectRoomsForLevel(levelId);
    // Two annotation paths now coexist (ADR-0024 §2):
    //   • Legacy simple-text labels via `PlanViewRenderer.render(data.annotations)`
    //     — kept ON only when the annotation pipeline is NOT in use, so the
    //     existing simple-label test surface stays green.
    //   • S32 layout/committer pipeline via `layoutAnnotations` →
    //     `AnnotationCommitter.draw` — used when ANY annotation needs the
    //     new richer rendering (leader / callout / region) AND for text
    //     when the annotation store is present.
    const annDtos = this.collectAnnotationDtos(levelId);
    const useNewPipeline = annDtos.length > 0;
    const legacyAnnotations: PlanAnnotationLabel[] | undefined =
      useNewPipeline ? undefined : this.collectAnnotationsForLevel(levelId);

    const data: PlanViewData = {
      levelId,
      levelZ,
      slabOutlines,
      pocheFills,
      edges,
      doorBreaks,
      rooms,
      annotations: legacyAnnotations,
    };

    this.renderer.render(
      ctx,
      (target) => this.applyCameraWithDpr(target, dpr),
      data,
    );

    // S32 — new annotation pipeline runs AFTER the renderer so it can draw
    // at identity transform (the layout is in CSS-pixel coords).
    if (useNewPipeline) {
      const cssW = (this.canvas.width || 0) / dpr;
      const cssH = (this.canvas.height || 0) / dpr;
      const layoutCam: LayoutCamera = this.buildLayoutCamera(dpr);
      const layouts = withSpan(SPAN.ANNOTATION_LAYOUT, () =>
        layoutAnnotations(annDtos, layoutCam, cssW, cssH));
      withSpan(SPAN.ANNOTATION_DRAW, () => {
        // Reset to identity before drawing (the layout is already in CSS px).
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const committer = new AnnotationCommitter(ctx as unknown as AnnotationCommitContext2D);
        committer.draw(layouts);
      });
    }

    // S35 supplement — Auto-Dimension pipeline.  Runs LAST so dim text /
    // witness lines paint on top of the geometry layer (architectural
    // standard).  Bails fast when no per-view settings are configured.
    this.commitAutoDimensions(ctx, dpr, walls, doors, windows, rooms ?? [], levelId);
  }

  /**
   * Build the projection callback that the layout uses to convert
   * world-XZ → canvas CSS-pixel coords.  This is THE single place the
   * Z-flip lives for the annotation pipeline (per ADR-0024 §2 — the
   * renderer handles its own flip independently).
   *
   * The math mirrors `applyCameraWithDpr`: the camera transform in CSS
   * pixels is `(x, z) → (x * scale + panX, -z * scale + panY)`.  We
   * deliberately drop the DPR multiplier here because the committer
   * issues `setTransform(dpr, 0, 0, dpr, 0, 0)` itself before drawing —
   * keeping the layout in CSS px makes overlap detection independent of
   * device pixel density.
   */
  private buildLayoutCamera(_dpr: number): LayoutCamera {
    const c = this.camera;
    return {
      worldToCanvas: (worldXZ: Vec2): Vec2 => {
        const sx = worldXZ[0] * c.scale + c.panX;
        const sy = -worldXZ[1] * c.scale + c.panY;
        return [sx, sy];
      },
    };
  }

  // ── S35 supplement — Auto-Dimension pipeline ──────────────────────────────

  /**
   * Resolve the per-frame `DimensionViewSettings` from the host option.
   * Accepts either the static value or a callback (so the caller can
   * mode-switch live).  Returns `undefined` when the auto-dim pipeline
   * should be skipped.
   */
  private resolveAutoDimSettings(): DimensionViewSettings | undefined {
    const raw = this.autoDimSettingsRaw;
    if (raw === undefined) return undefined;
    if (typeof raw === 'function') return raw();
    return raw;
  }

  /**
   * Run the S33-supplement DimensionProducer + DimensionEvaluator + S34
   * Canvas2D DimensionCommitter end-to-end against the current frame's
   * geometry snapshot.  Bails early when no settings are configured or
   * the mode is `'off'`.
   *
   * COORDINATE-SYSTEM BRIDGING
   * ──────────────────────────────────────────────────────────────────────
   * The committer's `viewTransform` matrix takes its input coords through
   * `setTransform(matrix)` directly, so we have two options for the
   * bridging math:
   *
   *   (A) Pass a `mm → device-px` matrix and leave the evaluator's
   *       world-mm coords un-transformed in the host.  This is the
   *       supplement spec's literal example, but it requires the matrix
   *       to embed a y-flip — which would render text upside-down.
   *
   *   (B) Pre-project the evaluated dim coords from world-mm into CSS
   *       pixels (with the same Z-flip as `buildLayoutCamera` for the
   *       annotation pipeline), then pass an identity-with-DPR matrix.
   *       This keeps the committer in a "draw at canonical orientation"
   *       state — text reads right-side-up, ticks are square.
   *
   * We pick (B) — same strategy ADR-0024 §2 chose for the annotation
   * pipeline.  The `scale` parameter passed to `commitDimensions` is
   * "pixels per paper-mm at current zoom", which converts the
   * committer's hard-coded paper-mm sizes (text height, tick length,
   * arrowhead size) into pixels.  Formula:
   *
   *     paperMmToPx = (sheetScale × camera.scale) / 1000
   *
   * At a default 1:50 sheet and 50 px/m camera, this yields 2.5 px per
   * paper-mm, so a 2.5-mm dim text renders at ~6 px (matching the
   * annotation pipeline's `resolveFontSizePx` floor).
   */
  private commitAutoDimensions(
    ctx: PlanRenderingContext2D,
    dpr: number,
    walls: readonly Wall[],
    doors: readonly Door[],
    windows: readonly Window[],
    rooms: readonly PlanRoomPolygon[],
    levelId: string,
  ): void {
    const settings = this.resolveAutoDimSettings();
    if (!settings || settings.autoDimensionMode === 'off') return;

    const viewId = this.interactionOpts.viewId ?? 'plan-view-default';

    // 1. Producer snapshot — id-and-levelId only (the producer is L4 pure
    //    and doesn't touch geometry, only counts elements per mode).
    const producerSnapshot: DimensionElementSnapshot = {
      walls: walls.map((w) => ({ id: w.id, levelId: w.levelId })),
      doors: doors.map((d) => ({ id: d.id })),
      windows: windows.map((w) => ({ id: w.id })),
      // Rooms in this snapshot have already been level-filtered upstream
      // (see `collectRoomsForLevel`), so the producer's per-level filter
      // re-applies trivially against `levelId`.
      rooms: rooms.map((r) => ({ id: r.elementId, levelId })),
    };

    const req: DimensionRequest = {
      mode: settings.autoDimensionMode as DimensionRequest['mode'],
      viewId,
      ...(levelId ? { levelId } : {}),
      ...(settings.autoDimensionOffset !== undefined
        ? { offsetMm: settings.autoDimensionOffset }
        : {}),
    };

    const produced = produceDimensions(req, producerSnapshot, this.dimensionIdFactory);
    if (produced.length === 0) return;

    // 2. Evaluator snapshot — Map<id, *LikeEvaluator>.  Wall / Door /
    //    Window schemas are structurally compatible with the evaluator's
    //    *Like shapes; Room needs a small adapter (host's PlanViewRoomLike
    //    stores the polygon as `{x, y}` where `y` carries world-Z).
    const evalSnapshot: ElementSnapshotForDim = {
      walls: new Map(walls.map((w) => [w.id, w as unknown as WallLikeEvaluator])),
      doors: new Map(doors.map((d) => [d.id, d as unknown as DoorLikeEvaluator])),
      windows: new Map(windows.map((w) => [w.id, w as unknown as WindowLikeEvaluator])),
      rooms: new Map(rooms.map((r) => [r.elementId, roomToEvaluatorShape(r)])),
    };

    const evaluated = evaluateDimensions(produced, evalSnapshot, this.projectUnits);
    if (evaluated.length === 0) return;

    // 3. Pre-project world-mm → CSS-pixels with the annotation pipeline's
    //    Z-flip.  Camera scale is px/m, so (mm/1000)*scale = px.
    const c = this.camera;
    const k = c.scale / 1000; // px per world-mm
    const stringMap = new Map<string, DimensionString>(
      produced.map((s) => [s.id as string, s]),
    );
    const projected: EvaluatedDimension[] = evaluated.map((e) => {
      const str = stringMap.get(e.id as string);
      const orientation = str?.orientation ?? 'horizontal';
      // p1 / p2 / witness — full XZ projection.
      const p1: readonly [number, number] = [
        c.panX + e.p1World[0] * k,
        c.panY - e.p1World[1] * k,
      ];
      const p2: readonly [number, number] = [
        c.panX + e.p2World[0] * k,
        c.panY - e.p2World[1] * k,
      ];
      const wit1: readonly [number, number] = [
        c.panX + e.witnessP1[0] * k,
        c.panY - e.witnessP1[1] * k,
      ];
      const wit2: readonly [number, number] = [
        c.panX + e.witnessP2[0] * k,
        c.panY - e.witnessP2[1] * k,
      ];
      // lineY: scalar — semantically the dim line's Y for horizontal
      // dims (project as Y with flip) or X for vertical dims (project as
      // X without flip).  'aligned' / 'angular' fall through to the
      // horizontal-Y branch (the committer ignores `lineY` for those
      // anyway — see `computeDimLineEndpoints`).
      const lineYpx =
        orientation === 'vertical'
          ? c.panX + e.lineY * k
          : c.panY - e.lineY * k;
      return {
        id: e.id,
        valueText: e.valueText,
        valueMm: e.valueMm,
        p1World: p1,
        p2World: p2,
        lineY: lineYpx,
        witnessP1: wit1,
        witnessP2: wit2,
        isOverride: e.isOverride,
        isFlagged: e.isFlagged,
      };
    });

    // 4. Commit.  Identity-with-DPR matrix scales CSS-pixel coords to the
    //    device-pixel backing store.  `paperMmToPx` converts the
    //    committer's hard-coded paper-mm size constants to pixels at the
    //    current zoom (sheet-stable rendering).
    const paperMmToPx = (this.dimensionSheetScale * c.scale) / 1000;
    const identityWithDpr: ViewTransformMatrix = {
      a: dpr, b: 0, c: 0, d: dpr, e: 0, f: 0,
    };
    commitDimensions(
      ctx as unknown as Canvas2DLike,
      projected,
      stringMap,
      paperMmToPx,
      identityWithDpr,
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Apply the camera transform composed with the DPR backing-store scale.
   * The camera works in CSS pixels; the canvas backing store is in device
   * pixels — multiplying through here keeps the renderer DPR-agnostic.
   */
  private applyCameraWithDpr(ctx: PlanRenderingContext2D, dpr: number): void {
    const c = this.camera;
    ctx.setTransform(
      c.scale * dpr, 0,
      0, c.scale * dpr,
      c.panX * dpr, c.panY * dpr,
    );
  }

  private currentDpr(): number {
    if (typeof globalThis !== 'undefined') {
      const w = (globalThis as { devicePixelRatio?: number }).devicePixelRatio;
      if (typeof w === 'number' && Number.isFinite(w) && w > 0) return w;
    }
    return 1;
  }

  private attachResizeObserver(container: HTMLElement): void {
    const ResizeObs = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    if (!ResizeObs) return; // headless / tests / Node — no DOM observer.
    try {
      this.resizeObserver = new ResizeObs(() => {
        if (this.syncCanvasSize(container)) this.requestRender();
      });
      this.resizeObserver.observe(container);
    } catch {
      this.resizeObserver = null;
    }
  }

  /** Returns true iff the canvas dimensions changed. */
  private syncCanvasSize(container: HTMLElement): boolean {
    const c = container as HTMLElement & { clientWidth?: number; clientHeight?: number };
    const cssW = isFiniteNumber(c.clientWidth) ? c.clientWidth : 0;
    const cssH = isFiniteNumber(c.clientHeight) ? c.clientHeight : 0;
    if (cssW <= 0 || cssH <= 0) return false;
    const dpr = this.hiDpi ? this.currentDpr() : 1;
    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);
    let changed = false;
    if (this.canvas.width !== targetW)  { this.canvas.width = targetW;  changed = true; }
    if (this.canvas.height !== targetH) { this.canvas.height = targetH; changed = true; }
    if (changed) {
      const style = (this.canvas as HTMLCanvasElement & { style?: CSSStyleDeclaration }).style;
      if (style) {
        style.width = `${cssW}px`;
        style.height = `${cssH}px`;
      }
    }
    return changed;
  }

  private collectByLevel<T>(
    state: ReadonlyMap<string, T>,
    levelId: string,
    keyOf: (item: T) => string,
  ): T[] {
    const out: T[] = [];
    for (const item of state.values()) {
      if (keyOf(item) === levelId) out.push(item);
    }
    return out;
  }

  private collectRoomsForLevel(levelId: string): PlanRoomPolygon[] | undefined {
    if (!this.roomStore) return undefined;
    const out: PlanRoomPolygon[] = [];
    for (const r of this.roomStore.getState().values()) {
      if (r.levelId !== levelId) continue;
      out.push({
        elementId: r.id,
        polygon: r.polygon,
        fill: r.fill ?? 'rgba(0, 120, 200, 0.06)',
      });
    }
    return out;
  }

  private collectAnnotationsForLevel(levelId: string): PlanAnnotationLabel[] | undefined {
    if (!this.annotationStore) return undefined;
    const out: PlanAnnotationLabel[] = [];
    for (const a of this.annotationStore.getState().values()) {
      // Accept annotations scoped to either this level OR a view that
      // is currently the active level's primary plan view.
      if (a.levelId && a.levelId !== levelId) continue;
      // anchor.y carries world-Z in the kernel convention; if the
      // annotation comes from a Vec3 source its `.z` field is the
      // canonical world-Z, falling back to `.y` for legacy pipelines.
      const anchorY = isFiniteNumber(a.anchor.z) ? a.anchor.z
                     : isFiniteNumber(a.anchor.y) ? a.anchor.y : 0;
      out.push({
        anchor: { x: a.anchor.x, y: anchorY },
        text: a.text,
        rotation: a.rotation,
        textHeightMm: a.textHeightMm,
        color: a.color,
      });
    }
    return out;
  }

  /**
   * Adapt the optional annotation store into S32 `AnnotationDto[]`.
   *
   * This adapter is the host's single integration point with the new
   * pipeline (ADR-0024 §2 — host owns the schema → DTO translation).
   * The DTO is always produced in canvas CSS-pixel-friendly form: text
   * sizes resolve from `textHeightMm` × sheet scale, world points stay
   * in WORLD XZ (the layout's `worldToCanvas` projects them).
   */
  private collectAnnotationDtos(levelId: string): AnnotationDto[] {
    if (!this.annotationStore) return [];
    const out: AnnotationDto[] = [];
    for (const a of this.annotationStore.getState().values()) {
      if (a.levelId && a.levelId !== levelId) continue;
      const kind = a.kind ?? 'text';
      const anchorZ = isFiniteNumber(a.anchor.z) ? a.anchor.z
                     : isFiniteNumber(a.anchor.y) ? a.anchor.y : 0;
      const anchor: Vec2 = [a.anchor.x, anchorZ];
      const dto: AnnotationDto = {
        id: a.id,
        type: kind,
        text: a.text,
        anchor,
        rotation: a.rotation,
        // Resolve mm-on-sheet → CSS-pixel font size.  At 1:50 sheet,
        // 2.5 mm of paper text ≈ 11 px on screen at default zoom — the
        // committer treats fontSize as CSS px, so we apply the camera
        // scale here to keep text "sheet-stable" through zoom.
        fontSize: this.resolveFontSizePx(a.textHeightMm),
        leaderPoints: a.leaderPoints?.map((p) => [p.x, p.z] as Vec2),
        leaderPoint: a.leaderPoint ? [a.leaderPoint.x, a.leaderPoint.z] as Vec2 : undefined,
        calloutBoxWidth: a.calloutBoxWidth,
        calloutBoxHeight: a.calloutBoxHeight,
        polygon: a.polygon?.map((p) => [p.x, p.z] as Vec2),
        fillColor: a.fillColor,
        fillOpacity: a.fillOpacity,
        strokeColor: a.strokeColor,
      };
      out.push(dto);
    }
    return out;
  }

  /**
   * Convert sheet-scale mm into CSS-pixel font size at the current camera
   * scale.  At 1:50 sheet, 1 mm of paper = 50 mm of world = 0.05 m;
   * one world metre at scale `s` covers `s` CSS pixels; therefore one
   * sheet-mm of text = `0.05 × s` CSS pixels at zoom-1.  We clamp to a
   * minimum of 6 px so deeply-zoomed-out plans don't render unreadable
   * sub-pixel text (architectural standard: minimum legible text is 6 pt).
   */
  private resolveFontSizePx(textHeightMm?: number): number {
    const mm = isFiniteNumber(textHeightMm) ? textHeightMm : 2.5;
    // Sheet scale is owned by the renderer; the host doesn't see it
    // directly.  Hard-coded to the renderer's default (50) here — the
    // S33 work that adds per-view sheet scale will read it from the
    // ViewTemplate instead.
    const sheetScale = 50;
    const worldMetres = (mm * sheetScale) / 1000;
    return Math.max(6, worldMetres * this.camera.scale);
  }
}

// ── Pure helpers (kept module-private — shape mirrors S29 projection.ts) ───

function slabOutlinePoints(slab: Slab): { x: number; y: number }[] {
  // The slab schema carries a footprint polygon as `points` in some shapes
  // and `outline` in others; we normalise here.
  const raw = (slab as unknown as {
    points?: Array<{ x: number; z?: number; y?: number }>;
    outline?: Array<{ x: number; z?: number; y?: number }>;
  });
  const src = raw.points ?? raw.outline ?? [];
  return src.map((p) => ({
    x: p.x,
    y: isFiniteNumber(p.z) ? p.z : (isFiniteNumber(p.y) ? p.y : 0),
  }));
}

function computeDoorBreaks(walls: readonly Wall[], doors: readonly Door[]): PlanDoorBreak[] {
  if (walls.length === 0 || doors.length === 0) return [];
  const wallsById = new Map<string, Wall>();
  for (const w of walls) wallsById.set(w.id, w);

  const out: PlanDoorBreak[] = [];
  for (const door of doors) {
    const wall = wallsById.get(door.wallId);
    if (!wall) continue;
    const [a, b] = wall.baseLine;
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const ux = dx / len, uz = dz / len;
    const start = door.offset;
    const end = door.offset + door.width;
    if (end < 0 || start > len) continue;
    const s = Math.max(0, start);
    const e = Math.min(len, end);
    out.push({
      ax: a.x + ux * s, ay: a.z + uz * s,
      bx: a.x + ux * e, by: a.z + uz * e,
      thickness: wall.thickness,
    });
  }
  return out;
}

// (S29 left a `type Slab = import('@pryzm/schemas').Slab;` re-import here as a
// "wider-import comment".  Removed at S32 — the named import on the top of
// this file already provides `Slab`, and the duplicate alias was a TS2440
// `Import declaration conflicts with local declaration` waiting to trigger
// the moment the package was strict-type-checked in isolation.)

// ── S35 supplement helpers ────────────────────────────────────────────────

/**
 * Adapt the renderer's `PlanRoomPolygon` (polygon: `{x, y}[]`, where `y`
 * carries world-Z per `PlanViewRoomLike`'s doc-comment and the kernel
 * projection convention) into the kernel evaluator's `RoomLikeEvaluator`
 * (boundary: `{x, y, z}[]` with the planar axes in x/z and `y` reserved
 * for vertical elevation).
 *
 * `RoomLikeEvaluator.boundary[].y` is the elevation of the room footprint
 * (always 0 in plan view — rooms are drawn at the level base).  The
 * evaluator only reads the XZ pair when resolving Room anchors.
 */
function roomToEvaluatorShape(r: PlanRoomPolygon): RoomLikeEvaluator {
  return {
    id: r.elementId,
    boundary: r.polygon.map((p) => ({ x: p.x, y: 0, z: p.y })),
  };
}

/**
 * Process-wide monotonic id factory used by the auto-dim pipeline when the
 * caller doesn't supply one.  Stable across host instances within one
 * process so a window resize / re-render of the same view yields the same
 * dim-id sequence (matters for snapshot-stable visual diffs at S36).
 *
 * Production callers should pass a crypto-grade factory via
 * `PlanViewCanvasHostOptions.dimensionIdFactory` (e.g. `() => 'dim-' + ulid()`).
 */
let _DEFAULT_DIM_ID_COUNTER = 0;
function makeDefaultDimensionIdFactory(): () => string {
  return () =>
    `dim-auto-${(++_DEFAULT_DIM_ID_COUNTER).toString().padStart(8, '0')}`;
}
