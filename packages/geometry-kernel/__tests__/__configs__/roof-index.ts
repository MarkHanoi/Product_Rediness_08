// Roof fixture catalog — used by every S10-T7 producer test (unit,
// snapshot, bench).  20 configurations cover the matrix from
// `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S10-T7:
//   { flat, mono, gable, hip, mansard } × { square, rect, polygon }
//   × { no-overhang, with-overhang } × { low-pitch, mid-pitch, tall-pitch }
//
// Each config is a fully-resolved Roof DTO (the schema's defaults
// have been folded in) plus the producer's worldY argument.
//
// Mirrors `__configs__/index.ts` (wall fixtures).  The configs are
// also written out to JSON in `tests/parity/roof/configs/*.json` by
// the snapshot harness (regenerated on demand).

import type { Roof } from '@pryzm/protocol';

export interface RoofFixture {
  readonly id: string;
  readonly description: string;
  readonly roof: Roof;
  readonly worldY: number;
}

const META = {
  createdAt: 0,
  modifiedAt: 0,
  createdBy: 'fixture',
  version: 1,
};

function baseRoof(overrides: Partial<Roof> & { id: string; shape: Roof['shape'] }): Roof {
  return {
    id: overrides.id,
    type: 'roof' as const,
    childrenIds: [],
    metadata: META,
    levelId: 'level:0',
    boundary: [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
      { x: 4, y: 0, z: 4 },
      { x: 0, y: 0, z: 4 },
    ],
    shape: 'flat',
    pitch: 0,
    overhang: 0,
    thickness: 0.2,
    ...overrides,
  } as Roof;
}

const square4 = [
  { x: 0, y: 0, z: 0 },
  { x: 4, y: 0, z: 0 },
  { x: 4, y: 0, z: 4 },
  { x: 0, y: 0, z: 4 },
] as Roof['boundary'];

const rect6x4 = [
  { x: 0, y: 0, z: 0 },
  { x: 6, y: 0, z: 0 },
  { x: 6, y: 0, z: 4 },
  { x: 0, y: 0, z: 4 },
] as Roof['boundary'];

const rect8x3 = [
  { x: 0, y: 0, z: 0 },
  { x: 8, y: 0, z: 0 },
  { x: 8, y: 0, z: 3 },
  { x: 0, y: 0, z: 3 },
] as Roof['boundary'];

const square6 = [
  { x: 0, y: 0, z: 0 },
  { x: 6, y: 0, z: 0 },
  { x: 6, y: 0, z: 6 },
  { x: 0, y: 0, z: 6 },
] as Roof['boundary'];

const pentagon = [
  { x: 0,  y: 0, z: 0 },
  { x: 4,  y: 0, z: 0 },
  { x: 5,  y: 0, z: 2 },
  { x: 2,  y: 0, z: 4 },
  { x: -1, y: 0, z: 2 },
] as Roof['boundary'];

// Pitch helpers: PRYZM 2 pitch is in radians.
const PITCH_LOW = 10 * Math.PI / 180;  // 10° → tan ≈ 0.176
const PITCH_MID = 25 * Math.PI / 180;  // 25° → tan ≈ 0.466
const PITCH_TALL = 35 * Math.PI / 180; // 35° → tan ≈ 0.700

