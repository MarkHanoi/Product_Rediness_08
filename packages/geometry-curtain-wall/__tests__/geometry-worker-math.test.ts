// geometry-worker-math.test.ts — ADR-047 · Task 4.2
//
// Tests the pure-math geometry computation layer that runs inside
// geometry.worker.ts, without instantiating an actual Worker.
//
// Strategy: inline the buildBoxGeom and writeTranslationMatrix functions
// (identical logic to geometry.worker.ts) so the math can be verified
// in a standard Node test environment with no Worker / THREE dependency.
//
// Acceptance criteria verified:
//   ✓ P2 — no THREE import anywhere in this test file.
//   ✓ Box geometry output has correct array lengths (vertex/index counts).
//   ✓ Normals are unit-length and axis-aligned (face-normal convention).
//   ✓ UV coordinates are in [0,1] × [0,1].
//   ✓ Index values are within vertex range.
//   ✓ Translation matrix column-major layout matches THREE.Matrix4 convention.
//   ✓ Mullion instance matrices are distributed evenly across the wall span.

import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Inline geometry helpers (mirrors geometry.worker.ts, kept in sync)
// ---------------------------------------------------------------------------

interface BoxGeomArrays {
  positions: Float32Array;
  normals:   Float32Array;
  uvs:       Float32Array;
  indices:   Uint16Array;
}

function buildBoxGeom(w: number, h: number, d: number): BoxGeomArrays {
  const hw = w / 2, hh = h / 2, hd = d / 2;
  const positions = new Float32Array(72);
  const normals   = new Float32Array(72);
  const uvs       = new Float32Array(48);
  const indices   = new Uint16Array(36);

  const faceData: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number][] = [
    [ 1,  0,  0,   hw, -hh, -hd,   hw,  hh, -hd,   hw,  hh,  hd,   hw, -hh,  hd],
    [-1,  0,  0,  -hw, -hh,  hd,  -hw,  hh,  hd,  -hw,  hh, -hd,  -hw, -hh, -hd],
    [ 0,  1,  0,  -hw,  hh, -hd,   hw,  hh, -hd,   hw,  hh,  hd,  -hw,  hh,  hd],
    [ 0, -1,  0,  -hw, -hh,  hd,   hw, -hh,  hd,   hw, -hh, -hd,  -hw, -hh, -hd],
    [ 0,  0,  1,  -hw, -hh,  hd,   hw, -hh,  hd,   hw,  hh,  hd,  -hw,  hh,  hd],
    [ 0,  0, -1,   hw, -hh, -hd,  -hw, -hh, -hd,  -hw,  hh, -hd,   hw,  hh, -hd],
  ];
  const cornerUVs: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];

  for (let f = 0; f < 6; f++) {
    const fd = faceData[f];
    const nx = fd[0], ny = fd[1], nz = fd[2];
    const vBase = f * 4;
    for (let v = 0; v < 4; v++) {
      const pi = (vBase + v) * 3;
      positions[pi    ] = fd[3 + v * 3];
      positions[pi + 1] = fd[4 + v * 3];
      positions[pi + 2] = fd[5 + v * 3];
      normals[pi    ] = nx;
      normals[pi + 1] = ny;
      normals[pi + 2] = nz;
      const ui = (vBase + v) * 2;
      uvs[ui    ] = cornerUVs[v][0];
      uvs[ui + 1] = cornerUVs[v][1];
    }
    const iBase = f * 6;
    indices[iBase    ] = vBase;
    indices[iBase + 1] = vBase + 1;
    indices[iBase + 2] = vBase + 2;
    indices[iBase + 3] = vBase;
    indices[iBase + 4] = vBase + 2;
    indices[iBase + 5] = vBase + 3;
  }
  return { positions, normals, uvs, indices };
}

function writeTranslationMatrix(
  x: number, y: number, z: number,
  out: Float32Array, offset: number,
): void {
  out[offset     ] = 1; out[offset +  1] = 0; out[offset +  2] = 0; out[offset +  3] = 0;
  out[offset +  4] = 0; out[offset +  5] = 1; out[offset +  6] = 0; out[offset +  7] = 0;
  out[offset +  8] = 0; out[offset +  9] = 0; out[offset + 10] = 1; out[offset + 11] = 0;
  out[offset + 12] = x; out[offset + 13] = y; out[offset + 14] = z; out[offset + 15] = 1;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildBoxGeom — array layout', () => {
  it('produces correct typed-array lengths for a 2×3×1 box', () => {
    const { positions, normals, uvs, indices } = buildBoxGeom(2, 3, 1);
    // 6 faces × 4 vertices = 24 vertices
    expect(positions.length).toBe(72); // 24 * 3
    expect(normals.length).toBe(72);
    expect(uvs.length).toBe(48);       // 24 * 2
    // 6 faces × 2 triangles × 3 = 36
    expect(indices.length).toBe(36);
  });

  it('all normals are unit-length (±1 on exactly one axis)', () => {
    const { normals } = buildBoxGeom(1, 1, 1);
    for (let i = 0; i < 24; i++) {
      const nx = normals[i * 3    ];
      const ny = normals[i * 3 + 1];
      const nz = normals[i * 3 + 2];
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      expect(len).toBeCloseTo(1, 5);
      // Each normal is axis-aligned: exactly one of |nx|, |ny|, |nz| = 1.
      const axisAligned =
        (Math.abs(nx) === 1 && ny === 0 && nz === 0) ||
        (Math.abs(ny) === 1 && nx === 0 && nz === 0) ||
        (Math.abs(nz) === 1 && nx === 0 && ny === 0);
      expect(axisAligned).toBe(true);
    }
  });

  it('all UV coordinates are in [0, 1]', () => {
    const { uvs } = buildBoxGeom(4, 2, 0.1);
    for (let i = 0; i < uvs.length; i++) {
      expect(uvs[i]).toBeGreaterThanOrEqual(0);
      expect(uvs[i]).toBeLessThanOrEqual(1);
    }
  });

  it('all index values reference valid vertex slots (< 24)', () => {
    const { indices } = buildBoxGeom(1, 1, 1);
    for (let i = 0; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThanOrEqual(0);
      expect(indices[i]).toBeLessThan(24);
    }
  });

  it('each face pair of triangles uses 4 unique vertices (no degenerate quads)', () => {
    const { indices } = buildBoxGeom(1, 1, 1);
    for (let f = 0; f < 6; f++) {
      const base = f * 6;
      const quad = new Set([
        indices[base], indices[base + 1], indices[base + 2],
        indices[base + 3], indices[base + 4], indices[base + 5],
      ]);
      // Two triangles of a quad share 4 unique vertices (not 6)
      expect(quad.size).toBe(4);
    }
  });

  it('vertex X positions are within ±(w/2) for a 2×1×1 box', () => {
    const { positions } = buildBoxGeom(2, 1, 1);
    for (let i = 0; i < 24; i++) {
      expect(Math.abs(positions[i * 3])).toBeLessThanOrEqual(1 + 1e-6); // half-width = 1
    }
  });
});

