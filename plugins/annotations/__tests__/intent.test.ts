// Annotation intent helpers (S34 / ADR-0024 + post-2B closeout / ADR-0030).

import { describe, expect, it } from 'vitest';
import {
  ANNOTATION_KINDS,
  ANNOTATION_TEXT_HEIGHT_MAX_MM,
  isAnnotationKind,
  isFiniteVec3,
} from '../src/intent.js';

describe('isFiniteVec3', () => {
  it('accepts a fully finite vec3', () => {
    expect(isFiniteVec3({ x: 0, y: 0, z: 0 })).toBe(true);
    expect(isFiniteVec3({ x: -1, y: 1.5, z: 1e-10 })).toBe(true);
  });

  it('rejects null / undefined', () => {
    expect(isFiniteVec3(null)).toBe(false);
    expect(isFiniteVec3(undefined)).toBe(false);
  });

  it('rejects non-finite values', () => {
    expect(isFiniteVec3({ x: NaN, y: 0, z: 0 })).toBe(false);
    expect(isFiniteVec3({ x: 0, y: Infinity, z: 0 })).toBe(false);
    expect(isFiniteVec3({ x: 0, y: 0, z: -Infinity })).toBe(false);
  });
});

describe('isAnnotationKind / ANNOTATION_KINDS', () => {
  it('lists exactly 11 schema kinds', () => {
    expect(ANNOTATION_KINDS).toHaveLength(11);
    expect(new Set(ANNOTATION_KINDS).size).toBe(11);
  });

  it('accepts every literal in the list', () => {
    for (const k of ANNOTATION_KINDS) {
      expect(isAnnotationKind(k)).toBe(true);
    }
  });

  it('rejects non-string and unknown literals', () => {
    expect(isAnnotationKind(undefined)).toBe(false);
    expect(isAnnotationKind(0)).toBe(false);
    expect(isAnnotationKind('not-a-kind')).toBe(false);
  });
});

describe('ANNOTATION_TEXT_HEIGHT_MAX_MM', () => {
  it('matches the schema unit-confusion guard (100 mm)', () => {
    expect(ANNOTATION_TEXT_HEIGHT_MAX_MM).toBe(100);
  });
});
