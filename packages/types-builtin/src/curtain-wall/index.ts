// Built-in curtain-wall type catalogue (S13 v1 starter).
//
// Spec: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S13 D8 row,
// "Curtain-wall family schema complete in `packages/types-schema/curtain-wall.ts`".
// This file holds the v1 starter catalogue per SPEC-05 §7.3 — pure
// data, no Zod parse (the canonical CurtainWall schema lives in
// @pryzm/schemas; consumers bind a type id by setting either the CW
// `materialId` (mullion type) or a panel's `materialId` (panel type)
// at command time).
//
// Three sub-catalogues are exposed:
//   • BUILTIN_CURTAIN_WALL_TYPES — whole-system presets (mullion +
//     transom + default panel). Bound via `CurtainWall.materialId`.
//   • BUILTIN_CW_PANEL_TYPES     — per-cell panel types. Bound via
//     `CurtainPanel.materialId`.
//   • BUILTIN_CW_MULLION_TYPES   — mullion/transom profiles. Bound
//     via `CurtainWall.materialId` (mullion + transom share until
//     the schema separates them in S14).

export type CurtainWallFamily = 'unitised' | 'stick' | 'spider' | 'storefront';

export interface CurtainWallSystemType {
  /** Stable id — referenced by `CurtainWall.materialId`. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Family bucket per SPEC-05 §7.3. */
  readonly family: CurtainWallFamily;
  /** Default mullion thickness (m). */
  readonly mullionThickness: number;
  /** Default transom thickness (m).  Equal to mullion until S14. */
  readonly transomThickness: number;
  /** Default bay width (m) — column spacing. */
  readonly bayWidth: number;
  /** Default bay height (m) — row spacing. */
  readonly bayHeight: number;
  /** Default frame colour. */
  readonly frameColor: string;
  /** Default panel kind. */
  readonly defaultPanelKind: CurtainPanelKind;
}

export type CurtainPanelKind = 'glazed' | 'spandrel' | 'opaque' | 'door';

export interface CurtainWallPanelType {
  /** Stable id — referenced by `CurtainPanel.materialId`. */
  readonly id: string;
  readonly name: string;
  readonly kind: CurtainPanelKind;
  /** Default colour. */
  readonly color: string;
  /** Optional U-value (W/m²·K).  Carried for schedules. */
  readonly uValue?: number;
}

export interface CurtainWallMullionType {
  /** Stable id — bound via `CurtainWall.materialId` until the schema
   *  splits transom vs mullion in S14. */
  readonly id: string;
  readonly name: string;
  /** Frame profile depth × width (m × m). */
  readonly profile: { readonly depth: number; readonly width: number };
  readonly color: string;
  readonly material: 'aluminium' | 'steel' | 'timber';
}

// Whole-system presets ────────────────────────────────────────────

export const BUILTIN_CURTAIN_WALL_TYPES: readonly CurtainWallSystemType[] = Object.freeze([
  {
    id: 'curtainwall.unitised.standard',
    name: 'Unitised — Standard 1.5×3.0',
    family: 'unitised',
    mullionThickness: 0.05,
    transomThickness: 0.05,
    bayWidth: 1.5,
    bayHeight: 3.0,
    frameColor: '#3a3a3a',
    defaultPanelKind: 'glazed',
  },
  {
    id: 'curtainwall.stick.standard',
    name: 'Stick — Standard 1.2×2.7',
    family: 'stick',
    mullionThickness: 0.06,
    transomThickness: 0.06,
    bayWidth: 1.2,
    bayHeight: 2.7,
    frameColor: '#4a4a4a',
    defaultPanelKind: 'glazed',
  },
  {
    id: 'curtainwall.storefront.shopfront',
    name: 'Storefront — Shopfront 0.9×2.4',
    family: 'storefront',
    mullionThickness: 0.04,
    transomThickness: 0.04,
    bayWidth: 0.9,
    bayHeight: 2.4,
    frameColor: '#9a9a9a',
    defaultPanelKind: 'glazed',
  },
  {
    id: 'curtainwall.spider.point-fixed',
    name: 'Spider — Point-fixed glazing',
    family: 'spider',
    mullionThickness: 0.03,
    transomThickness: 0.03,
    bayWidth: 1.5,
    bayHeight: 3.0,
    frameColor: '#bdbdbd',
    defaultPanelKind: 'glazed',
  },
]);

// Panel sub-catalogue ─────────────────────────────────────────────

export const BUILTIN_CW_PANEL_TYPES: readonly CurtainWallPanelType[] = Object.freeze([
  {
    id: 'curtainwall.panel.glazed.standard',
    name: 'Glazed — Standard low-E',
    kind: 'glazed',
    color: '#88ccff',
    uValue: 1.4,
  },
  {
    id: 'curtainwall.panel.glazed.solar',
    name: 'Glazed — Solar control',
    kind: 'glazed',
    color: '#5a8fa8',
    uValue: 1.1,
  },
  {
    id: 'curtainwall.panel.spandrel.standard',
    name: 'Spandrel — Insulated',
    kind: 'spandrel',
    color: '#404040',
    uValue: 0.35,
  },
  {
    id: 'curtainwall.panel.opaque.composite',
    name: 'Opaque — Aluminium composite',
    kind: 'opaque',
    color: '#9a9a9a',
    uValue: 0.45,
  },
  {
    id: 'curtainwall.panel.door.entrance',
    name: 'Entrance door panel',
    kind: 'door',
    color: '#3d2510',
  },
]);

// Mullion / transom sub-catalogue ─────────────────────────────────

export const BUILTIN_CW_MULLION_TYPES: readonly CurtainWallMullionType[] = Object.freeze([
  {
    id: 'curtainwall.mullion.alu.50x80',
    name: 'Aluminium mullion — 50 × 80',
    profile: { depth: 0.08, width: 0.05 },
    color: '#3a3a3a',
    material: 'aluminium',
  },
  {
    id: 'curtainwall.mullion.alu.60x120',
    name: 'Aluminium mullion — 60 × 120',
    profile: { depth: 0.12, width: 0.06 },
    color: '#3a3a3a',
    material: 'aluminium',
  },
  {
    id: 'curtainwall.mullion.steel.40x150',
    name: 'Steel mullion — 40 × 150',
    profile: { depth: 0.15, width: 0.04 },
    color: '#2a2a2a',
    material: 'steel',
  },
  {
    id: 'curtainwall.mullion.timber.60x180',
    name: 'Timber mullion — 60 × 180',
    profile: { depth: 0.18, width: 0.06 },
    color: '#8b5a2b',
    material: 'timber',
  },
]);

// Lookup helpers ──────────────────────────────────────────────────

export const DEFAULT_CURTAIN_WALL_TYPE_ID = 'curtainwall.unitised.standard';
export const DEFAULT_CW_PANEL_TYPE_ID = 'curtainwall.panel.glazed.standard';
export const DEFAULT_CW_MULLION_TYPE_ID = 'curtainwall.mullion.alu.50x80';

export function getCurtainWallType(id: string): CurtainWallSystemType {
  const t = BUILTIN_CURTAIN_WALL_TYPES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown curtain-wall type id: ${id}`);
  return t;
}
export function getCurtainWallPanelType(id: string): CurtainWallPanelType {
  const t = BUILTIN_CW_PANEL_TYPES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown curtain-wall panel type id: ${id}`);
  return t;
}
export function getCurtainWallMullionType(id: string): CurtainWallMullionType {
  const t = BUILTIN_CW_MULLION_TYPES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown curtain-wall mullion type id: ${id}`);
  return t;
}
