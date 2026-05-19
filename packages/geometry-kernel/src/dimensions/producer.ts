// PRYZM 2 — DimensionProducer (S33 Track C / Phase 2B Supplement §A2).
//
// Spec source:
//   • `docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-SUPPLEMENT-AUTODIM-VIEWTEMPLATE.md` §A2
//
// LAYER PURITY (CI Gate G10)
// ─────────────────────────────────────────────────────────────────────────────
// L4 — pure DTO → DimensionString[] derivation.  ZERO `three`, `@thatopen/*`,
// `web-ifc*`, DOM, or Node-specific imports.  Lint rule
// `pryzm/no-three-in-kernel` enforces this at build time; the bake-worker
// test mandate verifies a Node-load works without polyfills.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Pure function — same input → byte-identical output (tests rely on this).
//   ID generation is delegated to a caller-supplied `idFactory`; the default
//   is monotonic for repeatability of snapshot tests.
// • Produces `DimensionString[]` that parses cleanly via
//   `DimensionStringSchema.parse` (S33 exit criterion).
// • Five auto-dim modes: `per-element`, `room-bounding`, `elevation`,
//   `section`, `rcp` (the 5 modes the supplement §A2 enumerates).
//
// FIELD-NAME NOTES vs SPEC
// ─────────────────────────────────────────────────────────────────────────────
// The supplement spec's example DTO shapes use field names from a
// Phase-2A draft schema (`wall.centerline`, `door.hostWallId` /
// `offsetFromStart`, `room.computedBoundary`).  The shipped schemas use
// the canonical names defined under §WALL-AUDIT-2026-M7 / SPEC-06 §4.1:
//   • Wall.baseLine    : [Vec3, Vec3]  (NOT `centerline`)
//   • Door.wallId      : WallId        (NOT `hostWallId`)
//   • Door.offset      : metres        (NOT `offsetFromStart`)
//   • Room.boundary    : Vec3[]        (NOT `computedBoundary`)
// This producer adapts by pulling only `id` and (optionally) `levelId` —
// the only fields the producer actually reads.  The evaluator (sibling
// file) handles the geometry-bearing field-name adaptation.

import type {
  DimensionString,
  DimensionAutoMode,
  ElementIdRef,
  LevelIdRef,
  ViewIdRef,
} from '@pryzm/schemas/annotation/dimension';

// ── Minimal element shapes the producer needs ──────────────────────────────
//
// The producer reads only `id` and `levelId` (the latter optional on door /
// window since they inherit it from their host wall).  Defining `*Like`
// shapes here keeps the producer decoupled from the full DTO surface so
// future schema additions never break it.

export interface WallLike {
  readonly id: string;
  /** Level the wall belongs to.  Optional so callers can pass minimal stubs. */
  readonly levelId?: string;
}

export interface DoorLike {
  readonly id: string;
  /** Door has no own `levelId` — derived from the host wall in the evaluator. */
  readonly levelId?: string;
}

export interface WindowLike {
  readonly id: string;
  readonly levelId?: string;
}

export interface RoomLike {
  readonly id: string;
  readonly levelId?: string;
}

export interface DimensionElementSnapshot {
  readonly walls?: readonly WallLike[];
  readonly doors?: readonly DoorLike[];
  readonly windows?: readonly WindowLike[];
  readonly rooms?: readonly RoomLike[];
}

// ── Request shape — driven by the per-view DimensionViewSettings ───────────

export interface DimensionRequest {
  readonly mode: DimensionAutoMode;
  readonly viewId: string;
  /** Optional level scope — when present, overrides the per-element levelId. */
  readonly levelId?: string;
  /** Optional offset override (mm).  Defaults vary per mode (see §A2). */
  readonly offsetMm?: number;
}

// ── Default per-mode style — pulled from supplement §A2 ────────────────────

const PER_ELEMENT_DEFAULT_OFFSET_MM = 8;
const PER_ELEMENT_OPENING_OFFSET_MM = 6;
const ROOM_BOUNDING_DEFAULT_OFFSET_MM = 10;
const ELEVATION_WALL_OFFSET_MM = 8;
const ELEVATION_WINDOW_OFFSET_MM = 5;

// Heavy + light witness/dim style — the supplement uses 0.18mm /
// 0.13mm for primary / opening dimensions respectively.
const HEAVY_WITNESS = { offset: 1, extension: 2, weight: 0.18 } as const;
const LIGHT_WITNESS = { offset: 0.5, extension: 1.5, weight: 0.13 } as const;

// ── id factory plumbing ────────────────────────────────────────────────────

