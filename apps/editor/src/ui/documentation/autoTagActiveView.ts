// §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — the SINGLE Auto-Tag entry point.
//
// ─────────────────────────────────────────────────────────────────────────────
// ONE BUTTON, LIKE AUTO-DIMENSION (L-265 §6)
// ─────────────────────────────────────────────────────────────────────────────
// The user asks for "tag this view"; the ACTIVE VIEW decides what that means. A
// second "auto-tag elevation" button would push the strategy choice onto the user
// and would be the plan-first, bolt-on-per-view-type pattern L-263 already ended
// for dimensions. Routing is by view type, resolved from the ViewDefinition — the
// same discriminator `ViewPlane.isVertical` uses (Contract 24 §3.1):
//
//   plan / ceiling-plan / structural-plan  → plan tags      (anchors in world XZ)
//   elevation / building-elevation         → elevation tags (anchors in the façade plane)
//   section                                → NOT YET (a section tags the CUT, which is a
//                                            different visible set — the next consumer of
//                                            this engine, not a copy of it).
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS FILE IS *NOT*
// ─────────────────────────────────────────────────────────────────────────────
// It is not a tag engine. The lifecycle (create · refresh · dedupe · un-orphan) is
// `reconcileTagSet` in @pryzm/core-app-model — the SAME engine `RoomTagAutoPopulator`
// now consumes for rooms. The marks come from `resolveTagMarks`, which is also what
// the SCHEDULE joins on (C28). The anchors come from `tagAnchors`. This file is the
// one IMPURE layer (P6): gather live stores → call the pure engine → commit through
// commands. Every rule it applies is stated in a pure, unit-tested function elsewhere.
//
// ONE BATCH = ONE UNDO (C16 / C11 / C24.1 §1.2): the whole reconciliation — the tags
// created AND the duplicates/orphans removed — rides one `commitAnnotationSet()`.

import {
  storeRegistry,
  viewDefinitionStore,
  elementCodeStore,
  reconcileTagSet,
  resolveAutoTagIntent,
  resolveTagMarks,
  tagTargetKey,
  TAG_ANNOTATION_TYPE,
  withAutoTagSpan,
  planOpeningTagAnchor,
  planWallTagAnchor,
  elevationOpeningTagAnchor,
  elevationWallTagAnchor,
  type TagCategory,
  type TagProjection,
  type TagAnchor,
  type SystemTypeLookup,
} from '@pryzm/core-app-model';
import { wallSystemTypeStore } from '@pryzm/geometry-wall';
// §TOMBSTONE-HOSTED-STORE-FORK (2026-08-12) — these two were imported from
// `@pryzm/core-app-model` until the stale hosted-store forks there were deleted.
// This file was the ONLY reader of that fork, and it was reading the WRONG
// instance: the core copy seeded factory presets at construction, so it answered
// with plausible-looking type names while every command, builder and serializer
// wrote the geometry singleton. A tag naming a door type therefore resolved
// against a catalogue no door was ever a member of. Now sourced from the sole
// owners, matching how `wallSystemTypeStore` directly above has always resolved.
import { doorSystemTypeStore } from '@pryzm/geometry-door';
import { windowSystemTypeStore } from '@pryzm/geometry-window';
import { makeAnnotationElement, makePointRef, type AnnotationElement } from '@pryzm/plugin-annotations';
import { UpdateAnnotationCommand } from '@pryzm/command-registry';
import * as THREE from '@pryzm/renderer-three/three';
import { createId } from '@pryzm/schemas';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { commitAnnotationSet } from './commitAnnotationSet.js';
import { resolveViewFacadeFrame, selectFacadeWalls, type ViewFacadeFrame } from './facadeSelection.js';
import { relationshipArrayOrUnknown } from '../relationshipDetermination.js';

const PLAN_VIEW_TYPES: ReadonlySet<string> = new Set(['plan', 'ceiling-plan', 'structural-plan']);
const ELEVATION_VIEW_TYPES: ReadonlySet<string> = new Set(['elevation', 'building-elevation']);

// ── Live store record shapes (defensive, minimal — mirrors applyAutoDimensions) ──

