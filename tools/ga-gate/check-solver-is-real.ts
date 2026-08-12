#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-solver-is-real.ts
 *
 * C74 §3.3/§3.7 · BIM30-READINESS-GATES §3.13 — **no adapter reports a solve it
 * did not perform.**
 *
 * ─── Why this gate exists ────────────────────────────────────────────────────
 * `PlanegcsAdapter` declares `readonly kind = 'planegcs' as const`
 * (`packages/constraint-solver/src/PlanegcsAdapter.ts:85`) and delegates **100 %
 * of its work** to `MockSolver`, which declares `kind = 'mock'`
 * (`packages/constraint-solver/src/engine.ts:85`). One of those two classes is
 * telling the truth about what it is. Meanwhile `planegcs` appears in **zero**
 * `package.json` files in the repo — so the engine whose name is being reported
 * to callers is not a dependency of anything, and cannot be.
 *
 * This is the cheapest check in the contract suite, and that is the point: the
 * manifest settles the question without reading a line of adapter source. A
 * caller that branches on `porter.kind === 'planegcs'` — to decide whether a
 * solve is trustworthy, to label a result in the UI, to skip a re-check — is
 * being told a fact that is not true, and no amount of adapter-level testing can
 * surface it, because the adapter's own tests inject the mock deliberately.
 *
 * ─── The three arms ──────────────────────────────────────────────────────────
 *  R1  An adapter naming an EXTERNAL ENGINE requires that engine to be a
 *      declared dependency of some workspace `package.json`. A `kind` that names
 *      nothing installable is a claim with no referent.
 *  R2  No selector returns the SAME VALUE for "not configured" and "configured
 *      but failed". `loadSolver()` returns `new MockSolver()` when
 *      `PLANEGCS_WASM_URL` is absent AND, separately, when it is present but the
 *      dynamic import throws — and the two are indistinguishable to the caller.
 *      §CONTEXT-DATA-HONESTY: failure and emptiness are never the same value.
 *      The second is a FAILURE, not a default.
 *  R3  Dead capability is deleted or declared. `createWorkerHandler` has zero
 *      production callers — an audit of EXISTENCE passes, an audit of
 *      REACHABILITY fails (§AUTHORED-BUT-UNWIRED).
 *
 * ─── This gate does NOT prefer one exit over the other ───────────────────────
 * R1 goes green when EITHER the dependency lands OR the adapter stops naming an
 * engine it does not run. C74 §4.3 requires truthfulness FIRST and binding
 * SECOND, in separate commits, so renaming `kind` to `'mock-delegating'` today
 * and shipping real planegcs next quarter is a fully correct sequence. The gate
 * asserts the CONSISTENCY of the claim, never the presence of the engine.
 *
 * ─── Ledger, not ratchet ─────────────────────────────────────────────────────
 * The known failures are NAMED (see `LEDGER`), checked in BOTH directions:
 *   • a finding not on the ledger      → exit 3 (never absorbable)
 *   • a ledger entry no longer measured → exit 3 (stale — debt leaves the ledger
 *     in the commit that pays it, or the next regression hides inside it)
 * A bare count would let one adapter start telling the truth while another
 * started lying, and read as "no change" (C69 §7.c).
 *
 * ─── Negative control — EXECUTED ON EVERY RUN (C74 §6.2, gates doc §2.2) ─────
 * `selfTest()` materialises TWO synthetic workspaces in a temp dir and drives
 * the SAME analyser over them through the SAME scanner:
 *   • a PLANTED tree — an adapter declaring `kind = 'ghostgcs'` with no such
 *     dependency, a selector returning the same stand-in on both the absent and
 *     the thrown branch, and an exported `createOrphanHandler` nobody calls.
 *     All three arms must fire. If the analyser calls it clean the gate exits 2
 *     as a BLIND COMPARATOR — a checker that cannot fail has not been shown to
 *     work, and reporting its silence as coverage is the failure this suite
 *     exists to prevent.
 *   • a CLEAN tree — an adapter whose engine IS a declared dependency, a
 *     selector that distinguishes its two branches, and a factory with a real
 *     caller. It must read 0. This is the POSITIVE control, and it lives in the
 *     synthetic tree because the real tree has no such adapter today — stated
 *     rather than quietly skipped.
 *
 * ─── Honesty floors (exit 2, NEVER absorbable) ───────────────────────────────
 *   • manifests read              ≥ 100   (repo has 170 outside node_modules)
 *   • source files scanned        ≥ 500
 *   • adapters with a declared kind > 0   — a scan that discovered no adapters
 *     has not established its subject, and "no lying adapters" over an empty set
 *     is not a verdict.
 *
 * ─── What this gate CANNOT see ───────────────────────────────────────────────
 *   • whether a declared dependency is actually LOADED at runtime — presence in
 *     a manifest is necessary, never sufficient;
 *   • an engine bound through a URL resolved at runtime;
 *   • semantic correctness — an honest solver computing wrong answers passes
 *     every arm here. C74 governs IDENTITY, not ACCURACY;
 *   • runtime DI substitution.
 *
 * Exit 0 clean · 1 exactly the named ledger · 2 MISCONFIGURED · 3 ledger
 * exceeded or stale. 2 and 3 are never absorbable as declared debt.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { walk, relPath, stripCommentsToLines, scanFilesStripped } from './lib/sourceScan.js';
