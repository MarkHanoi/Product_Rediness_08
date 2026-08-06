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

// A missing target is a hard failure, never a silent pass — the whole point of
// the rewrite is that "cannot read" must not look like "nothing to report".
if (!existsSync(abs)) {
  fail(`target not found: ${TARGET}. If the file moved, update this gate — do NOT delete it.`);
  process.exit(1);
}

const raw = readFileSync(abs, 'utf8');

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
