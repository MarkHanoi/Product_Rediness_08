// `assertValidDescriptor` invariants — S08-T5 (5 dedicated tests +
// happy path, per spec line 683).

import { describe, expect, it } from 'vitest';
import {
  assertValidDescriptor,
  DescriptorInvariantError,
} from '../src/types/assertValidDescriptor.js';
import type { BufferGeometryDescriptor } from '../src/types/BufferGeometryDescriptor.js';
import { asMaterialKey } from '../src/types/MaterialKey.js';

function validDescriptor(): BufferGeometryDescriptor {
  // Single triangle on the +Y plane.
  return {
    position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]),
    normal: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
    uv: new Float32Array([0, 0, 1, 0, 0, 1]),
    index: new Uint16Array([0, 1, 2]),
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 0, z: 1 } },
    groups: [{ start: 0, count: 3, materialIndex: 0 }],
    materialKeys: [asMaterialKey('test|mat')],
    hash: 'h:1',
  };
}

describe('assertValidDescriptor', () => {
  it('accepts a valid descriptor', () => {
    expect(() => assertValidDescriptor(validDescriptor())).not.toThrow();
  });

  it('rejects NaN in position', () => {
    const d = validDescriptor();
    (d.position as Float32Array)[0] = NaN;
    expect(() => assertValidDescriptor(d)).toThrow(DescriptorInvariantError);
  });

  it('rejects non-unit normal', () => {
    const d = validDescriptor();
    (d.normal as Float32Array)[0] = 2;
    (d.normal as Float32Array)[1] = 2;
    expect(() => assertValidDescriptor(d)).toThrow(DescriptorInvariantError);
  });

  it('rejects index out of range', () => {
    const d = validDescriptor();
    (d.index as Uint16Array)[1] = 99;
    expect(() => assertValidDescriptor(d)).toThrow(/out of range/);
  });

  it('rejects sum(groups[i].count) ≠ index.length', () => {
    const d = {
      ...validDescriptor(),
      groups: [{ start: 0, count: 6, materialIndex: 0 }],
    };
    expect(() => assertValidDescriptor(d)).toThrow(DescriptorInvariantError);
  });

  it('rejects bounds.min > bounds.max', () => {
    const d = {
      ...validDescriptor(),
      bounds: { min: { x: 5, y: 0, z: 0 }, max: { x: 1, y: 0, z: 1 } },
    };
    expect(() => assertValidDescriptor(d)).toThrow(/min\.x.*max\.x/);
  });
});
