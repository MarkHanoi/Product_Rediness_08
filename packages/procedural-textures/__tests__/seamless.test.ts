// §PROCEDURAL-PATTERNS L-1803 — SEAMLESSNESS, PROVEN THREE WAYS.
//
// ⭐ Seamlessness is the one property a human eye catches instantly and a unit test
// can settle exactly, so it is settled exactly here — three arms, because the cheap
// arm is the weak one and shipping only the cheap arm would be the defect this
// package exists to avoid.
//
//  ARM A — THE TILING IS EXACT.  The analytic piece area equals the repeat-cell area
//          minus the joints, and NO pixel is claimed by two pieces. A layout that
//          does not close reports one or the other wrong. This is the arm that
//          catches a wrong repeat unit (hexagon needs two rows, herringbone needs
//          2L × 2L), which is the commonest real seam bug.
//
//  ARM B — THE PIXELS MATCH ACROSS THE EDGE.  The weakest arm and the one everybody
//          ships alone. Kept because it is what the eye actually sees.
//
//  ARM C — THE PATTERN IS CONTINUOUS ACROSS THE EDGE, not merely equal at it.
//          Crossing the edge must never jump from the middle of one board to the
//          middle of a DIFFERENT board: a change of piece is only legitimate at a
//          JOINT. ⚠ Pixels can match at the edge while the pattern jumps, which is
//          why ARM B alone is not enough and why this arm exists.
//
// ⚠ AND A FOURTH ARM WAS WRITTEN, MEASURED TO BE VACUOUS, AND DELETED. "Rasterise
// with the sampling origin shifted by k pixels; assert the image is the original
// rolled by k" passes for EVERY layout, correct or not — the rasteriser writes
// through a modulo, so the equivariance is a property of the WRITER, not of the
// pattern. It is recorded here rather than quietly dropped, because it is exactly
// the kind of test that looks like proof and establishes nothing.

import { describe, expect, it } from 'vitest';
import { PROCEDURAL_TEXTURE_SPECS } from '../src/presets.js';
import { buildLayout, generateProceduralTexture } from '../src/generate.js';
import { rasterizeLayout } from '../src/raster/PieceField.js';



const RES = 384; // small enough to run every preset, large enough to resolve joints

describe('ARM A — the layout tiles the repeat cell exactly', () => {
  for (const spec of PROCEDURAL_TEXTURE_SPECS) {
    it(`${spec.id} claims no pixel twice and covers the analytic area`, () => {
      const layout = buildLayout(spec.layout);
      const field = rasterizeLayout(layout, { resolution: RES });
      const cellArea = layout.cellWidthMm * layout.cellHeightMm;
      const analytic = layout.pieceAreaMm2 / cellArea;
      const measured = field.coveredPx / (field.width * field.height);

      // No overlap at all: two pieces never occupy one area.
      expect(field.overlapPx).toBe(0);
      // Pieces never exceed the cell they claim to tile.
      expect(analytic).toBeLessThanOrEqual(1 + 1e-9);
      // The rasterised coverage agrees with the analytic coverage, to within the
      // discretisation error the rasteriser cannot avoid.
      //
      // ⭐ THE TOLERANCE IS DERIVED, NOT A CONSTANT — CORRECTED BY L-9705, and the
      // correction is a finding rather than a fix. It used to be a flat `0.03`
      // justified as "the perimeter's worth of half-pixels, which is why it scales
      // with joint width". The reasoning was right and the NUMBER did not scale with
      // anything: a constant cannot be a function of the geometry it is bounding.
      //
      // It held only because every preset until then was a TILE or a PARQUET STAVE —
      // compact pieces whose perimeter-to-area ratio sits in a narrow band. The first
      // long thin piece (a 1800 × 145 mm deck board, perimeter/area ~9x a 600 mm
      // tile's) exceeded it at 0.031, and the honest reading is that the CONSTANT was
      // wrong, not that the board was.
      //
      // A rasterised piece boundary is decided within one pixel, so each edge
      // contributes an error band of half a pixel along its whole length:
      //
      //     |measured - analytic|  ≲  (Σ piece perimeter × ½ pixel) / cell area
      //
      // 2x that is the assertion, and the factor of 2 is not a fudge — it is what the
      // measurement supports. ⚠ MEASURED ACROSS ALL 34 PRESETS RATHER THAN ASSERTED,
      // because an earlier draft of this comment claimed the derived bound was
      // "tighter than 0.03 for every compact preset" and that was FALSE:
      //
      //   · derived bound, range      : 0.0205 (hexagon 200) .. 0.0958 (Versailles)
      //   · so it is TIGHTER than the old flat 0.03 for THREE presets and LOOSER for
      //     the other 31. It is not a strictly stronger arm and saying so would have
      //     been the flattering half of the truth.
      //   · worst actual error / bound: 0.479 (porcelain 600 stack)
      //   · largest actual error       : 0.0314 (decking oak 145)
      //
      // ⭐ THE UNIFORMITY IS THE EVIDENCE, not the tightness. Under the flat constant
      // the headroom ranged from 1.05x (over budget — the failure that started this)
      // to 0.26x; under the derived bound EVERY preset sits at or under HALF its
      // budget. A bound of the right shape leaves uniform headroom, and an arbitrary
      // one does not. That is why this replaces the constant rather than raising it.
      let perimeterMm = 0;
      for (const piece of layout.pieces) {
        const n = piece.poly.length / 2;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const dx = (piece.poly[j * 2] as number) - (piece.poly[i * 2] as number);
          const dy = (piece.poly[j * 2 + 1] as number) - (piece.poly[i * 2 + 1] as number);
          perimeterMm += Math.hypot(dx, dy);
        }
      }
      const pxMm = Math.max(1 / field.pxPerMmX, 1 / field.pxPerMmY);
      const bound = 2 * ((perimeterMm * 0.5 * pxMm) / cellArea);
      expect(Math.abs(measured - analytic)).toBeLessThan(bound);
    });
  }
});

