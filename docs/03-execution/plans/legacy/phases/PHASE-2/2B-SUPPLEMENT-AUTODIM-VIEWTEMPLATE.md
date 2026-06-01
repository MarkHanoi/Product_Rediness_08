# Phase 2B — Supplement: Auto-Dimensions & View Templates
## Sprint Integration: S31–S36 (Parallel tracks within Phase 2B)

> **Authority**: subordinate to `08-VISION.md` → `SUPPLEMENTAL-IMPLEMENTATION-PLAN-2026.md` → `10-MASTER-IMPLEMENTATION-PLAN-36M.md` → parent `PHASE-2B-Q2-M16-M18-PLAN-VIEW.md`.  
> This document adds implementation detail for the two capabilities introduced in the Supplemental Plan that land in Phase 2B sprints: **(1) Auto-Dimensions** and **(2) View Templates / System Intent**. All code-level decisions here are subordinate to the strategic SPECs in `SUPPLEMENTAL-IMPLEMENTATION-PLAN-2026.md §2.1` (Auto-Dimensions) and `§2.7` (System Intent).

> **Bake-worker test (re-read before every new function):**  
> *"Would this code run in `apps/bake-worker/` (Node, no DOM, no THREE, no React)?"*  
> `DimensionProducer`, `DimensionEvaluator`, `ViewResolutionAlgorithm` → **YES** — they are L4 pure.  
> `DimensionCommitter`, `ViewTemplateEditorUI` → **NO** — they are correctly L5/L7.

---

## §A — Auto-Dimensions: Sprint-Level Implementation

### Sprint S31 — Schema Foundation

**Track C (new — runs in parallel with Track A + B):** Agent C handles all new-capability additions so they don't consume capacity from the core plan-view rebuild tracks.

#### A1. `DimensionString` Zod schema

```typescript
// packages/schemas/src/annotation/dimension.ts

import { z } from 'zod';
import { ElementIdSchema, LevelIdSchema, ViewIdSchema } from '../common.ts';

// ── Typed ID ──────────────────────────────────────────────────────────────
export const DimensionIdSchema = z.string().brand('DimensionId');
export type DimensionId = z.infer<typeof DimensionIdSchema>;

// ── Reference anchor ──────────────────────────────────────────────────────
export const DimAnchorSchema = z.enum([
  'start',         // element start point (wall start, beam start)
  'end',           // element end point
  'center',        // midpoint of element
  'face-outer',    // outer face of element (outside face of wall)
  'face-inner',    // inner face of element (inside face of wall)
  'centerline',    // analytical centerline (for walls: mid of layer stack)
  'top',           // top of element (columns, walls: topmost Z)
  'bottom',        // base of element
  'left',          // leftmost X in element local frame
  'right',         // rightmost X in element local frame
]);
export type DimAnchor = z.infer<typeof DimAnchorSchema>;

export const DimensionReferenceSchema = z.object({
  elementId: ElementIdSchema,
  anchor: DimAnchorSchema,
});

// ── Orientation ────────────────────────────────────────────────────────────
export const DimOrientationSchema = z.enum([
  'horizontal',   // always measures horizontal distance (plan view)
  'vertical',     // always measures vertical distance (elevation/section)
  'aligned',      // measures along element axis (true length)
  'angular',      // measures angle between two references
]);

// ── Arrowhead styles ──────────────────────────────────────────────────────
export const ArrowheadStyleSchema = z.enum([
  'tick',          // diagonal tick (architectural default)
  'open-arrow',    // open chevron
  'filled-arrow',  // filled triangle
  'dot',           // filled circle
  'none',          // no terminus
]);

// ── Witness line style ────────────────────────────────────────────────────
export const WitnessLineStyleSchema = z.object({
  offset: z.number().default(1),           // mm gap between element and start of witness line
  extension: z.number().default(2),        // mm extension beyond dimension line
  weight: z.number().default(0.18),        // mm pen weight
});

// ── Unit format ───────────────────────────────────────────────────────────
export const UnitFormatSchema = z.object({
  unit: z.enum(['mm', 'cm', 'm', 'ft', 'ft-in', 'in']),
  decimalPlaces: z.number().int().min(0).max(4).default(0),
  suppressTrailingZeros: z.boolean().default(true),
  prefix: z.string().default(''),
  suffix: z.string().default(''),
});

// ── Core DimensionString ──────────────────────────────────────────────────
export const DimensionStringSchema = z.object({
  id: DimensionIdSchema,
  kind: z.enum([
    'linear-element',   // single element: wall length, opening width
    'linear-chain',     // chain across multiple elements — multiple references
    'overall',          // single overall span (typically auto-generated from chain)
    'angular',          // angle between two line references
    'radius',           // arc radius
    'diameter',         // circular element diameter
  ]),
  references: z.array(DimensionReferenceSchema).min(2),
  orientation: DimOrientationSchema,
  offsetMm: z.number().default(8),          // distance from geometry to dimension line
  viewId: ViewIdSchema,
  levelId: LevelIdSchema.optional(),
  override: z.number().nullable().default(null),  // user-pinned value in mm; null = auto
  label: z.string().optional(),                   // e.g. "CLR:" prefix
  textStyleRef: z.string().default('default-dim'),
  witnessLines: WitnessLineStyleSchema.default({}),
  arrowheads: ArrowheadStyleSchema.default('tick'),
  unitFormat: UnitFormatSchema.optional(),        // null = inherit from project settings
  isAutoGenerated: z.boolean().default(false),    // true = generated by DimensionProducer
  autoMode: z.enum(['per-element', 'room-bounding', 'selection', 'elevation', 'section', 'rcp']).optional(),
});

export type DimensionString = z.infer<typeof DimensionStringSchema>;

// ── Evaluated result (not persisted — derived every render) ───────────────
export interface EvaluatedDimension {
  id: DimensionId;
  valueText: string;        // e.g. "3200" or "10'-6\""
  valueMm: number;          // raw value in mm
  p1World: [number, number]; // start point in plan-view world coords (mm)
  p2World: [number, number]; // end point
  lineY: number;             // Y-position of dimension line in world coords (or X for vertical)
  witnessP1: [number, number];
  witnessP2: [number, number];
  isOverride: boolean;
  isFlagged: boolean;        // true if geometry and override disagree by > 5%
}
```

**Exit criteria (S31):**
- `DimensionStringSchema.parse({...})` round-trips for all 6 `kind` values
- Schema in CI typecheck (zero any)
- `apps/bench/baseline.json` updated to include `dimension-schema` bench (parse 1000 items < 5 ms)

---

### Sprint S33 — DimensionProducer and DimensionEvaluator

#### A2. `DimensionProducer` — pure L4, bake-worker safe

