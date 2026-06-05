// apps/editor — GRAPH.3 + GRAPH.3.b: the living-blob Building-Graph overlay.
//
// A toggleable, READ-ONLY full-screen Canvas-2D overlay that renders the Unified
// Building Graph as a fluid, near-liquid field — soft metaball nodes that merge
// when close, flowing bezier edges, and a gentle perpetual breathe so it feels
// alive (founder §4.1: "a living blob in the city that adjusts to its
// inhabitants", NOT a stiff node-link diagram).
//
// L5, P2-safe (Canvas 2D only — no THREE). P3-safe: this overlay NEVER calls
// requestAnimationFrame. It drives its animation from the runtime frame bus
// (`runtime.scene.scheduler.addTickListener`) when present, and otherwise from a
// single guarded setInterval ticker (~30fps) — never rAF — so the `pryzm/no-raf`
// invariant holds with no eslint-disable. See `startTicker()` below.
//
// Source: `window.pryzmBuildBuildingGraph()` / the cached `window.__pryzmBuildingGraph`,
// re-rendered live on `pryzm:building-graph-rebuilt`. We read the graph through
// its query API only; we never mutate it (ADR-0058 read-only projection).
//
// Spec: docs/01-strategy/PRYZM-BUILDING-GRAPH-AND-RELATIONAL-AI-FOUNDATION.md §4.1.

import type { BuildingGraph, UbgNode } from '@pryzm/building-graph';
import {
  buildLayout,
  stepForces,
  HERO_PURPLE,
  type GraphLayout,
  type LaidOutNode,
} from './graphLayout';

const REBUILT_EVENT = 'pryzm:building-graph-rebuilt';
const ACCENT = HERO_PURPLE; // #6600FF
const WARMUP_STEPS = 140; // synchronous-ish settle burst spread over early ticks
const BREATHE_STEPS_PER_TICK = 1; // slow perpetual motion once warm

// ── Minimal structural views of the live singletons (no heavy imports) ────────

/** A frame-bus tick listener disposer, matching the FrameScheduler surface. */
type TickDisposer = () => void;

/** A DOM event handler (avoids the `EventListener` global, which the editor
 *  eslint config flags under `no-undef`). */
type DomHandler = (ev: Event) => void;

interface SchedulerLike {
  addTickListener?: (
    id: string,
    cb: (ctx?: unknown) => void,
    priority: 'render' | 'pre-render' | 'post-render' | string,
  ) => TickDisposer | undefined;
}

interface RuntimeLike {
  scene?: { scheduler?: SchedulerLike | null } | null;
  events?: { on(event: string, handler: (payload: unknown) => void): () => void };
}

interface OverlayWindow {
  pryzmBuildBuildingGraph?: () => BuildingGraph;
  __pryzmBuildingGraph?: BuildingGraph;
  pryzmShowBuildingGraph?: (show?: boolean) => void;
  pryzmHideBuildingGraph?: () => void;
  runtime?: RuntimeLike;
}

function ow(): OverlayWindow | undefined {
  return (typeof window !== 'undefined' ? window : undefined) as unknown as
    | OverlayWindow
    | undefined;
}

// ── The overlay ───────────────────────────────────────────────────────────────

export class BuildingGraphOverlay {
  private root: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private emptyEl: HTMLElement | null = null;
  private statsEl: HTMLElement | null = null;
  // GRAPH.4 — the interrogation panel: click a node → its element, props,
  // relationships + the rules it breaks.
  private detailEl: HTMLElement | null = null;

  private layout: GraphLayout | null = null;
  private warmupLeft = 0;
  private phase = 0; // perpetual-motion clock (radians)

  private visible = false;
  private dpr = 1;

  // Interaction state.
  private hovered: LaidOutNode | null = null;
  private focused: string | null = null;
  private neighbourIds: Set<string> = new Set();

