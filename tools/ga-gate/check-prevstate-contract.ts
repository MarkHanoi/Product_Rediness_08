#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-prevstate-contract.ts
 *
 * C72 §3.1–§3.5 / §6.2 · BIM30-READINESS-GATES §3.10 — **the seam, not the
 * classifier.** Every store emit that a delta classifier consumes must carry
 * `prevState`.
 *
 * ─── Why this gate exists ────────────────────────────────────────────────────
 * The openings fast path was unreachable for months for want of TWO ARGUMENTS:
 * `WallStore.updateDoor` / `updateWindow` emitted `('update', frozen)` without
 * the pre-mutation wall, so every opening edit hit
 * `if (!prevState) return { kind: 'whole-level', reason: 'no-prevState' }` and
 * classified whole-level (C72 §3.3 — the ADR-057 famine). Every classifier test
 * passed throughout, because each one BUILT `prevState` BY HAND and handed it to
 * the classifier: they tested the classifier, and the broken thing was the emit
 * seam (C72 §3.4). This gate watches the seam.
 *
 * ─── The arms ────────────────────────────────────────────────────────────────
 *  P0  *(floors, exit 2)*  ≥ MIN_STORE_FILES `*Store.ts` files read under
 *      packages/ · ≥ MIN_EMIT_SITES `'update'` emit sites found · ≥1 diff
 *      consumer (a classifier with a `no-prevState` guard) discovered · the
 *      in-run controls fired.
 *  P1  *(ratchet, NAMED)*  every `'update'` emit site in a production
 *      `*Store.ts` carries the third (`prevState`) argument. Each site lacking
 *      it is named `file:line` — the store AND the site, because "WallStore is
 *      short" is not actionable and "WallStore.ts:1021" is. Detector accepts
 *      the estate's three emit spellings: `emit('update', …)`,
 *      `_emit('update', …)`, `_notify('update', …)`.
 *      ⚠ SCOPE, stated: C72 §3.1 obliges only stores whose consumers make
 *      diff-based decisions. This arm enumerates ALL update-emitting stores —
 *      deliberately wider, per the Phase 1 Tier 2 brief ("enumerate stores whose
 *      emit carries a third argument vs not; ratchet the gap"), because a store
 *      with no classifier TODAY is the famine of the NEXT classifier, and the
 *      list is how a future pair starts green instead of red. The ledger pins at
 *      the measured reading and only shrinks.
 *  P2  *(hard)*  no classifier ships whose `no-prevState` branch is its ONLY
 *      reachable branch: for every production file carrying a `no-prevState`
 *      guard, at least one production store that can feed it emits `'update'`
 *      with three arguments. Pairing: stores in the classifier's own package
 *      first, then a `<Prefix>Store.ts` matching the classifier's name prefix
 *      estate-wide. THIS is the arm that would have caught the two-argument
 *      famine that starved ADR-057.
 *  P3  *(ratchet, NAMED)*  per (store ↔ classifier) pair, a propagation test
 *      exists that drives the REAL mutation entry point: a test file in the
 *      store's package that constructs the real store (`new XStore(`),
 *      registers a real listener (`.subscribe(`/`.on(`), and reads `prevState`
 *      off the emission. A hand-built-fixture test does not satisfy it — a test
 *      whose fixture supplies the very value under test proves nothing
 *      (C72 §3.4). `packages/geometry-wall/__tests__/WallOpeningEmitSeam.test.ts`
 *      is the shape to copy.
 *
 * ─── Also forbidden, and NOT yet an arm (stated, not implied) ────────────────
 * C72 §3.5: `prevState` reconstructed by the consumer re-reading the store —
 * after the mutation the store holds the NEW value, so a re-read diffs a value
 * against itself and classifies "unchanged", a false clean. A static detector
 * for "this argument was rebuilt from a store read" needs data-flow this
 * scanner does not have; the omission is recorded here rather than silently
 * absorbed into "cannot see".
 *
 * ─── Negative + positive control — EXECUTED ON EVERY RUN ────────────────────
 * `selfTest()` materialises two synthetic workspaces:
 *   • PLANTED — a store with one 3-arg and one 2-arg `'update'` emit (P1 must
 *     name the FILE AND THE SITE of the 2-arg one, not just the store); a
 *     second store with ONLY 2-arg emits beside a classifier with a
 *     `no-prevState` guard (P2 must report the classifier whose conservative
 *     branch is its only reachable branch — the reverted-WallStore shape); and
 *     no seam test for either pair (P3 must name both pairs).
 *   • CLEAN — a store whose every update emit is 3-arg, its classifier, and a
 *     seam test that constructs the real store, subscribes, and reads
 *     prevState. Must read 0. The clean tree is the positive control for the
 *     planted arms; on the REAL tree the positive control is the
 *     WallStore↔WallDeltaClassifier pair itself (3-arg at WallStore.ts:680,
 *     :1293, :1377 + WallOpeningEmitSeam.test.ts), reported green by P2/P3.
 * If any planted arm stays silent, or the clean tree reads dirty, the gate
 * exits 2 as a BLIND COMPARATOR — an arm never watched failing has never been
 * shown to work.
 *
 * ─── Ledger, not count ───────────────────────────────────────────────────────
 * Named `arm::file:line` (P1) / `arm::pair` (P3), checked in BOTH directions:
 * an unledgered finding exits 3; a ledgered finding no longer measured exits 3
 * (stale). A bare count would let one emit site gain its argument while another
 * lost its own and read "no change" (C69 §7.c).
 *
 * ─── What this gate CANNOT see ───────────────────────────────────────────────
 *   • whether the forwarded snapshot is the RIGHT one — presence of a third
 *     argument, not correctness of it;
 *   • consumers reached by dynamic dispatch, or classifiers whose conservative
 *     branch is spelled without the literal `no-prevState` reason;
 *   • bespoke propagation pairs outside the emit('update') convention
 *     (C72 §0.3 — those are check-propagation-trackers-reach territory);
 *   • the C72 §3.5 re-read pattern (stated above);
 *   • an emit call split across >12 lines (the argument-counting window).
 *
 * Exit 0 clean · 1 exactly the named ledger · 2 MISCONFIGURED / blind
 * comparator · 3 ledger exceeded or stale. 2 and 3 are never absorbable.
 */

import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, sep, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { walk, relPath, stripCommentsToLines } from './lib/sourceScan.js';
import { reportGate, type Floor, type GateResult } from '../rac-conformance/certification/contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const GATE = 'check-prevstate-contract';

/** Stores live in packages/ (C72 §0.2's census: 120 `*Store.ts` files there). */
const STORE_DIRS = ['packages'] as const;
/** Classifiers may sit beside their store or in the app that coordinates them. */
const CLASSIFIER_DIRS = ['packages', 'apps', 'plugins'] as const;

/** P0 floors. 120 store files and 39 update emit sites measured 2026-08-12. */
const MIN_STORE_FILES = 100;
const MIN_EMIT_SITES = 10;

// ─── The named ledger. SHRINK-ONLY, checked in BOTH directions. ──────────────
/**
 * P1 — `'update'` emit sites carrying NO third (`prevState`) argument.
 * Measured 2026-08-12 at HEAD (56a838bc): 21 sites across 11 store files.
 * Fix a site → strike its line in the SAME commit. Do NOT add lines: a new
 * 2-arg emit site is exit 3.
 *
 * The four WallStore sites deserve a sentence: WallStore ALREADY forwards
 * prevState on three sites (:680, :1293, :1377) and its classifier consumes it
 * — these four are update paths (updateWall colour/dimension spellings) that
 * still emit two arguments, i.e. edits through them classify `whole-level /
 * no-prevState` today. They are the highest-value strikes on this list.
 */
const LEDGER: readonly string[] = [
  'P1::packages/core-app-model/src/stores/CeilingStore.ts:221',
  'P1::packages/core-app-model/src/stores/CeilingStore.ts:282',
  'P1::packages/core-app-model/src/stores/CeilingStore.ts:300',
  'P1::packages/core-app-model/src/stores/FloorStore.ts:184',
  'P1::packages/core-app-model/src/stores/FloorSystemTypeStore.ts:443',
  'P1::packages/core-app-model/src/stores/HandrailStore.ts:59',
  'P1::packages/core-app-model/src/stores/HandrailStore.ts:66',
  'P1::packages/core-app-model/src/stores/RoofStore.ts:121',
  'P1::packages/core-app-model/src/stores/RoofStore.ts:138',
  'P1::packages/core-app-model/src/stores/StairStore.ts:91',
  'P1::packages/core-app-model/src/stores/StairStore.ts:106',
  'P1::packages/geometry-lift/src/LiftStore.ts:88',
  'P1::packages/geometry-lift/src/LiftStore.ts:99',
  'P1::packages/geometry-roof/src/RoofStore.ts:120',
  'P1::packages/geometry-roof/src/RoofStore.ts:137',
  'P1::packages/geometry-stair/src/StairStore.ts:90',
  'P1::packages/geometry-stair/src/StairStore.ts:105',
  'P1::packages/geometry-wall/src/WallStore.ts:1021',
  'P1::packages/geometry-wall/src/WallStore.ts:1065',
  'P1::packages/geometry-wall/src/WallStore.ts:1102',
  'P1::packages/geometry-wall/src/WallStore.ts:1134',
];

// ─── Subject discovery ───────────────────────────────────────────────────────

/** `emit('update'` / `_emit('update'` / `_notify('update'` — the estate's three spellings. */
const EMIT_RE = /\b_?(?:emit|notify)\s*\(\s*['"]update['"]/;

interface EmitSite {
  readonly file: string;
  readonly line: number;
  readonly args: number;
  readonly text: string;
}

/**
 * Count top-level arguments of the call starting at the EMIT_RE match.
 * The call text is assembled across up to 12 lines so a wrapped emit is still
 * counted; depth-tracked over ()/[]/{} and both quote kinds so an argument
 * containing commas does not inflate the count.
 */
function countArgs(lines: readonly string[], startIdx: number, matchIdx: number): number {
  let text = '';
  for (let i = startIdx; i < Math.min(lines.length, startIdx + 12); i++) {
    text += (i === startIdx ? lines[i]!.slice(matchIdx) : '\n' + lines[i]!);
  }
  const open = text.indexOf('(');
  if (open === -1) return 0;
  let depth = 0, args = 1, inStr: string | null = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i]!;
    if (inStr) { if (c === inStr && text[i - 1] !== '\\') inStr = null; continue; }
    if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; continue; }
    if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) return args; continue; }
    if (c === ',' && depth === 1) args++;
  }
  return args; // unbalanced within the window — counted as seen, never inflated
}

