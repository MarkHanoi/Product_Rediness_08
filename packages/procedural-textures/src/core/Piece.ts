// §PROCEDURAL-PATTERNS (L-1800) — the ONE geometric primitive every pattern reduces to.
//
// ─── Why a convex polygon, and why exactly one primitive ────────────────────
// Every floor pattern in the target taxonomy — plank/running bond, herringbone,
// chevron, Hungarian point, basket weave, Versailles, square tile, subway tile,
// hexagon — is a partition of the plane into CONVEX pieces, each with a grain or
// format DIRECTION. Nothing here is a "wood thing" or a "tile thing": herringbone
// laid in ceramic is the same LAYOUT with a different SHADING PROFILE, and that
// separation is the reason `layouts/` and `shading/` are different directories.
// A second primitive would have bought a second rasteriser and a second seam bug.
//
// ⛔ No THREE, no DOM, no I/O anywhere in this package (it sits at L0).

/** A half-plane `nx*x + ny*y + d >= 0`, with (nx,ny) UNIT so the value IS a distance in mm. */
export interface HalfPlane {
  readonly nx: number;
  readonly ny: number;
  readonly d: number;
}

/**
 * One laid piece — a stave, a board, a tile.
 *
 * `alongX/alongY` is the unit GRAIN direction. For wood it is the direction the
 * grain runs; for tile it is the format's long axis. It is carried on the piece
 * rather than derived from the polygon because a chevron parallelogram's grain is
 * NOT its longest edge — the whole point of a chevron is that the board is cut on
 * the bias.
 */
export interface Piece {
  /** Ordinal within the repeat cell. Seeds the per-piece variation (L-1804). */
  readonly index: number;
  /** Centroid, mm, inside the repeat cell's coordinate frame. */
  readonly cx: number;
  readonly cy: number;
  /** Unit grain / long-axis direction. */
  readonly alongX: number;
  readonly alongY: number;
  /** Nominal half-extents along and across the grain, mm. Used for local UV only. */
  readonly halfAlongMm: number;
  readonly halfAcrossMm: number;
  /** Convex polygon, CCW, flattened [x0,y0,x1,y1,...] in mm. */
  readonly poly: readonly number[];
}

/** A complete pattern layout: the pieces plus the EXACT repeat cell they tile. */
export interface PatternLayout {
  /** Repeat-cell size in millimetres. This is the real-world size of one texture tile. */
  readonly cellWidthMm: number;
  readonly cellHeightMm: number;
  readonly pieces: readonly Piece[];
  /**
   * Sum of piece polygon areas, mm². Analytic, computed from the polygons — NOT
   * from pixels. The rasteriser's measured coverage is checked against this, which
   * is how "the layout actually tiles" becomes a number instead of an opinion.
   */
  readonly pieceAreaMm2: number;
}

/** Shoelace area of a CCW polygon, mm². Positive for CCW. */
export function polygonArea(poly: readonly number[]): number {
  let a = 0;
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = poly[i * 2] as number;
    const yi = poly[i * 2 + 1] as number;
    const xj = poly[j * 2] as number;
    const yj = poly[j * 2 + 1] as number;
    a += xi * yj - xj * yi;
  }
  return a / 2;
}

/** Inward half-planes of a CCW convex polygon, normalised so the value is a distance. */
export function halfPlanes(poly: readonly number[]): HalfPlane[] {
  const out: HalfPlane[] = [];
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = poly[i * 2] as number;
    const yi = poly[i * 2 + 1] as number;
    const xj = poly[j * 2] as number;
    const yj = poly[j * 2 + 1] as number;
    const ex = xj - xi;
    const ey = yj - yi;
    const len = Math.hypot(ex, ey);
    if (len === 0) continue;
    // CCW ⇒ inward normal is the edge rotated +90°.
    const nx = -ey / len;
    const ny = ex / len;
    out.push({ nx, ny, d: -(nx * xi + ny * yi) });
  }
  return out;
}

/**
 * An axis-aligned or rotated RECTANGLE piece.
 *
 * ⭐ `insetMm` is HALF the joint width, applied on every side. Joints are made by
 * SHRINKING pieces, never by drawing lines: a drawn line has to be drawn twice
 * between neighbours and lands a half-pixel differently each time. Shrinking is
 * exact and symmetric, and it is why the joint width is honoured to the pixel.
 */
