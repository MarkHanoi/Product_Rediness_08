// §FEAT-BALCONY-COMPOUND (L-5600) — THE NO-LITERALS GUARD.
//
// Modelled on `packages/geometry-pool/__tests__/poolNoLiterals.test.ts`, which is
// modelled in turn on `windowCreationParity.test.ts` P-4: *"the bug was literals, so
// the test forbids literals."*
//
// ⚠ THIS GUARD IS NOT SPECULATIVE FOR THE BALCONY. The defect it forbids is ALREADY
// IN THIS REPO, for this element, today:
// `apps/editor/src/ui/residential-building/ResidentialBuildingExecutor.ts:142-147`
// carries five module-scope balcony constants (1.4 depth, 2.5 min width, 0.2 slab,
// 1.1 guard, 0.05 inset) that no user can reach and nothing can override. That
// generator is out of this lane's scope, but it is precisely why the SECOND balcony
// producer must not be allowed to grow a sixth, seventh and eighth figure.
//
// `BALCONY_DIMENSION_DEFAULTS` (in BalconyDimensions.ts) is the ONLY place in this
// package where a balcony dimension may be written as a number. Asserted at SOURCE
// level — the only level at which it can be enforced, because a runtime test can only
// catch the literals it happens to exercise.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SRC = join(HERE, '..', 'src');

/** The ONE file allowed to contain balcony dimension literals — it IS the table. */
const DEFAULTS_FILE = 'BalconyDimensions.ts';

/**
 * The ONE tolerance file. `HOST_EDGE_TOLERANCE_M` is a COINCIDENCE tolerance, not a
 * balcony dimension, and it lives here rather than in the defaults table for that
 * reason — but it is still a number in a source file, so it is named rather than
 * quietly excluded.
 */
const GEOMETRY_FILE = 'BalconyGeometry.ts';

/** Strip comments. The sources DOCUMENT the forbidden numbers on purpose (naming the
 *  bug is how it stays named); prose must not fail its own guard. */
function codeOf(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/^\s*\/\/.*$/gm, ''); // line comments
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

/**
 * A PROPERTY-KEY position only: preceded by `{`, `,` or the start of a line.
 *
 * The pool's first draft of this matcher was a bare `/\bdepth\s*:\s*[\d.]+/` and it
 * went red on a TERNARY's colon. A guard that fires on the wrong thing is no better
 * than one that cannot fire — the next author loosens the regex and the real literal
 * walks through the hole. So the position is pinned, and L-2 below proves the matcher
 * still fires on the defect it exists to catch.
 */
const assignedLiteral = (field: string) =>
  new RegExp(String.raw`(?:^\s*|[{,]\s*)${field}\s*:\s*-?[\d.]+`, 'm');

describe('§FEAT-BALCONY-COMPOUND — no literal dimension survives in any balcony builder (L-127)', () => {
  const files = tsFilesUnder(SRC);

  it('L-0: the guard is actually looking at something (a guard that scans nothing cannot fail)', () => {
    // [[unsatisfiable-gate-decomposition-is-the-fix]], inverted: ask whether this can
    // ever go RED before trusting that it is GREEN. If a refactor moves or renames the
    // sources, this suite must NOT silently pass.
    expect(files.length).toBeGreaterThanOrEqual(3);
    const names = files.map((f) => relative(SRC, f));
    expect(names).toContain(DEFAULTS_FILE);
    expect(names).toContain(GEOMETRY_FILE);
    expect(names.some((n) => n.endsWith('BalconyAssembly.ts'))).toBe(true);
  });

  it('L-1: NO balcony dimension is assigned a numeric literal outside BALCONY_DIMENSION_DEFAULTS', () => {
    const FIELDS = [
      'width',
      'projection',
      'depth',
      'height',
      'railingHeight',
      'thickness',
      'slabThickness',
      'finishThickness',
      'diameter',
      'railDiameter',
      'baseOffset',
    ];

    for (const file of files) {
      const name = relative(SRC, file);
      if (name === DEFAULTS_FILE) continue; // the default table is the ONE exception
      const code = codeOf(file);
      for (const field of FIELDS) {
        expect(
          code,
          `${name}: \`${field}\` is assigned a numeric literal — it must resolve through resolveBalconyDimensions()`,
        ).not.toMatch(assignedLiteral(field));
      }
    }
  });

  it('L-2: ...and the L-1 matcher ACTUALLY FIRES on a real literal (a guard that cannot fail is not a guard)', () => {
    // The founder nearly shipped a guard that could not fail (a circular-column radius
    // assertion a SQUARE also satisfied). So this guard is guarded.
    expect('  railingHeight: 1.1,').toMatch(assignedLiteral('railingHeight'));
    expect('{ projection: 1.4 }').toMatch(assignedLiteral('projection'));
    expect('{ thickness: -0.2 }').toMatch(assignedLiteral('thickness'));
    // ...and does NOT fire on a ternary colon, which is the false positive that broke
    // the pool's first draft.
    expect('return depth > 0 ? area * depth : 0;').not.toMatch(assignedLiteral('depth'));
    // ...nor on a resolved read, which is the CORRECT shape.
    expect('thickness: dims.slabThickness,').not.toMatch(assignedLiteral('thickness'));
  });

  it('L-3: the ONE tolerance constant is NAMED, not scattered', () => {
    // `HOST_EDGE_TOLERANCE_M` is deliberately outside the dimension table (it is not a
    // balcony dimension), which makes it the obvious place for a second, unnamed
    // tolerance to appear. Pin that there is exactly one.
    const geom = codeOf(join(SRC, GEOMETRY_FILE));
    const declarations = geom.match(/export const [A-Z_]+_M\s*=/g) ?? [];
    expect(declarations).toHaveLength(1);
    expect(geom).toMatch(/export const HOST_EDGE_TOLERANCE_M\s*=/);
  });
});
