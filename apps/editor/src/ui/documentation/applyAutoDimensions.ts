// §FEAT-AUTODIMENSION-P1 (L-138) — editor executor for the deterministic
// AutoDimension engine.
//
// The PURE planner (`@pryzm/auto-dimension`, L2) turns the active level's
// wall/opening snapshot into a non-redundant, architect-grade `DimensionString[]`.
// This executor is the ONLY impure surface (P6): it gathers the live stores,
// calls the planner, resolves each element-anchored string to WORLD points via
// the geometry-kernel evaluator, and creates them through the command bus.
// It mirrors `generateDocumentationSet` (gather → pure plan → bus) and never
// throws to the caller. See docs/03-execution/spikes/SPIKE-AUTODIMENSION-ENGINE.md §1.3.
//
// §FIX-AUTODIM-RENDER-SINK (L-138) — the pure engine emits an ABSTRACT
// `DimensionString[]` (element-anchored, sheet-mm offsets). The platform's plan
// renderer (`PlanViewAnnotationRenderer`) only draws two RENDERED
// representations filtered by the active view: view-owned `AnnotationElement`s
// (`annotationStore.getByView`) and flat `DimensionElement`s
// (`annotationStore.getDimensionsByView`). It NEVER reads the `@pryzm/plugin-
// dimensions` DimensionStore that `dimension.createMany` writes to — so dims
// created that way are created-but-invisible. This executor therefore ADAPTS
// each engine `DimensionString` into `'linear-dim'` AnnotationElements (exactly
// as the manual `LinearDimPlanToolHandler` does), owned by the active plan view,
// so the existing renderer draws them. `dimension.createMany` + its store are
// left in place (valid infra) but are no longer the executor's render sink.
//
// §FIX-AUTODIM-SUBSYSTEM-STORE-SINK (L-145, ADR-0119) — the CANONICAL render
// sink is the SUBSYSTEM `annotationStore` (the singleton `PlanViewAnnotationRenderer`
// reads), whose mutation + undo are owned by the legacy command protocol — the
// same path the WORKING `LinearDimensionAnnotationTool` uses. The bus verb
// `annotation.create` is a TEXT-NOTE handler: it writes a FLAT `AnnotationData`
// (id/viewId/kind only) into the CQRS `AnnotationsState` and DROPS
// `geometry2D`+`references`, so routing the full element through it lost the
// dimension geometry and nothing rendered. We now dispatch ONE composite
// `CreateManyAnnotationsCommand` through the CommandManager (P6 — mutation via a
// command, never a direct UI store write) inside one `batchCoordinator.runBatch`
// → the whole SET writes to the render store as a SINGLE undo (C11, C24.1 §1.2).

import { storeRegistry, viewDefinitionStore } from '@pryzm/core-app-model';
import { makeAnnotationElement, makePointRef } from '@pryzm/plugin-annotations';
import { withAutoDimSpan } from '@pryzm/auto-dimension';
import * as THREE from '@pryzm/renderer-three/three';
import {
  evaluateDimensions,
  type ElementSnapshotForDim,
  type WallLikeEvaluator,
  type DoorLikeEvaluator,
  type WindowLikeEvaluator,
  type RoomLikeEvaluator,
} from '@pryzm/geometry-kernel';
import {
  planAutoDimensions,
  cardinalMeasurementAxis,
  tierGapWorldM,
  type AutoDimSnapshot,
  type AutoDimWall,
} from '@pryzm/auto-dimension';
import type { DimensionString } from '@pryzm/schemas/annotation/dimension';
// §FIX-AUTODIM-ANNOTATION-ID (L-145): annotation ids MUST be `annotation_<ULID>`
// (ADR-0061 typed ids; enforced by the AnnotationSchema id regex). Minting via
// `crypto.randomUUID()` produced a bare UUID → `annotation.create` Zod-rejected
// every string, so nothing rendered. Use the canonical id factory instead.
import { createId } from '@pryzm/schemas';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { resolveActiveLevel } from '../apartment-layout/activeLevel.js';
// §FEAT-AUTO-DIMENSION-ELEVATION-VIEWS (L-263) — the SHARED commit + ONE-undo path.
import { commitAnnotationSet } from './commitAnnotationSet.js';

// View types whose canvas draws annotations/dimensions in plan projection.
const PLAN_VIEW_TYPES: ReadonlySet<string> = new Set(['plan', 'ceiling-plan', 'structural-plan']);

interface ViewControllerLike { currentViewDefinitionId?: string | null }
interface WindowWithView {
  viewController?: ViewControllerLike;
}