interface Vec3Like { x: number; y: number; z: number }
interface OpeningRecord {
  id?: string;
  elementId?: string;
  type: 'window' | 'door';
  offset?: number;
  width?: number;
  height?: number;
  sillHeight?: number;
  mark?: string;
  systemTypeId?: string;
}
interface WallRecord {
  id: string;
  levelId?: string;
  baseLine?: readonly [Vec3Like, Vec3Like];
  thickness?: number;
  height?: number;
  systemTypeId?: string;
  properties?: { mark?: string };
  openings?: readonly OpeningRecord[];
}
interface LevelRecord { id: string; name?: string; elevation?: number }
interface OpeningElementRecord { id: string; mark?: string; systemTypeId?: string; width?: number; height?: number }

interface StoreLike<T> { getAll?(): T[]; getById?(id: string): T | undefined }
interface AnnotationStoreLike {
  getByView(viewId: string): AnnotationElement[];
  getById(id: string): AnnotationElement | undefined;
}
interface CommandManagerLike { execute(cmd: unknown): unknown }
interface WindowWithStores {
  viewController?: { currentViewDefinitionId?: string | null };
  bimManager?: { getLevels?(): LevelRecord[] };
  annotationStore?: AnnotationStoreLike;
  commandManager?: CommandManagerLike;
  doorStore?: StoreLike<OpeningElementRecord>;
  windowStore?: StoreLike<OpeningElementRecord>;
}

/** One live element to be tagged: its id, the mark it shows, and where its tag sits. */
interface TagTarget {
  readonly targetId: string;
  readonly category: TagCategory;
  readonly displayMark: string;
  readonly instanceMark: string | undefined;
  readonly typeMark: string | undefined;
  readonly anchor: TagAnchor;
  readonly widthMm?: number;
  readonly heightMm?: number;
  readonly levelId?: string;
}

/**
 * The strategy the active view calls for. Exported (and pure over its input) so the
 * routing rule is unit-testable without a runtime — the decision must not be locked
 * inside a click handler. Mirrors `resolveAutoDimensionStrategy` deliberately: two
 * batch executors that answer "what kind of view is this?" differently would be a
 * bug waiting to happen.
 */
export function resolveAutoTagProjection(viewType: string | undefined): TagProjection | 'unsupported' {
  if (!viewType) return 'unsupported';
  if (PLAN_VIEW_TYPES.has(viewType)) return 'plan';
  if (ELEVATION_VIEW_TYPES.has(viewType)) return 'elevation';
  return 'unsupported';
}

// ── Mark resolution: from the element's REAL record, never a literal ─────────

const SYSTEM_TYPE_LOOKUP: Readonly<Record<TagCategory, SystemTypeLookup | undefined>> = {
  wall:   wallSystemTypeStore as unknown as SystemTypeLookup,
  door:   doorSystemTypeStore as unknown as SystemTypeLookup,
  window: windowSystemTypeStore as unknown as SystemTypeLookup,
  room:   undefined,
};

// ── Target gathering (the only impure step) ──────────────────────────────────

/** The opening's own element record (doorStore/windowStore) — where its mark lives. */
function openingElement(w: WindowWithStores, o: OpeningRecord, id: string): OpeningElementRecord | undefined {
  const store = o.type === 'door' ? w.doorStore : w.windowStore;
  return store?.getById?.(id) ?? store?.getAll?.().find((r) => r.id === id);
}

/**
 * Build the tag targets for one wall's openings. PLAN and ELEVATION differ ONLY in
 * the anchor rule — which is exactly the claim L-265 §3 makes, and exactly why the
 * two projections share this function instead of forking it.
 */