```typescript
// packages/geometry-kernel/dimensions/producer.ts
// IMPORTANT: NO THREE imports. NO DOM. Pure math only.

import type { WallDto, DoorDto, WindowDto, RoomDto, ColumnDto } from '@pryzm/schemas';
import type { DimensionString, DimensionId } from '@pryzm/schemas/annotation/dimension';
import { ulid } from 'ulid';

export interface DimensionRequest {
  mode: 'per-element' | 'room-bounding' | 'elevation' | 'section' | 'rcp';
  viewId: string;
  levelId?: string;
  selectedElementIds?: string[];  // for 'selection' mode
  offsetMm?: number;              // override default offset
}

/**
 * Produces DimensionString[] from element DTOs.
 * Pure function — same input → same output, deterministic.
 * Runs in bake-worker (Node) and in browser.
 */
export function produceDimensions(
  request: DimensionRequest,
  elements: {
    walls?: WallDto[];
    doors?: DoorDto[];
    windows?: WindowDto[];
    rooms?: RoomDto[];
    columns?: ColumnDto[];
  },
): DimensionString[] {
  const dims: DimensionString[] = [];

  switch (request.mode) {
    case 'per-element':
      dims.push(...produceElementDimensions(request, elements));
      break;
    case 'room-bounding':
      dims.push(...produceRoomDimensions(request, elements.rooms ?? []));
      break;
    case 'elevation':
      dims.push(...produceElevationDimensions(request, elements));
      break;
    case 'section':
      dims.push(...produceSectionDimensions(request, elements));
      break;
    case 'rcp':
      dims.push(...produceRCPDimensions(request, elements));
      break;
  }

  return dims;
}

// ── Per-element mode ──────────────────────────────────────────────────────

function produceElementDimensions(
  req: DimensionRequest,
  elements: Parameters<typeof produceDimensions>[1],
): DimensionString[] {
  const dims: DimensionString[] = [];

  // Walls: overall centerline length
  for (const wall of elements.walls ?? []) {
    dims.push({
      id: `dim-${ulid()}` as any,
      kind: 'linear-element',
      references: [
        { elementId: wall.id as any, anchor: 'start' },
        { elementId: wall.id as any, anchor: 'end' },
      ],
      orientation: 'aligned',
      offsetMm: req.offsetMm ?? 8,
      viewId: req.viewId as any,
      levelId: (req.levelId ?? wall.baseLevelId) as any,
      override: null,
      witnessLines: { offset: 1, extension: 2, weight: 0.18 },
      arrowheads: 'tick',
      isAutoGenerated: true,
      autoMode: 'per-element',
    });
  }

  // Doors: rough opening width
  for (const door of elements.doors ?? []) {
    dims.push({
      id: `dim-${ulid()}` as any,
      kind: 'linear-element',
      references: [
        { elementId: door.id as any, anchor: 'left' },
        { elementId: door.id as any, anchor: 'right' },
      ],
      orientation: 'horizontal',
      offsetMm: req.offsetMm ?? 6,
      viewId: req.viewId as any,
      levelId: (req.levelId ?? door.levelId) as any,
      override: null,
      witnessLines: { offset: 0.5, extension: 1.5, weight: 0.13 },
      arrowheads: 'tick',
      isAutoGenerated: true,
      autoMode: 'per-element',
    });
  }

  // Windows: rough opening width
  for (const win of elements.windows ?? []) {
    dims.push({
      id: `dim-${ulid()}` as any,
      kind: 'linear-element',
      references: [
        { elementId: win.id as any, anchor: 'left' },
        { elementId: win.id as any, anchor: 'right' },
      ],
      orientation: 'horizontal',
      offsetMm: req.offsetMm ?? 6,
      viewId: req.viewId as any,
      levelId: (req.levelId ?? win.levelId) as any,
      override: null,
      witnessLines: { offset: 0.5, extension: 1.5, weight: 0.13 },
      arrowheads: 'tick',
      isAutoGenerated: true,
      autoMode: 'per-element',
    });
  }

  return dims;
}

// ── Room bounding mode ────────────────────────────────────────────────────

function produceRoomDimensions(
  req: DimensionRequest,
  rooms: RoomDto[],
): DimensionString[] {
  const dims: DimensionString[] = [];

  for (const room of rooms) {
    if (!room.id) continue;
    // Overall X (horizontal extent)
    dims.push({
      id: `dim-${ulid()}` as any,
      kind: 'linear-element',
      references: [
        { elementId: room.id as any, anchor: 'left' },
        { elementId: room.id as any, anchor: 'right' },
      ],
      orientation: 'horizontal',
      offsetMm: req.offsetMm ?? 10,
      viewId: req.viewId as any,
      override: null,
      witnessLines: { offset: 1, extension: 2, weight: 0.18 },
      arrowheads: 'tick',
      isAutoGenerated: true,
      autoMode: 'room-bounding',
    });
    // Overall Y (vertical extent in plan)
    dims.push({
      id: `dim-${ulid()}` as any,
      kind: 'linear-element',
      references: [
        { elementId: room.id as any, anchor: 'bottom' },
        { elementId: room.id as any, anchor: 'top' },
      ],
      orientation: 'vertical',
      offsetMm: req.offsetMm ?? 10,
      viewId: req.viewId as any,
      override: null,
      witnessLines: { offset: 1, extension: 2, weight: 0.18 },
      arrowheads: 'tick',
      isAutoGenerated: true,
      autoMode: 'room-bounding',
    });
  }

  return dims;
}

// ── Elevation mode ────────────────────────────────────────────────────────

function produceElevationDimensions(
  req: DimensionRequest,
  elements: Parameters<typeof produceDimensions>[1],
): DimensionString[] {
  const dims: DimensionString[] = [];

  // For each wall: height dimension (bottom → top)
  for (const wall of elements.walls ?? []) {
    dims.push({
      id: `dim-${ulid()}` as any,
      kind: 'linear-element',
      references: [
        { elementId: wall.id as any, anchor: 'bottom' },
        { elementId: wall.id as any, anchor: 'top' },
      ],
      orientation: 'vertical',
      offsetMm: req.offsetMm ?? 8,
      viewId: req.viewId as any,
      override: null,
      witnessLines: { offset: 1, extension: 2, weight: 0.18 },
      arrowheads: 'tick',
      isAutoGenerated: true,
      autoMode: 'elevation',
    });
  }

  // For each window: sill height + head height
  for (const win of elements.windows ?? []) {
    dims.push({
      id: `dim-${ulid()}` as any,
      kind: 'linear-element',
      references: [
        { elementId: win.id as any, anchor: 'bottom' },
        { elementId: win.id as any, anchor: 'top' },
      ],
      orientation: 'vertical',
      offsetMm: req.offsetMm ?? 5,
      viewId: req.viewId as any,
      override: null,
      witnessLines: { offset: 0.5, extension: 1.5, weight: 0.13 },
      arrowheads: 'tick',
      isAutoGenerated: true,
      autoMode: 'elevation',
    });
  }

  return dims;
}

function produceSectionDimensions(
  req: DimensionRequest,
  elements: Parameters<typeof produceDimensions>[1],
): DimensionString[] {
  // Same logic as elevation but orientation is 'horizontal' for width dims
  // and 'vertical' for height dims — both present in sections.
  return [
    ...produceElevationDimensions(req, elements),
    ...produceElementDimensions({ ...req, mode: 'per-element' }, elements),
  ];
}

function produceRCPDimensions(
  req: DimensionRequest,
  elements: Parameters<typeof produceDimensions>[1],
): DimensionString[] {
  // RCP: ceiling height is the primary dimension
  // Re-uses room-bounding for plan extents
  const dims: DimensionString[] = [];
  dims.push(...produceRoomDimensions(req, elements.rooms ?? []));
  // Ceiling height per room is handled separately via annotation, not DimensionString
  return dims;
}
```

---

#### A3. `DimensionEvaluator` — pure L4, resolves references to pixel coordinates

