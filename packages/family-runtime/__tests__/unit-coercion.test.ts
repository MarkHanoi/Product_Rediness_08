import { describe, expect, it } from 'vitest';

import { kindOf, toCanonical } from '../src/expression/unit-coercion.js';

describe('unit-coercion', () => {
  it('returns identity for unit-less literals', () => {
    expect(toCanonical(7, null)).toBe(7);
  });

  it('treats mm as canonical', () => {
    expect(toCanonical(800, 'mm')).toBe(800);
  });

  it('converts m → mm by ×1000', () => {
    expect(toCanonical(0.5, 'm')).toBe(500);
    expect(toCanonical(2, 'm')).toBe(2000);
  });

  it('converts deg → rad', () => {
    expect(toCanonical(180, 'deg')).toBeCloseTo(Math.PI, 10);
    expect(toCanonical(90, 'deg')).toBeCloseTo(Math.PI / 2, 10);
  });

  it('treats rad as canonical', () => {
    expect(toCanonical(Math.PI, 'rad')).toBe(Math.PI);
  });

  it('classifies the canonical kind', () => {
    expect(kindOf(null)).toBe('scalar');
    expect(kindOf('mm')).toBe('length');
    expect(kindOf('m')).toBe('length');
    expect(kindOf('deg')).toBe('angle');
    expect(kindOf('rad')).toBe('angle');
  });
});
