// unpack() — parse and validate a .pryzm v1 ZIP into project state.
//
// Spec source: phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md §S20.
//
// Performance budget: medium fixture unpacks in < 3 s.  See
// `apps/bench/src/benches/pack-unpack.bench.ts`.

import { decode as msgpackDecode } from '@msgpack/msgpack';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import {
  ManifestSchema,
  type PersistedEvent,
} from '@pryzm/persistence-client';
import JSZip from 'jszip';

import {
  migrate,
  FutureVersionError,
  MigrationStubError,
} from './migrations/index.js';
import {
  PATHS,
  type UnpackInput,
  type UnpackResult,
} from './types.js';

const tracer = trace.getTracer('@pryzm/file-format');

/**
 * Unpack a .pryzm v1 ZIP into typed project state.
 *
 * Returns `{ ok: true, manifest, events, chunks, ... }` on success,
 * `{ ok: false, reason }` on user-recoverable failure (corrupt ZIP,
 * future version, signature mismatch, ...).  Programmer errors still
 * throw.
 */
export async function unpack(input: UnpackInput): Promise<UnpackResult> {
  return tracer.startActiveSpan(
    'pryzm.file-format.unpack',
    {
      attributes: {
        'pryzm.file-format.unpack.byteLength': input.bytes.byteLength,
        'pryzm.file-format.unpack.hasVerifyingKey': Boolean(input.verifyingKey),
      },
    },
    async (span): Promise<UnpackResult> => {
      const t0 = nowMs();
      try {
        // 1. Parse the ZIP envelope.  JSZip throws on a corrupt ZIP.
        let zip: JSZip;
        try {
          zip = await JSZip.loadAsync(input.bytes);
        } catch (err) {
          const message = `[unpack] not a valid ZIP: ${(err as Error).message}`;
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          return { ok: false, reason: 'not-a-zip', message };
        }

        // 2. Read manifest.json.
        const manifestEntry = zip.file(PATHS.manifest);
        if (!manifestEntry) {
          const message = `[unpack] missing required entry ${PATHS.manifest}`;
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          return { ok: false, reason: 'missing-manifest', message };
        }
        const manifestBytes = await manifestEntry.async('uint8array');
        const manifestText = new TextDecoder().decode(manifestBytes);
        let rawManifest: unknown;
        try {
          rawManifest = JSON.parse(manifestText);
        } catch (err) {
          const message = `[unpack] manifest.json is not valid JSON: ${(err as Error).message}`;
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          return { ok: false, reason: 'manifest-parse-error', message };
        }

        // 3. Migration pass.  Throws FutureVersionError or MigrationStubError on failure.
        let migrated: { manifest: unknown; zip: JSZip; migratedFromVersion: number | null };
        try {
          const m = await migrate(rawManifest, zip);
          migrated = { manifest: m.manifest, zip: m.zip, migratedFromVersion: m.migratedFromVersion };
        } catch (err) {
          if (err instanceof FutureVersionError) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
            return {
              ok: false,
              reason: 'unsupported-future-version',
              message: err.message,
            };
          }
          if (err instanceof MigrationStubError) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
            return {
              ok: false,
              reason: 'migration-failed',
              message: err.message,
            };
          }
          const message = `[unpack] migration failed: ${(err as Error).message}`;
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          return { ok: false, reason: 'migration-failed', message };
        }
        zip = migrated.zip;

        // 4. Zod-validate the migrated manifest.
        const parsed = ManifestSchema.safeParse(migrated.manifest);
        if (!parsed.success) {
          const message = `[unpack] manifest failed Zod validation: ${parsed.error.message}`;
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          return { ok: false, reason: 'manifest-invalid', message };
        }
        const manifest = parsed.data;

        // 5. Optional signature verification.  We re-serialise the
        //    migrated-and-validated manifest with the same
        //    pretty-printer pack() uses; signature is bound to the
        //    bytes pack() actually wrote.  When the file was already
        //    at the current schema version, we can avoid the
        //    re-serialise round-trip and verify against the bytes
        //    we read from disk — preserves the bind even if
        //    `parseManifest` performed any field reordering.
        const sigEntry = zip.file(PATHS.signature);
        const hasSignature = Boolean(sigEntry);
        let signatureVerified = false;
        if (input.verifyingKey) {
          if (!sigEntry) {
            const message = `[unpack] verifyingKey provided but ${PATHS.signature} is missing.`;
            span.setStatus({ code: SpanStatusCode.ERROR, message });
            return { ok: false, reason: 'signature-required', message };
          }
          // Bind to the on-disk bytes for the no-migration case (most
          // common); for migrated files we cannot recover the
          // pre-migration bytes here, so signature verification on
          // migrated files is intentionally not supported in v1.
          if (migrated.migratedFromVersion !== null) {
            const message =
              '[unpack] signature verification is not supported on migrated files in v1.';
            span.setStatus({ code: SpanStatusCode.ERROR, message });
            return { ok: false, reason: 'signature-mismatch', message };
          }
          const sigBytes = await sigEntry.async('uint8array');
          try {
            const subtle = getSubtle();
            const ok = await subtle.verify(
              { name: 'Ed25519' },
              input.verifyingKey,
              sigBytes as unknown as ArrayBuffer,
              manifestBytes as unknown as ArrayBuffer,
            );
            if (!ok) {
              const message = '[unpack] Ed25519 signature did not verify against manifest.json bytes.';
              span.setStatus({ code: SpanStatusCode.ERROR, message });
              return { ok: false, reason: 'signature-mismatch', message };
            }
            signatureVerified = true;
          } catch (err) {
            const message = `[unpack] Ed25519 verification failed: ${(err as Error).message}`;
            span.setStatus({ code: SpanStatusCode.ERROR, message });
            return { ok: false, reason: 'signature-mismatch', message };
          }
        }

        // 6. Read events/NNNNNN.evt.bin in numeric order.
        const eventsBatchEntries = collectSortedBatchEntries(zip);
        const events: PersistedEvent[] = [];
        for (const entry of eventsBatchEntries) {
          const batchBytes = await entry.async('uint8array');
          let batch: unknown;
          try {
            batch = msgpackDecode(batchBytes);
          } catch (err) {
            const message = `[unpack] event batch ${entry.name} failed to decode: ${(err as Error).message}`;
            span.setStatus({ code: SpanStatusCode.ERROR, message });
            return { ok: false, reason: 'event-batch-decode-error', message };
          }
          if (!Array.isArray(batch)) {
            const message = `[unpack] event batch ${entry.name} is not an array (got ${typeof batch}).`;
            span.setStatus({ code: SpanStatusCode.ERROR, message });
            return { ok: false, reason: 'event-batch-decode-error', message };
          }
          for (const ev of batch) {
            events.push(ev as PersistedEvent);
          }
        }

        // 7. Read chunks/<hash>.glb.  Verify filename is a 64-char
        //    SHA-256 hex string; we deliberately do NOT recompute
        //    the hash here (the bake pipeline owns content
        //    integrity — recomputing every hash on every open would
        //    cost ~50 ms / 100 MB of chunks for no proportional
        //    win).  ChunkReader's hash check downstream is the
        //    canonical guard.
        const chunks = new Map<string, Uint8Array>();
        const chunkPaths: string[] = [];
        zip.folder(PATHS.chunksDir.replace(/\/$/, ''))?.forEach((relativePath) => {
          chunkPaths.push(relativePath);
        });
        for (const rel of chunkPaths) {
          if (!rel.endsWith('.glb')) continue;
          const hash = rel.slice(0, -'.glb'.length);
          if (!isLikelyHashName(hash)) {
            const message = `[unpack] chunk filename ${rel} is not a valid SHA-256 hex string.`;
            span.setStatus({ code: SpanStatusCode.ERROR, message });
            return { ok: false, reason: 'chunk-name-invalid', message };
          }
          const entry = zip.file(`${PATHS.chunksDir}${rel}`);
          if (!entry) continue;
          const bytes = await entry.async('uint8array');
          chunks.set(hash, bytes);
        }

        // 8. Optional thumbnail.
        const thumbEntry = zip.file(PATHS.thumbnail);
        const thumbnail = thumbEntry ? await thumbEntry.async('uint8array') : undefined;

        const unpackDurationMs = nowMs() - t0;
        span.setAttributes({
          'pryzm.file-format.unpack.eventCount': events.length,
          'pryzm.file-format.unpack.chunkCount': chunks.size,
          'pryzm.file-format.unpack.hasThumbnail': Boolean(thumbnail),
          'pryzm.file-format.unpack.hasSignature': hasSignature,
          'pryzm.file-format.unpack.signatureVerified': signatureVerified,
          'pryzm.file-format.unpack.migratedFromVersion':
            migrated.migratedFromVersion ?? -1,
          'pryzm.file-format.unpack.durationMs': unpackDurationMs,
        });
        span.setStatus({ code: SpanStatusCode.OK });

        return {
          ok: true,
          manifest,
          events,
          chunks,
          thumbnail,
          hasSignature,
          signatureVerified,
          telemetry: {
            eventCount: events.length,
            chunkCount: chunks.size,
            hasThumbnail: Boolean(thumbnail),
            hasSignature,
            signatureVerified,
            migratedFromVersion: migrated.migratedFromVersion,
            unpackDurationMs,
          },
        };
      } catch (err) {
        const message = `[unpack] unexpected error: ${(err as Error).message}`;
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

function collectSortedBatchEntries(zip: JSZip): Array<{ name: string; async: (t: 'uint8array') => Promise<Uint8Array> }> {
  const out: Array<{ name: string; async: (t: 'uint8array') => Promise<Uint8Array> }> = [];
  const folder = zip.folder(PATHS.eventsDir.replace(/\/$/, ''));
  folder?.forEach((relativePath, file) => {
    if (file.dir) return;
    if (!/^\d{6}\.evt\.bin$/.test(relativePath)) return;
    out.push({
      name: `${PATHS.eventsDir}${relativePath}`,
      async: (t) => file.async(t),
    });
  });
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
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
      '[unpack] globalThis.crypto.subtle is not available — Node 20+ or a modern browser is required for Ed25519 verification.',
    );
  }
  return subtle;
}