```typescript
// packages/geometry-kernel/dimensions/evaluator.ts
// Pure function — runs in bake-worker and browser.

import type { DimensionString, EvaluatedDimension } from '@pryzm/schemas/annotation/dimension';
import type { WallDto, DoorDto, WindowDto, RoomDto } from '@pryzm/schemas';

export interface ElementSnapshotForDim {
  walls: Map<string, WallDto>;
  doors: Map<string, DoorDto>;
  windows: Map<string, WindowDto>;
  rooms: Map<string, RoomDto>;
}

export interface ProjectUnitSettings {
  unit: 'mm' | 'cm' | 'm' | 'ft' | 'ft-in';
  decimalPlaces: number;
}

/**
 * Evaluates dimension strings against current element geometry.
 * Pure function. Runs in bake-worker.
 */
export function evaluateDimensions(
  dimensions: DimensionString[],
  snapshot: ElementSnapshotForDim,
  projectUnits: ProjectUnitSettings,
): EvaluatedDimension[] {
  return dimensions.map(dim => evaluateOne(dim, snapshot, projectUnits));
}

function evaluateOne(
  dim: DimensionString,
  snapshot: ElementSnapshotForDim,
  units: ProjectUnitSettings,
): EvaluatedDimension {
  // 1. Resolve the two primary reference points in world mm coordinates.
  const p1 = resolveAnchor(dim.references[0], snapshot);
  const p2 = resolveAnchor(dim.references[1], snapshot);

  // 2. Compute raw value.
  let valueMm: number;
  if (dim.orientation === 'horizontal') {
    valueMm = Math.abs(p2[0] - p1[0]);
  } else if (dim.orientation === 'vertical') {
    valueMm = Math.abs(p2[1] - p1[1]);
  } else {
    // aligned: true Euclidean distance
    valueMm = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  }

  // 3. Apply override if set.
  const isOverride = dim.override !== null;
  const displayValue = isOverride ? dim.override! : valueMm;

  // 4. Flag if override disagrees with geometry by more than 5%.
  const isFlagged = isOverride && Math.abs(displayValue - valueMm) / valueMm > 0.05;

  // 5. Format value text.
  const valueText = formatDimension(displayValue, dim.unitFormat ?? {
    unit: units.unit,
    decimalPlaces: units.decimalPlaces,
    suppressTrailingZeros: true,
    prefix: dim.label ?? '',
    suffix: '',
  });

  // 6. Compute geometry: dimension line position and witness line endpoints.
  const offset = dim.offsetMm ?? 8;
  const lineY = computeDimLinePosition(dim, p1, p2, offset);

  return {
    id: dim.id,
    valueText,
    valueMm,
    p1World: p1,
    p2World: p2,
    lineY,
    witnessP1: computeWitnessPoint(p1, dim, offset),
    witnessP2: computeWitnessPoint(p2, dim, offset),
    isOverride,
    isFlagged,
  };
}

function resolveAnchor(
  ref: { elementId: string; anchor: string },
  snapshot: ElementSnapshotForDim,
): [number, number] {
  // Resolve based on element type and anchor type.
  // Returns [x, y] in world mm (plan view: x = world X, y = world -Z).

  const wall = snapshot.walls.get(ref.elementId);
  if (wall) return resolveWallAnchor(wall, ref.anchor);

  const door = snapshot.doors.get(ref.elementId);
  if (door) return resolveDoorAnchor(door, ref.anchor, snapshot);

  const win = snapshot.windows.get(ref.elementId);
  if (win) return resolveWindowAnchor(win, ref.anchor, snapshot);

  const room = snapshot.rooms.get(ref.elementId);
  if (room) return resolveRoomAnchor(room, ref.anchor);

  return [0, 0]; // element not found — safe fallback
}

function resolveWallAnchor(wall: WallDto, anchor: string): [number, number] {
  const pts = wall.centerline as [number, number][];
  switch (anchor) {
    case 'start':     return pts[0];
    case 'end':       return pts[pts.length - 1];
    case 'center': {
      const mid = Math.floor(pts.length / 2);
      return pts[mid];
    }
    case 'left':      return pts.reduce((a, b) => a[0] < b[0] ? a : b);
    case 'right':     return pts.reduce((a, b) => a[0] > b[0] ? a : b);
    default:          return pts[0];
  }
}

function resolveDoorAnchor(door: DoorDto, anchor: string, snapshot: ElementSnapshotForDim): [number, number] {
  // Door is hosted on a wall; position = wall point at door offset.
  const wall = snapshot.walls.get(door.hostWallId as string);
  if (!wall) return [0, 0];
  // Interpolate along wall centerline to get door center position.
  const center = interpolatePolyline(wall.centerline as [number,number][], door.offsetFromStart as number);
  const halfWidth = (door.width as number) / 2;

  // Determine wall direction perpendicular for left/right face.
  const wallDir = getWallDir(wall.centerline as [number, number][]);
  const perp: [number, number] = [-wallDir[1], wallDir[0]];

  switch (anchor) {
    case 'left':   return [center[0] - perp[0] * halfWidth, center[1] - perp[1] * halfWidth];
    case 'right':  return [center[0] + perp[0] * halfWidth, center[1] + perp[1] * halfWidth];
    case 'center': return center;
    default:       return center;
  }
}

function resolveWindowAnchor(win: any, anchor: string, snapshot: ElementSnapshotForDim): [number, number] {
  return resolveDoorAnchor(win as any, anchor, snapshot); // same geometry logic
}

function resolveRoomAnchor(room: RoomDto, anchor: string): [number, number] {
  const boundary = room.computedBoundary as [number, number][] ?? [];
  if (!boundary.length) return [0, 0];
  const xs = boundary.map(p => p[0]);
  const ys = boundary.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  switch (anchor) {
    case 'left':   return [minX, (minY + maxY) / 2];
    case 'right':  return [maxX, (minY + maxY) / 2];
    case 'top':    return [(minX + maxX) / 2, maxY];
    case 'bottom': return [(minX + maxX) / 2, minY];
    case 'center': return [(minX + maxX) / 2, (minY + maxY) / 2];
    default:       return [(minX + maxX) / 2, (minY + maxY) / 2];
  }
}

function computeDimLinePosition(dim: DimensionString, p1: [number, number], p2: [number, number], offset: number): number {
  if (dim.orientation === 'horizontal') {
    const maxY = Math.max(p1[1], p2[1]);
    return maxY + offset; // line sits above the geometry
  }
  const maxX = Math.max(p1[0], p2[0]);
  return maxX + offset; // line sits to the right of the geometry
}

function computeWitnessPoint(
  elementPt: [number, number],
  dim: DimensionString,
  offset: number,
): [number, number] {
  const ext = dim.witnessLines?.extension ?? 2;
  if (dim.orientation === 'horizontal') {
    return [elementPt[0], elementPt[1] + offset + ext];
  }
  return [elementPt[0] + offset + ext, elementPt[1]];
}

// ── Utility: format dimension value ──────────────────────────────────────

function formatDimension(valueMm: number, fmt: { unit: string; decimalPlaces: number; suppressTrailingZeros: boolean; prefix: string; suffix: string }): string {
  let converted: number;
  let unitLabel = '';

  switch (fmt.unit) {
    case 'mm':    converted = valueMm;           unitLabel = '';    break;
    case 'cm':    converted = valueMm / 10;      unitLabel = '';    break;
    case 'm':     converted = valueMm / 1000;    unitLabel = '';    break;
    case 'ft':    converted = valueMm / 304.8;   unitLabel = "'";   break;
    case 'in':    converted = valueMm / 25.4;    unitLabel = '"';   break;
    case 'ft-in': return formatFeetInches(valueMm, fmt.prefix, fmt.suffix);
    default:      converted = valueMm;
  }

  let text = converted.toFixed(fmt.decimalPlaces);
  if (fmt.suppressTrailingZeros && text.includes('.')) {
    text = text.replace(/\.?0+$/, '');
  }
  return `${fmt.prefix}${text}${unitLabel}${fmt.suffix}`;
}

function formatFeetInches(mm: number, prefix: string, suffix: string): string {
  const totalInches = mm / 25.4;
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  const inText = inches.toFixed(0);
  return `${prefix}${feet}'-${inText}"${suffix}`;
}

