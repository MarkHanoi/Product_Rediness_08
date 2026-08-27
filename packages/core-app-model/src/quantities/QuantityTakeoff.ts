/**
 * QuantityTakeoff — the *medición* engine.
 *
 * Layer:     L2 — packages/core-app-model
 * Contract:  C66 §1.1 · C84 EI-11 · C03 (read-model; this module MUTATES NOTHING)
 * ADR:       ADR-0350 §MEDICIONES
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS, AND WHAT THE THING IT REPLACES WAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Before this file, the Data Workbench's AUDIT › **Quantities** tab rendered
 * `scheduleStore.getAll()` — the schedule DEFINITIONS: a name, a type and a
 * comma-joined list of COLUMN IDS. It computed no quantity of any kind, and its
 * only button opened the *Intent Visibility Settings* panel. Measured
 * 2026-08-21, lane DATA1 (L-2000).
 *
 * `ScheduleExtractor` (this package, `../schedules/`) does read the element
 * stores, but it produces PER-ELEMENT ROWS for a schedule view: it never sums,
 * it never carries a unit, and — measured on the same day — the Walls schedule
 * has **no area column at all**, so no wall area, gross or net, existed anywhere
 * in the product. This engine is the aggregation layer that did not exist.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE OPENING DEDUCTION IS COMPUTED BY THE SAME CODE THAT CUT THE HOLE
 * ─────────────────────────────────────────────────────────────────────────────
 * A wall's void area comes from `openingOutline()` in `@pryzm/geometry-wall` —
 * THE one producer of an opening's outline (C86 §10.1 PR-1), the same function
 * `LayeredWallOpeningBuilder` uses to cut the mesh — integrated with
 * `outlineSignedArea()`. So an arched window deducts the ARCH, not its bounding
 * box, and a take-off can never drift from the geometry it claims to measure.
 * That is C84 EI-11 ("what the user sees and what the system exports must be the
 * same code") applied to measurement rather than to export.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ WHAT THIS FILE MAY NEVER DO
 * ─────────────────────────────────────────────────────────────────────────────
 * Emit a line for a family it did not measure. A family that cannot be measured
 * produces a `NOT_MEASURED` coverage row with a reason and NO line — never a row
 * reading `0.00`. An architect signs a *medición*; a zero it did not measure is
 * the worst possible cell to print (the same ruling `ScheduleExtractor` records
 * for §FIX-BOUNDING-WALLS-UNDETERMINED).
 */

import type { WallData, Opening } from '@pryzm/geometry-wall';
import { openingOutline, outlineSignedArea, resolveOpeningProfile } from '@pryzm/geometry-wall';
import { wallSystemTypeStore } from '@pryzm/geometry-wall';
import { resolveRoomFinishes, FINISH_UNDETERMINED } from '../RoomFinishResolver.js';
import { determineBoundingWalls } from '../boundingWallDetermination.js';
import type {
  CoverageRow,
  QuantityUnit,
  SecondaryMeasure,
  TakeoffChapterId,
  TakeoffContribution,
  TakeoffLine,
  TakeoffResult,
  MaterialVolume,
} from './TakeoffTypes.js';

// ── Minimal structural store shapes ───────────────────────────────────────────
// Deliberately structural and narrow rather than `any`: a fake built from a
// header cannot falsify the header, and an `any` seam is a defect factory
// (MEMORY §fake-more-capable-than-real). Each field is exactly what a measurer
// reads and nothing more, so the test doubles are forced to carry real values.

interface Pt { x: number; y?: number; z?: number }

export interface ListStore<T> { getAll(): T[] }

export interface RoomLike {
  id: string;
  levelId?: string;
  /**
   * Read ONLY through determineBoundingWalls(): absent and empty are different
   * answers here (C79 §5.2.0), and the room wall-finish measurer EXCLUDES the
   * room when this is undetermined rather than measuring it gross.
   */
  boundingWallIds?: readonly string[] | null;
  name?: string;
  roomNumber?: string;
  boundary?: { height?: number };
  computed?: { area?: number; perimeter?: number; volume?: number };
}

export interface PolyElementLike {
  id: string;
  levelId?: string;
  polygon?: Pt[];
  boundary?: { polygon?: Pt[] };
  thickness?: number;
  layers?: Array<{ thickness?: number }>;
  computed?: { area?: number };
  materialId?: string;
  finish?: string;
  roofType?: string;
  width?: number;
  depth?: number;
}

export interface LinearElementLike {
  id: string;
  levelId?: string;
  profile?: string;
  width?: number;
  depth?: number;
  height?: number;
  material?: string;
  baseLine?: [Pt, Pt];
  startPoint?: Pt;
  endPoint?: Pt;
  fillType?: string;
  materialId?: string;
}

/**
 * §OPENING-MEASURED-NOT-COUNTED (L-4810) — a DOOR or WINDOW *element* record.
 *
 * ⚠ THIS IS A SECOND RECORD FOR THE SAME THING, AND THAT IS THE MODEL, NOT A BUG.
 * The VOID is on the host wall (`Opening`, C15 §3.1 — the wall cuts the hole);
 * the JOINERY is its own element in `doorStore` / `windowStore`, joined by
 * `Opening.elementId`. The take-off previously read ONLY the void, which is why
 * it could count doors and measure nothing about them: `frameWidth`,
 * `frameThickness`, `fireRating` and `accessibilityType` all live HERE.
 *
 * ⛔ ABSENT IS A REAL ANSWER. A void whose element record cannot be found is
 * measured for everything the VOID knows (count, area, perimeter) and reports the
 * frame-derived measures as unavailable WITH THE REASON — never as zero, and
 * never by assuming a nominal frame width.
 */
export interface OpeningElementLike {
  id: string;
  levelId?: string;
  /** Joins back to `Opening.elementId` on the host wall. */
  wallId?: string;
  width?: number;
  height?: number;
  /** Face width of the frame section, metres. Absent ⇒ leaf/glazing area unknown. */
  frameWidth?: number;
  /** Frame depth through the wall, metres. */
  frameThickness?: number;
  /** e.g. '30min', 'FD30'. Present on `DoorData` and `WindowData` TODAY. */
  fireRating?: string;
  accessibilityType?: string;
  properties?: { mark?: string };
}

/**
 * §STAIR-MEASURED-NOT-COUNTED (L-4811) — the stair fields a *medición* needs.
 * Structurally satisfied by `StairData` from `@pryzm/geometry-stair`; declared
 * narrowly here for the reason every other store shape is.
 */
export interface StairLike {
  id: string;
  levelId?: string;
  shape?: string;
  width?: number;
  riserHeight?: number;
  treadDepth?: number;
  riserCount?: number;
  flights?: Array<{ riserCount?: number; treadDepth?: number }>;
  landings?: Array<{ depth?: number }>;
  properties?: {
    mark?: string;
    material?: string;
    treadMaterial?: string;
    riserMaterial?: string;
    riserVisible?: boolean;
    stringerType?: string;
    stringerThickness?: number;
    nosingDepth?: number;
  };
}

export interface CountedElementLike {
  id: string;
  levelId?: string;
  furnitureType?: string;
  fixtureType?: string;
  type?: string;
  shape?: string;
  width?: number;
  height?: number;
  riserCount?: number;
  treadDepth?: number;
  flights?: Array<{ riserCount?: number }>;
  baseLine?: [Pt, Pt];
  gridXSpacing?: number;
}

export interface WallReadStore {
  getAll(): WallData[];
}

/**
 * One layer of a wall system type, as the take-off reads it. Structurally
 * satisfied by `WallLayer` from `@pryzm/geometry-wall`; declared narrowly here
 * for the same reason every other store shape is (a fake built from the header
 * cannot falsify the header).
 */
export interface WallLayerLike {
  name?: string;
  /** Metres. */
  thickness?: number;
  /** A `MaterialRecord.id`. Absent ⇒ this layer names no material. */
  materialId?: string;
}

/**
 * Every store the engine reads. All optional and all injectable — the default
 * bag reads `window.*` exactly as `ScheduleExtractor` does, but a test supplies
 * real element records instead, which is the only way the opening arithmetic can
 * be falsified in a Node runner.
 */
