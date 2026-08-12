/**
 * §C73-EPSILON-POLICY — the declared tolerance module (C73 §2.1–§2.3).
 *
 * These tests pin the CONTRACT of the module, not arithmetic trivia:
 *   1. the three roles exist, are unit-qualified by name, and carry the
 *      canonised values — a silent WIDENING here is the E4 defect (§2.5), so
 *      the values are asserted with `<=` against their canon: shrinking is a
 *      legitimate (argued) change and only widening must fail this file;
 *   2. every helper uses strict `<` — a magnitude exactly AT the tolerance is
 *      NOT "the same" (documented direction; both sides of each boundary are
 *      probed);
 *   3. the module is reachable from the package barrel — a policy nobody can
 *      import is not declared (gate arm E1 checks exports; this checks the
 *      import path consumers will actually use).
 */
import { describe, expect, it } from 'vitest';

import {
  EPSILON_ZERO,
  COINCIDENT_M,
  PARALLEL_RAD,
  isNumericallyZero,
  isCoincidentDistanceM,
  arePointsCoincident2D,
  isParallel,
} from '../src/index.js';

describe('C73 §2.1 — the three declared roles', () => {
  it('numeric-zero is dimensionless 1e-9 (canon: the TIGHTER of the two live conventions) — may shrink, must never widen', () => {
    expect(EPSILON_ZERO).toBeGreaterThan(0);
    expect(EPSILON_ZERO).toBeLessThanOrEqual(1e-9);
  });

  it('model-space coincidence is 0.001 m (the modal metre-valued identity tolerance) — may shrink, must never widen', () => {
    expect(COINCIDENT_M).toBeGreaterThan(0);
    expect(COINCIDENT_M).toBeLessThanOrEqual(0.001);
  });

  it('parallelism is 1e-9 rad (the kernel miter code’s live convention) — may shrink, must never widen', () => {
    expect(PARALLEL_RAD).toBeGreaterThan(0);
    expect(PARALLEL_RAD).toBeLessThanOrEqual(1e-9);
  });
});

describe('helpers use strict < — AT the tolerance is NOT "the same"', () => {
  it('isNumericallyZero: below fires, at does not, above does not, sign is ignored', () => {
    expect(isNumericallyZero(0)).toBe(true);
    expect(isNumericallyZero(EPSILON_ZERO / 2)).toBe(true);
    expect(isNumericallyZero(-EPSILON_ZERO / 2)).toBe(true);
    expect(isNumericallyZero(EPSILON_ZERO)).toBe(false);
    expect(isNumericallyZero(EPSILON_ZERO * 2)).toBe(false);
  });

  it('isCoincidentDistanceM: below fires, at does not, sign is ignored', () => {
    expect(isCoincidentDistanceM(0)).toBe(true);
    expect(isCoincidentDistanceM(COINCIDENT_M * 0.999)).toBe(true);
    expect(isCoincidentDistanceM(-COINCIDENT_M * 0.999)).toBe(true);
    expect(isCoincidentDistanceM(COINCIDENT_M)).toBe(false);
    expect(isCoincidentDistanceM(COINCIDENT_M * 1.001)).toBe(false);
  });

  it('arePointsCoincident2D: squared-distance comparison agrees with the scalar helper on both sides of the boundary', () => {
    // Same point, exactly.
    expect(arePointsCoincident2D(3.25, -7.5, 3.25, -7.5)).toBe(true);
    // Separation just inside 1 mm, on a diagonal (exercises the squared form).
    const inside = (COINCIDENT_M * 0.999) / Math.SQRT2;
    expect(arePointsCoincident2D(0, 0, inside, inside)).toBe(true);
    // Separation exactly AT the tolerance: NOT coincident (strict <).
    expect(arePointsCoincident2D(0, 0, COINCIDENT_M, 0)).toBe(false);
    // Just outside.
    const outside = (COINCIDENT_M * 1.001) / Math.SQRT2;
    expect(arePointsCoincident2D(0, 0, outside, outside)).toBe(false);
  });

  it('isParallel: below fires, at does not, sign is ignored', () => {
    expect(isParallel(0)).toBe(true);
    expect(isParallel(PARALLEL_RAD / 2)).toBe(true);
    expect(isParallel(-PARALLEL_RAD / 2)).toBe(true);
    expect(isParallel(PARALLEL_RAD)).toBe(false);
    expect(isParallel(1e-6)).toBe(false); // the looser live convention must NOT read as parallel here
  });
});

describe('the roles separate cleanly (a value zero under one role is not "the same" under another)', () => {
  it('a 1e-6 magnitude: NOT numerically zero (canon tightened past the looser live convention), but IS a coincident distance in metres', () => {
    expect(isNumericallyZero(1e-6)).toBe(false);
    expect(isCoincidentDistanceM(1e-6)).toBe(true);
  });
});