import { reportGate, type Floor, type GateResult } from '../rac-conformance/certification/contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const GATE = 'check-solver-is-real';
const DIRS = ['packages', 'plugins', 'apps', 'src'] as const;

/**
 * Kinds that describe a stand-in HONESTLY. A class declaring one of these is
 * not naming an external engine and is outside R1 by construction — `MockSolver`
 * declaring `kind = 'mock'` is the CORRECT behaviour this gate protects.
 * Excluded by name with the reason, per C73 §3.3's exclusion discipline.
 */
/**
 * THE SUBJECT, stated as a rule rather than left to a pattern.
 *
 * An "adapter" is a class whose NAME declares it to be one. Naming the subject
 * this way is deliberate: the first cut of this gate treated every class field
 * called `kind` as an adapter identity and flagged
 * `ElementInstanceBridge.kind = 'box'` — a GEOMETRY descriptor — as an
 * undeclared engine. That is the over-eager matcher the gates doc warns about,
 * and an over-eager matcher is how a gate gets a suffix list bolted on later to
 * silence it. Classes declaring a `kind` that are NOT adapters are PRINTED as
 * out-of-subject, never silently dropped.
 */
const ADAPTER_SUFFIXES = /(?:Adapter|Porter|Driver|Backend|Solver|Relay|Engine|Provider|Transport)$/;

const NEUTRAL_KINDS = new Set([
  'mock', 'stub', 'fake', 'dummy', 'noop', 'none', 'null', 'test',
  'builtin', 'internal', 'native', 'local', 'memory', 'in-memory',
  'default', 'sim', 'simulated', 'scaffold',
]);

// ─── The named ledger. SHRINK-ONLY, checked in BOTH directions. ──────────────
/**
 * Each entry is `arm::file:symbol`. Fix a finding → strike its line in the SAME
 * commit. Do NOT add a line to make the gate quiet: a new finding is exit 3.
 */
const LEDGER: readonly string[] = [
  "R1::packages/constraint-solver/src/PlanegcsAdapter.ts:PlanegcsAdapter declares kind='planegcs'",
  'R2::packages/constraint-solver/src/engine.ts:loadSolver',
  // Measured, NOT specified: C74 §3.3 and the gates doc §3.13 name `loadSolver`
  // alone. `loadRelay` is the identical defect one package over — the ai-host
  // relay selector returns `new MockAnthropicRelay()` when ANTHROPIC_RELAY_URL is
  // absent AND after the dynamic import throws. Recorded here rather than
  // excluded, because a gate that only ever finds the sites its spec listed is a
  // spec transcription, not a measurement.
  'R2::packages/ai-host/src/AnthropicRelay.ts:loadRelay',
  'R3::packages/constraint-solver/src/worker.ts:createWorkerHandler',
];

// ─── Subject discovery ───────────────────────────────────────────────────────

interface Manifest { readonly path: string; readonly deps: ReadonlySet<string>; readonly name: string }

