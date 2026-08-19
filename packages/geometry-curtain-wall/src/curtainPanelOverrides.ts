// §L-1057 / C87 §13.1 CW-P — SPARSE PANEL OVERRIDES.
//
// ─── WHAT THIS SOLVES ─────────────────────────────────────────────────────────
// `CurtainPanelStore` is the declared AUTHORITY for panels (C87 §2) and was never
// persisted or loaded: zero matches for `curtainpanel` in both live persistence
// files. Every authored `panelType`, `materialOverride`, `materialId` and
// `hostedDoor` was destroyed on save, and the loss hid because
// `CurtainPanelSyncHandler` REGENERATES every cell as `SystemPanel_Glass`, so a
// reload returned the right cell count and a plausible façade (L-1057).
//
// ─── THE DESIGN, AND WHY IT IS THIS ONE (L-1035) ──────────────────────────────
// Persist only the panels that DIVERGE from what the grid would generate. A panel
// with no authored attribute is not written at all.
//
//   20x10 façade with 3 doors + 2 spandrels -> 5 records, not 200.
//   An untouched façade of any size          -> 0 records.
//   Save cost                                -> O(authored), not O(cells).
//
// THE ARGUMENT WORTH REMEMBERING: this turns today's FAILURE MECHANISM into the
// load path. L-1057 hides BECAUSE panels are already silently regenerated on
// load. Regeneration is not the bug — the absence of anything to re-apply on top
// of it is. So the mechanism that already works is kept and the missing layer
// added, rather than a working mechanism being replaced by a heavier one.
//
// It is also what the model already commits to: the grid is a PURE FUNCTION of
// (baseLine, height, bayWidth, bayHeight, gridSystem). Persisting every derived
// cell would store a function's OUTPUT beside its INPUTS, so a save could
// contradict its own model — the disease that makes denormalised copies go stale.
//
// ─── WHY THE KEY IS A GRID-LINE PAIR AND NOT (row, col) ───────────────────────
// Row/column indices shift the moment an unrelated grid line is inserted, which
// would silently re-target every override downstream of the insertion. A DOOR
// QUIETLY MOVING TO THE WRONG CELL IS WORSE THAN LOSING IT. The bounding lines
// `(uLineId, vLineId)` — the LOWER bound of the cell on each axis — name the cell
// through any insertion elsewhere in the grid. `gridSystem` is already serialised
// (`ProjectSerializer.ts:655`), so line identity already has a home in the file.
//
// ─── THE ONE REFUSAL THIS DESIGN OWES (C87 CW-P-D) ────────────────────────────
// An override whose bounding lines no longer exist — because the grid was edited
// between save and load — MUST be REPORTED BY NAME, never silently dropped
// (C84 EI-6: absence must be loud). {@link applyCurtainPanelOverrides} returns the
// lost overrides rather than swallowing them, and its caller reports them. **This
// is the single place this design can lose data, and it is therefore the single
// place a silent `catch` is forbidden.**
//
// ─── THE STABILITY GUARANTEE, AND THE DEFECT BUILDING THIS FOUND ──────────────
// Derived grid-line ids (`derivedGridLineId`) are stable under REGENERATION WITH
// THE SAME INPUTS — C73 §1.1, and exactly what this keying needs.
//
// ⚠ §L-1051 first made those ids `${ownerId}:${axis}:${index}` — DETERMINISTIC and
// AMBIGUOUS, which is worse than unstable. `cw-1:u:1` named u-line #1 of a 5-line
// grid AND of a 9-line grid, at t=0.25 and t=0.125: DIFFERENT PHYSICAL LINES,
// SAME ID. Under this design that silently re-targets an override onto a
// different cell on any re-space — the precise failure the grid-line-pair key
// exists to prevent — and the CW-P-D refusal could never fire, because the lookup
// always succeeded. **This test suite is what caught it**; the arm that was
// supposed to observe a refusal observed a successful write instead.
//
// §L-1058 keys the id on `t`, the line's POSITION, so two lines share an id
// exactly when they ARE the same line. The consequences are both correct and both
// asserted below:
//   • re-space 1.5 m -> 0.75 m: the door's line t=0.25 still exists, so the
//     override lands on the cell with the SAME LEFT EDGE. Its ordinal moved 1 -> 2;
//     the door did not move in space, which is what the user meant.
//   • re-space 1.5 m -> 1.0 m: t=0.25 is NOT among 0, 1/6, 2/6 …, so the bounding
//     line genuinely ceases to exist, the override is REFUSED and REPORTED, and
//     nothing else on the wall silently becomes a door.
//
// In practice the window is narrow anyway: once any grid line is inserted,
// `gridSystem` is PRESENT and persisted, `migrateToGridSystem` never runs for that
// wall again, and `insertGridLine` mints a fresh id only for the NEW line.
//
// ─── SCOPE ────────────────────────────────────────────────────────────────────
// STORAGE AND LOAD ONLY. Runtime materialisation is unchanged: every cell still
// exists in memory for rendering and picking. Whether the RUNTIME store should
// also become sparse is NOT MEASURED and must not be answered until panel-store
// memory has been measured on a real project (C87 CW-P-F).
//
// This module is deliberately a MODULE and not a closure inside the serializer or
// the loader. A mapping that lives inside `initTools` was unreachable from any
// suite, and that is how six constant-false reads survived in the curtain-wall
// create bridge (L-972). Anything you cannot reach from a test, extract.

