/**
 * SequenceGraphView — the derived build sequence drawn as a RADIAL MIND MAP.
 *
 * Layer Affected:  UI — Data Workbench › Mediciones › 4D Time (L7)
 * File:            apps/editor/src/ui/dataworkbench/buckets/SequenceGraphView.ts
 * Engine:          @pryzm/core-app-model — `buildSequenceGraph()`
 * Contract:        C37 §5.7 · C66 §1.1 by analogy
 * ADR:             ADR-0355 (why a graph and not a Gantt; why here and not a tab)
 * Issue log:       L-6300..L-6330
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY RADIAL — THIS IS AN HONESTY DECISION WEARING A LAYOUT DECISION'S CLOTHES
 * ═════════════════════════════════════════════════════════════════════════════
 * The founder asked for "a mind map ... for activity execution in time" and
 * attached a Mural board: a centre, curved colour-coded edges, children radiating
 * out. The obvious implementation of a dependency DAG is a LEFT-TO-RIGHT layered
 * graph. ⛔ It is the wrong one here, and not by a little.
 *
 * A left-to-right graph of construction activities has an unlabelled horizontal
 * axis along which work visibly progresses. Every construction professional who
 * has ever opened a programme reads that axis as TIME — whatever the caption
 * says. This model HAS NO TIME (ADR-0351 §8 4D-3/4D-5: no durations, no dates,
 * no forward pass, no float, no critical path), so an axis that reads as time
 * would be a fabricated quantity introduced by LAYOUT rather than by arithmetic.
 * That is the same defect as a fabricated output rate, arriving through a door
 * nobody was watching.
 *
 * A radial layout HAS NO HORIZONTAL AXIS AT ALL. There is no left, no right and
 * no "further along". Distance from the centre is dependency DEPTH — how many
 * activities must finish first — and the ring labels say exactly that. So the
 * layout the founder asked for is also the only layout that cannot quietly grow
 * a time axis. That is a happy result, not a coincidence: a mind map is the
 * correct picture for a model that knows adjacency and does not know duration.
 *
 * ⛔ NODE RADIUS IS CONSTANT, AND THAT IS DELIBERATE.
 * Sizing nodes by measured quantity is the natural graph idiom and it is BANNED
 * here: the SUBSTRUCTURE activity measures nothing on purpose (a programme that
 * silently omits foundations reads as complete), and a quantity-sized node would
 * render the single most important honesty marker on this drawing as a dot of
 * radius zero. MEASURES NOTHING is encoded as a dashed red ring instead — a
 * channel that cannot collapse.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ WHAT IS SHARED WITH THE ANALYSIS SURFACE, AND WHAT IS NOT
 * ═════════════════════════════════════════════════════════════════════════════
 * `apps/editor/src/ui/analysis/nodeLinkSvg.ts` is the repo's ONE shared node-link
 * renderer (L-3256) and it was read in full before a line of this was written.
 * THREE of its four parts are REUSED here by direct import, not copied:
 *
 *   ✅ `SeriesFocus` + `markSeries` (`analysis/seriesFocus.ts`) — the founder's
 *      "highlight this and the rest be a bit dormant", one mechanism, one alpha
 *      constant. Its CSS (`.anl-focus-on [data-series]`) is concatenated into the
 *      global sheet by `AppTheme.ts:225`, so it reaches this panel unchanged.
 *   ✅ `seriesColour()` (`analysis/AnalysisTypes.ts`) — the CVD-simulated eight
 *      value categorical scale. ⛔ NO COLOUR IS MINTED IN THIS FILE.
 *   ✅ Its conventions: keyboard-reachable nodes, `<title>` tooltips, no rAF.
 *
 *   ⛔ `renderNodeLink()` ITSELF IS NOT REUSED, and this is a measured decision
 *      rather than a preference. It cannot draw this graph, for four independent
 *      reasons: (1) it calls `forceLayout()` UNCONDITIONALLY at :219 — there is
 *      no seam to inject positions, and a force layout would destroy the rank
 *      ordering that is the only real information this data has; (2) it draws
 *      `<line>`, i.e. straight edges, and the founder's reference is curved;
 *      (3) its edges are UNDIRECTED — a dependency that does not say which way it
 *      points is not a dependency; (4) it has no edge label, and the edge REASON
 *      is the single most valuable thing on this drawing.
 *
 * ⭐ THE SEAM THAT WOULD COLLAPSE THE TWO IS NAMED, AND IT IS SMALL (L-6320).
 * If `renderNodeLink` grew an optional `positions?: ReadonlyMap<string, {x,y}>`
 * that short-circuits its `forceLayout` call, plus an `edgeShape?: 'line'|'curve'`
 * and an `edgeLabel?: (e) => string`, this file's `drawGraph()` would become a
 * call into it and roughly 120 lines here would be deleted. That change belongs
 * to the owner of `analysis/` and is logged rather than made: lane SEQ27 does not
 * write into another lane's live files. ⚠ SEQ27 attempted to agree this seam
 * with the analysis lane first and could not — `SendMessage to "GRAPH26"` -> *"No
 * agent named 'GRAPH26' is reachable"* — so the seam is recorded here and in the
 * issue log instead of being negotiated. Do not treat this file as licence for a
 * third renderer.
 *
 * ⚠ THE NODE CAP DOES NOT BIND THIS SURFACE. `graphReadModel.ts:42` caps the
 * Analysis relationship card because an O(n²) force layout hairballs above a few
 * dozen nodes. THIS layout is a single-pass radial tidy tree — O(n) after a sort
 * — over ~37 nodes, so there is no cap here and none is inherited.
 *
 * ⚠ WEBGL / WEBGPU: NEITHER. This is SVG in the DOM. There is no canvas, no
 * THREE (P2), no `requestAnimationFrame` (P3) and no GPU path at all, so there is
 * nothing here to degrade on the founder's `webgl-only` device.
 */

