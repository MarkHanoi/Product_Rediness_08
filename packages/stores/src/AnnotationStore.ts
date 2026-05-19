// AnnotationStore — pure DTO store for annotation elements (S34 / ADR-0026).
//
// Spec source:
//   • `docs/00_NEW_ARCHITECTURE/phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md`
//     §S34 (lines 802–852) — "Annotations Migration (General, All Views)".
//   • Track A allocation table line 78: this file lives in `packages/stores/`
//     (not in the plugin) so multiple plugins / views can read it without
//     importing the L4 annotations plugin.  The handlers + tool + plan-view
//     adapter live in `plugins/annotations/`.
//
// Mirrors `DimensionStore` (S29) — Map-based, applyPatch-only, dirty diffs.
// Selectors: `byView`, `byHostElement`.  `byLevel` is intentionally omitted
// because the canonical `Annotation` schema (`packages/schemas/elements/
// Annotation.ts`) does not carry `levelId`; level scoping is derived by the
// plan-view adapter from the view registry.

import { Store } from './Store.js';
import type { Annotation as AnnotationSchemaInfer } from '@pryzm/schemas';

export type AnnotationData = AnnotationSchemaInfer;
export type AnnotationId = AnnotationData['id'];
export type AnnotationsState = Record<string, AnnotationData>;

export class AnnotationStore extends Store<AnnotationData> {
  constructor() { super('annotation'); }

  ids(): readonly string[] { return [...this.state.keys()]; }

  byView(viewId: string): readonly AnnotationData[] {
    const out: AnnotationData[] = [];
    for (const a of this.state.values()) if (a.viewId === viewId) out.push(a);
    return out;
  }

  byHostElement(hostElementId: string): readonly AnnotationData[] {
    const out: AnnotationData[] = [];
    for (const a of this.state.values()) if (a.hostElementId === hostElementId) out.push(a);
    return out;
  }

  get(id: string): Readonly<AnnotationData> | undefined { return this.state.get(id); }
}
