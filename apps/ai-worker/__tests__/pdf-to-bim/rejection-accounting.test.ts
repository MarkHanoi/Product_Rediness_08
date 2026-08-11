// @pryzm/ai-worker — §VEC-REJECT-TALLY: tier-1 rejection accounting.
//
// THE BUG, STATED AS A TEST
// -------------------------
// `matchOpeningSymbols`, `detectWallPairs` and `vectorResultToFloorPlanAnalysis`
// used to discard candidates with a bare `continue`. The observable consequence:
//
//     a page with NO door arcs at all          → openings: []
//     a page with 12 door arcs that all failed → openings: []
//
// Identical output. "Found 0" and "rejected 12" were THE SAME VALUE, and the
// wizard could only ever say "0 doors" — which reads as a statement about the
// drawing when it is really a statement about the scale, the symbol library, or
// the wall classifier upstream.
//
// The `*WithDiagnostics` entrypoints and the `describe*` formatters exist to
// make those two runs distinguishable. Every assertion below is either
//   (a) the COLLISION — proving the plain entrypoints still cannot tell them
//       apart, which is exactly why the diagnostics entrypoint is required, or
//   (b) the SPLIT — proving the accounted entrypoints do.

import { describe, it, expect } from 'vitest';
import {
  classifyWallsAndColumns,
  classifyWallsAndColumnsWithDiagnostics,
  describeDoorOutcome,
  describeVectorRejections,
  describeWallOutcome,
  matchOpeningSymbols,
  matchOpeningSymbolsWithDiagnostics,
  totalDoorArcsRejected,
  totalWallPairsRejected,
  vectorResultToFloorPlanAnalysis,
  vectorResultToFloorPlanAnalysisWithDiagnostics,
  type Affine2D,
  type PageDecomposition,
  type VectorElement,
  type WallCandidate,
} from '../../src/pdf-to-bim/index.js';

/** 1 PDF pt = 10 mm, i.e. a 1:~354 plan. Keeps the arithmetic readable. */
const MM_PER_PT = 10;

/** A canonical 90°-swing door arc of `radiusPt` at `[cx, cy]`. Point order is
 *  the extractor's convention: [centre, edgeStart, edgeEnd]. */
function doorArc(cx: number, cy: number, radiusPt: number): VectorElement {
  return {
    kind: 'arc',
    points: [
      [cx, cy],
      [cx + radiusPt, cy],
      [cx, cy + radiusPt],
    ],
  };
}

/** The door's panel line, hinged at the arc centre. */
function doorPanel(cx: number, cy: number, radiusPt: number): VectorElement {
  return { kind: 'line', points: [[cx, cy], [cx + radiusPt, cy]] };
}

function page(vectors: VectorElement[]): PageDecomposition {
  return { pageId: 'p1', pageWidthPt: 842, pageHeightPt: 595, vectors };
}

/** N complete, well-formed door symbols laid out along x. */
function nDoorSymbols(n: number): VectorElement[] {
  const out: VectorElement[] = [];
  for (let i = 0; i < n; i++) {
    const cx = 1000 + i * 500;
    out.push(doorArc(cx, 0, 90), doorPanel(cx, 0, 90));
  }
  return out;
}

// ── Doors: "found 0" vs "rejected N" ────────────────────────────────────────

