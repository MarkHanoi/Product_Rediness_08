#!/usr/bin/env node
// tools/scripts/check-lint-fixtures.mjs
//
// CI gate (S01-T6, spec line 218): for every PRYZM custom ESLint rule we
// keep a `*.bad.ts` and (where applicable) `*.good.ts` fixture under
// `packages/eslint-plugin-pryzm/__tests__/lint-fixtures/` (moved from
// `tools/eslint-plugin-pryzm/` by Z.5 on 2026-04-30).  This script runs
// the rule end-to-end via the ESLint Node API against each fixture and
// asserts the expected pass/fail outcome.
//
// Why a Node script instead of inline `bash + eslint` calls?
//   • Two of the rules (`pryzm/no-raf` and `pryzm/no-three-in-kernel`)
//     key off the file PATH, not just the AST.  We need to lint the
//     fixture *content* under a synthetic path (e.g. `packages/frame-scheduler/
//     src/Pump.ts`) — ESLint's API supports that via `lintText({ filePath })`,
//     the CLI does not.
//   • Keeps the CI workflow file readable (one step instead of seven).
//   • Catches a registry / loader regression in a single invocation.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import pryzm from 'eslint-plugin-pryzm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');
const FIX = join(REPO, 'packages', 'eslint-plugin-pryzm', '__tests__', 'lint-fixtures');

/**
 * Each case: file with the fixture content, synthetic path used by the
 * lint binary, the rule we expect to fire (`expectFires=true`) or stay
 * silent (`expectFires=false`).
 */
const CASES = [
  // ── pryzm/no-raf ─────────────────────────────────────────────────────────
  {
    rule: 'pryzm/no-raf',
    fixture: join(REPO, 'packages', 'legacy-shim', 'src', 'raf.bad.ts'),
    syntheticPath: 'src/raf.bad.ts',
    expectFires: true,
  },
  {
    rule: 'pryzm/no-raf',
    fixture: join(FIX, 'raf-outside-scheduler.bad.ts'),
    syntheticPath: 'packages/some-other/src/Bad.ts',
    expectFires: true,
  },
  {
    rule: 'pryzm/no-raf',
    fixture: join(FIX, 'raf-inside-scheduler.good.ts'),
    syntheticPath: 'packages/frame-scheduler/src/Pump.ts',
    expectFires: false,
  },

  // ── pryzm/affected-stores-required ───────────────────────────────────────
  {
    rule: 'pryzm/affected-stores-required',
    fixture: join(FIX, 'missing-affected-stores.bad.ts'),
    syntheticPath: 'packages/some-cmd/src/Bad.ts',
    expectFires: true,
  },
  {
    rule: 'pryzm/affected-stores-required',
    fixture: join(FIX, 'has-affected-stores.good.ts'),
    syntheticPath: 'packages/some-cmd/src/Good.ts',
    expectFires: false,
  },

  // ── pryzm/no-three-in-kernel ─────────────────────────────────────────────
  {
    rule: 'pryzm/no-three-in-kernel',
    fixture: join(FIX, 'three-in-kernel.bad.ts'),
    syntheticPath: 'packages/geometry-kernel/src/producers/Bad.ts',
    expectFires: true,
  },
  {
    rule: 'pryzm/no-three-in-kernel',
    fixture: join(FIX, 'no-three-outside-kernel.good.ts'),
    syntheticPath: 'packages/scene-committer/src/Good.ts',
    expectFires: false,
  },

  // ── pryzm/no-three-outside-committer ─────────────────────────────────────
  // S04-T10: scaffold lint rule — only the L5 committer + renderer surface
  // (and per-plugin committer.ts files) may import THREE.  Test fixtures
  // are exempted via the `__tests__/` path heuristic in the rule.
  {
    rule: 'pryzm/no-three-outside-committer',
    fixture: join(FIX, 'three-outside-committer.bad.ts'),
    syntheticPath: 'packages/some-other/src/Bad.ts',
    expectFires: true,
    // Four offending shapes in the fixture (static, subpath, dynamic, require).
    minMessages: 4,
  },
  {
    rule: 'pryzm/no-three-outside-committer',
    fixture: join(FIX, 'three-outside-committer.good.ts'),
    syntheticPath: 'packages/scene-committer/src/Good.ts',
    expectFires: false,
  },
  // Plugin committer.ts is allowed.
  {
    rule: 'pryzm/no-three-outside-committer',
    fixture: join(FIX, 'three-outside-committer.good.ts'),
    syntheticPath: 'plugins/wall/committer.ts',
    expectFires: false,
  },
];

let failed = 0;

for (const c of CASES) {
  const code = readFileSync(c.fixture, 'utf-8');
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { pryzm },
        rules: { [c.rule]: 'error' },
      },
    ],
  });

  const results = await eslint.lintText(code, { filePath: c.syntheticPath });
  const messages = (results[0]?.messages ?? []).filter(m => m.ruleId === c.rule);
  const fired = messages.length > 0;

  const tag = `${c.rule.padEnd(34)} · ${c.fixture.replace(REPO + '/', '').padEnd(70)}`;
  // Optional minimum-fire count assertion (used by rules with multiple
  // offending shapes per fixture — e.g. no-three-outside-committer).
  if (c.expectFires && c.minMessages !== undefined && messages.length < c.minMessages) {
    console.error(
      `FAIL ${tag} → expected ≥${c.minMessages} messages, got ${messages.length}`,
    );
    console.error('     messages:', messages.map(m => `${m.line}:${m.column} ${m.message}`));
    failed++;
    continue;
  }
  if (fired === c.expectFires) {
    console.log(`OK  ${tag} → ${fired ? `fired (${messages.length})` : 'silent'}`);
  } else {
    console.error(
      `FAIL ${tag} → expected ${c.expectFires ? 'fire' : 'silent'}, got ${fired ? 'fire' : 'silent'}`,
    );
    if (messages.length) console.error('     messages:', messages.map(m => `${m.line}:${m.column} ${m.message}`));
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n[lint-fixtures] ${failed} fixture(s) FAILED.`);
  process.exit(1);
}
console.log(`\n[lint-fixtures] all ${CASES.length} fixture cases OK.`);
