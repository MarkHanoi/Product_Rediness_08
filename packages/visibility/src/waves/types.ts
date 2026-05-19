// Visibility-Intent waves — shared type surface (S46 D1, extended at S49/S53).
//
// Spec source:
//   • `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S46 lines 524-547 —
//     wave canonical pattern + literal-preservation rule (waves 1-5).
//   • `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md` §S53 lines 516-582 —
//     waves 6-11 user-discretion contract (filter overrides, temporary
//     isolation, hide-element, view-state, ghost layer).
//   • `phases/PHASE-3A-Q1-M25-M27-VI-AI-ELEMENT-CREATOR.md` §1.2 lines 60-218 —
//     waves 6-11 BIM-composition contract (phase filter, design options).
//   • SPEC-30 §6 — full 11-wave system; literal preservation, not redesign.
//
// Per SPEC-30 §6 ("literal preservation, not redesign"), each wave is a
// PURE function of `(ctx) => result`.  The chain in `index.ts` runs the 11
// waves left-to-right; the first wave that returns `{ visible: false }`
// short-circuits the rest.  Ordering matches PRYZM 1 verbatim — that
// codebase encoded 7 years of edge-case fixes via the short-circuit
// ordering, and the parity tests are the ground truth.
//
// PURE: no DOM, no THREE, no transport.

/** A single element under visibility evaluation.  The wave functions read
 *  from this struct; they do NOT mutate it. */
export interface VisibilityElement {
  readonly id: string;
  /** Architectural category — `'wall'`, `'door'`, `'opening'`, etc.  Stable
   *  string, matches the legacy PRYZM 1 category taxonomy. */
  readonly category: string;
  /** The level this element belongs to.  `'__root__'` for the
   *  unleveled / project-root pseudo-level. */
  readonly levelId: string;
  /** Per-element category-VG override; null = inherit from view template. */
  readonly categoryOverride?: 'show' | 'hide' | 'halftone' | null;
  /** When this element is a wall, the IDs of openings cut into it.  Used by
   *  wave-5 (opening culling) to suppress the opening when the host wall is
   *  hidden.  Empty array for non-walls. */
  readonly openings?: readonly string[];
  /** When this element is an opening (door / window), the host wall ID.
   *  Used by wave-5 to look up host visibility in O(1).  Null for non-openings. */
  readonly hostWallId?: string | null;
  /** When this element is a wall-end-join cap (a small geometry produced by
   *  the wall mitring pass), the ID of the parent wall.  Used by wave-4
   *  to inherit the parent wall's visibility verbatim. */
  readonly parentWallId?: string | null;

  // ─── Wave 6-11 element-side inputs (S49 / S53) ───────────────────────────

  /** Wave-7 (phase filter): the phase this element was created in.  `null`
   *  means "not phased" — wave-7 passes through. */
  readonly createdInPhase?: string | null;
  /** Wave-7 (phase filter): the phase this element was demolished in.
   *  `null` means "still standing". */
  readonly demolishedInPhase?: string | null;
  /** Wave-10 (design-option): the design-option set this element belongs
   *  to.  `null` means "main / always-on" (always visible regardless of
   *  active option). */
  readonly designOptionId?: string | null;
  /** Wave-11 (ghost layer): when true, this element is currently being
   *  edited by another peer (CRDT pending) — the ghost layer wave will
   *  halftone it so the local user can see it without confusion. */
  readonly pendingPeerEdit?: boolean;
}

/** A single view under visibility evaluation. */
export interface VisibilityView {
  readonly id: string;
  /** Levels this view should render.  Wave-1 short-circuits when the
   *  element's level is not in this set (and `unlevelScoped` is false). */
  readonly visibleLevels: ReadonlySet<string>;
  /** When true, wave-1 always passes — the view is unbounded by level scope.
   *  Used by 3D views, schedule views, and reflected-ceiling-plan-3D. */
  readonly unlevelScoped: boolean;
  /** Per-category visibility override at the view level (wave-2).  When a
   *  category is in this set with `'hide'`, every element in that category
   *  is hidden in this view (unless the element carries an explicit
   *  `categoryOverride` of 'show'; see wave-2 for the precedence). */
  readonly categoryVisibility: ReadonlyMap<string, 'show' | 'hide' | 'halftone'>;
  /** The view template this view inherits from.  Wave-3 walks
   *  `template -> template.parent -> ...` until a value is found for a
   *  category, applying the same precedence as PRYZM 1. */
  readonly viewTemplate?: VisibilityViewTemplate | null;

  // ─── Wave 6-11 view-side inputs (S49 / S53) ──────────────────────────────

  /** Wave-6 (filter overrides): saved view filters that decide visibility
   *  on element attributes (e.g. R-value, fire rating).  Each filter is
   *  evaluated by the wave; the first matching filter wins.  Empty array
   *  means "no filters" — wave-6 passes through. */
  readonly filterOverrides?: readonly ViewFilterOverride[];
  /** Wave-7 (phase filter): the active phase + filter mode for this view.
   *  When `null`, wave-7 passes through (no phasing in this view). */
  readonly phaseState?: PhaseFilterState | null;
  /** Wave-8 (temporary isolation): when active, only the elements in
   *  `set` are visible; everything else is hidden.  Per-view, not
   *  per-project. */
  readonly temporaryIsolation?: TemporaryIsolationState | null;
  /** Wave-9 (hide-element): per-view explicit element hide list — the
   *  PRYZM 1 "Hide in View" gesture.  Empty / undefined means no hides. */
  readonly hiddenElementIds?: ReadonlySet<string>;
  /** Wave-10 (design-option): which design options are active in this
   *  view.  Elements with `designOptionId` not in this set are hidden;
   *  `designOptionId === null` (main model) is always visible.  When
   *  this set is undefined, the wave passes through (design-options not
   *  configured for this view). */
  readonly activeDesignOptions?: ReadonlySet<string>;
  /** Wave-11 (ghost layer): when true, the ghost layer is enabled in
   *  this view; pending peer-edit elements halftone instead of hiding.
   *  When false / undefined, no ghost layer (peer-edits render as
   *  normal). */
  readonly ghostLayerActive?: boolean;
}

