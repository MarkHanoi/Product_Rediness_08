// produceDimension — measurement-annotation geometry (S29).
//
// `code-level ADR docs/architecture/adr/0028-plan-view-canvas-architecture.md`.
//
// A dimension is fundamentally a 2D annotation.  The kernel emits TWO
// pieces of information:
//
//   1. `analyseDimension(dto)` — a pure analytic record (extension lines,
//      the dim line itself, arrowhead anchors, formatted label text).
//      The plan-view canvas host (S29) and the 3D billboard committer
//      (S31+) both consume this record without any THREE coupling.
//
//   2. `produceDimension(dto, _joinData, worldY)` — a `BufferGeometryDescriptor`
//      whose draw groups contain the arrowhead body geometry as small
//      box prisms.  This satisfies the descriptor invariants (so the
//      committer hot-path is the same as every other family) and gives
//      the 3D scene something visible.  The extension and dim lines
//      themselves are rendered as line primitives by the committer at
//      a later sprint; for the descriptor's bounds we include their
//      footprint so picking remains correct.
//
// Sub-kind dispatch is on `Dimension.kind`:
//
//   - `linear`         — straight measure between points[0] and points[1].
//   - `angular`        — angle at points[1] between rays to points[0]/[2].
//   - `radial`         — distance from points[0] (centre) to points[1].
//   - `diameter`       — radial × 2; dim line drawn through the centre.
//   - `spot-elevation` — single anchor at points[0]; label is the y value.
//   - `slope`          — rise/run between points[0] and points[1].
//
// All variants share the same flat-list emission so the parity tests
// can compare across kinds with a single descriptor walker.

import type { Dimension } from '@pryzm/protocol';
import type { BufferGeometryDescriptor } from '../types/BufferGeometryDescriptor.js';
import type { JoinData } from '../types/JoinData.js';
import type { Point3D } from '../types/Point3D.js';
import { asMaterialKey } from '../types/MaterialKey.js';
import { concatRaw, type RawGroup } from './_internal/rawGeometry.js';
import { serializeDescriptor } from './_internal/serializeDescriptor.js';
import { composeDimensionGeometryHash } from './_internal/composeDimensionGeometryHash.js';

export { DIMENSION_HASH_SCHEMA_VERSION } from './_internal/composeDimensionGeometryHash.js';

// ────────────────────────────────────────────────────────────────────────
// Material key
// ────────────────────────────────────────────────────────────────────────

/**
 * Material-key shape — the committer uses these parts to pick stroke
 * weight, arrowhead style, and text rendering parameters.
 *
 *   `dimension|<kind>|<style>|<unit>|<precision>|body`
 */
export function composeDimensionMaterialKey(d: Dimension): string {
  return `dimension|${d.kind}|${d.style}|${d.units}|${d.precision}|body`;
}

// ────────────────────────────────────────────────────────────────────────
// Analytic record
// ────────────────────────────────────────────────────────────────────────

export interface DimensionEdge {
  readonly start: Point3D;
  readonly end: Point3D;
  readonly kind: 'extension-line' | 'dimension-line' | 'leader';
}

export interface DimensionArrow {
  readonly anchor: Point3D;
  /** Unit-length pointing INTO the dim line (so the head sits on `anchor`). */
  readonly direction: Point3D;
}

export interface DimensionAnalytic {
  /** Numeric measurement, in metres for length / dimensionless for slope / radians for angular. */
  readonly measurement: number;
  /** Display label — the formatted value, OR the override text if `overridden`. */
  readonly label: string;
  /** Witness lines that connect the measured points to the dim line. */
  readonly extensionLines: readonly DimensionEdge[];
  /** The dim line itself (`null` for `spot-elevation` which has no second point). */
  readonly dimensionLine: DimensionEdge | null;
  /** Arrowhead anchors at the dim-line endpoints. */
  readonly arrowheads: readonly DimensionArrow[];
  /** Text anchor — usually the dim-line midpoint; `null` for spot-elevation (uses the leader anchor). */
  readonly anchor: Point3D;
  /** True iff the input had enough reference points for its kind. */
  readonly valid: boolean;
}

// ────────────────────────────────────────────────────────────────────────
// Geometry constants
// ────────────────────────────────────────────────────────────────────────

/** Convert sheet-millimetres to metres for offset / arrowhead sizing. */
const MM_TO_M = 1 / 1000;
/** Architectural arrowhead body — width × length × thickness. */
const ARROW_LEN_MM = 3.0;
const ARROW_WID_MM = 1.0;
const ARROW_THK_MM = 0.3;

// ────────────────────────────────────────────────────────────────────────
// Pure helpers
// ────────────────────────────────────────────────────────────────────────

