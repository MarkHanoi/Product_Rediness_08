/**
 * ConstructionSequence — 4D. The ORDER a building is built in, derived from the
 * model; and the DURATION it still refuses to invent.
 *
 * Layer:    L2 — packages/core-app-model
 * Contract: C66 §1.1 (a figure that has not been measured is a CLAIM — applied
 *           here to durations), C03 (read model; mutates nothing, no undo entry).
 * ADR:      ADR-0351 §4D, **AMENDED IN PLACE by ADR-0353 §3**. Read that
 *           amendment before changing anything here: this module exists because
 *           a founder ruling reversed part of a written refusal, and the half
 *           that was NOT reversed is still binding.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ WHAT WAS REVERSED, AND — MORE IMPORTANTLY — WHAT WAS NOT
 * ═════════════════════════════════════════════════════════════════════════════
 * The 4D panel said, in words:
 *
 *   > "PRYZM ships no output rates and computes no duration from a quantity — a
 *   >  productivity figure it cannot cite would make this look like a programme
 *   >  while being a drawing."
 *
 * Founder, 2026-08-22: *"based on pure construction knowledge that you have, you
 * know how a project starts being built — so you could create an algorithm that
 * checks the elements, levels and constructability, and based on this we should
 * provide the estimate."*
 *
 * **The request splits cleanly in two, and the two halves have opposite answers.**
 *
 *   ✅ **SEQUENCE is derivable and citable.** Substructure before superstructure;
 *      a level's structure before the level above it; walls before the openings
 *      they host; wet trades before finishes; balustrades after the finishes they
 *      are fixed through. That is ordinary constructability logic, it rests on no
 *      number, and it is the half the founder is really asking for. THIS MODULE
 *      IS THAT HALF.
 *
 *   ⛔ **DURATION still needs a productivity rate (m²/day), and PRYZM has none.**
 *      Every activity here reports `durationDays: null` with a NAMED reason. That
 *      is strictly more useful than the blank programme that existed before —
 *      the user gets the order, the dependencies and the quantities, and types
 *      the one number only they can source — and it fabricates nothing.
 *
 * ⛔ THEREFORE: `TaskDurationSource` IS NOT WIDENED and `ConstructionTask` IS NOT
 * CHANGED. ADR-0351 designed that one-member union as a REVIEWABLE GATE against
 * exactly this pressure, and a lane that widened it while implementing a founder
 * request for "an estimate" would have removed the gate in the moment it was
 * doing its job. A {@link SequencedActivity} is a DIFFERENT TYPE: it has an order
 * and dependencies and no dates at all. The user ADOPTS one into a real
 * `ConstructionTask` by supplying the start and the duration — and at that moment
 * the duration is USER_ENTERED, which is true.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THIS COULD ONLY BE BUILT AFTER THE DESGLOSE
 * ═════════════════════════════════════════════════════════════════════════════
 * A programme is per LEVEL. A take-off LINE is not: one `WALL.blockwork.200` line
 * covers every blockwork wall in the building, across every storey. Before
 * §TAKEOFF-DESGLOSE (L-4800) the line knew only its element ids, so "the walls of
 * level 2" was not expressible and a level-by-level sequence could not be built
 * from the take-off at all. `TakeoffContribution.levelId` is what makes it
 * possible — the same field the desglose table renders.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⛔ WHAT THIS MODULE MAY NEVER DO
 * ═════════════════════════════════════════════════════════════════════════════
 *   • Compute a duration, or an implied one (a "% of the programme" is a duration
 *     wearing a percent sign).
 *   • Compute dates, a forward pass, float or a critical path. With no durations
 *     there is nothing to pass forward, and a half-implemented CPM is the same
 *     defect shape as a fabricated output rate (ADR-0351 §8 4D-3).
 *   • Claim a level ORDER it was not given. Level ids are opaque strings; "L2 is
 *     above L1" is not derivable from them. When no elevation map is injected the
 *     result says the order is UNKNOWN and does not invent one.
 *   • Claim which walls are ENVELOPE and which are PARTITIONS. `TakeoffTypes`
 *     records that `WallSideClassification` defaults to `'unknown'` on every wall
 *     in this repo; a chapter split on it "would be a guess wearing a label", and
 *     so would a sequence split on it.
 */

