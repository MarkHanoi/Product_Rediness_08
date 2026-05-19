// section-cut-producer — re-export shim (W-09).
//
// The implementation moved to `packages/geometry-kernel/src/producers/
// section-cut.ts` per W-09 of `PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md`.
//
// This shim keeps in-tree callers compiling.  Deletion is gated to the S61
// legacy-shim cleanup pass (per `docs/architecture/adr/0031-s61-staged-
// legacy-deletion.md`).

export {
  produceSectionCut,
  type AabbForSection,
  type SectionCutResult,
  type SectionEdge2D,
  type SectionLine,
  type Vec2,
  type Vec3,
} from '@pryzm/plugin-sdk';
