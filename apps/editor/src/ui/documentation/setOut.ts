// §FEAT-SET-OUT-LIVE-DOCUMENTATION (L-286) — SET OUT: the drawing keeps itself true.
//
// ─────────────────────────────────────────────────────────────────────────────
// IT IS NOT A NEW ENGINE. IT IS A BINDING OF THREE THINGS THAT ALREADY EXIST.
// ─────────────────────────────────────────────────────────────────────────────
//   ViewDependencyTracker  (change detection — already shipped, already in every log)
//        → reconcileTagSet (the generalised idempotent reconciler — L-265)
//        → commitAnnotationSet (creations AND removals = ONE undo entry)
//
// There is NO change-detection loop in this file. If one ever appears here, it is a second
// detector, and a second detector drifts from the first.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY "LIVE" IS EASY NOW, AND WAS IMPOSSIBLE THIS MORNING
// ─────────────────────────────────────────────────────────────────────────────
// IDEMPOTENCE IS THE WHOLE CORRECTNESS ARGUMENT. If the reconciler is idempotent — and
// `reconcileTagSet` is, by construction (a settled view yields empty create/refresh/delete
// sets) — then "live" collapses to "run it on every flush". There is no incremental state
// to keep, nothing to invalidate, and no way to drift. The hard problem disappears.
//
// It became possible only after L-287: before it, dimensions and tags were anchored to BAKED
// POINTS, so a "live" drawing would have re-derived nothing and confidently kept quoting a
// wall that had moved.
//
// ─────────────────────────────────────────────────────────────────────────────
// VISIBILITY IS THE INPUT, NOT THE MODEL
// ─────────────────────────────────────────────────────────────────────────────
// A Set-Out view documents WHAT IT SHOWS. Crop it, or pull its view depth in, and an element
// that is no longer drawn must lose its tag. Reconciling against what the LEVEL contains
// would leave an orphan on every crop change. So the visible set is computed per view and
// handed to the reconciler as the LIVE set: an element that is not visible and still has a
// tag is an ORPHAN — by the same single rule that removes the tag of a deleted element.
//
// ─────────────────────────────────────────────────────────────────────────────
// UNDO (ADR-0121)
// ─────────────────────────────────────────────────────────────────────────────
// A reconcile caused by a MODEL edit is a RE-DERIVATION, not a user action: it is
// suppressed from undo and simply re-runs after any undo. The drawing is a pure function of
// the model, and re-deriving an idempotent function is always correct. A reconcile the USER
// asked for (the Auto-tag button) stays one-batch-one-undo (C16).

import { viewDefinitionStore, viewDependencyTracker } from '@pryzm/core-app-model';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { autoTagView, resolveAutoTagProjection } from './autoTagActiveView.js';
import { resolveViewFacadeFrame, selectFacadeWalls } from './facadeSelection.js';
// §FEAT-SET-OUT-LIVE-DIMENSIONS (L-286b) — the dimension half of the same reconcile.
import { reconcileDimensionSet } from './reconcileDimensions.js';

interface Vec3Like { x: number; y: number; z: number }
interface OpeningRecord { id?: string; elementId?: string }
interface WallRecord {
  id: string;
  levelId?: string;
  baseLine?: readonly [Vec3Like, Vec3Like];
  openings?: readonly OpeningRecord[];
}
interface StoreLike<T> { getAll?(): T[] }
interface WindowWithStores {
  wallStore?: StoreLike<WallRecord>;
  bimManager?: { getLevels?(): { id: string; elevation?: number }[] };
}

/** A view's Set-Out intent (P7 / C09). Stored on the ViewDefinition — never a mode flag. */
export interface SetOutIntent {
  /** When true, this view's annotation set is re-derived whenever the model changes. */
  readonly live: boolean;
}

/** Read the intent off a view. A view with no opinion is NOT live — Set Out is opt-in. */
export function setOutIntentOf(viewId: string): SetOutIntent | undefined {
  const def = viewDefinitionStore.get(viewId) as { setOut?: SetOutIntent } | undefined;
  return def?.setOut;
}

/**
 * The elements THIS VIEW SHOWS — the input to the reconcile.
 *
 * PLAN — the walls on the view's level, clipped to the CROP REGION when one is enabled,
 * plus the openings hosted in those walls. (A crop is the founder's Example 4: shrink it and
 * the annotation set must shrink with it.)
 * ELEVATION — the FAÇADE the view looks at (the shared `selectFacadeWalls` rule, L-263/265)
 * and its openings. (His Example 3: change the view depth and the set follows.)
 *
 * Exported + pure over its inputs so "what the view shows" is testable without a runtime —
 * this is the function every orphan-on-crop-change bug would come from.
 */
