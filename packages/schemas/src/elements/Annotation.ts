import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
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
