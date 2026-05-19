/**
 * BCF ↔ PRYZM bridge — IFC GlobalId resolution.
 *
 * Phase 3-B Sprint S59 (PHASE-3B-Q2-M28-M30-IFC-REVIT-COMPONENT-EDITOR.md §5
 * BCF 3.0 import: "issues appear in issue store with correct status /
 * priority / assignedTo" + viewpoint restore).
 *
 * On BCF import, every `BCFComponent.ifcGuid` referenced by a viewpoint
 * (selection, visibility exception, coloring) must resolve back to the
 * native PRYZM element it represents — otherwise the viewpoint cannot
 * highlight, hide, or colour the right geometry. The IFC GlobalId is the
 * canonical join key (per `@pryzm/plugin-ifc-import.IFCElementMeta.globalId`
 * populated at S57 D1).
 *
 * On BCF export, the inverse: every selected PRYZM element id is
 * translated to its IFC GlobalId before being written into the .bcfv
 * `<Components>` block. PRYZM-native elements created in the editor (no
 * IFC origin) carry their own synthetic GlobalId minted by
 * `@pryzm/plugin-ifc-export.GlobalIdAllocator` so the round-trip closes.
 *
 * This module is intentionally framework-free — no DOM, no THREE, no
 * React — so it loads in the bake-worker and the server-side BCF importer.
 */

import type {
  BCFArchive,
  BCFColoringGroup,
  BCFComponent,
  BCFComponents,
  BCFTopic,
  BCFViewpoint,
} from './types.js';

/**
 * Minimal contract over `IFCMetaStore` from `@pryzm/plugin-ifc-import`.
 * We do not import that package directly to avoid a circular plugin
 * dependency — consumers wire in their existing store at the call site.
 */
export interface PryzmElementResolver {
  /** Returns the PRYZM element id for an IFC GlobalId, or null if unknown. */
  byGlobalId(globalId: string): string | null;
}

/** Inverse — returns the IFC GlobalId for a PRYZM element id, or null. */
export interface PryzmGlobalIdResolver {
  byPryzmId(pryzmElementId: string): string | null;
}

/**
 * Resolved BCF component reference: keeps the original IFC GlobalId for
 * round-trip and adds the PRYZM element id when the resolver finds one.
 * Unresolved entries are still returned (with `pryzmElementId: null`) so
 * importers can surface a "missing element" warning without dropping data.
 */
export interface ResolvedBCFComponent {
  ifcGuid: string;
  pryzmElementId: string | null;
  originatingSystem?: string | undefined;
  authoringToolId?: string | undefined;
}

export interface ResolvedBCFViewpoint {
  guid: string;
  selection: ResolvedBCFComponent[];
  hidden: ResolvedBCFComponent[];
  /** Default visibility honoured: `true` ⇒ exceptions are *hidden*. */
  defaultVisibility: boolean;
  coloring: Array<{ color: string; components: ResolvedBCFComponent[] }>;
}

export interface ResolveSummary {
  componentsTotal: number;
  componentsResolved: number;
  componentsUnresolved: string[];
}

function resolveComponent(c: BCFComponent, resolver: PryzmElementResolver): ResolvedBCFComponent {
  return {
    ifcGuid: c.ifcGuid,
    pryzmElementId: resolver.byGlobalId(c.ifcGuid),
    originatingSystem: c.originatingSystem,
    authoringToolId: c.authoringToolId,
  };
}

/**
 * Resolve a single viewpoint's components against a PRYZM element resolver.
 * Returns a normalised view (selection / hidden / coloring) the viewport
 * binding can apply directly without re-parsing the BCF visibility model.
 */
export function resolveViewpoint(
  vp: BCFViewpoint,
  resolver: PryzmElementResolver,
): ResolvedBCFViewpoint {
  const c: BCFComponents | undefined = vp.components;
  const selection = (c?.selection ?? []).map((x) => resolveComponent(x, resolver));
  const exceptions = (c?.visibility?.exceptions ?? []).map((x) => resolveComponent(x, resolver));
  const defaultVisibility = c?.visibility?.defaultVisibility ?? true;
  // BCF semantic: if defaultVisibility=true the exceptions are hidden;
  // if defaultVisibility=false, exceptions are the only visible elements.
  const hidden = defaultVisibility ? exceptions : [];
  const coloring = (c?.coloring ?? []).map((g: BCFColoringGroup) => ({
    color: g.color,
    components: g.components.map((x) => resolveComponent(x, resolver)),
  }));
  return { guid: vp.guid, selection, hidden, defaultVisibility, coloring };
}

