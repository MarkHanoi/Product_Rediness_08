// Root ESLint flat config — PRYZM 2 boundaries L0→L7 matrix + custom rules.
//
// This file is the binding S01 deliverable from
// `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` D2/D4/D5 (Track B), extended
// at S02 with the dual-mode `pryzm/no-raf` rule (S02-T9, line 301):
//
//   • HARD-FAIL on `packages/*`, `tools/*`, `apps/{bake-worker,sync-server,headless,bench}`,
//     and `plugins/*` — every PRYZM 2 module.
//   • WARN-ONLY on the legacy code in `src/` (PRYZM 1) — surfaces existing
//     rAF call sites in editors without breaking the build.
//
// The HARD-FAIL "no NEW rAF in src/" enforcement is owned by
// `tools/scripts/check-raf-count.mjs` (snapshot-diff) which is the actual
// S02 exit criterion gate (spec line 342).  This rule's WARN mode is the
// editor-side companion.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import pryzm from 'eslint-plugin-pryzm';
import globals from 'globals';

// ─────────────────────────────────────────────────────────────────────────────
// THE LAYER TABLE — one authority, no second copy.
//
// §FIX-LAYER-GATE-BLIND (L-809) — EXPORTED so `tools/ga-gate/check-layer-boundaries.ts`
// reads THIS table rather than keeping a second copy. Two copies of a layer table
// drift, and a drifted layer table is worse than no gate: it reports confident
// nonsense. This file stays the one authority for which directory is in which layer.
//
// §FIX-LAYER-TABLE-INVERTED (2026-08-09) — THE TABLE ITSELF WAS WRONG.
// The moment the gate above started actually measuring, it reported 28 upward
// imports. Most of them were not upward. The old table (a PRYZM 2 artefact) and
// CLAUDE.md's PRYZM 3 model were two DIFFERENT models, and for several packages
// they were INVERTED — the old table put `persistence-client` and `file-format`
// at L0, BELOW `stores` and `command-bus`. Settled empirically:
//
//     packages/stores      → packages/persistence-client :  0 imports
//     packages/command-bus → packages/persistence-client :  0 imports
//     packages/persistence-client → {stores, command-bus}:  9 imports
//
// Dependencies flow persistence-client → {stores, command-bus} and never back, so
// persistence-client sits ABOVE them. CLAUDE.md's ordering is the one that matches
// the code. This table is now CLAUDE.md's model, verbatim for the ~25 packages it
// names, and evidence-derived for the rest.
//
// ── The model ────────────────────────────────────────────────────────────────
//   L7.5  src/                     — transitional legacy zone
//   L7    plugins/*                — features
//   L6    packages/plugin-sdk      — curated public SDK facade
//   L5    apps/*                   — per-app surfaces
//   L4    renderer, render-runtime, persistence-client, scene-committer
//   L3    runtime-composer, ui-base, stores, view-state, file-format,
//         sync-client, frame-scheduler
//   L2    geometry-kernel, ai-host, constraint-solver, drawing-primitives
//   L1    command-bus, picking, visibility, snapping, renderer-three, spatial-index
//   L0    schemas                  — pure; no I/O, no THREE, no DOM
//
// ── How the packages CLAUDE.md does not name were placed ─────────────────────
// One layer per element `type` (not one per package) so the gate's by-pair report
// reads as "L2 → L4: n" rather than a fog of thirty type names.
//
// Every entry below is tagged with WHY it sits where it does:
//   [CLAUDE.md]  named explicitly in the 8-layer model. Not moved, even where the
//                dependency graph contradicts it — see the CONTRADICTIONS note.
//   [forced]     the graph admits exactly one answer, or one bound is tight: e.g.
//                `event-bus` is imported BY renderer-three (L1), so it can only be
//                ≤ L1; it imports nothing, so L1 it is.
//   [floor]      placed at max(layer of its own dependencies) — the lowest layer
//                that makes all of its CURRENT imports legal.
//   [family]     placed by a naming family whose anchor CLAUDE.md names, with at
//                least one member verified against the graph:
//                  geometry-*   → L2 (anchor geometry-kernel; verified geometry-pool
//                                 imports only schemas, geometry-slab only L1/L2 + the
//                                 frame-scheduler contradiction below)
//                  *-host       → L2 (anchor ai-host; verified physics-host imports
//                                 core-app-model/event-bus/renderer-three only)
//                  typology-*   → L2 (verified all four packs import exactly
//                                 schemas + typology-pipeline)
//   [role]       the graph leaves a WIDE bound (e.g. "imports only schemas, used only
//                by apps/editor" ⇒ anywhere in L1..L4). Placed at the layer whose
//                CLAUDE.md description matches the package's job, within that bound.
//                These are the judgement calls; they are labelled so they can be
//                argued with.
//
// Packages that could NOT be placed honestly are ABSENT from this table on purpose
// — see the UNCLASSIFIED block at the bottom. An unclassified package is better
// than a confidently wrong one: a wrong layer emits false violations forever.
//
// ── CONTRADICTIONS: where CLAUDE.md and the graph disagree ───────────────────
// Encoded as CLAUDE.md says, so the resulting violations are REAL findings against
// the declared architecture rather than table bugs. Three clusters dominate:
//
//  1. `frame-scheduler` is L3 in CLAUDE.md but imports NOTHING and is imported by
//     eleven L2 `geometry-*` packages, `core-app-model` and `physics-host`. A
//     zero-dependency primitive consumed by L2 is, by evidence, ≤ L2. Its L3
//     placement is the single largest source of counted violations.
//  2. `runtime-composer` is L3 but is the composition root (P1): it necessarily
//     imports persistence-client (L4), renderer (L4), the four typology packs and
//     five plugins (L7), and `apps/editor` (L5). A composition root sits ABOVE
//     everything it composes.
//  3. `core-app-model` / `command-registry` are placed at L2 because `ai-host`
//     (L2, named by CLAUDE.md) imports them — but they in turn import
//     `scene-committer` and `persistence-client` (L4). That is the genuine debt:
//     a domain model must not depend on persistence.
//
// Do not "fix" these by moving the table. Either the code moves or CLAUDE.md does.
// ─────────────────────────────────────────────────────────────────────────────
export const layerElements = [
  // ── L0 — pure data. No I/O, no THREE, no DOM. ──────────────────────────────
  { type: 'L0', pattern: 'packages/schemas/**' },          // [CLAUDE.md]
  { type: 'L0', pattern: 'packages/protocol/**' },         // [floor] re-exports schemas only
  { type: 'L0', pattern: 'packages/types-builtin/**' },    // [floor] protocol+schemas; "pure data, no runtime deps"
  { type: 'L0', pattern: 'packages/expr-eval/**' },        // [role]  leaf, "pure-TS, dependency-free"
  { type: 'L0', pattern: 'packages/feature-flags/**' },    // [role]  leaf, "no DOM, no THREE, no Node globals"
  { type: 'L0', pattern: 'packages/a11y-tokens/**' },      // [role]  leaf, pure contrast/token tables
  { type: 'L0', pattern: 'packages/perf-budgets/**' },     // [role]  leaf, pure target list

  // ── L1 — primitives. ───────────────────────────────────────────────────────
  { type: 'L1', pattern: 'packages/command-bus/**' },      // [CLAUDE.md]
  { type: 'L1', pattern: 'packages/picking/**' },          // [CLAUDE.md]
  { type: 'L1', pattern: 'packages/visibility/**' },       // [CLAUDE.md]
  { type: 'L1', pattern: 'packages/snapping/**' },         // [CLAUDE.md]
  { type: 'L1', pattern: 'packages/renderer-three/**' },   // [CLAUDE.md] the ONE THREE owner (P2)
  { type: 'L1', pattern: 'packages/spatial-index/**' },    // [CLAUDE.md]
  { type: 'L1', pattern: 'packages/event-bus/**' },        // [forced] imported BY renderer-three (L1); imports nothing
  { type: 'L1', pattern: 'packages/solar-analysis/**' },   // [forced] imported BY renderer-three (L1); imports nothing
  { type: 'L1', pattern: 'packages/runtime-undo-stack/**' },// [forced] imported BY command-bus (L1); imports nothing
  { type: 'L1', pattern: 'packages/crash-reporter/**' },   // [floor]  leaf
  { type: 'L1', pattern: 'packages/keyboard-registry/**' },// [floor]  leaf
  { type: 'L1', pattern: 'packages/geospatial/**' },       // [floor]  leaf, pure coordinate transforms (C12)
  { type: 'L1', pattern: 'packages/street-analytics/**' }, // [floor]  leaf
  { type: 'L1', pattern: 'packages/storage-driver/**' },   // [floor]  leaf
  { type: 'L1', pattern: 'packages/oauth2-pkce/**' },      // [floor]  leaf, pure PKCE/RFC-7636 utils

  // ── L2 — domain. ───────────────────────────────────────────────────────────
  { type: 'L2', pattern: 'packages/geometry-kernel/**' },     // [CLAUDE.md]
  { type: 'L2', pattern: 'packages/ai-host/**' },             // [CLAUDE.md]
  { type: 'L2', pattern: 'packages/constraint-solver/**' },   // [CLAUDE.md]
  { type: 'L2', pattern: 'packages/drawing-primitives/**' },  // [CLAUDE.md]
  // The element families. geometry-* anchored on geometry-kernel (L2).
  { type: 'L2', pattern: 'packages/geometry-beam/**' },         // [family]
  { type: 'L2', pattern: 'packages/geometry-column/**' },       // [family]
  { type: 'L2', pattern: 'packages/geometry-curtain-wall/**' }, // [family]
  { type: 'L2', pattern: 'packages/geometry-door/**' },         // [family]
  { type: 'L2', pattern: 'packages/geometry-furniture/**' },    // [family]
  { type: 'L2', pattern: 'packages/geometry-lift/**' },         // [family]
  { type: 'L2', pattern: 'packages/geometry-lighting/**' },     // [family]
  { type: 'L2', pattern: 'packages/geometry-plumbing/**' },     // [family]
  { type: 'L2', pattern: 'packages/geometry-pool/**' },         // [family] verified: imports schemas only
  { type: 'L2', pattern: 'packages/geometry-roof/**' },         // [family]
  { type: 'L2', pattern: 'packages/geometry-slab/**' },         // [family]
  { type: 'L2', pattern: 'packages/geometry-stair/**' },        // [family]
  { type: 'L2', pattern: 'packages/geometry-wall/**' },         // [family]
  { type: 'L2', pattern: 'packages/geometry-window/**' },       // [family]
  // *-host anchored on ai-host (L2).
  { type: 'L2', pattern: 'packages/climate-host/**' },      // [family] imports schemas only
  { type: 'L2', pattern: 'packages/physics-host/**' },      // [family] verified: core-app-model/event-bus/renderer-three
  { type: 'L2', pattern: 'packages/input-host/**' },        // [family] + [forced ceiling] imported BY ai-host (L2)
  // Capped at L2 by an L2 consumer CLAUDE.md names.
  { type: 'L2', pattern: 'packages/core-app-model/**' },    // [forced ceiling] imported BY ai-host + constraint-solver
  { type: 'L2', pattern: 'packages/command-registry/**' },  // [forced ceiling] imported BY ai-host
  { type: 'L2', pattern: 'packages/room-topology/**' },     // [forced ceiling] imported BY ai-host
  { type: 'L2', pattern: 'packages/ai-cost/**' },           // [forced ceiling] imported BY ai-host; leaf
  // Typology — all four packs import exactly {schemas, typology-pipeline}.
  { type: 'L2', pattern: 'packages/typology-pipeline/**' },                  // [family]
  { type: 'L2', pattern: 'packages/typology-pack-apartment/**' },            // [family]
  { type: 'L2', pattern: 'packages/typology-pack-casa-unifamiliar/**' },     // [family]
  { type: 'L2', pattern: 'packages/typology-pack-office-building/**' },      // [family]
  { type: 'L2', pattern: 'packages/typology-pack-residential-building/**' }, // [family]
  // Domain libraries with a wide bound, placed by role.
  { type: 'L2', pattern: 'packages/views/**' },              // [floor] imports core-app-model (L2); type-only view contracts
  { type: 'L2', pattern: 'packages/speculative-engine/**' }, // [floor] imports constraint-solver (L2)
  { type: 'L2', pattern: 'packages/site-parcel-data/**' },   // [floor] imports site-validators (L2)
  { type: 'L2', pattern: 'packages/site-validators/**' },    // [role]  bound L1..L3 (used by stores)
  { type: 'L2', pattern: 'packages/family-runtime/**' },     // [role]  bound L0..L3; leaf
  { type: 'L2', pattern: 'packages/auto-dimension/**' },     // [role]  bound L1..L4
  { type: 'L2', pattern: 'packages/building-graph/**' },     // [role]  bound L1..L4; leaf
  { type: 'L2', pattern: 'packages/entitlements/**' },       // [role]  bound L1..L4
  { type: 'L2', pattern: 'packages/data-engine/**' },        // [role]  bound L1..∞ (no consumers)
  { type: 'L2', pattern: 'packages/ordinance-extraction/**' },// [role] bound L1..∞ (no consumers)
  { type: 'L2', pattern: 'packages/pdf-to-bim/**' },         // [role]  bound L0..∞ (leaf, no consumers)
  { type: 'L2', pattern: 'packages/formula-library/**' },    // [role]  bound L0..L5; leaf

  // ── L3 — runtime services. ─────────────────────────────────────────────────
  { type: 'L3', pattern: 'packages/runtime-composer/**' },  // [CLAUDE.md] see CONTRADICTION 2
  { type: 'L3', pattern: 'packages/ui-base/**' },           // [CLAUDE.md]
  { type: 'L3', pattern: 'packages/stores/**' },            // [CLAUDE.md]
  { type: 'L3', pattern: 'packages/view-state/**' },        // [CLAUDE.md]
  { type: 'L3', pattern: 'packages/file-format/**' },       // [CLAUDE.md]
  { type: 'L3', pattern: 'packages/sync-client/**' },       // [CLAUDE.md]
  { type: 'L1', pattern: 'packages/frame-scheduler/**' },   // [RESOLVED 2026-08-09] imports NOTHING; consumed by eleven L2 geometry-* packages. A zero-dependency primitive consumed by L2 cannot be L3. Moving it here removes ~29 FALSE violations. CLAUDE.md updated to match.
  { type: 'L3', pattern: 'packages/ui/**' },                // [family] with ui-base; leaf
  { type: 'L3', pattern: 'packages/editor-ui/**' },         // [floor]  imports runtime-composer (L3)
  { type: 'L3', pattern: 'packages/engine/**' },            // [floor]  imports editor-ui + runtime-composer (L3)
  { type: 'L3', pattern: 'packages/headless/**' },          // [floor]  imports runtime-composer (L3)
  { type: 'L3', pattern: 'packages/family-instance/**' },   // [floor]  imports file-format (L3)
  { type: 'L3', pattern: 'packages/family-loader/**' },     // [floor]  imports file-format (L3)

  // ── L4 — render + persistence surfaces. ────────────────────────────────────
  { type: 'L4', pattern: 'packages/renderer/**' },            // [CLAUDE.md]
  { type: 'L4', pattern: 'packages/render-runtime/**' },      // [CLAUDE.md]
  { type: 'L4', pattern: 'packages/persistence-client/**' },  // [CLAUDE.md] was L0 in the old table — inverted
  { type: 'L4', pattern: 'packages/scene-committer/**' },     // [CLAUDE.md]
  { type: 'L4', pattern: 'packages/render-pipeline/**' },     // [family] with renderer (L4)
  { type: 'L4', pattern: 'packages/pdf-export/**' },          // [role]   bound L2..L4; an output pipeline

  // ── L5 — per-app surfaces. ALL of apps/*, not just the editor. ─────────────
  { type: 'L7', pattern: 'apps/**' },                         // [RESOLVED 2026-08-09] apps are the composition root and sit ABOVE plugins. Measured apps->plugins 142, plugins->apps 0 real imports.

  // ── L6 — the curated SDK facade. ───────────────────────────────────────────
  { type: 'L5', pattern: 'packages/plugin-sdk/**' },          // [RESOLVED 2026-08-09] the SDK facade sits BELOW the plugins that consume it (630 imports, 0 back).

  // ── L7 — features. ─────────────────────────────────────────────────────────
  { type: 'L6', pattern: 'plugins/**' },                      // [RESOLVED 2026-08-09] plugins sit between the SDK they consume and the apps that register them.

  // ── L7.5 — the transitional legacy zone. ───────────────────────────────────
  // Not in `boundaries/include`, and the ga-gate scans packages/plugins/apps only,
  // so this fires on nothing today. Declared because CLAUDE.md declares it, and so
  // that widening either scope classifies src/ correctly instead of silently not.
  { type: 'L7_5', pattern: 'src/**' },

  // ── DELIBERATELY UNCLASSIFIED ──────────────────────────────────────────────
  // Absent from this table on purpose. Adding a guessed layer here would emit
  // false violations forever; the ga-gate counts them under UNCLASSIFIED instead,
  // which is the honest signal. Give one a layer only with evidence.
  //
  //   Backend-only, outside the client layer model. CLAUDE.md's 8 layers govern
  //   "the client"; these are consumed solely by apps/api-gateway or
  //   apps/marketplace-api and have no client dependency at all:
  //     admin-overrides · ai-spend · api-rbac · api-spec · rate-limit ·
  //     webhooks · email-transport · beta-signup
  //   → OPEN QUESTION for CLAUDE.md: does the layer model extend to backend
  //     packages, or do they need a parallel model?
  //
  //   Build/CI/test tooling — not runtime code, so "which runtime layer" has no
  //   answer:
  //     eslint-plugin-pryzm · bench-visual-diff · release · wcag-audit
  //
  //   Intentional lint fixture, exempted from boundaries further down this file:
  //     legacy-shim
  //
  // (`packages/sync/**` and `packages/plugin-host/**` were removed in this pass:
  //  both patterns pointed at directories that do not exist. The ga-gate's
  //  stale-pattern check is what surfaced them.)
];

