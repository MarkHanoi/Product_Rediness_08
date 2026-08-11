// @pryzm/ai-worker — TIER 2 algorithmic raster CV tests (§RASTER-CV).
//
// Every fixture here is a SYNTHETIC BITMAP built pixel by pixel in this file:
// no image decoding, no canvas, no golden files, no network. That is the point
// of tier 2 — it is pure arithmetic over a byte array, so it is exactly as
// testable as the vector tier.
//
// The end-to-end cases assert the two claims the founder-facing copy makes:
//   • a thick-stroke rectangle becomes FOUR wall runs (one per side), and
//   • a stroke run with a gap + a swing arc becomes ONE door,
// plus the honesty claims: a gap with no corroborating symbol is REJECTED and
// counted, never promoted into an invented door.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RASTER_CV_OPTIONS,
  RASTER_CONF_DOOR_WITH_ARC,
  RASTER_CONF_GAP_ONLY,
  RASTER_CONF_WINDOW_GLAZED,
  analyseRasterFloorPlan,
  binarize,
  despeckle,
  extractBoundary,
  morphOpen3,
  otsuThreshold,
  rasterMmToPx,
  rgbaToGray,
  segmentsToVectorElements,
  type RasterAnalysisResult,
} from '../../src/pdf-to-bim/index.js';

// ─── Synthetic bitmap builder ─────────────────────────────────────────────

class Bitmap {
  readonly rgba: Uint8ClampedArray;
  constructor(readonly width: number, readonly height: number) {
    this.rgba = new Uint8ClampedArray(width * height * 4);
    this.rgba.fill(255); // white paper, opaque
  }

  /** Paint one pixel black (ink). Out-of-bounds writes are ignored. */
  ink(x: number, y: number): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.width || yi >= this.height) return;
    const o = (yi * this.width + xi) * 4;
    this.rgba[o] = 0;
    this.rgba[o + 1] = 0;
    this.rgba[o + 2] = 0;
    this.rgba[o + 3] = 255;
  }

  /** Filled axis-aligned rectangle, inclusive bounds. */
  fillRect(x0: number, y0: number, x1: number, y1: number): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.ink(x, y);
  }

  /** Axis-aligned rectangle OUTLINE drawn with a `t`-pixel stroke, the stroke
   *  lying inside the given outer bounds — i.e. a plan's poché wall ring. */
  strokeRect(x0: number, y0: number, x1: number, y1: number, t: number): void {
    this.fillRect(x0, y0, x1, y0 + t - 1);           // top
    this.fillRect(x0, y1 - t + 1, x1, y1);           // bottom
    this.fillRect(x0, y0, x0 + t - 1, y1);           // left
    this.fillRect(x1 - t + 1, y0, x1, y1);           // right
  }

  /** Circular arc, densely sampled so it is 8-connected. */
  arc(cx: number, cy: number, r: number, a0: number, a1: number): void {
    const steps = Math.max(64, Math.ceil(Math.abs(a1 - a0) * r * 2));
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      this.ink(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
  }

  analyse(mmPerPx: number, options?: Partial<typeof DEFAULT_RASTER_CV_OPTIONS>): RasterAnalysisResult {
    return analyseRasterFloorPlan({
      rgba: this.rgba,
      width: this.width,
      height: this.height,
      mmPerPx,
      ...(options ? { options } : {}),
    });
  }
}

// ─── Stage 1 primitives ───────────────────────────────────────────────────

describe('raster-cv — grayscale + threshold', () => {
  it('composites alpha over WHITE so a transparent PNG background is paper, not ink', () => {
    // Fully transparent black — naive luma would read 0 (ink) and the whole
    // page would binarize solid.
    const rgba = new Uint8ClampedArray([0, 0, 0, 0]);
    const gray = rgbaToGray(rgba, 1, 1);
    expect(gray.data[0]).toBe(255);
  });

  it('otsuThreshold splits a bimodal histogram between the two modes', () => {
    const g = { data: new Uint8Array(200), width: 20, height: 10 };
    g.data.fill(240);
    g.data.fill(20, 0, 100);
    const t = otsuThreshold(g);
    expect(t).toBeGreaterThan(20);
    expect(t).toBeLessThan(240);
  });

  it('binarize marks strictly-darker-than-threshold pixels as ink', () => {
    const g = { data: Uint8Array.from([0, 127, 128, 255]), width: 4, height: 1 };
    expect(Array.from(binarize(g, 128).data)).toEqual([1, 1, 0, 0]);
  });
});

