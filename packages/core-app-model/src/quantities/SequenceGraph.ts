/**
 * SequenceGraph — the derived build sequence as a DEPENDENCY GRAPH (a DAG).
 *
 * Layer:    L2 — packages/core-app-model
 * Contract: C37 §5.7 (the sequence graph view) · C37 §1.8 is NOT satisfied here
 *           and is not claimed to be · C66 §1.1 (an unmeasured figure is a CLAIM)
 * ADR:      ADR-0355 (naming + placement + why this is a DAG and not a Gantt).
 *           ADR-0351 §8 4D-3 and 4D-5 are BINDING and UNCHANGED by this module.
 * Issue:    L-6300..L-6312
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THIS IS A GRAPH AND NOT A TIMELINE — THE WHOLE DESIGN IN ONE PARAGRAPH
 * ═════════════════════════════════════════════════════════════════════════════
 * Founder, 2026-08-22: "could you create also a tab for 6d graph of execution?
 * like a mind map but for activity execution in time?"
 *
 * The data this draws is {@link ConstructionSequence}. That read model states its
 * own contract in words, and the words decide the picture:
 *
 *   > "⛔ NO ACTIVITY HAS A DURATION AND NONE HAS A DATE. The ORDER and the
 *   >  DEPENDENCIES are derived from the model and from ordinary constructability
 *   >  … Nothing here is a forward pass, a float or a critical path — with no
 *   >  durations there is nothing to pass forward."
 *
 * So exactly two things are real: the ORDER and the DEPENDENCY EDGES. Durations,
 * dates, float and the critical path are not. A Gantt chart is a drawing whose
 * primary axis is the one quantity this model does not have; drawing one would
 * commit precisely the failure ADR-0351 §8 4D-3 names — "a half-implemented CPM
 * is the same defect shape as a fabricated output rate."
 *
 * A mind map, by contrast, encodes ADJACENCY and nothing else. It is not a
 * softer version of a programme — it is the correct drawing for a model that
 * knows what follows what and does not know when.
 *
 * ⛔ THEREFORE THIS MODULE PRODUCES NO COORDINATE, NO AXIS AND NO SCALE.
 * It emits a graph: nodes, directed edges, and the REASON on every edge. Where a
 * node sits on screen is the view's business (`SequenceGraphView.ts`), and the
 * view is radial for the same reason this file is axis-free — see below.
 *
 * ⭐ `depth` IS DEPENDENCY DEPTH, NOT TIME, AND THE DISTINCTION IS LOAD-BEARING.
 * `depth` counts HOPS along the longest dependency chain reaching a node. Two
 * nodes at the same depth are NOT "simultaneous" — they are merely both reachable
 * in the same number of steps. Nothing here says how long a hop takes, and a hop
 * is not a unit of time. The view renders depth as a RING RADIUS rather than an
 * x-coordinate, because a horizontal axis reads as time to every construction
 * professional who has ever seen a programme, whatever the axis label says.
 */

import type { TakeoffResult } from './TakeoffTypes.js';
import type { BuildStage, ConstructionSequence, SequencedActivity } from './ConstructionSequence.js';
import { BUILD_STAGES, NO_LEVEL } from './ConstructionSequence.js';

/** One activity, as a graph node. Carries no position and no time. */
export interface SequenceGraphNode {
  readonly id: string;
  /** The stage label — "Walls", "Openings & joinery". */
  readonly label: string;
  /** The storey — "Level 1", or "whole project" / "no level stated". */
  readonly sublabel: string;
  readonly stage: BuildStage;
  /** The activity's own 1-based build rank, straight from the sequence. */
  readonly rank: number;
  /**
   * Hops along the LONGEST dependency chain reaching this node. Roots are 0.
   * ⛔ NOT a time, NOT a date, NOT a duration. See the file header.
   */
  readonly depth: number;
  readonly elementCount: number;
  /** "142.6 m2 blockwork 200 · 8 ud door" — the MEASURED work, or ''. */
  readonly quantityLabel: string;
  /** ⭐ A first-class visible state, never a hidden or zero-weight node. */
  readonly measuresNothing: boolean;
  /** The activity's own caveat, verbatim. Empty for an ordinary activity. */
  readonly note: string;
  /** The sentence printed where a duration would be. Verbatim, always present. */
  readonly durationNote: string;
}

