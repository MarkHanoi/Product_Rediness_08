import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';
import { RetrofittedConfidenceSchema } from '../provenance/ElementConfidence.js';
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
  /**
   * PV-06 / C75 §1.3 — how much this element's values can be TRUSTED. A
   * separate axis from `provenance`: that says where a value came from, this
   * says how sure we are of it, and C75 §1.2 forbids merging axes.
   *
   * ⚠ `RetrofittedConfidenceSchema`, spelled out at every kind rather than
   * spread from a shared constant or folded into `BaseNodeShape` — the same
   * instruction `RetrofittedProvenanceSchema` carries above, for the same
   * measured reason. Optional with an UNKNOWN-with-reason default, so a
   * record written before this field existed parses unchanged and lands on
   * `pending-implementation` — never on a tier, never on `score: 0`.
   *
   * The vocabulary is C62's (`site/metadata/DataConfidence.ts`, ADR-0280),
   * REUSED not reinvented: PV-06 says C62 owns confidence (§4.h).
   */
  confidence: RetrofittedConfidenceSchema,
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