import type {
  SequenceGraph,
  SequenceGraphNode,
} from '@pryzm/core-app-model';
import { seriesColour } from '../../analysis/AnalysisTypes';
import { markSeries, SeriesFocus } from '../../analysis/seriesFocus';
import { escapeHtml } from './DWHelpers';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The drawing surface. Square: a radial layout has no preferred direction. */
const W = 980;
const H = 980;
const CX = W / 2;
const CY = H / 2;
/** Ring 0 is the centre; ring 1 starts here. */
const R0 = 74;
const NODE_R = 7.5;

/**
 * Focus keys. Namespaced `sq:` so they can never collide with the Analysis
 * surface's `n:` / `e:` keys — `SeriesFocus` matches by token MEMBERSHIP, and two
 * graphs that happened to share a token would light each other's marks.
 */
const K_NODE = (id: string): string => `sq:n:${id.replace(/\s+/g, '_')}`;
const K_STAGE = (stage: string): string => `sq:s:${stage}`;

/** One laid-out node. ⛔ `x`/`y` are PIXELS on this drawing. They are not time. */
interface Placed {
  readonly node: SequenceGraphNode;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly radius: number;
}

/**
 * Radial tidy-tree layout.
 *
 * The graph is a DAG, not a tree, so angular placement uses a SPANNING TREE: each
 * node's "primary parent" is its DEEPEST predecessor (ties broken by lowest rank,
 * so the result is deterministic). Every edge is still DRAWN — the spanning tree
 * decides only where a node sits, never which dependencies exist. A node placed
 * near one parent while an edge curves away to another is the honest picture of a
 * node with two predecessors.
 */