import { migrateToGridSystem, type CurtainGridSystem } from './CurtainGridSystem';
import type { CurtainPanelData, CurtainPanelHostedDoor, PanelType } from './CurtainPanelTypes';

/**
 * The panel type `CurtainPanelSyncHandler` mints for a brand-new cell
 * (`CurtainPanelSyncHandler.ts:168`). A panel still holding it is DERIVED, not
 * authored, and is therefore not persisted.
 */
export const REGENERATED_PANEL_TYPE: PanelType = 'SystemPanel_Glass';

/** The minimum of `CurtainWallData` this module needs to resolve a grid. */
export interface GridBearingWall {
  readonly id: string;
  readonly baseLine: readonly [{ x: number; y?: number; z: number }, { x: number; y?: number; z: number }];
  readonly height: number;
  readonly gridXSpacing: number;
  readonly gridYSpacing: number;
  readonly gridSystem?: CurtainGridSystem | undefined;
}

/**
 * The grid a wall actually has — stored if present, migrated if not.
 *
 * ONE ANSWER PER QUESTION (C84 EI-9). `CurtainPanelSyncHandler:89`,
 * `CurtainWallBuilder:1136`/`:1814`, both grid-line handlers and both property-panel
 * editors each spell this `??` out inline, which is how two of them came to pass the
 * WRONG spacing fields (L-1052). The save and load halves of the override layer MUST
 * agree about the grid or every override is keyed against a different one, so they
 * share this rather than each writing it out.
 */
export function resolveCurtainGrid(cw: GridBearingWall): CurtainGridSystem {
  if (cw.gridSystem) return cw.gridSystem;
  const [s0, s1] = cw.baseLine;
  const dx = s1.x - s0.x, dy = (s1.y ?? 0) - (s0.y ?? 0), dz = s1.z - s0.z;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return migrateToGridSystem(length, cw.height, cw.gridXSpacing, cw.gridYSpacing, cw.id);
}

/**
 * One authored panel, keyed by the grid lines that bound its cell.
 *
 * Only fields the user actually authored are present. An absent field means
 * "whatever regeneration produces", which is the whole point of the design.
 */
export interface CurtainPanelOverride {
  readonly curtainWallId: string;
  /** `id` of the u-line at the cell's LOWER u bound. */
  readonly uLineId: string;
  /** `id` of the v-line at the cell's LOWER v bound. */
  readonly vLineId: string;
  readonly panelType?: PanelType;
  /** Raw hex tint (`CurtainPanelTypes.ts:141`). */
  readonly materialOverride?: string;
  /** C100 master-catalogue material id (`CurtainPanelTypes.ts:171`). */
  readonly materialId?: string;
  readonly hostedDoor?: CurtainPanelHostedDoor;
}

