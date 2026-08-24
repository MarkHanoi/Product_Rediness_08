/**
 * graphViewState — the relationship card's controls, its 3-D subject, and its
 * exports. Everything here is testable without a DOM tree.
 *
 * Layer Affected:  UI — Analysis surface (L7)
 * File:            apps/editor/src/ui/analysis/graphViewState.ts
 * ADR:             ADR-0364 · ADR-0343 §D.3 · ADR-0358 (a facet is a question)
 * Contracts:       C66 §1.1 (no capacity claim without a bench)
 * Issue log:       L-8450 … L-8462
 *
 * ⚠ MODULE STATE, deliberately shared rather than per-card — the same choice
 * `graphReadModel._levelFilter` and `selectionFacets._facets` make, for the same
 * reason: the graph, the coverage ledger and the relations table are read
 * TOGETHER, and a view that moved only one of them would put three disagreeing
 * universes on one tab.
 *
 * ⚠ NOT PERSISTED. A view restored from a previous session would reopen the tab
 * showing a subset of the model with nothing on screen explaining why — the
 * invisible-filter defect, which this surface has already been bitten by twice.
 *
 * L7 file. No THREE (P2), no rAF (P3), no `(window as any)` (P4), no store
 * writes (P6).
 */

import { projectScopeRegistry, registerProjectScopeProbe } from '@pryzm/core-app-model';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

import {
  HIERARCHY_VIEWS,
  type HierarchyProjection,
  type HierarchyView,
  type NeighbourhoodFocus,
} from '@pryzm/building-graph';

import { resolveActiveProjectId } from '../../engine/project/activeProjectId';
import { forceLayout3D } from './forceLayoutND';
import { normaliseToCube, type GraphSubject, type GraphNodeMark, type GraphLinkMark } from '../element-preview/GraphPreviewSubject';

/** Fired whenever any control below changes. `AnalysisSurface` re-renders the card. */
export const GRAPH_VIEW_EVENT = 'anl-graph-view-changed';

/** 2-D SVG (the existing card) or the 3-D WebGL viewport. */
export type GraphMode = '2d' | '3d';

let _view: HierarchyView = 'topology';
let _mode: GraphMode = '3d';
let _labels = true;
let _nodeScale = 1;
let _focusDepth = 1;

export function graphView(): HierarchyView { return _view; }
export function graphMode(): GraphMode { return _mode; }
export function graphLabels(): boolean { return _labels; }
export function graphNodeScale(): number { return _nodeScale; }
export function graphFocusDepth(): number { return _focusDepth; }

function announce(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(GRAPH_VIEW_EVENT));
}

export function setGraphView(v: HierarchyView): void {
  if (_view === v) return;
  _view = v;
  announce();
}

export function setGraphMode(m: GraphMode): void {
  if (_mode === m) return;
  _mode = m;
  announce();
}

export function setGraphLabels(on: boolean): void {
  if (_labels === on) return;
  _labels = on;
  announce();
}

/**
 * Node-size multiplier, clamped to 0.4 … 2.5.
 *
 * ⛔ CLAMPED, not free. Below 0.4 the discs stop being clickable and the picture
 * reads as interactive while being unusable; above 2.5 a 320-node graph is a
 * single blob and the reader would believe they were seeing connectivity that is
 * merely overlap.
 */
export function setGraphNodeScale(v: number): void {
  const next = Math.max(0.4, Math.min(2.5, v));
  if (_nodeScale === next) return;
  _nodeScale = next;
  announce();
}

/** Focus radius in hops, clamped to the same 1..4 `focusNeighbourhood` enforces. */
export function setGraphFocusDepth(v: number): void {
  const next = Math.max(1, Math.min(4, Math.round(v)));
  if (_focusDepth === next) return;
  _focusDepth = next;
  announce();
}

