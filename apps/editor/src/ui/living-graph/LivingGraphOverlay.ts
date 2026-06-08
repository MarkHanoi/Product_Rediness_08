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
import { RoomFocusController, type RoomFocusMode } from './livingGraphSelection';
// A.26.3 — Editable Living Graph: the inspect card's AREA edit writes a per-room
// override to this session stash, then fires the EXISTING debounced apartment
// re-generate (ADR-0061: no parallel mutator — same seam as the A.25 sliders).
import {
  setRoomAreaOverride,
  getRoomAreaOverride,
} from '../apartment-layout/activeRoomAreaOverrides';
// A.26.4 — Editable Living Graph: the inspect card's OCCUPANCY/TYPE select writes
// a per-room type override to this stash, then fires the SAME debounced
// apartment re-generate (ADR-0061 / C52 — sibling of the A.26.3 area edit).
import {
  setRoomTypeOverride,
  getRoomTypeOverride,
  ROOM_TYPE_VALUES,
  type RoomTypeValue,
} from '../apartment-layout/activeRoomTypeOverrides';
import { triggerApartmentLayout } from '../apartment-layout/apartmentLayoutTrigger';
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
// A.26.4 — friendly labels for the editable occupancy/type select (keys are the
// engine RoomType values from `ROOM_TYPE_VALUES`).
const ROOM_TYPE_LABEL: Record<RoomTypeValue, string> = {
  master: 'Master Bedroom',
  bedroom: 'Bedroom',
  living: 'Living Room',
  kitchen: 'Kitchen',
  dining: 'Dining',
  bathroom: 'Bathroom',
  ensuite: 'En-suite',
  wc: 'WC',
  hall: 'Entrance Hall',
  corridor: 'Corridor',
  study: 'Study',
  utility: 'Utility',
};
const REBUILT_EVENT = 'pryzm:building-graph-rebuilt';
// A.26.3 — fired by ApartmentLayoutExecutor after a (re-)generate commits a new
// layout; the overlay rebuilds the UBG so an area edit's re-generate re-lays-out
// the graph automatically.
const LAYOUT_EXECUTED_EVENT = 'apartment.layout-executed';
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

  // §A.21.D37 — SELECT-TO-3D. Routes the focused room node to the live model as
  // either a scene highlight (Select) or an isolation (Isolate), reusing the
  // Inspect panel's isolation pipeline.
  private focusCtl = new RoomFocusController();
  private modeBtns = new Map<RoomFocusMode, HTMLButtonElement>();

  // §A.21.D37 — Miro/Mural canvas nav. Once the user wheel-zooms or drags the
  // empty canvas we SUSPEND the per-frame auto-fit so we don't fight them, until
  // a Rerun / reset re-enables it. `panning` tracks a canvas (not node) drag.
  private userNavigated = false;
  private panning = false;
  private panStartX = 0;
  private panStartY = 0;
  private panStartOffX = 0;
  private panStartOffY = 0;
  /** A node-drag in progress (canvas drag must NOT start when dragging a node). */
  private nodeDragId: string | null = null;
  private nodeDragMoved = false;

  // Tick + subscriptions.
  private tickDispose: TickDisposer | null = null;
  private intervalId: number | null = null;
  private unsubs: Array<() => void> = [];
  private domHandlers: Array<[EventTarget, string, DomHandler]> = [];

  // §RE-ENTRY guard — never re-pull while already pulling (the rebuilt event can
  // fire synchronously during our own read on some buses).
  private resyncing = false;

  // A.26.3 — debounce for the live re-generate fired by an AREA edit, so typing
  // doesn't spam the generate pipeline (mirrors DesignParamsPanel's debounce).
  private areaRegenTimer: ReturnType<typeof setTimeout> | null = null;

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

    root.appendChild(this.buildModeToggle());
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
        // field expands to use the extra space as the user drags (unless the
        // user has manually zoomed/panned — §A.21.D37).
        this.recomputeParams();
        if (!this.userNavigated) this.autoFit();
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

  /**
   * §A.26.2 — the Living Graph adopts the INSPECT-TAB chrome: a purple-gradient
   * header (the canonical onboarding / InspectPanel header — `linear-gradient(
   * 135deg, #6600ff, #8b2fe0)` + white text) over the white body. Reads as "the
   * inspect tab, as a panel". The header stays the drag handle (movable) and the
   * resize grip + zoom/pan are untouched (still movable/zoomable). The badges +
   * Freeze + ✕ are restyled for legibility on the purple ground (translucent-
   * white chips + white outline buttons).
   */
  private buildHeader(): HTMLElement {
    const bar = document.createElement('div');
    Object.assign(bar.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '11px 12px',
      cursor: 'grab',
      // §A.26.2 — Inspect-tab purple gradient (matches onboardingStyles.ts +
      // the InspectPanel header). White text on top.
      background: 'linear-gradient(135deg, #6600ff 0%, #8b2fe0 100%)',
      color: '#ffffff',
    } satisfies Partial<CSSStyleDeclaration>);

    // §A.26.2 — an Inspect "🔍" affordance + title, so it reads as the Inspect tab.
    const title = document.createElement('div');
    title.textContent = '🔍 Inspect · Living Graph';
    Object.assign(title.style, { font: '700 13px/1 system-ui, sans-serif', color: '#ffffff', flexShrink: '0' });

    const settled = document.createElement('span');
    settled.textContent = 'settling…';
    Object.assign(settled.style, headerChipStyle());
    this.settledBadge = settled;

    const rooms = document.createElement('span');
    rooms.textContent = '0 rooms';
    Object.assign(rooms.style, headerChipStyle());
    this.roomsBadge = rooms;

    const spacer = document.createElement('div');
    spacer.style.flex = '1';

    const freeze = document.createElement('button');
    freeze.type = 'button';
    freeze.textContent = '⏸ Freeze';
    Object.assign(freeze.style, headerBtnStyle());
    this.on(freeze, 'click', () => this.toggleFreeze());
    this.freezeBtn = freeze;

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Close living graph');
    Object.assign(close.style, { ...headerBtnStyle(), padding: '4px 9px' });
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

  /**
   * §A.21.D37 — the SELECT-TO-3D mode toggle + a Fit button. Brand-styled
   * (#6600FF / white, no black). "Select" highlights the clicked room's geometry
   * in the live model; "Isolate" dims everything else. "Fit" re-frames the graph
   * and re-enables auto-fit after manual zoom/pan.
   */
  private buildModeToggle(): HTMLElement {
    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px 0',
    } satisfies Partial<CSSStyleDeclaration>);

    const label = document.createElement('span');
    label.textContent = '3D';
    Object.assign(label.style, { color: '#6b6385', font: '600 11px/1 system-ui', flexShrink: '0' });

    // Segmented Select / Isolate control.
    const seg = document.createElement('div');
    Object.assign(seg.style, {
      display: 'inline-flex',
      border: `1.5px solid ${ACCENT}`,
      borderRadius: '999px',
      overflow: 'hidden',
    } satisfies Partial<CSSStyleDeclaration>);
    const modes: Array<{ mode: RoomFocusMode; text: string; title: string }> = [
      { mode: 'select', text: 'Select', title: 'Highlight this room in the 3D model' },
      { mode: 'isolate', text: 'Isolate', title: 'Dim everything except this room in the 3D model' },
    ];
    for (const m of modes) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = m.text;
      btn.title = m.title;
      Object.assign(btn.style, {
        cursor: 'pointer',
        border: 'none',
        background: '#ffffff',
        color: ACCENT,
        padding: '4px 12px',
        font: '600 11px/1 system-ui, sans-serif',
        whiteSpace: 'nowrap',
      } satisfies Partial<CSSStyleDeclaration>);
      this.on(btn, 'click', () => this.setMode(m.mode));
      this.modeBtns.set(m.mode, btn);
      seg.appendChild(btn);
    }

    const spacer = document.createElement('div');
    spacer.style.flex = '1';

    const fit = document.createElement('button');
    fit.type = 'button';
    fit.textContent = '⤢ Fit';
    fit.title = 'Fit the graph to the panel (re-enables auto-fit)';
    Object.assign(fit.style, pillBtnStyle());
    this.on(fit, 'click', () => this.resetView());

    wrap.append(label, seg, spacer, fit);
    // Paint the initial active mode.
    this.refreshModeButtons();
    return wrap;
  }

  /** Highlight the active segment (#6600FF fill) and dim the other. */
  private refreshModeButtons(): void {
    const active = this.focusCtl.getMode();
    for (const [mode, btn] of this.modeBtns) {
      const on = mode === active;
      btn.style.background = on ? ACCENT : '#ffffff';
      btn.style.color = on ? '#ffffff' : ACCENT;
    }
  }

  private setMode(mode: RoomFocusMode): void {
    this.focusCtl.setMode(mode);
    this.refreshModeButtons();
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
    // A.26.3 — cancel any pending area-edit re-generate.
    if (this.areaRegenTimer !== null) { clearTimeout(this.areaRegenTimer); this.areaRegenTimer = null; }
    // §A.21.D37 — drop any 3D highlight/isolation + tear down the pipeline.
    try { this.focusCtl.dispose(); } catch { /* ignore */ }
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
    // §A.21.D37 — closing the panel must not leave the 3D model highlighted /
    // isolated. Restore the scene (keeps the pipeline alive for the next open).
    try { this.focusCtl.clear(); } catch { /* ignore */ }
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
      if (this.draw.focusedId && !ids.has(this.draw.focusedId)) {
        this.draw.focusedId = null;
        // §A.21.D37 — the focused room vanished from the model; clear its 3D
        // highlight/isolation too.
        try { this.focusCtl.clear(); } catch { /* ignore */ }
      }
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
    // A.26.3 — after an apartment RE-GENERATE commits a new layout
    // (`apartment.layout-executed`, fired by the executor the area-edit trigger
    // drives), the cached UBG is STALE (old room set). Rebuild it from the live
    // model so the graph re-lays-out around the new room sizes. The rebuild
    // emits `pryzm:building-graph-rebuilt` → `onRebuilt` re-binds the overlay.
    // Guarded + re-entry-safe (raises `resyncing` so the rebuild's own emitted
    // event isn't double-handled). Only when visible — a closed panel skips it.
    const onLayoutExecuted = () => {
      if (!this.visible || this.resyncing) return;
      this.rebuildGraphFromModel();
    };
    if (events?.on) {
      try {
        this.unsubs.push(events.on(REBUILT_EVENT, onRebuilt));
        for (const ev of RESYNC_EVENTS) this.unsubs.push(events.on(ev, onRebuilt));
        this.unsubs.push(events.on(LAYOUT_EXECUTED_EVENT, onLayoutExecuted));
        return;
      } catch {
        /* fall through to DOM */
      }
    }
    const handler: DomHandler = () => onRebuilt();
    this.on(window, REBUILT_EVENT, handler);
    for (const ev of RESYNC_EVENTS) this.on(window, ev, handler);
    this.on(window, LAYOUT_EXECUTED_EVENT, () => onLayoutExecuted());
  }

  /**
   * §A.26.3 — rebuild the UBG from the live model via the existing
   * `window.pryzmBuildBuildingGraph()` hook, then resync the overlay. Used after
   * an apartment re-generate so the graph re-lays-out around the new layout. We
   * raise `resyncing` across the rebuild so the hook's emitted
   * `building-graph-rebuilt` event doesn't recurse; we resync explicitly after.
   * Defensive — a rebuild failure never breaks the overlay.
   */
  private rebuildGraphFromModel(): void {
    const w = window as unknown as { pryzmBuildBuildingGraph?: () => unknown };
    if (typeof w.pryzmBuildBuildingGraph !== 'function') return;
    try {
      this.resyncing = true;
      try { w.pryzmBuildBuildingGraph(); } finally { this.resyncing = false; }
      this.resync(false);
      this.ensureTicking();
    } catch {
      /* defensive — a graph-rebuild failure must never break the overlay */
    }
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
    // §A.21.D37 — while the user is dragging a node, hold the sim so the node
    // stays pinned under the cursor (the field re-anneals on release).
    if (this.nodeDragId) {
      this.renderer.draw(this.graph, this.layers, this.draw);
      return;
    }
    if (!this.frozen && !isSettled(this.sim)) {
      // Heat scales steps/frame (1..~5) so the slider warms the field.
      const steps = Math.max(1, Math.round(this.heat * 1.6));
      for (let i = 0; i < steps; i++) simulateStep(this.graph, this.layers, this.sim, this.params);
      // Keep the spreading cloud framed every frame (cheap O(n)) — UNLESS the
      // user has manually zoomed/panned (§A.21.D37: don't fight manual nav).
      if (!this.userNavigated) this.autoFit();
      if (isSettled(this.sim)) {
        this.updateBadges();
        // Settled — final fit + one last paint, then stop ticking.
        if (!this.userNavigated) this.autoFit();
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

    // Hover feedback (skipped while actively panning/dragging a node).
    this.on(canvas, 'mousemove', (ev) => {
      if (this.panning || this.nodeDragId) return;
      const hit = this.renderer?.pick((ev as MouseEvent).clientX, (ev as MouseEvent).clientY, this.graph, this.draw) ?? null;
      const id = hit?.id ?? null;
      if (id !== this.draw.hoveredId) {
        this.draw.hoveredId = id;
        canvas.style.cursor = id ? 'pointer' : 'grab';
        this.paintOnce();
      }
    });
    this.on(canvas, 'mouseleave', () => {
      if (this.draw.hoveredId) {
        this.draw.hoveredId = null;
        this.paintOnce();
      }
    });

    // §A.21.D37 — Miro/Mural pointer drag: drag ON a node moves the node; drag on
    // EMPTY canvas pans the field. A click (no movement) selects/inspects.
    this.on(canvas, 'mousedown', (ev) => this.onCanvasPointerDown(ev as MouseEvent));

    // §A.21.D37 — scroll-wheel zoom anchored to the cursor (zoom toward pointer).
    // Non-passive so `preventDefault()` stops the page scrolling under the panel.
    this.on(canvas, 'wheel', (ev) => this.onCanvasWheel(ev as WheelEvent), { passive: false });

    this.on(window, 'resize', () => {
      if (this.visible) {
        this.renderer?.resize();
        this.recomputeParams();
        if (!this.userNavigated) this.autoFit();
        this.paintOnce();
      }
    });
  }

  // ── §A.21.D37 — Miro/Mural canvas navigation ─────────────────────────────────

  /** Client point → canvas-local px (origin top-left of the canvas box). */
  private clientToCanvas(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvasEl?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  }

  /** Canvas-local px → LAYOUT coords (inverse of the renderer's `toScreen`):
   *  screen = W/2 + offset + layout*scale  ⇒  layout = (screen - W/2 - offset)/scale. */
  private canvasToLayout(cx: number, cy: number): { x: number; y: number } {
    const { w, h } = this.canvasBox();
    const s = this.draw.scale ?? 1;
    return {
      x: (cx - w / 2 - this.draw.offsetX) / s,
      y: (cy - h / 2 - this.draw.offsetY) / s,
    };
  }

  /** Scroll-wheel zoom toward the cursor, clamped 0.25×–4×. Keeps the layout
   *  point under the pointer fixed on screen, and SUSPENDS auto-fit. */
  private onCanvasWheel(ev: WheelEvent): void {
    ev.preventDefault();
    const s0 = this.draw.scale ?? 1;
    // Smooth multiplicative zoom; deltaY<0 (scroll up) zooms in.
    const factor = Math.exp(-ev.deltaY * 0.0015);
    const s1 = Math.max(0.25, Math.min(4, s0 * factor));
    if (s1 === s0) return;
    const { x: cx, y: cy } = this.clientToCanvas(ev.clientX, ev.clientY);
    const { w, h } = this.canvasBox();
    // Layout point under the cursor BEFORE zoom (using old scale/offset).
    const lx = (cx - w / 2 - this.draw.offsetX) / s0;
    const ly = (cy - h / 2 - this.draw.offsetY) / s0;
    // Solve new offset so that same layout point stays under the cursor.
    this.draw.scale = s1;
    this.draw.offsetX = cx - w / 2 - lx * s1;
    this.draw.offsetY = cy - h / 2 - ly * s1;
    this.userNavigated = true; // don't let auto-fit fight the user
    this.paintOnce();
  }

  /** Pointer down on the canvas: start a node-drag (on a node) or a pan (empty). */
  private onCanvasPointerDown(ev: MouseEvent): void {
    if (ev.button !== 0) return; // left button only
    const hit = this.renderer?.pick(ev.clientX, ev.clientY, this.graph, this.draw) ?? null;
    const canvas = this.canvasEl;
    if (hit) {
      // Drag the node (pin it under the cursor while dragging).
      this.nodeDragId = hit.id;
      this.nodeDragMoved = false;
    } else {
      // Pan the empty canvas.
      this.panning = true;
      this.panStartX = ev.clientX;
      this.panStartY = ev.clientY;
      this.panStartOffX = this.draw.offsetX;
      this.panStartOffY = this.draw.offsetY;
      if (canvas) canvas.style.cursor = 'grabbing';
    }
    const move = (e: Event) => this.onCanvasPointerMove(e as MouseEvent);
    const up = (e: Event) => {
      this.onCanvasPointerUp(e as MouseEvent);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  private onCanvasPointerMove(ev: MouseEvent): void {
    if (this.nodeDragId) {
      const node = this.graph.nodes.find((n) => n.id === this.nodeDragId);
      if (!node) return;
      const { x: cx, y: cy } = this.clientToCanvas(ev.clientX, ev.clientY);
      const lp = this.canvasToLayout(cx, cy);
      node.x = lp.x;
      node.y = lp.y;
      node.vx = 0;
      node.vy = 0;
      this.nodeDragMoved = true;
      this.paintOnce();
      return;
    }
    if (this.panning) {
      this.draw.offsetX = this.panStartOffX + (ev.clientX - this.panStartX);
      this.draw.offsetY = this.panStartOffY + (ev.clientY - this.panStartY);
      this.userNavigated = true; // suspend auto-fit
      this.paintOnce();
    }
  }

  private onCanvasPointerUp(ev: MouseEvent): void {
    const canvas = this.canvasEl;
    if (this.nodeDragId) {
      const draggedId = this.nodeDragId;
      const moved = this.nodeDragMoved;
      this.nodeDragId = null;
      this.nodeDragMoved = false;
      if (canvas) canvas.style.cursor = 'pointer';
      if (moved) {
        // A real drag re-anneals the field around the moved node; suspend
        // auto-fit so the user-placed node stays put.
        this.userNavigated = true;
        reheat(this.sim, 0.4);
        this.ensureTicking();
      } else {
        // No movement → treat as a click → select/inspect the node.
        this.onNodeClick(draggedId);
      }
      return;
    }
    if (this.panning) {
      this.panning = false;
      if (canvas) canvas.style.cursor = 'grab';
      // A pan with no movement on empty space = a click on empty → clear focus.
      const moved = Math.abs(ev.clientX - this.panStartX) > 3 || Math.abs(ev.clientY - this.panStartY) > 3;
      if (!moved) this.onNodeClick(null);
    }
  }

  /** Focus/inspect a node (or clear when null) + drive the 3D model. */
  private onNodeClick(id: string | null): void {
    this.draw.focusedId = id && id !== this.draw.focusedId ? id : null;
    this.updateInspector();
    // §A.21.D37 — route the focused room to the live 3D model (select / isolate).
    this.focusCtl.focus(this.draw.focusedId);
    this.paintOnce();
  }

  /** §A.21.D37 — re-enable auto-fit (Fit button) and re-frame the graph now.
   *  Cancels any manual zoom/pan so the field fills the panel again. */
  private resetView(): void {
    this.userNavigated = false;
    this.recomputeParams();
    this.autoFit();
    this.paintOnce();
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
    // §A.21.D37 — Rerun re-enables auto-fit (cancels manual zoom/pan) and drops
    // any 3D highlight/isolation, since the full scatter clears the focus.
    this.userNavigated = false;
    try { this.focusCtl.clear(); } catch { /* ignore */ }
    this.ensureTicking();
  }

  // ── Chrome updates ─────────────────────────────────────────────────────────

  private updateBadges(): void {
    if (this.roomsBadge) this.roomsBadge.textContent = `${this.graph.nodes.length} rooms`;
    if (this.settledBadge) {
      const settled = isSettled(this.sim) || this.frozen;
      this.settledBadge.textContent = settled ? '✓ settled' : 'settling…';
      // §A.26.2 — header chips sit on the purple Inspect-tab gradient: keep them
      // white-on-translucent. Settled gets a faint green tint to read "done".
      Object.assign(this.settledBadge.style, headerChipStyle());
      if (settled) this.settledBadge.style.background = 'rgba(120,240,180,0.30)';
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
    const metrics = document.createElement('div');
    Object.assign(metrics.style, { display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'center', color: '#4b4163', font: '500 11px/1.4 system-ui' });
    metrics.append(
      // A.26.3 — the AREA is now EDITABLE. Committing it stashes a per-room
      // override + fires the existing debounced apartment re-generate so the
      // layout updates this room's size (and the graph re-lays-out).
      this.areaField(node),
      // A.26.4 — the OCCUPANCY/TYPE is now EDITABLE. Picking a new room type
      // stashes a per-room type override + fires the SAME debounced re-generate
      // so the engine re-types that room (sibling of the area edit).
      this.occupancyField(node),
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

  /**
   * §A.26.3 — the EDITABLE area field for the inspect card. A compact numeric
   * input (brand white + #6600FF) seeded with the room's current area (or any
   * pending per-room override the user already set). On commit (Enter / blur) it
   * writes the override keyed by the room's DISPLAY NAME — the deterministic name
   * the bubble graph mints + honours via `roomAreasByName` — into the session
   * stash, then fires the EXISTING debounced apartment re-generate. A blank /
   * non-positive value CLEARS the override (reverts that room to the engine
   * default). Mutation stays on the existing trigger → command-bus path (P6).
   */
  private areaField(node: GraphNode): HTMLElement {
    const wrap = document.createElement('span');
    Object.assign(wrap.style, { display: 'inline-flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' });

    const icon = document.createElement('span');
    icon.textContent = '📐';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '0.5';
    input.setAttribute('aria-label', `Area of ${node.label} in square metres`);
    input.title = 'Edit this room’s target area (m²) — the layout re-generates to match';
    // Seed with the pending override if any, else the room's real area.
    const pending = getRoomAreaOverride(node.label);
    const seed = pending ?? (node.areaSqm > 0 ? node.areaSqm : undefined);
    input.value = seed !== undefined ? String(Math.round(seed * 10) / 10) : '';
    input.placeholder = '—';
    Object.assign(input.style, {
      width: '52px',
      border: `1px solid ${ACCENT}`,
      borderRadius: '6px',
      padding: '1px 5px',
      font: '600 11px/1.4 system-ui, sans-serif',
      color: '#241a3a',
      background: '#ffffff',
      outline: 'none',
    } satisfies Partial<CSSStyleDeclaration>);

    const unit = document.createElement('span');
    unit.textContent = 'm²';
    Object.assign(unit.style, { color: '#241a3a' });

    const commit = (): void => {
      const raw = input.value.trim();
      const val = raw === '' ? null : Number(raw);
      const next = typeof val === 'number' && Number.isFinite(val) && val > 0 ? val : null;
      const prev = getRoomAreaOverride(node.label) ?? null;
      // Only re-generate when the committed value actually changes the override
      // (avoids a spurious re-run on a no-op blur — keeps the baseline-identity
      // behaviour: an un-touched field never triggers generation).
      if (next === prev) return;
      setRoomAreaOverride(node.label, next);
      this.scheduleAreaRegen();
    };

    // Commit on Enter (also blur the field) and on blur.
    this.on(input, 'keydown', (ev) => {
      if ((ev as KeyboardEvent).key === 'Enter') {
        ev.preventDefault();
        input.blur();
      }
    });
    this.on(input, 'change', () => commit());
    // Don't let canvas/panel drag handlers swallow clicks into the input.
    this.on(input, 'mousedown', (ev) => ev.stopPropagation());
    this.on(input, 'pointerdown', (ev) => ev.stopPropagation());

    wrap.append(icon, input, unit);
    return wrap;
  }

  /**
   * §A.26.4 — the EDITABLE occupancy/type select for the inspect card. A compact
   * `<select>` (brand white + #6600FF) of the real engine room types (from the
   * program rules). The first option "— (detected)" clears any override (reverts
   * the room to the engine's flag-derived type). Picking a type writes the
   * per-room override keyed by the room's DISPLAY NAME — the deterministic name
   * the bubble graph mints + honours via `roomTypesByName` — into the session
   * stash, then fires the EXISTING debounced apartment re-generate. Mutation
   * stays on the existing trigger → command-bus path (P6).
   *
   * We seed the select from any PENDING override (so a re-opened card shows the
   * user's choice); with no override it sits on "— (detected)" rather than
   * guessing the room's specific engine RoomType from the coarse graph `type`
   * (the graph node carries a RoomKind + an occupancy STRING, not the engine
   * RoomType — see livingGraphSchema). This keeps the edit honest: the user
   * declares the target type; an un-touched select never triggers a re-generate.
   */
  private occupancyField(node: GraphNode): HTMLElement {
    const wrap = document.createElement('span');
    Object.assign(wrap.style, { display: 'inline-flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap' });

    const icon = document.createElement('span');
    icon.textContent = '🏷';

    const select = document.createElement('select');
    select.setAttribute('aria-label', `Room type of ${node.label}`);
    select.title = 'Change this room’s type — the layout re-generates to match';
    Object.assign(select.style, {
      maxWidth: '110px',
      border: `1px solid ${ACCENT}`,
      borderRadius: '6px',
      padding: '1px 4px',
      font: '600 11px/1.4 system-ui, sans-serif',
      color: '#241a3a',
      background: '#ffffff',
      outline: 'none',
      cursor: 'pointer',
    } satisfies Partial<CSSStyleDeclaration>);

    // First option clears the override (revert to the detected/engine default).
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '— (detected)';
    select.appendChild(blank);

    const pending = getRoomTypeOverride(node.label);
    for (const t of ROOM_TYPE_VALUES) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = ROOM_TYPE_LABEL[t] ?? t;
      if (pending === t) opt.selected = true;
      select.appendChild(opt);
    }
    if (!pending) blank.selected = true;

    const commit = (): void => {
      const raw = select.value;
      const next: RoomTypeValue | null = raw && (ROOM_TYPE_VALUES as readonly string[]).includes(raw)
        ? (raw as RoomTypeValue)
        : null;
      const prev = getRoomTypeOverride(node.label) ?? null;
      // Only re-generate when the committed value actually changes the override
      // (an un-touched select never triggers generation — baseline-identity).
      if (next === prev) return;
      setRoomTypeOverride(node.label, next);
      this.scheduleAreaRegen();
    };
    this.on(select, 'change', () => commit());
    // Don't let canvas/panel drag handlers swallow clicks into the select.
    this.on(select, 'mousedown', (ev) => ev.stopPropagation());
    this.on(select, 'pointerdown', (ev) => ev.stopPropagation());

    wrap.append(icon, select);
    return wrap;
  }

  /**
   * §A.26.3 — debounced live re-generate via the EXISTING apartment trigger.
   * `gatherLayoutPayload` reads the per-room override stash we just set →
   * merges it into `program.roomAreasByName` → the deterministic engine sizes
   * that room to the target. The resulting layout rebuilds the UBG + emits
   * `pryzm:building-graph-rebuilt`, which this overlay already re-binds on — so
   * the graph re-lays-out automatically. No new generate path (ADR-0061).
   */
  private scheduleAreaRegen(): void {
    if (this.areaRegenTimer !== null) clearTimeout(this.areaRegenTimer);
    this.areaRegenTimer = setTimeout(() => {
      this.areaRegenTimer = null;
      try {
        // triggerApartmentLayout resolves `window.runtime` itself when passed
        // null — so we can safely defer the runtime lookup to it.
        triggerApartmentLayout(null);
      } catch (e) {
        console.warn('[living-graph] area-edit re-generate failed (non-fatal):', e);
      }
    }, 450);
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

  private on(target: EventTarget, ev: string, fn: DomHandler, opts?: AddEventListenerOptions): void {
    target.addEventListener(ev, fn, opts);
    this.domHandlers.push([target, ev, fn]);
  }
}

/** §A.26.2 — a translucent-white chip for the purple Inspect-tab header. */
function headerChipStyle(): Partial<CSSStyleDeclaration> {
  return {
    background: 'rgba(255,255,255,0.20)',
    color: '#ffffff',
    borderRadius: '999px',
    padding: '2px 8px',
    font: '600 10px/1 system-ui, sans-serif',
    whiteSpace: 'nowrap',
  };
}

/** §A.26.2 — a white-outline pill button for the purple Inspect-tab header. */
function headerBtnStyle(): Partial<CSSStyleDeclaration> {
  return {
    cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.6)',
    background: 'rgba(255,255,255,0.12)',
    color: '#ffffff',
    borderRadius: '999px',
    padding: '4px 11px',
    font: '600 11px/1 system-ui, sans-serif',
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