describe('§VEC-REJECT-TALLY — doors: emptiness and failure are not the same value', () => {
  // Two genuinely different worlds, chosen so the ONLY difference is whether
  // there was anything to reject.
  const emptyWorld = page([]);                 // no arcs at all
  const rejectedWorld = page(nDoorSymbols(12)); // 12 perfect doors, no walls
  const noWalls: readonly WallCandidate[] = [];

  it('BEFORE (the collision): the plain matcher returns the SAME value for both', () => {
    const a = matchOpeningSymbols(emptyWorld, noWalls, MM_PER_PT);
    const b = matchOpeningSymbols(rejectedWorld, noWalls, MM_PER_PT);

    expect(a).toEqual([]);
    expect(b).toEqual([]);
    // ← THE BUG: two different underlying conditions, one indistinguishable output.
    expect(a).toEqual(b);
  });

  it('AFTER: the accounted matcher separates "found 0, rejected 0" from "found 0, rejected 12"', () => {
    const a = matchOpeningSymbolsWithDiagnostics(emptyWorld, noWalls, MM_PER_PT);
    const b = matchOpeningSymbolsWithDiagnostics(rejectedWorld, noWalls, MM_PER_PT);

    expect(a.openings).toEqual([]);
    expect(b.openings).toEqual([]);

    // Same accepted count…
    expect(a.rejections.doorsAccepted).toBe(0);
    expect(b.rejections.doorsAccepted).toBe(0);

    // …different rejected counts, WITH the reason.
    expect(a.rejections.arcsFound).toBe(0);
    expect(totalDoorArcsRejected(a.rejections)).toBe(0);

    expect(b.rejections.arcsFound).toBe(12);
    expect(b.rejections.arcsRejectedNoHostWall).toBe(12);
    expect(totalDoorArcsRejected(b.rejections)).toBe(12);
  });

  it('AFTER: the two runs produce DIFFERENT, ACCURATE user-facing sentences', () => {
    const a = describeDoorOutcome(
      matchOpeningSymbolsWithDiagnostics(emptyWorld, noWalls, MM_PER_PT).rejections);
    const b = describeDoorOutcome(
      matchOpeningSymbolsWithDiagnostics(rejectedWorld, noWalls, MM_PER_PT).rejections);

    expect(a).not.toBe(b);
    expect(a).toContain('no arc primitives at all');
    expect(a).not.toContain('REJECTED');
    expect(b).toContain('12 REJECTED');
    expect(b).toContain('no wall close enough to host them');
  });

  it('a door arc with no panel line is rejected for THAT reason, not the host-wall one', () => {
    const arcsOnly = page([doorArc(1000, 0, 90), doorArc(2000, 0, 90)]);
    const { rejections } = matchOpeningSymbolsWithDiagnostics(arcsOnly, noWalls, MM_PER_PT);

    expect(rejections.arcsFound).toBe(2);
    expect(rejections.arcsRejectedNoPanelLine).toBe(2);
    expect(rejections.arcsRejectedNoHostWall).toBe(0);
    expect(describeDoorOutcome(rejections)).toContain('no door-panel line at the hinge');
  });

  it('an accepted door still tallies, and reads as a clean success', () => {
    const wall: WallCandidate = {
      centerLine: [[0, 0], [30000, 0]],
      thickness: 200,
      confidence: 0.9,
      pairLine1: { p1: [0, -100], p2: [30000, -100], angle: 0, length: 30000 },
      pairLine2: { p1: [0, 100], p2: [30000, 100], angle: 0, length: 30000 },
    };
    const { openings, rejections } =
      matchOpeningSymbolsWithDiagnostics(page(nDoorSymbols(3)), [wall], MM_PER_PT);

    expect(openings.filter((o) => o.kind === 'door')).toHaveLength(3);
    expect(rejections.doorsAccepted).toBe(3);
    expect(totalDoorArcsRejected(rejections)).toBe(0);
    expect(describeDoorOutcome(rejections)).toContain('no door arc was rejected');
  });
});

// ── Walls: "no line-work" vs "every pair rejected" ──────────────────────────

describe('§VEC-REJECT-TALLY — walls: a wrong scale is not an empty drawing', () => {
  /** A closed rectangular room drawn as two parallel line pairs. */
  function roomLines(thicknessPt: number): VectorElement[] {
    return [
      { kind: 'line', points: [[0, 0], [400, 0]] },
      { kind: 'line', points: [[0, thicknessPt], [400, thicknessPt]] },
      { kind: 'line', points: [[0, 0], [0, 300]] },
      { kind: 'line', points: [[thicknessPt, 0], [thicknessPt, 300]] },
    ];
  }

  // At 10 mm/pt a 20 pt gap is a 200 mm wall — accepted.
  const goodScale = { p: page(roomLines(20)), scale: 10 };
  // At 0.1 mm/pt the SAME drawing has 2 mm walls — every pair rejected as too
  // thin. This is the live production failure: a miscalibrated Step 2.
  const wrongScale = { p: page(roomLines(20)), scale: 0.1 };
  const nothingThere = { p: page([]), scale: 10 };

  it('BEFORE (the collision): "no line-work" and "wrong scale" both return zero walls', () => {
    const a = classifyWallsAndColumns(nothingThere.p, nothingThere.scale);
    const b = classifyWallsAndColumns(wrongScale.p, wrongScale.scale);

    expect(a.walls).toHaveLength(0);
    expect(b.walls).toHaveLength(0);
    expect(a.walls).toEqual(b.walls); // ← THE BUG
  });

  it('AFTER: the tally names which one it was', () => {
    const a = classifyWallsAndColumnsWithDiagnostics(nothingThere.p, nothingThere.scale);
    const b = classifyWallsAndColumnsWithDiagnostics(wrongScale.p, wrongScale.scale);
    const c = classifyWallsAndColumnsWithDiagnostics(goodScale.p, goodScale.scale);

    // Nothing on the page: nothing eligible, nothing rejected.
    expect(a.wallRejections.linesEligible).toBe(0);
    expect(totalWallPairsRejected(a.wallRejections)).toBe(0);
    expect(a.wallRejections.rejectedTooShort).toBe(0);

    // Wrong scale: the lines are there, they were measured, and they were
    // thrown out for a stated reason.
    const bTossed = b.wallRejections.rejectedTooShort
      + totalWallPairsRejected(b.wallRejections);
    expect(bTossed).toBeGreaterThan(0);

    // Right scale: walls survive.
    expect(c.walls.length).toBeGreaterThan(0);
    expect(c.wallRejections.wallsAccepted).toBe(c.walls.length);

    expect(describeWallOutcome(a.wallRejections))
      .not.toBe(describeWallOutcome(b.wallRejections));
    expect(describeWallOutcome(a.wallRejections)).toContain('nothing was rejected');
    expect(describeWallOutcome(b.wallRejections)).toContain('REJECTED');
  });

  it('the tally arithmetic closes: considered = accepted-pairs + rejected + consumed', () => {
    const { wallRejections: t } = classifyWallsAndColumnsWithDiagnostics(
      goodScale.p, goodScale.scale);
    expect(t.vectorsSeen).toBe(4);
    expect(t.rejectedNotASegment).toBe(0);
    expect(t.linesEligible + t.rejectedTooShort + t.rejectedNotASegment).toBe(t.vectorsSeen);
    expect(t.pairsConsidered).toBeGreaterThanOrEqual(
      t.wallsAccepted + totalWallPairsRejected(t));
  });
});

