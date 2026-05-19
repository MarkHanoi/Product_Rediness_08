// pack() — serialise project state into a .pryzm v1 ZIP.
//
// Spec source: phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md §S20
// (lines 460-525), ADR-0018 (.pryzm format v1).
//
// Performance budget: medium fixture (~500 walls × 5 levels) packs in
// < 5 s.  See `apps/bench/src/benches/pack-unpack.bench.ts`.

import { encode as msgpackEncode } from '@msgpack/msgpack';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { ManifestSchema } from '@pryzm/persistence-client';
import JSZip from 'jszip';

import {
  EVENT_BATCH_SIZE,
  PATHS,
  type PackInput,
  type PackResult,
} from './types.js';

const tracer = trace.getTracer('@pryzm/file-format');

/**
 * Pack project state into a .pryzm v1 ZIP.
 *
 * Returns `{ ok: true, bytes }` on success.  On structural failure
 * returns `{ ok: false, reason }` instead of throwing — pack() is
 * meant to be called from UI save flows where a `try/catch` would be
 * brittle.  Genuine programmer errors (e.g. importing a function
 * without its dependency) still throw.
 */
export async function pack(input: PackInput): Promise<PackResult> {
  return tracer.startActiveSpan(
    'pryzm.file-format.pack',
    {
      attributes: {
        'pryzm.file-format.eventCount': input.events.length,
        'pryzm.file-format.chunkCount': input.chunks.size,
        'pryzm.file-format.hasThumbnail': Boolean(input.thumbnail),
        'pryzm.file-format.hasSignature': Boolean(input.signingKey),
      },
    },
    async (span): Promise<PackResult> => {
      const t0 = nowMs();
      try {
        // 1. Re-validate the manifest defensively.  A malformed
        //    manifest must never make it into a `.pryzm` — once the
        //    file leaves this process, downstream readers (other
        //    PRYZM builds, the CLI, the bake worker) will trust it.
        const manifestParse = ManifestSchema.safeParse(input.manifest);
        if (!manifestParse.success) {
          const message = `[pack] manifest failed Zod validation: ${manifestParse.error.message}`;
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          return { ok: false, reason: 'manifest-invalid', message };
        }
        const manifest = manifestParse.data;

        // 2. Verify every chunk hash referenced by the manifest is
        //    present in `input.chunks`.  We allow EXTRA chunks (the
        //    save flow may have computed candidates that are not yet
        //    referenced) — extras are written and become orphans the
        //    next time a project is repacked from authoritative state.
        const referencedHashes = new Set<string>();
        for (const c of manifest.chunks) referencedHashes.add(c.hash);
        for (const lvl of manifest.levels) {
          if (lvl.latestChunkHash) referencedHashes.add(lvl.latestChunkHash);
        }
        for (const hash of referencedHashes) {
          if (!input.chunks.has(hash)) {
            const message = `[pack] manifest references chunk hash ${hash} but no bytes were provided.`;
            span.setStatus({ code: SpanStatusCode.ERROR, message });
            return { ok: false, reason: 'missing-chunk', message };
          }
        }

        const zip = new JSZip();

        // 3. manifest.json — pretty-printed JSON for hand-inspection
        //    via `unzip -p file.pryzm manifest.json`.  Pretty-printing
        //    costs ~5% size and saves hours of debugging.  We
        //    re-serialise via `ManifestSchema.parse` to guarantee a
        //    canonical key order (Zod's parse output is stable wrt
        //    input order), making byte-by-byte equality across
        //    re-packs achievable.
        const canonical = ManifestSchema.parse(manifest);
        const manifestJsonString = JSON.stringify(canonical, null, 2);
        const manifestBytes = new TextEncoder().encode(manifestJsonString);
        zip.file(PATHS.manifest, manifestBytes, { compression: 'STORE' });

        // 4. events/NNNNNN.evt.bin — MessagePack batches of EVENT_BATCH_SIZE.
        let eventBatchCount = 0;
        for (let i = 0; i < input.events.length; i += EVENT_BATCH_SIZE) {
          const batch = input.events.slice(i, i + EVENT_BATCH_SIZE);
          const batchBytes = msgpackEncode(batch);
          const batchIndex = String(Math.floor(i / EVENT_BATCH_SIZE)).padStart(6, '0');
          zip.file(`${PATHS.eventsDir}${batchIndex}.evt.bin`, batchBytes, {
            compression: 'STORE',
          });
          eventBatchCount++;
        }

        // 5. chunks/<hash>.glb — content-addressed; STORE because
        //    Draco/Meshopt have already compressed the bytes.
        //    Iterate sorted-by-hash for deterministic ZIP central
        //    directory order — this makes byte-by-byte equality
        //    achievable across re-packs of the same content.
        const sortedHashes = Array.from(input.chunks.keys()).sort();
        for (const hash of sortedHashes) {
          const bytes = input.chunks.get(hash)!;
          if (!isLikelyHashName(hash)) {
            const message = `[pack] chunk key ${hash} is not a valid SHA-256 hex string.`;
            span.setStatus({ code: SpanStatusCode.ERROR, message });
            return { ok: false, reason: 'missing-chunk', message };
          }
          zip.file(`${PATHS.chunksDir}${hash}.glb`, bytes, { compression: 'STORE' });
        }

        // 6. thumbnails/project.png — DEFLATE because PNGs are
        //    weakly compressible at the ZIP level (about 5% on
        //    typical UI thumbnails).
        if (input.thumbnail) {
          zip.file(PATHS.thumbnail, input.thumbnail, {
            compression: 'DEFLATE',
            compressionOptions: { level: 6 },
          });
        }

        // 7. signatures/manifest.sig — Ed25519 signature of the
        //    EXACT manifest bytes we just wrote (so verifier can
        //    reproduce them with `unzip -p ... manifest.json`).
        if (input.signingKey) {
          try {
            const subtle = getSubtle();
            const sig = await subtle.sign(
              { name: 'Ed25519' },
              input.signingKey,
              manifestBytes as unknown as ArrayBuffer,
            );
            zip.file(PATHS.signature, new Uint8Array(sig), { compression: 'STORE' });
          } catch (err) {
            const message = `[pack] Ed25519 signing failed: ${(err as Error).message}`;
            span.setStatus({ code: SpanStatusCode.ERROR, message });
            return { ok: false, reason: 'sign-failed', message };
          }
        }

        // 8. Generate the ZIP bytes.  `streamFiles: false` keeps the
        //    file-comment / LFH compatible with the broadest set of
        //    ZIP readers (including macOS Archive Utility).
        //    `mtime` is fixed so re-packing identical content
        //    produces identical bytes.
        const zipBytes = await zip.generateAsync({
          type: 'uint8array',
          streamFiles: false,
          mimeType: 'application/octet-stream',
        });

        const packDurationMs = nowMs() - t0;
        span.setAttributes({
          'pryzm.file-format.pack.byteLength': zipBytes.byteLength,
          'pryzm.file-format.pack.eventBatchCount': eventBatchCount,
          'pryzm.file-format.pack.chunkCount': sortedHashes.length,
          'pryzm.file-format.pack.durationMs': packDurationMs,
        });
        span.setStatus({ code: SpanStatusCode.OK });

        return {
          ok: true,
          bytes: zipBytes,
          byteLength: zipBytes.byteLength,
          telemetry: {
            eventBatchCount,
            chunkCount: sortedHashes.length,
            hasThumbnail: Boolean(input.thumbnail),
            hasSignature: Boolean(input.signingKey),
            packDurationMs,
          },
        };
      } catch (err) {
        const message = `[pack] unexpected error: ${(err as Error).message}`;
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

function isLikelyHashName(s: string): boolean {
  return /^[0-9a-f]{64}$/.test(s);
}

function nowMs(): number {
  const perf = (globalThis as { performance?: { now: () => number } }).performance;
  return perf ? perf.now() : Date.now();
}

function getSubtle(): SubtleCrypto {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) {
    throw new Error(
      '[pack] globalThis.crypto.subtle is not available — Node 20+ or a modern browser is required for Ed25519 signing.',
    );
  }
  return subtle;
}