export const ROOF_FIXTURES: readonly RoofFixture[] = [
  // ── FLAT (4) ────────────────────────────────────────────────────────
  {
    id: 'flat-square-no-overhang',
    description: 'flat 4×4 square, no overhang, default thickness',
    roof: baseRoof({ id: 'roof:flat-sq', shape: 'flat', boundary: square4 }),
    worldY: 0,
  },
  {
    id: 'flat-square-with-overhang',
    description: 'flat 4×4 square, 0.5 m overhang',
    roof: baseRoof({ id: 'roof:flat-sq-oh', shape: 'flat', boundary: square4, overhang: 0.5 }),
    worldY: 2.5,
  },
  {
    id: 'flat-rect-thick',
    description: 'flat 6×4 rectangle, 0.4 m thickness',
    roof: baseRoof({ id: 'roof:flat-rect-th', shape: 'flat', boundary: rect6x4, thickness: 0.4 }),
    worldY: 0,
  },
  {
    id: 'flat-pentagon',
    description: 'flat convex pentagon, no overhang',
    roof: baseRoof({ id: 'roof:flat-pent', shape: 'flat', boundary: pentagon }),
    worldY: 0,
  },

  // ── MONO (4) ────────────────────────────────────────────────────────
  {
    id: 'mono-square-low-pitch',
    description: 'mono 4×4 square, 10° pitch',
    roof: baseRoof({
      id: 'roof:mono-sq-lo',
      shape: 'mono',
      boundary: square4,
      pitch: PITCH_LOW,
    }),
    worldY: 0,
  },
  {
    id: 'mono-rect-mid-pitch',
    description: 'mono 6×4 rect, 25° pitch',
    roof: baseRoof({
      id: 'roof:mono-rect-mid',
      shape: 'mono',
      boundary: rect6x4,
      pitch: PITCH_MID,
    }),
    worldY: 2.5,
  },
  {
    id: 'mono-rect-tall-pitch',
    description: 'mono 8×3 long rect, 35° pitch',
    roof: baseRoof({
      id: 'roof:mono-rect-tall',
      shape: 'mono',
      boundary: rect8x3,
      pitch: PITCH_TALL,
    }),
    worldY: 0,
  },
  {
    id: 'mono-square-with-overhang',
    description: 'mono 4×4 square, 0.5 m overhang, 25° pitch',
    roof: baseRoof({
      id: 'roof:mono-sq-oh',
      shape: 'mono',
      boundary: square4,
      pitch: PITCH_MID,
      overhang: 0.5,
    }),
    worldY: 0,
  },

  // ── GABLE (4) ───────────────────────────────────────────────────────
  {
    id: 'gable-square-mid-pitch',
    description: 'gable 4×4 square, 25° pitch',
    roof: baseRoof({
      id: 'roof:gable-sq',
      shape: 'gable',
      boundary: square4,
      pitch: PITCH_MID,
    }),
    worldY: 0,
  },
  {
    id: 'gable-rect-low-pitch',
    description: 'gable 6×4 rect, 10° pitch (ridge along x)',
    roof: baseRoof({
      id: 'roof:gable-rect-lo',
      shape: 'gable',
      boundary: rect6x4,
      pitch: PITCH_LOW,
    }),
    worldY: 2.5,
  },
  {
    id: 'gable-rect-tall-pitch',
    description: 'gable 8×3 long rect, 35° pitch',
    roof: baseRoof({
      id: 'roof:gable-rect-tall',
      shape: 'gable',
      boundary: rect8x3,
      pitch: PITCH_TALL,
    }),
    worldY: 0,
  },
  {
    id: 'gable-rect-with-overhang',
    description: 'gable 6×4 rect, 0.6 m overhang, 25° pitch',
    roof: baseRoof({
      id: 'roof:gable-rect-oh',
      shape: 'gable',
      boundary: rect6x4,
      pitch: PITCH_MID,
      overhang: 0.6,
    }),
    worldY: 0,
  },

  // ── HIP (4) ─────────────────────────────────────────────────────────
  {
    id: 'hip-square-mid-pitch',
    description: 'hip 4×4 square (apex pyramid), 25° pitch',
    roof: baseRoof({
      id: 'roof:hip-sq',
      shape: 'hip',
      boundary: square4,
      pitch: PITCH_MID,
    }),
    worldY: 0,
  },
  {
    id: 'hip-rect-mid-pitch',
    description: 'hip 6×4 rect (linear ridge), 25° pitch',
    roof: baseRoof({
      id: 'roof:hip-rect',
      shape: 'hip',
      boundary: rect6x4,
      pitch: PITCH_MID,
    }),
    worldY: 2.5,
  },
  {
    id: 'hip-pentagon-mid-pitch',
    description: 'hip convex pentagon, 25° pitch',
    roof: baseRoof({
      id: 'roof:hip-pent',
      shape: 'hip',
      boundary: pentagon,
      pitch: PITCH_MID,
    }),
    worldY: 0,
  },
  {
    id: 'hip-square-with-overhang',
    description: 'hip 4×4 square, 0.5 m overhang, 35° pitch',
    roof: baseRoof({
      id: 'roof:hip-sq-oh',
      shape: 'hip',
      boundary: square4,
      pitch: PITCH_TALL,
      overhang: 0.5,
    }),
    worldY: 0,
  },

  // ── MANSARD (4) ─────────────────────────────────────────────────────
  {
    id: 'mansard-square-mid-pitch',
    description: 'mansard 6×6 square (skirt + cap), 25° pitch',
    roof: baseRoof({
      id: 'roof:mans-sq',
      shape: 'mansard',
      boundary: square6,
      pitch: PITCH_MID,
    }),
    worldY: 0,
  },
  {
    id: 'mansard-rect-mid-pitch',
    description: 'mansard 6×4 rect, 25° pitch',
    roof: baseRoof({
      id: 'roof:mans-rect',
      shape: 'mansard',
      boundary: rect6x4,
      pitch: PITCH_MID,
    }),
    worldY: 2.5,
  },
  {
    id: 'mansard-square-tall-pitch',
    description: 'mansard 6×6 square, 35° pitch',
    roof: baseRoof({
      id: 'roof:mans-sq-tall',
      shape: 'mansard',
      boundary: square6,
      pitch: PITCH_TALL,
    }),
    worldY: 0,
  },
  {
    id: 'mansard-square-with-overhang',
    description: 'mansard 6×6 square, 0.6 m overhang, 25° pitch',
    roof: baseRoof({
      id: 'roof:mans-sq-oh',
      shape: 'mansard',
      boundary: square6,
      pitch: PITCH_MID,
      overhang: 0.6,
    }),
    worldY: 0,
  },

  // ── W-1C-5 top-up: 3 new fixtures for skylight + join schema fields ──────
  {
    id: 'flat-with-skylight',
    description: 'flat 6×4 roof with one skylight (W-1C-5 schema extension)',
    roof: {
      ...baseRoof({ id: 'roof:flat-skylt', shape: 'flat', boundary: rect6x4 }),
      skylights: [{
        id: 'sky-01',
        position: { x: 3, y: 0, z: 2 },
        width: 1.0,
        depth: 0.8,
        frameWidth: 0.05,
      }],
      joinedToRoofIds: [],
    } as ReturnType<typeof baseRoof>,
    worldY: 3.0,
  },
  {
    id: 'gable-joined-pair',
    description: 'gable 6×4 roof in a joined pair (W-1C-5 schema extension)',
    roof: {
      ...baseRoof({ id: 'roof:gable-join', shape: 'gable', boundary: rect6x4, pitch: PITCH_MID }),
      skylights: [],
      joinedToRoofIds: ['roof:gable-adj'],
    } as ReturnType<typeof baseRoof>,
    worldY: 0,
  },
  {
    id: 'hip-with-multi-skylight',
    description: 'hip 6×6 roof with two skylights (W-1C-5 schema extension)',
    roof: {
      ...baseRoof({ id: 'roof:hip-msky', shape: 'hip', boundary: square6, pitch: PITCH_MID }),
      skylights: [
        { id: 'sky-01', position: { x: 2, y: 0, z: 2 }, width: 1.0, depth: 0.8, frameWidth: 0.05 },
        { id: 'sky-02', position: { x: 4, y: 0, z: 4 }, width: 0.8, depth: 0.6, frameWidth: 0.04 },
      ],
      joinedToRoofIds: [],
    } as ReturnType<typeof baseRoof>,
    worldY: 0,
  },
];

export function getRoofFixture(id: string): RoofFixture {
  const f = ROOF_FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown roof fixture: ${id}`);
  return f;
}
