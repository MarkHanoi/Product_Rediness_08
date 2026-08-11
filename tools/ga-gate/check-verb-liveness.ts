#!/usr/bin/env tsx
/**
 * tools/ga-gate/check-verb-liveness.ts
 *
 * §CA-21-GATE — the enforcement for C16 §5.1 **CA-21**, whose exit condition is
 * **G-CA-A4**. Before this file existed, `grep -rl "CA-21" tools/ga-gate/`
 * returned NOTHING: the one rule the liveness session existed to establish was
 * CANONICAL and completely unenforced, and C16 §11.1 said so in its own table
 * (`CA-21 executed read-back — ❌ NOT ENFORCED`).
 *
 * ─── ⚠ THIS RATCHET RUNS UPWARD. READ THIS BEFORE "FIXING" IT ────────────────
 *
 * Every other ratchet in `tools/ga-gate/` is SHRINK-ONLY: a debt count that may
 * only fall. This one is GROW-ONLY. The metric is *the number of verbs whose
 * liveness is PROVEN by an executed read-back*, and proof is the good thing, so
 * the baseline may only RISE. A PR that drops a verb out of `PROVEN` fails, and
 * a PR that proves a new one fails until it adds the verb to the list below.
 * Both directions, by name, for the reason `check-verb-register.ts` gives: a
 * count lets a PR fix one verb, break another, and stay level.
 *
 * It is NOT broken when it says "PROVEN 7 of 320". Seven proven is the honest
 * reading of what a headless composition root can reach today. A baseline of 3
 * that is honest beats 50 that are inferred.
 *
 * ─── What counts as proof ───────────────────────────────────────────────────
 *
 * CA-21: *"dispatch the verb, then read the property back out of the
 * AUTHORITATIVE store"*, and explicitly NOT: `result.success === true`, a call
 * count, a spy, a patch-pair shape, or a read-back from the same DTO store the
 * handler wrote. So this gate never reads a source file to decide liveness. It
 * EXECUTES `tools/rac-conformance/runtime-harness/__tests__/liveness.probe.ts`
 * against the real `composeRuntime` root and consumes the ledger that run
 * produced. Static inference cannot promote a verb here — by construction, the
 * only input that can say PROVEN is a ledger row from an executed dispatch.
 *
 * `check-verb-register.ts` classifies statically and says so in its own header;
 * this gate is its complement, not its rival. The register answers "what
 * exists"; this answers "what has been watched to write".
 *
 * ─── The three verdicts, which are three different facts ────────────────────
 *
 *   PROVEN               executed dispatch + executed read-back agreed.
 *   UNPROVABLE-NO-STORE  the authoritative store for that element kind is ABSENT
 *                        from the composed runtime — an EXECUTED census fact, not
 *                        an assumption. `composeRuntime` composes only the
 *                        plugin-DTO half, so for wall / slab / roof / room /
 *                        ceiling / floor / furniture / plumbing / stair / column /
 *                        curtain-wall / grid / beam / handrail / opening there is
 *                        no authoritative store in this process and CA-21 is
 *                        unprovable BY CONSTRUCTION. That is a finding to report,
 *                        not a bug for this gate to hide, and it is emphatically
 *                        NOT a pass.
 *   UNKNOWN              everything else, with the reason carried: the read-back
 *                        was negative (dispatch succeeded, authoritative store
 *                        unchanged — the CA-21 lie), the dispatch threw, nothing
 *                        answered the verb on the bus, or no spec exists yet.
 *
 * Failure and emptiness are never the same value (§CONTEXT-DATA-HONESTY); "I
 * cannot reach the store" is a third fact, so there are three verdicts.
 *
 * ─── The checks ─────────────────────────────────────────────────────────────
 *
 *   V0  SUBJECT FLOOR (exit 2, never 1). The register must parse ≥ MIN_VERBS
 *       rows; the probe must exist; the harness must run and emit a ledger with
 *       ≥ MIN_LEDGER_ROWS rows and ≥ MIN_CENSUS census entries. A gate that
 *       established no subject MUST NOT be able to report a pass, and MISCONFIGURED
 *       (2) and FAILED (1) are different facts that must not alias.
 *   V1  AUTHORITATIVENESS (exit 2). Every module singleton the probe treats as
 *       authoritative must be imported by the PRODUCTION `ProjectSerializer`.
 *       That is the store PERSIST consults; without this check the probe could
 *       pick a convenient store and grade its own homework.
 *   V2  RATCHET, BOTH DIRECTIONS (exit 1). Every verb in PROVEN_BASELINE must
 *       still be PROVEN — a regression is named. Every newly PROVEN verb must be
 *       added to the list in the same commit — growth is named.
 *
 * Usage:
 *   npx tsx tools/ga-gate/check-verb-liveness.ts               # executes the harness (CI)
 *   npx tsx tools/ga-gate/check-verb-liveness.ts --from-ledger # reuse the last run (debug only)
 *
 * Exit: 0 = the proven set is intact · 1 = FAILED · 2 = MISCONFIGURED.
 */

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

