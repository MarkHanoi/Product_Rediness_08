#!/usr/bin/env tsx
/**
 * tools/ga-gate/check-layer-boundaries.ts
 *
 * §FIX-LAYER-GATE-BLIND (L-809) — the layer rule, actually enforced.
 *
 * ─── What was wrong ──────────────────────────────────────────────────────────
 * The layer rule ("a layer may import from any LOWER layer, never a higher one")
 * is the backbone of this architecture, and CLAUDE.md credits
 * `eslint-plugin-boundaries` with enforcing it on every commit.
 *
 * It mostly did not. `eslint.config.js` declares `boundaries/elements` and
 * `boundaries/include` but configures **no `import/resolver`**. Boundaries
 * classifies a file by its resolved PATH, so with no resolver it cannot map
 * `@pryzm/geometry-wall` → `packages/geometry-wall/**`. In this monorepo
 * essentially every cross-package import — exactly the ones the rule exists to
 * police — is written that way. The rule was set to `'error'` and silently
 * matched nothing for them.
 *
 * ─── Why this gate does NOT just add a resolver ──────────────────────────────
 * Adding `eslint-import-resolver-typescript` looks like the obvious fix. It is
 * the wrong one here, for a reason that matters:
 *
 * **Resolver-based checking is what produced the inconsistency in the first
 * place.** pnpm symlinks some `@pryzm/*` packages into a given package's
 * `node_modules` and not others — `@pryzm/geometry-kernel` is not resolvable
 * from `geometry-wall` at all. A resolver therefore catches a violation in one
 * package and silently skips the identical one next door, with no signal either
 * way. **A gate that fires unpredictably is worse than one that is off**, because
 * people trust it.
 *
 * This gate resolves `@pryzm/X` by reading the `name` field out of every
 * workspace `package.json` and mapping it to that package's directory. That is
 * exact, deterministic, and completely independent of node resolution, symlinks
 * and install state. It also needs no new dependency.
 *
 * ─── The second finding, which is larger than the first ──────────────────────
 * Turning the rule on revealed that `layerElements` classifies only a fraction
 * of the workspace. A layer gate that can see every import but only knows the
 * layer of a fifth of the code is still mostly decorative. **Coverage is
 * therefore reported as a first-class number alongside violations**, and it
 * ratchets too — otherwise the gate could be made green by classifying less.
 *
 * ─── Ratchets ────────────────────────────────────────────────────────────────
 * Two, both shrink-only, matching the house pattern
 * (`check-command-naming.ts`, `ci-check-no-commandmanager.mjs`):
 *   • MAX_VIOLATIONS  — upward imports between CLASSIFIED packages. May only fall.
 *   • MAX_UNCLASSIFIED — workspace packages with no layer. May only fall.
 *
 * Usage:  tsx tools/ga-gate/check-layer-boundaries.ts
 * Exit:   0 = at or below both baselines · 1 = either grew
 */

import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';

// ── The layer table. Imported, NOT copied ────────────────────────────────────
// Two copies of a layer table drift, and a drifted layer table is worse than no
// gate — it would report confident nonsense. `eslint.config.js` remains the one
// authority for what layer a directory is in.
import { layerElements, allowedDependencies } from '../../eslint.config.js';

interface LayerElement { readonly type: string; readonly pattern: string }
interface AllowRule { readonly from: string; readonly allow: readonly string[] }

const ELEMENTS = layerElements as readonly LayerElement[];
const ALLOW = allowedDependencies as readonly AllowRule[];

