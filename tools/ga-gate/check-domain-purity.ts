#!/usr/bin/env tsx
/**
 * tools/ga-gate/check-domain-purity.ts
 *
 * §P5-UNENFORCED (L-812) — "Schemas are pure", actually checked.
 *
 * C01 §1/§5 have listed `scripts/ci-check-domain-purity.ts` as a hard-fail gate
 * since 2026-05-02. **That file has never existed.** P5 was maintained entirely
 * by comment headers: forty-odd files in `packages/schemas/src/` open with
 * "L0-pure: Zod-only. No I/O, no THREE, no DOM." Nothing verified the claim.
 *
 * ─── Why purity is load-bearing, not aesthetic ───────────────────────────────
 * `packages/schemas` is L0 — every other layer imports it. A single `import
 * 'node:fs'` there makes the whole client bundle unbuildable for the browser; a
 * single `THREE` import drags the renderer into the AI worker, the sync server
 * and the CLI. The blast radius of an L0 impurity is the entire dependency graph,
 * which is exactly why it is the one package that must be checked mechanically
 * rather than by convention.
 *
 * ─── What is forbidden ───────────────────────────────────────────────────────
 *   • Any Node builtin           — node:fs, fs, path, crypto, http, child_process…
 *   • THREE, in any spelling     — 'three', 'three/*', '@pryzm/renderer-three'
 *   • Any DOM global or DOM type — document, window, HTMLElement, localStorage…
 *   • Any non-schemas @pryzm/*   — L0 may depend on nothing in this monorepo
 *   • Network / timer I/O        — fetch, XMLHttpRequest, WebSocket, setInterval
 *
 * Comment lines are ignored. That is deliberate and it is the whole reason the
 * headers above do not trip the gate — but it also means a violation hidden in a
 * comment is invisible, which is correct: a comment does not execute.
 *
 * ─── HARD-FAIL AT ZERO, no ratchet ───────────────────────────────────────────
 * Every other gate written today ratchets, because every other one found real
 * debt. This one found NONE (measured 0), so a ratchet would be strictly worse:
 * it would permit the first violation. A gate should ratchet only where debt
 * already exists. Freezing a clean invariant at zero is the point of having it.
 *
 * Exit: 0 = pure · 1 = impurity found · 2 = scan misconfigured
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { scanFiles, type Match } from './lib/sourceScan.js';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const LABEL = 'domain-purity';

/** The L0 package. Anything added here must hold the same invariant. */
const PURE_DIRS = ['packages/schemas/src'].filter((d) => existsSync(join(REPO_ROOT, d)));

/**
 * The schemas tree is ~300 files. A floor of 100 catches a moved/renamed source
 * root. Below it the scan exits 2 — MISCONFIGURED, never "pure".
 */
const MIN_FILES = 100;

const NODE_BUILTINS = [
  'fs', 'fs/promises', 'path', 'os', 'crypto', 'http', 'https', 'net', 'dns',
  'child_process', 'worker_threads', 'stream', 'zlib', 'url', 'util', 'events',
  'buffer', 'process', 'readline', 'tls', 'cluster', 'vm', 'module', 'assert',
  'perf_hooks', 'timers', 'string_decoder', 'querystring', 'tty', 'v8',
];

interface Rule {
  readonly id: string;
  readonly why: string;
  readonly re: RegExp;
  /**
   * Re-test the line with string literals blanked out. Required for the
   * identifier rules: the first run flagged
   *   `'L2-spatial-hierarchy', // Site → Building → Level → Apt → Room → Element`
   * because the word "Element" appears in a prose comment inside a string array.
   * The IMPORT rules must NOT do this — the module specifier they match IS a
   * string literal.
   */
  readonly ignoreStrings?: boolean;
}

/** Blank the contents of string/template literals, preserving line length. */
function blankLiterals(line: string): string {
  return line.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, (s) => s[0]! + ' '.repeat(Math.max(0, s.length - 2)) + s[0]!);
}

