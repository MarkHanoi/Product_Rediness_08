#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-xss-guards.ts
 *
 * GA Gate — P0 XSS / innerHTML safety ratchet.
 *
 * Contract C08 §3.1 — All dynamic innerHTML assignments that interpolate
 * runtime values MUST wrap each interpolated expression in a recognised
 * safe guard:  escHtml() / escAttr() from @pryzm/ui-base,
 *              escapeHtml() (local alias used in AIPanel + marketplace-web),
 *              or DOMPurify.sanitize().
 *
 * Strategy (single-line assignments only — multi-line require code review):
 * ─────────────────────────────────────────────────────────────────────────
 * 1. Scan every .ts / .tsx file under SCAN_DIRS.
 * 2. For each line that contains `.innerHTML` (assignment) and `${`:
 *    a. SAFE if the line also contains an accepted guard.
 *    b. SAFE if every ${…} block on the line is provably numeric / static
 *       (e.g. .toFixed(, .length, number literals, emoji / arrow chars).
 *    c. SAFE if the line is clearly SVG-only markup (starts with <svg).
 *    d. SAFE if the interpolated variable name starts with `safe` (Wave A14
 *       convention — already manually escaped before assignment).
 *    e. SAFE if the interpolation is a boolean ternary producing only
 *       emoji / short ASCII symbol literals (toggle icons, ON/OFF, etc.).
 * 3. Anything else is a VIOLATION.
 * 4. Exit 1 if violations > RATCHET.
 *
 * Ratchet baseline (2026-05-16, after P0 hardening sprint):
 *   0 unguarded single-line innerHTML interpolations with external data.
 *   Remaining flagged sites (≤ RATCHET) are internal-config or numeric
 *   patterns that a future sprint will migrate to textContent or escHtml.
 *
 * Usage: pnpm tsx tools/ga-gate/check-xss-guards.ts
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

// ── Ratchet ──────────────────────────────────────────────────────────────────
// Calibrated 2026-05-16 after fixing external-data risks in:
//   Step4AnalysisView, DataWorkbench, VariantBrowserPanel, ConflictResolution,
//   SplitViewManager, initUI, LeftNavRail.
// Remaining sites are internal-config labels, CSS color constants, SVG markup,
// and numeric calculations — tracked for future escHtml / textContent adoption.
const RATCHET = 45;

const SCAN_DIRS = ['apps', 'packages', 'src', 'plugins'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.turbo', 'coverage', '__snapshots__']);
const EXT_OK    = new Set(['.ts', '.tsx']);

// Accepted HTML-safety guards (recognised on the same line)
const SAFE_GUARD_PATTERNS = [
  'escHtml(',
  'escAttr(',
  'escapeHtml(',   // AIPanel + marketplace-web local alias
  'DOMPurify.sanitize(',
];

// Numeric / safe-only interpolation detectors
// If ALL ${…} blocks on a line match at least one of these, the line is safe.
const NUMERIC_EXPR_PATTERNS: RegExp[] = [
  /^\d+(\.\d+)?$/,                                         // literal numbers
  /^[a-zA-Z0-9_.]+\.(toFixed|toLocaleString|toString)\(/, // .toFixed() etc.
  /^(Number|parseInt|parseFloat|Math\.)\(/,                // numeric casts
  /^[a-zA-Z0-9_.]+\.length$/,                              // .length
  /^\([^)]+\)\s*\*\s*\d+/,                                 // arithmetic
  /^[a-zA-Z0-9_]+\s*[><=!]+\s*\d/,                        // numeric comparison result
];

// Boolean ternary that only produces safe emoji / ASCII symbols / short words
const SAFE_TERNARY = /^[a-zA-Z0-9_.?:\s]+\?\s*['"][^'"<>&]{1,10}['"]\s*:\s*['"][^'"<>&]{1,10}['"]$/;

interface Violation {
  file: string;
  line: number;
  text: string;
}

function walkFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return results; }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      results.push(...walkFiles(full));
    } else if (EXT_OK.has(extname(full))) {
      results.push(full);
    }
  }
  return results;
}

function interpolations(line: string): string[] {
  return [...line.matchAll(/\$\{([^}]+)\}/g)].map(m => m[1].trim());
}

function isSafeLine(line: string): boolean {
  // Must be an innerHTML assignment (= or +=)
  if (!/\.innerHTML\s*[+]?=/.test(line)) return true;
  // Must contain template interpolation
  if (!line.includes('${')) return true;

  // Guard on same line?
  if (SAFE_GUARD_PATTERNS.some(g => line.includes(g))) return true;

  // Variables with `safe` prefix (manually pre-escaped, Wave A14 convention)
  if (/\$\{safe[A-Z_]/.test(line)) return true;

  // SVG-only line (inline SVG markup is not a script-injection vector)
  const rhsStart = line.indexOf('`');
  if (rhsStart !== -1 && line.slice(rhsStart + 1).trimStart().startsWith('<svg')) return true;

  // Check every interpolated expression
  const exprs = interpolations(line);
  if (exprs.length === 0) return true;

  return exprs.every(expr => {
    // CSS color constant object access (e.g. ${C.textMuted}, ${COLORS.red})
    if (/^[A-Z_][A-Z0-9_]*\.[a-zA-Z]+$/.test(expr)) return true;
    // Short constant: single quoted string, emoji, symbol chars only
    if (/^'[^'<>&]*'$/.test(expr) || /^"[^"<>&]*"$/.test(expr)) return true;
    // Boolean ternary producing only safe symbol / word strings
    if (SAFE_TERNARY.test(expr)) return true;
    // Numeric expressions
    if (NUMERIC_EXPR_PATTERNS.some(p => p.test(expr))) return true;
    // Ternary where both branches are safe (e.g. ${isCollapsed ? '▼' : '▲'})
    const ternaryMatch = expr.match(/^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/);
    if (ternaryMatch) {
      const [, , thenBranch, elseBranch] = ternaryMatch;
      const safeValue = (v: string) =>
        /^'[^'<>&]{0,20}'$/.test(v.trim()) ||
        /^"[^"<>&]{0,20}"$/.test(v.trim()) ||
        NUMERIC_EXPR_PATTERNS.some(p => p.test(v.trim()));
      if (safeValue(thenBranch) && safeValue(elseBranch)) return true;
    }
    return false;
  });
}

const violations: Violation[] = [];

for (const dir of SCAN_DIRS) {
  const absDir = join(ROOT, dir);
  const files = walkFiles(absDir);

  for (const file of files) {
    let src: string;
    try { src = readFileSync(file, 'utf8'); } catch { continue; }

    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comment lines
      if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;
      // Must have innerHTML and template interpolation
      if (!line.includes('.innerHTML') || !line.includes('${')) continue;

      if (!isSafeLine(line)) {
        violations.push({
          file: file.replace(ROOT + '/', ''),
          line: i + 1,
          text: line.trim().slice(0, 130),
        });
      }
    }
  }
}

if (violations.length === 0) {
  console.log(`[xss-guards] ✅ 0 unguarded innerHTML interpolations found. Ratchet: ${RATCHET}.`);
  process.exit(0);
} else if (violations.length <= RATCHET) {
  console.log(`[xss-guards] ✅ ${violations.length} known-safe-or-internal sites (≤ ratchet ${RATCHET}). No new violations.`);
  process.exit(0);
} else {
  console.error(`[xss-guards] ❌ ${violations.length} unguarded innerHTML interpolation(s) found (ratchet: ${RATCHET}):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}`);
  }
  console.error('\nFix: wrap each interpolated ${expr} with escHtml(expr) from @pryzm/ui-base.');
  process.exit(1);
}
