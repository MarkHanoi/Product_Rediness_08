#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-no-dark-test-files.ts
 *
 * §L-850 / C70 §4.2 — **every test file must be claimed by some runner.**
 *
 * ─── Why this gate exists ────────────────────────────────────────────────────
 * L-849: `packages/geometry-lift/vitest.config.ts` declared
 * `include: ['src/**\/__tests__/**\/*.spec.ts', 'src/**\/*.spec.ts']`, and
 * `packages/geometry-lift/__tests__/liftStores.test.ts` missed BOTH patterns
 * twice over — package ROOT rather than `src/**`, and the `.test.ts` SUFFIX
 * rather than `.spec.ts`. An entire LiftStore/LiftTypeStore suite — 11 tests —
 * had NEVER executed in CI, and nothing said so.
 *
 * This is *authored-but-unreachable* (C70 §4.2) applied to **the instrument
 * rather than the capability**. A test that cannot run is indistinguishable from
 * a test that does not exist, *except that it reads as coverage* — it appears in
 * the tree, it appears in review, it appears in a file count, and it asserts
 * nothing. That is the §CONTEXT-DATA-HONESTY shape: NEVER RAN and PASSED print
 * the same value to every reader who does not go and look.
 *
 * L-849's own entry named the fix and said it did not exist: *"a repo-wide sweep
 * — every test file matched by at least one runner's include."* This is it.
 *
 * ─── WHAT THIS GATE MEASURES, AND WHAT IT DELIBERATELY DOES NOT ─────────────
 * It measures **GLOB REACHABILITY**: is there a runner whose `include` matches
 * this file and whose `exclude` does not remove it again?
 *
 * It does **NOT** measure **CI INVOCATION**: whether any CI job actually runs
 * that runner. Those are different failures and folding them together would make
 * both unreadable. The invocation axis already has an instrument —
 * `scripts/check/check-test-ci-coverage.mjs`, which ratchets the set of
 * workspaces with no `test:ci` script (`pnpm -r --if-present` silently skips
 * them). A file can be GREEN here and still never run in CI; read both.
 *
 * It also does not measure whether the tests *assert* anything — a file matched
 * by a runner and containing `it.skip` everywhere passes this gate. Different
 * defect, different gate.
 *
 * ─── The runner census ───────────────────────────────────────────────────────
 * A "runner" is anything that can select test files:
 *   • the root `vitest.config.ts`                      (`npm run test:root`)
 *   • `vitest.server.config.ts`                        (`npm run test:server`)
 *   • `playwright.config.ts` + any workspace-local one (`testDir` + Playwright's
 *     default `testMatch`)
 *   • the root `test:pryzm1` script — `tsx --test <globs>`, parsed OUT OF
 *     package.json rather than copied here, so editing the script moves the gate
 *   • every `vitest.config.*` / `vite.config.*` in every workspace named by
 *     `pnpm-workspace.yaml` (which is read, not hard-coded — `tests/integration`
 *     and seven siblings are workspaces there and nowhere else)
 *   • a workspace whose package.json runs `vitest` with NO config file: vitest's
 *     DEFAULT include applies, rooted at the package dir. Missing this branch
 *     over-reports by ~30 files.
 *
 * **Root resolution is where this gets subtle, and it is stated rather than
 * assumed.** A workspace config's include patterns are relative to vitest's
 * `root`, which is `test.root`/`root` if declared and otherwise
 * `process.cwd()` AT INVOCATION. So the same pattern text means different things
 * depending on how the config is launched: `__tests__/**` under
 * `packages/picking` (launched by `pnpm --filter`, cwd = the package) and
 * `tools/madrid-envelope-engine/__tests__/**` under a package.json-LESS tools dir
 * (launched from the repo root via `--config`) are both correct. The rule used:
 * explicit `root: __dirname` → the config's dir; else a sibling package.json →
 * the config's dir; else → the repo root.
 *
 * ─── C70 §2.2 — UNPROVEN is neither pass nor fail ───────────────────────────
 * A config whose `include` is not a literal string array (a spread, a variable, a
 * computed pattern), or whose `root` is an expression this scanner cannot
 * evaluate, is **not** assumed to claim anything and is **not** assumed to claim
 * everything. It is reported as `U::<config>` — a finding in its own right, on
 * the same ledger. Silently treating an unreadable runner as coverage is how a
 * gate reports green over nothing.
 *
 * Glob support is likewise explicit: `**`, `*`, `?`, `{a,b}` and `[abc]` are
 * translated exactly; vitest's default extglob include is recognised as a whole
 * and expanded from a table. Any OTHER extglob (`?(…)`, `+(…)`, `@(…)`, `!(…)`)
 * in a hand-written pattern is UNPROVEN, not guessed.
 *
 * ─── The classes of dark file, because they are not one problem ─────────────
 *   `no-runner`          nothing includes it. The L-849 shape.
 *   `excluded-by`        a runner's include matches it and that runner's
 *                        `exclude` removes it again — a deliberate quarantine.
 *                        Kept VISIBLE on purpose: a quarantine that disappears
 *                        from the count is a deletion with extra steps.
 *   `compiled-artefact`  an `X.test.js` sitting beside an `X.test.ts`, i.e.
 *                        checked-in `tsc` output. It must NOT be "enabled" — the
 *                        fix is to stop committing build output. Classified
 *                        separately so nobody tries to switch it on.
 *
 * ─── Negative + positive control — EXECUTED ON EVERY RUN (C70 §5.6) ─────────
 * `selfTest()` materialises two synthetic repos:
 *   • PLANTED — a workspace whose include matches only `src/**` and only
 *     `*.spec.ts`, beside a package-root `__tests__/x.test.ts` and a
 *     `src/y.test.ts` (the exact L-849 double miss); a suite quarantined by an
 *     `exclude`; a compiled `.test.js` beside its `.test.ts`; and a config whose
 *     include is a spread. Each must be named BY EXACT PATH and BY CLASS.
 *   • CLEAN — the same workspace with an include that covers both files, no
 *     exclude, no compiled artefact, a literal include. Must read **0**.
 *     That clean tree is also the **SATISFIABILITY PROOF** (L-716): a fixture
 *     state in which this gate provably exits 0, so "green" is reachable and not
 *     a condition that can never be true.
 * If a planted class stays silent, or the clean tree reads dirty, the gate exits
 * 2 as a BLIND COMPARATOR — an arm never watched failing has never been shown to
 * work.
 *
 * ─── Ledger, not count (C70 §5.3) ───────────────────────────────────────────
 * `dark-test-files-ledger.json` names every dark file, checked in BOTH
 * directions: an unledgered dark file exits 3; a ledgered file that is no longer
 * dark exits 3 (STALE). A bare count would let one suite get wired up while
 * another fell dark and read "no change". The ledger is SHRINK-ONLY: fix a file's
 * include, strike its row in the SAME commit. Never add a row to go green.
 *
 * Exit 0 clean · 1 exactly the named ledger · 2 MISCONFIGURED / blind comparator
 * · 3 ledger exceeded or stale. 2 and 3 are never absorbable.
 */

