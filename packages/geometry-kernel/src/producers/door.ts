// produceDoor — pure-TS Door geometry producer (S11-T1).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S11 line 1280:
//   `export const produceDoor: (dto: DoorData, placement) =>
//    BufferGeometryDescriptor;`
//
// Design:
//   • Door geometry is a frame (3 boxes — 2 jambs + head) + a single
//     leaf box.  Threshold and handle/hinge are deferred to 1C.
//   • THREE-FREE — every position is a Vec3 DTO, every buffer is a
//     typed array (`Float32Array`/`Uint16Array`).
//   • Output materials: 2 slots (frame + leaf).  Material key format:
//     `door|<systemTypeId>|<materialId>|<color>|<slot>` — symmetrical
//     with `composeMaterialKey` for walls.
//   • The descriptor is positioned in WORLD coordinates relative to
//     the host wall's baseline + sill height.  The committer hands us
//     a pre-computed placement (origin + axis + normal + thickness)
//     so this producer has no store dependency.
//   • Local frame: x = wall axis (along baseline), y = wall outward
//     normal, z = vertical (world Y).  `appendBox` emits 24 vertices
//     (4 per face × 6 faces) so each face carries its own unit normal.

import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import { asMaterialKey, type MaterialKey } from '../types/MaterialKey.js';
import type { Door as DoorData } from '@pryzm/schemas';

export interface DoorWorldPlacement {
  /** Wall axis (along baseline, normalised, horizontal). */
  readonly axis: { x: number; y: number; z: number };
  /** Wall outward normal (perpendicular to axis, normalised, horizontal). */
  readonly normal: { x: number; y: number; z: number };
  /** World origin: bottom-centre of the door at the wall surface,
   *  WITH `door.sillHeight` and `door.offset` already applied. */
  readonly origin: { x: number; y: number; z: number };
  /** Wall thickness (m) — the door inhabits this depth band. */
  readonly wallThickness: number;
}

interface RawBuffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

const FRAME_FALLBACK_COLOR = '#8b7058';
const LEAF_FALLBACK_COLOR = '#c2a684';

function composeDoorMaterialKey(
  systemTypeId: string,
  materialId: string,
  color: string,
  slot: 'frame' | 'leaf',
): MaterialKey {
  return asMaterialKey(`door|${systemTypeId}|${materialId}|${color}|${slot}`);
}

/** Apply the door's local→world transform: x = axis, y = normal,
 *  z = world-Y (vertical).  Returns a tuple `[wx, wy, wz]`. */
function localToWorld(
  lx: number,
  ly: number,
  lz: number,
  p: DoorWorldPlacement,
  liftY: number,
): [number, number, number] {
  return [
    p.origin.x + p.axis.x * lx + p.normal.x * ly,
    p.origin.y + lz + liftY,
    p.origin.z + p.axis.z * lx + p.normal.z * ly,
  ];
}

/** Rotate a local-frame normal vector to world-frame.  Vertical local
 *  +Z always maps to world +Y. */
function localNormalToWorld(
  lnx: number,
  lny: number,
  lnz: number,
  p: DoorWorldPlacement,
): [number, number, number] {
  return [
    p.axis.x * lnx + p.normal.x * lny,
    lnz,
    p.axis.z * lnx + p.normal.z * lny,
  ];
}

/** Append one axis-aligned box in the door's LOCAL frame to `buf`,
 *  emitting per-face vertices so each face carries its own unit normal.
 *  Returns the (start, count) range covered in `buf.indices`. */
