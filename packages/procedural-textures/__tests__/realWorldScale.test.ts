// §PROCEDURAL-PATTERNS L-1801/L-1802 — REAL-WORLD SCALE.
//
// ⭐ A wrongly-scaled parquet looks WORSE than a flat colour, because the eye knows
// how big a floorboard is. So the generator declares the real-world size of what it
// produced, and these tests hold that declaration to the millimetre dimensions the
// preset was authored with. C100 §10.2.c: "a map without a real-world scale is
// wallpaper, not a material."

import { describe, expect, it } from 'vitest';
import { PROCEDURAL_ID_PREFIX, PROCEDURAL_TEXTURE_SPECS } from '../src/presets.js';
import { buildLayout, generateProceduralTexture, proceduralRealWorldSizeM } from '../src/generate.js';
import { describeProceduralGenerator, listProceduralGenerators, proceduralTilingFor } from '../src/resolve.js';
import { herringboneLayout } from '../src/layouts/herringbone.js';
import { chevronLayout } from '../src/layouts/chevron.js';
import { hexagonLayout } from '../src/layouts/hexagon.js';
import { runningBondLayout } from '../src/layouts/runningBond.js';

describe('every generator declares its real-world size, and the declaration is the layout', () => {
  for (const spec of PROCEDURAL_TEXTURE_SPECS) {
    it(`${spec.id} declares metres that match its millimetres`, () => {
      const layout = buildLayout(spec.layout);
      const declared = proceduralRealWorldSizeM(spec.layout);
      expect(declared.x).toBeCloseTo(layout.cellWidthMm / 1000, 9);
      expect(declared.y).toBeCloseTo(layout.cellHeightMm / 1000, 9);
      // A floor repeat between 10 cm and 8 m. Outside that something is wrong by
      // orders of magnitude, which is the failure mode this bound exists to catch.
      expect(declared.x).toBeGreaterThan(0.1);
      expect(declared.x).toBeLessThan(8);
      expect(declared.y).toBeGreaterThan(0.1);
      expect(declared.y).toBeLessThan(8);
    });
  }
});

describe('the size is knowable WITHOUT rasterising', () => {
  it('describeProceduralGenerator agrees with the generated set, having drawn nothing', () => {
    const spec = PROCEDURAL_TEXTURE_SPECS[0];
    if (!spec) throw new Error('no presets');
    const described = describeProceduralGenerator(spec.id);
    expect(described).toBeDefined();
    const generated = generateProceduralTexture(spec, 128);
    expect(described?.realWorldSizeM.x).toBeCloseTo(generated.realWorldSizeM.x, 9);
    expect(described?.realWorldSizeM.y).toBeCloseTo(generated.realWorldSizeM.y, 9);
  });

  it('every generator is describable, and unknown ids are undefined, never a default', () => {
    expect(listProceduralGenerators().length).toBe(PROCEDURAL_TEXTURE_SPECS.length);
    // ⛔ C100 §5 — no silent fallback. An unknown source must be VISIBLY unresolved.
    expect(describeProceduralGenerator('procedural:does-not-exist')).toBeUndefined();
    expect(describeProceduralGenerator('textures/oak.ktx2')).toBeUndefined();
  });
});

describe('the repeat cells are the arithmetic the layouts claim', () => {
  it('herringbone repeats at exactly 2L x 2L for every ratio', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const l = herringboneLayout({ staveWidthMm: 70, lengthRatio: n, jointMm: 0 });
      expect(l.cellWidthMm).toBeCloseTo(2 * 70 * n, 9);
      expect(l.cellHeightMm).toBeCloseTo(2 * 70 * n, 9);
      expect(l.pieces.length).toBe(4 * n);
    }
  });

  it('chevron repeats at 2*L*cos(theta) by W/cos(theta)', () => {
    for (const deg of [30, 45, 60]) {
      const t = (deg * Math.PI) / 180;
      const l = chevronLayout({ staveWidthMm: 90, staveLengthMm: 600, angleDeg: deg, jointMm: 0, repeatX: 1, repeatY: 1 });
      expect(l.cellWidthMm).toBeCloseTo(2 * 600 * Math.cos(t), 6);
      expect(l.cellHeightMm).toBeCloseTo(90 / Math.cos(t), 6);
    }
  });

  it('hexagon repeats over TWO rows, not one', () => {
    const A = 200;
    const R = A / Math.sqrt(3);
    const l = hexagonLayout({ acrossFlatsMm: A, groutMm: 0, repeatX: 1, repeatY: 1 });
    expect(l.cellWidthMm).toBeCloseTo(A, 9);
    expect(l.cellHeightMm).toBeCloseTo(3 * R, 6);
    expect(l.pieces.length).toBe(2);
  });

  it('running bond row period is computed from the offset, not chosen', () => {
    // 1/3 bond over 1 column repeats every 3 rows; over 2 columns every 6.
    expect(runningBondLayout({ lengthMm: 1200, widthMm: 180, jointMm: 0, offsetNum: 1, offsetDen: 3, repeatX: 1, repeatY: 1 }).cellHeightMm).toBeCloseTo(3 * 180, 9);
    expect(runningBondLayout({ lengthMm: 1200, widthMm: 180, jointMm: 0, offsetNum: 1, offsetDen: 3, repeatX: 2, repeatY: 1 }).cellHeightMm).toBeCloseTo(6 * 180, 9);
    // Stack bond has no drift, so one row is a legitimate period.
    expect(runningBondLayout({ lengthMm: 600, widthMm: 600, jointMm: 0, offsetNum: 0, offsetDen: 1, repeatX: 3, repeatY: 1 }).cellHeightMm).toBeCloseTo(600, 9);
  });
});

