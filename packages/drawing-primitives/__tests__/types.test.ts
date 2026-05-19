import { describe, expect, it } from 'vitest';
import {
  BackendNotImplementedError,
  classifierToPrimitives,
  PdfBackend,
  PrintCanvasBackend,
  SvgBackend,
  type Primitive,
} from '../src/index.js';

describe('classifierToPrimitives', () => {
  it('emits poche fills before edge lines (painter order)', () => {
    const out = [...classifierToPrimitives({
      edges: [
        { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, classification: 'cut' },
      ],
      pocheFills: [
        { outer: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], fillColor: '#888' },
      ],
    })];
    expect(out).toHaveLength(2);
    expect(out[0]?.kind).toBe('polygon');
    expect(out[1]?.kind).toBe('line');
  });

  it('uses classification-default stroke when no override is supplied', () => {
    const out = [...classifierToPrimitives({
      edges: [
        { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, classification: 'beyond' },
        { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, classification: 'hidden' },
      ],
      pocheFills: [],
    })];
    expect((out[0] as Extract<Primitive, { kind: 'line' }>).stroke.dash).toBe('dashed');
    expect((out[1] as Extract<Primitive, { kind: 'line' }>).stroke.dash).toBe('dotted');
  });

  it('respects an explicit strokeOverride', () => {
    const out = [...classifierToPrimitives({
      edges: [
        {
          a: { x: 0, y: 0 }, b: { x: 1, y: 0 },
          classification: 'cut',
          strokeOverride: { color: '#ff0000', weight: 5, dash: 'centerline' },
        },
      ],
      pocheFills: [],
    })];
    const stroke = (out[0] as Extract<Primitive, { kind: 'line' }>).stroke;
    expect(stroke.color).toBe('#ff0000');
    expect(stroke.weight).toBe(5);
    expect(stroke.dash).toBe('centerline');
  });

  it('honours caller-supplied default-stroke overrides', () => {
    const out = [...classifierToPrimitives({
      edges: [{ a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, classification: 'cut' }],
      pocheFills: [],
      defaultStrokes: { cut: { color: '#0000ff', weight: 3 } },
    })];
    const stroke = (out[0] as Extract<Primitive, { kind: 'line' }>).stroke;
    expect(stroke.color).toBe('#0000ff');
    expect(stroke.weight).toBe(3);
  });
});

describe('typed-stub backends', () => {
  it('SvgBackend throws BackendNotImplementedError carrying the S55 marker', () => {
    const b = new SvgBackend();
    expect(b.id).toBe('svg');
    expect(b.sprintMarker).toBe('S55');
    expect(() => b.render([], { widthPx: 100, heightPx: 100 })).toThrow(BackendNotImplementedError);
  });

  it('PdfBackend throws with S37 marker', () => {
    const b = new PdfBackend();
    expect(b.id).toBe('pdf');
    expect(b.sprintMarker).toBe('S37');
    let err: unknown;
    try { b.render([], { widthPx: 100, heightPx: 100 }); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(BackendNotImplementedError);
    expect((err as BackendNotImplementedError).message).toContain('S37');
  });

  it('PrintCanvasBackend throws with S40 marker', () => {
    const b = new PrintCanvasBackend();
    expect(b.id).toBe('print-canvas');
    expect(b.sprintMarker).toBe('S40');
    expect(() => b.render([], { widthPx: 100, heightPx: 100 })).toThrow(/S40/);
  });
});
