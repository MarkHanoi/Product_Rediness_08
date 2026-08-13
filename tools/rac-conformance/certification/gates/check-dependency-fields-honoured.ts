// ─── GATE · check-dependency-fields-honoured  (C79 §8 row 2 · C78 §20 U-INV-6) ─
//
// ⚠ ONE GATE, TWO CONTRACTS. C79 §8's table and C78 §20's table BOTH name a gate
// called `check-dependency-fields-honoured`, over the same fields and the same
// census. Building two would be the second-copy disease C79 §6.5 exists to forbid,
// applied to gates — and the way one fix reaches one contract. This is the single
// implementation; both contracts' exit conditions are asserted here, and its ledger
// is `dependency-fields.json`.
//
// THE INVARIANT (C79 §7.2 · C78 §3.3):
//   "For every such field, exactly one of: (a) POPULATE it on every path that
//    writes the record; or (b) REMOVE it from the schema; or (c) DECLARE it — in
//    the schema, at its declaration site — as not-yet-populated, with the owner and
//    the closing condition, and register it as a NAMED GAP per C70 §7.1.
//    Leaving it as an empty array is none of these three."
//
// WHY A NAME IS A CLAIM (§7.1). `boundingWallIds: []` makes three false statements
// at once — to a READER (who sees a dependency model), to a GREP-AUDITOR (who sees
// the field and counts the capability present), and to any FUTURE CONSUMER (who
// will find the array reliably empty and reasonably conclude the floor has no
// bounding walls). That is C72 §0's mechanism in the schema layer: a typed entry
// reads like wiring to anyone auditing by grep.
//
// ─── WHAT IT DECIDES — three arms ────────────────────────────────────────────
//   ARM 1 · CENSUS INTEGRITY. The ledger carries at least the §0.1(5) census of 14
//           dependency-naming fields, and every declared row's write site exists on
//           disk. C79 §8's minimum evidence for this gate is "dependency-naming
//           fields scanned ≥ the §0.1(5) census of 14" — asserted as a FLOOR, so a
//           shrunken ledger exits 2 rather than reading as progress. This is the
//           one rule a gate over a census most needs: you cannot make the number
//           better by deleting rows.
//   ARM 2 · DISPOSITION. Every row is one of C79 §7.2's three, or it is a FINDING.
//           EMPTY / UNREACTED / PARTIAL are all "none of the three". A row declared
//           DECLARE is verified: the annotation must ACTUALLY be at the write site,
//           carrying one of the ledger's declaration markers — a disposition of
//           "we said it's a known gap" that nobody wrote down is not (c), it is (c)
//           claimed.
//   ARM 3 · RE-MEASUREMENT, BOTH DIRECTIONS. Each row is checked against its own
//           source. An EMPTY row whose `field: []` literal is gone, or an UNREACTED
//           /PARTIAL row that has grown a real reactor, is STALE (exit 3) — debt
//           that has been paid must LEAVE the books in the commit that pays it.
//           A POPULATE row that has LOST its reactor, or whose write site has
//           acquired an empty literal, is a REGRESSION (a finding above the ledger,
//           exit 3).
//
// ─── WHAT THIS GATE CANNOT SEE ───────────────────────────────────────────────
//   (a) It cannot decide by regex which fields NAME a dependency. `hostSlabId` is
//       one; `id` is identity; `systemTypeId` is a catalogue lookup. The census was
//       made by READING, and lives in the ledger. The gate re-measures declared
//       rows; it does not discover new ones, and a field added to a schema tomorrow
//       is invisible to it until someone reads it and declares it. That limit is
//       stated rather than papered over — C78 §20.5(a)'s standing point.
//   (b) A reactor's EXISTENCE is statically visible; its CORRECTNESS is not. A
//       listener that fires and does the wrong thing passes ARM 3.
//
// Exit 0 clean · 1 declared · 2 MISCONFIGURED · 3 exceeded (contract.ts —
// imported, never copied).

import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type GateResult, type Floor } from '../contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');
const LEDGER = resolve(__dirname, 'dependency-fields.json');

/** C79 §7.2's three legal dispositions, plus the three states that are none of them. */
type Disposition = 'POPULATE' | 'REMOVE' | 'DECLARE' | 'EMPTY' | 'UNREACTED' | 'PARTIAL';
const HONOURED: ReadonlySet<Disposition> = new Set<Disposition>(['POPULATE', 'REMOVE', 'DECLARE']);

