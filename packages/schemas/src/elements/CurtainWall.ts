import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';
import { RetrofittedConfidenceSchema } from '../provenance/ElementConfidence.js';
import { Vec3 } from '../base/primitives.js';
import { CURTAIN_PANEL_KINDS } from './CurtainPanelVocabulary.js';

// §CW-2a / C87 §13.2 — DERIVED, NOT TRANSCRIBED. This was
// `z.enum(['glazed','spandrel','door','opaque'])`, one of FOUR independent
// hand-written copies of the same four members (C84 EI-9). It now reads the master
// in `./CurtainPanelVocabulary.js`, so a member added there cannot fail to appear
// here — which a comment could never guarantee (C84 EI-8a).
const PanelKind = z.enum(CURTAIN_PANEL_KINDS);

/**
 * Curtain wall — an extruded grid of mullions and panels along a baseline.
 */
const PanelRotation = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);

const CurtainPanel = z.object({
  id: z.string().min(1),
  row: z.number().int().nonnegative(),
  col: z.number().int().nonnegative(),
  kind: PanelKind.default('glazed'),
  materialId: z.string().optional(),
  /** Per-panel rotation in degrees (0/90/180/270). Mainly relevant
   *  for asymmetric panel kinds (e.g. door swing). Default 0. */
  rotation: PanelRotation.default(0),
});

export const CurtainWall = defineElement('curtainwall', {
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
  height: z.number().positive().default(3),
  /**
   * §FIX-CW-BRIDGE-AUTHORED-VALUES (L-972) — height of the wall's base above the
   * level datum, in metres. Signed: a spandrel-hung curtain wall sits above the
   * slab, a recessed one below it, so this is NOT `.positive()`.
   *
   * ⚠ ADDED BECAUSE ITS ABSENCE WAS BEING READ AS PRESENCE. `CurtainWallData`
   * (`geometry-curtain-wall/src/CurtainWallTypes.ts`) has always required it,
   * `UpdateAllCurtainWallsCommand` edits it, and the §P3.1-CW bridge tested
   * `typeof _cwEv['baseOffset'] === 'number'` — a guard that could never be true
   * while the field existed on neither this schema nor the event, so the default
   * always won and an authored offset could not take effect (C84 EI-2b).
   */
  baseOffset: z.number().default(0),
  /** Mullion thickness in metres. */
  mullionThickness: z.number().positive().default(0.05),
  /**
   * §FIX-CW-BRIDGE-AUTHORED-VALUES (L-972) — build thickness of a glazed panel /
   * frame depth of a framed panel, in metres. The second half of the same
   * defect as `baseOffset` above: required by `CurtainWallData`, printed by
   * `ScheduleExtractor.ts:366`, read AND written by the AI capability registry
   * (`ChatCapabilityRegistry.ts:1204`), and unrepresentable here until now.
   *
   * The default matches the §P3.1-CW mirror's fallback so the Immer record and
   * the legacy record cannot disagree about a wall nobody edited.
   */
  panelThickness: z.number().positive().default(0.05),
  /** Panel grid: vertical mullion spacing in metres. */
  bayWidth: z.number().positive().default(1.2),
  /** Panel grid: horizontal transom spacing in metres. */
  bayHeight: z.number().positive().default(1.5),
  panels: z.array(CurtainPanel).default([]),
  materialId: z.string().optional(),
}).refine(
  (cw) => new Set(cw.panels.map((p) => p.id)).size === cw.panels.length,
  { message: 'CurtainWall panel ids must be unique within a single curtain wall.' },
);

export type CurtainWall = z.infer<typeof CurtainWall>;
