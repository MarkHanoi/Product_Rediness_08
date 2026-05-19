// produceCurtainWall — pure-TS curtain-wall producer (S12).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S12 lines
// 1466-1476.  This is the *orchestrator*: it computes the bay grid
// from `(baseLine, height, bayWidth, bayHeight)`, decides which cells
// are present, and delegates raw geometry construction to three
// helpers under `_internal/curtain-wall/`:
//
//   • buildPanels    — one quad per panel cell, bucketed by kind
//   • buildMullions  — vertical bars at every column boundary
//   • buildTransoms  — horizontal bars between rows
//
// The split mirrors PRYZM 1's `CurtainWallGeometryBuilder`
// (`src/elements/curtainwalls/CurtainWallGeometryBuilder.ts`) and is
// codified in ADR-0011.

import type { CurtainWall as CurtainWallData } from '@pryzm/protocol';
import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import type { JoinData } from '../types/JoinData.js';
import { concatRaw, type RawGroup } from './_internal/rawGeometry.js';
import { serializeDescriptor } from './_internal/serializeDescriptor.js';
import { composeCurtainWallGeometryHash } from './_internal/curtain-wall/composeCurtainWallGeometryHash.js';
import {
  buildPanelsRawGroups,
  type PanelRect,
} from './_internal/curtain-wall/buildPanels.js';
import { buildMullionsRawGroup } from './_internal/curtain-wall/buildMullions.js';
import { buildTransomsRawGroup } from './_internal/curtain-wall/buildTransoms.js';

export type CurtainWallProducer = (
  cw: Readonly<CurtainWallData>,
  joinData: Readonly<JoinData>,
  worldY: number,
) => BufferGeometryDescriptor;

interface Vec3 { x: number; y: number; z: number }

export interface CurtainWallBasis {
  /** Unit vector along the baseline. */
  readonly axis: Vec3;
  /** Unit outward normal in the XZ plane. */
  readonly normal: Vec3;
  /** Origin = world position of the start endpoint, with worldY applied. */
  readonly origin: Vec3;
  /** Total length along the baseline. */
  readonly length: number;
}

export function curtainWallBasis(cw: CurtainWallData, worldY: number): CurtainWallBasis {
  const [s, e] = cw.baseLine;
  const dx = e.x - s.x;
  const dz = e.z - s.z;
  const length = Math.hypot(dx, dz) || 1;
  return {
    axis: { x: dx / length, y: 0, z: dz / length },
    normal: { x: -dz / length, y: 0, z: dx / length },
    origin: { x: s.x, y: s.y + worldY, z: s.z },
    length,
  };
}

/** Compute the grid lines for the bay layout — column offsets along
 *  the baseline and row heights up the height axis.  Both arrays
 *  include the boundary lines (0 and total). */
export function computeCurtainWallGrid(cw: CurtainWallData, length: number): {
  cols: number[];
  rows: number[];
} {
  const cols: number[] = [0];
  let x = cw.bayWidth;
  while (x < length - 1e-6) {
    cols.push(x);
    x += cw.bayWidth;
  }
  cols.push(length);

  const rows: number[] = [0];
  let y = cw.bayHeight;
  while (y < cw.height - 1e-6) {
    rows.push(y);
    y += cw.bayHeight;
  }
  rows.push(cw.height);

  return { cols, rows };
}

export const produceCurtainWall: CurtainWallProducer = (cw, _joinData, worldY) => {
  const basis = curtainWallBasis(cw, worldY);
  const { cols, rows } = computeCurtainWallGrid(cw, basis.length);

  // Index panels by (row, col); default kind = glazed when no panel
  // entry exists for that cell.
  const panelMap = new Map<string, { kind: PanelRect['kind']; materialId?: string | undefined }>();
  for (const p of cw.panels) {
    panelMap.set(`${p.row}:${p.col}`, { kind: p.kind, materialId: p.materialId });
  }

  const rects: PanelRect[] = [];
  for (let r = 0; r < rows.length - 1; r++) {
    for (let c = 0; c < cols.length - 1; c++) {
      const cell = panelMap.get(`${r}:${c}`);
      const kind = cell?.kind ?? 'glazed';
      rects.push({
        row: r,
        col: c,
        x0: cols[c]!,
        x1: cols[c + 1]!,
        y0: rows[r]!,
        y1: rows[r + 1]!,
        kind,
        materialId: cell?.materialId,
      });
    }
  }

  const panelGroups = buildPanelsRawGroups(rects, basis);
  const mullionGroup = buildMullionsRawGroup(
    basis,
    cols,
    0,
    cw.height,
    cw.mullionThickness,
    cw.materialId,
  );
  const transomGroup = buildTransomsRawGroup(
    basis,
    0,
    basis.length,
    rows,
    cw.mullionThickness,
    cw.materialId,
  );

  const parts: RawGroup[] = [...panelGroups, mullionGroup, transomGroup];
  const concat = concatRaw(parts);
  return serializeDescriptor(concat, composeCurtainWallGeometryHash(cw, worldY));
};

export { composeCurtainWallGeometryHash, CURTAIN_WALL_HASH_SCHEMA_VERSION } from './_internal/curtain-wall/composeCurtainWallGeometryHash.js';