import type { TakeoffChapterId, TakeoffLine, TakeoffResult } from './TakeoffTypes.js';
import type { QuantityUnit } from './TakeoffTypes.js';

// ── The stages ────────────────────────────────────────────────────────────────

/**
 * The construction stages, in the order a building is built. ⭐ THIS ORDER IS THE
 * CITABLE PART: it is ordinary site sequence, it encodes no rate, and every
 * dependency below is derived from it rather than authored twice.
 */
export type BuildStage =
  /** Excavation, foundations, ground-bearing slab. */
  | 'SUBSTRUCTURE'
  /** Frame and floor plates of one storey: slabs, columns, beams. */
  | 'STRUCTURE'
  /** Vertical circulation built with the frame — a stair is structure, not fit-out. */
  | 'CIRCULATION'
  /** Roof structure and covering. */
  | 'ROOF'
  /** All walls. ⛔ NOT split into envelope vs partition — see the file header. */
  | 'WALLS'
  /** Doors, windows and curtain walling, into the walls that host them. */
  | 'OPENINGS'
  /** First and second fix services. */
  | 'SERVICES'
  /** Screeds, plaster, paint, floor and ceiling finishes. */
  | 'FINISHES'
  /** Balustrades and handrails — fixed through the finishes, so after them. */
  | 'BALUSTRADES'
  /** Loose and fitted furniture, sanitaryware setting out. */
  | 'FIT_OUT';

export interface BuildStageDef {
  readonly id: BuildStage;
  readonly order: number;
  readonly label: string;
  readonly labelEs: string;
  /** Why this stage sits where it does. Rendered, so the order can be argued with. */
  readonly rationale: string;
  /** `true` ⇒ this stage repeats once per level. `false` ⇒ once for the project. */
  readonly perLevel: boolean;
}

export const BUILD_STAGES: readonly BuildStageDef[] = Object.freeze([
  {
    id: 'SUBSTRUCTURE', order: 1, label: 'Substructure', labelEs: 'Cimentación', perLevel: false,
    rationale: 'Nothing can be built on ground that has not been prepared and founded. Always first, and always present in this list even when PRYZM measures none of it — a programme that silently omits foundations reads as complete.',
  },
  {
    id: 'STRUCTURE', order: 2, label: 'Structure', labelEs: 'Estructura', perLevel: true,
    rationale: 'The frame and floor plate of a storey. ⭐ THE HARD DEPENDENCY: a level cannot start before the level below it is structurally complete — you cannot stand on a slab that has not been poured.',
  },
  {
    id: 'CIRCULATION', order: 3, label: 'Vertical circulation', labelEs: 'Escaleras', perLevel: true,
    rationale: 'A stair between two levels needs both plates. It is built with the frame and not with the fit-out, because it is also the site access to the storey above.',
  },
  {
    id: 'ROOF', order: 4, label: 'Roof', labelEs: 'Cubierta', perLevel: false,
    rationale: 'Getting the building watertight is what releases the internal trades, so it follows the last structural level and precedes finishes.',
  },
  {
    id: 'WALLS', order: 5, label: 'Walls', labelEs: 'Cerramientos y particiones', perLevel: true,
    rationale: 'Built off the completed plate of their own level. ⛔ Envelope and partitions are NOT separated: every wall in this repo carries WallSideClassification "unknown", and splitting on it would be a guess wearing a label.',
  },
  {
    id: 'OPENINGS', order: 6, label: 'Openings & joinery', labelEs: 'Carpintería', perLevel: true,
    rationale: 'A door or window is hosted IN a wall (C15 §3.1), so the wall exists first. The void is formed with the wall; the joinery is set into it after.',
  },
  {
    id: 'SERVICES', order: 7, label: 'Services', labelEs: 'Instalaciones', perLevel: true,
    rationale: 'First fix runs through the walls before they are closed and finished. PRYZM models no distribution, so only terminal fixtures appear here.',
  },
  {
    id: 'FINISHES', order: 8, label: 'Finishes', labelEs: 'Acabados', perLevel: true,
    rationale: 'Wet trades and finishes follow the services they conceal. This is the stage most sensitive to the building being watertight.',
  },
  {
    id: 'BALUSTRADES', order: 9, label: 'Balustrades', labelEs: 'Barandillas', perLevel: true,
    rationale: 'Fixed through the finished surface, so after the finishes — installing them first means removing and refixing them.',
  },
  {
    id: 'FIT_OUT', order: 10, label: 'Fit-out', labelEs: 'Mobiliario y equipamiento', perLevel: true,
    rationale: 'Last. Furniture goes into a finished room.',
  },
]);

