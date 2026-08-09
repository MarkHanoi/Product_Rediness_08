#!/usr/bin/env tsx
/**
 * tools/ga-gate/check-visibility-intent-not-ui.ts
 *
 * §P7-UNENFORCED (L-812) — "Visibility intent ≠ UI state", as far as it is
 * honestly checkable, and NO FURTHER.
 *
 * C01 §1/§5 list `packages/visibility/__tests__/intent-not-ui.test.ts` as the
 * hard-fail gate for P7. **That test has never existed** (the package has
 * `IsolationIntent.test.ts` and `visibility-intent.test.ts`, neither of which
 * asserts the separation). P7 had no enforcement.
 *
 * ═══ READ THIS BEFORE TRUSTING THE EXIT CODE ═════════════════════════════════
 *
 * P7 IS A SEMANTIC PROPERTY AND CANNOT BE FULLY STATICALLY CHECKED.
 *
 * "Visibility intent is a domain concept, not UI state" is a claim about what a
 * value MEANS — whether a boolean is a durable, per-view, persisted, replicated
 * design decision, or an ephemeral rendering flag. No regex can tell those apart,
 * and neither can a type checker: they are the same `boolean`.
 *
 * Shipping something that LOOKS like enforcement here would be worse than
 * shipping nothing, because a green tick would be read as "P7 holds" when the
 * gate never examined the thing P7 is about. So this gate makes two narrow,
 * genuinely decidable claims and refuses the third.
 *
 *   ✅ ARM A — DECIDABLE, HARD-FAIL AT ZERO.
 *      The visibility DOMAIN package contains no UI. `packages/visibility/src/**`
 *      must not touch a DOM global or DOM type, must not import a UI, renderer,
 *      view-state or app/plugin package, and must not import THREE. If the domain
 *      package itself reaches for the DOM, the separation is definitionally
 *      broken, and that IS mechanically visible.
 *
 *   ⚠️ ARM B — PROXY ONLY, RATCHETED, NOT A PROOF.
 *      UI code assigning `x.visible = …` directly. The intended path is to
 *      express an intent (`@pryzm/visibility`) and let the committer resolve it
 *      onto the scene. A direct assignment from a panel is UI owning visibility
 *      state — which is exactly what P7 forbids.
 *      **BUT** the same syntax is also used for transient gizmos, drag previews
 *      and hover affordances, which are legitimately ephemeral UI and are NOT
 *      what P7 is about. This gate CANNOT distinguish the two. It is therefore a
 *      TRIPWIRE ON GROWTH at a frozen baseline, and its passing means only
 *      "no new direct visibility pokes", never "P7 holds".
 *
 *   ❌ NOT CHECKED — stated so nobody assumes otherwise.
 *      • Whether a visibility intent is correctly persisted / per-view scoped.
 *      • Whether a plugin's intent survives a view template change.
 *      • Whether the AI expresses intent rather than mutating the scene.
 *      Those need behavioural tests in `packages/visibility/__tests__/`, owned by
 *      whoever owns that package. This gate does not pretend to cover them.
 *
 * Exit: 0 = arm A clean and arm B at/below baseline · 1 = violated · 2 = misconfigured
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { scanFiles, tallyBy, type Match } from './lib/sourceScan.js';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const LABEL = 'visibility-intent-not-ui';

const DOMAIN_DIR = 'packages/visibility/src';

/** The domain package is small (18 files). The floor only guards a moved root. */
const DOMAIN_MIN_FILES = 10;
/** The consumer sweep covers ~2.5k files. */
const CONSUMER_MIN_FILES = 400;

