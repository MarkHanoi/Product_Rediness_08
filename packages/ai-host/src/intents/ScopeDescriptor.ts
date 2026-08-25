// @pryzm/ai-host — ScopeDescriptor + ScopeResolution (ADR-0315 U3.1, F1).
//
// THE canonical scope representation. Before this, "what does the sentence act
// on" had three incompatible encodings (regex literals in the legacy
// QueryEngine, an 'all'|'selection' field on two intents, a CustomEvent target
// field). The language layer PARSES a descriptor; the injected editor-side
// resolver TURNS IT INTO IDS exactly once (never inside token loops); the
// semantic authority dispatches against the resolved set.
//
// PURITY: types only + one guard function. The resolver itself is editor-side
// and injected via `ResolverContext.resolveScope` — same discipline as the
// wall-type catalogue and the site provider.
//
// HONESTY CONTRACT: a resolution always reports what it SKIPPED and why, so a
// refusal or summary can say "7 found, 2 are curtain walls — nothing changed
// there" instead of silently narrowing. An unresolvable scope is an `error`,
// never an empty-ids success (§CONTEXT-DATA-HONESTY).

export type Compass4 = 'N' | 'E' | 'S' | 'W';

// ─── RAC U8.1 — FILTER scopes (predicate scopes) ─────────────────────────────
//
// A filter NARROWS a base scope; it never replaces one. "all south-facing
// windows larger than 2 m² on level 2" is ONE orientation base ∧ ONE level ∧
// ONE property predicate, and the union below encodes exactly that: a
// `filter` descriptor wraps a BASE descriptor (which already carries the
// level/room/orientation/all/selection/ids semantics U3 shipped) plus the
// predicates. Composition is therefore free — every base arm the resolver
// already honours is filterable, and no arm needed a filter-aware rewrite.
//
// Nesting is deliberately ONE level deep: `base` is a BaseScopeDescriptor, not
// a ScopeDescriptor. Two stacked filters are the same thing as one filter with
// two predicates, so a recursive form would only add ways to say the same
// sentence differently.

/** Numeric properties a filter may compare. Every one of these is a property
 *  that GENUINELY exists on (or is derived by a stated formula from) a stored
 *  record — see the accessor table in the editor-side resolver. A property a
 *  record does not carry is a SKIP with a reason, never a silent zero
 *  (§CONTEXT-DATA-HONESTY: failure and empty are the same value). */
export type FilterProperty =
  | 'area'
  | 'width'
  | 'height'
  | 'thickness'
  | 'length'
  | 'sillHeight';

export type FilterOp = 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'between';

/** How the user said the number, so refusals and summaries quote it BACK in
 *  the same unit ("300 mm", not "0.3 m"). Values themselves are always SI. */
export type FilterUnit = 'mm' | 'cm' | 'm' | 'm2';

export interface PropertyFilter {
  readonly kind: 'property';
  readonly property: FilterProperty;
  readonly op: FilterOp;
  /** Comparison value in SI (metres, or m² for `area`). */
  readonly value: number;
  /** Upper bound in SI — present iff `op === 'between'`. */
  readonly upper?: number;
  /** The unit the user spoke, for quoting back. */
  readonly unit: FilterUnit;
}

/** A system-type / catalogue-ref filter ("all interior partition walls").
 *  The id is RESOLVED at parse time through the injected catalogue — the
 *  grammar never invents a type, so an unrecognised adjective simply is not a
 *  type filter and the sentence keeps its original words. */
export interface TypeFilter {
  readonly kind: 'type';
  /** The catalogue id the ref resolved to. */
  readonly typeId: string;
  /** The catalogue's own display name, for summaries and refusals. */
  readonly label: string;
}

export type ElementFilter = PropertyFilter | TypeFilter;

