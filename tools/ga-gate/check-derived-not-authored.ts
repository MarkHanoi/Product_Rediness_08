#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-derived-not-authored.ts
 *
 * C75 §2.2 / §2.6 / §2.7 · HARD — **no path writes AUTHORED for a value the
 * system produced.**
 *
 * ─── Why this gate exists ────────────────────────────────────────────────────
 * `authored` is the one origin the system may never invent (C75 §1.1): it is
 * the claim that a HUMAN decided, it survives regeneration passes that would
 * overwrite machine output, and it exports as a user decision. The same harm
 * has a second spelling that never says "authored" at all: a fallback that
 * silently upgrades an ABSENT origin to the most-authoritative member of some
 * origin-like union. That was PV-01 —
 *
 *     detectionMethod: (rawBoundary['detectionMethod'] as any) || 'auto-topology',
 *     (packages/room-topology/src/roomSnapshotUtils.ts:156, as it stood until
 *      2026-08-12)
 *
 * — where a snapshot with NO recorded origin loaded as "detected by topology",
 * and worse: two of `RoomDetectionMethod`'s members (`manual-boundary`,
 * `point-pick`) translate to AUTHORED in the L0 vocabulary
 * (`apps/editor/src/engine/provenance/ElementProvenanceIndex.ts`), so this
 * union is one keystroke away from minting a human decision out of a missing
 * field.
 *
 * ⚠ **PV-01 IS FIXED, AND THIS GATE IS THEREFORE GREEN ON ITS FIRST RUN — read
 * that as the weaker evidence it is.** C75 §7 exit condition 1 was closed in the
 * same change that built this gate: `readBoundaryOrigin()` now records
 * `origin-unknown` with a `ProvenanceUnknownReason`. So this gate has NEVER been
 * watched failing against the live defect it was written for, and a gate whose
 * only red is synthetic is exactly what C74 §0 warns about. What stands in its
 * place, deliberately and by name: A2's planted control is PV-01's EXACT
 * expression, character for character (`packages/p/src/a2.ts` below), driven
 * through the same analyser on every single run. The arm is proven; it is
 * proven against a reconstruction rather than against history, and that
 * distinction is recorded here rather than left for a reader to assume the
 * stronger one.
 *
 * ─── The arms ────────────────────────────────────────────────────────────────
 *  A1  §2.2 HARD — `'authored'` supplied as a FALLBACK for an absent input:
 *      `?? 'authored'`, `|| 'authored'`, or a destructure default. Any field,
 *      anywhere: there is NO context in which an absent value becomes a human
 *      decision.
 *  A2  §2.2 HARD — the silent upgrade: a fallback supplying an AUTHORITATIVE
 *      member of a NAMED origin-like union, on a provenance-anchored field.
 *      The member table is hand-named WITH its reason (the C73 §3.3 exclusion
 *      discipline, applied to inclusion): each row says why defaulting to that
 *      member overstates. PV-01 was this arm's motivating case; it is fixed, so
 *      the arm's live subject today is any SECOND deserialiser growing the same
 *      shape (see the header caveat).
 *  A3  §2.2 HARD — minting authorship outside the single constructor:
 *      `origin: 'authored'` in an object literal, or `.default('authored')`,
 *      anywhere except `ValueOrigin.ts` itself. `authoredProvenance()` exists
 *      precisely so a grep for human-decision claims finds ONE site; a literal
 *      elsewhere defeats that.
 *  A4  §2.6 HARD — a READ-side upgrade: `x.origin ?? '<member>'` (or `||`).
 *      A consumer that defaults an unknown origin while reading presents the
 *      value as more authoritative than its record — §2.6's forbidden claim,
 *      made at the point of consumption instead of the point of storage.
 *  A5  §2.7 — `origin: 'regenerated'` in an object literal with no `replaced`
 *      nearby (same literal, 8-line window) and not built via
 *      `regeneratedProvenance()`. A regeneration that names no prior value is
 *      indistinguishable from one that never overwrote anything.
 *
 * ─── Deliberately NOT duplicated here ────────────────────────────────────────
 * `check-provenance-not-invented` V1 already reports EVERY member-fallback on a
 * discovered vocabulary, at declared-level, on its own ledger. This gate is the
 * HARD subset — the fallbacks that mint authorship or upgrade to the strongest
 * claim — kept at declared 0 so a new instance can never be absorbed as debt.
 * One defect (PV-01) appearing on both gates was intended: the ratchet gate
 * carried it as declared debt while THIS gate stayed red until it was actually
 * fixed. It is now fixed and has left BOTH ledgers in the same commit — the
 * ratchet gate's own both-directions check (exit 3, STALE) is what forced that,
 * and it fired.
 *
 * ─── What this gate CANNOT see (C75 §6.3 — stated, never inferred) ───────────
 *   • SEMANTIC truth — a path that hard-codes `authoredProvenance('…')` around
 *     machine output calls the blessed constructor and passes every arm. The
 *     constructor makes the claim greppable, not honest.
 *   • runtime provenance — an origin decided by a branch;
 *   • §2.7 across sessions — an overwrite whose prior value lived in a
 *     previous run is invisible to a source scan;
 *   • §2.6 in prose — a chat answer DESCRIBING an inferred wall as the user's
 *     is generated text, not source.
 *
 * ─── Honesty floors (exit 2, NEVER absorbable — C75 §6.1, C70 §5.2) ──────────
 *   • source files scanned          ≥ 500
 *   • authoritative-member table    ≥ 2 vocabularies
 *   • executed controls passed      = 1
 *   • distinct arms proven to fire  ≥ 5   (A1..A5, in the planted tree)
 *
 * ─── Negative control — EXECUTED ON EVERY RUN (C75 §6.2) ─────────────────────
 * `selfTest()` drives the analyser over a PLANTED tree (all five arms must
 * fire) and a CLEAN tree (the CORRECT shapes — `?? 'inferred'` with detail,
 * `unknownProvenance(...)` at a deserialisation boundary, and
 * `regeneratedProvenance(prior, …)` — must read 0; an arm that flags the fix
 * trains authors to remove it).
 *
 * Exit 0 clean · 1 never (declared 0 — hard) · 2 MISCONFIGURED · 3 any
 * finding. 2 and 3 are never absorbable as declared debt (C70 §5.1).
 */

