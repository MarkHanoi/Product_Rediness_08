// ─── GATE · check-polygon-boolean-canonical ──────────────────────────────────
//
// C73 §3 · C73 §6 (a predicate exits its arm when it has an oracle fixture at a
// KNOWN answer) · GE-05 · C70 §5 exit-code contract.
//
// ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// GE-05 — *"no general 2-D boolean — ≥5 independent half-plane clippers, no union
// primitive; **'merge two footprints' is not expressible**"* — is declared CLOSED
// with a reading of **NOT DETERMINED** and a source of
// *"NOT RE-MEASURED — last known CLOSED 2026-08-14"*. Its deciding instrument is
// the sentence *"`polygonBoolean.ts` + its oracle suite"*, which names two
// artefacts and no way to run them, so `bim30-status` prints the row CARRIED.
//
// The two artefacts are real and they are good. What was missing is the thing
// this corpus keeps being bitten by: **nothing re-checks that they are still
// there, still exporting a union, and still EXECUTING.** L-849/L-851 is the
// standing precedent — four suites in this very package had never run because a
// single `include` glob did not claim them, and *"never ran"* and *"passed"*
// printed the same value.
//
// ─── THE ARMS ────────────────────────────────────────────────────────────────
//   B1 · THE UNION PRIMITIVE EXISTS. The row's sharpest clause is that a UNION is
//        missing — an intersection-only kernel still cannot merge two footprints.
//        `polygonBoolean.ts` must export a union entry point AND declare 'union'
//        as an operation. Checking only the file's existence would pass on a file
//        that clips and nothing else, which is the state the row describes.
//   B2 · THE ORACLE SUITE IS NOT DARK — it must be claimed by an `include` glob in
//        the package's vitest config (or by vitest's default, when the config
//        declares none: absence of the key is NOT darkness, and saying otherwise
//        would be this gate committing the empty-means-unknown defect it exists
//        to prevent).
//   B3 · THE ORACLE SUITE EXECUTES GREEN, spawned here rather than read from a
//        stale artefact. C73 §6 is explicit that the exit criterion is an oracle
//        at a KNOWN answer; a suite whose expectations were read off a run proves
//        only that the code agrees with itself. The suite's own header records
//        that every expectation is HAND-COMPUTED and that two cases carry an
//        INDEPENDENT grid-rasterisation cross-check sharing no code path with the
//        arrangement body under test — that is what makes B3 worth spawning.
//   B4 · THE ORACLE SUITE IS AN ORACLE, not a snapshot. It must contain at least
//        one hand-computed numeric expectation and the independent rasteriser. A
//        suite that only asserted `union(a,b)` deep-equals a recorded blob would
//        be green forever and would prove nothing about correctness.
//
// ─── WHAT THIS GATE DOES **NOT** ESTABLISH ───────────────────────────────────
//   • That the ≥5 pre-existing half-plane clippers have been RETIRED. GE-05's
//     first clause is about the absence of a general boolean, and that is what is
//     measured here. The duplication half belongs to `check-predicate-canonical`
//     (GE-02/GE-03) and to GE-12's triangulation ratchet; this gate deliberately
//     does not double-count their subject, and must never be cited for it.
//   • That any production caller USES the canonical boolean. Reachability of the
//     kernel is unmeasured here and is not claimed.
//   • Numerical robustness beyond the oracle's own case list.
//
// ─── EXECUTED CONTROLS, BOTH DIRECTIONS, EVERY RUN (C70 §5.6) ────────────────
// The export detector and the glob matcher are driven over synthetics: an
// intersection-only kernel must be REJECTED, a union-carrying one accepted, and
// a `*.test.ts` include shown to claim a `.test.ts` file and not a `.spec.ts`
// one. A failing control exits 2 — a blind comparator does not publish a verdict.

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type Floor } from '../contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');
const GATE = 'check-polygon-boolean-canonical';

const PKG_DIR = 'packages/geometry-kernel';
const PKG_NAME = '@pryzm/geometry-kernel';
const KERNEL = `${PKG_DIR}/src/pure/polygonBoolean.ts`;
const SUITE = '__tests__/polygonBoolean.oracle.test.ts';
const SUITE_REL = `${PKG_DIR}/${SUITE}`;
const SUITE_TIMEOUT_MS = 180_000;

/** §R5 subject floor — the minimum bytes a real kernel file has. Below it the
 *  file was found but is a stub or a truncated read, and no verdict is legal. */
const MIN_KERNEL_BYTES = 2000;
/** The oracle must assert something. A suite of one smoke case is not an oracle. */
const MIN_ORACLE_TESTS = 10;

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

export interface KernelReading {
  /** exported function names */
  exports: string[];
  /** does the declared operation union appear as a literal? */
  declaresUnionOp: boolean;
  /** an exported entry point whose name says union */
  unionEntryPoints: string[];
}