/**
 * ⚠ SHRINK-ONLY. Raising any of these to make CI green is the exact failure this
 * gate exists to prevent.
 *
 * ─── Frozen 2026-08-09 (2nd freeze) ──────────────────────────────────────────
 * The FIRST freeze — same day, 28 / 94 — measured against a layer table that was
 * itself wrong. `eslint.config.js` still carried the PRYZM 2 table, in which
 * `persistence-client` and `file-format` sat at L0, BELOW `stores` and
 * `command-bus`. The real edges run the other way (persistence-client → stores /
 * command-bus, 9 times; the reverse, 0 times), so most of that 28 were legal
 * DOWNWARD imports mislabelled as upward. The table has been rewritten to
 * CLAUDE.md's model — see §FIX-LAYER-TABLE-INVERTED in eslint.config.js — and
 * these are the numbers against the corrected one.
 *
 * That is the lesson worth keeping: the first number a new gate prints is a
 * measurement of the gate, not of the code.
 *
 * ─── VIOLATIONS = 102 ────────────────────────────────────────────────────────
 * Upward imports between CLASSIFIED packages. Unlike the first freeze, every one
 * of these is a real finding against the declared architecture:
 *
 *      39  L2 → L6    packages reaching into plugins/annotations + plugins/structural
 *      14  L2 → L4    core-app-model → scene-committer · command-registry → persistence-client
 *      12  L3 → L4    file-format → persistence-client · runtime-composer → renderer
 *      11  L3 → L6    runtime-composer → bcf / ifc-* / rhino-import · file-format → annotations
 *       9  L4 → L6    persistence-client → plugins/annotations
 *       9  L1 → L2    spatial-index → core-app-model + room-topology
 *       6  L2 → L3    core-app-model / geometry-* residue
 *       1  L3 → L7    runtime-composer → apps/editor
 *       1  L6 → L7    a plugin reaching into apps/editor
 *
 * ⚠ RECONCILED 2026-08-11 (W1-1). This paragraph used to read "VIOLATIONS = 133"
 * with a breakdown in the PRE-RENUMBER layer names (plugins as L7, apps as L5),
 * while the constant twelve lines below already read 102. A gate whose own
 * comments disagree with its own thresholds cannot be trusted by the next reader,
 * so the prose is now the measured output of THIS file on THIS tree. The 133 → 102
 * drop is not work anybody did: §FIX-LAYER-TABLE-INVERTED moved `frame-scheduler`
 * L3 → L1, which legalised ~32 of the old `L2 → L3` edges in one stroke (that pair
 * fell 38 → 6). Recording the cause, because an unexplained 31-point fall in a
 * shrink-only ratchet is indistinguishable from someone quietly loosening it.
 *
 * Two root causes remain, both documented at the table in eslint.config.js:
 *   • `→ @pryzm/plugin-annotations` (59 across L2/L3/L4) — the
 *     `core-app-model ↔ plugin-annotations` cycle recorded in L-810. This is the
 *     one cluster that was upward under BOTH tables, and the largest single win
 *     available: cutting the cycle removes ~58 % of the count.
 *   • `runtime-composer` reaching up (16) — it is the composition root (P1) and
 *     therefore sits above everything it composes, not at L3.
 *   (The third — `→ frame-scheduler`, ~29 — is CLOSED by the L3 → L1 move above.)
 *
 * ─── UNCLASSIFIED = 13 ───────────────────────────────────────────────────────
 * Workspace packages with no layer. Was 94 of 158 (40 % coverage); now 13 of 158
 * (92 %). The remainder are deliberately unplaced and enumerated at the bottom of
 * `layerElements`: eight backend-only packages outside the client layer model,
 * four build/CI tools, and one lint fixture. Guessing a layer for these would emit
 * false violations forever, which is strictly worse than admitting the gap.
 * Coverage ratchets, or the gate could be made green by classifying less.
 *
 * ─── SDK BYPASS = 181 (frozen 171 on 2026-08-09; see the dated log below) ─────
 * A SEPARATE invariant, deliberately not folded into VIOLATIONS. CLAUDE.md says a
 * plugin "may import L6 only" — `@pryzm/plugin-sdk` and nothing else. That is
 * NARROWER than the layer rule: a plugin reaching straight into `renderer-three`
 * goes DOWNWARD, so it is legal under the layer rule and illegal under this one.
 * Plugins make ~630 imports of the SDK and 181 that go around it — renderer-three
 * ×84, command-registry ×39, core-app-model ×27, scene-committer ×19 and a tail.
 * Folding those into VIOLATIONS would bury 102 layer findings under 181 facade
 * findings and make both numbers unreadable, so the strict rule is frozen here on
 * its own shrink-only ratchet instead of being dropped. Both are enforced; each
 * says what it means.
 *
 * ⚠ RECONCILED 2026-08-11 (W1-1). This heading said 171 while the constant said
 * 178 and the tree measured 181 — three numbers for one invariant. It now states
 * the CURRENT figure, and the ten-line dated log immediately above the constant
 * carries the history (171 → 172 → 173 → 178 → 181). The per-target tail is
 * restated too: command-registry was ×29 at the 171 freeze and is ×39 today, and
 * every one of those ten additions is a batch bridge with its own paragraph below.
 */
