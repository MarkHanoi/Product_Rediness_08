// ─── GATE · check-no-silent-partial  (G-REASON-07) ───────────────────────────
//
// BIM30 R7/R9 of docs/03-execution/plans/BIM30-REASONING-LOOP-PLAN.md. R7 names
// this gate in one clause — *"Batch semantics declared (Atomic|Progressive) with
// G-REASON-07 no-silent-partial"* — and R9's exit condition is *"All seven
// G-REASON gates built, negative-tested, registered per the residency rule."*
// Before this file, G-REASON-07 existed ONLY as that name: no gate, no
// implementation, no ledger. It was the last of the seven, and its absence is
// what blocked R9.
//
// ═══ THE INVARIANT ══════════════════════════════════════════════════════════
//
// A batch / multi-element operation that PARTIALLY succeeds must report the
// partial outcome TRUTHFULLY — never as full success, and never as silence.
//
// Two contracts govern, and they say the same thing from two directions:
//
//   C67 §4 rule 6 (honesty invariants, merge-blocking):
//     "**'Done' only after a command reports success**; partials reported as
//      partial ('Changed N of M — K skipped: reason'), read off the command's
//      own payload and never re-narrated"
//
//   C78 §1.3 (the three legal answers) + §1.2b (the four MUST NOTs):
//     every per-element question answers DETERMINED-affected /
//     DETERMINED-unaffected / UNDETERMINED+reason, and
//     "NEVER return `[]`, `null`, `0` or `undefined` when the system cannot
//      determine the answer."
//
// A batch that skips an element and returns `{ success: true }` has answered
// DETERMINED-affected for an element it never touched. That is not a degraded
// success — under C78 §1.2b it is a false report, and under C67 §4.6 it is the
// exact "'Done' after something that was not done" defect the rule was written
// against.
//
// ═══ WHY A SOURCE-SHAPE GATE, STATED HONESTLY ═══════════════════════════════
//
// This gate reads SOURCE, not a running batch, and that is a deliberate and
// declared limitation rather than a convenience. The reason is the subject:
// a partial outcome is by definition the branch that only fires when one item
// of N fails, and driving all 35 measured batch commands into their own
// per-item failure mode requires 35 bespoke fixture worlds — each of which
// would itself be a stand-in for the real failure. What CAN be established
// mechanically, exactly and per-file is the shape of the reporting contract:
// a command that detects a skip and a command that reports one are two
// different sets, and their difference is computable from source with no
// simulation at all. Where a shape is genuinely ambiguous the gate says
// UNDETERMINED and counts it as a finding — it never guesses PASS.
//
// The honest boundary, stated so nobody reads more into a green than is there:
//   PROVEN here     — that a batch command which SKIPS items carries (or does
//                     not carry) a per-item outcome channel and a partial-aware
//                     success verdict, in its own source.
//   NOT PROVEN here — that the channel is populated CORRECTLY at runtime, or
//                     that the surface above (chat reply, report view) renders
//                     it. The chat half has its own proof already —
//                     ga-gate 31 check 6 ("ONE DISPATCH + HONEST REPORT") and
//                     ZeroTokenChatBridge's `classifyDispatch` — and this gate
//                     deliberately does NOT restate it.
//
// ═══ THE SUBJECT: what counts as a batch verb ═══════════════════════════════
//
// Established from source two independent ways and UNIONED, so a rename in one
// convention cannot empty the subject silently (C10: emptiness is never a pass):
//   (1) bus handlers whose `type` matches `<family>.batch.<verb>` in
//       plugins/*/src/handlers/
//   (2) CommandManager commands in packages/command-registry/src whose class
//       name ends `BatchCommand`
// Floor: the union must be ≥ 20 files. Below that the gate has not established
// its subject and exits 2.
//
// ═══ THREE ARMS ════════════════════════════════════════════════════════════
//
//  (a) SUCCESS-DESPITE-REFUSAL. The command has a skip/refusal branch AND
//      returns an UNCONDITIONAL `success: true`. This is the brief's arm (a):
//      it reports success while a sub-operation refused. Detected by pairing a
//      per-item skip site with a literal `success: true` that no measured
//      quantity gates.
//
//  (b) SWALLOWED PER-ITEM FAILURE. The command catches or detects a per-item
//      failure inside the item loop and neither counts it nor names it — the
//      failure reaches no channel the caller can read. A `console.warn` is NOT
//      a channel: the caller receives nothing it can branch on (the same
//      reading check-index-can-refuse's ledger makes of SlabDependencyTracker).
//
//  (c) NO PER-ITEM OUTCOME AT ALL. A batch verb that returns no per-item
//      outcome channel of any kind — no `info` summary, no skipped count, no
//      per-item result array — while its own body demonstrably can drop an
//      item. "N of M" is unanswerable from its return value.
//
//  Arms (a) and (b) and (c) are three readings of ONE question per file, and a
//  file produces ONE finding — never three. A file that is ATOMIC (any
//  per-item problem throws outward, so the batch is all-or-nothing) is CLEAN
//  under C78 §1.3: throwing is a truthful total refusal, and the bus does not
//  push a partial batch to the undo stack. Atomicity is a legal answer and the
//  gate must not punish it.
//
// ═══ NEGATIVE-TESTED (C74 §6.2) ════════════════════════════════════════════
// Every arm was driven by a PLANTED violation in a real file, the exact failure
// text recorded, and the plant reverted. See the report accompanying this
// gate's landing commit for the three texts.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type GateResult, type Floor } from '../contract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');
const LEDGER = resolve(__dirname, 'no-silent-partial-debt.json');

