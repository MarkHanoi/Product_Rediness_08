// deepLink — `?file=…` deep-link parser (S58 §19.7 deliverable #2).
//
// Spec source: PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md §19.7.
// "Open `apps/component-editor` directly … pass a `?file=…` deep
// link" — the SPA boot reads `window.location.search`, hands the raw
// string to this module, and the module returns a typed
// `DeepLinkRequest` describing what to load.  This module does NOT
// fetch — that wiring lands when `@pryzm/family-loader` is wired into
// the SPA boot path (see deferral note in §S58 closure).
//
// Threat model:
//   - The query string is attacker-controlled.  The parser MUST
//     classify the source (`http` / `fixture` / `fs`) so the boot
//     code can apply per-source policy (e.g. `fs` is rejected outside
//     dev mode).
//   - Path-traversal attempts (`..`) and embedded NUL bytes are
//     rejected with `'malicious'`.
//   - Unknown protocols (`file:`, `javascript:`, `data:`) are
//     rejected with `'unsupported-protocol'`.
//
// LAYER — L7 chrome-side. Pure function, no DOM, no `window`.

export type DeepLinkSource = 'http' | 'fixture' | 'fs';

export interface DeepLinkRequest {
  readonly kind: 'file';
  readonly source: DeepLinkSource;
  /** The fully-qualified target.  For `http` this is the URL; for
   *  `fixture` this is the fixture key (`fixture:door-v1`); for `fs`
   *  this is a relative path. */
  readonly target: string;
}

export type DeepLinkRejection =
  | 'no-file-param'
  | 'empty-file-param'
  | 'malicious'
  | 'unsupported-protocol';

export type ParseDeepLinkResult =
  | { readonly ok: true; readonly request: DeepLinkRequest }
  | { readonly ok: false; readonly reason: DeepLinkRejection };

const FORBIDDEN_PROTOCOLS = ['file:', 'javascript:', 'data:', 'blob:', 'vbscript:'] as const;

/**
 * Parse the value of `window.location.search` into a typed deep-link
 * request.  Returns a result discriminated by `ok`.  Empty / missing
 * `?file=` is `{ ok: false, reason: 'no-file-param' }` — the caller
 * treats that as "no deep link, render the default landing".
 */
export function parseDeepLinkRequest(search: string): ParseDeepLinkResult {
  const params = parseQueryString(search);
  const raw = params.get('file');
  if (raw === null) return { ok: false, reason: 'no-file-param' };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty-file-param' };
  if (trimmed.includes('\x00') || trimmed.includes('..')) {
    return { ok: false, reason: 'malicious' };
  }
  for (const proto of FORBIDDEN_PROTOCOLS) {
    if (trimmed.toLowerCase().startsWith(proto)) {
      return { ok: false, reason: 'unsupported-protocol' };
    }
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { ok: true, request: { kind: 'file', source: 'http', target: trimmed } };
  }
  if (trimmed.toLowerCase().startsWith('fixture:')) {
    return {
      ok: true,
      request: { kind: 'file', source: 'fixture', target: trimmed.slice('fixture:'.length) },
    };
  }
  return { ok: true, request: { kind: 'file', source: 'fs', target: trimmed } };
}

function parseQueryString(search: string): URLSearchParams {
  // Tolerate both `?file=…` and `file=…`.  Tolerate empty / undefined.
  if (!search) return new URLSearchParams('');
  const normalised = search.startsWith('?') ? search.slice(1) : search;
  return new URLSearchParams(normalised);
}
