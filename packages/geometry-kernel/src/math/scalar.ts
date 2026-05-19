// Pure scalar utilities used across the kernel.
//
// All functions here are deterministic and platform-independent
// (no JIT / FP-mode-dependent intrinsics) so the K1-B byte-equality
// gate (Node ≡ browser) holds.

/** Clamp `v` into `[lo, hi]` (assumes `lo ≤ hi`). */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** True if |a − b| ≤ eps. */
export function approxEq(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

/**
 * Canonicalise zeroes — `−0` is replaced by `+0`.  Float32 round-trips
 * through worker `postMessage` MUST produce the same bit pattern in
 * Node and the browser; the safest way to enforce this is to scrub
 * negative zeros at the typed-array boundary.
 */
export function canonZero(v: number): number {
  return v === 0 ? 0 : v;
}

/** Truncate a float to four decimal places (matches PRYZM 1's hash precision). */
export function pin4(v: number): number {
  if (!Number.isFinite(v)) return 0;
  // Round-half-away-from-zero is the JS default for `toFixed`; we re-
  // parse to avoid carrying a string around.
  return Number(v.toFixed(4));
}