/** A view template — recursively chained per `parent`. */
export interface VisibilityViewTemplate {
  readonly id: string;
  readonly categoryVisibility: ReadonlyMap<string, 'show' | 'hide' | 'halftone'>;
  readonly parent?: VisibilityViewTemplate | null;
}

// ─── Wave 6-11 nested types ────────────────────────────────────────────────

/** Wave-6 filter override.  Saved per-view filter rule.
 *
 *  Verbatim from PRYZM 1 "View Filters" panel: a rule has a name, a
 *  predicate (function of element + view), and a verb (`hide`, `show`,
 *  `halftone`).  The predicate is supplied as a pure function so the
 *  wave can stay pure — no expression-language interpreter inside the
 *  wave.  PRYZM 1 stored predicates as JSON expression trees; the
 *  caller (`packages/view-filters/`) compiles those JSON trees to
 *  pure functions before handing them to the wave. */
export interface ViewFilterOverride {
  readonly id: string;
  readonly name: string;
  readonly verb: 'show' | 'hide' | 'halftone';
  /** Pure predicate.  Wave-6 invokes this for each element; the first
   *  matching filter wins.  PURE: no DOM / THREE / I/O. */
  readonly matches: (element: VisibilityElement) => boolean;
}

/** Wave-7 phase filter state.
 *
 *  Per VI-AI-ELEMENT-CREATOR §1.2 lines 113-145.  PRYZM 1 / Revit
 *  phase semantics: an element exists from `createdInPhase` until
 *  `demolishedInPhase`.  The view's `mode` decides which slice to
 *  show. */
export interface PhaseFilterState {
  /** The phase the user is currently viewing (e.g. `'Phase 2 — 2026'`). */
  readonly activePhase: string;
  /** The total ordering of phases — the wave needs this to know
   *  whether `createdInPhase` is "before" the active phase.  PRYZM 1
   *  used insertion order; we model that explicitly so the wave is
   *  pure. */
  readonly phaseOrder: readonly string[];
  /** Filter mode.  Verbatim PRYZM 1:
   *   - `'show-all'`: every element existing in or before active phase
   *     is shown; demolished-in-active-phase shown halftoned.
   *   - `'show-new'`: only elements `createdInPhase === activePhase`.
   *   - `'show-existing'`: only elements `createdInPhase < activePhase
   *     && !demolishedInPhase`.
   *   - `'show-demolished'`: only elements `demolishedInPhase ===
   *     activePhase`.
   *   - `'show-temporary'`: only elements created AND demolished in
   *     the active phase. */
  readonly mode:
    | 'show-all'
    | 'show-new'
    | 'show-existing'
    | 'show-demolished'
    | 'show-temporary';
}

/** Wave-8 temporary isolation state. */
export interface TemporaryIsolationState {
  readonly active: boolean;
  /** When `active`, only the IDs in this set are visible. */
  readonly elementIds: ReadonlySet<string>;
}

/** The context object passed to every wave.  Includes side tables that
 *  later waves may reference (e.g. wave-5 needs to know whether the host
 *  wall is visible). */
export interface VisibilityWaveContext {
  readonly element: VisibilityElement;
  readonly activeView: VisibilityView;
  /** Per-element visibility predicate that other waves have already
   *  decided.  Wave-5 uses this to read "is the host wall visible right
   *  now under waves 1-4 only".  Implementation note: the chain runner
   *  populates this lazily — wave-N reads only entries from waves < N,
   *  and the runner asserts no forward references. */
  readonly resolvedVisibility: ReadonlyMap<string, boolean>;
}

/** The result of a single wave.  `visible: false` short-circuits the rest;
 *  `visible: true` continues; `halftone: true` is carried through to the
 *  renderer (PRYZM 1 paints halftoned elements at 30 % alpha). */
export interface VisibilityResult {
  readonly visible: boolean;
  readonly halftone?: boolean;
  /** Optional reason string for OTel trace spans + debug overlays.  Should
   *  match `pryzm.visibility.wave.<n>.reason` per spec line 568 ("OTel spans
   *  pryzm.visibility.wave.{n} visible"). */
  readonly reason?: string;
}

/** The wave function shape.  Pure `(ctx) => result`, no I/O. */
export type WaveFn = (ctx: VisibilityWaveContext) => VisibilityResult;

/** Chain-running helper — folds a left-to-right sequence of waves over a
 *  single (element, view) pair.  Stops at the first `{ visible: false }`.
 *
 *  Returns the final `VisibilityResult` along with the per-wave verdict
 *  array (every wave that ran, in order).  The verdict array is consumed
 *  by the OTel span helper (`spanForChain`) so each wave can be timed
 *  individually; in production the verdict array is dropped. */
export interface ChainResult {
  readonly result: VisibilityResult;
  readonly verdicts: readonly { readonly waveId: string; readonly result: VisibilityResult }[];
}

export interface NamedWave {
  readonly id: string;
  readonly fn: WaveFn;
}
