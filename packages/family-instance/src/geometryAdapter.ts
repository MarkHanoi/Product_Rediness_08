// §4D-GEOMETRY-ADAPTER — the kernel boundary, as a PORT.
//
// ═══════════════════════════════════════════════════════════════════════════
// WHY
// ═══════════════════════════════════════════════════════════════════════════
// Spec §17–20 is explicit and this file is its execution:
//
//   *"The canonical model must NOT couple to one kernel:
//     `PRYZM canonical geometry → geometry adapter → kernel → exact geometry
//      → tessellation`; the kernel is an EVALUATOR."*
//
// Before this file, `bakeFamilyInstance` reached `@pryzm/geometry-kernel`
// directly out of a `switch (solid.kind)`.  That switch decided BOTH
// questions at once — *what does this document describe?* and *who evaluates
// it?* — so the second answer could never be changed, tested or refused
// independently of the first.  A staged kernel migration (the audit §7
// recommendation) would have had to rewrite the bake; a test wanting to prove
// the TRANSLATION correct had to run the real producers to do it.
//
// The two questions are now separated:
//   • the document-translation layer (`bakeFamilyInstance`) answers "what does
//     this document describe, and does it describe it COMPLETELY?";
//   • the `GeometryAdapter` answers "evaluate this".
//
// ═══════════════════════════════════════════════════════════════════════════
// §4D-CAPABILITY-BY-PRESENCE — how an adapter declares what it cannot do
// ═══════════════════════════════════════════════════════════════════════════
// Every capability is OPTIONAL.  An adapter that cannot evaluate a kind simply
// does not define the method, and the bake returns the existing structured
// `unsupported-feature` refusal NAMING THE ADAPTER.  This is C84 EI-6
// declared absence expressed in the type system rather than in a comment:
// there is no way to have a capability that silently substitutes another
// (spec §75), because the caller must find the method before it can call it.
//
// ⛔ NO NEW REFUSAL VOCABULARY (audit R1).  `UnsupportedSolid['reason']` keeps
//    its three existing values — `'unsupported-feature' | 'profile-eval-failed'
//    | 'invalid-length'`.  Those are the values a caller branches on; this
//    file adds none.
//
// ⚠ `boolean` IS DELIBERATELY ABSENT FROM THIS PORT, and the reason is not
//   that `produceBoolean` is missing — it exists, works, and has been on the
//   kernel's public surface since §WALL-SINGLE-VOLUME-CSG.  It is absent
//   because a boolean feature names two OTHER solids (`subjectSolidId`,
//   `toolSolidId`), so evaluating it requires a FEATURE-GRAPH ORDER: which
//   solids are consumed by a boolean and therefore must not also appear in the
//   output.  Lane 4B added `featureEdges[]` for exactly that and DECLARED IT
//   INERT (ADR-0376 D7 still OPEN).  ⛔ Wiring boolean over an undecided
//   evaluation order would pick the order by accident and freeze it — so the
//   bake refuses the kind, honestly, and the refusal names D7.

import {
  produceExtrude,
  produceSweep,
  produceLoft,
  produceRevolve,
  type BufferGeometryDescriptor,
  type ExtrudeOptions,
  type LoftOptions,
  type LoftSection,
  type Point3D,
  type ProfilePoint,
  type RevolveOptions,
  type RevolveProfilePoint,
  type SweepOptions,
  type SweepProfilePoint,
} from '@pryzm/geometry-kernel';

/**
 * The evaluator behind the adapter.
 *
 * Argument shapes are the KERNEL's, unchanged and un-renamed: an adapter
 * backed by a different evaluator (OCCT/WASM, a worker, a recording double)
 * implements the same four signatures.  Restating them in a local vocabulary
 * would mint a second spelling for one concept — C84 EI-9 — at precisely the
 * seam that exists to have only one.
 */
export interface GeometryAdapter {
  /** Stable identity of the evaluator, for provenance and for refusal text. */
  readonly id: string;
  readonly extrude?: (
    profile: readonly ProfilePoint[],
    heightM: number,
    options?: ExtrudeOptions,
  ) => BufferGeometryDescriptor;
  readonly sweep?: (
    profile: readonly SweepProfilePoint[],
    path: readonly Point3D[],
    options?: SweepOptions,
  ) => BufferGeometryDescriptor;
  readonly loft?: (
    sections: readonly LoftSection[],
    options?: LoftOptions,
  ) => BufferGeometryDescriptor;
  readonly revolve?: (
    profile: readonly RevolveProfilePoint[],
    options?: RevolveOptions,
  ) => BufferGeometryDescriptor;
}

/** The capabilities an adapter actually provides, in a stable order — used to
 *  make a refusal say what WOULD have worked instead of only what did not. */
export function adapterCapabilities(adapter: GeometryAdapter): readonly string[] {
  const out: string[] = [];
  if (adapter.extrude) out.push('extrude');
  if (adapter.sweep) out.push('sweep');
  if (adapter.loft) out.push('loft');
  if (adapter.revolve) out.push('revolve');
  return out;
}

/**
 * THE default adapter: `@pryzm/geometry-kernel`'s pure-TS producers.
 *
 * ⭐ All FOUR capabilities are provided, and that is a deliberate,
 *    measurable statement rather than optimism: `produceSweep`,
 *    `produceLoft` and `produceRevolve` are complete producers that have
 *    always worked when hand-fed, and lane 4D exports them from the kernel
 *    barrel so they can be constructed at all.  What stops a *document*
 *    reaching them is upstream of this file — see `§4D-SCHEMA-DELTA` in
 *    `bakeFamilyInstance.ts`.  ⛔ Do not read "the adapter provides sweep" as
 *    "the bake sweeps"; the port is complete and the document is not, and the
 *    honest place to keep the gap is where it actually is.
 */
export const kernelGeometryAdapter: GeometryAdapter = {
  id: '@pryzm/geometry-kernel',
  extrude: (profile, heightM, options) => produceExtrude(profile, heightM, options),
  sweep: (profile, path, options) => produceSweep(profile, path, options),
  loft: (sections, options) => produceLoft(sections, options),
  revolve: (profile, options) => produceRevolve(profile, options),
};