/**
 * ⛔ Reset the card's CONTROLS to their opening state. Used by "Reset view", and
 * reached on a project switch through `clearAnalysisGraphScope()` below.
 *
 * ⚠ CORRECTED 2026-08-24 (L-10480). This doc read "Used by 'Reset view' and by a
 * project switch". The first half was true; **the second half was false, and had
 * been since the card shipped.** Measured: the only production caller was
 * `widgetRenderers.ts:1184` (the Reset-view button), and `grep -rn 'pryzm-project'
 * apps/editor/src/ui/analysis/` returned NOTHING — the entire Analysis surface had
 * zero project-lifecycle wiring. A comment asserting a lifecycle that no caller
 * implements is the L-694a shape in prose: it is exactly why a reviewer would not
 * go looking for the owner that did not exist. The wiring now exists (see the
 * §C13-ANALYSIS-GRAPH-OWNER block at the foot of this file), which is what makes
 * this sentence true rather than aspirational.
 *
 * ⚠ It does NOT announce. Every caller re-renders immediately afterwards, and an
 * event here would make a project switch redraw a card that is about to be
 * rebuilt anyway.
 *
 * ⛔ It does NOT clear the LAYOUT CACHE or the ORBIT — those are project-scoped
 * resources with a declared owner, and `clearAnalysisGraphScope()` is what clears
 * them. "Reset view" deliberately keeps the layout: re-solving a 320-node graph
 * because the reader pressed a button that says *view* would be the cost defect
 * ADR-0343 §D.3 forbids.
 */
export function resetGraphViewState(): void {
  _view = 'topology';
  _mode = '3d';
  _labels = true;
  _nodeScale = 1;
  _focusDepth = 1;
}

export { HIERARCHY_VIEWS };

// -----------------------------------------------------------------------------
// The shared orbit (L-8451)
// -----------------------------------------------------------------------------
//
// ⛔ THE CAMERA MUST SURVIVE A RE-RENDER, AND THAT IS A CORRECTNESS PROPERTY, NOT
// A POLISH ONE. The relationship card is rebuilt whole whenever the selection
// changes — which is exactly what makes "click a wall in PRYZM, see its
// relationships" work. A viewport that owned its own orbit would therefore snap
// the camera back to the default on every click, throwing away the orientation
// the reader had just chosen in order to look at the thing they clicked.
const _orbit = { yaw: -0.62, pitch: 0.22, zoom: 1 };

/** The live orbit object. Mutated in place by the viewport; never replaced. */
export function graphOrbit(): { yaw: number; pitch: number; zoom: number } {
  return _orbit;
}

// -----------------------------------------------------------------------------
// The layout cache (L-8452)
// -----------------------------------------------------------------------------
//
// ⭐ A SELECTION MUST NOT RE-LAY-OUT THE GRAPH, FOR TWO SEPARATE REASONS AND THE
// SECOND ONE IS THE IMPORTANT ONE.
//
//   1. COST. A 320-node solve is 160 iterations of Barnes-Hut. Paying it on every
//      click would make a dashboard the reason a frame is dropped, which
//      ADR-0343 §D.3 forbids outright.
//   2. LEGIBILITY, AND THIS IS THE REAL ARGUMENT. If the picture rearranged every
//      time the reader picked a node, they could never build a mental map of
//      their own building — the thing they clicked would be somewhere new each
//      time. A stable layout is what makes "this cluster is the west wing" a
//      thought a person can have.
//
// The key covers everything the GEOMETRY depends on and deliberately nothing the
// EMPHASIS depends on: change the view or the node set and the layout is resolved;
// change the selection and it is not.
let _layoutKey: string | null = null;
let _layoutPos: Map<string, readonly [number, number, number]> | null = null;

/**
 * §C13-ANALYSIS-GRAPH-OWNER (L-10480) — WHICH PROJECT THE CACHED LAYOUT BELONGS TO.
 *
 * ⭐ THE STAMP IS ON THE RESOURCE, NOT INFERRED FROM IT. ADR-0298's open question —
 * "should the declaration also carry WHAT each owner must reset?" — was answered by
 * L-694b: a probe that models FIELDS answers honestly about its own model and falsely
 * about the world. `_layoutKey` cannot be that stamp. It is
 * `view|nodeCount|edgeCount|ids.join(',')`, so it identifies a GRAPH SHAPE, not a
 * project: two projects whose element ids collide (a template duplicated, a snapshot
 * restored under new covers, any id scheme that is not globally unique) would produce
 * the SAME key and Project A's node positions would be drawn under Project B's ids
 * with no cache miss to stop it. Stamping the owner explicitly makes that
 * unrepresentable rather than merely unlikely.
 */
let _layoutProjectId: string | null = null;

/**
 * Resolve the project the layout is being computed for, through the ONE canonical
 * resolver rather than a second, quietly-divergent copy.
 *
 * Never throws: a stamp failure must not break a dashboard render. A null stamp is
 * reported HONESTLY by the probe below — §CONTEXT-DATA-HONESTY, "I hold nothing" and
 * "I hold something I cannot attribute" must never be the same value.
 */
