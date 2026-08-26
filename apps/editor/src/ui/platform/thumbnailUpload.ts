/**
 * thumbnailUpload — §FIX-THUMBNAIL-DURABILITY
 *
 * The single client-side writer of the durable preview column
 * (`projects.thumbnail`, via `PATCH /api/projects/:id/thumbnail`).
 *
 * WHY IT IS ITS OWN MODULE
 *   Before this, the only uploader was a PRIVATE method on
 *   PlatformSaveController that returned nothing and reported every failure as
 *   a `console.warn`. Two consequences, both load-bearing for the founder's bug:
 *
 *     • The hub had no way to repair a project whose upload had been lost, so
 *       a single missed PATCH meant the preview was client-cache-only FOREVER —
 *       until `signOut()` deleted that cache.
 *     • "the upload was skipped", "the server refused it as too large" and "the
 *       upload succeeded" were indistinguishable to every caller. That is the
 *       §CONTEXT-DATA-HONESTY rule broken at the write leg, one layer below the
 *       `thumbnail: none` log that broke it at the read leg.
 *
 *   This module returns a discriminated outcome so callers — and the console —
 *   can state WHICH happened. It mirrors the honesty posture of the proven
 *   `server/ifcStorageService.js` executor, which records an explicit
 *   `upload_status` ('complete' vs 'complete_db_fallback') rather than letting
 *   a degraded store look identical to the preferred one.
 */

import { apiFetch } from '@pryzm/core-app-model';
import { THUMBNAIL_MAX_CHARS } from '@pryzm/core-app-model';

export type ThumbnailUploadOutcome =
    /** Stored in the durable per-user column. The preview now survives sign-out. */
    | { readonly ok: true }
    /**
     * Never attempted because the payload cannot fit the server ceiling. This is
     * a CAPTURE defect surfaced at the write leg — `fitThumbnailToBudget` is
     * supposed to make it unreachable, so reaching it means the ladder needs
     * another rung, and the log must say so rather than emitting a 413.
     */
    | { readonly ok: false; readonly kind: 'over-budget'; readonly chars: number }
    /** Not a `data:image/...` URL — a capture-path bug, not a transport one. */
    | { readonly ok: false; readonly kind: 'not-an-image' }
    /**
     * Deliberately skipped: the account's plan gates the endpoint, so the PATCH
     * would 403. Distinct from a failure — nothing is wrong, but the preview is
     * knowingly client-cache-only and WILL be lost on sign-out.
     */
    | { readonly ok: false; readonly kind: 'plan-gated' }
    /** The server answered, and refused. `status` is the HTTP code. */
    | { readonly ok: false; readonly kind: 'rejected'; readonly status: number }
    /** The request never completed (offline, aborted, DNS, ...). Retriable. */
    | { readonly ok: false; readonly kind: 'network'; readonly error: unknown };

/**
 * PATCH a preview into the durable column.
 *
 * Validates against {@link THUMBNAIL_MAX_CHARS} BEFORE the request so an
 * over-budget payload is reported as the capture-side defect it is, instead of
 * burning a round-trip to collect a 413.
 *
 * Never throws — every failure mode is a returned outcome, so a caller that
 * ignores the result degrades exactly as the old fire-and-forget code did,
 * while a caller that inspects it can log or repair.
 */
export async function uploadProjectThumbnail(
    projectId: string,
    dataUrl: string,
    opts: { readonly planGated?: boolean } = {},
): Promise<ThumbnailUploadOutcome> {
    if (opts.planGated === true) return { ok: false, kind: 'plan-gated' };
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
        return { ok: false, kind: 'not-an-image' };
    }
    if (dataUrl.length > THUMBNAIL_MAX_CHARS) {
        return { ok: false, kind: 'over-budget', chars: dataUrl.length };
    }
    try {
        const res = await apiFetch(`/api/projects/${projectId}/thumbnail`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ thumbnail: dataUrl }),
        });
        return res.ok ? { ok: true } : { ok: false, kind: 'rejected', status: res.status };
    } catch (error) {
        return { ok: false, kind: 'network', error };
    }
}

