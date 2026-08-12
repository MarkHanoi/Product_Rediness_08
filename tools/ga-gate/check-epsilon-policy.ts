#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-epsilon-policy.ts
 *
 * C73 §2.1–§2.5 / §5.1 · BIM30-READINESS-GATES §3.15 — **one declared tolerance
 * policy, unit-qualified, consumed rather than reinvented.**
 *
 * ─── Why this gate exists ────────────────────────────────────────────────────
 * *Every private epsilon is a private definition of "the same place."* Measured
 * at HEAD there are hundreds of them, spanning three orders of magnitude, all
 * deciding the same question: `0.001` and `0.05` are both metres and differ by
 * 50×; `1e-9` and `1e-6` are both "numerically zero" and differ by 1000×. Which
 * one a given coincidence test uses is an accident of who wrote it.
 *
 * And `packages/geometry-kernel` — the layer that OWNS geometry — exports no
 * epsilon at all. There is nothing to import, so every consumer forms its own.
 * That is why E1 is RED on the day this gate lands, and why the gate lands
 * anyway (gates doc §2.3): deferring a gate until its subject is fixed is how a
 * subject stays unfixed.
 *
 * ─── HOW TO RE-DERIVE EVERY NUMBER BELOW ─────────────────────────────────────
 * A number nobody can reproduce is a number nobody will trust. One command:
 *
 *     npx tsx tools/ga-gate/check-epsilon-policy.ts
 *
 * It prints the full value histogram, the per-arm counts, and every ledgered
 * declaration. To regenerate the ledger after a GENUINE reduction:
 *
 *     npx tsx tools/ga-gate/check-epsilon-policy.ts --write-baseline
 *
 * That writes `tools/ga-gate/epsilon-policy-baseline.json`. It is SHRINK-ONLY:
 * regenerating it after an INCREASE is the same act as deleting the gate, and
 * the diff is designed to make that obvious to a reviewer — every entry is
 * `file:NAME → value`, never a bare count (C69 §7.c: a count lets one epsilon
 * be removed and another added and still read "no change").
 *
 * ─── THE RECIPE, stated so the reading is falsifiable ────────────────────────
 * A TOLERANCE DECLARATION is `const|let|readonly|static <NAME> = <value>` where
 * NAME carries `EPS`/`EPSILON`/`TOL`/`TOLERANCE` **as a name segment** — at the
 * start, after an `_`, or as a camelCase word. Comments are stripped first.
 *
 * The segment anchoring is not decoration. A substring match on `EPS`/`TOL`
 * harvests `MAX_STEPS`, `ARC_STEPS`, `totalSteps`, `deps`, `reps` and
 * `ontology` — measured, all of them, on the first cut. Every one is a
 * false positive in the direction of a BIGGER number, and a ratchet inflated by
 * junk is a ratchet with free slots in it.
 *
 * ⚠ **C73 §0.1 states 267; this recipe, run at HEAD, does not reproduce that
 * number** (see the run output for the current reading). C73 gives the shape of
 * its grep but not its exclusions, and it does not say whether comments were
 * stripped or tests included — so 267 is not re-derivable from the contract as
 * written. This gate therefore pins at ITS OWN measured reading, prints the
 * recipe, and prints both the with-tests and without-tests counts so anyone
 * re-running C73's sweep can see which choice moves the number. The ORDERING
 * that C73 draws its conclusion from — hundreds of rival declarations across
 * three orders of magnitude, none of them in geometry-kernel — is unchanged and
 * is what this gate ratchets.
 *
 * ─── The arms ────────────────────────────────────────────────────────────────
 *  E1 *(hard)*  the declared tolerance module exists and is exported from
 *      `packages/geometry-kernel`, naming at minimum a NUMERIC-ZERO epsilon
 *      (dimensionless), a MODEL-SPACE COINCIDENCE tolerance (metres), and a
 *      PARALLELISM/COLLINEARITY tolerance (radians or normalised dot).
 *      **RED TODAY — there is no such module.**
 *  E2 *(ratchet, named)* declarations outside the module, pinned at the measured
 *      reading, shrink-only, listed by file.
 *  E3 *(hard)*  a new or modified geometric predicate imports the declared
 *      tolerance. **NOT EVALUATED while E1 is red** — there is nothing to
 *      import, and an arm that passes because its subject does not exist is the
 *      exact failure RULE 1 forbids. Printed as NOT EVALUATED every run.
 *  E4 *(hard)*  a declared tolerance's value may only SHRINK or stay. Evaluated
 *      TODAY against the per-declaration values in the baseline — this is the
 *      arm that matters, because widening a tolerance changes what "the same
 *      place" means for every consumer and the change is invisible at the site
 *      that made it.
 *  E5 *(ratchet, named)* unit-unqualified names. `EPS = 0.05` is unreadable —
 *      5 cm, or 5 % of something? `COINCIDENT_M = 0.05` cannot be misread.
 *      `defaultJunctionBandM` is the naming precedent.
 *
 * ─── NOT epsilons — excluded by name, with the reason (C73 §2.1, §3.3) ───────
 *   • `defaultJunctionBandM` (geometry-wall/JunctionResolverV2) — a 0.20 m
 *     WALL-JUNCTION band. A domain constant under its own domain owner.
 *   • `CENTROID_MATCH_RADIUS` (room-topology/RoomDetectionEngine) — a 2.0 m
 *     room-IDENTITY radius. Same.
 *   Both are correct where they are; neither is a numeric epsilon, and neither
 *   is what the rival declarations are reaching for.
 *
 * ─── Negative control — EXECUTED ON EVERY RUN (gates doc §2.2) ───────────────
 * `selfTest()` drives the same analyser over synthetic trees:
 *   • E4: the SAME declaration at `1e-9` and then at `1e-6` — a widening by
 *     three orders — must be reported RED **naming the old and the new value**.
 *     This is the control the gates doc singles out.
 *   • E2/E5: a planted `const EPS = 0.05` must appear in both ledgers; a planted
 *     `const COINCIDENT_M = 0.001` must appear in E2 and NOT in E5.
 *   • E1: a synthetic geometry-kernel exporting all three roles must read GREEN,
 *     which is the only available proof that E1 is not simply stuck red.
 * If any control fails to fire the gate exits 2 as a BLIND COMPARATOR.
 *
 * ─── Honesty floors (exit 2, NEVER absorbable) ───────────────────────────────
 *   • source files scanned      ≥ 500
 *   • tolerance declarations    ≥ 1   — a scan finding NONE is misconfigured,
 *     not clean (C73 §5.1 E0).
 *   • executed controls passed  = 1
 *
 * ─── What this gate CANNOT see ───────────────────────────────────────────────
 *   • TOLERANCE APPROPRIATENESS — E4 sees a widening, never whether 0.05 m was
 *     ever the right coincidence radius for a wall;
 *   • tolerances computed at runtime, or passed in as parameters;
 *   • GPU-side comparisons — anything decided in a shader;
 *   • a tolerance whose name says nothing (`const k = 1e-6`) — invisible to a
 *     name-anchored recipe, and the reason E5 exists.
 *
 * Exit 0 clean · 1 exactly the declared ledger · 2 MISCONFIGURED · 3 exceeded or
 * stale. 2 and 3 are never absorbable as declared debt.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { walk, relPath, stripCommentsToLines } from './lib/sourceScan.js';
