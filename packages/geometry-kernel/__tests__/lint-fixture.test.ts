// Real-enforcement proof for `pryzm/no-three-in-kernel` inside
// `packages/geometry-kernel/**` (S07-T3 exit criterion).
//
// We programmatically run the rule against the fixture file
// `__fixtures__/three-import.bad.ts`.  The fixture is matched by the
// `**/*.bad.ts` global ignore pattern in `eslint.config.js`, so the
// regular CI lint pass leaves it alone — only this test exercises it.

import { describe, expect, it } from 'vitest';
import { Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { resolve, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pryzm from '../../eslint-plugin-pryzm/src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureFile = resolve(__dirname, '../__fixtures__/three-import.bad.ts');

function lintKernelFile(filename: string): { ruleId: string | null; message: string }[] {
  const code = readFileSync(filename, 'utf8');
  const linter = new Linter();
  return linter.verify(
    code,
    [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tsParser,
          parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        },
        plugins: { pryzm },
        rules: { 'pryzm/no-three-in-kernel': 'error' },
      },
    ],
    { filename },
  );
}

describe('pryzm/no-three-in-kernel — real enforcement on packages/geometry-kernel/**', () => {
  it('hard-fails on a `import * as THREE from "three"` inside the kernel', () => {
    const messages = lintKernelFile(fixtureFile).filter(
      m => m.ruleId === 'pryzm/no-three-in-kernel',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]!.message).toMatch(/`three` is forbidden inside packages\/geometry-kernel/);
  });

  it('does not fire when the same import is OUTSIDE the kernel', () => {
    // Same source code, but the file path no longer matches the kernel pattern.
    const code = readFileSync(fixtureFile, 'utf8');
    const linter = new Linter();
    const messages = linter.verify(
      code,
      [
        {
          files: ['**/*.ts'],
          languageOptions: {
            parser: tsParser,
            parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
          },
          plugins: { pryzm },
          rules: { 'pryzm/no-three-in-kernel': 'error' },
        },
      ],
      { filename: resolve(__dirname, '../../scene-committer/src/probe.ts') },
    );
    const kernelHits = messages.filter(m => m.ruleId === 'pryzm/no-three-in-kernel');
    expect(kernelHits).toHaveLength(0);
  });
});
