// ─── GATE · check-graph-query-verbs ──────────────────────────────────────────
//
// C70 D-INV-1/D-INV-3 · C71 §4 (the UBG vocabulary is the canonical query
// vocabulary) · GR-16 · C70 §5 exit-code contract.
//
// ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// GR-16 — *"no `graph.*` bus verbs; the UBG has no runtime home"* — was closed by
// a human opening `graphQueryBusHandlers.ts` and running its spec once.
// `bim30-status` therefore printed it CARRIED: *"instrument is not a runnable
// gate: `graphQueryBusHandlers.ts` + its spec suite"*. The file and the suite are
// both real; what was missing is a name a runner can resolve.
//
// ⭐ EXISTENCE IS THE HALF THAT WAS NEVER IN DOUBT. A handler module that
// declares three verbs and is imported by nobody satisfies the row's letter and
// leaves its defect intact — the UBG would still have no runtime home. This
// corpus's standing failure is AUTHORED-BUT-UNWIRED (L-847: an entire workbench
// shipped unreachable), so Q2 is the arm that matters: the registration function
// must be CALLED from production wiring, not merely exported.
//
// ─── THE ARMS ────────────────────────────────────────────────────────────────
//   Q1 · the three read-only verbs — `graph.query`, `graph.neighbors`,
//        `graph.path` — are declared in the handler module.
//   Q2 · REACHABILITY. `registerGraphQueryHandlers` is called from at least one
//        PRODUCTION file that is neither its own definition nor a test. Measured
//        today at `apps/editor/src/engine/initBusHandlers.ts`.
//   Q3 · THE SPEC IS NOT DARK. The cited suite must be claimed by some vitest
//        config's `include` glob. This is not pedantry: `apps/editor`'s own
//        config includes only `**/*.test.ts`, so this `.spec.ts` is NOT claimed
//        there — it is claimed by the ROOT config's
//        `apps/editor/src/engine/__tests__/**/*.spec.ts`. A one-character rename
//        would make the cited evidence stop running with nothing saying so, which
//        is L-849/L-851 exactly (72 spec files / 1,433 cases that had never run).
//   Q4 · THE SPEC EXECUTES GREEN, spawned from the repo root under the config
//        that actually claims it.
//
// ─── WHAT THIS GATE DOES **NOT** ESTABLISH ───────────────────────────────────
//   • That any USER GESTURE, panel or AI path dispatches these verbs. Q2 proves
//     the handlers are registered onto the composed bus; it does not prove
//     anything calls them. CE-05 owns gesture reachability.
//   • That the ANSWERS are correct or that refusals are honest — the spec's
//     business, and this gate is only as strong as that spec.
//   • That the UBG is persisted. It deliberately is not; GR-17 owns that, and
//     `check-ubg-snapshot-derived` is its instrument.
//
// ─── EXECUTED CONTROLS, EVERY RUN (C70 §5.6) ─────────────────────────────────
// The glob matcher and both detectors are driven over synthetics: a verb table
// missing a member must be caught; a registration site that exists only in a test
// or a comment must earn NO credit; and the `*.test.ts`-only include must be
// shown NOT to claim a `.spec.ts` file — the precise mistake Q3 exists for.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type Floor } from '../contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');
const GATE = 'check-graph-query-verbs';

const HANDLERS = 'apps/editor/src/engine/graphQueryBusHandlers.ts';
const SPEC = 'apps/editor/src/engine/__tests__/graphQueryBusHandlers.spec.ts';
const REGISTRAR = 'registerGraphQueryHandlers';
const VERBS = ['graph.query', 'graph.neighbors', 'graph.path'] as const;
const WIRING_ROOTS = ['apps', 'packages', 'plugins', 'src'];
const SPEC_TIMEOUT_MS = 180_000;

/* ─────────────────────────── primitives ─────────────────────────── */

export function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Minimal vitest/picomatch subset: `**‌/`, `**`, `*`. Paths are POSIX-normalised. */
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

export interface ConfigIncludes { config: string; globs: string[] }