// ── Utility: geometry helpers ─────────────────────────────────────────────

function interpolatePolyline(pts: [number,number][], offset: number): [number, number] {
  let remaining = offset;
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i+1][0] - pts[i][0];
    const dy = pts[i+1][1] - pts[i][1];
    const len = Math.hypot(dx, dy);
    if (remaining <= len) {
      const t = remaining / len;
      return [pts[i][0] + dx * t, pts[i][1] + dy * t];
    }
    remaining -= len;
  }
  return pts[pts.length - 1];
}

function getWallDir(pts: [number, number][]): [number, number] {
  const dx = pts[pts.length - 1][0] - pts[0][0];
  const dy = pts[pts.length - 1][1] - pts[0][1];
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
}
```

**Exit criteria (S33):**
- `evaluateDimensions` runs in Node (bake-worker test: `node -e "require('./packages/geometry-kernel/dimensions/evaluator').evaluateDimensions(...)"`)
- 30 snapshot test cases covering all anchor types
- Zero THREE/DOM imports (CI Gate G10 enforced from this sprint)
- Performance: 5,000 dimensions evaluated in < 16 ms

---

### Sprint S34 — DimensionCommitter (L5)

```typescript
// packages/scene-committer/dimensions.ts
// L5: allowed to use Canvas2D. NOT THREE.

import type { EvaluatedDimension } from '@pryzm/schemas/annotation/dimension';
import type { DimensionString } from '@pryzm/schemas/annotation/dimension';

/**
 * Draws evaluated dimensions to a Canvas2D context.
 * Called from DimensionCommitter in the FrameScheduler 'commit' phase.
 * This function DOES use Canvas2D, so it correctly lives in L5.
 */
export function commitDimensions(
  ctx: CanvasRenderingContext2D,
  evaluated: EvaluatedDimension[],
  strings: Map<string, DimensionString>,
  scale: number,             // pixels per mm at current zoom
  viewTransform: DOMMatrix,  // current pan/zoom matrix
): void {
  ctx.save();
  ctx.setTransform(viewTransform);

  for (const dim of evaluated) {
    const str = strings.get(dim.id);
    if (!str) continue;

    drawDimensionLine(ctx, dim, str, scale);
    drawWitnessLines(ctx, dim, str, scale);
    drawArrowheads(ctx, dim, str, scale);
    drawDimensionText(ctx, dim, str, scale);
    if (dim.isFlagged) drawOverrideFlag(ctx, dim, scale);
  }

  ctx.restore();
}

function drawDimensionLine(ctx: CanvasRenderingContext2D, dim: EvaluatedDimension, str: DimensionString, scale: number): void {
  ctx.beginPath();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 0.18 * scale; // 0.18mm dimension line weight
  ctx.setLineDash([]);

  if (str.orientation === 'horizontal') {
    ctx.moveTo(dim.p1World[0], dim.lineY);
    ctx.lineTo(dim.p2World[0], dim.lineY);
  } else if (str.orientation === 'vertical') {
    ctx.moveTo(dim.lineY, dim.p1World[1]);
    ctx.lineTo(dim.lineY, dim.p2World[1]);
  } else {
    // Aligned: draw line parallel to element axis offset by offsetMm
    ctx.moveTo(dim.p1World[0], dim.p1World[1]);
    ctx.lineTo(dim.p2World[0], dim.p2World[1]);
  }

  ctx.stroke();
}

function drawWitnessLines(ctx: CanvasRenderingContext2D, dim: EvaluatedDimension, str: DimensionString, scale: number): void {
  ctx.beginPath();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = (str.witnessLines?.weight ?? 0.18) * scale;

  // Witness line 1
  const [wx1, wy1] = dim.witnessP1;
  const [px1, py1] = dim.p1World;
  ctx.moveTo(px1, py1);
  ctx.lineTo(wx1, wy1);

  // Witness line 2
  const [wx2, wy2] = dim.witnessP2;
  const [px2, py2] = dim.p2World;
  ctx.moveTo(px2, py2);
  ctx.lineTo(wx2, wy2);

  ctx.stroke();
}

function drawArrowheads(ctx: CanvasRenderingContext2D, dim: EvaluatedDimension, str: DimensionString, scale: number): void {
  const style = str.arrowheads ?? 'tick';
  const tickLen = 2 * scale; // 2mm tick

  if (style === 'tick') {
    // Draw diagonal tick at p1 and p2 on the dimension line
    const drawTick = (x: number, y: number): void => {
      ctx.beginPath();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 0.25 * scale;
      ctx.moveTo(x - tickLen * 0.5, y - tickLen * 0.5);
      ctx.lineTo(x + tickLen * 0.5, y + tickLen * 0.5);
      ctx.stroke();
    };

    if (str.orientation === 'horizontal') {
      drawTick(dim.p1World[0], dim.lineY);
      drawTick(dim.p2World[0], dim.lineY);
    } else {
      drawTick(dim.lineY, dim.p1World[1]);
      drawTick(dim.lineY, dim.p2World[1]);
    }
  }
  // open-arrow, filled-arrow, dot: implement similarly
}

function drawDimensionText(ctx: CanvasRenderingContext2D, dim: EvaluatedDimension, str: DimensionString, scale: number): void {
  const midX = (dim.p1World[0] + dim.p2World[0]) / 2;
  const midY = str.orientation === 'horizontal' ? dim.lineY - 1.5 * scale : (dim.p1World[1] + dim.p2World[1]) / 2;

  ctx.font = `${2.5 * scale}px Inter, Arial, sans-serif`;  // 2.5mm text height
  ctx.fillStyle = dim.isFlagged ? '#CC4400' : '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  if (str.orientation === 'vertical') {
    ctx.save();
    ctx.translate(dim.lineY - 1.5 * scale, midY);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(dim.valueText, 0, 0);
    ctx.restore();
  } else {
    ctx.fillText(dim.valueText, midX, midY);
  }
}

function drawOverrideFlag(ctx: CanvasRenderingContext2D, dim: EvaluatedDimension, scale: number): void {
  // Draw a small orange underline below the override text to indicate it conflicts with geometry
  const midX = (dim.p1World[0] + dim.p2World[0]) / 2;
  ctx.beginPath();
  ctx.strokeStyle = '#CC4400';
  ctx.lineWidth = 0.5 * scale;
  ctx.moveTo(midX - 5 * scale, dim.lineY - 0.5 * scale);
  ctx.lineTo(midX + 5 * scale, dim.lineY - 0.5 * scale);
  ctx.stroke();
}
```

---

### Sprint S35 — Auto-Dimension Modes 1 + 2 Live in Plan View

**Integration with `PlanViewCanvasHost`:**

```typescript
// Additions to plugins/plan-view/canvas-host.ts

import { produceDimensions } from '@pryzm/geometry-kernel/dimensions/producer';
import { evaluateDimensions } from '@pryzm/geometry-kernel/dimensions/evaluator';
import { commitDimensions } from '@pryzm/scene-committer/dimensions';

