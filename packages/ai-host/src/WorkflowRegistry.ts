// @pryzm/ai-host — WorkflowRegistry (S49 D2).
//
// Spec source: `phases/PHASE-3A-Q1-M25-M27-AI-VISIBILITY-COMPLETE.md`
// §S49 lines 125-132 — registry exposes workflows to:
//   - the editor's command palette (L7)
//   - the public AI API (S53) at L7.5/api boundary
//   - third-party plugins (3B) via the descriptor schema.
//
// PURE module — no DOM, no THREE, no React. Bake-worker safe.

import type {
  WorkflowDescriptor,
  WorkflowImpl,
  WorkflowRegistryEntry,
} from './types.js';

/** Registry of workflows the AiPlane knows about. Each workflow is
 *  registered once with its descriptor (metadata) + impl
 *  (executable). The registry is the public discovery surface for
 *  L7.5: the editor command palette enumerates `list()`; the public
 *  AI API surfaces `descriptor` JSON. */
export class WorkflowRegistry {
  private readonly map = new Map<string, WorkflowRegistryEntry>();

  /** Register a workflow. Throws if `descriptor.id` is already taken
   *  (collision is loud, not silent). */
  register(descriptor: WorkflowDescriptor, impl: WorkflowImpl): void {
    if (this.map.has(descriptor.id)) {
      throw new Error(`[ai-host/WorkflowRegistry] '${descriptor.id}' is already registered.`);
    }
    if (!isValidDescriptor(descriptor)) {
      throw new Error(`[ai-host/WorkflowRegistry] descriptor for '${descriptor.id}' is invalid.`);
    }
    this.map.set(descriptor.id, Object.freeze({ descriptor, impl }));
  }

  /** Get a workflow entry by id. */
  get(id: string): WorkflowRegistryEntry | undefined {
    return this.map.get(id);
  }

  /** True iff a workflow with this id is registered. */
  has(id: string): boolean { return this.map.has(id); }

  /** Snapshot of all registered descriptors, in registration order.
   *  Excludes the impl so the snapshot is safe to serialise to the
   *  public AI API. */
  list(): readonly WorkflowDescriptor[] {
    const out: WorkflowDescriptor[] = [];
    for (const entry of this.map.values()) out.push(entry.descriptor);
    return out;
  }

  /** Total registered workflows — diagnostic. */
  size(): number { return this.map.size; }

  /** Test-only — clears the registry. */
  _clear(): void { this.map.clear(); }
}

/** Sanity-check on a descriptor. Keeps the public API loud about
 *  obviously-broken inputs without pulling in zod for one schema. */
function isValidDescriptor(d: WorkflowDescriptor): boolean {
  if (typeof d.id !== 'string' || d.id.length === 0) return false;
  if (typeof d.title !== 'string' || d.title.length === 0) return false;
  if (typeof d.kind !== 'string' || d.kind.length === 0) return false;
  if (typeof d.estimatedCostUsd !== 'number' || d.estimatedCostUsd < 0) return false;
  if (d.estimatedCostUsd > 0.18) return false; // SPEC-28 §3 per-call ceiling
  return true;
}