/** One dependency, as a directed edge. `from` must complete before `to` starts. */
export interface SequenceGraphEdge {
  readonly from: string;
  readonly to: string;
  /**
   * ⭐ WHY THIS EDGE EXISTS, in words, straight from the engine.
   * The list view exposes this behind a "follows N activities — why" disclosure
   * and it is the most useful thing on that tab. On a graph it becomes the
   * edge's own label, so the picture shows the REASONING and not merely arrows.
   */
  readonly why: string;
  /** Colour key: the stage of the node the edge points AT. */
  readonly stage: BuildStage;
}

/** A trade the model does not measure. ⛔ Named, never drawn as an empty node. */
export interface AbsentTrade {
  readonly family: string;
  readonly note: string;
}

export interface SequenceGraph {
  readonly nodes: readonly SequenceGraphNode[];
  readonly edges: readonly SequenceGraphEdge[];
  /** The stages actually present, in build order. Drives the legend. */
  readonly stagesPresent: readonly BuildStage[];
  /** Deepest chain in the DAG. Drives the number of rings the view draws. */
  readonly maxDepth: number;
  /** The node every root hangs from — SUBSTRUCTURE. `null` if absent. */
  readonly rootId: string | null;
  /**
   * ⭐ The sequence's own coverage sentence, carried WITH the graph so that no
   * second surface can render this data without it. The list view and the graph
   * view read the SAME string from the SAME field.
   */
  readonly coverageStatement: string;
  /** ⛔ Trades PRYZM does not measure. An honest absence, not a zero node. */
  readonly absentTrades: readonly AbsentTrade[];
  /**
   * ⭐ THE REFUSALS, AS DATA. The view is required to render these. They are a
   * field and not a comment precisely so that "the graph quietly dropped the
   * caveats" is a test failure rather than a code review someone skipped.
   */
  readonly refusals: readonly string[];
  /**
   * ⛔ ALWAYS `null`, and asserted by {@link sequenceGraphTimeClaims}. A graph
   * that grew an axis would set this, and the gate would go red.
   */
  readonly timeAxis: null;
}

/**
 * The sentences the view MUST print. Kept here, beside the model, because a
 * refusal that lives only in a template is one refactor away from deletion.
 */
const GRAPH_REFUSALS: readonly string[] = Object.freeze([
  'This is a DEPENDENCY GRAPH, not a programme. There is no time axis, no scale and no direction on this drawing that means "later".',
  'No activity has a duration and none has a date. A duration needs an output rate (m2/day) and PRYZM holds none — it ships no productivity database for the same reason it ships no prices.',
  'Distance from the centre is DEPENDENCY DEPTH — how many activities must finish first — and NOT elapsed time. Two activities on the same ring are not simultaneous; they are merely the same number of steps in.',
  'Nothing here is a forward pass, a float or a critical path. With no durations there is nothing to pass forward, so no path on this graph is "critical".',
]);

/**
 * Build the dependency graph for a derived sequence.
 *
 * `takeoff` is REQUIRED rather than optional: the unmeasured trades are read
 * from its coverage ledger, and an optional parameter is how a surface comes to
 * render a graph that silently omits them.
 *
 * Pure — reads two read models, writes nothing, dispatches nothing.
 */
