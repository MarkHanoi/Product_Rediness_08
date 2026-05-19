// packFamily() — serialise a family document into a `.pryzm-family` v1 ZIP.
//
// Spec source: `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §5
// (top-level shape) + §5.4 (determinism contract) + §13 (the
// `family-round-trip` gate this writer feeds).
//
// Layout (per plan §5.1):
//   manifest.json        — FamilyManifestSchema, canonicalised JSON
//   document.json        — FamilyDocumentSchema, canonicalised JSON
//   event-log.ndjson     — one FamilyEvent per line (logical order)
//   ifc-mapping.json     — IfcMapping block (logical sub-set of document
//                          for diff-friendliness; computed from parameters)
//   thumbnail.webp       — optional, opaque bytes
//   icon.svg             — optional, opaque bytes
//   signing/schema-hash  — sha256 of canonical(document) + canonical(ifc-mapping)
//   signing/signature    — optional HMAC bytes
//
// Determinism (plan §5.4):
//   1. JSON canonicalised via `canonicalise()` (RFC 8785 subset).
//   2. ZIP entry order is alphabetical with a frozen mtime — see
//      `zip-deterministic.ts`.
//   3. NDJSON line order matches the input event log.
//
// The `family-round-trip` gate writes the corpus, hashes the bytes,
// re-reads, re-writes, and asserts hash equality.  Any non-determinism
// in this writer fails that gate.
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { canonicalise } from './canonical-json.js';
import { FamilyDocumentSchema, FamilyManifestSchema, } from './family-schema.js';
import { FAMILY_PATHS, } from './family-types.js';
import { writeDeterministicZip } from './zip-deterministic.js';
const tracer = trace.getTracer('@pryzm/file-format');
const enc = new TextEncoder();
/** Pack a family into a deterministic `.pryzm-family` ZIP.
 *
 * Failure mode policy mirrors `pack()` (project format): structural /
 * user-recoverable errors return `{ ok: false, reason }`; programmer
 * errors throw.
 */
