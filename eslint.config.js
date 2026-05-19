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

const layerElements = [
  // L0 Persistence
  { type: 'L0-persistence', pattern: 'packages/persistence-client/**' },
  { type: 'L0-persistence', pattern: 'packages/file-format/**' },

  // L1 Domain Stores (schemas + protocol live here per `08-VISION.md §4`)
  { type: 'L1-schemas',     pattern: 'packages/schemas/**' },
  { type: 'L1-protocol',    pattern: 'packages/protocol/**' },
  { type: 'L1-stores',      pattern: 'packages/stores/**' },

  // L2 Command Bus
  { type: 'L2-command-bus', pattern: 'packages/command-bus/**' },

  // L3 Sync
  { type: 'L3-sync',        pattern: 'packages/sync/**' },

  // L4 Geometry Kernel
  { type: 'L4-kernel',      pattern: 'packages/geometry-kernel/**' },
  { type: 'L4-picking',     pattern: 'packages/picking/**' },

  // L5 Render Runtime
  { type: 'L5-scheduler',   pattern: 'packages/frame-scheduler/**' },
  { type: 'L5-committer',   pattern: 'packages/scene-committer/**' },
  { type: 'L5-renderer',    pattern: 'packages/renderer/**' },
  { type: 'L5-runtime',     pattern: 'packages/render-runtime/**' },
  { type: 'L5-view-state',  pattern: 'packages/view-state/**' },

  // L6 Plugin Host
  { type: 'L6-plugin-host', pattern: 'packages/plugin-host/**' },

  // L7 Presentation
  { type: 'L7-app',         pattern: 'apps/editor/**' },
  { type: 'L7-app',         pattern: 'apps/component-editor/**' },
  { type: 'L7-plugin',      pattern: 'plugins/**' },

  // L7.5 AI
  { type: 'L7-ai',          pattern: 'packages/ai-host/**' },
];

// "from N may import to ≤ N" is encoded explicitly to keep messages readable.
const allowedDependencies = [
  // L0 may only import from itself.
  { from: 'L0-persistence', allow: ['L0-persistence'] },

  // L1 may import L0 + itself.
  { from: 'L1-schemas',     allow: ['L0-persistence', 'L1-schemas'] },
  { from: 'L1-protocol',    allow: ['L0-persistence', 'L1-schemas', 'L1-protocol'] },
  { from: 'L1-stores',      allow: ['L0-persistence', 'L1-schemas', 'L1-protocol', 'L1-stores'] },

  // L2 may import L0-L1 + itself.
  {
    from: 'L2-command-bus',
    allow: ['L0-persistence', 'L1-schemas', 'L1-protocol', 'L1-stores', 'L2-command-bus'],
  },

  // L3
  {
    from: 'L3-sync',
    allow: [
      'L0-persistence', 'L1-schemas', 'L1-protocol', 'L1-stores',
      'L2-command-bus', 'L3-sync',
    ],
  },

  // L4 — the kernel.  L1 (DTO schemas) is its only *upward* dependency.
  // It MUST NOT import from stores (mutable state) or anything above.
  { from: 'L4-kernel',  allow: ['L1-schemas', 'L1-protocol', 'L4-kernel'] },
  { from: 'L4-picking', allow: ['L1-schemas', 'L1-protocol', 'L4-kernel', 'L4-picking'] },

  // L5 may import L0-L4 + itself.
  {
    from: ['L5-scheduler', 'L5-committer', 'L5-renderer', 'L5-runtime', 'L5-view-state'],
    allow: [
      'L0-persistence', 'L1-schemas', 'L1-protocol', 'L1-stores',
      'L2-command-bus', 'L3-sync',
      'L4-kernel', 'L4-picking',
      'L5-scheduler', 'L5-committer', 'L5-renderer', 'L5-runtime', 'L5-view-state',
    ],
  },

  // L6
  {
    from: 'L6-plugin-host',
    allow: [
      'L0-persistence', 'L1-schemas', 'L1-protocol', 'L1-stores',
      'L2-command-bus', 'L3-sync',
      'L4-kernel', 'L4-picking',
      'L5-scheduler', 'L5-committer', 'L5-renderer', 'L5-runtime', 'L5-view-state',
      'L6-plugin-host',
    ],
  },

  // L7 / L7.5 — anything goes downward.
  { from: 'L7-app',    allow: ['*'] },
  { from: 'L7-plugin', allow: ['*'] },
  { from: 'L7-ai',     allow: ['*'] },
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
];
