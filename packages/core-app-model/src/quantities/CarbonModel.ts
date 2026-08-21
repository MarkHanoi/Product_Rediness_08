/**
 * CarbonModel — 6D. Embodied carbon over the take-off, and NOTHING invented.
 *
 * Layer:    L2 — packages/core-app-model
 * Contract: C66 §1.1 by analogy · C100 §1.1 / §5 (a miss is a miss, never a
 *           substitute) · ADR-0351 §6D
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔ THE PROHIBITION THIS MODULE EXISTS TO ENCODE
 * ─────────────────────────────────────────────────────────────────────────────
 * **A carbon number is quoted in planning submissions.** It outranks a cost
 * figure in consequence, because a wrong cost is discovered at tender and a wrong
 * carbon figure is discovered by nobody. So this module is stricter than
 * `CostModel.ts`, not looser:
 *
 *   • a material with no factor produces `kgCO2e === null` and a NAMED reason —
 *     **never `0`**, and never the factor of a similar material;
 *   • a per-KILOGRAM factor with no density produces `NO_DENSITY`, because the
 *     mass is genuinely unknown and a plausible density would silently multiply
 *     the whole line;
 *   • a material id that does not resolve in `MATERIAL_CATALOG` produces
 *     `UNKNOWN_MATERIAL` and names the id, so a drifted id is visible instead of
 *     being absorbed;
 *   • the total is inseparable from {@link CarbonSummary.coverageStatement},
 *     which states the volume it did NOT cover — a percentage of the model, not
 *     a reassuring adjective;
 *   • **every** factor PRYZM ships is `UNVERIFIED_TRANSCRIPTION`, and the summary
 *     says so every single time. Cited is not the same fact as checked.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE THE VOLUME COMES FROM
 * ─────────────────────────────────────────────────────────────────────────────
 * `TakeoffLine.materialBreakdown` — computed by the take-off's own measurers, so
 * there is exactly ONE measurement engine in this product. A wall's contribution
 * is split PER SYSTEM-TYPE LAYER using the same net face area the m² line reports,
 * which means the `openingOutline()` deduction that removes an arched window from
 * the wall area removes it from the insulation and the blockwork too.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OVERRIDES
 * ─────────────────────────────────────────────────────────────────────────────
 * The user may supply their own factor or density for any material id — from an
 * EPD they hold, or a product datasheet. An override REPLACES the built-in for
 * that material and is reported with its own provenance, exactly as a 5D rate is.
 * PRYZM redistributes no licensed database.
 */

import {
  findMaterialRecord,
  carbonPerCubicMetre,
  isCarbonGap,
  type MaterialCarbonFacts,
  type CarbonGapReason,
  type CarbonFactorFact,
  type DensityFact,
} from '@pryzm/schemas/materials';
import type { TakeoffLine, TakeoffResult, TakeoffChapterId } from './TakeoffTypes.js';

// ── Overrides ─────────────────────────────────────────────────────────────────

/**
 * User-supplied facts, keyed by `MaterialRecord.id`. A partial override is
 * honoured: supplying only a density completes a built-in per-kg factor, which is
 * exactly the mineral-wool / EPS case the built-in table deliberately leaves open.
 */
export interface CarbonOverrideBook {
  readonly entries: Readonly<Record<string, MaterialCarbonFacts>>;
}

/** Merge an override over the built-in facts, half by half. */
function factsFor(
  materialId: string,
  overrides: CarbonOverrideBook | null,
): { facts: MaterialCarbonFacts | undefined; known: boolean; overridden: boolean } {
  const record = findMaterialRecord(materialId);
  const over = overrides?.entries?.[materialId];
  if (!record && !over) return { facts: undefined, known: false, overridden: false };
  const base = record?.carbon;
  if (!over) return { facts: base, known: Boolean(record), overridden: false };
  return {
    facts: {
      density: over.density ?? base?.density,
      carbonA1A3: over.carbonA1A3 ?? base?.carbonA1A3,
    },
    known: true,
    overridden: true,
  };
}

// ── Result shape ──────────────────────────────────────────────────────────────

/** One material's contribution to one take-off line. */
export interface CarbonMaterialRow {
  readonly materialId: string;
  /** The catalogue label, or `null` when the id does not resolve at all. */
  readonly materialLabel: string | null;
  readonly volumeM3: number;
  /** What this volume is (e.g. a wall layer). Passed through from the take-off. */
  readonly note: string | null;
  /** `null` ⇒ NOT MEASURED. Never coerced to 0. */
  readonly kgCO2e: number | null;
  /** `null` ⇒ mass unknown (no density). */
  readonly massKg: number | null;
  readonly factor: CarbonFactorFact | null;
  readonly density: DensityFact | null;
  /** `null` when measured; otherwise why it was not. */
  readonly gap: CarbonGapReason | null;
  /** The sentence printed in place of a number. Empty when measured. */
  readonly gapNote: string;
  /** True when a user override supplied part or all of the facts. */
  readonly overridden: boolean;
}

