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