const MAX_VIOLATIONS = Number(process.env.PRYZM_LAYER_MAX_VIOLATIONS ?? 102);
const MAX_UNCLASSIFIED = Number(process.env.PRYZM_LAYER_MAX_UNCLASSIFIED ?? 13);
// 171 → 172 (2026-08-10): c1902a5a added UpdateWallsSystemTypeBatch.ts, which
// imports @pryzm/command-registry via the SAME F-1.3 bridge pattern as its four
// sibling wall handlers already inside the baseline (CascadeWallBaseline,
// CreateWallsOnAllSlabs, UpdateWallBaseline, UpdateWallSystemType). This is the
// established handler shape, not a new kind of breach — the real debt is the
// PATTERN, tracked as the plugin→SDK facade goal. Any further +1 needs its own
// dated justification here; undocumented bumps are a ratchet failure.
// 172 → 173 (2026-08-10, ADR-0314): UpdateWallsColorBatch.ts — the §FEAT-WALL-
// COLOR-BATCH bridge, byte-for-byte the same F-1.3 shape as its type-batch
// sibling one file over (172's own justification). plugin-sdk re-exports
// NOTHING from @pryzm/command-registry today, so "widen the facade" here would
// create a brand-new SDK→legacy-command-registry coupling rather than remove a
// bypass; the honest count is +1 under the same tracked pattern. The debt
// remains the PATTERN (legacy bridges from plugin handlers), not this file.
// 173 → 178 (2026-08-10, ADR-0315 U-phases + founder asks 1-4): five more batch
// bridges of the SAME tracked F-1.3 shape as 172/173's justifications — each a
// plugin handler forwarding to a command-registry batch command so the RAC chat
// buys ONE undo entry per mass mutation: UpdateWallsRakeBatch.ts,
// AddWallLayerBatch.ts (plugins/wall); UpdateWindowsSystemTypeBatch.ts,
// CreateWindowsParametricBatch.ts (plugins/window); UpdateDoorsSystemTypeBatch.ts
// (plugins/door — U4.3). Same ruling as 173: plugin-sdk re-exports nothing from
// command-registry, so widening the facade would mint a new SDK→legacy coupling;
// the tracked debt remains the bridge PATTERN. Shrink resumes when the batch
// verbs migrate to first-class SDK routes (U-phase backlog).
//
// ─── 178 → 181 (2026-08-11, W1-1) ────────────────────────────────────────────
// Three more bridges of the SAME tracked F-1.3 shape. Each is byte-for-byte the
// door/window/wall batch bridge: import ONE command class from
// @pryzm/command-registry, construct it, hand it to `window.commandManager` so a
// mass mutation costs ONE undo entry (ADR-0314), re-broadcast the command's own
// partial-failure report (§CONTEXT-DATA-HONESTY), return `{forward:[],inverse:[]}`.
//
//   • plugins/slab/src/handlers/UpdateSlabsSystemTypeBatch.ts     (63f22496, U7.2)
//   • plugins/ceiling/src/handlers/UpdateCeilingsSystemTypeBatch.ts (63f22496, U7.2)
//   • plugins/view/src/handlers/DeleteElementsBatch.ts            (f5f3a5a1, U9.2)
//
// ⚠ THE FIX WAS ATTEMPTED FIRST AND REFUSED ON EVIDENCE. The instruction this
// gate prints — "WIDEN THE FACADE" — is the right instruction for almost every
// bypass it catches, and it is the WRONG one for @pryzm/command-registry
// specifically. Four independent reasons, each checkable in about a minute, so
// that the next person does not re-litigate this from scratch:
//
//   1. IT IS A PACKAGE CYCLE, and this repo has been bitten by exactly this.
//      plugin-sdk → command-registry → plugin-annotations → plugin-sdk.
//      Leg 2 and leg 3 are both declared in package.json today
//      (command-registry deps include @pryzm/plugin-annotations; annotations'
//      FIRST dep is @pryzm/plugin-sdk). A `export … from '@pryzm/command-registry'`
//      in the SDK barrel closes that ring AT MODULE LOAD, which is the documented
//      white-screen failure mode here (circular barrel → binding observed as
//      `undefined` before it is initialised). Trading three counted bypasses for
//      an uncounted boot hazard is not a fix.
//
//   2. IT WOULD PUT L5 ABOVE L6. command-registry depends on
//      @pryzm/plugin-annotations, an L6 PLUGIN. Re-exporting through the L5 facade
//      makes the SDK transitively import a plugin — the layer rule inverted at the
//      one package whose entire job is to be the boundary. Note honestly: THIS GATE
//      WOULD NOT CATCH IT (it reads source specifiers, and plugin-sdk → command-registry
//      reads as a legal downward L5 → L2 edge). The violation would be real and
//      invisible. That is worse than the bypass it replaces, which is at least counted.
//
//   3. THE SDK IS A PUBLISHED, VERSION-LOCKED PUBLIC SURFACE.
//      plugin-sdk is v1.0.0 with `publishConfig.name = "@pryzm/sdk"`, access public;
//      ADR-0038 §D locks that surface for v1.x. @pryzm/command-registry is
//      `"private": true`. C07 §1.1 requires the facade "re-export only … what is
//      safe to expose externally" and "NOT expose internal implementation details
//      that are subject to change". Publishing ~40 legacy BIM command classes as
//      locked v1.x public API fails both clauses.
//
//   4. THE TARGET IS SCHEDULED FOR DELETION. `CommandManager`
//      (packages/command-registry/src/CommandManagerImpl.ts:53) carries `@deprecated
//      TODO(E-finish.3)` and, in its own header, "Do NOT add new call sites — use
//      the bus instead." C14 is LEGACY-ELIMINATION. Pinning a delete-scheduled class
//      into a locked public contract would make it undeletable, converting a debt
//      with an exit into a permanent one.
//
// So the honest count is +3 under the pattern already tracked at 172/173/178, NOT
// a new kind of breach and NOT a laundered one.
//
// ─── THE ACTUAL EXIT, so this is a debt with a name and not a parking space ───
// The bridge needs exactly two things: the command CONSTRUCTOR and the legacy
// dispatcher. Widening the facade fails because it drags the constructor DOWNWARD
// through the SDK. The shape that works is the inversion: command-registry
// REGISTERS its batch constructors into a name→factory registry owned at L1
// (@pryzm/command-bus), the SDK re-exports only the accessor, and the handler
// asks for `'slab.updateSystemTypeBatch'` by name. Two named exports, no cycle,
// nothing private published, and the registry dies with CommandManager instead of
// outliving it. That work spans command-bus + command-registry + the composition
// root, so it is a U-phase item, not a drive-by. Until it lands, every one of
// these bridges is a +1 here and each needs its own dated paragraph.
const MAX_SDK_BYPASS = Number(process.env.PRYZM_LAYER_MAX_SDK_BYPASS ?? 181);

