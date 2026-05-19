// plan-view-adapter — bridge AnnotationStore ⇒ plan-view renderer DTO (S34 / ADR-0026).
//
// Spec source:
//   • `phases/PHASE-2B-Q2-M16-M18-PLAN-VIEW.md` §S34 (lines 802–852).
//   • `plugins/plan-view/src/PlanViewCanvasHost.ts` §"PlanViewSourceStore"
//     and §"PlanViewAnnotationLike" — the consumer contract we satisfy.
//
// The plan-view canvas host already accepts an `annotationStore` of type
// `PlanViewSourceStore<PlanViewAnnotationLike>` (see PlanViewCanvasHost.ts
// line 141).  Our `AnnotationStore` (in `packages/stores/`) carries the
// canonical schema-level `Annotation` element.  This adapter is the
// single place those two vocabularies meet — it presents an
// `AnnotationStore` *as* a `PlanViewSourceStore<PlanViewAnnotationLike>`
// without copying state (the `getState()` Map is rebuilt lazily on each
// call; subscribers fan-out through the underlying store's `subscribeDirty`).
//
// Schema-kind ⇒ renderer-kind table (the "11→4 collapse"):
//   text-note      ⇒ 'text'
//   tag            ⇒ 'text'
//   keynote        ⇒ 'text'
//   level-tag      ⇒ 'text'
//   grid-bubble    ⇒ 'text'
//   callout        ⇒ 'callout'
//   section-mark   ⇒ 'leader'
//   elevation-mark ⇒ 'leader'
//   revision-cloud ⇒ 'region'
//   north-arrow    ⇒ 'region'
//   scale-bar      ⇒ 'region'
//
// The richer renderer fields (leaderPoints, calloutBoxWidth/Height,
// polygon, fillColor, …) are NOT yet carried by the canonical Annotation
// schema.  When a future schema extension lands, this adapter is the
// single file that needs to forward them — the layout pipeline already
// accepts them (annotation-renderer.ts §AnnotationDto).

import type { AnnotationData, AnnotationStore } from '@pryzm/plugin-sdk';

/** Mirrors `PlanViewSourceStore<T>` from `plugins/plan-view/src/PlanViewCanvasHost.ts`
 *  without taking a runtime dependency on plan-view. */
export interface PlanSourceStoreShape<T> {
  getState(): ReadonlyMap<string, T>;
  subscribeDirty(listener: () => void): () => void;
}

/** Mirrors `PlanViewAnnotationLike` from `plugins/plan-view/src/PlanViewCanvasHost.ts`.
 *  Re-declared (rather than imported) to keep the adapter free of a
 *  plan-view import — the two contracts live on either side of the L4
 *  boundary and only meet at the editor wiring layer. */
export interface PlanViewAnnotationLikeShape {
  readonly id: string;
  readonly viewId?: string;
  readonly levelId?: string;
  readonly anchor: { x: number; y?: number; z: number };
  readonly text: string;
  readonly rotation?: number;
  readonly textHeightMm?: number;
  readonly color?: string;
  readonly kind?: 'text' | 'leader' | 'callout' | 'region';
}

export type RendererKind = NonNullable<PlanViewAnnotationLikeShape['kind']>;

/** Schema kind ⇒ renderer kind.  Pure; `O(1)` lookup. */
export function rendererKindFor(schemaKind: AnnotationData['kind']): RendererKind {
  switch (schemaKind) {
    case 'text-note':
    case 'tag':
    case 'keynote':
    case 'level-tag':
    case 'grid-bubble':
      return 'text';
    case 'callout':
      return 'callout';
    case 'section-mark':
    case 'elevation-mark':
      return 'leader';
    case 'revision-cloud':
    case 'north-arrow':
    case 'scale-bar':
      return 'region';
  }
}

/** Pure projection: one schema annotation ⇒ one renderer-friendly DTO. */
export function toPlanViewAnnotationLike(a: AnnotationData): PlanViewAnnotationLikeShape {
  return {
    id: a.id,
    viewId: a.viewId,
    anchor: { x: a.anchor.x, y: a.anchor.y, z: a.anchor.z },
    text: a.text,
    rotation: a.rotation,
    textHeightMm: a.textHeightMm,
    color: a.color,
    kind: rendererKindFor(a.kind),
  };
}

/**
 * Wrap an `AnnotationStore` so it satisfies the `PlanViewSourceStore<
 * PlanViewAnnotationLike>` contract that `PlanViewCanvasHost` consumes.
 *
 * Identity: each call to `getState()` returns a freshly-built Map (the
 * underlying store is keyed by AnnotationId).  This is a deliberate
 * choice — the host iterates the Map once per dirty tick and we'd
 * otherwise need to maintain a parallel cache invalidated on every patch.
 * The cost is `O(N)` projection per dirty tick which is well within the
 * S34 perf budget (>55 fps with 1 000 annotations per spec line 851).
 */
export function bindAnnotationStoreToPlanView(
  annotationStore: AnnotationStore,
): PlanSourceStoreShape<PlanViewAnnotationLikeShape> {
  return {
    getState() {
      const out = new Map<string, PlanViewAnnotationLikeShape>();
      for (const [id, a] of annotationStore.getState()) {
        out.set(id, toPlanViewAnnotationLike(a));
      }
      return out;
    },
    subscribeDirty(listener: () => void) {
      // The underlying store's listener takes (diff, state); we only
      // need the void-arg signal so we wrap.
      return annotationStore.subscribeDirty(() => listener());
    },
  };
}
