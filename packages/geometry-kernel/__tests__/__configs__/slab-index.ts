// Slab fixture catalog — W-1C-2 parity promotion.
//
// 18 fixtures covering the `produceSlab` input matrix:
//   { rect, l-shape, pentagon, triangle }
//   × { no-holes, 1-hole, 2-holes }
//   × { standard-thickness, thin, thick }
//   × { no-offset, elevated-baseOffset, negative-baseOffset }
//   × { material overrides }
//
// Mirrors the inline fixtures from `tests/parity/slab/slab-snapshot.test.ts`.

import type { Slab as SlabData } from '@pryzm/schemas';

export interface SlabFixture {
  readonly id: string;
  readonly description: string;
  readonly slab: SlabData;
  readonly worldY: number;
}

const META = { createdAt: 0, modifiedAt: 0, createdBy: 'fixture', version: 1 };
const ULID_PAD = '01HZS000000000000SLB';

function sid(name: string): SlabData['id'] {
  const tail = name.replace(/[^A-Z0-9]/gi, '').toUpperCase().padEnd(5, '0').slice(0, 5);
  return `slab:${ULID_PAD}${tail}` as SlabData['id'];
}

function baseSlab(overrides: Partial<SlabData> & { id: SlabData['id'] }): SlabData {
  return {
    id: overrides.id,
    type: 'slab' as const,
    childrenIds: [],
    metadata: META,
    levelId: 'level:0',
    boundary: [
      { x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 },
      { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 },
    ],
    holes: [],
    thickness: 0.2,
    baseOffset: 0,
    ...overrides,
  } as SlabData;
}

