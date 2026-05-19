// Hidden-line classifier types (post-2B closeout / ADR-0030).
//
// Spec source:
//   • `11-GAP-CLOSURE-PLAN.md` §2.4 #27 — "Hidden-line classifier;
//     WebGL2 first, WebGPU compute later" via SPEC-30 §3.2 + ADR-025
//     Part E for S35.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// L4 — pure: no THREE, no DOM, no Node-only globals.  CPU implementation
// only at S35-bis; WebGL2 occlusion query lights up at S37 (target);
// WebGPU compute is post-GA.
//
// The classifier answers "for this projected edge, given a depth buffer of
// other edges, is it visible or hidden?"  The S35-bis impl is a basic
// painter's-algorithm Z-cut: edges entirely behind the cut plane are
// `'hidden'`; edges entirely in front of any opaque-fill polygon at the
// same screen position are `'occluded'`; otherwise `'visible'`.

import type { Vec2 } from '@pryzm/drawing-primitives';

export interface ProjectedEdge {
  readonly a: Vec2;
  readonly b: Vec2;
  /** World-Z of the front-most point of the source edge (for sort). */
  readonly worldZFront: number;
  /** World-Z of the back-most point of the source edge. */
  readonly worldZBack: number;
}

export interface OccluderPolygon {
  /** Outer ring in canvas CSS pixels. */
  readonly outer: readonly Vec2[];
  /** World-Z plane of the polygon (it's an XY-plane fill projected once). */
  readonly worldZ: number;
}

export type HiddenLineClassification = 'visible' | 'occluded' | 'hidden';

export interface ClassifiedHiddenLineEdge {
  readonly a: Vec2;
  readonly b: Vec2;
  readonly classification: HiddenLineClassification;
}

export interface HiddenLineClassifierInput {
  readonly edges: readonly ProjectedEdge[];
  readonly occluders: readonly OccluderPolygon[];
  /** Cut-plane Z (world units).  Edges entirely behind ⇒ `'hidden'`. */
  readonly cutPlaneZ: number;
}
