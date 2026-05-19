// CanvasHost — abstract base for any 2D-canvas overlay subsystem.
//
// `code-level ADR docs/architecture/adr/0028-plan-view-canvas-architecture.md`.
//
// Lives here in `plugins/plan-view/` for now; the spec mentions a future
// `@pryzm/ui/CanvasHost` package but no such package exists today.
// Promote when section views (S30) need a sibling subclass.
//
// Lifecycle:
//   * `mount(container)` — appends the canvas element, wires resize +
//     tickListener (`render` priority) and dirty-flag drain.
//   * `requestRender()` — flips the dirty flag and asks the scheduler
//     for an `'interaction'` frame.  The next tick drains.
//   * `dispose()` — removes the canvas, unsubscribes everything.
//
// Idle behaviour: if `requestRender()` is never called, no frame request
// is issued and the FrameScheduler stops the rAF loop (see
// `IdleContinuation` budget) — true 0 fps idle.

import type { FrameScheduler, TickListenerDisposer } from '@pryzm/plugin-sdk';

export type CanvasFactory = () => HTMLCanvasElement;

export interface CanvasHostOptions {
  readonly scheduler: FrameScheduler;
  readonly canvasFactory?: CanvasFactory;
  /** Unique listener id; defaults to `<storeKey>-render`. */
  readonly listenerId?: string;
}

const DEFAULT_FACTORY: CanvasFactory = () => document.createElement('canvas');

export abstract class CanvasHost {
  protected readonly scheduler: FrameScheduler;
  protected readonly canvas: HTMLCanvasElement;
  protected dirty = true;
  /** Number of `render()` calls — useful for tests that check 0-fps-idle. */
  renderCount = 0;
  /** Number of times the scheduler tick was drained (irrespective of dirty state). */
  tickCount = 0;

  private container: HTMLElement | null = null;
  private listenerDisposer: TickListenerDisposer | null = null;
  private readonly listenerId: string;

  constructor(opts: CanvasHostOptions) {
    this.scheduler = opts.scheduler;
    const factory = opts.canvasFactory ?? DEFAULT_FACTORY;
    this.canvas = factory();
    this.listenerId = opts.listenerId ?? `${this.subsystemId()}-render`;
  }

  /** Subsystem identity — subclasses override to scope listener ids and frame reasons. */
  protected abstract subsystemId(): string;

  /** Attach to a host element + start listening. Idempotent. */
  mount(container: HTMLElement): void {
    if (this.container !== null) return;
    this.container = container;
    container.appendChild(this.canvas);
    this.attachScheduler();
    // First mount paints once.
    this.requestRender();
  }

  /** Remove the canvas + drop subscriptions. Idempotent. */
  dispose(): void {
    if (this.listenerDisposer) {
      this.listenerDisposer();
      this.listenerDisposer = null;
    }
    if (this.container && this.canvas.parentElement === this.container) {
      this.container.removeChild(this.canvas);
    }
    this.container = null;
  }

  /** Mark dirty + ask scheduler for a frame. */
  requestRender(): void {
    this.dirty = true;
    this.scheduler.requestFrame(`${this.subsystemId()}-dirty`, 'interaction');
  }

  /** Subclasses implement the actual draw — only called when `this.dirty` is true. */
  protected abstract render(): void;

  private attachScheduler(): void {
    this.listenerDisposer = this.scheduler.addTickListener(
      this.listenerId,
      () => {
        this.tickCount++;
        if (!this.dirty) return;
        this.dirty = false;
        this.renderCount++;
        this.render();
      },
      'render',
    );
  }
}
