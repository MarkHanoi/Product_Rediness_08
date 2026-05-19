// buildPanels — emit one quad per curtain-wall panel cell (S12).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S12 line 1466
// — "split into panels + mullions + transoms helpers (parity with
// PRYZM 1's `CurtainWallGeometryBuilder`)".
//
// The orchestrator (`producers/curtainwall.ts`) computes the per-cell
// rectangles and calls this helper once per (row, col, kind) panel.

import type { RawGroup } from '../rawGeometry.js';
import { asMaterialKey, type MaterialKey } from '../../../types/MaterialKey.js';

export type PanelKind = 'glazed' | 'spandrel' | 'door' | 'opaque';

export interface PanelRect {
  /** Cell column index from the bay grid. */
  readonly col: number;
  /** Cell row index from the bay grid. */
  readonly row: number;
  /** Distance along the curtain-wall baseline to the LEFT edge (m). */
  readonly x0: number;
  /** Distance along the curtain-wall baseline to the RIGHT edge (m). */
  readonly x1: number;
  /** Bottom edge height above worldY + baseline.y (m). */
  readonly y0: number;
  /** Top edge height above worldY + baseline.y (m). */
  readonly y1: number;
  readonly kind: PanelKind;
  readonly materialId?: string | undefined;
}

interface Vec3 { x: number; y: number; z: number }
interface PanelBasis { axis: Vec3; normal: Vec3; origin: Vec3 }

const COLOR_BY_KIND: Record<PanelKind, string> = {
  glazed: '#a4cdd9',
  spandrel: '#666666',
  door: '#9a6c47',
  opaque: '#cccccc',
};

export function composeCurtainPanelMaterialKey(
  kind: PanelKind,
  materialId: string | undefined,
): MaterialKey {
  const color = COLOR_BY_KIND[kind];
  return asMaterialKey(`curtainwall|panel|${kind}|${materialId ?? ''}|${color}`);
}

/** Append the 6 vertices (one quad, two triangles) for a single panel. */
export function appendPanelQuad(
  buf: { positions: number[]; normals: number[]; uvs: number[] },
  rect: PanelRect,
  basis: PanelBasis,
): void {
  const { axis, normal, origin } = basis;

  function project(t: number, h: number): [number, number, number] {
    return [
      origin.x + axis.x * t,
      origin.y + h,
      origin.z + axis.z * t,
    ];
  }

  const a = project(rect.x0, rect.y0);
  const b = project(rect.x1, rect.y0);
  const c = project(rect.x1, rect.y1);
  const d = project(rect.x0, rect.y1);

  const nx = normal.x, ny = normal.y, nz = normal.z;
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;

  buf.positions.push(...a, ...b, ...c);
  buf.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  buf.uvs.push(0, 0, w, 0, w, h);

  buf.positions.push(...a, ...c, ...d);
  buf.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  buf.uvs.push(0, 0, w, h, 0, h);
}

/** Build per-kind RawGroup buckets from a list of panel rects. */
export function buildPanelsRawGroups(
  rects: readonly PanelRect[],
  basis: PanelBasis,
): RawGroup[] {
  const buckets = new Map<string, { kind: PanelKind; materialId?: string | undefined; positions: number[]; normals: number[]; uvs: number[] }>();
  for (const rect of rects) {
    const key = `${rect.kind}|${rect.materialId ?? ''}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { kind: rect.kind, materialId: rect.materialId, positions: [], normals: [], uvs: [] };
      buckets.set(key, bucket);
    }
    appendPanelQuad(bucket!, rect, basis);
  }
  return [...buckets.values()].map((b) => ({
    geometry: { positions: b.positions, normals: b.normals, uvs: b.uvs },
    materialKey: composeCurtainPanelMaterialKey(b.kind, b.materialId),
  }));
}
