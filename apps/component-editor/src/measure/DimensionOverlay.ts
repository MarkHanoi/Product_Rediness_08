// DimensionOverlay — the ANNOTATION LAYER: a canvas stacked over the sketch
// canvas that draws placed dimensions and, when armed, places new ones.
//
// ─── WHY A SEPARATE LAYER RATHER THAN A SKETCH TOOL ─────────────────────────
// SPEC-AUTODIMENSION §12.1 ranks annotation SEPARATELY from geometry and §12.9
// forbids a lower rank from interfering with a higher one. A distinct layer is
// the structural form of that rule: dimensions cannot perturb the geometry
// pass, and the geometry pass cannot repaint over them.
//
// It is also what let this land WITHOUT editing `SketchCanvas.ts`,
// `SketchToolbar.ts`, `tools/types.ts`, `hitTest.ts`, `sketchRender.ts` or
// `entities.ts` — every one of which another lane is editing concurrently in
// this same tree. Touching them would have been a merge collision for a
// design that is worse on the merits.
//
// ─── P6 ─────────────────────────────────────────────────────────────────────
// Placing a dimension DISPATCHES `dimension.place` on the command bus. This
// overlay never writes `dimensionStore` or `constraintStore` directly, so
// every placement is undoable and carries its OTel span.
//
// ─── CAMERA ─────────────────────────────────────────────────────────────────
// The overlay derives its `ViewState` from the shared `sketchViewStore`
// camera, NOT from a private copy, so once the sketcher grows pan/zoom both
// layers already read the same number. Until then the sketcher is fixed at
// `defaultView()` (zoom 1, pan 0) and the store's default matches it exactly.
//
// LAYER — L7 chrome-side. No THREE, no rAF (paints via `queueMicrotask`, as
// `SketchCanvas.ts` does), no `(window as any)`.

import type { CommandBus } from '../app/commandBus.js';
import type { EntityId } from '../sketch/entities.js';
import { hitTest } from '../sketch/hitTest.js';
import { defaultView, canvasToWorld, type ViewState } from '../sketch/transform.js';
import type { DimensionStore } from '../stores/dimensionStore.js';
import type { SketchDocStore } from '../stores/sketchDocStore.js';
import type { SketchViewStore } from '../views/sketchViewStore.js';
import type { SketchViewKind } from '../views/viewProjection.js';
import { PLACE_DIMENSION_VERB, type PlaceDimensionArgs } from '../commands/dimension/index.js';
import { drawDimensions } from './dimensionRender.js';
import type { DimensionStringRank } from './dimension.js';

const PICK_RADIUS_PX = 10;
const FALLBACK_W = 800;
const FALLBACK_H = 600;

export interface DimensionOverlayMount {
  readonly element: HTMLCanvasElement;
  /** Arm/disarm placement. Disarmed, the layer is `pointer-events:none` so
   *  every click falls through to the sketch canvas beneath it. */
  setArmed(armed: boolean): void;
  isArmed(): boolean;
  /** Swap the document the overlay annotates (called on a view switch). */
  setDocument(view: SketchViewKind, doc: SketchDocStore): void;
  /** Re-read the host's size and repaint. */
  resize(): void;
  /** First picked point while placing, or `null`. Test seam. */
  pendingPoint(): EntityId | null;
  unmount(): void;
}

export interface DimensionOverlayOptions {
  readonly commandBus: CommandBus;
  readonly dimensionStore: DimensionStore;
  readonly viewStore: SketchViewStore;
  readonly view: SketchViewKind;
  readonly doc: SketchDocStore;
  /** §12.2 string rank applied to placements. Defaults to `null` (§12.3 interior). */
  readonly stringRank?: DimensionStringRank;
  /** Surfaced to the author; defaults to a no-op so a rejected placement
   *  never throws into a pointer handler. */
  readonly onError?: (err: unknown) => void;
  /** Progress text for the host's status line. */
  readonly onHint?: (hint: string) => void;
}

const HINT_IDLE = 'Dimension: click the first point.';
const HINT_ARMED = 'Dimension: click the second point (Esc cancels).';