// ═══ ARM A — the domain package must contain no UI ══════════════════════════
const ARM_A_RULES: ReadonlyArray<{ id: string; re: RegExp; why: string }> = [
  {
    id: 'dom-global',
    why: 'A domain package that reads the DOM is UI, whatever the folder is called.',
    re: /(?<![\w.$])(?:document|localStorage|sessionStorage|navigator|customElements)\s*\.|(?<![\w.$])window\s*[.[]/,
  },
  {
    id: 'dom-type',
    why: 'A DOM type in a domain signature makes the domain unusable headless.',
    re: /(?<![\w.$])(?:HTMLElement|HTMLCanvasElement|HTMLDivElement|SVGElement|ShadowRoot|DocumentFragment|MouseEvent|KeyboardEvent|PointerEvent|CustomEvent|DOMRect|ResizeObserver|MutationObserver)\b/,
  },
  {
    id: 'ui-import',
    why: 'The domain must not depend on any presentation layer — that is the separation.',
    re: /^\s*(?:import|export)\b[^\n]*?from\s*['"](?:three(?:\/[^'"]*)?|@pryzm\/(?:ui|ui-base|renderer|renderer-three|render-runtime|view-state|editor|plugin-sdk)(?:\/[^'"]*)?)['"]/,
  },
  {
    id: 'escape-import',
    why: 'A relative import climbing out of the package is an undeclared dependency.',
    re: /^\s*(?:import|export)\b[^\n]*?from\s*['"]\.\.\/\.\.\/(?!src\b)/,
  },
];

const armA: Array<{ id: string; m: Match }> = [];
let domainScanned = 0;

if (!existsSync(join(REPO_ROOT, DOMAIN_DIR))) {
  console.error(`\n[${LABEL}] MISCONFIGURED (exit 2) — ${DOMAIN_DIR} does not exist at ${REPO_ROOT}.`);
  process.exit(2);
}

for (const rule of ARM_A_RULES) {
  const res = scanFiles({
    root: REPO_ROOT,
    dirs: [DOMAIN_DIR],
    pattern: rule.re,
    minFiles: DOMAIN_MIN_FILES,
    label: `${LABEL}/armA`,
    exclude: (rel) => rel.endsWith('.d.ts') || /(^|\/)__tests__\//.test(rel) || /\.(spec|test)\.ts$/.test(rel),
  });
  domainScanned = res.filesScanned;
  for (const m of res.matches) {
    if (/^\s*(\/\/|\*|\/\*)/.test(m.text)) continue;
    armA.push({ id: rule.id, m });
  }
}

// ═══ ARM B — UI poking scene visibility directly ════════════════════════════
/**
 * ⚠ SHRINK-ONLY. Frozen 2026-08-09 on the first run: **43**.
 *
 * Scope is UI code only (any path with a `ui/` segment), because committers
 * assigning `.visible` are the PRESCRIBED consumers of an intent — flagging them
 * would invert P7 the same way flagging command handlers would have inverted P6.
 *
 * TWO NUMBERS, BOTH TRUE, NEITHER A DISCREPANCY:
 *   77  repo-wide across src + apps + plugins, committers and tools included
 *   43  UI-scoped, which is what this gate enforces
 * The 34-site difference is committer, tool and engine-bootstrap code, and it is
 * deliberately OUT OF SCOPE — not hidden. Stated here because an unexplained gap
 * between a gate's number and a hand-grep's number is how people stop believing
 * gates.
 *
 * The top offender is `ProjectVisibilitySection.ts` (13) — a panel that owns
 * project-wide visibility directly. That one is very likely a genuine P7
 * violation. Others in the list (FloatingObjectCarousel, drag handlers) are
 * near-certainly legitimate transient gizmos.
 *
 * The gate CANNOT separate them, so do not report this as "43 P7 violations".
 * It is "43 direct visibility assignments in UI code, an unknown fraction of
 * which are P7 violations" — an honest number, still worth ratcheting, and it
 * only gets more honest as it shrinks.
 */
const MAX_DIRECT_VISIBLE = Number(process.env.PRYZM_P7_MAX_DIRECT_VISIBLE ?? 43);

const CONSUMER_DIRS = ['src', 'apps', 'plugins'].filter((d) => existsSync(join(REPO_ROOT, d)));

const armB = scanFiles({
  root: REPO_ROOT,
  dirs: CONSUMER_DIRS,
  pattern: /\.visible\s*=(?!=)/,
  minFiles: CONSUMER_MIN_FILES,
  label: `${LABEL}/armB`,
  exclude: (rel) =>
    !/(^|\/)ui\//.test(rel)
    || rel.endsWith('.d.ts')
    || /(^|\/)(__tests__|__fixtures__|__mocks__)\//.test(rel)
    || /\.(spec|test)\.tsx?$/.test(rel)
    || /(^|\/)(committer|committers)\//.test(rel),
});

const directVisible = armB.matches.filter((m) => !/^\s*(\/\/|\*|\/\*)/.test(m.text));

// ═══ Report ═════════════════════════════════════════════════════════════════
console.log(`[${LABEL}] §P7-UNENFORCED (L-812) — visibility intent ≠ UI state (C01 §1 P7)`);
console.log(`[${LABEL}] ARM A (decidable, hard 0): ${DOMAIN_DIR} · ${domainScanned} files · UI leaks: ${armA.length}`);
console.log(`[${LABEL}] ARM B (proxy, ratcheted):  UI files ${armB.filesScanned} · direct \`.visible =\` assignments: ${directVisible.length}/${MAX_DIRECT_VISIBLE}`);
console.log(`[${LABEL}] NOT CHECKED: persistence, per-view scoping, AI intent path — see header. A pass here is NOT "P7 holds".`);

let failed = false;

if (armA.length) {
  console.error(`\n  ARM A violations — the visibility DOMAIN package contains UI:`);
  for (const a of armA) console.error(`      [${a.id}] ${a.m.file}:${a.m.line}  ${a.m.text}`);
  console.error(
    `\n[${LABEL}] FAIL — threshold ZERO, no ratchet. Measured clean on 2026-08-09, so any\n` +
    `violation is new. packages/visibility describes WHAT should be visible; the renderer\n` +
    `and committers decide HOW. Move the presentation code out of the domain package.`,
  );
  failed = true;
}

if (directVisible.length > MAX_DIRECT_VISIBLE) {
  console.error(`\n  ARM B — all ${directVisible.length} direct \`.visible =\` assignment(s) in UI (baseline exceeded):`);
  for (const m of directVisible) console.error(`      ${m.file}:${m.line}  ${m.text}`);
  console.error(
    `\n[${LABEL}] FAIL — ${directVisible.length} direct visibility assignment(s) from UI, baseline ${MAX_DIRECT_VISIBLE}.\n` +
    `If this is DESIGN visibility (a level, a category, an element the user hid), express it\n` +
    `as an intent via @pryzm/visibility so it persists, replicates and survives a view change.\n` +
    `If it is genuinely a transient gizmo, it still counts against the baseline — reduce\n` +
    `elsewhere or move the toggle behind the overlay layer. Do NOT raise this threshold.`,
  );
  failed = true;
} else if (directVisible.length) {
  console.log('\n  ARM B by file (declared debt, top 15):');
  for (const [k, n] of tallyBy(directVisible, (m) => m.file).slice(0, 15)) {
    console.log(`      ${String(n).padStart(4)}  ${k}`);
  }
}

if (failed) process.exit(1);
console.log(`\n[${LABEL}] ✓ arm A clean (0), arm B within baseline (${directVisible.length}/${MAX_DIRECT_VISIBLE}).`);
