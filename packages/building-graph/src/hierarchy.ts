/**
 * hierarchy — SIX VIEWS OVER ONE GRAPH. Not six graphs.
 *
 * Layer:      L2 (`@pryzm/building-graph`). Pure. No THREE, no DOM, no I/O (P5).
 * Contracts:  C71 §2.2/§2.3 (PARKED is not a gap) · C71 §4.1/§4.2 (the stores stay
 *             separate; the UBG's vocabulary is the canonical QUERY vocabulary) ·
 *             C71 §4.4 (`[]` may only ever mean "zero results") ·
 *             C78 §4 (relationship direction is a fact, not a convention)
 * ADR:        ADR-0364
 * Issue log:  L-8413 · L-8414 · L-8415 · L-8416
 * SPEC:       docs/03-execution/specs/SPEC-ANALYSIS-RELATIONSHIP-GRAPH-3D.md §3
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY A VIEW IS A FILTER AND NOT A GRAPH
 * ═════════════════════════════════════════════════════════════════════════════
 * The founder asked for Element-based, Spatial-based, System-based, Room-based,
 * Topology-based and Mixed views. The tempting implementation is six builders.
 * It is the wrong one, and the contract says so:
 *
 *   C71 §4.1 — MUST NOT merge the three graph stores;
 *   C71 §4.2 — the UBG's vocabulary IS the canonical QUERY vocabulary, and the
 *              other stores map ONTO it.
 *
 * There is therefore exactly one projection (the UBG, built by five adapters)
 * and a view is a SUBSET OF ITS TEN EDGE FAMILIES. Six builders would mint six
 * rival ideas of what the building is, and any two of them could then disagree
 * about the same wall — which is how this repository ended up with five minima
 * tables and three commandManager counters.
 *
 * ⛔ A CONSEQUENCE THAT MUST NOT BE ENGINEERED AWAY: a view can be EMPTY. One of
 * them is empty by construction and will stay that way (see `system` below). An
 * empty view renders a NAMED SENTENCE, never a blank canvas —
 * [[context-data-honesty-family]]: the failure value and the empty value are the
 * same value unless the code makes them different.
 */

import {
  disciplineOfFamily,
  ifcClassLabel,
  DISCIPLINE_BASIS,
  DISCIPLINE_LABEL,
  DISCIPLINE_ORDER,
  type Discipline,
  type ElementFamilyResolver,
  type IfcClassResolver,
} from './discipline.js';
import type { UbgEdge, UbgEdgeType, UbgNode } from './types.js';

/** The six projections the founder named. `mixed` is the union, not a seventh idea. */
export type HierarchyView = 'element' | 'spatial' | 'system' | 'room' | 'topology' | 'mixed';

export interface HierarchyViewDef {
  readonly id: HierarchyView;
  readonly label: string;
  /** The edge families this view projects. A SUBSET of `UBG_EDGE_TYPES`. */
  readonly families: readonly UbgEdgeType[];
  /** One sentence: what question this view answers. Rendered on the card. */
  readonly basis: string;
  /**
   * What the view says when it yields nothing. ⛔ REQUIRED, not optional — a view
   * with no empty sentence is a blank canvas waiting to happen.
   */
  readonly emptySentence: string;
}

/**
 * ⛔ `bounds` IS DRAWN UNDIRECTED, AND THIS IS NOT A STYLE CHOICE.
 *
 * Measured and recorded at `graphReadModel.ts` `EDGE_FAMILIES` (L-3255): the
 * TopologyLayer test behind a `bounds` edge is `intersects`, which is a SYMMETRIC
 * bounding-box overlap. `A --bounds--> B` therefore does **NOT** mean "A contains
 * B" — the direction is an artefact of which element the adapter happened to
 * iterate first. Drawing an arrowhead on it would assert containment that nothing
 * measured, which is C78 §4 failed at the render layer.
 *
 * ⚠ AND THE SECOND WARNING TRAVELS WITH IT: `bounds` emitted NOTHING in
 * production until 2026-08-21 (L-3253) because its id universe read
 * `window.pryzmScene`, which nothing in this repository ever assigned. Any
 * `bounds` reading taken before that date is a reading of a dead wire.
 */
