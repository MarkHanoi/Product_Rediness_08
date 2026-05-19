// BookExporter — page iteration, error policy, cancellation (S40).

import { describe, it, expect, vi } from 'vitest';
import {
  exportBook,
  type SheetPageRenderer,
  type DocumentAssembler,
} from '../src/book/book-exporter.js';
import { createBook } from '../src/book/book.js';

const okRenderer: SheetPageRenderer = async ({ sheetId }) =>
  ({ sheetId, bytes: new Uint8Array([sheetId.charCodeAt(0)]) });

const concatAssembler: DocumentAssembler = async (pages) => {
  let n = 0;
  for (const p of pages) n += p.bytes.byteLength;
  const out = new Uint8Array(n);
  let off = 0;
  for (const p of pages) { out.set(p.bytes, off); off += p.bytes.byteLength; }
  return out;
};

describe('exportBook', () => {
  it('iterates sheets in book order and emits one page per sheet', async () => {
    const book = createBook({ id: 'b', name: 'n', sheetIds: ['a', 'b', 'c'] });
    const renderer = vi.fn(okRenderer);
    const r = await exportBook({ book, format: 'pdf', renderer, assembler: concatAssembler });
    expect(renderer).toHaveBeenCalledTimes(3);
    expect(r.rendered.map((x) => x.sheetId)).toEqual(['a', 'b', 'c']);
    expect(r.rendered.map((x) => x.pageIndex)).toEqual([1, 2, 3]);
    expect(r.errors).toEqual([]);
    expect(Array.from(r.bytes)).toEqual(['a', 'b', 'c'].map((s) => s.charCodeAt(0)));
  });

  it('fires onProgress with monotonically increasing fractions', async () => {
    const book = createBook({ id: 'b', name: 'n', sheetIds: ['a', 'b', 'c', 'd'] });
    const fractions: number[] = [];
    await exportBook({
      book, format: 'pdf', renderer: okRenderer, assembler: concatAssembler,
      onProgress: (p) => fractions.push(p.fraction),
    });
    expect(fractions).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it('aborts on the first error by default', async () => {
    const book = createBook({ id: 'b', name: 'n', sheetIds: ['a', 'b', 'c'] });
    const renderer: SheetPageRenderer = async ({ sheetId }) => {
      if (sheetId === 'b') throw new Error('boom');
      return { sheetId, bytes: new Uint8Array() };
    };
    await expect(exportBook({
      book, format: 'pdf', renderer, assembler: concatAssembler,
    })).rejects.toThrow('boom');
  });

  it('with errorPolicy="collect" skips bad sheets and assembles surviving pages', async () => {
    const book = createBook({ id: 'b', name: 'n', sheetIds: ['a', 'b', 'c'] });
    const renderer: SheetPageRenderer = async ({ sheetId }) => {
      if (sheetId === 'b') throw new Error('boom');
      return { sheetId, bytes: new Uint8Array([sheetId.charCodeAt(0)]) };
    };
    const r = await exportBook({
      book, format: 'pdf', renderer, assembler: concatAssembler, errorPolicy: 'collect',
    });
    expect(r.rendered.map((x) => x.sheetId)).toEqual(['a', 'c']);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.sheetId).toBe('b');
    expect(Array.from(r.bytes)).toEqual(['a', 'c'].map((s) => s.charCodeAt(0)));
  });

  it('throws when EVERY sheet fails (refuses empty document)', async () => {
    const book = createBook({ id: 'b', name: 'n', sheetIds: ['a', 'b'] });
    const renderer: SheetPageRenderer = async () => { throw new Error('nope'); };
    await expect(exportBook({
      book, format: 'pdf', renderer, assembler: concatAssembler, errorPolicy: 'collect',
    })).rejects.toThrow(/refusing to assemble empty document/);
  });

  it('throws on an empty book', async () => {
    const book = createBook({ id: 'b', name: 'n' });
    await expect(exportBook({
      book, format: 'pdf', renderer: okRenderer, assembler: concatAssembler,
    })).rejects.toThrow(/no sheets/);
  });

  it('honours an AbortSignal — rejects with AbortError before next page', async () => {
    const book = createBook({ id: 'b', name: 'n', sheetIds: ['a', 'b', 'c'] });
    const ctrl = new AbortController();
    const renderer: SheetPageRenderer = async ({ sheetId }) => {
      if (sheetId === 'b') ctrl.abort();
      return { sheetId, bytes: new Uint8Array([sheetId.charCodeAt(0)]) };
    };
    await expect(exportBook({
      book, format: 'pdf', renderer, assembler: concatAssembler, signal: ctrl.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('passes format ("pdf"/"dxf") through to renderer + assembler', async () => {
    const book = createBook({ id: 'b', name: 'n', sheetIds: ['a'] });
    const renderer = vi.fn(okRenderer);
    const assembler = vi.fn(concatAssembler);
    await exportBook({ book, format: 'dxf', renderer, assembler });
    expect(renderer.mock.calls[0]![0].format).toBe('dxf');
    expect(assembler.mock.calls[0]![1]).toBe('dxf');
  });
});
