/**
 * nodeLinkSvg — ONE node-link renderer, brand-tokenised, deterministic.
 *
 * Layer Affected:  UI — Analysis surface (L7)
 * File:            apps/editor/src/ui/analysis/nodeLinkSvg.ts
 * CSS prefix:      anl-  (shares the Analysis sheet)
 * ADR:             ADR-0343 §D.3 · §D.5 (colour) · STR-14 §4
 * Issue log:       L-3256 (this file) · L-3257 (the four hand-rolls to collapse)
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THIS IS A SHARED MODULE AND NOT A FIFTH PRIVATE HAND-ROLL
 * ═════════════════════════════════════════════════════════════════════════════
 * Four panels in this app already hand-roll SVG data graphics, and the force
 * layout below is LIFTED FROM one of them — `ui/rooms/RoomGraphPanel.ts`
 * (`_forceLayout`, :122-205; ten `createElementNS` calls in `_render`). It was
 * read before a line of this was written, exactly as the lane brief required,
 * and it is a good implementation: deterministic seeding on a circle, no
 * `Math.random` in a render path, no `requestAnimationFrame` (P3), an O(n²)
 * repulsion pass with cooling, positions clamped to the viewport.
 *
 * What it is NOT is reusable: it is module-private, bound to one floating
 * panel's single `_svg` singleton, and hard-codes `#f7f8fc` and its own colours
 * rather than reading tokens. So the honest options were (a) copy it a fifth
 * time, or (b) publish the shared one. This is (b).
 *
 * ⚠ THIS FILE DOES NOT YET DISCHARGE THE DEBT — it is the target, not the
 * migration. L-3257 names the four callers that should collapse into it:
 * `ui/rooms/RoomGraphPanel.ts`, `ui/graph/BuildingGraphOverlay.ts`,
 * `ui/living-graph/LivingGraphOverlay.ts`, and the plan graph overlay. Migrating
 * three live overlays was not this lane's remit and doing it blind would be the
 * larger risk. Saying "shared module added" while four hand-rolls stand would be
 * the false half of the claim, so it is written here instead.
 *
 * ⛔ NO ANIMATION. STR-14 §4.1 wants the "living blob" — perpetual motion,
 * metaballs, ripple-on-change. That is a real and separate deliverable (GRAPH.3.b)
 * and it needs the frame bus, not a render loop bolted onto a dashboard card.
 * ADR-0343 §D.3 is explicit that no widget refreshes `on-frame` and that a
 * dashboard must never be why a frame is dropped. This renders once, statically.
 *
 * Colour comes from `seriesColour()` — the CVD-simulated eight-value categorical
 * scale in `tokens.ts:392-399`, whose first value is the PRYZM purple `#6600FF`.
 * No colour is minted here.
 */

import { seriesColour } from './AnalysisTypes';
import { markSeries, type SeriesFocus } from './seriesFocus';

/**
 * The focus-key namespaces. §ANALYSIS-SERIES-FOCUS (L-3610).
 *
 * A node id and an edge type are different KINDS of thing and could collide as
 * bare strings (nothing stops a UBG edge type being named like an element id).
 * Prefixing them makes "focus the `bounds` family" and "focus element X" two
 * keys that cannot be confused for one another.
 */
export const FOCUS_NODE = (id: string): string => `n:${id}`;
export const FOCUS_EDGE = (type: string): string => `e:${type}`;

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface NodeLinkNode {
  readonly id: string;
  /** Human label drawn beside the node. Never blank — pass the id if nothing better. */
  readonly label: string;
  /** Category key; drives colour via `seriesColour`. */
  readonly group: string;
  /** Relative importance (degree, area…). Drives radius. */
  readonly weight?: number;
}

export interface NodeLinkEdge {
  readonly from: string;
  readonly to: string;
  /** Typed relation — rendered as the edge's colour + the legend row. */
  readonly type: string;
}

export interface NodeLinkOptions {
  readonly width: number;
  readonly height: number;
  /** Colour index per edge type, so the legend and the lines agree. */
  readonly edgeTypeIndex: ReadonlyMap<string, number>;
  /** Colour index per node group. */
  readonly groupIndex: ReadonlyMap<string, number>;
  /** Called with the element id when a node is activated (click / Enter). */
  readonly onPick?: (id: string) => void;
  /**
   * The card's focus controller. When present, activating a node ALSO lights it,
   * its incident edges and its neighbours, and dims the rest — it never removes
   * anything, so the truncation notice and the counts above stay true.
   */
  readonly focus?: SeriesFocus;
}