export interface CarbonLine {
  readonly line: TakeoffLine;
  readonly materials: readonly CarbonMaterialRow[];
  /** Sum over MEASURED rows only. `null` when the line measured nothing. */
  readonly kgCO2e: number | null;
  readonly measuredVolumeM3: number;
  readonly unmeasuredVolumeM3: number;
}

export interface CarbonChapterTotal {
  readonly chapter: TakeoffChapterId;
  readonly kgCO2e: number;
  readonly measuredVolumeM3: number;
  readonly unmeasuredVolumeM3: number;
}

/** One row of the "why is this not measured" ledger, aggregated by material. */
export interface CarbonGapRow {
  readonly materialId: string;
  readonly materialLabel: string | null;
  readonly reason: CarbonGapReason;
  readonly note: string;
  readonly volumeM3: number;
  readonly lineCodes: readonly string[];
}

export interface CarbonSummary {
  /** Sum over every measured material row, kgCO₂e, product stage A1–A3. */
  readonly totalKgCO2e: number;
  readonly measuredVolumeM3: number;
  readonly unmeasuredVolumeM3: number;
  /**
   * Volume carried by take-off lines that named NO material at all — distinct
   * from "named a material with no factor", because the fixes are different.
   */
  readonly unattributedVolumeM3: number;
  readonly measuredMaterialCount: number;
  readonly gapMaterialCount: number;
  /** Measured rows whose factor is a shipped reference figure nobody re-checked. */
  readonly unverifiedFactorCount: number;
  /** Measured rows whose factor came from a user override. */
  readonly overriddenFactorCount: number;
  /**
   * The sentence that MUST accompany the total wherever it is shown. Generated
   * here, not in the UI, so a second surface cannot render the number without it.
   */
  readonly coverageStatement: string;
}

export interface CarbonResult {
  readonly lines: readonly CarbonLine[];
  readonly chapters: readonly CarbonChapterTotal[];
  /** Every material that could NOT be measured, with the volume it cost. */
  readonly gaps: readonly CarbonGapRow[];
  readonly summary: CarbonSummary;
}

// ── The engine ────────────────────────────────────────────────────────────────

const r2 = (n: number): number => Math.round(n * 100) / 100;
const r4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/**
 * Compute embodied carbon (A1–A3) over a take-off.
 *
 * Pure with respect to the model: reads a `TakeoffResult`, writes nothing,
 * dispatches no command, produces no undo entry — the same L2 read-model shape
 * the take-off itself holds.
 */
