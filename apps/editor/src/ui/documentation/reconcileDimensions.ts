// §FEAT-SET-OUT-LIVE-DIMENSIONS (L-286b) — THE SECOND HALF OF SET OUT.
//
// The founder's demo flow: "I create a door and expect the view to AUTO TAG and AUTO DIM
// automatically. I modify the crop scope of the elevation and expect a smooth update of DIMS
// AND TAGS."
//
// Tags already did all of that (L-286). Dimensions already FOLLOW the model (L-287: move a
// wall and the dim moves, because it references the wall rather than a baked point). What was
// missing is that the dimension SET never RECONCILED: it gained nothing when an element
// appeared, lost nothing when one went, and ignored the crop entirely.
//
// ─────────────────────────────────────────────────────────────────────────────
// THIS IS A BINDING, NOT A BUILD. Everything it needs already exists:
// ─────────────────────────────────────────────────────────────────────────────
//   ViewDependencyTracker.onViewsFlushed  — which views a model edit dirtied      (L-286)
//   visibleElementIds(view)               — WHAT THE VIEW SHOWS (crop / façade)   (L-286)
//   reconcileAnnotationSet                — the four decisions, over any identity  (L-286b)
//   dimensionIdentity                     — rule + references ⇒ REFRESH IN PLACE  (L-286b)
//   commitAnnotationSet(create, levels, remove) — ONE undo entry                  (L-265)
//   planAutoDimensions / planElevationAutoDimensions — the pure engines           (L-138/263/283)
//
// The only new idea is the identity, and the identity exists for one reason:
//
//     THE USER'S DRAG ALWAYS SURVIVES. ONLY THE REFERENCE RE-DERIVES.
//
// A regeneration is therefore a RECONCILE, never a delete-and-recreate. A dimension that
// still measures the same references is refreshed in place, keeping its id and with it the
// offset the architect dragged it to. (A delete-and-recreate would pass every other guard on
// this ticket and fail that one — which is exactly why that one is the guard.)

import { storeRegistry, reconcileAnnotationSet } from '@pryzm/core-app-model';
import type { ViewDefinition } from '@pryzm/core-app-model';
import { UpdateAnnotationCommand } from '@pryzm/command-registry';
import type { AnnotationElement } from '@pryzm/plugin-annotations';
import {
  planAutoDimensions,
  planElevationAutoDimensions,
  // §L-281 — the tier gap is a PAPER constant through the view's scale (C24). It lives with
  // the engine that consumes it, not with the view model.
  tierGapWorldM,
  type AutoDimWall,
} from '@pryzm/auto-dimension';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
  buildEvalSnapshot,
  dimensionStringsToLinearDimAnnotations,
} from './applyAutoDimensions.js';
import {
  buildElevationSnapshot,
  elevationSegmentToAnnotation,
  elevationHSegmentToAnnotation,
} from './applyElevationAutoDimensions.js';
import { resolveViewFacadeFrame } from './facadeSelection.js';
import { commitAnnotationSet } from './commitAnnotationSet.js';
import {
  AUTO_KEY_PARAM,
  isAutoDimension,
  readDimensionIdentity,
  keepPresentation,
} from './dimensionIdentity.js';

interface Vec3Like { x: number; y: number; z: number }
interface OpeningRecord {
  id?: string; elementId?: string; type: 'window' | 'door';
  offset?: number; width?: number; height?: number; sillHeight?: number;
}
interface WallRecord {
  id: string; levelId?: string; thickness?: number; height?: number;
  baseLine?: readonly [Vec3Like, Vec3Like];
  openings?: readonly OpeningRecord[];
}
interface LevelRecord { id: string; name?: string; elevation?: number }
interface AnnotationStoreLike {
  getByView(viewId: string): AnnotationElement[];
  getById(id: string): AnnotationElement | undefined;
}
interface CommandManagerLike { execute(cmd: unknown): unknown }
interface WindowWithStores {
  annotationStore?: AnnotationStoreLike;
  commandManager?: CommandManagerLike;
  bimManager?: { getLevels?(): LevelRecord[] };
}

