// Window fixture catalog — W-1C-2 parity promotion.
//
// 12 fixtures covering the `produceWindow` input matrix:
//   { single, double } × { fixed, awning, casement, sliding }
//   × { axis-X, axis-Z, diagonal } × { grid 1×1, 2×1, 3×2 }
//   × { wall-thickness variants, sill-height variants, fire-rated }

import type { Window as WindowData } from '@pryzm/schemas';

export interface WindowWorldPlacement {
  readonly axis: { x: number; y: number; z: number };
  readonly normal: { x: number; y: number; z: number };
  readonly origin: { x: number; y: number; z: number };
  readonly wallThickness: number;
  readonly grid?: { columns: number; rows: number; mullionThickness: number };
}

export interface WindowFixture {
  readonly id: string;
  readonly description: string;
  readonly window: WindowData;
  readonly placement: WindowWorldPlacement;
}

const META = { createdAt: 0, modifiedAt: 0, createdBy: 'fixture', version: 1 };
const ULID_PAD = '01HZS000000000000WDW';

function wid(name: string): string {
  const tail = name.replace(/[^A-Z0-9]/gi, '').toUpperCase().padEnd(5, '0').slice(0, 5);
  return `window:${ULID_PAD}${tail}` as WindowData['id'];
}
function wlid(name: string): string {
  return `wall:${ULID_PAD}${name.replace(/[^A-Z0-9]/gi, '').toUpperCase().padEnd(5, '0').slice(0, 5)}` as WindowData['wallId'];
}

function baseWindow(overrides: Partial<WindowData> & { id: WindowData['id'] }): WindowData {
  return {
    id: overrides.id,
    type: 'window' as const,
    childrenIds: [],
    metadata: META,
    levelId: 'level:0',
    wallId: wlid('W1') as WindowData['wallId'],
    openingId: 'op-1',
    offset: 0,
    width: 1.2,
    height: 1.0,
    windowType: 'single' as const,
    sillHeight: 0.9,
    frameWidth: 0.05,
    frameThickness: 0.08,
    frameColor: '#4a4a4a',
    glassColor: '#b0d0e8',
    ...overrides,
  } as WindowData;
}

const STD_X: WindowWorldPlacement = { axis: { x: 1, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, origin: { x: 0, y: 0, z: 0 }, wallThickness: 0.1 };
const STD_Z: WindowWorldPlacement = { axis: { x: 0, y: 0, z: 1 }, normal: { x: -1, y: 0, z: 0 }, origin: { x: 5, y: 0, z: 5 }, wallThickness: 0.2 };

export const WINDOW_FIXTURES: readonly WindowFixture[] = [
  { id: 'F01.standard-fixed-1x1',         description: 'standard fixed 1×1 window',              window: baseWindow({ id: wid('F01') }),                                                             placement: STD_X },
  { id: 'F02.picture-window',              description: 'large picture window with low sill',       window: baseWindow({ id: wid('F02'), width: 2.4, height: 1.5, sillHeight: 0.6, frameWidth: 0.06 }), placement: STD_X },
  { id: 'F03.casement-double-2x2',         description: 'casement double-leaf with 2×2 grid',      window: baseWindow({ id: wid('F03'), width: 1.6, height: 1.2, windowType: 'double' as const }),     placement: { ...STD_X, grid: { columns: 2, rows: 2, mullionThickness: 0.04 } } },
  { id: 'F04.tall-narrow',                 description: 'tall narrow window (louvre/accent)',       window: baseWindow({ id: wid('F04'), width: 0.6, height: 1.8 }),                                    placement: STD_X },
  { id: 'F05.thick-wall-grid-2x1',         description: 'window in thick wall with 2×1 grid',      window: baseWindow({ id: wid('F05'), width: 1.8, height: 1.2 }),                                    placement: { axis: { x: 1, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 }, origin: { x: 0, y: 0, z: 0 }, wallThickness: 0.4, grid: { columns: 2, rows: 1, mullionThickness: 0.05 } } },
  { id: 'F06.thin-wall-default',           description: 'window in thin wall (50 mm)',             window: baseWindow({ id: wid('F06') }),                                                             placement: { ...STD_X, wallThickness: 0.05 } },
  { id: 'F07.translated-origin',           description: 'window at translated origin',             window: baseWindow({ id: wid('F07') }),                                                             placement: { ...STD_X, origin: { x: 3, y: 1, z: -2 } } },
  { id: 'F08.rotated-axis-z',              description: 'window with Z-axis wall',                 window: baseWindow({ id: wid('F08') }),                                                             placement: STD_Z },
  { id: 'F09.high-sill-awning',            description: 'high-sill awning window',                window: baseWindow({ id: wid('F09'), width: 0.9, height: 0.6, sillHeight: 1.6 }),                   placement: STD_X },
  { id: 'F10.fire-rated',                  description: 'fire-rated FR60 window',                  window: baseWindow({ id: wid('F10'), frameColor: '#444444', frameThickness: 0.07, frameWidth: 0.06 }), placement: STD_X },
  { id: 'F11.sliding-3x1-grid',            description: 'sliding window with 3×1 grid',           window: baseWindow({ id: wid('F11'), width: 2.7, height: 1.2 }),                                    placement: { ...STD_X, grid: { columns: 3, rows: 1, mullionThickness: 0.06 } } },
  { id: 'F12.tilted-axis-diagonal-3x2',    description: 'window in 45° diagonal wall with 3×2 grid', window: baseWindow({ id: wid('F12'), width: 1.8 }),                                             placement: { axis: { x: Math.SQRT1_2, y: 0, z: Math.SQRT1_2 }, normal: { x: -Math.SQRT1_2, y: 0, z: Math.SQRT1_2 }, origin: { x: 0, y: 0, z: 0 }, wallThickness: 0.1, grid: { columns: 3, rows: 2, mullionThickness: 0.04 } } },
];

export function getWindowFixture(id: string): WindowFixture {
  const f = WINDOW_FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown window fixture: ${id}`);
  return f;
}
