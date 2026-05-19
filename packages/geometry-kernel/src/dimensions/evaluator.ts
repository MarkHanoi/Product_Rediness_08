// PRYZM 2 — DimensionEvaluator (S33 Track C / Phase 2B Supplement §A3).
//
// Spec source:
//   • `docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-SUPPLEMENT-AUTODIM-VIEWTEMPLATE.md` §A3
//
// LAYER PURITY (CI Gate G10)
// ─────────────────────────────────────────────────────────────────────────────
// L4 — pure DTO → screen-space resolution.  ZERO `three`, `@thatopen/*`,
// `web-ifc*`, DOM, or Node-specific imports.  The bake-worker test mandate
// verifies a Node-load works without polyfills.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Resolves anchor refs against current element geometry, returning
//   `EvaluatedDimension[]` with positions in **world millimetres** (matches
//   the supplement §A3 "in mm" comment on `p1World` / `p2World` / `lineY` /
//   `witnessP1` / `witnessP2`) and `valueMm` in millimetres.
// • Element geometry is read in metres (per the canonical Vec3 schema) and
//   multiplied by `MM_PER_M` (1000) at the boundary so the rest of the file
//   operates in a single unit system.
// • Style sizes (`offsetMm`, witness `extension` / `offset` / `weight`,
//   text height) are interpreted as world millimetres — the committer
//   layer applies camera scale to convert mm → pixels at draw time.
// • Override flag fires when |display − geometric| / geometric > 5 %
//   (`isFlagged === true`) — the committer renders an orange underline.
//
// EXIT CRITERIA (S33 supplement §A3)
// ─────────────────────────────────────────────────────────────────────────────
// • `evaluateDimensions` runs in Node (verified by the unit test suite).
// • All 10 DimAnchor kinds resolved across Wall / Door / Window / Room.
// • Zero THREE/DOM imports (CI Gate G10 enforced).
// • Performance: 5,000 dimensions in < 16 ms (bench mandate, S35).

import type {
  DimensionString,
  EvaluatedDimension,
  UnitFormat,
} from '@pryzm/schemas/annotation/dimension';

// ── Unit conversion ────────────────────────────────────────────────────────

const MM_PER_M = 1000;
const MM_PER_INCH = 25.4;
const INCHES_PER_FT = 12;

// ── Element shapes the evaluator reads (geometry-bearing) ──────────────────
//
// Mirrors the canonical schemas defined in `@pryzm/schemas` but kept as
// minimal local interfaces so the kernel does not import the full schema
// surface.  This also documents the exact set of fields the evaluator
// actually reads.

export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface WallLikeEvaluator {
  readonly id: string;
  /** `[start, end]` endpoints in WORLD METRES (XZ plane, y = level elevation). */
  readonly baseLine: readonly [Vec3Like, Vec3Like];
  /** Wall height in metres. */
  readonly height?: number;
  /** Vertical offset from level base, metres. */
  readonly baseOffset?: number;
}

export interface DoorLikeEvaluator {
  readonly id: string;
  /** Host wall id. */
  readonly wallId: string;
  /** Distance along baseLine from start, metres. */
  readonly offset: number;
  /** Door width, metres. */
  readonly width: number;
  /** Door height, metres. */
  readonly height: number;
  /** Sill height above level base, metres. */
  readonly sillHeight?: number | undefined;
}

export interface WindowLikeEvaluator {
  readonly id: string;
  readonly wallId: string;
  readonly offset: number;
  readonly width: number;
  readonly height: number;
  readonly sillHeight?: number;
}

export interface RoomLikeEvaluator {
  readonly id: string;
  /** Boundary polygon in WORLD METRES (XZ plane, y typically 0). */
  readonly boundary: readonly Vec3Like[];
}

export interface ElementSnapshotForDim {
  readonly walls: ReadonlyMap<string, WallLikeEvaluator>;
  readonly doors: ReadonlyMap<string, DoorLikeEvaluator>;
  readonly windows: ReadonlyMap<string, WindowLikeEvaluator>;
  readonly rooms: ReadonlyMap<string, RoomLikeEvaluator>;
}

