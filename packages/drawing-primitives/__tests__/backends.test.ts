// @pryzm/drawing-primitives — additional backend tests
// (Wave 13 zero-test drive — adds 2 tests to reach the ≥ 4 total target).

import { describe, expect, it } from 'vitest';
import {
  SvgBackend,
  BackendNotImplementedError,
  classifierToPrimitives,
} from '../src/index.js';

describe('@pryzm/drawing-primitives — SvgBackend', () => {
  it('render() throws BackendNotImplementedError (S55 stub)', () => {
    const backend = new SvgBackend();
    expect(() =>
      backend.render([], { widthPx: 100, heightPx: 100 }),
    ).toThrow(BackendNotImplementedError);
  });
});

describe('@pryzm/drawing-primitives — classifierToPrimitives empty input', () => {
  it('yields no primitives for an empty edge + fill list', () => {
    const primitives = [...classifierToPrimitives({ edges: [], pocheFills: [] })];
    expect(primitives).toHaveLength(0);
  });
});