export const UNDIRECTED_FAMILIES: readonly UbgEdgeType[] = Object.freeze(['bounds', 'adjacentTo']);

export const HIERARCHY_VIEWS: readonly HierarchyViewDef[] = Object.freeze([
  {
    id: 'element',
    label: 'Element-based',
    families: ['hostedIn', 'dependsOn'],
    basis:
      'What each element is carried by, and what rebuilds when it changes. ' +
      '`hostedIn` is the door/window-in-wall relation; `dependsOn` is the cascade-rebuild edge ' +
      'derived from the SemanticGraph families that have production writers.',
    emptySentence:
      'No element-to-element relations are projected for this scope. That is not "this building has ' +
      'no elements" — the Unified Building Graph holds a node only when an adapter projected a ' +
      'relationship touching it. If the model has walls but no doors or windows, `hostedIn` is ' +
      'legitimately empty; the relationship-coverage card names which families ran.',
  },
  {
    id: 'spatial',
    label: 'Spatial-based',
    families: ['bounds', 'adjacentTo'],
    basis:
      'What is next to, and what encloses, what. ⚠ Both families come from the TopologyLayer and ' +
      'BOTH are symmetric tests — an edge here means "these two overlap or touch", never "this one ' +
      'contains that one".',
    emptySentence:
      '⚠ No spatial topology is projected for this scope. Read this carefully before treating it as ' +
      'a fact about the building: `bounds` emitted NOTHING in production until 2026-08-21 (L-3253) ' +
      'because its id universe read `window.pryzmScene`, which nothing ever assigned. An empty ' +
      'spatial view is therefore consistent both with a model whose elements do not touch and with ' +
      'a topology pass that has not run. The relationship-coverage card distinguishes them.',
  },
  {
    id: 'system',
    label: 'System-based',
    families: ['servesZone'],
    basis:
      'Which zone each system element serves. ⛔ PRYZM authors no systems — see the empty state; ' +
      'this view exists so the absence is stated rather than discovered.',
    // ⭐ THE MOST IMPORTANT SENTENCE IN THIS FILE. The founder will open this view
    // and it will be blank. A blank canvas reads as a broken feature; this reads
    // as a fact about the product, which is what it is.
    emptySentence:
      '⛔ No systems are authored in this model, and this view is CORRECT to stay empty. ' +
      '`servesZone` is a PARKED family under C71 §2.2 — declared, deliberately NOT required — and it ' +
      'has no writer because there is no zone model to write from: no `zone` element kind exists ' +
      'among the 29 declared element kinds, there is no zone store, no system-side element could be ' +
      'the `from` endpoint, and `SemanticGraph.ts:57` marks its own `servesZone` member `// (future)`. ' +
      'C71 §2.3: parked is NOT a gap, and no census may count it as missing capability. Under C71 §2.5 ' +
      'this family becomes required only via an ADR naming its first CONSUMER — a writer-first ' +
      'unparking is forbidden. ' +
      '⚠ Do not confuse this with the large and real URBAN zoning subsystem ' +
      '(`packages/schemas/src/site/zoning/**`): its subject is a PARCEL, not a building element, and ' +
      'no zoning record references an element id.',
  },
  {
    id: 'room',
    label: 'Room-based',
    families: ['connectsTo', 'circulatesVia'],
    basis:
      'Which rooms reach which, through which doors, and which circulation rooms serve them. ' +
      '⚠ `circulatesVia` carries a SET of served rooms sorted by id, NOT a route: a corridor’s door ' +
      'neighbours have no canonical traversal order and none is invented.',
    emptySentence:
      'No room connectivity is projected for this scope. `connectsTo` comes from `RoomGraphService`’s ' +
      'door and opening edges per level — so this is empty when the model has no rooms, when no door ' +
      'joins two rooms, or when the room-graph service was not reachable. Those are three different ' +
      'answers and the relationship-coverage card separates them; C71 §4.4 forbids letting `[]` stand ' +
      'for all three.',
  },
  {
    id: 'topology',
    label: 'Topology-based',
    families: ['bounds', 'adjacentTo', 'hostedIn', 'connectsTo'],
    basis:
      'Everything that is a statement about position or containment: what touches what, what hosts ' +
      'what, and what opens into what. This is the view a "show me this wall’s topology" question ' +
      'lands on.',
    emptySentence:
      'No topological relations are projected for this scope. This view is the union of the spatial ' +
      'and hosting families, so it is empty only when ALL of them are — see the spatial view’s note ' +
      'on the `bounds` wire (L-3253) before reading this as a fact about the building.',
  },
  {
    id: 'mixed',
    label: 'Mixed view',
    // ⛔ Enumerated, never `UBG_EDGE_TYPES` spread at runtime: this list is what
    // "mixed" MEANS, and a future eleventh edge family must be added here by a
    // human who has decided it belongs, not swept in by a spread.
    families: [
      'bounds', 'adjacentTo', 'connectsTo', 'circulatesVia', 'hostedIn',
      'servesZone', 'derivesFrom', 'dependsOn', 'precededBy', 'violates',
    ],
    basis:
      'Every relation family the Unified Building Graph declares, in one picture. ⚠ Four of the ten ' +
      'cannot be populated in this build at all — the relationship-coverage card names which, and ' +
      'why, per family.',
    emptySentence:
      'The graph projected successfully and holds no relations at all for this scope. Because this ' +
      'view asks for every declared family, an empty result here means no adapter produced anything ' +
      '— check the liveness strip above: a graph that has never been built and a building with no ' +
      'relationships are different states and must not be read as one.',
  },
]);

