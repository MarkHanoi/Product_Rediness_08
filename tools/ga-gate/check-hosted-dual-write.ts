#!/usr/bin/env tsx
/**
 * C15 §8.1 — THE HOSTED-OPENING DUAL-WRITE GATE. (C86 WO-B-3, §11 #2.)
 *
 * Anchor: docs/02-decisions/contracts/C15-HOSTED-ELEMENT-CONTRACT.md §8.1
 *         docs/02-decisions/contracts/C86-ELEMENT-WALL-OPENING.md §5, §11 #1/#2/#18
 *         docs/02-decisions/contracts/C84-ELEMENT-INTEGRITY.md EI-1, §8.d
 *
 * ─── WHY THIS GATE EXISTS ────────────────────────────────────────────────────
 * A door or window has TWO records: the authority `wall.openings[]` (reached via
 * `wallStore.updateDoor()` / `updateWindow()`, which drives the VOID that
 * `WallFragmentBuilder` cuts) and the derived `doorStore` / `windowStore` (which
 * drives the FRAME that `DoorBuilder` / `WindowBuilder` place). C15 §8.1 mandates
 * that a command mutating one writes the other:
 *
 *   "Any new command or handler that calls `wallStore.updateWindow(id, { offset })`
 *    MUST also call `windowStore.update(id, { offset })` (guarded by
 *    `windowStore.has(id)`). Likewise for doors. A CODE-REVIEW CHECKLIST ITEM MUST
 *    VERIFY THIS PAIRING."
 *
 * That last sentence is the whole problem. C84 §8.d names it: *a comment as the
 * synchronisation mechanism*. It has measurably failed — twice, on the family's two
 * most-used gestures (C86 §11 #1 the plan drag, §11 #18 the property panel). When
 * the pair diverges the user sees the hole move and the leaf stay behind.
 *
 * ─── WHY IT KEYS ON CALL SITES AND NOT ON COMMANDS (this is load-bearing) ────
 * C86's own §5 census was built by sweeping `packages/command-registry/src/
 * {doors,windows}/*.ts` — COMMAND declarations. It therefore contained
 * `PlanElementDragController` only because someone knew about it, and it MISSED
 * `PropertyInspectorApply` entirely (L-1042). Both are UI apply paths that call
 * `wallStore.updateDoor` directly, off-bus and off-command.
 *
 *   TWO OF THIS FAMILY'S THREE MOST-USED MUTATION SURFACES ARE NOT COMMANDS.
 *
 * A declaration-shaped gate would pass this repo while both live surfaces violate.
 * So this gate scans for CALL SITES, repo-wide, and owes nothing to who calls them.
 *
 * ─── THE `?.()` TRAP, recorded because it cost a measurement ─────────────────
 * The obvious pattern `\.updateDoor\s*\(` MISSES `ctx.wallStore?.updateDoor?.(…)`,
 * the optional-call form — which is exactly how all nine `PropertyInspectorApply`
 * sites are written. A first pass with the naive pattern silently omitted the very
 * file this gate was written for. The pattern below admits the
 * optional-call form, and `__tests__/hostedDualWriteGate.test.ts` pins that it does.
 * A scanner whose blind spot is the defect it hunts reports a clean repo.
 *
 * ─── WHAT "PAIRED" MEANS HERE, and the weakness is DECLARED not hidden ───────
 * Pairing is judged at FILE granularity: a file that calls `wallStore.updateDoor`
 * must also contain a `doorStore.update` (likewise window). That is deliberately
 * coarse, and it is UNSOUND IN ONE DIRECTION: a file pairing one field and not
 * another reads as PAIRED. It is chosen anyway because the alternative — statement
 * -level dataflow — is a type-checker's job, and because every violation measured so
 * far is total (the violating files contain ZERO standalone-store references, not
 * some). C84 EI-10(c) requires the divergence to be declared rather than discovered,
 * so it is declared here: THIS GATE CANNOT SEE A PARTIALLY-PAIRED FILE.
 *
 * ─── Ratchet ────────────────────────────────────────────────────────────────
 * Shrink-only. `BASELINE` is the count of unpaired files on the day this landed.
 * ⛔ NEVER raise it. A new unpaired call site fails the gate; fix the pairing or
 * route through a command that pairs. The exit condition is BASELINE === 0, at
 * which point this becomes a hard-0 gate and C15 §8.1 stops being a checklist item.
 *
 * Exit: 0 = within baseline · 1 = regression above baseline · 2 = scan misconfigured
 */

