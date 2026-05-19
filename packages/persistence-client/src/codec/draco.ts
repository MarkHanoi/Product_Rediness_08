// codec/draco.ts — lazy WASM singleton for Google Draco mesh compression.
//
// Spec source: PHASE-1D §S19 D2 (line 390):
//   "Implement codec/draco.ts — lazy singleton pattern; encode + decode
//    with quantization config.  Unit test: round-trip Float32Array(1000
//    random positions) → encode → decode → assert max delta < 0.5 mm."
//
// Why lazy?  The Draco WASM payload is ~150 KB (decoder-only) / ~600 KB
// (encoder).  S19 D8 budget allows < 200 KB additional gzip in the
// initial bundle — we keep BOTH out of the initial bundle by deferring
// the dynamic `import()` until the first `await get()` call.  The
// editor only needs the decoder on cold-load (no encoder); the bake
// worker needs both.  Each module is fetched at most once per process
// and cached in `cached*`.
//
// API: this file exposes a CODEC FAÇADE that wraps the
// `@gltf-transform/extensions` `KHR_draco_mesh_compression` adapter.
// We do NOT expose a raw position-array codec — the only consumer in
// PRYZM is `ChunkWriter` / `ChunkReader`, both of which round-trip
// through gltf-transform anyway.  The Float32Array round-trip test
// (S19 D2) is implemented by going through a single-primitive Document.

import type { Attributes } from '@opentelemetry/api';
import { withSpan } from '../otel.js';

// --------------------------------------------------------------------
// Quantization config — frozen by S19 D5 / strategic ADR-013.
// --------------------------------------------------------------------

export interface DracoQuantization {
  /** Position bits.  14 = ~0.06 mm precision over a 100 m extent. */
  readonly position: number;
  /** Normal bits.  10 is the gltf-transform default; visually lossless. */
  readonly normal: number;
  /** UV bits. */
  readonly uv: number;
  /** Generic vertex attribute bits (e.g. tangent, colour). */
  readonly generic: number;
}

export const DRACO_DEFAULT_QUANTIZATION: DracoQuantization = Object.freeze({
  position: 14,
  normal: 10,
  uv: 12,
  generic: 12,
});

// --------------------------------------------------------------------
// Lazy singletons — one promise per kind; resolved with the loaded
// module so subsequent `await`s are zero-cost.
// --------------------------------------------------------------------

type DracoEncoderModule = unknown; // shape from `draco3dgltf` / `draco3d`
type DracoDecoderModule = unknown;

let encoderPromise: Promise<DracoEncoderModule> | null = null;
let decoderPromise: Promise<DracoDecoderModule> | null = null;

/**
 * Load the Draco ENCODER WASM (writer-side).  Resolves once per
 * process; subsequent calls return the cached promise.
 *
 * The encoder is large (~600 KB).  Used by `ChunkWriter` and the
 * S21 bake worker.  Browser bundles that never write should never
 * touch this function.
 */
export async function getDracoEncoder(): Promise<DracoEncoderModule> {
  if (encoderPromise) return encoderPromise;
  encoderPromise = withSpan(
    'pryzm.chunks.codec.draco',
    { 'pryzm.codec.kind': 'draco', 'pryzm.codec.action': 'encoder.init' },
    async () => {
      // Dynamic import keeps the WASM out of the initial bundle.
      // We try `draco3dgltf` first (smaller, gltf-transform optimised);
      // fall back to `draco3d` if not present.
      const mod = (await safeDynamicImport('draco3dgltf')) ??
                  (await safeDynamicImport('draco3d'));
      if (!mod) {
        throw new Error(
          '[draco] Neither `draco3dgltf` nor `draco3d` is installed.  ' +
            'Install via `npm i draco3dgltf` (preferred) or `npm i draco3d`.',
        );
      }
      // Some bundles export `default`, others export named factories.
      const factory =
        (mod as { createEncoderModule?: unknown }).createEncoderModule ??
        (mod as { default?: { createEncoderModule?: unknown } }).default
          ?.createEncoderModule;
      if (typeof factory !== 'function') {
        throw new Error(
          '[draco] Loaded module does not expose `createEncoderModule()`.',
        );
      }
      return await (factory as () => Promise<unknown>)();
    },
  );
  return encoderPromise;
}

/**
 * Load the Draco DECODER WASM (reader-side).  Resolves once per
 * process.  Used by `ChunkReader` on cold-load.
 */
export async function getDracoDecoder(): Promise<DracoDecoderModule> {
  if (decoderPromise) return decoderPromise;
  decoderPromise = withSpan(
    'pryzm.chunks.codec.draco',
    { 'pryzm.codec.kind': 'draco', 'pryzm.codec.action': 'decoder.init' },
    async () => {
      const mod = (await safeDynamicImport('draco3dgltf')) ??
                  (await safeDynamicImport('draco3d'));
      if (!mod) {
        throw new Error(
          '[draco] Neither `draco3dgltf` nor `draco3d` is installed.  ' +
            'Install via `npm i draco3dgltf` (preferred) or `npm i draco3d`.',
        );
      }
      const factory =
        (mod as { createDecoderModule?: unknown }).createDecoderModule ??
        (mod as { default?: { createDecoderModule?: unknown } }).default
          ?.createDecoderModule;
      if (typeof factory !== 'function') {
        throw new Error(
          '[draco] Loaded module does not expose `createDecoderModule()`.',
        );
      }
      return await (factory as () => Promise<unknown>)();
    },
  );
  return decoderPromise;
}

/**
 * Test/diagnostic hook: clear the singleton caches so a fresh import
 * is performed on the next call.  Used by codec-spike benches and
 * Phase-2 fault injection.
 */
export function __resetDracoSingletons(): void {
  encoderPromise = null;
  decoderPromise = null;
}

/** Whether the Draco WASM module is available in this runtime.  Used
 *  by `ChunkWriter`/`ChunkReader` to decide between the Draco-enabled
 *  and the uncompressed fallback path (the latter is correct but
 *  larger). */
export async function isDracoAvailable(): Promise<boolean> {
  try {
    await getDracoDecoder();
    return true;
  } catch {
    return false;
  }
}

async function safeDynamicImport(spec: string): Promise<unknown | null> {
  try {
    // The `/* @vite-ignore */` lets Vite skip the static analysis when
    // this module is bundled into the browser; in Node it is a plain
    // dynamic import and the comment is a no-op.
    return await import(/* @vite-ignore */ spec);
  } catch {
    return null;
  }
}

/**
 * Sugar helper for benches: returns OTel-friendly attribute set
 * describing a codec call's bytes-in / bytes-out so the bench harness
 * can chart the compression ratio.
 */
export function codecAttrs(
  direction: 'encode' | 'decode',
  byteLengthBefore: number,
  byteLengthAfter: number,
): Attributes {
  return {
    'pryzm.codec.direction': direction,
    'pryzm.codec.bytes.before': byteLengthBefore,
    'pryzm.codec.bytes.after': byteLengthAfter,
    'pryzm.codec.ratio': byteLengthBefore > 0
      ? byteLengthAfter / byteLengthBefore
      : 1,
  };
}