export function computeCarbon(
  takeoff: TakeoffResult,
  overrides: CarbonOverrideBook | null = null,
): CarbonResult {
  const lines: CarbonLine[] = [];
  const chapterAcc = new Map<TakeoffChapterId, { kg: number; measured: number; unmeasured: number }>();
  const gapAcc = new Map<string, { row: CarbonGapRow; codes: Set<string> }>();

  let totalKg = 0;
  let measuredVol = 0;
  let unmeasuredVol = 0;
  let unattributedVol = 0;
  let unverified = 0;
  let overridden = 0;
  const measuredMaterials = new Set<string>();

  for (const line of takeoff.lines) {
    // A line that names no material at all. Its volume is REAL — it is simply
    // unattributed — so it is counted separately from "material with no factor",
    // because one is fixed by tagging the element and the other by finding a factor.
    if (line.materialBreakdown.length === 0) {
      const vol = volumeOfUnattributedLine(line);
      unattributedVol += vol;
      lines.push({
        line,
        materials: [],
        kgCO2e: null,
        measuredVolumeM3: 0,
        unmeasuredVolumeM3: vol,
      });
      bump(chapterAcc, line.chapter, 0, 0, vol);
      continue;
    }

    const rows: CarbonMaterialRow[] = [];
    let lineKg = 0;
    let lineMeasured = 0;
    let lineUnmeasured = 0;
    let anyMeasured = false;

    for (const mv of line.materialBreakdown) {
      const { facts, known, overridden: isOver } = factsFor(mv.materialId, overrides);
      const label = findMaterialRecord(mv.materialId)?.label ?? null;

      if (!known) {
        rows.push(gapRow(mv.materialId, null, mv, 'UNKNOWN_MATERIAL',
          `Material id "${mv.materialId}" does not resolve in the master catalogue. `
          + 'It is NOT MEASURED — substituting a similar material here is exactly what '
          + 'C100 forbids the colour resolver from doing, and carbon is the worse place to do it.',
          false));
        lineUnmeasured += mv.volumeM3;
        continue;
      }

      const per = carbonPerCubicMetre(facts);
      if (isCarbonGap(per)) {
        rows.push(gapRow(mv.materialId, label, mv, per.reason, per.note, isOver));
        lineUnmeasured += mv.volumeM3;
        continue;
      }

      const kg = mv.volumeM3 * per.kgCO2ePerM3;
      const massKg = per.density ? mv.volumeM3 * per.density.kgPerM3 : null;
      rows.push({
        materialId: mv.materialId,
        materialLabel: label,
        volumeM3: r4(mv.volumeM3),
        note: mv.note ?? null,
        kgCO2e: r2(kg),
        massKg: massKg === null ? null : r2(massKg),
        factor: per.factor,
        density: per.density,
        gap: null,
        gapNote: '',
        overridden: isOver,
      });
      lineKg += kg;
      lineMeasured += mv.volumeM3;
      anyMeasured = true;
      measuredMaterials.add(mv.materialId);
      if (per.factor.verification === 'UNVERIFIED_TRANSCRIPTION') unverified++;
      if (isOver) overridden++;
    }

    for (const row of rows) {
      if (row.gap === null) continue;
      const key = `${row.materialId}|${row.gap}`;
      const existing = gapAcc.get(key);
      if (existing) {
        existing.row = { ...existing.row, volumeM3: existing.row.volumeM3 + row.volumeM3 };
        existing.codes.add(line.code);
      } else {
        gapAcc.set(key, {
          row: {
            materialId: row.materialId,
            materialLabel: row.materialLabel,
            reason: row.gap,
            note: row.gapNote,
            volumeM3: row.volumeM3,
            lineCodes: [],
          },
          codes: new Set([line.code]),
        });
      }
    }

    lines.push({
      line,
      materials: rows,
      kgCO2e: anyMeasured ? r2(lineKg) : null,
      measuredVolumeM3: r4(lineMeasured),
      unmeasuredVolumeM3: r4(lineUnmeasured),
    });
    bump(chapterAcc, line.chapter, lineKg, lineMeasured, lineUnmeasured);
    totalKg += lineKg;
    measuredVol += lineMeasured;
    unmeasuredVol += lineUnmeasured;
  }

  const gaps = [...gapAcc.values()]
    .map((g) => ({ ...g.row, volumeM3: r4(g.row.volumeM3), lineCodes: [...g.codes].sort() }))
    .sort((a, b) => b.volumeM3 - a.volumeM3);

  const chapters = [...chapterAcc.entries()]
    .map(([chapter, v]) => ({
      chapter,
      kgCO2e: r2(v.kg),
      measuredVolumeM3: r4(v.measured),
      unmeasuredVolumeM3: r4(v.unmeasured),
    }))
    .sort((a, b) => b.kgCO2e - a.kgCO2e);

  return {
    lines,
    chapters,
    gaps,
    summary: {
      totalKgCO2e: r2(totalKg),
      measuredVolumeM3: r4(measuredVol),
      unmeasuredVolumeM3: r4(unmeasuredVol),
      unattributedVolumeM3: r4(unattributedVol),
      measuredMaterialCount: measuredMaterials.size,
      gapMaterialCount: gaps.length,
      unverifiedFactorCount: unverified,
      overriddenFactorCount: overridden,
      coverageStatement: buildCoverageStatement({
        totalKg,
        measuredVol,
        unmeasuredVol,
        unattributedVol,
        gaps,
        unverified,
        overridden,
        takeoff,
      }),
    },
  };
}

function gapRow(
  materialId: string,
  label: string | null,
  mv: { volumeM3: number; note?: string },
  reason: CarbonGapReason,
  note: string,
  overridden: boolean,
): CarbonMaterialRow {
  return {
    materialId,
    materialLabel: label,
    volumeM3: r4(mv.volumeM3),
    note: mv.note ?? null,
    kgCO2e: null,
    massKg: null,
    factor: null,
    density: null,
    gap: reason,
    gapNote: note,
    overridden,
  };
}

function bump(
  acc: Map<TakeoffChapterId, { kg: number; measured: number; unmeasured: number }>,
  chapter: TakeoffChapterId,
  kg: number,
  measured: number,
  unmeasured: number,
): void {
  const cur = acc.get(chapter) ?? { kg: 0, measured: 0, unmeasured: 0 };
  cur.kg += kg;
  cur.measured += measured;
  cur.unmeasured += unmeasured;
  acc.set(chapter, cur);
}