describe('ARM A2 — a jointless layout tiles at coverage exactly 1', () => {
  // With no joint there is nothing left over, so the analytic coverage must be 1.0
  // to floating-point. This is the arm that would have caught a herringbone lattice
  // enumerated with the wrong number of cosets.
  const cases: Array<[string, ReturnType<typeof buildLayout>]> = [
    ['herringbone n=2', buildLayout({ pattern: 'herringbone', params: { staveWidthMm: 70, lengthRatio: 2, jointMm: 0 } })],
    ['herringbone n=5', buildLayout({ pattern: 'herringbone', params: { staveWidthMm: 70, lengthRatio: 5, jointMm: 0 } })],
    ['herringbone n=5 rep2', buildLayout({ pattern: 'herringbone', params: { staveWidthMm: 70, lengthRatio: 5, jointMm: 0, repeat: 2 } })],
    ['chevron 45', buildLayout({ pattern: 'chevron', params: { staveWidthMm: 90, staveLengthMm: 600, angleDeg: 45, jointMm: 0, repeatY: 3 } })],
    ['chevron 60', buildLayout({ pattern: 'chevron', params: { staveWidthMm: 90, staveLengthMm: 600, angleDeg: 60, jointMm: 0, repeatY: 3 } })],
    ['basket 3', buildLayout({ pattern: 'basket-weave', params: { staveWidthMm: 70, staveCount: 3, jointMm: 0 } })],
    ['hexagon', buildLayout({ pattern: 'hexagon', params: { acrossFlatsMm: 200, groutMm: 0 } })],
    ['running bond 1/3', buildLayout({ pattern: 'running-bond', params: { lengthMm: 1200, widthMm: 180, jointMm: 0, offsetNum: 1, offsetDen: 3, repeatX: 1, repeatY: 2 } })],
  ];
  for (const [name, layout] of cases) {
    it(`${name} has analytic coverage 1.0`, () => {
      const cellArea = layout.cellWidthMm * layout.cellHeightMm;
      expect(layout.pieceAreaMm2 / cellArea).toBeCloseTo(1, 9);
    });
  }
});

/** Mean absolute RGB difference between two pixel columns of an RGBA8 buffer. */
function columnDiff(data: Uint8ClampedArray, width: number, height: number, a: number, b: number): number {
  let sum = 0;
  for (let y = 0; y < height; y++) {
    const ia = (y * width + a) * 4;
    const ib = (y * width + b) * 4;
    sum +=
      Math.abs((data[ia] as number) - (data[ib] as number)) +
      Math.abs((data[ia + 1] as number) - (data[ib + 1] as number)) +
      Math.abs((data[ia + 2] as number) - (data[ib + 2] as number));
  }
  return sum / (height * 3);
}