import { scanFilesStripped } from './lib/sourceScan.js';
import { readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const LABEL = 'hosted-dual-write';

/** Where hosted-opening writes can legitimately live. */
const SCAN_DIRS = ['packages', 'apps', 'plugins', 'src'] as const;

/**
 * Honesty floor. A walk that reaches fewer files than this is misconfigured, and
 * MUST NOT be able to report a pass — the `lib/xssSinkWalk.ts` lesson.
 */
const MIN_FILES = 2000;

/**
 * ⛔ SHRINK-ONLY. **3** unpaired files, measured 2026-08-19.
 *
 *   apps/editor/src/ui/property-inspector/PropertyInspectorApply.ts  — 9 sites, C86 §11 #18 / L-1042
 *   packages/command-registry/src/UpdateElementMarkCommand.ts        — 2 sites, desyncs `mark`
 *   packages/core-app-model/src/views/PlanElementDragController.ts   — 4 sites, C86 §11 #1
 *
 * ⚠ THIS BASELINE WAS FIRST SET TO 15 AND THE GATE CORRECTED IT — recorded because
 * that is the point of building the instrument. C86 §5 and §11 #3 assert that
 * "THIRTEEN more commands mutate the record on one side only", justified with
 * "A grep of each for `doorStore`/`windowStore` produced no hits." **Measured, TWELVE
 * OF THE THIRTEEN PAIR CORRECTLY**, each as
 *     if (doorStore.has(id)) doorStore.update(id, { … });
 * on BOTH the execute and the undo leg — precisely the C15 §8.1 form. And
 * `git log -S "windowStore.update" -- .../UpdateWindowHeightCommand.ts` returns the
 * **Initial commit**, so this is not drift since C86 was written: **the claimed grep
 * cannot have been run.** Only `UpdateElementMarkCommand` is genuinely one-sided.
 *
 * ⭐ A confident register row backed by prose rather than a measurement was wrong by
 * a factor of four, and it took an executed instrument to find that out. That is the
 * argument for this file existing at all.
 */
const BASELINE = 3;

/** Both call forms, including the optional-call `?.(` that hid the property panel. */
const CALL = /\.(updateDoor|updateWindow)\s*(?:\?\.)?\s*\(/;

/** The paired standalone write this gate looks for, in the same file. */
const PAIRED_DOOR = /\bdoorStore\s*(?:\?\.)?\s*\.?\s*update\s*\(/;
const PAIRED_WINDOW = /\bwindowStore\s*(?:\?\.)?\s*\.?\s*update\s*\(/;

/**
 * Files exempt from the pairing requirement, each with its reason (C84 EI-10(a) —
 * a named reason, never silence).
 */
const EXEMPT: ReadonlyArray<{ readonly rel: string; readonly why: string }> = [
  {
    rel: 'packages/geometry-wall/src/WallStore.ts',
    why: 'the DEFINITION of updateDoor/updateWindow, plus its own internal re-seat calls. '
      + 'A store may not import the derived stores that mirror it — that is the cycle C15 §8.1 '
      + 'exists to arbitrate from OUTSIDE.',
  },
];

const isTest = (rel: string): boolean =>
  rel.includes('__tests__') || /\.(test|spec)\.tsx?$/.test(rel) || rel.includes('/tests/');

const exemptRels = new Set(EXEMPT.map((e) => e.rel.replace(/\//g, sep)));

const res = scanFilesStripped({
  root: REPO_ROOT,
  dirs: [...SCAN_DIRS],
  pattern: CALL,
  minFiles: MIN_FILES,
  exclude: (rel) => isTest(rel) || rel.endsWith('.d.ts'),
  label: LABEL,
});

console.log(
  `[${LABEL}] files scanned: ${res.filesScanned} (excluded ${res.filesExcluded}) · dirs: ${SCAN_DIRS.join(', ')}`,
);

/** Group the call sites by file. */
const byFile = new Map<string, number[]>();
for (const m of res.matches) {
  const norm = m.file.replace(/\\/g, '/');
  if (exemptRels.has(m.file) || EXEMPT.some((e) => e.rel === norm)) continue;
  const list = byFile.get(norm) ?? [];
  list.push(m.line);
  byFile.set(norm, list);
}

const paired: string[] = [];
const unpaired: Array<{ rel: string; lines: number[]; missing: string }> = [];

for (const [rel, lines] of [...byFile.entries()].sort()) {
  let src: string;
  try {
    src = readFileSync(join(REPO_ROOT, rel), 'utf8');
  } catch {
    console.error(`[${LABEL}] FAIL: could not re-read ${rel} — refusing to judge it clean.`);
    process.exit(2);
  }
  // Which side does this file write? Judge only the sides it actually touches.
  const writesDoor = /\.updateDoor\s*(?:\?\.)?\s*\(/.test(src);
  const writesWindow = /\.updateWindow\s*(?:\?\.)?\s*\(/.test(src);

  const missing: string[] = [];
  if (writesDoor && !PAIRED_DOOR.test(src)) missing.push('doorStore.update');
  if (writesWindow && !PAIRED_WINDOW.test(src)) missing.push('windowStore.update');

  if (missing.length === 0) paired.push(rel);
  else unpaired.push({ rel, lines, missing: missing.join(' + ') });
}

console.log(`[${LABEL}] hosted-opening write sites: ${res.matches.length} in ${byFile.size} file(s)`);
console.log(`[${LABEL}]   PAIRED   (C15 §8.1 honoured): ${paired.length}`);
for (const r of paired) console.log(`[${LABEL}]     ✅ ${r}`);
console.log(`[${LABEL}]   UNPAIRED (C15 §8.1 violated): ${unpaired.length} / baseline ${BASELINE}`);
for (const u of unpaired) {
  console.log(`[${LABEL}]     ⛔ ${u.rel}:${u.lines.join(',')} — no ${u.missing} in this file`);
}
for (const e of EXEMPT) console.log(`[${LABEL}]   EXEMPT ${e.rel} — ${e.why}`);

if (unpaired.length > BASELINE) {
  console.error(
    `\n[${LABEL}] FAIL: ${unpaired.length} unpaired hosted-opening write sites exceeds the ` +
      `shrink-only baseline of ${BASELINE}.\n\n` +
      `  A command or handler that calls wallStore.updateDoor()/updateWindow() MUST also call\n` +
      `  doorStore.update()/windowStore.update() (guarded by .has(id)) — C15 §8.1. Otherwise the\n` +
      `  VOID moves and the FRAME stays behind: the user sees the hole shift and the leaf remain.\n\n` +
      `  Two exits: pair the write, or route the gesture through a command that already pairs\n` +
      `  (SetDoorOffsetCommand / SetWindowOffsetCommand are the reference implementations).\n` +
      `  Read: docs/02-decisions/contracts/C15-HOSTED-ELEMENT-CONTRACT.md §8.1\n`,
  );
  process.exit(1);
}

if (unpaired.length < BASELINE) {
  console.log(
    `[${LABEL}] ⬇ RATCHET: ${unpaired.length} < baseline ${BASELINE}. ` +
      `Lower BASELINE to ${unpaired.length} in this file, in the same commit.`,
  );
}

console.log(`[${LABEL}] OK: ${unpaired.length} unpaired = baseline ${BASELINE} (shrink-only).`);
