/**
 * Tests for pryzm/no-l7-boundary-violation.
 *
 * Anchor: docs/archive/pryzm3-internal/04-PLAN-FORWARD/08-WAVE-4-SLOT-TYPING-ROUTING.md §3 PR 4.B.3
 *
 * Uses ESLint's Linter class directly (same pattern as rules.test.ts) to avoid
 * RuleTester flat-config incompatibility in a bare Node.js runner.
 */
import { Linter } from 'eslint';
import { resolve } from 'node:path';
import rule, { BLOCKED_PKGS, isPluginSrcFile, isBlockedImport } from '../src/rules/no-l7-boundary-violation.js';

// ESLint flat config only applies to files inside CWD; use cwd-rooted absolute paths.
const CWD = process.cwd();

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Unit tests for helper functions
// ---------------------------------------------------------------------------
const PLUGIN_SRC  = '/repo/plugins/wall/src/handlers/CreateWall.ts';
const PLUGIN_TEST = '/repo/plugins/wall/__tests__/handlers.test.ts';
const SRC_UI      = '/repo/src/ui/panels/PropertyPanel.ts';
const PACKAGES    = '/repo/packages/runtime-composer/src/index.ts';

assert(isPluginSrcFile(PLUGIN_SRC),   'plugin src file should match');
assert(!isPluginSrcFile(PLUGIN_TEST), 'plugin test file should be exempt');
assert(!isPluginSrcFile(SRC_UI),      'src/ui file should not match');
assert(!isPluginSrcFile(PACKAGES),    'packages file should not match');

assert(isBlockedImport('@pryzm/runtime-composer'),          'runtime-composer is blocked');
assert(isBlockedImport('@pryzm/command-bus'),               'command-bus is blocked');
assert(isBlockedImport('@pryzm/command-bus/CommandBus'),    'subpath still blocked');
assert(!isBlockedImport('@pryzm/plugin-sdk'),               'plugin-sdk is allowed');
assert(!isBlockedImport('@pryzm/plugin-sdk/hosts'),         'plugin-sdk subpath allowed');
assert(!isBlockedImport('react'),                           'third-party packages are allowed');
assert(BLOCKED_PKGS.size > 0,                              'BLOCKED_PKGS should have entries');

// ---------------------------------------------------------------------------
// ESLint Linter integration tests
// ---------------------------------------------------------------------------
const linter = new Linter();

const FLAT_CONFIG = [{
  files: ['**'],
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: { pryzm: { rules: { 'no-l7-boundary-violation': rule } } },
  rules: { 'pryzm/no-l7-boundary-violation': 'warn' },
}];

function lint(code, filename) {
  const msgs = linter.verify(code, FLAT_CONFIG, { filename });
  return msgs.filter(m => m.ruleId === 'pryzm/no-l7-boundary-violation');
}

// --- valid cases (expect 0 violations) ---
const valid = [
  {
    label: 'plugin-sdk import is allowed',
    filename: resolve(CWD, 'plugins/wall/src/handlers/CreateWall.ts'),
    code: `import { definePlugin } from '@pryzm/plugin-sdk';`,
  },
  {
    label: 'plugin-sdk subpath is allowed',
    filename: resolve(CWD, 'plugins/beam/src/tool.ts'),
    code: `import { CommandHost } from '@pryzm/plugin-sdk/hosts';`,
  },
  {
    label: 'type-only import of L0-L5 package is exempt',
    filename: resolve(CWD, 'plugins/door/src/handlers/CreateDoor.ts'),
    code: `import type { PryzmRuntime } from '@pryzm/runtime-composer';`,
  },
  {
    label: 'non-@pryzm imports are always fine',
    filename: resolve(CWD, 'plugins/column/src/tool.ts'),
    code: `import { z } from 'zod';`,
  },
  {
    label: 'src/ui files are not in L7 plugin scope',
    filename: resolve(CWD, 'src/ui/panels/PropertyPanel.ts'),
    code: `import { composeRuntime } from '@pryzm/runtime-composer';`,
  },
  {
    label: 'test files are exempt',
    filename: resolve(CWD, 'plugins/wall/__tests__/handlers.test.ts'),
    code: `import { composeRuntime } from '@pryzm/runtime-composer';`,
  },
  {
    label: 'packages/ files are not in L7 plugin scope',
    filename: resolve(CWD, 'packages/runtime-composer/src/index.ts'),
    code: `import { CommandBus } from '@pryzm/command-bus';`,
  },
];

for (const { label, filename, code } of valid) {
  const msgs = lint(code, filename);
  assert(msgs.length === 0, `valid: ${label} — expected 0 violations, got ${msgs.length}`);
}

// --- invalid cases (expect 1 violation each) ---
const invalid = [
  {
    label: 'runtime-composer import in plugin src',
    filename: resolve(CWD, 'plugins/wall/src/handlers/CreateWall.ts'),
    code: `import { composeRuntime } from '@pryzm/runtime-composer';`,
  },
  {
    label: 'command-bus import in plugin src',
    filename: resolve(CWD, 'plugins/beam/src/committer/beam-committer.ts'),
    code: `import { CommandBus } from '@pryzm/command-bus';`,
  },
  {
    label: 'subpath import of frame-scheduler in plugin src',
    filename: resolve(CWD, 'plugins/slab/src/tool.ts'),
    code: `import { FrameScheduler } from '@pryzm/frame-scheduler/FrameScheduler';`,
  },
  {
    label: 'stores import in plugin src',
    filename: resolve(CWD, 'plugins/roof/src/handlers/CreateRoof.ts'),
    code: `import { useStore } from '@pryzm/stores';`,
  },
  {
    label: 'renderer import in plugin src',
    filename: resolve(CWD, 'plugins/column/src/renderer-override.ts'),
    code: `import { Scene } from '@pryzm/renderer';`,
  },
];

for (const { label, filename, code } of invalid) {
  const msgs = lint(code, filename);
  assert(msgs.length === 1, `invalid: ${label} — expected 1 violation, got ${msgs.length}`);
  if (msgs.length === 1) {
    assert(msgs[0].messageId === 'forbidden', `invalid: ${label} — messageId should be 'forbidden', got '${msgs[0].messageId}'`);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const total = passed + failed;
if (failed > 0) {
  console.error(`\n[no-l7-boundary-violation] ${failed}/${total} tests FAILED.`);
  process.exit(1);
} else {
  console.log(`[no-l7-boundary-violation] all ${total} tests passed.`);
}
