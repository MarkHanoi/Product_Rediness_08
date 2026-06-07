// apps/editor — A.21.D17 Living Building Graph: the panel class.
//
// L5, P2-safe (Canvas 2D only). P3-safe: this overlay NEVER calls
// requestAnimationFrame. It drives the force-sim from the runtime frame bus
// (`runtime.scene.scheduler.addTickListener`, the single rAF pump in the
// FrameScheduler) when present, and otherwise from ONE guarded setInterval
// (~30fps) — never rAF — so the P3 `pryzm/no-raf` invariant holds. The ticker
// STOPS when the sim settles (alpha cool), on Freeze, on hide, and on dispose.
//
// A draggable, position:fixed bottom-right WHITE card (brand #6600FF accents, NO
// dark surfaces): a header (title + settled/rooms badges + Freeze + ✕), the
// canvas, a one-line node inspector, the five layer-toggle chips, a heat slider,
// and a ↺ Rerun button. Re-pulls data on `pryzm:building-graph-rebuilt` (reading
// the CACHED graph only — re-entry guarded), preserving the positions of rooms
// already simulated so live edits flex the field rather than reshuffle it.
//
// Spec: docs/03-execution/specs/SPEC-LIVING-BUILDING-GRAPH.md.

// A.21.D24 — pull the D16 RATIONALE + plain-language relationship surface into the
// Living Graph inspector. These are PURE read-only projections over the same
// cached UBG the binder reads (humanNodeLabel / roomRelationshipSentences /
// nodeRationale); the editor (L5) may import @pryzm/building-graph (L2).
import {
  BuildingGraph,
  humanNodeLabel,
  nodeRationale,
  roomRelationshipSentences,
  type UbgNode,
} from '@pryzm/building-graph';
import { buildLiveGraph } from './livingGraphData';
import { LivingGraphCanvas, type DrawState } from './LivingGraphCanvas';
import {
  createSimState,
  fitToCanvas,
  isSettled,
  reheat,
  scaledParams,
  scatterNodes,
  simulateStep,
  type SimParams,
  type SimState,
} from './forceSimulation';
import {
  EDGE_LAYERS,
  EDGE_LAYER_COLOUR,
  EDGE_LAYER_LABEL,
  ROOM_TYPE_COLOUR,
  defaultLayerState,
  type EdgeLayer,
  type GraphNode,
  type LayerState,
  type LiveGraph,
} from './livingGraphSchema';

const ACCENT = '#6600ff';
const REBUILT_EVENT = 'pryzm:building-graph-rebuilt';
// Soft secondary re-sync triggers (room rename / occupancy change) IF the editor
// emits them; harmless if it never does.
const RESYNC_EVENTS = ['pryzm:room-renamed', 'pryzm:room-occupancy-changed'];

type TickDisposer = () => void;
type DomHandler = (ev: Event) => void;

interface SchedulerLike {
  addTickListener?: (
    id: string,
    cb: (now?: number, delta?: number) => void,
    priority: string,
  ) => TickDisposer | undefined;
}
interface RuntimeLike {
  scene?: { scheduler?: SchedulerLike | null } | null;
  events?: { on(event: string, handler: (payload: unknown) => void): () => void };
}
interface OverlayWindow {
  runtime?: RuntimeLike;
  /** The cached UBG the binder reads — a real BuildingGraph (A.21.D24 inspector
   *  reads it through the building-graph rationale helpers). */
  __pryzmBuildingGraph?: BuildingGraph;
}
function ow(): OverlayWindow | undefined {
  return (typeof window !== 'undefined' ? window : undefined) as unknown as OverlayWindow | undefined;
}

/**
 * The cached UBG as a real {@link BuildingGraph}, or null. Read-only — we NEVER
 * rebuild here (same re-entry contract as the binder). Guarded with an
 * `instanceof` so a stale/foreign cache shape can't crash the inspector.
 */
function cachedGraph(): BuildingGraph | null {
  const g = ow()?.__pryzmBuildingGraph;
  return g instanceof BuildingGraph ? g : null;
}

export class LivingGraphOverlay {
  private root: HTMLElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private renderer: LivingGraphCanvas | null = null;

  private graph: LiveGraph = { nodes: [], edges: [] };
  private sim: SimState = createSimState();
  private layers: LayerState = defaultLayerState();
  /** A.21.D34(e) — spacing-scaled force params (by node count + canvas size).
   *  Recomputed on resync + resize so the field spreads to FILL the panel. */
  private params: SimParams = scaledParams(0, 380, 300);

  private visible = false;
  private frozen = false;
  /** Heat (energy) multiplier from the slider — scales how many sim steps per
   *  frame, so the user can "warm up" the field. 1 = default. */
  private heat = 1;

  private draw: DrawState = { focusedId: null, hoveredId: null, offsetX: 0, offsetY: 0, scale: 1 };

