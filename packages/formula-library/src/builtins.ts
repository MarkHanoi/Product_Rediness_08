/**
 * @pryzm/formula-library — built-in formulas.
 *
 * Twelve curated, frequently-needed formulas covering aggregate stats,
 * geometric primitives, and numeric utilities.  Versioned at 1.0.0;
 * any signature change BUMPS the formula's version (semver-major) and
 * ALSO pushes the catalogue's collective digest in `index.ts`.
 *
 * Why these twelve and not more: the catalogue is intentionally small.
 * Adding a formula is a permanent commitment — third-party plugins may
 * depend on it.  S66 will introduce a marketplace path for additional
 * formulas; the built-in set stays curated to what every BIM plugin
 * needs out of the box.
 */

import type { FormulaEntry, FormulaArg } from './types.js';

const VERSION = '1.0.0';

function n(arg: FormulaArg): number { return arg as number; }
function s(arg: FormulaArg): string { return arg as string; }
function arr(arg: FormulaArg): readonly number[] { return arg as readonly number[]; }

export const BUILTIN_FORMULAS: readonly FormulaEntry[] = Object.freeze([
  // ── aggregates ────────────────────────────────────────────────────
  {
    descriptor: {
      id: 'sum',
      name: 'Sum',
      description: 'Sum of an array of numbers.',
      signature: {
        params: [{ name: 'values', type: 'array<number>' }],
        returnType: 'number',
      },
      version: VERSION,
    },
    impl: (args) => {
      const xs = arr(args[0]!);
      let t = 0;
      for (const x of xs) t += x;
      return t;
    },
  },
  {
    descriptor: {
      id: 'avg',
      name: 'Average',
      description: 'Arithmetic mean of a non-empty array of numbers.',
      signature: {
        params: [{ name: 'values', type: 'array<number>' }],
        returnType: 'number',
      },
      version: VERSION,
    },
    impl: (args) => {
      const xs = arr(args[0]!);
      if (xs.length === 0) return Number.NaN;
      let t = 0;
      for (const x of xs) t += x;
      return t / xs.length;
    },
  },
  {
    descriptor: {
      id: 'min',
      name: 'Minimum',
      description: 'Smallest value in a non-empty array of numbers.',
      signature: {
        params: [{ name: 'values', type: 'array<number>' }],
        returnType: 'number',
      },
      version: VERSION,
    },
    impl: (args) => {
      const xs = arr(args[0]!);
      if (xs.length === 0) return Number.NaN;
      let m = xs[0]!;
      for (let i = 1; i < xs.length; i++) if (xs[i]! < m) m = xs[i]!;
      return m;
    },
  },
  {
    descriptor: {
      id: 'max',
      name: 'Maximum',
      description: 'Largest value in a non-empty array of numbers.',
      signature: {
        params: [{ name: 'values', type: 'array<number>' }],
        returnType: 'number',
      },
      version: VERSION,
    },
    impl: (args) => {
      const xs = arr(args[0]!);
      if (xs.length === 0) return Number.NaN;
      let m = xs[0]!;
      for (let i = 1; i < xs.length; i++) if (xs[i]! > m) m = xs[i]!;
      return m;
    },
  },
  {
    descriptor: {
      id: 'count',
      name: 'Count',
      description: 'Number of elements in an array.',
      signature: {
        params: [{ name: 'values', type: 'array<number>' }],
        returnType: 'number',
      },
      version: VERSION,
    },
    impl: (args) => arr(args[0]!).length,
  },
  // ── geometric primitives (mm units throughout — PRYZM canonical) ──
  {
    descriptor: {
      id: 'distance',
      name: 'Distance (1-D, mm)',
      description: 'Absolute distance |a − b| in millimetres.',
      signature: {
        params: [
          { name: 'a', type: 'number' },
          { name: 'b', type: 'number' },
        ],
        returnType: 'number',
      },
      version: VERSION,
    },
    impl: (args) => Math.abs(n(args[0]!) - n(args[1]!)),
  },
  {
    descriptor: {
      id: 'area-rect',
      name: 'Rectangle area (mm²)',
      description: 'Area of an axis-aligned rectangle: width × height.',
      signature: {
        params: [
          { name: 'widthMm', type: 'number' },
          { name: 'heightMm', type: 'number' },
        ],
        returnType: 'number',
      },
      version: VERSION,
    },
    impl: (args) => n(args[0]!) * n(args[1]!),
  },
  {
    descriptor: {
      id: 'perimeter-rect',
      name: 'Rectangle perimeter (mm)',
      description: 'Perimeter of an axis-aligned rectangle: 2(w + h).',
      signature: {
        params: [
          { name: 'widthMm', type: 'number' },
          { name: 'heightMm', type: 'number' },
        ],
        returnType: 'number',
      },
      version: VERSION,
    },
    impl: (args) => 2 * (n(args[0]!) + n(args[1]!)),
  },
  // ── numeric utilities ─────────────────────────────────────────────
  {
    descriptor: {
      id: 'ratio',
      name: 'Ratio',
      description: 'Numerator / denominator; throws on zero denominator (NaN guard).',
      signature: {
        params: [
          { name: 'numerator', type: 'number' },
          { name: 'denominator', type: 'number' },
        ],
        returnType: 'number',
      },
      version: VERSION,
    },
    impl: (args) => {
      const d = n(args[1]!);
      if (d === 0) return Number.NaN;
      return n(args[0]!) / d;
    },
  },
  {
    descriptor: {
      id: 'clamp',
      name: 'Clamp',
      description: 'Clamp v into [min, max]; if min > max returns min.',
      signature: {
        params: [
          { name: 'v', type: 'number' },
          { name: 'min', type: 'number' },
          { name: 'max', type: 'number' },
        ],
        returnType: 'number',
      },
      version: VERSION,
    },
    impl: (args) => {
      const v = n(args[0]!);
      const lo = n(args[1]!);
      const hi = n(args[2]!);
      if (lo > hi) return lo;
      return Math.max(lo, Math.min(hi, v));
    },
  },
  {
    descriptor: {
      id: 'lerp',
      name: 'Linear interpolation',
      description: 'Linearly interpolate from a → b at t ∈ [0,1] (no clamp on t).',
      signature: {
        params: [
          { name: 'a', type: 'number' },
          { name: 'b', type: 'number' },
          { name: 't', type: 'number' },
        ],
        returnType: 'number',
      },
      version: VERSION,
    },
    impl: (args) => {
      const a = n(args[0]!);
      const b = n(args[1]!);
      const t = n(args[2]!);
      return a + (b - a) * t;
    },
  },
  {
    descriptor: {
      id: 'round',
      name: 'Round to N digits',
      description: 'Round v to `digits` decimal places using bankers rounding to nearest-even.',
      signature: {
        params: [
          { name: 'v', type: 'number' },
          { name: 'digits', type: 'number' },
        ],
        returnType: 'number',
      },
      version: VERSION,
    },
    impl: (args) => {
      const v = n(args[0]!);
      const d = Math.max(0, Math.floor(n(args[1]!)));
      const f = Math.pow(10, d);
      // standard half-away-from-zero rounding for stability
      return Math.round(v * f) / f;
    },
  },
] satisfies FormulaEntry[]);

// Touch the unused `s` helper to keep tree-shakers happy and to leave
// a hook for string-returning formulas added at S66.
void s;