export function openingTargets(
  w: WindowWithStores,
  wall: WallRecord,
  categories: ReadonlySet<TagCategory>,
  markSource: 'type' | 'instance',
  anchorOf: (wall: WallRecord, o: OpeningRecord, index: number) => TagAnchor | null,
  /** GR-10 / C75 §1.4 — called when this wall's opening set was NEVER
   *  RECORDED. The wall then yields NO opening targets, but the caller is
   *  TOLD, so the drawing's missing door/window tags surface as a warning
   *  instead of silently reading as "nothing to tag". */
  onOpeningsUnrecorded?: (wallId: string) => void,
): TagTarget[] {
  const out: TagTarget[] = [];
  // The honest read: absent ⇒ unrecorded ⇒ report and refuse this wall's
  // opening tags; a PRESENT empty array is a real "no openings" (C71 §4.4).
  const openings = relationshipArrayOrUnknown<OpeningRecord>(wall.openings);
  if (openings === null) {
    onOpeningsUnrecorded?.(wall.id);
    return out;
  }
  for (let i = 0; i < openings.length; i++) {
    const o = openings[i]!;
    const category: TagCategory = o.type === 'door' ? 'door' : 'window';
    if (!categories.has(category)) continue;
    const id = (o.elementId ?? o.id ?? '') as string;
    if (!id) continue;

    const element = openingElement(w, o, id);
    // The record the mark comes from: the opening's own element if the store has it,
    // else the embedded opening (which CreateWallOpeningCommand stamps with both).
    const record = {
      mark: element?.mark ?? o.mark,
      systemTypeId: element?.systemTypeId ?? o.systemTypeId,
    };
    const marks = resolveTagMarks(category, id, record, markSource, {
      types: SYSTEM_TYPE_LOOKUP[category],
      codes: elementCodeStore,
    });
    if (!marks.display) continue;   // an unidentified element gets NO tag, never a blank one

    const anchor = anchorOf(wall, o, i);
    if (!anchor) continue;

    const widthM = element?.width ?? o.width;
    const heightM = element?.height ?? o.height;
    out.push({
      targetId: id,
      category,
      displayMark: marks.display,
      instanceMark: marks.instanceMark,
      typeMark: marks.typeMark,
      anchor,
      ...(typeof widthM === 'number' ? { widthMm: Math.round(widthM * 1000) } : {}),
      ...(typeof heightM === 'number' ? { heightMm: Math.round(heightM * 1000) } : {}),
      ...(wall.levelId ? { levelId: wall.levelId } : {}),
    });
  }
  return out;
}

function wallTarget(
  wall: WallRecord,
  markSource: 'type' | 'instance',
  anchor: TagAnchor | null,
): TagTarget | null {
  if (!anchor) return null;
  const marks = resolveTagMarks('wall', wall.id, wall, markSource, {
    types: SYSTEM_TYPE_LOOKUP.wall,
    codes: elementCodeStore,
  });
  if (!marks.display) return null;
  return {
    targetId: wall.id,
    category: 'wall',
    displayMark: marks.display,
    instanceMark: marks.instanceMark,
    typeMark: marks.typeMark,
    anchor,
    ...(wall.levelId ? { levelId: wall.levelId } : {}),
  };
}

// ── The tag element itself ───────────────────────────────────────────────────

/**
 * PURE — one target → the RENDERED representation: a view-owned `AnnotationElement`
 * of the category's type, with the leader as `modelPoints[0] → modelPoints[1]`
 * (exactly what the manual DoorTag/WindowTag handlers write, and what
 * `PlanViewAnnotationRenderer` draws).
 *
 * The id is minted with `createId('annotation')` — `annotation_<ULID>` (ADR-0061).
 * A bare `crypto.randomUUID()` is Zod-rejected by the annotation schema, which is how
 * L-145's dimensions were created-but-invisible; the tag path must not relearn that.
 *
 * BOTH marks are carried in `parameters` regardless of which one is displayed, so the
 * C28 schedule join holds whichever convention the view chose.
 */
export function tagTargetToAnnotation(target: TagTarget, ownerViewId: string): AnnotationElement {
  const a = target.anchor.anchor;
  const t = target.anchor.tagPoint;
  return makeAnnotationElement(
    createId('annotation'),
    TAG_ANNOTATION_TYPE[target.category] as AnnotationElement['type'],
    ownerViewId,
    [makePointRef(new THREE.Vector3(a.x, a.y, a.z)), makePointRef(new THREE.Vector3(t.x, t.y, t.z))],
    {
      modelPoints: [
        { x: a.x, y: a.y, z: a.z },
        { x: t.x, y: t.y, z: t.z },
      ],
      offset: 0,
    },
    {
      [tagTargetKey(target.category)]: target.targetId,
      label: target.displayMark,
      cachedLabel: target.displayMark,
      mark: target.instanceMark,
      typeMark: target.typeMark,
      showLeader: true,
      autoMode: 'auto-tag',
      ...(target.widthMm !== undefined ? { widthMm: target.widthMm } : {}),
      ...(target.heightMm !== undefined ? { heightMm: target.heightMm } : {}),
    },
  );
}

