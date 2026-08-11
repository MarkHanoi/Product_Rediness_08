// ─── GATE · check-derived-regenerable ────────────────────────────────────────
//
// Wave 3 of docs/03-execution/plans/BIM20-ACCEPTANCE-10-OF-10.md:
//
//   "rebuild-from-authoritative vs restored snapshot; the persist-or-lose list
//    must be a NAMED, SHRINKING ledger, not a surprise."
//
// The measurement is `__tests__/regenerable.cert.ts` — read its header for why
// a THIRD state (serialize the RESTORED model and reload it again) is what turns
// "is this field derived?" from an opinion into an arithmetic:
//
//   differs A1→A2, identical A2→A3  → REGENERABLE   (the restore reaches a fixed
//                                     point; the wire need not carry the field)
//   differs A1→A2 AND A2→A3         → PERSIST-OR-LOSE (every cycle mints a new
//                                     value; the authored one is destroyed)
//
// THIS GATE GRADES THE SECOND LIST ONLY, against a NAMED ledger. The rules:
//   * a persist-or-lose field NOT in the ledger is a finding — the surprise the
//     criterion forbids;
//   * a ledger entry no longer measured is STALE and exits 3 — a paid debt that
//     stays on the books is where the next regression hides;
//   * the ledger may only ever SHRINK.
//
// NOTE ON WHAT THIS GATE DOES *NOT* CLAIM. A field landing in REGENERABLE is not
// thereby blessed. C13 §2 asks for byte-compatible snapshots, and a field that is
// deterministically recomputed to a value the author never wrote is still a
// round-trip divergence — Harness 1 reports it, and its documented-tolerance list
// stays EMPTY. "Regenerable" here means only "a rebuild reproduces it", which is
// the narrow, mechanical fact this harness can actually establish.

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type GateResult, type Floor } from '../contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const R = resolve(__dirname, '../results/regenerable.json');
const LEDGER = resolve(__dirname, 'derived-ledger.json');

interface Artefact {
  recordsA1?: number;
  kindsCaptured?: number;
  roundTripErrors?: string[];
  regenerable?: string[];
  persistOrLose?: string[];
  seedOutcomes?: Record<string, string>;
}
interface Ledger { '//': string[]; persistOrLose: string[] }

const floors: Floor[] = [];
const lines: string[] = [];
const findingNames: string[] = [];
const stale: string[] = [];

const art: Artefact | null = existsSync(R) ? (JSON.parse(readFileSync(R, 'utf8')) as Artefact) : null;
const ledger: Ledger | null = existsSync(LEDGER) ? (JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger) : null;

// ── FLOORS ───────────────────────────────────────────────────────────────────
floors.push({ what: 'results/regenerable.json exists', measured: art ? 1 : 0, min: 1 });
floors.push({ what: 'derived-ledger.json exists', measured: ledger ? 1 : 0, min: 1 });
floors.push({ what: 'records in the authored capture A1', measured: art?.recordsA1 ?? 0, min: 12 });
floors.push({ what: 'kinds captured', measured: art?.kindsCaptured ?? 0, min: 10 });
// A round trip that THREW leaves A2 ≡ A1, which would classify everything as
// "regenerable" — the most comfortable possible answer, and a false one.
floors.push({
  what: 'round trips that completed without throwing (of 2)',
  measured: 2 - (art?.roundTripErrors?.length ?? 2), min: 2,
});
const seeded = Object.values(art?.seedOutcomes ?? {}).filter((v) => v.startsWith('SEEDED')).length;
floors.push({ what: 'kinds whose subject was established (SEEDED)', measured: seeded, min: 14 });

if (art && ledger && floors.every((f) => f.measured >= f.min)) {
  const measured = art.persistOrLose ?? [];
  const declared = ledger.persistOrLose;

  lines.push(`REGENERABLE (${(art.regenerable ?? []).length}) — reaches a fixed point on rebuild, ledger-free:`);
  for (const f of (art.regenerable ?? []).slice(0, 20)) lines.push(`   ·  ${f}`);

  lines.push(`PERSIST-OR-LOSE (${measured.length}) — a NEW value every cycle; the authored one is gone:`);
  for (const f of measured) {
    if (declared.includes(f)) {
      lines.push(`   ✓  ${f}  (declared)`);
    } else {
      lines.push(`   ❌ ${f}  (UNDECLARED — this is the surprise the criterion forbids)`);
      findingNames.push(f);
    }
  }
  for (const f of declared) {
    if (!measured.includes(f)) {
      lines.push(`   ⚠  ${f}  (declared but no longer measured — strike it from derived-ledger.json)`);
      stale.push(f);
    }
  }
}

const result: GateResult = {
  gate: 'check-derived-regenerable',
  floors,
  lines,
  // Hard-0 on UNDECLARED fields. The ledger absorbs the known set; it does not
  // absorb a new one appearing, which is the whole point of naming it.
  findings: findingNames.length,
  declared: 0,
  findingNames,
  stale,
};

process.exit(reportGate(result));