export const SLAB_FIXTURES: readonly SlabFixture[] = [
  // F01–F04 — basic rectangular slabs
  { id: 'F01.rect-2x2-standard',      description: '2×2 standard-thickness slab',     slab: baseSlab({ id: sid('F01'), boundary: [{x:0,y:0,z:0},{x:2,y:0,z:0},{x:2,y:0,z:2},{x:0,y:0,z:2}], thickness: 0.2 }),  worldY: 0 },
  { id: 'F02.rect-6x4-standard',      description: '6×4 standard-thickness slab',     slab: baseSlab({ id: sid('F02'), boundary: [{x:0,y:0,z:0},{x:6,y:0,z:0},{x:6,y:0,z:4},{x:0,y:0,z:4}], thickness: 0.25 }), worldY: 0 },
  { id: 'F03.rect-10x8-thick',        description: '10×8 thick structural slab',       slab: baseSlab({ id: sid('F03'), boundary: [{x:0,y:0,z:0},{x:10,y:0,z:0},{x:10,y:0,z:8},{x:0,y:0,z:8}], thickness: 0.4 }), worldY: 0 },
  { id: 'F04.rect-thin',              description: '4×3 thin slab (screed)',           slab: baseSlab({ id: sid('F04'), boundary: [{x:0,y:0,z:0},{x:4,y:0,z:0},{x:4,y:0,z:3},{x:0,y:0,z:3}], thickness: 0.1 }),  worldY: 0 },

  // F05–F07 — slabs with shaft holes
  { id: 'F05.rect-with-shaft-centre',  description: '6×4 slab with centre shaft',       slab: baseSlab({ id: sid('F05'), boundary: [{x:0,y:0,z:0},{x:6,y:0,z:0},{x:6,y:0,z:4},{x:0,y:0,z:4}], holes: [[{x:2,y:0,z:1},{x:4,y:0,z:1},{x:4,y:0,z:3},{x:2,y:0,z:3}]], thickness: 0.2 }), worldY: 0 },
  { id: 'F06.rect-with-shaft-corner',  description: '6×4 slab with corner shaft',       slab: baseSlab({ id: sid('F06'), boundary: [{x:0,y:0,z:0},{x:6,y:0,z:0},{x:6,y:0,z:4},{x:0,y:0,z:4}], holes: [[{x:0.5,y:0,z:0.5},{x:2,y:0,z:0.5},{x:2,y:0,z:2},{x:0.5,y:0,z:2}]], thickness: 0.2 }), worldY: 0 },
  { id: 'F07.rect-with-two-shafts',    description: '8×6 slab with two shafts',         slab: baseSlab({ id: sid('F07'), boundary: [{x:0,y:0,z:0},{x:8,y:0,z:0},{x:8,y:0,z:6},{x:0,y:0,z:6}], holes: [[{x:1,y:0,z:1},{x:3,y:0,z:1},{x:3,y:0,z:3},{x:1,y:0,z:3}],[{x:5,y:0,z:1},{x:7,y:0,z:1},{x:7,y:0,z:3},{x:5,y:0,z:3}]], thickness: 0.25 }), worldY: 0 },

  // F08–F10 — non-rectangular polygons
  { id: 'F08.l-shape',                 description: 'L-shape slab',                    slab: baseSlab({ id: sid('F08'), boundary: [{x:0,y:0,z:0},{x:6,y:0,z:0},{x:6,y:0,z:3},{x:3,y:0,z:3},{x:3,y:0,z:6},{x:0,y:0,z:6}], thickness: 0.2 }), worldY: 0 },
  { id: 'F09.pentagon',                description: 'pentagonal slab',                 slab: baseSlab({ id: sid('F09'), boundary: [{x:0,y:0,z:0},{x:4,y:0,z:0},{x:5,y:0,z:3},{x:2,y:0,z:5},{x:-1,y:0,z:3}], thickness: 0.2 }), worldY: 0 },
  { id: 'F10.triangle',                description: 'triangular slab',                 slab: baseSlab({ id: sid('F10'), boundary: [{x:0,y:0,z:0},{x:5,y:0,z:0},{x:2.5,y:0,z:4}], thickness: 0.18 }), worldY: 0 },

  // F11–F13 — baseOffset variations
  { id: 'F11.elevated-base-offset-1',  description: 'slab with 1.0 m base offset',     slab: baseSlab({ id: sid('F11'), baseOffset: 1.0 }), worldY: 0 },
  { id: 'F12.elevated-base-offset-2.8', description: 'slab with 2.8 m base offset',    slab: baseSlab({ id: sid('F12'), baseOffset: 2.8 }), worldY: 0 },
  { id: 'F13.negative-base-offset',    description: 'slab with −0.5 m base offset',    slab: baseSlab({ id: sid('F13'), baseOffset: -0.5 }), worldY: 0 },

  // F14–F16 — material overrides
  { id: 'F14.with-material-id',        description: 'slab with material ID override',  slab: baseSlab({ id: sid('F14'), materialId: 'mat_concrete_dark' }), worldY: 0 },
  { id: 'F15.with-material-color',     description: 'slab with material colour override', slab: baseSlab({ id: sid('F15'), materialColor: '#7a5c3a' }), worldY: 0 },
  { id: 'F16.with-system-type',        description: 'slab with system type preset',    slab: baseSlab({ id: sid('F16'), thickness: 0.3, systemTypeId: 'slab_type_precast_hollow_core' }), worldY: 0 },

  // F17–F18 — edge cases
  { id: 'F17.minimum-three-vertices',  description: 'triangle slab (minimum vertices)', slab: baseSlab({ id: sid('F17'), boundary: [{x:0,y:0,z:0},{x:1,y:0,z:0},{x:0.5,y:0,z:1}], thickness: 0.15 }), worldY: 0 },
  { id: 'F18.very-large-footprint',    description: '50×40 m large industrial slab',   slab: baseSlab({ id: sid('F18'), boundary: [{x:0,y:0,z:0},{x:50,y:0,z:0},{x:50,y:0,z:40},{x:0,y:0,z:40}], thickness: 0.35 }), worldY: 0 },
];

export function getSlabFixture(id: string): SlabFixture {
  const f = SLAB_FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown slab fixture: ${id}`);
  return f;
}
