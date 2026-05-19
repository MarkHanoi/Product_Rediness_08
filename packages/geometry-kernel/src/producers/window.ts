// produceWindow — pure-TS Window geometry producer (S11-T2).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S11.
//
// Design:
//   • Window geometry = outer frame (4 boxes: 2 vertical mullions
//     forming jambs + head + sill) + inner mullions (per WindowGridSpec
//     columns/rows from the type catalogue) + glass panes.
//   • For schema-only windows (no system type known), we emit a single
//     1×1 grid (no inner mullions, one glass pane).
//   • THREE-FREE — same conventions as `produceDoor`.
//   • Output materials: 2 slots (frame + glass).  Inner mullions share
//     the frame slot.

import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import { asMaterialKey, type MaterialKey } from '../types/MaterialKey.js';
import type { Window as WindowData } from '@pryzm/schemas';

export interface WindowWorldPlacement {
  readonly axis: { x: number; y: number; z: number };
  readonly normal: { x: number; y: number; z: number };
  /** World origin = bottom-centre of the window opening at the wall surface,
   *  WITH `sillHeight` and `offset` already applied. */
  readonly origin: { x: number; y: number; z: number };
  readonly wallThickness: number;
  /** Optional grid override (columns × rows × mullion thickness).  When
   *  absent the producer renders 1×1 (no inner mullions). */
  readonly grid?: { columns: number; rows: number; mullionThickness: number };
}

interface RawBuffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

const FRAME_FALLBACK_COLOR = '#3a3a3a';
const GLASS_COLOR = '#a4c8e1';

function composeWindowMaterialKey(
  systemTypeId: string,
  materialId: string,
  color: string,
  slot: 'frame' | 'glass',
): MaterialKey {
  return asMaterialKey(`window|${systemTypeId}|${materialId}|${color}|${slot}`);
}

function localToWorld(
  lx: number, ly: number, lz: number, p: WindowWorldPlacement,
): [number, number, number] {
  return [
    p.origin.x + p.axis.x * lx + p.normal.x * ly,
    p.origin.y + lz,
    p.origin.z + p.axis.z * lx + p.normal.z * ly,
  ];
}

function localNormalToWorld(
  lnx: number, lny: number, lnz: number, p: WindowWorldPlacement,
): [number, number, number] {
  return [
    p.axis.x * lnx + p.normal.x * lny,
    lnz,
    p.axis.z * lnx + p.normal.z * lny,
  ];
}

function appendBox(
  buf: RawBuffers,
  cx: number, cy: number, cz: number,
  sx: number, sy: number, sz: number,
  p: WindowWorldPlacement,
): void {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const faces: ReadonlyArray<{
    n: [number, number, number]; v: ReadonlyArray<[number, number, number]>;
  }> = [
    { n: [-1,0,0], v: [[cx-hx,cy-hy,cz-hz],[cx-hx,cy+hy,cz-hz],[cx-hx,cy+hy,cz+hz],[cx-hx,cy-hy,cz+hz]] },
    { n: [1,0,0], v: [[cx+hx,cy+hy,cz-hz],[cx+hx,cy-hy,cz-hz],[cx+hx,cy-hy,cz+hz],[cx+hx,cy+hy,cz+hz]] },
    { n: [0,-1,0], v: [[cx+hx,cy-hy,cz-hz],[cx-hx,cy-hy,cz-hz],[cx-hx,cy-hy,cz+hz],[cx+hx,cy-hy,cz+hz]] },
    { n: [0,1,0], v: [[cx-hx,cy+hy,cz-hz],[cx+hx,cy+hy,cz-hz],[cx+hx,cy+hy,cz+hz],[cx-hx,cy+hy,cz+hz]] },
    { n: [0,0,-1], v: [[cx-hx,cy+hy,cz-hz],[cx-hx,cy-hy,cz-hz],[cx+hx,cy-hy,cz-hz],[cx+hx,cy+hy,cz-hz]] },
    { n: [0,0,1], v: [[cx-hx,cy-hy,cz+hz],[cx+hx,cy-hy,cz+hz],[cx+hx,cy+hy,cz+hz],[cx-hx,cy+hy,cz+hz]] },
  ];
  for (const face of faces) {
    const baseV = buf.positions.length / 3;
    const [wnx, wny, wnz] = localNormalToWorld(face.n[0], face.n[1], face.n[2], p);
    const len = Math.hypot(wnx, wny, wnz) || 1;
    const nx = wnx/len, ny = wny/len, nz = wnz/len;
    for (let i = 0; i < 4; i++) {
      const [lx, ly, lz] = face.v[i]!;
      const [wx, wy, wz] = localToWorld(lx, ly, lz, p);
      buf.positions.push(wx, wy, wz);
      buf.normals.push(nx, ny, nz);
    }
    buf.uvs.push(0,0, 1,0, 1,1, 0,1);
    buf.indices.push(baseV, baseV+1, baseV+2, baseV, baseV+2, baseV+3);
  }
}

/** Compute mullion x-positions (LOCAL frame, axis = +X) for a window
 *  divided into `columns` columns.  Returns the centre x-coordinate of
 *  each interior mullion (length = columns - 1). */
export function computeMullionsX(
  width: number, columns: number,
): readonly number[] {
  if (columns <= 1) return [];
  const left = -width / 2;
  const out: number[] = [];
  const col = width / columns;
  for (let i = 1; i < columns; i++) out.push(left + i * col);
  return out;
}

