/**
 * GraphViewport — the navigable 3-D relationship graph.
 *
 * Layer Affected:  UI — Analysis surface (L7)
 * File:            apps/editor/src/ui/analysis/GraphViewport.ts
 * CSS prefix:      anl-  (shares the Analysis sheet)
 * ADR:             ADR-0364 §3.4 · ADR-0343 §D.3 (click-through is the join)
 * Contracts:       C27 §4 (SelectionBus is the single authorised entry point)
 * Issue log:       L-8442 · L-8443 · L-8444
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ WHAT THIS OWNS, AND — MORE IMPORTANTLY — WHAT IT DOES NOT
 * ═════════════════════════════════════════════════════════════════════════════
 * It owns a plain 2-D canvas, an orbit, a hit test and a label pass. It owns NO
 * WebGL context: it asks `ElementPreviewRenderer.requestGraphDraw()` for a blit,
 * exactly as the opening showroom does. There is ONE WebGL context in this
 * application outside the main viewport and this widget does not add a second —
 * see that module's header for why (browsers evict the OLDEST context, which
 * here is the founder's model).
 *
 * It owns no layout either: `forceLayoutND` computes positions, and that is the
 * SAME Barnes-Hut the 2-D SVG card uses, in three dimensions instead of two.
 *
 * ⛔ AND IT OWNS NO IDEA OF "SELECTED". A pick dispatches on `selectionBus`, the
 * single authorised entry point (C27 §4) — the same bus the SVG card, the 3-D
 * viewport, the plan view and the project browser already use. Publishing a
 * private event here would be a second idea of what selection means, and this
 * repository has paid for that shape repeatedly.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⛔ PICKING IS 2-D, ON PURPOSE — NO RAYCASTER, NO THREE TYPE
 * ═════════════════════════════════════════════════════════════════════════════
 * The renderer returns each node's projected SCREEN position after a draw, so the
 * hit test is "which projected disc contains the cursor, frontmost wins" — plain
 * arithmetic over numbers. Three consequences, all good:
 *   1. no THREE type crosses into the Analysis surface (P2 stays trivially true);
 *   2. labels are drawn into the 2-D canvas at full device resolution, so text is
 *      CRISP where an in-scene sprite would be resampled by the blit;
 *   3. the pick can never disagree with what was drawn, because it is computed
 *      from the very projection that drew it.
 *
 * ⛔ P3: no `requestAnimationFrame`, no ticker, no idle loop. A frame is drawn
 * only when the orbit, the subject or the size changes, and each request is
 * coalesced by the frame scheduler.
 *
 * §BRAND — white ground, PRYZM purple `#6600FF` for focus and affordances, no
 * black anywhere.
 */

import {
  requestGraphDraw,
  acquirePreviewMount,
  releasePreviewMount,
  DEFAULT_ORBIT,
  PITCH_LIMIT,
  type OrbitState,
  type ProjectedNode,
} from '../element-preview/ElementPreviewRenderer';
import type { GraphSubject } from '../element-preview/GraphPreviewSubject';
import { hopEmphasisFor } from './hopEmphasis';

const PURPLE = '#6600FF';
const LINE = '#d8dce3';
const MUTED = '#5b6472';
const INK = '#2b3242';

export interface GraphViewportHandle {
  /** Swap what is drawn. Cheap when the subject key is unchanged. */
  setSubject: (subject: GraphSubject) => void;
  /** Restore the default three-quarter view and the default zoom. */
  resetView: () => void;
  /** Draw again without changing anything — after a label/emphasis change. */
  redraw: () => void;
  /** Show or hide the per-node labels. */
  setLabels: (on: boolean) => void;
  /** A PNG data URL of exactly what is on screen, or `null` if nothing is drawn. */
  toPngDataUrl: () => string | null;
  /** Remove listeners and release the shared context if this was the last mount. */
  dispose: () => void;
  readonly el: HTMLElement;
}

