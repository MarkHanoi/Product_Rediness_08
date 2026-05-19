/**
 * Shared fixtures for the IFC export round-trip tests.
 *
 * Every fixture creates one element per Tier 1 family with deterministic
 * IDs, baseline geometry, and a Pset payload that should survive the
 * export → re-parse cycle.
 */

import {
  Beam,
  Column,
  Door,
  Slab,
  Wall,
  Window,
} from '@pryzm/plugin-sdk';

import {
  InMemoryIFCMetaStore,
  type IFCElementMeta,
  type LevelInfo,
  type ProjectSnapshot,
} from '../src/index.js';

// --- Stable PRYZM IDs ---------------------------------------------------------
// Hand-crafted to match the `<prefix>_<26-char-Crockford-base32>` shape:
//   alphabet `[0-9A-HJKMNP-TV-Z]` (no I, L, O, U).
const ULID_A = '00000000000000000000000WAA';
const ULID_B = '00000000000000000000000SAB';
const ULID_C = '00000000000000000000000DRR';
const ULID_D = '00000000000000000000000WND';
const ULID_E = '00000000000000000000000CMN';
const ULID_F = '00000000000000000000000BMM';

export const FIXTURE_LEVEL: LevelInfo = {
  id: 'level_ground',
  name: 'Ground Floor',
  elevation: 0,
};

const buildWall = () =>
  Wall.parse({
    id: `wall_${ULID_A}`,
    levelId: FIXTURE_LEVEL.id,
    baseLine: [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
    ],
    height: 3.0,
    thickness: 0.2,
  });

const buildSlab = () =>
  Slab.parse({
    id: `slab_${ULID_B}`,
    levelId: FIXTURE_LEVEL.id,
    boundary: [
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 0, z: 0 },
      { x: 5, y: 0, z: 5 },
      { x: 0, y: 0, z: 5 },
    ],
    thickness: 0.25,
  });

const buildDoor = () =>
  Door.parse({
    id: `door_${ULID_C}`,
    wallId: `wall_${ULID_A}`,
    width: 0.9,
    height: 2.1,
  });

const buildWindow = () =>
  Window.parse({
    id: `window_${ULID_D}`,
    wallId: `wall_${ULID_A}`,
    width: 1.2,
    height: 1.4,
    sillHeight: 0.9,
  });

const buildColumn = () =>
  Column.parse({
    id: `column_${ULID_E}`,
    levelId: FIXTURE_LEVEL.id,
    origin: { x: 1, y: 0, z: 1 },
    width: 0.4,
    depth: 0.4,
    height: 3.0,
  });

const buildBeam = () =>
  Beam.parse({
    id: `beam_${ULID_F}`,
    levelId: FIXTURE_LEVEL.id,
    baseLine: [
      { x: 0, y: 3, z: 0 },
      { x: 4, y: 3, z: 0 },
    ],
    width: 0.2,
    depth: 0.4,
  });

export interface Tier1Fixture {
  snapshot: ProjectSnapshot;
  metaStore: InMemoryIFCMetaStore;
  /** Map from PRYZM id to expected IFC GlobalId (for round-trip assertions). */
  globalIds: Map<string, string>;
}

export function buildTier1Fixture(): Tier1Fixture {
  const wall = buildWall();
  const slab = buildSlab();
  const door = buildDoor();
  const win = buildWindow();
  const column = buildColumn();
  const beam = buildBeam();

  const metaStore = new InMemoryIFCMetaStore();
  const entries: ReadonlyArray<{ id: string; meta: IFCElementMeta }> = [
    {
      id: wall.id,
      meta: {
        pryzmElementId: wall.id,
        globalId: '0Wall0Wall0Wall0Wall00',
        typeName: 'IFCWALLSTANDARDCASE',
        name: 'Exterior Wall A',
        psets: {
          Pset_WallCommon: {
            FireRating: '60min',
            IsExternal: true,
            LoadBearing: false,
            ThermalTransmittance: 0.18,
          },
        },
        tier: 1,
      },
    },
    {
      id: slab.id,
      meta: {
        pryzmElementId: slab.id,
        globalId: '0Slab0Slab0Slab0Slab00',
        typeName: 'IFCSLAB',
        name: 'Floor Slab',
        psets: {
          Pset_SlabCommon: { FireRating: '120min', LoadBearing: true },
        },
        tier: 1,
      },
    },
    {
      id: door.id,
      meta: {
        pryzmElementId: door.id,
        globalId: '0Door0Door0Door0Door00',
        typeName: 'IFCDOOR',
        name: 'Entry Door',
        psets: {
          Pset_DoorCommon: { FireRating: '30min', AcousticRating: '38db' },
        },
        tier: 1,
      },
    },
    {
      id: win.id,
      meta: {
        pryzmElementId: win.id,
        globalId: '0Wind0Wind0Wind0Wind00',
        typeName: 'IFCWINDOW',
        name: 'Living Room Window',
        psets: {
          Pset_WindowCommon: { ThermalTransmittance: 1.1 },
        },
        tier: 1,
      },
    },
    {
      id: column.id,
      meta: {
        pryzmElementId: column.id,
        globalId: '0Col00Col00Col00Col000',
        typeName: 'IFCCOLUMN',
        name: 'Steel Column C1',
        psets: {
          Pset_ColumnCommon: { LoadBearing: true, Reference: 'C1' },
        },
        tier: 1,
      },
    },
    {
      id: beam.id,
      meta: {
        pryzmElementId: beam.id,
        globalId: '0Beam0Beam0Beam0Beam00',
        typeName: 'IFCBEAM',
        name: 'Steel Beam B1',
        psets: {
          Pset_BeamCommon: { LoadBearing: true, Reference: 'B1' },
        },
        tier: 1,
      },
    },
  ];
  for (const { meta } of entries) metaStore.add(meta);

  const globalIds = new Map(entries.map((e) => [e.id, e.meta.globalId]));

  return {
    snapshot: {
      levels: [FIXTURE_LEVEL],
      walls: [wall],
      slabs: [slab],
      doors: [door],
      windows: [win],
      columns: [column],
      beams: [beam],
    },
    metaStore,
    globalIds,
  };
}
