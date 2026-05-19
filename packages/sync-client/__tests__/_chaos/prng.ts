// packages/sync-client/__tests__/_chaos/prng.ts — W-04.
//
// Seeded mulberry32 PRNG so the chaos harness is deterministic.  Per
// W-04 §"convergence" the test must be reproducible from the same seed
// — that's how a CI failure can be replayed locally without flakes.

export interface SeededRng {
  /** Returns a float in [0, 1). */
  next(): number;
  /** Returns an integer in [min, max). */
  nextInt(min: number, max: number): number;
  /** Returns one of `arr` uniformly at random.  Throws on empty input. */
  pick<T>(arr: readonly T[]): T;
  /** Returns a fresh ULID-ish 26-char string deterministic in the seed. */
  newId(prefix?: string): string;
  /** Snapshot of the current internal state — useful for failure reproduction. */
  state(): number;
}

export function mulberry32(seed: number): SeededRng {
  let s = seed >>> 0;
  let counter = 0;
  const next = (): number => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    nextInt(min, max) {
      if (max <= min) throw new Error(`mulberry32.nextInt: max (${max}) must exceed min (${min})`);
      return Math.floor(next() * (max - min)) + min;
    },
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error('mulberry32.pick: cannot pick from empty array');
      return arr[Math.floor(next() * arr.length)]!;
    },
    newId(prefix = 'E'): string {
      counter += 1;
      // Deterministic — seed + counter-based hex string padded to 26 chars.
      const hex = (s ^ counter).toString(16).padStart(8, '0').toUpperCase();
      return `${prefix}_${hex}_${counter.toString(36).padStart(6, '0').toUpperCase()}`.slice(0, 26).padEnd(26, '0');
    },
    state: () => s,
  };
}
