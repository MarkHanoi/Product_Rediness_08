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
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const FILE = resolve(REPO_ROOT, 'src/engine/EngineBootstrap.ts');
const HARD_FAIL = 2100; // current value: 2,066 (2026-04-30)
const SOFT_WARN = 200;  // Wave 7 vision target: 0 (file deleted)

function loc(path: string): number {
  return readFileSync(path, 'utf8').split('\n').length;
}

function main(): number {
  if (!existsSync(FILE)) {
    console.log(`[loc-tripwire] OK: ${FILE} does not exist (Wave 7 target reached).`);
    return 0;
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
