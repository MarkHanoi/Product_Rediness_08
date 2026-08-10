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

export type ScopeDescriptor =
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
  /** Exterior walls facing a compass direction (θ-threaded, U2.1). */
  | { readonly kind: 'orientation'; readonly orientation: Compass4 };

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
}

/** An unresolvable scope: the reason is user-facing refusal copy. */
export interface ScopeError {
  readonly error: string;
}

export type ScopeResult = ScopeResolution | ScopeError;

export function isScopeError(r: ScopeResult): r is ScopeError {
  return 'error' in r;
}
