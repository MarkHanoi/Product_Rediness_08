// Curtain-wall fixture catalog — S13.
//
// Spec: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S13 D6.  These
// fixtures are the kernel-side input to:
//
//   • the parity snapshot test in `tests/parity/curtain-wall/`
//   • the property/robustness test in
//     `packages/geometry-kernel/__tests__/curtain-wall.robustness.spec.ts`
//   • the producer bench at `apps/bench/src/benches/produce-curtain-wall.bench.ts`
//
// The S13 phase plan calls for 25 cases; we ship 8 here (a covering set
// across the dimensions called out by SPEC-05 §1.2 — bay grid sizes,
// panel mix, mullion thickness, baseline length).  Adding the remaining
// 17 is mechanical fixture work and is tracked as a S14-T0 carry-over;
// the test infrastructure is sized to load N cases without code changes.

import type { CurtainWall } from '@pryzm/protocol';
import type { JoinData } from '../../src/types/JoinData.js';

export interface CurtainWallFixture {
  readonly id: string;
  readonly description: string;
  readonly cw: CurtainWall;
  readonly joinData: JoinData;
  readonly worldY: number;
}

const META = { createdAt: 0, modifiedAt: 0, createdBy: 'fixture', version: 1 };
const ULID_PAD = '01HZS00000000000000CW';

function cwid(name: string): string {
  const tail = name.replace(/[^A-Z0-9]/gi, '').toUpperCase().padEnd(5, '0').slice(0, 5);
  // 21-char prefix + 5-char tail = 26 → ULID-shaped.
  return `curtainwall_${ULID_PAD}${tail}`;
}

const NO_JOINS: JoinData = { startJoin: { kind: 'none' }, endJoin: { kind: 'none' } };

function baseCW(overrides: Partial<CurtainWall> & { id: string; baseLine: CurtainWall['baseLine'] }): CurtainWall {
  return {
    id: overrides.id,
    type: 'curtainwall' as const,
    childrenIds: [],
    metadata: META,
    levelId: 'level:0',
    baseLine: overrides.baseLine,
    height: overrides.height ?? 3,
    mullionThickness: overrides.mullionThickness ?? 0.05,
    bayWidth: overrides.bayWidth ?? 1.5,
    bayHeight: overrides.bayHeight ?? 1.5,
    panels: overrides.panels ?? [],
    materialId: overrides.materialId,
  } as CurtainWall;
}