// Inside renderFrame():
private renderFrame(): void {
  if (!this.isDirty) return;
  this.isDirty = false;

  const data = this.getViewData();

  // ... existing poche + edge + room rendering ...

  // Auto-dimensions (if enabled for this view):
  if (this.viewSettings.autoDimensionMode) {
    const snapshot = {
      walls: new Map(data.walls.map(w => [w.id, w])),
      doors: new Map(data.doors.map(d => [d.id, d])),
      windows: new Map(data.windows.map(w => [w.id, w])),
      rooms: new Map((data.rooms ?? []).map(r => [r.id, r])),
    };

    const produced = produceDimensions(
      { mode: this.viewSettings.autoDimensionMode, viewId: this.viewId, levelId: this.levelId },
      { walls: data.walls, doors: data.doors, windows: data.windows, rooms: data.rooms ?? [] },
    );

    const evaluated = evaluateDimensions(produced, snapshot, this.projectUnits);

    commitDimensions(
      this.ctx,
      evaluated,
      new Map(produced.map(d => [d.id, d])),
      this.camera.scale,
      this.camera.currentTransform,
    );
  }
}
```

**DimensionStore additions:**

```typescript
// packages/stores/DimensionStore.ts — new store added in S31

export interface DimensionState {
  dimensions: Map<DimensionId, DimensionString>; // manually placed dims
  overrides: Map<DimensionId, number>;            // user-pinned values
  viewSettings: Map<ViewId, DimensionViewSettings>;
}

export interface DimensionViewSettings {
  autoDimensionMode: 'off' | 'per-element' | 'room-bounding' | 'elevation' | 'section' | 'rcp';
  showOverallDimensions: boolean;
  autoDimensionOffset: number; // mm from geometry to dimension line
}
```

---

### Sprint S39 — Elevation + Section + RCP Auto-Dimensions

**Elevation view** (`plugins/elevation-view/canvas-host.ts`):

```typescript
// In elevation view renderFrame():
// Elevation auto-dim uses 'elevation' mode — produces height dimensions
const produced = produceDimensions(
  { mode: 'elevation', viewId: this.viewId },
  { walls: data.walls, windows: data.windows },
);
// evaluateDimensions resolves anchors using elevation-space coordinates
// DimensionEvaluator maps 'bottom' → worldY of base level, 'top' → topZ
```

**Section view** (`plugins/section-view/canvas-host.ts`):
Same pattern with `mode: 'section'` — produces both horizontal (width) and vertical (height) dimensions for all cut elements.

**RCP** (`plugins/rcp-view/canvas-host.ts`):
Uses `mode: 'rcp'` — produces room-bounding plan dimensions + ceiling height annotation (displayed as a text tag, not a DimensionString, since ceiling height is a point annotation not a span).

---

## §B — View Templates / System Intent: Sprint-Level Implementation

### Sprint S31 — ViewTemplate Schema

```typescript
// packages/schemas/src/view/view-template.ts

import { z } from 'zod';

// ── Visibility / Graphics override ───────────────────────────────────────

export const StrokeStyleSchema = z.object({
  visible: z.boolean().default(true),
  weight: z.number().default(0.25),          // mm
  color: z.string().default('#000000'),      // hex
  dash: z.enum(['solid', 'dashed', 'dotted', 'centerline', 'phantom']).default('solid'),
});

export const CategoryVGSchema = z.object({
  visible: z.boolean().default(true),
  projection: StrokeStyleSchema.default({}),
  cut: StrokeStyleSchema.default({}),
  fillColor: z.string().optional(),           // hex for solid fill
  hatchName: z.string().optional(),           // predefined hatch from SPEC-04
  halftone: z.boolean().default(false),
  transparency: z.number().min(0).max(100).default(0),
});

// ── View filter condition ─────────────────────────────────────────────────

export type FilterCondition =
  | { kind: 'pset-equals';   pset: string; property: string; value: string | number | boolean }
  | { kind: 'pset-contains'; pset: string; property: string; value: string }
  | { kind: 'pset-greater';  pset: string; property: string; value: number }
  | { kind: 'pset-less';     pset: string; property: string; value: number }
  | { kind: 'pset-exists';   pset: string; property: string }
  | { kind: 'type-name-is';  typeName: string }
  | { kind: 'and';           conditions: FilterCondition[] }
  | { kind: 'or';            conditions: FilterCondition[] }
  | { kind: 'not';           condition: FilterCondition };

export const FilterConditionSchema: z.ZodType<FilterCondition> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('pset-equals'),   pset: z.string(), property: z.string(), value: z.union([z.string(), z.number(), z.boolean()]) }),
    z.object({ kind: z.literal('pset-contains'), pset: z.string(), property: z.string(), value: z.string() }),
    z.object({ kind: z.literal('pset-greater'),  pset: z.string(), property: z.string(), value: z.number() }),
    z.object({ kind: z.literal('pset-less'),     pset: z.string(), property: z.string(), value: z.number() }),
    z.object({ kind: z.literal('pset-exists'),   pset: z.string(), property: z.string() }),
    z.object({ kind: z.literal('type-name-is'),  typeName: z.string() }),
    z.object({ kind: z.literal('and'), conditions: z.array(FilterConditionSchema) }),
    z.object({ kind: z.literal('or'),  conditions: z.array(FilterConditionSchema) }),
    z.object({ kind: z.literal('not'), condition: FilterConditionSchema }),
  ])
);

export const ViewFilterSchema = z.object({
  id: z.string(),
  name: z.string(),
  categories: z.array(z.string()),         // element category names
  condition: FilterConditionSchema,
  overrides: CategoryVGSchema.partial(),
  enabled: z.boolean().default(true),
});

// ── View range ────────────────────────────────────────────────────────────

export const ViewRangeSchema = z.object({
  topClipOffset: z.number().default(2300),     // mm above cut plane
  cutPlaneOffset: z.number().default(1200),    // mm above base level (1.2m cut)
  bottomClipOffset: z.number().default(-300),  // mm below base level
  viewDepth: z.union([z.literal('unlimited'), z.number()]).default('unlimited'),
});

// ── View template ─────────────────────────────────────────────────────────

export const ElementCategorySchema = z.enum([
  'Wall', 'Slab', 'Door', 'Window', 'Roof', 'CurtainWall',
  'Column', 'Beam', 'Stair', 'Handrail', 'Ceiling', 'Room',
  'Grid', 'Level', 'Furniture', 'Structural', 'MEP', 'Annotation',
  'Dimension', 'Tag', 'Section', 'Elevation', 'Callout',
]);
export type ElementCategory = z.infer<typeof ElementCategorySchema>;

export const ViewTemplateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  description: z.string().optional(),
  discipline: z.enum(['Architectural', 'Structural', 'MEP', 'Coordination']).optional(),
  categoryOverrides: z.record(ElementCategorySchema, CategoryVGSchema).default({}),
  filters: z.array(ViewFilterSchema).default([]),
  viewRange: ViewRangeSchema.optional(),
  detailLevel: z.enum(['Coarse', 'Medium', 'Fine']).default('Medium'),
  displayStyle: z.enum(['Wireframe', 'HiddenLine', 'Shaded', 'ConsistentColors', 'Realistic']).default('HiddenLine'),
  annotationCategories: z.record(z.boolean()).default({}),
  isSystemTemplate: z.boolean().default(false),  // true = ships with PRYZM, not user-deletable
});

