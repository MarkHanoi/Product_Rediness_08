// SectionTool — pointer-driven section line placement (W-09 recipe).
//
// Wave 12 recipe completion: section-view plugin tool.ts (previously missing).
//
// State machine:
//   IDLE → pointerdown (line start) → AWAITING_END
//   AWAITING_END → pointerdown (line end) → dispatch section.create → IDLE
//   Any state → Escape → IDLE

/** Loose CommandBus shape — avoids a direct @pryzm/command-bus import. */
export interface SectionCommandBus {
  executeCommand<T>(type: string, payload: T): Promise<unknown>;
}

export type ScreenToWorldFn = (
  offsetX: number,
  offsetY: number,
) => { readonly x: number; readonly y: number };

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface SectionCreatePayload {
  readonly line: {
    readonly a: Vec2;
    readonly b: Vec2;
    readonly lookDepth: number;
  };
  readonly mark?: string;
  readonly scale?: number;
}

export interface SectionToolOptions {
  readonly canvas: HTMLCanvasElement;
  readonly commandBus: SectionCommandBus;
  readonly screenToWorld: ScreenToWorldFn;
  readonly defaultDepth?: number;
  readonly defaultScale?: number;
  readonly onError?: (err: unknown) => void;
  readonly onDispatch?: (payload: SectionCreatePayload) => void;
}

type ToolState = 'idle' | 'awaiting-end';

export class SectionTool {
  private readonly canvas: HTMLCanvasElement;
  private readonly commandBus: SectionCommandBus;
  private readonly screenToWorld: ScreenToWorldFn;
  private readonly defaultDepth: number;
  private readonly defaultScale: number;
  private readonly onError: (err: unknown) => void;
  private readonly onDispatch?: (payload: SectionCreatePayload) => void;

  private state: ToolState = 'idle';
  private lineStart: Vec2 | null = null;
  private disposed = false;

  private readonly ptrDownHandler: (e: PointerEvent) => void;
  private readonly keyDownHandler: (e: KeyboardEvent) => void;

  constructor(opts: SectionToolOptions) {
    this.canvas = opts.canvas;
    this.commandBus = opts.commandBus;
    this.screenToWorld = opts.screenToWorld;
    this.defaultDepth = opts.defaultDepth ?? 10;
    this.defaultScale = opts.defaultScale ?? 100;
    this.onError = opts.onError ?? ((err) => {
      // eslint-disable-next-line no-console
      console.error('[SectionTool] error:', err);
    });
    this.onDispatch = opts.onDispatch;

    this.ptrDownHandler = this.onPointerDown.bind(this);
    this.keyDownHandler = this.onKeyDown.bind(this);
    this.canvas.addEventListener('pointerdown', this.ptrDownHandler);
    window.addEventListener('keydown', this.keyDownHandler);
  }

  cancel(): void {
    this.state = 'idle';
    this.lineStart = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.canvas.removeEventListener('pointerdown', this.ptrDownHandler);
    window.removeEventListener('keydown', this.keyDownHandler);
    this.disposed = true;
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.disposed) return;
    const pt = this.screenToWorld(e.offsetX, e.offsetY);
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
      this.onError(new Error(`[SectionTool] screenToWorld returned non-finite point`));
      return;
    }
    if (this.state === 'idle') {
      this.lineStart = pt;
      this.state = 'awaiting-end';
    } else if (this.state === 'awaiting-end' && this.lineStart) {
      const payload: SectionCreatePayload = {
        line: { a: this.lineStart, b: pt, lookDepth: this.defaultDepth },
        scale: this.defaultScale,
      };
      this.state = 'idle';
      this.lineStart = null;
      this.onDispatch?.(payload);
      this.commandBus.executeCommand('section.create', payload).catch(this.onError);
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.disposed) return;
    if (e.key === 'Escape') this.cancel();
  }
}
