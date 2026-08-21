/**
 * TakeoffTypes — the vocabulary of a *medición* (quantity take-off / bill of quantities).
 *
 * Layer:     L2 — packages/core-app-model
 * Contract:  C66 §1.1 (nothing may be described as supported while it is merely CLAIMED),
 *            C84 EI-11 (what the user sees and what the system exports must be the same code),
 *            ADR-0350 (§MEDICIONES — the take-off is the only floor 4D/5D/6D may stand on).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE ONE RULE THIS FILE EXISTS TO ENFORCE
 * ─────────────────────────────────────────────────────────────────────────────
 * A measured quantity and an unmeasured one are DIFFERENT VALUES and MUST NOT be
 * written the same way. There is therefore:
 *
 *   • no `quantity: 0` fallback — a family that cannot be measured produces NO
 *     LINE and instead appears in {@link TakeoffResult.coverage} as `NOT_MEASURED`
 *     with a stated reason;
 *   • no `rate: 0` fallback — see `CostModel.ts`. An absent rate is `null`, is
 *     excluded from the total, and is counted in the total's own caption.
 *
 * This is §CONTEXT-DATA-HONESTY applied to quantities: "the take-off found no
 * walls" and "the take-off could not read the wall store" are the same number and
 * must never be the same answer.
 */

// ── Units ─────────────────────────────────────────────────────────────────────

/**
 * The five units a BOQ line may carry. `ud` is *unidad* — a count, the Spanish
 * mediciones convention the founder works in; `kg` is reserved for structural
 * steel and is NOT produced by any measurer today (see the coverage table).
 */
export type QuantityUnit = 'm' | 'm2' | 'm3' | 'ud' | 'kg';

/** Human labels, in the founder's working vocabulary (ES) with the SI symbol. */
export const UNIT_LABEL: Readonly<Record<QuantityUnit, string>> = Object.freeze({
  m:  'm',
  m2: 'm²',
  m3: 'm³',
  ud: 'ud',
  kg: 'kg',
});

// ── Chapters (capítulos) ──────────────────────────────────────────────────────

/**
 * BOQ chapters. Deliberately NOT split into "envelope" vs "partition": the wall
 * side classification (`WallSideClassification`) defaults to `'unknown'` on every
 * wall in this repo, so a chapter split on it would be a guess wearing a label.
 * One `walls` chapter is the honest grouping until topology fills that field.
 */
export type TakeoffChapterId =
  | 'structure'
  | 'walls'
  | 'openings'
  | 'roofing'
  | 'finishes'
  | 'circulation'
  | 'mep'
  | 'furnishings';

export interface TakeoffChapterDef {
  readonly id:    TakeoffChapterId;
  readonly order: number;
  /** English label — the UI's primary. */
  readonly label: string;
  /** Spanish label — the founder's working vocabulary; shown as the subtitle. */
  readonly labelEs: string;
}

export const TAKEOFF_CHAPTERS: readonly TakeoffChapterDef[] = Object.freeze([
  { id: 'structure',   order: 1, label: 'Structure',            labelEs: 'Estructura'                 },
  { id: 'walls',       order: 2, label: 'Walls & partitions',   labelEs: 'Cerramientos y particiones' },
  { id: 'openings',    order: 3, label: 'Openings & joinery',   labelEs: 'Carpintería y huecos'       },
  { id: 'roofing',     order: 4, label: 'Roofing',              labelEs: 'Cubiertas'                  },
  { id: 'finishes',    order: 5, label: 'Finishes',             labelEs: 'Revestimientos y acabados'  },
  { id: 'circulation', order: 6, label: 'Vertical circulation', labelEs: 'Escaleras y barandillas'    },
  { id: 'mep',         order: 7, label: 'Services',             labelEs: 'Instalaciones'              },
  { id: 'furnishings', order: 8, label: 'Furnishings',          labelEs: 'Mobiliario y equipamiento'  },
]);

// ── A secondary measure carried on a line ─────────────────────────────────────

/**
 * A line has exactly ONE priced unit. Everything else it measured rides along as
 * a secondary measure, shown but never priced — which is what keeps a wall from
 * being billed once per m² and again per m³.
 */
export interface SecondaryMeasure {
  readonly label:    string;
  readonly value:    number;
  readonly unit:     QuantityUnit;
}

// ── The material breakdown (the 6D hook) ──────────────────────────────────────