/** Every `package.json` outside node_modules/dist, with every declared dep. */
function collectManifests(root: string): Manifest[] {
  const out: Manifest[] = [];
  // `.claude/` alone holds 3272 vendored manifests — agent tooling, not this
  // product. Counting them would put the floor three thousand above anything it
  // could ever detect, which is a floor that cannot fail.
  const skip = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.turbo', '.next', 'dist-gate', 'dist-apex', '.pnpm-store', '.claude']);
  const rec = (d: string): void => {
    let entries: string[];
    try { entries = readdirSync(d); } catch { return; }
    for (const name of entries) {
      if (skip.has(name)) continue;
      const full = join(d, name);
      let st; try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) { rec(full); continue; }
      if (name !== 'package.json') continue;
      try {
        const j = JSON.parse(readFileSync(full, 'utf8')) as Record<string, unknown>;
        const deps = new Set<string>();
        for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
          const block = j[field];
          if (block && typeof block === 'object') for (const k of Object.keys(block as object)) deps.add(k);
        }
        out.push({ path: relPath(root, full), deps, name: typeof j['name'] === 'string' ? (j['name'] as string) : '' });
      } catch { /* an unparseable manifest declares nothing; the floor catches a tree of them */ }
    }
  };
  rec(root);
  return out;
}

interface Adapter {
  readonly file: string;
  readonly line: number;
  readonly className: string;
  readonly kind: string;
  /** Does the class NAME declare it an adapter? See ADAPTER_SUFFIXES. */
  readonly isAdapter: boolean;
}

/**
 * Class-field `kind` declarations, with the enclosing class name.
 *
 * Line-based on purpose (the repo's scanner is line-based) but comment-stripped
 * FIRST — this suite has counted prose as violations five times, and every
 * `preview.kind = 'image'` in a JSDoc block is exactly that trap.
 */