export function viewDef(view: HierarchyView): HierarchyViewDef {
  const d = HIERARCHY_VIEWS.find((v) => v.id === view);
  // ⛔ Throwing beats a silent default. An unknown view id is a programming
  // error, and returning `mixed` would render the whole graph under another
  // view's title — a wrong picture under a right heading.
  if (!d) throw new Error(`[hierarchy] unknown view "${view}"`);
  return d;
}

// ═════════════════════════════════════════════════════════════════════════════
// The category tree: Root -> Discipline -> Family -> Element
// ═════════════════════════════════════════════════════════════════════════════

/** One family row under a discipline. `count` is EXACT for the projected subset. */
export interface FamilyBucket {
  readonly family: string;
  readonly count: number;
  /** What the IFC class authority says, or a named non-answer. Never a guess. */
  readonly ifcClass: string;
  readonly ids: readonly string[];
}

export interface DisciplineBucket {
  readonly discipline: Discipline;
  readonly label: string;
  readonly basis: string;
  readonly count: number;
  readonly families: readonly FamilyBucket[];
}

export interface HierarchyProjection {
  readonly view: HierarchyView;
  readonly def: HierarchyViewDef;
  /** Nodes touched by at least one edge of this view's families. */
  readonly nodes: readonly UbgNode[];
  /** Edges whose type is one of this view's families. */
  readonly edges: readonly UbgEdge[];
  /** The discipline tree over `nodes`, in `DISCIPLINE_ORDER`, empty rows dropped. */
  readonly buckets: readonly DisciplineBucket[];
  /** Families whose edges must be drawn without an arrowhead. See `UNDIRECTED_FAMILIES`. */
  readonly undirected: ReadonlySet<UbgEdgeType>;
  /** Per-family edge tallies for the legend. Includes families with zero. */
  readonly edgeCounts: ReadonlyMap<UbgEdgeType, number>;
  /**
   * `null` when the view drew something. Otherwise the view's own named sentence
   * — ⛔ never a generic "no data".
   */
  readonly empty: string | null;
  /**
   * ⛔ Nodes whose FAMILY could not be resolved. Non-zero ⇒ every discipline count
   * above is a FLOOR, and the caller must say so.
   */
  readonly unresolvedFamilyCount: number;
}

