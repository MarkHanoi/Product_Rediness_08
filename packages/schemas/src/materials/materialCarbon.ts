// §MATERIAL-CARBON-FACTS (L-3100) — C100 §1.1 · the 6D half of the ONE material record.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⭐ THE ONE RULE THIS FILE EXISTS TO ENFORCE
// ─────────────────────────────────────────────────────────────────────────────
// **A carbon number with no cited source is worse than no number**, because it
// will be quoted in a planning submission and nobody downstream can tell it from
// a measured one. Therefore every value in this vocabulary is INSEPARABLE from
// its provenance: there is no `value: number` anywhere in this file that is not
// wrapped in a record carrying `source`, `dataset`, `year`, `geography` and a
// `verification` state.
//
// It is deliberately IMPOSSIBLE to express "0.113 kgCO₂e/kg" here without also
// saying where 0.113 came from. That is the whole point of the shape.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⛔ WHAT THIS FILE MAY NEVER GROW
// ─────────────────────────────────────────────────────────────────────────────
//   • A default factor. A material with no factor is NOT_MEASURED — never 0, and
//     never "the nearest similar material". `findMaterialRecord()` already refuses
//     to substitute a colour on a miss (C100 §5); a substituted CARBON factor is
//     the same failure with a worse consequence.
//   • A unit conversion that invents the missing half. kgCO₂e/kg × m³ needs a
//     DENSITY. Absent density ⇒ the line is NOT_MEASURED with `NO_DENSITY`, not a
//     line computed from an assumed 2400 kg/m³.
//   • A `verification: 'VERIFIED_AGAINST_SOURCE'` written by anyone who did not
//     personally open the source document and check the row. See §VERIFICATION.
//
// Layer: L0 — packages/schemas. Pure scalars; no I/O, no THREE, no DOM (P5).

/**
 * The two forms a published embodied-carbon factor takes.
 *
 * ⚠ They are NOT interchangeable and this vocabulary never converts one to the
 * other silently. `kgCO2e/kg` requires a density to reach a volume; `kgCO2e/m3`
 * does not. A consumer that has volume and a per-kg factor but NO density has
 * an UNANSWERABLE question, not an approximable one.
 */
export type CarbonFactorUnit = 'kgCO2e/kg' | 'kgCO2e/m3';

/**
 * The life-cycle stages a factor covers, in EN 15978 / EN 15804 module notation.
 *
 * PRYZM ships **A1-A3 only** (product stage: raw supply, transport, manufacture
 * — "cradle to gate"). It is the stage an early-design model can honestly speak
 * to. A1-A5, B, C and D are declared here so a user-supplied EPD can say what it
 * actually covers, and so a total can never silently mix scopes.
 */
export type CarbonScope = 'A1-A3' | 'A1-A5' | 'A4' | 'A5' | 'B1-B7' | 'C1-C4' | 'D';

/**
 * Where a number came from, as a KIND — orthogonal to the free-text `source`.
 *
 *   'BUILTIN_REFERENCE' — transcribed into PRYZM from a published generic dataset.
 *                         Generic, not product-specific. Good enough to rank
 *                         options; NOT good enough for a verified assessment.
 *   'USER_ENTERED'      — the user typed it. PRYZM asserts nothing about it and
 *                         reports it as unsourced when `source` is empty.
 *   'EPD'               — from a specific Environmental Product Declaration the
 *                         user holds. The `source` names the EPD registration.
 */
export type CarbonProvenance = 'BUILTIN_REFERENCE' | 'USER_ENTERED' | 'EPD';

/**
 * §VERIFICATION — has a human checked this number against the source document,
 * inside this repository?
 *
 * ⭐ This field exists because "cited" and "checked" are different facts, and
 * collapsing them is exactly how a plausible number acquires authority it has not
 * earned. Every factor PRYZM ships is `UNVERIFIED_TRANSCRIPTION`: it names a real
 * published dataset, and **nobody has re-opened that dataset and confirmed the
 * row**. The 6D surface says so on its own face, per line.
 *
 * ⛔ Do not flip a row to `VERIFIED_AGAINST_SOURCE` without recording, in the
 * row's own `source` string, WHO checked it and on WHAT DATE against WHICH page
 * or table. A verification that cannot be re-checked is a stronger claim resting
 * on nothing.
 */
export type CarbonVerification = 'UNVERIFIED_TRANSCRIPTION' | 'VERIFIED_AGAINST_SOURCE';

/**
 * The provenance block every numeric fact in this vocabulary carries.
 *
 * There is no way to construct a {@link DensityFact} or a {@link CarbonFactorFact}
 * without one — that is the type system doing the work a code-review rule would
 * otherwise have to do every week.
 */
export interface FactProvenance {
  /**
   * The citation, in the form a quantity surveyor could follow back: dataset,
   * edition, table or row, and the exact product it names. Never empty for a
   * built-in row; MAY be empty for a user-entered one, and an empty one is
   * COUNTED and REPORTED rather than ignored (the 5D rate book's rule, applied).
   */
  readonly source: string;
  /** Short dataset name for grouping in the UI — e.g. `ICE v3.0`. */
  readonly dataset: string;
  /** Publication year of the edition cited. */
  readonly year: number;
  /** What the figure represents geographically — e.g. `UK`, `EU average`, `World average`. */
  readonly geography: string;
  readonly provenance: CarbonProvenance;
  readonly verification: CarbonVerification;
}

