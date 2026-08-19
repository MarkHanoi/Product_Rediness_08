// §CW-2 / C87 §13.4 CW-Attr-1 — OFFSET FROM CENTRELINE, PROVEN AT BOTH ENDS.
//
// The founder asked for per-panel "offset from centreline". A field that renders
// but does not persist is L-1057 with a new name, and a field that persists but
// does not render is the L-1038 family (a stored id the pixel disagrees with).
// So this file asserts BOTH ends and the exclusion that keeps them consistent.

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { buildPanelObject } from '../src/CurtainPanelFactory';
import { computeCurtainCells } from '../src/CurtainCellComputer';
import { migrateToGridSystem } from '../src/CurtainGridSystem';
import {
  isAuthoredPanel,
  collectCurtainPanelOverrides,
  applyCurtainPanelOverrides,
} from '../src/curtainPanelOverrides';
import type { CurtainPanelData } from '../src/CurtainPanelTypes';

const CW_ID = 'cw-offset';
const GRID = migrateToGridSystem(6, 3, 1.5, 1.5, CW_ID);

function panel(over: Partial<CurtainPanelData> = {}): CurtainPanelData {
  return {
    id: `${CW_ID}::0:0`, type: 'curtain-panel', levelId: 'L0',
    curtainWallId: CW_ID, cellIndex: [0, 0], panelType: 'SystemPanel_Glass',
    ...over,
  } as unknown as CurtainPanelData;
}

describe('§CW-2 — offsetFromCentreline reaches the mesh AND the file', () => {
  it('the panel mesh sits at z = the offset; 0 is the centreline', () => {
    const cells = computeCurtainCells(GRID, 6, 3);
    const cell = cells.find(c => c.i === 0 && c.j === 0)!;
    const at = (off?: number) => {
      const o = buildPanelObject({
        cell, panelData: panel(off === undefined ? {} : { offsetFromCentreline: off }),
        mullionSize: 0.05, panelThickness: 0.05,
      }) as THREE.Mesh;
      return o.position.z;
    };
    expect(at(undefined)).toBe(0);      // the literal this field replaced
    expect(at(0.12)).toBeCloseTo(0.12, 6);
    expect(at(-0.08)).toBeCloseTo(-0.08, 6);   // signed: a recess is negative
  });

  it('a NON-FINITE offset falls back to the centreline instead of vanishing', () => {
    // NaN in a position makes the matrix non-invertible and the panel disappears
    // with no error — the L-1052 shape (a bad input producing a silently empty
    // result). Guarded at the point of use.
    const cells = computeCurtainCells(GRID, 6, 3);
    const cell = cells.find(c => c.i === 0 && c.j === 0)!;
    const o = buildPanelObject({
      cell, panelData: panel({ offsetFromCentreline: NaN }),
      mullionSize: 0.05, panelThickness: 0.05,
    }) as THREE.Mesh;
    expect(o.position.z).toBe(0);
  });

  it('an offset makes a panel AUTHORED, and returning it to 0 makes it derived again', () => {
    expect(isAuthoredPanel(panel(), {})).toBe(false);
    expect(isAuthoredPanel(panel({ offsetFromCentreline: 0.12 }), {})).toBe(true);
    // Compared against 0, not `undefined`: a panel explicitly set back to flush has
    // returned to the derived state and must STOP being persisted, or the sparse
    // override set only ever grows.
    expect(isAuthoredPanel(panel({ offsetFromCentreline: 0 }), {})).toBe(false);
  });

  it('the offset survives the save/load round trip', () => {
    const authored = panel({ offsetFromCentreline: -0.08 });
    const { overrides } = collectCurtainPanelOverrides(CW_ID, GRID, [authored], {});
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.offsetFromCentreline).toBeCloseTo(-0.08, 6);

    const wire = JSON.parse(JSON.stringify(overrides));
    const written: Record<string, Partial<CurtainPanelData>> = {};
    const store = {
      getByCellIndex: () => panel(),
      update: (id: string, u: Partial<CurtainPanelData>) => { written[id] = u; },
    };
    const r = applyCurtainPanelOverrides(store, GRID, wire);
    expect(r).toEqual({ applied: 1, lost: [] });
    expect(written[`${CW_ID}::0:0`]!.offsetFromCentreline).toBeCloseTo(-0.08, 6);
  });
});