function activeProjectId(): string | null {
  try {
    const rt = (typeof window !== 'undefined' ? window.runtime : undefined) as
      PryzmRuntime | undefined;
    return rt ? resolveActiveProjectId(rt) : null;
  } catch {
    return null;
  }
}

/** Test seam — drop the cached layout. */
export function _resetGraphLayoutCacheForTest(): void {
  _layoutKey = null;
  _layoutPos = null;
  _layoutProjectId = null;
}

// ═════════════════════════════════════════════════════════════════════════════
// The 3-D subject
// ═════════════════════════════════════════════════════════════════════════════

export interface SubjectInputs {
  readonly projection: HierarchyProjection;
  /** Node degree, for the radius. */
  readonly degrees: ReadonlyMap<string, number>;
  /** Resolved CSS colour per node id. Caller reads the brand tokens; none is minted here. */
  readonly nodeColour: (id: string) => string;
  /** Resolved CSS colour per edge family. Same scale as the legend and the 2-D card. */
  readonly edgeColour: (type: string) => string;
  /** The active emphasis, or `null` for "everything leads". */
  readonly focus: NeighbourhoodFocus | null;
  readonly scale: number;
  /** Short line under the canvas. */
  readonly caption: string;
}

/**
 * The alpha a node or relation drops to when something ELSE is focused.
 *
 * ⚠ CHOSEN, NOT MEASURED — and it is deliberately higher than the 2-D card's
 * `DORMANT_ALPHA` (0.22). In 3-D a dormant mark is also competing with depth
 * cueing and perspective, so the same alpha reads as "gone" rather than "quiet",
 * and DORMANT-NOT-GONE is the rule the whole emphasis model rests on.
 */
export const DORMANT_3D = 0.3;

/**
 * Build the 3-D subject: run the shared Barnes-Hut in three dimensions, normalise
 * into the centred cube, and attach colour and emphasis.
 *
 * ⭐ THE LAYOUT IS THE SAME ONE THE 2-D CARD USES. `forceLayout3D` is a caller of
 * `layoutND`, which is a caller of the very tree `nodeLinkSvg` uses at D=2. Two
 * layouts would let the 2-D and 3-D tabs of one card place the same building
 * differently, and the reader would have no way to know which was the model.
 *
 * ⚠ RADIUS IS sqrt(degree), not degree. Area, not length, should carry the
 * quantity — a linear radius makes a degree-16 node look 16 times as important as
 * a degree-1 node when it is drawn 256 times the area. The 2-D card already uses
 * the same square root; this keeps the two pictures comparable.
 */