export interface HierarchyOptions {
  /** The census. Absent ⇒ every node falls back to its UBG `kind`. */
  readonly families?: ElementFamilyResolver | null;
  /** Lane IFCTREE47's authority. Absent ⇒ IFC columns say so. */
  readonly ifc?: IfcClassResolver | null;
}

/**
 * Resolve one node's element family.
 *
 * ⭐ THE LADDER, AND THE ORDER IS THE POINT. The census is asked FIRST because it
 * reads the element stores, which are the authority on what an element is. The
 * UBG `kind` is second because three of the five adapters stamp the generic
 * `'element'` on every endpoint they materialise — a label that means "an adapter
 * made this node and did not know what it was". Preferring `kind` would let that
 * generic answer outrank a real one.
 *
 * ⛔ `'element'` is treated as NO ANSWER, not as a family, for exactly that
 * reason. It returns `null`, which `disciplineOfFamily` maps to `unresolved`.
 */
export function familyOfNode(node: UbgNode, resolver: ElementFamilyResolver | null | undefined): string | null {
  const fromCensus = resolver?.familyOf(node.id);
  if (typeof fromCensus === 'string' && fromCensus.length > 0) return fromCensus;
  if (node.kind && node.kind !== 'element') return node.kind;
  return null;
}

/**
 * Project ONE view out of the whole graph.
 *
 * ⚠ NODE SELECTION IS EDGE-DRIVEN, DELIBERATELY. A view keeps a node only when an
 * edge OF THIS VIEW'S FAMILIES touches it. Keeping every node and filtering only
 * the edges would draw a field of isolated dots under a heading that promised a
 * relationship — which is the "wrong number under the right title" shape in a
 * picture's costume. The counts on the card are then EXACT for what is drawn.
 *
 * ⛔ THIS FUNCTION DOES NOT CAP. Truncation belongs to the caller, which owns the
 * cap, the notice and the total — one place, so a truncated view can never
 * silently disagree with the number printed beside it.
 */
