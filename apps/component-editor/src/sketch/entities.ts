// Sketch entity types — pure data, no behaviour (S52 D1).
//
// Mirrors the convention the constraint-solver expects: every Point
// has its own variable pair `${id}-x` / `${id}-y` (the solver default
// resolution; see `packages/constraint-solver/src/engine.ts`).
//
// Coordinate convention: XZ plane in millimetres.  +X right, +Z away
// from the viewer when looking down the world-Y axis.  Matches the
// rest of the kernel — `Point3D` uses metres but the sketcher uses
// millimetres internally so the constraint solver's tolerance
// (`DEFAULT_TOLERANCE_MM = 0.001`) is meaningful at the variable
// level.  Conversion to metres happens in the geometry-kernel
// adapter (the `ProfilePoint` type for `produceExtrude` is metres).

export type EntityId = string & { readonly __brand: 'SketchEntityId' };

export interface SketchPoint {
  readonly id: EntityId;
  readonly kind: 'point';
  /** Millimetres. */
  readonly x: number;
  /** Millimetres. */
  readonly z: number;
}

export interface SketchLine {
  readonly id: EntityId;
  readonly kind: 'line';
  /** Reference to a `SketchPoint` id. */
  readonly p1: EntityId;
  /** Reference to a `SketchPoint` id. */
  readonly p2: EntityId;
}

/** Full circle (S53 D1). Stored with a centre point reference + radius
 *  so the centre participates in the constraint-solver variable space. */
export interface SketchCircle {
  readonly id: EntityId;
  readonly kind: 'circle';
  readonly center: EntityId;
  /** Millimetres. */
  readonly radius: number;
}

/** Circular arc (S53 D1). `startAngle` and `endAngle` are radians,
 *  CCW from +X. The arc spans from start to end the short way unless
 *  `endAngle - startAngle` already encodes the long sweep. */
export interface SketchArc {
  readonly id: EntityId;
  readonly kind: 'arc';
  readonly center: EntityId;
  /** Millimetres. */
  readonly radius: number;
  readonly startAngle: number;
  readonly endAngle: number;
}

export type SketchEntity = SketchPoint | SketchLine | SketchCircle | SketchArc;
export type EntityKind = SketchEntity['kind'];

/** Build a typed entity-id.  Internal — the store owns the counter. */
export function makeEntityId(
  prefix: 'pt' | 'ln' | 'cir' | 'arc',
  counter: number,
): EntityId {
  return `${prefix}-${counter.toString(36)}` as EntityId;
}