import { reportGate, type Floor, type GateResult } from '../rac-conformance/certification/contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const GATE = 'check-epsilon-policy';
const DIRS = ['packages', 'apps', 'plugins'] as const;
const BASELINE = resolve(HERE, 'epsilon-policy-baseline.json');
const WRITE = process.argv.includes('--write-baseline');

/** The module C73 §2.1 requires, once it exists. */
const KERNEL = 'packages/geometry-kernel';

/**
 * NAME SEGMENT anchoring. `EPS`/`EPSILON`/`TOL`/`TOLERANCE` must sit at the
 * start of the identifier, straight after an `_`, or as a capitalised camelCase
 * word. See the header for the six false positives this excludes.
 */
const DECL = new RegExp(
  '\\b(?:const|let|readonly|static)\\s+' +
  '(' +
    '(?:[_$]*(?:EPS(?:ILON)?|TOL(?:ERANCE)?|eps(?:ilon)?|tol(?:erance)?)[\\w$]*)' +   // start, or after _
    '|(?:[\\w$]*?[a-z0-9][_]?(?:EPS(?:ILON)?|TOL(?:ERANCE)?)[\\w$]*)' +               // FOO_EPS / fooEPS
    '|(?:[\\w$]*?[a-z0-9](?:Eps(?:ilon)?|Tol(?:erance)?)[\\w$]*)' +                   // camel: fooTolM
    '|(?:[\\w$]*?_(?:EPS(?:ILON)?|TOL(?:ERANCE)?|eps(?:ilon)?|tol(?:erance)?)[\\w$]*)' +
  ')' +
  '\\s*(?::\\s*[^=]+?)?=\\s*([^;,\\n]+)',
);

