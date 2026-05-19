// unpackFamily() — parse and validate a `.pryzm-family` v1 ZIP.
//
// Spec source: `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §5.1
// (layout) + §5.4 (determinism — the unpacker must accept any byte
// sequence that `packFamily` ever produced).
//
// Failure mode policy mirrors `unpack()` (project format):
// user-recoverable errors return `{ ok: false, reason }`;
// programmer errors throw.

import { trace, SpanStatusCode } from '@opentelemetry/api';
import JSZip from 'jszip';

import { canonicalise } from './canonical-json.js';
import {
  FamilyDocumentSchema,
  FamilyEventSchema,
  FamilyManifestSchema,
  type FamilyDocument,
  type FamilyEvent,
  type FamilyManifest,
} from './family-schema.js';
import {
  FAMILY_PATHS,
  type FamilyIfcBindingExport,
  type FamilyUnpackInput,
  type FamilyUnpackResult,
} from './family-types.js';

const tracer = trace.getTracer('@pryzm/file-format');
const dec = new TextDecoder();
const enc = new TextEncoder();

export async function unpackFamily(input: FamilyUnpackInput): Promise<FamilyUnpackResult> {
  return tracer.startActiveSpan(
    'pryzm.family.persistence.load',
    {
      attributes: {
        'family.byteLength': input.bytes.byteLength,
        'family.verifySchemaHash': Boolean(input.verifySchemaHash),
      },
    },
    async (span): Promise<FamilyUnpackResult> => {
      const t0 = nowMs();
      try {
        let zip: JSZip;
        try {
          zip = await JSZip.loadAsync(input.bytes);
        } catch (err) {
          const message = `[unpackFamily] not a valid ZIP: ${(err as Error).message}`;
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          return { ok: false, reason: 'not-a-zip', message };
        }

        // 1. manifest.json
        const manifestEntry = zip.file(FAMILY_PATHS.manifest);
        if (!manifestEntry) {
          const message = `[unpackFamily] missing required entry ${FAMILY_PATHS.manifest}`;
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          return { ok: false, reason: 'missing-manifest', message };
        }
        const manifestBytes = await manifestEntry.async('uint8array');
        let rawManifest: unknown;
        try {
          rawManifest = JSON.parse(dec.decode(manifestBytes));
        } catch (err) {
          const message = `[unpackFamily] manifest.json is not valid JSON: ${(err as Error).message}`;
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          return { ok: false, reason: 'manifest-parse-error', message };
        }
        const manifestParse = FamilyManifestSchema.safeParse(rawManifest);
        if (!manifestParse.success) {
          const message = `[unpackFamily] manifest failed Zod validation: ${manifestParse.error.message}`;
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          return { ok: false, reason: 'manifest-invalid', message };
        }
        const manifest: FamilyManifest = manifestParse.data;
        // Reject future versions defensively — the loader can only
        // round-trip what it was compiled to know about.
        if (manifest.formatVersion !== '1.0') {
          const message = `[unpackFamily] unsupported future formatVersion ${manifest.formatVersion}`;
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          return { ok: false, reason: 'unsupported-future-version', message };
        }

        // 2. document.json
        const documentEntry = zip.file(FAMILY_PATHS.document);
        if (!documentEntry) {
          const message = `[unpackFamily] missing required entry ${FAMILY_PATHS.document}`;
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          return { ok: false, reason: 'missing-document', message };
        }
        const documentBytes = await documentEntry.async('uint8array');
        const documentText = dec.decode(documentBytes);
        let rawDocument: unknown;
        try {
          rawDocument = JSON.parse(documentText);
        } catch (err) {
          const message = `[unpackFamily] document.json is not valid JSON: ${(err as Error).message}`;
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          return { ok: false, reason: 'document-parse-error', message };
        }
        const documentParse = FamilyDocumentSchema.safeParse(rawDocument);
        if (!documentParse.success) {
          const message = `[unpackFamily] document failed Zod validation: ${documentParse.error.message}`;
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          return { ok: false, reason: 'document-invalid', message };
        }
        const document: FamilyDocument = documentParse.data;

        // 3. ifc-mapping.json — optional in v1 (legacy bytes may omit
        //    it); when present we trust its bindings as authoritative
        //    for downstream consumers but we always re-derive a
        //    canonical projection from `document.parameters` when
        //    computing the schema hash, to stay byte-stable.
        let ifcMapping: FamilyIfcBindingExport;
        const ifcEntry = zip.file(FAMILY_PATHS.ifcMapping);
        if (ifcEntry) {
          const ifcBytes = await ifcEntry.async('uint8array');
          try {
            ifcMapping = JSON.parse(dec.decode(ifcBytes)) as FamilyIfcBindingExport;
          } catch {
            ifcMapping = projectIfcMapping(document);
          }
        } else {
          ifcMapping = projectIfcMapping(document);
        }

        // 4. event-log.ndjson — one canonical FamilyEvent per line.
        const events: FamilyEvent[] = [];
        const eventLogEntry = zip.file(FAMILY_PATHS.eventLog);
        if (eventLogEntry) {
          const eventLogBytes = await eventLogEntry.async('uint8array');
          const text = dec.decode(eventLogBytes);
          let lineIdx = 0;
          for (const line of text.split('\n')) {
            lineIdx++;
            if (line.length === 0) continue;
            try {
              const parsed = JSON.parse(line) as unknown;
              const ev = FamilyEventSchema.safeParse(parsed);
              if (!ev.success) {
                const message = `[unpackFamily] event-log line ${lineIdx} failed Zod: ${ev.error.message}`;
                span.setStatus({ code: SpanStatusCode.ERROR, message });
                return { ok: false, reason: 'event-log-parse-error', message };
              }
              events.push(ev.data);
            } catch (err) {
              const message = `[unpackFamily] event-log line ${lineIdx} not JSON: ${(err as Error).message}`;
              span.setStatus({ code: SpanStatusCode.ERROR, message });
              return { ok: false, reason: 'event-log-parse-error', message };
            }
          }
        }

        // 5. Schema hash — recover from `signing/schema-hash` (canonical
        //    location) or recompute from the document + ifc projection.
        //    When the caller asked us to verify, recompute and compare.
        const schemaHashEntry = zip.file(FAMILY_PATHS.schemaHash);
        let recordedSchemaHash: string | null = null;
        if (schemaHashEntry) {
          const b = await schemaHashEntry.async('uint8array');
          recordedSchemaHash = dec.decode(b).trim();
        }
        const recomputedHash = await sha256Hex(
          enc.encode(canonicalise(document) + canonicalise(projectIfcMapping(document))),
        );
        const recomputedLiteral = `sha256:${recomputedHash}`;
        const schemaHash = recordedSchemaHash ?? recomputedLiteral;

        let schemaHashVerified = false;
        if (input.verifySchemaHash) {
          if (recordedSchemaHash !== null && recordedSchemaHash !== recomputedLiteral) {
            const message = `[unpackFamily] schema-hash mismatch: recorded=${recordedSchemaHash}, recomputed=${recomputedLiteral}`;
            span.setStatus({ code: SpanStatusCode.ERROR, message });
            return { ok: false, reason: 'schema-hash-mismatch', message };
          }
          // Manifest's own schemaHash field is also checked; the writer
          // stamps it from the same recomputation.
          if (manifest.schemaHash !== recomputedLiteral) {
            const message = `[unpackFamily] manifest.schemaHash mismatch: manifest=${manifest.schemaHash}, recomputed=${recomputedLiteral}`;
            span.setStatus({ code: SpanStatusCode.ERROR, message });
            return { ok: false, reason: 'schema-hash-mismatch', message };
          }
          schemaHashVerified = true;
        }

        // 6. Optional binary entries.
        const thumbEntry = zip.file(FAMILY_PATHS.thumbnail);
        const iconEntry = zip.file(FAMILY_PATHS.icon);
        const sigEntry = zip.file(FAMILY_PATHS.signature);
        const thumbnail = thumbEntry ? await thumbEntry.async('uint8array') : undefined;
        const icon = iconEntry ? await iconEntry.async('uint8array') : undefined;
        const signature = sigEntry ? await sigEntry.async('uint8array') : undefined;

        // 7. Optional Ed25519 verification — same convention as the
        //    project `unpack()`: signs the canonical manifest.json bytes,
        //    so we re-load that exact buffer and verify against it.
        let signatureVerified = false;
        if (input.verifyingKey) {
          if (!signature) {
            const message = `[unpackFamily] verifyingKey provided but ${FAMILY_PATHS.signature} is missing.`;
            span.setStatus({ code: SpanStatusCode.ERROR, message });
            return { ok: false, reason: 'signature-required', message };
          }
          try {
            const subtle = getSubtle();
            const ok = await subtle.verify(
              { name: 'Ed25519' },
              input.verifyingKey,
              signature as unknown as ArrayBuffer,
              manifestBytes as unknown as ArrayBuffer,
            );
            if (!ok) {
              const message = '[unpackFamily] Ed25519 signature did not verify against manifest.json bytes.';
              span.setStatus({ code: SpanStatusCode.ERROR, message });
              return { ok: false, reason: 'signature-mismatch', message };
            }
            signatureVerified = true;
          } catch (err) {
            const message = `[unpackFamily] signature verification threw: ${(err as Error).message}`;
            span.setStatus({ code: SpanStatusCode.ERROR, message });
            return { ok: false, reason: 'signature-mismatch', message };
          }
        }

        const unpackDurationMs = nowMs() - t0;
        span.setAttributes({
          'family.id': manifest.id,
          'family.semver': manifest.semver,
          'family.profileCount': document.profiles.length,
          'family.solidCount': document.solids.length,
          'family.parameterCount': document.parameters.length,
          'family.typeCount': document.types.length,
          'family.eventCount': events.length,
          'family.schemaHashVerified': schemaHashVerified,
          'family.signatureVerified': signatureVerified,
          'family.unpackDurationMs': unpackDurationMs,
        });
        span.setStatus({ code: SpanStatusCode.OK });

        return {
          ok: true,
          manifest,
          document,
          events,
          ifcMapping,
          thumbnail,
          icon,
          signature,
          signatureVerified,
          schemaHash,
          telemetry: {
            eventCount: events.length,
            hasThumbnail: Boolean(thumbnail),
            hasIcon: Boolean(icon),
            hasSignature: Boolean(signature),
            schemaHashVerified,
            signatureVerified,
            unpackDurationMs,
          },
        };
      } catch (err) {
        const message = `[unpackFamily] unexpected error: ${(err as Error).message}`;
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        throw err;
      } finally {
        span.end();
      }
    },
  );
}

function projectIfcMapping(document: FamilyDocument): FamilyIfcBindingExport {
  const bindings = [];
  for (const p of document.parameters) {
    if (p.ifcMapping) {
      bindings.push({
        parameterId: p.id,
        parameterName: p.name,
        psetName: p.ifcMapping.psetName,
        propertyName: p.ifcMapping.propertyName,
      });
    }
  }
  bindings.sort((a, b) => (a.parameterId < b.parameterId ? -1 : a.parameterId > b.parameterId ? 1 : 0));
  return { formatVersion: '1.0', bindings };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = getSubtle();
  const buf = await subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  const view = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < view.length; i++) {
    // `noUncheckedIndexedAccess` widens view[i] to `number | undefined`,
    // but `i < view.length` makes it provably defined — non-null assert.
    out += view[i]!.toString(16).padStart(2, '0');
  }
  return out;
}

function getSubtle(): SubtleCrypto {
  if (typeof globalThis.crypto?.subtle !== 'undefined') return globalThis.crypto.subtle;
  throw new Error('[unpackFamily] WebCrypto SubtleCrypto unavailable in this runtime.');
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