function isTestPath(rel: string): boolean {
  return /(^|\/)__tests__\//.test(rel) || /\.(test|spec|bench)\.tsx?$/.test(rel);
}

function collectEmitSites(root: string, dirs: readonly string[]): { sites: EmitSite[]; storeFiles: number } {
  const sites: EmitSite[] = [];
  let storeFiles = 0;
  for (const dir of dirs) {
    for (const abs of walk(join(root, dir))) {
      const rel = relPath(root, abs);
      if (isTestPath(rel)) continue;
      if (!/Store\.ts$/.test(rel)) continue;
      let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      storeFiles++;
      const lines = stripCommentsToLines(src);
      for (let i = 0; i < lines.length; i++) {
        const m = EMIT_RE.exec(lines[i]!);
        if (!m) continue;
        sites.push({
          file: rel, line: i + 1,
          args: countArgs(lines, i, m.index),
          text: lines[i]!.trim(),
        });
      }
    }
  }
  return { sites, storeFiles };
}

interface Classifier { readonly file: string; readonly line: number }

/** A diff consumer: a production file whose CODE (not prose) carries a `no-prevState` guard. */
function collectClassifiers(root: string, dirs: readonly string[]): { classifiers: Classifier[]; filesScanned: number } {
  const classifiers: Classifier[] = [];
  let filesScanned = 0;
  for (const dir of dirs) {
    for (const abs of walk(join(root, dir))) {
      const rel = relPath(root, abs);
      if (isTestPath(rel)) continue;
      let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      filesScanned++;
      if (!src.includes('no-prevState')) continue; // cheap pre-filter on raw text
      const lines = stripCommentsToLines(src);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]!.includes('no-prevState')) {
          classifiers.push({ file: rel, line: i + 1 });
          break; // one entry per file — the file is the classifier
        }
      }
    }
  }
  return { classifiers, filesScanned };
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