export interface ProjectUnitSettings {
  readonly unit: 'mm' | 'cm' | 'm' | 'ft' | 'in' | 'ft-in';
  readonly decimalPlaces: number;
}

// ── Public entry point ─────────────────────────────────────────────────────

export function evaluateDimensions(
  dimensions: readonly DimensionString[],
  snapshot: ElementSnapshotForDim,
  projectUnits: ProjectUnitSettings,
): EvaluatedDimension[] {
  return dimensions.map((dim) => evaluateOne(dim, snapshot, projectUnits));
}

// ── Per-dimension evaluation ───────────────────────────────────────────────

function evaluateOne(
  dim: DimensionString,
  snapshot: ElementSnapshotForDim,
  units: ProjectUnitSettings,
): EvaluatedDimension {
  // 1. Resolve the two primary references → world MM coords.
  const ref0 = dim.references[0];
  const ref1 = dim.references[1];
  if (!ref0 || !ref1) {
    // Defensive — DimensionStringSchema requires ≥ 2 refs for non-radial kinds;
    // for safety we return a degenerate eval at origin.
    return makeDegenerate(dim);
  }
  const p1 = resolveAnchor(ref0.elementId as string, ref0.anchor, snapshot);
  const p2 = resolveAnchor(ref1.elementId as string, ref1.anchor, snapshot);

  // 2. Compute raw geometric value (mm).
  let valueMm: number;
  if (dim.orientation === 'horizontal') {
    valueMm = Math.abs(p2[0] - p1[0]);
  } else if (dim.orientation === 'vertical') {
    valueMm = Math.abs(p2[1] - p1[1]);
  } else {
    // 'aligned' or 'angular' fallback — true Euclidean length.
    valueMm = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  }

  // 3. Apply override if pinned.
  const isOverride = dim.override !== null && dim.override !== undefined;
  const displayValueMm = isOverride ? (dim.override as number) : valueMm;

  // 4. Flag if override disagrees with geometry by > 5 % (avoid div-by-zero).
  const isFlagged =
    isOverride && valueMm > 1e-6 && Math.abs(displayValueMm - valueMm) / valueMm > 0.05;

  // 5. Format display text.
  const fmt: UnitFormat = dim.unitFormat ?? {
    unit: units.unit,
    decimalPlaces: units.decimalPlaces,
    suppressTrailingZeros: true,
    prefix: dim.label ?? '',
    suffix: '',
  };
  const valueText = formatDimension(displayValueMm, fmt);

  // 6. Geometry: dimension line position + witness endpoints.
  const offsetMm = dim.offsetMm ?? 8;
  const lineY = computeDimLinePosition(dim, p1, p2, offsetMm);
  const witnessP1 = computeWitnessPoint(p1, dim, offsetMm);
  const witnessP2 = computeWitnessPoint(p2, dim, offsetMm);

  return {
    id: dim.id,
    valueText,
    valueMm,
    p1World: p1,
    p2World: p2,
    lineY,
    witnessP1,
    witnessP2,
    isOverride,
    isFlagged,
  };
}

function makeDegenerate(dim: DimensionString): EvaluatedDimension {
  return {
    id: dim.id,
    valueText: '',
    valueMm: 0,
    p1World: [0, 0],
    p2World: [0, 0],
    lineY: 0,
    witnessP1: [0, 0],
    witnessP2: [0, 0],
    isOverride: false,
    isFlagged: false,
  };
}

// ── Anchor resolution ──────────────────────────────────────────────────────
//
// Returns plan-XZ position in WORLD MM as `[x, y]` where `y = world Z mm`
// (matches the spec convention: plan view stores its second axis as Z and
// `PlanCamera.worldToScreen(x, z)` maps `z` → screen-y).  The metre-→-mm
// conversion happens here, at the schema boundary.