// "layer N may import any layer ≤ N" — encoded explicitly, one rule per layer.
export const allowedDependencies = [
  { from: 'L0',   allow: ['L0'] },
  { from: 'L1',   allow: ['L0', 'L1'] },
  { from: 'L2',   allow: ['L0', 'L1', 'L2'] },
  { from: 'L3',   allow: ['L0', 'L1', 'L2', 'L3'] },
  { from: 'L4',   allow: ['L0', 'L1', 'L2', 'L3', 'L4'] },

  // ── L5 = plugin-sdk · L6 = plugins · L7 = apps ─────────────────────────────
  // RESOLVED 2026-08-09. CLAUDE.md used to number apps L5, plugin-sdk L6 and
  // plugins L7 — which put the app BELOW the plugins it hosts. The same
  // edge-direction test that overturned the previous eslint table says that
  // ordering is inverted, by a wider margin:
  //
  //     apps → plugins       : 142 imports        plugins → apps       :   0
  //     apps → plugin-sdk    :   6 imports        plugin-sdk → apps    :   0
  //     plugins → plugin-sdk : 630 imports        plugin-sdk → plugins :   0
  //
  // An app is the composition root: `apps/editor` imports twenty-odd plugins in
  // order to REGISTER them. That is what a host does, and it is structural, not
  // debt. The stack was therefore REORDERED (and CLAUDE.md corrected to match),
  // rather than carrying a `{ from: 'L5', allow: ['*'] }` exception forever — an
  // exception that permanently exempts the top of the stack is not a rule.
  { from: 'L5',   allow: ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'] },

  // ── L6 (plugins): why this is L0..L5 and not "the SDK only" ────────────────
  // CLAUDE.md says a plugin "may import the SDK only". Measured against the real
  // graph, plugins make 630 imports of @pryzm/plugin-sdk and 171 that go around
  // it — renderer-three ×84, command-registry ×29, core-app-model ×27,
  // scene-committer ×19, and a tail (geometry-curtain-wall, schemas, ai-host,
  // geospatial, drawing-primitives, geometry-pool).
  //
  // Encoding "SDK only" here would fold those 171 into the SAME counter that
  // holds the genuine `→ plugin-annotations` cycle violations, and the number the
  // gate exists to publish would stop being readable. They are also not layer
  // violations: plugin → renderer-three is DOWNWARD, and the layer rule is "never
  // a HIGHER layer" — every one of those 171 obeys it.
  //
  // SDK-facade encapsulation is a different, strictly narrower invariant, so it
  // is measured separately and frozen on its own shrink-only ratchet
  // (`MAX_SDK_BYPASS` in check-layer-boundaries.ts). It is enforced; it is just
  // not conflated with this one.
  { from: 'L6',   allow: ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6'] },

  // L7 (apps) — the composition root, top of the stack. Everything below is fair
  // game; nothing may import an app.
  { from: 'L7',   allow: ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'] },

  // L7.5 legacy src/ — anything goes downward while the zone shrinks.
  { from: 'L7_5', allow: ['*'] },
];

const sharedLanguageOptions = {
  parser: tseslint.parser,
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  globals: { ...globals.browser, ...globals.node },
};

export default [
  // Globally ignored — build artefacts only.  Note `src/**` and `server/**`
  // are NOT in this list at S02: they are picked up by the dedicated
  // legacy-warn block at the bottom of this file so `pryzm/no-raf` can
  // surface existing rAF sites as warnings (S02-T9).
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      // `apps/component-editor/dist-gate/` is a COMMITTED vite bundle (the C51
      // apex-output gate reads it). It is a build artefact by every definition
      // this ignore list already uses, and linting minified output produced
      // errors about the bundler's own variable names.
      '**/dist-gate/**',
      'build/**',
      'coverage/**',
      'attached_assets/**',
      'docs/**',
      'public/**',
      'screenshots/**',
      'tests/fixtures/**',
      'editor/**',
      'browser.html',
      'server.js',
      'server/**',       // PRYZM 1 Express — legacy until M24.  Lint scope = `src/` only at S02.
      '**/*.bad.ts',     // Lint fixtures intentionally fail.
      '**/*.good.ts',    // Lint fixtures intentionally pass.
    ],
  },

  // Baseline JS recommended — restricted to PRYZM 2 trees so the legacy
  // src/ tree doesn't drown in unrelated rule violations.  The src/ tree
  // gets only `pryzm/no-raf: warn` via the dedicated block below.
  //
  // Node + browser globals are injected here so plain `.mjs` scripts in
  // `tools/scripts/` (which use `console`/`process`/`URL`/etc.) and benches
  // in `apps/bench/` (which use `process.hrtime` etc.) lint cleanly.
  {
    files: [
      'packages/**/*.{ts,tsx,js,mjs}',
      'tools/**/*.{ts,tsx,js,mjs}',
      'apps/**/*.{ts,tsx,js,mjs}',
      'plugins/**/*.{ts,tsx,js,mjs}',
    ],
    ...js.configs.recommended,
    languageOptions: {
      ...(js.configs.recommended.languageOptions ?? {}),
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      // Same `^_` convention the TypeScript block below declares, applied to the
      // plain-JS files too (it was TS-only, so the `_`-prefixed rest-destructure
      // "omit a key" idiom in packages/file-format/src/family-migrations/ops/*.js
      // was reported as unused even though it is the documented convention).
      // `ignoreRestSiblings` is what makes `const { [k]: _removed, ...rest }` legal.
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },

  // TypeScript files in PRYZM 2 packages / tools / apps / plugins.
  {
    files: [
      'packages/**/*.{ts,tsx}',
      'tools/**/*.{ts,tsx,js}',
      'apps/**/*.{ts,tsx}',
      'plugins/**/*.{ts,tsx}',
    ],
    languageOptions: sharedLanguageOptions,
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      boundaries,
      pryzm,
    },
    settings: {
      'boundaries/elements': layerElements,
      'boundaries/include': ['packages/**', 'tools/**', 'apps/**', 'plugins/**'],
      // ⚠ §FIX-LAYER-GATE-BLIND (L-809) — READ THIS BEFORE TRUSTING THE RULE BELOW.
      //
      // There is NO `import/resolver` configured here, and adding one is a
      // deliberate NON-choice. `eslint-plugin-boundaries` classifies a file by its
      // RESOLVED PATH, so without a resolver it cannot map `@pryzm/geometry-wall`
      // to `packages/geometry-wall/**` — and in this monorepo essentially every
      // cross-package import is written that way. **The `boundaries/element-types`
      // rule below therefore only sees RELATIVE imports.** That is still worth
      // having, but it is not the layer gate.
      //
      // A resolver was rejected rather than merely skipped: pnpm symlinks some
      // `@pryzm/*` packages into a given package's node_modules and not others, so
      // resolver-based checking catches a violation in one package and silently
      // skips the identical one next door. Unpredictable enforcement is worse than
      // none, because people trust it.
      //
      // THE AUTHORITY FOR THE LAYER RULE IS `tools/ga-gate/check-layer-boundaries.ts`,
      // which maps `@pryzm/X` → directory by reading each workspace package.json —
      // exact, deterministic, independent of install state — and ratchets both the
      // violation count and the CLASSIFICATION COVERAGE. It imports the two tables
      // above rather than copying them.
    },
    rules: {
      ...tseslint.configs.recommended.rules,

      // The base `no-redeclare` collides with the `const Foo = z.object(...)` +
      // `type Foo = z.infer<typeof Foo>` pattern used across @pryzm/schemas.
      // typescript-eslint's no-redeclare understands the type/value distinction.
      'no-redeclare': 'off',
      '@typescript-eslint/no-redeclare': 'off',

      // Architectural boundary enforcement (HARD-FAIL on PRYZM 2 packages).
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: allowedDependencies,
        },
      ],

      // The custom PRYZM rules — scaffolded in S01, hardened in S02–S08.
      'pryzm/affected-stores-required': 'error',
      'pryzm/no-three-in-kernel':       'error',
      'pryzm/no-raf':                   'error',
      // S04-T10 scaffold (line 442): only the L5 committer surface +
      // per-plugin committer.ts files may import THREE.  Hard-fail on
      // every PRYZM 2 module; the legacy `src/` warn-mode is wired in
      // the dedicated block at the bottom of this file.
      'pryzm/no-three-outside-committer': 'error',

      // Forbidden-dependency baseline (S01 D5 — extends through S02 with the
      // command-bus once it ships).  Schemas are PURE — any THREE / OBC /
      // socket.io / express dependency is a layer violation by construction.
      // `three` is owned by `pryzm/no-three-outside-committer` (S04-T10).
      // OBC + Express bans stay here.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@thatopen/components',
              message:
                'OBC is L7 plugin territory — it may not appear in any PRYZM 2 package outside plugins/ifc-import/.',
            },
            {
              name: '@thatopen/components-front',
              message:
                'OBC-front is L7 plugin territory — it may not appear in any PRYZM 2 package outside plugins/ifc-import/.',
            },
            {
              name: 'express',
              message:
                'Express belongs in apps/sync-server/ or apps/bake-worker/ only.',
            },
          ],
        },
      ],

      // Cosmetic overrides — match the schemas/protocol style.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-unused-vars': 'off', // handled by the TS rule above
    },
  },

  // ── `no-undef` MUST be off on TypeScript, for the same structural reason
  // `no-unused-vars` is off in the block above: the base rule resolves identifiers
  // against ESLint's `globals` list, which contains VALUES only. Every TS *type*
  // from lib.dom.d.ts / @types/node therefore reads as undefined. Measured on this
  // tree before the change: 179 errors across 85 files, 100% of them type positions
  // (`EventListener`, `EventListenerOptions`, `RequestInit`, `NodeJS`,
  // `CanvasTextBaseline`, `GeoJSON`, `CryptoKeyPair`, …) and ZERO genuine undefined
  // values — enough on its own to make the `lint` CI job unpassable, which is why
  // every deploy has been going out through `bypass_ci_gate`.
  //
  // This is not a suppression: an undefined identifier in TypeScript is a COMPILER
  // error (TS2304), and CI runs `tsc --noEmit` over the same tree in the `build`
  // job. It is also typescript-eslint's own documented guidance — `no-undef` is in
  // the set `eslint-recommended` explicitly turns off for TS files.
  //
  // Scoped to the .ts/.tsx of the four PRYZM 2 trees only — NOT `**/*.ts`: a
  // whole-tree glob would ADD files to the linted set (root `scratchpad/*.mts`
  // probes are parsed by espree and fatal on TS syntax). Plain .js/.mjs under
  // tools/ and packages/ keep the base rule, since nothing else checks them.
  {
    files: [
      'packages/**/*.{ts,tsx}',
      'tools/**/*.{ts,tsx}',
      'apps/**/*.{ts,tsx}',
      'plugins/**/*.{ts,tsx}',
    ],
    rules: { 'no-undef': 'off' },
  },

  // W-1A-1 — single-channel store rule for plugin handlers.
  // Each CommandHandler in a plugin handler file may only write to one
  // store.  Cross-store composition belongs in the cascade layer.
  {
    files: ['plugins/**/handlers/**/*.ts'],
    rules: {
      'pryzm/store-single-channel': 'error',
    },
  },

  // Tests inside the packages — relax the boundary rule (test files import
  // their own package + harness fixtures).
  {
    files: [
      'packages/**/__tests__/**/*.ts',
      'tools/**/__tests__/**/*.ts',
      'apps/**/__tests__/**/*.ts',
      'plugins/**/__tests__/**/*.ts',
      'apps/bench/**/*.bench.ts', // benches load every layer to measure them
      // S03-T3 (line 367): "The cube is rendered with raw THREE inside
      // `apps/bench/`".  The demos directory is the documented home for
      // those THREE-touching headless workloads (the bench files import
      // from here).  The lint relax mirrors the same one-package-deep
      // exemption used for `*.bench.ts` above.
      'apps/bench/src/demos/**/*.{ts,tsx}',
    ],
    rules: {
      'boundaries/element-types': 'off',
      'no-restricted-imports': 'off',
    },
  },

  // The legacy-shim package is a fixture for `pryzm/no-raf` — by design it
  // contains a forbidden `requestAnimationFrame` call.  We disable the rule
  // here so the global lint stays clean; the plugin's own unit tests (and
  // a CI step) prove the rule fires when run against this directory.
  {
    files: ['packages/legacy-shim/**/*.ts'],
    rules: {
      'pryzm/no-raf': 'off',
      'boundaries/element-types': 'off',
    },
  },

  // ESLint plugin source itself is plain Node JS — no TypeScript parsing.
  // Z.5 (2026-04-30) — moved from `tools/eslint-plugin-pryzm/` to
  // `packages/eslint-plugin-pryzm/` so the plugin participates in the
  // workspace graph alongside other `packages/*` (lets it be pulled in
  // as a `peerDependency` of `packages/ui-base/`).
  {
    files: ['packages/eslint-plugin-pryzm/src/**/*.js'],
    languageOptions: { globals: globals.node },
    rules: {
      'pryzm/affected-stores-required': 'off',
      'pryzm/no-three-in-kernel': 'off',
      'no-restricted-imports': 'off',
    },
  },

  // ── PRYZM 1 legacy `src/` — warn-mode `pryzm/no-raf` (S02-T9, line 301).
  // This block ONLY enables the rAF rule as a warning so editors surface
  // existing rAF call sites without breaking the legacy build.  The hard-fail
  // "no NEW rAF site" gate is owned by `tools/scripts/check-raf-count.mjs`
  // which CI runs on every PR (spec line 342).
  //
  // We also register the `@typescript-eslint` plugin (without enabling any
  // of its rules) so existing `eslint-disable-next-line @typescript-eslint/*`
  // directives in PRYZM 1 source don't trip "rule not found" errors.
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    languageOptions: sharedLanguageOptions,
    plugins: { pryzm, '@typescript-eslint': tseslint.plugin },
    linterOptions: { reportUnusedDisableDirectives: false },
    rules: {
      'pryzm/no-raf': 'warn',
      // S04-T10 scaffold (warn-only on legacy src/) — the hard-fail
      // companion is owned by the boundary check on PRYZM 2 packages
      // above + tools/scripts/check-lint-fixtures.mjs.
      'pryzm/no-three-outside-committer': 'warn',
      // ── Phase A.7 / Wave 5 Day 10 (S82-WIRE) — `(window as any).<x>` reach detector.
      // Per `docs/00_NEW_ARCHITECTURE/phases/audits/PRYZM2-ENTERPRISE-WIREUP-PLAN-S72.md`
      // §16.1 line 1695.  Wave 5 reduced src/ from 2,070 → 167 casts; the
      // only allowlisted location for remaining casts is `src/legacy/window-shim.ts`
      // (see the block below).  Wave 7 flips this to 'error' once the non-shim
      // baseline empties.  Baseline: `eslint-baseline-window-as-any.json`.
      // Count-ratchet: `tools/scripts/check-window-as-any-count.mjs`.
      'pryzm/no-window-as-any': 'warn',
      // ── Z.3b / Z.4a / Z.4b (S77-WIRE) — three new boundary rules from
      // PRYZM2-WIREUP-PLAN-S72 §26.1.  WARN-only inside the legacy `src/`
      // tree so editors surface call sites without breaking the legacy
      // build; the hard-fail flip happens in Phase G when the baselines
      // empty out.  See `tools/eslint-plugin-pryzm/__tests__/rules.test.ts`
      // for the per-rule semantics.
      'pryzm/no-second-canvas': 'warn',
      'pryzm/no-runtime-package-import': 'warn',
      'pryzm/no-legacy-src-import': 'warn',
    },
  },

  // ── Wave 5 Day 10 (S82-WIRE) — the window-shim is the ONLY allowlisted
  // location for `(window as any).*` casts.  Pattern D (debug) and Pattern E
  // (genuine browser globals) live here.  All other `src/` files must be
  // cast-free; Wave 7 flips `pryzm/no-window-as-any` to 'error' once the
  // non-shim baseline empties to 0.
  // NOTE: shim was relocated S95-WIRE from `src/legacy/` to
  // `src/engine/subsystems/legacy/` when `src/legacy/` was deleted.
  {
    files: ['src/engine/subsystems/legacy/window-shim.ts'],
    rules: {
      'pryzm/no-window-as-any': 'off',
    },
  },

  // ── Z.4b (S77-WIRE) — `pryzm/no-legacy-src-import` is the only one of
  // the three new rules that must run on workspace packages too (it
  // gates packages/* and plugins/* from importing the legacy src/
  // tree).  Register it at WARN there as well; the same rule is also
  // available inside src/* for symmetry but only fires when a src/
  // file imports another src/ via an absolute "src/..." path (rare).
  {
    files: ['packages/**/*.{ts,tsx}', 'plugins/**/*.{ts,tsx}', 'apps/**/*.{ts,tsx}'],
    languageOptions: sharedLanguageOptions,
    plugins: { pryzm },
    rules: {
      'pryzm/no-legacy-src-import': 'warn',
    },
  },

  // ── k6 load harness (L-800) — runs inside the k6 runtime, not node ──────────
  // `tools/load-test/pryzm-load.js` is executed by the k6 binary, which injects
  // `__ENV` (and `__VU` / `__ITER`) as globals and resolves the bare `k6/*`
  // module specifiers itself. Node and eslint know none of that, so without this
  // block the file reports 7 `no-undef` errors for a global that is genuinely
  // present at runtime.
  //
  // Declared rather than silenced: `no-undef` stays ON for this file, so a REAL
  // typo is still caught — only the three globals k6 actually provides are
  // exempted. Turning the rule off for the file would have been one line shorter
  // and would have hidden the next genuine undefined reference.
  {
    files: ['tools/load-test/**/*.js'],
    languageOptions: {
      ...sharedLanguageOptions,
      globals: {
        ...sharedLanguageOptions.globals,
        __ENV: 'readonly',
        __VU: 'readonly',
        __ITER: 'readonly',
      },
    },
  },
];
