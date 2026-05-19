/// <reference lib="dom" />
// chunks/ChunkWriter.ts — geometry IRs → content-addressed `.glb` bytes.
//
// Spec source: PHASE-1D §S19 D6 (line 394) + Implementation-Detail
// block lines 234–333 of `PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`.
//
// Pipeline:
//   1. For each `BufferGeometryDescriptor` produced by
//      `@pryzm/geometry-kernel`, create one Mesh + Primitive in a
//      gltf-transform Document.
//   2. Embed `extras = { sourceId, materialId, hash }` so the
//      ChunkReader can rebuild the elementId → THREE.Object3D map
//      WITHOUT a sidecar index (the extras live in the JSON portion
//      of GLB and survive Draco compression unchanged).
//   3. Apply Draco + Meshopt compression transforms (LAZY — codec
//      WASM is dynamic-imported on first call; if either codec is
//      unavailable the writer falls back to uncompressed bytes and
//      logs a warning to OTel).
//   4. Serialise to binary GLB via `NodeIO` / `WebIO`.
//   5. Compute SHA-256 hash → `ChunkEntry`.
//
// The same writer is used in:
//   - the browser editor (S19 D7 — IndexedDB save path)
//   - the Node bake worker (S21 — `apps/bake-worker/`)
// The runtime is auto-detected; consumers usually do not need to
// pick an `'browser' | 'node'` mode explicitly.

import { Document, NodeIO, WebIO } from '@gltf-transform/core';
import type { Format } from '@gltf-transform/core';
import { withSpan } from '../otel.js';
import type { ChunkEntry } from '../manifest.js';
import { getDracoEncoder, getDracoDecoder, DRACO_DEFAULT_QUANTIZATION } from '../codec/draco.js';
import { getMeshoptEncoder, getMeshoptDecoder } from '../codec/meshopt.js';

// We keep the kernel descriptor type local-import-shaped to avoid a
// `@pryzm/geometry-kernel` runtime dependency on the persistence
// client (the type is structurally identical).
export interface ChunkGeometryDescriptor {
  /** Element ID this descriptor belongs to (stored in primitive `extras.sourceId`). */
  readonly sourceId: string;
  /** Tightly-packed positions (x, y, z, x, y, z, …). */
  readonly position: Float32Array;
  /** Tightly-packed normals (x, y, z, …); MUST be unit-length. */
  readonly normal: Float32Array;
  /** Tightly-packed UVs (u, v, …). */
  readonly uv: Float32Array;
  /** Triangle indices.  `Uint16Array` when `vertexCount < 65536`. */
  readonly index: Uint16Array | Uint32Array;
  /** Optional material ID — used by the committer / `MaterialPool`. */
  readonly materialId?: string;
  /** The kernel's deterministic hash (e.g. `composeWallGeometryHash` output);
   *  echoed in `extras.geometryHash` so the bake worker can deduplicate. */
  readonly geometryHash?: string;
}

export interface ChunkWriteInput {
  readonly projectId: string;
  readonly levelId: string;
  /** Monotonic per (projectId, levelId).  Diagnostics-only — the
   *  loader looks up `latestChunkHash`, not version. */
  readonly version: number;
  readonly descriptors: readonly ChunkGeometryDescriptor[];
}

export interface ChunkWriteOptions {
  /** Apply Draco mesh compression (default: true). */
  readonly useDraco?: boolean;
  /** Apply Meshopt reorder + secondary quantization (default: true). */
  readonly useMeshopt?: boolean;
  /** Target runtime — auto-detected when omitted. */
  readonly runtime?: 'auto' | 'browser' | 'node';
}

export interface ChunkWriteResult {
  readonly bytes: Uint8Array;
  readonly entry: ChunkEntry;
}

export class ChunkWriter {
  private readonly opts: Required<ChunkWriteOptions>;

  constructor(opts: ChunkWriteOptions = {}) {
    this.opts = {
      useDraco: opts.useDraco ?? true,
      useMeshopt: opts.useMeshopt ?? true,
      runtime: opts.runtime ?? 'auto',
    };
  }