function v3(x: number, y: number, z: number): Point3D { return { x, y, z }; }

function sub(a: Point3D, b: Point3D): Point3D {
  return v3(a.x - b.x, a.y - b.y, a.z - b.z);
}
function add(a: Point3D, b: Point3D): Point3D {
  return v3(a.x + b.x, a.y + b.y, a.z + b.z);
}
function scale(a: Point3D, s: number): Point3D { return v3(a.x * s, a.y * s, a.z * s); }
function dot(a: Point3D, b: Point3D): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
function lenSq(a: Point3D): number { return dot(a, a); }
function length(a: Point3D): number { return Math.sqrt(lenSq(a)); }
function normalise(a: Point3D): Point3D {
  const l = length(a);
  if (!Number.isFinite(l) || l === 0) return v3(1, 0, 0);
  return scale(a, 1 / l);
}
function cross(a: Point3D, b: Point3D): Point3D {
  return v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}
function midpoint(a: Point3D, b: Point3D): Point3D {
  return v3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

/**
 * Pick a perpendicular offset direction in the plan plane.  The
 * dimension line lives `offsetMm` away from the measured edge; for a
 * horizontal measurement we want the offset to go "up" in the XZ plane
 * (i.e. perpendicular to the measured direction).
 *
 * If the measured direction is nearly vertical (Y axis), the offset
 * goes along world X to keep the dim line legible.  Otherwise, the
 * offset is the cross-product with world Y rotated to lie in the XZ
 * plane — for a horizontal X-axis measurement this gives world Z, for
 * a Z-axis measurement this gives world −X, etc.
 */
function planPerpendicular(direction: Point3D): Point3D {
  const n = normalise(direction);
  const refUp = v3(0, 1, 0);
  // If the direction is parallel to world Y (within tolerance), use world X as the perp.
  if (Math.abs(dot(n, refUp)) > 0.999) return v3(1, 0, 0);
  // Cross with world Y gives a vector in the XZ plane perpendicular to n.
  const perp = normalise(cross(n, refUp));
  return perp;
}

// ────────────────────────────────────────────────────────────────────────
// Measurement + format
// ────────────────────────────────────────────────────────────────────────

const UNIT_FROM_M: Record<Dimension['units'], number> = {
  mm: 1000,
  cm: 100,
  m: 1,
  in: 39.37007874,
  ft: 3.280839895,
};

function formatLength(metres: number, unit: Dimension['units'], precision: number): string {
  const value = metres * UNIT_FROM_M[unit];
  return `${value.toFixed(precision)} ${unit}`;
}

function formatAngle(radians: number, precision: number): string {
  const deg = (radians * 180) / Math.PI;
  return `${deg.toFixed(precision)}°`;
}

function formatSlope(rise: number, run: number, precision: number): string {
  if (run === 0) return '∞';
  const ratio = rise / run;
  return `${(ratio * 100).toFixed(precision)} %`;
}

// ────────────────────────────────────────────────────────────────────────
// analyseDimension
// ────────────────────────────────────────────────────────────────────────

/**
 * Pure analytic computation — same input always yields the same output.
 *
 * Used by both the plan-view canvas host (renders the lines + label
 * directly) and the 3D billboard committer (lifts the same lines as a
 * facing overlay).
 */
export function analyseDimension(dto: Dimension): DimensionAnalytic {
  const offsetMetres = dto.offsetMm * MM_TO_M;
  const noResult: DimensionAnalytic = {
    measurement: 0,
    label: '',
    extensionLines: [],
    dimensionLine: null,
    arrowheads: [],
    anchor: dto.points[0] ?? v3(0, 0, 0),
    valid: false,
  };

  switch (dto.kind) {
    case 'linear': {
      if (dto.points.length < 2) return noResult;
      const a = dto.points[0]!;
      const b = dto.points[1]!;
      const dir = sub(b, a);
      const measurement = length(dir);
      const perp = planPerpendicular(dir);
      const offsetVec = scale(perp, offsetMetres);
      const dimStart = add(a, offsetVec);
      const dimEnd = add(b, offsetVec);
      const label = dto.overridden
        ? (dto.overrideText ?? '')
        : formatLength(measurement, dto.units, dto.precision);
      return {
        measurement,
        label,
        extensionLines: [
          { kind: 'extension-line', start: a, end: dimStart },
          { kind: 'extension-line', start: b, end: dimEnd },
        ],
        dimensionLine: { kind: 'dimension-line', start: dimStart, end: dimEnd },
        arrowheads: [
          { anchor: dimStart, direction: normalise(dir) },
          { anchor: dimEnd, direction: scale(normalise(dir), -1) },
        ],
        anchor: midpoint(dimStart, dimEnd),
        valid: true,
      };
    }
    case 'angular': {
      if (dto.points.length < 3) return noResult;
      const a = dto.points[0]!;
      const apex = dto.points[1]!;
      const b = dto.points[2]!;
      const ra = sub(a, apex);
      const rb = sub(b, apex);
      const lenA = length(ra);
      const lenB = length(rb);
      if (lenA === 0 || lenB === 0) return noResult;
      const cosT = dot(ra, rb) / (lenA * lenB);
      const angle = Math.acos(Math.max(-1, Math.min(1, cosT)));
      const arcRadius = Math.min(lenA, lenB) + offsetMetres;
      const dirA = scale(ra, 1 / lenA);
      const dirB = scale(rb, 1 / lenB);
      const arcStart = add(apex, scale(dirA, arcRadius));
      const arcEnd = add(apex, scale(dirB, arcRadius));
      const label = dto.overridden ? (dto.overrideText ?? '') : formatAngle(angle, dto.precision);
      return {
        measurement: angle,
        label,
        extensionLines: [
          { kind: 'extension-line', start: apex, end: arcStart },
          { kind: 'extension-line', start: apex, end: arcEnd },
        ],
        // Skeleton: the arc is approximated by a chord; full arc rendering lands in S31.
        dimensionLine: { kind: 'dimension-line', start: arcStart, end: arcEnd },
        arrowheads: [
          { anchor: arcStart, direction: dirA },
          { anchor: arcEnd, direction: dirB },
        ],
        anchor: midpoint(arcStart, arcEnd),
        valid: true,
      };
    }
    case 'radial': {
      if (dto.points.length < 2) return noResult;
      const centre = dto.points[0]!;
      const edge = dto.points[1]!;
      const measurement = length(sub(edge, centre));
      const label = dto.overridden ? (dto.overrideText ?? '') : `R ${formatLength(measurement, dto.units, dto.precision)}`;
      return {
        measurement,
        label,
        extensionLines: [],
        dimensionLine: { kind: 'dimension-line', start: centre, end: edge },
        arrowheads: [{ anchor: edge, direction: normalise(sub(centre, edge)) }],
        anchor: midpoint(centre, edge),
        valid: true,
      };
    }
    case 'diameter': {
      if (dto.points.length < 2) return noResult;
      const a = dto.points[0]!;
      const b = dto.points[1]!;
      const measurement = length(sub(b, a));
      const dir = normalise(sub(b, a));
      const label = dto.overridden ? (dto.overrideText ?? '') : `Ø ${formatLength(measurement, dto.units, dto.precision)}`;
      return {
        measurement,
        label,
        extensionLines: [],
        dimensionLine: { kind: 'dimension-line', start: a, end: b },
        arrowheads: [
          { anchor: a, direction: dir },
          { anchor: b, direction: scale(dir, -1) },
        ],
        anchor: midpoint(a, b),
        valid: true,
      };
    }
    case 'spot-elevation': {
      if (dto.points.length < 1) return noResult;
      const p = dto.points[0]!;
      const leaderEnd = add(p, v3(0, offsetMetres, 0));
      const label = dto.overridden ? (dto.overrideText ?? '') : `EL ${formatLength(p.y, dto.units, dto.precision)}`;
      return {
        measurement: p.y,
        label,
        extensionLines: [{ kind: 'leader', start: p, end: leaderEnd }],
        dimensionLine: null,
        arrowheads: [{ anchor: p, direction: v3(0, -1, 0) }],
        anchor: leaderEnd,
        valid: true,
      };
    }
    case 'slope': {
      if (dto.points.length < 2) return noResult;
      const a = dto.points[0]!;
      const b = dto.points[1]!;
      const rise = b.y - a.y;
      const horizDelta = sub(b, a);
      const run = Math.sqrt(horizDelta.x * horizDelta.x + horizDelta.z * horizDelta.z);
      const label = dto.overridden ? (dto.overrideText ?? '') : formatSlope(rise, run, dto.precision);
      return {
        measurement: run === 0 ? 0 : rise / run,
        label,
        extensionLines: [],
        dimensionLine: { kind: 'dimension-line', start: a, end: b },
        arrowheads: [
          { anchor: a, direction: normalise(sub(b, a)) },
          { anchor: b, direction: normalise(sub(a, b)) },
        ],
        anchor: midpoint(a, b),
        valid: true,
      };
    }
    default:
      return noResult;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Arrowhead body geometry (small box prism)
// ────────────────────────────────────────────────────────────────────────

/**
 * Emit a small extruded box centred on `anchor`, with its long axis
 * aligned with `direction`.  Always 12 triangles (a simple closed
 * box) so the descriptor invariants are trivially satisfied.
 */
function emitArrowheadBox(
  anchor: Point3D,
  direction: Point3D,
  worldY: number,
): { positions: number[]; normals: number[]; uvs: number[] } {
  const dir = normalise(direction);
  const lenM = ARROW_LEN_MM * MM_TO_M;
  const widM = ARROW_WID_MM * MM_TO_M;
  const thkM = ARROW_THK_MM * MM_TO_M;

  // Local basis: dir = X', cross(dir, world-Y) = Z' (perp in plan), world-Y = Y'.
  const xp = dir;
  const yp = v3(0, 1, 0);
  let zp = cross(xp, yp);
  if (lenSq(zp) < 1e-12) zp = v3(0, 0, 1);
  zp = normalise(zp);

  const cy = anchor.y + worldY;
  const baseCentre = v3(anchor.x, cy, anchor.z);

  // 8 corners — front (towards baseCentre + dir*len) and back at baseCentre.
  const half = lenM / 2;
  const halfW = widM / 2;
  const halfH = thkM / 2;

  const corners: Point3D[] = [];
  for (const sx of [-half, half]) {
    for (const sy of [-halfH, halfH]) {
      for (const sz of [-halfW, halfW]) {
        const p = add(baseCentre, add(add(scale(xp, sx), scale(yp, sy)), scale(zp, sz)));
        corners.push(p);
      }
    }
  }
  // Corner index map: corners[(ix*2 + iy)*2 + iz] for ix,iy,iz ∈ {0,1}.
  const idx = (ix: number, iy: number, iz: number): number => (ix * 2 + iy) * 2 + iz;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  function pushTri(ai: number, bi: number, ci: number, n: Point3D): void {
    for (const i of [ai, bi, ci]) {
      const p = corners[i]!;
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
      uvs.push(0, 0);
    }
  }

  // 6 faces × 2 triangles
  // +X face (ix=1)
  const nXp = xp; const nXn = scale(xp, -1);
  pushTri(idx(1, 0, 0), idx(1, 1, 0), idx(1, 1, 1), nXp);
  pushTri(idx(1, 0, 0), idx(1, 1, 1), idx(1, 0, 1), nXp);
  // -X face (ix=0)
  pushTri(idx(0, 0, 0), idx(0, 1, 1), idx(0, 1, 0), nXn);
  pushTri(idx(0, 0, 0), idx(0, 0, 1), idx(0, 1, 1), nXn);
  // +Y face
  const nYp = yp; const nYn = scale(yp, -1);
  pushTri(idx(0, 1, 0), idx(0, 1, 1), idx(1, 1, 1), nYp);
  pushTri(idx(0, 1, 0), idx(1, 1, 1), idx(1, 1, 0), nYp);
  // -Y face
  pushTri(idx(0, 0, 0), idx(1, 0, 1), idx(0, 0, 1), nYn);
  pushTri(idx(0, 0, 0), idx(1, 0, 0), idx(1, 0, 1), nYn);
  // +Z face
  const nZp = zp; const nZn = scale(zp, -1);
  pushTri(idx(0, 0, 1), idx(1, 0, 1), idx(1, 1, 1), nZp);
  pushTri(idx(0, 0, 1), idx(1, 1, 1), idx(0, 1, 1), nZp);
  // -Z face
  pushTri(idx(0, 0, 0), idx(0, 1, 0), idx(1, 1, 0), nZn);
  pushTri(idx(0, 0, 0), idx(1, 1, 0), idx(1, 0, 0), nZn);

  return { positions, normals, uvs };
}

// ────────────────────────────────────────────────────────────────────────
// produceDimension
// ────────────────────────────────────────────────────────────────────────

export type DimensionProducer = (
  d: Readonly<Dimension>,
  joinData: Readonly<JoinData>,
  worldY: number,
) => BufferGeometryDescriptor;

export const produceDimension: DimensionProducer = (d, _joinData, worldY) => {
  const analytic = analyseDimension(d);
  const key = asMaterialKey(composeDimensionMaterialKey(d));

  // Always emit at least one tiny degenerate box at the anchor so the
  // descriptor invariants (≥1 group, ≥3 indices) are satisfied even
  // when the dimension is invalid (insufficient points) or when the
  // style is `custom` (no arrowheads).  Picking still resolves on the
  // anchor point.
  const arrows = analytic.arrowheads.length > 0 && d.style !== 'custom'
    ? analytic.arrowheads
    : [{ anchor: analytic.anchor, direction: { x: 1, y: 0, z: 0 } as Point3D }];

  const groups: RawGroup[] = arrows.map((a) => ({
    geometry: emitArrowheadBox(a.anchor, a.direction, worldY),
    materialKey: key,
  }));

  const concat = concatRaw(groups);
  return serializeDescriptor(concat, composeDimensionGeometryHash(d, worldY));
};