/**
 * Resolve every viewpoint of every topic in an archive and return a
 * coverage summary. Importers use the summary to decide whether to warn
 * the user that some BCF references could not be matched (typical when
 * the .bcf was authored against a newer model revision).
 */
export function summariseResolution(
  archive: BCFArchive,
  resolver: PryzmElementResolver,
): ResolveSummary {
  let total = 0;
  let resolved = 0;
  const missing = new Set<string>();
  for (const topic of archive.topics) {
    for (const vp of topic.viewpoints) {
      const resolvedVp = resolveViewpoint(vp, resolver);
      const all: ResolvedBCFComponent[] = [
        ...resolvedVp.selection,
        ...resolvedVp.hidden,
        ...resolvedVp.coloring.flatMap((g) => g.components),
      ];
      for (const r of all) {
        total += 1;
        if (r.pryzmElementId != null) resolved += 1;
        else missing.add(r.ifcGuid);
      }
    }
  }
  return {
    componentsTotal: total,
    componentsResolved: resolved,
    componentsUnresolved: [...missing].sort(),
  };
}

/**
 * Build a `BCFComponents` block from a flat PRYZM selection by translating
 * each PRYZM id back to its IFC GlobalId. PRYZM ids without a matching
 * GlobalId are skipped (caller decides whether that is a warning).
 *
 * Used by `apps/3d-view-app` issue panel when authoring a new BCF topic
 * from the current viewport selection.
 */
export function selectionToBCFComponents(
  selectedPryzmIds: ReadonlyArray<string>,
  resolver: PryzmGlobalIdResolver,
): { components: BCFComponents; skipped: string[] } {
  const selection: BCFComponent[] = [];
  const skipped: string[] = [];
  for (const id of selectedPryzmIds) {
    const guid = resolver.byPryzmId(id);
    if (guid) selection.push({ ifcGuid: guid });
    else skipped.push(id);
  }
  return {
    components: selection.length > 0 ? { selection } : {},
    skipped,
  };
}

/**
 * Project an in-memory map (PRYZM element id → IFC GlobalId) into the two
 * resolver shapes consumers need. Convenience for tests and call sites
 * that already hold a flat dictionary.
 */
export function buildResolversFromMap(map: ReadonlyMap<string, string>): {
  byGlobalId: PryzmElementResolver;
  byPryzmId: PryzmGlobalIdResolver;
} {
  const inverse = new Map<string, string>();
  for (const [pryzmId, guid] of map) inverse.set(guid, pryzmId);
  return {
    byGlobalId: { byGlobalId: (g) => inverse.get(g) ?? null },
    byPryzmId: { byPryzmId: (p) => map.get(p) ?? null },
  };
}

/** Aggregate every IFC GlobalId referenced anywhere in an archive. */
export function collectReferencedGlobalIds(archive: BCFArchive): string[] {
  const set = new Set<string>();
  for (const t of archive.topics) {
    for (const vp of t.viewpoints) {
      for (const c of vp.components?.selection ?? []) set.add(c.ifcGuid);
      for (const c of vp.components?.visibility?.exceptions ?? []) set.add(c.ifcGuid);
      for (const g of vp.components?.coloring ?? []) {
        for (const c of g.components) set.add(c.ifcGuid);
      }
    }
  }
  return [...set].sort();
}

/** Convenience filter: which topics carry at least one viewpoint with components? */
export function topicsWithComponentRefs(archive: BCFArchive): BCFTopic[] {
  return archive.topics.filter((t) =>
    t.viewpoints.some((vp) =>
      (vp.components?.selection?.length ?? 0) > 0
      || (vp.components?.visibility?.exceptions.length ?? 0) > 0
      || (vp.components?.coloring?.length ?? 0) > 0,
    ),
  );
}
