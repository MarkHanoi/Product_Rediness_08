import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
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