/**
 * The id of the ACTIVE plan view — the view whose canvas the user is looking at
 * and which the renderer filters annotations by (`ownerViewId`). Mirrors how
 * `LinearDimPlanToolHandler` targets `ctx.viewDef.id` and how `initTools`/
 * `RadialMenu` read the active view: `ViewController.currentViewDefinitionId`
 * (which persists after `activate()` returns, §ANN-VIEW-PERSIST). Returns
 * undefined when no plan view is active (e.g. the 3D view), so the caller can
 * ask the user to open a plan first. Typed via a local `WindowWithView` shape
 * (no `(window as any)`, P4).
 */
function resolveActivePlanViewId(): string | undefined {
  const w = window as unknown as WindowWithView;
  const id = w.viewController?.currentViewDefinitionId ?? undefined;
  if (!id) return undefined;
  // When the view definition is resolvable, require a plan-like view; if its
  // type says elevation/section/3D, the plan renderer won't draw these dims.
  const def = viewDefinitionStore.get(id);
  if (def?.viewType && !PLAN_VIEW_TYPES.has(def.viewType)) return undefined;
  return id;
}

// ── Live store record shapes (defensive, minimal) ───────────────────────────

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

const MM_PER_M = 1000;

/**
 * Auto-dimension the active level: plan a complete dimension set over its walls
 * + openings and create it as one undoable batch. Returns the number of
 * dimension strings created. Never throws.
 */