export interface GraphViewportOptions {
  subject: GraphSubject;
  /** CSS height of the canvas box. Width follows the container. */
  heightPx?: number;
  /** Labels on at mount. */
  labels?: boolean;
  /** Human label per node id, for the drawn text and the aria description. */
  labelOf?: (id: string) => string;
  /** Called with the element id when a node is picked (click / Enter). */
  onPick?: (id: string) => void;
  /** Called with the id under the cursor, or `null`. Drives the hover readout. */
  onHover?: (id: string | null) => void;
  /**
   * ⭐ THE ORBIT, OWNED BY THE CALLER AND MUTATED IN PLACE.
   *
   * ⛔ This is not a convenience. The Analysis card is REBUILT WHOLE on every
   * selection change, so a viewport that owned its own orbit would snap the
   * camera back to the default every time the founder clicked a wall — the
   * picture would jump away from whatever he had just oriented it to see. A
   * caller-owned orbit survives the remount.
   */
  orbit?: OrbitState;
  /**
   * §GRAPH154 (L-12560..) — hop distance from the active model selection, per
   * element id. `null` (or omitted) means no selection is active: the SAME
   * meaning `NodeLinkOptions.hopOf` carries for the 2-D SVG card, and the same
   * `focusNeighbourhood().hopOf` map — this widget draws no second BFS, it
   * only draws a RING on top of the WebGL blit for whatever hop map the caller
   * already computed. See `hopEmphasis.ts` for the ramp both renderers share.
   */
  hopOf?: ReadonlyMap<string, number> | null;
}

/**
 * Mount a navigable 3-D relationship graph inside `host`.
 *
 * Returns a handle even when WebGL is unavailable — in that case the box shows a
 * NAMED reason rather than staying blank, because *"the viewport failed"* and
 * *"this view has nothing to draw"* must never look the same
 * (§CONTEXT-DATA-HONESTY). The 2-D SVG card remains available in that state, and
 * the message says so.
 */
