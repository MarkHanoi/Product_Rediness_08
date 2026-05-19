// AnnotationStore — pure DTO store for annotation elements (S34 / ADR-0026).
//
// Wave 12 recipe completion: annotations plugin store.ts (previously missing).
//
// Annotations are view-scoped: each annotation belongs to exactly one
// viewId (plan, section, sheet, or 3D view). The store is indexed by
// annotation id for O(1) lookup and provides a byView() filter for the
// renderer.
//
// All imports from @pryzm/plugin-sdk only (L8 boundary rule).

import { Store } from '@pryzm/plugin-sdk';

export interface AnnotationData {
  readonly id: string;
  readonly viewId: string;
  /** Schema-level kind — 11-value enum; see intent.ANNOTATION_KINDS. */
  readonly kind: string;
  readonly anchor: { readonly x: number; readonly y: number; readonly z: number };
  readonly text?: string;
  readonly textHeightMm?: number;
  /** Arbitrary style overrides (colour, font, etc). */
  readonly style?: Record<string, unknown>;
}

export type AnnotationId = string;
export type AnnotationsState = Record<string, AnnotationData>;

/**
 * AnnotationStore holds all annotation DTOs for the current project.
 *
 * Handlers read ctx.stores.annotation (typed to this class) and
 * return forward/inverse patches via produceCommand().
 */
export class AnnotationStore extends Store<AnnotationData> {
  constructor() {
    super('annotation');
  }

  /** All annotation ids in insertion order. */
  ids(): readonly string[] {
    return [...this.state.keys()];
  }

  /** O(1) single annotation lookup. */
  get(id: string): Readonly<AnnotationData> | undefined {
    return this.state.get(id);
  }

  /** All annotations belonging to the given view. */
  byView(viewId: string): readonly AnnotationData[] {
    const out: AnnotationData[] = [];
    for (const a of this.state.values()) {
      if (a.viewId === viewId) out.push(a);
    }
    return out;
  }

  /** All annotations of the given kind, across all views. */
  byKind(kind: string): readonly AnnotationData[] {
    const out: AnnotationData[] = [];
    for (const a of this.state.values()) {
      if (a.kind === kind) out.push(a);
    }
    return out;
  }
}
