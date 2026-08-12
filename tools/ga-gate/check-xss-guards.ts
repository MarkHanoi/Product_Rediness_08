#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-xss-guards.ts
 *
 * GA Gate — §XSS-SINK-SCAN (L-407): repo-wide HTML-sink regression lock.
 *
 * Contract C08 §3.1 — every dynamic HTML-sink assignment that interpolates a
 * runtime value MUST route that value through a recognised safety guard
 * (`escHtml`/`escAttr`, the local `escapeHtml`/`esc`/`escape` aliases a file
 * declares for itself, `safeHref`/`safeHttpUrl`, `safeCssColor`, or
 * `DOMPurify.sanitize`). See `lib/xssSinkScan.ts` for the classifier and the
 * three structural blindnesses this gate replaces.
 *
 * Enforcement model — a PER-FILE RATCHET, not a global count:
 * ─────────────────────────────────────────────────────────────────────────────
 *   • ZERO-TOLERANCE sinks (`eval`, interpolating `new Function`, `srcdoc`,
 *     `dangerouslySetInnerHTML`, `createContextualFragment`) fail on sight.
 *     The repo has none today, so this is a standing guarantee, not a ratchet.
 *   • A file with NO baseline entry may have NO unguarded interpolation. Every
 *     new file is therefore born clean.
 *   • A file WITH a baseline entry may not exceed it. Known debt is frozen and
 *     can only shrink.
 *   • Improvements are reported so the baseline gets tightened, never loosened
 *     silently.
 *
 * A global count-ratchet cannot do this: it lets a brand-new unguarded sink in
 * one file hide behind an unrelated fix in another.
 *
 * Usage:
 *   pnpm tsx tools/ga-gate/check-xss-guards.ts            # gate
 *   pnpm tsx tools/ga-gate/check-xss-guards.ts --update   # rewrite the baseline
 *   pnpm tsx tools/ga-gate/check-xss-guards.ts --list     # print every finding
 *
 * Exit codes:
 *   0 — clean (or within baseline)
 *   1 — (reserved: a failure at the declared, ledgered level)
 *   3 — new or GROWN unguarded sinks — a per-file ratchet breach, never absorbable
 *   2 — gate misconfigured (scanned too few files / baseline unreadable)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { scanRepo, tally, diffBaseline, MIN_SCANNED_FILES, type SinkBaseline } from './lib/xssSinkWalk.js';
import { ZERO_TOLERANCE_SINKS } from './lib/xssSinkScan.js';

// §HONESTY — `new URL(...).pathname` yields `/C:/…` on Windows, every readdir
// then throws, the walker swallows it and the gate prints "✅ 0 violations"
// having scanned nothing. `fileURLToPath` is the cross-platform form.
const ROOT = fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '');
const BASELINE_FILE = join(ROOT, 'tools', 'ga-gate', 'xss-sink-baseline.json');

const argv = process.argv.slice(2);
const UPDATE = argv.includes('--update');
const LIST = argv.includes('--list');

const { findings, filesScanned } = scanRepo(ROOT);

// ── Coverage assertion ───────────────────────────────────────────────────────
if (filesScanned < MIN_SCANNED_FILES) {
  console.error(
    `[xss-guards] ⚠ MISCONFIGURED — scanned only ${filesScanned} file(s) ` +
    `(expected ≥ ${MIN_SCANNED_FILES}). Root resolved to: ${ROOT}\n` +
    'Refusing to report a pass on an unscanned tree.',
  );
  process.exit(2);
}

if (LIST) {
  for (const f of findings) console.log(`${f.file}:${f.line} [${f.kind}] \${${f.expr}}`);
}

const actual = tally(findings);

