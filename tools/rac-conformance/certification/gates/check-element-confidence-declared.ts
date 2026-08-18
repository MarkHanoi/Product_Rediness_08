// ─── GATE · check-element-confidence-declared ────────────────────────────────
//
// C75 §1.3 (C62 owns confidence) · C75 §5 (scope is declared, never inferred
// from an absence) · PV-06 · C70 §5 exit-code contract.
//
// ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// PV-06 — *"`confidence` has zero hits repo-wide on the element side, while
// site/context/climate/zoning carry mandatory confidence"* — is declared CLOSED
// with a reading of **NOT DETERMINED** and a deciding instrument of two words:
// *"schema census"*. `bim30-status` prints it CARRIED, which is the honest call:
// a census that happened once, by hand, at a SHA nobody can replay.
//
// The census is trivially mechanisable, and this file mechanises it.
//
// ─── THE ARM THAT MATTERS IS E2, NOT E1 ──────────────────────────────────────
// The cited suite `packages/schemas/__tests__/elementConfidence.test.ts` already
// asserts, well, that every IN-SCOPE kind declares the field. But read how
// IN_SCOPE is derived inside it:
//
//     const IN_SCOPE = ELEMENT_TYPES.filter((t) => !(t in OUT_OF_SCOPE));
//
// ⭐ **The suite's subject is defined by its own exemption list.** Move a kind
// into `OUT_OF_SCOPE` with a plausible sentence and every assertion in that file
// still passes — over a smaller subject, silently. That is roadmap §7B.5 exactly
// (*a gate that classifies by NAME can be satisfied by RENAMING*), and it is the
// one thing a suite cannot check about itself: its own scope. E2 pins the
// exemption list to the FIVE kinds named on the record, by NAME. Adding a sixth
// fires; removing one does not, because shrinking an exemption list is the
// direction this repo wants.
//
// E1 is deliberately an INDEPENDENT re-derivation rather than a re-run: it reads
// `SCHEMA_REGISTRY`'s keys straight out of `registry.ts` and the element modules
// straight off disk. If the suite's registry import ever went stale, E1 would
// disagree with it — which is the point of having two.
//
// ─── THE ARMS ────────────────────────────────────────────────────────────────
//   E1 · Every REGISTERED element kind that is not on the written exemption list
//        declares `confidence` in its schema module. Independent of the suite.
//   E2 · The exemption list names EXACTLY the five recorded kinds, each with a
//        written reason. Scope may shrink; it may not grow silently.
//   E3 · The cited suite is NOT DARK — claimed by an `include` glob (or by
//        vitest's default when the config declares none: absence of the key is
//        not darkness, and treating it as such would be this gate committing
//        PV-06's own empty-means-unknown defect).
//   E4 · The cited suite EXECUTES GREEN, with a floor on the test count.
//
// ─── WHAT THIS GATE DOES **NOT** ESTABLISH ───────────────────────────────────
//   • That any PRODUCER writes a real confidence. Every kind defaults to
//     `pending-implementation` — honest and empty. The suite states this about
//     itself and this gate inherits it: a declared field is not an instrumented
//     one, and this must never be cited as though it were.
//   • That `confidence` is CORRECT for any element. Presence, not accuracy.
//   • Anything about PROVENANCE. C75 §1.2 keeps the two axes separate on purpose
//     and `check-provenance-coverage` owns the other one.
//
// ─── EXECUTED CONTROLS, BOTH DIRECTIONS, EVERY RUN (C70 §5.6) ────────────────
// The registry parser, the field detector and the exemption parser are driven
// over synthetics: a kind missing the field must be caught, a field surviving
// only in a comment must not be credited, and a GROWN exemption list must be
// detected while a shrunk one is not. A failing control exits 2.

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type Floor } from '../contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');
const GATE = 'check-element-confidence-declared';

const PKG_DIR = 'packages/schemas';
const PKG_NAME = '@pryzm/schemas';
const REGISTRY = `${PKG_DIR}/src/registry.ts`;
const ELEMENTS_DIR = `${PKG_DIR}/src/elements`;
const SUITE = '__tests__/elementConfidence.test.ts';
const SUITE_REL = `${PKG_DIR}/${SUITE}`;
const SUITE_TIMEOUT_MS = 180_000;

/**
 * §R5 subject floor. PV-06's own write-up quotes the registry as 27 kinds and the
 * suite floors itself at ">= 27"; below that the registry was not really parsed
 * and every count above it is meaningless.
 */