const RULES: readonly Rule[] = [
  {
    id: 'node-builtin-import',
    why: 'L0 must build for the browser, the worker AND the server. A Node builtin breaks two of the three.',
    re: new RegExp(
      `^\\s*(?:import|export)\\b[^\\n]*?from\\s*['"](?:node:[a-z_/]+|${NODE_BUILTINS.map((b) => b.replace('/', '\\/')).join('|')})['"]`,
    ),
  },
  {
    id: 'node-builtin-require',
    why: 'Same as above, via require().',
    re: new RegExp(`\\brequire\\s*\\(\\s*['"](?:node:[a-z_/]+|${NODE_BUILTINS.join('|')})['"]\\s*\\)`),
  },
  {
    id: 'three-import',
    why: 'P2 + P5: THREE belongs to packages/renderer-three alone, and never to L0.',
    re: /^\s*(?:import|export)\b[^\n]*?from\s*['"](?:three(?:\/[^'"]*)?|@pryzm\/renderer-three(?:\/[^'"]*)?)['"]/,
  },
  {
    id: 'dom-global',
    why: 'L0 runs in a worker and in Node. A DOM global is a runtime crash there, not a type error.',
    re: /(?<![\w.$])(?:document|localStorage|sessionStorage|navigator|history|customElements)\s*\.|(?<![\w.$])window\s*[.[]/,
    ignoreStrings: true,
  },
  {
    id: 'dom-type',
    why: 'A DOM type in an L0 signature forces every consumer to pull in lib.dom.',
    // NOTE the omissions: bare `Node`, `Element` and `Event` are NOT listed.
    // They are ordinary English words and ordinary BIM domain nouns; matching
    // them produced a prose false positive on the first run
    //   `'L2-spatial-hierarchy', // Site → Building → Level → Apt → Room → Element`
    // and found no real DOM dependency. Specific DOM types only — a gate that
    // cries wolf on documentation gets muted, and then it protects nothing.
    re: /(?<![\w.$])(?:HTMLElement|HTMLCanvasElement|HTMLDivElement|HTMLInputElement|HTMLImageElement|SVGElement|DocumentFragment|CustomEvent|MouseEvent|KeyboardEvent|PointerEvent|WheelEvent|CanvasRenderingContext2D|WebGL2RenderingContext|ShadowRoot|DOMRect|DOMMatrix|MutationObserver|ResizeObserver|IntersectionObserver)\b/,
    ignoreStrings: true,
  },
  {
    id: 'io-call',
    why: 'P5 says zero I/O. Network and timers are I/O.',
    re: /(?<![\w.$])(?:fetch|XMLHttpRequest|WebSocket|EventSource|setInterval|setTimeout|queueMicrotask|requestAnimationFrame)\s*\(/,
    ignoreStrings: true,
  },
  {
    id: 'cross-package-import',
    why: 'L0 sits beneath everything; it may import nothing from this monorepo but its own subpaths.',
    re: /^\s*(?:import|export)\b[^\n]*?from\s*['"](@pryzm\/(?!schemas)[^'"]+)['"]/,
  },
];

// A single pass would be cheaper but rule-by-rule keeps the report attributable —
// "3 dom-global, 1 three-import" is actionable; "4 impurities" is not.
const all: Array<{ rule: Rule; m: Match }> = [];
let scanned = 0;

for (const rule of RULES) {
  const res = scanFiles({
    root: REPO_ROOT,
    dirs: PURE_DIRS,
    pattern: rule.re,
    minFiles: MIN_FILES,
    label: LABEL,
    exclude: (rel) =>
      rel.endsWith('.d.ts')
      || /(^|\/)(__tests__|__fixtures__|__mocks__)\//.test(rel)
      || /\.(spec|test)\.tsx?$/.test(rel),
  });
  scanned = res.filesScanned;
  for (const m of res.matches) {
    // Comment lines do not execute. The forty "no THREE, no DOM" headers in this
    // tree would otherwise make the gate report the documentation as the defect.
    if (/^\s*(\/\/|\*|\/\*)/.test(m.text)) continue;
    // Identifier rules re-test with literals blanked; see Rule.ignoreStrings.
    if (rule.ignoreStrings && !rule.re.test(blankLiterals(m.text))) continue;
    all.push({ rule, m });
  }
}

console.log(`[${LABEL}] §P5-UNENFORCED (L-812) — schemas are pure (C01 §1 P5)`);
console.log(`[${LABEL}] scope: ${PURE_DIRS.join(', ')} · files scanned: ${scanned} · rules: ${RULES.length} · impurities: ${all.length}`);

if (PURE_DIRS.length === 0) {
  console.error(`\n[${LABEL}] MISCONFIGURED (exit 2) — packages/schemas/src does not exist at ${REPO_ROOT}.`);
  process.exit(2);
}

if (all.length === 0) {
  console.log(`\n[${LABEL}] ✓ packages/schemas is pure — 0 impurities across ${scanned} files. HARD-FAIL AT ZERO.`);
  process.exit(0);
}

console.error('\n  Impurities by rule:');
const byRule = new Map<string, number>();
for (const a of all) byRule.set(a.rule.id, (byRule.get(a.rule.id) ?? 0) + 1);
for (const [id, n] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) {
  console.error(`      ${String(n).padStart(4)}  ${id} — ${RULES.find((r) => r.id === id)!.why}`);
}
console.error('\n  Sites:');
for (const a of all) console.error(`      [${a.rule.id}] ${a.m.file}:${a.m.line}  ${a.m.text}`);
console.error(
  `\n[${LABEL}] FAIL — ${all.length} impurity/impurities in the L0 package. Threshold is ZERO and\n` +
  `there is no ratchet here on purpose: this invariant was measured CLEAN on 2026-08-09,\n` +
  `so any violation is new. Move the impure code up a layer — do not add an exemption.`,
);
process.exit(1);