export function projectHierarchy(
  nodes: readonly UbgNode[],
  edges: readonly UbgEdge[],
  view: HierarchyView,
  opts: HierarchyOptions = {},
): HierarchyProjection {
  const def = viewDef(view);
  const wanted = new Set<UbgEdgeType>(def.families);

  const keptEdges = edges.filter((e) => wanted.has(e.type));

  const touched = new Set<string>();
  for (const e of keptEdges) {
    touched.add(e.from);
    touched.add(e.to);
  }
  const keptNodes = nodes.filter((n) => touched.has(n.id));

  // Every declared family of this view appears in the tally, INCLUDING the ones
  // that produced nothing. A legend that lists only what fired cannot tell the
  // reader that something did not.
  const edgeCounts = new Map<UbgEdgeType, number>();
  for (const f of def.families) edgeCounts.set(f, 0);
  for (const e of keptEdges) edgeCounts.set(e.type, (edgeCounts.get(e.type) ?? 0) + 1);

  // ── The discipline tree ───────────────────────────────────────────────────
  const perFamily = new Map<string, { discipline: Discipline; ids: string[] }>();
  let unresolvedFamilyCount = 0;
  for (const n of keptNodes) {
    const fam = familyOfNode(n, opts.families ?? null);
    const discipline = disciplineOfFamily(fam);
    if (discipline === 'unresolved') unresolvedFamilyCount++;
    // The bucket key is the family when known, and a NAMED placeholder when not —
    // never a blank string, which would collapse two unrelated unknowns into one row.
    const key = fam ?? '(family unresolved)';
    let slot = perFamily.get(key);
    if (!slot) {
      slot = { discipline, ids: [] };
      perFamily.set(key, slot);
    }
    slot.ids.push(n.id);
  }

  const byDiscipline = new Map<Discipline, FamilyBucket[]>();
  for (const [family, slot] of perFamily) {
    const row: FamilyBucket = {
      family,
      count: slot.ids.length,
      ifcClass: ifcClassLabel(family, opts.ifc ?? null),
      ids: slot.ids,
    };
    const list = byDiscipline.get(slot.discipline);
    if (list) list.push(row);
    else byDiscipline.set(slot.discipline, [row]);
  }

  const buckets: DisciplineBucket[] = [];
  for (const discipline of DISCIPLINE_ORDER) {
    const families = byDiscipline.get(discipline);
    if (!families || families.length === 0) continue;
    // Largest family first inside a discipline; ties broken by name so two runs
    // over the same model produce the same order and can be compared.
    families.sort((a, b) => b.count - a.count || a.family.localeCompare(b.family));
    buckets.push({
      discipline,
      label: DISCIPLINE_LABEL[discipline],
      basis: DISCIPLINE_BASIS[discipline],
      count: families.reduce((sum, f) => sum + f.count, 0),
      families,
    });
  }

  return {
    view,
    def,
    nodes: keptNodes,
    edges: keptEdges,
    buckets,
    undirected: new Set(UNDIRECTED_FAMILIES.filter((f) => wanted.has(f))),
    edgeCounts,
    empty: keptEdges.length === 0 ? def.emptySentence : null,
    unresolvedFamilyCount,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// §GRAPH-FOCUS-FROM-MODEL (L-8420) — "select a wall in PRYZM, see its topology"
// ═════════════════════════════════════════════════════════════════════════════
//
// ⭐ THE FOUNDER'S SECOND SENTENCE, AND IT IS NOT THE SAME REQUEST AS THE FIRST.
//
//   "The user can also select an element in the PRYZM view and the graph will
//    display all element topology relationships."
//
// The graph->3-D direction already worked (a node click dispatches on
// `selectionBus`; `InspectModeCoordinator` paints). This is the INVERSE, and it
// needs something the forward direction did not: a way to say WHICH PART of a
// 430-node graph answers "this wall's relationships".
//
// ⛔ THE ANSWER IS NOT "FILTER TO THE SELECTED IDS". A single node with no edges
// is not a relationship view; it is a dot. The answer is the node's typed
// NEIGHBOURHOOD out to a stated depth, with the depth ON THE CARD — because
// "these are the wall's relations" and "these are its relations, and theirs" are
// different claims and the reader must be told which they are looking at.
//
// ⚠ AND THE UNSELECTED REST IS NOT DELETED. `SeriesFocus`'s rule, applied to the
// graph: the neighbourhood LEADS, everything else goes dormant and stays on
// screen, so the truncation notice and every count above remain true. This
// function therefore returns a SET TO EMPHASISE, never a smaller graph.

/** What a focus request produced. Every field is a fact the card must be able to state. */
export interface NeighbourhoodFocus {
  /** The seeds that were actually found in this view. */
  readonly seeds: readonly string[];
  /**
   * ⛔ Seeds the caller asked for that this view does not contain. NOT an error
   * and NOT empty-equivalent: a wall with no projected relationship is absent
   * from the UBG entirely (it is a projection, not a census), and saying
   * "nothing found" without saying WHY would read as a broken graph.
   */
  readonly seedsNotInView: readonly string[];
  /** Node ids within `depth` hops of any seed, seeds included. */
  readonly nodeIds: ReadonlySet<string>;
  /** Edges with BOTH endpoints inside `nodeIds`, i.e. the drawn neighbourhood. */
  readonly edgeKeys: ReadonlySet<string>;
  /** How many hops were traversed. Stated on the card; never assumed to be 1. */
  readonly depth: number;
  /** Per-family tallies WITHIN the neighbourhood — "this wall bounds 3, hosts 2". */
  readonly byFamily: ReadonlyMap<UbgEdgeType, number>;
}

/** Stable key for an edge, so a focus set can name edges without object identity. */
export function edgeKey(e: UbgEdge): string {
  return `${e.from}\u0000${e.type}\u0000${e.to}`;
}

/**
 * Breadth-first neighbourhood of `seedIds` inside an already-projected view.
 *
 * ⚠ TRAVERSAL IS UNDIRECTED EVEN WHERE THE EDGE IS DIRECTED, and that is the
 * correct reading of the question. "What does this wall relate to" includes the
 * door that is `hostedIn` it — an edge that points AT the wall. Following only
 * out-edges would answer "what does this wall point at", which is a fact about
 * the adapter's iteration order, not about the building. Direction is preserved
 * in what is DRAWN; it is ignored in what is REACHED.
 *
 * ⛔ `depth` is clamped to 1..4. Not defensiveness: at depth 5 a connected
 * building graph returns nearly every node, and a focus that selects everything
 * is indistinguishable from no focus at all — the reader would believe they were
 * looking at one wall's relations.
 */
export function focusNeighbourhood(
  projection: HierarchyProjection,
  seedIds: readonly string[],
  depth = 1,
): NeighbourhoodFocus {
  const d = Math.max(1, Math.min(4, Math.floor(depth)));
  const present = new Set(projection.nodes.map((n) => n.id));

  const seeds: string[] = [];
  const missing: string[] = [];
  for (const id of seedIds) (present.has(id) ? seeds : missing).push(id);

  const reached = new Set<string>(seeds);
  let frontier: string[] = [...seeds];

  // Adjacency over the DRAWN edges only — the same rule `renderNodeLink` follows
  // for its neighbour keys. A node reachable through an edge this view does not
  // project is not reachable in this view, and pretending otherwise would light a
  // node with no visible line to it.
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string): void => {
    const list = adj.get(a);
    if (list) list.push(b);
    else adj.set(a, [b]);
  };
  for (const e of projection.edges) {
    link(e.from, e.to);
    link(e.to, e.from);
  }

  for (let hop = 0; hop < d && frontier.length > 0; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const other of adj.get(id) ?? []) {
        if (reached.has(other)) continue;
        reached.add(other);
        next.push(other);
      }
    }
    frontier = next;
  }

  const edgeKeys = new Set<string>();
  const byFamily = new Map<UbgEdgeType, number>();
  for (const e of projection.edges) {
    if (!reached.has(e.from) || !reached.has(e.to)) continue;
    edgeKeys.add(edgeKey(e));
    byFamily.set(e.type, (byFamily.get(e.type) ?? 0) + 1);
  }

  return { seeds, seedsNotInView: missing, nodeIds: reached, edgeKeys, depth: d, byFamily };
}