const MIN_REGISTERED_KINDS = 27;
const MIN_SUITE_TESTS = 20;

/**
 * §PV-06-SCOPE — the exemption list as the record carries it, by NAME.
 *
 * These five are documentation artefacts whose content is the user's own drawing
 * or reporting act, with no external source that could be more or less
 * trustworthy. The list is pinned here so a sixth cannot join it silently. It is
 * NOT a debt ledger and carries no tolerated-failure count: growth is a finding,
 * shrinkage is not.
 */
const RECORDED_EXEMPTIONS = ['annotation', 'dimension', 'schedule', 'sheet', 'view'] as const;

/* ─────────────────────────── primitives ─────────────────────────── */

export function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { out += '(?:[^/]+/)*'; i += 2; } else { out += '.*'; i += 1; }
    } else if (c === '*') out += '[^/]*';
    else if ('.+?^${}()|[]\\'.includes(c)) out += `\\${c}`;
    else out += c;
  }
  return new RegExp(`^${out}$`);
}

export function parseIncludes(src: string): string[] {
  const globs: string[] = [];
  const re = /include:\s*\[([\s\S]*?)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    for (const s of m[1].match(/'([^']+)'|"([^"]+)"/g) ?? []) globs.push(s.slice(1, -1));
  }
  return globs;
}

/**
 * §VITEST-COUNTS — parse the run summary, counting tests EXECUTED, not PASSED.
 *
 * ⚠ Measured wrong here first, and the mistake is this suite's own subject matter
 * turned on itself. A green run prints `Tests  42 passed (42)`; a RED one prints
 * `Tests  3 failed | 39 passed (42)`. A `/Tests\s+(\d+) passed/` reads the red
 * line as **0**, which trips the test-count floor and makes the gate exit 2 —
 * MISCONFIGURED, "I could not look" — for a suite that ran forty-two tests and
 * failed three. That is *failure and emptiness rendering as the same value*,
 * inside the machinery built to forbid it. Caught by breaking the real subject.
 *
 * Counting EXECUTED keeps the two apart: an unrunnable suite still exits 2, a
 * failing one exits 3.
 */
export function parseVitestCounts(out: string): { passed: number; failed: number; executed: number } {
  const line = out.match(/Tests\s+([^\n]*)/)?.[1] ?? '';
  const passed = Number(line.match(/(\d+)\s+passed/)?.[1] ?? 0);
  const failed = Number(line.match(/(\d+)\s+failed/)?.[1] ?? 0);
  const total = Number(line.match(/\((\d+)\)/)?.[1] ?? 0);
  return { passed, failed, executed: Math.max(total, passed + failed) };
}

/**
 * `SCHEMA_REGISTRY` entries: `kind: Module`. Read from source rather than
 * imported so this gate never depends on the package building.
 */