export function layoutRadial(graph: SequenceGraph): Map<string, Placed> {
  const out = new Map<string, Placed>();
  if (graph.nodes.length === 0) return out;

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const preds = new Map<string, string[]>();
  for (const e of graph.edges) {
    const l = preds.get(e.to);
    if (l) l.push(e.from); else preds.set(e.to, [e.from]);
  }

  // Primary parent = deepest predecessor; ties → lowest rank. Deterministic.
  const primary = new Map<string, string>();
  for (const n of graph.nodes) {
    const ps = (preds.get(n.id) ?? [])
      .map((id) => byId.get(id))
      .filter((p): p is SequenceGraphNode => !!p);
    if (ps.length === 0) continue;
    ps.sort((a, b) => (b.depth - a.depth) || (a.rank - b.rank));
    primary.set(n.id, ps[0]!.id);
  }

  const kids = new Map<string, string[]>();
  for (const n of graph.nodes) {
    const p = primary.get(n.id);
    if (!p) continue;
    const l = kids.get(p);
    if (l) l.push(n.id); else kids.set(p, [n.id]);
  }
  // Children in build order, so the spiral reads in the order the list view does.
  for (const l of kids.values()) {
    l.sort((a, b) => (byId.get(a)!.rank - byId.get(b)!.rank) || a.localeCompare(b));
  }

  const roots = graph.nodes.filter((n) => !primary.has(n.id)).map((n) => n.id);

  // Leaf counts drive the angular slice each subtree gets, so a busy branch is
  // not crushed into the same arc as a single node.
  const leaves = new Map<string, number>();
  const countLeaves = (id: string, guard: Set<string>): number => {
    if (guard.has(id)) return 1;
    guard.add(id);
    const c = kids.get(id) ?? [];
    const n = c.length === 0 ? 1 : c.reduce((s, k) => s + countLeaves(k, guard), 0);
    leaves.set(id, n);
    return n;
  };
  for (const r of roots) countLeaves(r, new Set());

  const ringGap = Math.min(46, (Math.min(W, H) / 2 - R0 - 46) / Math.max(1, graph.maxDepth));

  const place = (id: string, a0: number, a1: number, guard: Set<string>): void => {
    if (guard.has(id)) return;
    guard.add(id);
    const n = byId.get(id)!;
    const angle = (a0 + a1) / 2;
    const radius = n.depth === 0 ? 0 : R0 + (n.depth - 1) * ringGap;
    out.set(id, {
      node: n,
      x: CX + radius * Math.cos(angle),
      y: CY + radius * Math.sin(angle),
      angle,
      radius,
    });
    const c = kids.get(id) ?? [];
    if (c.length === 0) return;
    const total = c.reduce((s, k) => s + (leaves.get(k) ?? 1), 0) || 1;
    let a = a0;
    for (const k of c) {
      const span = ((leaves.get(k) ?? 1) / total) * (a1 - a0);
      place(k, a, a + span, guard);
      a += span;
    }
  };

  const guard = new Set<string>();
  // Start at -90° so the first branch leaves the centre upward, as a mind map does.
  const start = -Math.PI / 2;
  const totalRootLeaves = roots.reduce((s, r) => s + (leaves.get(r) ?? 1), 0) || 1;
  let a = start;
  for (const r of roots) {
    const span = ((leaves.get(r) ?? 1) / totalRootLeaves) * Math.PI * 2;
    place(r, a, a + span, guard);
    a += span;
  }
  // Any node the spanning tree could not reach is still drawn — an undrawn node
  // is a silently missing activity, which is exactly what this surface refuses.
  let orphan = 0;
  for (const n of graph.nodes) {
    if (out.has(n.id)) continue;
    const angle = start + (orphan++ * 0.7);
    const radius = R0 + Math.max(0, n.depth - 1) * ringGap;
    out.set(n.id, { node: n, x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle), angle, radius });
  }
  return out;
}

/**
 * Colour per stage.
 *
 * ⚠ THE SCALE HAS EIGHT VALUES AND THERE ARE TEN BUILD STAGES.
 * `tokens.ts:465` is explicit: *"Do NOT extend this to --app-cat-9. Eight is where
 * the floor stops clearing 10. A ninth series is a '+N others' bucket, not a
 * colour."* That is a MEASURED CVD floor (global min ΔE00 11.13), not a taste
 * rule, so a ninth and tenth colour are not available to be minted.
 *
 * Stages are therefore coloured in build order from the eight, and any stage
 * beyond the eighth PRESENT one takes the named neutral — with the legend saying
 * so in words. Colour is never the only channel here anyway: every node carries
 * its stage name as text, and the ring label carries its depth.
 */
export function stageColours(graph: SequenceGraph): {
  colour: Map<string, string>;
  exhausted: string[];
} {
  const colour = new Map<string, string>();
  const exhausted: string[] = [];
  graph.stagesPresent.forEach((stage, i) => {
    if (i < 8) colour.set(stage, seriesColour(i, stage));
    else { colour.set(stage, seriesColour(0, 'unmeasured')); exhausted.push(stage); }
  });
  return { colour, exhausted };
}

/** A cubic Bézier between two placed nodes, bowed in polar space. */
function curvePath(a: Placed, b: Placed): string {
  const mid = (a.radius + b.radius) / 2;
  const c1x = CX + mid * Math.cos(a.angle);
  const c1y = CY + mid * Math.sin(a.angle);
  const c2x = CX + mid * Math.cos(b.angle);
  const c2y = CY + mid * Math.sin(b.angle);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

function svgEl<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, name);
}

