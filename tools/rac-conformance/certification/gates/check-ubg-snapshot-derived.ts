// ─── GATE · check-ubg-snapshot-derived ───────────────────────────────────────
//
// C71 §4 · C70 I-INV-2 (derived state is regenerated, never persisted-and-
// believed) · GR-17 · C70 §5 exit-code contract.
//
// ─── WHY THIS FILE EXISTS, AND WHY IT IS NOT A WRAPPER ───────────────────────
// GR-17 — *"the UBG's own header claims snapshot persistence it does not have"* —
// was closed by running `ubgSnapshotIsDerivedNotAuthored.test.ts` once and
// writing "4/4" into a cell, so `bim30-status` printed it CARRIED.
//
// That suite is good and it is EXECUTED here. But read its own header: it names
// the half it CANNOT measure —
//
//   *"(a) That `ProjectSerializer.ts` has no `ubg` key. This is an L2 package;
//    it cannot import an L7 editor module … That half stays source-verified."*
//
// ⭐ **That is the half the row is actually about.** The row's defect was a
// DOC-vs-CODE drift: the doc promised a `.pryzm` snapshot key the serialiser
// never had. The suite proves the UBG is derivable; only a check that can see
// BOTH LAYERS can prove the serialiser still agrees. A gate in `tools/` has no
// layer, so it can — and S1 below is exactly that arm, filling a gap its subject
// named rather than re-running what already ran.
//
// ─── THE ARMS ────────────────────────────────────────────────────────────────
//   S1 · NO `ubg` KEY. Neither `ProjectSerializer` may carry a `ubg` slot. ⚠ The
//        direction matters and is easy to get backwards: for a wholly-DERIVED
//        structure, persisting is the defect, not the fix. A persisted projection
//        can go STALE against the sources it came from and then be BELIEVED; and
//        a key nobody reads is authored-but-unwired in a new costume. If a `ubg`
//        key ever appears it must come WITH a named reader and a decision that
//        supersedes this row — hence a finding here, never a silent pass.
//        Guarded by a floor: each serialiser must actually write `semanticGraph`,
//        so "no ubg key" can never be satisfied by a file that serialises nothing.
//   S2 · THE SUITE EXECUTES GREEN. Its differentiating arm is the negative one —
//        a node hand-written into the graph is GONE after the next rebuild, which
//        is the proof the substrate holds no authored state to lose. A suite that
//        only proved "rebuild == rebuild" would pass on a graph full of authored
//        state.
//   S3 · THE SUITE IS NOT DARK — it must be claimed by its package's vitest
//        `include` glob. Cited evidence that runs in no config is the L-849/L-851
//        shape: NEVER RAN and PASSED printing the same value.
//
// ─── WHAT THIS GATE DOES **NOT** ESTABLISH ───────────────────────────────────
//   • That the LIVE sources are themselves fully restored on load — that is
//     `check-graph-persistence`'s question, and its ledger of 3 is where the
//     remaining losses (`measuredAt`, `decidedBy`) are named.
//   • Runtime reachability of `buildBuildingGraph` (GR-18 / CE-05 territory).
//   • That the UBG header PROSE is accurate. It reads source for a KEY, not for
//     a claim: the corrected header quotes the old false sentence verbatim, so
//     any grep for that sentence would fire on the correction forever. Prose
//     accuracy is not mechanically checkable here and is not claimed.
//
// ─── EXECUTED CONTROLS, EVERY RUN (C70 §5.6) ─────────────────────────────────
// The key detector and the glob matcher are driven over synthetics: a real
// `ubg:` slot must be found, the word appearing only in a comment must NOT be,
// and a `*.test.ts` include must be shown to claim a `.test.ts` file and not a
// `.spec.ts` one. A failing control exits 2.

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type Floor } from '../contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');
const GATE = 'check-ubg-snapshot-derived';

const SERIALIZERS = [
  'apps/editor/src/engine/persistence/ProjectSerializer.ts',
  'packages/persistence-client/src/loader/ProjectSerializer.ts',
];
const PKG_DIR = 'packages/building-graph';
const SUITE = '__tests__/ubgSnapshotIsDerivedNotAuthored.test.ts';
const SUITE_REL = `${PKG_DIR}/${SUITE}`;
const SUITE_TIMEOUT_MS = 180_000;

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