/**
 * The sentence the card prints beside a focus. ⭐ It states the OPERANDS, never
 * just the result — a reader who cannot decompose "14 related elements" cannot
 * check it, and this whole surface exists to be checked.
 *
 * ⛔ The "not in this view" case is a real, informative answer about the model and
 * is worded as one. A bare "0 relationships" would read as a broken dashboard;
 * "the graph holds no projected relationship touching it" is a fact about the
 * Unified Building Graph being a projection rather than a census.
 */
export function describeFocus(f: NeighbourhoodFocus, viewLabel: string): string {
  if (f.seeds.length === 0) {
    return f.seedsNotInView.length === 0
      ? 'Nothing is selected. Click an element in the 3-D viewport, or a node here, to see its relationships.'
      : `${f.seedsNotInView.length} selected element(s) have NO node in the ${viewLabel} view. The Unified ` +
          'Building Graph is a projection, not a census: a node exists only where an adapter projected a ' +
          'relationship touching it. So this means "no relationship of these families reaches this element", ' +
          'not "this element does not exist".';
  }
  const fams = [...f.byFamily.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t} ${n}`)
    .join(' · ');
  const head =
    `${f.seeds.length} selected · ${f.nodeIds.size - f.seeds.length} related element(s) within ` +
    `${f.depth} hop(s) · ${f.edgeKeys.size} relation(s) drawn`;
  const tail = fams ? ` — ${fams}.` : '.';
  const miss = f.seedsNotInView.length > 0
    ? ` ⚠ ${f.seedsNotInView.length} further selected element(s) have no node in this view.`
    : '';
  return `${head}${tail}${miss} Everything else is dimmed, not removed — every count above still covers the whole scope.`;
}