/**
 * Draw the graph into `host`. Returns the `<svg>`.
 *
 * `onExplain` is called with the sentence to show in the explanation strip —
 * a dependency's REASON when an edge is picked, an activity's caveats when a node
 * is picked. The graph's job is to make the reasoning visible; the strip is where
 * it becomes readable prose.
 */
export function drawGraph(
  host: HTMLElement,
  graph: SequenceGraph,
  focus: SeriesFocus,
  onExplain: (html: string) => void,
): SVGSVGElement {
  const placed = layoutRadial(graph);
  const { colour } = stageColours(graph);

  const svg = svgEl('svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    `Construction dependency graph: ${graph.nodes.length} activities, ${graph.edges.length} dependencies, `
    + `${graph.maxDepth} levels of dependency depth. This diagram has no time axis: no activity has a duration or a date.`,
  );
  svg.style.width = '100%';
  svg.style.height = 'auto';
  svg.style.display = 'block';
  host.appendChild(svg);

  if (graph.nodes.length === 0) return svg;

  // ── Depth rings, LABELLED. ⭐ The label is what stops a reader importing a
  // meaning the drawing does not carry: it names the ring "N dependencies deep",
  // never a week, a date or a phase.
  const ringG = svgEl('g');
  const ringRadii = [...new Set([...placed.values()].map((p) => p.radius))]
    .filter((r) => r > 0)
    .sort((x, y) => x - y);
  for (const r of ringRadii) {
    const c = svgEl('circle');
    c.setAttribute('cx', String(CX));
    c.setAttribute('cy', String(CY));
    c.setAttribute('r', r.toFixed(2));
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke', 'var(--app-border)');
    c.setAttribute('stroke-width', '1');
    c.setAttribute('stroke-dasharray', '2 5');
    c.setAttribute('opacity', '0.55');
    ringG.appendChild(c);
  }
  svg.appendChild(ringG);

  // ── Edges, beneath the nodes.
  const edgeG = svgEl('g');
  edgeG.setAttribute('fill', 'none');
  for (const e of graph.edges) {
    const a = placed.get(e.from);
    const b = placed.get(e.to);
    if (!a || !b) continue;
    const path = svgEl('path');
    path.setAttribute('d', curvePath(a, b));
    path.setAttribute('stroke', colour.get(e.stage) ?? 'var(--app-border)');
    path.setAttribute('stroke-width', '1.4');
    path.setAttribute('stroke-opacity', '0.55');
    path.setAttribute('stroke-linecap', 'round');
    path.style.cursor = 'pointer';
    // Three keys, matching the Analysis renderer's convention: an edge lights
    // when either endpoint is picked, or when its stage is.
    markSeries(path, K_NODE(e.from), K_NODE(e.to), K_STAGE(e.stage));
    const t = svgEl('title');
    // ⭐ THE REASON, ON THE EDGE. This is the "follows N activities — why"
    // disclosure from the list view, promoted to the picture.
    t.textContent = `${a.node.label} (${a.node.sublabel})  →  ${b.node.label} (${b.node.sublabel})\n\nWHY: ${e.why}`;
    path.appendChild(t);
    path.addEventListener('click', (ev) => {
      ev.stopPropagation();
      focus.set(K_NODE(e.to));
      onExplain(
        `<strong>${escapeHtml(b.node.label)} — ${escapeHtml(b.node.sublabel)}</strong> follows `
        + `<strong>${escapeHtml(a.node.label)} — ${escapeHtml(a.node.sublabel)}</strong><br/>`
        + `<span style="color:var(--app-text-muted);">why: ${escapeHtml(e.why)}</span>`,
      );
    });
    edgeG.appendChild(path);
  }
  svg.appendChild(edgeG);

  // ── Nodes.
  const nodeG = svgEl('g');
  const neighbours = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    let s = neighbours.get(a);
    if (!s) { s = new Set(); neighbours.set(a, s); }
    s.add(b);
  };
  for (const e of graph.edges) { link(e.from, e.to); link(e.to, e.from); }

  for (const p of [...placed.values()].sort((a, b) => a.node.rank - b.node.rank)) {
    const n = p.node;
    const g = svgEl('g');
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute(
      'aria-label',
      `${n.label}, ${n.sublabel}. ${n.measuresNothing ? 'Measures nothing. ' : `${n.elementCount} element${n.elementCount === 1 ? '' : 's'}. `}`
      + `${n.depth} dependencies deep. No duration.`,
    );
    g.style.cursor = 'pointer';
    markSeries(g, K_NODE(n.id), K_STAGE(n.stage), ...[...(neighbours.get(n.id) ?? [])].map(K_NODE));

    const isRoot = n.depth === 0;
    const r = isRoot ? NODE_R * 1.8 : NODE_R;

    const c = svgEl('circle');
    c.setAttribute('cx', p.x.toFixed(2));
    c.setAttribute('cy', p.y.toFixed(2));
    c.setAttribute('r', String(r));
    c.setAttribute('fill', colour.get(n.stage) ?? 'var(--app-cat-unassigned)');
    // ⛔ MEASURES NOTHING is a DASHED RED RING, never a smaller node. See header.
    c.setAttribute('stroke', n.measuresNothing ? '#B3261E' : 'var(--app-panel-bg)');
    c.setAttribute('stroke-width', n.measuresNothing ? '2' : '1.5');
    if (n.measuresNothing) c.setAttribute('stroke-dasharray', '3 2');
    g.appendChild(c);

    // Label, pushed outward along the radius so it never sits on its own edge.
    const right = Math.cos(p.angle) >= 0;
    const lx = isRoot ? p.x : p.x + (right ? r + 5 : -(r + 5));
    const ly = isRoot ? p.y + r + 13 : p.y + 3;
    const text = svgEl('text');
    text.setAttribute('x', lx.toFixed(2));
    text.setAttribute('y', ly.toFixed(2));
    text.setAttribute('text-anchor', isRoot ? 'middle' : (right ? 'start' : 'end'));
    text.setAttribute('font-size', isRoot ? '11' : '9.5');
    text.setAttribute('font-weight', isRoot ? '800' : '700');
    text.setAttribute('fill', 'var(--app-text)');
    text.textContent = n.label;
    g.appendChild(text);

    const sub = svgEl('text');
    sub.setAttribute('x', lx.toFixed(2));
    sub.setAttribute('y', (ly + 9.5).toFixed(2));
    sub.setAttribute('text-anchor', isRoot ? 'middle' : (right ? 'start' : 'end'));
    sub.setAttribute('font-size', '8');
    sub.setAttribute('fill', 'var(--app-text-muted)');
    sub.textContent = n.measuresNothing ? 'MEASURES NOTHING' : n.sublabel;
    g.appendChild(sub);

    const t = svgEl('title');
    t.textContent =
      `${n.label} — ${n.sublabel}\n`
      + `build rank ${n.rank} · ${n.depth} dependencies deep\n`
      + (n.measuresNothing ? 'MEASURES NOTHING\n' : `${n.elementCount} element${n.elementCount === 1 ? '' : 's'}\n`)
      + (n.quantityLabel ? `builds ${n.quantityLabel}\n` : '')
      + `\nduration: none. ${n.durationNote}`;
    g.appendChild(t);

    const pick = (): void => {
      focus.toggle(K_NODE(n.id));
      onExplain(nodeExplanation(n, graph));
    };
    g.addEventListener('click', (ev) => { ev.stopPropagation(); pick(); });
    g.addEventListener('keydown', (ev) => {
      const k = (ev as KeyboardEvent).key;
      if (k === 'Enter' || k === ' ') { ev.preventDefault(); pick(); }
    });
    nodeG.appendChild(g);
  }
  svg.appendChild(nodeG);

  // Clicking the background clears the emphasis — dormant is never a trap.
  svg.addEventListener('click', () => { focus.set(null); onExplain(''); });

  return svg;
}