/**
 * Default id factory — monotonic counter so snapshot tests are reproducible
 * without seeding ULID's clock.  Callers in production should pass a
 * crypto-grade factory (e.g. `() => 'dim-' + ulid()`).
 */
export function makeMonotonicDimensionIdFactory(): () => string {
  let n = 0;
  return () => `dim-test-${(++n).toString().padStart(6, '0')}`;
}

// ── Public entry point ─────────────────────────────────────────────────────

/**
 * Produces `DimensionString[]` for one view per the requested auto-dim mode.
 * Pure function; same input → identical output when given the same id factory.
 */
export function produceDimensions(
  req: DimensionRequest,
  elements: DimensionElementSnapshot,
  idFactory: () => string = makeMonotonicDimensionIdFactory(),
): DimensionString[] {
  switch (req.mode) {
    case 'per-element':
      return produceElementDimensions(req, elements, idFactory);
    case 'room-bounding':
      return produceRoomDimensions(req, elements.rooms ?? [], idFactory);
    case 'elevation':
      return produceElevationDimensions(req, elements, idFactory);
    case 'section':
      return produceSectionDimensions(req, elements, idFactory);
    case 'rcp':
      return produceRCPDimensions(req, elements, idFactory);
    // 'selection' (or any future mode) — not yet implemented; emit nothing.
    default:
      return [];
  }
}

// ── Per-element mode ───────────────────────────────────────────────────────

function produceElementDimensions(
  req: DimensionRequest,
  elements: DimensionElementSnapshot,
  idFactory: () => string,
): DimensionString[] {
  const dims: DimensionString[] = [];
  const offset = req.offsetMm ?? PER_ELEMENT_DEFAULT_OFFSET_MM;
  const openingOffset = req.offsetMm ?? PER_ELEMENT_OPENING_OFFSET_MM;

  // Walls: overall centerline length (start → end).
  for (const wall of elements.walls ?? []) {
    dims.push({
      id: idFactory() as DimensionString['id'],
      kind: 'linear-element',
      textStyleRef: 'default-dim',
      references: [
        { elementId: wall.id as ElementIdRef, anchor: 'start' },
        { elementId: wall.id as ElementIdRef, anchor: 'end' },
      ],
      orientation: 'aligned',
      offsetMm: offset,
      viewId: req.viewId as ViewIdRef,
      levelId: (req.levelId ?? wall.levelId) as LevelIdRef | undefined,
      override: null,
      witnessLines: { ...HEAVY_WITNESS },
      arrowheads: 'tick',
      isAutoGenerated: true,
      autoMode: 'per-element',
    });
  }

  // Doors: rough opening width.
  for (const door of elements.doors ?? []) {
    dims.push({
      id: idFactory() as DimensionString['id'],
      kind: 'linear-element',
      textStyleRef: 'default-dim',
      references: [
        { elementId: door.id as ElementIdRef, anchor: 'left' },
        { elementId: door.id as ElementIdRef, anchor: 'right' },
      ],
      orientation: 'horizontal',
      offsetMm: openingOffset,
      viewId: req.viewId as ViewIdRef,
      levelId: (req.levelId ?? door.levelId) as LevelIdRef | undefined,
      override: null,
      witnessLines: { ...LIGHT_WITNESS },
      arrowheads: 'tick',
      isAutoGenerated: true,
      autoMode: 'per-element',
    });
  }

  // Windows: rough opening width.
  for (const win of elements.windows ?? []) {
    dims.push({
      id: idFactory() as DimensionString['id'],
      kind: 'linear-element',
      textStyleRef: 'default-dim',
      references: [
        { elementId: win.id as ElementIdRef, anchor: 'left' },
        { elementId: win.id as ElementIdRef, anchor: 'right' },
      ],
      orientation: 'horizontal',
      offsetMm: openingOffset,
      viewId: req.viewId as ViewIdRef,
      levelId: (req.levelId ?? win.levelId) as LevelIdRef | undefined,
      override: null,
      witnessLines: { ...LIGHT_WITNESS },
      arrowheads: 'tick',
      isAutoGenerated: true,
      autoMode: 'per-element',
    });
  }

  return dims;
}

// ── Room-bounding mode ─────────────────────────────────────────────────────

