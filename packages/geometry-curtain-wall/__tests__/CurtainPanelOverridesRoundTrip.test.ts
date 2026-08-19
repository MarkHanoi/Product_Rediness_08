// §L-1057 / C87 §13.1 CW-P — THE SPARSE OVERRIDE LAYER, PROVEN AGAINST THE REAL STORES.
//
// Its sibling `CurtainPanelAuthoringIsNotPersisted.test.ts` is the RED this file
// answers, and it is deliberately KEPT rather than rewritten: it pins the raw
// mechanism — carrying only the wall record loses the door — which is still true
// and is exactly why an override layer is needed. This file proves that carrying
// the wall record PLUS the sparse overrides does not.
//
// Everything here is real: `CurtainWallStore`, `CurtainPanelStore` and
// `CurtainPanelSyncHandler` as `initBuilders.ts:328,:331` construct them. The
// save/load boundary is a `JSON.parse(JSON.stringify(...))` of exactly what the
// serializer writes and the loader reads — the wall record and the override array,
// and nothing else. If a field is not in one of those two, it does not cross.

import { describe, expect, it, beforeEach } from 'vitest';
import { CurtainWallStore } from '../src/CurtainWallStore';
import { CurtainPanelStore } from '../src/CurtainPanelStore';
import { CurtainPanelSyncHandler } from '../src/CurtainPanelSyncHandler';
import { migrateToGridSystem } from '../src/CurtainGridSystem';
import {
  collectCurtainPanelOverrides,
  applyCurtainPanelOverrides,
  isAuthoredPanel,
  lineIdsToCell,
  describeLostOverride,
  type CurtainPanelOverride,
} from '../src/curtainPanelOverrides';
import type { CurtainWallData } from '../src/CurtainWallTypes';

const CW_ID = 'cw-facade';
const LEN = 6, HEIGHT = 3, BAY = 1.5;   // 4 columns x 2 rows = 8 cells

function makeWall(over: Partial<CurtainWallData> = {}): CurtainWallData {
  return {
    id: CW_ID,
    type: 'curtain-wall',
    levelId: 'L0',
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: LEN, y: 0, z: 0 }],
    height: HEIGHT,
    baseOffset: 0,
    gridXSpacing: BAY,
    gridYSpacing: BAY,
    mullionSize: 0.05,
    panelThickness: 0.05,
    ...over,
  } as unknown as CurtainWallData;
}

function session() {
  const cwStore = new CurtainWallStore();
  const panelStore = new CurtainPanelStore();
  const sync = new CurtainPanelSyncHandler(cwStore, panelStore);
  sync.activate();
  return { cwStore, panelStore };
}

/** The grid the sync handler used — same resolution, same arguments. */
function gridOf(cw: CurtainWallData) {
  return cw.gridSystem ?? migrateToGridSystem(LEN, cw.height, cw.gridXSpacing, cw.gridYSpacing, cw.id);
}

/** SAVE: the wall record + the sparse overrides, serialised, exactly as the
 *  snapshot carries them. LOAD: fresh stores, wall re-added (which regenerates
 *  every panel as glass), then overrides re-applied on top. */
function saveAndReload(from: ReturnType<typeof session>) {
  const cw = from.cwStore.get(CW_ID) as unknown as CurtainWallData;
  const { overrides } = collectCurtainPanelOverrides(
    CW_ID, gridOf(cw), from.panelStore.getByCurtainWallId(CW_ID),
    { glazingMaterialId: cw.glazingMaterialId },
  );
  const wire = JSON.parse(JSON.stringify({ cw, overrides })) as {
    cw: CurtainWallData; overrides: CurtainPanelOverride[];
  };

  const to = session();
  to.cwStore.add(wire.cw);
  const result = applyCurtainPanelOverrides(to.panelStore, gridOf(wire.cw), wire.overrides);
  return { ...to, wire, result };
}

