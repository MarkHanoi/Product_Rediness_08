/**
 * analysisLayout — the user's widget arrangement, and where it lives.
 *
 * Layer Affected:  UI — Analysis surface (L7)
 * File:            apps/editor/src/ui/analysis/analysisLayout.ts
 * ADR:             ADR-0343 §D.3 (layouts are project content)
 * SPEC:            SPEC-ANALYSIS-SURFACE-AND-WIDGETS §7
 * Issue log:       L-3006 (this module) · L-3007 (the snapshot leg, NOT DONE)
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⚠ WHERE THIS PERSISTS TODAY, AND WHY THAT IS NOT WHERE THE SPEC SAYS
 * ═════════════════════════════════════════════════════════════════════════════
 * SPEC §7 is explicit: *"Layouts are project content, not chrome: they persist
 * in the `.pryzm` snapshot (C05), NOT `localStorage`."* And it is right — a
 * dashboard the founder arranged should survive a machine change and travel with
 * the file.
 *
 * ⛔ IT PERSISTS TO `localStorage` TODAY, KEYED BY PROJECT ID. Stated plainly,
 * because a persistence claim the code cannot honour is the same defect class as
 * an invented number (the ruling lane DATA1 recorded for the 5D rate book).
 *
 * The reason is MEASURED, not a shortcut. The snapshot has two legs: the write
 * leg in `packages/persistence-client/src/loader/ProjectSerializer.ts` and the
 * READ leg in `.../ProjectLoader.ts:1118` (that is where `semanticTags` is
 * rehydrated — the shape this field would copy). `ProjectLoader.ts` is owned by
 * a concurrent lane this session, and a half-wired field — written on save,
 * dropped on load — is strictly worse than a browser-local one: it looks
 * persistent and silently is not.
 *
 * So: browser-local, SAID SO ON THE SURFACE'S OWN FACE, and shaped for the move.
 * `serialize()` / `hydrate()` below are exactly the two calls the snapshot legs
 * need; moving home is wiring those two into the serializer and the loader, and
 * changing nothing here. L-3007 tracks it.
 *
 * ⛔ A layout referencing a widget kind this build does not know is NEVER
 * silently dropped (SPEC §7) — a dropped widget is a lost decision. It is kept
 * in the stored list and rendered as a named placeholder.
 *
 * L7 file. No THREE (P2), no rAF (P3), no `(window as any)` (P4), no store
 * writes (P6), one OTel span per exported function (P8).
 */

import { withHandlerSpan } from '@pryzm/plugin-sdk';

import { ANALYSIS_TABS, type AnalysisTabId } from './AnalysisTypes';
import { DEFAULT_TAB_LAYOUT, WIDGET_CATALOGUE, widgetById } from './widgetCatalogue';

const LS_PREFIX = 'pryzm.analysis.layout.';

export interface AnalysisLayout {
  readonly version: 2;
  /** Widget ids in render order, PER TAB. May contain ids this build does not know. */
  readonly tabs: Readonly<Record<AnalysisTabId, readonly string[]>>;
  /** The tab the user was last on. Restored on reopen. */
  readonly activeTab: AnalysisTabId;
  /**
   * The widget ids THE CATALOGUE HELD when this arrangement was written.
   * §ANALYSIS-STORED-ARRANGEMENT-VS-GROWN-CATALOGUE (L-9000).
   *
   * ⭐ THIS FIELD EXISTS TO SEPARATE TWO FACTS THAT WERE ONE STORED VALUE.
   * `tabs` records which widgets are placed. It cannot say WHY a widget is
   * absent, and there are two completely different reasons:
   *
   *   A. the user REMOVED it            -> must stay removed, forever (rule B);
   *   B. it DID NOT EXIST when they     -> they never had the chance to decide,
   *      arranged this dashboard           and hiding it is a silent defect.
   *
   * Absent from `knownWidgets` and absent from `tabs` = case B, by construction:
   * a widget the catalogue did not contain cannot have been removed from a
   * picker that never listed it. Present in `knownWidgets` and absent from
   * `tabs` = case A, and it is left alone.
   *
   * ⚠ `undefined` is a THIRD answer and is NOT the empty set: it means this
   * arrangement predates the field, so NEITHER case can be established for any
   * widget. That state is reconciled by ASKING (see {@link LayoutReconciliation}),
   * never by guessing — guessing case B would resurrect widgets the user deleted,
   * and guessing case A would hide every widget shipped since.
   *
   * ⛔ It is DERIVED FROM THE LIVE CATALOGUE ON EVERY SAVE, never hand-maintained
   * and never a version number a human must remember to bump. A stamp somebody
   * has to remember is the same class of mechanism as a gate that classifies by
   * NAME: it is satisfied by forgetting.
   */
  readonly knownWidgets?: readonly string[];
}