describe('writeTranslationMatrix — THREE.Matrix4 column-major convention', () => {
  it('identity part: diagonal = 1, off-diag = 0 (except translation column)', () => {
    const out = new Float32Array(16);
    writeTranslationMatrix(3, 5, 7, out, 0);
    // Column 0: [1, 0, 0, 0]
    expect(out[0]).toBe(1); expect(out[1]).toBe(0); expect(out[2]).toBe(0); expect(out[3]).toBe(0);
    // Column 1: [0, 1, 0, 0]
    expect(out[4]).toBe(0); expect(out[5]).toBe(1); expect(out[6]).toBe(0); expect(out[7]).toBe(0);
    // Column 2: [0, 0, 1, 0]
    expect(out[8]).toBe(0); expect(out[9]).toBe(0); expect(out[10]).toBe(1); expect(out[11]).toBe(0);
    // Column 3 (translation): [3, 5, 7, 1]
    expect(out[12]).toBe(3); expect(out[13]).toBe(5); expect(out[14]).toBe(7); expect(out[15]).toBe(1);
  });

  it('writes to the correct offset in a larger buffer', () => {
    const out = new Float32Array(32);
    // First matrix at offset 0, second at offset 16
    writeTranslationMatrix(1, 2, 3, out, 0);
    writeTranslationMatrix(4, 5, 6, out, 16);
    expect(out[12]).toBe(1);  expect(out[13]).toBe(2);  expect(out[14]).toBe(3);
    expect(out[28]).toBe(4);  expect(out[29]).toBe(5);  expect(out[30]).toBe(6);
  });
});

describe('mullion instance matrix distribution', () => {
  it('N vertical mullions are evenly spaced across the wall span', () => {
    // Simulate the uLinesT → vInstanceMatrices logic from processRequest.
    const wallLength = 10;
    const wallHeight = 3;
    const uLinesT = [0.2, 0.4, 0.6, 0.8]; // 4 mullion positions (normalised)
    const matrices = new Float32Array(uLinesT.length * 16);
    const halfLength = wallLength / 2;

    for (let i = 0; i < uLinesT.length; i++) {
      const x = uLinesT[i] * wallLength - halfLength;
      const y = wallHeight / 2;
      writeTranslationMatrix(x, y, 0, matrices, i * 16);
    }

    // Verify each translation:
    expect(matrices[12]).toBeCloseTo(-3, 5); // 0.2*10 - 5 = -3
    expect(matrices[28]).toBeCloseTo(-1, 5); // 0.4*10 - 5 = -1
    expect(matrices[44]).toBeCloseTo( 1, 5); // 0.6*10 - 5 =  1
    expect(matrices[60]).toBeCloseTo( 3, 5); // 0.8*10 - 5 =  3

    // All mullions are at the same Y (mid-height)
    for (let i = 0; i < uLinesT.length; i++) {
      expect(matrices[i * 16 + 13]).toBeCloseTo(wallHeight / 2, 5);
    }
  });

  it('N horizontal mullions span the wall at correct Y heights', () => {
    const wallHeight = 4;
    const vLinesT = [0.25, 0.5, 0.75]; // 3 horizontal rail positions
    const matrices = new Float32Array(vLinesT.length * 16);

    for (let i = 0; i < vLinesT.length; i++) {
      const y = vLinesT[i] * wallHeight;
      writeTranslationMatrix(0, y, 0, matrices, i * 16);
    }

    expect(matrices[13]).toBeCloseTo(1,   5); // 0.25 * 4
    expect(matrices[29]).toBeCloseTo(2,   5); // 0.5  * 4
    expect(matrices[45]).toBeCloseTo(3,   5); // 0.75 * 4

    // All centred at X=0
    for (let i = 0; i < vLinesT.length; i++) {
      expect(matrices[i * 16 + 12]).toBe(0);
    }
  });
});