function produceRoomDimensions(
  req: DimensionRequest,
  rooms: readonly RoomLike[],
  idFactory: () => string,
): DimensionString[] {
  const dims: DimensionString[] = [];
  const offset = req.offsetMm ?? ROOM_BOUNDING_DEFAULT_OFFSET_MM;

  for (const room of rooms) {
    if (!room.id) continue;
    // Overall X (horizontal extent of room bbox).
    dims.push({
      id: idFactory() as DimensionString['id'],
      kind: 'linear-element',
      textStyleRef: 'default-dim',
      references: [
        { elementId: room.id as ElementIdRef, anchor: 'left' },
        { elementId: room.id as ElementIdRef, anchor: 'right' },
      ],
      orientation: 'horizontal',
      offsetMm: offset,
      viewId: req.viewId as ViewIdRef,
      levelId: (req.levelId ?? room.levelId) as LevelIdRef | undefined,
      override: null,
      witnessLines: { ...HEAVY_WITNESS },
      arrowheads: 'tick',
      isAutoGenerated: true,
      autoMode: 'room-bounding',
    });
    // Overall Y (vertical extent in plan = world Z extent).
    dims.push({
      id: idFactory() as DimensionString['id'],
      kind: 'linear-element',
      textStyleRef: 'default-dim',
      references: [
        { elementId: room.id as ElementIdRef, anchor: 'bottom' },
        { elementId: room.id as ElementIdRef, anchor: 'top' },
      ],
      orientation: 'vertical',
      offsetMm: offset,
      viewId: req.viewId as ViewIdRef,
      levelId: (req.levelId ?? room.levelId) as LevelIdRef | undefined,
      override: null,
      witnessLines: { ...HEAVY_WITNESS },
      arrowheads: 'tick',
      isAutoGenerated: true,
      autoMode: 'room-bounding',
    });
  }

  return dims;
}

// ── Elevation mode ─────────────────────────────────────────────────────────

function produceElevationDimensions(
  req: DimensionRequest,
  elements: DimensionElementSnapshot,
  idFactory: () => string,
): DimensionString[] {
  const dims: DimensionString[] = [];
  const wallOffset = req.offsetMm ?? ELEVATION_WALL_OFFSET_MM;
  const winOffset = req.offsetMm ?? ELEVATION_WINDOW_OFFSET_MM;

  // Wall heights (bottom → top).
  for (const wall of elements.walls ?? []) {
    dims.push({
      id: idFactory() as DimensionString['id'],
      kind: 'linear-element',
      textStyleRef: 'default-dim',
      references: [
        { elementId: wall.id as ElementIdRef, anchor: 'bottom' },
        { elementId: wall.id as ElementIdRef, anchor: 'top' },
      ],
      orientation: 'vertical',
      offsetMm: wallOffset,
      viewId: req.viewId as ViewIdRef,
      levelId: (req.levelId ?? wall.levelId) as LevelIdRef | undefined,
      override: null,
      witnessLines: { ...HEAVY_WITNESS },
      arrowheads: 'tick',
      isAutoGenerated: true,
      autoMode: 'elevation',
    });
  }

  // Window heights (sill → head, at element-local frame).
  for (const win of elements.windows ?? []) {
    dims.push({
      id: idFactory() as DimensionString['id'],
      kind: 'linear-element',
      textStyleRef: 'default-dim',
      references: [
        { elementId: win.id as ElementIdRef, anchor: 'bottom' },
        { elementId: win.id as ElementIdRef, anchor: 'top' },
      ],
      orientation: 'vertical',
      offsetMm: winOffset,
      viewId: req.viewId as ViewIdRef,
      levelId: (req.levelId ?? win.levelId) as LevelIdRef | undefined,
      override: null,
      witnessLines: { ...LIGHT_WITNESS },
      arrowheads: 'tick',
      isAutoGenerated: true,
      autoMode: 'elevation',
    });
  }

  return dims;
}

// ── Section mode (heights + per-element widths) ────────────────────────────

function produceSectionDimensions(
  req: DimensionRequest,
  elements: DimensionElementSnapshot,
  idFactory: () => string,
): DimensionString[] {
  // Section gets both elevation (height) dims AND per-element (width) dims.
  return [
    ...produceElevationDimensions(req, elements, idFactory),
    ...produceElementDimensions({ ...req, mode: 'per-element' }, elements, idFactory),
  ];
}

// ── RCP (Reflected Ceiling Plan) mode ──────────────────────────────────────

function produceRCPDimensions(
  req: DimensionRequest,
  elements: DimensionElementSnapshot,
  idFactory: () => string,
): DimensionString[] {
  // RCP re-uses room-bounding for plan extents; ceiling-height is a tagged
  // annotation (handled outside DimensionString — see §A2 RCP note).
  return produceRoomDimensions(req, elements.rooms ?? [], idFactory);
}
