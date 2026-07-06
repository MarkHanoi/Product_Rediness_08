// §FEAT-AUTODIMENSION-P1 (L-138) — editor executor for the deterministic
// AutoDimension engine.
//
// The PURE planner (`@pryzm/auto-dimension`, L2) turns the active level's
// wall/opening snapshot into a non-redundant, architect-grade `DimensionString[]`.
// This executor is the ONLY impure surface (P6): it gathers the live stores,
// calls the planner, resolves each element-anchored string to WORLD points via
// the geometry-kernel evaluator, and dispatches them through the command bus in
// ONE `dimension.createMany` verb — one undo (C24.1 §1.2). It mirrors
// `generateDocumentationSet` (gather → pure plan → bus) and never throws to the
// caller. See docs/03-execution/spikes/SPIKE-AUTODIMENSION-ENGINE.md §1.3.

import { storeRegistry } from '@pryzm/core-app-model';
import {
  evaluateDimensions,
  type ElementSnapshotForDim,
  type WallLikeEvaluator,
  type DoorLikeEvaluator,
  type WindowLikeEvaluator,
  type RoomLikeEvaluator,
} from '@pryzm/geometry-kernel';
import { planAutoDimensions, type AutoDimSnapshot, type AutoDimWall } from '@pryzm/auto-dimension';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { resolveActiveLevel } from '../apartment-layout/activeLevel.js';

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
  try {
    const level = resolveActiveLevel();
    if (!level) { toast('Auto-Dimension: no active level.', 'warn'); return 0; }

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
    if (engineWalls.length === 0) { toast('Auto-Dimension: walls have no usable geometry.', 'warn'); return 0; }

    const snapshot: AutoDimSnapshot = { walls: engineWalls };
    const viewId = `plan-${level.id}`;
    const { strings, report } = planAutoDimensions(snapshot, { viewId, levelId: level.id });
    if (strings.length === 0) { toast('Auto-Dimension: nothing to dimension yet.', 'info'); return 0; }

    // ── Resolve element-anchored strings → WORLD points (geometry-kernel L4).
    const evalSnapshot = buildEvalSnapshot(onLevel, level.id);
    const evaluated = evaluateDimensions(strings, evalSnapshot, { unit: 'mm', decimalPlaces: 0 });
    const elevation = typeof level.elevation === 'number' ? level.elevation : 0;

    const dimensions = strings.map((s, i) => {
      const ev = evaluated[i]!;
      return {
        levelId: level.id,
        viewId,
        kind: 'linear' as const,
        // p1World/p2World are [worldX_mm, worldZ_mm]; back to metres for the DTO.
        points: [
          { x: ev.p1World[0] / MM_PER_M, y: elevation, z: ev.p1World[1] / MM_PER_M },
          { x: ev.p2World[0] / MM_PER_M, y: elevation, z: ev.p2World[1] / MM_PER_M },
        ],
        offsetMm: s.offsetMm,
        units: 'mm' as const,
      };
    });

    // ── ONE bus verb → ONE undo (dimension.createMany, P6).
    runtime.bus.executeCommand('dimension.createMany', { dimensions });

    const undim = report.warnings.filter((w) => w.code === 'opening-undimensioned').length;
    toast(
      `Auto-Dimension: created ${dimensions.length} dimensions across ${report.coverage.runCount} façade run(s)` +
      (undim > 0 ? ` — ${undim} opening(s) uncovered.` : '.'),
      'success',
    );
    console.log('[auto-dimension] §FEAT-AUTODIMENSION-P1 coverage:', report.coverage, 'warnings:', report.warnings);
    return dimensions.length;
  } catch (e) {
    console.error('[auto-dimension] apply failed:', e);
    toast('Auto-Dimension failed — see console.', 'error');
    return 0;
  }
}

/** Build the geometry-kernel evaluator snapshot from live walls (openings → doors/windows). */
function buildEvalSnapshot(walls: readonly WallRecord[], levelId: string): ElementSnapshotForDim {
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
        offset: o.offset,
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