/** The explanation strip for one activity. Every refusal it carries is printed. */
function nodeExplanation(n: SequenceGraphNode, graph: SequenceGraph): string {
  const deps = graph.edges.filter((e) => e.to === n.id);
  const byIdLabel = (id: string): string => {
    const m = graph.nodes.find((x) => x.id === id);
    return m ? `${m.label} — ${m.sublabel}` : id;
  };
  return `
    <strong>${escapeHtml(n.label)} — ${escapeHtml(n.sublabel)}</strong>
    <span style="color:var(--app-text-muted);">· build rank ${n.rank} · ${n.depth} dependencies deep</span>
    ${n.measuresNothing
      ? `<div style="margin-top:4px;color:#B3261E;font-weight:700;">MEASURES NOTHING</div>`
      : (n.quantityLabel
        ? `<div style="margin-top:4px;">builds ${escapeHtml(n.quantityLabel)}</div>`
        : '')}
    ${n.note ? `<div style="margin-top:4px;color:#8A6100;">⚠ ${escapeHtml(n.note)}</div>` : ''}
    ${deps.length > 0
      ? `<div style="margin-top:5px;">follows ${deps.length} activit${deps.length === 1 ? 'y' : 'ies'}:</div>`
        + deps.map((d) =>
          `<div style="margin-top:2px;color:var(--app-text-muted);">· <strong>${escapeHtml(byIdLabel(d.from))}</strong> — ${escapeHtml(d.why)}</div>`).join('')
      : '<div style="margin-top:5px;color:var(--app-text-muted);">follows nothing — this is where the build starts.</div>'}
    <div style="margin-top:5px;color:#B3261E;">duration: none. ${escapeHtml(n.durationNote)}</div>`;
}