export function mountGraphViewport(host: HTMLElement, opts: GraphViewportOptions): GraphViewportHandle {
  let subject = opts.subject;
  let labels = opts.labels ?? true;
  let disposed = false;
  let projected: Map<string, ProjectedNode> | null = null;
  let hovered: string | null = null;
  const orbit: OrbitState = opts.orbit ?? { ...DEFAULT_ORBIT };

  const root = document.createElement('div');
  root.className = 'anl-gv-root';

  const frame = document.createElement('div');
  frame.className = 'anl-gv-frame';
  frame.style.cssText =
    'position:relative;border:1px solid ' + LINE + ';border-radius:10px;overflow:hidden;' +
    // A very soft neutral sweep. Never a black stage — §BRAND.
    'background:linear-gradient(160deg,#ffffff 0%,#faf8ff 55%,#f3eeff 100%);' +
    `height:${opts.heightPx ?? 380}px;`;

  const canvas = document.createElement('canvas');
  canvas.className = 'anl-gv-canvas';
  canvas.tabIndex = 0;
  canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:grab;outline:none;touch-action:none;';
  canvas.setAttribute('role', 'img');

  const failure = document.createElement('div');
  failure.style.cssText =
    'position:absolute;inset:0;display:none;align-items:center;justify-content:center;' +
    'text-align:center;padding:18px;font-size:11.5px;line-height:1.5;color:' + MUTED + ';';
  failure.textContent =
    '3-D graph unavailable — this browser did not provide a WebGL context. This is a failure of the ' +
    'viewport, NOT a statement about your model: switch to 2D above and the same graph draws as SVG, ' +
    'with the same counts.';

  const hint = document.createElement('div');
  hint.style.cssText =
    'position:absolute;right:8px;bottom:6px;font-size:10px;color:' + MUTED + ';' +
    'background:rgba(255,255,255,.78);border-radius:999px;padding:2px 8px;pointer-events:none;';
  hint.textContent = 'drag to orbit · scroll to zoom · click a node to select it in 3-D';

  frame.append(canvas, failure, hint);
  root.append(frame);
  host.appendChild(root);

  // ── Sizing ────────────────────────────────────────────────────────────────
  //
  // ⚠ The backing store is sized in DEVICE pixels and capped at 2x. Uncapped DPR
  // on a 4K display would ask the shared buffer for a surface several times the
  // size the reader can actually resolve, for no visible gain — and that buffer
  // is shared with every element showroom in the app.
  function sizeCanvas(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(2, Math.round(frame.clientWidth * dpr));
    const h = Math.max(2, Math.round(frame.clientHeight * dpr));
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  function draw(): void {
    if (disposed) return;
    sizeCanvas();
    canvas.setAttribute(
      'aria-label',
      `3-D relationship graph: ${subject.nodes.length} elements, ${subject.links.length} typed relationships. ` +
        `${subject.caption}`,
    );
    requestGraphDraw(subject, canvas, orbit, (p) => {
      projected = p;
      failure.style.display = p === null ? 'flex' : 'none';
      if (p) paintOverlay(p);
    });
  }

  /**
   * The 2-D pass over the blit: labels, and the hover ring.
   *
   * ⛔ LABELS ARE DECLUTTERED BY A GRID, NOT BY A CAP. Drawing only "the first N"
   * would silently pick winners by array order — an arbitrary subset presented as
   * if it were the whole. A grid claim is at least a spatial rule the reader can
   * see operating: where two labels would overlap, the FRONTMOST wins, and the
   * hidden one is still reachable by hovering its node. The count printed under
   * the card is always the full one.
   */
  function paintOverlay(p: Map<string, ProjectedNode>): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    // §GRAPH154 (L-12560..) — SELECTED / CONNECTED rings, drawn in this SAME
    // 2-D overlay pass the hover ring already uses (below), never inside the
    // WebGL blit: `GraphNodeMark.colour` stays the element's CATEGORY colour
    // (P2 — no THREE type is named here, and this file owns no material), so
    // the ring is the ONLY channel selection draws on, exactly as the 2-D SVG
    // card resolves the same channel conflict (`hopEmphasis.ts`'s header).
    const hopOf = opts.hopOf ?? null;
    if (hopOf !== null) {
      for (const [id, node] of p) {
        const emphasis = hopEmphasisFor(hopOf.get(id), true);
        if (!emphasis.ringColour) continue;
        ctx.beginPath();
        ctx.arc(node.x, node.y, (node.r + 3 * dpr) * emphasis.radiusScale, 0, Math.PI * 2);
        ctx.strokeStyle = emphasis.ringColour;
        ctx.globalAlpha = emphasis.ringAlpha;
        ctx.lineWidth = 1.6 * dpr * emphasis.ringWidthScale;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    if (hovered) {
      const h = p.get(hovered);
      if (h) {
        ctx.beginPath();
        ctx.arc(h.x, h.y, Math.max(h.r + 3 * dpr, 6 * dpr), 0, Math.PI * 2);
        ctx.strokeStyle = PURPLE;
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();
      }
    }

    if (!labels) return;

    // Nearest-first, so the frontmost label wins a contested cell.
    const order = [...p.entries()].sort((a, b) => a[1].depth - b[1].depth);
    const cell = 46 * dpr;
    const taken = new Set<string>();
    ctx.font = `${10 * dpr}px var(--app-font, system-ui, sans-serif)`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const [id, node] of order) {
      const key = `${Math.floor(node.x / cell)}:${Math.floor(node.y / cell)}`;
      if (taken.has(key)) continue;
      taken.add(key);
      const text = (opts.labelOf?.(id) ?? id).slice(0, 20);
      const y = node.y + node.r + 3 * dpr;
      // A white halo under the text: the ground is a light gradient and a node may
      // sit under the label, so unhaloed text becomes unreadable exactly where the
      // graph is densest.
      ctx.lineWidth = 3 * dpr;
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.strokeText(text, node.x, y);
      ctx.fillStyle = id === hovered ? PURPLE : INK;
      ctx.fillText(text, node.x, y);
    }
  }

  // ── Hit testing ───────────────────────────────────────────────────────────

  /**
   * The node under `(x, y)` in canvas pixels, or `null`.
   *
   * ⚠ FRONTMOST WINS, and the slack is generous (a 6-device-pixel floor on the
   * radius). A 320-node graph draws small discs; requiring an exact hit would
   * make the picture look interactive while being, in practice, unclickable —
   * which is worse than a plainly static image because it reads as a bug in the
   * user's aim.
   */
  function hitTest(x: number, y: number): string | null {
    if (!projected) return null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let best: string | null = null;
    let bestDepth = Infinity;
    for (const [id, n] of projected) {
      const r = Math.max(n.r, 6 * dpr);
      const dx = x - n.x;
      const dy = y - n.y;
      if (dx * dx + dy * dy > r * r) continue;
      if (n.depth < bestDepth) {
        bestDepth = n.depth;
        best = id;
      }
    }
    return best;
  }

  function toCanvas(ev: PointerEvent | MouseEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) / rect.width) * canvas.width,
      y: ((ev.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  // ── Interaction ───────────────────────────────────────────────────────────

  let dragging = false;
  let moved = false;
  let lastX = 0;
  let lastY = 0;

  const onDown = (ev: PointerEvent): void => {
    dragging = true;
    moved = false;
    lastX = ev.clientX;
    lastY = ev.clientY;
    canvas.setPointerCapture(ev.pointerId);
    canvas.style.cursor = 'grabbing';
  };

  const onMove = (ev: PointerEvent): void => {
    if (dragging) {
      const dx = ev.clientX - lastX;
      const dy = ev.clientY - lastY;
      // 3 px of slack before a drag counts as a drag, so a click with a shaky
      // hand still selects rather than silently orbiting by a degree.
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      lastX = ev.clientX;
      lastY = ev.clientY;
      orbit.yaw -= dx * 0.008;
      orbit.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, orbit.pitch + dy * 0.008));
      draw();
      return;
    }
    const { x, y } = toCanvas(ev);
    const id = hitTest(x, y);
    if (id !== hovered) {
      hovered = id;
      canvas.style.cursor = id ? 'pointer' : 'grab';
      opts.onHover?.(id);
      draw();
    }
  };

  const onUp = (ev: PointerEvent): void => {
    if (dragging) {
      dragging = false;
      canvas.style.cursor = hovered ? 'pointer' : 'grab';
      try { canvas.releasePointerCapture(ev.pointerId); } catch { /* already released */ }
      if (moved) return; // an orbit is not a selection
    }
    const { x, y } = toCanvas(ev);
    const id = hitTest(x, y);
    if (id) opts.onPick?.(id);
  };

  const onWheel = (ev: WheelEvent): void => {
    ev.preventDefault();
    orbit.zoom = Math.max(0.35, Math.min(4, orbit.zoom * (ev.deltaY > 0 ? 1.12 : 0.89)));
    draw();
  };

  // C43 / C06 — keyboard-operable. A viewport only a mouse can drive is half a
  // feature, and the founder's own surface must not be one.
  const onKey = (ev: KeyboardEvent): void => {
    const step = 0.12;
    switch (ev.key) {
      case 'ArrowLeft':  orbit.yaw -= step; break;
      case 'ArrowRight': orbit.yaw += step; break;
      case 'ArrowUp':    orbit.pitch = Math.min(PITCH_LIMIT, orbit.pitch + step); break;
      case 'ArrowDown':  orbit.pitch = Math.max(-PITCH_LIMIT, orbit.pitch - step); break;
      case '+': case '=': orbit.zoom = Math.max(0.35, orbit.zoom * 0.89); break;
      case '-': case '_': orbit.zoom = Math.min(4, orbit.zoom * 1.12); break;
      case 'Home': Object.assign(orbit, DEFAULT_ORBIT); break;
      case 'Enter': case ' ':
        if (hovered) { ev.preventDefault(); opts.onPick?.(hovered); }
        return;
      default: return;
    }
    ev.preventDefault();
    draw();
  };

  const focusRing = (): void => { frame.style.boxShadow = `0 0 0 2px ${PURPLE}33`; frame.style.borderColor = PURPLE; };
  const blurRing = (): void => { frame.style.boxShadow = 'none'; frame.style.borderColor = LINE; };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('keydown', onKey);
  canvas.addEventListener('focus', focusRing);
  canvas.addEventListener('blur', blurRing);

  // ⛔ THE MOUNT REFCOUNT IS SHARED WITH THE ELEMENT SHOWROOM, AND JOINING IT IS
  // MANDATORY. `releasePreviewMount()` calls `forceContextLoss()` when the count
  // reaches zero. A graph that drew without registering would keep working until
  // the last showroom panel closed and then lose its context underneath it — an
  // intermittent blank viewport whose cause is in another file entirely.
  acquirePreviewMount();

  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => draw());
  ro?.observe(frame);

  draw();

  return {
    el: root,
    setSubject(next) {
      subject = next;
      draw();
    },
    resetView() {
      Object.assign(orbit, DEFAULT_ORBIT);
      draw();
    },
    redraw: draw,
    setLabels(on) {
      labels = on;
      draw();
    },
    toPngDataUrl() {
      // ⚠ Reads the VISIBLE 2-D canvas, which already holds the blit AND the label
      // pass — so the exported image is exactly what the reader is looking at,
      // labels included. Reading the WebGL buffer instead would export the picture
      // without its labels, which is a different (and less honest) artefact.
      try {
        return canvas.width > 0 ? canvas.toDataURL('image/png') : null;
      } catch {
        return null;
      }
    },
    dispose() {
      disposed = true;
      ro?.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKey);
      canvas.removeEventListener('focus', focusRing);
      canvas.removeEventListener('blur', blurRing);
      releasePreviewMount();
      root.remove();
    },
  };
}
