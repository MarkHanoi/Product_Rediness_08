/**
 * graphReadModel — the Analysis surface's read of the Unified Building Graph.
 *
 * Layer Affected:  UI — Analysis surface (L7)
 * File:            apps/editor/src/ui/analysis/graphReadModel.ts
 * ADR:             ADR-0343 §D.4 ("The UBG keeps the relational widgets… but only
 *                  once it is maintained") · §D.6 (honesty) · §D.7
 * STR:             STR-14 §3 (the UBG) · §4 (the visualisation)
 * Issue log:       L-3258 · reads L-3251's maintainer · L-3253's un-deadened topology
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ THIS FILE'S REAL JOB IS THE COVERAGE TABLE, NOT THE FIGURES
 * ═════════════════════════════════════════════════════════════════════════════
 * ADR-0343 §D.4 ruled the UBG OUT as the aggregate substrate and ruled it IN for
 * relational widgets — "but only once it is maintained". It is maintained now
 * (L-3251). That unblocks reading it. It does NOT make everything in it real.
 *
 * The UBG declares TEN edge types. Measured at HEAD, by this lane, with grep:
 * **four of them cannot be populated in production at all**, and the graph says
 * nothing about it — an empty `derivesFrom` renders exactly like a building with
 * no derivations. That is [[context-data-honesty-family]]: the failure value and
 * the empty value are the same value.
 *
 * So every edge family below carries a `CoverageState` and a reason, and the
 * widget renders that table beside the picture. A relationship diagram that
 * shows four families and stays silent about the six it cannot show is a claim
 * about the building, and it is false.
 *
 * L7 file. No THREE (P2), no rAF (P3), no `(window as any)` (P4), no store
 * writes (P6). P8 spans on the exported functions.
 */

import { withHandlerSpan } from '@pryzm/plugin-sdk';
import type { UbgEdge, UbgNode } from '@pryzm/building-graph';

import type { UbgLiveness } from '../../engine/buildingGraphMaintainer';

import type { AnalysisFigure, CoverageRow } from './AnalysisTypes';

/**
 * ⛔ The node cap. The force layout is O(n²) per iteration × 160 iterations, and
 * a card is ~360×280 px. Above this a node-link diagram is a hairball that
 * communicates nothing and costs a visible pause.
 *
 * The graph is therefore TRUNCATED, and `GraphProjection.truncated` says so and
 * by how much. A truncated diagram that admits truncation is honest; one that
 * does not is a lie about the building's connectivity — the reader counts what
 * they can see. ADR-0343 §D.4: *"A widget that cannot answer inside its budget
 * degrades to a stated refusal, never to a partial number."*
 */
export const GRAPH_NODE_CAP = 60;

/**
 * What each of the ten declared UBG edge types can ACTUALLY carry in production.
 *
 * ⚠ MEASURED 2026-08-21 (lane UBG1). Re-measure, do not re-transcribe — the
 * whole point of this repository's correction notices is that a hand-copied
 * status rots. Each `note` names the command that settles it.
 */
interface EdgeFamilyFact {
  readonly type: string;
  readonly state: CoverageRow['state'];
  readonly note: string;
}

const EDGE_FAMILIES: readonly EdgeFamilyFact[] = Object.freeze([
  {
    type: 'bounds',
    state: 'MEASURED',
    note:
      'TopologyLayer `intersects` → bounds. ⚠ This emitted NOTHING in production until 2026-08-21 ' +
      '(L-3253): the id universe read `window.pryzmScene`, which nothing in the repo ever assigned. ' +
      'It now falls back to the twelve element stores. ⚠ Also L-3255: `intersects` is a SYMMETRIC ' +
      'overlap test, so the direction of a `bounds` edge does not mean "A contains B".',
  },
  {
    type: 'adjacentTo',
    state: 'MEASURED',
    note:
      'TopologyLayer `adjacentTo`, plus the A.21.D16 room-enrichment pass. Same L-3253 history as ' +
      '`bounds` for the topology leg; the enrichment leg was always live.',
  },
  {
    type: 'connectsTo',
    state: 'MEASURED',
    note: 'RoomGraphService door/opening edges, per level. Live — `window.roomGraphService` is registered at boot.',
  },
  {
    type: 'hostedIn',
    state: 'MEASURED',
    note: 'The window-enrichment pass (door/window hosted in its wall). Live when `window.windowStore` is present.',
  },
  {
    type: 'dependsOn',
    state: 'MEASURED',
    note:
      'Derived from the SemanticGraph cascade families (hosts / hostedBy / boundedBy / sitsOn / ' +
      'supports / connectedTo / adjacentTo), all of which have production writers.',
  },
  {
    type: 'violates',
    state: 'MEASURED',
    note:
      'ConstraintEngine violations → `violates` edges to a synthetic rule node. ⚠ Freshness is bounded ' +
      "by the engine's own 800 ms debounce, NOT by the graph's delta — an edit does not re-validate.",
  },
  {
    type: 'derivesFrom',
    state: 'NOT_MEASURED',
    note:
      '⛔ STRUCTURALLY EMPTY, not "this project has none". The semantic adapter projects ONLY the ' +
      'derivation family `branchedFrom` / `supersedes` / `precededBy`, and all three have ZERO ' +
      'production writers in the SemanticGraph — verify with ' +
      "grep -rn \"type: 'branchedFrom'\" packages apps plugins (excluding tests) → 0. " +
      'The adapter is even gated on a predicate that can never be true.',
  },
  {
    type: 'circulatesVia',
    state: 'NOT_MEASURED',
    note:
      '⛔ STRUCTURALLY UNREACHABLE. The adapter needs `RoomGraphSnapshot.circulationPaths`, and ' +
      '`extractRoomGraphSnapshot` never sets that key — repo-wide, `circulationPaths` appears only in ' +
      'the adapter, its own type declaration, and two tests. The D-TGL circulation graph exists; ' +
      'nothing wires it to the UBG.',
  },
  {
    type: 'servesZone',
    state: 'NOT_MEASURED',
    note: '⛔ NO WRITER ANYWHERE. A declared edge type with no adapter emitting it. Zoning is not projected.',
  },
  {
    type: 'precededBy',
    state: 'NOT_MEASURED',
    note:
      '⛔ NO WRITER ANYWHERE in the UBG. The TemporalGraph records every mutation and is never ' +
      'projected into this graph, so "how the design evolved" is absent from the relational view.',
  },
]);