interface FieldDecl {
  id: string;
  field: string;
  declaredOn: string;
  writeSite: string;
  reactorSite?: string;
  disposition: Disposition;
  emptyLiteral?: boolean;
  why: string;
}

interface Ledger {
  fields: FieldDecl[];
  censusFloor: number;
  declaredHonoured: number;
  declarationMarkers: string[];
  declaredFindings: string[];
}

const floors: Floor[] = [];
const lines: string[] = [];
const findingNames: string[] = [];
const stale: string[] = [];

const ledger: Ledger | null = existsSync(LEDGER)
  ? (JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger)
  : null;

floors.push({ what: 'dependency-fields.json ledger present', measured: ledger ? 1 : 0, min: 1 });

// ── ARM 1 · CENSUS INTEGRITY ────────────────────────────────────────────────
// C79 §8's minimum evidence, verbatim: "dependency-naming fields scanned ≥ the
// §0.1(5) census of 14". A ledger that has SHRUNK has not improved; it has stopped
// measuring, and that is exit 2. You cannot make this number better by deletion.
floors.push({
  what: `dependency-naming fields in the census (C79 §8 minimum evidence: ≥ the §0.1(5) count of ${ledger?.censusFloor ?? 14})`,
  measured: ledger?.fields.length ?? 0,
  min: ledger?.censusFloor ?? 14,
});

