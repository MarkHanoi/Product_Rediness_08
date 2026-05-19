// DimensionTool — pointer-driven dimension placement (S29 / ADR-0028).
//
// Wave 12 recipe completion: dimensions plugin tool.ts (previously missing).
//
// State machine:
//   IDLE → onPointerDown (1st point) → AWAITING_END
//   AWAITING_END → onPointerDown (2nd point) → dispatch dimension.create → IDLE
//   Any state → Escape → IDLE
//
// All imports from @pryzm/plugin-sdk only (L8 boundary rule).

/** Loose CommandBus surface — keeps cross-package coupling thin. */
export interface DimensionCommandBus {
  executeCommand<T>(type: string, payload: T): Promise<unknown>;
}

/** World-space resolver: canvas pixel → 3D world point. */
export type ScreenToWorldFn = (
  offsetX: number,
  offsetY: number,
) => { readonly x: number; readonly y: number; readonly z: number };

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface DimensionCreatePayload {
  readonly kind: 'linear';
  readonly points: readonly [Vec3, Vec3];
  readonly viewId: string;
  readonly unit?: 'mm' | 'cm' | 'm' | 'in' | 'ft';
}

export interface DimensionToolOptions {
  readonly canvas: HTMLCanvasElement;
  readonly commandBus: DimensionCommandBus;
  readonly screenToWorld: ScreenToWorldFn;
  readonly viewId: string;
  readonly unit?: 'mm' | 'cm' | 'm' | 'in' | 'ft';
  readonly onError?: (err: unknown) => void;
  readonly onDispatch?: (payload: DimensionCreatePayload) => void;
}

type ToolState = 'idle' | 'awaiting-end';

/**
 * Pointer tool that creates linear dimensions between two world points.
 *
 * Construct once per active tool session; call `dispose()` on tool switch.
 */
export class DimensionTool {
  private readonly canvas: HTMLCanvasElement;
  private readonly commandBus: DimensionCommandBus;
  private readonly screenToWorld: ScreenToWorldFn;
  private readonly viewId: string;
  private readonly unit: 'mm' | 'cm' | 'm' | 'in' | 'ft';
  private readonly onError: (err: unknown) => void;
  private readonly onDispatch?: (payload: DimensionCreatePayload) => void;

  private state: ToolState = 'idle';
  private firstPoint: Vec3 | null = null;
  private disposed = false;

  private readonly ptrDownHandler: (e: MouseEvent) => void;
  private readonly keyDownHandler: (e: KeyboardEvent) => void;

  constructor(opts: DimensionToolOptions) {
    this.canvas = opts.canvas;
    this.commandBus = opts.commandBus;
    this.screenToWorld = opts.screenToWorld;
    this.viewId = opts.viewId;
    this.unit = opts.unit ?? 'mm';
    this.onError = opts.onError ?? ((err) => {
      // eslint-disable-next-line no-console
      console.error('[DimensionTool] error:', err);
    });
    this.onDispatch = opts.onDispatch;

    this.ptrDownHandler = this.onPointerDown.bind(this);
    this.keyDownHandler = this.onKeyDown.bind(this);

    this.canvas.addEventListener('pointerdown', this.ptrDownHandler);
    window.addEventListener('keydown', this.keyDownHandler);
  }

  /** Cancel the current placement and return to idle. */
  cancel(): void {
    this.state = 'idle';
    this.firstPoint = null;
  }

  /** Tear down DOM listeners. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.canvas.removeEventListener('pointerdown', this.ptrDownHandler);
    window.removeEventListener('keydown', this.keyDownHandler);
    this.disposed = true;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private onPointerDown(e: MouseEvent): void {
    if (this.disposed) return;
    const pt = this.screenToWorld(e.offsetX, e.offsetY);
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y) || !Number.isFinite(pt.z)) {
      this.onError(new Error(`[DimensionTool] screenToWorld returned non-finite: ${JSON.stringify(pt)}`));
      return;
    }

    if (this.state === 'idle') {
      this.firstPoint = pt;
      this.state = 'awaiting-end';
    } else if (this.state === 'awaiting-end' && this.firstPoint) {
      const payload: DimensionCreatePayload = {
        kind: 'linear',
        points: [this.firstPoint, pt],
        viewId: this.viewId,
        unit: this.unit,
      };
      this.state = 'idle';
      this.firstPoint = null;
      this.onDispatch?.(payload);
      this.commandBus.executeCommand('dimension.create', payload).catch(this.onError);
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.disposed) return;
    if (e.key === 'Escape') this.cancel();
  }
}
