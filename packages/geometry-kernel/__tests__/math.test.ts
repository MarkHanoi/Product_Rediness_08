// Math primitive tests (T002 acceptance).

import { describe, expect, it } from 'vitest';
import * as v3 from '../src/math/vec3.js';
import * as m4 from '../src/math/mat4.js';
import { clamp, approxEq, canonZero, pin4 } from '../src/math/scalar.js';

describe('scalar', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
  it('approxEq', () => {
    expect(approxEq(0.1 + 0.2, 0.3)).toBe(true);
    expect(approxEq(1, 2)).toBe(false);
  });
  it('canonZero kills negative zero', () => {
    expect(Object.is(canonZero(-0), 0)).toBe(true);
    expect(Object.is(canonZero(-0), -0)).toBe(false);
  });
  it('pin4 truncates to 4 dp', () => {
    expect(pin4(1.23456789)).toBe(1.2346);
    expect(pin4(NaN)).toBe(0);
  });
});

describe('vec3', () => {
  it('add / sub / scale / dot / cross / length / normalize', () => {
    const a: v3.Vec3 = [1, 2, 3];
    const b: v3.Vec3 = [4, 5, 6];
    const out: v3.Vec3 = [0, 0, 0];

    expect(v3.add(out, a, b)).toEqual([5, 7, 9]);
    expect(v3.sub(out, b, a)).toEqual([3, 3, 3]);
    expect(v3.scale(out, a, 2)).toEqual([2, 4, 6]);
    expect(v3.dot(a, b)).toBe(32);
    expect(v3.cross(out, a, b)).toEqual([-3, 6, -3]);

    const len = v3.length([3, 4, 0]);
    expect(approxEq(len, 5)).toBe(true);

    v3.normalize(out, [3, 4, 0]);
    expect(approxEq(v3.length(out), 1)).toBe(true);
  });

  it('outwardXZ rotates +90° in XZ', () => {
    const out: v3.Vec3 = [0, 0, 0];
    v3.outwardXZ(out, [1, 0, 0]);
    expect(approxEq(out[0], 0)).toBe(true);
    expect(out[1]).toBe(0);
    expect(approxEq(out[2], 1)).toBe(true);
    v3.outwardXZ(out, [0, 0, 1]);
    expect(approxEq(out[0], -1)).toBe(true);
    expect(approxEq(out[2], 0)).toBe(true);
  });
});

describe('mat4', () => {
  it('identity is the identity for translation × point', () => {
    const id = m4.identity();
    const p: [number, number, number] = [0, 0, 0];
    m4.applyToPoint(p, id, 1, 2, 3);
    expect(p).toEqual([1, 2, 3]);
  });

  it('translation × point shifts the point', () => {
    const t = m4.fromTranslation(m4.identity(), 10, 20, 30);
    const p: [number, number, number] = [0, 0, 0];
    m4.applyToPoint(p, t, 1, 2, 3);
    expect(p).toEqual([11, 22, 33]);
  });

  it('rotationY 90° rotates +X to −Z (gl-matrix convention)', () => {
    const r = m4.fromRotationY(m4.identity(), Math.PI / 2);
    const p: [number, number, number] = [0, 0, 0];
    m4.applyToPoint(p, r, 1, 0, 0);
    expect(approxEq(p[0], 0)).toBe(true);
    expect(approxEq(p[2], -1)).toBe(true);
  });

  it('multiply composes (translate then rotateY-90° on origin → −Z)', () => {
    const t = m4.fromTranslation(m4.identity(), 1, 0, 0);
    const r = m4.fromRotationY(m4.identity(), Math.PI / 2);
    const out = m4.identity();
    m4.multiply(out, r, t);
    const p: [number, number, number] = [0, 0, 0];
    m4.applyToPoint(p, out, 0, 0, 0);
    expect(approxEq(p[0], 0)).toBe(true);
    expect(approxEq(p[2], -1)).toBe(true);
  });
});