/**
 * The volume a line carries when it names NO material — read from the same
 * secondary measures the take-off already publishes, never re-derived.
 *
 * Returns 0 when the line has no volume at all (a count of doors, a linear metre
 * of handrail). That is not a missing measurement — such a line HAS no volume,
 * and reporting it as unmeasured volume would inflate the gap with work that has
 * none.
 */
function volumeOfUnattributedLine(line: TakeoffLine): number {
  if (line.unit === 'm3') return line.quantity;
  for (const s of line.secondary) {
    if (s.unit === 'm3') return s.value;
  }
  return 0;
}

function pct(part: number, whole: number): string {
  if (!(whole > 0)) return '0%';
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

function buildCoverageStatement(a: {
  totalKg: number;
  measuredVol: number;
  unmeasuredVol: number;
  unattributedVol: number;
  gaps: readonly CarbonGapRow[];
  unverified: number;
  overridden: number;
  takeoff: TakeoffResult;
}): string {
  const parts: string[] = [];
  const knownVol = a.measuredVol + a.unmeasuredVol + a.unattributedVol;

  if (knownVol <= 0) {
    parts.push('Nothing in this model carries a measurable volume, so there is no embodied-carbon figure.');
  } else if (a.measuredVol <= 0) {
    parts.push(`NO LINE IS MEASURED. ${r4(knownVol)} m³ of material was measured by the take-off and none of it reaches a carbon figure.`);
  } else {
    parts.push(
      `This total covers ${pct(a.measuredVol, knownVol)} of the measured volume `
      + `(${r4(a.measuredVol)} m³ of ${r4(knownVol)} m³).`,
    );
  }

  // ⭐ THE TWO GAPS ARE ALWAYS REPORTED SEPARATELY, and never only inside the
  // "we have a total" branch. "carries a material with no factor" and "names no
  // material at all" are DIFFERENT FAILURES with DIFFERENT FIXES — find a factor
  // versus tag the element — and a sentence that says "none of it resolves to a
  // factor" about volume that never named a material is itself a false statement.
  // The first version of this function did exactly that; the test caught it.
  if (a.unmeasuredVol > 0) {
    parts.push(
      `${r4(a.unmeasuredVol)} m³ carries a material with no usable factor and is EXCLUDED — `
      + 'it is not zero carbon, it is unmeasured.',
    );
  }
  if (a.unattributedVol > 0) {
    parts.push(
      `${r4(a.unattributedVol)} m³ sits on take-off lines that name NO material at all, so it `
      + 'cannot even be asked about — that is fixed by tagging the element, not by finding a factor.',
    );
  }

  const noDensity = a.gaps.filter((g) => g.reason === 'NO_DENSITY');
  if (noDensity.length > 0) {
    parts.push(
      `${noDensity.length} material${noDensity.length === 1 ? '' : 's'} `
      + `(${noDensity.map((g) => g.materialLabel ?? g.materialId).join(', ')}) `
      + 'have a published factor but NO density, so their mass is unknown. Enter the density of '
      + 'the product you specified to complete them.',
    );
  }
  const unknown = a.gaps.filter((g) => g.reason === 'UNKNOWN_MATERIAL');
  if (unknown.length > 0) {
    parts.push(
      `${unknown.length} material id${unknown.length === 1 ? ' does' : 's do'} not resolve in the `
      + `master catalogue at all: ${unknown.map((g) => g.materialId).join(', ')}.`,
    );
  }

  if (a.unverified > 0) {
    parts.push(
      `⚠ ${a.unverified} of the measured rows use a factor PRYZM ships from a published generic `
      + 'dataset. Every one of them is UNVERIFIED — cited, but not re-checked against the source '
      + 'document by anyone here. Substitute an EPD for the products you have actually specified '
      + 'before this figure goes into a submission.',
    );
  }
  if (a.overridden > 0) {
    parts.push(`${a.overridden} row${a.overridden === 1 ? ' uses' : 's use'} a factor you supplied.`);
  }

  const notMeasured = a.takeoff.coverage.filter((c) => c.state === 'NOT_MEASURED').length;
  if (notMeasured > 0) {
    parts.push(
      `This is the carbon of the MEASURED work only — ${notMeasured} `
      + `trade${notMeasured === 1 ? '' : 's'} in the take-off's coverage table `
      + `${notMeasured === 1 ? 'is' : 'are'} NOT MEASURED and therefore contribute nothing here.`,
    );
  }
  parts.push('Scope: product stage A1–A3 (cradle to gate). Transport to site, construction, use, '
    + 'end of life and reuse (A4–A5, B, C, D) are NOT included.');

  return parts.join(' ');
}
