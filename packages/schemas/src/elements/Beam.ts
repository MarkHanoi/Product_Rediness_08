import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';
import { RetrofittedConfidenceSchema } from '../provenance/ElementConfidence.js';
import { Vec3 } from '../base/primitives.js';

const BeamShape = z.enum(['rectangular', 'i-section', 't-section']);

/**
 * Structural beam — extrusion of a profile along a baseline.
 */
export const Beam = defineElement('beam', {
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
  levelId: z.string().default(''),
  baseLine: z.tuple([Vec3, Vec3]).default([
    { x: 0, y: 0, z: 0 },
    { x: 4, y: 0, z: 0 },
  ]),
  shape: BeamShape.default('rectangular'),
  width: z.number().positive().default(0.2),
  depth: z.number().positive().default(0.4),
  /** Rotation of the profile about the beam axis, in radians. */
  rotation: z.number().default(0),
  materialId: z.string().optional(),
  /**
   * §FIX-BEAM-CEB-STEEL (L-974 · C84 EI-2a) — is this beam part of the
   * load-bearing structure?
   *
   * ⚠ ADDED BECAUSE ITS ABSENCE WAS A SILENT DOWNGRADE, NOT A GAP. Legacy
   * `BeamData.loadBearing` is REQUIRED (`core-app-model/src/stores/BeamTypes.ts:18`),
   * `CreateBeamCommand.ts:190` writes `input.loadBearing ?? true`, and
   * `CopyPlanToolHandler.ts:450` sends it on `beam.create` — where `Beam.parse`
   * stripped it as an unknown key, so the bus path could not carry what every
   * other path did. The field is READ, and by consumers that matter:
   * `BeamReader.ts:23` exports it as the IFC `LoadBearing` pset,
   * `ScheduleExtractor.ts:414` prints it Yes/No on the beam schedule, and
   * `RuleEngine.ts:1005` filters `loadBearing === true && !fireRating` for a
   * fire-rating check.
   *
   * Defaults to `true` to match `CreateBeamCommand`'s `?? true` exactly — a
   * structural element is structural unless someone says otherwise (C79 §7.4:
   * per-path divergence is worse than uniform absence).
   */
  loadBearing: z.boolean().default(true),
  /**
   * §FIX-BEAM-CEB-STEEL (L-974) — fire-resistance rating (e.g. `"R60"`), free
   * text because the vocabulary is jurisdictional. Optional: an unrated beam
   * states nothing rather than claiming a rating of `""`.
   * `RuleEngine.ts:1005` treats its ABSENCE as the failing condition, so an
   * empty string here would silence a compliance check.
   */
  fireRating: z.string().optional(),
  /**
   * §FIX-BEAM-CEB-STEEL (L-974) — the standard steel section this beam is
   * built from, by name (e.g. `"254x146x37"`); must match a member of
   * `SteelProfileLibrary`.
   *
   * Meaningful only alongside `shape: 'i-section'`, and NOT enforced by a
   * `.refine()` here on purpose: a `.refine()` would reject a record written
   * before this field existed whose shape was later hand-edited, and C75 §2.5's
   * retrofit rule applies to every added field, not only provenance. The
   * pairing IS enforced where it has a consequence — the legacy mirror refuses
   * an I-section with no profile name by name (`beamCreatedMirror.ts`), because
   * `BeamFragmentBuilder.ts:253` cannot build the steel branch without one and
   * would silently draw a box instead.
   */
  steelProfileName: z.string().optional(),
}).refine(
  (b) => {
    const [a, c] = b.baseLine;
    return a.x !== c.x || a.y !== c.y || a.z !== c.z;
  },
  { message: 'Beam baseLine endpoints must differ (zero-length beam not allowed).' },
);

export type Beam = z.infer<typeof Beam>;
