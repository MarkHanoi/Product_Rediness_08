// GR-10 (`[]`-means-unknown ledger · C75 §1.4 · C78 §1.4/§8.1 · C71 §4.4) —
// the Inspect audit's Wall Count / Columns (bounding) columns stop printing a
// hard 0 about rooms whose bounding sets were never recorded.
//
// The old shape was `(el.boundingWallIds ?? []).length` — the standing C78
// §0.g example read at yet another surface: empty at the writer, defaulted at
// the reader, rendered as an exact zero in an AUDIT panel. The column already
// had an unknown glyph ('—' via null); the fix routes unrecorded fields to it.
// The differentiating assertions below fail against the `?? []` shape, which
// returned 0 for an absent field.

import { describe, it, expect } from 'vitest';
import { _lenOrUnknown, ELEMENT_ATTRIBUTES } from '../inspect/audit/ElementTypeSelectorZone';

describe('_lenOrUnknown — an unrecorded id-list is null (unknown), never 0 (GR-10)', () => {
  it('ABSENT field → null (renders as the — glyph)', () => {
    // FAILS against the old `(x ?? []).length` shape, which returned 0.
    expect(_lenOrUnknown(undefined)).toBeNull();
    expect(_lenOrUnknown(null)).toBeNull();
  });

  it('negative control: a PRESENT empty array is a real 0', () => {
    expect(_lenOrUnknown([])).toBe(0);
  });

  it('a present list counts its members', () => {
    expect(_lenOrUnknown(['w1', 'w2', 'w3'])).toBe(3);
  });
});

describe('the room count descriptors route unrecorded bounding sets to unknown (GR-10)', () => {
  const attr = (key: string) => ELEMENT_ATTRIBUTES.rooms.find((a: { key: string }) => a.key === key)!;

  it('wallCount: unrecorded boundingWallIds → null; recorded-empty → 0', () => {
    // No contents service in this environment → the descriptor falls back to
    // the field read, which is where the forgery lived.
    expect(attr('wallCount').extract({ id: 'r1' } as never)).toBeNull();
    expect(attr('wallCount').extract({ id: 'r1', boundingWallIds: [] } as never)).toBe(0);
    expect(attr('wallCount').extract({ id: 'r1', boundingWallIds: ['w1'] } as never)).toBe(1);
  });

  it('columnCount: unrecorded boundingColumnIds → null; recorded-empty → 0', () => {
    expect(attr('columnCount').extract({ id: 'r1' } as never)).toBeNull();
    expect(attr('columnCount').extract({ id: 'r1', boundingColumnIds: [] } as never)).toBe(0);
  });
});
