// §FEAT-AUTO-DIMENSION-ELEVATION-VIEWS (L-263) — the ELEVATION executor.
//
// Sibling of `applyAutoDimensions` (plan), NOT a fork of it. The two share:
//   • the ENGINE package (`@pryzm/auto-dimension`) and its tracing/report types,
//   • the `DimensionString` schema (C03),
//   • the RENDER SINK (a `'linear-dim'` AnnotationElement on the active view),
//   • the COMMIT path — `commitAnnotationSet()`, ONE undo (C11 / C24.1 §1.2).
// What differs, and all that differs: the MEASUREMENT PLANE and the RULE SET.
//
// ─────────────────────────────────────────────────────────────────────────────
// "WHICH WAY IS UP" — REUSED, NOT REINVENTED (L-263 §3)
// ─────────────────────────────────────────────────────────────────────────────
// `ViewPlane` (Contract 24 §3.1) is already the platform's single answer:
// `isVertical` says the canvas V axis is world-Y, and `hWorldAxis` says which
// world axis is the canvas H axis. `PlanViewCanvas` mirrors it with `_hWorldAxis`
// / `_sectionFlipV` / `_hWorldSign`. This executor derives its (H, V) frame from
// `viewPlaneFromDefinition()` and nothing else — there is no second notion of up.
//
//   H = hSign · world[hWorldAxis]      V = world Y (absolute elevation)
//
// The engine plans entirely in (H, V); this file is the ONLY place that converts
// an (H, V) pair back into a world (x, y, z), because it is the only layer that
// owns the ViewPlane.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE ONE HEURISTIC IN HERE, STATED PLAINLY
// ─────────────────────────────────────────────────────────────────────────────
// To dimension a façade you must first know WHICH walls are on it. True elevation
// visibility is hidden-line removal, which the drawing pipeline owns and which
// this executor must not duplicate. So the façade set is chosen by two explicit,
// documented tests: a wall is on the façade if (a) its baseline runs across the
// view (|dir · right| ≥ FACADE_PARALLEL_MIN) and (b) it lies within
// FACADE_DEPTH_BAND_M of the CLOSEST such wall to the viewer. That is a heuristic,
// it is named as one, and when it selects nothing the executor says so rather than
// dimensioning the wrong wall.
//
// L-127 DIMENSIONAL TRUTH: every value the user reads is `v2 − v1` over two datums
// pulled from real records (level elevations, opening sill/head). There is not one
// literal height in this file or in the engine.

import { storeRegistry, viewDefinitionStore } from '@pryzm/core-app-model';
// §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — the façade rule + the (H,V) frame are now
// SHARED with the auto-tag executor. Same walls, same plane, one definition.
import { resolveViewFacadeFrame, selectFacadeWalls } from './facadeSelection.js';
import { makeAnnotationElement, makePointRef } from '@pryzm/plugin-annotations';
// P2 — THREE only ever via the single owner's re-export, exactly as the plan
// executor (`applyAutoDimensions`) does. `makePointRef` takes a THREE.Vector3.
import * as THREE from '@pryzm/renderer-three/three';
import {
  planElevationAutoDimensions,
  withAutoDimSpan,
  // §FIX-ELEVATION-HORIZONTAL-CHAIN (L-283) — the tier gap is a PAPER constant through the
  // view's scale (C24), shared with the plan executor (L-281). The engine never guesses mm.
  tierGapWorldM,
  type ElevAutoDimLevel,
  type ElevAutoDimOpening,
  type ElevAutoDimSnapshot,
  type ElevDimSegment,
  type ElevHDimSegment,
} from '@pryzm/auto-dimension';
import { createId } from '@pryzm/schemas';
import { normalizeDetailLevel, DEFAULT_DETAIL_LEVEL, type DetailLevel } from '@pryzm/schemas/view/detail-level';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { commitAnnotationSet } from './commitAnnotationSet.js';

/** View types whose canvas draws in the VERTICAL projected plane. */
const ELEVATION_VIEW_TYPES: ReadonlySet<string> = new Set([
  'elevation',
  'building-elevation',
]);

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
}
interface WallRecord {
  id: string;
  levelId?: string;
  baseLine?: readonly [Vec3Like, Vec3Like];
  thickness?: number;
  height?: number;
  openings?: readonly OpeningRecord[];
}
interface LevelRecord { id: string; name?: string; elevation?: number; height?: number }