function appendBox(
  buf: RawBuffers,
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  p: DoorWorldPlacement,
  liftY: number,
): { start: number; count: number } {
  const indexStart = buf.indices.length;
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;

  // 6 faces.  Each face: [normal, [4 corners]].  Corners are CCW when
  // viewed from outside (matches THREE's default winding).
  const faces: ReadonlyArray<{
    n: [number, number, number];
    v: ReadonlyArray<[number, number, number]>;
  }> = [
    // -X
    { n: [-1, 0, 0], v: [
      [cx - hx, cy - hy, cz - hz],
      [cx - hx, cy + hy, cz - hz],
      [cx - hx, cy + hy, cz + hz],
      [cx - hx, cy - hy, cz + hz],
    ]},
    // +X
    { n: [1, 0, 0], v: [
      [cx + hx, cy + hy, cz - hz],
      [cx + hx, cy - hy, cz - hz],
      [cx + hx, cy - hy, cz + hz],
      [cx + hx, cy + hy, cz + hz],
    ]},
    // -Y
    { n: [0, -1, 0], v: [
      [cx + hx, cy - hy, cz - hz],
      [cx - hx, cy - hy, cz - hz],
      [cx - hx, cy - hy, cz + hz],
      [cx + hx, cy - hy, cz + hz],
    ]},
    // +Y
    { n: [0, 1, 0], v: [
      [cx - hx, cy + hy, cz - hz],
      [cx + hx, cy + hy, cz - hz],
      [cx + hx, cy + hy, cz + hz],
      [cx - hx, cy + hy, cz + hz],
    ]},
    // -Z (bottom)
    { n: [0, 0, -1], v: [
      [cx - hx, cy + hy, cz - hz],
      [cx - hx, cy - hy, cz - hz],
      [cx + hx, cy - hy, cz - hz],
      [cx + hx, cy + hy, cz - hz],
    ]},
    // +Z (top)
    { n: [0, 0, 1], v: [
      [cx - hx, cy - hy, cz + hz],
      [cx + hx, cy - hy, cz + hz],
      [cx + hx, cy + hy, cz + hz],
      [cx - hx, cy + hy, cz + hz],
    ]},
  ];

  for (const face of faces) {
    const baseV = buf.positions.length / 3;
    const [wnx, wny, wnz] = localNormalToWorld(face.n[0], face.n[1], face.n[2], p);
    // Re-normalise (axis/normal are unit so this is already 1, but
    // float round-tripping makes a defensive renorm cheap insurance
    // for `assertValidDescriptor`'s 1e-4 EPS gate).
    const len = Math.hypot(wnx, wny, wnz) || 1;
    const nx = wnx / len, ny = wny / len, nz = wnz / len;

    for (let i = 0; i < 4; i++) {
      const [lx, ly, lz] = face.v[i]!;
      const [wx, wy, wz] = localToWorld(lx, ly, lz, p, liftY);
      buf.positions.push(wx, wy, wz);
      buf.normals.push(nx, ny, nz);
    }
    // UVs — basic per-face [0,1]² mapping.
    buf.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    // Two triangles per quad.
    buf.indices.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);
  }

  return { start: indexStart, count: buf.indices.length - indexStart };
}