/**
 * The legend: one row per stage present, plus the two absence statements.
 * Clicking a row lights that whole trade and dims the rest.
 */
export function drawLegend(host: HTMLElement, graph: SequenceGraph, focus: SeriesFocus): void {
  const { colour, exhausted } = stageColours(graph);
  const counts = new Map<string, number>();
  for (const n of graph.nodes) counts.set(n.stage, (counts.get(n.stage) ?? 0) + 1);

  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px 12px;margin-top:8px;';
  for (const stage of graph.stagesPresent) {
    const label = graph.nodes.find((n) => n.stage === stage)?.label ?? stage;
    const row = markSeries(document.createElement('span'), K_STAGE(stage));
    row.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font-size:9.5px;color:var(--app-text);cursor:pointer;';
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.title = `Light every ${label} activity and dim the rest`;
    const sw = document.createElement('span');
    sw.style.cssText = `width:10px;height:10px;border-radius:3px;flex:0 0 auto;background:${colour.get(stage) ?? 'var(--app-cat-unassigned)'};border:1px solid var(--app-panel-bg);`;
    const tx = document.createElement('span');
    tx.textContent = `${label} · ${counts.get(stage) ?? 0}`;
    row.append(sw, tx);
    const go = (): void => { focus.toggle(K_STAGE(stage)); };
    row.addEventListener('click', (ev) => { ev.stopPropagation(); go(); });
    row.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); }
    });
    wrap.appendChild(row);
  }
  host.appendChild(wrap);

  if (exhausted.length > 0) {
    const note = document.createElement('div');
    note.style.cssText = 'margin-top:6px;font-size:9px;line-height:1.55;color:#8A6100;';
    note.textContent =
      `⚠ The categorical scale has eight values and ${graph.stagesPresent.length} build stages are present, so `
      + `${exhausted.length} of them (${exhausted.join(', ')}) share the neutral grey rather than being given a ninth `
      + 'colour. A ninth hue would drop the measured colour-blind separation below its floor. Read the stage name on the node, not the colour.';
    host.appendChild(note);
  }
}

/** Escape hatch for the panel: the refusals, rendered as the list they are. */
export function refusalsHtml(graph: SequenceGraph): string {
  return graph.refusals
    .map((r) => `<div style="margin-top:3px;">⛔ ${escapeHtml(r)}</div>`)
    .join('');
}

/** The unmeasured trades — named, never drawn. */
export function absentTradesHtml(graph: SequenceGraph): string {
  if (graph.absentTrades.length === 0) return '';
  return `
    <div style="margin-top:7px;font-size:9.5px;line-height:1.6;color:#8A6100;">
      ⚠ ${graph.absentTrades.length} trade${graph.absentTrades.length === 1 ? ' is' : 's are'} NOT MEASURED and therefore appear
      nowhere on this graph — not as a node, and not as a node of size zero:
      ${graph.absentTrades.map((t) => `<strong>${escapeHtml(t.family)}</strong>`).join(', ')}.
      An empty node would say "this work takes no doing"; an absence says "PRYZM does not measure this", which is the true statement.
    </div>`;
}

/** Exposed for the DOM suite. */
export const __testing = { K_NODE, K_STAGE, W, H, CX, CY };