/** The shape written by builds before §ANALYSIS-TABS. Read-only, never written. */
interface AnalysisLayoutV1 {
  readonly version: 1;
  readonly widgets: readonly string[];
}

/**
 * What comes back off `localStorage` or a snapshot: UNTRUSTED JSON that may be
 * either version, or neither.
 *
 * ⛔ NOT `Partial<AnalysisLayout & AnalysisLayoutV1>`. That intersects
 * `version: 2` with `version: 1`, which is `never`, which makes the whole
 * object `never` — so every field read off it is an error and, worse, a
 * narrowing that LOOKED like it typed the parse actually typed nothing. Every
 * field here is `unknown` because that is what a JSON.parse result is, and it
 * forces the checks below to be real ones.
 */
interface StoredLayoutShape {
  version?: unknown;
  widgets?: unknown;
  tabs?: unknown;
  activeTab?: unknown;
  /** §ANALYSIS-STORED-ARRANGEMENT-VS-GROWN-CATALOGUE (L-9000). `unknown` like the
   *  rest: absent and "not an array" are both answered as `undefined` by the
   *  readers, which is the legacy signal — never `[]`. */
  knownWidgets?: unknown;
  /** §ANALYSIS-FOLD-STATE (L-12063). See {@link foldOpen}. */
  folds?: unknown;
}

/** Every widget id this build's catalogue holds. Derived; never hand-maintained. */
function catalogueIds(): string[] {
  return WIDGET_CATALOGUE.map((w) => w.id);
}

function defaults(): AnalysisLayout {
  const tabs = {} as Record<AnalysisTabId, readonly string[]>;
  for (const t of ANALYSIS_TABS) tabs[t.id] = [...DEFAULT_TAB_LAYOUT[t.id]];
  return { version: 2, tabs, activeTab: 'overview', knownWidgets: catalogueIds() };
}

/**
 * Migrate a v1 flat arrangement into tabs. §ANALYSIS-TABS (L-3304).
 *
 * ⛔ NOTHING IS DROPPED, including ids this build has no widget for — the rule
 * this module already carried ("a dropped widget is a lost decision") does not
 * get weaker because the container changed shape. A known id goes to its
 * catalogue tab; an UNKNOWN id cannot be placed by lookup, so it goes to
 * `overview` and renders there as a named placeholder. Putting it nowhere would
 * silently discard an arrangement the user made, which is the one outcome this
 * function exists to prevent.
 *
 * ⚠ A v1 layout cannot express which tab was active, so the migration lands on
 * `overview`. That is a real answer, not a guess about the user's intent.
 */
export function migrateV1(v1: AnalysisLayoutV1): AnalysisLayout {
  const tabs = {} as Record<AnalysisTabId, string[]>;
  for (const t of ANALYSIS_TABS) tabs[t.id] = [];
  for (const id of v1.widgets) {
    const def = widgetById(id);
    (tabs[def?.tab ?? 'overview'] ??= []).push(id);
  }
  return { version: 2, tabs, activeTab: 'overview' };
}