  // Tick + subscriptions.
  private tickDispose: TickDisposer | null = null;
  private intervalId: number | null = null;
  private unsubs: Array<() => void> = [];
  private domHandlers: Array<[EventTarget, string, DomHandler]> = [];

  // §RE-ENTRY guard — never re-pull while already pulling (the rebuilt event can
  // fire synchronously during our own read on some buses).
  private resyncing = false;

  // Chrome refs we update live.
  private settledBadge: HTMLElement | null = null;
  private roomsBadge: HTMLElement | null = null;
  private inspectorEl: HTMLElement | null = null;
  private freezeBtn: HTMLButtonElement | null = null;
  private chipEls = new Map<EdgeLayer, HTMLButtonElement>();

  // Drag state.
  private dragging = false;
  private dragDX = 0;
  private dragDY = 0;
  private posRight = 24;
  private posBottom = 24;
  // §A.21.D33(g) — once the panel has been re-anchored from right/bottom to
  // top/left (so the bottom-right resize grip grows it down-and-right) we stay
  // top/left-anchored. The header drag-move switches to top/left too.
  private anchoredTopLeft = false;

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  mount(target: HTMLElement = document.body): void {
    if (this.root) return;
    const root = document.createElement('div');
    root.className = 'pryzm-living-graph';
    root.setAttribute('data-testid', 'living-graph-overlay');
    Object.assign(root.style, {
      position: 'fixed',
      right: `${this.posRight}px`,
      bottom: `${this.posBottom}px`,
      zIndex: '4500',
      width: '380px',
      display: 'none',
      flexDirection: 'column',
      background: '#ffffff',
      color: '#241a3a',
      border: '1px solid rgba(102,0,255,0.22)',
      borderRadius: '16px',
      boxShadow: '0 18px 54px rgba(40,10,90,0.28)',
      font: '500 12px/1.4 system-ui, sans-serif',
      overflow: 'hidden',
      userSelect: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    root.appendChild(this.buildHeader());

    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
      width: '100%',
      height: '300px',
      display: 'block',
      cursor: 'default',
      borderTop: '1px solid #f0ebfb',
      borderBottom: '1px solid #f0ebfb',
    } satisfies Partial<CSSStyleDeclaration>);
    root.appendChild(canvas);
    this.canvasEl = canvas;

    root.appendChild(this.buildInspector());
    root.appendChild(this.buildChips());
    root.appendChild(this.buildControls());
    root.appendChild(this.buildResizeGrip(canvas));

    target.appendChild(root);
    this.root = root;
    const ctx = canvas.getContext('2d');
    if (ctx) this.renderer = new LivingGraphCanvas(canvas, ctx);

    this.wireCanvasEvents();
    this.wireRebuilt();
  }

  /** §A.21.D33(g) — a BOTTOM-RIGHT drag grip that resizes the panel (the
   *  conventional spot). The panel is RE-ANCHORED to top/left on first show (see
   *  {@link reanchorToTopLeft}) so a bottom-right grip grows it naturally
   *  down-and-right INTO the viewport — never off-screen. Drag right = wider;
   *  drag down = taller graph. */
  private buildResizeGrip(canvas: HTMLCanvasElement): HTMLElement {
    const grip = document.createElement('div');
    grip.setAttribute('data-testid', 'living-graph-resize-grip');
    grip.title = 'Drag to resize';
    Object.assign(grip.style, {
      position: 'absolute',
      bottom: '0',
      right: '0',
      width: '16px',
      height: '16px',
      cursor: 'nwse-resize',
      // two faint diagonal ticks (mirrored to read as a bottom-right handle)
      background:
        'linear-gradient(315deg, transparent 0 5px, rgba(102,0,255,0.55) 5px 6px, transparent 6px 9px, rgba(102,0,255,0.55) 9px 10px, transparent 10px)',
      borderBottomRightRadius: '16px',
      zIndex: '2',
    } satisfies Partial<CSSStyleDeclaration>);

    grip.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Re-anchor to top/left so growing down-and-right is correct (and never
      // pushes the panel off-screen). Idempotent — no-op after the first time.
      this.reanchorToTopLeft();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = this.root?.offsetWidth ?? 380;
      const startH = parseInt(canvas.style.height, 10) || 300;
      try { grip.setPointerCapture(e.pointerId); } catch { /* non-fatal */ }

      const onMove = (ev: PointerEvent): void => {
        // Drag right (dx>0) = wider; drag down (dy>0) = taller graph.
        const w = Math.max(320, Math.min(900, startW + (ev.clientX - startX)));
        const h = Math.max(200, Math.min(720, startH + (ev.clientY - startY)));
        if (this.root) this.root.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        this.renderer?.resize();
        // A.21.D34(e) — re-derive spacing for the new canvas + re-fit so the
        // field expands to use the extra space as the user drags.
        this.recomputeParams();
        this.autoFit();
        this.paintOnce();
      };
      const onUp = (ev: PointerEvent): void => {
        try { grip.releasePointerCapture(ev.pointerId); } catch { /* non-fatal */ }
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        // Re-heat so the field re-anneals to the new size, then settle + fit.
        reheat(this.sim, 0.6);
        this.ensureTicking();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });

    return grip;
  }

