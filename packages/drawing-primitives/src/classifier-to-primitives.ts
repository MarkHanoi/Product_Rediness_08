// classifier-to-primitives — pure adapter (post-2B closeout / ADR-0029).
//
// Bridges the L4 kernel classifier output (`ClassifiedEdge[]` from
// `packages/geometry-kernel/src/edge-projection.ts`) into a
// `PrimitiveStream` consumed by backends.  Pure function; no DOM, no
// THREE, no Node-only globals.
//
// Re-declares the input shape locally so this package does not need a
// runtime import of the kernel (boundaries plugin allows L4 ↔ L4 but
// this keeps the dependency graph one-way).

import type {
  Primitive,
  PrimitiveStream,
  Stroke,
  Fill,
  Vec2,
} from './types.js';

export interface ClassifiedEdgeShape {
  /** 2D start point in canvas CSS pixels. */
  readonly a: Vec2;
  /** 2D end point in canvas CSS pixels. */
  readonly b: Vec2;
  /** What the classifier called this edge — drives stroke styling. */
  readonly classification: 'cut' | 'projection' | 'beyond' | 'hidden';
  /** Caller-side override (e.g. per-element style resolution result). */
  readonly strokeOverride?: Stroke;
}

export interface PocheFillShape {
  readonly outer: readonly Vec2[];
  readonly holes?: readonly (readonly Vec2[])[];
  readonly fillColor: string;
  readonly hatchName?: string;
}

export interface ClassifierToPrimitivesInput {
  readonly edges: readonly ClassifiedEdgeShape[];
  readonly pocheFills: readonly PocheFillShape[];
  /** Default stroke per classification — back-stop when no override. */
  readonly defaultStrokes?: Partial<Record<ClassifiedEdgeShape['classification'], Stroke>>;
}

const DEFAULT_STROKES: Record<ClassifiedEdgeShape['classification'], Stroke> = {
  cut:        { color: '#000000', weight: 1.5 },
  projection: { color: '#000000', weight: 0.5 },
  beyond:     { color: '#888888', weight: 0.25, dash: 'dashed' },
  hidden:     { color: '#aaaaaa', weight: 0.25, dash: 'dotted' },
};

/**
 * Pure transformation: classifier output ⇒ primitive stream.
 * Iteration order matches input order (poche fills first so subsequent
 * line strokes draw on top — backend painters honour this).
 */
export function* classifierToPrimitives(input: ClassifierToPrimitivesInput): PrimitiveStream {
  // Poche fills first (painter's algorithm).
  for (const f of input.pocheFills) {
    const fill: Fill = { color: f.fillColor, hatch: f.hatchName };
    yield {
      kind: 'polygon',
      outer: f.outer,
      holes: f.holes,
      fill,
    };
  }

  // Then edge strokes.
  for (const e of input.edges) {
    const stroke = e.strokeOverride
      ?? input.defaultStrokes?.[e.classification]
      ?? DEFAULT_STROKES[e.classification];
    const out: Primitive = { kind: 'line', a: e.a, b: e.b, stroke };
    yield out;
  }
}
