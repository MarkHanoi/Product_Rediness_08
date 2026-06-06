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

import { buildLiveGraph } from './livingGraphData';
import { LivingGraphCanvas, type DrawState } from './LivingGraphCanvas';
import {
  createSimState,
  isSettled,
  reheat,
  scatterNodes,
  simulateStep,
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
}
function ow(): OverlayWindow | undefined {
  return (typeof window !== 'undefined' ? window : undefined) as unknown as OverlayWindow | undefined;
}

export class LivingGraphOverlay {
  private root: HTMLElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private renderer: LivingGraphCanvas | null = null;

  private graph: LiveGraph = { nodes: [], edges: [] };
  private sim: SimState = createSimState();
  private layers: LayerState = defaultLayerState();

  private visible = false;
  private frozen = false;
  /** Heat (energy) multiplier from the slider — scales how many sim steps per
   *  frame, so the user can "warm up" the field. 1 = default. */
  private heat = 1;

  private draw: DrawState = { focusedId: null, hoveredId: null, offsetX: 0, offsetY: 0 };

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

    target.appendChild(root);
    this.root = root;
    const ctx = canvas.getContext('2d');
    if (ctx) this.renderer = new LivingGraphCanvas(canvas, ctx);

    this.wireCanvasEvents();
    this.wireRebuilt();
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
      padding: '8px 12px',
      minHeight: '20px',
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
      for (let i = 0; i < steps; i++) simulateStep(this.graph, this.layers, this.sim);
      if (isSettled(this.sim)) {
        this.updateBadges();
        // Settled — one last paint, then stop ticking.
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

  /** One-line node inspector (the prototype's inspect line): name · area · ☀sun
   *  · ♪noise · type · active connections. */
  private updateInspector(): void {
    const el = this.inspectorEl;
    if (!el) return;
    const id = this.draw.focusedId;
    if (!id) {
      el.textContent = 'Click a room to inspect it.';
      el.style.color = '#6b6385';
      return;
    }
    const node = this.graph.nodes.find((n) => n.id === id);
    if (!node) {
      el.textContent = 'Click a room to inspect it.';
      return;
    }
    const activeConns = this.graph.edges.filter(
      (e) => (e.a === id || e.b === id) && e.layers.some((l) => this.layers[l]),
    ).length;
    el.replaceChildren();
    const dot = document.createElement('span');
    Object.assign(dot.style, {
      display: 'inline-block',
      width: '9px',
      height: '9px',
      borderRadius: '50%',
      background: ROOM_TYPE_COLOUR[node.type],
      marginRight: '6px',
      verticalAlign: 'middle',
    });
    const text = document.createElement('span');
    text.style.color = '#241a3a';
    const area = node.areaSqm > 0 ? `${node.areaSqm.toFixed(1)} m²` : '— m²';
    text.textContent =
      `${node.label} · ${area} · ☀ ${(node.sunExposure * 100) | 0}% · ♪ ${(node.noiseLevel * 100) | 0}% · ${node.type} · ${activeConns} active link${activeConns === 1 ? '' : 's'}`;
    el.append(dot, text);
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
    // Convert to right/bottom so it stays anchored to the corner on resize.
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