/** The six scope forms U3 shipped — everything a filter can be layered onto. */
export type BaseScopeDescriptor =
  /** The live selection (the bridge injects it; kept for uniformity). */
  | { readonly kind: 'selection' }
  /** An explicit id set (follow-ups, plans). */
  | { readonly kind: 'ids'; readonly ids: readonly string[] }
  /** Every element (optionally of one kind) in the project. */
  | { readonly kind: 'all'; readonly elementKind?: string }
  /** Every element (optionally of one kind) on one level, by level query
   *  ("2", "Level 2", "ground floor") — resolved by the SAME findLevel
   *  authority the go-to-level intent uses. */
  | { readonly kind: 'level'; readonly levelQuery: string; readonly elementKind?: string }
  /** Elements in a room, by room reference (name or occupancy — the U2.2
   *  RoomStore predicates). */
  | { readonly kind: 'room'; readonly roomRef: string; readonly elementKind?: string }
  /**
   * Exterior walls facing a compass direction (θ-threaded, U2.1) — or, when
   * `elementKind` names a HOSTED OPENING, the openings cut into those walls.
   *
   * ⭐ §CHAT-ORIENTATION-HOSTED-OPENINGS (L-10946) — `elementKind` is what
   * makes "all windows in the south facade" expressible. Without it this
   * descriptor could only ever answer with WALL ids, so a window capability
   * scoped this way would have resized WALLS — which is exactly why
   * `DimensionFamilies` declared `spatialKinds: ['level','room']` and said so
   * out loud rather than claiming reach that existed only as a defect
   * (C68 §6.3-G3).
   *
   * ⛔ ABSENT still means WALLS, byte-identically to the pre-L-10946 reading, so
   * every existing caller keeps its exact previous answer. The definition of the
   * hop is inherited, not invented: **an opening faces where its host wall
   * faces** — a window has no independent facade — so the compass math, the
   * ±45° quadrant tolerance and the true-north threading all stay
   * `FacadeOrientationMath`'s, with no second constant anywhere.
   */
  | { readonly kind: 'orientation'; readonly orientation: Compass4; readonly elementKind?: string };

/** RAC U8.1 — a base scope NARROWED by predicates. */
export interface FilterScopeDescriptor {
  readonly kind: 'filter';
  readonly base: BaseScopeDescriptor;
  readonly filters: readonly ElementFilter[];
  /** The element kind the predicates are evaluated against — the resolver
   *  needs it to pick the property accessors, and `base` may not carry one
   *  (orientation is walls-only, selection carries its own kinds). */
  readonly elementKind: string;
}

export type ScopeDescriptor = BaseScopeDescriptor | FilterScopeDescriptor;

export interface ScopeSkip {
  readonly kind: string;
  readonly count: number;
  readonly reason: string;
}

export interface ScopeResolution {
  /** The resolved element ids (post-skip). */
  readonly ids: readonly string[];
  /** Element-kind → count over `ids`, for honest summaries. */
  readonly kindCounts: Readonly<Record<string, number>>;
  /** What was found but excluded, with the reason — NEVER silently dropped. */
  readonly skipped: readonly ScopeSkip[];
  /** Human-readable notes ("level 'Level 2' matched by name"). */
  readonly diagnostics: readonly string[];
  /** RAC U8.2 — per-property extrema over the records the filter actually
   *  READ, so a summary or a refusal can quote the real model back
   *  ("the thickest is 250 mm"). Absent on unfiltered scopes. */
  readonly filterStats?: readonly FilterStat[];
}

/** What a property filter measured across the base scope — the raw material
 *  for the U8.3 refusals that teach the model instead of just saying "no". */
export interface FilterStat {
  readonly property: FilterProperty;
  /** Records that carried the property (the denominator that is honest). */
  readonly considered: number;
  /** Records that did NOT carry it — also present in `skipped`. */
  readonly missing: number;
  /** SI extrema over `considered`; null when nothing carried the property. */
  readonly max: number | null;
  readonly min: number | null;
  /** A naming label for the extremum holder ("Interior – Partition"), when
   *  the record offers one. Null when it does not — never invented. */
  readonly maxLabel: string | null;
  readonly minLabel: string | null;
}

// ─── The scope union as an INTENT carries it ─────────────────────────────────
//
// Descriptors carry `elementKind`; intents do not (the capability's execution
// spec supplies it). These are the forms a grammar may produce.

export type IntentSpatialScope =
  | { readonly kind: 'level'; readonly levelQuery: string }
  | { readonly kind: 'room'; readonly roomRef: string }
  | { readonly kind: 'orientation'; readonly orientation: Compass4 };

export interface IntentFilterScope {
  readonly kind: 'filter';
  readonly base: 'all' | 'selection' | IntentSpatialScope;
  readonly filters: readonly ElementFilter[];
}

/** Everything a spec-driven capability's `scope` field may be. */
export type IntentScope = 'all' | 'selection' | IntentSpatialScope | IntentFilterScope;

/** An unresolvable scope: the reason is user-facing refusal copy. */
export interface ScopeError {
  readonly error: string;
}

export type ScopeResult = ScopeResolution | ScopeError;

export function isScopeError(r: ScopeResult): r is ScopeError {
  return 'error' in r;
}
