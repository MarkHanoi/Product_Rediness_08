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
 * repulsion pass with cooling, positions clamped to the viewport. ⚠ The
 * repulsion pass is no longer only O(n²) — see §PERF-GRAPH-BARNES-HUT (L-6620)
 * below; the seeding, cooling and clamp are still the ones lifted from there.
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
import { layoutND, SEPARATION_DEFAULT } from './forceLayoutND';
import { hopEmphasisFor } from './hopEmphasis';

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

/**
 * §GRAPH-NODE-LEGEND (L-12061) — the NODE GROUP namespace: "light every wall".
 *
 * ⛔ `encodeURIComponent`, and it is not decoration. `markSeries`'s own doc binds
 * the rule: *"A key may not contain whitespace, because the attribute is a token
 * list"*. A node group is an ELEMENT FAMILY, which is a census group key — model
 * data, not a vocabulary this file controls — so "curtain wall" is representable
 * and would split into two tokens, silently lighting whatever else happened to
 * carry `g:curtain` or `wall`. Encoding is total and injective, so two families
 * can never collapse onto one key either.
 */
export const FOCUS_GROUP = (group: string): string => `g:${encodeURIComponent(group)}`;

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
  /**
   * §GRAPH-SEPARATION (L-12060) — repulsion multiplier handed to `forceLayout`.
   *
   * ⚠ Default 1, and the 2-D card is expected to LEAVE IT THERE. `forceLayoutND`'s
   * `SEPARATION_DEFAULT` doc carries the measurement: in two dimensions the pass is
   * already saturated against the padding clamp, so raising this makes the picture
   * very slightly WORSE. The 2-D lever is `width`/`height`. It is exposed anyway
   * because the option is real and a caller that hides a knob it uses in 3-D would
   * be inviting the next reader to re-derive the measurement.
   */
  readonly separation?: number;
  /**
   * §GRAPH-SEPARATION — multiplier on the drawn MARKS (radius, label, strokes).
   *
   * ⭐ THIS IS WHAT MAKES A BIGGER viewBox AN ACTUAL IMPROVEMENT RATHER THAN A ZOOM.
   * The SVG is `width:100%` inside its box, so enlarging the viewBox alone rescales
   * everything by the same factor and the reader sees an identical picture. Passing
   * `W / 620` here holds the marks at their previous APPARENT size while the layout
   * gains room, so the extra space lands entirely in the gaps between nodes — which
   * is the founder's actual request.
   *
   * ⛔ It also carries the card's "Node size" slider, which in 2-D reached NOTHING
   * before this lane: `graphNodeScale()` was read for the 3-D subject only, so a
   * reader on the 2-D tab moved a control that did nothing and had no way to know.
   */
  readonly markScale?: number;

  /**
   * §GRAPH154 (L-12560..) — hop distance from the active model selection, per
   * node id. `null` (the default) means no selection is active on this card at
   * all, and every node draws exactly as it did before this option existed.
   *
   * A non-`null`, possibly-EMPTY map means a selection IS active: seed(s) carry
   * `0`, the first ring `1`, and so on (`focusNeighbourhood`'s own `hopOf`,
   * `packages/building-graph/src/hierarchy.ts:459`) — a node absent from the
   * map is reached by NOTHING drawn here and recedes (§CONTEXT-DATA-HONESTY: an
   * empty map and no selection are different facts and must not collapse to
   * the same drawing, which is why this is `hopOf`, never a boolean).
   *
   * ⛔ NOT a second BFS. The caller (`widgetRenderers.renderGraph`) already
   * computes this via `focusNeighbourhood()` for the 3-D subject; this option
   * hands the SAME map to the 2-D renderer so both tell the same story — see
   * `hopEmphasis.ts`'s header.
   */
  readonly hopOf?: ReadonlyMap<string, number> | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// §GRAPH-3D-ONE-LAYOUT (L-8430) — the Barnes-Hut tree MOVED, it was not COPIED
// ═════════════════════════════════════════════════════════════════════════════
//
// The founder asked for a 3-D graph. A 3-D force layout needs an OCTREE where
// this file used a QUADTREE, and the obvious implementation is a second tree
// beside the first — which is precisely the duplication this lane exists to
// avoid.
//
// ⭐ SO THE TREE WAS MADE DIMENSION-GENERIC AND MOVED to `forceLayoutND.ts`
// (`2^D` children, the quadrant computed over `D` axes). `forceLayout` below is
// now a THIN 2-D CALLER of that one implementation, and `forceLayout3D` beside
// it is the 3-D one. There is exactly one Barnes-Hut in this application.
//
// ⛔ AND THE 2-D OUTPUT DID NOT MOVE — MEASURED, NOT ASSERTED. The generic pass
// preserves the arithmetic expression for expression (axis-ordered squared
// distance, `size[0]` as the opening denominator, a branched repulsion constant
// rather than a `Math.pow`), and `graphLayout3d.spec.ts` asserts EXACT equality
// against a fixture captured from the PREVIOUS implementation before the change
// — 4 graph sizes straddling `EXACT_BELOW`, every coordinate compared with
// `toBe`, not `toBeCloseTo`. See that file's header for why a tolerance would
// have made the test worthless.
//
// The seeding, cooling schedule, step clamp, 0.7 damping and 44 px padding are
// still the ones lifted from `RoomGraphPanel._forceLayout`; they now live one
// module down.

