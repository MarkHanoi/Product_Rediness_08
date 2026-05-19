// codec/meshopt.ts — lazy WASM singleton for meshoptimizer.
//
// Spec source: PHASE-1D §S19 D3 (line 391):
//   "Implement codec/meshopt.ts — encode with reorder + quantize;
//    decode with fast WASM decoder.  Unit test: Meshopt + Draco
//    round-trip; compare total compressed size vs Draco-only (target:
//    Meshopt adds ≥ 10% additional savings)."
//
// Like `draco.ts`, this is a lazy singleton.  The Meshopt WASM is
// ~200 KB (encoder + decoder bundled in one module).  Initial bundle
// stays clean — encoder/decoder are only fetched when the
// `ChunkWriter` / `ChunkReader` first runs through the Meshopt
// transform.
//
// gltf-transform 4.x's `EXT_meshopt_compression` extension consumes
// `MeshoptDecoder` / `MeshoptEncoder` instances directly; we expose
// thin wrappers so consumers don't have to know which npm package
// provided the WASM.

import type { Attributes } from '@opentelemetry/api';
import { withSpan } from '../otel.js';

type MeshoptModule = unknown; // `meshoptimizer` exposes encoder + decoder

let modulePromise: Promise<MeshoptModule> | null = null;

/**
 * Load the meshoptimizer WASM module.  Resolves once per process.
 * The module exposes both `MeshoptEncoder` and `MeshoptDecoder`; the
 * `ChunkWriter` calls through the encoder, the `ChunkReader` through
 * the decoder, both via the gltf-transform `EXT_meshopt_compression`
 * adapter.
 */
export async function getMeshopt(): Promise<MeshoptModule> {
  if (modulePromise) return modulePromise;
  modulePromise = withSpan(
    'pryzm.chunks.codec.meshopt',
    { 'pryzm.codec.kind': 'meshopt', 'pryzm.codec.action': 'init' },
    async () => {
      const mod = await safeDynamicImport('meshoptimizer');
      if (!mod) {
        throw new Error(
          '[meshopt] `meshoptimizer` is not installed.  ' +
            'Install via `npm i meshoptimizer`.',
        );
      }
      // The npm package exports `{ MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier }`
      // either as named exports or under `default`.  Normalise.
      const m = mod as Record<string, unknown> & { default?: Record<string, unknown> };
      const decoder = m.MeshoptDecoder ?? m.default?.MeshoptDecoder;
      const encoder = m.MeshoptEncoder ?? m.default?.MeshoptEncoder;
      if (!decoder || !encoder) {
        throw new Error(
          '[meshopt] Loaded module does not expose MeshoptDecoder + MeshoptEncoder.',
        );
      }
      // Both the encoder and decoder expose a `.ready` Promise that
      // resolves once their internal WASM is initialised.  Await it
      // so the caller can use them synchronously.
      await Promise.all([
        (decoder as { ready?: Promise<unknown> }).ready,
        (encoder as { ready?: Promise<unknown> }).ready,
      ]);
      return { encoder, decoder };
    },
  );
  return modulePromise;
}

/**
 * Convenience: returns just the decoder (lighter cold-path for
 * read-only consumers).  Resolves to the SAME singleton instance.
 */
export async function getMeshoptDecoder(): Promise<unknown> {
  const m = (await getMeshopt()) as { decoder: unknown };
  return m.decoder;
}

/** As above, encoder side. */
export async function getMeshoptEncoder(): Promise<unknown> {
  const m = (await getMeshopt()) as { encoder: unknown };
  return m.encoder;
}

export function __resetMeshoptSingleton(): void {
  modulePromise = null;
}

export async function isMeshoptAvailable(): Promise<boolean> {
  try {
    await getMeshopt();
    return true;
  } catch {
    return false;
  }
}

async function safeDynamicImport(spec: string): Promise<unknown | null> {
  try {
    return await import(/* @vite-ignore */ spec);
  } catch {
    return null;
  }
}

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