export function buildSequenceGraph(
  seq: ConstructionSequence,
  takeoff: TakeoffResult,
): SequenceGraph {
  const byId = new Map<string, SequencedActivity>(seq.activities.map((a) => [a.id, a]));

  // ── Edges. Only edges whose BOTH ends are present are emitted: an edge to a
  // node that is not drawn is an arrow into nothing, and the reader cannot tell
  // it from a missing dependency.
  const edges: SequenceGraphEdge[] = [];
  for (const a of seq.activities) {
    a.dependsOn.forEach((dep, i) => {
      if (!byId.has(dep)) return;
      edges.push({
        from: dep,
        to: a.id,
        why: a.dependencyReasons[i] ?? '',
        stage: a.stage,
      });
    });
  }

  // ── Longest-path depth. The DAG is acyclic by construction — `addDep` in
  // `deriveConstructionSequence` only ever links to an ALREADY-EMITTED activity,
  // so a back edge cannot be created. The iteration below is bounded by the node
  // count anyway, so a cycle introduced later degrades to a stable answer rather
  // than hanging.
  const preds = new Map<string, string[]>();
  for (const e of edges) {
    const list = preds.get(e.to);
    if (list) list.push(e.from); else preds.set(e.to, [e.from]);
  }
  const depth = new Map<string, number>();
  const order = [...seq.activities].sort((x, y) => x.rank - y.rank);
  for (let pass = 0; pass < order.length; pass++) {
    let changed = false;
    for (const a of order) {
      const p = preds.get(a.id) ?? [];
      const d = p.length === 0 ? 0 : Math.max(...p.map((q) => (depth.get(q) ?? 0) + 1));
      if (d !== (depth.get(a.id) ?? 0)) { depth.set(a.id, d); changed = true; }
    }
    if (!changed) break;
  }

  const nodes: SequenceGraphNode[] = seq.activities.map((a) => ({
    id: a.id,
    label: a.stageLabel,
    sublabel: a.levelId === NO_LEVEL && a.measuredNothing ? 'whole project' : a.levelName,
    stage: a.stage,
    rank: a.rank,
    depth: depth.get(a.id) ?? 0,
    elementCount: a.elementIds.length,
    quantityLabel: a.quantities
      .map((q) => round(q.quantity) + ' ' + q.unit + ' ' + q.description)
      .join(' · '),
    measuresNothing: a.measuredNothing,
    note: a.note,
    durationNote: a.durationNote,
  }));

  const present = new Set(nodes.map((n) => n.stage));
  const stagesPresent = BUILD_STAGES.filter((s) => present.has(s.id)).map((s) => s.id);

  const absentTrades: AbsentTrade[] = takeoff.coverage
    .filter((c) => c.state === 'NOT_MEASURED')
    .map((c) => ({ family: c.family, note: c.note }));

  return {
    nodes,
    edges,
    stagesPresent,
    maxDepth: nodes.reduce((m, n) => Math.max(m, n.depth), 0),
    rootId: nodes.find((n) => n.stage === 'SUBSTRUCTURE')?.id ?? null,
    coverageStatement: seq.coverageStatement,
    absentTrades,
    refusals: GRAPH_REFUSALS,
    timeAxis: null,
  };
}

function round(n: number): string {
  return (Math.round(n * 100) / 100).toLocaleString('en-GB', { maximumFractionDigits: 2 });
}

/**
 * ⛔ THE GATE THAT KEEPS THE REFUSAL TRUE — the sibling of
 * `activitiesWithAFabricatedDuration`. Returns every reason this graph has
 * started to claim time. MUST always be empty.
 *
 * It checks THREE independent things, because the three ways this drawing could
 * become a programme are independent:
 *   1. the graph declared an axis;
 *   2. an underlying activity acquired a duration;
 *   3. the refusals were dropped from the payload the view is handed.
 */
export function sequenceGraphTimeClaims(
  graph: SequenceGraph,
  seq: ConstructionSequence,
): readonly string[] {
  const claims: string[] = [];
  if (graph.timeAxis !== null) {
    claims.push('the graph declares a time axis');
  }
  for (const a of seq.activities) {
    if (a.durationDays !== null) claims.push('activity ' + a.id + ' carries a duration');
  }
  if (graph.refusals.length === 0) {
    claims.push('the graph carries no refusals, so a view could render it without them');
  }
  return claims;
}
