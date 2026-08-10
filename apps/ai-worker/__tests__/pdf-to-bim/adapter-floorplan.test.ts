// @pryzm/ai-worker — vector→FloorPlanAnalysis adapter tests (§VEC-WIRE).
//
// The load-bearing conventions under test:
//  • DetectedOpening.centrePx is the opening's CENTRE (the batcher converts
//    centre → LEFT-EDGE offset per §PDF-OFFSET-LEFTEDGE: offset = centre −
//    width/2). A door's extractor `position` is the swing-arc centre — the
//    HINGE — so the adapter must shift by width/2 toward the far jamb:
//    assert centre − width/2 lands back on the hinge (the left edge).
//  • Pixel output goes through the mm→px affine including the y-flip that
//    pdf.js viewports apply (PDF user space is y-up; images are y-down).

import { describe, expect, it } from 'vitest';
import {
  composeMmToPx,
  openingCentreMm,
  vectorResultToFloorPlanAnalysis,
  type Affine2D,
  type OpeningCandidate,
  type WallCandidate,
} from '../../src/pdf-to-bim/index.js';

// 0.1 px/mm, y flipped about a 3000 mm-tall page rendered at 300 px.
const MM_TO_PX: Affine2D = [0.1, 0, 0, -0.1, 0, 300];

function makeWall(
  centerLine: ReadonlyArray<readonly [number, number]>,
  thickness = 200,
  confidence = 0.9,
): WallCandidate {
  const line = { p1: centerLine[0]!, p2: centerLine[1]!, angle: 0, length: 1 };
  return { centerLine, thickness, confidence, pairLine1: line, pairLine2: line };
}

describe('vectorResultToFloorPlanAnalysis — walls', () => {
  it('maps centreline endpoints through the affine (incl. y flip) and thickness by scale', () => {
    const wall = makeWall([[0, 1000], [5000, 1000]], 200, 0.9);
    const out = vectorResultToFloorPlanAnalysis({
      walls: [wall],
      openings: [],
      mmToPx: MM_TO_PX,
      imageWidthPx: 500,
      imageHeightPx: 300,
    });
    expect(out.walls).toHaveLength(1);
    const w = out.walls[0]!;
    expect(w.startPx).toEqual({ x: 0, y: 200 });
    expect(w.endPx).toEqual({ x: 500, y: 200 });
    expect(w.thicknessPx).toBeCloseTo(20, 6);
    expect(w.wallType).toBe('unknown'); // honest — vector pairs carry no exterior evidence
    expect(w.confidence).toBe('high');
    expect(out.slab).toBeNull();       // topology outer face owns the slab downstream
    expect(out.furniture).toEqual([]);
    expect(out.imageDimensions).toEqual({ widthPx: 500, heightPx: 300 });
  });

  it('maps confidence bands 0.8/0.6 → high/medium/low', () => {
    const out = vectorResultToFloorPlanAnalysis({
      walls: [
        makeWall([[0, 0], [1000, 0]], 200, 0.85),
        makeWall([[0, 100], [1000, 100]], 200, 0.65),
        makeWall([[0, 200], [1000, 200]], 200, 0.4),
      ],
      openings: [],
      mmToPx: MM_TO_PX,
      imageWidthPx: 500,
      imageHeightPx: 300,
    });
    expect(out.walls.map(w => w.confidence)).toEqual(['high', 'medium', 'low']);
  });
});