/** What a regeneration of this wall would produce for an untouched cell. */
export interface RegenerationBaseline {
  /** `CurtainWallData.glazingMaterialId` — inherited by every NEW cell
   *  (`CurtainPanelSyncHandler.ts:187-189`). A panel still holding it is derived. */
  readonly glazingMaterialId?: string | undefined;
}

/**
 * Is this panel AUTHORED — i.e. does it differ from what regeneration would
 * produce for its cell?
 *
 * Every clause names the line that establishes the baseline, because a wrong
 * baseline here does not fail loudly: it silently classifies an authored panel as
 * derived and drops it on save, which is L-1057 again with extra steps.
 */
export function isAuthoredPanel(
  panel: Pick<CurtainPanelData, 'panelType' | 'materialOverride' | 'materialId' | 'hostedDoor'>,
  baseline: RegenerationBaseline,
): boolean {
  if (panel.panelType !== REGENERATED_PANEL_TYPE) return true;      // :168
  if (panel.materialOverride !== undefined) return true;            // never set by regeneration
  if (panel.hostedDoor !== undefined) return true;                  // never set by regeneration
  // `materialId` IS set by regeneration, to the wall's glazing default — so it is
  // authored only when it DIFFERS from that default. Comparing against `undefined`
  // here would persist every panel of every wall that has a glazing material.
  if (panel.materialId !== baseline.glazingMaterialId) return true; // :187-189
  return false;
}

/** The `(uLineId, vLineId)` bounding a cell, or `null` if the cell is off-grid. */
export function cellToLineIds(
  grid: CurtainGridSystem,
  i: number,
  j: number,
): { uLineId: string; vLineId: string } | null {
  // A cell spans lines [i, i+1] x [j, j+1], so the last line on each axis bounds
  // no cell from below — hence `length - 1`.
  if (!Number.isInteger(i) || i < 0 || i >= grid.uLines.length - 1) return null;
  if (!Number.isInteger(j) || j < 0 || j >= grid.vLines.length - 1) return null;
  const u = grid.uLines[i];
  const v = grid.vLines[j];
  if (!u || !v) return null;
  return { uLineId: u.id, vLineId: v.id };
}

/** The cell `(i, j)` bounded by these lines, or `null` if either has gone. */
export function lineIdsToCell(
  grid: CurtainGridSystem,
  uLineId: string,
  vLineId: string,
): { i: number; j: number } | null {
  const i = grid.uLines.findIndex(l => l.id === uLineId);
  const j = grid.vLines.findIndex(l => l.id === vLineId);
  if (i < 0 || j < 0) return null;
  // A line that survived but is now the LAST on its axis bounds no cell.
  if (i >= grid.uLines.length - 1 || j >= grid.vLines.length - 1) return null;
  return { i, j };
}

/**
 * The sparse override set for one wall. Panels that match the regeneration
 * baseline are omitted entirely — that is the design, not an optimisation.
 *
 * A panel whose cell is off-grid is skipped and RETURNED in `unaddressable` so the
 * caller can report it; it is not silently dropped.
 */
export function collectCurtainPanelOverrides(
  curtainWallId: string,
  grid: CurtainGridSystem,
  panels: readonly CurtainPanelData[],
  baseline: RegenerationBaseline,
): { overrides: CurtainPanelOverride[]; unaddressable: CurtainPanelData[] } {
  const overrides: CurtainPanelOverride[] = [];
  const unaddressable: CurtainPanelData[] = [];

  for (const p of panels) {
    if (!isAuthoredPanel(p, baseline)) continue;
    const key = cellToLineIds(grid, p.cellIndex[0], p.cellIndex[1]);
    if (!key) { unaddressable.push(p); continue; }

    const o: {
      -readonly [K in keyof CurtainPanelOverride]: CurtainPanelOverride[K]
    } = { curtainWallId, uLineId: key.uLineId, vLineId: key.vLineId };

    if (p.panelType !== REGENERATED_PANEL_TYPE) o.panelType = p.panelType;
    if (p.materialOverride !== undefined) o.materialOverride = p.materialOverride;
    if (p.materialId !== baseline.glazingMaterialId) o.materialId = p.materialId;
    if (p.hostedDoor !== undefined) o.hostedDoor = p.hostedDoor;

    overrides.push(o);
  }
  return { overrides, unaddressable };
}