/**
 * Has the tag drifted from the element? The idempotency guard (§A.21.D25, the same
 * rule `roomTagNeedsRefresh` enforces for rooms): when nothing drifted this returns
 * false, no command is issued, no store event fires — so a settled view's second
 * auto-tag run writes NOTHING.
 */
function tagNeedsRefresh(
  params: Readonly<Record<string, unknown>> | undefined,
  target: TagTarget,
): boolean {
  if (!params) return true;
  return params.cachedLabel !== target.displayMark
    || (params.mark ?? undefined) !== target.instanceMark
    || (params.typeMark ?? undefined) !== target.typeMark;
}

// ── The executor ─────────────────────────────────────────────────────────────

/**
 * Auto-tag the ACTIVE view, whatever kind it is. Returns the number of tags created.
 * Never throws.
 *
 * P8 — rides the `pryzm.autotag.apply` executor-boundary span.
 */
export function autoTagActiveView(runtime: PryzmRuntime): number {
  const w = window as unknown as WindowWithStores;
  const viewId = w.viewController?.currentViewDefinitionId ?? undefined;
  const viewDef = viewId ? viewDefinitionStore.get(viewId) : undefined;
  if (!viewDef || resolveAutoTagProjection(viewDef.viewType) === 'unsupported') {
    runtime.events?.emit('pryzm:toast', {
      message: viewDef?.viewType === 'section'
        ? 'Auto-Tag: sections are not supported yet — open a plan or an elevation.'
        : 'Auto-Tag: open a plan or an elevation view first.',
      severity: 'warn',
    });
    return 0;
  }
  return autoTagView(runtime, viewDef);
}

/**
 * §FEAT-SET-OUT-LIVE-DOCUMENTATION (L-286) — auto-tag a GIVEN view, not just the active one.
 *
 * The button (`autoTagActiveView`) and the LIVE Set-Out reconcile are the same operation on
 * different triggers, so they are the same function. A second "live tagger" would be a
 * second tag engine wearing a new hat — the exact thing L-265 exists to prevent.
 *
 * @param visibleIds  §L-286 — VISIBILITY IS THE INPUT, NOT THE MODEL. When supplied, only
 *                    elements the VIEW SHOWS are tagged, and a tag on an element the view no
 *                    longer shows (crop changed, view depth changed) is an ORPHAN and is
 *                    removed. Reconciling against what the LEVEL contains instead would
 *                    leave an orphan on every crop change. Omitted (the button) ⇒ the whole
 *                    level, which is what the user asked for by pressing it.
 * @param quiet       suppress toasts (a live reconcile must not shout on every keystroke).
 */