export function applyAutoDimensions(runtime: PryzmRuntime): number {
  const toast = (message: string, severity: 'info' | 'success' | 'error' | 'warn'): void =>
    runtime.events?.emit('pryzm:toast', { message, severity });
  // §FIX-AUTODIM-APPLY-SPAN (L-145, C56 §1.7 / P8) — the mandated executor
  // boundary span `pryzm.autodim.apply` around the gather → plan → runBatch
  // dispatch. Attributes (wall/string/error counts) ride the span, never the name.
  return withAutoDimSpan('apply', (span): number => {
    try {
      const level = resolveActiveLevel();
      if (!level) { toast('Auto-Dimension: no active level.', 'warn'); return 0; }

      // §FIX-AUTODIM-RENDER-SINK — the dims are view-scoped annotations; they only
      // render on the plan the user is on. Resolve it up front so we can bail with
      // a clear message rather than silently create invisible (mis-owned) dims.
      const activeViewId = resolveActivePlanViewId();
      if (!activeViewId) { toast('Auto-Dimension: open a plan view first.', 'warn'); return 0; }

      const wallStore = storeRegistry.getStoreForType('wall') as unknown as
        | { getAll?(): WallRecord[] }
        | undefined;
      const onLevel = (wallStore?.getAll?.() ?? []).filter((w) => w.levelId === level.id);
      if (onLevel.length === 0) { toast('Auto-Dimension: no walls on this level.', 'warn'); return 0; }

      // ── Build the PURE engine snapshot from the live walls + embedded openings.
      const engineWalls: AutoDimWall[] = [];
      for (const w of onLevel) {
        const bl = w.baseLine;
        if (!bl || bl.length < 2) continue;
        const openings = (w.openings ?? [])
          .filter((o) => typeof o.offset === 'number' && typeof o.width === 'number' && (o.width ?? 0) > 0)
          .map((o) => ({
            id: (o.elementId ?? o.id ?? '') as string,
            kind: o.type,
            offset: o.offset as number,
            width: o.width as number,
          }))
          .filter((o) => o.id.length > 0);
        engineWalls.push({
          id: w.id,
          a: { x: bl[0].x, z: bl[0].z },
          b: { x: bl[1].x, z: bl[1].z },
          thickness: typeof w.thickness === 'number' ? w.thickness : 0.1,
          levelId: level.id,
          openings,
        });
      }
      span.setAttribute('pryzm.autodim.wall_count', engineWalls.length);
      if (engineWalls.length === 0) { toast('Auto-Dimension: walls have no usable geometry.', 'warn'); return 0; }

      const snapshot: AutoDimSnapshot = { walls: engineWalls };
      const viewId = `plan-${level.id}`;

      // §FIX-OVERALL-DIM-OUTSIDE-AND-OUTERMOST (L-281) — the TIER GAP is a PAPER constant
      // (C24), and only the VIEW can turn it into world metres. The engine must never
      // invent a millimetre value: 0.5 m of gap reads correctly at 1:100 and is absurd at
      // 1:20. Resolve the view's drawing scale (`output.customScale` wins over
      // `output.scale`, per ViewOutputSettings) and hand the engine world metres.
      const viewOut = (viewDefinitionStore.get(activeViewId) as
        | { output?: { scale?: number; customScale?: number } }
        | undefined)?.output;
      const scaleDenominator = viewOut?.customScale ?? viewOut?.scale ?? 100;
      const tierGapM = tierGapWorldM(scaleDenominator);

      const { strings, report } = planAutoDimensions(snapshot, {
        viewId,
        levelId: level.id,
        tierGapM,
      });
      span.setAttribute('pryzm.autodim.string_count', strings.length);
      span.setAttribute('pryzm.autodim.error_count', report.warnings.length);
      if (strings.length === 0) { toast('Auto-Dimension: nothing to dimension yet.', 'info'); return 0; }

      // ── §FIX-AUTODIM-RENDER-SINK: adapt the abstract engine DimensionString[] to
      //    the RENDERED representation the plan reads — `'linear-dim'` annotations
      //    owned by the active plan view (see file header + the pure helper below).
      const evalSnapshot = buildEvalSnapshot(onLevel, level.id);
      const annotations = dimensionStringsToLinearDimAnnotations(strings, evalSnapshot, activeViewId);
      span.setAttribute('pryzm.autodim.annotation_count', annotations.length);
      if (annotations.length === 0) { toast('Auto-Dimension: nothing to dimension yet.', 'info'); return 0; }

      // ── §FIX-AUTODIM-SUBSYSTEM-STORE-SINK (ADR-0119): write the FULL elements to
      //    the SUBSYSTEM annotationStore the renderer reads, via ONE composite
      //    CommandManager command (P6 — command-path mutation) inside one
      //    batchCoordinator.runBatch → the whole SET is ONE undo (C11, C24.1 §1.2).
      //    (The bus `annotation.create` verb is a text-note handler that would drop
      //    geometry2D+references and write the wrong store — NOT the render sink.)
      //    Annotations don't bound rooms → skipRedetectRooms.
      // §FEAT-AUTO-DIMENSION-ELEVATION-VIEWS (L-263) — the commit + ONE-undo logic
      // that used to live here is now the SHARED `commitAnnotationSet()` chokepoint,
      // so the elevation strategy (and L-265's auto-tag) reuse this exact proven path
      // instead of each growing a copy. Behaviour is unchanged: one composite
      // CreateManyAnnotationsCommand inside one runBatch, plus the ring-buffer
      // PatchPair that makes the unified ring-first undo path see the set
      // (§FIX-AUTODIM-UNDO-ONE-UNIT, L-162). See commitAnnotationSet.ts for why both
      // halves are required.
      if (!commitAnnotationSet(annotations, [level.id])) {
        toast('Auto-Dimension: command system not ready — try again.', 'error');
        return 0;
      }

      const undim = report.warnings.filter((w) => w.code === 'opening-undimensioned').length;
      // §FIX-AUTODIM-MULTI-BUILDING (L-268) — SAY how many buildings were dimensioned.
      // The original defect was not that the second building was skipped; it was that
      // nothing SAID SO. Partial coverage is now always reported, and a building that
      // received no dimensions at all is escalated to a warning toast.
      const buildings = report.coverage.buildingCount;
      const undimBuildings = report.warnings.filter((w) => w.code === 'building-undimensioned');
      toast(
        `Auto-Dimension: created ${annotations.length} dimensions across ${report.coverage.runCount} façade run(s)` +
        (buildings > 1 ? ` on ${buildings} buildings` : '') +
        (undim > 0 ? ` — ${undim} opening(s) uncovered.` : '.'),
        'success',
      );
      if (undimBuildings.length > 0) {
        toast(`Auto-Dimension: ${undimBuildings[0]!.detail}`, 'warn');
      }
      console.log('[auto-dimension] §FEAT-AUTODIMENSION-P1 coverage:', report.coverage, 'warnings:', report.warnings);
      return annotations.length;
    } catch (e) {
      span.setAttribute('pryzm.autodim.error_count', -1);
      console.error('[auto-dimension] apply failed:', e);
      toast('Auto-Dimension failed — see console.', 'error');
      return 0;
    }
  });
}

