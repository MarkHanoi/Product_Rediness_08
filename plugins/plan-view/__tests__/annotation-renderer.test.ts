// Annotation layout — pure function tests (S32).
//
// Coverage:
//   • Per-type layout (text, leader, callout, region) projects WORLD XZ →
//     canvas CSS-pixel coords through `LayoutCamera.worldToCanvas`.
//   • Greedy overlap resolution nudges colliding text labels and is
//     deterministic across repeat runs.
//   • Bake-worker eligibility: the file imports nothing from the DOM,
//     Canvas, THREE, or React.  Verified at ESLint level by
//     `pryzm/no-impure-context`; this suite asserts the runtime contract
//     (the module exports + no globals are touched).

import { describe, expect, it } from 'vitest';
import {
  layoutAnnotations,
  __testHooks,
  type AnnotationDto,
  type LayoutCamera,
  type Vec2,
} from '../src/annotation-renderer.js';

const identityCamera: LayoutCamera = {
  worldToCanvas: ([x, y]: Vec2): Vec2 => [x, y],
};

function camWith(scale: number, panX: number, panY: number): LayoutCamera {
  return {
    worldToCanvas: ([wx, wz]: Vec2): Vec2 => [wx * scale + panX, -wz * scale + panY],
  };
}

describe('layoutAnnotations — S32 pure layout', () => {
  it('projects a text DTO through the camera into CSS-pixel anchor coords', () => {
    const dtos: AnnotationDto[] = [
      { id: 'a1', type: 'text', text: 'Door', anchor: [3, 5], fontSize: 12 },
    ];
    const layouts = layoutAnnotations(dtos, camWith(50, 100, 200), 800, 600);
    expect(layouts).toHaveLength(1);
    expect(layouts[0]!.type).toBe('text');
    expect(layouts[0]!.text!.anchor).toEqual([3 * 50 + 100, -5 * 50 + 200]);
    expect(layouts[0]!.text!.fontSize).toBe(12);
    expect(layouts[0]!.text!.content).toBe('Door');
  });

  it('projects a leader DTO; arrowHead is the LAST waypoint, labelAnchor is the FIRST', () => {
    const dtos: AnnotationDto[] = [
      {
        id: 'l1', type: 'leader', text: 'CLR',
        leaderPoints: [[0, 0], [2, 0], [4, -1]],
      },
    ];
    const layouts = layoutAnnotations(dtos, camWith(10, 0, 0), 800, 600);
    const l = layouts[0]!.leader!;
    expect(l.points).toHaveLength(3);
    expect(l.labelAnchor).toEqual([0, 0]);
    expect(l.arrowHead).toEqual([4 * 10, -(-1) * 10]); // = [40, 10]
    expect(l.labelText).toBe('CLR');
  });

  it('produces a callout layout with leaderPoint projected and box clamped to canvas', () => {
    const dtos: AnnotationDto[] = [
      {
        id: 'c1', type: 'callout', text: 'See A-3.1',
        anchor: [10, 0], leaderPoint: [12, -1],
        calloutBoxWidth: 100, calloutBoxHeight: 30,
      },
    ];
    const layouts = layoutAnnotations(dtos, camWith(20, 0, 0), 200, 100);
    const c = layouts[0]!.callout!;
    // anchor world (10, 0) → screen (200, 0); 200 + 100 > canvas-width 200,
    // so boxCorner.x is clamped: max(0, 200 - 100) = 100.
    expect(c.boxCorner[0]).toBe(100);
    expect(c.leaderPoint).toEqual([12 * 20, -(-1) * 20]); // = [240, 20]
    expect(c.boxWidth).toBe(100);
    expect(c.boxHeight).toBe(30);
  });

  it('projects a region polygon vertex-by-vertex through the camera', () => {
    const dtos: AnnotationDto[] = [
      {
        id: 'r1', type: 'region',
        polygon: [[0, 0], [4, 0], [4, 3], [0, 3]],
        fillColor: 'rgba(0,255,0,0.2)',
        strokeColor: '#000',
      },
    ];
    const layouts = layoutAnnotations(dtos, camWith(10, 5, 5), 800, 600);
    const r = layouts[0]!.region!;
    expect(r.polygon).toEqual([
      [0 * 10 + 5, -0 * 10 + 5],
      [4 * 10 + 5, -0 * 10 + 5],
      [4 * 10 + 5, -3 * 10 + 5],
      [0 * 10 + 5, -3 * 10 + 5],
    ]);
    expect(r.fillColor).toBe('rgba(0,255,0,0.2)');
    expect(r.strokeColor).toBe('#000');
  });

  it('preserves input order in the output array (no re-sorting)', () => {
    const dtos: AnnotationDto[] = [
      { id: 'a', type: 'text', text: 'A', anchor: [0, 0] },
      { id: 'b', type: 'leader', leaderPoints: [[0, 0], [1, 0]], text: 'B' },
      { id: 'c', type: 'region', polygon: [[0, 0], [1, 0], [1, 1]] },
    ];
    const out = layoutAnnotations(dtos, identityCamera, 100, 100);
    expect(out.map((l) => l.id)).toEqual(['a', 'b', 'c']);
    expect(out.map((l) => l.type)).toEqual(['text', 'leader', 'region']);
  });

  it('degrades a 0-point or 1-point leader gracefully (no throw)', () => {
    const dtos: AnnotationDto[] = [
      { id: 'l0', type: 'leader', text: 'no-points' },
      { id: 'l1', type: 'leader', text: 'one-point', leaderPoints: [[0, 0]] },
    ];
    expect(() => layoutAnnotations(dtos, identityCamera, 100, 100)).not.toThrow();
    const out = layoutAnnotations(dtos, identityCamera, 100, 100);
    expect(out[0]!.leader!.points).toEqual([]);
    expect(out[1]!.leader!.points).toHaveLength(1);
  });

  // ── Overlap resolution ────────────────────────────────────────────────────

  it('nudges a 2nd colliding text label down by ≥ one line-height', () => {
    // Two identical-position labels — the 2nd MUST move.
    const dtos: AnnotationDto[] = [
      { id: 't1', type: 'text', text: 'Same', anchor: [0, 0], fontSize: 12 },
      { id: 't2', type: 'text', text: 'Same', anchor: [0, 0], fontSize: 12 },
    ];
    const out = layoutAnnotations(dtos, identityCamera, 800, 600);
    const y1 = out[0]!.text!.anchor[1];
    const y2 = out[1]!.text!.anchor[1];
    expect(y2 - y1).toBeGreaterThanOrEqual(12 * 1.2 - 1e-9);
  });

  it('does NOT nudge non-overlapping text labels', () => {
    const dtos: AnnotationDto[] = [
      { id: 't1', type: 'text', text: 'A', anchor: [0,    0], fontSize: 11 },
      { id: 't2', type: 'text', text: 'B', anchor: [400, 50], fontSize: 11 },
    ];
    const out = layoutAnnotations(dtos, identityCamera, 800, 600);
    expect(out[0]!.text!.anchor).toEqual([0, 0]);
    expect(out[1]!.text!.anchor).toEqual([400, 50]);
  });

  it('overlap resolution is deterministic across repeat runs (visual-diff stable)', () => {
    const dtos: AnnotationDto[] = Array.from({ length: 10 }, (_, i) => ({
      id: `t${i}`,
      type: 'text' as const,
      text: 'Annotation',
      anchor: [0, 0] as Vec2,
      fontSize: 11,
    }));
    const a = layoutAnnotations(dtos, identityCamera, 800, 600);
    const b = layoutAnnotations(dtos, identityCamera, 800, 600);
    expect(a.map((l) => l.text!.anchor)).toEqual(b.map((l) => l.text!.anchor));
  });

  it('caps overlap-resolution passes (no infinite loop on pathological clusters)', () => {
    // 30 labels stacked at the same point; each pass nudges only the first
    // colliding one in each i,j scan.  Capped at 6 passes per the spec.
    // What we verify: the call returns in O(milliseconds), not that every
    // collision is resolved.
    const dtos: AnnotationDto[] = Array.from({ length: 30 }, (_, i) => ({
      id: `t${i}`,
      type: 'text' as const,
      text: 'X',
      anchor: [10, 10] as Vec2,
      fontSize: 11,
    }));
    const t0 = Date.now();
    const out = layoutAnnotations(dtos, identityCamera, 800, 600);
    expect(out).toHaveLength(30);
    expect(Date.now() - t0).toBeLessThan(50);
  });

  it('AABB hit-test uses the GLYPH_WIDTH_RATIO heuristic', () => {
    const { textAabb, GLYPH_WIDTH_RATIO } = __testHooks;
    const aabb = textAabb({
      content: 'Hello', anchor: [0, 0], angle: 0,
      fontSize: 10, fontWeight: 'normal',
    });
    expect(aabb.x1 - aabb.x0).toBeCloseTo(5 * 10 * GLYPH_WIDTH_RATIO, 6);
    expect(aabb.y1 - aabb.y0).toBe(10);
  });
});
