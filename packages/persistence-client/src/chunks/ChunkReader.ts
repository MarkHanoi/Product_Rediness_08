/// <reference lib="dom" />
// chunks/ChunkReader.ts — `.glb` chunk bytes → element geometry IRs.
//
// Spec source: PHASE-1D §S19 D6 (line 394) — "Implement
// `packages/persistence-client/chunks/ChunkReader.ts` in parallel"
// + S19 D7 (line 395) — wires into the editor load path.
//
// The reader is the cold-load critical path — every cold reload of a
// project parses a chunk per visible level and hydrates the scene.
// Performance-critical pieces:
//   * Decode is lazy on the codec (Draco / Meshopt WASM is fetched
//     ONCE per process via the singleton in `codec/draco.ts`).
//   * The reader yields kernel-shaped descriptors with element ID
//     attached — the committer rebuilds `THREE.BufferGeometry`
//     attributes from those typed arrays without copy.

import { Document, NodeIO, WebIO } from '@gltf-transform/core';
import { withSpan } from '../otel.js';
import { getDracoDecoder } from '../codec/draco.js';
import { getMeshoptDecoder } from '../codec/meshopt.js';

export interface ChunkReadDescriptor {
  /** The element ID embedded by `ChunkWriter` in primitive `extras`. */
  readonly sourceId: string;
  readonly position: Float32Array;
  readonly normal: Float32Array;
  readonly uv: Float32Array;
  readonly index: Uint16Array | Uint32Array;
  readonly materialId: string | null;
  readonly geometryHash: string | null;
}

export interface ChunkReadInput {
  readonly bytes: Uint8Array;
  readonly projectId: string;
  readonly levelId: string;
  /** Expected SHA-256 hex.  When provided, the reader asserts the
   *  bytes hash to this value (defends against IndexedDB / R2
   *  corruption).  Pass `null` to skip verification. */
  readonly expectedHash: string | null;
}

export interface ChunkReadResult {
  readonly descriptors: readonly ChunkReadDescriptor[];
  /** SHA-256 hex of the input bytes.  Equal to `expectedHash` when
   *  the verification passed. */
  readonly hash: string;
}

export class ChunkReader {
  constructor(private readonly opts: { runtime?: 'auto' | 'browser' | 'node' } = {}) {}

  async read(input: ChunkReadInput): Promise<ChunkReadResult> {
    return withSpan(
      'pryzm.chunks.read',
      {
        'pryzm.chunks.projectId': input.projectId,
        'pryzm.chunks.levelId': input.levelId,
        'pryzm.chunks.byteLength': input.bytes.byteLength,
      },
      async () => {
        const hash = await sha256Hex(input.bytes);
        if (input.expectedHash !== null && input.expectedHash !== hash) {
          throw new ChunkHashMismatchError(input.expectedHash, hash);
        }

        const io = await this.createIO();
        const doc = await io.readBinary(input.bytes);

        // Meshopt's `meshopt()` transform — and any author-side
        // `KHR_mesh_quantization` use — leaves position / normal /
        // texcoord accessors as int16 / int8 with a normalize +
        // scale recipe.  Apply the inverse transform so callers
        // always see plain Float32Array data in original units.
        try {
          const { dequantize } = (await import('@gltf-transform/functions')) as {
            dequantize: () => unknown;
          };
          await (doc as unknown as { transform: (...t: unknown[]) => Promise<void> }).transform(
            dequantize(),
          );
        } catch {
          // gltf-transform/functions missing — non-quantized round-trips
          // still work, only the meshopt-compressed path returns raw
          // ints.  Tests assert this is unreachable in CI.
        }

        const descriptors: ChunkReadDescriptor[] = [];
        // Walk the scene graph via NODES (not via Root.listMeshes()) so
        // we can apply the parent node's world matrix to positions.
        // Meshopt's `meshopt()` transform quantizes positions into a
        // [-1, 1] int16 range and bakes the original-space mapping
        // into the mesh node's TRS — without applying that matrix,
        // decoded positions are off by orders of magnitude.
        const scenes = doc.getRoot().listScenes();
        const visit = (node: ReturnType<typeof doc.createNode>, parentMatrix: number[]): void => {
          const local = (node as unknown as { getMatrix?: () => number[] }).getMatrix?.()
            ?? IDENTITY_MATRIX;
          const world = multiplyMatrices(parentMatrix, local);
          const mesh = (node as unknown as { getMesh?: () => unknown }).getMesh?.() as
            | { listPrimitives: () => unknown[] }
            | null
            | undefined;
          if (mesh) {
            for (const prim of mesh.listPrimitives() as Array<{
              getExtras: () => unknown;
              getAttribute: (s: string) => { getArray: () => unknown } | null;
              getIndices: () => { getArray: () => unknown } | null;
            }>) {
              const extras = (prim.getExtras() as Record<string, unknown>) ?? {};
              const sourceId = typeof extras.sourceId === 'string' ? extras.sourceId : '';
              if (!sourceId) continue; // tolerate third-party primitives
              const positionRaw = prim.getAttribute('POSITION')?.getArray();
              const normalRaw = prim.getAttribute('NORMAL')?.getArray();
              const uvRaw = prim.getAttribute('TEXCOORD_0')?.getArray();
              const indexArr = prim.getIndices()?.getArray();

              const positionFloat =
                positionRaw instanceof Float32Array
                  ? positionRaw
                  : positionRaw
                    ? new Float32Array(positionRaw as ArrayLike<number>)
                    : new Float32Array();
              const normalFloat =
                normalRaw instanceof Float32Array
                  ? normalRaw
                  : normalRaw
                    ? new Float32Array(normalRaw as ArrayLike<number>)
                    : new Float32Array();
              const uvFloat =
                uvRaw instanceof Float32Array
                  ? uvRaw
                  : uvRaw
                    ? new Float32Array(uvRaw as ArrayLike<number>)
                    : new Float32Array();

              const index: Uint16Array | Uint32Array =
                indexArr instanceof Uint32Array
                  ? indexArr
                  : indexArr instanceof Uint16Array
                    ? indexArr
                    : new Uint16Array((indexArr as ArrayLike<number> | undefined) ?? []);

              descriptors.push({
                sourceId,
                position: applyMatrixToPositions(positionFloat, world),
                normal: applyMatrixToNormals(normalFloat, world),
                uv: uvFloat,
                index,
                materialId: typeof extras.materialId === 'string' ? extras.materialId : null,
                geometryHash: typeof extras.geometryHash === 'string' ? extras.geometryHash : null,
              });
            }
          }
          for (const child of (node as unknown as { listChildren: () => unknown[] }).listChildren()) {
            visit(child as never, world);
          }
        };
        for (const scene of scenes) {
          for (const root of scene.listChildren()) {
            visit(root as never, IDENTITY_MATRIX);
          }
        }

        return { descriptors, hash };
      },
    );
  }

