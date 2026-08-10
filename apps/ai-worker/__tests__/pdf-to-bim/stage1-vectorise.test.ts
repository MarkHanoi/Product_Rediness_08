// @pryzm/ai-worker — Stage 1 vectoriser tests (§VEC-WIRE 2026-08-10).
//
// Verifies the pdf.js operator-list decoding that feeds the Stage 2
// classifiers: transform simulation (save/restore/transform), path
// decoding (line / polyline / closed polygon), Bézier→arc fitting for
// door swings, and the polyline/polygon explosion helper the wall-pair
// detector depends on.

import { describe, expect, it } from 'vitest';
import {
  explodeVectorLines,
  extractVectorElements,
  fitArc,
  hasUsableVectorLineWork,
  type PdfOpsSubset,
} from '../../src/pdf-to-bim/index.js';
import type { VectorElement } from '../../src/pdf-to-bim/index.js';

// Numeric codes match pdfjs-dist 5.7, but the vectoriser only ever compares
// against THIS table — the values are arbitrary as far as the tests go.
const OPS: PdfOpsSubset & { stroke: number } = {
  save: 10,
  restore: 11,
  transform: 12,
  setLineWidth: 2,
  constructPath: 91,
  endPath: 28,
  stroke: 20,
};

// Draw sub-op codes (pdf.js DrawOPS).
const MOVE = 0;
const LINE = 1;
const CURVE = 2;
const CLOSE = 4;

/** Build an opList with a single constructPath op. */
function pathOpList(drawOps: number[], paintOp: number = OPS.stroke) {
  return {
    fnArray: [OPS.constructPath],
    argsArray: [[paintOp, [drawOps], [0, 0, 0, 0]]],
  };
}

describe('extractVectorElements — path decoding', () => {
  it('decodes a stroked 2-point line', () => {
    const els = extractVectorElements(pathOpList([MOVE, 10, 20, LINE, 110, 20]), OPS);
    expect(els).toHaveLength(1);
    expect(els[0]).toMatchObject({ kind: 'line', points: [[10, 20], [110, 20]] });
  });

  it('decodes a multi-segment open path as a polyline', () => {
    const els = extractVectorElements(
      pathOpList([MOVE, 0, 0, LINE, 100, 0, LINE, 100, 50]),
      OPS,
    );
    expect(els).toHaveLength(1);
    expect(els[0]!.kind).toBe('polyline');
    expect(els[0]!.points).toHaveLength(3);
  });

  it('decodes a closed rectangle as a 4-vertex closed polygon (column contract)', () => {
    const els = extractVectorElements(
      pathOpList([MOVE, 0, 0, LINE, 20, 0, LINE, 20, 30, LINE, 0, 30, CLOSE]),
      OPS,
    );
    expect(els).toHaveLength(1);
    expect(els[0]!.kind).toBe('polygon');
    expect(els[0]!.closed).toBe(true);
    // detectColumns/isApproximateRectangle requires exactly 4 DISTINCT points.
    expect(els[0]!.points).toHaveLength(4);
  });

  it('decodes several subpaths inside one constructPath', () => {
    const els = extractVectorElements(
      pathOpList([MOVE, 0, 0, LINE, 50, 0, MOVE, 0, 10, LINE, 50, 10]),
      OPS,
    );
    expect(els.map(e => e.kind)).toEqual(['line', 'line']);
  });

  it('applies transform / save / restore to coordinates', () => {
    const opList = {
      fnArray: [OPS.save, OPS.transform, OPS.constructPath, OPS.restore, OPS.constructPath],
      argsArray: [
        null,
        [2, 0, 0, 2, 10, 20], // scale ×2, translate (10, 20)
        [OPS.stroke, [[MOVE, 0, 0, LINE, 5, 0]], null],
        null,
        [OPS.stroke, [[MOVE, 0, 0, LINE, 5, 0]], null],
      ],
    };
    const els = extractVectorElements(opList, OPS);
    expect(els).toHaveLength(2);
    expect(els[0]!.points).toEqual([[10, 20], [20, 20]]);   // transformed
    expect(els[1]!.points).toEqual([[0, 0], [5, 0]]);       // restored
  });

  it('records the current stroke width on emitted lines', () => {
    const opList = {
      fnArray: [OPS.setLineWidth!, OPS.constructPath],
      argsArray: [[3.5], [OPS.stroke, [[MOVE, 0, 0, LINE, 9, 0]], null]],
    };
    const els = extractVectorElements(opList, OPS);
    expect(els[0]!.strokeWidth).toBe(3.5);
  });

  it('skips clip paths (endPath) — they are not drawn geometry', () => {
    const els = extractVectorElements(
      pathOpList([MOVE, 0, 0, LINE, 100, 0], OPS.endPath!),
      OPS,
    );
    expect(els).toHaveLength(0);
  });

  it('skips cached Path2D-style data (re-executed operator list)', () => {
    const opList = {
      fnArray: [OPS.constructPath],
      argsArray: [[OPS.stroke, [{ not: 'an array' }], null]],
    };
    expect(extractVectorElements(opList, OPS)).toHaveLength(0);
  });
});

