// view-template-bridge — connects the L4 ViewTemplate / view-resolution
// algorithm to the live PlanViewCanvasHost (post-2B closeout / ADR-0030).
//
// PROBLEM CLOSED
// ─────────────────────────────────────────────────────────────────────────────
// Pre-closeout, `packages/geometry-kernel/src/view-resolution/` was
// fully tested in isolation but no caller in `plugins/plan-view/`
// consumed it: `resolveElementInstructions` was dead code from the
// host's perspective.  This module is the small bridge that closes that
// loop so the host can ask the resolver "given this template + this
// snapshot of stores, which element ids are visible, halftoned, or
// hidden in the active view?" without the host owning the full L4
// algorithm import surface.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Pure: no DOM, no THREE, no Node-only globals.  Safe in tests.
// • Returns a small `ResolvedHostInstructions` value type the host can
//   stash and consult during its draw loop without re-resolving on every
//   pixel.  Re-resolution is on the caller's terms (typically once per
//   ViewTemplate change, or once per active-view change).

import {
  resolveElementInstructions,
  type ElementForView,
  type ElementRenderInstruction,
  type ResolvedViewRange,
} from '@pryzm/plugin-sdk';
import type { ViewTemplate } from '@pryzm/plugin-sdk';

export interface ResolvedHostInstructions {
  /** Element ids whose `instruction.visible` is `false` — the host
   *  removes these from the draw pass. */
  readonly hiddenIds: ReadonlySet<string>;
  /** Element ids whose `instruction.halftone` is `true` — the host
   *  draws these at 50% alpha (ADR-0023 §"Halftone"). */
  readonly halftoneIds: ReadonlySet<string>;
  /** Per-element resolved instruction (full record, indexed by id).
   *  Callers that want stroke / fill / classification details can read
   *  here; the convenience sets above are just the common-path
   *  shortcuts. */
  readonly byElementId: ReadonlyMap<string, ElementRenderInstruction>;
}

const EMPTY: ResolvedHostInstructions = Object.freeze({
  hiddenIds: new Set<string>(),
  halftoneIds: new Set<string>(),
  byElementId: new Map<string, ElementRenderInstruction>(),
});

const NO_ELEMENT_OVERRIDES: ReadonlyMap<string, never> = new Map();

/** Resolve an entire snapshot through a ViewTemplate.  When `template`
 *  is undefined ⇒ everything visible (the no-op default).  Pure. */
export function resolveSnapshotForView(
  template: ViewTemplate | undefined,
  elements: readonly ElementForView[],
  range: ResolvedViewRange,
): ResolvedHostInstructions {
  if (!template || elements.length === 0) return EMPTY;
  const instructions = resolveElementInstructions(
    elements,
    template,
    range,
    NO_ELEMENT_OVERRIDES,
  );
  const hiddenIds = new Set<string>();
  const halftoneIds = new Set<string>();
  const byElementId = new Map<string, ElementRenderInstruction>();
  for (const ins of instructions) {
    byElementId.set(ins.elementId, ins);
    if (!ins.visible) hiddenIds.add(ins.elementId);
    if (ins.halftone) halftoneIds.add(ins.elementId);
  }
  return { hiddenIds, halftoneIds, byElementId };
}