function rowDiff(data: Uint8ClampedArray, width: number, _height: number, a: number, b: number): number {
  let sum = 0;
  for (let x = 0; x < width; x++) {
    const ia = (a * width + x) * 4;
    const ib = (b * width + x) * 4;
    sum +=
      Math.abs((data[ia] as number) - (data[ib] as number)) +
      Math.abs((data[ia + 1] as number) - (data[ib + 1] as number)) +
      Math.abs((data[ia + 2] as number) - (data[ib + 2] as number));
  }
  return sum / (width * 3);
}

describe('ARM B — the edge is not the worst transition in the image', () => {
  for (const spec of PROCEDURAL_TEXTURE_SPECS) {
    it(`${spec.id} wraps without a visible step`, () => {
      const set = generateProceduralTexture(spec, RES);
      const { width, height, data } = set.albedo;

      const seamX = columnDiff(data, width, height, width - 1, 0);
      let worstX = 0;
      for (let x = 0; x + 1 < width; x++) {
        worstX = Math.max(worstX, columnDiff(data, width, height, x, x + 1));
      }
      // ⭐ Not "the seam is small" — "the seam is not special". A joint running along
      // the edge legitimately produces a large step; what must never happen is the
      // edge being a step of a different ORDER from the interior ones.
      // ⚠ The 1.25 factor is not slack for a bad seam. A joint narrower than the
      // pixel pitch lands at a different sub-pixel phase at the edge than in the
      // interior, so the two are never bit-equal; the negative control below shows a
      // genuinely broken wrap scores an order of magnitude worse, not 25% worse.
      expect(seamX).toBeLessThanOrEqual(worstX * 1.25 + 0.5);

      const seamY = rowDiff(data, width, height, height - 1, 0);
      let worstY = 0;
      for (let y = 0; y + 1 < height; y++) {
        worstY = Math.max(worstY, rowDiff(data, width, height, y, y + 1));
      }
      expect(seamY).toBeLessThanOrEqual(worstY * 1.25 + 0.5);
    });
  }
});


// ─── ARM C ─────────────────────────────────────────────────────────────────────
// ⭐ "The pattern is continuous across the seam" stated so it can be MEASURED:
// crossing the wrap must never take you from the middle of one board to the middle
// of a DIFFERENT board. A change of piece is legitimate only at a JOINT. Because the
// rasteriser records which piece owns each pixel and how far that pixel is from its
// piece's edge, that sentence is a counting argument, not an impression.

/** Piece changes across the wrap that are NOT at a joint. Must be zero. */
function patternBreaks(field: ReturnType<typeof rasterizeLayout>): { x: number; y: number } {
  // "At a joint" = within three pixels of some piece edge. Three, not one, because a
  // sub-pixel joint puts the neighbouring pixel centres a couple of pixels apart.
  const near = 3 / Math.min(field.pxPerMmX, field.pxPerMmY);
  let x = 0;
  let y = 0;
  for (let r = 0; r < field.height; r++) {
    const a = r * field.width + field.width - 1;
    const b = r * field.width;
    if (
      (field.pieceIndex[a] as number) !== (field.pieceIndex[b] as number) &&
      Math.min(field.edgeMm[a] as number, field.edgeMm[b] as number) > near
    ) {
      x++;
    }
  }
  for (let c = 0; c < field.width; c++) {
    const a = (field.height - 1) * field.width + c;
    const b = c;
    if (
      (field.pieceIndex[a] as number) !== (field.pieceIndex[b] as number) &&
      Math.min(field.edgeMm[a] as number, field.edgeMm[b] as number) > near
    ) {
      y++;
    }
  }
  return { x, y };
}

describe('ARM C — crossing the seam never jumps between pieces except at a joint', () => {
  for (const spec of PROCEDURAL_TEXTURE_SPECS) {
    it(`${spec.id} has zero pattern breaks on either axis`, () => {
      const field = rasterizeLayout(buildLayout(spec.layout), { resolution: RES });
      expect(patternBreaks(field)).toEqual({ x: 0, y: 0 });
    });
  }
});

// ─── NEGATIVE CONTROLS ─────────────────────────────────────────────────────────
// ⭐ A test suite that has never been seen to fail proves nothing about the code; it
// proves something about the suite. These build DELIBERATELY broken textures and
// measure what each arm says about them — including, honestly, the case where ARM B
// says nothing at all.

