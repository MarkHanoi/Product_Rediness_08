import { describe, expect, it } from 'vitest';
import { Canvas2DBackend, classifierToPrimitives, type Canvas2DLike } from '../src/index.js';

/** Minimal recording canvas — captures every method call for snapshot. */
function recorder(): { ctx: Canvas2DLike; calls: Array<[string, ...unknown[]]> } {
  const calls: Array<[string, ...unknown[]]> = [];
  const ctx: Record<string, unknown> = {
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    globalAlpha: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic',
  };
  const methods = [
    'setLineDash', 'beginPath', 'moveTo', 'lineTo', 'closePath',
    'arc', 'stroke', 'fill', 'save', 'restore', 'translate', 'rotate',
    'fillText', 'fillRect', 'clearRect',
  ];
  for (const m of methods) {
    ctx[m] = (...args: unknown[]) => { calls.push([m, ...args]); };
  }
  return { ctx: ctx as unknown as Canvas2DLike, calls };
}

describe('Canvas2DBackend', () => {
  it('renders a line primitive as moveTo + lineTo + stroke', () => {
    const { ctx, calls } = recorder();
    const backend = new Canvas2DBackend(ctx);
    backend.render(
      [{ kind: 'line', a: { x: 1, y: 2 }, b: { x: 3, y: 4 }, stroke: { color: '#000', weight: 1 } }],
      { widthPx: 100, heightPx: 100 },
    );
    const names = calls.map((c) => c[0]);
    expect(names).toContain('moveTo');
    expect(names).toContain('lineTo');
    expect(names).toContain('stroke');
  });

  it('clears canvas when no background supplied', () => {
    const { ctx, calls } = recorder();
    new Canvas2DBackend(ctx).render([], { widthPx: 50, heightPx: 50 });
    expect(calls.find((c) => c[0] === 'clearRect')).toBeDefined();
  });

  it('paints background when supplied', () => {
    const { ctx, calls } = recorder();
    new Canvas2DBackend(ctx).render([], { widthPx: 50, heightPx: 50, background: '#ffffff' });
    expect(calls.find((c) => c[0] === 'fillRect')).toBeDefined();
  });

  it('drives the full classifier→primitive→canvas pipe', () => {
    const { ctx, calls } = recorder();
    const stream = classifierToPrimitives({
      edges: [
        { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, classification: 'cut' },
        { a: { x: 0, y: 0 }, b: { x: 0, y: 10 }, classification: 'projection' },
      ],
      pocheFills: [
        { outer: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], fillColor: '#888' },
      ],
    });
    new Canvas2DBackend(ctx).render(stream, { widthPx: 100, heightPx: 100 });

    const moveCalls = calls.filter((c) => c[0] === 'moveTo').length;
    expect(moveCalls).toBeGreaterThanOrEqual(3); // 1 polygon + 2 lines
  });

  it('renders text with rotation save/translate/rotate/restore framing', () => {
    const { ctx, calls } = recorder();
    new Canvas2DBackend(ctx).render(
      [{
        kind: 'text', anchor: { x: 5, y: 5 }, text: 'A',
        fontSizePx: 12, rotation: Math.PI / 4,
        fill: { color: '#000' },
      }],
      { widthPx: 100, heightPx: 100 },
    );
    const names = calls.map((c) => c[0]);
    const sIdx = names.indexOf('save');
    const tIdx = names.indexOf('translate');
    const rIdx = names.indexOf('rotate');
    const fIdx = names.indexOf('fillText');
    const restoreIdx = names.lastIndexOf('restore');
    expect(sIdx).toBeGreaterThan(-1);
    expect(tIdx).toBeGreaterThan(sIdx);
    expect(rIdx).toBeGreaterThan(tIdx);
    expect(fIdx).toBeGreaterThan(rIdx);
    expect(restoreIdx).toBeGreaterThan(fIdx);
  });
});