const STAGE_ORDER = new Map<BuildStage, number>(BUILD_STAGES.map((s) => [s.id, s.order]));

/**
 * Route ONE take-off line to its stage.
 *
 * ⚠ THE CHAPTER IS NOT ALWAYS ENOUGH. `circulation` holds both stairs (built with
 * the frame) and handrails (fixed after the finishes) — two stages, one chapter.
 * The line CODE separates them, which is why this reads the code and not only the
 * chapter, and why the code prefixes are matched rather than the description.
 */
export function stageForLine(line: Pick<TakeoffLine, 'chapter' | 'code'>): BuildStage {
  if (line.code.startsWith('RAIL.')) return 'BALUSTRADES';
  if (line.code.startsWith('STAIR.')) return 'CIRCULATION';
  const byChapter: Record<TakeoffChapterId, BuildStage> = {
    structure:   'STRUCTURE',
    walls:       'WALLS',
    openings:    'OPENINGS',
    roofing:     'ROOF',
    finishes:    'FINISHES',
    circulation: 'CIRCULATION',
    mep:         'SERVICES',
    furnishings: 'FIT_OUT',
  };
  return byChapter[line.chapter] ?? 'FIT_OUT';
}

// ── Levels ────────────────────────────────────────────────────────────────────

/**
 * The level order, injected. `elevation` is what orders them.
 *
 * ⛔ NOT DERIVED FROM THE ID. "L2 is above L1" is a naming convention, not a
 * fact, and a programme that inverted two storeys because of a rename would be
 * wrong in the most expensive possible way.
 */
export interface LevelOrderEntry {
  readonly levelId: string;
  readonly name: string;
  readonly elevation: number;
}

/** The special bucket for elements that name no level. Never merged into a real one. */
export const NO_LEVEL = '\u0000NO-LEVEL';

// ── The activity ──────────────────────────────────────────────────────────────

/** Why an activity has no duration. Exactly one member today, for the same reason
 *  `TaskDurationSource` has exactly one: widening it must be a reviewed act. */
export type NoDurationReason = 'NO_OUTPUT_RATE';

export interface ActivityQuantity {
  readonly code: string;
  readonly description: string;
  readonly quantity: number;
  readonly unit: QuantityUnit;
}

/**
 * ONE derived piece of work: a stage, on a level, covering measured quantities.
 *
 * ⛔ IT HAS NO DATES AND NO DURATION, AND THAT IS THE DESIGN. See the file header.
 */
export interface SequencedActivity {
  /** Deterministic: `${stage}@${levelId}`. Re-deriving after an edit lands on the same id. */
  readonly id: string;
  readonly stage: BuildStage;
  readonly stageLabel: string;
  readonly levelId: string;
  readonly levelName: string;
  /** Position in the build order, 1-based. Equal ranks may run in parallel. */
  readonly rank: number;
  /** Activity ids that must be complete before this one starts. */
  readonly dependsOn: readonly string[];
  /** Why each dependency exists, in words, parallel to `dependsOn`. */
  readonly dependencyReasons: readonly string[];
  readonly lineCodes: readonly string[];
  readonly elementIds: readonly string[];
  readonly quantities: readonly ActivityQuantity[];
  /** ⛔ ALWAYS `null`. */
  readonly durationDays: null;
  readonly noDurationReason: NoDurationReason;
  /** The sentence printed where a duration would be. */
  readonly durationNote: string;
  /** `true` ⇒ this stage is in the sequence but PRYZM measures nothing for it. */
  readonly measuredNothing: boolean;
  /** Why it measures nothing. Empty for a normal activity. */
  readonly note: string;
}