// ── Adapter: the last place an opening can vanish ───────────────────────────

describe('§VEC-REJECT-TALLY — adapter: a homeless opening is counted, not swallowed', () => {
  const identity: Affine2D = [1, 0, 0, 1, 0, 0];

  const wall: WallCandidate = {
    centerLine: [[0, 0], [5000, 0]],
    thickness: 200,
    confidence: 0.9,
    pairLine1: { p1: [0, -100], p2: [5000, -100], angle: 0, length: 5000 },
    pairLine2: { p1: [0, 100], p2: [5000, 100], angle: 0, length: 5000 },
  };
  const orphanOpening = {
    kind: 'door' as const,
    subtype: 'single-swing-90',
    position: [2500, 0] as readonly [number, number],
    openingWidthMm: 900,
    hostWallCenterLine: [[0, 0], [5000, 0]] as ReadonlyArray<readonly [number, number]>,
    confidence: 0.9,
  };

  it('BEFORE (the collision): "no openings supplied" and "3 openings dropped" both yield 0', () => {
    const a = vectorResultToFloorPlanAnalysis({
      walls: [], openings: [], mmToPx: identity, imageWidthPx: 100, imageHeightPx: 100,
    });
    const b = vectorResultToFloorPlanAnalysis({
      walls: [], openings: [orphanOpening, orphanOpening, orphanOpening],
      mmToPx: identity, imageWidthPx: 100, imageHeightPx: 100,
    });

    expect(a.openings).toHaveLength(0);
    expect(b.openings).toHaveLength(0);
    expect(a.openings).toEqual(b.openings); // ← THE BUG
  });

  it('AFTER: the tally reports 0 in vs 3 dropped, and the sentences differ', () => {
    const a = vectorResultToFloorPlanAnalysisWithDiagnostics({
      walls: [], openings: [], mmToPx: identity, imageWidthPx: 100, imageHeightPx: 100,
    });
    const b = vectorResultToFloorPlanAnalysisWithDiagnostics({
      walls: [], openings: [orphanOpening, orphanOpening, orphanOpening],
      mmToPx: identity, imageWidthPx: 100, imageHeightPx: 100,
    });

    expect(a.rejections.openingsIn).toBe(0);
    expect(a.rejections.openingsRejectedNoHostWall).toBe(0);
    expect(b.rejections.openingsIn).toBe(3);
    expect(b.rejections.openingsRejectedNoHostWall).toBe(3);
  });

  it('a surviving host wall keeps the opening — the tally is not a blanket reject', () => {
    const { analysis, rejections } = vectorResultToFloorPlanAnalysisWithDiagnostics({
      walls: [wall],
      openings: [{ ...orphanOpening, hostWallCenterLine: wall.centerLine }],
      mmToPx: identity, imageWidthPx: 100, imageHeightPx: 100,
    });
    expect(analysis.openings).toHaveLength(1);
    expect(rejections.openingsRejectedNoHostWall).toBe(0);
    expect(rejections.openingsOut).toBe(1);
    expect(rejections.wallsOut).toBe(1);
  });
});

// ── The combined report ─────────────────────────────────────────────────────

describe('§VEC-REJECT-TALLY — describeVectorRejections is the user-facing seam', () => {
  it('an all-empty page and an all-rejected page never share a description', () => {
    const noWalls: readonly WallCandidate[] = [];

    const emptyOpen = matchOpeningSymbolsWithDiagnostics(page([]), noWalls, MM_PER_PT);
    const emptyWalls = classifyWallsAndColumnsWithDiagnostics(page([]), MM_PER_PT);
    const emptyAdapter = vectorResultToFloorPlanAnalysisWithDiagnostics({
      walls: [], openings: [], mmToPx: [1, 0, 0, 1, 0, 0], imageWidthPx: 1, imageHeightPx: 1,
    });

    const busyOpen = matchOpeningSymbolsWithDiagnostics(
      page(nDoorSymbols(12)), noWalls, MM_PER_PT);

    const emptyText = describeVectorRejections({
      walls: emptyWalls.wallRejections,
      columns: emptyWalls.columnRejections,
      openings: emptyOpen.rejections,
      adapter: emptyAdapter.rejections,
    });
    const busyText = describeVectorRejections({
      walls: emptyWalls.wallRejections,
      columns: emptyWalls.columnRejections,
      openings: busyOpen.rejections,
      adapter: emptyAdapter.rejections,
    });

    expect(emptyText).not.toBe(busyText);
    expect(emptyText).toContain('no arc primitives at all');
    expect(busyText).toContain('12 REJECTED');
  });
});