export { EXACT_BELOW, THETA, SEPARATION_DEFAULT } from './forceLayoutND';
export { forceLayout3D } from './forceLayoutND';

/**
 * Deterministic force-directed layout, 2-D.
 *
 * ⚠ CORRECTED 2026-08-23 (§GRAPH-3D-ONE-LAYOUT, L-8430). This function used to
 * carry its own quadtree; it now delegates to the dimension-generic tree in
 * `forceLayoutND.ts`. **Its output is unchanged** — that is the subject of
 * `graphLayout3d.spec.ts`, which compares against a fixture captured before the
 * refactor rather than against the refactor's own behaviour.
 *
 * ⭐ The honesty half of the original doc still stands and must not be deleted
 * with the implementation: a truncated graph that ADMITS truncation is honest,
 * one that does not is a lie about the model's connectivity. A faster layout
 * raises the number at which the tool stops drawing; it does not abolish the
 * number, and `GraphProjection.truncated` still reports it.
 */
export function forceLayout(
  nodeIds: readonly string[],
  edgePairs: ReadonlyArray<readonly [string, string]>,
  W: number,
  H: number,
  iterations = 160,
  separation: number = SEPARATION_DEFAULT,
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  for (const [id, p] of layoutND(nodeIds, edgePairs, [W, H], iterations, separation)) {
    out.set(id, { x: p[0]!, y: p[1]! });
  }
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
  const pos = forceLayout(ids, pairs, W, H, 160, opts.separation ?? SEPARATION_DEFAULT);
  const mark = opts.markScale ?? 1;

  // §GRAPH154 — see `hopEmphasis.ts`. `null` (the default) means no selection
  // is active, and every mark below draws exactly as it did before this option
  // existed; a non-null map (possibly empty) means the ramp is live.
  const hopOf = opts.hopOf ?? null;
  const selectionActive = hopOf !== null;

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
    line.setAttribute('stroke-width', String(1.5 * mark));
    // §GRAPH154 — DORMANT, NOT GONE (seriesFocus.ts's own rule, applied here):
    // an edge whose BOTH endpoints the active neighbourhood reaches stays close
    // to its ordinary strength; one touching the unreached population recedes,
    // never disappears, so the truncation counts above stay true regardless of
    // whether a selection is active.
    const bothReached = selectionActive && (hopOf!.has(e.from) && hopOf!.has(e.to));
    line.setAttribute('stroke-opacity', selectionActive ? (bothReached ? '0.68' : '0.12') : '0.5');
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
    // ⚠ THREE namespaces on one mark: its own id, its FAMILY (so the node legend
    // can light "every wall"), and one per drawn neighbour. The family key is what
    // makes `renderNodeLegend` a query surface rather than a colour table.
    markSeries(
      g,
      FOCUS_NODE(n.id),
      FOCUS_GROUP(n.group),
      ...[...(neighbours.get(n.id) ?? [])].map(FOCUS_NODE),
    );
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `${n.label} — ${n.group}. Select in the model.`);
    g.style.cursor = opts.onPick ? 'pointer' : 'default';

    // §GRAPH154 (L-12560..) — SELECTED / CONNECTED / UNRELATED, on a channel
    // that is NOT the fill. `hopEmphasis.ts`'s header records the resolution:
    // the legend's "colour = element category" stays true in every state
    // because selection draws as a RING behind the fill (cyan for the seed,
    // violet ramped by hop for its neighbourhood — the SAME ramp
    // `DiagnosticMaterialManager`'s §HILITE140 ramp uses in the main 3-D scene,
    // reproduced here because that file is a THREE consumer and this one must
    // stay THREE-free) plus a fill-OPACITY change, never a fill-HUE one.
    const emphasis = hopEmphasisFor(hopOf?.get(n.id), selectionActive);
    const rBase = (6 + 8 * Math.sqrt((n.weight ?? 1) / maxW)) * mark;
    const r = rBase * emphasis.radiusScale;

    if (emphasis.ringColour) {
      // Drawn BEHIND the fill circle (appended first) so the fill's own thin
      // panel-bg separator stroke still reads on top, unchanged, for every
      // node — active or not. A stroked, unfilled circle, not a second solid
      // disc: a filled halo would compete with the fill for "what colour is
      // this node", which is exactly the channel conflict this ring exists to
      // avoid.
      const ring = document.createElementNS(SVG_NS, 'circle');
      ring.setAttribute('cx', String(p.x));
      ring.setAttribute('cy', String(p.y));
      ring.setAttribute('r', String(r + 3 * mark));
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', emphasis.ringColour);
      ring.setAttribute('stroke-width', String(1.6 * mark * emphasis.ringWidthScale));
      ring.setAttribute('stroke-opacity', String(emphasis.ringAlpha));
      ring.setAttribute('pointer-events', 'none');
      g.appendChild(ring);
    }

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', String(p.x));
    circle.setAttribute('cy', String(p.y));
    circle.setAttribute('r', String(r));
    circle.setAttribute('fill', seriesColour(opts.groupIndex.get(n.group) ?? 0, n.group));
    circle.setAttribute('fill-opacity', String(emphasis.fillOpacity));
    circle.setAttribute('stroke', 'var(--app-panel-bg)');
    circle.setAttribute('stroke-width', String(1.5 * mark));
    g.appendChild(circle);

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(p.x));
    text.setAttribute('y', String(p.y + r + 11 * mark));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', String(9 * mark));
    text.setAttribute('fill', 'var(--app-text-2)');
    // The label recedes WITH its node — an unrelated node's name competing at
    // full strength against a dimmed disc would read as more important than
    // the disc says it is.
    text.setAttribute('fill-opacity', String(emphasis.fillOpacity));
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

