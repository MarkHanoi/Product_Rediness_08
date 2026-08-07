/**
 * thumbnailBudget — §FIX-THUMBNAIL-DURABILITY
 *
 * The ONE place the project-preview payload ceiling is declared, plus the
 * encode ladder that guarantees a captured preview actually FITS it.
 *
 * WHY THIS EXISTS
 *   `PATCH /api/projects/:id/thumbnail` (server.js) rejects any body whose
 *   `thumbnail` string exceeds 65 536 characters with HTTP 413. Until this
 *   module, NOTHING on the capture side knew that number:
 *   `initPersistence.captureThumbnail()` emitted a single
 *   `canvas.toDataURL('image/webp', 0.72)` and handed it straight to the
 *   uploader. The local IndexedDB cache (ThumbnailCacheStore, origin quota in
 *   the hundreds of MB) accepted it happily; the server did not. The upload
 *   leg is fire-and-forget and only `console.warn`s, so the preview looked
 *   correct for the whole session and was then permanently lost the moment the
 *   client cache was cleared — which `signOut()` does deliberately (it deletes
 *   every IndexedDB database whose name contains `pryzm`, including
 *   `pryzm-project-thumbnails`).
 *
 *   The size is NOT hypothetical: `toDataURL` silently falls back to PNG on any
 *   browser whose canvas cannot ENCODE WebP, and a 400x225 PNG of a shaded 3D
 *   view is routinely 150-300 KB of base64 — 3-5x over the ceiling. The
 *   ThumbnailCacheStore header itself records the observed range as
 *   "~5-500 KB WebP data URLs".
 *
 * CONTRACT MAPPING
 *   C05 (Persistence & File Format) — durable project state is SERVER
 *   authoritative; client stores are caches and must be reconstructible from
 *   the server. A preview that only ever exists in a client cache violates
 *   that: a cache purge is lossy.
 *   §CONTEXT-DATA-HONESTY — "could not encode within budget" must never be
 *   returned as the same value as "nothing to capture". `fitThumbnailToBudget`
 *   therefore always reports a `reason` alongside a null result.
 *
 * PURITY
 *   No DOM. The caller injects the encoder, so this module is unit-testable in
 *   a node environment and the Canvas2D dependency stays at the call site.
 */

/**
 * Maximum length, in characters, of a `data:` URL that the server will store.
 *
 * MUST equal the literal in `server.js`'s
 * `app.patch('/api/projects/:id/thumbnail')` handler. `thumbnailBudget.test.ts`
 * reads server.js and asserts the two agree, so drifting one without the other
 * fails CI rather than silently reintroducing the 413.
 */
export const THUMBNAIL_MAX_CHARS = 65_536;

/** One rung of the encode ladder: a quality and a linear scale factor. */
export interface ThumbnailEncodeAttempt {
    /** Encoder quality in [0, 1] — passed through to `canvas.toDataURL`. */
    readonly quality: number;
    /** Linear scale applied to the thumbnail's pixel dimensions. 1 = full size. */
    readonly scale: number;
}

/**
 * Descending ladder tried in order until the encoded payload fits the budget.
 *
 * Quality is spent BEFORE resolution: a slightly softer 400x225 preview reads
 * better on a project card than a crisp 200x112 one. The final rung is
 * deliberately aggressive so that even a PNG fallback (the worst realistic
 * case) lands inside the ceiling rather than being dropped entirely — a
 * degraded preview is strictly better than the pale letter placeholder.
 */
export const THUMBNAIL_ENCODE_LADDER: readonly ThumbnailEncodeAttempt[] = [
    { quality: 0.72, scale: 1 },
    { quality: 0.55, scale: 1 },
    { quality: 0.40, scale: 1 },
    { quality: 0.55, scale: 0.7 },
    { quality: 0.40, scale: 0.5 },
    { quality: 0.30, scale: 0.35 },
];

/** Why `fitThumbnailToBudget` produced no usable data URL. Never conflated. */
export type ThumbnailFitFailure =
    /** The injected encoder returned null/empty for EVERY rung — no pixels to encode. */
    | 'encoder-produced-nothing'
    /** Every rung encoded successfully but all of them exceeded the ceiling. */
    | 'over-budget';

export interface ThumbnailFitResult {
    /** The largest payload that fits `maxChars`, or null when none did. */
    readonly dataUrl: string | null;
    /** Rungs consumed (>= 1 whenever the ladder is non-empty). */
    readonly attempts: number;
    /** Length of `dataUrl`, or of the smallest over-budget candidate seen. */
    readonly chars: number;
    /** The rung that produced `dataUrl`, when one did. */
    readonly accepted?: ThumbnailEncodeAttempt;
    /** Present IFF `dataUrl === null`. §CONTEXT-DATA-HONESTY. */
    readonly reason?: ThumbnailFitFailure;
}

/**
 * Encode down the ladder until the result fits `maxChars`.
 *
 * @param encode Injected encoder. Receives a rung, returns a `data:` URL, or
 *               null/'' when it cannot encode at all (blank frame, no 2D
 *               context, ...). A thrown encoder is treated as a null return for
 *               that rung ONLY — the ladder continues, because a lower rung may
 *               use a different code path (e.g. a smaller intermediate canvas).
 * @param ladder Rungs to try, in order. Defaults to {@link THUMBNAIL_ENCODE_LADDER}.
 * @param maxChars Ceiling. Defaults to {@link THUMBNAIL_MAX_CHARS}.
 */
export function fitThumbnailToBudget(
    encode: (attempt: ThumbnailEncodeAttempt) => string | null | undefined,
    ladder: readonly ThumbnailEncodeAttempt[] = THUMBNAIL_ENCODE_LADDER,
    maxChars: number = THUMBNAIL_MAX_CHARS,
): ThumbnailFitResult {
    let attempts = 0;
    let smallestOverBudget = Number.POSITIVE_INFINITY;
    let anyEncoded = false;

    for (const attempt of ladder) {
        attempts += 1;
        let candidate: string | null | undefined;
        try {
            candidate = encode(attempt);
        } catch {
            candidate = null;
        }
        if (!candidate) continue;
        anyEncoded = true;
        if (candidate.length <= maxChars) {
            return { dataUrl: candidate, attempts, chars: candidate.length, accepted: attempt };
        }
        if (candidate.length < smallestOverBudget) smallestOverBudget = candidate.length;
    }

    return {
        dataUrl: null,
        attempts,
        chars: Number.isFinite(smallestOverBudget) ? smallestOverBudget : 0,
        reason: anyEncoded ? 'over-budget' : 'encoder-produced-nothing',
    };
}
