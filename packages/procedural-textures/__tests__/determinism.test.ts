// §PROCEDURAL-PATTERNS L-1804 — DETERMINISM.
//
// ⛔ `Math.random()` must not decide what a saved project looks like. A material is
// a NAME the project agrees on (C100's key principle); if two collaborators open the
// same project and the boards are shaded differently, the name no longer names one
// thing, and a re-render of the same view no longer matches the one before it.
//
// These tests establish the property THREE ways: byte-identical output for the same
// seed, DIFFERENT output for a different seed (so the seed is actually wired and the
// variation is not a no-op), and — the arm that cannot be cheated — a source scan
// proving no non-deterministic primitive exists in the package at all.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateProceduralTexture } from '../src/generate.js';
import { PROCEDURAL_TEXTURE_SPECS } from '../src/presets.js';
import { clearProceduralCache, getProceduralTexture } from '../src/resolve.js';
import { hash3, rand01 } from '../src/core/rng.js';

const SRC = join(fileURLToPath(new URL('../src', import.meta.url)));

/**
 * Strip comments before scanning. ⚠ The first version of this test failed on its
 * OWN DOCUMENTATION — the header of `rng.ts` says the words "Math.random" in the
 * sentence explaining why it is forbidden. A scanner that cannot tell a prohibition
 * from a violation is a scanner that will be silenced rather than fixed.
 */
function stripComments(text: string): string {
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, ' ');
  return noBlock
    .split('\n')
    .map((line) => {
      const i = line.indexOf('//');
      return i >= 0 ? line.slice(0, i) : line;
    })
    .join('\n');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('the same seed produces the same floor, byte for byte', () => {
  for (const spec of PROCEDURAL_TEXTURE_SPECS.slice(0, 6)) {
    it(`${spec.id} is reproducible`, () => {
      const a = generateProceduralTexture(spec, 192);
      const b = generateProceduralTexture(spec, 192);
      expect(Array.from(b.albedo.data)).toEqual(Array.from(a.albedo.data));
      expect(Array.from(b.normal.data)).toEqual(Array.from(a.normal.data));
      expect(Array.from(b.roughness.data)).toEqual(Array.from(a.roughness.data));
    });
  }
});

describe('the seed is wired, not decorative', () => {
  it('a different seed produces a visibly different floor at the same layout', () => {
    const spec = PROCEDURAL_TEXTURE_SPECS.find((s) => s.id === 'proc:parquet-oak-herringbone');
    if (!spec) throw new Error('preset missing');
    const a = generateProceduralTexture(spec, 192);
    const b = generateProceduralTexture({ ...spec, seed: spec.seed + 1 }, 192);
    let differing = 0;
    for (let i = 0; i < a.albedo.data.length; i += 4) {
      if (a.albedo.data[i] !== b.albedo.data[i]) differing++;
    }
    expect(differing / (a.albedo.data.length / 4)).toBeGreaterThan(0.5);
    // ...but the LAYOUT is unchanged: variation is character, never geometry.
    expect(b.realWorldSizeM).toEqual(a.realWorldSizeM);
    expect(b.diagnostics.pieceCount).toBe(a.diagnostics.pieceCount);
  });

  it('the hash is order-independent: piece N does not depend on pieces 0..N-1', () => {
    // A stateful PRNG would make a stave's tone depend on how many staves preceded
    // it, so changing the repeat cell would repaint every board. A hash does not.
    const forward = [0, 1, 2, 3, 4].map((i) => rand01(7, i, 11));
    const backward = [4, 3, 2, 1, 0].map((i) => rand01(7, i, 11)).reverse();
    expect(backward).toEqual(forward);
    expect(hash3(1, 2, 3)).toBe(hash3(1, 2, 3));
  });
});

describe('the cache returns the identical object, and clearing it changes nothing visible', () => {
  it('is memoised per (id, resolution)', () => {
    clearProceduralCache();
    const first = getProceduralTexture('proc:tile-hexagon-200-white', 192);
    const second = getProceduralTexture('proc:tile-hexagon-200-white', 192);
    expect(second).toBe(first);
    clearProceduralCache();
    const third = getProceduralTexture('proc:tile-hexagon-200-white', 192);
    expect(third).not.toBe(first);
    expect(Array.from(third?.albedo.data ?? [])).toEqual(Array.from(first?.albedo.data ?? []));
  });

  it('an unknown id resolves to undefined, never to a default texture', () => {
    expect(getProceduralTexture('proc:nope')).toBeUndefined();
  });
});

describe('⛔ the source scan — the arm that cannot be satisfied by luck', () => {
  const files = walk(SRC);

  it('finds a real source tree', () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it('contains no Math.random, no Date.now, no performance.now anywhere in src/', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const text = stripComments(readFileSync(f, 'utf8'));
      for (const needle of ['Math.random', 'Date.now', 'performance.now', 'crypto.getRandomValues']) {
        if (text.includes(needle)) offenders.push(`${f}: ${needle}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('contains no THREE, no DOM and no I/O imports — this package sits at L0', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const text = stripComments(readFileSync(f, 'utf8'));
      for (const needle of ['from \'three\'', 'renderer-three', 'node:fs', 'document.', 'window.', 'createElement', 'OffscreenCanvas', 'getContext(']) {
        if (text.includes(needle)) offenders.push(`${f}: ${needle}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('imports nothing outside itself — a zero-dependency leaf', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const text = stripComments(readFileSync(f, 'utf8'));
      for (const m of text.matchAll(/from\s+'([^']+)'/g)) {
        const s = m[1] as string;
        if (!s.startsWith('.')) offenders.push(`${f}: ${s}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