function collectAdapters(root: string, dirs: readonly string[]): { adapters: Adapter[]; filesScanned: number } {
  const adapters: Adapter[] = [];
  let filesScanned = 0;
  const CLASS = /\bclass\s+([A-Za-z_$][\w$]*)/;
  // A CLASS FIELD, not an object property and not an assignment to a member:
  // optional `readonly`, then `kind`, `=`, a string literal.
  const KIND = /^\s*(?:public\s+|private\s+|protected\s+|declare\s+)?(?:readonly\s+)?kind\s*(?::\s*[\w'"|. <>\[\]]+\s*)?=\s*['"]([\w.-]+)['"]/;
  for (const dir of dirs) {
    for (const abs of walk(join(root, dir))) {
      const rel = relPath(root, abs);
      if (/(^|\/)__tests__\//.test(rel) || /\.(test|spec|bench)\.tsx?$/.test(rel)) continue;
      let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      filesScanned++;
      const lines = stripCommentsToLines(src);
      let currentClass = '';
      for (let i = 0; i < lines.length; i++) {
        const c = CLASS.exec(lines[i]!);
        if (c) currentClass = c[1]!;
        const k = KIND.exec(lines[i]!);
        if (k && currentClass) {
          adapters.push({
            file: rel, line: i + 1, className: currentClass, kind: k[1]!,
            isAdapter: ADAPTER_SUFFIXES.test(currentClass),
          });
        }
      }
    }
  }
  return { adapters, filesScanned };
}

/** Does any workspace declare `kind` (or something that plainly contains it)? */
function declaringManifest(kind: string, manifests: readonly Manifest[]): string | undefined {
  const k = kind.toLowerCase();
  for (const m of manifests) {
    for (const dep of m.deps) {
      const bare = dep.toLowerCase().replace(/^@[^/]+\//, '');
      if (bare === k || bare.split(/[-.]/).includes(k) || bare.includes(k)) return `${m.path} → ${dep}`;
    }
    if (m.name.toLowerCase().replace(/^@[^/]+\//, '') === k) return `${m.path} (workspace itself)`;
  }
  return undefined;
}

interface Finding { readonly arm: 'R1' | 'R2' | 'R3'; readonly key: string; readonly detail: string }

/** R2 — a selector whose "absent" branch and whose "threw" branch return the same stand-in. */
function findBlindSelectors(root: string, dirs: readonly string[], standIns: ReadonlySet<string>): Finding[] {
  const out: Finding[] = [];
  const FN = /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/;
  for (const dir of dirs) {
    for (const abs of walk(join(root, dir))) {
      const rel = relPath(root, abs);
      if (/(^|\/)__tests__\//.test(rel) || /\.(test|spec|bench)\.tsx?$/.test(rel)) continue;
      let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      const lines = stripCommentsToLines(src);
      // Region = from a `function NAME` line to the next COLUMN-0 declaration.
      //
      // Brace-counting was tried first and was WRONG in the exact place that
      // matters: `loadSolver(\n  opts: { env?: … } = {},\n)` closes a brace in its
      // PARAMETER LIST before the body opens, so the region ended one line into
      // the function and the canonical violation read clean. A checker that
      // misses its own headline case is the blind comparator this gate's
      // self-test exists to catch — and it did catch it.
      const TOPLEVEL = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|const|let|interface|type|enum)\s/;
      const starts: number[] = [];
      for (let i = 0; i < lines.length; i++) if (FN.test(lines[i]!)) starts.push(i);
      for (const s of starts) {
        const name = FN.exec(lines[s]!)![1]!;
        let end = lines.length;
        for (let j = s + 1; j < lines.length; j++) { if (TOPLEVEL.test(lines[j]!)) { end = j; break; } }
        const returns = new Map<string, number>();
        let sawCatch = false;
        for (let j = s; j < end; j++) {
          if (/\bcatch\b/.test(lines[j]!)) sawCatch = true;
          const r = /return\s+new\s+([A-Za-z_$][\w$]*)\s*\(/.exec(lines[j]!);
          if (r) returns.set(r[1]!, (returns.get(r[1]!) ?? 0) + 1);
        }
        for (const [ctor, n] of returns) {
          if (n >= 2 && sawCatch && standIns.has(ctor)) {
            out.push({
              arm: 'R2',
              key: `R2::${rel}:${name}`,
              detail: `${rel}:${s + 1} ${name}() returns \`new ${ctor}()\` on ${n} branches, one of them past a \`catch\` — ` +
                'NOT-CONFIGURED and CONFIGURED-BUT-FAILED are the same value to the caller. Failure and emptiness ' +
                'are never the same value; the second is a FAILURE, not a default.',
            });
          }
        }
      }
    }
  }
  return out;
}

/** R3 — exported capability factories in a subject package with zero production callers. */
function findDeadCapability(
  root: string, dirs: readonly string[], subjectPkgDirs: readonly string[], minFiles: number,
): { findings: Finding[]; considered: number } {
  const decls: Array<{ file: string; symbol: string }> = [];
  // `create[A-Z]…` only. A first cut also matched `…Handler`, which in the
  // adapter-owning package is the same set, but across a rendering package it
  // dragged in five material factories and turned a three-entry ledger into a
  // nine-entry one — R3's subject is CAPABILITY FACTORIES in the package that
  // owns a kind-declaring adapter, not every export in the estate.
  const DECL = /\bexport\s+(?:async\s+)?(?:function|const)\s+(create[A-Z][\w$]*)\s*[(=:]/;
  for (const pkgDir of subjectPkgDirs) {
    for (const abs of walk(join(root, pkgDir))) {
      const rel = relPath(root, abs);
      if (/(^|\/)__tests__\//.test(rel) || /\.(test|spec|bench)\.tsx?$/.test(rel)) continue;
      let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      for (const line of stripCommentsToLines(src)) {
        const m = DECL.exec(line);
        if (m) decls.push({ file: rel, symbol: m[1]! });
      }
    }
  }
  if (decls.length === 0) return { findings: [], considered: 0 };

  // ONE walk for every symbol — a walk per symbol would be four passes over
  // six thousand files to answer one question.
  const alternation = [...new Set(decls.map((d) => d.symbol))].map((s) => s.replace(/[$]/g, '\\$')).join('|');
  const r = scanFilesStripped({
    root, dirs, minFiles, label: `${GATE}:R3-callers`,
    pattern: new RegExp(`\\b(${alternation})\\b`),
    exclude: (rel) => /(^|\/)__tests__\//.test(rel) || /\.(test|spec|bench)\.tsx?$/.test(rel),
  });

  const findings: Finding[] = [];
  for (const d of decls) {
    const callers = r.matches.filter((m) =>
      m.groups[0] === d.symbol &&
      m.file !== d.file &&                            // the definition is not a caller
      !/(^|\/)index\.tsx?$/.test(m.file),             // a barrel re-export is not a caller
    );
    if (callers.length === 0) {
      findings.push({
        arm: 'R3',
        key: `R3::${d.file}:${d.symbol}`,
        detail: `${d.file} exports \`${d.symbol}\` with ZERO production callers (tests and barrel ` +
          're-exports excluded). Wire it or delete it — machinery that looks reachable and is not ' +
          'passes an audit of EXISTENCE and fails an audit of REACHABILITY.',
      });
    }
  }
  return { findings, considered: decls.length };
}

/** Walk up from a file to the directory holding its `package.json`. */
function packageDirOf(root: string, relFile: string): string | undefined {
  let d = dirname(join(root, relFile));
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(d, 'package.json'))) return relPath(root, d);
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  return undefined;
}

// ─── The analyser, over any root ─────────────────────────────────────────────

interface Analysis {
  readonly findings: Finding[];
  readonly manifests: number;
  readonly filesScanned: number;
  readonly adapters: Adapter[];
  readonly externalAdapters: Array<{ a: Adapter; manifest?: string }>;
  readonly factoriesConsidered: number;
}

function analyse(root: string, dirs: readonly string[], minFiles: number): Analysis {
  const manifests = collectManifests(root);
  const { adapters, filesScanned } = collectAdapters(root, dirs);
  const findings: Finding[] = [];

  const external: Array<{ a: Adapter; manifest?: string }> = [];
  for (const a of adapters) {
    if (!a.isAdapter) continue;
    if (NEUTRAL_KINDS.has(a.kind.toLowerCase())) continue;
    const m = declaringManifest(a.kind, manifests);
    external.push({ a, manifest: m });
    if (!m) {
      findings.push({
        arm: 'R1',
        key: `R1::${a.file}:${a.className} declares kind='${a.kind}'`,
        detail: `${a.file}:${a.line} — class ${a.className} declares kind='${a.kind}', naming an engine that is ` +
          'NOT a declared dependency of ANY package.json in the repo. Either the dependency lands, or the ' +
          'adapter stops naming an engine it does not run. BOTH are correct exits; this gate prefers neither.',
      });
    }
  }

  const standIns = new Set(
    adapters.filter((a) => a.isAdapter && NEUTRAL_KINDS.has(a.kind.toLowerCase())).map((a) => a.className),
  );
  findings.push(...findBlindSelectors(root, dirs, standIns));

  const subjectPkgDirs = [...new Set(
    external.map(({ a }) => packageDirOf(root, a.file)).filter((x): x is string => !!x),
  )];
  const dead = subjectPkgDirs.length > 0
    ? findDeadCapability(root, dirs, subjectPkgDirs, minFiles)
    : { findings: [] as Finding[], considered: 0 };
  findings.push(...dead.findings);

  return {
    findings, manifests: manifests.length, filesScanned, adapters,
    externalAdapters: external, factoriesConsidered: dead.considered,
  };
}

// ─── Negative + positive control, EXECUTED (gates doc §2.2, C74 §6.2) ────────

function writeTree(base: string, files: Record<string, string>): void {
  rmSync(base, { recursive: true, force: true });
  for (const [p, body] of Object.entries(files)) {
    const abs = join(base, p.split('/').join(sep));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
}

const PLANTED = {
  'package.json': JSON.stringify({ name: 'planted-root', dependencies: { zod: '^3' } }),
  'packages/x/package.json': JSON.stringify({ name: '@planted/x', dependencies: {} }),
  'packages/x/src/GhostAdapter.ts': [
    "import { StandInSolver } from './StandInSolver.js';",
    'export class GhostAdapter {',
    "  readonly kind = 'ghostgcs' as const;",   // R1 — no such dependency anywhere
    '  solve() { return new StandInSolver().solve(); }',
    '}',
    'export async function loadThing(url?: string) {',
    '  if (!url) return new StandInSolver();',        // absent
    '  try { return await pick(url); } catch { }',
    '  return new StandInSolver();',                  // R2 — threw, same value
    '}',
    'async function pick(u: string) { return new StandInSolver(); }',
    'export function createOrphanHandler() { return 1; }', // R3 — nobody calls it
  ].join('\n'),
  'packages/x/src/StandInSolver.ts': [
    'export class StandInSolver {',
    "  readonly kind = 'mock' as const;",
    '  solve() { return null; }',
    '}',
  ].join('\n'),
};

const CLEAN = {
  'package.json': JSON.stringify({ name: 'clean-root', dependencies: { zod: '^3' } }),
  'packages/y/package.json': JSON.stringify({ name: '@clean/y', dependencies: { zod: '^3' } }),
  'packages/y/src/ZodAdapter.ts': [
    'export class ZodAdapter {',
    "  readonly kind = 'zod' as const;",       // declared dependency → R1 clean
    '}',
    'export function createZodThing() { return new ZodAdapter(); }',
    'export async function loadThing(url?: string) {',
    '  if (!url) return { configured: false } as const;',
    '  try { return { configured: true } as const; } catch { throw new Error("unbindable"); }',
    '}',
  ].join('\n'),
  'packages/y/src/consumer.ts': [
    "import { createZodThing } from './ZodAdapter.js';",
    'export const thing = createZodThing();',   // R3 clean — a real caller
  ].join('\n'),
};

function selfTest(): { ok: boolean; lines: string[] } {
  const base = join(tmpdir(), `pryzm-${GATE}-selftest`);
  const lines: string[] = [];
  let ok = true;
  try {
    writeTree(join(base, 'planted'), PLANTED);
    writeTree(join(base, 'clean'), CLEAN);
    const bad = analyse(join(base, 'planted'), ['packages'], 1);
    const good = analyse(join(base, 'clean'), ['packages'], 1);
    const armsFired = new Set(bad.findings.map((f) => f.arm));
    lines.push(`negative control (planted tree): ${bad.findings.length} finding(s), arms fired = [${[...armsFired].sort().join(', ')}]`);
    for (const f of bad.findings) lines.push(`    ✓ ${f.arm} fired — ${f.key}`);
    lines.push(`positive control (clean tree):   ${good.findings.length} finding(s) — must be 0`);
    for (const f of good.findings) lines.push(`    ✗ FALSE POSITIVE — ${f.key}`);
    for (const arm of ['R1', 'R2', 'R3']) {
      if (!armsFired.has(arm as Finding['arm'])) { ok = false; lines.push(`    ✗ BLIND COMPARATOR — ${arm} did not fire on a deliberately planted violation.`); }
    }
    if (good.findings.length > 0) { ok = false; lines.push('    ✗ BLIND COMPARATOR — the clean tree was called dirty.'); }
  } catch (e) {
    ok = false;
    lines.push(`    ✗ self-test threw: ${(e as Error).message}`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  return { ok, lines };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const control = selfTest();
console.log(`\n[${GATE}] executed controls (C74 §6.2 — an arm never watched failing is UNPROVEN):`);
for (const l of control.lines) console.log('   ' + l);

const a = analyse(ROOT, DIRS, 500);

const lines: string[] = [];
const inSubject = a.adapters.filter((x) => x.isAdapter);
lines.push(`manifests read: ${a.manifests} · source files scanned: ${a.filesScanned} · adapter-named classes declaring a kind: ${inSubject.length}`);
for (const ad of inSubject) {
  const neutral = NEUTRAL_KINDS.has(ad.kind.toLowerCase());
  lines.push(`  ${neutral ? 'honest stand-in ' : 'names an engine '}: ${ad.className} kind='${ad.kind}'  ${ad.file}:${ad.line}`);
}
for (const ad of a.adapters.filter((x) => !x.isAdapter)) {
  lines.push(`  out of subject   : ${ad.className} kind='${ad.kind}' ${ad.file}:${ad.line} — the class name does not declare it an adapter (printed, not hidden)`);
}
for (const { a: ad, manifest } of a.externalAdapters) {
  lines.push(manifest
    ? `  R1 ✓ '${ad.kind}' is declared: ${manifest}`
    : `  R1 ✗ '${ad.kind}' is declared by NO package.json in the repo`);
}
lines.push(`R3 considered ${a.factoriesConsidered} exported capability factor(ies) in the adapter-owning package(s).`);
lines.push('');
for (const f of a.findings) lines.push(`FINDING ${f.arm} — ${f.detail}`);

const measured = new Set(a.findings.map((f) => f.key));
const declared = new Set(LEDGER);
const stale = [...declared].filter((k) => !measured.has(k));
const unexpected = [...measured].filter((k) => !declared.has(k));
if (unexpected.length > 0) {
  lines.push('');
  for (const u of unexpected) lines.push(`⚠ NOT ON THE LEDGER — ${u}`);
}

const floors: Floor[] = [
  { what: 'package.json manifests read', measured: a.manifests, min: 100 },
  { what: 'source files scanned', measured: a.filesScanned, min: 500 },
  { what: 'adapter-named classes declaring a kind', measured: inSubject.length, min: 1 },
  { what: 'executed controls passed (0 = blind comparator)', measured: control.ok ? 1 : 0, min: 1 },
];

const result: GateResult = {
  gate: GATE,
  floors,
  lines,
  // A finding not on the ledger must raise the code even when the totals match,
  // so the comparison is by NAME in both directions, never by count.
  findings: a.findings.length + (unexpected.length > 0 ? LEDGER.length + 1 : 0),
  declared: LEDGER.length,
  findingNames: [...measured],
  stale,
};

process.exit(reportGate(result));
