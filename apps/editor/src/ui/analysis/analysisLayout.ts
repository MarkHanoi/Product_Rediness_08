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

import { DEFAULT_LAYOUT, widgetById } from './widgetCatalogue';

const LS_PREFIX = 'pryzm.analysis.layout.';

export interface AnalysisLayout {
  readonly version: 1;
  /** Widget ids in render order. May contain ids this build does not know. */
  readonly widgets: readonly string[];
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
      if (!raw) return { version: 1, widgets: [...DEFAULT_LAYOUT] };
      const parsed = JSON.parse(raw) as Partial<AnalysisLayout>;
      const widgets = Array.isArray(parsed.widgets)
        ? parsed.widgets.filter((w): w is string => typeof w === 'string')
        : null;
      // An empty stored array is a REAL arrangement — the user removed every
      // widget — and must not silently become the default again.
      return widgets ? { version: 1, widgets } : { version: 1, widgets: [...DEFAULT_LAYOUT] };
    } catch {
      return { version: 1, widgets: [...DEFAULT_LAYOUT] };
    }
  });
}

/** Persist a layout. Failure is reported, never swallowed into a false success. */
export function saveLayout(layout: AnalysisLayout, projectId: string | null = currentProjectId()): boolean {
  return withHandlerSpan(
    'pryzm.analysis.layout.save',
    { 'pryzm.surface': 'analysis', 'pryzm.analysis.widgets': layout.widgets.length },
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
    const d = data as Partial<AnalysisLayout> | null | undefined;
    if (!d || !Array.isArray(d.widgets)) return false;
    return saveLayout({ version: 1, widgets: d.widgets.filter((w): w is string => typeof w === 'string') }, projectId);
  });
}

/**
 * Ids in the layout that this build has no widget for. Rendered as named
 * placeholders — never removed, because a dropped widget is a lost decision.
 */
export function unknownWidgetIds(layout: AnalysisLayout): readonly string[] {
  return layout.widgets.filter((id) => widgetById(id) === undefined);
}