interface Pos { id: string; x: number; y: number; vx: number; vy: number }

/**
 * Deterministic force-directed layout. Adapted from `RoomGraphPanel._forceLayout`
 * — same seeding, same cooling schedule, same clamp.
 *
 * ⚠ O(n²) per iteration × 160 iterations. That is fine for the tens of nodes a
 * card shows and is NOT fine for a whole building, which is why the caller caps
 * the node count and SAYS SO on the card rather than rendering a hairball. A
 * truncated graph that admits truncation is honest; one that does not is a lie
 * about the model's connectivity.
 */
export function forceLayout(
  nodeIds: readonly string[],
  edgePairs: ReadonlyArray<readonly [string, string]>,
  W: number,
  H: number,
  iterations = 160,
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (nodeIds.length === 0) return out;

  const padding = 44;
  const positions = new Map<string, Pos>();

  // Deterministic seed on a circle — never Math.random in a render path, or the
  // same model draws differently on every open and nobody can compare two runs.
  nodeIds.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / nodeIds.length;
    positions.set(id, {
      id,
      x: W / 2 + (W / 2 - padding) * 0.7 * Math.cos(angle),
      y: H / 2 + (H / 2 - padding) * 0.7 * Math.sin(angle),
      vx: 0,
      vy: 0,
    });
  });

  const repulsion = (W * H) / Math.max(nodeIds.length, 1);
  const attraction = 0.05;

  for (let iter = 0; iter < iterations; iter++) {
    const cooling = 1 - iter / iterations;

    for (let i = 0; i < nodeIds.length; i++) {
      const u = positions.get(nodeIds[i]!)!;
      for (let j = i + 1; j < nodeIds.length; j++) {
        const v = positions.get(nodeIds[j]!)!;
        const dx = u.x - v.x;
        const dy = u.y - v.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = repulsion / (dist * dist);
        u.vx += (dx / dist) * force;
        u.vy += (dy / dist) * force;
        v.vx -= (dx / dist) * force;
        v.vy -= (dy / dist) * force;
      }
    }

    for (const [a, b] of edgePairs) {
      const u = positions.get(a);
      const v = positions.get(b);
      if (!u || !v) continue;
      const dx = v.x - u.x;
      const dy = v.y - u.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = dist * attraction;
      u.vx += (dx / dist) * force;
      u.vy += (dy / dist) * force;
      v.vx -= (dx / dist) * force;
      v.vy -= (dy / dist) * force;
    }

    for (const node of positions.values()) {
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      const maxStep = 15 * cooling + 2;
      if (speed > maxStep) {
        node.vx = (node.vx / speed) * maxStep;
        node.vy = (node.vy / speed) * maxStep;
      }
      node.x = Math.max(padding, Math.min(W - padding, node.x + node.vx));
      node.y = Math.max(padding, Math.min(H - padding, node.y + node.vy));
      node.vx *= 0.7;
      node.vy *= 0.7;
    }
  }

  for (const [id, p] of positions) out.set(id, { x: p.x, y: p.y });
  return out;
}

/**
 * Draw one node-link diagram into `host`. Returns the `<svg>` element.
 *
 * Every node is keyboard-reachable and activates the same `onPick` a click does
 * — ADR-0343 §D.3 makes click-through to selection the join between a widget and
 * the model, and a chart only a mouse can operate is half a widget.
 */