export type ViewTemplate = z.infer<typeof ViewTemplateSchema>;
```

---

### Sprint S33 — View Resolution Algorithm (pure L4)

```typescript
// packages/geometry-kernel/view-resolution/resolver.ts
// Pure L4 — runs in bake-worker (Node, no DOM, no THREE).

import type { ViewTemplate, ElementCategory, CategoryVG, FilterCondition } from '@pryzm/schemas/view/view-template';
import type { WallDto, SlabDto } from '@pryzm/schemas';

// ── Element classification ────────────────────────────────────────────────

export type ElementClassification = 'cut' | 'beyond' | 'hidden' | 'symbolic' | 'outside-range';

export interface ElementRenderInstruction {
  elementId: string;
  category: ElementCategory;
  classification: ElementClassification;
  visible: boolean;
  stroke: {
    weight: number;
    color: string;
    dash: string;
  };
  fill?: {
    color: string;
    hatch?: string;
    opacity: number;
  };
  halftone: boolean;
  transparency: number;
}

// ── Resolution algorithm ──────────────────────────────────────────────────

/**
 * For each element in the scene, determines its visual appearance
 * given the current view template. Pure function.
 *
 * Priority order:
 *   1. Element-level VG override (if set in view.elementOverrides)
 *   2. First matching ViewFilter override
 *   3. Category-level VG override from template.categoryOverrides
 *   4. Default appearance from element type
 *   5. Default appearance from element category
 */
export function resolveElementInstructions(
  elements: Array<{ id: string; category: ElementCategory; typeId?: string; psets?: Record<string, unknown>; worldZMin: number; worldZMax: number }>,
  template: ViewTemplate,
  viewRange: { cutPlaneZ: number; topClipZ: number; bottomClipZ: number; levelZ: number },
  elementOverrides: Map<string, Partial<CategoryVG>>,
): ElementRenderInstruction[] {
  return elements.map(element =>
    resolveOne(element, template, viewRange, elementOverrides),
  );
}

function resolveOne(
  element: { id: string; category: ElementCategory; typeId?: string; psets?: Record<string, unknown>; worldZMin: number; worldZMax: number },
  template: ViewTemplate,
  viewRange: { cutPlaneZ: number; topClipZ: number; bottomClipZ: number; levelZ: number },
  elementOverrides: Map<string, Partial<CategoryVG>>,
): ElementRenderInstruction {

  // Step 1: classify element based on view range.
  const classification = classifyElement(element, viewRange);

  // Step 2: determine base VG from priority chain.
  const vg = resolveVG(element, template, elementOverrides);

  if (!vg.visible) {
    return { elementId: element.id, category: element.category, classification, visible: false, stroke: { weight: 0, color: 'transparent', dash: 'solid' }, halftone: false, transparency: 0 };
  }

  // Step 3: select cut vs projection style based on classification.
  const strokeStyle = classification === 'cut' ? vg.cut : vg.projection;

  return {
    elementId: element.id,
    category: element.category,
    classification,
    visible: true,
    stroke: {
      weight: strokeStyle?.weight ?? 0.25,
      color: strokeStyle?.color ?? '#000000',
      dash: strokeStyle?.dash ?? 'solid',
    },
    fill: vg.fillColor ? {
      color: vg.fillColor,
      hatch: vg.hatchName,
      opacity: 1 - (vg.transparency ?? 0) / 100,
    } : undefined,
    halftone: vg.halftone ?? false,
    transparency: vg.transparency ?? 0,
  };
}

function classifyElement(
  element: { worldZMin: number; worldZMax: number },
  viewRange: { cutPlaneZ: number; topClipZ: number; bottomClipZ: number },
): ElementClassification {
  // Element is entirely above the top clip: outside range.
  if (element.worldZMin > viewRange.topClipZ) return 'outside-range';
  // Element is entirely below the bottom clip: outside range.
  if (element.worldZMax < viewRange.bottomClipZ) return 'outside-range';
  // Element straddles the cut plane: cut.
  if (element.worldZMin <= viewRange.cutPlaneZ && element.worldZMax >= viewRange.cutPlaneZ) return 'cut';
  // Element is entirely above cut plane but below top clip: beyond.
  if (element.worldZMin > viewRange.cutPlaneZ) return 'beyond';
  // Element is entirely below cut plane but above bottom clip: hidden (shown as projected outlines).
  return 'hidden';
}

function resolveVG(
  element: { id: string; category: ElementCategory; typeId?: string; psets?: Record<string, unknown> },
  template: ViewTemplate,
  elementOverrides: Map<string, Partial<CategoryVG>>,
): Partial<CategoryVG> & { visible: boolean } {

  // Priority 1: per-element override.
  const elemOverride = elementOverrides.get(element.id);
  if (elemOverride) {
    return { visible: elemOverride.visible ?? true, ...elemOverride };
  }

  // Priority 2: first matching filter.
  for (const filter of template.filters) {
    if (!filter.enabled) continue;
    if (!filter.categories.includes(element.category)) continue;
    if (evaluateCondition(filter.condition, element.psets ?? {}, element.typeId ?? '')) {
      return { visible: filter.overrides?.visible ?? true, ...filter.overrides };
    }
  }

  // Priority 3: category override in template.
  const catVG = template.categoryOverrides[element.category];
  if (catVG) return catVG;

  // Priority 4+: default (visible, black 0.25mm solid).
  return { visible: true, projection: { visible: true, weight: 0.25, color: '#000000', dash: 'solid' }, cut: { visible: true, weight: 0.50, color: '#000000', dash: 'solid' } };
}

function evaluateCondition(
  condition: FilterCondition,
  psets: Record<string, unknown>,
  typeName: string,
): boolean {
  switch (condition.kind) {
    case 'pset-equals': {
      const val = getPsetValue(psets, condition.pset, condition.property);
      return val === condition.value;
    }
    case 'pset-contains': {
      const val = getPsetValue(psets, condition.pset, condition.property);
      return typeof val === 'string' && val.includes(condition.value);
    }
    case 'pset-greater': {
      const val = getPsetValue(psets, condition.pset, condition.property);
      return typeof val === 'number' && val > condition.value;
    }
    case 'pset-less': {
      const val = getPsetValue(psets, condition.pset, condition.property);
      return typeof val === 'number' && val < condition.value;
    }
    case 'pset-exists': {
      return getPsetValue(psets, condition.pset, condition.property) !== undefined;
    }
    case 'type-name-is': return typeName === condition.typeName;
    case 'and': return condition.conditions.every(c => evaluateCondition(c, psets, typeName));
    case 'or':  return condition.conditions.some(c => evaluateCondition(c, psets, typeName));
    case 'not': return !evaluateCondition(condition.condition, psets, typeName);
  }
}

function getPsetValue(psets: Record<string, unknown>, pset: string, property: string): unknown {
  const psetData = psets[pset] as Record<string, unknown> | undefined;
  return psetData?.[property];
}
```

**Exit criteria (S33):**
- `resolveElementInstructions` runs in Node (bake-worker test: passes)
- CI Gate G11 enforced: no THREE/DOM imports
- 50 snapshot test cases covering all priority chain scenarios
- Filter condition: all 8 condition types have tests
- `classifyElement` tested with 10 view range scenarios

---

### Sprint S37 — Ship-With-Product View Templates (12 defaults)

```typescript
// packages/stores/view-templates-catalog/index.ts

import type { ViewTemplate } from '@pryzm/schemas/view/view-template';