interface ViewControllerLike { currentViewDefinitionId?: string | null }
interface BimManagerLike { getLevels?(): LevelRecord[] }
interface WindowWithView {
  viewController?: ViewControllerLike;
  bimManager?: BimManagerLike;
}

/**
 * The active ELEVATION view, or undefined. Mirrors `resolveActivePlanViewId` in the
 * plan executor: the renderer filters annotations by `ownerViewId`, so creating them
 * against the wrong view means creating them invisible.
 */
function resolveActiveElevationViewId(): string | undefined {
  const id = (window as unknown as WindowWithView).viewController?.currentViewDefinitionId ?? undefined;
  if (!id) return undefined;
  const def = viewDefinitionStore.get(id);
  if (!def?.viewType || !ELEVATION_VIEW_TYPES.has(def.viewType)) return undefined;
  return id;
}

/**
 * PURE — build the engine's (H, V) façade snapshot from live wall/level records.
 *
 * Exported so the whole projection + façade-selection + datum-resolution chain is
 * unit-testable against known geometry without a live runtime, browser or ViewPlane.
 *
 * @param frame  the view's (H, V) frame, taken from the ViewPlane.
 */
export function buildElevationSnapshot(
  walls: readonly WallRecord[],
  levels: readonly LevelRecord[],
  frame: { hWorldAxis: 'x' | 'z'; hSign: 1 | -1; right: { x: number; z: number }; normal: { x: number; z: number } },
): { snapshot: ElevAutoDimSnapshot; facadeDepth: number; facadeWallIds: readonly string[] } | null {
  const levelElev = new Map<string, number>();
  const engineLevels: ElevAutoDimLevel[] = [];
  for (const l of levels) {
    const e = typeof l.elevation === 'number' ? l.elevation : undefined;
    if (e === undefined || !Number.isFinite(e)) continue;
    levelElev.set(l.id, e);
    engineLevels.push({ id: l.id, name: l.name ?? l.id, elevation: e });
  }
  if (engineLevels.length === 0) return null;

  // ── Façade selection — the SHARED heuristic (§FEAT-AUTO-TAG-BATCH-EXECUTOR, L-265).
  // The rule that used to live here now lives in `facadeSelection.ts`, because the
  // auto-TAG executor must select the exact same walls: a dimension measuring one wall
  // while a tag names another would be two truths about one drawing. Same test, same
  // constants, same eligibility gate (a wall whose level has no elevation cannot be
  // measured in a vertical view) — extracted, not re-derived.
  const projH = (p: Vec3Like): number => frame.hSign * (frame.hWorldAxis === 'x' ? p.x : p.z);

  const selection = selectFacadeWalls(
    walls,
    frame,
    (w) => levelElev.get(w.levelId ?? '') !== undefined,
  );
  if (!selection) return null;
  const facade = selection.walls;
  const nearest = selection.depth;

  // ── Extent + datums, all measured from the real records ────────────────────
  let hMin = Infinity;
  let hMax = -Infinity;
  let topElevation = -Infinity;
  const openings: ElevAutoDimOpening[] = [];

  for (const w of facade) {
    const bl = w.baseLine!;
    const levelId = w.levelId ?? '';
    const base = levelElev.get(levelId)!;
    const hA = projH(bl[0]);
    const hB = projH(bl[1]);
    hMin = Math.min(hMin, hA, hB);
    hMax = Math.max(hMax, hA, hB);

    const wallHeight = typeof w.height === 'number' && Number.isFinite(w.height) ? w.height : undefined;
    if (wallHeight !== undefined) topElevation = Math.max(topElevation, base + wallHeight);

    // Openings — project each opening's along-wall span [offset, offset+width] into H.
    const dx = bl[1].x - bl[0].x;
    const dz = bl[1].z - bl[0].z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const ux = dx / len;
    const uz = dz / len;
    for (const o of w.openings ?? []) {
      const id = (o.elementId ?? o.id ?? '') as string;
      if (!id || typeof o.offset !== 'number' || typeof o.width !== 'number' || o.width <= 0) continue;
      if (typeof o.height !== 'number' || !Number.isFinite(o.height) || o.height <= 0) continue;
      // §OPENING-OFFSET-LEFTEDGE-UNIFY — the store `offset` is the LEFT EDGE of the
      // span, the same convention the plan engine's `openings.ts` consumes.
      const left  = { x: bl[0].x + ux * o.offset,             y: 0, z: bl[0].z + uz * o.offset };
      const right = { x: bl[0].x + ux * (o.offset + o.width), y: 0, z: bl[0].z + uz * (o.offset + o.width) };
      const h1 = projH(left);
      const h2 = projH(right);
      const sillHeight = typeof o.sillHeight === 'number' && Number.isFinite(o.sillHeight) ? o.sillHeight : 0;
      const sill = base + sillHeight;             // ABSOLUTE world-Y (L-127)
      const head = sill + o.height;               // derived from the real opening height
      openings.push({
        id,
        kind: o.type,
        levelId,
        hMin: Math.min(h1, h2),
        hMax: Math.max(h1, h2),
        sill,
        head,
      });
    }
  }

  if (!Number.isFinite(hMin) || !Number.isFinite(hMax) || hMax - hMin <= 1e-6) return null;
  if (!Number.isFinite(topElevation)) return null;

  const baseElevation = Math.min(...engineLevels.map((l) => l.elevation));

  return {
    snapshot: {
      hMin,
      hMax,
      baseElevation,
      topElevation,
      // The executor can only see the TOP OF WALL. It says so, and the engine
      // labels the overall-height dim 'wall-top' accordingly — a height measured to
      // the top of wall must never be presented as a height to the ridge. When the
      // roof element grows a governed ridge/eaves/parapet datum, THAT is the value
      // that belongs here, and the engine already accepts it (`topDatumKind`).
      topDatumKind: 'wall-top',
      levels: engineLevels,
      openings,
    },
    facadeDepth: nearest,
    facadeWallIds: facade.map((w) => w.id),
  };
}