/** The subset of `CurtainPanelStore` this module needs — duck-typed so the
 *  persistence layer can pass the real store without this package importing it. */
export interface PanelUpdateTarget {
  getByCellIndex(curtainWallId: string, i: number, j: number): CurtainPanelData | undefined;
  update(id: string, updates: Partial<CurtainPanelData>): void;
}

/** An override that could not be placed, with the reason, for reporting. */
export interface LostOverride {
  readonly override: CurtainPanelOverride;
  readonly reason: 'grid-line-gone' | 'no-panel-at-cell';
}

/**
 * Re-apply overrides ON TOP of the regenerated panels.
 *
 * MUST be called AFTER the wall is in `CurtainWallStore` — `add()` synchronously
 * drives `CurtainPanelSyncHandler`, which mints a panel per cell and SKIPS cells
 * that already have one. Applying before the wall exists would find no cells;
 * inserting records directly would fight the sync handler. Neither is correct.
 *
 * ⛔ Returns `lost` rather than swallowing it. C87 CW-P-D: the caller MUST report
 * every entry by name. This is the single place this design can lose data.
 */
export function applyCurtainPanelOverrides(
  store: PanelUpdateTarget,
  grid: CurtainGridSystem,
  overrides: readonly CurtainPanelOverride[],
): { applied: number; lost: LostOverride[] } {
  let applied = 0;
  const lost: LostOverride[] = [];

  for (const o of overrides) {
    const cell = lineIdsToCell(grid, o.uLineId, o.vLineId);
    if (!cell) { lost.push({ override: o, reason: 'grid-line-gone' }); continue; }

    const panel = store.getByCellIndex(o.curtainWallId, cell.i, cell.j);
    if (!panel) { lost.push({ override: o, reason: 'no-panel-at-cell' }); continue; }

    const updates: Partial<CurtainPanelData> = {};
    if (o.panelType !== undefined) updates.panelType = o.panelType;
    if (o.materialOverride !== undefined) updates.materialOverride = o.materialOverride;
    if (o.materialId !== undefined) updates.materialId = o.materialId;
    if (o.hostedDoor !== undefined) updates.hostedDoor = o.hostedDoor;
    if (Object.keys(updates).length === 0) continue;

    store.update(panel.id, updates);
    applied++;
  }
  return { applied, lost };
}

/** The report line for a lost override. Exported so the serializer, the loader and
 *  any future importer all say the same thing (C84 EI-9). */
export function describeLostOverride(l: LostOverride): string {
  const what = [
    l.override.panelType,
    l.override.hostedDoor ? 'hostedDoor' : undefined,
    l.override.materialId,
    l.override.materialOverride,
  ].filter(Boolean).join(' + ') || '(no fields)';
  return l.reason === 'grid-line-gone'
    ? `curtain wall '${l.override.curtainWallId}': authored panel [${what}] was pinned to grid lines `
      + `'${l.override.uLineId}' x '${l.override.vLineId}', which no longer exist — the grid was edited `
      + 'after this project was saved, so the cell it named is gone. The override was NOT applied and '
      + 'is NOT re-targeted onto a different cell (C87 CW-P-D: a door in the wrong cell is worse than '
      + 'a door reported missing).'
    : `curtain wall '${l.override.curtainWallId}': authored panel [${what}] resolved to cell `
      + `[${l.override.uLineId} x ${l.override.vLineId}] but no panel exists there. This is a BUG, not a `
      + 'grid edit — the sync handler should have regenerated every cell before overrides were applied.';
}