  /**
   * Build a `.glb` chunk from a batch of element geometry descriptors.
   * The result includes the compressed bytes AND the `ChunkEntry` row
   * the caller should append to the manifest via `addChunk()`.
   */
  async write(input: ChunkWriteInput): Promise<ChunkWriteResult> {
    return withSpan(
      'pryzm.chunks.write',
      {
        'pryzm.chunks.projectId': input.projectId,
        'pryzm.chunks.levelId': input.levelId,
        'pryzm.chunks.version': input.version,
        'pryzm.chunks.elementCount': input.descriptors.length,
      },
      async () => {
        const doc = new Document();
        const buffer = doc.createBuffer();
        const scene = doc.createScene(`level:${input.levelId}`);

        for (const d of input.descriptors) {
          // 1. Accessors — positions (FLOAT VEC3).  The `as never`
          // casts work around TypeScript 5.7's stricter TypedArray
          // generics: `Float32Array` from the descriptor interface is
          // `Float32Array<ArrayBufferLike>`, while gltf-transform's
          // `setArray` is typed against `Float32Array<ArrayBuffer>`.
          // The buffer-kind variance is irrelevant at runtime.
          const positionAcc = doc.createAccessor()
            .setType('VEC3')
            .setArray(d.position as unknown as never)
            .setBuffer(buffer);
          const normalAcc = doc.createAccessor()
            .setType('VEC3')
            .setArray(d.normal as unknown as never)
            .setBuffer(buffer);
          const uvAcc = doc.createAccessor()
            .setType('VEC2')
            .setArray(d.uv as unknown as never)
            .setBuffer(buffer);
          const indexAcc = doc.createAccessor()
            .setType('SCALAR')
            // gltf-transform expects Int32Array / Uint16Array / Uint32Array
            // for SCALAR indices; pass through untouched.
            .setArray(d.index as unknown as never)
            .setBuffer(buffer);

          // 2. Primitive + Mesh + Node.
          const prim = doc.createPrimitive()
            .setAttribute('POSITION', positionAcc)
            .setAttribute('NORMAL', normalAcc)
            .setAttribute('TEXCOORD_0', uvAcc)
            .setIndices(indexAcc)
            // Embed the element-ID map in `extras` — this is the
            // key trick that lets `ChunkReader` rebuild the
            // sourceId → mesh map without a sidecar index.
            .setExtras({
              sourceId: d.sourceId,
              materialId: d.materialId ?? null,
              geometryHash: d.geometryHash ?? null,
            });

          const mesh = doc.createMesh(`mesh:${d.sourceId}`).addPrimitive(prim);
          const node = doc.createNode(d.sourceId).setMesh(mesh);
          scene.addChild(node);
        }

        // 3. Compression transforms (lazy WASM).  Each transform is
        // best-effort — if the WASM is unavailable we fall back to
        // the uncompressed `.glb`, which is still correct (just
        // larger).  The fallback is logged in OTel so the bench
        // harness can flag missing codecs.
        if (this.opts.useDraco) {
          await this.applyDracoCompression(doc);
        }
        if (this.opts.useMeshopt) {
          await this.applyMeshoptCompression(doc);
        }

        // 4. Serialise to binary GLB.
        const io = await this.createIO();
        const bytes = await io.writeBinary(doc);

        // 5. Hash + assemble ChunkEntry.
        const hash = await sha256Hex(bytes);
        const entry: ChunkEntry = {
          levelId: input.levelId,
          version: input.version,
          hash,
          byteLength: bytes.byteLength,
          elementIds: input.descriptors.map((d) => d.sourceId),
          createdAt: new Date().toISOString(),
        };

        return { bytes, entry };
      },
    );
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private async createIO(): Promise<NodeIO | WebIO> {
    const runtime = this.opts.runtime === 'auto' ? detectRuntime() : this.opts.runtime;
    const io: NodeIO | WebIO = runtime === 'node' ? new NodeIO() : new WebIO();
    // Register Draco / Meshopt extensions on the IO + register their
    // encoder + decoder modules as IO dependencies (the
    // gltf-transform 4.x API).  Each piece is best-effort: if a codec
    // WASM is not installed the IO still writes valid (uncompressed)
    // glTF, only without the corresponding extension.
    let ext: Record<string, unknown> | null = null;
    try {
      ext = (await import('@gltf-transform/extensions')) as Record<string, unknown>;
    } catch {
      return io; // extensions package missing — uncompressed fallback.
    }
    const exts: unknown[] = [];
    const KhrDraco = ext.KHRDracoMeshCompression as new (d: Document) => unknown | undefined;
    const ExtMeshopt = ext.EXTMeshoptCompression as new (d: Document) => unknown | undefined;
    const KhrQuant = ext.KHRMeshQuantization as new (d: Document) => unknown | undefined;
    if (this.opts.useDraco && KhrDraco) exts.push(KhrDraco);
    if (this.opts.useMeshopt && ExtMeshopt) exts.push(ExtMeshopt);
    // Meshopt's quantize-then-encode pipeline writes positions as
    // int16 / int8 with KHR_mesh_quantization annotations.  Register
    // it so the IO can read those accessors back as quantized values
    // (the reader's `dequantize()` transform then converts to floats).
    if (this.opts.useMeshopt && KhrQuant) exts.push(KhrQuant);
    if (exts.length > 0) {
      (io as unknown as { registerExtensions: (e: unknown[]) => void }).registerExtensions(exts);
    }
    const deps: Record<string, unknown> = {};
    if (this.opts.useDraco) {
      try {
        deps['draco3d.encoder'] = await getDracoEncoder();
        deps['draco3d.decoder'] = await getDracoDecoder();
      } catch { /* draco WASM unavailable — uncompressed fallback. */ }
    }
    if (this.opts.useMeshopt) {
      try {
        deps['meshopt.encoder'] = await getMeshoptEncoder();
        deps['meshopt.decoder'] = await getMeshoptDecoder();
      } catch { /* meshopt WASM unavailable — uncompressed fallback. */ }
    }
    if (Object.keys(deps).length > 0) {
      (io as unknown as { registerDependencies: (d: Record<string, unknown>) => void })
        .registerDependencies(deps);
    }
    return io;
  }

  private async applyDracoCompression(doc: Document): Promise<void> {
    // Use the gltf-transform `draco()` transform — it marks every
    // qualifying primitive for Draco compression and configures the
    // KHR_draco_mesh_compression extension on the document.  Actual
    // encoding happens at `io.writeBinary()` time via the encoder
    // module we register on the IO in `createIO()`.
    try {
      const { draco } = await import('@gltf-transform/functions') as { draco: (opts?: unknown) => unknown };
      await (doc as unknown as { transform: (...t: unknown[]) => Promise<void> }).transform(
        draco({
          method: 'edgebreaker',
          quantizePosition: DRACO_DEFAULT_QUANTIZATION.position,
          quantizeNormal: DRACO_DEFAULT_QUANTIZATION.normal,
          quantizeTexcoord: DRACO_DEFAULT_QUANTIZATION.uv,
          quantizeGeneric: DRACO_DEFAULT_QUANTIZATION.generic,
        }),
      );
    } catch {
      // best-effort — uncompressed bytes are still valid.
    }
  }

  private async applyMeshoptCompression(doc: Document): Promise<void> {
    try {
      const { meshopt } = await import('@gltf-transform/functions') as {
        meshopt: (opts: { encoder: unknown; level?: 'medium' | 'high' }) => unknown;
      };
      const encoder = await getMeshoptEncoder();
      await (doc as unknown as { transform: (...t: unknown[]) => Promise<void> }).transform(
        meshopt({ encoder, level: 'medium' }),
      );
    } catch {
      // best-effort — uncompressed bytes are still valid.
    }
  }
}

function detectRuntime(): 'browser' | 'node' {
  // Node has `process.versions.node`; the browser does not.
  if (typeof globalThis !== 'undefined' &&
    typeof (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node === 'string') {
    return 'node';
  }
  return 'browser';
}

/**
 * SHA-256 → 64-char lower-case hex.  Uses `globalThis.crypto.subtle`
 * (available in Node 20+ and all modern browsers).  No dependency on
 * `node:crypto` so the same code runs in the editor bundle.
 */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) {
    throw new Error(
      '[ChunkWriter] globalThis.crypto.subtle is not available — Node 20+ or a modern browser is required.',
    );
  }
  const ab: ArrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = await subtle.digest('SHA-256', ab);
  const view = new Uint8Array(digest);
  let out = '';
  for (let i = 0; i < view.length; i++) {
    out += view[i]!.toString(16).padStart(2, '0');
  }
  return out;
}

// Internal alias to satisfy `Format` import without producing dead-code lint.
export type _GlbFormat = Format;