// =============================================================================
// §ANALYSIS-STORED-ARRANGEMENT-VS-GROWN-CATALOGUE (L-9000 … L-9004)
// =============================================================================
//
// ⭐ THE DEFECT THIS SECTION EXISTS FOR, AND IT WAS SYSTEMIC, NOT LOCAL.
//
// The founder opened Analysis -> Relationships and could not find the graph that
// had just shipped. His tab header read "Relationships 1" and rendered only
// `relationship-coverage`. Nothing was broken in the graph; nothing was broken in
// the catalogue. He had ARRANGED that tab before the graph existed, so his stored
// list was `relationships: ['relationship-coverage']`, and `loadLayout` treated a
// stored array as the whole truth.
//
// ⛔ THE CODE THAT HID IT WAS GOOD CODE AND ITS COMMENT WAS RIGHT. It reads:
// "an empty stored array is a REAL arrangement ... `undefined` is the different
// answer 'this tab was never stored', which happens when a build adds a TAB".
// Every word of that is true. It reasons about a NEW TAB and it does not reason
// about a NEW WIDGET IN AN EXISTING TAB, and that is the entire gap.
//
// ⛔ AND THE BLAST RADIUS WAS NOT ONE WIDGET. Under the old rule, EVERY widget
// EVERY lane adds from now on is invisible to EVERY existing user, on every
// project, with no error, no empty state and no log line — while the catalogue
// entry looks live to whoever wrote it. That is why this is fixed in the layout
// module rather than by special-casing one id.
//
// ⭐ THE SHAPE OF THE BUG IS THE ONE THIS REPOSITORY KEEPS PAYING FOR: ONE STORED
// VALUE CARRYING TWO OPPOSITE MEANINGS. "absent from `tabs`" meant both "the user
// removed this" and "this did not exist yet" — the same defect as `-` meaning
// both "unused" and "unnameable", and "Not assigned to a storey" meaning both
// "has none" and "we did not ask". The fix is never a better guess; it is
// recording the second fact, which is what `knownWidgets` does.

/** What {@link reconcileLayout} could and could not establish. */
export interface LayoutReconciliation {
  /** The layout to render. Identical to the input unless `autoPlaced` is non-empty. */
  readonly layout: AnalysisLayout;
  /**
   * Widgets PLACED by this pass because they post-date the stored arrangement.
   * ⭐ Safe by construction: a widget the catalogue did not contain cannot have
   * been removed from a picker that never listed it, so placing it cannot
   * overturn a decision the user made.
   */
  readonly autoPlaced: readonly string[];
  /**
   * ⛔ Widgets this build has that the arrangement does not place, and whose
   * absence CANNOT be classified because the arrangement predates
   * `knownWidgets`. Neither auto-placed nor hidden — the surface ASKS.
   */
  readonly unreconciled: readonly string[];
  /** True ⇒ the stored arrangement carries no `knownWidgets` record. */
  readonly legacy: boolean;
}

/**
 * Reconcile a stored arrangement with a catalogue that has grown since.
 *
 * PURE and IDEMPOTENT: running it on its own output places nothing further and
 * reports the same `unreconciled` set, which is what lets the surface call it
 * whenever it needs the notice without fear of a second placement.
 *
 * ⛔ RULE B IS PRESERVED BY CONSTRUCTION, NOT BY A CHECK. A widget listed in
 * `knownWidgets` but absent from `tabs` is a widget the user removed on purpose.
 * It is never in `autoPlaced` and never in `unreconciled`; nothing in this
 * function can put it back. That is not up for negotiation and it is why the
 * membership test is against `knownWidgets` rather than against the catalogue.
 *
 * ⚠ THE LEGACY CASE IS ANSWERED BY ASKING, AND THE REASONING IS WORTH KEEPING.
 * When `knownWidgets` is absent, both facts are unavailable for every widget, so
 * either guess is wrong for somebody:
 *   · guessing "new" resurrects widgets the user deliberately deleted;
 *   · guessing "removed" hides every widget shipped since they last arranged,
 *     which is the defect being fixed, permanently and silently.
 * The asymmetry is real — an unwanted widget costs one click to remove and is
 * VISIBLE, whereas a hidden one is unrecoverable because the user cannot miss
 * what they cannot see — but "MUST stay removed" is a hard rule, so this function
 * refuses to decide and hands the decision to the person who owns it. The prompt
 * is a ONE-TIME migration artefact: the moment they answer, `knownWidgets` is
 * recorded and every future widget places itself with no prompt at all.
 */