/** Every quoted string inside every `include: [ … ]` array of a vitest config. */
export function parseIncludes(configRel: string, src: string): ConfigIncludes {
  const globs: string[] = [];
  const re = /include:\s*\[([\s\S]*?)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    for (const s of m[1].match(/'([^']+)'|"([^"]+)"/g) ?? []) globs.push(s.slice(1, -1));
  }
  return { config: configRel, globs };
}

/** Is `fileRel` (repo-relative) claimed by any config, accounting for config dir? */
export function claimedBy(fileRel: string, configs: readonly ConfigIncludes[]): string[] {
  const out: string[] = [];
  for (const c of configs) {
    const base = dirname(c.config) === '.' ? '' : `${dirname(c.config)}/`;
    for (const g of c.globs) {
      // A glob may be written config-relative OR repo-relative; both appear in
      // this repo's configs, and treating only one as valid would mint a false
      // "dark file" report. Try both spellings.
      if (globToRegExp(`${base}${g}`).test(fileRel) || globToRegExp(g).test(fileRel)) {
        out.push(`${c.config} :: ${g}`);
      }
    }
  }
  return out;
}

function walk(dir: string, hit: (p: string) => void): void {
  const SKIP = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '.next', '.turbo', 'results', 'out']);
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (SKIP.has(name)) continue;
    const p = resolve(dir, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, hit);
    else hit(p);
  }
}

/* ─────────────────────────── executed controls ─────────────────────────── */

interface Control { id: string; what: string; pass: boolean }

function selfTest(): Control[] {
  const editorish: ConfigIncludes = { config: 'apps/editor/vitest.config.ts', globs: ['__tests__/**/*.test.ts', 'src/**/*.test.ts'] };
  const rootish: ConfigIncludes = { config: 'vitest.config.ts', globs: ['apps/editor/src/engine/__tests__/**/*.spec.ts'] };
  const spec = 'apps/editor/src/engine/__tests__/graphQueryBusHandlers.spec.ts';

  return [
    { id: 'V1', what: 'a `*.test.ts`-only include does NOT claim a `.spec.ts` file (the exact Q3 trap)', pass: claimedBy(spec, [editorish]).length === 0 },
    { id: 'V2', what: 'the ROOT config`s engine `**/*.spec.ts` glob DOES claim it', pass: claimedBy(spec, [rootish]).length === 1 },
    { id: 'V3', what: '`**/` matches zero intervening directories as well as many', pass: globToRegExp('a/**/c.ts').test('a/c.ts') && globToRegExp('a/**/c.ts').test('a/b/x/c.ts') },
    { id: 'V4', what: '`*` does not cross a path separator', pass: !globToRegExp('a/*.ts').test('a/b/c.ts') },
    { id: 'V5', what: 'a registrar named only inside a comment earns NO reachability credit', pass: !new RegExp(`\\b${REGISTRAR}\\s*\\(`).test(stripComments(`// calls ${REGISTRAR}(runtime) one day`)) },
    { id: 'V6', what: 'a real call site IS credited', pass: new RegExp(`\\b${REGISTRAR}\\s*\\(`).test(stripComments(`${REGISTRAR}(runtime);`)) },
    { id: 'V7', what: 'a missing verb is detected', pass: !/'graph\.path'/.test(`const H = ['graph.query','graph.neighbors'];`) },
  ];
}

/* ─────────────────────────── main ─────────────────────────── */