describe('vectorResultToFloorPlanAnalysis — door centre (§PDF-OFFSET-LEFTEDGE upstream)', () => {
  // Horizontal wall at y = 1000 mm; hinge at x = 1000; 900 mm door whose
  // swing arc runs from the leaf tip (1000, 1900) to the far jamb on the
  // wall (1900, 1000).
  const wall = makeWall([[0, 1000], [5000, 1000]], 200, 0.9);
  const door: OpeningCandidate = {
    kind: 'door',
    subtype: 'single-swing-90',
    position: [1000, 1000], // arc centre = HINGE, not the opening centre
    openingWidthMm: 900,
    hostWallCenterLine: wall.centerLine,
    confidence: 0.85,
    arcEndpointsMm: [[1000, 1900], [1900, 1000]],
  };

  it('emits the gap CENTRE, so batcher leftEdge = centre − w/2 lands on the hinge', () => {
    const out = vectorResultToFloorPlanAnalysis({
      walls: [wall],
      openings: [door],
      mmToPx: MM_TO_PX,
      imageWidthPx: 500,
      imageHeightPx: 300,
    });
    expect(out.openings).toHaveLength(1);
    const o = out.openings[0]!;
    expect(o.type).toBe('door');
    expect(o.hostWallId).toBe(out.walls[0]!.id);
    // Centre = midpoint(hinge 1000, far jamb 1900) = 1450 mm → 145 px.
    expect(o.centrePx.x).toBeCloseTo(145, 6);
    expect(o.centrePx.y).toBeCloseTo(200, 6); // on the wall, y flipped
    expect(o.widthPx).toBeCloseTo(90, 6);
    // The repo-wide offset convention: LEFT EDGE = centre − width/2.
    // For this door that must be the hinge (x = 1000 mm → 100 px).
    expect(o.centrePx.x - o.widthPx / 2).toBeCloseTo(100, 6);
  });

  it('falls back to the hinge position when arcEndpointsMm is absent', () => {
    const { arcEndpointsMm, ...rest } = door;
    void arcEndpointsMm;
    const centre = openingCentreMm(rest as OpeningCandidate);
    expect(centre).toEqual([1000, 1000]);
  });
});

describe('vectorResultToFloorPlanAnalysis — windows + host resolution', () => {
  const wallA = makeWall([[0, 1000], [5000, 1000]], 200, 0.9);
  const wallB = makeWall([[0, 3000], [5000, 3000]], 200, 0.9);

  it('window position passes through unchanged (already the glazing midpoint)', () => {
    const win: OpeningCandidate = {
      kind: 'window',
      subtype: 'casement-2-pane',
      position: [2500, 1000],
      openingWidthMm: 1200,
      hostWallCenterLine: wallA.centerLine,
      confidence: 0.7,
    };
    const out = vectorResultToFloorPlanAnalysis({
      walls: [wallA, wallB],
      openings: [win],
      mmToPx: MM_TO_PX,
      imageWidthPx: 500,
      imageHeightPx: 300,
    });
    const o = out.openings[0]!;
    expect(o.type).toBe('window');
    expect(o.centrePx).toEqual({ x: 250, y: 200 });
    expect(o.widthPx).toBeCloseTo(120, 6);
    expect(o.confidence).toBe('medium');
    expect(o.hostWallId).toBe(out.walls[0]!.id);
  });

  it('resolves the nearest wall when the host centreline reference is unknown', () => {
    const stray: OpeningCandidate = {
      kind: 'window',
      subtype: 'casement-2-pane',
      position: [2500, 2950], // 50 mm from wallB, 1950 mm from wallA
      openingWidthMm: 1000,
      hostWallCenterLine: [[0, 0], [1, 0]], // not a known wall's reference
      confidence: 0.7,
    };
    const out = vectorResultToFloorPlanAnalysis({
      walls: [wallA, wallB],
      openings: [stray],
      mmToPx: MM_TO_PX,
      imageWidthPx: 500,
      imageHeightPx: 300,
    });
    expect(out.openings[0]!.hostWallId).toBe(out.walls[1]!.id);
  });
});

describe('composeMmToPx', () => {
  it('divides the viewport transform by mmPerPt and keeps the translation', () => {
    // Viewport: 2 px/pt with y flip about a 400 pt-tall page → [2,0,0,-2,0,800].
    // mmPerPt 10 → 0.2 px/mm.
    const m = composeMmToPx([2, 0, 0, -2, 0, 800], 10);
    expect(m).toEqual([0.2, 0, 0, -0.2, 0, 800]);
    // A point at (1000 mm, 1000 mm) = (100 pt, 100 pt) → px (200, 600).
    expect(m[0] * 1000 + m[2] * 1000 + m[4]).toBeCloseTo(200, 6);
    expect(m[1] * 1000 + m[3] * 1000 + m[5]).toBeCloseTo(600, 6);
  });
});