interface Finding { readonly arm: 'P1' | 'P2' | 'P3'; readonly key: string; readonly detail: string }

interface Analysis {
  readonly findings: Finding[];
  readonly storeFiles: number;
  readonly emitSites: EmitSite[];
  readonly classifiers: Classifier[];
  readonly filesScanned: number;
  readonly pairs: Array<{ classifier: string; stores: string[]; threeArg: boolean; seamTest?: string }>;
}

function analyse(root: string, storeDirs: readonly string[], classifierDirs: readonly string[]): Analysis {
  const { sites, storeFiles } = collectEmitSites(root, storeDirs);
  const { classifiers, filesScanned } = collectClassifiers(root, classifierDirs);
  const findings: Finding[] = [];

  // P1 — every 2-arg update emit site, named store AND site.
  for (const s of sites) {
    if (s.args < 3) {
      findings.push({
        arm: 'P1',
        key: `P1::${s.file}:${s.line}`,
        detail: `${s.file}:${s.line} emits 'update' with ${s.args} argument(s) — no prevState. ` +
          `Every diff consumer downstream of this site classifies conservatively (\`no-prevState\`), ` +
          `which is exactly the two-argument famine that starved ADR-057. [${s.text}]`,
      });
    }
  }

  // P2 + P3 — pair each classifier with the store(s) that can feed it.
  const pairs: Analysis['pairs'] = [];
  for (const c of classifiers) {
    const pkg = packageDirOf(root, c.file);
    let stores = pkg
      ? sites.filter((s) => s.file.startsWith(pkg + '/')).map((s) => s.file)
      : [];
    if (stores.length === 0) {
      // Fallback: <Prefix>Store.ts by classifier name prefix, estate-wide.
      const prefix = basename(c.file).replace(/(Delta)?Classifier\.tsx?$|\.tsx?$/, '').replace(/Store$/, '');
      if (prefix) stores = sites.filter((s) => basename(s.file).startsWith(prefix)).map((s) => s.file);
    }
    const storeSet = [...new Set(stores)];
    const feeding = sites.filter((s) => storeSet.includes(s.file));
    const threeArg = feeding.some((s) => s.args >= 3);

    if (storeSet.length > 0 && !threeArg) {
      findings.push({
        arm: 'P2',
        key: `P2::${c.file}`,
        detail: `${c.file}:${c.line} guards on no-prevState, but NO production emitter that feeds it ` +
          `(${storeSet.join(', ')}) passes a third argument on any 'update' emit — the conservative branch ` +
          `is the classifier's ONLY reachable branch. The classifier is shipped theatre until one emit site ` +
          `forwards the pre-mutation snapshot (C72 §3.3).`,
      });
    }

    // P3 — a seam test in the store's package: constructs the real store,
    // subscribes, and reads prevState off the real emission.
    let seamTest: string | undefined;
    const storePkgs = [...new Set(storeSet.map((f) => packageDirOf(root, f)).filter((x): x is string => !!x))];
    for (const spkg of storePkgs) {
      for (const abs of walk(join(root, spkg))) {
        const rel = relPath(root, abs);
        if (!isTestPath(rel)) continue;
        let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
        const storeClasses = storeSet.map((f) => basename(f).replace(/\.tsx?$/, ''));
        const constructsStore = storeClasses.some((cls) => new RegExp(`new\\s+${cls}\\s*\\(`).test(src));
        const subscribes = /\.subscribe\s*\(|\.addListener\s*\(|\.on\s*\(/.test(src);
        if (constructsStore && subscribes && src.includes('prevState')) { seamTest = rel; break; }
      }
      if (seamTest) break;
    }
    if (storeSet.length > 0 && !seamTest) {
      findings.push({
        arm: 'P3',
        key: `P3::${c.file}`,
        detail: `pair (${storeSet.join(' + ')} ↔ ${c.file}) has NO propagation test that drives the real ` +
          `mutation entry point — no test in the store's package constructs the real store, subscribes, and ` +
          `reads prevState off the emission. Hand-built-fixture classifier tests do not count: a fixture that ` +
          `supplies the very value under test proves nothing (C72 §3.4). Copy ` +
          `packages/geometry-wall/__tests__/WallOpeningEmitSeam.test.ts.`,
      });
    }
    pairs.push({ classifier: c.file, stores: storeSet, threeArg, seamTest });
  }

  return { findings, storeFiles, emitSites: sites, classifiers, filesScanned, pairs };
}

// ─── Negative + positive control, EXECUTED (gates doc §2.2) ──────────────────

function writeTree(base: string, files: Record<string, string>): void {
  rmSync(base, { recursive: true, force: true });
  for (const [p, body] of Object.entries(files)) {
    const abs = join(base, p.split('/').join(sep));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
}

const PLANTED = {
  'packages/x/package.json': JSON.stringify({ name: '@planted/x' }),
  // One 3-arg site, one 2-arg site — P1 must name the FILE AND THE SITE.
  'packages/x/src/FooStore.ts': [
    'export class FooStore {',
    '  update(next: unknown, prev: unknown) {',
    "    this.emit('update', next, prev);",
    "    this.emit('update', next);",       // ← P1: the famine site
    '  }',
    '  private emit(e: string, a: unknown, b?: unknown) {}',
    '}',
  ].join('\n'),
  'packages/y/package.json': JSON.stringify({ name: '@planted/y' }),
  // A store that ONLY ever emits two arguments…
  'packages/y/src/BarStore.ts': [
    'export class BarStore {',
    "  update(next: unknown) { this.emit('update', next); }",
    '  private emit(e: string, a: unknown, b?: unknown) {}',
    '}',
  ].join('\n'),
  // …beside a classifier whose conservative branch is therefore its ONLY branch.
  'packages/y/src/BarDeltaClassifier.ts': [
    'export function classify(prevState?: unknown) {',
    "  if (!prevState) return { kind: 'whole-level', reason: 'no-prevState' };",
    "  return { kind: 'local' };",
    '}',
  ].join('\n'),
};

const CLEAN = {
  'packages/z/package.json': JSON.stringify({ name: '@clean/z' }),
  'packages/z/src/BazStore.ts': [
    'export class BazStore {',
    "  update(next: unknown, prev: unknown) { this.emit('update', next, prev); }",
    '  subscribe(fn: (e: string, a: unknown, prevState?: unknown) => void) {}',
    '  private emit(e: string, a: unknown, b?: unknown) {}',
    '}',
  ].join('\n'),
  'packages/z/src/BazDeltaClassifier.ts': [
    'export function classify(prevState?: unknown) {',
    "  if (!prevState) return { kind: 'whole-level', reason: 'no-prevState' };",
    "  return { kind: 'local' };",
    '}',
  ].join('\n'),
  'packages/z/__tests__/BazSeam.test.ts': [
    "import { BazStore } from '../src/BazStore';",
    'const store = new BazStore();',
    'store.subscribe((e, a, prevState) => { void prevState; });',
    "store.update({ id: '1' }, { id: '0' });",
  ].join('\n'),
};

function selfTest(): { ok: boolean; lines: string[] } {
  const base = join(tmpdir(), `pryzm-${GATE}-selftest`);
  const lines: string[] = [];
  let ok = true;
  try {
    writeTree(join(base, 'planted'), PLANTED);
    writeTree(join(base, 'clean'), CLEAN);
    const bad = analyse(join(base, 'planted'), ['packages'], ['packages']);
    const good = analyse(join(base, 'clean'), ['packages'], ['packages']);
    const armsFired = new Set(bad.findings.map((f) => f.arm));
    lines.push(`negative control (planted tree): ${bad.findings.length} finding(s), arms fired = [${[...armsFired].sort().join(', ')}]`);
    for (const f of bad.findings) lines.push(`    ✓ ${f.arm} fired — ${f.key}`);
    // P1 must name the SITE, not just the store: FooStore.ts line 4 is the 2-arg emit.
    if (!bad.findings.some((f) => f.key === 'P1::packages/x/src/FooStore.ts:4')) {
      ok = false;
      lines.push('    ✗ BLIND COMPARATOR — P1 did not name the exact 2-arg emit SITE (FooStore.ts:4).');
    }
    if (bad.findings.some((f) => f.key === 'P1::packages/x/src/FooStore.ts:3')) {
      ok = false;
      lines.push('    ✗ FALSE POSITIVE — P1 flagged the 3-arg emit site (FooStore.ts:3).');
    }
    lines.push(`positive control (clean tree):   ${good.findings.length} finding(s) — must be 0`);
    for (const f of good.findings) lines.push(`    ✗ FALSE POSITIVE — ${f.key}`);
    for (const arm of ['P1', 'P2', 'P3'] as const) {
      if (!armsFired.has(arm)) { ok = false; lines.push(`    ✗ BLIND COMPARATOR — ${arm} did not fire on a deliberately planted violation.`); }
    }
    if (good.findings.length > 0) ok = false;
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
console.log(`\n[${GATE}] executed controls (an arm never watched failing is UNPROVEN):`);
for (const l of control.lines) console.log('   ' + l);

const a = analyse(ROOT, STORE_DIRS, CLASSIFIER_DIRS);

const lines: string[] = [];
const carrying = a.emitSites.filter((s) => s.args >= 3);
const storesWithSites = new Set(a.emitSites.map((s) => s.file));
const storesCarrying = new Set(carrying.map((s) => s.file));
lines.push(
  `*Store.ts files read: ${a.storeFiles} · 'update' emit sites: ${a.emitSites.length} in ${storesWithSites.size} stores · ` +
  `sites carrying prevState: ${carrying.length} in ${storesCarrying.size} stores · classifier files scanned: ${a.filesScanned}`,
);
for (const s of [...storesWithSites].sort()) {
  const all = a.emitSites.filter((x) => x.file === s);
  const three = all.filter((x) => x.args >= 3).length;
  lines.push(`  ${three === all.length ? 'carries prevState' : three > 0 ? 'PARTIAL         ' : 'no prevState    '}: ${s} (${three}/${all.length} update sites)`);
}
lines.push(`diff consumers (no-prevState guards): ${a.classifiers.length}`);
for (const p of a.pairs) {
  lines.push(`  pair: ${p.classifier} ← [${p.stores.join(', ') || 'NO STORE RESOLVED'}] · 3-arg feed: ${p.threeArg ? 'YES' : 'NO'} · seam test: ${p.seamTest ?? 'NONE'}`);
}
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
  { what: '*Store.ts files read under packages/', measured: a.storeFiles, min: MIN_STORE_FILES },
  { what: "'update' emit sites discovered", measured: a.emitSites.length, min: MIN_EMIT_SITES },
  { what: 'diff consumers (no-prevState classifiers) discovered', measured: a.classifiers.length, min: 1 },
  { what: 'executed controls passed (0 = blind comparator)', measured: control.ok ? 1 : 0, min: 1 },
];

const result: GateResult = {
  gate: GATE,
  floors,
  lines,
  // Comparison is by NAME in both directions, never by count: an unledgered
  // finding must raise the code even when totals coincide.
  findings: a.findings.length + (unexpected.length > 0 ? LEDGER.length + 1 : 0),
  declared: LEDGER.length,
  findingNames: [...measured],
  stale,
};

process.exit(reportGate(result));