/**
 * §FIX-AUTODIM-RENDER-SINK — pure adapter: abstract engine `DimensionString[]`
 * → the platform's RENDERED representation, `'linear-dim'` AnnotationElements
 * owned by `ownerViewId` (what `PlanViewAnnotationRenderer` draws via
 * `annotationStore.getByView`). Mirrors `LinearDimPlanToolHandler._commitLinearDim`:
 * two point refs + world `modelPoints` (metres) + the perpendicular offset.
 *
 * A `linear-chain` string carries N ordered stations (references[0..N-1]) sharing
 * ONE dimension line; the renderer models a linear dim as a 2-POINT measure, so a
 * chain of N stations becomes N-1 segment dims (consecutive station pairs). The
 * geometry-kernel evaluator only resolves the FIRST TWO references of any string,
 * so we flatten every string into 2-ref segment sub-strings FIRST, then evaluate —
 * reusing the exact same world-point resolution. Each segment inherits its parent's
 * SIGNED `offsetMm` (per-side placement, P2) so it sits on the correct outward side.
 *
 * Pure (no window/bus/store) so it is unit-testable in isolation.
 *
 * P8 (§FIX-AUTODIM-APPLY-SPAN, L-145): opens a `pryzm.autodim.apply` span (tagged
 * `phase=adapt`); when called from the executor it nests under the executor's
 * apply span, when unit-tested it opens its own.
 */
export function dimensionStringsToLinearDimAnnotations(
  strings: readonly DimensionString[],
  evalSnapshot: ElementSnapshotForDim,
  ownerViewId: string,
): ReturnType<typeof makeAnnotationElement>[] {
  return withAutoDimSpan('apply', () => {
  const segStrings: DimensionString[] = [];
  for (const s of strings) {
    const refs = s.references;
    for (let i = 0; i + 1 < refs.length; i++) {
      const refA = refs[i]!;
      const refB = refs[i + 1]!;
      segStrings.push({ ...s, references: [refA, refB] });
    }
  }
  if (segStrings.length === 0) return [];

  const evaluated = evaluateDimensions(segStrings, evalSnapshot, { unit: 'mm', decimalPlaces: 0 });

  return segStrings
    .map((seg, i) => {
      const ev = evaluated[i]!;
      // p1World/p2World are [worldX_mm, worldZ_mm]; back to metres for the plan.
      const vA = new THREE.Vector3(ev.p1World[0] / MM_PER_M, 0, ev.p1World[1] / MM_PER_M);
      const vB = new THREE.Vector3(ev.p2World[0] / MM_PER_M, 0, ev.p2World[1] / MM_PER_M);
      // §FIX-AUTODIM-ORTHO-COMPLETE-CHAINS (L-147, C56 §1.3 DI-7) — the ORTHOGONAL-
      // ONLY invariant at the render boundary. The `overall` string references the
      // two EXTREME perimeter corners (SPEC §4.2) so it stays live; on an L/notched
      // footprint those corners are NOT collinear on the cross-axis, so a bare
      // point-to-point `linear-dim` renders (and labels) the corner-to-corner
      // DIAGONAL = hypot of the bbox (the founder's spurious `34601 mm`). We stamp
      // `measurementNormal` = the engine's cardinal axis for the string's
      // orientation (world +X for horizontal, +Z for vertical); the renderer's
      // §DIM-ORTHO branch (PlanViewAnnotationRenderer._renderLinearDim) then draws a
      // clean axis-aligned line and labels the axis EXTENT (the bbox width/height),
      // never the diagonal. `aligned` strings (angled façades) get no normal and
      // legitimately measure along their own direction.
      const measurementNormal = cardinalMeasurementAxis(seg.orientation) ?? undefined;
      const geometry2D = {
        modelPoints: [
          { x: vA.x, y: 0, z: vA.z },
          { x: vB.x, y: 0, z: vB.z },
        ],
        // §FIX-AUTODIM-OFFSET-WORLD-SCALE (L-155): the engine now emits a SIGNED
        // WORLD-scale offset (side · (stackWorldBaseM + rowIndex·stackWorldSpacingM)
        // · 1000 mm), so `offsetMm/1000` is the world-metre standoff the plan
        // renderer adds to world coordinates — the dim line stands VISIBLY OUTSIDE
        // the footprint (0.5 m row 0 → 2.0 m overall), not hugging the wall. The
        // sign (per-side placement, P2) is preserved; only the magnitude is fixed.
        offset: seg.offsetMm / MM_PER_M,
        ...(measurementNormal ? { measurementNormal } : {}),
      };
      return makeAnnotationElement(
        createId('annotation'),
        'linear-dim',
        ownerViewId,
        [makePointRef(vA), makePointRef(vB)],
        geometry2D,
        { unit: 'mm' },
      );
    })
    // Drop degenerate zero-length segments (mirrors the manual tool's A≈B guard).
    .filter((a) => {
      const [p, q] = a.geometry2D.modelPoints;
      return !!p && !!q && Math.hypot(q.x - p.x, q.z - p.z) >= 0.01;
    });
  }, { 'pryzm.autodim.phase': 'adapt', 'pryzm.autodim.string_count': strings.length });
}

