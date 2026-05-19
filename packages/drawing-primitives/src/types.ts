// Vector primitive set (post-2B closeout / ADR-0029).
//
// Spec: SPEC-29 §3 — 6 primitive kinds (line / polyline / polygon / arc /
// text / hatch) + a stroke + an optional fill.  All coordinates are in
// CSS pixels (canvas-space) per ADR-0024 §"Coordinate conventions".
//
// PURE: no DOM, no THREE, no Node-only globals.

export interface Vec2 { readonly x: number; readonly y: number }

export type DashStyle = 'solid' | 'dashed' | 'dotted' | 'centerline' | 'phantom';

export interface Stroke {
  /** CSS hex colour or 'transparent'. */
  readonly color: string;
  /** Pen weight in canvas CSS pixels (NOT mm — backends scale at draw time). */
  readonly weight: number;
  readonly dash?: DashStyle;
}

export interface Fill {
  readonly color: string;
  /** Predefined hatch name (per SPEC-04 hatch catalog).  Undefined ⇒ solid fill. */
  readonly hatch?: string;
  /** 0–1 alpha; default 1. */
  readonly opacity?: number;
}

// ── 6 primitive kinds (discriminated union) ────────────────────────────────

export interface LinePrimitive {
  readonly kind: 'line';
  readonly a: Vec2;
  readonly b: Vec2;
  readonly stroke: Stroke;
}

export interface PolylinePrimitive {
  readonly kind: 'polyline';
  readonly points: readonly Vec2[];
  readonly stroke: Stroke;
}

export interface PolygonPrimitive {
  readonly kind: 'polygon';
  readonly outer: readonly Vec2[];
  readonly holes?: readonly (readonly Vec2[])[];
  readonly stroke?: Stroke;
  readonly fill?: Fill;
}

export interface ArcPrimitive {
  readonly kind: 'arc';
  readonly center: Vec2;
  readonly radius: number;
  /** Radians, 0 = +x axis, CCW positive. */
  readonly startAngle: number;
  readonly endAngle: number;
  readonly stroke: Stroke;
}

export interface TextPrimitive {
  readonly kind: 'text';
  readonly anchor: Vec2;
  readonly text: string;
  /** Font size in canvas CSS pixels. */
  readonly fontSizePx: number;
  /** Optional rotation in radians (clockwise positive in screen space). */
  readonly rotation?: number;
  readonly fill: Fill;
  readonly fontFamily?: string;
  readonly textAlign?: 'left' | 'center' | 'right';
  readonly textBaseline?: 'top' | 'middle' | 'bottom' | 'alphabetic';
}

export interface HatchPrimitive {
  readonly kind: 'hatch';
  /** Polygon outline that bounds the hatch. */
  readonly outer: readonly Vec2[];
  readonly holes?: readonly (readonly Vec2[])[];
  /** Hatch pattern name (concrete / brick / wood / cross / sand / earth …). */
  readonly pattern: string;
  readonly stroke: Stroke;
  /** Hatch line spacing in canvas CSS pixels. */
  readonly spacingPx: number;
  /** Hatch line angle in radians. */
  readonly angle: number;
}

export type Primitive =
  | LinePrimitive
  | PolylinePrimitive
  | PolygonPrimitive
  | ArcPrimitive
  | TextPrimitive
  | HatchPrimitive;

/** A read-only stream of primitives.  Backends consume in iteration order. */
export type PrimitiveStream = Iterable<Primitive>;

// ── Backend contract ───────────────────────────────────────────────────────

export interface BackendRenderOptions {
  /** Canvas / page width in CSS pixels. */
  readonly widthPx: number;
  /** Canvas / page height in CSS pixels. */
  readonly heightPx: number;
  /** Background fill (CSS colour) or undefined for transparent. */
  readonly background?: string;
}

export interface PrimitiveBackend<TOutput> {
  readonly id: string;
  render(stream: PrimitiveStream, options: BackendRenderOptions): TOutput;
}

export class BackendNotImplementedError extends Error {
  constructor(public readonly backendId: string, public readonly sprintMarker: string) {
    super(`[drawing-primitives] backend "${backendId}" is a typed stub — full impl scheduled for ${sprintMarker} (ADR-0029).`);
    this.name = 'BackendNotImplementedError';
  }
}