const HARNESS_DIR = path.join(ROOT, 'tools', 'rac-conformance', 'runtime-harness');
const PROBE_REL = '__tests__/liveness.probe.ts';
const PROBE_ABS = path.join(HARNESS_DIR, '__tests__', 'liveness.probe.ts');
const LEDGER = path.join(HARNESS_DIR, '.liveness-output', 'liveness.json');
const REGISTER = path.join(ROOT, 'docs', '04-reference', 'API-VERB-REGISTER.md');
const SERIALIZER = path.join(ROOT, 'apps', 'editor', 'src', 'engine', 'persistence', 'ProjectSerializer.ts');

const FROM_LEDGER = process.argv.includes('--from-ledger');

/**
 * ⚠ HONESTY FLOORS. MISCONFIGURATION detectors, not targets. Never raise one to
 * make the gate green and never lower one either — a floor beneath the real
 * subject detects nothing. Set well below the readings at freeze (2026-08-11:
 * 320 register verbs, 20 ledger rows, 23 census families).
 */
const MIN_VERBS = 250;
const MIN_LEDGER_ROWS = 10;
const MIN_CENSUS = 15;

/**
 * The verbs whose liveness is PROVEN by an EXECUTED read-back. Frozen
 * 2026-08-11 from the first run of the generalised harness.
 *
 * GROW-ONLY (see the header). All seven are the annotation family, and that is
 * not a coincidence: `plugins/annotations` is the one family whose handlers
 * route every mutation through `canonicalAnnotationSink`, which writes the
 * module singleton `annotationStore` that `ProjectSerializer` imports. Every
 * other reachable family writes a plugin DTO store the serializer never reads,
 * which is precisely the defect CA-21 was minted to name — and this gate
 * reports those as UNKNOWN/`readback-negative`, never as a pass.
 */
const PROVEN_BASELINE: readonly string[] = [
  'annotation.create',
  'annotation.delete',
  'annotation.setColor',
  'annotation.setKind',
  'annotation.setRotation',
  'annotation.setText',
  'annotation.setTextHeight',
];

/**
 * Module singletons the probe may treat as authoritative. Each MUST appear as a
 * named import in the production ProjectSerializer (checked in V1) — that is
 * what makes it the store PERSIST consults rather than a store that was
 * convenient to read.
 */
const AUTHORITATIVE_SINGLETONS: readonly string[] = [
  'doorStore', 'windowStore', 'annotationStore', 'sheetStore',
  'scheduleStore', 'viewDefinitionStore', 'hierarchyStore', 'templateStore',
];

// ─────────────────────────── pure helpers (unit-tested) ──────────────────────

export type Verdict = 'PROVEN' | 'UNPROVABLE-NO-STORE' | 'UNKNOWN';

export interface LedgerRow { verb: string; family: string; verdict: Verdict; reason: string; via: string; }
export interface CensusRow { family: string; reachable: boolean; via: string; }
export interface Ledger {
  generatedAt: string;
  faultInjected: string | null;
  census: CensusRow[];
  rows: LedgerRow[];
}

