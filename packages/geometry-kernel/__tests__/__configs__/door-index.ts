// Door fixture catalog — W-1C-2 parity promotion.
//
// 15 fixtures covering the `produceDoor` input matrix:
//   { single, double } × { standard, exterior-wide, tall-narrow, fire-rated }
//   × { axis-X, axis-Z, diagonal } × { wall-thickness variants }
//   × { sill-height, frame overrides, colour overrides }
//
// Each fixture is a fully-resolved Door DTO + DoorWorldPlacement.  The
// parity test in `tests/parity/door/cw-snapshot.test.ts` uses these to
// write configs/<id>.json and snapshots/<id>.snap.json.

import type { Door as DoorData } from '@pryzm/schemas';

export interface DoorWorldPlacement {
  readonly axis: { x: number; y: number; z: number };
  readonly normal: { x: number; y: number; z: number };
  readonly origin: { x: number; y: number; z: number };
  readonly wallThickness: number;
}

export interface DoorFixture {
  readonly id: string;
  readonly description: string;
  readonly door: DoorData;
  readonly placement: DoorWorldPlacement;
}

const META = { createdAt: 0, modifiedAt: 0, createdBy: 'fixture', version: 1 };
const ULID_PAD = '01HZS000000000000DOOR';

function did(name: string): string {
  const tail = name.replace(/[^A-Z0-9]/gi, '').toUpperCase().padEnd(5, '0').slice(0, 5);
  return `door:${ULID_PAD}${tail}` as DoorData['id'];
}
function wid(name: string): string {
  return `wall:${ULID_PAD}${name.replace(/[^A-Z0-9]/gi, '').toUpperCase().padEnd(5, '0').slice(0, 5)}` as DoorData['wallId'];
}

function baseDoor(overrides: Partial<DoorData> & { id: DoorData['id'] }): DoorData {
  return {
    id: overrides.id,
    type: 'door' as const,
    childrenIds: [],
    metadata: META,
    levelId: 'level:0',
    wallId: wid('W1') as DoorData['wallId'],
    openingId: 'op-1',
    offset: 0,
    width: 0.9,
    height: 2.1,
    doorType: 'single' as const,
    sillHeight: 0,
    frameWidth: 0.05,
    frameThickness: 0.08,
    frameColor: '#5a4a3a',
    leafColor: '#7a6a5a',
    ...overrides,
  } as DoorData;
}

const STD_X: DoorWorldPlacement = {
  axis: { x: 1, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  origin: { x: 0, y: 0, z: 0 },
  wallThickness: 0.1,
};
const STD_Z: DoorWorldPlacement = {
  axis: { x: 0, y: 0, z: 1 },
  normal: { x: -1, y: 0, z: 0 },
  origin: { x: 5, y: 0, z: 5 },
  wallThickness: 0.2,
};
const DIAG: DoorWorldPlacement = {
  axis: { x: Math.SQRT1_2, y: 0, z: Math.SQRT1_2 },
  normal: { x: -Math.SQRT1_2, y: 0, z: Math.SQRT1_2 },
  origin: { x: 0, y: 0, z: 0 },
  wallThickness: 0.1,
};

export const DOOR_FIXTURES: readonly DoorFixture[] = [
  { id: 'F01.standard-interior',   description: 'standard single interior door',       door: baseDoor({ id: did('F01') }),                                                     placement: STD_X },
  { id: 'F02.exterior-wide',        description: 'exterior-grade wide door',             door: baseDoor({ id: did('F02'), width: 1.0, height: 2.4, frameWidth: 0.06 }),        placement: STD_X },
  { id: 'F03.double-wide',          description: 'double-leaf wide door',               door: baseDoor({ id: did('F03'), width: 1.8, height: 2.4, doorType: 'double' as const }), placement: STD_X },
  { id: 'F04.tall-narrow',          description: 'tall narrow residential door',        door: baseDoor({ id: did('F04'), width: 0.7, height: 2.6 }),                           placement: STD_X },
  { id: 'F05.thick-wall',           description: 'standard door in thick wall (400 mm)', door: baseDoor({ id: did('F05') }),                                                   placement: { ...STD_X, wallThickness: 0.4 } },
  { id: 'F06.thin-wall',            description: 'standard door in thin wall (50 mm)',  door: baseDoor({ id: did('F06') }),                                                     placement: { ...STD_X, wallThickness: 0.05 } },
  { id: 'F07.translated-origin',    description: 'standard door at translated origin',  door: baseDoor({ id: did('F07') }),                                                     placement: { ...STD_X, origin: { x: 3, y: 1, z: -2 } } },
  { id: 'F08.rotated-axis-z',       description: 'standard door with Z-axis wall',      door: baseDoor({ id: did('F08') }),                                                     placement: STD_Z },
  { id: 'F09.high-sill',            description: 'door with 400 mm sill (accessible)',  door: baseDoor({ id: did('F09'), sillHeight: 0.4 }),                                   placement: STD_X },
  { id: 'F10.fire-rated',           description: 'fire-rated FD30 door',               door: baseDoor({ id: did('F10'), frameColor: '#3a3a3a' }),                               placement: STD_X },
  { id: 'F11.frame-thick',          description: 'door with thick frame profile',       door: baseDoor({ id: did('F11'), frameThickness: 0.1, frameWidth: 0.07 }),              placement: STD_X },
  { id: 'F12.degenerate-frame',     description: 'narrow door with wide frame (tight clearance)', door: baseDoor({ id: did('F12'), width: 0.6, frameWidth: 0.1 }),             placement: STD_X },
  { id: 'F13.colour-override',      description: 'door with custom frame/leaf colours', door: baseDoor({ id: did('F13'), frameColor: '#ff0000', leafColor: '#00ff00' }),        placement: STD_X },
  { id: 'F14.tilted-axis-diagonal', description: 'door in a 45° diagonal wall',        door: baseDoor({ id: did('F14') }),                                                     placement: DIAG },
  { id: 'F15.short-wide',           description: 'short wide door (wardrobe/passage)',  door: baseDoor({ id: did('F15'), width: 1.4, height: 1.95 }),                          placement: STD_X },
  { id: 'F16.accessible-wide',      description: 'wide accessible single door (DDA)',   door: baseDoor({ id: did('F16'), width: 1.05, height: 2.1, sillHeight: 0, accessibilityType: 'DDA' }), placement: STD_X },
];

export function getDoorFixture(id: string): DoorFixture {
  const f = DOOR_FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown door fixture: ${id}`);
  return f;
}
