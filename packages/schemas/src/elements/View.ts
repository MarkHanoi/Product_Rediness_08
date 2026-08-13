import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';
import { Vec3 } from '../base/primitives.js';

const ViewKind = z.enum([
  'plan',
  'rcp',
  'section',
  'elevation',
  '3d',
  'detail',
  'drafting',
]);

const CameraProjection = z.enum(['perspective', 'orthographic']);

const Camera = z.object({
  projection: CameraProjection.default('perspective'),
  position: Vec3.default({ x: 0, y: 10, z: 10 }),
  target: Vec3.default({ x: 0, y: 0, z: 0 }),
  up: Vec3.default({ x: 0, y: 1, z: 0 }),
  /** Vertical FOV in radians (perspective). */
  fov: z.number().positive().default(0.785),
  /** Half-width of the orthographic frustum in metres. */
  orthoHalfSize: z.number().positive().default(10),
  near: z.number().positive().default(0.1),
  far: z.number().positive().default(1000),
});

const SectionPlane = z.object({
  origin: Vec3,
  normal: Vec3,
});

/**
 * View — a named, reusable visualization of the model. Plan/section/3D etc.
 */
export const View = defineElement('view', {
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
  name: z.string().default('Untitled View'),
  kind: ViewKind.default('plan'),
  /** Owning level id for plan / RCP views; empty for 3D / drafting. */
  levelId: z.string().default(''),
  scale: z.number().positive().default(0.02),
  /** Cut plane (e.g. plan view cut height). */
  cutPlane: SectionPlane.optional(),
  camera: Camera.default(() => Camera.parse({})),
  /** Visibility-Intent ruleset id; empty → default rules. */
  visibilityRulesetId: z.string().default(''),
}).refine(
  (v) => v.camera.near < v.camera.far,
  { message: 'View camera.near must be strictly less than camera.far.' },
);

export type View = z.infer<typeof View>;