import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { walk, relPath, stripCommentsToLines } from './lib/sourceScan.js';
import { reportGate, type Floor, type GateResult } from '../rac-conformance/certification/contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const GATE = 'check-derived-not-authored';
const DIRS = ['packages', 'plugins', 'apps', 'src'] as const;

/** The single file allowed to spell `origin: 'authored'` — the constructor's home. */
const CONSTRUCTOR_FILE = 'packages/schemas/src/provenance/ValueOrigin.ts';

/**
 * A2's table: origin-like unions whose named members OVERSTATE when supplied
 * as a default. Each row carries its reason — inclusion is argued, not
 * pattern-matched, so the table cannot silently grow to flag half the repo.
 *
 * ⚠ This table names UNIONS AND MEMBERS, not files: the arm fires wherever a
 * provenance-anchored FIELD (see FIELD_ANCHOR) falls back to one of these
 * literals, so a second deserialiser growing the PV-01 shape is caught the day
 * it lands.
 */
const AUTHORITATIVE_MEMBERS: ReadonlyArray<{
  readonly vocabulary: string;
  readonly member: string;
  readonly why: string;
}> = [
  {
    vocabulary: 'ValueOrigin (canonical, C75 §1)',
    member: 'authored',
    why: 'the claim a HUMAN decided — the one origin the system may never invent (C75 §1.1)',
  },
  {
    vocabulary: 'ValueOrigin (canonical, C75 §1)',
    member: 'observed',
    why: 'the claim a source of record supplied it — a default wearing it exports as a surveyed fact (C75 §2.2 names inferred as the ONLY permitted default)',
  },
  {
    vocabulary: 'ValueOrigin (canonical, C75 §1)',
    member: 'computed',
    why: 'the claim of deterministic entailment — defaulting it merges COMPUTED into INFERRED, the exact collapse C75 §1.2 forbids',
  },
  {
    vocabulary: 'RoomDetectionMethod (packages/room-topology)',
    member: 'auto-topology',
    why: "flood-fill from the wall graph — the union's most authoritative machine origin; PV-01 defaulted to it at a boundary that KNEW it did not know (fixed 2026-08-12; the member stays on this table because the NEXT deserialiser is the subject)",
  },
  {
    vocabulary: 'RoomDetectionMethod (packages/room-topology)',
    member: 'manual-boundary',
    why: 'translates to AUTHORED in the L0 vocabulary (ElementProvenanceIndex) — a default here mints a human decision',
  },
  {
    vocabulary: 'RoomDetectionMethod (packages/room-topology)',
    member: 'point-pick',
    why: 'translates to AUTHORED in the L0 vocabulary — the user "clicked to declare this room"; a default fabricates that click',
  },
  {
    vocabulary: 'Floor/CeilingDetectionMethod (packages/core-app-model)',
    member: 'manual-polygon',
    why: 'the drew-it-by-hand member of both unions — a default here mints authorship for the floor/ceiling family',
  },
];