  /**
   * §A.21.D33(g) — RE-ANCHOR the panel from its initial `right`/`bottom`
   * (screen-corner) anchoring to `top`/`left` computed from the live bounding
   * rect, so a bottom-right resize grip grows it down-and-right into the
   * viewport. Idempotent: once anchored top/left we never re-read. The panel
   * keeps its exact on-screen position — only the CSS anchor edges change.
   */
  private reanchorToTopLeft(): void {
    if (!this.root) return;
    if (this.anchoredTopLeft) return;
    const rect = this.root.getBoundingClientRect();
    Object.assign(this.root.style, {
      left: `${Math.max(0, Math.round(rect.left))}px`,
      top: `${Math.max(0, Math.round(rect.top))}px`,
      right: 'auto',
      bottom: 'auto',
    } satisfies Partial<CSSStyleDeclaration>);
    this.anchoredTopLeft = true;
  }

  private buildHeader(): HTMLElement {
    const bar = document.createElement('div');
    Object.assign(bar.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 12px',
      cursor: 'grab',
      background: 'linear-gradient(180deg, #ffffff, #faf7ff)',
    } satisfies Partial<CSSStyleDeclaration>);

    const title = document.createElement('div');
    title.textContent = 'Living Graph';
    Object.assign(title.style, { font: '700 13px/1 system-ui, sans-serif', color: '#241a3a', flexShrink: '0' });

    const settled = document.createElement('span');
    settled.textContent = 'settling…';
    Object.assign(settled.style, badgeStyle('rgba(102,0,255,0.1)', ACCENT));
    this.settledBadge = settled;

    const rooms = document.createElement('span');
    rooms.textContent = '0 rooms';
    Object.assign(rooms.style, badgeStyle('rgba(36,26,58,0.06)', '#4b4163'));
    this.roomsBadge = rooms;

    const spacer = document.createElement('div');
    spacer.style.flex = '1';

    const freeze = document.createElement('button');
    freeze.type = 'button';
    freeze.textContent = '⏸ Freeze';
    Object.assign(freeze.style, pillBtnStyle());
    this.on(freeze, 'click', () => this.toggleFreeze());
    this.freezeBtn = freeze;

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Close living graph');
    Object.assign(close.style, { ...pillBtnStyle(), padding: '4px 9px' });
    this.on(close, 'click', () => this.hide());

    // Drag from the header.
    this.on(bar, 'mousedown', (ev) => this.onDragStart(ev as MouseEvent, bar));