/** A `ubg` PERSISTENCE SLOT in code — an object key or a property read. */
export function ubgKeySites(src: string): string[] {
  const code = stripComments(src);
  const hits: string[] = [];
  for (const [i, line] of code.split('\n').entries()) {
    if (/(^|[^A-Za-z0-9_$])ubg\s*:/.test(line) || /\.\s*ubg\b/.test(line) || /\[\s*['"]ubg['"]\s*\]/.test(line)) {
      hits.push(`:${i + 1} ${line.trim().slice(0, 80)}`);
    }
  }
  return hits;
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

/* ─────────────────────────── executed controls ─────────────────────────── */

interface Control { id: string; what: string; pass: boolean }

function selfTest(): Control[] {
  return [
    { id: 'U1', what: 'a real `ubg:` snapshot slot is detected', pass: ubgKeySites(`return { semanticGraph: g.serialize(), ubg: buildingGraph.toJSON() };`).length === 1 },
    { id: 'U2', what: 'a `snapshot.ubg` property READ is detected', pass: ubgKeySites(`const u = snapshot.ubg;`).length === 1 },
    { id: 'U3', what: '`ubg` appearing only inside a comment earns NO detection — the corrected header quotes the old claim verbatim', pass: ubgKeySites(`/* no ubg: key at all, deliberately */\nreturn { semanticGraph: s };`).length === 0 },
    { id: 'U4', what: 'a clean serialiser body yields no sites', pass: ubgKeySites(`return { semanticGraph: semanticGraphManager.serialize() };`).length === 0 },
    { id: 'U5', what: 'a `**/*.test.ts` include claims a `.test.ts` file', pass: globToRegExp('__tests__/**/*.test.ts').test(SUITE) },
    { id: 'U6', what: 'the same include does NOT claim a `.spec.ts` file', pass: !globToRegExp('__tests__/**/*.test.ts').test('__tests__/x.spec.ts') },
  ];
}

/* ─────────────────────────── main ─────────────────────────── */

function main(): void {
  const controls = selfTest();
  const controlsPassed = controls.filter((x) => x.pass).length;

  const findings: string[] = [];
  const lines: string[] = [];

  // S1 — no `ubg` slot, over serialisers that demonstrably serialise something.
  let serialisersSeen = 0;
  let semanticGraphWriters = 0;
  for (const rel of SERIALIZERS) {
    const p = resolve(REPO, rel);
    if (!existsSync(p)) { lines.push(`S1  ${rel} — NOT FOUND`); continue; }
    serialisersSeen++;
    const src = readFileSync(p, 'utf8');
    const writesGraph = /semanticGraph/.test(stripComments(src));
    if (writesGraph) semanticGraphWriters++;
    const hits = ubgKeySites(src);
    if (hits.length) {
      findings.push(`S1 ${rel} carries ${hits.length} \`ubg\` persistence site(s) — a wholly DERIVED projection is being persisted; it can go STALE against its sources and be believed. If this is intended it needs a NAMED READER and a decision superseding GR-17.`);
    }
    lines.push(`S1  ${rel} — ubg sites ${hits.length} · writes semanticGraph ${writesGraph ? 'YES' : 'NO'}${hits.length ? ` [${hits.join(' | ')}]` : ''}`);
  }

  // S3 — is the suite claimed by its package config?
  const cfgPath = resolve(REPO, `${PKG_DIR}/vitest.config.ts`);
  const globs = existsSync(cfgPath) ? parseIncludes(readFileSync(cfgPath, 'utf8')) : [];
  // No `include` in a package config means vitest's DEFAULT glob applies, which
  // claims `**/*.test.ts`. Absence of the key is therefore not darkness — saying
  // otherwise would be this suite's own "empty means unknown" defect.
  const claims = globs.length === 0
    ? ['(vitest default include — config declares none)']
    : globs.filter((g) => globToRegExp(g).test(SUITE) || globToRegExp(g).test(SUITE_REL));
  const suiteExists = existsSync(resolve(REPO, SUITE_REL));
  if (suiteExists && claims.length === 0) {
    findings.push(`S3 ${SUITE_REL} is claimed by NO include glob in ${PKG_DIR}/vitest.config.ts — the cited evidence runs nowhere`);
  }

  // S2 — execute it.
  const r = spawnSync('npx', ['vitest', 'run', SUITE], {
    cwd: resolve(REPO, PKG_DIR), encoding: 'utf8', shell: true, timeout: SUITE_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024, env: process.env,
  });
  const ran = r.status !== null && !r.error ? 1 : 0;
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const passed = out.match(/Tests\s+(\d+) passed/)?.[1] ?? '?';
  const noFiles = /No test files found/.test(out);
  if (ran && r.status !== 0) findings.push(`S2 the cited suite exited ${r.status} — the UBG's derived-not-authored property is no longer demonstrated`);
  if (noFiles) findings.push('S2 vitest matched NO test files — the run measured nothing');

  lines.push(
    `S3  ${SUITE_REL} claimed by: ${claims.length ? claims.join(' · ') : 'NOTHING'}`,
    `S2  vitest exited ${r.status === null ? 'NULL (spawn failure or timeout)' : r.status} · ${passed} test(s) passed`,
    '',
    `executed controls (C70 §5.6 — an arm never watched failing is UNPROVEN): ${controlsPassed}/${controls.length}`,
    ...controls.map((x) => `   ${x.pass ? '✓' : '❌'} ${x.id} ${x.what}`),
    '',
    'NOT MEASURED HERE: whether the LIVE sources are fully restored on load',
    '(check-graph-persistence owns it, and its ledger of 3 names the remaining losses)',
    '· runtime reachability of buildBuildingGraph (GR-18 / CE-05) · the ACCURACY of the',
    'UBG header prose — this gate reads source for a KEY, not for a claim, because the',
    'corrected header quotes the old false sentence verbatim and any grep for it would',
    'fire on the correction forever.',
  );

  const floors: Floor[] = [
    { what: 'executed controls passed', measured: controlsPassed, min: controls.length },
    { what: 'ProjectSerializer files located', measured: serialisersSeen, min: 2 },
    { what: 'serialisers that demonstrably write semanticGraph (else "no ubg key" is vacuous)', measured: semanticGraphWriters, min: 2 },
    { what: 'cited suite located', measured: suiteExists ? 1 : 0, min: 1 },
    { what: 'suite process spawned and exited', measured: ran, min: 1 },
  ];

  process.exit(reportGate({ gate: GATE, floors, lines, findings: findings.length, declared: 0, findingNames: findings }));
}

main();