export function autoTagView(
  runtime: PryzmRuntime,
  viewDef: NonNullable<ReturnType<typeof viewDefinitionStore.get>>,
  options: { visibleIds?: ReadonlySet<string>; quiet?: boolean } = {},
): number {
  const toast = (message: string, severity: 'info' | 'success' | 'error' | 'warn'): void => {
    if (!options.quiet) runtime.events?.emit('pryzm:toast', { message, severity });
  };

  return withAutoTagSpan('apply', (span): number => {
    try {
      const w = window as unknown as WindowWithStores;
      const viewId = viewDef.id;
      const projection = resolveAutoTagProjection(viewDef.viewType);
      if (projection === 'unsupported') return 0;

      // ── VIEW INTENT (P7 / C09): the view says WHICH categories and WHICH mark.
      const intent = resolveAutoTagIntent(
        projection,
        viewDef.annotationOverrides,
        viewDef.output?.tagMarkSource,
      );
      const categories = new Set(intent.categories);
      if (categories.size === 0) {
        toast('Auto-Tag: this view is set to carry no tags.', 'info');
        return 0;
      }

      // ── Gather.
      const wallStore = storeRegistry.getStoreForType('wall') as unknown as StoreLike<WallRecord> | undefined;
      const allWalls = wallStore?.getAll?.() ?? [];
      if (allWalls.length === 0) { toast('Auto-Tag: no walls in the model.', 'warn'); return 0; }

      const targets: TagTarget[] = [];
      // GR-10 — walls whose opening sets were never recorded: their door/window
      // tags are UNKNOWN, not absent, and the user is told below.
      const openingsUnrecorded = new Set<string>();
      const collectUnrecorded = (wallId: string): void => { openingsUnrecorded.add(wallId); };
      let facadeFrame: ViewFacadeFrame | null = null;

      if (projection === 'plan') {
        const levelId = viewDef.spatial.levelId;
        if (!levelId) { toast('Auto-Tag: this plan has no level.', 'warn'); return 0; }
        const walls = allWalls.filter((wall) => wall.levelId === levelId);
        if (walls.length === 0) { toast('Auto-Tag: no walls on this level.', 'warn'); return 0; }
        walls.forEach((wall, i) => {
          targets.push(...openingTargets(w, wall, categories, intent.markSource,
            (hostWall, o, idx) => planOpeningTagAnchor(hostWall, o, idx), collectUnrecorded));
          if (categories.has('wall')) {
            const t = wallTarget(wall, intent.markSource, planWallTagAnchor(wall, i));
            if (t) targets.push(t);
          }
        });
      } else {
        // ELEVATION — the anchors live in the VERTICAL projected plane, and only the
        // walls the viewer can SEE are tagged (the shared façade rule, L-263/L-265).
        facadeFrame = resolveViewFacadeFrame(viewDef);
        if (!facadeFrame) { toast('Auto-Tag: this view is not a vertical view.', 'warn'); return 0; }
        const levels = w.bimManager?.getLevels?.() ?? [];
        const levelElev = new Map<string, number>();
        for (const l of levels) {
          if (typeof l.elevation === 'number' && Number.isFinite(l.elevation)) levelElev.set(l.id, l.elevation);
        }
        if (levelElev.size === 0) { toast('Auto-Tag: no levels to place tags against.', 'warn'); return 0; }

        const selection = selectFacadeWalls(
          allWalls,
          facadeFrame,
          (wall) => levelElev.get(wall.levelId ?? '') !== undefined,
        );
        if (!selection) { toast('Auto-Tag: no façade walls face this elevation.', 'warn'); return 0; }
        const frame = facadeFrame;
        const depth = selection.depth;

        selection.walls.forEach((wall, i) => {
          const base = levelElev.get(wall.levelId ?? '')!;
          targets.push(...openingTargets(w, wall, categories, intent.markSource,
            (hostWall, o, idx) => elevationOpeningTagAnchor(hostWall, o, base, frame, depth, idx),
            collectUnrecorded));
          if (categories.has('wall')) {
            const t = wallTarget(wall, intent.markSource, elevationWallTagAnchor(wall, base, frame, depth, i));
            if (t) targets.push(t);
          }
        });
      }

      // ── §FEAT-SET-OUT-LIVE-DOCUMENTATION (L-286) — VISIBILITY IS THE INPUT.
      //
      // A tag documents what the DRAWING SHOWS, not what the level contains. Crop the view,
      // or pull its depth in, and an element that is no longer drawn must lose its tag —
      // otherwise every crop change leaves an orphan pointing at nothing. Filtering the
      // LIVE set here (rather than filtering the tags afterwards) is what makes that fall
      // out of the reconciler for free: an element that is not in `live` and still has a
      // tag IS an orphan, by the same rule that removes a tag for a deleted element. One
      // rule, two causes.
      const visible = options.visibleIds;
      const scoped = visible ? targets.filter((t) => visible.has(t.targetId)) : targets;
      span.setAttribute('pryzm.autotag.target_count', scoped.length);
      span.setAttribute('pryzm.autotag.visibility_scoped', !!visible);

      // ── Reconcile — the SAME lifecycle the room populator runs, per category.
      const annotationStore = w.annotationStore;
      if (!annotationStore) { toast('Auto-Tag: annotation store not ready — try again.', 'error'); return 0; }
      const existing = annotationStore.getByView(viewId);

      const toCreate: TagTarget[] = [];
      const toRefresh: { tagId: string; target: TagTarget }[] = [];
      const removeIds: string[] = [];
      let unchanged = 0;

      for (const category of intent.categories) {
        const live = scoped.filter((t) => t.category === category);
        const result = reconcileTagSet<TagTarget>({
          category,
          existing,
          live,
          needsRefresh: tagNeedsRefresh,
        });
        toCreate.push(...result.toCreate);
        toRefresh.push(...result.toRefresh.map((r) => ({ tagId: r.tagId, target: r.target })));
        removeIds.push(...result.duplicateTagIds, ...result.orphanTagIds);
        unchanged += result.unchangedCount;
      }

      // ── Commit: ONE undoable unit for the WHOLE reconciliation (C16 / C24.1 §1.2).
      const created = toCreate.map((t) => tagTargetToAnnotation(t, viewId));
      const removed = removeIds
        .map((id) => annotationStore.getById(id))
        .filter((a): a is AnnotationElement => !!a);

      const levelIds = [...new Set(scoped.map((t) => t.levelId).filter((l): l is string => !!l))];

      if (created.length > 0 || removed.length > 0) {
        if (!commitAnnotationSet(created, levelIds, removed)) {
          toast('Auto-Tag: command system not ready — try again.', 'error');
          return 0;
        }
      }

      // ── Refresh drifted tags (a rename/retype after the tag was placed). These are
      // in-place UPDATEs, not creations, so they ride the command path individually —
      // they are also, by construction, rare: a settled view refreshes nothing.
      const commandManager = w.commandManager;
      if (commandManager) {
        for (const { tagId, target } of toRefresh) {
          const existingTag = annotationStore.getById(tagId);
          const cmd = new UpdateAnnotationCommand(tagId, {
            parameters: {
              ...(existingTag?.parameters ?? {}),
              label: target.displayMark,
              cachedLabel: target.displayMark,
              mark: target.instanceMark,
              typeMark: target.typeMark,
            },
          } as never);
          commandManager.execute(cmd);
        }
      }

      span.setAttribute('pryzm.autotag.created', created.length);
      span.setAttribute('pryzm.autotag.refreshed', toRefresh.length);
      span.setAttribute('pryzm.autotag.removed', removed.length);
      span.setAttribute('pryzm.autotag.unchanged', unchanged);
      // GR-10 / C78 §5 — the refusal is VISIBLE: missing tags on these walls
      // mean "opening set never recorded", not "nothing to tag".
      span.setAttribute('pryzm.autotag.openings_unrecorded_walls', openingsUnrecorded.size);
      if (openingsUnrecorded.size > 0) {
        console.warn(
          `[auto-tag] §GR-10 opening tags NOT determined for ${openingsUnrecorded.size} wall(s) ` +
          `[${[...openingsUnrecorded].join(', ')}] — their opening sets were never recorded ` +
          `(RELATIONSHIP_NOT_RECORDED). Their doors/windows are untagged because they are UNKNOWN, not absent.`,
        );
        toast(
          `Auto-Tag: opening tags for ${openingsUnrecorded.size} wall(s) could not be determined — ` +
          `their opening sets were never recorded.`,
          'warn',
        );
      }

      if (created.length === 0 && toRefresh.length === 0 && removed.length === 0) {
        toast(
          scoped.length === 0
            ? 'Auto-Tag: nothing to tag in this view.'
            : `Auto-Tag: already up to date — ${unchanged} tag(s).`,
          'info',
        );
        return 0;
      }

      const byCategory = intent.categories
        .map((c) => `${toCreate.filter((t) => t.category === c).length} ${c}`)
        .join(' · ');
      toast(
        `Auto-Tag: ${created.length} tag(s) created (${byCategory})` +
        (toRefresh.length > 0 ? `, ${toRefresh.length} refreshed` : '') +
        (removed.length > 0 ? `, ${removed.length} stale removed` : '') +
        `. Marks: ${intent.markSource}.`,
        'success',
      );
      console.log(
        `[auto-tag] §FEAT-AUTO-TAG-BATCH-EXECUTOR viewId=${viewId} projection=${projection}: ` +
        `${created.length} created, ${toRefresh.length} refreshed, ${removed.length} removed, ` +
        `${unchanged} unchanged out of ${scoped.length} live element(s).`,
      );
      return created.length;
    } catch (e) {
      span.setAttribute('pryzm.autotag.error_count', -1);
      console.error('[auto-tag] apply failed:', e);
      toast('Auto-Tag failed — see console.', 'error');
      return 0;
    }
  });
}
