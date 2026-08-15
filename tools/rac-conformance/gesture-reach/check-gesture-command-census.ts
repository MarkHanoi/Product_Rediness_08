// ─── CE-05 · THE GESTURE→COMMAND CENSUS (the harness no longer starts one link late)
//
// WHY THIS FILE EXISTS
// ────────────────────────────────────────────────────────────────────────────
// Command→graph reachability is instrumented (c2e250bb, certification/H5). It
// proves a command, once CONSTRUCTED, reaches the semantic graph. It proves
// nothing about whether any user gesture constructs it. Its own header says so:
//
//     "GESTURE reachability — the probe constructs the command; it proves NO user
//      gesture, tool, verb or panel reaches it. L-847 lives in this gap and this
//      instrument does NOT close it. CE-05 is therefore NARROWED, not closed."
//
// H6 (`__tests__/gesturereach.probe.ts` + `build-census.ts`) then closed the
// TOOLBAR half: 280 declared verb pairs across 30 `ui/toolbar/*` surfaces. That
// is one gesture family. The roadmap's notMeasured block names the rest:
//
//     "~120 `apps/editor/src/ui` files call `executeCommand`; inventoried nowhere."
//
// THIS FILE IS THAT INVENTORY. The census is cheap; the driving is not. This is
// deliberately the CENSUS ONLY — see §WHAT-THIS-DOES-NOT-PROVE.
//
// ── §VOCABULARY — SHARED, NOT RIVAL ──────────────────────────────────────────
// The verdict union is H6's, verbatim, so the two halves of CE-05 can be read
// side by side and summed:
//
//   EXECUTED-REACHED  a gesture was DRIVEN and the command was observed dispatched.
//                     ⭐ THIS INSTRUMENT CAN NEVER PRODUCE IT. It reads source. The
//                     count is asserted to be 0 every run, and that 0 is the
//                     measurement of how much of CE-05 remains open.
//   RESOLVED-ONLY     the call site's command id is STATICALLY DETERMINED and the
//                     file has ≥1 production importer. Reachability is PLAUSIBLE,
//                     never proven — nothing was executed.
//   NOT-REACHED       command id determined, but the file has ZERO production
//                     importers, static or dynamic. THE L-847 CLASS, live.
//   UNPROVEN          the command id cannot be determined from source. Recorded
//                     WITH ITS REASON and its expression. Never dropped, never
//                     silently counted as covered.
//
// FINDINGS = NOT-REACHED + UNPROVEN, against `gesture-census-ledger.json`,
// SHRINK-ONLY. RESOLVED-ONLY is not a finding and is not a pass either — it is
// the denominator's largest slice and it is exactly what a driving lane must
// convert to EXECUTED-REACHED.
//
// ── §RULE-1 — the six forbidden pass-reasons, answered one at a time ─────────
// (BIM30-IMPLEMENTATION-ROADMAP §7.1. Every one is a recorded incident here.)
//   1. a directory exists ....... no directory is an input to any verdict.
//   2. a file exists ............ a file's EXISTENCE is never a pass; a file with
//                                 zero importers is a FINDING (NOT-REACHED).
//   3. a grep found a string .... ⭐ the sharpest risk for a source-reading census,
//                                 and it is answered structurally, not by promise:
//                                 comments and type declarations are STRIPPED and
//                                 COUNTED as exclusions before any site is
//                                 admitted, and CONTROL C1 plants a commented-out
//                                 call and a `type:`-signature and fails the run
//                                 if either is admitted as a gesture. A raw grep
//                                 for `executeCommand` over ui/ returns 197 files;
//                                 this gate's denominator is smaller ON PURPOSE
//                                 and the difference is itemised, not discarded.
//   4. a mock returned success .. nothing is mocked; nothing is executed at all.
//   5. a UI displayed success ... no UI is involved.
//   6. a test never exercised the real path .. this gate makes NO execution claim.
//      Its whole verdict is "statically determined / not determined", and the
//      EXECUTED-REACHED counter is pinned at 0 so the gap cannot be misread.
//
// ── §RULE-2 — the denominator travels with every count ───────────────────────
// "A comparator reporting '0 divergences' MUST also report how many objects it
// compared. Zero over a subject of zero is the empty-seed lie, and it exits 2."
// Every printed count in this gate is `n / DENOMINATOR`. Three floors guard the
// subject (files scanned, call sites admitted, importer edges resolved); any
// unmet floor short-circuits to MISCONFIGURED (2) via the shared contract.
//
// ── §RESIDENCY — declared, with its reason (§7.4 / §2.1c) ───────────────────
// The boundary question is "does this gate need something that does not exist
// until something runs?" For THIS gate the answer is NO — it reads source only.
//   ⇒ RUNNER: `tools/ga-gate/run-all.ts`.  ⭐ Residency is about the RUNNER.
// The DIRECTORY is `tools/rac-conformance/gesture-reach/` and that is deliberate
// and stated rather than excused (§2.1c): it reads the H6 artefacts in
// `./results/` and shares H6's verdict union, so splitting the CE-05 family
// across two trees would cost more than the directory mismatch. run-all.ts
// already registers gates by PATH outside its own directory (see its
// `../rac-conformance/certification/gates/check-propagation-reaches.ts` entry
// and the note that "the PATH is what is registered, not a copy").
//   ⚠ HANDOFF, per §2.1d — until it is registered, this file sits outside BOTH
//   unregistered-gate detectors: run-all.ts's sweep reads its own GATE_DIR plus
//   the parsed certify.ts list, and neither covers `gesture-reach/`. That is the
//   exact hole §2.1d closed for `certification/gates/`. It is NOT self-registered
//   here because a concurrent lane owns run-all.ts this session.
//   The FUTURE driving gate — which must run gestures — answers the boundary
//   question YES and belongs in `certification/gates/` under `certify.ts`.
//
// ── §CONTROLS — in-run, and the failure text is recorded (§7.5 / §2.2) ───────
// "A comparator that has never failed has not been shown to be able to." All
// four controls run BEFORE the census. If any disagrees the run is
// `blind-comparator` → exit 2, and every verdict it produced is INVALIDATED,
// not downgraded.
//
//   C1 EXTRACTOR CONTROL (positive + negative in one fixture). A synthetic source
//      with four `executeCommand` occurrences: one real literal call, one inside a
//      `//` comment, one inside a `/* */` block, one `type:`-annotated interface
//      signature. MUST admit exactly 1 site and itemise 3 exclusions.
//      ⭐ WATCHED TO FAIL, VERBATIM. Defect planted: `stripComments` made to return
//      `src` unchanged. Observed:
//        ✗ CONTROL C1 (extractor) — admitted 3 sites over a fixture declaring 1;
//          excluded comment=0 typeDecl=1. A commented-out call or a type signature
//          was counted as a gesture: RULE 1 reason 3 live.
//        → [2] blind-comparator — a control disagreed. EVERY verdict this run is
//          INVALIDATED, not downgraded (§7.5). Nothing was written.
//
//   C2 POSITIVE CONTROL. Literal command id + a click binding + 2 importers.
//      MUST be called clean → RESOLVED-ONLY. Proves the gate is not stuck red and
//      stops an over-eager matcher from being "safe" by failing everything.
//
//   C3 NEGATIVE CONTROL — THE PLANTED UNREACHABLE GESTURE (the L-847 shape).
//      Literal command id, a real click binding, ZERO importers static or dynamic.
//      MUST be called dirty → NOT-REACHED.
//      ⭐ WATCHED TO FAIL, VERBATIM. Defect planted: the importer arm's
//      `importers.length === 0` weakened to `< 0`, i.e. no file is ever unreachable.
//      Observed:
//        ✗ CONTROL C3 (planted unreachable gesture) — expected NOT-REACHED,
//          classifier said RESOLVED-ONLY for fixture/planted/DeadWorkbench.ts
//          ('wall.create', importers=0). The comparator cannot see the defect
//          class it exists to catch — L-847 would ship again.
//        → [2] blind-comparator — a control disagreed. EVERY verdict this run is
//          INVALIDATED, not downgraded (§7.5). Nothing was written.
//
//   C4 NEGATIVE CONTROL — the planted UNDETERMINED site. First argument is
//      `cmd.type`. MUST be called dirty → UNPROVEN, never silently RESOLVED-ONLY.
//      ⭐ WATCHED TO FAIL, VERBATIM. Defect planted: `literalOf` made to fall back
//      to returning the raw expression instead of null — the "greedy resolver"
//      shape, where a census reports coverage it does not have. Observed:
//        ✗ CONTROL C4 (planted undetermined site) — expected UNPROVEN, classifier
//          said RESOLVED-ONLY and invented command id "cmd.type". An undetermined
//          gesture counted as covered is the census lying in the safe direction.
//        → [2] blind-comparator — a control disagreed. EVERY verdict this run is
//          INVALIDATED, not downgraded (§7.5). Nothing was written.
//
// ⭐ A FOURTH DEFECT WAS FOUND BY THE GATE'S OWN FIRST RUN, not by review, and it
// is recorded because it is the RULE-2 failure mode in miniature: findings were
// counted in SITES (87) while the ledger declared distinct KEYS (80), so the
// ratchet compared two different units and fired spuriously on the very run that
// seeded it. Both units are now printed on every run. See §THE KEY, below.
//
// ── §WHAT-THIS-DOES-NOT-PROVE — never cite this file for any of these ────────
//   • that ANY gesture reaches ANY command at runtime. Nothing is executed.
//     EXECUTED-REACHED is 0 by construction. Driving is a separate lane.
//   • that a RESOLVED-ONLY site's verb has a HANDLER — `build-census.ts` owns
//     backing; a resolved dispatch into an UNBACKED verb is still a dead button.
//   • that the importer chain reaches the composition root. This measures ≥1
//     production importer, not transitive reachability from `main.ts`.
//   • CustomEvent gesture paths. Several `ui/*Panel.ts` files carry
//     `TODO(E.*.S): migrate CustomEvent → runtime.bus.executeCommand(...)`; they
//     are gestures that reach commands by another route and are OUTSIDE this
//     denominator. Counted and reported separately, never folded into findings.
//   • keyboard/palette/context-menu routes that dispatch by other means.
//   • gesture surfaces outside `apps/editor/src/ui`.
//
// Run: npx tsx tools/rac-conformance/gesture-reach/check-gesture-command-census.ts

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import {
  EXIT_MISCONFIGURED, reportGate, type ExitCode, type GateResult,
} from '../certification/contract.js';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..', '..', '..');
const UI_DIR = path.join(ROOT, 'apps', 'editor', 'src', 'ui');
const LEDGER = path.join(HERE, 'gesture-census-ledger.json');
const OUT = path.join(HERE, 'results', 'gesture-census.json');

