// SEED_FURNITURE_CATALOGUE — three stub catalogue entries used as the
// starter set the carousel ships with (S27 / ADR-0027 §5).
//
// Each entry carries small but deterministic per-LOD representations so
// the producer's fallback ladder can be exercised without depending on
// PRYZM 1 fixture imports (those land in S30).
//
// LOD shape conventions used here (purely conventional — the producer
// cares only about triangle counts, not interpretation):
//   0 = bbox cube (12 tris)             — rough preview
//   1 = bbox cube (12 tris)             — same as L0
//   2 = bbox cube (12 tris)             — "simplified" default
//   3 = "detailed" (24 tris, nested cube)
//   4 = "luxury"  (36 tris, nested + cap)
//
// All representations are non-indexed-friendly (positions × indices)
// because the producer always detriangulates to per-face hard-edge
// normals (see `produceFurniture.detriangulate`).

import type { FurnitureCatalogueEntry } from './index.js';

/** Build a unit-axis box of the given size, centred on origin (Y up). */
function box(w: number, h: number, d: number): {
  positions: number[]; indices: number[];
} {
  const x = w / 2, y = h / 2, z = d / 2;
  const positions = [
    -x, -y, -z,  x, -y, -z,  x,  y, -z, -x,  y, -z, // back  (-Z)
    -x, -y,  z,  x, -y,  z,  x,  y,  z, -x,  y,  z, // front (+Z)
  ];
  const indices = [
    // -Z
    0, 2, 1,  0, 3, 2,
    // +Z
    4, 5, 6,  4, 6, 7,
    // -X
    0, 4, 7,  0, 7, 3,
    // +X
    1, 2, 6,  1, 6, 5,
    // -Y
    0, 1, 5,  0, 5, 4,
    // +Y
    3, 7, 6,  3, 6, 2,
  ];
  return { positions, indices };
}

/** Box stack: outer + inner box (24 triangles). */
function stack(w: number, h: number, d: number): {
  positions: number[]; indices: number[];
} {
  const a = box(w, h, d);
  const b = box(w * 0.6, h * 0.6, d * 0.6);
  const offset = a.positions.length / 3;
  return {
    positions: [...a.positions, ...b.positions],
    indices: [...a.indices, ...b.indices.map((i) => i + offset)],
  };
}

/** Box stack with a top cap (36 triangles). */
function luxury(w: number, h: number, d: number): {
  positions: number[]; indices: number[];
} {
  const s = stack(w, h, d);
  // Add a thin top "cap" plate (12 tris: another box of small height
  // sitting on top of the bounding box).
  const cap = box(w * 0.9, h * 0.05, d * 0.9);
  const offset = s.positions.length / 3;
  // Lift the cap so it sits above origin (cap centre at +y = h/2 + capH/2).
  const capLifted = cap.positions.slice();
  for (let i = 1; i < capLifted.length; i += 3) capLifted[i] = (capLifted[i] ?? 0) + h / 2;
  return {
    positions: [...s.positions, ...capLifted],
    indices: [...s.indices, ...cap.indices.map((i) => i + offset)],
  };
}

const CHAIR_SIZE = { x: 0.5, y: 0.9, z: 0.55 };
const SOFA_SIZE  = { x: 2.1, y: 0.85, z: 0.9 };
const TABLE_SIZE = { x: 1.4, y: 0.75, z: 0.8 };

/**
 * Three stubs — chair, sofa, table.  The carousel ships with these as
 * its initial inventory; project-imported entries are added later via
 * `FurnitureCatalogue.upsert`.
 */
export const SEED_FURNITURE_CATALOGUE: readonly FurnitureCatalogueEntry[] = [
  {
    id: 'pryzm/chair-basic',
    displayName: 'Basic Chair',
    category: 'seating',
    tags: ['chair', 'seating', 'basic'],
    size: CHAIR_SIZE,
    representations: {
      '0': box(CHAIR_SIZE.x, CHAIR_SIZE.y, CHAIR_SIZE.z),
      '1': box(CHAIR_SIZE.x, CHAIR_SIZE.y, CHAIR_SIZE.z),
      '2': box(CHAIR_SIZE.x, CHAIR_SIZE.y, CHAIR_SIZE.z),
      '3': stack(CHAIR_SIZE.x, CHAIR_SIZE.y, CHAIR_SIZE.z),
      '4': luxury(CHAIR_SIZE.x, CHAIR_SIZE.y, CHAIR_SIZE.z),
    },
    materialSlots: { primary: 'wood-oak' },
    materialId: 'wood-oak',
  },
  {
    id: 'pryzm/sofa-3s',
    displayName: '3-Seat Sofa',
    category: 'seating',
    tags: ['sofa', 'seating', 'living-room'],
    size: SOFA_SIZE,
    representations: {
      '0': box(SOFA_SIZE.x, SOFA_SIZE.y, SOFA_SIZE.z),
      '1': box(SOFA_SIZE.x, SOFA_SIZE.y, SOFA_SIZE.z),
      '2': box(SOFA_SIZE.x, SOFA_SIZE.y, SOFA_SIZE.z),
      '3': stack(SOFA_SIZE.x, SOFA_SIZE.y, SOFA_SIZE.z),
      '4': luxury(SOFA_SIZE.x, SOFA_SIZE.y, SOFA_SIZE.z),
    },
    materialSlots: { primary: 'fabric-grey' },
    materialId: 'fabric-grey',
  },
  {
    id: 'pryzm/table-rect',
    displayName: 'Rectangular Table',
    category: 'tables',
    tags: ['table', 'dining', 'rectangular'],
    size: TABLE_SIZE,
    representations: {
      '0': box(TABLE_SIZE.x, TABLE_SIZE.y, TABLE_SIZE.z),
      '1': box(TABLE_SIZE.x, TABLE_SIZE.y, TABLE_SIZE.z),
      '2': box(TABLE_SIZE.x, TABLE_SIZE.y, TABLE_SIZE.z),
      '3': stack(TABLE_SIZE.x, TABLE_SIZE.y, TABLE_SIZE.z),
      '4': luxury(TABLE_SIZE.x, TABLE_SIZE.y, TABLE_SIZE.z),
    },
    materialSlots: { primary: 'wood-walnut' },
    materialId: 'wood-walnut',
  },
];