/**
 * §MATERIAL-CARBON-FACTS (L-3102) — how much of ONE named material a line
 * measured, in cubic metres.
 *
 * ⭐ WHY THIS IS ON THE LINE AND NOT IN A SECOND ENGINE. Embodied carbon is
 * volume × density × factor. The volume half is *already measured here*, net of
 * openings, by the same code that cut the mesh. A separate 6D measurer would be
 * a second engine measuring the same building, and two engines is how two
 * numbers start disagreeing — so 6D reads THIS, and the take-off gained one
 * additive field rather than a rival.
 *
 * ⚠ A LAYERED WALL PRODUCES SEVERAL ROWS — one per system-type layer, each with
 * its own material and its own thickness. That is deliberate: carbon lives in the
 * insulation and the concrete, not in "a wall", and pretending a wall is one
 * material would have been the single largest error available here.
 *
 * ⛔ EMPTY IS A REAL ANSWER. A line whose elements name no material produces an
 * EMPTY array, and 6D reports it as NOT MEASURED with the reason. It is never
 * filled in with a guess, and never with a zero volume.
 */
export interface MaterialVolume {
  /** A `MaterialRecord.id` — the SAME vocabulary the catalogue uses (C100 §1.1). */
  readonly materialId: string;
  /** Cubic metres of this material measured by the line. Always > 0. */
  readonly volumeM3:   number;
  /**
   * What this volume is, when the answer is not simply "the element" — e.g.
   * `'layer: Mineral Wool Insulation (90 mm)'`. Shown beside the number so a
   * per-layer figure can be checked against the system type that produced it.
   */
  readonly note?:      string;
}

// ── The line ──────────────────────────────────────────────────────────────────

export interface TakeoffLine {
  /**
   * Stable, deterministic code. It is the join key for a 5D rate and MUST NOT
   * embed a quantity or a date — re-running the take-off after an edit has to
   * land on the same code so the rate the user typed survives.
   */
  readonly code:        string;
  readonly chapter:     TakeoffChapterId;
  readonly description: string;
  readonly unit:        QuantityUnit;
  /** The measured quantity, in `unit`. Never a placeholder — see the file header. */
  readonly quantity:    number;
  /**
   * ⭐ TRACEABILITY. The ids of the elements this row measured. A row that cannot
   * name its elements is not a *medición*, it is a number. Always non-empty.
   */
  readonly elementIds:  readonly string[];
  /**
   * The measurement rule, in words — e.g. "Σ (length × height) − Σ opening voids".
   * Rendered in the UI and written to the CSV, because a quantity whose basis is
   * unstated cannot be checked by a quantity surveyor.
   */
  readonly basis:       string;
  /**
   * Non-empty ⇒ some contributing element was measured APPROXIMATELY, and each
   * string says which and why. Empty ⇒ every contributor was measured exactly by
   * the same code that built its geometry.
   */
  readonly qualifiers:  readonly string[];
  readonly secondary:   readonly SecondaryMeasure[];
  /**
   * §MATERIAL-CARBON-FACTS (L-3102) — m³ per named material, the input 6D reads.
   * ALWAYS PRESENT, often EMPTY: empty means "these elements name no material",
   * which is a different answer from "they are made of nothing". See
   * {@link MaterialVolume}.
   */
  readonly materialBreakdown: readonly MaterialVolume[];
}

// ── Coverage (the honest half) ────────────────────────────────────────────────

export type CoverageState =
  /** Measured to a real quantity, by a stated basis. */
  | 'MEASURED'
  /** Present and counted (`ud`) but no area/volume/length is derived. */
  | 'COUNTED_ONLY'
  /** Not measured at all — the `note` says why. NEVER rendered as a zero. */
  | 'NOT_MEASURED';

export interface CoverageRow {
  readonly family: string;
  readonly state:  CoverageState;
  readonly note:   string;
}

// ── The result ────────────────────────────────────────────────────────────────

export interface TakeoffResult {
  readonly generatedAt: number;
  readonly lines:       readonly TakeoffLine[];
  /**
   * Every element family this engine KNOWS ABOUT, with its state. A family absent
   * from `lines` is present here with a reason — that is the difference between
   * "you have no roofs" and "roofs are not measured".
   */
  readonly coverage:    readonly CoverageRow[];
  /**
   * Stores that were not reachable at all when the take-off ran (the app had not
   * published them on `window`). Distinct from "the store was empty", which is a
   * real answer and produces no line.
   */
  readonly unreadableStores: readonly string[];
  /** Total elements that contributed to at least one line. */
  readonly measuredElementCount: number;
}
