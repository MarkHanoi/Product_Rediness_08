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

// ── The per-level scope (§ANALYSIS-GRAPH-LEVEL-FILTER, L-3620) ────────────────
//
// ⭐ THE FOUNDER'S POINT, AND IT IS THE WHOLE DESIGN OF THIS SECTION:
//
//   "filtered to Level 1" is NOT the same statement as "truncated at 60 nodes"
//   and they must never render identically.
//
// They are opposite kinds of fact. A CAP is the tool failing to show you the
// model — every count under it is a floor and the reader must discount it. A
// FILTER is the reader choosing a smaller universe — every count inside it is
// EXACT for the universe named on the card. Rendering a filter as a lower-bound
// warning would teach the reader to distrust a number that is not in doubt; and
// rendering a truncation as a scope would hide one that is.
//
// So the projection carries them SEPARATELY: `scope` (what universe was asked
// for) and `truncated` / `incompleteReason` (what the tool could not deliver
// inside it). A filtered graph is `complete: true` unless something ELSE is
// wrong — and the "something else" is named below, because there is one.
//
// ⛔ WHERE A LEVEL COMES FROM, MEASURED 2026-08-22. `UbgNode` has no level field
// (packages/building-graph/src/types.ts:65-72 — id, kind, props, refs, strict).
// Exactly ONE adapter stamps `props.levelId`, `roomGraphAdapter.ts:43`, and only
// on `room` nodes. So a level filter over the UBG alone could place rooms and
// nothing else. It is therefore resolved by JOINING THROUGH THE ELEMENT CENSUS,
// which already indexes `id -> levelId` across the eighteen declared stores —
// and which already knows how to say "this table does not claim that id".

/**
 * How a node id is placed on a storey. Supplied by the caller so this module
 * never imports the census directly — the census imports THIS module, and one
 * of the two directions has to stay an argument.
 */
export interface GraphPlacement {
  /**
   * `string`    — the census places this id on this level;
   * `null`      — the census claims the id but it carries NO level;
   * `undefined` — ⛔ the census does not claim this id AT ALL. Distinct from
   *               both of the above, and the distinction is the honest half:
   *               synthetic `rule` nodes (from `violates`) and any element in a
   *               store outside the declared table land here. They are NOT
   *               "elements on another storey".
   */
  levelOf(id: string): string | null | undefined;
  /** Level id -> display name, from the live level authority. */
  readonly levelNames: ReadonlyMap<string, string>;
}

/**
 * The active level scope for every relationship widget, or `null` for "all".
 *
 * ⚠ MODULE STATE, and deliberately shared rather than per-card: the graph, the
 * relations table and the coverage ledger are read TOGETHER and a filter that
 * moved one of them would put three disagreeing universes on one tab.
 * ⚠ NOT persisted. A scope restored from a previous session would reopen the tab
 * showing less than the model holds with nothing on screen to explain it.
 */
let _levelFilter: string | null = null;

/** The level every relationship widget is currently scoped to, or `null`. */
export function graphLevelFilter(): string | null {
  return _levelFilter;
}

/** Set the scope. The surface re-renders; nothing here recomputes on its own. */
export function setGraphLevelFilter(levelId: string | null): void {
  _levelFilter = levelId;
}

/** How a node fell outside the active scope. Three answers, never merged. */
export interface GraphScope {
  /** The level id the reader asked for, or `null` for the whole model. */
  readonly levelId: string | null;
  /** Its display name, resolved through the level authority. */
  readonly levelName: string | null;
  /** Nodes the census places on ANOTHER storey — legitimately out of scope. */
  readonly excludedOtherLevel: number;
  /** Nodes the census claims but that carry no level at all. */
  readonly excludedNoLevel: number;
  /**
   * ⛔ Nodes the census DOES NOT CLAIM. Excluded because they cannot be placed,
   * not because they are elsewhere — so a figure scoped to a level is a FLOOR
   * while this is non-zero, and the card says exactly that.
   */
  readonly excludedUnplaceable: number;
  /**
   * Relations severed by the scope: one endpoint kept, the other dropped.
   * ⭐ Reported because a relationship view that silently cuts its own edges
   * understates connectivity, which is the one thing it exists to show.
   */
  readonly severedEdges: number;
}

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

