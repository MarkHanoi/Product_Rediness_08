// loadFamily(path) — the DISK half of the one family loader.
//
// Spec source: `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §19.5 D1.
//
// ⚠ `loadFamilyFromBytes` moved to `loadFamilyFromBytes.ts` (lane U0, 2026-09-02)
//   so browser consumers can import the bytes leg without this module's
//   `node:fs/promises` import.  This module is the NODE-ONLY wrapper: read the
//   file, delegate to the ONE bytes pipeline.  No loading logic lives here.

import { readFile } from 'node:fs/promises';
import { trace, SpanStatusCode } from '@opentelemetry/api';

import { loadFamilyFromBytes } from './loadFamilyFromBytes.js';
import type { LoadFamilyOptions, LoadFamilyResult } from './types.js';

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

export { loadFamilyFromBytes } from './loadFamilyFromBytes.js';
