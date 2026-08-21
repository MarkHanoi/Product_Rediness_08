// §GA-EDITORIAL-LAYER (L-1620) — THE JUDGE.
//
// One shared verdict function, used by BOTH the RED baseline (the engine at HEAD) and the
// GREEN suite (the engine after this lane), so the before/after numbers are the same
// measurement and not two different ones with the same name.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT COUNTS AS AN "INTERIOR DIMENSION" — AND THE TWO WRONG ANSWERS
// ─────────────────────────────────────────────────────────────────────────────
// Both were tried and both were rejected by measurement before this definition was
// settled on, so neither is re-tried by a later reader:
//
//   ✗ "its MEASURED SPAN midpoint is inside the shell" — the building overall measures
//     corner to corner, so its span midpoint sits in the middle of the plate while the
//     line itself stands metres outside. This counts every overall as interior.
//   ✗ "its DRAWN LINE midpoint is inside the shell" — placement-dependent, and at HEAD
//     the room-outline dims were pushed 0.8-3.2 m out of their own cell, which frequently
//     lands them OUTSIDE the whole plate. This counted 84 of 86 strings as exterior on
//     the very plate whose defect is too many interior dimensions.
//
//   ✓ "it MEASURES INTERIOR GEOMETRY" — every element it references is an interior
//     partition (or an opening hosted on one). That is what §12.3 is about, it is what
//     the founder's list of numbers is, and it does not move when placement changes.
//
// The drawn-line geometry is still computed — §12.2's "never inside the building" pin
// needs it — but it answers a DIFFERENT question and is kept separate.

export type Pt = { x: number; z: number };

export interface JudgeWall {
  readonly id: string;
  readonly a: Pt;
  readonly b: Pt;
  readonly role: 'shell' | 'cell';
  readonly openings: readonly { readonly id: string; readonly offset: number; readonly width: number }[];
}

export interface JudgeString {
  readonly kind: string;
  readonly orientation: string;
  readonly offsetMm?: number;
  readonly autoMode?: string;
  readonly references: readonly { readonly elementId: string; readonly anchor: string }[];
}

export interface Judged {
  readonly s: JudgeString;
  readonly a: Pt;
  readonly b: Pt;
  /** Every referenced element is an interior partition → an INTERIOR dimension (§12.3). */
  readonly interior: boolean;
  readonly valueMm: number;
  /** The room this dimension measures, when it measures one. */
  readonly room: string | null;
  /** The line the plan renderer draws (§12.2's pin). Null for a non-cardinal string. */
  readonly line: readonly [Pt, Pt] | null;
}

export interface JudgeRoom { id: string; x0: number; x1: number; z0: number; z1: number }

function resolvePoint(walls: readonly JudgeWall[], elementId: string, anchor: string): Pt | null {
  const wall = walls.find((w) => w.id === elementId);
  if (wall) {
    if (anchor === 'start') return wall.a;
    if (anchor === 'end') return wall.b;
    return { x: (wall.a.x + wall.b.x) / 2, z: (wall.a.z + wall.b.z) / 2 };
  }
  for (const w of walls) {
    const op = w.openings.find((o) => o.id === elementId);
    if (!op) continue;
    const dx = w.b.x - w.a.x, dz = w.b.z - w.a.z;
    const L = Math.hypot(dx, dz) || 1;
    const at = (d: number) => ({ x: w.a.x + (dx / L) * d, z: w.a.z + (dz / L) * d });
    if (anchor === 'left') return at(op.offset);
    if (anchor === 'right') return at(op.offset + op.width);
    return at(op.offset + op.width / 2);
  }
  return null;
}

function ownerRole(walls: readonly JudgeWall[], elementId: string): 'shell' | 'cell' | null {
  const wall = walls.find((w) => w.id === elementId);
  if (wall) return wall.role;
  for (const w of walls) if (w.openings.some((o) => o.id === elementId)) return w.role;
  return null;
}

export function pointInPolygon(pt: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!;
    if ((a.z > pt.z) === (b.z > pt.z)) continue;
    const xAtZ = a.x + ((pt.z - a.z) / (b.z - a.z)) * (b.x - a.x);
    if (pt.x < xAtZ) inside = !inside;
  }
  return inside;
}