export function parseRegistry(src: string): { kind: string; module: string }[] {
  const code = stripComments(src);
  const body = code.match(/SCHEMA_REGISTRY[^=]*=\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  return [...body.matchAll(/^\s*([A-Za-z][\w$]*)\s*:\s*([A-Za-z][\w$]*)\s*,/gm)]
    .map((m) => ({ kind: m[1], module: m[2] }));
}

/** Does a schema module DECLARE the field (in code, not in prose)? */
export function declaresConfidence(src: string): boolean {
  return /\bconfidence\s*:/.test(stripComments(src));
}

/** The exemption list the cited suite actually uses. */
export function parseExemptions(suiteSrc: string): string[] {
  const code = stripComments(suiteSrc);
  const body = code.match(/OUT_OF_SCOPE[^=]*=\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  return [...body.matchAll(/^\s*([A-Za-z][\w$]*)\s*:/gm)].map((m) => m[1]);
}

/* ─────────────────────────── executed controls ─────────────────────────── */

interface Control { id: string; what: string; pass: boolean }

const REGISTRY_SYNTHETIC = `
export const SCHEMA_REGISTRY = {
  wall: Wall,
  door: Door,
  annotation: Annotation,
}
`;
const SUITE_SYNTHETIC = (keys: string[]) => `
const OUT_OF_SCOPE: Record<string, string> = {
${keys.map((k) => `    ${k}: 'because',`).join('\n')}
}
`;

function selfTest(): Control[] {
  const grown = parseExemptions(SUITE_SYNTHETIC([...RECORDED_EXEMPTIONS, 'wall']));
  const shrunk = parseExemptions(SUITE_SYNTHETIC(['annotation', 'dimension']));
  return [
    { id: 'E1a', what: 'the registry parser reads kind→module pairs off source', pass: parseRegistry(REGISTRY_SYNTHETIC).length === 3 },
    { id: 'E1b', what: 'a schema module declaring `confidence:` is credited', pass: declaresConfidence(`export const Wall = defineElement({ confidence: RetrofittedConfidenceSchema });`) },
    { id: 'E1c', what: 'a `confidence` surviving only in a comment is NOT credited — PV-06’s own write-up quotes the word repeatedly', pass: !declaresConfidence(`// PV-06: confidence: was absent here\nexport const Wall = defineElement({});`) },
    { id: 'E2a', what: 'the exemption parser reads the live list shape', pass: parseExemptions(SUITE_SYNTHETIC([...RECORDED_EXEMPTIONS])).length === RECORDED_EXEMPTIONS.length },
    { id: 'E2b', what: 'a GROWN exemption list is detected — this is the one thing the suite cannot check about itself, because IN_SCOPE is derived FROM it', pass: grown.some((k) => !RECORDED_EXEMPTIONS.includes(k as never)) },
    { id: 'E2c', what: 'a SHRUNK exemption list is NOT a finding — narrowing scope is the direction the repo wants', pass: !shrunk.some((k) => !RECORDED_EXEMPTIONS.includes(k as never)) },
    { id: 'E3a', what: 'a `__tests__/**/*.test.ts` include claims the cited suite', pass: globToRegExp('__tests__/**/*.test.ts').test(SUITE) },
    { id: 'E3b', what: 'the same include does NOT claim a `.spec.ts` file', pass: !globToRegExp('__tests__/**/*.test.ts').test('__tests__/x.spec.ts') },
    { id: 'E4a', what: 'a GREEN vitest summary reads 42 executed', pass: parseVitestCounts(' Tests  42 passed (42)\n').executed === 42 },
    { id: 'E4b', what: 'a RED summary reads 42 EXECUTED, not 0 — the floor must separate "the suite failed" from "the suite never ran", or a red suite exits 2 and is called unmeasurable', pass: (() => { const c = parseVitestCounts(' Tests  3 failed | 39 passed (42)\n'); return c.executed === 42 && c.failed === 3; })() },
    { id: 'E4c', what: 'a run that matched no files reads 0 executed', pass: parseVitestCounts('No test files found, exiting with code 1\n').executed === 0 },
  ];
}

/* ─────────────────────────── main ─────────────────────────── */

function main(): void {
  const controls = selfTest();
  const controlsPassed = controls.filter((x) => x.pass).length;

  const findings: string[] = [];
  const lines: string[] = [];

  const regPath = resolve(REPO, REGISTRY);
  const kinds = existsSync(regPath) ? parseRegistry(readFileSync(regPath, 'utf8')) : [];

  const suitePath = resolve(REPO, SUITE_REL);
  const suiteExists = existsSync(suitePath);
  const suiteSrc = suiteExists ? readFileSync(suitePath, 'utf8') : '';

  // E2 first — it decides E1's subject, and a silently grown exemption list would
  // otherwise make E1's "all in-scope kinds declare it" pass over fewer kinds.
  const exemptions = parseExemptions(suiteSrc);
  const added = exemptions.filter((k) => !RECORDED_EXEMPTIONS.includes(k as never));
  if (added.length) {
    findings.push(`E2(PV-06) the exemption list has GROWN by ${added.length}: ${added.join(', ')} — IN_SCOPE is derived from this list, so every assertion in ${SUITE} would still pass, over a smaller subject, silently (C75 §5: scope is declared, never inferred)`);
  }
  lines.push(`E2  exemption list ${exemptions.length} [${exemptions.join(', ') || 'NONE PARSED'}] · recorded ${RECORDED_EXEMPTIONS.length} · added ${added.length}`);

  // E1 — the independent census. Scope = the RECORDED exemptions, never the
  // live list: keying off the live list would make a grown list exempt itself.
  const missing: string[] = [];
  let modulesRead = 0;
  for (const { kind, module } of kinds) {
    if (RECORDED_EXEMPTIONS.includes(kind as never)) continue;
    const p = resolve(REPO, `${ELEMENTS_DIR}/${module}.ts`);
    if (!existsSync(p)) { missing.push(`${kind} (module ${module}.ts NOT FOUND)`); continue; }
    modulesRead++;
    if (!declaresConfidence(readFileSync(p, 'utf8'))) missing.push(`${kind} (${module}.ts)`);
  }
  if (missing.length) {
    findings.push(`E1(PV-06) ${missing.length} registered element kind(s) declare no \`confidence\`: ${missing.join(' · ')} — a wall the generator INFERRED and a wall a human drew cannot be told apart on trust`);
  }
  lines.push(`E1  registered kinds ${kinds.length} · in scope ${kinds.length - RECORDED_EXEMPTIONS.length} · modules read ${modulesRead} · missing confidence ${missing.length}`);

  // E3 — dark?
  const cfgPath = resolve(REPO, `${PKG_DIR}/vitest.config.ts`);
  const globs = existsSync(cfgPath) ? parseIncludes(readFileSync(cfgPath, 'utf8')) : [];
  const claims = globs.length === 0
    ? ['(vitest default include — config declares none)']
    : globs.filter((g) => globToRegExp(g).test(SUITE) || globToRegExp(g).test(SUITE_REL));
  if (suiteExists && claims.length === 0) findings.push(`E3 ${SUITE_REL} is claimed by NO include glob — the cited evidence runs nowhere`);
  lines.push(`E3  ${SUITE_REL} claimed by: ${claims.length ? claims.join(' · ') : 'NOTHING'}`);

  // E4 — execute. `pnpm --filter`, not `npx vitest` (see
  // check-polygon-boolean-canonical for the measured reason).
  const r = spawnSync('pnpm', ['--filter', PKG_NAME, 'exec', 'vitest', 'run', SUITE], {
    cwd: REPO, encoding: 'utf8', shell: true, timeout: SUITE_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024, env: process.env,
  });
  const ran = r.status !== null && !r.error ? 1 : 0;
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const counts = parseVitestCounts(out);
  if (ran && r.status !== 0 && counts.executed > 0) findings.push(`E4 the cited suite exited ${r.status} with ${counts.failed} failing test(s) of ${counts.executed} executed — PV-06's evidence no longer holds`);
  if (/No test files found/.test(out)) findings.push('E4 vitest matched NO test files — the run measured nothing');

  lines.push(
    `E4  vitest exited ${r.status === null ? 'NULL (spawn failure or timeout)' : r.status} · ${counts.executed} executed (${counts.passed} passed, ${counts.failed} failed)`,
    '',
    `executed controls (C70 §5.6 — an arm never watched failing is UNPROVEN): ${controlsPassed}/${controls.length}`,
    ...controls.map((x) => `   ${x.pass ? '✓' : '❌'} ${x.id} ${x.what}`),
    '',
    'NOT MEASURED HERE, and never to be cited for it: that any PRODUCER writes a real',
    'confidence — every kind still defaults to `pending-implementation`, which is honest',
    'and empty; a DECLARED field is not an INSTRUMENTED one · whether any confidence value',
    'is CORRECT · anything about PROVENANCE, which C75 §1.2 keeps as a separate axis and',
    'check-provenance-coverage owns.',
  );

  const floors: Floor[] = [
    { what: 'executed controls passed', measured: controlsPassed, min: controls.length },
    { what: 'registered element kinds parsed (MIN_REGISTERED_KINDS)', measured: kinds.length, min: MIN_REGISTERED_KINDS },
    { what: 'element schema modules actually read', measured: modulesRead, min: MIN_REGISTERED_KINDS - RECORDED_EXEMPTIONS.length },
    // An exemption list that parsed as empty would silently widen E1's subject and
    // make E2 vacuous. Zero parsed entries means the parser lost its subject.
    { what: 'exemption entries parsed from the cited suite', measured: exemptions.length, min: 1 },
    { what: 'cited suite located', measured: suiteExists ? 1 : 0, min: 1 },
    { what: 'suite process spawned and exited', measured: ran, min: 1 },
    // EXECUTED, not PASSED — see §VITEST-COUNTS. Counting passes here would make a
    // failing suite trip this floor and be reported as unmeasurable, not as a finding.
    { what: 'suite tests actually executed (MIN_SUITE_TESTS)', measured: counts.executed, min: MIN_SUITE_TESTS },
  ];

  process.exit(reportGate({ gate: GATE, floors, lines, findings: findings.length, declared: 0, findingNames: findings }));
}

main();