export interface GraphProjection {
  readonly nodes: readonly UbgNode[];
  readonly edges: readonly UbgEdge[];
  readonly figures: readonly AnalysisFigure[];
  readonly coverage: readonly CoverageRow[];
  readonly unreachable: readonly string[];
  /** Total node count BEFORE the cap — the honest denominator. */
  readonly totalNodes: number;
  readonly totalEdges: number;
  /** True ⇒ `nodes` is a subset and every count on the card must read "≥". */
  readonly truncated: boolean;
  readonly liveness: UbgLiveness | null;
  /** ⛔ false ⇒ counts are a lower bound OR the graph's freshness is unknown. */
  readonly complete: boolean;
  /** Why `complete` is false — one sentence per cause. Empty when complete. */
  readonly incompleteReason: readonly string[];
}

interface GraphWindow {
  __pryzmBuildingGraph?: {
    allNodes?: () => UbgNode[];
    allEdges?: () => UbgEdge[];
    nodeCount?: number;
    edgeCount?: number;
  };
  __pryzmUbgLiveness?: UbgLiveness;
}

function gw(): GraphWindow | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as GraphWindow);
}

/**
 * One human sentence describing how current the graph is. Rendered on the card.
 *
 * ⭐ Before L-3251 the only honest sentence available was "stale by construction",
 * and there was no code path that could say it. This is the point of the whole
 * lane: the surface can now state its own freshness.
 */
export function livenessSentence(l: UbgLiveness | null): string {
  if (!l || l.freshness === 'absent') {
    return 'This graph has not been built yet. Open it once, or make an edit, and it will project.';
  }
  switch (l.freshness) {
    case 'maintained': {
      const d = l.lastDelta;
      const legs = d ? Object.entries(d.legs).filter(([, v]) => v !== 'skipped').map(([k]) => k).join(', ') : '';
      return (
        `LIVE — maintained off the StoreEventBus. ${l.deltasApplied} delta(s) applied from ` +
        `${l.eventsObserved} store event(s)` +
        (d ? `; last touched ${d.elements} element(s) in ${d.elapsedMs.toFixed(1)} ms via ${legs}` : '') +
        '.'
      );
    }
    case 'rebuilt':
      return (
        'Fully rebuilt and now subscribed — no edits have landed since. ' +
        'Subsequent edits are applied as deltas, not rebuilds.'
      );
    case 'stale':
      return (
        '⛔ BEHIND THE MODEL. Store events arrived with no graph to apply them to, so this is the ' +
        'model as it stood at some earlier point and the gap is not counted. Press refresh to rebuild.'
      );
  }
}

/**
 * Project the live UBG into the Analysis result vocabulary.
 *
 * Figures are grouped by RELATIONSHIP TYPE: one figure per edge family, value =
 * edge count, `elementIds` = the distinct endpoints, so clicking a family
 * selects the elements that participate in it (H4 — a number you cannot open is
 * a number you cannot check).
 *
 * P8: `pryzm.analysis.graph.project`.
 */
