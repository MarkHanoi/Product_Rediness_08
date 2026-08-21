// §PROCEDURAL-PATTERNS (L-1804) — deterministic variation.
//
// ⛔ `Math.random()` MUST NOT decide what a saved project looks like. A material is
// a NAME the project agrees on (C100 key principle); if two collaborators open the
// same project and the oak boards are shaded differently, the name no longer names
// one thing. Every stochastic value in this package therefore comes from an
// INTEGER HASH of (seed, piece index, channel) — no state, no sequence, no order
// dependence, and identical on every engine because it is pure uint32 arithmetic.
//
// ⚠ Order-independence matters more than it looks: a stateful PRNG makes the 40th
// stave's tone depend on how many staves were drawn before it, so changing the
// repeat-cell size would repaint every board. A hash does not.

/** 32-bit integer avalanche (Wang/Jenkins style). Pure, branch-free, engine-stable. */
export function hash32(a: number): number {
  let x = a | 0;
  x = (x ^ 61) ^ (x >>> 16);
  x = (x + (x << 3)) | 0;
  x = x ^ (x >>> 4);
  x = Math.imul(x, 0x27d4eb2d);
  x = x ^ (x >>> 15);
  return x >>> 0;
}

export function hash2(a: number, b: number): number {
  return hash32((hash32(a) ^ Math.imul(b | 0, 0x9e3779b1)) | 0);
}

export function hash3(a: number, b: number, c: number): number {
  return hash32((hash2(a, b) ^ Math.imul(c | 0, 0x85ebca6b)) | 0);
}

/** Uniform [0,1). */
export function rand01(a: number, b: number, c: number): number {
  return hash3(a, b, c) / 4294967296;
}

/** Uniform [-1,1). */
export function randSigned(a: number, b: number, c: number): number {
  return rand01(a, b, c) * 2 - 1;
}

const fade = (t: number): number => t * t * (3 - 2 * t);

/**
 * TOROIDAL value noise on an integer lattice of `periodX × periodY`.
 *
 * ⭐ The period argument is not decoration: noise sampled without a period is the
 * single commonest way a "seamless" procedural texture turns out not to be. The
 * lattice wraps, so the noise wraps, so the grain wraps.
 */
export function valueNoise2D(
  x: number,
  y: number,
  periodX: number,
  periodY: number,
  seed: number,
): number {
  const px = Math.max(1, Math.round(periodX));
  const py = Math.max(1, Math.round(periodY));
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const x0 = ((xi % px) + px) % px;
  const y0 = ((yi % py) + py) % py;
  const x1 = (x0 + 1) % px;
  const y1 = (y0 + 1) % py;
  const v00 = rand01(x0, y0, seed);
  const v10 = rand01(x1, y0, seed);
  const v01 = rand01(x0, y1, seed);
  const v11 = rand01(x1, y1, seed);
  const u = fade(xf);
  const v = fade(yf);
  const a = v00 + (v10 - v00) * u;
  const b = v01 + (v11 - v01) * u;
  return a + (b - a) * v;
}

/** Fractal sum of toroidal value noise. Octave periods double, so every octave wraps. */
export function fbm2D(
  x: number,
  y: number,
  periodX: number,
  periodY: number,
  seed: number,
  octaves: number,
): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const m = 1 << o;
    sum += amp * valueNoise2D(x * m, y * m, periodX * m, periodY * m, seed + o * 131);
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}