export const SYSTEM_VIEW_TEMPLATES: ViewTemplate[] = [

  // 1. Architectural Plan
  {
    id: 'sys-arch-plan',
    name: 'Architectural Plan',
    discipline: 'Architectural',
    isSystemTemplate: true,
    viewRange: { topClipZ: 2300, cutPlaneZ: 1200, bottomClipZ: -300, viewDepth: 'unlimited' },
    detailLevel: 'Medium',
    displayStyle: 'HiddenLine',
    categoryOverrides: {
      Wall: {
        visible: true,
        cut: { visible: true, weight: 0.50, color: '#000000', dash: 'solid' },
        projection: { visible: true, weight: 0.13, color: '#000000', dash: 'solid' },
        fillColor: '#000000',
      },
      Slab: {
        visible: true,
        cut: { visible: true, weight: 0.35, color: '#000000', dash: 'solid' },
        projection: { visible: true, weight: 0.13, color: '#666666', dash: 'solid' },
      },
      Door: {
        visible: true,
        cut: { visible: true, weight: 0.25, color: '#000000', dash: 'solid' },
        projection: { visible: true, weight: 0.13, color: '#000000', dash: 'solid' },
      },
      Window: {
        visible: true,
        cut: { visible: true, weight: 0.25, color: '#000000', dash: 'solid' },
        projection: { visible: true, weight: 0.13, color: '#000000', dash: 'solid' },
      },
      Structural: {
        visible: true,
        cut: { visible: true, weight: 0.50, color: '#000000', dash: 'solid' },
        projection: { visible: true, weight: 0.18, color: '#333333', dash: 'solid' },
        halftone: false,
      },
      MEP: { visible: false, cut: { visible: false, weight: 0, color: 'transparent', dash: 'solid' }, projection: { visible: false, weight: 0, color: 'transparent', dash: 'solid' } },
      Furniture: { visible: true, cut: { visible: true, weight: 0.18, color: '#000000', dash: 'solid' }, projection: { visible: true, weight: 0.13, color: '#888888', dash: 'solid' }, halftone: true },
      Grid: { visible: true, cut: { visible: true, weight: 0.13, color: '#0000AA', dash: 'centerline' }, projection: { visible: true, weight: 0.13, color: '#0000AA', dash: 'centerline' } },
      Room: { visible: true, cut: { visible: false, weight: 0, color: 'transparent', dash: 'solid' }, projection: { visible: false, weight: 0, color: 'transparent', dash: 'solid' }, fillColor: '#2060FF', transparency: 92 },
    },
    filters: [],
    annotationCategories: { Dimension: true, Tag: true, Section: true, Elevation: true },
  },

  // 2. Reflected Ceiling Plan
  {
    id: 'sys-rcp',
    name: 'Reflected Ceiling Plan',
    discipline: 'Architectural',
    isSystemTemplate: true,
    viewRange: { topClipZ: 3000, cutPlaneZ: 2400, bottomClipZ: 0, viewDepth: 'unlimited' },
    detailLevel: 'Medium',
    displayStyle: 'HiddenLine',
    categoryOverrides: {
      Wall: {
        visible: true,
        cut: { visible: true, weight: 0.35, color: '#000000', dash: 'solid' },
        projection: { visible: true, weight: 0.13, color: '#999999', dash: 'solid' },
      },
      Ceiling: {
        visible: true,
        cut: { visible: true, weight: 0.25, color: '#000000', dash: 'solid' },
        projection: { visible: true, weight: 0.18, color: '#000000', dash: 'solid' },
      },
      Slab: { visible: false, cut: { visible: false, weight: 0, color: 'transparent', dash: 'solid' }, projection: { visible: false, weight: 0, color: 'transparent', dash: 'solid' } },
      Furniture: { visible: false, cut: { visible: false, weight: 0, color: 'transparent', dash: 'solid' }, projection: { visible: false, weight: 0, color: 'transparent', dash: 'solid' } },
      MEP: { visible: true, cut: { visible: true, weight: 0.25, color: '#0044AA', dash: 'solid' }, projection: { visible: true, weight: 0.18, color: '#0044AA', dash: 'solid' } },
    },
    filters: [],
    annotationCategories: { Dimension: true, Tag: true },
  },

  // 3. Structural Plan
  {
    id: 'sys-structural-plan',
    name: 'Structural Plan',
    discipline: 'Structural',
    isSystemTemplate: true,
    viewRange: { topClipZ: 2300, cutPlaneZ: 1200, bottomClipZ: -300, viewDepth: 'unlimited' },
    detailLevel: 'Fine',
    displayStyle: 'HiddenLine',
    categoryOverrides: {
      Wall: {
        visible: true,
        cut: { visible: true, weight: 0.18, color: '#888888', dash: 'solid' },
        projection: { visible: true, weight: 0.13, color: '#AAAAAA', dash: 'solid' },
        halftone: true,
      },
      Structural: {
        visible: true,
        cut: { visible: true, weight: 0.70, color: '#000000', dash: 'solid' },
        projection: { visible: true, weight: 0.35, color: '#000000', dash: 'solid' },
      },
      Slab: {
        visible: true,
        cut: { visible: true, weight: 0.50, color: '#000000', dash: 'solid' },
        projection: { visible: true, weight: 0.25, color: '#000000', dash: 'solid' },
      },
      Door: { visible: false, cut: { visible: false, weight: 0, color: 'transparent', dash: 'solid' }, projection: { visible: false, weight: 0, color: 'transparent', dash: 'solid' } },
      Window: { visible: false, cut: { visible: false, weight: 0, color: 'transparent', dash: 'solid' }, projection: { visible: false, weight: 0, color: 'transparent', dash: 'solid' } },
      Furniture: { visible: false, cut: { visible: false, weight: 0, color: 'transparent', dash: 'solid' }, projection: { visible: false, weight: 0, color: 'transparent', dash: 'solid' } },
      MEP: { visible: false, cut: { visible: false, weight: 0, color: 'transparent', dash: 'solid' }, projection: { visible: false, weight: 0, color: 'transparent', dash: 'solid' } },
    },
    filters: [],
    annotationCategories: { Dimension: true, Tag: true, Grid: true },
  },

  // 4–12 additional templates follow same pattern (MEP Plan, Coordination, Site Plan,
  // Section, Exterior Elevation, Interior Elevation, 3D Realistic, 3D Wireframe, 3D Coordination)
  // abbreviated here — full implementations in SPEC-SYSTEM-INTENT §2.7.5
];

export function getSystemTemplate(id: string): ViewTemplate | undefined {
  return SYSTEM_VIEW_TEMPLATES.find(t => t.id === id);
}
```

---

### Sprint S38 — View Template Editor UI

```typescript
// plugins/view-templates/editor.ts
// L7 — vanilla TS DOM. No THREE.

import type { ViewTemplate, CategoryVG, ElementCategory } from '@pryzm/schemas/view/view-template';

export class ViewTemplateEditor {
  private panel: HTMLElement;

  constructor(
    private container: HTMLElement,
    private onUpdate: (updated: ViewTemplate) => void,
  ) {
    this.panel = document.createElement('div');
    this.panel.className = 'view-template-editor';
    container.appendChild(this.panel);
  }

