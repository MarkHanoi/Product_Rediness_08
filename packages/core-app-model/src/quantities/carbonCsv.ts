/**
 * carbonCsv / scheduleCsv — 6D and 4D leave the app carrying their own honesty.
 *
 * Layer: L2 — packages/core-app-model
 * ADR:   ADR-0351 §EXPORT
 *
 * ⭐ THE RULE THESE EXPORTS ENCODE. A CSV that drops the coverage statement turns
 * an honest figure into a complete-looking one the moment it leaves the product —
 * and a spreadsheet is exactly where a carbon number acquires authority. So:
 *
 *   • every unmeasured cell is the literal text `NOT MEASURED`, never blank and
 *     never `0` — a blank cell sums to zero in every spreadsheet ever written;
 *   • every measured carbon row carries its FACTOR, its DATASET, its GEOGRAPHY
 *     and its VERIFICATION STATE in adjacent columns, so the number and its
 *     provenance cannot be separated by deleting a comment;
 *   • the gap ledger is appended as a second block, as the take-off's coverage
 *     table already is;
 *   • every 4D duration column is headed `Duration (calendar days, USER-ENTERED)`,
 *     because the header is the only part of a CSV that survives being pasted.
 */

import type { CarbonResult } from './CarbonModel.js';
import type { TakeoffResult } from './TakeoffTypes.js';
import { UNIT_LABEL } from './TakeoffTypes.js';
import type { ResolvedTask, ScheduleCoverage } from './ScheduleModel.js';
import { taskFinishDate } from '@pryzm/schemas/construction';

function esc(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const NOT_MEASURED = 'NOT MEASURED';

/** 6D as CSV — one row per (line × material), then the gap ledger. */
export function carbonToCsv(takeoff: TakeoffResult, carbon: CarbonResult): string {
  const rows: string[] = [];
  rows.push('# PRYZM 6D - embodied carbon (A1-A3, cradle to gate)');
  rows.push(`# Generated,${new Date(takeoff.generatedAt).toISOString()}`);
  rows.push(`# ${esc(carbon.summary.coverageStatement)}`);
  rows.push(`# Total kgCO2e (measured rows only),${carbon.summary.totalKgCO2e}`);
  rows.push('');
  rows.push([
    'Line code', 'Chapter', 'Line description', 'Line quantity', 'Line unit',
    'Material id', 'Material', 'Part', 'Volume m3', 'Density kg/m3', 'Mass kg',
    'Factor', 'Factor unit', 'Scope', 'Dataset', 'Geography', 'Year',
    'Verification', 'Provenance', 'kgCO2e', 'Source', 'Qualifier',
  ].map(esc).join(','));

  for (const cl of carbon.lines) {
    if (cl.materials.length === 0) {
      rows.push([
        cl.line.code, cl.line.chapter, cl.line.description, cl.line.quantity, UNIT_LABEL[cl.line.unit],
        '', NOT_MEASURED, 'line names no material', cl.unmeasuredVolumeM3 || '',
        NOT_MEASURED, NOT_MEASURED, NOT_MEASURED, '', '', '', '', '', '', '',
        NOT_MEASURED, '', 'This take-off line carries no material reference, so it cannot be asked about.',
      ].map(esc).join(','));
      continue;
    }
    for (const m of cl.materials) {
      const f = m.factor;
      rows.push([
        cl.line.code, cl.line.chapter, cl.line.description, cl.line.quantity, UNIT_LABEL[cl.line.unit],
        m.materialId, m.materialLabel ?? NOT_MEASURED, m.note ?? '', m.volumeM3,
        m.density ? m.density.kgPerM3 : NOT_MEASURED,
        m.massKg === null ? NOT_MEASURED : m.massKg,
        f ? f.value : NOT_MEASURED, f?.unit ?? '', f?.scope ?? '',
        f?.dataset ?? '', f?.geography ?? '', f?.year ?? '',
        f?.verification ?? '', f?.provenance ?? '',
        m.kgCO2e === null ? NOT_MEASURED : m.kgCO2e,
        f?.source ?? '', f?.qualifier ?? m.gapNote,
      ].map(esc).join(','));
    }
  }

  rows.push('');
  rows.push('# CHAPTER TOTALS - measured rows only. A chapter absent below measured nothing; it is not zero-carbon.');
  rows.push(['Chapter', 'kgCO2e', 'Measured m3', 'Unmeasured m3'].map(esc).join(','));
  for (const c of carbon.chapters) {
    rows.push([c.chapter, c.kgCO2e, c.measuredVolumeM3, c.unmeasuredVolumeM3].map(esc).join(','));
  }

  rows.push('');
  rows.push('# GAP LEDGER - volume that carries a material but NO usable factor. This is unmeasured carbon, NOT zero carbon.');
  rows.push(['Material id', 'Material', 'Reason', 'Volume m3', 'Line codes', 'Note'].map(esc).join(','));
  for (const g of carbon.gaps) {
    rows.push([
      g.materialId, g.materialLabel ?? '', g.reason, g.volumeM3, g.lineCodes.join(' '), g.note,
    ].map(esc).join(','));
  }
  return rows.join('\r\n');
}

/**
 * 4D as CSV — one row per task, then the coverage statement.
 *
 * ⚠ Takes the RESOLVED tasks, not the raw `ConstructionSchedule`. A raw task
 * knows its line codes; only a resolved one knows the elements and quantities
 * those codes reach in the CURRENT take-off, and which of them no longer resolve.
 * Passing both would let a caller export a schedule and a resolution of a
 * DIFFERENT schedule, which is a whole class of bug this signature cannot have.
 */
export function scheduleToCsv(
  resolved: readonly ResolvedTask[],
  coverage: ScheduleCoverage,
): string {
  const rows: string[] = [];
  rows.push('# PRYZM 4D - construction programme');
  rows.push(`# Generated,${new Date().toISOString()}`);
  rows.push(`# ${esc(coverage.coverageStatement)}`);
  rows.push('');
  rows.push([
    'Task id', 'Task', 'Chapter', 'Start (YYYY-MM-DD)', 'Finish (YYYY-MM-DD)',
    'Duration (calendar days, USER-ENTERED)', 'Duration source',
    'Take-off line codes', 'Quantities', 'Elements', 'Element IDs',
    'Depends on (RECORDED, NOT SOLVED)', 'Unresolved line codes', 'Defects', 'Notes',
  ].map(esc).join(','));
  for (const r of resolved) {
    rows.push([
      r.task.id, r.task.name, r.task.chapter ?? '',
      r.task.startDate, taskFinishDate(r.task) ?? 'INVALID',
      r.task.durationDays, r.task.durationSource,
      r.task.lineCodes.join(' '),
      r.quantities.map((q) => `${q.code}: ${q.quantity} ${UNIT_LABEL[q.unit]}`).join(' | '),
      r.elementIds.length, r.elementIds.join(' '),
      r.task.dependsOn.join(' '),
      r.unresolvedLineCodes.join(' '),
      r.defects.join(' | '),
      r.task.notes ?? '',
    ].map(esc).join(','));
  }
  rows.push('');
  rows.push('# UNSCHEDULED TAKE-OFF LINES - measured work no task covers. NOT "not yet built": nobody has said when it is built.');
  rows.push(['Line code'].map(esc).join(','));
  for (const c of coverage.unscheduledLineCodes) rows.push(esc(c));
  return rows.join('\r\n');
}