export async function packFamily(input) {
    return tracer.startActiveSpan('pryzm.family.persistence.save', {
        attributes: {
            'family.id': input.manifest?.id ?? '',
            'family.semver': input.manifest?.semver ?? '',
            'family.eventCount': input.events?.length ?? 0,
            'family.profileCount': input.document?.profiles?.length ?? 0,
            'family.solidCount': input.document?.solids?.length ?? 0,
            'family.parameterCount': input.document?.parameters?.length ?? 0,
            'family.typeCount': input.document?.types?.length ?? 0,
        },
    }, async (span) => {
        const t0 = nowMs();
        try {
            // 1. Re-validate the manifest defensively — once these bytes
            //    leave this process, every downstream consumer trusts
            //    them.  Same posture as `pack()`.
            const manifestParse = FamilyManifestSchema.safeParse(input.manifest);
            if (!manifestParse.success) {
                const message = `[packFamily] manifest failed Zod validation: ${manifestParse.error.message}`;
                span.setStatus({ code: SpanStatusCode.ERROR, message });
                return { ok: false, reason: 'manifest-invalid', message };
            }
            const documentParse = FamilyDocumentSchema.safeParse(input.document);
            if (!documentParse.success) {
                const message = `[packFamily] document failed Zod validation: ${documentParse.error.message}`;
                span.setStatus({ code: SpanStatusCode.ERROR, message });
                return { ok: false, reason: 'document-invalid', message };
            }
            const manifest = manifestParse.data;
            const document = documentParse.data;
            // 2. Canonicalise document + ifc-mapping FIRST so we can
            //    compute the schema hash and patch it into the manifest
            //    before serialising the manifest itself.
            const ifcBlock = projectIfcMapping(document);
            const documentJson = canonicalise(document);
            const ifcJson = canonicalise(ifcBlock);
            const schemaHash = await sha256Hex(enc.encode(documentJson + ifcJson));
            const schemaHashLiteral = `sha256:${schemaHash}`;
            const stampedManifest = {
                ...manifest,
                schemaHash: schemaHashLiteral,
            };
            const manifestJson = canonicalise(stampedManifest);
            // 3. Event log — one canonical line per event (NDJSON).
            const events = input.events ?? [];
            const eventLog = events.map((e) => canonicalise(e)).join('\n') + (events.length ? '\n' : '');
            const entries = [
                { path: FAMILY_PATHS.manifest, bytes: enc.encode(manifestJson) },
                { path: FAMILY_PATHS.document, bytes: enc.encode(documentJson) },
                { path: FAMILY_PATHS.ifcMapping, bytes: enc.encode(ifcJson) },
                { path: FAMILY_PATHS.eventLog, bytes: enc.encode(eventLog) },
                { path: FAMILY_PATHS.schemaHash, bytes: enc.encode(schemaHashLiteral) },
            ];
            if (input.thumbnail) {
                entries.push({ path: FAMILY_PATHS.thumbnail, bytes: input.thumbnail });
            }
            if (input.icon) {
                entries.push({ path: FAMILY_PATHS.icon, bytes: input.icon });
            }
            // Signing — `signingKey` (Ed25519 private key) takes precedence
            // over a pre-computed `signature` blob.  We sign the canonical
            // `manifest.json` bytes (same convention as project-format
            // `pack()` in `pack.ts`); the schema hash is already stamped
            // into the manifest, so signing the manifest binds the entire
            // document graph through hash chaining.
            let signatureBytes;
            if (input.signingKey) {
                try {
                    const subtle = getSubtle();
                    const sig = await subtle.sign({ name: 'Ed25519' }, input.signingKey, enc.encode(manifestJson));
                    signatureBytes = new Uint8Array(sig);
                }
                catch (err) {
                    const message = `[packFamily] Ed25519 signing failed: ${err.message}`;
                    span.setStatus({ code: SpanStatusCode.ERROR, message });
                    return { ok: false, reason: 'sign-failed', message };
                }
            }
            else if (input.signature) {
                signatureBytes = input.signature;
            }
            if (signatureBytes) {
                entries.push({ path: FAMILY_PATHS.signature, bytes: signatureBytes });
            }
            const bytes = await writeDeterministicZip(entries);
            const packDurationMs = nowMs() - t0;
            span.setAttributes({
                'family.byteLength': bytes.byteLength,
                'family.schemaHash': schemaHashLiteral,
                'family.packDurationMs': packDurationMs,
            });
            span.setStatus({ code: SpanStatusCode.OK });
            return {
                ok: true,
                bytes,
                byteLength: bytes.byteLength,
                schemaHash: schemaHashLiteral,
                telemetry: {
                    eventCount: events.length,
                    hasThumbnail: Boolean(input.thumbnail),
                    hasIcon: Boolean(input.icon),
                    hasSignature: Boolean(signatureBytes),
                    packDurationMs,
                },
            };
        }
        catch (err) {
            const message = `[packFamily] unexpected error: ${err.message}`;
            span.recordException(err);
            span.setStatus({ code: SpanStatusCode.ERROR, message });
            throw err;
        }
        finally {
            span.end();
        }
    });
}
/** Project the IFC binding sub-document from the parameters list.
 *  Kept in its own file inside the ZIP for diff-friendliness per
 *  plan §5.1 — repeating the data also makes it possible to consume
 *  the binding without parsing the whole document. */
function projectIfcMapping(document) {
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
    // Order-stable: sorted by parameterId so the canonical serialisation
    // does not depend on the order parameters were authored in.
    bindings.sort((a, b) => (a.parameterId < b.parameterId ? -1 : a.parameterId > b.parameterId ? 1 : 0));
    return { formatVersion: '1.0', bindings };
}
async function sha256Hex(bytes) {
    const subtle = getSubtle();
    const buf = await subtle.digest('SHA-256', bytes);
    const view = new Uint8Array(buf);
    let out = '';
    for (let i = 0; i < view.length; i++) {
        out += view[i].toString(16).padStart(2, '0');
    }
    return out;
}
function getSubtle() {
    if (typeof globalThis.crypto?.subtle !== 'undefined')
        return globalThis.crypto.subtle;
    throw new Error('[packFamily] WebCrypto SubtleCrypto unavailable in this runtime.');
}
function nowMs() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }
    return Date.now();
}
//# sourceMappingURL=family-pack.js.map