/** Register verb → element family. `curtain-wall.setGrid` → `curtain-wall`. */
export function familyOf(verb: string): string {
  const dot = verb.indexOf('.');
  return dot === -1 ? verb : verb.slice(0, dot);
}

/**
 * Classify ONE register verb from EXECUTED evidence only.
 *
 * The ordering matters and is not arbitrary. A ledger PROVEN row wins outright.
 * Otherwise, an executed census that found the family's store ABSENT is a
 * stronger, more specific fact than "we have no spec", so it outranks UNKNOWN.
 * A family with no census entry is UNKNOWN — this gate has not established
 * which store is authoritative for it, and saying UNPROVABLE-NO-STORE there
 * would claim a measurement nobody made.
 */
export function classify(
  verb: string,
  ledgerRows: readonly LedgerRow[],
  census: readonly CensusRow[],
): { verdict: Verdict; reason: string } {
  const row = ledgerRows.find((r) => r.verb === verb);
  if (row?.verdict === 'PROVEN') return { verdict: 'PROVEN', reason: row.reason };

  const fam = familyOf(verb);
  const c = census.find((x) => x.family === fam);
  if (c && !c.reachable) {
    return {
      verdict: 'UNPROVABLE-NO-STORE',
      reason: `the authoritative store for "${fam}" is ABSENT from the composed runtime (measured); CA-21 cannot be satisfied for this verb in this process`,
    };
  }
  // A ledger row that exists and is not PROVEN is UNKNOWN, and carries WHY —
  // `readback-negative` (the CA-21 lie, observed), `dispatch-threw`,
  // `no-handler-registered`, `seed-did-not-land`. The PROVEN case returned above,
  // and nothing below this line may promote a verb.
  if (row) return { verdict: 'UNKNOWN', reason: row.reason };
  if (!c) {
    return {
      verdict: 'UNKNOWN',
      reason: `no census entry for family "${fam}" — this gate has not established which store is authoritative for it`,
    };
  }
  return { verdict: 'UNKNOWN', reason: 'not-attempted (store reachable; no read-back spec exists yet)' };
}

/** The verb column of the generated register. */
export function parseRegisterVerbs(md: string): string[] {
  const out = new Set<string>();
  for (const line of md.split('\n')) {
    const m = /^\|\s*`([a-z][\w-]*(?:\.[\w-]+)*)`\s*\|/.exec(line);
    if (m?.[1]) out.add(m[1]);
  }
  return [...out].sort();
}

/** Named imports of the production serializer, so authoritativeness is checked. */
export function serializerImports(src: string): Set<string> {
  const out = new Set<string>();
  const re = /import\s*\{([^}]*)\}\s*from/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    for (const part of (m[1] ?? '').split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0]?.trim();
      if (name) out.add(name);
    }
  }
  return out;
}

// ─────────────────────────────── the run ─────────────────────────────────────

function die(code: 1 | 2, msg: string): never {
  console.error((code === 2 ? '\n⚠ MISCONFIGURED — ' : '\n❌ FAILED — ') + msg);
  process.exit(code);
}