function resolveAnchor(
  elementId: string,
  anchor: string,
  snapshot: ElementSnapshotForDim,
): [number, number] {
  const wall = snapshot.walls.get(elementId);
  if (wall) return resolveWallAnchor(wall, anchor);

  const door = snapshot.doors.get(elementId);
  if (door) return resolveDoorAnchor(door, anchor, snapshot);

  const win = snapshot.windows.get(elementId);
  if (win) return resolveWindowAnchor(win, anchor, snapshot);

  const room = snapshot.rooms.get(elementId);
  if (room) return resolveRoomAnchor(room, anchor);

  return [0, 0]; // element not found — safe fallback
}

function resolveWallAnchor(wall: WallLikeEvaluator, anchor: string): [number, number] {
  const a = wall.baseLine[0];
  const b = wall.baseLine[1];
  // Convert metres → mm at boundary; plan axes are X (world X) and Z (world Z).
  const ax = a.x * MM_PER_M;
  const az = a.z * MM_PER_M;
  const bx = b.x * MM_PER_M;
  const bz = b.z * MM_PER_M;

  // Vertical anchors require height & elevation (also metres → mm).
  const baseElevationMm = (a.y + (wall.baseOffset ?? 0)) * MM_PER_M;
  const heightMm = (wall.height ?? 0) * MM_PER_M;

  switch (anchor) {
    case 'start':
      return [ax, az];
    case 'end':
      return [bx, bz];
    case 'center':
    case 'centerline':
      return [(ax + bx) / 2, (az + bz) / 2];
    case 'left':
      return ax <= bx ? [ax, az] : [bx, bz];
    case 'right':
      return ax >= bx ? [ax, az] : [bx, bz];
    case 'bottom':
      // Elevation/section anchor: world-X stays, plan-y becomes the wall base elevation.
      return [(ax + bx) / 2, baseElevationMm];
    case 'top':
      return [(ax + bx) / 2, baseElevationMm + heightMm];
    case 'face-outer':
    case 'face-inner':
      // Without left/right side classification, fall back to centerline midpoint.
      return [(ax + bx) / 2, (az + bz) / 2];
    default:
      return [ax, az];
  }
}

function resolveDoorAnchor(
  door: DoorLikeEvaluator,
  anchor: string,
  snapshot: ElementSnapshotForDim,
): [number, number] {
  const wall = snapshot.walls.get(door.wallId);
  if (!wall) return [0, 0];

  const a = wall.baseLine[0];
  const b = wall.baseLine[1];
  // Wall direction (metres) — used to interpolate door center along baseline.
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const wallLenM = Math.hypot(dx, dz);
  if (wallLenM < 1e-6) return [a.x * MM_PER_M, a.z * MM_PER_M];
  const ux = dx / wallLenM;
  const uz = dz / wallLenM;

  // Door center along wall baseline (metres → mm).
  const centerXMm = (a.x + ux * door.offset) * MM_PER_M;
  const centerZMm = (a.z + uz * door.offset) * MM_PER_M;
  const halfWidthMm = (door.width / 2) * MM_PER_M;
  const heightMm = door.height * MM_PER_M;
  const sillMm = (door.sillHeight ?? 0) * MM_PER_M;
  // Wall-base y (metres) + sill height (mm) → door-bottom elevation (mm).
  const baseElevationMm = a.y * MM_PER_M + sillMm;

  switch (anchor) {
    case 'left':
      // Half-width back along the wall direction (left of door's local +x).
      return [centerXMm - ux * halfWidthMm, centerZMm - uz * halfWidthMm];
    case 'right':
      return [centerXMm + ux * halfWidthMm, centerZMm + uz * halfWidthMm];
    case 'center':
    case 'centerline':
    case 'start':
    case 'end':
      return [centerXMm, centerZMm];
    case 'bottom':
      return [centerXMm, baseElevationMm];
    case 'top':
      return [centerXMm, baseElevationMm + heightMm];
    case 'face-outer':
    case 'face-inner':
      // Perpendicular to the wall by half-thickness — without thickness, return center.
      return [centerXMm, centerZMm];
    default:
      return [centerXMm, centerZMm];
  }
}

