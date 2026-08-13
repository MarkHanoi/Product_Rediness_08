import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';
import { Vec3 } from '../base/primitives.js';

const AnnotationKind = z.enum([
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
]);

/**
 * 2D annotation — text, tag, or graphic, anchored to a view or element.
 */
export const Annotation = defineElement('annotation', {
  /**
   * PV-04 / C75 §2.4 — where this element's values came from: one of the five
   * (`ValueOrigin.ts`, which owns the vocabulary and is never restated here),
   * or an explicit unknown carrying its reason.
   *
   * ⚠ `RetrofittedProvenanceSchema`, spelled out at every kind rather than
   * spread from a shared constant or folded into `BaseNodeShape`, and that is
   * deliberate twice over. C75 §2.5 requires optional-with-an-UNKNOWN-default so
   * a snapshot written before this field existed parses unchanged and lands on
   * `predates-provenance` — never on a member of the five (§2.1 and §2.5 are the
   * same rule). And `check-provenance-coverage` measures the file that declares
   * `defineElement('<kind>')`: an indirection hides the field from the C3
   * retrofit-safety arm, so coverage you cannot see at the point of use is the
   * §4.d defect in a new place.
   */
  provenance: RetrofittedProvenanceSchema,
  /** Owning view id (annotations live on views, not on world). */
  viewId: z.string().default(''),
  kind: AnnotationKind.default('text-note'),
  /** Anchor in the view's local coordinate space. */
  anchor: Vec3.default({ x: 0, y: 0, z: 0 }),
  /** Optional element id this annotation references. */
  hostElementId: z.string().optional(),
  text: z.string().default(''),
  /** Text rotation in radians. */
  rotation: z.number().default(0),
  /** Text height in millimetres at sheet scale. */
  textHeightMm: z.number().positive().default(2.5),
  color: z.string().optional(),
}).refine(
  (a) => a.textHeightMm <= 100,
  { message: 'Annotation textHeightMm must be ≤ 100 mm at sheet scale (catches unit-confusion bugs).' },
);

export type Annotation = z.infer<typeof Annotation>;