function main(): void {
  console.log('§CA-21-GATE — executed-read-back liveness (C16 §5.1 CA-21, exit condition G-CA-A4)');
  console.log('   ⚠ this ratchet runs UPWARD: PROVEN may only grow. See the file header.\n');

  // ── V0a subject: the register ────────────────────────────────────────────
  if (!existsSync(REGISTER)) die(2, `register artefact not found: ${path.relative(ROOT, REGISTER)}`);
  const verbs = parseRegisterVerbs(readFileSync(REGISTER, 'utf8'));
  if (verbs.length < MIN_VERBS) {
    die(2, `register parsed ${verbs.length} verbs, floor ${MIN_VERBS}. The walk did not establish its subject; a pass here would mean nothing.`);
  }

  // ── V0b subject: the probe ───────────────────────────────────────────────
  if (!existsSync(PROBE_ABS)) die(2, `read-back probe not found: ${path.relative(ROOT, PROBE_ABS)}`);

  // ── V1 authoritativeness ─────────────────────────────────────────────────
  if (!existsSync(SERIALIZER)) die(2, `production ProjectSerializer not found: ${path.relative(ROOT, SERIALIZER)}`);
  const imported = serializerImports(readFileSync(SERIALIZER, 'utf8'));
  const notAuthoritative = AUTHORITATIVE_SINGLETONS.filter((s) => !imported.has(s));
  if (notAuthoritative.length > 0) {
    die(2, `the probe treats these as AUTHORITATIVE, but the production ProjectSerializer does not import them: ${notAuthoritative.join(', ')}.\n` +
           `  A store PERSIST never reads is not an authoritative store, and a read-back from it would prove nothing (CA-21).\n` +
           `  Either the serializer changed, or the probe's store table is wrong. Both are misconfiguration, not a verb failure.`);
  }
  console.log(`✓ authoritativeness — all ${AUTHORITATIVE_SINGLETONS.length} probe singletons are imported by the production ProjectSerializer`);

  // ── V0c subject: EXECUTE the harness ─────────────────────────────────────
  if (!FROM_LEDGER) {
    console.log('· executing the read-back harness (real composeRuntime, happy-dom) — this takes a few minutes …');
    // Resolve vitest's own entry and run it under THIS node, rather than
    // shelling out to `npx`. On Windows `spawnSync('npx.cmd', …)` fails with
    // EINVAL under Node's default shell-less spawn, and a gate that dies on the
    // founder's own machine while passing on a Linux runner is the "green on the
    // runner, red locally" split lib/sourceScan.ts was written to end.
    const req = createRequire(import.meta.url);
    // `vitest/vitest.mjs` is not in the package's exports map, so resolve the
    // manifest (which always is) and take the CLI entry beside it.
    let vitestEntry = '';
    try { vitestEntry = path.join(path.dirname(req.resolve('vitest/package.json')), 'vitest.mjs'); }
    catch { die(2, 'vitest could not be resolved from the repo root — run `pnpm install`.'); }
    if (!existsSync(vitestEntry)) die(2, `vitest CLI entry not found at ${vitestEntry}`);

    const r = spawnSync(
      process.execPath,
      [vitestEntry, 'run', '--root', HARNESS_DIR, '--config', 'vitest.config.ts', PROBE_REL],
      { cwd: ROOT, stdio: 'inherit', env: process.env },
    );
    if (r.error) die(2, `could not execute the harness: ${String(r.error)}`);
    if (r.status !== 0) {
      die(2, `the read-back harness exited ${r.status}. CA-21 admits no substitute for an executed dispatch, so a gate that cannot run it has NOT established its subject — this is MISCONFIGURED (2), not a verb failure (1).`);
    }
  } else {
    console.log('· --from-ledger: reusing the previous run. DEBUG ONLY — CI must execute the harness.');
  }

  if (!existsSync(LEDGER)) die(2, `the harness produced no ledger at ${path.relative(ROOT, LEDGER)}`);
  let ledger: Ledger;
  try { ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger; }
  catch (e) { die(2, `ledger is not readable JSON: ${String(e)}`); }

  if (!Array.isArray(ledger.rows) || ledger.rows.length < MIN_LEDGER_ROWS) {
    die(2, `ledger carries ${ledger.rows?.length ?? 0} rows, floor ${MIN_LEDGER_ROWS}.`);
  }
  if (!Array.isArray(ledger.census) || ledger.census.length < MIN_CENSUS) {
    die(2, `ledger carries ${ledger.census?.length ?? 0} census entries, floor ${MIN_CENSUS}. Without a census this gate cannot tell UNPROVABLE-NO-STORE from UNKNOWN, and collapsing those two is the exact honesty defect it exists to prevent.`);
  }
  if (ledger.faultInjected) {
    console.log(`\n⚠ FAULT INJECTED — this run broke the authoritative store's writes for "${ledger.faultInjected}".`);
    console.log('   The verdicts below are DELIBERATELY degraded. This run can never set a baseline.\n');
  }

  // ── classify every register verb ─────────────────────────────────────────
  const results = verbs.map((v) => ({ verb: v, ...classify(v, ledger.rows, ledger.census) }));
  const proven = results.filter((r) => r.verdict === 'PROVEN').map((r) => r.verb);
  const noStore = results.filter((r) => r.verdict === 'UNPROVABLE-NO-STORE');
  const unknown = results.filter((r) => r.verdict === 'UNKNOWN');

  const reachable = ledger.census.filter((c) => c.reachable).map((c) => c.family);
  const absent = ledger.census.filter((c) => !c.reachable).map((c) => c.family);

  console.log('\n── STORE CENSUS (executed against the composed runtime) ──');
  console.log(`   REACHABLE (${reachable.length}): ${reachable.join(', ')}`);
  console.log(`   ABSENT    (${absent.length}): ${absent.join(', ')}`);
  console.log('   For every ABSENT family, CA-21 is unprovable BY CONSTRUCTION in this process.');

  console.log('\n── VERDICT DISTRIBUTION over the register ──');
  console.log(`   register verbs        ${verbs.length}`);
  console.log(`   PROVEN                ${proven.length}   (executed dispatch + executed read-back)`);
  console.log(`   UNPROVABLE-NO-STORE   ${noStore.length}   (authoritative store absent from the composed runtime)`);
  console.log(`   UNKNOWN               ${unknown.length}`);

  const byReason = new Map<string, number>();
  for (const u of unknown) {
    const key = u.reason.split(' (')[0]!.split(':')[0]!.trim();
    byReason.set(key, (byReason.get(key) ?? 0) + 1);
  }
  console.log('   UNKNOWN by reason:');
  for (const [k, n] of [...byReason].sort((a, b) => b[1] - a[1])) console.log(`     ${String(n).padStart(4)}  ${k}`);

  const negatives = ledger.rows.filter((r) => /readback-negative/.test(r.reason));
  if (negatives.length > 0) {
    console.log('\n── ⚠ EXECUTED READ-BACK WAS NEGATIVE (dispatch reported success; the AUTHORITATIVE store did not change) ──');
    for (const r of negatives) console.log(`     ${r.verb}   store=${r.via}`);
    console.log('   This is the CA-21 lie itself, observed. It is reported, not enforced, until these verbs enter the baseline.');
  }

  // ── V2 ratchet, both directions ──────────────────────────────────────────
  const provenSet = new Set(proven);
  const lost = PROVEN_BASELINE.filter((v) => !provenSet.has(v));
  const gained = proven.filter((v) => !PROVEN_BASELINE.includes(v));

  console.log(`\n── RATCHET (GROW-ONLY) — baseline ${PROVEN_BASELINE.length}, measured ${proven.length} ──`);

  if (lost.length > 0) {
    console.error('\n❌ FAILED — these verbs were PROVEN by an executed read-back and are NOT any more:');
    for (const v of lost) {
      const r = results.find((x) => x.verb === v);
      console.error(`     ${v}  →  ${r?.verdict ?? 'MISSING FROM THE REGISTER'} :: ${r?.reason ?? ''}`);
    }
    console.error('\n   A verb losing its proof means a write that used to reach the authoritative store no longer does.');
    console.error('   Fix the write, or — if the verb was deliberately removed — remove it from PROVEN_BASELINE in the SAME commit.');
    process.exit(1);
  }

  if (gained.length > 0) {
    console.error('\n❌ FAILED — these verbs are now PROVEN but are not in PROVEN_BASELINE:');
    for (const v of gained) console.error(`     ${v}`);
    console.error('\n   Good news, and still a failure: the list is checked in BOTH directions so it cannot rot into');
    console.error('   a set of things that are secretly fine. Add them to PROVEN_BASELINE in the same commit.');
    process.exit(1);
  }

  console.log(`\n✅ PASS — all ${PROVEN_BASELINE.length} baseline verbs still prove their write by an executed read-back.`);
  console.log(`   ${noStore.length} verbs remain UNPROVABLE-NO-STORE and ${unknown.length} UNKNOWN. Neither is a pass; both are the work.`);
  process.exit(0);
}

// Importable for the unit spec without executing the harness.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