/**
 * PURE — turn one engine segment (view H/V) back into a world-space `'linear-dim'`
 * AnnotationElement owned by the elevation view.
 *
 * The renderer projects a model point through `_ptH`/`_ptV` (H = hSign·world[hAxis],
 * V = world Y), so we invert exactly that: `worldH = h · hSign` (hSign is ±1, hence
 * its own inverse) and the depth coordinate is pinned to the façade plane.
 *
 * `measurementNormal` is WORLD UP (0, 1, 0). The renderer's §DIM-ORTHO branch
 * projects it to (mnH = 0, mnV = 1) in view space, so the dim is drawn as a clean
 * axis-aligned VERTICAL measure and LABELLED with the world-Y extent — never the
 * point-to-point diagonal. This is the same mechanism the plan path uses for its
 * cardinal dims (§FIX-AUTODIM-ORTHO-COMPLETE-CHAINS, L-147); nothing new is added
 * to the renderer.
 */
export function elevationSegmentToAnnotation(
  seg: ElevDimSegment,
  frame: { hWorldAxis: 'x' | 'z'; hSign: 1 | -1 },
  facadeDepth: number,
  ownerViewId: string,
): ReturnType<typeof makeAnnotationElement> {
  const worldH = seg.h * frame.hSign;
  const at = (y: number): { x: number; y: number; z: number } =>
    frame.hWorldAxis === 'x'
      ? { x: worldH, y, z: facadeDepth }
      : { x: facadeDepth, y, z: worldH };

  const pA = at(seg.v1);
  const pB = at(seg.v2);
  const vA = new THREE.Vector3(pA.x, pA.y, pA.z);
  const vB = new THREE.Vector3(pB.x, pB.y, pB.z);

  return makeAnnotationElement(
    createId('annotation'),
    'linear-dim',
    ownerViewId,
    [makePointRef(vA), makePointRef(vB)],
    {
      modelPoints: [pA, pB],
      // The signed world-metre offset from the measured geometry to the dim line,
      // in the view's H direction — the same contract the plan path feeds
      // (§FIX-AUTODIM-OFFSET-WORLD-SCALE, L-155).
      offset: seg.offsetH,
      measurementNormal: { x: 0, y: 1, z: 0 },
    },
    { unit: 'mm', autoMode: 'elevation', rule: seg.rule, referenceIds: [...seg.referenceIds] },
  );
}