/**
 * §GRAPH-NODE-LEGEND (L-12061) — a legend row per NODE GROUP (element family),
 * coloured identically to the discs.
 *
 * ⭐ WHY THIS DID NOT EXIST AND HAD TO. The card's own footer has always claimed
 * *"colour = element family"*, and the nodes have always been filled from
 * `seriesColour(groupIndex)`. There was no legend, so the claim was unreadable:
 * the reader saw eight hues and had no table telling them which family each hue
 * was. A categorical encoding with no key is decoration.
 *
 * ⛔ TOTAL BY CONSTRUCTION, over the same `groupIndex` the discs are filled from.
 * It iterates the INDEX MAP, not the node array, so every colour that can appear
 * on the picture has a row — including a family whose nodes were all dimmed.
 * Building it from the drawn nodes would let a colour exist with no key entry,
 * which is the failure this function exists to close.
 *
 * ⚠ A DISC, WHERE THE EDGE LEGEND USES A BAR. The two legends sit one above the
 * other and both use the same eight-value rotation; the SHAPE is what says which
 * legend you are reading. Colour is never the only channel (SC 1.4.1) and here it
 * is not even the only channel between the two legends.
 *
 * ⚠ AMENDED §GRAPH154 (L-12560..) — `selectionActive` adds a SECOND, additive
 * line, never a rewrite of the first. "Node colour = element category" stays
 * true word-for-word whether or not a selection is active, because selection
 * draws on the RING channel (`hopEmphasis.ts`), not the fill — so the legend
 * does not need to start lying the moment the founder clicks a wall. What
 * changes is that a second sentence appears explaining the ring, exactly while
 * the ring is the thing on screen the reader is asking about.
 */
export function renderNodeLegend(
  host: HTMLElement,
  groupIndex: ReadonlyMap<string, number>,
  counts: ReadonlyMap<string, number>,
  focus?: SeriesFocus,
  selectionActive?: boolean,
): HTMLElement {
  const legend = document.createElement('div');
  legend.className = 'anl-nodelink-legend anl-nodelink-legend--nodes';
  const lead = document.createElement('span');
  lead.className = 'anl-nodelink-legend-lead';
  lead.textContent = 'Node colour = element category';
  legend.appendChild(lead);
  if (selectionActive) {
    // ⛔ ADDITIVE, NOT A REPLACEMENT OF THE LINE ABOVE — see the doc comment.
    const ringNote = document.createElement('span');
    ringNote.className = 'anl-nodelink-legend-lead anl-nodelink-legend-ring-note';
    ringNote.textContent = 'Ring: cyan = selected · violet = connected, fading with distance';
    legend.appendChild(ringNote);
  }
  for (const [group, index] of groupIndex) {
    const row = markSeries(document.createElement('span'), FOCUS_GROUP(group));
    row.className = 'anl-nodelink-legend-row';
    if (focus) {
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.title = `Light every ${group} and dim the rest`;
      const go = (): void => focus.toggle(FOCUS_GROUP(group));
      row.addEventListener('click', go);
      row.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); }
      });
    }
    const swatch = document.createElement('span');
    swatch.className = 'anl-nodelink-swatch anl-nodelink-swatch--node';
    swatch.style.background = seriesColour(index, group);
    const label = document.createElement('span');
    label.textContent = `${group} · ${counts.get(group) ?? 0}`;
    row.append(swatch, label);
    legend.appendChild(row);
  }
  host.appendChild(legend);
  return legend;
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