describe('grout is a MEASURED fraction of the surface, not a decoration', () => {
  it('a 600 x 600 tile with 3 mm grout gives the grout fraction the arithmetic predicts', () => {
    const spec = PROCEDURAL_TEXTURE_SPECS.find((s) => s.id === 'procedural:tile-porcelain-600-stack');
    if (!spec) throw new Error('preset missing');
    const set = generateProceduralTexture(spec, 1024);
    const module = 603;
    const face = module - 3;
    const expected = 1 - (face * face) / (module * module);
    // Sampling a 2.5 px grout line on a pixel grid cannot be exact; it must be close.
    expect(set.diagnostics.jointCoverage).toBeGreaterThan(expected * 0.7);
    expect(set.diagnostics.jointCoverage).toBeLessThan(expected * 1.4);
    // ⭐ And it must not be ZERO. A tile floor without grout lines is a coloured plane.
    expect(set.diagnostics.jointCoverage).toBeGreaterThan(0.002);
  });

  it('every tile preset actually draws grout', () => {
    for (const spec of PROCEDURAL_TEXTURE_SPECS.filter((s) => s.family === 'tile')) {
      const set = generateProceduralTexture(spec, 512);
      expect(set.diagnostics.jointCoverage, spec.id).toBeGreaterThan(0.002);
      expect(set.diagnostics.overlapPx, spec.id).toBe(0);
    }
  });
});

describe('the full PBR set is produced, not just colour', () => {
  it('a parquet carries a real normal map, so it does not read as printed vinyl', () => {
    const spec = PROCEDURAL_TEXTURE_SPECS.find((s) => s.id === 'procedural:parquet-oak-herringbone');
    if (!spec) throw new Error('preset missing');
    const set = generateProceduralTexture(spec, 512);
    const n = set.normal.data;
    expect(set.normal.width).toBe(set.albedo.width);
    expect(set.roughness.width).toBe(set.albedo.width);
    // A flat normal map is (128,128,255) everywhere. Count pixels that deviate: the
    // chamfer at every stave edge must move a real share of them.
    let tilted = 0;
    for (let i = 0; i < n.length; i += 4) {
      if (Math.abs((n[i] as number) - 127.5) > 6 || Math.abs((n[i + 1] as number) - 127.5) > 6) tilted++;
    }
    const fraction = tilted / (n.length / 4);
    expect(fraction).toBeGreaterThan(0.01);
    // ...and it must not be tilted EVERYWHERE either, or the face is not flat.
    expect(fraction).toBeLessThan(0.9);
  });

  it('roughness distinguishes the joint from the face', () => {
    const spec = PROCEDURAL_TEXTURE_SPECS.find((s) => s.id === 'procedural:tile-metro-white-subway');
    if (!spec) throw new Error('preset missing');
    const set = generateProceduralTexture(spec, 512);
    const r = set.roughness.data;
    let min = 255;
    let max = 0;
    for (let i = 0; i < r.length; i += 4) {
      const v = r[i] as number;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    // Glazed porcelain 0.22 vs grout 0.88 — a spread of well over 100 8-bit steps.
    expect(max - min).toBeGreaterThan(100);
  });
});

// ─── THE MAT-1 SEAM ────────────────────────────────────────────────────────────
// ⭐ `MaterialResolver.ts`'s `registerTextureLoader` docstring reserves the scheme
// `procedural:<generator-id>` and says the branch behind it is "UNWRITTEN on
// purpose: a scheme with no generator behind it is exactly the authored-but-unwired
// defect this repo keeps producing. It ships in MAT-3's slice, WITH its generators,
// or it does not ship." These tests hold this package to the shape that clause
// requires, so the wiring is an edit at ONE site and not a negotiation.

describe('the generator ids match MAT-1s reserved scheme, verbatim', () => {
  it('every id carries the procedural: scheme, not a rival spelling', () => {
    expect(PROCEDURAL_ID_PREFIX).toBe('procedural:');
    for (const spec of PROCEDURAL_TEXTURE_SPECS) {
      expect(spec.id.startsWith('procedural:'), spec.id).toBe(true);
      // ⛔ Never a path. MaterialMapPath REFUSES anything not under /items/, and a
      // generated texture has no file for that rule to be about.
      expect(spec.id.includes('/'), spec.id).toBe(false);
    }
    expect(new Set(PROCEDURAL_TEXTURE_SPECS.map((s) => s.id)).size).toBe(PROCEDURAL_TEXTURE_SPECS.length);
  });

  it('proceduralTilingFor returns MaterialTilings exact tuple shape', () => {
    for (const spec of PROCEDURAL_TEXTURE_SPECS) {
      const tiling = proceduralTilingFor(spec.id);
      expect(tiling, spec.id).toBeDefined();
      const size = tiling?.realWorldSizeM;
      expect(Array.isArray(size), spec.id).toBe(true);
      expect(size?.length, spec.id).toBe(2);
      // isUsableTiling()'s exact predicate, restated: both finite and > 0.
      expect(Number.isFinite(size?.[0]) && (size?.[0] as number) > 0, spec.id).toBe(true);
      expect(Number.isFinite(size?.[1]) && (size?.[1] as number) > 0, spec.id).toBe(true);
      // ...and it agrees with the layout it came from.
      const layout = buildLayout(spec.layout);
      expect(size?.[0]).toBeCloseTo(layout.cellWidthMm / 1000, 9);
      expect(size?.[1]).toBeCloseTo(layout.cellHeightMm / 1000, 9);
    }
  });

  it('an unknown id yields no tiling — a scale is never invented', () => {
    expect(proceduralTilingFor('procedural:not-a-generator')).toBeUndefined();
    expect(proceduralTilingFor('/items/textures/oak/color.webp')).toBeUndefined();
  });
});