function main(): void {
  const controls = selfTest();
  const controlsPassed = controls.filter((x) => x.pass).length;

  const handlersPath = resolve(REPO, HANDLERS);
  const handlersSrc = existsSync(handlersPath) ? readFileSync(handlersPath, 'utf8') : '';
  const specExists = existsSync(resolve(REPO, SPEC));

  // Q1 — verbs declared.
  const declaredVerbs = VERBS.filter((v) => handlersSrc.includes(`'${v}'`) || handlersSrc.includes(`"${v}"`));

  // Q2 — production call sites of the registrar, excluding its own definition
  // and every test file. Comments earn nothing (control V5).
  const callRe = new RegExp(`(?<!function\\s)\\b${REGISTRAR}\\s*\\(`);
  const wiringSites: string[] = [];
  for (const root of WIRING_ROOTS) {
    const abs = resolve(REPO, root);
    if (!existsSync(abs)) continue;
    walk(abs, (p) => {
      if (!/\.tsx?$/.test(p) || /\.d\.ts$/.test(p)) return;
      const rel = relative(REPO, p).replace(/\\/g, '/');
      if (rel === HANDLERS) return;
      if (/(^|\/)__tests__\//.test(rel) || /\.(test|spec|cert)\.tsx?$/.test(rel)) return;
      const src = stripComments(readFileSync(p, 'utf8'));
      if (callRe.test(src)) wiringSites.push(rel);
    });
  }

  // Q3 — is the cited spec claimed by any vitest config?
  const configs: ConfigIncludes[] = [];
  for (const c of ['vitest.config.ts', 'apps/editor/vitest.config.ts']) {
    const p = resolve(REPO, c);
    if (existsSync(p)) configs.push(parseIncludes(c, readFileSync(p, 'utf8')));
  }
  const claims = claimedBy(SPEC, configs);

  // Q4 — execute it, under the root config that actually claims it.
  const r = spawnSync('npx', ['vitest', 'run', SPEC], {
    cwd: REPO, encoding: 'utf8', shell: true, timeout: SPEC_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024, env: process.env,
  });
  const specRan = r.status !== null && !r.error ? 1 : 0;
  const specOut = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const tally = specOut.match(/Tests\s+(\d+) passed/)?.[1] ?? '?';
  const noFiles = /No test files found/.test(specOut);

  const findings: string[] = [];
  for (const v of VERBS) if (!declaredVerbs.includes(v)) findings.push(`Q1 verb '${v}' is not declared in ${HANDLERS}`);
  if (wiringSites.length === 0) findings.push(`Q2 ${REGISTRAR} has ZERO production call sites — the verbs are AUTHORED BUT UNWIRED and the UBG still has no runtime home`);
  if (specExists && claims.length === 0) findings.push(`Q3 ${SPEC} is claimed by NO vitest config include glob — the cited evidence runs nowhere`);
  if (specRan && r.status !== 0) findings.push(`Q4 the cited spec suite exited ${r.status}`);
  if (noFiles) findings.push('Q4 vitest matched NO test files — the run measured nothing');

  const lines = [
    `Q1  verbs declared in ${HANDLERS}: ${declaredVerbs.length}/${VERBS.length} [${declaredVerbs.join(', ')}]`,
    `Q2  ${REGISTRAR} production call sites: ${wiringSites.length}${wiringSites.length ? ` [${wiringSites.join(', ')}]` : ''}`,
    `Q3  ${SPEC}`,
    `      claimed by: ${claims.length ? claims.join(' · ') : 'NOTHING'}`,
    `Q4  vitest exited ${r.status === null ? 'NULL (spawn failure or timeout)' : r.status} · ${tally} test(s) passed`,
    '',
    `executed controls (C70 §5.6 — an arm never watched failing is UNPROVEN): ${controlsPassed}/${controls.length}`,
    ...controls.map((x) => `   ${x.pass ? '✓' : '❌'} ${x.id} ${x.what}`),
    '',
    'NOT MEASURED HERE: that any USER GESTURE, panel or AI path dispatches these verbs',
    '(Q2 proves REGISTRATION onto the bus, not that anything calls them — CE-05 owns',
    'gesture reachability) · that the answers are correct or the refusals honest (the',
    'spec owns that, and this gate is only as strong as it is) · UBG persistence,',
    'which is GR-17 and check-ubg-snapshot-derived.',
  ];

  const floors: Floor[] = [
    { what: 'executed controls passed', measured: controlsPassed, min: controls.length },
    { what: `${HANDLERS} located`, measured: handlersSrc ? 1 : 0, min: 1 },
    { what: `${SPEC} located`, measured: specExists ? 1 : 0, min: 1 },
    { what: 'vitest configs parsed', measured: configs.length, min: 2 },
    { what: 'include globs parsed across those configs', measured: configs.reduce((n, c) => n + c.globs.length, 0), min: 5 },
    { what: 'spec process spawned and exited', measured: specRan, min: 1 },
    { what: 'wiring roots scanned', measured: WIRING_ROOTS.filter((x) => existsSync(resolve(REPO, x))).length, min: 3 },
  ];

  process.exit(reportGate({ gate: GATE, floors, lines, findings: findings.length, declared: 0, findingNames: findings }));
}

main();
