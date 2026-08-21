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
import { DEFAULT_TAB_LAYOUT, widgetById } from './widgetCatalogue';

const LS_PREFIX = 'pryzm.analysis.layout.';

export interface AnalysisLayout {
  readonly version: 2;
  /** Widget ids in render order, PER TAB. May contain ids this build does not know. */
  readonly tabs: Readonly<Record<AnalysisTabId, readonly string[]>>;
  /** The tab the user was last on. Restored on reopen. */
  readonly activeTab: AnalysisTabId;
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
}

function defaults(): AnalysisLayout {
  const tabs = {} as Record<AnalysisTabId, readonly string[]>;
  for (const t of ANALYSIS_TABS) tabs[t.id] = [...DEFAULT_TAB_LAYOUT[t.id]];
  return { version: 2, tabs, activeTab: 'overview' };
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

function keyFor(projectId: string | null): string {
  return LS_PREFIX + (projectId ?? 'unscoped');
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
      return { version: 2, tabs, activeTab: active };
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
        localStorage.setItem(keyFor(projectId), JSON.stringify(layout));
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
    return saveLayout({ version: 2, tabs, activeTab: active }, projectId);
  });
}

/**
 * Ids in the layout that this build has no widget for. Rendered as named
 * placeholders — never removed, because a dropped widget is a lost decision.
 */
export function unknownWidgetIds(layout: AnalysisLayout): readonly string[] {
  return ANALYSIS_TABS.flatMap((t) => layout.tabs[t.id]).filter((id) => widgetById(id) === undefined);
}