describe('§L-1057 — authored panels survive save/load as sparse overrides', () => {
  let first: ReturnType<typeof session>;

  beforeEach(() => {
    first = session();
    first.cwStore.add(makeWall());
  });

  it('an UNTOUCHED façade writes ZERO overrides — the design, not an optimisation', () => {
    const cw = first.cwStore.get(CW_ID) as unknown as CurtainWallData;
    const panels = first.panelStore.getByCurtainWallId(CW_ID);
    expect(panels).toHaveLength(8);                       // 4 cols x 2 rows, all regenerated

    const { overrides, unaddressable } = collectCurtainPanelOverrides(
      CW_ID, gridOf(cw), panels, { glazingMaterialId: cw.glazingMaterialId });
    expect(overrides).toHaveLength(0);
    expect(unaddressable).toHaveLength(0);
  });

  it('THE FIX — a door authored in one cell comes back a door', () => {
    const target = first.panelStore.getByCellIndex(CW_ID, 0, 0)!;
    first.panelStore.update(target.id, {
      panelType: 'SystemPanel_Door',
      materialOverride: '#8a5a33',
    });

    const after = saveAndReload(first);

    // Sparse: 8 cells, ONE record written.
    expect(after.wire.overrides).toHaveLength(1);
    expect(after.result).toEqual({ applied: 1, lost: [] });

    const reloaded = after.panelStore.getByCellIndex(CW_ID, 0, 0)!;
    expect(reloaded.panelType).toBe('SystemPanel_Door');
    expect(reloaded.materialOverride).toBe('#8a5a33');

    // …and every other cell is still regenerated glass, untouched.
    const others = after.panelStore.getByCurtainWallId(CW_ID).filter(p => p.id !== reloaded.id);
    expect(others).toHaveLength(7);
    for (const p of others) expect(p.panelType).toBe('SystemPanel_Glass');
  });

  it('`hostedDoor`\'s six fields survive — C87 §11 #7 closed by the same layer', () => {
    const target = first.panelStore.getByCellIndex(CW_ID, 1, 0)!;
    const door = {
      frameColor: '#402a18', leafColor: '#8a5a33', hingesSide: 'left',
      swingDirection: 'outward', sillHeight: 0.02, frameThickness: 0.06,
    };
    first.panelStore.update(target.id, { panelType: 'SystemPanel_Door', hostedDoor: door as never });

    const after = saveAndReload(first);
    const reloaded = after.panelStore.getByCellIndex(CW_ID, 1, 0)! as { hostedDoor?: typeof door };
    expect(reloaded.hostedDoor).toEqual(door);
  });

  it('a panel holding the wall\'s glazing default is DERIVED, not authored', () => {
    // The sync handler inherits `cw.glazingMaterialId` into every new cell
    // (`CurtainPanelSyncHandler.ts:187-189`). Comparing `materialId` against
    // `undefined` instead of against that baseline would persist EVERY panel of
    // EVERY wall that has a glazing material — the sparse design silently
    // collapsing back into a dense one.
    const s = session();
    s.cwStore.add(makeWall({ glazingMaterialId: 'glass-reflective' } as Partial<CurtainWallData>));
    const cw = s.cwStore.get(CW_ID) as unknown as CurtainWallData;
    const panels = s.panelStore.getByCurtainWallId(CW_ID);
    expect(panels[0]!.materialId).toBe('glass-reflective');      // inherited, not authored

    const { overrides } = collectCurtainPanelOverrides(
      CW_ID, gridOf(cw), panels, { glazingMaterialId: cw.glazingMaterialId });
    expect(overrides).toHaveLength(0);

    // …but authoring one cell AWAY from the default is a real override.
    s.panelStore.update(panels[0]!.id, { materialId: 'stone-marble-carrara' });
    const second = collectCurtainPanelOverrides(
      CW_ID, gridOf(cw), s.panelStore.getByCurtainWallId(CW_ID),
      { glazingMaterialId: cw.glazingMaterialId });
    expect(second.overrides).toHaveLength(1);
    expect(second.overrides[0]!.materialId).toBe('stone-marble-carrara');
  });

  it('the key is the grid-line PAIR, so an inserted line does not re-target it', () => {
    // C87 CW-P-B. Author a door at column 2, then insert a u-line to the LEFT of
    // it. Under (row, col) keying the door would silently move one cell right.
    const target = first.panelStore.getByCellIndex(CW_ID, 2, 0)!;
    first.panelStore.update(target.id, { panelType: 'SystemPanel_Door' });

    const cw = first.cwStore.get(CW_ID) as unknown as CurtainWallData;
    const grid = gridOf(cw);
    const { overrides } = collectCurtainPanelOverrides(
      CW_ID, grid, first.panelStore.getByCurtainWallId(CW_ID),
      { glazingMaterialId: cw.glazingMaterialId });
    expect(overrides).toHaveLength(1);
    const pinnedU = overrides[0]!.uLineId;

    // Insert a new u-line at t=0.1 — before the door's column. Indices shift by 1;
    // the door's bounding LINE does not change identity.
    const widened = {
      uLines: [...grid.uLines, { id: 'u-inserted', t: 0.1 }].sort((a, b) => a.t - b.t),
      vLines: grid.vLines,
    };
    const cell = lineIdsToCell(widened, pinnedU, overrides[0]!.vLineId);
    expect(cell).not.toBeNull();
    expect(cell!.i).toBe(3);         // was column 2, now column 3 — SAME physical cell
  });

  it('a re-space that PRESERVES the line position keeps the door where the user put it', () => {
    // §L-1058, the good half — and it is the arm that proves position-keying is
    // right rather than merely different. The door sits at u t=0.25. Re-spacing
    // 1.5 m -> 0.75 m doubles the columns, so its ORDINAL moves 1 -> 2 — but
    // t=0.25 is still a real line, so the override lands on the cell with the same
    // LEFT EDGE. The door does not move in space, which is what the user means.
    const target = first.panelStore.getByCellIndex(CW_ID, 1, 0)!;
    first.panelStore.update(target.id, { panelType: 'SystemPanel_Door' });

    const cw = first.cwStore.get(CW_ID) as unknown as CurtainWallData;
    const { overrides } = collectCurtainPanelOverrides(
      CW_ID, gridOf(cw), first.panelStore.getByCurtainWallId(CW_ID),
      { glazingMaterialId: cw.glazingMaterialId });
    expect(overrides[0]!.uLineId).toContain('0.250000');

    const respaced = migrateToGridSystem(LEN, HEIGHT, 0.75, BAY, CW_ID);
    const cell = lineIdsToCell(respaced, overrides[0]!.uLineId, overrides[0]!.vLineId);
    expect(cell).toEqual({ i: 2, j: 0 });                      // ordinal moved, position did not
    expect(respaced.uLines[2]!.t).toBeCloseTo(0.25, 6);
  });

  it('CW-P-D — an override whose grid line is GONE is reported, never silently dropped', () => {
    const target = first.panelStore.getByCellIndex(CW_ID, 1, 0)!;
    first.panelStore.update(target.id, { panelType: 'SystemPanel_Spandrel' as never });

    const cw = first.cwStore.get(CW_ID) as unknown as CurtainWallData;
    const { overrides } = collectCurtainPanelOverrides(
      CW_ID, gridOf(cw), first.panelStore.getByCurtainWallId(CW_ID),
      { glazingMaterialId: cw.glazingMaterialId });

    // Re-space 1.5 -> 1.0 m: 6 bays at t = 0, 1/6, 2/6 ... and 0.25 is NOT among
    // them. The door's bounding line genuinely ceases to exist — which is the ONLY
    // case this design can lose data, and the case CW-P-D exists for.
    const respaced = migrateToGridSystem(LEN, HEIGHT, 1.0, BAY, CW_ID);
    expect(respaced.uLines.some(l => Math.abs(l.t - 0.25) < 1e-6)).toBe(false);

    const to = session();
    to.cwStore.add(makeWall({ gridXSpacing: 1.0 } as Partial<CurtainWallData>));
    const result = applyCurtainPanelOverrides(to.panelStore, respaced, overrides);

    expect(result.applied).toBe(0);
    expect(result.lost).toHaveLength(1);
    expect(result.lost[0]!.reason).toBe('grid-line-gone');

    // The report must NAME the wall and say what was lost — a count is not a report.
    const msg = describeLostOverride(result.lost[0]!);
    expect(msg).toContain(CW_ID);
    expect(msg).toContain('SystemPanel_Spandrel');
    expect(msg).toMatch(/no longer exist/);

    // ⚠ AND IT IS NOT SILENTLY RE-TARGETED. Nothing in the reloaded wall became a
    // spandrel — the loss is total and reported, not partial and hidden.
    for (const p of to.panelStore.getByCurtainWallId(CW_ID)) {
      expect(p.panelType).toBe('SystemPanel_Glass');
    }
  });

  it('isAuthoredPanel is exact at the boundary — glass with no extras is derived', () => {
    expect(isAuthoredPanel({ panelType: 'SystemPanel_Glass' }, {})).toBe(false);
    expect(isAuthoredPanel({ panelType: 'SystemPanel_Door' }, {})).toBe(true);
    expect(isAuthoredPanel({ panelType: 'SystemPanel_Glass', materialOverride: '#fff' }, {})).toBe(true);
    expect(isAuthoredPanel({ panelType: 'SystemPanel_Glass', hostedDoor: {} as never }, {})).toBe(true);
    expect(isAuthoredPanel({ panelType: 'SystemPanel_Glass', materialId: 'g' }, { glazingMaterialId: 'g' })).toBe(false);
    expect(isAuthoredPanel({ panelType: 'SystemPanel_Glass', materialId: 'x' }, { glazingMaterialId: 'g' })).toBe(true);
  });
});