export function segmentsCross(p1: Pt, p2: Pt, q1: Pt, q2: Pt): boolean {
  const d = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const d1 = d(q1, q2, p1), d2 = d(q1, q2, p2), d3 = d(p1, p2, q1), d4 = d(p1, p2, q2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * The line the plan renderer draws: through the FIRST reference point, offset along
 * `leftPerp(measurementDir)` by `offsetMm / 1000` world metres (L-155 world scale, L-191
 * sign). `leftPerp(d) = { x: -d.z, z: d.x }` (geometry.ts:44).
 */
function drawnLine(a: Pt, b: Pt, s: JudgeString): readonly [Pt, Pt] | null {
  const d = (s.offsetMm ?? 0) / 1000;
  if (s.orientation === 'horizontal') {
    const z = a.z + d;                       // dir=+X ⇒ leftPerp=(0,+1)
    return [{ x: Math.min(a.x, b.x), z }, { x: Math.max(a.x, b.x), z }];
  }
  if (s.orientation === 'vertical') {
    const x = a.x - d;                       // dir=+Z ⇒ leftPerp=(-1,0)
    return [{ x, z: Math.min(a.z, b.z) }, { x, z: Math.max(a.z, b.z) }];
  }
  return null;                               // 'aligned' — measured along its own direction
}

/**
 * Which room does this dimension MEASURE? Both ends inside one room's rectangle.
 *
 * The SMALLEST containing room wins, and that is not a tiebreak of convenience: a WC
 * inside an L-shaped room, or a stair core whose dimension ends on the corridor wall,
 * lies inside two rectangles, and the dimension belongs to the tighter one — which is
 * also always the one §12.3 made critical.
 */
function roomOf(a: Pt, b: Pt, rooms: readonly JudgeRoom[]): string | null {
  const pad = 0.30;
  let best: JudgeRoom | null = null;
  for (const r of rooms) {
    const within = (p: Pt) =>
      p.x >= r.x0 - pad && p.x <= r.x1 + pad && p.z >= r.z0 - pad && p.z <= r.z1 + pad;
    if (!within(a) || !within(b)) continue;
    const area = (r.x1 - r.x0) * (r.z1 - r.z0);
    if (best === null || area < (best.x1 - best.x0) * (best.z1 - best.z0)) best = r;
  }
  return best ? best.id : null;
}

export function judgeGaPlate(
  walls: readonly JudgeWall[],
  rooms: readonly JudgeRoom[],
  strings: readonly JudgeString[],
): Judged[] {
  const out: Judged[] = [];
  for (const s of strings) {
    const first = s.references[0];
    const last = s.references[s.references.length - 1];
    if (!first || !last) continue;
    const a = resolvePoint(walls, first.elementId, first.anchor);
    const b = resolvePoint(walls, last.elementId, last.anchor);
    if (!a || !b) continue;
    const roles = s.references.map((r) => ownerRole(walls, r.elementId));
    const interior = roles.length > 0 && roles.every((r) => r === 'cell');
    const valueMm = Math.round(
      (s.orientation === 'horizontal' ? Math.abs(b.x - a.x)
        : s.orientation === 'vertical' ? Math.abs(b.z - a.z)
          : Math.hypot(b.x - a.x, b.z - a.z)) * 1000,
    );
    out.push({ s, a, b, interior, valueMm, room: roomOf(a, b, rooms), line: drawnLine(a, b, s) });
  }
  return out;
}

/** The §12.3 tally: interior dimensions per room, split into widths and lengths. */
export function perRoomTally(judged: readonly Judged[]): Map<string, { h: number; v: number }> {
  const m = new Map<string, { h: number; v: number }>();
  for (const j of judged) {
    if (!j.interior) continue;
    const key = j.room ?? '(unassigned)';
    const e = m.get(key) ?? { h: 0, v: 0 };
    if (j.s.orientation === 'horizontal') e.h += 1;
    else if (j.s.orientation === 'vertical') e.v += 1;
    m.set(key, e);
  }
  return m;
}

export function summarise(
  title: string,
  judged: readonly Judged[],
  report: { warnings: readonly { code: string; detail: string }[]; coverage: Record<string, number> },
): string {
  const interior = judged.filter((j) => j.interior);
  const tally = perRoomTally(judged);
  const byCode = new Map<string, number>();
  for (const w of report.warnings) byCode.set(w.code, (byCode.get(w.code) ?? 0) + 1);
  return [
    '',
    `  ════ ${title} ════`,
    `  total dimension strings ....... ${judged.length}`,
    `  INTERIOR dimensions ........... ${interior.length}`,
    `  exterior dimensions ........... ${judged.length - interior.length}`,
    `  report.warnings ............... ${report.warnings.length}`,
    `  coverage ...................... ${JSON.stringify(report.coverage)}`,
    `  interior per room ............. ${[...tally.entries()].sort().map(([r, e]) => `${r}(w${e.h}/l${e.v})`).join(' ')}`,
    `  interior values (mm) .......... ${interior.map((j) => j.valueMm).sort((x, y) => x - y).join(', ')}`,
    `  warnings by code .............. ${[...byCode.entries()].sort().map(([c, n]) => `${c}=${n}`).join(' ')}`,
    '',
  ].join(String.fromCharCode(10));
}