export interface TakeoffStores {
  walls?:        WallReadStore | null;
  rooms?:        ListStore<RoomLike> | null;
  floors?:       ListStore<PolyElementLike> | null;
  ceilings?:     ListStore<PolyElementLike> | null;
  roofs?:        ListStore<PolyElementLike> | null;
  slabs?:        ListStore<PolyElementLike> | null;
  columns?:      ListStore<LinearElementLike> | null;
  beams?:        ListStore<LinearElementLike> | null;
  handrails?:    ListStore<LinearElementLike> | null;
  stairs?:       ListStore<StairLike> | null;
  /** §OPENING-MEASURED-NOT-COUNTED (L-4810) — the joinery element records. */
  doors?:        ListStore<OpeningElementLike> | null;
  windows?:      ListStore<OpeningElementLike> | null;
  plumbing?:     ListStore<CountedElementLike> | null;
  furniture?:    ListStore<CountedElementLike> | null;
  curtainWalls?: ListStore<CountedElementLike> | null;
  /** Resolves a `systemTypeId` to a human type name for the line description. */
  wallTypeName?: ((systemTypeId: string) => string | undefined) | null;
  /**
   * §MATERIAL-CARBON-FACTS (L-3102) — resolves a `systemTypeId` to its LAYER
   * STACK, so a wall's volume can be split per material instead of being
   * attributed to one. `null`/`undefined` for a type with no stack is a real
   * answer: the wall then contributes NO material breakdown and 6D reports it as
   * NOT MEASURED rather than assuming a monolithic material.
   */
  wallTypeLayers?: ((systemTypeId: string) => readonly WallLayerLike[] | null | undefined) | null;
  /**
   * Room finish resolution + bounding-wall determination. Injected so the room
   * measurers are testable; defaults to this package's real resolvers, which
   * read `window.*` themselves.
   */
  roomFinishes?: ((room: RoomLike) => { floor: string; walls: string; ceiling: string }) | null;
  boundingWalls?: ((room: RoomLike) => readonly string[] | null) | null;
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

/** Shoelace area of a closed XZ ring (or a `{u,v}` ring — see `ringAreaUV`). */
function polygonAreaXZ(pts: readonly Pt[]): number {
  if (!pts || pts.length < 3) return 0;
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const zi = pts[i].z ?? pts[i].y ?? 0;
    const zj = pts[j].z ?? pts[j].y ?? 0;
    a += pts[j].x * zi - pts[i].x * zj;
  }
  return Math.abs(a / 2);
}

function ringAreaUV(ring: readonly { u: number; v: number }[]): number {
  if (!ring || ring.length < 3) return 0;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j].u * ring[i].v - ring[i].u * ring[j].v;
  }
  return Math.abs(a / 2);
}

function dist2D(a: Pt, b: Pt): number {
  const dx = (b.x ?? 0) - (a.x ?? 0);
  const dz = (b.z ?? b.y ?? 0) - (a.z ?? a.y ?? 0);
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Arc length of the wall's baseline. A curved wall stores a quadratic Bézier
 * control point plus a tessellation segment count; sampling at that SAME count
 * makes the measured length equal the length of the polyline the builder
 * extrudes, rather than a chord that is always short.
 */
export function wallBaselineLength(w: Pick<WallData, 'baseLine' | 'curve'>): number {
  const [p0, p1] = w.baseLine;
  const curve = w.curve;
  if (!curve || !curve.control) return dist2D(p0 as Pt, p1 as Pt);
  const n = Math.max(4, Math.min(256, Math.floor(curve.segments) || 16));
  let total = 0;
  let prevX = p0.x;
  let prevZ = p0.z;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    const x = mt * mt * p0.x + 2 * mt * t * curve.control.x + t * t * p1.x;
    const z = mt * mt * p0.z + 2 * mt * t * curve.control.z + t * t * p1.z;
    total += Math.hypot(x - prevX, z - prevZ);
    prevX = x;
    prevZ = z;
  }
  return total;
}

/**
 * The area of ONE opening's void, in the wall's `(u, v)` elevation plane.
 *
 * Delegates to `openingOutline()` — the single outline producer — so an arch or
 * a circle deducts its true area. Returns `null` (NOT zero, NOT the bounding
 * box) when the outline producer refuses the geometry, so the caller can count
 * the refusal into a qualifier instead of silently under-deducting.
 */
export function openingVoidArea(op: Pick<Opening, 'width' | 'height' | 'offset' | 'sillHeight' | 'openingProfile'>): number | null {
  const outline = openingOutline({
    profile:    resolveOpeningProfile(op.openingProfile),
    width:      op.width,
    height:     op.height,
    offset:     op.offset,
    sillHeight: op.sillHeight,
  });
  if (!outline || outline.points.length < 3) return null;
  return Math.abs(outlineSignedArea(outline.points));
}

/**
 * §OPENING-MEASURED-NOT-COUNTED (L-4810) — the PERIMETER of one opening's void,
 * metres, measured on the SAME polygon `openingOutline()` produces.
 *
 * This is the frame / lining run, and it is the measure that makes an arched head
 * cost what an arched head costs: the arc is walked vertex by vertex on the
 * tessellated outline the mesh is actually cut with, so it is longer than
 * `2(w + h)` by exactly as much as the arch is.
 *
 * Returns `null` — NOT zero — when the outline producer refuses the geometry, for
 * the same reason {@link openingVoidArea} does.
 *
 * ⚠ WHAT IT IS NOT: it is the perimeter of the WHOLE void. A door frame usually
 * has three sides — PRYZM does not model whether a threshold piece exists, so the
 * threshold run is INCLUDED and the line says so rather than guessing it away.
 */
export function openingPerimeter(
  op: Pick<Opening, 'width' | 'height' | 'offset' | 'sillHeight' | 'openingProfile'>,
): number | null {
  const outline = openingOutline({
    profile:    resolveOpeningProfile(op.openingProfile),
    width:      op.width,
    height:     op.height,
    offset:     op.offset,
    sillHeight: op.sillHeight,
  });
  if (!outline || outline.points.length < 3) return null;
  const pts = outline.points;
  let total = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    total += Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
  }
  return total;
}

/** {@link openingClearArea}'s result — `area: null` always carries a `reason`. */
export interface OpeningClearAreaResult {
  readonly area: number | null;
  readonly reason: string | null;
}

/**
 * §SCHED156-DOORWIN (L-12605) — the LEAF (door) / GLAZED (window) clear area:
 * the opening's void, LESS a constant-width frame band on all four sides.
 *
 * Extracted from this engine's own door/window measurer (it used to be
 * inline here, and ONLY here) so a per-element schedule column can compute
 * the identical figure for ONE door instead of reading `TakeoffLine.secondary`
 * — a LINE-level SUM across every element sharing that line's code (see
 * `ScheduleCostBridge.ts`'s header for why reading that per-row would print
 * "all doors of this type's leaf area" on every one of them). Same formula,
 * same wording, callable per-element — C84 EI-9: one quantity authority, not
 * a second formula for the schedule to drift against.
 *
 * Exact only where the frame is a constant-width band around a RECTANGULAR
 * void; an arched or circular head would need a polygon offset this engine
 * does not do, so it is REFUSED (`area: null` + a reason) rather than
 * approximated by the bounding box.
 */
export function openingClearArea(
  op: Pick<Opening, 'width' | 'height' | 'openingProfile'>,
  frameWidth: number | null | undefined,
): OpeningClearAreaResult {
  const profile = resolveOpeningProfile(op.openingProfile);
  const rectangular = profile === 'rectangular';
  const fw = frameWidth ?? 0;
  if (!(fw > 0)) {
    return { area: null, reason: 'the joinery record states no frameWidth, so the frame band cannot be deducted' };
  }
  if (!rectangular) {
    return {
      area: null,
      reason: `a ${profile} head cannot be inset by a constant frame width without a polygon offset, which this engine does not do`,
    };
  }
  const cw = op.width - 2 * fw;
  const ch = op.height - 2 * fw;
  const clearArea = cw > 0 && ch > 0 ? cw * ch : 0;
  if (!(clearArea > 0)) {
    return { area: null, reason: 'the stated frameWidth consumes the whole opening — the clear area would be zero or negative' };
  }
  return { area: clearArea, reason: null };
}

// ── Line accumulation ─────────────────────────────────────────────────────────

interface Accum {
  code:        string;
  chapter:     TakeoffChapterId;
  description: string;
  unit:        QuantityUnit;
  /* §TAKEOFF-DESGLOSE (L-4800) — ONE ROW PER ELEMENT, kept rather than summed
     away. The per-element figure was always computed here; the "+=" below used
     to be the only thing that survived it. `quantity` is now DERIVED from these
     rows in build(), so a line total IS the sum of what the reader can see. */
  contributions: TakeoffContribution[];
  /* §MATERIAL-ATTRIBUTION-REASONS (L-4820) — why this code names no material.
     Set by the first contributing element: a code groups the elements one
     measurer produced, so the reason is a property of the measurer. */
  materialGap: string | null;
  basis:       string;
  qualifiers:  Map<string, number>;
  secondary:   Map<string, { label: string; value: number; unit: QuantityUnit }>;
  /* §MATERIAL-CARBON-FACTS (L-3102) — m3 per material id, summed across the
     elements this code groups. Keyed by `materialId|note` so a layered wall's
     insulation and its blockwork stay separate rows. */
  materials:   Map<string, { materialId: string; volumeM3: number; note?: string }>;
}