/**
 * A2/A4 fire only on fields whose NAME carries a provenance claim. Anchoring
 * both ends (field + member) is what keeps `createdBy ?? 'user'` — an actor
 * id, not an origin — out of a hard gate: the sibling ratchet gate measured 74
 * findings when anchored on the member alone, most of them that shape.
 */
const FIELD_ANCHOR = 'detectionMethod|origin|provenance|[a-zA-Z_$]*[Pp]rovenance|[a-zA-Z_$]*Origin';

interface Finding { readonly arm: 'A1' | 'A2' | 'A3' | 'A4' | 'A5'; readonly key: string; readonly detail: string }

interface Analysis { readonly findings: Finding[]; readonly filesScanned: number }

function analyse(root: string, dirs: readonly string[]): Analysis {
  const findings: Finding[] = [];

  const memberAlt = [...new Set(AUTHORITATIVE_MEMBERS.map((m) => m.member))]
    .map((m) => m.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&'))
    .join('|');
  const whyOf = (member: string): string =>
    AUTHORITATIVE_MEMBERS.filter((r) => r.member === member)
      .map((r) => `${r.vocabulary}: ${r.why}`)
      .join(' · ');

  // A1 — 'authored' as a fallback, on ANY field.
  const A1 = /(?:\?\?|\|\|)\s*['"]authored['"]|[{,]\s*[A-Za-z_$][\w$]*\s*=\s*['"]authored['"]/;
  // A2 — an authoritative member as a fallback, on a provenance-anchored field.
  const A2 = new RegExp(`\\b(${FIELD_ANCHOR})\\s*[:=][^\\n]*(?:\\?\\?|\\|\\|)\\s*['"](${memberAlt})['"]`);
  const A2_DESTRUCTURE = new RegExp(`[{,]\\s*(${FIELD_ANCHOR})\\s*=\\s*['"](${memberAlt})['"]`);
  // A3 — authorship minted outside the constructor.
  const A3 = /\borigin\s*:\s*['"]authored['"]|\.default\(\s*['"]authored['"]\s*\)/;
  // A4 — the read-side upgrade.
  const A4 = new RegExp(`\\.\\s*origin\\s*(?:\\?\\?|\\|\\|)\\s*['"](${memberAlt})['"]`);
  // A5 — 'regenerated' with no `replaced` in reach.
  const A5 = /\borigin\s*:\s*['"]regenerated['"]/;
  const A5_OK = /\breplaced\s*:|\bregeneratedProvenance\s*\(/;

  let filesScanned = 0;
  for (const dir of dirs) {
    for (const abs of walk(join(root, dir))) {
      const rel = relPath(root, abs);
      if (/(^|\/)__tests__\//.test(rel) || /\.(test|spec|bench)\.tsx?$/.test(rel)) continue;
      let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      filesScanned++;
      const isConstructorFile = rel === CONSTRUCTOR_FILE;
      const lines = stripCommentsToLines(src);

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]!;

        if (A1.test(l)) {
          findings.push({
            arm: 'A1',
            key: `A1::${rel}:${i + 1}:'authored' supplied as a fallback`,
            detail: `${rel}:${i + 1} — \`${l.trim()}\`. C75 §2.2: an absent value never becomes a human ` +
              "decision. A defaulted value is INFERRED, and says so; 'authored' here will survive a " +
              'regeneration pass that should have replaced it, and will export as a user decision.',
          });
        }

        const a2 = A2.exec(l) ?? A2_DESTRUCTURE.exec(l);
        // A1 already reports the 'authored' spelling; A2 reports the UPGRADE spellings.
        if (a2 && a2[2] !== 'authored') {
          findings.push({
            arm: 'A2',
            key: `A2::${rel}:${i + 1}:${a2[1]} silently upgraded to '${a2[2]}'`,
            detail: `${rel}:${i + 1} — \`${l.trim()}\`. An ABSENT \`${a2[1]}\` is silently upgraded to ` +
              `'${a2[2]}' — ${whyOf(a2[2]!)}. A deserialiser reading a record without provenance knows ` +
              'exactly one thing: that the record lacks provenance. Record UNKNOWN-with-reason ' +
              '(C75 §1.4); never a member.',
          });
        }

        if (!isConstructorFile && A3.test(l)) {
          findings.push({
            arm: 'A3',
            key: `A3::${rel}:${i + 1}:authorship minted outside authoredProvenance()`,
            detail: `${rel}:${i + 1} — \`${l.trim()}\`. \`'authored'\` is written outside ` +
              `${CONSTRUCTOR_FILE}. Use \`authoredProvenance(detail)\` — it exists so ONE grep finds ` +
              'every site that claims a human acted, and so `SystemWritableOrigin` paths cannot reach ' +
              'the claim at all (C75 §2.8: unrepresentable beats checked).',
          });
        }

        const a4 = A4.exec(l);
        if (a4) {
          findings.push({
            arm: 'A4',
            key: `A4::${rel}:${i + 1}:.origin read-defaulted to '${a4[1]}'`,
            detail: `${rel}:${i + 1} — \`${l.trim()}\`. A consumer defaults an unknown origin to ` +
              `'${a4[1]}' at the point of READING — C75 §2.6: a value may be presented as at most as ` +
              'authoritative as its record. Handle the unknown case (`hasKnownOrigin`), or carry it.',
          });
        }

        if (A5.test(l) && !isConstructorFile) {
          const from = Math.max(0, i - 8);
          const to = Math.min(lines.length, i + 9);
          const window = lines.slice(from, to).join('\n');
          if (!A5_OK.test(window)) {
            findings.push({
              arm: 'A5',
              key: `A5::${rel}:${i + 1}:'regenerated' with no replaced`,
              detail: `${rel}:${i + 1} — \`${l.trim()}\` carries no \`replaced\` within reach and is not ` +
                'built via `regeneratedProvenance(prior, …)`. C75 §2.7: a regeneration that leaves no ' +
                'trace of the prior value is indistinguishable from one that never overwrote anything — ' +
                'the most expensive defect in the contract and the hardest to detect after the fact.',
            });
          }
        }
      }
    }
  }
  return { findings, filesScanned };
}

// ─── Executed controls (C75 §6.2) ────────────────────────────────────────────

function writeTree(base: string, files: Record<string, string>): void {
  rmSync(base, { recursive: true, force: true });
  for (const [p, body] of Object.entries(files)) {
    const abs = join(base, p.split('/').join(sep));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
}

const PLANTED = {
  'packages/p/src/a1.ts': [
    'export function withDefaults(opts: { source?: string }): { source: string } {',
    "  return { source: opts.source ?? 'authored' };",   // A1
    '}',
  ].join('\n'),
  'packages/p/src/a2.ts': [
    'export function load(raw: Record<string, unknown>): { detectionMethod: string } {',
    "  return { detectionMethod: (raw['detectionMethod'] as string) || 'auto-topology' };",   // A2 — PV-01's exact shape
    '}',
  ].join('\n'),
  'packages/p/src/a3.ts': [
    'export function mint(detail: string) {',
    "  return { origin: 'authored', detail };",   // A3
    '}',
  ].join('\n'),
  'packages/p/src/a4.ts': [
    "import type { ValueProvenance } from '../../schemas/src/provenance/ValueOrigin.js';",
    'export function describe(p: ValueProvenance): string {',
    "  return String(p.origin ?? 'computed');",   // A4
    '}',
  ].join('\n'),
  'packages/p/src/a5.ts': [
    'export function overwrite(detail: string) {',
    "  return { origin: 'regenerated', detail };",   // A5 — no `replaced`
    '}',
  ].join('\n'),
};

const CLEAN = {
  // The CORRECT shapes. None may fire — an arm that flags the fix trains
  // authors to remove it.
  'packages/q/src/defaults.ts': [
    // §2.2's own prescription: a supplied default is inferred, and says so.
    'export function withDefaults(opts: { origin?: string }): { origin: string; detail: string } {',
    "  return { origin: opts.origin ?? 'inferred', detail: 'defaulted because the model needs a value' };",
    '}',
  ].join('\n'),
  'packages/q/src/load.ts': [
    "import { unknownProvenance } from '../../schemas/src/provenance/ValueOrigin.js';",
    'export function load(raw: Record<string, unknown>) {',
    "  const p = raw['provenance'];",
    "  return typeof p === 'string' ? { provenance: p } : { provenance: unknownProvenance('predates-provenance') };",
    '}',
  ].join('\n'),
  'packages/q/src/regen.ts': [
    "import { regeneratedProvenance, type ValueProvenance } from '../../schemas/src/provenance/ValueOrigin.js';",
    'export function overwrite(prior: ValueProvenance) {',
    "  return regeneratedProvenance(prior, 'regenerated by the layout pass');",
    '}',
  ].join('\n'),
};

function selfTest(): { ok: boolean; lines: string[]; armsFired: string[] } {
  const base = join(tmpdir(), `pryzm-${GATE}-selftest`);
  const lines: string[] = [];
  let armsFired: string[] = [];
  let ok = true;
  try {
    writeTree(join(base, 'planted'), PLANTED);
    writeTree(join(base, 'clean'), CLEAN);
    const bad = analyse(join(base, 'planted'), ['packages']);
    const good = analyse(join(base, 'clean'), ['packages']);
    const fired = new Set(bad.findings.map((f) => f.arm));
    armsFired = [...fired].sort();
    lines.push(`negative control (planted tree): ${bad.findings.length} finding(s), arms fired = [${armsFired.join(', ')}]`);
    for (const f of bad.findings) lines.push(`    ✓ ${f.arm} fired — ${f.key}`);
    lines.push(`positive control (clean tree — inferred default, UNKNOWN at the boundary, regeneratedProvenance): ${good.findings.length} finding(s) — must be 0`);
    for (const f of good.findings) lines.push(`    ✗ FALSE POSITIVE — ${f.key}`);
    for (const arm of ['A1', 'A2', 'A3', 'A4', 'A5']) {
      if (!fired.has(arm as Finding['arm'])) { ok = false; lines.push(`    ✗ BLIND COMPARATOR — ${arm} did not fire on a deliberately planted violation.`); }
    }
    if (good.findings.length > 0) { ok = false; lines.push('    ✗ BLIND COMPARATOR — the clean tree was called dirty.'); }
  } catch (e) {
    ok = false; lines.push(`    ✗ self-test threw: ${(e as Error).message}`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  return { ok, lines, armsFired };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const control = selfTest();
console.log(`\n[${GATE}] executed controls (C75 §6.2 — an arm never watched failing is UNPROVEN):`);
for (const l of control.lines) console.log('   ' + l);

const a = analyse(ROOT, DIRS);

const lines: string[] = [];
lines.push(`files scanned: ${a.filesScanned} · authoritative-member table: ${AUTHORITATIVE_MEMBERS.length} rows over ${new Set(AUTHORITATIVE_MEMBERS.map((m) => m.vocabulary)).size} vocabularies`);
lines.push('  the table, with the reason each member overstates as a default:');
for (const m of AUTHORITATIVE_MEMBERS) lines.push(`    '${m.member}'  (${m.vocabulary}) — ${m.why}`);
lines.push('  arms: A1 §2.2 authored-as-fallback · A2 §2.2 silent upgrade · A3 §2.2 authorship outside the constructor · A4 §2.6 read-side upgrade · A5 §2.7 regenerated-without-replaced — all EVALUATED, all HARD (declared 0)');
lines.push(
  '  CANNOT SEE (C75 §6.3, stated so silence is never read as coverage): a semantically false ' +
  '`authoredProvenance()` call around machine output; an origin decided at runtime by a branch; ' +
  'cross-session overwrites; §2.6 violations in generated prose.',
);
lines.push('');
for (const f of a.findings) lines.push(`FINDING ${f.arm} — ${f.detail}`);

const floors: Floor[] = [
  { what: 'source files scanned', measured: a.filesScanned, min: 500 },
  { what: 'authoritative-member vocabularies in the table', measured: new Set(AUTHORITATIVE_MEMBERS.map((m) => m.vocabulary)).size, min: 2 },
  { what: 'executed controls passed (0 = blind comparator)', measured: control.ok ? 1 : 0, min: 1 },
  { what: 'distinct arms proven to fire against a planted violation', measured: control.armsFired.length, min: 5 },
];

const result: GateResult = {
  gate: GATE,
  floors,
  lines,
  findings: a.findings.length,
  // HARD: no ledger, no baseline. Any finding is exit 3 and is never absorbable.
  declared: 0,
  findingNames: a.findings.map((f) => f.key),
};

process.exit(reportGate(result));