export interface ConstructionSequence {
  readonly activities: readonly SequencedActivity[];
  /** `true` ⇒ a level elevation map was supplied and the storey order is real. */
  readonly levelOrderKnown: boolean;
  /** Elements the sequence covers. Should equal the take-off's measured count. */
  readonly sequencedElementCount: number;
  /** Measured elements NO activity covers. Reported, never hidden. */
  readonly unsequencedElementIds: readonly string[];
  /**
   * The sentence that MUST accompany the sequence wherever it is shown.
   * Generated here so a second surface cannot render a programme without it.
   */
  readonly coverageStatement: string;
}

const DURATION_NOTE =
  'No duration. A duration needs an output rate (m²/day, ud/day) and PRYZM holds none — '
  + 'it ships no productivity database for the same reason it ships no prices. The ORDER '
  + 'and the DEPENDENCIES above are derived from the model and are real; the number of days '
  + 'is the one input only you can source. Type it when you adopt this activity as a task.';

// ── The engine ────────────────────────────────────────────────────────────────

/**
 * Derive the construction sequence from a take-off.
 *
 * Pure: reads a `TakeoffResult` and an optional level order, writes nothing,
 * dispatches no command, produces no undo entry — the same L2 read-model shape
 * the take-off and the carbon model hold.
 */