function read(rel: string): string | null {
  const p = resolve(REPO, rel);
  if (!existsSync(p)) return null;
  try { return readFileSync(p, 'utf8'); } catch { return null; }
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

if (ledger) {
  let honoured = 0;
  let unhonoured = 0;

  for (const f of ledger.fields) {
    const writeText = read(f.writeSite);
    if (writeText === null) {
      // A ledger naming a file that does not exist has lost its subject.
      floors.push({ what: `write site for "${f.id}" exists on disk (${f.writeSite})`, measured: 0, min: 1 });
      continue;
    }
    const writeCode = stripComments(writeText);

    // The §7.1 anti-pattern, measured: `<field>: []` written unconditionally.
    const emptyLiteral = new RegExp(`\\b${f.field}\\s*:\\s*\\[\\s*\\]`).test(writeCode);
    // A reactor is a live listener/observer keyed on the field, in its declared site.
    const reactorText = f.reactorSite ? read(f.reactorSite) : null;
    const hasReactor =
      reactorText !== null &&
      new RegExp(`\\b${f.field}\\b`).test(stripComments(reactorText)) &&
      /(addEventListener|\.on\s*\(|\.subscribe\s*\(|Observer|Handler|SyncService|Tracker)/.test(reactorText);

    if (HONOURED.has(f.disposition)) {
      honoured++;

      if (f.disposition === 'DECLARE') {
        // (c) is only (c) if somebody actually WROTE the declaration. A disposition
        // of "it's a known gap" with no annotation at the site is (c) CLAIMED.
        const declared = ledger.declarationMarkers.some((m) => writeText.includes(m));
        if (!declared) {
          findingNames.push(`${f.id}:DECLARE claimed but no annotation at the site`);
          lines.push(
            `❌ ${f.id}: disposition DECLARE, but none of the declaration markers [${ledger.declarationMarkers.join(', ')}] ` +
            `appears in ${f.writeSite}. C79 §7.2(c) requires the not-yet-populated state be stated AT THE DECLARATION SITE, ` +
            'with the owner and the closing condition — an undocumented gap is not (c), it is the empty array with a nicer name.',
          );
        } else {
          lines.push(`✓  ${f.id}: DECLARE — annotated as a NAMED GAP at ${f.writeSite}.`);
        }
        continue;
      }

      if (f.disposition === 'POPULATE') {
        // REGRESSION arm: an honoured field that has lost its reactor, or grown the
        // empty literal, is worse than the ledger declares — exit 3, by design.
        const failures: string[] = [];
        if (emptyLiteral) failures.push(`\`${f.field}: []\` now appears at the write site — the §7.1 anti-pattern has REACHED an honoured field`);
        if (!hasReactor) failures.push(`no reactor found in ${f.reactorSite ?? '(none declared)'} — a populated field with nothing reacting to the named element changing is UNREACTED, not honoured`);
        if (failures.length > 0) {
          findingNames.push(`${f.id}:POPULATE REGRESSED`);
          lines.push(`❌ ${f.id}: declared HONOURED via POPULATE, but ${failures.join(' · ')}.`);
        } else {
          lines.push(`✓  ${f.id}: POPULATE — real ids written at ${f.writeSite}, reactor live at ${f.reactorSite}.`);
        }
        continue;
      }

      // REMOVE: the field should be gone from the write site entirely.
      if (new RegExp(`\\b${f.field}\\b`).test(writeCode)) {
        findingNames.push(`${f.id}:REMOVE claimed but the field is still written`);
        lines.push(`❌ ${f.id}: disposition REMOVE, but \`${f.field}\` still appears in ${f.writeSite}. (b) means struck from the schema.`);
      } else {
        lines.push(`✓  ${f.id}: REMOVE — the field is gone from ${f.writeSite}; the row may leave this ledger.`);
      }
      continue;
    }

    // ── None of the three: EMPTY / UNREACTED / PARTIAL — all FINDINGS ─────────
    unhonoured++;
    findingNames.push(f.id);

    if (f.disposition === 'EMPTY') {
      lines.push(
        `❌ ${f.id}: EMPTY — \`${f.field}: []\` hardcoded in ${f.writeSite}. C79 §7.1: the field's NAME is a claim. ` +
        'Written empty on every creation path it makes three false statements at once — to a reader, to a grep-auditor, ' +
        'and to any future consumer who will find the array reliably empty and reasonably conclude there are no bounding walls. ' +
        'C79 §7.2: POPULATE, REMOVE, or DECLARE — an empty array is none of the three.',
      );
      // BOTH DIRECTIONS — the literal is gone, so the row has moved.
      if (!emptyLiteral) {
        stale.push(f.id);
        lines.push(
          `⚠  STALE LEDGER ENTRY: "${f.id}" is declared EMPTY but \`${f.field}: []\` no longer appears in ${f.writeSite}. ` +
          'Re-measure the row and move it to POPULATE / REMOVE / DECLARE in the commit that fixed it.',
        );
      }
      continue;
    }

    if (f.disposition === 'PARTIAL') {
      lines.push(
        `❌ ${f.id}: PARTIAL — populated and reacted to, but for a purpose OTHER than the dependency the name promises. ` +
        `${f.why} C79 §7.3: a name that promises a host relationship while delivering a colour lookup is a partial ` +
        'honouring recorded as a full one, and it MUST say so at its declaration.',
      );
      continue;
    }

    // UNREACTED
    lines.push(
      `❌ ${f.id}: UNREACTED — \`${f.field}\` names a dependency in ${f.writeSite}, and nothing reacts to the named ` +
      `element changing. ${f.why} C78 U-INV-6: the 12-of-14 unhonoured fields reach 0 by honouring OR by deletion.`,
    );
    if (hasReactor) {
      stale.push(f.id);
      lines.push(
        `⚠  STALE LEDGER ENTRY: "${f.id}" is declared UNREACTED but a reactor keyed on \`${f.field}\` now exists in ` +
        `${f.reactorSite}. Move the row to POPULATE and strike it from declaredFindings in the commit that wired it.`,
      );
    }
  }

  lines.push(
    `CENSUS re-measured: ${ledger.fields.length} fields name a dependency · ${honoured} honoured ` +
    `(POPULATE/REMOVE/DECLARE) · ${unhonoured} are none of C79 §7.2's three. ` +
    `C79 §0.1(5)/§9(3) cite 14 fields with 2 honoured; this run measures ${ledger.fields.length} with ${honoured}.`,
  );
  // The contract's own exit condition (C79 §9(3), C78 U-INV-6) prints as a number
  // on every run, so "12 not honoured" is never inferred from a green.
  if (honoured !== ledger.declaredHonoured) {
    lines.push(
      `⚠  the honoured count (${honoured}) differs from the ledger's declaredHonoured (${ledger.declaredHonoured}) — ` +
      'if the census moved, say so in the ledger; if a field regressed, that is the finding above.',
    );
  }

  // Ledger staleness: a declared finding no longer measured.
  for (const declared of ledger.declaredFindings) {
    if (!findingNames.includes(declared)) {
      stale.push(declared);
      lines.push(
        `⚠  STALE LEDGER ENTRY: "${declared}" is declared in dependency-fields.json but no longer measured. ` +
        'Delete it from declaredFindings in the commit that fixed it.',
      );
    }
  }
}

const result: GateResult = {
  gate: 'check-dependency-fields-honoured',
  floors,
  lines,
  findings: findingNames.length,
  declared: ledger?.declaredFindings.length ?? 0,
  findingNames,
  // De-duplicated: an EMPTY row that is BOTH stale and re-listed in declaredFindings
  // would otherwise count twice and make one fix look like two.
  stale: [...new Set(stale)],
};

process.exit(reportGate(result));