export function rectPiece(
  index: number,
  cx: number,
  cy: number,
  lengthMm: number,
  widthMm: number,
  angleRad: number,
  insetMm: number,
): Piece {
  const ax = Math.cos(angleRad);
  const ay = Math.sin(angleRad);
  const hl = lengthMm / 2 - insetMm;
  const hw = widthMm / 2 - insetMm;
  const bx = -ay;
  const by = ax;
  const poly = [
    cx - ax * hl - bx * hw, cy - ay * hl - by * hw,
    cx + ax * hl - bx * hw, cy + ay * hl - by * hw,
    cx + ax * hl + bx * hw, cy + ay * hl + by * hw,
    cx - ax * hl + bx * hw, cy - ay * hl + by * hw,
  ];
  return { index, cx, cy, alongX: ax, alongY: ay, halfAlongMm: hl, halfAcrossMm: hw, poly };
}

/**
 * A PARALLELOGRAM piece — the chevron / Hungarian-point board.
 *
 * The board is a rectangle `lengthMm × widthMm` whose two ENDS are cut at
 * `mitreRad` off square, so that two mirrored boards butt into a continuous V with
 * no end-grain showing. That mitre is the entire difference between a chevron and
 * a herringbone, and it is why chevron cannot be expressed as `rectPiece`.
 *
 * `lengthMm` is measured along the CENTRELINE (the length a joiner would cut).
 */
export function mitredPiece(
  index: number,
  cx: number,
  cy: number,
  lengthMm: number,
  widthMm: number,
  angleRad: number,
  mitreRad: number,
  insetMm: number,
): Piece {
  const ax = Math.cos(angleRad);
  const ay = Math.sin(angleRad);
  const bx = -ay;
  const by = ax;
  const hw = widthMm / 2 - insetMm;
  // Inset along the axis must be measured PERPENDICULAR to the mitred end, so the
  // joint reads the same width on a mitred end as on a sawn side.
  const hl = lengthMm / 2 - insetMm / Math.max(1e-6, Math.cos(mitreRad));
  const skew = Math.tan(mitreRad) * hw;
  const poly = [
    cx + ax * (-hl - skew) + bx * -hw, cy + ay * (-hl - skew) + by * -hw,
    cx + ax * (hl - skew) + bx * -hw, cy + ay * (hl - skew) + by * -hw,
    cx + ax * (hl + skew) + bx * hw, cy + ay * (hl + skew) + by * hw,
    cx + ax * (-hl + skew) + bx * hw, cy + ay * (-hl + skew) + by * hw,
  ];
  return { index, cx, cy, alongX: ax, alongY: ay, halfAlongMm: hl, halfAcrossMm: hw, poly };
}

/** A regular hexagon, flat-to-flat `acrossFlatsMm`, point-up (a vertex at +Y). */
export function hexPiece(
  index: number,
  cx: number,
  cy: number,
  acrossFlatsMm: number,
  insetMm: number,
): Piece {
  const apothem = acrossFlatsMm / 2 - insetMm;
  const r = (apothem * 2) / Math.sqrt(3); // circumradius of the inset hexagon
  const poly: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    poly.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return {
    index,
    cx,
    cy,
    alongX: 0,
    alongY: 1,
    halfAlongMm: r,
    halfAcrossMm: apothem,
    poly,
  };
}

/** Rotate a piece (polygon, centre and grain axis) about (ox, oy). */
export function rotatePiece(p: Piece, angleRad: number, ox: number, oy: number): Piece {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const poly: number[] = [];
  for (let i = 0; i < p.poly.length; i += 2) {
    const x = (p.poly[i] as number) - ox;
    const y = (p.poly[i + 1] as number) - oy;
    poly.push(ox + x * c - y * s, oy + x * s + y * c);
  }
  const dx = p.cx - ox;
  const dy = p.cy - oy;
  return {
    ...p,
    cx: ox + dx * c - dy * s,
    cy: oy + dx * s + dy * c,
    alongX: p.alongX * c - p.alongY * s,
    alongY: p.alongX * s + p.alongY * c,
    poly,
  };
}

/** Build a piece from an arbitrary CCW convex polygon plus an explicit grain axis. */
export function polyPiece(
  index: number,
  poly: readonly number[],
  alongX: number,
  alongY: number,
): Piece {
  let cx = 0;
  let cy = 0;
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    cx += poly[i * 2] as number;
    cy += poly[i * 2 + 1] as number;
  }
  cx /= n;
  cy /= n;
  const len = Math.hypot(alongX, alongY) || 1;
  const ax = alongX / len;
  const ay = alongY / len;
  let ha = 0;
  let hw = 0;
  for (let i = 0; i < n; i++) {
    const dx = (poly[i * 2] as number) - cx;
    const dy = (poly[i * 2 + 1] as number) - cy;
    ha = Math.max(ha, Math.abs(dx * ax + dy * ay));
    hw = Math.max(hw, Math.abs(-dx * ay + dy * ax));
  }
  return { index, cx, cy, alongX: ax, alongY: ay, halfAlongMm: ha, halfAcrossMm: hw, poly: [...poly] };
}
