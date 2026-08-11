// ─── §6 certification-format rows + machine-readable emission ────────────────
//
// One row per capability, seven chain links each stamped independently.
// RULE: partial evidence is NEVER promoted — `statusOf` can only answer
// VERIFIED when every link it measures is PROVEN *and* no measured link failed;
// since Collaboration is UNPROVEN by construction (no transport), the ceiling
// for every row in this harness is PARTIALLY VERIFIED.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type LinkVerdict = string; // e.g. 'PROVEN — …' | 'FAIL — …' | 'UNPROVEN — …' | 'REFUSES-CORRECTLY — …'

export interface CertRow {
  capability: string;
  intent: string;
  command: string;
  authoritativeState: LinkVerdict; // before → after, executed read-back
  geometry: LinkVerdict;
  persistence: LinkVerdict;
  undo: LinkVerdict;
  redo: LinkVerdict;
  collaboration: LinkVerdict;
  report: LinkVerdict;
  status: 'VERIFIED' | 'PARTIALLY VERIFIED' | 'UNPROVEN' | 'FAILED';
  evidence: string[];
}

const verdictClass = (v: LinkVerdict): 'proven' | 'fail' | 'unproven' | 'na' => {
  if (/^(PROVEN|REFUSES-CORRECTLY)/.test(v)) return 'proven'; // a delivered, named refusal is correct behaviour
  if (/^(FAIL|SILENT)/.test(v)) return 'fail';
  if (/^n\/a/.test(v)) return 'na';
  return 'unproven';
};

/** Derive the row status from its own links — never hand-assigned. */
export function statusOf(row: Omit<CertRow, 'status'>): CertRow['status'] {
  const links = [row.authoritativeState, row.geometry, row.persistence, row.undo, row.redo, row.collaboration, row.report];
  const classes = links.map(verdictClass);
  if (classes.includes('fail')) return 'FAILED';
  const measured = classes.filter((c) => c !== 'na');
  if (measured.every((c) => c === 'proven')) return 'VERIFIED'; // unreachable while Collaboration is UNPROVEN — by design
  if (measured.some((c) => c === 'proven')) return 'PARTIALLY VERIFIED';
  return 'UNPROVEN';
}

export function finishRow(row: Omit<CertRow, 'status'>): CertRow {
  return { ...row, status: statusOf(row) };
}

const RESULTS_DIR = resolve(__dirname, 'results');

export function writeResults(file: string, payload: unknown): string {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const p = resolve(RESULTS_DIR, file);
  writeFileSync(p, JSON.stringify(payload, null, 2));
  return p;
}