export function buildGraphSubject(input: SubjectInputs): GraphSubject {
  const { projection, degrees, nodeColour, edgeColour, focus, scale, caption } = input;

  const ids = projection.nodes.map((n) => n.id);
  const pairs = projection.edges.map((e) => [e.from, e.to] as const);

  // The cache key names the GEOMETRY's inputs only. `ids.join` rather than a
  // count: two different node sets of the same size are different graphs, and a
  // count-keyed cache would draw one building's layout under another's ids.
  const key = `${projection.view}|${ids.length}|${pairs.length}|${ids.join(',')}`;
  if (_layoutKey !== key || _layoutPos === null) {
    _layoutKey = key;
    _layoutPos = normaliseToCube(forceLayout3D(ids, pairs, 600, 600, 600));
    // §C13-ANALYSIS-GRAPH-OWNER — stamp the owner in the same statement group that
    // mints the resource, so the two can never drift apart.
    _layoutProjectId = activeProjectId();
  }
  const pos = _layoutPos;

  const maxDeg = Math.max(1, ...ids.map((id) => degrees.get(id) ?? 1));
  const lit = focus?.nodeIds ?? null;

  const nodes: GraphNodeMark[] = [];
  for (const n of projection.nodes) {
    const p = pos.get(n.id);
    if (!p) continue;
    const deg = degrees.get(n.id) ?? 1;
    const r = (0.028 + 0.055 * Math.sqrt(deg / maxDeg)) * scale;
    nodes.push({
      id: n.id,
      p,
      r,
      colour: nodeColour(n.id),
      alpha: lit === null || lit.has(n.id) ? 1 : DORMANT_3D,
    });
  }

  const links: GraphLinkMark[] = [];
  for (const e of projection.edges) {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) continue;
    const on = lit === null || (lit.has(e.from) && lit.has(e.to));
    links.push({ a, b, colour: edgeColour(e.type), alpha: on ? 0.85 : DORMANT_3D });
  }

  return {
    // ⚠ The `graph:` prefix is load-bearing: this key shares one slot in the
    // renderer with the element showroom's subject keys, and a collision would
    // draw one subject under the other's identity.
    key:
      `graph:${projection.view}:${nodes.length}:${links.length}:${scale.toFixed(2)}:` +
      `${focus ? [...focus.nodeIds].length : 'all'}:${focus?.depth ?? 0}`,
    nodes,
    links,
    caption,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Export network data
// ═════════════════════════════════════════════════════════════════════════════

export interface NetworkExportContext {
  /** The storey scope sentence, verbatim from `scopeSentence()`. */
  readonly scope: string;
  /** The liveness sentence, verbatim from `livenessSentence()`. */
  readonly liveness: string;
  /** True when the drawn graph is a subset of the projected one. */
  readonly truncated: boolean;
  /** Nodes before the cap. */
  readonly totalNodes: number;
  /** Edges before the cap. */
  readonly totalEdges: number;
}

/**
 * Serialise exactly what is on the card, as JSON.
 *
 * ⛔ THE CAVEATS TRAVEL WITH THE DATA, AND THAT IS THE WHOLE POINT OF THIS
 * FUNCTION. An exported network that carried only nodes and edges would be a
 * TRUNCATED, STOREY-SCOPED, POSSIBLY-STALE subset of the building presented as
 * "the network" — and, unlike the card, a JSON file has no strip above it saying
 * so. So the envelope carries the scope sentence, the liveness sentence, the cap
 * state, the pre-cap totals, the view's own basis and its empty state if it had
 * one. A reader who opens this file in six months can still tell what it is.
 *
 * ⚠ `generatedAt` is an ISO timestamp, not a version. This file is a photograph,
 * not an artefact the product can read back — the UBG is a projection and is
 * deliberately NOT persisted (`types.ts` §GR-17), so re-importing this would
 * create exactly the stale-snapshot hazard that decision avoids.
 */
export function serialiseNetwork(
  projection: HierarchyProjection,
  ctx: NetworkExportContext,
): string {
  return JSON.stringify(
    {
      format: 'pryzm.ubg.network',
      version: 1,
      generatedAt: new Date().toISOString(),
      view: {
        id: projection.view,
        label: projection.def.label,
        edgeFamilies: projection.def.families,
        basis: projection.def.basis,
        empty: projection.empty,
      },
      completeness: {
        scope: ctx.scope,
        liveness: ctx.liveness,
        truncated: ctx.truncated,
        drawnNodes: projection.nodes.length,
        drawnEdges: projection.edges.length,
        projectedNodes: ctx.totalNodes,
        projectedEdges: ctx.totalEdges,
        unresolvedFamilyCount: projection.unresolvedFamilyCount,
        note:
          'This is a PROJECTION of the Unified Building Graph, not a census: a node exists here only ' +
          'where an adapter projected a relationship touching it. Counts in this file are exact for ' +
          'the drawn subset described above and are NOT a count of the model.',
      },
      categories: projection.buckets.map((b) => ({
        discipline: b.discipline,
        label: b.label,
        basis: b.basis,
        count: b.count,
        families: b.families.map((f) => ({
          family: f.family,
          count: f.count,
          ifcClass: f.ifcClass,
        })),
      })),
      nodes: projection.nodes.map((n) => ({ id: n.id, kind: n.kind, props: n.props ?? {} })),
      edges: projection.edges.map((e) => ({
        from: e.from,
        to: e.to,
        type: e.type,
        // ⚠ Carried per edge, because a `bounds` edge's direction is an artefact
        // of adapter iteration order, not a containment claim (C78 §4).
        directed: !projection.undirected.has(e.type),
        ...(e.evidence ? { evidence: e.evidence } : {}),
      })),
    },
    null,
    2,
  );
}

/**
 * Hand the reader a file. ONE implementation, used by both exports.
 *
 * ⚠ The object URL is revoked on the next macrotask rather than immediately:
 * some browsers have not started the download when `click()` returns, and
 * revoking synchronously cancels it. Revoking eventually is what stops the blob
 * being pinned for the life of the tab.
 */
export function downloadFile(filename: string, mime: string, data: string | Blob): void {
  const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Turn a `data:` URL from a canvas into a Blob, so the PNG path uses `downloadFile` too. */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  const meta = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mime = /:(.*?);/.exec(meta)?.[1] ?? 'image/png';
  if (!meta.includes(';base64')) return new Blob([decodeURIComponent(body)], { type: mime });
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ═════════════════════════════════════════════════════════════════════════════
// §C13-ANALYSIS-GRAPH-OWNER (L-10480) — the declared C13 owner for this surface
// ═════════════════════════════════════════════════════════════════════════════
//
// Contract: C13 §3.10 (every switch-reset surface has exactly ONE named owner;
//           the audit enumerates OWNERS, not symptoms) · ADR-0298 §1/§2.
//
// ⭐ WHY THIS BLOCK EXISTS — MEASURED, NOT SUSPECTED.
//
// `tools/ga-gate/check-declared-project-scopes.ts` flagged this file as holding
// module-level project-scoped state with NO declared owner, and the flag was a TRUE
// POSITIVE, not the heuristic word-match that covers most of the debt list. The
// Analysis surface had ZERO project-lifecycle wiring of any kind — measured, not
// asserted: `grep -rn 'pryzm-project' apps/editor/src/ui/analysis/` returned nothing
// at all. So on a project switch WITH THE ANALYSIS WORKSPACE OPEN:
//
//   • `_layoutPos` still held Project A's node positions, keyed by Project A's
//     element ids, and
//   • `_orbit` still held the camera pose the reader had chosen over Project A.
//
// `disposeGraphViewport()` — the one teardown this surface did have — is called ONLY
// from `AnalysisSurface._hide()`, i.e. when the reader LEAVES the workspace. Switching
// project while the workspace is visible never hides it, so nothing ran.
//
// ⚠ THE LAYOUT CACHE IS THE CONFIDENTIALITY SURFACE, not the orbit. It is a map from
// ELEMENT ID to a position, so it is a partial disclosure of Project A's element id
// set to whoever is looking at Project B — the same class of risk the
// `ProjectScopeRegistry` header records for the leaked IFC/DXF overlays.
//
// ⛔ REGISTERED AT MODULE SCOPE, as an import side effect (ADR-0298 D6). Registration
// from a mount function is what let L-712 exist: an early return skipped it, and an
// owner that never registered was indistinguishable from an owner that answered
// "clean". If this module is in the heap, it HAS registered.

/**
 * C13 teardown for the analysis graph card.
 *
 * Idempotent, synchronous, non-throwing — the `projectScopeRegistry` contract.
 */
export function clearAnalysisGraphScope(): void {
  _layoutKey = null;
  _layoutPos = null;
  _layoutProjectId = null;
  // The camera pose over the graph cube. Reset with the layout it framed: an orbit
  // kept across a switch would seat Project B's first render at an angle chosen to
  // look at a cluster of Project A's that no longer exists.
  _orbit.yaw = -0.62;
  _orbit.pitch = 0.22;
  _orbit.zoom = 1;
  resetGraphViewState();
}

/**
 * ADR-0298 probe — which project's layout this module is holding.
 *
 * `null` means "no layout cached", which is always clean. A layout whose owner could
 * not be resolved answers `'<graph-layout-project-unresolved>'` rather than `null`:
 * §CONTEXT-DATA-HONESTY — "I hold nothing" and "I hold something I cannot attribute"
 * must never collapse to the same value. That collapse IS the L-713 defect, the
 * fourth appearance of this family.
 */
export function getAnalysisGraphOwningProjectId(): string | null {
  if (_layoutPos === null) return null;
  return _layoutProjectId ?? '<graph-layout-project-unresolved>';
}

/** What is being held, for the leak report. Never throws. */
export function describeAnalysisGraphScope(): Record<string, unknown> {
  return {
    cachedNodes: _layoutPos?.size ?? 0,
    layoutKeyView: _layoutKey?.split('|')[0] ?? null,
    stampedProjectId: _layoutProjectId,
    orbitSeated: _orbit.yaw !== -0.62 || _orbit.pitch !== 0.22 || _orbit.zoom !== 1,
  };
}

projectScopeRegistry.register({
  scopeName: 'analysis.graphView',
  clear: () => { clearAnalysisGraphScope(); },
});

registerProjectScopeProbe({
  scope: 'analysis.graphView',
  owningProjectId: () => getAnalysisGraphOwningProjectId(),
  describe: () => describeAnalysisGraphScope(),
});