/**
 * §FIX-RESTRICTED-IMPORT-RATCHET (2026-08-09) — banned third-party dependencies.
 *
 * `eslint.config.js` bans `@thatopen/components` (OBC) outside `plugins/ifc-import/`
 * and `express` outside the server apps. Measured **122** violations, so as a lint
 * 'error' the rule could never be satisfied: `npm run lint` was permanently red, the
 * CI gate was permanently red, and every deploy used the audited bypass.
 *
 * **A rule that can only be bypassed enforces nothing** — worse, it trains people to
 * reach for the bypass, which is exactly what happened on 2026-08-09. The rule is now
 * 'warn' in eslint and enforced HERE as a shrink-only ratchet: countable, attributable
 * to a package, and able to reach green. Strictly stronger than before, not weaker.
 *
 * ⚠ SHRINK-ONLY. This is not permission to add more.
 */
const MAX_RESTRICTED_IMPORTS = Number(process.env.PRYZM_LAYER_MAX_RESTRICTED ?? 113);
// NOTE the denominator: eslint reports 122, this gate 113. Not a discrepancy to
// reconcile — eslint counts per LINE across every file including tests and .d.ts,
// this gate counts resolved specifiers in non-test source. Frozen at THIS gate's
// own measurement, because a ratchet must be comparable with itself.