import { readFileSync, existsSync, readdirSync, statSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, sep, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { reportGate, type Floor, type GateResult } from '../rac-conformance/certification/contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const GATE = 'check-no-dark-test-files';
const LEDGER_PATH = join(HERE, 'dark-test-files-ledger.json');

/** Floors. Measured 2026-08-13 at HEAD: 2041 test files, 163 runners. */
const MIN_TEST_FILES = 1500;
const MIN_RUNNERS = 100;

/** Directories never worth walking. Mirrors lib/sourceScan.ts DEFAULT_SKIP_DIRS. */
const SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules', '.git', 'dist', 'build', '.turbo', 'coverage', '__snapshots__',
  '.next', '.vite', 'dist-gate', 'dist-apex', '.pnpm-store', 'out', '.cache',
  'playwright-report', 'test-results', '.local', '.fly', 'attached_assets',
]);

const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

// ─── Filesystem helpers ──────────────────────────────────────────────────────

function walk(dir: string, acc: string[] = []): string[] {
  let ents;
  try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, acc); }
    else acc.push(p);
  }
  return acc;
}

const relPath = (root: string, p: string): string => relative(root, p).split(sep).join('/');

// ─── Glob → RegExp, with an explicit UNPROVEN escape hatch ───────────────────

/** Vitest's default include, recognised whole rather than parsed. */
const VITEST_DEFAULT_INCLUDE = '**/*.{test,spec}.?(c|m)[jt]s?(x)';
const VITEST_DEFAULT_EXPANDED = ['ts', 'tsx', 'js', 'jsx', 'mts', 'cts', 'mjs', 'cjs']
  .map((e) => `**/*.{test,spec}.${e}`);
/** Playwright's default testMatch, likewise. */
const PLAYWRIGHT_DEFAULT_MATCH = '**/*.@(spec|test).?(c|m)[jt]s?(x)';
const PLAYWRIGHT_DEFAULT_EXPANDED = VITEST_DEFAULT_EXPANDED;

/** Vitest's default exclude (the parts that can matter after our walk skips). */
const DEFAULT_EXCLUDE = ['**/node_modules/**', '**/dist/**', '**/cypress/**'];

function expandKnownDefaults(pat: string): string[] {
  if (pat === VITEST_DEFAULT_INCLUDE) return VITEST_DEFAULT_EXPANDED;
  if (pat === PLAYWRIGHT_DEFAULT_MATCH) return PLAYWRIGHT_DEFAULT_EXPANDED;
  return [pat];
}

/** `null` = this pattern uses syntax the translator does not implement. */
function globToRe(glob: string): RegExp | null {
  // Extglob beyond the two recognised defaults is NOT guessed at.
  if (/[?*+@!]\(/.test(glob)) return null;
  let re = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i += 2;
        if (glob[i] === '/') { re += '(?:[^/]+/)*'; i++; } else re += '.*';
        continue;
      }
      re += '[^/]*'; i++; continue;
    }
    if (c === '?') { re += '[^/]'; i++; continue; }
    if (c === '{') {
      const close = glob.indexOf('}', i);
      if (close === -1) return null;
      const alts = glob.slice(i + 1, close).split(',');
      re += '(?:' + alts.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')';
      i = close + 1; continue;
    }
    if (c === '[') {
      const close = glob.indexOf(']', i);
      if (close === -1) return null;
      re += glob.slice(i, close + 1); i = close + 1; continue;
    }
    if ('.+^$()|\\'.includes(c)) { re += '\\' + c; i++; continue; }
    re += c; i++;
  }
  return new RegExp('^' + re + '$');
}

// ─── Config parsing (Node-native; §FIX-GATE-NEEDS-RIPGREP / L-811) ───────────

/** Strip `//` and block comments, preserving string literals. */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      const q = c; out += c; i++;
      while (i < n) {
        if (src[i] === '\\') { out += src[i]! + (src[i + 1] ?? ''); i += 2; continue; }
        out += src[i]!;
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    out += c; i++;
  }
  return out;
}