/** Bulk density, in kg/m³ — the bridge from a measured VOLUME to a MASS. */
export interface DensityFact extends FactProvenance {
  /** kg per cubic metre. Finite and > 0. */
  readonly kgPerM3: number;
}

/** An embodied-carbon factor for one material. */
export interface CarbonFactorFact extends FactProvenance {
  /** The factor value, in {@link unit}. Finite and ≥ 0. */
  readonly value: number;
  readonly unit: CarbonFactorUnit;
  readonly scope: CarbonScope;
  /**
   * What the published row this came from actually names, when that is NARROWER
   * or WIDER than the PRYZM material it is attached to — and what the difference
   * costs. Rendered beside the number.
   *
   * Example: PRYZM's `concrete-reinforced` is attached to the GENERIC concrete
   * factor, and this field says the reinforcement is NOT in it, because PRYZM
   * does not model rebar and inventing a bar schedule would be worse.
   */
  readonly qualifier?: string;
}

/**
 * The carbon facts carried by ONE material record. Both halves are independently
 * optional, because they fail independently: a material can have a well-published
 * density and no factor, or a per-m³ factor and no density (which is fine — see
 * {@link carbonPerCubicMetre}).
 */
export interface MaterialCarbonFacts {
  readonly density?: DensityFact;
  /** Product-stage (cradle-to-gate) embodied carbon. */
  readonly carbonA1A3?: CarbonFactorFact;
}

/** Why a per-m³ carbon figure could not be produced. NEVER expressed as a zero. */
export type CarbonGapReason =
  /** The material has no `carbonA1A3` at all. */
  | 'NO_FACTOR'
  /** A per-KG factor exists but the material has no density, so mass is unknown. */
  | 'NO_DENSITY'
  /** The material id does not resolve in the catalogue at all. */
  | 'UNKNOWN_MATERIAL';

export interface CarbonPerM3Ok {
  readonly ok: true;
  /** kgCO₂e per cubic metre of this material. */
  readonly kgCO2ePerM3: number;
  readonly factor: CarbonFactorFact;
  /** Present only when the factor was per-kg and had to go through a density. */
  readonly density: DensityFact | null;
}

export interface CarbonPerM3Gap {
  readonly ok: false;
  readonly reason: CarbonGapReason;
  /** The sentence the UI prints instead of a number. */
  readonly note: string;
}

export type CarbonPerM3 = CarbonPerM3Ok | CarbonPerM3Gap;

/**
 * Narrow a {@link CarbonPerM3} to its GAP arm.
 *
 * ⚠ EXPLICIT PREDICATES, NOT `if (!p.ok)`. `packages/core-app-model` compiles
 * with `strictNullChecks: false` (its own tsconfig), and under that setting
 * TypeScript will not narrow this union on its boolean-literal discriminant — the
 * consumer gets "Property 'reason' does not exist on type 'CarbonPerM3'". A
 * user-defined type predicate narrows under BOTH settings, so the honest-refusal
 * shape survives the strictest and the loosest compiler in this repo alike.
 */
export function isCarbonGap(p: CarbonPerM3): p is CarbonPerM3Gap {
  return p.ok === false;
}

/** Narrow a {@link CarbonPerM3} to its MEASURED arm. See {@link isCarbonGap}. */
export function isCarbonMeasured(p: CarbonPerM3): p is CarbonPerM3Ok {
  return p.ok === true;
}

/**
 * Reduce a material's facts to kgCO₂e per cubic metre, or say why it cannot be
 * done. **The only arithmetic in this vocabulary**, deliberately in one place.
 *
 * ⛔ Returns a GAP rather than a number in every case where a number would have
 * required an assumption. There is no branch that supplies a default density and
 * no branch that returns 0.
 */
export function carbonPerCubicMetre(facts: MaterialCarbonFacts | undefined): CarbonPerM3 {
  const factor = facts?.carbonA1A3;
  if (!factor) {
    return {
      ok: false,
      reason: 'NO_FACTOR',
      note: 'No embodied-carbon factor is attached to this material. It is NOT MEASURED — not zero.',
    };
  }
  if (factor.unit === 'kgCO2e/m3') {
    return { ok: true, kgCO2ePerM3: factor.value, factor, density: null };
  }
  const density = facts?.density;
  if (!density || !(density.kgPerM3 > 0)) {
    return {
      ok: false,
      reason: 'NO_DENSITY',
      note:
        'The factor is published per KILOGRAM and this material carries no density, '
        + 'so its mass is unknown. Supplying a plausible density here would invent the answer.',
    };
  }
  return { ok: true, kgCO2ePerM3: factor.value * density.kgPerM3, factor, density };
}

/**
 * True when `facts` carries a factor whose scope is something other than the
 * A1-A3 product stage PRYZM's totals are declared in. A consumer MUST NOT add
 * such a line into an A1-A3 total; it must report it separately.
 */
export function isOutOfScopeForA1A3(facts: MaterialCarbonFacts | undefined): boolean {
  const s = facts?.carbonA1A3?.scope;
  return s !== undefined && s !== 'A1-A3';
}