const PLAN_VIEW_TYPES: ReadonlySet<string> = new Set(['plan', 'ceiling-plan', 'structural-plan']);
const ELEVATION_VIEW_TYPES: ReadonlySet<string> = new Set(['elevation', 'building-elevation']);
/** A model point that moved less than this has not drifted (mm). */
const DRIFT_EPS_M = 0.001;

function viewScaleGap(viewDef: ViewDefinition): number {
  const out = (viewDef as { output?: { scale?: number; customScale?: number } }).output;
  return tierGapWorldM(out?.customScale ?? out?.scale ?? 100);
}

/**
 * The dimension set this view SHOULD carry, given what it currently SHOWS.
 *
 * PURE over its inputs (the walls handed in are already visibility-filtered). It is the SAME
 * engine + the SAME adapter the Auto-Dimension button uses — the button and the live reconcile
 * differ only in their trigger and their scope, never in their rules.
 */
export function buildDimensionCandidates(
  viewDef: ViewDefinition,
  walls: readonly WallRecord[],
  levels: readonly LevelRecord[],
): AnnotationElement[] {
  const viewId = viewDef.id;
  const gapM = viewScaleGap(viewDef);

  if (PLAN_VIEW_TYPES.has(viewDef.viewType)) {
    const levelId = viewDef.spatial.levelId;
    if (!levelId) return [];
    const engineWalls: AutoDimWall[] = [];
    for (const w of walls) {
      const bl = w.baseLine;
      if (!bl || bl.length < 2) continue;
      engineWalls.push({
        id: w.id,
        a: { x: bl[0].x, z: bl[0].z },
        b: { x: bl[1].x, z: bl[1].z },
        thickness: typeof w.thickness === 'number' ? w.thickness : 0.1,
        levelId,
        openings: (w.openings ?? [])
          .filter((o) => typeof o.offset === 'number' && typeof o.width === 'number' && (o.width ?? 0) > 0)
          .map((o) => ({
            id: (o.elementId ?? o.id ?? '') as string,
            kind: o.type,
            offset: o.offset as number,
            width: o.width as number,
          }))
          .filter((o) => o.id.length > 0),
      });
    }
    if (engineWalls.length === 0) return [];
    const { strings } = planAutoDimensions({ walls: engineWalls }, { viewId, levelId, tierGapM: gapM });
    const evalSnapshot = buildEvalSnapshot(walls as never, levelId);
    return dimensionStringsToLinearDimAnnotations(strings, evalSnapshot, viewId);
  }

  if (ELEVATION_VIEW_TYPES.has(viewDef.viewType)) {
    const frame = resolveViewFacadeFrame(viewDef);
    if (!frame) return [];
    const built = buildElevationSnapshot(walls as never, levels as never, frame);
    if (!built) return [];
    const { segments, hSegments } = planElevationAutoDimensions(built.snapshot, {
      viewId,
      detailLevel: 'fine',
      tierGapM: gapM,
    });
    return [
      ...segments.map((s) => elevationSegmentToAnnotation(s, frame, built.facadeDepth, viewId)),
      ...hSegments.map((s) => elevationHSegmentToAnnotation(s, frame, built.facadeDepth, viewId)),
    ];
  }

  return [];
}

/** Has the measurement drifted? (The MODEL points — never the presentation.) */
function dimensionDrifted(
  params: Readonly<Record<string, unknown>> | undefined,
  candidate: AnnotationElement,
  existing: AnnotationElement | undefined,
): boolean {
  void params;
  if (!existing) return false;
  const a = existing.geometry2D.modelPoints ?? [];
  const b = candidate.geometry2D.modelPoints ?? [];
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!;
    const q = b[i]!;
    if (Math.hypot(p.x - q.x, (p.y ?? 0) - (q.y ?? 0), p.z - q.z) > DRIFT_EPS_M) return true;
  }
  return false;
}