  // Tick + subscriptions.
  private tickDispose: TickDisposer | null = null;
  private intervalId: number | null = null;
  private rebuiltUnsub: (() => void) | null = null;
  private domHandlers: Array<[EventTarget, string, DomHandler]> = [];

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /** Build the DOM (hidden) + wire the rebuilt subscription. Idempotent. */
  mount(mountTarget: HTMLElement = document.body): void {
    if (this.root) return;

    const root = document.createElement('div');
    root.className = 'pryzm-graph-overlay';
    root.setAttribute('data-testid', 'building-graph-overlay');
    Object.assign(root.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '90',
      display: 'none',
      // Translucent PRYZM-purple scrim (matches the shared panel backdrop).
      background:
        'radial-gradient(120% 120% at 50% 40%, rgba(38,16,84,0.62), rgba(20,8,46,0.86))',
      backdropFilter: 'blur(3px)',
    } satisfies Partial<CSSStyleDeclaration>);

    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      cursor: 'default',
    } satisfies Partial<CSSStyleDeclaration>);
    root.appendChild(canvas);

    root.appendChild(this.buildHeader());
    root.appendChild(this.buildEmptyState());
    root.appendChild(this.buildDetailPanel());

    mountTarget.appendChild(root);
    this.root = root;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.wireCanvasEvents();
    this.wireRebuilt();
  }

  private buildHeader(): HTMLElement {
    const bar = document.createElement('div');
    Object.assign(bar.style, {
      position: 'absolute',
      top: '14px',
      left: '0',
      right: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 18px',
      pointerEvents: 'none',
      font: '600 13px/1.3 system-ui, sans-serif',
    } satisfies Partial<CSSStyleDeclaration>);

    const title = document.createElement('div');
    title.textContent = 'Building Graph — living view';
    Object.assign(title.style, {
      color: '#ffffff',
      letterSpacing: '0.02em',
      textShadow: '0 1px 8px rgba(102,0,255,0.6)',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    const stats = document.createElement('div');
    Object.assign(stats.style, {
      color: 'rgba(255,255,255,0.7)',
      font: '500 11px/1.3 system-ui, sans-serif',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    this.statsEl = stats;

    // Close button — top-right, white + #6600FF chrome (mirrors FORMA toggle).
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '✕ Close';
    close.setAttribute('aria-label', 'Hide building graph');
    Object.assign(close.style, {
      pointerEvents: 'auto',
      cursor: 'pointer',
      border: `1px solid ${ACCENT}`,
      background: '#ffffff',
      color: ACCENT,
      borderRadius: '999px',
      padding: '6px 14px',
      font: '600 12px/1 system-ui, sans-serif',
      boxShadow: '0 4px 16px rgba(102,0,255,0.35)',
    } satisfies Partial<CSSStyleDeclaration>);
    this.on(close, 'click', () => this.hide());

    const right = document.createElement('div');
    Object.assign(right.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
    } satisfies Partial<CSSStyleDeclaration>);
    right.appendChild(stats);
    right.appendChild(close);

    bar.appendChild(title);
    bar.appendChild(right);
    return bar;
  }

  private buildEmptyState(): HTMLElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'absolute',
      inset: '0',
      display: 'none',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10px',
      textAlign: 'center',
      color: 'rgba(255,255,255,0.85)',
      font: '500 14px/1.5 system-ui, sans-serif',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    const glyph = document.createElement('div');
    glyph.textContent = '◌';
    Object.assign(glyph.style, {
      font: '300 64px/1 system-ui, sans-serif',
      color: ACCENT,
      textShadow: '0 0 28px rgba(102,0,255,0.8)',
      opacity: '0.85',
    } satisfies Partial<CSSStyleDeclaration>);

    const head = document.createElement('div');
    head.textContent = 'Nothing to relate yet';
    Object.assign(head.style, { font: '600 16px/1.4 system-ui, sans-serif' });

    const sub = document.createElement('div');
    sub.textContent =
      'Draw walls and rooms (or generate an apartment) — the building graph grows as the model does.';
    Object.assign(sub.style, { maxWidth: '360px', opacity: '0.8' });

    el.appendChild(glyph);
    el.appendChild(head);
    el.appendChild(sub);
    this.emptyEl = el;
    return el;
  }

  /** Remove everything + drop every subscription/ticker. */
  dispose(): void {
    this.stopTicker();
    if (this.rebuiltUnsub) {
      try {
        this.rebuiltUnsub();
      } catch {
        /* ignore */
      }
      this.rebuiltUnsub = null;
    }
    for (const [t, ev, fn] of this.domHandlers) {
      try {
        t.removeEventListener(ev, fn);
      } catch {
        /* ignore */
      }
    }
    this.domHandlers = [];
    if (this.root?.parentElement) this.root.parentElement.removeChild(this.root);
    this.root = null;
    this.canvas = null;
    this.ctx = null;
    this.layout = null;
  }

  // ── Show / hide ───────────────────────────────────────────────────────────────

  show(): void {
    if (!this.root) this.mount();
    if (!this.root) return;
    this.visible = true;
    this.root.style.display = 'block';
    this.rebuildFromGraph();
    this.resize();
    this.startTicker();
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

  // ── Graph acquisition ──────────────────────────────────────────────────────────

  /** Read the live UBG (build fresh if the hook exists, else the cache). */
  private acquireGraph(): BuildingGraph | null {
    const w = ow();
    if (!w) return null;
    try {
      if (typeof w.pryzmBuildBuildingGraph === 'function') {
        return w.pryzmBuildBuildingGraph();
      }
    } catch {
      /* fall through to the cache */
    }
    return w.__pryzmBuildingGraph ?? null;
  }

  private rebuildFromGraph(): void {
    const graph = this.acquireGraph();
    const nodes: UbgNode[] = graph ? graph.allNodes() : [];
    const edges = graph ? graph.allEdges() : [];

    if (this.statsEl) {
      this.statsEl.textContent = graph
        ? `${nodes.length} nodes · ${edges.length} relations`
        : '';
    }

    if (nodes.length === 0) {
      this.layout = null;
      if (this.emptyEl) this.emptyEl.style.display = 'flex';
      return;
    }
    if (this.emptyEl) this.emptyEl.style.display = 'none';

    this.layout = buildLayout(nodes, edges);
    this.warmupLeft = WARMUP_STEPS;
    // Preserve focus if the node still exists; else clear.
    if (this.focused && !this.layout.index.has(this.focused)) {
      this.focused = null;
      this.neighbourIds.clear();
    } else if (this.focused) {
      this.recomputeNeighbours(this.focused);
    }
  }

  /** Subscribe to the rebuilt event so the field flexes live as the model edits. */
  private wireRebuilt(): void {
    const w = ow();
    const events = w?.runtime?.events;
    if (events?.on) {
      try {
        this.rebuiltUnsub = events.on(REBUILT_EVENT, () => {
          if (this.visible) this.rebuildFromGraph();
        });
        return;
      } catch {
        /* fall through to DOM event */
      }
    }
    // Fallback: a plain DOM CustomEvent of the same name (defensive — the editor
    // emits on the runtime bus, but a DOM mirror keeps the overlay decoupled).
    const handler: DomHandler = () => {
      if (this.visible) this.rebuildFromGraph();
    };
    this.on(window, REBUILT_EVENT, handler);
  }

  // ── The ticker — P3-safe (frame bus first, guarded setInterval fallback) ──────

  private startTicker(): void {
    if (this.tickDispose || this.intervalId !== null) return;

    // Preferred path: the runtime frame bus (the single rAF pump lives in the
    // FrameScheduler — we just subscribe a tick listener, never call rAF).
    const scheduler = ow()?.runtime?.scene?.scheduler;
    if (scheduler?.addTickListener) {
      try {
        this.tickDispose =
          scheduler.addTickListener(
            'pryzm.graph-overlay',
            () => this.frame(),
            'post-render',
          ) ?? null;
        if (this.tickDispose) return;
      } catch {
        /* fall through to the interval fallback */
      }
    }

    // Fallback: ONE guarded setInterval (~33ms ≈ 30fps). NOT requestAnimationFrame
    // — this deliberately avoids rAF so the P3 `pryzm/no-raf` invariant holds and
    // no scheduler is required (e.g. headless/early-boot). Single timer, cleared
    // on hide/dispose.
    this.intervalId = window.setInterval(() => this.frame(), 33);
  }

  private stopTicker(): void {
    if (this.tickDispose) {
      try {
        this.tickDispose();
      } catch {
        /* ignore */
      }
      this.tickDispose = null;
    }
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** One animation frame: advance the sim a little, then paint. */
  private frame(): void {
    if (!this.visible || !this.layout) return;
    // Warm-up burst: take a couple of settle steps per frame until the field
    // relaxes, then drop to a slow perpetual breathe so it stays alive.
    if (this.warmupLeft > 0) {
      stepForces(this.layout);
      stepForces(this.layout);
      this.warmupLeft -= 2;
    } else {
      for (let i = 0; i < BREATHE_STEPS_PER_TICK; i++) stepForces(this.layout);
    }
    this.phase += 0.018;
    this.paint();
  }

  // ── Rendering — metaball blobs + flowing bezier edges ──────────────────────────

  private resize(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.floor(w * this.dpr));
    canvas.height = Math.max(1, Math.floor(h * this.dpr));
  }

  /** Layout space is centred on the origin; map to canvas centre + breathe. */
  private toScreen(n: LaidOutNode): { x: number; y: number } {
    const canvas = this.canvas;
    const cx = (canvas ? canvas.clientWidth : window.innerWidth) / 2;
    const cy = (canvas ? canvas.clientHeight : window.innerHeight) / 2;
    // Gentle per-node sway → the "alive" wobble, deterministic per node id.
    const sway = 4;
    const seed = n.node.id.length + n.radius;
    const sx = Math.sin(this.phase + seed) * sway;
    const sy = Math.cos(this.phase * 0.9 + seed) * sway;
    return { x: cx + n.x + sx, y: cy + n.y + sy };
  }

  private paint(): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    const layout = this.layout;
    if (!ctx || !canvas || !layout) return;

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    // 0) Soft pastel-purple field (GRAPH.3-HERO) — a faint radial lavender wash so
    //    the graph floats on a living field (the MIAW hero look), not a flat panel.
    {
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const field = ctx.createRadialGradient(
        W * 0.5, H * 0.46, 0, W * 0.5, H * 0.46, Math.max(W, H) * 0.72,
      );
      field.addColorStop(0, 'rgba(150, 100, 255, 0.12)');
      field.addColorStop(0.5, 'rgba(120, 70, 240, 0.055)');
      field.addColorStop(1, 'rgba(102, 0, 255, 0.0)');
      ctx.fillStyle = field;
      ctx.fillRect(0, 0, W, H);
    }

    // 1) Flowing edges — curved bezier "liquid bridges" UNDER the nodes.
    ctx.lineCap = 'round';
    for (const e of layout.edges) {
      const a = this.toScreen(e.from);
      const b = this.toScreen(e.to);
      const dim = this.isDimmed(e.from.node.id) && this.isDimmed(e.to.node.id);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      // Perpendicular bow + a slow ripple → edges flow rather than rule straight.
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const bow = (len * 0.16 + 8) * (1 + Math.sin(this.phase + len) * 0.25);
      const cxp = mx + nx * bow;
      const cyp = my + ny * bow;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(cxp, cyp, b.x, b.y);
      // GRAPH.3-HERO — taper the edge to a bright flowing core (faint at the
      // node ends, luminous in the middle) so bridges read as flowing light,
      // not flat rules. A slow phase ripple slides the bright band along.
      const eg = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      const flow = 0.5 + Math.sin(this.phase * 0.6 + len * 0.01) * 0.12;
      eg.addColorStop(0, this.withAlpha(e.colour, 0.28));
      eg.addColorStop(Math.max(0.15, Math.min(0.85, flow)), e.colour);
      eg.addColorStop(1, this.withAlpha(e.colour, 0.28));
      ctx.strokeStyle = eg;
      ctx.globalAlpha = dim ? 0.08 : 0.92;
      ctx.lineWidth = 1.2 + Math.min(3.2, (e.edge.weight ?? 1) * 0.7);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // 2) Metaball nodes — radial-gradient gooey halos that visually MERGE when
    //    close (drawn additively with soft glow). The 'lighter' composite makes
    //    overlapping halos sum into one continuous liquid field — the blob look.
    // GRAPH.3-HERO — the highest-degree node is the central "blob" (it gravitates
    // to centre via the force sim); give it an outsized, brighter halo so the graph
    // reads as edges converging into one luminous core (the MIAW signature).
    const primary = layout.nodes.length
      ? layout.nodes.reduce((m, n) => (n.radius > m.radius ? n : m), layout.nodes[0]!)
      : null;
    ctx.globalCompositeOperation = 'lighter';
    for (const n of layout.nodes) {
      const p = this.toScreen(n);
      const dim = this.isDimmed(n.node.id);
      const isPrimary = n === primary;
      const breathe = 1 + Math.sin(this.phase * 1.3 + n.radius) * 0.06;
      const haloR = n.radius * (isPrimary ? 4.4 : 2.6) * breathe;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, haloR);
      const c = n.colour;
      grad.addColorStop(0, this.withAlpha(c, dim ? 0.22 : isPrimary ? 0.98 : 0.85));
      grad.addColorStop(0.45, this.withAlpha(c, dim ? 0.08 : isPrimary ? 0.42 : 0.32));
      grad.addColorStop(1, this.withAlpha(c, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, haloR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // 3) Solid node cores + highlight rings (over the liquid field, for legibility).
    for (const n of layout.nodes) {
      const p = this.toScreen(n);
      const dim = this.isDimmed(n.node.id);
      const isHover = this.hovered === n;
      const isFocus = this.focused === n.node.id;
      const isPrimary = n === primary;
      const breathe = 1 + Math.sin(this.phase * 1.3 + n.radius) * 0.06;
      const r = n.radius * (isPrimary ? 0.66 : 0.5) * breathe;

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = dim ? this.withAlpha(n.colour, 0.35) : n.colour;
      ctx.fill();
      // GRAPH.3-HERO — the central blob always wears a crisp white ring.
      ctx.lineWidth = isPrimary ? 2.5 : isFocus ? 3 : isHover ? 2 : 1;
      ctx.strokeStyle =
        isHover || isFocus || isPrimary ? '#ffffff' : 'rgba(255,255,255,0.5)';
      ctx.stroke();
    }

    // 4) Labels — the central blob (always) + the hovered/focused node + neighbours.
    this.paintLabels(ctx, layout, primary);

    ctx.restore();
  }

  private paintLabels(
    ctx: CanvasRenderingContext2D,
    layout: GraphLayout,
    primary: LaidOutNode | null,
  ): void {
    const label = (n: LaidOutNode, strong: boolean) => {
      const p = this.toScreen(n);
      const text = this.labelFor(n.node);
      ctx.font = strong ? '600 12px system-ui, sans-serif' : '500 11px system-ui, sans-serif';
      const w = ctx.measureText(text).width + 12;
      const y = p.y - n.radius - 18;
      ctx.fillStyle = 'rgba(20,8,46,0.82)';
      this.roundRect(ctx, p.x - w / 2, y, w, 18, 9);
      ctx.fill();
      ctx.fillStyle = strong ? '#ffffff' : 'rgba(255,255,255,0.85)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, p.x, y + 9);
    };

    // GRAPH.3-HERO — the central blob always shows its label (the MIAW "miaw").
    if (primary && primary.node.id !== this.focused && this.hovered !== primary) {
      label(primary, true);
    }

    if (this.focused) {
      for (const id of this.neighbourIds) {
        const nn = layout.index.get(id);
        if (nn) label(nn, false);
      }
      const f = layout.index.get(this.focused);
      if (f) label(f, true);
    }
    if (this.hovered && this.hovered.node.id !== this.focused) {
      label(this.hovered, true);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // ── Dim / focus helpers ─────────────────────────────────────────────────────

  /** A node is dimmed when a focus/hover is active and it is NOT the
   *  hovered/focused node or one of its neighbours. */
  private isDimmed(id: string): boolean {
    const active = this.focused ?? this.hovered?.node.id ?? null;
    if (!active) return false;
    if (id === active) return false;
    if (this.focused && this.neighbourIds.has(id)) return false;
    if (this.hovered && this.hoverNeighbours.has(id)) return false;
    return true;
  }

  private hoverNeighbours: Set<string> = new Set();

  private recomputeNeighbours(id: string): void {
    this.neighbourIds = this.neighboursOf(id);
  }

  private neighboursOf(id: string): Set<string> {
    const out = new Set<string>();
    const graph = ow()?.__pryzmBuildingGraph;
    if (!graph) return out;
    try {
      for (const e of graph.outEdges(id)) out.add(e.to);
      for (const e of graph.inEdges(id)) out.add(e.from);
    } catch {
      /* ignore */
    }
    return out;
  }

  // ── Interaction ─────────────────────────────────────────────────────────────

  private wireCanvasEvents(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    this.on(canvas, 'mousemove', (ev) => this.onMove(ev as MouseEvent));
    this.on(canvas, 'mouseleave', () => {
      this.hovered = null;
      this.hoverNeighbours.clear();
    });
    this.on(canvas, 'click', (ev) => this.onClick(ev as MouseEvent));
    this.on(window, 'resize', () => {
      if (this.visible) this.resize();
    });
    // Esc closes the overlay.
    this.on(window, 'keydown', (ev) => {
      if (this.visible && (ev as KeyboardEvent).key === 'Escape') this.hide();
    });
  }

  private pick(ev: MouseEvent): LaidOutNode | null {
    const canvas = this.canvas;
    const layout = this.layout;
    if (!canvas || !layout) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left;
    const my = ev.clientY - rect.top;
    let best: LaidOutNode | null = null;
    let bestD = Infinity;
    for (const n of layout.nodes) {
      const p = this.toScreen(n);
      const d = Math.hypot(p.x - mx, p.y - my);
      const hit = Math.max(n.radius, 16);
      if (d < hit && d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  private onMove(ev: MouseEvent): void {
    const hit = this.pick(ev);
    if (hit !== this.hovered) {
      this.hovered = hit;
      this.hoverNeighbours = hit ? this.neighboursOf(hit.node.id) : new Set();
      if (this.canvas) this.canvas.style.cursor = hit ? 'pointer' : 'default';
    }
  }

  private onClick(ev: MouseEvent): void {
    const hit = this.pick(ev);
    // Click empty space, or re-click the focused node → deselect; else select.
    if (!hit || this.focused === hit.node.id) {
      this.focused = null;
      this.neighbourIds.clear();
    } else {
      this.focused = hit.node.id;
      this.recomputeNeighbours(hit.node.id);
    }
    this.updateDetailPanel();
  }

  // ── GRAPH.4 — node interrogation panel ──────────────────────────────────────

  /** The detail card (hidden until a node is clicked). On-brand white + #6600FF. */
  private buildDetailPanel(): HTMLElement {
    const el = document.createElement('div');
    el.setAttribute('data-testid', 'graph-detail-panel');
    Object.assign(el.style, {
      position: 'absolute', top: '56px', left: '18px',
      width: '300px', maxHeight: 'calc(100% - 88px)', overflowY: 'auto',
      display: 'none', pointerEvents: 'auto',
      background: '#ffffff', color: '#241a3a',
      border: `1px solid ${ACCENT}`, borderRadius: '14px',
      boxShadow: '0 12px 44px rgba(40,10,90,0.38)',
      font: '500 12px/1.45 system-ui, sans-serif',
    } satisfies Partial<CSSStyleDeclaration>);
    this.detailEl = el;
    return el;
  }

  /** Populate the detail card from the focused node: what element it is, its key
   *  properties, every relationship (typed edge → neighbour), and the rules it
   *  breaks. Hidden when nothing is selected. Re-run on select + on graph rebuild. */
  private updateDetailPanel(): void {
    const el = this.detailEl;
    if (!el) return;
    const id = this.focused;
    const graph = ow()?.__pryzmBuildingGraph;
    const node = id && graph ? (() => { try { return graph.getNode(id); } catch { return null; } })() : null;
    if (!id || !graph || !node) { el.style.display = 'none'; el.replaceChildren(); return; }

    const labelOf = (nid: string): string => {
      try { const nn = graph.getNode(nid); return nn ? this.labelFor(nn) : nid; } catch { return nid; }
    };
    const kindOf = (nid: string): string => {
      try { return graph.getNode(nid)?.kind ?? 'element'; } catch { return 'element'; }
    };

    el.replaceChildren();
    el.style.display = 'block';

    // Header: kind badge + label + close.
    const head = document.createElement('div');
    Object.assign(head.style, { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 12px 8px', borderBottom: '1px solid #efe9fb' });
    const badge = document.createElement('span');
    badge.textContent = this.humanKind(node.kind);
    Object.assign(badge.style, { background: ACCENT, color: '#fff', borderRadius: '999px', padding: '2px 9px', font: '700 10px/1 system-ui', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' });
    const ttl = document.createElement('div');
    ttl.textContent = this.labelFor(node);
    Object.assign(ttl.style, { font: '700 13px/1.25 system-ui', flex: '1', overflow: 'hidden', textOverflow: 'ellipsis' });
    const x = document.createElement('button');
    x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'Deselect');
    Object.assign(x.style, { border: 'none', background: 'transparent', color: '#9b93b5', cursor: 'pointer', font: '600 13px/1 system-ui', padding: '2px' });
    this.on(x, 'click', () => { this.focused = null; this.neighbourIds.clear(); this.updateDetailPanel(); });
    head.append(badge, ttl, x);
    el.appendChild(head);

    const body = document.createElement('div');
    Object.assign(body.style, { padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '12px' });

    // id (monospace).
    const idRow = document.createElement('div');
    idRow.textContent = id;
    Object.assign(idRow.style, { font: '500 10px/1.3 ui-monospace, monospace', color: '#9b93b5', wordBreak: 'break-all' });
    body.appendChild(idRow);

    // Properties.
    const props = (node.props ?? {}) as Record<string, unknown>;
    const propRows = Object.entries(props)
      .filter(([k, v]) => v != null && v !== '' && typeof v !== 'object' && k !== 'name' && k !== 'label')
      .slice(0, 8);
    if (propRows.length) {
      body.appendChild(this.detailSection('Properties', propRows.map(([k, v]) =>
        this.detailRow(this.humanKind(k), this.fmtValue(k, v)))));
    }

    // Relationships — typed edges to/from neighbours.
    const rels: HTMLElement[] = [];
    try {
      for (const e of graph.outEdges(id)) rels.push(this.relRow('→', e.type, kindOf(e.to), labelOf(e.to)));
      for (const e of graph.inEdges(id)) rels.push(this.relRow('←', e.type, kindOf(e.from), labelOf(e.from)));
    } catch { /* ignore */ }
    body.appendChild(this.detailSection(`Relationships (${rels.length})`,
      rels.length ? rels : [this.detailRow('', 'none')]));

    // Rules — violations. If THIS is a rule node, show who violates it; else
    // show the rules this element breaks (its outgoing `violates` edges).
    const ruleRows: HTMLElement[] = [];
    try {
      if (node.kind === 'rule') {
        for (const e of graph.inEdges(id, 'violates')) ruleRows.push(this.ruleRow(`${labelOf(e.from)} violates this`));
      } else {
        for (const e of graph.outEdges(id, 'violates')) ruleRows.push(this.ruleRow(`Breaks: ${labelOf(e.to)}${e.evidence ? ` — ${e.evidence}` : ''}`));
      }
    } catch { /* ignore */ }
    if (ruleRows.length) body.appendChild(this.detailSection('Rules', ruleRows));

    el.appendChild(body);
  }

  private detailSection(title: string, rows: HTMLElement[]): HTMLElement {
    const sec = document.createElement('div');
    const h = document.createElement('div');
    h.textContent = title;
    Object.assign(h.style, { font: '700 10px/1 system-ui', textTransform: 'uppercase', letterSpacing: '0.05em', color: ACCENT, marginBottom: '6px' });
    sec.appendChild(h);
    const list = document.createElement('div');
    Object.assign(list.style, { display: 'flex', flexDirection: 'column', gap: '4px' });
    for (const r of rows) list.appendChild(r);
    sec.appendChild(list);
    return sec;
  }

  private detailRow(key: string, val: string): HTMLElement {
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', justifyContent: 'space-between', gap: '10px' });
    if (key) {
      const k = document.createElement('span');
      k.textContent = key;
      Object.assign(k.style, { color: '#7d749a', whiteSpace: 'nowrap' });
      row.appendChild(k);
    }
    const v = document.createElement('span');
    v.textContent = val;
    Object.assign(v.style, { color: '#241a3a', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' });
    row.appendChild(v);
    return row;
  }

  private relRow(dir: string, type: string, neighbourKind: string, neighbourLabel: string): HTMLElement {
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '6px' });
    const t = document.createElement('span');
    t.textContent = `${dir} ${type}`;
    Object.assign(t.style, { color: ACCENT, font: '600 11px/1.3 system-ui', whiteSpace: 'nowrap' });
    const n = document.createElement('span');
    n.textContent = `${this.humanKind(neighbourKind)} · ${neighbourLabel}`;
    Object.assign(n.style, { color: '#241a3a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
    row.append(t, n);
    return row;
  }

  private ruleRow(text: string): HTMLElement {
    const row = document.createElement('div');
    row.textContent = `⚠ ${text}`;
    Object.assign(row.style, { color: '#c2185b', font: '600 11px/1.35 system-ui' });
    return row;
  }

  private humanKind(s: string): string {
    return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private fmtValue(key: string, v: unknown): string {
    if (typeof v === 'number') {
      if (/area/i.test(key)) return `${v.toFixed(1)} m²`;
      return Number.isInteger(v) ? String(v) : v.toFixed(2);
    }
    return String(v);
  }

  // ── Small drawing/util helpers ─────────────────────────────────────────────

  private labelFor(node: UbgNode): string {
    const props = node.props as Record<string, unknown> | undefined;
    const pick = (k: string): string | undefined => {
      const v = props?.[k];
      return typeof v === 'string' && v.length > 0 ? v : undefined;
    };
    // Prefer a human name; widen the fallbacks beyond name/label/roomType to the
    // element-type fields so a node never renders as the bare generic kind
    // "element" when richer detail is available on its props.
    const name =
      pick('name') ??
      pick('label') ??
      pick('roomType') ??
      pick('elementType') ??
      pick('type') ??
      pick('category');
    // Humanize a slug so even a kind-only fallback reads cleanly:
    // 'element' → 'Element', 'curtain_wall' / 'curtain-wall' → 'Curtain Wall'.
    const humanize = (s: string): string =>
      s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const base = name && name.length > 0 ? name : humanize(node.kind);
    return base.length > 26 ? `${base.slice(0, 25)}…` : base;
  }

  private withAlpha(colour: string, alpha: number): string {
    // Accept #rrggbb or rgba(...) — produce an rgba() with the given alpha.
    if (colour.startsWith('#')) {
      const r = parseInt(colour.slice(1, 3), 16);
      const g = parseInt(colour.slice(3, 5), 16);
      const b = parseInt(colour.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    const m = colour.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const parts = m[1].split(',').map((s) => s.trim());
      return `rgba(${parts[0]},${parts[1]},${parts[2]},${alpha})`;
    }
    return colour;
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  private on(target: EventTarget, ev: string, fn: DomHandler): void {
    target.addEventListener(ev, fn);
    this.domHandlers.push([target, ev, fn]);
  }
}
