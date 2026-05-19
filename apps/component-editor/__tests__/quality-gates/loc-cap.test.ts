// family-editor-300-loc-cap — §13 quality gate (S52 D3).
//
// Per the rewrite plan §13: no source file under `apps/component-editor/src/`
// may exceed 300 lines.  The cap is deliberately low — the original
// prototype's collapse traced back to a handful of 1500–2500 LoC files
// that nobody could safely refactor.  When a file approaches 300 lines
// the design pressure forces a split into smaller, single-responsibility
// modules.

import { describe, expect, it } from 'vitest';
import { loadAllSrcFiles } from './_walk.js';

const LOC_CAP = 300;

describe('family-editor-300-loc-cap — §13 quality gate (S52 D3)', () => {
  it(`every src/**/*.ts file is ≤ ${LOC_CAP} lines`, async () => {
    const files = await loadAllSrcFiles();
    const violators: Array<{ file: string; lines: number }> = [];
    for (const f of files) {
      const lines = f.content.split('\n').length;
      if (lines > LOC_CAP) violators.push({ file: f.relPath, lines });
    }
    const summary = violators.map((v) => `${v.file} (${v.lines} lines)`).join(', ');
    expect(violators, `Files exceeding the cap: ${summary || '(none)'}`).toEqual([]);
  });
});