/**
 * Reconcile ONE view's DIMENSION set against what it currently SHOWS.
 *
 * The same four decisions as the tags (create · refresh · dedupe · un-orphan), over the same
 * engine, keyed by the dimension's identity. Idempotent: a settled view writes nothing — which
 * is the entire correctness argument for running it on every flush.
 *
 * Returns the number of dimensions created.
 */
export function reconcileDimensionSet(
  runtime: PryzmRuntime,
  viewDef: ViewDefinition,
  visibleIds: ReadonlySet<string> | undefined,
): number {
  void runtime;
  const w = window as unknown as WindowWithStores;
  const annotationStore = w.annotationStore;
  if (!annotationStore) return 0;

  const wallStore = storeRegistry.getStoreForType('wall') as unknown as
    | { getAll?(): WallRecord[] } | undefined;
  const allWalls = wallStore?.getAll?.() ?? [];
  const levels = w.bimManager?.getLevels?.() ?? [];

  // ── VISIBILITY IS THE INPUT, NOT THE MODEL (the rule that already fixed tags).
  // An element the view no longer DRAWS is an orphan by the SAME rule that removes a deleted
  // element's dimension — because it simply is not in the live set. One rule, two causes.
  const isPlan = PLAN_VIEW_TYPES.has(viewDef.viewType);
  const levelId = viewDef.spatial.levelId;
  const walls = allWalls.filter((wall) => {
    if (visibleIds && !visibleIds.has(wall.id)) return false;
    if (isPlan && levelId && wall.levelId !== levelId) return false;
    return true;
  }).map((wall) => (
    // An opening the view does not show must not be dimensioned either — the crop cuts the
    // openings with the wall, not just the wall.
    visibleIds
      ? { ...wall, openings: (wall.openings ?? []).filter((o) => visibleIds.has((o.elementId ?? o.id ?? '') as string)) }
      : wall
  ));

  const candidates = buildDimensionCandidates(viewDef, walls, levels);

  const existing = annotationStore.getByView(viewDef.id).filter(isAutoDimension);
  const plan = reconcileAnnotationSet<AnnotationElement>({
    annotationType: 'linear-dim',
    existing,
    live: candidates,
    keyOfExisting: (a) => readDimensionIdentity(a as AnnotationElement),
    keyOfLive: (a) => a.parameters[AUTO_KEY_PARAM] as string,
    needsRefresh: (params, candidate) => {
      // Find the annotation this refers to via its key — the reconciler hands us params only.
      const match = existing.find((e) => readDimensionIdentity(e) === candidate.parameters[AUTO_KEY_PARAM]);
      return dimensionDrifted(params, candidate, match);
    },
  });

  // ── REFRESH IN PLACE — the whole design. The annotation KEEPS ITS ID, so it keeps the
  //    offset the user dragged it to and the label they nudged. Only what it MEASURES is
  //    re-derived. This is the line that a delete-and-recreate cannot write.
  const commandManager = w.commandManager;
  let refreshed = 0;
  if (commandManager) {
    for (const { tagId, target } of plan.toRefresh) {
      const prev = annotationStore.getById(tagId);
      commandManager.execute(new UpdateAnnotationCommand(tagId, {
        references: target.references,
        geometry2D: keepPresentation(target.geometry2D, prev?.geometry2D),
      } as never));
      refreshed++;
    }
  }

  const removedIds = [...plan.duplicateTagIds, ...plan.orphanTagIds];
  const removed = removedIds
    .map((id) => annotationStore.getById(id))
    .filter((a): a is AnnotationElement => !!a);
  const created = [...plan.toCreate];

  if (created.length > 0 || removed.length > 0) {
    const levelIds = levelId ? [levelId] : [...new Set(levels.map((l) => l.id))];
    commitAnnotationSet(created, levelIds, removed);
  }

  if (created.length > 0 || removed.length > 0 || refreshed > 0) {
    console.log(
      `[set-out/dims] §FEAT-SET-OUT-LIVE-DIMENSIONS viewId=${viewDef.id}: ` +
      `${created.length} created, ${refreshed} refreshed in place, ${removed.length} removed, ` +
      `${plan.unchangedCount} unchanged.`,
    );
  }
  return created.length;
}