/** module → the ONLY path prefixes permitted to import it. */
const RESTRICTED_MODULES: ReadonlyArray<{ readonly mod: string; readonly allowed: readonly string[] }> = [
    { mod: '@thatopen/components-front', allowed: ['plugins/ifc-import/'] },
    { mod: '@thatopen/components',       allowed: ['plugins/ifc-import/'] },
    { mod: 'express',                    allowed: ['apps/sync-server/', 'apps/bake-worker/', 'apps/api-gateway/', 'apps/marketplace-api/'] },
];

// ── Workspace map: package name → directory (exact, from package.json) ───────
function workspacePackages(): Map<string, string> {
    const out = execSync('git ls-files -- "packages/*/package.json" "plugins/*/package.json" "apps/*/package.json"', {
        encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    });
    const map = new Map<string, string>();
    for (const file of out.split('\n').map(s => s.trim()).filter(Boolean)) {
        try {
            const name = JSON.parse(readFileSync(file, 'utf8')).name;
            if (typeof name === 'string' && name) map.set(name, dirname(file).replace(/\\/g, '/'));
        } catch { /* an unparseable package.json is its own problem, not this gate's */ }
    }
    return map;
}

/** Glob → RegExp for the simple `dir/**` patterns the layer table uses. */
function patternToRe(pattern: string): RegExp {
    const esc = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\uE000').replace(/\*/g, '[^/]*').replace(/\uE000/g, '.*');
    return new RegExp(`^${esc}$`);
}
const COMPILED = ELEMENTS.map(e => ({ type: e.type, re: patternToRe(e.pattern), pattern: e.pattern }));

function layerOf(path: string): string | null {
    for (const c of COMPILED) if (c.re.test(path)) return c.type;
    return null;
}

// A rule's `from` may be a STRING or an ARRAY (the L5 rule uses an array), and its
// `allow` may contain the wildcard `'*'` (the three L7 rules use it — "anything
// goes downward"). Both were missed by the first draft of this gate, which
// reported 494 violations where the true figure is an order of magnitude lower.
// Recording that here because it is the exact failure this gate is meant to
// prevent in others: a confident number produced by a tool nobody checked.
const ALLOW_MAP = new Map<string, Set<string>>();
for (const rule of ALLOW) {
    const froms = Array.isArray(rule.from) ? rule.from : [rule.from];
    for (const f of froms as readonly string[]) {
        const set = ALLOW_MAP.get(f) ?? new Set<string>();
        for (const a of rule.allow) set.add(a);
        ALLOW_MAP.set(f, set);
    }
}
function isAllowed(from: string, to: string): boolean {
    if (from === to) return true;
    const allowed = ALLOW_MAP.get(from);
    // A `from` layer with no rule is unconstrained by the table — not a violation
    // this gate can assert. Reported under coverage instead.
    if (!allowed) return true;
    return allowed.has('*') || allowed.has(to);
}