/**
 * The balanced `{ … }` body that follows `key:`, or `null`.
 *
 * ⚠ This exists because the FIRST version of this gate searched the whole config
 * text for `exclude:` and found `coverage.exclude` — which in the root
 * `vitest.config.ts` is `['**\/__tests__/**', '**\/*.spec.ts', …]` — and
 * therefore reported 84 correctly-claimed editor suites as quarantined. A
 * key-name regex over a nested object is not a parser. Watched failing before it
 * was fixed; kept as the reason this function is not "simplified" back.
 */
function extractBlock(src: string, key: string): string | null {
  const m = src.match(new RegExp(`\\b${key}\\s*:\\s*\\{`));
  if (!m || m.index === undefined) return null;
  let i = src.indexOf('{', m.index);
  let depth = 0;
  const start = i;
  for (; i < src.length; i++) {
    const c = src[i]!;
    if (c === "'" || c === '"' || c === '`') {
      const q = c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start + 1, i); }
  }
  return null;
}

/** Drop every nested `{ … }` object, so a key search cannot descend into one. */
function withoutNestedObjects(body: string): string {
  let out = '';
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (c === "'" || c === '"' || c === '`') {
      const q = c; const s = i; i++;
      while (i < body.length && body[i] !== q) { if (body[i] === '\\') i++; i++; }
      if (depth === 0) out += body.slice(s, i + 1);
      continue;
    }
    if (c === '{') { depth++; continue; }
    if (c === '}') { depth--; continue; }
    if (depth === 0) out += c;
  }
  return out;
}

type ArrayParse =
  | { kind: 'absent' }
  | { kind: 'literal'; pats: string[] }
  | { kind: 'unproven'; reason: string };

/**
 * §CONST-PATH-BINDINGS (lane CI-GREEN, 2026-09-05). A config written as
 *   const EDITOR = resolve(__dirname, '../../../../apps/editor');
 *   const PROBE  = resolve(__dirname, 'b1Dispatch.probe.test.ts').split(BACKSLASH).join('/');
 *   export default defineConfig({ root: EDITOR, test: { include: [PROBE] } });
 * is fully determinable STATICALLY — every operand is `__dirname` or a string literal —
 * yet the scanner refused BOTH the `root` and the `include`, reported the config
 * UNPROVEN, and therefore could not see that the files it selects are selectable at
 * all. That is the instrument blind, not the tree dark; it is the same class as the
 * §DARK-CENSUS-ONE-LEVEL-DOWN blind spot below.
 *
 * ONLY this one idiom is resolved: an identifier bound to `resolve|join(__dirname,
 * '<literal>'…)`, optionally with the Windows-separator `.split(X).join('/')`
 * normalisation chained on. Everything else is still refused — `packages/d`'s
 * `include: [...EXTRA]` executed control proves the refusal still fires, because a
 * spread is not a bare identifier and is never substituted.
 */
function constPathBindings(src: string, dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const RE = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?:resolve|join)\s*\(\s*__dirname\s*((?:,\s*(?:'[^']*'|"[^"]*"))*)\s*\)\s*(?:\.split\([^)]*\)\s*\.join\(\s*['"]\/['"]\s*\))?\s*;/g;
  for (const m of src.matchAll(RE)) {
    const parts = [...m[2]!.matchAll(/['"]([^'"]*)['"]/g)].map((x) => x[1]!);
    out.set(m[1]!, resolve(dir, ...parts).split(sep).join('/'));
  }
  return out;
}

function parseStringArray(src: string, key: string, consts?: ReadonlyMap<string, string>): ArrayParse {
  const m = src.match(new RegExp(`\\b${key}\\s*:\\s*\\[([\\s\\S]*?)\\]`));
  if (!m) return { kind: 'absent' };
  let body = m[1]!;
  if (consts && consts.size > 0) {
    // A BARE identifier only. `...EXTRA` (the packages/d control) has `.` in front of
    // it, which this pattern does not admit, so a spread stays UNPROVEN as before.
    body = body.replace(
      /(^|[[,\s])([A-Za-z_$][\w$]*)(?=\s*(?:,|\]|$))/g,
      (whole, lead: string, id: string) => (consts.has(id) ? `${lead}'${consts.get(id)!}'` : whole),
    );
  }
  const pats = [...body.matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1]!);
  const residue = body.replace(/['"`][^'"`]*['"`]/g, '').replace(/[\s,]/g, '');
  if (residue.length > 0) {
    return { kind: 'unproven', reason: `\`${key}\` is not a literal string array (residue: ${residue.slice(0, 48)})` };
  }
  return { kind: 'literal', pats };
}

