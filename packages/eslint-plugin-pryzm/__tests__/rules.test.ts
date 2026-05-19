import { describe, expect, it } from 'vitest';
import { Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { resolve } from 'node:path';
import pryzm from '../src/index.js';

const linter = new Linter();
const CWD = process.cwd();

function lint(code: string, relPath: string, rule: string) {
  // Anchor the synthetic filename under cwd so the flat-config matcher includes it,
  // while preserving the kernel-path substring used by `pryzm/no-three-in-kernel`.
  const filename = resolve(CWD, relPath.replace(/^\/+/, ''));
  const all = linter.verify(code, [{
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    plugins: { pryzm },
    rules: { [rule]: 'error' },
  }], { filename });
  // Ignore parser-level / config-level messages — we only care about THIS rule.
  return all.filter(m => m.ruleId === rule);
}

describe('pryzm/affected-stores-required', () => {
  it('passes when CommandHandler class has affectedStores', () => {
    const code = `
      class CreateWall implements CommandHandler<{ a: number }> {
        readonly affectedStores = ['wall'] as const;
        canExecute() { return { valid: true as const }; }
        async execute() { return { forward: [], inverse: [] }; }
      }
    `;
    const msgs = lint(code, 'plugins/wall/handlers/CreateWall.ts', 'pryzm/affected-stores-required');
    expect(msgs).toHaveLength(0);
  });

  it('fails when CommandHandler class is missing affectedStores', () => {
    const code = `
      class CreateWall implements CommandHandler<{ a: number }> {
        canExecute() { return { valid: true as const }; }
        async execute() { return { forward: [], inverse: [] }; }
      }
    `;
    const msgs = lint(code, 'plugins/wall/handlers/CreateWall.ts', 'pryzm/affected-stores-required');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('missing');
  });

  it('also fails for a class implementing the legacy `Command` interface (pryzm2/ mode, spec line 298)', () => {
    const code = `
      class CreateWall implements Command<{ a: number }> {
        async execute() { return { forward: [], inverse: [] }; }
      }
    `;
    const msgs = lint(code, 'plugins/wall/handlers/CreateWall.ts', 'pryzm/affected-stores-required');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('missing');
  });

  it('ignores classes that do not implement CommandHandler', () => {
    const code = `class Anything { foo() { return 1; } }`;
    const msgs = lint(code, 'src/Anything.ts', 'pryzm/affected-stores-required');
    expect(msgs).toHaveLength(0);
  });
});

describe('pryzm/no-three-in-kernel', () => {
  it('blocks `import * as THREE from "three"` inside the kernel', () => {
    const code = `import * as THREE from 'three'; export const x = THREE;`;
    const msgs = lint(code, '/repo/packages/geometry-kernel/producers/wall.ts', 'pryzm/no-three-in-kernel');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('forbidden');
  });

  it('blocks OBC imports inside the kernel', () => {
    const code = `import * as OBC from '@thatopen/components';`;
    const msgs = lint(code, '/repo/packages/geometry-kernel/producers/slab.ts', 'pryzm/no-three-in-kernel');
    expect(msgs).toHaveLength(1);
  });

  it('allows THREE imports outside the kernel', () => {
    const code = `import * as THREE from 'three';`;
    const msgs = lint(code, '/repo/packages/scene-committer/SceneCommitter.ts', 'pryzm/no-three-in-kernel');
    expect(msgs).toHaveLength(0);
  });

  it('does nothing for non-kernel files', () => {
    const code = `import { foo } from 'three';`;
    const msgs = lint(code, '/repo/src/legacy.ts', 'pryzm/no-three-in-kernel');
    expect(msgs).toHaveLength(0);
  });
});

describe('pryzm/no-raf', () => {
  it('blocks bare requestAnimationFrame outside the scheduler', () => {
    const code = `function tick() { requestAnimationFrame(tick); }`;
    const msgs = lint(code, 'packages/legacy-shim/src/loop.ts', 'pryzm/no-raf');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('forbidden');
  });

  it('blocks window.requestAnimationFrame outside the scheduler', () => {
    const code = `window.requestAnimationFrame(() => {});`;
    const msgs = lint(code, 'packages/renderer/src/loop.ts', 'pryzm/no-raf');
    expect(msgs).toHaveLength(1);
  });

  it('blocks globalThis.requestAnimationFrame outside the scheduler', () => {
    const code = `globalThis.requestAnimationFrame(() => {});`;
    const msgs = lint(code, 'packages/renderer/src/loop.ts', 'pryzm/no-raf');
    expect(msgs).toHaveLength(1);
  });

  it('allows requestAnimationFrame inside packages/frame-scheduler/', () => {
    const code = `function pump() { requestAnimationFrame(pump); }`;
    const msgs = lint(code, 'packages/frame-scheduler/src/Pump.ts', 'pryzm/no-raf');
    expect(msgs).toHaveLength(0);
  });

  it('does not flag unrelated method calls named requestAnimationFrame on other objects', () => {
    const code = `const fakeObj = { requestAnimationFrame: () => {} }; fakeObj.requestAnimationFrame();`;
    const msgs = lint(code, 'packages/renderer/src/x.ts', 'pryzm/no-raf');
    expect(msgs).toHaveLength(0);
  });
});

// ── Z.3 (S77-WIRE) — pryzm/single-raf alias ───────────────────────────────
describe('pryzm/single-raf', () => {
  it('is the same rule as pryzm/no-raf (alias from Z.3)', () => {
    const code = `function tick() { requestAnimationFrame(tick); }`;
    const msgs = lint(code, 'packages/legacy-shim/src/loop.ts', 'pryzm/single-raf');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('forbidden');
  });
});

// ── Z.3 (S77-WIRE) — pryzm/no-second-canvas ───────────────────────────────
describe('pryzm/no-second-canvas', () => {
  it('blocks document.createElement("canvas") outside packages/renderer/', () => {
    const code = `const c = document.createElement('canvas');`;
    const msgs = lint(code, 'src/engine/RenderPipelineManager.ts', 'pryzm/no-second-canvas');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('forbidden');
  });

  it('blocks the double-quoted form too', () => {
    const code = `document.createElement("canvas");`;
    const msgs = lint(code, 'plugins/picking/src/Picker.ts', 'pryzm/no-second-canvas');
    expect(msgs).toHaveLength(1);
  });

  it('allows document.createElement("canvas") inside packages/renderer/', () => {
    const code = `const c = document.createElement('canvas');`;
    const msgs = lint(code, 'packages/renderer/src/Renderer.ts', 'pryzm/no-second-canvas');
    expect(msgs).toHaveLength(0);
  });

  it('does not flag document.createElement("div") (other tags)', () => {
    const code = `document.createElement('div');`;
    const msgs = lint(code, 'src/engine/anything.ts', 'pryzm/no-second-canvas');
    expect(msgs).toHaveLength(0);
  });

  it('does not flag dynamic createElement(tag) — caught only by §26.5 drilldown', () => {
    const code = `const tag = 'canvas'; document.createElement(tag);`;
    const msgs = lint(code, 'src/engine/anything.ts', 'pryzm/no-second-canvas');
    expect(msgs).toHaveLength(0);
  });
});

// ── Z.4 (S77-WIRE) — pryzm/no-runtime-package-import ──────────────────────
describe('pryzm/no-runtime-package-import', () => {
  it('blocks `import {x} from "@pryzm/runtime-composer"` inside src/ui/', () => {
    const code = `import { composeRuntime } from '@pryzm/runtime-composer';`;
    const msgs = lint(code, 'src/ui/SomePanel.ts', 'pryzm/no-runtime-package-import');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('forbidden');
  });

  it('blocks subpath imports too (@pryzm/runtime-composer/types)', () => {
    const code = `import type { PryzmRuntime } from '@pryzm/runtime-composer/types';`;
    const msgs = lint(code, 'src/ui/SomePanel.ts', 'pryzm/no-runtime-package-import');
    expect(msgs).toHaveLength(1);
  });

  it('blocks dynamic import("@pryzm/runtime-composer") from src/ui/', () => {
    const code = `async function f() { const m = await import('@pryzm/runtime-composer'); return m; }`;
    const msgs = lint(code, 'src/ui/SomePanel.ts', 'pryzm/no-runtime-package-import');
    expect(msgs).toHaveLength(1);
  });

  it('allows the import outside src/ui/', () => {
    const code = `import { composeRuntime } from '@pryzm/runtime-composer';`;
    const msgs = lint(code, 'apps/editor/src/main.ts', 'pryzm/no-runtime-package-import');
    expect(msgs).toHaveLength(0);
  });

  it('allows OTHER @pryzm package imports from src/ui/ (only runtime-composer is gated)', () => {
    const code = `import { ProjectListClient } from '@pryzm/persistence-client';`;
    const msgs = lint(code, 'src/ui/platform/ProjectHub.ts', 'pryzm/no-runtime-package-import');
    expect(msgs).toHaveLength(0);
  });
});

// ── Z.4 (S77-WIRE) — pryzm/no-legacy-src-import ───────────────────────────
describe('pryzm/no-legacy-src-import', () => {
  it('blocks workspace package importing relatively into top-level src/', () => {
    const code = `import { X } from '../../../src/legacy-helper';`;
    const msgs = lint(code, 'packages/foo/src/bar.ts', 'pryzm/no-legacy-src-import');
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('forbidden');
  });

  it('blocks plugin importing from "src/" alias', () => {
    const code = `import { X } from 'src/legacy';`;
    const msgs = lint(code, 'plugins/wall/src/something.ts', 'pryzm/no-legacy-src-import');
    expect(msgs).toHaveLength(1);
  });

  it('allows package importing its own internal src/ (relative)', () => {
    const code = `import { Helper } from './helpers';`;
    const msgs = lint(code, 'packages/foo/src/bar.ts', 'pryzm/no-legacy-src-import');
    expect(msgs).toHaveLength(0);
  });

  it('allows workspace package importing other workspace packages by alias', () => {
    const code = `import { Bus } from '@pryzm/command-bus';`;
    const msgs = lint(code, 'packages/foo/src/bar.ts', 'pryzm/no-legacy-src-import');
    expect(msgs).toHaveLength(0);
  });

  it('does not apply to files in the top-level src/ tree itself', () => {
    const code = `import { X } from './neighbor';`;
    const msgs = lint(code, 'src/engine/EngineBootstrap.ts', 'pryzm/no-legacy-src-import');
    expect(msgs).toHaveLength(0);
  });
});

describe('pryzm/no-engine-bootstrap-shim', () => {
  const RULE = 'pryzm/no-engine-bootstrap-shim';

  it('flags a static import of engine/EngineBootstrap from a non-allowlisted file', () => {
    const code = `import type { EngineBootstrap } from '../engine/EngineBootstrap';`;
    const msgs = lint(code, 'src/ui/SomePanel.ts', RULE);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('forbidden');
  });

  it('flags a static import of engine/EngineBootstrap.ts with extension', () => {
    const code = `import type { EngineBootstrap } from '../engine/EngineBootstrap.ts';`;
    const msgs = lint(code, 'src/tools/SomeTool.ts', RULE);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('forbidden');
  });

  it('does not flag imports that do NOT reference engine/EngineBootstrap', () => {
    const code = `import type { PryzmRuntime } from '@pryzm/runtime-composer';`;
    const msgs = lint(code, 'src/ui/SomePanel.ts', RULE);
    expect(msgs).toHaveLength(0);
  });

  it('does not flag the shim file itself importing from @pryzm/runtime-composer', () => {
    const code = `import type { PryzmRuntime } from '@pryzm/runtime-composer';`;
    const msgs = lint(code, 'src/engine/EngineBootstrap.ts', RULE);
    expect(msgs).toHaveLength(0);
  });

  it('flags a dynamic import of engine/EngineBootstrap from a non-allowlisted file', () => {
    const code = `const mod = await import('./engine/EngineBootstrap');`;
    const msgs = lint(code, 'src/ui/SomeOtherPanel.ts', RULE);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('forbiddenDynamic');
  });

  it('S86-WIRE: flags a dynamic import of engine/EngineBootstrap from src/main.ts (allowlist empty after S86-WIRE — main.ts now uses engineLauncher)', () => {
    const code = `const mod = await import('./engine/EngineBootstrap');`;
    const msgs = lint(code, 'src/main.ts', RULE);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('forbiddenDynamic');
  });

  it('does not flag an import of a similarly-named but different module', () => {
    const code = `import { helper } from '../core/BootstrapHelper';`;
    const msgs = lint(code, 'src/ui/SomePanel.ts', RULE);
    expect(msgs).toHaveLength(0);
  });
});

// ── pryzm/no-l7-direct-import ────────────────────────────────────────────────

describe('pryzm/no-l7-direct-import', () => {
  const RULE = 'pryzm/no-l7-direct-import';

  it('errors when a non-allowlisted plugin package imports an L0-L5 package', () => {
    const code = `import { PryzmRuntime } from '@pryzm/runtime-composer';`;
    const msgs = lint(code, 'packages/plugin-my-new-plugin/src/index.ts', RULE);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('forbidden');
  });

  it('warns (not errors) when an allowlisted plugin imports an L0-L5 package', () => {
    // The lint() helper uses severity 'error' for the rule — so we can't
    // distinguish warn vs error at the message level.  Instead we confirm
    // that allowlisted packages DO produce a message (messageId 'transitional')
    // while non-allowlisted ones produce 'forbidden'.
    const code = `import { CommandBus } from '@pryzm/command-bus';`;
    const msgs = lint(code, 'packages/plugin-bcf/src/index.ts', RULE);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('transitional');
  });

  it('warns for each allowlisted plugin — plugin-ifc-export', () => {
    const code = `import { Store } from '@pryzm/stores';`;
    const msgs = lint(code, 'packages/plugin-ifc-export/src/exporter.ts', RULE);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('transitional');
  });

  it('warns for each allowlisted plugin — plugin-ifc-import', () => {
    const code = `import { Store } from '@pryzm/stores';`;
    const msgs = lint(code, 'packages/plugin-ifc-import/src/importer.ts', RULE);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('transitional');
  });

  it('warns for each allowlisted plugin — plugin-ifc-inspector', () => {
    const code = `import { Store } from '@pryzm/stores';`;
    const msgs = lint(code, 'packages/plugin-ifc-inspector/src/inspector.ts', RULE);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('transitional');
  });

  it('warns for each allowlisted plugin — plugin-rhino-import', () => {
    const code = `import { Store } from '@pryzm/stores';`;
    const msgs = lint(code, 'packages/plugin-rhino-import/src/index.ts', RULE);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('transitional');
  });

  it('allows importing @pryzm/sdk (L6 facade) from any plugin', () => {
    const code = `import { createPlugin } from '@pryzm/sdk';`;
    const msgs = lint(code, 'packages/plugin-my-new-plugin/src/index.ts', RULE);
    expect(msgs).toHaveLength(0);
  });

  it('does not apply to files outside packages/plugin-* (e.g. packages/runtime-composer)', () => {
    const code = `import { PryzmRuntime } from '@pryzm/runtime-composer';`;
    const msgs = lint(code, 'packages/runtime-composer/src/composeRuntime.ts', RULE);
    expect(msgs).toHaveLength(0);
  });

  it('does not apply to files in the top-level src/ tree', () => {
    const code = `import { CommandBus } from '@pryzm/command-bus';`;
    const msgs = lint(code, 'src/ui/SomePanel.ts', RULE);
    expect(msgs).toHaveLength(0);
  });

  it('does not apply to files in the plugins/ stub directory', () => {
    const code = `import { Store } from '@pryzm/stores';`;
    const msgs = lint(code, 'plugins/bcf/src/index.ts', RULE);
    expect(msgs).toHaveLength(0);
  });

  it('catches a dynamic import in a non-allowlisted plugin', () => {
    const code = `const mod = await import('@pryzm/runtime-composer');`;
    const msgs = lint(code, 'packages/plugin-custom/src/index.ts', RULE);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('forbidden');
  });

  it('does not flag relative imports inside a plugin package', () => {
    const code = `import { helper } from './helper';`;
    const msgs = lint(code, 'packages/plugin-my-new-plugin/src/index.ts', RULE);
    expect(msgs).toHaveLength(0);
  });

  it('does not flag third-party (non-@pryzm) imports', () => {
    const code = `import { z } from 'zod';`;
    const msgs = lint(code, 'packages/plugin-my-new-plugin/src/index.ts', RULE);
    expect(msgs).toHaveLength(0);
  });
});

// ── pryzm/no-l7-allowlist-grow ───────────────────────────────────────────────

describe('pryzm/no-l7-allowlist-grow', () => {
  const RULE = 'pryzm/no-l7-allowlist-grow';

  // NOTE: The test helper's `files` pattern only matches `.ts`/`.tsx` paths.
  // The rule uses a substring check (`includes('rules/no-l7-direct-import')`)
  // that is extension-agnostic, so using `.ts` here is valid for testing.
  const RULE_FILE_PATH = 'packages/eslint-plugin-pryzm/src/rules/no-l7-direct-import.ts';

  it('allows TRANSITIONAL_ALLOWLIST with exactly 5 entries in the rule file', () => {
    const code = `
      const TRANSITIONAL_ALLOWLIST = new Set([
        'packages/plugin-bcf',
        'packages/plugin-ifc-export',
        'packages/plugin-ifc-import',
        'packages/plugin-ifc-inspector',
        'packages/plugin-rhino-import',
      ]);
    `;
    const msgs = lint(code, RULE_FILE_PATH, RULE);
    expect(msgs).toHaveLength(0);
  });

  it('flags TRANSITIONAL_ALLOWLIST with 6 entries (grown beyond baseline)', () => {
    const code = `
      const TRANSITIONAL_ALLOWLIST = new Set([
        'packages/plugin-bcf',
        'packages/plugin-ifc-export',
        'packages/plugin-ifc-import',
        'packages/plugin-ifc-inspector',
        'packages/plugin-rhino-import',
        'packages/plugin-extra-new',
      ]);
    `;
    const msgs = lint(code, RULE_FILE_PATH, RULE);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('tooLarge');
  });

  it('flags a dynamic TRANSITIONAL_ALLOWLIST.add() call in the rule file', () => {
    const code = `TRANSITIONAL_ALLOWLIST.add('packages/plugin-sneaky');`;
    const msgs = lint(code, RULE_FILE_PATH, RULE);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].messageId).toBe('dynamicAdd');
  });

  it('does not apply to files that are NOT the no-l7-direct-import rule file', () => {
    const code = `
      const TRANSITIONAL_ALLOWLIST = new Set([
        'a', 'b', 'c', 'd', 'e', 'f',
      ]);
    `;
    const msgs = lint(code, 'packages/runtime-composer/src/composeRuntime.ts', RULE);
    expect(msgs).toHaveLength(0);
  });
});