    bar.append(title, settled, rooms, spacer, freeze, close);
    return bar;
  }

  private buildInspector(): HTMLElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '10px 12px',
      minHeight: '20px',
      maxHeight: '188px',
      overflowY: 'auto',
      font: '500 11px/1.4 system-ui, sans-serif',
      color: '#6b6385',
      borderBottom: '1px solid #f0ebfb',
    } satisfies Partial<CSSStyleDeclaration>);
    el.textContent = 'Click a room to inspect it.';
    this.inspectorEl = el;
    return el;
  }

  private buildChips(): HTMLElement {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '6px',
      padding: '10px 12px',
    } satisfies Partial<CSSStyleDeclaration>);
    for (const layer of EDGE_LAYERS) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.textContent = EDGE_LAYER_LABEL[layer];
      this.styleChip(chip, layer, this.layers[layer]);
      this.on(chip, 'click', () => this.toggleLayer(layer));
      this.chipEls.set(layer, chip);
      wrap.appendChild(chip);
    }
    return wrap;
  }

  private buildControls(): HTMLElement {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '8px 12px 12px',
    } satisfies Partial<CSSStyleDeclaration>);

    const heatLabel = document.createElement('span');
    heatLabel.textContent = 'Heat';
    Object.assign(heatLabel.style, { color: '#6b6385', font: '600 11px/1 system-ui' });

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = '40';
    slider.setAttribute('aria-label', 'Simulation heat');
    Object.assign(slider.style, { flex: '1', accentColor: ACCENT });
    this.on(slider, 'input', () => {
      this.heat = 0.4 + (Number(slider.value) / 100) * 2.6; // 0.4 .. 3.0
      // Heat nudges the field back to life.
      reheat(this.sim, Math.min(1, 0.3 + this.heat * 0.3));
      this.ensureTicking();
    });

    const rerun = document.createElement('button');
    rerun.type = 'button';
    rerun.textContent = '↺ Rerun';
    Object.assign(rerun.style, pillBtnStyle());
    this.on(rerun, 'click', () => this.rerun());

    wrap.append(heatLabel, slider, rerun);
    return wrap;
  }

  dispose(): void {
    this.stopTicker();
    for (const u of this.unsubs) {
      try { u(); } catch { /* ignore */ }
    }
    this.unsubs = [];
    for (const [t, ev, fn] of this.domHandlers) {
      try { t.removeEventListener(ev, fn); } catch { /* ignore */ }
    }
    this.domHandlers = [];
    if (this.root?.parentElement) this.root.parentElement.removeChild(this.root);
    this.root = null;
    this.canvasEl = null;
    this.renderer = null;
  }

  // ── Show / hide ───────────────────────────────────────────────────────────────

  show(): void {
    if (!this.root) this.mount();
    if (!this.root) return;
    this.visible = true;
    this.root.style.display = 'flex';
    this.renderer?.resize();
    this.ensureGraphBuilt();
    this.resync(true);
    this.ensureTicking();
  }

  /**
   * §LG-BUILD-ON-OPEN — build the UBG ONCE if it's absent/empty, so a cold-opened
   * Living Graph isn't empty ("0 rooms" when rooms exist — the cache is only
   * populated when the static Graph button is clicked or generation rebuilds it).
   * Safe HERE: `show()` is NOT the `pryzm:building-graph-rebuilt` listener, so no
   * recursion. We raise the `resyncing` guard during the build so the build's own
   * emitted rebuilt event is swallowed (we resync explicitly right after). Never
   * blocks open on a build failure.
   */
  private ensureGraphBuilt(): void {
    try {
      const w = window as unknown as {
        pryzmBuildBuildingGraph?: () => unknown;
        __pryzmBuildingGraph?: { allNodes?: () => unknown[] };
      };
      const existing = w.__pryzmBuildingGraph;
      const nodeCount = existing?.allNodes?.()?.length ?? 0;
      if (nodeCount === 0 && typeof w.pryzmBuildBuildingGraph === 'function') {
        this.resyncing = true; // swallow the build's emitted rebuilt event
        try {
          w.pryzmBuildBuildingGraph();
        } finally {
          this.resyncing = false;
        }
      }
    } catch {
      /* defensive — a graph-build failure must never block the overlay opening */
    }
  }

  hide(): void {
    this.visible = false;
    this.stopTicker();
    if (this.root) this.root.style.display = 'none';
  }

  toggle(show?: boolean): void {
    const next = show ?? !this.visible;
    if (next) this.show();
    else this.hide();
  }

  isVisible(): boolean {
    return this.visible;
  }

  // ── Data binding + re-sync ──────────────────────────────────────────────────

  /** Re-pull the LiveGraph from the CACHED UBG, preserving positions for rooms
   *  already simulated. `full` forces a fresh scatter of every node (Rerun). */
  private resync(full = false): void {
    if (this.resyncing) return; // §RE-ENTRY guard
    this.resyncing = true;
    try {
      const prev = new Map(this.graph.nodes.map((n) => [n.id, n]));
      const next = buildLiveGraph();
      // Carry forward positions/velocities for rooms we already had.
      const preserve = new Set<string>();
      for (const n of next.nodes) {
        const old = prev.get(n.id);
        if (old && !full) {
          n.x = old.x;
          n.y = old.y;
          n.vx = old.vx;
          n.vy = old.vy;
          preserve.add(n.id);
        }
      }
      // Scatter only the new (or all, on full rerun) nodes deterministically.
      scatterNodes(next.nodes, full ? {} : { preserve });
      this.graph = next;
      // Re-derive spacing from the new node count + canvas size so the field
      // spreads to fill the panel (A.21.D34(e)).
      this.recomputeParams();
      // Drop a focus/hover that no longer exists.
      const ids = new Set(next.nodes.map((n) => n.id));
      if (this.draw.focusedId && !ids.has(this.draw.focusedId)) this.draw.focusedId = null;
      if (this.draw.hoveredId && !ids.has(this.draw.hoveredId)) this.draw.hoveredId = null;
      // Re-heat so the field re-settles around the change.
      this.sim = createSimState();
      reheat(this.sim, 1);
      this.updateBadges();
      this.updateInspector();
    } finally {
      this.resyncing = false;
    }
  }

  private wireRebuilt(): void {
    const events = ow()?.runtime?.events;
    const onRebuilt = () => {
      if (this.visible && !this.resyncing) {
        this.resync(false);
        this.ensureTicking();
      }
    };
    if (events?.on) {
      try {
        this.unsubs.push(events.on(REBUILT_EVENT, onRebuilt));
        for (const ev of RESYNC_EVENTS) this.unsubs.push(events.on(ev, onRebuilt));
        return;
      } catch {
        /* fall through to DOM */
      }
    }
    const handler: DomHandler = () => onRebuilt();
    this.on(window, REBUILT_EVENT, handler);
    for (const ev of RESYNC_EVENTS) this.on(window, ev, handler);
  }

  // ── Spacing + auto-fit (A.21.D34(e)) ─────────────────────────────────────────

  /** The current canvas box (CSS px), defaulting to the panel's design size. */
  private canvasBox(): { w: number; h: number } {
    return {
      w: this.canvasEl?.clientWidth || 380,
      h: this.canvasEl?.clientHeight || 300,
    };
  }

  /** Recompute the spacing-scaled force params from the live node count + the
   *  current canvas size, so the field spreads to fill the (resizable) panel. */
  private recomputeParams(): void {
    const { w, h } = this.canvasBox();
    this.params = scaledParams(this.graph.nodes.length, w, h);
  }

  /** Auto-fit: pan + (down-only) zoom so the settled cloud fills the canvas. */
  private autoFit(): void {
    const { w, h } = this.canvasBox();
    const fit = fitToCanvas(this.graph.nodes, w, h);
    this.draw.offsetX = fit.offsetX;
    this.draw.offsetY = fit.offsetY;
    this.draw.scale = fit.scale;
  }

  // ── The ticker — P3-safe (frame bus first, guarded setInterval fallback) ──────

  private ensureTicking(): void {
    if (!this.visible || this.frozen) return;
    if (this.tickDispose || this.intervalId !== null) return;
    const scheduler = ow()?.runtime?.scene?.scheduler;
    if (scheduler?.addTickListener) {
      try {
        this.tickDispose =
          scheduler.addTickListener('pryzm.living-graph', () => this.frame(), 'post-render') ?? null;
        if (this.tickDispose) return;
      } catch {
        /* fall through */
      }
    }
    // Fallback: ONE guarded setInterval (~30fps). NOT requestAnimationFrame.
    this.intervalId = window.setInterval(() => this.frame(), 33);
  }

  private stopTicker(): void {
    if (this.tickDispose) {
      try { this.tickDispose(); } catch { /* ignore */ }
      this.tickDispose = null;
    }
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** One frame: step the sim (unless frozen/settled), then paint. Stops the
   *  ticker once the field settles so the editor goes idle (P3 friendliness). */
  private frame(): void {
    if (!this.visible || !this.renderer) return;
    if (!this.frozen && !isSettled(this.sim)) {
      // Heat scales steps/frame (1..~5) so the slider warms the field.
      const steps = Math.max(1, Math.round(this.heat * 1.6));
      for (let i = 0; i < steps; i++) simulateStep(this.graph, this.layers, this.sim, this.params);
      // Keep the spreading cloud framed every frame (cheap O(n)).
      this.autoFit();
      if (isSettled(this.sim)) {
        this.updateBadges();
        // Settled — final fit + one last paint, then stop ticking.
        this.autoFit();
        this.renderer.draw(this.graph, this.layers, this.draw);
        this.stopTicker();
        return;
      }
    } else if (this.frozen || isSettled(this.sim)) {
      // Nothing to advance — paint once and stop (idle).
      this.renderer.draw(this.graph, this.layers, this.draw);
      this.stopTicker();
      return;
    }
    this.renderer.draw(this.graph, this.layers, this.draw);
  }

  // ── Interaction ─────────────────────────────────────────────────────────────

  private wireCanvasEvents(): void {
    const canvas = this.canvasEl;
    if (!canvas) return;
    this.on(canvas, 'mousemove', (ev) => {
      const hit = this.renderer?.pick((ev as MouseEvent).clientX, (ev as MouseEvent).clientY, this.graph, this.draw) ?? null;
      const id = hit?.id ?? null;
      if (id !== this.draw.hoveredId) {
        this.draw.hoveredId = id;
        canvas.style.cursor = id ? 'pointer' : 'default';
        this.paintOnce();
      }
    });
    this.on(canvas, 'mouseleave', () => {
      if (this.draw.hoveredId) {
        this.draw.hoveredId = null;
        this.paintOnce();
      }
    });
    this.on(canvas, 'click', (ev) => {
      const hit = this.renderer?.pick((ev as MouseEvent).clientX, (ev as MouseEvent).clientY, this.graph, this.draw) ?? null;
      this.draw.focusedId = hit && hit.id !== this.draw.focusedId ? hit.id : null;
      this.updateInspector();
      this.paintOnce();
    });
    this.on(window, 'resize', () => {
      if (this.visible) {
        this.renderer?.resize();
        this.recomputeParams();
        this.autoFit();
        this.paintOnce();
      }
    });
  }

  /** Paint a single frame without advancing the sim (hover/select feedback when
   *  the field is already settled / frozen). */
  private paintOnce(): void {
    if (this.visible && this.renderer) this.renderer.draw(this.graph, this.layers, this.draw);
  }

  // ── Controls ─────────────────────────────────────────────────────────────────

  private toggleLayer(layer: EdgeLayer): void {
    this.layers[layer] = !this.layers[layer];
    const chip = this.chipEls.get(layer);
    if (chip) this.styleChip(chip, layer, this.layers[layer]);
    // Toggling a layer re-settles the field from CURRENT positions (not a full
    // scatter) — the prototype's "ask a different spatial question".
    reheat(this.sim, 0.85);
    this.ensureTicking();
  }

  private toggleFreeze(): void {
    this.frozen = !this.frozen;
    if (this.freezeBtn) this.freezeBtn.textContent = this.frozen ? '▶ Resume' : '⏸ Freeze';
    if (this.frozen) {
      this.stopTicker();
      this.paintOnce();
    } else {
      reheat(this.sim, 0.6);
      this.ensureTicking();
    }
  }

  private rerun(): void {
    this.ensureGraphBuilt(); // §LG-BUILD-ON-OPEN — doubles as a manual refresh after model changes
    this.resync(true); // full scatter
    this.ensureTicking();
  }

  // ── Chrome updates ─────────────────────────────────────────────────────────

  private updateBadges(): void {
    if (this.roomsBadge) this.roomsBadge.textContent = `${this.graph.nodes.length} rooms`;
    if (this.settledBadge) {
      const settled = isSettled(this.sim) || this.frozen;
      this.settledBadge.textContent = settled ? '✓ settled' : 'settling…';
      Object.assign(
        this.settledBadge.style,
        settled ? badgeStyle('rgba(36,180,120,0.14)', '#1a8a5a') : badgeStyle('rgba(102,0,255,0.1)', ACCENT),
      );
    }
  }

  /**
   * §LG-RICH-INSPECT (A.21.D24) — a multi-section node inspector. Beyond the
   * prototype's one-liner (name · area · ☀ · ♪ · type · links) it now surfaces the
   * D16 depth: the REAL room metrics (real area — never a bare "— m²" when the room
   * has a boundary), the plain-language RATIONALE ("why it's here"), the typed
   * SPACE relationships ("connects to Corridor via a door"), and the hosted
   * ELEMENTS (doors/windows) with their own rationale ("Window · south façade — for
   * daylight"). The rationale/relationship/element depth is read from the CACHED
   * BuildingGraph via the pure building-graph helpers; the metrics come from the
   * live GraphNode the sim is animating.
   */
  private updateInspector(): void {
    const el = this.inspectorEl;
    if (!el) return;
    const id = this.draw.focusedId;
    if (!id) {
      el.replaceChildren();
      el.textContent = 'Click a room to inspect it.';
      el.style.color = '#6b6385';
      return;
    }
    const node = this.graph.nodes.find((n) => n.id === id);
    if (!node) {
      el.replaceChildren();
      el.textContent = 'Click a room to inspect it.';
      el.style.color = '#6b6385';
      return;
    }

    el.replaceChildren();
    el.style.color = '#6b6385';

    // The matching UBG node + graph (for rationale / relationships / elements).
    const graph = cachedGraph();
    const ubgNode = graph ? (() => { try { return graph.getNode(id) ?? null; } catch { return null; } })() : null;

    // ── Header: type dot + title + level/occupancy chips ──────────────────────
    const head = document.createElement('div');
    Object.assign(head.style, { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' });
    const dot = document.createElement('span');
    Object.assign(dot.style, {
      display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%',
      background: ROOM_TYPE_COLOUR[node.type], flexShrink: '0',
    });
    const title = document.createElement('span');
    title.textContent = node.label;
    Object.assign(title.style, { color: '#241a3a', font: '700 12px/1.3 system-ui, sans-serif' });
    head.append(dot, title);
    if (node.level) head.appendChild(this.miniChip(node.level, 'rgba(36,26,58,0.06)', '#4b4163'));
    // Show the REAL program label (occupancy) when it differs from the coarse type.
    const occ = node.occupancy;
    if (occ && occ.toLowerCase() !== node.type) {
      head.appendChild(this.miniChip(occ, 'rgba(102,0,255,0.08)', ACCENT));
    }
    el.appendChild(head);

    // ── Metrics row: real area · sun · noise · type · active links ────────────
    const activeConns = this.graph.edges.filter(
      (e) => (e.a === id || e.b === id) && e.layers.some((l) => this.layers[l]),
    ).length;
    const areaTxt = node.areaSqm > 0 ? `${node.areaSqm.toFixed(1)} m²` : '— m²';
    const metrics = document.createElement('div');
    Object.assign(metrics.style, { display: 'flex', flexWrap: 'wrap', gap: '4px 10px', color: '#4b4163', font: '500 11px/1.4 system-ui' });
    metrics.append(
      this.metricSpan('📐', areaTxt),
      this.metricSpan('☀', `${(node.sunExposure * 100) | 0}%`),
      this.metricSpan('♪', `${(node.noiseLevel * 100) | 0}%`),
      this.metricSpan('●', node.type, ROOM_TYPE_COLOUR[node.type]),
      this.metricSpan('🔗', `${activeConns} active link${activeConns === 1 ? '' : 's'}`),
    );
    el.appendChild(metrics);

    if (ubgNode && graph) {
      // ── "Why it's here" — the D16 rationale (omitted when none derivable) ────
      const rationale = (() => { try { return nodeRationale(ubgNode, graph); } catch { return null; } })();
      if (rationale) {
        const body = document.createElement('div');
        const why = document.createElement('div');
        why.textContent = rationale.reason;
        Object.assign(why.style, { color: '#241a3a', font: '500 11px/1.45 system-ui' });
        const src = document.createElement('div');
        src.textContent = `from ${rationale.source}`;
        Object.assign(src.style, { color: '#9b93b5', font: '400 10px/1.3 system-ui', marginTop: '2px' });
        body.append(why, src);
        el.appendChild(this.inspectorSection("Why it's here", [body]));
      }

      // ── "Spaces" — typed neighbour relationships in plain language (D16) ─────
      const lines = (() => { try { return roomRelationshipSentences(ubgNode, graph); } catch { return []; } })();
      if (lines.length) {
        el.appendChild(this.inspectorSection('Spaces', lines.slice(0, 6).map((s) => {
          const r = document.createElement('div');
          r.textContent = `• ${s.text}`;
          Object.assign(r.style, { color: '#241a3a', font: '500 11px/1.4 system-ui' });
          return r;
        })));
      }

      // ── "Openings" — the ELEMENTS hosted in / connecting this room (doors,
      //    windows) with their OWN rationale, so element relationships ("why this
      //    window is on the south façade") surface without overloading the canvas.
      const openings = this.collectOpenings(id, graph);
      if (openings.length) {
        el.appendChild(this.inspectorSection('Openings', openings.slice(0, 6).map((o) => {
          const row = document.createElement('div');
          Object.assign(row.style, { display: 'flex', flexDirection: 'column', gap: '0' });
          const lbl = document.createElement('div');
          lbl.textContent = `• ${o.label}`;
          Object.assign(lbl.style, { color: '#241a3a', font: '500 11px/1.4 system-ui' });
          row.appendChild(lbl);
          if (o.reason) {
            const rs = document.createElement('div');
            rs.textContent = o.reason;
            Object.assign(rs.style, { color: '#9b93b5', font: '400 10px/1.35 system-ui', paddingLeft: '10px' });
            row.appendChild(rs);
          }
          return row;
        })));
      }
    }
  }

  /**
   * The doors/windows hosted in or connecting a room, with their D16 rationale.
   * Three sources, since the UBG models openings in different shapes:
   *   • DOOR nodes carry `refs: [roomA, roomB]` (the roomGraph adapter) but NO
   *     direct room edges — so doors are found by matching the room id in `refs`.
   *   • WINDOW nodes carry a `hostedIn` edge to their host WALL, and a wall
   *     `bounds` the room — so windows are reached wall-by-wall.
   *   • Any door/window reachable by a direct edge (defensive — future adapters).
   * Deduplicated, bounded. Read-only; never throws.
   */
  private collectOpenings(roomId: string, graph: BuildingGraph): Array<{ label: string; reason: string | null }> {
    const out: Array<{ label: string; reason: string | null }> = [];
    const seen = new Set<string>();
    const add = (node: UbgNode | undefined): void => {
      if (!node || seen.has(node.id)) return;
      if (node.kind !== 'door' && node.kind !== 'window') return;
      seen.add(node.id);
      const reason = (() => { try { return nodeRationale(node, graph)?.reason ?? null; } catch { return null; } })();
      out.push({ label: humanNodeLabel(node, graph), reason });
    };
    try {
      // 1) Door nodes that reference this room (roomGraph adapter `refs`).
      for (const n of graph.allNodes()) {
        if (n.kind === 'door' && (n.refs ?? []).includes(roomId)) add(n);
      }
      // 2) Windows hosted in the room's bounding walls (`bounds` in-edge → wall;
      //    `hostedIn` in-edge of the wall → the window/door).
      for (const wallEdge of graph.inEdges(roomId, 'bounds')) {
        const wallId = wallEdge.from;
        for (const he of graph.inEdges(wallId, 'hostedIn')) add(graph.getNode(he.from));
      }
      // 3) Any opening reachable by a direct edge in either direction (defensive).
      for (const e of graph.outEdges(roomId)) add(graph.getNode(e.to));
      for (const e of graph.inEdges(roomId)) add(graph.getNode(e.from));
    } catch {
      /* defensive — a mis-shaped graph never breaks the inspector */
    }
    return out;
  }

  /** A small rounded chip (level / occupancy) for the inspector header. */
  private miniChip(text: string, bg: string, fg: string): HTMLElement {
    const c = document.createElement('span');
    c.textContent = text;
    Object.assign(c.style, {
      background: bg, color: fg, borderRadius: '999px', padding: '1px 7px',
      font: '600 10px/1.4 system-ui, sans-serif', whiteSpace: 'nowrap',
    } satisfies Partial<CSSStyleDeclaration>);
    return c;
  }

  /** One "icon value" metric span. */
  private metricSpan(icon: string, value: string, colour?: string): HTMLElement {
    const s = document.createElement('span');
    Object.assign(s.style, { display: 'inline-flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' });
    const i = document.createElement('span');
    i.textContent = icon;
    if (colour) i.style.color = colour;
    const v = document.createElement('span');
    v.textContent = value;
    v.style.color = '#241a3a';
    s.append(i, v);
    return s;
  }

  /** A titled inspector section (uppercase #6600FF heading + rows). */
  private inspectorSection(title: string, rows: HTMLElement[]): HTMLElement {
    const sec = document.createElement('div');
    const h = document.createElement('div');
    h.textContent = title;
    Object.assign(h.style, {
      font: '700 9px/1 system-ui, sans-serif', textTransform: 'uppercase',
      letterSpacing: '0.05em', color: ACCENT, marginBottom: '4px',
    } satisfies Partial<CSSStyleDeclaration>);
    sec.appendChild(h);
    const list = document.createElement('div');
    Object.assign(list.style, { display: 'flex', flexDirection: 'column', gap: '3px' });
    for (const r of rows) list.appendChild(r);
    sec.appendChild(list);
    return sec;
  }

  private styleChip(chip: HTMLButtonElement, layer: EdgeLayer, on: boolean): void {
    const colour = EDGE_LAYER_COLOUR[layer];
    Object.assign(chip.style, {
      cursor: 'pointer',
      border: `1.5px solid ${on ? ACCENT : 'rgba(36,26,58,0.18)'}`,
      background: on ? 'rgba(102,0,255,0.08)' : '#ffffff',
      color: on ? ACCENT : '#9b93b5',
      borderRadius: '999px',
      padding: '4px 11px',
      font: '600 11px/1 system-ui, sans-serif',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      opacity: on ? '1' : '0.7',
    } satisfies Partial<CSSStyleDeclaration>);
    // Layer colour swatch.
    chip.replaceChildren();
    const sw = document.createElement('span');
    Object.assign(sw.style, {
      display: 'inline-block',
      width: '8px',
      height: '8px',
      borderRadius: '2px',
      background: colour,
    });
    const label = document.createElement('span');
    label.textContent = EDGE_LAYER_LABEL[layer];
    chip.append(sw, label);
  }

  // ── Drag ────────────────────────────────────────────────────────────────────

  private onDragStart(ev: MouseEvent, bar: HTMLElement): void {
    if (!this.root) return;
    // Don't start a drag from a button inside the header.
    if ((ev.target as HTMLElement)?.tagName === 'BUTTON') return;
    this.dragging = true;
    bar.style.cursor = 'grabbing';
    const rect = this.root.getBoundingClientRect();
    this.dragDX = ev.clientX - rect.left;
    this.dragDY = ev.clientY - rect.top;
    const move = (e: Event) => this.onDragMove(e as MouseEvent);
    const up = () => {
      this.dragging = false;
      bar.style.cursor = 'grab';
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  private onDragMove(ev: MouseEvent): void {
    if (!this.dragging || !this.root) return;
    const left = ev.clientX - this.dragDX;
    const top = ev.clientY - this.dragDY;
    if (this.anchoredTopLeft) {
      // §A.21.D33(g) — once re-anchored (after a bottom-right resize), move via
      // top/left so the resize grow-direction stays correct and consistent.
      const l = Math.max(0, Math.min(window.innerWidth - this.root.offsetWidth, left));
      const t = Math.max(0, Math.min(window.innerHeight - this.root.offsetHeight, top));
      this.root.style.left = `${l}px`;
      this.root.style.top = `${t}px`;
      return;
    }
    // Default (pre-resize) anchoring: convert to right/bottom so it stays pinned
    // to the screen corner on viewport resize.
    this.posRight = Math.max(0, window.innerWidth - left - this.root.offsetWidth);
    this.posBottom = Math.max(0, window.innerHeight - top - this.root.offsetHeight);
    this.root.style.right = `${this.posRight}px`;
    this.root.style.bottom = `${this.posBottom}px`;
  }

  // ── util ────────────────────────────────────────────────────────────────────

  private on(target: EventTarget, ev: string, fn: DomHandler): void {
    target.addEventListener(ev, fn);
    this.domHandlers.push([target, ev, fn]);
  }
}

function badgeStyle(bg: string, fg: string): Partial<CSSStyleDeclaration> {
  return {
    background: bg,
    color: fg,
    borderRadius: '999px',
    padding: '2px 8px',
    font: '600 10px/1 system-ui, sans-serif',
    whiteSpace: 'nowrap',
  };
}

function pillBtnStyle(): Partial<CSSStyleDeclaration> {
  return {
    cursor: 'pointer',
    border: `1px solid ${ACCENT}`,
    background: '#ffffff',
    color: ACCENT,
    borderRadius: '999px',
    padding: '4px 11px',
    font: '600 11px/1 system-ui, sans-serif',
    whiteSpace: 'nowrap',
  };
}

export type { GraphNode };
