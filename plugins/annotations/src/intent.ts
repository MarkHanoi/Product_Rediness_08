// Annotation intent helpers (S34 / ADR-0026).
//
// `ANNOTATION_KINDS` is the schema-level kind enum (11 kinds — matches
// `packages/schemas/elements/Annotation.ts`).  The renderer-level DTO uses
// a coarser 4-type discriminant (`text` | `leader` | `callout` | `region`)
// which lives in `plugins/plan-view/src/annotation-renderer.ts`; the
// plan-view adapter (`plan-view-adapter.ts`) is the only place the two
// vocabularies meet.

interface Vec3Like { readonly x: number; readonly y: number; readonly z: number }

export function isFiniteVec3(p: Vec3Like | undefined | null): p is Vec3Like {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

export const ANNOTATION_KINDS = [
  'text-note',
  'tag',
  'callout',
  'revision-cloud',
  'keynote',
  'elevation-mark',
  'section-mark',
  'level-tag',
  'grid-bubble',
  'north-arrow',
  'scale-bar',
] as const;
export type AnnotationKindLiteral = (typeof ANNOTATION_KINDS)[number];

export function isAnnotationKind(s: unknown): s is AnnotationKindLiteral {
  return typeof s === 'string' && (ANNOTATION_KINDS as readonly string[]).includes(s);
}

/** Schema-level field bound: `Annotation.refine` rejects values >100 mm
 *  (catches unit-confusion bugs).  Handlers that mutate `textHeightMm`
 *  validate against this bound up-front so the failure mode is the same
 *  as `Annotation.parse`. */
export const ANNOTATION_TEXT_HEIGHT_MAX_MM = 100;