/**
 * §FIX-ELEVATION-HORIZONTAL-CHAIN (L-283) — PURE: one HORIZONTAL segment (view H/V) back
 * into a world-space `'linear-dim'` AnnotationElement.
 *
 * The mirror of `elevationSegmentToAnnotation`, and deliberately its sibling rather than a
 * branch inside it: the two invert (H, V) → world DIFFERENTLY. A vertical segment's two
 * points share an H and vary in V; a horizontal segment's share a V (the façade base) and
 * vary in H. Sharing one function would have meant a discriminant that the next author
 * forgets to narrow.
 *
 * `measurementNormal` is the view's own H axis IN WORLD TERMS (`hSign · world[hWorldAxis]`).
 * The renderer projects it through `_ptH`/`_ptV` to (mnH = 1, mnV = 0), so the §DIM-ORTHO
 * branch draws a clean HORIZONTAL measure and labels it with the H extent — the same
 * mechanism the vertical rules use with world-up, and no new renderer code.
 */
export function elevationHSegmentToAnnotation(
  seg: ElevHDimSegment,
  frame: { hWorldAxis: 'x' | 'z'; hSign: 1 | -1 },
  facadeDepth: number,
  ownerViewId: string,
): ReturnType<typeof makeAnnotationElement> {
  const at = (h: number): { x: number; y: number; z: number } => {
    const worldH = h * frame.hSign;   // hSign is ±1 — its own inverse
    return frame.hWorldAxis === 'x'
      ? { x: worldH, y: seg.v, z: facadeDepth }
      : { x: facadeDepth, y: seg.v, z: worldH };
  };
  const pA = at(seg.h1);
  const pB = at(seg.h2);
  const vA = new THREE.Vector3(pA.x, pA.y, pA.z);
  const vB = new THREE.Vector3(pB.x, pB.y, pB.z);

  // The world direction that projects onto the view's +H axis.
  const measurementNormal = frame.hWorldAxis === 'x'
    ? { x: frame.hSign, y: 0, z: 0 }
    : { x: 0, y: 0, z: frame.hSign };

  return makeAnnotationElement(
    createId('annotation'),
    'linear-dim',
    ownerViewId,
    [makePointRef(vA), makePointRef(vB)],
    {
      modelPoints: [pA, pB],
      // Signed world-metre offset from the measured geometry to the dim line, along the
      // view's V axis. NEGATIVE — the horizontal stack sits BELOW the façade, so a
      // horizontal dimension can never cross the building silhouette.
      offset: seg.offsetV,
      measurementNormal,
    },
    { unit: 'mm', autoMode: 'elevation', rule: seg.rule, referenceIds: [...seg.referenceIds] },
  );
}

/**
 * Auto-dimension the active ELEVATION view: plan the vertical dimension set
 * (overall height / floor-to-floor + level datums / typical opening sill + head,
 * gated by the view's detail level) and create it as ONE undoable batch.
 *
 * Returns the number of dimensions created. Never throws.
 *
 * P8 — rides the shared `pryzm.autodim.apply` executor-boundary span.
 */