export function projectGraph(): GraphProjection {
  return withHandlerSpan(
    'pryzm.analysis.graph.project',
    { 'pryzm.surface': 'analysis' },
    () => {
      const w = gw();
      const graph = w?.__pryzmBuildingGraph;
      const liveness = w?.__pryzmUbgLiveness ?? null;

      if (!graph || typeof graph.allNodes !== 'function' || typeof graph.allEdges !== 'function') {
        return {
          nodes: [],
          edges: [],
          figures: [],
          // ⛔ NOT the same as "the building has no relationships". The coverage
          // table still ships, so the reader learns which families would appear.
          coverage: EDGE_FAMILIES.map((f) => ({
            family: f.type,
            state: 'NOT_MEASURED' as const,
            note: `The graph was not reachable when this ran, so this family's state is unknown. ${f.note}`,
          })),
          unreachable: ['window.__pryzmBuildingGraph'],
          totalNodes: 0,
          totalEdges: 0,
          truncated: false,
          liveness,
          complete: false,
          incompleteReason: ['the Unified Building Graph was not reachable — no relationship figure on this tab was computed'],
        };
      }

      const allNodes = graph.allNodes() ?? [];
      const allEdges = graph.allEdges() ?? [];

      // ── Figures, one per edge family PRESENT ────────────────────────────────
      const byType = new Map<string, { count: number; ids: Set<string> }>();
      for (const e of allEdges) {
        let slot = byType.get(e.type);
        if (!slot) {
          slot = { count: 0, ids: new Set() };
          byType.set(e.type, slot);
        }
        slot.count++;
        slot.ids.add(e.from);
        slot.ids.add(e.to);
      }

      const figures: AnalysisFigure[] = [...byType.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .map(([type, slot]) => ({
          key: type,
          label: type,
          value: slot.count,
          unit: 'ud' as const,
          basis: `Count of directed \`${type}\` edges in the Unified Building Graph, as projected by its adapters.`,
          elementIds: [...slot.ids],
          qualifiers: [],
        }));

      // ── Coverage: the declared families, each with its measured state ───────
      const coverage: CoverageRow[] = EDGE_FAMILIES.map((f) => {
        const present = byType.get(f.type);
        if (f.state === 'NOT_MEASURED') {
          return { family: f.type, state: 'NOT_MEASURED', note: f.note };
        }
        return present
          ? { family: f.type, state: 'MEASURED', note: `${present.count} edge(s). ${f.note}` }
          : {
              // A family that CAN fire but did not: real information about this
              // project, distinct from a family that structurally cannot.
              family: f.type,
              state: 'COUNTED_ONLY',
              note: `No edges of this family in this project. The projection is wired and ran. ${f.note}`,
            };
      });

      // ── The drawn subgraph: the highest-degree nodes, capped ────────────────
      const degree = new Map<string, number>();
      for (const e of allEdges) {
        degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
        degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
      }
      const ranked = [...allNodes].sort(
        (a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0),
      );
      const truncated = ranked.length > GRAPH_NODE_CAP;
      const nodes = truncated ? ranked.slice(0, GRAPH_NODE_CAP) : ranked;
      const keep = new Set(nodes.map((n) => n.id));
      const edges = allEdges.filter((e) => keep.has(e.from) && keep.has(e.to));

      const fresh = liveness?.freshness === 'maintained' || liveness?.freshness === 'rebuilt';

      return {
        nodes,
        edges,
        figures,
        coverage,
        unreachable: [],
        totalNodes: allNodes.length,
        totalEdges: allEdges.length,
        truncated,
        liveness,
        // ⛔ `complete` is false if ANYTHING is a lower bound: a truncated draw,
        // or a graph whose freshness we cannot vouch for. The surface renders
        // "≥ N" off this flag, so conflating the two would understate the doubt.
        complete: !truncated && fresh,
        // §ANALYSIS-INCOMPLETE-REASON (L-3303) — say WHICH. Neither of these is
        // an unreadable source, and the status strip used to report both as
        // "0 declared source(s) unreadable", which reads as self-refuting.
        incompleteReason: [
          ...(truncated
            ? [`the graph was drawn to a ${GRAPH_NODE_CAP}-node cap and holds ${allNodes.length}`]
            : []),
          ...(fresh ? [] : [`graph freshness is "${liveness?.freshness ?? 'unknown'}" — it may be behind the model`]),
        ],
      };
    },
  );
}

/** The declared edge-family table, for the surface's provenance panel. */
export function graphEdgeFamilyTable(): ReadonlyArray<EdgeFamilyFact> {
  return EDGE_FAMILIES;
}

/** Degree of each drawn node — drives node radius. */
export function nodeDegrees(edges: readonly UbgEdge[]): Map<string, number> {
  const d = new Map<string, number>();
  for (const e of edges) {
    d.set(e.from, (d.get(e.from) ?? 0) + 1);
    d.set(e.to, (d.get(e.to) ?? 0) + 1);
  }
  return d;
}