export function deriveConstructionSequence(
  takeoff: TakeoffResult,
  levels: readonly LevelOrderEntry[] = [],
): ConstructionSequence {
  const levelOrderKnown = levels.length > 0;
  const levelRank = new Map<string, number>();
  const levelName = new Map<string, string>();
  [...levels]
    .sort((a, b) => a.elevation - b.elevation)
    .forEach((l, i) => { levelRank.set(l.levelId, i); levelName.set(l.levelId, l.name); });

  // ── Bucket every CONTRIBUTION by (stage, level). ⭐ Contributions, not lines:
  // one line spans storeys, and a programme is per storey. This is the whole
  // reason §TAKEOFF-DESGLOSE had to land first.
  interface Bucket {
    stage: BuildStage;
    levelId: string;
    lineCodes: Set<string>;
    elementIds: string[];
    quantities: Map<string, ActivityQuantity>;
  }
  const buckets = new Map<string, Bucket>();
  const seen = new Set<string>();

  for (const line of takeoff.lines) {
    const stage = stageForLine(line);
    for (const c of line.contributions) {
      const levelId = c.levelId ?? NO_LEVEL;
      const key = `${stage}@${levelId}`;
      let b = buckets.get(key);
      if (!b) {
        b = { stage, levelId, lineCodes: new Set(), elementIds: [], quantities: new Map() };
        buckets.set(key, b);
      }
      b.lineCodes.add(line.code);
      b.elementIds.push(c.elementId);
      seen.add(c.elementId);
      const q = b.quantities.get(line.code);
      if (q) {
        b.quantities.set(line.code, { ...q, quantity: Math.round((q.quantity + c.quantity) * 1e4) / 1e4 });
      } else {
        b.quantities.set(line.code, {
          code: line.code, description: line.description, quantity: c.quantity, unit: line.unit,
        });
      }
    }
  }

  // ── Order the buckets. Level rank is the OUTER key for per-level stages —
  // a building is built storey by storey, not trade by trade through the whole
  // block, and getting that backwards produces a programme no site would run.
  const sortKey = (b: Bucket): number => {
    const stageOrder = STAGE_ORDER.get(b.stage) ?? 99;
    const def = BUILD_STAGES.find((s) => s.id === b.stage)!;
    if (!def.perLevel) return stageOrder * 1000;
    // Elements with NO level sort LAST within their stage: they are real work
    // whose storey nobody has stated, and putting them first would imply an
    // order the model does not support.
    const lr = levelRank.has(b.levelId) ? levelRank.get(b.levelId)! : 900;
    return lr * 100 + stageOrder;
  };

  const ordered = [...buckets.values()].sort((a, b) => {
    const d = sortKey(a) - sortKey(b);
    return d !== 0 ? d : a.levelId.localeCompare(b.levelId);
  });

  // ── SUBSTRUCTURE always appears, even measuring nothing. A programme that
  // silently omits foundations reads as complete; this is the take-off's own
  // coverage-honesty rule applied to time.
  const activities: SequencedActivity[] = [];
  const idOf = (stage: BuildStage, levelId: string): string => `${stage}@${levelId}`;
  const emitted = new Set<string>();

  const substructureNote = takeoff.coverage.find((c) => c.family === 'Foundations')?.note
    ?? 'There is no foundation element family in the model.';
  activities.push({
    id: idOf('SUBSTRUCTURE', NO_LEVEL),
    stage: 'SUBSTRUCTURE',
    stageLabel: 'Substructure',
    levelId: NO_LEVEL,
    levelName: 'whole project',
    rank: 1,
    dependsOn: [],
    dependencyReasons: [],
    lineCodes: [],
    elementIds: [],
    quantities: [],
    durationDays: null,
    noDurationReason: 'NO_OUTPUT_RATE',
    durationNote: DURATION_NOTE,
    measuredNothing: true,
    note:
      `⛔ THIS ACTIVITY MEASURES NOTHING, AND IT IS LISTED ANYWAY. ${substructureNote} `
      + 'Excavation and cut/fill are not measured either. Every real programme starts here, so '
      + 'omitting the row would make this sequence read as complete when it is missing its first '
      + 'trade — that is a worse error than an empty row.',
  });
  emitted.add(idOf('SUBSTRUCTURE', NO_LEVEL));

  let rank = 2;
  let lastRankKey = '';
  for (const b of ordered) {
    const key = String(sortKey(b));
    if (key !== lastRankKey) { if (lastRankKey !== '') rank++; lastRankKey = key; }
    const def = BUILD_STAGES.find((s) => s.id === b.stage)!;
    const id = idOf(b.stage, b.levelId);

    // ── DEPENDENCIES, each with the reason it exists.
    const dependsOn: string[] = [];
    const reasons: string[] = [];
    const addDep = (depId: string, why: string): void => {
      if (depId !== id && emitted.has(depId) && !dependsOn.includes(depId)) {
        dependsOn.push(depId); reasons.push(why);
      }
    };

    // Every stage follows the substructure.
    addDep(idOf('SUBSTRUCTURE', NO_LEVEL), 'nothing is built before the ground is founded');

    // Earlier stages ON THE SAME LEVEL.
    for (const earlier of BUILD_STAGES) {
      if (earlier.order >= def.order) continue;
      if (!earlier.perLevel) continue;
      const depId = idOf(earlier.id, b.levelId);
      if (!emitted.has(depId)) continue;
      addDep(depId, stageDependencyReason(earlier.id, b.stage));
    }

    // ⭐ THE HARD ONE: this level's STRUCTURE follows the structure of the level
    // below. Only expressible when a level ORDER was injected — see NOT-DERIVED
    // in the header.
    if (b.stage === 'STRUCTURE' && levelRank.has(b.levelId)) {
      const myRank = levelRank.get(b.levelId)!;
      let belowId: string | null = null;
      let bestRank = -1;
      for (const [lid, lr] of levelRank) {
        if (lr < myRank && lr > bestRank && emitted.has(idOf('STRUCTURE', lid))) {
          bestRank = lr; belowId = lid;
        }
      }
      if (belowId) {
        addDep(
          idOf('STRUCTURE', belowId),
          `a level cannot start before the level below it (${levelName.get(belowId) ?? belowId}) is structurally complete — you cannot stand on a slab that has not been poured`,
        );
      }
    }

    activities.push({
      id,
      stage: b.stage,
      stageLabel: def.label,
      levelId: b.levelId,
      levelName: b.levelId === NO_LEVEL ? 'no level stated' : (levelName.get(b.levelId) ?? b.levelId),
      rank,
      dependsOn,
      dependencyReasons: reasons,
      lineCodes: [...b.lineCodes].sort(),
      elementIds: b.elementIds,
      quantities: [...b.quantities.values()].sort((x, y) => x.code.localeCompare(y.code)),
      durationDays: null,
      noDurationReason: 'NO_OUTPUT_RATE',
      durationNote: DURATION_NOTE,
      measuredNothing: false,
      note: b.levelId === NO_LEVEL
        ? 'These elements state NO LEVEL. They are real, measured work whose storey nobody has recorded, so they cannot be placed in the storey-by-storey order and are listed last within their stage rather than assumed to be on the ground floor.'
        : '',
    });
    emitted.add(id);
  }

  // ── The honest remainder.
  const allIds = new Set<string>();
  for (const l of takeoff.lines) for (const c of l.contributions) allIds.add(c.elementId);
  const unsequenced = [...allIds].filter((id) => !seen.has(id));

  const noLevelCount = activities
    .filter((a) => a.levelId === NO_LEVEL && !a.measuredNothing)
    .reduce((n, a) => n + a.elementIds.length, 0);

  const parts: string[] = [];
  parts.push(
    `${activities.length - 1} derived activit${activities.length - 1 === 1 ? 'y' : 'ies'} over `
    + `${seen.size} measured element${seen.size === 1 ? '' : 's'}, plus one SUBSTRUCTURE activity that measures nothing.`,
  );
  parts.push(
    '⛔ NO ACTIVITY HAS A DURATION AND NONE HAS A DATE. The ORDER and the DEPENDENCIES are derived '
    + 'from the model and from ordinary constructability; a duration needs an output rate (m²/day) '
    + 'that PRYZM does not hold and will not invent. Nothing here is a forward pass, a float or a '
    + 'critical path — with no durations there is nothing to pass forward.',
  );
  if (!levelOrderKnown) {
    parts.push(
      '⚠ NO LEVEL ORDER WAS SUPPLIED, so "the level below" could not be identified and the '
      + 'structure-follows-structure dependency is ABSENT — not satisfied. Level ids are opaque '
      + 'strings and PRYZM will not infer a storey order from a name.',
    );
  }
  if (noLevelCount > 0) {
    parts.push(
      `${noLevelCount} measured element${noLevelCount === 1 ? ' states' : 's state'} no level and `
      + `${noLevelCount === 1 ? 'is' : 'are'} sequenced last within ${noLevelCount === 1 ? 'its' : 'their'} stage rather than being assumed onto a storey.`,
    );
  }
  const notMeasured = takeoff.coverage.filter((c) => c.state === 'NOT_MEASURED');
  if (notMeasured.length > 0) {
    parts.push(
      `This is a sequence of the MEASURED work only — ${notMeasured.length} trade${notMeasured.length === 1 ? '' : 's'} `
      + `(${notMeasured.map((c) => c.family).join(', ')}) ${notMeasured.length === 1 ? 'is' : 'are'} NOT MEASURED and therefore appear in no activity.`,
    );
  }

  return {
    activities,
    levelOrderKnown,
    sequencedElementCount: seen.size,
    unsequencedElementIds: unsequenced,
    coverageStatement: parts.join(' '),
  };
}

