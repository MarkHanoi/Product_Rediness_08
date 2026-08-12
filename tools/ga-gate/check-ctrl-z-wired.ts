#!/usr/bin/env npx tsx
/**
 * GA gate: check-ctrl-z-wired
 *
 * Verifies that the Ctrl+Z / Ctrl+Shift+Z keyboard handlers in `initUI.ts` route
 * through THE single unified undo path — C03 §4.6 **U-5**: "There is exactly one
 * undo path and one redo path: `performUndoRedo.performUndo()` / `performRedo()`.
 * Every trigger MUST call them; no trigger may re-implement `undoPatch()` +
 * `applyRingBufferSide()` or call `commandManager.undo()` directly."
 *
 * ── WHY THIS FILE WAS REWRITTEN (§UNDO-GATE-INVERTED, L-694) ────────────────
 *
 * The previous implementation could not fail for the right reason and could not
 * pass for the right reason. Three independent faults:
 *
 *  1. INVERTED ASSERTION. It required `initUI.ts` to CONTAIN a call to
 *     `undoPatch()` — the hand-rolled ring-buffer stepping that OI-054 exists to
 *     ABOLISH. Post-unification, initUI delegating to `performUndo()` is the
 *     correct shape, and the gate demanded the pre-unification one. It pinned
 *     the architecture the contract had already replaced.
 *
 *  2. SATISFIED BY PROSE. It passed anyway — not because initUI calls
 *     `undoPatch()`, but because two explanatory COMMENT lines in initUI mention
 *     `undoPatch()`, and `rg -c` counts comments. The gate was green on evidence
 *     that had nothing to do with the behaviour it claimed to check. (Check 2
 *     stripped comments; check 1 did not.)
 *
 *  3. VACUOUS ON A MISSING TOOL. Both checks shelled out to `rg` (ripgrep) with
 *     `|| echo 0` / `|| true`, so on any machine without ripgrep on PATH the
 *     shell swallowed the failure and the checks read "0 matches" / "no hits".
 *     For check 2 ("no unconditional commandManager.undo()") that is a FALSE
 *     PASS: a missing tool and a clean file produce the identical answer. A
 *     probe that cannot tell failure from emptiness reports the same value for
 *     both.
 *
 * The rewrite reads the file directly with `node:fs` (no external binary, no
 * shell), strips comments before matching so prose can never satisfy or trip a
 * check, and asserts the invariant the contract actually states.
 *
 * Authority: C03 §4.5 (the single unified apply path) + §4.6 U-5.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Canonical path after Sprint AT engine extraction (Wave 7 task 5.2).
const TARGET = 'apps/editor/src/engine/initUI.ts';
const abs = resolve(process.cwd(), TARGET);

let exitCode = 0;
const fail = (msg: string): void => { console.error(`[FAIL] check-ctrl-z-wired: ${msg}`); exitCode = 1; };
const pass = (msg: string): void => { console.log(`[PASS] check-ctrl-z-wired: ${msg}`); };

/**
 * §R5-FLOOR (2026-08-11) — the subject floor.
 *
 * "Cannot read" already did not look like "nothing to report" — but it exited 1,
 * the SAME code a real U-5 breach produces, and exit 1 is absorbable by
 * gate-debt.json. A ledgered gate that cannot find its subject then reads as
 * "known undo debt" forever (§FIX-ISOLATION-GATE-BLIND, L-827). Misconfiguration
 * is exit 2 and never absorbable.
 *
 * The floor is TWO-SIDED: the file must exist AND be substantial. A truncated or
 * placeholder initUI.ts would satisfy every negative check trivially — check 2
 * is an ABSENCE assertion, and absence over an empty file is not evidence.
 */
const MIN_SUBJECT_FILE_LINES = 200;

if (!existsSync(abs)) {
  console.error(
    `[MISCONFIGURED] check-ctrl-z-wired (exit 2): target not found: ${TARGET}.`
    + `\n  cwd: ${process.cwd()}`
    + `\n  If the file moved, update this gate — do NOT delete it. This is NOT a pass and NOT declarable debt.`,
  );
  process.exit(2);
}

const raw = readFileSync(abs, 'utf8');

if (raw.split(/\r?\n/).length < MIN_SUBJECT_FILE_LINES) {
  console.error(
    `[MISCONFIGURED] check-ctrl-z-wired (exit 2): ${TARGET} is ${raw.split(/\r?\n/).length} lines; floor is ${MIN_SUBJECT_FILE_LINES}.`
    + `\n  Half this gate asserts that forbidden calls are ABSENT. Absence inside a stub file is not a measurement.`,
  );
  process.exit(2);
}

/** Strip block and line comments so documentation can never satisfy — or trip —
 *  a check. This is exactly what let the previous gate pass on two comment lines. */
const code = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split(/\r?\n/)
  .map(l => l.replace(/(^|[^:])\/\/.*$/, '$1'))
  .join('\n');

// ── Check 1 (U-5, positive) — the unified entry points are imported AND called ─
const importsUnified = /from\s+['"][^'"]*undo\/performUndoRedo(\.js)?['"]/.test(code);
const callsUndo = /\bperformUndo\s*\(\s*\)/.test(code);
const callsRedo = /\bperformRedo\s*\(\s*\)/.test(code);

if (importsUnified && callsUndo && callsRedo) {
  pass(`${TARGET} routes Ctrl+Z / Ctrl+Shift+Z through performUndo() + performRedo()`);
} else {
  const missing = [
    importsUnified ? null : 'import of undo/performUndoRedo',
    callsUndo ? null : 'performUndo() call',
    callsRedo ? null : 'performRedo() call',
  ].filter(Boolean).join(', ');
  fail(`${TARGET} does not route through the single unified undo path — missing: ${missing}. `
    + 'C03 §4.6 U-5: every trigger MUST call performUndo()/performRedo().');
}

// ── Check 2 (U-5, negative) — no trigger may re-implement the apply path ──────
const FORBIDDEN: Array<[RegExp, string]> = [
  [/\bcommandManager\s*[?.]*\.\s*undo\s*\(/, 'commandManager.undo()'],
  [/\bcommandManager\s*[?.]*\.\s*redo\s*\(/, 'commandManager.redo()'],
  [/\.\s*undoPatch\s*\(/,                    '.undoPatch()'],
  [/\.\s*redoPatch\s*\(/,                    '.redoPatch()'],
  [/\bapplyRingBufferSide\s*\(/,             'applyRingBufferSide()'],
];

const offenders = FORBIDDEN.filter(([re]) => re.test(code)).map(([, label]) => label);
if (offenders.length > 0) {
  fail(`${TARGET} re-implements the undo apply path directly: ${offenders.join(', ')}. `
    + 'C03 §4.6 U-5 — these belong ONLY in engine/undo/performUndoRedo.ts. '
    + 'The trigger divergence this forbids is the OI-054 root cause: the undo BUTTON '
    + 'consulted commandManager only and no-op\'d every plan-view element.');
} else {
  pass(`${TARGET} makes no direct undoPatch/applyRingBufferSide/commandManager.undo call`);
}

process.exit(exitCode);
