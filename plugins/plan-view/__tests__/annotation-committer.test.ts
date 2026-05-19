// Annotation committer — Canvas2D draw tests (S32).
//
// Coverage:
//   • draw() dispatches on `layout.type` and emits the expected canvas ops
//     for each variant (text, leader+arrowhead, callout box+leader, region).
//   • Painter's order honours array order (region drawn before text on top
//     of it).
//   • The committer SAVE/RESTOREs around each annotation (no transform
//     leakage between layouts).

import { describe, expect, it } from 'vitest';
import { AnnotationCommitter, type AnnotationCommitContext2D } from '../src/annotation-committer.js';
import type { AnnotationLayout } from '../src/annotation-renderer.js';

interface Op { fn: string; args: unknown[]; }

function buildRecCtx(): { ctx: AnnotationCommitContext2D; ops: Op[] } {
  const ops: Op[] = [];
  const rec = (fn: string) => (...args: unknown[]) => ops.push({ fn, args });
  const ctx: AnnotationCommitContext2D = {
    beginPath: () => ops.push({ fn: 'beginPath', args: [] }),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    closePath: () => ops.push({ fn: 'closePath', args: [] }),
    stroke: () => ops.push({ fn: 'stroke', args: [] }),
    fill: () => ops.push({ fn: 'fill', args: [] }),
    save: () => ops.push({ fn: 'save', args: [] }),
    restore: () => ops.push({ fn: 'restore', args: [] }),
    translate: rec('translate'),
    rotate: rec('rotate'),
    fillRect: rec('fillRect'),
    strokeRect: rec('strokeRect'),
    fillText: rec('fillText'),
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 0,
    lineCap: 'butt' as CanvasLineCap,
    lineJoin: 'miter' as CanvasLineJoin,
    font: '',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    textAlign: 'start' as CanvasTextAlign,
    globalAlpha: 1,
  };
  return { ctx, ops };
}