export function reconcileLayout(stored: AnalysisLayout): LayoutReconciliation {
  const catalogue = catalogueIds();
  const placed = new Set(ANALYSIS_TABS.flatMap((t) => stored.tabs[t.id]));

  // ⚠ The LEGACY discriminator is the PRESENCE of the field, never a version
  // number. A number would be a second way of saying the same thing, and two
  // ways of saying one thing is how they come to disagree.
  if (stored.knownWidgets === undefined) {
    return {
      layout: stored,
      autoPlaced: [],
      unreconciled: catalogue.filter((id) => !placed.has(id)),
      legacy: true,
    };
  }

  const known = new Set(stored.knownWidgets);
  const newSinceStored = catalogue.filter((id) => !known.has(id) && !placed.has(id));
  if (newSinceStored.length === 0) {
    return { layout: stored, autoPlaced: [], unreconciled: [], legacy: false };
  }

  // Each new widget lands on ITS OWN catalogue tab — the same placement rule a
  // fresh default arrangement uses — appended, so nothing the user ordered moves.
  const tabs = {} as Record<AnalysisTabId, readonly string[]>;
  for (const t of ANALYSIS_TABS) tabs[t.id] = [...stored.tabs[t.id]];
  for (const id of newSinceStored) {
    const tab = widgetById(id)?.tab ?? 'overview';
    tabs[tab] = [...tabs[tab], id];
  }

  return {
    layout: { ...stored, tabs, knownWidgets: catalogue },
    autoPlaced: newSinceStored,
    unreconciled: [],
    legacy: false,
  };
}

/**
 * Answer the legacy question with "these were deliberate" — adopt the current
 * catalogue as the known set WITHOUT placing anything.
 *
 * ⛔ It changes `knownWidgets` and NOTHING else. Every tab list is untouched, so
 * the user's arrangement survives verbatim; all that is recorded is that they
 * have now SEEN this catalogue and decided.
 */
export function adoptCatalogueAsKnown(layout: AnalysisLayout): AnalysisLayout {
  return { ...layout, knownWidgets: catalogueIds() };
}

function keyFor(projectId: string | null): string {
  return LS_PREFIX + (projectId ?? 'unscoped');
}

// =============================================================================
// §ANALYSIS-FOLD-STATE (L-12063) — which note blocks the reader has folded away
// =============================================================================
//
// ⭐ THE FOUNDER ASKED FOR FOLDABLE NOTE BLOCKS AND FOR THE FOLD TO STICK. The
// surface already tells him, in its own status line, *"Arrangement saved in this
// browser (L-3007)"* — so a fold that forgot itself on the next render would be a
// visible contradiction of a promise printed six pixels away. C84 EI-9: reuse the
// mechanism, do not mint a second one.
//
// ⛔ FOLDS ARE A SIBLING FIELD OF THE STORED RECORD, NOT A FIELD OF `AnalysisLayout`,
// AND THAT IS THE WHOLE DESIGN. `AnalysisSurface` holds ONE long-lived
// `this._layout` object loaded at `_show()` and writes it back on a tab switch, an
// add and a remove. A fold toggled from inside a card between two of those writes
// would be silently CLOBBERED by the stale in-memory copy on the next save — the
// classic two-writers-one-document defect. Keeping folds out of the layout object
// makes that unrepresentable: nothing but the two functions below ever writes them,
// and `saveLayout` carries the stored value forward untouched.
//
// ⚠ ONE STORAGE KEY, project-scoped exactly like the arrangement. A fold is a
// statement about a project's dashboard, so a project switch must not carry it.