/** The reason ONE stage follows another, in words. Rendered, so it can be argued with. */
function stageDependencyReason(from: BuildStage, to: BuildStage): string {
  if (to === 'WALLS' && from === 'STRUCTURE') return 'walls are built off the completed floor plate of their own level';
  if (to === 'OPENINGS' && from === 'WALLS') return 'a door or window is hosted IN a wall (C15 §3.1), so the wall exists first';
  if (to === 'SERVICES' && from === 'WALLS') return 'first fix runs through the walls before they are closed';
  if (to === 'FINISHES' && from === 'SERVICES') return 'finishes conceal the services, so the services go in first';
  if (to === 'FINISHES' && from === 'OPENINGS') return 'the building is closed against the weather before the wet trades start';
  if (to === 'BALUSTRADES' && from === 'FINISHES') return 'a balustrade is fixed through the finished surface — fitting it first means removing and refixing it';
  if (to === 'FIT_OUT') return 'furniture goes into a finished room';
  if (from === 'STRUCTURE') return 'this work is carried by the structure of its own level';
  return `${from} precedes ${to} in ordinary site sequence`;
}

/**
 * ⛔ THE GATE THAT KEEPS THE REFUSAL TRUE. Returns every activity that carries a
 * duration. MUST always be empty: the moment it is not, this module has started
 * computing a number it cannot cite, and ADR-0351 §8 4D-5 has been broken by
 * code rather than by a reviewed edit.
 */
export function activitiesWithAFabricatedDuration(
  seq: ConstructionSequence,
): readonly string[] {
  return seq.activities.filter((a) => a.durationDays !== null).map((a) => a.id);
}
