// §FEAT-SWIMMING-POOL-ELEMENT (L-292) — THE NO-LITERALS GUARD.
//
// Modelled on `apps/editor/__tests__/windowCreationParity.test.ts` P-4, whose comment
// says it best: *"the bug was literals, so the test forbids literals. A future edit
// that re-introduces `1.2` reds this file."*
//
// L-127 is the most-repeated defect in this codebase, and it has been paid for by the
// door, the window and every plan tool. The founder pre-empted it for the pool in the
// ticket itself: **"The founder said 1.2 m; that is a DEFAULT, not a CONSTANT."**
//
// So: `POOL_DIMENSION_DEFAULTS` (in PoolDimensions.ts) is the ONLY place in the entire
// tree where a pool dimension may be written as a number. This test asserts that at
// SOURCE level — the only level at which it can actually be enforced, because a
// runtime test can only catch the literals it happens to exercise.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SRC = join(HERE, '..', 'src');

/** The ONE file allowed to contain pool dimension literals — it IS the default table. */
const DEFAULTS_FILE = 'PoolDimensions.ts';

/** Strip comments. The sources DOCUMENT the forbidden numbers on purpose (naming the
 *  bug is how it stays named); prose must not fail its own guard. */
function codeOf(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
    .replace(/^\s*\/\/.*$/gm, '');      // line comments
}

function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...tsFilesUnder(p));
    else if (entry.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('§FEAT-SWIMMING-POOL-ELEMENT — no literal dimension survives in any pool builder (L-127)', () => {
  const files = tsFilesUnder(SRC);

  it('L-0: the guard is actually looking at something (a guard that scans nothing cannot fail)', () => {
    // The founder's own lesson: he nearly shipped a guard that could not fail. If a
    // refactor moves or renames the sources, this suite must NOT silently pass.
    expect(files.length).toBeGreaterThanOrEqual(3);
    expect(files.map((f) => relative(SRC, f))).toContain(DEFAULTS_FILE);
    expect(files.some((f) => f.endsWith('PoolAssembly.ts'))).toBe(true);
  });

  it('L-1: NO pool dimension is assigned a numeric literal outside POOL_DIMENSION_DEFAULTS', () => {
    // The dimensional fields. Assigning any of them a bare number outside the default
    // table forks the dimensional truth (ADR-121 §4.4).
    const FIELDS = [
      'depth', 'height', 'thickness', 'wallThickness', 'floorThickness',
      'baseOffset', 'freeboard', 'opacity', 'surfaceElevation', 'bottomElevation',
    ];

    // A PROPERTY-KEY position only: preceded by `{`, `,` or the start of a line.
    //
    // The first draft of this guard was just `/\bdepth\s*:\s*[\d.]+/` and it went red
    // on `depth > 0 ? area * depth : 0` — the TERNARY's colon. That is a FALSE
    // POSITIVE, and a guard that fires on the wrong thing is no better than one that
    // cannot fire: the next author "fixes" it by loosening the regex, and the real
    // literal walks straight through the hole. So the position is pinned.
    const assignedLiteral = (field: string) =>
      new RegExp(String.raw`(?:^\s*|[{,]\s*)${field}\s*:\s*-?[\d.]+`, 'm');

    for (const file of files) {
      const name = relative(SRC, file);
      if (name === DEFAULTS_FILE) continue;   // the default table is the ONE exception
      const code = codeOf(file);
      for (const field of FIELDS) {
        expect(code, `${name}: \`${field}\` is assigned a numeric literal — it must resolve through resolvePoolDimensions()`)
          .not.toMatch(assignedLiteral(field));
      }
    }
  });

  it('L-1b: ...and the L-1 regex ACTUALLY MATCHES a real literal (a guard that cannot fail is not a guard)', () => {
    // The founder nearly shipped a guard that could not fail (his circular-column
    // radius assertion, which a SQUARE also satisfied). So this guard is guarded:
    // prove the matcher fires on the exact defect it exists to catch, and does NOT
    // fire on the ternary that produced the false positive above.
    const assignedLiteral = (field: string) =>
      new RegExp(String.raw`(?:^\s*|[{,]\s*)${field}\s*:\s*-?[\d.]+`, 'm');

    expect('  height: 1.2,').toMatch(assignedLiteral('height'));          // the bug
    expect('{ depth: 1.2 }').toMatch(assignedLiteral('depth'));           // the bug, inline
    expect('  baseOffset: -1.2,').toMatch(assignedLiteral('baseOffset')); // the bug, negative
    expect('const v = depth > 0 ? a * depth : 0;').not.toMatch(assignedLiteral('depth'));  // the ternary
    expect('  height: dims.depth,').not.toMatch(assignedLiteral('height'));                // the CURE
  });

  it('L-2: the founder\'s 1.2 m appears EXACTLY ONCE in the package — in the default table', () => {
    // The specific number from the brief. It is a default; it has one home.
    // WHAT WOULD THE BUG SCORE? A `height: 1.2` smuggled into PoolAssembly scores 2
    // occurrences and reds. A generic "no magic numbers" rule would not have named it.
    const hits = files.filter((f) => /(?<![\d.])1\.2(?![\d])/.test(codeOf(f)));
    expect(hits.map((f) => relative(SRC, f))).toEqual([DEFAULTS_FILE]);
  });

  it('L-3: every builder reads its dimensions through the ONE chokepoint', () => {
    // A builder that does not call resolvePoolDimensions() is, by construction, getting
    // its numbers from somewhere else — which is the disease.
    const assembly = codeOf(join(SRC, 'PoolAssembly.ts'));
    expect(assembly).toMatch(/resolvePoolDimensions\s*\(/);
    // ...and it uses the RESOLVED values, not the raw record fields (which are
    // `number | undefined` precisely so that reading them raw is a type error).
    expect(assembly).toMatch(/dims\.depth/);
    expect(assembly).toMatch(/dims\.wallThickness/);
    expect(assembly).toMatch(/dims\.freeboard/);
    expect(assembly).not.toMatch(/pool\.depth\b/);
    expect(assembly).not.toMatch(/pool\.freeboard\b/);
  });
});