// ── Scan ─────────────────────────────────────────────────────────────────────
// Three import forms, all of which are real edges in the dependency graph:
//   1. `import … from 'x'` / `export … from 'x'`
//   2. `import('x')`               — dynamic
//   3. `import 'x'`                — BARE SIDE-EFFECT import, no `from`
//
// Form 3 was missing from the first draft and the negative test caught it: an
// injected `import '@pryzm/plugin-wall';` in an L1 package went undetected. A
// side-effect import is exactly how a layer violation would sneak in unnoticed,
// since it has no binding to review. Left as a comment because it is the kind of
// omission that looks harmless and silently halves a gate's coverage.
const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]{0,400}?from\s*['"]([^'"]+)['"]|(?:^|[^.\w])import\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;

interface Violation { readonly file: string; readonly fromLayer: string; readonly toLayer: string; readonly spec: string }

function scan(pkgs: Map<string, string>) {
    const files = execSync('git ls-files -- "packages/**/*.ts" "plugins/**/*.ts" "apps/**/*.ts" "packages/**/*.tsx" "apps/**/*.tsx"', {
        encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    }).split('\n').map(s => s.trim()).filter(Boolean)
      .filter(f => !f.includes('__tests__') && !f.endsWith('.d.ts') && !f.includes('/dist/'));

    const violations: Violation[] = [];
    const byPair = new Map<string, number>();
    const restricted: Array<{ file: string; mod: string }> = [];
    // SDK-facade bypass: a `plugins/**` file importing a workspace package that is
    // neither `@pryzm/plugin-sdk` nor another plugin. Counted separately from
    // `violations` on purpose — see MAX_SDK_BYPASS above.
    const sdkBypass: { file: string; spec: string }[] = [];
    const bypassByTarget = new Map<string, number>();

    for (const file of files) {
        const fromLayer = layerOf(file);
        if (!fromLayer) continue;                       // unclassified source — coverage, not violation
        const src = readFileSync(file, 'utf8');
        IMPORT_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = IMPORT_RE.exec(src)) !== null) {
            const spec = m[1] ?? m[2] ?? m[3];
            if (!spec) continue;

            // §FIX-RESTRICTED-IMPORT-RATCHET — banned third-party modules. Checked
            // BEFORE the @pryzm/ resolution below, because these are npm packages,
            // not workspace packages, and would otherwise be skipped entirely.
            for (const r of RESTRICTED_MODULES) {
                if (spec !== r.mod && !spec.startsWith(r.mod + '/')) continue;
                if (r.allowed.some(a => file.startsWith(a))) break;
                restricted.push({ file, mod: r.mod });
                break;   // a specifier can only match one rule
            }

            let targetPath: string | null = null;
            if (spec.startsWith('@pryzm/')) {
                // Exact, from package.json — no node resolution, no symlink dependence.
                const base = spec.split('/').slice(0, 2).join('/');
                const dir = pkgs.get(base) ?? pkgs.get(spec);
                if (dir) targetPath = `${dir}/src/index.ts`;   // representative path inside the package
            } else if (spec.startsWith('.')) {
                targetPath = join(dirname(file), spec).replace(/\\/g, '/');
            }
            if (!targetPath) continue;                   // bare npm dep or unresolvable — out of scope

            const toLayer = layerOf(targetPath);
            if (!toLayer) continue;                      // unclassified target — coverage, not violation

            // §FIX-LAYER-TABLE-INVERTED (2026-08-09) — PLUGINS are L6 and the SDK
            // facade is L5 after the reorder. This condition previously read L7/L6,
            // which after renumbering counted every APP import as a plugin SDK bypass
            // and inflated the figure 171 → 2360. A gate keyed on a layer NUMBER
            // silently changes meaning when the stack is renumbered; keyed on the
            // plugin/SDK ROLE it does not.
            if (fromLayer === 'L6' && toLayer !== 'L5' && toLayer !== 'L6') {
                const pkgDir = targetPath.replace(/\/src\/index\.ts$/, '');
                sdkBypass.push({ file, spec });
                bypassByTarget.set(pkgDir, (bypassByTarget.get(pkgDir) ?? 0) + 1);
            }

            if (isAllowed(fromLayer, toLayer)) continue;

            violations.push({ file, fromLayer, toLayer, spec });
            const key = `${fromLayer} → ${toLayer}`;
            byPair.set(key, (byPair.get(key) ?? 0) + 1);
        }
    }
    return { violations, byPair, sdkBypass, bypassByTarget, restricted };
}