/** The stored fold map, or `{}`. Never throws; unreadable storage is "nothing folded". */
function readFolds(projectId: string | null): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(keyFor(projectId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredLayoutShape;
    const f = parsed.folds;
    if (f == null || typeof f !== 'object' || Array.isArray(f)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(f as Record<string, unknown>)) {
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Is fold `id` open? `dflt` answers when the reader has never touched it.
 *
 * ⛔ `dflt` IS NOT A FALLBACK FOR AN ERROR. "the reader folded this shut" and
 * "the reader has never seen this fold" are different facts and only the second
 * one takes the default — §CONTEXT-DATA-HONESTY applied to a preference. A reader
 * who deliberately OPENED a block that ships collapsed must find it open next time,
 * and a `?? dflt` over a boolean that can legitimately be `false` would erase
 * exactly that. Hence the explicit `undefined` test.
 */
export function foldOpen(id: string, dflt: boolean, projectId: string | null = currentProjectId()): boolean {
  return withHandlerSpan('pryzm.analysis.layout.fold_read', { 'pryzm.surface': 'analysis' }, () => {
    const v = readFolds(projectId)[id];
    return v === undefined ? dflt : v;
  });
}

/**
 * Record fold `id`'s state. Returns whether it was written.
 *
 * ⚠ READ-MERGE-WRITE against the LIVE record, never against a cached one: another
 * card on the same tab may have toggled its own fold since this one rendered.
 */
export function setFoldOpen(id: string, open: boolean, projectId: string | null = currentProjectId()): boolean {
  return withHandlerSpan(
    'pryzm.analysis.layout.fold_write',
    { 'pryzm.surface': 'analysis', 'pryzm.analysis.fold': id, 'pryzm.analysis.fold_open': open },
    () => {
      try {
        const raw = localStorage.getItem(keyFor(projectId));
        const record = (raw ? (JSON.parse(raw) as StoredLayoutShape) : {}) as Record<string, unknown>;
        record.folds = { ...readFolds(projectId), [id]: open };
        localStorage.setItem(keyFor(projectId), JSON.stringify(record));
        return true;
      } catch (e) {
        console.warn('[analysis] the fold state could not be saved in this browser:', e);
        return false;
      }
    },
  );
}

/** Test seam — drop every fold for a project. */
export function _clearFoldsForTest(projectId: string | null = currentProjectId()): void {
  try {
    const raw = localStorage.getItem(keyFor(projectId));
    if (!raw) return;
    const record = JSON.parse(raw) as Record<string, unknown>;
    delete record.folds;
    localStorage.setItem(keyFor(projectId), JSON.stringify(record));
  } catch { /* §SWALLOW-TEST-SEAM — a seam that cannot clear leaves the default, which is the state under test anyway */ }
}

/** The live project id, or `null`. Read-only; never asserts a project exists. */
export function currentProjectId(): string | null {
  const ctx = window.projectContext as { projectId?: string } | undefined;
  return typeof ctx?.projectId === 'string' && ctx.projectId.length > 0 ? ctx.projectId : null;
}

/**
 * Load the layout for a project. Falls back to the default arrangement — which
 * is a real answer ("you have not arranged one"), not an error.
 */
export function loadLayout(projectId: string | null = currentProjectId()): AnalysisLayout {
  return withHandlerSpan('pryzm.analysis.layout.load', { 'pryzm.surface': 'analysis' }, () => {
    try {
      const raw = localStorage.getItem(keyFor(projectId));
      if (!raw) return defaults();
      const parsed = JSON.parse(raw) as StoredLayoutShape;

      // A v1 arrangement in storage is the COMMON case on the first run after
      // this change, not an edge case — every existing user has one.
      if (Array.isArray(parsed.widgets)) {
        return migrateV1({
          version: 1,
          widgets: (parsed.widgets as unknown[]).filter((w): w is string => typeof w === 'string'),
        });
      }

      const stored = parsed.tabs as Record<string, unknown> | null | undefined;
      if (stored == null || typeof stored !== 'object') return defaults();
      const tabs = {} as Record<AnalysisTabId, readonly string[]>;
      for (const t of ANALYSIS_TABS) {
        const list = stored[t.id];
        // ⛔ An empty stored array is a REAL arrangement — the user removed every
        // widget from that tab — and must not silently become the default again.
        // `undefined` is the different answer "this tab was never stored", which
        // happens when a build adds a tab, and THAT takes the default.
        tabs[t.id] = Array.isArray(list)
          ? list.filter((w): w is string => typeof w === 'string')
          : [...DEFAULT_TAB_LAYOUT[t.id]];
      }
      const active = ANALYSIS_TABS.some((t) => t.id === parsed.activeTab)
        ? (parsed.activeTab as AnalysisTabId)
        : 'overview';
      // ⛔ `knownWidgets` is read as UNTRUSTED JSON and an absent/!array value
      // stays `undefined` — it must NOT collapse to `[]`. Empty means "the
      // catalogue held nothing", which would make every widget look new;
      // `undefined` means "this arrangement predates the record", which is the
      // case that gets ASKED about. Merging them would auto-place every widget
      // into every legacy arrangement and overturn real removals.
      const knownWidgets = Array.isArray(parsed.knownWidgets)
        ? (parsed.knownWidgets as unknown[]).filter((w): w is string => typeof w === 'string')
        : undefined;

      // §ANALYSIS-STORED-ARRANGEMENT-VS-GROWN-CATALOGUE (L-9000) — a widget that
      // post-dates this arrangement is PLACED here. ⚠ Reconciling on READ and not
      // writing back is deliberate: a read that silently rewrote the user's stored
      // arrangement would make opening a dashboard a mutation, and would do it on
      // a path with no undo. The stamp lands on the next real save.
      return reconcileLayout(
        knownWidgets === undefined
          ? { version: 2, tabs, activeTab: active }
          : { version: 2, tabs, activeTab: active, knownWidgets },
      ).layout;
    } catch {
      return defaults();
    }
  });
}

/** The default arrangement, for the surface's reset action. */
export function defaultLayout(): AnalysisLayout {
  return defaults();
}

/** Persist a layout. Failure is reported, never swallowed into a false success. */
export function saveLayout(layout: AnalysisLayout, projectId: string | null = currentProjectId()): boolean {
  return withHandlerSpan(
    'pryzm.analysis.layout.save',
    {
      'pryzm.surface': 'analysis',
      'pryzm.analysis.widgets': ANALYSIS_TABS.reduce((n, t) => n + layout.tabs[t.id].length, 0),
      'pryzm.analysis.active_tab': layout.activeTab,
    },
    () => {
      try {
        // ⭐ THE STAMP IS REFRESHED FROM THE LIVE CATALOGUE ON EVERY SAVE, so no
        // human has to remember to bump anything — a stamp somebody must remember
        // is satisfied by forgetting.
        //
        // ⛔ BUT A LEGACY ARRANGEMENT IS NOT ADOPTED HERE, AND THIS GUARD IS THE
        // WHOLE POINT. The first draft of this line stamped unconditionally, which
        // meant ANY unrelated save — reordering a card on Overview, switching the
        // active tab — would silently record "the user has seen this catalogue"
        // and the outstanding question would vanish without ever being asked. That
        // is the invisible-widget defect all over again, one indirection further
        // back. Legacy stays legacy until the person answers, and the only two
        // ways out are both explicit: `adoptCatalogueAsKnown()` (the "I removed
        // these on purpose" control) or a reset to `defaults()`.
        const stamped: AnalysisLayout =
          layout.knownWidgets === undefined ? layout : { ...layout, knownWidgets: catalogueIds() };
        // §ANALYSIS-FOLD-STATE (L-12063). ⛔ CARRY THE STORED FOLDS FORWARD. They
        // are a sibling field of the record and are NOT part of `AnalysisLayout`
        // (see that section's header): the surface holds one long-lived layout
        // object and writes it back on tab switches, so serialising `stamped`
        // alone would silently delete every fold the reader had set since the
        // object was loaded. This line is the whole reason folds are safe to write
        // from inside a card.
        const folds = readFolds(projectId);
        const record =
          Object.keys(folds).length > 0 ? { ...stamped, folds } : { ...stamped };
        localStorage.setItem(keyFor(projectId), JSON.stringify(record));
        return true;
      } catch (e) {
        console.warn('[analysis] the layout could not be saved in this browser:', e);
        return false;
      }
    },
  );
}

/**
 * Serialise for the `.pryzm` snapshot. ⚠ NOT CALLED BY ANYTHING TODAY — this is
 * the seam L-3007 will wire into `ProjectSerializer`, and it exists now so the
 * move is two call sites rather than a rewrite.
 */
export function serialize(projectId: string | null = currentProjectId()): AnalysisLayout {
  return withHandlerSpan('pryzm.analysis.layout.serialize', { 'pryzm.surface': 'analysis' }, () =>
    loadLayout(projectId),
  );
}

/** Rehydrate from a snapshot. ⚠ The other half of the L-3007 seam. */
export function hydrate(data: unknown, projectId: string | null = currentProjectId()): boolean {
  return withHandlerSpan('pryzm.analysis.layout.hydrate', { 'pryzm.surface': 'analysis' }, () => {
    const d = data as StoredLayoutShape | null | undefined;
    if (!d) return false;
    // Accepts BOTH shapes: a snapshot written by an older build carries v1.
    if (Array.isArray(d.widgets)) {
      return saveLayout(migrateV1({ version: 1, widgets: (d.widgets as unknown[]).filter((w): w is string => typeof w === 'string') }), projectId);
    }
    const dt = d.tabs as Record<string, unknown> | null | undefined;
    if (dt == null || typeof dt !== 'object') return false;
    const tabs = {} as Record<AnalysisTabId, readonly string[]>;
    for (const t of ANALYSIS_TABS) {
      const list = dt[t.id];
      tabs[t.id] = Array.isArray(list) ? list.filter((w): w is string => typeof w === 'string') : [...DEFAULT_TAB_LAYOUT[t.id]];
    }
    const active = ANALYSIS_TABS.some((t) => t.id === d.activeTab) ? (d.activeTab as AnalysisTabId) : 'overview';
    // ⛔ THE SECOND SITE, AND IT IS NOT A COPY-PASTE TIDY-UP. The escalation named
    // only `loadLayout`; this leg carried the IDENTICAL defect. It is dead today
    // (L-3007 — nothing calls `hydrate` yet), so fixing only the reachable one
    // would have left a dormant copy of the bug to re-mint itself on the day the
    // snapshot legs are wired, in a build where nobody would connect the two.
    // A snapshot written by an older build has no `knownWidgets`, which is
    // exactly the legacy case, and it is answered the same way.
    const knownWidgets = Array.isArray(d.knownWidgets)
      ? (d.knownWidgets as unknown[]).filter((w): w is string => typeof w === 'string')
      : undefined;
    const reconciled = reconcileLayout(
      knownWidgets === undefined
        ? { version: 2, tabs, activeTab: active }
        : { version: 2, tabs, activeTab: active, knownWidgets },
    );
    return saveLayout(reconciled.layout, projectId);
  });
}

/**
 * Ids in the layout that this build has no widget for. Rendered as named
 * placeholders — never removed, because a dropped widget is a lost decision.
 */
export function unknownWidgetIds(layout: AnalysisLayout): readonly string[] {
  return ANALYSIS_TABS.flatMap((t) => layout.tabs[t.id]).filter((id) => widgetById(id) === undefined);
}