class LineBuilder {
  private readonly _byCode = new Map<string, Accum>();
  private readonly _measured = new Set<string>();

  add(args: {
    code: string;
    chapter: TakeoffChapterId;
    description: string;
    unit: QuantityUnit;
    quantity: number;
    elementId: string;
    basis: string;
    secondary?: readonly SecondaryMeasure[];
    qualifier?: string | null;
    /* §TAKEOFF-DESGLOSE (L-4800) — the per-element identity a desglose row needs.
       All three are OPTIONAL and all three land as `null`, never a placeholder:
       an element that states no level must READ as stating no level. */
    levelId?: string | null;
    mark?: string | null;
    label?: string | null;
    /* §MATERIAL-CARBON-FACTS — what this ELEMENT contributed, per material.
       Omitted where the measurer genuinely does not know the material; an
       omission is reported by 6D as NOT MEASURED, never as zero. */
    materials?: readonly MaterialVolume[];
    /* §MATERIAL-ATTRIBUTION-REASONS (L-4820) — required in effect whenever
       `materials` is empty; build() refuses to emit a line carrying neither. */
    materialGap?: string | null;
  }): void {
    let acc = this._byCode.get(args.code);
    if (!acc) {
      acc = {
        code: args.code,
        chapter: args.chapter,
        description: args.description,
        unit: args.unit,
        contributions: [],
        materialGap: args.materialGap ?? null,
        basis: args.basis,
        qualifiers: new Map(),
        secondary: new Map(),
        materials: new Map(),
      };
      this._byCode.set(args.code, acc);
    }
    acc.contributions.push({
      elementId: args.elementId,
      quantity: args.quantity,
      levelId: args.levelId ?? null,
      mark: args.mark ?? null,
      label: args.label ?? null,
      note: args.qualifier ?? null,
    });
    if (acc.materialGap === null && args.materialGap) acc.materialGap = args.materialGap;
    this._measured.add(args.elementId);
    for (const s of args.secondary ?? []) {
      const cur = acc.secondary.get(s.label);
      if (cur) cur.value += s.value;
      else acc.secondary.set(s.label, { label: s.label, value: s.value, unit: s.unit });
    }
    if (args.qualifier) {
      acc.qualifiers.set(args.qualifier, (acc.qualifiers.get(args.qualifier) ?? 0) + 1);
    }
    for (const m of args.materials ?? []) {
      if (!m.materialId || !(m.volumeM3 > 0)) continue;
      const key = `${m.materialId}|${m.note ?? ''}`;
      const cur = acc.materials.get(key);
      if (cur) cur.volumeM3 += m.volumeM3;
      else acc.materials.set(key, { materialId: m.materialId, volumeM3: m.volumeM3, note: m.note });
    }
  }

  get measuredElementCount(): number { return this._measured.size; }

  build(): TakeoffLine[] {
    const round = (n: number) => Math.round(n * 1e4) / 1e4;
    return [...this._byCode.values()]
      // §TAKEOFF-DESGLOSE — round the ROWS first and drop the degenerate ones.
      // Doing it here rather than only at the line total is what keeps the
      // printed total equal to the sum of the printed rows.
      .map((a) => ({
        ...a,
        contributions: a.contributions
          .map((c) => ({ ...c, quantity: round(c.quantity) }))
          .filter((c) => c.quantity > 0),
      }))
      // A group whose measured quantity rounds away entirely is degenerate
      // geometry, not a quantity — drop it rather than print `0.00`.
      .filter((a) => a.contributions.length > 0)
      .map((a) => ({
        code:        a.code,
        chapter:     a.chapter,
        description: a.description,
        unit:        a.unit,
        // ⛔ DERIVED FROM THE ROWS, never accumulated beside them.
        quantity:    round(a.contributions.reduce((t, c) => t + c.quantity, 0)),
        elementIds:  a.contributions.map((c) => c.elementId),
        contributions: a.contributions,
        basis:       a.basis,
        qualifiers:  [...a.qualifiers.entries()].map(([q, n]) => `${n} of ${a.contributions.length}: ${q}`),
        secondary:   [...a.secondary.values()].map((s) => ({ ...s, value: round(s.value) })),
        materialBreakdown: [...a.materials.values()]
          .map((m) => ({ ...m, volumeM3: round(m.volumeM3) }))
          // A material whose volume rounds away is degenerate geometry, not a
          // quantity — the same rule the line itself is filtered by above.
          .filter((m) => m.volumeM3 > 0)
          .sort((x, y) => y.volumeM3 - x.volumeM3),
        /* §MATERIAL-ATTRIBUTION-REASONS — the reason survives only while the
           breakdown is genuinely empty. A measurer where SOME elements named a
           material keeps the breakdown and drops the reason: that line IS
           attributed, partially, and CarbonModel already reports the remainder. */
        materialGap: [...a.materials.values()].some((m) => round(m.volumeM3) > 0)
          ? null
          : (a.materialGap
             ?? 'This measurer states no reason for naming no material — §MATERIAL-ATTRIBUTION-REASONS (L-4820) requires one.'),
      }))
      .sort((x, y) => (x.chapter === y.chapter ? x.code.localeCompare(y.code) : x.chapter.localeCompare(y.chapter)));
  }
}

