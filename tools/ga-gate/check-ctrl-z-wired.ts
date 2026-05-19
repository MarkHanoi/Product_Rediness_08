#!/usr/bin/env npx tsx
/**
 * GA gate: check-ctrl-z-wired
 * Verifies that the Ctrl-Z keyboard handler in initUI.ts uses the
 * ring-buffer path (undoPatch) rather than commandManager.undo() unconditionally.
 * Authority: C03 §4 (undo ring buffer), Wave 36 U-5.
 */
import { execSync } from 'child_process';

// Canonical path after Sprint AT engine extraction (Wave 7 task 5.2).
// Previously `src/engine/subsystems/initUI.ts` (stale — Wave 7 moved it).
const TARGET = 'apps/editor/src/engine/initUI.ts';
let exitCode = 0;

// Check 1 — ring-buffer undoPatch call must be present
const undoPatchCount = Number(
  execSync(`rg -c "undoPatch\\(\\)" "${TARGET}" || echo 0`, { encoding: 'utf8' }).trim(),
);
if (undoPatchCount === 0) {
  console.error(`[FAIL] check-ctrl-z-wired: no undoPatch() call found in ${TARGET}. Ring-buffer Ctrl-Z path missing — see Wave 36 U-1.`);
  exitCode = 1;
} else {
  console.log(`[PASS] check-ctrl-z-wired: undoPatch() present in ${TARGET} (${undoPatchCount} calls)`);
}

// Check 2 — unconditional commandManager.undo() must be absent (fallback is guarded by TODO or is a comment)
// Lines that are pure comments (trimmed content starts with '//') are excluded — they are documentation, not calls.
const rawHits = execSync(`rg -n "commandManager\\.undo\\(\\)" "${TARGET}" || true`, { encoding: 'utf8' }).trim();
const unconditionalHit = rawHits.split('\n').find((line) => {
  if (line.trim() === '') return false;
  // Extract the code portion after the line number prefix (e.g. "2701:    // comment")
  const codePart = line.replace(/^\d+:/, '');
  // Skip pure comment lines
  if (codePart.trimStart().startsWith('//')) return false;
  // Skip lines that have TODO(Wave36 annotation
  if (line.includes('TODO(Wave36')) return false;
  return true;
});
if (unconditionalHit) {
  console.error(`[FAIL] check-ctrl-z-wired: unconditional commandManager.undo() found in ${TARGET}:\n  ${unconditionalHit}\n  Replace with ring-buffer path per Wave 36 U-1.`);
  exitCode = 1;
} else {
  console.log(`[PASS] check-ctrl-z-wired: no unconditional commandManager.undo() in ${TARGET}`);
}

process.exit(exitCode);