export function renderNodeLink(
  host: HTMLElement,
  nodes: readonly NodeLinkNode[],
  edges: readonly NodeLinkEdge[],
  opts: NodeLinkOptions,
): SVGSVGElement {
  const { width: W, height: H } = opts;

  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    `Relationship graph: ${nodes.length} elements, ${edges.length} typed relationships.`,
  );
  svg.classList.add('anl-nodelink');
  host.appendChild(svg);

  if (nodes.length === 0) return svg;

  const ids = nodes.map((n) => n.id);
  const present = new Set(ids);
  const pairs = edges
    .filter((e) => present.has(e.from) && present.has(e.to))
    .map((e) => [e.from, e.to] as const);
  const pos = forceLayout(ids, pairs, W, H);

  // Adjacency over the DRAWN edges only — see the note on the node keys below.
  const neighbours = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    let set = neighbours.get(a);
    if (!set) { set = new Set<string>(); neighbours.set(a, set); }
    set.add(b);
  };
  for (const [a, b] of pairs) { link(a, b); link(b, a); }

  // ── Edges, under the nodes ────────────────────────────────────────────────
  const edgeG = document.createElementNS(SVG_NS, 'g');
  edgeG.setAttribute('stroke-linecap', 'round');
  for (const e of edges) {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) continue;
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(a.x));
    line.setAttribute('y1', String(a.y));
    line.setAttribute('x2', String(b.x));
    line.setAttribute('y2', String(b.y));
    line.setAttribute('stroke', seriesColour(opts.edgeTypeIndex.get(e.type) ?? 0, e.type));
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('stroke-opacity', '0.5');
    // Three keys: this edge lights when EITHER endpoint is picked, or when its
    // relation family is. That is what makes "click a node" answer "what does
    // this connect to" rather than "which dot is this".
    markSeries(line, FOCUS_NODE(e.from), FOCUS_NODE(e.to), FOCUS_EDGE(e.type));
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = `${e.from} —[${e.type}]→ ${e.to}`;
    line.appendChild(title);
    edgeG.appendChild(line);
  }
  svg.appendChild(edgeG);

  // ── Nodes ─────────────────────────────────────────────────────────────────
  const maxW = Math.max(1, ...nodes.map((n) => n.weight ?? 1));
  const nodeG = document.createElementNS(SVG_NS, 'g');
  for (const n of nodes) {
    const p = pos.get(n.id);
    if (!p) continue;

    const g = document.createElementNS(SVG_NS, 'g');
    // Its own key PLUS one per neighbour, so picking a neighbour lights this
    // node too. The set is built from the drawn `edges`, never from the whole
    // graph: a node dimmed here is dimmed because nothing DRAWN reaches it.
    markSeries(g, FOCUS_NODE(n.id), ...[...(neighbours.get(n.id) ?? [])].map(FOCUS_NODE));
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `${n.label} — ${n.group}. Select in the model.`);
    g.style.cursor = opts.onPick ? 'pointer' : 'default';

    const r = 6 + 8 * Math.sqrt((n.weight ?? 1) / maxW);
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', String(p.x));
    circle.setAttribute('cy', String(p.y));
    circle.setAttribute('r', String(r));
    circle.setAttribute('fill', seriesColour(opts.groupIndex.get(n.group) ?? 0, n.group));
    circle.setAttribute('stroke', 'var(--app-panel-bg)');
    circle.setAttribute('stroke-width', '1.5');
    g.appendChild(circle);

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(p.x));
    text.setAttribute('y', String(p.y + r + 11));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '9');
    text.setAttribute('fill', 'var(--app-text-2)');
    text.textContent = n.label.length > 18 ? `${n.label.slice(0, 17)}…` : n.label;
    g.appendChild(text);

    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = `${n.label} (${n.group}) — ${n.id}`;
    g.appendChild(title);

    if (opts.onPick || opts.focus) {
      const pick = (): void => {
        // Emphasis and selection are two answers and both happen — the founder's
        // sentence has two halves ("highlight this" AND the model selection).
        opts.focus?.toggle(FOCUS_NODE(n.id));
        opts.onPick?.(n.id);
      };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', (ev) => {
        const k = (ev as KeyboardEvent).key;
        if (k === 'Enter' || k === ' ') {
          ev.preventDefault();
          pick();
        }
      });
    }
    nodeG.appendChild(g);
  }
  svg.appendChild(nodeG);

  return svg;
}

/** A legend row per edge type, coloured identically to the lines. */
export function renderEdgeLegend(
  host: HTMLElement,
  edgeTypeIndex: ReadonlyMap<string, number>,
  counts: ReadonlyMap<string, number>,
  focus?: SeriesFocus,
): void {
  const legend = document.createElement('div');
  legend.className = 'anl-nodelink-legend';
  for (const [type, index] of edgeTypeIndex) {
    const row = markSeries(document.createElement('span'), FOCUS_EDGE(type));
    row.className = 'anl-nodelink-legend-row';
    if (focus) {
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.title = `Light every ${type} relation and dim the rest`;
      const go = (): void => focus.toggle(FOCUS_EDGE(type));
      row.addEventListener('click', go);
      row.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); }
      });
    }
    const swatch = document.createElement('span');
    swatch.className = 'anl-nodelink-swatch';
    swatch.style.background = seriesColour(index, type);
    const label = document.createElement('span');
    label.textContent = `${type} · ${counts.get(type) ?? 0}`;
    row.append(swatch, label);
    legend.appendChild(row);
  }
  host.appendChild(legend);
}