// ── Report ───────────────────────────────────────────────────────────────────
const pkgs = workspacePackages();
const classified = [...pkgs.entries()].filter(([, dir]) => layerOf(`${dir}/src/index.ts`) !== null);
const unclassified = [...pkgs.entries()].filter(([, dir]) => layerOf(`${dir}/src/index.ts`) === null);
const stale = COMPILED.filter(c => !existsSync(c.pattern.replace(/\/\*\*$/, '')));

const { violations, byPair, sdkBypass, bypassByTarget, restricted } = scan(pkgs);

console.log('[check-layer-boundaries] §FIX-LAYER-GATE-BLIND (L-809) · §FIX-LAYER-TABLE-INVERTED');
console.log(`[check-layer-boundaries] workspace packages: ${pkgs.size} · classified: ${classified.length} · UNCLASSIFIED: ${unclassified.length}`);
console.log(`[check-layer-boundaries] upward imports between classified packages: ${violations.length}`);
console.log(`[check-layer-boundaries] L6 plugin imports bypassing the L5 SDK facade: ${sdkBypass.length}`);
console.log(`[check-layer-boundaries] banned third-party imports (OBC / express) outside their allowed homes: ${restricted.length}`);

if (restricted.length) {
    const byPkg = new Map<string, number>();
    for (const r of restricted) {
        const key = `${r.file.split('/').slice(0, 2).join('/')}  [${r.mod}]`;
        byPkg.set(key, (byPkg.get(key) ?? 0) + 1);
    }
    console.log(`
  Banned third-party imports by package:`);
    for (const [k, n] of [...byPkg.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`      ${String(n).padStart(4)}  ${k}`);
    }
}

if (stale.length) {
    console.log(`\n  ⚠ ${stale.length} layer pattern(s) point at a directory that does not exist — dead entries in eslint.config.js:`);
    for (const s of stale) console.log(`      ${s.type.padEnd(18)} ${s.pattern}`);
}

if (byPair.size) {
    console.log('\n  Violations by layer pair:');
    for (const [pair, n] of [...byPair.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`      ${String(n).padStart(4)}  ${pair}`);
    }
    // On a FAILING run, print every violation. The negative test caught why: with a
    // fixed 15-line sample, an injected violation sat at position 134 and the gate
    // reported "135, baseline 133" without ever naming the file that caused it. A
    // ratchet that tells you the count grew but not where is a puzzle, not a gate.
    const over = violations.length > MAX_VIOLATIONS;
    const shown = over ? violations : violations.slice(0, 15);
    console.log(over ? '\n  ALL violations (baseline exceeded):' : '\n  Sample (first 15):');
    for (const v of shown) console.log(`      ${v.file}  →  ${v.spec}   [${v.fromLayer} → ${v.toLayer}]`);
}