function computeBounds(positions: ReadonlyArray<number>): BufferGeometryDescriptor['bounds'] {
  if (positions.length < 3) {
    // Defensive — door should always have geometry.
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  }
  let minX = positions[0]!, minY = positions[1]!, minZ = positions[2]!;
  let maxX = minX, maxY = minY, maxZ = minZ;
  for (let i = 3; i < positions.length; i += 3) {
    const x = positions[i]!, y = positions[i + 1]!, z = positions[i + 2]!;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

export function produceDoor(door: DoorData, placement: DoorWorldPlacement): BufferGeometryDescriptor {
  const buf: RawBuffers = { positions: [], normals: [], uvs: [], indices: [] };
  const groups: Array<{ start: number; count: number; materialIndex: number }> = [];

  const systemTypeId = ''; // Door schema does not yet carry systemTypeId.
  const materialId = '';
  const frameColor = door.frameColor ?? FRAME_FALLBACK_COLOR;
  const leafColor = door.leafColor ?? LEAF_FALLBACK_COLOR;
  const materialKeys: MaterialKey[] = [
    composeDoorMaterialKey(systemTypeId, materialId, frameColor, 'frame'),
    composeDoorMaterialKey(systemTypeId, materialId, leafColor, 'leaf'),
  ];

  const w = door.width;
  const h = door.height;
  const fW = door.frameWidth;
  // Frame depth fills (most of) the wall thickness.  Leaf depth is
  // narrower so it visibly recesses into the frame.
  const frameDepth = Math.max(0.04, placement.wallThickness * 0.8);
  const leafDepth = Math.max(0.03, frameDepth * 0.5);

  // Sill height lifts every vertex up in world Y.  Per the
  // `DoorWorldPlacement` JSDoc, callers MAY also pre-shift `origin.y`
  // — both contributions stack.  Test fixtures pass an unshifted
  // origin and rely on the producer to apply `door.sillHeight` here.
  const liftY = door.sillHeight;

  // ── Frame group (3 boxes) ──
  const frameStart = buf.indices.length;
  // Left jamb
  appendBox(buf, -w / 2 + fW / 2, 0, h / 2, fW, frameDepth, h, placement, liftY);
  // Right jamb
  appendBox(buf, w / 2 - fW / 2, 0, h / 2, fW, frameDepth, h, placement, liftY);
  // Head lintel (between jambs)
  const headW = Math.max(0, w - 2 * fW);
  if (headW > 0) {
    appendBox(buf, 0, 0, h - fW / 2, headW, frameDepth, fW, placement, liftY);
  } else {
    // Degenerate door (frameWidth*2 == width) — emit a thin head
    // anyway so the descriptor is non-empty.
    appendBox(buf, 0, 0, h - fW / 2, w, frameDepth, fW, placement, liftY);
  }
  groups.push({
    start: frameStart,
    count: buf.indices.length - frameStart,
    materialIndex: 0,
  });

  // ── Leaf group (1 box) ──
  const leafStart = buf.indices.length;
  const leafW = Math.max(0.05, w - 2 * fW);
  const leafH = Math.max(0.05, h - fW);
  appendBox(buf, 0, 0, leafH / 2, leafW, leafDepth, leafH, placement, liftY);
  groups.push({
    start: leafStart,
    count: buf.indices.length - leafStart,
    materialIndex: 1,
  });

  const positionArr = new Float32Array(buf.positions);
  const normalArr = new Float32Array(buf.normals);
  const uvArr = new Float32Array(buf.uvs);
  const vertexCount = positionArr.length / 3;
  const indexArr =
    vertexCount < 65536 ? new Uint16Array(buf.indices) : new Uint32Array(buf.indices);

  return {
    position: positionArr,
    normal: normalArr,
    uv: uvArr,
    index: indexArr,
    bounds: computeBounds(buf.positions),
    groups,
    materialKeys,
    hash: composeDoorGeometryHash(door, placement),
  };
}

export function composeDoorGeometryHash(door: DoorData, placement: DoorWorldPlacement): string {
  const r = (n: number) => Math.round(n * 1e4) / 1e4;
  return [
    'door:v1',
    door.id,
    r(door.width),
    r(door.height),
    r(door.sillHeight),
    r(door.frameWidth),
    r(door.frameThickness),
    door.frameColor ?? FRAME_FALLBACK_COLOR,
    door.leafColor ?? LEAF_FALLBACK_COLOR,
    r(placement.origin.x),
    r(placement.origin.y),
    r(placement.origin.z),
    r(placement.axis.x),
    r(placement.axis.y),
    r(placement.axis.z),
    r(placement.normal.x),
    r(placement.normal.y),
    r(placement.normal.z),
    r(placement.wallThickness),
  ].join('|');
}

export type DoorProducer = (
  dto: Readonly<DoorData>,
  placement: Readonly<DoorWorldPlacement>,
) => BufferGeometryDescriptor;