describe('extractVectorElements — Bézier arc fitting (door swings)', () => {
  /** Cubic control points approximating a circular arc from angle a0 to a1
   *  (single segment, k-formula). */
  function arcCubic(cx: number, cy: number, r: number, a0: number, a1: number): number[] {
    const k = (4 / 3) * Math.tan((a1 - a0) / 4);
    const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
    const p3 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
    const p1 = [p0[0]! - k * r * Math.sin(a0), p0[1]! + k * r * Math.cos(a0)];
    const p2 = [p3[0]! + k * r * Math.sin(a1), p3[1]! - k * r * Math.cos(a1)];
    return [MOVE, p0[0]!, p0[1]!, CURVE, p1[0]!, p1[1]!, p2[0]!, p2[1]!, p3[0]!, p3[1]!];
  }

  it('recognises a 90° swing arc: [center, startPt, endPt] convention', () => {
    const els = extractVectorElements(pathOpList(arcCubic(100, 100, 40, 0, Math.PI / 2)), OPS);
    expect(els).toHaveLength(1);
    const arc = els[0]!;
    expect(arc.kind).toBe('arc');
    const [center, start, end] = arc.points;
    expect(center![0]).toBeCloseTo(100, 0);
    expect(center![1]).toBeCloseTo(100, 0);
    expect(start![0]).toBeCloseTo(140, 0);
    expect(start![1]).toBeCloseTo(100, 0);
    expect(end![0]).toBeCloseTo(100, 0);
    expect(end![1]).toBeCloseTo(140, 0);
  });

  it('does NOT emit an arc for a non-circular curve', () => {
    // A flat S-ish cubic — nowhere near a constant radius.
    const els = extractVectorElements(
      pathOpList([MOVE, 0, 0, CURVE, 30, 60, 70, -60, 100, 0]),
      OPS,
    );
    expect(els.filter(e => e.kind === 'arc')).toHaveLength(0);
  });

  it('fitArc rejects tiny sweeps and accepts quarter circles', () => {
    const circleSamples = (sweep: number) =>
      Array.from({ length: 9 }, (_, i) => {
        const a = (i / 8) * sweep;
        return [50 + 10 * Math.cos(a), 50 + 10 * Math.sin(a)] as const;
      });
    expect(fitArc(circleSamples(Math.PI / 2))).not.toBeNull();
    expect(fitArc(circleSamples(0.05))).toBeNull();
  });
});

describe('explodeVectorLines / hasUsableVectorLineWork', () => {
  it('explodes polylines and polygons into 2-point lines, keeping originals', () => {
    const polygon: VectorElement = {
      kind: 'polygon',
      points: [[0, 0], [10, 0], [10, 10], [0, 10]],
      closed: true,
    };
    const polyline: VectorElement = { kind: 'polyline', points: [[0, 0], [5, 0], [5, 5]] };
    const out = explodeVectorLines([polygon, polyline]);
    // originals + 4 polygon edges (incl. closing) + 2 polyline segments
    expect(out).toHaveLength(2 + 4 + 2);
    expect(out.filter(v => v.kind === 'line')).toHaveLength(6);
    expect(out.filter(v => v.kind === 'polygon')).toHaveLength(1);
  });

  it('hasUsableVectorLineWork honours the threshold', () => {
    const lines: VectorElement[] = Array.from({ length: 24 }, (_, i) => ({
      kind: 'line',
      points: [[0, i], [10, i]],
    }));
    expect(hasUsableVectorLineWork(lines)).toBe(true);
    expect(hasUsableVectorLineWork(lines.slice(0, 5))).toBe(false);
  });
});
