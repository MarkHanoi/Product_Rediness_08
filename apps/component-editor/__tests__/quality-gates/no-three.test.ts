// family-editor-no-three-leak — §13 quality gate (S52 D2).
//
// Per the rewrite plan §13: only `*Committer.ts` files may import
// THREE.  In `apps/component-editor/src/**` no Committer files exist
// yet (those live in `packages/scene-committer/`), so ZERO files in
// component-editor may statically import 'three'.  Lazy `await
// import('three')` calls are tolerated because the bundle-budget
// gate keeps them out of the first-paint chunk.

import { describe, expect, it } from 'vitest';
import { loadAllSrcFiles } from './_walk.js';

const STATIC_THREE_IMPORT = /import\s[\s\S]*?from\s+['"]three(\/[^'"]+)?['"]/;
const SIDE_EFFECT_THREE_IMPORT = /import\s+['"]three(\/[^'"]+)?['"]/;

describe('family-editor-no-three-leak — §13 quality gate (S52 D2)', () => {
  it('no source file outside *Committer.ts statically imports THREE', async () => {
    const files = await loadAllSrcFiles();
    const violators: string[] = [];
    for (const f of files) {
      if (f.relPath.endsWith('Committer.ts')) continue;
      if (STATIC_THREE_IMPORT.test(f.stripped) || SIDE_EFFECT_THREE_IMPORT.test(f.stripped)) {
        violators.push(f.relPath);
      }
    }
    expect(
      violators,
      `Static THREE imports in: ${violators.join(', ') || '(none)'}`,
    ).toEqual([]);
  });
});
