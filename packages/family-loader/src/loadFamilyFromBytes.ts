// loadFamilyFromBytes(bytes) — the BYTES half of the one family loader.
//
// Spec source: `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §19.5 D1.
//
// ⚠ SPLIT OUT OF `loadFamily.ts` (lane U0, 2026-09-02) SO THE BROWSER CAN IMPORT
//   IT. `loadFamily(path)` imports `node:fs/promises` at module scope; the editor's
//   component catalogue (`apps/editor/src/services/componentCatalog/`) consumes
//   ONLY the bytes leg (file-open + marketplace download both hand it bytes), and
//   dragging a Node builtin into the Vite client graph for a function the browser
//   can never call would be pure liability. The split moves CODE, not behaviour:
//   the pipeline below is byte-for-byte the one `loadFamily.ts` shipped with —
//   unpack → cache check → resolver pre-flight → cache — and `loadFamily(path)`
//   still calls THIS function, so there is exactly ONE loader (audit R1).
//
// Pipeline:
//   1. unpackFamily() — Zod-validates manifest+document.
//   2. Cache check — return on hit (keyed `(familyId, schemaHash)`).
//   3. Resolver pre-flight — runs `resolveParameter` against the first
//      family-type to surface invalid defaults eagerly.
//   4. Cache + return.
//
// Failure-mode policy mirrors `unpack()` (project format): structural /
// user-recoverable failures return `{ ok: false, reason }`; programmer
// errors throw.

import { unpackFamily } from '@pryzm/file-format';
import { resolveParameter, type FamilyParameter, type FamilyType } from '@pryzm/family-runtime';

import { defaultFamilyCache } from './cache.js';
import type {
  LoadFamilyOptions,
  LoadFamilyResult,
  LoadedFamily,
  PreflightResult,
} from './types.js';

/** Open a `.pryzm-family` from in-memory bytes.  Used by tests, by the
 *  bake-worker (after fetching from the storage driver), by the AI
 *  worker (after generating a candidate family), and by the editor's
 *  component catalogue (after a file-open or a marketplace download). */
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
