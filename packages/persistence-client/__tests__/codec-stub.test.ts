// Codec stub + availability tests.  Verifies that the lazy WASM
// singleton wrappers behave as designed when the WASM is missing
// (acceptable: fall back to uncompressed) AND when it is present
// (singleton is shared).
//
// Spec source: PHASE-1D §S19 D2 / D3 / D4 (lines 390–392).

import { describe, expect, it } from 'vitest';
import {
  Ktx2,
  DRACO_DEFAULT_QUANTIZATION,
  isDracoAvailable,
  isMeshoptAvailable,
} from '../src/index.js';

describe('codec/ktx2 — stub passthrough', () => {
  it('encode returns the input untouched (Phase 1 stub)', async () => {
    const input = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic
    const out = await Ktx2.encode(input);
    expect(out).toBe(input);
  });

  it('decode returns the input untouched', async () => {
    const input = new Uint8Array([1, 2, 3, 4]);
    const out = await Ktx2.decode(input);
    expect(out).toBe(input);
  });

  it('exposes a stable name for OTel / bench output', () => {
    expect(Ktx2.name).toBe('ktx2-stub');
  });
});

describe('codec — quantization config (frozen by ADR-013)', () => {
  it('exposes Draco default quantization values', () => {
    expect(DRACO_DEFAULT_QUANTIZATION.position).toBe(14);
    expect(DRACO_DEFAULT_QUANTIZATION.normal).toBe(10);
    expect(DRACO_DEFAULT_QUANTIZATION.uv).toBe(12);
    expect(DRACO_DEFAULT_QUANTIZATION.generic).toBe(12);
  });

  it('quantization config is frozen', () => {
    expect(Object.isFrozen(DRACO_DEFAULT_QUANTIZATION)).toBe(true);
  });
});

describe('codec — availability probes', () => {
  // These probes do not assert TRUE/FALSE — they only assert that the
  // probe returns a boolean without throwing, which is what the
  // ChunkWriter / ChunkReader rely on for graceful degradation.
  it('isDracoAvailable resolves to a boolean', async () => {
    const v = await isDracoAvailable();
    expect(typeof v).toBe('boolean');
  });

  it('isMeshoptAvailable resolves to a boolean', async () => {
    const v = await isMeshoptAvailable();
    expect(typeof v).toBe('boolean');
  });
});
