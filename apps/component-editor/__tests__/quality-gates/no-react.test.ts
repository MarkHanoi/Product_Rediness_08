// family-editor-no-react — §13 quality gate (S52 D2).
//
// The Family Creator is vanilla TS only — no React, Vue, Svelte,
// SolidJS, or any other framework runtime.  This gate enforces that
// across all source files in `apps/component-editor/src/**`.
//
// Checks:
//   1. No `import ... from 'react'` (or 'react-dom', or any subpath).
//   2. No `.tsx` / `.jsx` files in src/.

import { describe, expect, it } from 'vitest';
import { listAllSrcEntries, loadAllSrcFiles } from './_walk.js';

const REACT_IMPORT = /from\s+['"]react(-dom)?(\/[^'"]+)?['"]/;
const SIDE_EFFECT_REACT_IMPORT = /import\s+['"]react(-dom)?(\/[^'"]+)?['"]/;
const FORBIDDEN_FRAMEWORKS = /from\s+['"](vue|svelte|solid-js|preact)(\/[^'"]+)?['"]/;

describe('family-editor-no-react — §13 quality gate (S52 D2)', () => {
  it('no source file imports react / react-dom', async () => {
    const files = await loadAllSrcFiles();
    const violators: string[] = [];
    for (const f of files) {
      if (REACT_IMPORT.test(f.stripped) || SIDE_EFFECT_REACT_IMPORT.test(f.stripped)) {
        violators.push(f.relPath);
      }
    }
    expect(violators, `react imports in: ${violators.join(', ') || '(none)'}`).toEqual([]);
  });

  it('no source file imports another framework runtime (vue / svelte / solid-js / preact)', async () => {
    const files = await loadAllSrcFiles();
    const violators: string[] = [];
    for (const f of files) {
      if (FORBIDDEN_FRAMEWORKS.test(f.stripped)) violators.push(f.relPath);
    }
    expect(
      violators,
      `framework imports in: ${violators.join(', ') || '(none)'}`,
    ).toEqual([]);
  });

  it('no .tsx / .jsx files exist under src/', async () => {
    const all = await listAllSrcEntries();
    const violators = all.filter((rel) => /\.(tsx|jsx)$/.test(rel));
    expect(violators, `JSX-bearing files: ${violators.join(', ') || '(none)'}`).toEqual([]);
  });
});