describe('raster-cv — morphology + boundary', () => {
  it('morphOpen3 erases isolated speckle but keeps a solid block', () => {
    const w = 9;
    const h = 9;
    const data = new Uint8Array(w * h);
    data[0] = 1;               // lone speckle in the corner
    for (let y = 3; y <= 6; y++) for (let x = 3; x <= 6; x++) data[y * w + x] = 1;
    const out = morphOpen3({ data, width: w, height: h });
    expect(out.data[0]).toBe(0);
    expect(out.data[4 * w + 4]).toBe(1);
  });

  it('morphOpen3 DESTROYS a 1 px hairline — the trap despeckle exists to avoid', () => {
    // Regression guard for the bug that made every scanned door read as a bare
    // gap: opening removed the swing arcs and glazing before they were probed.
    const w = 9;
    const h = 9;
    const data = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) data[4 * w + x] = 1; // 1 px horizontal line
    expect(Array.from(morphOpen3({ data, width: w, height: h }).data).some(v => v === 1)).toBe(false);
    const kept = despeckle({ data, width: w, height: h });
    expect(kept.data[4 * w + 4]).toBe(1);            // line interior survives
    expect(kept.data[4 * w + 0]).toBe(0);            // endpoint shaved (1 neighbour)
  });

  it('despeckle drops an isolated dot and a lone pair, keeps a stroke', () => {
    const w = 9;
    const h = 9;
    const data = new Uint8Array(w * h);
    data[0] = 1;                                       // isolated dot: 0 neighbours
    for (let y = 2; y <= 6; y++) data[y * w + 4] = 1;  // vertical stroke
    const out = despeckle({ data, width: w, height: h });
    expect(out.data[0]).toBe(0);
    expect(out.data[4 * w + 4]).toBe(1);
  });

  it('extractBoundary keeps the outline of a filled block and drops its core', () => {
    const w = 7;
    const h = 7;
    const data = new Uint8Array(w * h);
    for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) data[y * w + x] = 1;
    const b = extractBoundary({ data, width: w, height: h });
    expect(b.data[3 * w + 3]).toBe(0); // interior pixel — not a face
    expect(b.data[1 * w + 3]).toBe(1); // top face
    expect(b.data[5 * w + 3]).toBe(1); // bottom face
  });
});

describe('raster-cv — §RASTER-SEG-ORIENT canonical segment direction', () => {
  it('emits every segment with increasing x (ties: increasing y)', () => {
    const out = segmentsToVectorElements([
      { x1: 10, y1: 5, x2: 2, y2: 5, votes: 1 },   // reversed in x
      { x1: 4, y1: 9, x2: 4, y2: 1, votes: 1 },    // vertical, reversed in y
      { x1: 0, y1: 0, x2: 3, y2: 7, votes: 1 },    // already canonical
    ]);
    expect(out.map(v => v.points)).toEqual([
      [[2, 5], [10, 5]],
      [[4, 1], [4, 9]],
      [[0, 0], [3, 7]],
    ]);
  });
});

describe('raster-cv — rasterMmToPx', () => {
  it('is a pure uniform scale with no translation and no y-flip', () => {
    // The raster tier's mm space is DERIVED from the source pixel grid, so the
    // way back is the inverse scale — unlike the vector tier, whose affine
    // carries pdf.js's y-flip.
    expect(rasterMmToPx(25)).toEqual([1 / 25, 0, 0, 1 / 25, 0, 0]);
  });
});

// ─── End-to-end: walls ────────────────────────────────────────────────────

