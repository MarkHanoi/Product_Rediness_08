// codec/ktx2.ts — STUB.  Spec source: PHASE-1D §S19 D4 (line 392).
//
//   "Implement codec/ktx2.ts — stub only (returns input PNG unchanged;
//    real encoding in Phase 2).  Stub is necessary now so the
//    ChunkWriter pipeline doesn't hardcode the absence of KTX2."
//
// The stub preserves the API surface so a Phase 2 PR can swap in a
// real `basis_universal` WASM encoder without changing any caller.
// Until that point, textures travel through the chunk pipeline as
// raw PNG / JPEG bytes.

export interface Ktx2Codec {
  /** Stable identifier — appears in OTel + bench output. */
  readonly name: string;
  /**
   * Encode a PNG / JPEG image to KTX2.  STUB: returns the input
   * bytes unchanged so the ChunkWriter pipeline behaves as if KTX2
   * were a no-op transform.  TODO Phase 2: enable KTX2 encoding via
   * `basis_universal` WASM (`@kainos/basis-encoder` or `@gltf-transform/extensions`'s
   * `KHR_texture_basisu` adapter).
   */
  encode(input: Uint8Array, opts?: Ktx2EncodeOptions): Promise<Uint8Array>;
  /** Decode KTX2 back to RGBA pixels.  STUB: returns input unchanged. */
  decode(bytes: Uint8Array): Promise<Uint8Array>;
}

export interface Ktx2EncodeOptions {
  /** Target the UASTC ETC1S codec when `quality: 'low'`; UASTC LDR
   *  when `quality: 'high'`.  Ignored by the stub. */
  readonly quality?: 'low' | 'high';
}

export const Ktx2: Ktx2Codec = {
  name: 'ktx2-stub',
  async encode(input: Uint8Array): Promise<Uint8Array> {
    // Pass-through.  See file header — real encoding is Phase 2.
    return input;
  },
  async decode(bytes: Uint8Array): Promise<Uint8Array> {
    return bytes;
  },
};
