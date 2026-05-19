import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { Vec3 } from '../base/primitives.js';

const ProjectUnits = z.enum(['metric', 'imperial']);

const Level = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Elevation above project zero, in metres. */
  elevation: z.number(),
  /** Floor-to-floor height in metres. */
  height: z.number().positive(),
});

const ProjectLocation = z.object({
  /** Decimal degrees; lat ∈ [-90, 90], lon ∈ [-180, 180]. */
  latitude: z.number().min(-90).max(90).default(0),
  longitude: z.number().min(-180).max(180).default(0),
  /** Project-zero elevation above sea level, in metres. */
  elevationAsl: z.number().default(0),
  /** True-north rotation about world Y in radians. */
  trueNorth: z.number().default(0),
  /** Project base point in world coordinates. */
  basePoint: Vec3.default({ x: 0, y: 0, z: 0 }),
});

/**
 * Project — top-level container holding levels, units, location, and a list
 * of view / sheet / schedule ids that compose the document set.
 */
export const Project = defineElement('project', {
  name: z.string().default('Untitled Project'),
  number: z.string().default(''),
  client: z.string().optional(),
  units: ProjectUnits.default('metric'),
  location: ProjectLocation.default(() => ProjectLocation.parse({})),
  levels: z.array(Level).default([
    { id: 'level_ground', name: 'Ground', elevation: 0, height: 3 },
  ]),
  /** Active view id when the project is opened. */
  activeViewId: z.string().optional(),
  /** Schema version of the persisted project; bumped on breaking changes. */
  schemaVersion: z.number().int().positive().default(1),
}).refine(
  (p) => {
    const ids = p.levels.map((l) => l.id);
    return new Set(ids).size === ids.length;
  },
  { message: 'Project levels must have unique ids.' },
);

export type Project = z.infer<typeof Project>;