describe('raster-cv — thick-stroke rectangle → four wall runs', () => {
  // 400×300 px at 25 mm/px = a 10 m × 7.5 m sheet. An 8 px stroke reads as a
  // ~175 mm wall (the two FACES are 7 px apart), squarely inside the
  // 50–600 mm wall band the shared stage-2 classifier enforces.
  const bmp = new Bitmap(400, 300);
  bmp.strokeRect(40, 30, 359, 269, 8);
  const result = bmp.analyse(25);

  it('finds exactly four walls — one per side of the rectangle', () => {
    expect(result.walls).toHaveLength(4);
  });

  it('recovers the drawn wall thickness in millimetres', () => {
    for (const w of result.walls) {
      expect(w.thickness).toBeGreaterThan(150);
      expect(w.thickness).toBeLessThan(200);
    }
  });

  it('produces two horizontal and two vertical runs spanning the rectangle', () => {
    const horiz = result.walls.filter(w => Math.abs(w.centerLine[0]![1] - w.centerLine[1]![1]) < 100);
    const vert = result.walls.filter(w => Math.abs(w.centerLine[0]![0] - w.centerLine[1]![0]) < 100);
    expect(horiz).toHaveLength(2);
    expect(vert).toHaveLength(2);
    // 320 px wide × 25 mm/px = 8000 mm; allow the half-stroke inset.
    for (const w of horiz) {
      const len = Math.abs(w.centerLine[1]![0] - w.centerLine[0]![0]);
      expect(len).toBeGreaterThan(7000);
      expect(len).toBeLessThan(8200);
    }
  });

  it('reports honest diagnostics rather than bare counts', () => {
    const d = result.diagnostics;
    expect(d.downsampleFactor).toBe(1);          // 400 px < maxWorkingDim
    expect(d.workingWidthPx).toBe(400);
    expect(d.boundaryPixels).toBeGreaterThan(0);
    expect(d.lineSegments).toBeGreaterThan(0);
    expect(d.wallRuns).toBe(result.walls.length);
  });

  it('invents no openings in a plan that has none', () => {
    expect(result.openings).toHaveLength(0);
  });
});

// ─── End-to-end: openings ─────────────────────────────────────────────────

/** One long horizontal wall stroke with a gap, at 10 mm/px. Both stubs stay
 *  well over the classifier's 500 mm parallel-overlap minimum. */
function wallWithGap(gapStartPx: number, gapEndPx: number): Bitmap {
  const bmp = new Bitmap(900, 400);
  bmp.fillRect(50, 100, gapStartPx, 109);
  bmp.fillRect(gapEndPx, 100, 850, 109);
  return bmp;
}

describe('raster-cv — gap + swing arc → one door', () => {
  // 900 mm opening (90 px at 10 mm/px) with a 90° swing arc hinged on the
  // gap's left jamb, radius = the leaf length = the opening width.
  const bmp = wallWithGap(250, 340);
  bmp.arc(250, 110, 90, 0, Math.PI / 2);
  const result = bmp.analyse(10);

  it('merges the two stroke runs into ONE wall that spans THROUGH the gap', () => {
    // C15: an opening lives INSIDE a wall. Two abutting walls with the hole
    // between them could host nothing.
    const spanning = result.walls.filter(w => {
      const len = Math.abs(w.centerLine[1]![0] - w.centerLine[0]![0]);
      return len > 4500;
    });
    expect(spanning.length).toBeGreaterThanOrEqual(1);
  });

  it('detects exactly one door and no windows', () => {
    expect(result.openings).toHaveLength(1);
    expect(result.openings[0]!.kind).toBe('door');
  });

  it('recovers the opening width and corroborates it with the arc', () => {
    const o = result.openings[0]!;
    expect(o.openingWidthMm).toBeGreaterThan(800);
    expect(o.openingWidthMm).toBeLessThan(1000);
    expect(o.subtype).toBe('raster-swing-arc');
    expect(o.confidence).toBe(RASTER_CONF_DOOR_WITH_ARC);
    expect(result.diagnostics.doorsWithArc).toBe(1);
  });

  it('§RASTER-GAP-CENTRE — position is the gap CENTRE, not a jamb', () => {
    // The batcher derives the LEFT-EDGE offset as centre − width/2
    // (§PDF-OFFSET-LEFTEDGE). Emitting a jamb here would displace every door
    // by half its width.
    const o = result.openings[0]!;
    expect(o.position[0]).toBeGreaterThan(2800); // gap spans 2500…3400 mm
    expect(o.position[0]).toBeLessThan(3100);
    expect(o.position[0] - o.openingWidthMm / 2).toBeGreaterThan(2350);
    expect(o.position[0] - o.openingWidthMm / 2).toBeLessThan(2650);
  });

  it('hosts the opening on a wall the adapter can resolve', () => {
    const o = result.openings[0]!;
    expect(o.hostWallCenterLine.length).toBeGreaterThanOrEqual(2);
    expect(result.walls.some(w => w.centerLine === o.hostWallCenterLine)).toBe(true);
  });
});

