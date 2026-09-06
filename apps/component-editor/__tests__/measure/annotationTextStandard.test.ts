// annotationTextStandard — THE DRIFT GATE.
//
// `src/measure/annotationTextStandard.ts` RESTATES the SPEC-AUTODIMENSION
// §12.14 lettering constants that `packages/file-format/src/export/sheets/
// PaperTextStandard.ts` owns, because this app cannot import that leaf: the
// package's `exports` map publishes no subpath reaching it, and the one
// reachable door (`@pryzm/file-format/sheets`) drags `@pryzm/renderer-three`
// into a 180 KB gzip first-paint budget.
//
// A restated constant is only safe while something proves it still matches.
// This file is that something: it reads the canonical source OFF DISK and
// asserts every copied number agrees. If the sheets standard changes, the
// family editor fails here instead of quietly lettering dimensions at a
// different size from the sheets it prints onto.
//
// Do NOT delete this spec to "simplify" — deleting it converts a gated copy
// into an ungated one, which is the whole defect it prevents.
//
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { PKG_ROOT } from '../quality-gates/_walk.js';
import {
  CAP_HEIGHT_RATIO,
  DEFAULT_PAPER_TEXT_HEIGHT_MM,
  EDITOR_MIN_TEXT_PX,
  EDITOR_NOMINAL_PX_PER_PAPER_MM,
  LINE_ADVANCE_RATIO,
  MIN_PAPER_TEXT_HEIGHT_MM,
  capMmToEditorPx,
  emFromLetteringHeight,
  letteringHeightMm,
} from '../../src/measure/annotationTextStandard.js';

const CANONICAL = path.resolve(
  PKG_ROOT,
  '../../packages/file-format/src/export/sheets/PaperTextStandard.ts',
);

/** Read `export const NAME = <number>;` out of the canonical standard. */
function constant(source: string, name: string): number {
  const m = new RegExp(`export const ${name}\\s*=\\s*(-?[0-9.]+)\\s*;`).exec(source);
  if (!m) throw new Error(`PaperTextStandard.ts no longer declares ${name} as a literal.`);
  return Number(m[1]);
}

describe('annotationTextStandard — the copy still matches its source', () => {
  it('finds the canonical PaperTextStandard.ts on disk', async () => {
    // A gate whose subject has moved is a gate that proves nothing. If this
    // fails, find the file — do not delete the assertion.
    await expect(fs.stat(CANONICAL)).resolves.toBeTruthy();
  });

  it.each([
    ['CAP_HEIGHT_RATIO', () => CAP_HEIGHT_RATIO],
    ['MIN_PAPER_TEXT_HEIGHT_MM', () => MIN_PAPER_TEXT_HEIGHT_MM],
    ['DEFAULT_PAPER_TEXT_HEIGHT_MM', () => DEFAULT_PAPER_TEXT_HEIGHT_MM],
    ['LINE_ADVANCE_RATIO', () => LINE_ADVANCE_RATIO],
    ['EDITOR_MIN_TEXT_PX', () => EDITOR_MIN_TEXT_PX],
  ] as const)('%s equals the value in PaperTextStandard.ts', async (name, read) => {
    const source = await fs.readFile(CANONICAL, 'utf8');
    expect(read()).toBe(constant(source, name));
  });

  it('cites SPEC-AUTODIMENSION §12.14 in the canonical source, so the numbers have an owner', async () => {
    const source = await fs.readFile(CANONICAL, 'utf8');
    expect(source).toMatch(/SPEC-AUTODIMENSION|§?12\.14/);
  });
});

describe('§12.14 lettering conversions', () => {
  // The defect this ratio exists to prevent: handing a CAP HEIGHT straight to
  // `font-size` under-draws every annotation by ~28 %.
  it('converts a cap height to an em, never treating the two as interchangeable', () => {
    expect(emFromLetteringHeight(2.5)).toBeCloseTo(2.5 / 0.716, 9);
    // An em is always LARGER than the cap height it renders.
    expect(emFromLetteringHeight(2.5)).toBeGreaterThan(2.5);
  });

  it('clamps a requested cap height up to the §12.14 absolute floor', () => {
    expect(letteringHeightMm(0.2)).toBe(MIN_PAPER_TEXT_HEIGHT_MM);
    expect(letteringHeightMm(5)).toBe(5);
    // A style asking for nonsense gets the default, not NaN.
    expect(letteringHeightMm(Number.NaN)).toBe(DEFAULT_PAPER_TEXT_HEIGHT_MM);
    expect(letteringHeightMm(undefined)).toBe(DEFAULT_PAPER_TEXT_HEIGHT_MM);
  });

  it('never letters below the screen pixel floor, however far out the author zooms', () => {
    expect(capMmToEditorPx(DEFAULT_PAPER_TEXT_HEIGHT_MM, 0.0001))
      .toBe(EDITOR_MIN_TEXT_PX);
    expect(capMmToEditorPx(0.01, 0)).toBe(EDITOR_MIN_TEXT_PX);
  });

  // The nominal paper scale is chosen so a §12.14 2.5 mm value lands in the
  // 12-14 px band the rest of this app's chrome uses.
  it('renders a 2.5 mm dimension value legibly at the editor nominal scale', () => {
    const px = capMmToEditorPx(DEFAULT_PAPER_TEXT_HEIGHT_MM, EDITOR_NOMINAL_PX_PER_PAPER_MM);
    expect(px).toBeGreaterThan(EDITOR_MIN_TEXT_PX);
    expect(px).toBeGreaterThanOrEqual(12);
    expect(px).toBeLessThanOrEqual(16);
  });
});