// ── §SUSTAIN109 (L-10405) — the READ leg: fetch ONE project's preview ───────

export type ThumbnailDownloadOutcome =
    /** The bytes, re-encoded as the `data:image/...` URL the local cache stores. */
    | { readonly ok: true; readonly dataUrl: string; readonly bytes: number }
    /** The server answered, and refused (401/403/404 — the preview is gone or not ours). */
    | { readonly ok: false; readonly kind: 'rejected'; readonly status: number }
    /** The body was not an image, or re-encoded past the cache's own ceiling. */
    | { readonly ok: false; readonly kind: 'not-an-image' }
    | { readonly ok: false; readonly kind: 'over-budget'; readonly chars: number }
    /** The request never completed (offline, aborted, DNS, …). Retriable next sync. */
    | { readonly ok: false; readonly kind: 'network'; readonly error: unknown };

/** Base64 without `FileReader` (absent in some test DOMs), chunked to stay under the arg limit. */
function _base64(bytes: Uint8Array): string {
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
    }
    return btoa(binary);
}

/**
 * GET a per-project thumbnail (`/api/v1/projects/:id/thumbnail`) and return it as
 * the data URL the IndexedDB cache stores — the SAME string shape the list used to
 * carry inline, so `seedCachedThumbnail` and the card render need no change.
 *
 * Uses `apiFetch` (bearer auth — an `<img src>` could not carry the token), so the
 * browser's HTTP cache still honours the endpoint's `ETag` / `Cache-Control` on
 * repeat fetches. Never throws — every failure is a returned outcome.
 */
export async function downloadProjectThumbnail(url: string): Promise<ThumbnailDownloadOutcome> {
    try {
        const res = await apiFetch(url, { method: 'GET' });
        if (!res.ok) return { ok: false, kind: 'rejected', status: res.status };
        const contentType = (res.headers?.get?.('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
        if (!contentType.startsWith('image/')) return { ok: false, kind: 'not-an-image' };
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.length === 0) return { ok: false, kind: 'not-an-image' };
        const dataUrl = `data:${contentType};base64,${_base64(buf)}`;
        if (dataUrl.length > THUMBNAIL_MAX_CHARS) return { ok: false, kind: 'over-budget', chars: dataUrl.length };
        return { ok: true, dataUrl, bytes: buf.length };
    } catch (error) {
        return { ok: false, kind: 'network', error };
    }
}

/** Render a download outcome for the console. */
export function describeDownloadOutcome(o: ThumbnailDownloadOutcome): string {
    if (o.ok) return `fetched ${o.bytes} bytes and seeded into the local cache`;
    switch (o.kind) {
        case 'rejected':     return `NOT fetched — server answered HTTP ${o.status}; card keeps its placeholder`;
        case 'not-an-image': return 'NOT fetched — response was not an image (server-side projection defect)';
        case 'over-budget':  return `NOT cached — re-encoded to ${o.chars} chars, above the ${THUMBNAIL_MAX_CHARS}-char ceiling`;
        case 'network':      return `NOT fetched — request did not complete (${String(o.error)}); retried by the next hub sync`;
    }
}

/** Render an outcome for the console — never collapses two causes into one word. */
export function describeUploadOutcome(o: ThumbnailUploadOutcome): string {
    if (o.ok) return 'stored (durable, survives sign-out)';
    switch (o.kind) {
        case 'over-budget':  return `NOT stored — payload ${o.chars} chars exceeds the ${THUMBNAIL_MAX_CHARS}-char server ceiling (capture-side defect)`;
        case 'not-an-image': return 'NOT stored — payload is not a data:image/ URL (capture-side defect)';
        case 'plan-gated':   return 'NOT stored — plan gates the endpoint; preview is client-cache-only and will be lost on sign-out';
        case 'rejected':     return `NOT stored — server refused with HTTP ${o.status}; preview is client-cache-only and will be lost on sign-out`;
        case 'network':      return `NOT stored — request did not complete (${String(o.error)}); will be retried by the next hub sync`;
    }
}