const GATE = 'gesture-command-census (CE-05)';

// Floors — a verdict over an empty subject is not a verdict (RULE 2).
const FLOOR_FILES = 40;
const FLOOR_SITES = 60;
const FLOOR_IMPORT_EDGES = 500;

export type Verdict = 'EXECUTED-REACHED' | 'RESOLVED-ONLY' | 'NOT-REACHED' | 'UNPROVEN';
export type Exclusion = 'comment' | 'type-declaration' | 'test-file';

export interface RawSite {
  /** repo-relative, forward slashes */
  file: string;
  line: number;
  /** the text before `.executeCommand`, or '' for a bare call */
  receiver: string;
  /** the first argument, verbatim, comments already stripped */
  firstArg: string;
}

export interface FileFacts {
  /** production importers, static `from '…'` + dynamic `import('…')`, excluding tests and self */
  importers: string[];
  /** the file binds at least one DOM gesture */
  gestureBinding: boolean;
}

export interface CensusRow extends RawSite {
  commandId: string | null;
  verdict: Verdict;
  reason: string | null;
  importers: number;
  gestureBinding: boolean;
  /** stable across line drift — this is what the ledger keys on */
  key: string;
}

// ─── comment stripping — line numbers preserved, string/template state tracked ─
// RULE 1 reason 3 is answered HERE. A raw regex over source counts commented-out
// and documented calls as gestures; CONTROL C1 fails the run if this pass is lost.
export function stripComments(src: string): { stripped: string; commentSpans: number } {
  let out = '';
  let spans = 0;
  let i = 0;
  const n = src.length;
  type S = 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tpl';
  let s: S = 'code';
  while (i < n) {
    const c = src[i]!;
    const d = src[i + 1];
    if (s === 'code') {
      if (c === '/' && d === '/') { s = 'line'; spans++; out += '  '; i += 2; continue; }
      if (c === '/' && d === '*') { s = 'block'; spans++; out += '  '; i += 2; continue; }
      if (c === "'") { s = 'sq'; out += c; i++; continue; }
      if (c === '"') { s = 'dq'; out += c; i++; continue; }
      if (c === '`') { s = 'tpl'; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (s === 'line') {
      if (c === '\n') { s = 'code'; out += '\n'; i++; continue; }
      out += ' '; i++; continue;
    }
    if (s === 'block') {
      if (c === '*' && d === '/') { s = 'code'; out += '  '; i += 2; continue; }
      out += c === '\n' ? '\n' : ' '; i++; continue;
    }
    // inside a string/template: copy through, honour backslash escapes
    if (c === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
    if ((s === 'sq' && c === "'") || (s === 'dq' && c === '"') || (s === 'tpl' && c === '`')) {
      s = 'code'; out += c; i++; continue;
    }
    out += c; i++;
  }
  return { stripped: out, commentSpans: spans };
}

const CALL_RE = /(?:([\w$.?![\])'"]+)\s*\.\s*)?\bexecuteCommand\s*\(/g;

/** Balanced scan from the char after `(` to the top-level `,` or the closing `)`. */
function firstArgument(src: string, openParen: number): string {
  let depth = 0;
  let i = openParen;
  let quote: string | null = null;
  const start = openParen + 1;
  for (; i < src.length; i++) {
    const c = src[i]!;
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth++; continue; }
    if (c === ')' || c === ']' || c === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i).trim();
      continue;
    }
    if (c === ',' && depth === 1) return src.slice(start, i).trim();
  }
  return src.slice(start).trim();
}

/**
 * Extract admitted call sites from ONE file's source, itemising every exclusion.
 * Nothing is dropped silently: an excluded occurrence is COUNTED by its reason.
 */
export function extractSites(file: string, src: string): {
  sites: RawSite[]; excluded: Record<Exclusion, number>; occurrences: number;
} {
  const excluded: Record<Exclusion, number> = { comment: 0, 'type-declaration': 0, 'test-file': 0 };
  const rawOccurrences = (src.match(/\bexecuteCommand\s*\(/g) ?? []).length;
  const { stripped } = stripComments(src);
  const sites: RawSite[] = [];
  CALL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CALL_RE.exec(stripped)) !== null) {
    const openParen = CALL_RE.lastIndex - 1;
    const firstArg = firstArgument(stripped, openParen);
    // `executeCommand(type: string, payload: unknown)` is an interface/type
    // signature, not a dispatch. Admitting it is RULE 1 reason 3.
    if (/^[\w$]+\s*\??\s*:/.test(firstArg)) { excluded['type-declaration'] += 1; continue; }
    const line = stripped.slice(0, m.index).split('\n').length;
    sites.push({ file, line, receiver: (m[1] ?? '').trim(), firstArg });
  }
  // whatever the raw text had and the admitted set does not, minus the type
  // signatures we named, was inside a comment.
  excluded.comment = Math.max(0, rawOccurrences - sites.length - excluded['type-declaration']);
  return { sites, excluded, occurrences: rawOccurrences };
}

/** A quoted literal or a `${}`-free template is a determined command id. */
export function literalOf(firstArg: string): string | null {
  const m = /^(['"`])([^'"`$\\]*)\1$/.exec(firstArg);
  if (!m) return null;
  const v = m[2]!;
  return v.length > 0 ? v : null;
}

// ─── THE COMPARATOR — pure, so the controls can drive it directly ────────────
export function classifySite(site: RawSite, facts: FileFacts): {
  commandId: string | null; verdict: Verdict; reason: string | null;
} {
  const id = literalOf(site.firstArg);
  if (id === null) {
    const expr = site.firstArg.replace(/\s+/g, ' ').slice(0, 60);
    const reason = site.firstArg.startsWith('...')
      ? `spread-first-argument: ${expr}`
      : site.firstArg === ''
        ? 'empty-or-unparsed-first-argument'
        : /^[`'"]/.test(site.firstArg)
          ? `interpolated-template-first-argument: ${expr}`
          : `non-literal-first-argument: ${expr}`;
    return { commandId: null, verdict: 'UNPROVEN', reason };
  }
  if (facts.importers.length === 0) {
    return {
      commandId: id,
      verdict: 'NOT-REACHED',
      reason: `zero production importers (static or dynamic) — dispatches '${id}' from a surface `
        + `nothing mounts${facts.gestureBinding ? ', and it BINDS A GESTURE' : ''}. The L-847 class.`,
    };
  }
  return { commandId: id, verdict: 'RESOLVED-ONLY', reason: null };
}

// ─── filesystem ──────────────────────────────────────────────────────────────
const SKIP_DIR = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '__mocks__', '.next']);
const isTestPath = (p: string): boolean =>
  /(^|\/)__tests__(\/|$)/.test(p) || /\.(spec|test)\.tsx?$/.test(p) || /(^|\/)tests?(\/)/.test(p);

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    if (SKIP_DIR.has(e)) continue;
    const abs = path.join(dir, e);
    let st; try { st = statSync(abs); } catch { continue; }
    if (st.isDirectory()) yield* walk(abs);
    else if (/\.tsx?$/.test(e) && !/\.d\.ts$/.test(e)) yield abs;
  }
}

const rel = (abs: string): string => path.relative(ROOT, abs).replace(/\\/g, '/');

/** Resolve a relative specifier the way the bundler does, to a real file. */
function resolveSpecifier(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec.replace(/\.jsx?$/, ''));
  for (const cand of [`${base}.ts`, `${base}.tsx`, base, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    try { if (statSync(cand).isFile()) return cand; } catch { /* next */ }
  }
  return null;
}

const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
const GESTURE_RE = new RegExp(
  String.raw`addEventListener\s*\(\s*['"\`](?:click|dblclick|change|input|submit|keydown|keyup|keypress|pointerdown|pointerup|mousedown|mouseup|contextmenu|drop|wheel)['"\`]`
  + String.raw`|\bonclick\s*=|\bon(?:Click|Change|Input|Submit|KeyDown|PointerDown|MouseDown)\s*=`,
  'i',
);

// ─── CONTROLS — in-run. A failure INVALIDATES the run (§7.5). ────────────────
const C1_FIXTURE = [
  `interface Bus { executeCommand(type: string, payload: unknown): Promise<unknown>; }`,
  `// legacy: bus.executeCommand('wall.deleteOld', {});`,
  `/* migrate to runtime.bus.executeCommand('room.legacy', {}); */`,
  `btn.addEventListener('click', () => { void bus.executeCommand('wall.create', { id: 'w1' }); });`,
].join('\n');

function runControls(lines: string[]): string | null {
  // C1 — the extractor must admit 1 of 4 occurrences and itemise the other 3.
  const c1 = extractSites('fixture/C1.ts', C1_FIXTURE);
  if (c1.sites.length !== 1 || c1.excluded['type-declaration'] !== 1 || c1.excluded.comment !== 2) {
    return `✗ CONTROL C1 (extractor) — admitted ${c1.sites.length} sites over a fixture declaring 1; `
      + `excluded comment=${c1.excluded.comment} typeDecl=${c1.excluded['type-declaration']}. `
      + `A commented-out call or a type signature was counted as a gesture: RULE 1 reason 3 live.`;
  }
  if (literalOf(c1.sites[0]!.firstArg) !== 'wall.create') {
    return `✗ CONTROL C1 (extractor) — admitted the site but read its command id as `
      + `${JSON.stringify(literalOf(c1.sites[0]!.firstArg))}, not 'wall.create'.`;
  }
  lines.push(`✓ C1 extractor      — 4 occurrences → 1 admitted, 2 comment, 1 type-decl; id='wall.create'`);

  // C2 — POSITIVE CONTROL: must be called clean.
  const c2 = classifySite(
    { file: 'fixture/C2.ts', line: 1, receiver: 'bus', firstArg: `'wall.create'` },
    { importers: ['apps/editor/src/ui/A.ts', 'apps/editor/src/ui/B.ts'], gestureBinding: true },
  );
  if (c2.verdict !== 'RESOLVED-ONLY' || c2.commandId !== 'wall.create') {
    return `✗ CONTROL C2 (positive) — a literal dispatch from a 2-importer surface was called `
      + `${c2.verdict} (id=${String(c2.commandId)}); the gate is stuck red and every finding is suspect.`;
  }
  lines.push(`✓ C2 positive       — literal + 2 importers → RESOLVED-ONLY (gate is not stuck red)`);

  // C3 — NEGATIVE CONTROL: the planted unreachable gesture, the L-847 shape.
  const c3 = classifySite(
    { file: 'fixture/planted/DeadWorkbench.ts', line: 42, receiver: 'runtime.bus', firstArg: `'wall.create'` },
    { importers: [], gestureBinding: true },
  );
  if (c3.verdict !== 'NOT-REACHED') {
    return `✗ CONTROL C3 (planted unreachable gesture) — expected NOT-REACHED, classifier said `
      + `${c3.verdict} for fixture/planted/DeadWorkbench.ts ('wall.create', importers=0). `
      + `The comparator cannot see the defect class it exists to catch — L-847 would ship again.`;
  }
  lines.push(`✓ C3 negative       — planted 0-importer gesture → NOT-REACHED (L-847 shape caught)`);

  // C4 — NEGATIVE CONTROL: the planted undetermined site.
  const c4 = classifySite(
    { file: 'fixture/C4.ts', line: 7, receiver: 'bus', firstArg: `cmd.type` },
    { importers: ['apps/editor/src/ui/A.ts'], gestureBinding: true },
  );
  if (c4.verdict !== 'UNPROVEN' || c4.commandId !== null) {
    return `✗ CONTROL C4 (planted undetermined site) — expected UNPROVEN, classifier said `
      + `${c4.verdict} and invented command id ${JSON.stringify(c4.commandId)}. `
      + `An undetermined gesture counted as covered is the census lying in the safe direction.`;
  }
  lines.push(`✓ C4 negative       — planted dynamic first-arg → UNPROVEN (not silently covered)`);
  return null;
}

// ─── the run ─────────────────────────────────────────────────────────────────
interface Ledger {
  gate: string; policy: string;
  declared: { notReached: number; unproven: number; total: number };
  entries: { 'NOT-REACHED': string[]; UNPROVEN: string[] };
}

function main(): void {
  const lines: string[] = [];

  const blind = runControls(lines);
  if (blind !== null) {
    console.log(`\n── ${GATE} ${'─'.repeat(Math.max(0, 60 - GATE.length))}`);
    lines.forEach((l) => console.log('   ' + l));
    console.log('   ' + blind);
    console.log(`   → [${EXIT_MISCONFIGURED}] blind-comparator — a control disagreed. `
      + `EVERY verdict this run is INVALIDATED, not downgraded (§7.5). Nothing was written.`);
    process.exit(EXIT_MISCONFIGURED);
  }
  lines.push('');

  if (!existsSync(UI_DIR)) {
    console.log(`   → [${EXIT_MISCONFIGURED}] MISCONFIGURED — ${rel(UI_DIR)} does not exist.`);
    process.exit(EXIT_MISCONFIGURED);
  }

  // ── 1. the importer graph, over the whole client ──────────────────────────
  const importedBy = new Map<string, string[]>();
  let importEdges = 0;
  let filesWalked = 0;
  for (const root of ['apps', 'src', 'plugins', 'packages'].map((r) => path.join(ROOT, r))) {
    for (const abs of walk(root)) {
      filesWalked += 1;
      const relPath = rel(abs);
      if (isTestPath(relPath)) continue;
      let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      const { stripped } = stripComments(src);
      IMPORT_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = IMPORT_RE.exec(stripped)) !== null) {
        const target = resolveSpecifier(abs, m[1]!);
        if (target === null || target === abs) continue;
        importEdges += 1;
        const t = rel(target);
        const list = importedBy.get(t) ?? [];
        if (!list.includes(relPath)) list.push(relPath);
        importedBy.set(t, list);
      }
    }
  }

  // ── 2. the census over apps/editor/src/ui ─────────────────────────────────
  const rows: CensusRow[] = [];
  const excludedTotals: Record<Exclusion, number> = { comment: 0, 'type-declaration': 0, 'test-file': 0 };
  let uiFilesScanned = 0;
  let filesWithSites = 0;
  let filesTouchingExecuteCommand = 0;
  let customEventGestureFiles = 0;
  let gestureFilesNoDispatch = 0;

  for (const abs of walk(UI_DIR)) {
    const relPath = rel(abs);
    let src: string; try { src = readFileSync(abs, 'utf8'); } catch { continue; }
    const touches = /\bexecuteCommand\s*\(/.test(src);
    if (isTestPath(relPath)) { if (touches) excludedTotals['test-file'] += 1; continue; }
    uiFilesScanned += 1;
    const gestureBinding = GESTURE_RE.test(src);
    if (!touches) {
      if (gestureBinding) {
        gestureFilesNoDispatch += 1;
        if (/dispatchEvent\s*\(\s*new\s+CustomEvent|new\s+CustomEvent/.test(src)) customEventGestureFiles += 1;
      }
      continue;
    }
    filesTouchingExecuteCommand += 1;
    const { sites, excluded } = extractSites(relPath, src);
    excludedTotals.comment += excluded.comment;
    excludedTotals['type-declaration'] += excluded['type-declaration'];
    if (sites.length === 0) continue;
    filesWithSites += 1;
    const facts: FileFacts = { importers: importedBy.get(relPath) ?? [], gestureBinding };
    for (const s of sites) {
      const c = classifySite(s, facts);
      rows.push({
        ...s, ...c,
        importers: facts.importers.length,
        gestureBinding,
        // ⭐ THE KEY MUST BE COMMENSURABLE WITH THE LEDGER. The first cut of this
        // gate keyed NOT-REACHED by FILE but counted findings by SITE, so it
        // reported "87 findings against a declared level of 75" on the very run
        // that seeded the ledger — a ratchet comparing two different units, which
        // cannot ratchet. Findings are now DISTINCT KEYS, and both numbers are
        // printed with their denominators so the two can never silently diverge.
        // Stable across line drift on purpose: line numbers churn, ids do not.
        key: c.verdict === 'NOT-REACHED'
          ? `${s.file}::${c.commandId}`
          : `${s.file}::${(c.reason ?? '').replace(/^[a-z-]+(-first-argument)?: /, '').slice(0, 48)}`,
      });
    }
  }

  const DEN = rows.length;
  const n = (v: Verdict): number => rows.filter((r) => r.verdict === v).length;
  const executed = n('EXECUTED-REACHED');
  const resolved = n('RESOLVED-ONLY');
  const notReached = n('NOT-REACHED');
  const unproven = n('UNPROVEN');

  // ── 3. the ledger — shrink-only, keyed stably against line drift ──────────
  const measuredNotReached = [...new Set(rows.filter((r) => r.verdict === 'NOT-REACHED').map((r) => r.key))].sort();
  const measuredUnproven = [...new Set(rows.filter((r) => r.verdict === 'UNPROVEN').map((r) => r.key))].sort();

  let ledger: Ledger;
  if (existsSync(LEDGER)) {
    ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger;
  } else {
    ledger = {
      gate: GATE,
      policy: 'SHRINK-ONLY — this file may only ever go DOWN. Raising any number here is '
        + 'forbidden; fix the gesture, or prove the finding predates the gate and record it in '
        + 'tools/ga-gate/gate-newly-measured.json (roadmap §7.6, the third category).',
      declared: { notReached: measuredNotReached.length, unproven: measuredUnproven.length, total: 0 },
      entries: { 'NOT-REACHED': measuredNotReached, UNPROVEN: measuredUnproven },
    };
    ledger.declared.total = ledger.declared.notReached + ledger.declared.unproven;
    writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + '\n');
    lines.push(`⚠ SEEDED ${rel(LEDGER)} at the FIRST honest reading — `
      + `NOT-REACHED ${measuredNotReached.length} · UNPROVEN ${measuredUnproven.length}. Shrink-only from here.`);
  }

  const declaredAll = new Set([...ledger.entries['NOT-REACHED'], ...ledger.entries.UNPROVEN]);
  const measuredAll = new Set([...measuredNotReached, ...measuredUnproven]);
  const stale = [...declaredAll].filter((k) => !measuredAll.has(k)).sort();

  // ── 4. report — every count carries its denominator (RULE 2) ──────────────
  lines.push(`DENOMINATOR — ${DEN} admitted executeCommand call sites in ${filesWithSites} files, `
    + `over ${uiFilesScanned} non-test files under apps/editor/src/ui`);
  lines.push(`  excluded, itemised (never dropped): comment ${excludedTotals.comment} · `
    + `type-declaration ${excludedTotals['type-declaration']} · test files ${excludedTotals['test-file']}`
    + ` · files touching executeCommand ${filesTouchingExecuteCommand}`);
  lines.push(`  importer graph: ${importEdges} resolved edges over ${filesWalked} walked files`);
  lines.push('');
  const deadFiles = new Set(rows.filter((r) => r.verdict === 'NOT-REACHED').map((r) => r.file)).size;
  lines.push(`EXECUTED-REACHED  ${executed} / ${DEN} sites  ⭐ 0 BY CONSTRUCTION — this gate executes nothing.`);
  lines.push(`RESOLVED-ONLY     ${resolved} / ${DEN} sites  statically determined; NOT proven reachable.`);
  lines.push(`NOT-REACHED       ${notReached} / ${DEN} sites = ${measuredNotReached.length} distinct `
    + `(file×command) in ${deadFiles} file(s) — the L-847 class.`);
  lines.push(`UNPROVEN          ${unproven} / ${DEN} sites = ${measuredUnproven.length} distinct (file×expression).`);
  lines.push(`FINDINGS          ${measuredNotReached.length + measuredUnproven.length} distinct keys — `
    + `the unit the ledger declares. Sites and keys are BOTH printed so they cannot diverge unnoticed.`);
  lines.push('');
  for (const k of measuredNotReached.slice(0, 14)) {
    const r = rows.find((x) => x.key === k)!;
    lines.push(`  NOT-REACHED · ${r.file} — '${r.commandId}'${r.gestureBinding ? ' · BINDS A GESTURE' : ''}`);
  }
  if (measuredNotReached.length > 14) lines.push(`  … ${measuredNotReached.length - 14} more in ${path.basename(OUT)}`);
  const reasonTally = new Map<string, number>();
  for (const r of rows.filter((x) => x.verdict === 'UNPROVEN')) {
    const expr = (r.reason ?? '').replace(/^[a-z-]+(-first-argument)?: /, '');
    reasonTally.set(expr, (reasonTally.get(expr) ?? 0) + 1);
  }
  const topExpr = [...reasonTally].sort((a, b) => b[1] - a[1]);
  lines.push(`  UNPROVEN — the undetermined first arguments, most common first `
    + `(${topExpr.length} distinct expressions over ${unproven} sites):`);
  for (const [k, v] of topExpr.slice(0, 10)) lines.push(`    ${String(v).padStart(3)} × ${k}`);
  lines.push('');
  lines.push(`OUTSIDE this denominator, reported not folded: ${gestureFilesNoDispatch} ui files bind a `
    + `gesture and never call executeCommand (${customEventGestureFiles} of them dispatch a CustomEvent) — `
    + `a whole gesture family this census does not cover.`);

  writeFileSync(OUT, JSON.stringify({
    gate: GATE, generatedAt: new Date().toISOString(),
    denominator: {
      admittedCallSites: DEN, filesWithSites, uiFilesScanned, filesTouchingExecuteCommand,
      excluded: excludedTotals, importEdges, filesWalked,
    },
    totals: { executedReached: executed, resolvedOnly: resolved, notReached, unproven },
    outsideDenominator: { gestureFilesWithNoExecuteCommand: gestureFilesNoDispatch, ofWhichCustomEvent: customEventGestureFiles },
    notMeasured: [
      'ANY runtime reachability — nothing is executed; EXECUTED-REACHED is 0 by construction',
      'whether a RESOLVED-ONLY verb has a handler — build-census.ts owns BACKING',
      'transitive reachability from the composition root; this measures >=1 production importer',
      'CustomEvent / keyboard / palette / context-menu dispatch routes',
      'gesture surfaces outside apps/editor/src/ui',
    ],
    rows,
  }, null, 2) + '\n');
  lines.push(`written: ${rel(OUT)}`);

  const result: GateResult = {
    gate: GATE,
    floors: [
      { what: 'ui files scanned', measured: uiFilesScanned, min: FLOOR_FILES },
      { what: 'admitted call sites', measured: DEN, min: FLOOR_SITES },
      { what: 'resolved importer edges', measured: importEdges, min: FLOOR_IMPORT_EDGES },
    ],
    lines,
    // DISTINCT KEYS, not sites — the same unit the ledger declares. See §THE KEY
    // above: comparing a site count against a key ledger is a ratchet that cannot
    // ratchet, and it fired on this gate's own first two runs.
    findings: measuredNotReached.length + measuredUnproven.length,
    declared: ledger.declared.total,
    findingNames: [...measuredNotReached, ...measuredUnproven],
    stale,
  };
  process.exit(reportGate(result) as ExitCode);
}

const invokedDirectly = process.argv[1] !== undefined
  && path.resolve(process.argv[1]).replace(/\\/g, '/').endsWith('check-gesture-command-census.ts');
if (invokedDirectly) main();