/** A unit-qualified name (C73 §2.3). `defaultJunctionBandM` is the precedent. */
const UNIT_QUALIFIED = /(?:_(?:M|MM|CM|KM|DEG|RAD|PX|PCT|RATIO|DOT|M2|S|MS)\b|(?:M|Mm|Cm|Deg|Rad|Px|Pct|Ratio|Dot|M2|Ms)$|_(?:M|MM|DEG|RAD)_|Metres|Meters|Degrees|Radians|Dimensionless)/;

/** Domain bands. NOT epsilons — see the header for why each is here. */
const NOT_AN_EPSILON: ReadonlyArray<readonly [RegExp, string]> = [
  [/^defaultJunctionBand/, 'a 0.20 m WALL-JUNCTION band — a domain constant under its own domain owner (C73 §2.1)'],
  [/^CENTROID_MATCH_RADIUS$/, 'a 2.0 m room-IDENTITY radius — a domain constant, not a numeric epsilon (C73 §2.1)'],
];

interface Decl {
  readonly file: string;
  readonly line: number;
  readonly name: string;
  readonly value: string;
  /** Numeric literal value, when the RHS is one. */
  readonly num?: number;
  readonly isTest: boolean;
}

interface Baseline {
  readonly recipe: string;
  readonly measuredAt: string;
  /** `file:NAME` → the declared value, verbatim. E2's ledger AND E4's prior values. */
  readonly declarations: Record<string, string>;
  /** `file:NAME` of every unit-unqualified declaration. E5's ledger. */
  readonly unqualified: string[];
  /** E1 is red today; 1 means "declared failing". */
  readonly e1: number;
}

function isTestPath(rel: string): boolean {
  return /(^|\/)__tests__\//.test(rel) || /\.(test|spec|bench)\.tsx?$/.test(rel) || /(^|\/)tests?\//.test(rel);
}

