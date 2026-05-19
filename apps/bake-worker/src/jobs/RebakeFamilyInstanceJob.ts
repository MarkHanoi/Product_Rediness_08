// apps/bake-worker/jobs/RebakeFamilyInstanceJob.ts — bake one family-instance
// placement event into a content-addressed chunk.
//
// Spec source: `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §19.5 D3.
//
// Pipeline:
//   1. Load the family from `familyBytes` via `@pryzm/family-loader`
//      (cache hit short-circuits the unpack + Zod cost).
//   2. Bake the instance via `@pryzm/family-instance`.
//   3. Write each baked descriptor as a content-addressed chunk
//      (sha256 of the descriptor positions + indices).
//   4. Upload via the storage driver, mint a signed URL, and return.
//
// The job is intentionally narrow — it does NOT yet hydrate previous
// state or perform delta encoding.  The S22 sync server is the
// producer side and will start emitting `family.instance.placed`
// events after S56 D4 lands.

import { performance } from 'node:perf_hooks';
import { trace, SpanStatusCode } from '@opentelemetry/api';

import type { StorageDriver } from '@pryzm/storage-driver';
import { loadFamilyFromBytes, defaultFamilyCache, type FamilyCache } from '@pryzm/family-loader';
import { bakeFamilyInstance, type BakedSolid } from '@pryzm/family-instance';
import type { BufferGeometryDescriptor } from '@pryzm/geometry-kernel';

const tracer = trace.getTracer('@pryzm/bake-worker');

export interface FamilyInstanceJobData {
  readonly projectId: string;
  readonly levelId: string;
  /** ULID of the placement event. */
  readonly instanceId: string;
  /** Raw `.pryzm-family` bytes — fetched by the sync server from the
   *  storage driver and pinned for the lifetime of the bake job. */
  readonly familyBytes: Uint8Array;
  /** Selected family-type id. */
  readonly typeId: string;
  /** Per-instance overrides keyed by parameter id. */
  readonly instanceOverrides?: Readonly<Record<string, number | string | boolean>>;
}

export interface FamilyInstanceJobResult {
  readonly instanceId: string;
  readonly chunks: readonly {
    readonly solidId: string;
    readonly chunkHash: string;
    readonly byteLength: number;
    readonly signedUrl: string;
  }[];
  readonly cacheHit: boolean;
  readonly durationMs: number;
}

export interface RebakeFamilyInstanceJobDeps {
  readonly storage: StorageDriver;
  /** Optional family-loader cache override.  Production uses the
   *  default process cache so multiple jobs in the same worker share
   *  parsed families. */
  readonly familyCache?: FamilyCache;
  /** Signed URL TTL in seconds.  Default 3600 (1h). */
  readonly signedUrlTtlSec?: number;
}

const DEFAULT_TTL_SEC = 3600;

export async function processFamilyInstanceJob(
  data: FamilyInstanceJobData,
  deps: RebakeFamilyInstanceJobDeps,
): Promise<FamilyInstanceJobResult> {
  return tracer.startActiveSpan(
    'pryzm.bake.familyInstance',
    {
      attributes: {
        'pryzm.bake.projectId': data.projectId,
        'pryzm.bake.levelId': data.levelId,
        'pryzm.bake.instanceId': data.instanceId,
        'pryzm.bake.typeId': data.typeId,
      },
    },
    async (span): Promise<FamilyInstanceJobResult> => {
      const t0 = performance.now();
      try {
        const cache = deps.familyCache ?? defaultFamilyCache;

        // 1. Load the family.  `loadFamilyFromBytes` returns a cached
        //    instance when the (familyId, schemaHash) matches.
        const loaded = await loadFamilyFromBytes(data.familyBytes, { cache });
        if (!loaded.ok) {
          const message = `[familyInstance] loadFamily failed: ${loaded.reason} — ${loaded.message}`;
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          throw new Error(message);
        }

        // 2. Bake the instance.
        const bake = await bakeFamilyInstance({
          family: {
            manifest: loaded.family.manifest,
            document: loaded.family.document,
            schemaHash: loaded.family.schemaHash,
          },
          typeId: data.typeId,
          instanceOverrides: data.instanceOverrides,
        });
        if (!bake.ok) {
          const message = `[familyInstance] bake produced no descriptors (${bake.unsupported.length} unsupported solid(s))`;
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          throw new Error(message);
        }

        // 3. Hash + 4. upload + 5. sign each baked solid.
        const ttl = deps.signedUrlTtlSec ?? DEFAULT_TTL_SEC;
        const chunks: FamilyInstanceJobResult['chunks'][number][] = [];
        for (const baked of bake.baked) {
          const bytes = encodeDescriptor(baked.descriptor);
          const chunkHash = await sha256Hex(bytes);
          // The storage driver is content-addressed by hash — no prefix
          // injection.  Family-instance metadata (familyId, schemaHash,
          // solidId) is recorded on the OTel span and on the job result;
          // we deliberately do NOT smuggle it through the storage key
          // because the InMemory + R2 drivers treat the key as opaque.
          await deps.storage.put(chunkHash, bytes);
          const signedUrl = await deps.storage.getSignedUrl(chunkHash, ttl);
          chunks.push({
            solidId: baked.solidId,
            chunkHash,
            byteLength: bytes.byteLength,
            signedUrl,
          });
        }

        const durationMs = performance.now() - t0;
        span.setAttributes({
          'family.bake.cacheHit': loaded.cacheHit,
          'family.bake.bakedCount': bake.baked.length,
          'family.bake.unsupportedCount': bake.unsupported.length,
          'family.bake.durationMs': durationMs,
        });
        span.setStatus({ code: SpanStatusCode.OK });
        return {
          instanceId: data.instanceId,
          chunks,
          cacheHit: loaded.cacheHit,
          durationMs,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: msg });
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

/**
 * Deterministic byte encoding of a BufferGeometryDescriptor for content
 * addressing.  We deliberately do not use `ChunkWriter` here — the
 * existing writer is bound to the project-format chunk schema; the
 * family-instance bake produces one descriptor per solid and the
 * S57 work re-evaluates whether to merge them.  The encoding is a
 * trivial little-endian Float32 + Uint32 pair, which is sufficient for
 * SHA-256 content addressing in v1.
 *
 * Layout:
 *   [u32 vertexCount][u32 indexCount][f32×3 positions...][u32 indices...]
 */
function encodeDescriptor(d: BufferGeometryDescriptor): Uint8Array {
  const positions = d.position;
  const indices = d.index;
  const vertexCount = positions.length / 3;
  const indexCount = indices.length;
  const headerBytes = 8;
  const positionBytes = positions.length * 4;
  const indexBytes = indices.length * 4;
  const buf = new ArrayBuffer(headerBytes + positionBytes + indexBytes);
  const view = new DataView(buf);
  view.setUint32(0, vertexCount, true);
  view.setUint32(4, indexCount, true);
  let off = headerBytes;
  for (let i = 0; i < positions.length; i++) {
    view.setFloat32(off, positions[i]!, true);
    off += 4;
  }
  for (let i = 0; i < indices.length; i++) {
    view.setUint32(off, indices[i]!, true);
    off += 4;
  }
  return new Uint8Array(buf);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('[familyInstance] WebCrypto SubtleCrypto unavailable in this runtime.');
  }
  const buf = await subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  const view = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < view.length; i++) {
    out += view[i].toString(16).padStart(2, '0');
  }
  return out;
}