describe('raster-cv — glazing drawn through the gap → window', () => {
  // 1800 mm opening: deliberately OUTSIDE the door width band, so the only
  // thing that can classify it is the glazing evidence itself.
  const bmp = wallWithGap(250, 430);
  for (let x = 250; x <= 430; x++) {
    bmp.ink(x, 103);
    bmp.ink(x, 106);
  }
  const result = bmp.analyse(10);

  it('classifies the glazed gap as a window', () => {
    expect(result.openings).toHaveLength(1);
    expect(result.openings[0]!.kind).toBe('window');
    expect(result.openings[0]!.confidence).toBe(RASTER_CONF_WINDOW_GLAZED);
    expect(result.diagnostics.windowsGlazed).toBe(1);
  });
});

describe('raster-cv — §CONTEXT-DATA-HONESTY: no evidence ⇒ no element', () => {
  it('rejects and COUNTS a gap that is neither door-sized nor glazed', () => {
    const result = wallWithGap(250, 430).analyse(10); // 1800 mm, empty
    expect(result.openings).toHaveLength(0);
    expect(result.diagnostics.gapsFound).toBeGreaterThanOrEqual(1);
    expect(result.diagnostics.gapsRejected.no_symbol_evidence).toBeGreaterThanOrEqual(1);
  });

  it('rejects and COUNTS a gap too narrow to be any opening', () => {
    const result = wallWithGap(250, 270).analyse(10); // 200 mm
    expect(result.openings).toHaveLength(0);
    expect(result.diagnostics.gapsRejected.too_narrow).toBeGreaterThanOrEqual(1);
  });

  it('a door-sized gap with NO arc is emitted at low confidence, not as a confident door', () => {
    const result = wallWithGap(250, 340).analyse(10); // 900 mm, no arc drawn
    expect(result.openings).toHaveLength(1);
    expect(result.openings[0]!.subtype).toBe('raster-gap-only');
    expect(result.openings[0]!.confidence).toBe(RASTER_CONF_GAP_ONLY);
    expect(result.diagnostics.doorsGapOnly).toBe(1);
    expect(result.diagnostics.doorsWithArc).toBe(0);
  });

  it('rejects and COUNTS a gap too wide to be any opening', () => {
    // 4300 mm — merged into the run (maxOpeningGapMm 4500) precisely so that
    // it can be COUNTED as too_wide instead of vanishing unmerged and unseen.
    const result = wallWithGap(250, 680).analyse(10);
    expect(result.openings).toHaveLength(0);
    expect(result.diagnostics.gapsRejected.too_wide).toBeGreaterThanOrEqual(1);
  });

  it('counts sub-resolution pairs instead of silently discarding them', () => {
    // A 2 px stroke at 25 mm/px cannot resolve a wall: its faces are ~1 px
    // apart. The tier must not report a clean page — it must report that it
    // threw pairs away for being below its own resolution.
    const bmp = new Bitmap(400, 300);
    bmp.strokeRect(40, 30, 359, 269, 8);
    const coarse = bmp.analyse(25, { minWallThicknessPx: 40 });
    expect(coarse.walls).toHaveLength(0);
    expect(coarse.diagnostics.wallPairsBelowResolution).toBeGreaterThan(0);
  });

  it('a blank page yields nothing — and says so through the diagnostics', () => {
    const result = new Bitmap(300, 200).analyse(20);
    expect(result.walls).toHaveLength(0);
    expect(result.openings).toHaveLength(0);
    expect(result.diagnostics.boundaryPixels).toBe(0);
    expect(result.diagnostics.wallPairsRaw).toBe(0);
  });
});