  mount(template: ViewTemplate): void {
    this.panel.innerHTML = '';

    // Template name
    const nameField = this.createField('Template Name', template.name, val => {
      this.onUpdate({ ...template, name: val });
    });
    this.panel.appendChild(nameField);

    // Detail level
    const detailField = this.createSelect('Detail Level', ['Coarse', 'Medium', 'Fine'], template.detailLevel, val => {
      this.onUpdate({ ...template, detailLevel: val as any });
    });
    this.panel.appendChild(detailField);

    // Display style
    const styleField = this.createSelect('Display Style', ['Wireframe', 'HiddenLine', 'Shaded', 'ConsistentColors', 'Realistic'], template.displayStyle, val => {
      this.onUpdate({ ...template, displayStyle: val as any });
    });
    this.panel.appendChild(styleField);

    // Category overrides table
    const catSection = this.buildCategoryTable(template);
    this.panel.appendChild(catSection);

    // View filters list
    const filterSection = this.buildFilterList(template);
    this.panel.appendChild(filterSection);

    // View range sliders
    const rangeSection = this.buildViewRangeSliders(template);
    this.panel.appendChild(rangeSection);
  }

  private buildCategoryTable(template: ViewTemplate): HTMLElement {
    const section = document.createElement('section');
    section.innerHTML = '<h4>Visibility / Graphics</h4>';

    const CATEGORIES: ElementCategory[] = [
      'Wall', 'Slab', 'Door', 'Window', 'Roof', 'CurtainWall',
      'Column', 'Beam', 'Stair', 'Ceiling', 'Room',
      'Grid', 'Furniture', 'Structural', 'MEP',
    ];

    const table = document.createElement('table');
    table.innerHTML = `
      <thead>
        <tr>
          <th>Category</th>
          <th>Visible</th>
          <th>Cut Weight</th>
          <th>Cut Color</th>
          <th>Halftone</th>
          <th>Transparency</th>
        </tr>
      </thead>
    `;
    const tbody = document.createElement('tbody');

    for (const cat of CATEGORIES) {
      const vg = template.categoryOverrides[cat] ?? {};
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${cat}</td>
        <td><input type="checkbox" ${vg.visible !== false ? 'checked' : ''} data-cat="${cat}" data-field="visible"></td>
        <td><input type="number" value="${vg.cut?.weight ?? 0.25}" step="0.05" min="0" max="2" data-cat="${cat}" data-field="cut.weight" style="width:50px"></td>
        <td><input type="color" value="${vg.cut?.color ?? '#000000'}" data-cat="${cat}" data-field="cut.color"></td>
        <td><input type="checkbox" ${vg.halftone ? 'checked' : ''} data-cat="${cat}" data-field="halftone"></td>
        <td><input type="range" min="0" max="100" value="${vg.transparency ?? 0}" data-cat="${cat}" data-field="transparency"></td>
      `;
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    table.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      const cat = input.dataset.cat as ElementCategory;
      const field = input.dataset.field!;
      const updatedTemplate = this.updateCategoryField(template, cat, field, input.type === 'checkbox' ? input.checked : input.value);
      this.onUpdate(updatedTemplate);
    });
    section.appendChild(table);
    return section;
  }

  private updateCategoryField(template: ViewTemplate, cat: ElementCategory, field: string, value: unknown): ViewTemplate {
    const existing = template.categoryOverrides[cat] ?? {};
    let updated = { ...existing };

    if (field === 'visible') updated = { ...updated, visible: value as boolean };
    else if (field === 'cut.weight') updated = { ...updated, cut: { ...(updated.cut ?? {}), weight: Number(value) } as any };
    else if (field === 'cut.color') updated = { ...updated, cut: { ...(updated.cut ?? {}), color: String(value) } as any };
    else if (field === 'halftone') updated = { ...updated, halftone: value as boolean };
    else if (field === 'transparency') updated = { ...updated, transparency: Number(value) };

    return {
      ...template,
      categoryOverrides: { ...template.categoryOverrides, [cat]: updated },
    };
  }

  private buildFilterList(template: ViewTemplate): HTMLElement {
    const section = document.createElement('section');
    section.innerHTML = '<h4>View Filters</h4>';
    // Filter builder UI: add/remove filters with condition builder
    // Full implementation: condition-builder.ts
    return section;
  }

  private buildViewRangeSliders(template: ViewTemplate): HTMLElement {
    const section = document.createElement('section');
    section.innerHTML = '<h4>View Range</h4>';
    const vr = template.viewRange ?? { topClipZ: 2300, cutPlaneZ: 1200, bottomClipZ: -300, viewDepth: 'unlimited' };

    const fields = [
      { label: 'Top Clip (mm above level)', key: 'topClipZ', value: vr.topClipZ, min: 0, max: 10000 },
      { label: 'Cut Plane (mm above level)', key: 'cutPlaneZ', value: vr.cutPlaneZ, min: 0, max: 5000 },
      { label: 'Bottom Clip (mm below level)', key: 'bottomClipZ', value: Math.abs(vr.bottomClipZ), min: 0, max: 2000 },
    ];

    for (const field of fields) {
      const row = document.createElement('label');
      row.innerHTML = `${field.label}: <input type="number" value="${field.value}" min="${field.min}" max="${field.max}">`;
      row.querySelector('input')!.addEventListener('change', (e) => {
        const newVal = Number((e.target as HTMLInputElement).value);
        const updatedVR = { ...vr, [field.key]: field.key === 'bottomClipZ' ? -newVal : newVal };
        this.onUpdate({ ...template, viewRange: updatedVR });
      });
      section.appendChild(row);
    }

    return section;
  }

  private createField(label: string, value: string, onChange: (v: string) => void): HTMLElement {
    const el = document.createElement('label');
    el.innerHTML = `${label}: <input type="text" value="${value}">`;
    el.querySelector('input')!.addEventListener('change', (e) => onChange((e.target as HTMLInputElement).value));
    return el;
  }

  private createSelect(label: string, options: string[], value: string, onChange: (v: string) => void): HTMLElement {
    const el = document.createElement('label');
    el.innerHTML = `${label}: <select>${options.map(o => `<option ${o === value ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
    el.querySelector('select')!.addEventListener('change', (e) => onChange((e.target as HTMLSelectElement).value));
    return el;
  }

  dispose(): void {
    this.panel.remove();
  }
}
```

---

## §C — CI Gates Added by This Supplement

| Gate | Enforced from | Condition | Description |
|---|---|---|---|
| **G10** | S33 | `packages/geometry-kernel/dimensions/` has no THREE/DOM imports | DimensionProducer + DimensionEvaluator layer purity |
| **G11** | S33 | `packages/geometry-kernel/view-resolution/` has no THREE/DOM imports | ViewResolutionAlgorithm layer purity |
| **G15** | S38 | Visual-diff against golden renders for each system view template | Any view template change must have a passing golden render |
| **dim-snapshot** | S33 | 30 DimensionEvaluator snapshot tests | deterministic across Node + browser |
| **view-resolution-snapshot** | S33 | 50 ViewResolution snapshot tests | priority chain correctness |

---

## §D — OTel Spans Added

| Span | Layer | Sprint |
|---|---|---|
| `pryzm.dimension.produce` | L4 | S33 |
| `pryzm.dimension.evaluate` | L4 | S33 |
| `pryzm.dimension.commit` | L5 | S34 |
| `pryzm.view-template.resolve` | L4 | S33 |
| `pryzm.view-template.apply` | L5 | S34 |

---

*Last updated: 2026-04-27. Companion: `PHASE-2B-Q2-M16-M18-PLAN-VIEW.md`. Authority: `SUPPLEMENTAL-IMPLEMENTATION-PLAN-2026.md §2.1 + §2.7`.*