export function applyElevationAutoDimensions(runtime: PryzmRuntime): number {
  const toast = (message: string, severity: 'info' | 'success' | 'error' | 'warn'): void =>
    runtime.events?.emit('pryzm:toast', { message, severity });

  return withAutoDimSpan('apply', (span): number => {
    try {
      const viewId = resolveActiveElevationViewId();
      if (!viewId) { toast('Auto-Dimension: open an elevation view first.', 'warn'); return 0; }
      const viewDef = viewDefinitionStore.get(viewId);
      if (!viewDef) { toast('Auto-Dimension: elevation view not found.', 'error'); return 0; }

      // ── The (H, V) frame — from the EXISTING ViewPlane abstraction (L-263 §3),
      // now via the shared `resolveViewFacadeFrame` so the tag executor derives it
      // from the same one place (L-265).
      const frame = resolveViewFacadeFrame(viewDef);
      if (!frame) { toast('Auto-Dimension: this view is not a vertical view.', 'warn'); return 0; }

      // ── View INTENT (P7 / C09): the view's detail level gates WHICH rules fire.
      const detailLevel: DetailLevel =
        normalizeDetailLevel((viewDef as { detailLevel?: unknown }).detailLevel) ?? DEFAULT_DETAIL_LEVEL;

      // ── Gather. Walls across ALL levels — an elevation is a whole-building view.
      const wallStore = storeRegistry.getStoreForType('wall') as unknown as
        | { getAll?(): WallRecord[] } | undefined;
      const walls = wallStore?.getAll?.() ?? [];
      const levels = (window as unknown as WindowWithView).bimManager?.getLevels?.() ?? [];
      if (walls.length === 0) { toast('Auto-Dimension: no walls in the model.', 'warn'); return 0; }
      if (levels.length === 0) { toast('Auto-Dimension: no levels to measure against.', 'warn'); return 0; }

      const built = buildElevationSnapshot(walls, levels, frame);
      if (!built) {
        toast('Auto-Dimension: no façade walls face this elevation.', 'warn');
        return 0;
      }
      span.setAttribute('pryzm.autodim.wall_count', built.facadeWallIds.length);

      // §FIX-ELEVATION-HORIZONTAL-CHAIN (L-283) — the tier gap for the horizontal stack is
      // the VIEW's, not the engine's: a PAPER constant through the drawing scale (C24),
      // exactly as the plan executor resolves it (L-281).
      const viewOut = (viewDef as { output?: { scale?: number; customScale?: number } }).output;
      const tierGapM = tierGapWorldM(viewOut?.customScale ?? viewOut?.scale ?? 100);

      const { segments, hSegments, report } = planElevationAutoDimensions(built.snapshot, {
        viewId,
        detailLevel,
        tierGapM,
      });
      span.setAttribute('pryzm.autodim.string_count', segments.length + hSegments.length);
      span.setAttribute('pryzm.autodim.error_count', report.warnings.length);
      if (segments.length === 0 && hSegments.length === 0) {
        toast('Auto-Dimension: nothing to dimension on this elevation.', 'info');
        return 0;
      }

      // §FIX-ELEVATION-HORIZONTAL-CHAIN (L-283) — AN ELEVATION SET IS TWO CHAINS.
      // The vertical rules (sill/head/floor-to-floor/overall height) and the horizontal
      // ones (façade length, opening widths, gaps, end distances) are both emitted here, in
      // ONE undoable set. Emitting only the vertical half is what shipped in L-263, and it
      // is why the founder's elevation had no widths at all.
      const annotations = [
        ...segments.map((s) => elevationSegmentToAnnotation(s, frame, built.facadeDepth, viewId)),
        ...hSegments.map((s) => elevationHSegmentToAnnotation(s, frame, built.facadeDepth, viewId)),
      ];

      if (!commitAnnotationSet(annotations, [...new Set(levels.map((l) => l.id))])) {
        toast('Auto-Dimension: command system not ready — try again.', 'error');
        return 0;
      }

      // §FIX-ELEVATION-HORIZONTAL-CHAIN (L-283) — REPORT BOTH AXES. The old message named
      // only the vertical rules, which is how a set that was missing half its dimensions
      // still read as a success.
      const openingDims = segments.filter((s) => s.rule.startsWith('opening')).length;
      const widthDims = hSegments.filter((s) => s.label === 'width').length;
      toast(
        `Auto-Dimension: ${annotations.length} elevation dimension(s) — ` +
        `${segments.length} vertical (overall height, ` +
        `${segments.filter((s) => s.rule === 'floor-to-floor').length} floor-to-floor, ${openingDims} opening), ` +
        `${hSegments.length} horizontal (façade length, ${widthDims} opening width(s), spacing). ` +
        `(Detail level: ${detailLevel}.)`,
        'success',
      );
      if (report.warnings.length > 0) {
        console.warn('[auto-dimension/elevation] warnings:', report.warnings);
      }
      console.log('[auto-dimension/elevation] §FEAT-AUTO-DIMENSION-ELEVATION-VIEWS coverage:', report.coverage);
      return annotations.length;
    } catch (e) {
      span.setAttribute('pryzm.autodim.error_count', -1);
      console.error('[auto-dimension/elevation] apply failed:', e);
      toast('Auto-Dimension (elevation) failed — see console.', 'error');
      return 0;
    }
  }, { 'pryzm.autodim.phase': 'elevation' });
}
