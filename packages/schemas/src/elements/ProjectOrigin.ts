import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';
import { RetrofittedConfidenceSchema } from '../provenance/ElementConfidence.js';
import { Vec3 } from '../base/primitives.js';

/**
 * §FEAT-PROJECT-ORIGIN (L-109) — Project Origin / Base Point.
 *
 * A Revit-style **Project Base Point**: the single, always-present coordination
 * datum for the whole project, visualised in the editor as an always-on BLUE
 * SPHERE at the project origin. It marks the model-coordination / collaboration
 * centre and is the **shared-coordinate origin** — semantically the C19 §1.3
 * LTP-ENU / ADR-0115 "project base point" (see `SiteLocation.basePoint`).
 *
 * SINGLETON: exactly ONE per project. It is a system-seeded element (auto-created
 * once per project at world origin, never user-drawn), so it is NOT part of the
 * C17 batch-creation catalogue — it has no "place N of these" gesture.
 *
 * PURE (C03 / P5): no THREE, no DOM, no I/O. The blue-sphere marker lives in
 * `packages/renderer-three` (P2); this schema carries only data.
 */
export const ProjectOrigin = defineElement('projectOrigin', {
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
  /**
   * The datum position in world/scene space. Defaults to the world origin
   * `{0,0,0}` — the shared-coordinate origin. Editable = repositioning the
   * shared-coordinate datum (via the `projectOrigin.setPosition` command, P6).
   */
  position: Vec3.default({ x: 0, y: 0, z: 0 }),
  /**
   * View-Intent visibility for the origin category. Defaults to `true` (the
   * marker is shown by default). Toggled ON/OFF from the View Intent settings
   * like any element (P7) via the `projectOrigin.setVisible` command.
   */
  visible: z.boolean().default(true),
  /** Human-readable label shown in panels/inspectors. */
  label: z.string().default('Project Base Point'),
});

export type ProjectOrigin = z.infer<typeof ProjectOrigin>;
