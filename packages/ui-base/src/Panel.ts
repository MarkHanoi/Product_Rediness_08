// @pryzm/ui-base/Panel — Phase B.1 (S73-WIRE) panel lifecycle base class.
//
// Spec: `docs/00_NEW_ARCHITECTURE/phases/audits/PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md` §16.2 row B.1.
//
// Contract:
//   - constructor(host: HTMLElement, runtime: PryzmRuntime, opts?: TOpts)
//   - mount()    → idempotent; calls onMount() once; emits `pryzm.ui.<panel>.mount` span
//   - render()   → render is the only allocation site for inner DOM;
//                  emits `pryzm.ui.<panel>.render` span; safe to call repeatedly
//   - unmount()  → idempotent; calls onUnmount() once; emits `pryzm.ui.<panel>.unmount` span
//   - dispose()  → unmount() + release subscriptions tracked via track(disposable)
//
// Subclasses override the protected `onMount/onRender/onUnmount/onDispose`
// hooks. They MUST set `static panelId: string` so the OTel span name is
// stable across re-mounts. Subclasses also expose typed `runtime` access
// without performing any `(window as any)` cast — the entire purpose of
// Phase B is to remove every such cast from `src/ui/`.

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import { withPanelSpan } from './otel.js';

/** A disposer returned from store/event subscriptions. Kept structurally
 *  identical to `Disposable` in `@pryzm/runtime-composer/types` so we
 *  don't drag a deeper import into `src/ui/`. */
export interface PanelDisposable {
  dispose(): void;
}

/** Lifecycle status — enables idempotent transitions. */
type LifecycleStatus = 'constructed' | 'mounted' | 'unmounted' | 'disposed';

export interface PanelOptions {
  /** Stable panel identifier used as the OTel span attribute and the
   *  DOM `data-panel` marker. Falls back to the constructor name. */
  panelId?: string;
}

export abstract class Panel<TOpts extends PanelOptions = PanelOptions> {
  /** Subclasses set this to a stable panel ID (e.g. `'panel:property-inspector'`).
   *  When omitted, falls back to `Panel.constructor.name`. */
  static panelId: string | undefined = undefined;

  /** The DOM host that owns this panel. The panel renders into a single
   *  child element (`this.root`) so unmount is a one-line removeChild. */
  protected readonly host: HTMLElement;

  /** The typed runtime handle. Subclasses reach the engine through this
   *  field — never via `(window as any)`. */
  protected readonly runtime: PryzmRuntime;

  /** Subclass-supplied options. */
  protected readonly opts: TOpts;

  /** The single root element this panel owns inside `host`. Created in
   *  `mount()`, removed in `unmount()`. */
  protected root: HTMLElement | null = null;

  /** Subscriptions tracked here are disposed in `dispose()`. Subclasses
   *  call `this.track(store.subscribe(...))` instead of remembering the
   *  disposer manually. Idempotent; double-dispose is safe. */
  private readonly disposables: PanelDisposable[] = [];

  private status: LifecycleStatus = 'constructed';

  constructor(host: HTMLElement, runtime: PryzmRuntime, opts?: TOpts) {
    this.host = host;
    this.runtime = runtime;
    this.opts = (opts ?? ({} as TOpts));
  }

  // -------------------------------------------------------------------
  //                          Public lifecycle
  // -------------------------------------------------------------------

  /** Mount the panel into its host. Idempotent — calling twice is a no-op. */
  mount(): void {
    if (this.status === 'mounted') return;
    if (this.status === 'disposed') {
      throw new Error(`[ui-base] Panel ${this.panelId()} cannot remount after dispose`);
    }
    withPanelSpan(`pryzm.ui.${this.panelId()}.mount`, { 'pryzm.ui.panelId': this.panelId() }, () => {
      this.root = this.createRoot();
      this.host.appendChild(this.root);
      this.onMount();
      this.status = 'mounted';
    });
  }

  /** Render (or re-render) panel contents. Safe to call before mount —
   *  the render is deferred until `mount()` runs. Safe to call after
   *  unmount — it becomes a no-op. */
  render(): void {
    if (this.status !== 'mounted' || this.root === null) return;
    withPanelSpan(`pryzm.ui.${this.panelId()}.render`, { 'pryzm.ui.panelId': this.panelId() }, () => {
      this.onRender(this.root!);
    });
  }

  /** Remove the panel's DOM but keep the instance reusable. Idempotent. */
  unmount(): void {
    if (this.status !== 'mounted') return;
    withPanelSpan(`pryzm.ui.${this.panelId()}.unmount`, { 'pryzm.ui.panelId': this.panelId() }, () => {
      this.onUnmount();
      if (this.root !== null && this.root.parentNode !== null) {
        this.root.parentNode.removeChild(this.root);
      }
      this.root = null;
      this.status = 'unmounted';
    });
  }

  /** Dispose the panel: unmount + release every tracked subscription.
   *  After dispose the panel may not be remounted. Idempotent. */
  dispose(): void {
    if (this.status === 'disposed') return;
    if (this.status === 'mounted') this.unmount();
    this.onDispose();
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch {
        // Subscriber teardown errors must not prevent disposal of the rest.
      }
    }
    this.disposables.length = 0;
    this.status = 'disposed';
  }

  // -------------------------------------------------------------------
  //                       Subclass-facing helpers
  // -------------------------------------------------------------------

  /** Track a subscription so it is auto-disposed when the panel is. */
  protected track<D extends PanelDisposable>(d: D): D {
    this.disposables.push(d);
    return d;
  }

  /** Stable panel identifier. Resolved from `opts.panelId` → `static panelId`
   *  → constructor name. */
  protected panelId(): string {
    return (
      this.opts.panelId ??
      (this.constructor as typeof Panel).panelId ??
      this.constructor.name
    );
  }

  // -------------------------------------------------------------------
  //                       Subclass-overridable hooks
  // -------------------------------------------------------------------

  /** Build the root element. Override to set custom tag / class / ARIA. */
  protected createRoot(): HTMLElement {
    const el = document.createElement('div');
    el.setAttribute('data-panel', this.panelId());
    return el;
  }

  /** Called once per mount, AFTER the root is attached to the host.
   *  Subclasses wire event listeners + store subscriptions here. */
  protected onMount(): void {
    /* default: nothing */
  }

  /** Called per `render()` invocation. The root is guaranteed non-null. */
  protected onRender(_root: HTMLElement): void {
    /* default: nothing */
  }

  /** Called once per unmount, BEFORE the root is detached from the host. */
  protected onUnmount(): void {
    /* default: nothing */
  }

  /** Called once on dispose, AFTER unmount and BEFORE tracked disposers run. */
  protected onDispose(): void {
    /* default: nothing */
  }

  // -------------------------------------------------------------------
  //                            Test/debug accessors
  // -------------------------------------------------------------------

  /** @internal — exposed for tests and the panel-base bench. */
  __statusForTest(): LifecycleStatus {
    return this.status;
  }
}