  // ------------------------------------------------------------------

  private async createIO(): Promise<NodeIO | WebIO> {
    const runtime = this.opts.runtime ?? 'auto';
    const isNode =
      runtime === 'node' ||
      (runtime === 'auto' &&
        typeof (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node === 'string');
    const io: NodeIO | WebIO = isNode ? new NodeIO() : new WebIO();
    try {
      const ext = (await import('@gltf-transform/extensions')) as Record<string, unknown>;
      const KhrDraco = ext.KHRDracoMeshCompression as new (d: Document) => unknown;
      const ExtMeshopt = ext.EXTMeshoptCompression as new (d: Document) => unknown;
      const KhrQuant = ext.KHRMeshQuantization as new (d: Document) => unknown;
      const exts: unknown[] = [];
      if (KhrDraco) exts.push(KhrDraco);
      if (ExtMeshopt) exts.push(ExtMeshopt);
      if (KhrQuant) exts.push(KhrQuant);
      if (exts.length > 0) {
        (io as unknown as { registerExtensions: (e: unknown[]) => void }).registerExtensions(exts);
      }
      // Wire decoder modules so reading compressed primitives works.
      try {
        const decoder = await getDracoDecoder();
        (io as unknown as { registerDependencies: (d: Record<string, unknown>) => void })
          .registerDependencies({ 'draco3d.decoder': decoder });
      } catch { /* draco unavailable — uncompressed reads still work */ }
      try {
        const decoder = await getMeshoptDecoder();
        (io as unknown as { registerDependencies: (d: Record<string, unknown>) => void })
          .registerDependencies({ 'meshopt.decoder': decoder });
      } catch { /* meshopt unavailable — uncompressed reads still work */ }
    } catch {
      // extensions package missing — uncompressed reads still work.
    }
    return io;
  }
}

export class ChunkHashMismatchError extends Error {
  constructor(public readonly expected: string, public readonly actual: string) {
    super(
      `[ChunkReader] hash mismatch — expected ${expected.slice(0, 12)}…, ` +
        `got ${actual.slice(0, 12)}…`,
    );
    this.name = 'ChunkHashMismatchError';
  }
}

// --------------------------------------------------------------------
// Minimal mat4 helpers — column-major, GLM convention (matches
// gltf-transform's `node.getMatrix()`).
// --------------------------------------------------------------------

const IDENTITY_MATRIX: number[] = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

function multiplyMatrices(a: number[], b: number[]): number[] {
  const out = new Array<number>(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let v = 0;
      for (let k = 0; k < 4; k++) {
        v += a[k * 4 + r]! * b[c * 4 + k]!;
      }
      out[c * 4 + r] = v;
    }
  }
  return out;
}

function applyMatrixToPositions(positions: Float32Array, m: number[]): Float32Array {
  if (m === IDENTITY_MATRIX) return positions;
  const isIdentity = m.every((v, i) => v === IDENTITY_MATRIX[i]);
  if (isIdentity) return positions;
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!, y = positions[i + 1]!, z = positions[i + 2]!;
    out[i]     = m[0]! * x + m[4]! * y + m[8]!  * z + m[12]!;
    out[i + 1] = m[1]! * x + m[5]! * y + m[9]!  * z + m[13]!;
    out[i + 2] = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
  }
  return out;
}

function applyMatrixToNormals(normals: Float32Array, m: number[]): Float32Array {
  // Normals only need the upper-left 3x3 (no translation).  For the
  // quantize-then-meshopt pipeline this matrix is a uniform scale +
  // translate, so renormalising is sufficient.
  if (m === IDENTITY_MATRIX) return normals;
  const isIdentity = m.every((v, i) => v === IDENTITY_MATRIX[i]);
  if (isIdentity) return normals;
  const out = new Float32Array(normals.length);
  for (let i = 0; i < normals.length; i += 3) {
    const x = normals[i]!, y = normals[i + 1]!, z = normals[i + 2]!;
    let nx = m[0]! * x + m[4]! * y + m[8]!  * z;
    let ny = m[1]! * x + m[5]! * y + m[9]!  * z;
    let nz = m[2]! * x + m[6]! * y + m[10]! * z;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    out[i] = nx; out[i + 1] = ny; out[i + 2] = nz;
  }
  return out;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) {
    throw new Error(
      '[ChunkReader] globalThis.crypto.subtle is not available — Node 20+ or a modern browser is required.',
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
