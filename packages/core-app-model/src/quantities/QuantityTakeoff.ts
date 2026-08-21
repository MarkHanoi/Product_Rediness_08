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
  stairs?:       ListStore<CountedElementLike> | null;
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

// ── Line accumulation ─────────────────────────────────────────────────────────

interface Accum {
  code:        string;
  chapter:     TakeoffChapterId;
  description: string;
  unit:        QuantityUnit;
  quantity:    number;
  elementIds:  string[];
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
    /* §MATERIAL-CARBON-FACTS — what this ELEMENT contributed, per material.
       Omitted where the measurer genuinely does not know the material; an
       omission is reported by 6D as NOT MEASURED, never as zero. */
    materials?: readonly MaterialVolume[];
  }): void {
    let acc = this._byCode.get(args.code);
    if (!acc) {
      acc = {
        code: args.code,
        chapter: args.chapter,
        description: args.description,
        unit: args.unit,
        quantity: 0,
        elementIds: [],
        basis: args.basis,
        qualifiers: new Map(),
        secondary: new Map(),
        materials: new Map(),
      };
      this._byCode.set(args.code, acc);
    }
    acc.quantity += args.quantity;
    acc.elementIds.push(args.elementId);
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
      // A group whose measured quantity rounds away entirely is degenerate
      // geometry, not a quantity — drop it rather than print `0.00`.
      .filter((a) => round(a.quantity) > 0)
      .map((a) => ({
        code:        a.code,
        chapter:     a.chapter,
        description: a.description,
        unit:        a.unit,
        quantity:    round(a.quantity),
        elementIds:  [...a.elementIds],
        basis:       a.basis,
        qualifiers:  [...a.qualifiers.entries()].map(([q, n]) => `${n} of ${a.elementIds.length}: ${q}`),
        secondary:   [...a.secondary.values()].map((s) => ({ ...s, value: round(s.value) })),
        materialBreakdown: [...a.materials.values()]
          .map((m) => ({ ...m, volumeM3: round(m.volumeM3) }))
          // A material whose volume rounds away is degenerate geometry, not a
          // quantity — the same rule the line itself is filtered by above.
          .filter((m) => m.volumeM3 > 0)
          .sort((x, y) => y.volumeM3 - x.volumeM3),
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
    stairs:       fromWindow<ListStore<CountedElementLike>>('stairStore'),
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
        materials: wallMaterials,
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

    // ── DOORS / WINDOWS — counted, from the host walls' openings ──────────────
    let doorN = 0, windowN = 0;
    for (const w of walls) {
      for (const op of w.openings ?? []) {
        const isDoor = op.type === 'door';
        const leaves = isDoor ? (op.doorType ?? 'single') : (op.windowType ?? 'single');
        const profile = resolveOpeningProfile(op.openingProfile);
        const sizeKey = `${Math.round(op.width * 1000)}x${Math.round(op.height * 1000)}`;
        const family = isDoor ? 'DOOR' : 'WINDOW';
        const label = isDoor ? 'Door' : 'Window';
        const area = openingVoidArea(op);
        B.add({
          code: `${family}.${slug(leaves, 'single')}.${slug(profile, 'rectangular')}.${sizeKey}`,
          chapter: 'openings',
          description: `${label} — ${leaves}, ${profile}, ${mm(op.width)} × ${mm(op.height)}`,
          unit: 'ud',
          quantity: 1,
          elementId: op.elementId || op.id,
          basis: 'Count of openings hosted in walls, grouped by leaf count, void profile and nominal size',
          secondary: area === null ? [] : [{ label: 'Void area', value: area, unit: 'm2' }],
          qualifier: area === null ? 'void area unavailable — outline producer refused this geometry' : null,
        });
        if (isDoor) doorN++; else windowN++;
      }
    }
    coverage.push({
      family: 'Doors',
      state: doorN > 0 ? 'COUNTED_ONLY' : 'MEASURED',
      note: doorN > 0
        ? `${doorN} counted by leaf count, profile and size. Ironmongery, finish and fire rating are NOT measured.`
        : 'Store read successfully; the project contains no doors.',
    });
    coverage.push({
      family: 'Windows',
      state: windowN > 0 ? 'COUNTED_ONLY' : 'MEASURED',
      note: windowN > 0
        ? `${windowN} counted by leaf count, profile and size. Glazing spec and reveal treatment are NOT measured.`
        : 'Store read successfully; the project contains no windows.',
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
  );
  measurePolyFamily(
    stores.ceilings, 'ceilingStore', 'Ceilings', 'finishes', 'CEIL', 'm2',
    (e) => e.finish ?? e.materialId ?? 'unspecified finish',
    (k) => `Ceiling — ${k}`,
    'Σ plan area of the ceiling boundary polygon (or the stored computed area)',
    'm² of plan area, grouped by finish. Bulkheads, coves and access hatches are NOT measured.',
  );
  measurePolyFamily(
    stores.roofs, 'roofStore', 'Roofs', 'roofing', 'ROOF', 'm2',
    (e) => e.roofType ?? e.materialId ?? 'unspecified',
    (k) => `Roof — ${k}`,
    'Σ plan area of the roof polygon. NOTE: this is PLAN area, not the developed slope area',
    'm² of PLAN area, grouped by roof type. A pitched roof\'s true surface is larger than its plan projection; slope development is NOT applied.',
  );
  measurePolyFamily(
    stores.slabs, 'slabStore', 'Slabs', 'structure', 'SLAB', 'm3',
    (e) => e.materialId ?? 'unspecified',
    (k, e) => `Slab — ${k}, ${mm(thicknessOf(e))}`,
    'Σ (plan area × thickness)',
    'm³ of concrete, grouped by material and thickness. Reinforcement, formwork and edge trim are NOT measured.',
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
        materials: (c.materialId ?? c.material) && (c.width ?? 0) > 0 && (c.depth ?? 0) > 0
          ? [{ materialId: (c.materialId ?? c.material)!, volumeM3: (c.width ?? 0) * (c.depth ?? 0) * h }]
          : [],
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
        materials: (b.materialId ?? b.material) && (b.width ?? 0) > 0 && (b.depth ?? 0) > 0
          ? [{ materialId: (b.materialId ?? b.material)!, volumeM3: (b.width ?? 0) * (b.depth ?? 0) * span }]
          : [],
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
        basis: 'Count of placed elements, grouped by type',
      });
    }
    coverage.push({
      family: familyLabel,
      state: rows.length === 0 ? 'MEASURED' : 'COUNTED_ONLY',
      note: rows.length === 0 ? `Store read successfully; the project contains no ${familyLabel.toLowerCase()}.` : note,
    });
  };

  countFamily(
    stores.stairs, 'stairStore', 'Stairs', 'circulation', 'STAIR',
    (e) => e.shape ?? 'straight',
    (k) => `Stair — ${k}`,
    'Counted by shape. Riser/tread quantities, stringers, landings and finishes are NOT measured.',
  );
  countFamily(
    stores.plumbing, 'plumbingStore', 'Plumbing fixtures', 'mep', 'PLUMB',
    (e) => e.fixtureType ?? 'unspecified',
    (k) => `Sanitary fixture — ${k}`,
    'Counted by fixture type. Pipework, drainage runs and connections are NOT measured — there is no MEP distribution model.',
  );
  countFamily(
    stores.furniture, 'furnitureStore', 'Furniture', 'furnishings', 'FURN',
    (e) => e.furnitureType ?? e.type ?? 'unspecified',
    (k) => `Furniture — ${k}`,
    'Counted by furniture type.',
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