function collect(root: string, dirs: readonly string[]): { decls: Decl[]; filesScanned: number } {
  const decls: Decl[] = [];
  let filesScanned = 0;
  for (const dir of dirs) {
    for (const abs of walk(join(root, dir))) {
      const rel = relPath(root, abs);
      let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      filesScanned++;
      const lines = stripCommentsToLines(src);
      for (let i = 0; i < lines.length; i++) {
        const m = DECL.exec(lines[i]!);
        if (!m) continue;
        const name = m[1]!;
        if (NOT_AN_EPSILON.some(([re]) => re.test(name))) continue;
        const value = m[2]!.trim();
        // A COLLECTION is not a tolerance. `const eps = []` (an epsilon LIST, in
        // WallIntersectionResolver) is not a private definition of "the same
        // place", and counting it inflates the ratchet with something no fix can
        // ever remove.
        if (/^[[{]/.test(value)) continue;
        const numMatch = /^-?\d+(?:\.\d+)?(?:e-?\d+)?$/i.exec(value);
        decls.push({
          file: rel, line: i + 1, name, value,
          num: numMatch ? Number(value) : undefined,
          isTest: isTestPath(rel),
        });
      }
    }
  }
  return { decls, filesScanned };
}

/** E1 — the declared module, and the three roles it must name. */
interface E1Result { readonly ok: boolean; readonly missing: string[]; readonly found: string[] }

const ROLES: ReadonlyArray<readonly [string, RegExp]> = [
  ['numeric-zero (dimensionless)', /\b(?:EPS(?:ILON)?_ZERO|ZERO_EPS(?:ILON)?|NUMERIC_ZERO|EPS(?:ILON)?_DIMENSIONLESS)\b/],
  ['model-space coincidence (metres)', /\b(?:COINCIDENT|COINCIDENCE)_(?:M|MM)\b/],
  ['parallelism / collinearity (rad or dot)', /\b(?:PARALLEL|COLLINEAR)(?:ISM)?_(?:RAD|DOT|DEG)\b/],
];

function checkE1(root: string, kernelDir: string): E1Result {
  const missing: string[] = [];
  const found: string[] = [];
  const kernelSrc = join(root, kernelDir, 'src');
  if (!existsSync(kernelSrc)) {
    return { ok: false, missing: ROLES.map(([r]) => `${r} — ${kernelDir}/src does not exist`), found };
  }
  // The role must be EXPORTED (a private const is not a policy) and reachable
  // from the package root — a module nobody can import is not "declared".
  let exported = '';
  for (const abs of walk(kernelSrc)) {
    const rel = relPath(root, abs);
    if (isTestPath(rel)) continue;
    let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
    for (const line of stripCommentsToLines(src)) {
      if (/^\s*export\s+(?:const|declare\s+const)\s/.test(line)) exported += line + '\n';
    }
  }
  for (const [role, re] of ROLES) {
    if (re.test(exported)) found.push(role); else missing.push(role);
  }
  return { ok: missing.length === 0, missing, found };
}

// ─── Analysis ────────────────────────────────────────────────────────────────

interface Analysis {
  readonly decls: Decl[];
  readonly production: Decl[];
  readonly filesScanned: number;
  readonly e1: E1Result;
  readonly unqualified: Decl[];
}

function keyOf(d: Decl): string { return `${d.file}:${d.name}`; }

function analyse(root: string, dirs: readonly string[], kernelDir: string): Analysis {
  const { decls, filesScanned } = collect(root, dirs);
  const production = decls.filter((d) => !d.isTest && !d.file.startsWith(`${kernelDir}/src/`));
  const unqualified = production.filter((d) => d.num !== undefined && !UNIT_QUALIFIED.test(d.name));
  return { decls, production, filesScanned, e1: checkE1(root, kernelDir), unqualified };
}

/** E4 — a declared tolerance's value may only shrink or stay. */
function widenings(prior: Record<string, string>, now: readonly Decl[]): string[] {
  const out: string[] = [];
  for (const d of now) {
    if (d.num === undefined) continue;
    const before = prior[keyOf(d)];
    if (before === undefined) continue;
    const b = Number(before);
    if (!Number.isFinite(b)) continue;
    if (d.num > b) {
      out.push(
        `${d.file}:${d.line} — \`${d.name}\` was WIDENED ${before} → ${d.value} ` +
        `(×${(d.num / b).toPrecision(3)}). A widening changes what "the same place" means for EVERY consumer ` +
        'of this tolerance, and the change is invisible at the site that made it. It must be an explicit, ' +
        'argued change to the declared module — never a quiet edit to make a test or an artefact pass.',
      );
    }
  }
  return out;
}

// ─── Executed controls ───────────────────────────────────────────────────────

function writeTree(base: string, files: Record<string, string>): void {
  rmSync(base, { recursive: true, force: true });
  for (const [p, body] of Object.entries(files)) {
    const abs = join(base, p.split('/').join(sep));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
  }
}

function selfTest(): { ok: boolean; lines: string[] } {
  const base = join(tmpdir(), `pryzm-${GATE}-selftest`);
  const lines: string[] = [];
  let ok = true;
  const fail = (m: string): void => { ok = false; lines.push(`    ✗ BLIND COMPARATOR — ${m}`); };
  try {
    // ── planted: no kernel policy, one unqualified eps, one qualified one ────
    writeTree(join(base, 'planted'), {
      'packages/geometry-kernel/src/index.ts': 'export const NOT_A_POLICY = 1;\n',
      'packages/g/src/predicate.ts': [
        'const EPS = 0.05;',                      // E2 + E5 (unit-unqualified)
        'const COINCIDENT_TOL_M = 0.001;',        // E2 only — the name states its unit
        'const epsilons = [1, 2];',               // a COLLECTION is not a tolerance
        'const MAX_STEPS = 12;',                  // must NOT be counted
        'export const defaultJunctionBandM = 0.2;', // excluded by name, with reason
        'export function near(a: number, b: number) { return Math.abs(a - b) < EPS; }',
      ].join('\n'),
    });
    const planted = analyse(join(base, 'planted'), ['packages'], 'packages/geometry-kernel');
    const names = planted.production.map((d) => d.name).sort();
    lines.push(`negative control (planted tree): declarations = [${names.join(', ')}]`);
    if (!names.includes('EPS')) fail('E2 did not count a planted `const EPS = 0.05`.');
    if (!names.includes('COINCIDENT_TOL_M')) fail('E2 did not count a planted `const COINCIDENT_TOL_M = 0.001`.');
    if (names.includes('MAX_STEPS')) fail('E2 counted `MAX_STEPS` — the segment anchoring is broken.');
    if (names.includes('epsilons')) fail('E2 counted `const epsilons = [1, 2]` — a collection is not a tolerance.');
    if (names.includes('defaultJunctionBandM')) fail('the named domain-band exclusion did not apply.');
    const unq = planted.unqualified.map((d) => d.name);
    lines.push(`    E5 unit-unqualified = [${unq.join(', ')}]`);
    if (!unq.includes('EPS')) fail('E5 did not flag `EPS = 0.05` as unit-unqualified.');
    if (unq.includes('COINCIDENT_TOL_M')) fail('E5 flagged `COINCIDENT_TOL_M`, whose name states its unit.');
    lines.push(`    E1 on a kernel with no policy: ${planted.e1.ok ? 'GREEN' : 'RED'} — missing ${planted.e1.missing.length} role(s)`);
    if (planted.e1.ok) fail('E1 passed against a geometry-kernel that declares no tolerance policy.');

    // ── E4: the same declaration, widened by three orders of magnitude ──────
    writeTree(join(base, 'widened'), {
      'packages/geometry-kernel/src/index.ts': 'export const NOT_A_POLICY = 1;\n',
      'packages/g/src/predicate.ts': 'const EPS = 1e-6;\n',
    });
    const widened = analyse(join(base, 'widened'), ['packages'], 'packages/geometry-kernel');
    const w = widenings({ 'packages/g/src/predicate.ts:EPS': '1e-9' }, widened.production);
    lines.push(`    E4 on a 1e-9 → 1e-6 widening: ${w.length} finding(s)`);
    for (const x of w) lines.push(`      ✓ ${x.split('. A widening')[0]}`);
    if (w.length !== 1) fail('E4 did not report a tolerance widened by three orders of magnitude.');
    else if (!/1e-9/.test(w[0]!) || !/1e-6/.test(w[0]!)) fail('E4 fired but did not NAME the old and new values.');
    const notWidened = widenings({ 'packages/g/src/predicate.ts:EPS': '1e-3' }, widened.production);
    if (notWidened.length !== 0) fail('E4 reported a SHRINK (1e-3 → 1e-6) as a widening.');

    // ── positive: a kernel that DOES declare the policy must read E1 green ──
    writeTree(join(base, 'policy'), {
      'packages/geometry-kernel/src/tolerance.ts': [
        'export const EPSILON_ZERO = 1e-12;',
        'export const COINCIDENT_M = 0.001;',
        'export const PARALLEL_RAD = 1e-4;',
      ].join('\n'),
      'packages/geometry-kernel/src/index.ts': "export * from './tolerance.js';\n",
    });
    const policy = analyse(join(base, 'policy'), ['packages'], 'packages/geometry-kernel');
    lines.push(`positive control (kernel declaring all three roles): E1 ${policy.e1.ok ? 'GREEN ✓' : 'RED ✗'}`);
    if (!policy.e1.ok) fail(`E1 is STUCK RED — it failed a kernel that declares all three roles (missing: ${policy.e1.missing.join('; ')}).`);
    if (policy.production.length !== 0) fail('declarations inside the declared module were counted against E2.');
  } catch (e) {
    ok = false; lines.push(`    ✗ self-test threw: ${(e as Error).message}`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  return { ok, lines };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const control = selfTest();
console.log(`\n[${GATE}] executed controls (gates doc §2.2 — an arm never watched failing is UNPROVEN):`);
for (const l of control.lines) console.log('   ' + l);

const a = analyse(ROOT, DIRS, KERNEL);

const RECIPE =
  'const|let|readonly|static <NAME> = <value>, NAME carrying EPS|EPSILON|TOL|TOLERANCE as a name ' +
  'segment (start, after _, or camelCase word); comments stripped; dirs packages,apps,plugins; ' +
  'tests and the declared module excluded; domain bands excluded by name.';

if (WRITE) {
  const next: Baseline = {
    recipe: RECIPE,
    measuredAt: new Date().toISOString().slice(0, 10),
    declarations: Object.fromEntries(a.production.map((d) => [keyOf(d), d.value])),
    unqualified: a.unqualified.map(keyOf).sort(),
    e1: a.e1.ok ? 0 : 1,
  };
  writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n', 'utf8');
  console.log(`\n[${GATE}] wrote ${relPath(ROOT, BASELINE)} — ${Object.keys(next.declarations).length} declaration(s), ${next.unqualified.length} unit-unqualified. SHRINK-ONLY: a reviewer must see this diff go DOWN.`);
}

const prior: Baseline = existsSync(BASELINE)
  ? (JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline)
  : { recipe: RECIPE, measuredAt: 'never', declarations: {}, unqualified: [], e1: 1 };

const measuredDecl = new Set(a.production.map(keyOf));
const measuredUnq = new Set(a.unqualified.map(keyOf));
const priorDecl = new Set(Object.keys(prior.declarations));
const priorUnq = new Set(prior.unqualified);

const staleDecl = [...priorDecl].filter((k) => !measuredDecl.has(k));
const staleUnq = [...priorUnq].filter((k) => !measuredUnq.has(k));
const newDecl = [...measuredDecl].filter((k) => !priorDecl.has(k));
const newUnq = [...measuredUnq].filter((k) => !priorUnq.has(k));
const widened = widenings(prior.declarations, a.production);

// Histogram — printed so §0.1's table can be re-derived rather than trusted.
const hist = new Map<string, number>();
for (const d of a.production) if (d.num !== undefined) hist.set(d.value, (hist.get(d.value) ?? 0) + 1);
const histSorted = [...hist.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));

const byFile = new Map<string, number>();
for (const d of a.production) byFile.set(d.file, (byFile.get(d.file) ?? 0) + 1);

const lines: string[] = [];
lines.push(`RECIPE: ${RECIPE}`);
lines.push(`RE-RUN: npx tsx tools/ga-gate/${GATE}.ts   ·   REBASELINE (downward only): --write-baseline`);
lines.push(`baseline: ${relPath(ROOT, BASELINE)} (measured ${prior.measuredAt})`);
lines.push('');
lines.push(`files scanned: ${a.filesScanned} · declarations total: ${a.decls.length} · in tests: ${a.decls.filter((d) => d.isTest).length} · E2 subject (production, outside the declared module): ${a.production.length}`);
lines.push(`  distinct files holding one: ${byFile.size} · distinct numeric values: ${hist.size}`);
lines.push(`  value histogram (count ≥ 2): ${histSorted.filter(([, c]) => c >= 2).map(([v, c]) => `${v}×${c}`).join(', ')}`);
lines.push(`  ⚠ C73 §0.1 states 267 for a recipe it does not fully specify; this recipe reads ${a.production.length} production / ${a.decls.length} including tests. See the header.`);
lines.push('');
lines.push(`E1  declared tolerance module in ${KERNEL}: ${a.e1.ok ? 'PRESENT ✓' : 'ABSENT ✗'}`);
for (const m of a.e1.missing) lines.push(`      missing role — ${m}`);
for (const f of a.e1.found) lines.push(`      present role — ${f}`);
lines.push(`E2  ${measuredDecl.size} declaration(s) outside the module, counted as (file × NAME), from ${a.production.length} site(s) (baseline ${priorDecl.size}) · new since baseline: ${newDecl.length} · struck: ${staleDecl.length}`);
for (const k of newDecl.slice(0, 40)) lines.push(`      + ${k} = ${a.production.find((d) => keyOf(d) === k)?.value}`);
if (newDecl.length > 40) lines.push(`      … and ${newDecl.length - 40} more`);
lines.push(`E3  NOT EVALUATED — E1 is ${a.e1.ok ? 'green, wire E3' : 'RED: there is no declared tolerance to import'}. An arm that passes because its subject does not exist is not coverage.`);
lines.push(`E4  ${widened.length} widening(s) against the baseline's per-declaration values.`);
for (const w of widened) lines.push(`      ✗ ${w}`);
lines.push(`E5  ${measuredUnq.size} unit-unqualified name(s), counted as (file × NAME), from ${a.unqualified.length} site(s) (baseline ${priorUnq.size}) · new: ${newUnq.length} · struck: ${staleUnq.length}`);
for (const k of newUnq.slice(0, 40)) lines.push(`      + ${k}`);
lines.push('');
lines.push(`EXIT CONDITION — E1 goes green when ${KERNEL} exports the three named roles; the gate goes green when E2 and E5 reach 0 and the module is the only place a tolerance is declared.`);

const floors: Floor[] = [
  { what: 'source files scanned', measured: a.filesScanned, min: 500 },
  { what: 'tolerance declarations found', measured: a.decls.length, min: 1 },
  { what: 'executed controls passed (0 = blind comparator)', measured: control.ok ? 1 : 0, min: 1 },
];

// One arm's findings must never be cancellable by another's, so each is counted
// and the ledger declares each separately.
// COUNTING UNIT = (file × NAME), matching the ledger's keys exactly.
//
// Not raw declaration sites: `EPS` declared twice in one file (a local shadow
// inside two functions) is ONE private definition of "the same place", and
// counting sites while ledgering keys makes findings and declared disagree by a
// constant — a gate permanently at exit 3 for arithmetic reasons, which teaches
// people to ignore it. The measured gap at baseline was 279 sites / 271 keys.
const findings = (a.e1.ok ? 0 : 1) + measuredDecl.size + measuredUnq.size + widened.length;
const declared = prior.e1 + priorDecl.size + priorUnq.size;

const result: GateResult = {
  gate: GATE,
  floors,
  lines,
  findings,
  declared,
  findingNames: [
    ...(a.e1.ok ? [] : ['E1::geometry-kernel declares no tolerance policy']),
    ...[...measuredDecl].map((k) => `E2::${k}`),
    ...[...measuredUnq].map((k) => `E5::${k}`),
    ...widened.map((w) => `E4::${w.split(' — ')[0]}`),
  ],
  // Struck entries must LEAVE the ledger in the commit that pays them, or the
  // next regression hides inside them.
  stale: [...staleDecl.map((k) => `E2::${k}`), ...staleUnq.map((k) => `E5::${k}`)],
};

process.exit(reportGate(result));
