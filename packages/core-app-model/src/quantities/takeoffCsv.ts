/**
 * takeoffCsv — export a *medición* and import a rate book.
 *
 * Layer:    L2 — packages/core-app-model
 * ADR:      ADR-0350 §MEDICIONES
 *
 * The export carries the BASIS and the QUALIFIERS alongside every quantity, and
 * appends the COVERAGE table as a second block. A CSV that leaves the coverage
 * table behind turns an honest take-off into a complete-looking one the moment it
 * leaves the app — which is precisely the failure this whole module is built to
 * avoid. The element-id column makes each row checkable against the model.
 */

import type { TakeoffResult } from './TakeoffTypes.js';
import { UNIT_LABEL } from './TakeoffTypes.js';
import type { CostedTakeoff, RateEntry, RateBook } from './CostModel.js';

function esc(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_HEADER = [
  'Code', 'Chapter', 'Description', 'Unit', 'Quantity',
  'Elements', 'Element IDs', 'Basis', 'Qualifiers', 'Secondary measures',
];

/** The take-off as CSV — quantities, provenance, then the coverage table. */
export function takeoffToCsv(result: TakeoffResult): string {
  const rows: string[] = [];
  rows.push('# PRYZM medición / quantity take-off');
  rows.push(`# Generated,${new Date(result.generatedAt).toISOString()}`);
  rows.push(`# Elements measured,${result.measuredElementCount}`);
  if (result.unreadableStores.length > 0) {
    rows.push(`# STORES NOT REACHABLE (families below may be incomplete),${esc(result.unreadableStores.join(' | '))}`);
  }
  rows.push('');
  rows.push(CSV_HEADER.map(esc).join(','));
  for (const l of result.lines) {
    rows.push([
      l.code, l.chapter, l.description, UNIT_LABEL[l.unit], l.quantity,
      l.elementIds.length, l.elementIds.join(' '), l.basis,
      l.qualifiers.join(' | '),
      l.secondary.map((s) => `${s.label}: ${s.value} ${UNIT_LABEL[s.unit]}`).join(' | '),
    ].map(esc).join(','));
  }
  rows.push('');
  rows.push('# COVERAGE — what is measured and what is NOT. A family marked NOT_MEASURED contributes NO line above; it is absent, not zero.');
  rows.push(['Family', 'State', 'Note'].map(esc).join(','));
  for (const c of result.coverage) rows.push([c.family, c.state, c.note].map(esc).join(','));
  return rows.join('\r\n');
}

/** A costed take-off as CSV. Unpriced cells are the literal text `NO RATE`. */
export function costedTakeoffToCsv(result: TakeoffResult, costed: CostedTakeoff): string {
  const cur = costed.summary.currency ?? '';
  const rows: string[] = [];
  rows.push('# PRYZM medición + 5D cost');
  rows.push(`# Generated,${new Date(result.generatedAt).toISOString()}`);
  rows.push(`# ${esc(costed.summary.coverageStatement)}`);
  rows.push('');
  rows.push([...CSV_HEADER, `Rate (${cur})`, 'Rate source', `Amount (${cur})`].map(esc).join(','));
  for (const c of costed.lines) {
    const l = c.line;
    rows.push([
      l.code, l.chapter, l.description, UNIT_LABEL[l.unit], l.quantity,
      l.elementIds.length, l.elementIds.join(' '), l.basis,
      l.qualifiers.join(' | '),
      l.secondary.map((s) => `${s.label}: ${s.value} ${UNIT_LABEL[s.unit]}`).join(' | '),
      c.rate == null ? (c.unpricedReason === 'UNIT_MISMATCH' ? 'UNIT MISMATCH' : 'NO RATE') : c.rate,
      c.source ?? '',
      c.amount == null ? 'NOT PRICED' : c.amount,
    ].map(esc).join(','));
  }
  rows.push('');
  rows.push(`# Priced total (${cur}),${costed.summary.pricedTotal}`);
  rows.push(`# ${esc(costed.summary.coverageStatement)}`);
  rows.push('');
  rows.push('# COVERAGE');
  rows.push(['Family', 'State', 'Note'].map(esc).join(','));
  for (const c of result.coverage) rows.push([c.family, c.state, c.note].map(esc).join(','));
  return rows.join('\r\n');
}

/** The rate book alone, so a user can round-trip it between projects. */
export function rateBookToCsv(book: RateBook): string {
  const rows = [`# PRYZM rate book,currency,${esc(book.currency)}`, ['Code', 'Rate', 'Unit', 'Source'].map(esc).join(',')];
  for (const e of book.entries) rows.push([e.lineCode, e.rate, e.unit, e.source].map(esc).join(','));
  return rows.join('\r\n');
}

// ── Import ────────────────────────────────────────────────────────────────────

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

export interface RateImportResult {
  readonly entries: readonly RateEntry[];
  readonly currency: string | null;
  /** One line per row that was NOT imported, saying which row and why. */
  readonly rejected: readonly string[];
}

/**
 * Parse a rate CSV — `Code, Rate, Unit, Source`, header row optional.
 *
 * Rejects rather than coerces: a row with an unparseable rate, an unknown unit
 * or a missing code is listed in `rejected` with its reason. Nothing is silently
 * defaulted to zero, because a zero rate reads as "free", and free is a price.
 */
export function parseRateCsv(text: string): RateImportResult {
  const entries: RateEntry[] = [];
  const rejected: string[] = [];
  let currency: string | null = null;
  const units = new Set(['m', 'm2', 'm3', 'ud', 'kg']);

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    if (raw.startsWith('#')) {
      const m = /currency\s*,\s*([A-Za-z]{3})/i.exec(raw);
      if (m) currency = m[1].toUpperCase();
      continue;
    }
    const cells = splitCsvLine(raw).map((c) => c.trim());
    if (cells[0]?.toLowerCase() === 'code') continue; // header
    const [code, rateRaw, unitRaw, source] = cells;
    if (!code) { rejected.push(`Row ${i + 1}: no line code — skipped.`); continue; }
    const rate = Number(String(rateRaw ?? '').replace(/[^0-9.\-]/g, ''));
    if (!Number.isFinite(rate) || rate < 0) {
      rejected.push(`Row ${i + 1} (${code}): rate "${rateRaw ?? ''}" is not a usable number — skipped, NOT treated as 0.`);
      continue;
    }
    const unit = (unitRaw ?? '').toLowerCase().replace('m²', 'm2').replace('m³', 'm3');
    if (!units.has(unit)) {
      rejected.push(`Row ${i + 1} (${code}): unit "${unitRaw ?? ''}" is not one of m / m2 / m3 / ud / kg — skipped.`);
      continue;
    }
    entries.push({ lineCode: code, rate, unit: unit as RateEntry['unit'], source: source ?? '' });
  }
  return { entries, currency, rejected };
}