/** The commonest real non-seamless texture: a CROP of a larger image. */
function cropField(field: ReturnType<typeof rasterizeLayout>, f: number): ReturnType<typeof rasterizeLayout> {
  const width = Math.round(field.width * f);
  const height = Math.round(field.height * f);
  const pieceIndex = new Int32Array(width * height);
  const edgeMm = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pieceIndex[y * width + x] = field.pieceIndex[y * field.width + x] as number;
      edgeMm[y * width + x] = field.edgeMm[y * field.width + x] as number;
    }
  }
  return { ...field, width, height, pieceIndex, edgeMm };
}

function cropRGBA(map: { width: number; height: number; data: Uint8ClampedArray }, f: number) {
  const width = Math.round(map.width * f);
  const height = Math.round(map.height * f);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 4; c++) {
        data[(y * width + x) * 4 + c] = map.data[(y * map.width + x) * 4 + c] as number;
      }
    }
  }
  return { width, height, data };
}

function seamRatio(map: { width: number; height: number; data: Uint8ClampedArray }): number {
  const { width, height, data } = map;
  const seam = columnDiff(data, width, height, width - 1, 0);
  let worst = 0;
  for (let x = 0; x + 1 < width; x++) worst = Math.max(worst, columnDiff(data, width, height, x, x + 1));
  return seam / Math.max(1e-9, worst);
}

describe('⭐ NEGATIVE CONTROLS — the arms failing on deliberately broken textures', () => {
  it('ARM A catches a repeat cell the pieces do not tile', () => {
    // Declare the cell 13% NARROWER than the true period and the pieces wrap onto
    // each other. `overlapPx` is not a subtle signal.
    const good = buildLayout({ pattern: 'basket-weave', params: { staveWidthMm: 70, staveCount: 3, jointMm: 0.3 } });
    const bad = { ...good, cellWidthMm: good.cellWidthMm * 0.87 };
    expect(rasterizeLayout(good, { resolution: 256 }).overlapPx).toBe(0);
    expect(rasterizeLayout(bad, { resolution: 256 }).overlapPx).toBeGreaterThan(500);
  });

  it('ARM C catches a CROPPED texture — the classic non-seamless bitmap', () => {
    const spec = PROCEDURAL_TEXTURE_SPECS.find((s) => s.id === 'procedural:parquet-oak-herringbone');
    if (!spec) throw new Error('preset missing');
    const field = rasterizeLayout(buildLayout(spec.layout), { resolution: RES });
    expect(patternBreaks(field)).toEqual({ x: 0, y: 0 });
    const cropped = patternBreaks(cropField(field, 0.63));
    // Measured: 98 rows and 9 columns land mid-stave against a different mid-stave.
    expect(cropped.x).toBeGreaterThan(20);
    expect(cropped.y).toBeGreaterThan(2);
  });

  it('ARM B catches SOME broken crops...', () => {
    const spec = PROCEDURAL_TEXTURE_SPECS.find((s) => s.id === 'procedural:floor-oak-plank-wide');
    if (!spec) throw new Error('preset missing');
    const set = generateProceduralTexture(spec, RES);
    expect(seamRatio(set.albedo)).toBeLessThan(1.25);
    expect(seamRatio(cropRGBA(set.albedo, 0.8))).toBeGreaterThan(1.25);
  });

  it('⚠ ...but ARM B MISSES others, which is exactly why ARMS A and C exist', () => {
    // Stated as a measured limitation rather than left for someone to assume away.
    // A low-contrast tile crop scores BETTER than the tolerance while being visibly
    // broken: its seam step is small in absolute terms because the tile face is
    // nearly uniform, and the grout lines dominate the interior maximum.
    const spec = PROCEDURAL_TEXTURE_SPECS.find((s) => s.id === 'procedural:tile-metro-white-subway');
    if (!spec) throw new Error('preset missing');
    const set = generateProceduralTexture(spec, RES);
    const brokenRatio = seamRatio(cropRGBA(set.albedo, 0.8));
    expect(brokenRatio).toBeLessThan(1.25); // ARM B says "fine". It is not fine.
    // ARM C, on the same broken texture, is not fooled.
    const field = rasterizeLayout(buildLayout(spec.layout), { resolution: RES });
    expect(patternBreaks(cropField(field, 0.63)).x).toBeGreaterThan(10);
  });
});
