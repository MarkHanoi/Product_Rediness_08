// loadFamily(path) / loadFamilyFromBytes(bytes).
//
// Spec source: `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §19.5 D1.
//
// Pipeline:
//   1. Read bytes (from disk or caller-supplied buffer).
//   2. unpackFamily() — Zod-validates manifest+document.
//   3. Cache check — return on hit.
//   4. Resolver pre-flight — runs `resolveParameter` against the first
//      family-type to surface invalid defaults eagerly.
//   5. Cache + return.
//
// Failure-mode policy mirrors `unpack()` (project format): structural /
// user-recoverable failures return `{ ok: false, reason }`; programmer
// errors throw.

import { readFile } from 'node:fs/promises';
import { trace, SpanStatusCode } from '@opentelemetry/api';

import { unpackFamily } from '@pryzm/file-format';
import { resolveParameter, type FamilyParameter, type FamilyType } from '@pryzm/family-runtime';

import { defaultFamilyCache } from './cache.js';
import type {
  LoadFamilyOptions,
  LoadFamilyResult,
  LoadedFamily,
  PreflightResult,
} from './types.js';

const tracer = trace.getTracer('@pryzm/family-loader');

/** Open a `.pryzm-family` from disk and return a cached `LoadedFamily`. */
export async function loadFamily(
  path: string,
  opts: LoadFamilyOptions = {},
): Promise<LoadFamilyResult> {
  return tracer.startActiveSpan(
    'pryzm.family.persistence.load',
    { attributes: { 'family.path': path } },
    async (span): Promise<LoadFamilyResult> => {
      try {
        let bytes: Uint8Array;
        try {
          bytes = await readFile(path);
        } catch (err) {
          const message = `[loadFamily] failed to read ${path}: ${(err as Error).message}`;
          span.setStatus({ code: SpanStatusCode.ERROR, message });
          return { ok: false, reason: 'read-failed', message };
        }
        const result = await loadFamilyFromBytes(bytes, {
          ...opts,
          source: opts.source ?? { path },
        });
        if (result.ok) {
          span.setAttributes({
            'family.id': result.family.manifest.id,
            'family.semver': result.family.manifest.semver,
            'family.byteLength': result.family.byteLength,
            'family.cacheHit': result.cacheHit,
          });
          span.setStatus({ code: SpanStatusCode.OK });
        } else {
          span.setStatus({ code: SpanStatusCode.ERROR, message: result.message });
        }
        return result;
      } finally {
        span.end();
      }
    },
  );
}

/** Open a `.pryzm-family` from in-memory bytes.  Used by tests, by the
 *  bake-worker (after fetching from the storage driver), and by the AI
 *  worker (after generating a candidate family). */
export async function loadFamilyFromBytes(
  bytes: Uint8Array,
  opts: LoadFamilyOptions = {},
): Promise<LoadFamilyResult> {
  const cache = opts.cache ?? defaultFamilyCache;
  const verifySchemaHash = opts.verifySchemaHash ?? true;

  const unpacked = await unpackFamily({ bytes, verifySchemaHash });
  if (!unpacked.ok) {
    return {
      ok: false,
      reason: 'unpack-failed',
      message: `[loadFamily] unpack failed: ${unpacked.reason} — ${unpacked.message}`,
    };
  }

  // Cache check — keyed by (id, schemaHash).  We re-use the cached
  // entry verbatim because the manifest+document schema hash is
  // content-derived and therefore safe as an identity proxy.
  const cached = cache.get(unpacked.manifest.id, unpacked.schemaHash);
  if (cached) {
    return { ok: true, family: cached, cacheHit: true };
  }

  // Pre-flight resolve against the FIRST family-type.  Per plan §19.5:
  // editor-time placement uses this signal to surface invalid defaults
  // before the user sees a half-baked instance.
  const preflight = preflightResolve(unpacked.document.parameters, unpacked.document.types[0]);

  const loaded: LoadedFamily = {
    manifest: unpacked.manifest,
    document: unpacked.document,
    events: unpacked.events,
    ifcMapping: unpacked.ifcMapping,
    schemaHash: unpacked.schemaHash,
    preflight,
    source: opts.source ?? 'bytes',
    byteLength: bytes.byteLength,
  };

  if (!preflight.ok) {
    return {
      ok: false,
      reason: 'preflight-failed',
      message: `[loadFamily] resolver pre-flight failed for type ${unpacked.document.types[0]?.id ?? '<none>'} — ${preflight.diagnostics.length} diagnostic(s)`,
    };
  }

  cache.set(loaded);
  return { ok: true, family: loaded, cacheHit: false };
}

function preflightResolve(
  parameters: readonly FamilyParameter[],
  firstType: { readonly id: string; readonly name: string; readonly values: Readonly<Record<string, number | string | boolean>> } | undefined,
): PreflightResult {
  if (!firstType) {
    return { ok: true, diagnostics: [] };
  }
  // The resolver expects `values` to be `Record<string, number|string>`;
  // family-schema permits booleans in the JSON layer.  Coerce booleans
  // to 0/1 for the resolver, which matches family-runtime's `boolean`
  // dataType convention (1 = true, 0 = false).
  const numericValues: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(firstType.values)) {
    numericValues[k] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
  }
  const ftype: FamilyType = {
    id: firstType.id,
    name: firstType.name,
    values: numericValues,
  };
  const out = resolveParameter({
    parameters,
    type: ftype,
    instanceOverrides: {},
  });
  if (out.ok) {
    return { ok: true, diagnostics: out.diagnostics };
  }
  return { ok: false, diagnostics: out.diagnostics };
}