/** The scope of a projection that produced nothing. Named, not blank. */
function EMPTY_SCOPE(levelId: string | null, placement: GraphPlacement | null): GraphScope {
  return {
    levelId,
    levelName: levelId === null ? null : (placement?.levelNames.get(levelId) ?? levelId),
    excludedOtherLevel: 0,
    excludedNoLevel: 0,
    excludedUnplaceable: 0,
    severedEdges: 0,
  };
}

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
  /**
   * ⭐ The universe these figures are TRUE OF. Never conflated with `truncated`:
   * a scope is what the reader asked for, a truncation is what the tool could
   * not deliver. See the §ANALYSIS-GRAPH-LEVEL-FILTER note above.
   */
  readonly scope: GraphScope;
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
export function projectGraph(
  placement: GraphPlacement | null = null,
  levelId: string | null = _levelFilter,
): GraphProjection {
  return withHandlerSpan(
    'pryzm.analysis.graph.project',
    { 'pryzm.surface': 'analysis', 'pryzm.analysis.graph_scope': levelId ?? 'all-levels' },
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
          scope: EMPTY_SCOPE(levelId, placement),
          liveness,
          complete: false,
          incompleteReason: ['the Unified Building Graph was not reachable — no relationship figure on this tab was computed'],
        };
      }

      const everyNode = graph.allNodes() ?? [];
      const everyEdge = graph.allEdges() ?? [];

      // ── The level scope, applied BEFORE anything is counted ─────────────────
      //
      // ⭐ Applied first on purpose. If the scope were applied after the figures,
      // the card would print an edge tally for the whole model beside a picture
      // of one storey -- which is the "wrong number under the right title" shape
      // the change-table refusal names, in a different costume.
      //
      // A node's level comes from `placement` (the element census) and falls back
      // to `props.levelId` where an adapter projected one -- today only
      // `roomGraphAdapter`. Census FIRST: it reads the element stores, which are
      // the authority on where an element is; the prop is one adapter's copy.
      let excludedOtherLevel = 0;
      let excludedNoLevel = 0;
      let excludedUnplaceable = 0;

      const levelOfNode = (n: UbgNode): string | null | undefined => {
        const fromCensus = placement?.levelOf(n.id);
        if (fromCensus !== undefined) return fromCensus;
        const prop = n.props?.levelId;
        return typeof prop === 'string' && prop.length > 0 ? prop : undefined;
      };

      let allNodes = everyNode;
      if (levelId !== null) {
        const kept: UbgNode[] = [];
        for (const n of everyNode) {
          const lvl = levelOfNode(n);
          if (lvl === levelId) { kept.push(n); continue; }
          // ⛔ THREE DIFFERENT REASONS TO BE OUT OF SCOPE, counted separately.
          // Merging them would let "we could not place 40 nodes" hide inside
          // "40 nodes are on other storeys", and only the first makes the
          // remaining figures a floor.
          if (lvl === undefined) excludedUnplaceable++;
          else if (lvl === null) excludedNoLevel++;
          else excludedOtherLevel++;
        }
        allNodes = kept;
      }

      const inScope = new Set(allNodes.map((n) => n.id));
      const allEdges = levelId === null
        ? everyEdge
        : everyEdge.filter((e) => inScope.has(e.from) && inScope.has(e.to));
      // A relation with ONE endpoint in scope was CUT by the filter. The reader
      // is looking at a connectivity picture; a cut it is not told about is an
      // understatement of exactly the thing the picture is for.
      const severedEdges = levelId === null
        ? 0
        : everyEdge.filter((e) => inScope.has(e.from) !== inScope.has(e.to)).length;

      const scope: GraphScope = {
        levelId,
        levelName: levelId === null ? null : (placement?.levelNames.get(levelId) ?? levelId),
        excludedOtherLevel,
        excludedNoLevel,
        excludedUnplaceable,
        severedEdges,
      };

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
        scope,
        liveness,
        // ⛔ `complete` is false if ANYTHING is a lower bound: a truncated draw,
        // a graph whose freshness we cannot vouch for, or nodes the filter had
        // to drop because it could not place them.
        //
        // ⭐ THE SCOPE ITSELF IS NOT ONE OF THEM (§ANALYSIS-GRAPH-LEVEL-FILTER,
        // L-3620). `excludedOtherLevel` and `excludedNoLevel` are nodes the
        // reader ASKED to leave out; the remaining counts are exact for the
        // universe named on the card, and printing "≥" over them would put a
        // doubt on a number that is not in doubt. `excludedUnplaceable` IS one:
        // those nodes have no resolvable level, so some of them may belong to
        // the level being shown and the figures for it are a floor.
        complete: !truncated && fresh && scope.excludedUnplaceable === 0,
        // §ANALYSIS-INCOMPLETE-REASON (L-3303) — say WHICH. None of these is an
        // unreadable source, and the status strip used to report all of them as
        // "0 declared source(s) unreadable", which reads as self-refuting.
        incompleteReason: [
          ...(truncated
            ? [`the graph was drawn to a ${GRAPH_NODE_CAP}-node cap and holds ${allNodes.length}`]
            : []),
          ...(fresh ? [] : [`graph freshness is "${liveness?.freshness ?? 'unknown'}" — it may be behind the model`]),
          ...(scope.excludedUnplaceable > 0
            ? [
                `${scope.excludedUnplaceable} node(s) carry no level the element census can resolve, so the ` +
                'level filter had to drop them — some may belong to this storey',
              ]
            : []),
        ],
      };
    },
  );
}

/**
 * One sentence describing the universe these figures are true of.
 *
 * ⛔ IT IS NOT A WARNING AND MUST NOT BE RENDERED AS ONE. The caller puts it on
 * the neutral scope plate, never the amber lower-bound plate — that separation
 * IS §ANALYSIS-GRAPH-LEVEL-FILTER (L-3620). A reader who cannot tell "you asked
 * for one storey" from "the tool gave up at sixty nodes" has been given one
 * ambiguous fact instead of two clear ones.
 */
export function scopeSentence(scope: GraphScope): string {
  if (scope.levelId === null) {
    return 'Scope: EVERY STOREY. These figures cover the whole model.';
  }
  const bits: string[] = [
    `Scope: ${scope.levelName ?? scope.levelId} ONLY — these counts are exact for this storey, not a truncation of the model.`,
  ];
  if (scope.excludedOtherLevel > 0) {
    bits.push(`${scope.excludedOtherLevel} element(s) are on other storeys and were left out because you asked.`);
  }
  if (scope.excludedNoLevel > 0) {
    bits.push(`${scope.excludedNoLevel} carry no storey at all — a real fact about the model, not a filter failure.`);
  }
  if (scope.severedEdges > 0) {
    bits.push(
      `⚠ ${scope.severedEdges} relation(s) cross this storey's boundary and are NOT drawn: one endpoint is out of ` +
        "scope. Connectivity here is therefore lower than the whole building's.",
    );
  }
  return bits.join(' ');
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