describe('AnnotationCommitter — S32', () => {
  it('draws a text layout with translate + fillText, save/restore-balanced', () => {
    const { ctx, ops } = buildRecCtx();
    new AnnotationCommitter(ctx).draw([{
      id: 't', type: 'text',
      text: { content: 'Wall A', anchor: [10, 20], angle: 0, fontSize: 12, fontWeight: 'normal' },
    }]);
    const trans = ops.find((o) => o.fn === 'translate')!;
    expect(trans.args).toEqual([10, 20]);
    const fillText = ops.find((o) => o.fn === 'fillText')!;
    expect(fillText.args[0]).toBe('Wall A');
    expect(fillText.args[1]).toBe(0);
    expect(fillText.args[2]).toBe(0);
    expect(ops.filter((o) => o.fn === 'save')).toHaveLength(1);
    expect(ops.filter((o) => o.fn === 'restore')).toHaveLength(1);
  });

  it('draws a leader: poly-line + arrowhead triangle + label fillText', () => {
    const { ctx, ops } = buildRecCtx();
    new AnnotationCommitter(ctx).draw([{
      id: 'l', type: 'leader',
      leader: {
        points: [[0, 0], [10, 0], [20, 5]],
        arrowHead: [20, 5],
        labelAnchor: [0, 0],
        labelText: 'CLR',
      },
    }]);
    // First moveTo at the polyline start.
    const firstMove = ops.find((o) => o.fn === 'moveTo')!;
    expect(firstMove.args).toEqual([0, 0]);
    // 2 lineTo for the polyline + 2 lineTo for the arrowhead triangle.
    const lineTos = ops.filter((o) => o.fn === 'lineTo');
    expect(lineTos.length).toBeGreaterThanOrEqual(4);
    // Arrowhead is filled (the triangle).
    expect(ops.filter((o) => o.fn === 'fill')).toHaveLength(1);
    // Polyline is stroked.
    expect(ops.filter((o) => o.fn === 'stroke').length).toBeGreaterThanOrEqual(1);
    // Label rendered with fillText.
    expect(ops.find((o) => o.fn === 'fillText' && o.args[0] === 'CLR')).toBeDefined();
  });

  it('draws a callout: strokeRect + fillText + leader stroke', () => {
    const { ctx, ops } = buildRecCtx();
    new AnnotationCommitter(ctx).draw([{
      id: 'c', type: 'callout',
      callout: {
        boxCorner: [50, 50], boxWidth: 100, boxHeight: 30,
        text: 'Note A',
        leaderPoint: [200, 100],
      },
    }]);
    const strokeRect = ops.find((o) => o.fn === 'strokeRect')!;
    expect(strokeRect.args).toEqual([50, 50, 100, 30]);
    const fillText = ops.find((o) => o.fn === 'fillText')!;
    expect(fillText.args[0]).toBe('Note A');
    // Leader from box-bottom-centre to leaderPoint.
    expect(ops.find((o) => o.fn === 'moveTo' && (o.args as number[])[0] === 50 + 100 / 2)).toBeDefined();
    expect(ops.find((o) => o.fn === 'lineTo' && (o.args as number[])[0] === 200)).toBeDefined();
  });

  it('draws a region: polygon path + fill + stroke; restores globalAlpha', () => {
    const { ctx, ops } = buildRecCtx();
    new AnnotationCommitter(ctx).draw([{
      id: 'r', type: 'region',
      region: {
        polygon: [[0, 0], [10, 0], [10, 10], [0, 10]],
        fillColor: 'rgba(255, 0, 0, 0.3)',
        fillOpacity: 0.3,
        strokeColor: '#a00',
      },
    }]);
    expect(ops.filter((o) => o.fn === 'moveTo')).toHaveLength(1);
    expect(ops.filter((o) => o.fn === 'lineTo')).toHaveLength(3);
    expect(ops.filter((o) => o.fn === 'closePath')).toHaveLength(1);
    expect(ops.filter((o) => o.fn === 'fill')).toHaveLength(1);
    expect(ops.filter((o) => o.fn === 'stroke')).toHaveLength(1);
  });

  it('save/restore is balanced for every layout (no transform leakage)', () => {
    const { ctx, ops } = buildRecCtx();
    const layouts: AnnotationLayout[] = [
      { id: 'a', type: 'text', text: { content: 'A', anchor: [0, 0], angle: 0, fontSize: 11, fontWeight: 'normal' } },
      { id: 'b', type: 'leader', leader: { points: [[0,0],[1,0]], arrowHead: [1,0], labelAnchor: [0,0], labelText: '' } },
      { id: 'c', type: 'callout', callout: { boxCorner: [0,0], boxWidth: 10, boxHeight: 10, text: '', leaderPoint: [5,5] } },
      { id: 'd', type: 'region', region: { polygon: [[0,0],[1,0],[1,1]], fillColor: '#f00', fillOpacity: 0.2, strokeColor: '#000' } },
    ];
    new AnnotationCommitter(ctx).draw(layouts);
    const saves = ops.filter((o) => o.fn === 'save').length;
    const restores = ops.filter((o) => o.fn === 'restore').length;
    expect(saves).toBe(restores);
    // 1 per text + 2 per leader (leader + arrowhead) + 1 per callout + 1 per region = 5
    expect(saves).toBe(5);
  });

  it('honours input order — region BEFORE text in the array paints first', () => {
    const { ctx, ops } = buildRecCtx();
    new AnnotationCommitter(ctx).draw([
      { id: 'r', type: 'region', region: { polygon: [[0,0],[1,0],[1,1]], fillColor: '#f00', fillOpacity: 0.2, strokeColor: '#000' } },
      { id: 't', type: 'text',   text: { content: 'On top', anchor: [5, 5], angle: 0, fontSize: 11, fontWeight: 'normal' } },
    ]);
    const firstFill = ops.findIndex((o) => o.fn === 'fill');
    const firstFillText = ops.findIndex((o) => o.fn === 'fillText');
    expect(firstFill).toBeGreaterThan(-1);
    expect(firstFillText).toBeGreaterThan(-1);
    expect(firstFill).toBeLessThan(firstFillText);
  });

  it('skips degenerate inputs gracefully (empty leader, < 3-vertex region)', () => {
    const { ctx, ops } = buildRecCtx();
    new AnnotationCommitter(ctx).draw([
      { id: 'l', type: 'leader', leader: { points: [], arrowHead: [0,0], labelAnchor: [0,0], labelText: '' } },
      { id: 'r', type: 'region', region: { polygon: [[0,0],[1,0]], fillColor: '#f00', fillOpacity: 0.2, strokeColor: '#000' } },
    ]);
    // Empty leader → no draw calls; sub-3-vertex region → no draw calls.
    expect(ops.filter((o) => o.fn === 'stroke')).toHaveLength(0);
    expect(ops.filter((o) => o.fn === 'fill')).toHaveLength(0);
  });
});