interface Runner {
  readonly name: string;
  /** Absolute directory the include patterns are relative to. */
  readonly base: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

interface Unproven { readonly subject: string; readonly reason: string; readonly base?: string; }

function pushVitestConfig(
  cfgAbs: string, root: string, runners: Runner[], unproven: Unproven[],
): void {
  let raw: string;
  try { raw = readFileSync(cfgAbs, 'utf8'); } catch { return; }
  const src = stripComments(raw);
  const dir = dirname(cfgAbs);
  const name = relPath(root, cfgAbs);

  // No `test:` block at all: a pure Vite build config claims nothing *by itself*.
  // (If the workspace nevertheless runs `vitest`, the DEFAULT-include branch in
  // discoverRunners covers it — vitest falls back to vite.config.ts.)
  const testBlock = extractBlock(src, 'test');
  if (testBlock === null) return;
  // include/exclude are read ONLY from the test block's own level — never from a
  // nested `coverage: { exclude: … }`, `browser`, `typecheck`, `deps`, …
  const flat = withoutNestedObjects(testBlock);

  // Vitest 4 `projects` / legacy `workspace` re-scope everything. Not modelled.
  if (/\b(projects|workspace)\s*:/.test(flat)) {
    unproven.push({ subject: name, reason: 'declares `projects`/`workspace`, which re-scopes include resolution per project — not modelled by this scanner' });
    return;
  }

  const consts = constPathBindings(src, dir);

  // Root resolution — stated in the header, not guessed at here.
  let base: string;
  const rootM = flat.match(/\broot\s*:\s*([^,\n]+)/) ?? src.match(/^\s*root\s*:\s*([^,\n]+)/m);
  if (rootM) {
    const v = rootM[1]!.trim().replace(/[;,]$/, '');
    if (v === '__dirname' || /^['"`]\.['"`]$/.test(v)) base = dir;
    else if (consts.has(v)) base = consts.get(v)!;   // §CONST-PATH-BINDINGS
    else { unproven.push({ subject: name, reason: `unresolvable \`root\` expression: ${v}`, base: dir }); return; }
  } else {
    base = existsSync(join(dir, 'package.json')) ? dir : root;
  }

  const inc = parseStringArray(flat, 'include', consts);
  if (inc.kind === 'unproven') { unproven.push({ subject: name, reason: inc.reason, base }); return; }
  const exc = parseStringArray(flat, 'exclude', consts);
  if (exc.kind === 'unproven') { unproven.push({ subject: name, reason: exc.reason, base }); return; }

  let include = inc.kind === 'absent' ? [VITEST_DEFAULT_INCLUDE] : inc.pats;

  // §ABS-INCLUDE — the `resolve(__dirname, …)` idiom yields an ABSOLUTE include, and
  // the matcher compares one base against every pattern, so a config whose `root` is
  // `apps/editor` cannot otherwise express a spec that lives in `audit/`. Re-base the
  // whole runner on the repo root instead. ALL-OR-NOTHING: a mix of absolute and
  // relative patterns, an absolute path outside the root, or a hand-written `exclude`
  // (which is relative to the OLD base and would silently change meaning) is REFUSED
  // as UNPROVEN rather than guessed at.
  const isAbsPat = (p: string): boolean => /^([A-Za-z]:)?\//.test(p);
  const absCount = include.filter(isAbsPat).length;
  if (absCount > 0) {
    if (absCount !== include.length) { unproven.push({ subject: name, reason: '`include` mixes absolute and relative patterns', base }); return; }
    if (exc.kind !== 'absent') { unproven.push({ subject: name, reason: 'absolute `include` alongside a hand-written `exclude` (which is relative to the config root)', base }); return; }
    const rebased: string[] = [];
    for (const p of include) {
      const rp = relPath(root, p);
      if (rp.startsWith('..')) { unproven.push({ subject: name, reason: `absolute \`include\` outside the repo root: ${p}`, base }); return; }
      rebased.push(rp);
    }
    include = rebased;
    base = root;
  }

  runners.push({
    name: inc.kind === 'absent' ? `${name} [vitest DEFAULT include]` : name,
    base,
    include,
    exclude: exc.kind === 'absent' ? DEFAULT_EXCLUDE : exc.pats,
  });
}

function pushPlaywrightConfig(cfgAbs: string, root: string, runners: Runner[]): void {
  let raw: string;
  try { raw = readFileSync(cfgAbs, 'utf8'); } catch { return; }
  const src = stripComments(raw);
  const td = src.match(/testDir\s*:\s*['"`]([^'"`]+)['"`]/);
  runners.push({
    name: relPath(root, cfgAbs),
    base: resolve(dirname(cfgAbs), td ? td[1]! : '.'),
    include: [PLAYWRIGHT_DEFAULT_MATCH],
    exclude: DEFAULT_EXCLUDE,
  });
}

// §CFG-NAME-IS-CASE-SENSITIVE (lane CI-GREEN, 2026-09-05). The middle segment used to be
// `[a-z0-9-]+`, so `vitest.w4iPlan.config.ts` and `vitest.w4iR.config.ts` were not
// recognised as configs AT ALL while `vitest.w4i.config.ts` beside them was — and their two
// probe specs were reported `no-runner` purely because of the capital letter in the runner's
// FILENAME. `vitest --config <path>` reads any name; the census must too.
const VITEST_CFG_RE = /^vitest(\.[A-Za-z0-9-]+)?\.config\.[cm]?[jt]s$/;
const VITE_CFG_RE = /^vite(\.[A-Za-z0-9-]+)?\.config\.[cm]?[jt]s$/;
const PW_CFG_RE = /^playwright(\.[A-Za-z0-9-]+)?\.config\.[cm]?[jt]s$/;

function discoverRunners(root: string): { runners: Runner[]; unproven: Unproven[] } {
  const runners: Runner[] = [];
  const unproven: Unproven[] = [];

  // 1 — root-level configs.
  for (const f of readdirSync(root).filter((f) => VITEST_CFG_RE.test(f) || VITE_CFG_RE.test(f))) {
    pushVitestConfig(join(root, f), root, runners, unproven);
  }
  for (const f of readdirSync(root).filter((f) => PW_CFG_RE.test(f))) {
    pushPlaywrightConfig(join(root, f), root, runners);
  }

  // 2 — the node-runner suite, parsed OUT OF package.json so the script is the
  //     authority and a change to it moves this gate with it.
  const pjPath = join(root, 'package.json');
  if (existsSync(pjPath)) {
    let scripts: Record<string, string> = {};
    try { scripts = (JSON.parse(readFileSync(pjPath, 'utf8')).scripts ?? {}) as Record<string, string>; } catch { /* ignore */ }
    for (const [key, cmd] of Object.entries(scripts)) {
      if (typeof cmd !== 'string' || !/\b(node|tsx)\b[^&|]*--test\b/.test(cmd)) continue;
      const globs = cmd.split(/\s+/).filter((t) => TEST_FILE_RE.test(t) || /\*.*\.(test|spec)\./.test(t));
      if (globs.length === 0) {
        unproven.push({ subject: `package.json#${key}`, reason: `\`--test\` script with no recognisable file globs: ${cmd.slice(0, 60)}` });
        continue;
      }
      runners.push({ name: `package.json#${key} (${cmd.includes('tsx') ? 'tsx' : 'node'} --test)`, base: root, include: globs, exclude: [] });
    }
  }

  // 3 — every workspace named by pnpm-workspace.yaml, plus the package.json-less
  //     sibling dirs under the same roots (standalone tools/* probes).
  const wsPath = join(root, 'pnpm-workspace.yaml');
  const wsGlobs: string[] = [];
  if (existsSync(wsPath)) {
    const yaml = readFileSync(wsPath, 'utf8');
    const m = yaml.match(/^packages:\s*$([\s\S]*?)^\S/m);
    for (const line of (m ? m[1]! : yaml).split('\n')) {
      const g = line.match(/^\s*-\s*['"]?([^'"\s#]+)['"]?/);
      if (g) wsGlobs.push(g[1]!);
    }
  }
  const dirs: string[] = [];
  for (const g of wsGlobs) {
    if (g.endsWith('/*')) {
      const rp = join(root, g.slice(0, -2));
      if (!existsSync(rp)) continue;
      for (const d of readdirSync(rp)) {
        const p = join(rp, d);
        try { if (statSync(p).isDirectory()) dirs.push(p); } catch { /* ignore */ }
      }
    } else {
      const p = join(root, g);
      if (existsSync(p)) dirs.push(p);
    }
  }

  const scannedSubDirs: string[] = [];
  for (const dir of [...new Set(dirs)]) {
    let entries: string[] = [];
    try { entries = readdirSync(dir); } catch { continue; }
    for (const f of entries) {
      if (VITEST_CFG_RE.test(f) || VITE_CFG_RE.test(f)) pushVitestConfig(join(dir, f), root, runners, unproven);
      if (PW_CFG_RE.test(f)) pushPlaywrightConfig(join(dir, f), root, runners);
    }
    // §DARK-CENSUS-ONE-LEVEL-DOWN (lane CI-GREEN, 2026-09-05). A package.json-less
    // sibling under a workspace glob (the "standalone tools/* probes" the comment
    // above names) is not one package — it is a FOLDER of independent harnesses,
    // each keeping its runner beside its spec one level down:
    //   tools/perf/outer/playwright.outer.config.ts   → outer-baseline.spec.ts
    //   tools/perf/render/playwright.render.config.ts → render-profile.spec.ts
    // Both are invoked by name (run-outer-local.mjs / run-render-local.mjs), so
    // the files are NOT dark — the census simply stopped at the top level and
    // reported 2 no-runner findings that were a blind spot of the instrument,
    // not of the tree. Scanned only for dirs WITHOUT a package.json: a real
    // package's nested configs are that package's own runner-selection problem,
    // and widening there would invent runners a `pnpm --filter` never invokes.
    if (!existsSync(join(dir, 'package.json'))) {
      for (const sub of entries) {
        const subDir = join(dir, sub);
        if (sub === 'node_modules' || sub === 'dist') continue;
        try { if (!statSync(subDir).isDirectory()) continue; } catch { continue; }
        let subEntries: string[] = [];
        try { subEntries = readdirSync(subDir); } catch { continue; }
        scannedSubDirs.push(subDir);
        for (const f of subEntries) {
          if (VITEST_CFG_RE.test(f) || VITE_CFG_RE.test(f)) pushVitestConfig(join(subDir, f), root, runners, unproven);
          if (PW_CFG_RE.test(f)) pushPlaywrightConfig(join(subDir, f), root, runners);
        }
      }
    }
    // A workspace that runs `vitest` with NO vitest config of its own gets
    // vitest's DEFAULT include, rooted at the package dir. (It may still have a
    // vite.config.ts with no `test:` block — vitest reads it and defaults.)
    const hasVitestCfg = entries.some((f) => VITEST_CFG_RE.test(f));
    const pj = join(dir, 'package.json');
    if (!hasVitestCfg && existsSync(pj)) {
      let scripts: Record<string, unknown> = {};
      try { scripts = (JSON.parse(readFileSync(pj, 'utf8')).scripts ?? {}) as Record<string, unknown>; } catch { /* ignore */ }
      if (Object.values(scripts).some((s) => typeof s === 'string' && /\bvitest\b/.test(s))) {
        runners.push({
          name: `${relPath(root, dir)}/package.json [vitest, DEFAULT include]`,
          base: dir,
          include: [VITEST_DEFAULT_INCLUDE],
          exclude: DEFAULT_EXCLUDE,
        });
      }
    }
  }

  // 4 — §CENSUS-SEES-EVERY-CONFIG (lane CI-GREEN, 2026-09-05). Steps 1–3 look for
  //     runners ONLY at the repo root and inside a pnpm workspace (plus, since
  //     §DARK-CENSUS-ONE-LEVEL-DOWN, one level under a package.json-less workspace
  //     sibling). A runner that lives anywhere else was invisible — and the repo's
  //     OWN L-849 protocol, quoted in dark-test-files-ledger.json, tells auditors to
  //     do exactly that: "run it under a THROWAWAY config". Eight probe specs under
  //     audit/element-creation/2026-08-29/probe/ each ship their own
  //     vitest.<name>.config.ts BESIDE the spec and were nonetheless reported
  //     `no-runner`, i.e. "nothing can select this file", while
  //     `npx vitest run --config <that file>` selects exactly it.
  //
  //     This is a DISCOVERY widening, never a tolerance widening: it adds runners the
  //     tree really has, and every file it un-darkens is one a config genuinely
  //     selects. It does NOT touch the ledger, which stays shrink-only. Dirs already
  //     visited above are skipped so a config is never read — or reported UNPROVEN —
  //     twice. SCOPE is unchanged and still stated: glob reachability, not CI
  //     invocation. `check-test-ci-coverage.mjs` remains the axis that asks whether
  //     any CI job invokes it.
  const scanned = new Set<string>([root, ...dirs, ...scannedSubDirs]);
  for (const p of walk(root)) {
    if (scanned.has(dirname(p))) continue;
    const f = p.slice(dirname(p).length + 1);
    if (VITEST_CFG_RE.test(f) || VITE_CFG_RE.test(f)) pushVitestConfig(p, root, runners, unproven);
    else if (PW_CFG_RE.test(f)) pushPlaywrightConfig(p, root, runners);
  }

  return { runners, unproven };
}

// ─── Analysis ────────────────────────────────────────────────────────────────

type DarkClass = 'no-runner' | 'excluded-by' | 'compiled-artefact' | 'unproven-coverage';

interface Finding { readonly key: string; readonly detail: string; }

interface Analysis {
  readonly testFiles: string[];
  readonly runners: Runner[];
  readonly unproven: Unproven[];
  readonly dark: { path: string; cls: DarkClass; note: string }[];
  readonly findings: Finding[];
  readonly patternsUnproven: number;
}

function analyse(root: string): Analysis {
  const testFiles = walk(root).map((p) => relPath(root, p)).filter((p) => TEST_FILE_RE.test(p)).sort();
  const present = new Set(testFiles);
  const { runners, unproven } = discoverRunners(root);

  let patternsUnproven = 0;
  const compiled = (r: readonly string[]): RegExp[] => {
    const out: RegExp[] = [];
    for (const p of r.flatMap(expandKnownDefaults)) {
      const re = globToRe(p);
      if (re) out.push(re); else patternsUnproven++;
    }
    return out;
  };

  const claimedBy = new Map<string, string[]>();
  const excludedBy = new Map<string, string[]>();
  for (const t of testFiles) { claimedBy.set(t, []); excludedBy.set(t, []); }

  for (const r of runners) {
    const baseRel = relPath(root, r.base);
    const inc = compiled(r.include);
    const exc = compiled(r.exclude);
    for (const t of testFiles) {
      let sub: string;
      if (baseRel === '' || baseRel === '.') sub = t;
      else if (t.startsWith(baseRel + '/')) sub = t.slice(baseRel.length + 1);
      else continue;
      if (!inc.some((re) => re.test(sub))) continue;
      if (exc.some((re) => re.test(sub))) { excludedBy.get(t)!.push(r.name); continue; }
      claimedBy.get(t)!.push(r.name);
    }
  }

  const dark: { path: string; cls: DarkClass; note: string }[] = [];
  for (const t of testFiles) {
    if (claimedBy.get(t)!.length > 0) continue;
    const tsTwin = t.replace(/\.test\.js$/, '.test.ts').replace(/\.spec\.js$/, '.spec.ts');
    if (/\.(test|spec)\.js$/.test(t) && tsTwin !== t && present.has(tsTwin)) {
      dark.push({ path: t, cls: 'compiled-artefact', note: `checked-in tsc output beside ${tsTwin} — do NOT "enable" it; stop committing build output` });
      continue;
    }
    const exs = excludedBy.get(t)!;
    if (exs.length > 0) {
      dark.push({ path: t, cls: 'excluded-by', note: `include-matched then removed by \`exclude\` in ${exs.join(', ')} — a deliberate quarantine, kept visible` });
      continue;
    }
    // C70 §2.2 — if the only config that could plausibly claim this file is one
    // this scanner refused to read, the honest verdict is UNPROVEN, not DARK.
    // Asserting "dark" here would be a measurement the gate has not made.
    const u = unproven.find((x) => x.base && (relPath(root, x.base) === '' || t.startsWith(relPath(root, x.base) + '/')));
    if (u) {
      dark.push({ path: t, cls: 'unproven-coverage', note: `coverage UNPROVEN — the only candidate runner (${u.subject}) could not be read: ${u.reason}` });
      continue;
    }
    dark.push({ path: t, cls: 'no-runner', note: 'no runner include matches it — the L-849 shape' });
  }

  const findings: Finding[] = [
    ...dark.map((d) => ({ key: `D::${d.path}`, detail: `${d.path} [${d.cls}] — ${d.note}` })),
    ...unproven.map((u) => ({ key: `U::${u.subject}`, detail: `${u.subject} — UNPROVEN runner (C70 §2.2: neither pass nor fail): ${u.reason}. Its coverage is NOT assumed in either direction.` })),
  ];

  return { testFiles, runners, unproven, dark, findings, patternsUnproven };
}

// ─── Negative + positive control, EXECUTED (C70 §5.6) ────────────────────────

function writeTree(base: string, files: Record<string, string>): void {
  rmSync(base, { recursive: true, force: true });
  for (const [p, body] of Object.entries(files)) {
    const abs = join(base, p.split('/').join(sep));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
}

const WS_YAML = "packages:\n  - 'packages/*'\n";
const ROOT_PJ = JSON.stringify({ name: 'planted-root', scripts: {} });

/** The L-849 double miss, a quarantine, a compiled artefact, and an unreadable include. */
const PLANTED: Record<string, string> = {
  'pnpm-workspace.yaml': WS_YAML,
  'package.json': ROOT_PJ,
  'packages/a/package.json': JSON.stringify({ name: '@planted/a', scripts: { test: 'vitest run' } }),
  'packages/a/vitest.config.ts': [
    "import { defineConfig } from 'vitest/config';",
    'export default defineConfig({',
    "  test: { include: ['src/**/*.spec.ts'] },",
    '});',
  ].join('\n'),
  // Misses on BOTH axes at once — package ROOT, and the `.test.ts` suffix.
  'packages/a/__tests__/rootSuite.test.ts': "it('never ran', () => {});",
  // Misses on the suffix axis only.
  'packages/a/src/nearSubject.test.ts': "it('never ran either', () => {});",
  // The positive control INSIDE the planted tree: this one IS claimed.
  'packages/a/src/claimed.spec.ts': "it('runs', () => {});",
  // A deliberate quarantine — include matches, exclude removes.
  'packages/b/package.json': JSON.stringify({ name: '@planted/b', scripts: { test: 'vitest run' } }),
  'packages/b/vitest.config.ts': [
    "import { defineConfig } from 'vitest/config';",
    'export default defineConfig({',
    "  test: { include: ['__tests__/**/*.test.ts'], exclude: ['__tests__/red.test.ts'] },",
    '});',
  ].join('\n'),
  'packages/b/__tests__/red.test.ts': "it('quarantined', () => {});",
  'packages/b/__tests__/green.test.ts': "it('runs', () => {});",
  // Checked-in tsc output beside its source.
  'packages/c/package.json': JSON.stringify({ name: '@planted/c', scripts: { test: 'vitest run' } }),
  'packages/c/vitest.config.ts': [
    "import { defineConfig } from 'vitest/config';",
    'export default defineConfig({',
    "  test: { include: ['__tests__/**/*.test.ts'] },",
    '});',
  ].join('\n'),
  'packages/c/__tests__/dup.test.ts': "it('runs', () => {});",
  'packages/c/__tests__/dup.test.js': "it('stale compile', () => {});",
  // An include this scanner must refuse to read rather than guess at.
  'packages/d/package.json': JSON.stringify({ name: '@planted/d', scripts: { test: 'vitest run' } }),
  'packages/d/vitest.config.ts': [
    "import { defineConfig } from 'vitest/config';",
    "const EXTRA = ['__tests__/**/*.test.ts'];",
    'export default defineConfig({',
    '  test: { include: [...EXTRA] },',
    '});',
  ].join('\n'),
  'packages/d/__tests__/maybe.test.ts': "it('unknown', () => {});",
};

/** Every planted defect repaired. Must read 0 — the SATISFIABILITY PROOF (L-716). */
const CLEAN: Record<string, string> = {
  'pnpm-workspace.yaml': WS_YAML,
  'package.json': ROOT_PJ,
  'packages/a/package.json': JSON.stringify({ name: '@clean/a', scripts: { test: 'vitest run' } }),
  'packages/a/vitest.config.ts': [
    "import { defineConfig } from 'vitest/config';",
    'export default defineConfig({',
    "  test: { include: ['src/**/*.{test,spec}.ts', '__tests__/**/*.{test,spec}.ts'] },",
    '});',
  ].join('\n'),
  'packages/a/__tests__/rootSuite.test.ts': "it('runs', () => {});",
  'packages/a/src/nearSubject.test.ts': "it('runs', () => {});",
  'packages/a/src/claimed.spec.ts': "it('runs', () => {});",
  'packages/b/package.json': JSON.stringify({ name: '@clean/b', scripts: { test: 'vitest run' } }),
  'packages/b/vitest.config.ts': [
    "import { defineConfig } from 'vitest/config';",
    'export default defineConfig({',
    "  test: { include: ['__tests__/**/*.test.ts'] },",
    '});',
  ].join('\n'),
  'packages/b/__tests__/green.test.ts': "it('runs', () => {});",
  // A workspace with NO config at all: vitest's DEFAULT include must claim it.
  'packages/e/package.json': JSON.stringify({ name: '@clean/e', scripts: { test: 'vitest run' } }),
  'packages/e/anywhere/deep/thing.spec.tsx': "it('runs', () => {});",
};

function selfTest(): { ok: boolean; lines: string[] } {
  const base = join(tmpdir(), `pryzm-${GATE}-selftest`);
  const lines: string[] = [];
  let ok = true;
  try {
    writeTree(join(base, 'planted'), PLANTED);
    writeTree(join(base, 'clean'), CLEAN);
    const bad = analyse(join(base, 'planted'));
    const good = analyse(join(base, 'clean'));

    const byKey = new Map(bad.dark.map((d) => [d.path, d.cls] as const));
    lines.push(`negative control (planted tree): ${bad.findings.length} finding(s) over ${bad.testFiles.length} test files, ${bad.runners.length} runner(s)`);
    for (const f of bad.findings) lines.push(`    ✓ fired — ${f.key}`);

    const must: [string, DarkClass][] = [
      ['packages/a/__tests__/rootSuite.test.ts', 'no-runner'],
      ['packages/a/src/nearSubject.test.ts', 'no-runner'],
      ['packages/b/__tests__/red.test.ts', 'excluded-by'],
      ['packages/c/__tests__/dup.test.js', 'compiled-artefact'],
      // C70 §2.2 — NOT reported as `no-runner`: the gate did not measure that.
      ['packages/d/__tests__/maybe.test.ts', 'unproven-coverage'],
    ];
    for (const [p, cls] of must) {
      if (byKey.get(p) !== cls) {
        ok = false;
        lines.push(`    ✗ BLIND COMPARATOR — planted ${cls} at ${p} was not named by exact path and class (got: ${byKey.get(p) ?? 'NOTHING'}).`);
      }
    }
    if (!bad.findings.some((f) => f.key === 'U::packages/d/vitest.config.ts')) {
      ok = false;
      lines.push('    ✗ BLIND COMPARATOR — a spread-valued `include` was not reported UNPROVEN (C70 §2.2); it was silently read as coverage or as nothing.');
    }
    for (const p of ['packages/a/src/claimed.spec.ts', 'packages/b/__tests__/green.test.ts', 'packages/c/__tests__/dup.test.ts']) {
      if (byKey.has(p)) { ok = false; lines.push(`    ✗ FALSE POSITIVE — ${p} IS claimed by its runner and must not be reported dark.`); }
    }

    lines.push(`positive control / SATISFIABILITY PROOF (clean tree): ${good.findings.length} finding(s) over ${good.testFiles.length} test files, ${good.runners.length} runner(s) — must be 0`);
    for (const f of good.findings) { ok = false; lines.push(`    ✗ FALSE POSITIVE — ${f.key}`); }
    if (good.findings.length === 0) {
      lines.push('    ✓ green is REACHABLE — a fixture state exists in which this gate exits 0 (L-716: a gate whose pass condition can never be true is not a gate).');
    }
  } catch (e) {
    ok = false;
    lines.push(`    ✗ self-test threw: ${(e as Error).message}`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  return { ok, lines };
}

// ─── Ledger ──────────────────────────────────────────────────────────────────

interface Ledger { readonly dark?: Record<string, string>; readonly unprovenRunners?: Record<string, string>; }

function readLedger(): { keys: string[]; ok: boolean } {
  if (!existsSync(LEDGER_PATH)) return { keys: [], ok: false };
  try {
    const j = JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as Ledger;
    return {
      keys: [
        ...Object.keys(j.dark ?? {}).map((k) => `D::${k}`),
        ...Object.keys(j.unprovenRunners ?? {}).map((k) => `U::${k}`),
      ],
      ok: true,
    };
  } catch { return { keys: [], ok: false }; }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const control = selfTest();
console.log(`\n[${GATE}] executed controls (an arm never watched failing is UNPROVEN):`);
for (const l of control.lines) console.log('   ' + l);

const a = analyse(ROOT);
const ledger = readLedger();

const lines: string[] = [];
lines.push(
  `test files discovered: ${a.testFiles.length} · runners discovered: ${a.runners.length} · ` +
  `UNPROVEN runners: ${a.unproven.length} · unreadable glob patterns: ${a.patternsUnproven}`,
);
lines.push(
  `DARK: ${a.dark.length}  (no-runner ${a.dark.filter((d) => d.cls === 'no-runner').length} · ` +
  `excluded-by ${a.dark.filter((d) => d.cls === 'excluded-by').length} · ` +
  `compiled-artefact ${a.dark.filter((d) => d.cls === 'compiled-artefact').length})`,
);
lines.push('⚠ SCOPE: this is GLOB REACHABILITY, not CI INVOCATION. A file green here can still be run by no CI job — that axis is scripts/check/check-test-ci-coverage.mjs.');
lines.push('');
const byDir = new Map<string, typeof a.dark>();
for (const d of a.dark) {
  const parts = d.path.split('/');
  const ws = ['packages', 'apps', 'plugins', 'tools'].includes(parts[0]!) ? parts.slice(0, 2).join('/') : parts[0]!;
  if (!byDir.has(ws)) byDir.set(ws, []);
  byDir.get(ws)!.push(d);
}
for (const [ws, files] of [...byDir].sort()) {
  lines.push(`  ${ws} — ${files.length} dark`);
  for (const f of files) lines.push(`      [${f.cls}] ${f.path}`);
}
for (const u of a.unproven) lines.push(`  UNPROVEN RUNNER — ${u.subject}: ${u.reason}`);

const measured = new Set(a.findings.map((f) => f.key));
const declared = new Set(ledger.keys);
const stale = [...declared].filter((k) => !measured.has(k));
const unexpected = [...measured].filter((k) => !declared.has(k));
if (unexpected.length > 0) {
  lines.push('');
  for (const u of unexpected) lines.push(`⚠ NOT ON THE LEDGER — ${u}`);
}

const floors: Floor[] = [
  { what: 'test files discovered', measured: a.testFiles.length, min: MIN_TEST_FILES },
  { what: 'runners discovered', measured: a.runners.length, min: MIN_RUNNERS },
  { what: 'ledger artefact readable (0 = missing or malformed)', measured: ledger.ok ? 1 : 0, min: 1 },
  { what: 'executed controls passed (0 = blind comparator)', measured: control.ok ? 1 : 0, min: 1 },
];

const result: GateResult = {
  gate: GATE,
  floors,
  lines,
  // By NAME in both directions, never by count: one suite getting wired up while
  // another falls dark must not read as "no change" (C69 §7.c).
  findings: a.findings.length + (unexpected.length > 0 ? declared.size + 1 : 0),
  declared: declared.size,
  findingNames: [...measured],
  stale,
};

process.exit(reportGate(result));
