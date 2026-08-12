#!/usr/bin/env tsx
/**
 * Wave 1 task 1 — EngineBootstrap.ts LOC tripwire.
 *
 * Spec: docs/03_PRYZM3/04-PLAN-FORWARD/02-WAVE-1-TRIPWIRES.md §2
 * Anchor: docs/03_PRYZM3/04-PLAN-FORWARD/01-CRITICAL-PATH-D4.md
 *
 * Hard-fail if EngineBootstrap.ts > HARD_FAIL LOC (regression gate).
 * Soft-warn if > SOFT_WARN LOC (toward Wave 7 deletion target of 0).
 * Returns 0 (OK) when the file does not exist (Wave 7 deletion has happened).
 *
 * ─── §R5-FLOOR (2026-08-11) — this gate's ENTIRE VERDICT WAS AN ABSENCE ───────
 * "The file is not there" was, until now, indistinguishable from "I was pointed at
 * the wrong tree". Run this gate from any directory that is not the repo root and
 * it printed OK — the §CONTEXT-DATA-HONESTY defect (failure and emptiness are the
 * same value) in its purest form, and the reason R5 exists.
 *
 * Two floors, both exiting 2 (MISCONFIGURED, never absorbable as debt):
 *   • MIN_ANCHOR_SUBJECTS — the anchors that prove we are standing in THIS repo
 *     (package.json + the src/ tree the claim is about). Absent ⇒ exit 2.
 *   • The absence claim is now checked by SEARCH, not by one hard-coded path:
 *     any file named EngineBootstrap.ts anywhere under the client roots trips the
 *     LOC check. A gate that watches one path cannot see the file move, and a
 *     rival bootstrap resurrected at apps/editor/src/engine/EngineBootstrap.ts
 *     would have read as "Wave 7 target reached".
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const HARD_FAIL = 2100; // current value: 2,066 (2026-04-30)
const SOFT_WARN = 200;  // Wave 7 vision target: 0 (file deleted)

/** Roots the deleted bootstrap could plausibly reappear in. */
const SEARCH_ROOTS: readonly string[] = ['src', 'apps/editor/src', 'packages/runtime-composer/src'];

/**
 * §R5 SUBJECT FLOOR. Every one of these must be present, or this gate has not
 * found the repository and its "file absent" verdict means nothing.
 */
const MIN_ANCHOR_SUBJECTS = 2;
const ANCHORS: readonly string[] = ['package.json', 'src'];

function loc(path: string): number {
  return readFileSync(path, 'utf8').split('\n').length;
}

/** Every EngineBootstrap.ts under the search roots. */
function findBootstraps(): string[] {
  const hits: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      if (e === 'node_modules' || e === 'dist' || e === '.git') continue;
      const p = join(dir, e);
      let s;
      try { s = statSync(p); } catch { continue; }
      if (s.isDirectory()) walk(p);
      else if (e === 'EngineBootstrap.ts') hits.push(p);
    }
  };
  for (const r of SEARCH_ROOTS) walk(resolve(REPO_ROOT, r));
  return hits;
}

function main(): number {
  const present = ANCHORS.filter((a) => existsSync(resolve(REPO_ROOT, a)));
  if (present.length < MIN_ANCHOR_SUBJECTS) {
    console.error(
      `[loc-tripwire] MISCONFIGURED (exit 2) — only ${present.length}/${MIN_ANCHOR_SUBJECTS} repo anchors found under ${REPO_ROOT}.`
      + `\n  Missing: ${ANCHORS.filter((a) => !present.includes(a)).join(', ')}`
      + `\n  "EngineBootstrap.ts is absent" is not a measurement when the repository itself is absent. This is NOT a pass.`,
    );
    process.exit(2);
  }

  const found = findBootstraps();
  if (found.length === 0) {
    console.log(`[loc-tripwire] OK: no EngineBootstrap.ts under ${SEARCH_ROOTS.join(', ')} (Wave 7 target reached, verified by search).`);
    return 0;
  }
  const FILE = found[0]!;
  if (found.length > 1) {
    console.error(`[loc-tripwire] FAIL: ${found.length} EngineBootstrap.ts files exist:\n      ${found.join('\n      ')}`);
    return 1;
  }
  const n = loc(FILE);
  if (n > HARD_FAIL) {
    console.error(`[loc-tripwire] FAIL: ${FILE} = ${n} LOC > ${HARD_FAIL} (hard fail).`);
    console.error(`  This is a regression. The Wave 7 target is file deletion (0 LOC).`);
    console.error(`  Read: docs/03_PRYZM3/04-PLAN-FORWARD/01-CRITICAL-PATH-D4.md`);
    return 1;
  }
  if (n > SOFT_WARN) {
    console.warn(`[loc-tripwire] WARN: ${FILE} = ${n} LOC > ${SOFT_WARN} (soft warn). Wave 7 target: 0.`);
    return 0;
  }
  console.log(`[loc-tripwire] OK: ${FILE} = ${n} LOC.`);
  return 0;
}

process.exit(main());