const floors: Floor[] = [];
const lines: string[] = [];
const findingNames: string[] = [];
const harnessErrors: string[] = [];

interface LedgerRow { readonly file: string; readonly arm: string; readonly why: string }
interface Ledger { readonly silentPartial: readonly LedgerRow[] }

/** Recursive .ts walk, skipping tests and node_modules. */
function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (e === 'node_modules' || e === '__tests__' || e === 'dist') continue;
      walk(p, out);
    } else if (e.endsWith('.ts') && !e.endsWith('.d.ts') && !e.includes('.test.') && !e.includes('.spec.')) {
      out.push(p);
    }
  }
  return out;
}

const rel = (p: string): string => p.slice(REPO.length + 1).split('\\').join('/');

/** Strip line and block comments — a rule must never match prose ABOUT the rule.
 *  CRLF is normalised FIRST: this repo is checked out on Windows, and every
 *  `$`-anchored rule below silently matched nothing until it was. The negative
 *  test for arm (a) is what found it — a planted violation that the detector
 *  did not see, which is exactly the failure a negative test exists to expose. */
function stripComments(src: string): string {
  return src.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/** Per-file verdict for the one question all three arms read. */
type Verdict = 'atomic' | 'honest' | 'silent-partial';

interface Reading {
  readonly file: string;
  readonly verdict: Verdict;
  readonly arm: string;
  readonly why: string;
}

function readFile(abs: string): Reading | null {
  const raw = readFileSync(abs, 'utf8');
  const src = stripComments(raw);

  // ── Is this actually a batch verb? Two independent establishments. ─────────
  const declaresBatchType = /readonly\s+type\s*=\s*['"][a-z-]+\.batch\.[a-zA-Z]+['"]/.test(src);
  const isBatchCommandClass = /class\s+\w*Batch\w*Command\b/.test(src);
  if (!declaresBatchType && !isBatchCommandClass) return null;

  // ── Does the body iterate per item at all? A batch that does not loop is
  //    not a multi-element operation in the sense this invariant governs. ─────
  const loops = /\bfor\s*\(|\.forEach\(|\.map\(/.test(src);
  if (!loops) return null;

  // ── DROP SITES: places an individual item can leave the batch WITHOUT the
  //    whole batch failing. A `throw` is NOT a drop — it aborts everything,
  //    which is the ATOMIC answer and is legal (C78 §1.3). ────────────────────
  //    Two shapes, both measured inside the file body:
  //      • a bare `continue;` (skip this item, keep going)
  //      • a `catch` block that does not re-throw (swallow this item's failure)
  //    Both the bare `continue;` on its own line and the braced one-liner
  //    `if (…) { continue; }` — the negative test for arm (a) planted the
  //    braced form and the line-anchored rule did not see it.
  const skipSites = (src.match(/(?:^|\{)\s*continue;/gm) ?? []).length;

  // Matched as a WHOLE `try { … } catch (…) { … }` statement, not a bare catch,
  // so the exclusions below can read the GUARDED code as well as the handler.
  // A one-line `try { store.remove(id) } catch { /* best-effort */ }` strips to
  // `try { store.remove(id) } catch {}`, whose handler is empty — the rollback
  // verb lives on the TRY side and is invisible to a catch-only match.
  const catchBlocks = [...src.matchAll(/try\s*\{([\s\S]{0,600}?)\}\s*catch\s*(?:\([^)]*\))?\s*\{([\s\S]{0,400}?)\n?\s*\}/g)];
  const swallowingCatches = catchBlocks.filter((m) => {
    const guarded = m[1] ?? '';
    const body = m[2] ?? '';
    // Re-throwing (or wrapping-and-throwing) is atomic and therefore honest.
    if (/\bthrow\b/.test(body)) return false;
    // ── NOT a per-item drop: a catch whose handler reports TOTAL failure.
    //    `return { success: false … }` means the batch as a whole refused —
    //    that is the ATOMIC answer, the truthful one, and counting it as a
    //    drop punishes exactly the code C78 §1.3 asks for. This exclusion was
    //    added after the first reading classified BatchCreateRoomsCommand as
    //    a violation: its three swallowing catches are BEST-EFFORT ROLLBACK
    //    cleanup inside a handler that returns `success: false`, and its item
    //    loop is genuinely all-or-nothing. A detector that cannot tell
    //    rollback from a skip is measuring the wrong thing.
    if (/success\s*:\s*false/.test(body)) return false;
    // ── NOT a per-item drop: best-effort cleanup INSIDE a failure path. These
    //    are the `try { store.remove(id) } catch {}` lines that unwind a batch
    //    already known to have failed. Recognised by a rollback/unregister/
    //    remove verb with no reporting of its own.
    //    No trailing \b: the verbs appear as `unregisterElement`,
    //    `removeAllRelationshipsForElement`, `disposeOf` — a closing boundary
    //    would miss every one of them.
    if (/\b(?:remove|unregister|dispose|revert|rollback)/i.test(guarded) && body.trim().length < 40) return false;
    // An empty/comment-only catch or a warn-only catch swallows.
    return true;
  }).length;

  const dropSites = skipSites + swallowingCatches;
  if (dropSites === 0) {
    return {
      file: rel(abs), verdict: 'atomic', arm: '—',
      why: 'no per-item drop site: every per-item problem throws outward, so the batch is all-or-nothing (C78 §1.3 total refusal — legal).',
    };
  }

  // ── OUTCOME CHANNELS: what can the CALLER read to learn a drop happened? ───
  //    A console.warn is NOT a channel (see the header) — the caller receives
  //    nothing it can branch on. These are the shapes that ARE readable:
  const hasSkipCounter = /\b(skipped|dropped|skippedCount|droppedDegenerate|_skipped|refused|unchanged)\b\s*(?:[+][+]|[+]=|\.push\(|:)/.test(src)
    || /\b(?:let|const)\s+(?:skipped|dropped|droppedDegenerate|skippedCount)\b/.test(src)
    || /\b_skipped\b/.test(src);
  const hasInfoChannel = /\binfo\s*:\s*\[/.test(src);
  const hasNofM = /\$\{[^}]*\}\s*of\s*\$\{|\bof\s*\$\{(?:total|ids\.length)/.test(src)
    || /\bof \$\{total\}/.test(src);
  const hasPerItemResults = /\bresults\s*:\s*\[|\bperItem\b|\boutcomes\b/.test(src);
  const hasSkipAttr = /setAttribute\([^)]*skipped/.test(src);

  const readableChannel = hasInfoChannel || hasPerItemResults || (hasSkipCounter && (hasNofM || hasSkipAttr));

  // ── THE SUCCESS VERDICT: is it gated on what actually happened? ────────────
  //    `success: changed > 0` / `success: applied === total` are GATED — the
  //    verdict is computed from a measured quantity. A literal `success: true`
  //    on a body that has drop sites is arm (a).
  const gatedSuccess = /success\s*:\s*[A-Za-z_$][\w$]*\s*(?:>|>=|===|!==|<)/.test(src)
    || /success\s*:\s*[A-Za-z_$][\w$]*\.length\s*(?:>|>=|===)/.test(src);
  const unconditionalSuccessTrue = /return\s*\{\s*success\s*:\s*true\b/.test(src);

  // Handler-shaped commands (`return { forward, inverse, nextStates }`) have no
  // `success` field at all — their honesty channel is `info` / the report event.
  const handlerShaped = /return\s*\{\s*forward\s*,/.test(src) || /nextStates\s*:/.test(src);

  // ── ARM (a) — success despite refusal ─────────────────────────────────────
  if (unconditionalSuccessTrue && !gatedSuccess && !readableChannel) {
    return {
      file: rel(abs), verdict: 'silent-partial', arm: '(a) success-despite-refusal',
      why: `${dropSites} per-item drop site(s) (${skipSites} skip, ${swallowingCatches} swallowing catch) and an UNCONDITIONAL \`return { success: true }\` with no readable outcome channel. `
        + 'The caller is told the whole batch succeeded while items were refused — C67 §4.6 "Done only after success" and C78 §1.2b.',
    };
  }

  // ── ARM (b) — swallowed per-item failure ──────────────────────────────────
  //    A drop happened, something was logged, and nothing counted it.
  const warnOnly = /console\.(warn|error|log)\(/.test(src);
  if (!readableChannel && warnOnly) {
    return {
      file: rel(abs), verdict: 'silent-partial', arm: '(b) swallowed per-item failure',
      why: `${dropSites} per-item drop site(s) reach a console.${/console\.warn/.test(src) ? 'warn' : 'log'} and NO readable channel. `
        + 'A log is not an outcome: the caller receives nothing it can branch on, so "N of M" is unanswerable from the return value (C67 §4.6, C78 §1.2b).',
    };
  }

  // ── ARM (c) — no per-item outcome at all ──────────────────────────────────
  if (!readableChannel) {
    return {
      file: rel(abs), verdict: 'silent-partial', arm: '(c) no per-item outcome',
      why: `${dropSites} per-item drop site(s) (${skipSites} skip, ${swallowingCatches} swallowing catch) and NO per-item outcome channel of any kind `
        + `(no info[], no skipped counter, no per-item results${handlerShaped ? '; handler-shaped return carries forward/inverse only' : ''}). `
        + 'A dropped item leaves no trace the caller can read (C78 §1.3: the answer is neither DETERMINED nor UNDETERMINED — it is absent).',
    };
  }

  return {
    file: rel(abs), verdict: 'honest', arm: '—',
    why: `${dropSites} drop site(s), reported through ${[
      hasInfoChannel ? 'info[]' : null,
      hasSkipCounter ? 'a skip counter' : null,
      hasNofM ? 'an "N of M" summary' : null,
      hasSkipAttr ? 'a span attribute' : null,
      hasPerItemResults ? 'per-item results' : null,
      gatedSuccess ? 'a measured success verdict' : null,
    ].filter(Boolean).join(' + ')}.`,
  };
}

function run(): GateResult {
  // ══ SUBJECT ESTABLISHMENT — two independent sweeps, unioned ═══════════════
  const candidates = new Set<string>();
  let pluginHandlerFiles = 0;
  let registryBatchFiles = 0;

  try {
    for (const p of walk(resolve(REPO, 'plugins'))) {
      if (!p.includes('handlers')) continue;
      if (!/Batch/i.test(basename(p))) continue;
      candidates.add(p); pluginHandlerFiles++;
    }
  } catch (e) { harnessErrors.push('plugin sweep: ' + String(e).slice(0, 200)); }

  try {
    for (const p of walk(resolve(REPO, 'packages/command-registry/src'))) {
      if (!/Batch/i.test(basename(p))) continue;
      candidates.add(p); registryBatchFiles++;
    }
  } catch (e) { harnessErrors.push('registry sweep: ' + String(e).slice(0, 200)); }

  lines.push(`SUBJECT: ${candidates.size} candidate batch file(s) — ${pluginHandlerFiles} bus handler(s) under plugins/*/src/handlers, `
    + `${registryBatchFiles} *Batch*.ts under packages/command-registry/src. Two independent conventions, UNIONED so a rename in one cannot empty the subject.`);
  floors.push({ what: 'candidate batch files established from source (union of two independent conventions)', measured: candidates.size, min: 20 });

  // ══ READ EVERY CANDIDATE ═════════════════════════════════════════════════
  const readings: Reading[] = [];
  for (const abs of [...candidates].sort()) {
    try {
      const r = readFile(abs);
      if (r) readings.push(r);
    } catch (e) { harnessErrors.push(`${rel(abs)}: ` + String(e).slice(0, 200)); }
  }

  const atomic = readings.filter((r) => r.verdict === 'atomic');
  const honest = readings.filter((r) => r.verdict === 'honest');
  const silent = readings.filter((r) => r.verdict === 'silent-partial');

  floors.push({ what: 'batch commands whose shape was actually CLASSIFIED (a gate that classified nothing has measured nothing)', measured: readings.length, min: 15 });
  // A subject in which NOTHING can partially succeed would make every arm
  // vacuous. At least one file must have a real drop site, or this gate is
  // reading the wrong population.
  floors.push({ what: 'batch commands with at least one per-item DROP site (the population the invariant governs — zero would make every arm vacuous)', measured: honest.length + silent.length, min: 1 });

  lines.push(`CLASSIFIED ${readings.length}: ${atomic.length} ATOMIC (all-or-nothing — legal under C78 §1.3), `
    + `${honest.length} HONEST-PARTIAL (drops, and reports them), ${silent.length} SILENT-PARTIAL (drops, and does not).`);

  for (const r of honest) lines.push(`   honest  · ${r.file} — ${r.why}`);
  for (const r of silent) lines.push(`   SILENT  · ${r.file} — ${r.arm}: ${r.why}`);

  // ══ LEDGER — named, shrink-only, pinned at the first honest reading ═══════
  let ledger: Ledger = { silentPartial: [] };
  let ledgerLoaded = 0;
  try {
    if (existsSync(LEDGER)) {
      ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger;
      ledgerLoaded = 1;
    }
  } catch (e) { harnessErrors.push('ledger: ' + String(e).slice(0, 200)); }
  floors.push({ what: 'the named shrink-only ledger loaded from disk (a ratchet with no ledger is not a ratchet)', measured: ledgerLoaded, min: 1 });

  const declaredKeys = new Set((ledger.silentPartial ?? []).map((r) => `${r.file}`));
  const measuredKeys = new Set(silent.map((r) => r.file));

  // Unledgered findings — a real regression. Named individually.
  for (const r of silent) {
    if (!declaredKeys.has(r.file)) {
      findingNames.push(`UNLEDGERED SILENT PARTIAL — ${r.file} ${r.arm}: ${r.why}`);
    }
  }
  // Ledgered-and-still-measured: the declared level. One finding each, so the
  // count and the ledger length are directly comparable.
  for (const r of silent) {
    if (declaredKeys.has(r.file)) {
      findingNames.push(`${r.file} ${r.arm} — declared: ${r.why}`);
    }
  }

  // Stale rows: debt that has been paid and not struck off (contract.ts forces 3).
  const stale = [...declaredKeys].filter((k) => !measuredKeys.has(k))
    .map((k) => `${k} — declared silent-partial but NO LONGER measured as one; strike it in the commit that fixed it.`);

  for (const err of harnessErrors) {
    lines.push('harness error: ' + err);
    findingNames.push('harness error (never merged with "no finding"): ' + err.slice(0, 140));
  }

  return {
    gate: 'check-no-silent-partial',
    floors,
    lines,
    findings: findingNames.length,
    declared: (ledger.silentPartial ?? []).length,
    findingNames,
    stale,
  };
}

try {
  process.exit(reportGate(run()));
} catch (e) {
  console.error('check-no-silent-partial: harness threw — MISCONFIGURED\n', e);
  process.exit(2);
}
