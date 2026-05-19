// TextNoteTool — pointer-driven annotation creation (S34 / ADR-0026).
//
// Spec: `phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md` §S34 Track B (line 98)
// — "plugins/annotations/tool.ts — annotation tools".
//
// The tool is intentionally minimal in S34: a single `'click'` on the
// canvas creates a `text-note` annotation at the projected world point.
// Richer tools (leader, callout, region) follow the same shape — each
// owns its own `dispatch('annotation.create', { kind, anchor, … })`
// payload and lives behind its own activator.
//
// We type the bus loosely as `AnnotationCommandBus` so this plugin stays
// decoupled from `@pryzm/command-bus` (the host wires in the real bus).
// Same pattern as `plugins/plan-view/src/selection.ts`.
//
// Coordinate convention: `screenToWorld(offsetX, offsetY)` returns the
// canvas-local pixel point projected into world space.  In plan view the
// projector is `PlanCamera.screenToWorld`; in 3D it's a raycast onto the
// active ground plane.  Both expose the same `(x, y, z)` shape so this
// tool is view-agnostic.

/** Loose CommandBus shape — keeps cross-package coupling thin. */
export interface AnnotationCommandBus {
  executeCommand<T>(type: string, payload: T): Promise<unknown>;
}

/** World-space resolver: canvas pixel → 3D world point. */
export type ScreenToWorldFn = (
  offsetX: number,
  offsetY: number,
) => { readonly x: number; readonly y: number; readonly z: number };

export interface TextNoteToolOptions {
  readonly canvas: HTMLCanvasElement;
  readonly commandBus: AnnotationCommandBus;
  readonly screenToWorld: ScreenToWorldFn;
  /** Owning view id — written into every created annotation's `viewId`. */
  readonly viewId: string;
  /** Default text written into the new annotation.  Empty string by default
   *  — callers typically open an inline editor on the returned id. */
  readonly defaultText?: string;
  /** Default text height in mm at sheet scale.  Schema default is 2.5. */
  readonly defaultTextHeightMm?: number;
  /** Optional sink for unhandled async dispatch errors.  Defaults to
   *  `console.error` so we never silently swallow a bus rejection. */
  readonly onError?: (err: unknown) => void;
  /** Optional callback fired right before `executeCommand` is called.
   *  Mostly useful for tests; production code listens on the
   *  `AnnotationStore.subscribeDirty` instead. */
  readonly onDispatch?: (payload: TextNoteCreatePayload) => void;
}

/** What `TextNoteTool` dispatches as the body of `annotation.create`. */
export interface TextNoteCreatePayload {
  readonly kind: 'text-note';
  readonly viewId: string;
  readonly anchor: { x: number; y: number; z: number };
  readonly text: string;
  readonly textHeightMm: number;
}

/**
 * Pointer tool that creates `text-note` annotations on canvas click.
 *
 * Construct once per active tool session; call `dispose()` when the
 * user switches tools.  Idempotent dispose.
 */
export class TextNoteTool {
  private readonly canvas: HTMLCanvasElement;
  private readonly commandBus: AnnotationCommandBus;
  private readonly screenToWorld: ScreenToWorldFn;
  private readonly viewId: string;
  private readonly defaultText: string;
  private readonly defaultTextHeightMm: number;
  private readonly onError: (err: unknown) => void;
  private readonly onDispatch?: (payload: TextNoteCreatePayload) => void;
  private readonly clickHandler: (e: MouseEvent) => void;
  private disposed = false;

  constructor(opts: TextNoteToolOptions) {
    this.canvas = opts.canvas;
    this.commandBus = opts.commandBus;
    this.screenToWorld = opts.screenToWorld;
    this.viewId = opts.viewId;
    this.defaultText = opts.defaultText ?? '';
    this.defaultTextHeightMm = opts.defaultTextHeightMm ?? 2.5;
    this.onError = opts.onError ?? ((err) => {
      // eslint-disable-next-line no-console
      console.error('[TextNoteTool] command bus rejected:', err);
    });
    this.onDispatch = opts.onDispatch;

    this.clickHandler = this.onClick.bind(this);
    this.canvas.addEventListener('click', this.clickHandler);
  }

  /** Tear down DOM listeners.  Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.canvas.removeEventListener('click', this.clickHandler);
    this.disposed = true;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private onClick(e: MouseEvent): void {
    if (this.disposed) return;
    const anchor = this.screenToWorld(e.offsetX, e.offsetY);
    if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) || !Number.isFinite(anchor.z)) {
      // Defence-in-depth: never dispatch a malformed command.  A
      // misconfigured projector would produce NaN here.
      this.onError(new Error(`[TextNoteTool] screenToWorld returned non-finite anchor: ${JSON.stringify(anchor)}`));
      return;
    }

    const payload: TextNoteCreatePayload = {
      kind: 'text-note',
      viewId: this.viewId,
      anchor: { x: anchor.x, y: anchor.y, z: anchor.z },
      text: this.defaultText,
      textHeightMm: this.defaultTextHeightMm,
    };
    if (this.onDispatch) this.onDispatch(payload);

    let promise: Promise<unknown>;
    try {
      promise = this.commandBus.executeCommand('annotation.create', payload);
    } catch (err) {
      this.onError(err);
      return;
    }
    promise.catch(this.onError);
  }
}