export function visibleElementIds(viewId: string): ReadonlySet<string> | undefined {
  const def = viewDefinitionStore.get(viewId);
  if (!def) return undefined;
  const w = window as unknown as WindowWithStores;
  const walls = w.wallStore?.getAll?.() ?? [];
  const projection = resolveAutoTagProjection(def.viewType);
  const ids = new Set<string>();

  const addWall = (wall: WallRecord): void => {
    ids.add(wall.id);
    for (const o of wall.openings ?? []) {
      const id = (o.elementId ?? o.id ?? '') as string;
      if (id) ids.add(id);
    }
  };

  if (projection === 'plan') {
    const levelId = def.spatial.levelId;
    if (!levelId) return undefined;
    const crop = def.crop?.enabled && def.crop.region ? def.crop.region : undefined;
    for (const wall of walls) {
      if (wall.levelId !== levelId) continue;
      if (crop && !wallIntersectsCrop(wall, crop)) continue;   // VISIBILITY, not the level
      addWall(wall);
    }
    return ids;
  }

  if (projection === 'elevation') {
    const frame = resolveViewFacadeFrame(def);
    if (!frame) return undefined;
    const levels = w.bimManager?.getLevels?.() ?? [];
    const known = new Set(levels.filter((l) => typeof l.elevation === 'number').map((l) => l.id));
    const selection = selectFacadeWalls(walls, frame, (wall) => known.has(wall.levelId ?? ''));
    if (!selection) return ids;
    for (const wall of selection.walls) addWall(wall);
    return ids;
  }

  return undefined;
}

/** Does any part of the wall's baseline fall inside the crop rectangle? */
function wallIntersectsCrop(
  wall: WallRecord,
  crop: { min: [number, number]; max: [number, number] },
): boolean {
  const bl = wall.baseLine;
  if (!bl || bl.length < 2) return false;
  const [minX, minZ] = crop.min;
  const [maxX, maxZ] = crop.max;
  const inside = (p: Vec3Like): boolean => p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ;
  if (inside(bl[0]) || inside(bl[1])) return true;
  // A wall may cross the crop without either endpoint inside it — a segment/AABB overlap
  // test, not an endpoint test, or a long façade would vanish from its own cropped plan.
  const loX = Math.min(bl[0].x, bl[1].x);
  const hiX = Math.max(bl[0].x, bl[1].x);
  const loZ = Math.min(bl[0].z, bl[1].z);
  const hiZ = Math.max(bl[0].z, bl[1].z);
  return hiX >= minX && loX <= maxX && hiZ >= minZ && loZ <= maxZ;
}

/**
 * Reconcile ONE view's annotation set against what it currently SHOWS.
 *
 * Idempotent: a settled view writes nothing (no command, no store event, no re-projection
 * feedback loop). That is not a nice property — it is the entire correctness argument for
 * running this on every flush.
 *
 * Returns the number of tags created (0 when already up to date).
 */
export function reconcileSetOutView(runtime: PryzmRuntime, viewId: string): number {
  const def = viewDefinitionStore.get(viewId);
  if (!def) return 0;
  if (resolveAutoTagProjection(def.viewType) === 'unsupported') return 0;

  const visible = visibleElementIds(viewId);
  const tags = autoTagView(runtime, def, { visibleIds: visible, quiet: true });
  // §FEAT-SET-OUT-LIVE-DIMENSIONS (L-286b) — the SECOND half. The founder's flow is "place a
  // door → it is TAGGED and DIMENSIONED"; tags alone were half a feature. Same trigger, same
  // VISIBLE set (so a crop change re-derives both), same four decisions, same one-undo commit.
  // Dimensions are REFRESHED IN PLACE, never destroyed and reborn, so the user's dragged
  // offsets survive a model edit (dimensionIdentity.ts).
  const dims = reconcileDimensionSet(runtime, def, visible);
  return tags + dims;
}

/**
 * Bind Set Out to the change detection that ALREADY EXISTS.
 *
 * `ViewDependencyTracker` already knows exactly which views a model edit dirtied — it is the
 * thing that re-projects them. We subscribe to that same signal. We do NOT count elements, we
 * do NOT diff the model, and we do NOT keep a copy of anything: the tracker says "these views
 * changed", and for each one that is LIVE we re-run an idempotent reconcile.
 *
 * Correct first: a whole-view reconcile, scoped to the views the tracker already hands us.
 * Incremental is an OPTIMISATION, and it is not needed until it is measured to be.
 */
export function registerSetOut(runtime: PryzmRuntime): () => void {
  const unsubscribe = viewDependencyTracker.onViewsFlushed((viewIds) => {
    for (const viewId of viewIds) {
      if (!setOutIntentOf(viewId)?.live) continue;   // Set Out is an INTENT, and it is opt-in
      try {
        const created = reconcileSetOutView(runtime, viewId);
        if (created > 0) {
          console.log(`[set-out] §FEAT-SET-OUT-LIVE-DOCUMENTATION viewId=${viewId}: ${created} tag(s) re-derived.`);
        }
      } catch (e) {
        // A documentation reconcile must never take the editor down with it.
        console.error('[set-out] reconcile failed for', viewId, e);
      }
    }
  });
  return unsubscribe;
}