if (bypassByTarget.size) {
    console.log('\n  L6 SDK-facade bypasses by target package (a plugin should reach the platform through @pryzm/plugin-sdk):');
    for (const [pkg, n] of [...bypassByTarget.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`      ${String(n).padStart(4)}  ${pkg}`);
    }
    // §FIX-BYPASS-RATCHET-ANONYMOUS (2026-08-11, W1-1) — name the files on failure.
    // The VIOLATIONS ratchet has printed every offender on a failing run since the
    // negative test caught that "135, baseline 133" names nothing ("a ratchet that
    // tells you the count grew but not where is a puzzle, not a gate", see above).
    // The BYPASS ratchet never got the same treatment: it printed per-package totals
    // only, so "181, baseline 178" left you diffing 39 command-registry imports by
    // hand to find the three that moved. Same rule, same remedy.
    if (sdkBypass.length > MAX_SDK_BYPASS) {
        console.log('\n  ALL SDK-facade bypasses (baseline exceeded):');
        for (const b of sdkBypass) console.log(`      ${b.file}  →  ${b.spec}`);
    }
}

if (unclassified.length) {
    console.log(`\n  ⚠ ${unclassified.length} package(s) have NO layer. The gate cannot judge any import to or from them:`);
    for (const [name] of unclassified.slice(0, 20)) console.log(`      ${name}`);
    if (unclassified.length > 20) console.log(`      … and ${unclassified.length - 20} more`);
}

// ── Ratchet ──────────────────────────────────────────────────────────────────
if (!Number.isFinite(MAX_VIOLATIONS) || !Number.isFinite(MAX_UNCLASSIFIED) || !Number.isFinite(MAX_SDK_BYPASS)) {
    console.log(
        `\n[check-layer-boundaries] BASELINE RUN — no thresholds set.\n` +
        `Freeze today's numbers by setting them at the top of this file:\n` +
        `    MAX_VIOLATIONS   = ${violations.length}\n` +
        `    MAX_UNCLASSIFIED = ${unclassified.length}\n` +
        `    MAX_SDK_BYPASS   = ${sdkBypass.length}\n` +
        `All are SHRINK-ONLY thereafter.`,
    );
    process.exit(0);
}

let failed = false;
if (violations.length > MAX_VIOLATIONS) {
    console.error(`\n[check-layer-boundaries] FAIL — ${violations.length} upward import(s), baseline ${MAX_VIOLATIONS}.\n` +
        `A layer may import from any LOWER layer, never a higher one. Invert the dependency (inject it) —\n` +
        `do NOT widen the allow-table and do NOT raise this threshold.`);
    failed = true;
}
if (unclassified.length > MAX_UNCLASSIFIED) {
    console.error(`\n[check-layer-boundaries] FAIL — ${unclassified.length} unclassified package(s), baseline ${MAX_UNCLASSIFIED}.\n` +
        `A new package MUST be given a layer in eslint.config.js. Coverage ratchets too, or the gate\n` +
        `could be made green by classifying less.`);
    failed = true;
}
if (restricted.length > MAX_RESTRICTED_IMPORTS) {
    console.error(`
[check-layer-boundaries] FAIL — ${restricted.length} banned third-party import(s), baseline ${MAX_RESTRICTED_IMPORTS}.
` +
        `@thatopen/components belongs only in plugins/ifc-import/; express only in the server apps.
` +
        `This ratchet may only SHRINK — it exists because the eslint rule could never be satisfied
` +
        `and therefore kept CI permanently red, which is how a rule stops enforcing anything.`);
    failed = true;
}
if (sdkBypass.length > MAX_SDK_BYPASS) {
    console.error(`\n[check-layer-boundaries] FAIL — ${sdkBypass.length} SDK-facade bypass(es), baseline ${MAX_SDK_BYPASS}.\n` +
        `A plugin reaches the platform through @pryzm/plugin-sdk. If the SDK does not re-export what\n` +
        `you need, WIDEN THE FACADE — do not import the package directly and do not raise this threshold.`);
    failed = true;
}
if (failed) process.exit(1);

console.log(`\n[check-layer-boundaries] ✓ within baselines (violations ${violations.length}/${MAX_VIOLATIONS}, unclassified ${unclassified.length}/${MAX_UNCLASSIFIED}, sdk-bypass ${sdkBypass.length}/${MAX_SDK_BYPASS}).`);