// ── §FIX-AUTODIM-UNDO-ONE-UNIT (L-162) — now the SHARED chokepoint ────────────
//
// The ring-buffer PatchPair builder and the commit itself MOVED to
// `commitAnnotationSet.ts` (§FEAT-AUTO-DIMENSION-ELEVATION-VIEWS, L-263) so the
// elevation strategy — and L-265's auto-tag executor — reuse this exact proven
// one-undo path rather than each copying it. Re-exported here because it is a
// tested pure function and its call sites/tests know it by this name.
export { buildAnnotationRingUndoPair } from './commitAnnotationSet.js';

/**
 * Build the geometry-kernel evaluator snapshot from live walls (openings → doors/windows).
 *
 * §FIX-AUTODIM-OPENING-EDGE-ORIGIN (L-180, C56 AutoDimension / C15 §2) — the two
 * halves of the pipeline use DIFFERENT along-wall offset conventions and this
 * boundary is where they must be reconciled:
 *   • the STORE opening `offset` is the LEFT EDGE of the span `[offset, offset+width]`
 *     (§OPENING-OFFSET-LEFTEDGE-UNIFY; the same convention edge-projection.ts /
 *     poche.ts cut voids by, and the convention the pure engine `openings.ts` lifts
 *     onto the run axis: left = a + u·offset, right = a + u·(offset+width));
 *   • the geometry-kernel EVALUATOR (`resolveDoorAnchor`) interprets its
 *     `DoorLikeEvaluator.offset` as the door CENTRE along the wall
 *     (`center = a + u·offset`, then left = center − u·width/2) — a documented,
 *     unit-tested contract (offset=2 m → center anchor = 2000 mm).
 * Feeding the store's LEFT-EDGE offset straight into the evaluator made it treat
 * the left jamb as the centre, so every opening's witness lines (and the location
 * dim's centre reference) landed shifted along-wall by −width/2 — off the real
 * jambs (the founder's misaligned door/window dims). We therefore convert the
 * store left edge into the evaluator's CENTRE convention here (`offset + width/2`),
 * so the resolved world jambs coincide EXACTLY with the run-frame stations the
 * chain planner used: left = a + u·offset, right = a + u·(offset+width),
 * center = a + u·(offset + width/2). (The pure engine snapshot above keeps the raw
 * left-edge offset, which is what `openings.ts` expects — do NOT convert there.)
 *
 * Exported so the store-offset → evaluator-centre conversion is unit-testable
 * against a known (offset, width) opening without a live runtime.
 */
export function buildEvalSnapshot(walls: readonly WallRecord[], levelId: string): ElementSnapshotForDim {
  const wallMap = new Map<string, WallLikeEvaluator>();
  const doorMap = new Map<string, DoorLikeEvaluator>();
  const windowMap = new Map<string, WindowLikeEvaluator>();
  const roomMap = new Map<string, RoomLikeEvaluator>();

  for (const w of walls) {
    const bl = w.baseLine;
    if (!bl || bl.length < 2) continue;
    wallMap.set(w.id, {
      id: w.id,
      baseLine: [
        { x: bl[0].x, y: bl[0].y, z: bl[0].z },
        { x: bl[1].x, y: bl[1].y, z: bl[1].z },
      ],
      height: typeof w.height === 'number' ? w.height : 2.5,
      baseOffset: 0,
    });
    for (const o of w.openings ?? []) {
      const id = (o.elementId ?? o.id ?? '') as string;
      if (!id || typeof o.offset !== 'number' || typeof o.width !== 'number') continue;
      const entry = {
        id,
        wallId: w.id,
        // §FIX-AUTODIM-OPENING-EDGE-ORIGIN (L-180): store `offset` is the LEFT EDGE;
        // the evaluator wants the CENTRE → convert so resolved jambs land on the
        // true left/right edges (see buildEvalSnapshot header for the full rationale).
        offset: o.offset + o.width / 2,
        width: o.width,
        height: typeof o.height === 'number' ? o.height : 2.1,
        sillHeight: typeof o.sillHeight === 'number' ? o.sillHeight : 0,
      };
      if (o.type === 'door') doorMap.set(id, entry);
      else windowMap.set(id, entry);
    }
  }
  void levelId;
  return { walls: wallMap, doors: doorMap, windows: windowMap, rooms: roomMap };
}