/**
 * ⚠ Read EXPORTS, not mentions. A kernel whose header apologises for having no
 * union — which is exactly how this corpus writes its headers — would satisfy a
 * text search for the word forever.
 */
export function readKernel(src: string): KernelReading {
  const code = stripComments(src);
  // `export function` AND `export const|let` — a union shipped as an arrow
  // constant is still a union, and a detector reading only the `function`
  // spelling would report "no union primitive" over a kernel that has one.
  const exports = [
    ...code.matchAll(/export\s+(?:function|const|let)\s+([A-Za-z_$][\w$]*)/g),
  ].map((m) => m[1]);
  return {
    exports,
    declaresUnionOp: /['"]union['"]/.test(code),
    unionEntryPoints: exports.filter((n) => /union/i.test(n)),
  };
}

/* ─────────────────────────── executed controls ─────────────────────────── */

interface Control { id: string; what: string; pass: boolean }

const INTERSECTION_ONLY = `
export type Op = 'intersection';
export function polygonBoolean2D(a: Pt2[], b: Pt2[], op: Op) { return clip(a, b); }
export function intersectPolygons2D(a: Pt2[], b: Pt2[]) { return polygonBoolean2D(a, b, 'intersection'); }
`;
const WITH_UNION = `${INTERSECTION_ONLY}\nexport function unionPolygons2D(a: Pt2[], b: Pt2[]) { return polygonBoolean2D(a, b, 'union'); }`;
const APOLOGETIC_HEADER = `
/** There is no union primitive here yet — 'merge two footprints' is not expressible. */
export function intersectPolygons2D(a: Pt2[], b: Pt2[]) { return clip(a, b); }
`;

function selfTest(): Control[] {
  return [
    { id: 'B1a', what: 'an intersection-only kernel is REJECTED (no union entry point)', pass: readKernel(INTERSECTION_ONLY).unionEntryPoints.length === 0 },
    { id: 'B1b', what: 'a kernel exporting unionPolygons2D is accepted', pass: readKernel(WITH_UNION).unionEntryPoints.length === 1 },
    { id: 'B1e', what: 'a union shipped as `export const` counts too — reading only the `function` spelling would report "no union primitive" over a kernel that has one', pass: readKernel(`export const unionPolygons2D = (a, b) => polygonBoolean2D(a, b, 'union');`).unionEntryPoints.length === 1 },
    { id: 'B1c', what: "a header that merely APOLOGISES for the missing union earns no credit — the word appears, the export does not", pass: (() => { const r = readKernel(APOLOGETIC_HEADER); return r.unionEntryPoints.length === 0 && !r.declaresUnionOp; })() },
    { id: 'B1d', what: "the 'union' operation literal is read from code, not from a comment", pass: readKernel(WITH_UNION).declaresUnionOp && !readKernel(`// op can be 'union' one day\nexport function f(){}`).declaresUnionOp },
    { id: 'B2a', what: 'a `__tests__/**/*.test.ts` include claims the oracle suite', pass: globToRegExp('__tests__/**/*.test.ts').test(SUITE) },
    { id: 'B2b', what: 'the same include does NOT claim a `.spec.ts` file', pass: !globToRegExp('__tests__/**/*.test.ts').test('__tests__/x.spec.ts') },
    { id: 'B2c', what: 'a config include list is parsed off real config text', pass: parseIncludes(`include: ['__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],`).length === 2 },
  ];
}

/* ─────────────────────────── main ─────────────────────────── */

function main(): void {
  const controls = selfTest();
  const controlsPassed = controls.filter((x) => x.pass).length;

  const findings: string[] = [];
  const lines: string[] = [];

  // B1 — the union primitive.
  const kernelPath = resolve(REPO, KERNEL);
  const kernelSrc = existsSync(kernelPath) ? readFileSync(kernelPath, 'utf8') : '';
  const k = readKernel(kernelSrc);
  if (kernelSrc && k.unionEntryPoints.length === 0) {
    findings.push(`B1 ${KERNEL} exports no UNION entry point — "merge two footprints" is still not expressible, which is GE-05's sharpest clause`);
  }
  if (kernelSrc && !k.declaresUnionOp) {
    findings.push(`B1 ${KERNEL} never declares 'union' as an operation in code`);
  }
  lines.push(
    `B1  ${KERNEL} — ${k.exports.length} exported function(s) · union entry point(s) ${k.unionEntryPoints.length} [${k.unionEntryPoints.join(', ') || 'NONE'}] · declares 'union' op ${k.declaresUnionOp ? 'YES' : 'NO'}`,
  );

  // B2 — is the oracle claimed by a config?
  const cfgPath = resolve(REPO, `${PKG_DIR}/vitest.config.ts`);
  const globs = existsSync(cfgPath) ? parseIncludes(readFileSync(cfgPath, 'utf8')) : [];
  const claims = globs.length === 0
    ? ['(vitest default include — config declares none)']
    : globs.filter((g) => globToRegExp(g).test(SUITE) || globToRegExp(g).test(SUITE_REL));
  const suitePath = resolve(REPO, SUITE_REL);
  const suiteExists = existsSync(suitePath);
  const suiteSrc = suiteExists ? readFileSync(suitePath, 'utf8') : '';
  if (suiteExists && claims.length === 0) {
    findings.push(`B2 ${SUITE_REL} is claimed by NO include glob in ${PKG_DIR}/vitest.config.ts — the cited evidence runs nowhere (the L-849/L-851 shape: NEVER RAN and PASSED print the same value)`);
  }
  lines.push(`B2  ${SUITE_REL} claimed by: ${claims.length ? claims.join(' · ') : 'NOTHING'}`);

  // B4 — is it an oracle, or a snapshot?
  const code = stripComments(suiteSrc);
  const hasRasteriser = /rasteris|rasteriz|sampling|sample/i.test(suiteSrc);
  const hasNumericExpectation = /toBeCloseTo\s*\(/.test(code);
  if (suiteExists && !hasNumericExpectation) {
    findings.push(`B4 ${SUITE_REL} carries no numeric expectation — a boolean suite that only deep-equals a recorded blob is green forever and proves nothing about correctness`);
  }
  if (suiteExists && !hasRasteriser) {
    findings.push(`B4 ${SUITE_REL} carries no INDEPENDENT cross-check — C73 §6 wants an oracle at a KNOWN answer, not the code agreeing with itself`);
  }
  lines.push(`B4  oracle shape — numeric expectations ${hasNumericExpectation ? 'YES' : 'NO'} · independent cross-check ${hasRasteriser ? 'YES' : 'NO'}`);

  // B3 — execute it.
  //
  // ⚠ SPAWNED VIA `pnpm --filter`, NOT `npx vitest`, and the difference is a
  // measured one. In this workspace `npx vitest run` inside packages/geometry-kernel
  // resolves a doubled path — `<repo>/node_modules/node_modules/.pnpm/vitest@…` —
  // and dies with MODULE_NOT_FOUND, exit 1, zero tests. That is the L-774 shape:
  // a gate reading that as "the suite FAILED" would report a red over a suite it
  // never ran, and one reading it as "0 findings" would report a green over the
  // same nothing. `pnpm --filter` resolves the workspace binary correctly. The
  // MIN_ORACLE_TESTS floor below is the backstop either way: no test count, no
  // verdict — exit 2, which is neither a pass nor a fail and is never absorbable.
  const r = spawnSync('pnpm', ['--filter', PKG_NAME, 'exec', 'vitest', 'run', SUITE], {
    cwd: REPO, encoding: 'utf8', shell: true, timeout: SUITE_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024, env: process.env,
  });
  const ran = r.status !== null && !r.error ? 1 : 0;
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const passed = Number(out.match(/Tests\s+(\d+) passed/)?.[1] ?? 0);
  const noFiles = /No test files found/.test(out);
  if (ran && r.status !== 0) findings.push(`B3 the cited oracle suite exited ${r.status} — GE-05's evidence no longer holds`);
  if (noFiles) findings.push('B3 vitest matched NO test files — the run measured nothing');
  lines.push(
    `B3  vitest exited ${r.status === null ? 'NULL (spawn failure or timeout)' : r.status} · ${passed} test(s) passed`,
    '',
    `executed controls (C70 §5.6 — an arm never watched failing is UNPROVEN): ${controlsPassed}/${controls.length}`,
    ...controls.map((x) => `   ${x.pass ? '✓' : '❌'} ${x.id} ${x.what}`),
    '',
    'NOT MEASURED HERE: whether the >=5 pre-existing half-plane clippers have been RETIRED',
    '(check-predicate-canonical owns the duplication axis — GE-02/GE-03 — and this gate must',
    'never be cited for it) · whether any PRODUCTION caller uses the canonical boolean ·',
    'numerical robustness beyond the oracle case list.',
  );

  const floors: Floor[] = [
    { what: 'executed controls passed', measured: controlsPassed, min: controls.length },
    { what: `${KERNEL} bytes (MIN_KERNEL_BYTES)`, measured: kernelSrc.length, min: MIN_KERNEL_BYTES },
    { what: 'cited oracle suite located', measured: suiteExists ? 1 : 0, min: 1 },
    { what: 'suite process spawned and exited', measured: ran, min: 1 },
    // The suite process exiting 0 having run NOTHING is the empty-seed lie in its
    // purest form. Demand a test count, not just a status.
    { what: 'oracle tests actually executed (MIN_ORACLE_TESTS)', measured: passed, min: MIN_ORACLE_TESTS },
  ];

  process.exit(reportGate({ gate: GATE, floors, lines, findings: findings.length, declared: 0, findingNames: findings }));
}

main();