export function mountDimensionOverlay(
  host: HTMLElement,
  opts: DimensionOverlayOptions,
): DimensionOverlayMount {
  const canvas = document.createElement('canvas');
  canvas.dataset.role = 'dimension-overlay';
  canvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
  host.appendChild(canvas);

  let view: SketchViewKind = opts.view;
  let doc: SketchDocStore = opts.doc;
  let armed = false;
  let first: EntityId | null = null;
  let unsubDoc: () => void = doc.subscribe(() => schedulePaint());
  const unsubDims = opts.dimensionStore.subscribe(() => schedulePaint());
  const unsubView = opts.viewStore.subscribe(() => schedulePaint());

  function viewState(): ViewState {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width || FALLBACK_W));
    const h = Math.max(1, Math.floor(rect.height || FALLBACK_H));
    const cam = opts.viewStore.cameraOf(view);
    return {
      ...defaultView(w, h),
      zoom: cam.zoom,
      panX: cam.panX,
      panZ: cam.panZ,
    };
  }

  function paint(): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const state = viewState();
    ctx.clearRect(0, 0, state.canvasW, state.canvasH);
    drawDimensions(ctx, doc.get(), opts.dimensionStore.get().byView[view], state);
  }

  let painting = false;
  function schedulePaint(): void {
    if (painting) return;
    painting = true;
    queueMicrotask(() => {
      painting = false;
      paint();
    });
  }

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width || FALLBACK_W));
    canvas.height = Math.max(1, Math.floor(rect.height || FALLBACK_H));
    schedulePaint();
  }

  function place(p1: EntityId, p2: EntityId): void {
    const args: PlaceDimensionArgs = {
      view,
      p1,
      p2,
      ...(opts.stringRank !== undefined ? { stringRank: opts.stringRank } : {}),
    };
    // Fire-and-report. `execute` is async because the bus wraps every dispatch
    // in a span; a pointer handler cannot await, so the rejection is routed to
    // `onError` instead of becoming an unhandled rejection.
    void opts.commandBus.execute(PLACE_DIMENSION_VERB, args).catch((err) => {
      opts.onError?.(err);
    });
  }

  function onPointerDown(e: PointerEvent): void {
    if (!armed) return;
    const rect = canvas.getBoundingClientRect();
    const state = viewState();
    const world = canvasToWorld(
      { px: e.clientX - rect.left, py: e.clientY - rect.top },
      state,
    );
    const hit = hitTest({
      x: world.x,
      z: world.z,
      entities: doc.get().entities,
      tolMm: PICK_RADIUS_PX / state.zoom,
    });
    // Only a POINT can carry a dimension — a dimension between two lines is a
    // different (and legitimate) primitive this lane did not build, and
    // silently dimensioning a line's midpoint instead would be a wrong answer
    // dressed as a working one.
    if (hit.id === null || hit.kind !== 'point') return;
    if (first === null) {
      first = hit.id;
      opts.onHint?.(HINT_ARMED);
      return;
    }
    if (hit.id === first) return;
    place(first, hit.id);
    first = null;
    opts.onHint?.(HINT_IDLE);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && first !== null) {
      first = null;
      opts.onHint?.(HINT_IDLE);
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  host.ownerDocument.addEventListener('keydown', onKeyDown);
  resize();

  return {
    element: canvas,
    setArmed(next) {
      armed = next;
      canvas.style.pointerEvents = next ? 'auto' : 'none';
      canvas.style.cursor = next ? 'crosshair' : 'default';
      if (!next) first = null;
      opts.onHint?.(next ? HINT_IDLE : '');
    },
    isArmed: () => armed,
    setDocument(nextView, nextDoc) {
      unsubDoc();
      view = nextView;
      doc = nextDoc;
      first = null;
      unsubDoc = doc.subscribe(() => schedulePaint());
      schedulePaint();
    },
    resize,
    pendingPoint: () => first,
    unmount() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      host.ownerDocument.removeEventListener('keydown', onKeyDown);
      unsubDoc();
      unsubDims();
      unsubView();
      canvas.remove();
    },
  };
}