export function computeMullionsZ(
  height: number, sillToHead: number, rows: number,
): readonly number[] {
  if (rows <= 1) return [];
  const out: number[] = [];
  const r = sillToHead / rows;
  for (let i = 1; i < rows; i++) out.push(i * r);
  return out;
  void height;
}

function computeBounds(positions: ReadonlyArray<number>) {
  if (positions.length < 3) return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  let mnX = positions[0]!, mnY = positions[1]!, mnZ = positions[2]!;
  let mxX = mnX, mxY = mnY, mxZ = mnZ;
  for (let i = 3; i < positions.length; i += 3) {
    const x = positions[i]!, y = positions[i+1]!, z = positions[i+2]!;
    if (x < mnX) mnX = x; if (x > mxX) mxX = x;
    if (y < mnY) mnY = y; if (y > mxY) mxY = y;
    if (z < mnZ) mnZ = z; if (z > mxZ) mxZ = z;
  }
  return { min: { x: mnX, y: mnY, z: mnZ }, max: { x: mxX, y: mxY, z: mxZ } };
}

export function produceWindow(
  win: WindowData,
  placement: WindowWorldPlacement,
): BufferGeometryDescriptor {
  const buf: RawBuffers = { positions: [], normals: [], uvs: [], indices: [] };
  const groups: Array<{ start: number; count: number; materialIndex: number }> = [];
  const systemTypeId = '';
  const materialId = '';
  const frameColor = win.frameColor ?? FRAME_FALLBACK_COLOR;
  const materialKeys: MaterialKey[] = [
    composeWindowMaterialKey(systemTypeId, materialId, frameColor, 'frame'),
    composeWindowMaterialKey(systemTypeId, materialId, GLASS_COLOR, 'glass'),
  ];

  const w = win.width;
  const h = win.height;
  const fW = win.frameWidth;
  const frameDepth = Math.max(0.04, placement.wallThickness * 0.8);
  const grid = placement.grid ?? { columns: 1, rows: 1, mullionThickness: 0.04 };
  const mullionT = Math.max(0.01, grid.mullionThickness);

  // Frame group (4 boxes: left jamb, right jamb, head, sill)
  const frameStart = buf.indices.length;
  // Left jamb
  appendBox(buf, -w/2 + fW/2, 0, h/2, fW, frameDepth, h, placement);
  // Right jamb
  appendBox(buf, w/2 - fW/2, 0, h/2, fW, frameDepth, h, placement);
  // Head
  const innerW = Math.max(0.05, w - 2 * fW);
  appendBox(buf, 0, 0, h - fW/2, innerW, frameDepth, fW, placement);
  // Sill
  appendBox(buf, 0, 0, fW/2, innerW, frameDepth, fW, placement);

  // Inner mullions (vertical)
  const innerH = Math.max(0.05, h - 2 * fW);
  const mullionsX = computeMullionsX(innerW, grid.columns);
  for (const mx of mullionsX) {
    appendBox(buf, mx, 0, h/2, mullionT, frameDepth * 0.9, innerH, placement);
  }
  // Inner mullions (horizontal)
  const mullionsZ = computeMullionsZ(innerH, innerH, grid.rows);
  for (const mz of mullionsZ) {
    appendBox(buf, 0, 0, fW + mz, innerW, frameDepth * 0.9, mullionT, placement);
  }

  groups.push({ start: frameStart, count: buf.indices.length - frameStart, materialIndex: 0 });

  // Glass group — one glass pane per cell.  We render a single
  // bounding pane to keep the descriptor small; per-cell panes can be
  // re-introduced later for muntin-aware shading.  The pane sits in
  // the wall mid-plane.
  const glassStart = buf.indices.length;
  const glassDepth = Math.max(0.005, frameDepth * 0.05);
  appendBox(buf, 0, 0, fW + innerH/2, innerW, glassDepth, innerH, placement);
  groups.push({ start: glassStart, count: buf.indices.length - glassStart, materialIndex: 1 });

  const positionArr = new Float32Array(buf.positions);
  const normalArr = new Float32Array(buf.normals);
  const uvArr = new Float32Array(buf.uvs);
  const vertexCount = positionArr.length / 3;
  const indexArr =
    vertexCount < 65536 ? new Uint16Array(buf.indices) : new Uint32Array(buf.indices);

  return {
    position: positionArr,
    normal: normalArr,
    uv: uvArr,
    index: indexArr,
    bounds: computeBounds(buf.positions),
    groups,
    materialKeys,
    hash: composeWindowGeometryHash(win, placement),
  };
}

export function composeWindowGeometryHash(
  win: WindowData, placement: WindowWorldPlacement,
): string {
  const r = (n: number) => Math.round(n * 1e4) / 1e4;
  const grid = placement.grid ?? { columns: 1, rows: 1, mullionThickness: 0.04 };
  return [
    'window:v1',
    win.id,
    r(win.width), r(win.height), r(win.sillHeight),
    r(win.frameWidth), r(win.frameThickness),
    win.frameColor ?? FRAME_FALLBACK_COLOR,
    grid.columns, grid.rows, r(grid.mullionThickness),
    r(placement.origin.x), r(placement.origin.y), r(placement.origin.z),
    r(placement.axis.x), r(placement.axis.y), r(placement.axis.z),
    r(placement.normal.x), r(placement.normal.y), r(placement.normal.z),
    r(placement.wallThickness),
  ].join('|');
}

export type WindowProducer = (
  dto: Readonly<WindowData>,
  placement: Readonly<WindowWorldPlacement>,
) => BufferGeometryDescriptor;
