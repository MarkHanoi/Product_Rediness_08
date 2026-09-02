// §COMPONENT-RENDER — the two ports the committer needs and REFUSES to invent.
// audit §12 Phase 4E · ADR-0376 D10 · C84 EI-6 · spec §75.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ BOTH SHAPES ARE STRUCTURAL, AND THAT IS A DELIBERATE CHOICE, NOT LAZINESS.
// ═══════════════════════════════════════════════════════════════════════════════
//
// `bakeFamilyInstance` lives in `@pryzm/family-instance` and the family document
// lives in `@pryzm/file-format`. Declaring those as dependencies of THIS package
// would put a document-format edge on a render-side leaf, and lane 4D already set
// the precedent for the alternative: its own `FamilyInput` is *"kept structurally
// typed so this package does not depend on the loader."* The same reasoning
// applies one layer further out, so the same choice is made.
//
// The consequence is worth stating plainly: this file cannot go stale against a
// SIGNATURE change in 4D's bake, because TypeScript checks the injected function
// at the WIRING site, where the real `bakeFamilyInstance` and this port meet.
//
// ⛔ NEITHER PORT HAS A DEFAULT. There is no `?? kernelGeometryAdapter`, no
//    `?? emptyDefinitionRegistry`, no built-in stub. A committer that could
//    manufacture its own definition source would be able to render something for
//    a definitionId that names nothing — which is precisely the demo-only geometry
//    spec §75 forbids, and it is how [[fake-more-capable-than-real]] happens: a
//    fake built from the header cannot falsify the header.

import type { BufferGeometryDescriptor } from '@pryzm/plugin-sdk';

/** One solid the bake produced — structural mirror of 4D's `BakedSolid`. */
export interface BakedSolidLike {
  readonly solidId: string;
  readonly descriptor: BufferGeometryDescriptor;
}

/** One solid the bake REFUSED — structural mirror of 4D's `UnsupportedSolid`.
 *
 *  ⭐ Carried through to the committer on purpose. A family whose only solid is a
 *  `sweep` bakes to ZERO geometry, and the visible result of that is identical to
 *  a family that rendered nothing because the store was empty. Keeping the reason
 *  reachable at the render seam is what stops those two being the same value
 *  ([[context-data-honesty-family]]). */
export interface UnsupportedSolidLike {
  readonly solidId: string;
  readonly reason: string;
  readonly message: string;
}

/** Structural mirror of 4D's `BakeFamilyInstanceResult`. */
export interface BakeResultLike {
  readonly ok: boolean;
  readonly baked: readonly BakedSolidLike[];
  readonly unsupported: readonly UnsupportedSolidLike[];
}

/**
 * ⭐ THE BAKE PORT — `(definitionId, typeId, instanceOverrides) → geometry`.
 *
 * The overrides argument is the occurrence's `instanceParameters` map passed
 * STRAIGHT THROUGH. The committer neither merges it with the type's values nor
 * caches the result: `resolveParameter()` inside the bake is the one resolver
 * (ADR-0376 D4's ladder), and a second merge here would be a second answer to
 * "what is this instance's width" — C84 EI-9 at the render seam.
 *
 * ⚠ ASYNC, AND THE ASYNC IS NOT INCIDENTAL TO THIS FILE even though it is
 *   incidental to 4D: `bakeFamilyInstance` computes synchronously and is a
 *   `Promise` only because `tracer.startActiveSpan` wraps it. `PrimitiveCommitter`
 *   is SYNCHRONOUS at every one of its four methods. That mismatch is a real
 *   property of the descriptor path and it is handled in `ComponentCommitter`,
 *   not hidden here — see §COMPONENT-RENDER-ASYNC-SEAM.
 */
export type BakeComponentInstance = (input: {
  readonly definitionId: string;
  readonly typeId: string;
  readonly instanceOverrides: Readonly<Record<string, number | string | boolean>>;
}) => Promise<BakeResultLike>;

/**
 * ⭐ THE DEFINITION-RESOLUTION PORT — and the honest name for a gap.
 *
 * ⛔ THERE IS NO PROJECT-LEVEL COMPONENT-DEFINITION REGISTRY IN THIS REPOSITORY.
 *    Lane 4C measured it and declared it (its ARM-3 note: *"there is no
 *    project-level definition registry at this commit"*), and this lane did not
 *    build one — building one to make a render work would be a rival to whatever
 *    the real registry turns out to be, decided by a rendering lane, which is
 *    exactly the R1 shape.
 *
 * So the committer ASKS, and a wiring that has no answer says so. `false` is a
 * first-class result and it is rendered as an ABSENCE with a warning, never as a
 * substitute box.
 */
export interface ComponentDefinitionSource {
  /** Is a definition document available for this id? */
  has(definitionId: string): boolean;
}