/** Slug a free-text key into a stable, comparable code fragment. */
function slug(v: string | undefined | null, fallback: string): string {
  const s = (v ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return s || fallback;
}

function mm(v: number): string { return `${Math.round(v * 1000)}mm`; }

function polygonOf(e: PolyElementLike): Pt[] {
  return e.boundary?.polygon ?? e.polygon ?? [];
}

function areaOf(e: PolyElementLike): number {
  const stated = e.computed?.area;
  if (typeof stated === 'number' && stated > 0) return stated;
  const poly = polygonOf(e);
  if (poly.length >= 3) return polygonAreaXZ(poly);
  if ((e.width ?? 0) > 0 && (e.depth ?? 0) > 0) return (e.width ?? 0) * (e.depth ?? 0);
  return 0;
}

function thicknessOf(e: PolyElementLike): number {
  const layered = (e.layers ?? []).reduce((s, l) => s + (l.thickness ?? 0), 0);
  return layered > 0 ? layered : (e.thickness ?? 0);
}

// ── The default store bag (reads `window.*`, as ScheduleExtractor does) ────────

type W = Record<string, unknown>;

function fromWindow<T>(name: string): T | null {
  if (typeof window === 'undefined') return null;
  const v = (window as unknown as W)[name];
  return (v ?? null) as T | null;
}

/**
 * The production store bag. Kept separate from `computeTakeoff` so the engine is
 * a pure function of its inputs and the browser coupling lives in exactly one
 * place — which is what makes the unit tests real rather than mirror-shaped.
 */
export function defaultTakeoffStores(): TakeoffStores {
  return {
    walls:        fromWindow<WallReadStore>('wallStore'),
    rooms:        fromWindow<ListStore<RoomLike>>('roomStore'),
    floors:       fromWindow<ListStore<PolyElementLike>>('floorStore'),
    ceilings:     fromWindow<ListStore<PolyElementLike>>('ceilingStore'),
    roofs:        fromWindow<ListStore<PolyElementLike>>('roofStore'),
    slabs:        fromWindow<ListStore<PolyElementLike>>('slabStore'),
    columns:      fromWindow<ListStore<LinearElementLike>>('columnStore'),
    beams:        fromWindow<ListStore<LinearElementLike>>('beamStore'),
    handrails:    fromWindow<ListStore<LinearElementLike>>('handrailStore'),
    stairs:       fromWindow<ListStore<StairLike>>('stairStore'),
    doors:        fromWindow<ListStore<OpeningElementLike>>('doorStore'),
    windows:      fromWindow<ListStore<OpeningElementLike>>('windowStore'),
    plumbing:     fromWindow<ListStore<CountedElementLike>>('plumbingStore'),
    furniture:    fromWindow<ListStore<CountedElementLike>>('furnitureStore'),
    curtainWalls: fromWindow<ListStore<CountedElementLike>>('curtainWallStore'),
    wallTypeName: (id) => wallSystemTypeStore.getById(id)?.name,
    wallTypeLayers: (id) => wallSystemTypeStore.getById(id)?.layers ?? null,
    roomFinishes: (room) => {
      const f = resolveRoomFinishes(room);
      return { floor: f.floor, walls: f.walls, ceiling: f.ceiling };
    },
    boundingWalls: (room) => {
      const d = determineBoundingWalls(room, `takeoff wall-finish area of room ${room.id}`);
      return d.kind === 'determined' ? d.elements : null;
    },
  };
}

// ── The engine ────────────────────────────────────────────────────────────────

/**
 * Compute the full *medición* from the element stores.
 *
 * Pure with respect to the model: it reads, it never writes, and it dispatches
 * no command — so it needs no undo entry and cannot be the cause of one.
 */
export function computeTakeoff(stores: TakeoffStores = defaultTakeoffStores()): TakeoffResult {
  const B = new LineBuilder();
  const coverage: CoverageRow[] = [];
  const unreadable: string[] = [];

  const readList = <T>(store: ListStore<T> | WallReadStore | null | undefined, name: string): T[] | null => {
    if (!store || typeof (store as ListStore<T>).getAll !== 'function') {
      unreadable.push(name);
      return null;
    }
    try {
      const rows = (store as ListStore<T>).getAll();
      return Array.isArray(rows) ? rows : [];
    } catch {
      unreadable.push(name);
      return null;
    }
  };

  // ── WALLS — m² of wall face, NET of openings ────────────────────────────────
  const walls = readList<WallData>(stores.walls, 'wallStore');
  if (walls === null) {
    coverage.push({ family: 'Walls', state: 'NOT_MEASURED', note: 'wallStore was not reachable when the take-off ran.' });
  } else if (walls.length === 0) {
    coverage.push({ family: 'Walls', state: 'MEASURED', note: 'Store read successfully; the project contains no walls.' });
  } else {
    for (const w of walls) {
      const length = wallBaselineLength(w);
      const height = w.height ?? 0;
      if (!(length > 0) || !(height > 0)) continue;

      // Elevation face in the wall's own (u,v) plane. A `wallProfile` is the
      // authored outline and may only CUT the rectangle down, so its polygon
      // area IS the face — never `length × height` on top of it.
      const ring = w.wallProfile?.ring;
      const grossFace = ring && ring.length >= 3 ? ringAreaUV(ring) : length * height;

      let voidArea = 0;
      let refusedVoids = 0;
      for (const op of w.openings ?? []) {
        const a = openingVoidArea(op);
        if (a === null) { refusedVoids++; continue; }
        voidArea += a;
      }
      const net = Math.max(0, grossFace - voidArea);
      const thickness = w.thickness ?? 0;

      const typeId = w.systemTypeId;
      const typeName = (typeId ? stores.wallTypeName?.(typeId) : undefined) ?? w.type ?? 'Wall';
      const code = `WALL.${slug(typeId ?? typeName, 'generic')}.${Math.round(thickness * 1000)}`;

      const rake = w.rakeAngleDeg;
      const qualifier =
        refusedVoids > 0
          ? `opening outline refused for ${refusedVoids} void(s) — those voids are NOT deducted`
          : rake != null && Math.abs(rake - 90) > 1e-6
            ? `raked wall (${rake.toFixed(1)}°) measured in its authored, un-sheared elevation plane`
            : null;

      // MATERIAL-CARBON-FACTS (L-3102) - split the wall's NET volume across the
      // system type's LAYERS. Each layer contributes `net x layerThickness`, using
      // the SAME net face area the m2 line reports, so the opening deduction that
      // `openingOutline()` computed flows straight through into carbon: an arched
      // window removes the arch from the insulation too, not its bounding box.
      //
      // A layer with no `materialId` contributes NOTHING - not a share of some
      // other layer's material, and not a zero. It simply is not measured, and the
      // 6D coverage row says how much volume that cost.
      const layers = typeId ? stores.wallTypeLayers?.(typeId) : null;
      const wallMaterials: MaterialVolume[] = [];
      for (const layer of layers ?? []) {
        const lt = layer.thickness ?? 0;
        if (!layer.materialId || !(lt > 0)) continue;
        wallMaterials.push({
          materialId: layer.materialId,
          volumeM3: net * lt,
          note: `layer: ${layer.name ?? layer.materialId} (${mm(lt)})`,
        });
      }

      B.add({
        code,
        chapter: 'walls',
        description: `${typeName} — ${mm(thickness)}`,
        unit: 'm2',
        quantity: net,
        elementId: w.id,
        levelId: w.levelId ?? null,
        mark: w.properties?.mark ?? null,
        label: typeName,
        materials: wallMaterials,
        materialGap: !typeId
          ? 'This wall names no system type, so there is no layer stack to split its volume across. Assign a wall type.'
          : (layers ?? []).length === 0
            ? `Wall type "${typeName}" declares no layers, so the wall's volume cannot be attributed to any material. Author the type's layer stack.`
            : 'Every layer of this wall type is either zero-thickness or names no materialId. A layer with no material contributes NOTHING — not a share of its neighbour, and not a zero.',
        basis: 'Σ elevation face area (wallProfile ring, else length × height; curved walls measured along the tessellated arc) − Σ opening voids from openingOutline()',
        secondary: [
          { label: 'Gross face',        value: grossFace, unit: 'm2' },
          { label: 'Openings deducted', value: voidArea,  unit: 'm2' },
          { label: 'Net volume',        value: net * thickness, unit: 'm3' },
          { label: 'Baseline length',   value: length,    unit: 'm'  },
        ],
        qualifier,
      });
    }
    coverage.push({
      family: 'Walls',
      state: 'MEASURED',
      note: 'm² of wall face net of openings; the deduction uses openingOutline(), the same producer that cuts the mesh, so arched and circular voids deduct their true area.',
    });

    // ── DOORS / WINDOWS — MEASURED, not merely counted (§L-4810) ──────────────
    //
    // ⭐ WHAT CHANGED, AND WHY THE COVERAGE CARD WAS THE SPECIFICATION.
    // This block used to emit a count and a single "Void area" chip, and the
    // coverage card said, verbatim, that ironmongery, finish, fire rating,
    // glazing spec and reveal treatment were NOT measured. Four of those five
    // are absent from the model and stay NOT MEASURED with their reason. The
    // fifth — FIRE RATING — was NOT absent: `DoorData.fireRating` and
    // `WindowData.fireRating` exist today, and the take-off simply never read
    // the joinery element record, only the wall's void. That is the
    // §authored-but-unwired shape, not a missing capability.
    //
    // The joinery record also carries `frameWidth`, which is what makes a LEAF
    // area and a GLAZED area derivable rather than assumed.
    //
    // ⛔ ONE PRICED UNIT PER LINE (see `SecondaryMeasure`). Everything derived
    // here rides along as a SECONDARY measure on the existing `ud` line rather
    // than becoming a second line for the same element — a door billed once per
    // unit and again per m² of leaf is the exact double-count that rule exists
    // to prevent.
    const doorRows = readList<OpeningElementLike>(stores.doors, 'doorStore');
    const windowRows = readList<OpeningElementLike>(stores.windows, 'windowStore');
    const joinery = new Map<string, OpeningElementLike>();
    for (const d of doorRows ?? []) joinery.set(d.id, d);
    for (const wd of windowRows ?? []) joinery.set(wd.id, wd);

    let doorN = 0, windowN = 0;
    let ratedN = 0, unratedN = 0, noRecordN = 0, noFrameWidthN = 0;
    for (const w of walls) {
      const hostThickness = w.thickness ?? 0;
      for (const op of w.openings ?? []) {
        const isDoor = op.type === 'door';
        const leaves = isDoor ? (op.doorType ?? 'single') : (op.windowType ?? 'single');
        const profile = resolveOpeningProfile(op.openingProfile);
        const sizeKey = `${Math.round(op.width * 1000)}x${Math.round(op.height * 1000)}`;
        const family = isDoor ? 'DOOR' : 'WINDOW';
        const label = isDoor ? 'Door' : 'Window';
        const elementId = op.elementId || op.id;
        const rec = joinery.get(elementId);
        const area = openingVoidArea(op);
        const perim = openingPerimeter(op);

        // FIRE RATING joins the CODE only when the model states one, so every
        // door authored without a rating keeps the code it already had and the
        // rate the user typed against it survives. A blanket `.fd-none` segment
        // would have churned every existing code for no information.
        const fireRating = rec?.fireRating?.trim() || null;
        if (rec) { if (fireRating) ratedN++; else unratedN++; } else { noRecordN++; }

        // LEAF / GLAZED area — §SCHED156-DOORWIN (L-12605): the formula now
        // lives in `openingClearArea()`, ABOVE, so a per-element schedule
        // column can call the exact same function this line does.
        let clearArea: number | null = null;
        let clearReason: string | null = null;
        if (!rec) {
          clearReason = 'no joinery element record found for this void, so the frame width is unknown';
        } else {
          if (!((rec.frameWidth ?? 0) > 0)) noFrameWidthN++;
          const clear = openingClearArea(op, rec.frameWidth);
          clearArea = clear.area;
          clearReason = clear.reason;
        }

        const secondary: SecondaryMeasure[] = [];
        if (area !== null) secondary.push({ label: 'Structural opening area', value: area, unit: 'm2' });
        if (clearArea !== null) {
          secondary.push({ label: isDoor ? 'Leaf area (clear of frame)' : 'Glazed area (clear of frame)', value: clearArea, unit: 'm2' });
        }
        if (perim !== null) {
          secondary.push({ label: 'Frame / lining perimeter', value: perim, unit: 'm' });
          if (hostThickness > 0) {
            secondary.push({ label: 'Reveal area (perimeter × host wall thickness)', value: perim * hostThickness, unit: 'm2' });
          }
        }

        const qualifier = area === null
          ? 'void area unavailable — outline producer refused this geometry'
          : clearReason !== null
            ? `${isDoor ? 'leaf' : 'glazed'} area NOT measured: ${clearReason}`
            : leaves === 'double'
              ? 'double leaf: the meeting stile between the two leaves is NOT deducted — its section is not modelled'
              : null;

        B.add({
          code: `${family}.${slug(leaves, 'single')}.${slug(profile, 'rectangular')}.${sizeKey}${fireRating ? `.${slug(fireRating, 'rated')}` : ''}`,
          chapter: 'openings',
          description: `${label} — ${leaves}, ${profile}, ${mm(op.width)} × ${mm(op.height)}${fireRating ? `, fire rating ${fireRating}` : ''}`,
          unit: 'ud',
          quantity: 1,
          elementId,
          levelId: rec?.levelId ?? w.levelId ?? null,
          mark: rec?.properties?.mark ?? null,
          label: fireRating ? `${label} ${fireRating}` : label,
          basis: 'Count of openings hosted in walls, grouped by leaf count, void profile, nominal size and (where the model states one) fire rating. Areas and the frame perimeter are measured on the SAME outline openingOutline() cuts the mesh with',
          secondary,
          qualifier,
          materialGap: 'A door or window is COUNTED, and its areas are measured — but PRYZM models no leaf thickness and no frame section, so there is no VOLUME to attribute to a material. Carbon needs m³; this family can only ever supply m² until a joinery section is modelled.',
        });
        if (isDoor) doorN++; else windowN++;
      }
    }

    const openingNote = (n: number, kind: 'door' | 'window'): string => {
      const parts = [
        `${n} measured: count, structural opening area and frame/lining perimeter from openingOutline() — the same producer that cuts the mesh — plus reveal area (perimeter × host wall thickness)`,
        kind === 'door'
          ? 'and leaf area clear of the frame where the joinery record states a frameWidth'
          : 'and glazed area clear of the frame where the joinery record states a frameWidth',
      ];
      const gaps: string[] = [];
      if (noRecordN > 0) gaps.push(`${noRecordN} void(s) have NO joinery element record, so nothing frame-derived could be measured for them`);
      if (noFrameWidthN > 0) gaps.push(`${noFrameWidthN} record(s) state no frameWidth`);
      const still = kind === 'door'
        ? 'STILL NOT MEASURED: ironmongery (no hardware set exists on the model), leaf/frame FINISH as a specification, and leaf VOLUME — no leaf thickness is modelled, so no carbon figure can be reached.'
        : 'STILL NOT MEASURED: glazing SPECIFICATION (the window type carries an opacity, not a build-up, U-value or pane count), reveal TREATMENT (plaster, render or lining is not modelled — only the reveal AREA is), and glass VOLUME, so no carbon figure can be reached.';
      return `${parts.join(' ')}. ${gaps.length > 0 ? gaps.join('; ') + '. ' : ''}Fire rating IS measured where the element states one, and it joins the line code so a rated door prices separately (${ratedN} rated, ${unratedN} unrated, of the records that were found). ${still}`;
    };

    coverage.push({
      family: 'Doors',
      state: doorN > 0 ? 'MEASURED' : 'MEASURED',
      note: doorN > 0 ? openingNote(doorN, 'door') : 'Store read successfully; the project contains no doors.',
    });
    coverage.push({
      family: 'Windows',
      state: windowN > 0 ? 'MEASURED' : 'MEASURED',
      note: windowN > 0 ? openingNote(windowN, 'window') : 'Store read successfully; the project contains no windows.',
    });
  }

  // ── Horizontal polygon families ─────────────────────────────────────────────
  const measurePolyFamily = (
    store: ListStore<PolyElementLike> | null | undefined,
    storeName: string,
    familyLabel: string,
    chapter: TakeoffChapterId,
    codePrefix: string,
    unit: 'm2' | 'm3',
    keyOf: (e: PolyElementLike) => string,
    describe: (key: string, e: PolyElementLike) => string,
    basis: string,
    note: string,
    /* MATERIAL-CARBON-FACTS - the element's material id, when it HAS one. A
       family whose grouping key is a FINISH NAME (floors, ceilings) is not the
       same thing as a material id, so this is a separate accessor and returns
       undefined rather than reusing `keyOf`. */
    materialIdOf: (e: PolyElementLike) => string | undefined = (e) => e.materialId,
    /* §MATERIAL-ATTRIBUTION-REASONS (L-4820) — what to SAY when no element in this
       family names a catalogue material. Stated per family because the fixes
       differ: a floor grouped by FINISH NAME needs a finish→material mapping, a
       slab with no materialId needs the element tagged. */
    materialGap = 'No element in this family names a MaterialRecord id, so no volume can be attributed to a material.',
  ): void => {
    const rows = readList<PolyElementLike>(store, storeName);
    if (rows === null) {
      coverage.push({ family: familyLabel, state: 'NOT_MEASURED', note: `${storeName} was not reachable when the take-off ran.` });
      return;
    }
    for (const e of rows) {
      const area = areaOf(e);
      if (!(area > 0)) continue;
      const t = thicknessOf(e);
      const key = keyOf(e);
      const qty = unit === 'm3' ? area * t : area;
      if (!(qty > 0)) continue;
      B.add({
        code: `${codePrefix}.${slug(key, 'unspecified')}${unit === 'm3' ? `.${Math.round(t * 1000)}` : ''}`,
        chapter,
        description: describe(key, e),
        unit,
        quantity: qty,
        elementId: e.id,
        levelId: e.levelId ?? null,
        mark: null,
        label: key,
        materialGap,
        basis,
        secondary: unit === 'm3'
          ? [{ label: 'Plan area', value: area, unit: 'm2' as QuantityUnit }]
          : t > 0 ? [{ label: 'Volume', value: area * t, unit: 'm3' as QuantityUnit }] : [],
        // Volume = plan area x total thickness. A family with NO thickness (a
        // finish applied to a surface) yields no volume, therefore no material
        // row, therefore NOT MEASURED in 6D rather than a zero-volume line.
        materials: (() => {
          const mid = materialIdOf(e);
          const vol = unit === 'm3' ? qty : area * t;
          return mid && vol > 0 ? [{ materialId: mid, volumeM3: vol }] : [];
        })(),
      });
    }
    coverage.push({
      family: familyLabel,
      state: 'MEASURED',
      note: rows.length === 0 ? `Store read successfully; the project contains no ${familyLabel.toLowerCase()}.` : note,
    });
  };

  measurePolyFamily(
    stores.floors, 'floorStore', 'Floors', 'finishes', 'FLOOR', 'm2',
    (e) => e.finish ?? e.materialId ?? 'unspecified finish',
    (k) => `Floor construction — ${k}`,
    'Σ plan area of the floor boundary polygon (or the stored computed area)',
    'm² of plan area, grouped by finish. Skirtings, thresholds and screed falls are NOT measured.',
    (e) => e.materialId,
    'These floors are grouped by FINISH NAME, which is not a MaterialRecord id — the two are different vocabularies (C100 §1.1), and mapping one onto the other by string similarity is exactly the substitution C100 §5 forbids. Tag the floor with a materialId, or author a finish→material mapping.',
  );
  measurePolyFamily(
    stores.ceilings, 'ceilingStore', 'Ceilings', 'finishes', 'CEIL', 'm2',
    (e) => e.finish ?? e.materialId ?? 'unspecified finish',
    (k) => `Ceiling — ${k}`,
    'Σ plan area of the ceiling boundary polygon (or the stored computed area)',
    'm² of plan area, grouped by finish. Bulkheads, coves and access hatches are NOT measured.',
    (e) => e.materialId,
    'These ceilings are grouped by FINISH NAME, which is not a MaterialRecord id. Tag the ceiling with a materialId, or author a finish→material mapping.',
  );
  measurePolyFamily(
    stores.roofs, 'roofStore', 'Roofs', 'roofing', 'ROOF', 'm2',
    (e) => e.roofType ?? e.materialId ?? 'unspecified',
    (k) => `Roof — ${k}`,
    'Σ plan area of the roof polygon. NOTE: this is PLAN area, not the developed slope area',
    'm² of PLAN area, grouped by roof type. A pitched roof\'s true surface is larger than its plan projection; slope development is NOT applied.',
    (e) => e.materialId,
    'These roofs name no materialId, and a ROOF TYPE is not a material. A roof also carries no build-up thickness here, so even a named material would have no volume to multiply.',
  );
  measurePolyFamily(
    stores.slabs, 'slabStore', 'Slabs', 'structure', 'SLAB', 'm3',
    (e) => e.materialId ?? 'unspecified',
    (k, e) => `Slab — ${k}, ${mm(thicknessOf(e))}`,
    'Σ (plan area × thickness)',
    'm³ of concrete, grouped by material and thickness. Reinforcement, formwork and edge trim are NOT measured.',
    (e) => e.materialId,
    'These slabs name no materialId. The VOLUME is measured — it is the attribution that is missing, so tagging the slab is the whole fix.',
  );

  // ── Linear families ─────────────────────────────────────────────────────────
  const linearLength = (e: LinearElementLike): number => {
    if (e.baseLine?.[0] && e.baseLine?.[1]) return dist2D(e.baseLine[0], e.baseLine[1]);
    if (e.startPoint && e.endPoint) {
      const dx = (e.endPoint.x ?? 0) - (e.startPoint.x ?? 0);
      const dy = (e.endPoint.y ?? 0) - (e.startPoint.y ?? 0);
      const dz = (e.endPoint.z ?? 0) - (e.startPoint.z ?? 0);
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return 0;
  };

  const columns = readList<LinearElementLike>(stores.columns, 'columnStore');
  if (columns === null) {
    coverage.push({ family: 'Columns', state: 'NOT_MEASURED', note: 'columnStore was not reachable when the take-off ran.' });
  } else {
    for (const c of columns) {
      const h = c.height ?? 0;
      if (!(h > 0)) continue;
      const key = c.profile ?? `${mm(c.width ?? 0)}x${mm(c.depth ?? 0)}`;
      B.add({
        code: `COL.${slug(key, 'unspecified')}`,
        chapter: 'structure',
        description: `Column — ${key}`,
        unit: 'ud',
        quantity: 1,
        elementId: c.id,
        levelId: c.levelId ?? null,
        mark: null,
        label: key,
        materials: (c.materialId ?? c.material) && (c.width ?? 0) > 0 && (c.depth ?? 0) > 0
          ? [{ materialId: (c.materialId ?? c.material)!, volumeM3: (c.width ?? 0) * (c.depth ?? 0) * h }]
          : [],
        materialGap: !(c.materialId ?? c.material)
          ? 'This column names no material at all. Its gross volume IS measured — only the attribution is missing.'
          : 'This column names a material but no width × depth section, so there is no volume to attribute.',
        basis: 'Count grouped by profile / section. Length and volume ride along as secondary measures',
        secondary: [
          { label: 'Total length', value: h, unit: 'm' },
          ...((c.width ?? 0) > 0 && (c.depth ?? 0) > 0
            ? [{ label: 'Total volume', value: (c.width ?? 0) * (c.depth ?? 0) * h, unit: 'm3' as QuantityUnit }]
            : []),
        ],
      });
    }
    coverage.push({
      family: 'Columns',
      state: columns.length === 0 ? 'MEASURED' : 'COUNTED_ONLY',
      note: columns.length === 0
        ? 'Store read successfully; the project contains no columns.'
        : 'Counted by profile, with total length and gross volume as secondary. Steel MASS (kg) is NOT derived — no density is attached to a column\'s material field.',
    });
  }

  const beams = readList<LinearElementLike>(stores.beams, 'beamStore');
  if (beams === null) {
    coverage.push({ family: 'Beams', state: 'NOT_MEASURED', note: 'beamStore was not reachable when the take-off ran.' });
  } else {
    for (const b of beams) {
      const span = linearLength(b);
      if (!(span > 0)) continue;
      const key = b.profile ?? `${mm(b.width ?? 0)}x${mm(b.depth ?? 0)}`;
      B.add({
        code: `BEAM.${slug(key, 'unspecified')}`,
        chapter: 'structure',
        description: `Beam — ${key}`,
        unit: 'm',
        quantity: span,
        elementId: b.id,
        levelId: b.levelId ?? null,
        mark: null,
        label: key,
        materials: (b.materialId ?? b.material) && (b.width ?? 0) > 0 && (b.depth ?? 0) > 0
          ? [{ materialId: (b.materialId ?? b.material)!, volumeM3: (b.width ?? 0) * (b.depth ?? 0) * span }]
          : [],
        materialGap: !(b.materialId ?? b.material)
          ? 'This beam names no material at all. Its gross volume IS measured — only the attribution is missing.'
          : 'This beam names a material but no width × depth section, so there is no volume to attribute.',
        basis: 'Σ span measured between the beam\'s start and end points',
        secondary: (b.width ?? 0) > 0 && (b.depth ?? 0) > 0
          ? [{ label: 'Gross volume', value: (b.width ?? 0) * (b.depth ?? 0) * span, unit: 'm3' }]
          : [],
      });
    }
    coverage.push({
      family: 'Beams',
      state: beams.length === 0 ? 'MEASURED' : 'MEASURED',
      note: beams.length === 0
        ? 'Store read successfully; the project contains no beams.'
        : 'Linear metres by profile. Steel MASS (kg) is NOT derived — no density is attached to a beam\'s material field.',
    });
  }

  const handrails = readList<LinearElementLike>(stores.handrails, 'handrailStore');
  if (handrails === null) {
    coverage.push({ family: 'Handrails', state: 'NOT_MEASURED', note: 'handrailStore was not reachable when the take-off ran.' });
  } else {
    for (const h of handrails) {
      const len = linearLength(h);
      if (!(len > 0)) continue;
      const key = h.fillType ?? h.materialId ?? 'unspecified';
      B.add({
        code: `RAIL.${slug(key, 'unspecified')}`,
        chapter: 'circulation',
        description: `Handrail / balustrade — ${key}`,
        unit: 'm',
        quantity: len,
        elementId: h.id,
        levelId: h.levelId ?? null,
        mark: null,
        label: key,
        materialGap: 'A handrail is measured in LINEAR METRES and PRYZM models no rail SECTION (no width, no depth, no profile area), so there is no volume any material could be attributed to. Naming the material would not close this — the section would.',
        basis: 'Σ length measured along the handrail baseline in plan',
        secondary: (h.height ?? 0) > 0 ? [{ label: 'Elevation area', value: len * (h.height ?? 0), unit: 'm2' }] : [],
      });
    }
    coverage.push({
      family: 'Handrails',
      state: 'MEASURED',
      note: handrails.length === 0
        ? 'Store read successfully; the project contains no handrails.'
        : 'Linear metres in PLAN. A raking balustrade over a stair flight is longer than its plan projection; rake development is NOT applied.',
    });
  }

  // ── Counted families ────────────────────────────────────────────────────────
  const countFamily = (
    store: ListStore<CountedElementLike> | null | undefined,
    storeName: string,
    familyLabel: string,
    chapter: TakeoffChapterId,
    codePrefix: string,
    keyOf: (e: CountedElementLike) => string,
    describe: (key: string) => string,
    note: string,
    materialGap = 'A counted family carries no dimensioned volume, so there is nothing for a material to be attributed to.',
  ): void => {
    const rows = readList<CountedElementLike>(store, storeName);
    if (rows === null) {
      coverage.push({ family: familyLabel, state: 'NOT_MEASURED', note: `${storeName} was not reachable when the take-off ran.` });
      return;
    }
    for (const e of rows) {
      const key = keyOf(e);
      B.add({
        code: `${codePrefix}.${slug(key, 'unspecified')}`,
        chapter,
        description: describe(key),
        unit: 'ud',
        quantity: 1,
        elementId: e.id,
        levelId: e.levelId ?? null,
        mark: null,
        label: key,
        materialGap,
        basis: 'Count of placed elements, grouped by type',
      });
    }
    coverage.push({
      family: familyLabel,
      state: rows.length === 0 ? 'MEASURED' : 'COUNTED_ONLY',
      note: rows.length === 0 ? `Store read successfully; the project contains no ${familyLabel.toLowerCase()}.` : note,
    });
  };

  // ── STAIRS — MEASURED, not merely counted (§L-4811) ─────────────────────────
  //
  // ⭐ THE COVERAGE CARD WAS THE SPECIFICATION HERE TOO. It said "Counted by
  // shape. Riser/tread quantities, stringers, landings and finishes are NOT
  // measured." Four of those five are in `StairData` today — `riserCount`,
  // `riserHeight`, `treadDepth`, `flights[].riserCount`, `landings[].depth`,
  // `width` and `properties.stringerType` — and the take-off read none of them.
  //
  // ⛔ ONE PRICED UNIT PER LINE. A stair remains one `ud` item; the risers,
  // treads, stringer run and landing area ride along as SECONDARY measures. A
  // stair billed once per unit and again per tread is a double count, and the
  // Spanish convention prices the flight as an item with its peldaños stated.
  //
  // ⚠ TREADS = RISERS − 1, PER FLIGHT. A flight of N risers has N−1 treads: the
  // last riser lands on the floor or the landing above, which is why the landing
  // area is measured separately rather than as another tread.
  const stairs = readList<StairLike>(stores.stairs, 'stairStore');
  if (stairs === null) {
    coverage.push({ family: 'Stairs', state: 'NOT_MEASURED', note: 'stairStore was not reachable when the take-off ran.' });
  } else {
    let openRiserN = 0, noStringerN = 0, windingN = 0;
    for (const st of stairs) {
      const shape = st.shape ?? 'straight';
      const width = st.width ?? 0;
      const riserH = st.riserHeight ?? 0;
      const nominalGoing = st.treadDepth ?? 0;
      const props = st.properties ?? {};

      // FLIGHTS. An absent/empty flight list is a single flight of the stair's
      // own riserCount — that is what the mesh builder falls back to, and a
      // measurer that disagreed with the builder would be measuring a stair the
      // user cannot see.
      const flights = (st.flights ?? []).length > 0
        ? (st.flights ?? []).map((f) => ({ risers: f.riserCount ?? 0, going: f.treadDepth ?? nominalGoing }))
        : [{ risers: st.riserCount ?? 0, going: nominalGoing }];

      let risers = 0, treads = 0, treadArea = 0, planRun = 0, stringerRun = 0;
      const stringerType = props.stringerType ?? 'none';
      const stringersPerFlight = stringerType === 'mono' ? 1 : stringerType === 'none' ? 0 : 2;
      for (const f of flights) {
        const rf = Math.max(0, Math.round(f.risers));
        if (rf <= 0) continue;
        const tf = Math.max(0, rf - 1);
        risers += rf;
        treads += tf;
        treadArea += tf * width * (f.going ?? 0);
        planRun += tf * (f.going ?? 0);
        stringerRun += stringersPerFlight * Math.hypot(rf * riserH, tf * (f.going ?? 0));
      }
      if (risers <= 0) continue;

      const landingArea = (st.landings ?? []).reduce((a, l) => a + Math.max(0, l.depth ?? 0) * width, 0);
      const totalRise = risers * riserH;
      // A riser FACE only exists on a closed-riser stair. `riserVisible: false`
      // is an OPEN-riser stair: there is genuinely no face, and measuring one
      // would invent material that is not there.
      const riserVisible = props.riserVisible !== false;
      if (!riserVisible) openRiserN++;
      if (stringersPerFlight === 0) noStringerN++;
      const winding = shape === 'spiral' || shape === 'winder';
      if (winding) windingN++;

      const secondary: SecondaryMeasure[] = [
        { label: 'Risers', value: risers, unit: 'ud' },
        { label: 'Treads', value: treads, unit: 'ud' },
      ];
      if (totalRise > 0) secondary.push({ label: 'Total rise', value: totalRise, unit: 'm' });
      if (planRun > 0) secondary.push({ label: 'Plan run (going)', value: planRun, unit: 'm' });
      if (treadArea > 0) secondary.push({ label: 'Tread area', value: treadArea, unit: 'm2' });
      if (riserVisible && risers * width * riserH > 0) {
        secondary.push({ label: 'Riser face area', value: risers * width * riserH, unit: 'm2' });
      }
      if (stringerRun > 0) secondary.push({ label: 'Stringer length', value: stringerRun, unit: 'm' });
      if (landingArea > 0) secondary.push({ label: 'Landing area', value: landingArea, unit: 'm2' });

      const qualifier = winding
        ? 'winder / spiral stair: tread area is measured as rectangular treads of the nominal width × going. A winder tread is a WEDGE and its true area differs — this figure is an approximation and is the only approximate number on this line'
        : !riserVisible
          ? 'open-riser stair (riserVisible = false): there is no riser face, so no riser area is measured. That is an absence, not a zero'
          : stringersPerFlight === 0
            ? 'this stair declares stringerType "none", so no stringer length is measured'
            : null;

      B.add({
        code: `STAIR.${slug(shape, 'straight')}.${slug(props.material ?? 'unspecified', 'unspecified')}`,
        chapter: 'circulation',
        description: `Stair — ${shape}${props.material ? `, ${props.material}` : ''}`,
        unit: 'ud',
        quantity: 1,
        elementId: st.id,
        levelId: st.levelId ?? null,
        mark: props.mark ?? null,
        label: `${shape} stair, ${risers} risers`,
        basis: 'Count of stairs grouped by shape and material. Risers are summed per FLIGHT and treads are risers − 1 per flight (the last riser lands on the floor above); tread area = Σ treads × width × going; stringer length = Σ hypot(flight rise, flight going) × stringers implied by stringerType; landing area = Σ landing depth × width',
        secondary,
        qualifier,
        materialGap: props.material
          ? `This stair names its material as "${props.material}", which is a StairMaterial ENUM ('concrete' | 'steel' | 'timber' | 'marble' | 'glass' | 'composite'), NOT a MaterialRecord id. There are seven concrete rows and thirteen timber rows in the master catalogue and the enum does not say which — picking one would be the substitution C100 §5 forbids. A stair→catalogue mapping, or a materialId on the stair, closes this.`
          : 'This stair names no material. It also has no modelled slab or waist thickness, so even a named material would have no VOLUME to attribute.',
      });
    }
    coverage.push({
      family: 'Stairs',
      state: 'MEASURED',
      note: stairs.length === 0
        ? 'Store read successfully; the project contains no stairs.'
        : `Riser and tread COUNTS, total rise, plan run, tread area, riser face area, stringer length and landing area — all derived from the stair's own flights and landings.${openRiserN > 0 ? ` ${openRiserN} stair(s) are OPEN-RISER, so they have no riser face to measure — an absence, not a zero.` : ''}${noStringerN > 0 ? ` ${noStringerN} stair(s) declare stringerType "none".` : ''}${windingN > 0 ? ` ${windingN} winder/spiral stair(s): the tread area is a rectangular approximation of a wedge-shaped tread.` : ''} STILL NOT MEASURED: tread/riser FINISHES as a specification, nosings (a nosing depth is stored but no nosing line is derived), balustrades (measured separately as the Handrails family), soffit finish, and the concrete WAIST or steel section — no structural thickness is modelled, so a stair reaches no volume and therefore no carbon figure.`,
    });
  }

  countFamily(
    stores.plumbing, 'plumbingStore', 'Plumbing fixtures', 'mep', 'PLUMB',
    (e) => e.fixtureType ?? 'unspecified',
    (k) => `Sanitary fixture — ${k}`,
    'Counted by fixture type. Pipework, drainage runs and connections are NOT measured — there is no MEP distribution model.',
    'A sanitary fixture is a catalogue product, not a volume of material. PRYZM models no fixture geometry, so there is nothing to attribute; a fixture-level EPD would be the right shape here, not a material factor.',
  );
  countFamily(
    stores.furniture, 'furnitureStore', 'Furniture', 'furnishings', 'FURN',
    (e) => e.furnitureType ?? e.type ?? 'unspecified',
    (k) => `Furniture — ${k}`,
    'Counted by furniture type. Dimensions, finish and fixing are NOT measured — furniture is placed from a catalogue, and PRYZM stores no per-item bill of materials.',
    'Furniture is placed as a catalogue item with no modelled volume or material stack. A per-product EPD is the right shape for furniture carbon, not a per-m³ material factor.',
  );

  // ── Curtain walls — m² of elevation ─────────────────────────────────────────
  const cws = readList<CountedElementLike>(stores.curtainWalls, 'curtainWallStore');
  if (cws === null) {
    coverage.push({ family: 'Curtain walls', state: 'NOT_MEASURED', note: 'curtainWallStore was not reachable when the take-off ran.' });
  } else {
    for (const cw of cws) {
      const len = cw.baseLine?.[0] && cw.baseLine?.[1] ? dist2D(cw.baseLine[0], cw.baseLine[1]) : 0;
      const h = cw.height ?? 0;
      if (!(len > 0) || !(h > 0)) continue;
      B.add({
        code: 'CWALL.system',
        chapter: 'openings',
        description: 'Curtain wall — glazed system',
        unit: 'm2',
        quantity: len * h,
        elementId: cw.id,
        levelId: cw.levelId ?? null,
        mark: null,
        label: 'Glazed system',
        materialGap: 'A curtain wall is measured as a gross ELEVATION AREA. PRYZM breaks out neither the mullion sections nor the pane build-up, so there is no volume of aluminium and no volume of glass to attribute — the m² is real, the m³ does not exist.',
        basis: 'Σ (baseline length × height) of the curtain-wall elevation',
        secondary: [{ label: 'Elevation length', value: len, unit: 'm' }],
      });
    }
    coverage.push({
      family: 'Curtain walls',
      state: 'MEASURED',
      note: cws.length === 0
        ? 'Store read successfully; the project contains no curtain walls.'
        : 'Gross m² of elevation. Mullion linear metres and per-panel glazing areas are NOT broken out.',
    });
  }

  // ── ROOMS — finishes by resolved finish ─────────────────────────────────────
  const rooms = readList<RoomLike>(stores.rooms, 'roomStore');
  if (rooms === null) {
    coverage.push({ family: 'Room finishes', state: 'NOT_MEASURED', note: 'roomStore was not reachable when the take-off ran.' });
  } else {
    let wallFinishSkipped = 0;
    for (const r of rooms) {
      const area = r.computed?.area ?? 0;
      const perimeter = r.computed?.perimeter ?? 0;
      const height = r.boundary?.height ?? 0;
      const f = stores.roomFinishes?.(r);

      if (area > 0) {
        const floorKey = f?.floor && f.floor !== FINISH_UNDETERMINED ? f.floor : 'unspecified';
        B.add({
          code: `FIN.FLOOR.${slug(floorKey, 'unspecified')}`,
          chapter: 'finishes',
          description: `Floor finish — ${floorKey}`,
          unit: 'm2',
          quantity: area,
          elementId: r.id,
          levelId: r.levelId ?? null,
          mark: r.roomNumber ?? null,
          label: r.name ?? null,
          materialGap: 'A room FINISH is a name, not a MaterialRecord id, and a finish has no modelled thickness — so there is neither a material nor a volume here. A finish→material mapping plus a coat thickness would be needed, and inventing either would put a fabricated m³ into a carbon submission.',
          basis: 'Σ room net floor area, grouped by the resolved floor finish',
          qualifier: f?.floor === FINISH_UNDETERMINED ? 'floor finish could not be resolved for this room' : null,
        });
        const ceilKey = f?.ceiling && f.ceiling !== FINISH_UNDETERMINED ? f.ceiling : 'unspecified';
        B.add({
          code: `FIN.CEIL.${slug(ceilKey, 'unspecified')}`,
          chapter: 'finishes',
          description: `Ceiling finish — ${ceilKey}`,
          unit: 'm2',
          quantity: area,
          elementId: r.id,
          levelId: r.levelId ?? null,
          mark: r.roomNumber ?? null,
          label: r.name ?? null,
          materialGap: 'A room FINISH is a name, not a MaterialRecord id, and a finish has no modelled thickness. See the floor-finish line for the full reason.',
          basis: 'Σ room net floor area taken as the ceiling area, grouped by the resolved ceiling finish',
          qualifier: f?.ceiling === FINISH_UNDETERMINED ? 'ceiling finish could not be resolved for this room' : null,
        });
      }

      // Painted / rendered wall area: perimeter × height, LESS the openings in
      // this room's bounding walls. When the bounding walls are UNDETERMINED the
      // room is EXCLUDED — not measured gross — because a gross wall-finish area
      // is a wrong measurement, not an approximate one.
      if (perimeter > 0 && height > 0) {
        const bounding = stores.boundingWalls?.(r) ?? null;
        if (bounding === null) { wallFinishSkipped++; continue; }
        let voids = 0;
        if (walls && bounding.length > 0) {
          const ids = new Set(bounding);
          for (const w of walls) {
            if (!ids.has(w.id)) continue;
            for (const op of w.openings ?? []) {
              const a = openingVoidArea(op);
              if (a !== null) voids += a;
            }
          }
        }
        const wallKey = f?.walls && f.walls !== FINISH_UNDETERMINED ? f.walls : 'unspecified';
        const net = Math.max(0, perimeter * height - voids);
        B.add({
          code: `FIN.WALL.${slug(wallKey, 'unspecified')}`,
          chapter: 'finishes',
          description: `Wall finish — ${wallKey}`,
          unit: 'm2',
          quantity: net,
          elementId: r.id,
          levelId: r.levelId ?? null,
          mark: r.roomNumber ?? null,
          label: r.name ?? null,
          materialGap: 'A room FINISH is a name, not a MaterialRecord id, and a finish has no modelled thickness. See the floor-finish line for the full reason.',
          basis: 'Σ (room perimeter × room height) − Σ voids of the openings in that room\'s bounding walls',
          secondary: [{ label: 'Openings deducted', value: voids, unit: 'm2' }],
          qualifier: f?.walls === FINISH_UNDETERMINED ? 'wall finish could not be resolved for this room' : null,
        });
      }
    }
    coverage.push({
      family: 'Room finishes',
      state: 'MEASURED',
      note: rooms.length === 0
        ? 'Store read successfully; the project contains no rooms.'
        : `Floor, ceiling and wall finish areas by resolved finish.${wallFinishSkipped > 0 ? ` ${wallFinishSkipped} room(s) EXCLUDED from the wall-finish line: their bounding walls are undetermined, and a gross wall area would be a wrong number rather than an approximate one.` : ''}`,
    });
  }

  // ── Families this engine knows it does NOT measure ──────────────────────────
  // Stated, never implied. Each of these is a real trade an architect expects in
  // a *medición*; naming them is the difference between an incomplete take-off
  // and one that looks complete.
  coverage.push(
    { family: 'Excavation & earthworks', state: 'NOT_MEASURED', note: 'No terrain-cut model exists — cut/fill volumes cannot be derived from the current site representation.' },
    { family: 'Foundations',             state: 'NOT_MEASURED', note: 'There is no foundation element family in the model.' },
    { family: 'Structural steel mass',   state: 'NOT_MEASURED', note: 'Columns and beams carry a free-text `material` field with no density, so kg cannot be derived. Requires a material→density table.' },
    { family: 'Reinforcement',           state: 'NOT_MEASURED', note: 'No rebar is modelled; concrete lines carry volume only.' },
    { family: 'Insulation & membranes',  state: 'NOT_MEASURED', note: 'Wall/floor system-type LAYERS are modelled but are not yet broken out into per-layer m² lines. This is the single largest buildable gap — see ADR-0350 §4.' },
    { family: 'Painting & decoration',   state: 'NOT_MEASURED', note: 'Partially covered by the room wall-finish line; a true paint take-off needs coat counts and a per-surface preparation spec.' },
    { family: 'Electrical & HVAC',       state: 'NOT_MEASURED', note: 'No electrical or HVAC distribution model exists in PRYZM.' },
    { family: 'Preliminaries & margin',  state: 'NOT_MEASURED', note: 'Site set-up, plant, overheads and profit are estimating inputs, not model quantities.' },
  );

  return {
    generatedAt: Date.now(),
    lines: B.build(),
    coverage,
    unreadableStores: [...new Set(unreadable)],
    measuredElementCount: B.measuredElementCount,
  };
}