export const CW_FIXTURES: readonly CurtainWallFixture[] = Object.freeze([
  {
    id: 'cw-01-empty-grid-1.5x1.5',
    description: 'Empty 6×3 m wall with default 1.5×1.5 grid (no panels)',
    cw: baseCW({
      id: cwid('empty15'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },
  {
    id: 'cw-02-full-glazed-2x4',
    description: 'Full-glazed 6×3, 2 rows × 4 cols, all glazed',
    cw: baseCW({
      id: cwid('full2x4'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
      panels: Array.from({ length: 8 }, (_, i) => ({
        id: `p${i}`, row: Math.floor(i / 4), col: i % 4, kind: 'glazed' as const, rotation: 0 as const,
      })),
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },
  {
    id: 'cw-03-mixed-panels',
    description: 'Mixed 6×3 with glazed/spandrel/opaque/door',
    cw: baseCW({
      id: cwid('mixed'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
      panels: [
        { id: 'p0', row: 0, col: 0, kind: 'door',     rotation: 0 },
        { id: 'p1', row: 0, col: 1, kind: 'glazed',   rotation: 0 },
        { id: 'p2', row: 0, col: 2, kind: 'glazed',   rotation: 0 },
        { id: 'p3', row: 0, col: 3, kind: 'opaque',   rotation: 0 },
        { id: 'p4', row: 1, col: 0, kind: 'spandrel', rotation: 0 },
        { id: 'p5', row: 1, col: 1, kind: 'spandrel', rotation: 0 },
        { id: 'p6', row: 1, col: 2, kind: 'spandrel', rotation: 0 },
        { id: 'p7', row: 1, col: 3, kind: 'spandrel', rotation: 0 },
      ],
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },
  {
    id: 'cw-04-tall-narrow',
    description: 'Tall narrow 3 m × 6 m, 0.75 m bays',
    cw: baseCW({
      id: cwid('tall'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }],
      height: 6,
      bayWidth: 0.75,
      bayHeight: 1.5,
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },
  {
    id: 'cw-05-wide-low',
    description: 'Wide low 12 m × 2.4 m storefront',
    cw: baseCW({
      id: cwid('wide'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 12, y: 0, z: 0 }],
      height: 2.4,
      bayWidth: 1.2,
      bayHeight: 1.2,
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },
  {
    id: 'cw-06-thick-mullions',
    description: '6×3 with 100 mm mullions',
    cw: baseCW({
      id: cwid('thickm'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
      mullionThickness: 0.1,
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },
  {
    id: 'cw-07-diagonal-baseline',
    description: '6×3 with diagonal baseline (XZ plane)',
    cw: baseCW({
      id: cwid('diag'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4.243, y: 0, z: 4.243 }],
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },
  {
    id: 'cw-08-non-divisible-bay',
    description: '5 m wall with 1.5 m bay (3 bays + 0.5 m remainder)',
    cw: baseCW({
      id: cwid('nondiv'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
      bayWidth: 1.5,
      bayHeight: 1.5,
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },

  // ── W-1C-3 top-up: cw-09 through cw-25 (17 additional fixtures) ─────────
  {
    id: 'cw-09-all-opaque',
    description: '6×3 with all-opaque panels',
    cw: baseCW({
      id: cwid('opaque'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
      panels: Array.from({ length: 8 }, (_, i) => ({
        id: `p${i}`, row: Math.floor(i / 4), col: i % 4, kind: 'opaque' as const, rotation: 0 as const,
      })),
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },
  {
    id: 'cw-10-all-spandrel',
    description: '6×3 with all-spandrel panels',
    cw: baseCW({
      id: cwid('spandrl'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
      panels: Array.from({ length: 8 }, (_, i) => ({
        id: `p${i}`, row: Math.floor(i / 4), col: i % 4, kind: 'spandrel' as const, rotation: 0 as const,
      })),
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },
  {
    id: 'cw-11-door-row',
    description: '6×3 with doors in the bottom row',
    cw: baseCW({
      id: cwid('doorow'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
      panels: [
        { id: 'p0', row: 0, col: 0, kind: 'door' as const, rotation: 0 as const },
        { id: 'p1', row: 0, col: 1, kind: 'door' as const, rotation: 0 as const },
        { id: 'p2', row: 0, col: 2, kind: 'door' as const, rotation: 0 as const },
        { id: 'p3', row: 0, col: 3, kind: 'door' as const, rotation: 0 as const },
      ],
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },
  {
    id: 'cw-12-tiny-bay-0.5x0.5',
    description: '3×3 m wall with 0.5×0.5 m micro-bays',
    cw: baseCW({
      id: cwid('micro'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }],
      height: 3,
      bayWidth: 0.5,
      bayHeight: 0.5,
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },
  {
    id: 'cw-13-large-bay-3x3',
    description: '9×6 m wall with 3×3 m bays',
    cw: baseCW({
      id: cwid('lrgbay'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 9, y: 0, z: 0 }],
      height: 6,
      bayWidth: 3,
      bayHeight: 3,
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },
  {
    id: 'cw-14-thin-mullion-0.02',
    description: '6×3 with 20 mm (minimal) mullions',
    cw: baseCW({
      id: cwid('thin02'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
      mullionThickness: 0.02,
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },
  {
    id: 'cw-15-very-thick-mullion-0.15',
    description: '6×3 with 150 mm structural mullions',
    cw: baseCW({
      id: cwid('thk015'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
      mullionThickness: 0.15,
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },
  {
    id: 'cw-16-short-wide-storefront',
    description: '12×2 m low-profile storefront',
    cw: baseCW({
      id: cwid('stfrt'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 12, y: 0, z: 0 }],
      height: 2,
      bayWidth: 2,
      bayHeight: 1,
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },
  {
    id: 'cw-17-elevated-world-y',
    description: '6×3 at elevated worldY = 8.5 m (level 3)',
    cw: baseCW({
      id: cwid('elev85'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    }),
    joinData: NO_JOINS,
    worldY: 8.5,
  },
  {
    id: 'cw-18-negative-x-start',
    description: '6×3 baseline starting at negative X',
    cw: baseCW({
      id: cwid('negxst'),
      baseLine: [{ x: -3, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }],
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },
  {
    id: 'cw-19-diagonal-45deg-panels',
    description: '8×3 diagonal with mixed panels',
    cw: baseCW({
      id: cwid('dgpnl'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5.657, y: 0, z: 5.657 }],
      panels: [
        { id: 'p0', row: 0, col: 0, kind: 'glazed' as const, rotation: 0 as const },
        { id: 'p1', row: 0, col: 1, kind: 'opaque' as const, rotation: 0 as const },
        { id: 'p2', row: 1, col: 0, kind: 'spandrel' as const, rotation: 0 as const },
        { id: 'p3', row: 1, col: 1, kind: 'glazed' as const, rotation: 0 as const },
      ],
    }),
    joinData: NO_JOINS,
    worldY: 2.7,
  },
  {
    id: 'cw-20-single-bay',
    description: 'Single 1.5×1.5 bay panel (minimal wall)',
    cw: baseCW({
      id: cwid('sing15'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 1.5, y: 0, z: 0 }],
      height: 1.5,
      bayWidth: 1.5,
      bayHeight: 1.5,
      panels: [{ id: 'p0', row: 0, col: 0, kind: 'glazed' as const, rotation: 0 as const }],
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },
  {
    id: 'cw-21-asymmetric-bay-2x1.5',
    description: '8×3 with 2 m wide × 1.5 m tall bays',
    cw: baseCW({
      id: cwid('asym21'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 8, y: 0, z: 0 }],
      bayWidth: 2,
      bayHeight: 1.5,
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },
  {
    id: 'cw-22-asymmetric-bay-1x2',
    description: '6×4 with 1 m wide × 2 m tall bays (portrait panels)',
    cw: baseCW({
      id: cwid('asym12'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
      height: 4,
      bayWidth: 1,
      bayHeight: 2,
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },
  {
    id: 'cw-23-with-material-id',
    description: '6×3 curtain wall with material id override',
    cw: baseCW({
      id: cwid('matovr'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
      materialId: 'glass.fritted',
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },
  {
    id: 'cw-24-three-row-facade',
    description: '6×4.5 three-row facade with mixed panels',
    cw: baseCW({
      id: cwid('threeR'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
      height: 4.5,
      bayWidth: 1.5,
      bayHeight: 1.5,
      panels: [
        { id: 'p0', row: 0, col: 0, kind: 'door' as const,     rotation: 0 as const },
        { id: 'p1', row: 0, col: 1, kind: 'glazed' as const,   rotation: 0 as const },
        { id: 'p2', row: 1, col: 0, kind: 'glazed' as const,   rotation: 0 as const },
        { id: 'p3', row: 1, col: 1, kind: 'glazed' as const,   rotation: 0 as const },
        { id: 'p4', row: 2, col: 0, kind: 'spandrel' as const, rotation: 0 as const },
        { id: 'p5', row: 2, col: 1, kind: 'spandrel' as const, rotation: 0 as const },
      ],
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },
  {
    id: 'cw-25-non-divisible-height',
    description: '5×5 wall where height is not divisible by bayHeight',
    cw: baseCW({
      id: cwid('ndivh'),
      baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
      height: 5,
      bayWidth: 1.5,
      bayHeight: 1.6,
    }),
    joinData: NO_JOINS,
    worldY: 0,
  },
]);

export function getCurtainWallFixture(id: string): CurtainWallFixture {
  const f = CW_FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown curtain-wall fixture: ${id}`);
  return f;
}