if (UPDATE) {
  const sorted: SinkBaseline = {};
  for (const key of Object.keys(actual).sort()) sorted[key] = actual[key];
  writeFileSync(BASELINE_FILE, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
  console.log(`[xss-guards] baseline written: ${Object.keys(sorted).length} file(s), ${findings.length} finding(s).`);
  process.exit(0);
}

if (!existsSync(BASELINE_FILE)) {
  console.error(`[xss-guards] ⚠ MISCONFIGURED — baseline missing: ${BASELINE_FILE}\nRun with --update to create it.`);
  process.exit(2);
}

let baseline: SinkBaseline;
try {
  baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as SinkBaseline;
} catch (err) {
  console.error(`[xss-guards] ⚠ MISCONFIGURED — baseline unreadable: ${(err as Error).message}`);
  process.exit(2);
}

// ── Zero-tolerance sinks ─────────────────────────────────────────────────────
const zeroTol = findings.filter((f) => ZERO_TOLERANCE_SINKS.has(f.kind));
if (zeroTol.length > 0) {
  console.error(`[xss-guards] ❌ ${zeroTol.length} zero-tolerance sink(s) — these are never permitted:\n`);
  for (const f of zeroTol) console.error(`  ${f.file}:${f.line}  ${f.kind}\n    ${f.text}`);
  process.exit(3);
}

// ── Per-file ratchet ─────────────────────────────────────────────────────────
const { newFiles, grown, shrunk, cleared } = diffBaseline(actual, baseline);

if (newFiles.length > 0 || grown.length > 0) {
  console.error('[xss-guards] ❌ new unguarded HTML-sink interpolation(s) detected.\n');
  for (const file of newFiles) {
    console.error(`  NEW FILE  ${file}  (${actual[file]} finding(s))`);
    for (const f of findings.filter((x) => x.file === file)) {
      console.error(`      :${f.line} [${f.kind}]  \${${f.expr}}`);
    }
  }
  for (const g of grown) {
    console.error(`  GREW      ${g.file}  ${g.baseline} → ${g.actual}`);
    for (const f of findings.filter((x) => x.file === g.file)) {
      console.error(`      :${f.line} [${f.kind}]  \${${f.expr}}`);
    }
  }
  console.error(
    '\nFix: wrap each interpolated ${expr} in escHtml() from @pryzm/ui-base ' +
    '(or safeHref/safeHttpUrl for an href, safeCssColor for a colour), or set ' +
    'the value with element.textContent instead of innerHTML.\n' +
    'The baseline may only be lowered, never raised — do not run --update to silence this.',
  );
  /**
   * §LEDGERED-LEVEL / §RATCHET-EXCEEDED-IS-NEVER-DEBT (2026-08-11, C9) — exit 3.
   *
   * This gate is on `gate-debt.json`, and this branch is REACHED ONLY WHEN THE
   * PER-FILE RATCHET IS EXCEEDED: a file with no baseline entry acquired an
   * unguarded sink, or a baselined file GREW. There is no third reading here — a
   * gate sitting at its declared level takes one of the exits below, not this one.
   *
   * So exiting 1 here was precisely the state the ledger must never absorb: the
   * entry declares "known XSS debt exists", and the runner then swallowed BRAND-NEW
   * unguarded sinks under the same yellow KNOWN-DEBT line. Measured on this tree:
   * ImportManagerPanel.ts 7 → 11 and GISAreaLayout.ts 16 → 20 — eight interpolations
   * that entered after the freeze and were reported as "known debt, tolerated".
   *
   * Exit 3 is never absorbable, so growth now blocks while the ledgered baseline
   * itself stays tolerated. Nothing here was relaxed: the same findings, a truthful
   * exit code.
   */
  process.exit(3);
}

const total = findings.length;
if (shrunk.length > 0 || cleared.length > 0) {
  const removed =
    shrunk.reduce((n, s) => n + (s.baseline - s.actual), 0) +
    cleared.reduce((n, f) => n + (baseline[f] ?? 0), 0);
  console.log(
    `[xss-guards] ✅ ${total} baselined finding(s) across ${Object.keys(actual).length} file(s); ` +
    `${filesScanned} files scanned. ${removed} finding(s) FIXED since the baseline — ` +
    'please tighten it with `--update`.',
  );
  if (cleared.length > 0) console.log(`             cleared: ${cleared.join(', ')}`);
  process.exit(0);
}

console.log(
  `[xss-guards] ✅ no new unguarded HTML-sink interpolations. ` +
  `${total} baselined finding(s) across ${Object.keys(actual).length} file(s); ${filesScanned} files scanned.`,
);
process.exit(0);