function resolveWindowAnchor(
  win: WindowLikeEvaluator,
  anchor: string,
  snapshot: ElementSnapshotForDim,
): [number, number] {
  // Identical geometry to door (host-wall offset + width/height).
  return resolveDoorAnchor(
    {
      id: win.id,
      wallId: win.wallId,
      offset: win.offset,
      width: win.width,
      height: win.height,
      sillHeight: win.sillHeight,
    },
    anchor,
    snapshot,
  );
}

function resolveRoomAnchor(room: RoomLikeEvaluator, anchor: string): [number, number] {
  const boundary = room.boundary;
  if (!boundary.length) return [0, 0];

  // Compute XZ-plane bbox in mm.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of boundary) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const minXMm = minX * MM_PER_M;
  const maxXMm = maxX * MM_PER_M;
  const minZMm = minZ * MM_PER_M;
  const maxZMm = maxZ * MM_PER_M;
  const cx = (minXMm + maxXMm) / 2;
  const cz = (minZMm + maxZMm) / 2;

  switch (anchor) {
    case 'left':
      return [minXMm, cz];
    case 'right':
      return [maxXMm, cz];
    case 'top':
      return [cx, maxZMm];
    case 'bottom':
      return [cx, minZMm];
    case 'center':
    case 'centerline':
      return [cx, cz];
    case 'start':
      return [minXMm, minZMm];
    case 'end':
      return [maxXMm, maxZMm];
    default:
      return [cx, cz];
  }
}

// ── Dimension line + witness geometry ──────────────────────────────────────

function computeDimLinePosition(
  dim: DimensionString,
  p1: readonly [number, number],
  p2: readonly [number, number],
  offsetMm: number,
): number {
  if (dim.orientation === 'horizontal') {
    // Dim line sits ABOVE both points (max-y + offset).
    return Math.max(p1[1], p2[1]) + offsetMm;
  }
  // 'vertical' or 'aligned' — sits to the RIGHT (max-x + offset).
  return Math.max(p1[0], p2[0]) + offsetMm;
}

function computeWitnessPoint(
  elementPt: readonly [number, number],
  dim: DimensionString,
  offsetMm: number,
): [number, number] {
  const ext = dim.witnessLines?.extension ?? 2;
  if (dim.orientation === 'horizontal') {
    return [elementPt[0], elementPt[1] + offsetMm + ext];
  }
  return [elementPt[0] + offsetMm + ext, elementPt[1]];
}

// ── Display formatting ─────────────────────────────────────────────────────

export function formatDimension(valueMm: number, fmt: UnitFormat): string {
  switch (fmt.unit) {
    case 'mm':
      return joinFmt(fmt, formatNumber(valueMm, fmt));
    case 'cm':
      return joinFmt(fmt, formatNumber(valueMm / 10, fmt));
    case 'm':
      return joinFmt(fmt, formatNumber(valueMm / MM_PER_M, fmt));
    case 'ft':
      return joinFmt(fmt, formatNumber(valueMm / MM_PER_INCH / INCHES_PER_FT, fmt) + "'");
    case 'in':
      return joinFmt(fmt, formatNumber(valueMm / MM_PER_INCH, fmt) + '"');
    case 'ft-in':
      return joinFmt(fmt, formatFeetInches(valueMm, fmt));
    default:
      return joinFmt(fmt, formatNumber(valueMm, fmt));
  }
}

function formatNumber(value: number, fmt: UnitFormat): string {
  let text = value.toFixed(fmt.decimalPlaces);
  if (fmt.suppressTrailingZeros && text.includes('.')) {
    text = text.replace(/0+$/, '').replace(/\.$/, '');
  }
  return text;
}

function formatFeetInches(mm: number, fmt: UnitFormat): string {
  const totalInches = mm / MM_PER_INCH;
  const feet = Math.floor(totalInches / INCHES_PER_FT);
  const inches = totalInches - feet * INCHES_PER_FT;
  const inchesText = formatNumber(inches, fmt);
  return `${feet}'-${inchesText}"`;
}

function joinFmt(fmt: UnitFormat, body: string): string {
  return `${fmt.prefix ?? ''}${body}${fmt.suffix ?? ''}`;
}
